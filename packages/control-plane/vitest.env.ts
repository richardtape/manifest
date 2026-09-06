import { readFileSync } from 'node:fs'

/**
 * Derives MANIFEST_DATABASE_URL from the repo's `.env`, so `pnpm test` works from
 * a fresh shell with no exported variables.
 *
 * Task 8 introduced the first tests that need P1's Postgres, and `db/client.ts`
 * throws at import time when the variable is missing — which took the WHOLE suite
 * down, including the pure tests that need no database at all. Documenting an
 * `export` line was not enough: nothing runs it.
 *
 * The password is never hardcoded. `make seed` writes it into `.env`, and this
 * reads it from there, deriving exactly the URL the plan and RUNBOOK document. If
 * `.env` is absent the variable stays unset and `client.ts` says so plainly —
 * silence would be worse than a clear failure.
 *
 * Lives in its own file because both the per-file setup and the once-per-run
 * global setup need it, and they run in different processes.
 */
const PORT_POSTGRES = 7103
const DATABASE = 'manifest_control'

export function ensureDatabaseUrl(): string | undefined {
  if (!process.env.MANIFEST_DATABASE_URL) {
    const envPath = new URL('../../.env', import.meta.url)
    try {
      const password = readFileSync(envPath, 'utf8')
        .split('\n')
        .find((line) => line.startsWith('POSTGRES_PASSWORD='))
        ?.slice('POSTGRES_PASSWORD='.length)
        .trim()
      if (password) {
        process.env.MANIFEST_DATABASE_URL = `postgres://manifest:${password}@127.0.0.1:${PORT_POSTGRES}/${DATABASE}`
      }
    } catch {
      // No .env — leave it unset. client.ts raises the actionable error.
    }
  }
  return process.env.MANIFEST_DATABASE_URL
}
