import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

/**
 * THE TRAP OF `vitest.workspace.ts`'S OWN WARNING, ONE LEVEL UP (P11's Decision 7). *"A package not
 * named here runs under NO project: its tests are silently not run, which reads exactly like a
 * suite that passes"* — and a PROJECT not named in the root `test` script is the same: `pnpm test`
 * names its projects (`--project unit --project packages …`), so a fourth project left out of it is
 * every one of this console's tests silently not run by the commit gate. This file is one of those
 * tests, so it can only fail when it is run by name — which every build sitting does.
 */
describe('admin-ui’s tests run under pnpm test', () => {
  it('the root test script names the admin-ui project', async () => {
    const pkg = JSON.parse(
      await readFile(new URL('../../../package.json', import.meta.url), 'utf8'),
    ) as { scripts: { test: string } }
    expect(pkg.scripts.test).toMatch(/--project admin-ui(\s|$)/)
  })
})
