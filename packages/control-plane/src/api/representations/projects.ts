import { z } from 'zod/v4'
import type { ProjectView, StoredAudience } from '../../projects/index.js'
import { representation, request, Timestamp, Uuid } from '../contract/schemas.js'
import { Environment } from './environments.js'
import { SpecValidation } from './specs.js'

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
    starter: z
      .string()
      .nullable()
      .describe(
        'The starter the first commit was seeded from (§25); null for the skeleton alone.',
      ),
    owner: UserSummary,
    audience: Audience.nullable(),
    createdAt: Timestamp,
    launchedAt: Timestamp.nullable().describe(
      'When it first went to production (§13 D9) — null until then; never cleared.',
    ),
    environments: z
      .array(Environment)
      .optional()
      .describe('Present with `?expand=environments` (D23.1).'),
  }),
)

export const ProjectList = representation('ProjectList', z.array(Project))

/** §24's two questions, as a person answers them at creation (P5a Task 11). */
export const AudienceInput = request(
  'AudienceInput',
  z.strictObject({
    scale: z
      .enum(['solo', 'class', 'large_course', 'public'])
      .describe('§24: how many people.'),
    burst: z
      .enum(['steady', 'synchronised'])
      .describe('§24: do they all arrive at once.'),
    justification: z.string().max(1000).optional(),
  }),
)

export const CreateProjectRequest = request(
  'CreateProjectRequest',
  z.strictObject({
    // No length bound and not §7's rule: `checkSlug`'s, so creation and GET
    // /v1/slugs/{slug} refuse a name with the same code (§23; P5a sitting 6).
    slug: z
      .string()
      .min(1)
      .describe('Checked by the same function as GET /v1/slugs/{slug} (§23).'),
    blueprint: z.string().min(1).describe('`name@major`, from GET /v1/blueprints.'),
    starter: z
      .string()
      .min(1)
      .optional()
      .describe(
        'One the blueprint offers. Without one: the skeleton and a minimal manifest.',
      ),
    // Registered, and used as is: a `.describe()` copy would be a second, unregistered schema.
    audience: AudienceInput,
  }),
)

export const CreatedProject = representation(
  'CreatedProject',
  Project.extend({ environments: z.array(Environment), spec: SpecValidation }).describe(
    '§22 steps 2–3: the project, its environments, and the validation of the manifest its first commit carries.',
  ),
)

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
    starter: view.project.starter,
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
    launchedAt: view.project.launchedAt?.toISOString() ?? null,
    ...(environments === undefined ? {} : { environments }),
  }
}
