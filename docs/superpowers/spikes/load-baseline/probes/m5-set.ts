/**
 * B sitting 1, [M5]: a set in production's shape, given back — on a hostname NO project holds, so 7100's
 * Route rows never name what it moved. Through the Docker driver's own `ensureInstances` (A1), as a load
 * rehearsal's grant and take-down will move staging:
 *   0. one instance at staging's shape serving (as staging is before a rehearsal);
 *   1. the GRANT: three new instances of the same release at production's resources — the route moved to
 *      exactly those three in one change — then the old one retired;
 *   2. the TAKE-DOWN: one new instance at staging's resources — the route moved to it — then the three retired.
 * Each move timed; the VM's memory and each member's use read with three serving. Every container, volume,
 * route, network and image it made is removed in a `finally`, by name.
 *
 * Run: node <this file>   (Node 24 strips its types; it imports the compiled control plane, dist/, built after the last src change)
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdirSync } from 'node:fs'
const SRC = '/Users/rich/Developer/manifest/packages/control-plane/dist' // compiled; this file runs under Node 24's own type stripping
const { instanceName } = await import(`${SRC}/runtime/driver.js`)
const { renderInjection } = await import(`${SRC}/spec/index.js`)
const { createCaddyClient, removeRoute } = await import(`${SRC}/routing/index.js`)
const { createEngineClient, resolveSocketPath } = await import(`${SRC}/runtime/docker/engine.js`)
const { appContainer } = await import(`${SRC}/runtime/docker/names.js`)
const { destroyAppNetwork } = await import(`${SRC}/runtime/docker/networks.js`)
const { dockerDriverForTests, ensureContractRepo } = await import(`${SRC}/runtime/docker/testing.js`)

const run = promisify(execFile)
const SCRATCH = '/private/tmp/claude-501/-Users-rich-Developer-manifest/5e1c09d7-7d56-4258-b545-4d984bca4664/scratchpad/b-s1'
const SLUG = 'bs1-m5'
const KIND = 'staging' as const
const HOST = `${SLUG}.staging.manifest.internal`
const PORT = 8080
/** A uuid, as a release id is: `instanceName` takes the first 8 characters of each (`runtime/driver.ts`). */
const RELEASE = 'b51f5555-0000-4000-8000-000000000005'
/** production's and staging's resolved resources, as node-ts-mongo's blueprint defaults give BOTH today. */
const PROD = { cpu: 0.5, memoryMi: 512, pids: 256, diskMi: 2048 }
const STAGING = { cpu: 0.5, memoryMi: 512, pids: 256, diskMi: 2048 }
const IDS = {
  // DISTINCT FIRST 8 CHARACTERS: a container's name is the release's and the instance's first 8 (the first run's ids shared them, and one name answered for all five).
  before: 'b51a0000-0000-4000-8000-000000000000',
  g1: 'b51b0001-0000-4000-8000-000000000001',
  g2: 'b51c0002-0000-4000-8000-000000000002',
  g3: 'b51d0003-0000-4000-8000-000000000003',
  after: 'b51e0004-0000-4000-8000-000000000004',
}
const containerOf = (id: string) => appContainer(instanceName(SLUG, KIND, RELEASE, id))
const EVERY = Object.values(IDS).map(containerOf)
const routing = { caddy: createCaddyClient('http://127.0.0.1:7119'), servers: { internal: 'srv0', public: 'srv1' } }
const engine = createEngineClient({ socketPath: resolveSocketPath() })

const sh = async (cmd: string): Promise<string> => (await run('sh', ['-c', cmd], { maxBuffer: 1 << 22 })).stdout.trim()
const vmMem = () => sh(`docker run --rm --network none alpine:3.22 sh -c "grep -E '^(MemTotal|MemAvailable|SwapFree)' /proc/meminfo | tr -s ' ' | tr '\\n' ';'"`)
const stats = (names: string[]) =>
  sh(`docker stats --no-stream --format '{{.Name}} {{.CPUPerc}} {{.MemUsage}}' ${names.join(' ')}`)
const memLimit = (name: string) => sh(`docker inspect ${name} --format '{{.HostConfig.Memory}} {{.HostConfig.MemorySwap}} {{.HostConfig.NanoCpus}} {{.HostConfig.PidsLimit}}'`)
const t = () => performance.now()
const secs = (a: number, b: number) => `${((b - a) / 1000).toFixed(1)} s`

