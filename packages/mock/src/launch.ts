import type { Schemas } from '@manifest/contract'
import * as f from './fixtures.js'
import { MockRefusal } from './refusal.js'

/**
 * THE LAUNCH PATH AS THE MOCK PLAYS IT (the launch path plan's Task 13; FE-40). The mock keeps no
 * state (P5c Decision 9), so where a project stands in UBC's order is an OPTION, and every draft and
 * every *"I've sent it"* is answered as the platform answers it FROM that stage — in its words, and in
 * its order of checks (`launch/records.ts`): a draft must exist, the move must be one the record can
 * make, the assessment comes first, staging before production, the draft sent is the draft held, and
 * the day can be true.
 *
 * - `none` — nothing recorded: drafts succeed, nothing can be sent.
 * - `drafted` — all three drafted, nothing sent: the assessment can be sent; a registration waits for
 *   it (`LAUNCH_PIA_NOT_APPROVED`).
 * - `assessed` — the assessment approved with its PIA number, both registrations drafted carrying it:
 *   staging can be sent; production waits for staging (`LAUNCH_STAGING_NOT_REGISTERED`).
 * - `sent` — THE DEFAULT, the story every other fixture tells: both registrations active, the
 *   assessment sent again and with the Privacy Office.
 * - `approved` — everything approved and registered: with the default approval and rehearsal, the
 *   checklist is ready (FE-40 (1)).
 *
 * **WHAT IT CANNOT DO**: remember. A draft or a send answers as the platform would, and the next read
 * answers the stage again — exactly as `recordIamRegistration` always has.
 */

export type RecordsStage = 'none' | 'drafted' | 'assessed' | 'sent' | 'approved'
export type ApprovalState = 'approved' | 'pending' | 'rejected'

export interface LaunchOptions {
  records: RecordsStage
  approval: ApprovalState
  rehearsal: 'passed' | 'failed'
  queue: 'default' | 'full'
}

type Environment = 'staging' | 'production'
type Registration = Schemas['IamRegistration']
type Assessment = Schemas['PrivacyAssessment']

const ZONE = 'America/Vancouver'

