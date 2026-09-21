/**
 * §5's `launch/`: §13's first-launch checklist, and **since P6a Task 7 the gate that
 * blocks on it**. The view is computed from what exists and never stored (P5a Decision
 * 35); `assertLaunchable` is the one evaluation the production deploy route calls, so the
 * thing a person reads and the thing that refuses them are one computation (Decision 2).
 */
export * from './readiness.js'
export * from './gate.js'
export * from './transitions.js'
export * from './records.js'
// R4's seam (D33, §15, P6a Task 12). `NullReviewer` is constructed once at boot and handed
// to the approval path as `ServerDeps.reviewer`; it reviews nothing and says so.
export * from './review.js'
// D21's rehearsal (R2, P6a Task 14): run by `POST /v1/projects/{id}/rehearsal`, read by
// §13's third blocking item, and the candidate derivation both of them share.
export * from './candidate.js'
export * from './rehearsal.js'
