import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { events, projects } from '../db/index.js'
import { withProject } from '../db/testing.js'
import { createEventBus } from '../observability/index.js'
import type { MirrorAdvance } from '../source/index.js'
import { createSourceObserver } from './source-events.js'

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
