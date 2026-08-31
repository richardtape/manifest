import type { InstanceState } from './driver.js'

/** Everything that can move an instance. §11's states are the nodes; these are the edges. */
export type InstanceEvent =
  | 'build_started'
  | 'build_succeeded'
  | 'build_failed'
  | 'services_bound'
  | 'container_started'
  | 'health_passed'
  | 'health_failed'
  | 'crashed'
  | 'idle_timeout'
  | 'wake_requested'
  | 'destroy_requested'
  | 'destroyed'

type TransitionTable = Readonly<
  Record<InstanceState, Readonly<Partial<Record<InstanceEvent, InstanceState>>>>
>

export const TRANSITIONS: TransitionTable = Object.freeze({
  pending: { build_started: 'building', destroy_requested: 'destroying' },
  building: {
    build_succeeded: 'provisioning',
    build_failed: 'failed',
    destroy_requested: 'destroying',
  },
  provisioning: {
    services_bound: 'starting',
    health_failed: 'failed',
    destroy_requested: 'destroying',
  },
  starting: {
    health_passed: 'healthy',
    health_failed: 'failed',
    destroy_requested: 'destroying',
  },
  healthy: {
    idle_timeout: 'hibernated',
    crashed: 'failed',
    destroy_requested: 'destroying',
  },
  // wake_requested is raised by whatever S4 chooses. Nothing in P2 raises it.
  hibernated: { wake_requested: 'waking', destroy_requested: 'destroying' },
  waking: {
    container_started: 'starting',
    health_failed: 'failed',
    destroy_requested: 'destroying',
  },
  failed: { build_started: 'building', destroy_requested: 'destroying' },
  destroying: { destroyed: 'gone' },
  gone: {},
} satisfies TransitionTable)

export class InvalidTransitionError extends Error {
  readonly code = 'INSTANCE_INVALID_TRANSITION'
  constructor(
    readonly from: InstanceState,
    readonly event: InstanceEvent,
  ) {
    super(`instance in state '${from}' has no transition for event '${event}'`)
    this.name = 'InvalidTransitionError'
  }
}

/**
 * `?.` rather than a bare index on purpose. The table is typed to cover every
 * InstanceState, so a missing row can only arrive through drift — a state added to
 * `driver.ts` and not here, or an old enum value read back from the database after
 * the union changed. Unguarded, both produce a TypeError from dereferencing
 * undefined; guarded, they produce the documented InvalidTransitionError, and the
 * drift test below is left as the only thing that fails.
 */
export function canTransition(from: InstanceState, event: InstanceEvent): boolean {
  return TRANSITIONS[from]?.[event] !== undefined
}

export function nextState(from: InstanceState, event: InstanceEvent): InstanceState {
  const to = TRANSITIONS[from]?.[event]
  if (to === undefined) throw new InvalidTransitionError(from, event)
  return to
}

export interface IdlePolicy {
  action: 'destroy' | 'hibernate' | 'none'
  afterMinutes: number | null
}

/** §11's lifetime table, as data. Enforced by whoever runs the reaper (P4). */
export const IDLE_POLICY: Readonly<
  Record<'sandbox' | 'staging' | 'production', IdlePolicy>
> = Object.freeze({
  sandbox: { action: 'destroy', afterMinutes: 45 },
  staging: { action: 'hibernate', afterMinutes: 60 * 24 * 7 },
  production: { action: 'none', afterMinutes: null },
})
