import { randomUUID, X509Certificate } from 'node:crypto'
import { and, asc, eq } from 'drizzle-orm'
import pg from 'pg'
import { describe, expect, it, vi } from 'vitest'
import { events, instances, privacyAssessments, projects, releases } from '../db/index.js'
import { resetDatabase } from '../db/testing.js'
import { ensureTestUser } from '../identity/testing.js'
import { createMailer } from '../mail/index.js'
import { recordingMailer } from '../mail/testing.js'
import { addMember } from '../projects/index.js'
import { writeFiles } from '../source/testing.js'
import {
  everyGapAnswered,
  vancouverDaysAgo,
  vancouverToday,
  withAssessmentDraft,
  withDraft,
} from '../launch/testing.js'
import { vancouverNoon } from '../launch/index.js'
import { mintTestToken } from '../tokens/testing.js'
import { startFake } from '@manifest/github-fake/testing'
import { buildServer, type ServerDeps } from './server.js'
import {
  commitManifest,
  cwlFakes,
  cwlManifest,
  githubTestDeps,
  loginAs,
  mutationHeaders,
  projectBody,
  refusal,
  sessionFor,
  testDeps,
  withProjectServer,
  type TestProject,
} from './testing.js'

/**
 * THE THREE CLOCKS' RECORDS THROUGH THE ROUTES (the launch path plan's Task 9; Spec actions 3 and
 * 9): an owner's *"I've sent it"* for a registration per environment and for the privacy
 * assessment, the order UBC works in, and the checklist saying how long each has waited. The
 * DRAFT a submission needs is Task 10's and Task 11's, so these tests write it to the row
 * (`launch/testing.ts`).
 */

type Json = Record<string, unknown>

const IAM_BODY = (ctx: TestProject, environment: 'staging' | 'production') => ({
  entityId: `${ctx.deps.config.idp.spEntityBase}/sp/fixture/${environment}`,
  acsUrl: `https://fixture.${environment}.manifest.internal/auth/ubcshib/callback`,
  sloUrl: `https://fixture.${environment}.manifest.internal/auth/logout`,
  registeredAttributes: ['ubcEduCwlPuid', 'mail'],
})

/** An administrator, in their own session, recording what UBC said. */
async function adminRecords(
  ctx: TestProject,
  kind: 'iam-registration' | 'privacy-assessment',
  payload: Json,
) {
  const admin = await loginAs(ctx.deps, 'platform_admin')
  const res = await ctx.app.inject({
    method: 'POST',
    url: `/v1/projects/${ctx.projectId}/launch-records/${kind}`,
    payload,
    cookies: admin,
    headers: mutationHeaders(ctx.deps),
  })
  if (res.statusCode !== 200)
    throw new Error(`recording ${kind} answered ${res.statusCode}: ${res.body}`)
  return res.json() as Json
}

const piaApproved = async (ctx: TestProject) => {
  for (const state of ['submitted', 'approved'] as const)
    await adminRecords(ctx, 'privacy-assessment', {
      state,
      reviewer: 'K. Privacy',
      externalTicketRef: 'PIA-2026-0088',
    })
}

const stagingActive = async (ctx: TestProject) => {
  for (const state of ['submitted', 'active'] as const)
    await adminRecords(ctx, 'iam-registration', {
      ...IAM_BODY(ctx, 'staging'),
      environment: 'staging',
      state,
    })
}

type Credentials = { cookies?: Record<string, string>; bearer?: string }
type Record3 = 'staging' | 'production' | 'privacy-assessment'

/** One launch record's own path: the assessment's, or a registration's for one environment. */
const recordPath = (ctx: TestProject, what: Record3) =>
  what === 'privacy-assessment'
    ? `/v1/projects/${ctx.projectId}/launch-records/privacy-assessment`
    : `/v1/projects/${ctx.projectId}/launch-records/iam-registration/${what}`

function postTo(
  url: string,
  ctx: TestProject,
  body: Json | undefined,
  credentials: Credentials,
) {
  return ctx.app.inject({
    method: 'POST',
    url,
    ...(body === undefined ? {} : { payload: body }),
    ...(credentials.cookies === undefined ? {} : { cookies: credentials.cookies }),
    headers: {
      ...mutationHeaders(ctx.deps),
      ...(credentials.bearer === undefined
        ? {}
        : { authorization: `Bearer ${credentials.bearer}` }),
    },
  })
}

/** The owner's send to the Manifest team (`sendIamRegistration`, `sendPrivacyAssessment`). */
const send = (ctx: TestProject, what: Record3, body: Json, credentials: Credentials) =>
  postTo(`${recordPath(ctx, what)}/send`, ctx, body, credentials)

/** The team's record that it submitted the record to UBC (`submitIamRegistration`, `submitPrivacyAssessment`). */
const teamSubmits = (
  ctx: TestProject,
  what: Record3,
  body: Json,
  credentials: Credentials,
) => postTo(`${recordPath(ctx, what)}/submission`, ctx, body, credentials)

/** The team's hand-back (`returnIamRegistration`, `returnPrivacyAssessment`). */
const handsBack = (ctx: TestProject, what: Record3, credentials: Credentials) =>
  postTo(`${recordPath(ctx, what)}/return`, ctx, undefined, credentials)

/** An answer for every gap of the assessment's stored draft, as the owner's send carries them. */
async function answersFor(ctx: TestProject, answer = 'does not apply') {
  return everyGapAnswered(
    ((await records(ctx)).privacyAssessment as { draft: unknown } | null)?.draft,
    answer,
  )
}

/** What the unit tier's server told the Manifest team (`recordingMailer`). */
const toldTeam = (ctx: TestProject) =>
  (ctx.deps.mailer as ReturnType<typeof recordingMailer>).told

async function readiness(ctx: TestProject) {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/v1/projects/${ctx.projectId}/launch-readiness`,
    cookies: ctx.ownerCookies,
  })
  return res.json() as {
    items: { id: string; state: string; since: string | null; why: string }[]
  }
}

async function records(ctx: TestProject) {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/v1/projects/${ctx.projectId}/launch-records`,
    cookies: ctx.ownerCookies,
  })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as {
    iamRegistration: Json | null
    stagingRegistration: Json | null
    privacyAssessment: Json | null
  }
}

const MAIL_CONFIG = {
  mail: {
    smtp: { host: '127.0.0.1', port: 1, secure: false, requireTLS: false, auth: null },
    team: 'team@manifest.internal',
    from: 'Manifest <manifest@manifest.internal>',
  },
  sp: { origin: 'https://console.manifest.internal' },
}

