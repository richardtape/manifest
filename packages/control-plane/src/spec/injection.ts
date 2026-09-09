import type { ManifestSpec } from './schema.js'
import type { EnvironmentKind, ResolvedConfig } from './resolve.js'

/**
 * The value `blueprint.yaml`'s `injection.contract` must equal.
 *
 * §8: the mapping from a declared service to its full variable set "is versioned
 * with the blueprint". A blueprint pinning another version is reading a different
 * contract from the one this file renders, and Task 13's drift test compares the
 * two against the blueprint's own source.
 */
export const INJECTION_CONTRACT_VERSION = 'v1'

export class InjectionError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    // The code is in the message as well as on the instance: an assertion that
    // matches a message is the cheapest thing a test writes, and a code that
    // only exists as a property is a code no failure output ever shows.
    super(`${code}: ${message}`)
    this.name = 'InjectionError'
  }
}

/**
 * §8's table, and it is FROZEN — the spec's word. Every row below is copied from
 * it, with the "Required in" column as `requiredIn`.
 *
 * As DATA rather than as a series of assignments, because Task 13's drift test
 * compares this against what the blueprint actually reads. A test comparing two
 * hand-maintained lists asserts only that somebody updated both, and §8 was
 * already wrong once "from being written against memory of the libraries rather
 * than against them".
 */
export interface InjectionVariable {
  name: string
  requiredIn: 'all' | 'staging+production' | 'if-service' | 'if-ai'
  /** Which declaration makes it appear, for the ones that are conditional. */
  when?: 'auth.provider=cwl' | 'services.mongo' | 'services.qdrant' | 'ai.models'
  note?: string
}

export const INJECTION_VARIABLES: readonly InjectionVariable[] = [
  { name: 'MANIFEST_ENV', requiredIn: 'all' },
  { name: 'MANIFEST_APP_URL', requiredIn: 'all' },
  { name: 'MANIFEST_PROJECT_SLUG', requiredIn: 'all' },
  { name: 'PORT', requiredIn: 'all' },
  { name: 'SESSION_SECRET', requiredIn: 'all' },
  {
    name: 'SAML_ENVIRONMENT',
    requiredIn: 'all',
    when: 'auth.provider=cwl',
    note: 'NEVER unset. Defaults to STAGING at index.js:120 AND :307, which points a deploy at real UBC infrastructure.',
  },
  { name: 'SAML_ISSUER', requiredIn: 'all', when: 'auth.provider=cwl' },
  { name: 'SAML_CALLBACK_URL', requiredIn: 'all', when: 'auth.provider=cwl' },
  {
    name: 'SAML_ENTRY_POINT',
    requiredIn: 'all',
    when: 'auth.provider=cwl',
    note: 'UBC_CONFIG.LOCAL hardcodes SimpleSAMLphp 1.x paths (/simplesaml/saml2/idp/SSOService.php). 2.x serves /module.php/saml/idp/singleSignOnService — measured off the running container 2026-09-07.',
  },
  {
    name: 'SAML_LOGOUT_URL',
    requiredIn: 'all',
    when: 'auth.provider=cwl',
    note: "the library's logout() reads this from ENV, not options",
  },
  { name: 'SAML_IDP_METADATA_URL', requiredIn: 'all', when: 'auth.provider=cwl' },
  {
    name: 'SAML_IDP_CERT_PATH',
    requiredIn: 'all',
    when: 'auth.provider=cwl',
    note: 'MANDATORY: cert is an IIFE that throws at construction, so _fetchCertificate() is unreachable.',
  },
  {
    name: 'SAML_PRIVATE_KEY_PATH',
    requiredIn: 'staging+production',
    when: 'auth.provider=cwl',
  },
  { name: 'MONGODB_URI', requiredIn: 'if-service', when: 'services.mongo' },
  { name: 'MONGODB_DB_NAME', requiredIn: 'if-service', when: 'services.mongo' },
  { name: 'QDRANT_URL', requiredIn: 'if-service', when: 'services.qdrant' },
  { name: 'QDRANT_API_KEY', requiredIn: 'if-service', when: 'services.qdrant' },
  { name: 'QDRANT_COLLECTION', requiredIn: 'if-service', when: 'services.qdrant' },
  // The AI rows are in the table because §8 has them and the drift test reads
  // this list. renderInjection REFUSES to produce them until P4b supplies a
  // key — a variable rendered empty is worse than a refusal (Decision 12).
  {
    name: 'LLM_PROVIDER',
    requiredIn: 'if-ai',
    when: 'ai.models',
    note: 'P4b. `openai` — there is no `openai-compat` provider.',
  },
  { name: 'LLM_ENDPOINT', requiredIn: 'if-ai', when: 'ai.models', note: 'P4b.' },
  { name: 'LLM_API_KEY', requiredIn: 'if-ai', when: 'ai.models', note: 'P4b.' },
  { name: 'LLM_DEFAULT_MODEL', requiredIn: 'if-ai', when: 'ai.models', note: 'P4b.' },
  { name: 'EMBEDDINGS_PROVIDER', requiredIn: 'if-ai', when: 'ai.models', note: 'P4b.' },
  { name: 'EMBEDDINGS_MODEL', requiredIn: 'if-ai', when: 'ai.models', note: 'P4b.' },
] as const

