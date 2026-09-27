// m2-timestamps.mts <containerId> — [M2] Docker's own timestamps. Reads the raw multiplexed frames of
// GET /containers/<id>/logs?timestamps=1 through EngineClient.stream and prints each frame's header and payload
// shape: tail=5 in full (hex of the first 48 bytes), then tail=80 summarised, to see how the 1 MiB line and the
// unterminated "last line" are framed and stamped. Ends with Date.parse over a nine-digit fraction.
import { createEngineClient, resolveSocketPath } from '../../../../../packages/control-plane/src/runtime/docker/engine.ts'

const id = process.argv[2]!
const engine = createEngineClient({ socketPath: resolveSocketPath() })

async function frames(query: string) {
  const res = await engine.stream(`/containers/${id}/logs?${query}`)
  let buf = Buffer.alloc(0)
  for await (const chunk of res as AsyncIterable<Buffer>) buf = Buffer.concat([buf, chunk])
  const out: { stream: number; size: number; payload: Buffer }[] = []
  while (buf.length >= 8) {
    const size = buf.readUInt32BE(4)
    out.push({ stream: buf[0]!, size, payload: buf.subarray(8, 8 + size) })
    buf = buf.subarray(8 + size)
  }
  return out
}

const STAMP = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{1,9}Z) /
console.log('--- tail=5&timestamps=1, every frame')
for (const f of await frames('stdout=1&stderr=1&tail=5&timestamps=1')) {
  const text = f.payload.toString('utf8')
  console.log(JSON.stringify({ stream: f.stream, size: f.size, stamp: STAMP.exec(text)?.[1] ?? null,
    endsWithNewline: text.endsWith('\n'), head: text.slice(0, 60), tail: text.slice(-20) }))
  console.log('  hex48:', f.payload.subarray(0, 48).toString('hex'))
}
console.log('--- tail=80&timestamps=1, summarised')
const t80 = await frames('stdout=1&stderr=1&tail=80&timestamps=1')
const sizes = new Map<string, number>()
let stamped = 0, midLineStamps = 0
for (const f of t80) {
  const text = f.payload.toString('utf8')
  if (STAMP.test(text)) stamped++
  const body = text.replace(STAMP, '')
  const kind = body.startsWith('x') ? `x-chunk(${body.length}B,nl=${body.endsWith('\n')})` : body.startsWith('line') ? 'numbered' : JSON.stringify(body.slice(0, 20))
  sizes.set(kind, (sizes.get(kind) ?? 0) + 1)
  if (body.startsWith('x') && !body.endsWith('\n')) midLineStamps++
}
console.log(JSON.stringify({ frames: t80.length, stamped, xChunksWithoutNewline: midLineStamps, kinds: Object.fromEntries(sizes) }))
console.log('--- the same tail=80 WITHOUT timestamps: frame count and how many numbered lines it reaches back to')
const raw = await frames('stdout=1&stderr=1&tail=80')
const joined = raw.map((f) => f.payload.toString('utf8')).join('')
console.log(JSON.stringify({ frames: raw.length, newlineTerminatedLines: joined.split('\n').length - 1,
  numbered: joined.split('\n').filter((l) => l.startsWith('line')).length, hasLastLine: joined.includes('last line') }))
const nine = '2026-09-27T08:59:01.123456789Z'
console.log('--- Date.parse', JSON.stringify({ nine: Date.parse(nine), three: Date.parse('2026-09-27T08:59:01.123Z'),
  nineTruncated: Date.parse(nine.replace(/(\.\d{3})\d+Z$/, '$1Z')) }))
