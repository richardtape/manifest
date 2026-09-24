import { eq } from 'drizzle-orm'
import type { Db } from '../db/index.js'
import { appSpecs, builds, iamRegistrations } from '../db/index.js'
import {
  createBuildLogWriter,
  logFrame,
  makeRedactor,
  publishEvent,
  type BuildLogWriter,
  type EventBus,
  type Redactor,
} from '../observability/index.js'
import type { Driver } from '../runtime/index.js'
import { assertRegisteredAttributes, type ManifestSpec } from '../spec/index.js'

export type Build = typeof builds.$inferSelect

export interface StartBuildInput {
  projectId: string
  projectSlug: string
  appSpecId: string
  commitSha: string
  blueprintRef: string
  /**
   * A FILESYSTEM PATH to the bare repository, not the `file://` URL a builder is
   * handed. `buildImage` gives it to `git --git-dir=`, which rejects a URL with
   * `fatal: not a git repository`. It was named `repoUrl` and the delivery route
   * built one by hand — see the note at that call site.
   */
  repoPath: string
}

export interface BuildRunnerDeps {
  db: Db
  driver: Driver
  /**
   * D23.2's stream (P4b Task 15): `build.started`, every log line as it is written, and
   * `build.succeeded` or `build.failed`. Required, not optional — a build that records
   * and does not publish is a stream that sits silent through the whole build. Since R6
   * it is also the ONLY way a client learns a build ended without asking.
   */
  bus: EventBus
}

export interface BuildRunner {
  /**
   * Records the build and `build.started`, and returns the RUNNING row (R6). The build
   * itself runs after this resolves; its end is `build.succeeded` or `build.failed` on
   * the project's stream, and the row says so when it happens.
   */
  start(input: StartBuildInput): Promise<Build>
  /** Resolves when no build is running — for tests and the acceptance. */
  idle(): Promise<void>
}

/**
 * The control plane's SECOND background work, after the retirer (P5a Decision 31, Rich's
 * R6). One per process, built at boot, holding the driver rather than reaching for it.
 *
 * A build takes 17 s for the skeleton and is bounded at 900 s, so a request that awaited
 * it held a browser tab or the CI script open for the whole build. `start` answers once
 * the build is RECORDED — a row a client can read and an event on the stream — and the
 * rest runs here. A restart in the middle leaves a `running` row that nothing in this
 * process will move; `recoverAtBoot` fails it at the next boot.
 */
export function createBuildRunner(deps: BuildRunnerDeps): BuildRunner {
  const inFlight = new Set<Promise<void>>()
  return {
    async start(input) {
      const started = await recordBuildStart(deps, input)
      const run: Promise<void> = finishBuild(deps, input, started)
        .then(() => undefined)
        .catch((error: unknown) => {
          // `finishBuild` records a FAILED build itself; reaching here means it could not
          // even do that — a database outage mid-build. Not swallowed: the operator's
          // copy, with a CODE and the build id, never a message (§14). The row is left
          // `running`, and the next boot fails it as interrupted.
          console.error(
            JSON.stringify({
              level: 'error',
              msg: 'a build could not record how it ended; the next boot will mark it interrupted',
              buildId: started.created.id,
              error: (error as { code?: string }).code ?? (error as Error).name,
            }),
          )
        })
        .finally(() => inFlight.delete(run))
      inFlight.add(run)
      return started.created
    },
    async idle() {
      // A loop, not one `Promise.all`: a build started while the first batch ran is
      // in-flight work too.
      while (inFlight.size > 0) await Promise.all([...inFlight])
    },
  }
}

interface StartedBuild {
  created: Build
  redact: Redactor
  log: BuildLogWriter
}

