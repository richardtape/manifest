import { and, asc, desc, eq, inArray, lt, sql } from 'drizzle-orm'
import type { Config } from '../config.js'
import {
  environments,
  incidents,
  instances,
  loadRehearsals,
  projects,
  tryWithRehearsalLock,
  withEnvironmentLock,
  type Db,
} from '../db/index.js'
import { makeRedactor, publishEvent } from '../observability/index.js'
import { personName, type StoredAudience } from '../projects/index.js'
import {
  deployReleaseSet,
  shapeFor,
  type DeployDeps,
  type ResolvedConfigSet,
} from '../releases/index.js'
import { DriverRefusalError, type Driver } from '../runtime/index.js'
import { candidateFor } from './candidate.js'
import {
  LoadRehearsalError,
  judge,
  loadPathsFor,
  phasesFor,
  type LoadGenerator,
  type LoadPhase,
  type LoadReport,
  type LoadTarget,
  type Watched,
} from './load.js'
import { RehearsalError } from './rehearsal.js'

/**
 * §24'S LOAD REHEARSAL, RUN (the load rehearsal plan's Task 4; Decisions 2, 3, 6–9, 12 and 13): staging given
 * production's capacity for the app's audience, the audience's arrival put on it THROUGH THE EDGE, the app watched and
 * judged against a stated pass mark, what it measured recorded — and staging given back its own shape.
 *
 * Its caller is `POST /v1/projects/{projectId}/load-rehearsal` (Task 5); until then a scratch script. The generator is
 * `load.ts`'s; this module is everything the control plane does around it.
 */

export type LoadRehearsalRow = typeof loadRehearsals.$inferSelect
type Evidence = NonNullable<LoadRehearsalRow['evidence']>
type Environment = typeof environments.$inferSelect

export interface LoadRehearsalDeps {
  db: Db
  driver: Driver
  config: Config
  /** Everything `deployReleaseSet` needs, for the grant and the take-down — the deploy route's own object. */
  deploy: DeployDeps
  /** vegeta's container, through the engine seam (`createLoadGenerator`), bound at boot. */
  generator: LoadGenerator
  /** How often each granted member's status is read while the load runs — every 5 s (Decision 8); a test's own. */
  watchIntervalMs?: number
}

/** What taking a run down needs — the boot's pass 2⅞ has no actor and no run, only rows. */
export type LoadTakeDownDeps = Pick<
  LoadRehearsalDeps,
  'db' | 'driver' | 'config' | 'deploy' | 'generator'
>

const WATCH_INTERVAL_MS = 5_000

/**
 * RUNS THE LOAD REHEARSAL OF A PROJECT — answering AT ONCE with the `running` row, and the run's own end as `done`
 * (Decision 7: a run takes up to ~10 minutes, and no Node client waits that long for headers). Refused, with nothing
 * written, before anything moves:
 *
 * - a `solo` or `class` app → `LOAD_REHEARSAL_NOT_NEEDED` (§24 gives neither a load gate);
 * - nothing serving staging → `REHEARSAL_NO_CANDIDATE` (the candidate IS what serves staging);
 * - D21's rehearsal of this project under way — it holds the project's rehearsal lock → `REHEARSAL_RUNNING`;
 * - another run anywhere on the platform → `LOAD_REHEARSAL_BUSY`, or this project's own → `LOAD_REHEARSAL_RUNNING`,
 *   decided by the conflict on `load_rehearsals`' one-running index, never by a read before the insert (Decision 6).
 *
 * **THE ROW IS WRITTEN `running` FIRST**, before the grant (Decision 9), so a boot finds what a stopped process left.
 * `done` never rejects for the run's own failures — each is recorded on the row and in one operator line.
 */