/** The Vancouver day an instant falls on, `YYYY-MM-DD` — the platform's `vancouverDay`. */
export function vancouverDay(at: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day}`
}

/** Noon in Vancouver on a day — where the platform stamps a submission (`vancouverNoon`). */
export function vancouverNoon(day: string): Date {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  const guess = new Date(Date.UTC(y, m - 1, d, 20, 0, 0))
  const hour = Number(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: ZONE,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(guess),
  )
  return new Date(guess.getTime() - (hour - 12) * 3_600_000)
}

const dayInWords = (at: Date): string =>
  new Intl.DateTimeFormat('en-CA', { dateStyle: 'long', timeZone: ZONE }).format(at)

/**
 * WHEN A STAGE'S DRAFTS WERE MADE — two Vancouver days ago, at 16:30Z. Counted from now (FE-27) and
 * the same all day, so a draft read and the *"I've sent it"* naming its `generatedAt` agree.
 */
export function draftedAt(now: number): string {
  return `${vancouverDay(new Date(now - 2 * 86_400_000))}T16:30:00.000Z`
}

/** When a stage's assessment was approved: five Vancouver days ago, at noon. */
const approvedAt = (now: number): string =>
  vancouverNoon(vancouverDay(new Date(now - 5 * 86_400_000))).toISOString()

const INSTRUCTOR = { id: f.USER_ID, displayName: 'Instructor One' }

/** A registration drafted and not sent, at a stage. */
function draftRegistrationRecord(
  environment: Environment,
  stage: 'drafted' | 'assessed',
  now: number,
): Registration {
  const base = environment === 'staging' ? f.STAGING_REGISTRATION : f.IAM_REGISTRATION
  const at = draftedAt(now)
  return {
    ...base,
    environment,
    ...f.ENTITY(environment),
    certFingerprint: null,
    certExpiresAt: null,
    registeredAttributes: [],
    requestedAttributes: null,
    registeredAt: null,
    state: 'draft',
    changeRequestedFrom: null,
    externalTicketRef: null,
    submittedAt: null,
    submittedBy: null,
    package: f.registrationPackage(environment, stage, at),
    createdAt: at,
    updatedAt: at,
  }
}

function draftAssessmentRecord(now: number): Assessment {
  const at = draftedAt(now)
  return {
    ...f.PRIVACY_ASSESSMENT,
    state: 'draft',
    reviewer: null,
    approvedAt: null,
    externalTicketRef: null,
    submittedAt: null,
    submittedBy: null,
    draft: f.assessmentDraft(at),
    createdAt: at,
    updatedAt: at,
  }
}

/** The assessment approved with its PIA number — five days ago at the `assessed` stage. */
function approvedAssessment(when: string): Assessment {
  return {
    ...f.PRIVACY_ASSESSMENT,
    state: 'approved',
    approvedAt: when,
    updatedAt: when,
  }
}

/** What `getLaunchRecords` answers at each stage. */
export function launchRecords(o: LaunchOptions, now: number): Schemas['LaunchRecords'] {
  switch (o.records) {
    case 'none':
      return {
        projectId: f.PROJECT_ID,
        iamRegistration: null,
        stagingRegistration: null,
        privacyAssessment: null,
      }
    case 'drafted':
    case 'assessed':
      return {
        projectId: f.PROJECT_ID,
        iamRegistration: draftRegistrationRecord('production', o.records, now),
        stagingRegistration: draftRegistrationRecord('staging', o.records, now),
        privacyAssessment:
          o.records === 'drafted'
            ? draftAssessmentRecord(now)
            : approvedAssessment(approvedAt(now)),
      }
    case 'sent':
      return f.LAUNCH_RECORDS
    case 'approved':
      return {
        ...f.LAUNCH_RECORDS,
        privacyAssessment: approvedAssessment(APPROVED_ON),
      }
  }
}

/** When the `approved` stage's assessment was approved — the self-serve checklist's day. */
const APPROVED_ON = '2026-09-21T19:00:00.000Z'

const records = (o: LaunchOptions, now: number) => launchRecords(o, now)
const registrationOf = (o: LaunchOptions, environment: Environment, now: number) =>
  environment === 'staging'
    ? records(o, now).stagingRegistration
    : records(o, now).iamRegistration

// ─── The refusals, in the platform's words (`launch/records.ts`, `launch/transitions.ts`) ───

const noDraft = (what: string) =>
  new MockRefusal(
    409,
    'LAUNCH_DRAFT_REQUIRED',
    `there is no draft of ${what} to have sent: Manifest drafts it first, and what is sent is that draft`,
    'Draft it, send the draft, then say it was sent.',
  )

const refuseSubmission = (what: string, from: string, allowed: readonly string[]) =>
  new MockRefusal(
    409,
    'LAUNCH_TRANSITION_INVALID',
    `${what} that is '${from}' cannot be sent again — it is sent from ${allowed.map((s) => `'${s}'`).join(' or ')}`,
  )

const IAM_SUBMIT_FROM = ['draft', 'change_requested', 'expired'] as const
const PIA_SUBMIT_FROM = ['draft'] as const

function assertDraftRead(what: string, held: string, read: string | undefined): void {
  if (read === undefined || Date.parse(held) === Date.parse(read)) return
  throw new MockRefusal(
    409,
    'LAUNCH_DRAFT_CHANGED',
    `${what} was drafted again (${held}) after the draft you read (${read}): what Manifest holds is not what you sent, so nothing was recorded`,
    'Read the current draft. If it is what you sent, say so again with its generatedAt; if you sent the earlier one, send the current draft instead and say so.',
  )
}

/** The platform's `sentDay`: a day that exists, has happened, and is not before the draft. */
function sentDay(sentAt: string | undefined, drafted: string, now: number): string {
  const today = vancouverDay(new Date(now))
  const day = sentAt ?? today
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || vancouverDay(vancouverNoon(day)) !== day)
    throw new MockRefusal(
      400,
      'LAUNCH_SENT_AT_INVALID',
      `sentAt ${day} is not a day: give it as YYYY-MM-DD`,
      'Give the day you sent it, as YYYY-MM-DD — or leave it out for today.',
    )
  if (day > today)
    throw new MockRefusal(
      400,
      'LAUNCH_SENT_AT_INVALID',
      `sentAt ${day} is after today (${today} in Vancouver): say the day it was sent, once it has been`,
      'Send it first, then say so — with the day you sent it, or no day for today.',
    )
  const draftDay = vancouverDay(new Date(drafted))
  if (day < draftDay)
    throw new MockRefusal(
      400,
      'LAUNCH_SENT_AT_INVALID',
      `sentAt ${day} is before the draft was made (${draftDay}): what was sent is the draft, so it cannot have gone earlier`,
      'Give the day you sent this draft — on or after the day it was made.',
    )
  return day
}

export interface SubmitBody {
  sentAt?: string
  reference?: string
  draftGeneratedAt?: string
}

/** `draftIamRegistration`: a draft at a stage nothing was sent, refused once UBC IAM holds it. */
export function draftRegistration(
  o: LaunchOptions,
  environment: Environment,
  now: number,
): Registration {
  if (o.records === 'none' || o.records === 'drafted' || o.records === 'assessed')
    return draftRegistrationRecord(
      environment,
      o.records === 'assessed' ? 'assessed' : 'drafted',
      now,
    )
  const held = registrationOf(o, environment, now)!
  throw new MockRefusal(
    409,
    'LAUNCH_RECORD_SUBMITTED',
    `the ${environment} registration is '${held.state}': what was sent to UBC IAM is kept as it was sent, and Manifest drafts it again only once UBC asks for changes or the registration lapses`,
    'To change what UBC IAM was sent, ask UBC IAM; once an administrator records that it asked for changes, draft it again.',
  )
}

/** `draftPrivacyAssessment`: drafted until it is sent; refused while submitted or approved. */
export function draftAssessment(o: LaunchOptions, now: number): Assessment {
  if (o.records === 'none' || o.records === 'drafted') return draftAssessmentRecord(now)
  const held = records(o, now).privacyAssessment!
  throw new MockRefusal(
    409,
    'LAUNCH_RECORD_SUBMITTED',
    `the privacy assessment is '${held.state}': what was sent to the Privacy Office is kept as it was sent, and Manifest drafts it again only once the Office sends it back`,
    'To change what the Privacy Office was sent, ask the Office; once an administrator records it back in draft, draft it again.',
  )
}

/** `submitPrivacyAssessment`, in the platform's order of checks. */
export function submitAssessment(
  o: LaunchOptions,
  body: SubmitBody,
  now: number,
): Assessment {
  const held = records(o, now).privacyAssessment
  if (held === null || held.draft === null) throw noDraft("this app's privacy assessment")
  if (!(PIA_SUBMIT_FROM as readonly string[]).includes(held.state))
    throw refuseSubmission('a privacy assessment', held.state, PIA_SUBMIT_FROM)
  assertDraftRead(
    "this app's privacy assessment",
    held.draft.generatedAt,
    body.draftGeneratedAt,
  )
  const day = sentDay(body.sentAt, held.draft.generatedAt, now)
  return {
    ...held,
    state: 'submitted',
    submittedAt: vancouverNoon(day).toISOString(),
    submittedBy: INSTRUCTOR,
    ...(body.reference === undefined ? {} : { externalTicketRef: body.reference }),
    updatedAt: new Date(now).toISOString(),
  }
}

/** `submitIamRegistration`, in the platform's order of checks — UBC's order among them. */
export function submitRegistration(
  o: LaunchOptions,
  environment: Environment,
  body: SubmitBody,
  now: number,
): Registration {
  const held = registrationOf(o, environment, now)
  if (held === null || held.package === null)
    throw noDraft(`this app's ${environment} registration`)
  if (!(IAM_SUBMIT_FROM as readonly string[]).includes(held.state))
    throw refuseSubmission('an IAM registration', held.state, IAM_SUBMIT_FROM)
  const pia = records(o, now).privacyAssessment
  if (pia?.state !== 'approved' || pia.externalTicketRef === null)
    throw new MockRefusal(
      409,
      'LAUNCH_PIA_NOT_APPROVED',
      pia?.state === 'approved'
        ? `the privacy assessment is approved but carries no reference: UBC IAM asks for the PIA number, so the ${environment} registration waits for it`
        : `the privacy assessment is ${pia === null ? 'not yet recorded' : `'${pia.state}'`}: UBC's order is the assessment first, and neither registration is sent until it is approved`,
      pia?.state === 'approved'
        ? 'Ask an administrator to record the assessment’s PIA number, then send the registration and say so again.'
        : 'Send the privacy assessment first; once an administrator records it approved, with its PIA number, send the registration.',
    )
  if (environment === 'production') {
    const staging = registrationOf(o, 'staging', now)
    if (staging?.state !== 'active')
      throw new MockRefusal(
        409,
        'LAUNCH_STAGING_NOT_REGISTERED',
        `the staging registration is ${staging === null ? 'not yet recorded' : `'${staging.state}'`}: UBC's order is staging first, and the production registration is sent once staging is registered and tested`,
        'Send the staging registration first; once an administrator records it active and the app is tested at staging, send production’s.',
      )
  }
  assertDraftRead(
    `this app's ${environment} registration`,
    held.package.generatedAt,
    body.draftGeneratedAt,
  )
  if (held.package.privacyAssessmentReference !== pia.externalTicketRef)
    throw new MockRefusal(
      409,
      'LAUNCH_DRAFT_STALE',
      held.package.privacyAssessmentReference === null
        ? `the draft of this app's ${environment} registration was made before the privacy assessment was approved, so it does not carry the PIA number UBC IAM asks for (${pia.externalTicketRef})`
        : `the draft of this app's ${environment} registration carries PIA number ${held.package.privacyAssessmentReference}, and the approved assessment's is ${pia.externalTicketRef}`,
      'Draft it again — the new draft carries the PIA number — send that one, then say it was sent.',
    )
  const day = sentDay(body.sentAt, held.package.generatedAt, now)
  return {
    ...held,
    state: 'submitted',
    changeRequestedFrom: null,
    submittedAt: vancouverNoon(day).toISOString(),
    submittedBy: INSTRUCTOR,
    ...(body.reference === undefined ? {} : { externalTicketRef: body.reference }),
    updatedAt: new Date(now).toISOString(),
  }
}

