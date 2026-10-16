import { and, asc, eq, isNotNull, sql } from 'drizzle-orm'
import {
  environments,
  instances,
  projects,
  routes,
  tryWithEnvironmentLock,
  type Db,
} from '../db/index.js'
import { nextState, type Driver } from '../runtime/index.js'
import {
  actingContext,
  captureIncident,
  makeRedactor,
  publishEvent,
  type EventBus,
  type IncidentCause,
  type LineRedactor,
} from '../observability/index.js'
import type { AppSecretResolver } from '../secrets/index.js'
import { NothingToReplaceError, ReleaseError, type Instance } from './release.js'

/**
 * A1 TASK 6 — A PRODUCTION MEMBER THAT EXITS IS REPLACED (Rich, *"Replace it automatically"*; Decision 11;
 * §11 as Spec action A amended it: *"the platform notices it, records it with an Incident and an Event, and
 * redeploys the set — backing off, and stopping, and saying so, after three replacements in an hour"*).
 *
 * THE CONTROL PLANE'S THIRD BACKGROUND WORK, beside the retirer and the build runner: every
 * `intervalSeconds` it asks the driver's `status` — an existing verb, so every driver inherits it — of each
 * member of every PRODUCTION set, read from the Route rows. Containers run with `RestartPolicy: 'no'`
 * (`runtime/docker/hardening.ts`), because an engine that restarts one in place is the silent retry §11
 * forbids: this is what notices instead, and says so.
 */
export interface SetWatcherDeps {
  db: Db
  driver: Driver
  /** Where `instance.exited` and each Incident's `incident.opened` are published. */
  bus: EventBus
  /** The app's own secret set, which every Incident is redacted with — the deploy's rule (§14). */
  appSecrets: AppSecretResolver
  /**
   * The deploy, bound at boot as the route binds it — `purpose: 'replacement'`, which keeps the approval's
   * digest check and skips the route's §13 checklist (Rich, *"Skip the checklist"*). The watcher never
   * builds its own.
   */
  redeploy(input: {
    environmentId: string
    releaseId: string
    replacing: string
  }): Promise<void>
  /** The database's clock (ORIENTATION §4 trap 14) — never the host's. `databaseClock` in production. */
  now(): Promise<Date>
  /** Injected so the tests drive the backoff; `setTimeout` in production. */
  delay(ms: number): Promise<void>
  /** `MANIFEST_SET_WATCH_SECONDS`, 15 by default. */
  intervalSeconds: number
}

export interface SetWatcher {
  /** Passes every `intervalSeconds`, never two at once. */
  start(): void
  /** No more passes; resolves once the one running has finished. Replacements under way go on. */
  stop(): Promise<void>
  /** ONE pass now — for the tests, and the same function the timer runs. Never throws. */
  pass(): Promise<void>
  /** Resolves when no pass is running and no replacement is waiting or deploying — for tests. */
  idle(): Promise<void>
}

/** §11's exponential backoff, four times the one before: at once, a minute, four minutes. */
const BACKOFF_SECONDS = [0, 60, 240] as const

/** A member RUNNING and unhealthy for this many passes in a row has stopped (Rich, *"after ~1 minute"*). */
const UNHEALTHY_PASSES = 4

/**
 * 0, 60 and 240 seconds before the first, second and third replacement STARTED in an hour; `undefined`
 * after three — stopped.
 */
export function replacementDelaySeconds(attemptsThisHour: number): number | undefined {
  return BACKOFF_SECONDS[attemptsThisHour]
}

/** `SELECT now()` — the database's clock, the one every row's `created_at` is stamped from. */
export async function databaseClock(db: Db): Promise<Date> {
  const result = await db.execute(sql`SELECT now() AS now`)
  return new Date((result.rows[0] as { now: Date | string }).now)
}

type Watched = { id: string; hostname: string; projectId: string; slug: string }
type Exit = {
  member: Instance
  reason: 'exited' | 'gone' | 'unhealthy'
  exitCode: number | null
}
type Target = { replacing: string; releaseId: string }

