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
          'manifest.yaml v1 as parsed and validated (§7), every default filled in. `ManifestYaml` in this document describes each field.',
        ),
    })
    .describe(
      'The project’s newest recorded validation of manifest.yaml, parsed (§7), when it is valid — an invalid one is answered `422 SPEC_INVALID` instead. Its commit is the one a build names when it names none.',
    ),
)

export const SensitiveDiff = representation(
  'SensitiveDiff',
  z
    .object({
      sensitive: z.boolean().describe('Whether any of §7’s sensitive fields changed.'),
      fields: z
        .array(z.string())
        .describe(
          'Which of them changed — `services`, `auth.attributes`, `egress.allow` and so on.',
        ),
    })
    .describe(
      'D9: which of §7’s sensitive fields this manifest changes against the project’s newest VALID one. Reported here, and enforced at a launched app’s production deploy, where such a change needs an administrator’s approval (§13).',
    ),
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
    })
    .describe(
      'One validation of manifest.yaml at one commit (§7), recorded — valid or not — and announced as `spec.validated`.',
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
