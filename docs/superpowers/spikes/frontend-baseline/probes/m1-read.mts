// m1-read.mts <containerId> <tail|all> — drives the control plane's own containerLogs once and reports
// lines, bytes, wall time and peak RSS (sampled every 10 ms). One process per tail, so each peak is its own.
import { createEngineClient, resolveSocketPath } from '../../../../../packages/control-plane/src/runtime/docker/engine.ts'
import { containerLogs } from '../../../../../packages/control-plane/src/runtime/docker/logs.ts'

const [id, tailArg] = process.argv.slice(2)
const engine = createEngineClient({ socketPath: resolveSocketPath() })
const opts = tailArg === 'all' ? {} : { tail: Number(tailArg) }
const baseRss = process.memoryUsage().rss
let peak = baseRss
const sampler = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss) }, 10)
const t0 = performance.now()
const lines: { stream: string; len: number; head: string }[] = []
let bytes = 0
let longest = 0
for await (const line of containerLogs(engine, id!, opts)) {
  const len = Buffer.byteLength(line.text)
  bytes += len + 1
  longest = Math.max(longest, len)
  lines.push({ stream: line.stream, len, head: line.text.slice(0, 24) })
  peak = Math.max(peak, process.memoryUsage().rss)
}
const ms = performance.now() - t0
clearInterval(sampler)
const mb = (n: number) => (n / 1048576).toFixed(1) + ' MiB'
console.log(JSON.stringify({
  tail: tailArg, lines: lines.length, bytes, longestLine: longest,
  megabyteLineWhole: lines.some((l) => l.len === 1048576),
  xLines: lines.filter((l) => l.head.startsWith('xxxx')).length,
  lastLineArrived: lines.some((l) => l.head === 'last line'),
  first: lines[0]?.head, last: lines.at(-1)?.head,
  wallMs: Math.round(ms), rssBase: mb(baseRss), rssPeak: mb(peak), rssGrowth: mb(peak - baseRss),
}))
