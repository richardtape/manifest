import { z } from 'zod/v4'
import { representation, Uuid } from '../contract/schemas.js'

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
