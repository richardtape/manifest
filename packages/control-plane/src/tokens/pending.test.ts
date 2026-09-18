import { describe, expect, it } from 'vitest'
import { withProject } from '../db/testing.js'
import { createEventBus } from '../observability/index.js'
import { TokenCapabilityRefusedError } from '../projects/index.js'
import type { Db } from '../db/index.js'
import {
  bodySha256,
  consumeAction,
  fingerprintOf,
  pendingById,
  recordPendingAction,
  resolutionFor,
  resolveAction,
  PENDING_ACTION_TTL_MS,
} from './pending.js'
import { mintTestToken } from './testing.js'

/** The refusal `assertCapability` throws, as the wrapper hands it on. */
function refusedFor(projectId: string, tokenId: string): TokenCapabilityRefusedError {
  return new TokenCapabilityRefusedError('members:manage', projectId, tokenId)
}

const ASK = {
  method: 'POST',
  url: '/v1/projects/p/members',
  body: { puid: 'bio_student', role: 'collaborator' },
  summary: 'Add or change a member',
}

describe('the request fingerprint (P5b Task 6)', () => {
  /**
   * **THE CANONICAL SORT, WHICH NOTHING ELSE ASSERTS.** Every test through the API sends
   * its body the same way twice, so the reuse lookup there is green whether the hash is
   * sorted or not — a control that cannot fail (P4c's lesson, and P5a sitting 12's).
   *
   * It matters twice: a retry whose JSON serialiser emits the same fields in a different
   * order would look like a NEW question and fill a person's queue, and (Task 7) the
   * confirmed retry would not match the pending action a human answered.
   */
  it('is the same for the same fields in a different order, at every depth', () => {
    expect(bodySha256({ a: 1, b: { c: 2, d: [3, 4] } })).toBe(
      bodySha256({ b: { d: [3, 4], c: 2 }, a: 1 }),
    )
  })

  it('is different for different values, and for a different array order', () => {
    expect(bodySha256({ role: 'owner' })).not.toBe(bodySha256({ role: 'collaborator' }))
    // `[a, b]` and `[b, a]` are NOT the same request: an array's order is its meaning.
    expect(bodySha256({ xs: [1, 2] })).not.toBe(bodySha256({ xs: [2, 1] }))
  })

  it('hashes a bodyless request rather than throwing on one', () => {
    // A bodyless mutation reaches this — `DELETE /v1/tokens/{tokenId}` is the API's first
    // (sitting 3's F1) — and `undefined` and `null` must agree, or the same DELETE
    // fingerprints two ways depending on how Fastify parsed it.
    expect(bodySha256(undefined)).toBe(bodySha256(null))
  })

  it('records the concrete path without its query string', () => {
    // The path is part of the question — "may this agent act on THIS project" — but a
    // query string is not: two retries that differ only in `?limit=10` are one ask.
    const print = fingerprintOf({ ...ASK, url: '/v1/projects/p/members?limit=10' })
    expect(print.path).toBe('/v1/projects/p/members')
    expect(print.summary).toBe('Add or change a member')
  })
})

