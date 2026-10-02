import type { Schemas } from '@manifest/contract'

/**
 * THE LAUNCH RECORDS, THE SIGN-OFF REQUEST AND THE ADMINISTRATORS' QUEUE, AS PURE FUNCTIONS (the
 * launch path plan's Task 13). There is no DOM test tier (P5c Decision 7), so each thing a person
 * could be misled by is decided here and tested in the `packages` project — and the screens are
 * clicked. `approval-state.ts` is the precedent.
 *
 * **A WAIT IS COUNTED IN VANCOUVER DAYS.** The platform stamps a submission at NOON in Vancouver on
 * the day the person names (`vancouverNoon`), so a same-day stamp is up to twelve hours AHEAD of
 * now: `now − since` would read *"waiting −4 hours"* on the day it was sent. Both instants are
 * turned into Vancouver days first, and the days are counted.
 */

const ZONE = 'America/Vancouver'

const DAY_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const DAY_WORDS = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE,
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})

/** The day an instant falls on in Vancouver, as `YYYY-MM-DD` — what the platform's `sentAt` is. */
export function vancouverDay(at: Date | string): string {
  // `en-CA` formats a date as YYYY-MM-DD; the parts are read rather than the string trusted.
  const parts = Object.fromEntries(
    DAY_PARTS.formatToParts(typeof at === 'string' ? new Date(at) : at).map((p) => [
      p.type,
      p.value,
    ]),
  )
  return `${parts.year}-${parts.month}-${parts.day}`
}

/** *"1 October 2026"* — the Vancouver day of an instant, in words. */
export function dayInWords(at: Date | string): string {
  return DAY_WORDS.format(typeof at === 'string' ? new Date(at) : at)
}

/** Whole Vancouver days from `since`'s day to `now`'s day: 0 on the day itself. */
export function waitedDays(since: string, now: Date): number {
  const from = Date.parse(`${vancouverDay(since)}T00:00:00Z`)
  const to = Date.parse(`${vancouverDay(now)}T00:00:00Z`)
  return Math.round((to - from) / 86_400_000)
}

const waited = (since: string, now: Date): string => {
  const days = waitedDays(since, now)
  return days <= 0 ? 'since today' : `${days} day${days === 1 ? '' : 's'}`
}

/** *"Sent on 1 October 2026 — waiting 12 days"*: a record with UBC, from its `submittedAt`. */
export function sentLine(submittedAt: string, now: Date): string {
  return `Sent on ${dayInWords(submittedAt)} — waiting ${waited(submittedAt, now)}`
}

/**
 * A CHECKLIST ITEM'S `since` (the launch path plan's Tasks 9 and 12): while the item is unmet it is
 * how long the wait has lasted — a record with UBC, or a sign-off request — and once met, the day
 * it was met. `''` when the platform gives none: nothing is said rather than a guess.
 */
export function sinceWords(
  item: Pick<Schemas['LaunchReadinessItem'], 'state' | 'since'>,
  now: Date,
): string {
  if (item.since === null) return ''
  if (item.state === 'met') return `met since ${dayInWords(item.since)}`
  const days = waitedDays(item.since, now)
  return `waiting since ${dayInWords(item.since)} (${days <= 0 ? 'today' : `${days} day${days === 1 ? '' : 's'}`})`
}

/**
 * WHAT THE OWNER MAY DO WITH ONE RECORD, AND THE SENTENCE THAT SAYS SO. The platform decides every
 * move (`launch/transitions.ts`'s `SUBMIT_ARROWS`, and the drafts' `LAUNCH_RECORD_SUBMITTED`) and
 * answers any other with its own refusal; this only chooses which buttons are worth showing.
 *
 * - `draft`: `'first'` when there is nothing to send yet, `'again'` when there is a draft (or a
 *   request UBC sent back) that a new draft would replace, `null` when the record is with UBC or
 *   decided and drafting is refused.
 * - `send`: there is a draft, and *"I've sent it"* is a move the record can make.
 * - `waiting`: the record is with UBC (or the Privacy Office), and the owner has nothing to do.
 */
export interface OwnerActions {
  draft: 'first' | 'again' | null
  send: boolean
  waiting: boolean
  status: string
}

