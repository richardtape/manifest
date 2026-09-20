#!/usr/bin/env node
// Builds ONE self-contained file for a design agent that has no access to this
// repository — `docs/superpowers/design-handover.md`.
//
// WHY A GENERATOR AND NOT A HAND-WRITTEN FILE. It restates three sources: the design
// brief, the published contract and the mock's fixtures. A hand-copied file drifts
// from all three the first time one of them changes, which is ORIENTATION §9's
// "a document that restates a number drifts from it" with three chances to be wrong.
// Regenerate instead:
//
//     node scripts/design-handover.mjs
//
// It reads only; it writes exactly one file and prints where.

import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const p = (...xs) => join(ROOT, ...xs)

const SOURCES = {
  brief: 'docs/superpowers/plans/2026-09-19-interface-design-brief.md',
  contract: 'packages/contract/openapi.json',
  fixtures: 'packages/mock/src/fixtures.ts',
}
const OUT = 'docs/superpowers/design-handover.md'

const read = (rel) => {
  try {
    return readFileSync(p(rel), 'utf8')
  } catch {
    // Fail loudly and name the file. A handover built from a missing source would be
    // silently incomplete, which is worse than not building at all.
    console.error(`design-handover: cannot read ${rel}`)
    process.exit(1)
  }
}

const brief = read(SOURCES.brief)
const fixtures = read(SOURCES.fixtures)
const doc = JSON.parse(read(SOURCES.contract))

const commit = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim()
  } catch {
    return 'unknown'
  }
})()
// LOCAL date, not `toISOString()`. This repo is worked on in Vancouver (UTC-7/-8), so
// after 5pm local the UTC date is TOMORROW — and a handover stamped a day ahead of every
// other document in the project reads as a stale or forged file. Found by the date on the
// first generated copy disagreeing with its own source brief.
const today = new Date().toLocaleDateString('en-CA')

/* ---------- the operations ---------- */

const METHODS = ['get', 'post', 'put', 'patch', 'delete']
const ops = []
for (const [path, item] of Object.entries(doc.paths)) {
  for (const [method, op] of Object.entries(item)) {
    if (!METHODS.includes(method)) continue
    ops.push({
      id: op.operationId,
      method: method.toUpperCase(),
      path,
      tag: (op.tags ?? []).join(', '),
      summary: op.summary ?? '',
    })
  }
}
ops.sort((a, b) => a.tag.localeCompare(b.tag) || a.path.localeCompare(b.path))

const verbs = ops.reduce(
  (acc, o) => ({ ...acc, [o.method]: (acc[o.method] ?? 0) + 1 }),
  {},
)

/* ---------- the schemas ---------- */

const refName = (r) => (typeof r === 'string' ? r.split('/').pop() : undefined)

/** A type, in the shortest honest form a reader can scan. */
function typeOf(s) {
  if (!s || typeof s !== 'object') return '—'
  if (s.$ref) return `[${refName(s.$ref)}]`
  if (s.enum) return s.enum.map((e) => `\`${e}\``).join(' · ')
  if (s.anyOf) return s.anyOf.map(typeOf).join(' | ')
  if (s.oneOf) return s.oneOf.map(typeOf).join(' | ')
  if (s.type === 'array') return `${typeOf(s.items)}[]`
  if (s.const !== undefined) return `\`${s.const}\``
  const base = Array.isArray(s.type) ? s.type.join(' | ') : (s.type ?? 'object')
  return s.format ? `${base} (${s.format})` : base
}

const clean = (t) => (t ?? '').replace(/\s+/g, ' ').trim()

function renderSchema(name, s) {
  const out = [`#### \`${name}\``]
  if (s.description) out.push('', clean(s.description))
  if (s.enum) {
    out.push('', `One of: ${s.enum.map((e) => `\`${e}\``).join(' · ')}`)
    return out.join('\n')
  }
  if (s.anyOf || s.oneOf) {
    const members = s.anyOf ?? s.oneOf
    out.push('', `${members.length} variants: ${members.map(typeOf).join(' | ')}`)
    return out.join('\n')
  }
  const props = s.properties ?? {}
  if (Object.keys(props).length === 0) return out.join('\n')
  const required = new Set(s.required ?? [])
  out.push('', '| Field | Type | Required | Notes |', '|---|---|---|---|')
  for (const [k, v] of Object.entries(props)) {
    out.push(
      `| \`${k}\` | ${typeOf(v)} | ${required.has(k) ? 'yes' : '—'} | ${clean(v.description)} |`,
    )
  }
  return out.join('\n')
}

