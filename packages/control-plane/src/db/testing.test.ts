import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from './client.js'
import { users } from './schema.js'
import { registerBackgroundWork, resetDatabase } from './testing.js'

describe('resetDatabase and background work (launch path plan Task 3, F26)', () => {
  it('resetDatabase waits for registered background work before it truncates', async () => {
    // Deterministic whatever the TRUNCATE's duration: a sentinel row the TRUNCATE removes.
    // The pass reads it after it is released. An AWAITED drain runs the pass before the
    // TRUNCATE, so the row is there; a drain that is merely called, or run beside the
    // TRUNCATE, reads it after (or blocked behind) the TRUNCATE, so the row is gone.
    //
    // Primed first: the admin pool's FIRST connection is made here, before the timed window, so a
    // slow first connect cannot let an un-awaited drain look as if it waited.
    await resetDatabase()
    const unique = randomUUID().slice(0, 8)
    await db.insert(users).values({
      ubcCwlPuid: `sentinel-${unique}`,
      email: `sentinel-${unique}@example.ubc.ca`,
      displayName: 'Sentinel',
    })
    let release!: () => void
    const pass = new Promise<void>((resolve) => {
      release = resolve
    })
    const order: string[] = []
    registerBackgroundWork(async () => {
      await pass
      const rows = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.ubcCwlPuid, `sentinel-${unique}`))
      order.push(rows.length === 1 ? 'drained-before-truncate' : 'drained-after-truncate')
    })
    const reset = resetDatabase().then(() => order.push('truncated'))
    // A grace period only: the truncate has NOT finished while a pass is in flight.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(order).toEqual([])
    release()
    await reset
    expect(order).toEqual(['drained-before-truncate', 'truncated'])
  })

  it('a drained pass is not waited for again', async () => {
    let calls = 0
    registerBackgroundWork(async () => {
      calls += 1
    })
    await resetDatabase()
    expect(calls).toBe(1)
    await resetDatabase()
    expect(calls).toBe(1)
  })

  it('a pass that rejects is logged, and the reset still runs', async () => {
    const lines: unknown[][] = []
    const unique = randomUUID().slice(0, 8)
    await db.insert(users).values({
      ubcCwlPuid: `sentinel-${unique}`,
      email: `sentinel-${unique}@example.ubc.ca`,
      displayName: 'Sentinel',
    })
    const original = console.error
    console.error = (...args: unknown[]) => {
      lines.push(args)
    }
    try {
      registerBackgroundWork(async () => {
        throw new Error('pass exploded')
      })
      await resetDatabase()
    } finally {
      console.error = original
    }
    expect(lines.some((l) => l.join(' ').includes('pass exploded'))).toBe(true)
    // The reset RAN, not only logged: the sentinel row is gone.
    expect(
      await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.ubcCwlPuid, `sentinel-${unique}`)),
    ).toEqual([])
  })
})
