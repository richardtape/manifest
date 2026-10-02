import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from './client.js'
import { withEnvironmentLock, withProjectLock } from './locks.js'

/** Resolves on the next turn of the event loop, repeatedly, until `predicate` holds. */
async function waitUntil(predicate: () => boolean, ms = 5_000): Promise<void> {
  const deadline = Date.now() + ms
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('waitUntil timed out')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

describe('withEnvironmentLock (P4c Task 6)', () => {
  it('serializes two holders of the SAME environment', async () => {
    // §11: one reconciliation loop per project, serialized. A deploy and a retire of
    // one environment must not choose what to retire at the same moment.
    const environmentId = randomUUID()
    const order: string[] = []
    let firstInside = false
    let releaseFirst = (): void => {}
    const firstMayFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })

    const first = withEnvironmentLock(environmentId, async () => {
      order.push('first in')
      firstInside = true
      await firstMayFinish
      order.push('first out')
    })
    await waitUntil(() => firstInside)

    const second = withEnvironmentLock(environmentId, async () => {
      order.push('second in')
    })
    // Long enough that a lock which did not hold would have let `second` in.
    await sleep(250)
    expect(order).toEqual(['first in'])

    releaseFirst()
    await Promise.all([first, second])
    expect(order).toEqual(['first in', 'first out', 'second in'])
  })

  it('does not make one environment wait for another', async () => {
    // The lock is per environment, not global: two different apps deploy at once.
    const held = randomUUID()
    const other = randomUUID()
    let insideHeld = false
    let releaseHeld = (): void => {}
    const heldMayFinish = new Promise<void>((resolve) => {
      releaseHeld = resolve
    })

    const holder = withEnvironmentLock(held, async () => {
      insideHeld = true
      await heldMayFinish
    })
    await waitUntil(() => insideHeld)

    expect(await withEnvironmentLock(other, async () => 'ran')).toBe('ran')

    releaseHeld()
    await holder
  })

  it('releases the lock when the holder THROWS', async () => {
    // A deploy that fails still has to let the next one in — and a session-level
    // advisory lock outlives the failure unless something unlocks it.
    const environmentId = randomUUID()
    await expect(
      withEnvironmentLock(environmentId, () =>
        Promise.reject(new Error('deploy failed')),
      ),
    ).rejects.toThrow('deploy failed')
    expect(await withEnvironmentLock(environmentId, async () => 'next')).toBe('next')
  })

  it('is a real advisory lock, visible in pg_locks while it is held', async () => {
    // Two independent reads of the rule: the serialization above could be produced by
    // an in-process queue that Postgres cannot see, and `pnpm test` and a running
    // control plane are two processes against one database (Decision 14).
    const environmentId = randomUUID()
    // Postgres stores a bigint advisory key as classid = the high 32 bits, objid = the
    // low 32 bits, objsubid = 1 — so the key is reassembled by masking rather than by
    // shifting the two halves back together, which overflows int8 for a high bit set.
    // Verified against this database on 2026-09-15, for a positive key and a negative one.
    const name = `manifest:environment:${environmentId}`
    const held = async (): Promise<number> => {
      const result = await db.execute(
        sql`SELECT count(*)::int AS n FROM pg_locks
            WHERE locktype = 'advisory' AND granted AND objsubid = 1
              AND classid = ((hashtextextended(${name}, 0) >> 32) & 4294967295)::bigint::oid
              AND objid = (hashtextextended(${name}, 0) & 4294967295)::bigint::oid`,
      )
      return (result.rows[0] as { n: number }).n
    }

    let insideCount = -1
    let releaseHolder = (): void => {}
    const mayFinish = new Promise<void>((resolve) => {
      releaseHolder = resolve
    })
    const holder = withEnvironmentLock(environmentId, async () => {
      insideCount = await held()
      await mayFinish
    })
    await waitUntil(() => insideCount >= 0)
    expect(insideCount).toBe(1)

    releaseHolder()
    await holder
    expect(await held()).toBe(0)
  })

  it('lets more holders than the pool has connections finish, each querying the database while it holds (sitting 12, F1)', async () => {
    // THE CONTROL PLANE DEADLOCKED AT BOOT ON THIS (the launch path plan's sitting 12, F1):
    // `recoverAtBoot` schedules a retire pass for every environment at once, and each pass holds
    // its environment's lock and then queries. With as many passes as the pool had connections,
    // every connection was a lock holder waiting for one more — and every request after it, the
    // sign-in included, waited for ever. Twelve holders here: past `pg.Pool`'s default of ten.
    const holders = Promise.all(
      Array.from({ length: 12 }, () =>
        withEnvironmentLock(randomUUID(), async () => {
          // Every holder holds at once before any of them queries.
          await sleep(100)
          const result = await db.execute(sql`SELECT 1 AS one`)
          return result.rows.length
        }),
      ),
    )
    const outcome = await Promise.race([
      holders.then((counts) => counts.join(',')),
      sleep(10_000).then(
        () => 'deadlocked: every connection a lock holder waiting for another',
      ),
    ])
    expect(outcome).toBe(Array.from({ length: 12 }, () => 1).join(','))
  }, 20_000)
})

/**
 * §11's archive and delete (the front-end enablement plan's Task 11): one of either at a time per
 * PROJECT. The environment's lock is what serialises an archive against a deploy; this one
 * serialises two archives, an archive and a restore, or an archive and a delete.
 */
describe('withProjectLock (Task 11)', () => {
  it('lets more NESTED holders than the lock pool has connections finish — a project lock, then an environment lock inside it (sitting 12, the review’s I2)', async () => {
    // F1 MOVED THE LOCKS TO A POOL OF THEIR OWN, AND NESTING COULD STILL EXHAUST IT: an archive or a
    // delete holds its project's lock and takes each environment's inside it, and a rehearsal its own
    // lock and then the deploy's environment lock. Ten outer holders on one pool of ten, each waiting
    // for an eleventh connection for the inner lock, wedged every deploy, archive and rehearsal on the
    // platform with no line logged. Twelve here.
    const holders = Promise.all(
      Array.from({ length: 12 }, () =>
        withProjectLock(randomUUID(), async () => {
          await sleep(100)
          return withEnvironmentLock(randomUUID(), async () => {
            const result = await db.execute(sql`SELECT 1 AS one`)
            return result.rows.length
          })
        }),
      ),
    )
    const outcome = await Promise.race([
      holders.then((counts) => counts.join(',')),
      sleep(10_000).then(
        () =>
          'deadlocked: every lock connection an outer holder waiting for an inner one',
      ),
    ])
    expect(outcome).toBe(Array.from({ length: 12 }, () => 1).join(','))
  }, 20_000)

  it('serializes two holders of the SAME project, and never waits on an environment’s lock of the same id', async () => {
    const id = randomUUID()
    const order: string[] = []
    let firstInside = false
    let releaseFirst = (): void => {}
    const firstMayFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const first = withProjectLock(id, async () => {
      order.push('first in')
      firstInside = true
      await firstMayFinish
      order.push('first out')
    })
    await waitUntil(() => firstInside)
    const second = withProjectLock(id, async () => {
      order.push('second in')
    })
    // A different KEY, whatever the id: the environment lock of the same uuid is not held.
    await withEnvironmentLock(id, async () => {
      order.push('environment in')
    })
    await sleep(250)
    expect(order).toEqual(['first in', 'environment in'])
    releaseFirst()
    await Promise.all([first, second])
    expect(order).toEqual(['first in', 'environment in', 'first out', 'second in'])
  })
})
