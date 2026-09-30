import { randomUUID } from 'node:crypto'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { personAiUserId } from '../ai/index.js'
import { fakeLiteLlm, type FakeLiteLlm } from '../ai/testing.js'
import {
  agentSessions,
  delegatedTokens,
  events,
  projectMembers,
  users,
  type Db,
} from '../db/index.js'
import { upsertUserFromAssertion, type SamlIdentity } from '../identity/index.js'
import { ensureTestUser } from '../identity/testing.js'
import { addMember } from '../projects/index.js'
import { mintTestToken } from '../tokens/testing.js'
import { ROUTE_DEFINITIONS } from './routes/index.js'
import {
  mutationHeaders,
  refusal,
  sessionFor,
  withProjectServer,
  type TestProject,
} from './testing.js'

/**
 * PEOPLE BY CWL LOGIN NAME OR EMAIL (the front-end enablement plan's Task 7; §6 and §9 as Spec
 * action 4 amended them, Decisions 14 and 15). `addMember` finds the person by EXACTLY ONE of
 * their PUID, their CWL login name (kept from `uid` at sign-in) or their email, and membership
 * changes are published — `member.added` and `member.removed`, each sentence naming people.
 */
describe('people by CWL login name or email (Task 7)', () => {
  /** A person who has signed in once, through the one function a sign-in writes with. */
  const signedInOnce = (ctx: TestProject, over: Partial<SamlIdentity> = {}) =>
    upsertUserFromAssertion(ctx.db, {
      ubcCwlPuid: 'stu000001',
      email: 'student@student.ubc.ca',
      displayName: 'Test Student',
      cwlLogin: 'student',
      idpSession: null,
      ...over,
    })

  /** `members:manage` is step-up guarded, so the owner's stepped-up session by default. */
  const add = (
    ctx: TestProject,
    body: Record<string, unknown>,
    cookies: Record<string, string> = ctx.ownerSteppedUp,
  ) =>
    ctx.app.inject({
      method: 'POST',
      url: `/v1/projects/${ctx.projectId}/members`,
      cookies,
      headers: mutationHeaders(ctx.deps),
      payload: body,
    })

  const remove = (ctx: TestProject, userId: string) =>
    ctx.app.inject({
      method: 'DELETE',
      url: `/v1/projects/${ctx.projectId}/members/${userId}`,
      cookies: ctx.ownerSteppedUp,
      headers: mutationHeaders(ctx.deps),
    })

  const memberEvents = (ctx: TestProject) =>
    ctx.db
      .select({
        type: events.type,
        machineDetail: events.machineDetail,
        humanMessage: events.humanMessage,
      })
      .from(events)
      .where(
        and(
          eq(events.projectId, ctx.projectId),
          inArray(events.type, ['member.added', 'member.removed']),
        ),
      )
      .orderBy(asc(events.createdAt))

  it('adds a person by their CWL login name, whatever its case', async () => {
    await withProjectServer(async (ctx) => {
      const student = await signedInOnce(ctx)
      const res = await add(ctx, { cwlLogin: 'Student', role: 'collaborator' })
      expect(res.statusCode, res.body).toBe(201)
      expect(res.json()).toEqual({
        userId: student.id,
        puid: 'stu000001',
        cwlLogin: 'student',
        displayName: 'Test Student',
        email: 'student@student.ubc.ca',
        role: 'collaborator',
      })
      // And the list says so — the owner, who signed in with no uid, has no login.
      const list = await ctx.app.inject({
        method: 'GET',
        url: `/v1/projects/${ctx.projectId}/members`,
        cookies: ctx.ownerCookies,
      })
      expect(
        list
          .json()
          .map((m: { puid: string; cwlLogin: string | null }) => [m.puid, m.cwlLogin]),
      ).toEqual([
        ['bio_prof', null],
        ['stu000001', 'student'],
      ])
    })
  })

  it('adds a person by their email, whatever its case', async () => {
    await withProjectServer(async (ctx) => {
      const student = await signedInOnce(ctx)
      const res = await add(ctx, {
        email: 'Student@Student.UBC.ca',
        role: 'collaborator',
      })
      expect(res.statusCode, res.body).toBe(201)
      expect(res.json()).toMatchObject({ userId: student.id, role: 'collaborator' })
    })
  })

  it('still adds a person by their PUID', async () => {
    await withProjectServer(async (ctx) => {
      const student = await signedInOnce(ctx)
      const res = await add(ctx, { puid: 'stu000001', role: 'owner' })
      expect(res.statusCode, res.body).toBe(201)
      expect(res.json()).toMatchObject({ userId: student.id, role: 'owner' })
    })
  })

  it('refuses two keys, or none, as a malformed request', async () => {
    await withProjectServer(async (ctx) => {
      await signedInOnce(ctx)
      for (const body of [
        { puid: 'stu000001', cwlLogin: 'student', role: 'collaborator' },
        { cwlLogin: 'student', email: 'student@student.ubc.ca', role: 'collaborator' },
        { role: 'collaborator' },
        { email: 'not an address', role: 'collaborator' },
      ]) {
        const res = await add(ctx, body)
        expect(refusal(res), JSON.stringify(body)).toEqual({
          status: 400,
          code: 'REQUEST_INVALID',
        })
      }
      // Nobody was added by any of them …
      expect(await memberEvents(ctx)).toEqual([])
      // … and the positive control: ONE key is a request, so the refusals above are the
      // exactly-one rule and not a body that knows only `puid`.
      expect(
        (await add(ctx, { cwlLogin: 'student', role: 'collaborator' })).statusCode,
      ).toBe(201)
    })
  })

  it('answers MEMBER_USER_AMBIGUOUS when two people share the address, naming neither', async () => {
    await withProjectServer(async (ctx) => {
      await signedInOnce(ctx, { cwlLogin: null })
      await signedInOnce(ctx, {
        ubcCwlPuid: 'stu000002',
        displayName: 'Other Student',
        email: 'STUDENT@student.ubc.ca',
        cwlLogin: null,
      })
      const res = await add(ctx, {
        email: 'student@student.ubc.ca',
        role: 'collaborator',
      })
      expect(refusal(res)).toEqual({ status: 400, code: 'MEMBER_USER_AMBIGUOUS' })
      for (const secret of ['stu000001', 'stu000002', 'Test Student', 'Other Student']) {
        expect(res.body).not.toContain(secret)
      }
      // The positive control: each is still addable by a key that names ONE person.
      expect(
        (await add(ctx, { puid: 'stu000002', role: 'collaborator' })).statusCode,
      ).toBe(201)
    })
  })

  it('answers MEMBER_USER_NOT_FOUND naming only what was looked for', async () => {
    await withProjectServer(async (ctx) => {
      await signedInOnce(ctx)
      for (const [body, looked] of [
        [{ cwlLogin: 'nobody', role: 'collaborator' }, 'nobody'],
        [{ email: 'nobody@ubc.ca', role: 'collaborator' }, 'nobody@ubc.ca'],
        [{ puid: 'nob000001', role: 'collaborator' }, 'nob000001'],
      ] as const) {
        const res = await add(ctx, body)
        expect(refusal(res), JSON.stringify(body)).toEqual({
          status: 400,
          code: 'MEMBER_USER_NOT_FOUND',
        })
        expect(res.json().error.message).toContain(looked)
        for (const other of ['stu000001', 'student@student.ubc.ca', 'Test Student']) {
          expect(res.body).not.toContain(other)
        }
      }
    })
  })

  it('a CWL login nobody is known by says how else to find the person — and so does a shared email', async () => {
    // The review's I1: a person who signed in before Manifest asked for uid (or where UBC does
    // not release it) HAS signed in, so "ask them to sign in once" is false and loops. Each key
    // says what it means, and names the keys that still work.
    await withProjectServer(async (ctx) => {
      await signedInOnce(ctx, { cwlLogin: null })
      const missed = await add(ctx, { cwlLogin: 'student', role: 'collaborator' })
      expect(refusal(missed)).toEqual({ status: 400, code: 'MEMBER_USER_NOT_FOUND' })
      expect(missed.json().error.message).toContain("CWL login name 'student'")
      expect(missed.json().error.hint).toMatch(/email/)
      expect(missed.json().error.hint).toMatch(/PUID/)
      // … and the key it names works: the same person, by email.
      expect(
        (await add(ctx, { email: 'student@student.ubc.ca', role: 'collaborator' }))
          .statusCode,
      ).toBe(201)

      await signedInOnce(ctx, {
        ubcCwlPuid: 'stu000002',
        displayName: 'Other Student',
        email: 'student@student.ubc.ca',
        cwlLogin: null,
      })
      const shared = await add(ctx, { email: 'student@student.ubc.ca', role: 'owner' })
      expect(refusal(shared)).toEqual({ status: 400, code: 'MEMBER_USER_AMBIGUOUS' })
      expect(shared.json().error.hint).toMatch(/PUID/)
    })
  })

  it('refuses to make the last owner a collaborator, and publishes nothing — beside a demotion that leaves one', async () => {
    // The review's I2 (pre-existing): `addMember` with the only owner's own key and role
    // `collaborator` left a project with NO owner — what `removeMember`'s guard exists to stop.
    await withProjectServer(async (ctx) => {
      const demoted = await add(ctx, { puid: 'bio_prof', role: 'collaborator' })
      expect(refusal(demoted)).toEqual({ status: 409, code: 'PROJECT_LAST_OWNER' })
      const members = await ctx.app.inject({
        method: 'GET',
        url: `/v1/projects/${ctx.projectId}/members`,
        cookies: ctx.ownerCookies,
      })
      expect(members.json().map((m: { role: string }) => m.role)).toEqual(['owner'])
      expect(await memberEvents(ctx)).toEqual([])
      // The positive control: with a second owner, the first may become a collaborator.
      await signedInOnce(ctx)
      expect((await add(ctx, { cwlLogin: 'student', role: 'owner' })).statusCode).toBe(
        201,
      )
      const allowed = await add(ctx, { puid: 'bio_prof', role: 'collaborator' })
      expect(allowed.statusCode, allowed.body).toBe(201)
      expect(allowed.json().role).toBe('collaborator')
    })
  })

  it('a collaborator asking learns nothing about who has signed in', async () => {
    // `members:manage` is asserted BEFORE the lookup, so a person who may not manage members
    // gets the same refusal for a login that exists and one that does not.
    await withProjectServer(async (ctx) => {
      await signedInOnce(ctx)
      const collaborator = await sessionFor(ctx, 'bio_student', 'collaborator', {
        steppedUp: true,
      })
      const known = await add(
        ctx,
        { cwlLogin: 'student', role: 'collaborator' },
        collaborator,
      )
      const unknown = await add(
        ctx,
        { cwlLogin: 'nobody', role: 'collaborator' },
        collaborator,
      )
      expect(refusal(known)).toEqual({ status: 403, code: 'FORBIDDEN' })
      expect(refusal(unknown)).toEqual(refusal(known))
      expect(unknown.json().error.message).toBe(known.json().error.message)
    })
  })

  it('publishes member.added and member.removed, each sentence naming the people', async () => {
    await withProjectServer(async (ctx) => {
      const student = await signedInOnce(ctx)
      const actor = { via: 'session', userId: ctx.userId, tokenId: null }

      expect(
        (await add(ctx, { cwlLogin: 'student', role: 'collaborator' })).statusCode,
      ).toBe(201)
      // The same role again changes nothing, and publishes nothing.
      expect(
        (await add(ctx, { cwlLogin: 'student', role: 'collaborator' })).statusCode,
      ).toBe(201)
      // A different role is a change, and says what it was.
      expect((await add(ctx, { cwlLogin: 'student', role: 'owner' })).statusCode).toBe(
        201,
      )
      expect((await remove(ctx, student.id)).statusCode).toBe(200)
      // Removing somebody who is no longer a member changes nothing, and publishes nothing.
      expect((await remove(ctx, student.id)).statusCode).toBe(200)

      const published = await memberEvents(ctx)
      expect(published.map((e) => [e.type, e.machineDetail])).toEqual([
        [
          'member.added',
          { memberId: student.id, role: 'collaborator', previousRole: null, ...actor },
        ],
        [
          'member.added',
          { memberId: student.id, role: 'owner', previousRole: 'collaborator', ...actor },
        ],
        [
          'member.removed',
          { memberId: student.id, tokensRevoked: 0, sessionsEnded: 0, ...actor },
        ],
      ])
      expect(published.map((e) => e.humanMessage)).toEqual([
        'Bio Prof added Test Student to the project as a collaborator.',
        'Bio Prof made Test Student an owner of the project; they were a collaborator.',
        'Bio Prof removed Test Student from the project.',
      ])
      for (const { humanMessage } of published) {
        expect(humanMessage).not.toMatch(/bio_prof|stu000001/)
      }
    })
  })

  it('names a person with no name as a Manifest user, never by their PUID', async () => {
    await withProjectServer(async (ctx) => {
      await signedInOnce(ctx, { displayName: '   ' })
      expect(
        (await add(ctx, { cwlLogin: 'student', role: 'collaborator' })).statusCode,
      ).toBe(201)
      const [event] = await memberEvents(ctx)
      expect(event!.humanMessage).toBe(
        'Bio Prof added A Manifest user to the project as a collaborator.',
      )
      const [row] = await ctx.db
        .select({ name: users.displayName })
        .from(users)
        .where(eq(users.ubcCwlPuid, 'stu000001'))
      expect(row!.name).toBe('   ')
    })
  })
})

