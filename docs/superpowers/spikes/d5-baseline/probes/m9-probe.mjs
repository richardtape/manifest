// m9-probe.mjs — [M9]. Kept here as the record; RUN from a copy in packages/control-plane/ so
// `fastify` resolves, and the copy is deleted in the same step.
import Fastify from 'fastify'
const app = Fastify({ logger: false })
app.post('/v1/x', async (req) => ({ isBuf: Buffer.isBuffer(req.body) }))
await app.register(async (child) => {
  child.removeContentTypeParser('application/json')
  child.addContentTypeParser('application/json', { parseAs: 'buffer', bodyLimit: 5 * 1024 * 1024 }, (_r, body, done) => done(null, body))
  child.post('/webhooks/github', async (req) => ({ isBuf: Buffer.isBuffer(req.body) }))
})
const post = (url, payload, ct = 'application/json') => app.inject({ method: 'POST', url, headers: ct ? { 'content-type': ct } : {}, payload })
console.log('fastify', app.version)
console.log('/v1/x', (await post('/v1/x', '{"a":1}')).body)
console.log('/webhooks/github', (await post('/webhooks/github', '{"a":1}')).body)
const big = JSON.stringify({ s: 'x'.repeat(2 * 1024 * 1024) })
console.log('2 MiB /v1/x', (await post('/v1/x', big)).statusCode, '/webhooks', (await post('/webhooks/github', big)).statusCode)
const huge = JSON.stringify({ s: 'x'.repeat(6 * 1024 * 1024) })
console.log('6 MiB /webhooks', (await post('/webhooks/github', huge)).statusCode)
const none = await post('/webhooks/github', '{"a":1}', null)
console.log('no content type /webhooks', none.statusCode, none.body)
const form = await post('/webhooks/github', 'payload=%7B%7D', 'application/x-www-form-urlencoded')
console.log('form-encoded /webhooks', form.statusCode, form.body.slice(0, 120))
