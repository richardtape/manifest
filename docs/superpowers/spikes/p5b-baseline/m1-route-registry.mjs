import { ROUTE_DEFINITIONS } from '/Users/rich/Developer/manifest/packages/control-plane/dist/api/routes/index.js'
console.log('route count:', ROUTE_DEFINITIONS.length)
for (const r of ROUTE_DEFINITIONS) {
  const src = r.handler.toString()
  const guarded = src.includes('assertCapability')
  const inline = /platformRole/.test(src)
  console.log(
    [r.method.padEnd(6), r.path.padEnd(52), r.operationId.padEnd(24), guarded ? 'assertCapability' : '—', inline ? 'platformRole INLINE' : ''].join(' '),
  )
}
