import { and, eq } from 'drizzle-orm'
import type { LightMyRequestResponse } from 'fastify'
import { afterAll, describe, expect, it } from 'vitest'
import { events, pendingActions } from '../db/index.js'
import { resetDatabase } from '../db/testing.js'
import { ensureTestUser } from '../identity/testing.js'
import { fakeLiteLlm } from '../ai/testing.js'
import type { SsoCertificates, SsoDeregistrar, SsoRegistrar } from '../sso/index.js'
import { expirePendingActions, pendingById } from '../tokens/index.js'
import { mintTestToken } from '../tokens/testing.js'
import {
  mutationHeaders,
  refusal,
  sessionFor,
  withProjectServer,
  type TestProject,
} from './testing.js'

afterAll(resetDatabase)

/**
 * AN AGENT'S QUESTION ENDS WHEN ITS TOKEN DOES (FE-52; the faculty-ready plan's Task 13, Decision 17).
 *
 * A delegated token that asks for one of the privileged four leaves a question a person answers. Three
 * acts of a person end the token — its minter revokes it, the minter is taken off the project, the
 * project is switched off — and each now ends the token's waiting questions in the SAME transaction, so
 * nobody is told *confirmed* for a request nothing can retry. The person's act says so on the project's
 * stream: one `pending_action.expired` per question, naming them, published after the commit. A token
 * that simply runs out takes its questions with it by their own `expiresAt`, capped at the token's, and
 * the clock publishes nothing: it has no actor.
 */

/** The archive's teardown deregisters each environment's SP; the unit tier has no IdP (`testDeps`). */
function noIdp(): SsoRegistrar & SsoDeregistrar & SsoCertificates {
  return {
    spCertificate: () => {
      throw new Error('nothing here drafts a registration package')
    },
    registerServiceProvider: () => {
      throw new Error('the unit tier has no IdP')
    },
    idpSigningCertificate: () => {
      throw new Error('the unit tier has no IdP signing certificate')
    },
    deregisterServiceProvider: () => Promise.resolve(false),
  }
}

const withServer = (fn: (ctx: TestProject) => Promise<void>) =>
  withProjectServer(fn, { llm: fakeLiteLlm(), sso: noIdp() })

/** A token minted by `minter`, holding what a real one may (never `members:manage`). */
async function agentOf(
  ctx: TestProject,
  minter: string,
  expiresAt?: Date,
): Promise<{ plaintext: string; tokenId: string }> {
  const { plaintext, row } = await mintTestToken(ctx.db, {
    userId: minter,
    projectId: ctx.projectId,
    capabilities: ['project:read'],
    ...(expiresAt === undefined ? {} : { expiresAt }),
  })
  return { plaintext, tokenId: row.id }
}

/** The agent asks to add a person (`bio_student` unless named), and is refused with a question. */
async function asks(
  ctx: TestProject,
  plaintext: string,
  puid = 'bio_student',
): Promise<{ res: LightMyRequestResponse; pendingId: string }> {
  const res = await ctx.app.inject({
    method: 'POST',
    url: `/v1/projects/${ctx.projectId}/members`,
    headers: { authorization: `Bearer ${plaintext}`, 'idempotency-key': 'k'.repeat(12) },
    payload: { puid, role: 'collaborator' },
  })
  expect(refusal(res)).toEqual({ status: 403, code: 'TOKEN_ACTION_PENDING' })
  return { res, pendingId: res.json().error.pendingAction.id as string }
}

const confirm = (ctx: TestProject, pendingId: string) =>
  ctx.app.inject({
    method: 'POST',
    url: `/v1/pending-actions/${pendingId}/confirm`,
    cookies: ctx.ownerSteppedUp,
    headers: mutationHeaders(ctx.deps),
  })

const ended = (ctx: TestProject) =>
  ctx.db
    .select()
    .from(events)
    .where(
      and(eq(events.projectId, ctx.projectId), eq(events.type, 'pending_action.expired')),
    )

