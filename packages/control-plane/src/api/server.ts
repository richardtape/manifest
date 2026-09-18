import { readFileSync } from 'node:fs'
import cookie from '@fastify/cookie'
import websocket from '@fastify/websocket'
import type { EventBus } from '../observability/index.js'
import { registerEventRoutes } from './routes/events.js'
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify'
import type { Db } from '../db/index.js'
import type { Config } from '../config.js'
import type { Driver } from '../runtime/index.js'
import type { SourceDriver } from '../source/index.js'
import type { BlueprintRegistry } from '../blueprints/index.js'
import type { ServiceCredentialResolver } from '../services/index.js'
import type { AppSecretResolver } from '../secrets/index.js'
import { SESSION_COOKIE, verifySession } from '../identity/index.js'
import type { Actor, ReservedLabels } from '../projects/index.js'
import {
  RateLimitedError,
  type KeyedRateLimiter,
  type RateLimiter,
} from './rate-limit.js'
import { assertSameOrigin } from './csrf.js'
import { BadRequestError, toErrorResponse } from './errors.js'
import { replayOrStore } from './idempotency.js'
import { registerAuthRoutes } from './routes/auth.js'
import type { SsoRegistrar } from '../sso/index.js'
import type { SamlSp } from '../identity/index.js'
import type { AiKeyService, ModelCatalogue } from '../ai/index.js'
import type { BuildRunner, Retirer } from '../releases/index.js'
import { registryTokenRoutes } from './routes/registry-token.js'
import { registerRoutes } from './contract/route.js'
import { ROUTE_DEFINITIONS } from './routes/index.js'
import { requireActor } from './actor.js'
import { readBearer, tokenActor } from '../tokens/index.js'

