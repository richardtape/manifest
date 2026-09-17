import { z } from 'zod/v4'
import type { Incident as IncidentRow } from '../../observability/index.js'
import { representation, Timestamp, Uuid } from '../contract/schemas.js'

export const Incident = representation(
  'Incident',
  z
    .object({
      id: Uuid,
      instanceId: Uuid,
      releaseId: Uuid,
      exitReason: z.string(),
      logTail: z.string().describe('The last 200 lines, redacted at capture (§14).'),
      failedCheck: z.string(),
      diffSinceHealthy: z.string(),
      createdAt: Timestamp,
      prompt: z
        .string()
        .describe('§14: shaped to be handed straight to an agent as a repair request.'),
    })
    .describe(
      'A failed deploy, as §14 records it: how it ended, what the platform checked, what the app printed, and what changed since it last worked.',
    ),
)

export const IncidentList = representation(
  'IncidentList',
  z
    .object({ environmentId: Uuid, incidents: z.array(Incident) })
    .describe('One environment’s Incidents, newest first.'),
)

export function toIncident(
  row: IncidentRow & { releaseId: string },
  prompt: string,
): z.input<typeof Incident> {
  return {
    id: row.id,
    instanceId: row.instanceId,
    releaseId: row.releaseId,
    exitReason: row.exitReason,
    logTail: row.logTail,
    failedCheck: row.failedCheck,
    diffSinceHealthy: row.diffSinceHealthy,
    createdAt: row.createdAt.toISOString(),
    prompt,
  }
}
