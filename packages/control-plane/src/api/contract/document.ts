import { z } from 'zod/v4'
import type { ErrorCode } from '../error-codes.js'
// Registers ErrorEnvelope, which every operation's `default` response names by id — and
// which no route declares as a success schema, so nothing else imports it (P5a Task 15).
import '../representations/errors.js'
import { UNVERSIONED } from '../unversioned.js'
import { readsBody, type AnyRoute } from './route.js'
import { component, ref, representations, requests } from './schemas.js'
import { STREAM_PATH, streamPathItem } from './websocket.js'

/** `@manifest/contract`'s version too; a test holds them equal from Task 7 (Decision 8). */
export const CONTRACT_VERSION = '0.1.0'

type JsonSchema = Record<string, unknown>

/** Codes EVERY `/v1` operation can answer, and every mutation besides. */
const EVERY_ROUTE: readonly ErrorCode[] = [
  'UNAUTHENTICATED',
  'REQUEST_INVALID',
  'INTERNAL',
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
