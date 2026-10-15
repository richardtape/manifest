import { defineWorkspace } from 'vitest/config'
// The gentler test tiers plan: `unit` and `packages` take Vitest's limits multiplied by
// MANIFEST_TEST_TIMEOUT_SCALE, which scripts/test-gently.sh sets (1 when unset; a value outside 1–10
// stops the run here, naming it). The docker project keeps its own 120 s.
import { testTimeouts } from './packages/control-plane/src/test-timeouts.js'

// Both projects root INSIDE the package. Not at the repo root: pnpm's strict
// node_modules means `pg` does not resolve from there, and the whole run dies with
// "Failed to load url pg" and `no tests` — which reads like a glob mistake and is
// not one. Rooting here also keeps every path identical to P2's own config.
const PKG = './packages/control-plane'
const SCALED = testTimeouts(process.env)

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
      testTimeout: SCALED.testTimeout,
      hookTimeout: SCALED.hookTimeout,
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
      testTimeout: SCALED.testTimeout,
      hookTimeout: SCALED.hookTimeout,
    },
  },
  {
    // P11: the administrator's console. No global setup — it never touches the database, so a build
    // sitting runs it without a 7100 window. Named in package.json's `test` script
    // (src/workspace.test.ts holds that).
    test: {
      name: 'admin-ui',
      root: './packages/admin-ui',
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
      testTimeout: SCALED.testTimeout,
      hookTimeout: SCALED.hookTimeout,
    },
  },
])
