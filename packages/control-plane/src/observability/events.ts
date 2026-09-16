import { events, type Db } from '../db/index.js'
import type { Redactor } from './redact.js'

/**
 * `observability/`'s failures, as one class with a stable code. Same shape as
 * `SsoError`, `SecretError` and `ReleaseError`.
 */
export class EventError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'EventError'
  }
}

/**
 * The closed set. A `type` is API surface the moment a client filters on it — §23's
 * audit screen does, and D23.2's stream is switched on it — so it is a list rather than
 * free text: a typo in a caller becomes an event nobody can find, and nothing would ever
 * say so.
 *
 * **Enforced twice**: here, and by the database's `events_type_known` CHECK (migration
 * 0008), which names the same list independently. Adding a type needs both, and
 * `events.test.ts` reads the constraint back out of Postgres and compares.
 */
export const EVENT_TYPES = [
  /** §9: an SP registration was written or re-written. */
  'sso.registered',
  /** §9 alerts on this one SPECIFICALLY: where an app receives assertions moved. */
  'sso.acs_changed',
  /** §14: a build began. Its log streams after this (P4b Task 15). */
  'build.started',
  'build.succeeded',
  /** A sentence in `human_message`; the reason, redacted, in `machine_detail`. */
  'build.failed',
  /** §11: a deployed instance passed its health check. Carries the state. */
  'instance.healthy',
  /** §11: a deployed instance never became healthy. Carries the state. */
  'instance.failed',
  /** §14: an Incident was recorded for that failure, and is named. */
  'incident.opened',
  /** §10: an app's AI key was replaced — committed once healthy. NEVER carries the key. */
  'ai.key_rotated',
  /** §11: an instance this deploy replaced is finishing its last requests (P4c). */
  'instance.retiring',
  /** §11: it finished, its container is gone and its AI key is revoked. */
  'instance.retired',
  /** It could not be, and will be tried again — never a silent retry (§11). */
  'instance.retire_failed',
] as const

export type EventType = (typeof EVENT_TYPES)[number]

export interface EventInput {
  projectId: string
  /**
   * What the event is ABOUT — `sp:chem-labs:staging`, `instance:abc`. An opaque
   * string, not a foreign key: an Event outlives the thing it describes, and §14's
   * argument is that the trail matters most once the instance is gone.
   */
  subject: string
  type: EventType
  machineDetail: Record<string, unknown>
  /** §14: faculty-legible. *"Your app couldn't start"*, not `exit code 1`. */
  humanMessage: string
}

export interface Event {
  id: string
  projectId: string
  subject: string
  type: string
  machineDetail: unknown
  humanMessage: string
  createdAt: Date
}

/**
 * §20's append-only Event, redacted at capture.
 *
 * **The redactor is a parameter, not a dependency this module binds.** There is
 * then no code path that writes an unredacted row even by accident: a caller
 * cannot forget to pass one, because it will not compile. §14 is unambiguous —
 * *"redacted at capture, never at display — the unredacted form is never
 * persisted"* — so the redaction happens here, between the caller's values and
 * the INSERT, and not in a route that renders them.
 *
 * Build one per call site from the app's own secret set:
 * `makeRedactor(await secretValuesFor(db, { projectId, environmentKind }, keys))`.
 *
 * The empty-message refusal is the FIRST of two independent reads of §14's
 * "every Event carries a faculty-legible human_message"; the migration's CHECK
 * constraint is the second. This one exists so the message names the field and
 * the caller rather than arriving as a Postgres constraint violation.
 */
export async function recordEvent(
  db: Db,
  input: EventInput,
  redact: Redactor,
): Promise<Event> {
  if (!(EVENT_TYPES as readonly string[]).includes(input.type)) {
    throw new EventError(
      'EVENT_TYPE_UNKNOWN',
      `unknown event type '${input.type}' — add it to EVENT_TYPES if it is real. ` +
        `Known: ${EVENT_TYPES.join(', ')}`,
    )
  }
  if (input.humanMessage.trim() === '') {
    throw new EventError(
      'EVENT_HUMAN_MESSAGE_MISSING',
      `event '${input.type}' on '${input.subject}' has an empty human_message. ` +
        '§14: every Event carries a faculty-legible message alongside machine_detail.',
    )
  }

  const [row] = await db
    .insert(events)
    .values({
      projectId: input.projectId,
      subject: input.subject,
      type: input.type,
      machineDetail: redact(input.machineDetail),
      humanMessage: String(redact(input.humanMessage)),
    })
    .returning()

  // `.returning()` on a single-row insert cannot come back empty, but
  // `noUncheckedIndexedAccess` types it as possibly undefined and a non-null
  // assertion here would be the one place this module lies about what it knows.
  if (row === undefined) {
    throw new EventError(
      'EVENT_NOT_WRITTEN',
      `the insert of event '${input.type}' on '${input.subject}' returned no row`,
    )
  }
  return row
}
