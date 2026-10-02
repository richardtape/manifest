import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import {
  approvalRequests,
  approvals,
  events,
  instances,
  projects,
  routes,
  type Db,
  type DiffSnapshotColumn,
} from '../db/index.js'
import { withProject } from '../db/testing.js'
import { createEventBus } from '../observability/index.js'
import { openRequestFor } from './candidate.js'
import { computeLaunchReadiness } from './readiness.js'
import { vancouverDayInWords } from './records.js'
import { ProductionGateError } from './gate.js'
import { LaunchRecordError } from './records.js'
import { requestApproval } from './requests.js'
import { stagedRelease } from './testing.js'

/**
 * AN OWNER ASKS FOR SIGN-OFF (the launch path plan's Task 12; Spec action 5, FE-25): a request against
 * the release serving staging, answered by an administrator's decision. Open and closed are DERIVED
 * (`openRequestFor`), never written — so these tests move the facts a request is read from (a decision,
 * the release serving staging) and read the answer, rather than asserting a column. The routes, the
 * codes on the wire and who may ask are `api/queue.test.ts`'s.
 */

const bus = createEventBus()
const NOTE = 'Week 3 — students start Monday'

/** A decision written straight to `approvals`, as `recordApproval` writes one — the request only reads it. */
async function decide(
  db: Db,
  input: {
    projectId: string
    releaseId: string
    ownerId: string
    imageDigest: string
    decision: 'approved' | 'rejected'
    decidedAt?: Date
  },
): Promise<void> {
  await db.insert(approvals).values({
    releaseId: input.releaseId,
    projectId: input.projectId,
    decision: input.decision,
    decidedBy: input.ownerId,
    imageDigest: input.imageDigest,
    ...(input.decision === 'rejected' ? { reason: 'the consent page is missing' } : {}),
    ...(input.decidedAt === undefined ? {} : { decidedAt: input.decidedAt }),
    diffSnapshot: {
      imageDigest: input.imageDigest,
      changes: [],
      services: [],
      attributes: [],
      resources: {},
      summary: null,
      summarySource: 'no-previous-release',
      review: {
        state: 'not_performed',
        reviewer: 'none',
        detail: 'No code reviewer is configured.',
      },
    } satisfies DiffSnapshotColumn,
  })
}

const ask = (db: Db, releaseId: string, userId: string, note?: string) =>
  requestApproval(db, bus, {
    releaseId,
    actor: { userId, tokenId: null },
    ...(note === undefined ? {} : { note }),
  })

