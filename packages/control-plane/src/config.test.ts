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
