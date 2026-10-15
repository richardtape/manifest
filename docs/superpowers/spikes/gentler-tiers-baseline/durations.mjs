// The gentler test tiers plan's measurements: read a Vitest JSON report (and, given a second, compare).
//   node durations.mjs <report.json> [<baseline.json>]
import { readFileSync } from 'node:fs'

function read(path) {
  const report = JSON.parse(readFileSync(path, 'utf8'))
  const tests = report.testResults.flatMap((file) =>
    file.assertionResults.map((test) => ({
      key: `${file.name.replace(/^.*?\/packages\//, 'packages/')} > ${test.fullName}`,
      status: test.status,
      ms: test.duration ?? 0,
      failure: (test.failureMessages[0] ?? '').split('\n')[0],
    })),
  )
  // A file whose hook failed may have no failed assertion of its own; its message is the file's.
  const fileFailures = report.testResults
    .filter((file) => file.status === 'failed' && file.message)
    .map((file) => `${file.name.replace(/^.*?\/packages\//, 'packages/')}: ${file.message.split('\n')[0]}`)
  const end = Math.max(...report.testResults.map((file) => file.endTime))
  return { tests, fileFailures, wallS: (end - report.startTime) / 1000 }
}

const [path, basePath] = process.argv.slice(2)
const run = read(path)
const red = run.tests.filter((test) => test.status === 'failed')
console.log(`wall ${run.wallS.toFixed(0)} s, ${run.tests.length} tests, ${red.length} failed`)
console.log(`  timed out: ${red.filter((test) => /timed out/i.test(test.failure)).length}`)
console.log(`  deadlock detected: ${red.filter((test) => /deadlock detected/i.test(test.failure)).length}`)
for (const test of red) console.log(`  RED ${test.key}: ${test.failure.slice(0, 160)}`)
for (const line of run.fileFailures) console.log(`  FILE ${line.slice(0, 200)}`)
console.log('slowest 25:')
for (const test of [...run.tests].sort((a, b) => b.ms - a.ms).slice(0, 25)) {
  console.log(`  ${String(Math.round(test.ms)).padStart(7)} ms  ${test.key}`)
}
const slow = run.tests.filter((test) => test.ms > 5000)
console.log(`over 5000 ms (the slow list): ${slow.length}`)
for (const test of slow) console.log(`  ${String(Math.round(test.ms)).padStart(7)} ms  ${test.key}`)

if (basePath) {
  const base = read(basePath)
  const before = new Map(base.tests.map((test) => [test.key, test.ms]))
  console.log(`wall ratio (this / baseline): ${(run.wallS / base.wallS).toFixed(2)}`)
  // Ratios only for tests that took at least half a second in the baseline: below that, noise.
  const ratios = run.tests
    .filter((test) => (before.get(test.key) ?? 0) >= 500)
    .map((test) => ({ key: test.key, ratio: test.ms / before.get(test.key) }))
    .sort((a, b) => b.ratio - a.ratio)
  console.log(`per-test ratio over ${ratios.length} tests ≥ 500 ms in the baseline: max ${ratios[0]?.ratio.toFixed(2)}`)
  for (const { key, ratio } of ratios.slice(0, 10)) console.log(`  ×${ratio.toFixed(2)}  ${key}`)
}