// ─── The checklist (`launch/readiness.ts`), composed from the options ───

type Item = Schemas['LaunchReadinessItem']
const ticket = (ref: string | null) => (ref === null ? '' : ` (ticket ${ref})`)

/** Production's registration, as the checklist reads it at a stage. */
function iamItem(o: LaunchOptions, base: Item, now: number): Item {
  const row = registrationOf(o, 'production', now)
  if (row === null)
    return {
      ...base,
      state: 'unmet',
      why: 'Every production app that signs people in with CWL needs its own IAM registration, with a multi-week lead time. Nothing has been recorded for this project yet — an administrator records what UBC IAM said, with the ticket reference.',
      since: null,
    }
  if (row.state === 'active') return base
  return {
    ...base,
    state: 'unmet',
    why: `The registration is '${row.state}'${ticket(row.externalTicketRef)} and must be 'active' before a first production launch.`,
    since: null,
  }
}

function piaItem(o: LaunchOptions, base: Item, now: number): Item {
  const row = records(o, now).privacyAssessment
  if (row === null)
    return {
      ...base,
      state: 'unmet',
      why: 'A Privacy Impact Assessment is required before a production launch, with a multi-week lead time. Nothing has been recorded for this project yet — an administrator records what the UBC Privacy Office said, with the ticket reference.',
      since: null,
    }
  if (row.state === 'approved')
    return {
      ...base,
      state: 'met',
      why: `Approved by ${row.reviewer ?? 'the UBC Privacy Office'}${row.approvedAt === null ? '' : ` on ${row.approvedAt.slice(0, 10)}`}${ticket(row.externalTicketRef)}.`,
      since: row.approvedAt,
    }
  if (row.state === 'submitted') return base
  return {
    ...base,
    state: 'unmet',
    why: `The assessment is '${row.state}'${ticket(row.externalTicketRef)} and must be 'approved' before anything goes to production.`,
    since: null,
  }
}

