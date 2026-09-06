import pg from 'pg'
import { ensureDatabaseUrl } from './vitest.env.js'

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

export async function setup(): Promise<void> {
  const connectionString = ensureDatabaseUrl()
  if (!connectionString) return // db/client.ts raises the actionable error.
  const pool = new pg.Pool({ connectionString })
  try {
    await pool.query(`TRUNCATE TABLE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`)
  } finally {
    await pool.end()
  }
}
