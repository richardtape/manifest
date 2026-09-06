// Imports the GUARD, never `docker-tier.js`: a globalSetup runs in a context where
// importing `vitest` throws, and `docker-tier.ts` imports `describe`.
import { assertDockerAvailable } from './tier-guard.js'

/** Runs once, before any Docker-tier suite. Fails the whole run rather than each file. */
export default async function setup(): Promise<void> {
  await assertDockerAvailable()
}
