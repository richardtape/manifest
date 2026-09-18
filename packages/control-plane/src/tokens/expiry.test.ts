import { describe, expect, it } from 'vitest'
import { withProject } from '../db/testing.js'
import { pendingActions, type Db } from '../db/index.js'
import { expirePendingActions } from './expiry.js'
import { bodySha256, pendingById, type PendingAction } from './pending.js'
import { mintTestToken } from './testing.js'

/**
 * A pending action, written straight to the table with the expiry and state a test needs.
 *
 * Local to this file, as Global Constraints requires of a fixture a snippet names: the
 * sweeper is about rows, and building them through `recordPendingAction` would make every
 * test here depend on the refusal path as well as on the sweep.
 *
 * **EVERY ROW GETS ITS OWN PATH unless one is given.** Two `pending` rows with the same
 * token, method, path and body hash are what this task's own partial unique index
 * forbids — so a fixture that reused one path would have made these tests uninsertable
 * the moment the index landed, which reads as a defect in the sweeper.
 */
let seeded = 0
async function seedPending(
  db: Db,
  ctx: { projectId: string; ownerId: string; tokenId: string },
  options: {
    expiresAt: Date
    state?: PendingAction['state']
    path?: string
  },
): Promise<PendingAction> {
  seeded += 1
  const resolved = options.state === 'confirmed' || options.state === 'rejected'
  const [row] = await db
    .insert(pendingActions)
    .values({
      projectId: ctx.projectId,
      requestedByToken: ctx.tokenId,
      action: 'members:manage',
      payload: {
        method: 'POST',
        path: options.path ?? `/v1/projects/p/members/${seeded}`,
        bodySha256: bodySha256({ puid: 'bio_student' }),
        summary: 'Add or change a member',
      },
      expiresAt: options.expiresAt,
      ...(options.state === undefined ? {} : { state: options.state }),
      ...(resolved ? { resolvedBy: ctx.ownerId, resolvedAt: new Date() } : {}),
    })
    .returning()
  return row!
}

async function tokenIn(
  db: Db,
  ctx: { projectId: string; ownerId: string },
): Promise<string> {
  const { row } = await mintTestToken(db, {
    userId: ctx.ownerId,
    projectId: ctx.projectId,
    capabilities: ['members:manage'],
  })
  return row.id
}

const PAST = (): Date => new Date(Date.now() - 1000)
const FUTURE = (): Date => new Date(Date.now() + 86_400_000)

describe('expiry (§6, D24, P5b Task 10)', () => {
  it('moves a pending action past its expiry to `expired`, and leaves the rest', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const ctx = {
        projectId,
        ownerId,
        tokenId: await tokenIn(db, { projectId, ownerId }),
      }
      const stale = await seedPending(db, ctx, { expiresAt: PAST() })
      const fresh = await seedPending(db, ctx, { expiresAt: FUTURE() })

      expect(await expirePendingActions(db, new Date())).toBe(1)

      expect((await pendingById(db, stale.id))?.state).toBe('expired')
      expect((await pendingById(db, fresh.id))?.state).toBe('pending')
    })
  })

  it('never re-opens or re-decides a resolved one', async () => {
    // An expired sweep that touched a `confirmed` row would revoke a human's decision
    // after the fact, which is the one thing this sweeper must not do.
    //
    // **THE STALE PENDING ROW IS THE POSITIVE HALF, and it is here deliberately.** Two of
    // sitting 6's four new tests were green before the feature existed because both were
    // claims that something is NOT done, which is true of a platform that does nothing
    // (sitting 6's F5). A sweep of nothing satisfies "the confirmed row is untouched"; it
    // does not satisfy the line below it.
    await withProject(async (db, { projectId, ownerId }) => {
      const ctx = {
        projectId,
        ownerId,
        tokenId: await tokenIn(db, { projectId, ownerId }),
      }
      const confirmed = await seedPending(db, ctx, {
        expiresAt: PAST(),
        state: 'confirmed',
      })
      const rejected = await seedPending(db, ctx, {
        expiresAt: PAST(),
        state: 'rejected',
      })
      const stale = await seedPending(db, ctx, { expiresAt: PAST() })

      expect(await expirePendingActions(db, new Date())).toBe(1)

      expect((await pendingById(db, confirmed.id))?.state).toBe('confirmed')
      expect((await pendingById(db, rejected.id))?.state).toBe('rejected')
      expect((await pendingById(db, stale.id))?.state).toBe('expired')
    })
  })

  it('is idempotent — a second sweep expires nothing', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const ctx = {
        projectId,
        ownerId,
        tokenId: await tokenIn(db, { projectId, ownerId }),
      }
      await seedPending(db, ctx, { expiresAt: PAST() })

      expect(await expirePendingActions(db, new Date())).toBe(1)
      expect(await expirePendingActions(db, new Date())).toBe(0)
    })
  })

  it('expires only one token’s questions when a token is named', async () => {
    // The scope `recordPendingAction` uses before it inserts (F10's fix): the caller
    // about to ask a question sweeps ITS OWN stale rows, never the whole table, because
    // a request path must not write rows belonging to every other tenant on the platform.
    //
    // The unscoped sweep at the end is the positive half: it proves the other token's row
    // was expirable all along, so "the scope left it alone" is a statement about the
    // scope and not about a sweep that could not move it.
    await withProject(async (db, { projectId, ownerId }) => {
      const mine = await tokenIn(db, { projectId, ownerId })
      const theirs = await tokenIn(db, { projectId, ownerId })
      const ours = await seedPending(
        db,
        { projectId, ownerId, tokenId: mine },
        {
          expiresAt: PAST(),
        },
      )
      const other = await seedPending(
        db,
        { projectId, ownerId, tokenId: theirs },
        {
          expiresAt: PAST(),
        },
      )

      expect(await expirePendingActions(db, new Date(), { tokenId: mine })).toBe(1)
      expect((await pendingById(db, ours.id))?.state).toBe('expired')
      expect((await pendingById(db, other.id))?.state).toBe('pending')

      expect(await expirePendingActions(db, new Date())).toBe(1)
      expect((await pendingById(db, other.id))?.state).toBe('expired')
    })
  })
})