/**
 * THE HOUR, FROM ROWS (Decision 11): replacements STARTED since the later of an hour ago and the
 * environment's last deploy that replaced nothing — a person's — counted as distinct deploys, each one
 * INSERT and so one `created_at`. So a restart neither forgets the cap nor counts twice, a replacement
 * that failed counts (its rows exist), and a person's deploy starts the count again. `stopped` is a stop
 * already SAID since that person's deploy — an `exit_stopped` Incident — and it stays said: nothing more is
 * started until a person deploys (a crash loop must not loop for ever, even three times an hour).
 */
async function thisHour(
  db: Db,
  environmentId: string,
  now: Date,
): Promise<{ attempts: number; started: string[]; exits: string[]; stopped: boolean }> {
  const result = await db.execute(sql`
    WITH last_person AS (
      SELECT max(created_at) AS at FROM instances
       WHERE environment_id = ${environmentId} AND replacing IS NULL
    ), since AS (
      SELECT greatest(
        ${now.toISOString()}::timestamptz - interval '1 hour',
        coalesce((SELECT at FROM last_person), '-infinity'::timestamptz)
      ) AS at
    ), started AS (
      SELECT DISTINCT created_at AS at FROM instances
       WHERE environment_id = ${environmentId} AND replacing IS NOT NULL
         AND created_at > (SELECT at FROM since)
    )
    SELECT
      (SELECT count(*) FROM started)::int AS attempts,
      array(SELECT to_char(at AT TIME ZONE 'UTC', 'HH24:MI:SS') FROM started ORDER BY at) AS started,
      array(
        SELECT to_char(n.created_at AT TIME ZONE 'UTC', 'HH24:MI:SS')
          FROM audit.incidents n JOIN instances i ON i.id = n.instance_id
         WHERE i.environment_id = ${environmentId} AND n.cause IN ('exit', 'exit_stopped')
           AND n.created_at > (SELECT at FROM since)
         ORDER BY n.created_at
      ) AS exits,
      EXISTS (
        SELECT 1 FROM audit.incidents n JOIN instances i ON i.id = n.instance_id
         WHERE i.environment_id = ${environmentId} AND n.cause = 'exit_stopped'
           AND n.created_at > coalesce((SELECT at FROM last_person), '-infinity'::timestamptz)
      ) AS stopped
  `)
  const row = result.rows[0] as {
    attempts: number
    started: string[]
    exits: string[]
    stopped: boolean
  }
  return row
}

/** How many replacement deploys have named `replacing` — read before and after one, to tell a refusal. */
async function replacementsOf(db: Db, replacing: string): Promise<number> {
  const result = await db.execute(
    sql`SELECT count(DISTINCT created_at)::int AS n FROM instances WHERE replacing = ${replacing}`,
  )
  return (result.rows[0] as { n: number }).n
}

const minutes = (seconds: number): string =>
  seconds === 60 ? 'a minute' : `${Math.round(seconds / 60)} minutes`

const list = (times: string[]): string =>
  times.length === 0 ? 'none' : `${times.join(', ')} UTC`

/**
 * ONE PASS PER PROCESS AT A TIME, AND A PASS NEVER THROWS — the retirer's rule: this is background work,
 * and an unhandled rejection here is the whole process. A failure is an operator line, and the next pass
 * looks again.
 */
