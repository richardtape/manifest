import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod/v4'
import { requireActor, type SessionActor } from '../actor.js'
import type { ErrorCode } from '../error-codes.js'
import type { ServerDeps } from '../server.js'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
export type SuccessStatus = 200 | 201 | 202

export interface RouteContext<P, Q, B> {
  deps: ServerDeps
  request: FastifyRequest
  reply: FastifyReply
  /** Every `/v1` route requires a session (P5a); `requireActor` has already run. */
  actor: SessionActor
  params: P
  query: Q
  body: B
}

/**
 * ONE `/v1` route, declared once (P5a Decision 1). `registerRoutes` validates with these
 * schemas and shapes the answer through `success.schema`; `openApiDocument` reads the same
 * object. Nothing else describes a route.
 */
export interface RouteDefinition<
  P extends z.ZodObject,
  Q extends z.ZodObject,
  B extends z.ZodType,
  R extends z.ZodType,
> {
  /** camelCase and unique: it is the generated client's name for this call. */
  operationId: string
  method: HttpMethod
  /** OpenAPI's spelling — `/v1/projects/{projectId}` — converted for Fastify by `fastifyPath`. */
  path: `/v1/${string}`
  tag: string
  summary: string
  description: string
  params: P
  query: Q
  /** `NO_BODY` on a GET or a bodyless DELETE; a REGISTERED request schema otherwise. */
  body: B
  success: { status: SuccessStatus; description: string; schema: R }
  /** Codes this operation can answer beyond the ones every route can (document.ts). */
  errors: readonly ErrorCode[]
  handler: (
    ctx: RouteContext<z.output<P>, z.output<Q>, z.output<B>>,
  ) => Promise<z.input<R>>
}

export type AnyRoute = RouteDefinition<z.ZodObject, z.ZodObject, z.ZodType, z.ZodType>

/** Typed at the call site, erased in the array — a handler's parameter types are contravariant. */
export function defineRoute<
  P extends z.ZodObject,
  Q extends z.ZodObject,
  B extends z.ZodType,
  R extends z.ZodType,
>(route: RouteDefinition<P, Q, B, R>): AnyRoute {
  return route as unknown as AnyRoute
}

export const NO_PARAMS = z.strictObject({})
export const NO_QUERY = z.strictObject({})
export const NO_BODY = z.undefined()

/**
 * Whether this route reads a request body at all — THE SCHEMA, not the method.
 *
 * It was `route.method === 'GET'` in both the wrapper below and `document.ts` until P5b
 * Task 4 added `DELETE /v1/tokens/{tokenId}`, the API's first bodyless mutation. Keyed on
 * the method, that route was refused `400 REQUEST_INVALID` before its handler ever ran —
 * `request.body ?? {}` is `{}` and `NO_BODY` is `z.undefined()`, which refuses it — and
 * the OpenAPI document could not be generated for it at all, because `ref` found no
 * registered request schema. The definition already states the fact; asking it is both
 * narrower and truthful, and a DELETE that DOES take a body still gets one.
 */
export function readsBody(route: { body: z.ZodType }): boolean {
  return route.body !== NO_BODY
}

export function fastifyPath(path: string): string {
  return path.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, ':$1')
}

export class RequestValidationError extends Error {
  readonly code = 'REQUEST_INVALID'
  constructor(
    part: 'params' | 'query' | 'body',
    issues: readonly { path: string; message: string }[],
  ) {
    super(
      issues
        .map((i) => `${part}${i.path === '' ? '' : `.${i.path}`}: ${i.message}`)
        .join('; '),
    )
    this.name = 'RequestValidationError'
  }
}

/**
 * A handler answered something its own representation refuses. A 500 — the CLIENT did
 * nothing wrong — whose message names the operation and the PATHS that failed, never
 * the values: a value here is exactly what the representation exists to keep in.
 */
export class ResponseContractError extends Error {
  constructor(operationId: string, paths: readonly string[]) {
    super(
      `${operationId} answered a body its representation refuses, at: ${paths.join(', ')}`,
    )
    this.name = 'ResponseContractError'
  }
}

function parsePart<S extends z.ZodType>(
  part: 'params' | 'query' | 'body',
  schema: S,
  value: unknown,
): z.output<S> {
  const result = schema.safeParse(value)
  if (result.success) return result.data
  throw new RequestValidationError(
    part,
    result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  )
}

export function registerRoutes(
  app: FastifyInstance,
  deps: ServerDeps,
  routes: readonly AnyRoute[],
): void {
  for (const route of routes) {
    app.route({
      method: route.method,
      url: fastifyPath(route.path),
      handler: async (request, reply) => {
        // Authentication first: nobody learns the shape of a request they may not make.
        const actor = requireActor(request)
        const params = parsePart('params', route.params, request.params ?? {})
        const query = parsePart('query', route.query, request.query ?? {})
        const body = parsePart(
          'body',
          route.body,
          readsBody(route) ? (request.body ?? {}) : undefined,
        )
        const run = async (): Promise<{ status: number; body: unknown }> => {
          const produced = await route.handler({
            deps,
            request,
            reply,
            actor,
            params,
            query,
            body,
          })
          // Decision 2: the second read of "what is public". z.object STRIPS unknown keys,
          // so a column a mapper forgot cannot leave; a wrong TYPE is a 500 here rather
          // than a client's surprise.
          const shaped = route.success.schema.safeParse(produced)
          if (!shaped.success) {
            throw new ResponseContractError(
              route.operationId,
              shaped.error.issues.map((i) => i.path.join('.') || '(root)'),
            )
          }
          return { status: route.success.status, body: shaped.data }
        }
        // D23.6 on every mutation, and the stored response is the SHAPED body.
        const result =
          route.method === 'GET' ? await run() : await app.idempotent(request, run)
        return reply.status(result.status).send(result.body)
      },
    })
  }
}
