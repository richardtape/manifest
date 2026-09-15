import { and, desc, eq, getTableColumns, ne } from 'drizzle-orm'
import {
  builds,
  environments,
  incidents,
  instances,
  releases,
  type Db,
} from '../db/index.js'
import { describeDiff, type ResolvedConfig } from '../spec/index.js'
import { EventError } from './events.js'
import type { Redactor } from './redact.js'

/** §6's Incident, as stored — which is to say, redacted. */
export type Incident = typeof incidents.$inferSelect

/** §14: "last 200 log lines". */
export const INCIDENT_LOG_LINES = 200

/**
 * What an Incident reads from the driver. Restated structurally so that
 * `observability/` does not depend on `runtime/` — the reason `BuildLogLine` is
 * restated too — and a `Driver` is assignable to it.
 */
export interface IncidentSource {
  status(id: string): Promise<{ state: string; message?: string; exitCode?: number }>
  logs(id: string, opts: { tail?: number }): AsyncIterable<{ text: string }>
}

export interface CaptureIncidentInput {
  /**
   * The `instances` row that failed. Its driver handle, its release and its
   * environment are read from the ROW — one source, rather than three arguments that
   * have to agree, which is the shape P3's Session 5 paid for seven times.
   */
  instanceId: string
  /** What the platform checked and how that ended, in words: §14's "the failing check". */
  failedCheck: string
}

/**
 * §14's Incident, captured: the exit reason, the last 200 log lines, the failing check
 * and the diff since the last healthy release (P4b Task 13).
 *
 * **Every field is redacted before it is written.** The redactor is a parameter, as it
 * is for `recordEvent` and the build log, so no path stores an Incident unredacted —
 * §14 names `log_tail` first among the things redacted at capture, and an app that
 * prints its own connection string as it fails to start is the ordinary case.
 *
 * What the driver cannot answer does not stop the capture: a state or a log that cannot
 * be read becomes a sentence saying so, because an Incident that says why it is
 * incomplete is worth more than no Incident. A failed INSERT is not swallowed.
 */
export async function captureIncident(
  db: Db,
  source: IncidentSource,
  input: CaptureIncidentInput,
  redact: Redactor,
): Promise<Incident> {
  const [instance] = await db
    .select()
    .from(instances)
    .where(eq(instances.id, input.instanceId))
  if (instance === undefined) {
    throw new EventError(
      'INCIDENT_INSTANCE_NOT_FOUND',
      `no instance '${input.instanceId}' to record an incident for`,
    )
  }
  if (instance.handle === null) {
    // An instance the driver never created has no process and no log. What happened
    // to it is the error its caller already holds, and that is not an Incident.
    throw new EventError(
      'INCIDENT_INSTANCE_NOT_STARTED',
      `instance '${instance.id}' has no driver handle, so there is no process or log to record`,
    )
  }

  const exitReason = await describeExit(source, instance.handle)
  const logTail = await readLogTail(source, instance.handle)
  const diffSinceHealthy = await diffSinceLastHealthy(db, instance)

  const [row] = await db
    .insert(incidents)
    .values({
      instanceId: instance.id,
      exitReason: String(redact(exitReason)),
      logTail: String(redact(logTail)),
      failedCheck: String(redact(input.failedCheck)),
      diffSinceHealthy: String(redact(diffSinceHealthy)),
    })
    .returning()
  return row!
}

/**
 * An environment's incidents, newest first, each with the release it happened to.
 * Twenty by default: each one carries up to 200 log lines, and a list is for reading.
 */
export async function listIncidents(
  db: Db,
  environmentId: string,
  opts: { limit?: number } = {},
): Promise<(Incident & { releaseId: string })[]> {
  return db
    .select({ ...getTableColumns(incidents), releaseId: instances.releaseId })
    .from(incidents)
    .innerJoin(instances, eq(incidents.instanceId, instances.id))
    .where(eq(instances.environmentId, environmentId))
    .orderBy(desc(incidents.createdAt))
    .limit(opts.limit ?? 20)
}

/**
 * §14: the Incident is "deliberately shaped to be handed straight back to an AI agent
 * as a repair prompt". This is that shape, and it is the part of the requirement that
 * would otherwise be quietly dropped — the table alone is the near half.
 *
 * It says what broke, what the platform checked, what the app printed, and what changed
 * since it last worked. It does NOT suggest a fix: the agent has the repository and this
 * does not.
 */
export function incidentPrompt(
  incident: Pick<Incident, 'exitReason' | 'failedCheck' | 'logTail' | 'diffSinceHealthy'>,
  ctx: { slug: string; environmentKind: string },
): string {
  return [
    `The application "${ctx.slug}" failed to start in its ${ctx.environmentKind} environment.`,
    '',
    `What the platform checked: ${incident.failedCheck}`,
    `How it ended: ${incident.exitReason}`,
    '',
    'What changed since the last time it started successfully:',
    incident.diffSinceHealthy,
    '',
    'The last lines the application printed:',
    incident.logTail,
    '',
    'Change the application code or manifest.yaml so that this check passes, and',
    'explain the change in one sentence a non-engineer can read.',
  ].join('\n')
}

