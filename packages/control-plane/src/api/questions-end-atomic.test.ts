import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { events, projects } from '../db/index.js'
import { resetDatabase } from '../db/testing.js'
import { ensureTestUser } from '../identity/testing.js'
import { fakeLiteLlm } from '../ai/testing.js'
import type { SsoCertificates, SsoDeregistrar, SsoRegistrar } from '../sso/index.js'
import { membershipOf } from '../projects/index.js'
import { pendingById, tokenById } from '../tokens/index.js'
import { mintTestToken } from '../tokens/testing.js'
import {
  mutationHeaders,
  refusal,
  sessionFor,
  withProjectServer,
  type TestProject,
} from './testing.js'

/**
 * A QUESTION'S END IS RECORDED IN THE TRANSACTION THAT ENDS IT (the faculty-ready plan's Task 16; sitting
 * 4's M1, Rich's (a)).
 *
 * A revoke, a minter's removal and an archive each end a token's waiting questions in one transaction
 * (`questions-end.test.ts`). Until Task 16 the `pending_action.expired` rows were written AFTER that
 * commit — so an event write that failed answered `500` with the act already done, the retry found
 * nothing pending, and the record the project's people read was lost for ever. Now the rows are written
 * inside the transaction and pushed on the stream after it commits: a failed write rolls the WHOLE act
 * back, and the same request repeated does all of it, once.
 *
 * The failure is made by wrapping the event writers this file's module graph imports — delegating to the
 * real ones, and throwing only for a `pending_action.expired` while `failing.on` is set. Its own file, so
 * every other test meets the real module.
 */
const failing = vi.hoisted(() => ({ on: false }))
vi.mock('../observability/index.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../observability/index.js')>()
  const refuse = (type: string): void => {
    if (failing.on && type === 'pending_action.expired')
      throw new Error('the test refuses to write pending_action.expired')
  }
  return {
    ...real,
    recordEvent: (...args: Parameters<typeof real.recordEvent>) => {
      refuse(args[1].type)
      return real.recordEvent(...args)
    },
    publishEvent: (...args: Parameters<typeof real.publishEvent>) => {
      refuse(args[2].type)
      return real.publishEvent(...args)
    },
  }
})

afterEach(() => {
  failing.on = false
})
afterAll(resetDatabase)

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

const ended = (ctx: TestProject) =>
  ctx.db
    .select()
    .from(events)
    .where(
      and(eq(events.projectId, ctx.projectId), eq(events.type, 'pending_action.expired')),
    )

/** Each act, by `bio_prof` (the project's owner), ending the token `tokenId` minted by `minter`. */
const ACTS = {
  token_revoked: (ctx: TestProject, tokenId: string) =>
    ctx.app.inject({
      method: 'DELETE',
      url: `/v1/tokens/${tokenId}`,
      cookies: ctx.ownerCookies,
      headers: mutationHeaders(ctx.deps),
    }),
  member_removed: (ctx: TestProject, _tokenId: string, minter: string) =>
    ctx.app.inject({
      method: 'DELETE',
      url: `/v1/projects/${ctx.projectId}/members/${minter}`,
      cookies: ctx.ownerSteppedUp,
      headers: mutationHeaders(ctx.deps),
    }),
  project_archived: (ctx: TestProject) =>
    ctx.app.inject({
      method: 'POST',
      url: `/v1/projects/${ctx.projectId}/archive`,
      cookies: ctx.ownerSteppedUp,
      headers: mutationHeaders(ctx.deps),
      payload: {},
    }),
} as const

/** What the act changes, read straight from the rows — the state a failed act must leave untouched. */
async function stateOf(
  ctx: TestProject,
  input: { tokenId: string; minter: string; pendingId: string },
) {
  const [project] = await ctx.db
    .select({ state: projects.state })
    .from(projects)
    .where(eq(projects.id, ctx.projectId))
  return {
    tokenRevoked: (await tokenById(ctx.db, input.tokenId))?.revokedAt != null,
    minterRole: await membershipOf(ctx.db, input.minter, ctx.projectId),
    project: project?.state,
    question: (await pendingById(ctx.db, input.pendingId))?.state,
    events: (await ended(ctx)).length,
  }
}

