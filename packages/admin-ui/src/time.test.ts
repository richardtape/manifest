import { describe, expect, it } from 'vitest'
import {
  ageShort,
  ageWords,
  clockInWords,
  dateOf,
  dayInWords,
  dayOfDate,
  instantOfDate,
  vancouverToday,
} from './time.js'

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

describe('a time of day', () => {
  it('is Vancouver’s, as an operator reads a preview’s clock', () => {
    expect(clockInWords('2026-10-15T19:00:00Z')).toBe('12:00 p.m.')
    expect(clockInWords('2026-10-15T16:05:00Z')).toBe('9:05 a.m.')
    // 00:30 in Vancouver is 07:30 in UTC — never the UTC hour.
    expect(clockInWords('2026-10-15T07:30:00Z')).toBe('12:30 a.m.')
  })
})

/**
 * THE DAY THE TEAM SENT IT: a submission names a day, `YYYY-MM-DD`, *"today or earlier"* in Vancouver
 * (`RecordSubmissionRequest.sentAt`) — so the form's today is Vancouver's, never UTC's.
 */
describe('a day as the team’s submission names it', () => {
  it('today is Vancouver’s — at 17:30 in Vancouver it is already tomorrow in UTC', () => {
    expect(vancouverToday(NOW)).toBe('2026-10-15')
    expect(vancouverToday(new Date('2026-10-16T00:30:00Z'))).toBe('2026-10-15')
    expect(vancouverToday(new Date('2026-10-16T07:30:00Z'))).toBe('2026-10-16')
  })

  it('a YYYY-MM-DD in words is that day, whatever the offset', () => {
    expect(dayOfDate('2026-10-15')).toBe('October 15, 2026')
    expect(dayOfDate('2026-01-05')).toBe('January 5, 2026')
  })
})

/**
 * A DAY TYPED INTO A DATE INPUT, AND BACK (the whole-branch review's I1): a certificate's expiry UBC gives
 * as a day is sent as an instant, and the facts and Health read it back as Vancouver's day — so the instant
 * is one every Vancouver reader puts on that day, never midnight UTC (the evening before there), and the
 * input is filled with the day Vancouver reads, never the UTC date.
 */
describe('a day typed into a date input', () => {
  it('is sent as 20:00 UTC — noon in Vancouver in winter, 1 p.m. in summer — and read back as that day', () => {
    expect(instantOfDate('2028-01-31')).toBe('2028-01-31T20:00:00.000Z')
    expect(dayInWords(instantOfDate('2028-01-31'))).toBe('January 31, 2028')
    expect(dayInWords(instantOfDate('2027-07-01'))).toBe('July 1, 2027')
    expect(dayInWords('2028-01-31T00:00:00.000Z')).toBe('January 30, 2028')
  })

  it('is filled from an instant as the day Vancouver reads it — not the UTC date', () => {
    expect(dateOf('2028-02-01T03:00:00.000Z')).toBe('2028-01-31')
    expect(dateOf('2028-09-04T16:12:00.000Z')).toBe('2028-09-04')
    expect(dateOf(instantOfDate('2027-07-01'))).toBe('2027-07-01')
  })
})
