import { eq } from 'drizzle-orm'
import { STALENESS_THRESHOLD_DAYS } from '../build/index.js'
import { builds, environments, projects, releases, type Db } from '../db/index.js'
import type { StoredAudience } from '../projects/index.js'
import {
  approvalCoversDigest,
  latestApprovalFor,
  productionApprovalFor,
} from '../releases/index.js'
import type { ScanSummary } from '../runtime/index.js'
import { unregisteredAttributes, type SensitiveField } from '../spec/index.js'
import { candidateFor, type LaunchCandidate } from './candidate.js'
import {
  getIamRegistration,
  getPrivacyAssessment,
  type IamRegistrationRow,
} from './records.js'
import { rehearsalItem } from './rehearsal.js'

/**
 * Every id §13's checklist can carry, ONCE. `api/representations/launch.ts` builds its
 * closed `z.enum` from this list rather than restating it (P6a Task 12): `[M4]` measured
 * that an id missing from a restated enum is a **`500 INTERNAL`** on the read — and on the
 * production deploy's `409` it is worse, because `mapError` drops a checklist that does not
 * parse rather than throw, so the refusal would arrive with no checklist at all. One list
 * leaves the generated `schema.d.ts` as the only copy, and `pnpm contract:generate` owns it.
 */
export const LAUNCH_ITEM_IDS = [
  'domain',
  'iam-registration',
  'privacy-assessment',
  'rehearsal',
  'scans',
  'admin-approval',
  'load-rehearsal',
  'code-review',
] as const

export type LaunchItemId = (typeof LAUNCH_ITEM_IDS)[number]

export interface LaunchItem {
  id: LaunchItemId
  title: string
  owner: string
  blocking: boolean
  state: 'met' | 'unmet' | 'not_built'
  /** Why this state — for a faculty member, not a log line (§14). */
  why: string
  /**
   * For `not_built`: the plan that builds it (roadmap, Phase 2) — or, for `code-review`, the
   * tracked hardening item, which is deliberately NOT a plan (R4e).
   */
  builtBy?: string
}

export interface LaunchReadinessView {
  projectId: string
  /** P6b: which of D9's two clauses this view is — the first launch's checklist, or a launched app's. */
  launched: boolean
  /** True only when every blocking item is met. */
  ready: boolean
  /** The release a launch would promote: the one serving staging (§13 — promotion never rebuilds). */
  candidateReleaseId: string | null
  /** The last approved release the candidate is diffed against (D9.2); null before launch. */
  baselineReleaseId: string | null
  /**
   * §7's fields the candidate changes since that release, in `SENSITIVE_FIELDS` order; `[]`
   * before launch. `SensitiveField[]`, not `string[]`: the representation is
   * `z.enum(SENSITIVE_FIELDS)`, and the route returns this view as its body.
   */
  sensitiveFields: SensitiveField[]
  /**
   * True for the ONE refusal an administrator's approval FIXES: launched, an approval
   * required (a sensitive change, or nothing approved to compare with), none covering the
   * candidate, and NOT rejected. Derived once, from the same verdict as `admin-approval`,
   * so the gate reads a fact rather than re-deciding one (P6b Decision 9).
   */
  reescalated: boolean
  items: LaunchItem[]
}

/**
 * §13's first-launch checklist, COMPUTED FROM WHAT EXISTS and never stored (P5a Decision
 * 35). An item whose entity does not exist yet says so, and names the plan that builds
 * it, rather than inventing a status — the constant this replaces stamped four items
 * "deliveredBy: P4" that P4 did not deliver.
 *
 * **IT IS NO LONGER READ-ONLY.** 1c shipped this view alone and §17 put the gate in Phase
 * 2; P6a Task 7 built it, and `assertLaunchable` in `gate.ts` throws on this exact value.
 * There is ONE computation and two callers, so what a person reads and what refuses them
 * cannot disagree (Decision 2) — which means **an item added here changes what production
 * deploys are possible**, not just what a screen shows.
 */
