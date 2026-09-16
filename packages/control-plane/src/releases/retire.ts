import { and, eq, inArray } from 'drizzle-orm'
import type { AiKeyService } from '../ai/index.js'
import {
  environments,
  instances,
  routes,
  withEnvironmentLock,
  type Db,
} from '../db/index.js'
import {
  makeRedactor,
  publishEvent,
  type EventBus,
  type Redactor,
} from '../observability/index.js'
import { canTransition, nextState, type Driver } from '../runtime/index.js'
import type { AppSecretResolver } from '../secrets/index.js'

export interface RetirerDeps {
  db: Db
  driver: Driver
  ai: AiKeyService
  appSecrets: AppSecretResolver
  bus: EventBus
  /** §11's bound. `config.drainTimeoutMs`, 120 s by default (Rich, 2026-09-15). */
  drainMs: number
}

export interface RetireOutcome {
  /** Driver handles that were drained, removed and had their keys revoked. */
  retired: string[]
  /** Handles that could not be — an `instance.retire_failed` Event each, tried again. */
  failed: string[]
  skipped?: 'no-environment' | 'nothing-serves'
}

export interface Retirer {
  /** Returns at once. The pass takes the environment's lock itself. */
  schedule(environmentId: string): void
  /** Resolves when no pass is running — for tests, and for the acceptance. */
  idle(): Promise<void>
}

/**
 * Reap every instance of one environment that is not the one serving (R7).
 *
 * Not only the instance this deploy replaced: the backlog from before P4c, and
 * anything a crashed control plane left, is reaped by the next redeploy of that app.
 * Every redeploy before P4c left its container running and attached — eleven of them
 * in one P4a session — so an app's first P4c deploy may find several.
 *
 * NEVER THROWS. See `createRetirer`.
 */
export async function retireEnvironment(
  deps: RetirerDeps,
  environmentId: string,
): Promise<RetireOutcome> {
  const [environment] = await deps.db
    .select()
    .from(environments)
    .where(eq(environments.id, environmentId))
  if (environment === undefined) {
    return { retired: [], failed: [], skipped: 'no-environment' }
  }
  const projectSlug = environment.hostname.split('.')[0]!

  // UNDER THE LOCK: choosing what to retire, and marking it. A deploy holds the same
  // lock from its instance row to its Route row, so nothing here can select an
  // instance that is mid-deploy. The DRAIN is outside it — a deploy must not wait two
  // minutes for one.
  const plan = await withEnvironmentLock(environment.id, async () => {
    /**
     * THE MOST DANGEROUS LINE IN THIS PLAN.
     *
     * R7 says every instance that is not serving is retired. After an edge restart
     * NOTHING serves — `routes.docker.test.ts` restarts the edge, and ORIENTATION §4
     * records that a restart drops every runtime route — so "everything that is not
     * serving" would be EVERY instance, including the one people are using. A pass
     * that finds nothing serving does nothing at all and says why.
     */
    const serving = await deps.driver.servingInstance(environment.hostname)
    if (serving === undefined) return undefined

    const targets = (await deps.driver.listInstances(environment.hostname)).filter(
      (id) => id !== serving,
    )
    const rows =
      targets.length === 0
        ? []
        : await deps.db
            .select()
            .from(instances)
            .where(
              and(
                eq(instances.environmentId, environment.id),
                inArray(instances.handle, targets),
              ),
            )
    const marked: string[] = []
    for (const row of rows) {
      if (row.state === 'destroying') {
        marked.push(row.id)
        continue
      }
      // A row already `gone` or `failed` in a way the machine will not move is left
      // alone: the CONTAINER is what the retire actually reads, and the row is how a
      // console sees what is happening.
      if (!canTransition(row.state, 'destroy_requested')) continue
      await deps.db
        .update(instances)
        .set({ state: nextState(row.state, 'destroy_requested') })
        .where(eq(instances.id, row.id))
      marked.push(row.id)
    }

    // Is the instance that serves one this platform deployed since P4c? Only then is
    // the environment's pre-P4c key nobody's, and only then may it be revoked — until
    // then it is the key the RUNNING container is using.
    const [servingRecord] = await deps.db
      .select({ id: instances.id })
      .from(instances)
      .innerJoin(routes, eq(routes.instanceId, instances.id))
      .where(
        and(eq(routes.hostname, environment.hostname), eq(instances.handle, serving)),
      )
    return { targets, rows, marked, servingIsRecorded: servingRecord !== undefined }
  })
  if (plan === undefined) return { retired: [], failed: [], skipped: 'nothing-serves' }

  const redact: Redactor = makeRedactor(
    await deps.appSecrets.secretValues(deps.db, {
      projectId: environment.projectId,
      environmentKind: environment.kind,
    }),
  )
  const retired: string[] = []
  const failed: string[] = []
  for (const handle of plan.targets) {
    const row = plan.rows.find((candidate) => candidate.handle === handle)
    // A container with no row is still worth an Event: it is the one a crashed
    // control plane or a truncated database left, and §14's trail is most valuable
    // exactly when the thing it describes is gone.
    const subject = row === undefined ? `container:${handle}` : `instance:${row.id}`
    const detail = {
      instanceId: row?.id ?? null,
      handle,
      environment: environment.kind,
      drainMs: deps.drainMs,
    }
    try {
      await publishEvent(
        deps.db,
        deps.bus,
        {
          projectId: environment.projectId,
          subject,
          type: 'instance.retiring',
          machineDetail: detail,
          humanMessage: `The previous version of ${projectSlug} in ${environment.kind} is finishing its last requests.`,
        },
        redact,
      )

      await deps.driver.retireInstance(handle, { drainMs: deps.drainMs })

      // AFTER THE DRAIN, never at the deploy: LiteLLM checks a key when a request
      // STARTS (measured 2026-09-14), so a key revoked earlier fails a question the
      // old container has already accepted and is still answering.
      if (row !== undefined && deps.ai.enabled) {
        await deps.ai.revokeInstanceKey(deps.db, {
          projectId: environment.projectId,
          kind: environment.kind,
          instanceId: row.id,
        })
      }
      if (row !== undefined && plan.marked.includes(row.id)) {
        await deps.db
          .update(instances)
          .set({ state: nextState('destroying', 'destroyed') })
          .where(eq(instances.id, row.id))
      }
      await publishEvent(
        deps.db,
        deps.bus,
        {
          projectId: environment.projectId,
          subject,
          type: 'instance.retired',
          machineDetail: detail,
          humanMessage: `The previous version of ${projectSlug} in ${environment.kind} has been removed.`,
        },
        redact,
      )
      retired.push(handle)
    } catch (error) {
      failed.push(handle)
      // The CODE, never the message: a driver or gateway message is third-party text
      // and §14 keeps that out of an Event a faculty member reads. The row stays
      // `destroying`, which is what says the container is still there.
      await publishEvent(
        deps.db,
        deps.bus,
        {
          projectId: environment.projectId,
          subject,
          type: 'instance.retire_failed',
          machineDetail: {
            ...detail,
            error: (error as { code?: string }).code ?? (error as Error).name,
          },
          humanMessage: `The previous version of ${projectSlug} in ${environment.kind} could not be removed yet; it will be tried again.`,
        },
        redact,
      )
    }
  }

  // P4b's environment-level key, now that the app's own instance holds its own
  // (Decision 15). Last, because it is the key a pre-P4c container would still be
  // using, and `servingIsRecorded` is the proof that none is.
  if (plan.servingIsRecorded && deps.ai.enabled) {
    await deps.ai.revokeLegacyAppKey(deps.db, {
      projectId: environment.projectId,
      kind: environment.kind,
    })
  }
  return { retired, failed }
}

