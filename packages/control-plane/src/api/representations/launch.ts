import { z } from 'zod/v4'
import { iamRegistrationState, privacyAssessmentState } from '../../db/index.js'
import {
  LAUNCH_ITEM_IDS,
  type IamRegistrationRow,
  type PrivacyAssessmentRow,
  type RehearsalRow,
} from '../../launch/index.js'
import { SENSITIVE_FIELDS } from '../../spec/index.js'
import { representation, request, Uuid } from '../contract/schemas.js'

export const LaunchReadinessItem = representation(
  'LaunchReadinessItem',
  z.object({
    // `launch/`'s ONE list, not a restatement of it (P6a Task 12): an id this enum lacked
    // was a `500` on the read and a checklist silently dropped from the `409` (`[M4]`).
    id: z.enum(LAUNCH_ITEM_IDS),
    title: z.string(),
    owner: z.string(),
    blocking: z
      .boolean()
      .describe(
        'Whether this item gates production. `ready` is every BLOCKING item being met; a non-blocking item is shown and never refuses a launch (D33: `code-review`).',
      ),
    state: z
      .enum(['met', 'unmet', 'not_built'])
      .describe(
        '`unmet`: this item is tracked and is not satisfied — the reason says what to do. `not_built`: Manifest does not track it yet, and `builtBy` names what builds it — a plan, or for `code-review` a tracked hardening item.',
      ),
    why: z.string(),
    builtBy: z.string().optional(),
  }),
)

export const LaunchReadiness = representation(
  'LaunchReadiness',
  z
    .object({
      projectId: Uuid,
      launched: z
        .boolean()
        .describe(
          'Which of D9’s two clauses this is: false, the first launch’s checklist; true, a launched app’s, where a release goes to production self-serve unless it changes a sensitive field (§13).',
        ),
      ready: z.boolean(),
      candidateReleaseId: Uuid.nullable(),
      baselineReleaseId: Uuid.nullable().describe(
        'The last approved release the candidate is compared with (D9.2); null before launch, or when nothing else is approved.',
      ),
      // `spec/`'s ONE list, not a restatement (the rule P6a Task 12 set for item ids).
      sensitiveFields: z
        .array(z.enum(SENSITIVE_FIELDS))
        .describe(
          '§7’s fields the candidate changes since that release; empty before launch.',
        ),
      reescalated: z
        .boolean()
        .describe(
          'An administrator’s approval is what this release is waiting for — a sensitive change, not rejected, and nothing else unmet (§13 D9.2).',
        ),
      items: z.array(LaunchReadinessItem),
    })
    .describe(
      '§13’s checklist, computed from what exists — a first launch’s, or once launched the self-serve check (D9). A production deploy is refused with this exact value until every blocking item is met.',
    ),
)

/**
 * §6's `IamRegistration`, as a client reads it. **Manifest TRACKS this; UBC IAM produces
 * it** (D19, R1) — so every field is what an administrator recorded from the ticket, not
 * something derived here. P8 generates the submission; the shape does not change when it
 * does, which is §9's whole argument for modelling the submission state now.
 */
export const IamRegistration = representation(
  'IamRegistration',
  z.object({
    id: Uuid,
    projectId: Uuid,
    entityId: z
      .string()
      .describe(
        '§9: fixed at registration and stored here rather than recomputed — which is also why a project slug is immutable after production launch.',
      ),
    acsUrl: z.string(),
    sloUrl: z.string(),
    certFingerprint: z.string().nullable(),
    certExpiresAt: z.iso
      .datetime()
      .nullable()
      .describe('D20: an unnoticed expiry silently kills login for a live course app.'),
    registeredAttributes: z
      .array(z.string())
      .describe(
        'WHAT UBC IAM ACTUALLY REGISTERED. A production build fails when a release asks for an attribute that is not in here (§7). Once registered, it changes only on a record that reaches `active` — a change UBC has not registered yet is `requestedAttributes`.',
      ),
    requestedAttributes: z
      .array(z.string())
      .nullable()
      .describe(
        'What an outstanding CHANGE REQUEST asks UBC IAM for (§9) — the registration’s own `change_requested` state is the change request. Null when none is outstanding; cleared when the registration is recorded `active` again.',
      ),
    registeredAt: z.iso
      .datetime()
      .nullable()
      .describe(
        'When UBC IAM last registered this Service Provider — set when the record reaches `active`. Null until the first time; a launched app’s releases need it (§13, D9).',
      ),
    state: z.enum(iamRegistrationState.enumValues),
    externalTicketRef: z.string().nullable(),
    updatedAt: z.iso.datetime(),
  }),
)

