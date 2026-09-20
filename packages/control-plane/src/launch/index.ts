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
