import { readFileSync } from 'node:fs'
import { buildServer } from './api/index.js'
import { loadBlueprints } from './blueprints/index.js'
import { hostnameFor, loadConfig } from './config.js'
import { db } from './db/index.js'
import { createCaddyClient } from './routing/index.js'
import { createDockerDriver, createEngineClient } from './runtime/index.js'
import { createLocalSourceDriver } from './source/index.js'
import { createAppSecrets, loadMasterKeypair, scrubSecretEnv } from './secrets/index.js'
import { createServiceCredentials } from './services/index.js'
import { createSamlSp } from './identity/index.js'
import {
  createCatalogueCache,
  createLiteLlmClient,
  disabledCatalogue,
} from './ai/index.js'
import {
  controlPlaneSpEntity,
  createIdpPool,
  createSsoRegistrar,
  describeKeypair,
  registerControlPlaneSp,
} from './sso/index.js'

const config = loadConfig()

// §12: "scrubbed from the control plane's own `process.env` at boot so that any
// child process it spawns cannot read them."
//
// AFTER loadConfig, which has now read everything it needs, and after the module
// imports above — `db/client.ts` reads MANIFEST_DATABASE_URL at import time, and
// ESM evaluates every import before the first statement here, so it already has
// it. From this line on, nothing may read a secret from the environment again.
//
// This is not theoretical: `runtime/docker/builder.ts` spawns `docker` with
// `{ ...process.env }` twice, and an app's build log is a place secrets end up.
const secretsScrubbed = scrubSecretEnv()

/**
 * §10's gateway, and the one boot-time decision P4b makes about it (sitting 4,
 * finding 38). AI is ON unless `MANIFEST_AI_ENABLED=0` says otherwise, and ON means
 * the admin client is built HERE — so a missing master key refuses the boot, in
 * development too, naming the setting and the switch, instead of surfacing at a
 * faculty member's first spec push as an authentication failure from the gateway.
 *
 * OFF builds no client. The catalogue is then never read, and a spec that declares
 * `ai.models` is refused with SPEC_AI_DISABLED, which names the setting.
 *
 * Rejected: "no key in development means AI off". That is a second, silent way to
 * switch AI off, and it overrides a developer who left the flag at 1 expecting AI.
 *
 * Early, before the driver touches Docker, so a refused boot changes nothing. And
 * nothing is FETCHED: the catalogue reads `/model/info` on first use, so boot does
 * not depend on LiteLLM answering.
 */
const litellm = config.litellm.enabled
  ? createLiteLlmClient({
      baseUrl: config.litellm.url,
      // '' reaches the client's own refusal, which names both remedies. `loadConfig`
      // has already refused an absent key outside development.
      masterKey: config.litellm.masterKey ?? '',
    })
  : undefined
const catalogue =
  litellm === undefined ? disabledCatalogue() : createCatalogueCache(litellm)

/**
 * The control plane's own SP keypair, minted by `make up`.
 *
 * A missing file is a hard failure naming the command that creates it, for the
 * reason the registry issuer's reader gives one line down: the alternative —
 * constructing a SAML client with an empty key — produces a login route that
 * exists, answers, and signs AuthnRequests no IdP will accept.
 */
const readKeypairPem = (path: string, which: string): string => {
  let pem: string
  try {
    pem = readFileSync(path, 'utf8')
  } catch {
    throw new Error(
      `cannot read the control plane's SP ${which} at '${path}'. ` +
        'Run `make up`, which calls infra/lib/ensure-cp-sp-keypair.sh.',
    )
  }
  // The shape, not that the read returned. An interrupted mint leaves a file
  // that exists and is not a PEM, and the failure then lands inside the XML
  // signer with a message about the assertion.
  if (!pem.includes('-----BEGIN')) {
    throw new Error(`the file at '${path}' is not a PEM ${which}`)
  }
  return pem
}

const readIssuerPem = (path: string, which: string): string => {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    throw new Error(
      `cannot read the registry token ${which} at '${path}'. ` +
        'Run `make up`, which calls infra/lib/ensure-registry-auth.sh.',
    )
  }
}

