import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // NOTE: fileParallelism lives in the ROOT vitest.config.ts. It is a root-level
    // option and has no effect here on a workspace run.
    // Runs before every test file, which is what makes `pnpm test` work from a
    // fresh shell: see vitest.setup.ts for why an exported variable was not enough.
    setupFiles: ['./vitest.setup.ts'],
    // Once per run, before any file: see vitest.global-setup.ts.
    globalSetup: ['./vitest.global-setup.ts'],
  },
})