/** The rejection FE-40 (3) scripts — in an administrator's own words. */
export const REJECTION_REASON =
  'the egress list names a host the course does not need — remove it and release again'

function approvalItem(o: LaunchOptions, base: Item): Item {
  switch (o.approval) {
    case 'approved':
      return base
    case 'pending':
      return {
        ...base,
        state: 'unmet',
        why: 'An administrator approves the exact image digest, with step-up re-authentication. This release has not been reviewed yet.',
        since: null,
      }
    case 'rejected':
      return {
        ...base,
        state: 'unmet',
        why: `An administrator did not approve this release: ${REJECTION_REASON}`,
        since: null,
      }
  }
}

function rehearsalItem(o: LaunchOptions, base: Item): Item {
  return o.rehearsal === 'passed'
    ? base
    : {
        ...base,
        state: 'unmet',
        why: `The rehearsal did not pass: ${FAILED_REHEARSAL.evidence.reason}`,
        since: null,
      }
}

/** `getLaunchReadiness`: the default checklist, each item moved by the option that scripts it. */
export function launchReadiness(
  o: LaunchOptions,
  now: number,
): Schemas['LaunchReadiness'] {
  const items = f.LAUNCH_READINESS.items.map((item) => {
    switch (item.id) {
      case 'iam-registration':
        return iamItem(o, item, now)
      case 'privacy-assessment':
        return piaItem(o, item, now)
      case 'admin-approval':
        return approvalItem(o, item)
      case 'rehearsal':
        return rehearsalItem(o, item)
      default:
        return item
    }
  })
  return {
    ...f.LAUNCH_READINESS,
    // READ BY THE CONSOLE, NEVER RECOMPUTED THERE — and composed here, as the platform's
    // `readyOf` does: every blocking item met.
    ready: items.every((i) => !i.blocking || i.state === 'met'),
    items,
  }
}

