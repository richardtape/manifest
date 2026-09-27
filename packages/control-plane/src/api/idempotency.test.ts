import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { withRollback } from '../db/testing.js'
import { idempotencyKeys, users } from '../db/index.js'
import { IdempotencyConflictError, replayOrStore } from './idempotency.js'

/** The server-held key a request's fingerprint is made with — `config.sessionSecret` at boot. */
const HASH_KEY = 'h'.repeat(32)

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
      const handler = vi
        .fn()
        .mockResolvedValue({ status: 201, body: { id: 'project-1' } })
      const params = {
        key: 'abc',
        userId: user.id,
        route: 'POST /projects',
        params: {},
        hashKey: HASH_KEY,
        body: { slug: 'x' },
      }

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
      const handler = vi
        .fn()
        .mockResolvedValue({ status: 201, body: { id: 'project-1' } })
      await replayOrStore(
        db,
        {
          key: 'abc',
          userId: user.id,
          route: 'POST /projects',
          params: {},
          hashKey: HASH_KEY,
          body: { slug: 'x' },
        },
        handler,
      )
      await expect(
        replayOrStore(
          db,
          {
            key: 'abc',
            userId: user.id,
            route: 'POST /projects',
            params: {},
            hashKey: HASH_KEY,
            body: { slug: 'DIFFERENT' },
          },
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
        .values({
          ubcCwlPuid: 'k2',
          email: 'k2@ubc.ca',
          displayName: 'K2',
          role: 'member',
        })
        .returning()
      const handler = vi
        .fn()
        .mockResolvedValueOnce({ status: 201, body: { id: 'a' } })
        .mockResolvedValueOnce({ status: 201, body: { id: 'b' } })

      const first = await replayOrStore(
        db,
        {
          key: 'same',
          userId: one.id,
          route: 'POST /projects',
          params: {},
          hashKey: HASH_KEY,
          body: {},
        },
        handler,
      )
      const second = await replayOrStore(
        db,
        {
          key: 'same',
          userId: two!.id,
          route: 'POST /projects',
          params: {},
          hashKey: HASH_KEY,
          body: {},
        },
        handler,
      )
      expect(first.body).toEqual({ id: 'a' })
      expect(second.body).toEqual({ id: 'b' })
    })
  })

  /**
   * A REQUEST'S FINGERPRINT IS KEYED (the authoring API plan's Task 8). A mutation's body can BE
   * a secret — `setAppSecret`'s is the value — and an unkeyed SHA-256 of it in this table lets
   * anyone who can read the database check a guess against it, which §20's separate custody of
   * the master key exists to prevent. Keyed with a secret the database does not hold, the
   * stored hash says nothing on its own.
   */
  it('stores a KEYED hash of the body — never one a reader of the table could check a guess against', async () => {
    await withRollback(async (db) => {
      const user = await aUser(db)
      const body = { value: 'swordfish-7c2e' }
      const params = {
        key: 'secret-set',
        userId: user.id,
        route: 'PUT /v1/environments/:environmentId/secrets/:name',
        params: { environmentId: 'staging-env', name: 'BOARD_ADMIN_CODE' },
        hashKey: HASH_KEY,
        body,
      }
      const handler = vi.fn().mockResolvedValue({ status: 200, body: { set: true } })
      await replayOrStore(db, params, handler)
      const [row] = await db
        .select()
        .from(idempotencyKeys)
        .where(eq(idempotencyKeys.key, 'secret-set'))
      const unkeyed = createHash('sha256').update(JSON.stringify(body)).digest('hex')
      expect(row!.requestHash).toMatch(/^[0-9a-f]{64}$/)
      expect(row!.requestHash).not.toBe(unkeyed)
      // The positive controls: the same body under the same server key still replays…
      expect(await replayOrStore(db, params, handler)).toEqual({
        status: 200,
        body: { set: true },
      })
      expect(handler).toHaveBeenCalledTimes(1)
      // …and under ANOTHER server key it does not match — the hash depends on the key.
      await expect(
        replayOrStore(db, { ...params, hashKey: 'g'.repeat(32) }, handler),
      ).rejects.toThrow(IdempotencyConflictError)
      // …nor for ANOTHER RESOURCE on the same route, the body identical (the final review's
      // Important 2): the path parameters are the request too.
      await expect(
        replayOrStore(
          db,
          { ...params, params: { environmentId: 'staging-env', name: 'SIS_API_KEY' } },
          handler,
        ),
      ).rejects.toThrow(IdempotencyConflictError)
      expect(handler).toHaveBeenCalledTimes(1)
    })
  })

  it('WITHHOLDS on replay: stores stored(answer), refuses a repeat with refuse(stored), and checks the fingerprint FIRST (the authoring API plan’s Task 12)', async () => {
    await withRollback(async (db) => {
      const user = await aUser(db)
      const handler = vi.fn().mockResolvedValue({
        status: 201,
        body: { token: { id: 't-1' }, secret: 'THE-SECRET' },
      })
      class Withheld extends Error {}
      const withhold = {
        stored: (answer: unknown) => ({ token: (answer as { token: unknown }).token }),
        refuse: (stored: unknown) => new Withheld(JSON.stringify(stored)),
      }
      const params = {
        key: 'k-mint',
        userId: user.id,
        route: 'POST /mint',
        params: {},
        hashKey: HASH_KEY,
        body: { name: 'x' },
      }
      // The caller that made it gets the whole answer, once.
      const first = await replayOrStore(db, params, handler, withhold)
      expect(first.body).toEqual({ token: { id: 't-1' }, secret: 'THE-SECRET' })
      const [row] = await db
        .select()
        .from(idempotencyKeys)
        .where(eq(idempotencyKeys.key, 'k-mint'))
      expect(row!.responseBody).toEqual({ token: { id: 't-1' } })
      // A repeat is refused, from what was kept — and the handler never runs again.
      await expect(replayOrStore(db, params, handler, withhold)).rejects.toThrow(
        new Withheld('{"token":{"id":"t-1"}}'),
      )
      expect(handler).toHaveBeenCalledTimes(1)
      // The same key with a different body is the fingerprint's refusal, before any other.
      await expect(
        replayOrStore(db, { ...params, body: { name: 'y' } }, handler, withhold),
      ).rejects.toThrow(IdempotencyConflictError)
    })
  })

  it('does not store a response when the handler throws', async () => {
    await withRollback(async (db) => {
      const user = await aUser(db)
      const failing = vi.fn().mockRejectedValue(new Error('boom'))
      const params = {
        key: 'abc',
        userId: user.id,
        route: 'POST /projects',
        params: {},
        hashKey: HASH_KEY,
        body: {},
      }
      await expect(replayOrStore(db, params, failing)).rejects.toThrow('boom')

      // A retry after a failure must actually retry, not replay a failure.
      const succeeding = vi.fn().mockResolvedValue({ status: 201, body: { id: 'ok' } })
      expect((await replayOrStore(db, params, succeeding)).body).toEqual({ id: 'ok' })
    })
  })
})
