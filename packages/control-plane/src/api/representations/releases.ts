import { z } from 'zod/v4'
import type { approvalPreviews, approvals, builds, releases } from '../../db/index.js'
import { REVIEW_STATES } from '../../launch/index.js'
import type { ResolvedConfigSet } from '../../releases/index.js'
import type { ScanSummary as DriverScanSummary } from '../../runtime/index.js'
import { SENSITIVE_FIELDS, type SensitiveField } from '../../spec/index.js'
import { representation, request, Timestamp, Uuid } from '../contract/schemas.js'
import { ScanSummary } from './builds.js'

const ReleaseConfig = z
  .object({
    port: z.number().int(),
    health: z.string(),
    resources: z.object({
      cpu: z.number(),
      memory: z.string(),
      pids: z.number().int(),
      disk: z.string(),
    }),
    services: z.array(
      z.object({ type: z.string(), version: z.string(), name: z.string() }),
    ),
    egressAllow: z.array(z.string()),
    classification: z.string(),
    auth: z.object({
      provider: z.enum(['cwl', 'none']),
      attributes: z.array(z.string()),
    }),
    ai: z.object({ models: z.array(z.string()) }),
    envNames: z
      .array(z.string())
      .describe('The names the app declares — never their values (P5a Decision 22).'),
  })
  .describe('One environment’s view of the release, frozen when it was made (§13).')

export const Release = representation(
  'Release',
  z
    .object({
      id: Uuid,
      projectId: Uuid,
      buildId: Uuid,
      appSpecId: Uuid,
      imageDigest: z.string().describe('What an approval binds to (§13).'),
      summary: z.string().nullable(),
      createdBy: Uuid,
      createdAt: Timestamp,
      scan: ScanSummary.nullable().describe(
        '§12: its build’s scan, recorded on the Release.',
      ),
      config: z.object({
        sandbox: ReleaseConfig,
        staging: ReleaseConfig,
        production: ReleaseConfig,
      }),
    })
    .describe(
      'Immutable: a build, a spec and the configuration resolved for every environment (§13).',
    ),
)
export const ReleaseList = representation('ReleaseList', z.array(Release))

export const CreateReleaseRequest = request(
  'CreateReleaseRequest',
  z.strictObject({ buildId: z.uuid(), summary: z.string().max(500).optional() }),
)
export const DeployRequest = request(
  'DeployRequest',
  z.strictObject({ releaseId: z.uuid() }),
)

export function toRelease(
  row: typeof releases.$inferSelect,
  build: typeof builds.$inferSelect,
): z.input<typeof Release> {
  const resolved = row.resolvedConfig as ResolvedConfigSet
  const configOf = (kind: keyof ResolvedConfigSet) => {
    const c = resolved[kind]
    return {
      port: c.port,
      health: c.health,
      resources: c.resources,
      services: c.services.map((s) => ({
        type: s.type,
        version: s.version,
        name: s.name,
      })),
      egressAllow: c.egressAllow,
      classification: c.classification,
      auth: { provider: c.auth.provider, attributes: [...c.auth.attributes] },
      // `?.` — a release frozen before ResolvedConfig.ai existed has none (P4b pre-flight 64).
      ai: { models: [...(c.ai?.models ?? [])] },
      envNames: c.env.map((e) => e.name),
    }
  }
  return {
    id: row.id,
    projectId: row.projectId,
    buildId: row.buildId,
    appSpecId: row.appSpecId,
    // The COLUMN is nullable and a release's build never is: `createRelease` refuses a
    // build that is not `succeeded` with a digest (RELEASE_BUILD_NOT_DEPLOYABLE), so this
    // branch is unreachable. It is here for `tsc`, and it is `''` rather than a plausible
    // `sha256:…` so that a release that somehow reached it is obviously wrong to a reader
    // rather than quietly wrong to an approver — an approval binds to this value (§13).
    imageDigest: build.imageDigest ?? '',
    summary: row.summary,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    scan: (build.scan as DriverScanSummary | null) ?? null,
    config: {
      sandbox: configOf('sandbox'),
      staging: configOf('staging'),
      production: configOf('production'),
    },
  }
}

/**
 * §13's `diff_snapshot`: what the administrator actually READ at the moment they decided.
 *
 * **RENDERED AND STORED, NEVER RECOMPUTED** (Decision 6). §13 asks for "the exact diff
 * shown at decision time"; a diff recomputed later against a changed spec is a different
 * claim about a different thing, and the record exists precisely to be non-repudiable.
 */
