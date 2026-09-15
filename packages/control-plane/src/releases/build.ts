import { eq } from 'drizzle-orm'
import type { Db } from '../db/index.js'
import { builds } from '../db/index.js'
import {
  createBuildLogWriter,
  logFrame,
  makeRedactor,
  publishEvent,
  type EventBus,
} from '../observability/index.js'
import type { Driver } from '../runtime/index.js'

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

/**
 * Records a build, asks the driver for an image, and records the outcome. A failed
 * build is a recorded row with `status: 'failed'` and no digest — not an exception —
 * because a faculty member needs to see the failure and its logs (§14).
 */
export async function startBuild(
  db: Db,
  driver: Driver,
  /**
   * D23.2's stream (P4b Task 15): `build.started`, every log line as it is written, and
   * `build.succeeded` or `build.failed`. Required, not optional — a build that records
   * and does not publish is a stream that sits silent through the whole build.
   */
  bus: EventBus,
  input: StartBuildInput,
): Promise<Build> {
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
  const subject = `build:${created.id}`
  await publishEvent(
    db,
    bus,
    {
      projectId: input.projectId,
      subject,
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
  // Each line reaches the stream AS IT IS WRITTEN, redacted and numbered by the writer —
  // a `log` frame, never an Event: a build is hundreds of lines and `events` is an audit
  // record. The line is durable in `audit.build_logs`, which is what a late client reads.
  const log = createBuildLogWriter(db, created.id, redact, (line) =>
    bus.publish(logFrame(input.projectId, created.id, line)),
  )

  let done: Build
  try {
    const image = await driver.buildImage(
      { repoPath: input.repoPath, commitSha: input.commitSha },
      { blueprintRef: input.blueprintRef, projectSlug: input.projectSlug },
      { onLog: (line) => log.write(line) },
    )
    // Every line lands BEFORE the row says succeeded. A status over a log that is
    // still arriving is what a reader polling the row would otherwise see.
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
  // built image as a failed build. It reaches the caller instead.
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

export async function getBuild(db: Db, buildId: string): Promise<Build | undefined> {
  const [build] = await db.select().from(builds).where(eq(builds.id, buildId))
  return build
}
