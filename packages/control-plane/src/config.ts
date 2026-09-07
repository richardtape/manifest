import { randomBytes } from 'node:crypto'
import { isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { resolveSocketPath } from './runtime/index.js'

/**
 * The repository root, derived from THIS FILE rather than from `process.cwd()`.
 *
 * `src/config.ts` and `dist/config.js` are both three levels below it, so one
 * expression covers the compiled and the source form.
 *
 * The registry issuer defaults are repo-relative paths, and resolving them against
 * the working directory made the DOCUMENTED way to start the control plane fail:
 * `pnpm --filter @manifest/control-plane dev` runs with the PACKAGE directory as
 * its cwd, so `infra/registry-auth/token.key` pointed at
 * `packages/control-plane/infra/...`, which does not exist. Measured 2026-09-06 —
 * the process refused to boot. Every test passed, because `pnpm test` runs from the
 * repo root. This is the third time a cwd-relative path in this repository has
 * behaved differently under the two commands.
 */
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))

/** Absolute already, or relative to the repository root — never to the cwd. */
function fromRepoRoot(path: string): string {
  return isAbsolute(path) ? path : resolve(REPO_ROOT, path)
}

export class ConfigError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ConfigError'
  }
}

const envSchema = z.object({
  MANIFEST_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  MANIFEST_DATABASE_URL: z.string().min(1),
  MANIFEST_PORT: z.coerce.number().int().min(1).max(65535).default(7100),
  // 32 chars is the HMAC-SHA256 block floor we are willing to accept for a
  // session secret; shorter is a configuration mistake, not a preference.
  MANIFEST_SESSION_SECRET: z.string().min(32),
  MANIFEST_DEV_AUTH: z.enum(['0', '1']).default('0'),
  MANIFEST_BLUEPRINTS_ROOT: z.string().min(1),
  MANIFEST_REPOS_ROOT: z.string().min(1),
  // §23: one zone setting per environment kind. Laptop defaults, verified in S7.
  MANIFEST_ZONE_SANDBOX: z.string().min(1).default('sandbox.manifest.internal'),
  MANIFEST_ZONE_STAGING: z.string().min(1).default('staging.manifest.internal'),
  MANIFEST_ZONE_PRODUCTION: z.string().min(1).default('manifest.internal'),
  // §13's gate integrity. `make seed` generates the pair into the gitignored
  // infra/registry-auth/; registry:2 validates minted tokens against the cert.
  MANIFEST_REGISTRY_TOKEN_KEY: z.string().min(1).default('infra/registry-auth/token.key'),
  MANIFEST_REGISTRY_TOKEN_CERT: z
    .string()
    .min(1)
    .default('infra/registry-auth/token.crt'),
  // Deliberately OPTIONAL, and then required outside development below. Making it
  // required here would break every existing caller of loadConfig, and giving it a
  // literal default would put a real secret in the source tree.
  MANIFEST_BUILD_CREDENTIAL_SECRET: z.string().min(32).optional(),
  // Host-facing and in-network. Two addresses for one registry: the control plane
  // and the daemon reach it on the published port, while a container on the
  // internal build network reaches it by service name (P1 dual-homes it for this).
  MANIFEST_REGISTRY_URL: z.string().min(1).default('127.0.0.1:7107'),
  MANIFEST_REGISTRY_INTERNAL_URL: z.string().min(1).default('manifest-registry:5000'),
  // The edge's admin API, published to the loopback only by P1's compose file.
  // This is how a route for a name allocated at runtime reaches Caddy (§12, S1).
  MANIFEST_CADDY_ADMIN_URL: z.string().min(1).default('http://127.0.0.1:7119'),
  // §12 meets "staging is UBC-only" by LISTENER ASSIGNMENT, not IP allowlisting:
  // a misconfigured allowlist leaks quietly, a route on the wrong listener is
  // simply unreachable. Two settings rather than a derivation, so UBC
  // infrastructure enforces the split by configuration and not by a code change.
  // On the laptop both listeners are loopback and Caddy names them both `srv0`
  // (§21, honest divergence 2), so the distinction is modelled, not enforced here.
  MANIFEST_CADDY_SERVER_INTERNAL: z.string().min(1).default('srv0'),
  MANIFEST_CADDY_SERVER_PUBLIC: z.string().min(1).default('srv0'),
  // §12 makes the resolver per-container: dnsmasq-A's address on the platform
  // network. P1 pins it at 10.89.0.53 (infra/lib/common.sh, DNS_C_IP).
  MANIFEST_DNS_SERVER: z.string().min(1).default('10.89.0.53'),
  // Every backing-service credential is derived from this by HMAC (Task 6), so it
  // is the single secret behind every app's database password. Optional here and
  // required outside development below, for the same two reasons the build
  // credential is: making it required outright breaks every existing loadConfig
  // caller, and a literal default in the source tree is a published secret.
  MANIFEST_MASTER_SECRET: z.string().min(32).optional(),
  MANIFEST_DOCKER_SOCKET: z.string().min(1).optional(),
})

