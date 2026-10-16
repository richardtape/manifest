import { fixtures } from '@manifest/mock'
import { describe, expect, it } from 'vitest'
import {
  loadRehearsalOffer,
  loadRehearsalWords,
  pollDelayMs,
} from './load-rehearsal-state.js'

/**
 * §24'S LOAD REHEARSAL ON THE CHECKLIST (the load rehearsal plan's Task 7): the button only where the platform's
 * checklist asks for a run, its poll at the platform's own interval, and a run's result in words — against the mock's
 * own records, so a record the mock answers and these cannot read fails here, not in a click.
 */
const item = (state: 'met' | 'unmet') => ({
  id: 'load-rehearsal' as const,
  title: 'Load rehearsal passed',
  owner: 'Manifest',
  blocking: true,
  state,
  why: 'a reason',
  since: null,
})

describe('the load rehearsal on the launch checklist', () => {
  it('is offered only for a large app — where the checklist has the item — and again once it is met', () => {
    // A class app's checklist (the mock's default) has no load-rehearsal item: no button.
    expect(loadRehearsalOffer(fixtures.LAUNCH_READINESS)).toBeNull()
    expect(loadRehearsalOffer({ items: [item('unmet')] })).toBe('run')
    expect(loadRehearsalOffer({ items: [item('met')] })).toBe('again')
  })

  it('polls a running run at the platform’s interval, and stops once it has ended', () => {
    expect(pollDelayMs(fixtures.LOAD_REHEARSAL_STARTED)).toBe(10_000)
    expect(pollDelayMs(fixtures.LOAD_REHEARSAL_RUNNING)).toBe(10_000)
    expect(pollDelayMs(fixtures.LOAD_REHEARSAL_PASSED)).toBeNull()
    expect(pollDelayMs(fixtures.LOAD_REHEARSAL_FAILED)).toBeNull()
  })

  it('says a result in a person’s words: the share answered and the p95, or the first rule broken with its number', () => {
    expect(loadRehearsalWords(fixtures.LOAD_REHEARSAL_PASSED)).toBe(
      'Passed: 100% answered, p95 0.01 s',
    )
    expect(loadRehearsalWords(fixtures.LOAD_REHEARSAL_FAILED)).toBe(
      'Did not pass: 66.6% of requests were answered (12990 of 19500); the mark is 99%',
    )
    expect(loadRehearsalWords(fixtures.LOAD_REHEARSAL_STARTED)).toContain('Running')
    expect(loadRehearsalWords(fixtures.LOAD_REHEARSAL_RUNNING)).toContain('3 instances')
    // ROUNDED DOWN, as the platform's judge rounds: 98.99% is not 99%.
    expect(
      loadRehearsalWords({
        ...fixtures.LOAD_REHEARSAL_PASSED,
        evidence: {
          ...fixtures.LOAD_REHEARSAL_PASSED.evidence!,
          answeredRatio: 0.9899,
          p95Ms: 612,
        },
      }),
    ).toBe('Passed: 98.9% answered, p95 0.61 s')
  })

  it('a run that passed but could not give staging back is said NOT to count', () => {
    const words = loadRehearsalWords({
      ...fixtures.LOAD_REHEARSAL_PASSED,
      state: 'teardown_failed',
      evidence: {
        reason:
          'staging was not given back its own shape. The run itself: 100% of requests answered',
        judged: { passed: true, reason: '100% of requests answered' },
      },
    })
    expect(words).toMatch(/^Does not count/)
    expect(words).not.toMatch(/^Passed/)
  })
})
