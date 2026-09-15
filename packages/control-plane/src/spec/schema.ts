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

const serviceSchema = z
  .object({
    type: z.string().min(1),
    version: z.string().min(1),
    name: z.string().regex(/^[a-z][a-z0-9-]{0,30}$/),
  })
  .strict()

const envEntrySchema = z
  .object({
    name: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
    value: z.string().optional(),
    secret: z.boolean().optional(),
  })
  .strict()
  .refine((e) => (e.secret === true) !== (e.value !== undefined), {
    message: 'an env entry carries either a value or secret: true, never both',
  })

const resourcesSchema = z
  .object({
    cpu: z.number().positive().optional(),
    memory: z.string().regex(QUANTITY).optional(),
    pids: z.number().int().positive().optional(),
    disk: z.string().regex(QUANTITY).optional(),
  })
  .strict()

// `build` is DECLARED as `z.never().optional()` rather than left to .strict()'s
// unknown-key handling. Both reject it, but only the declared field reports at
// path `runtime.build`; .strict() alone reports `unrecognized_keys` at path
// `runtime`, which is how D13's refusal would have arrived as a generic
// "unrecognized key". Task 3 maps the path to SPEC_BUILD_BLOCK_FORBIDDEN.
const runtimeSchema = z
  .object({
    port: z.number().int().min(1).max(65535),
    health: z.string().regex(AUTH_PATH).default('/healthz'),
    command: z.string().nullable().default(null),
    build: z.never().optional(),
  })
  .strict()

const authSchema = z
  .object({
    provider: z.enum(['cwl', 'none']).default('none'),
    attributes: z.array(z.string().min(1)).default([]),
    callback: z.string().regex(AUTH_PATH).default('/auth/ubcshib/callback'),
    logout: z.string().regex(AUTH_PATH).default('/auth/logout'),
  })
  .strict()

const environmentOverrideSchema = z
  .object({
    resources: resourcesSchema.optional(),
    env: z.array(envEntrySchema).optional(),
  })
  .strict()

export const manifestSchema = z
  .object({
    manifest: z.literal(1),
    name: z.string().regex(SLUG),
    blueprint: z.string().regex(BLUEPRINT_REF),
    description: z.string().max(500).optional(),
    runtime: runtimeSchema,
    resources: resourcesSchema.default({}),
    services: z.array(serviceSchema).default([]),
    auth: authSchema.default({}),
    ai: z
      .object({
        models: z.array(z.string().min(1)).default([]),
        budget: z
          .object({
            // NO DEFAULT, so an omitted budget is visible (§7 as amended on
            // 2026-09-14). `validateSpec` fills an omitted one with the project's AI
            // quota when the manifest declares a model; with `.default(0)` it parsed
            // exactly like a written 0, which is still refused.
            project_monthly_usd: z.number().nonnegative().optional(),
            per_user_monthly_usd: z.number().nonnegative().default(0),
          })
          .strict()
          .default({}),
      })
      .strict()
      .default({}),
    env: z.array(envEntrySchema).default([]),
    egress: z
      .object({ allow: z.array(z.string().min(1)).default([]) })
      .strict()
      .default({}),
    data: z
      .object({
        classification: z.enum(CLASSIFICATIONS).default('internal'),
        retention_days: z.number().int().positive().default(365),
      })
      .strict()
      .default({}),
    // §15 hooks — reserved, must be empty in v1
    integrations: z.array(z.never()).max(0).default([]),
    jobs: z.array(z.never()).max(0).default([]),
    checks: z.array(z.never()).max(0).default([]),
    environments: z
      .object({
        staging: environmentOverrideSchema.optional(),
        production: environmentOverrideSchema.optional(),
      })
      .strict()
      .default({}),
  })
  .strict()

export type ManifestSpec = z.infer<typeof manifestSchema>
