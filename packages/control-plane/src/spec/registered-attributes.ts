import { POLICY_CODES } from './policy.js'

/**
 * §7's last production clause, refused at BUILD time (P6a Task 13). A class of its own
 * rather than a `ManifestError` list, because it is thrown inside a running build and
 * `finishBuild` renders exactly `code`, `message` and `hint` into the failed build's row
 * and its log's last line — `BuildGateError`'s shape, for the same reason.
 *
 * **NOT IN `api/error-codes.ts`, DELIBERATELY.** That registry holds the codes an HTTP
 * envelope can carry, and this never reaches one: the build route has already answered
 * `202` by the time it is thrown. **The code is `SPEC_ATTRIBUTE_NOT_REGISTERED`** — the name
 * the contract has published in `ManifestErrorCode` since P2 for exactly this rule, so one
 * rule has one name. The plan's draft spelled a second one (`SPEC_ATTRIBUTES_UNREGISTERED`).
 */
export class AttributeDriftError extends Error {
  readonly code = POLICY_CODES.ATTRIBUTE_NOT_REGISTERED
  constructor(
    message: string,
    readonly hint: string,
  ) {
    super(message)
    this.name = 'AttributeDriftError'
  }
}

/**
 * What `requested` asks for that `registered` does not hold — each attribute once, sorted,
 * so two refusals for the same reason say it in the same words. **THE RULE'S ONE STATEMENT**
 * (P6a Task 13): the build refuses on it (`assertRegisteredAttributes` below) and §13's
 * `iam-registration` item reads it, because a release built BEFORE its registration was
 * recorded was never checked at build time, and §13 promotes it without rebuilding.
 */
export function unregisteredAttributes(
  requested: readonly string[],
  registered: readonly string[],
): string[] {
  return [...new Set(requested.filter((a) => !registered.includes(a)))].sort()
}

/**
 * §7's last production clause and §9's *Attribute drift is a build-time failure*: a build
 * may request only CWL attributes UBC IAM has REGISTERED for this app, or it fails —
 * *"long before a student would have hit a broken login."*
 *
 * **THE EMPTY-REGISTRATION CASE IS THE ONE THAT MATTERS.** Every set is a superset of
 * nothing, so a registration with no `registered_attributes` would make this check
 * vacuously true for an app that requests nothing — and it is refused here whatever the
 * app requests, because a registration that lists nothing is not one anything can be
 * checked against. The row cannot be empty (migration 0019's CHECK, and `records.ts`'s
 * refusal); this refuses it anyway, because a check that depends on a constraint elsewhere
 * is a check that stops working when that constraint moves.
 *
 * **THE MESSAGE IS THE "PRE-GENERATED CHANGE REQUEST" §9 ASKS FOR**, at the level this plan
 * builds: the app, every missing attribute, what IS registered, the ticket to raise it
 * against, and the other way out. P8 generates the document; this generates the sentence.
 *
 * Order-insensitive and duplicate-insensitive: it compares SETS, and it sorts what it
 * names so two builds refused for the same reason say it in the same words.
 */
export function assertRegisteredAttributes(
  requested: readonly string[],
  registered: readonly string[],
  context: {
    slug: string
    ticketRef: string | null
    /**
     * A CHANGE REQUEST ON FILE (P6b Task 7): the registration's state and what it asks for,
     * or null when none is outstanding. `[M9]` measured this message telling an owner to
     * raise a change request AGAINST the change request — so when one is on file, it says so.
     */
    changeRequest?: { state: string; requested: readonly string[] } | null
  },
): void {
  if (registered.length === 0)
    throw new AttributeDriftError(
      `this app's UBC IAM registration lists no attributes, so no build of ` +
        `'${context.slug}' can be checked against it (§9)`,
      'Record what UBC IAM actually registered, attributes included, before building again.',
    )
  const missing = unregisteredAttributes(requested, registered)
  if (missing.length === 0) return
  const pending = context.changeRequest ?? null
  throw new AttributeDriftError(
    `manifest.yaml asks for ${missing.length} CWL attribute(s) UBC IAM did not register ` +
      `for '${context.slug}': ${missing.join(', ')}. Registered: ` +
      `${[...new Set(registered)].sort().join(', ')}.`,
    'A production release must request a subset of what UBC IAM registered (§7, §9) — ' +
      'otherwise students hit a broken login on launch day. ' +
      (pending === null
        ? 'Raise an IAM change request' +
          `${context.ticketRef === null ? '' : ` against ${context.ticketRef}`} for the ` +
          "missing attribute(s) — an administrator records it on the project as 'change_requested', " +
          'with the attributes it asks for — or remove them from auth.attributes.'
        : `A change request is on file ('${pending.state}'` +
          `${context.ticketRef === null ? '' : `, ticket ${context.ticketRef}`}, asking for ` +
          `${[...new Set(pending.requested)].sort().join(', ')}): UBC IAM has not registered it yet, ` +
          "and this builds once an administrator records the registration 'active'. Or remove " +
          'them from auth.attributes.'),
  )
}
