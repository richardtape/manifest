import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { approvalPreviews, approvals, releases } from '../db/index.js'
import { resetDatabase } from '../db/testing.js'
import { buildServer } from '../api/index.js'
import {
  commitManifest,
  loginAs,
  mutationHeaders,
  previewThenDecide,
  refusal,
  releasedProject,
} from '../api/testing.js'
import { ensureTestUser } from '../identity/testing.js'
import type { Reviewer } from '../launch/index.js'
import { mintTestToken } from '../tokens/testing.js'
import type { DiffSnapshot } from './approval.js'
import {
  assertPreviewCurrent,
  factsOf,
  PREVIEW_TTL_MS,
  previewFor,
  sameFacts,
} from './preview.js'
import { ReleaseError } from './release.js'

beforeEach(resetDatabase)
afterAll(resetDatabase)

/**
 * P6b TASK 9 — THE STORED PREVIEW (Rich, 2026-09-22; Decision 10). An administrator asks for a
 * preview, the platform STORES it, and approve and reject must NAME it. At decision time the
 * FACTS are recomputed and compared; the summary and the verdict are never recomputed — the
 * record copies the preview's, because those are what was shown.
 *
 * The model is a fake that answers `summary #1`, `summary #2`, … — **a model that answers
 * differently on every call** (Read this first 13), which is the one thing that makes "the
 * record is what was shown" observable. A fake that always answered the same sentence would
 * keep every assertion below green against a `decide()` that asked the model again.
 */
function countingModel() {
  const state = { calls: 0 }
  return {
    state,
    llm: {
      get: () => Promise.reject(new Error('never')),
      post: <T>() => {
        state.calls += 1
        return Promise.resolve({
          choices: [{ message: { content: `summary #${state.calls}` } }],
        } as T)
      },
    },
  }
}

type Released = Awaited<ReturnType<typeof releasedProject>>

/** A further release of the project, from `extra` manifest lines, through the routes. */
async function nextRelease(
  ctx: Released,
  slug: string,
  extra: readonly string[],
): Promise<{ id: string }> {
  await commitManifest(
    ctx,
    [
      'manifest: 1',
      `name: ${slug}`,
      'blueprint: fixture-node@1',
      'runtime:',
      '  port: 3000',
      '  health: /healthz',
      ...extra,
    ],
    'feat: a change for the preview to describe',
  )
  const started = await ctx.app.inject({
    method: 'POST',
    url: `/v1/projects/${ctx.project.id}/builds`,
    payload: {},
    cookies: ctx.cookies,
    headers: mutationHeaders(ctx.deps),
  })
  expect(started.statusCode, started.body).toBe(202)
  await ctx.deps.builds.idle()
  const made = await ctx.app.inject({
    method: 'POST',
    url: `/v1/projects/${ctx.project.id}/releases`,
    payload: { buildId: started.json().id },
    cookies: ctx.cookies,
    headers: mutationHeaders(ctx.deps),
  })
  expect(made.statusCode, made.body).toBe(201)
  return made.json()
}

const preview = (
  app: Released['app'],
  ctx: Released,
  cookies: Record<string, string>,
  releaseId: string,
) =>
  app.inject({
    method: 'POST',
    url: `/v1/releases/${releaseId}/approval-preview`,
    cookies,
    headers: mutationHeaders(ctx.deps),
  })

const decide = (
  app: Released['app'],
  ctx: Released,
  cookies: Record<string, string>,
  releaseId: string,
  kind: 'approve' | 'reject',
  payload: { previewId?: string; reason?: string },
) =>
  app.inject({
    method: 'POST',
    url: `/v1/releases/${releaseId}/${kind}`,
    payload,
    cookies,
    headers: mutationHeaders(ctx.deps),
  })

const decisionsOn = async (ctx: Released, releaseId: string) =>
  ctx.deps.db.select().from(approvals).where(eq(approvals.releaseId, releaseId))

