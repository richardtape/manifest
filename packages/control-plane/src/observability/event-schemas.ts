import { z } from 'zod/v4'
import {
  approvalDecision,
  environmentKind,
  iamRegistrationState,
  instanceState,
  privacyAssessmentState,
} from '../db/index.js'
import type { EventType } from './events.js'

/**
 * EVERY EVENT TYPE'S `machineDetail`, as a schema (P5a Decision 33). Enforced where events
 * are written — `recordEvent` refuses a detail that does not parse — and published as the
 * contract's EventFrame union, so a client switches on `type` and gets a typed payload, and
 * the document cannot describe a shape nothing produces.
 *
 * **STRICT OBJECTS, so the document cannot under-describe either.** A representation's
 * objects are `additionalProperties: false` in the document; a plain `z.object` would let a
 * call site add a key the document says no client will ever see, and parsing would pass it.
 * Refusing it — not stripping it, which would lose it from the audit trail with nothing
 * saying so — makes the author of that call site add it here, where a client reads it.
 *
 * Validated BEFORE redaction. Redaction only rewrites strings, and nothing below constrains
 * a string that a redactor could rewrite: an id is a UUID and a commit is hex, both of which
 * the heuristics leave alone by design (`observability/redact.ts`).
 *
 * **Adding an event type is FOUR edits** — this map, `EVENT_TYPES`, the database's CHECK (a
 * migration) and `EXAMPLE_DETAILS` in `observability/testing.ts` — and `events.test.ts` holds
 * each pair equal. It said three until P5a Task 14 counted them: `EXAMPLE_DETAILS` became the
 * fourth in Task 12 and nothing here said so. The contract's `EventFrame` union is NOT a fifth:
 * `api/representations/events.ts` builds it from `EVENT_TYPES` and this map, so a new type
 * appears in the document by construction (and `pnpm contract:write` then shows the drift).
 *
 * Read from the call sites on 2026-09-17: `sso/registration.ts`, `releases/build.ts`,
 * `releases/release.ts`, `releases/retire.ts` and `api/routes/projects.ts`.
 */
const Kind = z.enum(environmentKind.enumValues)
const Uuid = z.uuid()
const Sha = z.string().regex(/^[0-9a-f]{40}$/)

const InstanceDetail = z.strictObject({
  instanceId: Uuid,
  releaseId: Uuid,
  environmentId: Uuid,
  environment: Kind,
  // The database's own enum, as the Instance representation reads it (P5a sitting 6).
  state: z.enum(instanceState.enumValues),
})

/**
 * `handle` is the driver's name for the container, which Decision 23 keeps out of an
 * `Instance`. It is here because a container a crash or a truncated database left has NO
 * row, and the handle is then the only thing naming what was removed — §14's trail matters
 * most once the thing is gone. The event's `subject` carries it for the same reason.
 */
/**
 * Both halves of §13's approval answer (P6a Decision 14). One shape for two types, so a
 * client switches on the TYPE rather than reading a field to find out what happened —
 * `decision` is carried as well because the audit trail is read as rows, not as a switch.
 */
const ApprovalDetail = z.strictObject({
  releaseId: Uuid,
  imageDigest: z.string(),
  decision: z.enum(approvalDecision.enumValues),
})

const RetireDetail = z.strictObject({
  instanceId: Uuid.nullable(),
  handle: z.string(),
  environment: Kind,
  drainMs: z.number().int().nonnegative(),
})

