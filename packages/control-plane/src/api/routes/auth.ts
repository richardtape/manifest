import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  LOGIN_COOKIE,
  LOGIN_TTL_SECONDS,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  STEP_UP_COOKIE,
  STEP_UP_TTL_SECONDS,
  SamlError,
  encodeLoginCookie,
  issueSession,
  newLoginNonce,
  readLoginCookie,
  safeReturnTo,
  sameNonce,
  signSession,
  stepUpSession,
  upsertUserFromAssertion,
  verifySession,
} from '../../identity/index.js'
import { requireSession } from '../actor.js'
import type { ServerDeps } from '../server.js'

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

/**
 * The query string's values decoded as URI COMPONENTS, not as a form — see the note
 * at the SLO route's call site. `decodeURIComponent` leaves `+` alone, which base64
 * requires; every form decoder turns it into a space and corrupts the message.
 */
export function rawQueryValues(originalQuery: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const pair of originalQuery.split('&')) {
    if (pair === '') continue
    const eq = pair.indexOf('=')
    const key = eq === -1 ? pair : pair.slice(0, eq)
    const value = eq === -1 ? '' : pair.slice(eq + 1)
    try {
      out[decodeURIComponent(key)] = decodeURIComponent(value)
    } catch {
      // A malformed percent-escape is a refusal upstream, never a crash here.
      out[key] = value
    }
  }
  return out
}

