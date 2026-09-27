import { describe, expect, it } from 'vitest'
import type { LogLine, RuntimeLogLine } from '../driver.js'
import { demux } from './logs.js'

/** Builds the Engine API's framed format: [type][000][size:u32be][payload]. */
function frame(stream: 1 | 2, text: string): Buffer {
  const payload = Buffer.from(text, 'utf8')
  const header = Buffer.alloc(8)
  header[0] = stream
  header.writeUInt32BE(payload.length, 4)
  return Buffer.concat([header, payload])
}

async function* once(buffers: Buffer[]): AsyncIterable<Buffer> {
  for (const b of buffers) yield b
}

const collect = async <T extends LogLine>(source: AsyncIterable<T>): Promise<T[]> => {
  const out: T[] = []
  for await (const line of source) out.push(line)
  return out
}

describe('the Docker log frame demuxer', () => {
  it('separates stdout from stderr', async () => {
    const lines = await collect(demux(once([frame(1, 'hello\n'), frame(2, 'oops\n')])))
    expect(lines.map((l) => [l.stream, l.text])).toEqual([
      ['stdout', 'hello'],
      ['stderr', 'oops'],
    ])
  })

  it('splits a multi-line frame into one LogLine per line', async () => {
    const lines = await collect(demux(once([frame(1, 'a\nb\nc\n')])))
    expect(lines.map((l) => l.text)).toEqual(['a', 'b', 'c'])
  })

  // THE TEST THAT MATTERS. A demuxer that assumes a chunk contains whole frames
  // passes every small test and corrupts output from a chatty container.
  it('reassembles a frame split across chunk boundaries', async () => {
    const whole = Buffer.concat([
      frame(1, 'split-across-chunks\n'),
      frame(2, 'and-this-one\n'),
    ])
    const oneByteAtATime = [...whole].map((b) => Buffer.from([b]))
    const lines = await collect(demux(once(oneByteAtATime)))
    expect(lines.map((l) => [l.stream, l.text])).toEqual([
      ['stdout', 'split-across-chunks'],
      ['stderr', 'and-this-one'],
    ])
  })

  it('emits a trailing line that has no newline', async () => {
    const lines = await collect(demux(once([frame(1, 'no trailing newline')])))
    expect(lines.map((l) => l.text)).toEqual(['no trailing newline'])
  })

  it('gives every line a timestamp', async () => {
    const [line] = await collect(demux(once([frame(1, 'x\n')])))
    expect(line!.at).toBeInstanceOf(Date)
  })

  // --- The front-end enablement plan's Task 2: stamps, a per-line bound, and entries ---

  const STAMP = '2026-09-27T10:03:00.123456789Z'

  it("reads Docker's own timestamp into `at`, and says it did", async () => {
    const lines = await collect(
      demux(once([frame(1, `${STAMP} listening on 3000\n`)]), {
        timestamps: true,
        lineBytes: 4096,
      }),
    )
    expect(lines).toEqual<RuntimeLogLine[]>([
      {
        at: new Date('2026-09-27T10:03:00.123Z'),
        stamped: true,
        stream: 'stdout',
        text: 'listening on 3000',
        cutBytes: 0,
        entries: 1,
      },
    ])
  })

  it('keeps the read time, and says so, for a line Docker did not stamp', async () => {
    const before = Date.now()
    const [line] = await collect(
      demux(once([frame(1, 'no stamp here\n')]), { timestamps: true, lineBytes: 4096 }),
    )
    expect(line).toMatchObject({ stamped: false, text: 'no stamp here', cutBytes: 0 })
    expect(line!.at.getTime()).toBeGreaterThanOrEqual(before)
    expect(line!.at.getTime()).toBeLessThanOrEqual(Date.now())
  })

  // [M2]: Docker stores a long line as 16 KiB entries, and each arrives as its OWN frame with
  // its own stamp — the line's `\n` a frame of stamp, space and newline. A parse "on \n" would
  // leave every later stamp inside the text.
  it('strips the stamp from EVERY frame of a long line, and counts the entries it took', async () => {
    const lines = await collect(
      demux(
        once([
          frame(1, `${STAMP} first-chunk-`),
          frame(1, `2026-09-27T10:03:00.123456790Z second-chunk`),
          frame(1, `2026-09-27T10:03:00.123456791Z \n`),
          frame(1, `2026-09-27T10:03:01.5Z after\n`),
        ]),
        { timestamps: true, lineBytes: 4096 },
      ),
    )
    expect(lines.map((l) => [l.text, l.stamped, l.entries])).toEqual([
      ['first-chunk-second-chunk', true, 3],
      ['after', true, 1],
    ])
    // The line's time is the time it BEGAN — the first entry's.
    expect(lines[0]!.at).toEqual(new Date('2026-09-27T10:03:00.123Z'))
    expect(lines[1]!.at).toEqual(new Date('2026-09-27T10:03:01.500Z'))
  })

  it('cuts a line at lineBytes AS IT READS — a megabyte line never buffered', async () => {
    const big = 'x'.repeat(1_048_576)
    const chunks = [
      frame(1, big.slice(0, 500_000)),
      frame(1, big.slice(500_000) + '\nnext\n'),
    ]
    const lines = await collect(
      demux(once(chunks), { timestamps: false, lineBytes: 4096 }),
    )
    expect(lines[0]).toMatchObject({ text: 'x'.repeat(4096), cutBytes: 1_048_576 - 4096 })
    expect(lines[1]).toMatchObject({ text: 'next', cutBytes: 0 })
    expect(lines).toHaveLength(2)
  })

  it('keeps the stamp of a line it cuts', async () => {
    const [line] = await collect(
      demux(once([frame(2, `${STAMP} ${'y'.repeat(5000)}\n`)]), {
        timestamps: true,
        lineBytes: 4096,
      }),
    )
    expect(line).toMatchObject({
      at: new Date('2026-09-27T10:03:00.123Z'),
      stamped: true,
      stream: 'stderr',
      text: 'y'.repeat(4096),
      cutBytes: 5000 - 4096,
    })
  })

  it('still flushes a last line with no newline, cut if it must be', async () => {
    const lines = await collect(
      demux(once([frame(1, 'z'.repeat(5000))]), { timestamps: false, lineBytes: 4096 }),
    )
    expect(lines).toEqual([
      expect.objectContaining({ text: 'z'.repeat(4096), cutBytes: 904, entries: 1 }),
    ])
  })

  it('never cuts inside a UTF-8 character', async () => {
    // 'é' is two bytes, so 4097 bytes would end half-way through the 2049th.
    const [line] = await collect(
      demux(once([frame(1, 'é'.repeat(3000) + '\n')]), {
        timestamps: false,
        lineBytes: 4097,
      }),
    )
    expect(line!.text).toBe('é'.repeat(2048))
    expect(line!.text).not.toContain('\uFFFD')
    expect(line!.cutBytes).toBe(6000 - 4096)
  })

  it('decodes a character split across two frames whole', async () => {
    const bytes = Buffer.from('café\n', 'utf8')
    const at = bytes.indexOf(0xa9) // the second byte of 'é'
    const raw = (payload: Buffer) => {
      const header = Buffer.alloc(8)
      header[0] = 1
      header.writeUInt32BE(payload.length, 4)
      return Buffer.concat([header, payload])
    }
    const [line] = await collect(
      demux(once([raw(bytes.subarray(0, at)), raw(bytes.subarray(at))]), {}),
    )
    expect(line!.text).toBe('café')
  })

  it('reads as it always did when no options are given — unbounded and unstamped', async () => {
    const long = 'w'.repeat(10_000)
    const [line] = await collect(demux(once([frame(1, `${STAMP} ${long}\n`)])))
    expect(line).toMatchObject({ text: `${STAMP} ${long}`, stamped: false, cutBytes: 0 })
  })
})
