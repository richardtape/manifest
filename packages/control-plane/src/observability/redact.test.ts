import { describe, expect, it } from 'vitest'
import { HEURISTICS, makeRedactor, REDACTED } from './redact.js'

describe('redaction at capture (§14)', () => {
  it('replaces a secret wherever it appears, at any depth', () => {
    const redact = makeRedactor(['hunter2', 'sk-abc123'])
    expect(
      redact({
        uri: 'mongodb://app:hunter2@db:27017/x',
        nested: { key: 'Bearer sk-abc123' },
        list: ['hunter2'],
      }),
    ).toEqual({
      uri: `mongodb://app:${REDACTED}@db:27017/x`,
      nested: { key: `Bearer ${REDACTED}` },
      list: [REDACTED],
    })
  })

  it('replaces EVERY occurrence in one string, not just the first', () => {
    // An env dump repeats a password across MONGODB_URI, MONGO_PASSWORD and a
    // stack frame. Replacing only the first leaves the other two persisted, and
    // the row looks redacted.
    const redact = makeRedactor(['hunter2'])
    expect(redact('a=hunter2 b=hunter2 c=hunter2')).toBe(
      `a=${REDACTED} b=${REDACTED} c=${REDACTED}`,
    )
  })

  it('ignores a very short secret rather than redacting the whole document', () => {
    // A one-character secret would replace every occurrence of that character.
    // Refusing to use it is safer than a document redacted into uselessness —
    // and the refusal is visible, which a mangled document is not.
    const redact = makeRedactor(['a', 'hunter2'])
    expect(redact('a cat named hunter2')).toBe(`a cat named ${REDACTED}`)
  })

  it('redacts the longest match first, so a nested secret cannot leave a tail', () => {
    // Two service credentials where one contains the other — a real shape, since
    // a Mongo URI holds the password it was built from. Redacting the SHORT one
    // first turns the long one into `[REDACTED]xyz`, which still carries the
    // part that made it unique.
    const redact = makeRedactor(['hunter2', 'hunter2xyz'])
    expect(redact('token=hunter2xyz')).toBe(`token=${REDACTED}`)
  })

  it('leaves numbers, booleans and null alone', () => {
    const redact = makeRedactor(['hunter2'])
    expect(redact({ n: 1, b: true, z: null })).toEqual({ n: 1, b: true, z: null })
  })

  it('redacts a Date through its JSON form rather than destroying it', () => {
    // machine_detail is jsonb, so what gets persisted is the JSON form. A walker
    // that treated a Date as a plain object would store `{}` and lose the value.
    const redact = makeRedactor(['hunter2'])
    expect(redact({ at: new Date('2026-09-09T00:00:00.000Z') })).toEqual({
      at: '2026-09-09T00:00:00.000Z',
    })
  })

  it('changes nothing that is not secret-shaped when the app has no secrets yet', () => {
    // The first deploy of an app registers its SP before any service credential
    // exists, so this is the ordinary case rather than an edge one. It was called
    // "is a no-op" until P4b Task 12, and that stopped being true: an empty secret
    // set still runs the heuristics (pre-flight 117).
    const redact = makeRedactor([])
    expect(redact({ a: 'anything at all' })).toEqual({ a: 'anything at all' })
  })
})