/**
 * The same table, as the question `spec/policy.ts` asks of an app's own `env:`.
 *
 * Derived rather than restated. A faculty member who sets `PORT` has written a
 * variable that does nothing — the platform's binding is applied after theirs,
 * deliberately (§12: an app is untrusted input) — and validation is where they
 * can be told, long before a deploy.
 */
export const RESERVED_ENV_NAMES: ReadonlySet<string> = new Set(
  INJECTION_VARIABLES.map((v) => v.name),
)

/**
 * Where the platform PUTS the two files §8 names as paths, inside the container.
 *
 * Declared here because this module is the single producer of the variables that
 * name them: `deployRelease` builds its `InstanceSpec.files` entries from these
 * same constants, so the path an app is told and the path a file is written to
 * cannot be two values that agree by inspection.
 *
 * The directory is `runtime/docker/instances.ts`'s `FILES_MOUNT`, which is the
 * driver's contract for where an `InstanceFile` may live: §12's read-only rootfs
 * refuses a write anywhere else, so a path outside it fails at container create.
 */
export const INJECTED_FILE_PATHS = {
  idpCertificate: '/manifest/idp-signing.crt',
  spPrivateKey: '/manifest/sp-private-key.pem',
} as const

/**
 * SimpleSAMLphp 2.x's endpoints, read off the running container's own
 * `modules/saml/routing/routes/routes.yml` (2026-09-07) rather than inferred
 * from 1.x documentation. Module routes are served under `/module.php/saml`.
 */
const MANIFEST_IDP_PATHS = {
  sso: '/module.php/saml/idp/singleSignOnService',
  slo: '/module.php/saml/idp/singleLogout',
  metadata: '/module.php/saml/idp/metadata',
} as const

/**
 * Real UBC Shibboleth, copied from `passport-ubcshib@0.1.6`'s own
 * `UBC_CONFIG.PRODUCTION` (index.js:23–27, read 2026-09-09).
 *
 * Injected explicitly even though they equal the library's defaults for
 * `SAML_ENVIRONMENT=PRODUCTION`, because the defaulting is exactly what §8
 * refuses to rely on: the same object literal defaults to STAGING when the
 * variable is unset or misspelled, and STAGING is real UBC infrastructure.
 */
const UBC_PRODUCTION = {
  entryPoint: 'https://authentication.ubc.ca/idp/profile/SAML2/Redirect/SSO',
  logoutUrl: 'https://authentication.ubc.ca/idp/profile/Logout',
  metadataUrl: 'https://authentication.ubc.ca/idp/shibboleth',
} as const

/**
 * Structurally what `sso/entity.ts`'s `deriveSpEntity` returns.
 *
 * Declared here rather than imported: `sso/` imports `spec/` for `AUTH_PATH`,
 * and importing back would close a module cycle around two files that both read
 * a top-level `const` at evaluation time. TypeScript's structural typing means
 * an `SpEntity` still satisfies this, and a field removed from `SpEntity` still
 * fails at the call site — which is the check that matters.
 */