export async function computeLaunchReadiness(
  db: Db,
  projectId: string,
): Promise<LaunchReadinessView> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId))
  // ONE DERIVATION OF *THE CANDIDATE*, shared with `rehearsal.ts` since P6a Task 14 — the
  // release serving staging, which is what a launch promotes (§13).
  const candidate = await candidateFor(db, projectId)
  const candidateAuth = candidate?.auth
  const provider = candidateAuth?.provider
  // No candidate means no answer yet, and the conservative answer is that it will need
  // one: an IAM registration has a multi-week lead time, so reporting "not needed" on no
  // evidence is the expensive direction to be wrong in.
  const usesCwl = provider !== 'none'
  const audience = project?.audience as StoredAudience | null | undefined
  const scans = scansItem(
    candidate?.build.scan as ScanSummary | null | undefined,
    candidate !== undefined,
  )
  const [production] = await db
    .select()
    .from(environments)
    .where(eq(environments.projectId, projectId))
    .then((rows) => rows.filter((e) => e.kind === 'production'))
  // WHAT THE CANDIDATE WOULD REGISTER IN PRODUCTION (P6b Task 7) — the one shape both IAM
  // items compare with what UBC registered, derived as `deriveSpEntity` and `rehearsalItem`
  // derive it. Undefined with nothing serving staging, when there is nothing to compare.
  const would =
    candidate === undefined || production === undefined
      ? undefined
      : {
          acsUrl: `https://${production.hostname}${candidate.auth.callback}`,
          sloUrl: `https://${production.hostname}${candidate.auth.logout}`,
          attributes: candidate.auth.attributes,
        }

  /**
   * **D9's SECOND CLAUSE (P6b Task 6, Decision 2)**: once an app has launched, a release goes
   * to production self-serve unless it changes a sensitive field. Same function, same view,
   * a different list — so the gate and the read still cannot disagree. `rehearsal` is gone:
   * after a launch a rehearsal would put an unapproved release on the live listener, and it
   * is refused outright (Decision 16). `admin-approval` reads Task 5's rule — the SAME
   * verdict `deployRelease` reads. `iam-registration` becomes the LIVE check (Task 7): what
   * UBC registered, for every production release and not only the first.
   */
  if (project?.launchedAt != null) {
    const approval = await releaseApprovalItem(db, candidate)
    const items: LaunchItem[] = [
      { ...DOMAIN_ITEM },
      await liveRegistrationItem(db, projectId, usesCwl, would),
      await piaItem(db, projectId),
      scans,
      approval.item,
      ...loadRehearsalItems(audience),
      { ...CODE_REVIEW_ITEM },
    ]
    return {
      projectId,
      launched: true,
      ready: readyOf(items),
      candidateReleaseId: candidate?.release.id ?? null,
      baselineReleaseId: approval.baselineReleaseId,
      sensitiveFields: approval.sensitiveFields,
      reescalated: approval.reescalated,
      items,
    }
  }

  const items: LaunchItem[] = [
    { ...DOMAIN_ITEM },
    await iamItem(db, projectId, usesCwl, would),
    await piaItem(db, projectId),
    // D21, as R2 redefines it (P6a Task 14): met by the MEASUREMENT `runRehearsal` wrote,
    // and `unmet` again the moment the candidate would register something else.
    await rehearsalItem(
      db,
      projectId,
      candidate === undefined || production === undefined
        ? undefined
        : { hostname: production.hostname, auth: candidate.auth },
    ),
    scans,
    await approvalItem(db, candidate),
    ...loadRehearsalItems(audience),
    // LAST, after every blocking item — including `load-rehearsal`, which is conditional —
    // so the checklist reads as the things that gate production followed by the one that
    // does not, and no blocking item's position depends on whether this one is present.
    // A COPY, so no caller that edits the view it was handed can edit every later view.
    { ...CODE_REVIEW_ITEM },
  ]

  return {
    projectId,
    launched: false,
    ready: readyOf(items),
    candidateReleaseId: candidate?.release.id ?? null,
    baselineReleaseId: null,
    sensitiveFields: [],
    reescalated: false,
    items,
  }
}

