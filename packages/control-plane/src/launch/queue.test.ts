import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  approvals,
  iamRegistrations,
  privacyAssessments,
  projects,
  type Db,
  type DiffSnapshotColumn,
} from '../db/index.js'
import { withProject } from '../db/testing.js'
import { createEventBus } from '../observability/index.js'
import { listQueue, QUEUE_LIMIT, type QueueItem } from './queue.js'
import { vancouverNoon } from './records.js'
import { requestApproval } from './requests.js'
import { stagedRelease } from './testing.js'

/**
 * THE ADMINISTRATORS' QUEUE (the launch path plan's Task 12; Spec action 5): everything waiting on an
 * administrator — a release someone asked them to sign off, and a record with UBC whose answer they
 * will record — derived from rows that exist, oldest first. **IT READS ACROSS THE WHOLE DATABASE**, and
 * other files' rows may be committed there (sitting 7's F17), so every assertion below is scoped to the
 * test's own projects, and the days are set long ago so that this test's items are the oldest.
 */

const bus = createEventBus()

/** Another project in the same transaction, owned by the same person. */
async function anotherProject(
  db: Db,
  ownerId: string,
  state: 'active' | 'archived' | 'deleted' = 'active',
): Promise<string> {
  const unique = randomUUID().slice(0, 8)
  const [row] = await db
    .insert(projects)
    .values({
      slug: `queue-${unique}`,
      name: `Queue ${unique}`,
      ownerId,
      blueprintRef: 'fixture-node@1',
      state,
      ...(state === 'archived' ? { archivedAt: new Date('2001-02-01T00:00:00Z') } : {}),
    })
    .returning()
  return row!.id
}

/** A registration with UBC, written as the submission and the administrator's record leave it. */
async function registration(
  db: Db,
  input: {
    projectId: string
    environment: 'staging' | 'production'
    state: 'draft' | 'submitted' | 'active' | 'change_requested'
    from?: 'submitted' | 'active'
    day?: string
    by?: string
    ticket?: string
  },
): Promise<string> {
  const [row] = await db
    .insert(iamRegistrations)
    .values({
      projectId: input.projectId,
      environmentKind: input.environment,
      entityId: `https://manifest.internal/sp/${input.projectId}/${input.environment}`,
      acsUrl: 'https://x.manifest.internal/auth/ubcshib/callback',
      sloUrl: 'https://x.manifest.internal/auth/logout',
      state: input.state,
      ...(input.state === 'change_requested'
        ? { changeRequestedFrom: input.from ?? 'submitted' }
        : {}),
      ...(input.from === 'active'
        ? {
            registeredAttributes: ['ubcEduCwlPuid', 'mail'],
            registeredAt: new Date('2000-12-01T00:00:00Z'),
            requestedAttributes: ['ubcEduCwlPuid', 'mail', 'sn'],
          }
        : {}),
      ...(input.day === undefined ? {} : { submittedAt: vancouverNoon(input.day) }),
      ...(input.by === undefined ? {} : { submittedBy: input.by }),
      ...(input.ticket === undefined ? {} : { externalTicketRef: input.ticket }),
    })
    .returning()
  return row!.id
}

async function assessment(
  db: Db,
  input: {
    projectId: string
    state: 'draft' | 'submitted' | 'approved'
    day?: string
    by?: string
  },
): Promise<string> {
  const [row] = await db
    .insert(privacyAssessments)
    .values({
      projectId: input.projectId,
      state: input.state,
      ...(input.day === undefined ? {} : { submittedAt: vancouverNoon(input.day) }),
      ...(input.by === undefined ? {} : { submittedBy: input.by }),
    })
    .returning()
  return row!.id
}

const mine = (items: readonly QueueItem[], ids: readonly string[]) =>
  items.filter((i) => ids.includes(i.project.id))

/** Oldest first, across the whole answer — not only this test's items. */
function expectOldestFirst(items: readonly QueueItem[]): void {
  for (let i = 1; i < items.length; i++)
    expect(items[i]!.since.getTime()).toBeGreaterThanOrEqual(
      items[i - 1]!.since.getTime(),
    )
}