const schemas = doc.components?.schemas ?? {}
const errorCodes = schemas.ErrorCode?.enum ?? []

// Event types: every `const`/`enum` string carrying a dot, inside EventFrame.
const eventTypes = new Set()
;(function walk(o) {
  if (Array.isArray(o)) return o.forEach(walk)
  if (!o || typeof o !== 'object') return
  for (const [k, v] of Object.entries(o)) {
    if (k === 'const' && typeof v === 'string' && v.includes('.')) eventTypes.add(v)
    if (k === 'enum' && Array.isArray(v))
      v.forEach((x) => typeof x === 'string' && x.includes('.') && eventTypes.add(x))
    walk(v)
  }
})(schemas.EventFrame ?? {})

/* ---------- assemble ---------- */

const out = `# Manifest — design handover

> **This file is GENERATED and self-contained.** It exists so a design agent with no access
> to the Manifest repository has everything it needs in one place. **Do not edit it** —
> edit its sources and regenerate with \`node scripts/design-handover.mjs\`.
>
> | | |
> |---|---|
> | Generated | ${today}, from commit \`${commit}\` |
> | Sources | \`${SOURCES.brief}\`, \`${SOURCES.contract}\` (v${doc.info.version}), \`${SOURCES.fixtures}\` |
> | Contents | the design brief (part 1), the API surface (2), every object shape (3), every refusal code (4), every event type (5), and realistic fixture data (6) |
>
> **Part 1 is the brief and is the part to read first.** Parts 2–6 are reference: skim them,
> then come back when you need a specific shape or a real value.

---

# Part 1 — The design brief

${brief}

---

# Part 2 — The API surface

**${ops.length} operations** at version **${doc.info.version}**, by verb: ${Object.entries(
  verbs,
)
  .map(([m, n]) => `${n} ${m}`)
  .join(', ')}.

**Note the absence of \`PATCH\` and \`PUT\`.** Nothing in this API is editable — not a
project's name, not its audience, not a quota. That is a real constraint on what an
"edit settings" screen could do today, and it is discussed in the brief's §7.

| Area | Method | Path | Operation | What it does |
|---|---|---|---|---|
${ops.map((o) => `| ${o.tag} | ${o.method} | \`${o.path}\` | \`${o.id}\` | ${clean(o.summary)} |`).join('\n')}

---

# Part 3 — Every object shape

**${Object.keys(schemas).length} schemas.** These are the real published shapes: what a screen
can show is bounded by what is here.

${Object.entries(schemas)
  .map(([n, s]) => renderSchema(n, s))
  .join('\n\n')}

---

# Part 4 — Every refusal code

**${errorCodes.length} codes.** Every error carries a stable \`code\`, a \`message\` written for a
person, and a \`hint\` saying what to do about it. The contract says of the message:
*"For a person. Never parse it; switch on \`code\`."*

Two carry extra structure a design should use: \`RELEASE_PRODUCTION_GATE_UNAVAILABLE\` carries the
whole launch checklist, and \`TOKEN_ACTION_PENDING\` carries the question a human must answer.

${errorCodes.map((c) => `\`${c}\``).join(' · ')}

---

# Part 5 — Every event type

**${eventTypes.size} types.** Each one arrives on the project's live WebSocket and carries a
faculty-legible sentence alongside its machine detail. **Use the sentence** — it was written
for exactly this.

${[...eventTypes]
  .sort()
  .map((e) => `\`${e}\``)
  .join(' · ')}

---

# Part 6 — Realistic fixture data

This is the data \`manifest-mock\` serves. It is hand-written, and held honest by two
independent things: the TypeScript compiler against the generated types, and a JSON Schema
validator against the published contract. **The ids are real UUIDs and the timestamps are
fixed instants**, both deliberately.

**Use these values in a prototype** rather than inventing your own: a design built on a shape
the API does not produce breaks on contact with the real thing, and that is the failure this
whole handover exists to prevent.

\`\`\`typescript
${fixtures.trim()}
\`\`\`
`

writeFileSync(p(OUT), out, 'utf8')
const kb = (Buffer.byteLength(out, 'utf8') / 1024).toFixed(0)
console.log(`design-handover: wrote ${OUT} (${kb} KB) from commit ${commit}`)
console.log(
  `  ${ops.length} operations, ${Object.keys(schemas).length} schemas, ` +
    `${errorCodes.length} error codes, ${eventTypes.size} event types`,
)
