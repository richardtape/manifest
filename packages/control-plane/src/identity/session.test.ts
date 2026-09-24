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
      JSON.stringify({
        ...JSON.parse(Buffer.from(payload, 'base64url').toString()),
        role: 'admin',
      }),
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

  /**
   * THE IdP'S HANDLE ON THIS SIGN-IN (P6b F10, fixed 2026-09-24). A console sign-out must
   * send the IdP a LogoutRequest naming the session it holds — the NameID and SessionIndex
   * its assertion carried — or the IdP cannot tell which session to end, and CWL signs
   * the same person straight back in on the next "Sign in with CWL".
   */
  it('carries the IdP’s handle on the sign-in through a round trip', () => {
    const idp = {
      nameID: '_transient123',
      nameIDFormat: 'urn:oasis:names:tc:SAML:2.0:nameid-format:transient',
      sessionIndex: '_session456',
      nameQualifier: null,
      spNameQualifier: null,
    }
    const token = signSession(issueSession(user, NOW, idp), SECRET)
    expect(verifySession(token, SECRET, NOW + 1000)?.idp).toEqual(idp)
  })

  it('reads a cookie with NO handle — one an older build signed — as a session with idp null', () => {
    // Refusing it would sign everybody on this machine out the moment the control plane
    // restarted, exactly the argument `steppedUpAt` makes. It is a valid session whose
    // sign-out cannot reach the IdP, and the route says so by landing on `/`.
    const { idp: _dropped, ...older } = issueSession(user, NOW)
    const token = signSession(older as never, SECRET)
    const session = verifySession(token, SECRET, NOW + 1000)
    expect(session).not.toBeNull()
    expect(session?.idp).toBeNull()
  })

  it('reads a MALFORMED handle as null rather than trusting it', () => {
    for (const bad of [42, 'x', { nameID: 7 }, { nameID: '', nameIDFormat: 'f' }, []]) {
      const token = signSession({ ...issueSession(user, NOW), idp: bad } as never, SECRET)
      expect(
        verifySession(token, SECRET, NOW + 1000)?.idp,
        JSON.stringify(bad),
      ).toBeNull()
    }
  })

  it('rejects malformed input without throwing', () => {
    for (const bad of ['', 'nodot', 'a.b.c', '.', 'not-base64!.mac']) {
      expect(verifySession(bad, SECRET, NOW)).toBeNull()
    }
  })
})
