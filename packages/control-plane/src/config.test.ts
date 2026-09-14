import { describe, expect, it } from 'vitest'
import { ConfigError, loadConfig, zoneFor } from './config.js'

const base = {
  // A fixture for loadConfig — never connected to. The database name still
  // matches the real one (manifest_control, which P1 built) so nobody copies
  // the wrong name out of a test.
  MANIFEST_DATABASE_URL: 'postgres://manifest:manifest@127.0.0.1:7103/manifest_control',
  MANIFEST_IDP_DATABASE_URL: 'postgres://manifest:manifest@127.0.0.1:7103/manifest_idp',
  MANIFEST_SESSION_SECRET: 'x'.repeat(32),
  MANIFEST_BLUEPRINTS_ROOT: '/tmp/blueprints',
  MANIFEST_REPOS_ROOT: '/tmp/repos',
}

describe('configuration', () => {
  // §12's envelope encryption reads its master keypair from a FILE, in separate
  // custody from the database it opens (§20). The path is repo-relative for the
  // same reason MANIFEST_CA_CERT is: `pnpm test` and `node dist/index.js` run
  // from different working directories and a relative path means two different
  // files.
  it('resolves the secrets master key against the repo root, not the cwd', () => {
    const config = loadConfig({ ...base })
    expect(config.secretsMasterKeyPath).toMatch(/\/infra\/secrets\/master\.key$/)
    expect(config.secretsMasterKeyPath.startsWith('/')).toBe(true)
  })

  it('lets an operator hold the master key outside the repository', () => {
    const config = loadConfig({
      ...base,
      MANIFEST_SECRETS_MASTER_KEY: '/etc/manifest/master.key',
    })
    expect(config.secretsMasterKeyPath).toBe('/etc/manifest/master.key')
  })

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
    const config = loadConfig({ ...base, MANIFEST_ENV: 'development' })
    expect(config.env).toBe('development')
    expect(config.port).toBe(7100)
    // The platform's own SP origin, which every URL the IdP posts back to is
    // built from. Loopback and 7100 by default (§21 puts the control plane on
    // the host, not behind the edge).
    expect(config.sp.origin).toBe('http://127.0.0.1:7100')
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
        MANIFEST_MASTER_SECRET: 'm'.repeat(32),
        MANIFEST_LITELLM_MASTER_KEY: 'sk-litellm',
      }).buildCredentialSecret,
    ).toBe('b'.repeat(32))
  })

  // The same shape again, for the secret every backing-service password is derived
  // from (P3 Task 6). Two independent guards on two independent settings, because
  // the failure mode of a missing one is silent: a generated master secret cannot
  // reproduce the password an existing database container already holds.
  it('refuses to start outside development without a master secret', () => {
    const env = {
      ...base,
      MANIFEST_ENV: 'production',
      MANIFEST_BUILD_CREDENTIAL_SECRET: 'b'.repeat(32),
      MANIFEST_LITELLM_MASTER_KEY: 'sk-litellm',
    }
    expect(() => loadConfig(env)).toThrow(ConfigError)
    try {
      loadConfig(env)
    } catch (error) {
      expect((error as ConfigError).code).toBe('CONFIG_MASTER_SECRET_REQUIRED')
    }
    const config = loadConfig({ ...env, MANIFEST_MASTER_SECRET: 'm'.repeat(32) })
    expect(config.masterSecret).toBe('m'.repeat(32))
    expect(config.masterSecretGenerated).toBe(false)
  })

  // P4b Task 5. What the CONTROL PLANE and what an APP call LiteLLM are two settings,
  // never one derived from the other — `registryUrl`/`registryInternalUrl` is the
  // same pair. Swapped, an app handed the loopback URL gets ECONNREFUSED from inside
  // its own network and nothing names the cause.
  it('defaults the LiteLLM settings, and leaves the master key unset in development', () => {
    const config = loadConfig({ ...base, MANIFEST_ENV: 'development' })
    expect(config.litellm).toEqual({
      url: 'http://127.0.0.1:7106',
      internalUrl: 'http://manifest-litellm:4000/v1',
      enabled: true,
    })
    expect(config.litellm.masterKey).toBeUndefined()
  })

  it('keeps the host URL and the in-network URL independent', () => {
    const config = loadConfig({ ...base, MANIFEST_LITELLM_URL: 'http://10.0.0.9:4000' })
    expect(config.litellm.url).toBe('http://10.0.0.9:4000')
    expect(config.litellm.internalUrl).toBe('http://manifest-litellm:4000/v1')
  })

  it('reads MANIFEST_AI_ENABLED as 0 or 1 and nothing else', () => {
    expect(loadConfig({ ...base, MANIFEST_AI_ENABLED: '0' }).litellm.enabled).toBe(false)
    // `false` is the typo that matters: read loosely, it is a truthy string.
    expect(() => loadConfig({ ...base, MANIFEST_AI_ENABLED: 'false' })).toThrow(
      ConfigError,
    )
  })

  // The same two reads of one setting as the build credential and the master secret.
  // The master key mints and revokes every app's key (§10), so a control plane
  // outside development without one would fail every AI deploy with an
  // authentication error that names LiteLLM rather than the missing setting.
  it('refuses to start outside development without a LiteLLM master key', () => {
    const codeOf = (env: Record<string, string>) => {
      try {
        loadConfig(env)
        return 'loaded'
      } catch (error) {
        return (error as ConfigError).code
      }
    }
    const env = {
      ...base,
      MANIFEST_ENV: 'staging',
      MANIFEST_BUILD_CREDENTIAL_SECRET: 'b'.repeat(32),
      MANIFEST_MASTER_SECRET: 'm'.repeat(32),
    }
    expect(codeOf(env)).toBe('CONFIG_LITELLM_MASTER_KEY_REQUIRED')
    // EMPTY is absent, and gets the same named refusal — not CONFIG_INVALID's
    // "String must contain at least 1 character(s)", which names no remedy.
    expect(codeOf({ ...env, MANIFEST_LITELLM_MASTER_KEY: '' })).toBe(
      'CONFIG_LITELLM_MASTER_KEY_REQUIRED',
    )
    expect(
      loadConfig({ ...env, MANIFEST_LITELLM_MASTER_KEY: 'sk-real' }).litellm.masterKey,
    ).toBe('sk-real')
  })

  it('treats an empty master key as absent in development too', () => {
    // README's export block builds it as "${LITELLM_MASTER_KEY}", which an .env
    // without that line expands to ''. That must not stop a development boot that
    // never calls LiteLLM.
    const config = loadConfig({
      ...base,
      MANIFEST_ENV: 'development',
      MANIFEST_LITELLM_MASTER_KEY: '',
    })
    expect(config.litellm.masterKey).toBeUndefined()
  })

  // Generated in development, and SAID SO — the flag is what lets the boot line
  // warn, because otherwise the only symptom is an existing Mongo refusing a
  // password this process derived differently.
  it('flags a generated master secret rather than letting it pass silently', () => {
    const config = loadConfig({ ...base, MANIFEST_ENV: 'development' })
    expect(config.masterSecretGenerated).toBe(true)
    expect(config.masterSecret).toHaveLength(64)
  })

  // `pnpm test` runs from the repo root and `pnpm --filter … dev` runs from the
  // package directory; a cwd-relative default is therefore correct under one and
  // broken under the other, which is exactly how the documented boot command was
  // failing to find its own registry issuer. Absolute, from the repo root, always.
  it('resolves the registry issuer paths against the repo root, not the cwd', () => {
    const config = loadConfig({ ...base })
    expect(config.registryTokenKeyPath).toMatch(
      /^\/.*\/infra\/registry-auth\/token\.key$/,
    )
    expect(config.registryTokenCertPath.startsWith('/')).toBe(true)
    // An absolute override is passed through untouched.
    expect(
      loadConfig({ ...base, MANIFEST_REGISTRY_TOKEN_KEY: '/etc/x.key' })
        .registryTokenKeyPath,
    ).toBe('/etc/x.key')
  })

  it('defaults the resolver and the docker socket', () => {
    const config = loadConfig({ ...base })
    expect(config.dnsServer).toBe('10.89.0.53')
    expect(config.dockerSocket.length).toBeGreaterThan(0)
  })

  // In development it is generated rather than defaulted: a literal default in the
  // source tree is a published secret.
  it('generates a per-process secret in development instead of defaulting to a literal', () => {
    const a = loadConfig({ ...base, MANIFEST_ENV: 'development' }).buildCredentialSecret
    const b = loadConfig({ ...base, MANIFEST_ENV: 'development' }).buildCredentialSecret
    expect(a).toHaveLength(64)
    expect(a).not.toBe(b)
  })

  /**
   * ROADMAP GAP 3 IS CLOSED, and this is what replaced three tests.
   *
   * `MANIFEST_DEV_AUTH` used to be here with two guards over it, because
   * `POST /auth/dev-login` minted a real session for a named test user with no
   * credential of any kind and P2 measured that it was one line from live. The
   * setting, the guards and the route are gone; Manifest logs its own users in
   * with CWL (§9). A test asserting the guard would now be asserting against a
   * setting `envSchema` does not have — which zod ignores — so the honest
   * replacement is this one: nothing anywhere still reads it.
   */
  it('has no dev-auth setting left to enable', () => {
    const config = loadConfig({
      ...base,
      MANIFEST_ENV: 'production',
      MANIFEST_DEV_AUTH: '1',
      MANIFEST_BUILD_CREDENTIAL_SECRET: 'b'.repeat(32),
      MANIFEST_MASTER_SECRET: 'm'.repeat(32),
      MANIFEST_LITELLM_MASTER_KEY: 'sk-litellm',
    })
    expect(Object.keys(config)).not.toContain('devAuth')
    expect(JSON.stringify(config)).not.toContain('DEV_AUTH')
  })

  /**
   * Two independent reads of one setting, which is the shape this project's own
   * lesson asks for. The origin is what the IdP posts a person's assertion back
   * to, so a loopback origin naming a port nothing listens on registers a
   * callback that cannot answer — and the login then completes at the IdP and
   * dies on the redirect, which reads as an IdP fault.
   */
  it('refuses a loopback SP origin whose port is not the one it listens on', () => {
    expect(() =>
      loadConfig({
        ...base,
        MANIFEST_PORT: '7100',
        MANIFEST_CONTROL_PLANE_ORIGIN: 'http://127.0.0.1:7101',
      }),
    ).toThrow(ConfigError)
    try {
      loadConfig({
        ...base,
        MANIFEST_PORT: '7100',
        MANIFEST_CONTROL_PLANE_ORIGIN: 'http://127.0.0.1:7101',
      })
    } catch (error) {
      expect((error as ConfigError).code).toBe(
        'CONFIG_CONTROL_PLANE_ORIGIN_PORT_MISMATCH',
      )
    }
  })

  it('accepts a non-loopback SP origin on any port — behind a proxy it is not ours', () => {
    const config = loadConfig({
      ...base,
      MANIFEST_PORT: '7100',
      MANIFEST_CONTROL_PLANE_ORIGIN: 'https://manifest.ubc.ca',
    })
    expect(config.sp.origin).toBe('https://manifest.ubc.ca')
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