export function createSetWatcher(deps: SetWatcherDeps): SetWatcher {
  /** A member RUNNING and unhealthy, by instance id: how many passes in a row. Memory is enough — a restart costs a minute. */
  const unhealthy = new Map<string, number>()
  /** Per environment, the ONE replacement waiting or deploying — joined, never doubled. */
  const inFlight = new Map<
    string,
    { task: Promise<void>; attempt: number; startsAt: number }
  >()
  let running: Promise<void> | undefined
  let timer: ReturnType<typeof setInterval> | undefined

  async function run(): Promise<void> {
    const watched: Watched[] = await deps.db
      .selectDistinct({
        id: environments.id,
        hostname: environments.hostname,
        projectId: environments.projectId,
        slug: projects.slug,
      })
      .from(environments)
      .innerJoin(projects, eq(projects.id, environments.projectId))
      .innerJoin(routes, eq(routes.hostname, environments.hostname))
      // PRODUCTION ONLY (Decision 11): staging and sandbox keep §11's "a crash becomes failed and an Event"
      // for a person to act on. An archived project's environments are its owner's, switched off. AND ONLY A
      // LAUNCHED PROJECT'S (a ruling of A1 sitting 6, sitting 5's F12): before a launch nothing serves production
      // but D21's rehearsal (`takeDownLeftRehearsals`' own rule), which puts one instance up and takes exactly it
      // down — a take-down that leaves a row it did not find `healthy` alone — and whose replacement would be
      // refused anyway, with no approval before a launch.
      .where(
        and(
          eq(environments.kind, 'production'),
          eq(projects.state, 'active'),
          isNotNull(projects.launchedAt),
        ),
      )
    for (const environment of watched) {
      try {
        await watch(environment)
      } catch (error) {
        console.error(
          JSON.stringify({
            level: 'error',
            msg: "the set watcher could not read production's instances this pass; the next pass looks again",
            environmentId: environment.id,
            error: (error as { code?: string }).code ?? (error as Error).name,
          }),
        )
      }
    }
  }

  async function watch(environment: Watched): Promise<void> {
    /**
     * "MID-WAY" IS THE LOCK, NOT THE ROWS (a ruling of A1 sitting 5): a deploy holds the environment's lock
     * from its first row to its Route rows, so under the lock nothing is mid-way — and rows a deploy that
     * THREW left `starting` (sitting 4's F7) cannot hide a dead member until the next boot. Held by a
     * deploy, a retire pass or an archive: this pass leaves the environment to the next.
     */
    const decided = await tryWithEnvironmentLock(environment.id, () =>
      readAndRecord(environment),
    )
    if (decided?.replace !== undefined)
      schedule(environment, decided.replace.target, decided.replace)
  }

  async function readAndRecord(environment: Watched): Promise<{
    replace?: { target: Target; attempt: number; seconds: number; now: Date }
  }> {
    const members = (
      await deps.db
        .select({ instance: instances })
        .from(routes)
        .innerJoin(instances, eq(routes.instanceId, instances.id))
        .where(
          and(
            eq(routes.hostname, environment.hostname),
            eq(instances.environmentId, environment.id),
            /**
             * ONLY WHAT THIS DRIVER STARTED (a ruling of A1 sitting 5): a member another driver made is a
             * handle this one cannot read — Docker answers `gone` for the fake's `inst-3` — and "replacing"
             * it would start an app on the wrong runtime. On this laptop that is not hypothetical: `pnpm
             * test` commits fake-driver production sets to the database the control plane on 7100 watches.
             */
            eq(instances.driver, deps.driver.name),
          ),
        )
        .orderBy(asc(instances.createdAt), asc(instances.id))
    ).map((row) => row.instance)

    const exits: Exit[] = []
    /** Members whose exit was recorded by an earlier pass — still in the set, so not yet replaced. */
    const dead: Instance[] = []
    for (const member of members) {
      if (member.state === 'failed') {
        dead.push(member)
        continue
      }
      if (member.state !== 'healthy' || member.handle === null) {
        unhealthy.delete(member.id)
        continue
      }
      const status = await deps.driver.status(member.handle)
      if (status.state === 'gone') {
        exits.push({ member, reason: 'gone', exitCode: null })
      } else if (status.state === 'failed' && status.exitCode !== undefined) {
        exits.push({ member, reason: 'exited', exitCode: status.exitCode })
      } else if (status.state === 'failed') {
        // RUNNING, its health check failing: the edge's active checks route around it already. A minute of
        // it — four passes in a row — and nobody can reach it: as gone, to the people using the app.
        const passes = (unhealthy.get(member.id) ?? 0) + 1
        unhealthy.set(member.id, passes)
        if (passes >= UNHEALTHY_PASSES)
          exits.push({ member, reason: 'unhealthy', exitCode: null })
      } else {
        // Healthy — or asleep (A2's hibernation reads `hibernated`, never `failed`): not an exit.
        unhealthy.delete(member.id)
      }
    }
    if (exits.length === 0 && dead.length === 0) return {}
    for (const exit of exits) unhealthy.delete(exit.member.id)

    const now = await deps.now()
    const hour = await thisHour(deps.db, environment.id, now)
    const pending = inFlight.get(environment.id)
    const seconds =
      pending === undefined ? replacementDelaySeconds(hour.attempts) : undefined
    const decision: Decision = hour.stopped
      ? { replacement: 'stopped', attempt: hour.attempts + 1, capped: false }
      : pending !== undefined
        ? {
            replacement: 'scheduled',
            attempt: pending.attempt,
            nextInSeconds: Math.max(
              0,
              Math.ceil((pending.startsAt - now.getTime()) / 1000),
            ),
          }
        : seconds === undefined
          ? { replacement: 'stopped', attempt: hour.attempts + 1, capped: true }
          : {
              replacement: 'scheduled',
              attempt: hour.attempts + 1,
              nextInSeconds: seconds,
            }

    const redact = makeRedactor(
      await deps.appSecrets.secretValues(deps.db, {
        projectId: environment.projectId,
        environmentKind: 'production',
      }),
    )
    const exited = new Set(exits.map((exit) => exit.member.id))
    const survivors = members.filter(
      (member) => member.state === 'healthy' && !exited.has(member.id),
    ).length
    for (const exit of exits)
      await recordExit(environment, exit, decision, hour, survivors, redact)

    if (decision.replacement === 'stopped') {
      // PAST THE CAP WITH NO NEW EXIT — every replacement this hour failed, and the dead member is still in
      // the set: say so ONCE, on it (an `exit_stopped` Incident makes `stopped` true from now on).
      if (exits.length === 0 && decision.capped)
        await sayStopped(
          environment,
          dead[0]!,
          `three replacements were started this hour (at ${list(hour.started)}) and none kept serving`,
          redact,
        )
      return {}
    }
    if (pending !== undefined) return {}
    const first = dead[0] ?? exits[0]!.member
    return {
      replace: {
        target: { replacing: first.id, releaseId: first.releaseId },
        attempt: decision.attempt,
        seconds: decision.nextInSeconds,
        now,
      },
    }
  }

  type Decision =
    | { replacement: 'scheduled'; attempt: number; nextInSeconds: number }
    | { replacement: 'stopped'; attempt: number; capped: boolean }

  /**
   * ONE EXIT, RECORDED ONCE (Decision 11): the row `healthy → failed` by §11's `crashed` — guarded on the
   * state it was read in, so a row something else moved is left alone — an Incident (its logs, redacted,
   * which is where a crash's reason is), its `incident.opened`, and `instance.exited`.
   */
  async function recordExit(
    environment: Watched,
    exit: Exit,
    decision: Decision,
    hour: { started: string[]; exits: string[] },
    survivors: number,
    redact: LineRedactor,
  ): Promise<void> {
    const { member } = exit
    const [moved] = await deps.db
      .update(instances)
      .set({ state: nextState('healthy', 'crashed') })
      .where(and(eq(instances.id, member.id), eq(instances.state, 'healthy')))
      .returning({ id: instances.id })
    if (moved === undefined) return

    const how =
      exit.reason === 'exited'
        ? `its process exited (code ${exit.exitCode})`
        : exit.reason === 'gone'
          ? 'it no longer exists — its container was removed'
          : `it kept running but failed its health check on ${UNHEALTHY_PASSES} of the platform's checks in a row, a minute`
    const stoppedWhy =
      decision.replacement === 'scheduled'
        ? ''
        : decision.capped
          ? ` Replacing it has stopped after three tries this hour — replacements started at ${list(hour.started)}, after exits at ${list(hour.exits)} — and nothing more is started until the app is deployed again.`
          : ' Replacing stopped earlier, and nothing more is started until the app is deployed again.'
    const cause: IncidentCause =
      decision.replacement === 'scheduled' ? 'exit' : 'exit_stopped'
    await openIncident(
      environment,
      member,
      `watch: the instance was serving production, and ${how}.${stoppedWhy}`,
      cause,
      redact,
    )

    const serving =
      decision.replacement === 'scheduled'
        ? survivors > 0
          ? 'The app kept serving on the rest of its set.'
          : 'Nothing is serving the app until the replacement starts.'
        : survivors > 0
          ? 'The app is serving on the rest of its set.'
          : 'Nothing is serving the app.'
    const sentence =
      decision.replacement === 'scheduled'
        ? `An instance of ${environment.slug}'s production stopped; ${
            decision.nextInSeconds === 0
              ? 'it is being replaced'
              : `it will be replaced in ${minutes(decision.nextInSeconds)}`
          }. ${serving}`
        : decision.capped
          ? `An instance of ${environment.slug}'s production stopped again; replacing it has stopped after three tries this hour. ${serving}`
          : `An instance of ${environment.slug}'s production stopped; replacing it has stopped until the app is deployed again. ${serving}`
    await publishEvent(
      deps.db,
      deps.bus,
      {
        projectId: environment.projectId,
        subject: `instance:${member.id}`,
        type: 'instance.exited',
        machineDetail: {
          instanceId: member.id,
          releaseId: member.releaseId,
          environmentId: environment.id,
          environment: 'production',
          reason: exit.reason,
          exitCode: exit.exitCode,
          attempt: decision.attempt,
          replacement: decision.replacement,
          nextInSeconds:
            decision.replacement === 'scheduled' ? decision.nextInSeconds : null,
        },
        humanMessage: sentence,
      },
      redact,
    )
  }

  /** §14's Incident for a member, and its `incident.opened` — the deploy's pair, with the watcher's cause. */
  async function openIncident(
    environment: Watched,
    member: Instance,
    failedCheck: string,
    cause: IncidentCause,
    redact: LineRedactor,
  ): Promise<void> {
    const incident = await captureIncident(
      deps.db,
      deps.driver,
      { instanceId: member.id, failedCheck, cause },
      redact,
    )
    await publishEvent(
      deps.db,
      deps.bus,
      {
        projectId: environment.projectId,
        subject: `incident:${incident.id}`,
        type: 'incident.opened',
        machineDetail: {
          incidentId: incident.id,
          instanceId: member.id,
          releaseId: member.releaseId,
          environment: 'production',
          // FE-62: a member that stopped, said as the Incident says it — and whether it was itself a replacement.
          cause,
          replacing: member.replacing,
        },
        humanMessage:
          cause === 'exit'
            ? `${environment.slug} stopped in production while it was serving. The incident records what it printed.`
            : `${environment.slug} keeps stopping in production, and the platform has stopped replacing it. The incident records what it printed and why.`,
      },
      redact,
    )
  }

  /**
   * REPLACING HAS STOPPED, SAID ONCE, on the member it was for — an `exit_stopped` Incident, which is what
   * makes `stopped` true until a person deploys. Never a second `instance.exited`: a person is told of one
   * exit once (and the front end's own watch is asked to tell nobody twice).
   */
  async function sayStopped(
    environment: Watched,
    member: Instance,
    why: string,
    redact: LineRedactor,
  ): Promise<void> {
    await openIncident(
      environment,
      member,
      `watch: the instance stopped while it was serving production and was not replaced: ${why}. Nothing more is started until the app is deployed again.`,
      'exit_stopped',
      redact,
    )
  }

  /**
   * THE REPLACEMENT, IN THE BACKGROUND: the backoff, then the deploy. It takes the environment's lock itself
   * (the deploy does), so it waits for anything holding it. What it can end in:
   * - **healthy** — the set replaced; the deploy scheduled the retire pass for the old one;
   * - **failed** — the deploy's own failure: the previous set kept, the dead member in it, the deploy's
   *   Incident. Its rows exist, so it is counted; the next pass starts the next attempt after the backoff;
   * - **nothing to replace** — a person's deploy got there first: the deploy's operator line, nothing more;
   * - **refused before anything started** (a `ReleaseError` and no row naming it — the approval's digest
   *   check first among them): it will not change by being asked again, so replacing STOPS, said in an
   *   Incident with the code;
   * - **failed before anything started, NOT refused** — anything else thrown with no row written: LiteLLM
   *   restarting as the deploy reads its catalogue, the database, the engine. That can change by being asked
   *   again, so it is an operator line naming it and NOTHING STOPS: the dead member is still in the set, and
   *   the next pass schedules it again — the same attempt, since nothing started (A1 sitting 8, the
   *   whole-branch review's I2: stopping here left a `solo` app down until its owner deployed).
   */
  function schedule(
    environment: Watched,
    target: Target,
    when: { attempt: number; seconds: number; now: Date },
  ): void {
    const task = actingContext
      // A REPLACEMENT NAMES NOBODY (§26): it runs in no person's request, whatever started the pass.
      .exit(async () => {
        await deps.delay(when.seconds * 1000)
        const before = await replacementsOf(deps.db, target.replacing)
        try {
          await deps.redeploy({ environmentId: environment.id, ...target })
        } catch (error) {
          if (error instanceof NothingToReplaceError) return
          if ((await replacementsOf(deps.db, target.replacing)) !== before) {
            console.error(
              JSON.stringify({
                level: 'error',
                msg: 'a replacement failed after it started; the next pass tries again after the backoff',
                environmentId: environment.id,
                replacing: target.replacing,
                error: (error as { code?: string }).code ?? (error as Error).name,
              }),
            )
            return
          }
          const code = (error as { code?: string }).code ?? (error as Error).name
          if (!(error instanceof ReleaseError)) {
            console.error(
              JSON.stringify({
                level: 'error',
                msg: 'a replacement could not start, and nothing was started; the next pass tries again',
                environmentId: environment.id,
                replacing: target.replacing,
                error: code,
              }),
            )
            return
          }
          const [member] = await deps.db
            .select()
            .from(instances)
            .where(eq(instances.id, target.replacing))
          if (member === undefined) return
          const redact = makeRedactor(
            await deps.appSecrets.secretValues(deps.db, {
              projectId: environment.projectId,
              environmentKind: 'production',
            }),
          )
          // A ReleaseError's message is the platform's own words.
          const said = `${code} — ${error.message}`
          await sayStopped(
            environment,
            member,
            `replacing it was refused: ${said}`,
            redact,
          )
        }
      })
      .catch((error: unknown) => {
        console.error(
          JSON.stringify({
            level: 'error',
            msg: 'a replacement could not be started or recorded; the next pass looks again',
            environmentId: environment.id,
            error: (error as { code?: string }).code ?? (error as Error).name,
          }),
        )
      })
      .finally(() => inFlight.delete(environment.id))
    inFlight.set(environment.id, {
      task,
      attempt: when.attempt,
      startsAt: when.now.getTime() + when.seconds * 1000,
    })
  }

  function pass(): Promise<void> {
    running ??= actingContext
      .exit(() => run())
      .catch((error: unknown) => {
        console.error(
          JSON.stringify({
            level: 'error',
            msg: 'the set watcher’s pass failed; the next pass looks again',
            error: (error as { code?: string }).code ?? (error as Error).name,
          }),
        )
      })
      .finally(() => {
        running = undefined
      })
    return running
  }

  return {
    start(): void {
      if (timer !== undefined) return
      timer = setInterval(() => {
        if (running === undefined) void pass()
      }, deps.intervalSeconds * 1000)
      // The server keeps the process alive; the watcher's timer never should on its own.
      timer.unref()
    },
    async stop(): Promise<void> {
      if (timer !== undefined) clearInterval(timer)
      timer = undefined
      await running
    },
    pass,
    async idle(): Promise<void> {
      while (running !== undefined || inFlight.size > 0)
        await Promise.all([running, ...[...inFlight.values()].map((entry) => entry.task)])
    },
  }
}
