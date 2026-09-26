import { createHmac } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { Db } from '../db/index.js'
import { idempotencyKeys } from '../db/index.js'

export interface StoredResponse {
  status: number
  body: unknown
}

export interface IdempotencyParams {
  key: string
  userId: string
  /** `METHOD /path` — part of the key, so one key cannot span two operations. */
  route: string
  /**
   * The server-held secret the body's fingerprint is keyed with — `config.sessionSecret`, which
   * the database never holds (the authoring API plan's Task 8). REQUIRED, so `tsc` names every
   * caller: a body can BE a secret (`setAppSecret`'s is the value), and an unkeyed hash of it
   * in `idempotency_keys` lets anyone who reads the table check a guess against it.
   */
  hashKey: string
  body: unknown
}

export class IdempotencyConflictError extends Error {
  readonly code = 'IDEMPOTENCY_KEY_REUSED'
  constructor(key: string) {
    super(`Idempotency-Key '${key}' was already used on this route with a different body`)
    this.name = 'IdempotencyConflictError'
  }
}

/**
 * The body's fingerprint: an HMAC under a key the database does not hold, never a bare hash.
 * The prefix separates this use of the key from any other. Changing the key (rotating
 * `MANIFEST_SESSION_SECRET`) makes a retry that spans the change a `409 IDEMPOTENCY_KEY_REUSED`,
 * which a client resolves with a new key — the cost of the record saying nothing on its own.
 */
function hashOf(hashKey: string, body: unknown): string {
  return createHmac('sha256', hashKey)
    .update('manifest idempotency request v1\0')
    .update(JSON.stringify(body ?? null))
    .digest('hex')
}

/**
 * D23.6. Replays the stored response for a repeated key, refuses a key reused with a
 * different body, and stores nothing when the handler throws — a failed request must
 * be retryable with the same key, or a network blip becomes a permanent failure.
 */
export async function replayOrStore(
  db: Db,
  params: IdempotencyParams,
  handler: () => Promise<StoredResponse>,
): Promise<StoredResponse> {
  const requestHash = hashOf(params.hashKey, params.body)

  const [existing] = await db
    .select()
    .from(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.key, params.key),
        eq(idempotencyKeys.userId, params.userId),
        eq(idempotencyKeys.route, params.route),
      ),
    )

  if (existing) {
    if (existing.requestHash !== requestHash)
      throw new IdempotencyConflictError(params.key)
    return { status: existing.responseStatus, body: existing.responseBody }
  }

  const response = await handler()

  await db
    .insert(idempotencyKeys)
    .values({
      key: params.key,
      userId: params.userId,
      route: params.route,
      requestHash,
      responseStatus: response.status,
      responseBody: response.body as object,
    })
    .onConflictDoNothing()

  return response
}