export async function runLoadRehearsal(
  deps: LoadRehearsalDeps,
  input: { projectId: string; actor: { id: string } },
): Promise<{ row: LoadRehearsalRow; done: Promise<LoadRehearsalRow> }> {
  const { db } = deps
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, input.projectId))
  // A programming fault, not a wire refusal: the route asks `assertCapability` first, which answers `404` (`rehearse`'s rule).
  if (project === undefined) throw new Error(`no project '${input.projectId}'`)
  const audience = project.audience as StoredAudience | null
  if (audience === null)
    throw new LoadRehearsalError(
      'LOAD_REHEARSAL_NOT_NEEDED',
      'no audience is recorded for this app, so there is no arrival to rehearse and nothing was started',
    )
  const settings = deps.config.loadRehearsal
  const phases = phasesFor(audience, settings)

  const [staging] = await db
    .select()
    .from(environments)
    .where(
      and(eq(environments.projectId, input.projectId), eq(environments.kind, 'staging')),
    )
  if (staging === undefined)
    throw new Error(`project '${input.projectId}' has no staging environment`)

  // THE CANDIDATE IS READ, AND THE ROW WRITTEN, UNDER STAGING'S LOCK (inside the rehearsal lock — the sanctioned order:
  // nothing takes them the other way round). A staging deploy already holding it finishes first, and the run rehearses
  // what that deploy left serving; one that comes after finds the `running` row and is refused. Read before the lock, a
  // deploy under way was answered 200 and then undone — the grant and the take-down both deployed the release it
  // replaced (the whole-branch review's I2). The `202` waits at most that one deploy.
  const started = await tryWithRehearsalLock(input.projectId, () =>
    withEnvironmentLock(staging.id, async () => {
      const candidate = await candidateFor(db, input.projectId)
      if (candidate === undefined)
        throw new RehearsalError(
          'REHEARSAL_NO_CANDIDATE',
          'nothing is serving in staging, so there is no release to put the audience’s arrival on. The load ' +
            'rehearsal runs the release staging serves; deploy one there first.',
        )
      const resolved = candidate.release.resolvedConfig as ResolvedConfigSet
      const target: LoadTarget = {
        origin: `https://${staging.hostname}`,
        paths: loadPathsFor(resolved.staging),
        timeoutMs: settings.requestTimeoutMs,
      }
      const row = await insertRunning(db, {
        projectId: input.projectId,
        environmentId: staging.id,
        releaseId: candidate.release.id,
        imageDigest: candidate.build.imageDigest ?? '',
        scale: audience.scale as 'large_course' | 'public',
        burst: audience.burst,
        profile: {
          phases,
          paths: target.paths,
          timeoutMs: target.timeoutMs,
          pass: settings.pass,
        },
        runBy: input.actor.id,
      })
      return { row, resolved, target }
    }),
  )
  if (started === undefined)
    throw new RehearsalError(
      'REHEARSAL_RUNNING',
      'the pre-production rehearsal of this app is running, so the load rehearsal was not started and nothing ' +
        'was deployed. Run it again once that one has finished.',
    )
  const { row, resolved, target } = started

  const done = run(deps, { row, staging, audience, phases, target, resolved }).catch(
    (error: unknown) => {
      // Only the row's own last write can land here (the run records every other failure): say so, and rethrow.
      console.error(
        `[load-rehearsal] ${row.id} of ${staging.hostname} could not be recorded at its end: ${codeOf(error)}`,
      )
      throw error
    },
  )
  // Handled here so a caller that has not awaited it yet cannot crash the process; `done` still rejects for whoever awaits it.
  done.catch(() => undefined)
  return { row, done }
}

/**
 * THE RUNS THE CONTROL PLANE HAS UNDER WAY (the load rehearsal plan's Task 5): what `runLoadRehearsal`'s route starts a run
 * through — the generator bound at boot, which the boot's pass 2⅞ reads too — and every run's end kept, so `idle()` waits
 * for each (a test's reset drains them, as it drains builds and retires). A run's own failures are recorded on its row,
 * so `idle()` never rejects.
 */
export interface LoadRehearsalRuns {
  generator: LoadGenerator
  start(
    deps: Omit<LoadRehearsalDeps, 'generator' | 'watchIntervalMs'>,
    input: { projectId: string; actor: { id: string } },
  ): Promise<LoadRehearsalRow>
  idle(): Promise<void>
}

