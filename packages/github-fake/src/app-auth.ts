import { createHmac, createVerify, timingSafeEqual, type KeyObject } from 'node:crypto'

/**
 * WHO IS ASKING — GitHub's three credentials, as the fake implements them. An App JWT
 * (RS256, signed with the App's private key, which the fake never holds: it verifies with
 * the PUBLIC half); an installation token minted from one; and `faculty-dev`'s classic
 * personal access token, which stands for a PERSON pushing to GitHub directly.
 *
 * The fake imports nothing from the control plane (`boundary.test.ts`): if it shared the
 * driver's code it would share the driver's mistakes by construction (Decision 7).
 */

export type Permission = 'read' | 'write'

export interface Grant {
  kind: 'installation' | 'person'
  /** `manifest-local-dev[bot]` for the installation, `faculty-dev` for the person. */
  login: string
  repositories: 'all' | readonly string[]
  permissions: Readonly<
    Record<'administration' | 'contents' | 'metadata', Permission | undefined>
  >
}

const b64json = (s: string): unknown =>
  JSON.parse(Buffer.from(s, 'base64url').toString('utf8'))

const NOT_DECODED = 'A JSON web token could not be decoded'

/**
 * GitHub's App-JWT rules: RS256; `iss` the App ID; `exp` in the future and at most ten
 * minutes out; `iat` not in the future (60 s of drift allowed).
 *
 * **The messages are GitHub's as its documentation and community answers report them, NOT
 * measured.** `golden.json` carries them with `"source": "documentation"` until the real
 * App's run replaces them, and when the two differ the fake changes to match GitHub.
 */
export function verifyAppJwt(
  header: string | undefined,
  publicKey: KeyObject,
  appId: string,
  now: Date,
): { ok: true } | { ok: false; message: string } {
  const m = /^Bearer ([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(
    header ?? '',
  )
  if (m === null) return { ok: false, message: NOT_DECODED }
  const [, h, p, s] = m as unknown as [string, string, string, string]
  // An installation token (`ghs_…`) also matches the three-part shape, and its first part
  // is not base64 JSON. A decode failure is GitHub's "could not be decoded", never a 500.
  let alg: unknown
  let c: { iss?: unknown; iat?: unknown; exp?: unknown }
  try {
    alg = (b64json(h) as { alg?: unknown }).alg
    c = b64json(p) as typeof c
  } catch {
    return { ok: false, message: NOT_DECODED }
  }
  if (alg !== 'RS256') return { ok: false, message: NOT_DECODED }
  const ok = createVerify('RSA-SHA256')
    .update(`${h}.${p}`)
    .verify(publicKey, Buffer.from(s, 'base64url'))
  if (!ok) return { ok: false, message: NOT_DECODED }
  const t = Math.floor(now.getTime() / 1000)
  if (String(c.iss) !== appId) return { ok: false, message: 'Integration not found' }
  if (typeof c.exp !== 'number' || c.exp <= t) {
    return {
      ok: false,
      message:
        "'Expiration time' claim ('exp') must be a numeric value representing the future time at which the assertion expires",
    }
  }
  if (c.exp > t + 600) {
    return {
      ok: false,
      message: "'Expiration time' claim ('exp') is too far in the future",
    }
  }
  if (typeof c.iat !== 'number' || c.iat > t + 60) {
    return {
      ok: false,
      message:
        "'Issued at' claim ('iat') must be an Integer representing the time that the assertion was issued",
    }
  }
  return { ok: true }
}

/**
 * GitHub's stateless installation token (the plan's *Read this first* 4): `ghs_<APPID>_<JWT>`.
 * The fake signs its own claims with an HMAC key only it holds, so a token is verified
 * WITHOUT a table — which is the property that makes GitHub's format stateless — and a
 * forged or altered one fails the MAC. The claims name the installation, the repositories
 * and the permissions, and expire after one hour, as GitHub's do.
 */
export function mintInstallationToken(i: {
  appId: string
  installationId: string
  tokenKey: Buffer
  repositories: 'all' | string[]
  permissions: Grant['permissions']
  now: Date
}): { token: string; expiresAt: string } {
  const exp = Math.floor(i.now.getTime() / 1000) + 3600
  const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
    'base64url',
  )
  const p = Buffer.from(
    JSON.stringify({
      inst: i.installationId,
      repos: i.repositories,
      perms: i.permissions,
      exp,
    }),
  ).toString('base64url')
  const s = createHmac('sha256', i.tokenKey).update(`${h}.${p}`).digest('base64url')
  return {
    token: `ghs_${i.appId}_${h}.${p}.${s}`,
    expiresAt: new Date(exp * 1000).toISOString().replace('.000', ''),
  }
}

/** The codebase's constant-time comparison: equal lengths first, then `timingSafeEqual`. */
export function equalStrings(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** `token X`, `Bearer X`, or Basic's password; `undefined` for anything else. */
export function credentialOf(authorization: string | undefined): string | undefined {
  if (authorization === undefined) return undefined
  const m = /^(token|bearer|basic) +(\S+)$/i.exec(authorization.trim())
  if (m === null) return undefined
  const [, scheme, value] = m as unknown as [string, string, string]
  if (scheme.toLowerCase() !== 'basic') return value
  const decoded = Buffer.from(value, 'base64').toString('utf8')
  const colon = decoded.indexOf(':')
  if (colon < 0) return undefined
  const password = decoded.slice(colon + 1)
  return password === '' ? undefined : password
}

/** Who a request is: an installation (its token), `faculty-dev` (the PAT), or nobody. */
export function grantFor(
  authorization: string | undefined,
  ctx: { tokenKey: Buffer; developerToken: string; now: Date },
): Grant | undefined {
  const credential = credentialOf(authorization)
  if (credential === undefined) return undefined
  if (equalStrings(credential, ctx.developerToken)) {
    return {
      kind: 'person',
      login: 'faculty-dev',
      repositories: 'all',
      permissions: { administration: 'write', contents: 'write', metadata: 'read' },
    }
  }
  const m = /^ghs_\d+_([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(
    credential,
  )
  if (m === null) return undefined
  const [, h, p, s] = m as unknown as [string, string, string, string]
  const want = createHmac('sha256', ctx.tokenKey).update(`${h}.${p}`).digest()
  const given = Buffer.from(s, 'base64url')
  if (given.length !== want.length || !timingSafeEqual(given, want)) return undefined
  const c = JSON.parse(Buffer.from(p, 'base64url').toString()) as {
    repos: Grant['repositories']
    perms: Grant['permissions']
    exp: number
  }
  if (c.exp * 1000 <= ctx.now.getTime()) return undefined
  return {
    kind: 'installation',
    login: 'manifest-local-dev[bot]',
    repositories: c.repos,
    // Every installation token can read metadata. JSON drops an `undefined` key, so a
    // token minted without it arrives without it — and `{ metadata: 'read', ...perms }`
    // is TS2783 under this package's types, because the type says the key is always there.
    permissions: { ...c.perms, metadata: c.perms.metadata ?? 'read' },
  }
}
