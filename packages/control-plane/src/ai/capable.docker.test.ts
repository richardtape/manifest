import { execFile, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { promisify } from 'node:util'
import pg from 'pg'
import { expect, it } from 'vitest'
import { parse } from 'yaml'
import { describeDocker, REPO_ROOT } from '../runtime/testing.js'
import { deleteSpRow } from '../sso/index.js'
import { idpDatabaseUrl } from '../sso/testing.js'
import {
  CAPABLE_MODEL_NAME,
  ensureCapableFallback,
  ensureCapableModel,
} from './capable.js'
import { loadModelCatalogue } from './catalogue.js'
import { createLiteLlmClient, type LiteLlmClient } from './client.js'
import { agentModelsFor } from './models.js'
import { LITELLM_CONFIG, litellmMasterKey, litellmUrl } from './testing.js'

/**
 * A model the BUNDLED price map prices (sitting 9a, Step 1 (b)), so this tier passes whether LiteLLM
 * last started with the network on or off. Rich's own choice, `openai/gpt-6-luna`, is priced only by
 * the map LiteLLM fetches at its start online — Step 5 is where that one is proved. Registering it
 * needs no provider key and no network: only a CALL to it does, and nothing here calls it.
 */
const PRICED = 'openai/gpt-5.6-luna'

/** LiteLLM's own table, read directly: a not-live row is invisible to `/model/info` (measured). */
async function rowsNamedCapable(): Promise<number> {
  const url = new URL(process.env.MANIFEST_ADMIN_DATABASE_URL!)
  url.pathname = '/litellm'
  const client = new pg.Client({ connectionString: url.toString() })
  await client.connect()
  try {
    const { rows } = await client.query<{ n: string }>(
      'select count(*) as n from "LiteLLM_ProxyModelTable" where model_name = $1',
      [CAPABLE_MODEL_NAME],
    )
    return Number(rows[0]!.n)
  } finally {
    await client.end()
  }
}

async function declaredNames(): Promise<string[]> {
  const declared = parse(await readFile(LITELLM_CONFIG, 'utf8')) as {
    model_list: { model_name: string }[]
  }
  return declared.model_list.map((m) => m.model_name).sort()
}

/** Its own SP scope, as `boot.docker.test.ts`'s — a boot writes the platform's row before it listens. */
const TEST_ENTITY_BASE = 'https://test-suite.manifest.internal'
const TEST_ENTITY_ID = `${TEST_ENTITY_BASE}/sp/manifest-control-plane/platform`
const run = promisify(execFile)

/** What LiteLLM holds as `default-chat-large`, with its pinned price, read through `/model/info`. */
async function listedCapable(
  client: LiteLlmClient,
): Promise<{ model: unknown; pinned: unknown; listed: unknown }[]> {
  const body = await client.get<{
    data: {
      model_name: string
      litellm_params: { model?: unknown; input_cost_per_token?: unknown }
      model_info: { input_cost_per_token?: unknown }
    }[]
  }>('/model/info')
  return body.data
    .filter((d) => d.model_name === CAPABLE_MODEL_NAME)
    .map((d) => ({
      model: d.litellm_params.model,
      pinned: d.litellm_params.input_cost_per_token,
      listed: d.model_info.input_cost_per_token,
    }))
}

/** Whatever this file left, removed — so a machine is never left holding a capable model it registered. */
async function leaveNone(client: LiteLlmClient): Promise<void> {
  await ensureCapableFallback(client, undefined)
  await ensureCapableModel(client, undefined)
}

/**
 * `default-chat-large` whose provider CANNOT BE REACHED — the network-off case, as sittings 9a and 9b
 * measured it: an address nothing listens on, and a key that is not a key, so nothing leaves LiteLLM's
 * container — no network, no money. Registered directly, pinned, as the boot would leave a real one.
 */
async function unreachableCapable(client: LiteLlmClient): Promise<void> {
  await client.post('/model/new', {
    model_name: CAPABLE_MODEL_NAME,
    litellm_params: {
      model: 'openai/gpt-6-luna',
      api_base: 'http://127.0.0.1:9/v1',
      api_key: 'sk-probe-not-a-key',
      input_cost_per_token: 1e-7,
      output_cost_per_token: 5e-7,
    },
    model_info: {
      id: `manifest-capable-probe-${randomUUID()}`,
      max_classification: 'internal',
    },
  })
}

/** One chat on `default-chat-large` with `key`, as an agent sends it. */
async function chat(key: string): Promise<Response> {
  return fetch(`${litellmUrl()}/v1/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: CAPABLE_MODEL_NAME,
      max_tokens: 8,
      messages: [{ role: 'user', content: 'Answer with the single word ok.' }],
    }),
  })
}

/** A key's spend once LiteLLM has written it — about ten seconds after the call (measured at sitting 9a). */
async function spendOf(client: LiteLlmClient, key: string): Promise<number> {
  for (let i = 0; i < 30; i += 1) {
    const body = await client.get<{ info?: { spend?: number } }>('/key/info', { key })
    const spend = body.info?.spend ?? 0
    if (spend > 0) return spend
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  return 0
}

describeDocker('the capable model against the running LiteLLM (Task 12a)', () => {
  const client = createLiteLlmClient({
    baseUrl: litellmUrl(),
    masterKey: litellmMasterKey(),
  })

  it('registers default-chat-large at internal, priced; an agent on internal gets it, confidential never; unset removes it', async () => {
    try {
      expect(await ensureCapableModel(client, PRICED)).toEqual({
        state: 'registered',
        model: PRICED,
      })
      const snapshot = await loadModelCatalogue(client)
      expect(snapshot.models).toContainEqual({
        name: CAPABLE_MODEL_NAME,
        maxClassification: 'internal',
        kind: 'chat',
      })
      expect(agentModelsFor(snapshot, 'internal')).toContain(CAPABLE_MODEL_NAME)
      expect(agentModelsFor(snapshot, 'confidential')).not.toContain(CAPABLE_MODEL_NAME)
      expect(agentModelsFor(snapshot, 'confidential')).toContain('default-chat-onprem')

      // The review's I1: the price LiteLLM gave it is PINNED on the deployment, so no restart of
      // LiteLLM can take it away.
      const [held] = await listedCapable(client)
      expect(held!.model).toBe(PRICED)
      expect(held!.pinned).toBe(2e-7)
      expect(held!.listed).toBe(2e-7)

      expect(await ensureCapableModel(client, PRICED)).toEqual({
        state: 'unchanged',
        model: PRICED,
      })

      expect(await ensureCapableModel(client, undefined)).toEqual({
        state: 'removed',
        model: PRICED,
      })
      const after = await loadModelCatalogue(client)
      expect(after.models.map((m) => m.name).sort()).toEqual(await declaredNames())
      expect(await rowsNamedCapable()).toBe(0)
    } finally {
      await leaveNone(client)
    }
  })

  it('refuses an openai model LiteLLM cannot price, and leaves no row behind', async () => {
    try {
      // `openai/gpt-6-terra`'s shape, measured: registered at cost 0.
      const result = await ensureCapableModel(client, 'openai/manifest-unpriced-probe')
      expect(result.state).toBe('refused')
      expect(result.reason).toContain('MANIFEST_CAPABLE_MODEL')
      expect(await rowsNamedCapable()).toBe(0)
    } finally {
      await leaveNone(client)
    }
  })

  it('refuses a provider LiteLLM cannot serve, deletes the row LiteLLM saved anyway, and KEEPS the working model', async () => {
    try {
      await ensureCapableModel(client, PRICED)
      // Measured: a 500 whose row STAYS in LiteLLM's table, absent from /model/info. The gateway
      // ANSWERED, so it is the setting's fault (the review's I2) — and the working model stays.
      const result = await ensureCapableModel(client, 'manifest-nowhere/probe')
      expect(result.state).toBe('refused')
      expect(result.reason).toContain("'manifest-nowhere/probe'")
      expect(result.reason).toContain(`'${PRICED}' is kept`)
      expect((await listedCapable(client)).map((d) => d.model)).toEqual([PRICED])
      expect(await rowsNamedCapable()).toBe(1)
    } finally {
      await leaveNone(client)
    }
    expect(await rowsNamedCapable()).toBe(0)
  })

  it('answers default-chat-large from the on-premise model when its provider cannot be reached — through a key holding ONLY default-chat-large, at the fallback’s price (Task 12b)', async () => {
    const user = `probe-capable-fallback-${Date.now()}`
    try {
      await unreachableCapable(client)
      expect(await ensureCapableFallback(client, 'default-chat-onprem')).toEqual({
        state: 'set',
        fallback: 'default-chat-onprem',
      })
      await client.post('/user/new', {
        user_id: user,
        max_budget: 1,
        auto_create_key: false,
      })
      const { key } = await client.post<{ key: string }>('/key/generate', {
        user_id: user,
        key_alias: `${user}-key`,
        // ONLY the capable model: the gateway falls back without consulting this list (measured) —
        // which is why the fallback's classification is the platform's to enforce.
        models: [CAPABLE_MODEL_NAME],
        allowed_routes: ['/v1/chat/completions'],
        duration: '600s',
        max_budget: 0.5,
      })

      const res = await chat(key)
      const body = (await res.json()) as {
        model?: string
        usage?: { prompt_tokens: number; completion_tokens: number }
      }
      expect(res.status, JSON.stringify(body).slice(0, 300)).toBe(200)
      // The answer names the FALLBACK's provider string, so an agent can tell who answered.
      expect(body.model).toBe('ollama_chat/qwen3.5:4b')
      expect(res.headers.get('x-litellm-attempted-fallbacks')).toBe('1')
      expect(res.headers.get('x-litellm-model-group')).toBe('default-chat-onprem')
      // Charged to the SAME key at the FALLBACK's price — config.yaml's $1 / $3 a million, never the
      // primary's pinned $0.10 / $0.50 — so every budget binds unchanged.
      const { prompt_tokens, completion_tokens } = body.usage!
      expect(await spendOf(client, key)).toBeCloseTo(
        prompt_tokens * 1e-6 + completion_tokens * 3e-6,
        12,
      )

      // A positive control: without the fallback, the same call is LiteLLM's own failure.
      expect(await ensureCapableFallback(client, undefined)).toEqual({ state: 'removed' })
      expect((await chat(key)).status).toBe(500)
    } finally {
      // Deleting the user deletes its keys (measured at sitting 9).
      await client.post('/user/delete', { user_ids: [user] })
      await leaveNone(client)
    }
    expect(await rowsNamedCapable()).toBe(0)
  }, 180_000)

  it('refuses a fallback below the capable model’s classification and sets nothing — a confidential one it sets (Task 12b)', async () => {
    const probe = `manifest-probe-public-${randomUUID()}`
    try {
      await unreachableCapable(client)
      await client.post('/model/new', {
        model_name: 'probe-public-chat',
        litellm_params: {
          model: 'ollama_chat/qwen3.5:4b',
          api_base: 'http://127.0.0.1:9',
        },
        model_info: { id: probe, max_classification: 'public' },
      })
      const result = await ensureCapableFallback(client, 'probe-public-chat')
      expect(result.state).toBe('refused')
      expect(result.reason).toContain("classified 'public'")
      await expect(
        client.get(`/fallback/${CAPABLE_MODEL_NAME}`, { fallback_type: 'general' }),
      ).rejects.toMatchObject({ status: 404 })
      expect((await ensureCapableFallback(client, 'default-chat-onprem')).state).toBe(
        'set',
      )
    } finally {
      await client.post('/model/delete', { id: probe })
      await leaveNone(client)
    }
  })

  it('a boot that fails before it serves leaves the capable model as it was (the review’s I3)', async () => {
    // A port already held: the control plane dies at `listen`, as a second one started beside the
    // developer's does. Without the setting, a boot that changed the gateway BEFORE listening would
    // have removed the model the running one registered.
    const holder = createServer()
    await new Promise<void>((resolve) => holder.listen(7187, '127.0.0.1', resolve))
    const pool = new pg.Pool({ connectionString: idpDatabaseUrl() })
    try {
      await ensureCapableModel(client, PRICED)
      await run('pnpm', ['--filter', '@manifest/control-plane', 'build'], {
        cwd: REPO_ROOT,
      })
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        MANIFEST_ENV: 'development',
        MANIFEST_PORT: '7187',
        MANIFEST_CONTROL_PLANE_ORIGIN: 'http://127.0.0.1:7187',
        MANIFEST_SP_ENTITY_BASE: TEST_ENTITY_BASE,
        MANIFEST_SESSION_SECRET: 'x'.repeat(32),
        MANIFEST_MASTER_SECRET: 'm'.repeat(32),
        MANIFEST_BLUEPRINTS_ROOT: `${REPO_ROOT}blueprints`,
        MANIFEST_REPOS_ROOT: `${REPO_ROOT}.manifest/repos`,
        MANIFEST_LITELLM_MASTER_KEY: litellmMasterKey(),
      }
      delete env.MANIFEST_CAPABLE_MODEL
      const child = spawn('node', ['packages/control-plane/dist/index.js'], {
        cwd: REPO_ROOT,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let out = ''
      child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString('utf8')))
      child.stderr.on('data', (chunk: Buffer) => (out += chunk.toString('utf8')))
      const code = await new Promise<number | null>((resolve, reject) => {
        const timer = setTimeout(() => {
          child.kill()
          reject(new Error(`the control plane did not exit in 90s:\n${out}`))
        }, 90_000)
        child.on('exit', (exit) => {
          clearTimeout(timer)
          resolve(exit)
        })
      })
      expect(code, out).not.toBe(0)
      expect(out).toContain('EADDRINUSE')
      expect((await listedCapable(client)).map((d) => d.model)).toEqual([PRICED])
    } finally {
      holder.close()
      try {
        await deleteSpRow(pool, TEST_ENTITY_ID)
      } finally {
        await pool.end()
        await leaveNone(client)
      }
    }
  }, 180_000)
})
