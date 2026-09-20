import type { Db } from '../db/index.js'
import { computeLaunchReadiness, type LaunchReadinessView } from './readiness.js'

/**
 * §13: a first production launch is a checklist, not a button. A 409 that carries the
 * checklist — not a refusal a client has to go and ask about (P5a Task 14).
 *
 * **IT LIVES HERE, NOT IN `api/errors.ts`, SINCE P6a TASK 7**, the way `ReleaseError`
 * lives in `releases/` and `LaunchTransitionError` in `launch/`: the thing that throws it
 * is `assertLaunchable` below, `api/routes/` imports `launch/`, and a `launch/` that
 * imported `api/` would be the dependency running the wrong way.
 *
 * **The code is a constructor argument rather than a fixed field**, for the reason
 * `LaunchTransitionError` states and sitting 4 paid for: `error-codes.test.ts`'s scan
 * reads `readonly code = '…'` ONLY for files under `api/`, and reads `new <WireClass>('CODE'`
 * everywhere. Moving this class out of `api/` with its fixed field would have left the
 * registry unable to see the code at all — and Task 7 deletes the `ReleaseError` that was
 * the registry's only other sighting of it, so *"registers nothing the source never
 * throws"* would have gone red with nothing to point at.
 */
export class ProductionGateError extends Error {
  constructor(
    readonly code: string,
    readonly launchReadiness: LaunchReadinessView,
  ) {
    super('first production launch is a checklist, not a button (§13, D19)')
    this.name = 'ProductionGateError'
  }
}

/**
 * §13's gate, and D9.1: *"First launch to production — requires the full `LaunchReadiness`
 * checklist."*
 *
 * **ONE FUNCTION, TWO CALLERS** (P6a Decision 2). `GET …/launch-readiness` renders the
 * view and this throws on it; both reach it through `computeLaunchReadiness`, so **the
 * thing a person reads and the thing that blocks them cannot disagree.** P5c sitting 6
 * measured the two rendered paths byte-identical and `delivery.test.ts` asserts it — a
 * second predicate here would be the shape ORIENTATION §9's *a document that restates a
 * number drifts from it* names, in code.
 *
 * It returns the VIEW rather than void, so the caller that proceeds holds the evidence it
 * proceeded on — which is what Task 15's deploy records and Task 19's demo prints.
 *
 * **Until this function existed the platform refused every production deploy
 * unconditionally, in TWO places** — this route's gate and a second one inside
 * `deployRelease`, which no client could ever reach and nobody could open. There is one
 * gate now, and it reads the checklist.
 */
export async function assertLaunchable(
  db: Db,
  projectId: string,
): Promise<LaunchReadinessView> {
  const view = await computeLaunchReadiness(db, projectId)
  if (!view.ready)
    throw new ProductionGateError('RELEASE_PRODUCTION_GATE_UNAVAILABLE', view)
  return view
}