export function createLoadRehearsalRuns(opts: {
  generator: LoadGenerator
  /** Every 5 s (Decision 8) unless a test reads faster. */
  watchIntervalMs?: number
}): LoadRehearsalRuns {
  const underWay = new Set<Promise<unknown>>()
  return {
    generator: opts.generator,
    async start(deps, input) {
      const { row, done } = await runLoadRehearsal(
        {
          ...deps,
          generator: opts.generator,
          ...(opts.watchIntervalMs === undefined
            ? {}
            : { watchIntervalMs: opts.watchIntervalMs }),
        },
        input,
      )
      // `done` already carries its operator line and a handler (`runLoadRehearsal`); kept here only to be waited for.
      const settled = done.then(
        () => undefined,
        () => undefined,
      )
      underWay.add(settled)
      void settled.then(() => underWay.delete(settled))
      return row
    },
    async idle() {
      while (underWay.size > 0) await Promise.all([...underWay])
    },
  }
}

/**
 * THE INSERT IS THE CHECK (Decision 6): the one-running index refuses a second `running` row anywhere, and the row it
 * conflicted with says whose run it is. Read AFTER the conflict, never before the insert — so two asks at once cannot
 * both pass a read and both insert. If the holder ended between the conflict and the read, the insert is tried again.
 */
async function insertRunning(
  db: Db,
  values: typeof loadRehearsals.$inferInsert,
): Promise<LoadRehearsalRow> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    // No `target`: the only unique constraints are the primary key, over a random default, and the one-running index.
    const [inserted] = await db
      .insert(loadRehearsals)
      .values(values)
      .onConflictDoNothing()
      .returning()
    if (inserted !== undefined) return inserted
    const [holder] = await db
      .select({ projectId: loadRehearsals.projectId })
      .from(loadRehearsals)
      .where(eq(loadRehearsals.state, 'running'))
    if (holder === undefined) continue
    if (holder.projectId === values.projectId)
      throw new LoadRehearsalError(
        'LOAD_REHEARSAL_RUNNING',
        'a load rehearsal of this app is already running, so this one was not started and nothing was ' +
          'deployed. A run takes up to about ten minutes; its record then says how it went.',
      )
    throw new LoadRehearsalError(
      'LOAD_REHEARSAL_BUSY',
      'another app’s load rehearsal is running, and the platform runs one at a time so that two cannot measure ' +
        'each other — this one was not started and nothing was deployed. Try again in about ten minutes.',
    )
  }
  throw new Error(
    'a load rehearsal could not be recorded: the one-running index kept conflicting with no running row',
  )
}

interface RunContext {
  row: LoadRehearsalRow
  staging: Environment
  audience: StoredAudience
  phases: LoadPhase[]
  target: LoadTarget
  resolved: ResolvedConfigSet
}

/**
 * GRANT, READ BACK, LOAD, WATCH, JUDGE, RECORD — AND TAKE DOWN, whatever happened before it (Decisions 2, 5, 8, 9).
 *
 * 1. **The grant** — the candidate redeployed to staging in `shapeFor`'s `'load-rehearsal'` shape: production's count
 *    for the audience, at production's resources. A redeploy is a new set beside the one serving, so staging never
 *    goes dark.
 * 2. **Read back** — a deploy whose member is not healthy is ANSWERED (every member `failed`, the previous set
 *    restored, one Incident), so the run proceeds only when the edge serves EXACTLY the set it started, `shapeFor`'s
 *    count, every member healthy. Otherwise it ends `failed` with the Incident's line, and nothing is exempted or
 *    loaded: what serves is staging's own instance, and a measurement of it would meet the item for a shape that
 *    never ran. `granted` is written from this read, never from the intent.
 * 3. **The generator** started and waiting — its own address on the platform network.
 * 4. **The exemption** for that one address, under staging's environment lock (an archive takes it too).
 * 5. **The load**, watched: each member's status every 5 s; a set that goes away stops the generator.
 * 6. **The exemption cleared AT ONCE once the generator's container is gone** — Docker hands its address to the next
 *    container on the network straight away (B sitting 2, F1), so an exemption left behind exempts a stranger.
 * 7. **Judged** (`judge`), then **staging given back its own shape** (`giveStagingBack`) — and only THEN the row's end:
 *    `passed` is written only once staging is back; a run whose take-down failed ends `teardown_failed`, its
 *    judgement kept, and never meets the item.
 */
