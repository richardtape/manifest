import { mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'
import { ensureDatabaseUrl } from './vitest.env.js'

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

  const connectionString = ensureDatabaseUrl()
  if (connectionString) {
    const pool = new pg.Pool({ connectionString })
    try {
      await pool.query(`TRUNCATE TABLE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`)
    } finally {
      await pool.end()
    }
  }
  // db/client.ts raises the actionable error if the URL was missing.

  return async () => {
    await rm(TEST_REPOS_ROOT, { recursive: true, force: true })
  }
}
