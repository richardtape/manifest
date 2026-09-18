import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod/v4'
import {
  CAPABILITIES,
  TokenCapabilityRefusedError,
  type TokenActor,
} from '../../projects/index.js'
import {
  consumeAction,
  fingerprintOf,
  PendingActionRejectedError,
  PendingActionRequiredError,
  recordPendingAction,
  resolutionFor,
} from '../../tokens/index.js'
import { requireActor, type Actor } from '../actor.js'
import type { ErrorCode } from '../error-codes.js'
import type { ServerDeps } from '../server.js'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
export type SuccessStatus = 200 | 201 | 202

export interface RouteContext<P, Q, B> {
  deps: ServerDeps
  request: FastifyRequest
  reply: FastifyReply
  /**
   * Every `/v1` route requires a credential, and since P5b Task 5 there are two classes
   * of one. A handler that needs `platformRole` or `puid` — or that D24 reserves to a
   * person — calls `requireSession(request)` and gets a `SessionActor`; `tsc` refuses to
   * read either field off this union, which is the whole of Decision 2.
   */
  actor: Actor
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
        /**
         * WHAT WAS ASKED FOR, computed once: the refusal below records it, and the lookup
         * that follows matches a human's answer against it. Two statements of the same
         * fingerprint would be two ways for a retry to stop matching the row a person
         * confirmed — and the canonical key sort inside it has no API-level control
         * (sitting 4's F6), so nothing would say so.
         */
        const fingerprint = fingerprintOf({
          method: request.method,
          url: request.url,
          // The ROUTE's own sentence, which the OpenAPI document publishes: the queue a
          // person reads and the contract an agent reads then say the same thing about
          // an operation rather than two things kept in step.
          summary: route.summary,
          body,
        })
        /**
         * D24's loop closing (P5b Task 7, Decision 6). Resolved HERE, before the handler,
         * because `assertCapability` cannot see a request and the answer is about a
         * request — the same split Decision 5 makes for the refusal.
         *
         * `grant` is the single-use permission this request carries, and nothing else can
         * manufacture one: it comes from a row a person moved to `confirmed` in an
         * interactive session, matched on this token AND this fingerprint. A rejection is
         * carried too, and acted on only where the refusal happens, so that the
         * authorization layer still decides and this layer still only reports.
         */
        const resolution =
          actor.credential === 'token'
            ? await resolutionFor(deps.db, actor.tokenId, fingerprint)
            : ({ kind: 'none' } as const)
        // `CAPABILITIES.find` rather than a cast: the column is text, and a row written
        // by an older build could name something this build does not grant.
        const granted =
          resolution.kind === 'confirmed'
            ? CAPABILITIES.find((capability) => capability === resolution.row.action)
            : undefined
        const scoped: Actor =
          granted === undefined ? actor : { ...(actor as TokenActor), grant: granted }

        const run = async (): Promise<{ status: number; body: unknown }> => {
          const produced = await route.handler({
            deps,
            request,
            reply,
            actor: scoped,
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
        /**
         * D24's central refusal, recorded HERE and nowhere else (P5b Decision 5).
         *
         * `assertCapability` decides — it is the one function every project-scoped route
         * already goes through — but it cannot see a request, and the question a person
         * answers is *what was asked for*. This wrapper is holding the request. Neither
         * layer can do the other's half, and a route that recorded its own would be the
         * per-route enforcement D24 forbids.
         *
         * **THE CATCH IS OUTSIDE `app.idempotent`, AND THAT PLACEMENT IS LOAD-BEARING.**
         * `app.idempotent` is `replayOrStore`, which stores whatever its handler RESOLVES
         * with and replays it for a repeated key without calling the handler again. Catch
         * this inside `run` — the natural reading, and where it is easiest to write — and
         * the 403 is cached under `(key, userId, route)`. The human confirms, the agent
         * retries with the SAME `Idempotency-Key`, which is exactly what D23.6's own error
         * hint instructs, and `replayOrStore` replays the cached refusal for ever:
         * `consumed_at` is never stamped and the loop never closes. Every test that mints
         * a fresh key per request stays green through it (`[M5]`, measured in sitting 1).
         * Scoping the idempotency record to the token does NOT fix it — the refusal would
         * simply deadlock in the token's own namespace. Only the placement does.
         *
         * Thrown outside, the refusal propagates out of `replayOrStore` and nothing is
         * stored. `api/delegation.test.ts`'s *stores NO idempotency record for a refusal*
         * is the assertion that sees this, and it is the only one that can.
         *
         * **This wrapper does not run for every `/v1` route** (`[M7]`): the event stream
         * is registered with `app.route` directly in `routes/events.ts` and is absent from
         * `ROUTE_DEFINITIONS`. Harmless as the platform stands — the stream checks only
         * `project:read`, which is never privileged — but the assumption is stated here
         * because it is what "centrally" rests on, and `api/errors.ts` fails closed with
         * an operator line the day it stops holding.
         */
        let result: { status: number; body: unknown }
        try {
          result =
            route.method === 'GET' ? await run() : await app.idempotent(request, run)
        } catch (error) {
          if (error instanceof TokenCapabilityRefusedError) {
            /**
             * A person already answered this exact question, and the answer was no. Told
             * so rather than asked again: a fresh row would put the same question back in
             * their queue every time the agent retried, and D23.7's whole argument is
             * that an agent corrects itself from the answer. Acted on HERE, after
             * `assertCapability` has refused, so the ordering the authorization layer
             * owns — scope, then the privileged rule — still decides what happens first.
             */
            if (resolution.kind === 'rejected') {
              throw new PendingActionRejectedError(resolution.row)
            }
            throw new PendingActionRequiredError(
              await recordPendingAction(deps.db, deps.bus, { error, fingerprint }),
            )
          }
          throw error
        }
        /**
         * THE GRANT IS SPENT, AND ONLY NOW — after the handler resolved (Decision 6).
         *
         * Stamped before it ran, a transient failure the agent did not cause would burn a
         * person's decision and they would have to answer the same question twice; that
         * is the case `leaves the confirmation usable when the RETRY's handler fails`
         * holds. The cost is a window in which two identical retries in flight at once
         * both pass — narrowed, not closed, by `consumeAction`'s own `WHERE consumed_at
         * IS NULL`, and recorded in P5b sitting 5's findings rather than left to be found.
         */
        if (granted !== undefined && resolution.kind === 'confirmed') {
          await consumeAction(deps.db, resolution.row.id)
        }
        return reply.status(result.status).send(result.body)
      },
    })
  }
}
