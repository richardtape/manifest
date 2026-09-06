/**
 * §12's "concurrency cap per project and globally". It lives here, in the control
 * plane, and not in `buildkitd.toml`, because §12 also makes the builder ephemeral
 * per build: a daemon-level `max-parallelism` bounds only the build that owns that
 * daemon. This bounds how many daemons exist at once.
 */
export interface ConcurrencyLimits {
  globalConcurrency: number
  perProjectConcurrency: number
}

export function createBuildQueue(limits: ConcurrencyLimits): {
  run<T>(projectSlug: string, fn: () => Promise<T>): Promise<T>
  inFlight(): number
} {
  let global = 0
  const perProject = new Map<string, number>()
  const waiting: (() => void)[] = []

  const canStart = (slug: string) =>
    global < limits.globalConcurrency &&
    (perProject.get(slug) ?? 0) < limits.perProjectConcurrency

  const acquire = async (slug: string): Promise<void> => {
    while (!canStart(slug)) {
      await new Promise<void>((resolve) => waiting.push(resolve))
    }
    global += 1
    perProject.set(slug, (perProject.get(slug) ?? 0) + 1)
  }

  const release = (slug: string): void => {
    global -= 1
    perProject.set(slug, (perProject.get(slug) ?? 1) - 1)
    // Wake everyone and let each re-check: a waiter blocked on its PROJECT limit
    // must not consume the wake-up that a waiter blocked on the GLOBAL limit needs.
    const woken = waiting.splice(0, waiting.length)
    for (const wake of woken) wake()
  }

  return {
    async run(projectSlug, fn) {
      await acquire(projectSlug)
      try {
        return await fn()
      } finally {
        release(projectSlug)
      }
    },
    inFlight: () => global,
  }
}
