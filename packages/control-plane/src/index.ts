import { readFileSync } from 'node:fs'
import { buildServer } from './api/index.js'
import { loadBlueprints } from './blueprints/index.js'
import { hostnameFor, loadConfig } from './config.js'
import { db } from './db/index.js'
import { createCaddyClient } from './routing/index.js'
import { createDockerDriver, createEngineClient } from './runtime/index.js'
import { createLocalSourceDriver } from './source/index.js'

// loadConfig throws before anything listens if MANIFEST_DEV_AUTH is set outside
// development. That is the point: the process must not come up in that state.
const config = loadConfig()

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
const driver = await createDockerDriver({
  engine: createEngineClient({ socketPath: config.dockerSocket }),
  masterSecret: config.masterSecret,
  blueprintDir: config.blueprintsRoot,
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
})

const app = await buildServer({
  db,
  config,
  driver,
  source: createLocalSourceDriver(config.reposRoot),
  blueprints: await loadBlueprints(config.blueprintsRoot),
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
