import { describe, expect, it } from 'vitest'
import type { LogLine } from '../driver.js'
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

const collect = async (source: AsyncIterable<LogLine>): Promise<LogLine[]> => {
  const out: LogLine[] = []
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
})
