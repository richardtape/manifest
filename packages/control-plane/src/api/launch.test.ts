import pg from 'pg'
import { describe, expect, it } from 'vitest'
import { ensureTestUser } from '../identity/testing.js'
import {
  vancouverDaysAgo,
  vancouverToday,
  withAssessmentDraft,
  withDraft,
} from '../launch/testing.js'
import { vancouverNoon } from '../launch/index.js'
import { mintTestToken } from '../tokens/testing.js'
import {
  loginAs,
  mutationHeaders,
  refusal,
  sessionFor,
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

function submit(
  ctx: TestProject,
  what: 'staging' | 'production' | 'privacy-assessment',
  body: Json,
  credentials: { cookies?: Record<string, string>; bearer?: string },
) {
  const url =
    what === 'privacy-assessment'
      ? `/v1/projects/${ctx.projectId}/launch-records/privacy-assessment/submission`
      : `/v1/projects/${ctx.projectId}/launch-records/iam-registration/${what}/submission`
  return ctx.app.inject({
    method: 'POST',
    url,
    payload: body,
    ...(credentials.cookies === undefined ? {} : { cookies: credentials.cookies }),
    headers: {
      ...mutationHeaders(ctx.deps),
      ...(credentials.bearer === undefined
        ? {}
        : { authorization: `Bearer ${credentials.bearer}` }),
    },
  })
}

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

describe('an owner says “I’ve sent it” (Task 9)', () => {
  it('an owner says the production registration was sent; it waits since that day, and the checklist says so', async () => {
    await withProjectServer(async (ctx) => {
      await piaApproved(ctx)
      await stagingActive(ctx)
      await withDraft(ctx.db, { projectId: ctx.projectId, environment: 'production' })
      const today = vancouverToday()
      const res = await submit(
        ctx,
        'production',
        { sentAt: today, reference: 'IAM-2026-0500' },
        { cookies: ctx.ownerCookies },
      )
      expect(res.statusCode, res.body).toBe(200)
      const sentAt = vancouverNoon(today).toISOString()
      expect(res.json()).toMatchObject({
        environment: 'production',
        state: 'submitted',
        submittedAt: sentAt,
        submittedBy: { id: ctx.userId, displayName: 'Bio Prof' },
        externalTicketRef: 'IAM-2026-0500',
      })
      const item = (await readiness(ctx)).items.find((i) => i.id === 'iam-registration')!
      expect(item).toMatchObject({ state: 'unmet', since: sentAt })
      const inWords = new Intl.DateTimeFormat('en-CA', {
        dateStyle: 'long',
        timeZone: 'America/Vancouver',
      }).format(new Date(sentAt))
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
      expect(both.iamRegistration?.createdAt).toEqual(expect.any(String))
    })
  })

  it('an owner says the privacy assessment was sent; it waits since that day', async () => {
    await withProjectServer(async (ctx) => {
      await withAssessmentDraft(ctx.db, { projectId: ctx.projectId })
      const res = await submit(
        ctx,
        'privacy-assessment',
        { reference: 'PIA-2026-0101' },
        { cookies: ctx.ownerCookies },
      )
      expect(res.statusCode, res.body).toBe(200)
      const sentAt = vancouverNoon(vancouverToday()).toISOString()
      expect(res.json()).toMatchObject({
        state: 'submitted',
        submittedAt: sentAt,
        submittedBy: { displayName: 'Bio Prof' },
        externalTicketRef: 'PIA-2026-0101',
      })
      const item = (await readiness(ctx)).items.find(
        (i) => i.id === 'privacy-assessment',
      )!
      expect(item).toMatchObject({ state: 'unmet', since: sentAt })
    })
  })

  it('refuses a submission with no draft — 409 LAUNCH_DRAFT_REQUIRED', async () => {
    await withProjectServer(async (ctx) => {
      await piaApproved(ctx)
      const refused = await submit(ctx, 'staging', {}, { cookies: ctx.ownerCookies })
      expect(refusal(refused)).toEqual({ status: 409, code: 'LAUNCH_DRAFT_REQUIRED' })
      expect((await records(ctx)).stagingRegistration).toBeNull()
      // THE POSITIVE CONTROL: the same request once the draft exists.
      await withDraft(ctx.db, { projectId: ctx.projectId, environment: 'staging' })
      const sent = await submit(ctx, 'staging', {}, { cookies: ctx.ownerCookies })
      expect(refusal(sent)).toEqual({ status: 200, code: undefined })
    })
  })

  it('refuses a sentAt in the future, or before the draft — 400 LAUNCH_SENT_AT_INVALID — and one not a date — 400 REQUEST_INVALID', async () => {
    await withProjectServer(async (ctx) => {
      await piaApproved(ctx)
      await withDraft(ctx.db, { projectId: ctx.projectId, environment: 'staging' })
      const as = { cookies: ctx.ownerCookies }
      expect(
        refusal(await submit(ctx, 'staging', { sentAt: vancouverDaysAgo(-2) }, as)),
      ).toEqual({ status: 400, code: 'LAUNCH_SENT_AT_INVALID' })
      expect(
        refusal(await submit(ctx, 'staging', { sentAt: vancouverDaysAgo(9) }, as)),
      ).toEqual({ status: 400, code: 'LAUNCH_SENT_AT_INVALID' })
      expect(
        refusal(await submit(ctx, 'staging', { sentAt: 'last Tuesday' }, as)),
      ).toEqual({
        status: 400,
        code: 'REQUEST_INVALID',
      })
      // The whole-branch review's I2: shaped like a day and not one — refused, never rolled over to
      // March 2 (or to a month before the draft).
      for (const impossible of ['2026-02-30', '2026-00-15', '2025-13-01'])
        expect(
          refusal(await submit(ctx, 'staging', { sentAt: impossible }, as)),
          impossible,
        ).toEqual({ status: 400, code: 'REQUEST_INVALID' })
      // Positive control: today.
      expect(
        refusal(await submit(ctx, 'staging', { sentAt: vancouverToday() }, as)),
      ).toEqual({ status: 200, code: undefined })
    })
  })

  it('refuses a token outright — TOKEN_CREDENTIAL_REFUSED, before the project is read — and a collaborator may submit', async () => {
    await withProjectServer(async (ctx) => {
      await piaApproved(ctx)
      await withDraft(ctx.db, { projectId: ctx.projectId, environment: 'staging' })
      const owner = await ensureTestUser(ctx.db, 'bio_prof')
      // A token row HOLDING `launch:submit` — written directly, since the mint route refuses it.
      const { plaintext } = await mintTestToken(ctx.db, {
        userId: owner.id,
        projectId: ctx.projectId,
        capabilities: ['project:read', 'launch:submit'],
      })
      expect(refusal(await submit(ctx, 'staging', {}, { bearer: plaintext }))).toEqual({
        status: 403,
        code: 'TOKEN_CREDENTIAL_REFUSED',
      })
      expect((await records(ctx)).stagingRegistration).toMatchObject({ state: 'draft' })
      const collaborator = await sessionFor(ctx, 'bio_colleague', 'collaborator')
      const sent = await submit(ctx, 'staging', {}, { cookies: collaborator })
      expect(sent.statusCode, sent.body).toBe(200)
      expect(sent.json()).toMatchObject({ submittedBy: { displayName: 'Bio Colleague' } })
    })
  })

  it('a stranger is answered 404 NOT_FOUND, and learns nothing', async () => {
    await withProjectServer(async (ctx) => {
      await withDraft(ctx.db, { projectId: ctx.projectId, environment: 'staging' })
      const stranger = await sessionFor(ctx, 'unrelated_user')
      expect(refusal(await submit(ctx, 'staging', {}, { cookies: stranger }))).toEqual({
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
      expect(refusal(await submit(ctx, 'staging', {}, as))).toEqual({
        status: 409,
        code: 'LAUNCH_PIA_NOT_APPROVED',
      })
      // The whole-branch review's I3: "neither of an app's registrations is sent until the assessment
      // is approved" — production's waits for it FIRST, before staging's.
      expect(refusal(await submit(ctx, 'production', {}, as))).toEqual({
        status: 409,
        code: 'LAUNCH_PIA_NOT_APPROVED',
      })
      await piaApproved(ctx)
      expect(refusal(await submit(ctx, 'production', {}, as))).toEqual({
        status: 409,
        code: 'LAUNCH_STAGING_NOT_REGISTERED',
      })
      expect(refusal(await submit(ctx, 'staging', {}, as))).toEqual({
        status: 200,
        code: undefined,
      })
      // Sent is not registered: production still waits.
      expect(refusal(await submit(ctx, 'production', {}, as))).toEqual({
        status: 409,
        code: 'LAUNCH_STAGING_NOT_REGISTERED',
      })
      await adminRecords(ctx, 'iam-registration', {
        ...IAM_BODY(ctx, 'staging'),
        environment: 'staging',
        state: 'active',
      })
      expect(refusal(await submit(ctx, 'production', {}, as))).toEqual({
        status: 200,
        code: undefined,
      })
    })
  })

  it('refuses a second submission of a submitted record — 409 LAUNCH_TRANSITION_INVALID', async () => {
    await withProjectServer(async (ctx) => {
      await withAssessmentDraft(ctx.db, { projectId: ctx.projectId })
      const as = { cookies: ctx.ownerCookies }
      expect(refusal(await submit(ctx, 'privacy-assessment', {}, as)).status).toBe(200)
      expect(refusal(await submit(ctx, 'privacy-assessment', {}, as))).toEqual({
        status: 409,
        code: 'LAUNCH_TRANSITION_INVALID',
      })
    })
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
describe('a submission and an administrator’s write cannot interleave (the whole-branch review’s I1)', () => {
  it('a registration moved to submitted while the owner’s submission waits is not submitted again — 409 LAUNCH_TRANSITION_INVALID, the first stamp kept', async () => {
    await withProjectServer(async (ctx) => {
      await piaApproved(ctx)
      const draft = await withDraft(ctx.db, {
        projectId: ctx.projectId,
        environment: 'staging',
      })
      const first = '2026-09-01T19:00:00.000Z'
      let answered: Awaited<ReturnType<typeof submit>> | undefined
      await holdingThen(
        'SELECT 1 FROM iam_registrations WHERE id = $1 FOR UPDATE',
        [draft.id],
        // What an administrator's record of the request does in the window.
        `UPDATE iam_registrations SET state = 'submitted', submitted_at = '${first}' WHERE id = '${draft.id}'`,
        async (lock) => {
          const submitting = submit(ctx, 'staging', {}, { cookies: ctx.ownerCookies })
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
      expect(await submittedEvents(ctx)).toBe(0)
    })
  })

  it('an assessment moved back to draft while the staging submission waits refuses it — 409 LAUNCH_PIA_NOT_APPROVED', async () => {
    await withProjectServer(async (ctx) => {
      await piaApproved(ctx)
      await withDraft(ctx.db, { projectId: ctx.projectId, environment: 'staging' })
      let answered: Awaited<ReturnType<typeof submit>> | undefined
      await holdingThen(
        'SELECT 1 FROM privacy_assessments WHERE project_id = $1 FOR UPDATE',
        [ctx.projectId],
        // An administrator recording the Privacy Office reopening it (`approved → draft`).
        `UPDATE privacy_assessments SET state = 'draft', approved_at = NULL WHERE project_id = '${ctx.projectId}'`,
        async (lock) => {
          const submitting = submit(ctx, 'staging', {}, { cookies: ctx.ownerCookies })
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
})

describe('an administrator’s record keeps the owner’s reference (the whole-branch review’s M2)', () => {
  it('recording UBC’s answer without a ticket keeps the reference the owner sent; one given replaces it', async () => {
    await withProjectServer(async (ctx) => {
      await withAssessmentDraft(ctx.db, { projectId: ctx.projectId })
      const sent = await submit(
        ctx,
        'privacy-assessment',
        { reference: 'PIA-2026-0101' },
        { cookies: ctx.ownerCookies },
      )
      expect(sent.statusCode, sent.body).toBe(200)
      const approved = await adminRecords(ctx, 'privacy-assessment', {
        state: 'approved',
      })
      // Kept — so the staging gate still finds the PIA number the owner gave.
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

/** How many `iam_registration.submitted` events the project has, read as the database's owner. */
async function submittedEvents(ctx: TestProject): Promise<number> {
  const admin = new pg.Pool({ connectionString: process.env.MANIFEST_ADMIN_DATABASE_URL })
  try {
    const { rows } = await admin.query<{ n: string }>(
      `SELECT count(*) AS n FROM audit.events WHERE project_id = $1 AND type = 'iam_registration.submitted'`,
      [ctx.projectId],
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
