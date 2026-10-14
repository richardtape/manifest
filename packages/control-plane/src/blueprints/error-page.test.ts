import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const run = promisify(execFile)

/**
 * WHAT A PERSON SEES WHEN AN APP'S ROUTE THROWS (A1 sitting 3's F11; Rich, 2026-10-13 ~19:38, *"both."*).
 * Until it, a failed CWL sign-in — or any route that threw — showed the person Express's DEVELOPMENT error
 * page: the stack trace, with the container's paths (`/app/node_modules/@node-saml/node-saml/lib/saml.js`),
 * because the skeleton mounted no error handler and `NODE_ENV` was set nowhere. Both now: an error handler
 * as the LAST middleware of every `server.js` the blueprint ships (the skeleton's and the proof-app
 * starter's), which writes the error to the app's log and answers one plain sentence with no stack; and
 * `NODE_ENV=production` in the image, so Express's own handler would not show a stack either.
 *
 * The handler is run as the tier runs skeleton code — in a child process, from the skeleton's own file
 * (`session-component.test.ts`'s reason). `node-ts-mongo.docker.test.ts` reads the body of a REAL refused
 * sign-in (a replayed assertion) through the edge.
 */
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const BLUEPRINT = join(REPO_ROOT, 'blueprints/node-ts-mongo')
const SKELETON = join(BLUEPRINT, 'skeleton')

/** Calls the skeleton's handler with `error` and a recording response; prints what it did. */
const RUNNER = `
const { errorHandler } = await import(process.argv[1])
const said = []
console.error = (...args) => said.push(args.map(String).join(' '))
const answered = { status: undefined, body: undefined, delegated: false }
const res = {
  headersSent: process.argv[3] === 'sent',
  status(code) { answered.status = code; return this },
  json(body) { answered.body = body; return this },
}
const error = new Error('InResponseTo is not valid')
error.stack = 'Error: InResponseTo is not valid\\n    at SAML.validateInResponseTo (/app/node_modules/@node-saml/node-saml/lib/saml.js:638:27)'
if (process.argv[2] !== '500') error.status = Number(process.argv[2])
const req = { method: 'POST', path: '/auth/ubcshib/callback', originalUrl: '/auth/ubcshib/callback?token=t0p-s3cret', headers: { cookie: 'connect.sid=s3cret-cookie' }, body: { SAMLResponse: 'PHNhbWw+' } }
errorHandler(error, req, res, () => { answered.delegated = true })
process.stdout.write(JSON.stringify({ answered, said }))
`

async function handle(status: string, sent: 'sent' | 'unsent' = 'unsent') {
  const { stdout } = await run(process.execPath, [
    '--input-type=module',
    '-e',
    RUNNER,
    pathToFileURL(join(SKELETON, 'errors.js')).href,
    status,
    sent,
  ])
  return JSON.parse(stdout) as {
    answered: { status: number | undefined; body: unknown; delegated: boolean }
    said: string[]
  }
}

describe('the skeleton’s error page (A1 sitting 3’s F11; Rich, "both.")', () => {
  it('answers a thrown error 500 with one plain sentence — no stack, no path — and writes the error to the log', async () => {
    const { answered, said } = await handle('500')
    expect(answered.status).toBe(500)
    expect(answered.body).toEqual({
      error: 'Something went wrong on our side. Please try again.',
    })
    expect(JSON.stringify(answered.body)).not.toMatch(/node_modules|InResponseTo|\bat\b/)
    // THE LOG HAS THE ERROR — its stack, and where it happened…
    expect(said).toHaveLength(1)
    expect(said[0]).toContain('InResponseTo is not valid')
    expect(said[0]).toContain('/auth/ubcshib/callback')
    // …and NEVER A SECRET: no query string, no cookie, no form body (a SAML response is a credential).
    expect(said[0]).not.toMatch(/t0p-s3cret|s3cret-cookie|PHNhbWw\+/)
  })

  it('keeps a client error’s own status — a form too large is 413, not a 500 — still without a stack', async () => {
    const { answered } = await handle('413')
    expect(answered.status).toBe(413)
    expect(answered.body).toEqual({ error: 'This request could not be handled.' })
  })

  it('hands an error after the answer began to Express, which closes the connection', async () => {
    const { answered, said } = await handle('500', 'sent')
    expect(answered).toEqual({ status: undefined, body: undefined, delegated: true })
    expect(said).toHaveLength(1)
  })

  it('is the LAST middleware of every server.js the blueprint ships — the skeleton’s and the proof-app starter’s', async () => {
    for (const file of ['skeleton/server.js', 'starters/proof-app/server.js']) {
      const source = await readFile(join(BLUEPRINT, file), 'utf8')
      expect(source, file).toContain("import { errorHandler } from './errors.js'")
      const mounted = source.indexOf('app.use(errorHandler)')
      expect(mounted, file).toBeGreaterThan(-1)
      // Nothing is mounted after it: Express runs an error handler only after every route before it.
      const after = source.slice(mounted + 'app.use(errorHandler)'.length)
      expect(after, file).not.toMatch(/\bapp\.(use|get|post|put|patch|delete|all)\(/)
    }
  })

  it('builds every app with NODE_ENV=production, set AFTER the install — the install unchanged', async () => {
    const template = await readFile(join(BLUEPRINT, 'Dockerfile.tmpl'), 'utf8')
    const install = template.indexOf('RUN npm ci --omit=dev --ignore-scripts')
    const env = template.indexOf('\nENV NODE_ENV=production\n')
    const cmd = template.indexOf('CMD ["node", "server.js"]')
    expect(install).toBeGreaterThan(-1)
    expect(env).toBeGreaterThan(install)
    expect(cmd).toBeGreaterThan(env)
  })
})
