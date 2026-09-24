// probes/nullable-sites.mjs — [M11] addendum: every place in the extracted schemas where
// `nullable: true` sits beside no `type`, which Ajv 8 refuses to compile.
import { readFileSync } from 'node:fs'
const g = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const sites = []
const walk = (n, path) => {
  if (!n || typeof n !== 'object') return
  if (n.nullable === true && n.type === undefined) sites.push(`${path}  keys=[${Object.keys(n).filter((k) => k !== 'nullable' && k !== 'description').join(',')}]`)
  for (const [k, v] of Object.entries(n)) walk(v, `${path}/${k}`)
}
walk(g.components, '#/components'); walk(g.roots, '#roots')
console.log(sites.length, 'sites'); for (const s of sites) console.log(' ', s)