describe('recording a pending action (D24)', () => {
  it('writes the fingerprint, the action and an expiry, and no body', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const { row: token } = await mintTestToken(db, {
        userId: ownerId,
        projectId,
        capabilities: ['members:manage'],
      })
      const before = Date.now()
      const pending = await recordPendingAction(db, createEventBus(), {
        error: refusedFor(projectId, token.id),
        fingerprint: fingerprintOf(ASK),
      })

      expect(pending.action).toBe('members:manage')
      expect(pending.state).toBe('pending')
      expect(pending.requestedByToken).toBe(token.id)
      expect(pending.consumedAt).toBeNull()
      expect(JSON.stringify(pending.payload)).not.toContain('bio_student')
      expect(pending.expiresAt.getTime()).toBeGreaterThanOrEqual(
        before + PENDING_ACTION_TTL_MS,
      )
      expect(await pendingById(db, pending.id)).toMatchObject({ id: pending.id })
    })
  })

  it('reuses the row for an identical ask, and writes a new one for a different token', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const bus = createEventBus()
      const { row: one } = await mintTestToken(db, {
        userId: ownerId,
        projectId,
        capabilities: ['members:manage'],
      })
      const { row: two } = await mintTestToken(db, {
        userId: ownerId,
        projectId,
        capabilities: ['members:manage'],
      })
      const ask = (tokenId: string) =>
        recordPendingAction(db, bus, {
          error: refusedFor(projectId, tokenId),
          fingerprint: fingerprintOf(ASK),
        })

      expect((await ask(one.id)).id).toBe((await ask(one.id)).id)
      // A SECOND TOKEN asking the same thing is a second question: a confirmation grants
      // one credential a retry, so collapsing the two would grant a token an answer
      // nobody gave it.
      expect((await ask(two.id)).id).not.toBe((await ask(one.id)).id)
    })
  })

  it('does not reuse a row whose expiry has passed', async () => {
    // An expired question is not an answerable one. Reusing it would leave an agent
    // waiting on a row Task 10's sweeper is about to mark `expired` and nobody can
    // confirm — which reads as the platform having lost the request.
    await withProject(async (db, { projectId, ownerId }) => {
      const bus = createEventBus()
      const { row: token } = await mintTestToken(db, {
        userId: ownerId,
        projectId,
        capabilities: ['members:manage'],
      })
      const stale = await recordPendingAction(db, bus, {
        error: refusedFor(projectId, token.id),
        fingerprint: fingerprintOf(ASK),
        now: new Date(Date.now() - PENDING_ACTION_TTL_MS - 1000),
      })
      const fresh = await recordPendingAction(db, bus, {
        error: refusedFor(projectId, token.id),
        fingerprint: fingerprintOf(ASK),
      })
      expect(fresh.id).not.toBe(stale.id)
    })
  })

  it('publishes pending_action.created with the ids and nothing from the body', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const bus = createEventBus()
      const frames: unknown[] = []
      const publish = bus.publish.bind(bus)
      bus.publish = (frame) => {
        frames.push(frame)
        publish(frame)
      }
      const { row: token } = await mintTestToken(db, {
        userId: ownerId,
        projectId,
        capabilities: ['members:manage'],
      })
      const pending = await recordPendingAction(db, bus, {
        error: refusedFor(projectId, token.id),
        fingerprint: fingerprintOf(ASK),
      })

      expect(frames).toHaveLength(1)
      expect(frames[0]).toMatchObject({
        kind: 'event',
        type: 'pending_action.created',
        machineDetail: {
          pendingActionId: pending.id,
          tokenId: token.id,
          action: 'members:manage',
        },
      })
      // §14: the audit trail says a question was asked, never what was in it — and not
      // the fingerprint hash either, which is the row's.
      expect(JSON.stringify(frames[0])).not.toContain('bio_student')
      expect(JSON.stringify(frames[0])).not.toContain(pending.payload.bodySha256)
    })
  })

  it('does not reuse a row across two different asks from one token', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const bus = createEventBus()
      const { row: token } = await mintTestToken(db, {
        userId: ownerId,
        projectId,
        capabilities: ['members:manage'],
      })
      const first = await recordPendingAction(db, bus, {
        error: refusedFor(projectId, token.id),
        fingerprint: fingerprintOf(ASK),
      })
      const second = await recordPendingAction(db, bus, {
        error: refusedFor(projectId, token.id),
        fingerprint: fingerprintOf({
          ...ASK,
          body: { puid: 'someone-else', role: 'owner' },
        }),
      })
      expect(second.id).not.toBe(first.id)
    })
  })
})

/**
 * How a person's answer is found again (P5b Task 7).
 *
 * **THREE OF THE CLAUSES BELOW CANNOT BE SEEN THROUGH THE API AT ALL**, which is why they
 * are asserted here: the expiry clause would need a test to wait twenty-four hours, and
 * both "already spent" and "somebody else answered first" are races an `app.inject` suite
 * runs too tidily to reach. Sitting 4's F6 is the same shape — a rule with no control is a
 * rule that is true until somebody tidies it away.
 */
