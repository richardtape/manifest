import type { Driver, ImageRef } from '../runtime/index.js'
import { ReleaseError } from './release.js'

/** Everything the local Docker driver builds lands here (§13). */
export const LOCAL_NAMESPACE = 'local/'

// No new error class. P2's ReleaseError already carries this refusal, its code is
// already in the API's error family via toErrorResponse, and releases.test.ts
// already asserts it. A second class here would either shadow P2's check or be dead
// code, and would surface as 500 because toErrorResponse would not recognise it.
export { ReleaseError }

/**
 * The registry host varies — `buildImage` returns the bare `local/<slug>`, while the
 * builder and the daemon call the registry different names and either can appear as
 * a leading host segment — so the namespace is matched on the path, not on the whole
 * repository string. A prefix test on the whole string is wrong the moment a host is
 * present, which is the defect this function exists to remove.
 */
export function isLocallyBuilt(image: ImageRef): boolean {
  const path = image.repository.includes('/')
    ? image.repository.slice(image.repository.indexOf('/') + 1)
    : image.repository
  return image.repository.startsWith(LOCAL_NAMESPACE) || path.startsWith(LOCAL_NAMESPACE)
}

/**
 * §13, and the reason it is scoped to the DRIVER rather than to the environment
 * kind: "A laptop's own staging environment runs on the local Docker driver and
 * accepts `local/` images — which is what makes the Phase 1 journey possible
 * offline. Attaching the rule to 'staging and production' would have forbidden the
 * only image a laptop can produce."
 */
export function assertPromotable(driver: Driver, image: ImageRef): void {
  if (!driver.capabilities().remoteTarget) return
  if (!isLocallyBuilt(image)) return
  throw new ReleaseError(
    'RELEASE_LOCAL_IMAGE_ON_REMOTE_DRIVER',
    `image ${image.repository}@${image.digest.slice(0, 19)}… was built locally and cannot be ` +
      `deployed by the '${driver.name}' driver, which targets remote infrastructure. ` +
      'Developer laptops are arm64 and UBC infrastructure is x86-64, and §13 promotes the exact ' +
      'digest — so an architecture mismatch is unresolvable at deploy time. Everything that ' +
      'leaves a laptop is built by CI on the target architecture.',
  )
}
