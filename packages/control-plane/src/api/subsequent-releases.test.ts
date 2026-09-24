import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { approvals, events, instances, projects, releases } from '../db/index.js'
import { resetDatabase } from '../db/testing.js'
import { ensureTestUser } from '../identity/testing.js'
import {
  approvalRequirementFor,
  deployRelease,
  launchedAt,
  productionApprovalFor,
  type ReleaseRow,
} from '../releases/index.js'
import { FAKE_NEVER_READY_PATH } from '../runtime/index.js'
import { mintTestToken } from '../tokens/testing.js'
import type { ServerDeps } from './server.js'
import {
  approvedProject,
  commitManifest,
  CWL_LAUNCH_ATTRIBUTES,
  cwlManifest,
  launchedCwlProject,
  launchedProject,
  loginAs,
  mutationHeaders,
  previewThenDecide,
  projectFor,
  refusal,
  releasedProject,
} from './testing.js'

beforeEach(resetDatabase)
afterAll(resetDatabase)

/**
 * §13 D9.2 — WHAT A LAUNCHED APP'S NEXT RELEASE NEEDS (P6b Tasks 5, 6 and 7 add to this
 * file). Once an app has launched, a release goes to production self-serve unless it
 * changes one of §7's sensitive fields since the last approved release; then it needs an
 * administrator again. A release an administrator rejected never deploys (Decision 7).
 */

type Released = Awaited<ReturnType<typeof releasedProject>>
/** What `nextRelease` and `stage` read — so a project that was never released can use them. */
type ProjectCtx = Pick<Released, 'app' | 'deps' | 'cookies' | 'project'>

/**
 * `deployRelease` EXACTLY AS THE DEPLOY ROUTE CALLS IT (`api/routes/releases.ts`), with the
 * same eight `DeployDeps` fields — and WITHOUT the route's gate in front of it, because that
 * gate's checklist is first-launch until Task 6. This block is the gate's SECOND half,
 * measured alone (P6a F8 measured the two halves as independent); Task 6 measures the route.
 */
function deployDirect(deps: ServerDeps, releaseId: string, environmentId: string) {
  return deployRelease(
    deps.db,
    deps.driver,
    deps.config,
    {
      secrets: deps.secrets,
      appSecrets: deps.appSecrets,
      sso: deps.sso,
      blueprints: deps.blueprints,
      ai: deps.ai,
      catalogue: deps.catalogue,
      bus: deps.bus,
      retirer: deps.retirer,
    },
    { releaseId, environmentId },
  )
}

/**
 * CLOSE A TEST'S SERVER ONLY ONCE ITS BACKGROUND WORK HAS FINISHED (P6b sitting 4). A deploy
 * schedules a retire pass and answers without waiting for it (§11's drain), and this file
 * closed the server with that pass still running — so the NEXT test's `beforeEach`
 * `TRUNCATE` raced it: every run of this file logged 4–6 `[retire] the pass … failed`, and 2
 * of 11 runs failed a test with `deadlock detected` inside `resetDatabase`. `retirer.idle()`
 * exists for exactly this; `withProjectServer` drains the build runner the same way.
 */
async function closed(ctx: Pick<Released, 'app' | 'deps'>): Promise<void> {
  await ctx.deps.builds.idle()
  await ctx.deps.retirer.idle()
  await ctx.app.close()
}

/** A minimal valid manifest for `fixture-node@1`, with `extra` lines appended. */
const manifest = (slug: string, extra: readonly string[] = []) => [
  'manifest: 1',
  `name: ${slug}`,
  'blueprint: fixture-node@1',
  'runtime:',
  '  port: 3000',
  '  health: /healthz',
  ...extra,
]

/**
 * THE PROJECT'S NEXT RELEASE, through the routes a person uses. With `lines`, that manifest
 * is committed and validated first; without, the build takes the last VALIDATED manifest's
 * commit again — an identical rebuild, which the reproducible builder turns into a NEW
 * release with the SAME digest (P6a F3).
 */
