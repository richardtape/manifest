import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  issueSession,
  signSession,
  upsertUserFromAssertion,
} from '../../identity/index.js'
import { requireActor, type ServerDeps } from '../server.js'

/**
 * The SAML POST binding. The IdP auto-submits a form to the ACS, so the body is
 * `application/x-www-form-urlencoded` — `server.ts` registers that parser for the
 * registry token realm and it serves here too.
 */
const callbackBody = z.object({ SAMLResponse: z.string().min(1) })

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
  app.get('/auth/login', async (_request, reply) => {
    return reply.redirect(await deps.samlSp.loginUrl(), 302)
  })

  app.post(
    '/auth/saml/callback',
    // Logging in twice is not a domain mutation, and the IdP does not send an
    // Idempotency-Key. Same exemption `/auth/logout` carries.
    { config: { idempotency: 'exempt' } },
    async (request, reply) => {
      const { SAMLResponse } = callbackBody.parse(request.body)
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
      // 302, not 200 with a body: the browser arrives here from the IdP's
      // auto-submitting form, so whatever this returns is what the person sees.
      //
      // To `/v1/me` (it was `/auth/me` until P5a Task 2 put every resource under
      // `/v1`, D23.8) and NOT to `/`, which is what this said first and is a
      // route the control plane does not serve — so a successful login ended on
      // a 404 that reads exactly like a failed one. There is no console yet
      // (D22's is P5's), and until there is, the honest place to land is the one
      // that says who you are. P5 changes this line, not the flow.
      return reply.redirect('/v1/me', 302)
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