// Hoisted rather than constructed inline: the boot line below reads `driver.name`
// back, and this file is the only place the choice is made.
// Loaded before the driver, which needs it to turn a blueprint REFERENCE into a
// directory. One registry, so the server and the builder cannot disagree about
// which blueprint `fixture-node@1` names.
const blueprints = await loadBlueprints(config.blueprintsRoot)

const driver = await createDockerDriver({
  engine: createEngineClient({ socketPath: config.dockerSocket }),
  masterSecret: config.masterSecret,
  // P2's registry, which already exposes `pathOf(ref)` for exactly this. Passing
  // `config.blueprintsRoot` here — the directory HOLDING the blueprints — meant
  // every build through this process died with `no blueprint.yaml in .../blueprints`,
  // and `buildImage` ignored its own `blueprintRef` argument. Found by `make demo`.
  blueprintDirFor: (ref: string) => {
    const dir = blueprints.pathOf(ref)
    if (dir === undefined) {
      throw new Error(
        `no blueprint '${ref}' in ${config.blueprintsRoot}. ` +
          `Available: ${blueprints
            .list()
            .map((b) => `${b.blueprint}@${b.major_version}`)
            .join(', ')}`,
      )
    }
    return dir
  },
  dnsServer: config.dnsServer,
  // These two are NOT interchangeable, and nothing fails loudly if they are
  // swapped: `registryHost` is what the BUILDER calls the registry (reachable on
  // the internal build network) and `registryPublicHost` is what the DAEMON calls
  // it. Same content, addressed by digest. Swapped, builds push somewhere the
  // daemon cannot pull from, and the failure surfaces at `ensureInstance` as a
  // pull error naming an image that was, from the builder's point of view, pushed
  // successfully.
  registryHost: config.registryInternalUrl,
  registryPublicHost: config.registryUrl,
  registryTokenKeyPem: readIssuerPem(config.registryTokenKeyPath, 'key'),
  registryTokenCertPem: readIssuerPem(config.registryTokenCertPath, 'certificate'),
  // P2's `hostnameFor` is `(config, kind, slug)`; the driver's option is
  // `(kind, slug)`. Config is bound here rather than threaded through the driver,
  // which has no other use for it.
  hostnameFor: (kind, slug) => hostnameFor(config, kind, slug),
  routing: {
    caddy: createCaddyClient(config.caddyAdminUrl),
    servers: config.caddyServers,
  },
  // The readiness probe runs from a container and must VERIFY the edge's
  // certificate — `curlimages/curl` trusts no private root, so without this the
  // probe is `curl: (60)` and http_code 000 for ever, and every deploy times out
  // reading "the app is slow to start" (measured 2026-09-06).
  caCertPath: config.caCertPath,
  readinessTimeoutMs: config.readinessTimeoutMs,
})

// §12's stored service credentials. The keypair is read ONCE, here, and bound
// into a resolver — `releases/` and `api/` then hold a resolver rather than key
// material, and no request path touches the file. loadMasterKeypair names the
// FILE in every failure, because "the key is wrong" and "the row is wrong" are
// different problems and this project has lost mornings to reading one as the
// other.
const masterKeypair = await loadMasterKeypair(config.secretsMasterKeyPath)
const secrets = createServiceCredentials(masterKeypair, config.masterSecret)
const appSecrets = createAppSecrets(masterKeypair)

// §9's SP registrar. The IdP metadata database is a SECOND connection to a
// DIFFERENT database, constructed ONCE here — `sso/` writes SimpleSAMLphp's own
// table, which is why it does not go through `db`. The pool is built at boot
// rather than per request for the same reason `db` is: a pool per registration
// would open a connection per deploy and never close it.
//
// `config.idpDatabaseUrl` is required and is never derived from the control
// plane's URL by swapping the database name (P4a Decision 13) — they are two
// independent settings, and the running system keeps them that way.
const idpPool = createIdpPool(config.idpDatabaseUrl)
const sso = createSsoRegistrar(
  idpPool,
  masterKeypair,
  config.idp.spEntityBase,
  // Read per deploy, not here: `make up` mints it, so a re-minted IdP keypair is
  // picked up without restarting the control plane.
  config.idp.signingCertPath,
)

