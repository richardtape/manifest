import { createHmac, createSign, randomUUID, timingSafeEqual } from 'node:crypto'

export interface Grant {
  type: string
  name: string
  actions: string[]
}

const b64u = (input: string | Buffer): string => Buffer.from(input).toString('base64url')

/**
 * `scope` arrives as ONE space-separated field, not as repeated parameters. A parser
 * that reads only the first entry silently drops the push scope, and the build then
 * fails with an authorization error that reads like a policy decision.
 */
export function parseScopeStrings(raw: readonly string[]): Grant[] {
  const out: Grant[] = []
  for (const field of raw) {
    for (const one of field.split(' ')) {
      if (one === '') continue
      const parts = one.split(':')
      if (parts.length < 3) continue
      out.push({
        type: parts[0]!,
        // A repository name may contain slashes but never a colon, so everything
        // between the first and last colon is the name.
        name: parts.slice(1, -1).join(':'),
        actions: parts[parts.length - 1]!.split(',').filter((a) => a !== ''),
      })
    }
  }
  return out
}

/**
 * §13, as a function. The builder may push to exactly its own app repository, may
 * pull the platform mirrored base images, and gets nothing anywhere else. Grants are
 * TRIMMED rather than refused, because buildx asks for `pull,push` on base images it
 * only reads and refusing outright would break every build.
 */
export function applyGrantPolicy(
  authorizedRepository: string,
  requested: readonly Grant[],
): Grant[] {
  return requested.map((grant) => {
    if (grant.type !== 'repository') return { ...grant, actions: [] }
    if (grant.name === authorizedRepository) return { ...grant }
    if (grant.name.startsWith('base/')) {
      return { ...grant, actions: grant.actions.filter((a) => a === 'pull') }
    }
    return { ...grant, actions: [] }
  })
}

export function mintRegistryToken(
  keyPem: string,
  certPem: string,
  input: {
    issuer: string
    service: string
    subject: string
    access: Grant[]
    ttlSeconds?: number
  },
): string {
  const now = Math.floor(Date.now() / 1000)
  const ttl = input.ttlSeconds ?? 300
  // x5c carries the DER body of the PEM. registry:2 validates the chain against
  // REGISTRY_AUTH_TOKEN_ROOTCERTBUNDLE; there is no key registration step.
  const x5c = [certPem.replace(/-----(BEGIN|END) CERTIFICATE-----|\s/g, '')]
  const header = { typ: 'JWT', alg: 'RS256', x5c }
  const claims = {
    iss: input.issuer,
    sub: input.subject,
    aud: input.service,
    exp: now + ttl,
    nbf: now - 10,
    iat: now,
    jti: randomUUID(),
    access: input.access,
  }
  const signing = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(claims))}`
  const signature = createSign('RSA-SHA256').update(signing).end().sign(keyPem)
  return `${signing}.${b64u(signature)}`
}

/**
 * The credential the control plane hands its own buildx child process. Short-lived
 * and unforgeable, so the token endpoint can be reachable from the host without
 * becoming a way to mint a push token for an arbitrary repository.
 */
export function issueBuildCredential(
  secret: string,
  input: { repository: string; buildId: string; expiresAt: number },
): { username: string; password: string } {
  const body = `${input.buildId}.${input.expiresAt}`
  const mac = createHmac('sha256', secret)
    .update(`${input.repository}.${body}`)
    .digest('hex')
  return { username: input.repository, password: `${body}.${mac}` }
}

export function verifyBuildCredential(
  secret: string,
  username: string,
  password: string,
  now: number = Date.now(),
): { repository: string } | undefined {
  const [buildId, expiresAt, mac] = password.split('.')
  if (!buildId || !expiresAt || !mac) return undefined
  if (Number(expiresAt) <= now) return undefined
  const expected = createHmac('sha256', secret)
    .update(`${username}.${buildId}.${expiresAt}`)
    .digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(mac)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return undefined
  return { repository: username }
}
