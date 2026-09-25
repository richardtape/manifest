import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest'
import { AI_CODES, AiError, type LiteLlmClient } from '../ai/index.js'
import { SECURITY_NOTES, securityNotesFor, type SpecChange } from '../spec/index.js'
import {
  checkExposure,
  exposureSchema,
  summariseChanges,
  SUMMARY_MODEL,
} from './summary.js'

/**
 * A leg-A-shaped diff (P6b's acceptance, and the D5 plan's `[M15]`): one egress host added and
 * `sn` removed — the two changes F9's invented verdicts were written about.
 */
const HOST = 'api-4f2a.example.org'
const CHANGES: SpecChange[] = [
  { path: 'egress.allow', from: 'none', to: HOST, summary: `now allows ${HOST}` },
  {
    path: 'auth.attributes',
    from: 'givenName, mail, sn, ubcEduCwlPuid',
    to: 'givenName, mail, ubcEduCwlPuid',
    summary: 'no longer requests the sn attribute',
  },
]
const PATHS = CHANGES.map((c) => c.path)

/**
 * What the SNAPSHOT records beside the changes. LITERALS, because this file is about what
 * `summariseChanges` does with what it is handed; where the real notes and the real limit come
 * from is `approval.test.ts`'s subject. The verdict and the coverage sentence are distinctive
 * so a test can say they were NOT sent.
 */
const CONTEXT = {
  security: [
    { field: 'auth.attributes' as const, note: 'THE ATTRIBUTES NOTE.' },
    { field: 'egress.allow' as const, note: 'THE EGRESS NOTE.' },
  ],
  review: {
    state: 'not_performed' as const,
    reviewer: 'none',
    detail: 'THE REVIEWER’S OWN SENTENCE.',
  },
  coverage: 'THE COVERAGE SENTENCE.',
}

/**
 * P6b sitting 7's F9, VERBATIM — read in the console on S1's preview, with no such text in the
 * input and no administrator having decided anything.
 */
const F9 = {
  inventedVerdict:
    "The administrator's verdict was: 'This release changes a sensitive field, so it requires manual approval before production.'",
}

const answer = (exposures: Record<string, string>) =>
  JSON.stringify({
    changes: Object.entries(exposures).map(([path, exposure]) => ({ path, exposure })),
  })
const GOOD: Record<string, string> = {
  'egress.allow': `The app can now send data to ${HOST}, a host it could not reach before.`,
  'auth.attributes':
    'The app no longer receives the surname (sn) of the people who sign in.',
}

/**
 * A client that answers, and RECORDS what it was asked — the request is half the claim. The
 * plan's `modelAnswering` and `captureRequests` are this one helper: a third copy would drift.
 */
function answering(content: string): { client: LiteLlmClient; asked: unknown[] } {
  const asked: unknown[] = []
  return {
    asked,
    client: {
      get: () => Promise.reject(new Error('the summary never reads')),
      post: <T>(_path: string, body: unknown) => {
        asked.push(body)
        return Promise.resolve({
          choices: [{ message: { content } }],
        } as T)
      },
    },
  }
}

interface AskedBody {
  model: string
  max_tokens: number
  messages: { role: string; content: string }[]
  response_format: {
    type: string
    json_schema: {
      name: string
      strict: boolean
      schema: {
        properties: {
          changes: {
            minItems: number
            maxItems: number
            items: { properties: { path: { enum: string[] } } }
          }
        }
      }
    }
  }
}

