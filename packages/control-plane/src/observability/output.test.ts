import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createFakeDriver, type FakeDriver } from '../runtime/index.js'
import {
  OUTPUT_DEFAULTS,
  OUTPUT_REDACTION_MARGIN,
  readRecentOutput,
  type OutputSource,
  type OutputSourceLine,
} from './output.js'
import { makeRedactor } from './redact.js'

/** For the cases whose subject is not redaction: a redactor that changes nothing. */
const keep = (value: unknown): unknown => value

const numbered = (n: number): { text: string }[] =>
  Array.from({ length: n }, (_, i) => ({ text: `line ${i + 1}` }))

async function startedInstance(driver: FakeDriver): Promise<string> {
  const handle = await driver.ensureInstance({
    instanceId: randomUUID(),
    name: `output-${randomUUID().slice(0, 8)}`,
    hostname: 'output.staging.manifest.internal',
    image: { repository: 'local/output', digest: `sha256:${'0'.repeat(64)}` },
    env: {},
    port: 3000,
    healthPath: '/healthz',
    resources: { cpu: 1, memoryMi: 256, pids: 128, diskMi: 512 },
    projectSlug: 'output',
    environmentKind: 'staging',
    releaseId: randomUUID(),
    services: [],
    egressAllow: [],
    needsAiGateway: false,
  })
  return handle.id
}

type SourceLine = OutputSourceLine

/** A source that answers exactly these lines, whatever it is asked — as a driver may. */
function scripted(
  lines: SourceLine[],
  options: { failAfter?: number } = {},
): OutputSource & { asked: unknown[] } {
  const asked: unknown[] = []
  return {
    asked,
    async *logs(_id, opts) {
      asked.push(opts)
      for (let i = 0; i < lines.length; i += 1) {
        if (options.failAfter === i) throw new TypeError('the socket said hunter2')
        yield lines[i]!
      }
    },
  }
}

const line = (text: string, extra: Partial<SourceLine> = {}): SourceLine => ({
  at: new Date('2026-09-27T10:00:00Z'),
  stamped: true,
  stream: 'stdout',
  text,
  cutBytes: 0,
  entries: 1,
  ...extra,
})