/** §13's first item, ONE statement for both of D9's clauses. Always `met` today. */
const DOMAIN_ITEM: LaunchItem = {
  id: 'domain',
  title: 'Where the app will live',
  owner: 'project owner',
  blocking: true,
  state: 'met',
  why: 'Canonical hostname only — no action. A custom domain is Phase 2 (§23), and for a CWL app it must be chosen before IAM registration, because the registration carries it.',
}

/** §24: a large-audience app is rehearsed under load before launch — P9 builds it. Both clauses. */
function loadRehearsalItems(audience: StoredAudience | null | undefined): LaunchItem[] {
  if (audience?.scale !== 'large_course' && audience?.scale !== 'public') return []
  return [
    {
      id: 'load-rehearsal',
      title: 'Load rehearsal passed',
      owner: 'Manifest',
      blocking: true,
      state: 'not_built',
      builtBy: 'P9',
      why: `An app for ${audience.scale === 'public' ? 'the public' : 'a large course'} is rehearsed against staging with production-shaped capacity before launch (§24).`,
    },
  ]
}

/**
 * §13 and D9.1: production is reachable when EVERY BLOCKING item is met, and a
 * non-blocking item is read by a person and ignored by the gate.
 *
 * **EXPORTED FOR ONE TEST, AND THAT TEST IS WHY IT IS A FUNCTION** (P6a Task 12). Decision
 * 13 says `readiness.test.ts` must show a project with every blocking item met is still
 * `ready` beside a `not_built` `code-review` — and no project this platform can build has
 * every blocking item met until Task 14 builds `rehearsal`. So the test takes the REAL items
 * `computeLaunchReadiness` produced, forces every item but `code-review` to `met`, and asks
 * THIS function — the derivation the view itself uses, not a copy of it.
 */
export function readyOf(items: readonly LaunchItem[]): boolean {
  return items.filter((i) => i.blocking).every((i) => i.state === 'met')
}

/**
 * R4's item (D33, §15, P6a Task 12): code safety has a SEAM and nothing behind it.
 *
 * **Static, and deliberately so.** Nothing reviews code, whatever the project, so this item
 * cannot say anything about one project that it does not say about every other — and an
 * item that read the approval's stored verdict would be reading `not_performed` back out of
 * a record the same sentence put there. When a real reviewer lands this becomes a function
 * of that reviewer's verdict on the candidate, and becomes blocking in the same change.
 */
const CODE_REVIEW_ITEM: LaunchItem = {
  id: 'code-review',
  title: 'Code reviewed for safety',
  owner: 'Manifest',
  /**
   * **`false`, AND THIS IS NOT A PREFERENCE** (D33, R4c). `ready` is derived from every
   * BLOCKING item being met, so a blocking item in state `not_built` would make production
   * unreachable for ever — the precise trap R1 exists to undo, reintroduced by accident. It
   * becomes blocking when a real implementation lands, and that is a one-field change by
   * design. `readiness.test.ts` asserts both directions.
   */
  blocking: false,
  state: 'not_built',
  builtBy: 'a tracked hardening item (SemgrepReviewer), not a plan',
  /**
   * §20's control-map row, word for word where it matters: the risk is STILL ACCEPTED, the
   * control is CONTAINMENT, and until an implementation lands NOTHING REVIEWS CODE. If this
   * sentence and that row can be read as saying different things, this sentence is wrong.
   */
  why: 'Nothing reviews the code the agent wrote. Manifest reviews manifest.yaml, not code (§13), and that risk is still accepted: the controls that make it tolerable are containment — default-deny egress, network isolation, least privilege and edge protections (§20). A reviewer interface exists with no implementation behind it (D33, §15), so this item does not block a launch.',
}