export const ApprovalDiff = representation(
  'ApprovalDiff',
  z
    .object({
      imageDigest: z
        .string()
        .describe('The image this approval binds to — the same value as the approval’s.'),
      changes: z.array(
        z.object({
          path: z
            .string()
            .describe(
              'Where, in manifest.yaml’s own vocabulary — the file an agent edits.',
            ),
          from: z.string(),
          to: z.string(),
          summary: z.string().describe('One clause a faculty member can read.'),
        }),
      ),
      services: z
        .array(z.string())
        .describe('`type@version`, sorted — what this release asks the platform to run.'),
      attributes: z
        .array(z.string())
        .describe('The CWL attributes this release requests, sorted (§7).'),
      resources: z
        .object({
          cpu: z.number().nullable(),
          memory: z.string().nullable(),
          disk: z.string().nullable(),
          pids: z.number().int().nullable(),
        })
        .describe('The production limits this release would run under.'),
      summary: z
        .string()
        .nullable()
        .describe(
          'The AI-written plain-English summary of what changed. **Null is a state, not an error** (Decision 7): an approval gate that fails closed on a language model being down is an outage, not a control. `summarySource` says why.',
        ),
      summarySource: z
        .enum(['llm', 'unavailable', 'no-previous-release', 'no-changes'])
        .describe(
          '`llm`: the model wrote it. `unavailable`: it could not be produced, and the diff beside it is the control. `no-previous-release`: this is a first launch, so there is nothing to diff. `no-changes`: nothing in manifest.yaml changed, and the summary is the platform’s fixed sentence — no model wrote it.',
        ),
      baselineReleaseId: Uuid.nullable().describe(
        'The last approved release this one was compared with (§13 D9.2) — null for a first launch, and for a record made before P6b.',
      ),
      sensitiveFields: z
        .array(z.enum(SENSITIVE_FIELDS))
        .describe(
          'Which of §7’s sensitive fields changed since that release — what re-escalated it to an administrator. Empty for a first launch.',
        ),
      security: z
        .array(z.object({ field: z.enum(SENSITIVE_FIELDS), note: z.string() }))
        .describe(
          'R4(d): what each changed field means for security and privacy, in the platform’s own words — present whether or not the model answered.',
        ),
      coverage: z
        .string()
        .nullable()
        .describe(
          'D33’s coverage limit, stated in the record: an administrator sees a first launch and a re-escalation, never a self-serve release, and nothing reviews code. Null only for a record made before P6b.',
        ),
      review: z
        .object({
          state: z.enum(REVIEW_STATES),
          reviewer: z.string(),
          detail: z.string(),
        })
        .describe(
          'R4 (D33, §15): the code reviewer’s verdict at decision time. `not_performed` until a reviewer is configured — an honest absence rather than a stub that purports to have reviewed.',
        ),
    })
    .describe('The exact diff shown at decision time (§13).'),
)

/**
 * §6's `Approval`, and §13's *Integrity of the gate*: "a non-repudiable record: actor,
 * timestamp, and the exact diff shown at decision time."
 *
 * **IT CARRIES THE DIGEST, WHICH IS THE BINDING.** §13: "Binding to a tag would let a later
 * push silently replace approved content." A rebuild produces a new digest, and a new digest
 * has no approval (Decision 11) — which the launch checklist says in words rather than
 * reverting to its generic unmet text.
 */
export const Approval = representation(
  'Approval',
  z
    .object({
      id: Uuid,
      releaseId: Uuid,
      projectId: Uuid,
      decision: z.enum(['approved', 'rejected']),
      decidedBy: Uuid,
      decidedByName: z
        .string()
        .describe(
          'The display name of the person who decided — the owner meets a decision before anyone else, and a user id tells them nothing (P6b Decision 18).',
        ),
      decidedAt: Timestamp,
      imageDigest: z.string().describe('What this approval binds to (§13).'),
      reason: z
        .string()
        .nullable()
        .describe(
          'Required on a rejection: a refusal with no words is one nobody can act on (D23.7).',
        ),
      diff: ApprovalDiff,
      previewId: Uuid.nullable().describe(
        'The stored preview the administrator read, whose diff this record COPIES (P6b Task 9). Null only for a decision made before previews existed.',
      ),
    })
    .describe('One decision about one release, kept for ever (§13).'),
)

/**
 * WHAT AN ADMINISTRATOR READS BEFORE DECIDING (Rich, 2026-09-22; P6b Decision 10), stored so
 * the decision can name it and the record can copy it. **Its `diff` IS an `ApprovalDiff`** —
 * the same representation, so the preview and the record cannot read differently.
 */
export const ApprovalPreview = representation(
  'ApprovalPreview',
  z
    .object({
      id: Uuid,
      releaseId: Uuid,
      projectId: Uuid,
      createdBy: Uuid,
      createdByName: z.string().describe('Who took it (P6b Decision 18).'),
      createdAt: Timestamp,
      expiresAt: Timestamp.describe(
        'Thirty minutes after it was taken. A decision naming it after this is refused `APPROVAL_PREVIEW_EXPIRED`; take a new one.',
      ),
      imageDigest: z.string().describe('The digest the preview was taken over (§13).'),
      diff: ApprovalDiff,
    })
    .describe(
      '§13’s exact diff, shown BEFORE the decision: approve and reject name it, the platform recomputes its facts and refuses if they moved (`APPROVAL_PREVIEW_STALE`), and the record copies its summary and verdict rather than asking the model again.',
    ),
)

