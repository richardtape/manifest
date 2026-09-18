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

/**
 * The same fixed window, with the limit given PER CALL rather than per instance (P5b
 * Task 9).
 *
 * §20 gives every delegated token its own limit, off its own row, so one limiter with one
 * `limit` cannot express them — and `delegated_tokens.rate_limit` would be a decorative
 * column. The plan predicted no change was needed here and that making one was a finding
 * to record; this is that change, and it is a second SURFACE on one implementation rather
 * than a second implementation. The alternative — a map of `RateLimiter`s built in
 * `server.ts` — puts a second copy of the window and its eviction in a file about wiring.
 *
 * **The limit is read on every call, so a token's row deciding differently tomorrow takes
 * effect on its next request** rather than at the next window. The count is not rescaled:
 * a window already open keeps what it has spent.
 */
export interface KeyedRateLimiter {
  take(key: string, limit: number): void
}

export function createKeyedRateLimiter(options: {
  windowMs: number
  now?: () => number
}): KeyedRateLimiter {
  const now = options.now ?? Date.now
  const windows = new Map<string, { start: number; count: number }>()
  return {
    take(key, limit) {
      const at = now()
      let window = windows.get(key)
      if (window === undefined || at - window.start >= options.windowMs) {
        window = { start: at, count: 0 }
        windows.set(key, window)
      }
      window.count += 1
      if (window.count > limit) {
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

/** One limit for every key — P5a Task 9's shape, now one line over the keyed one. */
export function createRateLimiter(options: {
  limit: number
  windowMs: number
  now?: () => number
}): RateLimiter {
  const keyed = createKeyedRateLimiter(options)
  return { take: (key) => keyed.take(key, options.limit) }
}

/**
 * §20's per-token window. A MINUTE, which is the unit `delegated_tokens.rate_limit`
 * counts in — the column's default of 600 is ten requests a second sustained, which is
 * far more than an agent driving a build loop needs and far less than one that has
 * stopped thinking.
 */
export const TOKEN_RATE_WINDOW_MS = 60_000
