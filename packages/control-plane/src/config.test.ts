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
  // listener by configuration.
  //
  // THE DEFAULTS DIVERGED IN P6a (R3). Both were `srv0` until then — §21's honest
  // divergence 2, the split modelled and never enforced — and the edge now runs two
  // servers in one container: `srv0` on :443 (internal) and `srv1` on :8443 (public).
  // This test is what says the two names differ by default; if it is ever made to read
  // the same name twice again, `routing/listener-split.docker.test.ts` is what goes red.
  it('defaults the edge admin URL and names the two listeners srv0 and srv1', () => {
    const config = loadConfig({ ...base })
    expect(config.caddyAdminUrl).toBe('http://127.0.0.1:7119')
    expect(config.caddyServers).toEqual({ internal: 'srv0', public: 'srv1' })
  })

  /**
   * P6a Decision 15. The split is by ADDRESS from the host — 127.0.0.2 and
   * 127.0.0.3, so a faculty-facing URL carries no port — and by PORT from a
   * container, where both servers sit at the edge's one address and only the port
   * tells them apart. A production app's readiness probe runs from a container, so
   * it is the one caller.
   *
   * The default is asserted here and `make verify` holds it equal to the
   * container-side half of `infra/compose.yaml`'s `127.0.0.3:443:8443`, which is the
   * other file that states this number. The override case is not decoration either:
   * it is a `z.coerce.number()`, so it reads a STRING out of the environment, and
   * without a test the coercion is a thing nobody has ever run.
   */
  it('defaults the public listener port to 8443 and coerces an operator override', () => {
    expect(loadConfig({ ...base }).edgePublicPort).toBe(8443)
    expect(
      loadConfig({ ...base, MANIFEST_EDGE_PUBLIC_PORT: '9443' }).edgePublicPort,
    ).toBe(9443)
    expect(() => loadConfig({ ...base, MANIFEST_EDGE_PUBLIC_PORT: 'https' })).toThrow(
      ConfigError,
    )
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
    // built from. The console's origin by default, through the edge, since P5a
    // Task 3 (§21: the console and the API share one origin).
    expect(config.sp.origin).toBe('https://console.manifest.internal')
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
      // Task 12b: the capable model's fallback defaults to the on-premise model (Spec action 8).
      capableFallback: 'default-chat-onprem',
      // The U1 plan's Task 4: the capable model's level is medium unless MANIFEST_CAPABLE_MODEL_CLASSIFICATION says.
      capableClassification: 'medium',
      // The UBC AI Gateway plan's Task 3: no gateway model unless MANIFEST_GATEWAY_MODELS names one.
      gatewayModels: [],
    })
    expect(config.litellm.masterKey).toBeUndefined()
  })

  it('keeps the host URL and the in-network URL independent', () => {
    const config = loadConfig({ ...base, MANIFEST_LITELLM_URL: 'http://10.0.0.9:4000' })
    expect(config.litellm.url).toBe('http://10.0.0.9:4000')
    expect(config.litellm.internalUrl).toBe('http://manifest-litellm:4000/v1')
  })

  // The front-end enablement plan's Task 9 (Decision 22, Rich 2026-09-27) and FE-1 (Spec action 5):
  // the numbers an agent session and an intake session are bounded by, each a platform setting.
  it('defaults the agent budget and the intake bounds to the numbers Rich decided', () => {
    const config = loadConfig({ ...base, MANIFEST_ENV: 'development' })
    expect(config.agent).toEqual({
      monthlyUsd: 10,
      sessionCapUsd: 2,
      llmUrl: 'http://127.0.0.1:7106/v1',
      // Spec action 10 (Task 14a): a confidential project's building agent may call the capable model.
      builderModels: 'capable',
    })
    expect(config.intake).toEqual({
      model: 'default-chat',
      keyCapUsd: 0.25,
      keyMinutes: 30,
      dailyKeys: 10,
      monthlyUsd: 50,
    })
  })

  it('reads the building agent’s setting, and refuses any value but its two (Spec action 10)', () => {
    expect(
      loadConfig({ ...base, MANIFEST_AGENT_BUILDER_MODELS: 'on-premise' }).agent
        .builderModels,
    ).toBe('on-premise')
    expect(
      loadConfig({ ...base, MANIFEST_AGENT_BUILDER_MODELS: 'capable' }).agent
        .builderModels,
    ).toBe('capable')
    for (const value of ['onprem', 'CAPABLE', 'default-chat-large', '']) {
      expect(
        () => loadConfig({ ...base, MANIFEST_AGENT_BUILDER_MODELS: value }),
        value,
      ).toThrow(ConfigError)
    }
  })

  it('reads the administrators’ PUIDs — none when it is unset or blank — and refuses an empty entry (FE-39, Decision 28)', () => {
    // Unset or blank is "no list": `scripts/admin-grant.sh` stays the procedure.
    expect(loadConfig(base).adminPuids).toEqual([])
    expect(loadConfig({ ...base, MANIFEST_ADMIN_PUIDS: '' }).adminPuids).toEqual([])
    expect(loadConfig({ ...base, MANIFEST_ADMIN_PUIDS: '   ' }).adminPuids).toEqual([])
    expect(
      loadConfig({ ...base, MANIFEST_ADMIN_PUIDS: ' opr000001 , ins000001' }).adminPuids,
    ).toEqual(['opr000001', 'ins000001'])
    // When it is set it is AUTHORITATIVE — every sign-in reconciles the role to it — so a
    // stray comma must not read as a list that names nobody, or somebody who is not there.
    for (const value of ['opr000001,', ',opr000001', 'opr000001,,ins000001']) {
      expect(() => loadConfig({ ...base, MANIFEST_ADMIN_PUIDS: value }), value).toThrow(
        ConfigError,
      )
    }
  })

  it('reads the platform’s launch contacts as Name <email> — none when unset — and refuses one it cannot read (Task 10, Decision 15)', () => {
    // Unset or blank: the package names the oldest administrator, read when it is drafted.
    expect(loadConfig(base).launchContacts).toBeNull()
    expect(
      loadConfig({ ...base, MANIFEST_LAUNCH_CONTACTS: '  ' }).launchContacts,
    ).toBeNull()
    expect(
      loadConfig({
        ...base,
        MANIFEST_LAUNCH_CONTACTS:
          ' IAM Desk <iam.desk@example.ubc.ca> , Rich T <rich@example.ubc.ca>',
      }).launchContacts,
    ).toEqual([
      { name: 'IAM Desk', email: 'iam.desk@example.ubc.ca' },
      { name: 'Rich T', email: 'rich@example.ubc.ca' },
    ])
    // A contact UBC IAM is sent must be a name AND an address: a typo must not boot as a package
    // that names nobody, or an address with no person.
    for (const value of [
      'iam.desk@example.ubc.ca',
      'IAM Desk',
      'IAM Desk <not-an-address>',
      '<iam.desk@example.ubc.ca>',
      'IAM Desk <iam.desk@example.ubc.ca>,',
    ]) {
      expect(
        () => loadConfig({ ...base, MANIFEST_LAUNCH_CONTACTS: value }),
        value,
      ).toThrow(ConfigError)
    }
  })

  it('coerces the agent and intake numbers, and refuses one that is not positive', () => {
    const config = loadConfig({
      ...base,
      MANIFEST_AGENT_MONTHLY_USD: '25',
      MANIFEST_INTAKE_DAILY_KEYS: '3',
    })
    expect(config.agent.monthlyUsd).toBe(25)
    expect(config.intake.dailyKeys).toBe(3)
    for (const name of [
      'MANIFEST_AGENT_MONTHLY_USD',
      'MANIFEST_AGENT_SESSION_CAP_USD',
      'MANIFEST_INTAKE_KEY_CAP_USD',
      'MANIFEST_INTAKE_KEY_MINUTES',
      'MANIFEST_INTAKE_DAILY_KEYS',
      'MANIFEST_INTAKE_MONTHLY_USD',
    ]) {
      expect(() => loadConfig({ ...base, [name]: '0' }), name).toThrow(ConfigError)
    }
    // A key's life is whole minutes: LiteLLM's `duration` is written in seconds from it.
    expect(() => loadConfig({ ...base, MANIFEST_INTAKE_KEY_MINUTES: '1.5' })).toThrow(
      ConfigError,
    )
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
    // RUNBOOK's export block builds it as "${LITELLM_MASTER_KEY}", which an .env
    // without that line expands to ''. That must not stop a development boot that
    // never calls LiteLLM.
    const config = loadConfig({
      ...base,
      MANIFEST_ENV: 'development',
      MANIFEST_LITELLM_MASTER_KEY: '',
    })
    expect(config.litellm.masterKey).toBeUndefined()
  })

  // THE CAPABLE MODEL (the front-end enablement plan's Task 12a): unset by default, so a machine with
  // no provider key registers nothing — and an EMPTY value is unset, because RUNBOOK's export block
  // and a commented `.env` line both reach this process as ''.
  it('reads the capable model from its setting, and treats empty as unset', () => {
    expect(loadConfig({ ...base }).litellm.capableModel).toBeUndefined()
    expect(
      loadConfig({ ...base, MANIFEST_CAPABLE_MODEL: '' }).litellm.capableModel,
    ).toBeUndefined()
    expect(
      loadConfig({ ...base, MANIFEST_CAPABLE_MODEL: 'openai/gpt-6-luna' }).litellm
        .capableModel,
    ).toBe('openai/gpt-6-luna')
  })

  // THE CAPABLE MODEL'S FALLBACK (the front-end enablement plan's Task 12b, Spec action 8): a CATALOGUE name,
  // the on-premise model by default — and EMPTY is NONE, not the default, because an operator who writes
  // the line empty has said so; a commented or absent line is the default.
  it('reads the fallback from its setting: default-chat-onprem by default, and empty is none', () => {
    expect(loadConfig({ ...base }).litellm.capableFallback).toBe('default-chat-onprem')
    expect(
      loadConfig({ ...base, MANIFEST_CAPABLE_MODEL_FALLBACK: '' }).litellm
        .capableFallback,
    ).toBeUndefined()
    expect(
      loadConfig({ ...base, MANIFEST_CAPABLE_MODEL_FALLBACK: 'default-chat' }).litellm
        .capableFallback,
    ).toBe('default-chat')
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

  /**
   * THE FACULTY FRONT-END'S ORIGIN (§21 as Spec action 2 amended it; the front-end enablement
   * plan's Task 8, Decision 16). A list, the console's FIRST — every reader of `sp.origin` keeps
   * reading the first — and a request is judged against the one it ARRIVED on (`api/origins.ts`).
   */
  describe('the origins a person signs in on (Task 8)', () => {
    it('names the console’s origin first and the front-end’s second, by default', () => {
      const config = loadConfig({ ...base })
      expect(config.origins).toEqual([
        'https://console.manifest.internal',
        'https://app.manifest.internal',
      ])
      expect(config.sp.origin).toBe(config.origins[0])
    })

    it('takes the front-end’s origin from its own setting, and drops it when that is empty', () => {
      expect(
        loadConfig({ ...base, MANIFEST_FRONTEND_ORIGIN: 'https://app.manifest.ubc.ca' })
          .origins,
      ).toEqual(['https://console.manifest.internal', 'https://app.manifest.ubc.ca'])
      expect(loadConfig({ ...base, MANIFEST_FRONTEND_ORIGIN: '' }).origins).toEqual([
        'https://console.manifest.internal',
      ])
    })

    it('refuses two origins on one host, naming both — a request could not say which it arrived on', () => {
      const load = () =>
        loadConfig({
          ...base,
          MANIFEST_CONTROL_PLANE_ORIGIN: 'https://console.manifest.internal',
          MANIFEST_FRONTEND_ORIGIN: 'http://CONSOLE.manifest.internal',
        })
      expect(load).toThrow(ConfigError)
      try {
        load()
      } catch (error) {
        expect((error as ConfigError).code).toBe('CONFIG_ORIGINS_SHARE_A_HOST')
        expect((error as Error).message).toContain('https://console.manifest.internal')
        expect((error as Error).message).toContain('http://CONSOLE.manifest.internal')
      }
    })

    it('accepts two loopback hosts on the port it listens on — the Docker tier’s two origins', () => {
      const config = loadConfig({
        ...base,
        MANIFEST_PORT: '7188',
        MANIFEST_CONTROL_PLANE_ORIGIN: 'http://127.0.0.1:7188',
        MANIFEST_FRONTEND_ORIGIN: 'http://localhost:7188',
      })
      expect(config.origins).toEqual(['http://127.0.0.1:7188', 'http://localhost:7188'])
    })

    it('refuses a loopback front-end origin whose port is not the one it listens on', () => {
      const load = () =>
        loadConfig({
          ...base,
          MANIFEST_PORT: '7188',
          MANIFEST_CONTROL_PLANE_ORIGIN: 'http://127.0.0.1:7188',
          MANIFEST_FRONTEND_ORIGIN: 'http://localhost:7189',
        })
      expect(load).toThrow(ConfigError)
      try {
        load()
      } catch (error) {
        expect((error as ConfigError).code).toBe('CONFIG_FRONTEND_ORIGIN_PORT_MISMATCH')
      }
    })
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

  // P4c Task 6. §11's drain bound, one platform setting rather than a field in
  // `manifest.yaml` (Rich, 2026-09-15): a per-app bound is a §7 schema change, and
  // 120 s is how long a retire waits for the old instance's last requests.
  it('bounds a drain at two minutes by default, and lets an operator change it', () => {
    expect(loadConfig({ ...base }).drainTimeoutMs).toBe(120_000)
    expect(
      loadConfig({ ...base, MANIFEST_DRAIN_TIMEOUT_MS: '5000' }).drainTimeoutMs,
    ).toBe(5000)
  })

  // A1 Task 6: how often the set watcher reads production's members. 15 s by default; below 5 s it would
  // read every member's status faster than a health check can change it.
  it('watches production’s sets every 15 s by default, an operator may change it, and below 5 s it is CONFIG_INVALID', () => {
    expect(loadConfig({ ...base }).setWatchSeconds).toBe(15)
    expect(
      loadConfig({ ...base, MANIFEST_SET_WATCH_SECONDS: '30' }).setWatchSeconds,
    ).toBe(30)
    for (const value of ['4', '0', '-1', '7.5', 'soon'])
      expect(() => loadConfig({ ...base, MANIFEST_SET_WATCH_SECONDS: value })).toThrow(
        expect.objectContaining({ code: 'CONFIG_INVALID' }),
      )
  })

  it('derives §23 zones per environment kind, one setting each', () => {
    const config = loadConfig({ ...base, MANIFEST_ENV: 'development' })
    expect(zoneFor(config, 'sandbox')).toBe('sandbox.manifest.internal')
    expect(zoneFor(config, 'staging')).toBe('staging.manifest.internal')
    expect(zoneFor(config, 'production')).toBe('manifest.internal')
  })
})

/**
 * The D5 plan's Task 3: the source driver and driver 2's GitHub settings. ONE driver per
 * control-plane process (Decision 3), defaulted to driver 1, and GitHub's settings default
 * to the FAKE, so switching a laptop to driver 2 is one variable.
 */
describe('the source driver and its GitHub settings (D5, the D5 plan’s Task 3)', () => {
  const codeOf = (fn: () => unknown) => {
    try {
      fn()
      return 'accepted'
    } catch (e) {
      return e instanceof ConfigError ? e.code : `not a ConfigError: ${String(e)}`
    }
  }

  it('runs driver 1 unless told otherwise', () => {
    expect(loadConfig({ ...base }).sourceDriver).toBe('local')
  })

  it('points driver 2 at the fake by default — seven settings, the two key paths repo-rooted', () => {
    const config = loadConfig({ ...base, MANIFEST_SOURCE_DRIVER: 'github' })
    expect(config.sourceDriver).toBe('github')
    expect(config.github).toEqual({
      apiUrl: 'http://127.0.0.1:7110/api/v3',
      gitUrl: 'http://127.0.0.1:7110',
      org: 'manifest-apps',
      appId: '1000001',
      installationId: '2000001',
      appKeyPath: expect.stringMatching(/^\/.+\/infra\/secrets\/github-fake-app\.pem$/),
      webhookSecretPath: expect.stringMatching(
        /^\/.+\/infra\/secrets\/github-fake-webhook\.secret$/,
      ),
    })
  })

  /**
   * `config.github` is built whatever the driver (Task 9's webhook route reads the secret's
   * path) and is only READ by driver 2, so a driver-1 control plane boots on a machine that
   * has never minted the fake's files. `loadConfig` reads no file; this holds it to that.
   */
  it('builds the GitHub settings on driver 1 without needing any GitHub file to exist', () => {
    const config = loadConfig({
      ...base,
      MANIFEST_GITHUB_APP_KEY: '/nonexistent/github-app.pem',
      MANIFEST_GITHUB_WEBHOOK_SECRET: '/nonexistent/webhook.secret',
    })
    expect(config.sourceDriver).toBe('local')
    expect(config.github.appKeyPath).toBe('/nonexistent/github-app.pem')
    expect(config.github.webhookSecretPath).toBe('/nonexistent/webhook.secret')
  })

  // An installation token over plaintext is a token on the network (Decision 4).
  it('refuses http beyond loopback for either GitHub URL, and accepts https and loopback', () => {
    for (const name of ['MANIFEST_GITHUB_API_URL', 'MANIFEST_GITHUB_GIT_URL']) {
      expect(
        codeOf(() => loadConfig({ ...base, [name]: 'http://github.example.org' })),
      ).toBe('CONFIG_GITHUB_INSECURE_URL')
      expect(codeOf(() => loadConfig({ ...base, [name]: 'http://10.0.0.5:7110' }))).toBe(
        'CONFIG_GITHUB_INSECURE_URL',
      )
    }
    // The positive controls, in the same test: GitHub itself, and the fake on loopback.
    const real = loadConfig({
      ...base,
      MANIFEST_GITHUB_API_URL: 'https://api.github.com',
      MANIFEST_GITHUB_GIT_URL: 'https://github.com',
    })
    expect(real.github.apiUrl).toBe('https://api.github.com')
    expect(real.github.gitUrl).toBe('https://github.com')
    expect(
      codeOf(() =>
        loadConfig({ ...base, MANIFEST_GITHUB_GIT_URL: 'http://localhost:7110' }),
      ),
    ).toBe('accepted')
  })

  it('refuses the FAKE’s GitHub — loopback — outside development on driver 2 (the authoring API plan’s Task 12)', () => {
    const staging = {
      ...base,
      MANIFEST_ENV: 'staging',
      MANIFEST_BUILD_CREDENTIAL_SECRET: 'b'.repeat(32),
      MANIFEST_MASTER_SECRET: 'm'.repeat(32),
      MANIFEST_LITELLM_MASTER_KEY: 'sk-litellm',
      MANIFEST_SOURCE_DRIVER: 'github',
    }
    const REAL = {
      MANIFEST_GITHUB_API_URL: 'https://api.github.com',
      MANIFEST_GITHUB_GIT_URL: 'https://github.com',
    }
    // Every default is the fake's: refused, naming it.
    expect(codeOf(() => loadConfig(staging))).toBe(
      'CONFIG_GITHUB_FAKE_OUTSIDE_DEVELOPMENT',
    )
    // Either URL on loopback, on any port and either spelling, is the fake.
    for (const [name, value] of [
      ['MANIFEST_GITHUB_API_URL', 'http://127.0.0.1:7110/api/v3'],
      ['MANIFEST_GITHUB_GIT_URL', 'http://localhost:7999'],
    ] as const) {
      expect(codeOf(() => loadConfig({ ...staging, ...REAL, [name]: value }))).toBe(
        'CONFIG_GITHUB_FAKE_OUTSIDE_DEVELOPMENT',
      )
    }
    // The positive controls: GitHub itself outside development; the fake IN development; and
    // driver 1 outside development, which never reads either URL.
    expect(codeOf(() => loadConfig({ ...staging, ...REAL }))).toBe('accepted')
    expect(codeOf(() => loadConfig({ ...base, MANIFEST_SOURCE_DRIVER: 'github' }))).toBe(
      'accepted',
    )
    expect(
      codeOf(() => loadConfig({ ...staging, MANIFEST_SOURCE_DRIVER: 'local' })),
    ).toBe('accepted')
  })

  it('refuses a driver it does not have, and a GitHub URL that is not a URL', () => {
    expect(codeOf(() => loadConfig({ ...base, MANIFEST_SOURCE_DRIVER: 'gitlab' }))).toBe(
      'CONFIG_INVALID',
    )
    expect(
      codeOf(() => loadConfig({ ...base, MANIFEST_GITHUB_API_URL: 'not a url' })),
    ).toBe('CONFIG_INVALID')
  })
})

describe('UBC’s AI Gateway (the UBC AI Gateway plan’s Task 2)', () => {
  const codeOf = (fn: () => unknown) => {
    try {
      fn()
      return 'accepted'
    } catch (e) {
      return e instanceof ConfigError ? e.code : `not a ConfigError: ${String(e)}`
    }
  }
  const DEFAULT = 'https://ai-gateway.apps.ltic.ubc.ca/v1'

  it('reaches the gateway at its own address by default — and an EMPTY setting is unset, so the default too', () => {
    expect(loadConfig({ ...base }).ubcAiGateway.url).toBe(DEFAULT)
    expect(
      loadConfig({ ...base, MANIFEST_UBC_AI_GATEWAY_URL: '' }).ubcAiGateway.url,
    ).toBe(DEFAULT)
    expect(
      loadConfig({ ...base, MANIFEST_UBC_AI_GATEWAY_URL: 'https://gw.example/v1' })
        .ubcAiGateway.url,
    ).toBe('https://gw.example/v1')
  })

  const insecure = (url: string) => {
    try {
      loadConfig({ ...base, MANIFEST_UBC_AI_GATEWAY_URL: url })
      return 'accepted'
    } catch (e) {
      return e instanceof ConfigError ? `${e.code}: ${e.message}` : String(e)
    }
  }

  // The bearer key would otherwise cross the network in clear (I10). CONFIG_INVALID, an already-published code
  // (sitting 2's ruling: a code of its own would change the published ErrorCode registry) — so the MESSAGE is
  // what tells this refusal from a malformed URL, and the test asserts it.
  it('refuses plain http off loopback, and accepts it on loopback — the positive control', () => {
    for (const url of ['http://gw.example/v1', 'http://10.0.0.5:4000/v1']) {
      expect(insecure(url)).toMatch(
        /^CONFIG_INVALID: .*MANIFEST_UBC_AI_GATEWAY_URL is '.*': the gateway's key may cross only loopback in plaintext; use https$/,
      )
    }
    for (const url of [
      'http://127.0.0.1:9/v1',
      'http://localhost:9/v1',
      'http://[::1]:9/v1',
    ]) {
      expect(
        loadConfig({ ...base, MANIFEST_UBC_AI_GATEWAY_URL: url }).ubcAiGateway.url,
      ).toBe(url)
    }
    expect(
      codeOf(() => loadConfig({ ...base, MANIFEST_UBC_AI_GATEWAY_URL: 'not a url' })),
    ).toBe('CONFIG_INVALID')
  })

  it('knows whether .env carried the key — set is true, absent or empty is false', () => {
    expect(loadConfig({ ...base }).ubcAiGateway.keyInEnv).toBe(false)
    expect(
      loadConfig({ ...base, UBC_AI_GATEWAY_API_KEY: '' }).ubcAiGateway.keyInEnv,
    ).toBe(false)
    expect(
      loadConfig({ ...base, UBC_AI_GATEWAY_API_KEY: 'sk-canary-config-test' })
        .ubcAiGateway.keyInEnv,
    ).toBe(true)
  })

  it('never keeps the key’s value — the config says only whether it was set', () => {
    const value = 'sk-canary-config-never-kept'
    const config = loadConfig({ ...base, UBC_AI_GATEWAY_API_KEY: value })
    expect(JSON.stringify(config)).not.toContain(value)
    expect(config.ubcAiGateway).toEqual({ url: DEFAULT, keyInEnv: true })
  })
})

describe('UBC’s AI Gateway’s own models, from one setting (the UBC AI Gateway plan’s Task 3)', () => {
  /** The refusal's code and message — CONFIG_INVALID, an already-published code (sitting 2's ruling), so the
   *  MESSAGE says which setting and which entry, and the test reads it. */
  const refusal = (value: string) => {
    try {
      loadConfig({ ...base, MANIFEST_GATEWAY_MODELS: value })
      return 'accepted'
    } catch (e) {
      return e instanceof ConfigError ? `${e.code}: ${e.message}` : String(e)
    }
  }

  it('parses each entry to a name, a gateway setting and its classification — as its LEVEL (U1 plan Task 4)', () => {
    expect(
      loadConfig({
        ...base,
        MANIFEST_GATEWAY_MODELS:
          'ubc-onprem=ubc-ai-gateway/qwen-x@confidential, ubc-mini=ubc-ai-gateway/gpt-6-mini@internal',
      }).litellm.gatewayModels,
    ).toEqual([
      {
        name: 'ubc-onprem',
        setting: 'ubc-ai-gateway/qwen-x',
        classification: 'very-high',
      },
      {
        name: 'ubc-mini',
        setting: 'ubc-ai-gateway/gpt-6-mini',
        classification: 'medium',
      },
    ])
  })

  it('reads none when unset or empty — and skips empty entries', () => {
    expect(loadConfig({ ...base }).litellm.gatewayModels).toEqual([])
    expect(
      loadConfig({ ...base, MANIFEST_GATEWAY_MODELS: '' }).litellm.gatewayModels,
    ).toEqual([])
    expect(
      loadConfig({
        ...base,
        MANIFEST_GATEWAY_MODELS: ' , ubc-a=ubc-ai-gateway/a@public ,',
      }).litellm.gatewayModels,
    ).toEqual([{ name: 'ubc-a', setting: 'ubc-ai-gateway/a', classification: 'low' }])
  })

  it('splits on the LAST @, so a model id may hold one (M5 — Vertex-style ids carry one)', () => {
    expect(
      loadConfig({
        ...base,
        MANIFEST_GATEWAY_MODELS: 'ubc-vertex=ubc-ai-gateway/claude-x@20250101@internal',
      }).litellm.gatewayModels,
    ).toEqual([
      {
        name: 'ubc-vertex',
        setting: 'ubc-ai-gateway/claude-x@20250101',
        classification: 'medium',
      },
    ])
  })

  it('refuses every malformed entry, naming it — never a default classification (Review Focus 3)', () => {
    for (const entry of [
      'ubc-x=ubc-ai-gateway/m',
      'ubc-x=ubc-ai-gateway/m@restricted',
      'ubc-x=openai/x@internal',
      'default-chat-large=ubc-ai-gateway/m@internal',
      'Bad_Name=ubc-ai-gateway/m@internal',
      'x=ubc-ai-gateway/m@',
      'x=ubc-ai-gateway/@internal',
    ]) {
      const said = refusal(entry)
      expect(said, entry).toMatch(/^CONFIG_INVALID: .*MANIFEST_GATEWAY_MODELS/)
      expect(said, entry).toContain(`'${entry}'`)
    }
    const twice = refusal('a=ubc-ai-gateway/m@internal,a=ubc-ai-gateway/n@public')
    expect(twice).toMatch(/^CONFIG_INVALID: .*MANIFEST_GATEWAY_MODELS.*'a'.*twice/)
  })
})

describe('MANIFEST_CAPABLE_MODEL_CLASSIFICATION (S3; U1 plan Task 4)', () => {
  it('is medium when absent or empty, and takes any of the seven names as its level', () => {
    expect(loadConfig({ ...base }).litellm.capableClassification).toBe('medium')
    expect(
      loadConfig({ ...base, MANIFEST_CAPABLE_MODEL_CLASSIFICATION: '' }).litellm
        .capableClassification,
    ).toBe('medium')
    expect(
      loadConfig({ ...base, MANIFEST_CAPABLE_MODEL_CLASSIFICATION: 'high' }).litellm
        .capableClassification,
    ).toBe('high')
    expect(
      loadConfig({ ...base, MANIFEST_CAPABLE_MODEL_CLASSIFICATION: 'confidential' })
        .litellm.capableClassification,
    ).toBe('very-high')
  })

  it('refuses anything else by CONFIG_INVALID, naming the setting — never defaulted', () => {
    for (const value of ['High', 'restricted', 'zdr']) {
      expect(
        () => loadConfig({ ...base, MANIFEST_CAPABLE_MODEL_CLASSIFICATION: value }),
        value,
      ).toThrow(
        expect.objectContaining({
          code: 'CONFIG_INVALID',
          message: expect.stringContaining('MANIFEST_CAPABLE_MODEL_CLASSIFICATION'),
        }),
      )
    }
  })
})

describe('MANIFEST_GATEWAY_MODELS in U1’s names (U1 plan Task 4)', () => {
  it('takes each of the seven names after the last @, as its level', () => {
    expect(
      loadConfig({
        ...base,
        MANIFEST_GATEWAY_MODELS:
          'gw-a=ubc-ai-gateway/gpt-x@high, gw-b=ubc-ai-gateway/q@confidential, gw-c=ubc-ai-gateway/v@2025@very-high',
      }).litellm.gatewayModels.map((e) => [e.name, e.setting, e.classification]),
    ).toEqual([
      ['gw-a', 'ubc-ai-gateway/gpt-x', 'high'],
      ['gw-b', 'ubc-ai-gateway/q', 'very-high'],
      ['gw-c', 'ubc-ai-gateway/v@2025', 'very-high'],
    ])
  })

  it('still refuses an entry with no level, or a name that is none', () => {
    for (const entry of [
      'gw=ubc-ai-gateway/x',
      'gw=ubc-ai-gateway/x@restricted',
      'gw=ubc-ai-gateway/x@High',
    ]) {
      expect(
        () => loadConfig({ ...base, MANIFEST_GATEWAY_MODELS: entry }),
        entry,
      ).toThrow(expect.objectContaining({ code: 'CONFIG_INVALID' }))
    }
  })
})

/**
 * THE PLATFORM'S OUTBOUND EMAIL (the FE-46/47/5 plan's Decision 13): the laptop's defaults are
 * Mailpit's and need nothing set; UBC's relay is a URL with credentials, so a refusal NEVER repeats it.
 */
describe('the mail settings', () => {
  it('defaults to the laptop’s Mailpit, the team’s address and Manifest as the sender', () => {
    expect(loadConfig({ ...base }).mail).toEqual({
      smtp: {
        host: '127.0.0.1',
        port: 7111,
        secure: false,
        requireTLS: false,
        auth: null,
      },
      team: 'team@manifest.internal',
      from: 'Manifest <manifest@manifest.internal>',
    })
  })

  it('reads a relay over TLS with credentials, decoded, and STARTTLS required', () => {
    const config = loadConfig({
      ...base,
      MANIFEST_SMTP_URL: 'smtps://relay%2Buser:p%40ss@smtp.ubc.ca:465',
      MANIFEST_SMTP_REQUIRE_TLS: '1',
      MANIFEST_TEAM_EMAIL: 'ltic.manifest@ubc.ca',
      MANIFEST_MAIL_FROM: 'Manifest at UBC <manifest@ubc.ca>',
    })
    expect(config.mail).toEqual({
      smtp: {
        host: 'smtp.ubc.ca',
        port: 465,
        secure: true,
        requireTLS: true,
        auth: { user: 'relay+user', pass: 'p@ss' },
      },
      team: 'ltic.manifest@ubc.ca',
      from: 'Manifest at UBC <manifest@ubc.ca>',
    })
  })

  it.each([
    ['not a URL', 'mail.example.org'],
    ['another scheme', 'http://user:hunter2@smtp.ubc.ca:587'],
    ['no port', 'smtp://user:hunter2@smtp.ubc.ca'],
    ['a path', 'smtp://user:hunter2@smtp.ubc.ca:587/relay'],
  ])(
    'refuses MANIFEST_SMTP_URL with %s — CONFIG_INVALID, and never repeats it',
    (_why, url) => {
      let refused: unknown
      try {
        loadConfig({ ...base, MANIFEST_SMTP_URL: url })
      } catch (error) {
        refused = error
      }
      expect(refused).toBeInstanceOf(ConfigError)
      expect((refused as ConfigError).code).toBe('CONFIG_INVALID')
      expect((refused as Error).message).toContain('MANIFEST_SMTP_URL')
      expect((refused as Error).message).not.toContain('hunter2')
      expect((refused as Error).message).not.toContain(url)
    },
  )

  it('refuses a REQUIRE_TLS that is not 0 or 1, a team address that is not one address, and a sender that is not one', () => {
    expect(() => loadConfig({ ...base, MANIFEST_SMTP_REQUIRE_TLS: 'yes' })).toThrow(
      ConfigError,
    )
    for (const team of ['team', 'a@ubc.ca, b@ubc.ca', 'Team <team@ubc.ca>'])
      expect(() => loadConfig({ ...base, MANIFEST_TEAM_EMAIL: team })).toThrow(
        /MANIFEST_TEAM_EMAIL/,
      )
    for (const from of ['manifest', 'Manifest <manifest>', 'A <a@ubc.ca>, B <b@ubc.ca>'])
      expect(() => loadConfig({ ...base, MANIFEST_MAIL_FROM: from })).toThrow(
        /MANIFEST_MAIL_FROM/,
      )
    // The positive control: a bare address is a sender too.
    expect(loadConfig({ ...base, MANIFEST_MAIL_FROM: 'manifest@ubc.ca' }).mail.from).toBe(
      'manifest@ubc.ca',
    )
  })
})
