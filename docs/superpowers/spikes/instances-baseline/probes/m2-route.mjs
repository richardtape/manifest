// [M2]: build the candidate Task 2 route (today's buildRoute chain, N upstreams, round
// robin, Decision 4's health policy, the header from the chosen upstream) and apply it to
// the THROWAWAY Caddy's admin API (127.0.0.1:7191) — PUT at index 0, or PATCH by @id.
//   node route.mjs <put|patch|print> <ids comma-separated> [--no-health] [--no-try] [--passive-503] [--no-replace] [--placeholder=host]
import { request } from 'node:http'

const [verb, idsArg, ...flags] = process.argv.slice(2)
const has = (f) => flags.includes(f)
const placeholder = (flags.find((f) => f.startsWith('--placeholder=')) ?? '--placeholder=host').split('=')[1]
const ids = idsArg.split(',').filter(Boolean)
const routeId = 'mf-r-m2'
const NS = (s) => s * 1_000_000_000

const health = has('--no-health')
  ? undefined
  : {
      active: {
        uri: '/healthz',
        interval: NS(5),
        timeout: NS(2),
        expect_status: 200,
        headers: { 'X-Manifest-Probe': ['health'] },
      },
      passive: {
        fail_duration: NS(10),
        max_fails: 2,
        unhealthy_status: has('--passive-503') ? [502, 503, 504] : [502, 504],
      },
    }

const proxy = {
  handler: 'reverse_proxy',
  upstreams: ids.map((id) => ({ dial: `mf-i-${id}:8080` })),
  load_balancing: {
    selection_policy: { policy: 'round_robin' },
    ...(has('--no-try') || has('--no-health') ? {} : { try_duration: NS(3), try_interval: 250_000_000 }),
  },
  ...(health ? { health_checks: health } : {}),
  stream_close_delay: 3_600_000_000_000,
}

const route = {
  '@id': routeId,
  match: [{ host: ['m2.manifest.internal'] }],
  handle: [
    { handler: 'request_body', max_size: 10_485_760 },
    {
      handler: 'rate_limit',
      rate_limits: {
        [routeId]: {
          match: [{ remote_ip: { ranges: ['0.0.0.0/0', '::/0'] } }],
          key: '{http.request.remote.host}',
          window: '1m',
          // The real route's is 600; raised HERE ONLY so a measurement loop is not 429'd.
          max_events: 1_000_000,
        },
      },
    },
    {
      handler: 'headers',
      response: {
        set: {
          'Strict-Transport-Security': ['max-age=31536000; includeSubDomains'],
          'X-Content-Type-Options': ['nosniff'],
          'Referrer-Policy': ['strict-origin-when-cross-origin'],
          'Content-Security-Policy': ["frame-ancestors 'self'"],
          'X-Manifest-Instance': [`{http.reverse_proxy.upstream.${placeholder}}`],
        },
        ...(has('--no-replace')
          ? {}
          : { replace: { 'X-Manifest-Instance': [{ search_regexp: '^mf-i-', replace: '' }] } }),
        deferred: true,
      },
    },
    proxy,
  ],
  terminal: true,
}

const admin = 'http://127.0.0.1:7191'
if (verb === 'print') {
  console.log(JSON.stringify(route, null, 2))
} else {
  const url = verb === 'put' ? `${admin}/config/apps/http/servers/srv0/routes/0` : `${admin}/id/${routeId}`
  const body = JSON.stringify(route)
  const r = await new Promise((resolve, reject) => {
    const req = request(url, { method: verb === 'put' ? 'PUT' : 'PATCH', headers: { 'content-type': 'application/json' } }, (res) => {
      let text = ''
      res.on('data', (c) => (text += c))
      res.on('end', () => resolve({ status: res.statusCode, text: () => text }))
    })
    req.on('error', reject)
    req.end(body)
  })
  console.log(`${verb.toUpperCase()} ${r.status} ${await r.text()}`.trim())
}