let operator: MockInstance<typeof console.error>
beforeEach(() => {
  operator = vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => operator.mockRestore())

describe('F9 — the summary is STRUCTURED OUTPUT with no place for a verdict (the D5 plan’s Task 13)', () => {
  it('keeps a structured answer that describes each change — the positive control', async () => {
    // FIRST, because every case after it is a withholding, and a function that withheld
    // everything would pass all of them.
    const { client } = answering(answer(GOOD))
    const s = await summariseChanges(client, CHANGES, CONTEXT)
    expect(s.summarySource).toBe('llm')
    expect(s.exposures).toEqual(PATHS.map((path) => ({ path, sentence: GOOD[path] })))
    expect(s.summary).toBe(PATHS.map((p) => GOOD[p]).join(' '))
    expect(s.summaryWithheldBecause).toBeUndefined()
    expect(operator).not.toHaveBeenCalled()
  })

  it('lays the sentences out in the DIFF’s order, whatever order the model answered in', async () => {
    const { client } = answering(
      answer({
        'auth.attributes': GOOD['auth.attributes']!,
        'egress.allow': GOOD['egress.allow']!,
      }),
    )
    const s = await summariseChanges(client, CHANGES, CONTEXT)
    expect(s.exposures!.map((e) => e.path)).toEqual(PATHS)
  })

  it.each([
    [
      'prose, not JSON (F9’s own invented verdict, verbatim)',
      F9.inventedVerdict,
      /did not match the schema/,
    ],
    [
      'JSON in a Markdown fence',
      '```json\n' + answer(GOOD) + '\n```',
      /did not match the schema/,
    ],
    [
      'a path that is not in the diff',
      answer({ ...GOOD, resources: 'More memory.' }),
      /did not match the schema/,
    ],
    [
      'a change left out',
      answer({ 'egress.allow': GOOD['egress.allow']! }),
      /did not match the schema/,
    ],
    [
      'the same change twice and another left out — which the array’s length alone lets through',
      JSON.stringify({
        changes: [
          { path: 'egress.allow', exposure: GOOD['egress.allow'] },
          {
            path: 'egress.allow',
            exposure: 'The app can reach one more host than before.',
          },
        ],
      }),
      /each change exactly once/,
    ],
    [
      'a verdict inside a sentence',
      answer({
        ...GOOD,
        'egress.allow': 'This release requires an administrator’s approval.',
      }),
      /decision/,
    ],
  ])('withholds %s, and says which rule it broke', async (_label, text, because) => {
    const { client } = answering(text)
    const s = await summariseChanges(client, CHANGES, CONTEXT)
    expect(s).toMatchObject({ summary: null, summarySource: 'withheld', exposures: null })
    expect(s.summaryWithheldBecause).toMatch(because)
    // ONE OPERATOR LINE, with the same reason — a withholding nobody hears about hides the
    // next one — and NEVER the model's text: an app's own words can be in what it read.
    expect(operator).toHaveBeenCalledTimes(1)
    expect(operator.mock.calls[0]?.[0]).toContain(
      '[approval] the change summary was withheld',
    )
    expect(operator.mock.calls[0]?.[0]).toContain(s.summaryWithheldBecause)
    expect(s.summaryWithheldBecause).not.toContain('administrator’s approval.')
    expect(s.summaryWithheldBecause).not.toContain('More memory')
  })

  it('does not withhold "previously blocked" or a backtick — the two false positives F7 measured', async () => {
    const { client } = answering(
      answer({
        ...GOOD,
        'egress.allow': `The app can now reach \`${HOST}\`, a host that was previously blocked.`,
      }),
    )
    const s = await summariseChanges(client, CHANGES, CONTEXT)
    expect(s.summarySource).toBe('llm')
    expect(s.exposures!.find((e) => e.path === 'egress.allow')!.sentence).toBe(
      `The app can now reach ${HOST}, a host that was previously blocked.`,
    )
  })

  it('asks for a JSON schema built from this diff, and gives the model facts only', async () => {
    const { client, asked } = answering(answer(GOOD))
    await summariseChanges(client, CHANGES, CONTEXT)
    const body = asked[0] as AskedBody
    // §10's catalogue name — a NON-reasoning one (Decision 22) — never a vendor model id.
    expect(body.model).toBe(SUMMARY_MODEL)
    expect(body.model).toBe('default-chat-onprem')
    expect(body.response_format.type).toBe('json_schema')
    expect(body.response_format.json_schema).toMatchObject({
      name: 'change_exposures',
      strict: true,
    })
    const items = body.response_format.json_schema.schema.properties.changes
    expect(items.items.properties.path.enum).toEqual(PATHS)
    expect([items.minItems, items.maxItems]).toEqual([PATHS.length, PATHS.length])
    // A truncated answer is invalid JSON, so the budget grows with the diff.
    expect(body.max_tokens).toBe(80 + 90 * PATHS.length)
    const user = JSON.parse(body.messages.at(-1)!.content) as Record<string, unknown>
    expect(Object.keys(user).sort()).toEqual(['changes', 'securityNotes'])
    expect(user['changes']).toEqual(CHANGES)
    expect(user['securityNotes']).toEqual([
      { path: 'auth.attributes', note: 'THE ATTRIBUTES NOTE.' },
      { path: 'egress.allow', note: 'THE EGRESS NOTE.' },
    ])
    expect(JSON.stringify(user)).not.toContain(CONTEXT.review.detail)
    expect(JSON.stringify(user)).not.toContain(CONTEXT.coverage)
    expect(body.messages[0]!.content).not.toMatch(/verdict/i)
  })

  it('the positive control for the notes: a change with no sensitive field sends none', async () => {
    // A test that the notes ARE sent is true of a request that always sends every note; this
    // is the pair. `runtime.port` is not one of §7's seven.
    const port = [
      { path: 'runtime.port', from: '3000', to: '3001', summary: 'listens on 3001' },
    ]
    const { client, asked } = answering(
      answer({ 'runtime.port': 'The app now listens on port 3001 instead of 3000.' }),
    )
    const s = await summariseChanges(client, port, { ...CONTEXT, security: [] })
    expect(s.summarySource).toBe('llm')
    const user = JSON.parse((asked[0] as AskedBody).messages.at(-1)!.content) as {
      securityNotes: unknown[]
    }
    expect(user.securityNotes).toEqual([])
  })

  it('checkExposure refuses the decision vocabulary and nothing else it was measured against', () => {
    for (const s of [
      'The verdict is that this is fine.',
      'This needs approval.',
      'An administrator approved it.',
      'It was rejected before.',
      'Someone decided to allow it.',
      'The decision is pending.',
      'We recommend caution.',
    ])
      expect(checkExposure(s), s).toMatch(/decision/)
    for (const s of [
      `The app can now reach ${HOST}, a host that was previously blocked.`,
      'The app no longer receives the surname (sn) of the people who sign in.',
    ])
      expect(checkExposure(s), s).toBeNull()
  })

  it('exposureSchema accepts exactly this diff’s paths, once each', () => {
    const schema = exposureSchema(CHANGES)
    expect(schema.safeParse(JSON.parse(answer(GOOD))).success).toBe(true)
    expect(schema.safeParse({ changes: [] }).success).toBe(false)
    expect(
      schema.safeParse({
        changes: [
          { path: 'resources', exposure: 'More memory for the app.' },
          { path: 'egress.allow', exposure: GOOD['egress.allow'] },
        ],
      }).success,
    ).toBe(false)
  })
})

describe('§13’s change summary — absent rather than blocking (P6a Task 11, Decision 7)', () => {
  it('records the summary as ABSENT when the model errors, and does not throw', async () => {
    /**
     * **DECISION 7, DRIVEN RATHER THAN REASONED ABOUT.** An approval gate that fails closed
     * on a language model being down is an outage, not a control — and §13's control is the
     * administrator reading the diff, which is stored beside this.
     */
    const client: LiteLlmClient = {
      get: () => Promise.reject(new Error('never')),
      post: () =>
        Promise.reject(
          new AiError(AI_CODES.BACKEND_UNAVAILABLE, 0, {
            status: 0,
            reason: 'unreachable',
          }),
        ),
    }
    await expect(summariseChanges(client, CHANGES, CONTEXT)).resolves.toEqual({
      summary: null,
      summarySource: 'unavailable',
    })
    // AND IT LEFT AN OPERATOR LINE. A swallowed failure is this codebase's most productive
    // defect, and a failure that leaves no line hides the next one.
    expect(operator).toHaveBeenCalledTimes(1)
    expect(operator.mock.calls[0]?.[0]).toContain('[approval]')
    // …AND NOTHING FROM THE GATEWAY'S OWN BODY. `AiError`'s message is the mapped,
    // faculty-legible half and carries no key hash (§14).
    expect(operator.mock.calls[0]?.[0]).toContain('The AI service is not answering')
  })

  it('records it as absent — not withheld — when the model answers an empty string', async () => {
    // A blank line in the record would read as "nothing changed" beside a list of changes,
    // and an answer with nothing in it broke no rule: the model produced nothing.
    const { client } = answering('   ')
    await expect(summariseChanges(client, CHANGES, CONTEXT)).resolves.toEqual({
      summary: null,
      summarySource: 'unavailable',
    })
  })

  it('records it as absent when AI is disabled entirely', async () => {
    // `MANIFEST_AI_ENABLED=0` builds no client at all, so this is a real configuration and
    // not a defensive branch.
    await expect(summariseChanges(undefined, CHANGES, CONTEXT)).resolves.toEqual({
      summary: null,
      summarySource: 'unavailable',
    })
  })

  it('records `no-changes` — not `llm` — for the fixed sentence no model wrote', async () => {
    const { client, asked } = answering('unused')
    await expect(summariseChanges(client, [], CONTEXT)).resolves.toEqual({
      summary: 'Nothing in manifest.yaml changed since the last approved release.',
      summarySource: 'no-changes',
    })
    // NOT A ROUND TRIP. An empty list has one right answer and a model could give a wrong
    // one. And NOT `llm` (P6b *Read this first* 12): P6a's acceptance printed this sentence
    // as "the model's summary", which no model wrote. Nor `unavailable`, which would send an
    // administrator looking for a failure.
    expect(asked).toEqual([])
    // THE SENTENCE NEEDS NO MODEL, so a platform with AI switched off says it too.
    await expect(summariseChanges(undefined, [], CONTEXT)).resolves.toEqual({
      summary: 'Nothing in manifest.yaml changed since the last approved release.',
      summarySource: 'no-changes',
    })
  })

  it('securityNotesFor names a note for each field, in SENSITIVE_FIELDS order, and none for nothing', () => {
    expect(securityNotesFor([])).toEqual([])
    expect(securityNotesFor(['egress.allow', 'auth.attributes'])).toEqual([
      { field: 'auth.attributes', note: SECURITY_NOTES['auth.attributes'] },
      { field: 'egress.allow', note: SECURITY_NOTES['egress.allow'] },
    ])
  })
})
