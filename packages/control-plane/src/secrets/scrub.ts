/**
 * The names whose VALUES are secrets. Listed explicitly rather than matched by
 * a pattern: a regex over `.*SECRET.*` would miss POSTGRES_PASSWORD and would
 * silently start deleting a variable somebody adds later for another purpose.
 */
export const SECRET_ENV_NAMES = [
  'MANIFEST_SESSION_SECRET',
  'MANIFEST_MASTER_SECRET',
  'MANIFEST_BUILD_CREDENTIAL_SECRET',
  'MANIFEST_DATABASE_URL',
  'MANIFEST_IDP_DATABASE_URL',
  'POSTGRES_PASSWORD',
  'LITELLM_MASTER_KEY',
  'LITELLM_SALT_KEY',
  'SSP_RO_PASSWORD',
  'SSP_ADMIN_PASSWORD',
  'SSP_SECRET_SALT',
] as const

/** Returns the names actually removed, so the boot line can say how many. */
export function scrubSecretEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const removed: string[] = []
  for (const name of SECRET_ENV_NAMES) {
    if (env[name] !== undefined) {
      delete env[name]
      removed.push(name)
    }
  }
  return removed
}
