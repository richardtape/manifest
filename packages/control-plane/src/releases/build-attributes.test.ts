import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { appSpecs, events, iamRegistrations, projects, type Db } from '../db/index.js'
import { withProject } from '../db/testing.js'
import { withDraft } from '../launch/testing.js'
import { createEventBus, readBuildLog } from '../observability/index.js'
import { createFakeDriver, type Driver } from '../runtime/index.js'
import { buildToEnd } from './testing.js'

const bus = createEventBus()

/**
 * §9's sentence, at the ONE place it can be true: a running build (P6a Task 13).
 *
 * `spec/registered-attributes.test.ts` proves the rule; only these prove a BUILD obeys it
 * (control a) — with the call removed from `finishBuild`, every one of those stays green.
 * They drive `createBuildRunner` directly, not the build route, because the unit tier's
 * only blueprint (`fixture-node`) supports `auth.provider: none` alone and the route refuses
 * a CWL manifest for it before a build is recorded — while the runner, which is the code
 * under test, runs whatever spec it is handed.
 */
async function buildOf(
  tx: Db,
  projectId: string,
  auth: { provider: 'cwl' | 'none'; attributes: string[] },
  registered: string[] | null,
) {
  const [project] = await tx.select().from(projects).where(eq(projects.id, projectId))
  const [spec] = await tx
    .insert(appSpecs)
    .values({
      projectId,
      commitSha: 'a'.repeat(40),
      parsed: { auth: { ...auth, callback: '/auth/cb', logout: '/auth/logout' } },
      schemaVersion: 1,
      valid: true,
    })
    .returning()
  if (registered !== null)
    await tx.insert(iamRegistrations).values({
      projectId,
      entityId: `https://${project!.slug}.manifest.internal/sp`,
      acsUrl: `https://${project!.slug}.manifest.internal/auth/cb`,
      sloUrl: `https://${project!.slug}.manifest.internal/auth/logout`,
      registeredAttributes: registered,
      state: 'active',
      // REGISTERED (the launch path plan's Task 9): only a registration UBC has registered is
      // checked, so a row this helper calls registered says when UBC registered it.
      registeredAt: new Date(),
      externalTicketRef: 'IAM-4471',
      recordedBy: project!.ownerId,
    })
  // COUNTED, because "before the driver builds" is half of what §9 claims: a refusal that
  // arrived after BuildKit had run would still fail the build, and would have spent the
  // build doing it.
  let driverCalls = 0
  const fake = createFakeDriver()
  const driver: Driver = {
    ...fake,
    buildImage: (...args) => {
      driverCalls++
      return fake.buildImage(...args)
    },
  }
  const build = await buildToEnd(
    { db: tx, driver, bus },
    {
      projectId,
      projectSlug: project!.slug,
      appSpecId: spec!.id,
      commitSha: 'a'.repeat(40),
      blueprintRef: 'fixture-node@1',
      repoPath: '/tmp/repo',
    },
  )
  return { build, driverCalls: () => driverCalls, slug: project!.slug }
}

describe('attribute drift fails the BUILD (§7, §9 — P6a Task 13)', () => {
  // POSITIVE, FIRST, and through the same helper: without it every refusal below would be
  // as true of a runner that failed every build.
  it('builds an app whose attributes UBC IAM registered', async () => {
    await withProject(async (tx, { projectId }) => {
      const { build, driverCalls } = await buildOf(
        tx,
        projectId,
        { provider: 'cwl', attributes: ['ubcEduCwlPuid', 'mail'] },
        ['mail', 'ubcEduCwlPuid', 'givenName'],
      )
      expect(build.status, build.error ?? '').toBe('succeeded')
      expect(driverCalls()).toBe(1)
    })
  })

  it('fails the BUILD, with the reason as the log’s last line, before the driver builds', async () => {
    await withProject(async (tx, { projectId }) => {
      const { build, driverCalls, slug } = await buildOf(
        tx,
        projectId,
        { provider: 'cwl', attributes: ['ubcEduCwlPuid', 'mail'] },
        ['ubcEduCwlPuid'],
      )
      expect(build.status).toBe('failed')
      expect(driverCalls()).toBe(0)
      // The row, which a faculty member reads (§14): the code, the app, the attribute.
      expect(build.error).toMatch(/^SPEC_ATTRIBUTE_NOT_REGISTERED: /)
      expect(build.error).toContain(`for '${slug}': mail.`)
      expect(build.error).toContain('Raise an IAM change request against IAM-4471')
      // The log's last line is the same sentence — the only line, because nothing ran.
      const log = await readBuildLog(tx, build.id)
      expect(log.at(-1)?.text).toBe(build.error)
      // And the stream says so with the code an agent switches on.
      const [failed] = await tx
        .select()
        .from(events)
        .where(eq(events.type, 'build.failed'))
      expect(failed?.machineDetail).toMatchObject({
        buildId: build.id,
        code: 'SPEC_ATTRIBUTE_NOT_REGISTERED',
      })
    })
  })

  /**
   * **NO REGISTRATION, NO CHECK — AND THAT IS NOT A HOLE.** An app with no IAM registration
   * cannot reach production at all: §13's `iam-registration` item reads `unmet` for a CWL app
   * with no row (P6a Task 7). This check is the other half — what the app may REQUEST once
   * a registration exists — and refusing every CWL build until IAM answers would stop a
   * faculty member building for staging for the weeks §9 says a registration takes.
   */
  it('builds a CWL app with no registration yet — the launch gate is the other half', async () => {
    await withProject(async (tx, { projectId }) => {
      const { build } = await buildOf(
        tx,
        projectId,
        { provider: 'cwl', attributes: ['ubcEduCwlPuid', 'mail'] },
        null,
      )
      expect(build.status, build.error ?? '').toBe('succeeded')
    })
  })

  /**
   * An app that signs nobody in requests nothing from IAM, whatever its list says: the
   * schema lets `auth.attributes` stand beside `provider: none`, and no SP is registered for
   * it, so no attribute is released. Refusing it would fail a build over a list that has no
   * effect — the positive control's mirror, for the `provider` read in `finishBuild`.
   */
  it('builds an app that signs nobody in, whatever attributes its list names', async () => {
    await withProject(async (tx, { projectId }) => {
      const { build } = await buildOf(
        tx,
        projectId,
        { provider: 'none', attributes: ['mail'] },
        ['ubcEduCwlPuid'],
      )
      expect(build.status, build.error ?? '').toBe('succeeded')
    })
  })
})

