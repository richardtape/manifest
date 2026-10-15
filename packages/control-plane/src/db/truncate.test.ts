import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { resetLockTimeoutMs, scaled } from '../test-timeouts.js'
import { RESET_TABLES, resetDatabase } from './testing.js'
import { TRUNCATE_ATTEMPTS, truncateWithRetry } from './truncate.js'

/**
 * resetDatabase survives a lock it did not cause (the gentler test tiers plan, Task 4). Every case holds a
 * lock from a second connection — the shape of a retire pass that outlived the test that started it
 * (TRAPS: `deadlock detected` INSIDE `resetDatabase`) — and truncates the real reset list, as the harness does.
 */
function adminUrl(): string {
  const url = process.env.MANIFEST_ADMIN_DATABASE_URL
  if (!url)
    throw new Error(
      'MANIFEST_ADMIN_DATABASE_URL is not set — vitest.env.ts derives it from .env',
    )
  return url
}

const pools: pg.Pool[] = []
function poolWith(lockTimeoutMs: number): pg.Pool {
  const pool = new pg.Pool({ connectionString: adminUrl(), lock_timeout: lockTimeoutMs })
  pools.push(pool)
  return pool
}
afterAll(async () => {
  await Promise.all(pools.map((pool) => pool.end()))
})
afterEach(() => {
  vi.restoreAllMocks()
})

/** Resolves once a TRUNCATE is queued behind someone's lock on `users` — the last table it locks. */
async function untilTruncateWaitsOnUsers(probe: pg.Pool): Promise<void> {
  for (let i = 0; i < 200; i += 1) {
    const { rows } = await probe.query<{ n: number }>(
      `SELECT count(*)::int AS n
         FROM pg_locks l JOIN pg_class c ON c.oid = l.relation
        WHERE l.database = (SELECT oid FROM pg_database WHERE datname = current_database())
          AND c.relname = 'users' AND l.mode = 'AccessExclusiveLock' AND NOT l.granted`,
    )
    if (rows[0]!.n > 0) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error('the TRUNCATE never queued behind the lock on users')
}

/** A settled promise's error, or undefined — so no rejection is ever left unhandled. */
const outcome = (promise: Promise<void>): Promise<unknown> =>
  promise.then(
    () => undefined,
    (error: unknown) => error,
  )

describe('truncateWithRetry', () => {
  it('retries a TRUNCATE Postgres chose as a deadlock’s victim, logging 40P01, and completes', async () => {
    const pool = poolWith(5_000)
    const holder = await pool.connect()
    const lines: string[] = []
    try {
      await holder.query('BEGIN')
      await holder.query('LOCK TABLE users IN ROW EXCLUSIVE MODE')
      const reset = outcome(
        truncateWithRetry(pool, RESET_TABLES, (line) => lines.push(line)),
      )
      await untilTruncateWaitsOnUsers(pool)
      // The cycle: the TRUNCATE holds audit.incidents and waits on users; this waits on audit.incidents.
      // The TRUNCATE has waited longer, reaches deadlock_timeout (1 s) first, and is the one ended.
      await holder.query('LOCK TABLE audit.incidents IN ROW EXCLUSIVE MODE')
      await holder.query('COMMIT')
      expect(await reset).toBeUndefined()
    } finally {
      holder.release(true)
    }
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('40P01')
    expect(lines[0]).toContain(`attempt 1 of ${TRUNCATE_ATTEMPTS}`)
  })

  it('gives up after three lock budgets with 55P03, logging every attempt', async () => {
    const pool = poolWith(300)
    const holder = await poolWith(60_000).connect()
    const lines: string[] = []
    try {
      await holder.query('BEGIN')
      await holder.query('LOCK TABLE users IN ROW EXCLUSIVE MODE')
      const error = await outcome(
        truncateWithRetry(pool, RESET_TABLES, (line) => lines.push(line)),
      )
      expect(error).toMatchObject({ code: '55P03' })
    } finally {
      holder.release(true)
    }
    // THREE by value, not TRUNCATE_ATTEMPTS: the lock budget is a quarter of a test's limit so that
    // three attempts and their pauses fit inside it (test-timeouts.ts), and a count read from the
    // constant under test could not see it change.
    expect(lines).toHaveLength(3)
    expect(lines.every((line) => line.includes('55P03'))).toBe(true)
    expect(lines[2]).toContain('giving up')
  })

  it('waits for a lock let go inside its budget, and logs nothing', async () => {
    const pool = poolWith(5_000)
    const holder = await pool.connect()
    const lines: string[] = []
    try {
      await holder.query('BEGIN')
      await holder.query('LOCK TABLE users IN ROW EXCLUSIVE MODE')
      const reset = outcome(
        truncateWithRetry(pool, RESET_TABLES, (line) => lines.push(line)),
      )
      await untilTruncateWaitsOnUsers(pool)
      await holder.query('COMMIT')
      expect(await reset).toBeUndefined()
    } finally {
      holder.release(true)
    }
    expect(lines).toEqual([])
  })

  it('throws any other failure at once, and logs nothing', async () => {
    const lines: string[] = []
    const error = await outcome(
      truncateWithRetry(poolWith(1_000), ['no_such_table_for_this_test'], (line) =>
        lines.push(line),
      ),
    )
    expect(error).toMatchObject({ code: '42P01' })
    expect(lines).toEqual([])
  })

  it('never ends another connection — 7100 shares this database', () => {
    for (const file of [
      new URL('./truncate.ts', import.meta.url),
      new URL('./testing.ts', import.meta.url),
      new URL('../../vitest.global-setup.ts', import.meta.url),
    ]) {
      expect(readFileSync(file, 'utf8')).not.toMatch(
        /pg_terminate_backend|pg_cancel_backend/,
      )
    }
  })
})

describe('resetDatabase', () => {
  it(
    'has a lock budget of its own: a lock held past three of them fails the reset with 55P03, named on stderr, before the lock is let go',
    async () => {
      const budget = resetLockTimeoutMs()
      const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const holder = await poolWith(60_000).connect()
      let letGo: Promise<unknown> = Promise.resolve()
      try {
        await holder.query('BEGIN')
        await holder.query('LOCK TABLE users IN ROW EXCLUSIVE MODE')
        // Let go well after three budgets: a reset with no budget of its own waits for this and succeeds.
        letGo = new Promise((resolve) => setTimeout(resolve, 3 * budget + 1_500)).then(
          () => outcome(holder.query('COMMIT').then(() => undefined)),
        )
        expect(await outcome(resetDatabase())).toMatchObject({ code: '55P03' })
      } finally {
        await letGo
        holder.release(true)
      }
      const logged = errors.mock.calls.map((call) => String(call[0]))
      expect(logged.filter((line) => line.includes('55P03'))).toHaveLength(
        TRUNCATE_ATTEMPTS,
      )
    },
    scaled(20_000),
  )
})
