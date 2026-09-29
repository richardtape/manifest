import { describe, expect, it } from 'vitest'
import { realGithubRefusal } from './test-tier-guard.js'

// Launch path plan, Task 2 Step 0: the global setup's refusal of a real GitHub.
describe('the test tiers refuse a real GitHub', () => {
  const on = { MANIFEST_SOURCE_DRIVER: 'github' }

  it('refuses a real API host and names the variable and the host', () => {
    const text = realGithubRefusal({
      ...on,
      MANIFEST_GITHUB_API_URL: 'https://api.github.com',
    })
    expect(text).toContain(
      'MANIFEST_GITHUB_API_URL points at a real GitHub (api.github.com)',
    )
  })

  it('refuses a real git host, naming the git variable', () => {
    const text = realGithubRefusal({
      ...on,
      MANIFEST_GITHUB_GIT_URL: 'https://github.com',
    })
    expect(text).toContain('MANIFEST_GITHUB_GIT_URL points at a real GitHub (github.com)')
  })

  it('prints the host and not the whole value', () => {
    const text = realGithubRefusal({
      ...on,
      MANIFEST_GITHUB_GIT_URL: 'https://user:hunter2@github.com/x',
    })
    expect(text).not.toContain('hunter2')
  })

  it('refuses an unparseable value, naming the variable and not the value', () => {
    const text = realGithubRefusal({ ...on, MANIFEST_GITHUB_API_URL: 'not a url zzz' })
    expect(text).toContain('MANIFEST_GITHUB_API_URL')
    expect(text).not.toContain('zzz')
  })

  it('allows the fake, on every loopback spelling (positive controls)', () => {
    for (const url of [
      'http://127.0.0.1:7110',
      'http://127.0.0.2:7110',
      'http://localhost:7110',
      'http://[::1]:7110',
    ]) {
      expect(realGithubRefusal({ ...on, MANIFEST_GITHUB_API_URL: url })).toBeNull()
      expect(realGithubRefusal({ ...on, MANIFEST_GITHUB_GIT_URL: url })).toBeNull()
    }
  })

  it('allows unset and empty URLs, which are the config defaults', () => {
    expect(realGithubRefusal({ ...on })).toBeNull()
    expect(realGithubRefusal({ ...on, MANIFEST_GITHUB_API_URL: '' })).toBeNull()
  })

  it('allows a real URL when the driver is not github', () => {
    expect(
      realGithubRefusal({ MANIFEST_GITHUB_API_URL: 'https://api.github.com' }),
    ).toBeNull()
    expect(
      realGithubRefusal({
        MANIFEST_SOURCE_DRIVER: 'local',
        MANIFEST_GITHUB_API_URL: 'https://api.github.com',
      }),
    ).toBeNull()
  })

  it('refuses a lookalike host that only starts with 127', () => {
    expect(
      realGithubRefusal({ ...on, MANIFEST_GITHUB_API_URL: 'https://127.evil.example' }),
    ).not.toBeNull()
  })
})