/**
 * **A DRAFT NEVER GATES THE BUILD LOOP** (the launch path plan's Task 9, Review Focus 1). An owner
 * drafts the production registration in week one; in week three the agent adds an attribute.
 * Only a registration UBC has REGISTERED — the production row with `registered_at` set — is
 * checked; a draft, a submission and the staging row gate nothing. Each case's positive control
 * is in the same test: the same build fails once UBC has registered less than it asks for, so
 * the green half cannot be a runner that checks nothing.
 */
describe('only a registration UBC has registered gates a build (the launch path plan’s Task 9)', () => {
  it('a draft never fails a build, and a registered production row still does', async () => {
    await withProject(async (tx, { projectId }) => {
      const draft = await withDraft(tx, {
        projectId,
        environment: 'production',
        attributes: ['ubcEduCwlPuid'],
      })
      const auth = { provider: 'cwl' as const, attributes: ['ubcEduCwlPuid', 'mail'] }
      const before = await buildOf(tx, projectId, auth, null)
      expect(before.build.status, before.build.error ?? '').toBe('succeeded')

      // UBC registers ONE attribute, and an administrator records it: now it is checked.
      await tx
        .update(iamRegistrations)
        .set({
          state: 'active',
          registeredAttributes: ['ubcEduCwlPuid'],
          registeredAt: new Date(),
          externalTicketRef: 'IAM-4471',
        })
        .where(eq(iamRegistrations.id, draft.id))
      const after = await buildOf(tx, projectId, auth, null)
      expect(after.build.status).toBe('failed')
      expect(after.build.error).toMatch(/^SPEC_ATTRIBUTE_NOT_REGISTERED: /)
      expect(after.build.error).toContain(': mail.')
    })
  })

  it('a submitted production registration, not yet registered, never fails a build', async () => {
    await withProject(async (tx, { projectId }) => {
      const draft = await withDraft(tx, { projectId, environment: 'production' })
      await tx
        .update(iamRegistrations)
        .set({ state: 'submitted', submittedAt: new Date() })
        .where(eq(iamRegistrations.id, draft.id))
      const { build } = await buildOf(
        tx,
        projectId,
        { provider: 'cwl', attributes: ['ubcEduCwlPuid', 'mail', 'sn'] },
        null,
      )
      expect(build.status, build.error ?? '').toBe('succeeded')
    })
  })

  it('a staging registration, even active, never fails a build', async () => {
    await withProject(async (tx, { projectId }) => {
      const staging = await withDraft(tx, { projectId, environment: 'staging' })
      await tx
        .update(iamRegistrations)
        .set({
          state: 'active',
          registeredAttributes: ['ubcEduCwlPuid'],
          registeredAt: new Date(),
        })
        .where(eq(iamRegistrations.id, staging.id))
      const auth = { provider: 'cwl' as const, attributes: ['ubcEduCwlPuid', 'mail'] }
      const { build } = await buildOf(tx, projectId, auth, null)
      expect(build.status, build.error ?? '').toBe('succeeded')
      // THE POSITIVE CONTROL: the same attributes against a REGISTERED production row fail.
      const refused = await buildOf(tx, projectId, auth, ['ubcEduCwlPuid'])
      expect(refused.build.status).toBe('failed')
      expect(refused.build.error).toContain(': mail.')
    })
  })
})
