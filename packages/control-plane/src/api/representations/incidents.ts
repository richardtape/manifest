import { z } from 'zod/v4'
import type { Incident as IncidentRow } from '../../observability/index.js'
import { representation, Timestamp, Uuid } from '../contract/schemas.js'

export const Incident = representation(
  'Incident',
  z
    .object({
      id: Uuid.describe('The Incident.'),
      instanceId: Uuid.describe('The instance that failed.'),
      releaseId: Uuid.describe('The release it ran (`getRelease`).'),
      exitReason: z
        .string()
        .describe('How it ended — its exit, or that it never answered its health check.'),
      logTail: z
        .string()
        .describe('The last 200 lines the app printed, redacted at capture.'),
      failedCheck: z
        .string()
        .describe('Which check the platform ran and what it got back.'),
      diffSinceHealthy: z
        .string()
        .describe(
          'What changed in manifest.yaml since the last release that was healthy here — often the cause.',
        ),
      createdAt: Timestamp.describe('When it was recorded.'),
      prompt: z
        .string()
        .describe(
          'Shaped to be handed straight to an agent as a repair request — except a `confidential` project’s staging or production Incident while its building agent may use the capable model: it carries the log tail, which a delegated token is refused (`INCIDENT_LOG_CONFIDENTIAL`), so show it to the person and never hand it to a model.',
        ),
    })
    .describe(
      'A failed deploy, as the platform records it: how it ended, what the platform checked, what the app printed, and what changed since it last worked.',
    ),
)

export const IncidentList = representation(
  'IncidentList',
  z
    .object({
      environmentId: Uuid.describe('The environment.'),
      incidents: z.array(Incident).describe('Newest first.'),
    })
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