/**
 * **`previewId` IS OPTIONAL IN THE SCHEMA AND REQUIRED AT RUNTIME** (P6b Decision 15): a
 * decision naming no preview is refused `400 APPROVAL_PREVIEW_REQUIRED` — a refusal an older
 * client meets — rather than a required field that would be a breaking document change
 * (D23.8 answers one with a new path prefix).
 */
const PreviewId = z
  .uuid()
  .optional()
  .describe(
    'The preview the administrator read (`POST /v1/releases/{releaseId}/approval-preview`). Optional in this schema and REQUIRED by the operation: without it the answer is `400 APPROVAL_PREVIEW_REQUIRED`.',
  )

export const ApproveReleaseRequest = request(
  'ApproveReleaseRequest',
  z.strictObject({ reason: z.string().max(2000).optional(), previewId: PreviewId }),
)

/**
 * **`reason` IS REQUIRED HERE AND OPTIONAL ON AN APPROVAL**, and the asymmetry is the point
 * (D23.7): the database's `approvals_rejection_has_reason` CHECK is the second half of the
 * same rule.
 *
 * **`.trim()` BEFORE `.min(1)`, AND IT WAS FOUND BY A NEGATIVE CONTROL** (P6a sitting 7,
 * F3). The CHECK reads `length(trim(coalesce(reason, ''))) > 0`, so a reason made of three
 * spaces satisfies a bare `min(1)`, reaches Postgres and is refused there — and a constraint
 * violation surfacing through `mapError` is `500 INTERNAL`, a client error wearing a server
 * error's clothes. The two halves must refuse the SAME set, and the schema is the half that
 * can say `400` with a path in it. Trimming here also means the stored words are the
 * administrator's without the whitespace around them.
 */
export const RejectReleaseRequest = request(
  'RejectReleaseRequest',
  z.strictObject({ reason: z.string().trim().min(1).max(2000), previewId: PreviewId }),
)

/**
 * `decidedByName` is PASSED IN, joined by the caller from `users.display_name` — a mapper that
 * read the database would be a mapper with a query in it. **Never `.map(toApproval)`**: its
 * second parameter would receive the array index (P5b sitting 7).
 */
export function toApproval(
  row: typeof approvals.$inferSelect,
  decidedByName: string,
): z.input<typeof Approval> {
  return {
    id: row.id,
    releaseId: row.releaseId,
    projectId: row.projectId,
    decision: row.decision,
    decidedBy: row.decidedBy,
    decidedByName,
    decidedAt: row.decidedAt.toISOString(),
    imageDigest: row.imageDigest,
    reason: row.reason,
    diff: toApprovalDiff(row.diffSnapshot),
    previewId: row.previewId,
  }
}

/** A preview as its representation; `createdByName` joined by the caller, like `toApproval`. */
export function toApprovalPreview(
  row: typeof approvalPreviews.$inferSelect,
  createdByName: string,
): z.input<typeof ApprovalPreview> {
  return {
    id: row.id,
    releaseId: row.releaseId,
    projectId: row.projectId,
    createdBy: row.createdBy,
    createdByName,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    imageDigest: row.imageDigest,
    diff: toApprovalDiff(row.diffSnapshot),
  }
}

/**
 * ONE MAPPER FOR BOTH TABLES' SNAPSHOT (P6b Task 9) — the record and the preview are the same
 * representation, so they are the same code: a key defaulted for one and forgotten for the
 * other would make "the approval's diff equals the preview's" false for a reason no reader
 * would look for.
 */
function toApprovalDiff(
  diff: (typeof approvals.$inferSelect)['diffSnapshot'],
): z.input<typeof ApprovalDiff> {
  return {
    imageDigest: diff.imageDigest,
    changes: diff.changes,
    services: diff.services,
    attributes: diff.attributes,
    // The COLUMN is `Record<string, string | number | null>` — a jsonb shape that cannot
    // promise four named keys — and the representation names them, so each is read and
    // coalesced here rather than spread. A snapshot written before a key existed answers
    // `null`, which is the same thing "this release sets no limit" means.
    resources: {
      cpu: (diff.resources['cpu'] as number | null | undefined) ?? null,
      memory: (diff.resources['memory'] as string | null | undefined) ?? null,
      disk: (diff.resources['disk'] as string | null | undefined) ?? null,
      pids: (diff.resources['pids'] as number | null | undefined) ?? null,
    },
    summary: diff.summary,
    summarySource: diff.summarySource,
    review: diff.review,
    // P6b Task 8's four keys, DEFAULTED HERE for a row written before them — inside the
    // mapper's body, never as a defaulted parameter (`.map(fn)` passes the array index as
    // a second argument: P5b sitting 7).
    baselineReleaseId: diff.baselineReleaseId ?? null,
    // Written by `securityNotesFor` / `sensitiveChangeOf`, which only produce §7's names;
    // the column is `string[]` because `db/` imports nothing above it.
    sensitiveFields: (diff.sensitiveFields ?? []) as SensitiveField[],
    security: (diff.security ?? []) as { field: SensitiveField; note: string }[],
    coverage: diff.coverage ?? null,
  }
}
