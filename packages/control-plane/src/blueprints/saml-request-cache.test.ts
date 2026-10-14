import { execFile } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const run = promisify(execFile)

/**
 * `node-ts-mongo@1`'s SAML REQUEST CACHE — the one `skeleton/auth/ubcshib.js` hands the SAML
 * library — run, and asked what it does (A1 Task 8a; Rich, 2026-10-13 ~16:28, `3487e68`).
 *
 * WHY IT EXISTS. Production runs several copies of an app behind one route, and A1's sitting 1
 * measured (`[M3]`) that a sign-in started on one and finished on another was REFUSED —
 * `InResponseTo is not valid` — because the library keeps each AuthnRequest's id in a cache in
 * the PROCESS that issued it. The same mechanism failed a sign-in in flight across a redeploy,
 * with one instance. The cache now lives in the app's own Mongo, beside its sessions.
 *
 * WHY STUBS, IN A CHILD PROCESS — `session-component.test.ts`'s reasons: the module is app-side
 * ESM whose imports resolve from the skeleton, which has no `node_modules`, and §8's rows are
 * read once, at import. The SAML library is stubbed to record the options the module passes;
 * the Mongo client is an in-memory one this file can read. That the REAL library then signs a
 * person in across two real instances is `node-ts-mongo.docker.test.ts`'s.
 */
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const SKELETON = join(REPO_ROOT, 'blueprints/node-ts-mongo/skeleton')

const DATABASE = 'chem_labs_production'
const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000

const STUBS: Record<string, string> = {
  passport: `export default {
  use(strategy) { globalThis.__cwl.strategy = strategy },
  serializeUser() {},
  deserializeUser() {},
  authenticate: () => () => {},
}`,
  'passport-ubcshib': `class Strategy {
  constructor(options) { this.options = options }
}
export default { Strategy }`,
}

/**
 * The app's process: `configureCwl` called the way `server.js` calls it, with an in-memory
 * MongoClient — one collection per name, documents keyed by `_id`, and `createdAt` compared
 * as Mongo compares Dates — and the cache it handed the library exercised.
 */
const RUNNER = `
import { writeFileSync } from 'node:fs'
const [out, mode] = process.argv.slice(2)
globalThis.__cwl = {}
const store = new Map()
const seen = { databases: [], collections: [], indexes: [] }
const matches = (doc, filter) =>
  Object.entries(filter).every(([field, want]) => {
    const got = doc[field]
    if (want && typeof want === 'object' && !(want instanceof Date)) {
      if ('$gt' in want && !(got > want.$gt)) return false
      if ('$lte' in want && !(got <= want.$lte)) return false
      return true
    }
    return got === want
  })
const client = {
  db(name) {
    seen.databases.push(name)
    return {
      collection(collection) {
        seen.collections.push(collection)
        return {
          async createIndex(keys, options) { seen.indexes.push({ keys, options }) },
          async insertOne(doc) {
            if (store.has(doc._id)) throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 })
            store.set(doc._id, { ...doc })
            return { acknowledged: true }
          },
          async findOne(filter) {
            const doc = store.get(filter._id)
            return doc && matches(doc, filter) ? { ...doc } : null
          },
          async deleteOne(filter) {
            const doc = store.get(filter._id)
            if (!doc || !matches(doc, filter)) return { deletedCount: 0 }
            store.delete(filter._id)
            return { deletedCount: 1 }
          },
        }
      },
    }
  },
}
const result = {}
try {
  const { configureCwl } = await import('./auth/ubcshib.js')
  if (mode === 'no-client') {
    configureCwl()
  } else {
    configureCwl(client)
    const cache = globalThis.__cwl.strategy.options.cacheProvider
    result.hasCache = cache !== undefined
    if (cache) {
      const steps = {}
      steps.firstSave = await cache.saveAsync('_req1', '2026-10-13T19:00:00.000Z')
      steps.secondSave = await cache.saveAsync('_req1', 'again')
      steps.get = await cache.getAsync('_req1')
      steps.getUnknown = await cache.getAsync('_never-issued')
      steps.remove = await cache.removeAsync('_req1')
      steps.getAfterRemove = await cache.getAsync('_req1')
      steps.removeAgain = await cache.removeAsync('_req1')
      steps.removeNull = await cache.removeAsync(null)
      // One issued EIGHT HOURS AND A MINUTE AGO, which Mongo's own sweep (once a minute) may not
      // have taken yet: it is gone to the library all the same, and a new one may take its id.
      store.set('_stale', { _id: '_stale', value: 'old', createdAt: new Date(Date.now() - ${EIGHT_HOURS_MS} - 60000) })
      steps.getStale = await cache.getAsync('_stale')
      steps.saveOverStale = (await cache.saveAsync('_stale', 'new')) !== null
      steps.getAfterOverStale = await cache.getAsync('_stale')
      result.steps = steps
      result.firstSaveShape = steps.firstSave && {
        value: steps.firstSave.value,
        createdAtIsNumber: typeof steps.firstSave.createdAt === 'number',
      }
    }
  }
} catch (error) {
  result.error = String(error && error.message ? error.message : error)
}
result.seen = seen
writeFileSync(out, JSON.stringify(result))
`

