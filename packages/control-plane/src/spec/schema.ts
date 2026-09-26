import { z } from 'zod'

export const SLUG = /^[a-z][a-z0-9-]{2,38}$/
export const AUTH_PATH = /^\/[A-Za-z0-9/_-]{1,64}$/
const BLUEPRINT_REF = /^[a-z][a-z0-9-]*@\d+$/
const QUANTITY = /^\d+(\.\d+)?(Mi|Gi)?$/

export const CLASSIFICATIONS = ['public', 'internal', 'confidential'] as const
export type Classification = (typeof CLASSIFICATIONS)[number]

/** public < internal < confidential (D17). */
export const CLASSIFICATION_RANK: Record<Classification, number> = {
  public: 0,
  internal: 1,
  confidential: 2,
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
    'A backing service the platform runs and binds for the app (§8 injects its address).',
  )

const envEntrySchema = z
  .object({
    name: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]*$/)
      .describe(
        'The variable’s name: upper-case letters, digits and underscores, starting with a letter. Not one the platform sets itself (§8).',
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
        'The path the platform checks before an instance serves: it must answer 200 (§11). A path, never a URL.',
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
        'FORBIDDEN (D13): the Dockerfile is the blueprint’s. An app declares what it needs, never how to build it.',
      ),
  })
  .strict()
  .describe('How the app runs.')

const authSchema = z
  .object({
    provider: z
      .enum(['cwl', 'none'])
      .default('none')
      .describe('`cwl` signs people in with UBC’s CWL (§9); `none` signs nobody in.'),
    attributes: z
      .array(z.string().min(1))
      .default([])
      .describe(
        'The CWL attributes the app receives about a signed-in person — `ubcEduCwlPuid`, `mail`, `givenName`, `sn`, `eduPersonAffiliation`. The identifier is `ubcEduCwlPuid`, never `uid`.',
      ),
    callback: z
      .string()
      .regex(AUTH_PATH)
      .default('/auth/ubcshib/callback')
      .describe(
        'The PATH the identity provider posts a sign-in to (D15) — Manifest derives the origin.',
      ),
    logout: z
      .string()
      .regex(AUTH_PATH)
      .default('/auth/logout')
      .describe('The PATH single logout arrives at (D15).'),
  })
  .strict()
  .describe('Who may use the app, and what it learns about them (§9).')

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
        'The project’s slug, exactly (§23): 3 to 39 lower-case letters, digits and hyphens, starting with a letter.',
      ),
    blueprint: z
      .string()
      .regex(BLUEPRINT_REF)
      .describe(
        'The project’s blueprint and its major version, `name@major` — the project’s own pin (§25). A commit cannot change it.',
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
            'The LOGICAL models the app may call — `default-chat`, `default-embed` — never a vendor’s model id. Each must be approved for `data.classification` (D17).',
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
                'The most one person may spend through the app in a month, in US dollars (§7).',
              ),
          })
          .strict()
          .default({})
          .describe('What the app’s AI may cost (§10).'),
      })
      .strict()
      .default({})
      .describe('The AI the app uses, through the platform’s gateway (§10).'),
    env: z
      .array(envEntrySchema)
      .default([])
      .describe(
        'Environment variables the app is given, beside the ones the platform sets (§8).',
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
          .default('internal')
          .describe(
            'How sensitive the app’s data is: `public`, `internal` or `confidential` — what its models must be approved for (D17).',
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
      .describe('What the app’s data is (§15).'),
    // §15 hooks — reserved, must be empty in v1
    integrations: z
      .array(z.never())
      .max(0)
      .default([])
      .describe('Reserved (§15): must be empty, or absent, in schema version 1.'),
    jobs: z
      .array(z.never())
      .max(0)
      .default([])
      .describe('Reserved (§15): must be empty, or absent, in schema version 1.'),
    checks: z
      .array(z.never())
      .max(0)
      .default([])
      .describe('Reserved (§15): must be empty, or absent, in schema version 1.'),
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