export interface InjectedSpEntity {
  entityId: string
  acsUrl: string
  sloUrl: string
  attributes: string[]
}

/**
 * One bound backing service: what it IS, and what `ensureService` returned.
 *
 * Paired rather than two arrays in declaration order, which is what the plan
 * described. The caller knows both facts in the same loop iteration, so pairing
 * there is correct by construction; a positional zip across `resolved.services`
 * and the handles is one insertion away from binding an app to another app's
 * database, and "two code paths must agree on a set of values" is the shape this
 * repository has paid for seven times in one session.
 */
export interface InjectedService {
  /** The catalogue type from the DECLARATION — `mongo`, `qdrant`. */
  type: string
  /** Verbatim from `ServiceHandle.endpoint`. Never rebuilt. */
  endpoint: string
}

export interface InjectionContext {
  /** The parsed manifest. Task 11 loads it from the release's AppSpec row. */
  spec: ManifestSpec
  /** That environment's view of it, from `resolveConfig`. */
  resolved: ResolvedConfig
  /** The ENVIRONMENT ROW's kind. Checked against `resolved.environmentKind`. */
  environmentKind: EnvironmentKind
  /** The app's own hostname, e.g. `chem-labs.staging.manifest.internal`. */
  hostname: string
  projectSlug: string
  /** From `config.idp` — the IdP's entityID and base URL, and §9's SP base. */
  idp: { entityId: string; baseUrl: string; spEntityBase: string }
  /** Absent when `auth.provider` is `none`; Task 7's derivation when it is `cwl`. */
  spEntity?: InjectedSpEntity
  /** The session secret. Container-side paths are this module's own constants. */
  secrets: { sessionSecret: string }
  /** What `ensureService` returned, paired with what was declared. */
  services: InjectedService[]
}

/**
 * §8's table, rendered. THE ONLY PRODUCER of these names anywhere in the control
 * plane — `deployRelease` calls this and adds nothing of its own.
 *
 * The roadmap's P4 lesson names why: "§8's injection contract is precisely a set
 * of values two code paths must agree on", and the way this repository has failed
 * at that is by having two producers. So Task 11 deleted the ad-hoc block rather
 * than extending it, and `grep` is what proves there is one.
 */
