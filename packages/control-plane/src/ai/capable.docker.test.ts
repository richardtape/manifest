import { readFile } from 'node:fs/promises'
import pg from 'pg'
import { expect, it } from 'vitest'
import { parse } from 'yaml'
import { describeDocker } from '../runtime/testing.js'
import { CAPABLE_MODEL_NAME, ensureCapableModel } from './capable.js'
import { loadModelCatalogue } from './catalogue.js'
import { createLiteLlmClient, type LiteLlmClient } from './client.js'
import { AiError } from './errors.js'
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

  it('throws for a provider LiteLLM cannot serve, and deletes the row LiteLLM saved anyway', async () => {
    try {
      // Measured: a 500 whose row STAYS in LiteLLM's table, absent from /model/info.
      const refused = await ensureCapableModel(client, 'manifest-nowhere/probe').catch(
        (error: unknown) => error,
      )
      expect(refused).toBeInstanceOf(AiError)
      expect((refused as AiError).status).toBe(500)
      expect(await rowsNamedCapable()).toBe(0)
    } finally {
      await leaveNone(client)
    }
  })
})
