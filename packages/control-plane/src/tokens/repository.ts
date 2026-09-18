import { and, desc, eq, isNull } from 'drizzle-orm'
import { delegatedTokens, type Db } from '../db/index.js'

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
  db: Db,
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