describe('the stored preview — what an administrator reads is what the approval records (P6b Task 9)', () => {
  it('a preview, then an approval naming it: 201, the approval’s diff DEEP-EQUALS the preview’s, and the model was asked ONCE', async () => {
    /**
     * **THE POSITIVE CONTROL, AND RICH'S REASON FOR THE DECISION, MEASURED.** Every refusal
     * below is true of a route that refuses everything; this is the case that makes them mean
     * something. The model is asked when the preview is TAKEN and never again: a `decide()`
     * that summarised a second time would record `summary #2`, a sentence nobody read.
     */
    const ctx = await releasedProject('preview-labs')
    const model = countingModel()
    const app = await buildServer({ ...ctx.deps, llm: model.llm })
    const admin = await loginAs(ctx.deps, 'platform_admin', { steppedUp: true })
    // R1 is a first launch: nothing to diff, so the model is not asked for it at all.
    const first = await previewThenDecide(app, ctx.deps, admin, ctx.release.id, 'approve')
    expect(first.statusCode, first.body).toBe(201)
    expect(model.state.calls).toBe(0)

    const r2 = await nextRelease(ctx, 'preview-labs', ['resources:', '  memory: 1Gi'])
    const taken = await preview(app, ctx, admin, r2.id)
    expect(taken.statusCode, taken.body).toBe(201)
    expect(taken.json().diff.summary).toBe('summary #1')
    expect(taken.json().diff.baselineReleaseId).toBe(ctx.release.id)
    expect(model.state.calls).toBe(1)

    // RE-READ, NOT RECOMPUTED — the console's path back from the step-up (Read this first 23).
    const reread = await app.inject({
      method: 'GET',
      url: `/v1/releases/${r2.id}/approval-previews/${taken.json().id}`,
      cookies: admin,
    })
    expect(reread.statusCode, reread.body).toBe(200)
    expect(reread.json()).toEqual(taken.json())
    expect(model.state.calls).toBe(1)

    const approved = await decide(app, ctx, admin, r2.id, 'approve', {
      previewId: taken.json().id,
    })
    expect(approved.statusCode, approved.body).toBe(201)
    expect(approved.json().diff).toEqual(taken.json().diff)
    expect(approved.json().previewId).toBe(taken.json().id)
    expect(model.state.calls).toBe(1)
    // And the ROW names it — the binding is stored, not only answered.
    const [row] = await decisionsOn(ctx, r2.id)
    expect(row!.previewId).toBe(taken.json().id)
    await app.close()
    await ctx.app.close()
  })

  it('refuses an approval that names no preview: 400 APPROVAL_PREVIEW_REQUIRED, and writes no row', async () => {
    const ctx = await releasedProject('unnamed-labs')
    const admin = await loginAs(ctx.deps, 'platform_admin', { steppedUp: true })
    const refused = await decide(ctx.app, ctx, admin, ctx.release.id, 'approve', {})
    expect(refusal(refused)).toEqual({ status: 400, code: 'APPROVAL_PREVIEW_REQUIRED' })
    // THE REJECT ROUTE TOO: it is the same decision with the other value (Decision 10).
    const rejected = await decide(ctx.app, ctx, admin, ctx.release.id, 'reject', {
      reason: 'no preview was read',
    })
    expect(refusal(rejected)).toEqual({ status: 400, code: 'APPROVAL_PREVIEW_REQUIRED' })
    expect(await decisionsOn(ctx, ctx.release.id)).toHaveLength(0)
    // The positive half, in the same test: the same request NAMING a preview is recorded.
    const named = await previewThenDecide(
      ctx.app,
      ctx.deps,
      admin,
      ctx.release.id,
      'approve',
    )
    expect(named.statusCode, named.body).toBe(201)
    await ctx.app.close()
  })

  it('refuses a preview of ANOTHER release: 404 NOT_FOUND', async () => {
    const ctx = await releasedProject('crossed-labs')
    const admin = await loginAs(ctx.deps, 'platform_admin', { steppedUp: true })
    const ofR1 = await preview(ctx.app, ctx, admin, ctx.release.id)
    expect(ofR1.statusCode, ofR1.body).toBe(201)
    const r2 = await nextRelease(ctx, 'crossed-labs', ['resources:', '  memory: 1Gi'])

    const crossed = await decide(ctx.app, ctx, admin, r2.id, 'approve', {
      previewId: ofR1.json().id,
    })
    expect(refusal(crossed)).toEqual({ status: 404, code: 'NOT_FOUND' })
    expect(await decisionsOn(ctx, r2.id)).toHaveLength(0)
    // The read is scoped the same way: R1's preview is not R2's to answer.
    const read = await ctx.app.inject({
      method: 'GET',
      url: `/v1/releases/${r2.id}/approval-previews/${ofR1.json().id}`,
      cookies: admin,
    })
    expect(refusal(read)).toEqual({ status: 404, code: 'NOT_FOUND' })
    // The positive half: the preview IS R1's, and approves R1.
    const own = await decide(ctx.app, ctx, admin, ctx.release.id, 'approve', {
      previewId: ofR1.json().id,
    })
    expect(own.statusCode, own.body).toBe(201)
    await ctx.app.close()
  })

  it('refuses an expired preview: 409 APPROVAL_PREVIEW_EXPIRED', async () => {
    const ctx = await releasedProject('expired-labs')
    const admin = await loginAs(ctx.deps, 'platform_admin', { steppedUp: true })
    const taken = await preview(ctx.app, ctx, admin, ctx.release.id)
    expect(taken.statusCode, taken.body).toBe(201)
    // THE TTL ITSELF, from the stored row: 30 minutes after it was taken (Decision 10).
    const expiresAt = Date.parse(taken.json().expiresAt)
    expect(expiresAt - Date.parse(taken.json().createdAt)).toBe(PREVIEW_TTL_MS)

    // The boundary, at the function: a millisecond before is current; a millisecond after is not.
    const [row] = await ctx.deps.db
      .select()
      .from(approvalPreviews)
      .where(eq(approvalPreviews.id, taken.json().id))
    const [release] = await ctx.deps.db
      .select()
      .from(releases)
      .where(eq(releases.id, ctx.release.id))
    const digest = ctx.build.imageDigest as string
    await expect(
      assertPreviewCurrent(ctx.deps, row!, release!, digest, expiresAt - 1),
    ).resolves.toBeUndefined()
    const late = await assertPreviewCurrent(
      ctx.deps,
      row!,
      release!,
      digest,
      Date.parse(taken.json().createdAt) + PREVIEW_TTL_MS + 1,
    ).then(
      () => undefined,
      (error: unknown) => error,
    )
    expect(late).toBeInstanceOf(ReleaseError)
    expect((late as ReleaseError).code).toBe('APPROVAL_PREVIEW_EXPIRED')

    // And through the route: the row aged past its expiry, which is what thirty minutes does.
    await ctx.deps.db
      .update(approvalPreviews)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(approvalPreviews.id, taken.json().id))
    const refused = await decide(ctx.app, ctx, admin, ctx.release.id, 'approve', {
      previewId: taken.json().id,
    })
    expect(refusal(refused)).toEqual({ status: 409, code: 'APPROVAL_PREVIEW_EXPIRED' })
    expect(await decisionsOn(ctx, ctx.release.id)).toHaveLength(0)
    await ctx.app.close()
  })

  it('refuses a stale preview after ANOTHER release of the project was approved: 409 APPROVAL_PREVIEW_STALE', async () => {
    /**
     * REVIEW FOCUS 1 — two administrators, or one with two tabs. A preview of R2 is taken
     * against R1; R3 is then approved; R2 approved naming the first preview would record a
     * diff against a baseline that is no longer the last approved release. The facts differ,
     * so it is refused — and a NEW preview of R2 approves, which is the positive half.
     */
    const ctx = await releasedProject('stale-labs')
    const admin = await loginAs(ctx.deps, 'platform_admin', { steppedUp: true })
    const r1 = await previewThenDecide(
      ctx.app,
      ctx.deps,
      admin,
      ctx.release.id,
      'approve',
    )
    expect(r1.statusCode, r1.body).toBe(201)
    const r2 = await nextRelease(ctx, 'stale-labs', ['resources:', '  memory: 1Gi'])
    const old = await preview(ctx.app, ctx, admin, r2.id)
    expect(old.statusCode, old.body).toBe(201)
    expect(old.json().diff.baselineReleaseId).toBe(ctx.release.id)

    const r3 = await nextRelease(ctx, 'stale-labs', ['resources:', '  memory: 2Gi'])
    const approvedR3 = await previewThenDecide(ctx.app, ctx.deps, admin, r3.id, 'approve')
    expect(approvedR3.statusCode, approvedR3.body).toBe(201)

    const stale = await decide(ctx.app, ctx, admin, r2.id, 'approve', {
      previewId: old.json().id,
    })
    expect(refusal(stale)).toEqual({ status: 409, code: 'APPROVAL_PREVIEW_STALE' })
    expect(stale.json().error.message).toContain(
      'the last approved release of this project changed since this preview was taken',
    )
    expect(await decisionsOn(ctx, r2.id)).toHaveLength(0)

    const fresh = await preview(ctx.app, ctx, admin, r2.id)
    expect(fresh.statusCode, fresh.body).toBe(201)
    expect(fresh.json().diff.baselineReleaseId).toBe(r3.id)
    const approved = await decide(ctx.app, ctx, admin, r2.id, 'approve', {
      previewId: fresh.json().id,
    })
    expect(approved.statusCode, approved.body).toBe(201)
    await ctx.app.close()
  })

  it('a rejection binds a preview too, and records ITS summary', async () => {
    const ctx = await releasedProject('reject-labs')
    const model = countingModel()
    const app = await buildServer({ ...ctx.deps, llm: model.llm })
    const admin = await loginAs(ctx.deps, 'platform_admin', { steppedUp: true })
    expect(
      (await previewThenDecide(app, ctx.deps, admin, ctx.release.id, 'approve'))
        .statusCode,
    ).toBe(201)
    const r2 = await nextRelease(ctx, 'reject-labs', [
      'egress:',
      '  allow: [x.example.org]',
    ])
    const taken = await preview(app, ctx, admin, r2.id)
    expect(taken.statusCode, taken.body).toBe(201)
    const rejected = await decide(app, ctx, admin, r2.id, 'reject', {
      previewId: taken.json().id,
      reason: 'the PIA does not cover that destination',
    })
    expect(rejected.statusCode, rejected.body).toBe(201)
    expect(rejected.json().decision).toBe('rejected')
    expect(rejected.json().diff.summary).toBe('summary #1')
    expect(rejected.json().diff).toEqual(taken.json().diff)
    expect(model.state.calls).toBe(1)
    await app.close()
    await ctx.app.close()
  })

  it('the preview itself needs no step-up, and an approval still does', async () => {
    const ctx = await releasedProject('flat-labs')
    const flat = await loginAs(ctx.deps, 'platform_admin')
    // A PREVIEW DECIDES NOTHING (Decision 10), so an ordinary administrator session takes one.
    const taken = await preview(ctx.app, ctx, flat, ctx.release.id)
    expect(taken.statusCode, taken.body).toBe(201)
    const refused = await decide(ctx.app, ctx, flat, ctx.release.id, 'approve', {
      previewId: taken.json().id,
    })
    expect(refusal(refused)).toEqual({ status: 403, code: 'STEP_UP_REQUIRED' })
    expect(await decisionsOn(ctx, ctx.release.id)).toHaveLength(0)
    // AND THE SAME PREVIEW SURVIVES THE ROUND TRIP: stepped up, the administrator decides
    // naming the preview they read before it — the console's path (Read this first 23).
    const stepped = await loginAs(ctx.deps, 'platform_admin', { steppedUp: true })
    const approved = await decide(ctx.app, ctx, stepped, ctx.release.id, 'approve', {
      previewId: taken.json().id,
    })
    expect(approved.statusCode, approved.body).toBe(201)
    expect(approved.json().previewId).toBe(taken.json().id)
    await ctx.app.close()
  })

  it('a token is refused on both new routes: TOKEN_CREDENTIAL_REFUSED (the route), and TOKEN_PERSON_ONLY on the synthetic probe', async () => {
    /**
     * `requireSession` answers first on both routes, so a token HOLDING `release:approve`
     * (written straight to the store — the mint route refuses it since Task 2) is refused
     * `TOKEN_CREDENTIAL_REFUSED`. The central rule behind it, `TOKEN_PERSON_ONLY`, is asserted
     * on a synthetic route that omits `requireSession` in `api/person-only.test.ts`; its
     * `release:approve` probe is the same capability these two routes assert.
     */
    const ctx = await releasedProject('token-labs')
    const admin = await loginAs(ctx.deps, 'platform_admin', { steppedUp: true })
    const taken = await preview(ctx.app, ctx, admin, ctx.release.id)
    expect(taken.statusCode, taken.body).toBe(201)
    const { plaintext } = await mintTestToken(ctx.deps.db, {
      userId: (await ensureTestUser(ctx.deps.db, 'platform_admin')).id,
      projectId: ctx.project.id,
      capabilities: ['project:read', 'release:approve'],
      name: 'an agent that would preview its own work',
    })
    const bearer = { authorization: `Bearer ${plaintext}` }
    const post = await ctx.app.inject({
      method: 'POST',
      url: `/v1/releases/${ctx.release.id}/approval-preview`,
      headers: { ...mutationHeaders(ctx.deps), ...bearer },
    })
    expect(refusal(post)).toEqual({ status: 403, code: 'TOKEN_CREDENTIAL_REFUSED' })
    const get = await ctx.app.inject({
      method: 'GET',
      url: `/v1/releases/${ctx.release.id}/approval-previews/${taken.json().id}`,
      headers: bearer,
    })
    expect(refusal(get)).toEqual({ status: 403, code: 'TOKEN_CREDENTIAL_REFUSED' })
    // Nothing written by the token: the one preview is the administrator's.
    expect(await ctx.deps.db.select().from(approvalPreviews)).toHaveLength(1)
    await ctx.app.close()
  })

  it('the approval names the person who decided — decidedByName (P6a F16)', async () => {
    const ctx = await releasedProject('named-labs')
    const admin = await loginAs(ctx.deps, 'platform_admin', { steppedUp: true })
    const taken = await preview(ctx.app, ctx, admin, ctx.release.id)
    expect(taken.json().createdByName).toBe('Platform Admin')
    const approved = await decide(ctx.app, ctx, admin, ctx.release.id, 'approve', {
      previewId: taken.json().id,
    })
    expect(approved.statusCode, approved.body).toBe(201)
    expect(approved.json().decidedByName).toBe('Platform Admin')
    // THE OWNER'S READ, which is who meets a decision first (Decision 18).
    const read = await ctx.app.inject({
      method: 'GET',
      url: `/v1/releases/${ctx.release.id}/approval`,
      cookies: ctx.cookies,
    })
    expect(read.json().decidedByName).toBe('Platform Admin')
    await ctx.app.close()
  })

  it('code-review reads a PREVIEW’s verdict before anybody has decided (Decision 12)', async () => {
    /**
     * `latestReviewFor`'s second source. A reviewer runs when an administrator PREVIEWS, so the
     * checklist's non-blocking `code-review` item must see that verdict before any decision —
     * otherwise the item reads "No reviewer has looked at this release" beside a preview whose
     * reviewer reported findings.
     */
    const ctx = await releasedProject('verdict-labs')
    const reviewer: Reviewer = {
      name: 'preview-reviewer',
      review: () =>
        Promise.resolve({
          state: 'findings',
          reviewer: 'preview-reviewer',
          findings: [{ severity: 'advise', message: 'a query built by concatenation' }],
        }),
    }
    const app = await buildServer({ ...ctx.deps, reviewer })
    const staged = await app.inject({
      method: 'POST',
      url: `/v1/environments/${ctx.staging.id}/deploy`,
      payload: { releaseId: ctx.release.id },
      cookies: ctx.cookies,
      headers: mutationHeaders(ctx.deps),
    })
    expect(staged.statusCode, staged.body).toBe(200)
    const item = async () =>
      (
        await app.inject({
          method: 'GET',
          url: `/v1/projects/${ctx.project.id}/launch-readiness`,
          cookies: ctx.cookies,
        })
      )
        .json()
        .items.find((i: { id: string }) => i.id === 'code-review')
    // BEFORE: nothing asked, so nothing to read — the positive half of the claim below.
    expect((await item()).state).toBe('not_built')
    const flat = await loginAs(ctx.deps, 'platform_admin')
    expect((await preview(app, ctx, flat, ctx.release.id)).statusCode).toBe(201)
    const after = await item()
    expect(after).toMatchObject({ state: 'unmet', blocking: false })
    expect(after.why).toContain('1 finding')
    expect(await decisionsOn(ctx, ctx.release.id)).toHaveLength(0)
    await app.close()
    await ctx.app.close()
  })
})

