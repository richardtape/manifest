import { and, desc, eq, isNull } from 'drizzle-orm'
import { delegatedTokens, projects, type Db } from '../db/index.js'

/** §6's `DelegatedToken`, as stored. The secret is not in it, and never was. */
export type DelegatedToken = typeof delegatedTokens.$inferSelect

export interface CreateTokenInput {
  /**
   * REQUIRED, and it must be the id `mintToken` built the plaintext from: the token
   * names its own row (`mft_<id>_<secret>`) and Task 5 authenticates by looking that id
   * up. A row whose id no plaintext names is a credential nothing can present, so this
   * is not defaulted to the column's `defaultRandom()` — a caller with no plaintext has
   * no business writing the row.
   */
  id: string
  userId: string
  projectId: string
  name: string
  /** sha256 of the secret, hex. THE SECRET IS NEVER STORED (Decision 1). */
  tokenHash: string
  /** Never one of `PRIVILEGED` — Task 4 refuses that at the mint route. */
  capabilities: string[]
  expiresAt: Date
  rateLimit?: number
}

export async function createToken(
  // `insert` alone, so the mint route can write the row inside the transaction that holds its
  // project (the front-end enablement plan's Task 11).
  db: Pick<Db, 'insert'>,
  input: CreateTokenInput,
): Promise<DelegatedToken> {
  const [row] = await db
    .insert(delegatedTokens)
    .values({
      id: input.id,
      userId: input.userId,
      projectId: input.projectId,
      name: input.name,
      tokenHash: input.tokenHash,
      capabilities: input.capabilities,
      expiresAt: input.expiresAt,
      // `exactOptionalPropertyTypes`: a conditional spread, not `?? undefined`, so the
      // column's own default stands when the caller states no limit.
      ...(input.rateLimit === undefined ? {} : { rateLimit: input.rateLimit }),
    })
    .returning()
  return row!
}

export async function tokenById(db: Db, id: string): Promise<DelegatedToken | undefined> {
  const [row] = await db.select().from(delegatedTokens).where(eq(delegatedTokens.id, id))
  return row
}

/**
 * A token and its project's STATE, in the one read that authenticates a request (the front-end
 * enablement plan's Task 11). `tokenActor` refuses a token of a project that is not active, so an
 * archived project is unreachable by ANY token — not only by the ones its archive revoked — at the
 * price of a join on a lookup every token request already makes, never a second round trip.
 */
export async function tokenForAuthentication(
  db: Db,
  id: string,
): Promise<{ token: DelegatedToken; projectState: string } | undefined> {
  const [row] = await db
    .select({ token: delegatedTokens, projectState: projects.state })
    .from(delegatedTokens)
    .innerJoin(projects, eq(projects.id, delegatedTokens.projectId))
    .where(eq(delegatedTokens.id, id))
  return row
}

/**
 * Revokes every live token of a project — §11's archive (the front-end enablement plan's Task 11,
 * Decision 28's second step). Answers the ids it revoked; a token already revoked keeps the stamp
 * it had, so a retry revokes nothing twice.
 */
export async function revokeTokensOf(
  // `update` alone, so the archive can revoke inside the transaction that archives (sitting 8).
  db: Pick<Db, 'update'>,
  projectId: string,
): Promise<string[]> {
  const revoked = await db
    .update(delegatedTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(delegatedTokens.projectId, projectId), isNull(delegatedTokens.revokedAt)),
    )
    .returning({ id: delegatedTokens.id })
  return revoked.map((row) => row.id)
}

/**
 * Revokes every live token ONE PERSON minted on ONE project — §6's `DelegatedToken` as Spec action 2
 * amended it (the launch path plan's Task 8): *"A token is revoked when its minter is removed from its
 * project, because it acts for that person there and nowhere else."* `user_id` IS the minter. BOTH
 * conditions, never one: a token of theirs on another project is not this removal's, and a colleague's
 * on this one is not theirs. Answers the ids it revoked; a token already revoked keeps the stamp it had.
 */
export async function revokeTokensOfMember(
  // `update` alone, so the removal revokes inside the transaction that removes: a removal committed
  // without its revoke would be a person gone and their agent still working.
  db: Pick<Db, 'update'>,
  projectId: string,
  userId: string,
): Promise<string[]> {
  const revoked = await db
    .update(delegatedTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(delegatedTokens.projectId, projectId),
        eq(delegatedTokens.userId, userId),
        isNull(delegatedTokens.revokedAt),
      ),
    )
    .returning({ id: delegatedTokens.id })
  return revoked.map((row) => row.id)
}

/**
 * Every token scoped to a project, newest first — including the revoked and the expired.
 *
 * §20 asks for a list a person can review, and a list that hid the revoked ones would
 * answer "what has been able to act on this project" with only the present tense. The
 * route (Task 4) is a `project:read`, because nothing here is credential material: the
 * secret was never stored and the hash is not in `Token`.
 */
export async function tokensForProject(
  db: Db,
  projectId: string,
): Promise<DelegatedToken[]> {
  return db
    .select()
    .from(delegatedTokens)
    .where(eq(delegatedTokens.projectId, projectId))
    .orderBy(desc(delegatedTokens.createdAt))
}

/**
 * Revokes one of `userId`'s own tokens, and says whether it moved the stamp.
 *
 * `false` means the stamp did not move — the token is not this user's, does not exist,
 * or was revoked already. Deliberately one answer for all three: the route (Task 4) reads
 * the row first when it needs to tell a 404 from an idempotent second revoke, and a
 * repository that distinguished them would tell a caller which token ids exist.
 */
export async function revokeToken(db: Db, id: string, userId: string): Promise<boolean> {
  const updated = await db
    .update(delegatedTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(delegatedTokens.id, id),
        eq(delegatedTokens.userId, userId),
        isNull(delegatedTokens.revokedAt),
      ),
    )
    .returning({ id: delegatedTokens.id })
  return updated.length === 1
}

/**
 * Stamps `last_used_at`. §20 asks for it, and a token nobody has used since it was
 * minted is what a person reviewing a list of them needs to see.
 *
 * ONE WRITE PER AUTHENTICATED REQUEST if Task 5 calls it on every one — which is the
 * cost Decision 9 rejected a database-backed rate limiter for. Task 5 decides
 * deliberately: stamp only when the existing value is older than some interval, or
 * accept the write and say so.
 */
export async function touchToken(db: Db, id: string): Promise<void> {
  await db
    .update(delegatedTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(delegatedTokens.id, id))
}
