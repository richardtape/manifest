import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { events, projects, sourceRepositories } from '../db/index.js'
import { withProject } from '../db/testing.js'
import {
  actingContext,
  createEventBus,
  EXAMPLE_DETAILS,
  makeRedactor,
  publishEvent,
  type StreamFrame,
} from '../observability/index.js'
import type { MirrorAdvance } from '../source/index.js'
import { createSourceObserver } from './source-events.js'
import { projectForRepository } from './source-repositories.js'

const A = 'a'.repeat(40)
const B = 'b'.repeat(40)

const advanceOf = (slug: string, unscannable: string[]): MirrorAdvance => ({
  projectSlug: slug,
  updated: [],
  rewritten: [],
  visibility: null,
  findings: [],
  unscannable,
})

/**
 * THE MIRROR'S OBSERVER, publishing what the scan could NOT do (the authoring API plan's Task
 * 12) — `repository.scan_incomplete`, through `publishEvent` and so `recordEvent`'s schema and
 * the database's CHECK. The driver's half (reported before the commits are marked scanned) is
 * `source/github/driver.test.ts`'s *names a commit TOO LARGE TO SCAN*.
 */
describe('the source observer reports commits too large to scan (Task 12)', () => {
  it('publishes ONE repository.scan_incomplete naming every commit — ids only — and nothing for an advance with none', async () => {
    await withProject(async (db, { projectId }) => {
      const [project] = await db.select().from(projects).where(eq(projects.id, projectId))
      const observer = createSourceObserver({ db, bus: createEventBus() })
      const incomplete = () =>
        db.select().from(events).where(eq(events.type, 'repository.scan_incomplete'))
      // The positive control for the negative claim: an advance that read everything says nothing.
      await observer.advanced(advanceOf(project!.slug, []))
      expect(await incomplete()).toEqual([])

      await observer.advanced(advanceOf(project!.slug, [A, B]))
      const rows = await incomplete()
      expect(rows).toHaveLength(1)
      expect(rows[0]!.projectId).toBe(projectId)
      expect(rows[0]!.machineDetail).toEqual({ commits: [A, B] })
      expect(rows[0]!.humanMessage).toBe(
        '2 commits pushed to GitHub were too large for Manifest to scan for secrets, so nothing in them was checked. A build of any commit still scans the whole tree it builds.',
      )

      await observer.advanced(advanceOf(project!.slug, [A]))
      expect((await incomplete()).map((r) => r.humanMessage)).toContain(
        `A commit pushed to GitHub (${A.slice(0, 12)}) was too large for Manifest to scan for secrets, so nothing in it was checked. A build of any commit still scans the whole tree it builds.`,
      )
    })
  })
})

/**
 * A PUSH TO GITHUB IS GITHUB'S NEWS, NOT THE NEWS OF WHOEVER'S REQUEST FOUND IT (the faculty-ready plan's
 * Task 10, its review's I1): a commit or a build syncs the mirror first, and the sync reports every push
 * no webhook had — someone else's included. So what the observer publishes names nobody, whoever's request
 * ran the sync; the commit made through Manifest names its maker in its own `repository.committed`.
 * POSITIVE CONTROL in the same test: the same acting context, read directly, names its person.
 */
describe('the source observer names nobody (Task 10)', () => {
  it('publishes a push a request’s sync found with no actor, and no administrator’s reason', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const [project] = await db.select().from(projects).where(eq(projects.id, projectId))
      const bus = createEventBus()
      const frames: StreamFrame[] = []
      bus.subscribe(projectId, (frame) => frames.push(frame))
      const acting = {
        userId: ownerId,
        name: 'An Administrator',
        phrase: 'An Administrator',
        token: null,
        offeredReason: 'fixing something else',
        asAdmin: true,
        reason: 'fixing something else',
      }
      await actingContext.run(acting, () =>
        createSourceObserver({ db, bus }).advanced({
          ...advanceOf(project!.slug, [A]),
          updated: [{ ref: 'refs/heads/main', from: A, to: B }],
        }),
      )
      await actingContext.run(acting, () =>
        publishEvent(
          db,
          bus,
          {
            projectId,
            subject: 'control',
            type: 'project.renamed',
            machineDetail: EXAMPLE_DETAILS['project.renamed'],
            humanMessage: 'The positive control.',
          },
          makeRedactor([]),
        ),
      )
      const rows = await db.select().from(events).where(eq(events.projectId, projectId))
      const fromGitHub = rows.filter((r) => r.type.startsWith('repository.'))
      expect(fromGitHub.map((r) => r.type).sort()).toEqual([
        'repository.pushed',
        'repository.scan_incomplete',
      ])
      expect(fromGitHub.map((r) => [r.actorUserId, r.actedAsAdmin, r.reason])).toEqual(
        fromGitHub.map(() => [null, false, null]),
      )
      const framed = frames.filter((f) => f.kind === 'event')
      expect(
        framed.filter((f) => f.type.startsWith('repository.')).map((f) => f.actor),
      ).toEqual([null, null])
      expect(framed.find((f) => f.type === 'project.renamed')?.actor).toEqual({
        name: 'An Administrator',
        asAdministrator: true,
        reason: 'fixing something else',
        token: null,
      })
    })
  })
})

/**
 * A SLUG A DELETED PROJECT FREED, TAKEN AGAIN (the front-end enablement plan's Task 12): two rows share
 * it, one a tombstone. Both lookups BY NAME — the mirror's observer by slug, a webhook's delivery by
 * the repository's full name — must reach the LIVE project, never the tombstone its trail belongs to.
 */
describe('a slug taken again after a delete (Task 12)', () => {
  it('attributes an advance, and a delivery, to the live project — never the tombstone', async () => {
    await withProject(async (db, { projectId }) => {
      const [old] = await db.select().from(projects).where(eq(projects.id, projectId))
      await db
        .update(projects)
        .set({ state: 'deleted', deletedAt: new Date() })
        .where(eq(projects.id, projectId))
      const [live] = await db
        .insert(projects)
        .values({
          slug: old!.slug,
          name: old!.slug,
          ownerId: old!.ownerId,
          blueprintRef: old!.blueprintRef,
        })
        .returning()
      for (const id of [projectId, live!.id])
        await db
          .insert(sourceRepositories)
          .values({ projectId: id, provider: 'github', fullName: `Org/${old!.slug}` })
          .onConflictDoUpdate({
            target: sourceRepositories.projectId,
            set: { provider: 'github', fullName: `Org/${old!.slug}` },
          })

      expect((await projectForRepository(db, 'github', `Org/${old!.slug}`))?.id).toBe(
        live!.id,
      )
      await createSourceObserver({ db, bus: createEventBus() }).advanced(
        advanceOf(old!.slug, [A]),
      )
      const [row] = await db
        .select()
        .from(events)
        .where(eq(events.type, 'repository.scan_incomplete'))
      expect(row!.projectId).toBe(live!.id)
    })
  })
})
