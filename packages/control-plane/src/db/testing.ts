import { sql } from 'drizzle-orm'
import { db } from './client.js'
import type { Db } from './client.js'

class Rollback extends Error {}

export async function withRollback(fn: (tx: Db) => Promise<void>): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await fn(tx as unknown as Db)
      throw new Rollback()
    })
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }
}

/**
 * Every table, in one statement, for tests that cannot use `withRollback`.
 *
 * The API tests drive a real Fastify server, so their writes go through the shared
 * `db` connection rather than a transaction anyone could roll back. Without this
 * they collided on `projects.slug` — the second test in a file creating `chem-labs`
 * got a unique violation and a 500 — and `pnpm test` was not repeatable, because
 * the first run left the row behind for the second to trip over.
 *
 * TRUNCATE rather than DELETE so identity sequences reset too, and CASCADE because
 * the §6 tables reference each other. `vitest.config.ts` disables file parallelism
 * so this cannot run while another file holds a transaction open.
 */
const TABLES = [
  'idempotency_keys',
  'instances',
  'service_instances',
  'releases',
  'builds',
  'app_specs',
  'environments',
  'project_members',
  'projects',
  'users',
]

export async function resetDatabase(): Promise<void> {
  await db.execute(
    sql.raw(`TRUNCATE TABLE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`),
  )
}