async function nextRelease(
  ctx: ProjectCtx,
  lines?: readonly string[],
): Promise<{ id: string; imageDigest: string }> {
  if (lines !== undefined) await commitManifest(ctx, lines, 'feat: the next release')
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

/** An administrator's decision, through the route (`admin` is stepped up). */
async function decide(
  ctx: Released & { admin: Record<string, string> },
  releaseId: string,
  decision: 'approve' | 'reject',
  reason: string,
) {
  const res = await previewThenDecide(ctx.app, ctx.deps, ctx.admin, releaseId, decision, {
    reason,
  })
  expect(res.statusCode, res.body).toBe(201)
}

const rowOf = async (ctx: Released, releaseId: string): Promise<ReleaseRow> => {
  const [row] = await ctx.deps.db
    .select()
    .from(releases)
    .where(eq(releases.id, releaseId))
  return row!
}

/** The instances a release has ever had — `[]` is "refused before anything started". */
const instancesOf = (ctx: Released, releaseId: string) =>
  ctx.deps.db
    .select({ id: instances.id })
    .from(instances)
    .where(eq(instances.releaseId, releaseId))

describe('deployRelease’s half of D9.2 (P6b Task 5)', () => {
  /**
   * **THE POSITIVE CONTROL, AND FIRST** — every refusal below is true of a platform that
   * refuses everything, which is what P6a built: before this task every production release
   * needed an approval covering its own digest. This is the one case whose DEPLOY can tell
   * the two apart.
   */
  it('a launched app’s identical rebuild deploys to production with NO approval — self-serve (D9)', async () => {
    const ctx = await launchedProject('d92-rebuild')
    const rebuilt = await nextRelease(ctx)
    // A NEW release (F3: same digest, because the builder is reproducible).
    expect(rebuilt.id).not.toBe(ctx.release.id)

    const instance = await deployDirect(ctx.deps, rebuilt.id, ctx.production.id)
    expect(instance.state).toBe('healthy')
    const decided = await ctx.deps.db
      .select()
      .from(approvals)
      .where(eq(approvals.releaseId, rebuilt.id))
    expect(decided).toEqual([])
    expect(
      await approvalRequirementFor(ctx.deps.db, await rowOf(ctx, rebuilt.id)),
    ).toEqual({
      required: false,
      reason: 'self-serve',
      baselineReleaseId: ctx.release.id,
      fields: [],
    })
    await closed(ctx)
  })

  it('redeploys the release production already serves, self-serve, and records no second launch', async () => {
    const ctx = await launchedProject('d92-redeploy')
    const at = await launchedAt(ctx.deps.db, ctx.project.id)
    expect(at).toBeInstanceOf(Date)

    const again = await deployDirect(ctx.deps, ctx.release.id, ctx.production.id)
    expect(again.state).toBe('healthy')
    expect(again.id).not.toBe(ctx.launched.id)
    expect(await launchedAt(ctx.deps.db, ctx.project.id)).toEqual(at)
    const launches = await ctx.deps.db
      .select()
      .from(events)
      .where(
        and(eq(events.projectId, ctx.project.id), eq(events.type, 'project.launched')),
      )
    expect(launches).toHaveLength(1)
    // WHY IT PASSES: the release in hand is excluded from its own baseline (Decision 4), so
    // with no other approved release there is none — which fails closed — and its OWN
    // approval covers the digest. No administrator is asked for anything new.
    expect(
      await productionApprovalFor(
        ctx.deps.db,
        await rowOf(ctx, ctx.release.id),
        ctx.release.imageDigest,
      ),
    ).toMatchObject({
      requirement: { required: true, reason: 'no-baseline' },
      rejected: false,
      covered: true,
      satisfied: true,
    })
    await closed(ctx)
  })

  it('refuses a release that ADDS an egress host: RELEASE_DIGEST_NOT_APPROVED, naming egress.allow, before anything starts', async () => {
    const ctx = await launchedProject('d92-egress')
    const added = await nextRelease(
      ctx,
      manifest('d92-egress', ['egress:', '  allow: [x.example.org]']),
    )
    await expect(
      deployDirect(ctx.deps, added.id, ctx.production.id),
    ).rejects.toMatchObject({
      code: 'RELEASE_DIGEST_NOT_APPROVED',
      message: expect.stringContaining('egress.allow'),
    })
    expect(await instancesOf(ctx, added.id)).toEqual([])
    expect(await approvalRequirementFor(ctx.deps.db, await rowOf(ctx, added.id))).toEqual(
      {
        required: true,
        reason: 'sensitive',
        baselineReleaseId: ctx.release.id,
        fields: ['egress.allow'],
      },
    )
    await closed(ctx)
  })

  it('refuses a release that raises the PRODUCTION override — [M3], through the gate’s own half', async () => {
    const ctx = await launchedProject('d92-override')
    const raised = await nextRelease(
      ctx,
      manifest('d92-override', [
        'environments:',
        '  production:',
        '    resources:',
        '      memory: 1Gi',
      ]),
    )
    await expect(
      deployDirect(ctx.deps, raised.id, ctx.production.id),
    ).rejects.toMatchObject({
      code: 'RELEASE_DIGEST_NOT_APPROVED',
      message: expect.stringContaining('resources'),
    })
    expect(await instancesOf(ctx, raised.id)).toEqual([])
    expect(
      await approvalRequirementFor(ctx.deps.db, await rowOf(ctx, raised.id)),
    ).toEqual({
      required: true,
      reason: 'sensitive',
      baselineReleaseId: ctx.release.id,
      fields: ['resources'],
    })
    await closed(ctx)
  })

  it('deploys the sensitive release once an approval covers its digest', async () => {
    const ctx = await launchedProject('d92-approved')
    const added = await nextRelease(
      ctx,
      manifest('d92-approved', ['egress:', '  allow: [x.example.org]']),
    )
    await decide(ctx, added.id, 'approve', 'the new destination is covered by the PIA')
    const instance = await deployDirect(ctx.deps, added.id, ctx.production.id)
    expect(instance.state).toBe('healthy')
    expect(
      await productionApprovalFor(
        ctx.deps.db,
        await rowOf(ctx, added.id),
        added.imageDigest,
      ),
    ).toMatchObject({
      requirement: { required: true, reason: 'sensitive', fields: ['egress.allow'] },
      covered: true,
      satisfied: true,
    })
    await closed(ctx)
  })

  /** **Decision 7 — Review Focus 4.** A rejection is final for this release, sensitive or not. */
  it('refuses a REJECTED release that changes nothing sensitive — Decision 7', async () => {
    const ctx = await launchedProject('d92-rejected')
    const rebuilt = await nextRelease(ctx)
    await decide(ctx, rebuilt.id, 'reject', 'not this week — the term starts Monday')
    await expect(
      deployDirect(ctx.deps, rebuilt.id, ctx.production.id),
    ).rejects.toMatchObject({
      code: 'RELEASE_DIGEST_NOT_APPROVED',
      message: expect.stringContaining('not this week — the term starts Monday'),
    })
    expect(await instancesOf(ctx, rebuilt.id)).toEqual([])
    // Nothing sensitive changed, so without the rejection this would be self-serve — the
    // positive control above is the same release shape, deployed.
    expect(
      await productionApprovalFor(
        ctx.deps.db,
        await rowOf(ctx, rebuilt.id),
        rebuilt.imageDigest,
      ),
    ).toMatchObject({
      requirement: { required: false, reason: 'self-serve' },
      rejected: true,
      satisfied: false,
    })
    await closed(ctx)
  })

  /**
   * **FAIL CLOSED.** A launch needs an approval, so a launched project with nothing approved
   * has had its history edited — `launched_at` is set here by hand, which is exactly that.
   * Self-serve is the expensive direction to be wrong in.
   */
  it('fails closed when launched_at is set and nothing was ever approved: required, no-baseline', async () => {
    const ctx = await releasedProject('d92-nobase')
    await ctx.deps.db
      .update(projects)
      .set({ launchedAt: new Date() })
      .where(eq(projects.id, ctx.project.id))
    await expect(
      deployDirect(ctx.deps, ctx.release.id, ctx.production.id),
    ).rejects.toMatchObject({ code: 'RELEASE_DIGEST_NOT_APPROVED' })
    expect(await instancesOf(ctx, ctx.release.id)).toEqual([])
    expect(
      await approvalRequirementFor(ctx.deps.db, await rowOf(ctx, ctx.release.id)),
    ).toEqual({
      required: true,
      reason: 'no-baseline',
      baselineReleaseId: null,
      fields: [],
    })
    await closed(ctx)
  })

  /**
   * **DECISION 4 AND `[M5]` AT THE GATE.** R2 changed egress and was approved, then the
   * approval was withdrawn. R3 is R2 again. Against R2 it changes nothing and would walk
   * through; against R1 — the last release whose LATEST decision is `approved` — it adds a
   * host, and re-escalates.
   */
  it('takes the baseline from the LATEST decision: R2 approved then rejected, R3 == R2 is re-escalated against R1', async () => {
    const ctx = await launchedProject('d92-latest')
    const r2 = await nextRelease(
      ctx,
      manifest('d92-latest', ['egress:', '  allow: [x.example.org]']),
    )
    await decide(ctx, r2.id, 'approve', 'looks right')
    await decide(ctx, r2.id, 'reject', 'withdrawn — the destination is not in the PIA')
    const r3 = await nextRelease(ctx)
    expect(await approvalRequirementFor(ctx.deps.db, await rowOf(ctx, r3.id))).toEqual({
      required: true,
      reason: 'sensitive',
      baselineReleaseId: ctx.release.id,
      fields: ['egress.allow'],
    })
    await expect(deployDirect(ctx.deps, r3.id, ctx.production.id)).rejects.toMatchObject({
      code: 'RELEASE_DIGEST_NOT_APPROVED',
    })
    await closed(ctx)
  })

  /**
   * **D9.1, UNCHANGED.** Before a launch every production release needs an approval — even
   * an identical rebuild of an approved one (Decision 3: the candidate changed, and asking
   * is the safe direction). Built WITHOUT `launchedProject`, which launches: a fixture that
   * launched by accident would make this a D9.2 test.
   */
  it('a first launch is unchanged: no approval, refused, exactly as P6a built it', async () => {
    const ctx = await approvedProject('d91-first')
    expect(await launchedAt(ctx.deps.db, ctx.project.id)).toBeNull()
    const rebuilt = await nextRelease(ctx)
    await expect(
      deployDirect(ctx.deps, rebuilt.id, ctx.production.id),
    ).rejects.toMatchObject({ code: 'RELEASE_DIGEST_NOT_APPROVED' })
    expect(await instancesOf(ctx, rebuilt.id)).toEqual([])
    expect(
      await approvalRequirementFor(ctx.deps.db, await rowOf(ctx, rebuilt.id)),
    ).toEqual({
      required: true,
      reason: 'first-launch',
      baselineReleaseId: null,
      fields: [],
    })
    // AND THE APPROVED ONE DOES DEPLOY — the refusal above is about this release, not a
    // production that refuses everything.
    const launched = await deployDirect(ctx.deps, ctx.release.id, ctx.production.id)
    expect(launched.state).toBe('healthy')
    await closed(ctx)
  })
})

/** Deploy to STAGING through the route — which is what makes a release the candidate (§13). */
async function stage(ctx: ProjectCtx, releaseId: string): Promise<{ state: string }> {
  const staging = ctx.project.environments.find(
    (e: { kind: string }) => e.kind === 'staging',
  )
  const res = await ctx.app.inject({
    method: 'POST',
    url: `/v1/environments/${staging.id}/deploy`,
    payload: { releaseId },
    cookies: ctx.cookies,
    headers: mutationHeaders(ctx.deps),
  })
  expect(res.statusCode, res.body).toBe(200)
  return res.json()
}

/** §13's checklist as a person reads it — the other half of every byte-identical assertion. */
const readinessOf = (ctx: ProjectCtx) =>
  ctx.app.inject({
    method: 'GET',
    url: `/v1/projects/${ctx.project.id}/launch-readiness`,
    cookies: ctx.cookies,
  })

/** A production deploy through the ROUTE, by the stepped-up owner unless told otherwise. */
const promote = (ctx: Released & { owner: Record<string, string> }, releaseId: string) =>
  ctx.app.inject({
    method: 'POST',
    url: `/v1/environments/${ctx.production.id}/deploy`,
    payload: { releaseId },
    cookies: ctx.owner,
    headers: mutationHeaders(ctx.deps),
  })

/** Which instance production serves, as a client reads it. */
const servingProduction = async (ctx: Released): Promise<string | undefined> =>
  (
    await ctx.app.inject({
      method: 'GET',
      url: `/v1/environments/${ctx.production.id}`,
      cookies: ctx.cookies,
    })
  ).json().instance?.id

const approvalsOf = (ctx: ProjectCtx, releaseId: string) =>
  ctx.deps.db.select().from(approvals).where(eq(approvals.releaseId, releaseId))

type Item = { id: string; state: string; blocking: boolean; why: string; title: string }
const itemOf = (view: { items: Item[] }, id: string): Item | undefined =>
  view.items.find((i) => i.id === id)
const unmetBlocking = (view: { items: Item[] }) =>
  view.items.filter((i) => i.blocking && i.state !== 'met').map((i) => i.id)

/**
 * §13 D9.2 THROUGH THE ROUTE (P6b Task 6) — the gate's FIRST half, and the one a client meets.
 * `deployRelease`'s half is the block above; P6a F8 measured the two as independent, and Task
 * 6's controls (d) and (e) re-measure it.
 *
 * Every case asserts the DEPLOY's answer first and the VIEW second, so a red says what the
 * route did before it says why; and every refusal asserts its CODE, because `409` is three
 * refusals on this one route.
 */
describe('the gate for a launched app (D9.2, P6b Task 6)', () => {
  /**
   * **THE POSITIVE CONTROL, FIRST.** Every refusal below is true of the route P6a built, which
   * asked an administrator for every production release. This is the one case that tells the
   * two apart: an identical rebuild — a NEW release (P6a F3) — goes to production with NO
   * administrator, through the route a person uses.
   */
  it('a launched app’s owner deploys an identical rebuild to production through the ROUTE, with no administrator', async () => {
    const ctx = await launchedProject('g6-selfserve')
    const rebuilt = await nextRelease(ctx)
    expect((await stage(ctx, rebuilt.id)).state).toBe('healthy')
    const read = (await readinessOf(ctx)).json()

    const deployed = await promote(ctx, rebuilt.id)
    expect(refusal(deployed)).toEqual({ status: 200, code: undefined })
    expect(deployed.json()).toMatchObject({ releaseId: rebuilt.id, state: 'healthy' })
    expect(await servingProduction(ctx)).toBe(deployed.json().id)
    expect(await approvalsOf(ctx, rebuilt.id)).toEqual([])

    expect(read).toMatchObject({
      launched: true,
      ready: true,
      reescalated: false,
      candidateReleaseId: rebuilt.id,
      baselineReleaseId: ctx.release.id,
      sensitiveFields: [],
    })
    // DECISION 2's LIST, BY ID AND IN ORDER: no `rehearsal` once launched — after a launch a
    // rehearsal would put an unapproved release on the live listener (Decision 16).
    expect(read.items.map((i: Item) => i.id)).toEqual([
      'domain',
      'iam-registration',
      'privacy-assessment',
      'scans',
      'admin-approval',
      'code-review',
    ])
    expect(itemOf(read, 'admin-approval')).toMatchObject({ state: 'met', blocking: true })
    expect(itemOf(read, 'admin-approval')!.why).toContain('self-serve')
    await closed(ctx)
  })

  it('refuses a sensitive release: 409 RELEASE_REESCALATED, and the envelope’s checklist IS the read, byte for byte', async () => {
    const ctx = await launchedProject('g6-reesc')
    const added = await nextRelease(
      ctx,
      manifest('g6-reesc', ['egress:', '  allow: [x.example.org]']),
    )
    await stage(ctx, added.id)
    const read = await readinessOf(ctx)

    const refused = await promote(ctx, added.id)
    expect(refusal(refused)).toEqual({ status: 409, code: 'RELEASE_REESCALATED' })
    // P6a DECISION 2, KEPT: what a person reads and what refuses them are one computation.
    expect(JSON.stringify(refused.json().error.launchReadiness)).toBe(
      JSON.stringify(read.json()),
    )
    expect(read.json()).toMatchObject({
      launched: true,
      ready: false,
      reescalated: true,
      candidateReleaseId: added.id,
      baselineReleaseId: ctx.release.id,
      sensitiveFields: ['egress.allow'],
    })
    expect(unmetBlocking(read.json())).toEqual(['admin-approval'])
    expect(itemOf(read.json(), 'admin-approval')!.why).toContain('egress.allow')
    // And production still serves the launch — the refusal started nothing.
    expect(await servingProduction(ctx)).toBe(ctx.launched.id)
    expect(await instancesOf(ctx, added.id)).toHaveLength(1) // its staging instance only
    await closed(ctx)
  })

  it('deploys the sensitive release once an administrator has approved it', async () => {
    const ctx = await launchedProject('g6-approved')
    const added = await nextRelease(
      ctx,
      manifest('g6-approved', ['egress:', '  allow: [x.example.org]']),
    )
    await stage(ctx, added.id)
    await decide(ctx, added.id, 'approve', 'the new destination is covered by the PIA')
    const read = (await readinessOf(ctx)).json()

    const deployed = await promote(ctx, added.id)
    expect(refusal(deployed)).toEqual({ status: 200, code: undefined })
    expect(deployed.json()).toMatchObject({ releaseId: added.id, state: 'healthy' })

    expect(read).toMatchObject({
      launched: true,
      ready: true,
      reescalated: false,
      sensitiveFields: ['egress.allow'],
    })
    const item = itemOf(read, 'admin-approval')!
    expect(item.state).toBe('met')
    expect(item.why).toMatch(
      /changes egress\.allow since the last approved release, and an administrator approved it on \d{4}-/,
    )
    await closed(ctx)
  })

  /**
   * **DECISION 8 — `[M8]` CLOSED.** The checklist describes the candidate; a deploy naming any
   * other release is refused, carrying that checklist. R_old is approved and launched, and
   * production serves it; the candidate R_new is a self-serve rebuild serving staging.
   */
  it('refuses a release that is not the one serving staging: 409 RELEASE_NOT_STAGED, with the view', async () => {
    const ctx = await launchedProject('g6-notstaged')
    const candidate = await nextRelease(ctx)
    await stage(ctx, candidate.id)
    const read = await readinessOf(ctx)
    const before = (await instancesOf(ctx, ctx.release.id)).length

    const refused = await promote(ctx, ctx.release.id)
    expect(refusal(refused)).toEqual({ status: 409, code: 'RELEASE_NOT_STAGED' })
    expect(JSON.stringify(refused.json().error.launchReadiness)).toBe(
      JSON.stringify(read.json()),
    )
    // THE CHECKLIST IS SATISFIED — for the candidate. That is the only way this code appears.
    expect(read.json()).toMatchObject({ ready: true, candidateReleaseId: candidate.id })
    expect((await instancesOf(ctx, ctx.release.id)).length).toBe(before)
    expect(await servingProduction(ctx)).toBe(ctx.launched.id)
    await closed(ctx)
  })

  /**
   * **REVIEW FOCUS 3 THROUGH THE ROUTE, AND SITTING 3's F9.** The launch release redeployed:
   * it is still serving staging, so it is the candidate; the release in hand is excluded
   * from its own baseline, so the rule reads `no-baseline` with `fields: []`, and its OWN
   * approval covers it. The `admin-approval` item must say that in words — the plan's snippet
   * printed *"This release changes , and an administrator approved it"* here.
   */
  it('redeploys the launch release through the route: covered by its own approval, worded for it, no second launch', async () => {
    const ctx = await launchedProject('g6-redeploy')
    const at = await launchedAt(ctx.deps.db, ctx.project.id)
    const read = (await readinessOf(ctx)).json()

    const again = await promote(ctx, ctx.release.id)
    expect(refusal(again)).toEqual({ status: 200, code: undefined })
    expect(again.json()).toMatchObject({ releaseId: ctx.release.id, state: 'healthy' })
    expect(await launchedAt(ctx.deps.db, ctx.project.id)).toEqual(at)

    expect(read).toMatchObject({
      launched: true,
      ready: true,
      reescalated: false,
      candidateReleaseId: ctx.release.id,
      baselineReleaseId: null,
      sensitiveFields: [],
    })
    const item = itemOf(read, 'admin-approval')!
    expect(item.state).toBe('met')
    expect(item.why).not.toMatch(/changes\s*,/)
    expect(item.why).toContain('approved')
    await closed(ctx)
  })

  /**
   * **REVIEW FOCUS 2**: a launched app whose staging serves NOTHING is refused because nothing
   * serves staging — never for a first-launch reason. Never staged at all here, which needs
   * `launched_at` written by hand: a launch needs a candidate, so no route reaches this state.
   */
  it('a launched app with NOTHING serving staging is refused for that reason, not a first-launch one', async () => {
    const ctx = await releasedProject('g6-empty')
    await ctx.deps.db
      .update(projects)
      .set({ launchedAt: new Date() })
      .where(eq(projects.id, ctx.project.id))
    const owner = await loginAs(ctx.deps, 'bio_prof', { steppedUp: true })

    const refused = await promote({ ...ctx, owner }, ctx.release.id)
    expect(refusal(refused)).toEqual({
      status: 409,
      code: 'RELEASE_PRODUCTION_GATE_UNAVAILABLE',
    })
    const view = refused.json().error.launchReadiness
    expect(view).toMatchObject({
      launched: true,
      reescalated: false,
      candidateReleaseId: null,
    })
    expect(itemOf(view, 'scans')).toMatchObject({ state: 'unmet' })
    expect(itemOf(view, 'scans')!.why).toContain('Nothing is serving in staging')
    expect(itemOf(view, 'rehearsal')).toBeUndefined()
    await closed(ctx)
  })

  /**
   * **REVIEW FOCUS 2's OTHER HALF — "A FAILED INSTANCE".** A staging whose only deploy FAILED
   * serves nothing: the failed instance has no Route record, and `servingInstanceOf` falls
   * back to the newest instance of ANY state for apps deployed before P4c. The candidate must
   * not be a release that never served staging (§13: *production runs exactly what staging
   * ran*).
   */
  it('a staging whose only deploy FAILED has no candidate: the failed release is not what staging ran', async () => {
    const ctx = await projectFor('bio_prof', 'g6-failed')
    const failing = await nextRelease(
      ctx,
      manifest('g6-failed').map((l) =>
        l === '  health: /healthz' ? `  health: ${FAKE_NEVER_READY_PATH}` : l,
      ),
    )
    expect((await stage(ctx, failing.id)).state).toBe('failed')

    const view = (await readinessOf(ctx)).json()
    expect(view.candidateReleaseId).toBeNull()
    expect(itemOf(view, 'scans')!.why).toContain('Nothing is serving in staging')
    await closed(ctx)
  })

  /** **REVIEW FOCUS 4 — Decision 7.** An approval cannot fix a rejection already made. */
  it('a rejected, non-sensitive release: 409 RELEASE_PRODUCTION_GATE_UNAVAILABLE — an approval cannot fix a rejection', async () => {
    const ctx = await launchedProject('g6-rej')
    const rebuilt = await nextRelease(ctx)
    await stage(ctx, rebuilt.id)
    await decide(ctx, rebuilt.id, 'reject', 'not this week — the term starts Monday')

    const refused = await promote(ctx, rebuilt.id)
    expect(refusal(refused)).toEqual({
      status: 409,
      code: 'RELEASE_PRODUCTION_GATE_UNAVAILABLE',
    })
    const view = refused.json().error.launchReadiness
    expect(view).toMatchObject({
      launched: true,
      reescalated: false,
      sensitiveFields: [],
    })
    expect(itemOf(view, 'admin-approval')).toMatchObject({ state: 'unmet' })
    expect(itemOf(view, 'admin-approval')!.why).toContain(
      'not this week — the term starts Monday',
    )
    expect(await servingProduction(ctx)).toBe(ctx.launched.id)
    await closed(ctx)
  })

  /**
   * **NOT `RELEASE_REESCALATED`**, though a sensitive field changed: that code sends a client
   * to ask an administrator, and this one has already said no. *(The plan's self-review
   * caught an earlier draft keying the code on `sensitiveFields` alone — control (g).)*
   */
  it('a rejected SENSITIVE release: RELEASE_PRODUCTION_GATE_UNAVAILABLE too, not RELEASE_REESCALATED — reescalated false', async () => {
    const ctx = await launchedProject('g6-rejsens')
    const added = await nextRelease(
      ctx,
      manifest('g6-rejsens', ['egress:', '  allow: [x.example.org]']),
    )
    await stage(ctx, added.id)
    await decide(ctx, added.id, 'reject', 'that destination is not in the PIA')

    const refused = await promote(ctx, added.id)
    expect(refusal(refused)).toEqual({
      status: 409,
      code: 'RELEASE_PRODUCTION_GATE_UNAVAILABLE',
    })
    expect(refused.json().error.launchReadiness).toMatchObject({
      launched: true,
      reescalated: false,
      sensitiveFields: ['egress.allow'],
    })
    await closed(ctx)
  })

  /**
   * **REVIEW FOCUS 5.** Self-serve means no ADMINISTRATOR, not no person (*Read this first*
   * 15): an agent's production promotion is still D24's question, which the owner answers
   * stepped up — and then it deploys with no approval anywhere.
   */
  it('an agent’s self-serve promotion is still a question a person answers (D24), and then needs no administrator', async () => {
    const ctx = await launchedProject('g6-agent')
    const rebuilt = await nextRelease(ctx)
    await stage(ctx, rebuilt.id)
    const owner = await ensureTestUser(ctx.deps.db, 'bio_prof')
    // A token the way a REAL one is minted: WITHOUT the privileged `release:promote`.
    const { plaintext } = await mintTestToken(ctx.deps.db, {
      userId: owner.id,
      projectId: ctx.project.id,
      capabilities: ['release:deploy'],
    })
    const ask = () =>
      ctx.app.inject({
        method: 'POST',
        url: `/v1/environments/${ctx.production.id}/deploy`,
        payload: { releaseId: rebuilt.id },
        headers: {
          authorization: `Bearer ${plaintext}`,
          'idempotency-key': 'g'.repeat(12),
        },
      })

    const asked = await ask()
    expect(refusal(asked)).toEqual({ status: 403, code: 'TOKEN_ACTION_PENDING' })
    const confirmed = await ctx.app.inject({
      method: 'POST',
      url: `/v1/pending-actions/${asked.json().error.pendingAction.id}/confirm`,
      cookies: ctx.owner,
      headers: mutationHeaders(ctx.deps),
    })
    expect(refusal(confirmed)).toEqual({ status: 200, code: undefined })

    const retried = await ask()
    expect(refusal(retried)).toEqual({ status: 200, code: undefined })
    expect(retried.json()).toMatchObject({ releaseId: rebuilt.id, state: 'healthy' })
    expect(await approvalsOf(ctx, rebuilt.id)).toEqual([])
    await closed(ctx)
  })

  it('an unlaunched project’s view is P6a’s, unchanged: launched false, reescalated false, baselineReleaseId null, sensitiveFields []', async () => {
    const ctx = await approvedProject('g6-first')
    const view = (await readinessOf(ctx)).json()
    expect(view).toMatchObject({
      launched: false,
      ready: true,
      reescalated: false,
      baselineReleaseId: null,
      sensitiveFields: [],
      candidateReleaseId: ctx.release.id,
    })
    expect(view.items.map((i: Item) => i.id)).toEqual([
      'domain',
      'iam-registration',
      'privacy-assessment',
      'rehearsal',
      'scans',
      'admin-approval',
      'code-review',
    ])
    expect(itemOf(view, 'admin-approval')!.title).toBe(
      'Release approved by a platform administrator',
    )
    await closed(ctx)
  })
})

type CwlCtx = Awaited<ReturnType<typeof launchedCwlProject>>

/** UBC IAM's registration as an administrator records it, through the route (`admin` is stepped up). */
const recordRegistration = (ctx: CwlCtx, body: Record<string, unknown>) =>
  ctx.app.inject({
    method: 'POST',
    url: `/v1/projects/${ctx.project.id}/launch-records/iam-registration`,
    payload: body,
    cookies: ctx.admin,
    headers: mutationHeaders(ctx.deps),
  })

/** The registration as a member reads it. */
const registrationOf = async (ctx: CwlCtx) =>
  (
    await ctx.app.inject({
      method: 'GET',
      url: `/v1/projects/${ctx.project.id}/launch-records`,
      cookies: ctx.cookies,
    })
  ).json().iamRegistration

/**
 * §9's CHANGE REQUEST, walked to `active` the way UBC answers one: filed `change_requested`
 * naming what is asked for, then `submitted`, then recorded `active` with what UBC registered
 * — `requested` unless a case says UBC registered something else, and the ACS unless it moved.
 */
async function registerChange(
  ctx: CwlCtx,
  change: { requested: readonly string[]; acsUrl?: string },
): Promise<void> {
  const asUbcHasIt = { ...ctx.registration, ...(await registered(ctx)) }
  for (const [state, extra] of [
    ['change_requested', { requestedAttributes: [...change.requested] }],
    ['submitted', {}],
    [
      'active',
      {
        registeredAttributes: [...change.requested],
        ...(change.acsUrl === undefined ? {} : { acsUrl: change.acsUrl }),
      },
    ],
  ] as const) {
    const res = await recordRegistration(ctx, { ...asUbcHasIt, ...extra, state })
    expect(refusal(res), `recording ${state}: ${res.body}`).toEqual({
      status: 200,
      code: undefined,
    })
  }
}

/** What UBC has registered right now — what a change request re-sends unchanged. */
const registered = async (ctx: CwlCtx) => {
  const row = await registrationOf(ctx)
  return {
    registeredAttributes: row.registeredAttributes as string[],
    acsUrl: row.acsUrl as string,
    sloUrl: row.sloUrl as string,
  }
}

/**
 * A build, awaited to its END — succeeded or failed — as a client reads it. With `lines`, that
 * manifest is committed and validated first; without, the last validated manifest is built again.
 */
async function buildOf(
  ctx: CwlCtx,
  lines?: readonly string[],
): Promise<{ id: string; status: string; error: string | null }> {
  if (lines !== undefined) await commitManifest(ctx, lines, 'feat: the next release')
  const started = await ctx.app.inject({
    method: 'POST',
    url: `/v1/projects/${ctx.project.id}/builds`,
    payload: {},
    cookies: ctx.cookies,
    headers: mutationHeaders(ctx.deps),
  })
  expect(started.statusCode, started.body).toBe(202)
  await ctx.deps.builds.idle()
  return (
    await ctx.app.inject({
      method: 'GET',
      url: `/v1/builds/${started.json().id}`,
      cookies: ctx.cookies,
    })
  ).json()
}

async function releaseOf(ctx: CwlCtx, buildId: string): Promise<{ id: string }> {
  const made = await ctx.app.inject({
    method: 'POST',
    url: `/v1/projects/${ctx.project.id}/releases`,
    payload: { buildId },
    cookies: ctx.cookies,
    headers: mutationHeaders(ctx.deps),
  })
  expect(made.statusCode, made.body).toBe(201)
  return made.json()
}

/**
 * §9's SECOND PRODUCTION OBLIGATION FOR A LAUNCHED CWL APP (P6b Task 7). Once launched, every
 * production release is checked against the LIVE registration — what UBC IAM registered, which
 * changes only when UBC registers something new (Decision 11): an ADDED attribute waits for the
 * change request to come back `active`, a REMOVED one re-escalates but waits on nobody (Rich,
 * Question 2), a moved ACS waits for UBC, and a lapsed registration stops everything.
 *
 * Over `launchedCwlProject`'s two labelled fakes — the subject is the gate, not the IdP (the
 * fixture says why that is acceptable here and nowhere else).
 */
describe('a launched CWL app’s live registration (§9, D9.2, P6b Task 7)', () => {
  const TWO = [...CWL_LAUNCH_ATTRIBUTES]
  const THREE = [...CWL_LAUNCH_ATTRIBUTES, 'sn']

  /**
   * ONE CLOCK, NOT TWO (P6b sitting 6, found by a `pnpm test` that was red 8 and then green).
   * The rehearsal reads its own deploy's `sso.registered` event "not older than this deploy",
   * and the event's `created_at` is Postgres's `clock_timestamp()` — inside Docker Desktop's
   * VM — while the bound was the HOST's `new Date()`. With the fake driver the event lands a
   * few milliseconds after the bound, so a VM clock a few milliseconds behind the host hid it
   * and every rehearsal here answered *"the deploy recorded no Service Provider
   * registration"*. On the real platform a VM clock seconds behind after a laptop sleeps does
   * the same. Here the host is two seconds AHEAD, which is the same inequality, made certain.
   */
  it('a rehearsal finds its own registration when the host’s clock runs ahead of the database’s', async () => {
    vi.useFakeTimers({
      toFake: ['Date'],
      shouldAdvanceTime: true,
      now: Date.now() + 2_000,
    })
    try {
      const ctx = await launchedCwlProject('clock-skew')
      expect(ctx.launched.state).toBe('healthy')
      await closed(ctx)
    } finally {
      vi.useRealTimers()
    }
  })

  it('a release that ADDS an attribute: its BUILD fails (§7), naming the change request', async () => {
    const ctx = await launchedCwlProject('iam-add')
    const built = await buildOf(ctx, cwlManifest('iam-add', THREE))
    expect(built.status).toBe('failed')
    expect(built.error).toContain('SPEC_ATTRIBUTE_NOT_REGISTERED')
    expect(built.error).toContain(': sn.')
    // §9's pre-generated change request says how it is RECORDED, not only "raise one".
    expect(built.error).toContain('change_requested')
    await closed(ctx)
  })

  it('while the change request is change_requested or submitted, the build still fails — UBC has not registered it', async () => {
    const ctx = await launchedCwlProject('iam-pending')
    const filed = await recordRegistration(ctx, {
      ...ctx.registration,
      state: 'change_requested',
      requestedAttributes: THREE,
      externalTicketRef: 'IAM-CR-7',
    })
    expect(refusal(filed)).toEqual({ status: 200, code: undefined })
    // THE TWO NEW FIELDS, READ BY NAME (sitting 4, F8): a field the representation forgets
    // is stripped, not dropped, and nothing but a read by name sees it.
    const record = await registrationOf(ctx)
    expect(record).toMatchObject({
      state: 'change_requested',
      registeredAttributes: TWO,
      requestedAttributes: THREE,
    })
    expect(record.registeredAt).toEqual(expect.any(String))

    const whileRequested = await buildOf(ctx, cwlManifest('iam-pending', THREE))
    expect(whileRequested.status).toBe('failed')
    expect(whileRequested.error).toContain(': sn.')
    expect(whileRequested.error).toContain("'change_requested'")
    expect(whileRequested.error).toContain('IAM-CR-7')

    const submitted = await recordRegistration(ctx, {
      ...ctx.registration,
      state: 'submitted',
      externalTicketRef: 'IAM-CR-7',
    })
    expect(refusal(submitted)).toEqual({ status: 200, code: undefined })
    const whileSubmitted = await buildOf(ctx)
    expect(whileSubmitted.status).toBe('failed')
    expect(whileSubmitted.error).toContain("'submitted'")
    await closed(ctx)
  })

  /**
   * `[M9]`'S EXACT REQUEST, AND ITS CONSEQUENCE, IN ONE ASSERTION (sitting 5's control (a)). The
   * case above files the change request correctly and so cannot see what the rule prevents: an
   * administrator who types the requested set in as the REGISTERED one. Refused — and the build
   * of the added attribute still fails, because the column §7's build-time check reads was never
   * overwritten. Asserted together, so a red shows both halves rather than stopping at the first.
   */
  it('refuses [M9]’s request — the requested set typed in as registered — and the build still fails', async () => {
    const ctx = await launchedCwlProject('iam-m9')
    const typed = await recordRegistration(ctx, {
      ...ctx.registration,
      registeredAttributes: THREE,
      requestedAttributes: THREE,
      state: 'change_requested',
    })
    const built = await buildOf(ctx, cwlManifest('iam-m9', THREE))
    expect({ record: refusal(typed), build: built.status }).toEqual({
      record: { status: 400, code: 'LAUNCH_RECORD_INVALID' },
      build: 'failed',
    })
    expect((await registrationOf(ctx)).registeredAttributes).toEqual(TWO)
    await closed(ctx)
  })

  it('once it is active with the attribute, the build passes, and the release RE-ESCALATES (auth.attributes)', async () => {
    const ctx = await launchedCwlProject('iam-granted')
    const before = (await registrationOf(ctx)).registeredAt
    await registerChange(ctx, { requested: THREE })
    const record = await registrationOf(ctx)
    expect(record.registeredAttributes).toEqual(THREE)
    expect(record.requestedAttributes).toBeNull()
    expect(Date.parse(record.registeredAt)).toBeGreaterThan(Date.parse(before))

    const built = await buildOf(ctx, cwlManifest('iam-granted', THREE))
    expect(built.status, built.error ?? '').toBe('succeeded')
    const release = await releaseOf(ctx, built.id)
    await stage(ctx, release.id)
    const read = (await readinessOf(ctx)).json()
    expect(itemOf(read, 'iam-registration')!.state).toBe('met')
    expect(read).toMatchObject({
      reescalated: true,
      sensitiveFields: ['auth.attributes'],
    })
    expect(unmetBlocking(read)).toEqual(['admin-approval'])
    expect(refusal(await promote(ctx, release.id))).toEqual({
      status: 409,
      code: 'RELEASE_REESCALATED',
    })
    await closed(ctx)
  })

  it('a release built BEFORE the registration shrank is refused by the live check, naming what is missing', async () => {
    const ctx = await launchedCwlProject('iam-shrunk')
    await registerChange(ctx, { requested: THREE })
    const built = await buildOf(ctx, cwlManifest('iam-shrunk', THREE))
    expect(built.status, built.error ?? '').toBe('succeeded')
    const release = await releaseOf(ctx, built.id)
    await stage(ctx, release.id)
    // UBC then REMOVED `sn` from the registration, and an administrator records what it has.
    await registerChange(ctx, { requested: TWO })

    const read = (await readinessOf(ctx)).json()
    const iam = itemOf(read, 'iam-registration')!
    expect(iam.state).toBe('unmet')
    expect(iam.why).toContain('sn')
    const refused = await promote(ctx, release.id)
    expect(refusal(refused)).toEqual({
      status: 409,
      code: 'RELEASE_PRODUCTION_GATE_UNAVAILABLE',
    })
    expect(await servingProduction(ctx)).toBe(ctx.launched.id)
    await closed(ctx)
  })

  it('a REMOVAL re-escalates but does not wait on IAM, and says UBC still releases what the app stopped asking for', async () => {
    const ctx = await launchedCwlProject('iam-removal')
    const built = await buildOf(ctx, cwlManifest('iam-removal', ['ubcEduCwlPuid']))
    expect(built.status, built.error ?? '').toBe('succeeded')
    const release = await releaseOf(ctx, built.id)
    await stage(ctx, release.id)

    const read = (await readinessOf(ctx)).json()
    const iam = itemOf(read, 'iam-registration')!
    expect(iam.state).toBe('met')
    expect(iam.why).toContain('mail')
    expect(iam.why).toContain('no longer asks')
    expect(read).toMatchObject({
      reescalated: true,
      sensitiveFields: ['auth.attributes'],
    })
    expect(unmetBlocking(read)).toEqual(['admin-approval'])
    expect(refusal(await promote(ctx, release.id))).toEqual({
      status: 409,
      code: 'RELEASE_REESCALATED',
    })
    // An administrator's approval is the whole of what it waits for.
    await decide(ctx, release.id, 'approve', 'dropping mail is data minimisation')
    const deployed = await promote(ctx, release.id)
    expect(refusal(deployed)).toEqual({ status: 200, code: undefined })
    expect(deployed.json()).toMatchObject({ releaseId: release.id, state: 'healthy' })
    await closed(ctx)
  })

  it('an `expired` registration stops every release, self-serve included', async () => {
    const ctx = await launchedCwlProject('iam-expired')
    const rebuilt = await nextRelease(ctx)
    await stage(ctx, rebuilt.id)
    // THE POSITIVE HALF, in the same test: before the lapse this identical rebuild is
    // self-serve, so the refusal below is the expiry's and nothing else's.
    expect((await readinessOf(ctx)).json()).toMatchObject({ ready: true })

    const lapsed = await recordRegistration(ctx, {
      ...ctx.registration,
      state: 'expired',
    })
    expect(refusal(lapsed)).toEqual({ status: 200, code: undefined })
    const iam = itemOf((await readinessOf(ctx)).json(), 'iam-registration')!
    expect(iam.state).toBe('unmet')
    expect(iam.why).toContain('lapsed')
    expect(refusal(await promote(ctx, rebuilt.id))).toEqual({
      status: 409,
      code: 'RELEASE_PRODUCTION_GATE_UNAVAILABLE',
    })
    await closed(ctx)
  })

  it('an auth.callback change — a new ACS UBC never registered — is refused until the registration says so', async () => {
    const ctx = await launchedCwlProject('iam-acs')
    const built = await buildOf(
      ctx,
      cwlManifest('iam-acs', TWO, ['  callback: /auth/saml/callback']),
    )
    expect(built.status, built.error ?? '').toBe('succeeded')
    const release = await releaseOf(ctx, built.id)
    await stage(ctx, release.id)
    const moved = `https://${ctx.production.hostname}/auth/saml/callback`

    const read = (await readinessOf(ctx)).json()
    const iam = itemOf(read, 'iam-registration')!
    expect(iam.state).toBe('unmet')
    expect(iam.why).toContain(moved)
    expect(iam.why).toContain(ctx.registration.acsUrl)
    // `auth.callback` is not one of §7's sensitive fields: no administrator is asked. The
    // ACS is UBC's to register, and that is the whole of what this release waits for.
    expect(read).toMatchObject({ reescalated: false, sensitiveFields: [] })
    expect(refusal(await promote(ctx, release.id))).toEqual({
      status: 409,
      code: 'RELEASE_PRODUCTION_GATE_UNAVAILABLE',
    })

    await registerChange(ctx, { requested: TWO, acsUrl: moved })
    const deployed = await promote(ctx, release.id)
    expect(refusal(deployed)).toEqual({ status: 200, code: undefined })
    expect(deployed.json()).toMatchObject({ releaseId: release.id, state: 'healthy' })
    expect(await approvalsOf(ctx, release.id)).toEqual([])
    await closed(ctx)
  })
})
