import { defineWorkspace } from 'vitest/config'

// Both projects root INSIDE the package. Not at the repo root: pnpm's strict
// node_modules means `pg` does not resolve from there, and the whole run dies with
// "Failed to load url pg" and `no tests` — which reads like a glob mistake and is
// not one. Rooting here also keeps every path identical to P2's own config.
const PKG = './packages/control-plane'

export default defineWorkspace([
  {
    // The fast tier. No Docker, no network — §16's highest-leverage property. It
    // DOES need Postgres.
    test: {
      name: 'unit',
      root: PKG,
      include: ['src/**/*.test.ts'],
      // Setting `exclude` REPLACES vitest's defaults, so node_modules and dist have
      // to be restated or they are scanned.
      exclude: ['**/node_modules/**', '**/dist/**', '**/*.docker.test.ts'],
      setupFiles: ['./vitest.setup.ts'],
      globalSetup: ['./vitest.global-setup.ts'],
    },
  },
  {
    test: {
      name: 'docker',
      root: PKG,
      include: ['src/**/*.docker.test.ts'],
      testTimeout: 120_000,
      hookTimeout: 120_000,
      setupFiles: ['./vitest.setup.ts'],
      // Order matters: reset the database, then assert the daemon is reachable.
      globalSetup: ['./vitest.global-setup.ts', './src/runtime/docker/tier-setup.ts'],
    },
  },
  {
    // P5a Task 7. The client and the journey: no Postgres, no Docker, no setup file.
    test: {
      name: 'packages',
      root: '.',
      include: [
        'packages/contract/src/**/*.test.ts',
        'packages/journey/src/**/*.test.ts',
        // P5c Task 2. A package not named here runs under NO project: its tests are
        // silently not run, which reads exactly like a suite that passes (Task 1, M4).
        'packages/console/src/**/*.test.ts',
        'packages/mock/src/**/*.test.ts',
        // The D5 plan's Task 4: the GitHub fake, held to GitHub's own schemas.
        'packages/github-fake/src/**/*.test.ts',
      ],
    },
  },
])
