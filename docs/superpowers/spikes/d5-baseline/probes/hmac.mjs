// probes/hmac.mjs — [M8]: GitHub's published test vector, and the obvious comparison's crash.
import * as c from 'node:crypto'
console.log('vector', 'sha256=' + c.createHmac('sha256', "It's a Secret to Everybody").update('Hello, World!').digest('hex'))
console.log('docs   sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17')
const want = c.createHmac('sha256', 's').update('{}').digest()
for (const [label, h] of [['absent', undefined], ['empty', ''], ['short', 'sha256=abc']]) {
  try { c.timingSafeEqual(Buffer.from(h ?? ''), want); console.log(label, 'no throw') } catch (e) { console.log(label, 'THROWS', e.code) }
}
// The codebase's own guard (tokens/token.ts:83): equal lengths first. It REFUSES, without throwing.
const guarded = (h) => { const a = Buffer.isBuffer(h) ? h : Buffer.from(h ?? ''); return a.length === want.length && c.timingSafeEqual(a, want) }
for (const [label, h] of [['absent', undefined], ['empty', ''], ['short', 'sha256=abc']]) console.log(label, 'guarded ->', guarded(h))
// Positive control for the guard: the right digest, as raw bytes, is accepted.
console.log('right digest guarded ->', guarded(Buffer.from(want)), '| one byte off ->', guarded(Buffer.from(want).fill(0, 0, 1)))