/** The three acts, each by `bio_prof` (the project's owner), each ending the token `tokenId`. */
const ACTS = {
  token_revoked: async (ctx: TestProject, tokenId: string): Promise<void> => {
    const res = await ctx.app.inject({
      method: 'DELETE',
      url: `/v1/tokens/${tokenId}`,
      cookies: ctx.ownerCookies,
      headers: mutationHeaders(ctx.deps),
    })
    expect(res.statusCode, res.body).toBe(200)
  },
  member_removed: async (ctx: TestProject, _tokenId: string, minter: string) => {
    const res = await ctx.app.inject({
      method: 'DELETE',
      url: `/v1/projects/${ctx.projectId}/members/${minter}`,
      cookies: ctx.ownerSteppedUp,
      headers: mutationHeaders(ctx.deps),
    })
    expect(res.statusCode, res.body).toBe(200)
  },
  project_archived: async (ctx: TestProject) => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/v1/projects/${ctx.projectId}/archive`,
      cookies: ctx.ownerSteppedUp,
      headers: mutationHeaders(ctx.deps),
      payload: {},
    })
    expect(res.statusCode, res.body).toBe(200)
  },
} as const

describe('a token’s questions end when the token does (FE-52)', () => {
  it.each([
    ['token_revoked', 'its minter revokes it'],
    ['member_removed', 'its minter is taken off the project'],
    ['project_archived', 'the project is switched off'],
  ] as const)(
    '%s — when %s, its waiting question reads expired, a confirm is 409, and one event names who acted',
    async (cause, _when) => {
      await withServer(async (ctx) => {
        // The minter: the owner for a revoke and an archive (only the minter may revoke); a colleague
        // for a removal (the last owner cannot be removed).
        const minter =
          cause === 'member_removed'
            ? (await ensureTestUser(ctx.db, 'bio_colleague')).id
            : ctx.userId
        if (cause === 'member_removed')
          await sessionFor(ctx, 'bio_colleague', 'collaborator')
        const agent = await agentOf(ctx, minter)
        const { pendingId } = await asks(ctx, agent.plaintext)
        expect((await pendingById(ctx.db, pendingId))?.state).toBe('pending')
        expect(await ended(ctx)).toEqual([])

        await ACTS[cause](ctx, agent.tokenId, minter)

        // 1. The question reads `expired` at once — the stored state, not only the clock.
        const read = await ctx.app.inject({
          method: 'GET',
          url: `/v1/pending-actions/${pendingId}`,
          cookies: ctx.ownerCookies,
        })
        expect(read.statusCode, read.body).toBe(200)
        expect(read.json().state).toBe('expired')
        // 2. A person's yes to it is refused: nobody is told "confirmed" for what nothing can retry.
        // An archived project's question is refused EARLIER, for the project — `PROJECT_ARCHIVED`,
        // the archive's own answer to every mutation of a switched-off project — and never reaches
        // the question's state; either way the answer is a 409 and never "confirmed".
        const yes = await confirm(ctx, pendingId)
        expect(refusal(yes)).toEqual({
          status: 409,
          code:
            cause === 'project_archived' ? 'PROJECT_ARCHIVED' : 'PENDING_ACTION_RESOLVED',
        })
        // 3. Exactly one event, naming the cause and the person — and the sentence names them.
        const said = await ended(ctx)
        expect(said).toHaveLength(1)
        expect(said[0]!.subject).toBe(`pending-action:${pendingId}`)
        expect(said[0]!.machineDetail).toEqual({
          pendingActionId: pendingId,
          tokenId: agent.tokenId,
          action: 'members:manage',
          cause,
          by: ctx.userId,
        })
        expect(said[0]!.humanMessage).toContain('Bio Prof')
        expect(said[0]!.humanMessage).not.toContain('bio_prof')
      })
    },
  )

  it('POSITIVE CONTROL: a live token’s question still confirms, and its retry is 201', async () => {
    await withServer(async (ctx) => {
      // A faculty colleague: since the launch path plan only faculty build, so a student is refused.
      await sessionFor(ctx, 'bio_colleague')
      const agent = await agentOf(ctx, ctx.userId)
      const { pendingId } = await asks(ctx, agent.plaintext, 'bio_colleague')
      const yes = await confirm(ctx, pendingId)
      expect(refusal(yes)).toEqual({ status: 200, code: undefined })
      expect(yes.json().state).toBe('confirmed')
      const retry = await ctx.app.inject({
        method: 'POST',
        url: `/v1/projects/${ctx.projectId}/members`,
        headers: {
          authorization: `Bearer ${agent.plaintext}`,
          'idempotency-key': 'r'.repeat(12),
        },
        payload: { puid: 'bio_colleague', role: 'collaborator' },
      })
      expect(retry.statusCode, retry.body).toBe(201)
      expect(await ended(ctx)).toEqual([])
    })
  })

  it('POSITIVE CONTROL: a question confirmed BEFORE the revoke stays confirmed, and no event is published for it', async () => {
    await withServer(async (ctx) => {
      const agent = await agentOf(ctx, ctx.userId)
      const { pendingId: answered } = await asks(ctx, agent.plaintext)
      expect(refusal(await confirm(ctx, answered))).toEqual({
        status: 200,
        code: undefined,
      })
      await ACTS.token_revoked(ctx, agent.tokenId)
      const row = await pendingById(ctx.db, answered)
      expect(row?.state).toBe('confirmed')
      expect(await ended(ctx)).toEqual([])
    })
  })
})

describe('a question never outlives its token (FE-52)', () => {
  it('a token that runs out in an hour asks: its question expires WITH it, and the clock publishes nothing', async () => {
    await withServer(async (ctx) => {
      const tokenExpiresAt = new Date(Date.now() + 3_600_000)
      const agent = await agentOf(ctx, ctx.userId, tokenExpiresAt)
      const { pendingId } = await asks(ctx, agent.plaintext)
      const [row] = await ctx.db
        .select()
        .from(pendingActions)
        .where(eq(pendingActions.id, pendingId))
      // Postgres keeps microseconds and JavaScript milliseconds: the token's own instant, either way.
      expect(row!.expiresAt.getTime()).toBe(tokenExpiresAt.getTime())

      // Just before the token's end the sweep leaves it; at it, the question is expired.
      await expirePendingActions(ctx.db, new Date(tokenExpiresAt.getTime() - 1))
      expect((await pendingById(ctx.db, pendingId))?.state).toBe('pending')
      await expirePendingActions(ctx.db, tokenExpiresAt)
      expect((await pendingById(ctx.db, pendingId))?.state).toBe('expired')
      // The clock ended it, so nobody did: no event.
      expect(await ended(ctx)).toEqual([])
    })
  })
})
