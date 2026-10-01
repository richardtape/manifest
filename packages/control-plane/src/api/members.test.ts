import { randomUUID } from 'node:crypto'
import { and, asc, eq, inArray } from 'drizzle-orm'
import pg from 'pg'
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
  /**
   * A person who has signed in once, through the one function a sign-in writes with — a FACULTY
   * colleague, because since FE-39 only a person who may build is added (the block below holds
   * that rule; this one holds how a person is found).
   */
  const signedInOnce = (ctx: TestProject, over: Partial<SamlIdentity> = {}) =>
    upsertUserFromAssertion(
      ctx.db,
      {
        ubcCwlPuid: 'col000001',
        email: 'colleague@ubc.ca',
        displayName: 'Test Colleague',
        cwlLogin: 'colleague',
        affiliations: ['faculty'],
        idpSession: null,
        ...over,
      },
      { adminPuids: [] },
    )

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
      const colleague = await signedInOnce(ctx)
      const res = await add(ctx, { cwlLogin: 'Colleague', role: 'collaborator' })
      expect(res.statusCode, res.body).toBe(201)
      expect(res.json()).toEqual({
        userId: colleague.id,
        puid: 'col000001',
        cwlLogin: 'colleague',
        displayName: 'Test Colleague',
        email: 'colleague@ubc.ca',
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
        ['col000001', 'colleague'],
      ])
    })
  })

  it('adds a person by their email, whatever its case', async () => {
    await withProjectServer(async (ctx) => {
      const colleague = await signedInOnce(ctx)
      const res = await add(ctx, {
        email: 'Colleague@UBC.ca',
        role: 'collaborator',
      })
      expect(res.statusCode, res.body).toBe(201)
      expect(res.json()).toMatchObject({ userId: colleague.id, role: 'collaborator' })
    })
  })

  it('still adds a person by their PUID', async () => {
    await withProjectServer(async (ctx) => {
      const colleague = await signedInOnce(ctx)
      const res = await add(ctx, { puid: 'col000001', role: 'owner' })
      expect(res.statusCode, res.body).toBe(201)
      expect(res.json()).toMatchObject({ userId: colleague.id, role: 'owner' })
    })
  })

  it('refuses two keys, or none, as a malformed request', async () => {
    await withProjectServer(async (ctx) => {
      await signedInOnce(ctx)
      for (const body of [
        { puid: 'col000001', cwlLogin: 'colleague', role: 'collaborator' },
        { cwlLogin: 'colleague', email: 'colleague@ubc.ca', role: 'collaborator' },
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
        (await add(ctx, { cwlLogin: 'colleague', role: 'collaborator' })).statusCode,
      ).toBe(201)
    })
  })

  it('answers MEMBER_USER_AMBIGUOUS when two people share the address, naming neither', async () => {
    await withProjectServer(async (ctx) => {
      await signedInOnce(ctx, { cwlLogin: null })
      await signedInOnce(ctx, {
        ubcCwlPuid: 'col000002',
        displayName: 'Other Colleague',
        email: 'COLLEAGUE@ubc.ca',
        cwlLogin: null,
      })
      const res = await add(ctx, {
        email: 'colleague@ubc.ca',
        role: 'collaborator',
      })
      expect(refusal(res)).toEqual({ status: 400, code: 'MEMBER_USER_AMBIGUOUS' })
      for (const secret of [
        'col000001',
        'col000002',
        'Test Colleague',
        'Other Colleague',
      ]) {
        expect(res.body).not.toContain(secret)
      }
      // The positive control: each is still addable by a key that names ONE person.
      expect(
        (await add(ctx, { puid: 'col000002', role: 'collaborator' })).statusCode,
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
        for (const other of ['col000001', 'colleague@ubc.ca', 'Test Colleague']) {
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
      const missed = await add(ctx, { cwlLogin: 'colleague', role: 'collaborator' })
      expect(refusal(missed)).toEqual({ status: 400, code: 'MEMBER_USER_NOT_FOUND' })
      expect(missed.json().error.message).toContain("CWL login name 'colleague'")
      expect(missed.json().error.hint).toMatch(/email/)
      expect(missed.json().error.hint).toMatch(/PUID/)
      // … and the key it names works: the same person, by email.
      expect(
        (await add(ctx, { email: 'colleague@ubc.ca', role: 'collaborator' })).statusCode,
      ).toBe(201)

      await signedInOnce(ctx, {
        ubcCwlPuid: 'col000002',
        displayName: 'Other Colleague',
        email: 'colleague@ubc.ca',
        cwlLogin: null,
      })
      const shared = await add(ctx, { email: 'colleague@ubc.ca', role: 'owner' })
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
      expect((await add(ctx, { cwlLogin: 'colleague', role: 'owner' })).statusCode).toBe(
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
        { cwlLogin: 'colleague', role: 'collaborator' },
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
      const colleague = await signedInOnce(ctx)
      const actor = { via: 'session', userId: ctx.userId, tokenId: null }

      expect(
        (await add(ctx, { cwlLogin: 'colleague', role: 'collaborator' })).statusCode,
      ).toBe(201)
      // The same role again changes nothing, and publishes nothing.
      expect(
        (await add(ctx, { cwlLogin: 'colleague', role: 'collaborator' })).statusCode,
      ).toBe(201)
      // A different role is a change, and says what it was.
      expect((await add(ctx, { cwlLogin: 'colleague', role: 'owner' })).statusCode).toBe(
        201,
      )
      expect((await remove(ctx, colleague.id)).statusCode).toBe(200)
      // Removing somebody who is no longer a member changes nothing, and publishes nothing.
      expect((await remove(ctx, colleague.id)).statusCode).toBe(200)

      const published = await memberEvents(ctx)
      expect(published.map((e) => [e.type, e.machineDetail])).toEqual([
        [
          'member.added',
          { memberId: colleague.id, role: 'collaborator', previousRole: null, ...actor },
        ],
        [
          'member.added',
          {
            memberId: colleague.id,
            role: 'owner',
            previousRole: 'collaborator',
            ...actor,
          },
        ],
        [
          'member.removed',
          { memberId: colleague.id, tokensRevoked: 0, sessionsEnded: 0, ...actor },
        ],
      ])
      expect(published.map((e) => e.humanMessage)).toEqual([
        'Bio Prof added Test Colleague to the project as a collaborator.',
        'Bio Prof made Test Colleague an owner of the project; they were a collaborator.',
        'Bio Prof removed Test Colleague from the project.',
      ])
      for (const { humanMessage } of published) {
        expect(humanMessage).not.toMatch(/bio_prof|col000001/)
      }
    })
  })

  it('names a person with no name as a Manifest user, never by their PUID', async () => {
    await withProjectServer(async (ctx) => {
      await signedInOnce(ctx, { displayName: '   ' })
      expect(
        (await add(ctx, { cwlLogin: 'colleague', role: 'collaborator' })).statusCode,
      ).toBe(201)
      const [event] = await memberEvents(ctx)
      expect(event!.humanMessage).toBe(
        'Bio Prof added A Manifest user to the project as a collaborator.',
      )
      const [row] = await ctx.db
        .select({ name: users.displayName })
        .from(users)
        .where(eq(users.ubcCwlPuid, 'col000001'))
      expect(row!.name).toBe('   ')
    })
  })
})

/**
 * ONLY A PERSON WHO MAY BUILD IS ADDED (FE-39; §13 as Spec action 7 amended it — Rich's, confirmed
 * 2026-09-29): a faculty member, or an administrator. `addMember` refuses anyone else `409
 * MEMBER_MAY_NOT_BUILD`, naming them — AFTER the capability, the step-up and the lookup, so the
 * person asking is one who may manage members and the person named is one who has signed in. One
 * who stops being faculty keeps the projects they are on (Decision 29), so a role CHANGE for a
 * person already on the project is not an add, and is not refused.
 */
describe('only a person who may build is added (FE-39)', () => {
  const STUDENT = {
    ubcCwlPuid: 'stu000001',
    email: 'student@student.ubc.ca',
    displayName: 'Test Student',
    cwlLogin: 'student',
    affiliations: ['student'],
    idpSession: null,
  }
  const COLLEAGUE = {
    ubcCwlPuid: 'col000001',
    email: 'colleague@ubc.ca',
    displayName: 'Test Colleague',
    cwlLogin: 'colleague',
    affiliations: ['faculty'],
    idpSession: null,
  }
  const add = (ctx: TestProject, body: Record<string, unknown>) =>
    ctx.app.inject({
      method: 'POST',
      url: `/v1/projects/${ctx.projectId}/members`,
      cookies: ctx.ownerSteppedUp,
      headers: mutationHeaders(ctx.deps),
      payload: body,
    })
  const memberPuids = async (ctx: TestProject) =>
    (
      await ctx.app.inject({
        method: 'GET',
        url: `/v1/projects/${ctx.projectId}/members`,
        cookies: ctx.ownerCookies,
      })
    )
      .json()
      .map((m: { puid: string; role: string }) => `${m.puid}:${m.role}`)
  const addedEvents = (ctx: TestProject) =>
    ctx.db
      .select({ type: events.type })
      .from(events)
      .where(and(eq(events.projectId, ctx.projectId), eq(events.type, 'member.added')))

  it('a faculty owner adding a student is refused MEMBER_MAY_NOT_BUILD, naming them; adding a faculty colleague works', async () => {
    await withProjectServer(async (ctx) => {
      await upsertUserFromAssertion(ctx.db, STUDENT, { adminPuids: [] })
      await upsertUserFromAssertion(ctx.db, COLLEAGUE, { adminPuids: [] })
      for (const key of [
        { cwlLogin: 'student' },
        { puid: 'stu000001' },
        { email: 'student@student.ubc.ca' },
      ]) {
        const res = await add(ctx, { ...key, role: 'collaborator' })
        expect(refusal(res), JSON.stringify(key)).toEqual({
          status: 409,
          code: 'MEMBER_MAY_NOT_BUILD',
        })
        expect(res.json().error.message).toContain('Test Student')
        expect(res.body).not.toContain('stu000001')
      }
      expect(await memberPuids(ctx)).toEqual(['bio_prof:owner'])
      expect(await addedEvents(ctx)).toEqual([])
      // The positive control: a faculty colleague, by the same route and the same owner.
      const added = await add(ctx, { cwlLogin: 'colleague', role: 'collaborator' })
      expect(added.statusCode, added.body).toBe(201)
      expect(await memberPuids(ctx)).toEqual(['bio_prof:owner', 'col000001:collaborator'])
    })
  })

  it('an administrator is added whatever their affiliation', async () => {
    await withProjectServer(async (ctx) => {
      const admin = await ensureTestUser(ctx.db, 'platform_admin')
      await ctx.db.update(users).set({ affiliations: [] }).where(eq(users.id, admin.id))
      const res = await add(ctx, { puid: 'platform_admin', role: 'collaborator' })
      expect(res.statusCode, res.body).toBe(201)
    })
  })

  it('a member who stops being faculty keeps their place, and their role may still be changed', async () => {
    await withProjectServer(async (ctx) => {
      const colleague = await upsertUserFromAssertion(ctx.db, COLLEAGUE, {
        adminPuids: [],
      })
      expect(
        (await add(ctx, { cwlLogin: 'colleague', role: 'collaborator' })).statusCode,
      ).toBe(201)
      // Their next sign-in carries `staff`.
      await upsertUserFromAssertion(
        ctx.db,
        { ...COLLEAGUE, affiliations: ['staff'] },
        { adminPuids: [] },
      )
      expect(await memberPuids(ctx)).toEqual(['bio_prof:owner', 'col000001:collaborator'])
      const promoted = await add(ctx, { cwlLogin: 'colleague', role: 'owner' })
      expect(promoted.statusCode, promoted.body).toBe(201)
      expect(promoted.json()).toMatchObject({ userId: colleague.id, role: 'owner' })
      // … and once REMOVED, they are a person who may not build, and are not added back.
      const removed = await ctx.app.inject({
        method: 'DELETE',
        url: `/v1/projects/${ctx.projectId}/members/${colleague.id}`,
        cookies: ctx.ownerSteppedUp,
        headers: mutationHeaders(ctx.deps),
      })
      expect(removed.statusCode, removed.body).toBe(200)
      expect(
        refusal(await add(ctx, { cwlLogin: 'colleague', role: 'collaborator' })),
      ).toEqual({
        status: 409,
        code: 'MEMBER_MAY_NOT_BUILD',
      })
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
    // The other order: the removal commits after the start has passed `assertCapability` and read the
    // month (`/user/info`), and before its transaction reads anything under lock — so only a read under
    // its transaction can see the person gone. DETERMINISTIC (the final review's Minor 8: a 150 ms
    // `slow('/user/info')` asked the whole removal to reach its DELETE first, which a loaded machine does
    // not promise): a second connection holds the PROJECT's row against the start's `FOR SHARE` — and not
    // against the removal, whose event's foreign key takes only `FOR KEY SHARE` — so the start waits at
    // its first statement under lock while the removal runs to the end.
    const lite = fakeLiteLlm()
    await withProjectServer(
      async (ctx) => {
        const ta = await theTa(ctx)
        await holding(
          'SELECT 1 FROM projects WHERE id = $1 FOR NO KEY UPDATE',
          [ctx.projectId],
          async (lock) => {
            const starting = startSession(ctx, { cookies: ta.cookies }, ctx.projectId)
            await until(
              () => lock.waitedOn('%from "projects"%for share%'),
              'the start’s project hold waiting on the held project row',
            )
            // Past `assertCapability` and the month's read: the refusal below can be no earlier check's.
            expect(lite.calls.some((c) => c.path === '/user/info')).toBe(true)
            expect((await remove(ctx, ta.id)).statusCode).toBe(200)
            await lock.release()
            expect(refusal(await starting)).toEqual({ status: 404, code: 'NOT_FOUND' })
          },
        )
        expect(lite.calls.filter((c) => c.path === '/key/generate')).toEqual([])
        expect(liveKeysOf(lite, ta.id)).toEqual([])
        // The positive control: the owner — still a member — starts one the same way.
        await started(ctx, lite, { cookies: ctx.ownerCookies })
      },
      { llm: lite },
    )
  })

  /** `mintToken`, in the person's own session. */
  const mint = (ctx: TestProject, cookies: Record<string, string>) =>
    ctx.app.inject({
      method: 'POST',
      url: `/v1/projects/${ctx.projectId}/tokens`,
      cookies,
      headers: mutationHeaders(ctx.deps),
      payload: { name: 'ta-agent', capabilities: ['project:read'], expiresInDays: 1 },
    })

  /** Every token of theirs on the project that is not revoked. */
  const liveTokensOf = async (ctx: TestProject, userId: string) =>
    (
      await ctx.db
        .select({ id: delegatedTokens.id, revokedAt: delegatedTokens.revokedAt })
        .from(delegatedTokens)
        .where(
          and(
            eq(delegatedTokens.projectId, ctx.projectId),
            eq(delegatedTokens.userId, userId),
          ),
        )
    ).filter((t) => t.revokedAt === null)

  it('a token the person mints WHILE they are being removed is revoked with the rest — the removal waits for the mint', async () => {
    // The task review's I1: the mint read the membership before its transaction, and held only the
    // project in it — so a removal landing before its INSERT revoked every token but that one, which
    // then committed live for up to 365 days, with nothing left that could revoke it. DETERMINISTIC:
    // a second connection holds the person's `users` row, so the mint's INSERT (its foreign key) waits
    // INSIDE its transaction, after everything it reads under lock; the removal is sent then.
    await withProjectServer(async (ctx) => {
      const ta = await theTa(ctx)
      await holding(
        'SELECT 1 FROM users WHERE id = $1 FOR UPDATE',
        [ta.id],
        async (lock) => {
          const minting = mint(ctx, ta.cookies)
          await until(
            () => lock.waitedOn('%delegated_tokens%'),
            'the mint’s INSERT waiting on the held user row',
          )
          let settled = false
          const removing = remove(ctx, ta.id).then((res) => {
            settled = true
            return res
          })
          // HELD, the removal waits on the mint — its DELETE on the membership the mint holds. Without a
          // hold it finishes here, before the mint has written anything its revoke could find.
          await until(
            async () => settled || (await lock.waitedOnBehind('%project_members%')),
            'the removal waiting on the mint, or finished',
          )
          await lock.release()
          const [minted, removed] = await Promise.all([minting, removing])
          expect(removed.statusCode, removed.body).toBe(200)
          expect(minted.statusCode, minted.body).toBe(201)
          // Minted, and revoked by the removal that waited for it.
          expect(
            await tokenState(ctx, (minted.json() as { token: { id: string } }).token.id),
          ).toBe('revoked')
        },
      )
      expect(await liveTokensOf(ctx, ta.id)).toEqual([])
    })
  })

  it('a mint that read the membership before the removal committed is refused NOT_FOUND, and writes no token', async () => {
    // The other order: the removal commits between the mint's `assertCapability` and its transaction.
    // A second connection holds the PROJECT's row against the mint's `FOR SHARE` (and not against the
    // removal, whose event's foreign key takes only `FOR KEY SHARE`), so the mint waits at its first
    // statement under lock while the removal runs to the end.
    await withProjectServer(async (ctx) => {
      const ta = await theTa(ctx)
      await holding(
        'SELECT 1 FROM projects WHERE id = $1 FOR NO KEY UPDATE',
        [ctx.projectId],
        async (lock) => {
          const minting = mint(ctx, ta.cookies)
          await until(
            () => lock.waitedOn('%projects%'),
            'the mint’s project hold waiting on the held project row',
          )
          const removed = await remove(ctx, ta.id)
          expect(removed.statusCode, removed.body).toBe(200)
          await lock.release()
          expect(refusal(await minting)).toEqual({ status: 404, code: 'NOT_FOUND' })
        },
      )
      expect(await liveTokensOf(ctx, ta.id)).toEqual([])
      // The positive control: the owner — still a member — mints the same way.
      expect((await mint(ctx, ctx.ownerCookies)).statusCode).toBe(201)
    })
  })

  it('two removals of one collaborator queued behind a held membership both answer the members — the second is not refused as the last owner', async () => {
    // The final review's Minor 2. Since Task 8 a start and a mint hold the membership row FOR SHARE, so two
    // removals of one person can both queue behind it at their DELETE: the first deletes the row, and the
    // second's DELETE then matches nothing — which `removeMember` read as the LAST OWNER, a `409` for a
    // collaborator. DETERMINISTIC: a second connection holds the row as a start would, until both DELETEs
    // wait on it. (The true last owner is still refused — *"removing the last owner is still refused"*
    // above is this test's positive control.)
    await withProjectServer(async (ctx) => {
      const ta = await theTa(ctx)
      const deleting = '%delete from "project_members"%'
      await holding(
        'SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2 FOR SHARE',
        [ctx.projectId, ta.id],
        async (lock) => {
          const first = remove(ctx, ta.id)
          await until(
            () => lock.waitedOn(deleting),
            'the first removal’s DELETE waiting on the held membership',
          )
          const second = remove(ctx, ta.id)
          await until(
            () => lock.waitedOnBehind(deleting),
            'the second removal’s DELETE queued behind the first',
          )
          await lock.release()
          const answers = await Promise.all([first, second])
          expect(answers.map((res) => refusal(res))).toEqual([
            { status: 200, code: undefined },
            { status: 200, code: undefined },
          ])
          // Each answers the members as they are: the owner, and not the person removed.
          for (const res of answers) {
            const members = (res.json() as { userId: string }[]).map((m) => m.userId)
            expect(members).toContain(ctx.userId)
            expect(members).not.toContain(ta.id)
          }
        },
      )
      expect(await isMember(ctx, ta.id)).toBe(false)
      // ONE removal recorded: the second changed nothing, so it published nothing.
      expect((await published(ctx, 'member.removed')).map((e) => e.subject)).toEqual([
        `member:${ta.id}`,
      ])
    })
  })
})

/**
 * A row held by a SECOND connection, as the database's owner — so a request waits at a statement we
 * know — and how to tell who waits on it. `waitedOn`: a statement matching `pattern` waits on this
 * lock. `waitedOnBehind`: one waits on a backend that itself waits on it. Both confined to THIS
 * lock's backend: the dev control plane shares `manifest_control`, so the database alone would not
 * tell its waits from ours (as `api/events.test.ts`'s window test found).
 */
async function holding(
  statement: string,
  params: unknown[],
  fn: (lock: {
    waitedOn: (pattern: string) => Promise<boolean>
    waitedOnBehind: (pattern: string) => Promise<boolean>
    release: () => Promise<void>
  }) => Promise<void>,
): Promise<void> {
  const admin = new pg.Pool({ connectionString: process.env.MANIFEST_ADMIN_DATABASE_URL })
  const held = await admin.connect()
  try {
    const { rows } = await held.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
    const pid = rows[0]!.pid
    await held.query('BEGIN')
    await held.query(statement, params)
    const count = async (sql: string, pattern: string) =>
      Number((await admin.query<{ n: string }>(sql, [pid, pattern])).rows[0]!.n) > 0
    await fn({
      waitedOn: (pattern) =>
        count(
          `SELECT count(*) AS n FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event_type = 'Lock'
              AND query ILIKE $2 AND $1 = ANY(pg_blocking_pids(pid))`,
          pattern,
        ),
      waitedOnBehind: (pattern) =>
        count(
          `SELECT count(*) AS n FROM pg_stat_activity a
            WHERE a.datname = current_database() AND a.wait_event_type = 'Lock'
              AND a.query ILIKE $2
              AND EXISTS (SELECT 1 FROM unnest(pg_blocking_pids(a.pid)) AS b(pid)
                           WHERE $1 = ANY(pg_blocking_pids(b.pid)))`,
          pattern,
        ),
      // ROLLBACK, never COMMIT: the statement held a row and changed nothing. A second one, from the
      // `finally`, is a warning and not an error.
      release: async () => {
        await held.query('ROLLBACK')
      },
    })
  } finally {
    await held.query('ROLLBACK')
    held.release()
    await admin.end()
  }
}

/** Polls `condition` until it holds, or fails naming what it waited for. */
async function until(
  condition: () => boolean | Promise<boolean>,
  what: string,
  timeoutMs = 5_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!(await condition())) {
    if (Date.now() > deadline)
      throw new Error(`timed out after ${timeoutMs} ms waiting for ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

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
