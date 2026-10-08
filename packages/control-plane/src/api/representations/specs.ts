import { z } from 'zod/v4'
import {
  ManifestErrorSchema,
  representation,
  request,
  Uuid,
} from '../contract/schemas.js'

const CommitSha = z.string().regex(/^[0-9a-f]{40}$/)

export const Spec = representation(
  'Spec',
  z
    .object({
      appSpecId: Uuid.describe('The recorded validation this is.'),
      commitSha: CommitSha.describe('The commit whose manifest.yaml it is.'),
      spec: z
        .record(z.string(), z.unknown())
        .describe(
          'manifest.yaml v1 as parsed and validated, every default filled in. `ManifestYaml` in this document describes each field.',
        ),
    })
    .describe(
      'The project’s newest recorded validation of manifest.yaml, parsed, when it is valid — an invalid one is answered `422 SPEC_INVALID` instead. Its commit is the one a build names when it names none.',
    ),
)

export const SensitiveDiff = representation(
  'SensitiveDiff',
  z
    .object({
      sensitive: z.boolean().describe('Whether any sensitive field changed.'),
      fields: z
        .array(z.string())
        .describe(
          'Which of them changed — `services`, `auth.attributes`, `egress.allow` and so on.',
        ),
    })
    .describe(
      'Which sensitive fields this manifest changes against the project’s newest VALID one, commit by commit — so an addition and its own removal are two changes here. Whether a launched app’s production deploy needs an administrator’s approval is `sensitiveSinceApproved`, which compares with the release last approved for production.',
    ),
)

/**
 * FE-54: the production gate's own comparison, asked of a commit — what a front-end reads for
 * "needs an administrator's look". ONE schema, on both `SpecValidation` and `CommitOutcome.spec`.
 */
export const SensitiveSinceApproved = z
  .array(z.string())
  .nullable()
  .describe(
    'Which sensitive fields a release built from this commit would change against the release last approved for production — the comparison a launched app’s production deploy is held to: the resolved production configuration, blueprint defaults and the production override included, resources only when they rise. An addition and its own removal cancel here. Null when nothing has been approved for production yet (every change then goes through the first launch’s approval), and for a manifest that is not valid.',
  )

export const SpecValidation = representation(
  'SpecValidation',
  z
    .object({
      appSpecId: Uuid.describe('The validation, as recorded.'),
      commitSha: CommitSha.describe('The commit whose manifest.yaml was validated.'),
      valid: z
        .boolean()
        .describe('Whether it is valid; a build of this commit needs it to be.'),
      errors: z
        .array(ManifestErrorSchema)
        .describe('Every problem, each with its path and code; empty when `valid`.'),
      warnings: z
        .array(ManifestErrorSchema)
        .describe(
          'What the validation says WITHOUT refusing — a field validated and recorded but not enforced yet (`SPEC_FIELD_NOT_ENFORCED`). Never a reason `valid` is false; empty for a manifest that did not parse. Show them where the errors are shown.',
        ),
      sensitiveDiff: SensitiveDiff,
      sensitiveSinceApproved: SensitiveSinceApproved,
    })
    .describe(
      'One validation of manifest.yaml at one commit, recorded — valid or not — and announced as `spec.validated`.',
    ),
)

export const ValidateSpecRequest = request(
  'ValidateSpecRequest',
  z
    .strictObject({
      commitSha: CommitSha.optional().describe('Defaults to the repository’s HEAD.'),
    })
    .describe('Which commit’s manifest.yaml to validate; `{}` validates `main`’s head.'),
)
