import { describe, expect, it } from 'vitest'
import { withProject } from '../db/testing.js'
import { createEventBus } from '../observability/index.js'
import { TokenCapabilityRefusedError } from '../projects/index.js'
import {
  bodySha256,
  fingerprintOf,
  pendingById,
  recordPendingAction,
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
