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
  z
    .object({
      // `launch/`'s ONE list, not a restatement of it (P6a Task 12): an id this enum lacked
      // was a `500` on the read and a checklist silently dropped from the `409` (`[M4]`).
      id: z
        .enum(LAUNCH_ITEM_IDS)
        .describe('Which item — stable, for a client to switch on.'),
      title: z.string().describe('The item, for a person.'),
      owner: z
        .string()
        .describe(
          'Who meets it: the project’s owner, Manifest itself, or UBC recorded by an administrator.',
        ),
      blocking: z
        .boolean()
        .describe(
          'Whether this item gates production. `ready` is every BLOCKING item being met; a non-blocking item is shown and never refuses a launch (D33: `code-review`).',
        ),
      state: z
        .enum(['met', 'unmet', 'not_built'])
        .describe(
          '`met`: satisfied. `unmet`: tracked and not satisfied — `why` says what to do. `not_built`: Manifest does not track it yet, and `builtBy` says what will.',
        ),
      why: z.string().describe('Why it matters, and — when it is unmet — what meets it.'),
      builtBy: z
        .string()
        .optional()
        .describe('For a `not_built` item: what will build it. Absent otherwise.'),
    })
    .describe('One item of the launch checklist (§13), computed from what exists.'),
)

export const LaunchReadiness = representation(
  'LaunchReadiness',
  z
    .object({
      projectId: Uuid.describe('The project.'),
      launched: z
        .boolean()
        .describe(
          'Which of D9’s two clauses this is: false, the first launch’s checklist; true, a launched app’s, where a release goes to production self-serve unless it changes a sensitive field (§13).',
        ),
      ready: z
        .boolean()
        .describe(
          'Whether every blocking item is met — a production deploy is refused until it is.',
        ),
      candidateReleaseId: Uuid.nullable().describe(
        'The release serving staging — what production would run; null when nothing serves staging.',
      ),
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
      items: z.array(LaunchReadinessItem).describe('Every item, met or not.'),
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
  z
    .object({
      id: Uuid.describe('The record.'),
      projectId: Uuid.describe('Its project.'),
      entityId: z
        .string()
        .describe(
          '§9: fixed at registration and stored here rather than recomputed — which is also why a project slug is immutable after production launch.',
        ),
      acsUrl: z
        .string()
        .describe('The assertion consumer URL registered — where sign-ins are sent.'),
      sloUrl: z.string().describe('The single-logout URL registered.'),
      certFingerprint: z
        .string()
        .nullable()
        .describe(
          'The fingerprint of the signing certificate registered; null when none was recorded.',
        ),
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
      state: z
        .enum(iamRegistrationState.enumValues)
        .describe(
          'Along §9’s states: `draft`, `submitted` to UBC IAM, `active` once registered, `change_requested` while a change is with UBC IAM, and `expired`.',
        ),
      externalTicketRef: z
        .string()
        .nullable()
        .describe(
          'UBC IAM’s own reference for the request; null when none was recorded.',
        ),
      updatedAt: z.iso.datetime().describe('When the record last changed.'),
    })
    .describe(
      'What UBC IAM registered for the app’s production CWL sign-in (§9), as an administrator recorded it.',
    ),
)

/** §6's `PrivacyAssessment`. Three states, and §9 names no rejection: a refused one goes back to `draft`. */
export const PrivacyAssessment = representation(
  'PrivacyAssessment',
  z
    .object({
      id: Uuid.describe('The record.'),
      projectId: Uuid.describe('Its project.'),
      state: z
        .enum(privacyAssessmentState.enumValues)
        .describe(
          'Along §9’s states: `draft`, `submitted` to the Privacy Office, `approved`. A refused assessment goes back to `draft`.',
        ),
      reviewer: z
        .string()
        .nullable()
        .describe('Who at the Privacy Office reviewed it; null until recorded.'),
      approvedAt: z.iso
        .datetime()
        .nullable()
        .describe('When it was approved; null until it is.'),
      externalTicketRef: z
        .string()
        .nullable()
        .describe('The Privacy Office’s own reference; null when none was recorded.'),
      updatedAt: z.iso.datetime().describe('When the record last changed.'),
    })
    .describe(
      'What UBC’s Privacy Office said of the app’s privacy impact assessment (§9), as an administrator recorded it.',
    ),
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
  z
    .object({
      projectId: Uuid.describe('The project.'),
      iamRegistration: IamRegistration.nullable().describe(
        'What UBC IAM registered; null until an administrator records something.',
      ),
      privacyAssessment: PrivacyAssessment.nullable().describe(
        'What the Privacy Office said; null until an administrator records something.',
      ),
    })
    .describe('The two external records a first production launch waits on (§9).'),
)

export const RecordIamRegistrationRequest = request(
  'RecordIamRegistrationRequest',
  z
    .strictObject({
      entityId: z
        .string()
        .min(1)
        .max(512)
        .describe('The entityID UBC IAM registered — fixed once registered.'),
      acsUrl: z
        .string()
        .min(1)
        .max(512)
        .describe('The assertion consumer URL registered.'),
      sloUrl: z.string().min(1).max(512).describe('The single-logout URL registered.'),
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
      externalTicketRef: z
        .string()
        .min(1)
        .max(128)
        .optional()
        .describe('UBC IAM’s ticket reference, pasted in.'),
      certFingerprint: z
        .string()
        .min(1)
        .max(256)
        .optional()
        .describe('The fingerprint of the signing certificate registered.'),
      certExpiresAt: z.iso
        .datetime()
        .optional()
        .describe('When that certificate expires (D20).'),
    })
    .describe(
      'What UBC IAM registered for the app’s production sign-in, as an administrator records it from the ticket (§9).',
    ),
)

export const RecordPrivacyAssessmentRequest = request(
  'RecordPrivacyAssessmentRequest',
  z
    .strictObject({
      state: z
        .enum(privacyAssessmentState.enumValues)
        .describe('The state this record should now be in, reached along §9’s arrows.'),
      reviewer: z
        .string()
        .min(1)
        .max(128)
        .optional()
        .describe('Who at the Privacy Office reviewed it.'),
      externalTicketRef: z
        .string()
        .min(1)
        .max(128)
        .optional()
        .describe('The Privacy Office’s reference, pasted in.'),
    })
    .describe('What the Privacy Office said, as an administrator records it (§9).'),
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
      id: Uuid.describe('The rehearsal.'),
      projectId: Uuid.describe('Its project.'),
      releaseId: Uuid.describe(
        'The candidate release rehearsed — the one serving staging.',
      ),
      passed: z.boolean().describe('Whether a production-shaped CWL sign-in worked.'),
      entityId: z
        .string()
        .describe(
          'The entityID the Service Provider was registered under when this ran — read off the registration, never recomputed.',
        ),
      acsUrl: z.string().describe('Where the sign-in’s assertion was sent.'),
      attributes: z
        .array(z.string())
        .describe(
          'The attributes the registration listed when it ran, compared with what the candidate release would register now.',
        ),
      evidence: z
        .object({
          instanceId: Uuid.nullable().describe(
            'The production instance it deployed; null if none started.',
          ),
          hostname: z.string().describe('The hostname the sign-in went to.'),
          listener: z
            .enum(['internal', 'public'])
            .describe('Which of the edge’s listeners the app answered on (§12).'),
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
          reason: z
            .string()
            .describe('Why it passed or did not, in the platform’s words.'),
        })
        .describe('What the rehearsal saw — measured, not assumed.'),
      ranAt: z.string().describe('When it ran, ISO 8601 in UTC.'),
    })
    .describe(
      'A LOCAL, production-shaped rehearsal of the app’s CWL sign-in (D21): it proves the SHAPE of the registration, and never UBC’s acceptance of it.',
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