async function run(deps: LoadRehearsalDeps, ctx: RunContext): Promise<LoadRehearsalRow> {
  const { db, driver } = deps
  const { row, staging, audience, phases, target } = ctx
  const hostname = staging.hostname
  let outcome: { state: 'passed' | 'failed'; evidence: Evidence }
  let generatorSettled = true
  let exempted = false

  const clearExemption = async (): Promise<void> => {
    await clearExemptionOf(driver, staging)
    exempted = false
  }

  try {
    // 1. THE GRANT.
    const grant = await deployReleaseSet(db, driver, deps.config, deps.deploy, {
      releaseId: row.releaseId,
      environmentId: staging.id,
      purpose: 'load-rehearsal',
      loadRehearsalId: row.id,
    })

    // 2. READ BACK — what the edge serves, against exactly what the grant started.
    const want = shapeFor('staging', 'load-rehearsal', audience)
    const serving = await driver.servingInstances(hostname)
    const handles = grant.instances.flatMap((member) =>
      member.handle === null ? [] : [member.handle],
    )
    const exact =
      grant.instances.length === want.instances &&
      grant.instances.every((member) => member.state === 'healthy') &&
      handles.length === want.instances &&
      serving.length === want.instances &&
      handles.every((handle) => serving.includes(handle))
    const servingRows =
      serving.length === 0
        ? []
        : await db
            .select({ id: instances.id })
            .from(instances)
            .where(
              and(
                eq(instances.environmentId, staging.id),
                inArray(instances.handle, serving),
              ),
            )
            .orderBy(asc(instances.createdAt), asc(instances.id))
    const resources = ctx.resolved[want.resources].resources
    await db
      .update(loadRehearsals)
      .set({
        granted: {
          count: serving.length,
          instanceIds: servingRows.map((member) => member.id),
          resources: { environment: want.resources, ...resources },
        },
      })
      .where(eq(loadRehearsals.id, row.id))

    if (!exact) {
      const line = await incidentLine(db, grant.answer.id)
      outcome = {
        state: 'failed',
        evidence: {
          reason:
            `production's shape could not start on staging${line === undefined ? '' : `: ${line}`} — nothing ` +
            'was loaded, so nothing was measured',
        },
      }
    } else {
      // 3. THE GENERATOR, STARTED AND WAITING.
      const generator = await deps.generator.start(target, phases, {
        loadRehearsalId: row.id,
      })
      generatorSettled = false
      // Registered before anything awaits `done`, so it runs first: by the time an `await` of it continues, this is set.
      const settled = (): void => {
        generatorSettled = true
      }
      generator.done.then(settled, settled)
      await db
        .update(loadRehearsals)
        .set({ generatorAddress: generator.address })
        .where(eq(loadRehearsals.id, row.id))

      // 4. THE EXEMPTION, for that one address.
      await withEnvironmentLock(staging.id, () =>
        driver.setRateLimitExemption(hostname, generator.address),
      )
      exempted = true

      // 5. THE LOAD, WATCHED.
      const watch = watchSet(
        driver,
        hostname,
        handles,
        deps.watchIntervalMs ?? WATCH_INTERVAL_MS,
        () => deps.generator.removeLeft(row.id),
      )
      let report: LoadReport | undefined
      let loadError: unknown
      let watched: Awaited<ReturnType<typeof watch.stop>>
      try {
        try {
          await generator.go()
          report = await generator.done
        } catch (error) {
          loadError = error
        }
        // 6. CLEARED AT ONCE: `done` settles only once its container is gone, so the exemption goes now — and a
        // `go()` that failed leaves a container waiting, removed straight after its exemption.
        await clearExemption()
        if (!generatorSettled) await deps.generator.removeLeft(row.id)
      } finally {
        // Stopped whatever happened above: a watch nobody stops reads the set for the life of the process.
        watched = await watch.stop()
      }

      if (watched.setGone)
        outcome = {
          state: 'failed',
          evidence: {
            reason:
              'what served staging went away while the load ran, so the generator was stopped and nothing was judged',
            ...watchedEvidence(watched),
          },
        }
      else if (report === undefined)
        outcome = {
          state: 'failed',
          evidence: {
            reason: `the load could not be measured: ${messageOf(loadError)}`,
            ...watchedEvidence(watched),
          },
        }
      else {
        // 7. JUDGED.
        const verdict = judge(report, watched, phases, deps.config.loadRehearsal.pass)
        outcome = {
          state: verdict.passed ? 'passed' : 'failed',
          evidence: {
            reason: verdict.reason,
            ...measurementOf(report),
            ...watchedEvidence(watched),
          },
        }
      }
    }
  } catch (error) {
    console.error(
      `[load-rehearsal] ${row.id} of ${hostname} stopped before it was judged: ${codeOf(error)}`,
    )
    outcome = {
      state: 'failed',
      evidence: {
        reason: `the load rehearsal stopped before it was judged: ${messageOf(error)}`,
      },
    }
  }

  // WHATEVER HAPPENED: the exemption cleared, and the generator gone — the exemption first (step 6's reason).
  if (exempted)
    await clearExemption().catch((error: unknown) =>
      console.error(
        `[load-rehearsal] ${row.id}: the exemption on ${hostname} could not be cleared: ${codeOf(error)}`,
      ),
    )
  if (!generatorSettled)
    await deps.generator
      .removeLeft(row.id)
      .catch((error: unknown) =>
        console.error(
          `[load-rehearsal] ${row.id}: its generator could not be removed: ${codeOf(error)}`,
        ),
      )

  // 7. STAGING GIVEN BACK ITS OWN SHAPE — and only then the row's end.
  const back = await giveStagingBack(deps, row, staging)
  if (back.outcome === 'archived')
    return finish(deps, row.id, 'abandoned', {
      ...outcome.evidence,
      reason:
        'the app was switched off while its load rehearsal ran, so staging was the archive’s to take down and ' +
        `nothing more was done — ${outcome.evidence.reason}`,
    })
  if (back.outcome === 'not-given-back') {
    console.error(
      `[load-rehearsal] ${row.id}: staging of ${hostname} was not given back its own shape`,
    )
    return finish(deps, row.id, 'teardown_failed', {
      ...outcome.evidence,
      reason: `${back.reason}. The run itself: ${outcome.evidence.reason}`,
      judged: { passed: outcome.state === 'passed', reason: outcome.evidence.reason },
    })
  }
  return finish(deps, row.id, outcome.state, outcome.evidence)
}

