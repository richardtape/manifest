import { readFileSync } from 'node:fs'
// The patterns as the build uses them, READ FROM THE SOURCE — not retyped.
const src = readFileSync('packages/control-plane/src/build/gates.ts', 'utf8')
// ACROSS LINES: some of the seven entries put `pattern:` on the line after `name:`.
const pats = [...src.matchAll(/name:\s*'([^']+)',\s*pattern:\s*(\/.+\/[a-z]*),?\s*\}/g)]
  .map(([, name, lit]) => ({ name, re: eval(lit) }))   // the literal regexes of SECRET_PATTERNS
if (pats.length !== 7) throw new Error(`read ${pats.length} patterns, expected 7 — fix the probe first`)
console.log('patterns read:', pats.map((p) => p.name).join(' | '))
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = `${b64u({ alg: 'RS256', typ: 'JWT' })}.${b64u({ iss: '1234567', exp: 1790000000 })}.${'A'.repeat(342)}`
for (const [label, token] of [['classic', 'ghs_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8'], ['stateless', `ghs_1234567_${jwt}`], ['bare JWT', jwt]]) {
  const line = `const token = "${token}"`
  console.log(label, token.length, pats.filter((p) => p.re.test(line)).map((p) => p.name))
}
