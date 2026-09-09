import { readFileSync } from 'node:fs'
import { buildServer } from './api/index.js'
import { loadBlueprints } from './blueprints/index.js'
import { hostnameFor, loadConfig } from './config.js'
import { db } from './db/index.js'
import { createCaddyClient } from './routing/index.js'
import { createDockerDriver, createEngineClient } from './runtime/index.js'
import { createLocalSourceDriver } from './source/index.js'
import { loadMasterKeypair, scrubSecretEnv } from './secrets/index.js'
import { createServiceCredentials } from './services/index.js'
import { createIdpPool, createSsoRegistrar } from './sso/index.js'

// loadConfig throws before anything listens if MANIFEST_DEV_AUTH is set outside
// development. That is the point: the process must not come up in that state.
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

// §9's SP registrar. The IdP metadata database is a SECOND connection to a
// DIFFERENT database, constructed ONCE here — `sso/` writes SimpleSAMLphp's own
// table, which is why it does not go through `db`. The pool is built at boot
// rather than per request for the same reason `db` is: a pool per registration
// would open a connection per deploy and never close it.
//
// `config.idpDatabaseUrl` is required and is never derived from the control
// plane's URL by swapping the database name (P4a Decision 13) — they are two
// independent settings, and the running system keeps them that way.
const sso = createSsoRegistrar(
  createIdpPool(config.idpDatabaseUrl),
  masterKeypair,
  config.spEntityBase,
)

const app = await buildServer({
  db,
  config,
  driver,
  source: createLocalSourceDriver(config.reposRoot),
  blueprints,
  secrets,
  sso,
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
