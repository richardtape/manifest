import { readFile } from 'node:fs/promises'
import http from 'node:http'
import openapiTS, { astToString } from 'openapi-typescript'
import { describe, expect, it } from 'vitest'
import { createManifestClient, ManifestApiError, unwrap } from './index.js'

/** The generated file without the banner the CLI puts above it. */
const body = (text: string) => text.replace(/^\/\*\*[\s\S]*?\*\/\s*/, '')

describe('@manifest/contract', () => {
  it('holds exactly the types the checked-in document generates — `pnpm contract:generate` if not', async () => {
    const generated = astToString(
      await openapiTS(new URL('../openapi.json', import.meta.url)),
    )
    const checkedIn = await readFile(new URL('./schema.d.ts', import.meta.url), 'utf8')
    expect(
      body(checkedIn) === body(generated),
      'src/schema.d.ts is stale — run `pnpm contract:generate`',
    ).toBe(true)
  })

  it('is the version the document says it is', async () => {
    const pkg = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { version: string }
    const document = JSON.parse(
      await readFile(new URL('../openapi.json', import.meta.url), 'utf8'),
    ) as { info: { version: string } }
    // The document's own version is held to CONTRACT_VERSION by the control plane's drift
    // test, so package = document is the whole chain without importing the control plane.
    expect(pkg.version).toBe(document.info.version)
  })

  it('sends the session and the origin a non-browser client must, and reads the envelope on failure', async () => {
    const seen: Record<string, string | undefined>[] = []
    const server = http.createServer((req, res) => {
      seen.push({ cookie: req.headers.cookie, origin: req.headers.origin })
      if (req.headers.cookie === 'manifest_session=good') {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(
          JSON.stringify({
            id: '6f1c1d2e-8a4b-4c3d-9e2f-1a2b3c4d5e6f',
            puid: 'ins000001',
            displayName: 'Test Instructor',
            email: 'instructor@ubc.ca',
            role: 'member',
          }),
        )
      } else {
        res.writeHead(401, { 'content-type': 'application/json' })
        res.end(
          JSON.stringify({
            error: {
              code: 'UNAUTHENTICATED',
              message: 'a session is required',
              hint: 'Log in first.',
            },
          }),
        )
      }
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`

    const me = unwrap(
      await createManifestClient({ origin, session: 'good' }).GET('/v1/me'),
      'getMe',
    )
    expect(me.puid).toBe('ins000001')
    expect(seen[0]).toEqual({ cookie: 'manifest_session=good', origin })

    const refused = await createManifestClient({ origin, session: 'bad' }).GET('/v1/me')
    expect(() => unwrap(refused, 'getMe')).toThrow(ManifestApiError)
    try {
      unwrap(refused, 'getMe')
    } catch (error) {
      expect((error as ManifestApiError).status).toBe(401)
      expect((error as ManifestApiError).code).toBe('UNAUTHENTICATED')
    }
    server.close()
  })

  it('sends a delegated token as a bearer, and NO Origin with it (D24, P5b Task 5)', async () => {
    const seen: Record<string, string | undefined>[] = []
    const server = http.createServer((req, res) => {
      seen.push({
        authorization: req.headers.authorization,
        origin: req.headers.origin,
        cookie: req.headers.cookie,
      })
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify([]))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`

    await createManifestClient({ origin, token: 'mft_abc_def' }).GET('/v1/projects')
    // No Origin and no cookie: §20's CSRF control protects a BROWSER credential, the API
    // exempts a bearer request from it, and an agent claiming the console's origin would
    // be stating something untrue about where the request came from.
    expect(seen[0]).toEqual({
      authorization: 'Bearer mft_abc_def',
      origin: undefined,
      cookie: undefined,
    })
    server.close()
  })

  it('refuses to carry both credentials, where the mistake is (D24)', () => {
    expect(() =>
      createManifestClient({
        origin: 'https://console.manifest.internal',
        session: 'a',
        token: 'mft_b_c',
      }),
    ).toThrow(/either a session or a delegated token/)
  })
})
