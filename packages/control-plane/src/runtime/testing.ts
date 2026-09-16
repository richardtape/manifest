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
export {
  testIssuer,
  REPO_ROOT,
  // `sso/`'s Docker-tier suite deploys a real Service Provider through the real
  // driver rather than reimplementing build, network, egress and routing. The
  // boundary test forbids reaching into `runtime/docker/`, so they surface here.
  CA_CERT,
  dockerDriverForTests,
  fixtureBareRepo,
  // `releases/redeploy.docker.test.ts` deploys THROUGH the control plane and needs an
  // app that is healthy with no database: `fixtures/fixture-app` connects to Mongo
  // before it listens and exits if it cannot (ORIENTATION §4), so a routing test built
  // on it measures a Mongo timeout. The blueprint skeleton serves `/healthz` on its
  // own, and this is the one function that turns it into a buildable bare repository.
  ensureContractRepo,
} from './docker/testing.js'

// `build/`'s Docker-tier suite drives the real engine (Task 12). It reaches the
// client through this module's public test surface, not by a deep path.
export { createEngineClient, resolveSocketPath } from './docker/engine.js'

// `destroyInstance` takes the CONTAINER name, not the instance name, and an
// afterAll that passes the wrong one destroys nothing — silently, if it also
// swallows the error. Measured 2026-09-08: a stale `mf-saml-probe-staging-r1-app`
// survived sixteen minutes and four runs, and `ensureInstance` is idempotent by
// name, so every one of those runs redeployed nothing and tested the FIRST
// image. A negative control that edits the app then passes is the symptom.
// `instanceAlias` is what the EDGE dials since P4c, so it is what a readiness failure
// names — `releases/incident.docker.test.ts` asserts the Incident's failed check
// against it rather than against a literal the test and the driver could each derive
// differently (P4c sitting 2, finding 20).
export { appContainer, egressContainer, instanceAlias } from './docker/names.js'

// `releases/`'s Docker-tier Incident suite deploys a real app, and must leave no app
// network behind. `docker network rm` fails while ANY container is still attached, and
// every app network has the platform's neighbours on it (§4); this disconnects them.
export { destroyAppNetwork } from './docker/networks.js'
