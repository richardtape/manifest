import type { LogOpts, RuntimeLogLine } from '../driver.js'
import { EngineError, type EngineClient } from './engine.js'

const HEADER = 8
const NEWLINE = 0x0a

/**
 * What a reader of the stream asks for (the front-end enablement plan's Task 2). Both are
 * optional, and absent they mean what `demux` always did — unbounded lines and the time of
 * reading — which is what `exec`, the sign-in, the readiness probe and the scan still read.
 */
export interface DemuxOpts {
  /** Cut each line to at most this many UTF-8 bytes AS IT IS READ, on a character boundary. */
  lineBytes?: number
  /** The runtime stamped each record: read the stamp into `at` and strip it from the text. */
  timestamps?: boolean
}

/**
 * Docker's stamp: RFC 3339, UTC, one to nine fractional digits, then ONE space. Measured on
 * this Docker (Task 1's M2): `2026-09-27T09:02:57.196447669Z `. Matched on bytes, because it is
 * ASCII and it heads every record.
 */
const STAMP = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d{1,9})?Z /

function stampOf(payload: Buffer): { at: Date; length: number } | undefined {
  // 40 bytes holds the longest stamp; decoding more would decode the app's text for nothing.
  const head = payload.subarray(0, 40).toString('latin1')
  const m = STAMP.exec(head)
  if (m === null) return undefined
  // `Date` holds milliseconds; `Date.parse` reads nine digits and keeps three (M2).
  const at = new Date(`${m[1]}${(m[2] ?? '').slice(0, 4)}Z`)
  return Number.isNaN(at.getTime()) ? undefined : { at, length: m[0].length }
}

/**
 * The byte length at which `bytes` may be cut without splitting a UTF-8 character: `max`, or
 * less when the byte AT `max` continues a character that began before it.
 */
function characterBoundary(bytes: Buffer, max: number): number {
  if (bytes.length <= max) return bytes.length
  let end = max
  // 0b10xxxxxx is a continuation byte: the character it belongs to began earlier.
  while (end > 0 && (bytes[end]! & 0xc0) === 0x80) end -= 1
  return end
}

/** One stream's line in progress: its bytes so far, bounded, and what it has dropped. */
interface Partial {
  open: boolean
  chunks: Buffer[]
  kept: number
  dropped: number
  at: Date
  stamped: boolean
  entries: number
}

const empty = (): Partial => ({
  open: false,
  chunks: [],
  kept: 0,
  dropped: 0,
  at: new Date(0),
  stamped: false,
  entries: 0,
})

/**
 * The Engine API frames its multiplexed stream as
 * `[stream_type:u8][000][size:u32be][payload]`. Nothing guarantees a chunk holds a
 * whole frame — or even a whole header — so both are carried across chunks. S1 wrote
 * this in about forty lines and it needs no library.
 *
 * **A line is assembled from BYTES and decoded once, when it ends** — a frame can end half-way
 * through a character, and decoding each frame alone turned `café` into `caf��`
 * (found by this plan's Task 2). **It is cut as it is read**: past `lineBytes` its bytes are
 * counted and dropped, never held, and a few more are kept so the cut can land on a character
 * boundary. **And with `timestamps`, the stamp is read from EVERY frame** — Docker keeps a long
 * line as 16 KiB records, each its own frame with its own stamp, and the line's newline is a
 * frame of stamp, space and `\n` (M2). A line's time is its first record's.
 */