describe('a question’s end is recorded in the transaction that ends it (Task 16)', () => {
  it.each(['token_revoked', 'member_removed', 'project_archived'] as const)(
    '%s — an event write that fails undoes the whole act, and the same request repeated does all of it, once',
    async (cause) => {
      await withServer(async (ctx) => {
        // The minter: the owner for a revoke and an archive (only the minter may revoke); a colleague
        // for a removal (the last owner cannot be removed).
        const minter =
          cause === 'member_removed'
            ? (await ensureTestUser(ctx.db, 'bio_colleague')).id
            : ctx.userId
        if (cause === 'member_removed')
          await sessionFor(ctx, 'bio_colleague', 'collaborator')
        const { plaintext, row } = await mintTestToken(ctx.db, {
          userId: minter,
          projectId: ctx.projectId,
          capabilities: ['project:read'],
        })
        const asked = await ctx.app.inject({
          method: 'POST',
          url: `/v1/projects/${ctx.projectId}/members`,
          headers: {
            authorization: `Bearer ${plaintext}`,
            'idempotency-key': 'k'.repeat(12),
          },
          payload: { puid: 'bio_student', role: 'collaborator' },
        })
        expect(refusal(asked)).toEqual({ status: 403, code: 'TOKEN_ACTION_PENDING' })
        const ids = {
          tokenId: row.id,
          minter,
          pendingId: asked.json().error.pendingAction.id as string,
        }
        const before = await stateOf(ctx, ids)
        expect(before).toEqual({
          tokenRevoked: false,
          minterRole: cause === 'member_removed' ? 'collaborator' : 'owner',
          project: 'active',
          question: 'pending',
          events: 0,
        })

        // The event write fails: the request fails, and NOTHING it did is kept.
        failing.on = true
        const refused = await ACTS[cause](ctx, row.id, minter)
        expect(refusal(refused)).toEqual({ status: 500, code: 'INTERNAL' })
        expect(await stateOf(ctx, ids)).toEqual(before)

        // The same request, the write restored: all of it, and exactly one event for the question.
        failing.on = false
        const done = await ACTS[cause](ctx, row.id, minter)
        expect(done.statusCode, done.body).toBe(200)
        expect(await stateOf(ctx, ids)).toEqual({
          tokenRevoked: true,
          minterRole: cause === 'member_removed' ? null : 'owner',
          project: cause === 'project_archived' ? 'archived' : 'active',
          question: 'expired',
          events: 1,
        })
      })
    },
  )

  it('POSITIVE CONTROL: with nothing failing, the first request ends the question and says so once', async () => {
    await withServer(async (ctx) => {
      const { plaintext, row } = await mintTestToken(ctx.db, {
        userId: ctx.userId,
        projectId: ctx.projectId,
        capabilities: ['project:read'],
      })
      const asked = await ctx.app.inject({
        method: 'POST',
        url: `/v1/projects/${ctx.projectId}/members`,
        headers: {
          authorization: `Bearer ${plaintext}`,
          'idempotency-key': 'p'.repeat(12),
        },
        payload: { puid: 'bio_student', role: 'collaborator' },
      })
      const pendingId = asked.json().error.pendingAction.id as string
      const frames: string[] = []
      ctx.deps.bus.subscribe(ctx.projectId, (frame) => {
        if (frame.kind === 'event') frames.push(frame.type)
      })
      const done = await ACTS.token_revoked(ctx, row.id)
      expect(done.statusCode, done.body).toBe(200)
      expect((await pendingById(ctx.db, pendingId))?.state).toBe('expired')
      expect((await ended(ctx)).length).toBe(1)
      // …and the stream carried it, once, after the commit.
      expect(frames.filter((type) => type === 'pending_action.expired')).toEqual([
        'pending_action.expired',
      ])
    })
  })
})