/**
 * The row's end, written ONCE: only a row still `running` is ended (the boot may have ended it first) — and the one place
 * `load_rehearsal.completed` is published (Decision 11), for the run and the boot alike, by whichever ended the row.
 */
async function finish(
  deps: Pick<LoadRehearsalDeps, 'db' | 'deploy'>,
  id: string,
  state: Exclude<LoadRehearsalRow['state'], 'running'>,
  evidence: Evidence,
): Promise<LoadRehearsalRow> {
  const { db } = deps
  const [ended] = await db
    .update(loadRehearsals)
    .set({
      state,
      evidence,
      finishedAt: sql`now()`,
      takenDownAt: state === 'teardown_failed' ? null : sql`now()`,
    })
    .where(and(eq(loadRehearsals.id, id), eq(loadRehearsals.state, 'running')))
    .returning()
  if (ended !== undefined) {
    await announce(deps, ended)
    return ended
  }
  const [current] = await db
    .select()
    .from(loadRehearsals)
    .where(eq(loadRehearsals.id, id))
  if (current === undefined)
    throw new Error(`load rehearsal '${id}' vanished before it could be recorded`)
  return current
}

/**
 * `load_rehearsal.completed` (Decision 11): the numbers a person acts on and the reason, its sentence naming who ran it
 * and how it ended. Published inside the request that started the run when the run ends it — so an administrator's
 * reason (§26) is on it — and with no actor when the boot does. The row is already ended: a publish that fails is an
 * operator line, never the run's failure.
 */
