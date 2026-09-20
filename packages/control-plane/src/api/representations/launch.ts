import { z } from 'zod/v4'
import { iamRegistrationState, privacyAssessmentState } from '../../db/index.js'
import type { IamRegistrationRow, PrivacyAssessmentRow } from '../../launch/index.js'
import { representation, request, Uuid } from '../contract/schemas.js'

export const LaunchReadinessItem = representation(
  'LaunchReadinessItem',
  z.object({
    id: z.enum([
      'domain',
      'iam-registration',
      'privacy-assessment',
      'rehearsal',
      'scans',
      'admin-approval',
      'load-rehearsal',
    ]),
    title: z.string(),
    owner: z.string(),
    blocking: z.boolean(),
    state: z
      .enum(['met', 'unmet', 'not_built'])
      .describe(
        '`not_built`: Manifest does not track this yet; `builtBy` names the plan.',
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
      ready: z.boolean(),
      candidateReleaseId: Uuid.nullable(),
      items: z.array(LaunchReadinessItem),
    })
    .describe(
      '§13’s first-launch checklist, computed from what exists. Read-only in Phase 1; Phase 2 gates on it.',
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
        'WHAT UBC IAM ACTUALLY REGISTERED. A production build fails when a release asks for an attribute that is not in here (§7).',
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
      .describe('Exactly the attributes UBC IAM registered, as the ticket lists them.'),
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
