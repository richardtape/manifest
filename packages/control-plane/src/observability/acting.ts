import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * WHO IS ACTING, for everything one mutating request causes (§26's non-repudiation, as Spec action 1
 * worded it; the faculty-ready plan's Task 10, Decision 13).
 *
 * `registerRoutes` enters it for a mutating `/v1` request once the credential is known, and
 * `recordEvent` reads it — so every event the request causes carries its actor without one being
 * threaded through some twenty-five call chains, and so do the events its work publishes LATER (a
 * build's end, a deploy's health), because an `AsyncLocalStorage` store follows the promises the
 * request started. A read enters none: a read is not an action, and an event a read happens to cause
 * (a mirror catching up with GitHub) is not the reader's.
 *
 * **ITS ONE WRITER AFTER ENTRY IS `assertCapability`**, which alone knows the project and whether the
 * person is a member of it: an administrator who is not, using an owner's capability, is refused
 * there without `offeredReason`, and with it the context is marked `asAdmin` and given the `reason`.
 * A leaf module, so `projects/` can import it without importing the rest of `observability/`.
 */
export interface Acting {
  /** The person — for a delegated token, the person who minted it. */
  userId: string
  /** Their name, as a sentence names them (never a PUID). What `EventFrame.actor.name` carries. */
  name: string
  /** Who acted, as a sentence begins: the name, or *"Ada's agent (token 'claude-code')"*. */
  phrase: string
  /**
   * The request's `Manifest-Admin-Reason`, decoded and trimmed — `null` when it sent none. Offered,
   * not yet recorded: only `assertCapability` decides it is needed.
   */
  offeredReason: string | null
  /** Set by `assertCapability`: an administrator, not a member, using an owner's capability. */
  asAdmin: boolean
  /** The reason recorded, set with `asAdmin` — `null` otherwise, whatever was offered. */
  reason: string | null
}

export const actingContext = new AsyncLocalStorage<Acting>()

/** The longest reason, in characters, once trimmed. */
export const ADMIN_REASON_MAX = 500

/**
 * The header's value as the person wrote it. A header carries only Latin-1 — a browser's `fetch` and
 * Node's both refuse to send `—` or `é` in one — so a client percent-encodes a reason as UTF-8
 * (`encodeURIComponent`), and it is decoded here; text that is not a valid encoding is taken as sent.
 * Trimmed, and `null` when nothing is left.
 */
export function offeredReasonOf(header: string | string[] | undefined): string | null {
  if (header === undefined) return null
  const raw = Array.isArray(header) ? header.join(', ') : header
  let decoded = raw
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    decoded = raw
  }
  const trimmed = decoded.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * A sentence that names who acted, when someone did: `Preparing x in staging` and `deployed by`
 * become *"Preparing x in staging, deployed by Ada."* — and with no acting context (a boot finishing
 * work, a webhook) the sentence as it always read, *"Preparing x in staging."*
 */
export function withActor(sentence: string, how: string): string {
  const acting = actingContext.getStore()
  return acting === undefined ? `${sentence}.` : `${sentence}, ${how} ${acting.phrase}.`
}