describe('the owner sends each record to the Manifest team, which submits it to UBC (FE-46/47/5 plan Task 5)', () => {
  it('the production registration: the owner sends it, the team submits it, and it waits from the team’s day — the checklist says so', async () => {
    await withProjectServer(async (ctx) => {
      await piaApproved(ctx)
      await stagingActive(ctx)
      await withDraft(ctx.db, { projectId: ctx.projectId, environment: 'production' })
      const sent = await send(ctx, 'production', {}, { cookies: ctx.ownerCookies })
      expect(sent.statusCode, sent.body).toBe(200)
      expect(sent.json()).toMatchObject({
        environment: 'production',
        state: 'sent',
        sentFrom: 'draft',
        sentAt: expect.any(String),
        sentBy: { id: ctx.userId, displayName: 'Bio Prof' },
        submittedAt: null,
        submittedBy: null,
      })
      expect(toldTeam(ctx)).toEqual([
        expect.objectContaining({
          kind: 'record-sent',
          record: 'production-registration',
          change: false,
          by: 'Bio Prof',
        }),
      ])
      const today = vancouverToday()
      const admin = await loginAs(ctx.deps, 'platform_admin')
      const submitted = await teamSubmits(
        ctx,
        'production',
        { sentAt: today, reference: 'IAM-2026-0500' },
        { cookies: admin },
      )
      expect(submitted.statusCode, submitted.body).toBe(200)
      const submittedAt = vancouverNoon(today).toISOString()
      expect(submitted.json()).toMatchObject({
        state: 'submitted',
        sentFrom: null,
        sentAt: (sent.json() as Json).sentAt,
        sentBy: { displayName: 'Bio Prof' },
        submittedAt,
        submittedBy: { displayName: 'Platform Admin' },
        externalTicketRef: 'IAM-2026-0500',
      })
      const item = (await readiness(ctx)).items.find((i) => i.id === 'iam-registration')!
      expect(item).toMatchObject({ state: 'unmet', since: submittedAt })
      const inWords = new Intl.DateTimeFormat('en-CA', {
        dateStyle: 'long',
        timeZone: 'America/Vancouver',
      }).format(new Date(submittedAt))
      expect(item.why).toContain(`sent to UBC IAM on ${inWords}`)
      // ONE READ, BOTH REGISTRATIONS: staging is its own record, beside production's.
      const both = await records(ctx)
      expect(both.iamRegistration).toMatchObject({
        environment: 'production',
        state: 'submitted',
      })
      expect(both.stagingRegistration).toMatchObject({
        environment: 'staging',
        state: 'active',
      })
      expect(both.stagingRegistration?.id).not.toBe(both.iamRegistration?.id)
    })
  })

  it('the privacy assessment: sent with an answer to every gap, kept on the record; the team submits it with the PIA number', async () => {
    await withProjectServer(async (ctx) => {
      await withAssessmentDraft(ctx.db, { projectId: ctx.projectId })
      const answers = await answersFor(ctx)
      const sent = await send(
        ctx,
        'privacy-assessment',
        { answers },
        { cookies: ctx.ownerCookies },
      )
      expect(sent.statusCode, sent.body).toBe(200)
      expect(sent.json()).toMatchObject({
        state: 'sent',
        sentBy: { displayName: 'Bio Prof' },
        gapAnswers: answers,
        submittedAt: null,
      })
      const admin = await loginAs(ctx.deps, 'platform_admin')
      const submitted = await teamSubmits(
        ctx,
        'privacy-assessment',
        { reference: 'PIA-2026-0101' },
        { cookies: admin },
      )
      expect(submitted.statusCode, submitted.body).toBe(200)
      const submittedAt = vancouverNoon(vancouverToday()).toISOString()
      expect(submitted.json()).toMatchObject({
        state: 'submitted',
        submittedAt,
        submittedBy: { displayName: 'Platform Admin' },
        externalTicketRef: 'PIA-2026-0101',
        gapAnswers: answers,
      })
      const item = (await readiness(ctx)).items.find(
        (i) => i.id === 'privacy-assessment',
      )!
      expect(item).toMatchObject({ state: 'unmet', since: submittedAt })
    })
  })

  it('refuses a send with no draft — 409 LAUNCH_DRAFT_REQUIRED', async () => {
    await withProjectServer(async (ctx) => {
      await piaApproved(ctx)
      const refused = await send(ctx, 'staging', {}, { cookies: ctx.ownerCookies })
      expect(refusal(refused)).toEqual({ status: 409, code: 'LAUNCH_DRAFT_REQUIRED' })
      expect((await records(ctx)).stagingRegistration).toBeNull()
      // THE POSITIVE CONTROL: the same request once the draft exists.
      await withDraft(ctx.db, { projectId: ctx.projectId, environment: 'staging' })
      const sent = await send(ctx, 'staging', {}, { cookies: ctx.ownerCookies })
      expect(refusal(sent)).toEqual({ status: 200, code: undefined })
    })
  })

  it('the answers: more than 64, or one over 2,000 characters, refused by the schema — 400 REQUEST_INVALID; one gap left out, or an empty answer — 400 LAUNCH_GAP_ANSWERS_INVALID; nothing written', async () => {
    await withProjectServer(async (ctx) => {
      await withAssessmentDraft(ctx.db, { projectId: ctx.projectId })
      const answers = await answersFor(ctx)
      const as = { cookies: ctx.ownerCookies }
      const tooMany = Array.from({ length: 65 }, (_, i) => ({
        gapId: `collected.extra-${i}`,
        answer: 'x',
      }))
      expect(
        refusal(await send(ctx, 'privacy-assessment', { answers: tooMany }, as)),
      ).toEqual({
        status: 400,
        code: 'REQUEST_INVALID',
      })
      const tooLong = [{ ...answers[0]!, answer: 'x'.repeat(2_001) }, ...answers.slice(1)]
      expect(
        refusal(await send(ctx, 'privacy-assessment', { answers: tooLong }, as)),
      ).toEqual({
        status: 400,
        code: 'REQUEST_INVALID',
      })
      expect(refusal(await send(ctx, 'privacy-assessment', {}, as))).toEqual({
        status: 400,
        code: 'REQUEST_INVALID',
      })
      const missing = await send(
        ctx,
        'privacy-assessment',
        { answers: answers.slice(1) },
        as,
      )
      expect(refusal(missing)).toEqual({
        status: 400,
        code: 'LAUNCH_GAP_ANSWERS_INVALID',
      })
      expect((missing.json() as { error: { message: string } }).error.message).toContain(
        answers[0]!.gapId,
      )
      // AN EMPTY ANSWER IS A BLANK ONE (the whole-branch review's I2): the one refusal, naming the gap, as a
      // whitespace one is — never the schema's REQUEST_INVALID, which names no gap.
      const empty = await send(
        ctx,
        'privacy-assessment',
        { answers: [{ ...answers[0]!, answer: '' }, ...answers.slice(1)] },
        as,
      )
      expect(refusal(empty)).toEqual({ status: 400, code: 'LAUNCH_GAP_ANSWERS_INVALID' })
      expect((empty.json() as { error: { message: string } }).error.message).toContain(
        `a blank answer for ${answers[0]!.gapId}`,
      )
      expect((await records(ctx)).privacyAssessment).toMatchObject({
        state: 'draft',
        sentAt: null,
        gapAnswers: null,
      })
      expect(toldTeam(ctx)).toEqual([])
      // THE POSITIVE CONTROL: every gap answered, 2,000 characters at most.
      const exact = [{ ...answers[0]!, answer: 'y'.repeat(2_000) }, ...answers.slice(1)]
      expect(
        refusal(await send(ctx, 'privacy-assessment', { answers: exact }, as)),
      ).toEqual({
        status: 200,
        code: undefined,
      })
    })
  })

  it('the team’s day: after today, or before the owner sent it — 400 LAUNCH_SENT_AT_INVALID; not a day, or no reference — 400 REQUEST_INVALID', async () => {
    await withProjectServer(async (ctx) => {
      await piaApproved(ctx)
      await withDraft(ctx.db, { projectId: ctx.projectId, environment: 'staging' })
      expect(
        (await send(ctx, 'staging', {}, { cookies: ctx.ownerCookies })).statusCode,
      ).toBe(200)
      const admin = { cookies: await loginAs(ctx.deps, 'platform_admin') }
      const submit = (body: Json) => teamSubmits(ctx, 'staging', body, admin)
      expect(
        refusal(await submit({ sentAt: vancouverDaysAgo(-2), reference: 'I-1' })),
      ).toEqual({
        status: 400,
        code: 'LAUNCH_SENT_AT_INVALID',
      })
      // Sent today, so yesterday is before the owner's send.
      expect(
        refusal(await submit({ sentAt: vancouverDaysAgo(1), reference: 'I-1' })),
      ).toEqual({
        status: 400,
        code: 'LAUNCH_SENT_AT_INVALID',
      })
      for (const sentAt of ['last Tuesday', '2026-02-30', '2026-00-15'])
        expect(refusal(await submit({ sentAt, reference: 'I-1' })), sentAt).toEqual({
          status: 400,
          code: 'REQUEST_INVALID',
        })
      expect(refusal(await submit({}))).toEqual({ status: 400, code: 'REQUEST_INVALID' })
      expect((await records(ctx)).stagingRegistration).toMatchObject({ state: 'sent' })
      // Positive control: today, with UBC's reference.
      expect(
        refusal(await submit({ sentAt: vancouverToday(), reference: 'I-1' })),
      ).toEqual({
        status: 200,
        code: undefined,
      })
    })
  })

  it('a token is refused all six — 403 TOKEN_CREDENTIAL_REFUSED; a collaborator may send; only an administrator submits or hands back — 403 FORBIDDEN', async () => {
    await withProjectServer(async (ctx) => {
      await piaApproved(ctx)
      await withDraft(ctx.db, { projectId: ctx.projectId, environment: 'staging' })
      await withAssessmentDraft(ctx.db, { projectId: ctx.projectId })
      const answers = await answersFor(ctx)
      const owner = await ensureTestUser(ctx.db, 'bio_prof')
      // A token row HOLDING both capabilities — written directly, since the mint route refuses them.
      const { plaintext } = await mintTestToken(ctx.db, {
        userId: owner.id,
        projectId: ctx.projectId,
        capabilities: ['project:read', 'launch:submit', 'launch:record'],
      })
      const token = { bearer: plaintext }
      const TOKEN = { status: 403, code: 'TOKEN_CREDENTIAL_REFUSED' }
      expect(refusal(await send(ctx, 'staging', {}, token))).toEqual(TOKEN)
      expect(refusal(await send(ctx, 'privacy-assessment', { answers }, token))).toEqual(
        TOKEN,
      )
      for (const what of ['staging', 'privacy-assessment'] as const) {
        expect(
          refusal(await teamSubmits(ctx, what, { reference: 'X-1' }, token)),
        ).toEqual(TOKEN)
        expect(refusal(await handsBack(ctx, what, token))).toEqual(TOKEN)
      }
      const before = await records(ctx)
      expect(before.stagingRegistration).toMatchObject({ state: 'draft' })
      expect(before.privacyAssessment).toMatchObject({ state: 'approved' })
      // A COLLABORATOR may send — `launch:submit` is every member's.
      const collaborator = await sessionFor(ctx, 'bio_colleague', 'collaborator')
      const sent = await send(ctx, 'staging', {}, { cookies: collaborator })
      expect(sent.statusCode, sent.body).toBe(200)
      expect(sent.json()).toMatchObject({ sentBy: { displayName: 'Bio Colleague' } })
      // THE OWNER AND A COLLABORATOR may not record the team's step: it is an administrator's.
      for (const who of [ctx.ownerCookies, collaborator]) {
        expect(
          refusal(
            await teamSubmits(ctx, 'staging', { reference: 'X-2' }, { cookies: who }),
          ),
        ).toEqual({ status: 403, code: 'FORBIDDEN' })
        expect(refusal(await handsBack(ctx, 'staging', { cookies: who }))).toEqual({
          status: 403,
          code: 'FORBIDDEN',
        })
      }
      expect((await records(ctx)).stagingRegistration).toMatchObject({ state: 'sent' })
      // THE POSITIVE CONTROL: an administrator hands it back.
      const admin = { cookies: await loginAs(ctx.deps, 'platform_admin') }
      expect(refusal(await handsBack(ctx, 'staging', admin))).toEqual({
        status: 200,
        code: undefined,
      })
    })
  })

  it('a stranger is answered 404 NOT_FOUND, and learns nothing', async () => {
    await withProjectServer(async (ctx) => {
      await withDraft(ctx.db, { projectId: ctx.projectId, environment: 'staging' })
      const stranger = { cookies: await sessionFor(ctx, 'unrelated_user') }
      expect(refusal(await send(ctx, 'staging', {}, stranger))).toEqual({
        status: 404,
        code: 'NOT_FOUND',
      })
      expect(
        refusal(await teamSubmits(ctx, 'staging', { reference: 'X' }, stranger)),
      ).toEqual({
        status: 404,
        code: 'NOT_FOUND',
      })
    })
  })

  it('UBC’s order — both registrations wait for the assessment, production for staging too — and each refusal names its code', async () => {
    await withProjectServer(async (ctx) => {
      await withDraft(ctx.db, { projectId: ctx.projectId, environment: 'staging' })
      await withDraft(ctx.db, { projectId: ctx.projectId, environment: 'production' })
      const as = { cookies: ctx.ownerCookies }
      expect(refusal(await send(ctx, 'staging', {}, as))).toEqual({
        status: 409,
        code: 'LAUNCH_PIA_NOT_APPROVED',
      })
      expect(refusal(await send(ctx, 'production', {}, as))).toEqual({
        status: 409,
        code: 'LAUNCH_PIA_NOT_APPROVED',
      })
      await piaApproved(ctx)
      expect(refusal(await send(ctx, 'production', {}, as))).toEqual({
        status: 409,
        code: 'LAUNCH_STAGING_NOT_REGISTERED',
      })
      expect(refusal(await send(ctx, 'staging', {}, as))).toEqual({
        status: 409,
        code: 'LAUNCH_DRAFT_STALE',
      })
      await withDraft(ctx.db, { projectId: ctx.projectId, environment: 'staging' })
      await withDraft(ctx.db, { projectId: ctx.projectId, environment: 'production' })
      expect(refusal(await send(ctx, 'staging', {}, as))).toEqual({
        status: 200,
        code: undefined,
      })
      // Sent is not registered: production still waits.
      expect(refusal(await send(ctx, 'production', {}, as))).toEqual({
        status: 409,
        code: 'LAUNCH_STAGING_NOT_REGISTERED',
      })
      const admin = { cookies: await loginAs(ctx.deps, 'platform_admin') }
      await teamSubmits(ctx, 'staging', { reference: 'IAM-S' }, admin)
      await adminRecords(ctx, 'iam-registration', {
        ...IAM_BODY(ctx, 'staging'),
        environment: 'staging',
        state: 'active',
      })
      expect(refusal(await send(ctx, 'production', {}, as))).toEqual({
        status: 200,
        code: undefined,
      })
    })
  })

  it('a second send, a submission or hand-back of what the team does not hold — 409 LAUNCH_TRANSITION_INVALID', async () => {
    await withProjectServer(async (ctx) => {
      await withAssessmentDraft(ctx.db, { projectId: ctx.projectId })
      const answers = await answersFor(ctx)
      const as = { cookies: ctx.ownerCookies }
      const admin = { cookies: await loginAs(ctx.deps, 'platform_admin') }
      const TRANSITION = { status: 409, code: 'LAUNCH_TRANSITION_INVALID' }
      expect(
        refusal(await teamSubmits(ctx, 'privacy-assessment', { reference: 'P' }, admin)),
      ).toEqual(TRANSITION)
      expect(refusal(await handsBack(ctx, 'privacy-assessment', admin))).toEqual(
        TRANSITION,
      )
      expect(refusal(await send(ctx, 'privacy-assessment', { answers }, as)).status).toBe(
        200,
      )
      expect(refusal(await send(ctx, 'privacy-assessment', { answers }, as))).toEqual(
        TRANSITION,
      )
    })
  })

  it('the administrator’s record never reaches `sent` — the schema refuses it, 400 REQUEST_INVALID — and never leaves it, 409 LAUNCH_TRANSITION_INVALID', async () => {
    await withProjectServer(async (ctx) => {
      await piaApproved(ctx)
      const draft = await withDraft(ctx.db, {
        projectId: ctx.projectId,
        environment: 'staging',
      })
      const admin = await loginAs(ctx.deps, 'platform_admin')
      const record = (state: string) =>
        ctx.app.inject({
          method: 'POST',
          url: `/v1/projects/${ctx.projectId}/launch-records/iam-registration`,
          payload: {
            environment: 'staging',
            entityId: draft.entityId,
            acsUrl: draft.acsUrl,
            sloUrl: draft.sloUrl,
            registeredAttributes: ['ubcEduCwlPuid', 'mail'],
            state,
          },
          cookies: admin,
          headers: mutationHeaders(ctx.deps),
        })
      expect(refusal(await record('sent'))).toEqual({
        status: 400,
        code: 'REQUEST_INVALID',
      })
      expect(
        (await send(ctx, 'staging', {}, { cookies: ctx.ownerCookies })).statusCode,
      ).toBe(200)
      const out = await record('active')
      expect(refusal(out)).toEqual({ status: 409, code: 'LAUNCH_TRANSITION_INVALID' })
      expect((out.json() as { error: { message: string } }).error.message).toMatch(
        /submitIamRegistration/,
      )
      expect((await records(ctx)).stagingRegistration).toMatchObject({ state: 'sent' })
    })
  })

  it('handed back and sent again: the team’s day is bounded by the SECOND send, and it waits from it (Review Focus 1)', async () => {
    await withProjectServer(async (ctx) => {
      await withAssessmentDraft(ctx.db, { projectId: ctx.projectId })
      const answers = await answersFor(ctx)
      const as = { cookies: ctx.ownerCookies }
      const admin = { cookies: await loginAs(ctx.deps, 'platform_admin') }
      expect((await send(ctx, 'privacy-assessment', { answers }, as)).statusCode).toBe(
        200,
      )
      // The first send was four days ago; handed back; sent again today.
      await ctx.db
        .update(privacyAssessments)
        .set({ sentAt: new Date(Date.now() - 4 * 86_400_000) })
        .where(eq(privacyAssessments.projectId, ctx.projectId))
      const back = await handsBack(ctx, 'privacy-assessment', admin)
      expect(back.statusCode, back.body).toBe(200)
      expect(back.json()).toMatchObject({ state: 'draft' })
      const again = await send(
        ctx,
        'privacy-assessment',
        { answers: await answersFor(ctx, 'the second answer') },
        as,
      )
      expect(again.statusCode, again.body).toBe(200)
      expect(
        (again.json() as { gapAnswers: { answer: string }[] }).gapAnswers[0]!.answer,
      ).toBe('the second answer')
      expect(
        refusal(
          await teamSubmits(
            ctx,
            'privacy-assessment',
            { sentAt: vancouverDaysAgo(2), reference: 'P-1' },
            admin,
          ),
        ),
      ).toEqual({ status: 400, code: 'LAUNCH_SENT_AT_INVALID' })
      expect(
        refusal(
          await teamSubmits(ctx, 'privacy-assessment', { reference: 'P-1' }, admin),
        ),
      ).toEqual({ status: 200, code: undefined })
      // Told twice — once per send — and never of the hand-back.
      expect(toldTeam(ctx).map((n) => n.kind)).toEqual(['record-sent', 'record-sent'])
    })
  })

  it('an email that cannot be delivered never undoes the send — 200, sent, and one operator line', async () => {
    const lines: unknown[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((line: unknown) => {
      lines.push(line)
    })
    try {
      const mailer = createMailer(MAIL_CONFIG, {
        sendMail: async () => {
          throw Object.assign(new Error('refused'), { code: 'ESOCKET' })
        },
      } as never)
      await withProjectServer(
        async (ctx) => {
          await piaApproved(ctx)
          await withDraft(ctx.db, { projectId: ctx.projectId, environment: 'staging' })
          const sent = await send(ctx, 'staging', {}, { cookies: ctx.ownerCookies })
          expect(sent.statusCode, sent.body).toBe(200)
          await mailer.settled()
          expect((await records(ctx)).stagingRegistration).toMatchObject({
            state: 'sent',
          })
          const mailLines = lines
            .map((l) => String(l))
            .filter((l) => l.includes('the Manifest team could not be emailed'))
          expect(mailLines).toHaveLength(1)
          expect(JSON.parse(mailLines[0]!)).toMatchObject({
            notice: 'record-sent',
            projectId: ctx.projectId,
            error: 'ESOCKET',
          })
        },
        { mailer },
      )
    } finally {
      spy.mockRestore()
    }
  })
})

describe('UBC’s answers stay an administrator’s record (Task 9)', () => {
  it('an owner cannot record UBC’s answer — 403 FORBIDDEN, and is told an administrator records it', async () => {
    await withProjectServer(async (ctx) => {
      const res = await ctx.app.inject({
        method: 'POST',
        url: `/v1/projects/${ctx.projectId}/launch-records/iam-registration`,
        payload: { ...IAM_BODY(ctx, 'production'), state: 'submitted' },
        cookies: ctx.ownerCookies,
        headers: mutationHeaders(ctx.deps),
      })
      expect(refusal(res)).toEqual({ status: 403, code: 'FORBIDDEN' })
      // `[M8]`: an owner cannot be granted this by any project owner, so the hint says who can.
      const hint = (res.json() as { error: { hint?: string } }).error.hint
      expect(hint).toMatch(/platform administrator/)
      expect(hint).not.toMatch(/project owner/)
    })
  })

  it('the administrator’s record route is unchanged, defaults to production, and records staging when asked', async () => {
    await withProjectServer(async (ctx) => {
      const production = await adminRecords(ctx, 'iam-registration', {
        ...IAM_BODY(ctx, 'production'),
        state: 'submitted',
        externalTicketRef: 'IAM-1',
      })
      expect(production).toMatchObject({ environment: 'production', state: 'submitted' })
      expect((await records(ctx)).stagingRegistration).toBeNull()
      const staging = await adminRecords(ctx, 'iam-registration', {
        ...IAM_BODY(ctx, 'staging'),
        environment: 'staging',
        state: 'submitted',
        externalTicketRef: 'IAM-2',
      })
      expect(staging).toMatchObject({
        environment: 'staging',
        externalTicketRef: 'IAM-2',
      })
      const both = await records(ctx)
      expect(both.iamRegistration).toMatchObject({ externalTicketRef: 'IAM-1' })
      expect(both.stagingRegistration).toMatchObject({ externalTicketRef: 'IAM-2' })
      // The administrator who recorded the move into `submitted` is who the record names.
      expect(both.iamRegistration?.submittedBy).toMatchObject({
        displayName: 'Platform Admin',
      })
    })
  })
})

/**
 * THE SUBMISSION AND WHAT IT READS ARE ONE DECISION (the whole-branch review's I1). Each was a read,
 * a check, then an UPDATE by id — so a write landing between them was overwritten (a second "I've sent
 * it" moving the day the clock started) or let a submission through a gate that had just closed.
 * DETERMINISTIC, as `api/members.test.ts`'s: a second connection holds the row the submission reads,
 * the submission is sent, and the holder changes the row and COMMITS once the submission is seen
 * waiting on it. Each case's positive control is the earlier tests' same submission, unheld.
 */
describe('a send and an administrator’s write cannot interleave (the whole-branch review’s I1)', () => {
  it('a registration moved to submitted while the owner’s send waits is not sent — 409 LAUNCH_TRANSITION_INVALID, the first stamp kept', async () => {
    await withProjectServer(async (ctx) => {
      await piaApproved(ctx)
      const draft = await withDraft(ctx.db, {
        projectId: ctx.projectId,
        environment: 'staging',
      })
      const first = '2026-09-01T19:00:00.000Z'
      let answered: Awaited<ReturnType<typeof send>> | undefined
      await holdingThen(
        'SELECT 1 FROM iam_registrations WHERE id = $1 FOR UPDATE',
        [draft.id],
        // What an administrator's record of the request does in the window.
        `UPDATE iam_registrations SET state = 'submitted', submitted_at = '${first}' WHERE id = '${draft.id}'`,
        async (lock) => {
          const submitting = send(ctx, 'staging', {}, { cookies: ctx.ownerCookies })
          await until(
            () => lock.waitedOn('%iam_registrations%'),
            'the submission waiting on the held registration',
          )
          await lock.commit()
          answered = await submitting
        },
      )
      expect(refusal(answered!)).toEqual({
        status: 409,
        code: 'LAUNCH_TRANSITION_INVALID',
      })
      const staging = (await records(ctx)).stagingRegistration
      expect(staging).toMatchObject({ state: 'submitted', submittedAt: first })
      expect(await eventCount(ctx, 'iam_registration.sent')).toBe(0)
    })
  })

  it('an assessment moved back to draft while the staging send waits refuses it — 409 LAUNCH_PIA_NOT_APPROVED', async () => {
    await withProjectServer(async (ctx) => {
      await piaApproved(ctx)
      await withDraft(ctx.db, { projectId: ctx.projectId, environment: 'staging' })
      let answered: Awaited<ReturnType<typeof send>> | undefined
      await holdingThen(
        'SELECT 1 FROM privacy_assessments WHERE project_id = $1 FOR UPDATE',
        [ctx.projectId],
        // An administrator recording the Privacy Office reopening it (`approved → draft`).
        `UPDATE privacy_assessments SET state = 'draft', approved_at = NULL WHERE project_id = '${ctx.projectId}'`,
        async (lock) => {
          const submitting = send(ctx, 'staging', {}, { cookies: ctx.ownerCookies })
          await until(
            () => lock.waitedOn('%privacy_assessments%'),
            'the submission’s read of the assessment waiting on the held assessment',
          )
          await lock.commit()
          answered = await submitting
        },
      )
      expect(refusal(answered!)).toEqual({ status: 409, code: 'LAUNCH_PIA_NOT_APPROVED' })
      expect((await records(ctx)).stagingRegistration).toMatchObject({ state: 'draft' })
    })
  })

  it('an assessment sent while an administrator’s record of it waits is not overwritten — 409 LAUNCH_TRANSITION_INVALID, still with the team (the whole-branch review’s m5)', async () => {
    await withProjectServer(async (ctx) => {
      await withAssessmentDraft(ctx.db, { projectId: ctx.projectId })
      const admin = await loginAs(ctx.deps, 'platform_admin')
      let answered: Awaited<ReturnType<typeof ctx.app.inject>> | undefined
      await holdingThen(
        'SELECT 1 FROM privacy_assessments WHERE project_id = $1 FOR UPDATE',
        [ctx.projectId],
        // The owner's send to the Manifest team, in the window.
        `UPDATE privacy_assessments SET state = 'sent', sent_at = now(), sent_by = '${ctx.userId}', gap_answers = '[]'::jsonb WHERE project_id = '${ctx.projectId}'`,
        async (lock) => {
          // An administrator's direct record, `draft → submitted` (Decision 4 keeps it).
          const recording = ctx.app.inject({
            method: 'POST',
            url: `/v1/projects/${ctx.projectId}/launch-records/privacy-assessment`,
            payload: { state: 'submitted', externalTicketRef: 'PIA-RACE' },
            cookies: admin,
            headers: mutationHeaders(ctx.deps),
          })
          await until(
            () => lock.waitedOn('%privacy_assessments%'),
            'the administrator’s record waiting on the held assessment',
          )
          await lock.commit()
          answered = await recording
        },
      )
      expect(refusal(answered!)).toEqual({
        status: 409,
        code: 'LAUNCH_TRANSITION_INVALID',
      })
      expect((await records(ctx)).privacyAssessment).toMatchObject({
        state: 'sent',
        submittedAt: null,
      })
      expect(await eventCount(ctx, 'privacy_assessment.recorded')).toBe(0)
    })
  })
})

describe('an administrator’s record keeps the team’s reference (the whole-branch review’s M2)', () => {
  it('recording UBC’s answer without a ticket keeps the reference the team submitted with; one given replaces it', async () => {
    await withProjectServer(async (ctx) => {
      await withAssessmentDraft(ctx.db, { projectId: ctx.projectId })
      const answers = await answersFor(ctx)
      const sent = await send(
        ctx,
        'privacy-assessment',
        { answers },
        { cookies: ctx.ownerCookies },
      )
      expect(sent.statusCode, sent.body).toBe(200)
      const admin = { cookies: await loginAs(ctx.deps, 'platform_admin') }
      const submitted = await teamSubmits(
        ctx,
        'privacy-assessment',
        { reference: 'PIA-2026-0101' },
        admin,
      )
      expect(submitted.statusCode, submitted.body).toBe(200)
      const approved = await adminRecords(ctx, 'privacy-assessment', {
        state: 'approved',
      })
      // Kept — so the staging gate still finds the PIA number the team recorded.
      expect(approved).toMatchObject({
        state: 'approved',
        externalTicketRef: 'PIA-2026-0101',
      })
      const replaced = await adminRecords(ctx, 'privacy-assessment', {
        state: 'approved',
        externalTicketRef: 'PIA-2026-0102',
      })
      expect(replaced).toMatchObject({ externalTicketRef: 'PIA-2026-0102' })
    })
  })
})

/**
 * D19'S REGISTRATION PACKAGE THROUGH THE ROUTE (the launch path plan's Task 10; Spec action 4): a CWL
 * app's owner — or an agent on their token — drafts the staging or production registration, and
 * Manifest generates what UBC IAM receives: the environment's entity and URLs, its own certificate,
 * every attribute with where the app reads it, the contacts and the PIA number. Over `cwlFakes`, for
 * their reason — and since Task 10 its registrar keeps the keypair where the real one does, so the
 * certificate it registers is the environment's own.
 */
interface CwlProject {
  app: Awaited<ReturnType<typeof buildServer>>
  deps: ServerDeps
  ownerCookies: Record<string, string>
  project: {
    id: string
    slug: string
    environments: { id: string; kind: string; hostname: string }[]
  }
  /** The commit the CWL manifest was validated at — the newest valid manifest's. */
  commitSha: string
}

/** The app's own reads, which the search must find exactly: `routes/people.js:3`, `public/app.js:2`. */
const APP_CODE = {
  'routes/people.js': [
    '// Who is signed in: the friendly names the blueprint’s bridge gives the app.',
    'export function whoIs(req) {',
    '  return { id: req.user.user.ubcEduCwlPuid, name: req.user.user.givenName }',
    '}',
    '',
  ].join('\n'),
  'public/app.js': [
    "const me = await (await fetch('/me')).json()",
    "document.title = me.attributes?.mail ?? 'someone'",
    '',
  ].join('\n'),
}

/** A CWL app on `node-ts-mongo@1`, created through the route by its owner (who may build). */
async function withCwlProject(
  attributes: readonly string[],
  fn: (ctx: CwlProject) => Promise<void>,
  options: { deps?: (deps: ServerDeps) => ServerDeps } = {},
): Promise<void> {
  await resetDatabase()
  const base = await testDeps()
  const withFakes: ServerDeps = { ...base, ...cwlFakes(base) }
  const deps = options.deps === undefined ? withFakes : options.deps(withFakes)
  const app = await buildServer(deps)
  try {
    // The oldest administrator is the platform's contact when none is configured.
    await ensureTestUser(deps.db, 'platform_admin')
    const ownerCookies = await loginAs(deps, 'bio_prof')
    const slug = `cwl-${randomUUID().slice(0, 8)}`
    const created = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      payload: projectBody(slug, { blueprint: 'node-ts-mongo@1' }),
      cookies: ownerCookies,
      headers: mutationHeaders(deps),
    })
    if (created.statusCode !== 201)
      throw new Error(
        `creating '${slug}' answered ${created.statusCode}: ${created.body}`,
      )
    const project = created.json() as CwlProject['project']
    await writeFiles(
      deps.source,
      deps.source.repositoryFor(slug),
      APP_CODE,
      'feat: who is signed in',
    )
    const { commitSha } = await commitManifest(
      { app, deps, cookies: ownerCookies, project },
      cwlManifest(slug, attributes),
      'feat: sign in with CWL',
    )
    await fn({ app, deps, ownerCookies, project, commitSha })
  } finally {
    await deps.builds.idle()
    await app.close()
  }
}

