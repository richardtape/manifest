import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  LOGIN_COOKIE,
  LOGIN_TTL_SECONDS,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  SamlError,
  encodeLoginCookie,
  issueSession,
  newLoginNonce,
  readLoginCookie,
  safeReturnTo,
  sameNonce,
  signSession,
  upsertUserFromAssertion,
} from '../../identity/index.js'
import { requireActor, type ServerDeps } from '../server.js'

/**
 * The SAML POST binding. The IdP auto-submits a form to the ACS, so the body is
 * `application/x-www-form-urlencoded` — `server.ts` registers that parser for the
 * registry token realm and it serves here too.
 */
const callbackBody = z.object({
  SAMLResponse: z.string().min(1),
  // SAML Bindings §3.4.3: at most 80 bytes. Optional in the SCHEMA so a malformed body is
  // still 400 for every actor (the authorization suite's claim); refused below if absent.
  RelayState: z.string().max(80).optional(),
})

/** Where the browser wants to land after signing in (P5a Task 4). Checked again on use. */
const loginQuery = z.object({ returnTo: z.string().max(512).optional() })

export async function registerAuthRoutes(
  app: FastifyInstance,
  deps: ServerDeps,
): Promise<void> {
  /**
   * §9: *"Manifest itself is an SP."* This is where a person starts.
   *
   * There is no configuration switch and no development variant. The route that
   * used to sit beside this one — `POST /auth/dev-login` — minted a real session
   * for a named test user with no credential of any kind, and P2 measured that
   * its ONLY protection was a registration guard: removing that one condition
   * made it answer 200 with a live session. It is gone, along with
   * `MANIFEST_DEV_AUTH` and the two safeguards that existed to contain it. Tests
   * sign their own sessions in-process (`identity/testing.ts`), which needs no
   * HTTP surface for anyone to find.
   */
  app.get('/auth/login', async (request, reply) => {
    const { returnTo } = loginQuery.parse(request.query ?? {})
    // A sign-in BOUND TO THIS BROWSER (P5a Decision 16, `identity/login-state.ts`): the
    // nonce goes to the IdP as RelayState and into a cookie only this browser holds, and
    // the callback refuses an assertion whose RelayState is not the cookie's.
    const nonce = newLoginNonce()
    const https = deps.config.sp.origin.startsWith('https://')
    reply.setCookie(LOGIN_COOKIE, encodeLoginCookie(nonce, safeReturnTo(returnTo)), {
      httpOnly: true,
      path: '/auth',
      maxAge: LOGIN_TTL_SECONDS,
      secure: https,
      // The IdP's auto-submitting POST is CROSS-site wherever the IdP is on another
      // registrable domain, and Lax would drop this cookie from it. None needs Secure,
      // which a loopback http origin cannot give — the Docker tier's case, same-site.
      sameSite: https ? 'none' : 'lax',
    })
    return reply.redirect(await deps.samlSp.loginUrl(nonce), 302)
  })

  app.post(
    '/auth/saml/callback',
    // Logging in twice is not a domain mutation, and the IdP does not send an
    // Idempotency-Key. Same exemption `/auth/logout` carries. And the ONE route exempt
    // from §20's origin check (P5a Decision 15): the IdP's form posts it from the IdP's
    // origin, and its credential is an assertion bound to this browser, checked below.
    { config: { idempotency: 'exempt', csrf: 'exempt' } },
    async (request, reply) => {
      const { SAMLResponse, RelayState } = callbackBody.parse(request.body)
      // BOUND BEFORE IT IS VALIDATED: a refusal here never touches the SAML library, and
      // never consumes the request ID node-saml is holding for the real browser.
      const binding = readLoginCookie(request.cookies[LOGIN_COOKIE])
      if (
        binding === undefined ||
        RelayState === undefined ||
        !sameNonce(binding.nonce, RelayState)
      ) {
        console.error(
          JSON.stringify({
            level: 'error',
            msg: 'SAML assertion refused',
            error:
              'the sign-in was not started by this browser (no login cookie, or a RelayState that is not its nonce)',
          }),
        )
        throw new SamlError(
          'SAML_LOGIN_NOT_BOUND',
          'the assertion answers a sign-in this browser did not start',
        )
      }
      // Throws SamlError on any refusal — bad signature, wrong audience,
      // expired, unsolicited — which `toErrorResponse` maps to 401 with an
      // envelope that names no detail. The detail goes to the operator here,
      // through `console.error` and not `request.log.error`: this server is
      // built with `logger: false`, under which the logger exists, accepts the
      // call and writes nothing (measured — Session 4).
      let identity
      try {
        identity = await deps.samlSp.validate(SAMLResponse)
      } catch (error) {
        console.error(
          JSON.stringify({
            level: 'error',
            msg: 'SAML assertion refused',
            error: (error as Error).message,
          }),
        )
        throw error
      }

      const user = await upsertUserFromAssertion(deps.db, identity)
      reply.setCookie(
        SESSION_COOKIE,
        signSession(issueSession(user), deps.config.sessionSecret),
        {
          httpOnly: true,
          sameSite: 'lax',
          // From the ORIGIN, not from MANIFEST_ENV (P5a Task 3): the console's origin is
          // https in development too, and a cookie without Secure on an https origin is
          // one a network position can read the day anything is served over plain http.
          secure: deps.config.sp.origin.startsWith('https://'),
          path: '/',
          maxAge: SESSION_TTL_MS / 1000,
        },
      )
      // The login cookie is spent: a second assertion cannot be bound with it.
      reply.clearCookie(LOGIN_COOKIE, { path: '/auth' })
      // 302, not 200 with a body: the browser arrives here from the IdP's
      // auto-submitting form, so whatever this returns is what the person sees.
      //
      // To the path the browser asked for at /auth/login, re-checked on the way out
      // (`login-state.ts`), and `/` by default — the console's home, which P5c serves on
      // this origin and which the edge answers until then with a page naming /v1/ (P5a
      // Task 4). It was `/v1/me` from P5a Task 2 until then, and `/` once before THAT,
      // when the control plane was reached directly and `/` was its own 404: a
      // successful login that read exactly like a failed one. `?returnTo=/v1/me` lands
      // where that said.
      return reply.redirect(binding.returnTo, 302)
    },
  )

  app.get('/v1/me', async (request) => {
    const actor = requireActor(request)
    return { id: actor.userId, puid: actor.puid, role: actor.platformRole }
  })

  app.post(
    '/auth/logout',
    { config: { idempotency: 'exempt' } },
    async (_request, reply) => {
      reply.clearCookie(SESSION_COOKIE, { path: '/' })
      return reply.status(204).send()
    },
  )
}
