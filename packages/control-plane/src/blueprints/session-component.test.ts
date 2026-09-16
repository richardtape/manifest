import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const run = promisify(execFile)

/**
 * `node-ts-mongo@1`'s SESSION COMPONENT — `skeleton/auth/session.js` — run, and asked
 * what it hands the two libraries it wires together (P4c Task 10).
 *
 * WHY IT MATTERS. The platform replaces an app's container on every deploy (§11
 * Redeploys), so a session held in the process signs every user out each time —
 * measured 2026-09-15, the first request to the new container answered 401. This
 * module moves sessions into the app's own Mongo, and §20 makes it a security
 * multiplier: it is copied into every generated application.
 *
 * WHY STUB LIBRARIES, IN A CHILD PROCESS. The module is app-side ESM outside this
 * package, and its imports resolve from the skeleton, which has no `node_modules`;
 * Vitest cannot mock a package for such a file (ORIENTATION §4, measured
 * 2026-09-14). And §8's rows are read ONCE, at import, so each environment needs a
 * fresh process anyway. The stubs record the options the module passes and nothing
 * else — so this tier pins the module's OWN decisions (a store, in the app's database,
 * over the app's client, with no fallback), and whether the REAL `connect-mongo` then
 * writes a session to a real Mongo is `node-ts-mongo.docker.test.ts`'s. The rejected
 * alternative was the two real packages as control-plane devDependencies: two more
 * app-side trees in a dependency graph nothing here scans, for a test, with a store
 * that would try to connect to a database on import.
 */
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const SKELETON = join(REPO_ROOT, 'blueprints/node-ts-mongo/skeleton')
const PROOF_APP = join(REPO_ROOT, 'fixtures/proof-app')

const SECRET = 's'.repeat(48)
const DATABASE = 'chem_labs_staging'

/** Each stub returns what it was given, marked with who made it. */
const STUBS: Record<string, string> = {
  'express-session': `export default function session(options) {
  return { madeBy: 'express-session', options }
}`,
  'connect-mongo': `export default {
  create(options) {
    return { madeBy: 'connect-mongo', options }
  },
}`,
}

/**
 * What the app's process runs: the module imported the way `server.js` imports it,
 * called with a client the test can recognise by IDENTITY, and one JSON result written
 * to a file.
 */
const RUNNER = `
import { writeFileSync } from 'node:fs'
const [out] = process.argv.slice(2)
const client = { theAppsOwnClient: true }
const result = {}
try {
  const { sessionMiddleware } = await import('./auth/session.js')
  const middleware = sessionMiddleware(client)
  result.madeBy = middleware.madeBy
  const { store, ...options } = middleware.options
  result.options = options
  if (store) {
    const { client: storeClient, ...storeOptions } = store.options
    result.store = { madeBy: store.madeBy, options: storeOptions, sameClient: storeClient === client }
  }
} catch (error) {
  result.error = String(error && error.message ? error.message : error)
}
writeFileSync(out, JSON.stringify(result))
`

interface RunResult {
  madeBy?: string
  options?: Record<string, unknown>
  store?: { madeBy: string; options: Record<string, unknown>; sameClient: boolean }
  error?: string
}

