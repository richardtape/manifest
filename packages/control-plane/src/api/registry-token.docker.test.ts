import { execFile } from 'node:child_process'
import Fastify from 'fastify'
import { expect, it } from 'vitest'
import { promisify } from 'node:util'
import { issueBuildCredential } from '../runtime/index.js'
import { describeDocker, testIssuer } from '../runtime/testing.js'
import { registryTokenRoutes } from './routes/registry-token.js'

const run = promisify(execFile)

describeDocker('the registry token realm, end to end (§13)', () => {
  /**
   * THE REALM ITSELF, end to end. Everything above uses tokens from
   * mint-token.mjs, which never calls applyGrantPolicy — so those tests prove the
   * REGISTRY enforces a token's scope, not that the realm refuses to grant one.
   * Disabling the policy leaves all of them green.
   *
   * This drives the real route over real HTTP with a real build credential, asks
   * for a scope on someone else's repository, and then presents whatever comes
   * back to the real registry. Both halves must hold: the grant is empty, and the
   * registry refuses it.
   */
  it('the realm grants nothing on another repository, and the registry refuses that token', async () => {
    const { keyPem, certPem } = testIssuer()
    const secret = 'r'.repeat(32)
    const app = Fastify({ logger: false })
    app.addContentTypeParser(
      'application/x-www-form-urlencoded',
      { parseAs: 'string' },
      (_request, body, done) => {
        done(null, Object.fromEntries(new URLSearchParams(body as string)))
      },
    )
    await app.register(
      registryTokenRoutes({
        keyPem,
        certPem,
        issuer: 'manifest-control-plane',
        service: 'manifest-registry',
        buildCredentialSecret: secret,
      }),
    )
    await app.listen({ port: 0, host: '127.0.0.1' })
    const address = app.server.address()
    const port = typeof address === 'object' && address !== null ? address.port : 0
    try {
      const credential = issueBuildCredential(secret, {
        repository: 'local/scopetest',
        buildId: 'b1',
        expiresAt: Date.now() + 60_000,
      })
      // The OAuth2 POST form grant, exactly as Docker 29 and BuildKit send it.
      const response = await fetch(`http://127.0.0.1:${port}/internal/registry/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          scope: 'repository:local/someone-else:pull,push',
          username: credential.username,
          password: credential.password,
        }),
      })
      const { token } = (await response.json()) as { token: string }
      const claims = JSON.parse(
        Buffer.from(token.split('.')[1]!, 'base64url').toString(),
      ) as { access: { name: string; actions: string[] }[] }
      expect(claims.access).toEqual([
        { type: 'repository', name: 'local/someone-else', actions: [] },
      ])

      // And the registry agrees: an empty grant buys nothing.
      const { stdout } = await run('curl', [
        '-sS',
        '-o',
        '/dev/null',
        '-w',
        '%{http_code}',
        '-H',
        `Authorization: Bearer ${token}`,
        'http://127.0.0.1:7107/v2/local/someone-else/tags/list',
      ])
      expect(stdout).toBe('401')
    } finally {
      await app.close()
    }
  })
})
