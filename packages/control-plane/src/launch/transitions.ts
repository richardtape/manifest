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
  // §9: a registration can come back with questions, and it can lapse (D20's cert expiry).
  submitted: ['active', 'change_requested'],
  active: ['change_requested', 'expired'],
  change_requested: ['submitted', 'expired'],
  // A lapsed registration is re-registered, which is a new submission.
  expired: ['submitted'],
}

const PIA_ARROWS: Record<PiaState, readonly PiaState[]> = {
  draft: ['submitted'],
  // §9 names no rejection state: a refused PIA goes back to draft with the note.
  submitted: ['approved', 'draft'],
  approved: ['draft'],
}

/**
 * The one refusal both machines make, with its message built where a person reads it.
 * The noun differs because the person reading it is an administrator looking at one of
 * two different things, not a developer reading a stack trace.
 */
function refuseArrow(
  what: string,
  from: string,
  to: string,
  allowed: readonly string[],
): never {
  throw new LaunchTransitionError(
    'LAUNCH_TRANSITION_INVALID',
    `a ${what} cannot go from '${from}' to '${to}' — from '${from}' it can only become ` +
      `${allowed.length === 0 ? 'nothing' : allowed.map((s) => `'${s}'`).join(' or ')}`,
  )
}

export function iamTransition(from: IamState, to: IamState): IamState {
  if (!IAM_ARROWS[from].includes(to))
    refuseArrow('IAM registration', from, to, IAM_ARROWS[from])
  return to
}

/**
 * The same shape over `PIA_ARROWS`. **WRITTEN OUT, not generated from a higher-order
 * helper**: two tiny functions read better than one generic one, and the noun a person
 * sees in the refusal differs.
 */
export function piaTransition(from: PiaState, to: PiaState): PiaState {
  if (!PIA_ARROWS[from].includes(to))
    refuseArrow('privacy assessment', from, to, PIA_ARROWS[from])
  return to
}
