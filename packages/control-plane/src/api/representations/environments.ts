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
        'The first of the instances the hostname reaches, oldest first (`createdAt`, then `id`) — the instance a successful `deploy` answered. Null before any deploy.',
      ),
      instances: z
        .array(Instance)
        .describe(
          'Every instance the hostname reaches, oldest first (`createdAt`, then `id`): production runs as many as its audience needs — one for `solo`, two for `class`, three for `large_course` and `public` — and sandbox and staging one. Empty before any deploy.',
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

/** `serving` is the set the hostname reaches, in its order — `servingInstancesOf`'s answer. */
export function toEnvironment(
  row: typeof environments.$inferSelect,
  serving: readonly (typeof instances.$inferSelect)[],
): z.input<typeof Environment> {
  const first = serving[0]
  return {
    id: row.id,
    projectId: row.projectId,
    kind: row.kind,
    hostname: row.hostname,
    url: `https://${row.hostname}`,
    instance: first === undefined ? null : toInstance(first),
    instances: serving.map(toInstance),
  }
}
