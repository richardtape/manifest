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
  /**
   * Which declaration makes it appear, for the ones that are conditional. The two
   * `ai.models.*` values are §8's "if declared": a row that appears only when the
   * release declares a model of that kind.
   */
  when?:
    | 'auth.provider=cwl'
    | 'services.mongo'
    | 'services.qdrant'
    | 'ai.models'
    | 'ai.models.chat'
    | 'ai.models.embedding'
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
  // §8's AI rows, rendered since P4b Task 9 — and only from `InjectionContext.ai`,
  // which `deployRelease` fills with the key it minted for THIS deploy.
  {
    name: 'LLM_PROVIDER',
    requiredIn: 'if-ai',
    when: 'ai.models',
    note: "`openai` — LiteLLM is OpenAI-compatible and there is NO `openai-compat` provider: ProviderType is 'openai' | 'anthropic' | 'ollama' | 'ubc-llm-sandbox'.",
  },
  {
    name: 'LLM_ENDPOINT',
    requiredIn: 'if-ai',
    when: 'ai.models',
    note: 'The IN-NETWORK URL. The toolkit cannot be forced through the egress proxy (P4a, three mechanisms), so the app reaches manifest-litellm directly on its own network (P4b Task 8).',
  },
  {
    name: 'LLM_API_KEY',
    requiredIn: 'if-ai',
    when: 'ai.models',
    note: 'Minted on every deploy and committed once the instance is healthy, when the previous key is revoked (§10; Rich, 2026-09-14).',
  },
  {
    name: 'LLM_DEFAULT_MODEL',
    requiredIn: 'if-ai',
    when: 'ai.models.chat',
    note: 'The first declared chat model. ABSENT, never empty, when none is declared.',
  },
  { name: 'EMBEDDINGS_PROVIDER', requiredIn: 'if-ai', when: 'ai.models.embedding' },
  {
    name: 'EMBEDDINGS_MODEL',
    requiredIn: 'if-ai',
    when: 'ai.models.embedding',
    note: 'The first declared embedding model.',
  },
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
export const MANIFEST_IDP_PATHS = {
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
  /**
   * The §13-FROZEN config for this environment, and the whole of what this
   * function knows about the app.
   *
   * The plan's context carried a `ManifestSpec` beside this. It is gone, and so
   * is the second source of truth it was: a release is immutable, so a redeploy
   * must inject what the release froze and not what `manifest.yaml` says today —
   * which is why Task 9 put `auth` on `ResolvedConfig`, and why Task 10 put `ai`
   * there rather than reading `app_specs.parsed` back out.
   */
  resolved: ResolvedConfig
  /** The ENVIRONMENT ROW's kind. Checked against `resolved.environmentKind`. */
  environmentKind: EnvironmentKind
  /** The app's own hostname, e.g. `chem-labs.staging.manifest.internal`. */
  hostname: string
  projectSlug: string
  /** From `config.idp` — the IdP's entityID and base URL, and §9's SP base. */
  idp: { entityId: string; baseUrl: string; spEntityBase: string }
  /**
   * **WHY THIS DEPLOY IS HAPPENING, AND IT CHANGES EXACTLY ONE THING: WHICH IdP THE APP IS
   * SENT TO** (P6a Task 14, and it was found by driving the rehearsal live).
   *
   * §8 sends a PRODUCTION app to real UBC Shibboleth — `authentication.ubc.ca`, injected
   * explicitly rather than defaulted. That is right for a launch and it makes D21's
   * rehearsal impossible as R2 writes it: the rehearsal deploys the candidate into
   * production and completes *"one real CWL sign-in against the Manifest IdP"*, and a
   * production app points at a host C1 puts out of reach. Measured on 2026-09-20: the
   * rehearsal's probe followed `/login` to
   * `https://authentication.ubc.ca/idp/profile/SAML2/Redirect/SSO` and failed TLS against
   * the platform CA, which is the most honest possible failure.
   *
   * So a `'rehearsal'` deploy is production in every other respect — hostname, listener,
   * entityID, ACS URL, attribute list, certificate, resources — and is pointed at the
   * REHEARSAL IdP instead. On this laptop that is the Manifest IdP; at UBC it is
   * `authentication.stg.id.ubc.ca`, which is what D21 asks for in the first place and what
   * `MANIFEST_IDP_BASE_URL` would name there. **`SAML_ENVIRONMENT` is `LOCAL` for such a
   * deploy, and that is the truth rather than a compromise**: the app really is talking to
   * the local IdP.
   *
   * Absent means `'launch'`, so every existing caller is unchanged and a launch is what a
   * deploy is unless it says otherwise.
   */
  purpose?: 'launch' | 'rehearsal'
  /** Absent when `auth.provider` is `none`; Task 7's derivation when it is `cwl`. */
  spEntity?: InjectedSpEntity
  /** The session secret. Container-side paths are this module's own constants. */
  secrets: { sessionSecret: string }
  /** What `ensureService` returned, paired with what was declared. */
  services: InjectedService[]
  /**
   * §8's AI rows — present exactly when the resolved config declares models.
   *
   * RESOLVED BY THE CALLER, never here: the key `deployRelease` minted for this
   * deploy, the IN-NETWORK endpoint, and the model names it read off the catalogue by
   * kind. A renderer that minted keys or fetched a catalogue could not run in §16's
   * unit tier, and would be a second place that decides which key an app holds.
   */
  ai?: {
    endpoint: string
    apiKey: string
    defaultChatModel?: string
    embeddingModel?: string
  }
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
  const { resolved } = ctx

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

  // §8's AI rows (P4b Task 9), which replace P4a's Decision 12 refusal. The meaning
  // changed — "P4b does not exist" became "the caller minted no key" — and the
  // property did not: a variable rendered EMPTY is worse than a refusal, because the
  // app starts, looks healthy, and fails its first question.
  // `ai` is optional at runtime for the same reason `auth` is: §13 froze these
  // configs and the ones frozen before this field existed do not carry it.
  const models = resolved.ai?.models ?? []
  if (models.length > 0 && (ctx.ai === undefined || ctx.ai.apiKey === '')) {
    throw new InjectionError(
      'INJECTION_AI_KEY_MISSING',
      `this app declares ai.models (${models.join(', ')}) and no AI key was supplied. ` +
        '`deployRelease` mints one before the instance starts; an app rendered without ' +
        'one would start healthy and fail its first question.',
    )
  }
  if (models.length === 0 && ctx.ai !== undefined) {
    throw new InjectionError(
      'INJECTION_AI_UNEXPECTED',
      `'${ctx.projectSlug}' declares no ai.models and an AI key was supplied anyway. One ` +
        'of the two is wrong, and guessing which gives an app AI access it never declared.',
    )
  }
  for (const named of [ctx.ai?.defaultChatModel, ctx.ai?.embeddingModel]) {
    // The key is minted for the DECLARED models only (Task 7), so any other name is a
    // 403 on the app's first question. Two independent reads of one list.
    if (named !== undefined && !models.includes(named)) {
      throw new InjectionError(
        'INJECTION_AI_MODEL_UNDECLARED',
        `the model '${named}' is not among this release's ai.models (${models.join(', ')})`,
      )
    }
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
    // A REHEARSAL IS NOT A LAUNCH: see `purpose` above. Everything else below reads
    // `production`, so the hostname, the entityID, the ACS and the certificate rules are
    // untouched — only the three IdP URLs and `SAML_ENVIRONMENT` move.
    const production =
      ctx.environmentKind === 'production' && (ctx.purpose ?? 'launch') === 'launch'

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

  if (ctx.ai !== undefined) {
    // `openai`: LiteLLM is OpenAI-compatible, and §8 records that there is no
    // `openai-compat` provider in the toolkit.
    env.LLM_PROVIDER = 'openai'
    env.LLM_ENDPOINT = ctx.ai.endpoint
    env.LLM_API_KEY = ctx.ai.apiKey
    // §8's "if declared", as ABSENCE. An empty LLM_DEFAULT_MODEL is worse than none:
    // the toolkit sends the empty string, and a key with a models list refuses it as
    // not permitted — which reads as a permissions problem (P4b sitting 3).
    if (ctx.ai.defaultChatModel !== undefined) {
      env.LLM_DEFAULT_MODEL = ctx.ai.defaultChatModel
    }
    if (ctx.ai.embeddingModel !== undefined) {
      env.EMBEDDINGS_PROVIDER = 'openai'
      env.EMBEDDINGS_MODEL = ctx.ai.embeddingModel
    }
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
