import { and, eq, ne } from 'drizzle-orm'
import { projects, type Db } from '../db/index.js'
import {
  actingContext,
  makeRedactor,
  publishEvent,
  type EventBus,
} from '../observability/index.js'
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
 * And one `repository.secret_detected` per commit that added a secret-shaped value (Task 11):
 * the path, the line and the rule, never the value. And one `repository.scan_incomplete` naming
 * every commit the scan could NOT read (the authoring API plan's Task 12) — commit ids only.
 *
 * **A mirror with no project is a platform defect**, thrown rather than dropped: the driver
 * awaits this inside its sync, so the read that synced fails loudly instead of the report
 * vanishing. (A delivery for a repository no project holds never reaches a sync — the
 * receiver ignores it first.)
 */
export function createSourceObserver(deps: { db: Db; bus: EventBus }): SourceObserver {
  const report = async (advance: MirrorAdvance): Promise<void> => {
    const [project] = await deps.db
      .select({ id: projects.id })
      .from(projects)
      // The slug's LIVE holder: a deleted project's slug may be another project's now (Task 12).
      .where(and(eq(projects.slug, advance.projectSlug), ne(projects.state, 'deleted')))
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
    // ENFORCED PRIVATE (Task 10): reported whenever the repository was READ public — made
    // private again, or not. `detail` is Manifest's own sentence, never GitHub's body.
    const v = advance.visibility
    if (v !== null && v.observed === 'public') {
      await publishEvent(
        deps.db,
        deps.bus,
        {
          projectId: project.id,
          subject,
          type: 'repository.visibility_enforced',
          machineDetail: {
            observed: v.observed,
            result: v.result,
            detail:
              v.result === 'private'
                ? 'made private again'
                : 'GitHub refused to make it private; it is not built while it is public',
          },
          humanMessage:
            v.result === 'private'
              ? `${advance.projectSlug}'s repository was found PUBLIC on GitHub and was made private again.`
              : `${advance.projectSlug}'s repository is PUBLIC on GitHub and could not be made private; it will not be built until it is private.`,
        },
        redact,
      )
    }
    // PUSH-TIME SECRET SCANNING (Task 11): ONE event per commit that added a secret-shaped
    // value — where and which rule, never the value (§14).
    const byCommit = new Map<string, MirrorAdvance['findings']>()
    for (const f of advance.findings) {
      byCommit.set(f.commit, [...(byCommit.get(f.commit) ?? []), f])
    }
    for (const [commit, found] of byCommit) {
      const first = found[0]!
      const more = found.length - 1
      await publishEvent(
        deps.db,
        deps.bus,
        {
          projectId: project.id,
          subject,
          type: 'repository.secret_detected',
          machineDetail: {
            commit,
            findings: found
              .slice(0, SECRET_FINDINGS_PER_EVENT)
              .map((f) => ({ path: f.path, line: f.line, rule: f.rule })),
            truncated: found.length > SECRET_FINDINGS_PER_EVENT,
          },
          humanMessage:
            `A secret-shaped value was pushed to GitHub in ${commit.slice(0, 12)} ` +
            `(${first.path}:${first.line}, ${first.rule}${more > 0 ? `, and ${more} more` : ''}). ` +
            'It is on GitHub now: treat it as exposed and rotate it. Manifest will not build a commit that carries it.',
        },
        redact,
      )
    }
    // THE SCAN'S OWN LIMIT, SAID (the authoring API plan's Task 12): commits whose own changes
    // were too large to read. Never marked scanned before this is published (the driver's
    // sync), so an owner learns it at least once.
    if (advance.unscannable.length > 0) {
      const n = advance.unscannable.length
      await publishEvent(
        deps.db,
        deps.bus,
        {
          projectId: project.id,
          subject,
          type: 'repository.scan_incomplete',
          machineDetail: { commits: advance.unscannable },
          humanMessage:
            `${n === 1 ? `A commit pushed to GitHub (${advance.unscannable[0]!.slice(0, 12)}) was` : `${n} commits pushed to GitHub were`} ` +
            `too large for Manifest to scan for secrets, so nothing in ${n === 1 ? 'it' : 'them'} was checked. ` +
            'A build of any commit still scans the whole tree it builds.',
        },
        redact,
      )
    }
  }
  return {
    /**
     * NAMES NOBODY (§26; the faculty-ready plan's Task 10, its review's I1): a commit or a build syncs the
     * mirror first, and the sync reports every push no webhook had yet — someone else's included — so
     * what it publishes is GitHub's news, never the news of whoever's request ran the sync. Their own
     * commit through Manifest names them, in `repository.committed`.
     */
    advanced: (advance) => actingContext.exit(() => report(advance)),
  }
}

/** How many findings one `repository.secret_detected` names; past it, `truncated`. */
const SECRET_FINDINGS_PER_EVENT = 50