describe('redaction heuristics (§14)', () => {
  // NO known secrets: heuristics only. Until Task 12, `makeRedactor([])` returned
  // before anything else ran (pre-flight 117), so every test here was green against
  // a redactor that redacted nothing.
  const redact = makeRedactor([])

  it('redacts the credential in a URL and keeps the rest of the URL', () => {
    // "credential-bearing URLs", section 14's own phrase. The host and database
    // are what makes the line diagnosable and they are not the secret.
    expect(
      redact('mongodb://app:s3cr3tP4ss@mf-chem-labs-staging-db:27017/chem_labs'),
    ).toBe(`mongodb://app:${REDACTED}@mf-chem-labs-staging-db:27017/chem_labs`)
    expect(redact('https://user:pa55word@example.com/x')).toBe(
      `https://user:${REDACTED}@example.com/x`,
    )
  })

  it('redacts a LiteLLM key, a bearer token and a JWT', () => {
    expect(redact('key=sk-aG31FbBZgAFKj15VGwkhvQ')).toBe(`key=${REDACTED}`)
    expect(redact('Authorization: Bearer abcdef0123456789abcdef')).toBe(
      `Authorization: Bearer ${REDACTED}`,
    )
    expect(redact('t=eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ4In0.c2ln')).toBe(`t=${REDACTED}`)
    // WHOLE, header and dots included — which is what running the patterns BEFORE
    // the entropy rule buys, and the one place that order is observable. Measured:
    // entropy first redacts this token's payload and signature segments (both 24+
    // characters) and leaves `eyJhbGciOiJIUzI1NiJ9.[REDACTED].[REDACTED]`, and the
    // plan's short sample above cannot tell the two orders apart.
    expect(
      redact(
        't=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
      ),
    ).toBe(`t=${REDACTED}`)
  })

  it('redacts a PEM private key block, header to footer', () => {
    // A key is many lines, and a line-by-line redactor leaves the body behind.
    const pem =
      '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg\nkqhkiG9w0BAQ\n-----END PRIVATE KEY-----'
    expect(redact(`sp key:\n${pem}\ndone`)).toBe(`sp key:\n${REDACTED}\ndone`)
  })

  it('redacts a long mixed-case random run, and the VALUE of NAME=value only', () => {
    expect(redact('token Zq8Lr2Vx9Tn4Wm7Ks1Hd6Pg3Jb5Yc0Fe')).toBe(`token ${REDACTED}`)
    expect(redact('API_TOKEN=Zq8Lr2Vx9Tn4Wm7Ks1Hd6Pg3Jb5Yc0Fe')).toBe(
      `API_TOKEN=${REDACTED}`,
    )
  })

  it('keeps a long ordinary word, and a long HEX run, by design', () => {
    // The control. Without it, "entropy heuristic" means "redact anything long".
    expect(redact('antidisestablishmentarianism internationalisation')).toBe(
      'antidisestablishmentarianism internationalisation',
    )
    // Hex is KEPT, deliberately (Rich, 2026-09-14): digests, commit SHAs and
    // fingerprints are hex, and every secret the platform generates is hex AND sits
    // in its app's secret set, where the exact-match half redacts it.
    const hex = 'token 9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e'
    expect(redact(hex)).toBe(hex)
  })

  it('leaves an ordinary failing build log completely intact — including the shapes a real log carries', () => {
    // THE ASSERTION THAT MAKES THIS SAFE TO SHIP. Section 14 exists so a faculty
    // member can see what broke. The first five lines are the plan's; the rest are
    // the shapes the pre-flight measured the printed rule eating in real BuildKit
    // output and in what SSO registration persists (115, 116) — a digest is what
    // §13 binds an approval to, and an entity ID is what §9 alerts on.
    const log = [
      'npm error code ELIFECYCLE',
      'npm error path /app',
      '  at Module._compile (node:internal/modules/cjs/loader:1364:14)',
      "Error: Cannot find module 'mongodb'",
      '#12 [4/6] RUN npm ci --omit=dev',
      '#14 exporting manifest sha256:4c9606b8d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8 0.0s done',
      '#5 [1/6] FROM manifest-registry:5000/base/node@sha256:0e2c5a6f9d8b7a1c3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d',
      '      "integrity": "sha512-Qm7Xa1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v2W3x4Y5z6/Ab+Cd9Ef0Gh1Ij2Kl3Mn4Op5Qr6St7Uv8Wx9Yz0AaBbCcDd==",',
      '#9 [3/6] RUN SOURCE_DATE_EPOCH=1700000000 npm ci',
      'container mf-proof-app-staging-1b83e8f0-app exited 1',
      'app/node_modules/ubc-genai-toolkit-llm/dist/index.js:12',
      'commit 3f786850e387550fdab836ed7e6dc881de23001b',
      'release 5CD565B4-63D0-46D4-9A2B-1C3D4E5F6A7B and 5cd565b4-63d0-46d4-9a2b-1c3d4e5f6a7b',
      'entityID https://manifest.internal/sp/proof-app/staging',
      'acs https://proof-app.staging.manifest.internal/auth/ubcshib/callback',
      'ERR_PNPM_OUTDATED_LOCKFILE GHSA-4mxg-3p6v-xgq3 in passport-saml@3.2.4',
      // A SCOPED package's URL has an `@` after the port — sitting 7 measured the
      // printed URL rule reading `4873/` as its password.
      'npm error 404 Not Found - GET http://manifest-verdaccio:4873/@anthropic-ai%2fsdk - Not found',
    ].join('\n')
    expect(redact(log)).toBe(log)
  })

  it('leaves what SSO registration persists alone, at every depth (§9)', () => {
    // `sso/registration.ts` is makeRedactor's one production caller, and under the
    // printed rule these came back `https://manifest.[REDACTED]` — so the ACS-change
    // event §9 alerts on would have read `[REDACTED]` to `[REDACTED]`.
    const detail = {
      entityId: 'https://manifest.internal/sp/chem-labs/staging',
      acsUrl: 'https://chem-labs.staging.manifest.internal/auth/ubcshib/callback',
      attributes: ['ubcEduCwlPuid', 'mail'],
      certificateFingerprint:
        'AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89',
      changed: true,
    }
    expect(redact(detail)).toEqual(detail)
  })

  it('applies the heuristics at every depth of machine_detail', () => {
    expect(
      redact({ stderr: ['connect failed', { auth: 'Bearer abcdef0123456789abcdef' }] }),
    ).toEqual({ stderr: ['connect failed', { auth: `Bearer ${REDACTED}` }] })
  })

  it('still redacts a known secret that no heuristic would catch', () => {
    // The exact-match half must survive this task. "hunter2" has low entropy, no
    // prefix and no pattern; it is redacted because the app's secret set says so.
    expect(makeRedactor(['hunter2'])('password is hunter2')).toBe(
      `password is ${REDACTED}`,
    )
  })

  it('is idempotent', () => {
    // recordEvent redacts, and an Incident built from redacted logs is redacted
    // again. A second pass that mangles [REDACTED] would corrupt stored rows.
    for (const sample of [
      'key=sk-aG31FbBZgAFKj15VGwkhvQ',
      'mongodb://app:s3cr3tP4ss@db:27017/x',
      'Authorization: Bearer abcdef0123456789abcdef',
      'API_TOKEN=Zq8Lr2Vx9Tn4Wm7Ks1Hd6Pg3Jb5Yc0Fe',
      '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg\n-----END PRIVATE KEY-----',
    ]) {
      const once = redact(sample)
      expect(once).not.toBe(sample)
      expect(redact(once)).toBe(once)
    }
  })
})

