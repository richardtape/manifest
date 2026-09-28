import { describe, expect, it } from 'vitest'
import type { LiteLlmClient } from './client.js'
import { AiError } from './errors.js'
import { AI_ALLOWED_ROUTES } from './keys.js'
import {
  agentKeyAlias,
  budgetSpend,
  ensureIntakeBudget,
  ensurePersonBudget,
  INTAKE_AI_USER,
  intakeKeyAlias,
  mintAgentKey,
  mintIntakeKey,
  personAiUserId,
  personSpend,
  revokeAgentKey,
  revokeIntakeKey,
} from './agent-keys.js'
import { fakeLiteLlm } from './testing.js'

const AGENT = {
  sessionId: 's1',
  userId: 'u1',
  projectId: 'p1',
  tokenId: null,
  models: ['default-chat'],
  capUsd: 2,
  seconds: 3600,
}

describe('agent keys (the front-end enablement plan’s Task 9)', () => {
  it('mints a key under the PERSON’s user, with its alias, its cap, its life and the frozen routes — never an empty model list', async () => {
    const lite = fakeLiteLlm()
    await ensurePersonBudget(lite, { userId: 'u1', monthlyUsd: 10 })
    const key = await mintAgentKey(lite, AGENT)
    expect(key).toMatch(/^sk-/)
    expect(lite.calls.at(-1)).toEqual({
      method: 'POST',
      path: '/key/generate',
      body: {
        user_id: 'mf-person-u1',
        key_alias: 'mf-agent-s1',
        models: ['default-chat'],
        allowed_routes: [...AI_ALLOWED_ROUTES],
        duration: '3600s',
        max_budget: 2,
        metadata: {
          manifest_project: 'p1',
          manifest_agent_session: 's1',
          manifest_person: 'u1',
          manifest_token: null,
        },
      },
    })
    // The gateway's half, which is what the body is FOR: the key calls its model, and nothing else.
    expect(lite.use(key, 'default-chat')).toEqual({ status: 200 })
    expect(lite.use(key, 'default-chat-onprem')).toMatchObject({ status: 403 })
  })

  it('refuses to mint with no models — LiteLLM reads an empty list as every model', async () => {
    const lite = fakeLiteLlm()
    await ensurePersonBudget(lite, { userId: 'u1', monthlyUsd: 10 })
    await expect(mintAgentKey(lite, { ...AGENT, models: [] })).rejects.toThrow(
      /empty model list as every model/,
    )
    expect(lite.calls.filter((c) => c.path === '/key/generate')).toEqual([])
  })

  it('refuses to mint a key with no life or no cap — they are what bound it without the control plane', async () => {
    const lite = fakeLiteLlm()
    await ensurePersonBudget(lite, { userId: 'u1', monthlyUsd: 10 })
    await expect(mintAgentKey(lite, { ...AGENT, seconds: 0 })).rejects.toThrow(/life/)
    await expect(mintAgentKey(lite, { ...AGENT, capUsd: 0 })).rejects.toThrow(/cap/)
    expect(lite.calls.filter((c) => c.path === '/key/generate')).toEqual([])
  })

  it('a key stops at its cap, at its life, and at its person’s month — the gateway’s refusals, not the platform’s', async () => {
    const lite = fakeLiteLlm()
    await ensurePersonBudget(lite, { userId: 'u1', monthlyUsd: 10 })
    const capped = await mintAgentKey(lite, { ...AGENT, sessionId: 'cap', capUsd: 0.5 })
    lite.charge(agentKeyAlias('cap'), 0.5)
    expect(lite.use(capped, 'default-chat')).toEqual({
      status: 429,
      type: 'budget_exceeded',
    })

    const brief = await mintAgentKey(lite, { ...AGENT, sessionId: 'brief', seconds: 5 })
    lite.advance(6_000)
    expect(lite.use(brief, 'default-chat')).toEqual({ status: 401, type: 'expired_key' })

    const monthly = await mintAgentKey(lite, { ...AGENT, sessionId: 'month' })
    lite.spend(personAiUserId('u1'), 10)
    expect(lite.use(monthly, 'default-chat')).toEqual({
      status: 429,
      type: 'budget_exceeded',
    })
  })

  it('creates the person’s user with the month’s budget, and updates it on a second start', async () => {
    const lite = fakeLiteLlm()
    await ensurePersonBudget(lite, { userId: 'u1', monthlyUsd: 10 })
    await ensurePersonBudget(lite, { userId: 'u1', monthlyUsd: 12 })
    expect(lite.calls.map((c) => [c.path, c.body])).toEqual([
      [
        '/user/new',
        {
          user_id: 'mf-person-u1',
          max_budget: 10,
          budget_duration: '1mo',
          auto_create_key: false,
        },
      ],
      [
        '/user/new',
        {
          user_id: 'mf-person-u1',
          max_budget: 12,
          budget_duration: '1mo',
          auto_create_key: false,
        },
      ],
      [
        '/user/update',
        { user_id: 'mf-person-u1', max_budget: 12, budget_duration: '1mo' },
      ],
    ])
    expect(lite.users.get('mf-person-u1')?.maxBudget).toBe(12)
  })

  it('surfaces a user creation that fails for any reason but "already exists"', async () => {
    const lite = fakeLiteLlm()
    lite.fail('/user/new', 500)
    await expect(
      ensurePersonBudget(lite, { userId: 'u1', monthlyUsd: 10 }),
    ).rejects.toBeInstanceOf(AiError)
    expect(lite.calls.map((c) => c.path)).toEqual(['/user/new'])
  })

  it('revokes by alias, and a key already gone is done', async () => {
    const lite = fakeLiteLlm()
    await ensurePersonBudget(lite, { userId: 'u1', monthlyUsd: 10 })
    const key = await mintAgentKey(lite, AGENT)
    await revokeAgentKey(lite, 's1')
    expect(lite.calls.at(-1)).toEqual({
      method: 'POST',
      path: '/key/delete',
      body: { key_aliases: ['mf-agent-s1'] },
    })
    expect(lite.use(key, 'default-chat')).toEqual({
      status: 401,
      type: 'token_not_found_in_db',
    })
    await expect(revokeAgentKey(lite, 's1')).resolves.toBeUndefined()
  })

  it('surfaces a revocation that fails — a live key nobody can end is never swallowed', async () => {
    const lite = fakeLiteLlm()
    await ensurePersonBudget(lite, { userId: 'u1', monthlyUsd: 10 })
    await mintAgentKey(lite, AGENT)
    lite.fail('/key/delete', 500)
    await expect(revokeAgentKey(lite, 's1')).rejects.toBeInstanceOf(AiError)
    expect(lite.keys.size).toBe(1)
  })

  it('answers the person’s spend from /user/info, and throws — never answers 0 — when LiteLLM does not answer', async () => {
    const lite = fakeLiteLlm()
    await ensurePersonBudget(lite, { userId: 'u1', monthlyUsd: 10 })
    await mintAgentKey(lite, AGENT)
    lite.charge('mf-agent-s1', 0.4)
    const spend = await personSpend(lite, 'u1')
    expect(spend.spentUsd).toBeCloseTo(0.4)
    expect(spend.resetsAt).toMatch(/^\d{4}-\d{2}-01T00:00:00\.000Z$/)
    expect(spend.byAlias.get('mf-agent-s1')).toBeCloseTo(0.4)
    expect(lite.calls.at(-1)).toEqual({
      method: 'GET',
      path: '/user/info',
      query: { user_id: 'mf-person-u1' },
    })

    lite.fail('/user/info', 503)
    await expect(personSpend(lite, 'u1')).rejects.toBeInstanceOf(AiError)
  })

  it('reads a person LiteLLM has never heard of as a known zero — they have started no session this month', async () => {
    const lite = fakeLiteLlm()
    await expect(personSpend(lite, 'never')).resolves.toEqual({
      spentUsd: 0,
      resetsAt: null,
      byAlias: new Map(),
    })
  })

  it('throws, rather than answering 0, when /user/info answers without a spend', async () => {
    const client = {
      get: async () => ({ user_info: {}, keys: [] }),
      post: async () => ({}),
    } as unknown as LiteLlmClient
    await expect(budgetSpend(client, 'mf-person-u1')).rejects.toBeInstanceOf(AiError)
  })
})

