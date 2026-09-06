import type { LogLine, LogOpts } from '../driver.js'
import type { EngineClient } from './engine.js'

const HEADER = 8

/**
 * The Engine API frames its multiplexed stream as
 * `[stream_type:u8][000][size:u32be][payload]`. Nothing guarantees a chunk holds a
 * whole frame — or even a whole header — so both are carried across chunks. S1 wrote
 * this in about forty lines and it needs no library.
 */
export async function* demux(source: AsyncIterable<Buffer>): AsyncIterable<LogLine> {
  let buffer = Buffer.alloc(0)
  const partial: Record<'stdout' | 'stderr', string> = { stdout: '', stderr: '' }

  const flush = function* (stream: 'stdout' | 'stderr', text: string) {
    const combined = partial[stream] + text
    const lines = combined.split('\n')
    partial[stream] = lines.pop() ?? ''
    for (const line of lines) yield { at: new Date(), stream, text: line }
  }

  for await (const chunk of source) {
    buffer = Buffer.concat([buffer, chunk])
    for (;;) {
      if (buffer.length < HEADER) break
      const size = buffer.readUInt32BE(4)
      if (buffer.length < HEADER + size) break
      const stream = buffer[0] === 2 ? 'stderr' : 'stdout'
      const payload = buffer.subarray(HEADER, HEADER + size).toString('utf8')
      buffer = buffer.subarray(HEADER + size)
      yield* flush(stream, payload)
    }
  }
  // Whatever is left has no trailing newline. Dropping it loses the last line of
  // a crash message, which is the line anybody reading logs actually wants.
  for (const stream of ['stdout', 'stderr'] as const) {
    if (partial[stream] !== '') yield { at: new Date(), stream, text: partial[stream] }
  }
}

export async function* containerLogs(
  engine: EngineClient,
  id: string,
  opts: LogOpts,
): AsyncIterable<LogLine> {
  const query = new URLSearchParams({
    stdout: 'true',
    stderr: 'true',
    follow: String(opts.follow ?? false),
    tail: String(opts.tail ?? 'all'),
  })
  const res = await engine.stream(`/containers/${id}/logs?${query.toString()}`)
  try {
    yield* demux(res as unknown as AsyncIterable<Buffer>)
  } finally {
    // §11's `logs` is an AsyncIterable, so a consumer may `break`. Destroying the
    // response is what closes the socket instead of leaking it per aborted stream.
    res.destroy()
  }
}
