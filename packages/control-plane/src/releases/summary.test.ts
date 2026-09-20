import { describe, expect, it, vi } from 'vitest'
import { AI_CODES, AiError, type LiteLlmClient } from '../ai/index.js'
import type { SpecChange } from '../spec/index.js'
import { summariseChanges, SUMMARY_MODEL } from './summary.js'

const CHANGE: SpecChange = {
  path: 'egress.allow',
  from: 'none',
  to: 'api.library.ubc.ca',
  summary: 'now allows api.library.ubc.ca',
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
    const result = await summariseChanges(client, [CHANGE])
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
    await expect(summariseChanges(client, [CHANGE])).resolves.toEqual({
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
    await expect(summariseChanges(client, [CHANGE])).resolves.toEqual({
      summary: null,
      summarySource: 'unavailable',
    })
  })

  it('records it as absent when AI is disabled entirely', async () => {
    // `MANIFEST_AI_ENABLED=0` builds no client at all, so this is a real configuration and
    // not a defensive branch.
    await expect(summariseChanges(undefined, [CHANGE])).resolves.toEqual({
      summary: null,
      summarySource: 'unavailable',
    })
  })

  it('says so in words when nothing changed — and asks the model nothing', async () => {
    const { client, asked } = answering('unused')
    await expect(summariseChanges(client, [])).resolves.toEqual({
      summary: 'Nothing in manifest.yaml changed since the last approved release.',
      summarySource: 'llm',
    })
    // NOT A ROUND TRIP. An empty list has one right answer and a model could give a wrong
    // one; this is also why the source is `llm` rather than `unavailable` — it IS the
    // summary, and an administrator reading `unavailable` would go looking for a failure.
    expect(asked).toEqual([])
  })
})
