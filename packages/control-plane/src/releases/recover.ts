import { eq, inArray, ne } from 'drizzle-orm'
import { builds, instances, routes, type Db } from '../db/index.js'
import { makeRedactor, publishEvent, type EventBus } from '../observability/index.js'
import { canTransition, nextState, type Driver } from '../runtime/index.js'
import type { TeardownsFinished } from './lifecycle.js'
import type { Retirer } from './retire.js'

export interface RecoveryReport {
  /** Builds this process's predecessor was running when it stopped, now `failed` (R6). */
  buildsInterrupted: number
  /** Route records the edge was given back. */
  routesRestored: number
  /** Ones it could not be — the hostname and the refusal's code, never a message. */
  routesFailed: { hostname: string; reason: string }[]
  /** Instance rows a stopped process left mid-deploy, now `failed`. */
  interrupted: number
  /** Environments a retire pass was asked for. */
  scheduled: string[]
  /** §11's archived projects, their teardown run again (the front-end enablement plan's Task 11). */
  teardowns: TeardownsFinished
  /**
   * Never-launched projects' production names a rehearsal left serving, taken down (the launch path
   * plan's Task 6c; its whole-branch review's I2(a)) — the hostnames, and the ones that could not be.
   */
  rehearsalsTakenDown: { takenDown: string[]; failed: string[] }
}

/** §11's three states a deploy can be interrupted in, straight from the machine. */
const MID_DEPLOY = ['provisioning', 'starting', 'waking'] as const

/**
 * What a control plane does before it serves its first request (P4c Task 9).
 *
 * THREE THINGS THAT HAD NO OWNER. §12 says "the control plane re-applies all
 * routes", and nothing did — `reapplyAllRoutes` existed and had no caller, so an edge
 * restart left every app answering the wildcard until somebody redeployed it. A
 * deploy the process was running when it stopped left its row in `provisioning`, a
 * state nothing moves. And a drain the process was in the middle of left a container
 * running for ever.
 *
 * Before `listen`, deliberately: an app is reachable again before this process
 * accepts the first request that might deploy over it.
 *
 * NOTHING HERE THROWS for one broken app. A boot that failed because one container
 * had been removed by hand would take the whole platform down to report one app's
 * problem, so every failure is a line on stderr with a CODE and a row in the report.
 */
