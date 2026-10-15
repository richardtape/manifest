/**
 * How long a unit or packages test may take: Vitest's own defaults, multiplied by
 * MANIFEST_TEST_TIMEOUT_SCALE (the gentler test tiers plan, Rich's yes of 2026-10-14).
 *
 * scripts/test-gently.sh runs the tiers at a lower macOS priority so the laptop stays usable, and a
 * lower priority is a slower run; it sets the scale from the priority it chose. Unset, the scale is 1,
 * so a single file run with `pnpm exec vitest run` keeps Vitest's 5 s. The cost, accepted by Rich: a
 * real hang takes the scale's multiple to report. `slowTestThreshold` (vitest.config.ts) keeps every
 * test over the old 5 s named in the output.
 *
 * Read by vitest.workspace.ts (the projects' limits), every test that sets its own limit (`scaled`),
 * and db/testing.ts and the global setup (the reset's lock budget). The docker project keeps 120 s.
 */
export const BASE_TEST_TIMEOUT_MS = 5_000
export const BASE_HOOK_TIMEOUT_MS = 10_000
export const MAX_TIMEOUT_SCALE = 10

export function timeoutScale(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.MANIFEST_TEST_TIMEOUT_SCALE
  if (raw === undefined || raw.trim() === '') return 1
  const scale = Number(raw)
  if (!Number.isFinite(scale) || scale < 1 || scale > MAX_TIMEOUT_SCALE) {
    throw new Error(
      `MANIFEST_TEST_TIMEOUT_SCALE must be a number from 1 to ${MAX_TIMEOUT_SCALE} — got '${raw}'. ` +
        'scripts/test-gently.sh sets it from the priority it runs the tier at; unset, it is 1.',
    )
  }
  return scale
}

export function testTimeouts(env: NodeJS.ProcessEnv = process.env): {
  testTimeout: number
  hookTimeout: number
} {
  const scale = timeoutScale(env)
  return {
    testTimeout: Math.round(BASE_TEST_TIMEOUT_MS * scale),
    hookTimeout: Math.round(BASE_HOOK_TIMEOUT_MS * scale),
  }
}

/** A test's or hook's own limit, scaled as the defaults are — or it would end up with less than they have. */
export function scaled(ms: number, env: NodeJS.ProcessEnv = process.env): number {
  return Math.round(ms * timeoutScale(env))
}

/**
 * The reset's lock budget, per attempt (db/truncate.ts). A quarter of a TEST's limit, not a hook's:
 * some files reset inside a test body, and three attempts with their pauses must fit inside it.
 */
export function resetLockTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  return Math.floor((BASE_TEST_TIMEOUT_MS * timeoutScale(env)) / 4)
}
