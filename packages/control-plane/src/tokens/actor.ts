import type { Db } from '../db/index.js'
import type { Capability, TokenActor } from '../projects/index.js'
import { tokenById, touchToken } from './repository.js'
import { parseToken, secretMatches } from './token.js'

/**
 * How stale `last_used_at` may be before a request writes it again (P5b Task 5).
 *
 * **THIS IS A DECISION, NOT AN INHERITANCE** (sitting 2, F8). Stamping on every
 * authenticated request puts one `UPDATE` on `delegated_tokens` in front of every call an
 * agent makes, which is the exact cost Decision 9 rejected a database-backed rate limiter
 * for — *"a write per request, for a control that exists to shed load"* — so accepting it
 * here silently would contradict this plan's own reasoning.
 *
 * A minute is chosen because of what the column is FOR: §20 wants a person reviewing a
 * list of tokens to see which have gone quiet, and "last used within the minute" answers
 * that as completely as "last used 400 ms ago". The comparison is free — the row is
 * already in hand from the lookup that authenticated the request — so a busy token costs
 * one write a minute instead of one per request, and an idle one still stamps its first.
 */
export const TOUCH_INTERVAL_MS = 60_000

/**
 * A bearer credential, turned into the actor it stands for — or a refusal.
 *
 * **ONE REFUSAL FOR EVERY FAILURE.** A malformed value, an id that names no row, a wrong
 * secret, a revoked token and an expired one all answer the same way, because a caller
 * who could tell them apart could enumerate which token ids exist and could read the
 * state of a credential they do not hold. `undefined` rather than a throw, so the caller
 * decides what a missing credential means.
 *
 * Its caller is `buildServer`'s one `onRequest` hook, and nothing else: routes never read
 * the header, which is the property that makes D24's central refusal possible at all.
 */
export async function tokenActor(
  db: Db,
  plaintext: string,
  now: number = Date.now(),
): Promise<TokenActor | undefined> {
  const parsed = parseToken(plaintext)
  if (parsed === undefined) return undefined
  const row = await tokenById(db, parsed.id)
  if (row === undefined) return undefined
  if (!secretMatches(parsed.secret, row.tokenHash)) return undefined
  if (row.revokedAt !== null) return undefined
  if (row.expiresAt.getTime() <= now) return undefined

  // AWAITED, not fire-and-forget: an unawaited promise is a floating promise ESLint
  // refuses, and a write that outlives the request can land after the test that reset the
  // table. See TOUCH_INTERVAL_MS for why it is conditional.
  if (row.lastUsedAt === null || now - row.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
    await touchToken(db, row.id)
  }

  return {
    credential: 'token',
    userId: row.userId,
    tokenId: row.id,
    projectId: row.projectId,
    // The stored strings, narrowed at the boundary. A capability that is no longer one of
    // the platform's simply is not in the set, so a token holding it is refused it —
    // which is the safe direction, and the only one that does not need a migration every
    // time the list changes.
    capabilities: new Set(row.capabilities as Capability[]),
    rateLimit: row.rateLimit,
  }
}

/**
 * The bearer credential in an `Authorization` header, if there is one.
 *
 * `Bearer` is case-insensitive (RFC 7235 §2.1), and a value carrying a space — a second
 * scheme, or a stray parameter — is not a bearer credential and must not be treated as
 * one. The registry realm's `Basic` (`api/routes/registry-token.ts`, outside `/v1`) does
 * not match and is left alone.
 */
export function readBearer(header: string | undefined): string | undefined {
  if (typeof header !== 'string') return undefined
  const match = /^Bearer[ \t]+(\S+)$/i.exec(header)
  return match?.[1]
}