const hostOf = (ctx: CwlProject, kind: 'staging' | 'production') =>
  ctx.project.environments.find((e) => e.kind === kind)!.hostname

function draft(
  ctx: CwlProject,
  environment: 'staging' | 'production',
  credentials: { cookies?: Record<string, string>; bearer?: string } = {
    cookies: ctx.ownerCookies,
  },
) {
  return ctx.app.inject({
    method: 'POST',
    url: `/v1/projects/${ctx.project.id}/launch-records/iam-registration/${environment}/draft`,
    ...(credentials.cookies === undefined ? {} : { cookies: credentials.cookies }),
    headers: {
      ...mutationHeaders(ctx.deps),
      ...(credentials.bearer === undefined
        ? {}
        : { authorization: `Bearer ${credentials.bearer}` }),
    },
  })
}

/** A POST that must answer `expected` — a fixture step, which throws rather than asserting. */
async function post(
  ctx: CwlProject,
  url: string,
  payload: Record<string, unknown>,
  cookies: Record<string, string>,
  expected = 200,
): Promise<Json> {
  const res = await ctx.app.inject({
    method: 'POST',
    url,
    payload,
    cookies,
    headers: mutationHeaders(ctx.deps),
  })
  if (res.statusCode !== expected)
    throw new Error(`POST ${url} answered ${res.statusCode}: ${res.body}`)
  return res.json() as Json
}

