import { describe, expect, it } from 'vitest'
import { ConfigError, loadConfig, zoneFor } from './config.js'

const base = {
  // A fixture for loadConfig — never connected to. The database name still
  // matches the real one (manifest_control, which P1 built) so nobody copies
  // the wrong name out of a test.
  MANIFEST_DATABASE_URL: 'postgres://manifest:manifest@127.0.0.1:7103/manifest_control',
  MANIFEST_SESSION_SECRET: 'x'.repeat(32),
  MANIFEST_BLUEPRINTS_ROOT: '/tmp/blueprints',
  MANIFEST_REPOS_ROOT: '/tmp/repos',
}

describe('configuration', () => {
  // The listener split is TWO settings rather than a derivation from the
  // environment kind, so UBC infrastructure can bind staging to an internal-only
  // listener by configuration. Locally Caddy names both listeners `srv0` (§21,
  // divergence 2) — modelled, not enforced here, and this test says which.
  it('defaults the edge admin URL and names both listeners srv0 locally', () => {
    const config = loadConfig({ ...base })
    expect(config.caddyAdminUrl).toBe('http://127.0.0.1:7119')
    expect(config.caddyServers).toEqual({ internal: 'srv0', public: 'srv0' })
  })

  it('lets an operator split the two listeners without a code change', () => {
    const config = loadConfig({
      ...base,
      MANIFEST_CADDY_SERVER_INTERNAL: 'ubc-only',
      MANIFEST_CADDY_SERVER_PUBLIC: 'world',
    })
    expect(config.caddyServers).toEqual({ internal: 'ubc-only', public: 'world' })
  })

  it('parses a development environment and defaults the port to 7100', () => {
    const config = loadConfig({
      ...base,
      MANIFEST_ENV: 'development',
      MANIFEST_DEV_AUTH: '1',
    })
    expect(config.env).toBe('development')
    expect(config.devAuth).toBe(true)
    expect(config.port).toBe(7100)
  })

  // §13's gate integrity rests on this secret, and it is optional in the schema so
  // that existing callers keep working — which means the ONLY thing stopping a
  // production control plane from running with a per-process random secret is this
  // guard. Same shape as the dev-auth safeguard below, and tested for the same
  // reason: P2 shipped a guard that was one line from being an auth bypass.
  it('refuses to start outside development without a build credential secret', () => {
    expect(() => loadConfig({ ...base, MANIFEST_ENV: 'production' })).toThrow(ConfigError)
    try {
      loadConfig({ ...base, MANIFEST_ENV: 'production' })
    } catch (error) {
      expect((error as ConfigError).code).toBe('CONFIG_BUILD_CREDENTIAL_SECRET_REQUIRED')
    }
    // Supplied, it starts.
    expect(
      loadConfig({
        ...base,
        MANIFEST_ENV: 'production',
        MANIFEST_BUILD_CREDENTIAL_SECRET: 'b'.repeat(32),
      }).buildCredentialSecret,
    ).toBe('b'.repeat(32))
  })

  // In development it is generated rather than defaulted: a literal default in the
  // source tree is a published secret.
  it('generates a per-process secret in development instead of defaulting to a literal', () => {
    const a = loadConfig({ ...base, MANIFEST_ENV: 'development' }).buildCredentialSecret
    const b = loadConfig({ ...base, MANIFEST_ENV: 'development' }).buildCredentialSecret
    expect(a).toHaveLength(64)
    expect(a).not.toBe(b)
  })

  it('refuses to start with dev auth enabled in production', () => {
    expect(() =>
      loadConfig({ ...base, MANIFEST_ENV: 'production', MANIFEST_DEV_AUTH: '1' }),
    ).toThrow(ConfigError)
    try {
      loadConfig({ ...base, MANIFEST_ENV: 'production', MANIFEST_DEV_AUTH: '1' })
    } catch (error) {
      expect((error as ConfigError).code).toBe('CONFIG_DEV_AUTH_OUTSIDE_DEVELOPMENT')
    }
  })

  it('refuses to start with dev auth enabled in staging', () => {
    expect(() =>
      loadConfig({ ...base, MANIFEST_ENV: 'staging', MANIFEST_DEV_AUTH: '1' }),
    ).toThrow(ConfigError)
  })

  it('starts in production when dev auth is off', () => {
    const config = loadConfig({
      ...base,
      MANIFEST_ENV: 'production',
      MANIFEST_DEV_AUTH: '0',
      // Required outside development from P3 Task 9 onwards: it signs the
      // credential the registry token realm verifies (§13).
      MANIFEST_BUILD_CREDENTIAL_SECRET: 'b'.repeat(32),
    })
    expect(config.devAuth).toBe(false)
  })

  it('refuses a session secret shorter than 32 characters', () => {
    expect(() =>
      loadConfig({
        ...base,
        MANIFEST_SESSION_SECRET: 'too-short',
        MANIFEST_ENV: 'development',
      }),
    ).toThrow(ConfigError)
  })

  it('derives §23 zones per environment kind, one setting each', () => {
    const config = loadConfig({ ...base, MANIFEST_ENV: 'development' })
    expect(zoneFor(config, 'sandbox')).toBe('sandbox.manifest.internal')
    expect(zoneFor(config, 'staging')).toBe('staging.manifest.internal')
    expect(zoneFor(config, 'production')).toBe('manifest.internal')
  })
})
