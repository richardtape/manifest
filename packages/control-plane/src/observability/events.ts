import { events, type Db } from '../db/index.js'
import { actingContext } from './acting.js'
import { EVENT_DETAIL_SCHEMAS } from './event-schemas.js'
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
  /** §22 step 5 (P5a): an instance row exists and its services are being bound. */
  'instance.provisioning',
  /** Its services are bound and the driver is starting it — beside the one serving (§11). */
  'instance.starting',
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
  /** §22 step 3 (P5a Task 11): a project and its three environments exist. */
  'project.created',
  /** Its repository exists, seeded from the skeleton and the starter. */
  'repository.seeded',
  /** Its manifest.yaml was validated at a commit — valid or not. */
  'spec.validated',
  /** D24 (P5b Task 4): a delegated token was minted for this project. NEVER carries the secret or its hash. */
  'token.minted',
  /** D24 (P5b Task 6): an agent asked for one of the privileged four, and a person must answer. */
  'pending_action.created',
  /** D24 (P5b Task 7): a person confirmed it, which grants that ONE request a single retry. */
  'pending_action.confirmed',
  /** D24 (P5b Task 7): a person refused it, in their own words. The agent is told why. */
  'pending_action.rejected',
  /** FE-52 (the faculty-ready plan's Task 13): a person ended the token that asked, so its question ended unanswered. */
  'pending_action.expired',
  /**
   * §9 and R1 (P6a Task 6): an administrator recorded what UBC IAM actually registered.
   * NEVER the attribute list — a project's stream is read by its members and the list is
   * read through `getLaunchRecords` instead (P6a Decision 14).
   */
  'iam_registration.recorded',
  /** §9 and R1 (P6a Task 6): an administrator recorded what the Privacy Office said. */
  'privacy_assessment.recorded',
  /**
   * §9 (Spec action 3; the launch path plan's Task 9): a person said a registration's request was
   * SENT to UBC IAM — the day, the environment and the ticket, never the package.
   */
  'iam_registration.submitted',
  /** The same for the privacy assessment, sent to the Privacy Office (Task 9). */
  'privacy_assessment.submitted',
  /**
   * §9 (Spec action 4; the launch path plan's Task 10): Manifest drafted a registration's package for
   * a person to send — the environment, the entity and the counts, NEVER the attributes themselves,
   * as `iam_registration.recorded` (a member reads them through `getLaunchRecords`).
   */
  'iam_registration.drafted',
  /**
   * §9 (Spec action 4; the launch path plan's Task 11): Manifest drafted the privacy assessment for a
   * person to send — the commit and how many gaps the owner must fill, NEVER the draft's text (a
   * member reads it through `getLaunchRecords`).
   */
  'privacy_assessment.drafted',
  /** D21 as R2 redefines it (P6a Task 14): a production-shaped rehearsal ran, and passed or did not. */
  'rehearsal.completed',
  /** §13 (P6a Task 10): an administrator approved this release for production, bound to its digest. */
  'release.approved',
  /** The other answer, and a separate type so a client can switch on it rather than read a field. */
  'release.approval_rejected',
  /**
   * §13 and §26 (Spec action 5; the launch path plan's Task 12, FE-25): a person asked an
   * administrator to approve the release serving staging for production — who asked and which
   * release, NEVER the note, which is for administrators alone (`listQueue`).
   */
  'approval.requested',
  /** §13 D9 (P6b Task 4): the app's first production launch — recorded once, by the deploy that made it true. */
  'project.launched',
  /**
   * D5 driver 2 (the D5 plan's Task 9): a branch moved on GitHub and the mirror took it —
   * whatever caused the sync, a webhook or a read. Commit ids only: never an author or a
   * message, which are an app author's free text.
   */
  'repository.pushed',
  /**
   * GitHub's history for a branch was REWRITTEN, and the mirror refused it: it kept the
   * commits an approved release may name (§13). Reported once per rewrite, not per push.
   */
  'repository.history_rewritten',
  /**
   * §20, enforced private (the D5 plan's Task 10): the repository was found PUBLIC on GitHub
   * — made private again, or refused, in which case it is not built while it is public.
   */
  'repository.visibility_enforced',
  /**
   * §20, push-time secret scanning (the D5 plan's Task 11): a commit GitHub has — pushed straight
   * to it, which GitHub.com lets through — ADDS a secret-shaped value. Names the commit, the path,
   * the line and the rule; NEVER the value. Reported at least once per commit.
   */
  'repository.secret_detected',
  /**
   * §20, push-time secret scanning, and what it could NOT do (the authoring API plan's Task 12):
   * commits GitHub has whose own patch is too large for one read of the mirror's scan, so no
   * line of them was scanned. Named, so an owner learns it; the build's gate still scans every
   * tree it builds. Reported at least once, before the commits are marked scanned.
   */
  'repository.scan_incomplete',
  /**
   * §20, `main` protected (the D5 plan's Task 12, Decision 13): GitHub would NOT protect the
   * new repository's `main` — a private repository on a free organisation — so a person can
   * rewrite or delete it on GitHub. Published by `POST /v1/projects`, LAST, never silently.
   */
  'repository.protection_unavailable',
  /**
   * A COMMIT MADE THROUGH MANIFEST (the authoring API plan's Task 6, Decision 10) — the
   * platform's own record of who made it, which `listCommits` reads as `madeThrough`. A commit's
   * author text is whatever the pusher's git said; this row is what Manifest saw.
   */
  'repository.committed',
  /**
   * §20: a commit Manifest was ASKED to make carried a secret-shaped value, and was refused
   * (Decision 10). Where and which rule — never the value. Not published for a dry run.
   */
  'repository.secret_refused',
  /**
   * AN APP'S DECLARED SECRET WAS SET for one environment (the authoring API plan's Task 8,
   * Decision 13) — by whom, and which name. NEVER THE VALUE. Published for every set, an
   * unchanged value included: it is a person, or their agent, acting on a credential.
   */
  'app_secret.set',
  /** …and CLEARED. Published only when a value was there to clear: clearing is idempotent. */
  'app_secret.cleared',
  /**
   * A PROJECT WAS RENAMED (the front-end enablement plan's Task 6; §6's `name`) — what people
   * call it, from and to, and by whom. Never its slug, which never changes. Not published for a
   * rename to the name it already has: the event is a change, and there was none.
   */
  'project.renamed',
  /**
   * A PERSON WAS ADDED to the project, or their role on it changed (the front-end enablement
   * plan's Task 7, Decision 15) — who, as what, what they were before, and who did it. Not
   * published when the request changed nothing: the same person, the same role.
   */
  'member.added',
  /** …and TAKEN OFF it. Not published for somebody who was not a member: removal is idempotent. */
  'member.removed',
  /**
   * AN AGENT WAS GIVEN A MODEL KEY (the front-end enablement plan's Task 10; §10's agent session
   * outside a sandbox) — for this project, charged to the person named, with its models, its cap and
   * its end. NEVER the key: it is in the start's answer and nowhere else.
   */
  'agent_session.started',
  /**
   * …ITS KEY WAS NARROWED IN PLACE (§7 as Spec action 1 amended it; the launch path plan's Task 7): the
   * project no longer allows some of its models — a raised classification, or the builder setting — and
   * the key lost them at the gateway and kept the rest. The session goes on. NEVER the key.
   */
  'agent_session.narrowed',
  /**
   * …and ITS KEY WAS REVOKED — ended, its token revoked, its project switched off or deleted, or nothing
   * it held still allowed.
   */
  'agent_session.ended',
  /**
   * §9: an SP registration was REMOVED from the Manifest IdP — §11's archive takes an app's sandbox
   * and staging registrations away (the front-end enablement plan's Task 11). Published only when a
   * row was there to remove: an archive retried finds it gone, which is no second removal.
   */
  'sso.deregistered',
  /**
   * §11: A PROJECT WAS SWITCHED OFF by its owner (the front-end enablement plan's Task 11) — every
   * name answering the switched-off page, every instance retired, its services stopped keeping their
   * data. Published ONCE per archive, when every step has run: an archive that stopped at a step is
   * published by the retry or the boot that finishes it.
   */
  'project.archived',
  /** …and RESTORED: an ordinary project again, starting nothing; its next deploy brings it back. */
  'project.restored',
  /**
   * §11: A NEVER-LAUNCHED PROJECT WAS DELETED by its owner (the front-end enablement plan's Task 12)
   * — archived first, then its repository, data volumes, secrets and model users destroyed, and its
   * names released. The LAST event of a project: its row stays as a tombstone this one references.
   */
  'project.deleted',
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
  /** Whose request caused it (§26; the faculty-ready plan's Task 10) — `null` when nobody's did. */
  actorUserId: string | null
  /** An administrator, not a member, acting with an owner's capability. */
  actedAsAdmin: boolean
  /** Why, redacted — only when `actedAsAdmin`. */
  reason: string | null
  /** The delegated token that acted, when the person's agent did. */
  actorTokenId: string | null
  /**
   * The actor's name, as `EventFrame.actor` carries it: from the acting context when recorded, from
   * `users` on a replay. Not a column — a person's name is read where it is kept.
   */
  actorName: string | null
  /** The token's name, read like `actorName`: from the context when recorded, from the row on a replay. */
  actorTokenName: string | null
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
 *
 * `insert` alone, so a caller can record the event in the SAME transaction as the change it describes
 * and publish its frame only after the commit (`ai/sessions.ts`'s narrowing — the launch path plan's
 * Task 7); `publishEvent` is the one-step form for everything else.
 */
