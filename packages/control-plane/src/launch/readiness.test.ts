import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import {
  appSpecs,
  builds,
  environments,
  instances,
  projects,
  releases,
  routes,
  type Db,
} from '../db/index.js'
import { withProject } from '../db/testing.js'
import { computeLaunchReadiness } from './readiness.js'

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

describe('LaunchReadiness, read-only (§13, P5a Task 15)', () => {
  it('is never ready in Phase 1, and says which plan builds each item that does not exist', async () => {
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
      ])
      expect(view.items.find((i) => i.id === 'domain')).toMatchObject({ state: 'met' })
      for (const id of [
        'iam-registration',
        'privacy-assessment',
        'rehearsal',
        'admin-approval',
      ]) {
        const item = view.items.find((i) => i.id === id)!
        expect(item.state, id).toBe('not_built')
        expect(item.builtBy, id).toMatch(/^P\d$/)
      }
      expect(view.items.every((i) => i.why.length > 20 && i.owner.length > 0)).toBe(true)
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
