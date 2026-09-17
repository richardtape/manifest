import { z } from 'zod/v4'
import { instanceKind, instanceState, type instances } from '../../db/index.js'
import { representation, Timestamp, Uuid } from '../contract/schemas.js'

export const Instance = representation(
  'Instance',
  z
    .object({
      id: Uuid,
      environmentId: Uuid,
      releaseId: Uuid,
      kind: z.enum(instanceKind.enumValues),
      // §11's machine, read from the database's own enum rather than restated, so a
      // state a migration adds is a state the contract names.
      state: z.enum(instanceState.enumValues),
      lastSeenAt: Timestamp.nullable(),
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
