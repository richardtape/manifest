import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createCaddyClient } from '../../routing/index.js'
import { describeDriverContract } from '../driver-contract.js'
import { instanceName } from '../driver.js'
import { describeDocker } from './docker-tier.js'
import { dockerDriverForTests, ensureContractRepo } from './testing.js'

const run = promisify(execFile)

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
    await run('sh', [
      '-c',
      'docker ps -aq --filter label=manifest.slug=chem-labs | xargs docker rm -f -v 2>/dev/null || true',
    ]).catch(() => undefined)
    for (const name of ['mf-chem-labs-staging-db', 'mf-egress-chem-labs-staging']) {
      // `-v`: remove the container's anonymous volumes with it. No image used
      // here declares one today, but `make reset` leaked six this way before it
      // was fixed, and the habit costs nothing.
      await run('docker', ['rm', '-f', '-v', name]).catch(() => undefined)
    }
  })

  // Not part of P2's contract — a fake driver has no edge to leave a route on —
  // but a real one does, and a route outliving its container is a permanent 502 on
  // the app's own hostname plus a stale upstream for whatever takes that name next.
  it('removes the route when the instance is destroyed', async () => {
    const driver = await dockerDriverForTests()
    const image = await driver.buildImage(
      { repoPath: '/tmp/repo', commitSha: 'abc123' },
      { blueprintRef: 'fixture-node@1', projectSlug: 'chem-labs' },
    )
    const handle = await driver.ensureInstance({
      name: instanceName('chem-labs', 'staging', 'release-routegone'),
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

  describeDriverContract('docker', () => dockerDriverForTests(), {
    runnableImage: (driver) =>
      driver.buildImage(
        { repoPath: '/tmp/repo', commitSha: 'abc123' },
        { blueprintRef: 'fixture-node@1', projectSlug: 'chem-labs' },
      ),
  })
})
