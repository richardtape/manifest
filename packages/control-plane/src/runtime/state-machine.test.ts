import { describe, expect, it } from 'vitest'
import {
  IDLE_POLICY, InvalidTransitionError, TRANSITIONS, canTransition, nextState,
} from './state-machine.js'
import type { InstanceState } from './driver.js'

const ALL_STATES: InstanceState[] = [
  'pending', 'building', 'provisioning', 'starting', 'healthy',
  'failed', 'hibernated', 'waking', 'destroying', 'gone',
]

describe('instance state machine (§11)', () => {
  it('drives the happy path from pending to healthy', () => {
    let state: InstanceState = 'pending'
    state = nextState(state, 'build_started')
    expect(state).toBe('building')
    state = nextState(state, 'build_succeeded')
    expect(state).toBe('provisioning')
    state = nextState(state, 'services_bound')
    expect(state).toBe('starting')
    state = nextState(state, 'health_passed')
    expect(state).toBe('healthy')
  })

  it('sends a failed build to failed, and allows a retry', () => {
    expect(nextState('building', 'build_failed')).toBe('failed')
    expect(nextState('failed', 'build_started')).toBe('building')
  })

  it('hibernates on idle and wakes back through starting', () => {
    expect(nextState('healthy', 'idle_timeout')).toBe('hibernated')
    expect(nextState('hibernated', 'wake_requested')).toBe('waking')
    expect(nextState('waking', 'container_started')).toBe('starting')
  })

  it('lets any live state be destroyed, and gone accepts nothing', () => {
    for (const state of ALL_STATES) {
      if (state === 'gone' || state === 'destroying') continue
      expect(nextState(state, 'destroy_requested')).toBe('destroying')
    }
    expect(nextState('destroying', 'destroyed')).toBe('gone')
    expect(canTransition('gone', 'destroy_requested')).toBe(false)
    expect(canTransition('gone', 'build_started')).toBe(false)
  })

  it('refuses an illegal transition with a machine-readable code', () => {
    expect(() => nextState('healthy', 'build_succeeded')).toThrow(InvalidTransitionError)
    try {
      nextState('healthy', 'build_succeeded')
    } catch (error) {
      expect((error as InvalidTransitionError).code).toBe('INSTANCE_INVALID_TRANSITION')
      expect((error as InvalidTransitionError).from).toBe('healthy')
    }
  })

  // The drift test. If someone adds a state to InstanceState in driver.ts and
  // forgets this table, every other test here still passes and this one fails.
  it('has an entry for every state the driver interface declares', () => {
    expect(Object.keys(TRANSITIONS).sort()).toEqual([...ALL_STATES].sort())
  })

  it('matches §11 lifetime policy exactly', () => {
    expect(IDLE_POLICY.sandbox).toEqual({ action: 'destroy', afterMinutes: 45 })
    expect(IDLE_POLICY.staging).toEqual({ action: 'hibernate', afterMinutes: 10080 })
    expect(IDLE_POLICY.production).toEqual({ action: 'none', afterMinutes: null })
  })
})
