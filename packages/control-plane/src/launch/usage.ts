/**
 * WHERE AN APP READS EACH CWL ATTRIBUTE (§9: *"the lines of the app's code that read it, found by a
 * bounded search"*; the launch path plan's Task 10, Decision 14, `[M9]`).
 *
 * The blueprint's bridge (`auth/attributes.js`) hands app code a signed-in person's attributes by
 * their FRIENDLY names, so the app reads one as a property: `req.user.user.mail`, `user.givenName`,
 * the browser's `me.attributes?.mail`, `user['sn']`. **A read is the name as a whole word, right after
 * a `.` (which `?.` ends in) or inside `['…']` / `["…"]`** — so `mailbox` is not `mail`, and neither is
 * the word in a comment's prose. That is a hint for a reviewer and the package says so: a name read
 * some other way is missed, and a property of the same name on something else is found. It is never
 * a proof that an attribute is unused.
 *
 * THE CALLER BOUNDS AND FILTERS THE TREE (Decision 14): text files only, at most 200 and 2 MiB, never
 * the blueprint's own `auth/` bridge — `launch/records.ts`'s `draftIamRegistration`.
 */

export interface AttributeUse {
  path: string
  /** 1-based. */
  line: number
}

/**
 * Not a bare `\b` after the name: a JavaScript name may go on with `$`, so `.mail$` is another
 * property — the lookahead refuses a word character or a `$` after it.
 */
function readPattern(name: string): RegExp {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:\\.${escaped}(?![\\w$])|\\[\\s*(['"])${escaped}\\1\\s*\\])`)
}

/**
 * Every place each name in `names` is read, in the order the tree was given and then by line — ONE
 * entry per line however often the line reads it. Every name asked about is answered, `[]` when the
 * app never reads it.
 */
export function findAttributeUses(
  tree: { path: string; text: string }[],
  names: readonly string[],
): Record<string, AttributeUse[]> {
  const patterns = names.map((name) => [name, readPattern(name)] as const)
  const uses: Record<string, AttributeUse[]> = Object.fromEntries(
    names.map((name) => [name, [] as AttributeUse[]]),
  )
  for (const file of tree) {
    file.text.split(/\r?\n/).forEach((text, i) => {
      for (const [name, pattern] of patterns)
        if (pattern.test(text)) uses[name]!.push({ path: file.path, line: i + 1 })
    })
  }
  return uses
}