export interface Config {
  env: 'development' | 'staging' | 'production'
  databaseUrl: string
  port: number
  sessionSecret: string
  devAuth: boolean
  blueprintsRoot: string
  reposRoot: string
  zones: { sandbox: string; staging: string; production: string }
  registryTokenKeyPath: string
  registryTokenCertPath: string
  /** Signs the short-lived credential the token realm verifies (§13). */
  buildCredentialSecret: string
  registryUrl: string
  registryInternalUrl: string
  caddyAdminUrl: string
  /** Listener -> Caddy server name. Both `srv0` locally (§21, divergence 2). */
  caddyServers: { internal: string; public: string }
  dnsServer: string
  /** Task 6 derives every service credential from this by HMAC. */
  masterSecret: string
  /**
   * True when `masterSecret` was generated rather than supplied. Service
   * credentials are derived from it, so a generated one means every existing
   * service container holds a password this process can no longer reproduce —
   * which surfaces as an authentication failure that looks like a Mongo bug. The
   * boot line says so rather than leaving it to be discovered.
   */
  masterSecretGenerated: boolean
  dockerSocket: string
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env)
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ')
    throw new ConfigError('CONFIG_INVALID', `invalid configuration — ${detail}`)
  }

  const raw = parsed.data
  const devAuth = raw.MANIFEST_DEV_AUTH === '1'

  // Roadmap gap 3, safeguard 1. The shim mints a session for a named test user
  // with no credential of any kind; outside development that is a total
  // authentication bypass. Fail closed on anything that is not `development`.
  if (devAuth && raw.MANIFEST_ENV !== 'development') {
    throw new ConfigError(
      'CONFIG_DEV_AUTH_OUTSIDE_DEVELOPMENT',
      `MANIFEST_DEV_AUTH is enabled while MANIFEST_ENV is '${raw.MANIFEST_ENV}'. ` +
        'The dev auth shim is an authentication bypass and may only run in development. ' +
        'P4 replaces it with real CWL and deletes it.',
    )
  }

  /**
   * §13 rests on this secret: it signs the short-lived credential the registry
   * token realm verifies before granting a push scope. Absent, anyone who can
   * reach the realm can mint a push token for any repository.
   *
   * Fail closed outside development, exactly as the dev-auth shim does above —
   * two independent reads of one setting, which is the shape the roadmap's
   * lesson asks for. In development a per-process random secret is used instead
   * of a literal default, because a default in the source tree is a published
   * secret. The only cost is that a build credential does not survive a restart
   * in development, and they live for minutes.
   */
  if (
    raw.MANIFEST_BUILD_CREDENTIAL_SECRET === undefined &&
    raw.MANIFEST_ENV !== 'development'
  ) {
    throw new ConfigError(
      'CONFIG_BUILD_CREDENTIAL_SECRET_REQUIRED',
      `MANIFEST_BUILD_CREDENTIAL_SECRET is required when MANIFEST_ENV is '${raw.MANIFEST_ENV}'. ` +
        'It signs the credential the registry token realm verifies (§13); without it ' +
        'the realm cannot tell one build from another.',
    )
  }
  const buildCredentialSecret =
    raw.MANIFEST_BUILD_CREDENTIAL_SECRET ?? randomBytes(32).toString('hex')

  // The same two reads of one setting, for the secret every backing-service
  // password is derived from. `.env.example` carries a value, so the documented
  // path never reaches the generated branch.
  if (raw.MANIFEST_MASTER_SECRET === undefined && raw.MANIFEST_ENV !== 'development') {
    throw new ConfigError(
      'CONFIG_MASTER_SECRET_REQUIRED',
      `MANIFEST_MASTER_SECRET is required when MANIFEST_ENV is '${raw.MANIFEST_ENV}'. ` +
        'Every backing-service credential is derived from it (§12); generating one per ' +
        'process would make every existing database unreachable after a restart.',
    )
  }
  const masterSecretGenerated = raw.MANIFEST_MASTER_SECRET === undefined
  const masterSecret = raw.MANIFEST_MASTER_SECRET ?? randomBytes(32).toString('hex')

  return {
    env: raw.MANIFEST_ENV,
    databaseUrl: raw.MANIFEST_DATABASE_URL,
    port: raw.MANIFEST_PORT,
    sessionSecret: raw.MANIFEST_SESSION_SECRET,
    devAuth,
    blueprintsRoot: raw.MANIFEST_BLUEPRINTS_ROOT,
    reposRoot: raw.MANIFEST_REPOS_ROOT,
    zones: {
      sandbox: raw.MANIFEST_ZONE_SANDBOX,
      staging: raw.MANIFEST_ZONE_STAGING,
      production: raw.MANIFEST_ZONE_PRODUCTION,
    },
    registryTokenKeyPath: fromRepoRoot(raw.MANIFEST_REGISTRY_TOKEN_KEY),
    registryTokenCertPath: fromRepoRoot(raw.MANIFEST_REGISTRY_TOKEN_CERT),
    buildCredentialSecret,
    registryUrl: raw.MANIFEST_REGISTRY_URL,
    registryInternalUrl: raw.MANIFEST_REGISTRY_INTERNAL_URL,
    caddyAdminUrl: raw.MANIFEST_CADDY_ADMIN_URL,
    caddyServers: {
      internal: raw.MANIFEST_CADDY_SERVER_INTERNAL,
      public: raw.MANIFEST_CADDY_SERVER_PUBLIC,
    },
    dnsServer: raw.MANIFEST_DNS_SERVER,
    masterSecret,
    masterSecretGenerated,
    dockerSocket: raw.MANIFEST_DOCKER_SOCKET ?? resolveSocketPath(),
  }
}

export function zoneFor(
  config: Config,
  kind: 'sandbox' | 'staging' | 'production',
): string {
  return config.zones[kind]
}

/** §23: `<slug>.<zone for that environment kind>`. The slug is the only app input. */
export function hostnameFor(
  config: Config,
  kind: 'sandbox' | 'staging' | 'production',
  slug: string,
): string {
  return `${slug}.${zoneFor(config, kind)}`
}
