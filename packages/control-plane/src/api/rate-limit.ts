/**
 * A fixed window per key, in this process (P5a Decision 26). §23 requires the slug check
 * to be rate-limited, and it is asked while a person types. Per USER, not per address:
 * every host request reaches the edge from one address (P5a Task 1, M2), so a per-IP limit
 * would be one limit for everybody. P5b generalises this to per-token limits (§20).
 */
export class RateLimitedError extends Error {
  readonly code = 'RATE_LIMITED'
  constructor(readonly retryAfterSeconds: number) {
    super(`too many requests; try again in ${retryAfterSeconds} s`)
    this.name = 'RateLimitedError'
  }
}

export interface RateLimiter {
  take(key: string): void
}

export function createRateLimiter(options: {
  limit: number
  windowMs: number
  now?: () => number
}): RateLimiter {
  const now = options.now ?? Date.now
  const windows = new Map<string, { start: number; count: number }>()
  return {
    take(key) {
      const at = now()
      let window = windows.get(key)
      if (window === undefined || at - window.start >= options.windowMs) {
        window = { start: at, count: 0 }
        windows.set(key, window)
      }
      window.count += 1
      if (window.count > options.limit) {
        throw new RateLimitedError(
          Math.max(1, Math.ceil((window.start + options.windowMs - at) / 1000)),
        )
      }
      // Bounded: a window that has closed is forgotten once the map is large.
      if (windows.size > 10_000) {
        for (const [k, w] of windows)
          if (at - w.start >= options.windowMs) windows.delete(k)
      }
    },
  }
}
