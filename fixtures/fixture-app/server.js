// P3's build target. Trivial on purpose: a health endpoint and one route that
// writes to its own Mongo. No auth and no AI — those are P4's proof app
// (`fixtures/proof-app/`, roadmap gap 6).
//
// It contains NO Dockerfile and NO .npmrc. D13 makes the build definition the
// blueprint's, and this directory exists partly to prove an app cannot supply one:
// `assembleContext` writes both AFTER the app's tree, so a committed copy is
// overwritten rather than honoured.
//
// THE FILENAME IS PART OF THE CONTRACT. `blueprints/fixture-node/Dockerfile.tmpl`
// ends `CMD ["node", "server.js"]` at the WORKDIR root, and neither the template
// nor `blueprint.yaml` has a placeholder for it. An app whose entry point is
// anywhere else builds cleanly and then exits immediately with
// `Cannot find module '/app/server.js'` — a green build and a dead container.
import { createServer } from 'node:http'
import { MongoClient } from 'mongodb'

// The blueprint descriptor's `default_port` is 3000, so that is the default here
// too. The deploy spec sets PORT=8080 deliberately: if the port were not really
// plumbed through, this app would listen on 3000 while the container health check
// and the Caddy upstream both point at 8080, and the deploy would fail rather than
// pass by coincidence.
const port = Number(process.env.PORT ?? 3000)
// The health path the blueprint descriptor declares. Not read from the environment:
// nothing injects such a variable, and §8's injection contract is P4's, so inventing
// a name here would create a contract P4 has to either honour or contradict.
const HEALTH_PATH = '/healthz'

const client = new MongoClient(process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017')
const db = () => client.db(process.env.MONGODB_DB_NAME ?? 'app')

const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url ?? '/', `http://${req.headers.host}`).pathname

    if (path === HEALTH_PATH) {
      // The health endpoint asserts the DATABASE too. A health check that only says
      // "the process is up" reports healthy for an app that cannot serve a request.
      await db().command({ ping: 1 })
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok', mongo: true }))
      return
    }

    // A write per request, so `writes` is evidence the app can write and not only
    // read. It says nothing about persistence — that is what `boots` is for.
    await db().collection('writes').insertOne({ at: new Date() })
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(
      JSON.stringify({
        app: process.env.MANIFEST_PROJECT_SLUG ?? 'fixture-app',
        env: process.env.MANIFEST_ENV ?? 'unknown',
        url: process.env.MANIFEST_APP_URL ?? '',
        // §12's hardening baseline says non-root. Reported so a test can assert it
        // from outside rather than trusting the container's configuration.
        uid: process.getuid?.() ?? -1,
        // WRITTEN ONCE PER PROCESS START, below, and never by a request. That is
        // the whole point: a counter that rose on every request would rise across
        // a stop and start whether or not the restart happened and whether or not
        // the volume survived, so it could not tell "the data persisted" from
        // "I asked twice". This one rises only if the app really restarted AND the
        // previous run's row is still there.
        boots: await db().collection('boots').countDocuments(),
        writes: await db().collection('writes').countDocuments(),
      }),
    )
  } catch (error) {
    res.writeHead(500, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ status: 'error', message: String(error) }))
  }
})

await client.connect()
await db().collection('boots').insertOne({ at: new Date() })
server.listen(port, '0.0.0.0', () =>
  console.log(JSON.stringify({ level: 'info', msg: 'fixture-app listening', port })),
)
