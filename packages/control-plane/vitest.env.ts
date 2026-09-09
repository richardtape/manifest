import { readFileSync } from 'node:fs'

/**
 * Derives MANIFEST_DATABASE_URL, MANIFEST_ADMIN_DATABASE_URL and
 * MANIFEST_IDP_DATABASE_URL from the repo's `.env`, so `pnpm test` works from a
 * fresh shell with no exported variables.
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

function envValue(name: string): string | undefined {
  const envPath = new URL('../../.env', import.meta.url)
  try {
    return readFileSync(envPath, 'utf8')
      .split('\n')
      .find((line) => line.startsWith(`${name}=`))
      ?.slice(name.length + 1)
      .trim()
  } catch {
    // No .env — leave the variables unset. client.ts raises the actionable error.
    return undefined
  }
}

/**
 * Sets all three database URLs, and returns the control plane's.
 *
 * THE SUITE RUNS AS `manifest_app`, NOT AS `manifest`, and that is the point
 * rather than tidiness. §20's events table is append-only by grant, and a grant
 * is only observable from the role it constrains: run the tests as the superuser
 * `manifest` and the append-only test passes on a table anyone can rewrite —
 * measured before this changed, `REVOKE UPDATE, DELETE` followed by `UPDATE 1`.
 * Running the whole suite as the application role also means every one of the
 * other tests exercises the privileges the running control plane actually has,
 * so a missing grant surfaces here rather than in `make demo`.
 *
 * MANIFEST_ADMIN_DATABASE_URL is the harness's own connection, for the two jobs
 * the application role deliberately cannot do: `TRUNCATE` between tests, and
 * `drizzle-kit migrate`. It is never read by `src/`.
 */
export function ensureDatabaseUrls(): string | undefined {
  if (
    process.env.MANIFEST_DATABASE_URL &&
    process.env.MANIFEST_ADMIN_DATABASE_URL &&
    process.env.MANIFEST_IDP_DATABASE_URL
  ) {
    return process.env.MANIFEST_DATABASE_URL
  }
  const password = envValue('POSTGRES_PASSWORD')
  const appPassword = envValue('MANIFEST_APP_PASSWORD') ?? 'change-me-locally'
  if (password) {
    const url = (role: string, secret: string, database: string) =>
      `postgres://${role}:${secret}@127.0.0.1:${PORT_POSTGRES}/${database}`
    process.env.MANIFEST_DATABASE_URL ??= url('manifest_app', appPassword, DATABASE)
    process.env.MANIFEST_ADMIN_DATABASE_URL ??= url('manifest', password, DATABASE)
    // The IdP database has its own roles (`ssp_ro` reads, `manifest` writes) and
    // no `manifest_app` at all — sso/ writes SP metadata, which is an
    // administrative act on somebody else's schema.
    process.env.MANIFEST_IDP_DATABASE_URL ??= url('manifest', password, IDP_DATABASE)
  }
  return process.env.MANIFEST_DATABASE_URL
}
