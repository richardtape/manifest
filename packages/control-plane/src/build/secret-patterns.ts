/**
 * THE LIST (the D5 plan's Task 11, Decision 14): every secret-shaped value Manifest refuses,
 * in ONE place. The build's gate reads it (`gates.ts`); so do a source driver's scan of its
 * OWN commits before they leave, driver 2's scan of every commit its mirror learns of
 * (`source/scan-commits.ts`), and driver 1's `pre-receive` hook, which is RENDERED from it
 * (`source/pre-receive.ts`) — so a rule added here reaches every path at the next boot.
 *
 * Pattern-based, so it works with the network off and never degrades — §12 draws exactly this
 * line between secret/lockfile scanning and vulnerability scanning. Each entry names what it
 * matches; **the match itself is NEVER kept**, because a finding becomes an Event, a refusal
 * message on the wire, or a line on a person's terminal, and §14 redacts at capture.
 *
 * **ORDER IS PART OF THE ANSWER**: the first rule that matches a line names it, and the scan
 * moves on to the next line. The two rules added last therefore change no earlier answer — a
 * line holding a classic `ghs_` token still reads *a GitHub token*.
 */
export interface SecretPattern {
  readonly name: string
  readonly pattern: RegExp
}

export const SECRET_PATTERNS: readonly SecretPattern[] = [
  { name: 'an AWS access key id', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  {
    name: 'a private key block',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/,
  },
  { name: 'a GitHub token', pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: 'a Slack token', pattern: /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'a Google API key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  // LINEAR, NOT AS IT READS (the front-end enablement plan's Task 5, `[S3]`): the match begins
  // at the token's FIRST DOT and reads BACK to `eyJ` with a lookbehind, so a run of
  // `[A-Za-z0-9_-]` is read once, by the dot that ends it. Written `\beyJ[…]{10,}\.…`, the rule
  // read the whole run again from every `eyJ` in it: one crafted 1 MiB line took 100 s, the
  // event loop blocked, three times per commit. The two forms answer the same —
  // `secret-patterns.test.ts` holds this one to the old over 20,000 generated lines — and
  // nothing asks a rule WHERE it matched, only whether (`scanText`, the hook). The installation
  // token's rule below has the same shape and the same fix.
  {
    name: 'a JSON Web Token',
    pattern: /\.(?<=\beyJ[A-Za-z0-9_-]{10,}\.)[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  },
  {
    name: 'a generic assigned secret',
    pattern: /\b(?:secret|password|passwd|api[_-]?key)\s*[:=]\s*['"][^'"\s]{12,}['"]/i,
  },
  // D5 plan (Read this first 4): GitHub's stateless installation token, `ghs_<APPID>_<JWT>`,
  // rolled out from 2026-04-27 — and this plan puts such tokens into circulation. Neither
  // rule above catches it: *a GitHub token* needs 36 alphanumerics after `ghs_` and meets `_`
  // after the App id; *a JSON Web Token*'s `\beyJ` finds no word boundary after `_`.
  // Measured (Task 1, `[M6]`).
  {
    name: 'a GitHub App installation token',
    pattern:
      /\.(?<=\bghs_\d+_[A-Za-z0-9_-]{10,}\.)[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  },
  { name: 'a GitHub fine-grained token', pattern: /\bgithub_pat_[A-Za-z0-9_]{22,}/ },
]

/** Where a secret-shaped value is, and which rule saw it — NEVER the value (§14). */
export interface SecretFinding {
  path: string
  line: number
  rule: string
}

/**
 * Every line of `text` that some rule matches, named by the FIRST rule that does. `path` is
 * only carried through. The one TypeScript copy of the loop; driver 1's hook holds the other,
 * in plain JavaScript, and `source/pre-receive.test.ts` holds the two to one answer.
 */
export function scanText(text: string, path: string): SecretFinding[] {
  const out: SecretFinding[] = []
  for (const [i, line] of text.split('\n').entries()) {
    for (const { name, pattern } of SECRET_PATTERNS) {
      if (!pattern.test(line)) continue
      out.push({ path, line: i + 1, rule: name })
      break
    }
  }
  return out
}
