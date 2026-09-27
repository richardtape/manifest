/**
 * TEST SUPPORT for THE LIST (`secret-patterns.ts`): one sample per rule, and the corpus BOTH
 * copies of the scan loop are held to — `scanText` here, and driver 1's rendered `pre-receive`
 * hook (`source/pre-receive.test.ts`), which must name the same `path:line` and rule for every
 * entry (the D5 plan's Decision 14: *the hook's loop is the one thing written twice*).
 *
 * Every secret is ASSEMBLED from pieces, so no whole one sits in this repository's source for
 * a scanner of its own to trip on. None is live: the AWS key is AWS's documented example, and
 * the rest are shaped, not issued.
 */

const jwt = (payload: string) =>
  ['eyJhbGciOiJSUzI1NiJ9', payload, 'c2lnbmF0dXJlLW5vdC1yZWFs'].join('.')

/** One of each rule's shape, keyed by the rule's name. */
export const SAMPLE_SECRETS = {
  'an AWS access key id': 'AKIA' + 'IOSFODNN7EXAMPLE',
  'a private key block': '-----BEGIN RSA ' + 'PRIVATE KEY-----',
  'a GitHub token': 'ghp' + '_' + '0123456789abcdefghijABCDEFGHIJ012345',
  'a Slack token': 'xox' + 'b-0123456789-abcdefghij',
  'a Google API key': 'AIza' + 'SyA-0123456789abcdefghijABCDEFGHIJK',
  'a JSON Web Token': jwt('eyJzdWIiOiJjYW5hcnkifQ'),
  'a generic assigned secret': 'password = "' + 'correct-horse-battery-staple"',
  // GitHub's STATELESS installation token (the D5 plan's Read this first 4): the App id, then
  // a JWT — the format neither older rule catches.
  'a GitHub App installation token': 'ghs' + '_1234567_' + jwt('eyJpc3MiOiIxMjM0NTY3In0'),
  'a GitHub fine-grained token':
    'github' + '_pat_' + '11ABCDEFG0123456789_abcdefghijklmnop',
} as const satisfies Record<string, string>

/** `unit` repeated to exactly `length` characters. */
const repeatTo = (unit: string, length: number) =>
  unit.repeat(Math.ceil(length / unit.length)).slice(0, length)

/** A text write's limit (`createCommit`), and so the longest line the API can hand a scan. */
const MIB = 1024 * 1024

/**
 * LINES BUILT TO MAKE A RULE BACKTRACK (the front-end enablement plan's Task 5, `[S3]`), 1 MiB
 * each. Most are one long run of `[A-Za-z0-9_-]` with a rule's opening every few bytes and never
 * the dot its first part must end at, so a rule written `\beyJ[…]{10,}\.` reads the whole run
 * again from every opening: quadratic, ~100 s for the first line below until 2026-09-27. The
 * rest aim at the linear form's own reads — a dot every ten bytes, one dot then a run with no
 * second. **None of them is a secret**: scanned, each finds nothing.
 */
export const BACKTRACKING_LINES: Readonly<Record<string, string>> = {
  'JWT openings, and no dot': repeatTo('-eyJaaaaaaaaaa', MIB),
  'JWT openings, then ONE dot and a second part with no dot after it': `${repeatTo('-eyJaaaaaaaaaa', MIB - 13)}.bbbbbbbbbbbb`,
  'installation-token openings, and no dot': repeatTo('-ghs_1_aaaaaaaaaa', MIB),
  'installation-token openings with long App ids': repeatTo('-ghs_1111111111_', MIB),
  'a dot every ten bytes': repeatTo('aaaaaaaaa.', MIB),
  'one opening and a dot, then a run with no second dot': `eyJaaaaaaaaaaaa.${repeatTo('-', MIB - 16)}`,
}

export interface CorpusEntry {
  /** What the entry is for, in a test's name. */
  name: string
  path: string
  text: string
}

const S = SAMPLE_SECRETS

/**
 * The files both loops are run over. Each is committed ALONE by the hook's test, so the answer
 * for one entry never depends on another.
 */
export const SECRET_CORPUS: readonly CorpusEntry[] = [
  ...Object.entries(S).map(([rule, secret], i) => ({
    name: `${rule}, on line ${i + 2}`,
    path: `samples/rule-${i}.txt`,
    // The secret on a line whose number depends on the entry, so a scanner that counts
    // lines from zero, or from a hunk's start, names the wrong one.
    text: `${Array.from({ length: i + 1 }, (_, n) => `line ${n + 1}`).join('\n')}\nvalue: ${secret}\n`,
  })),
  {
    // Two rules on ONE line: the FIRST in the list names it, and only once (the `break`).
    name: 'two rules on one line — the first names it',
    path: 'config/two.js',
    text: `// header\nconst key = "${S['an AWS access key id']}"; // api_key = "${S['an AWS access key id']}"\n`,
  },
  {
    name: 'two secrets on two lines of one file',
    path: 'deploy/.env',
    text: `A=1\nSLACK=${S['a Slack token']}\nB=2\nC=3\nGOOGLE=${S['a Google API key']}\n`,
  },
  {
    // A 1 MiB line of both backtracking openings, a real token at its end: the hook and the
    // build's gate read it as fast as `scanText` does, and still name the token (`[S3]`).
    name: 'a 1 MiB line built to make the scan backtrack, a JWT at its end',
    path: 'public/bundle.min.js',
    text: `// built\n${repeatTo('-eyJaaaaaaaaaa-ghs_1_aaaaaaaaaa', MIB)} ${S['a JSON Web Token']}\n`,
  },
  {
    name: 'a file with nothing secret-shaped in it',
    path: 'src/clean.js',
    text: "export const greeting = 'hello'\n// eyJ is only a prefix; AKIA alone is not a key\n",
  },
]
