import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, expect, it } from 'vitest'
import {
  createEngineClient,
  describeDocker,
  REPO_ROOT,
  resolveSocketPath,
} from '../runtime/testing.js'
import { createCaddyClient } from './caddy.js'
import {
  edgeIdentityProbe,
  edgeProbe,
  waitForIdentity,
  waitForReady,
} from './readiness.js'
import { applyRoute, removeRoute } from './routes.js'
import { stubAppArgs } from './testing.js'

const run = promisify(execFile)
const engine = createEngineClient({ socketPath: resolveSocketPath() })
const deps = {
  caddy: createCaddyClient('http://127.0.0.1:7119'),
  servers: { internal: 'srv0', public: 'srv0' },
}

const HOST = 'readyprobe.staging.manifest.internal'
/** In the zone, and holding no route. The wildcard's own hostname. */
const UNROUTED = 'readyprobe-unrouted.staging.manifest.internal'
const APP = 'mf-readyprobe-staging-app'
const INSTANCE = '33333333-3333-4333-8333-333333333333'
const CA = join(REPO_ROOT, 'infra/ca/manifest-root.crt')
/** A real certificate, and the WRONG one. The negative control's trust anchor. */
const WRONG_CA = join(REPO_ROOT, 'infra/registry-auth/token.crt')

/**
 * `edgeProbe` is the one part of readiness that touches Docker, and until this
 * suite existed nothing ran it before Task 17's demo. That is the shape of the
 * defect P2 shipped (nothing ever executed the boot entry point) and the one P3's
 * own self-review called its worst. Four seconds of Docker beats finding it there.
 */
describeDocker('edgeProbe — readiness through the edge, from a container', () => {
  beforeAll(async () => {
    // In beforeAll, not in the first `it`: defect 7 was three tests depending on a
    // side effect of the first one, which is the ordering shape behind five of P2's.
    await run('docker', ['rm', '-f', APP]).catch(() => undefined)
    // A real HTTP server, never `nc`, which answers before it is asked (`stubAppArgs`).
    await run('docker', stubAppArgs(APP, 'ok'))
    await applyRoute(deps, {
      hostname: HOST,
      upstream: `${APP}:8080`,
      kind: 'staging',
      instanceId: INSTANCE,
    })
  }, 60_000)

  afterAll(async () => {
    await removeRoute(deps, HOST, 'staging').catch(() => undefined)
    await run('docker', ['rm', '-f', APP]).catch(() => undefined)
  })

  it('reads 200 back from a routed app', async () => {
    const result = await waitForReady({
      url: `https://${HOST}/`,
      probe: edgeProbe(engine, HOST, '/', CA),
      timeoutMs: 30_000,
      intervalMs: 500,
    })
    expect(result.ready).toBe(true)
    expect(result.lastStatus).toBe(200)
  }, 60_000)

  // THE CONTROL THAT MATTERS. The edge serves a certificate from the platform CA
  // and `curlimages/curl` trusts no private root, so a probe without the right
  // trust anchor answers 000 for ever — and a deploy times out reading "the app is
  // slow to start". Same code path, one wrong argument, measured rather than
  // reasoned about.
  it('answers 0, never 200, when pointed at the wrong trust anchor', async () => {
    const result = await waitForReady({
      url: `https://${HOST}/`,
      probe: edgeProbe(engine, HOST, '/', WRONG_CA),
      timeoutMs: 1,
      intervalMs: 10,
    })
    expect(result.ready).toBe(false)
    expect(result.lastStatus).toBe(0)
  }, 60_000)

  // A name outside the platform zone does not resolve at all. The probe must report
  // that as not-ready rather than throwing something a deploy cannot act on.
  it('is not-ready for a hostname the platform resolver does not serve', async () => {
    const result = await waitForReady({
      url: 'https://nope.example.invalid/',
      probe: edgeProbe(engine, 'nope.example.invalid', '/', CA),
      timeoutMs: 1,
      intervalMs: 10,
    })
    expect(result.ready).toBe(false)
    expect(result.lastStatus).not.toBe(200)
  }, 60_000)

  /**
   * THE SAME QUESTION, WITH AN IDENTITY (P4c). A status cannot tell this instance
   * from the previous one, or from the edge's wildcard; the header the route sets
   * can, and only the route sets it.
   */
  it('reads the instance identity back from a routed app', async () => {
    const seen = await edgeIdentityProbe(engine, HOST, '/', CA)()
    expect(seen.status).toBe(200)
    expect(seen.instance).toBe(INSTANCE)
  }, 60_000)

  /**
   * THE CONTROL FOR THE WHOLE DESIGN. A hostname in the zone with NO route answers
   * 200 from the Caddyfile wildcard — for any path, measured 2026-09-15 — so a
   * status-only readiness check passes against an app that never started (P4b
   * finding 193, Task 1 finding 11). The wildcard carries no identity, and that is
   * the difference `waitForIdentity` exists to read.
   */
  it('answers 200 with NO identity for an unrouted hostname, and waitForIdentity refuses it', async () => {
    const seen = await edgeIdentityProbe(engine, UNROUTED, '/', CA)()
    expect(seen.status).toBe(200)
    expect(seen.instance).toBeUndefined()

    const refused = await waitForIdentity({
      url: `https://${UNROUTED}/`,
      expected: INSTANCE,
      probe: edgeIdentityProbe(engine, UNROUTED, '/', CA),
      timeoutMs: 1,
      intervalMs: 10,
    })
    expect(refused.ready).toBe(false)
    expect(refused.reason).toContain('no X-Manifest-Instance')

    // And the status-only probe passes against exactly the same hostname, which is
    // what makes this a control rather than a restatement.
    const statusOnly = await waitForReady({
      url: `https://${UNROUTED}/`,
      probe: edgeProbe(engine, UNROUTED, '/', CA),
      timeoutMs: 1,
      intervalMs: 10,
    })
    expect(statusOnly.ready).toBe(true)
  }, 60_000)

  it('waits until the edge answers as the instance it was given', async () => {
    const ready = await waitForIdentity({
      url: `https://${HOST}/`,
      expected: INSTANCE,
      probe: edgeIdentityProbe(engine, HOST, '/', CA),
      timeoutMs: 30_000,
      intervalMs: 500,
    })
    expect(ready.ready).toBe(true)

    // The same edge, the same 200, a different instance asked for: not ready, and it
    // says which instance actually answered.
    const wrong = await waitForIdentity({
      url: `https://${HOST}/`,
      expected: 'deadbeef-0000-4000-8000-000000000000',
      probe: edgeIdentityProbe(engine, HOST, '/', CA),
      timeoutMs: 1,
      intervalMs: 10,
    })
    expect(wrong.ready).toBe(false)
    expect(wrong.reason).toContain(INSTANCE)
  }, 90_000)

  // Defect 24 was 42 orphaned anonymous volumes, one per deploy, from a missing
  // `v=true`. This probe creates a container on EVERY poll, so the same omission
  // here is unbounded growth at a much faster rate — and both probes run through the
  // one container body, so this covers the identity probe too.
  it('leaves no probe container behind', async () => {
    const before = (await run('docker', ['ps', '-aq'])).stdout.trim().split('\n').length
    await edgeProbe(engine, HOST, '/', CA)()
    await edgeIdentityProbe(engine, HOST, '/', CA)()
    const after = (await run('docker', ['ps', '-aq'])).stdout.trim().split('\n').length
    expect(after).toBe(before)
  }, 60_000)
})
