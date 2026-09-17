import { z } from 'zod/v4'
import { ERROR_CODE_LIST, MANIFEST_ERROR_CODE_LIST } from '../error-codes.js'

/**
 * THE TWO REGISTRIES the OpenAPI document is built from (P5a Decisions 1, 5).
 *
 * `representations` hold what the API ANSWERS and are converted with `io: 'output'`;
 * `requests` hold what it ACCEPTS, converted with `io: 'input'`. A schema in both would
 * be emitted twice with two shapes — output objects carry `additionalProperties: false`,
 * input objects do not — so `document.ts` refuses an id registered in both, and a request
 * never embeds a representation.
 *
 * `zod/v4`, the API zod 3.25 ships beside its own (measured P5a Task 1, M1). §7's
 * manifest schema stays on zod 3; never pass a v4 issue to `spec/`.
 */
export const representations = z.registry<{ id: string }>()
export const requests = z.registry<{ id: string }>()

export function representation<T extends z.ZodType>(id: string, schema: T): T {
  representations.add(schema, { id })
  return schema
}

export function request<T extends z.ZodType>(id: string, schema: T): T {
  requests.add(schema, { id })
  return schema
}

export const Uuid = z.uuid()

/** Never a `Date`: `z.date()` has no JSON Schema (Decision 3). Mappers call `toISOString()`. */
export const Timestamp = z.iso.datetime().describe('An instant, ISO 8601 in UTC.')

export const ErrorCodeSchema = representation(
  'ErrorCode',
  z
    .enum(ERROR_CODE_LIST as unknown as [string, ...string[]])
    .describe(
      'Every code the API answers with (api/error-codes.ts). Stable: a client switches on it (§20).',
    ),
)

export const ManifestErrorCodeSchema = representation(
  'ManifestErrorCode',
  z
    .enum(MANIFEST_ERROR_CODE_LIST as unknown as [string, ...string[]])
    .describe(
      'A code inside `details`: §7 schema, §7 policy, or §25 blueprint compatibility.',
    ),
)

export const ManifestErrorSchema = representation(
  'ManifestError',
  z.object({
    code: ManifestErrorCodeSchema,
    path: z.string().describe('Where in manifest.yaml, dotted: `services.0.type`.'),
    message: z.string(),
    hint: z.string().optional(),
  }),
)

export const ErrorEnvelope = representation(
  'ErrorEnvelope',
  z.object({
    error: z.object({
      code: ErrorCodeSchema,
      message: z.string().describe('For a person. Never parse it; switch on `code`.'),
      hint: z.string().optional().describe('What to do about it.'),
      details: z.array(ManifestErrorSchema).optional(),
    }),
  }),
)

/** A mutation that takes no fields still takes a JSON object (Decision 4). */
export const EmptyRequest = request('EmptyRequest', z.strictObject({}))