/** §6's `PrivacyAssessment`. Three states, and §9 names no rejection: a refused one goes back to `draft`. */
export const PrivacyAssessment = representation(
  'PrivacyAssessment',
  z.object({
    id: Uuid,
    projectId: Uuid,
    state: z.enum(privacyAssessmentState.enumValues),
    reviewer: z.string().nullable(),
    approvedAt: z.iso.datetime().nullable(),
    externalTicketRef: z.string().nullable(),
    updatedAt: z.iso.datetime(),
  }),
)

/**
 * ONE READ FOR BOTH, deliberately. Two reads would be two round trips for a console that
 * shows them together, and D23's resource orientation is about the resources a client
 * needs rather than the rows a table holds. **Either may be `null`, which is a STATE and
 * not an error**: most projects will never have either, because most never go to
 * production.
 */
export const LaunchRecords = representation(
  'LaunchRecords',
  z.object({
    projectId: Uuid,
    iamRegistration: IamRegistration.nullable(),
    privacyAssessment: PrivacyAssessment.nullable(),
  }),
)

export const RecordIamRegistrationRequest = request(
  'RecordIamRegistrationRequest',
  z.strictObject({
    entityId: z.string().min(1).max(512),
    acsUrl: z.string().min(1).max(512),
    sloUrl: z.string().min(1).max(512),
    /**
     * `.min(1)` HERE AS WELL AS IN `records.ts` AND IN THE DATABASE, and the three are not
     * redundant: this one makes the emptiness visible in the published document, so a
     * client knows before it asks. §9 measured the fail-open case — SimpleSAMLphp treats
     * an empty attribute list and a missing one identically and releases everything.
     */
    registeredAttributes: z
      .array(z.string().min(1))
      .min(1)
      .max(64)
      .describe(
        'Exactly the attributes UBC IAM registered, as the ticket lists them. Once registered, a record that does not reach `active` must repeat them unchanged.',
      ),
    requestedAttributes: z
      .array(z.string().min(1))
      .min(1)
      .max(64)
      .optional()
      .describe(
        'What a change request asks for; required when a registration goes from `active` to `change_requested`.',
      ),
    state: z
      .enum(iamRegistrationState.enumValues)
      .describe(
        'The state this record should now be in. It is reached along §9’s arrows from wherever it is — a first write into `active` is refused exactly as a later one is.',
      ),
    externalTicketRef: z.string().min(1).max(128).optional(),
    certFingerprint: z.string().min(1).max(256).optional(),
    certExpiresAt: z.iso.datetime().optional(),
  }),
)

export const RecordPrivacyAssessmentRequest = request(
  'RecordPrivacyAssessmentRequest',
  z.strictObject({
    state: z.enum(privacyAssessmentState.enumValues),
    reviewer: z.string().min(1).max(128).optional(),
    externalTicketRef: z.string().min(1).max(128).optional(),
  }),
)

/**
 * **TWO SIGNATURES, because the two callers differ in a way `tsc` should hold them to.**
 * The READ may find nothing — an absent record is a state, not an error — while a route
 * that has just written one always has a row, and a `| null` there would make the route's
 * success schema a lie the document could not express. The overloads say so; one
 * signature returning `| null` made `defineRoute` reject the handler, which is how this
 * was found rather than shipped.
 */
