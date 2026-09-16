import { pool } from './client.js'

/**
 * One deploy or retire per environment at a time (§11: "one reconciliation loop per
 * project, serialized"; Phase 1 does it in a straight line).
 *
 * ON ONE CONNECTION, taken from the pool and released in a `finally`: a session-level
 * advisory lock belongs to the connection that took it, and `pool.query` would take it
 * on one connection and release it on another — which leaves the lock held for the life
 * of the process and unlocks something nobody took. Not `pg_advisory_xact_lock`, which
 * would need the whole deploy inside one transaction, and a deploy's writes and
 * published events are not.
 *
 * NOT an in-process mutex: `pnpm test` and a running control plane are two processes
 * against one database, and only Postgres sees both.
 *
 * WHAT IT COSTS, stated rather than discovered (Decision 14): each holder keeps one
 * pooled connection for the length of its deploy, so the pool's size bounds how many
 * DIFFERENT environments can deploy at once — `pg.Pool`'s default maximum is 10. One
 * developer's laptop is nowhere near that; a queue belongs with Phase 4's reconciler,
 * and §20's *Availability* already bounds builds the same way.
 */
export async function withEnvironmentLock<T>(
  environmentId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const key = `manifest:environment:${environmentId}`
  const client = await pool.connect()
  try {
    await client.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [key])
    try {
      return await fn()
    } finally {
      // On the SAME client, and in a `finally`: a deploy that throws still has to let
      // the next one in, and a session-level lock outlives the failure otherwise.
      await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [key])
    }
  } finally {
    client.release()
  }
}
