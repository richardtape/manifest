import { z } from 'zod'

export const SLUG = /^[a-z][a-z0-9-]{2,38}$/
export const AUTH_PATH = /^\/[A-Za-z0-9/_-]{1,64}$/
const BLUEPRINT_REF = /^[a-z][a-z0-9-]*@\d+$/
const QUANTITY = /^\d+(\.\d+)?(Mi|Gi)?$/

/** UBC's U1 levels (Information Security Standard U1, §2.1), least sensitive first (§7). */
export const LEVELS = ['low', 'medium', 'high', 'very-high'] as const
export type Level = (typeof LEVELS)[number]

/**
 * MANIFEST'S EARLIER NAMES, ALIASES FOR EVER, EACH WITH ONE FIXED MEANING (Rich, 2026-10-03, 21:48: "Keep them as
 * aliases"). An alias NEVER comes to mean anything wider: `confidential` is `very-high`, so a confidential app stays on
 * premises.
 */
export const LEVEL_ALIASES = {
  public: 'low',
  internal: 'medium',
  confidential: 'very-high',
} as const satisfies Record<string, Level>

/** Every name accepted wherever a level is — the four levels, then the three aliases. */
export const CLASSIFICATIONS = [...LEVELS, 'public', 'internal', 'confidential'] as const
export type Classification = (typeof CLASSIFICATIONS)[number]

/**
 * low < medium < high < very-high (D17) — AND EVERY ALIAS AT ITS LEVEL'S RANK (the U1 spec action's review, I6), so a read
 * that never canonicalizes still ranks a stored alias right, and the next read a change misses fails CLOSED. `levels.test.ts`
 * holds RANK[alias] === RANK[its level]: the trap is a partial edit that appends the U1 names and leaves `confidential: 2`,
 * which reads it as `high` and sends it to a commercial model.
 */
export const CLASSIFICATION_RANK: Record<Classification, number> = {
  low: 0,
  medium: 1,
  high: 2,
  'very-high': 3,
  public: 0,
  internal: 1,
  confidential: 3,
}

/** §7's level for an app that declares none (S5): `medium`, today's `internal` — the schema's default from Task 2. */
export const DEFAULT_LEVEL: Level = 'medium'

/** The level a known name means. */
export const toLevel = (name: Classification): Level =>
  Object.hasOwn(LEVEL_ALIASES, name)
    ? LEVEL_ALIASES[name as keyof typeof LEVEL_ALIASES]
    : (name as Level)

/**
 * The level a stored or written value means; `undefined` for anything that is not one of the seven names. An OWN key of
 * the rank table — never `in`, which finds `toString` (`ai/catalogue.ts`'s warning, finding 47).
 */
export const canonicalLevel = (value: unknown): Level | undefined =>
  typeof value === 'string' && Object.hasOwn(CLASSIFICATION_RANK, value)
    ? toLevel(value as Classification)
    : undefined

/** A level as a VALUE a person may copy into manifest.yaml (`very-high`), or the value as written when it is none. */
export const levelName = (value: unknown): string =>
  canonicalLevel(value) ?? String(value)

/** A level as a person READS it — U1's own "Very High Risk", so `very high`, never the hyphen — or the value as written. */
const LEVEL_WORDS: Record<Level, string> = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  'very-high': 'very high',
}
export const levelWords = (value: unknown): string => {
  const level = canonicalLevel(value)
  return level === undefined ? String(value) : LEVEL_WORDS[level]
}

/** A stored `parsed` manifest as the platform answers it (S6): `data.classification` as its level; everything else as stored. */
export function specInLevels(parsed: unknown): Record<string, unknown> {
  const spec = (parsed ?? {}) as Record<string, unknown>
  const data = spec.data as Record<string, unknown> | undefined
  const level = canonicalLevel(data?.classification)
  return data === undefined || level === undefined
    ? spec
    : { ...spec, data: { ...data, classification: level } }
}

// EVERY FIELD IS DESCRIBED (the authoring API plan's Task 9): `api/contract/document.ts`
// publishes this schema as the OpenAPI document's `ManifestYaml` component, through
// `zod-to-json-schema`, which carries each `.describe()` — so these strings are PUBLIC TEXT, §7
// in the words an agent writing manifest.yaml reads, and `docs.test.ts` holds each to that. A
// description changes no validation.
const serviceSchema = z
  .object({
    type: z
      .string()
      .min(1)
      .describe(
        'Which service: one of the platform’s catalogue, such as `mongo` or `qdrant`.',
      ),
    version: z.string().min(1).describe('The service’s version, as a string: `"7"`.'),
    name: z
      .string()
      .regex(/^[a-z][a-z0-9-]{0,30}$/)
      .describe(
        'The app’s own name for it, unique in the manifest: lower-case letters, digits and hyphens.',
      ),
  })
  .strict()
  .describe(
    'A backing service the platform runs and binds for the app, injecting its address.',
  )

