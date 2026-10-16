/**
 * AGES AND DAYS, AS AN OPERATOR READS THEM. Every age is from an instant the API answered to `now`,
 * and still: the screens re-read the clock by the minute, never animate it (motion is for a machine
 * that is moving). A day is Vancouver's, in words, as the platform writes days
 * (`Intl.DateTimeFormat('en-CA', { dateStyle: 'long', timeZone: 'America/Vancouver' })`).
 */

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * The milliseconds from `fromIso` to `now` — or null when `fromIso` is AHEAD of now. That is not a
 * clock error to hide: the team's submission is stamped at Vancouver NOON of its day
 * (`launch/records.ts`'s `vancouverNoon`) and UBC's queue item's `since` is that stamp, so read at
 * 9 am it is in the future. It has been waiting since today.
 */
function elapsed(fromIso: string, now: Date): number | null {
  const ms = now.getTime() - new Date(fromIso).getTime()
  return ms < 0 ? null : ms
}

/** *"3 days, 4 hours"* — the two largest adjacent units, the second only when it is not zero. */
export function ageWords(fromIso: string, now: Date): string {
  const ms = elapsed(fromIso, now)
  if (ms === null) return 'today'
  if (ms < MINUTE) return 'under a minute'
  const parts: [number, string][] = [
    [Math.floor(ms / DAY), 'day'],
    [Math.floor(ms / HOUR) % 24, 'hour'],
    [Math.floor(ms / MINUTE) % 60, 'minute'],
  ]
  const first = parts.findIndex(([n]) => n > 0)
  const said = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`
  const [n, unit] = parts[first]!
  const next = parts[first + 1]
  return next !== undefined && next[0] > 0
    ? `${said(n, unit)}, ${said(next[0], next[1])}`
    : said(n, unit)
}

/** *"3d 4h"* — the mockup's short form (`design/admin/console.js`'s `ageShort`), never negative. */
export function ageShort(fromIso: string, now: Date): string {
  const ms = elapsed(fromIso, now)
  if (ms === null) return 'today'
  const m = Math.floor(ms / MINUTE)
  if (m < 1) return '<1m'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h${h < 10 && m % 60 !== 0 ? ` ${m % 60}m` : ''}`
  const d = Math.floor(h / 24)
  return `${d}d${h % 24 !== 0 ? ` ${h % 24}h` : ''}`
}

const VANCOUVER_DAY = new Intl.DateTimeFormat('en-CA', {
  dateStyle: 'long',
  timeZone: 'America/Vancouver',
})

/** *"October 13, 2026"* — the day it was in Vancouver, not in UTC. */
export function dayInWords(iso: string): string {
  return VANCOUVER_DAY.format(new Date(iso))
}

const VANCOUVER_CLOCK = new Intl.DateTimeFormat('en-CA', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'America/Vancouver',
})

/** *"9:05 a.m."* — the time of day it was in Vancouver: when a preview was taken, until when it holds. */
export function clockInWords(iso: string): string {
  return VANCOUVER_CLOCK.format(new Date(iso))
}

const VANCOUVER_DATE = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'America/Vancouver',
})

/** *"2026-10-15"* — today in Vancouver, as a submission's `sentAt` names a day (`en-CA` writes it so). */
export function vancouverToday(now: Date): string {
  return VANCOUVER_DATE.format(now)
}

/**
 * *"October 15, 2026"* for `2026-10-15` — the day itself, read at 20:00 UTC (noon in Vancouver in
 * winter, 1 p.m. in summer), so no offset moves it to the day before.
 */
export function dayOfDate(ymd: string): string {
  return dayInWords(instantOfDate(ymd))
}

/**
 * THE INSTANT A DAY TYPED INTO A DATE INPUT IS SENT AS — a certificate's expiry UBC gives as a day:
 * 20:00 UTC, which every reader in Vancouver puts on that day (the facts and Health say days so).
 * Never midnight UTC: that is the evening before in Vancouver (the whole-branch review's I1).
 */
export function instantOfDate(ymd: string): string {
  return `${ymd}T20:00:00.000Z`
}

/** *"2026-10-15"* — the day an instant falls on in Vancouver, as a date input holds a day. */
export function dateOf(iso: string): string {
  return VANCOUVER_DATE.format(new Date(iso))
}