async function announce(
  deps: Pick<LoadRehearsalDeps, 'db' | 'deploy'>,
  ended: LoadRehearsalRow,
): Promise<void> {
  const { db } = deps
  try {
    const evidence = ended.evidence ?? { reason: 'no reason was recorded' }
    const ranBy = ended.runBy === null ? 'Someone' : await personName(db, ended.runBy)
    const state = ended.state as Exclude<LoadRehearsalRow['state'], 'running'>
    const humanMessage = {
      passed: `${ranBy} ran the load rehearsal and it passed: ${evidence.reason}.`,
      failed: `${ranBy} ran the load rehearsal and it did not pass: ${evidence.reason}.`,
      teardown_failed: `${ranBy} ran the load rehearsal, and staging could not be given back its own shape afterwards, so it does not count: ${evidence.reason}.`,
      abandoned: `The load rehearsal ${ranBy} ran was not finished: ${evidence.reason}.`,
    }[state]
    await publishEvent(
      db,
      deps.deploy.bus,
      {
        projectId: ended.projectId,
        subject: `load-rehearsal:${ended.id}`,
        type: 'load_rehearsal.completed',
        machineDetail: {
          loadRehearsalId: ended.id,
          releaseId: ended.releaseId,
          state,
          p95Ms: evidence.p95Ms ?? null,
          answeredRatio: evidence.answeredRatio ?? null,
          reason: evidence.reason,
        },
        humanMessage,
      },
      makeRedactor([]),
    )
  } catch (error) {
    console.error(
      `[load-rehearsal] ${ended.id} ended '${ended.state}', but its load_rehearsal.completed could not be published: ${codeOf(error)}`,
    )
  }
}

/**
 * STAGING GIVEN BACK ITS OWN SHAPE (Decision 2): the candidate redeployed in staging's own row of `shapeFor` — one
 * instance, staging's resources — and read back the same way the grant was. A redeploy builds a plain route, so it
 * clears any exemption too.
 *
 * - **An archived project is the archive's**: it retired staging and switched its name off; nothing is redeployed.
 * - **Nothing to give back** when what serves staging is ONE healthy instance this run did not start — a grant that
 *   was answered `failed` restored it, and redeploying the same release again would only repeat what the grant could
 *   not do (a secret it lacks, say) and read as a failed take-down.
 * - **A take-down that is answered `failed`, or throws, leaves the granted set serving** — `not-given-back`.
 */
async function giveStagingBack(
  deps: LoadTakeDownDeps,
  row: Pick<LoadRehearsalRow, 'id' | 'releaseId' | 'createdAt'>,
  staging: Environment,
): Promise<
  { outcome: 'given-back' | 'archived' } | { outcome: 'not-given-back'; reason: string }
> {
  const { db, driver } = deps
  try {
    const [project] = await db
      .select({ state: projects.state })
      .from(projects)
      .where(eq(projects.id, staging.projectId))
    if (project?.state !== 'active') return { outcome: 'archived' }

    const serving = await driver.servingInstances(staging.hostname)
    if (serving.length === 1) {
      const [only] = await db
        .select({ state: instances.state })
        .from(instances)
        .where(
          and(
            eq(instances.environmentId, staging.id),
            eq(instances.handle, serving[0]!),
            lt(instances.createdAt, row.createdAt),
          ),
        )
      if (only?.state === 'healthy') return { outcome: 'given-back' }
    }

    const back = await deployReleaseSet(db, driver, deps.config, deps.deploy, {
      releaseId: row.releaseId,
      environmentId: staging.id,
      loadRehearsalId: row.id,
    })
    const after = await driver.servingInstances(staging.hostname)
    const member = back.instances[0]
    if (
      back.instances.length === 1 &&
      member?.state === 'healthy' &&
      member.handle !== null &&
      after.length === 1 &&
      after[0] === member.handle
    )
      return { outcome: 'given-back' }
    const line = await incidentLine(db, back.answer.id)
    return {
      outcome: 'not-given-back',
      reason:
        `staging could not be given back its own shape${line === undefined ? '' : `: ${line}`} — what the ` +
        `rehearsal granted may still serve it (${after.length} instance(s)); the next deploy to staging gives it back`,
    }
  } catch (error) {
    console.error(
      `[load-rehearsal] ${row.id}: staging of ${staging.hostname} could not be given back: ${codeOf(error)}`,
    )
    return {
      outcome: 'not-given-back',
      reason:
        `staging could not be given back its own shape: ${messageOf(error)} — what the rehearsal granted may ` +
        'still serve it; the next deploy to staging gives it back',
    }
  }
}

