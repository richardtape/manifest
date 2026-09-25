import { eq } from 'drizzle-orm'
import { projects, type Db } from '../db/index.js'
import { makeRedactor, publishEvent, type EventBus } from '../observability/index.js'
import type { MirrorAdvance, SourceObserver } from '../source/index.js'

/**
 * THE ONE OBSERVER OF D5 DRIVER 2'S MIRROR (the D5 plan's Task 9, Decision 11): built once at
 * boot with the database and the bus, and handed to the driver, which is REQUIRED to take it
 * — so `source/` never holds either, and no advance goes unreported whatever caused it: a
 * webhook, a read that needed GitHub's head, or Manifest's own commit.
 *
 * One Event per branch: `repository.pushed` for a branch that moved, and
 * `repository.history_rewritten` for one GitHub rewrote and the mirror refused. **Commit ids
 * and a ref, nothing else** — an author and a message are an app author's free text (§14).
 *
 * **A mirror with no project is a platform defect**, thrown rather than dropped: the driver
 * awaits this inside its sync, so the read that synced fails loudly instead of the report
 * vanishing. (A delivery for a repository no project holds never reaches a sync — the
 * receiver ignores it first.)
 */
export function createSourceObserver(deps: { db: Db; bus: EventBus }): SourceObserver {
  return {
    async advanced(advance: MirrorAdvance) {
      const [project] = await deps.db
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.slug, advance.projectSlug))
      if (project === undefined) {
        throw new Error(
          `the mirror of '${advance.projectSlug}' advanced, and no project has that slug; nothing can be reported for it`,
        )
      }
      const redact = makeRedactor([])
      const subject = `repository:${advance.projectSlug}`
      const branch = (ref: string) => ref.replace(/^refs\/heads\//, '')
      for (const u of advance.updated) {
        await publishEvent(
          deps.db,
          deps.bus,
          {
            projectId: project.id,
            subject,
            type: 'repository.pushed',
            machineDetail: { ref: u.ref, from: u.from, to: u.to },
            humanMessage:
              u.from === null
                ? `${branch(u.ref)} appeared on GitHub at ${u.to.slice(0, 12)}.`
                : `${branch(u.ref)} moved on GitHub to ${u.to.slice(0, 12)}.`,
          },
          redact,
        )
      }
      for (const r of advance.rewritten) {
        await publishEvent(
          deps.db,
          deps.bus,
          {
            projectId: project.id,
            subject,
            type: 'repository.history_rewritten',
            machineDetail: { ref: r.ref, mirror: r.mirror, upstream: r.upstream },
            humanMessage: `GitHub's history for ${branch(r.ref)} was rewritten; Manifest kept the commits it had.`,
          },
          redact,
        )
      }
    },
  }
}