export function registrationActions(
  record: Schemas['IamRegistration'] | null,
): OwnerActions {
  if (record === null)
    return {
      draft: 'first',
      send: false,
      waiting: false,
      status: 'Nothing has been drafted yet.',
    }
  const drafted = record.package !== null
  switch (record.state) {
    case 'draft':
      return drafted
        ? {
            draft: 'again',
            send: true,
            waiting: false,
            status:
              'Drafted. Read it, send it to UBC IAM, then say you sent it — with the day and the ticket UBC gives you.',
          }
        : {
            draft: 'first',
            send: false,
            waiting: false,
            status: 'Nothing has been drafted yet.',
          }
    case 'submitted':
      return {
        draft: null,
        send: false,
        waiting: true,
        status: 'With UBC IAM. An administrator records its answer here.',
      }
    case 'active':
      return {
        draft: null,
        send: false,
        waiting: false,
        status: 'Registered with UBC IAM.',
      }
    case 'change_requested':
      // WHOSE MOVE IT IS (the launch path plan's Task 12): UBC asking about a request the owner
      // sent is the owner's to answer; a change an administrator filed on a live registration is
      // UBC's to register.
      return record.changeRequestedFrom === 'active'
        ? {
            draft: null,
            send: false,
            waiting: true,
            status:
              'An administrator asked UBC IAM for a change to this registration, and UBC is considering it.',
          }
        : {
            draft: 'again',
            send: drafted,
            waiting: false,
            status:
              'UBC IAM asked for changes. Draft it again, send the new draft, then say you sent it.',
          }
    case 'expired':
      return {
        draft: 'again',
        send: drafted,
        waiting: false,
        status: 'The registration lapsed. Draft it again, send it, then say you sent it.',
      }
  }
}

export function assessmentActions(
  record: Schemas['PrivacyAssessment'] | null,
): OwnerActions {
  if (record === null || (record.state === 'draft' && record.draft === null))
    return {
      draft: 'first',
      send: false,
      waiting: false,
      status: 'Nothing has been drafted yet.',
    }
  switch (record.state) {
    case 'draft':
      return {
        draft: 'again',
        send: true,
        waiting: false,
        status:
          'Drafted. Fill in what only you can (listed under each question), send it to the UBC Privacy Office, then say you sent it.',
      }
    case 'submitted':
      return {
        draft: null,
        send: false,
        waiting: true,
        status:
          'With the UBC Privacy Office. An administrator records its answer and the PIA number here.',
      }
    case 'approved':
      return {
        draft: null,
        send: false,
        waiting: false,
        status: 'Approved by the UBC Privacy Office.',
      }
  }
}

/**
 * *ASK AN ADMINISTRATOR TO SIGN THIS OFF* (FE-25; the launch path plan's Task 12) — offered beside
 * the checklist's `admin-approval` item while it is unmet and something serves staging, unless the
 * release was REJECTED (final for that release: the platform answers `409 RELEASE_REJECTED`) or
 * somebody has already asked (`since` is set only while a request is open — and a second ask would
 * answer the first). `'asked'` says the request is waiting; `null` offers nothing.
 *
 * `latestDecision` is `getApproval`'s for the candidate, `null` when nobody has decided (its `404`).
 */
export function signOffAction(
  readiness: Schemas['LaunchReadiness'],
  latestDecision: 'approved' | 'rejected' | null,
): 'ask' | 'asked' | null {
  const item = readiness.items.find((i) => i.id === 'admin-approval')
  if (item === undefined || item.state === 'met') return null
  if (readiness.candidateReleaseId === null) return null
  if (latestDecision === 'rejected') return null
  return item.since === null ? 'ask' : 'asked'
}

/** The queue's headline (§26's): the oldest item's age, or that nothing waits. */
export function queueHeadline(queue: Schemas['Queue'], now: Date): string {
  if (queue.oldestSince === null) return 'Nothing is waiting on an administrator.'
  const days = waitedDays(queue.oldestSince, now)
  return days <= 0
    ? 'The oldest arrived today.'
    : `The oldest has waited ${days} day${days === 1 ? '' : 's'}.`
}

/** Where an administrator acts on an item: the release's approval, or the project's launch records. */
export function queueLink(item: Schemas['QueueItem']): string {
  return item.kind === 'release-approval'
    ? `/releases/${item.subjectId}/approval`
    : `/projects/${item.project.id}/records`
}

const ENVIRONMENT_WORDS = { staging: 'Staging', production: 'Production' } as const

export function queueKindWords(item: Schemas['QueueItem']): string {
  const environment = item.environment === null ? '' : ENVIRONMENT_WORDS[item.environment]
  switch (item.kind) {
    case 'release-approval':
      return 'Sign-off requested'
    case 'iam-registration':
      return `${environment} registration with UBC IAM`.trim()
    case 'iam-change-request':
      return `${environment} change request with UBC IAM`.trim()
    case 'privacy-assessment':
      return 'Privacy assessment with the Privacy Office'
  }
}

type FleetProject = Schemas['Fleet'][number]

/** An archived project is switched off — said so, never shown as broken (the launch path plan's M3). */
export function fleetStateWords(project: FleetProject): string {
  if (project.state === 'active') return 'on'
  return project.archivedAt === null
    ? 'switched off'
    : `switched off on ${dayInWords(project.archivedAt)}`
}