/**
 * LINES THAT MUST STAY LINES — an app's recent output (the front-end enablement plan's Task 2,
 * its whole-branch review's C1 and I2). A reader answers one entry per line, so a secret that
 * spans lines must be matched with the lines JOINED, as the Incident's joined pass always did,
 * and every line it covered answered `[REDACTED]`; and a line the runtime CUT may end in the
 * first characters of a secret, which no exact match can ever find.
 */
describe('redacting lines that must stay lines (§14)', () => {
  const PEM = [
    '-----BEGIN PRIVATE KEY-----',
    // '/'-split pieces under 24 characters: the entropy rule, line by line, redacts none.
    'MIIEvQ/IBADANBgk/qhkiG9w0BAQEF/AASCBKcw',
    'ggSjAgEA/AoIBAQC7VJT/Ut9Us8cKjMzEfYyj',
    '-----END PRIVATE KEY-----',
  ].join('\n')

  it('redacts a PEM block across the lines it spans, each line it covered reading [REDACTED]', () => {
    const out = makeRedactor([]).lines(['sp key:', ...PEM.split('\n'), 'done'])
    expect(out).toEqual(['sp key:', REDACTED, REDACTED, REDACTED, REDACTED, 'done'])
  })

  it('keeps the text around a match on the lines it began and ended on', () => {
    const out = makeRedactor([]).lines([
      `key: ${PEM.split('\n')[0]}`,
      ...PEM.split('\n').slice(1, -1),
      `${PEM.split('\n').at(-1)} ok`,
    ])
    expect(out).toEqual([`key: ${REDACTED}`, REDACTED, REDACTED, `${REDACTED} ok`])
  })

  // The Incident's regression the review found: a per-line pass BEFORE the joined one changed a
  // line inside a multi-line secret, so its exact match failed and the rest of it stayed.
  it('matches a multi-line secret from the set whole, before any heuristic touches a line of it', () => {
    const account = [
      '{',
      '  "type": "service_account",',
      '  "private_key_id": "4f1c2a9e7b6d5c3a1f0e9d8c7b6a5f4e3d2c1b0a",',
      `  "private_key": "${PEM.split('\n')[0]}`,
      ...PEM.split('\n').slice(1),
      '"}',
    ].join('\n')
    const printed = ['boot', ...account.split('\n'), 'listening']
    const out = makeRedactor([account]).lines(printed)
    expect(out).toEqual(['boot', ...account.split('\n').map(() => REDACTED), 'listening'])
    expect(out.join('\n')).not.toContain('4f1c2a9e')
  })

  it('answers exactly one entry per line it was given', () => {
    const redact = makeRedactor(['swordfish-7c2e'])
    expect(redact.lines([])).toEqual([])
    expect(redact.lines(['a', '', 'swordfish-7c2e', 'b'])).toEqual([
      'a',
      '',
      REDACTED,
      'b',
    ])
  })

  it('knows its longest secret, in UTF-8 bytes', () => {
    expect(makeRedactor([]).longestSecretBytes).toBe(0)
    expect(makeRedactor(['swordfish-7c2e', 'é'.repeat(10)]).longestSecretBytes).toBe(20)
  })

  describe('trimCut — the end of a line the runtime cut', () => {
    const redact = makeRedactor(['swordfish-7c2e', 'pass.word!123'])

    it('drops the first characters of a secret the cut left behind', () => {
      expect(redact.trimCut('connecting with sword')).toBe('connecting with ')
      // Punctuation the token rule would not drop: only the secret set knows this is one.
      expect(redact.trimCut('the password is pass.word!')).toBe('the password is ')
    })

    it('drops a piece of a token too short for the heuristic to judge', () => {
      // Under 24 characters the entropy rule never looks at a run, so a random value cut to
      // ten would be shown whole.
      expect(redact.trimCut('{"key":"Zq8Lr2Vx9T')).toBe('{"key":"')
    })

    it('keeps a run long enough to judge — a minified line is not a token cut in pieces', () => {
      expect(redact.trimCut('x'.repeat(8192))).toBe('x'.repeat(8192))
      expect(redact.trimCut(`var a=${'b'.repeat(30)}`)).toBe(`var a=${'b'.repeat(30)}`)
    })

    it('keeps a WHOLE secret before the cut, for the redactor to find', () => {
      expect(redact.trimCut('code swordfish-7c2e and then some words')).toBe(
        'code swordfish-7c2e and then some ',
      )
    })

    it('drops nothing from a line that ends in neither', () => {
      expect(redact.trimCut('a line that ends in punctuation.')).toBe(
        'a line that ends in punctuation.',
      )
    })
  })
})

