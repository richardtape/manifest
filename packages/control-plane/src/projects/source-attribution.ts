import { and, eq, inArray, sql } from 'drizzle-orm'
import { delegatedTokens, events, users, type Db } from '../db/index.js'
import type { GitIdentity } from '../source/index.js'
import type { Actor } from './authz.js'

/**
 * WHO MADE A COMMIT THROUGH MANIFEST (the authoring API plan's Task 6, Decision 5) — read from
 * the PLATFORM's record, never from the commit's text, which anyone who can push can write.
 */

/** What `listCommits` and `getCommit` answer as `madeThrough`. */
export interface MadeThrough {
  kind: 'person' | 'agent'
  /** The person — for an agent, the person who minted its token. */
  name: string
  tokenName: string | null
}

/**
 * A name for a person, never a PUID — neither a sentence (P6b's F14) nor git history (Decision
 * 5) carries one. `display_name` is NOT NULL but may be blank, and a sentence that names
 * nobody reads as a defect; this is what it says instead.
 */
const NOBODY_NAMED = 'A Manifest user'

const named = (displayName: string | null | undefined): string =>
  displayName === null || displayName === undefined || displayName.trim() === ''
    ? NOBODY_NAMED
    : displayName

/** The person acting, by name, and — for a delegated token — the token's name. */
export async function actorNames(
  db: Db,
  actor: Actor,
): Promise<{ name: string; tokenName: string | null }> {
  const [who] = await db
    .select({ name: users.displayName })
    .from(users)
    .where(eq(users.id, actor.userId))
  if (actor.credential === 'session') return { name: named(who?.name), tokenName: null }
  const [token] = await db
    .select({ name: delegatedTokens.name })
    .from(delegatedTokens)
    .where(eq(delegatedTokens.id, actor.tokenId))
  return { name: named(who?.name), tokenName: token?.name ?? null }
}

/**
 * THE AUTHOR an API commit carries: the person's name — for a token, *"Ada Lovelace (via token
 * 'claude-code')"* — at `<userId>@users.manifest.internal`, an address in the platform's own
 * zone that is nobody's mailbox, so neither a PUID nor a real email reaches git history (or
 * GitHub's, on driver 2). The committer is Manifest (`MANIFEST_COMMITTER`).
 */
export async function authorFor(db: Db, actor: Actor): Promise<GitIdentity> {
  const { name, tokenName } = await actorNames(db, actor)
  return {
    name: tokenName === null ? name : `${name} (via token '${tokenName}')`,
    email: `${actor.userId}@users.manifest.internal`,
  }
}

/**
 * `madeThrough` for a page of commits: ONE query over `repository.committed` for exactly these
 * ids, joined to the person and the token — never one query per commit. A commit with no such
 * event (a person's `git push`, on either driver; the seed) is absent from the map.
 */
export async function madeThroughFor(
  db: Db,
  projectId: string,
  shas: readonly string[],
): Promise<Map<string, MadeThrough>> {
  if (shas.length === 0) return new Map()
  const commitSha = sql<string>`${events.machineDetail}->>'commitSha'`
  const rows = await db
    .select({
      commitSha,
      via: sql<string>`${events.machineDetail}->>'via'`,
      name: users.displayName,
      tokenName: delegatedTokens.name,
    })
    .from(events)
    .leftJoin(users, sql`${users.id} = (${events.machineDetail}->>'userId')::uuid`)
    .leftJoin(
      delegatedTokens,
      sql`${delegatedTokens.id} = (${events.machineDetail}->>'tokenId')::uuid`,
    )
    .where(
      and(
        eq(events.projectId, projectId),
        eq(events.type, 'repository.committed'),
        inArray(commitSha, [...shas]),
      ),
    )
  return new Map(
    rows.map((r) => [
      r.commitSha,
      {
        kind: r.via === 'token' ? 'agent' : 'person',
        name: named(r.name),
        tokenName: r.via === 'token' ? (r.tokenName ?? null) : null,
      },
    ]),
  )
}
