import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { describeDocker } from '../runtime/testing.js'
import { CAPABLE_MODEL_NAME } from './capable.js'
import { createLiteLlmClient, type LiteLlmClient } from './client.js'
import { AiError } from './errors.js'
import {
  litellmMasterKey,
  litellmUrl,
  startStubProvider,
  type StubProvider,
} from './testing.js'

/**
 * FE-34 — THE CAPABLE MODEL'S FALLBACK ANSWERS A PROVIDER THAT FAILED, NEVER A REQUEST IT REFUSED (the launch
 * path plan's Task 6, Branch G). §7, as Spec action 6 amended it: the on-premise model answers
 * `default-chat-large` *"whenever its provider cannot be reached or fails — a refused connection, a timeout, a
 * rate limit or a server error, the network off included — and never for a request the provider refused as
 * malformed, which is answered as the provider's refusal so its caller can correct it."*
 *
 * Driven against the RUNNING LiteLLM, whose guard (`infra/litellm/manifest_guard.py`) is what is under test —
 * without it, LiteLLM 1.98.0 falls back from EVERY provider error, `400` included (`[M5]`, F7). Each case is a
 * probe primary the stub answers, with a `general` fallback to a stub deployment that answers `ok` — set PER
 * MODEL through `/fallback`, exactly as `ai/capable.ts` sets the capable model's, never router-wide, so the
 * platform's own `default-chat-large` fallback is never touched (asserted in `afterAll`). No Ollama, no network,
 * no money: the stub is on the host, the refused connection is inside LiteLLM's own container.
 *
 * WHAT *MALFORMED* MEANS HERE (the controller's ruling 1 — the spec's words): the provider answered `400`, `413`
 * or `422`. A `401`, `403` or `404` is the PLATFORM's credential, permission or model name failing, and falls
 * back like `408`, `429`, every `5xx`, a timeout and a refused connection. The stub's bodies say
 * `invalid_request_error` for every 4xx but 429, which LiteLLM names `BadRequestError` whatever the status
 * (measured at Task 6) — so these cases also prove the guard follows the provider's STATUS, not the class name.
 *
 * EACH REQUEST IS JUDGED BY ITS OWN FAILURE (fix round 1). A client names its own trace and session ids — LiteLLM
 * takes them from `x-litellm-trace-id`, `x-litellm-session-id`, any `x-<vendor>-session-id` (an agent's
 * `x-claude-code-session-id`), W3C `traceparent` and `baggage` — so the cases below send requests that SHARE one,
 * at once and one after another, and one whose session id is not its trace id. The first guard kept statuses in a
 * store keyed by those ids, and the `baggage` and `no-log` cases were red against it every run: a 401 refused, and
 * a malformed request answered by the fallback. The concurrent pairs stayed green against it — they only fail when
 * the two requests interleave between one's failure and its fallback, which the stub cannot force.
 *
 * Every primary is called ONCE per run under a name of its own: a `401` or `404` puts its deployment in
 * LiteLLM's cooldown, and a second call is then answered `RouterRateLimitError` without reaching the provider
 * (measured at Task 6).
 */

/** Inside the 7100–7199 block, and not one of `infra/lib/common.sh`'s assigned ports — `[M5]`'s own. */
const STUB_PORT = 7199
const STUB = `http://host.docker.internal:${STUB_PORT}`
const RUN = randomUUID().slice(0, 8)
const probe = (c: string): string => `probe-fg-${c}-${RUN}`

/**
 * The model id every probe deployment names at its provider — distinctive, so a refusal can be searched for it:
 * §7 lets a caller see logical names only, and LiteLLM appends its own debug text to a refusal (`[M5]`).
 */
const UNDERLYING = `probe-underlying-${RUN}`

const FALLBACK = probe('fallback')
const FALLBACK_PATH = '/fallback/ok/v1/chat/completions'
const USER = probe('user')
const KEY_ALIAS = probe('key')

/**
 * The provider refused the request as malformed: answered as its refusal. `422` is malformed too, and has its
 * own two cases below (F8), because `drop_params` asks its provider twice where these are asked once.
 */
const REFUSED = [400, 413] as const
/** The provider failed, or could not be reached: answered by the fallback. */
const FAILED = [
  '401',
  '403',
  '404',
  '408',
  '429',
  '500',
  '502',
  '503',
  'timeout',
  'refused',
]

