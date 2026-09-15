import { expect } from 'vitest'

/**
 * Asserts a query failed with a specific Postgres SQLSTATE.
 *
 * `rejects.toThrow(/permission denied/i)` does NOT work here and the way it fails
 * is worth keeping: drizzle wraps every driver error in its own, whose message is
 * `Failed query: UPDATE audit.events …` and carries the real one on `.cause`. So
 * the regex matched nothing while the query was in fact being refused — a test
 * that would have gone red against a working control and green against a broken
 * one the moment somebody relaxed it to `.rejects.toThrow()`.
 *
 * The code is also the stronger assertion. `42501` is insufficient_privilege and
 * `23503` is foreign_key_violation; a message match would accept a typo'd table
 * name or a rolled-back transaction as proof of a grant.
 *
 * Shared by every `audit` table's tests (`events`, `build_logs`), because it is the
 * one helper whose subtlety has already cost a defect, and a second copy drifts.
 */
export async function expectSqlState(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  let thrown: unknown
  try {
    await promise
  } catch (error) {
    thrown = error
  }
  expect(thrown, 'the query was expected to fail and did not').toBeDefined()
  const codes: string[] = []
  for (let e = thrown; e instanceof Error; e = e.cause) {
    const found = (e as { code?: string }).code
    if (found !== undefined) codes.push(found)
  }
  expect(codes).toContain(code)
}
