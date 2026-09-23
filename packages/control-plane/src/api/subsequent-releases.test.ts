import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { approvals, events, instances, projects, releases } from '../db/index.js'
import { resetDatabase } from '../db/testing.js'
import {
  approvalRequirementFor,
  deployRelease,
  launchedAt,
  productionApprovalFor,
  type ReleaseRow,
} from '../releases/index.js'
import type { ServerDeps } from './server.js'
import {
  approvedProject,
  commitManifest,
  launchedProject,
  mutationHeaders,
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
  ctx: Released,
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
  const res = await ctx.app.inject({
    method: 'POST',
    url: `/v1/releases/${releaseId}/${decision}`,
    payload: { reason },
    cookies: ctx.admin,
    headers: mutationHeaders(ctx.deps),
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
    await ctx.app.close()
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
    await ctx.app.close()
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
    await ctx.app.close()
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
    await ctx.app.close()
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
    await ctx.app.close()
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
    await ctx.app.close()
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
    await ctx.app.close()
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
    await ctx.app.close()
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
    await ctx.app.close()
  })
})
