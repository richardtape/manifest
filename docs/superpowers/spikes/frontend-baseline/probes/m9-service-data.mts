// m9-service-data.mts — [M9] a service's data surviving an archive. createServiceContainer's own request (the
// catalogue's Mongo image and digest, `<volume>:/data/db`, the root credentials in Env, CapDrop ALL) under a PROBE
// name — manifest-probe-archive-db, never mf-… — then the platform's destroyServiceContainer with deleteData false,
// a re-create on the same volume, and deleteData true. Removes everything it made in a finally.
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createEngineClient, resolveSocketPath } from '../../../../../packages/control-plane/src/runtime/docker/engine.ts'
import { destroyServiceContainer } from '../../../../../packages/control-plane/src/runtime/docker/services.ts'
import { resolveServiceImage } from '../../../../../packages/control-plane/src/services/catalogue.ts'

const engine = createEngineClient({ socketPath: resolveSocketPath() })
const NAME = 'manifest-probe-archive-db'
const VOLUME = `${NAME}-data` // destroyServiceContainer deletes `${name}-data`, which is serviceVolume's shape
const image = resolveServiceImage('mongo', '7')
const user = 'probe', pass = randomBytes(16).toString('hex')
const docker = (...args: string[]) => execFileSync('docker', args, { encoding: 'utf8' }).trim()
const mongosh = (js: string) => docker('exec', NAME, 'mongosh', '--quiet', '-u', user, '-p', pass, '--authenticationDatabase', 'admin', '--eval', js)
const volumes = () => docker('volume', 'ls', '-q', '--filter', `name=${NAME}`)
const anonymous = () => docker('volume', 'ls', '-q', '--filter', 'dangling=true').split('\n').filter(Boolean).length

async function create() {
  await engine.post('/volumes/create', { Name: VOLUME, Labels: { 'manifest.probe': 'frontend-baseline' } })
  await engine.post(`/containers/create?name=${NAME}`, {
    Image: `${image.image}@${image.digest}`,
    Env: [`MONGODB_INITDB_ROOT_USERNAME=${user}`, `MONGODB_INITDB_ROOT_PASSWORD=${pass}`],
    HostConfig: { NetworkMode: 'none', Binds: [`${VOLUME}:/data/db`], CapDrop: ['ALL'], SecurityOpt: ['no-new-privileges'], PidsLimit: 256, Memory: 512 * 1024 * 1024 },
    Labels: { 'manifest.probe': 'frontend-baseline' },
  })
  await engine.post(`/containers/${NAME}/start`)
  const t = Date.now()
  for (;;) {
    try { if (mongosh('db.runCommand({ ping: 1 }).ok') === '1') return Date.now() - t } catch {}
    if (Date.now() - t > 90_000) throw new Error('mongo did not answer in 90 s')
    await new Promise((r) => setTimeout(r, 500))
  }
}

const danglingBefore = anonymous()
try {
  console.log('create 1: ready in', await create(), 'ms')
  console.log('insert:', mongosh("db.getSiblingDB('probe').t.insertOne({ marker: 'survives-archive' }).acknowledged"))
  await destroyServiceContainer(engine, NAME, { deleteData: false })
  console.log('after destroyServiceContainer({ deleteData: false }): container', (await engine.get(`/containers/${NAME}/json`)) ? 'PRESENT' : 'gone', '| volume', volumes() || '(none)')
  console.log('create 2 on the same volume: ready in', await create(), 'ms')
  console.log('find:', mongosh("JSON.stringify(db.getSiblingDB('probe').t.find({}, { _id: 0 }).toArray())"))
  await destroyServiceContainer(engine, NAME, { deleteData: true })
  console.log('after destroyServiceContainer({ deleteData: true }): container', (await engine.get(`/containers/${NAME}/json`)) ? 'PRESENT' : 'gone', '| volume', volumes() || '(none)')
} finally {
  await engine.del(`/containers/${NAME}?force=true&v=true`).catch(() => undefined) // cleanup of a probe; the outcome is checked below
  await engine.del(`/volumes/${VOLUME}?force=true`).catch(() => undefined)
  console.log('left behind: container', (await engine.get(`/containers/${NAME}/json`)) ? 'PRESENT' : 'none', '| volume', volumes() || 'none',
    '| dangling volumes before', danglingBefore, 'after', anonymous())
}