export async function* demux(
  source: AsyncIterable<Buffer>,
  opts: DemuxOpts = {},
): AsyncIterable<RuntimeLogLine> {
  const limit = opts.lineBytes
  // Up to three bytes past the limit: enough to see whether the cut splits a character.
  const keepAtMost = limit === undefined ? Infinity : limit + 3
  let buffer = Buffer.alloc(0)
  const partial: Record<'stdout' | 'stderr', Partial> = {
    stdout: empty(),
    stderr: empty(),
  }

  const append = (line: Partial, bytes: Buffer): void => {
    const room = Math.max(0, keepAtMost - line.kept)
    const kept = bytes.length <= room ? bytes : bytes.subarray(0, room)
    if (kept.length > 0) {
      line.chunks.push(kept)
      line.kept += kept.length
    }
    line.dropped += bytes.length - kept.length
  }

  const finish = (stream: 'stdout' | 'stderr'): RuntimeLogLine => {
    const line = partial[stream]
    const bytes = Buffer.concat(line.chunks)
    const end = limit === undefined ? bytes.length : characterBoundary(bytes, limit)
    const out: RuntimeLogLine = {
      at: line.at,
      stamped: line.stamped,
      stream,
      text: bytes.subarray(0, end).toString('utf8'),
      cutBytes: line.dropped + (bytes.length - end),
      entries: line.entries,
    }
    partial[stream] = empty()
    return out
  }

  const open = (line: Partial, at: Date, stamped: boolean): void => {
    line.open = true
    line.at = at
    line.stamped = stamped
  }

  for await (const chunk of source) {
    buffer = Buffer.concat([buffer, chunk])
    for (;;) {
      if (buffer.length < HEADER) break
      const size = buffer.readUInt32BE(4)
      if (buffer.length < HEADER + size) break
      const stream = buffer[0] === 2 ? 'stderr' : 'stdout'
      let payload = buffer.subarray(HEADER, HEADER + size)
      buffer = buffer.subarray(HEADER + size)

      const stamp = opts.timestamps === true ? stampOf(payload) : undefined
      if (stamp !== undefined) payload = payload.subarray(stamp.length)
      const at = stamp?.at ?? new Date()
      const line = partial[stream]
      if (!line.open) open(line, at, stamp !== undefined)
      // The record is counted on the line open when it BEGAN, so the sum over lines is the
      // number of records received.
      line.entries += 1

      let start = 0
      for (;;) {
        const newline = payload.indexOf(NEWLINE, start)
        append(
          partial[stream],
          payload.subarray(start, newline === -1 ? undefined : newline),
        )
        if (newline === -1) break
        yield finish(stream)
        start = newline + 1
        if (start >= payload.length) break
        // A line that begins part-way through a record: that record is already counted.
        open(partial[stream], at, stamp !== undefined)
      }
    }
  }
  // Whatever is left has no trailing newline. Dropping it loses the last line of
  // a crash message, which is the line anybody reading logs actually wants.
  for (const stream of ['stdout', 'stderr'] as const) {
    const line = partial[stream]
    if (line.open && line.kept + line.dropped > 0) yield finish(stream)
  }
}

export async function* containerLogs(
  engine: EngineClient,
  id: string,
  opts: LogOpts,
): AsyncIterable<RuntimeLogLine> {
  const query = new URLSearchParams({
    stdout: 'true',
    stderr: 'true',
    follow: String(opts.follow ?? false),
    tail: String(opts.tail ?? 'all'),
    timestamps: String(opts.timestamps ?? false),
  })
  const res = await engine.stream(`/containers/${id}/logs?${query.toString()}`)
  // `stream` answers whatever the daemon sent, and a refusal is a JSON body — which, read as
  // frames, claims a size near 1.9 GB in its bytes 4–7, so nothing was ever yielded and a
  // removed container read exactly like an app that printed nothing (the front-end enablement
  // plan's whole-branch review, I3). The body is not read: it names the container.
  const status = res.statusCode ?? 0
  if (status < 200 || status >= 300) {
    res.destroy()
    throw new EngineError(
      status === 404 ? 'LOGS_TARGET_NOT_FOUND' : 'LOGS_FAILED',
      `cannot read the logs of '${id}': the daemon answered ${status}`,
      'The instance may have been removed; `status()` reports `gone` for an id the daemon does not know.',
    )
  }
  try {
    yield* demux(res as unknown as AsyncIterable<Buffer>, {
      ...(opts.lineBytes === undefined ? {} : { lineBytes: opts.lineBytes }),
      ...(opts.timestamps === undefined ? {} : { timestamps: opts.timestamps }),
    })
  } finally {
    // §11's `logs` is an AsyncIterable, so a consumer may `break`. Destroying the
    // response is what closes the socket instead of leaking it per aborted stream.
    res.destroy()
  }
}