/**
 * §13's first blocking item, and the one R1 bought (P6a Task 7). Until this task it read
 * `not_built` / `builtBy: 'P8'` — *"Manifest does not track it yet"* — which stopped being
 * true the moment migration 0019 landed. Five states now, and every one of them is a fact
 * about a row an administrator recorded from what UBC IAM said:
 *
 *  - `met` when the app signs nobody in with CWL — there is nothing to register.
 *  - `met` when a recorded registration is `active` AND it covers the candidate release — a
 *    subset of what it registered (§7's last production clause, P6a Task 13), at the ACS and
 *    SLO UBC registered (P6b Task 7, `[M10]`); `registrationCovers` is the one statement.
 *  - `unmet` when it is `active` and does not cover the candidate, naming each gap.
 *  - `unmet` when one exists and is not yet active, naming the state and the ticket, so
 *    the owner can chase it rather than wonder.
 *  - `unmet` when none exists at all — **NOT `not_built`**, which said "Manifest does not
 *    track this yet" and is now false.
 *
 * **`builtBy` is gone from this item**, and a reader who finds it again should treat that
 * as a regression: it names the plan that will build a thing, and this thing is built.
 */
async function iamItem(
  db: Db,
  projectId: string,
  usesCwl: boolean,
  /** What the CANDIDATE would register in production — its frozen config, never the latest spec. */
  would: RegistrationShape | undefined,
): Promise<LaunchItem> {
  if (!usesCwl) return { ...NOT_CWL_ITEM }
  const row = await getIamRegistration(db, projectId)
  if (row === undefined)
    return {
      ...IAM_BASE,
      state: 'unmet',
      why: 'Every production app that signs people in with CWL needs its own IAM registration (§9, C4), with a multi-week lead time. Nothing has been recorded for this project yet — an administrator records what UBC IAM said, with the ticket reference.',
    }
  if (row.state === 'active') {
    /**
     * **`active` IS NOT ENOUGH — THE CANDIDATE MUST BE COVERED BY IT** (§7, §9). `finishBuild`
     * refuses attribute drift only when a registration exists at build time, and §9 makes the
     * other order the normal one — so the release serving staging, built before UBC answered,
     * is compared here (P6a Task 13). **And since P6b Task 7 its ACS and SLO are too** (`[M10]`):
     * a recorded ACS naming `wrong.example` read `met`, and so did the rehearsal whose own
     * sentence says it proved the ACS URL. After this, recorded = derived = rehearsed.
     */
    if (would !== undefined) {
      const coverage = registrationCovers(row, would)
      if (!coverage.covers)
        return {
          ...IAM_BASE,
          state: 'unmet',
          why: coverageGap(row, would, coverage, 'The release serving staging'),
        }
    }
    return {
      ...IAM_BASE,
      state: 'met',
      why: `Registered as ${row.entityId}, active${ticket(row.externalTicketRef)}, releasing ${row.registeredAttributes.length} attribute(s).`,
    }
  }
  return {
    ...IAM_BASE,
    state: 'unmet',
    why: `The registration is '${row.state}'${ticket(row.externalTicketRef)} and must be 'active' before a first production launch (§9).`,
  }
}

/**
 * §13's `iam-registration` for a LAUNCHED app (P6b Task 7, Decision 2) — the LIVE check, for
 * every production release and not only the first (§7's last production clause says *"for a
 * production release"*). Met when:
 *
 *  - UBC has registered this SP at least once (`registeredAt`) — a change request on file does
 *    not unregister it, so a launched app keeps shipping while one is outstanding, as long as
 *    what it ships is covered by what UBC registered;
 *  - the registration has not lapsed (`expired`, D20);
 *  - and it COVERS the candidate: every attribute asked for is registered, and the ACS and SLO
 *    are the ones UBC registered.
 *
 * **A REMOVED attribute is covered** (Rich's answer to Question 2, 2026-09-22): it waits for
 * nobody here, and re-escalates through `admin-approval`, because `auth.attributes` is one of
 * §7's sensitive fields. The item says UBC still releases it, which is the data-minimisation
 * reason to file a change request anyway.
 */
