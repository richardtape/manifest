import { defineConfig } from 'vitest/config'
import { BASE_TEST_TIMEOUT_MS } from './packages/control-plane/src/test-timeouts.js'

/**
 * Root options for the workspace run (`pnpm test`).
 *
 * `fileParallelism` is a root-level setting: putting it in
 * `packages/control-plane/vitest.config.ts` has no effect on a workspace run, which
 * is how the API tests came to race the `withRollback` ones. They must not, because
 * the API tests drive a real server and cannot roll back — they truncate instead
 * (db/testing.ts's resetDatabase), and a truncate landing mid-transaction in another
 * file made `pnpm test` fail differently on each run.
 *
 * Verified by removing this line and watching `pnpm test` fail on committed
 * `chem-labs` rows in three files that never create one outside a transaction.
 *
 * `slowTestThreshold` is root-level too: Vitest 2.1.9's reporters read the ROOT config's, never a
 * project's. Set to Vitest's old 5 s limit, it names — with its duration — every test the timeout
 * scale would otherwise let pass unremarked (the gentler test tiers plan); it replaces the 300 ms
 * default, so a run through a pipe lists only those. ORIENTATION §6 reviews the list at every close.
 */
export default defineConfig({
  test: { fileParallelism: false, slowTestThreshold: BASE_TEST_TIMEOUT_MS },
})
