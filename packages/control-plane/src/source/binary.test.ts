import { describe, expect, it } from 'vitest'
import { SAMPLE_SECRETS } from '../build/testing.js'
import { scanText } from '../build/index.js'
import {
  BINARY_FILE_BYTES,
  BINARY_KINDS,
  isText,
  mediaTypeOf,
  printableRuns,
} from './binary.js'

/**
 * BYTES THE API WILL WRITE (the front-end enablement plan's Task 4, Decisions 8–10). Every sample
 * is BUILT here from its magic bytes and never read from disk — `[M11]` found real files on this
 * Mac lying about their type, and a test must not depend on which ones a machine has.
 */

const bytes = (...parts: (number[] | string)[]) =>
  Uint8Array.from(
    parts.flatMap((p) => (typeof p === 'string' ? [...Buffer.from(p, 'latin1')] : p)),
  )

/** Each kind's smallest recognisable head, followed by bytes no kind begins with. */
const SAMPLES: Record<string, Uint8Array> = {
  'image/png': bytes(
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13],
    'IHDR',
  ),
  'image/jpeg': bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0x10], 'JFIF', [0]),
  'image/gif': bytes('GIF89a', [1, 0, 1, 0, 0x80, 0, 0]),
  'image/webp': bytes('RIFF', [0x24, 0, 0, 0], 'WEBPVP8 '),
  'image/x-icon': bytes([0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x10, 0x10]),
  'application/pdf': bytes('%PDF-1.4\n', [0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]),
  'font/woff': bytes('wOFF', [0, 1, 0, 0, 0, 0, 0, 0]),
  'font/woff2': bytes('wOF2', [0, 1, 0, 0, 0, 0, 0, 0]),
  'font/ttf': bytes([0x00, 0x01, 0x00, 0x00, 0x00, 0x0a, 0x00, 0x80]),
  'font/otf': bytes('OTTO', [0x00, 0x0a, 0x00, 0x80]),
}

describe('binary files — ten media types by their bytes, text refused, printable runs (Task 4)', () => {
  it('recognises each of the ten media types by its first bytes', () => {
    expect(BINARY_KINDS.map((k) => k.type)).toEqual(Object.keys(SAMPLES))
    for (const [type, sample] of Object.entries(SAMPLES)) {
      expect(mediaTypeOf(sample), type).toBe(type)
      // Recognised is not text: every sample would pass Decision 8's rule too.
      expect(isText(sample), type).toBe(false)
    }
    // GIF's older version is the same kind; a RIFF that is not WebP (a WAV) is none.
    expect(mediaTypeOf(bytes('GIF87a', [1, 0, 1, 0]))).toBe('image/gif')
    expect(mediaTypeOf(bytes('RIFF', [0x24, 0, 0, 0], 'WAVEfmt '))).toBeNull()
  })

  it('recognises nothing for an ELF, a Mach-O, a ZIP or WebAssembly', () => {
    for (const magic of [
      [0x7f, 0x45, 0x4c, 0x46],
      [0xcf, 0xfa, 0xed, 0xfe],
      [0x50, 0x4b, 0x03, 0x04],
      [0x00, 0x61, 0x73, 0x6d],
    ]) {
      expect(
        mediaTypeOf(Uint8Array.from([...magic, 0, 0, 0, 0])),
        String(magic),
      ).toBeNull()
    }
    // …nor a head too short to hold a whole signature, nor nothing at all.
    expect(mediaTypeOf(Uint8Array.from([0x89, 0x50, 0x4e]))).toBeNull()
    expect(mediaTypeOf(new Uint8Array())).toBeNull()
  })

  it('calls UTF-8 with no NUL text, and a NUL in the first 8000 bytes not', () => {
    expect(isText(bytes('console.log(1)\n'))).toBe(true)
    expect(isText(Buffer.from('é — ü\n', 'utf8'))).toBe(true)
    expect(isText(new Uint8Array())).toBe(true)
    // A NUL inside the first 8000 bytes is git's own rule for binary (reading.ts's)…
    expect(isText(bytes('a'.repeat(7999), [0]))).toBe(false)
    // …and past it, the same bytes are text by that rule.
    expect(isText(bytes('a'.repeat(8000), [0]))).toBe(true)
    // Not UTF-8 is not text: a lone continuation byte, and Latin-1's é.
    expect(isText(bytes('caf', [0xe9]))).toBe(false)
    expect(isText(bytes([0x80]))).toBe(false)
  })

  it('finds the printable runs of at least 16 bytes, one per line', () => {
    const key = SAMPLE_SECRETS['an AWS access key id']
    const pdfish = bytes(
      '%PDF-1.4',
      [0],
      key,
      [0, 1, 2],
      'fifteen chars!!',
      [0xff],
      'sixteen chars!!!',
    )
    const runs = printableRuns(pdfish)
    // '%PDF-1.4' is 8 bytes and 'fifteen chars!!' 15: neither is a run.
    expect(runs.split('\n')).toEqual([key, 'sixteen chars!!!'])
    // …so the rules already written read a key between NULs as they read it in text.
    expect(scanText(runs, 'syllabus.pdf')).toEqual([
      { path: 'syllabus.pdf', line: 1, rule: 'an AWS access key id' },
    ])
    // A run that ends the bytes is kept; no run is an empty string.
    expect(printableRuns(bytes([0], 'x'.repeat(16)))).toBe('x'.repeat(16))
    expect(printableRuns(bytes([0, 1, 2]))).toBe('')
    // The minimum is a parameter.
    expect(printableRuns(bytes('abcd', [0]), 4)).toBe('abcd')
  })

  it('reads a printable run as long as the file, without spreading it into an argument list', () => {
    // A PDF may carry megabytes of plain ASCII after one binary byte; the whole run is one line.
    const long = new Uint8Array(BINARY_FILE_BYTES).fill(0x41)
    long[0] = 0
    expect(printableRuns(long)).toHaveLength(BINARY_FILE_BYTES - 1)
  })

  it('bounds a binary file at 2 MiB', () => {
    expect(BINARY_FILE_BYTES).toBe(2 * 1024 * 1024)
  })
})
