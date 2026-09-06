/**
 * The tier's decision and its guard — and NOTHING that imports `vitest`.
 *
 * `tier-setup.ts` is a vitest `globalSetup`, which runs in a different context from
 * the test workers: importing `vitest` anywhere in its import graph throws
 * "Vitest failed to access its internal state" and the whole Docker tier reports
 * `no tests` — which reads like a bad glob and is not one. So `describeDocker`,
 * which genuinely needs `describe`, lives in `docker-tier.ts` and this file stays
 * importable from both sides.
 */
import {
  EngineError,
  assertApiVersionSupported,
  createEngineClient,
  resolveSocketPath,
} from './engine.js'

export function dockerTierRequested(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.MANIFEST_TEST_DOCKER === '1'
}

/**
 * Two states, never three. Skipping when the tier was ASKED for is how a suite full
 * of security assertions stays green on a machine where none of them ran.
 */
export async function assertDockerAvailable(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (!dockerTierRequested(env)) return
  try {
    const engine = createEngineClient({ socketPath: resolveSocketPath(env) })
    await assertApiVersionSupported(engine)
  } catch (error) {
    throw new EngineError(
      'DOCKER_TIER_UNAVAILABLE',
      `MANIFEST_TEST_DOCKER=1 was set but Docker is not usable: ${(error as Error).message}`,
      'Start Docker Desktop and run `make doctor`. Unset MANIFEST_TEST_DOCKER to skip this tier ' +
        'deliberately — but note that every §12 control is asserted in it.',
    )
  }
}