// ─── The rehearsal (FE-40 (4)) ───

/** A rehearsal that did not pass: a `200` with `passed: false` and the hop that failed. */
export const FAILED_REHEARSAL: Schemas['Rehearsal'] = {
  ...f.REHEARSAL,
  passed: false,
  evidence: {
    ...f.REHEARSAL.evidence,
    signInStatus: null,
    attributesReleased: [],
    reason:
      'the sign-in produced no assertion: the IdP answered the request with an error page, so nothing reached the registered ACS',
  },
}

export const rehearsalOf = (o: LaunchOptions): Schemas['Rehearsal'] =>
  o.rehearsal === 'passed' ? f.REHEARSAL : FAILED_REHEARSAL

// ─── The decision and the request (FE-40 (3); `launch/requests.ts`) ───

export const REJECTED_APPROVAL: Schemas['Approval'] = {
  ...f.APPROVAL,
  decision: 'rejected',
  reason: REJECTION_REASON,
}

/** `getApproval`: the default decision, none (`404`) while pending, or the rejection. */
export function approvalOf(o: LaunchOptions, releaseId: string): Schemas['Approval'] {
  if (o.approval === 'pending')
    throw new MockRefusal(
      404,
      'NOT_FOUND',
      `nobody has approved or rejected release '${releaseId}'`,
    )
  return o.approval === 'rejected' ? REJECTED_APPROVAL : f.APPROVAL
}

export const APPROVAL_REQUEST_ID = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2'

/** `requestApproval`, in the platform's order: nothing to approve, a final rejection, else asked. */
export function requestApproval(
  o: LaunchOptions,
  credential: 'session' | 'token',
  now: number,
): Schemas['ApprovalRequest'] {
  const item = launchReadiness(o, now).items.find((i) => i.id === 'admin-approval')!
  if (item.state === 'met')
    throw new MockRefusal(
      409,
      'APPROVAL_NOT_NEEDED',
      `there is no approval to ask an administrator for — ${item.why}`,
      'Read the launch checklist for what is still unmet, and deploy to production once it is ready.',
    )
  if (o.approval === 'rejected')
    throw new MockRefusal(
      409,
      'RELEASE_REJECTED',
      `an administrator did not approve this release: ${REJECTION_REASON} — a rejection is final for the release it was made on, so there is nothing to ask again`,
      'Change the app, build and release it, deploy that release to staging, and ask for sign-off on it.',
    )
  return {
    id: APPROVAL_REQUEST_ID,
    releaseId: f.RELEASE_ID,
    projectId: f.PROJECT_ID,
    requestedBy: INSTRUCTOR,
    viaToken: credential === 'token' ? { id: f.TOKEN_ID, name: f.TOKEN.name } : null,
    createdAt: new Date(now).toISOString(),
    open: true,
  }
}

