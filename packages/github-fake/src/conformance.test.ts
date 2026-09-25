import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  assertNoSecrets,
  runConformance,
  tokenClass,
  type Fact,
  type StepAnswer,
} from './conformance.js'
import { startFake } from './testing.js'

// THE FAKE AGAINST THE GOLDEN RECORD (the D5 plan, Task 6) — Decision 7's third mechanism.
// A disagreement goes to the FAKE, never to golden.json, unless a real run shows golden
// wrong. The real run is `make github-conformance`, at Rich's yes.

interface Expected {
  status: number
  facts?: Record<string, Fact>
}
interface GoldenStep extends Partial<Expected> {
  unknown?: boolean
  pendingTask?: number
  byPlan?: Record<'free' | 'team', Expected>
  why: string
}
interface Golden {
  source: string
  steps: Record<string, GoldenStep>
}

const golden = JSON.parse(
  readFileSync(new URL('../conformance/golden.json', import.meta.url), 'utf8'),
) as Golden
const UNKNOWN = Object.keys(golden.steps).filter((k) => golden.steps[k]!.unknown === true)
const PENDING = Object.entries(golden.steps)
  .filter(([, v]) => v.pendingTask !== undefined)
  .map(([k, v]) => `${k} (Task ${v.pendingTask})`)

const pick = (facts: Record<string, Fact>, keys: string[]) =>
  Object.fromEntries(keys.map((k) => [k, facts[k]]))

describe(`the fake against golden.json (source: ${golden.source})`, () => {
  const caveats = [
    UNKNOWN.length > 0
      ? `asserting NOTHING for ${UNKNOWN.join(', ')}, which golden marks unknown`
      : '',
    PENDING.length > 0 ? `skipping ${PENDING.join(', ')}` : '',
  ].filter((c) => c !== '')
  it.each([['team'], ['free']] as const)(
    `answers what the golden record says GitHub answers (plan: %s)${caveats.length > 0 ? ` — ${caveats.join('; ')}` : ''}`,
    async (plan) => {
      const fake = await startFake({ plan })
      try {
        const answers = await runConformance({ ...fake, label: `fake/${plan}` })
        // Every step golden names was answered, and nothing golden does not name.
        expect(answers.map((a) => a.step).sort()).toEqual(
          Object.keys(golden.steps).sort(),
        )
        for (const a of answers) {
          const want = golden.steps[a.step]
          if (want === undefined) throw new Error(`golden has no ${a.step}`)
          if (want.unknown === true || want.pendingTask !== undefined) continue
          const expected = want.byPlan?.[plan] ?? (want as Expected)
          expect({
            step: a.step,
            status: a.status,
            ...pick(a.facts, Object.keys(expected.facts ?? {})),
          }).toEqual({
            step: a.step,
            status: expected.status,
            ...(expected.facts ?? {}),
          })
        }
      } finally {
        await fake.stop()
      }
    },
  )

  it('leaves no repository behind on the target — C14 deletes both', async () => {
    const fake = await startFake()
    try {
      const answers = await runConformance({ ...fake, label: 'fake' })
      expect(answers.find((a) => a.step === 'C14')).toMatchObject({
        status: 204,
        facts: { statuses: '204,204' },
      })
      // The fake's own view: no repository directory is left under its organisation.
      const orgDir = join(fake.dataDir, fake.org)
      expect(existsSync(orgDir) ? readdirSync(orgDir) : []).toEqual([])
    } finally {
      await fake.stop()
    }
  })

  it('carries no credential in any answer — and the rule refuses one that does', async () => {
    const fake = await startFake()
    try {
      const answers = await runConformance({ ...fake, label: 'fake' })
      expect(JSON.stringify(answers)).not.toMatch(/ghs_|ghp_|-----BEGIN/)
      // The positive control: the SAME rule, handed a token, refuses it.
      const leaked: StepAnswer[] = [
        { step: 'CX', status: 201, facts: { token: 'ghs_1000001_eyJx.y.z' } },
      ]
      expect(() => assertNoSecrets(leaked)).toThrow(/carries a credential/)
    } finally {
      await fake.stop()
    }
  })

  it('classifies GitHub’s two token formats', () => {
    expect(tokenClass('ghs_1234567_eyJhbGciOiJIUzI1NiJ9.eyJ4IjoxfQ.c2ln')).toBe(
      'stateless',
    )
    expect(tokenClass(`ghs_${'a'.repeat(36)}`)).toBe('classic')
    expect(tokenClass('ghp_x')).toBe('other')
  })
})
