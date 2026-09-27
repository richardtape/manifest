// m11-binaries.mts <dir> — [M11] twenty real binaries of Decision 9's ten media types (collected into the session's
// scratchpad by the wrapper, never committed) against: Decision 9's first-bytes table; Decision 8's "is it text?"
// rule (valid UTF-8 with no NUL in the first 8000 bytes — git's rule and the read path's); Decision 10's
// printable runs (>= 16 printable ASCII bytes) through scanText; the build gate's own read (UTF-8 decode of the
// whole file + scanText, build/gates.ts); and the write path — git hash-object of the bytes through a numbered
// scratch file (buildCommit's own command) against `git hash-object <file>`, and today's buildCommit, whose
// content is a STRING encoded as UTF-8 (source/plumbing.ts:132).
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TextDecoder } from 'node:util'
import { scanText } from '../../../../../packages/control-plane/src/build/secret-patterns.ts'
import { buildCommit } from '../../../../../packages/control-plane/src/source/plumbing.ts'

const dir = process.argv[2]!
const TABLE: [string, (b: Buffer) => boolean][] = [ // Decision 9's ten, by their first bytes
  ['png', (b) => b.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))],
  ['jpeg', (b) => b.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))],
  ['gif', (b) => ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('latin1'))],
  ['webp', (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP'],
  ['ico', (b) => b.subarray(0, 4).equals(Buffer.from('00000100', 'hex'))],
  ['pdf', (b) => b.subarray(0, 5).toString('latin1') === '%PDF-'],
  ['woff', (b) => b.subarray(0, 4).toString('latin1') === 'wOFF'],
  ['woff2', (b) => b.subarray(0, 4).toString('latin1') === 'wOF2'],
  ['ttf', (b) => b.subarray(0, 4).equals(Buffer.from('00010000', 'hex')) || b.subarray(0, 4).toString('latin1') === 'true'],
  ['otf', (b) => b.subarray(0, 4).toString('latin1') === 'OTTO'],
]
const isText = (b: Buffer) => { // Decision 8
  if (b.subarray(0, 8000).includes(0)) return false
  try { new TextDecoder('utf-8', { fatal: true }).decode(b); return true } catch { return false }
}
function printableRuns(b: Buffer, min: number): string[] { // Decision 10: strings(1)'s rule with a longer minimum
  const runs: string[] = []; let start = -1
  for (let i = 0; i <= b.length; i++) {
    const c = i < b.length ? b[i]! : 0
    const printable = (c >= 0x20 && c <= 0x7e) || c === 0x09
    if (printable && start < 0) start = i
    if (!printable && start >= 0) { if (i - start >= min) runs.push(b.subarray(start, i).toString('latin1')); start = -1 }
  }
  return runs
}
const git = (args: string[], input?: string) => execFileSync('git', args, { input, encoding: 'utf8', env: { PATH: process.env.PATH!, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' } }).trim()

const rows = []
let runFindings = 0, gateFindings = 0
for (const name of readdirSync(dir).sort()) {
  const bytes = readFileSync(join(dir, name))
  const ext = name.split('.').pop()!
  const matched = TABLE.filter(([, test]) => test(bytes)).map(([t]) => t)
  const runs = printableRuns(bytes, 16)
  const rf = scanText(runs.join('\n'), name)
  const gf = scanText(bytes.toString('utf8'), name) // the build gate's read (readFile(file, 'utf8'))
  runFindings += rf.length; gateFindings += gf.length
  rows.push({ name, bytes: bytes.length, first16: bytes.subarray(0, 16).toString('hex'), table: matched.join('|') || 'NONE',
    tableOk: matched.includes(ext === 'jpg' ? 'jpeg' : ext), classedText: isText(bytes), runs16: runs.length,
    runFindings: rf.map((f) => `${f.rule}@${f.line}`), gateFindings: gf.map((f) => `${f.rule}@${f.line}`) })
}
for (const r of rows) console.log(JSON.stringify(r))
console.log(JSON.stringify({ files: rows.length, tableMatchedAll: rows.every((r) => r.tableOk), anyClassedText: rows.filter((r) => r.classedText).map((r) => r.name),
  printableRunFindings: runFindings, buildGateFindings: gateFindings, over2MiB: rows.filter((r) => r.bytes > 2 * 1024 * 1024).map((r) => r.name) }))

// the write path, for one PNG
const png = join(dir, 'a.png')
const scratch = mkdtempSync(join(tmpdir(), 'manifest-probe-m11-'))
try {
  const bare = join(scratch, 'r.git'); git(['init', '-q', '--bare', bare])
  const numbered = join(scratch, '0'); writeFileSync(numbered, readFileSync(png))
  const viaStdinPaths = git(['--git-dir', bare, 'hash-object', '-w', '--no-filters', '--stdin-paths'], numbered + '\n')
  const direct = git(['hash-object', png])
  const built = await buildCommit({ objects: bare, base: null, changes: [{ op: 'write', path: 'logo.png', content: readFileSync(png).toString('utf8') }],
    message: 'probe', author: { name: 'Probe', email: 'probe@manifest.internal' } })
  const viaBuildCommit = git(['--git-dir', built.gitDir, 'rev-parse', `${built.commit}:logo.png`])
  const builtSize = Number(git(['--git-dir', built.gitDir, 'cat-file', '-s', viaBuildCommit]))
  await built.dispose()
  console.log(JSON.stringify({ png: 'a.png', size: readFileSync(png).length, gitHashObjectFile: direct, hashObjectStdinPaths: viaStdinPaths,
    bytePathEqual: direct === viaStdinPaths, todaysBuildCommitBlob: viaBuildCommit, todaysBuildCommitBlobSize: builtSize, todaysBuildCommitEqual: viaBuildCommit === direct }))
} finally { rmSync(scratch, { recursive: true, force: true }) }