export function toIamRegistration(
  row: IamRegistrationRow,
): z.infer<typeof IamRegistration>
export function toIamRegistration(
  row: IamRegistrationRow | undefined,
): z.infer<typeof IamRegistration> | null
export function toIamRegistration(
  row: IamRegistrationRow | undefined,
): z.infer<typeof IamRegistration> | null {
  if (row === undefined) return null
  return {
    id: row.id,
    projectId: row.projectId,
    entityId: row.entityId,
    acsUrl: row.acsUrl,
    sloUrl: row.sloUrl,
    certFingerprint: row.certFingerprint,
    certExpiresAt: row.certExpiresAt === null ? null : row.certExpiresAt.toISOString(),
    registeredAttributes: row.registeredAttributes,
    requestedAttributes: row.requestedAttributes,
    registeredAt: row.registeredAt === null ? null : row.registeredAt.toISOString(),
    state: row.state,
    externalTicketRef: row.externalTicketRef,
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function toPrivacyAssessment(
  row: PrivacyAssessmentRow,
): z.infer<typeof PrivacyAssessment>
export function toPrivacyAssessment(
  row: PrivacyAssessmentRow | undefined,
): z.infer<typeof PrivacyAssessment> | null
export function toPrivacyAssessment(
  row: PrivacyAssessmentRow | undefined,
): z.infer<typeof PrivacyAssessment> | null {
  if (row === undefined) return null
  return {
    id: row.id,
    projectId: row.projectId,
    state: row.state,
    reviewer: row.reviewer,
    approvedAt: row.approvedAt === null ? null : row.approvedAt.toISOString(),
    externalTicketRef: row.externalTicketRef,
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * D21'S REHEARSAL, as a client reads it (R2, P6a Task 14).
 *
 * **THE EVIDENCE IS THE POINT.** §13's items are met by a measurement, so the thing a
 * person reads is what was actually observed — the instance, the listener, the status the
 * sign-in ended on and the attributes the assertion released — and never a boolean on its
 * own. §14: no assertion and no NameID, ever; attribute NAMES only.
 */
export const Rehearsal = representation(
  'Rehearsal',
  z
    .object({
      id: Uuid,
      projectId: Uuid,
      releaseId: Uuid,
      passed: z.boolean(),
      entityId: z
        .string()
        .describe(
          'The entityID the Service Provider was registered under when this ran — read off the registration, never recomputed.',
        ),
      acsUrl: z.string(),
      attributes: z
        .array(z.string())
        .describe(
          'What the registration listed. Decision 10 compares these with what the candidate release would register now.',
        ),
      evidence: z.object({
        instanceId: Uuid.nullable(),
        hostname: z.string(),
        listener: z.enum(['internal', 'public']),
        signInStatus: z
          .number()
          .int()
          .nullable()
          .describe(
            'What the app answered at its registered ACS, or null when no assertion was produced.',
          ),
        attributesReleased: z
          .array(z.string())
          .describe(
            'What the assertion ACTUALLY carried, as friendly names where the platform knows one. §9’s attribute release, measured rather than assumed.',
          ),
        reason: z.string(),
      }),
      ranAt: z.string(),
    })
    .describe(
      'A LOCAL, production-shaped rehearsal (D21 as P6a redefines it for a laptop): it proves the SHAPE of the registration and never UBC’s acceptance of it.',
    ),
)

export function toRehearsal(row: RehearsalRow): z.infer<typeof Rehearsal> {
  return {
    id: row.id,
    projectId: row.projectId,
    releaseId: row.releaseId,
    passed: row.passed,
    entityId: row.entityId,
    acsUrl: row.acsUrl,
    attributes: row.attributes,
    evidence: row.evidence,
    ranAt: row.ranAt.toISOString(),
  }
}
