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
   * Where the control plane is reached, as a bare origin. Every URL the IdP is told to
   * send a person back to is built from it (§9's D15 rule: the app supplies a path,
   * MANIFEST supplies the origin), and from P5a Task 4 it is the only `Origin` a
   * cookie-authenticated mutation is accepted from.
   *
   * `https://console.manifest.internal` since P5a Task 3 (§21, Rich 2026-09-16): the
   * console and the API share one origin, served through the edge, so the platform's own
   * ACS is an `https://….manifest.internal` URL like every app's. At UBC it becomes the
   * console's production origin — a value change, not a code change.
   *
   * `loadConfig` below still checks a LOOPBACK origin's port against MANIFEST_PORT: the
   * Docker tier boots control planes on 7188 and 7189 at loopback origins, and an origin
   * naming a port nothing listens on produces a login that completes at the IdP and then
   * hangs, which reads as an IdP fault.
   */
  MANIFEST_CONTROL_PLANE_ORIGIN: z
    .string()
    .min(1)
    .default('https://console.manifest.internal'),
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
  /**
   * §23's reserved labels (P5a Decision 25): the directory holding `labels.yaml` and
   * `ubc-academic.yaml`, read once at boot. A missing or malformed list refuses the boot.
   * Repo-relative for the reason `fromRepoRoot` records.
   */
  MANIFEST_RESERVED_LABELS_DIR: z.string().min(1).default('infra/reserved-labels'),
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
  //
  // BOTH WERE `srv0` UNTIL P6a (R3), and §21's divergence 2 said so — the split was
  // modelled and never enforced on the only machine that exists. They are now two
  // servers in ONE edge container: `srv0` on the internal address (127.0.0.2, and
  // :443 inside the container), `srv1` on the public one (127.0.0.3, and :8443
  // inside). One container, so one caddy-data volume and one internal CA.
  MANIFEST_CADDY_SERVER_INTERNAL: z.string().min(1).default('srv0'),
  MANIFEST_CADDY_SERVER_PUBLIC: z.string().min(1).default('srv1'),
  /**
   * The PUBLIC listener's port INSIDE the edge container (P6a Decision 15).
   *
   * THE HOST'S SPLIT IS BY ADDRESS; THE CONTAINER'S IS BY PORT. From the host the
   * two servers are `127.0.0.2:443` and `127.0.0.3:443`, so a faculty-facing URL
   * never carries a port — infra/compose.yaml refuses one in its own words. From a
   * container both servers are at the edge's ONE address, because
   * `manifest-dns-containers` answers `10.89.0.10` for the whole zone, so the only
   * way to reach a specific server from inside is its port: `:443` is srv0 and
   * `:8443` is srv1.
   *
   * The readiness probe runs from a container (S1: a host process cannot reach a
   * container address on Docker Desktop), so a PRODUCTION app's probe is the one
   * caller that needs this. `infra/compose.yaml`'s `127.0.0.3:443:8443` is the other
   * half of the pair, and `make verify` holds the two equal rather than trusting two
   * files to agree.
   */
  MANIFEST_EDGE_PUBLIC_PORT: z.coerce.number().int().positive().default(8443),
  // §12 makes the resolver per-container: dnsmasq-A's address on the platform
  // network. P1 pins it at 10.89.0.53 (infra/lib/common.sh, DNS_C_IP).
  MANIFEST_DNS_SERVER: z.string().min(1).default('10.89.0.53'),
  /**
   * THE ACCOUNT D21's REHEARSAL SIGNS IN AS (R2, P6a Task 14).
   *
   * A rehearsal is only evidence if somebody actually signs in, so the platform needs a
   * test identity. On this laptop that is one of the Manifest IdP's three fixture users
   * (`infra/idp/config/authsources.php`), whose passwords equal their usernames and are in
   * the repository — they guard nothing, and `instructor` is the one every demo uses.
   *
   * **A REHEARSAL AGAINST UBC'S STAGING IdP — D21's own words, and still an external-track
   * obligation (§9) — CHANGES THESE TWO SETTINGS AND NOTHING ELSE.** That is why they are
   * settings rather than a constant in `launch/`.
   *
   * Not in `.env.example`: both have defaults that are correct for this machine, and a key
   * there would be one more thing `make doctor` requires of every checkout.
   */
  MANIFEST_REHEARSAL_USER: z.string().min(1).default('instructor'),
  MANIFEST_REHEARSAL_PASSWORD: z.string().min(1).default('instructor'),
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
  /**
   * §11's drain bound (P4c): how long a retire waits for the instance it replaced to
   * finish the requests already in flight to it before the container is removed.
   *
   * ONE PLATFORM SETTING, not a field in `manifest.yaml` (Rich, 2026-09-15) — a
   * per-app bound is a §7 schema change, and this is a property of the platform's
   * patience rather than of an app. 120 s: long enough for a slow answer from a
   * language model, short enough that a container is not held for ever by a client
   * that never hangs up.
   */
  MANIFEST_DRAIN_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  // Every backing-service credential is derived from this by HMAC (Task 6), so it
  // is the single secret behind every app's database password. Optional here and
  // required outside development below, for the same two reasons the build
  // credential is: making it required outright breaks every existing loadConfig
  // caller, and a literal default in the source tree is a published secret.
  MANIFEST_MASTER_SECRET: z.string().min(32).optional(),
  MANIFEST_DOCKER_SOCKET: z.string().min(1).optional(),
  /**
   * P4b Task 5. What the CONTROL PLANE calls LiteLLM: a host process, on the port
   * `infra/compose.yaml` publishes (127.0.0.1:7106 → 4000).
   */
  MANIFEST_LITELLM_URL: z.string().min(1).default('http://127.0.0.1:7106'),
  // NOT derived from the one above. `registryUrl`/`registryInternalUrl` is the same
  // pair and carries the same warning: these two are what the CONTROL PLANE and what
  // an APP call the same service, they are not interchangeable, and nothing fails
  // loudly if they are swapped — an app handed the loopback URL gets ECONNREFUSED
  // from inside its own network. It carries `/v1` because §8's LLM_ENDPOINT does.
  MANIFEST_LITELLM_INTERNAL_URL: z
    .string()
    .min(1)
    .default('http://manifest-litellm:4000/v1'),
  /**
   * Mints and revokes every app's LiteLLM key (§10). Optional here and required
   * outside development below, for the build credential's two reasons — and never
   * generated, because a generated key is one LiteLLM refuses on every call.
   *
   * NOT in `.env.example`. LiteLLM itself reads `LITELLM_MASTER_KEY` from `.env`, and
   * RUNBOOK's export block names that one stored secret again here, at the point of
   * use, the way it builds MANIFEST_DATABASE_URL from MANIFEST_APP_PASSWORD. A second
   * stored copy would drift from the first the first time either changed, and a new
   * `.env.example` key turns `make doctor` red on every existing machine.
   *
   * EMPTY IS ABSENT: `"${LITELLM_MASTER_KEY}"` expands to '' when `.env` lacks the
   * line, and '' must get the named refusal below rather than CONFIG_INVALID's
   * "String must contain at least 1 character(s)" — or, in development, a boot
   * failure for a setting development does not need.
   */
  MANIFEST_LITELLM_MASTER_KEY: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(1).optional(),
  ),
  // Lets the non-Docker tier run with no LiteLLM. NOT a kill switch for the
  // confinement: it gates whether the catalogue is fetched (Task 6), never whether a
  // key carries allowed_routes (Task 7). '0' or '1' only — `false` is a truthy string.
  MANIFEST_AI_ENABLED: z.enum(['0', '1']).default('1'),
  /**
   * D5's two drivers, ONE per control-plane process (the D5 plan's Decision 3): `local`,
   * bare repositories under MANIFEST_REPOS_ROOT (driver 1), or `github`, an organisation
   * behind a GitHub App with a local mirror at the same path (driver 2). Switching is a
   * restart, and a project keeps the provider it was created with.
   */
  MANIFEST_SOURCE_DRIVER: z.enum(['local', 'github']).default('local'),
  /**
   * Driver 2's GitHub. Every default is the FAKE's (`packages/github-fake`, Task 4, on
   * `127.0.0.1:7110`), so switching a laptop to driver 2 is one variable. A real App sets
   * `https://api.github.com` and `https://github.com`, and the plan's *What Rich does* has
   * the rest. `/api/v3` is GitHub Enterprise Server's layout, which the fake serves.
   */
  MANIFEST_GITHUB_API_URL: z.string().url().default('http://127.0.0.1:7110/api/v3'),
  MANIFEST_GITHUB_GIT_URL: z.string().url().default('http://127.0.0.1:7110'),
  MANIFEST_GITHUB_ORG: z.string().min(1).default('manifest-apps'),
  MANIFEST_GITHUB_APP_ID: z.string().regex(/^\d+$/).default('1000001'),
  MANIFEST_GITHUB_INSTALLATION_ID: z.string().regex(/^\d+$/).default('2000001'),
  /**
   * The App's PRIVATE key, in the master key's custody class (§20) — a file, never a value
   * in the environment. Repo-relative for the reason `fromRepoRoot` records; the fake's is
   * minted by `make up` (`infra/lib/ensure-github-fake.sh`), a real App's is Rich's to place
   * at `infra/secrets/github-app.pem`.
   */
  MANIFEST_GITHUB_APP_KEY: z.string().min(1).default('infra/secrets/github-fake-app.pem'),
  /** The App's webhook secret (§20: "verified by HMAC before any processing"), a file. */
  MANIFEST_GITHUB_WEBHOOK_SECRET: z
    .string()
    .min(1)
    .default('infra/secrets/github-fake-webhook.secret'),
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
  /** Absolute. §23's reserved labels. */
  reservedLabelsDir: string
  zones: { sandbox: string; staging: string; production: string }
  registryTokenKeyPath: string
  registryTokenCertPath: string
  /** Signs the short-lived credential the token realm verifies (§13). */
  buildCredentialSecret: string
  registryUrl: string
  registryInternalUrl: string
  caddyAdminUrl: string
  /**
   * Listener -> Caddy server name. `srv0` internal and `srv1` public since P6a (R3);
   * both were `srv0` until then, which is what §21's divergence 2 recorded.
   */
  caddyServers: { internal: string; public: string }
  /** The public listener's port inside the edge container. Probes only; see the schema. */
  edgePublicPort: number
  /** D21's rehearsal signs in as this (P6a Task 14). The IdP's fixture account, here. */
  rehearsalCredentials: { user: string; password: string }
  dnsServer: string
  /** The platform CA, absolute. Mounted into the readiness probe container. */
  caCertPath: string
  /** Absolute. `infra/lib/ensure-master-key.sh` mints the file `make up` puts here. */
  secretsMasterKeyPath: string
  readinessTimeoutMs: number
  /** §11's drain bound, in milliseconds. `MANIFEST_DRAIN_TIMEOUT_MS`, 120 s default. */
  drainTimeoutMs: number
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
  /** LiteLLM (§10, P4b Task 5). Two URLs, never one derived from the other. */
  litellm: {
    /** What the control plane calls — the published port. */
    url: string
    /** What an APP calls, by service name on its own network. Ends in `/v1`. */
    internalUrl: string
    /** Absent only in development; `loadConfig` refuses its absence anywhere else. */
    masterKey?: string
    /** Whether the catalogue is fetched. Never whether a key is confined. */
    enabled: boolean
  }
  /** Which of D5's drivers this process runs (the D5 plan's Decision 3). */
  sourceDriver: 'local' | 'github'
  /**
   * Driver 2's settings. BUILT WHATEVER THE DRIVER (the webhook route reads the secret's
   * path in both modes) and READ only by driver 2, so a driver-1 control plane boots on a
   * machine that has never minted the fake's files — `loadConfig` reads no file.
   */
  github: {
    apiUrl: string
    gitUrl: string
    org: string
    appId: string
    installationId: string
    appKeyPath: string
    webhookSecretPath: string
  }
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

  // The same two reads of one setting, for the key that mints and revokes every app's
  // LiteLLM key (P4b Task 5). Checked LAST, so each earlier guard still reports its
  // own setting first. Never generated: LiteLLM refuses a key it was not started
  // with, so a generated one would fail every AI deploy as an authentication error
  // naming the gateway rather than the setting.
  if (
    raw.MANIFEST_LITELLM_MASTER_KEY === undefined &&
    raw.MANIFEST_ENV !== 'development'
  ) {
    throw new ConfigError(
      'CONFIG_LITELLM_MASTER_KEY_REQUIRED',
      `MANIFEST_LITELLM_MASTER_KEY is required when MANIFEST_ENV is '${raw.MANIFEST_ENV}'. ` +
        "It mints and revokes every app's LiteLLM key (§10); RUNBOOK's export block sets " +
        'it from LITELLM_MASTER_KEY in .env.',
    )
  }

  // An installation token over plaintext is a token on the network (the D5 plan's Decision
  // 4). Loopback only — which is where the fake is. Both URLs are already URLs (the schema).
  for (const [name, value] of [
    ['MANIFEST_GITHUB_API_URL', raw.MANIFEST_GITHUB_API_URL],
    ['MANIFEST_GITHUB_GIT_URL', raw.MANIFEST_GITHUB_GIT_URL],
  ] as const) {
    const u = new URL(value)
    if (
      u.protocol === 'http:' &&
      u.hostname !== '127.0.0.1' &&
      u.hostname !== 'localhost'
    ) {
      throw new ConfigError(
        'CONFIG_GITHUB_INSECURE_URL',
        `${name} is '${value}': a GitHub installation token may cross only loopback in ` +
          'plaintext; use https',
      )
    }
  }

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
    reservedLabelsDir: fromRepoRoot(raw.MANIFEST_RESERVED_LABELS_DIR),
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
    edgePublicPort: raw.MANIFEST_EDGE_PUBLIC_PORT,
    dnsServer: raw.MANIFEST_DNS_SERVER,
    rehearsalCredentials: {
      user: raw.MANIFEST_REHEARSAL_USER,
      password: raw.MANIFEST_REHEARSAL_PASSWORD,
    },
    caCertPath: fromRepoRoot(raw.MANIFEST_CA_CERT),
    secretsMasterKeyPath: fromRepoRoot(raw.MANIFEST_SECRETS_MASTER_KEY),
    readinessTimeoutMs: raw.MANIFEST_READINESS_TIMEOUT_MS,
    drainTimeoutMs: raw.MANIFEST_DRAIN_TIMEOUT_MS,
    masterSecret,
    masterSecretGenerated,
    dockerSocket: raw.MANIFEST_DOCKER_SOCKET ?? resolveSocketPath(),
    litellm: {
      url: raw.MANIFEST_LITELLM_URL,
      internalUrl: raw.MANIFEST_LITELLM_INTERNAL_URL,
      ...(raw.MANIFEST_LITELLM_MASTER_KEY === undefined
        ? {}
        : { masterKey: raw.MANIFEST_LITELLM_MASTER_KEY }),
      enabled: raw.MANIFEST_AI_ENABLED === '1',
    },
    sourceDriver: raw.MANIFEST_SOURCE_DRIVER,
    github: {
      apiUrl: raw.MANIFEST_GITHUB_API_URL,
      gitUrl: raw.MANIFEST_GITHUB_GIT_URL,
      org: raw.MANIFEST_GITHUB_ORG,
      appId: raw.MANIFEST_GITHUB_APP_ID,
      installationId: raw.MANIFEST_GITHUB_INSTALLATION_ID,
      appKeyPath: fromRepoRoot(raw.MANIFEST_GITHUB_APP_KEY),
      webhookSecretPath: fromRepoRoot(raw.MANIFEST_GITHUB_WEBHOOK_SECRET),
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
