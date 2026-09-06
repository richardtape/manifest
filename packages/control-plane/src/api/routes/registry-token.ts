import type { FastifyPluginAsync } from 'fastify'
import {
  applyGrantPolicy,
  mintRegistryToken,
  parseScopeStrings,
  verifyBuildCredential,
} from '../../runtime/index.js'

export interface RegistryTokenDeps {
  keyPem: string
  certPem: string
  issuer: string
  service: string
  buildCredentialSecret: string
}

/**
 * The realm `registry:2` advertises. Deliberately NOT behind the session hook: its
 * caller is a build tool, and its credential is the short-lived build credential
 * verified below rather than a Manifest session.
 */
export const registryTokenRoutes =
  (deps: RegistryTokenDeps): FastifyPluginAsync =>
  async (app) => {
    const issue = (scopes: string[], username: string, password: string) => {
      const verified = verifyBuildCredential(
        deps.buildCredentialSecret,
        username,
        password,
      )
      // An unverifiable credential is granted NOTHING rather than refused with a
      // 401. registry:2 turns an empty grant into the same `insufficient_scope` the
      // client already knows how to report, whereas a 401 from the realm makes the
      // client retry the realm in a loop.
      const authorized = verified?.repository ?? '!no-such-repository'
      const access = applyGrantPolicy(authorized, parseScopeStrings(scopes))
      const token = mintRegistryToken(deps.keyPem, deps.certPem, {
        issuer: deps.issuer,
        service: deps.service,
        subject: verified?.repository ?? 'anonymous',
        access,
      })
      return {
        token,
        access_token: token,
        expires_in: 300,
        issued_at: new Date().toISOString(),
      }
    }

    // `idempotency: 'exempt'` is NOT optional here, and it is not decoration.
    // P2's server applies D23.6 to every mutating route through a preHandler hook:
    // a POST with no `Idempotency-Key` header of at least 8 characters is refused
    // with 400 IDEMPOTENCY_KEY_REQUIRED. BuildKit and the Docker daemon will never
    // send that header — they are speaking the distribution token protocol, not
    // Manifest's API — so without this the builder cannot get a token at all, and
    // the symptom is a 400 from a route that looks correctly implemented.
    // Minting a token is also not a domain mutation; it is authentication, which
    // is exactly why P2 exempts `/auth/*` the same way.
    //
    // The form Docker 29 and BuildKit actually use. Everything is in the body.
    app.post(
      '/internal/registry/token',
      { config: { idempotency: 'exempt' } },
      async (request) => {
        const body = (request.body ?? {}) as Record<string, string>
        return issue(
          body.scope === undefined ? [] : [body.scope],
          body.username ?? '',
          body.password ?? '',
        )
      },
    )

    // The GET + Basic form. In the distribution spec and used by other clients;
    // NOT observed in use by anything in this platform. Ten lines, and its absence
    // would be a silent incompatibility rather than a visible one.
    app.get('/internal/registry/token', async (request) => {
      const query = request.query as { scope?: string | string[] }
      const scopes = query.scope === undefined ? [] : [query.scope].flat()
      const basic = Buffer.from(
        (request.headers.authorization ?? '').replace(/^Basic /i, ''),
        'base64',
      ).toString()
      const index = basic.indexOf(':')
      return issue(scopes, basic.slice(0, index), basic.slice(index + 1))
    })
  }