/** The half of a build a request waits for: the row, `build.started`, and the log writer. */
async function recordBuildStart(
  { db, bus }: BuildRunnerDeps,
  input: StartBuildInput,
): Promise<StartedBuild> {
  const [created] = await db
    .insert(builds)
    .values({
      projectId: input.projectId,
      commitSha: input.commitSha,
      appSpecId: input.appSpecId,
      status: 'running',
    })
    .returning()
  if (!created) throw new Error('build insert returned no row')

  /**
   * §14's build log, redacted at capture. The secret set is EMPTY, and that is
   * accurate rather than lazy: §12 gives a build no app secret, and the one
   * credential a build does hold — the registry JWT — is minted inside the Docker
   * driver and removed from every line there, because nothing out here ever holds it
   * (pre-flight 105). So until P4b Task 12 this is a pass-through, and from Task 12
   * it carries the entropy and pattern heuristics.
   */
  const redact = makeRedactor([])
  try {
    await publishEvent(
      db,
      bus,
      {
        projectId: input.projectId,
        subject: `build:${created.id}`,
        type: 'build.started',
        machineDetail: {
          buildId: created.id,
          commitSha: input.commitSha,
          blueprintRef: input.blueprintRef,
        },
        humanMessage: `Building ${input.projectSlug} at commit ${input.commitSha.slice(0, 7)}.`,
      },
      redact,
    )
  } catch (error) {
    // Nothing will run this build, so its row must not say `running` until a restart. The
    // request answers the error; the row answers why, for anyone who reads it later.
    const code = (error as { code?: string }).code ?? (error as Error).name
    await db
      .update(builds)
      .set({ status: 'failed', error: `${code}: the build could not be started` })
      .where(eq(builds.id, created.id))
    throw error
  }
  // Each line reaches the stream AS IT IS WRITTEN, redacted and numbered by the writer —
  // a `log` frame, never an Event: a build is hundreds of lines and `events` is an audit
  // record. The line is durable in `audit.build_logs`, which is what a late client reads.
  const log = createBuildLogWriter(db, created.id, redact, (line) =>
    bus.publish(logFrame(input.projectId, created.id, line)),
  )
  return { created, redact, log }
}

/**
 * The half that runs in the background: asks the driver for an image, and records the
 * outcome. A failed build is a recorded row with `status: 'failed'` and no digest — not
 * an exception — because a faculty member needs to see the failure and its logs (§14).
 */
async function finishBuild(
  { db, driver, bus }: BuildRunnerDeps,
  input: StartBuildInput,
  { created, redact, log }: StartedBuild,
): Promise<Build> {
  const subject = `build:${created.id}`
  let done: Build
  try {
    await assertAttributesRegistered(db, input)
    const image = await driver.buildImage(
      { repoPath: input.repoPath, commitSha: input.commitSha },
      { blueprintRef: input.blueprintRef, projectSlug: input.projectSlug },
      { onLog: (line) => log.write(line) },
    )
    // Every line lands BEFORE the row says succeeded. A status over a log that is
    // still arriving is what a reader polling the row would otherwise see — and since
    // R6 polling the row is exactly what a script does.
    await log.flush()
    const [row] = await db
      .update(builds)
      .set({
        status: 'succeeded',
        imageDigest: image.digest,
        // BOTH HALVES. A digest with a re-derived repository is not the image
        // that was built — see the column's own note.
        imageRepository: image.repository,
        logsRef: `build:${created.id}`,
        // §12's "recorded on the Release": on the build, which every release of it shows.
        scan: image.scan,
      })
      .where(eq(builds.id, created.id))
      .returning()
    done = row!
  } catch (error) {
    // THE REASON IS THE POINT. This used to be `void error` — the row said
    // `failed` and carried nothing else, so the person who has to fix the build
    // had no way to learn what went wrong short of re-running it outside the
    // platform. §14 makes a failure a row so that it can be SEEN, and a row that
    // says only "no" is not a failure anybody can act on.
    //
    // The message, not the stack: these errors are `BuildGateError`,
    // `EngineError` and `BuildContextError`, whose messages are written for the
    // app's author. `hint` is appended when the error carries one.
    const e = error as { message?: string; hint?: string; code?: string }
    const message = [
      e.code === undefined ? '' : `${e.code}: `,
      e.message ?? String(error),
      e.hint === undefined ? '' : ` — ${e.hint}`,
    ].join('')
    /**
     * AND THE REASON IS THE LOG'S LAST LINE. A refusal before the builder ran — the
     * context export, §12's secret and lockfile gates — produces no BuildKit output
     * at all (pre-flight 109), so without this the log is empty for exactly the
     * failures a faculty member can fix themselves.
     */
    log.write({ at: new Date(), stream: 'stderr', text: message })
    let recorded = message
    try {
      await log.flush()
    } catch (logFailure) {
      // Not swallowed: the row says the log is incomplete, and so does the operator's
      // terminal. The driver's message, not drizzle's — that one quotes the whole
      // failed INSERT, every queued line included.
      const cause = (logFailure as { cause?: unknown }).cause ?? logFailure
      const why = cause instanceof Error ? cause.message : String(cause)
      console.error(`[build] ${created.id}: the build log could not be stored — ${why}`)
      recorded = `${message} (the build log could not be stored: ${why.slice(0, 300)})`
    }
    const [failed] = await db
      .update(builds)
      .set({ status: 'failed', logsRef: `build:${created.id}`, error: recorded })
      .where(eq(builds.id, created.id))
      .returning()
    // AFTER the row says failed, so a client that reacts by reading the build finds what
    // the event says. The sentence is for a faculty member — §14: "Your app couldn't
    // start", not `npm ci exited 1` — and the reason, redacted, is for the agent.
    await publishEvent(
      db,
      bus,
      {
        projectId: input.projectId,
        subject,
        type: 'build.failed',
        machineDetail: { buildId: created.id, code: e.code ?? null, reason: recorded },
        humanMessage: `${input.projectSlug} could not be built. Its build log says why.`,
      },
      redact,
    )
    return failed!
  }

  // OUTSIDE the `try`: a failure to record that the build succeeded must not re-mark a
  // built image as a failed build. It reaches the runner instead, which says so on the
  // operator's terminal — the row already says `succeeded`, which is true.
  await publishEvent(
    db,
    bus,
    {
      projectId: input.projectId,
      subject,
      type: 'build.succeeded',
      machineDetail: {
        buildId: done.id,
        imageDigest: done.imageDigest,
        imageRepository: done.imageRepository,
      },
      humanMessage: `${input.projectSlug} was built.`,
    },
    redact,
  )
  return done
}