/** A code or a class name — never a message, which can carry text the app printed. */
function errorName(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code: unknown }).code
    if (typeof code === 'string') return code
  }
  return error instanceof Error ? error.name : 'unknown error'
}

const STILL_RUNNING = new Set(['starting', 'healthy', 'waking'])

async function describeExit(source: IncidentSource, handle: string): Promise<string> {
  let status: Awaited<ReturnType<IncidentSource['status']>>
  try {
    status = await source.status(handle)
  } catch (error) {
    return `the platform could not read the instance's state (${errorName(error)})`
  }
  const detail = status.message === undefined ? '' : `: ${status.message}`
  if (status.state === 'gone') return 'the instance no longer exists'
  if (status.exitCode !== undefined) {
    return `the process exited with code ${status.exitCode}${detail}`
  }
  if (STILL_RUNNING.has(status.state)) {
    return `the process is still running, and the platform reports it as ${status.state}${detail}`
  }
  return `the platform reports the instance as ${status.state}${detail}`
}

async function readLogTail(source: IncidentSource, handle: string): Promise<string> {
  // A WINDOW, not a list: a driver that ignores `tail` must not make this hold a whole
  // log in memory to keep its last 200 lines.
  const window: string[] = []
  let failure: string | undefined
  try {
    for await (const line of source.logs(handle, { tail: INCIDENT_LOG_LINES })) {
      window.push(line.text)
      if (window.length > INCIDENT_LOG_LINES) window.shift()
    }
  } catch (error) {
    failure = errorName(error)
  }
  if (failure !== undefined) {
    const note =
      window.length === 0
        ? `(the platform could not read the application's log: ${failure})`
        : `(the platform could not read the application's log past this point: ${failure})`
    return [...window.slice(-(INCIDENT_LOG_LINES - 1)), note].join('\n')
  }
  // The LAST lines, whatever the driver sent back. A head is what a naive limit gives
  // you, and it is the half that never contains the error.
  return window.length === 0 ? '(the application printed nothing)' : window.join('\n')
}

type InstanceRow = typeof instances.$inferSelect

const short = (sha: string): string => sha.slice(0, 7)

/**
 * §14's "the diff since the last HEALTHY release" — not the previous one, which may have
 * failed too, and diffing against a failure tells a faculty member nothing about what
 * they broke.
 *
 * The code as well as the manifest: `describeDiff` compares the frozen configs, and the
 * commit is the other half of a release and the likelier cause.
 */
async function diffSinceLastHealthy(db: Db, instance: InstanceRow): Promise<string> {
  const [environment] = await db
    .select({ kind: environments.kind })
    .from(environments)
    .where(eq(environments.id, instance.environmentId))
  if (environment === undefined) {
    throw new EventError(
      'INCIDENT_ENVIRONMENT_NOT_FOUND',
      `instance '${instance.id}' names environment '${instance.environmentId}', which does not exist`,
    )
  }
  const kind = environment.kind
  const [healthy] = await db
    .select({ releaseId: instances.releaseId })
    .from(instances)
    .where(
      and(
        eq(instances.environmentId, instance.environmentId),
        eq(instances.state, 'healthy'),
        ne(instances.id, instance.id),
      ),
    )
    .orderBy(desc(instances.lastSeenAt))
    .limit(1)
  if (healthy === undefined) {
    // A sentence, never an empty string: the first deploy is the likeliest to fail, and
    // an empty diff reads as "nothing changed" — the opposite of the truth.
    return `This app has never been healthy in ${kind}, so there is no working release to compare this one with.`
  }

  const lastGood = await frozenRelease(db, healthy.releaseId)
  const failing = await frozenRelease(db, instance.releaseId)
  const header = `Compared with release ${lastGood.id}, the last release that was healthy in ${kind}:`
  if (lastGood.id === failing.id) {
    return `${header}\n- this is that same release: its code and manifest.yaml have not changed since it was last healthy`
  }
  const code =
    lastGood.commitSha === failing.commitSha
      ? `- the code is the same commit (${short(failing.commitSha)})`
      : `- the code changed: commit ${short(lastGood.commitSha)} → ${short(failing.commitSha)}`
  const changes = describeDiff(lastGood.config[kind], failing.config[kind])
  const manifest =
    changes.length === 0
      ? ['- manifest.yaml: nothing the app runs with changed']
      : changes.map((change) => `- ${change.path}: ${change.summary}`)
  return [header, code, ...manifest].join('\n')
}

async function frozenRelease(
  db: Db,
  releaseId: string,
): Promise<{
  id: string
  commitSha: string
  config: Record<'sandbox' | 'staging' | 'production', ResolvedConfig>
}> {
  const [row] = await db
    .select({
      id: releases.id,
      config: releases.resolvedConfig,
      commitSha: builds.commitSha,
    })
    .from(releases)
    .innerJoin(builds, eq(releases.buildId, builds.id))
    .where(eq(releases.id, releaseId))
  if (row === undefined) {
    throw new EventError('INCIDENT_RELEASE_NOT_FOUND', `no release '${releaseId}'`)
  }
  return {
    id: row.id,
    commitSha: row.commitSha,
    config: row.config as Record<'sandbox' | 'staging' | 'production', ResolvedConfig>,
  }
}