// ─── The administrators' queue (`launch/queue.ts`) ───

/**
 * WHAT `MANIFEST_MOCK_QUEUE=full` ADDS: one of each other kind, on projects this mock does NOT hold —
 * so their links answer the mock's `404 NOT_FOUND`, which names the mock. Times from now.
 */
function otherProjectsItems(now: number): Schemas['QueueItem'][] {
  const daysAgo = (n: number) =>
    vancouverNoon(vancouverDay(new Date(now - n * 86_400_000))).toISOString()
  return [
    {
      kind: 'iam-change-request',
      project: {
        id: '12121212-1212-4212-8212-121212121212',
        slug: 'course-forum',
        name: 'Course forum',
      },
      subjectId: '13131313-1313-4313-8313-131313131313',
      environment: 'production',
      requestedBy: { id: f.COLLEAGUE_ID, displayName: 'Colleague One' },
      since: daysAgo(21),
      summary: `A change request for the production registration was filed with UBC IAM on ${dayInWords(new Date(daysAgo(21)))} (ticket IAM-2026-0377), asking for sn: record UBC IAM’s answer when it comes.`,
      note: null,
    },
    {
      kind: 'iam-registration',
      project: {
        id: '14141414-1414-4414-8414-141414141414',
        slug: 'peer-review',
        name: 'Peer review',
      },
      subjectId: '15151515-1515-4515-8515-151515151515',
      environment: 'staging',
      requestedBy: { id: f.COLLEAGUE_ID, displayName: 'Colleague One' },
      since: daysAgo(4),
      summary: `The staging registration was sent to UBC IAM on ${dayInWords(new Date(daysAgo(4)))} (ticket IAM-2026-0511): record UBC IAM’s answer when it comes.`,
      note: null,
    },
    {
      kind: 'release-approval',
      project: {
        id: '16161616-1616-4616-8616-161616161616',
        slug: 'lab-notebook',
        name: 'Lab notebook',
      },
      subjectId: '17171717-1717-4717-8717-171717171717',
      environment: null,
      requestedBy: { id: f.COLLEAGUE_ID, displayName: 'Colleague One' },
      since: daysAgo(1),
      summary:
        'Colleague One asked for the release serving staging to be approved for the app’s first production launch.',
      note: 'The class starts on Monday — the egress change is the only new thing.',
    },
  ]
}

/** `listQueue`: an administrator's read — what the stage leaves with UBC, oldest first. */
export function queueOf(
  o: LaunchOptions,
  role: 'admin' | 'member',
  now: number,
): Schemas['Queue'] {
  if (role !== 'admin')
    throw new MockRefusal(
      403,
      'FORBIDDEN',
      'the queue is a platform administrator’s read',
    )
  const r = records(o, now)
  const own: Schemas['QueueItem'][] = []
  const pia = r.privacyAssessment
  if (pia?.state === 'submitted' && pia.submittedAt !== null)
    own.push({
      kind: 'privacy-assessment',
      project: { id: f.PROJECT_ID, slug: f.PROJECT.slug, name: f.PROJECT.name },
      subjectId: pia.id,
      environment: null,
      requestedBy: pia.submittedBy,
      since: pia.submittedAt,
      summary: `The privacy assessment was sent to the UBC Privacy Office on ${dayInWords(new Date(pia.submittedAt))}${ticket(pia.externalTicketRef)}: record its answer, with the PIA number, when it comes.`,
      note: null,
    })
  const items = [...own, ...(o.queue === 'full' ? otherProjectsItems(now) : [])].sort(
    (a, b) => Date.parse(a.since) - Date.parse(b.since),
  )
  return { items, oldestSince: items[0]?.since ?? null, truncated: false }
}
