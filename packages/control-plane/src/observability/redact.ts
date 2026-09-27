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
export const MIN_SECRET_LENGTH = 6

export type Redactor = (value: unknown) => unknown

/**
 * §14's redactor for LINES THAT MUST STAY LINES — an app's recent output and an Incident's log
 * tail (the front-end enablement plan's Task 2, its whole-branch review's C1 and I2). What
 * `makeRedactor` answers; a reader of output takes nothing less.
 */
export interface LineRedactor {
  (value: unknown): unknown
  /**
   * The lines redacted JOINED — so a secret from the set, or a PEM block, that spans lines is
   * matched whole, exactly as a joined text is — and answered one entry per line: every line a
   * match covered reads `[REDACTED]`, and a line it covered only in part keeps the rest.
   * Redacting line by line instead leaves a key's body behind, and a per-line pass run BEFORE
   * a joined one changes a line inside a multi-line secret so its exact match fails.
   */
  lines(lines: readonly string[]): string[]
  /**
   * The end of a line the runtime CUT, made safe to redact: a cut can leave the first
   * characters of a secret, which no exact match ever finds. It drops the longest ending that
   * begins a secret in the set, then an ending run of token characters too short for the
   * entropy rule to judge (under 24). A whole secret before the cut is kept, for the redactor.
   */
  trimCut(text: string): string
  /** The UTF-8 length of the longest secret in the set, or 0 — the room a cut must leave. */
  readonly longestSecretBytes: number
}

function escapeForRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** One of §14's pattern heuristics, as a function of the text it redacts. */
export interface Heuristic {
  readonly name: string
  /** `keepLines`: a match that spans lines answers one `[REDACTED]` per line it covered. */
  apply(text: string, keepLines: boolean): string
}

/** What a match that spans lines becomes when lines must stay lines: one `[REDACTED]` each. */
const perLine = (match: string): string =>
  match
    .split('\n')
    .map((piece) => (piece === '' ? '' : REDACTED))
    .join('\n')

/** A rule that is one regular expression, replaced as `String.replace` replaces it. */
const byPattern = (name: string, pattern: RegExp, replacement: string): Heuristic => ({
  name,
  apply: (text) => text.replace(pattern, replacement),
})

const PEM_HEADER = /-----BEGIN [A-Z ]*PRIVATE KEY-----/g
const PEM_FOOTER = /-----END [A-Z ]*PRIVATE KEY-----/g

/**
 * The whole block, header to footer: a key is many lines, and a line-by-line redactor leaves
 * the body behind. **Read once** (the front-end enablement plan's Task 5, `[S3]`'s class): the
 * first header, then the first footer after it — and when there is none, no later header has
 * one either, so it stops. As one expression, `HEADER[\s\S]*?FOOTER` read to the end of the text
 * again from every header: 11 s for 1 MiB of headers.
 */
function redactPemBlocks(text: string, keepLines: boolean): string {
  let out = ''
  let last = 0
  for (;;) {
    PEM_HEADER.lastIndex = last
    const header = PEM_HEADER.exec(text)
    if (header === null) break
    PEM_FOOTER.lastIndex = header.index + header[0].length
    const footer = PEM_FOOTER.exec(text)
    if (footer === null) break
    const end = footer.index + footer[0].length
    const block = text.slice(header.index, end)
    out += text.slice(last, header.index) + (keepLines ? perLine(block) : REDACTED)
    last = end
  }
  return out + text.slice(last)
}

/**
 * A JWT, found from its FIRST DOT, reading back to `eyJ` with a lookbehind whose capture says
 * where the token begins (`d`). Read once: as `\beyJ[…]{8,}\.…`, the rule read a whole run again
 * from every `eyJ` in it (~100 s for a crafted 1 MiB line).
 */
