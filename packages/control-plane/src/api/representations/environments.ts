import { z } from 'zod/v4'
import { environmentKind, type environments, type instances } from '../../db/index.js'
import { representation, Uuid } from '../contract/schemas.js'
import { Instance, toInstance } from './instances.js'

export const Environment = representation(
  'Environment',
  z.object({
    id: Uuid,
    projectId: Uuid,
    kind: z.enum(environmentKind.enumValues),
    hostname: z.string().describe('§23: `<slug>.<zone for this kind>`. Permanent.'),
    url: z.url(),
    instance: Instance.nullable().describe(
      'The instance the hostname reaches (§6 Route); for an app deployed before P4c, its newest instance. Null before any deploy.',
    ),
  }),
)

export const EnvironmentList = representation('EnvironmentList', z.array(Environment))

export function toEnvironment(
  row: typeof environments.$inferSelect,
  instance: typeof instances.$inferSelect | undefined,
): z.input<typeof Environment> {
  return {
    id: row.id,
    projectId: row.projectId,
    kind: row.kind,
    hostname: row.hostname,
    url: `https://${row.hostname}`,
    instance: instance === undefined ? null : toInstance(instance),
  }
}
