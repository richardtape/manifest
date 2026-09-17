import { z } from 'zod/v4'
import type { ProjectView } from '../../projects/index.js'
import { representation, Timestamp, Uuid } from '../contract/schemas.js'
import { Environment } from './environments.js'

export const UserSummary = representation(
  'UserSummary',
  z.object({ id: Uuid, displayName: z.string() }),
)

/** §24 D29: who the app is for, asked of a human at creation (Task 11 writes it). */
export const Audience = representation(
  'Audience',
  z.object({
    scale: z.enum(['solo', 'class', 'large_course', 'public']),
    burst: z.enum(['steady', 'synchronised']),
    justification: z.string().nullable(),
    setBy: Uuid,
    setAt: Timestamp,
  }),
)

export const Project = representation(
  'Project',
  z.object({
    id: Uuid,
    slug: z
      .string()
      .describe(
        'The project’s name, and the first label of every hostname it has (§23).',
      ),
    blueprint: z.string().describe('`name@major` (§25).'),
    owner: UserSummary,
    audience: Audience.nullable(),
    createdAt: Timestamp,
    environments: z
      .array(Environment)
      .optional()
      .describe('Present with `?expand=environments` (D23.1).'),
  }),
)

export const ProjectList = representation('ProjectList', z.array(Project))

/** `projects.audience` as Task 11 stores it — snake_case, like every other jsonb column. */
interface StoredAudience {
  scale: 'solo' | 'class' | 'large_course' | 'public'
  burst: 'steady' | 'synchronised'
  justification: string | null
  set_by: string
  set_at: string
}

/**
 * `quota`, `visibility`, `published`, `forkedFrom` and `ownerId` are the platform's, and
 * a mapper that forgot one would still not leak it: the route parses this answer through
 * `Project`, which strips what it does not name (Decision 2).
 */
export function toProject(
  view: ProjectView,
  environments?: z.input<typeof Environment>[],
): z.input<typeof Project> {
  const audience = view.project.audience as StoredAudience | null
  return {
    id: view.project.id,
    slug: view.project.slug,
    blueprint: view.project.blueprintRef,
    owner: view.owner,
    audience:
      audience === null
        ? null
        : {
            scale: audience.scale,
            burst: audience.burst,
            justification: audience.justification,
            setBy: audience.set_by,
            setAt: audience.set_at,
          },
    createdAt: view.project.createdAt.toISOString(),
    ...(environments === undefined ? {} : { environments }),
  }
}
