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
  z.object({
    appSpecId: Uuid,
    commitSha: CommitSha,
    spec: z
      .record(z.string(), z.unknown())
      .describe(
        'manifest.yaml v1 as parsed and validated (§7). Its own JSON Schema is not published in P5a.',
      ),
  }),
)

export const SensitiveDiff = representation(
  'SensitiveDiff',
  z
    .object({ sensitive: z.boolean(), fields: z.array(z.string()) })
    .describe('D9. Reported, not yet enforced (P6).'),
)

export const SpecValidation = representation(
  'SpecValidation',
  z.object({
    appSpecId: Uuid,
    commitSha: CommitSha,
    valid: z.boolean(),
    errors: z.array(ManifestErrorSchema),
    sensitiveDiff: SensitiveDiff,
  }),
)

export const ValidateSpecRequest = request(
  'ValidateSpecRequest',
  z.strictObject({
    commitSha: CommitSha.optional().describe('Defaults to the repository’s HEAD.'),
  }),
)
