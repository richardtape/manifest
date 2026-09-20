import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import {
  appSpecs,
  builds,
  environments,
  iamRegistrations,
  instances,
  privacyAssessments,
  projects,
  releases,
  routes,
  type Db,
} from '../db/index.js'
import { withProject } from '../db/testing.js'
import { assertLaunchable, ProductionGateError } from './gate.js'
import { computeLaunchReadiness, readyOf, type LaunchItem } from './readiness.js'

/**
 * §12 classifies Critical and High and nothing else (P5a Task 13), so a `SeverityCounts`
 * has exactly these two keys — a `medium: 0` beside them would be a zero nobody counted.
 */
const CLEAN = { critical: 0, high: 0 }

const scan = (databaseAgeDays: number | null, stale: boolean) => ({
  scanner: 'anchore/grype:v0.118.0',
  scannedAt: '2026-09-16T00:00:00.000Z',
  databaseAgeDays,
  stale,
  baseImageKnown: true,
  fixable: CLEAN,
  unfixable: { ...CLEAN, critical: 1 },
  baseImage: CLEAN,
  unfixableFindings: [{ id: 'GHSA-1', severity: 'Critical', package: 'passport-saml' }],
})

/** A project whose staging hostname serves a release of a build with this scan. */
async function serving(
  tx: Db,
  projectId: string,
  ownerId: string,
  buildScan: unknown,
): Promise<string> {
  await tx.insert(environments).values({
    projectId,
    kind: 'staging',
    hostname: `${projectId.slice(0, 8)}.staging.manifest.internal`,
  })
  const [env] = await tx
    .select()
    .from(environments)
    .where(eq(environments.projectId, projectId))
  const [spec] = await tx
    .insert(appSpecs)
    .values({
      projectId,
      commitSha: 'a'.repeat(40),
      parsed: {},
      schemaVersion: 1,
      valid: true,
    })
    .returning()
  const [build] = await tx
    .insert(builds)
    .values({
      projectId,
      commitSha: 'a'.repeat(40),
      appSpecId: spec!.id,
      status: 'succeeded',
      imageDigest: `sha256:${'b'.repeat(64)}`,
      scan: buildScan,
    })
    .returning()
  const resolved = {
    auth: { provider: 'cwl', attributes: [] },
    ai: { models: [] },
    env: [],
    services: [],
  }
  const [release] = await tx
    .insert(releases)
    .values({
      projectId,
      buildId: build!.id,
      appSpecId: spec!.id,
      createdBy: ownerId,
      resolvedConfig: { sandbox: resolved, staging: resolved, production: resolved },
    })
    .returning()
  const [instance] = await tx
    .insert(instances)
    .values({
      environmentId: env!.id,
      releaseId: release!.id,
      driver: 'fake',
      state: 'healthy',
    })
    .returning()
  await tx
    .insert(routes)
    .values({ instanceId: instance!.id, hostname: env!.hostname, listener: 'internal' })
  return release!.id
}

/**
 * The rows written DIRECTLY, not through `recordIamRegistration`: this file is about what
 * the checklist READS, and `records.test.ts` is about how a row gets there. Going through
 * the write path would make a readiness failure ambiguous between the two.
 */
async function recordIam(
  tx: Db,
  projectId: string,
  ownerId: string,
  state: 'draft' | 'submitted' | 'active' | 'change_requested' | 'expired',
  externalTicketRef: string | null,
): Promise<void> {
  await tx.insert(iamRegistrations).values({
    projectId,
    entityId: 'https://chem-labs.manifest.internal/sp',
    acsUrl: 'https://chem-labs.manifest.internal/auth/saml/callback',
    sloUrl: 'https://chem-labs.manifest.internal/auth/logout',
    registeredAttributes: ['ubcEduCwlPuid', 'mail'],
    state,
    externalTicketRef,
    recordedBy: ownerId,
  })
}

async function recordPia(
  tx: Db,
  projectId: string,
  ownerId: string,
  state: 'draft' | 'submitted' | 'approved',
  reviewer: string | null,
  approvedAt: Date | null,
): Promise<void> {
  await tx
    .insert(privacyAssessments)
    .values({ projectId, state, reviewer, approvedAt, recordedBy: ownerId })
}