describe('a sign-off request (Task 12, Spec action 5)', () => {
  it('asks for sign-off on the release serving staging: one request, open, announced with who and which release — never the note', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const { releaseId } = await stagedRelease(db, { projectId, ownerId })
      const asked = await ask(db, releaseId, ownerId, NOTE)
      expect(asked.created).toBe(true)
      expect(asked.open).toBe(true)
      expect(asked.request).toMatchObject({
        releaseId,
        projectId,
        requestedBy: ownerId,
        requestedByToken: null,
        note: NOTE,
      })
      expect((await openRequestFor(db, projectId))?.id).toBe(asked.request.id)
      const published = await db
        .select()
        .from(events)
        .where(
          and(eq(events.projectId, projectId), eq(events.type, 'approval.requested')),
        )
      expect(published).toHaveLength(1)
      expect(published[0]!.subject).toBe(`release:${releaseId}`)
      expect(published[0]!.machineDetail).toEqual({
        requestId: asked.request.id,
        releaseId,
        viaToken: false,
      })
      expect(published[0]!.humanMessage).toBe(
        'Test Owner asked an administrator to approve this release for production.',
      )
      // THE NOTE IS FOR ADMINISTRATORS ALONE — in no event, by any field.
      expect(JSON.stringify(published)).not.toContain('Week 3')
    })
  })

  it('a second ask answers the first — the same request, one row, one event', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const { releaseId } = await stagedRelease(db, { projectId, ownerId })
      const first = await ask(db, releaseId, ownerId, NOTE)
      const second = await ask(db, releaseId, ownerId, 'a different note')
      expect(second.created).toBe(false)
      expect(second.request.id).toBe(first.request.id)
      // The first ask's words stand: a second ask creates nothing, and changes nothing.
      expect(second.request.note).toBe(NOTE)
      const rows = await db
        .select()
        .from(approvalRequests)
        .where(eq(approvalRequests.projectId, projectId))
      expect(rows).toHaveLength(1)
      const published = await db
        .select()
        .from(events)
        .where(
          and(eq(events.projectId, projectId), eq(events.type, 'approval.requested')),
        )
      expect(published).toHaveLength(1)
    })
  })

  it('a request closes when a decision is recorded for its release — derived, never written', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const { releaseId, imageDigest } = await stagedRelease(db, { projectId, ownerId })
      const asked = await ask(db, releaseId, ownerId)
      await decide(db, {
        projectId,
        releaseId,
        ownerId,
        imageDigest,
        decision: 'approved',
      })
      expect(await openRequestFor(db, projectId)).toBeUndefined()
      // Nothing was written to the request: it is closed by what exists, not by a column.
      const [row] = await db
        .select()
        .from(approvalRequests)
        .where(eq(approvalRequests.id, asked.request.id))
      expect(row).toEqual(asked.request)
    })
  })

  it('a request closes when another release serves staging — and the new candidate may be asked about', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const first = await stagedRelease(db, { projectId, ownerId })
      await ask(db, first.releaseId, ownerId)
      const second = await stagedRelease(db, { projectId, ownerId })
      expect(await openRequestFor(db, projectId)).toBeUndefined()
      // THE POSITIVE CONTROL: the candidate's own request is open.
      const asked = await ask(db, second.releaseId, ownerId)
      expect(asked.open).toBe(true)
      expect((await openRequestFor(db, projectId))?.id).toBe(asked.request.id)
    })
  })

  it('a request whose release serves staging AGAIN is open again, from when it was asked — closed only while another serves', async () => {
    // THE RULE (the sitting's review, I1; the plan's Decision 17: a request closes "derived at read … when
    // the release is no longer the candidate"): a rollback through staging puts the asked-about release
    // back, and the ask for it stands. Its `since` is the original ask — the known cost (the record).
    await withProject(async (db, { projectId, ownerId }) => {
      const first = await stagedRelease(db, { projectId, ownerId })
      const asked = await ask(db, first.releaseId, ownerId)
      await stagedRelease(db, { projectId, ownerId })
      expect(await openRequestFor(db, projectId)).toBeUndefined()
      // Staging's route back to the first release's instance — what a redeploy of it does.
      const [instance] = await db
        .select()
        .from(instances)
        .where(eq(instances.releaseId, first.releaseId))
      const [route] = await db
        .select()
        .from(routes)
        .where(eq(routes.hostname, `${projectId.slice(0, 8)}.staging.manifest.internal`))
      await db
        .update(routes)
        .set({ instanceId: instance!.id })
        .where(eq(routes.id, route!.id))
      const reopened = await openRequestFor(db, projectId)
      expect(reopened?.id).toBe(asked.request.id)
      expect(reopened?.createdAt).toEqual(asked.request.createdAt)
    })
  })

  it('a decision recorded BEFORE the ask does not close it — an approval that no longer covers the build', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const { releaseId } = await stagedRelease(db, { projectId, ownerId })
      // Approved, bound to a digest this build no longer has: the checklist's item is unmet, and asking is the remedy.
      await decide(db, {
        projectId,
        releaseId,
        ownerId,
        imageDigest: `sha256:${'c'.repeat(64)}`,
        decision: 'approved',
        decidedAt: new Date(Date.now() - 60_000),
      })
      const asked = await ask(db, releaseId, ownerId)
      expect(asked.open).toBe(true)
      expect((await openRequestFor(db, projectId))?.id).toBe(asked.request.id)
    })
  })

  it('refuses a release that is not the one serving staging — RELEASE_NOT_STAGED, with the checklist naming the one that is — and writes nothing', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const first = await stagedRelease(db, { projectId, ownerId })
      const second = await stagedRelease(db, { projectId, ownerId })
      const refused = await ask(db, first.releaseId, ownerId).catch((e: unknown) => e)
      expect(refused).toBeInstanceOf(ProductionGateError)
      expect((refused as ProductionGateError).code).toBe('RELEASE_NOT_STAGED')
      expect((refused as ProductionGateError).launchReadiness.candidateReleaseId).toBe(
        second.releaseId,
      )
      expect(
        await db
          .select()
          .from(approvalRequests)
          .where(eq(approvalRequests.projectId, projectId)),
      ).toEqual([])
    })
  })

  it('refuses when an approval already covers it — APPROVAL_NOT_NEEDED, naming why — and writes nothing', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const { releaseId, imageDigest } = await stagedRelease(db, { projectId, ownerId })
      await decide(db, {
        projectId,
        releaseId,
        ownerId,
        imageDigest,
        decision: 'approved',
      })
      const refused = await ask(db, releaseId, ownerId).catch((e: unknown) => e)
      expect(refused).toBeInstanceOf(LaunchRecordError)
      expect((refused as LaunchRecordError).code).toBe('APPROVAL_NOT_NEEDED')
      // The checklist item's own words: what already meets it.
      expect((refused as LaunchRecordError).message).toContain(
        'Approved by an administrator on',
      )
      expect(
        await db
          .select()
          .from(approvalRequests)
          .where(eq(approvalRequests.projectId, projectId)),
      ).toEqual([])
    })
  })

  it('refuses a release an administrator rejected — RELEASE_REJECTED, in their words — and writes nothing', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const { releaseId, imageDigest } = await stagedRelease(db, { projectId, ownerId })
      await decide(db, {
        projectId,
        releaseId,
        ownerId,
        imageDigest,
        decision: 'rejected',
      })
      const refused = await ask(db, releaseId, ownerId).catch((e: unknown) => e)
      expect(refused).toBeInstanceOf(LaunchRecordError)
      expect((refused as LaunchRecordError).code).toBe('RELEASE_REJECTED')
      expect((refused as LaunchRecordError).message).toContain(
        'the consent page is missing',
      )
      expect(
        await db
          .select()
          .from(approvalRequests)
          .where(eq(approvalRequests.projectId, projectId)),
      ).toEqual([])
    })
  })

  it('the checklist’s admin-approval item says who asked and when, and waits since then', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const { releaseId, imageDigest } = await stagedRelease(db, { projectId, ownerId })
      const item = async () =>
        (await computeLaunchReadiness(db, projectId)).items.find(
          (i) => i.id === 'admin-approval',
        )!
      // THE POSITIVE CONTROL: unasked, nothing dates it and nobody is named.
      const before = await item()
      expect(before.state).toBe('unmet')
      expect(before.since).toBeNull()
      expect(before.why).not.toContain('asked an administrator')
      // NOBODY HAS ASKED, SO THE ITEM SAYS TO (the launch path plan's Task 14; Task 12's review, M6).
      expect(before.why).toContain(
        'Ask an administrator to sign it off (requestApproval).',
      )
      const asked = await ask(db, releaseId, ownerId, NOTE)
      const after = await item()
      expect(after.state).toBe('unmet')
      expect(after.since).toBe(asked.request.createdAt.toISOString())
      expect(after.why).toContain(
        `Test Owner asked an administrator to approve it on ${vancouverDayInWords(asked.request.createdAt)}.`,
      )
      // Asked, it no longer tells anybody to ask.
      expect(after.why).not.toContain('Ask an administrator to sign it off')
      // The note is the administrators', never the checklist's.
      expect(after.why).not.toContain('Week 3')
      // Answered, it waits on nobody: the decision is what the item says.
      await decide(db, {
        projectId,
        releaseId,
        ownerId,
        imageDigest,
        decision: 'rejected',
      })
      const decided = await item()
      expect(decided.since).toBeNull()
      expect(decided.why).not.toContain('asked an administrator')
    })
  })

  it('a launched app’s re-escalated release says who asked for it too', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const { releaseId } = await stagedRelease(db, { projectId, ownerId })
      await db
        .update(projects)
        .set({ launchedAt: new Date() })
        .where(eq(projects.id, projectId))
      const view = await computeLaunchReadiness(db, projectId)
      expect(view.launched).toBe(true)
      expect(view.reescalated).toBe(true)
      const asked = await ask(db, releaseId, ownerId)
      const item = (await computeLaunchReadiness(db, projectId)).items.find(
        (i) => i.id === 'admin-approval',
      )!
      expect(item.state).toBe('unmet')
      expect(item.since).toBe(asked.request.createdAt.toISOString())
      expect(item.why).toContain('Test Owner asked an administrator to approve it on')
    })
  })
})
