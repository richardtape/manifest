import { describe, expect, it } from 'vitest'
import { createRateLimiter, RateLimitedError } from './rate-limit.js'

describe('a per-key fixed window (P5a Task 9)', () => {
  it('allows the limit, refuses the next with the seconds left, and opens a new window', () => {
    let now = 0
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000, now: () => now })
    for (let i = 0; i < 3; i += 1) limiter.take('a')
    now = 20_000
    try {
      limiter.take('a')
      expect.unreachable('the fourth take should be refused')
    } catch (error) {
      expect(error).toBeInstanceOf(RateLimitedError)
      expect((error as RateLimitedError).retryAfterSeconds).toBe(40)
    }
    // Another key has its own window.
    limiter.take('b')
    now = 60_000
    limiter.take('a')
  })
})