export function renderInjection(ctx: InjectionContext): Record<string, string> {
  const { resolved, spec } = ctx

  // Two independent reads of one setting, which is the shape the roadmap's
  // lesson asks for. `deployRelease` picks `release.resolvedConfig[kind]`, so
  // these agree by construction today; the day they stop, an app is deployed
  // with another environment's resources under this environment's URL.
  if (resolved.environmentKind !== ctx.environmentKind) {
    throw new InjectionError(
      'INJECTION_ENVIRONMENT_MISMATCH',
      `the environment is '${ctx.environmentKind}' and the resolved config was frozen ` +
        `for '${resolved.environmentKind}'. §13 freezes one config per environment; ` +
        'deploying the wrong one applies the wrong resources and the wrong URL.',
    )
  }

  // §23: the hostname is `<slug>.<zone>`, so its first label IS the slug. Both
  // reach here from the environment row, and a disagreement means one of them
  // was rebuilt somewhere.
  if (ctx.hostname.split('.')[0] !== ctx.projectSlug) {
    throw new InjectionError(
      'INJECTION_HOSTNAME_SLUG_MISMATCH',
      `hostname '${ctx.hostname}' does not begin with the project slug ` +
        `'${ctx.projectSlug}' (§23: <slug>.<zone>)`,
    )
  }

  // Decision 12. P4a has no LiteLLM client, so an app declaring models must fail
  // here rather than start with LLM_API_KEY unset: an app that runs and cannot
  // reach a model is a support ticket, and a variable rendered empty is worse
  // than a refusal.
  if (spec.ai.models.length > 0) {
    throw new InjectionError(
      'INJECTION_AI_UNSUPPORTED',
      `this app declares ai.models (${spec.ai.models.join(', ')}) and P4a injects no ` +
        'AI variables. The LiteLLM client, the virtual key and the model catalogue are ' +
        'P4b; until it lands, remove ai.models or deploy without it.',
    )
  }

  /**
   * §13 froze these configs, and the ones frozen before 2026-09-09 have no
   * `auth` key at all — reading through it would throw and take an existing
   * developer's redeploy with it. Those apps were deployed with no sign-on, so
   * that is what they keep. Same shape as `MONGODB_DB_NAME`: a contract field
   * with no producer for as long as it took somebody to notice.
   */
  const auth = resolved.auth as ResolvedConfig['auth'] | undefined
  const provider = auth?.provider ?? 'none'

  if (provider === 'cwl' && ctx.spEntity === undefined) {
    throw new InjectionError(
      'INJECTION_SP_ENTITY_MISSING',
      `'${ctx.projectSlug}' declares auth.provider: cwl and no Service Provider ` +
        'registration was supplied. The app would start, redirect a user to the IdP, ' +
        'and receive "Metadata not found" — so this refuses instead (§9).',
    )
  }
  if (provider !== 'cwl' && ctx.spEntity !== undefined) {
    throw new InjectionError(
      'INJECTION_SP_ENTITY_UNEXPECTED',
      `'${ctx.projectSlug}' declares auth.provider: ${provider} and a Service Provider ` +
        'registration was supplied anyway. One of the two is wrong, and guessing which ' +
        'either registers an SP nobody asked for or gives an app credentials it did not declare.',
    )
  }

  const appUrl = `https://${ctx.hostname}`

  const env: Record<string, string> = {
    // The APP's own, FIRST. Everything below is the platform's and overwrites
    // them: §12 makes application code untrusted input, so a declared
    // MONGODB_URI must not be able to point the app at a database of its
    // choosing while it appears bound to its own. `spec/policy.ts` refuses these
    // names at validation, which is the other read of the same list — this one
    // is the one that has to hold even for a release frozen before that check
    // existed.
    ...Object.fromEntries(
      resolved.env
        .filter((e) => e.value !== undefined)
        .map((e) => [e.name, e.value!] as const),
    ),
    MANIFEST_ENV: ctx.environmentKind,
    MANIFEST_APP_URL: appUrl,
    MANIFEST_PROJECT_SLUG: ctx.projectSlug,
    /**
     * The platform chooses the port: it is what the container HEALTHCHECK probes
     * and what the Caddy route uses as its upstream. Nothing told the APP until
     * P3 Task 17, so an app that did not happen to hardcode the blueprint's
     * `default_port` listened somewhere else and was unreachable — the container
     * ran, the route existed, and the edge answered 502 for ever.
     */
    PORT: String(resolved.port),
    SESSION_SECRET: ctx.secrets.sessionSecret,
  }

  if (provider === 'cwl') {
    const spEntity = ctx.spEntity!
    const production = ctx.environmentKind === 'production'

    // §8: LOCAL for sandbox and staging (the Manifest IdP), PRODUCTION for
    // production. A different vocabulary from MANIFEST_ENV on purpose — they
    // are two variables read by two consumers, and conflating them is how an app
    // in `sandbox` ends up pointed at authentication.stg.id.ubc.ca.
    env.SAML_ENVIRONMENT = production ? 'PRODUCTION' : 'LOCAL'
    env.SAML_ISSUER = spEntity.entityId
    /**
     * The REGISTERED ACS URL, read rather than rebuilt from the hostname and
     * `auth.callback`. An assertion is POSTed to whatever the IdP's row says, so
     * an app listening anywhere else sees a login that never completes and
     * reports nothing — and D15 already made the registration the one place that
     * joins a Manifest origin to an app-supplied path.
     */
    env.SAML_CALLBACK_URL = spEntity.acsUrl
    env.SAML_ENTRY_POINT = production
      ? UBC_PRODUCTION.entryPoint
      : `${ctx.idp.baseUrl}${MANIFEST_IDP_PATHS.sso}`
    // The IdP's logout endpoint, NOT this SP's SLO URL (`spEntity.sloUrl`): the
    // library's logout() sends the user HERE, and the two differ by which side
    // of the flow they belong to.
    env.SAML_LOGOUT_URL = production
      ? UBC_PRODUCTION.logoutUrl
      : `${ctx.idp.baseUrl}${MANIFEST_IDP_PATHS.slo}`
    env.SAML_IDP_METADATA_URL = production
      ? UBC_PRODUCTION.metadataUrl
      : `${ctx.idp.baseUrl}${MANIFEST_IDP_PATHS.metadata}`
    env.SAML_IDP_CERT_PATH = INJECTED_FILE_PATHS.idpCertificate
    // §8's "Required in" column, which is not decoration: the Manifest IdP
    // requires signed AuthnRequests in staging (§9) and real UBC encrypts
    // assertions. Optional in sandbox, where an unsigned request is accepted.
    if (ctx.environmentKind !== 'sandbox') {
      env.SAML_PRIVATE_KEY_PATH = INJECTED_FILE_PATHS.spPrivateKey
    }
  }

  for (const service of ctx.services) {
    Object.assign(env, renderService(service))
  }

  return env
}

