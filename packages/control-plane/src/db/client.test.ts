import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The connection hint `db/client.ts` prints when `MANIFEST_DATABASE_URL` is missing
 * (P5b Task 1, F1).
 *
 * WHY THIS IS A TEST AND NOT A COMMENT. Until 2026-09-17 the hint told the reader to
 * connect as `manifest` — which is `POSTGRES_USER` and therefore a SUPERUSER. A
 * superuser bypasses every grant, which is precisely what made §20's append-only
 * `audit` schema unimplementable (P4a session 5, the plan's costliest single finding).
 * Anybody who hit the error and followed its own advice got a platform that boots,
 * serves and passes its tests with the audit control silently disabled: green, and
 * wrong. Nothing in the four gates could see it, because a string in an error message
 * is not type-checked, linted or executed.
 *
 * RUNBOOK's *Running the control plane* is the other copy of this line (it moved there from `README.md` on
 * 2026-09-24) and the two must agree, so the drift
 * itself is what is asserted — the same shape as `spec/injection-drift.test.ts`.
 */
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const CLIENT = join(REPO_ROOT, 'packages/control-plane/src/db/client.ts')
const RUNBOOK = join(REPO_ROOT, 'docs/superpowers/RUNBOOK.md')

/** The role in a `postgres://<role>:` URL assigned to MANIFEST_DATABASE_URL. */
function roleInDatabaseUrl(source: string): string | undefined {
  return /MANIFEST_DATABASE_URL="postgres:\/\/([A-Za-z_][A-Za-z0-9_]*):/.exec(source)?.[1]
}

describe('the missing-MANIFEST_DATABASE_URL hint names the app role, never the superuser', () => {
  it('names `manifest_app` in the URL it tells the reader to export', () => {
    expect(roleInDatabaseUrl(readFileSync(CLIENT, 'utf8'))).toBe('manifest_app')
  })

  it("agrees with RUNBOOK's export block, which is the other copy of the same line", () => {
    expect(roleInDatabaseUrl(readFileSync(RUNBOOK, 'utf8'))).toBe('manifest_app')
  })

  it('says WHY, so a reader who has POSTGRES_PASSWORD to hand does not substitute it', () => {
    const source = readFileSync(CLIENT, 'utf8')
    expect(source).toMatch(/SUPERUSER/)
    expect(source).toMatch(/bypasses every grant/)
  })
})
