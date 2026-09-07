import { createServer } from 'node:http'
import { MongoClient } from 'mongodb'

const PORT = Number(process.env.PORT ?? 3000)
const MONGODB_URI = process.env.MONGODB_URI
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME

const client = MONGODB_URI ? new MongoClient(MONGODB_URI) : null

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`)

  // The health endpoint leaks nothing (§20 — the blueprint is a security multiplier).
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok' }))
    return
  }

  if (url.pathname === '/notes' && req.method === 'POST' && client) {
    const db = client.db(MONGODB_DB_NAME)
    const { insertedId } = await db.collection('notes').insertOne({ at: new Date() })
    res.writeHead(201, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ id: String(insertedId) }))
    return
  }

  res.writeHead(200, { 'content-type': 'text/plain' })
  res.end(`fixture-app in ${process.env.MANIFEST_ENV ?? 'unknown'}\n`)
})

if (client) await client.connect()
server.listen(PORT, '0.0.0.0', () => {
  // An app that says nothing on boot is an app whose logs prove nothing. §11's
  // `logs` is part of the Driver contract and D13 makes the blueprint responsible
  // for the app being observable, so the skeleton emits one structured line.
  console.log(
    JSON.stringify({
      msg: 'fixture-app listening',
      port: PORT,
      env: process.env.MANIFEST_ENV ?? 'unknown',
      database: client ? 'bound' : 'none',
    }),
  )
})
