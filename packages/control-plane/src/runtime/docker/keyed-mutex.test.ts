import { describe, expect, it } from 'vitest'
import { createKeyedMutex } from './keyed-mutex.js'

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

describe('createKeyedMutex (P4c Decision 13)', () => {
  it('runs two callers of ONE key one after the other', async () => {
    const run = createKeyedMutex()
    const seen: string[] = []
    await Promise.all([
      run('net-a', async () => {
        seen.push('first in')
        await sleep(40)
        seen.push('first out')
      }),
      sleep(5).then(() =>
        run('net-a', async () => {
          seen.push('second in')
          seen.push('second out')
        }),
      ),
    ])
    expect(seen).toEqual(['first in', 'first out', 'second in', 'second out'])
  })

  it('lets two keys run at the same time', async () => {
    const run = createKeyedMutex()
    const seen: string[] = []
    await Promise.all([
      run('net-a', async () => {
        seen.push('a in')
        await sleep(40)
        seen.push('a out')
      }),
      sleep(5).then(() =>
        run('net-b', async () => {
          seen.push('b in')
          await sleep(5)
          seen.push('b out')
        }),
      ),
    ])
    // One app's deploy must not wait on another app's. The keys are app networks.
    expect(seen).toEqual(['a in', 'b in', 'b out', 'a out'])
  })

  it('releases the key when the caller throws — the next one still runs', async () => {
    const run = createKeyedMutex()
    await expect(
      run('net-a', async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    // A deploy that fails while holding the network lock is the COMMON case — a
    // readiness refusal throws — so a lock that leaked on a throw would wedge that
    // app's every future deploy in a process that never restarts.
    await expect(run('net-a', async () => 'through')).resolves.toBe('through')
  })

  it('returns what the caller returned, and gives each key its own turn order', async () => {
    const run = createKeyedMutex()
    const order: number[] = []
    const results = await Promise.all(
      [1, 2, 3].map((n) =>
        run('net-a', async () => {
          await sleep(10)
          order.push(n)
          return n * 2
        }),
      ),
    )
    expect(results).toEqual([2, 4, 6])
    expect(order).toEqual([1, 2, 3])
  })

  // The map of tails must not grow by one entry per deploy for the life of the
  // process: this is a long-running control plane, and a `Map` keyed on app network
  // that is never cleared is a leak with one entry per app per restart.
  it('forgets a key once nothing is waiting on it', async () => {
    const run = createKeyedMutex()
    await run('net-a', async () => undefined)
    expect(run.size()).toBe(0)
    const held = run('net-a', () => sleep(30))
    expect(run.size()).toBe(1)
    await held
    expect(run.size()).toBe(0)
  })
})