/** Each probe primary: where the stub answers it, and the stub path it arrives on (none for a refused connection). */
const PRIMARIES: Record<string, { apiBase: string; path?: string }> = {
  ok: { apiBase: `${STUB}/ok/v1`, path: '/ok/v1/chat/completions' },
  timeout: { apiBase: `${STUB}/slow/v1`, path: '/slow/v1/chat/completions' },
  // Nothing listens on port 9 inside LiteLLM's container — `capable.docker.test.ts`'s unreachable provider.
  refused: { apiBase: 'http://127.0.0.1:9/v1' },
  // F9's pair: sent AT ONCE, so each must be decided by its own failure and not the router's last one.
  'pair-400': { apiBase: `${STUB}/pair/s400/v1`, path: '/pair/s400/v1/chat/completions' },
  'pair-503': { apiBase: `${STUB}/pair/s503/v1`, path: '/pair/s503/v1/chat/completions' },
  // The whole-branch review's m3: the same refusal, asked for as a STREAM.
  'stream-400': {
    apiBase: `${STUB}/stream/s400/v1`,
    path: '/stream/s400/v1/chat/completions',
  },
  // F8's streamed half (the faculty-ready plan's Task 6): a provider's 422, asked for as a stream.
  'stream-422': {
    apiBase: `${STUB}/stream/s422/v1`,
    path: '/stream/s422/v1/chat/completions',
  },
}
// The fix round's: requests that share a client-supplied id, each pair on its own deployments (cooldown is per
// deployment, and the stub counts each path apart).
for (const [c, s] of [
  ['sess-400', 400],
  ['sess-503', 503],
  ['vendor-400', 400],
  ['vendor-503', 503],
  ['baggage-401', 401],
  ['baggage-400', 400],
  ['loga-503', 503],
  ['logb-400', 400],
  ['logc-400', 400],
  ['logd-503', 503],
] as const) {
  const tag = c.split('-')[0]
  PRIMARIES[c] = {
    apiBase: `${STUB}/${tag}/s${s}/v1`,
    path: `/${tag}/s${s}/v1/chat/completions`,
  }
}
for (const s of [400, 401, 403, 404, 408, 413, 422, 429, 500, 502, 503]) {
  PRIMARIES[String(s)] = {
    apiBase: `${STUB}/s${s}/v1`,
    path: `/s${s}/v1/chat/completions`,
  }
}

interface Answer {
  status: number
  fellBack: string | null
  group: string | null
  text: string
  body: {
    choices?: { message?: { content?: unknown } }[]
    error?: { type?: unknown; code?: unknown }
  } | null
  /** What drifted, readable in a failure: the status, the header and LiteLLM's `type` — never the message. */
  seen: string
}

/** What the router answers `default-chat-large` with; `[]` for none, which 1.98.0 answers `404` (measured). */
async function fallbackOf(client: LiteLlmClient, model: string): Promise<string[]> {
  try {
    const body = await client.get<{ fallback_models?: unknown }>(`/fallback/${model}`, {
      fallback_type: 'general',
    })
    return Array.isArray(body.fallback_models) ? (body.fallback_models as string[]) : []
  } catch (error) {
    if (error instanceof AiError && error.status === 404) return []
    throw error
  }
}

