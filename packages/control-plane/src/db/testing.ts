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
        name: `fixture-${unique}`,
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
  // P5b Task 3, AND BELT AND BRACES RATHER THAN THE CONTROL — the same status as
  // `routes` above, measured the same way. 2026-09-17: both tables reference `projects`,
  // so the CASCADE on this statement already empties them with neither named — Postgres
  // prints `truncate cascades to table "delegated_tokens"` and `"pending_actions"` — and
  // the reverse order succeeds too, because one TRUNCATE takes them all at once. The
  // plan's self-review expected a second `pnpm test` run to catch one list moving without
  // the other; it does not, and cannot, so this is here only so the reset does not depend
  // on a foreign key staying as it is. `pending_actions` is named first of the two anyway,
  // being the referencing side, for a reader who arrives when that is no longer free.
  // The front-end enablement plan's Task 10: references `projects`, `users` and `delegated_tokens`
  // with NO cascade, so it must go before all three — named, as `routes` is.
  'agent_sessions',
  // FE-1 (sitting 7): references `users` with NO cascade — named, and before `users`.
  'intake_sessions',
  'pending_actions',
  'delegated_tokens',
  'project_members',
  // The D5 plan's Task 8: references `projects` ON DELETE cascade, so the CASCADE empties it
  // unnamed — named anyway, as belt and braces, like `routes`.
  'source_repositories',
  // The D5 plan's Task 9: references nothing, so NAMED — the CASCADE cannot reach it.
  'webhook_deliveries',
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

/**
 * Background work a test started and did not await (launch path plan Task 3, F26).
 *
 * A deploy schedules a retire pass and returns; the pass runs on after the test that
 * started it. If the next test's `resetDatabase` truncates while that pass is inside its
 * own transaction, Postgres finds a lock cycle and one side dies with `deadlock detected`
 * (P6b sitting 4's F7: about one `delivery.test.ts` run in eight went red). Everything
 * that starts such work registers its `idle` here, and `resetDatabase` drains first.
 *
 * The drain CLEARS the set, so work registered before a reset is drained by that reset
 * and then forgotten: deps built in a `beforeAll` must register again (or be built per
 * test) if their retirer runs after the first reset. `auth-page.test.ts` builds that way
 * and retires nothing, so it costs nothing today.
 */
const backgroundWork = new Set<() => Promise<void>>()

export function registerBackgroundWork(idle: () => Promise<void>): void {
  backgroundWork.add(idle)
}

export async function drainBackgroundWork(): Promise<void> {
  const pending = [...backgroundWork]
  backgroundWork.clear()
  const settled = await Promise.allSettled(pending.map((idle) => idle()))
  for (const result of settled) {
    if (result.status === 'rejected') {
      console.error(
        '[test harness] background work rejected while draining:',
        result.reason,
      )
    }
  }
}

export async function resetDatabase(): Promise<void> {
  await drainBackgroundWork()
  await admin().query(`TRUNCATE TABLE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`)
}