/** The CWL app built, released and deployed to staging — which makes it the launch candidate. */
async function stage(ctx: CwlProject): Promise<void> {
  const started = await post(
    ctx,
    `/v1/projects/${ctx.project.id}/builds`,
    {},
    ctx.ownerCookies,
    202,
  )
  await ctx.deps.builds.idle()
  const release = await post(
    ctx,
    `/v1/projects/${ctx.project.id}/releases`,
    { buildId: started.id },
    ctx.ownerCookies,
    201,
  )
  const staging = ctx.project.environments.find((e) => e.kind === 'staging')!
  const staged = await post(
    ctx,
    `/v1/environments/${staging.id}/deploy`,
    { releaseId: release.id },
    ctx.ownerCookies,
  )
  if (staged.state !== 'healthy') throw new Error(`staging is ${String(staged.state)}`)
}

async function cwlRecords(ctx: CwlProject) {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/v1/projects/${ctx.project.id}/launch-records`,
    cookies: ctx.ownerCookies,
  })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as {
    iamRegistration: Json | null
    stagingRegistration: Json | null
    privacyAssessment: Json | null
  }
}

async function cwlPiaApproved(ctx: CwlProject): Promise<void> {
  const admin = await loginAs(ctx.deps, 'platform_admin')
  for (const state of ['submitted', 'approved'] as const)
    await post(
      ctx,
      `/v1/projects/${ctx.project.id}/launch-records/privacy-assessment`,
      { state, reviewer: 'K. Privacy', externalTicketRef: 'PIA-2026-0088' },
      admin,
    )
}

/** The owner's send of the staging registration to the Manifest team. */
const cwlSendStaging = (ctx: CwlProject, body: Json = {}) =>
  ctx.app.inject({
    method: 'POST',
    url: `/v1/projects/${ctx.project.id}/launch-records/iam-registration/staging/send`,
    payload: body,
    cookies: ctx.ownerCookies,
    headers: mutationHeaders(ctx.deps),
  })

/** Every audit row of one type for the project, oldest first. */
const eventsOf = (ctx: CwlProject, type: string) =>
  ctx.deps.db
    .select()
    .from(events)
    .where(and(eq(events.projectId, ctx.project.id), eq(events.type, type)))
    .orderBy(asc(events.createdAt))

interface Pkg {
  environment: string
  generatedAt: string
  fromCommit: string
  entityId: string
  acsUrl: string
  sloUrl: string
  certificate: { pem: string; fingerprint: string; expiresAt: string }
  attributes: {
    name: string
    oid: string
    purpose: string
    usedAt: { path: string; line: number }[]
    justification: string
    unused: boolean
  }[]
  usedAtTruncated: boolean
  contacts: {
    technical: { name: string; email: string }[]
    support: { name: string; email: string }[]
  }
  privacyAssessmentReference: string | null
  metadataXml: string
  warnings: string[]
}
const packageOf = (body: unknown) => (body as { package: Pkg }).package

const NO_PIA_NUMBER =
  'The privacy assessment’s PIA number is not recorded yet, and UBC IAM asks for it. Once an administrator records the assessment approved with its number, draft this again so the package carries it.'
const NO_CANDIDATE =
  'Nothing is serving staging yet, so this is drawn from the newest valid manifest. Production’s registration should describe the release you will launch: once it serves staging, draft this again.'
const PRIVATE_KEY = /-----BEGIN (RSA )?PRIVATE KEY/

describe('D19’s registration package (Task 10)', () => {
  it('drafts the staging package: staging’s entity, the certificate staging registers with, a justification per attribute', async () => {
    await withCwlProject(['ubcEduCwlPuid', 'mail', 'givenName'], async (ctx) => {
      const res = await draft(ctx, 'staging')
      expect(res.statusCode, res.body).toBe(200)
      const staging = hostOf(ctx, 'staging')
      const entityId = `${ctx.deps.config.idp.spEntityBase}/sp/${ctx.project.slug}/staging`
      const urls = {
        entityId,
        acsUrl: `https://${staging}/auth/ubcshib/callback`,
        sloUrl: `https://${staging}/auth/logout`,
      }
      expect(res.json()).toMatchObject({
        environment: 'staging',
        state: 'draft',
        ...urls,
        // A draft registers nothing: UBC has not answered.
        registeredAttributes: [],
        registeredAt: null,
        submittedAt: null,
      })
      const pkg = packageOf(res.json())
      expect(pkg).toMatchObject({
        environment: 'staging',
        ...urls,
        fromCommit: ctx.commitSha,
        usedAtTruncated: false,
        privacyAssessmentReference: null,
        warnings: [NO_PIA_NUMBER],
        contacts: {
          technical: [{ name: 'Bio Prof', email: 'bio_prof@example.ubc.ca' }],
          support: [{ name: 'Platform Admin', email: 'platform_admin@example.ubc.ca' }],
        },
      })
      // Where the APP reads each one — never the blueprint's own bridge (its auth/attributes.js
      // reads `.ubcEduCwlPuid` itself, and is skipped).
      expect(pkg.attributes.map((a) => [a.name, a.usedAt, a.unused])).toEqual([
        ['ubcEduCwlPuid', [{ path: 'routes/people.js', line: 3 }], false],
        ['mail', [{ path: 'public/app.js', line: 2 }], false],
        ['givenName', [{ path: 'routes/people.js', line: 3 }], false],
      ])
      expect(pkg.attributes[1]!.justification).toMatch(
        /shows it to the person in the browser, in public\/app\.js:2\.$/,
      )
      // Staging's names only: production's entity and hostname appear nowhere in it.
      const whole = JSON.stringify(pkg)
      expect(whole).not.toContain(`/sp/${ctx.project.slug}/production`)
      expect(whole).not.toContain(`//${hostOf(ctx, 'production')}`)
      expect(pkg.metadataXml).toContain(`entityID="${entityId}"`)
      // The certificate is a real one, for this entity, and its fingerprint is its own.
      const cert = new X509Certificate(pkg.certificate.pem)
      expect(cert.fingerprint256).toBe(pkg.certificate.fingerprint)
      expect(cert.subjectAltName).toBe(`URI:${entityId}`)
      // Kept on the record, and announced without the attributes themselves.
      expect(packageOf((await cwlRecords(ctx)).stagingRegistration)).toEqual(pkg)
      const drafted = await eventsOf(ctx, 'iam_registration.drafted')
      expect(drafted.map((e) => e.machineDetail)).toEqual([
        {
          environment: 'staging',
          entityId,
          fromCommit: ctx.commitSha,
          attributeCount: 3,
          unusedCount: 0,
        },
      ])
      expect(drafted[0]!.humanMessage).toBe(
        "Bio Prof drafted this app's staging registration for UBC IAM, asking for 3 attribute(s).",
      )
    })
  })

  it('a package’s certificate is the one the environment registers with', async () => {
    await withCwlProject(['ubcEduCwlPuid', 'mail'], async (ctx) => {
      const drafted = packageOf((await draft(ctx, 'staging')).json()).certificate
      await stage(ctx)
      const registered = await eventsOf(ctx, 'sso.registered')
      const staging = registered.filter(
        (e) => e.subject === `sp:${ctx.project.slug}:staging`,
      )
      expect(staging).toHaveLength(1)
      expect(
        (staging[0]!.machineDetail as { certificateFingerprint: string })
          .certificateFingerprint,
      ).toBe(drafted.fingerprint)
      // Drafted again, the same certificate: the environment's keypair is made once (D20).
      expect(packageOf((await draft(ctx, 'staging')).json()).certificate).toEqual(drafted)
      // And production's is its own — a compromise is contained to one environment.
      const production = packageOf((await draft(ctx, 'production')).json()).certificate
      expect(production.fingerprint).not.toBe(drafted.fingerprint)
    })
  })

  it('an attribute the app never reads is flagged unused, with a warning to remove it before sending', async () => {
    await withCwlProject(['ubcEduCwlPuid', 'mail', 'sn'], async (ctx) => {
      const pkg = packageOf((await draft(ctx, 'staging')).json())
      expect(pkg.attributes.find((a) => a.name === 'sn')).toMatchObject({
        unused: true,
        usedAt: [],
        justification:
          'The app asks for it and does not read it anywhere Manifest looked — remove it from `auth.attributes` before you send this.',
      })
      expect(pkg.warnings).toContain(
        'The app asks for sn and does not read it anywhere Manifest looked. Remove it from auth.attributes, validate the manifest and draft this again before you send it — UBC IAM asks why an app needs each attribute.',
      )
      // The positive control: what the app reads is not flagged.
      expect(pkg.attributes.find((a) => a.name === 'mail')!.unused).toBe(false)
      expect(
        (await eventsOf(ctx, 'iam_registration.drafted'))[0]!.machineDetail,
      ).toMatchObject({ attributeCount: 3, unusedCount: 1 })
    })
  })

  it('a sent package is never regenerated — LAUNCH_RECORD_SUBMITTED — nor one UBC holds, and one UBC asked the owner to change is', async () => {
    await withCwlProject(['ubcEduCwlPuid', 'mail'], async (ctx) => {
      // The assessment first, so the draft carries its PIA number (Task 10's review, I2).
      await cwlPiaApproved(ctx)
      const drafted = await draft(ctx, 'staging')
      const first = packageOf(drafted.json())
      // As a client sends it: naming the draft it showed the person (Task 10's review, I3).
      const sent = await cwlSendStaging(ctx, { draftGeneratedAt: first.generatedAt })
      expect(sent.statusCode, sent.body).toBe(200)
      expect(refusal(await draft(ctx, 'staging'))).toEqual({
        status: 409,
        code: 'LAUNCH_RECORD_SUBMITTED',
      })
      // The package sent is the package kept.
      expect(packageOf((await cwlRecords(ctx)).stagingRegistration)).toEqual(first)

      // The Manifest team submits it; UBC registers it — at an ACS path the app has since moved away
      // from — and it is still kept.
      const admin = await loginAs(ctx.deps, 'platform_admin')
      await post(
        ctx,
        `/v1/projects/${ctx.project.id}/launch-records/iam-registration/staging/submission`,
        { reference: 'IAM-2026-0500' },
        admin,
      )
      const registered = {
        environment: 'staging',
        entityId: first.entityId,
        acsUrl: `https://${hostOf(ctx, 'staging')}/auth/old/callback`,
        sloUrl: first.sloUrl,
        registeredAttributes: ['ubcEduCwlPuid', 'mail'],
      }
      const recordUrl = `/v1/projects/${ctx.project.id}/launch-records/iam-registration`
      await post(ctx, recordUrl, { ...registered, state: 'active' }, admin)
      // REGISTERED BY UBC, IT IS DRAFTED AGAIN AS A CHANGE (the FE-46/47/5 plan's Task 7, FE-47) — the
      // record keeps what UBC registered; only the package is new.
      const asChange = await draft(ctx, 'staging')
      expect(asChange.statusCode, asChange.body).toBe(200)
      expect(asChange.json()).toMatchObject({
        state: 'active',
        acsUrl: registered.acsUrl,
        registeredAttributes: ['ubcEduCwlPuid', 'mail'],
      })

      // An administrator files a change request: UBC holds it, so it is not drafted again.
      await post(
        ctx,
        recordUrl,
        {
          ...registered,
          state: 'change_requested',
          requestedAttributes: ['ubcEduCwlPuid', 'mail'],
        },
        admin,
      )
      expect(refusal(await draft(ctx, 'staging'))).toEqual({
        status: 409,
        code: 'LAUNCH_RECORD_SUBMITTED',
      })
      // UBC takes it up, then comes back to the OWNER with questions: a new request is the point, so
      // it drafts again.
      await post(ctx, recordUrl, { ...registered, state: 'submitted' }, admin)
      await post(ctx, recordUrl, { ...registered, state: 'change_requested' }, admin)
      const again = await draft(ctx, 'staging')
      expect(again.statusCode, again.body).toBe(200)
      // The record still says what UBC REGISTERED; only the package is new.
      expect(again.json()).toMatchObject({
        state: 'change_requested',
        acsUrl: registered.acsUrl,
        registeredAttributes: ['ubcEduCwlPuid', 'mail'],
      })
      const redrafted = packageOf(again.json())
      expect(redrafted.generatedAt > first.generatedAt).toBe(true)
      expect(redrafted.acsUrl).toBe(first.acsUrl)
      // And it still carries the PIA number the assessment was approved with.
      expect(redrafted.privacyAssessmentReference).toBe('PIA-2026-0088')
      expect(redrafted.warnings).not.toContain(NO_PIA_NUMBER)
    })
  })

  it('no answer carries a private key', async () => {
    await withCwlProject(['ubcEduCwlPuid', 'mail'], async (ctx) => {
      const bodies: string[] = []
      await cwlPiaApproved(ctx)
      for (const environment of ['staging', 'production'] as const) {
        const res = await draft(ctx, environment)
        expect(res.statusCode, res.body).toBe(200)
        bodies.push(res.body)
      }
      const sent = await cwlSendStaging(ctx)
      expect(sent.statusCode, sent.body).toBe(200)
      bodies.push(sent.body)
      await stage(ctx)
      for (const url of ['launch-records', 'launch-readiness']) {
        const res = await ctx.app.inject({
          method: 'GET',
          url: `/v1/projects/${ctx.project.id}/${url}`,
          cookies: ctx.ownerCookies,
        })
        bodies.push(res.body)
      }
      const audit = await ctx.deps.db
        .select()
        .from(events)
        .where(eq(events.projectId, ctx.project.id))
      bodies.push(JSON.stringify(audit))
      // The positive control: the certificates ARE there — the scan is reading the right bodies.
      expect(bodies.join('\n')).toContain('-----BEGIN CERTIFICATE-----')
      for (const body of bodies) expect(body).not.toMatch(PRIVATE_KEY)
    })
  })

  it('refuses an app that registers nothing — LAUNCH_NOT_CWL — and writes nothing', async () => {
    await withProjectServer(async (ctx) => {
      // `fixture-node@1` signs nobody in (`auth.provider: none`).
      for (const environment of ['staging', 'production'] as const) {
        const res = await ctx.app.inject({
          method: 'POST',
          url: `/v1/projects/${ctx.projectId}/launch-records/iam-registration/${environment}/draft`,
          cookies: ctx.ownerCookies,
          headers: mutationHeaders(ctx.deps),
        })
        expect(refusal(res)).toEqual({ status: 409, code: 'LAUNCH_NOT_CWL' })
      }
      expect(await records(ctx)).toMatchObject({
        iamRegistration: null,
        stagingRegistration: null,
      })
    })
  })

  it('production is drawn from the launch candidate, and says so when there is none', async () => {
    await withCwlProject(['ubcEduCwlPuid', 'mail'], async (ctx) => {
      const early = packageOf((await draft(ctx, 'production')).json())
      expect(early.warnings).toContain(NO_CANDIDATE)
      expect(early.fromCommit).toBe(ctx.commitSha)
      expect(early.acsUrl).toBe(
        `https://${hostOf(ctx, 'production')}/auth/ubcshib/callback`,
      )

      await stage(ctx)
      // A newer manifest asks for more — but it is not what serves staging.
      const newer = await commitManifest(
        { app: ctx.app, deps: ctx.deps, cookies: ctx.ownerCookies, project: ctx.project },
        cwlManifest(ctx.project.slug, ['ubcEduCwlPuid', 'mail', 'givenName']),
        'feat: greet people by name',
      )
      const production = packageOf((await draft(ctx, 'production')).json())
      expect(production.attributes.map((a) => a.name)).toEqual(['ubcEduCwlPuid', 'mail'])
      expect(production.fromCommit).toBe(ctx.commitSha)
      expect(production.warnings).not.toContain(NO_CANDIDATE)
      // Staging is drawn from the newest valid manifest.
      const staging = packageOf((await draft(ctx, 'staging')).json())
      expect(staging.attributes.map((a) => a.name)).toEqual([
        'ubcEduCwlPuid',
        'mail',
        'givenName',
      ])
      expect(staging.fromCommit).toBe(newer.commitSha)
    })
  })

  it('an agent on its person’s token may draft — launch:draft is mintable — a collaborator may, and a stranger is answered 404', async () => {
    await withCwlProject(['ubcEduCwlPuid', 'mail'], async (ctx) => {
      const minted = await post(
        ctx,
        `/v1/projects/${ctx.project.id}/tokens`,
        {
          name: 'drafting agent',
          capabilities: ['project:read', 'launch:draft'],
          expiresInDays: 1,
        },
        ctx.ownerCookies,
        201,
      )
      const byToken = await draft(ctx, 'staging', { bearer: minted.secret as string })
      expect(byToken.statusCode, byToken.body).toBe(200)
      // A token without it is refused, by the capability's code.
      const owner = await ensureTestUser(ctx.deps.db, 'bio_prof')
      const { plaintext } = await mintTestToken(ctx.deps.db, {
        userId: owner.id,
        projectId: ctx.project.id,
        capabilities: ['project:read'],
      })
      expect(refusal(await draft(ctx, 'staging', { bearer: plaintext }))).toEqual({
        status: 403,
        code: 'FORBIDDEN',
      })
      const colleague = await ensureTestUser(ctx.deps.db, 'bio_colleague')
      await addMember(ctx.deps.db, ctx.project.id, colleague.id, 'collaborator')
      const byCollaborator = await draft(ctx, 'production', {
        cookies: await loginAs(ctx.deps, 'bio_colleague'),
      })
      expect(byCollaborator.statusCode, byCollaborator.body).toBe(200)
      // The collaborators stand beside the owner as technical contacts.
      expect(packageOf(byCollaborator.json()).contacts.technical).toEqual([
        { name: 'Bio Prof', email: 'bio_prof@example.ubc.ca' },
        { name: 'Bio Colleague', email: 'bio_colleague@example.ubc.ca' },
      ])
      const stranger = await loginAs(ctx.deps, 'unrelated_user')
      expect(refusal(await draft(ctx, 'staging', { cookies: stranger }))).toEqual({
        status: 404,
        code: 'NOT_FOUND',
      })
    })
  })

  it('the platform’s contacts are the configured ones when set', async () => {
    await withCwlProject(
      ['ubcEduCwlPuid', 'mail'],
      async (ctx) => {
        const pkg = packageOf((await draft(ctx, 'staging')).json())
        expect(pkg.contacts.support).toEqual([
          { name: 'IAM Desk', email: 'iam.desk@example.ubc.ca' },
          { name: 'Rich T', email: 'rich@example.ubc.ca' },
        ])
        expect(pkg.metadataXml).toContain(
          '<md:EmailAddress>iam.desk@example.ubc.ca</md:EmailAddress>',
        )
      },
      {
        deps: (deps) => ({
          ...deps,
          config: {
            ...deps.config,
            launchContacts: [
              { name: 'IAM Desk', email: 'iam.desk@example.ubc.ca' },
              { name: 'Rich T', email: 'rich@example.ubc.ca' },
            ],
          },
        }),
      },
    )
  })

  it('a re-draft waits for a submission holding the record, and then refuses it — LAUNCH_RECORD_SUBMITTED', async () => {
    await withCwlProject(['ubcEduCwlPuid', 'mail'], async (ctx) => {
      expect((await draft(ctx, 'staging')).statusCode).toBe(200)
      const record = (await cwlRecords(ctx)).stagingRegistration as { id: string }
      let answered: Awaited<ReturnType<typeof draft>> | undefined
      await holdingThen(
        'SELECT 1 FROM iam_registrations WHERE id = $1 FOR UPDATE',
        [record.id],
        // What a record UBC IAM holds looks like in the window.
        `UPDATE iam_registrations SET state = 'submitted', submitted_at = now() WHERE id = '${record.id}'`,
        async (lock) => {
          const drafting = draft(ctx, 'staging')
          await until(
            () => lock.waitedOn('%iam_registrations%'),
            'the re-draft waiting on the held registration',
          )
          await lock.commit()
          answered = await drafting
        },
      )
      expect(refusal(answered!)).toEqual({ status: 409, code: 'LAUNCH_RECORD_SUBMITTED' })
      expect(await eventsOf(ctx, 'iam_registration.drafted')).toHaveLength(1)
    })
  })
})

