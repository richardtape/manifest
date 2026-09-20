import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AI_CODES, AiError } from '../ai/index.js'
import { approvals, builds, events } from '../db/index.js'
import { resetDatabase } from '../db/testing.js'
// `api/index.js`, not `api/server.js`: `module-boundaries.test.ts` allows a module's
// `index` and its `testing` and nothing else, and it caught this import the first time it
// was written the other way.
import { buildServer } from '../api/index.js'
import { loginAs, mutationHeaders, projectBody, testDeps } from '../api/testing.js'
import { mintTestToken } from '../tokens/testing.js'
import { ensureTestUser } from '../identity/testing.js'
import type { Reviewer, ReviewRequest } from '../launch/index.js'
import { approvalCoversDigest, describeVerdict } from './approval.js'

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

describe('§13’s diff_snapshot — rendered at decision time and STORED (P6a Task 11)', () => {
  it('stores the RENDERED changes, the sorted lists and the resource delta', async () => {
    /**
     * **DECISION 6 IS INVISIBLE TO A TEST THAT ONLY CHECKS THE APPROVAL WAS RECORDED**
     * (control c): storing `{beforeReleaseId, afterReleaseId}` and recomputing later passes
     * every other test in this file. This one reads a STORED snapshot's `changes[0].summary`
     * — the rendered clause, which a reference does not carry.
     */
    const ctx = await releasedProject('diff-labs')
    const first = await ctx.app.inject({
      method: 'POST',
      url: `/v1/releases/${ctx.release.id}/approve`,
      payload: {},
      cookies: ctx.admin,
      headers: mutationHeaders(ctx.deps),
    })
    expect(first.statusCode, first.body).toBe(201)
    // A FIRST LAUNCH HAS NOTHING TO DIFF, and that is a STATE: not `unavailable`, which
    // would send an administrator looking for a failure that did not happen.
    expect(first.json().diff.summarySource).toBe('no-previous-release')
    expect(first.json().diff.changes).toEqual([])

    const next = await secondRelease(ctx, 'diff-labs', '1Gi')
    const second = await ctx.app.inject({
      method: 'POST',
      url: `/v1/releases/${next.id}/approve`,
      payload: {},
      cookies: ctx.admin,
      headers: mutationHeaders(ctx.deps),
    })
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
      (
        await down.inject({
          method: 'POST',
          url: `/v1/releases/${ctx.release.id}/approve`,
          payload: {},
          cookies: ctx.admin,
          headers: mutationHeaders(ctx.deps),
        })
      ).statusCode,
    ).toBe(201)
    const next = await secondRelease(ctx, 'outage-labs', '1Gi')
    const approved = await down.inject({
      method: 'POST',
      url: `/v1/releases/${next.id}/approve`,
      payload: {},
      cookies: ctx.admin,
      headers: mutationHeaders(ctx.deps),
    })

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
      (
        await up.inject({
          method: 'POST',
          url: `/v1/releases/${ctx.release.id}/approve`,
          payload: {},
          cookies: ctx.admin,
          headers: mutationHeaders(ctx.deps),
        })
      ).statusCode,
    ).toBe(201)
    const next = await secondRelease(ctx, 'summary-labs', '1Gi')
    const approved = await up.inject({
      method: 'POST',
      url: `/v1/releases/${next.id}/approve`,
      payload: {},
      cookies: ctx.admin,
      headers: mutationHeaders(ctx.deps),
    })
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
    const approved = await app.inject({
      method: 'POST',
      url: `/v1/releases/${ctx.release.id}/approve`,
      payload: {},
      cookies: ctx.admin,
      headers: mutationHeaders(ctx.deps),
    })
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
        repoPath: ctx.deps.source.repositoryFor('review-labs').path,
        commitSha: ctx.build.commitSha,
      },
    })

    // A SECOND release, so `changes` is the diff and not the first launch's empty list —
    // otherwise `changes: []` above would be as true of a caller that never passed them.
    const next = await secondRelease(ctx, 'review-labs', '1Gi')
    const again = await app.inject({
      method: 'POST',
      url: `/v1/releases/${next.id}/approve`,
      payload: {},
      cookies: ctx.admin,
      headers: mutationHeaders(ctx.deps),
    })
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
