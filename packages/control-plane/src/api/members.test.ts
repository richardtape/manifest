import { and, asc, eq, inArray } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { events, users } from '../db/index.js'
import { upsertUserFromAssertion, type SamlIdentity } from '../identity/index.js'
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
        ['member.removed', { memberId: student.id, ...actor }],
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