/**
 * §8: "A service declaration produces more than one variable. `services[].name`
 * is a convenience label, not a variable name."
 *
 * Every value is read OUT OF the endpoint the driver returned, never rebuilt
 * from the slug. `MONGODB_DB_NAME` was specified in §8 and injected by nobody
 * until now, so every deployed app wrote to a database called `app` while the
 * credentials it connected with were minted for another one — and two Docker
 * tests set the variable themselves and passed. Reading it back out of the URI
 * makes the two unable to disagree.
 */
function renderService(service: InjectedService): Record<string, string> {
  const url = parseEndpoint(service)
  const database = url.pathname.replace(/^\//, '')

  switch (service.type) {
    case 'mongo': {
      if (database === '') {
        throw new InjectionError(
          'INJECTION_SERVICE_ENDPOINT_INVALID',
          `the mongo endpoint names no database, so MONGODB_DB_NAME cannot be derived ` +
            'from it. The endpoint is built where the credentials are; a database name ' +
            'invented here would be a second producer of the value.',
        )
      }
      return { MONGODB_URI: service.endpoint, MONGODB_DB_NAME: database }
    }
    case 'qdrant': {
      if (database === '') {
        throw new InjectionError(
          'INJECTION_SERVICE_ENDPOINT_INVALID',
          'the qdrant endpoint names no collection, so QDRANT_COLLECTION cannot be ' +
            'derived from it',
        )
      }
      return {
        // Without the credentials: Qdrant authenticates with an `api-key`
        // HEADER, so a URL carrying userinfo is both wrong for the client and a
        // secret in a variable that is not meant to hold one.
        QDRANT_URL: `${url.protocol}//${url.host}`,
        QDRANT_API_KEY: decodeURIComponent(url.password),
        QDRANT_COLLECTION: database,
      }
    }
    default:
      throw new InjectionError(
        'INJECTION_SERVICE_UNKNOWN',
        `no §8 variables are defined for service type '${service.type}'. The catalogue ` +
          'and this table are versioned together; a service the platform can create and ' +
          'cannot describe would deploy an app that has no way to reach it.',
      )
  }
}

function parseEndpoint(service: InjectedService): URL {
  let url: URL
  try {
    url = new URL(service.endpoint)
  } catch {
    throw new InjectionError(
      'INJECTION_SERVICE_ENDPOINT_INVALID',
      `the ${service.type} endpoint is not a URL. §11's ServiceHandle.endpoint is ` +
        'what an app connects with, and every variable below is read out of it.',
    )
  }
  /**
   * `new URL` is not the check it looks like. `mf-svc-db:27017` PARSES —
   * `mf-svc-db:` becomes the scheme and `27017` the path — so a host-less
   * endpoint reached the mongo branch with `database` set to the port number,
   * and the app would have been told its database was called `27017`. Measured
   * 2026-09-09, by the test written to prove the parse failure.
   */
  if (url.host === '') {
    throw new InjectionError(
      'INJECTION_SERVICE_ENDPOINT_INVALID',
      `the ${service.type} endpoint '${service.endpoint}' names no host. A bare ` +
        '`name:port` parses as a URL whose SCHEME is the name, so this is checked ' +
        'rather than assumed.',
    )
  }
  return url
}
