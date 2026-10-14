import type { StoredAudience } from '../projects/index.js'
import type { EnvironmentKind } from '../secrets/index.js'

/**
 * WHY A DEPLOY IS HAPPENING — the one distinction a deploy's SHAPE turns on, beside the environment's
 * kind and the project's audience (A1 Decision 2).
 *
 * `'launch'` is a person's deploy, and every caller that does not say otherwise; `'rehearsal'` is D21's
 * pre-production rehearsal (`launch/rehearsal.ts`), which measures a sign-in and stays one instance;
 * `'replacement'` is the set watcher's redeploy of a production set a member of which exited — declared
 * here, where its row is, and passed by nothing until the watcher exists (A1 Task 6).
 */
export type DeployPurpose = 'launch' | 'rehearsal' | 'replacement'

/** What a deploy runs: how many instances, and whose resources each is given. */
export interface DeployShape {
  instances: number
  /** The environment whose frozen `resources` each instance is given. */
  resources: EnvironmentKind
}

/**
 * §24's production instance counts, by the audience a person answered (D29): exactly 1, 2, 3 and 3 —
 * *headroom* is the third instance, which carries the app while another is replaced or has died.
 */
const PRODUCTION_INSTANCES: Readonly<Record<StoredAudience['scale'], number>> =
  Object.freeze({
    solo: 1,
    class: 2,
    large_course: 3,
    public: 3,
  })

/**
 * THE SHAPE OF A DEPLOY, AND THE ONLY PLACE IT IS DECIDED (A1 Decision 2). Read by `deployRelease`
 * and nowhere else; a caller never passes a count or a resource — `DeployInput` has no field for
 * either — so a purpose cannot ask for a shape its row does not give, and B's load rehearsal and A2
 * each add a row here rather than an override path.
 *
 * - **Production, for a launch or a replacement**: the audience's count, read at each deploy, at
 *   production's own resources. A project with no audience recorded runs one.
 * - **Production, for D21's rehearsal**: one — it measures a sign-in, not load, and its take-down
 *   removes exactly what it put up.
 * - **Staging and sandbox**: one, at their own — §24: *"Sandbox and staging ignore all of it."*
 */
export function shapeFor(
  kind: EnvironmentKind,
  purpose: DeployPurpose,
  audience: Pick<StoredAudience, 'scale'> | null | undefined,
): DeployShape {
  if (kind !== 'production' || purpose === 'rehearsal')
    return { instances: 1, resources: kind }
  const instances = audience == null ? 1 : (PRODUCTION_INSTANCES[audience.scale] ?? 1)
  return { instances, resources: 'production' }
}
