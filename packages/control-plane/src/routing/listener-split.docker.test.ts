import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'
// Through `runtime/`'s public TEST surface, not a deep path into runtime/docker/.
import { describeDocker, REPO_ROOT } from '../runtime/testing.js'

const run = promisify(execFile)

/**
 * §12: "The staging-is-UBC-only requirement is met by listener assignment, not IP
 * allowlisting: a misconfigured allowlist leaks quietly, whereas a route bound to the
 * wrong listener is simply unreachable."
 *
 * THIS IS THE FIRST TEST IN THE REPOSITORY THAT COULD EVER HAVE FAILED FOR THAT REASON.
 * Both listeners were `srv0` until P6a (R3), so the claim was modelled and untested —
 * §21's honest divergence 2. The edge now runs TWO servers in ONE container: `srv0` on
 * :443 (the internal listener, 127.0.0.2 from the host) and `srv1` on :8443 (the public
 * listener, 127.0.0.3 from the host). One container, so one `caddy-data` volume and one
 * internal CA.
 *
 * IT ASSERTS THE SHAPE OF THE ANSWER AND NOT A STATUS. The edge's wildcard answers 200
 * for any name in its zone, so `200` proves nothing and could never go red; the
 * placeholder's own `listener=` word is the only thing that tells the two servers apart
 * from outside. That is this repository's most repeated lesson (`routes.docker.test.ts`).
 *
 * AND WHAT "UNREACHABLE" LOOKS LIKE IS `200` WITH AN EMPTY BODY — measured in sitting 2,
 * and it is NOT what sitting 1's F3 predicted. F3 expected a TLS handshake failure, from
 * probing a name in no zone at all; but Caddy's certificate cache is APP-GLOBAL rather
 * than per-server, so the `*.manifest.internal` certificate srv1's site causes to be
 * issued is presented by srv0 too. The handshake succeeds, srv0 matches no site for that
 * Host, and Caddy answers an empty 200. Only a name no certificate anywhere in the config
 * covers produces the `(35) … tlsv1 alert internal error` F3 recorded.
 *
 * THAT IS WHY THESE ASSERTIONS READ THE BODY AND NEVER THE STATUS, AND WHY THEY ASSERT
 * THE ABSENCE OF `listener=` RATHER THAN A FAILURE. `200` is the answer whether the split
 * is intact or leaking, so a status assertion would be green in both directions, and an
 * assertion that curl FAILS would be red against a correctly configured platform.
 *
 * IT READS THE REAL EDGE RATHER THAN A MODEL OF ONE. Unlike
 * `edge-source-refusal.docker.test.ts`, which must build a throwaway because its negative
 * direction would weaken the running edge, every probe here is a plain GET — nothing is
 * reloaded, nothing is edited, and the configuration under test is the one the platform
 * is actually serving, which is what Task 4's routes will be written into.
 */
const NET = 'manifest-platform'
const DNS = '10.89.0.53'
const PROBE = 'curlimages/curl:8.11.1'
const CA = join(REPO_ROOT, 'infra/ca/manifest-root.crt')

/**
 * A production-zone name NO Caddyfile site names, so only a wildcard can answer it.
 * `cdn` is reserved (§23), so no project can ever take the slug and quietly turn this
 * into a test of an app's own route. It is deliberately NOT `edge.manifest.internal`:
 * that name has its own `srv0` site and is pinned to the internal listener, so it cannot
 * stand for a production hostname (infra/lib/common.sh says so where the constant lives).
 */
const PRODUCTION_HOST = 'cdn.manifest.internal'
/** A staging-zone name, matched by the srv0 wildcard and by nothing on srv1. */
const STAGING_HOST = 'split-probe.staging.manifest.internal'

/** The container-side port of each server. Decision 15: the PROBE carries a port, a person's URL does not. */
const INTERNAL_PORT = 443
const PUBLIC_PORT = 8443

/**
 * From a container on the platform network, over HTTPS, with the platform CA — the same
 * path `scripts/verify.sh` and `routes.docker.test.ts` use. A host process cannot reach a
 * container address on Docker Desktop (S1), so the probe has to run inside one.
 *
 * Returns stdout AND stderr together, and never throws. The expected answer for a
 * cross-listener probe is an EMPTY body with status 200, so an empty string here is a
 * pass rather than a fault — but if a probe ever does fail at the transport (a name no
 * certificate covers, say), curl writes that to stderr, and a helper that threw would
 * turn a readable measurement into a test failure with no message worth reading.
 */
async function probe(host: string, port: number): Promise<string> {
  const args = [
    'run',
    '--rm',
    '--network',
    NET,
    '--dns',
    DNS,
    '-v',
    `${CA}:/ca.crt:ro`,
    PROBE,
    '--cacert',
    '/ca.crt',
    '-sS',
    '-m',
    '10',
    `https://${host}:${port}/`,
  ]
  try {
    const { stdout } = await run('docker', args)
    return stdout.trim()
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string }
    return `${e.stdout ?? ''}${e.stderr ?? ''}`.trim()
  }
}

describeDocker('§12: a route bound to the wrong listener is simply unreachable', () => {
  it('a production hostname is answered by the public server and not by the internal one', async () => {
    // THE POSITIVE HALF FIRST. Without it a platform serving nothing at all would pass
    // the refusal below, which is P5c sitting 9's F16 in one line: every test fired
    // garbage at a route that refuses everything, and they all passed.
    const onPublic = await probe(PRODUCTION_HOST, PUBLIC_PORT)
    expect(onPublic, 'the public server must serve the production zone').toContain(
      `host=${PRODUCTION_HOST}`,
    )
    expect(onPublic, 'and must say which listener it is').toContain('listener=public')

    // THE REFUSAL. Not "answered by the other server" but "not served at all" — asserting
    // the absence of `listener=` entirely is what makes this able to fail. `edge.` was
    // rejected as the probe name for exactly this reason: its own srv0 site would answer
    // `listener=internal` here and the assertion would pass straight through the leak.
    const onInternal = await probe(PRODUCTION_HOST, INTERNAL_PORT)
    expect(
      onInternal,
      'a production name must not be served on the internal listener',
    ).not.toContain('listener=')
  }, 120_000)

  it('a staging hostname is answered by the internal server and not by the public one', async () => {
    const onInternal = await probe(STAGING_HOST, INTERNAL_PORT)
    expect(onInternal, 'the internal server must serve the staging zone').toContain(
      `host=${STAGING_HOST}`,
    )
    expect(onInternal, 'and must say which listener it is').toContain('listener=internal')

    const onPublic = await probe(STAGING_HOST, PUBLIC_PORT)
    expect(
      onPublic,
      'a staging name must not be served on the public listener',
    ).not.toContain('listener=')
  }, 120_000)
})
