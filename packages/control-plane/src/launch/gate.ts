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
    // THE MESSAGE BY CODE (P6b Task 6): P6a's sentence is about a first launch, and two of
    // the three refusals are about a launched app. The code is what a client switches on;
    // the message is what a person reads, so it must not describe the wrong clause of D9.
    super(
      code === 'RELEASE_REESCALATED'
        ? 'this release changes a sensitive field since the last approved release, so it needs an administrator’s approval before production (§13, D9)'
        : code === 'RELEASE_NOT_STAGED'
          ? 'production runs exactly what staging ran, and this release is not the one serving staging (§13)'
          : launchReadiness.launched
            ? 'this release cannot go to production until the unmet items are met (§13)'
            : 'first production launch is a checklist, not a button (§13, D19)',
    )
    this.name = 'ProductionGateError'
  }
}

/**
 * §13's gate — D9.1, *"First launch to production — requires the full `LaunchReadiness`
 * checklist"*, and since P6b Task 6 D9.2: once launched, a release is self-serve unless it
 * changes a sensitive field, and then it RE-ESCALATES. Three refusals, each a literal code
 * with its own remedy: fix an item (`RELEASE_PRODUCTION_GATE_UNAVAILABLE`), ask an
 * administrator (`RELEASE_REESCALATED`), or deploy what staging runs (`RELEASE_NOT_STAGED`).
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
  /** The release the deploy names — which must be the candidate the checklist describes. */
  releaseId: string,
): Promise<LaunchReadinessView> {
  const view = await computeLaunchReadiness(db, projectId)
  if (!view.ready) {
    const unmet = view.items
      .filter((i) => i.blocking && i.state !== 'met')
      .map((i) => i.id)
    // RELEASE_REESCALATED ONLY WHEN AN APPROVAL IS THE ONE THING MISSING, AND AN APPROVAL
    // WOULD FIX IT (P6b Decision 9) — a client switches on this code to go and ask an
    // administrator, which is the wrong errand for a lapsed registration or a rejection.
    // A LITERAL on each line: error-codes.test.ts finds a code only as the first argument of
    // the constructor, written out, and nothing else (P6b *Read this first* 17). That scan
    // reads COMMENTS too — naming the pattern here with a placeholder registered a code
    // called `CODE` (sitting 4).
    if (
      view.launched &&
      view.reescalated &&
      unmet.length === 1 &&
      unmet[0] === 'admin-approval'
    )
      throw new ProductionGateError('RELEASE_REESCALATED', view)
    throw new ProductionGateError('RELEASE_PRODUCTION_GATE_UNAVAILABLE', view)
  }
  // AFTER readiness (P6b Decision 8), so every refusal P6a built keeps its code: this one
  // appears only when the checklist is satisfied FOR THE CANDIDATE and the request names some
  // other release ([M8]). Production runs exactly what staging ran (§13) — so a rollback goes
  // through staging, which is seconds.
  if (view.candidateReleaseId !== releaseId)
    throw new ProductionGateError('RELEASE_NOT_STAGED', view)
  return view
}
