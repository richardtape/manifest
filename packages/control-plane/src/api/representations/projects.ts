import { z } from 'zod/v4'
import type { ProjectView, StoredAudience } from '../../projects/index.js'
import { representation, request, Timestamp, Uuid } from '../contract/schemas.js'
import { Environment } from './environments.js'
import { LONE_SURROGATE } from './source.js'
import { SpecValidation } from './specs.js'

/**
 * A control character — `\p{Cc}`: C0, DEL and C1 — refused rather than stripped: a name a person
 * typed with one is a paste gone wrong. The class a commit message refuses (`messageProblems` in
 * `source.ts`), WHOLE: a message may carry a line break and a tab, and a name, which is one line
 * of a heading, carries neither. AND, since the sitting's review (its Minor 1, re-graded): the
 * line and paragraph separators (`\p{Zl}`, `\p{Zp}`), which break a line as surely as `\n`, and
 * the bidirectional marks, embeddings, overrides and isolates, which reorder the sentence a name
 * is read in — `project.renamed`'s, in its owner's activity.
 */
const CONTROL = /[\p{Cc}\p{Zl}\p{Zp}\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u

/** Something to SEE: a letter, a digit, punctuation or a symbol — so no name renders blank. */
const VISIBLE = /[\p{L}\p{N}\p{P}\p{S}]/u

/**
 * WHAT PEOPLE CALL A PROJECT (§6 as Spec action 4 amended it; the front-end enablement plan's
 * Task 6, Decision 13). Trimmed, then 1 to 80 characters of well-formed text with no control
 * character. It never reaches a hostname or anything else §23 derives: the slug does.
 */
export const ProjectName = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine(
    (s) => !CONTROL.test(s) && !LONE_SURROGATE.test(s) && VISIBLE.test(s),
    'a name is one line of visible text: no control character, tab, line or paragraph separator, bidirectional mark or lone surrogate',
  )
  .describe(
    'What people call the project — text of 1 to 80 characters, trimmed, on one line, with something visible in it; no control character, line separator or bidirectional mark. Never part of an address: the slug is.',
  )

export const UserSummary = representation(
  'UserSummary',
  z
    .object({
      id: Uuid.describe('Their user id.'),
      displayName: z.string().describe('Their name, as CWL gave it.'),
    })
    .describe('A person, by name.'),
)

/** §24 D29: who the app is for, asked of a human at creation (Task 11 writes it). */
export const Audience = representation(
  'Audience',
  z
    .object({
      scale: z
        .enum(['solo', 'class', 'large_course', 'public'])
        .describe('§24: how many people the app is for.'),
      burst: z
        .enum(['steady', 'synchronised'])
        .describe(
          '§24: whether they arrive steadily, or all at once — a class starting a lab together.',
        ),
      justification: z
        .string()
        .nullable()
        .describe('Why, in the owner’s words; null when none was given.'),
      setBy: Uuid.describe('Who answered.'),
      setAt: Timestamp.describe('When they answered.'),
    })
    .describe(
      'Who the app is for, as its owner answered at creation (§24, D29). A large or public audience adds a load rehearsal to the launch checklist.',
    ),
)

/**
 * WHERE THE CODE LIVES (the D5 plan's Task 12, Decision 15) — the authoring brief's §3.1 gap —
 * and whether `main` is protected there, recorded honestly where the host would not (Decision 13).
 */
export const RepositoryLink = representation(
  'RepositoryLink',
  z
    .object({
      provider: z
        .enum(['local', 'github'])
        .describe(
          'Which of D5’s drivers holds it: a repository on this machine, or GitHub.',
        ),
      fullName: z
        .string()
        .describe(
          'The slug on this machine; `<org>/<slug>` on GitHub, as GitHub names it.',
        ),
      webUrl: z
        .string()
        .nullable()
        .describe(
          'Where a person opens it; null on this machine, where a path is not an address.',
        ),
      mainProtected: z
        .boolean()
        .describe(
          'Whether a person’s force-push or deletion of `main` is refused where the code lives.',
        ),
      protectionDetail: z
        .string()
        .nullable()
        .describe(
          'The host’s own words when it would not protect `main`; null when it did.',
        ),
      visibility: z
        .enum(['private', 'public'])
        .nullable()
        .describe(
          'What Manifest last read of the repository’s visibility on GitHub: `private`, or `public` — and nothing is built from a repository last read public until a read says it is private again. Null on this machine, where a repository has no visibility, and before GitHub has been read.',
        ),
    })
    .describe(
      'Where the project’s code lives (D5), and whether `main` is protected there.',
    ),
)

export const Project = representation(
  'Project',
  z
    .object({
      id: Uuid.describe('The project — what every project-scoped path names.'),
      slug: z
        .string()
        .describe(
          'The project’s permanent identifier, and the first label of every hostname it has (§23). It never changes; `name` is what people read.',
        ),
      name: ProjectName,
      blueprint: z.string().describe('`name@major` (§25).'),
      starter: z
        .string()
        .nullable()
        .describe(
          'The starter the first commit was seeded from (§25); null for the skeleton alone.',
        ),
      owner: UserSummary,
      audience: Audience.nullable().describe(
        'Who it is for (§24); null for a project created before the question was asked.',
      ),
      createdAt: Timestamp.describe('When it was created.'),
      launchedAt: Timestamp.nullable().describe(
        'When it first went to production (§13 D9) — null until then; never cleared.',
      ),
      repository: RepositoryLink,
      environments: z
        .array(Environment)
        .optional()
        .describe('Present with `?expand=environments` (D23.1).'),
    })
    .describe(
      'A project: one app, its code, its three environments and who works on it (§6).',
    ),
)

export const ProjectList = representation(
  'ProjectList',
  z
    .array(Project)
    .describe(
      'Every project the caller is a member of — every project, for an administrator.',
    ),
)

/** §24's two questions, as a person answers them at creation (P5a Task 11). */
export const AudienceInput = request(
  'AudienceInput',
  z
    .strictObject({
      scale: z
        .enum(['solo', 'class', 'large_course', 'public'])
        .describe('§24: how many people.'),
      burst: z
        .enum(['steady', 'synchronised'])
        .describe('§24: do they all arrive at once.'),
      justification: z
        .string()
        .max(1000)
        .optional()
        .describe(
          'Why, in a sentence or two — shown to an administrator for a large or public app.',
        ),
    })
    .describe(
      '§24’s two questions about who the app is for, answered by a person at creation.',
    ),
)

export const CreateProjectRequest = request(
  'CreateProjectRequest',
  z
    .strictObject({
      // No length bound and not §7's rule: `checkSlug`'s, so creation and GET
      // /v1/slugs/{slug} refuse a name with the same code (§23; P5a sitting 6).
      slug: z
        .string()
        .min(1)
        .describe('Checked by the same function as GET /v1/slugs/{slug} (§23).'),
      name: ProjectName.optional().describe(
        'What people call the project — `ProjectName`’s rules. The slug, when none is given; `updateProject` changes it later.',
      ),
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
    })
    .describe(
      'A new project: its slug, optionally a name people read, its blueprint, an optional starter, and who it is for.',
    ),
)

/** `PATCH /v1/projects/{projectId}` (the front-end enablement plan's Task 6) — the API's first `PATCH`. */
export const UpdateProjectRequest = request(
  'UpdateProjectRequest',
  z
    .strictObject({
      name: ProjectName,
    })
    .describe(
      'What to change about a project. Only its name can change; its slug never does (§23, D26).',
    ),
)

export const CreatedProject = representation(
  'CreatedProject',
  Project.extend({
    environments: z
      .array(Environment)
      .describe('Its three environments, none deployed yet.'),
    spec: SpecValidation,
  }).describe(
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
    name: view.project.name,
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
    repository: view.repository,
    ...(environments === undefined ? {} : { environments }),
  }
}