describe('what is sent is the draft the person read (Task 10’s whole-branch review, I2 and I3)', () => {
  it('a registration drafted before the assessment was approved is not sent — LAUNCH_DRAFT_STALE — until it is drafted again', async () => {
    await withCwlProject(['ubcEduCwlPuid', 'mail'], async (ctx) => {
      // Week one: drafted before the Privacy Office answered, so without the PIA number.
      const early = packageOf((await draft(ctx, 'staging')).json())
      expect(early.privacyAssessmentReference).toBeNull()
      await cwlPiaApproved(ctx)
      expect(refusal(await cwlSendStaging(ctx))).toEqual({
        status: 409,
        code: 'LAUNCH_DRAFT_STALE',
      })
      expect((await cwlRecords(ctx)).stagingRegistration).toMatchObject({
        state: 'draft',
      })
      expect(await eventsOf(ctx, 'iam_registration.submitted')).toHaveLength(0)
      // THE POSITIVE CONTROL: drafted again, it carries the number — and is sent.
      const current = packageOf((await draft(ctx, 'staging')).json())
      expect(current.privacyAssessmentReference).toBe('PIA-2026-0088')
      const sent = await cwlSendStaging(ctx)
      expect(sent.statusCode, sent.body).toBe(200)
      expect(packageOf(sent.json()).privacyAssessmentReference).toBe('PIA-2026-0088')
    })
  })

  it('a submission names the draft it sent: one drafted since refuses it — LAUNCH_DRAFT_CHANGED — and the current one is accepted', async () => {
    await withCwlProject(['ubcEduCwlPuid', 'mail'], async (ctx) => {
      await cwlPiaApproved(ctx)
      // Read on Monday and sent; drafted again on Wednesday by the agent.
      const read = packageOf((await draft(ctx, 'staging')).json())
      const since = packageOf((await draft(ctx, 'staging')).json())
      expect(since.generatedAt > read.generatedAt).toBe(true)
      expect(
        refusal(await cwlSendStaging(ctx, { draftGeneratedAt: read.generatedAt })),
      ).toEqual({ status: 409, code: 'LAUNCH_DRAFT_CHANGED' })
      expect((await cwlRecords(ctx)).stagingRegistration).toMatchObject({
        state: 'draft',
      })
      // THE POSITIVE CONTROL: the draft the person read is the one Manifest holds.
      const sent = await cwlSendStaging(ctx, { draftGeneratedAt: since.generatedAt })
      expect(sent.statusCode, sent.body).toBe(200)
      expect(packageOf(sent.json()).generatedAt).toBe(since.generatedAt)
    })
  })
})