/**
 * `[S3]`'s CLASS, IN THE REDACTOR (the front-end enablement plan's Task 5). Three of §14's
 * pattern rules and `trimCut`'s tail read a run again from every place a match could begin — one
 * crafted 1 MiB line took 11 s (the PEM rule), ~100 s (the JWT rule) and ~280 s (the URL rule),
 * the event loop blocked. The redactor reads an app's output (up to 1000 lines of 8 KiB,
 * JOINED), an Incident's tail and every line of a build's log, so an app that prints the line
 * reached it. Rewritten to read each run once; these hold the speed, and the rules as they were
 * written before are the oracle for the answer.
 */
describe('redaction reads a long line once (§14; [S3]’s class)', () => {
  const MIB = 1024 * 1024
  const repeatTo = (unit: string, length: number) =>
    unit.repeat(Math.ceil(length / unit.length)).slice(0, length)
  // The PEM rule's line first: it fails in seconds where the others take minutes.
  const CRAFTED: Readonly<Record<string, string>> = {
    'PEM headers, and no footer': repeatTo('-----BEGIN RSA PRIVATE KEY-----', MIB),
    'JWT openings, and no dot': repeatTo('-eyJaaaaaaaaaa', MIB),
    'a scheme’s characters, and no ://': repeatTo('a.', MIB),
  }

  it('redacts a 1 MiB line built to make a rule backtrack in well under a second, and changes nothing in it', () => {
    const redact = makeRedactor([])
    for (const [name, line] of Object.entries(CRAFTED)) {
      const started = performance.now()
      const out = redact(line)
      const ms = performance.now() - started
      expect(ms, `${name}: ${Math.round(ms)} ms`).toBeLessThan(1000)
      expect(out === line, name).toBe(true) // none of them is a secret
    }
  })

  it('redacts a thousand 1 KiB lines of them JOINED, as an app’s output is read, in well under a second', () => {
    const redact = makeRedactor(['a-secret-from-the-set'])
    const lines = Object.values(CRAFTED).flatMap((line) =>
      Array.from({ length: 334 }, (_, i) => line.slice(i * 1024, (i + 1) * 1024)),
    )
    expect(lines.length).toBeGreaterThan(1000)
    const started = performance.now()
    const out = redact.lines(lines)
    const ms = performance.now() - started
    expect(ms, `${Math.round(ms)} ms`).toBeLessThan(1000)
    expect(out).toEqual(lines)
  })

  it('trims the end of a 128 KiB cut line in well under a second', () => {
    // A cut line is `lineBytes` plus the room the longest secret needs — kilobytes, not this.
    // 128 KiB took ~11 s before, and 1 MiB would have taken minutes.
    const redact = makeRedactor([])
    const line = `${'a'.repeat(128 * 1024)}!`
    const started = performance.now()
    expect(redact.trimCut(line)).toBe(line)
    const ms = performance.now() - started
    expect(ms, `${Math.round(ms)} ms`).toBeLessThan(1000)
    // …and still drops a short token the cut left, after a long line of anything.
    expect(redact.trimCut(`${'a. '.repeat(1000)}{"key":"Zq8Lr2Vx9T`)).toBe(
      `${'a. '.repeat(1000)}{"key":"`,
    )
  })

  it('answers exactly what the rules answered before they read each run once, over 20,000 generated texts', () => {
    // THE ORACLE: the three rules and the tail exactly as written until 2026-09-27.
    const perLine = (match: string) =>
      match
        .split('\n')
        .map((piece) => (piece === '' ? '' : REDACTED))
        .join('\n')
    const before = {
      'a PEM private key block': [
        /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
        REDACTED,
      ],
      'a credential in a URL': [
        /(\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)([^\s@/]+)(@)/gi,
        `$1${REDACTED}$3`,
      ],
      'a JSON Web Token': [
        /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g,
        REDACTED,
      ],
    } as const
    const tailBefore = (text: string) => {
      const tail = /[A-Za-z0-9+_-]+={0,2}$/.exec(text)
      return tail !== null && tail[0].length < 24 ? text.slice(0, tail.index) : text
    }
    // mulberry32, seeded, so a disagreement reproduces.
    let state = 20260927
    const random = () => {
      state = (state + 0x6d2b79f5) | 0
      let t = Math.imul(state ^ (state >>> 15), 1 | state)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(random() * xs.length)]!
    const PIECES: Record<keyof typeof before | 'tail', readonly string[]> = {
      'a PEM private key block': [
        '-----BEGIN ',
        '-----END ',
        'RSA ',
        'EC ',
        'PRIVATE KEY-----',
        'PRIVATE KEY',
        '-----',
        '-----BEGIN PRIVATE KEY-----',
        '-----END RSA PRIVATE KEY-----',
        'MIIE',
        '\n',
        ' ',
        'x',
        'A',
        '-',
      ],
      'a credential in a URL': [
        'mongodb',
        'a',
        'Z',
        'b1',
        '.',
        '+',
        '-',
        ':',
        '//',
        '://',
        '@',
        ' ',
        '/',
        'user',
        'pw',
        '\n',
        '1',
        ':@',
        'https://',
        'app:',
        'x:y@',
        'mongodb://app:',
        'pw@',
        's3cr3t',
      ],
      'a JSON Web Token': [
        'eyJ',
        '-eyJ',
        'xeyJ',
        '_eyJ',
        'eyj',
        '.',
        '..',
        '-',
        '_',
        ' ',
        '"',
        'aaaaaaaa',
        'Z9',
        'a',
        'eyJhbGciOi.',
        'payload9.',
        'sig-',
        '.eyJ',
      ],
      tail: [
        'a',
        'Z9',
        '+',
        '_',
        '-',
        '=',
        '==',
        '===',
        '.',
        ' ',
        '"',
        '{',
        'Zq8Lr2Vx9T',
      ],
    }
    const text = (pieces: readonly string[]) =>
      Array.from({ length: 1 + Math.floor(random() * 30) }, () => pick(pieces)).join('')
    const disagree: string[] = []
    const changed: Record<string, number> = {}
    for (const [rule, [pattern, replacement]] of Object.entries(before)) {
      const now = HEURISTICS.find((h) => h.name === rule)
      expect(now, rule).toBeDefined()
      for (let n = 0; n < 5000; n++) {
        const s = text(PIECES[rule as keyof typeof before])
        const was = s.replace(pattern, replacement)
        if (was !== s) changed[rule] = (changed[rule] ?? 0) + 1
        if (now!.apply(s, false) !== was && disagree.length < 5)
          disagree.push(`${rule}: ${JSON.stringify(s)}`)
        if (rule === 'a PEM private key block') {
          const wasLines = s.replace(pattern, perLine)
          if (now!.apply(s, true) !== wasLines && disagree.length < 5)
            disagree.push(`${rule}, keeping lines: ${JSON.stringify(s)}`)
        }
      }
    }
    const redact = makeRedactor([])
    for (let n = 0; n < 5000; n++) {
      const s = text(PIECES.tail)
      const was = tailBefore(s)
      if (was !== s) changed.tail = (changed.tail ?? 0) + 1
      if (redact.trimCut(s) !== was && disagree.length < 5)
        disagree.push(`tail: ${JSON.stringify(s)}`)
    }
    expect(disagree).toEqual([])
    // Not vacuous: each rule changed hundreds of the texts, and left most of the rest alone.
    for (const rule of [...Object.keys(before), 'tail']) {
      expect(changed[rule] ?? 0, rule).toBeGreaterThan(100)
      expect(changed[rule] ?? 0, rule).toBeLessThan(4900)
    }
  })
})
