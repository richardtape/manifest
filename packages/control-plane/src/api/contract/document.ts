import { z } from 'zod/v4'
import type { ErrorCode } from '../error-codes.js'
// Registers ErrorEnvelope, which every operation's `default` response names by id — and
// which no route declares as a success schema, so nothing else imports it (P5a Task 15).
import '../representations/errors.js'
import { UNVERSIONED } from '../unversioned.js'
import { readsBody, type AnyRoute } from './route.js'
import { component, ref, representations, requests } from './schemas.js'
import { STREAM_PATH, streamPathItem } from './websocket.js'

/**
 * `@manifest/contract`'s version too; a test holds them equal from P5a Task 7 (Decision 8).
 *
 * **`1.0.0` SINCE P5c TASK 13 (2026-09-19).** P5a Decision 8 reserved exactly this:
 * *"The major version is the path. P5c sets `1.0.0` when the console has proved the
 * contract."* It has — D22's reference console drives §22's whole journey through nothing
 * but this document's generated client, and `packages/console/src/coverage.test.ts` holds
 * every one of its operations to having a caller. From here an ADDITIVE change bumps the
 * minor; a BREAKING one is a new path prefix served beside `/v1`, never an edit to it
 * (D23.8).
 *
 * **`1.1.0` SINCE P6b TASK 2 (2026-09-23)**, and the bump is late: P6a added seven
 * operations (approve, reject, the approval, the launch records and the rehearsal) under
 * `1.0.0` without one (P6b *Read this first* 11). This bump covers those seven and every
 * additive change P6b makes, once, because nothing is published between tasks.
 *
 * Three files carry it and two tests hold them together: this constant,
 * `packages/contract/openapi.json`'s `info.version` (GENERATED — `pnpm contract:write`,
 * never edited) and `packages/contract/package.json`.
 */
export const CONTRACT_VERSION = '1.1.0'

type JsonSchema = Record<string, unknown>

/** Codes EVERY `/v1` operation can answer, and every mutation besides. */
const EVERY_ROUTE: readonly ErrorCode[] = [
  'UNAUTHENTICATED',
  'REQUEST_INVALID',
  'INTERNAL',
  /**
   * §20's per-token limit is taken in the ONE credential hook, before any route runs
   * (P5b Task 9) — so every operation can answer it to a delegated token, and listing it
   * per route would be forty entries that mean "the hook ran". A session is not limited
   * here; `GET /v1/slugs/{slug}` keeps its own per-user limiter and names this code in
   * its own `errors:` as well, which is a different control with the same answer.
   */
  'RATE_LIMITED',
]
const EVERY_MUTATION: readonly ErrorCode[] = [
  'CSRF_ORIGIN_REFUSED',
  'IDEMPOTENCY_KEY_REQUIRED',
  'IDEMPOTENCY_KEY_REUSED',
  // Fastify's own refusals of a body it cannot read, before any route runs (P5a Task 5).
  'REQUEST_MEDIA_TYPE_UNSUPPORTED',
  'REQUEST_BODY_TOO_LARGE',
]

/** zod stamps each emitted schema with its own `$schema` and `$id`; a component carries neither. */
function strip(schema: JsonSchema): JsonSchema {
  const { $schema: _schema, $id: _id, ...rest } = schema
  return rest
}

function components(): Record<string, JsonSchema> {
  const out = z.toJSONSchema(representations, {
    io: 'output',
    uri: component,
    unrepresentable: 'throw',
  }).schemas
  const inp = z.toJSONSchema(requests, {
    io: 'input',
    uri: component,
    unrepresentable: 'throw',
  }).schemas
  const both = Object.keys(out).filter((id) => id in inp)
  if (both.length > 0) {
    throw new Error(
      `registered as a representation AND a request: ${both.join(', ')} (P5a Decision 5)`,
    )
  }
  const all = { ...out, ...inp } as Record<string, JsonSchema>
  return Object.fromEntries(
    Object.keys(all)
      .sort()
      .map((id) => [id, strip(all[id]!)]),
  )
}