/** How many events of one type the project has, read as the database's owner. */
async function eventCount(ctx: TestProject, type: string): Promise<number> {
  const admin = new pg.Pool({ connectionString: process.env.MANIFEST_ADMIN_DATABASE_URL })
  try {
    const { rows } = await admin.query<{ n: string }>(
      `SELECT count(*) AS n FROM audit.events WHERE project_id = $1 AND type = $2`,
      [ctx.projectId, type],
    )
    return Number(rows[0]!.n)
  } finally {
    await admin.end()
  }
}

/**
 * A row held by a SECOND connection, as the database's owner, which then CHANGES it and commits —
 * what an administrator's write does in the window (`api/members.test.ts`'s `holding`, which only
 * ever rolls back). `waitedOn`: a statement matching `pattern` waits on this connection's lock.
 */
async function holdingThen(
  statement: string,
  params: unknown[],
  change: string,
  fn: (lock: {
    waitedOn: (pattern: string) => Promise<boolean>
    commit: () => Promise<void>
  }) => Promise<void>,
): Promise<void> {
  const admin = new pg.Pool({ connectionString: process.env.MANIFEST_ADMIN_DATABASE_URL })
  const held = await admin.connect()
  let open = false
  try {
    const { rows } = await held.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
    const pid = rows[0]!.pid
    await held.query('BEGIN')
    open = true
    await held.query(statement, params)
    await fn({
      waitedOn: async (pattern) =>
        Number(
          (
            await admin.query<{ n: string }>(
              `SELECT count(*) AS n FROM pg_stat_activity
                WHERE datname = current_database() AND wait_event_type = 'Lock'
                  AND query ILIKE $2 AND $1 = ANY(pg_blocking_pids(pid))`,
              [pid, pattern],
            )
          ).rows[0]!.n,
        ) > 0,
      commit: async () => {
        await held.query(change)
        await held.query('COMMIT')
        open = false
      },
    })
  } finally {
    if (open) await held.query('ROLLBACK')
    held.release()
    await admin.end()
  }
}

/** Polls `condition` until it holds, or fails naming what it waited for. */
async function until(
  condition: () => boolean | Promise<boolean>,
  what: string,
  // Under the test's own 5 s, so a submission that never waits fails HERE, naming what it waited for.
  timeoutMs = 3_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!(await condition())) {
    if (Date.now() > deadline)
      throw new Error(`timed out after ${timeoutMs} ms waiting for ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

/**
 * D19'S PRIVACY-ASSESSMENT DRAFT THROUGH THE ROUTE (the launch path plan's Task 11; Spec action 4):
 * the owner — or an agent on their token — drafts the assessment, and Manifest generates §9's six rows
 * from what it holds, the gaps the owner fills, and a text to paste. Production's app is what is
 * assessed, so it is drawn from the launch candidate, as production's registration is.
 */
interface AssessmentDraftBody {
  project: { slug: string; name: string }
  generatedAt: string
  fromCommit: string
  sections: {
    id: string
    title: string
    facts: { label: string; value: string; source: string }[]
    gaps: { id: string; text: string }[]
  }[]
  warnings: string[]
  text: string
}
const assessmentOf = (body: unknown) =>
  (body as { draft: AssessmentDraftBody | null }).draft

function draftAssessment(
  ctx: { app: CwlProject['app']; deps: ServerDeps },
  projectId: string,
  credentials: { cookies?: Record<string, string>; bearer?: string },
) {
  return ctx.app.inject({
    method: 'POST',
    url: `/v1/projects/${projectId}/launch-records/privacy-assessment/draft`,
    ...(credentials.cookies === undefined ? {} : { cookies: credentials.cookies }),
    headers: {
      ...mutationHeaders(ctx.deps),
      ...(credentials.bearer === undefined
        ? {}
        : { authorization: `Bearer ${credentials.bearer}` }),
    },
  })
}

const NO_CANDIDATE_ASSESSMENT =
  'Nothing is serving staging yet, so this is drawn from the newest valid manifest. The assessment should describe the release you will launch: once it serves staging, draft this again.'
const NO_RETENTION =
  'No retention declared — add data.retention_days to manifest.yaml, with how long the app must keep its data.'

const factsOf = (draft: AssessmentDraftBody, id: string) =>
  draft.sections.find((s) => s.id === id)!.facts

describe('D19’s privacy-assessment draft (Task 11)', () => {
  it('drafts §9’s six rows from what Manifest holds, with the gaps and a text to paste — kept on the record and announced', async () => {
    await withCwlProject(['ubcEduCwlPuid', 'mail'], async (ctx) => {
      const res = await draftAssessment(ctx, ctx.project.id, {
        cookies: ctx.ownerCookies,
      })
      expect(res.statusCode, res.body).toBe(200)
      expect(res.json()).toMatchObject({
        projectId: ctx.project.id,
        state: 'draft',
        submittedAt: null,
        approvedAt: null,
      })
      const draft = assessmentOf(res.json())!
      expect(draft).toMatchObject({
        project: { slug: ctx.project.slug },
        fromCommit: ctx.commitSha,
        warnings: [NO_CANDIDATE_ASSESSMENT],
      })
      expect(draft.sections.map((s) => s.id)).toEqual([
        'collected',
        'stored',
        'flows',
        'retention',
        'accountable',
        'hosting',
      ])
      expect(factsOf(draft, 'collected').map((f) => f.label)).toEqual([
        'ubcEduCwlPuid',
        'mail',
      ])
      // The CWL manifest writes no data block: no period is claimed, the classification is said to
      // be Manifest's default, and both are named as gaps (the whole-branch review's I1 and I2).
      expect(factsOf(draft, 'retention')[0]).toEqual({
        label: 'How long',
        value: 'The manifest gives no retention period.',
        source: 'manifest.yaml: data.retention_days',
      })
      expect(draft.sections.find((s) => s.id === 'retention')!.gaps).toContainEqual({
        id: 'retention.declare',
        text: NO_RETENTION,
      })
      expect(
        factsOf(draft, 'flows').find((f) => f.label === 'Classification')!.source,
      ).toBe('Manifest’s default')
      expect(draft.sections.find((s) => s.id === 'flows')!.gaps).toEqual([
        {
          id: 'flows.classification',
          text: expect.stringMatching(/^No classification declared/),
        },
      ])
      expect(factsOf(draft, 'accountable')).toEqual([
        {
          label: 'Owner',
          value: 'Bio Prof <bio_prof@example.ubc.ca>',
          source: 'the project’s members',
        },
        {
          label: 'Platform contact',
          value: 'Platform Admin <platform_admin@example.ubc.ca>',
          source: 'the platform’s contacts',
        },
      ])
      // Driver 1: the platform's own repositories — nobody's name goes to GitHub.
      expect(factsOf(draft, 'flows').map((f) => f.label)).not.toContain(
        'Changes to the app',
      )
      expect(draft.text).toContain(`(${ctx.project.slug})`)
      for (const gap of draft.sections.flatMap((s) => s.gaps))
        expect(draft.text).toContain(gap.text)

      // Kept on the record, and announced by its counts — never its text.
      expect(assessmentOf((await cwlRecords(ctx)).privacyAssessment)).toEqual(draft)
      const drafted = await eventsOf(ctx, 'privacy_assessment.drafted')
      const gapCount = draft.sections.flatMap((s) => s.gaps).length
      expect(drafted.map((e) => e.machineDetail)).toEqual([
        { fromCommit: ctx.commitSha, gapCount },
      ])
      expect(drafted[0]!.humanMessage).toBe(
        `Bio Prof drafted this app's privacy assessment for the Privacy Office, with ${gapCount} gap(s) for the owner to fill.`,
      )
    })
  })

  it('a retention and a classification the manifest writes are the manifest’s, and no gap', async () => {
    await withCwlProject(['ubcEduCwlPuid', 'mail'], async (ctx) => {
      await commitManifest(
        { app: ctx.app, deps: ctx.deps, cookies: ctx.ownerCookies, project: ctx.project },
        cwlManifest(
          ctx.project.slug,
          ['ubcEduCwlPuid', 'mail'],
          ['data:', '  classification: internal', '  retention_days: 90'],
        ),
        'feat: keep data for a term',
      )
      const draft = assessmentOf(
        (
          await draftAssessment(ctx, ctx.project.id, { cookies: ctx.ownerCookies })
        ).json(),
      )!
      expect(factsOf(draft, 'retention')[0]).toEqual({
        label: 'How long',
        value: 'The manifest says the app keeps its data for 90 days.',
        source: 'manifest.yaml: data.retention_days',
      })
      expect(
        draft.sections.find((s) => s.id === 'retention')!.gaps.map((g) => g.text),
      ).not.toContain(NO_RETENTION)
      expect(
        factsOf(draft, 'flows').find((f) => f.label === 'Classification')!.source,
      ).toBe('manifest.yaml: data.classification')
      expect(draft.sections.find((s) => s.id === 'flows')!.gaps).toEqual([])
    })
  })

  it('an app that signs nobody in is assessed too — it collects nothing from CWL', async () => {
    await withProjectServer(async (ctx) => {
      const res = await draftAssessment(ctx, ctx.projectId, { cookies: ctx.ownerCookies })
      expect(res.statusCode, res.body).toBe(200)
      expect(factsOf(assessmentOf(res.json())!, 'collected')).toEqual([
        {
          label: 'Sign-in',
          value:
            'The app signs nobody in, so UBC releases nothing about the people who use it.',
          source: 'manifest.yaml: auth.provider',
        },
      ])
    })
  })

  it('is drawn from the launch candidate, and says so when there is none', async () => {
    await withCwlProject(['ubcEduCwlPuid', 'mail'], async (ctx) => {
      await stage(ctx)
      // A newer manifest asks for more — but it is not what serves staging, so not what launches.
      await commitManifest(
        { app: ctx.app, deps: ctx.deps, cookies: ctx.ownerCookies, project: ctx.project },
        cwlManifest(ctx.project.slug, ['ubcEduCwlPuid', 'mail', 'givenName']),
        'feat: greet people by name',
      )
      const draft = assessmentOf(
        (
          await draftAssessment(ctx, ctx.project.id, { cookies: ctx.ownerCookies })
        ).json(),
      )!
      expect(factsOf(draft, 'collected').map((f) => f.label)).toEqual([
        'ubcEduCwlPuid',
        'mail',
      ])
      expect(draft.fromCommit).toBe(ctx.commitSha)
      expect(draft.warnings).not.toContain(NO_CANDIDATE_ASSESSMENT)
    })
  })

  it('a sent assessment is never regenerated — LAUNCH_RECORD_SUBMITTED — nor a submitted or approved one; one sent back to draft is', async () => {
    await withCwlProject(['ubcEduCwlPuid', 'mail'], async (ctx) => {
      const first = assessmentOf(
        (
          await draftAssessment(ctx, ctx.project.id, { cookies: ctx.ownerCookies })
        ).json(),
      )!
      const sent = await ctx.app.inject({
        method: 'POST',
        url: `/v1/projects/${ctx.project.id}/launch-records/privacy-assessment/send`,
        payload: {
          draftGeneratedAt: first.generatedAt,
          answers: everyGapAnswered(first),
        },
        cookies: ctx.ownerCookies,
        headers: mutationHeaders(ctx.deps),
      })
      expect(sent.statusCode, sent.body).toBe(200)
      expect(assessmentOf(sent.json())).toEqual(first)
      expect(
        refusal(
          await draftAssessment(ctx, ctx.project.id, { cookies: ctx.ownerCookies }),
        ),
      ).toEqual({ status: 409, code: 'LAUNCH_RECORD_SUBMITTED' })
      // The draft sent is the draft kept.
      expect(assessmentOf((await cwlRecords(ctx)).privacyAssessment)).toEqual(first)

      const admin = await loginAs(ctx.deps, 'platform_admin')
      const recordUrl = `/v1/projects/${ctx.project.id}/launch-records/privacy-assessment`
      await post(ctx, `${recordUrl}/submission`, { reference: 'PIA-1' }, admin)
      expect(
        refusal(
          await draftAssessment(ctx, ctx.project.id, { cookies: ctx.ownerCookies }),
        ),
      ).toEqual({ status: 409, code: 'LAUNCH_RECORD_SUBMITTED' })
      await post(ctx, recordUrl, { state: 'approved', externalTicketRef: 'PIA-1' }, admin)
      expect(
        refusal(
          await draftAssessment(ctx, ctx.project.id, { cookies: ctx.ownerCookies }),
        ),
      ).toEqual({ status: 409, code: 'LAUNCH_RECORD_SUBMITTED' })

      // The Privacy Office sends it back: it is drafted again, for a new request.
      await post(ctx, recordUrl, { state: 'draft', reviewer: 'K. Privacy' }, admin)
      const again = await draftAssessment(ctx, ctx.project.id, {
        cookies: ctx.ownerCookies,
      })
      expect(again.statusCode, again.body).toBe(200)
      expect(assessmentOf(again.json())!.generatedAt > first.generatedAt).toBe(true)
      expect(await eventsOf(ctx, 'privacy_assessment.drafted')).toHaveLength(2)
    })
  })

  it('an agent on its person’s token may draft — launch:draft is mintable — a collaborator may, and a stranger is answered 404', async () => {
    await withCwlProject(['ubcEduCwlPuid', 'mail'], async (ctx) => {
      const minted = await post(
        ctx,
        `/v1/projects/${ctx.project.id}/tokens`,
        {
          name: 'drafting agent',
          capabilities: ['project:read', 'launch:draft'],
          expiresInDays: 1,
        },
        ctx.ownerCookies,
        201,
      )
      const byToken = await draftAssessment(ctx, ctx.project.id, {
        bearer: minted.secret as string,
      })
      expect(byToken.statusCode, byToken.body).toBe(200)
      // A token without it is refused, by the capability's code.
      const owner = await ensureTestUser(ctx.deps.db, 'bio_prof')
      const { plaintext } = await mintTestToken(ctx.deps.db, {
        userId: owner.id,
        projectId: ctx.project.id,
        capabilities: ['project:read'],
      })
      expect(
        refusal(await draftAssessment(ctx, ctx.project.id, { bearer: plaintext })),
      ).toEqual({ status: 403, code: 'FORBIDDEN' })
      const colleague = await ensureTestUser(ctx.deps.db, 'bio_colleague')
      await addMember(ctx.deps.db, ctx.project.id, colleague.id, 'collaborator')
      const byCollaborator = await draftAssessment(ctx, ctx.project.id, {
        cookies: await loginAs(ctx.deps, 'bio_colleague'),
      })
      expect(byCollaborator.statusCode, byCollaborator.body).toBe(200)
      expect(
        factsOf(assessmentOf(byCollaborator.json())!, 'accountable').map((f) => f.label),
      ).toEqual(['Owner', 'Collaborator', 'Platform contact'])
      const stranger = await loginAs(ctx.deps, 'unrelated_user')
      expect(
        refusal(await draftAssessment(ctx, ctx.project.id, { cookies: stranger })),
      ).toEqual({ status: 404, code: 'NOT_FOUND' })
    })
  })

  it('a send names the draft it sent: one drafted since refuses it — LAUNCH_DRAFT_CHANGED — and the current one is accepted', async () => {
    await withCwlProject(['ubcEduCwlPuid', 'mail'], async (ctx) => {
      const read = assessmentOf(
        (
          await draftAssessment(ctx, ctx.project.id, { cookies: ctx.ownerCookies })
        ).json(),
      )!
      const since = assessmentOf(
        (
          await draftAssessment(ctx, ctx.project.id, { cookies: ctx.ownerCookies })
        ).json(),
      )!
      expect(since.generatedAt > read.generatedAt).toBe(true)
      const submitWith = (draftGeneratedAt: string) =>
        ctx.app.inject({
          method: 'POST',
          url: `/v1/projects/${ctx.project.id}/launch-records/privacy-assessment/send`,
          payload: { draftGeneratedAt, answers: everyGapAnswered(since) },
          cookies: ctx.ownerCookies,
          headers: mutationHeaders(ctx.deps),
        })
      expect(refusal(await submitWith(read.generatedAt))).toEqual({
        status: 409,
        code: 'LAUNCH_DRAFT_CHANGED',
      })
      // THE POSITIVE CONTROL: the draft the person read is the one Manifest holds.
      const sent = await submitWith(since.generatedAt)
      expect(sent.statusCode, sent.body).toBe(200)
    })
  })

  it('a re-draft waits for a submission holding the record, and then refuses it — LAUNCH_RECORD_SUBMITTED', async () => {
    await withCwlProject(['ubcEduCwlPuid', 'mail'], async (ctx) => {
      expect(
        (await draftAssessment(ctx, ctx.project.id, { cookies: ctx.ownerCookies }))
          .statusCode,
      ).toBe(200)
      const record = (await cwlRecords(ctx)).privacyAssessment as { id: string }
      let answered: Awaited<ReturnType<typeof draftAssessment>> | undefined
      await holdingThen(
        'SELECT 1 FROM privacy_assessments WHERE id = $1 FOR UPDATE',
        [record.id],
        // What a record the Privacy Office holds looks like in the window.
        `UPDATE privacy_assessments SET state = 'submitted', submitted_at = now() WHERE id = '${record.id}'`,
        async (lock) => {
          const drafting = draftAssessment(ctx, ctx.project.id, {
            cookies: ctx.ownerCookies,
          })
          await until(
            () => lock.waitedOn('%privacy_assessments%'),
            'the re-draft waiting on the held assessment',
          )
          await lock.commit()
          answered = await drafting
        },
      )
      expect(refusal(answered!)).toEqual({ status: 409, code: 'LAUNCH_RECORD_SUBMITTED' })
      expect(await eventsOf(ctx, 'privacy_assessment.drafted')).toHaveLength(1)
    })
  })
})

