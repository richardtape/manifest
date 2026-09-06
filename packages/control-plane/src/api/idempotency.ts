import { createHash } from 'node:crypto'
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
  body: unknown
}

export class IdempotencyConflictError extends Error {
  readonly code = 'IDEMPOTENCY_KEY_REUSED'
  constructor(key: string) {
    super(`Idempotency-Key '${key}' was already used on this route with a different body`)
    this.name = 'IdempotencyConflictError'
  }
}

function hashOf(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(body ?? null)).digest('hex')
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
  const requestHash = hashOf(params.body)

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
    if (existing.requestHash !== requestHash) throw new IdempotencyConflictError(params.key)
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