async function liveRegistrationItem(
  db: Db,
  projectId: string,
  usesCwl: boolean,
  would: RegistrationShape | undefined,
): Promise<LaunchItem> {
  if (!usesCwl) return { ...NOT_CWL_ITEM }
  const row = await getIamRegistration(db, projectId)
  if (row === undefined)
    return {
      ...IAM_BASE,
      state: 'unmet',
      why: 'This app has launched and signs people in with CWL, but no IAM registration is recorded for it — nothing reaches production until an administrator records what UBC IAM registered (§9).',
    }
  if (row.registeredAt === null)
    return {
      ...IAM_BASE,
      state: 'unmet',
      why: `UBC IAM has never been recorded registering this app: the registration is '${row.state}'${ticket(row.externalTicketRef)}. Nothing reaches production until an administrator records it 'active' (§9).`,
    }
  if (row.state === 'expired')
    return {
      ...IAM_BASE,
      state: 'unmet',
      why: `The registration lapsed (D20)${ticket(row.externalTicketRef)} — nothing reaches production until UBC IAM registers it again and an administrator records it 'active' (§9).`,
    }
  const since = `since ${row.registeredAt.toISOString().slice(0, 10)}`
  if (would === undefined)
    return {
      ...IAM_BASE,
      state: 'met',
      why: `Registered with UBC IAM as ${row.entityId} ${since}${ticket(row.externalTicketRef)}.${changeRequestOnFile(row)}`,
    }
  const coverage = registrationCovers(row, would)
  if (!coverage.covers)
    return {
      ...IAM_BASE,
      state: 'unmet',
      why: coverageGap(row, would, coverage, 'This release'),
    }
  return {
    ...IAM_BASE,
    state: 'met',
    why:
      `Registered as ${row.entityId} ${since}, releasing ${row.registeredAttributes.length} attribute(s): this release asks for nothing more, at the ACS and SLO UBC registered.` +
      (coverage.unused.length === 0
        ? ''
        : ` UBC IAM still releases ${[...coverage.unused].sort().join(', ')} to this app, which no longer asks for them — a change request would stop it (data minimisation).`) +
      changeRequestOnFile(row),
  }
}

/** What a release would register in production — what UBC's registration must cover (§9). */
export interface RegistrationShape {
  acsUrl: string
  sloUrl: string
  attributes: readonly string[]
}

/**
 * DOES WHAT UBC REGISTERED COVER WHAT THIS RELEASE WOULD REGISTER? (P6b Task 7) — THE ONE
 * STATEMENT OF *COVERS*, read by both `iamItem` (a first launch) and `liveRegistrationItem`
 * (a launched app), so the two checklists cannot disagree about it.
 *
 * Every attribute asked for must be registered (a subset, the same rule as the build's —
 * `unregisteredAttributes` is its one statement), and the ACS and SLO must be exactly the
 * registered ones: the IdP posts assertions and logout requests to what UBC holds, not to what
 * the app now says. `unused` is what UBC still releases that the app stopped asking for — not a
 * gap, and reported so a person can decide to narrow the registration.
 *
 * **Not the entityID**: it is `<entity base>/sp/<slug>/production`, which no release can move
 * (`rehearsalCovers` says the same), and `records.ts` refuses a record that changes it.
 */
export function registrationCovers(
  row: Pick<IamRegistrationRow, 'acsUrl' | 'sloUrl' | 'registeredAttributes'>,
  would: RegistrationShape,
): {
  covers: boolean
  missing: string[]
  unused: string[]
  acsDiffers: boolean
  sloDiffers: boolean
} {
  const missing = unregisteredAttributes(would.attributes, row.registeredAttributes)
  const unused = row.registeredAttributes.filter((a) => !would.attributes.includes(a))
  const acsDiffers = row.acsUrl !== would.acsUrl
  const sloDiffers = row.sloUrl !== would.sloUrl
  return {
    covers: missing.length === 0 && !acsDiffers && !sloDiffers,
    missing,
    unused,
    acsDiffers,
    sloDiffers,
  }
}