export interface ServerDeps {
  db: Db
  config: Config
  driver: Driver
  source: SourceDriver
  blueprints: BlueprintRegistry
  /** §12's stored service credentials, with the master key already bound. */
  secrets: ServiceCredentialResolver
  /** §8's SESSION_SECRET, same shape and same reason as `secrets`. */
  appSecrets: AppSecretResolver
  /**
   * §9's SP registrar, with the IdP pool, the master key and the platform's
   * entity base already bound — so `api/` and `releases/` hold no key material
   * and no second connection. Same shape as `secrets` above, for the same reason.
   */
  sso: SsoRegistrar
  /**
   * §9's other half: Manifest's own Service Provider, with its entity, its
   * keypair and the IdP's certificate already bound. `/auth/login` and
   * `/auth/saml/callback` hold no key material and build no URLs.
   */
  samlSp: SamlSp
  /**
   * D17's catalogue, read from LiteLLM and cached (P4b Task 6). `enabled` is false
   * under `MANIFEST_AI_ENABLED=0`, and then it is never read — see `src/index.ts`.
   */
  catalogue: ModelCatalogue
  /**
   * §10's app-key lifecycle, with the LiteLLM client and the master keypair bound (P4b
   * Task 9), handed to `deployRelease`. `enabled` is false under
   * `MANIFEST_AI_ENABLED=0`, and then every step refuses, naming the setting.
   */
  ai: AiKeyService
  /**
   * D23.2's per-project fan-out (P4b Task 14): `WS /v1/projects/:projectId/events`
   * subscribes to it. ONE bus per process, built at boot, so every publisher and every
   * socket meet on the same instance.
   */
  bus: EventBus
  /**
   * THE CONTROL PLANE'S FIRST BACKGROUND WORK (P4c Task 7): what drains and removes
   * the instances a deploy replaced. ONE per process, like the bus, and built at boot
   * — a deploy calls `schedule` and returns (R3), and `idle()` is what the acceptance
   * and the Docker tier wait on.
   */
  retirer: Retirer
  /**
   * R6: builds run here, in the background — one per process, built at boot like the
   * retirer (P5a Decision 31). `POST /v1/projects/{projectId}/builds` calls `start` and
   * answers 202; `idle()` is what a test waits on.
   */
  builds: BuildRunner
  /** §23's reserved labels, loaded once at boot (P5a Task 9). */
  reservedLabels: ReservedLabels
  /** In-process request limits, one limiter per purpose, shared by every request (P5a Task 9). */
  limits: {
    slugCheck: RateLimiter
    /**
     * §20's per-token limit (P5b Task 9). KEYED, because each token's limit is its own —
     * one shared window would make `delegated_tokens.rate_limit` decorative. Taken in the
     * credential hook below, so every `/v1` route inherits it exactly as D24's refusal
     * does and no route can forget it.
     */
    tokens: KeyedRateLimiter
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Either credential class (P5b Decision 2); `requireSession` narrows it. */
    actor?: Actor | undefined
  }
  interface FastifyContextConfig {
    /** `/auth/*` opts out: logging in twice is not a domain mutation. */
    idempotency?: 'exempt'
    /**
     * `/auth/saml/callback` ONLY (P5a Task 4): its credential is a signed assertion bound
     * to the browser that started the sign-in, and the IdP's auto-submitting POST carries
     * the IdP's origin. Declared on the route, never matched from a path list — and
     * `/auth/logout` is deliberately NOT exempt.
     */
    csrf?: 'exempt'
  }
  interface FastifyInstance {
    /** Wraps a mutating handler in its idempotency record. Decorated below. */
    idempotent(
      request: FastifyRequest,
      handler: () => Promise<{ status: number; body: unknown }>,
    ): Promise<{ status: number; body: unknown }>
    /** Every route registered, for Task 20's completeness check. */
    registeredRoutes: { method: string; url: string }[]
  }
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

// Its own module since P5a Task 6 (`actor.ts` says why); re-exported so every existing
// `import { requireActor } from '../server.js'` keeps working.
export { requireActor } from './actor.js'

export async function buildServer(deps: ServerDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    /**
     * The two refusals Fastify's ROUTER sends itself — a malformed URL and a path parameter
     * over its 100-character limit — never reach `setErrorHandler` unless they are handed
     * over here. Without this both answered Fastify's own body, not the D23.7 envelope,
     * quoting the caller's path back (P5a sitting 6, measured on GET /v1/slugs/{slug}).
     */
    frameworkErrors: (error, _request, reply) => {
      const { status, body } = toErrorResponse(error)
      // Typed loosely by Fastify here (no route, so no reply schema to resolve against).
      void (reply as FastifyReply).status(status).send(body)
    },
  })
  await app.register(cookie)
  // Before any route: its `onRoute` hook is what turns a route with a `wsHandler` into
  // one that can upgrade, and a hook added after a route never sees that route.
  await app.register(websocket)

  /**
   * Fastify does not parse `application/x-www-form-urlencoded` by default, and the
   * registry token realm receives exactly that: Docker 29 and BuildKit use the
   * OAuth2 POST form grant. Without a parser `request.body` is `undefined`, every
   * grant comes back empty, and the symptom is a scope refusal on a correct
   * credential — indistinguishable from the policy working.
   *
   * Written here rather than by adding `@fastify/formbody`. Six lines against a
   * dependency in the process that holds the Docker socket and mints registry push
   * tokens; Decision 1 makes that trade for the same reason one component down.
   */
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_request, body, done) => {
      done(null, Object.fromEntries(new URLSearchParams(body as string)))
    },
  )

  app.decorateRequest('actor', undefined)

  // Task 20's drift guard reads this. `onRoute` fires as routes register, so the
  // hook has to be added before the register* calls below, not after.
  const registered: { method: string; url: string }[] = []
  app.addHook('onRoute', (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method]
    for (const method of methods) {
      if (method === 'HEAD' || method === 'OPTIONS') continue
      registered.push({ method, url: route.url })
    }
  })
  app.decorate('registeredRoutes', registered)

  /**
   * ONE place turns a credential into an actor, and it now knows two classes (D23.4,
   * P5b Task 5). Routes never read the cookie or the header — that property is what makes
   * D24's central refusal possible at all, and it is why this stays ONE hook: two hooks
   * would be two places that decide who is asking.
   */
  app.addHook('onRequest', async (request) => {
    const bearer = readBearer(request.headers.authorization)
    const cookie = request.cookies[SESSION_COOKIE]
    // TWO CREDENTIALS IS AMBIGUOUS, and an ambiguity resolved silently is the shape every
    // confused-deputy bug has. Refused before either is read, so the answer does not
    // depend on which one would have won.
    if (bearer !== undefined && cookie !== undefined) {
      throw new BadRequestError(
        'CREDENTIAL_AMBIGUOUS',
        'a request carries either a session cookie or a delegated token, never both',
        'Send the Authorization header alone for an agent, or the cookie alone for a browser.',
      )
    }
    if (bearer !== undefined) {
      // `undefined` for every bad token alike; `requireActor` answers the 401. Nothing
      // here distinguishes unknown, wrong, revoked and expired — see `tokenActor`.
      const actor = await tokenActor(deps.db, bearer)
      request.actor = actor
      /**
       * §20's per-token limit, taken HERE — after the token is verified, and before any
       * route (P5b Task 9, Decision 9).
       *
       * **AFTER IS THE SECURITY PROPERTY.** Taken before, anybody who could reach the API
       * could exhaust a token's window by sending its id with a wrong secret: a denial of
       * service needing no credential at all. A bad token is `401` and costs its victim
       * nothing.
       *
       * **BEFORE ANY ROUTE** for the reason D24's refusal is central: a limit a route has
       * to remember is a limit the next route forgets. A session is deliberately not
       * limited here — §20 scopes this control to tokens, because a third-party agent is
       * code the platform did not write, running on a machine it does not control.
       */
      if (actor !== undefined) deps.limits.tokens.take(actor.tokenId, actor.rateLimit)
      return
    }
    if (cookie === undefined) return
    const session = verifySession(cookie, deps.config.sessionSecret)
    if (!session) return
    request.actor = {
      credential: 'session',
      userId: session.userId,
      platformRole: session.role,
      puid: session.puid,
    }
  })

  // §20's CSRF check and D23.6, applied by the framework rather than remembered per route.
  app.addHook('preHandler', async (request) => {
    if (!MUTATING.has(request.method)) return
    // A request that matched no route has no route options to opt out with, and
    // answering 400 here would mask the 404 — which is exactly what the "the
    // dev-login route is absent, not forbidden" test is checking for. It changes
    // nothing either, so there is nothing for the origin check below to protect.
    if (request.routeOptions.url === undefined) return
    // §20 CSRF (P5a Task 4). BEFORE the idempotency check, so a cross-site form learns
    // nothing about which headers it lacks — and before the idempotency opt-out, which
    // `/auth/logout` carries and this check must not inherit. The stream's upgrade is a
    // GET and is checked in its own route hook (`routes/events.ts`).
    if (request.routeOptions.config?.csrf !== 'exempt') {
      assertSameOrigin(request, deps.config.sp.origin)
    }
    if (request.routeOptions.config?.idempotency === 'exempt') return
    const key = request.headers['idempotency-key']
    if (typeof key !== 'string' || key.length < 8) {
      throw new BadRequestError(
        'IDEMPOTENCY_KEY_REQUIRED',
        'every mutating request needs an Idempotency-Key header of at least 8 characters',
        'Generate a UUID per user action and reuse it across retries of that action.',
      )
    }
  })

  app.setErrorHandler((error, request, reply) => {
    if ((error as { statusCode?: number }).statusCode === 401) {
      // NOT "a session is required": since P5b Task 5 the credential may be a delegated
      // token, and telling its holder to log in is a hint they cannot act on (D23.7).
      // Deliberately says nothing about WHICH way a token was unacceptable — `tokenActor`
      // has the reason it must not.
      return reply.status(401).send({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'a valid credential is required',
          hint: 'Sign in at /auth/login for a session, or send Authorization: Bearer <token> for an agent. A token that is unknown, revoked or expired is refused the same way.',
        },
      })
    }
    const { status, body } = toErrorResponse(error)
    if (error instanceof RateLimitedError)
      reply.header('retry-after', String(error.retryAfterSeconds))
    if (status === 500) {
      // `console.error`, NOT `request.log.error`. This server is built with
      // `logger: false`, under which `request.log.error` EXISTS, accepts the call
      // and writes nothing — the same trap the boot line hit with `app.log.info`
      // (Session 4). So the only record of an unexpected failure vanished: a
      // deploy answered 500 INTERNAL with nothing in the process output, nothing
      // in the database and nothing on the wire. Measured by `make demo` on
      // 2026-09-07, where the cause turned out to be three frames down a stack
      // nobody could see.
      //
      // The envelope stays deliberately opaque to the CLIENT (D23.7) — that is a
      // §20 decision and is not changed here. This is the OPERATOR's copy.
      console.error(
        JSON.stringify({
          level: 'error',
          msg: 'unhandled error',
          method: request.method,
          url: request.url,
          error: (error as Error).message,
        }),
      )
      console.error((error as Error).stack ?? error)
    }
    return reply.status(status).send(body)
  })

  /**
   * D23.7 for a path that matched nothing, too. Fastify's default answers
   * `{"message":"Route GET:/projects not found","error":"Not Found","statusCode":404}`,
   * which is a shape no client switches on — and after the `/v1` move (P5a Task 2) an
   * old path is exactly what a stale script or a stale bookmark will send. The path is
   * echoed without its query string and capped: it is the caller's own input.
   */
  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send({
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: `no route ${request.method} ${request.url.split('?')[0]!.slice(0, 200)}`,
        hint:
          'Every resource route is under /v1/ (D23.8). Signing in is /auth/login; ' +
          'the document at packages/contract/openapi.json lists every route.',
      },
    }),
  )

  /** Wraps a mutating handler in its idempotency record. */
  app.decorate(
    'idempotent',
    async (
      request: FastifyRequest,
      handler: () => Promise<{ status: number; body: unknown }>,
    ) => {
      const actor = requireActor(request)
      return replayOrStore(
        deps.db,
        {
          key: request.headers['idempotency-key'] as string,
          userId: actor.userId,
          route: `${request.method} ${request.routeOptions.url}`,
          body: request.body,
        },
        handler,
      )
    },
  )

  /**
   * The PEMs are read once, here, and a missing file is a hard failure naming the
   * command that creates it. The alternative — registering the realm with empty
   * PEMs — produces a route that exists, answers, and mints tokens no registry will
   * ever accept, which is the kind of green this project keeps paying for.
   */
  const readIssuerPem = (path: string, which: string): string => {
    try {
      return readFileSync(path, 'utf8')
    } catch {
      throw new Error(
        `cannot read the registry token ${which} at '${path}'. ` +
          'Run `make seed`, which generates infra/registry-auth/token.{key,crt}.',
      )
    }
  }
  await app.register(
    registryTokenRoutes({
      keyPem: readIssuerPem(deps.config.registryTokenKeyPath, 'key'),
      certPem: readIssuerPem(deps.config.registryTokenCertPath, 'certificate'),
      issuer: 'manifest-control-plane',
      service: 'manifest-registry',
      buildCredentialSecret: deps.config.buildCredentialSecret,
    }),
  )

  // EVERY `/v1` route, declared through `defineRoute` (P5a Task 6, complete at Task 14) —
  // `contract/coverage.test.ts` holds it so. What is left registers itself: the sign-in
  // endpoints, which are outside `/v1` (D23.8), and the stream, which upgrades.
  registerRoutes(app, deps, ROUTE_DEFINITIONS)
  await registerAuthRoutes(app, deps)
  await registerEventRoutes(app, deps)

  return app
}
