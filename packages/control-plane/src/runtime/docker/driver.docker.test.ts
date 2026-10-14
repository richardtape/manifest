import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { promisify } from 'node:util'
import { afterAll, beforeAll, expect, it } from 'vitest'
import {
  createCaddyClient,
  removeRoute,
  routeIdFor,
  type CaddyClient,
  type RoutingDeps,
} from '../../routing/index.js'
import { describeDriverContract } from '../driver-contract.js'
import { instanceName, type ImageRef, type InstanceSpec } from '../driver.js'
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
// proves `ensureInstances` can run what `buildImage` produced.
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

  const HOST = 'chem-labs.staging.manifest.internal'
  const buildImage = async (): Promise<ImageRef> =>
    (await dockerDriverForTests()).buildImage(
      { repoPath: '/tmp/repo', commitSha: 'abc123' },
      { blueprintRef: 'fixture-node@1', projectSlug: 'chem-labs' },
    )
  const specFor = (
    image: ImageRef,
    releaseId: string,
    hostname = HOST,
    instanceId: string = randomUUID(),
  ): InstanceSpec => ({
    name: instanceName('chem-labs', 'staging', releaseId, instanceId),
    instanceId,
    hostname,
    projectSlug: 'chem-labs',
    environmentKind: 'staging',
    releaseId,
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

  // Not part of P2's contract — a fake driver has no edge to leave a route on —
  // but a real one does, and a route outliving its container is a permanent 502 on
  // the app's own hostname plus a stale upstream for whatever takes that name next.
  it('removes the route when the instance is destroyed', async () => {
    const driver = await dockerDriverForTests()
    const image = await buildImage()
    const [handle] = await driver.ensureInstances([
      specFor(image, 'release-routegone', HOST, '9b9b9b9b-0000-4000-8000-000000000009'),
    ])
    const routesFor = async (): Promise<number> =>
      (await caddy.getRoutes('srv0')).filter((r) => r.match?.[0]?.host?.includes(HOST))
        .length

    expect(await routesFor()).toBe(1)
    await driver.destroyInstance(handle!.id)
    expect(await routesFor()).toBe(0)
  }, 300_000)

  /**
   * THE APP'S HEALTH POLICY, ON THE ROUTE THE DRIVER WRITES — AND ON THE ONE IT RESTORES FROM
   * THE CONTAINERS ALONE (A1 Task 4). `restoreRoute` runs at boot with nothing but ids, so the
   * health path has to come off the containers themselves: the driver labels each with it.
   */
  it("a set's route carries the app's health policy, and restoreRoute rebuilds it from the containers alone", async () => {
    const driver = await dockerDriverForTests()
    const image = await buildImage()
    const hostname = `contract-${randomUUID().slice(0, 8)}.staging.manifest.internal`
    try {
      const set = await driver.ensureInstances([
        specFor(image, 'release-health01', hostname),
        specFor(image, 'release-health01', hostname),
      ])
      const written = await caddy.getRoute(routeIdFor(hostname))
      const proxy = written?.handle.find(
        (h) => (h as { handler?: string }).handler === 'reverse_proxy',
      ) as
        | {
            upstreams?: { dial: string }[]
            health_checks?: { active?: { uri?: string } }
            load_balancing?: { try_duration?: number }
          }
        | undefined
      expect(proxy?.upstreams).toHaveLength(2)
      expect(proxy?.health_checks?.active?.uri).toBe('/healthz')
      expect(proxy?.load_balancing?.try_duration).toBe(3_000_000_000)
      await caddy.deleteRoute('srv0', routeIdFor(hostname))
      await driver.restoreRoute(set.map((h) => h.id))
      expect(await caddy.getRoute(routeIdFor(hostname))).toEqual(written)
    } finally {
      await removeRoute(ROUTING, hostname, 'staging').catch(() => undefined)
    }
  }, 300_000)

  /**
   * NOTHING SWALLOWED (A1 Task 4, Decision 3): a destroy whose route change the edge refuses
   * THROWS, naming the hostname, BEFORE the container goes — so the caller (the retirer, a
   * deploy's rollback) records it and can try again. Until this task the route's removal was
   * `.catch(() => undefined)`, and a route left pointing at a destroyed container left no line.
   * The edge is the real one for reads; only this driver's WRITES are refused.
   */
  it('destroyInstance REJECTS, naming the hostname, when the edge refuses the route change — and the container is left', async () => {
    const driver = await dockerDriverForTests()
    const image = await buildImage()
    const hostname = `contract-${randomUUID().slice(0, 8)}.staging.manifest.internal`
    try {
      const [doomed, kept] = await driver.ensureInstances([
        specFor(image, 'release-refused1', hostname),
        specFor(image, 'release-refused1', hostname),
      ])
      const before = await caddy.getRoute(routeIdFor(hostname))
      const refuse = (): Promise<never> =>
        Promise.reject(new Error('the edge refused the change (admin API stopped)'))
      const refusing: CaddyClient = {
        ...caddy,
        putRoute: refuse,
        patchRoute: refuse,
        deleteRoute: refuse,
      }
      const stuck = await dockerDriverForTests({
        routing: { caddy: refusing, servers: { internal: 'srv0', public: 'srv1' } },
      })
      await expect(stuck.destroyInstance(doomed!.id)).rejects.toThrow(hostname)
      expect((await driver.status(doomed!.id)).state).not.toBe('gone')
      expect(await caddy.getRoute(routeIdFor(hostname))).toEqual(before)
      // …and the last member too: removing the whole route is a change the edge can refuse.
      await driver.destroyInstance(doomed!.id)
      await expect(stuck.destroyInstance(kept!.id)).rejects.toThrow(hostname)
      expect((await driver.status(kept!.id)).state).not.toBe('gone')
      await driver.destroyInstance(kept!.id)
      expect(await caddy.getRoute(routeIdFor(hostname))).toBeUndefined()
    } finally {
      await removeRoute(ROUTING, hostname, 'staging').catch(() => undefined)
    }
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
      // The front-end enablement plan's Task 2: the fixture app prints ONE line at boot, so
      // *honours tail* makes it print two more — written to its own stdout, PID 1's, which
      // is the file Docker's log reads. Docker keeps a record a moment after it is written,
      // so this waits until the line is the last one `logs` answers.
      printLine: async (driver, handleId, text) => {
        const run = driver.exec(
          handleId,
          ['sh', '-c', 'echo "$1" > /proc/1/fd/1', 'sh', text],
          {},
        )
        expect(await run.exitCode).toBe(0)
        const deadline = Date.now() + 10_000
        for (;;) {
          let last: string | undefined
          for await (const line of driver.logs(handleId, { tail: 1 })) last = line.text
          if (last === text) return
          if (Date.now() > deadline)
            throw new Error(`printLine: '${text}' never reached the instance's log`)
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
      },
    },
  )
})