/** Why a registration does not cover a release, in words — one sentence per gap. */
function coverageGap(
  row: IamRegistrationRow,
  would: RegistrationShape,
  coverage: ReturnType<typeof registrationCovers>,
  subject: string,
): string {
  const sentences: string[] = []
  if (coverage.missing.length > 0)
    sentences.push(
      `${subject} asks for CWL attribute(s) UBC IAM did not register: ${coverage.missing.join(', ')}. Registered: ${[...row.registeredAttributes].sort().join(', ')}. A production release may request only what was registered (§7, §9), or students hit a broken login — ${
        row.requestedAttributes === null
          ? `raise an IAM change request${row.externalTicketRef === null ? '' : ` against ${row.externalTicketRef}`} (an administrator records it here as 'change_requested', with requestedAttributes), or remove the attribute(s) from auth.attributes and build again.`
          : `a change request is on file ('${row.state}'${ticket(row.externalTicketRef)}, asking for ${[...row.requestedAttributes].sort().join(', ')}); this release waits for UBC IAM to register it and an administrator to record it 'active'.`
      }`,
    )
  if (coverage.acsDiffers)
    sentences.push(
      `auth.callback moves the ACS to ${would.acsUrl}, but UBC IAM registered ${row.acsUrl} — sign-in responses would be posted where the app does not listen. Raise an IAM change request for the new ACS; it goes to production once an administrator records the registration 'active'.`,
    )
  if (coverage.sloDiffers)
    sentences.push(
      `auth.logout moves the SLO to ${would.sloUrl}, but UBC IAM registered ${row.sloUrl} — a sign-out would not reach the app. Raise an IAM change request for the new SLO.`,
    )
  return sentences.join(' ')
}

/** A change request on file, said once, for a registration that is otherwise covering. */
function changeRequestOnFile(row: IamRegistrationRow): string {
  if (row.requestedAttributes === null) return ''
  return ` A change request is on file ('${row.state}'${ticket(row.externalTicketRef)}, asking for ${[...row.requestedAttributes].sort().join(', ')}); until UBC registers it, releases are checked against what it registered.`
}

const ticket = (ref: string | null) => (ref === null ? '' : ` (ticket ${ref})`)

/** Both IAM items' shared fields. */
const IAM_BASE = {
  id: 'iam-registration' as const,
  title: 'Registered with UBC IAM',
  owner: 'UBC IAM, recorded by a platform administrator (§9)',
  blocking: true,
}

/** Both clauses: an app that signs nobody in registers nothing. */
const NOT_CWL_ITEM: LaunchItem = {
  ...IAM_BASE,
  owner: 'UBC IAM',
  state: 'met',
  why: 'This app does not sign people in with CWL, so it needs no IAM registration.',
}

/**
 * §13's fifth blocking item, and the one Task 10 bought. Until this task it read
 * `not_built` / `builtBy: 'P6'` — *"approvals are built with production environments"* —
 * which stopped being true the moment `POST /v1/releases/{id}/approve` existed.
 *
 * Five states, each a fact about a row an administrator wrote:
 *
 *  - `unmet` when nothing is serving staging: there is no release to approve.
 *  - `unmet` when the candidate has never been decided on.
 *  - `unmet` when it was REJECTED, in the administrator's own words (D23.7).
 *  - `unmet` when it was approved and then REBUILT — Decision 11, in words.
 *  - `met` when a live approval binds the digest that would actually be deployed.
 *
 * **`builtBy` is gone from this item**, and a reader who finds it again should treat that
 * as a regression: it names the plan that will build a thing, and this thing is built.
 */
async function approvalItem(
  db: Db,
  candidate:
    | { release: typeof releases.$inferSelect; build: typeof builds.$inferSelect }
    | undefined,
): Promise<LaunchItem> {
  const base = {
    id: 'admin-approval' as const,
    title: 'Release approved by a platform administrator',
    owner: 'platform admin',
    blocking: true,
  }
  if (candidate === undefined)
    return {
      ...base,
      state: 'unmet',
      why: 'Nothing is serving in staging yet, so there is no release to approve. Production runs exactly what staging ran (§13).',
    }
  const approval = await latestApprovalFor(db, candidate.release.id)
  if (approval === undefined)
    return {
      ...base,
      state: 'unmet',
      why: 'An administrator approves the exact image digest, with step-up re-authentication (§13, §20). This release has not been reviewed yet.',
    }
  if (approval.decision === 'rejected')
    return {
      ...base,
      state: 'unmet',
      why: `An administrator did not approve this release: ${approval.reason}`,
    }
  if (!approvalCoversDigest(approval, candidate.build.imageDigest ?? ''))
    // DECISION 11, IN WORDS. It reads as a bug the first time somebody meets it, so the
    // checklist explains it rather than reverting to the generic unmet text.
    return {
      ...base,
      state: 'unmet',
      why: 'This release was rebuilt since it was approved, so the approval no longer covers what would be deployed — the approval binds an image digest (§13). Approve the new build.',
    }
  return {
    ...base,
    state: 'met',
    why: `Approved by an administrator on ${approval.decidedAt.toISOString().slice(0, 10)}, bound to image digest ${approval.imageDigest.slice(0, 19)}…`,
  }
}