describe('the administrators’ queue (Task 12, Spec action 5)', () => {
  it('holds what waits on UBC — submitted registrations, staging and production, and a submitted assessment — oldest first, each with the environment and who sent it', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const staging = await registration(db, {
        projectId,
        environment: 'staging',
        state: 'submitted',
        day: '2001-01-01',
        by: ownerId,
        ticket: 'IAM-2001-0001',
      })
      const pia = await assessment(db, {
        projectId,
        state: 'submitted',
        day: '2001-01-02',
        by: ownerId,
      })
      const other = await anotherProject(db, ownerId)
      const production = await registration(db, {
        projectId: other,
        environment: 'production',
        state: 'submitted',
        day: '2001-01-03',
        by: ownerId,
      })
      // NOT WAITING ON AN ADMINISTRATOR: a draft (the owner's), what UBC registered, an approved assessment.
      const third = await anotherProject(db, ownerId)
      await registration(db, { projectId: third, environment: 'staging', state: 'draft' })
      await registration(db, {
        projectId: third,
        environment: 'production',
        state: 'active',
        from: 'active',
      })
      await assessment(db, { projectId: third, state: 'approved' })

      const queue = await listQueue(db)
      const items = mine(queue.items, [projectId, other, third])
      expect(items.map((i) => [i.kind, i.subjectId, i.environment])).toEqual([
        ['iam-registration', staging, 'staging'],
        ['privacy-assessment', pia, null],
        ['iam-registration', production, 'production'],
      ])
      expect(items[0]).toMatchObject({
        requestedBy: { id: ownerId, displayName: 'Test Owner' },
        since: vancouverNoon('2001-01-01'),
        note: null,
        summary:
          'The staging registration was sent to UBC IAM on January 1, 2001 (ticket IAM-2001-0001): record UBC IAM’s answer when it comes.',
      })
      expect(items[0]!.project).toMatchObject({ id: projectId, state: 'active' })
      expect(items[1]!.summary).toBe(
        'The privacy assessment was sent to the UBC Privacy Office on January 2, 2001: record its answer, with the PIA number, when it comes.',
      )
      expectOldestFirst(queue.items)
      expect(queue.oldestSince).toEqual(queue.items[0]!.since)
    })
  })

  it('a change request an administrator filed waits on UBC since it was filed; one UBC sent back to the owner is not the administrators’', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const filed = await registration(db, {
        projectId,
        environment: 'production',
        state: 'change_requested',
        from: 'active',
        day: '2001-03-01',
        by: ownerId,
      })
      const other = await anotherProject(db, ownerId)
      // UBC came back to the owner with questions: the owner's move, not an administrator's.
      await registration(db, {
        projectId: other,
        environment: 'staging',
        state: 'change_requested',
        from: 'submitted',
        day: '2001-03-02',
        by: ownerId,
      })
      const items = mine((await listQueue(db)).items, [projectId, other])
      expect(items).toHaveLength(1)
      expect(items[0]).toMatchObject({
        kind: 'iam-change-request',
        subjectId: filed,
        environment: 'production',
        since: vancouverNoon('2001-03-01'),
        summary:
          'A change request for the production registration was filed with UBC IAM on March 1, 2001, asking for ubcEduCwlPuid, mail, sn: record UBC IAM’s answer when it comes.',
      })
    })
  })

  it('an open sign-off request is an item, with its note — an answered one is not, nor one whose release stopped being the candidate', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const { releaseId } = await stagedRelease(db, { projectId, ownerId })
      const asked = await requestApproval(db, bus, {
        releaseId,
        actor: { userId: ownerId, tokenId: null },
        note: 'Week 3 — students start Monday',
      })
      // ANSWERED: decided since it was asked.
      const answered = await anotherProject(db, ownerId)
      const a = await stagedRelease(db, { projectId: answered, ownerId })
      await requestApproval(db, bus, {
        releaseId: a.releaseId,
        actor: { userId: ownerId, tokenId: null },
      })
      await db.insert(approvals).values({
        releaseId: a.releaseId,
        projectId: answered,
        decision: 'approved',
        decidedBy: ownerId,
        imageDigest: a.imageDigest,
        diffSnapshot: {} as DiffSnapshotColumn,
      })
      // MOVED ON: another release serves staging now.
      const moved = await anotherProject(db, ownerId)
      const m = await stagedRelease(db, { projectId: moved, ownerId })
      await requestApproval(db, bus, {
        releaseId: m.releaseId,
        actor: { userId: ownerId, tokenId: null },
      })
      await stagedRelease(db, { projectId: moved, ownerId })

      const items = mine((await listQueue(db)).items, [projectId, answered, moved])
      expect(items).toHaveLength(1)
      expect(items[0]).toMatchObject({
        kind: 'release-approval',
        subjectId: releaseId,
        environment: null,
        requestedBy: { id: ownerId, displayName: 'Test Owner' },
        since: asked.request.createdAt,
        note: 'Week 3 — students start Monday',
        summary:
          'Test Owner asked for the release serving staging to be approved for the app’s first production launch.',
      })
    })
  })

  it('a deleted project’s records are not in it; an archived project’s are, and say so', async () => {
    await withProject(async (db, { ownerId }) => {
      const archived = await anotherProject(db, ownerId, 'archived')
      const deleted = await anotherProject(db, ownerId, 'deleted')
      await assessment(db, { projectId: archived, state: 'submitted', day: '2001-04-01' })
      await assessment(db, { projectId: deleted, state: 'submitted', day: '2001-04-02' })
      const items = mine((await listQueue(db)).items, [archived, deleted])
      expect(items).toHaveLength(1)
      expect(items[0]!.project).toMatchObject({ id: archived, state: 'archived' })
      // Sent by nobody Manifest recorded — an administrator's record from before submissions were kept.
      expect(items[0]!.requestedBy).toBeNull()
    })
  })

  it(`answers at most ${QUEUE_LIMIT}, the oldest kept, and says more wait`, async () => {
    await withProject(async (db, { ownerId }) => {
      const ids: string[] = []
      for (let i = 0; i <= QUEUE_LIMIT; i++) {
        const id = await anotherProject(db, ownerId)
        ids.push(id)
        await db.insert(privacyAssessments).values({
          projectId: id,
          state: 'submitted',
          // Older than anything else in the database, one minute apart.
          submittedAt: new Date(Date.UTC(1990, 0, 1, 0, i)),
        })
      }
      const queue = await listQueue(db)
      expect(queue.items).toHaveLength(QUEUE_LIMIT)
      expect(queue.truncated).toBe(true)
      expect(queue.items[0]!.project.id).toBe(ids[0])
      expect(queue.oldestSince).toEqual(new Date(Date.UTC(1990, 0, 1, 0, 0)))
      // The newest of them is the one left out.
      expect(queue.items.map((i) => i.project.id)).not.toContain(ids[QUEUE_LIMIT])
      expectOldestFirst(queue.items)
    })
  })
})
