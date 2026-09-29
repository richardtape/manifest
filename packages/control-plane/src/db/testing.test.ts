import { describe, expect, it } from 'vitest'
import { registerBackgroundWork, resetDatabase } from './testing.js'

describe('resetDatabase and background work (launch path plan Task 3, F26)', () => {
  it('resetDatabase waits for registered background work before it truncates', async () => {
    let release!: () => void
    const pass = new Promise<void>((resolve) => {
      release = resolve
    })
    const order: string[] = []
    registerBackgroundWork(async () => {
      await pass
      order.push('drained')
    })
    const reset = resetDatabase().then(() => order.push('truncated'))
    await new Promise((resolve) => setTimeout(resolve, 50))
    // The truncate has NOT run while a pass is in flight.
    expect(order).toEqual([])
    release()
    await reset
    expect(order).toEqual(['drained', 'truncated'])
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
  })
})