describe('finding a person’s answer again (P5b Task 7)', () => {
  const ANSWER = { resolvedByPuid: 'bio_prof' }

  async function asked(db: Db, projectId: string, ownerId: string, now?: Date) {
    const bus = createEventBus()
    const { row: token } = await mintTestToken(db, {
      userId: ownerId,
      projectId,
      capabilities: ['project:read'],
    })
    const row = await recordPendingAction(db, bus, {
      error: refusedFor(projectId, token.id),
      fingerprint: fingerprintOf(ASK),
      ...(now === undefined ? {} : { now }),
    })
    return { bus, token, row }
  }

  it('answers none until somebody answers, and confirmed once they have', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const { bus, token, row } = await asked(db, projectId, ownerId)
      expect(await resolutionFor(db, token.id, fingerprintOf(ASK))).toEqual({
        kind: 'none',
      })
      await resolveAction(db, bus, {
        ...ANSWER,
        pendingActionId: row.id,
        resolvedBy: ownerId,
        state: 'confirmed',
      })
      const found = await resolutionFor(db, token.id, fingerprintOf(ASK))
      expect(found.kind).toBe('confirmed')
    })
  })

  it('answers none once the grant is SPENT — which is the one-shot rule', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const { bus, token, row } = await asked(db, projectId, ownerId)
      await resolveAction(db, bus, {
        ...ANSWER,
        pendingActionId: row.id,
        resolvedBy: ownerId,
        state: 'confirmed',
      })
      expect(await consumeAction(db, row.id)).toBeDefined()
      expect(await resolutionFor(db, token.id, fingerprintOf(ASK))).toEqual({
        kind: 'none',
      })
      // And it can be spent only once: the second stamp updates no row. That clause is
      // what narrows the window two retries in flight at the same moment would open.
      expect(await consumeAction(db, row.id)).toBeUndefined()
    })
  })

  it('answers none for a confirmation older than the question’s own life', async () => {
    /**
     * **NO API-LEVEL TEST CAN SEE THIS**: it would have to wait out
     * `PENDING_ACTION_TTL_MS`. The clause is the same argument the TTL itself makes — a
     * confirmation is given against a project that looked a certain way, and one older
     * than the row's life is not an answer about the project as it now is.
     */
    await withProject(async (db, { projectId, ownerId }) => {
      const stale = new Date(Date.now() - PENDING_ACTION_TTL_MS - 1000)
      const { bus, token, row } = await asked(db, projectId, ownerId, stale)
      await resolveAction(db, bus, {
        ...ANSWER,
        pendingActionId: row.id,
        resolvedBy: ownerId,
        state: 'confirmed',
      })
      expect(await resolutionFor(db, token.id, fingerprintOf(ASK))).toEqual({
        kind: 'none',
      })
    })
  })

  it('answers rejected, and carries the reason the agent is told', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const { bus, token, row } = await asked(db, projectId, ownerId)
      await resolveAction(db, bus, {
        ...ANSWER,
        pendingActionId: row.id,
        resolvedBy: ownerId,
        state: 'rejected',
        reason: 'not this term',
      })
      const found = await resolutionFor(db, token.id, fingerprintOf(ASK))
      expect(found.kind).toBe('rejected')
      expect(found.kind === 'rejected' && found.row.reason).toBe('not this term')
    })
  })

  it('is scoped to the TOKEN, so a confirmation is not a standing grant', async () => {
    // A confirmation grants ONE credential one retry. Matching on the fingerprint alone
    // would let a second token asking the identical question spend somebody else's answer.
    await withProject(async (db, { projectId, ownerId }) => {
      const { bus, row } = await asked(db, projectId, ownerId)
      await resolveAction(db, bus, {
        ...ANSWER,
        pendingActionId: row.id,
        resolvedBy: ownerId,
        state: 'confirmed',
      })
      const { row: other } = await mintTestToken(db, {
        userId: ownerId,
        projectId,
        capabilities: ['project:read'],
      })
      expect(await resolutionFor(db, other.id, fingerprintOf(ASK))).toEqual({
        kind: 'none',
      })
    })
  })

  it('refuses a second answer to one question, in the UPDATE and not in a read', async () => {
    // Two people opening §26's queue at the same moment: the state clause lives in the
    // WHERE, so the second updates no row and the route answers 409 rather than both
    // winning and the last write standing.
    await withProject(async (db, { projectId, ownerId }) => {
      const { bus, row } = await asked(db, projectId, ownerId)
      const first = await resolveAction(db, bus, {
        ...ANSWER,
        pendingActionId: row.id,
        resolvedBy: ownerId,
        state: 'confirmed',
      })
      expect(first?.state).toBe('confirmed')
      const second = await resolveAction(db, bus, {
        ...ANSWER,
        pendingActionId: row.id,
        resolvedBy: ownerId,
        state: 'rejected',
        reason: 'changed my mind',
      })
      expect(second).toBeUndefined()
      expect((await pendingById(db, row.id))?.state).toBe('confirmed')
    })
  })
})
