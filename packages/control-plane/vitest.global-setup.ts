import { mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'
import { ensureDatabaseUrls } from './vitest.env.js'

/** Must match TEST_REPOS_ROOT in src/api/testing.ts — different process, same path. */
const TEST_REPOS_ROOT = join(tmpdir(), 'manifest-test-repos')

/**
 * Truncates the §6 tables once, before any test file runs.
 *
 * `withRollback` isolates a test from its OWN writes, not from rows something else
 * already committed — a leftover `chem-labs` from an interrupted run made three
 * suites fail on a unique violation, and those suites had only ever been green
 * because the database happened to be empty. Verified by inserting that row by
 * hand and watching them go red.
 *
 * This makes a run independent of the state it starts in. The API tests, which
 * commit for real, additionally reset between their own tests.
 */
const TABLES = [
  'audit.incidents',
  'audit.events',
  'audit.build_logs',
  'secrets',
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

export async function setup(): Promise<() => Promise<void>> {
  // Start from an empty repository root as well as an empty database. The API
  // tests create one directory per test and cannot clean up after themselves —
  // they have no teardown hook — so it is removed here, both before and after.
  await rm(TEST_REPOS_ROOT, { recursive: true, force: true })
  await mkdir(TEST_REPOS_ROOT, { recursive: true })

  // ensureDatabaseUrls() returns the APPLICATION url; this needs the admin one.
  // manifest_app holds no TRUNCATE on audit.events (§20), which is the control,
  // so the harness's own reset cannot go through the connection under test.
  const connectionString = ensureDatabaseUrls() && process.env.MANIFEST_ADMIN_DATABASE_URL
  if (connectionString) {
    const pool = new pg.Pool({ connectionString })
    try {
      await pool.query(`TRUNCATE TABLE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`)
    } catch (error) {
      // `42P01 undefined_table` means the schema is not there — almost always
      // because `make reset` has just dropped `manifest-pgdata`, which is what it
      // is for. The raw pg error is `relation "idempotency_keys" does not exist`,
      // which names neither the cause nor the remedy and stops the WHOLE run
      // before a single test file loads, including the 30-odd files that need no
      // database at all. Measured 2026-09-07, immediately after a reset.
      if ((error as { code?: string }).code === '42P01') {
        throw new Error(
          'the control-plane database has no schema — migrations have not been ' +
            'applied to it. `make reset` drops it deliberately. Run:\n\n' +
            '  set -a; . ./.env; set +a\n' +
            '  export MANIFEST_ADMIN_DATABASE_URL=' +
            '"postgres://manifest:${POSTGRES_PASSWORD}@127.0.0.1:7103/manifest_control"\n' +
            '  pnpm --filter @manifest/control-plane db:migrate\n',
        )
      }
      throw error
    } finally {
      await pool.end()
    }
  }
  // db/client.ts raises the actionable error if the URL was missing.

  return async () => {
    await rm(TEST_REPOS_ROOT, { recursive: true, force: true })
  }
}
