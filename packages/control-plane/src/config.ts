import { randomBytes } from 'node:crypto'
import { z } from 'zod'

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
    registryTokenKeyPath: raw.MANIFEST_REGISTRY_TOKEN_KEY,
    registryTokenCertPath: raw.MANIFEST_REGISTRY_TOKEN_CERT,
    buildCredentialSecret,
    registryUrl: raw.MANIFEST_REGISTRY_URL,
    registryInternalUrl: raw.MANIFEST_REGISTRY_INTERNAL_URL,
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