describe('the assessment’s draft against what launches, and on GitHub (Task 11; sitting 8’s whole-branch review, I3 and I4)', () => {
  it('on driver 2 the draft is read through the mirror, and names the organisation the people who change the app are sent to', async () => {
    await resetDatabase()
    const fake = await startFake({ plan: 'team' })
    const deps = await githubTestDeps(fake)
    const app = await buildServer(deps)
    try {
      const cookies = await loginAs(deps, 'bio_prof')
      const created = await app.inject({
        method: 'POST',
        url: '/v1/projects',
        payload: projectBody('assess-gh'),
        cookies,
        headers: mutationHeaders(deps),
      })
      expect(created.statusCode, created.body).toBe(201)
      const res = await draftAssessment({ app, deps }, created.json().id, { cookies })
      expect(res.statusCode, res.body).toBe(200)
      const draft = assessmentOf(res.json())!
      expect(
        factsOf(draft, 'flows').find((f) => f.label === 'Changes to the app'),
      ).toEqual({
        label: 'Changes to the app',
        value: `The names of the people who change the app through Manifest are sent to GitHub (${fake.org}), as the author of each change.`,
        source: 'the project’s repository',
      })
      expect(
        factsOf(draft, 'hosting').find((f) => f.label === 'Where its code is kept')!
          .value,
      ).toBe(`In a private repository in the GitHub organisation ${fake.org}.`)
      // Read at the commit it was drawn from, through the mirror: the fixture writes no data block.
      expect(draft.sections.find((s) => s.id === 'retention')!.gaps).toContainEqual({
        id: 'retention.declare',
        text: NO_RETENTION,
      })
    } finally {
      await deps.sourceSync.idle()
      await deps.builds.idle()
      await app.close()
      await fake.stop()
    }
  })

  it('the checklist says when the draft is not drawn from the release serving staging — and stops once it is drafted again', async () => {
    await withCwlProject(['ubcEduCwlPuid', 'mail'], async (ctx) => {
      const why = async () => {
        const res = await ctx.app.inject({
          method: 'GET',
          url: `/v1/projects/${ctx.project.id}/launch-readiness`,
          cookies: ctx.ownerCookies,
        })
        expect(res.statusCode, res.body).toBe(200)
        return (res.json() as { items: { id: string; why: string }[] }).items.find(
          (i) => i.id === 'privacy-assessment',
        )!.why
      }
      const first = assessmentOf(
        (
          await draftAssessment(ctx, ctx.project.id, { cookies: ctx.ownerCookies })
        ).json(),
      )!
      await stage(ctx)
      // Staging serves the commit the draft was drawn from: nothing to say.
      expect(await why()).not.toMatch(/draft it again/)
      // The agent adds an attribute, and THAT release goes to staging.
      const newer = await commitManifest(
        { app: ctx.app, deps: ctx.deps, cookies: ctx.ownerCookies, project: ctx.project },
        cwlManifest(ctx.project.slug, ['ubcEduCwlPuid', 'mail', 'givenName']),
        'feat: greet people by name',
      )
      await stage(ctx)
      expect(await why()).toContain(
        `The draft was made from commit ${first.fromCommit.slice(0, 12)}, and the release serving staging is built from ${newer.commitSha.slice(0, 12)}: draft it again before you send it.`,
      )
      // THE POSITIVE CONTROL: drafted again, from what launches, it says nothing.
      const again = assessmentOf(
        (
          await draftAssessment(ctx, ctx.project.id, { cookies: ctx.ownerCookies })
        ).json(),
      )!
      expect(again.fromCommit).toBe(newer.commitSha)
      expect(await why()).not.toMatch(/draft it again/)
    })
  })
})

/**
 * A CHANGE TO A LIVE REGISTRATION, THROUGH THE MANIFEST TEAM, THROUGH THE ROUTES (the FE-46/47/5 plan's Task 7,
 * Decision 21; FE-47): an app whose two registrations UBC has registered, launched, asks for one more attribute.
 * The owner drafts production's registration again — drawn from the NEWEST VALID MANIFEST, where the change is
 * being made (the release serving staging is no reliable source of it) — and sends it; the team files it; UBC's answer is
 * recorded. Before the manifest changes, a send that asks for nothing new is refused `LAUNCH_CHANGE_EMPTY`.
 */
