import { z } from 'zod/v4'
import { environmentKind, type environments, type instances } from '../../db/index.js'
import { representation, Uuid } from '../contract/schemas.js'
import { Instance, toInstance } from './instances.js'

export const Environment = representation(
  'Environment',
  z
    .object({
      id: Uuid.describe(
        'The environment — what `deploy`, `listIncidents` and the secrets operations name.',
      ),
      projectId: Uuid.describe('Its project.'),
      kind: z
        .enum(environmentKind.enumValues)
        .describe('Which of the three: `sandbox`, `staging` or `production`.'),
      hostname: z
        .string()
        .describe('Its hostname: `<slug>.<zone for this kind>`. Permanent.'),
      url: z
        .url()
        .describe('Where the app answers in this environment, once it is deployed.'),
      instance: Instance.nullable().describe(
        'The instance the hostname reaches. Null before any deploy.',
      ),
    })
    .describe(
      'One of a project’s three environments: where a release is deployed, and what is serving there now.',
    ),
)

export const EnvironmentList = representation(
  'EnvironmentList',
  z
    .array(Environment)
    .describe('A project’s three environments: sandbox, staging and production.'),
)

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
