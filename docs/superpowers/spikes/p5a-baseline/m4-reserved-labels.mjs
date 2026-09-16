// M4 (P5a Task 1): the reserved-label data as Task 9 will load it, the platform names
// the edge serves, the repository's own slugs, and a starter manifest's name rewritten
// with its comments kept (Task 11).
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const require = createRequire(join(ROOT, 'packages/control-plane/package.json'))
const { parse, parseDocument } = require('yaml')
const SLUG = /^[a-z][a-z0-9-]{2,38}$/

// [M4a] both files, both shapes
const dir = join(ROOT, 'infra/reserved-labels')
const groups = []
for (const file of ['labels.yaml', 'ubc-academic.yaml']) {
  const doc = parse(readFileSync(join(dir, file), 'utf8'))
  const found = Array.isArray(doc.groups) ? doc.groups : [doc]
  for (const g of found) groups.push({ file, ...g })
}
const seen = new Map()
const problems = []
for (const g of groups) {
  for (const label of Object.keys(g.labels)) {
    if (!SLUG.test(label)) problems.push(`${g.file}: '${label}' breaks §7's rule`)
    if (seen.has(label)) problems.push(`'${label}' is in ${seen.get(label)} and ${g.group}`)
    seen.set(label, g.group)
  }
}
console.log(`[M4a] ${seen.size} labels in ${groups.length} groups:`, groups.map((g) => `${g.group}=${Object.keys(g.labels).length}`).join(' '))
console.log(`[M4a] problems: ${problems.length === 0 ? 'none' : problems.join('; ')}`)

// [M4b] every platform name the Caddyfile serves, and the repository's own slugs
const caddy = readFileSync(join(ROOT, 'infra/caddy/Caddyfile'), 'utf8')
const sites = [...caddy.matchAll(/^([a-z0-9*.,\s-]+)\s*\{\s*$/gm)]
  .flatMap((m) => m[1].split(',').map((s) => s.trim()))
  .filter((s) => s.endsWith('.manifest.internal') && !s.startsWith('*'))
console.log('[M4b] Caddyfile sites:', sites.map((s) => `${s} → ${seen.get(s.split('.')[0]) ?? 'NOT RESERVED'}`).join(', '))
const walk = (d) => readdirSync(d).flatMap((n) => {
  const p = join(d, n)
  if (n === 'node_modules' || n === 'dist' || n.startsWith('.')) return []
  return statSync(p).isDirectory() ? walk(p) : [p]
})
const slugs = new Set()
for (const file of [...walk(join(ROOT, 'packages/control-plane/src')), ...walk(join(ROOT, 'scripts')), ...walk(join(ROOT, 'fixtures'))]) {
  const text = readFileSync(file, 'utf8')
  for (const m of text.matchAll(/(?:slug|SLUG|name)["']?\s*[:=]\s*["'`]?([a-z][a-z0-9-]{2,38})["'`]?/g)) slugs.add(m[1])
  for (const m of text.matchAll(/DEMO_SLUG:-([a-z][a-z0-9-]{2,38})/g)) slugs.add(m[1])
}
const reservedUsed = [...slugs].filter((s) => seen.has(s))
console.log(`[M4b] ${slugs.size} slug-shaped names in src/, scripts/ and fixtures/; reserved among them: ${reservedUsed.length === 0 ? 'none' : reservedUsed.join(', ')}`)

// [M4c] the proof app's manifest, renamed with its comments kept
const original = readFileSync(join(ROOT, 'fixtures/proof-app/manifest.yaml'), 'utf8')
const doc = parseDocument(original)
doc.set('name', 'journey-app')
const renamed = String(doc)
const comments = (t) => t.split('\n').filter((l) => l.trim().startsWith('#')).length
const changed = original.split('\n').filter((l, i) => l !== renamed.split('\n')[i]).length
console.log(`[M4c] comments ${comments(original)} → ${comments(renamed)}; lines changed: ${changed}; name now: ${parse(renamed).name}`)