/**
 * §13 D9.2's `admin-approval` for a LAUNCHED app (P6b Task 6), from Task 5's rule —
 * `productionApprovalFor`, the SAME function `deployRelease` reads, so the view and the
 * gate's second half cannot disagree either.
 *
 * It returns the item AND the three facts the view carries (`baselineReleaseId`,
 * `sensitiveFields`, `reescalated`) from ONE verdict, so there is one derivation of each.
 *
 *  - `unmet` when nothing is serving staging: there is no release to promote.
 *  - `unmet` when an administrator REJECTED the candidate, in their own words — and never
 *    `reescalated`, because an approval cannot fix a rejection already made (Decision 7).
 *  - `met`, self-serve, when no sensitive field changed since the last approved release.
 *  - `met` when an approval covers the candidate's digest — worded for what it covers: a
 *    sensitive change, or the release's OWN approval when nothing else is approved to
 *    compare with (the launch release redeployed — sitting 3's F9).
 *  - `unmet`, `reescalated`, otherwise.
 */
async function releaseApprovalItem(
  db: Db,
  candidate: LaunchCandidate | undefined,
): Promise<{
  item: LaunchItem
  baselineReleaseId: string | null
  sensitiveFields: SensitiveField[]
  reescalated: boolean
}> {
  const base = {
    id: 'admin-approval' as const,
    title:
      'Release approved by a platform administrator — only when a sensitive field changed (D9)',
    owner: 'platform admin',
    blocking: true,
  }
  if (candidate === undefined)
    return {
      item: {
        ...base,
        state: 'unmet',
        why: 'Nothing is serving in staging yet, so there is no release to promote. Production runs exactly what staging ran (§13).',
      },
      baselineReleaseId: null,
      sensitiveFields: [],
      reescalated: false,
    }
  const v = await productionApprovalFor(
    db,
    candidate.release,
    candidate.build.imageDigest ?? '',
  )
  const facts = {
    baselineReleaseId: v.requirement.baselineReleaseId,
    sensitiveFields: [...v.requirement.fields],
    reescalated: v.requirement.required && !v.covered && !v.rejected,
  }
  const fields = v.requirement.fields.join(', ')
  if (v.rejected)
    return {
      ...facts,
      item: {
        ...base,
        state: 'unmet',
        why: `An administrator did not approve this release: ${v.latest!.reason}. A rejection is final for this release (§13); build and release again.`,
      },
    }
  if (!v.requirement.required)
    return {
      ...facts,
      item: {
        ...base,
        state: 'met',
        why: 'No sensitive field (§7) changed since the last approved release, so this release goes to production self-serve (D9). Its code is not reviewed: that is §13’s residual risk, and containment is its control (§20).',
      },
    }
  if (v.covered) {
    const on = `on ${v.latest!.decidedAt.toISOString().slice(0, 10)}, bound to ${v.latest!.imageDigest.slice(0, 19)}…`
    return {
      ...facts,
      item: {
        ...base,
        state: 'met',
        why:
          v.requirement.fields.length > 0
            ? `This release changes ${fields} since the last approved release, and an administrator approved it ${on}`
            : `An administrator approved this release itself ${on} No other approved release exists to compare it with, so its own approval is what covers it (§13, D9).`,
      },
    }
  }
  return {
    ...facts,
    item: {
      ...base,
      state: 'unmet',
      why:
        v.requirement.reason === 'sensitive'
          ? `This release changes ${fields} since the last approved release, so an administrator must approve it before it goes to production (§13, D9).`
          : 'This app has launched, but no approved release exists to compare this one with — so it needs an administrator’s approval, and so will every release until one is approved (§13, D9).',
    },
  }
}

