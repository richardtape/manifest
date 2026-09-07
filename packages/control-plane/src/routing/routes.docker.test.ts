import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, expect, it } from 'vitest'
// Through `runtime/`'s public TEST surface, not a deep path into runtime/docker/.
// §5's boundary rule is enforced by `module-boundaries.test.ts`, which is why
// `runtime/testing.ts` exists.
import { describeDocker, REPO_ROOT } from '../runtime/testing.js'
import { createCaddyClient } from './caddy.js'
import { applyRoute, reapplyAllRoutes, removeRoute } from './routes.js'

const run = promisify(execFile)
const caddy = createCaddyClient('http://127.0.0.1:7119')
const deps = { caddy, servers: { internal: 'srv0', public: 'srv0' } }
const HOST = 'routetest.staging.manifest.internal'
const APP = 'mf-routetest-staging-app'
const CA = join(REPO_ROOT, 'infra/ca/manifest-root.crt')

/**
 * Through the edge, FROM A CONTAINER, over HTTPS, with the platform CA — the same
 * path `scripts/verify.sh` uses. A host process cannot reach container IPs on
 * Docker Desktop (S1), so the probe has to run inside one.
 *
 * It returns the BODY, not the status code, and that is the whole point. The
 * Caddyfile's `*.staging.manifest.internal` wildcard answers **200** for every host
 * in the zone whether or not a route exists (measured 2026-09-06:
 * `manifest OK host=routetest.staging.manifest.internal`). A status assertion
 * therefore cannot tell "reached the app" from "reached the fallback" — it passes
 * with no route at all, and can never go red when the route is removed.
 * `plain HTTP` is wrong for a second reason: the edge listens on :443 only and
 * answers **308** to http://, so every positive assertion would fail too.
 */
const bodyThroughEdge = async (host: string): Promise<string> =>
  (
    await run('docker', [
      'run',
      '--rm',
      '--network',
      'manifest-platform',
      '--dns',
      '10.89.0.53',
      '-v',
      `${CA}:/ca.crt:ro`,
      'curlimages/curl:8.11.1',
      '--cacert',
      '/ca.crt',
      '-sS',
      '-m',
      '10',
      `https://${host}/`,
    ])
  ).stdout.trim()

/** The response headers, so §20's protections are asserted ON THE WIRE. */
const headersThroughEdge = async (host: string): Promise<string> =>
  (
    await run('docker', [
      'run',
      '--rm',
      '--network',
      'manifest-platform',
      '--dns',
      '10.89.0.53',
      '-v',
      `${CA}:/ca.crt:ro`,
      'curlimages/curl:8.11.1',
      '--cacert',
      '/ca.crt',
      '-sS',
      '-m',
      '10',
      '-o',
      '/dev/null',
      '-D',
      '-',
      `https://${host}/`,
    ])
  ).stdout.toLowerCase()

/** What the app says. */
const APP_BODY = 'ok'
/** What the Caddyfile wildcard says when NO route matches. The discriminator. */
const FALLBACK = 'manifest OK host='

const spec = { hostname: HOST, upstream: `${APP}:8080`, kind: 'staging' as const }

describeDocker('runtime routing through the Caddy admin API', () => {
  afterAll(async () => {
    await removeRoute(deps, HOST, 'staging').catch(() => undefined)
    await run('docker', ['rm', '-f', APP]).catch(() => undefined)
  })

  it('routes a hostname to a container after boot', async () => {
    await run('docker', ['rm', '-f', APP]).catch(() => undefined)
    await run('docker', [
      'run',
      '-d',
      '--name',
      APP,
      '--network',
      'manifest-platform',
      'alpine:3.22',
      'sh',
      '-c',
      'while true; do printf "HTTP/1.1 200 OK\\r\\nContent-Length: 2\\r\\n\\r\\nok" | nc -l -p 8080; done',
    ])

    // The control: BEFORE the route exists the wildcard already answers 200. This
    // is what makes the assertions below mean something.
    expect(await bodyThroughEdge(HOST)).toContain(FALLBACK)

    await applyRoute(deps, spec)
    expect(await bodyThroughEdge(HOST)).toBe(APP_BODY)
  })

  // §20's "baseline protections live where an app cannot remove them", asserted on
  // the wire rather than in the JSON we sent. The app is 30 bytes of `nc` and sets
  // no headers of its own, so every one of these came from the route.
  it("serves §20's edge protections on the app's own responses", async () => {
    const headers = await headersThroughEdge(HOST)
    expect(headers).toContain('strict-transport-security: max-age=31536000')
    expect(headers).toContain('x-content-type-options: nosniff')
    expect(headers).toContain('referrer-policy: strict-origin-when-cross-origin')
    expect(headers).toContain("content-security-policy: frame-ancestors 'self'")
  })

  it('is idempotent — applying twice leaves ONE route for the host', async () => {
    await applyRoute(deps, spec)
    const routes = await caddy.getRoutes('srv0')
    expect(routes.filter((r) => r.match?.[0]?.host?.includes(HOST))).toHaveLength(1)
    expect(await bodyThroughEdge(HOST)).toBe(APP_BODY)
  })

  it('removes the route by id, and the host falls back to the wildcard', async () => {
    await removeRoute(deps, HOST, 'staging')
    expect(await bodyThroughEdge(HOST)).toContain(FALLBACK)
  })

  // S1's lost route, as a test. This is the property §12 gained a sentence for.
  it('re-applies every route after the edge is restarted', async () => {
    await reapplyAllRoutes(deps, [spec])
    expect(await bodyThroughEdge(HOST)).toBe(APP_BODY)

    await run('docker', ['restart', 'manifest-caddy'])
    await new Promise((r) => setTimeout(r, 5000))
    // The route is GONE, and this assertion is the finding rather than a bug.
    expect(await bodyThroughEdge(HOST)).toContain(FALLBACK)

    await reapplyAllRoutes(deps, [spec])
    expect(await bodyThroughEdge(HOST)).toBe(APP_BODY)
  })
})
