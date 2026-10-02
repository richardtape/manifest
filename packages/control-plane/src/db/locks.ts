import { lockPool } from './client.js'

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
 * connection for the length of its deploy — from `lockPool`, NEVER from `pool`, which its own
 * work queries through. This said the pool's size "bounds how many DIFFERENT environments can
 * deploy at once"; on one pool it did not bound them, it DEADLOCKED them: ten holders took every
 * connection and each waited for another (the launch path plan's sitting 12, F1 — the boot's retire
 * passes, one per environment, all at once). `lockPool`'s size now bounds the holders, and the rest
 * wait in its queue; a real queue still belongs with Phase 4's reconciler.
 */
export async function withEnvironmentLock<T>(
  environmentId: string,
  fn: () => Promise<T>,
): Promise<T> {
  return withAdvisoryLock(`manifest:environment:${environmentId}`, fn)
}

/**
 * One archive, restore or delete per PROJECT at a time (§11's *Ending an app*; the front-end
 * enablement plan's Task 11) — `withEnvironmentLock`'s shape exactly, under its own key, so a
 * project and an environment that happened to share an id could never wait on each other.
 *
 * **LOCK ORDER IS ALWAYS PROJECT, THEN ENVIRONMENT.** An archive takes this, then each
 * environment's lock in turn; a deploy takes only the environment's. Nothing takes them the other
 * way round, so the two cannot deadlock.
 */
export async function withProjectLock<T>(
  projectId: string,
  fn: () => Promise<T>,
): Promise<T> {
  return withAdvisoryLock(`manifest:project:${projectId}`, fn)
}

/**
 * One D21 REHEARSAL per project at a time — and a second is REFUSED, never queued (the launch path
 * plan's Task 6c; the faculty front-end's FE-43: a reload or a second tab offered a second run
 * beside one under way). `undefined` when another holder has it; otherwise `fn`'s answer, the lock
 * held for the whole of `fn` on its own connection and released in a `finally`.
 *
 * **A TRY-LOCK, because waiting is the wrong answer**: a second press queued behind the first would
 * deploy, probe and take down again for nobody, and the person who pressed twice learns nothing.
 * In Postgres rather than in this process for `withEnvironmentLock`'s reason — and because a session
 * lock ends with its connection, a control plane that dies mid-rehearsal leaves no lock behind.
 *
 * Its own key, so it can never wait on — or be waited on by — a project's or an environment's lock:
 * it is taken first, before the rehearsal's deploy takes the environment's, and it never waits.
 */
export async function tryWithRehearsalLock<T>(
  projectId: string,
  fn: () => Promise<T>,
): Promise<T | undefined> {
  const key = `manifest:rehearsal:${projectId}`
  const client = await lockPool.connect()
  try {
    const { rows } = await client.query<{ held: boolean }>(
      'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS held',
      [key],
    )
    if (rows[0]?.held !== true) return undefined
    try {
      return await fn()
    } finally {
      await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [key])
    }
  } finally {
    client.release()
  }
}

async function withAdvisoryLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const client = await lockPool.connect()
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
