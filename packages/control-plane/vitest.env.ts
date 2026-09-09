import { readFileSync } from 'node:fs'

/**
 * Derives MANIFEST_DATABASE_URL and MANIFEST_IDP_DATABASE_URL from the repo's
 * `.env`, so `pnpm test` works from a fresh shell with no exported variables.
 *
 * Task 8 introduced the first tests that need P1's Postgres, and `db/client.ts`
 * throws at import time when the variable is missing — which took the WHOLE suite
 * down, including the pure tests that need no database at all. Documenting an
 * `export` line was not enough: nothing runs it.
 *
 * The password is never hardcoded. `make seed` writes it into `.env`, and this
 * reads it from there, deriving exactly the URLs the plan and RUNBOOK document. If
 * `.env` is absent the variables stay unset and `client.ts` says so plainly —
 * silence would be worse than a clear failure.
 *
 * The two URLs are derived SIDE BY SIDE here and never one from the other: the
 * control plane keeps them as two independent settings (P4a Decision 13), and a
 * test helper that derived one from the other would be testing a shape the
 * running system deliberately does not have.
 *
 * Lives in its own file because both the per-file setup and the once-per-run
 * global setup need it, and they run in different processes.
 */
const PORT_POSTGRES = 7103
const DATABASE = 'manifest_control'
const IDP_DATABASE = 'manifest_idp'

function postgresPassword(): string | undefined {
  const envPath = new URL('../../.env', import.meta.url)
  try {
    return readFileSync(envPath, 'utf8')
      .split('\n')
      .find((line) => line.startsWith('POSTGRES_PASSWORD='))
      ?.slice('POSTGRES_PASSWORD='.length)
      .trim()
  } catch {
    // No .env — leave the variables unset. client.ts raises the actionable error.
    return undefined
  }
}

/** Sets both database URLs, and returns the control plane's. */
export function ensureDatabaseUrls(): string | undefined {
  if (process.env.MANIFEST_DATABASE_URL && process.env.MANIFEST_IDP_DATABASE_URL) {
    return process.env.MANIFEST_DATABASE_URL
  }
  const password = postgresPassword()
  if (password) {
    const url = (database: string) =>
      `postgres://manifest:${password}@127.0.0.1:${PORT_POSTGRES}/${database}`
    process.env.MANIFEST_DATABASE_URL ??= url(DATABASE)
    process.env.MANIFEST_IDP_DATABASE_URL ??= url(IDP_DATABASE)
  }
  return process.env.MANIFEST_DATABASE_URL
}
