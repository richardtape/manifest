import { z } from 'zod/v4'
import { instanceKind, instanceState, type instances } from '../../db/index.js'
import { representation, Timestamp, Uuid } from '../contract/schemas.js'

export const Instance = representation(
  'Instance',
  z
    .object({
      id: Uuid.describe('The instance.'),
      environmentId: Uuid.describe('The environment it runs in.'),
      releaseId: Uuid.describe('The release it runs (`getRelease`).'),
      kind: z
        .enum(instanceKind.enumValues)
        .describe(
          'What kind of process it is; `web`, which answers requests, is the only kind the platform runs today.',
        ),
      // §11's machine, read from the database's own enum rather than restated, so a
      // state a migration adds is a state the contract names.
      state: z
        .enum(instanceState.enumValues)
        .describe(
          'Where it is in its life (§11): `provisioning` and `starting` on the way up, `healthy` when it serves, `failed` when it never did, and `destroying` then `gone` once replaced.',
        ),
      lastSeenAt: Timestamp.nullable().describe(
        'When the platform last saw it running; null before it started.',
      ),
    })
    .describe(
      'A running (or once-running) copy of a release in one environment (§11). Never its driver or handle.',
    ),
)

/** Decision 23: `driver` and `handle` are the platform's, and never leave. */
export function toInstance(row: typeof instances.$inferSelect): z.input<typeof Instance> {
  return {
    id: row.id,
    environmentId: row.environmentId,
    releaseId: row.releaseId,
    kind: row.kind,
    state: row.state,
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
  }
}