export async function recordEvent(
  db: Pick<Db, 'insert'>,
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
  // P5a Decision 33: the contract's EventFrame is these schemas, so a detail that is not
  // its type's is a frame the document says cannot exist. Refused before the INSERT and
  // before redaction, naming the type and every path — never a value, which is exactly
  // what redaction has not yet run over.
  const detail = EVENT_DETAIL_SCHEMAS[input.type].safeParse(input.machineDetail)
  if (!detail.success) {
    throw new EventError(
      'EVENT_DETAIL_INVALID',
      `event '${input.type}' on '${input.subject}' carries a machineDetail its schema refuses, at: ` +
        detail.error.issues
          .map((i) => {
            const at = i.path.join('.') || '(root)'
            const keys = (i as { keys?: string[] }).keys
            return keys === undefined ? at : `${at} (${keys.join(', ')})`
          })
          .join(', ') +
        ' — observability/event-schemas.ts is the contract a client reads it by',
    )
  }

  /**
   * WHO ACTED, AND WHY (§26 and §6's Event as Spec action 1 amended them; the faculty-ready plan's
   * Task 10, Decision 13): read from the request's acting context HERE, the one place every event is
   * written, so no caller can forget it and none can claim it. An administrator acting on somebody
   * else's project has the sentence say so, with the reason — both redacted below, with everything
   * else, before anything is stored.
   */
  const acting = actingContext.getStore()
  const admin =
    acting?.asAdmin === true && acting.reason !== null
      ? { name: acting.name, reason: acting.reason }
      : null
  const humanMessage =
    admin === null
      ? input.humanMessage
      : `${input.humanMessage} ${admin.name} acted as a platform administrator — reason: '${admin.reason}'.`
  const [row] = await db
    .insert(events)
    .values({
      projectId: input.projectId,
      subject: input.subject,
      type: input.type,
      machineDetail: redact(input.machineDetail),
      humanMessage: String(redact(humanMessage)),
      actorUserId: acting?.userId ?? null,
      actorTokenId: acting?.token?.id ?? null,
      actedAsAdmin: admin !== null,
      reason: admin === null ? null : String(redact(admin.reason)),
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
  return {
    ...row,
    actorName: acting?.name ?? null,
    actorTokenName: acting?.token?.name ?? null,
  }
}
