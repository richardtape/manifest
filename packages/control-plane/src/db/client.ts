import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema.js'

const connectionString = process.env.MANIFEST_DATABASE_URL
if (!connectionString) {
  throw new Error(
    'MANIFEST_DATABASE_URL is not set. It is derived from the repo `.env`, which ' +
      '`make seed` writes; run `make seed && make up`, or set it by hand:\n' +
      '  set -a; . ./.env; set +a\n' +
      '  export MANIFEST_DATABASE_URL="postgres://manifest:${POSTGRES_PASSWORD}@127.0.0.1:7103/manifest_control"',
  )
}

export const pool = new pg.Pool({ connectionString })
export const db = drizzle(pool, { schema })
export type Db = typeof db