/**
 * THE BOOT'S PASS 2⅞ (Decision 13; A1's Decision 7 places it after D21's 2¾ and before the retirer's 3): every row a
 * stopped process left `running`. For each — its generator removed by its label; the exemption cleared (a name with no
 * route answers `INSTANCE_NOT_FOUND`, which is nothing to clear); staging given back its own shape and read back — none
 * of that for an archived project, whose pass 2½ has already retired staging and switched its name off; the row
 * `abandoned`, with one operator line. A step that fails ends the row `teardown_failed`, its line naming the step.
 * NEVER THROWS FOR ONE ROW, so one stuck run does not stop the boot.
 */
export async function takeDownLeftLoadRehearsals(
  deps: LoadTakeDownDeps,
): Promise<{ abandoned: string[]; failed: string[] }> {
  const left = await deps.db
    .select({ row: loadRehearsals, staging: environments, projectState: projects.state })
    .from(loadRehearsals)
    .innerJoin(environments, eq(loadRehearsals.environmentId, environments.id))
    .innerJoin(projects, eq(loadRehearsals.projectId, projects.id))
    .where(eq(loadRehearsals.state, 'running'))
  const abandoned: string[] = []
  const failed: string[] = []
  for (const { row, staging, projectState } of left) {
    let step: 'generator' | 'exemption' | 'take-down' = 'generator'
    try {
      await deps.generator.removeLeft(row.id)
      if (projectState === 'active') {
        step = 'exemption'
        await clearExemptionOf(deps.driver, staging)
        step = 'take-down'
        const back = await giveStagingBack(deps, row, staging)
        if (back.outcome === 'not-given-back') throw new Error(back.reason)
      }
      await finish(deps, row.id, 'abandoned', {
        reason:
          'the control plane stopped while this load rehearsal ran, so nothing was judged; at its next start the ' +
          'generator was removed and staging given back its own shape',
      })
      console.error(
        `[boot] load rehearsal ${row.id} of ${staging.hostname} was left running: abandoned, staging given back`,
      )
      abandoned.push(row.id)
    } catch (error) {
      console.error(
        `[boot] load rehearsal ${row.id} of ${staging.hostname} could not be taken down (${step}): ${codeOf(error)}`,
      )
      await finish(deps, row.id, 'teardown_failed', {
        reason:
          `the control plane stopped while this load rehearsal ran, and at its next start the ${step} step of ` +
          'taking it down failed — what it granted may still serve staging; the next deploy to staging gives it back',
      }).catch((recordError: unknown) =>
        console.error(
          `[boot] load rehearsal ${row.id} could not be recorded: ${codeOf(recordError)}`,
        ),
      )
      failed.push(row.id)
    }
  }
  return { abandoned, failed }
}

/**
 * NO ADDRESS PAST STAGING'S RATE LIMIT ANY MORE, under its environment lock (Decision 5). A name with no route has no
 * exemption to clear (`INSTANCE_NOT_FOUND`), and a switched-off name keeps its page.
 */
async function clearExemptionOf(driver: Driver, staging: Environment): Promise<void> {
  await withEnvironmentLock(staging.id, () =>
    driver.setRateLimitExemption(staging.hostname, null),
  ).catch((error: unknown) => {
    if (!(error instanceof DriverRefusalError && error.code === 'INSTANCE_NOT_FOUND'))
      throw error
  })
}

/** The newest load rehearsal of a project, or `undefined` when nobody has run one. */
export async function latestLoadRehearsalFor(
  db: Db,
  projectId: string,
): Promise<LoadRehearsalRow | undefined> {
  const [row] = await db
    .select()
    .from(loadRehearsals)
    .where(eq(loadRehearsals.projectId, projectId))
    .orderBy(desc(loadRehearsals.createdAt), desc(loadRehearsals.id))
    .limit(1)
  return row
}

/** A project's load rehearsals, the newest first, at most `limit` (`listLoadRehearsals`). */
export async function loadRehearsalsOf(
  db: Db,
  projectId: string,
  limit = 20,
): Promise<LoadRehearsalRow[]> {
  return db
    .select()
    .from(loadRehearsals)
    .where(eq(loadRehearsals.projectId, projectId))
    .orderBy(desc(loadRehearsals.createdAt), desc(loadRehearsals.id))
    .limit(limit)
}

