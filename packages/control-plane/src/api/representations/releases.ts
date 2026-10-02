import { z } from 'zod/v4'
import type {
  approvalPreviews,
  approvalRequests,
  approvals,
  builds,
  releases,
} from '../../db/index.js'
import { REVIEW_STATES } from '../../launch/index.js'
import type { ResolvedConfigSet } from '../../releases/index.js'
import type { ScanSummary as DriverScanSummary } from '../../runtime/index.js'
import { SENSITIVE_FIELDS, type SensitiveField } from '../../spec/index.js'
import { representation, request, Timestamp, Uuid } from '../contract/schemas.js'
import { ScanSummary } from './builds.js'

const ReleaseConfig = z
  .object({
    port: z.number().int().describe('The port the app listens on.'),
    health: z.string().describe('The path its health check asks.'),
    resources: z
      .object({
        cpu: z.number().describe('CPU cores.'),
        memory: z.string().describe('Memory, as `512Mi`.'),
        pids: z.number().int().describe('The most processes and threads at once.'),
        disk: z.string().describe('Disk, as `2Gi`.'),
      })
      .describe(
        'What it may use in this environment — the blueprint’s defaults, overridden by manifest.yaml.',
      ),
    services: z
      .array(
        z.object({
          type: z.string().describe('The service type.'),
          version: z.string().describe('Its version.'),
          name: z.string().describe('The app’s name for it.'),
        }),
      )
      .describe('The backing services bound to it.'),
    egressAllow: z
      .array(z.string())
      .describe('The hostnames it may reach outside the platform.'),
    classification: z.string().describe('Its data classification (D17).'),
    auth: z
      .object({
        provider: z
          .enum(['cwl', 'none'])
          .describe('Whether it signs people in with CWL.'),
        attributes: z.array(z.string()).describe('The CWL attributes it receives.'),
      })
      .describe('Its sign-in (§9).'),
    ai: z
      .object({ models: z.array(z.string()).describe('The logical models it may call.') })
      .describe('Its AI (§10).'),
    envNames: z
      .array(z.string())
      .describe('The names of the variables the app declares — never their values.'),
  })
  .describe('One environment’s view of the release, frozen when it was made (§13).')

export const Release = representation(
  'Release',
  z
    .object({
      id: Uuid.describe('The release — what `deploy` names.'),
      projectId: Uuid.describe('Its project.'),
      buildId: Uuid.describe('The build it froze.'),
      appSpecId: Uuid.describe(
        'The validation of manifest.yaml it froze — its build’s commit’s.',
      ),
      imageDigest: z.string().describe('What an approval binds to (§13).'),
      summary: z
        .string()
        .nullable()
        .describe('What it changes, in its author’s words; null when none was given.'),
      createdBy: Uuid.describe('Who made it.'),
      createdAt: Timestamp.describe('When it was made.'),
      scan: ScanSummary.nullable().describe(
        '§12: its build’s scan, recorded on the Release.',
      ),
      config: z
        .object({
          sandbox: ReleaseConfig,
          staging: ReleaseConfig,
          production: ReleaseConfig,
        })
        .describe('What it runs as in each environment, resolved when it was made.'),
    })
    .describe(
      'Immutable: a build, a spec and the configuration resolved for every environment (§13).',
    ),
)
export const ReleaseList = representation(
  'ReleaseList',
  z.array(Release).describe('A project’s newest releases, newest first.'),
)