describe('the facts — what an approval compares, and what it never does', () => {
  const SNAPSHOT: DiffSnapshot = {
    imageDigest: `sha256:${'a'.repeat(64)}`,
    changes: [
      { path: 'resources.memory', from: '512Mi', to: '1Gi', summary: 'more memory' },
    ],
    services: [],
    attributes: [],
    resources: { cpu: 1, memory: '1Gi', disk: null, pids: 64 },
    summary: 'summary #1',
    summarySource: 'llm',
    review: { state: 'not_performed', reviewer: 'none', detail: 'nothing' },
    baselineReleaseId: '11111111-1111-4111-8111-111111111111',
    sensitiveFields: ['resources'],
    security: [{ field: 'resources', note: 'cost' }],
    coverage: 'the limit',
  }

  it('factsOf strips the summary, its source and the verdict — and keeps the baseline', () => {
    const facts = factsOf(SNAPSHOT)
    expect(Object.keys(facts).sort()).toEqual(
      [
        'attributes',
        'baselineReleaseId',
        'changes',
        'coverage',
        'imageDigest',
        'resources',
        'security',
        'sensitiveFields',
        'services',
      ].sort(),
    )
  })

  it('sameFacts ignores key order and the model’s words, and sees a moved baseline', () => {
    // A jsonb round trip hands keys back by length, then bytes — a different order from the
    // one computed a moment ago (spec/diff.ts's `stable`, measured in P5a sitting 6).
    // Every level reversed by hand — a `JSON.stringify` replacer ARRAY would filter nested keys
    // too, and compare two snapshots that had lost their changes' fields.
    const reordered = Object.fromEntries(
      Object.entries(SNAPSHOT).reverse(),
    ) as unknown as DiffSnapshot
    reordered.resources = { pids: 64, disk: null, memory: '1Gi', cpu: 1 }
    reordered.changes = SNAPSHOT.changes.map(
      (c) =>
        Object.fromEntries(
          Object.entries(c).reverse(),
        ) as DiffSnapshot['changes'][number],
    )
    expect(Object.keys(reordered)[0]).toBe('coverage')
    expect(sameFacts(factsOf(SNAPSHOT), factsOf(reordered))).toBe(true)
    expect(
      sameFacts(factsOf(SNAPSHOT), factsOf({ ...SNAPSHOT, summary: 'summary #2' })),
    ).toBe(true)
    expect(
      sameFacts(
        factsOf(SNAPSHOT),
        factsOf({
          ...SNAPSHOT,
          baselineReleaseId: '22222222-2222-4222-8222-222222222222',
        }),
      ),
    ).toBe(false)
  })

  it('previewFor is scoped to the release it names', async () => {
    const ctx = await releasedProject('scoped-labs')
    const admin = await loginAs(ctx.deps, 'platform_admin', { steppedUp: true })
    const taken = await preview(ctx.app, ctx, admin, ctx.release.id)
    expect((await previewFor(ctx.deps.db, taken.json().id, ctx.release.id))?.id).toBe(
      taken.json().id,
    )
    expect(
      await previewFor(
        ctx.deps.db,
        taken.json().id,
        '00000000-0000-0000-0000-000000000000',
      ),
    ).toBeUndefined()
    await ctx.app.close()
  })
})