let image: { digest: string; repository: string } | undefined
const driver = await dockerDriverForTests()
const specFor = (instanceId: string, resources: typeof PROD) => ({
  name: instanceName(SLUG, KIND, RELEASE, instanceId),
  instanceId,
  hostname: HOST,
  projectSlug: SLUG,
  environmentKind: KIND,
  releaseId: RELEASE,
  image: image!,
  env: renderInjection({
    resolved: {
      environmentKind: KIND,
      port: PORT,
      health: '/healthz',
      resources: { cpu: resources.cpu, memory: `${resources.memoryMi}Mi`, pids: resources.pids, disk: `${resources.diskMi}Mi` },
      env: [],
      services: [],
      egressAllow: [],
      classification: 'internal',
      auth: { provider: 'none', attributes: [], callback: '/auth/ubcshib/callback', logout: '/auth/logout' },
      ai: { models: [], budget: { project_monthly_usd: 0, per_user_monthly_usd: 0 } },
    },
    environmentKind: KIND,
    hostname: HOST,
    projectSlug: SLUG,
    idp: { entityId: 'https://idp.manifest.internal/idp/shibboleth', baseUrl: 'https://idp.manifest.internal', spEntityBase: 'https://manifest.internal' },
    secrets: { sessionSecret: 'b-s1-m5-session-secret', appEnv: new Map() },
    services: [],
  }),
  port: PORT,
  healthPath: '/healthz',
  needsAiGateway: false,
  resources,
  services: [],
  egressAllow: [],
})

try {
  console.log('VM before:', await vmMem())
  const repo = `${SCRATCH}/m5-repo`
  mkdirSync(SCRATCH, { recursive: true })
  ensureContractRepo(repo)
  let a = t()
  image = await driver.buildImage({ repoPath: repo, commitSha: 'abc123' }, { blueprintRef: 'fixture-node@1', projectSlug: SLUG })
  console.log(`build (fixture-node skeleton, with its scan): ${secs(a, t())} → ${image!.repository}@${image!.digest.slice(0, 19)}`)

  a = t()
  const [before] = await driver.ensureInstances([specFor(IDS.before, STAGING)])
  console.log(`0. staging's own shape, one instance: ${secs(a, t())}; serving =`, await driver.servingInstances(HOST))

  a = t()
  const grantedHandles = await driver.ensureInstances([specFor(IDS.g1, PROD), specFor(IDS.g2, PROD), specFor(IDS.g3, PROD)])
  const granted = t()
  const servingGranted = await driver.servingInstances(HOST)
  console.log(`1. GRANT, three at production's resources, route moved: ${secs(a, granted)}; serving =`, servingGranted)
  a = t()
  // By the driver's HANDLE id (the container's name) — never the instance's uuid, which it does not know and answers at once.
  await driver.retireInstance(before.id, { drainMs: 5000 })
  console.log(`   the one before retired: ${secs(a, t())}`)
  const three = [IDS.g1, IDS.g2, IDS.g3].map(containerOf)
  for (const c of three) console.log('   limits', c.slice(-40), await memLimit(c))
  console.log('   VM with three serving:', await vmMem())
  console.log('   each member, idle:\n' + (await stats(three)))

  a = t()
  await driver.ensureInstances([specFor(IDS.after, STAGING)])
  const back = t()
  console.log(`2. TAKE-DOWN, one at staging's resources, route moved: ${secs(a, back)}; serving =`, await driver.servingInstances(HOST))
  a = t()
  for (const handle of grantedHandles) await driver.retireInstance(handle.id, { drainMs: 5000 })
  console.log(`   the three retired: ${secs(a, t())}; listInstances =`, await driver.listInstances(HOST))
  console.log('VM after:', await vmMem())
} catch (error) {
  console.error('FAILED', error)
  process.exitCode = 1
} finally {
  await removeRoute(routing, HOST, KIND).catch((e: unknown) => console.error('removeRoute', e))
  await run('docker', ['rm', '-f', '-v', ...EVERY]).catch(() => undefined)
  await run('docker', ['volume', 'rm', '-f', ...EVERY.map((c) => `${c}-files`)]).catch(() => undefined)
  await run('docker', ['rm', '-f', '-v', `mf-${SLUG}-${KIND}-egress`]).catch(() => undefined)
  await destroyAppNetwork(engine, SLUG, KIND).catch((e: unknown) => console.error('destroyAppNetwork', e))
  const tags = await sh(`docker images --format '{{.Repository}}:{{.Tag}}@{{.ID}}' | grep '/${SLUG}' || true`)
  console.log('images left by the build (removed next):', tags || 'none')
  if (image) await run('docker', ['rmi', '-f', `${image.repository}@${image.digest}`]).catch(() => undefined)
  console.log('left after cleanup:', await sh(`docker ps -a --format '{{.Names}}' | grep -c '${SLUG}' || true`), 'containers;',
    await sh(`docker network ls --format '{{.Name}}' | grep -c '${SLUG}' || true`), 'networks;',
    await sh(`docker volume ls --format '{{.Name}}' | grep -c '${SLUG}' || true`), 'volumes;',
    await sh(`curl -s http://127.0.0.1:7119/config/apps/http/servers/srv0/routes | grep -c '${HOST}' || true`), 'routes naming the host')
}