/**
 * §7's last production clause and §9: *"If the agent adds an attribute IAM never registered,
 * the build fails with a plain message and a pre-generated change request, long before a
 * student would have hit a broken login"* (P6a Task 13).
 *
 * **INSIDE `finishBuild`'s `try`, BEFORE THE DRIVER**, so the refusal is a RECORDED FAILED
 * BUILD whose log's last line is the reason — what a faculty member can read (§14) — rather
 * than a 4xx on a request nobody keeps, and so no BuildKit run is spent on an image that
 * could never be launched.
 *
 * **EVERY BUILD, NOT ONLY ONES BOUND FOR PRODUCTION**, because a release is promoted and
 * never rebuilt (§13): the digest that reaches production is one this function already made.
 * A check at the production deploy would refuse the very thing *promotion never rebuilds*
 * exists to guarantee, after staging had run it for weeks.
 *
 * **NO REGISTRATION MEANS NO CHECK HERE, AND THE CHECKLIST IS THE OTHER HALF.** A CWL app
 * with no registration cannot reach production at all — §13's `iam-registration` item is
 * `unmet` (P6a Task 7) — and refusing its builds until IAM answers would stop a faculty
 * member building for staging for the weeks §9 says a registration takes. **And when the
 * registration arrives AFTER the build, which is §9's normal order, this function never saw
 * it**: so that item also compares the CANDIDATE release's attributes with what UBC
 * registered, and is `unmet` on drift (`launch/readiness.ts`, sitting 8's F7).
 *
 * **ONLY A CWL APP REQUESTS ANYTHING.** The schema lets `auth.attributes` stand beside
 * `provider: none`, and no Service Provider is registered for such an app, so no attribute
 * is ever released to it; its list is inert and is not drift.
 *
 * **`iam_registrations` IS READ HERE THROUGH `db/`, NOT THROUGH `launch/`'s
 * `getIamRegistration`**, and that is a decision: `launch/readiness.ts` imports `releases/`
 * at runtime, so the reverse import would be this codebase's third runtime module cycle.
 * `project_id` is UNIQUE on that table, so this select cannot mean anything but what the
 * getter means.
 */
async function assertAttributesRegistered(db: Db, input: StartBuildInput): Promise<void> {
  const [registration] = await db
    .select({
      attributes: iamRegistrations.registeredAttributes,
      ticketRef: iamRegistrations.externalTicketRef,
      state: iamRegistrations.state,
      requested: iamRegistrations.requestedAttributes,
    })
    .from(iamRegistrations)
    .where(eq(iamRegistrations.projectId, input.projectId))
  if (registration === undefined) return
  const [spec] = await db
    .select({ parsed: appSpecs.parsed })
    .from(appSpecs)
    .where(eq(appSpecs.id, input.appSpecId))
  const auth = (spec?.parsed as Partial<ManifestSpec> | undefined)?.auth
  assertRegisteredAttributes(
    auth?.provider === 'cwl' ? auth.attributes : [],
    registration.attributes,
    {
      slug: input.projectSlug,
      ticketRef: registration.ticketRef,
      // P6b Task 7: a change request on file is named rather than asked for again (`[M9]`).
      changeRequest:
        registration.requested === null
          ? null
          : { state: registration.state, requested: registration.requested },
    },
  )
}

export async function getBuild(db: Db, buildId: string): Promise<Build | undefined> {
  const [build] = await db.select().from(builds).where(eq(builds.id, buildId))
  return build
}
