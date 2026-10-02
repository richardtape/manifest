import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import {
  approvalPreviews,
  approvals,
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
import { withDraft } from './testing.js'

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
  /** The CWL attributes the candidate release asks for — FROZEN in its resolved config. */
  attributes: string[] = [],
  /**
   * P6b Task 7: a PRODUCTION environment at this hostname, and the frozen `callback` and
   * `logout` — what the candidate would register in production, which `iam-registration`
   * now compares with what UBC recorded (`[M10]`). Absent, the project has no production
   * environment, and the item compares attributes only, as every older case here expects.
   */
  production?: { hostname: string; callback: string; logout: string },
): Promise<string> {
  await tx.insert(environments).values({
    projectId,
    kind: 'staging',
    hostname: `${projectId.slice(0, 8)}.staging.manifest.internal`,
  })
  if (production !== undefined)
    await tx
      .insert(environments)
      .values({ projectId, kind: 'production', hostname: production.hostname })
  const [env] = await tx
    .select()
    .from(environments)
    .where(eq(environments.projectId, projectId))
    .then((rows) => rows.filter((e) => e.kind === 'staging'))
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
    auth: {
      provider: 'cwl',
      attributes,
      ...(production === undefined
        ? {}
        : { callback: production.callback, logout: production.logout }),
    },
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
 * The production environment every real project has (P6b Task 7), with the `callback` and
 * `logout` whose derived URLs are exactly what `recordIam` below records — so a case that
 * passes this is one whose registration matches the candidate unless it says otherwise.
 */
const PRODUCTION = {
  hostname: 'chem-labs.manifest.internal',
  callback: '/auth/saml/callback',
  logout: '/auth/logout',
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
  /** What UBC recorded, where a case needs it to differ (P6b Task 7's `[M10]`). */
  overrides: { acsUrl?: string; sloUrl?: string } = {},
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
    // P6b Task 7: a row written `active` was REGISTERED. The launched branch's live check
    // reads this; the first launch's does not.
    ...(state === 'active' ? { registeredAt: new Date() } : {}),
    ...overrides,
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
      // **AND `rehearsal` JOINED THEM IN P6a TASK 14**, which is what opened the gate at
      // last: it was `not_built` / `builtBy: 'P6'` — *"it is built with production
      // environments"* — until `runRehearsal` existed. A project nobody has rehearsed now
      // reads `unmet` with no `builtBy`, and a `builtBy` back on it is a regression.
      const rehearsal = view.items.find((i) => i.id === 'rehearsal')!
      expect(rehearsal.state).toBe('unmet')
      expect(rehearsal.builtBy).toBeUndefined()
      // The ONLY unconditional `not_built` item left is `code-review`, which is the one
      // that does not block (D33, Decision 13). Asserted here rather than counted: the
      // day another item goes `not_built`, this line says so.
      expect(view.items.filter((i) => i.state === 'not_built').map((i) => i.id)).toEqual([
        'code-review',
      ])
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

  /**
   * **THE ORDER §9 MAKES NORMAL, AND THE ONE THE BUILD-TIME CHECK CANNOT SEE** (P6a Task 13).
   * A registration takes weeks, so a faculty member builds for staging long before IAM
   * answers — and a build with no registration to read is not checked. When the
   * administrator then records an `active` registration, the release serving staging was
   * built before it existed, and §13 promotes it without rebuilding. So the ITEM compares
   * what the candidate asks for with what UBC registered; `active` alone is not `met`.
   */
  it('iam-registration: unmet when the release serving staging asks for an attribute UBC did not register', async () => {
    await withProject(async (tx, { projectId, ownerId }) => {
      await serving(
        tx,
        projectId,
        ownerId,
        scan(1, false),
        ['ubcEduCwlPuid', 'sn'],
        PRODUCTION,
      )
      await recordIam(tx, projectId, ownerId, 'active', 'IAM-4471')
      const iam = (await computeLaunchReadiness(tx, projectId)).items.find(
        (i) => i.id === 'iam-registration',
      )!
      expect(iam.state).toBe('unmet')
      expect(iam.why).toContain('sn')
      expect(iam.why).toContain('Registered: mail, ubcEduCwlPuid')
      expect(iam.why).toContain('IAM-4471')
    })
  })

  it('iam-registration: met when the release serving staging asks for a subset of what UBC registered', async () => {
    // The positive control for the test above, with a CANDIDATE — the `met when active` test
    // has none, so it would pass against an item that refused every release it could see.
    await withProject(async (tx, { projectId, ownerId }) => {
      await serving(tx, projectId, ownerId, scan(1, false), ['mail'], PRODUCTION)
      await recordIam(tx, projectId, ownerId, 'active', 'IAM-4471')
      const iam = (await computeLaunchReadiness(tx, projectId)).items.find(
        (i) => i.id === 'iam-registration',
      )!
      expect(iam.state).toBe('met')
    })
  })

  /**
   * **`[M10]`** (P6b Task 7): nothing compared the ACS an administrator RECORDED from UBC with
   * the one the release would register in production, so a registration naming
   * `wrong.example` read `met` — and so did the rehearsal, whose own sentence says it proved
   * the ACS URL. The candidate's production ACS is `https://<production hostname><callback>`,
   * which is how `deriveSpEntity` and `rehearsalItem` both build it.
   */
  it('iam-registration is unmet when the recorded ACS is not the one this release derives — [M10]', async () => {
    await withProject(async (tx, { projectId, ownerId }) => {
      await serving(tx, projectId, ownerId, scan(1, false), ['mail'], PRODUCTION)
      await recordIam(tx, projectId, ownerId, 'active', 'IAM-4471', {
        acsUrl: 'https://wrong.example/acs',
      })
      const iam = (await computeLaunchReadiness(tx, projectId)).items.find(
        (i) => i.id === 'iam-registration',
      )!
      expect(iam.state).toBe('unmet')
      expect(iam.why).toContain('https://wrong.example/acs')
      expect(iam.why).toContain('https://chem-labs.manifest.internal/auth/saml/callback')
    })
  })

  it('…and met when it is (the positive control in the same file)', async () => {
    await withProject(async (tx, { projectId, ownerId }) => {
      await serving(tx, projectId, ownerId, scan(1, false), ['mail'], PRODUCTION)
      await recordIam(tx, projectId, ownerId, 'active', 'IAM-4471')
      const iam = (await computeLaunchReadiness(tx, projectId)).items.find(
        (i) => i.id === 'iam-registration',
      )!
      expect(iam.state).toBe('met')
    })
  })

  it('iam-registration is unmet when the recorded SLO is not the one this release derives', async () => {
    // The SLO half of the same comparison: the IdP sends a LogoutRequest to what UBC
    // registered, so a moved `auth.logout` is a sign-out that never reaches the app.
    await withProject(async (tx, { projectId, ownerId }) => {
      await serving(tx, projectId, ownerId, scan(1, false), ['mail'], PRODUCTION)
      await recordIam(tx, projectId, ownerId, 'active', 'IAM-4471', {
        sloUrl: 'https://chem-labs.manifest.internal/logout',
      })
      const iam = (await computeLaunchReadiness(tx, projectId)).items.find(
        (i) => i.id === 'iam-registration',
      )!
      expect(iam.state).toBe('unmet')
      expect(iam.why).toContain('https://chem-labs.manifest.internal/logout')
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
      expect(rehearsal).toMatchObject({
        state: 'not_built',
        builtBy: 'a later Manifest release (the load rehearsal)',
      })
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
 * *WAITING SINCE* (the launch path plan's Task 9, Decision 10): the time an item's current state
 * began, when Manifest knows it — the day the owner said a record was sent while it waits on UBC,
 * the day UBC registered it or the Privacy Office approved it once met — and null otherwise. A new
 * FIELD, never a new state: a client that switches on `state` reads exactly what it read before.
 */
describe('waiting since (Task 9)', () => {
  const SENT = new Date('2026-09-22T19:00:00.000Z') // noon in Vancouver, 22 September
  const item = async (tx: Db, projectId: string, id: string) =>
    (await computeLaunchReadiness(tx, projectId)).items.find((i) => i.id === id)!

  it('a submitted registration waits since the day it was sent, and says the day in words', async () => {
    await withProject(async (tx, { projectId, ownerId }) => {
      await recordIam(tx, projectId, ownerId, 'submitted', 'IAM-4471')
      await tx
        .update(iamRegistrations)
        .set({ submittedAt: SENT })
        .where(eq(iamRegistrations.projectId, projectId))
      const iam = await item(tx, projectId, 'iam-registration')
      expect(iam).toMatchObject({ state: 'unmet', since: SENT.toISOString() })
      expect(iam.why).toMatch(/sent to UBC IAM on September 22, 2026/)
      expect(iam.why).toContain('IAM-4471')
      expect(iam.why).toContain("'active'")
    })
  })

  it('an active registration is met since UBC registered it', async () => {
    await withProject(async (tx, { projectId, ownerId }) => {
      await recordIam(tx, projectId, ownerId, 'active', 'IAM-4471')
      const [row] = await tx
        .select()
        .from(iamRegistrations)
        .where(eq(iamRegistrations.projectId, projectId))
      const iam = await item(tx, projectId, 'iam-registration')
      expect(iam).toMatchObject({ state: 'met', since: row!.registeredAt!.toISOString() })
    })
  })

  it('a draft, or nothing at all, waits on nobody yet: since is null', async () => {
    await withProject(async (tx, { projectId, ownerId }) => {
      expect((await item(tx, projectId, 'iam-registration')).since).toBeNull()
      expect((await item(tx, projectId, 'privacy-assessment')).since).toBeNull()
      await recordIam(tx, projectId, ownerId, 'draft', null)
      expect((await item(tx, projectId, 'iam-registration')).since).toBeNull()
      // And every item Task 9 does not date reads null, never a missing field.
      for (const i of (await computeLaunchReadiness(tx, projectId)).items)
        expect(i.since === null || typeof i.since === 'string', i.id).toBe(true)
      expect((await item(tx, projectId, 'domain')).since).toBeNull()
    })
  })

  it('a submitted assessment waits since the day it was sent; an approved one is met since its approval', async () => {
    await withProject(async (tx, { projectId, ownerId }) => {
      await recordPia(tx, projectId, ownerId, 'submitted', null, null)
      await tx
        .update(privacyAssessments)
        .set({ submittedAt: SENT })
        .where(eq(privacyAssessments.projectId, projectId))
      const waiting = await item(tx, projectId, 'privacy-assessment')
      expect(waiting).toMatchObject({ state: 'unmet', since: SENT.toISOString() })
      expect(waiting.why).toMatch(/sent to the UBC Privacy Office on September 22, 2026/)
      const approvedAt = new Date('2026-09-28T17:04:00.000Z')
      await tx
        .update(privacyAssessments)
        .set({ state: 'approved', approvedAt, reviewer: 'K. Lam' })
        .where(eq(privacyAssessments.projectId, projectId))
      expect(await item(tx, projectId, 'privacy-assessment')).toMatchObject({
        state: 'met',
        since: approvedAt.toISOString(),
      })
    })
  })

  it('reads the PRODUCTION registration only: an active staging registration does not meet it', async () => {
    await withProject(async (tx, { projectId, ownerId }) => {
      await recordIam(tx, projectId, ownerId, 'active', 'IAM-STG-1')
      await tx
        .update(iamRegistrations)
        .set({ environmentKind: 'staging' })
        .where(eq(iamRegistrations.projectId, projectId))
      const iam = await item(tx, projectId, 'iam-registration')
      expect(iam.state).toBe('unmet')
      expect(iam.why).not.toContain('IAM-STG-1')
      // THE POSITIVE CONTROL: the same row as production's is met.
      await recordIam(tx, projectId, ownerId, 'active', 'IAM-PRD-1')
      expect((await item(tx, projectId, 'iam-registration')).state).toBe('met')
    })
  })

  it('a LAUNCHED app’s live registration reads the production row only, and is met since UBC registered it', async () => {
    await withProject(async (tx, { projectId, ownerId }) => {
      await tx
        .update(projects)
        .set({ launchedAt: new Date() })
        .where(eq(projects.id, projectId))
      await recordIam(tx, projectId, ownerId, 'active', 'IAM-STG-1')
      await tx
        .update(iamRegistrations)
        .set({ environmentKind: 'staging' })
        .where(eq(iamRegistrations.projectId, projectId))
      expect((await item(tx, projectId, 'iam-registration')).state).toBe('unmet')
      await recordIam(tx, projectId, ownerId, 'active', 'IAM-PRD-1')
      const [production] = await tx
        .select()
        .from(iamRegistrations)
        .where(eq(iamRegistrations.externalTicketRef, 'IAM-PRD-1'))
      expect(await item(tx, projectId, 'iam-registration')).toMatchObject({
        state: 'met',
        since: production!.registeredAt!.toISOString(),
      })
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

  /**
   * P6b Task 8, Decision 12 (P6a F7): the item READS the newest verdict recorded for the
   * candidate, rather than saying `not_built` beside a record whose verdict says `clean`. The
   * rows are written directly — this file is about what the checklist reads.
   */
  async function recordVerdict(
    tx: Db,
    projectId: string,
    releaseId: string,
    decidedBy: string,
    review: {
      state: 'not_performed' | 'clean' | 'findings'
      reviewer: string
      detail: string
    },
    decidedAt: Date,
  ): Promise<void> {
    await tx.insert(approvals).values({
      releaseId,
      projectId,
      decision: 'approved',
      decidedBy,
      decidedAt,
      imageDigest: `sha256:${'b'.repeat(64)}`,
      diffSnapshot: {
        imageDigest: `sha256:${'b'.repeat(64)}`,
        changes: [],
        services: [],
        attributes: [],
        resources: {},
        summary: null,
        summarySource: 'no-previous-release',
        review,
      },
    })
  }
  /** A stored PREVIEW's verdict — `latestReviewFor`'s second source (P6b Task 9). */
  async function recordPreview(
    tx: Db,
    projectId: string,
    releaseId: string,
    createdBy: string,
    review: {
      state: 'not_performed' | 'clean' | 'findings'
      reviewer: string
      detail: string
    },
    createdAt: Date,
  ): Promise<void> {
    await tx.insert(approvalPreviews).values({
      releaseId,
      projectId,
      createdBy,
      createdAt,
      expiresAt: new Date(createdAt.getTime() + 30 * 60 * 1000),
      imageDigest: `sha256:${'b'.repeat(64)}`,
      diffSnapshot: {
        imageDigest: `sha256:${'b'.repeat(64)}`,
        changes: [],
        services: [],
        attributes: [],
        resources: {},
        summary: null,
        summarySource: 'no-previous-release',
        review,
      },
    })
  }
  const codeReview = async (tx: Db, projectId: string) =>
    (await computeLaunchReadiness(tx, projectId)).items.find(
      (i) => i.id === 'code-review',
    )!

  /**
   * F13 (P6b sitting 7): the item said its verdict was *"recorded when an administrator decided
   * on this release"* — and since P6b Task 9 its newest source can be a PREVIEW, taken before
   * anybody decided (the green runs printed the sentence at `gateA`, before any decision). It
   * now names the source `latestReviewFor` actually read. **BOTH CASES IN ONE TEST, for each
   * state**: a sentence that always said "previewed" would pass a preview-only test.
   */
  it.each(['not_performed', 'clean', 'findings'] as const)(
    'F13: a %s verdict says where it was recorded — a preview, then a decision',
    async (state) => {
      await withProject(async (tx, { projectId, ownerId }) => {
        const releaseId = await serving(tx, projectId, ownerId, scan(1, false))
        const review = {
          state,
          reviewer: state === 'not_performed' ? 'none' : 'semgrep',
          detail:
            state === 'not_performed'
              ? 'No code reviewer is configured.'
              : state === 'clean'
                ? '12 checked, no findings'
                : '1 finding(s): [advise] x',
        }
        await recordPreview(
          tx,
          projectId,
          releaseId,
          ownerId,
          review,
          new Date('2026-09-20T00:00:00Z'),
        )
        const previewed = await codeReview(tx, projectId)
        expect(previewed.why).toMatch(
          /recorded when this release was previewed on 2026-09-20/i,
        )
        expect(previewed.why).not.toContain('decided')
        await recordVerdict(
          tx,
          projectId,
          releaseId,
          ownerId,
          review,
          new Date('2026-09-21T00:00:00Z'),
        )
        const decided = await codeReview(tx, projectId)
        expect(decided.why).toMatch(
          /recorded when an administrator decided on this release on 2026-09-21/i,
        )
        expect(decided.why).not.toContain('previewed')
      })
    },
  )

  it('code-review reads the newest verdict recorded for the candidate: clean → met, still non-blocking', async () => {
    await withProject(async (tx, { projectId, ownerId }) => {
      const releaseId = await serving(tx, projectId, ownerId, scan(1, false))
      // An OLDER verdict with findings, then a newer clean one: the newest is what counts.
      await recordVerdict(
        tx,
        projectId,
        releaseId,
        ownerId,
        { state: 'findings', reviewer: 'semgrep', detail: '1 finding(s): [advise] x' },
        new Date('2026-09-20T00:00:00Z'),
      )
      await recordVerdict(
        tx,
        projectId,
        releaseId,
        ownerId,
        { state: 'clean', reviewer: 'semgrep', detail: '12 checked, no findings' },
        new Date('2026-09-21T00:00:00Z'),
      )
      const item = await codeReview(tx, projectId)
      expect(item).toMatchObject({ state: 'met', blocking: false })
      expect(item.why).toContain('12 checked, no findings')
      expect(item.why).toContain('semgrep')
    })
  })

  it('findings → unmet, naming the count; not_performed → not_built, in the reviewer’s own words', async () => {
    await withProject(async (tx, { projectId, ownerId }) => {
      const releaseId = await serving(tx, projectId, ownerId, scan(1, false))
      await recordVerdict(
        tx,
        projectId,
        releaseId,
        ownerId,
        {
          state: 'findings',
          reviewer: 'semgrep',
          detail: '2 finding(s): [advise] a; [block] b',
        },
        new Date('2026-09-21T00:00:00Z'),
      )
      const item = await codeReview(tx, projectId)
      expect(item).toMatchObject({ state: 'unmet', blocking: false })
      expect(item.why).toContain('2 finding(s)')
    })
    await withProject(async (tx, { projectId, ownerId }) => {
      const releaseId = await serving(tx, projectId, ownerId, scan(1, false))
      await recordVerdict(
        tx,
        projectId,
        releaseId,
        ownerId,
        {
          state: 'not_performed',
          reviewer: 'none',
          detail: 'No code reviewer is configured.',
        },
        new Date('2026-09-21T00:00:00Z'),
      )
      const item = await codeReview(tx, projectId)
      expect(item).toMatchObject({ state: 'not_built', blocking: false })
      expect(item.why).toContain('No code reviewer is configured.')
      expect(item.builtBy).toContain('SemgrepReviewer')
    })
  })

  it('with no verdict recorded, it says a reviewer runs only for a first launch or a re-escalation (D33)', async () => {
    await withProject(async (tx, { projectId, ownerId }) => {
      await serving(tx, projectId, ownerId, scan(1, false))
      const item = await codeReview(tx, projectId)
      expect(item).toMatchObject({ state: 'not_built', blocking: false })
      expect(item.why).toContain('No reviewer has looked at this release')
      expect(item.why).toContain('never for a self-serve release')
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
      const releaseId = await serving(tx, projectId, ownerId, scan(1, false))
      const view = await computeLaunchReadiness(tx, projectId)
      expect(view.ready).toBe(false)
      const thrown = await assertLaunchable(tx, projectId, releaseId).then(
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
      const releaseId = await serving(tx, projectId, ownerId, scan(1, false))
      await recordIam(tx, projectId, ownerId, 'active', 'IAM-4471')
      await recordPia(tx, projectId, ownerId, 'approved', 'K. Lam', new Date())
      const gate = (await assertLaunchable(tx, projectId, releaseId).then(
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

/**
 * REVIEW FOCUS 1's CHECKLIST HALF (the launch path plan's Task 10; Task 9's whole-branch review, I4):
 * an owner drafts the production registration in week one, and in week three the agent adds `sn`.
 * The build is not gated by a draft (Task 9) — so the checklist is where the owner learns that the
 * draft, or the request already with UBC, no longer describes the release serving staging.
 */
describe('a draft that no longer covers the app (Task 10)', () => {
  const item = async (tx: Db, projectId: string) =>
    (await computeLaunchReadiness(tx, projectId)).items.find(
      (i) => i.id === 'iam-registration',
    )!
  const at = {
    acsUrl: `https://${PRODUCTION.hostname}${PRODUCTION.callback}`,
    sloUrl: `https://${PRODUCTION.hostname}${PRODUCTION.logout}`,
  }

  it('says a production draft no longer covers the release serving staging, and to draft again — and nothing when it does', async () => {
    await withProject(async (tx, { projectId, ownerId }) => {
      await serving(
        tx,
        projectId,
        ownerId,
        scan(1, false),
        ['ubcEduCwlPuid', 'mail', 'sn'],
        PRODUCTION,
      )
      await withDraft(tx, {
        projectId,
        environment: 'production',
        attributes: ['ubcEduCwlPuid', 'mail'],
        ...at,
      })
      const iam = await item(tx, projectId)
      expect(iam.state).toBe('unmet')
      expect(iam.why).toContain(
        'The draft no longer matches the release serving staging: it asks for sn, which the draft does not. Draft it again before you send it.',
      )
      // THE POSITIVE CONTROL: a draft that covers the release says nothing of the kind.
      await tx.delete(iamRegistrations).where(eq(iamRegistrations.projectId, projectId))
      await withDraft(tx, {
        projectId,
        environment: 'production',
        attributes: ['ubcEduCwlPuid', 'mail', 'sn'],
        ...at,
      })
      const covered = await item(tx, projectId)
      expect(covered.state).toBe('unmet')
      expect(covered.why).not.toMatch(/no longer matches/)
    })
  })

  it('a draft asking for more than the release, or at another address, says which', async () => {
    await withProject(async (tx, { projectId, ownerId }) => {
      await serving(
        tx,
        projectId,
        ownerId,
        scan(1, false),
        ['ubcEduCwlPuid', 'mail'],
        PRODUCTION,
      )
      await withDraft(tx, {
        projectId,
        environment: 'production',
        attributes: ['ubcEduCwlPuid', 'mail', 'sn'],
        acsUrl: `https://${PRODUCTION.hostname}/auth/ubcshib/callback`,
        sloUrl: at.sloUrl,
      })
      expect((await item(tx, projectId)).why).toContain(
        `The draft no longer matches the release serving staging: the draft asks for sn, which the release no longer does; the release signs people in at ${at.acsUrl}, the draft at https://${PRODUCTION.hostname}/auth/ubcshib/callback. Draft it again before you send it.`,
      )
    })
  })

  it('a request already sent that no longer matches says UBC IAM must be told', async () => {
    await withProject(async (tx, { projectId, ownerId }) => {
      await serving(
        tx,
        projectId,
        ownerId,
        scan(1, false),
        ['ubcEduCwlPuid', 'mail', 'sn'],
        PRODUCTION,
      )
      await withDraft(tx, {
        projectId,
        environment: 'production',
        attributes: ['ubcEduCwlPuid', 'mail'],
        ...at,
      })
      await tx
        .update(iamRegistrations)
        .set({ state: 'submitted', submittedAt: new Date() })
        .where(eq(iamRegistrations.projectId, projectId))
      expect((await item(tx, projectId)).why).toContain(
        'The request sent to UBC IAM no longer matches the release serving staging: it asks for sn, which the request does not. Tell UBC IAM; once it asks for changes, draft it again.',
      )
    })
  })

  it('with nothing serving staging there is nothing to compare, and the draft is not called stale', async () => {
    await withProject(async (tx, { projectId }) => {
      await withDraft(tx, {
        projectId,
        environment: 'production',
        attributes: ['ubcEduCwlPuid'],
        ...at,
      })
      const iam = await item(tx, projectId)
      expect(iam.state).toBe('unmet')
      expect(iam.why).not.toMatch(/no longer matches/)
    })
  })
})