export const EVENT_DETAIL_SCHEMAS = {
  'sso.registered': z.strictObject({
    entityId: z.string(),
    acsUrl: z.string(),
    attributes: z.array(z.string()),
    certificateFingerprint: z.string(),
    changed: z.boolean(),
  }),
  'sso.acs_changed': z.strictObject({ from: z.string().nullable(), to: z.string() }),
  'build.started': z.strictObject({
    buildId: Uuid,
    commitSha: Sha,
    blueprintRef: z.string(),
  }),
  'build.succeeded': z.strictObject({
    buildId: Uuid,
    imageDigest: z.string().nullable(),
    imageRepository: z.string().nullable(),
  }),
  'build.failed': z.strictObject({
    buildId: Uuid,
    code: z.string().nullable(),
    reason: z
      .string()
      .describe(
        'Redacted at capture (§14). For the agent; the human message is for a person.',
      ),
  }),
  'instance.provisioning': InstanceDetail,
  'instance.starting': InstanceDetail,
  'instance.healthy': InstanceDetail,
  'instance.failed': InstanceDetail.extend({ failedCheck: z.string() }),
  'incident.opened': z.strictObject({
    incidentId: Uuid,
    instanceId: Uuid,
    releaseId: Uuid,
    environment: Kind,
  }),
  'ai.key_rotated': z.strictObject({
    instanceId: Uuid,
    environment: Kind,
    models: z.array(z.string()),
  }),
  'instance.retiring': RetireDetail,
  'instance.retired': RetireDetail,
  'instance.retire_failed': RetireDetail.extend({
    error: z.string().describe('A code or an error class name — never a message (§14).'),
  }),
  'project.created': z.strictObject({
    slug: z.string(),
    blueprint: z.string(),
    starter: z.string().nullable(),
    // §24's two answers. The same lists as the Audience representation, which this module
    // cannot import; `api/stream-contract.test.ts` holds them equal.
    audience: z.strictObject({
      scale: z.enum(['solo', 'class', 'large_course', 'public']),
      burst: z.enum(['steady', 'synchronised']),
    }),
  }),
  'repository.seeded': z.strictObject({
    commitSha: Sha,
    files: z.number().int().positive(),
    starter: z.string().nullable(),
  }),
  /**
   * D24 (P5b Task 4). NO `projectId` — the event ROW carries it, and every other detail
   * in this map leaves it to the column rather than storing a second copy. NO secret and
   * NO hash: §14, and `redact.ts` would not catch either (`[M9]`).
   */
  'token.minted': z.strictObject({
    tokenId: Uuid,
    capabilities: z.array(z.string()),
    expiresAt: z.iso.datetime(),
  }),
  /**
   * D24 (P5b Task 6). The QUESTION, not what was in it: no body, no fingerprint hash and
   * no summary — the row carries those, and this is the audit trail a person reads.
   * `projectId` is the event's own column, as everywhere else in this map.
   */
  'pending_action.created': z.strictObject({
    pendingActionId: Uuid,
    tokenId: Uuid,
    action: z.string(),
  }),
  /**
   * D24 (P5b Task 7). `resolvedBy` is WHO answered, which is the whole point of the
   * record: §20's audit trail has to say which person let a delegated token past D24's
   * rule. No reason — a confirmation needs none, and the human sentence carries the rest.
   */
  'pending_action.confirmed': z.strictObject({
    pendingActionId: Uuid,
    tokenId: Uuid,
    action: z.string(),
    resolvedBy: Uuid,
  }),
  /** The other answer. `reason` is the person's own words, which is what the agent is told. */
  'pending_action.rejected': z.strictObject({
    pendingActionId: Uuid,
    tokenId: Uuid,
    action: z.string(),
    resolvedBy: Uuid,
    reason: z.string(),
  }),
  'spec.validated': z.strictObject({
    appSpecId: Uuid,
    commitSha: Sha,
    valid: z.boolean(),
    errorCount: z.number().int().nonnegative(),
  }),
  /**
   * §9 and R1 (P6a Task 6). **THE TICKET REFERENCE IS HERE AND THE ATTRIBUTES ARE NOT**:
   * a list of requested CWL attributes on a project's stream is more than the stream needs
   * to carry, so the COUNT goes here and `getLaunchRecords` is where a member reads the
   * list itself. `projectId` is the event's own column, as everywhere else in this map.
   */
  'iam_registration.recorded': z.strictObject({
    state: z.enum(iamRegistrationState.enumValues),
    entityId: z.string(),
    externalTicketRef: z.string().nullable(),
    attributeCount: z.number().int().positive(),
  }),
  /** The same shape for the other external record. No reviewer note — §14, and the row has it. */
  'privacy_assessment.recorded': z.strictObject({
    state: z.enum(privacyAssessmentState.enumValues),
    externalTicketRef: z.string().nullable(),
  }),
  /**
   * D21 as R2 redefines it (P6a Task 14). The COUNT of attributes released, never the
   * names, and never the assertion or a NameID — `launch/rehearsal.ts` holds the evidence.
   */
  'rehearsal.completed': z.strictObject({
    rehearsalId: Uuid,
    releaseId: Uuid,
    passed: z.boolean(),
    attributeCount: z.number().int().nonnegative(),
  }),
  /**
   * §13 (P6a Task 10). **THE DIGEST, NOT THE DIFF.** The diff is on the approval row and is
   * read through `getApproval`; an event goes on a project's stream and a manifest diff can
   * name services, attributes and egress destinations (§14's redaction argument, applied by
   * omission). The digest is truncated to its first 19 characters, which is enough to
   * recognise and not enough to be mistaken for the binding itself.
   */
  'release.approved': ApprovalDetail,
  /** The same detail; the reason is in the human message, in the administrator's own words. */
  'release.approval_rejected': ApprovalDetail,
} satisfies Record<EventType, z.ZodType>
