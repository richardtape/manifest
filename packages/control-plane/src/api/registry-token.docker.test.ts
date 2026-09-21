import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { issueBuildCredential } from '../runtime/index.js'
import { describeDocker, REPO_ROOT } from '../runtime/testing.js'
import { registryTokenRoutes } from './routes/registry-token.js'

const run = promisify(execFile)

const REGISTRY = 'http://127.0.0.1:7107'
const SECRET = 'r'.repeat(32)
/** The sha256 of zero bytes: the one blob every run can push without adding anything. */
const EMPTY_BLOB =
  'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

describeDocker('the registry token realm, end to end (§13)', () => {
  /**
   * §13's *Integrity of the gate*: *"The image registry rejects pushes from app and sandbox
   * contexts. Only the builder may push. Without this, 'promotion never rebuilds' is
   * defeated by overwriting a tag."*
   *
   * THE REALM ITSELF, end to end. The unit tests in `runtime/docker/registry-auth.test.ts`
   * prove `applyGrantPolicy` trims a grant; this drives the real route over real HTTP with a
   * real build credential, takes whatever it grants, and presents it to the REAL registry
   * as a PUSH — `POST /v2/<repo>/blobs/uploads/`, the request every `docker push` and every
   * BuildKit export opens with. The registry's own answer is the measurement.
   *
   * **SIGNED BY THE REGISTRY'S OWN ISSUER, and that is the whole of P6a sitting 10's F1.**
   * This file used to sign with `testIssuer()` — a self-signed `CN=manifest-test-issuer` pair
   * that `registry:2` has never trusted (`REGISTRY_AUTH_TOKEN_ROOTCERTBUNDLE` is
   * `infra/registry-auth/token.crt`, `CN=manifest-control-plane`). So its assertion that *"the
   * registry agrees: an empty grant buys nothing"* was answered `401` for the SIGNATURE, not
   * for the grant, and would have been answered the same for a token granting everything.
   * `dockerDriverForTests` already says so in its own doc comment; this file had not heard.
   * The positive control below is what makes the refusal mean anything: with an untrusted
   * issuer it goes red, and so does a registry whose `service` no longer matches the realm's.
   */
  let app: FastifyInstance
  let realm: string

  beforeAll(async () => {
    app = Fastify({ logger: false })
    app.addContentTypeParser(
      'application/x-www-form-urlencoded',
      { parseAs: 'string' },
      (_request, body, done) => {
        done(null, Object.fromEntries(new URLSearchParams(body as string)))
      },
    )
    await app.register(
      registryTokenRoutes({
        keyPem: readFileSync(join(REPO_ROOT, 'infra/registry-auth/token.key'), 'utf8'),
        certPem: readFileSync(join(REPO_ROOT, 'infra/registry-auth/token.crt'), 'utf8'),
        // The two values `api/server.ts` passes, which `infra/compose.yaml` configures the
        // registry to expect — and which `make verify`'s realm check reads off the live
        // registry's own challenge.
        issuer: 'manifest-control-plane',
        service: 'manifest-registry',
        buildCredentialSecret: SECRET,
      }),
    )
    await app.listen({ port: 0, host: '127.0.0.1' })
    const address = app.server.address()
    const port = typeof address === 'object' && address !== null ? address.port : 0
    realm = `http://127.0.0.1:${port}/internal/registry/token`
  })

  afterAll(async () => {
    await app.close()
  })

  /** The OAuth2 POST form grant, exactly as Docker 29 and BuildKit send it. */
  async function grant(scope: string, username: string, password: string) {
    const response = await fetch(realm, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ scope, username, password }),
    })
    expect(response.status).toBe(200)
    const { token } = (await response.json()) as { token: string }
    const claims = JSON.parse(
      Buffer.from(token.split('.')[1]!, 'base64url').toString(),
    ) as {
      access: { type: string; name: string; actions: string[] }[]
    }
    return { token, access: claims.access }
  }

  /**
   * Open a blob upload — the first request of every push — and report the registry's status
   * and the upload's `Location`. curl rather than `fetch`: the registry answers a relative
   * `Location` carrying the upload's `_state`, and the headers are all this needs.
   */
  async function openUpload(repository: string, token: string) {
    const { stdout } = await run('curl', [
      '-sS',
      '-D',
      '-',
      '-o',
      '/dev/null',
      '-X',
      'POST',
      '-H',
      `Authorization: Bearer ${token}`,
      `${REGISTRY}/v2/${repository}/blobs/uploads/`,
    ])
    const lines = stdout.replace(/\r/g, '').split('\n')
    const status = Number(lines[0]!.split(' ')[1])
    const location = lines
      .find((l) => l.toLowerCase().startsWith('location:'))
      ?.slice('location:'.length)
      .trim()
    return { status, location }
  }

  /**
   * Finish the push the positive control opened, with the EMPTY blob — so the test leaves
   * exactly what any push leaves and nothing that grows.
   *
   * **NOT A CANCEL, AND THAT WAS MEASURED.** A cancel is a `DELETE`, which `registry:2`
   * authorizes as the `delete` ACTION (the push token that opened the upload is answered
   * `401`), and with a `delete` grant it answers `204` and still leaves the upload's
   * `hashstates/` behind — `distribution` 2.8.3 re-writes the hash state as the request
   * closes, after the cancel removed the rest — where the registry's own purger, which skips
   * an upload whose `startedat` it cannot read, will never reap it. Completing the upload
   * removes the upload's directory entirely. The empty blob is the same digest on every
   * run, so after the first run a push adds nothing at all: one zero-byte blob and one link
   * in `local/scopetest`, a repository the Docker tier's own builder suite already owns.
   */
  async function completeUpload(location: string, token: string) {
    const url = new URL(location.startsWith('http') ? location : `${REGISTRY}${location}`)
    url.searchParams.set('digest', EMPTY_BLOB)
    const { stdout } = await run('curl', [
      '-sS',
      '-o',
      '/dev/null',
      '-w',
      '%{http_code}',
      '-X',
      'PUT',
      '-H',
      `Authorization: Bearer ${token}`,
      '-H',
      'Content-Length: 0',
      '--data-binary',
      '',
      url.toString(),
    ])
    return stdout
  }

  const credentialFor = (repository: string) =>
    issueBuildCredential(SECRET, {
      repository,
      buildId: 'b1',
      expiresAt: Date.now() + 60_000,
    })

  it('grants a build a push on ITS OWN repository, and the registry accepts it — the positive control', async () => {
    /**
     * **THE POSITIVE CONTROL, FIRST** (P5c F16). Every other case here is a refusal, and a
     * realm that granted nothing — or a registry that refused every token — would pass all
     * of them. This is the one that can tell those apart from §13 holding.
     */
    const credential = credentialFor('local/scopetest')
    const { token, access } = await grant(
      'repository:local/scopetest:pull,push',
      credential.username,
      credential.password,
    )
    expect(access).toEqual([
      { type: 'repository', name: 'local/scopetest', actions: ['pull', 'push'] },
    ])
    const upload = await openUpload('local/scopetest', token)
    expect(upload.status).toBe(202)
    expect(upload.location, 'a 202 carries the upload it opened').toBeDefined()
    // And the push COMPLETES: `201 Created` is the registry saying the blob is stored.
    expect(await completeUpload(upload.location!, token)).toBe('201')
  })

  it('grants nothing on ANOTHER project’s repository, and the registry refuses the push', async () => {
    // §13's own case: one build overwriting another app's tag is how "promotion never
    // rebuilds" would be defeated.
    const credential = credentialFor('local/scopetest')
    const { token, access } = await grant(
      'repository:local/someone-else:pull,push',
      credential.username,
      credential.password,
    )
    expect(access).toEqual([
      { type: 'repository', name: 'local/someone-else', actions: [] },
    ])
    expect((await openUpload('local/someone-else', token)).status).toBe(401)
  })

  it('grants nothing to a caller holding no build credential — an app or a sandbox — even on the repository it names', async () => {
    /**
     * *"Rejects pushes from app and sandbox contexts."* Neither holds a build credential —
     * the control plane mints one per build, for its own buildx child (§12) — so the most an
     * app can present is a repository name and a guess. The realm grants an unverifiable
     * credential NOTHING rather than refusing it (`registry-token.ts` says why), and the
     * registry then refuses the push. Asking for the repository the forged username names is
     * the strongest form of the attempt: it is the one case the grant policy would honour if
     * the credential were not checked.
     */
    const forged = credentialFor('local/scopetest')
    const { token, access } = await grant(
      'repository:local/scopetest:pull,push',
      'local/scopetest',
      `${forged.password.slice(0, -1)}${forged.password.endsWith('0') ? '1' : '0'}`,
    )
    expect(access).toEqual([{ type: 'repository', name: 'local/scopetest', actions: [] }])
    expect((await openUpload('local/scopetest', token)).status).toBe(401)
  })
})