/**
 * §9's first sentence: MANIFEST ITSELF IS AN SP. Roadmap gap 3 closes here.
 *
 * The registration is written on every boot, not once by `make up`, and through
 * `renderSpMetadata` — the same renderer every deployed app's row goes through.
 * Two reasons, both of which this project has paid for:
 *
 *  * A row built anywhere else would be a SECOND PRODUCER of the `entity_data`
 *    document. That is the most expensive defect shape measured here, most
 *    recently as defect 49.
 *  * The row's ACS URL and certificate come from THIS process's configuration
 *    and keypair. A boot that did not refresh it is a boot after which the IdP
 *    may still be posting assertions at an origin nothing listens on — and §9
 *    audits an ACS change for exactly that reason.
 *
 * It makes the IdP's metadata database a hard boot dependency. That is the
 * honest failure: an IdP whose store is unreachable is one nobody can log in
 * through, and this says so at boot rather than at the first login.
 */
const spEntity = controlPlaneSpEntity({
  entityBase: config.idp.spEntityBase,
  origin: config.sp.origin,
})
// `describeKeypair`, not two fields and a hand-stripped certData: the armour
// stripping is the detail S2 Evidence 8 measured a failure on, and the
// fingerprint and expiry D20 alerts from come off the certificate itself.
const spKeypair = describeKeypair(
  readKeypairPem(config.sp.privateKeyPath, 'private key'),
  readKeypairPem(config.sp.certificatePath, 'certificate'),
)
await registerControlPlaneSp(idpPool, spEntity, spKeypair)

const app = await buildServer({
  db,
  config,
  driver,
  source: createLocalSourceDriver(config.reposRoot),
  blueprints,
  secrets,
  appSecrets,
  sso,
  catalogue,
  samlSp: createSamlSp({
    entity: spEntity,
    idpBaseUrl: config.idp.baseUrl,
    idpEntityId: config.idp.entityId,
    // Read here rather than per request: unlike `sso`'s per-deploy read, this
    // one is bound into a SAML client at construction, so a re-minted IdP
    // keypair needs a restart. Deploys are not a hot path; logins are.
    idpCertificatePem: await sso.idpSigningCertificate(),
    privateKeyPem: spKeypair.privateKeyPem,
    certificatePem: spKeypair.certificatePem,
  }),
})

await app.listen({ port: config.port, host: '127.0.0.1' })

// Which driver actually booted is the one fact this file decides, and every
// acceptance in P3 is meaningless if it is 'fake'. Printed once, so the answer is
// observable rather than inferred from behaviour.
//
// `console.log`, NOT `app.log.info`. P2 builds the server as
// `Fastify({ logger: false })`, under which `app.log.info` exists, accepts the
// call, and writes nothing. Measured 2026-09-05: the line vanishes. This is a
// boot-time fact, printed before any request — it does not belong to the request
// logger P2 deliberately turned off.
console.log(
  JSON.stringify({
    driver: driver.name,
    port: config.port,
    // The other fact this file decides. Read back by boot.docker.test.ts.
    ai: catalogue.enabled ? 'enabled' : 'disabled',
    msg: 'control plane ready',
    // The COUNT, never the names' values. A zero here means the scrub did not
    // run, which is indistinguishable from a clean environment without it.
    secretsScrubbed: secretsScrubbed.length,
    // Service credentials are DERIVED from the master secret. A generated one
    // cannot reproduce the password an existing Mongo container already holds, and
    // the resulting failure looks like a database problem rather than a
    // configuration one. Say so at boot instead.
    ...(config.masterSecretGenerated
      ? {
          warning:
            'MANIFEST_MASTER_SECRET was not set and a random one was generated; ' +
            'existing backing services will refuse this process’s credentials',
        }
      : {}),
  }),
)
