import { describe } from 'vitest'
import { dockerTierRequested } from './tier-guard.js'

// The guard itself lives in `tier-guard.js`, which must stay free of any `vitest`
// import so that `tier-setup.ts` (a globalSetup) can reach it. Re-exported here so
// every Docker-tier suite has one import path.
export { assertDockerAvailable, dockerTierRequested } from './tier-guard.js'

/**
 * Wraps a suite that needs a daemon. When the tier is not requested the suite is
 * skipped with the reason in its name, so a scrollback search for "docker" shows
 * what did not run.
 */
export function describeDocker(name: string, body: () => void): void {
  if (!dockerTierRequested()) {
    describe.skip(
      `${name} [skipped: set MANIFEST_TEST_DOCKER=1 to run the Docker tier]`,
      body,
    )
    return
  }
  describe(name, body)
}
