import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { approvals, builds, events } from '../db/index.js'
import { resetDatabase } from '../db/testing.js'
// `api/index.js`, not `api/server.js`: `module-boundaries.test.ts` allows a module's
// `index` and its `testing` and nothing else, and it caught this import the first time it
// was written the other way.
import { buildServer } from '../api/index.js'
import { loginAs, mutationHeaders, projectBody, testDeps } from '../api/testing.js'
import { mintTestToken } from '../tokens/testing.js'
import { ensureTestUser } from '../identity/testing.js'
import { approvalCoversDigest } from './approval.js'

beforeEach(resetDatabase)
afterAll(resetDatabase)

const DIGEST = `sha256:${'a'.repeat(64)}`

/**
 * A project with a succeeded build and a release, and the three sessions this file needs.
 *
 * `admin` is `platform_admin`, who holds `release:approve` by PLATFORM ROLE and by no
 * membership — which is the point of §13's approval: the person who decides is not the
 * person who asked.
 */
async function releasedProject(slug = 'chem-labs') {
  const deps = await testDeps()
  const app = await buildServer(deps)
  const owner = await loginAs(deps, 'bio_prof')
  const project = (
    await app.inject({
      method: 'POST',
      url: '/v1/projects',
      payload: projectBody(slug),
      cookies: owner,
      headers: mutationHeaders(deps),
    })
  ).json()
  const started = await app.inject({
    method: 'POST',
    url: `/v1/projects/${project.id}/builds`,
    payload: {},
    cookies: owner,
    headers: mutationHeaders(deps),
  })
  expect(started.statusCode, started.body).toBe(202)
  await deps.builds.idle()
  const build = (
    await app.inject({
      method: 'GET',
      url: `/v1/builds/${started.json().id}`,
      cookies: owner,
    })
  ).json()
  expect(build.status, JSON.stringify(build)).toBe('succeeded')
  const release = await app.inject({
    method: 'POST',
    url: `/v1/projects/${project.id}/releases`,
    payload: { buildId: build.id },
    cookies: owner,
    headers: mutationHeaders(deps),
  })
  expect(release.statusCode, release.body).toBe(201)
  return {
    app,
    deps,
    project,
    build,
    owner,
    release: release.json(),
    admin: await loginAs(deps, 'platform_admin', { steppedUp: true }),
    adminFlat: await loginAs(deps, 'platform_admin'),
  }
}

/** The staging deploy, so the checklist has a CANDIDATE to read an approval against. */
async function servingStaging(ctx: Awaited<ReturnType<typeof releasedProject>>) {
  const staging = ctx.project.environments.find(
    (e: { kind: string }) => e.kind === 'staging',
  )
  const deployed = await ctx.app.inject({
    method: 'POST',
    url: `/v1/environments/${staging.id}/deploy`,
    payload: { releaseId: ctx.release.id },
    cookies: ctx.owner,
    headers: mutationHeaders(ctx.deps),
  })
  expect(deployed.statusCode, deployed.body).toBe(200)
  expect(deployed.json().state, deployed.body).toBe('healthy')
}

const refusal = (res: { statusCode: number; body: string }) => ({
  status: res.statusCode,
  code: (JSON.parse(res.body) as { error?: { code?: string } }).error?.code,
})

