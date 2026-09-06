/**
 * The runtime module's public surface FOR TESTS. P2 Task 1's boundary rule allows
 * exactly two entry points per module — `index.ts` for production code and
 * `testing.ts` for test helpers — and keeping these out of `index.ts` keeps them
 * out of the shipped bundle.
 *
 * Anything another module's tests need from `runtime/` comes through here.
 * `runtime/docker/testing.ts` is one level deeper and is NOT importable from
 * outside this module; the boundary test enforces that.
 */
export {
  describeDocker,
  dockerTierRequested,
  assertDockerAvailable,
} from './docker/docker-tier.js'
export { testIssuer } from './docker/testing.js'
