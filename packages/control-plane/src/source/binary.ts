/**
 * BYTES THE API WILL WRITE (the front-end enablement plan's Task 4, Decisions 7–10): what a
 * course app needs — its images, a syllabus, a typeface — recognised by their FIRST BYTES, never
 * by a name (`[M11]`: real files named `.jpg` were PNGs, and one `.gif` was no image at all). A
 * person's `git push` can still put anything in the repository; this confines what an AGENT puts
 * there through the API (D14). No library: a dependency for ten byte patterns (the plan's *Tech
 * Stack*).
 */

/** The largest binary file one write carries, decoded, and one `encoding=base64` read answers. */
export const BINARY_FILE_BYTES = 2 * 1024 * 1024

/**
 * Bytes as ASCII, through a Buffer VIEW. `String.fromCharCode(...bytes)` — the plan's snippet —
 * spreads every byte into an argument list, and a printable run of a megabyte overflowed the
 * stack (measured, this task: `RangeError: Maximum call stack size exceeded` at 2 MiB).
 */
const ascii = (b: Uint8Array, from: number, to: number): string => {
  const end = Math.min(to, b.length)
  return end <= from
    ? ''
    : Buffer.from(b.buffer, b.byteOffset + from, end - from).toString('latin1')
}

const starts = (b: Uint8Array, magic: readonly number[]) =>
  magic.every((x, i) => b[i] === x)

/**
 * DECISION 9's TABLE — and nothing an app can EXECUTE: no ELF, no Mach-O, no archive, no
 * WebAssembly. A new kind is one line here and one sentence in the request's refusal.
 */
export const BINARY_KINDS: readonly { type: string; test: (b: Uint8Array) => boolean }[] =
  [
    {
      type: 'image/png',
      test: (b) => starts(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    },
    { type: 'image/jpeg', test: (b) => starts(b, [0xff, 0xd8, 0xff]) },
    {
      type: 'image/gif',
      test: (b) => ascii(b, 0, 6) === 'GIF87a' || ascii(b, 0, 6) === 'GIF89a',
    },
    {
      type: 'image/webp',
      test: (b) => ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP',
    },
    { type: 'image/x-icon', test: (b) => starts(b, [0x00, 0x00, 0x01, 0x00]) },
    { type: 'application/pdf', test: (b) => ascii(b, 0, 5) === '%PDF-' },
    { type: 'font/woff', test: (b) => ascii(b, 0, 4) === 'wOFF' },
    { type: 'font/woff2', test: (b) => ascii(b, 0, 4) === 'wOF2' },
    { type: 'font/ttf', test: (b) => starts(b, [0x00, 0x01, 0x00, 0x00]) },
    { type: 'font/otf', test: (b) => ascii(b, 0, 4) === 'OTTO' },
  ]

/** The media type these bytes BEGIN as, or null for anything the table does not name. */
export const mediaTypeOf = (b: Uint8Array): string | null =>
  BINARY_KINDS.find((k) => k.test(b))?.type ?? null

/**
 * DECISION 8: TEXT is UTF-8 with no NUL in its first 8000 bytes — git's own rule, and the read
 * path's (`reading.ts`). Bytes that are text must be written AS text, or base64 is a way to put
 * a script past the text rules, the diff and the push-time scan's hunk reader.
 */
export function isText(b: Uint8Array): boolean {
  if (b.subarray(0, 8000).includes(0)) return false
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(b)
    return true
  } catch {
    return false
  }
}

/**
 * DECISION 10: every run of at least `min` printable ASCII bytes — `strings(1)`'s rule with a
 * longer minimum — one per line, so `scanText` reads a key pasted into a PDF with the rules it
 * already has. A finding's `line` then counts RUNS, not lines of the file. `[M11]` ran 23 real
 * files of the ten kinds through `scanText` at 16 and found nothing, so the minimum stands.
 */
export function printableRuns(b: Uint8Array, min = 16): string {
  const runs: string[] = []
  let start = -1
  for (let i = 0; i <= b.length; i++) {
    const printable = i < b.length && b[i]! >= 0x20 && b[i]! <= 0x7e
    if (printable && start < 0) start = i
    if (!printable && start >= 0) {
      if (i - start >= min) runs.push(ascii(b, start, i))
      start = -1
    }
  }
  return runs.join('\n')
}