describe('§13’s approval — `release:approve`’s first caller (P6a Task 10)', () => {
  it('approves a release, binds its digest, and records who and when', async () => {
    /**
     * **THE POSITIVE CONTROL, AND IT COMES FIRST** (Global Constraints, P5c F16): every
     * test below this one is a refusal, and a route that refused everything would pass
     * all of them. This is the pair that makes them mean something.
     */
    const ctx = await releasedProject()
    const frames: { kind: string; type?: string; machineDetail?: unknown }[] = []
    ctx.deps.bus.subscribe(ctx.project.id, (f) => frames.push(f as never))

    const approved = await ctx.app.inject({
      method: 'POST',
      url: `/v1/releases/${ctx.release.id}/approve`,
      payload: { reason: 'the scan is clean and the diff is what the ticket says' },
      cookies: ctx.admin,
      headers: mutationHeaders(ctx.deps),
    })
    expect(approved.statusCode, approved.body).toBe(201)
    const body = approved.json()

    // **THE BINDING, ASSERTED AGAINST THE BUILD'S OWN DIGEST** (§13). Not that a digest
    // arrived — that a `sha256:…` string arrived would be true of any value the route
    // invented — but that it is the digest of the image this release names.
    expect(body.imageDigest).toBe(ctx.build.imageDigest)
    expect(body.imageDigest).toMatch(/^sha256:[0-9a-f]{64}$/)
    // Non-repudiable: WHO and WHEN, off the row rather than off the request.
    const admin = await ensureTestUser(ctx.deps.db, 'platform_admin')
    expect(body.decidedBy).toBe(admin.id)
    expect(Date.parse(body.decidedAt)).toBeGreaterThan(Date.now() - 60_000)
    expect(body.decision).toBe('approved')
    expect(body.releaseId).toBe(ctx.release.id)
    expect(body.reason).toContain('the ticket says')
    // The diff snapshot is STORED on the row and carries the same digest (Decision 6).
    expect(body.diff.imageDigest).toBe(ctx.build.imageDigest)
    expect(body.diff.review.state).toBe('not_performed')

    /**
     * **THE EVENT CARRIES THE DIGEST AND NOT THE DIFF** (§14, by omission). An event goes
     * on a project's public stream, and a manifest diff can name services, attributes and
     * egress destinations — so the assertion is on what is ABSENT as much as on what is
     * there. The digest is truncated, which is enough to recognise and not enough to be
     * mistaken for the binding itself.
     */
    const approvedEvent = frames.find(
      (f) => f.kind === 'event' && f.type === 'release.approved',
    )!
    expect(approvedEvent, JSON.stringify(frames)).toBeDefined()
    expect(approvedEvent.machineDetail).toEqual({
      releaseId: ctx.release.id,
      imageDigest: ctx.build.imageDigest.slice(0, 19),
      decision: 'approved',
    })
    const [stored] = await ctx.deps.db
      .select()
      .from(events)
      .where(eq(events.type, 'release.approved'))
    expect(JSON.stringify(stored)).not.toContain('"changes"')
    await ctx.app.close()
  })

  it('refuses an approval from a session that has not stepped up: 403 STEP_UP_REQUIRED', async () => {
    // §20's second round trip, on `release:approve` — which is NOT one of D24's privileged
    // four and is step-up-guarded anyway (`STEP_UP_GUARDED` is `PRIVILEGED ∪ {this}`).
    const ctx = await releasedProject()
    const refused = await ctx.app.inject({
      method: 'POST',
      url: `/v1/releases/${ctx.release.id}/approve`,
      payload: {},
      cookies: ctx.adminFlat,
      headers: mutationHeaders(ctx.deps),
    })
    expect(refusal(refused)).toEqual({ status: 403, code: 'STEP_UP_REQUIRED' })
    // AND NOTHING WAS WRITTEN. A refusal that recorded an approval anyway would satisfy
    // §13's gate while telling the client it had not.
    expect(await ctx.deps.db.select().from(approvals)).toHaveLength(0)
    await ctx.app.close()
  })

  it('refuses an approval from an owner who is not a platform admin: 403 FORBIDDEN', async () => {
    /**
     * **AND `FORBIDDEN` RATHER THAN `STEP_UP_REQUIRED` IS THE ORDERING ASSERTION.** The
     * owner's session has not stepped up either, so if the freshness check ran first this
     * row would read `STEP_UP_REQUIRED` — somebody who may never approve, sent on a round
     * trip that would not help them. Asserting the CODE is the only way to see which.
     */
    const ctx = await releasedProject()
    const refused = await ctx.app.inject({
      method: 'POST',
      url: `/v1/releases/${ctx.release.id}/approve`,
      payload: {},
      cookies: ctx.owner,
      headers: mutationHeaders(ctx.deps),
    })
    expect(refusal(refused)).toEqual({ status: 403, code: 'FORBIDDEN' })
    await ctx.app.close()
  })

  it('refuses a delegated token HOLDING release:approve: 403 TOKEN_CREDENTIAL_REFUSED', async () => {
    /**
     * `[M6]`'S FINDING TURNED INTO A TEST. `release:approve` is not one of D24's
     * `PRIVILEGED` four, so the mint route WOULD issue this token to an administrator —
     * `mintTestToken` with exactly this capability is that token, not one the platform
     * cannot make (P5b sitting 4's F1). **The control is `requireSession` on the route**,
     * and without it an agent could approve a production release on its own authority.
     */
    const ctx = await releasedProject()
    const { plaintext } = await mintTestToken(ctx.deps.db, {
      userId: (await ensureTestUser(ctx.deps.db, 'platform_admin')).id,
      projectId: ctx.project.id,
      capabilities: ['release:approve'],
      name: 'an agent that would approve its own work',
    })
    const refused = await ctx.app.inject({
      method: 'POST',
      url: `/v1/releases/${ctx.release.id}/approve`,
      payload: {},
      headers: { ...mutationHeaders(ctx.deps), authorization: `Bearer ${plaintext}` },
    })
    // NOT `TOKEN_ACTION_PENDING`: no pending action is ever created, because this
    // capability is not one of D24's four. The code is the only way to see that.
    expect(refusal(refused)).toEqual({ status: 403, code: 'TOKEN_CREDENTIAL_REFUSED' })
    expect(await ctx.deps.db.select().from(approvals)).toHaveLength(0)
    await ctx.app.close()
  })

  it('refuses a rejection with no reason: 400, and the database refuses it too', async () => {
    const ctx = await releasedProject()
    const refused = await ctx.app.inject({
      method: 'POST',
      url: `/v1/releases/${ctx.release.id}/reject`,
      payload: {},
      cookies: ctx.admin,
      headers: mutationHeaders(ctx.deps),
    })
    expect(refusal(refused)).toEqual({ status: 400, code: 'REQUEST_INVALID' })

    // AND A REASON MADE OF SPACES, which is the case `min(1)` alone does NOT catch and the
    // one control (e) is aimed at. Measured: with `.trim()` absent from the schema this
    // request reached the database and was answered `500 INTERNAL` — a client error wearing
    // a server error's clothes (P6a sitting 7, F3).
    const blank = await ctx.app.inject({
      method: 'POST',
      url: `/v1/releases/${ctx.release.id}/reject`,
      payload: { reason: '   ' },
      cookies: ctx.admin,
      headers: mutationHeaders(ctx.deps),
    })
    expect(refusal(blank)).toEqual({ status: 400, code: 'REQUEST_INVALID' })

    /**
     * **BELT AND BRACES, AND THIS LINE SAYS WHICH IS WHICH** (`records.test.ts`'s
     * pattern). The refusal above is `RejectReleaseRequest`'s `min(1)`; this is the
     * `approvals_rejection_has_reason` CHECK, reached by writing past the schema.
     */
    // The CONSTRAINT BY NAME, off the cause chain — drizzle's own message quotes only the
    // statement, so `toThrow(/approvals_rejection_has_reason/)` is green for ANY failed
    // insert into this table. `expectSqlState`'s `23514` would be satisfied by a different
    // CHECK; the name is what says which rule refused.
    const refusedByDatabase = await ctx.deps.db
      .insert(approvals)
      .values({
        releaseId: ctx.release.id,
        projectId: ctx.project.id,
        decision: 'rejected',
        decidedBy: (await ensureTestUser(ctx.deps.db, 'platform_admin')).id,
        imageDigest: ctx.build.imageDigest,
        reason: '   ',
        diffSnapshot: {
          imageDigest: ctx.build.imageDigest,
          changes: [],
          services: [],
          attributes: [],
          resources: {},
          summary: null,
          summarySource: 'unavailable',
          review: { state: 'not_performed', reviewer: 'none', detail: 'none' },
        },
      })
      .then(
        () => undefined,
        (error: unknown) => error,
      )
    const constraints: string[] = []
    for (let e: unknown = refusedByDatabase; e instanceof Error; e = e.cause) {
      const named = (e as unknown as { constraint?: unknown }).constraint
      if (typeof named === 'string') constraints.push(named)
    }
    expect(constraints).toContain('approvals_rejection_has_reason')
    await ctx.app.close()
  })

  it('a rejection is readable by the project owner, with the administrator’s words', async () => {
    // A decision only its maker can read is not a decision anybody can act on (D23.7), so
    // `getApproval` is a `project:read` and the owner is who this test speaks for.
    const ctx = await releasedProject()
    const rejected = await ctx.app.inject({
      method: 'POST',
      url: `/v1/releases/${ctx.release.id}/reject`,
      payload: {
        reason: 'this release adds an egress destination the PIA does not cover',
      },
      cookies: ctx.admin,
      headers: mutationHeaders(ctx.deps),
    })
    expect(rejected.statusCode, rejected.body).toBe(201)

    const read = await ctx.app.inject({
      method: 'GET',
      url: `/v1/releases/${ctx.release.id}/approval`,
      cookies: ctx.owner,
    })
    expect(read.statusCode, read.body).toBe(200)
    expect(read.json().decision).toBe('rejected')
    expect(read.json().reason).toContain('the PIA does not cover')
    await ctx.app.close()
  })

  it('records every decision as its own row — two decisions leave TWO rows, newest read back', async () => {
    /**
     * **INSERT ONLY** (§13's *Integrity of the gate*, whose first hole is "edit the
     * record"). Control (d): `recordApproval` updating instead of inserting leaves the
     * rejection test above green and this one red, which is why this test exists rather
     * than resting on that one.
     */
    const ctx = await releasedProject()
    const decide = (kind: 'approve' | 'reject', reason: string) =>
      ctx.app.inject({
        method: 'POST',
        url: `/v1/releases/${ctx.release.id}/${kind}`,
        payload: { reason },
        cookies: ctx.admin,
        headers: mutationHeaders(ctx.deps),
      })
    expect((await decide('reject', 'the scan is stale')).statusCode).toBe(201)
    expect((await decide('approve', 'rebuilt against a fresh database')).statusCode).toBe(
      201,
    )

    expect(await ctx.deps.db.select().from(approvals)).toHaveLength(2)
    const read = await ctx.app.inject({
      method: 'GET',
      url: `/v1/releases/${ctx.release.id}/approval`,
      cookies: ctx.owner,
    })
    expect(read.json().decision).toBe('approved')
    expect(read.json().reason).toContain('fresh database')
    await ctx.app.close()
  })

  it('answers 404 when nobody has decided, and hides the release from a stranger', async () => {
    const ctx = await releasedProject()
    const none = await ctx.app.inject({
      method: 'GET',
      url: `/v1/releases/${ctx.release.id}/approval`,
      cookies: ctx.owner,
    })
    expect(refusal(none)).toEqual({ status: 404, code: 'NOT_FOUND' })
    // The same answer for somebody with no business knowing the release exists — the
    // enumeration-oracle rule, which is why this route answers NOT_FOUND and never
    // RELEASE_NOT_FOUND.
    const stranger = await ctx.app.inject({
      method: 'GET',
      url: `/v1/releases/${ctx.release.id}/approval`,
      cookies: await loginAs(ctx.deps, 'unrelated_user'),
    })
    expect(refusal(stranger)).toEqual({ status: 404, code: 'NOT_FOUND' })
    await ctx.app.close()
  })
})

