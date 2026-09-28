import { describe, expect, it } from 'vitest'
import { deleteRefusalAdvice, RESTORE_SENTENCE } from './ending-state.js'

/**
 * WHAT THE ENDING PANEL SAYS AFTER A DELETE IS REFUSED (the whole-branch review's I1, sitting 10). A
 * delete that stops part way — `500 PROJECT_TEARDOWN_INCOMPLETE` — leaves the project ARCHIVED with
 * something already destroyed, so the panel must send the person to finish the delete, never to
 * restore: the route's own description says a restore of a half-deleted project may have lost its code
 * or data. The console has no DOM tier (P5c Decision 7), so the words are decided here.
 */
describe('the Ending panel after a refused delete', () => {
  it('sends a person to FINISH a delete that stopped part way, and never to restore', () => {
    const advice = deleteRefusalAdvice('PROJECT_TEARDOWN_INCOMPLETE')
    expect(advice).toMatch(/Delete again/)
    expect(advice).toMatch(/do not restore/i)
    expect(advice).toMatch(/lost its code or data/)
  })

  it('says a project that launched while the delete started is switched off with everything kept', () => {
    expect(deleteRefusalAdvice('PROJECT_LAUNCHED_NOT_DELETABLE')).toMatch(
      /switched off with everything kept/,
    )
  })

  it('adds nothing to any other refusal — <Refusal> already shows its code and hint', () => {
    expect(deleteRefusalAdvice('STEP_UP_REQUIRED')).toBeUndefined()
  })

  it('never promises a restore kept everything — a delete that stopped part way may not have', () => {
    expect(RESTORE_SENTENCE).toMatch(/unless a delete stopped part way/)
  })
})
