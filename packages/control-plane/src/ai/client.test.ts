import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiConfigError, createLiteLlmClient } from './client.js'
import { AI_CODES } from './errors.js'

const client = () =>
  createLiteLlmClient({
    baseUrl: 'http://litellm.test',
    masterKey: 'sk-master',
    timeoutMs: 50,
  })

describe('the LiteLLM admin transport', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends the master key and parses the body', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init: RequestInit) =>
        new Response(JSON.stringify({ ok: 1 }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    await expect(client().post('/key/generate', { a: 1 })).resolves.toEqual({ ok: 1 })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('http://litellm.test/key/generate')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({ authorization: 'Bearer sk-master' })
    expect(init.body).toBe('{"a":1}')
  })

  it('puts a GET query in the URL, encoded', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init: RequestInit) => new Response('{}', { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    await client().get('/user/info', { user_id: 'mf-a b' })
    expect(fetchMock.mock.calls[0]![0]).toBe(
      'http://litellm.test/user/info?user_id=mf-a+b',
    )
    expect(fetchMock.mock.calls[0]![1].method).toBe('GET')
  })

  it('turns a non-2xx into an AiError and never into the raw body', async () => {
    // The whole reason this module exists rather than a bare fetch at each site.
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(
          JSON.stringify({
            error: {
              message: 'Key Hash (Token) =1badf2fe',
              type: 'token_not_found_in_db',
            },
          }),
          { status: 401 },
        ),
    )
    const error = await client()
      .get('/key/info')
      .catch((e: unknown) => e)
    expect((error as { code: string }).code).toBe(AI_CODES.KEY_REVOKED)
    expect(JSON.stringify(error)).not.toContain('1badf2fe')
    expect((error as Error).message).not.toContain('1badf2fe')
  })

  it('maps an error body that is not JSON at all, rather than throwing a parse error', async () => {
    // A 502 from something in front of LiteLLM returns HTML. A JSON.parse throw here
    // would surface as a SyntaxError with the page in its message — a different way
    // for a third-party body to escape.
    vi.stubGlobal(
      'fetch',
      async () => new Response('<html>502 Bad Gateway</html>', { status: 502 }),
    )
    const error = await client()
      .get('/model/info')
      .catch((e: unknown) => e)
    expect((error as { code: string }).code).toBe(AI_CODES.BACKEND_UNAVAILABLE)
    expect(JSON.stringify(error)).not.toContain('html')
    expect((error as Error).message).not.toContain('html')
  })

  it('refuses a SUCCESS body that is not JSON, without quoting it', async () => {
    // Node's JSON.parse puts the start of the offending text in its message
    // (`Unexpected token '<', "<html>…" is not valid JSON`), so a 200 carrying a
    // page is the same leak on the success path.
    vi.stubGlobal(
      'fetch',
      async () => new Response('<html>CANARY-PAGE</html>', { status: 200 }),
    )
    const error = await client()
      .get('/model/info')
      .catch((e: unknown) => e)
    expect((error as { code: string }).code).toBe(AI_CODES.UNMAPPED)
    expect((error as Error).message).not.toContain('CANARY')
    expect(JSON.stringify(error)).not.toContain('CANARY')
  })

  it('times out rather than hanging a deploy', async () => {
    // deployRelease calls this. Without a timeout, an unresponsive gateway makes a
    // deploy hang until the readiness timeout rather than fail with a reason.
    vi.stubGlobal(
      'fetch',
      (_u: string, init: RequestInit) =>
        new Promise((_r, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          )
        }),
    )
    const error = await client()
      .get('/model/info')
      .catch((e: unknown) => e)
    expect((error as { code: string }).code).toBe(AI_CODES.BACKEND_UNAVAILABLE)
  })

  it('maps a gateway that is not listening at all', async () => {
    // What `make down` looks like from here: undici rejects with `TypeError: fetch
    // failed` and the address in its cause.
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fetch failed', {
        cause: new Error('connect ECONNREFUSED 127.0.0.1:7106'),
      })
    })
    const error = await client()
      .get('/model/info')
      .catch((e: unknown) => e)
    expect((error as { code: string }).code).toBe(AI_CODES.BACKEND_UNAVAILABLE)
  })

  it('refuses to be built without a master key, in EVERY environment', () => {
    // Unlike MANIFEST_MASTER_SECRET, a generated value is not a degraded mode here —
    // it is a value LiteLLM will reject on every call, so the failure would arrive as
    // an authentication error at deploy time rather than as a configuration error at
    // boot. Fail where the mistake was made.
    expect(() =>
      createLiteLlmClient({ baseUrl: 'http://litellm.test', masterKey: '' }),
    ).toThrow(AiConfigError)
    try {
      createLiteLlmClient({ baseUrl: 'http://litellm.test', masterKey: '' })
    } catch (error) {
      expect((error as AiConfigError).code).toBe('AI_MASTER_KEY_MISSING')
    }
  })
})