/** One load rehearsal of a project — `undefined` for an id that is not that project's. */
export async function loadRehearsalById(
  db: Db,
  projectId: string,
  id: string,
): Promise<LoadRehearsalRow | undefined> {
  const [row] = await db
    .select()
    .from(loadRehearsals)
    .where(and(eq(loadRehearsals.id, id), eq(loadRehearsals.projectId, projectId)))
  return row
}

/**
 * THE GRANTED SET, WATCHED WHILE THE LOAD RUNS (Decision 8): each member's status read through the driver every
 * `intervalMs`, and once more when the load ends. A member that exited (or is gone), ran out of memory, or ran
 * unhealthy is counted; a set the edge no longer serves at all — an archive switched the name off — stops the
 * generator rather than load a switched-off page for minutes. A read that fails is an operator line, never a verdict on
 * the app. Its timer never holds the process open.
 */
function watchSet(
  driver: Driver,
  hostname: string,
  handles: string[],
  intervalMs: number,
  onGone: () => Promise<unknown>,
): { stop(): Promise<Watched & { setGone: boolean }> } {
  const exited = new Set<string>()
  const unhealthy = new Set<string>()
  let outOfMemory = false
  let setGone = false
  let stopped = false
  let timer: NodeJS.Timeout | undefined
  let wake: (() => void) | undefined

  const poll = async (): Promise<void> => {
    if (setGone) return
    try {
      const serving = await driver.servingInstances(hostname)
      if (serving.length === 0) {
        setGone = true
        await onGone().catch((error: unknown) =>
          console.error(
            `[load-rehearsal] the generator loading ${hostname} could not be stopped: ${codeOf(error)}`,
          ),
        )
        return
      }
      for (const handle of handles) {
        const status = await driver.status(handle)
        if (status.outOfMemory === true) outOfMemory = true
        if (status.exitCode !== undefined || status.state === 'gone') exited.add(handle)
        else if (!status.healthy) unhealthy.add(handle)
      }
    } catch (error) {
      console.error(
        `[load-rehearsal] a watch of ${hostname} could not read its set: ${codeOf(error)}`,
      )
    }
  }

  const loop = (async () => {
    while (!stopped) {
      await poll()
      if (stopped) break
      await new Promise<void>((resolve) => {
        wake = resolve
        timer = setTimeout(resolve, intervalMs)
        timer.unref()
      })
    }
  })()

  return {
    async stop() {
      stopped = true
      clearTimeout(timer)
      wake?.()
      await loop
      await poll()
      return {
        exits: exited.size,
        outOfMemory,
        unhealthy: unhealthy.size > 0,
        setGone,
      }
    },
  }
}

/** The report's numbers for the record — counts and latencies, never a body (Decision 9). */
function measurementOf(report: LoadReport): Partial<Evidence> {
  return {
    requests: report.requests,
    answered: report.answered,
    answeredRatio: report.answeredRatio,
    timeouts: report.timeouts,
    achievedRps: report.achievedRps,
    p50Ms: report.p50Ms,
    p95Ms: report.p95Ms,
    p99Ms: report.p99Ms,
    durationMs: report.durationMs,
    phases: report.phases.map((phase) => ({
      name: phase.name,
      asked: phase.asked,
      achieved: phase.achieved,
      requests: phase.requests,
      answered: phase.answered,
    })),
    byPath: report.byPath,
  }
}

function watchedEvidence(watched: Watched): Partial<Evidence> {
  return {
    instanceExits: watched.exits,
    outOfMemory: watched.outOfMemory,
    unhealthy: watched.unhealthy,
  }
}

/** The Incident a failed deploy recorded for the member that failed — its failing check, the line a person reads. */
async function incidentLine(db: Db, instanceId: string): Promise<string | undefined> {
  const [incident] = await db
    .select({ failedCheck: incidents.failedCheck })
    .from(incidents)
    .where(eq(incidents.instanceId, instanceId))
    .orderBy(desc(incidents.createdAt))
    .limit(1)
  return incident?.failedCheck
}

/** For an operator line: the CODE, never the message (a driver's or a daemon's text is third-party). */
function codeOf(error: unknown): string {
  return (
    (error as { code?: string } | null)?.code ??
    (error as Error | null)?.name ??
    String(error)
  )
}

/** For the row a person reads: the platform's own sentence, cut short. */
function messageOf(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.length > 500 ? `${message.slice(0, 500)}…` : message
}