export async function registerAuthRoutes(
  app: FastifyInstance,
  deps: ServerDeps,
): Promise<void> {
  /**
   * The session cookie's options, in ONE place, because the sign-in and the step-up both
   * write it and two statements of the same flags is how one of them ends up without
   * `Secure` (P6a Task 8). `maxAge` is the caller's, and that difference is the point:
   * a step-up must not extend a session's life.
   */
  const sessionCookie = (maxAgeSeconds: number) => ({
    httpOnly: true,
    sameSite: 'lax' as const,
    // From the ORIGIN, not from MANIFEST_ENV (P5a Task 3): the console's origin is
    // https in development too, and a cookie without Secure on an https origin is
    // one a network position can read the day anything is served over plain http.
    secure: deps.config.sp.origin.startsWith('https://'),
    path: '/',
    maxAge: maxAgeSeconds,
  })

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

  /**
   * §20's STEP-UP RE-AUTHENTICATION, deferred explicitly until the routes it protects
   * landed — *"step-up's own second authentication round trip lands with the routes it
   * protects"* (Rich, 2026-09-17). This is that round trip (P6a Task 8).
   *
   * A browser NAVIGATION, not a fetch: it ends at the IdP and comes back through the ACS,
   * exactly as `/auth/login` does. A `fetch` would follow the redirect and post the IdP's
   * login form to nowhere.
   *
   * **IT REQUIRES A SESSION ALREADY.** Stepping up is re-proving who you are, not signing
   * in — so a token is refused the credential class (`403 TOKEN_CREDENTIAL_REFUSED`) and
   * the callback refuses an assertion for a DIFFERENT person than the session in hand,
   * which is the check that stops one person stepping up into another's session.
   */
  app.get('/auth/step-up', async (request, reply) => {
    const actor = requireSession(request)
    const { returnTo } = loginQuery.parse(request.query ?? {})
    const nonce = newLoginNonce()
    const https = deps.config.sp.origin.startsWith('https://')
    reply.setCookie(STEP_UP_COOKIE, encodeLoginCookie(nonce, safeReturnTo(returnTo)), {
      httpOnly: true,
      path: '/auth',
      maxAge: STEP_UP_TTL_SECONDS,
      secure: https,
      // The IdP's auto-submitting POST is CROSS-site, exactly as at `/auth/login`.
      sameSite: https ? 'none' : 'lax',
    })
    // §14: the puid and nothing else — no assertion, no cookie, no secret. A step-up that
    // leaves no operator line hides the next one (ORIENTATION §4).
    console.error(`[auth] step-up started for ${actor.puid}`)
    return reply.redirect(await deps.samlSp.stepUpUrl(nonce), 302)
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

      /**
       * §20's STEP-UP, told apart from an ordinary sign-in BY ITS OWN COOKIE (Decision
       * 17) and not by a second ACS path — because the ACS is registered with the IdP in
       * the platform's SP row, so a second one would be a registration change (§9).
       *
       * This branch runs FIRST and is entered only when `manifest_stepup`'s nonce is the
       * `RelayState` in hand, so an ordinary sign-in is unaffected by a stale step-up
       * cookie and a step-up cannot be completed by an assertion bound to a sign-in.
       */
      const stepUp = readLoginCookie(request.cookies[STEP_UP_COOKIE])
      if (
        stepUp !== undefined &&
        RelayState !== undefined &&
        sameNonce(stepUp.nonce, RelayState)
      ) {
        // The session must still be here: a step-up is an ADDITION to one, never a way to
        // get one. An expired session here means signing in again, which `/auth/login`
        // does — and answering it by minting a session would make this route a second,
        // quieter front door.
        const current = verifySession(
          request.cookies[SESSION_COOKIE] ?? '',
          deps.config.sessionSecret,
        )
        if (current === null) {
          console.error('[auth] step-up REFUSED: the browser had no valid session')
          throw new SamlError(
            'SAML_STEP_UP_NO_SESSION',
            'the step-up answered no session — sign in again',
          )
        }
        // VALIDATED BY THE INSTANCE THAT ISSUED THE REQUEST. node-saml's InResponseTo
        // cache is per instance (Decision 17), so `validate` would refuse this outright
        // as unsolicited — a refusal that would have read as a broken assertion.
        let identity
        try {
          identity = await deps.samlSp.validateStepUp(SAMLResponse)
        } catch (error) {
          console.error(
            JSON.stringify({
              level: 'error',
              msg: 'SAML step-up assertion refused',
              error: (error as Error).message,
            }),
          )
          throw error
        }
        // AND IT MUST BE THE SAME PERSON. Without this line, signing in as ANYBODY at the
        // IdP stamps `steppedUpAt` onto whoever's session is in this browser — which is
        // the whole control turned inside out. Nothing else in the suite sees it.
        if (identity.ubcCwlPuid !== current.puid) {
          console.error(
            '[auth] step-up REFUSED: the assertion is for a different person than the session',
          )
          throw new SamlError(
            'SAML_STEP_UP_WRONG_USER',
            'that sign-in was for a different person than the session in this browser',
          )
        }
        reply.setCookie(
          SESSION_COOKIE,
          // The IdP's NEWEST handle on this person: a sign-out quotes the session the IdP
          // holds now, and the step-up's assertion is the most recent word on that.
          signSession(
            stepUpSession({ ...current, idp: identity.idpSession ?? current.idp }),
            deps.config.sessionSecret,
          ),
          // THE REMAINING LIFE, not a fresh twelve hours: re-signing carries `expiresAt`
          // through unchanged, so a browser cookie that outlived it would simply be
          // refused by `verifySession` — and a step-up that LOOKED like it extended a
          // session would be the more expensive kind of wrong.
          sessionCookie(Math.max(0, Math.floor((current.expiresAt - Date.now()) / 1000))),
        )
        // Spent, exactly as the login cookie is: it cannot bind a second assertion.
        reply.clearCookie(STEP_UP_COOKIE, { path: '/auth' })
        console.error(`[auth] step-up COMPLETED for ${current.puid}`)
        return reply.redirect(stepUp.returnTo, 302)
      }

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
        signSession(
          issueSession(user, Date.now(), identity.idpSession),
          deps.config.sessionSecret,
        ),
        sessionCookie(SESSION_TTL_MS / 1000),
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

  /**
   * §9's SINGLE LOGOUT endpoint, and the one `sso/platform.ts` registers as this
   * SP's `sloUrl`. The IdP delivers a LogoutRequest over the HTTP-Redirect binding,
   * which is a **GET** with `?SAMLRequest=` — so declaring this path `POST` only
   * meant signing out of ANY deployed app answered `404 ROUTE_NOT_FOUND`, left a
   * person on raw JSON, and never ended Manifest's own session (P5c sitting 9, F11).
   * The blueprint this platform GENERATES had already learned the same lesson on
   * 2026-09-09; `skeleton/server.js` says so in as many words.
   *
   * IT REQUIRES A SIGNED REQUEST AND IS NOT A SIGN-OUT LINK. A bare GET that clears
   * a cookie is a logout-CSRF primitive any other origin can fire with an `<img>`,
   * and §20 keeps the console's own sign-out on POST behind the Origin check for
   * exactly that reason. This route answers the IdP, and nothing else.
   */
  app.get(
    '/auth/logout',
    { config: { idempotency: 'exempt' } },
    async (request, reply) => {
      const query = (request.query ?? {}) as Record<string, unknown>
      const refusal = (hint: string) =>
        reply.status(400).send({
          error: {
            code: 'SAML_LOGOUT_REJECTED',
            message: 'the single-logout request could not be verified',
            hint,
          },
        })

      // ONE OPERATOR LINE PER SINGLE LOGOUT, arrival and outcome both. §4: a
      // failure that leaves no operator line hides the next one — and F11 was
      // invisible for exactly that reason, answering `404` with nobody watching.
      // A LogoutRequest carries no secret; the nameID is transient by §9's row.
      const isResponse =
        typeof query.SAMLResponse === 'string' && query.SAMLResponse.length > 0
      console.error(
        isResponse
          ? `[auth] single logout: LogoutResponse arrived (${(query.SAMLResponse as string).length} chars) — the IdP answering a console sign-out`
          : `[auth] single logout: LogoutRequest ${typeof query.SAMLRequest === 'string' ? `arrived (${query.SAMLRequest.length} chars)` : 'ABSENT'}`,
      )

      // THE IdP ANSWERING A CONSOLE SIGN-OUT (P6b F10). Manifest's session was cleared when
      // the sign-out began, so nothing ends here: a verified answer lands on the console's
      // home, and `/` is fixed rather than read from RelayState, so this is no redirector.
      if (isResponse) {
        try {
          const originalQuery = (request.raw.url ?? '').split('?')[1] ?? ''
          await deps.samlSp.completeSpLogout(rawQueryValues(originalQuery), originalQuery)
        } catch (cause) {
          console.error(
            `[auth] single logout refused: ${cause instanceof Error ? cause.message : String(cause)}`,
          )
          return refusal(
            'The IdP’s answer could not be verified. Manifest’s own session had already ended; the control plane’s log has the reason.',
          )
        }
        console.error('[auth] single logout: the IdP confirmed the console sign-out')
        return reply.redirect('/', 302)
      }

      if (typeof query.SAMLRequest !== 'string' || query.SAMLRequest.length === 0) {
        return refusal(
          'This is the SP’s single-logout endpoint, where the Manifest IdP delivers its LogoutRequest or answers one. A person signing out of the console uses POST /auth/logout.',
        )
      }

      let redirectTo: string
      try {
        // The RAW query string: the redirect binding signs the bytes as sent.
        const originalQuery = (request.raw.url ?? '').split('?')[1] ?? ''
        // AND THE RAW *VALUES*, decoded as URI components rather than as a form.
        // Fastify's query parser applies form semantics, in which `+` means SPACE —
        // but `+` is a LITERAL character of the base64 alphabet and the redirect
        // binding sends percent-encoded base64. `Buffer.from(x, 'base64')` then
        // silently DROPS the spaces, leaving a SHORT deflate stream, and node-saml
        // fails in `inflateRawAsync` with "unexpected end of file" long before it
        // reaches the signature. Measured against the real Manifest IdP, and again
        // offline: the same bytes sent `%2B`-encoded inflate; sent as a literal `+`
        // they do not (P5c sitting 9, F16).
        redirectTo = await deps.samlSp.completeIdpLogout(
          rawQueryValues(originalQuery),
          originalQuery,
        )
      } catch (cause) {
        // `request.log` writes nothing here (§4), and a refusal that leaves no
        // operator line hides the next one. Never with a secret in it.
        console.error(
          `[auth] single logout refused: ${cause instanceof Error ? cause.message : String(cause)}`,
        )
        return refusal(
          'The request could not be verified against the IdP’s certificate. The control plane’s log has the reason.',
        )
      }

      // ONLY after the request verified. A session must not be ended by a request
      // this process could not prove came from its own IdP.
      reply.clearCookie(SESSION_COOKIE, { path: '/' })
      console.error('[auth] single logout: ACCEPTED — session cleared')
      return reply.redirect(redirectTo, 302)
    },
  )

  /**
   * THE CONSOLE'S SIGN-OUT, which now ends the IdP's session as well as Manifest's (P6b
   * F10, fixed 2026-09-24). It answers WHERE THE BROWSER GOES NEXT rather than redirecting,
   * because the console calls it with `fetch`, which would follow a redirect to the IdP
   * cross-origin and fail: `redirectTo` is the IdP's SingleLogoutService with a signed
   * LogoutRequest, or `/` for a session the IdP gave no handle for (an older cookie).
   *
   * STILL A POST BEHIND §20's ORIGIN CHECK, so no other page can fire it. And Manifest's
   * session is cleared HERE, before the IdP is asked anything: a round trip that fails
   * half way must not leave the person signed in to the console.
   */
  app.post(
    '/auth/logout',
    { config: { idempotency: 'exempt' } },
    async (request, reply) => {
      const session = verifySession(
        request.cookies[SESSION_COOKIE] ?? '',
        deps.config.sessionSecret,
      )
      reply.clearCookie(SESSION_COOKIE, { path: '/' })
      if (session?.idp == null) {
        if (session !== null) {
          console.error(
            `[auth] console sign-out for ${session.puid}: the session carries no IdP handle (an older cookie), so only Manifest's session ended`,
          )
        }
        return reply.status(200).send({ redirectTo: '/' })
      }
      console.error(
        `[auth] console sign-out for ${session.puid}: single logout sent to the IdP`,
      )
      return reply
        .status(200)
        .send({ redirectTo: await deps.samlSp.logoutUrl(session.idp) })
    },
  )
}