const JWT_AT_ITS_FIRST_DOT =
  /\.(?<=\b(eyJ)[A-Za-z0-9_-]{8,}\.)[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/dg

function redactJwts(text: string): string {
  let out = ''
  let last = 0
  JWT_AT_ITS_FIRST_DOT.lastIndex = 0
  for (;;) {
    const found = JWT_AT_ITS_FIRST_DOT.exec(text)
    if (found === null) break
    const start = found.indices![1]![0]
    if (start < last) {
      // Its opening is inside the token just redacted, whose last part took the whole run: not
      // a token the rule reads. Look again from the next character, not from this match's end,
      // or a token that begins inside it is missed.
      JWT_AT_ITS_FIRST_DOT.lastIndex = found.index + 1
      continue
    }
    out += text.slice(last, start) + REDACTED
    last = found.index + found[0].length
  }
  return out + text.slice(last)
}

/**
 * §14's pattern heuristics (P4b Task 12). Ordered, and each is anchored on
 * something a SECRET has and prose does not — a PEM armour, a scheme with a
 * credential, a JWT's three base64url segments, a known key prefix, the word
 * Bearer.
 *
 * They run BEFORE the entropy rule, which is the only rule that can be wrong about
 * ordinary text, and the order is observable in one place: a JWT whose payload and
 * signature segments are 24+ characters is redacted whole this way, and in pieces
 * the other — `eyJhbGciOiJIUzI1NiJ9.[REDACTED].[REDACTED]` (measured 2026-09-14).
 *
 * **Each reads a line in time linear in its length** (the front-end enablement plan's Task 5):
 * the redactor reads an app's output, an Incident's tail and every line of a build's log, and
 * three of these rules, written as they read, were quadratic — a crafted line blocked the event
 * loop for minutes. `redact.test.ts` holds each rewritten rule to its old expression's answer.
 */
export const HEURISTICS: readonly Heuristic[] = [
  { name: 'a PEM private key block', apply: redactPemBlocks },
  // The password only; the host and database are what make the line diagnosable.
  // The password holds no `/` — RFC 3986 userinfo cannot — and that is not a nicety:
  // measured 2026-09-14, `[^\s@]+` read `4873/` as the password in npm's
  // `GET http://manifest-verdaccio:4873/@scope%2fpkg`, a scoped package's 404.
  // Found from its `://`, reading back to the scheme: as `\b[a-z][a-z0-9+.-]*:\/\/…`, the rule
  // read a run of scheme characters again from every word in it (~280 s for 1 MiB of `a.`).
  byPattern(
    'a credential in a URL',
    /:\/\/(?<=\b[a-z][a-z0-9+.-]*:\/\/)([^\s:/@]+:)([^\s@/]+)@/gi,
    `://$1${REDACTED}@`,
  ),
  { name: 'a JSON Web Token', apply: redactJwts },
  byPattern('an API key', /\bsk-[A-Za-z0-9_-]{16,}/g, REDACTED),
  byPattern('a bearer token', /(\bBearer\s+)[A-Za-z0-9._~+/=-]{16,}/gi, `$1${REDACTED}`),
]

/**
 * A digest or integrity value is ONE token, slashes included, and is never a
 * secret: it is an identifier, and §13 binds approvals to it. Otherwise a token is
 * a run of [A-Za-z0-9+_-] with at most two trailing '=' (base64 padding) — so '/',
 * '.', ':' and an INTERIOR '=' all end a token. That keeps a path, a hostname and
 * the NAME in NAME=value out of the candidate set, and leaves only the value to
 * judge. (Rich, 2026-09-14: the pre-flight's recommendation, refined by
 * measurement — P4b Task 12.)
 */
const TOKEN = /sha(?:1|256|384|512)[:-][A-Za-z0-9+/=]+|[A-Za-z0-9+_-]+={0,2}/g

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Shannon entropy, in bits per character. */
function shannonEntropy(text: string): number {
  const counts = new Map<string, number>()
  for (const ch of text) counts.set(ch, (counts.get(ch) ?? 0) + 1)
  let bits = 0
  for (const n of counts.values()) {
    const p = n / text.length
    bits -= p * Math.log2(p)
  }
  return bits
}

/**
 * Secret-shaped: 24+ characters without padding; upper case AND lower case AND a
 * digit — random base64 and base62 have all three, while words, paths, container
 * names, SCREAMING_SNAKE codes and hex do not; not hex and not a UUID; and Shannon
 * entropy above 3.0 bits per character.
 *
 * **The 24 is load-bearing twice.** `[REDACTED]` is 10 characters and so can never
 * be a candidate, which is what makes a second pass a no-op; and at 8, an advisory
 * id like `GHSA-4mxg-3p6v-xgq3` is redacted out of a scan report (measured).
 *
 * What it gives up, measured on 1,000 random values of each shape (2026-09-14):
 * it redacts ~90% of 44-character base64, ~67% of 24-character base64, ~100% of
 * base64url — and 0% of hex, by design. Every secret the platform generates is hex
 * and sits in its app's secret set, where the exact-match half redacts it; §14
 * already says heuristics miss things.
 */
function secretShaped(token: string): boolean {
  if (/^sha(?:1|256|384|512)[:-]/.test(token)) return false
  const run = token.replace(/=+$/, '')
  if (run.length < 24) return false
  if (!(/[A-Z]/.test(run) && /[a-z]/.test(run) && /[0-9]/.test(run))) return false
  if (/^[0-9a-f]+$/i.test(run) || UUID.test(run)) return false
  return shannonEntropy(run) > 3.0
}

/**
 * The PEM rule is the one heuristic that spans lines; with `keepLines` it answers one
 * `[REDACTED]` per line it covered. The others match within a line (`Bearer\s+` may cross one,
 * and keeps it: its replacement keeps the whitespace).
 */
function redactHeuristically(text: string, keepLines = false): string {
  let out = text
  for (const heuristic of HEURISTICS) out = heuristic.apply(out, keepLines)
  return out.replace(TOKEN, (token) => (secretShaped(token) ? REDACTED : token))
}

/** A character of an entropy-rule token (`TOKEN`, less the digest case). */
const TOKEN_CHAR = /[A-Za-z0-9+_-]/

/**
 * Where the token the text ENDS in begins — a run of token characters and at most two `=` —
 * or -1. Read backwards, once: `/[…]+={0,2}$/` tried every start in a long run before failing
 * at the end (`[S3]`'s class — 11 s for a cut line of 128 KiB).
 */
function tokenTailStart(text: string): number {
  let at = text.length
  for (let pads = 0; pads < 2 && at > 0 && text[at - 1] === '='; pads += 1) at -= 1
  const runEnd = at
  while (at > 0 && TOKEN_CHAR.test(text[at - 1]!)) at -= 1
  return at === runEnd ? -1 : at
}

/**
 * §14's redactor, in full: *"every value in the app's own secret set (an exact,
 * high-confidence match), plus entropy and pattern heuristics for tokens and
 * credential-bearing URLs."* The exact half is P4a's (Decision 11); the heuristics
 * are P4b Task 12's. §14 states the limit plainly and so does this: defence in
 * depth, not a guarantee — heuristics miss things.
 *
 * **Exact matches first, longest first.** A Mongo URI contains the password it was
 * built from, so the secret set routinely holds one value inside another. Redacting
 * the short one first leaves `[REDACTED]xyz` — still carrying the part that made
 * the long one unique, and looking redacted while it is not.
 *
 * **Then the heuristics, on every string, at every depth** — including when the
 * app has no secrets yet, which is the ordinary case on a first deploy and the only
 * case for a build log. An early return for an empty secret set used to skip them
 * entirely (P4b pre-flight 117).
 *
 * **JSON-faithful, because jsonb is what gets persisted.** The walk follows what
 * `JSON.stringify` would produce, `toJSON` included, so a `Date` is redacted as its
 * ISO string rather than flattened to `{}` by a naive object walk. §14's rule is
 * about the persisted form, so the persisted form is what this traverses.
 */
export function makeRedactor(secretValues: Iterable<string>): LineRedactor {
  const needles = [...new Set(secretValues)]
    .filter((value) => value.length >= MIN_SECRET_LENGTH)
    .sort((a, b) => b.length - a.length)

  const patterns = needles.map((needle) => new RegExp(escapeForRegExp(needle), 'g'))

  const redactString = (value: string): string =>
    redactHeuristically(
      patterns.reduce((text, pattern) => text.replace(pattern, REDACTED), value),
    )

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

  const lines = (texts: readonly string[]): string[] => {
    if (texts.length === 0) return []
    const joined = texts.join('\n')
    const exact = patterns.reduce(
      (text, pattern) => text.replace(pattern, perLine),
      joined,
    )
    const out = redactHeuristically(exact, true).split('\n')
    // One entry per line is the contract. Were it ever broken, text would be answered as a line
    // it is not — so fail closed rather than misattribute.
    return out.length === texts.length ? out : texts.map(() => REDACTED)
  }

  const trimCut = (text: string): string => {
    let end = text.length
    // The longest ending that is a PROPER prefix of a secret: a whole one is kept, for the
    // redactor to find; a part of one is what the cut left.
    for (const needle of needles) {
      const from = Math.max(0, text.length - (needle.length - 1))
      for (let at = from; at < text.length; at += 1) {
        if (at >= end) break
        // The first character first: a slice per position is quadratic in a 16 KiB secret.
        if (text[at] === needle[0] && needle.startsWith(text.slice(at))) {
          end = at
          break
        }
      }
    }
    const kept = text.slice(0, end)
    const tail = tokenTailStart(kept)
    return tail !== -1 && kept.length - tail < 24 ? kept.slice(0, tail) : kept
  }

  return Object.assign(walk, {
    lines,
    trimCut,
    longestSecretBytes: needles.reduce(
      (most, needle) => Math.max(most, Buffer.byteLength(needle, 'utf8')),
      0,
    ),
  })
}
