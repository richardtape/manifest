import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSerialQueue } from './queue.js'

describe('the source-sync queue — one job at a time across the process (Decision 10)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('runs jobs one at a time, in order, and idle() waits for the last', async () => {
    const q = createSerialQueue()
    const events: string[] = []
    let running = 0
    let most = 0
    const job = (name: string, ms: number) => async () => {
      running++
      most = Math.max(most, running)
      events.push(`${name} start`)
      await new Promise((resolve) => setTimeout(resolve, ms))
      events.push(`${name} end`)
      running--
    }
    q.enqueue('a', job('a', 20))
    q.enqueue('b', job('b', 1))
    q.enqueue('c', job('c', 5))
    await q.idle()
    expect(most).toBe(1)
    expect(events).toEqual(['a start', 'a end', 'b start', 'b end', 'c start', 'c end'])
  })

  it('a job that throws writes an operator line naming it, and the NEXT job still runs', async () => {
    const lines: string[] = []
    vi.spyOn(console, 'error').mockImplementation((line: unknown) => {
      lines.push(String(line))
    })
    const q = createSerialQueue()
    let after = false
    q.enqueue('webhook push chem-labs 1234', async () => {
      throw new Error('the mirror is gone')
    })
    q.enqueue('next', async () => {
      after = true
    })
    await q.idle()
    expect(after).toBe(true)
    expect(lines).toEqual([
      '[source-sync] webhook push chem-labs 1234 failed: the mirror is gone',
    ])
  })

  it('idle() also waits for a job enqueued WHILE it waits', async () => {
    const q = createSerialQueue()
    let second = false
    q.enqueue('first', async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      q.enqueue('second', async () => {
        await new Promise((resolve) => setTimeout(resolve, 5))
        second = true
      })
    })
    await q.idle()
    expect(second).toBe(true)
  })
})
