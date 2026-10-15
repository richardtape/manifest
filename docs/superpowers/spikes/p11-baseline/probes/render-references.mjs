// [M3] (P11 Task 1 Step 3): evaluate the mockup's references in a node:vm context under React 19.3.0,
// record every prop set the mockup's own console.js passes each component on each of its four screens,
// then render every export of window.Manifest and window.ManifestAdmin alone. Read-only: it writes nothing.
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const REPO = '/Users/rich/Developer/manifest'
const req = createRequire(`${REPO}/packages/console/package.json`)
const React = req('react')
const { renderToStaticMarkup } = req('react-dom/server')
const D = `${REPO}/docs/superpowers/design`
const src = (p) => readFileSync(`${D}/${p}`, 'utf8')

const calls = {} // "Manifest.X" -> [propsSummary...]
let rootElement = null
const ctx = vm.createContext({})
Object.assign(ctx, {
  React,
  ReactDOM: { createRoot: () => ({ render: (el) => (rootElement = el) }) },
  console,
  Date,
  Math,
  JSON,
  setInterval: () => 0,
  clearInterval: () => {},
  setTimeout: () => 0,
  clearTimeout: () => {},
  location: { hash: '' },
  document: { getElementById: () => ({}), body: { classList: { toggle() {} } } },
  addEventListener() {},
  removeEventListener() {},
  scrollTo() {},
})
ctx.window = ctx

function summarise(v, depth = 0) {
  if (v === null) return 'null'
  if (Array.isArray(v)) return depth > 1 ? 'array' : `[${v.length}:${v.length ? summarise(v[0], depth + 1) : ''}]`
  if (React.isValidElement(v)) return 'element'
  if (typeof v === 'function') return 'fn'
  if (typeof v === 'object') return depth > 1 ? 'object' : `{${Object.keys(v).sort().join(',')}}`
  return typeof v
}
function wrap(ns) {
  const obj = ctx[ns]
  for (const [name, fn] of Object.entries(obj)) {
    if (typeof fn !== 'function' || !/^[A-Z]/.test(name)) continue
    const key = `${ns}.${name}`
    calls[key] = []
    const wrapped = function (props) {
      calls[key].push({ props, shape: Object.keys(props || {}).sort().map((k) => `${k}:${summarise(props[k])}`).join(' ') })
      return fn(props)
    }
    obj[name] = wrapped
  }
}

vm.runInContext(src('system/components/bundle.js'), ctx, { filename: 'bundle.js' })
const original = { Manifest: { ...ctx.Manifest } }
wrap('Manifest')
vm.runInContext(src('admin/components.js'), ctx, { filename: 'components.js' })
original.ManifestAdmin = { ...ctx.ManifestAdmin }
wrap('ManifestAdmin')
vm.runInContext(src('admin/data.js'), ctx, { filename: 'data.js' })
vm.runInContext(src('admin/console.js'), ctx, { filename: 'console.js' })

const out = { react: React.version, screens: {}, exports: {}, standalone: {} }
for (const screen of ['queue', 'fleet', 'health', 'settings']) {
  ctx.location.hash = `#${screen}`
  try {
    const html = renderToStaticMarkup(rootElement)
    out.screens[screen] = { ok: true, bytes: html.length }
  } catch (e) {
    out.screens[screen] = { ok: false, error: String(e && e.message) }
  }
}
for (const ns of ['Manifest', 'ManifestAdmin']) {
  out.exports[ns] = Object.keys(original[ns]).map((k) => `${k}:${typeof original[ns][k]}`)
  for (const [name, fn] of Object.entries(original[ns])) {
    if (typeof fn !== 'function' || !/^[A-Z]/.test(name)) continue
    const key = `${ns}.${name}`
    const seen = calls[key] || []
    const shapes = [...new Set(seen.map((c) => c.shape))]
    let alone
    const props = seen.length ? seen[0].props : {}
    try {
      const html = renderToStaticMarkup(React.createElement(fn, props))
      alone = { ok: true, bytes: html.length, with: seen.length ? 'first mockup props' : '{}' }
    } catch (e) {
      alone = { ok: false, with: seen.length ? 'first mockup props' : '{}', error: String(e && e.message).slice(0, 160) }
    }
    out.standalone[key] = { callsInMockup: seen.length, distinctShapes: shapes.length, shapes: shapes.slice(0, 6), alone }
  }
}
console.log(JSON.stringify(out, null, 1))
