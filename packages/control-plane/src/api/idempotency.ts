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
   * The request's PATH PARAMETERS, fingerprinted with the body (the authoring API plan's final
   * review, Important 2). `route` is the TEMPLATE, so without them one key on
   * `PUT …/{environmentId}/secrets/{name}` for another environment or another name — a body of
   * only `{ value }`, or a `DELETE` with none — was the same request, and was answered the
   * FIRST resource's result while nothing happened to the second. REQUIRED, so `tsc` names
   * every caller.
   */
  params: unknown
  /**
   * The server-held secret the body's fingerprint is keyed with — `config.sessionSecret`, which
   * the database never holds (the authoring API plan's Task 8). REQUIRED, so `tsc` names every
   * caller: a body can BE a secret (`setAppSecret`'s is the value), and an unkeyed hash of it
   * in `idempotency_keys` lets anyone who reads the table check a guess against it.
   */
  hashKey: string
  body: unknown
}

/**
 * A ROUTE WHOSE ANSWER CARRIES A CREDENTIAL IS NEVER REPLAYED (the authoring API plan's Task 12,
 * its sitting 5's F4, Rich's option (a)). The record keeps `stored(answer)` — the answer WITHOUT
 * the credential — and a repeated key with the same body throws `refuse(stored)` rather than
 * answer again. `mintToken` is the one route that declares it: its answer is a delegated token's
 * plaintext secret, which D24 says is shown once, and a table nothing prunes is not "once".
 */
export interface WithholdOnReplay {
  stored: (answer: unknown) => unknown
  refuse: (stored: unknown) => Error
}

export class IdempotencyConflictError extends Error {
  readonly code = 'IDEMPOTENCY_KEY_REUSED'
  constructor(key: string) {
    super(
      `Idempotency-Key '${key}' was already used on this route for a different request — another resource in the path, or a different body`,
    )
    this.name = 'IdempotencyConflictError'
  }
}

/**
 * The request's fingerprint — its path parameters and its body — as an HMAC under a key the
 * database does not hold, never a bare hash. The prefix separates this use of the key from any
 * other, and its version from v1's body-only fingerprint. Changing either (rotating
 * `MANIFEST_SESSION_SECRET`, or v1 → v2) makes a retry that spans the change a `409
 * IDEMPOTENCY_KEY_REUSED`, which a client resolves with a new key — the cost of the record saying
 * nothing on its own.
 */
function hashOf(hashKey: string, params: unknown, body: unknown): string {
  return createHmac('sha256', hashKey)
    .update('manifest idempotency request v2\0')
    .update(JSON.stringify({ params: params ?? null, body: body ?? null }))
    .digest('hex')
}

/**
 * D23.6. Replays the stored response for a repeated key, refuses a key reused for a
 * different request (another resource in the path, or a different body), and stores nothing when the handler throws — a failed request must
 * be retryable with the same key, or a network blip becomes a permanent failure.
 */
export async function replayOrStore(
  db: Db,
  params: IdempotencyParams,
  handler: () => Promise<StoredResponse>,
  withhold?: WithholdOnReplay,
): Promise<StoredResponse> {
  const requestHash = hashOf(params.hashKey, params.params, params.body)

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
    // THE FINGERPRINT FIRST, for every route: a key reused for a different request is that
    // refusal whatever the route withholds.
    if (existing.requestHash !== requestHash)
      throw new IdempotencyConflictError(params.key)
    if (withhold !== undefined) throw withhold.refuse(existing.responseBody)
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
      responseBody: (withhold === undefined
        ? response.body
        : withhold.stored(response.body)) as object,
    })
    .onConflictDoNothing()

  return response
}