export const CreateReleaseRequest = request(
  'CreateReleaseRequest',
  z
    .strictObject({
      buildId: z.uuid().describe('A build that succeeded (`listBuilds`).'),
      summary: z
        .string()
        .max(500)
        .optional()
        .describe('What this release changes, for the people who read it.'),
    })
    .describe('The build to freeze into a release, with a line saying what it changes.'),
)
export const DeployRequest = request(
  'DeployRequest',
  z
    .strictObject({
      releaseId: z
        .uuid()
        .describe('The release to deploy to the environment in the path.'),
    })
    .describe('Which release to deploy.'),
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
      changes: z
        .array(
          z.object({
            path: z
              .string()
              .describe(
                'Where, in manifest.yaml’s own vocabulary — the file an agent edits.',
              ),
            from: z.string().describe('What it was, as a string.'),
            to: z.string().describe('What it is now.'),
            summary: z.string().describe('One clause a faculty member can read.'),
            added: z
              .array(z.string())
              .optional()
              .describe(
                'For a set-valued field only (`auth.attributes`, `egress.allow`, `ai.models`, `services`, `env`): what this change added, sorted — members of the set, or the names of services and variables. Absent for any other field, and absent from a record taken before the field existed.',
              ),
            removed: z
              .array(z.string())
              .optional()
              .describe(
                'For a set-valued field only: what this change removed, sorted — what the app no longer has. Absent exactly when `added` is.',
              ),
          }),
        )
        .describe(
          'Every change to manifest.yaml since the release it is compared with, in the file’s own vocabulary.',
        ),
      services: z
        .array(z.string())
        .describe('`type@version`, sorted — what this release asks the platform to run.'),
      attributes: z
        .array(z.string())
        .describe('The CWL attributes this release requests, sorted (§7).'),
      resources: z
        .object({
          cpu: z.number().nullable().describe('CPU cores; null when no limit is set.'),
          memory: z.string().nullable().describe('Memory; null when no limit is set.'),
          disk: z.string().nullable().describe('Disk; null when no limit is set.'),
          pids: z
            .number()
            .int()
            .nullable()
            .describe('Processes and threads; null when no limit is set.'),
        })
        .describe('The production limits this release would run under.'),
      summary: z
        .string()
        .nullable()
        .describe(
          'The AI-written plain-English summary of what changed. **Null is a state, not an error**: an approval gate that fails closed on a language model being down is an outage, not a control. `summarySource` says why.',
        ),
      summarySource: z
        .enum([
          'llm',
          'unavailable',
          'no-previous-release',
          'no-changes',
          'withheld',
          'not-modelled',
        ])
        .describe(
          '`llm`: the model wrote it. `unavailable`: it could not be produced, and the diff beside it is the control. `no-previous-release`: this is a first launch, so there is nothing to diff. `no-changes`: nothing in manifest.yaml changed, and the summary is the platform’s fixed sentence — no model wrote it. `withheld`: the model answered, and its answer broke the schema it was given or stated a decision, so it is not shown — `summaryWithheldBecause` names the rule, and the diff, the security notes and the reviewer’s verdict are the record. `not-modelled`: every change is one no model describes — a change to the CWL attributes, whose change line is the record — so no model was asked; this is by design, not an outage.',
        ),
      summaryWithheldBecause: z
        .string()
        .nullable()
        .describe(
          'Which rule a `withheld` answer broke, in the platform’s words — never the model’s text, which could carry an app’s own words. Null for every other `summarySource`.',
        ),
      summaryExposures: z
        .array(
          z.object({
            path: z
              .string()
              .describe('The change it is about — one of `changes`’ own paths.'),
            sentence: z
              .string()
              .describe('What that change could expose, in the model’s words.'),
          }),
        )
        .nullable()
        .describe(
          'One sentence per change, in `changes`’ order, written by a language model: what that change could expose. **Never for a change to `auth.attributes`**: a model read those wrong — a removed attribute as one the app now receives, `sn` as a student number — so the change line alone is the record, and such a change has no entry here. The model is given the changes and the security notes only — never the verdict — and fills a schema with no place for one. The change lines are the record; these are the model’s reading of them, and a reading can get a fact wrong. Null unless `summarySource` is `llm`, and for a record made before it existed, whose `summary` is one string.',
        ),
      baselineReleaseId: Uuid.nullable().describe(
        'The last approved release this one was compared with (§13 D9.2) — null for a first launch, and for a record made before subsequent releases were compared.',
      ),
      sensitiveFields: z
        .array(z.enum(SENSITIVE_FIELDS))
        .describe(
          'Which of §7’s sensitive fields changed since that release — what re-escalated it to an administrator. Empty for a first launch.',
        ),
      security: z
        .array(
          z.object({
            field: z
              .enum(SENSITIVE_FIELDS)
              .describe('One of §7’s sensitive fields that changed.'),
            note: z.string().describe('What it means for security and privacy.'),
          }),
        )
        .describe(
          'What each changed field means for security and privacy, in the platform’s own words — present whether or not the model answered.',
        ),
      coverage: z
        .string()
        .nullable()
        .describe(
          'D33’s coverage limit, stated in the record: an administrator sees a first launch and a re-escalation, never a self-serve release, and nothing reviews code. Null only for a record made before it was stated.',
        ),
      review: z
        .object({
          state: z.enum(REVIEW_STATES).describe('The verdict, or `not_performed`.'),
          reviewer: z.string().describe('Which reviewer answered.'),
          detail: z.string().describe('What it said, in the platform’s words.'),
        })
        .describe(
          'The code reviewer’s verdict at decision time (D33, §15). `not_performed` until a reviewer is configured — an honest absence rather than a stub that purports to have reviewed.',
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
      id: Uuid.describe('The decision.'),
      releaseId: Uuid.describe('The release decided on.'),
      projectId: Uuid.describe('Its project.'),
      decision: z
        .enum(['approved', 'rejected'])
        .describe(
          'What the administrator decided; a rejection is final for this release.',
        ),
      decidedBy: Uuid.describe('Who decided.'),
      decidedByName: z
        .string()
        .describe(
          'The display name of the person who decided — the owner meets a decision before anyone else, and a user id tells them nothing.',
        ),
      decidedAt: Timestamp.describe('When.'),
      imageDigest: z.string().describe('What this approval binds to (§13).'),
      reason: z
        .string()
        .nullable()
        .describe(
          'Required on a rejection: a refusal with no words is one nobody can act on (D23.7).',
        ),
      diff: ApprovalDiff,
      previewId: Uuid.nullable().describe(
        'The stored preview the administrator read, whose diff this record COPIES. Null only for a decision made before previews existed.',
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
      id: Uuid.describe(
        'The preview — what `approveRelease` and `rejectRelease` name as `previewId`.',
      ),
      releaseId: Uuid.describe('The release it is of.'),
      projectId: Uuid.describe('Its project.'),
      createdBy: Uuid.describe('Who took it.'),
      createdByName: z.string().describe('Who took it, by name.'),
      createdAt: Timestamp.describe('When it was taken.'),
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

/**
 * AN OWNER'S REQUEST THAT AN ADMINISTRATOR SIGN OFF THE RELEASE SERVING STAGING (Spec action 5; the
 * launch path plan's Task 12, FE-25). **The note is not in it**: the asker's words are for
 * administrators, in the queue, and nowhere else. PUBLISHED TEXT: no section, decision or plan numbers.
 */
export const ApprovalRequest = representation(
  'ApprovalRequest',
  z
    .object({
      id: Uuid.describe('The request.'),
      releaseId: Uuid.describe(
        'The release an administrator is asked to approve for production — the one serving staging when it was asked.',
      ),
      projectId: Uuid.describe('Its project.'),
      requestedBy: z
        .object({
          id: Uuid.describe('Their user id.'),
          displayName: z.string().describe('Their name.'),
        })
        .describe('Who asked: the person — also when an agent asked on their token.'),
      viaToken: z
        .object({
          id: Uuid.describe('The token.'),
          name: z.string().describe('Its name, as its person gave it.'),
        })
        .nullable()
        .describe(
          'The token an agent asked on; null when the person asked in their own session.',
        ),
      createdAt: Timestamp.describe(
        'When it was asked — what the administrators’ queue measures its wait from.',
      ),
      open: z
        .boolean()
        .describe(
          'Whether it still waits on an administrator: until one approves or rejects the release, or another release serves staging.',
        ),
    })
    .describe(
      'A request that an administrator sign off the release serving staging for production. One per release: asking again answers this one.',
    ),
)

export const RequestApprovalRequest = request(
  'RequestApprovalRequest',
  z
    .strictObject({
      note: z
        .string()
        .trim()
        .max(500)
        .optional()
        .describe(
          'Anything the administrators should know — a date the app is needed by, say. Shown to administrators in their queue, and to nobody else; never in an event.',
        ),
    })
    .describe('Asking an administrator to sign off the release serving staging.'),
)

export function toApprovalRequest(
  row: typeof approvalRequests.$inferSelect,
  requestedBy: { id: string; displayName: string },
  viaToken: { id: string; name: string } | null,
  open: boolean,
): z.input<typeof ApprovalRequest> {
  return {
    id: row.id,
    releaseId: row.releaseId,
    projectId: row.projectId,
    requestedBy,
    viaToken,
    createdAt: row.createdAt.toISOString(),
    open,
  }
}

export const ApproveReleaseRequest = request(
  'ApproveReleaseRequest',
  z
    .strictObject({
      reason: z
        .string()
        .max(2000)
        .optional()
        .describe('Why, in the administrator’s words; optional on an approval.'),
      previewId: PreviewId,
    })
    .describe('An administrator’s approval, naming the preview they read.'),
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
  z
    .strictObject({
      reason: z
        .string()
        .trim()
        .min(1)
        .max(2000)
        .describe(
          'Why, in the administrator’s words — required: a refusal with no words is one nobody can act on.',
        ),
      previewId: PreviewId,
    })
    .describe(
      'An administrator’s rejection, naming the preview they read. It is final for the release.',
    ),
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
    // The D5 plan's Task 13, DEFAULTED for a row written before it (P6b's four keys, below,
    // for the same reason and in the same place).
    summaryWithheldBecause: diff.summaryWithheldBecause ?? null,
    summaryExposures: diff.exposures ?? null,
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