describe('a change to a live registration, through the Manifest team (FE-46/47/5 plan Task 7; FE-47)', () => {
  const CHANGE_DRAWN =
    'A change to a live registration is drawn from the newest valid manifest: that is where the change is being made.'

  it('drafted from the newest valid manifest, sent, filed by the team, answered by UBC — the live release met throughout; nothing new is LAUNCH_CHANGE_EMPTY', async () => {
    await withCwlProject(['ubcEduCwlPuid', 'mail'], async (ctx) => {
      const admin = await loginAs(ctx.deps, 'platform_admin')
      const recordUrl = `/v1/projects/${ctx.project.id}/launch-records/iam-registration`
      await cwlPiaApproved(ctx)
      await stage(ctx)
      // UBC registered both, exactly as the platform derives them.
      const registered: Record<string, Json> = {}
      for (const environment of ['staging', 'production'] as const) {
        const pkg = packageOf((await draft(ctx, environment)).json())
        registered[environment] = {
          environment,
          entityId: pkg.entityId,
          acsUrl: pkg.acsUrl,
          sloUrl: pkg.sloUrl,
          registeredAttributes: pkg.attributes.map((a) => a.name),
          externalTicketRef: `IAM-${environment}`,
        }
        for (const state of ['submitted', 'active'] as const)
          await post(ctx, recordUrl, { ...registered[environment], state }, admin)
      }
      await ctx.deps.db
        .update(projects)
        .set({ launchedAt: new Date() })
        .where(eq(projects.id, ctx.project.id))
      const live = async () =>
        (
          (await (
            await ctx.app.inject({
              method: 'GET',
              url: `/v1/projects/${ctx.project.id}/launch-readiness`,
              cookies: ctx.ownerCookies,
            })
          ).json()) as { items: { id: string; state: string; why: string }[] }
        ).items.find((i) => i.id === 'iam-registration')!
      expect((await live()).state).toBe('met')
      const sendProduction = (body: Json) =>
        ctx.app.inject({
          method: 'POST',
          url: `${recordUrl}/production/send`,
          payload: body,
          cookies: ctx.ownerCookies,
          headers: mutationHeaders(ctx.deps),
        })

      // NOTHING NEW TO ASK FOR: drafted again from what it already asks — refused, nothing written.
      const same = packageOf((await draft(ctx, 'production')).json())
      const empty = await sendProduction({ draftGeneratedAt: same.generatedAt })
      expect(refusal(empty)).toEqual({ status: 409, code: 'LAUNCH_CHANGE_EMPTY' })
      expect((await cwlRecords(ctx)).iamRegistration).toMatchObject({ state: 'active' })

      // THE NEWEST VALID MANIFEST ASKS FOR sn — it is not what serves staging.
      const newer = await commitManifest(
        { app: ctx.app, deps: ctx.deps, cookies: ctx.ownerCookies, project: ctx.project },
        cwlManifest(ctx.project.slug, ['ubcEduCwlPuid', 'mail', 'sn']),
        'feat: family names',
      )
      const drafted = await draft(ctx, 'production')
      expect(drafted.statusCode, drafted.body).toBe(200)
      expect(drafted.json()).toMatchObject({
        state: 'active',
        registeredAttributes: ['ubcEduCwlPuid', 'mail'],
        acsUrl: registered.production!.acsUrl,
      })
      const change = packageOf(drafted.json())
      expect(change.attributes.map((a) => a.name)).toEqual([
        'ubcEduCwlPuid',
        'mail',
        'sn',
      ])
      expect(change.fromCommit).toBe(newer.commitSha)
      expect(change.warnings).toContain(CHANGE_DRAWN)

      const sent = await sendProduction({ draftGeneratedAt: change.generatedAt })
      expect(sent.statusCode, sent.body).toBe(200)
      expect(sent.json()).toMatchObject({
        state: 'sent',
        sentFrom: 'active',
        requestedAttributes: ['ubcEduCwlPuid', 'mail', 'sn'],
        registeredAttributes: ['ubcEduCwlPuid', 'mail'],
      })
      expect(
        (ctx.deps.mailer as ReturnType<typeof recordingMailer>).told.at(-1),
      ).toMatchObject({
        kind: 'record-sent',
        record: 'production-registration',
        change: true,
      })
      const queued = async () =>
        (
          (await (
            await ctx.app.inject({ method: 'GET', url: '/v1/queue', cookies: admin })
          ).json()) as { items: { kind: string; project: { id: string } }[] }
        ).items
          .filter((i) => i.project.id === ctx.project.id)
          .map((i) => i.kind)
      expect(await queued()).toEqual(['iam-change-to-file'])
      // THE RELEASE SERVING PRODUCTION'S CANDIDATE ASKS FOR NOTHING NEW: met, saying where the change is.
      const meanwhile = await live()
      expect(meanwhile.state).toBe('met')
      expect(meanwhile.why).toContain('A change is with the Manifest team since')

      // THE TEAM FILES IT WITH UBC IAM.
      const filed = await post(
        ctx,
        `${recordUrl}/production/submission`,
        { reference: 'IAM-CHG-1' },
        admin,
      )
      expect(filed).toMatchObject({
        state: 'change_requested',
        changeRequestedFrom: 'active',
        requestedAttributes: ['ubcEduCwlPuid', 'mail', 'sn'],
        externalTicketRef: 'IAM-CHG-1',
      })
      expect(await queued()).toEqual(['iam-change-request'])
      expect((await live()).state).toBe('met')

      // UBC REGISTERS IT, recorded through `submitted`: nothing requested any more.
      await post(ctx, recordUrl, { ...registered.production, state: 'submitted' }, admin)
      const answered = await post(
        ctx,
        recordUrl,
        {
          ...registered.production,
          registeredAttributes: ['ubcEduCwlPuid', 'mail', 'sn'],
          state: 'active',
        },
        admin,
      )
      expect(answered).toMatchObject({
        state: 'active',
        registeredAttributes: ['ubcEduCwlPuid', 'mail', 'sn'],
        requestedAttributes: null,
      })
      expect(await queued()).toEqual([])
    })
  })

  /**
   * UBC'S QUESTIONS ON A FILED CHANGE (the whole-branch review's I1): UBC takes the change request up, then
   * asks its owner for changes (`change_requested` from `submitted`) — UBC's registration still in force. The
   * owner's new draft is still a CHANGE: drawn from the newest valid manifest, never from the release serving
   * staging (whose build is refused until UBC registers the attribute), and sent asking for it — or the
   * attribute would be dropped silently, the record still claiming it.
   */
  it('UBC asks the owner about a filed change: drafted again from the newest valid manifest and sent asking for it — nothing dropped; the team re-submits it', async () => {
    await withCwlProject(['ubcEduCwlPuid', 'mail'], async (ctx) => {
      const admin = await loginAs(ctx.deps, 'platform_admin')
      const recordUrl = `/v1/projects/${ctx.project.id}/launch-records/iam-registration`
      await cwlPiaApproved(ctx)
      await stage(ctx)
      const registered: Record<string, Json> = {}
      for (const environment of ['staging', 'production'] as const) {
        const pkg = packageOf((await draft(ctx, environment)).json())
        registered[environment] = {
          environment,
          entityId: pkg.entityId,
          acsUrl: pkg.acsUrl,
          sloUrl: pkg.sloUrl,
          registeredAttributes: pkg.attributes.map((a) => a.name),
          externalTicketRef: `IAM-${environment}`,
        }
        for (const state of ['submitted', 'active'] as const)
          await post(ctx, recordUrl, { ...registered[environment], state }, admin)
      }
      await ctx.deps.db
        .update(projects)
        .set({ launchedAt: new Date() })
        .where(eq(projects.id, ctx.project.id))
      const live = async () =>
        (
          (await (
            await ctx.app.inject({
              method: 'GET',
              url: `/v1/projects/${ctx.project.id}/launch-readiness`,
              cookies: ctx.ownerCookies,
            })
          ).json()) as { items: { id: string; state: string; why: string }[] }
        ).items.find((i) => i.id === 'iam-registration')!
      const sendProduction = (body: Json) =>
        ctx.app.inject({
          method: 'POST',
          url: `${recordUrl}/production/send`,
          payload: body,
          cookies: ctx.ownerCookies,
          headers: mutationHeaders(ctx.deps),
        })
      const newer = await commitManifest(
        { app: ctx.app, deps: ctx.deps, cookies: ctx.ownerCookies, project: ctx.project },
        cwlManifest(ctx.project.slug, ['ubcEduCwlPuid', 'mail', 'sn']),
        'feat: family names',
      )
      const change = packageOf((await draft(ctx, 'production')).json())
      expect(
        (await sendProduction({ draftGeneratedAt: change.generatedAt })).statusCode,
      ).toBe(200)
      await post(
        ctx,
        `${recordUrl}/production/submission`,
        { reference: 'IAM-CHG-1' },
        admin,
      )

      // UBC TAKES IT UP, THEN ASKS ITS OWNER FOR CHANGES — its registration of the four still in force.
      await post(ctx, recordUrl, { ...registered.production, state: 'submitted' }, admin)
      const asked = await post(
        ctx,
        recordUrl,
        { ...registered.production, state: 'change_requested' },
        admin,
      )
      expect(asked).toMatchObject({
        state: 'change_requested',
        changeRequestedFrom: 'submitted',
        registeredAttributes: ['ubcEduCwlPuid', 'mail'],
      })
      expect((await live()).state).toBe('met')

      // DRAFTED AGAIN: still the change — from the newest valid manifest, asking for sn.
      const again = await draft(ctx, 'production')
      expect(again.statusCode, again.body).toBe(200)
      const redrafted = packageOf(again.json())
      expect(redrafted.attributes.map((a) => a.name)).toEqual([
        'ubcEduCwlPuid',
        'mail',
        'sn',
      ])
      expect(redrafted.fromCommit).toBe(newer.commitSha)
      expect(redrafted.warnings).toContain(CHANGE_DRAWN)

      // SENT: asking for sn, what UBC registered untouched; the team re-submits it to UBC (`submitted`).
      const sent = await sendProduction({ draftGeneratedAt: redrafted.generatedAt })
      expect(sent.statusCode, sent.body).toBe(200)
      expect(sent.json()).toMatchObject({
        state: 'sent',
        sentFrom: 'change_requested',
        requestedAttributes: ['ubcEduCwlPuid', 'mail', 'sn'],
        registeredAttributes: ['ubcEduCwlPuid', 'mail'],
      })
      expect((await live()).state).toBe('met')
      const resubmitted = await post(
        ctx,
        `${recordUrl}/production/submission`,
        { reference: 'IAM-CHG-1' },
        admin,
      )
      expect(resubmitted).toMatchObject({
        state: 'submitted',
        requestedAttributes: ['ubcEduCwlPuid', 'mail', 'sn'],
        registeredAttributes: ['ubcEduCwlPuid', 'mail'],
      })
      expect((await live()).state).toBe('met')
    })
  })
})

/**
 * FE-55 (Rich, 2026-10-08: the FE-46/47/5 plan's Task 7): a CWL app that asks for NO attribute validated, built
 * and released, and then every deploy answered `500 INTERNAL` — the SP's registration refused an empty attribute
 * list (§9's fail-open case) in a way no client could read. Validation now refuses it at the field; a release
 * made before the rule is refused at the deploy, typed, before anything starts.
 */
describe('a CWL app that asks for no attribute (FE-55)', () => {
  it('validation refuses it at auth.attributes; a release made before the rule is refused at deploy — 409 RELEASE_CWL_NO_ATTRIBUTES, never 500 — before anything starts', async () => {
    await withCwlProject(['ubcEduCwlPuid', 'mail'], async (ctx) => {
      // THE POSITIVE CONTROL: the release asking for two attributes deploys.
      await stage(ctx)
      const none = (await commitManifest(
        { app: ctx.app, deps: ctx.deps, cookies: ctx.ownerCookies, project: ctx.project },
        cwlManifest(ctx.project.slug, []),
        'feat: sign in, asking nothing',
        { valid: false },
      )) as unknown as { errors: { code: string; path: string }[] }
      expect(none.errors).toEqual([
        expect.objectContaining({
          code: 'SPEC_CWL_NO_ATTRIBUTES',
          path: 'auth.attributes',
        }),
      ])
      const [release] = await ctx.deps.db
        .select()
        .from(releases)
        .where(eq(releases.projectId, ctx.project.id))
      // A RELEASE MADE BEFORE THE RULE: its frozen config asks for none.
      const frozen = release!.resolvedConfig as Record<string, { auth: Json }>
      await ctx.deps.db
        .update(releases)
        .set({
          resolvedConfig: Object.fromEntries(
            Object.entries(frozen).map(([kind, config]) => [
              kind,
              { ...config, auth: { ...config.auth, attributes: [] } },
            ]),
          ),
        })
        .where(eq(releases.id, release!.id))
      const staging = ctx.project.environments.find((e) => e.kind === 'staging')!
      const before = await ctx.deps.db
        .select()
        .from(instances)
        .where(eq(instances.environmentId, staging.id))
      const ensure = vi.spyOn(ctx.deps.driver, 'ensureInstances')
      const refused = await ctx.app.inject({
        method: 'POST',
        url: `/v1/environments/${staging.id}/deploy`,
        payload: { releaseId: release!.id },
        cookies: ctx.ownerCookies,
        headers: mutationHeaders(ctx.deps),
      })
      expect(refusal(refused)).toEqual({ status: 409, code: 'RELEASE_CWL_NO_ATTRIBUTES' })
      expect(refused.body).toContain('auth.attributes')
      expect(ensure).not.toHaveBeenCalled()
      expect(
        await ctx.deps.db
          .select()
          .from(instances)
          .where(eq(instances.environmentId, staging.id)),
      ).toEqual(before)
    })
  })
})
