// m15-switched-off.mts — [M15] Decision 29's switched-off route, through Caddy's admin API with the platform's
// own client and route functions, on the scratch hostname probe-switched-off.staging.manifest.internal (@id =
// routeIdFor(hostname)). The upstream is manifest-probe-upstream (started and removed by the wrapper).
import { createCaddyClient, type CaddyRoute } from '../../../../../packages/control-plane/src/routing/caddy.ts'
import { applyRoute, removeRoute, servingRoute } from '../../../../../packages/control-plane/src/routing/routes.ts'
import { routeIdFor } from '../../../../../packages/control-plane/src/routing/hostnames.ts'

const caddy = createCaddyClient(process.env.MANIFEST_CADDY_ADMIN_URL ?? 'http://127.0.0.1:7119')
const deps = { caddy, servers: { internal: 'srv0', public: 'srv1' } }
const HOST = 'probe-switched-off.staging.manifest.internal'
const ID = routeIdFor(HOST)
const BODY = 'This app has been switched off by its owner.'
const switchedOff: CaddyRoute = { '@id': ID, match: [{ host: [HOST] }],
  handle: [{ handler: 'static_response', status_code: 410, headers: { 'Content-Type': ['text/plain; charset=utf-8'] }, body: BODY }], terminal: true }

async function get() {
  const res = await fetch(`https://${HOST}/anything`, { redirect: 'manual' })
  return { status: res.status, instance: res.headers.get('x-manifest-instance'), body: (await res.text()).slice(0, 90) }
}
const count = async () => (await caddy.getRoutes('srv0')).filter((r) => r['@id'] === ID).length
const handlerOf = async () => ((await caddy.getRoute(ID))?.handle ?? []).map((h) => (h as { handler: string }).handler).join(',') || '(no route)'

try {
  console.log('before:', JSON.stringify({ routesWithId: await count(), wire: await get() }))
  await caddy.putRoute('srv0', switchedOff)
  console.log('1 putRoute(static 410):', JSON.stringify({ routesWithId: await count(), handlers: await handlerOf(), wire: await get() }))
  console.log('2 servingRoute(host) on the static route:', JSON.stringify(await servingRoute(deps, HOST)) ?? 'undefined')
  await applyRoute(deps, { hostname: HOST, upstream: 'manifest-probe-upstream:8080', kind: 'staging', instanceId: 'probe-instance-1' })
  console.log('3 applyRoute(reverse_proxy) over it:', JSON.stringify({ routesWithId: await count(), handlers: await handlerOf(), wire: await get() }))
  console.log('  servingRoute now:', JSON.stringify({ upstream: (await servingRoute(deps, HOST))?.upstream, instanceId: (await servingRoute(deps, HOST))?.instanceId }))
  await caddy.patchRoute(ID, switchedOff)
  console.log('4 patchRoute(static 410) in place — archive\'s direction:', JSON.stringify({ routesWithId: await count(), handlers: await handlerOf(), wire: await get() }))
  await removeRoute(deps, HOST, 'staging')
  console.log('5 removeRoute:', JSON.stringify({ routesWithId: await count(), wire: await get() }))
} finally {
  if ((await caddy.getRoute(ID)) !== undefined) { await caddy.deleteRoute('srv0', ID); console.log('finally: removed the leftover route') }
  console.log('left behind: routes with the probe id =', await count())
}
