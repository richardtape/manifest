import type { Pool } from 'pg'

/**
 * The harness's TRUNCATE, retried when the lock it needs is someone else's (the gentler test tiers
 * plan, Rich's yes of 2026-10-14).
 *
 * A test that times out does not stop: Vitest fails it and moves on, and the work it started — a
 * retire pass, a build — runs on into the next test's reset. If that work holds a lock the TRUNCATE
 * needs and then asks for one the TRUNCATE holds, Postgres ends one of them with `40P01 deadlock
 * detected`; when it chooses the TRUNCATE, the NEXT test went red for the first one's sake (TRAPS:
 * `deadlock detected` INSIDE `resetDatabase`). And a TRUNCATE that only waits holds every lock it has
 * taken while it does — the pool's `lock_timeout` ends it with `55P03` instead (db/testing.ts).
 *
 * So both are retried, three attempts in all, each logged. The test that timed out stays red — Vitest
 * failed it already — and anything else is thrown at once. It never ends another connection: the
 * running control plane on 7100 uses this database, and a worker whose client is killed
 * mid-transaction crashes.
 *
 * Imports no database client, so the once-per-run global setup can use it too.
 */
export const RETRYABLE_TRUNCATE_CODES: ReadonlySet<string> = new Set(['40P01', '55P03'])
export const TRUNCATE_ATTEMPTS = 3

const MEANING: Record<string, string> = {
  '40P01': 'deadlock detected',
  '55P03': 'lock not available within the lock budget',
}

export async function truncateWithRetry(
  pool: Pool,
  tables: readonly string[],
  log: (line: string) => void = (line) => console.error(line),
): Promise<void> {
  const statement = `TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY CASCADE`
  for (let attempt = 1; ; attempt += 1) {
    try {
      await pool.query(statement)
      return
    } catch (error) {
      const code = (error as { code?: string }).code
      if (code === undefined || !RETRYABLE_TRUNCATE_CODES.has(code)) throw error
      if (attempt === TRUNCATE_ATTEMPTS) {
        log(
          `[test harness] resetDatabase: the TRUNCATE failed with ${code} (${MEANING[code]}) on attempt ` +
            `${attempt} of ${TRUNCATE_ATTEMPTS} — giving up; the hook fails with it.`,
        )
        throw error
      }
      const pause = 100 * attempt
      log(
        `[test harness] resetDatabase: the TRUNCATE failed with ${code} (${MEANING[code]}), attempt ` +
          `${attempt} of ${TRUNCATE_ATTEMPTS} — retrying in ${pause} ms. Work an earlier test started ` +
          'still holds a lock; if that test timed out, its own red stands.',
      )
      await new Promise((resolve) => setTimeout(resolve, pause))
    }
  }
}
