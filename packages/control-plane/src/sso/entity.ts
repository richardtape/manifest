import type { EnvironmentKind } from '../secrets/index.js'
import { AUTH_PATH } from '../spec/index.js'
import { SsoError } from './errors.js'

export class SpEntityError extends SsoError {
  constructor(code: string, message: string) {
    super(code, message)
    this.name = 'SpEntityError'
  }
}

/**
 * A bare https origin — scheme, host, nothing else. Manifest supplies this, so a
 * value with a path or a trailing slash is a configuration fault; it is refused
 * here because the consequence at the IdP is "metadata not found" for a row that
 * is plainly present, which reads as a database problem for as long as it takes
 * somebody to compare two strings character by character.
 */
const ENTITY_BASE =
  /^https:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/
/** §23's `<slug>.<zone>`. No scheme, no port, no path. */
const HOSTNAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/

export interface SpEntityInput {
  slug: string
  environmentKind: EnvironmentKind
  /** MANIFEST's, from `hostnameFor` (§23). Never from the spec. */
  hostname: string
  /** MANIFEST's, from config — §9's `{platform-domain}`. */
  entityBase: string
  /**
   * The APP's, and the only app-supplied values in this function. Both are
   * paths, and both are re-checked below.
   */
  auth: {
    provider: 'cwl' | 'none'
    callback: string
    logout: string
    attributes: string[]
  }
}

export interface SpEntity {
  entityId: string
  acsUrl: string
  sloUrl: string
  attributes: string[]
}

/**
 * §9's D15 derivation: *"Origins are never accepted as input. The app supplies a
 * path; Manifest supplies the origin… A free-text ACS URL is an
 * assertion-phishing primitive."*
 *
 * So this function joins nothing. `new URL(callback, origin)` would be the
 * obvious implementation and is exactly the defect: given
 * `https://evil.example/acs` it returns the attacker's URL rather than failing,
 * and the SP registration then tells the IdP to POST a valid assertion for a
 * real CWL user to a host Manifest does not own. The paths are re-validated
 * against `AUTH_PATH` — the same regex `spec/schema.ts` applies at parse time,
 * imported rather than copied so the two cannot drift, and read a second time
 * here because a spec row can reach this function from a database written by an
 * earlier version of that schema.
 */
export function deriveSpEntity(input: SpEntityInput): SpEntity {
  const { auth } = input

  if (auth.provider !== 'cwl') {
    throw new SpEntityError(
      'SP_ENTITY_PROVIDER_NOT_CWL',
      `cannot register a Service Provider for an app whose auth.provider is ` +
        `'${auth.provider}' — only 'cwl' has an IdP to register with`,
    )
  }
  if (!ENTITY_BASE.test(input.entityBase)) {
    throw new SpEntityError(
      'SP_ENTITY_BASE_INVALID',
      `the platform entity base '${input.entityBase}' is not a bare https origin ` +
        `(MANIFEST_SP_ENTITY_BASE, e.g. https://manifest.internal — no path, no ` +
        `trailing slash)`,
    )
  }
  if (!HOSTNAME.test(input.hostname)) {
    throw new SpEntityError(
      'SP_ENTITY_HOSTNAME_INVALID',
      `'${input.hostname}' is not a bare hostname — §23 hostnames carry no scheme, ` +
        'port or path, and every SP URL is built from this one',
    )
  }
  for (const [field, path] of [
    ['callback', auth.callback],
    ['logout', auth.logout],
  ] as const) {
    if (!AUTH_PATH.test(path)) {
      throw new SpEntityError(
        'SP_ENTITY_PATH_INVALID',
        `auth.${field} '${path}' is not a path — it must match ${AUTH_PATH.source}. ` +
          'Manifest supplies the origin; an app that supplies one is describing ' +
          'somewhere Manifest cannot vouch for (§9).',
      )
    }
  }
  // §9's fail-open field, refused before anything is written. S2 measured that
  // SimpleSAMLphp treats an empty list and a missing one identically, and both
  // release EVERY attribute the auth source produced.
  if (auth.attributes.length === 0) {
    throw new SpEntityError(
      'SP_ENTITY_NO_ATTRIBUTES',
      'auth.attributes is empty — an SP registered with no attribute list receives ' +
        'every attribute the IdP holds, so Manifest refuses to write the row (§9)',
    )
  }

  return {
    entityId: `${input.entityBase}/sp/${input.slug}/${input.environmentKind}`,
    acsUrl: `https://${input.hostname}${auth.callback}`,
    sloUrl: `https://${input.hostname}${auth.logout}`,
    attributes: [...auth.attributes],
  }
}
