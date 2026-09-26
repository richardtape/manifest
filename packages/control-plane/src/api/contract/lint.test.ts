import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * AN INDEPENDENT LINTER OVER THE PUBLISHED DOCUMENT (the authoring API plan's Decision 14, Task
 * 9 Step 6): `@redocly/openapi-core` 1.34.20's `recommended` rules — a checker nobody on this
 * project wrote, run over `packages/contract/openapi.json` exactly as it is committed. `docs.test.ts`
 * holds the document to OUR idea of complete; this holds it to someone else's idea of well formed.
 *
 * **No problem of severity `error`, and every warning in `ACCEPTED` with its reason** — a rule is
 * accepted only with a sentence saying why, and an empty list is the goal. Task 1's `[M8]` measured
 * the rules that fired at `1.2.0` (53 warnings, 4 rules, 0 errors, 0 network attempts); the
 * document's tags have since gained descriptions, so `tag-description` is fixed rather than accepted.
 */

const DOCUMENT = fileURLToPath(
  new URL('../../../../contract/openapi.json', import.meta.url),
)

/**
 * THE LINTER IS RESOLVED THROUGH THE GENERATOR, NOT ADDED AS A DEPENDENCY. `openapi-typescript` —
 * which generates `@manifest/contract`'s client from this very document — depends on
 * `@redocly/openapi-core`, so this resolves it exactly as the generator does: from
 * `packages/contract`, through `openapi-typescript`. The plan's `pnpm add --offline` is refused
 * by pnpm 11's supply-chain check of the whole lockfile, which needs registry metadata this
 * machine does not have cached (the record, sitting 6). The version is asserted below, so a
 * generator upgrade that moves it is seen rather than absorbed.
 */
const fromContract = createRequire(
  new URL('../../../../contract/package.json', import.meta.url),
)
const fromGenerator = createRequire(fromContract.resolve('openapi-typescript'))
const LINTER_VERSION = (
  JSON.parse(
    readFileSync(fromGenerator.resolve('@redocly/openapi-core/package.json'), 'utf8'),
  ) as { version: string }
).version
const { createConfig, lintFromString } = fromGenerator('@redocly/openapi-core') as {
  createConfig(options: { extends: string[] }): Promise<unknown>
  lintFromString(options: {
    source: string
    absoluteRef: string
    config: unknown
  }): Promise<unknown[]>
}

interface Problem {
  ruleId: string
  severity: string
  message: string
  location: { pointer?: string }[]
}

/**
 * THE WARNINGS THE DOCUMENT IS ALLOWED, each with why. A rule named here with `at` is accepted
 * ONLY at those pointers; one without `at` is accepted wherever it fires, because its reason
 * applies to every operation.
 */
const ACCEPTED: Record<string, { why: string; at?: readonly string[] }> = {
  'operation-4xx-response': {
    why: 'Every refusal is ONE envelope (D23.7), documented once per operation as its `default` response, whose description and `x-manifest-error-codes` name every code the operation can answer — and `x-manifest-errors` gives each code its status. A `4XX` key per status would restate the same schema under up to seven keys per operation.',
  },
  'info-license': {
    why: 'Manifest has no stated licence yet; stating one is the project owner’s decision, not the documentation’s. Accepted until it is stated.',
  },
  'no-unused-components': {
    why: '`StreamFrame` is the WebSocket’s message, referenced from `x-manifest-websocket`, which the linter does not walk; `ManifestYaml` documents the file an agent writes and is deliberately referenced by no operation — `Spec.spec` is the parsed file, typed loosely, and a `$ref` would change a generated type.',
    at: ['#/components/schemas/StreamFrame', '#/components/schemas/ManifestYaml'],
  },
}

async function lint(source: string): Promise<Problem[]> {
  const config = await createConfig({ extends: ['recommended'] })
  return (await lintFromString({
    source,
    absoluteRef: DOCUMENT,
    config,
  })) as unknown as Problem[]
}

const where = (p: Problem) => p.location[0]?.pointer ?? '?'
const accepted = (p: Problem) => {
  const rule = ACCEPTED[p.ruleId]
  return (
    p.severity === 'warn' &&
    rule !== undefined &&
    (rule.at === undefined || rule.at.includes(where(p)))
  )
}

describe('an independent linter finds nothing it was not told the reason for (Decision 14)', () => {
  it('is @redocly/openapi-core 1.34.20, the version Task 1 measured', () => {
    expect(LINTER_VERSION).toBe('1.34.20')
  })

  it('reports no error, and no warning outside ACCEPTED', async () => {
    const problems = await lint(readFileSync(DOCUMENT, 'utf8'))
    expect(
      problems
        .filter((p) => !accepted(p))
        .map((p) => `${p.severity} ${p.ruleId} at ${where(p)}: ${p.message}`),
    ).toEqual([])
  })

  it('names no rule in ACCEPTED that no longer fires — a fixed rule leaves the list', async () => {
    const fired = new Set(
      (await lint(readFileSync(DOCUMENT, 'utf8'))).map((p) => p.ruleId),
    )
    expect(Object.keys(ACCEPTED).filter((rule) => !fired.has(rule))).toEqual([])
  })

  it('sees a problem it was not told about — its own positive control', async () => {
    const holed = JSON.parse(readFileSync(DOCUMENT, 'utf8')) as {
      tags: { name: string; description?: string }[]
    }
    delete holed.tags[0]!.description
    const problems = await lint(JSON.stringify(holed))
    expect(problems.filter((p) => !accepted(p)).map((p) => p.ruleId)).toContain(
      'tag-description',
    )
  })
})
