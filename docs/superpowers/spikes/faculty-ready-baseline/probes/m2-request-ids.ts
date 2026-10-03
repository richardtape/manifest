// [M2] Is a header set in onRequest present on every way a refusal leaves? (faculty-ready Task 1)
// In-process, never the running control plane: buildServer over testDeps, with every database URL pointed at
// a port NOTHING listens on, so no request here can read or write the real database (a path that tries
// answers 500, which is itself the error handler's path). The probe adds the hook the plan's Task 3 adds.
// Run from the repository root (Node strip-only cannot load parameter properties, so tsx from the pnpm store):
//   node_modules/.pnpm/node_modules/.bin/tsx --import ./docs/superpowers/spikes/faculty-ready-baseline/probes/m2-no-vitest.mjs docs/superpowers/spikes/faculty-ready-baseline/probes/m2-request-ids.ts
const DEAD = 'postgres://nobody:nothing@127.0.0.1:7193/none'
process.env.MANIFEST_DATABASE_URL = DEAD
process.env.MANIFEST_ADMIN_DATABASE_URL = DEAD
process.env.MANIFEST_IDP_DATABASE_URL = DEAD
const root = new URL('../../../../../packages/control-plane/src/', import.meta.url)
const { testDeps } = await import(new URL('api/testing.ts', root).href)
const { buildServer } = await import(new URL('api/server.ts', root).href)
const deps = await testDeps()
const app = await buildServer(deps)
let hook = 'added'
try {
  app.addHook('onRequest', async (request: { id: unknown }, reply: { header(name: string, value: string): unknown }) => {
    reply.header('x-request-id', String(request.id))
  })
} catch (error) { hook = `REFUSED: ${(error as Error).message}` }
const origin = deps.config.sp.origin
type Inject = { method: string; url: string; headers?: Record<string, string>; payload?: string }
const cases: [string, Inject][] = [
  ['POSITIVE CONTROL: an answer that is not a refusal (GET /auth/login, a redirect to the IdP)', { method: 'GET', url: '/auth/login' }],
  ['setErrorHandler, its early 401 (GET /v1/me, no credential)', { method: 'GET', url: '/v1/me' }],
  ['frameworkErrors: a path parameter over 100 characters', { method: 'GET', url: `/v1/slugs/${'a'.repeat(120)}` }],
  ['frameworkErrors: a malformed URL', { method: 'GET', url: '/v1/slugs/%E0%A4%A' }],
  ['setNotFoundHandler (GET /v1/nothing-here)', { method: 'GET', url: '/v1/nothing-here' }],
  ['setErrorHandler: a malformed JSON body (POST /v1/projects, with key and Origin)', { method: 'POST', url: '/v1/projects', headers: { 'content-type': 'application/json', 'idempotency-key': 'probe-0001-key', origin: 'https://console.manifest.internal' }, payload: '{not json' }],
  ['webhooks\' local refuse (POST /webhooks/github, no signature)', { method: 'POST', url: '/webhooks/github', headers: { 'content-type': 'application/json' }, payload: '{}' }],
  ['SLO\'s local refusal, JSON (GET /auth/logout, no SAMLRequest)', { method: 'GET', url: '/auth/logout' }],
  ['SLO\'s local refusal as the HTML page (Accept: text/html)', { method: 'GET', url: '/auth/logout', headers: { accept: 'text/html' } }],
  ['setErrorHandler: a mutation without Origin (POST /v1/projects)', { method: 'POST', url: '/v1/projects', headers: { 'content-type': 'application/json' }, payload: '{}' }],
  ['setErrorHandler: a 500 (a well-formed bearer, so the hook reads the DEAD database)', { method: 'GET', url: '/v1/blueprints', headers: { authorization: `Bearer mft_${'0'.repeat(32)}_${'A'.repeat(43)}` } }],
]
console.log(`hook: ${hook}; origin: ${origin}`)
for (const [name, req] of cases) {
  const res = await app.inject(req)
  const body = res.body.length > 160 ? res.body.slice(0, 160) + '…' : res.body
  console.log(`${res.headers['x-request-id'] ? 'PRESENT ' : 'ABSENT  '} ${String(res.statusCode).padEnd(4)} ${name}\n          id=${res.headers['x-request-id'] ?? '-'} type=${res.headers['content-type'] ?? '-'} body=${body.replace(/\n/g, ' ')}`)
}
await app.close()
process.exit(0)