const envEntrySchema = z
  .object({
    name: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]*$/)
      .describe(
        'The variable’s name: upper-case letters, digits and underscores, starting with a letter. Not one the platform sets itself.',
      ),
    value: z
      .string()
      .optional()
      .describe('Its value, written here and so in git — never a credential.'),
    secret: z
      .boolean()
      .optional()
      .describe(
        '`true` for a value held by Manifest and never in git: set it per environment with `setAppSecret`, and a deploy is refused until it is set.',
      ),
  })
  .strict()
  .refine((e) => (e.secret === true) !== (e.value !== undefined), {
    message: 'an env entry carries either a value or secret: true, never both',
  })
  .describe(
    'One environment variable the app is given. It carries EITHER a `value` OR `secret: true`, never both and never neither.',
  )

const resourcesSchema = z
  .object({
    cpu: z.number().positive().optional().describe('CPU cores: `0.5` is half of one.'),
    memory: z
      .string()
      .regex(QUANTITY)
      .optional()
      .describe('Memory, as `512Mi` or `1Gi`.'),
    pids: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        'The most processes and threads the app may run at once — a fork-bomb ceiling.',
      ),
    disk: z
      .string()
      .regex(QUANTITY)
      .optional()
      .describe('The disk the app’s volume and logs may use, as `2Gi`.'),
  })
  .strict()

// `build` is DECLARED as `z.never().optional()` rather than left to .strict()'s
// unknown-key handling. Both reject it, but only the declared field reports at
// path `runtime.build`; .strict() alone reports `unrecognized_keys` at path
// `runtime`, which is how D13's refusal would have arrived as a generic
// "unrecognized key". Task 3 maps the path to SPEC_BUILD_BLOCK_FORBIDDEN.
const runtimeSchema = z
  .object({
    port: z
      .number()
      .int()
      .min(1)
      .max(65535)
      .describe('The port the app listens on inside its container.'),
    health: z
      .string()
      .regex(AUTH_PATH)
      .default('/healthz')
      .describe(
        'The path the platform checks before an instance serves: it must answer 200. A path, never a URL.',
      ),
    command: z
      .string()
      .nullable()
      .default(null)
      .describe('Overrides the blueprint’s entrypoint; null keeps it.'),
    build: z
      .never()
      .optional()
      .describe(
        'FORBIDDEN: the Dockerfile is the blueprint’s. An app declares what it needs, never how to build it.',
      ),
  })
  .strict()
  .describe('How the app runs.')

const authSchema = z
  .object({
    provider: z
      .enum(['cwl', 'none'])
      .default('none')
      .describe('`cwl` signs people in with UBC’s CWL; `none` signs nobody in.'),
    attributes: z
      .array(z.string().min(1))
      .default([])
      .describe(
        'The CWL attributes the app receives about a signed-in person — `ubcEduCwlPuid`, `mail`, `givenName`, `sn`, `eduPersonAffiliation`. The identifier is `ubcEduCwlPuid`, never `uid`. At least one when `provider` is `cwl`.',
      ),
    callback: z
      .string()
      .regex(AUTH_PATH)
      .default('/auth/ubcshib/callback')
      .describe(
        'The PATH the identity provider posts a sign-in to — Manifest derives the origin.',
      ),
    logout: z
      .string()
      .regex(AUTH_PATH)
      .default('/auth/logout')
      .describe('The PATH single logout arrives at.'),
  })
  .strict()
  .describe('Who may use the app, and what it learns about them.')

const environmentOverrideSchema = z
  .object({
    resources: resourcesSchema
      .optional()
      .describe(
        'Replaces the top-level `resources` in this environment, field by field.',
      ),
    env: z
      .array(envEntrySchema)
      .optional()
      .describe('Adds to, or replaces by name, the top-level `env` in this environment.'),
  })
  .strict()

