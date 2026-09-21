import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * §13's *Integrity of the gate* is five claims (P6a Task 16). Tasks 10 and 15 BUILT two of
 * them; P1 and P3 built two more long before anything asserted them. Each is now falsifiable,
 * and this is where a reader finds which test holds which — because the assertions live next
 * to the fixtures they need rather than in one file, and an index that is not in the tree is
 * an index nobody keeps.
 *
 * | §13's claim | Asserted by |
 * |---|---|
 * | Approval binds an immutable digest | `approval.test.ts` *approves a release, binds its digest…* — the BUILD's digest, not a release id |
 * | Deployment verifies it before starting anything | `releases.test.ts` *the approved digest (§13)* — four refusals, and *leaves no instance row behind* |
 * | The registry rejects pushes from app and sandbox contexts | `api/registry-token.docker.test.ts`, against the REAL registry, with its positive control; `make verify`'s *the registry's realm is the control plane's* |
 * | The approval record is non-repudiable | THIS FILE (no code path edits one); `releases.test.ts` *the one path that deletes a project cannot reach an approval*; `approval.test.ts` *two decisions leave TWO rows* |
 * | Images built on a laptop never reach UBC infrastructure | `promotion.test.ts` (the rule); `releases.test.ts` *the laptop-image rule holds for PRODUCTION* (the rule where it matters) |
 *
 * **NON-REPUDIABILITY IS A PROPERTY OF THE CODE, NOT OF THE DATABASE — measured 2026-09-20.**
 * `manifest_app` holds `UPDATE` and `DELETE` on `public.approvals` (and not `TRUNCATE`),
 * where it holds only `SELECT` and `INSERT` on `audit.events`. So the guarantee below is that
 * nothing in the control plane issues either statement, and a database-level guarantee — a
 * `REVOKE UPDATE, DELETE ON approvals FROM manifest_app` beside the audit grant — is a
 * hardening item this plan names and does not build (P6a sitting 10, F2).
 */

const SRC = new URL('..', import.meta.url).pathname

/** Production source only: tests and `testing.ts` helpers may truncate whatever they like. */
async function productionSources(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const out: string[] = []
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) out.push(...(await productionSources(full)))
    else if (
      e.name.endsWith('.ts') &&
      !e.name.endsWith('.test.ts') &&
      e.name !== 'testing.ts'
    )
      out.push(full)
  }
  return out
}

/**
 * Comments out, code in. Block comments, then line comments that are not the `//` of a URL
 * — this file's own doc comment names the statement it forbids, and so could any other.
 */
const stripComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

/** Every file in which `pattern` matches the code, relative to `src/`. */
async function filesWhoseCodeMatches(pattern: RegExp): Promise<string[]> {
  const hits: string[] = []
  for (const file of await productionSources(SRC)) {
    const code = stripComments(await readFile(file, 'utf8'))
    if (pattern.test(code)) hits.push(relative(SRC, file))
  }
  return hits.sort()
}

describe('§13: the approval record is non-repudiable — no code path edits one', () => {
  it('the scan sees the ONE place an approval is written — the positive control', async () => {
    /**
     * **FIRST, AND NOT OPTIONAL** (P5c F16, in the shape a structural test takes). A scan
     * that read no files, or a pattern that could not match drizzle's call shape, would
     * report *no update path* on any codebase. This is the same scan finding the insert it
     * must find, in the file that must hold it and nowhere else.
     */
    expect(await filesWhoseCodeMatches(/\.insert\(\s*approvals\b/)).toEqual([
      'releases/approval.ts',
    ])
  })

  it('nothing updates or deletes an approval — through drizzle or in raw SQL', async () => {
    /**
     * *"Approval is a non-repudiable record: actor, timestamp, and the exact diff shown at
     * decision time."* A STRUCTURAL assertion, deliberately: the guarantee is that the code
     * cannot edit a record, and a test that tried an `UPDATE` would be testing Postgres —
     * which, measured, would let it (this file's header). The plan's snippet asserted that
     * the module exports no `updateApproval`, which a function of any other name, in any
     * other module, would satisfy.
     */
    expect(await filesWhoseCodeMatches(/\.(update|delete)\(\s*approvals\b/)).toEqual([])
    expect(
      await filesWhoseCodeMatches(
        /\b(UPDATE|DELETE\s+FROM)\s+("?public"?\.)?"?approvals\b/i,
      ),
    ).toEqual([])
  })
})
