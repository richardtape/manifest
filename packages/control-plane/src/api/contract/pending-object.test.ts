import { describe, expect, it } from 'vitest'
import { PRIVILEGED, type PrivilegedCapability } from '../../projects/index.js'
import { ROUTE_DEFINITIONS } from '../routes/index.js'

/**
 * EVERY ROUTE A TOKEN CAN BE ASKED A QUESTION ON SAYS WHAT THE QUESTION IS ABOUT (FE-5).
 *
 * A route whose capability is privileged raises a pending action when a token calls it, and the
 * person who answers must read who, in what role, which release and where — the route's own
 * `pendingObject` is the only thing that can say. Without this test the next privileged route
 * would ask a person a question that names nothing, which is FE-5's whole complaint.
 */
describe('every privileged route declares what its question acts on (FE-5)', () => {
  /**
   * A route a token can be ASKED a question on: one asserting a privileged capability that a token
   * may call at all. A session-only route — confirming or rejecting a question, which names the
   * capability a person must hold to answer it — refuses a token outright, before anything is
   * asked (`403 TOKEN_CREDENTIAL_REFUSED`), so it raises no question.
   */
  const privileged = ROUTE_DEFINITIONS.filter((route) => {
    if (route.credential === 'session') return false
    const asserted =
      route.capability === undefined
        ? []
        : typeof route.capability === 'string'
          ? [route.capability]
          : route.capability
    return asserted.some((capability) =>
      PRIVILEGED.has(capability as PrivilegedCapability),
    )
  })

  it('checks exactly the three routes a token can be asked a question on — the positive control', () => {
    expect(privileged.map((route) => route.operationId).sort()).toEqual([
      'addMember',
      'deploy',
      'removeMember',
    ])
  })

  it('finds a pendingObject on each of them', () => {
    expect(
      privileged
        .filter((route) => route.pendingObject === undefined)
        .map((route) => route.operationId),
    ).toEqual([])
  })
})
