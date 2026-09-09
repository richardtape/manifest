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
  /**
   * SimpleSAMLphp's metadata database — a DIFFERENT database from the control
   * plane's own, and required rather than derived from the line above by
   * swapping the name. Decision 13: *the test constructs the value correctly and
   * the running system re-derives it wrongly* is the most expensive defect shape
   * measured in this project, and a derived connection string is that shape
   * waiting to happen.
   */
  MANIFEST_IDP_DATABASE_URL: z.string().min(1),
  /**
   * §9's `{platform-domain}`: every SP entityID is `{base}/sp/{slug}/{env}`.
   * `manifest.ubc.ca` at UBC. A bare https origin — `sso/entity.ts` refuses a
   * value with a path or a trailing slash, which is the second read of this rule.
   */
  MANIFEST_SP_ENTITY_BASE: z.string().min(1).default('https://manifest.internal'),
  /**
   * The Manifest IdP's entityID, which is CONFIGURATION and is never derived
   * from the request host (Decision 3). It mirrors UBC's own shape
   * (`https://authentication.ubc.ca/idp/shibboleth`) so the production cutover
   * is a value change rather than a code change, and S2 recorded the trap it
   * avoids: the shipped `saml20-idp-hosted.php` keys on `'host'` and bakes a
   * PORT into the entityID, so an IdP on 7122 issued assertions from
   * `http://localhost:6122/...`.
   */
  MANIFEST_IDP_ENTITY_ID: z
    .string()
    .min(1)
    .default('https://idp.manifest.internal/idp/shibboleth'),
  /**
   * What §8's `SAML_ENTRY_POINT`, `SAML_LOGOUT_URL` and `SAML_IDP_METADATA_URL`
   * are built from in sandbox and staging. ONE URL that resolves identically
   * from the host, from a container and from `curl` — SAML is browser-mediated,
   * so anything else makes the entry point environment-specific in a way
   * production is not.
   */
  MANIFEST_IDP_BASE_URL: z.string().min(1).default('https://idp.manifest.internal'),
  /**
   * The IdP's PUBLIC signing certificate, which §8's `SAML_IDP_CERT_PATH` means
   * by "Manifest mounts it; the blueprint never fetches it at runtime". Minted
   * by `infra/lib/ensure-idp-keypair.sh` on `make up`, gitignored, and NOT
   * removed by `make reset` — the same rule as the master key and the Caddy CA.
   * Repo-relative for the reason `fromRepoRoot` records.
   */
  MANIFEST_IDP_SIGNING_CERT: z.string().min(1).default('infra/idp/cert/server.crt'),
  MANIFEST_PORT: z.coerce.number().int().min(1).max(65535).default(7100),
  // 32 chars is the HMAC-SHA256 block floor we are willing to accept for a
  // session secret; shorter is a configuration mistake, not a preference.
  MANIFEST_SESSION_SECRET: z.string().min(32),
  /**
   * Where the control plane actually answers, as a bare origin. Every URL the
   * IdP is told to send a person back to is built from it (§9's D15 rule: the
   * app supplies a path, MANIFEST supplies the origin), so it is the one place
   * that decides the ACS URL in the platform's own SP registration.
   *
   * The default is loopback because §21 puts the control plane on the host on
   * 7100, NOT behind the edge — which makes its ACS the only Manifest ACS that
   * is not an `https://….manifest.internal` URL. At UBC it becomes
   * `https://manifest.ubc.ca`, and that is a value change rather than a code
   * change. `loadConfig` below checks a loopback origin's port against
   * MANIFEST_PORT: two independent reads of one setting, because an origin that
   * names a port nothing listens on produces a login that completes at the IdP
   * and then hangs, which reads as an IdP fault.
   */
  MANIFEST_CONTROL_PLANE_ORIGIN: z.string().min(1).default('http://127.0.0.1:7100'),
  /**
   * The control plane's OWN Service Provider keypair — the one that signs its
   * AuthnRequests and whose certificate its `saml20_sp_remote` row pins.
   *
   * On disk rather than in the `secrets` table, because that table's rows are
   * scoped to a `projects` row by a foreign key and the platform is not a
   * project. That puts it in the same custody as the IdP's signing keypair and
   * the envelope master key (§20): minted by `make up`
   * (`infra/lib/ensure-cp-sp-keypair.sh`), gitignored, and NOT removed by
   * `make reset` — regenerating it invalidates the registration that pins it.
   */
  MANIFEST_SP_PRIVATE_KEY: z.string().min(1).default('infra/sp/control-plane.key'),
  MANIFEST_SP_CERTIFICATE: z.string().min(1).default('infra/sp/control-plane.crt'),
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
  /**
   * The platform CA `make seed` mints. `curlimages/curl` trusts no private root,
   * so the readiness probe cannot verify the edge's certificate without it — and
   * without verification the probe would need `-k`, which blinds readiness to a
   * TLS fault §20 cares about. Repo-relative, resolved from the repository root
   * for the reason `fromRepoRoot` records.
   */
  MANIFEST_CA_CERT: z.string().min(1).default('infra/ca/manifest-root.crt'),
  /**
   * §12's envelope-encryption master keypair, in SEPARATE CUSTODY from the
   * database it opens (§20) — a stolen dump is not a stolen secret set.
   * Repo-relative for the reason `fromRepoRoot` records.
   */
  MANIFEST_SECRETS_MASTER_KEY: z.string().min(1).default('infra/secrets/master.key'),
  /**
   * How long a deploy waits for the app to answer 200 AT ITS HOSTNAME, through the
   * edge. Generous, because it covers the app's own cold start (an `npm` runtime,
   * a database connection) as well as DNS, the route and the listener.
   */
  MANIFEST_READINESS_TIMEOUT_MS: z.coerce.number().int().positive().default(90_000),
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
  /** The IdP's metadata database (Decision 13). Never derived from the above. */
  idpDatabaseUrl: string
  /**
   * Everything §8's SAML rows are built from, in one place, so the injection
   * contract takes one field rather than four loose strings. `spEntityBase` is
   * §9's `{platform-domain}` — the origin every SP entityID is built from.
   */
  idp: {
    entityId: string
    baseUrl: string
    spEntityBase: string
    /** Absolute. Placed in every CWL app's container at SAML_IDP_CERT_PATH. */
    signingCertPath: string
  }
  port: number
  sessionSecret: string
  /** §9: Manifest is its own SP. Everything that registration is built from. */
  sp: {
    /** A bare origin — the one thing the platform's own ACS URL is derived from. */
    origin: string
    /** Absolute. */
    privateKeyPath: string
    /** Absolute. */
    certificatePath: string
  }
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
  /** The platform CA, absolute. Mounted into the readiness probe container. */
  caCertPath: string
  /** Absolute. `infra/lib/ensure-master-key.sh` mints the file `make up` puts here. */
  secretsMasterKeyPath: string
  readinessTimeoutMs: number
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

  /**
   * Roadmap gap 3 is CLOSED. `MANIFEST_DEV_AUTH` and its two safeguards used to
   * live here, guarding a route that minted a session for a named test user with
   * no credential of any kind. Both the setting and the route are gone; Manifest
   * logs its own users in with CWL (§9), and there is no development variant to
   * guard. What replaced the guard is the absence of the thing it guarded.
   *
   * The check below is a different one, and it is here for the reason the
   * setting's own doc gives: an origin whose port disagrees with the port this
   * process listens on registers an ACS URL nothing answers, and a login then
   * completes at the IdP and dies on the redirect back — which reads as an IdP
   * fault rather than as a one-character configuration mistake. Only loopback is
   * checked: behind a reverse proxy the public port is legitimately not ours.
   */
  const spOrigin = raw.MANIFEST_CONTROL_PLANE_ORIGIN
  const loopback = /^https?:\/\/(127\.0\.0\.1|\[::1\]|localhost)(?::(\d+))?$/.exec(
    spOrigin,
  )
  if (loopback && Number(loopback[2] ?? '80') !== raw.MANIFEST_PORT) {
    throw new ConfigError(
      'CONFIG_CONTROL_PLANE_ORIGIN_PORT_MISMATCH',
      `MANIFEST_CONTROL_PLANE_ORIGIN is '${spOrigin}' but MANIFEST_PORT is ` +
        `${raw.MANIFEST_PORT}. The origin is what the IdP posts a person's assertion ` +
        'back to, so a loopback origin naming a different port registers a callback ' +
        'nothing is listening on.',
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
    idpDatabaseUrl: raw.MANIFEST_IDP_DATABASE_URL,
    idp: {
      entityId: raw.MANIFEST_IDP_ENTITY_ID,
      baseUrl: raw.MANIFEST_IDP_BASE_URL,
      spEntityBase: raw.MANIFEST_SP_ENTITY_BASE,
      signingCertPath: fromRepoRoot(raw.MANIFEST_IDP_SIGNING_CERT),
    },
    port: raw.MANIFEST_PORT,
    sessionSecret: raw.MANIFEST_SESSION_SECRET,
    sp: {
      origin: spOrigin,
      privateKeyPath: fromRepoRoot(raw.MANIFEST_SP_PRIVATE_KEY),
      certificatePath: fromRepoRoot(raw.MANIFEST_SP_CERTIFICATE),
    },
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
    caCertPath: fromRepoRoot(raw.MANIFEST_CA_CERT),
    secretsMasterKeyPath: fromRepoRoot(raw.MANIFEST_SECRETS_MASTER_KEY),
    readinessTimeoutMs: raw.MANIFEST_READINESS_TIMEOUT_MS,
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
