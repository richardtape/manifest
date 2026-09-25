import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AI_CODES, AiError } from '../ai/index.js'
import { approvals, builds, events, releases } from '../db/index.js'
import { resetDatabase } from '../db/testing.js'
// `api/index.js`, not `api/server.js`: `module-boundaries.test.ts` allows a module's
// `index` and its `testing` and nothing else, and it caught this import the first time it
// was written the other way.
import { buildServer } from '../api/index.js'
import {
  commitManifest,
  loginAs,
  mutationHeaders,
  previewThenDecide,
  projectBody,
  testDeps,
} from '../api/testing.js'
import { mintTestToken } from '../tokens/testing.js'
import { ensureTestUser } from '../identity/testing.js'
import type { Reviewer, ReviewRequest } from '../launch/index.js'
import { SECURITY_NOTES } from '../spec/index.js'
import {
  approvalCoversDigest,
  COVERAGE_LIMIT,
  describeVerdict,
  lastApprovedReleaseFor,
  sensitiveChangeOf,
} from './approval.js'

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

/**
 * A SECOND release of the same project, from a manifest that differs — so `describeDiff`
 * has something to describe. Two releases of one unchanged spec diff to nothing, and a
 * snapshot test against an empty `changes` list cannot see Decision 6 at all.
 */
