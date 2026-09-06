import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Runs before every test file, which is what makes `pnpm test` work from a
    // fresh shell: see vitest.setup.ts for why an exported variable was not enough.
    setupFiles: ['./vitest.setup.ts'],
  },
})
