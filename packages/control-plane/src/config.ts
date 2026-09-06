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
