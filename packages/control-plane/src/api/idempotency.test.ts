import { describe, expect, it, vi } from 'vitest'
import { withRollback } from '../db/testing.js'
import { users } from '../db/index.js'
import { IdempotencyConflictError, replayOrStore } from './idempotency.js'

async function aUser(db: Parameters<typeof replayOrStore>[0]) {
  const [user] = await db
    .insert(users)
    .values({ ubcCwlPuid: 'k', email: 'k@ubc.ca', displayName: 'K', role: 'member' })
    .returning()
  return user!
}

describe('idempotency (D23.6)', () => {
  it('runs the handler once and replays the stored response', async () => {
    await withRollback(async (db) => {
      const user = await aUser(db)
      const handler = vi.fn().mockResolvedValue({ status: 201, body: { id: 'project-1' } })
      const params = { key: 'abc', userId: user.id, route: 'POST /projects', body: { slug: 'x' } }

      const first = await replayOrStore(db, params, handler)
      const second = await replayOrStore(db, params, handler)

      expect(handler).toHaveBeenCalledTimes(1)
      expect(first).toEqual({ status: 201, body: { id: 'project-1' } })
      expect(second).toEqual(first)
    })
  })

  it('rejects the same key replayed with a different body', async () => {
    await withRollback(async (db) => {
      const user = await aUser(db)
      const handler = vi.fn().mockResolvedValue({ status: 201, body: { id: 'project-1' } })
      await replayOrStore(
        db, { key: 'abc', userId: user.id, route: 'POST /projects', body: { slug: 'x' } }, handler,
      )
      await expect(
        replayOrStore(
          db, { key: 'abc', userId: user.id, route: 'POST /projects', body: { slug: 'DIFFERENT' } },
          handler,
        ),
      ).rejects.toThrow(IdempotencyConflictError)
      expect(handler).toHaveBeenCalledTimes(1)
    })
  })

  it('scopes keys per user, so two users may use the same key', async () => {
    await withRollback(async (db) => {
      const one = await aUser(db)
      const [two] = await db
        .insert(users)
        .values({ ubcCwlPuid: 'k2', email: 'k2@ubc.ca', displayName: 'K2', role: 'member' })
        .returning()
      const handler = vi.fn()
        .mockResolvedValueOnce({ status: 201, body: { id: 'a' } })
        .mockResolvedValueOnce({ status: 201, body: { id: 'b' } })

      const first = await replayOrStore(
        db, { key: 'same', userId: one.id, route: 'POST /projects', body: {} }, handler,
      )
      const second = await replayOrStore(
        db, { key: 'same', userId: two!.id, route: 'POST /projects', body: {} }, handler,
      )
      expect(first.body).toEqual({ id: 'a' })
      expect(second.body).toEqual({ id: 'b' })
    })
  })

  it('does not store a response when the handler throws', async () => {
    await withRollback(async (db) => {
      const user = await aUser(db)
      const failing = vi.fn().mockRejectedValue(new Error('boom'))
      const params = { key: 'abc', userId: user.id, route: 'POST /projects', body: {} }
      await expect(replayOrStore(db, params, failing)).rejects.toThrow('boom')

      // A retry after a failure must actually retry, not replay a failure.
      const succeeding = vi.fn().mockResolvedValue({ status: 201, body: { id: 'ok' } })
      expect((await replayOrStore(db, params, succeeding)).body).toEqual({ id: 'ok' })
    })
  })
})
