import { describe, expect, it } from 'vitest'
import { ageShort, ageWords, dayInWords } from './time.js'

// 09:00 in Vancouver (PDT, UTC-7) — before the noon a team's submission is stamped at.
const NOW = new Date('2026-10-15T16:00:00Z')
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()

describe('ages, from an instant to now', () => {
  it('says them in words, never more than two units', () => {
    expect(ageWords(ago(59_000), NOW)).toBe('under a minute')
    expect(ageWords(ago(3 * HOUR + 20 * MIN), NOW)).toBe('3 hours, 20 minutes')
    expect(ageWords(ago(3 * DAY + 4 * HOUR + 10 * MIN), NOW)).toBe('3 days, 4 hours')
    expect(ageWords(ago(23 * DAY), NOW)).toBe('23 days')
    expect(ageWords(ago(DAY + HOUR), NOW)).toBe('1 day, 1 hour')
    expect(ageWords(ago(MIN), NOW)).toBe('1 minute')
  })

  it('says them short', () => {
    expect(ageShort(ago(59_000), NOW)).toBe('<1m')
    expect(ageShort(ago(45 * MIN), NOW)).toBe('45m')
    expect(ageShort(ago(3 * HOUR + 20 * MIN), NOW)).toBe('3h 20m')
    expect(ageShort(ago(3 * DAY + 4 * HOUR + 10 * MIN), NOW)).toBe('3d 4h')
    expect(ageShort(ago(23 * DAY), NOW)).toBe('23d')
  })

  /**
   * I3 (c): THE TEAM'S SUBMISSION IS STAMPED AT VANCOUVER NOON OF ITS DAY (`launch/records.ts`'s
   * `vancouverNoon`), and UBC's item's `since` is that stamp — so read at 9 am it is three hours in
   * the future. It has been waiting since today; never a negative age, never "in 3 hours".
   */
  it('reads a since ahead of now as today', () => {
    const noon = '2026-10-15T19:00:00Z'
    expect(ageWords(noon, NOW)).toBe('today')
    expect(ageShort(noon, NOW)).toBe('today')
  })
})

describe('a day in words', () => {
  it('is Vancouver’s day, as the platform writes it — not UTC’s', () => {
    expect(dayInWords('2026-10-14T06:30:00Z')).toBe('October 13, 2026')
    expect(dayInWords('2026-10-14T07:30:00Z')).toBe('October 14, 2026')
  })
})
