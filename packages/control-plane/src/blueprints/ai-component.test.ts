import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const run = promisify(execFile)

/**
 * `node-ts-mongo@1`'s AI component, RUN — against the real toolkit and a fake
 * OpenAI-compatible gateway, asserting what arrives ON THE WIRE.
 *
 * §20 calls the blueprint a security multiplier, and S3's two AI findings are both
 * silent: an `embed()` without `encoding_format: 'float'` returns 192 near-zero
 * values where 768 belong, and a bare-PUID `user` turns one app's exhausted budget
 * into a cross-app lockout. Neither raises an error. So the assertions here are on
 * the request BODY the gateway receives and on the SHAPE of what comes back — "it
 * returned a vector" and "it returned the right vector" are different claims.
 *
 * WHY A CHILD PROCESS, and not an import into Vitest. The skeleton is app-side
 * ESM that runs on Node inside a container, and `ubc-genai-toolkit-llm` is CommonJS.
 * Measured 2026-09-14: Vitest resolved the toolkit for a file outside this package,
 * loaded its CommonJS under the wrong path (`Cannot find module './types'`) and
 * applied no `vi.mock` at all. A plain `node` process loads it exactly as the
 * container does, through the same ESM-to-CommonJS interop.
 *
 * THE TOOLKIT IS THE CONTROL PLANE'S OWN devDependency, which `blueprints.test.ts`
 * holds equal to the blueprint's pin — so this exercises the version every
 * application installs, not a nearby one.
 */
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const AI_DIR = join(REPO_ROOT, 'blueprints/node-ts-mongo/skeleton/ai')
const TOOLKIT = fileURLToPath(
  new URL('../../node_modules/ubc-genai-toolkit-llm', import.meta.url),
)

const PUID = 'stu000001'
const SLUG = 'proof-app'
const ENV = 'staging'
const KEY = 'sk-minted-for-this-deploy'
const DIMENSIONS = 768

/** §10's end-user identifier, CONSTRUCTED here rather than asked of the module. */
const EXPECTED_USER = createHash('sha256').update(`${PUID} ${SLUG} ${ENV}`).digest('hex')

interface Recorded {
  path: string
  authorization: string | undefined
  body: Record<string, unknown>
}

interface RunResult {
  enabled?: boolean
  answer?: string
  chunks?: string[]
  content?: string
  count?: number
  dims?: number
  first?: number[]
  error?: string
}

/**
 * What the app's process runs. It imports the component the way `server.js` does and
 * writes one JSON result to a file — never stdout, which belongs to the libraries.
 */
const RUNNER = `
import { writeFileSync } from 'node:fs'
const [op, out] = process.argv.slice(2)
const result = {}
try {
  if (op === 'embed-without-format') {
    // S3 Evidence 8, reproduced: the toolkit called DIRECTLY, with no option.
    const { default: toolkit } = await import('ubc-genai-toolkit-llm')
    const llm = new toolkit.LLMModule({
      provider: 'openai',
      apiKey: process.env.LLM_API_KEY,
      endpoint: process.env.LLM_ENDPOINT,
      defaultModel: process.env.EMBEDDINGS_MODEL,
      embeddingModel: process.env.EMBEDDINGS_MODEL,
    })
    const response = await llm.embed(['hello'])
    result.count = response.embeddings.length
    result.dims = response.embeddings[0].length
  } else {
    const ai = await import('./ai/llm.js')
    result.enabled = ai.AI_ENABLED
    if (op === 'configure') ai.configureAi()
    if (op === 'ask') result.answer = await ai.ask('What is 2 + 2?', '${PUID}')
    if (op === 'stream') {
      const chunks = []
      const response = await ai.askStreaming('What is 2 + 2?', '${PUID}', (c) => chunks.push(c))
      result.chunks = chunks
      result.content = response.content
    }
    if (op === 'embed') {
      const vectors = await ai.embed(['hello'])
      result.count = vectors.length
      result.dims = vectors[0].length
      result.first = vectors[0].slice(0, 3)
    }
  }
} catch (error) {
  result.error = String(error && error.message ? error.message : error)
}
writeFileSync(out, JSON.stringify(result))
`