describe('LaunchReadiness (§13, P5a Task 15; the two external records, P6a Task 7)', () => {
  it('is not ready with nothing recorded, and separates "nobody has recorded it" from "Manifest cannot see it"', async () => {
    await withProject(async (tx, { projectId }) => {
      const view = await computeLaunchReadiness(tx, projectId)
      expect(view.ready).toBe(false)
      expect(view.items.map((i) => i.id)).toEqual([
        'domain',
        'iam-registration',
        'privacy-assessment',
        'rehearsal',
        'scans',
        'admin-approval',
        // R4's item (P6a Task 12), LAST and NON-BLOCKING. It sits after the blocking
        // six so no blocking item's position depends on it.
        'code-review',
      ])
      expect(view.items.find((i) => i.id === 'domain')).toMatchObject({ state: 'met' })
      // THE TWO EXTERNAL RECORDS ARE TRACKED SINCE MIGRATION 0019, so they are `unmet`
      // with NO `builtBy`: a row nobody has recorded yet, not a thing Manifest does not
      // model. `builtBy` names the plan that will build a thing, and these are built — a
      // `builtBy` back on either of them is a regression (P6a Task 7).
      for (const id of ['iam-registration', 'privacy-assessment']) {
        const item = view.items.find((i) => i.id === id)!
        expect(item.state, id).toBe('unmet')
        expect(item.builtBy, id).toBeUndefined()
        expect(item.why, id).toContain('administrator')
      }
      // **`admin-approval` JOINED THEM IN P6a TASK 10**: it is now a row an administrator
      // writes, so a project nobody has approved reads `unmet` with no `builtBy` — a
      // `builtBy: 'P6'` back on it is the same regression as on the two above.
      const approval = view.items.find((i) => i.id === 'admin-approval')!
      expect(approval.state).toBe('unmet')
      expect(approval.builtBy).toBeUndefined()
      // And `rehearsal` alone is still genuinely unbuilt, which is why the gate above
      // cannot open yet (Task 14).
      const rehearsal = view.items.find((i) => i.id === 'rehearsal')!
      expect(rehearsal.state).toBe('not_built')
      expect(rehearsal.builtBy).toMatch(/^P\d$/)
      expect(view.items.every((i) => i.why.length > 20 && i.owner.length > 0)).toBe(true)
    })
  })

  it('iam-registration: unmet while the registration is submitted, naming the state and the ticket', async () => {
    await withProject(async (tx, { projectId, ownerId }) => {
      await recordIam(tx, projectId, ownerId, 'submitted', 'IAM-4471')
      const iam = (await computeLaunchReadiness(tx, projectId)).items.find(
        (i) => i.id === 'iam-registration',
      )!
      expect(iam.state).toBe('unmet')
      expect(iam.why).toContain("'submitted'")
      expect(iam.why).toContain('IAM-4471')
      expect(iam.why).toContain("'active'")
    })
  })

  it('iam-registration: met when the registration is active, naming what UBC registered', async () => {
    await withProject(async (tx, { projectId, ownerId }) => {
      await recordIam(tx, projectId, ownerId, 'active', 'IAM-4471')
      const iam = (await computeLaunchReadiness(tx, projectId)).items.find(
        (i) => i.id === 'iam-registration',
      )!
      expect(iam.state).toBe('met')
      expect(iam.why).toContain('https://chem-labs.manifest.internal/sp')
      expect(iam.why).toContain('2 attribute(s)')
      expect(iam.why).toContain('IAM-4471')
      expect(iam.builtBy).toBeUndefined()
    })
  })

  it('privacy-assessment: unmet while the assessment is submitted, naming the state', async () => {
    await withProject(async (tx, { projectId, ownerId }) => {
      await recordPia(tx, projectId, ownerId, 'submitted', null, null)
      const pia = (await computeLaunchReadiness(tx, projectId)).items.find(
        (i) => i.id === 'privacy-assessment',
      )!
      expect(pia.state).toBe('unmet')
      expect(pia.why).toContain("'submitted'")
      expect(pia.why).toContain("'approved'")
    })
  })

  /**
   * §13's checklist is read by a faculty member, so the `met` case answers *who said yes
   * and when* rather than flipping a boolean. A message that said only "approved" would
   * be true and useless.
   */
  it('privacy-assessment: met when approved, naming the reviewer and the date', async () => {
    await withProject(async (tx, { projectId, ownerId }) => {
      await recordPia(
        tx,
        projectId,
        ownerId,
        'approved',
        'UBC Privacy Office (K. Lam)',
        new Date('2026-09-14T17:04:00.000Z'),
      )
      const pia = (await computeLaunchReadiness(tx, projectId)).items.find(
        (i) => i.id === 'privacy-assessment',
      )!
      expect(pia.state).toBe('met')
      expect(pia.why).toContain('K. Lam')
      expect(pia.why).toContain('2026-09-14')
      expect(pia.builtBy).toBeUndefined()
    })
  })

  /**
   * **WHAT R1 BOUGHT, MEASURED.** Both external records met and a clean scan on the
   * release serving staging, and the checklist is still not ready — because `rehearsal`
   * and `admin-approval` are genuinely not built. The blocking set SHRANK to exactly
   * those two, which is the difference between a gate that reads rows and one that
   * refuses unconditionally.
   */
  it('with both records met and a clean scan, exactly rehearsal and admin-approval remain', async () => {
    await withProject(async (tx, { projectId, ownerId }) => {
      await serving(tx, projectId, ownerId, scan(1, false))
      await recordIam(tx, projectId, ownerId, 'active', 'IAM-4471')
      await recordPia(tx, projectId, ownerId, 'approved', 'K. Lam', new Date())
      const view = await computeLaunchReadiness(tx, projectId)
      expect(view.ready).toBe(false)
      expect(
        view.items.filter((i) => i.blocking && i.state !== 'met').map((i) => i.id),
      ).toEqual(['rehearsal', 'admin-approval'])
    })
  })

  it('scans: unmet, saying why, when nothing serves staging', async () => {
    await withProject(async (tx, { projectId }) => {
      const scans = (await computeLaunchReadiness(tx, projectId)).items.find(
        (i) => i.id === 'scans',
      )!
      expect(scans).toMatchObject({ state: 'unmet', blocking: true })
      expect(scans.why).toContain('staging')
    })
  })

  it('scans: met for the release serving staging, scanned fresh, naming the unfixable findings recorded', async () => {
    await withProject(async (tx, { projectId, ownerId }) => {
      const releaseId = await serving(tx, projectId, ownerId, scan(1, false))
      const view = await computeLaunchReadiness(tx, projectId)
      expect(view.candidateReleaseId).toBe(releaseId)
      const scans = view.items.find((i) => i.id === 'scans')!
      expect(scans.state).toBe('met')
      expect(scans.why).toContain('1')
    })
  })

  it('scans: unmet when the vulnerability database was stale, and says how old', async () => {
    await withProject(async (tx, { projectId, ownerId }) => {
      await serving(tx, projectId, ownerId, scan(12.5, true))
      const scans = (await computeLaunchReadiness(tx, projectId)).items.find(
        (i) => i.id === 'scans',
      )!
      expect(scans.state).toBe('unmet')
      expect(scans.why).toContain('12.5')
    })
  })

  /**
   * `databaseAgeDays` is null when Grype did not say how old its database was, and
   * `scanImage` reads that as stale (P5a Task 13). A message that interpolated the number
   * would say "null days old"; it must read as unknown, and it must not read as fresh.
   */
  it('scans: unmet for a database of unknown age, without inventing a number', async () => {
    await withProject(async (tx, { projectId, ownerId }) => {
      await serving(tx, projectId, ownerId, scan(null, true))
      const scans = (await computeLaunchReadiness(tx, projectId)).items.find(
        (i) => i.id === 'scans',
      )!
      expect(scans.state).toBe('unmet')
      expect(scans.why).toContain('unknown age')
      expect(scans.why).not.toContain('null')
    })
  })

  it('scans: unmet when the release serving staging was built before scans were recorded', async () => {
    await withProject(async (tx, { projectId, ownerId }) => {
      await serving(tx, projectId, ownerId, null)
      const scans = (await computeLaunchReadiness(tx, projectId)).items.find(
        (i) => i.id === 'scans',
      )!
      expect(scans.state).toBe('unmet')
      expect(scans.why).toContain('before scans were recorded')
    })
  })

  it('adds the load rehearsal for a large course or a public app, and only then (§24)', async () => {
    await withProject(async (tx, { projectId }) => {
      expect(
        (await computeLaunchReadiness(tx, projectId)).items.some(
          (i) => i.id === 'load-rehearsal',
        ),
      ).toBe(false)
      await tx
        .update(projects)
        .set({
          audience: {
            scale: 'large_course',
            burst: 'synchronised',
            justification: null,
            set_by: projectId,
            set_at: '2026-09-16T00:00:00.000Z',
          },
        })
        .where(eq(projects.id, projectId))
      const rehearsal = (await computeLaunchReadiness(tx, projectId)).items.find(
        (i) => i.id === 'load-rehearsal',
      )
      expect(rehearsal).toMatchObject({ state: 'not_built', builtBy: 'P9' })
    })
  })

  /**
   * §9: an app that signs nobody in with CWL needs no IAM registration, and saying it does
   * would put a multi-week item in front of a launch that does not need one.
   */
  it('an app with no CWL sign-on needs no IAM registration', async () => {
    await withProject(async (tx, { projectId, ownerId }) => {
      await serving(tx, projectId, ownerId, scan(1, false))
      const [release] = await tx
        .select()
        .from(releases)
        .where(eq(releases.projectId, projectId))
      const none = { auth: { provider: 'none', attributes: [] }, ai: { models: [] } }
      await tx
        .update(releases)
        .set({ resolvedConfig: { sandbox: none, staging: none, production: none } })
        .where(eq(releases.id, release!.id))
      const iam = (await computeLaunchReadiness(tx, projectId)).items.find(
        (i) => i.id === 'iam-registration',
      )!
      expect(iam.state).toBe('met')
      expect(iam.why).toContain('CWL')
    })
  })
})

