/** What a redacted value is replaced with. One constant, so tests cannot drift from it. */
export const REDACTED = '[REDACTED]'

/**
 * Below this length a secret matches too much to be useful as a needle.
 *
 * A one-character secret replaces every occurrence of that character and the
 * document comes back as noise; six is short enough to catch a real credential
 * and long enough that a match means something. A secret this short is a
 * configuration problem — the refusal is deliberate and it is silent by design,
 * because raising here would turn a weak password into a failed deploy.
 */
const MIN_SECRET_LENGTH = 6

export type Redactor = (value: unknown) => unknown

function escapeForRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * §14's exact-match redactor: every value in the app's own secret set, replaced.
 *
 * P4a ships this half only (Decision 11). The entropy and pattern heuristics, and
 * LiteLLM's error bodies, are P4b's — §14 is explicit that this is defence in
 * depth rather than a guarantee.
 *
 * **Longest first.** A Mongo URI contains the password it was built from, so the
 * secret set routinely holds one value inside another. Redacting the short one
 * first leaves `[REDACTED]xyz` — still carrying the part that made the long one
 * unique, and looking redacted while it is not.
 *
 * **JSON-faithful, because jsonb is what gets persisted.** The walk follows what
 * `JSON.stringify` would produce, `toJSON` included, so a `Date` is redacted as
 * its ISO string rather than flattened to `{}` by a naive object walk. §14's rule
 * is about the persisted form, so the persisted form is what this traverses.
 */
export function makeRedactor(secretValues: Iterable<string>): Redactor {
  const needles = [...new Set(secretValues)]
    .filter((value) => value.length >= MIN_SECRET_LENGTH)
    .sort((a, b) => b.length - a.length)

  if (needles.length === 0) return (value) => value

  const patterns = needles.map((needle) => new RegExp(escapeForRegExp(needle), 'g'))

  const redactString = (value: string): string =>
    patterns.reduce((text, pattern) => text.replace(pattern, REDACTED), value)

  const walk = (value: unknown): unknown => {
    if (typeof value === 'string') return redactString(value)
    if (value === null || typeof value !== 'object') return value
    if (Array.isArray(value)) return value.map(walk)
    const toJson = (value as { toJSON?: () => unknown }).toJSON
    if (typeof toJson === 'function') return walk(toJson.call(value))
    const out: Record<string, unknown> = {}
    for (const [key, nested] of Object.entries(value)) out[key] = walk(nested)
    return out
  }

  return walk
}