describe('§13’s checklist reads the approval (Decision 11)', () => {
  it('`admin-approval` is met once the candidate is approved, naming the digest', async () => {
    const ctx = await releasedProject()
    await servingStaging(ctx)
    const item = async () =>
      (
        await ctx.app.inject({
          method: 'GET',
          url: `/v1/projects/${ctx.project.id}/launch-readiness`,
          cookies: ctx.owner,
        })
      )
        .json()
        .items.find((i: { id: string }) => i.id === 'admin-approval')

    // BEFORE: unmet, and NOT `not_built` — which said "approvals are built with production
    // environments" and stopped being true the moment this route existed.
    expect(await item()).toMatchObject({ state: 'unmet', blocking: true })
    expect((await item()).builtBy).toBeUndefined()
    expect((await item()).why).toContain('has not been reviewed yet')

    await ctx.app.inject({
      method: 'POST',
      url: `/v1/releases/${ctx.release.id}/approve`,
      payload: {},
      cookies: ctx.admin,
      headers: mutationHeaders(ctx.deps),
    })
    const met = await item()
    expect(met.state).toBe('met')
    expect(met.why).toContain(ctx.build.imageDigest.slice(0, 19))
    await ctx.app.close()
  })

  it('a rejected candidate is unmet, in the administrator’s own words', async () => {
    const ctx = await releasedProject()
    await servingStaging(ctx)
    await ctx.app.inject({
      method: 'POST',
      url: `/v1/releases/${ctx.release.id}/reject`,
      payload: { reason: 'the egress list grew and the PIA has not seen it' },
      cookies: ctx.admin,
      headers: mutationHeaders(ctx.deps),
    })
    const view = await ctx.app.inject({
      method: 'GET',
      url: `/v1/projects/${ctx.project.id}/launch-readiness`,
      cookies: ctx.owner,
    })
    const item = view.json().items.find((i: { id: string }) => i.id === 'admin-approval')
    expect(item.state).toBe('unmet')
    expect(item.why).toContain('the PIA has not seen it')
    await ctx.app.close()
  })

  /**
   * **DECISION 11, AND THE STATE IT DESCRIBES IS ONE NO ROUTE CAN PRODUCE TODAY** —
   * measured while writing this task, and recorded rather than papered over. A release's
   * `build_id` is immutable and `builds.image_digest` is written exactly once, when a
   * build succeeds (`finishBuild`), so the digest under an approved release cannot move:
   * a rebuild is a NEW build, a new release and a checklist that reads *"has not been
   * reviewed yet"*. **This test therefore writes the digest directly**, which is what a
   * rebuild-in-place would do, and is honest about it.
   *
   * The branch stays because §13's binding is the claim — and because Task 15 gives
   * `approvalCoversDigest` a REACHABLE caller: the digest verified against the image
   * immediately before a production deploy starts, where the two are read separately.
   */
  it('a rebuild invalidates the approval — the checklist says the release was rebuilt', async () => {
    const ctx = await releasedProject()
    await servingStaging(ctx)
    await ctx.app.inject({
      method: 'POST',
      url: `/v1/releases/${ctx.release.id}/approve`,
      payload: {},
      cookies: ctx.admin,
      headers: mutationHeaders(ctx.deps),
    })
    /**
     * **THE NEW DIGEST SHARES ITS FIRST NINETEEN CHARACTERS WITH THE APPROVED ONE**, and
     * that is control (c) folded into this test rather than left to the unit one. Measured:
     * with an unrelated `sha256:aaa…` here, `approvalCoversDigest` written as a PREFIX
     * comparison still turns this item `unmet` and this test stays green — so the digest a
     * rebuild is given has to be one the wrong implementation would accept.
     */
    const rebuilt = `${(ctx.build.imageDigest as string).slice(0, 19)}${'b'.repeat(64 - 12)}`
    expect(rebuilt.slice(0, 19)).toBe((ctx.build.imageDigest as string).slice(0, 19))
    expect(rebuilt).not.toBe(ctx.build.imageDigest)
    await ctx.deps.db
      .update(builds)
      .set({ imageDigest: rebuilt })
      .where(eq(builds.id, ctx.build.id))

    const view = await ctx.app.inject({
      method: 'GET',
      url: `/v1/projects/${ctx.project.id}/launch-readiness`,
      cookies: ctx.owner,
    })
    const item = view.json().items.find((i: { id: string }) => i.id === 'admin-approval')
    expect(item.state).toBe('unmet')
    expect(item.why).toContain('rebuilt since it was approved')
    await ctx.app.close()
  })
})

describe('approvalCoversDigest — a string comparison, deliberately not a prefix one', () => {
  it('covers the exact digest and nothing else', () => {
    const approval = { decision: 'approved', imageDigest: DIGEST }
    expect(approvalCoversDigest(approval, DIGEST)).toBe(true)
    /**
     * **THE NINETEEN-CHARACTER CASE, WRITTEN OUT** (control c). Every event and every log
     * line carries `digest.slice(0, 19)`, so comparing that form is the mistake somebody
     * will make — and it would make a rebuild whose digest shares nineteen characters look
     * approved. These two agree on their first nineteen characters and differ after.
     */
    const sameNineteen = `${DIGEST.slice(0, 19)}${'b'.repeat(64 - (19 - 7))}`
    expect(sameNineteen.slice(0, 19)).toBe(DIGEST.slice(0, 19))
    expect(sameNineteen).not.toBe(DIGEST)
    expect(approvalCoversDigest(approval, sameNineteen)).toBe(false)
  })

  it('a REJECTION covers nothing, whatever digest it names', () => {
    expect(
      approvalCoversDigest({ decision: 'rejected', imageDigest: DIGEST }, DIGEST),
    ).toBe(false)
  })
})