describeDocker(
  'the capable model’s fallback, by the provider’s error (FE-34, Task 6)',
  () => {
    const client = createLiteLlmClient({
      baseUrl: litellmUrl(),
      masterKey: litellmMasterKey(),
    })
    let stub: StubProvider | undefined
    let key = ''
    let capableBefore: string[] = []
    const made = {
      models: [] as string[],
      fallbacks: [] as string[],
      user: false,
      key: false,
    }

    async function register(name: string, apiBase: string): Promise<void> {
      await client.post('/model/new', {
        model_name: name,
        litellm_params: {
          model: `openai/${UNDERLYING}`,
          api_base: apiBase,
          api_key: 'probe-not-a-key',
          // One attempt, so a status is never retried into a different answer; 5 s for the timeout case.
          num_retries: 0,
          timeout: 5,
          input_cost_per_token: 1e-6,
          output_cost_per_token: 1e-6,
        },
        model_info: { id: name },
      })
      made.models.push(name)
    }

    async function chat(
      model: string,
      headers: Record<string, string> = {},
      extra: Record<string, unknown> = {},
    ): Promise<Answer> {
      const res = await fetch(`${litellmUrl()}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          ...headers,
          authorization: `Bearer ${key}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          ...extra,
          model,
          max_tokens: 5,
          messages: [{ role: 'user', content: 'Answer with the single word ok.' }],
        }),
      })
      const text = await res.text()
      let body: Answer['body'] = null
      try {
        body = JSON.parse(text) as Answer['body']
      } catch {
        body = null
      }
      const fellBack = res.headers.get('x-litellm-attempted-fallbacks')
      return {
        status: res.status,
        fellBack,
        group: res.headers.get('x-litellm-model-group'),
        text,
        body,
        seen: `${res.status} attempted-fallbacks=${fellBack} type=${String(body?.error?.type ?? '(none)')} null-body=${text === 'null'}`,
      }
    }

    beforeAll(async () => {
      stub = await startStubProvider(STUB_PORT)
      capableBefore = await fallbackOf(client, CAPABLE_MODEL_NAME)
      await register(FALLBACK, `${STUB}/fallback/ok/v1`)
      for (const [c, { apiBase }] of Object.entries(PRIMARIES)) {
        await register(probe(c), apiBase)
        await client.post('/fallback', {
          model: probe(c),
          fallback_models: [FALLBACK],
          fallback_type: 'general',
        })
        made.fallbacks.push(probe(c))
      }
      await client.post('/user/new', {
        user_id: USER,
        max_budget: 1,
        auto_create_key: false,
      })
      made.user = true
      // ONLY the primaries: the gateway falls back without consulting a key's list of models (measured at the
      // front-end enablement plan's sitting 9a), which is what makes the fallback the platform's to govern.
      const generated = await client.post<{ key: string }>('/key/generate', {
        user_id: USER,
        key_alias: KEY_ALIAS,
        models: Object.keys(PRIMARIES).map(probe),
        allowed_routes: ['/v1/chat/completions'],
        duration: '900s',
        max_budget: 0.5,
      })
      made.key = true
      key = generated.key
    })

    afterAll(async () => {
      // EVERY step attempted whatever the one before it did, and every failure reported — never swallowed.
      const failures: unknown[] = []
      const attempt = async (
        what: string,
        step: () => Promise<unknown>,
      ): Promise<void> => {
        try {
          await step()
        } catch (error) {
          console.error(`fallback-guard.docker.test: removing ${what} failed`)
          failures.push(error)
        }
      }
      for (const name of made.fallbacks) {
        await attempt(`the fallback of ${name}`, () =>
          client.delete(`/fallback/${name}`, { fallback_type: 'general' }),
        )
      }
      for (const id of made.models) {
        await attempt(`model ${id}`, () => client.post('/model/delete', { id }))
      }
      // Deleting the user deletes its keys (measured at sitting 9) — the key's own delete first, all the same.
      if (made.key) {
        await attempt('the probe key', () =>
          client.post('/key/delete', { key_aliases: [KEY_ALIAS] }),
        )
      }
      if (made.user) {
        await attempt('the probe user', () =>
          client.post('/user/delete', { user_ids: [USER] }),
        )
      }
      if (stub !== undefined) await attempt('the stub provider', () => stub!.close())
      if (failures.length > 0) {
        throw new AggregateError(
          failures,
          'fallback-guard: the probe objects were not all removed',
        )
      }
      // Nothing of this run is left, and the platform's own capable fallback is exactly as it was.
      const left = await client.get<{ data: { model_name: string }[] }>('/model/info')
      expect(left.data.map((d) => d.model_name).filter((n) => n.includes(RUN))).toEqual(
        [],
      )
      expect(await fallbackOf(client, CAPABLE_MODEL_NAME)).toEqual(capableBefore)
    })

    /**
     * The provider's refusal, as LiteLLM answers it: the status, its `type`, and the status as `code` (measured at
     * Task 6); no fallback header (measured absent — `0` would say the same). The message is NOT asserted — LiteLLM
     * appends its fallback debug text to it (`[M5]`) — except that it names no deployment's underlying model id or
     * provider address (the fix round's M5: §7's logical names only).
     */
    function expectTheProvidersRefusal(r: Answer, status: number): void {
      expect(r.status, r.seen).toBe(status)
      expect(r.body?.error?.type, r.seen).toBe('invalid_request_error')
      expect(r.body?.error?.code, r.seen).toBe(String(status))
      expect([null, '0'], r.seen).toContain(r.fellBack)
      expect(r.text).not.toContain(UNDERLYING)
      expect(r.text).not.toContain('host.docker.internal')
      // `:7199`, the port as an address carries it — a bare `7199` would match a run id that contains it.
      expect(r.text).not.toContain(`:${STUB_PORT}`)
    }

    /** The fallback's answer: `200`, one fallback attempted, the fallback's group, the stub's `ok`. */
    function expectTheFallbacksAnswer(r: Answer): void {
      expect(r.status, r.seen).toBe(200)
      expect(r.fellBack, r.seen).toBe('1')
      expect(r.group).toBe(FALLBACK)
      expect(r.body?.choices?.[0]?.message?.content).toBe('ok')
    }

    it('a healthy provider answers itself — 200, no fallback attempted (the positive control)', async () => {
      const before = stub!.hits(FALLBACK_PATH)
      const r = await chat(probe('ok'))
      expect(r.status, r.seen).toBe(200)
      expect(r.fellBack, r.seen).toBe('0')
      expect(r.group).toBe(probe('ok'))
      expect(r.body?.choices?.[0]?.message?.content).toBe('ok')
      expect(stub!.hits(PRIMARIES.ok!.path!)).toBe(1)
      expect(stub!.hits(FALLBACK_PATH)).toBe(before)
    })

    it.each(REFUSED)(
      '%i — the provider refused the request as malformed: answered as its refusal, never by the fallback',
      async (status) => {
        const before = stub!.hits(FALLBACK_PATH)
        const r = await chat(probe(String(status)))
        expectTheProvidersRefusal(r, status)
        expect(stub!.hits(`/s${status}/v1/chat/completions`)).toBe(1)
        expect(stub!.hits(FALLBACK_PATH), 'the fallback was called').toBe(before)
      },
    )

    /**
     * A STREAMED REQUEST (the whole-branch review's m3, sitting 4): agents and the console ask
     * `/v1/chat/completions` for a stream. The provider refuses before any stream begins, so the answer is the
     * same refusal, as JSON — and the fallback is never called.
     */
    it('a STREAMED request the provider refuses as malformed (400) is answered as its refusal, never by the fallback', async () => {
      const before = stub!.hits(FALLBACK_PATH)
      const r = await chat(probe('stream-400'), {}, { stream: true })
      expectTheProvidersRefusal(r, 400)
      expect(stub!.hits(PRIMARIES['stream-400']!.path!)).toBe(1)
      expect(stub!.hits(FALLBACK_PATH), 'the fallback was called').toBe(before)
    })

    /**
     * F8, FIXED (the faculty-ready plan's Task 6): A PROVIDER'S 422 IS ANSWERED 422. LiteLLM 1.98.0, with
     * `drop_params: true` (config.yaml keeps it), answers a 422 by dropping params and retrying once
     * (`llms/openai/openai.py`, `for _ in range(2)`); when the retry is refused too, the loop ends without
     * returning, and without the guard's post-call hooks the proxy answered the `None` it got as `200` with the
     * body `null` — and a STREAMED one as `500`, LiteLLM's own Python error (Task 1's `[M3]`). No exception is
     * raised, so the fallback is never asked: the provider is hit twice, the call and the drop-params retry, and
     * nothing else. The provider's own 422 is swallowed, so the message is the guard's fixed sentence.
     */
    it('a provider’s 422 answers 422 with the provider’s refusal type, and never falls back (F8, fixed)', async () => {
      const before = stub!.hits(FALLBACK_PATH)
      const r = await chat(probe('422'))
      expectTheProvidersRefusal(r, 422)
      expect(r.fellBack, r.seen).toBeNull()
      // The drop-params retry: the provider is asked twice, then nothing.
      expect(stub!.hits('/s422/v1/chat/completions')).toBe(2)
      expect(stub!.hits(FALLBACK_PATH), 'the fallback was called').toBe(before)
    })

    /**
     * A STREAMED 422 IS A REFUSAL THE CLIENT SEES (Review Focus 5): the same `422` and JSON body, before any
     * stream begins — never `200` with an empty stream that closes cleanly, and never LiteLLM's `500`.
     */
    it('a STREAMED 422 is a refusal the client sees — 422 before any stream, never by the fallback (Review Focus 5)', async () => {
      const before = stub!.hits(FALLBACK_PATH)
      const r = await chat(probe('stream-422'), {}, { stream: true })
      expectTheProvidersRefusal(r, 422)
      expect(r.text, r.seen).not.toContain('data:')
      expect(stub!.hits(PRIMARIES['stream-422']!.path!)).toBe(2)
      expect(stub!.hits(FALLBACK_PATH), 'the fallback was called').toBe(before)
    })

    it.each(FAILED)(
      '%s — the provider failed or could not be reached: answered 200 by the fallback, attempted-fallbacks 1',
      async (c) => {
        const before = stub!.hits(FALLBACK_PATH)
        const r = await chat(probe(c))
        expectTheFallbacksAnswer(r)
        expect(stub!.hits(FALLBACK_PATH)).toBe(before + 1)
        const { path } = PRIMARIES[c]!
        if (path !== undefined)
          expect(stub!.hits(path), 'the primary was not called').toBe(1)
      },
    )

    it('a 400 and a 503 sent AT ONCE are each decided by their own failure, not the router’s last one (F9)', async () => {
      const before = stub!.hits(FALLBACK_PATH)
      const [refused, failed] = await Promise.all([
        chat(probe('pair-400')),
        chat(probe('pair-503')),
      ])
      expectTheProvidersRefusal(refused, 400)
      expectTheFallbacksAnswer(failed)
      expect(stub!.hits(FALLBACK_PATH)).toBe(before + 1)
    })

    it.each([
      ['x-litellm-session-id', 'sess'],
      ['x-claude-code-session-id', 'vendor'],
    ])(
      'two requests SHARING %s, sent at once — a 400 and a 503 — are each decided by their own failure',
      async (header, tag) => {
        const shared = { [header]: randomUUID() }
        const before = stub!.hits(FALLBACK_PATH)
        const [refused, failed] = await Promise.all([
          chat(probe(`${tag}-400`), shared),
          chat(probe(`${tag}-503`), shared),
        ])
        expectTheProvidersRefusal(refused, 400)
        expectTheFallbacksAnswer(failed)
        expect(stub!.hits(FALLBACK_PATH)).toBe(before + 1)
      },
    )

    it('a request whose session id is not its trace id (W3C baggage) is judged by its own failure — a 401 falls back, a 400 is refused', async () => {
      // `baggage` sets the session id alone, and the router makes the trace id: the two differ.
      const failed = await chat(probe('baggage-401'), {
        baggage: `session.id=${randomUUID()}`,
      })
      expectTheFallbacksAnswer(failed)
      const refused = await chat(probe('baggage-400'), {
        baggage: `session.id=${randomUUID()}`,
      })
      expectTheProvidersRefusal(refused, 400)
    })

    /**
     * IN ONE SESSION, A REQUEST WITH NO FAILURE EVENT OF ITS OWN. A client's `no-log: true` skips every logging
     * callback's failure event (LiteLLM 1.98.0 `should_run_callback`), so a guard that recorded statuses by the
     * session's id judged such a request by the session's EARLIER request — deterministically, where the
     * concurrent pairs above only race. Both directions: a malformed request after a failed one, and a failed one
     * after a malformed one.
     */
    it('in one session, a request whose failure is not logged (no-log) is judged by its own failure, not the session’s last one', async () => {
      const first = { 'x-litellm-session-id': randomUUID() }
      expectTheFallbacksAnswer(await chat(probe('loga-503'), first))
      expectTheProvidersRefusal(
        await chat(probe('logb-400'), first, { 'no-log': true }),
        400,
      )
      const second = { 'x-litellm-session-id': randomUUID() }
      expectTheProvidersRefusal(await chat(probe('logc-400'), second), 400)
      expectTheFallbacksAnswer(await chat(probe('logd-503'), second, { 'no-log': true }))
    })
  },
)