/**
 * R4's item, `code-review` (D33, §15, P6a Task 12) — and DECISION 13's control, which is the
 * one that keeps production reachable for ever.
 *
 * `ready` is every BLOCKING item being met, so a blocking item that is `not_built` makes
 * production unreachable — R4(c)'s trap, which is R1's undone by accident. The plan's own
 * test for it computes the view for *"a project with every blocking item met"*, and **no
 * such project can exist until Task 14 builds `rehearsal`**, so as written it could not
 * run. These take the REAL items `computeLaunchReadiness` produced, force every item but
 * `code-review` to `met`, and ask `readyOf` — the derivation the view itself uses.
 */
describe('the code-review item — R4’s seam, NON-blocking (D33, Decision 13)', () => {
  const met = (id: LaunchItem['id']): LaunchItem => ({
    id,
    title: id,
    owner: 'test',
    blocking: true,
    state: 'met',
    why: 'forced',
  })
  const SIX_BLOCKING_MET = (
    [
      'domain',
      'iam-registration',
      'privacy-assessment',
      'rehearsal',
      'scans',
      'admin-approval',
    ] as const
  ).map(met)

  it('reviews nothing and says so: not_built, non-blocking, naming what builds it', async () => {
    await withProject(async (tx, { projectId }) => {
      const item = (await computeLaunchReadiness(tx, projectId)).items.find(
        (i) => i.id === 'code-review',
      )!
      expect(item).toMatchObject({ blocking: false, state: 'not_built' })
      expect(item.builtBy).toContain('SemgrepReviewer')
      // §20's control-map row, word for word where it matters. If this `why` and that row
      // could be read as saying different things, the `why` is wrong.
      expect(item.why).toContain('Nothing reviews the code the agent wrote')
      expect(item.why).toContain('still accepted')
      expect(item.why).toContain('containment')
    })
  })

  it('the code-review item does not affect ready, in either direction', async () => {
    await withProject(async (tx, { projectId }) => {
      const view = await computeLaunchReadiness(tx, projectId)
      const forced = view.items.map((i) =>
        i.id === 'code-review' ? i : { ...i, state: 'met' as const },
      )
      // THE CONTROL THAT KEEPS PRODUCTION REACHABLE FOR EVER (control a). Flip `blocking`
      // to `true` on the item in `readiness.ts` and this goes red — and with it, every
      // project whose real blocking items are all met becomes unlaunchable.
      expect(forced.find((i) => i.id === 'code-review')?.state).toBe('not_built')
      expect(readyOf(forced)).toBe(true)
    })
  })

  /**
   * `[M4]`'s three rows, measured against a real project in sitting 1 and asserted here
   * against the derivation itself. **The middle row is what makes the other two mean
   * anything**: without it, a `readyOf` that returned `true` for every list would pass both.
   */
  it('six blocking met reads ready; a seventh BLOCKING not_built does not; the same item non-blocking does', () => {
    const seventh: LaunchItem = {
      id: 'code-review',
      title: 'Code reviewed for safety',
      owner: 'Manifest',
      blocking: true,
      state: 'not_built',
      why: 'forced',
    }
    expect(readyOf(SIX_BLOCKING_MET)).toBe(true)
    expect(readyOf([...SIX_BLOCKING_MET, seventh])).toBe(false)
    expect(readyOf([...SIX_BLOCKING_MET, { ...seventh, blocking: false }])).toBe(true)
  })
})