/**
 * ONE PASS PER ENVIRONMENT AT A TIME, and a pass NEVER THROWS.
 *
 * This is the control plane's first background work: everything else it does runs
 * inside an HTTP request. An unhandled rejection here is the whole process (Node's
 * default), so a failed pass is a line on stderr and an Event, and the next deploy or
 * boot tries again — §11: *"Failures back off exponentially and surface as an Event;
 * there is no silent retry."* The backing off is the next trigger; nothing here polls.
 *
 * Requests COALESCE. Three deploys of one app while a pass is running produce one
 * more pass, not three: a pass reads what is there when it runs, so a second pass
 * queued behind a first would find nothing to do.
 */
export function createRetirer(deps: RetirerDeps): Retirer {
  interface Pass {
    running: boolean
    again: boolean
  }
  const passes = new Map<string, Pass>()
  /** Every pass currently in flight, so `idle()` can wait for all of them. */
  const inFlight = new Set<Promise<void>>()

  async function run(environmentId: string): Promise<void> {
    const state = passes.get(environmentId)!
    try {
      // `again` is cleared BEFORE the pass, not after: something scheduled while this
      // pass runs must produce another one, and clearing afterwards would swallow it.
      while (state.again) {
        state.again = false
        try {
          const outcome = await retireEnvironment(deps, environmentId)
          for (const handle of outcome.failed) {
            // `request.log.error` writes nothing under `logger: false` — console.error
            // is what an operator can actually see (§14). The handle, never a key.
            console.error(
              `[retire] ${handle} in environment ${environmentId} could not be retired; it will be tried again`,
            )
          }
        } catch (error) {
          // retireEnvironment is not supposed to throw, and this is the second of two
          // independent reads of that rule — because the thing it protects is the
          // whole process, not one request.
          console.error(
            `[retire] the pass for environment ${environmentId} failed: ${(error as Error).name}`,
          )
        }
      }
    } finally {
      state.running = false
    }
  }

  return {
    schedule(environmentId: string): void {
      // SYNCHRONOUS, and that is load-bearing: `schedule` returns at once and the
      // pass's first `await` has not happened yet, so a second call in the same tick
      // has to see `running` already true or the two would run at the same time.
      const state = passes.get(environmentId) ?? { running: false, again: false }
      passes.set(environmentId, state)
      state.again = true
      if (state.running) return
      state.running = true
      const pass = run(environmentId).finally(() => inFlight.delete(pass))
      inFlight.add(pass)
    },

    async idle(): Promise<void> {
      // A pass can schedule nothing itself, but one that finishes while another is
      // still running leaves the set non-empty — so this drains rather than awaits
      // once.
      while (inFlight.size > 0) await Promise.all([...inFlight])
    },
  }
}
