export interface KeyedMutex {
  <T>(key: string, fn: () => Promise<T>): Promise<T>
  /**
   * How many keys are held or queued. For the test that proves this map does not
   * grow by one entry per deploy for the life of a process that never restarts.
   */
  size(): number
}

/**
 * One caller at a time per key, in this process.
 *
 * It guards an app network: `ensureAppNetwork` attaches §10's gateway and then the
 * container is created, and a retire decides whether anything still needs the
 * gateway and detaches it (Task 5). Interleave those two and an AI app can come up
 * with no route to its models — which P4b measured as a student waiting 611 s
 * (finding 181).
 *
 * IN PROCESS, deliberately. The control plane is one process (§21); two of them
 * against one daemon is not a Phase 1 configuration, and the environment lock in
 * `db/locks.ts` (Task 6) is what serializes anything that crosses a process
 * boundary. Saying so here is the point: an in-process mutex that looked like a
 * general answer would be a worse defect than not having one.
 */
export function createKeyedMutex(): KeyedMutex {
  const tails = new Map<string, Promise<unknown>>()

  const run = async <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    const previous = tails.get(key) ?? Promise.resolve()
    let release = (): void => {}
    const mine = new Promise<void>((resolve) => {
      release = resolve
    })
    // The tail is registered BEFORE the await, so a caller arriving in the same tick
    // queues behind this one rather than starting beside it.
    const tail = previous.then(() => mine)
    tails.set(key, tail)
    await previous
    try {
      return await fn()
    } finally {
      // IN A `finally`. A deploy that fails while holding the network is the common
      // case — a readiness refusal throws — so a lock that leaked on a throw would
      // wedge that app's every later deploy until the process restarted.
      release()
      // Only when nothing queued behind us: a later caller has already replaced the
      // entry, and deleting it then would let the caller after that start beside it.
      if (tails.get(key) === tail) tails.delete(key)
    }
  }

  return Object.assign(run, { size: () => tails.size })
}