describe('readRecentOutput — the ONE reader of an app’s recent output (§14)', () => {
  it('answers the LAST lines, oldest first, and knows there were more', async () => {
    const driver = createFakeDriver()
    const id = await startedInstance(driver)
    driver.seedLogs(id, numbered(250))
    const out = await readRecentOutput(
      driver,
      id,
      { ...OUTPUT_DEFAULTS, lines: 200 },
      keep,
    )
    expect(out.lines.map((l) => l.text)).toEqual(
      numbered(250)
        .slice(50)
        .map((l) => l.text),
    )
    expect(out.truncated).toEqual({ lines: true, bytes: false })
    expect(out.failure).toBeNull()
  })

  it('says nothing was dropped when nothing was', async () => {
    const driver = createFakeDriver()
    const id = await startedInstance(driver)
    driver.seedLogs(id, numbered(20))
    const out = await readRecentOutput(
      driver,
      id,
      { ...OUTPUT_DEFAULTS, lines: 200 },
      keep,
    )
    // The fake's own boot line, then the twenty.
    expect(out.lines).toHaveLength(21)
    expect(out.lines.at(-1)!.text).toBe('line 20')
    expect(out.truncated).toEqual({ lines: false, bytes: false })
  })

  it('keeps the NEWEST lines that fit in maxBytes, dropping from the oldest end', async () => {
    const driver = createFakeDriver()
    const id = await startedInstance(driver)
    // 2048 bytes each: a four-digit number, then filler.
    const lines = Array.from({ length: 200 }, (_, i) => ({
      text: `${String(i + 1).padStart(4, '0')}${'a'.repeat(2044)}`,
    }))
    driver.seedLogs(id, lines)
    const out = await readRecentOutput(
      driver,
      id,
      { ...OUTPUT_DEFAULTS, lines: 200, maxBytes: 65_536 },
      keep,
    )
    expect(out.lines).toHaveLength(32)
    expect(out.lines[0]!.text.slice(0, 4)).toBe('0169')
    expect(out.lines.at(-1)!.text.slice(0, 4)).toBe('0200')
    expect(out.truncated.bytes).toBe(true)
  })

  it('answers what it read and the failure, when the source throws part-way', async () => {
    const source = scripted([line('one'), line('two'), line('three'), line('four')], {
      failAfter: 3,
    })
    const out = await readRecentOutput(source, 'h', OUTPUT_DEFAULTS, keep)
    expect(out.lines.map((l) => l.text)).toEqual(['one', 'two', 'three'])
    // The error's NAME, never its message: a message can carry a path or an id.
    expect(out.failure).toBe('TypeError')
    expect(JSON.stringify(out)).not.toContain('hunter2')
  })

  it('names a failure by its code when it has one, as an Incident always has', async () => {
    const source: OutputSource = {
      async *logs() {
        throw Object.assign(new Error('read /var/lib/docker/x: hunter2'), {
          code: 'ECONNRESET',
        })
      },
    }
    const out = await readRecentOutput(source, 'h', OUTPUT_DEFAULTS, keep)
    expect(out).toEqual({
      lines: [],
      truncated: { lines: false, bytes: false },
      failure: 'ECONNRESET',
    })
  })

  // [M1]: a runtime's `tail` counts its own records, and a long line is several — so a tail can
  // begin INSIDE a line. When it sent as many records as were asked for, the oldest line may be
  // a fragment, and there may have been more.
  it('drops the oldest line when the runtime sent all the records it was asked for', async () => {
    const fragment = line('x'.repeat(100), { entries: 60 })
    const rest = Array.from({ length: 141 }, (_, i) => line(`after ${i + 1}`))
    const out = await readRecentOutput(
      scripted([fragment, ...rest]),
      'h',
      OUTPUT_DEFAULTS,
      keep,
    )
    // 60 + 141 = 201 records: exactly the lines + 1 asked for.
    expect(out.lines).toHaveLength(141)
    expect(out.lines[0]!.text).toBe('after 1')
    expect(out.truncated.lines).toBe(true)
  })

  it('keeps the oldest line when the runtime sent fewer records than asked — the log began there', async () => {
    const whole = line('x'.repeat(100), { entries: 59 })
    const rest = Array.from({ length: 141 }, (_, i) => line(`after ${i + 1}`))
    const out = await readRecentOutput(
      scripted([whole, ...rest]),
      'h',
      OUTPUT_DEFAULTS,
      keep,
    )
    expect(out.lines).toHaveLength(142)
    expect(out.truncated.lines).toBe(false)
  })

  it('asks for one record more than it answers, stamped, cut with room to redact', async () => {
    const source = scripted([])
    await readRecentOutput(source, 'h', { ...OUTPUT_DEFAULTS, lines: 10 }, keep)
    expect(source.asked).toEqual([
      {
        tail: 11,
        lineBytes: OUTPUT_DEFAULTS.lineBytes + OUTPUT_REDACTION_MARGIN,
        timestamps: true,
      },
    ])
  })

  it('redacts every line with the redactor it is given, and nothing else of the answer', async () => {
    const driver = createFakeDriver()
    const id = await startedInstance(driver)
    driver.seedLogs(id, [{ text: 'connecting with swordfish-7c2e', stream: 'stderr' }])
    const out = await readRecentOutput(
      driver,
      id,
      OUTPUT_DEFAULTS,
      makeRedactor(['swordfish-7c2e']),
    )
    expect(out.lines.at(-1)).toMatchObject({
      stream: 'stderr',
      stamped: true,
      text: 'connecting with [REDACTED]',
    })
    expect(JSON.stringify(out)).not.toContain('swordfish')
  })

  // A secret that straddles the 4 KiB cut would show its first characters if the line were cut
  // first: an exact-match redactor never matches a prefix.
  it('cuts a line AFTER redacting it, so a secret across the cut is never half shown', async () => {
    const text = `${'a'.repeat(4090)}swordfish-7c2e${'b'.repeat(100)}`
    const out = await readRecentOutput(
      scripted([line(text)]),
      'h',
      OUTPUT_DEFAULTS,
      makeRedactor(['swordfish-7c2e']),
    )
    // Redacted: 4090 + 10 + 100 = 4200 bytes, of which 4096 are kept.
    expect(out.lines[0]!.text).toBe(`${'a'.repeat(4090)}[REDAC…[cut: 104 bytes]`)
    expect(out.lines[0]!.text).not.toContain('swordf')
  })

  it('says how much of a long line it cut, counting what the runtime cut too', async () => {
    const driver = createFakeDriver()
    const id = await startedInstance(driver)
    driver.seedLogs(id, [{ text: 'q'.repeat(10_000) }])
    const out = await readRecentOutput(driver, id, OUTPUT_DEFAULTS, keep)
    expect(out.lines.at(-1)!.text).toBe(`${'q'.repeat(4096)}…[cut: 5904 bytes]`)
  })
})
