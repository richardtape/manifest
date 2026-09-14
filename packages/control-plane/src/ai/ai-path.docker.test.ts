import { readFile } from 'node:fs/promises'
import { LLMModule } from 'ubc-genai-toolkit-llm'
import { expect, it } from 'vitest'
import { describeDocker } from '../runtime/testing.js'
import { parse } from 'yaml'
import { loadModelCatalogue } from './catalogue.js'
import { createLiteLlmClient } from './client.js'
import { AI_CODES, mapLiteLlmError } from './errors.js'
import {
  LITELLM_CONFIG,
  deleteProbeKey,
  ensureProbeUser,
  litellmMasterKey,
  litellmUrl,
  mintProbeKey,
} from './testing.js'

/** The user probe 14 in `s6.docker.test.ts` mints under. Created with no key of its own. */
const PROBE_USER = 'p4b-probe-user'

/**
 * One request, answered RAW. Defined here rather than reused from `ai/client.ts`,
 * deliberately: the client MAPS errors, and these tests need the status and body
 * the mapping is computed from.
 */
const call = (key: string, method: 'GET' | 'POST', route: string, body?: unknown) =>
  fetch(`${litellmUrl()}${route}`, {
    method,
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

/** What drifted, readable in a failure — the status and LiteLLM's `type`, never the body. */
async function mapped(res: Response): Promise<{ code: string; seen: string }> {
  const body = (await res.json()) as { error?: { type?: unknown } }
  return {
    code: mapLiteLlmError(res.status, body).code,
    seen: `${res.status} type=${String(body.error?.type ?? '(no error object)')}`,
  }
}

/**
 * §16's AI-path regression tier. Every assertion here is a finding that PASSED
 * SILENTLY before somebody looked at the number: S3 ran six toolkit checks, all six
 * green, and one of them returned 192 values where 768 belonged.
 *
 * It runs from the HOST, because the toolkit's behaviour is a property of the SDK and
 * not of the network. The network half — can an app container reach LiteLLM, and does
 * the confinement hold from there — is probes 13 and 14 in `s6.docker.test.ts`.
 */
describeDocker('AI-path regression (§16, S3 Evidence 8 and 9)', () => {
  /**
   * The toolkit, configured the way §8's contract configures it in an app —
   * `provider: 'openai'` (there is no `openai-compat`), the LiteLLM endpoint, and
   * LOGICAL model names.
   */
  const makeToolkit = () =>
    new LLMModule({
      provider: 'openai',
      apiKey: litellmMasterKey(),
      endpoint: `${litellmUrl()}/v1`,
      defaultModel: 'default-chat',
      embeddingModel: 'default-embed',
    })

  it('runs against an EXACT toolkit version, recorded here', async () => {
    // C6 and the roadmap: "a caret range would let the contract drift underneath the
    // test that exists to catch drift". The blueprint has no AI half yet, so only the
    // control plane's own devDependency can be checked; Task 10 adds the other side,
    // asserting that the blueprint's pinned dependency names the same version.
    const installed = JSON.parse(
      await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { devDependencies: Record<string, string> }
    expect(installed.devDependencies['ubc-genai-toolkit-llm']).toBe('0.7.0')
  })

  it('embeds at 768 dimensions WITH encoding_format float, and 192 without', async () => {
    // `embed` returns an EmbeddingResponse — `{ embeddings: number[][], model, … }` —
    // NOT a bare array. Read off ubc-genai-toolkit-llm 0.7.0's own types.d.ts.
    const llm = makeToolkit()
    const good = await llm.embed(['manifest'], { encoding_format: 'float' })
    expect(good.embeddings[0]).toHaveLength(768)
    expect(good.embeddings[0]!.slice(0, 3).every((v) => v === 0)).toBe(false)

    // THE DEFECT, asserted as a defect. The OpenAI SDK >= 4.75 defaults
    // encoding_format to base64 and decodes with toFloat32Array; LiteLLM's Ollama path
    // returns a plain float list; 768 floats coerced to bytes read back as 192
    // near-zero float32s, with no error anywhere. Asserting the WRONG value is what
    // makes the right one meaningful — if this line ever fails, LiteLLM or the SDK
    // changed and the blueprint's obligation may have moved.
    const bad = await llm.embed(['manifest'])
    expect(bad.embeddings[0]).toHaveLength(192)
    expect(bad.embeddings[0]!.slice(0, 3)).toEqual([0, 0, 0])
  })

  it('streams NON-EMPTY content, which a thinking model does not', async () => {
    // S3 Evidence 9: qwen3.5:4b emitted 1677 SSE frames and ZERO content frames at
    // max_tokens 2000. The toolkit reads delta.content only, so the app sees an empty
    // string and no error. `default-chat` is pinned to ministral-3 in
    // infra/litellm/config.yaml for exactly this reason.
    const chunks: string[] = []
    const response = await makeToolkit().streamConversation(
      [{ role: 'user', content: 'Count 1 to 5, digits only.' }],
      (chunk: string) => chunks.push(chunk),
    )
    expect(
      chunks.length,
      'zero content frames — is default-chat a thinking model?',
    ).toBeGreaterThan(0)
    expect(response.content.trim()).not.toBe('')
  })

  it('every mapped condition an APP key can provoke is still the shape 1.98.0 produces', async () => {
    // What makes Task 4's recorded bodies evidence rather than folklore, and what
    // re-measures them when the digest pin moves. The two budget rows are NOT
    // provoked: reaching a budget needs S3's synthetic-cost setup and a stream of
    // requests, so they are asserted against S3's recorded bodies in errors.test.ts.
    await ensureProbeUser(PROBE_USER)
    const confined = await mintProbeKey({ userId: PROBE_USER, confined: true })
    const unknownModel = {
      model: 'no-such-model',
      messages: [{ role: 'user', content: 'x' }],
    }
    let deleted = false
    try {
      const cases: [string, () => Promise<Response>][] = [
        [AI_CODES.ROUTE_NOT_PERMITTED, () => call(confined, 'POST', '/key/generate', {})],
        // A key that carries a `models` list — and every app key does (Task 7) — is
        // refused a model OFF that list before LiteLLM asks whether the model exists.
        // Measured 2026-09-14: `no-such-model` on this key is 403
        // `key_model_access_denied`, not S3's 400. So an app never sees MODEL_UNKNOWN.
        [
          AI_CODES.MODEL_NOT_PERMITTED,
          () => call(confined, 'POST', '/v1/chat/completions', unknownModel),
        ],
        // ...which is reachable only from a key with NO model list. The master key is
        // the one such key this tier holds; nothing is created by the refusal.
        [
          AI_CODES.MODEL_UNKNOWN,
          () => call(litellmMasterKey(), 'POST', '/v1/chat/completions', unknownModel),
        ],
        [
          AI_CODES.KEY_REVOKED,
          async () => {
            await deleteProbeKey(confined)
            deleted = true
            return call(confined, 'GET', '/v1/models')
          },
        ],
      ]
      for (const [expected, run] of cases) {
        const { code, seen } = await mapped(await run())
        expect(code, `${expected} drifted: LiteLLM answered ${seen}`).toBe(expected)
      }
    } finally {
      // Not a swallowed catch: if the revoke case never ran, the key is live and
      // this delete must succeed or say why.
      if (!deleted) await deleteProbeKey(confined)
    }
  })

  it('the ADMIN envelopes the mapper must NOT mistake for an app fault are unchanged', async () => {
    // Task 5's client maps the admin API's failures through the same function, and
    // FastAPI's own errors share a route denial's `{"detail": …}` envelope. These
    // three were measured on 2026-09-14 and are what the 403 and `"None"` guards in
    // mapLiteLlmError rest on. None of them creates anything: the route does not
    // exist, the body is refused before a user is made, and the user already exists
    // (with `auto_create_key: false`, so a regression cannot mint a key either).
    const master = litellmMasterKey()
    const notFound = await call(master, 'GET', '/no/such/admin/route')
    const invalid = await call(master, 'POST', '/user/new', {
      max_budget: 'not-a-number',
    })
    await ensureProbeUser(PROBE_USER)
    const exists = await call(master, 'POST', '/user/new', {
      user_id: PROBE_USER,
      auto_create_key: false,
    })
    for (const [res, status] of [
      [notFound, 404],
      [invalid, 422],
      [exists, 409],
    ] as const) {
      const { code, seen } = await mapped(res)
      expect(res.status, seen).toBe(status)
      expect(code, `an admin ${status} mapped to an app fault: ${seen}`).toBe(
        AI_CODES.UNMAPPED,
      )
    }
  })
})

describeDocker('D17 model catalogue (P4b Task 6)', () => {
  it('the running catalogue matches infra/litellm/config.yaml', async () => {
    // Reads BOTH SIDES rather than a hand-written expectation: the file P1 ships, and
    // the answer the running proxy gives through the one projection. It is also what
    // keeps `declaredCatalogue()` — the unit tier's stand-in, read from the same
    // file — honest about the proxy it stands in for.
    const declared = parse(await readFile(LITELLM_CONFIG, 'utf8')) as {
      model_list: {
        model_name: string
        model_info?: { max_classification?: string; mode?: string }
      }[]
    }
    const live = await loadModelCatalogue(
      createLiteLlmClient({ baseUrl: litellmUrl(), masterKey: litellmMasterKey() }),
    )
    expect(live.map((m) => m.name).sort()).toEqual(
      declared.model_list.map((m) => m.model_name).sort(),
    )
    for (const entry of live) {
      const from = declared.model_list.find((m) => m.model_name === entry.name)!
      expect(entry.maxClassification, entry.name).toBe(
        from.model_info?.max_classification,
      )
      // The file names `mode` on the embedding entry only; the proxy answers `null`
      // for the others (M2). Both mean chat.
      expect(entry.kind, entry.name).toBe(
        from.model_info?.mode === 'embedding' ? 'embedding' : 'chat',
      )
    }
  })
})
