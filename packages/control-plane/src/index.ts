import { buildServer } from './api/index.js'
import { db } from './db/index.js'
import { loadConfig } from './config.js'
import { createFakeDriver } from './runtime/index.js'
import { createLocalSourceDriver } from './source/index.js'
import { loadBlueprints } from './blueprints/index.js'

// loadConfig throws before anything listens if MANIFEST_DEV_AUTH is set outside
// development. That is the point: the process must not come up in that state.
const config = loadConfig()

const app = await buildServer({
  db,
  config,
  // P3 swaps this for the Docker driver. Nothing else in this file changes.
  driver: createFakeDriver(),
  source: createLocalSourceDriver(config.reposRoot),
  blueprints: await loadBlueprints(config.blueprintsRoot),
})

await app.listen({ port: config.port, host: '127.0.0.1' })