/**
 * §13's second blocking item, the same shape over §9's three PIA states — and its `met`
 * case NAMES THE REVIEWER AND THE DATE, because this checklist is read by a faculty
 * member who wants to know *who* said yes and *when*, not that a boolean flipped.
 *
 * `approvedAt` is set when the record reaches `approved` and cleared when it leaves
 * (sitting 4's decision 4), so a date here is always a date this state was reached on.
 */
async function piaItem(db: Db, projectId: string): Promise<LaunchItem> {
  const base = {
    id: 'privacy-assessment' as const,
    title: 'Privacy Impact Assessment approved',
    owner: 'UBC Privacy Office, recorded by a platform administrator (§9)',
    blocking: true,
  }
  const row = await getPrivacyAssessment(db, projectId)
  if (row === undefined)
    return {
      ...base,
      state: 'unmet',
      why: 'A Privacy Impact Assessment is required before a production launch (§9), with a multi-week lead time. Nothing has been recorded for this project yet — an administrator records what the UBC Privacy Office said, with the ticket reference.',
    }
  if (row.state === 'approved')
    return {
      ...base,
      state: 'met',
      why:
        `Approved by ${row.reviewer ?? 'the UBC Privacy Office'}` +
        `${row.approvedAt === null ? '' : ` on ${row.approvedAt.toISOString().slice(0, 10)}`}` +
        `${ticket(row.externalTicketRef)}.`,
    }
  return {
    ...base,
    state: 'unmet',
    // BOTH CLAUSES (P6b sitting 4, F14): §9 blocks production until the PIA is approved, so
    // a launched app whose PIA went back to `draft` stops shipping too — not only a first launch.
    why: `The assessment is '${row.state}'${ticket(row.externalTicketRef)} and must be 'approved' before anything goes to production (§9).`,
  }
}

function scansItem(
  scan: ScanSummary | null | undefined,
  hasCandidate: boolean,
): LaunchItem {
  const base = {
    id: 'scans' as const,
    title: 'Dependency and secret scans clean',
    owner: 'Manifest',
    blocking: true,
  }
  if (!hasCandidate) {
    return {
      ...base,
      state: 'unmet',
      why: 'Nothing is serving in staging yet, so there is no release to launch. Deploy to staging first — production runs exactly what staging ran (§13).',
    }
  }
  if (scan === null || scan === undefined) {
    return {
      ...base,
      state: 'unmet',
      why: 'The release serving staging was built before scans were recorded. Build and deploy it again.',
    }
  }
  // ONE guard, not two. `stale` is `assessScan`'s own verdict and is read FIRST; the age
  // comparison behind it is a deliberate second opinion on a stored summary the platform
  // wrote, never a re-derivation that could disagree — a `||` rather than a second branch,
  // so removing this guard removes the whole check and both tests below go red. Null means
  // the scanner did not say how old its database was, `scanImage` reads that as stale, and
  // `null > 7` is false — so the coalesce, not a comparison against null (P5a Task 13).
  if (scan.stale || (scan.databaseAgeDays ?? Infinity) > STALENESS_THRESHOLD_DAYS) {
    const age =
      scan.databaseAgeDays === null
        ? 'of unknown age'
        : `${scan.databaseAgeDays} days old, more than ${STALENESS_THRESHOLD_DAYS}`
    return {
      ...base,
      state: 'unmet',
      why: `The release serving staging was scanned against a vulnerability database ${age}. A clean result from a stale database is not evidence (§12); rebuild once the database is refreshed.`,
    }
  }
  const unfixable = Object.values(scan.unfixable).reduce((a, b) => a + b, 0)
  // `baseImageKnown: false` means every finding was attributed to the app, so the base
  // image's own count is a zero nobody could have counted (§12, P5a Task 13).
  const attribution = scan.baseImageKnown
    ? ''
    : ' The base image could not be identified, so every finding is attributed to this build.'
  return {
    ...base,
    state: 'met',
    why: `Its secret and lockfile gates passed and no finding it introduced has a published fix. ${unfixable} finding(s) with no published fix are recorded on the release (§12).${attribution}`,
  }
}