describe("node-ts-mongo@1's session component (§11 Redeploys, §8)", () => {
  let app: string

  beforeAll(async () => {
    app = await mkdtemp(join(tmpdir(), 'mf-session-component-'))
    await cp(join(SKELETON, 'auth/session.js'), join(app, 'auth/session.js'), {
      recursive: true,
    })
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

  async function runApp(env: Record<string, string>): Promise<RunResult> {
    const out = join(app, `result-${Date.now()}-${Math.random()}.json`)
    // A CLEAN environment: the only values the module can read are the ones given.
    await run(process.execPath, [join(app, 'run.mjs'), out], {
      cwd: app,
      env,
      timeout: 30_000,
    })
    return JSON.parse(await readFile(out, 'utf8')) as RunResult
  }

  const injected = () => ({ SESSION_SECRET: SECRET, MONGODB_DB_NAME: DATABASE })

  it("keeps sessions in a connect-mongo store, in the app's own database, over the app's own client", async () => {
    const result = await runApp(injected())
    expect(result.error).toBeUndefined()
    expect(result.madeBy).toBe('express-session')
    // THE DEFECT THIS MODULE EXISTS TO FIX, as an assertion: with no `store`,
    // express-session falls back to MemoryStore and every redeploy signs everyone out.
    expect(result.store?.madeBy).toBe('connect-mongo')
    // The SAME client the app holds — one connection pool and one set of credentials,
    // not a second connection built from a URI.
    expect(result.store?.sameClient).toBe(true)
    expect(result.store?.options).toEqual({
      // The database the platform injected and minted the credentials for — never a
      // default, which is what `MONGODB_DB_NAME` cost before 2026-09-09.
      dbName: DATABASE,
      collectionName: 'sessions',
      ttl: 8 * 60 * 60,
      touchAfter: 5 * 60,
      autoRemove: 'native',
    })
  }, 30_000)

  it('signs with the injected secret, and sets a cookie that survives the edge', async () => {
    const result = await runApp(injected())
    expect(result.options).toEqual({
      secret: SECRET,
      resave: false,
      saveUninitialized: false,
      // TLS ends at the edge; without `proxy` express-session will not set a `secure`
      // cookie and no session survives the redirect back from the IdP.
      proxy: true,
      cookie: { httpOnly: true, sameSite: 'lax', secure: true },
    })
  }, 30_000)

  it('REFUSES to start without SESSION_SECRET — there is no default to sign with', async () => {
    // §16's drift test cannot catch a fallback: the variable is still READ, so the
    // scan passes while every app silently signs its cookies with the same string.
    const { SESSION_SECRET: _omitted, ...rest } = injected()
    const result = await runApp(rest)
    expect(result.error).toBe('SESSION_SECRET is required and was not injected (§8)')
    expect(result.madeBy).toBeUndefined()
  }, 30_000)

  it('REFUSES an EMPTY SESSION_SECRET, which is not a secret', async () => {
    const result = await runApp({ ...injected(), SESSION_SECRET: '' })
    expect(result.error).toBe('SESSION_SECRET is required and was not injected (§8)')
  }, 30_000)

  it('REFUSES to start without MONGODB_DB_NAME — sessions never land in a database of its choosing', async () => {
    const { MONGODB_DB_NAME: _omitted, ...rest } = injected()
    const result = await runApp(rest)
    expect(result.error).toBe('MONGODB_DB_NAME is required and was not injected (§8)')
    expect(result.madeBy).toBeUndefined()
  }, 30_000)
})

describe('there is ONE copy of session handling (§20)', () => {
  /**
   * Both apps that run on this platform mount the blueprint's module and neither
   * configures express-session itself. Anchored at a line start, so a COMMENTED-OUT
   * import cannot satisfy the first assertion or trip the second — the trap
   * `spec/injection-drift.test.ts` strips comments for.
   */
  for (const [name, file] of [
    ["the skeleton's server.js", join(SKELETON, 'server.js')],
    ["the proof app's server.js", join(PROOF_APP, 'server.js')],
  ] as const) {
    it(`${name} mounts sessionMiddleware and does not import express-session`, () => {
      expect(existsSync(file)).toBe(true)
      const source = readFileSync(file, 'utf8')
      expect(source).toMatch(
        /^import \{[^}]*\bsessionMiddleware\b[^}]*\} from '\.\/auth\/session\.js'/m,
      )
      expect(source).toMatch(/^app\.use\(sessionMiddleware\(client\)\)/m)
      expect(source).not.toMatch(/^import [^\n]*from 'express-session'/m)
    })
  }
})
