import { expect, it } from 'vitest'

// Task 3 replaces this file entirely with the real import boundary. Until then it states
// the one thing Task 2 made true: `vitest.workspace.ts` names this package, so a test in
// it actually runs. Task 1's M4 measured that a failing test in an unlisted package is
// silently green, and Step 8 watched this file go red the moment the globs landed.
it('is seen by pnpm test', () => {
  expect(1 + 1).toBe(2)
})
