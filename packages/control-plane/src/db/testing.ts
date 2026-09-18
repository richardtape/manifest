import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { db } from './client.js'
import type { Db } from './client.js'
import { projects, users } from './schema.js'

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
 * A rolled-back transaction that already holds an owner and a project.
 *
 * Everything scoped to a project — a Secret, and from P4a Task 8 an Event —
 * needs a real `projects.id` because the foreign key is real. Building those two
 * rows by hand in each test file is how the rows drift apart, and a unique slug
 * per call is what keeps the fixture usable twice in one file: `projects_slug_key`
 * is unique, and two tests reaching for `chem-labs` is a 500 that reads as a bug
 * in the code under test (P2 paid for that one).
 */
export async function withProject(
  fn: (tx: Db, ctx: { projectId: string; ownerId: string }) => Promise<void>,
): Promise<void> {
  await withRollback(async (tx) => {
    const unique = randomUUID().slice(0, 8)
    const [owner] = await tx
      .insert(users)
      .values({
        ubcCwlPuid: `puid-${unique}`,
        email: `owner-${unique}@example.ubc.ca`,
        displayName: 'Test Owner',
      })
      .returning()
    const [project] = await tx
      .insert(projects)
      .values({
        slug: `fixture-${unique}`,
        ownerId: owner!.id,
        blueprintRef: 'fixture-node@1',
      })
      .returning()
    await fn(tx, { projectId: project!.id, ownerId: owner!.id })
  })
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
  // P4b Task 13, for the reason `audit.build_logs` is named below: `instances` refuses
  // a delete while an Incident references it (ON DELETE restrict), and manifest_app
  // cannot truncate it either.
  'audit.incidents',
  'audit.events',
  // P4b Task 11. Named for the same reason as the line above: `builds` refuses a
  // delete while a log line references it (ON DELETE restrict), and manifest_app
  // cannot truncate it either.
  'audit.build_logs',
  'secrets',
  'idempotency_keys',
  // P4c Task 6. NAMED EXPLICITLY, AND THAT IS BELT AND BRACES RATHER THAN THE
  // CONTROL. Measured 2026-09-15: `routes` references `instances`, so the CASCADE on
  // the statement below already empties it — Postgres prints `truncate cascades to
  // table "routes"` — and a run with this line removed is still repeatable. It is
  // here so the reset does not depend on a foreign key staying as it is, which is the
  // sort of thing a later migration changes silently.
  'routes',
  'instances',
  'service_instances',
  'releases',
  'builds',
  'app_specs',
  'environments',
  // P5b Task 3. `pending_actions` references `delegated_tokens` ON DELETE restrict, so
  // it is named FIRST of the two, and both before `projects` and `users`, which they
  // cascade from — the same ordering trap `audit.role_changes` sprang in P5a sitting 11.
  // The control for the two lists disagreeing is a SECOND `pnpm test` run, not the first.
  'pending_actions',
  'delegated_tokens',
  'project_members',
  'projects',
  // P5a Task 16. BEFORE `users`, and named for the reason `audit.incidents` is: a role
  // change references a user ON DELETE restrict, and manifest_app cannot truncate it.
  'audit.role_changes',
  'users',
]

/**
 * The harness's own connection, which is NOT the one the code under test uses.
 *
 * `db` connects as `manifest_app`, which by §20 holds no `TRUNCATE` on
 * `audit.events` — that is the control, and a reset performed through it would
 * fail. It is also why `audit.events` is first in the list above: `projects` now
 * refuses a delete while an event references it (`ON DELETE restrict`, which
 * closes the cascade route around the grant), so the audit rows have to go in the
 * same statement. `TRUNCATE` takes them all at once, which is why this is one
 * statement and not eleven.
 *
 * Lazily created: the pure test files never call `resetDatabase`, and opening a
 * pool at import time would make every one of them need a database.
 */
let adminPool: pg.Pool | undefined
function admin(): pg.Pool {
  const connectionString = process.env.MANIFEST_ADMIN_DATABASE_URL
  if (!connectionString) {
    throw new Error(
      'MANIFEST_ADMIN_DATABASE_URL is not set. The test harness needs a connection ' +
        'that CAN truncate — `db` connects as manifest_app, which by §20 cannot ' +
        'touch audit.events. vitest.env.ts derives it from `.env`.',
    )
  }
  adminPool ??= new pg.Pool({ connectionString })
  return adminPool
}

export async function resetDatabase(): Promise<void> {
  await admin().query(`TRUNCATE TABLE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`)
}
