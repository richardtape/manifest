import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createCaddyClient, removeRoute, type RoutingDeps } from '../../routing/index.js'
import { describeDriverContract } from '../driver-contract.js'
import { instanceName } from '../driver.js'
import { describeDocker } from './docker-tier.js'
import {
  dockerContinuityFixtures,
  dockerDriverForTests,
  ensureContractRepo,
} from './testing.js'

const run = promisify(execFile)

const ROUTING: RoutingDeps = {
  caddy: createCaddyClient('http://127.0.0.1:7119'),
  servers: { internal: 'srv0', public: 'srv0' },
}

// The identical suite the fake driver passes (§16). Not a copy, not a subset, and
// not weakened: every assertion in `driver-contract.ts` is exactly as P2 wrote it.
// The one thing supplied here is the fixture the suite could not invent — an image
// that really exists — and it is one this driver BUILT, so the run additionally
// proves `ensureInstance` can run what `buildImage` produced.
describeDocker('Docker driver', () => {
  beforeAll(() => {
    // The suite names `/tmp/repo` and `abc123` as literals. They are made real
    // here rather than by changing the contract — see `ensureContractRepo`.
    ensureContractRepo()
  })

  afterAll(async () => {
    /**
     * EVERY container of this slug, and its files volume with it.
     *
     * The continuity block (P4c Task 5) deploys instances with RANDOM ids — a
     * hostname per test, a new instance per deploy — so nothing here can name them
     * in advance; the label is the only handle. Repeated `label` filters AND, unlike
     * repeated `name` filters, which OR and once listed another app's containers
     * during a cleanup (P4b finding 192).
     *
     * The volumes are removed by the NAME the container had, read before it goes:
     * `docker rm -v` takes anonymous volumes only, which is how 42 leaked once
     * (P3 defect 24) and how each instance's `…-app-files` — a copy of the app's SP
     * private key — leaked again in P4b (finding 194).
     */
    const { stdout } = await run('docker', [
      'ps',
      '-a',
      '--filter',
      'label=manifest.slug=chem-labs',
      '--format',
      '{{.Names}}',
    ]).catch(() => ({ stdout: '' }))
    const names = stdout.split('\n').filter((name) => name.trim() !== '')
    for (const name of names) {
      await run('docker', ['rm', '-f', '-v', name]).catch(() => undefined)
      await run('docker', ['volume', 'rm', '-f', `${name}-files`]).catch(() => undefined)
    }
    for (const name of ['mf-chem-labs-staging-db', 'mf-egress-chem-labs-staging']) {
      // `-v`: remove the container's anonymous volumes with it. No image used
      // here declares one today, but `make reset` leaked six this way before it
      // was fixed, and the habit costs nothing.
      await run('docker', ['rm', '-f', '-v', name]).catch(() => undefined)
    }
    /**
     * AND THE ROUTE, which this suite left behind until P4c Task 5.
     *
     * The continuity block removes its own — a hostname per test, dropped in its
     * `afterAll` — but the contract's other instances all share
     * `chem-labs.staging.manifest.internal`, and the last of them leaves a route
     * dialling a container this cleanup has just removed. That is exactly the
     * permanent 502 this suite's own first test is about, and sitting 3 had to
     * remove one such route by hand.
     */
    await removeRoute(ROUTING, 'chem-labs.staging.manifest.internal', 'staging').catch(
      () => undefined,
    )
  }, 300_000)

  // Not part of P2's contract — a fake driver has no edge to leave a route on —
  // but a real one does, and a route outliving its container is a permanent 502 on
  // the app's own hostname plus a stale upstream for whatever takes that name next.
  it('removes the route when the instance is destroyed', async () => {
    const driver = await dockerDriverForTests()
    const image = await driver.buildImage(
      { repoPath: '/tmp/repo', commitSha: 'abc123' },
      { blueprintRef: 'fixture-node@1', projectSlug: 'chem-labs' },
    )
    const instanceId = '9b9b9b9b-0000-4000-8000-000000000009'
    const handle = await driver.ensureInstance({
      name: instanceName('chem-labs', 'staging', 'release-routegone', instanceId),
      instanceId,
      hostname: 'chem-labs.staging.manifest.internal',
      projectSlug: 'chem-labs',
      environmentKind: 'staging',
      releaseId: 'release-routegone',
      image,
      env: { MANIFEST_ENV: 'staging', PORT: '3000' },
      port: 3000,
      healthPath: '/healthz',
      needsAiGateway: false,
      resources: { cpu: 0.5, memoryMi: 512, pids: 256, diskMi: 2048 },
      services: [],
      egressAllow: [],
    })
    const caddy = createCaddyClient('http://127.0.0.1:7119')
    const HOST = 'chem-labs.staging.manifest.internal'
    const routesFor = async (): Promise<number> =>
      (await caddy.getRoutes('srv0')).filter((r) => r.match?.[0]?.host?.includes(HOST))
        .length

    expect(await routesFor()).toBe(1)
    await driver.destroyInstance(handle.id)
    expect(await routesFor()).toBe(0)
  }, 300_000)

  /**
   * `readinessTimeoutMs: 20_000` rather than the 90 s default (P4c Task 5).
   *
   * The continuity block deploys an instance that can NEVER become ready, on purpose,
   * and waits it out. 90 s of that in a suite that already takes minutes is time spent
   * proving nothing; 20 s is still five times what this fixture needs to boot —
   * measured at 2-4 s, a Node process with no database to connect to.
   */
  describeDriverContract(
    'docker',
    () => dockerDriverForTests({ readinessTimeoutMs: 20_000 }),
    {
      runnableImage: (driver) =>
        driver.buildImage(
          { repoPath: '/tmp/repo', commitSha: 'abc123' },
          { blueprintRef: 'fixture-node@1', projectSlug: 'chem-labs' },
        ),
      // §11's Redeploys, on the real driver. Until Task 5 supplied these the block was
      // SKIPPED, with the reason in its name — never silently (Decision 23).
      continuity: dockerContinuityFixtures(),
    },
  )
})
