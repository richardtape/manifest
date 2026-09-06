import { defineConfig } from 'vitest/config'

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
 */
export default defineConfig({
  test: { fileParallelism: false },
})