export const manifestSchema = z
  .object({
    manifest: z.literal(1).describe('The schema version: `1`.'),
    name: z
      .string()
      .regex(SLUG)
      .describe(
        'The project’s slug, exactly: 3 to 39 lower-case letters, digits and hyphens, starting with a letter.',
      ),
    blueprint: z
      .string()
      .regex(BLUEPRINT_REF)
      .describe(
        'The project’s blueprint and its major version, `name@major` — the project’s own pin. A commit cannot change it.',
      ),
    description: z
      .string()
      .max(500)
      .optional()
      .describe('What the app is for, in a sentence or two.'),
    runtime: runtimeSchema,
    resources: resourcesSchema
      .default({})
      .describe(
        'What the app may use. Unset fields take the blueprint’s defaults; the total is bounded by the project’s quota.',
      ),
    services: z
      .array(serviceSchema)
      .default([])
      .describe('The backing services the app needs; may be empty.'),
    auth: authSchema.default({}),
    ai: z
      .object({
        models: z
          .array(z.string().min(1))
          .default([])
          .describe(
            'The LOGICAL models the app may call — `default-chat`, `default-embed` — never a vendor’s model id. Each must be approved for `data.classification`.',
          ),
        budget: z
          .object({
            // NO DEFAULT, so an omitted budget is visible (§7 as amended on
            // 2026-09-14). `validateSpec` fills an omitted one with the project's AI
            // quota when the manifest declares a model; with `.default(0)` it parsed
            // exactly like a written 0, which is still refused.
            project_monthly_usd: z
              .number()
              .nonnegative()
              .optional()
              .describe(
                'The most the app may spend on AI in a month, in US dollars. Omitted, with models declared, it is the project’s AI quota; 0 is refused.',
              ),
            per_user_monthly_usd: z
              .number()
              .nonnegative()
              .default(0)
              .describe(
                'The most one person may spend through the app in a month, in US dollars — validated and not enforced: never above the project’s AI quota, recorded with the release, and limiting no single person yet; a validation that finds it set carries a `SPEC_FIELD_NOT_ENFORCED` warning.',
              ),
          })
          .strict()
          .default({})
          .describe('What the app’s AI may cost.'),
      })
      .strict()
      .default({})
      .describe('The AI the app uses, through the platform’s gateway.'),
    env: z
      .array(envEntrySchema)
      .default([])
      .describe(
        'Environment variables the app is given, beside the ones the platform sets.',
      ),
    egress: z
      .object({
        allow: z
          .array(z.string().min(1))
          .default([])
          .describe(
            'Hostnames the app may reach outside the platform — `api.ubc.ca`. Everything else is refused.',
          ),
      })
      .strict()
      .default({})
      .describe('Where the app may connect to outside the platform.'),
    data: z
      .object({
        classification: z
          .enum(CLASSIFICATIONS)
          .default(DEFAULT_LEVEL)
          // THE LEVEL, NEVER THE ALIAS (S6): what is stored says what it means. The OUTPUT type stays the seven names on
          // purpose (the U1 plan's Decision 1): every reader ranks through CLASSIFICATION_RANK, which holds all seven.
          .transform((name): Classification => toLevel(name))
          .describe(
            'How sensitive the app’s data is, in UBC’s four levels (Information Security Standard U1): `low`, `medium`, `high` or `very-high` — what every model in `ai.models` must be approved for. Any personal information, such as students’ names, ID numbers or grades, is `high` at least, and `very-high` data reaches only models on UBC’s own hardware. The earlier names are still accepted, each meaning one level: `public` is `low`, `internal` is `medium`, `confidential` is `very-high`. `medium` when absent.',
          ),
        retention_days: z
          .number()
          .int()
          .positive()
          .default(365)
          .describe('How many days the app keeps its data.'),
      })
      .strict()
      .default({})
      .describe('What the app’s data is.'),
    // §15 hooks — reserved, must be empty in v1
    integrations: z
      .array(z.never())
      .max(0)
      .default([])
      .describe('Reserved: must be empty, or absent, in schema version 1.'),
    jobs: z
      .array(z.never())
      .max(0)
      .default([])
      .describe('Reserved: must be empty, or absent, in schema version 1.'),
    checks: z
      .array(z.never())
      .max(0)
      .default([])
      .describe('Reserved: must be empty, or absent, in schema version 1.'),
    environments: z
      .object({
        staging: environmentOverrideSchema
          .optional()
          .describe('What changes in staging.'),
        production: environmentOverrideSchema
          .optional()
          .describe('What changes in production.'),
      })
      .strict()
      .default({})
      .describe(
        'Per-environment overrides of `resources` and `env` only. Sandbox takes the top level as written.',
      ),
  })
  .strict()

export type ManifestSpec = z.infer<typeof manifestSchema>