function parameters(route: AnyRoute): JsonSchema[] {
  const list: JsonSchema[] = []
  const add = (where: 'path' | 'query', object: z.ZodObject): void => {
    const schema = z.toJSONSchema(object, { io: 'input', unrepresentable: 'throw' }) as {
      properties?: Record<string, JsonSchema>
      required?: string[]
    }
    for (const name of Object.keys(schema.properties ?? {}).sort()) {
      list.push({
        name,
        in: where,
        required: where === 'path' || (schema.required ?? []).includes(name),
        schema: strip(schema.properties![name]!),
      })
    }
  }
  add('path', route.params)
  add('query', route.query)
  if (route.method !== 'GET') {
    list.push({
      name: 'Idempotency-Key',
      in: 'header',
      required: true,
      description: 'D23.6. One per user action, reused across retries of THAT action.',
      schema: { type: 'string', minLength: 8 },
    })
  }
  return list
}

/**
 * §16 *Contract*: the OpenAPI 3.1 document, generated from the route definitions and
 * nothing else. Deterministic — paths, methods, parameters and components sorted — so the
 * drift test compares bytes.
 */
export function openApiDocument(routes: readonly AnyRoute[]): JsonSchema {
  const paths: Record<string, Record<string, JsonSchema>> = {}
  const ordered = [...routes].sort(
    (a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
  )
  for (const route of ordered) {
    const codes = [
      ...new Set([
        ...EVERY_ROUTE,
        ...(route.method === 'GET' ? [] : EVERY_MUTATION),
        ...route.errors,
      ]),
    ].sort()
    const operation: JsonSchema = {
      operationId: route.operationId,
      tags: [route.tag],
      summary: route.summary,
      description: route.description,
      parameters: parameters(route),
      ...(readsBody(route)
        ? {
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: ref(requests, route.body, `${route.operationId}'s body`),
                },
              },
            },
          }
        : {}),
      responses: {
        [String(route.success.status)]: {
          description: route.success.description,
          content: {
            'application/json': {
              schema: ref(
                representations,
                route.success.schema,
                `${route.operationId}'s response`,
              ),
            },
          },
        },
        default: {
          description: `An error, in the D23.7 envelope. This operation can answer: ${codes.join(', ')}.`,
          content: {
            'application/json': { schema: { $ref: component('ErrorEnvelope') } },
          },
        },
      },
      'x-manifest-error-codes': codes,
    }
    ;(paths[route.path] ??= {})[route.method.toLowerCase()] = operation
  }
  // D23.2's stream: documented, never defined — it upgrades, and defineRoute answers JSON
  // (P5a Decision 34). Its path sorts among the others'.
  paths[STREAM_PATH] = streamPathItem() as Record<string, JsonSchema>
  const sortedPaths = Object.fromEntries(
    Object.keys(paths)
      .sort((a, b) => a.localeCompare(b))
      .map((path) => [path, paths[path]!]),
  )

  return {
    openapi: '3.1.0',
    info: {
      title: 'Manifest',
      version: CONTRACT_VERSION,
      description:
        "Manifest's public API (§22). Generated from the control plane's route definitions; do not edit. " +
        'Resource routes are under /v1 (D23.8); a breaking change is a new prefix beside it. Response ' +
        'objects may gain fields under /v1 — a client ignores fields it does not know. Every mutation ' +
        'carries an Idempotency-Key, and a session-bearing mutation carries Origin (§20).',
    },
    servers: [
      {
        url: 'https://console.manifest.internal',
        description:
          'The laptop platform (§21). The console and the API share this origin.',
      },
    ],
    security: [{ session: [] }],
    tags: [...new Set([...routes.map((r) => r.tag), 'events'])]
      .sort()
      .map((name) => ({ name })),
    paths: sortedPaths,
    components: {
      securitySchemes: {
        session: {
          type: 'apiKey',
          in: 'cookie',
          name: 'manifest_session',
          description:
            'Set by the CWL sign-in at /auth/login (§9). Delegated tokens arrive in P5b.',
        },
      },
      schemas: components(),
    },
    'x-manifest-unversioned': UNVERSIONED.map((u) => ({ ...u })),
  }
}