/**
 * **THE GATE LIVES IN THE SAME FILE AS THE VIEW ON PURPOSE** (P6a Decision 2). There is
 * ONE computation — `assertLaunchable` calls `computeLaunchReadiness` and throws on its
 * answer — so the thing a person reads and the thing that blocks them cannot disagree.
 * A future edit that gives the gate its own predicate would have to move these tests
 * away from the view's, which is the point at which somebody should stop.
 */
describe('the gate that BLOCKS (§13, D9.1, P6a Task 7)', () => {
  it('refuses with the SAME view the read answers, as one object', async () => {
    await withProject(async (tx, { projectId, ownerId }) => {
      await serving(tx, projectId, ownerId, scan(1, false))
      const view = await computeLaunchReadiness(tx, projectId)
      expect(view.ready).toBe(false)
      const thrown = await assertLaunchable(tx, projectId).then(
        () => undefined,
        (e: unknown) => e,
      )
      expect(thrown).toBeInstanceOf(ProductionGateError)
      const gate = thrown as ProductionGateError
      // The CODE, never the status alone — this is the only thing the wire carries that
      // says WHICH 409 this is.
      expect(gate.code).toBe('RELEASE_PRODUCTION_GATE_UNAVAILABLE')
      expect(gate.launchReadiness).toEqual(view)
    })
  })

  /**
   * The gate's POSITIVE direction — that it returns rather than throwing — cannot be
   * exercised until `rehearsal` and `admin-approval` exist (Tasks 14 and 10), because no
   * project this platform can build has all six blocking items met. It is asserted there,
   * and `delivery.test.ts` carries the skipped end-to-end half naming the same two tasks.
   *
   * What CAN be asserted here is the other half of the contract: the gate reads `ready`
   * and nothing else about the view. With five of six met it must still refuse, and the
   * refusal must carry the view that says so — so a reader can see the one remaining item.
   */
  it('refuses on `ready` alone, and the refusal carries the items that say why', async () => {
    await withProject(async (tx, { projectId, ownerId }) => {
      await serving(tx, projectId, ownerId, scan(1, false))
      await recordIam(tx, projectId, ownerId, 'active', 'IAM-4471')
      await recordPia(tx, projectId, ownerId, 'approved', 'K. Lam', new Date())
      const gate = (await assertLaunchable(tx, projectId).then(
        () => undefined,
        (e: unknown) => e,
      )) as ProductionGateError
      expect(gate).toBeInstanceOf(ProductionGateError)
      expect(gate.launchReadiness.ready).toBe(false)
      expect(
        gate.launchReadiness.items
          .filter((i) => i.blocking && i.state !== 'met')
          .map((i) => i.id),
      ).toEqual(['rehearsal', 'admin-approval'])
    })
  })
})