describe("node-ts-mongo@1's AI component, on the wire (§10, S3)", () => {
  let server: Server
  let endpoint: string
  let app: string
  const recorded: Recorded[] = []

  beforeAll(async () => {
    server = createServer((request, response) => {
      let raw = ''
      request.on('data', (chunk: Buffer) => (raw += chunk.toString('utf8')))
      request.on('end', () => {
        const body = (raw ? JSON.parse(raw) : {}) as Record<string, unknown>
        recorded.push({
          path: request.url ?? '',
          authorization: request.headers.authorization,
          body,
        })
        const model = String(body.model)
        if (request.url === '/v1/chat/completions' && body.stream === true) {
          response.writeHead(200, { 'content-type': 'text/event-stream' })
          const frame = (delta: object, finish: string | null) =>
            `data: ${JSON.stringify({
              id: 'c1',
              object: 'chat.completion.chunk',
              created: 0,
              model,
              choices: [{ index: 0, delta, finish_reason: finish }],
            })}\n\n`
          response.write(frame({ role: 'assistant', content: 'Fo' }, null))
          response.write(frame({ content: 'ur' }, null))
          response.write(frame({}, 'stop'))
          response.end('data: [DONE]\n\n')
          return
        }
        if (request.url === '/v1/chat/completions') {
          response.writeHead(200, { 'content-type': 'application/json' })
          response.end(
            JSON.stringify({
              id: 'c0',
              object: 'chat.completion',
              created: 0,
              model,
              choices: [
                {
                  index: 0,
                  message: { role: 'assistant', content: 'Four' },
                  finish_reason: 'stop',
                },
              ],
              usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            }),
          )
          return
        }
        if (request.url === '/v1/embeddings') {
          // LiteLLM's Ollama path, as S3 measured it: `encoding_format` is IGNORED and
          // a plain float list comes back whatever was asked for. That is what makes
          // the SDK's base64 default decode 768 floats as 768 bytes.
          const input = body.input as unknown[]
          response.writeHead(200, { 'content-type': 'application/json' })
          response.end(
            JSON.stringify({
              object: 'list',
              data: input.map((_, index) => ({
                object: 'embedding',
                index,
                embedding: Array.from({ length: DIMENSIONS }, (_v, i) => (i + 1) / 1000),
              })),
              model,
              usage: { prompt_tokens: 1, total_tokens: 1 },
            }),
          )
          return
        }
        response.writeHead(404).end()
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`

    // A throwaway app directory: the component copied out of the blueprint, a
    // package.json marking it ESM as the skeleton's does, and the toolkit linked in.
    // The link is the pnpm store's REAL path, so the toolkit's own dependencies
    // resolve beside it exactly as they would under an app's node_modules.
    app = await mkdtemp(join(tmpdir(), 'mf-ai-component-'))
    await cp(AI_DIR, join(app, 'ai'), { recursive: true })
    await writeFile(join(app, 'package.json'), '{ "type": "module" }\n')
    await writeFile(join(app, 'run.mjs'), RUNNER)
    await mkdir(join(app, 'node_modules'))
    await symlink(
      await realpath(TOOLKIT),
      join(app, 'node_modules', 'ubc-genai-toolkit-llm'),
      'dir',
    )
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await rm(app, { recursive: true, force: true })
  })

  beforeEach(() => {
    recorded.length = 0
  })

  /** §8's six AI rows, as `renderInjection` renders them for a chat + embed app. */
  const both = () => ({
    LLM_PROVIDER: 'openai',
    LLM_ENDPOINT: endpoint,
    LLM_API_KEY: KEY,
    LLM_DEFAULT_MODEL: 'default-chat',
    EMBEDDINGS_PROVIDER: 'openai',
    EMBEDDINGS_MODEL: 'default-embed',
    MANIFEST_PROJECT_SLUG: SLUG,
    MANIFEST_ENV: ENV,
  })

  const without = (env: Record<string, string>, ...names: string[]) =>
    Object.fromEntries(Object.entries(env).filter(([name]) => !names.includes(name)))

  async function runApp(op: string, env: Record<string, string>): Promise<RunResult> {
    const out = join(app, `result-${op}-${Date.now()}.json`)
    // A CLEAN environment: nothing from this process, no proxy variables, so the
    // only values the component can read are the ones the platform would inject.
    await run(process.execPath, [join(app, 'run.mjs'), op, out], {
      cwd: app,
      env,
      timeout: 30_000,
    })
    return JSON.parse(await readFile(out, 'utf8')) as RunResult
  }

  it('the fake gateway reproduces S3 Evidence 8: the toolkit alone, with no option, returns 192', async () => {
    // THE POSITIVE CONTROL for every 768 below. Without it, "768 arrived" could be a
    // fake that returns floats however it is asked, which would prove nothing about
    // the option.
    const result = await runApp('embed-without-format', both())
    expect(result.error).toBeUndefined()
    expect(result.dims).toBe(DIMENSIONS / 4)
    expect(recorded[0]?.body).toMatchObject({ encoding_format: 'base64' })
  }, 30_000)

  it('embed() asks for floats, and gets 768 of the right values back', async () => {
    const result = await runApp('embed', both())
    expect(result.error).toBeUndefined()
    expect(result.count).toBe(1)
    expect(result.dims).toBe(DIMENSIONS)
    expect(result.first).toEqual([0.001, 0.002, 0.003])
    expect(recorded).toHaveLength(1)
    expect(recorded[0]).toMatchObject({
      path: '/v1/embeddings',
      authorization: `Bearer ${KEY}`,
      body: { model: 'default-embed', encoding_format: 'float', input: ['hello'] },
    })
  }, 30_000)

  it('ask() sends the injected key and model, attributed to the NAMESPACED end user', async () => {
    const result = await runApp('ask', both())
    expect(result.error).toBeUndefined()
    expect(result.answer).toBe('Four')
    expect(recorded).toHaveLength(1)
    expect(recorded[0]).toMatchObject({
      path: '/v1/chat/completions',
      authorization: `Bearer ${KEY}`,
      body: { model: 'default-chat', user: EXPECTED_USER },
    })
    // S3 Evidence 6: a bare hash is the cross-app lockout.
    expect(recorded[0]?.body.user).not.toBe(
      createHash('sha256').update(PUID).digest('hex'),
    )
  }, 30_000)

  it('askStreaming() delivers every chunk, attributed the same way', async () => {
    const result = await runApp('stream', both())
    expect(result.error).toBeUndefined()
    expect(result.chunks).toEqual(['Fo', 'ur'])
    expect(result.content).toBe('Four')
    expect(recorded[0]?.body).toMatchObject({
      model: 'default-chat',
      stream: true,
      user: EXPECTED_USER,
    })
  }, 30_000)

  it('an embeddings-only app STARTS, embeds, and refuses a chat call by name', async () => {
    // §8's "if declared": `renderInjection` leaves LLM_DEFAULT_MODEL ABSENT for an
    // app with no chat model, and the toolkit's OpenAI provider refuses to construct
    // without a default model. Reading it as required would kill this app at boot.
    const env = without(both(), 'LLM_DEFAULT_MODEL')
    expect((await runApp('configure', env)).error).toBeUndefined()
    const embedded = await runApp('embed', env)
    expect(embedded.dims).toBe(DIMENSIONS)
    const asked = await runApp('ask', env)
    expect(asked.error).toMatch(/no chat model/)
    expect(asked.error).toMatch(/ai\.models/)
    expect(recorded.map((r) => r.path)).toEqual(['/v1/embeddings'])
  }, 60_000)

  it('a chat-only app starts, answers, and refuses embed() by name', async () => {
    const env = without(both(), 'EMBEDDINGS_PROVIDER', 'EMBEDDINGS_MODEL')
    expect((await runApp('configure', env)).error).toBeUndefined()
    expect((await runApp('ask', env)).answer).toBe('Four')
    const embedded = await runApp('embed', env)
    expect(embedded.error).toMatch(/no embedding model/)
    expect(recorded.map((r) => r.path)).toEqual(['/v1/chat/completions'])
  }, 60_000)

  it('an app the platform gave no AI rows imports the component and is not AI-enabled', async () => {
    // `server.js` imports this file for EVERY app, so importing it must not throw for
    // an app that declared no models — and a call must say what to declare.
    const env = { MANIFEST_PROJECT_SLUG: SLUG, MANIFEST_ENV: ENV }
    const configured = await runApp('configure', env)
    expect(configured.enabled).toBe(false)
    expect(configured.error).toMatch(/LLM_PROVIDER is required and was not injected/)
    expect(configured.error).toMatch(/ai\.models/)
    expect(recorded).toEqual([])
  }, 30_000)

  it('a PARTIAL AI block fails at configure, naming the variable — never a request with a hole in it', async () => {
    const noEndpoint = await runApp('configure', without(both(), 'LLM_ENDPOINT'))
    expect(noEndpoint.enabled).toBe(true)
    expect(noEndpoint.error).toMatch(/LLM_ENDPOINT/)
    const noProvider = await runApp('configure', without(both(), 'EMBEDDINGS_PROVIDER'))
    expect(noProvider.error).toMatch(/EMBEDDINGS_PROVIDER/)
    expect(recorded).toEqual([])
  }, 60_000)
})