describe('intake keys (Spec action 5, FE-1)', () => {
  it('mints ONE model on the PLATFORM’s user, never the person’s, named by its own alias', async () => {
    const lite = fakeLiteLlm()
    expect(await ensureIntakeBudget(lite, { monthlyUsd: 50 })).toBe(INTAKE_AI_USER)
    const key = await mintIntakeKey(lite, {
      sessionId: 'i1',
      userId: 'u1',
      model: 'default-chat',
      capUsd: 0.25,
      seconds: 1800,
    })
    expect(lite.calls.at(-1)).toEqual({
      method: 'POST',
      path: '/key/generate',
      body: {
        user_id: 'mf-platform-intake',
        key_alias: 'mf-intake-i1',
        models: ['default-chat'],
        allowed_routes: [...AI_ALLOWED_ROUTES],
        duration: '1800s',
        max_budget: 0.25,
        metadata: { manifest_intake_session: 'i1', manifest_person: 'u1' },
      },
    })
    expect(lite.users.has(personAiUserId('u1'))).toBe(false)
    expect(intakeKeyAlias('i1')).toBe('mf-intake-i1')
    await revokeIntakeKey(lite, 'i1')
    expect(lite.use(key, 'default-chat')).toEqual({
      status: 401,
      type: 'token_not_found_in_db',
    })
  })
})
