import { createHmac, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE = 'manifest_session'
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000

export interface Session {
  userId: string
  puid: string
  role: 'admin' | 'member'
  /** epoch milliseconds */
  issuedAt: number
  /** epoch milliseconds */
  expiresAt: number
}

export function issueSession(
  user: { id: string; ubcCwlPuid: string; role: 'admin' | 'member' },
  now: number = Date.now(),
): Session {
  return {
    userId: user.id,
    puid: user.ubcCwlPuid,
    role: user.role,
    issuedAt: now,
    expiresAt: now + SESSION_TTL_MS,
  }
}

function mac(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

export function signSession(session: Session, secret: string): string {
  const payload = Buffer.from(JSON.stringify(session), 'utf8').toString('base64url')
  return `${payload}.${mac(payload, secret)}`
}

/**
 * Returns null for anything that is not a currently valid session — a bad
 * signature, a tampered payload, an expired session, or malformed input.
 * It never throws, because it runs on untrusted request data.
 */
export function verifySession(
  token: string,
  secret: string,
  now: number = Date.now(),
): Session | null {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [payload, signature] = parts as [string, string]
  if (payload.length === 0 || signature.length === 0) return null

  const expected = mac(payload, secret)
  const given = Buffer.from(signature)
  const want = Buffer.from(expected)
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null

  let session: Session
  try {
    session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Session
  } catch {
    return null
  }
  if (typeof session.expiresAt !== 'number' || session.expiresAt <= now) return null
  if (session.role !== 'admin' && session.role !== 'member') return null
  if (typeof session.userId !== 'string' || session.userId.length === 0) return null
  return session
}
