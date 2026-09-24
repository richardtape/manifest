import { describe, expect, it, vi } from 'vitest'
import { AI_CODES, AiError, type LiteLlmClient } from '../ai/index.js'
import { SECURITY_NOTES, securityNotesFor, type SpecChange } from '../spec/index.js'
import { summariseChanges, SUMMARY_MODEL } from './summary.js'

const CHANGE: SpecChange = {
  path: 'egress.allow',
  from: 'none',
  to: 'api.library.ubc.ca',
  summary: 'now allows api.library.ubc.ca',
}

/**
 * R4(d)'s CONTEXT (P6b Task 8): the security notes for the fields that changed, the reviewer's
 * verdict at decision time, and D33's coverage limit — what the model is given beside the
 * changes. LITERALS, because this file is about what `summariseChanges` does with what it is
 * handed; where the real notes and the real limit come from is `approval.test.ts`'s subject.
 */
const CONTEXT = {
  security: [{ field: 'egress.allow' as const, note: 'THE EGRESS NOTE.' }],
  review: {
    state: 'not_performed' as const,
    reviewer: 'none',
    detail: 'No code reviewer is configured.',
  },
  coverage: 'THE COVERAGE SENTENCE.',
}

/** A client that answers, and RECORDS what it was asked — the request is half the claim. */
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

describe('§13’s change summary — absent rather than blocking (P6a Task 11, Decision 7)', () => {
  it('summarises a list of changes through the model', async () => {
    // THE POSITIVE CONTROL, FIRST. Every test below is an absence, and a function that
    // returned `null` unconditionally would pass all of them.
    const { client, asked } = answering(
      '  This release lets the app reach the library API, which it could not before.  ',
    )
    const result = await summariseChanges(client, [CHANGE], CONTEXT)
    expect(result).toEqual({
      summary:
        'This release lets the app reach the library API, which it could not before.',
      summarySource: 'llm',
    })

    /**
     * **WHAT WAS ASKED, NOT ONLY THAT SOMETHING WAS.** §10's catalogue name and not a
     * vendor model id — `ai/errors.ts` tells an app the same thing, and the platform holds
     * itself to it — and the change's own words in the prompt, so a summary cannot be about
     * a diff the administrator was not shown.
     */
    const body = asked[0] as {
      model: string
      messages: { role: string; content: string }[]
      max_tokens: number
    }
    expect(body.model).toBe(SUMMARY_MODEL)
    expect(body.model).toBe('default-chat-onprem')
    expect(body.messages.at(-1)?.content).toContain('egress.allow')
    expect(body.messages.at(-1)?.content).toContain('api.library.ubc.ca')
    expect(body.messages[0]?.content).toContain('Do not invent')
    expect(body.max_tokens).toBe(200)
  })

  it('records the summary as ABSENT when the model errors, and does not throw', async () => {
    /**
     * **DECISION 7, DRIVEN RATHER THAN REASONED ABOUT.** An approval gate that fails closed
     * on a language model being down is an outage, not a control — and §13's control is the
     * administrator reading the diff, which is stored beside this.
     */
    const operator = vi.spyOn(console, 'error').mockImplementation(() => undefined)
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
    await expect(summariseChanges(client, [CHANGE], CONTEXT)).resolves.toEqual({
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
    operator.mockRestore()
  })

  it('records it as absent when the model answers an empty string', async () => {
    // A blank line in the record would read as "nothing changed" beside a list of changes.
    const { client } = answering('   ')
    await expect(summariseChanges(client, [CHANGE], CONTEXT)).resolves.toEqual({
      summary: null,
      summarySource: 'unavailable',
    })
  })

  it('records it as absent when AI is disabled entirely', async () => {
    // `MANIFEST_AI_ENABLED=0` builds no client at all, so this is a real configuration and
    // not a defensive branch.
    await expect(summariseChanges(undefined, [CHANGE], CONTEXT)).resolves.toEqual({
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
})

/**
 * R4(d) (P6b Task 8, Decision 13): the summary gains a SECURITY dimension and surfaces the
 * reviewer's verdict. The security reading is deterministic first — `SECURITY_NOTES`, which
 * exists when the model is down — and the model is then told the notes, the verdict and D33's
 * coverage limit, and to state the verdict as given. No test can assert what a model noticed;
 * these assert what it was TOLD.
 */
describe('R4(d) — the summary is asked with the notes, the verdict and the coverage limit', () => {
  it('asks the model with the security notes, the reviewer’s verdict and the coverage limit in the request', async () => {
    const { client, asked } = answering('The app may now reach x.example.org.')
    await summariseChanges(client, [CHANGE], CONTEXT)
    const body = asked[0] as { messages: { role: string; content: string }[] }
    const user = body.messages.at(-1)!.content
    expect(user).toContain('Security notes:')
    expect(user).toContain('THE EGRESS NOTE.')
    expect(user).toContain('Code review: No code reviewer is configured.')
    expect(user).toContain('THE COVERAGE SENTENCE.')
    const system = body.messages[0]!.content
    expect(system).toContain('State the code reviewer’s verdict exactly as given')
    expect(system).toContain(
      'Never say or imply that the application’s code was reviewed unless the verdict says it was',
    )
    // `[M12]`: the model wrote Markdown under "plain English", and the console renders the
    // stored summary as text. Said in the prompt; never stripped (the record is verbatim).
    expect(system).toContain('no Markdown, no asterisks, no bullet characters')
  })

  it('the positive control: a change with no sensitive field carries no security note', async () => {
    // A test that the notes ARE sent is true of a prompt that always sends every note; this
    // is the pair. `runtime.port` is not one of §7's seven.
    const { client, asked } = answering('The app listens on another port.')
    await summariseChanges(
      client,
      [{ path: 'runtime.port', from: '3000', to: '3001', summary: 'listens on 3001' }],
      { ...CONTEXT, security: [] },
    )
    const user = (asked[0] as { messages: { content: string }[] }).messages.at(
      -1,
    )!.content
    expect(user).toContain('runtime.port')
    expect(user).not.toContain('Security notes:')
  })

  it('securityNotesFor names a note for each field, in SENSITIVE_FIELDS order, and none for nothing', () => {
    expect(securityNotesFor([])).toEqual([])
    expect(securityNotesFor(['egress.allow', 'auth.attributes'])).toEqual([
      { field: 'auth.attributes', note: SECURITY_NOTES['auth.attributes'] },
      { field: 'egress.allow', note: SECURITY_NOTES['egress.allow'] },
    ])
  })
})