export async function recoverAtBoot(deps: {
  db: Db
  driver: Driver
  retirer: Pick<Retirer, 'schedule'>
  /** Pass 0 publishes each interrupted build's end, as the build would have. */
  bus: EventBus
  /**
   * §11's archived projects, torn down again (the front-end enablement plan's Task 11): `releases/
   * lifecycle.ts`'s `finishTeardowns`, bound to its deps by the boot. REQUIRED, so a boot that
   * forgot it does not compile — an edge restart drops every switched-off page, and without this
   * an archived app's names answer the wildcard until somebody archives it again.
   */
  finishTeardowns: () => Promise<TeardownsFinished>
  /**
   * D21's rehearsals a stopped control plane left serving production, taken down (the launch path
   * plan's Task 6c): `launch/rehearsal.ts`'s `takeDownLeftRehearsals`, bound by the boot. REQUIRED, for
   * `finishTeardowns`' reason — the edge outlives this process, and a restarted edge is given the name
   * back by pass 1, so without it an unapproved candidate serves production's public listener until
   * somebody happens to rehearse or launch again.
   */
  takeDownLeftRehearsals: () => Promise<{ takenDown: string[]; failed: string[] }>
}): Promise<RecoveryReport> {
  /**
   * PASS 0 — THE BUILDS this process's predecessor was running when it stopped (P5a Task
   * 13). A build runs in the background since R6, so a restart leaves its row `running`
   * for ever unless boot ends it — and a client waiting on the stream for that build's
   * end would wait for ever too. Failed, with the reason as its error, and PUBLISHED
   * after the row says so, exactly as `finishBuild` orders it.
   *
   * EVERY `pending` or `running` build, which is only right because ONE control plane
   * runs against a database: a second process booting against the same one fails the
   * first one's builds. The Docker tier's spawned control planes do exactly that — and
   * they truncate the tables too.
   */
  const unfinished = await deps.db
    .select({ id: builds.id, projectId: builds.projectId })
    .from(builds)
    .where(inArray(builds.status, ['pending', 'running']))
  for (const build of unfinished) {
    const reason =
      'BUILD_INTERRUPTED: the control plane stopped while this build was running; start it again'
    await deps.db
      .update(builds)
      .set({ status: 'failed', error: reason })
      .where(eq(builds.id, build.id))
    await publishEvent(
      deps.db,
      deps.bus,
      {
        projectId: build.projectId,
        subject: `build:${build.id}`,
        type: 'build.failed',
        machineDetail: { buildId: build.id, code: 'BUILD_INTERRUPTED', reason },
        humanMessage:
          'A build was interrupted when the platform restarted. Start it again.',
      },
      makeRedactor([]),
    )
  }

  const routesFailed: { hostname: string; reason: string }[] = []
  let routesRestored = 0

  /**
   * PASS 1 — §6's Route records, back on the edge.
   *
   * The driver handle comes off the `instances` row the record names: `restoreRoute`
   * takes what the driver calls the instance, and everything else it needs — the
   * hostname, the port, the instance id — it reads off the container's own labels.
   * A row with no handle names an instance the driver never created.
   */
  const recorded = await deps.db
    .select({ hostname: routes.hostname, handle: instances.handle })
    .from(routes)
    .innerJoin(instances, eq(routes.instanceId, instances.id))

  for (const route of recorded) {
    if (route.handle === null) {
      routesFailed.push({ hostname: route.hostname, reason: 'NO_HANDLE' })
      console.error(
        `[boot] no driver handle for the instance ${route.hostname} is recorded against; it will get a route at its next deploy`,
      )
      continue
    }
    try {
      await deps.driver.restoreRoute(route.handle)
      routesRestored += 1
    } catch (error) {
      const reason = (error as { code?: string }).code ?? (error as Error).name
      routesFailed.push({ hostname: route.hostname, reason })
      // The CODE, never the message: a driver message is third-party text (§14).
      console.error(`[boot] ${route.hostname} could not be routed again: ${reason}`)
    }
  }

  /**
   * PASS 2 — the deploys this process was running when it stopped.
   *
   * `provisioning`, `starting` and `waking` are the three states §11's machine
   * accepts `interrupted` from, and they are all states only a running deploy leaves.
   * `canTransition` is asked anyway rather than trusted from the list: two producers
   * of one rule is how a machine and its callers drift apart.
   */
  const midDeploy = await deps.db
    .select({ id: instances.id, state: instances.state })
    .from(instances)
    .where(inArray(instances.state, [...MID_DEPLOY]))
  let interrupted = 0
  for (const row of midDeploy) {
    if (!canTransition(row.state, 'interrupted')) continue
    await deps.db
      .update(instances)
      .set({ state: nextState(row.state, 'interrupted') })
      .where(eq(instances.id, row.id))
    interrupted += 1
  }

  /**
   * PASS 2½ — §11's ARCHIVED PROJECTS (the front-end enablement plan's Task 11, Decision 28).
   * AFTER pass 1, so the switched-off page is put back once the Route records are — an archive
   * empties its project's records, so pass 1 never routes a switched-off name to a retired
   * instance, and this puts the page on every one of its names again — and after pass 2, so a
   * deploy interrupted on an archived project is already `failed` when its instance is retired.
   * It never throws for one project: each failure is an operator line and a row in the report.
   */
  const teardowns = await deps.finishTeardowns()

  /**
   * PASS 2¾ — A REHEARSAL A STOPPED PROCESS LEFT SERVING (the launch path plan's Task 6c). AFTER pass 1,
   * which may just have given the edge the name back, and after the archived projects', whose names are
   * theirs; BEFORE pass 3, so the retire passes it schedules see the environment as it now is. Never
   * throws for one environment: each failure is an operator line and a hostname in the report.
   */
  const rehearsalsTakenDown = await deps.takeDownLeftRehearsals()

  /**
   * PASS 3 — AND IT RUNS LAST, WHICH IS LOAD-BEARING (Decision 20, and sitting 5's
   * correction to it).
   *
   * `retireEnvironment` does nothing at all when `servingInstance` answers
   * `undefined`, because after an edge restart every instance reads as non-serving
   * and R7 would then remove the app people are using. Before pass 1 has run, that is
   * the state of EVERY environment — so scheduling first would not merely reorder the
   * work: every pass would return `skipped: 'nothing-serves'`, nothing would ever be
   * reaped, and nothing anywhere would report a failure.
   *
   * Scheduled for every environment that still has an instance row worth looking at.
   * An environment whose rows are all `gone` has nothing to remove, and asking for a
   * pass over it would report a retire that is not pending.
   */
  const live = await deps.db
    .selectDistinct({ environmentId: instances.environmentId })
    .from(instances)
    .where(ne(instances.state, 'gone'))
  const scheduled = live.map((row) => row.environmentId)
  for (const environmentId of scheduled) deps.retirer.schedule(environmentId)

  return {
    buildsInterrupted: unfinished.length,
    routesRestored,
    routesFailed,
    interrupted,
    scheduled,
    teardowns,
    rehearsalsTakenDown,
  }
}
