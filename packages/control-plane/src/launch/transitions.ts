import type { iamRegistrationState, privacyAssessmentState } from '../db/index.js'

export type IamState = (typeof iamRegistrationState.enumValues)[number]
export type PiaState = (typeof privacyAssessmentState.enumValues)[number]

/**
 * `launch/`'s refusals, as one class with a stable code — the same shape as `SsoError`,
 * `SecretError` and `ReleaseError`, and **deliberately not `api/`'s `BadRequestError`**:
 * `api/routes/` imports `launch/`, so the dependency runs the other way and importing
 * upward would be a cycle. `api/errors.ts` maps this class by `instanceof` and
 * `api/error-codes.ts` registers its code once, with its status.
 *
 * **The code is a constructor argument rather than a fixed field**, because that is what
 * `error-codes.test.ts` can see: its scan reads `readonly code = '…'` only under `api/`,
 * and reads `new <WireClass>('CODE'` everywhere. A fixed field here would leave the
 * registry unable to name the code without the *"registers nothing the source never
 * throws"* direction going red.
 */
export class LaunchTransitionError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'LaunchTransitionError'
  }
}

/**
 * §9's two state machines, as the ARROWS THAT EXIST rather than as a column anyone may set.
 *
 * Without this an administrator moves a PIA from `draft` straight to `approved` — the gate
 * is satisfied by something that was never submitted, and the only evidence is a typo. §13's
 * *Integrity of the gate* is about exactly this class of hole.
 *
 * PURE, and table-driven, so the arrows are readable as a fact rather than as control flow.
 * `launch/records.ts` is the caller and the tests drive these directly.
 */
const IAM_ARROWS: Record<IamState, readonly IamState[]> = {
  draft: ['submitted'],
  // WITH THE MANIFEST TEAM (the FE-46/47/5 plan's Decision 4): no generic arrow in or out. The owner's send
  // puts a record here and only the team's submission or hand-back takes it out (`records.ts`).
  sent: [],
  // §9: a registration can come back with questions, and it can lapse (D20's cert expiry).
  submitted: ['active', 'change_requested'],
  active: ['change_requested', 'expired'],
  change_requested: ['submitted', 'expired'],
  // A lapsed registration is re-registered, which is a new submission.
  expired: ['submitted'],
}

const PIA_ARROWS: Record<PiaState, readonly PiaState[]> = {
  draft: ['submitted'],
  // With the Manifest team, as the registration's `sent` is: no generic arrow in or out.
  sent: [],
  // §9 names no rejection state: a refused PIA goes back to draft with the note.
  submitted: ['approved', 'draft'],
  approved: ['draft'],
}

/**
 * The one refusal both machines make, with its message built where a person reads it.
 * The noun differs because the person reading it is an administrator looking at one of
 * two different things, not a developer reading a stack trace — so `what` carries its own
 * article ("an IAM registration", "a privacy assessment") rather than the template
 * prepending one, which read "a IAM registration" until control (a) printed it.
 */
function refuseArrow(
  what: string,
  from: string,
  to: string,
  allowed: readonly string[],
): never {
  throw new LaunchTransitionError(
    'LAUNCH_TRANSITION_INVALID',
    `${what} cannot go from '${from}' to '${to}' — from '${from}' it can only become ` +
      `${allowed.length === 0 ? 'nothing' : allowed.map((s) => `'${s}'`).join(' or ')}`,
  )
}

export function iamTransition(from: IamState, to: IamState): IamState {
  if (!IAM_ARROWS[from].includes(to))
    refuseArrow('an IAM registration', from, to, IAM_ARROWS[from])
  return to
}

/**
 * The same shape over `PIA_ARROWS`. **WRITTEN OUT, not generated from a higher-order
 * helper**: two tiny functions read better than one generic one, and the noun a person
 * sees in the refusal differs.
 */
export function piaTransition(from: PiaState, to: PiaState): PiaState {
  if (!PIA_ARROWS[from].includes(to))
    refuseArrow('a privacy assessment', from, to, PIA_ARROWS[from])
  return to
}

/** Where an owner's send may take a registration from — and where the team's hand-back returns it. */
export type SentFrom = 'draft' | 'change_requested' | 'expired' | 'active'

/**
 * WHERE AN OWNER'S SEND TO THE MANIFEST TEAM MAY TAKE A REGISTRATION FROM (§9; the FE-46/47/5 plan's
 * Decisions 5 and 6): a draft, once UBC asked the OWNER for changes (`change_requested` from `submitted`), or
 * once it lapsed. **Never** from `sent` (a second send would restart the team's clock), from what UBC holds
 * (`submitted`, or a change request the team FILED — `change_requested` from `active`, Decision 5), or from
 * what UBC decided. Null when it may not be sent; the state it is sent from otherwise, which `sent_from` keeps.
 */
export function iamSendableFrom(row: {
  state: IamState
  changeRequestedFrom: 'submitted' | 'active' | null
}): SentFrom | null {
  if (row.state === 'draft' || row.state === 'expired') return row.state
  if (row.state === 'change_requested' && row.changeRequestedFrom === 'submitted')
    return 'change_requested'
  return null
}

/** Where an owner's send may take the privacy assessment from: its draft. */
export const PIA_SENDABLE: ReadonlySet<PiaState> = new Set<PiaState>(['draft'])

/**
 * WHERE A HAND-BACK RETURNS A REGISTRATION: the state it was sent from, with its own origin (Decision 5) —
 * a registration sent from UBC's questions to the owner goes back to them, the owner's move again.
 */
export function iamReturnTo(sentFrom: SentFrom): {
  state: IamState
  changeRequestedFrom: 'submitted' | null
} {
  return sentFrom === 'change_requested'
    ? { state: 'change_requested', changeRequestedFrom: 'submitted' }
    : { state: sentFrom, changeRequestedFrom: null }
}

/** A send from a state the owner may not send from — the machines' code, a person's words. */
export function refuseSend(what: string, from: string, allowed: string): never {
  throw new LaunchTransitionError(
    'LAUNCH_TRANSITION_INVALID',
    `${what} that is ${from} cannot be sent to the Manifest team — it is sent from ${allowed}`,
  )
}

/**
 * A RECORD THE MANIFEST TEAM HOLDS, OR ONE THE GENERIC RECORD WOULD PUT THERE (Decision 4): `sent` is moved
 * into only by the owner's send and out of only by the team's submission or hand-back, so the generic record
 * route refuses both, naming the operations that do it.
 */
export function refuseRecordAroundTheTeam(
  what: 'the IAM registration' | 'the privacy assessment',
  from: string,
  to: string,
  ops: { send: string; submit: string; handBack: string },
): void {
  if (from === 'sent')
    throw new LaunchTransitionError(
      'LAUNCH_TRANSITION_INVALID',
      `${what} is with the Manifest team ('sent'): record that the team submitted it (${ops.submit}), or hand it back to its owner (${ops.handBack}) — it is not recorded here`,
    )
  if (to === 'sent')
    throw new LaunchTransitionError(
      'LAUNCH_TRANSITION_INVALID',
      `${what} goes to the Manifest team ('sent') only when its owner sends it (${ops.send}) — it is not recorded here`,
    )
}