interface RunResult {
  hasCache?: boolean
  steps?: Record<string, unknown>
  firstSaveShape?: { value: string; createdAtIsNumber: boolean }
  seen: {
    databases: string[]
    collections: string[]
    indexes: { keys: unknown; options: unknown }[]
  }
  error?: string
}

describe("node-ts-mongo@1's SAML request cache — a sign-in that crosses instances (A1 Task 8a)", () => {
  let app: string

  beforeAll(async () => {
    app = await mkdtemp(join(tmpdir(), 'mf-saml-request-cache-'))
    await mkdir(join(app, 'auth'), { recursive: true })
    for (const file of ['ubcshib.js', 'attributes.js'])
      await cp(join(SKELETON, 'auth', file), join(app, 'auth', file))
    await writeFile(join(app, 'idp.crt'), 'not a certificate — the stub never reads it\n')
    await writeFile(join(app, 'package.json'), '{ "type": "module" }\n')
    await writeFile(join(app, 'run.mjs'), RUNNER)
    for (const [name, source] of Object.entries(STUBS)) {
      const dir = join(app, 'node_modules', name)
      await mkdir(dir, { recursive: true })
      await writeFile(
        join(dir, 'package.json'),
        JSON.stringify({ name, type: 'module', main: 'index.js' }),
      )
      await writeFile(join(dir, 'index.js'), source)
    }
  })

  afterAll(async () => {
    await rm(app, { recursive: true, force: true })
  })

  async function runApp(mode = 'client'): Promise<RunResult> {
    const out = join(app, `result-${Date.now()}-${Math.random()}.json`)
    // A CLEAN environment: §8's SAML block and the database name, nothing else.
    await run(process.execPath, [join(app, 'run.mjs'), out, mode], {
      cwd: app,
      env: {
        SAML_ENVIRONMENT: 'LOCAL',
        SAML_ISSUER: 'https://manifest.internal/sp/chem-labs/production',
        SAML_CALLBACK_URL: 'https://chem-labs.manifest.internal/auth/ubcshib/callback',
        SAML_ENTRY_POINT: 'https://idp.example.invalid/sso',
        SAML_LOGOUT_URL: 'https://idp.example.invalid/slo',
        SAML_IDP_METADATA_URL: 'https://idp.example.invalid/metadata',
        SAML_IDP_CERT_PATH: join(app, 'idp.crt'),
        MONGODB_DB_NAME: DATABASE,
      },
      timeout: 30_000,
    })
    return JSON.parse(await readFile(out, 'utf8')) as RunResult
  }

  it("hands the SAML library a request cache in the app's OWN database, expiring after eight hours", async () => {
    const result = await runApp()
    expect(result.error).toBeUndefined()
    // THE DEFECT THIS EXISTS TO FIX, as an assertion: with no cacheProvider the library keeps
    // each request id in the process that issued it, and a sign-in that crosses instances fails.
    expect(result.hasCache).toBe(true)
    expect(result.seen.databases).toEqual([DATABASE])
    expect(result.seen.collections).toEqual(['saml_requests'])
    // Mongo removes what is older than the library's own request-id expiry
    // (`requestIdExpirationPeriodMs`, eight hours) — no timer in the process.
    expect(result.seen.indexes).toEqual([
      { keys: { createdAt: 1 }, options: { expireAfterSeconds: 8 * 60 * 60 } },
    ])
  }, 30_000)

  it('answers the library exactly as its in-memory cache would: once per id, the value, then gone', async () => {
    const { steps, firstSaveShape } = await runApp()
    expect(firstSaveShape).toEqual({
      value: '2026-10-13T19:00:00.000Z',
      createdAtIsNumber: true,
    })
    expect(steps).toMatchObject({
      // An id already issued and still live is not issued twice.
      secondSave: null,
      get: '2026-10-13T19:00:00.000Z',
      // An assertion answering a request this app never made is refused by the library on null.
      getUnknown: null,
      remove: '_req1',
      // CONSUMED: the library removes the id once it has answered it, so a REPLAY is refused.
      getAfterRemove: null,
      removeAgain: null,
      removeNull: null,
    })
  }, 30_000)

  it('treats an id older than eight hours as gone, whether or not Mongo has swept it yet', async () => {
    const { steps } = await runApp()
    expect(steps).toMatchObject({
      getStale: null,
      saveOverStale: true,
      getAfterOverStale: 'new',
    })
  }, 30_000)

  it("REFUSES to start without the app's MongoClient — never a cache in the process instead", async () => {
    // A silent fallback to the library's in-memory cache is the cross-instance failure itself,
    // and it would show only when a person's sign-in landed on the other instance.
    const result = await runApp('no-client')
    expect(result.error).toMatch(/^configureCwl\(client\) needs the app's MongoClient/)
  }, 30_000)
})