/**
 * REMOVING A PERSON REMOVES THEIR AGENT TOO (§6, §10 and §20 as Spec action 2 amended them; the launch
 * path plan's Task 8 — Rich's *"YEs"*, 2026-09-29). Every token they minted on the project is revoked
 * IN THE REMOVAL'S OWN TRANSACTION; then their event streams are closed (`api/events.test.ts` holds
 * that half, over real sockets); then their agent sessions there are ended — token-started and
 * browser-started alike — `member_removed`. Before this, a TA removed in week five kept an agent
 * working on the project for up to a year: a token's authority is its own, and a browser-started
 * session has no token for a revoke to reach.
 */
describe('removing a member revokes their tokens on the project, ends their agent sessions and closes their streams (Task 8)', () => {
  /**
   * `members:manage` is step-up guarded: the owner's stepped-up session. A fresh Idempotency-Key unless
   * one is given — the same one, for a request REPEATED.
   */
  const remove = (ctx: TestProject, userId: string, key: string = randomUUID()) =>
    ctx.app.inject({
      method: 'DELETE',
      url: `/v1/projects/${ctx.projectId}/members/${userId}`,
      cookies: ctx.ownerSteppedUp,
      headers: { ...mutationHeaders(ctx.deps), 'idempotency-key': key },
    })

  /**
   * The TA: `bio_student`, a collaborator on the fixture project AND on the second one — so a token
   * or a session of theirs on the other project is one they could really hold.
   */
  async function theTa(ctx: TestProject) {
    const cookies = await sessionFor(ctx, 'bio_student', 'collaborator')
    const user = await ensureTestUser(ctx.db, 'bio_student')
    await addMember(ctx.db, ctx.otherProjectId, user.id, 'collaborator')
    return { id: user.id, cookies }
  }

  const tokenState = async (
    ctx: TestProject,
    id: string,
  ): Promise<'live' | 'revoked'> => {
    const [row] = await ctx.db
      .select({ revokedAt: delegatedTokens.revokedAt })
      .from(delegatedTokens)
      .where(eq(delegatedTokens.id, id))
    if (row === undefined) throw new Error(`no token '${id}'`)
    return row.revokedAt === null ? 'live' : 'revoked'
  }

  /** `getProject`, asked with a token. */
  const readAs = (ctx: TestProject, plaintext: string, projectId: string) =>
    ctx.app.inject({
      method: 'GET',
      url: `/v1/projects/${projectId}`,
      headers: { authorization: `Bearer ${plaintext}` },
    })

  type Auth = { cookies: Record<string, string> } | { bearer: string }

  const startSession = (ctx: TestProject, auth: Auth, projectId: string) =>
    ctx.app.inject({
      method: 'POST',
      url: `/v1/projects/${projectId}/agent-sessions`,
      payload: { name: 'Mark the lab reports' },
      ...('cookies' in auth
        ? { cookies: auth.cookies, headers: mutationHeaders(ctx.deps) }
        : {
            headers: {
              authorization: `Bearer ${auth.bearer}`,
              'idempotency-key': randomUUID(),
            },
          }),
    })

  /**
   * A session started, and its key ANSWERING — the positive control each "refused" below is read
   * against, so a refusal cannot be a key that never worked.
   */
  async function started(
    ctx: TestProject,
    lite: FakeLiteLlm,
    auth: Auth,
    projectId: string = ctx.projectId,
  ): Promise<{ id: string; key: string; model: string }> {
    const res = await startSession(ctx, auth, projectId)
    expect(res.statusCode, res.body).toBe(201)
    const body = res.json() as { session: { id: string; models: string[] }; key: string }
    const model = body.session.models[0]!
    expect(lite.use(body.key, model)).toEqual({ status: 200 })
    return { id: body.session.id, key: body.key, model }
  }

  /** What the gateway answers a revoked key — LiteLLM's own `token_not_found_in_db`, as `agents.test.ts` reads it. */
  const REVOKED_KEY = { status: 401, type: 'token_not_found_in_db' }

  const sessionRow = async (ctx: TestProject, id: string) => {
    const [row] = await ctx.db
      .select({ endedAt: agentSessions.endedAt, endReason: agentSessions.endReason })
      .from(agentSessions)
      .where(eq(agentSessions.id, id))
    return row
  }

  const published = (ctx: TestProject, type: string) =>
    ctx.db
      .select({
        subject: events.subject,
        machineDetail: events.machineDetail,
        humanMessage: events.humanMessage,
      })
      .from(events)
      .where(and(eq(events.projectId, ctx.projectId), eq(events.type, type)))
      .orderBy(asc(events.createdAt))

  const isMember = async (ctx: TestProject, userId: string): Promise<boolean> =>
    (
      await ctx.db
        .select({ role: projectMembers.role })
        .from(projectMembers)
        .where(
          and(
            eq(projectMembers.projectId, ctx.projectId),
            eq(projectMembers.userId, userId),
          ),
        )
    ).length === 1

  const byOwner = (ctx: TestProject) => ({
    via: 'session',
    userId: ctx.userId,
    tokenId: null,
  })

  it('revokes their tokens on THIS project, and only theirs', async () => {
    await withProjectServer(async (ctx) => {
      const ta = await theTa(ctx)
      const taHere = await mintTestToken(ctx.db, {
        userId: ta.id,
        projectId: ctx.projectId,
        capabilities: ['project:read'],
      })
      const taElsewhere = await mintTestToken(ctx.db, {
        userId: ta.id,
        projectId: ctx.otherProjectId,
        capabilities: ['project:read'],
      })
      const owners = await mintTestToken(ctx.db, {
        userId: ctx.userId,
        projectId: ctx.projectId,
        capabilities: ['project:read'],
      })
      // One of theirs revoked BEFORE: it keeps the stamp it had, and is not counted again.
      const earlier = await mintTestToken(ctx.db, {
        userId: ta.id,
        projectId: ctx.projectId,
        capabilities: ['project:read'],
      })
      const stamped = new Date(Date.now() - 60_000)
      await ctx.db
        .update(delegatedTokens)
        .set({ revokedAt: stamped })
        .where(eq(delegatedTokens.id, earlier.row.id))
      // The positive control: the TA's token answers before the removal.
      expect((await readAs(ctx, taHere.plaintext, ctx.projectId)).statusCode).toBe(200)

      const res = await remove(ctx, ta.id)
      expect(res.statusCode, res.body).toBe(200)

      expect(await tokenState(ctx, taHere.row.id)).toBe('revoked')
      // Another project's is not this removal's — the TA is still a member there.
      expect(await tokenState(ctx, taElsewhere.row.id)).toBe('live')
      // A colleague's is not theirs.
      expect(await tokenState(ctx, owners.row.id)).toBe('live')
      const [kept] = await ctx.db
        .select({ revokedAt: delegatedTokens.revokedAt })
        .from(delegatedTokens)
        .where(eq(delegatedTokens.id, earlier.row.id))
      expect(kept!.revokedAt).toEqual(stamped)

      // And the revoked token is refused AT ONCE, while the two left live still answer.
      expect(refusal(await readAs(ctx, taHere.plaintext, ctx.projectId))).toEqual({
        status: 401,
        code: 'UNAUTHENTICATED',
      })
      expect(
        (await readAs(ctx, taElsewhere.plaintext, ctx.otherProjectId)).statusCode,
      ).toBe(200)
      expect((await readAs(ctx, owners.plaintext, ctx.projectId)).statusCode).toBe(200)

      const removed = await published(ctx, 'member.removed')
      expect(removed.map((e) => e.machineDetail)).toEqual([
        { memberId: ta.id, tokensRevoked: 1, sessionsEnded: 0, ...byOwner(ctx) },
      ])
      expect(removed[0]!.humanMessage).toBe(
        'Bio Prof removed Bio Student from the project, revoking 1 delegated token they had minted on it.',
      )
    })
  })

  it('ends their agent sessions on the project — token-started and browser-started — member_removed', async () => {
    const lite = fakeLiteLlm()
    await withProjectServer(
      async (ctx) => {
        const ta = await theTa(ctx)
        const token = await mintTestToken(ctx.db, {
          userId: ta.id,
          projectId: ctx.projectId,
          capabilities: ['agent:session'],
        })
        const byToken = await started(ctx, lite, { bearer: token.plaintext })
        // No token reaches this one: `requested_by_token` is null, so only the PERSON names it.
        const inBrowser = await started(ctx, lite, { cookies: ta.cookies })

        const res = await remove(ctx, ta.id)
        expect(res.statusCode, res.body).toBe(200)

        // Refused by the GATEWAY — the key itself, never only the row.
        expect(lite.use(byToken.key, byToken.model)).toEqual(REVOKED_KEY)
        expect(lite.use(inBrowser.key, inBrowser.model)).toEqual(REVOKED_KEY)
        for (const { id } of [byToken, inBrowser]) {
          expect(await sessionRow(ctx, id)).toMatchObject({
            endedAt: expect.any(Date),
            endReason: 'member_removed',
          })
        }
        const ended = await published(ctx, 'agent_session.ended')
        expect(ended.map((e) => e.machineDetail)).toEqual(
          expect.arrayContaining(
            [byToken, inBrowser].map(({ id }) => ({
              sessionId: id,
              reason: 'member_removed',
              ...byOwner(ctx),
            })),
          ),
        )
        expect(ended).toHaveLength(2)
        expect(ended[0]!.humanMessage).toBe(
          "Bio Student's agent session 'Mark the lab reports' was ended because the person it works for was removed from the project.",
        )
        const [removed] = await published(ctx, 'member.removed')
        expect(removed!.machineDetail).toEqual({
          memberId: ta.id,
          tokensRevoked: 1,
          sessionsEnded: 2,
          ...byOwner(ctx),
        })
        expect(removed!.humanMessage).toBe(
          'Bio Prof removed Bio Student from the project, revoking 1 delegated token they had minted on it and ending 2 agent sessions of theirs there.',
        )
      },
      { llm: lite },
    )
  })

  it('a colleague’s session on the same project, and the removed person’s own on another project, survive the removal', async () => {
    // `endSessionsOf`'s `{ projectId, userId }` must be told from `{ projectId }` FIRST — read as the
    // project alone, a removal would end every session on it (the controller's ruling 3).
    const lite = fakeLiteLlm()
    await withProjectServer(
      async (ctx) => {
        const ta = await theTa(ctx)
        const theirs = await started(ctx, lite, { cookies: ta.cookies })
        const colleagues = await started(ctx, lite, { cookies: ctx.ownerCookies })
        const elsewhere = await started(
          ctx,
          lite,
          { cookies: ta.cookies },
          ctx.otherProjectId,
        )

        expect((await remove(ctx, ta.id)).statusCode).toBe(200)

        // The positive control: the removed person's session HERE is ended…
        expect(lite.use(theirs.key, theirs.model)).toEqual(REVOKED_KEY)
        // …and neither of the others is.
        expect(lite.use(colleagues.key, colleagues.model)).toEqual({ status: 200 })
        expect(lite.use(elsewhere.key, elsewhere.model)).toEqual({ status: 200 })
        expect(await sessionRow(ctx, colleagues.id)).toEqual({
          endedAt: null,
          endReason: null,
        })
        expect(await sessionRow(ctx, elsewhere.id)).toEqual({
          endedAt: null,
          endReason: null,
        })
      },
      { llm: lite },
    )
  })

  it('removing the last owner is still refused, and revokes nothing', async () => {
    // The revoke shares the removal's transaction, and runs only for a removal: a refused removal
    // must leave every token live and every session running — a refusal has no side effects.
    const lite = fakeLiteLlm()
    await withProjectServer(
      async (ctx) => {
        const owners = await mintTestToken(ctx.db, {
          userId: ctx.userId,
          projectId: ctx.projectId,
          capabilities: ['project:read'],
        })
        const session = await started(ctx, lite, { cookies: ctx.ownerCookies })

        expect(refusal(await remove(ctx, ctx.userId))).toEqual({
          status: 409,
          code: 'PROJECT_LAST_OWNER',
        })
        expect(await isMember(ctx, ctx.userId)).toBe(true)
        expect(await tokenState(ctx, owners.row.id)).toBe('live')
        expect(lite.use(session.key, session.model)).toEqual({ status: 200 })
        expect(await published(ctx, 'member.removed')).toEqual([])

        // The positive control: with a second owner the same removal goes through — and revokes.
        await sessionFor(ctx, 'bio_student', 'owner')
        const res = await remove(ctx, ctx.userId)
        expect(res.statusCode, res.body).toBe(200)
        expect(await tokenState(ctx, owners.row.id)).toBe('revoked')
        expect(lite.use(session.key, session.model)).toEqual(REVOKED_KEY)
      },
      { llm: lite },
    )
  })

  it('a removal whose revoke fails removes nobody — the member stays, and every token of theirs stays live', async () => {
    // THE TRANSACTION'S OWN PROPERTY (the controller's ruling 2): no removal without its revoke. The
    // database refuses the revoke's UPDATE — and only it — after the membership row is deleted in the
    // same transaction; the delete must roll back with it.
    await withProjectServer(async (ctx) => {
      const ta = await theTa(ctx)
      const token = await mintTestToken(ctx.db, {
        userId: ta.id,
        projectId: ctx.projectId,
        capabilities: ['project:read'],
      })
      const real = ctx.deps.db
      const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      let res: Awaited<ReturnType<typeof remove>>
      try {
        ctx.deps.db = refusingTokenUpdates(real)
        res = await remove(ctx, ta.id)
      } finally {
        ctx.deps.db = real
        logged.mockRestore()
      }
      expect(refusal(res)).toEqual({ status: 500, code: 'INTERNAL' })
      expect(await isMember(ctx, ta.id)).toBe(true)
      expect(await tokenState(ctx, token.row.id)).toBe('live')
      expect(await published(ctx, 'member.removed')).toEqual([])

      // The positive control: the same removal, the database willing, removes and revokes.
      expect((await remove(ctx, ta.id)).statusCode).toBe(200)
      expect(await isMember(ctx, ta.id)).toBe(false)
      expect(await tokenState(ctx, token.row.id)).toBe('revoked')
    })
  })

  it('with AI switched off, answers AI_CATALOGUE_DISABLED with the person already removed and their tokens already revoked — and the removal repeated once AI is back ends their sessions', async () => {
    const lite = fakeLiteLlm()
    await withProjectServer(
      async (ctx) => {
        const ta = await theTa(ctx)
        const token = await mintTestToken(ctx.db, {
          userId: ta.id,
          projectId: ctx.projectId,
          capabilities: ['agent:session'],
        })
        const session = await started(ctx, lite, { bearer: token.plaintext })
        const key = randomUUID()
        const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        let off: Awaited<ReturnType<typeof remove>>
        try {
          // The control plane restarted with AI off while the session's key is still live.
          ctx.deps.llm = undefined
          off = await remove(ctx, ta.id, key)
        } finally {
          ctx.deps.llm = lite
          logged.mockRestore()
        }
        expect(refusal(off)).toEqual({ status: 503, code: 'AI_CATALOGUE_DISABLED' })
        expect(off.body).toContain('1 agent session(s) could not be ended')
        // The declaration is the answer…
        expect(
          ROUTE_DEFINITIONS.find((r) => r.operationId === 'removeMember')?.errors,
        ).toContain('AI_CATALOGUE_DISABLED')
        // …and what its description promises is so: removed, and revoked, already.
        expect(await isMember(ctx, ta.id)).toBe(false)
        expect(await tokenState(ctx, token.row.id)).toBe('revoked')
        expect(lite.use(session.key, session.model)).toEqual({ status: 200 })
        // The removal is recorded though its sessions are not ended — once, with what it did.
        const first = await published(ctx, 'member.removed')
        expect(first.map((e) => e.machineDetail)).toEqual([
          { memberId: ta.id, tokensRevoked: 1, sessionsEnded: 0, ...byOwner(ctx) },
        ])
        expect(first[0]!.humanMessage).toBe(
          'Bio Prof removed Bio Student from the project, revoking 1 delegated token they had minted on it. At least one of their agent sessions could not be ended; repeating the removal ends it.',
        )

        // POSITIVE CONTROL: the SAME request — its Idempotency-Key too, since a failure stores nothing —
        // AI back on, ends the session, and records no second removal.
        const again = await remove(ctx, ta.id, key)
        expect(again.statusCode, again.body).toBe(200)
        expect(lite.use(session.key, session.model)).toEqual(REVOKED_KEY)
        expect(await sessionRow(ctx, session.id)).toMatchObject({
          endReason: 'member_removed',
        })
        expect(await published(ctx, 'member.removed')).toHaveLength(1)
      },
      { llm: lite },
    )
  })

  it('a member removed WHILE their browser session is starting never leaves their agent a working key', async () => {
    // The whole-branch review's I1, for a person rather than a token: the removal's `endSessionsOf`
    // saw no committed row while the start's mint was in flight, and the start then committed a live
    // key for somebody no longer on the project.
    const lite = fakeLiteLlm()
    await withProjectServer(
      async (ctx) => {
        const ta = await theTa(ctx)
        lite.slow('/key/generate', 150)
        const starting = startSession(ctx, { cookies: ta.cookies }, ctx.projectId)
        await untilCalled(lite, '/key/generate')
        const res = await remove(ctx, ta.id)
        expect(res.statusCode, res.body).toBe(200)
        const answered = await starting
        if (answered.statusCode === 201) {
          const body = answered.json() as {
            session: { models: string[] }
            key: string
          }
          expect(lite.use(body.key, body.session.models[0]!)).toEqual(REVOKED_KEY)
        } else {
          expect(refusal(answered)).toEqual({ status: 404, code: 'NOT_FOUND' })
        }
        // Whichever order the two landed in: no key of theirs is live.
        expect(liveKeysOf(lite, ta.id)).toEqual([])
      },
      { llm: lite },
    )
  })

  it('a member removed before their browser session reaches its key is refused NOT_FOUND, and nothing is minted', async () => {
    // The other order: the removal commits while the start reads the month (`/user/info`), before its
    // transaction — the start has already passed `assertCapability`, so only a read under its
    // transaction can see the person gone.
    const lite = fakeLiteLlm()
    await withProjectServer(
      async (ctx) => {
        const ta = await theTa(ctx)
        lite.slow('/user/info', 150)
        const starting = startSession(ctx, { cookies: ta.cookies }, ctx.projectId)
        await untilCalled(lite, '/user/info')
        expect((await remove(ctx, ta.id)).statusCode).toBe(200)
        expect(refusal(await starting)).toEqual({ status: 404, code: 'NOT_FOUND' })
        expect(lite.calls.filter((c) => c.path === '/key/generate')).toEqual([])
        expect(liveKeysOf(lite, ta.id)).toEqual([])
        // The positive control: the owner — still a member — starts one the same way.
        await started(ctx, lite, { cookies: ctx.ownerCookies })
      },
      { llm: lite },
    )
  })
})

