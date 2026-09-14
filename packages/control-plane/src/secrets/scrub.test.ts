import { describe, expect, it } from 'vitest'
import { SECRET_ENV_NAMES, scrubSecretEnv } from './index.js'

describe('the process.env scrub (§12)', () => {
  it('removes the KEY, not just the value, so a child cannot inherit it', () => {
    const env = { POSTGRES_PASSWORD: 'hunter2', PATH: '/usr/bin' }
    scrubSecretEnv(env)
    // `Object.keys`, not `env.POSTGRES_PASSWORD === undefined`. Assigning
    // `undefined` leaves the key in place, and `child_process` stringifies it —
    // the child then receives the literal text "undefined" for a variable that
    // was supposed to be gone. Deleting is the only thing that works.
    expect(Object.keys(env)).toEqual(['PATH'])
  })

  it('returns the names it removed, so the boot line can say how many', () => {
    const env = {
      POSTGRES_PASSWORD: 'hunter2',
      MANIFEST_MASTER_SECRET: 'x'.repeat(32),
      PATH: '/usr/bin',
    }
    expect(scrubSecretEnv(env).sort()).toEqual([
      'MANIFEST_MASTER_SECRET',
      'POSTGRES_PASSWORD',
    ])
  })

  it('leaves a variable that is not a secret exactly as it found it', () => {
    const env = { MANIFEST_PORT: '7100', NODE_EXTRA_CA_CERTS: '/ca.crt' }
    expect(scrubSecretEnv(env)).toEqual([])
    expect(env).toEqual({ MANIFEST_PORT: '7100', NODE_EXTRA_CA_CERTS: '/ca.crt' })
  })

  it('covers every secret-bearing variable this repo’s .env actually sets', () => {
    // Named explicitly rather than matched by a pattern: `/SECRET/` misses
    // POSTGRES_PASSWORD and the database URLs, which carry a password each. If
    // a new secret is added to .env and not to this list, it reaches every child
    // process the control plane spawns — `git` in build/context.ts among them.
    for (const name of [
      'POSTGRES_PASSWORD',
      'MANIFEST_DATABASE_URL',
      'MANIFEST_MASTER_SECRET',
      'MANIFEST_SESSION_SECRET',
      'LITELLM_MASTER_KEY',
      // Not in .env: README's export block names the key this way for the control
      // plane (P4b Task 5), exactly as it builds MANIFEST_DATABASE_URL. A second name
      // for one secret is a second thing to scrub.
      'MANIFEST_LITELLM_MASTER_KEY',
      'SSP_RO_PASSWORD',
    ]) {
      expect(SECRET_ENV_NAMES).toContain(name)
    }
  })
})
