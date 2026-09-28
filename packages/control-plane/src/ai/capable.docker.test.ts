import { execFile, spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { promisify } from 'node:util'
import pg from 'pg'
import { expect, it } from 'vitest'
import { parse } from 'yaml'
import { describeDocker, REPO_ROOT } from '../runtime/testing.js'
import { deleteSpRow } from '../sso/index.js'
import { idpDatabaseUrl } from '../sso/testing.js'
import { CAPABLE_MODEL_NAME, ensureCapableModel } from './capable.js'
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
  await ensureCapableModel(client, undefined)
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
