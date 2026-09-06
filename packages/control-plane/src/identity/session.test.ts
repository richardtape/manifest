import { describe, expect, it } from 'vitest'
import { SESSION_TTL_MS, issueSession, signSession, verifySession } from './session.js'

const SECRET = 'k'.repeat(32)
const NOW = 1_700_000_000_000

const user = { id: 'user-1', ubcCwlPuid: 'bio_prof', role: 'member' as const }

describe('sessions', () => {
  it('signs and verifies a round trip', () => {
    const token = signSession(issueSession(user, NOW), SECRET)
    const session = verifySession(token, SECRET, NOW + 1000)
    expect(session).not.toBeNull()
    expect(session?.userId).toBe('user-1')
    expect(session?.puid).toBe('bio_prof')
    expect(session?.role).toBe('member')
  })

  it('rejects a tampered payload', () => {
    const token = signSession(issueSession({ ...user, role: 'member' }, NOW), SECRET)
    const [payload, mac] = token.split('.') as [string, string]
    // Re-encode the payload claiming admin, keeping the original signature.
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), role: 'admin' }),
    ).toString('base64url')
    expect(verifySession(`${forged}.${mac}`, SECRET, NOW + 1000)).toBeNull()
  })

  it('rejects a token signed with a different secret', () => {
    const token = signSession(issueSession(user, NOW), 'other-secret-that-is-long-enough')
    expect(verifySession(token, SECRET, NOW + 1000)).toBeNull()
  })

  it('rejects an expired session', () => {
    const token = signSession(issueSession(user, NOW), SECRET)
    expect(verifySession(token, SECRET, NOW + SESSION_TTL_MS + 1)).toBeNull()
  })

  it('rejects malformed input without throwing', () => {
    for (const bad of ['', 'nodot', 'a.b.c', '.', 'not-base64!.mac']) {
      expect(verifySession(bad, SECRET, NOW)).toBeNull()
    }
  })
})