async function secondRelease(
  ctx: Awaited<ReturnType<typeof releasedProject>>,
  slug: string,
  memory: string,
) {
  await ctx.deps.source.commitFiles(
    ctx.deps.source.repositoryFor(slug),
    {
      'manifest.yaml': [
        'manifest: 1',
        `name: ${slug}`,
        'blueprint: fixture-node@1',
        'runtime:',
        '  port: 3000',
        '  health: /healthz',
        'resources:',
        `  memory: ${memory}`,
        '',
      ].join('\n'),
    },
    'feat: more memory',
  )
  const pushed = await ctx.app.inject({
    method: 'POST',
    url: `/v1/projects/${ctx.project.id}/spec`,
    payload: {},
    cookies: ctx.owner,
    headers: mutationHeaders(ctx.deps),
  })
  expect(pushed.json().valid, pushed.body).toBe(true)
  const started = await ctx.app.inject({
    method: 'POST',
    url: `/v1/projects/${ctx.project.id}/builds`,
    payload: {},
    cookies: ctx.owner,
    headers: mutationHeaders(ctx.deps),
  })
  expect(started.statusCode, started.body).toBe(202)
  await ctx.deps.builds.idle()
  const made = await ctx.app.inject({
    method: 'POST',
    url: `/v1/projects/${ctx.project.id}/releases`,
    payload: { buildId: started.json().id },
    cookies: ctx.owner,
    headers: mutationHeaders(ctx.deps),
  })
  expect(made.statusCode, made.body).toBe(201)
  return made.json()
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

    const approved = await previewThenDecide(
      ctx.app,
      ctx.deps,
      ctx.admin,
      ctx.release.id,
      'approve',
      { reason: 'the scan is clean and the diff is what the ticket says' },
    )
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
    // R4 (P6a Task 12): the BOOT's reviewer, which the harness also uses — an honest
    // `not_performed` that names itself, and its reason as the record's one line.
    expect(body.diff.review).toMatchObject({ state: 'not_performed', reviewer: 'none' })
    expect(body.diff.review.detail).toContain('No code reviewer is configured')

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
    const refused = await previewThenDecide(
      ctx.app,
      ctx.deps,
      ctx.admin,
      ctx.release.id,
      'reject',
      {},
    )
    expect(refusal(refused)).toEqual({ status: 400, code: 'REQUEST_INVALID' })

    // AND A REASON MADE OF SPACES, which is the case `min(1)` alone does NOT catch and the
    // one control (e) is aimed at. Measured: with `.trim()` absent from the schema this
    // request reached the database and was answered `500 INTERNAL` — a client error wearing
    // a server error's clothes (P6a sitting 7, F3).
    const blank = await previewThenDecide(
      ctx.app,
      ctx.deps,
      ctx.admin,
      ctx.release.id,
      'reject',
      { reason: '   ' },
    )
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
    const rejected = await previewThenDecide(
      ctx.app,
      ctx.deps,
      ctx.admin,
      ctx.release.id,
      'reject',
      {
        reason: 'this release adds an egress destination the PIA does not cover',
      },
    )
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
      previewThenDecide(ctx.app, ctx.deps, ctx.admin, ctx.release.id, kind, { reason })
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

    await previewThenDecide(ctx.app, ctx.deps, ctx.admin, ctx.release.id, 'approve', {})
    const met = await item()
    expect(met.state).toBe('met')
    expect(met.why).toContain(ctx.build.imageDigest.slice(0, 19))
    await ctx.app.close()
  })

  it('a rejected candidate is unmet, in the administrator’s own words', async () => {
    const ctx = await releasedProject()
    await servingStaging(ctx)
    await previewThenDecide(ctx.app, ctx.deps, ctx.admin, ctx.release.id, 'reject', {
      reason: 'the egress list grew and the PIA has not seen it',
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
    await previewThenDecide(ctx.app, ctx.deps, ctx.admin, ctx.release.id, 'approve', {})
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

describe('§13’s diff_snapshot — rendered at decision time and STORED (P6a Task 11)', () => {
  it('stores the RENDERED changes, the sorted lists and the resource delta', async () => {
    /**
     * **DECISION 6 IS INVISIBLE TO A TEST THAT ONLY CHECKS THE APPROVAL WAS RECORDED**
     * (control c): storing `{beforeReleaseId, afterReleaseId}` and recomputing later passes
     * every other test in this file. This one reads a STORED snapshot's `changes[0].summary`
     * — the rendered clause, which a reference does not carry.
     */
    const ctx = await releasedProject('diff-labs')
    const first = await previewThenDecide(
      ctx.app,
      ctx.deps,
      ctx.admin,
      ctx.release.id,
      'approve',
      {},
    )
    expect(first.statusCode, first.body).toBe(201)
    // A FIRST LAUNCH HAS NOTHING TO DIFF, and that is a STATE: not `unavailable`, which
    // would send an administrator looking for a failure that did not happen.
    expect(first.json().diff.summarySource).toBe('no-previous-release')
    expect(first.json().diff.changes).toEqual([])

    const next = await secondRelease(ctx, 'diff-labs', '1Gi')
    const second = await previewThenDecide(
      ctx.app,
      ctx.deps,
      ctx.admin,
      next.id,
      'approve',
      {},
    )
    expect(second.statusCode, second.body).toBe(201)
    const diff = second.json().diff

    const memory = (diff.changes as { path: string; summary: string; to: string }[]).find(
      (c) => c.path === 'resources.memory',
    )
    expect(memory, JSON.stringify(diff.changes)).toBeDefined()
    // THE RENDERED CLAUSE, not an id. This is the assertion a reference cannot satisfy.
    expect(memory!.summary).toContain('memory')
    expect(memory!.to).toBe('1Gi')
    expect(diff.resources.memory).toBe('1Gi')
    /**
     * **SORTED — AND THIS PAIR OF ASSERTIONS CANNOT FAIL IN THIS TIER, WHICH IS ITSELF THE
     * FINDING** (control d, P6a sitting 7). The fixture blueprint declares
     * `auth.provider: none` and its manifest declares no services, so both lists are EMPTY
     * here and every ordering is sorted. Removing both `.sort()` calls from
     * `buildDiffSnapshot` leaves all sixteen tests in this file green — measured, not
     * assumed. The lines stay as a statement of the rule; **Task 19's demo, which compares
     * two rendered snapshots, is what would see it**, and a project with two services and
     * two CWL attributes is what it would take to see it here.
     */
    expect(diff.services).toEqual([...diff.services].sort())
    expect(diff.attributes).toEqual([...diff.attributes].sort())
    expect(diff.services.length + diff.attributes.length).toBe(0)
    expect(diff.imageDigest).toBe(second.json().imageDigest)
    await ctx.app.close()
  })

  it('an approval still succeeds with an UNAVAILABLE summary — end to end through the route', async () => {
    /**
     * **THE TEST THAT MATTERS, AND THE ONE THAT WOULD BE LEFT OUT.** `summary.test.ts`
     * proves the function returns null when the model is down; only a route test proves the
     * APPROVAL is still recorded, which is Decision 7's actual claim. The harness's `llm` is
     * `undefined` by default, so this test hands the server one that REJECTS — otherwise it
     * would be exercising "AI is switched off" and calling it "the gateway is down".
     */
    const ctx = await releasedProject('outage-labs')
    const operator = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const down = await buildServer({
      ...ctx.deps,
      llm: {
        get: () => Promise.reject(new Error('never')),
        post: () =>
          Promise.reject(
            new AiError(AI_CODES.BACKEND_UNAVAILABLE, 0, {
              status: 0,
              reason: 'unreachable',
            }),
          ),
      },
    })
    // A PREVIOUS APPROVED RELEASE, so the summary is actually attempted — without one the
    // answer is `no-previous-release` and the gateway is never asked, which would make this
    // test green against a `buildDiffSnapshot` that rethrows.
    expect(
      (await previewThenDecide(down, ctx.deps, ctx.admin, ctx.release.id, 'approve', {}))
        .statusCode,
    ).toBe(201)
    const next = await secondRelease(ctx, 'outage-labs', '1Gi')
    const approved = await previewThenDecide(
      down,
      ctx.deps,
      ctx.admin,
      next.id,
      'approve',
      {},
    )

    // 201, NOT 502. The approval is recorded; the summary is recorded as absent.
    expect(approved.statusCode, approved.body).toBe(201)
    expect(approved.json().diff.summary).toBeNull()
    expect(approved.json().diff.summarySource).toBe('unavailable')
    // AND THE DIFF IS STILL THERE — which is §13's actual control, and the reason a missing
    // summary is not a reason to refuse.
    expect(approved.json().diff.changes.length).toBeGreaterThan(0)
    expect(operator).toHaveBeenCalled()
    operator.mockRestore()
    await down.close()
    await ctx.app.close()
  })

  it('summarises through a model that answers, and stores its words', async () => {
    // The positive control for the pair above, at the ROUTE rather than at the function.
    const ctx = await releasedProject('summary-labs')
    const up = await buildServer({
      ...ctx.deps,
      llm: {
        get: () => Promise.reject(new Error('never')),
        post: <T>() =>
          Promise.resolve({
            choices: [{ message: { content: 'The app asks for more memory.' } }],
          } as T),
      },
    })
    expect(
      (await previewThenDecide(up, ctx.deps, ctx.admin, ctx.release.id, 'approve', {}))
        .statusCode,
    ).toBe(201)
    const next = await secondRelease(ctx, 'summary-labs', '1Gi')
    const approved = await previewThenDecide(
      up,
      ctx.deps,
      ctx.admin,
      next.id,
      'approve',
      {},
    )
    expect(approved.statusCode, approved.body).toBe(201)
    expect(approved.json().diff.summary).toBe('The app asks for more memory.')
    expect(approved.json().diff.summarySource).toBe('llm')
    await up.close()
    await ctx.app.close()
  })
})

/**
 * R4's seam has ONE real caller, and this is the test that says so (P6a Task 12, control c).
 *
 * **Every other assertion about the review is satisfied by a LITERAL**: `NullReviewer`'s
 * verdict is a constant, so a `buildDiffSnapshot` that went back to writing
 * `{ state: 'not_performed', reviewer: 'none', … }` itself would keep them all green — and
 * the seam would be a file with no caller, the shape this project has shipped four times.
 * A reviewer with a DISTINCTIVE name, injected where `ServerDeps` is built, is the only
 * thing a literal cannot imitate.
 *
 * And it RECORDS what it was asked, because `NullReviewer` reads nothing: a caller that
 * passed the wrong commit or the wrong repository would be invisible through it.
 */
describe('R4’s seam — the snapshot’s review comes from the injected reviewer (P6a Task 12)', () => {
  function recordingReviewer(): Reviewer & { asked: ReviewRequest[] } {
    const asked: ReviewRequest[] = []
    return {
      name: 'recording-reviewer',
      asked,
      review: (request) => {
        asked.push(request)
        return Promise.resolve({
          state: 'findings',
          reviewer: 'recording-reviewer',
          findings: [
            {
              severity: 'advise',
              message: 'builds a query by concatenation',
              path: 'server.js',
              line: 12,
            },
          ],
        })
      },
    }
  }

  it('stores the injected reviewer’s verdict, and asks it about THIS release’s own build', async () => {
    const ctx = await releasedProject('review-labs')
    const reviewer = recordingReviewer()
    const app = await buildServer({ ...ctx.deps, reviewer })
    const approved = await previewThenDecide(
      app,
      ctx.deps,
      ctx.admin,
      ctx.release.id,
      'approve',
      {},
    )
    expect(approved.statusCode, approved.body).toBe(201)
    expect(approved.json().diff.review).toEqual({
      state: 'findings',
      reviewer: 'recording-reviewer',
      detail: '1 finding(s): [advise] builds a query by concatenation (server.js:12)',
    })

    // WHAT IT WAS ASKED — the half `NullReviewer` cannot see. The repository is the
    // project's own, and the commit is the BUILD's, which is the code the approved digest
    // was built from.
    expect(reviewer.asked).toHaveLength(1)
    expect(reviewer.asked[0]).toEqual({
      projectId: ctx.project.id,
      releaseId: ctx.release.id,
      changes: [],
      source: {
        repoPath: (
          await ctx.deps.source.localGitDir(
            ctx.deps.source.repositoryFor('review-labs'),
            ctx.build.commitSha,
          )
        ).gitDir,
        commitSha: ctx.build.commitSha,
      },
    })

    // A SECOND release, so `changes` is the diff and not the first launch's empty list —
    // otherwise `changes: []` above would be as true of a caller that never passed them.
    const next = await secondRelease(ctx, 'review-labs', '1Gi')
    const again = await previewThenDecide(
      app,
      ctx.deps,
      ctx.admin,
      next.id,
      'approve',
      {},
    )
    expect(again.statusCode, again.body).toBe(201)
    expect(reviewer.asked).toHaveLength(2)
    expect(reviewer.asked[1]!.releaseId).toBe(next.id)
    expect(reviewer.asked[1]!.changes.map((c) => c.path)).toContain('resources.memory')
    await app.close()
    await ctx.app.close()
  })
})

describe('describeVerdict — one line per verdict state, for the record', () => {
  it('renders each of the three states, and never renders not_performed as clean', () => {
    expect(
      describeVerdict({
        state: 'not_performed',
        reviewer: 'none',
        reason: 'nothing is configured',
      }),
    ).toBe('nothing is configured')
    expect(describeVerdict({ state: 'clean', reviewer: 'r', checked: 14 })).toBe(
      '14 checked, no findings',
    )
    expect(
      describeVerdict({
        state: 'findings',
        reviewer: 'r',
        findings: [
          { severity: 'block', message: 'a secret', path: 'app.js' },
          { severity: 'advise', message: 'no path' },
        ],
      }),
    ).toBe('2 finding(s): [block] a secret (app.js); [advise] no path')
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

/**
 * THE BASELINE A RE-ESCALATION IS DIFFED AGAINST (P6b Task 3, Decisions 4 and 5).
 *
 * `lastApprovedReleaseFor` filtered approval rows on `decision = 'approved'`, so a release an
 * administrator approved and then WITHDREW stayed the baseline for every diff after it —
 * measured as P6b `[M5]`. The approvals table has no unique constraint on `release_id`
 * precisely so a release can be approved, rejected and approved again; what counts is each
 * release's LATEST decision.
 */
describe('the baseline is each release’s LATEST decision (P6b Task 3)', () => {
  /** No release has this id: the exclusion a test passes when no release is "in hand". */
  const NOBODY = '00000000-0000-0000-0000-000000000000'

  const decide = (
    ctx: Awaited<ReturnType<typeof releasedProject>>,
    releaseId: string,
    kind: 'approve' | 'reject',
    reason = 'reviewed',
  ) => previewThenDecide(ctx.app, ctx.deps, ctx.admin, releaseId, kind, { reason })

  const rowOf = async (ctx: Awaited<ReturnType<typeof releasedProject>>, id: string) => {
    const [row] = await ctx.deps.db.select().from(releases).where(eq(releases.id, id))
    return row!
  }

  it('a release APPROVED AND THEN REJECTED is not a baseline — [M5]', async () => {
    const ctx = await releasedProject('m5-labs')
    expect((await decide(ctx, ctx.release.id, 'approve')).statusCode).toBe(201)
    const r2 = await secondRelease(ctx, 'm5-labs', '1Gi')
    expect((await decide(ctx, r2.id, 'approve')).statusCode).toBe(201)
    // THE POSITIVE HALF: approved, R2 IS the baseline — so the answer below is the
    // rejection's doing, and not a function that never returns anything newer than R1.
    expect((await lastApprovedReleaseFor(ctx.deps.db, ctx.project.id, NOBODY))?.id).toBe(
      r2.id,
    )
    expect((await decide(ctx, r2.id, 'reject', 'withdrawn')).statusCode).toBe(201)
    const r3 = await secondRelease(ctx, 'm5-labs', '2Gi')
    expect((await lastApprovedReleaseFor(ctx.deps.db, ctx.project.id, r3.id))?.id).toBe(
      ctx.release.id,
    )
    await ctx.app.close()
  })

  it('a release rejected and then approved AGAIN is one — the latest decision is what counts', async () => {
    const ctx = await releasedProject('m5b-labs')
    expect((await decide(ctx, ctx.release.id, 'approve')).statusCode).toBe(201)
    const r2 = await secondRelease(ctx, 'm5b-labs', '1Gi')
    expect((await decide(ctx, r2.id, 'approve')).statusCode).toBe(201)
    expect((await decide(ctx, r2.id, 'reject', 'the scan is stale')).statusCode).toBe(201)
    expect((await lastApprovedReleaseFor(ctx.deps.db, ctx.project.id, NOBODY))?.id).toBe(
      ctx.release.id,
    )
    expect((await decide(ctx, r2.id, 'approve')).statusCode).toBe(201)
    expect((await lastApprovedReleaseFor(ctx.deps.db, ctx.project.id, NOBODY))?.id).toBe(
      r2.id,
    )
    await ctx.app.close()
  })

  it('sensitiveChangeOf compares FROZEN production configs against the last approved release', async () => {
    const ctx = await releasedProject('m6-labs')
    expect((await decide(ctx, ctx.release.id, 'approve')).statusCode).toBe(201)
    // THE POSITIVE HALF FIRST: a second release of the SAME build freezes the same config,
    // so nothing sensitive changed — a rule that answered every release sensitive fails here.
    const same = await ctx.app.inject({
      method: 'POST',
      url: `/v1/projects/${ctx.project.id}/releases`,
      payload: { buildId: ctx.build.id },
      cookies: ctx.owner,
      headers: mutationHeaders(ctx.deps),
    })
    expect(same.statusCode, same.body).toBe(201)
    const unchanged = await sensitiveChangeOf(
      ctx.deps.db,
      await rowOf(ctx, same.json().id),
    )
    expect(unchanged.baseline?.id).toBe(ctx.release.id)
    expect(unchanged.fields).toEqual([])

    await commitManifest(
      { ...ctx, cookies: ctx.owner },
      [
        'manifest: 1',
        'name: m6-labs',
        'blueprint: fixture-node@1',
        'runtime:',
        '  port: 3000',
        '  health: /healthz',
        'egress:',
        '  allow: [m6.example.org]',
      ],
      'feat: an egress host',
    )
    const started = await ctx.app.inject({
      method: 'POST',
      url: `/v1/projects/${ctx.project.id}/builds`,
      payload: {},
      cookies: ctx.owner,
      headers: mutationHeaders(ctx.deps),
    })
    expect(started.statusCode, started.body).toBe(202)
    await ctx.deps.builds.idle()
    const made = await ctx.app.inject({
      method: 'POST',
      url: `/v1/projects/${ctx.project.id}/releases`,
      payload: { buildId: started.json().id },
      cookies: ctx.owner,
      headers: mutationHeaders(ctx.deps),
    })
    expect(made.statusCode, made.body).toBe(201)
    const changed = await sensitiveChangeOf(ctx.deps.db, await rowOf(ctx, made.json().id))
    expect(changed.baseline?.id).toBe(ctx.release.id)
    expect(changed.fields).toEqual(['egress.allow'])
    await ctx.app.close()
  })

  it('sensitiveChangeOf with no approved release answers no baseline and no fields — the caller decides', async () => {
    const ctx = await releasedProject('m6b-labs')
    const change = await sensitiveChangeOf(ctx.deps.db, await rowOf(ctx, ctx.release.id))
    expect(change).toEqual({ baseline: undefined, fields: [] })
    await ctx.app.close()
  })

  it('a release whose spec row cannot be read RE-ESCALATES on blueprint rather than passing', async () => {
    // The `''` fallback's only witness. No route can produce a release whose spec row is
    // missing — `releases.app_spec_id` is a foreign key — so the row is handed in with an id
    // no spec has, which is what a lookup that found nothing looks like to the function.
    const ctx = await releasedProject('m6c-labs')
    expect((await decide(ctx, ctx.release.id, 'approve')).statusCode).toBe(201)
    const again = await ctx.app.inject({
      method: 'POST',
      url: `/v1/projects/${ctx.project.id}/releases`,
      payload: { buildId: ctx.build.id },
      cookies: ctx.owner,
      headers: mutationHeaders(ctx.deps),
    })
    expect(again.statusCode, again.body).toBe(201)
    const row = await rowOf(ctx, again.json().id)
    // The positive half: the row as stored compares clean against its identical baseline.
    expect((await sensitiveChangeOf(ctx.deps.db, row)).fields).toEqual([])
    const orphan = { ...row, appSpecId: NOBODY }
    expect((await sensitiveChangeOf(ctx.deps.db, orphan)).fields).toEqual(['blueprint'])
    await ctx.app.close()
  })
})

/**
 * R4(d) IN THE RECORD (P6b Task 8, Decision 13). The snapshot an approval stores names what
 * it was compared WITH (the baseline), which of §7's fields changed, a deterministic security
 * note for each — present when the model is down — and D33's coverage limit, so no reader
 * mistakes an approval for a code review. And the reviewer is asked BEFORE the model, so the
 * summary can carry its verdict.
 *
 * Every field is read BY NAME off the route's answer (P6b sitting 4, F8): a field the
 * representation forgets is stripped, and nothing but a read by name sees it.
 */
describe('R4(d) — the snapshot’s security dimension (P6b Task 8)', () => {
  /** An approval, through the route, by the stepped-up administrator. */
  const approve = (
    app: Awaited<ReturnType<typeof buildServer>>,
    ctx: Awaited<ReturnType<typeof releasedProject>>,
    releaseId: string,
  ) => previewThenDecide(app, ctx.deps, ctx.admin, releaseId, 'approve', {})

  /** A release of `lines`, committed, validated and built through the routes. */
  async function releaseOf(
    ctx: Awaited<ReturnType<typeof releasedProject>>,
    slug: string,
    extra: readonly string[],
  ): Promise<{ id: string }> {
    await commitManifest(
      { app: ctx.app, deps: ctx.deps, cookies: ctx.owner, project: ctx.project },
      [
        'manifest: 1',
        `name: ${slug}`,
        'blueprint: fixture-node@1',
        'runtime:',
        '  port: 3000',
        '  health: /healthz',
        ...extra,
      ],
      'feat: a sensitive change',
    )
    const started = await ctx.app.inject({
      method: 'POST',
      url: `/v1/projects/${ctx.project.id}/builds`,
      payload: {},
      cookies: ctx.owner,
      headers: mutationHeaders(ctx.deps),
    })
    expect(started.statusCode, started.body).toBe(202)
    await ctx.deps.builds.idle()
    const made = await ctx.app.inject({
      method: 'POST',
      url: `/v1/projects/${ctx.project.id}/releases`,
      payload: { buildId: started.json().id },
      cookies: ctx.owner,
      headers: mutationHeaders(ctx.deps),
    })
    expect(made.statusCode, made.body).toBe(201)
    return made.json()
  }

  it('the snapshot names the baseline, the sensitive fields and a note for each', async () => {
    const ctx = await releasedProject('notes-labs')
    expect((await approve(ctx.app, ctx, ctx.release.id)).statusCode).toBe(201)
    const next = await releaseOf(ctx, 'notes-labs', [
      'egress:',
      '  allow: [x.example.org]',
    ])
    const approved = await approve(ctx.app, ctx, next.id)
    expect(approved.statusCode, approved.body).toBe(201)
    const diff = approved.json().diff
    expect(diff.baselineReleaseId).toBe(ctx.release.id)
    expect(diff.sensitiveFields).toEqual(['egress.allow'])
    expect(diff.security).toEqual([
      { field: 'egress.allow', note: SECURITY_NOTES['egress.allow'] },
    ])
    expect(diff.coverage).toBe(COVERAGE_LIMIT)
    // And the READ answers the same record — the snapshot is stored, not recomputed.
    const read = await ctx.app.inject({
      method: 'GET',
      url: `/v1/releases/${next.id}/approval`,
      cookies: ctx.owner,
    })
    expect(read.json().diff).toEqual(diff)
    await ctx.app.close()
  })

  it('asks the reviewer BEFORE the model, so the summary can carry the verdict', async () => {
    const ctx = await releasedProject('order-labs')
    const order: string[] = []
    const asked: unknown[] = []
    const reviewer: Reviewer = {
      name: 'ordered-reviewer',
      review: () => {
        order.push('reviewer')
        return Promise.resolve({
          state: 'clean',
          reviewer: 'ordered-reviewer',
          checked: 3,
        })
      },
    }
    const app = await buildServer({
      ...ctx.deps,
      reviewer,
      llm: {
        get: () => Promise.reject(new Error('never')),
        post: <T>(_path: string, body: unknown) => {
          order.push('model')
          asked.push(body)
          return Promise.resolve({
            choices: [{ message: { content: 'The app may reach a new host.' } }],
          } as T)
        },
      },
    })
    // A first launch asks the reviewer and not the model — nothing to summarise.
    expect((await approve(app, ctx, ctx.release.id)).statusCode).toBe(201)
    const next = await releaseOf(ctx, 'order-labs', [
      'egress:',
      '  allow: [x.example.org]',
    ])
    expect((await approve(app, ctx, next.id)).statusCode).toBe(201)
    expect(order).toEqual(['reviewer', 'reviewer', 'model'])
    const user = (asked[0] as { messages: { content: string }[] }).messages.at(
      -1,
    )!.content
    expect(user).toContain('Code review: 3 checked, no findings')
    await app.close()
    await ctx.app.close()
  })

  it('a first launch: no baseline, no sensitive fields, and the coverage limit still stated', async () => {
    const ctx = await releasedProject('first-labs')
    const approved = await approve(ctx.app, ctx, ctx.release.id)
    expect(approved.statusCode, approved.body).toBe(201)
    expect(approved.json().diff).toMatchObject({
      baselineReleaseId: null,
      sensitiveFields: [],
      security: [],
      coverage: COVERAGE_LIMIT,
      summarySource: 'no-previous-release',
    })
    await ctx.app.close()
  })

  it('still records the notes when the model is DOWN — the security reading is not the model’s', async () => {
    const ctx = await releasedProject('down-labs')
    const operator = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const down = await buildServer({
      ...ctx.deps,
      llm: {
        get: () => Promise.reject(new Error('never')),
        post: () =>
          Promise.reject(
            new AiError(AI_CODES.BACKEND_UNAVAILABLE, 0, {
              status: 0,
              reason: 'unreachable',
            }),
          ),
      },
    })
    expect((await approve(down, ctx, ctx.release.id)).statusCode).toBe(201)
    const next = await releaseOf(ctx, 'down-labs', [
      'egress:',
      '  allow: [x.example.org]',
    ])
    const approved = await approve(down, ctx, next.id)
    expect(approved.statusCode, approved.body).toBe(201)
    expect(approved.json().diff).toMatchObject({
      summary: null,
      summarySource: 'unavailable',
      sensitiveFields: ['egress.allow'],
      security: [{ field: 'egress.allow', note: SECURITY_NOTES['egress.allow'] }],
    })
    expect(operator).toHaveBeenCalled()
    operator.mockRestore()
    await down.close()
    await ctx.app.close()
  })
})