/** Waits until the fake gateway has been ASKED `path` — its answer may still be on its way. */
async function untilCalled(lite: FakeLiteLlm, path: string): Promise<void> {
  for (let i = 0; i < 200 && !lite.calls.some((c) => c.path === path); i++) {
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  expect(
    lite.calls.some((c) => c.path === path),
    `${path} was never called`,
  ).toBe(true)
}

/** Every key the fake gateway still holds for this person. */
const liveKeysOf = (lite: FakeLiteLlm, userId: string) =>
  [...lite.keys.values()].filter((k) => k.userId === personAiUserId(userId))

/**
 * The database, refusing an UPDATE of `delegated_tokens` — and nothing else — outside a transaction
 * and inside one alike: the revoke's statement failing where it runs, whichever that is.
 */
function refusingTokenUpdates(db: Db): Db {
  const refusing = <T extends object>(target: T): T =>
    new Proxy(target, {
      get(inner, name) {
        if (name === 'update') {
          return (table: unknown) => {
            if (table === delegatedTokens)
              throw new Error('the database refused the revoke')
            return (inner as unknown as Db).update(table as typeof delegatedTokens)
          }
        }
        if (name === 'transaction') {
          return (fn: (tx: unknown) => Promise<unknown>) =>
            (inner as unknown as Db).transaction((tx) => fn(refusing(tx)))
        }
        const value = Reflect.get(inner, name, inner) as unknown
        return typeof value === 'function'
          ? (value as (...args: unknown[]) => unknown).bind(inner)
          : value
      },
    })
  return refusing(db)
}
