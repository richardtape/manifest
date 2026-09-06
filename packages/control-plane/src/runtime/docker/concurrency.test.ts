import { describe, expect, it } from 'vitest'
import { createBuildQueue } from './concurrency.js'

const deferred = () => {
  let release: () => void = () => {}
  const promise = new Promise<void>((resolve) => (release = resolve))
  return { promise, release }
}

describe('build concurrency (§12, §20 availability)', () => {
  it('runs up to the global limit at once', async () => {
    const queue = createBuildQueue({ globalConcurrency: 2, perProjectConcurrency: 2 })
    const gates = [deferred(), deferred(), deferred()]
    const runs = gates.map((gate, index) =>
      queue.run(`project-${index}`, async () => {
        await gate.promise
        return index
      }),
    )
    await new Promise((r) => setTimeout(r, 10))
    expect(queue.inFlight()).toBe(2)
    gates.forEach((g) => g.release())
    expect(await Promise.all(runs)).toEqual([0, 1, 2])
  })

  // §20: "Build concurrency is bounded per project and globally." Per project is
  // the half that stops one project starving every other one on a laptop.
  it('bounds one project even when the global budget is free', async () => {
    const queue = createBuildQueue({ globalConcurrency: 8, perProjectConcurrency: 1 })
    const gates = [deferred(), deferred()]
    const runs = gates.map((gate) =>
      queue.run('chem-labs', async () => {
        await gate.promise
      }),
    )
    await new Promise((r) => setTimeout(r, 10))
    expect(queue.inFlight()).toBe(1)
    gates.forEach((g) => g.release())
    await Promise.all(runs)
  })

  it('releases the slot when the build throws', async () => {
    const queue = createBuildQueue({ globalConcurrency: 1, perProjectConcurrency: 1 })
    await expect(
      queue.run('p', async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(queue.inFlight()).toBe(0)
    await expect(queue.run('p', async () => 'ok')).resolves.toBe('ok')
  })
})
