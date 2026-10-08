import { execFile } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const run = promisify(execFile)

/**
 * The `proof-app` starter's `server.js`, BOOTED — asked whether a variable the app supplies
 * itself, `COURSE_CODE`, fails the first boot when it is missing.
 *
 * WHY IT MATTERS. Every app a building agent seeds from this starter keeps its reads. Read
 * inside `/api/me`, a `manifest.yaml` rewritten without its `env:` block shipped an app
 * whose deploy was healthy and whose every signed-in `/api/me` answered `500` — and
 * `/api/me` is what the app's page asks to learn whether anyone is signed in, so a person
 * met it as a sign-in that did not take, and the building agent never saw it (`ask-my-notes`,
 * 2026-10-05). Read at startup, the same omission is a failed deploy whose output names
 * the fix.
 *
 * WHY STUB LIBRARIES, IN A CHILD PROCESS — `session-component.test.ts`'s reasons: the file is
 * app-side ESM outside this package whose imports resolve from a tree with no
 * `node_modules`, and the variables are read once, at import, so each environment needs a
 * fresh process. The stubs stand in for Express, Passport, Mongo and the blueprint's three
 * components, and record what the module asked of them; nothing listens and nothing
 * connects. Whether the real app then serves a person is `make demo-identity`'s.
 */
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const PROOF_APP = join(REPO_ROOT, 'blueprints/node-ts-mongo/starters/proof-app')

/** Each stub records into `globalThis.__proofApp`, which the runner creates first. */
const STUBS: Record<string, string> = {
  express: `const passthrough = () => (_req, _res, next) => next()
export default function express() {
  const seen = globalThis.__proofApp
  const route = (method) => (path, ...handlers) => {
    seen.routes.push({ method, path, handlers })
  }
  return {
    use() {},
    set() {},
    get: route('GET'),
    post: route('POST'),
    listen(port, host) {
      seen.listening = { port, host }
    },
  }
}
express.json = passthrough
express.urlencoded = passthrough
express.static = passthrough`,
  passport: `export default { initialize: () => () => {}, session: () => () => {} }`,
  mongodb: `export class MongoClient {
  constructor(uri) {
    globalThis.__proofApp.mongoUri = uri
  }
  db() {
    return { collection: () => ({}), command: async () => ({ ok: 1 }) }
  }
  async connect() {
    globalThis.__proofApp.connected = true
  }
}`,
}

/** The blueprint's components, which the starter imports from paths the skeleton supplies. */
const COMPONENTS: Record<string, string> = {
  'auth/ubcshib.js': `export function configureCwl() {
  return { login() {}, callback() {}, logout: () => () => {} }
}`,
  'auth/session.js': `export function sessionMiddleware() {
  return () => {}
}`,
  'ai/llm.js': `export function configureAi() {}
export function endUserId(puid) {
  return 'end-user-of-' + puid
}
export async function askStreaming() {}
export async function embed() {}`,
}

/**
 * What the app's process runs: the starter's `server.js` imported as the container's
 * `node server.js` would run it, then — if it booted — its `/api/me` handler called for a
 * signed-in person. One JSON result is written to a file; stdout is the app's.
 */
const RUNNER = `
import { writeFileSync } from 'node:fs'
const [out] = process.argv.slice(2)
const seen = { routes: [] }
globalThis.__proofApp = seen
const result = {}
try {
  await import('./server.js')
  result.booted = true
  const me = seen.routes.find((r) => r.method === 'GET' && r.path === '/api/me')
  if (me) {
    const handler = me.handlers[me.handlers.length - 1]
    const req = {
      user: { user: { ubcEduCwlPuid: 'stu000001', givenName: 'Sam', sn: 'Student', eduPersonAffiliation: 'student' } },
    }
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this },
      json(body) { result.me = { status: this.statusCode, body } },
    }
    try {
      handler(req, res)
    } catch (error) {
      result.me = { threw: String(error && error.message ? error.message : error) }
    }
  }
} catch (error) {
  result.error = String(error && error.message ? error.message : error)
}
result.listening = seen.listening ?? null
result.connected = seen.connected === true
writeFileSync(out, JSON.stringify(result))
`

interface RunResult {
  booted?: true
  error?: string
  listening: { port: number; host: string } | null
  connected: boolean
  me?: { status?: number; body?: Record<string, unknown>; threw?: string }
}

describe('the proof-app starter reads COURSE_CODE at startup', () => {
  let app: string

  beforeAll(async () => {
    app = await mkdtemp(join(tmpdir(), 'mf-proof-app-boot-'))
    await cp(join(PROOF_APP, 'server.js'), join(app, 'server.js'))
    await writeFile(join(app, 'package.json'), '{ "type": "module" }\n')
    await writeFile(join(app, 'run.mjs'), RUNNER)
    for (const [path, source] of Object.entries(COMPONENTS)) {
      await mkdir(join(app, path, '..'), { recursive: true })
      await writeFile(join(app, path), source)
    }
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

  async function boot(env: Record<string, string>): Promise<RunResult> {
    const out = join(app, `result-${Date.now()}-${Math.random()}.json`)
    // A CLEAN environment: the only values the app can read are the ones given.
    await run(process.execPath, [join(app, 'run.mjs'), out], {
      cwd: app,
      env,
      timeout: 30_000,
    })
    return JSON.parse(await readFile(out, 'utf8')) as RunResult
  }

  /** What a deploy of the starter's own `manifest.yaml` injects, CWL off to keep it short. */
  const injected = () => ({
    MANIFEST_ENV: 'staging',
    MANIFEST_APP_URL: 'https://proof-app.staging.manifest.internal',
    MANIFEST_PROJECT_SLUG: 'proof-app',
    PORT: '3000',
    MONGODB_URI: 'mongodb://proof-app:pw@mf-proof-app-db:27017/proof_app_staging',
    MONGODB_DB_NAME: 'proof_app_staging',
    COURSE_CODE: 'CHEM_121',
  })

  it('boots with COURSE_CODE declared, and /api/me answers it for a signed-in person', async () => {
    const result = await boot(injected())
    expect(result.error).toBeUndefined()
    expect(result.booted).toBe(true)
    expect(result.listening).toEqual({ port: 3000, host: '0.0.0.0' })
    expect(result.me).toEqual({
      status: 200,
      body: {
        attributes: {
          ubcEduCwlPuid: 'stu000001',
          givenName: 'Sam',
          sn: 'Student',
          eduPersonAffiliation: 'student',
        },
        displayName: 'Sam Student',
        affiliation: 'student',
        endUserId: 'end-user-of-stu000001',
        course: 'CHEM_121',
      },
    })
  }, 30_000)

  it('REFUSES to boot without COURSE_CODE — a dropped `env:` declaration fails the deploy, never a person’s sign-in', async () => {
    const { COURSE_CODE: _omitted, ...rest } = injected()
    const result = await boot(rest)
    // The sentence the deploy's output carries, naming the fix — read by the building agent.
    expect(result.error).toBe(
      'COURSE_CODE is required and was not injected (§8). Declare it in manifest.yaml ' +
        'under `env:`, or remove every read of it',
    )
    expect(result.booted).toBeUndefined()
    // Before the app touches its database or takes a request.
    expect(result.connected).toBe(false)
    expect(result.listening).toBeNull()
  }, 30_000)

  it('REFUSES an EMPTY COURSE_CODE too — an empty declaration is not a value', async () => {
    const result = await boot({ ...injected(), COURSE_CODE: '' })
    expect(result.error).toMatch(/^COURSE_CODE is required and was not injected/)
    expect(result.listening).toBeNull()
  }, 30_000)
})
