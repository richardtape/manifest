import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema.js'

const connectionString = process.env.MANIFEST_DATABASE_URL
if (!connectionString) {
  throw new Error(
    'MANIFEST_DATABASE_URL is not set. It is derived from the repo `.env`, which ' +
      '`make seed` writes; run `make seed && make up`, or set it by hand:\n' +
      '  set -a; . ./.env; set +a\n' +
      '  export MANIFEST_DATABASE_URL="postgres://manifest_app:${MANIFEST_APP_PASSWORD}@127.0.0.1:7103/manifest_control"\n' +
      'The role is `manifest_app`, NEVER `manifest`: `manifest` is POSTGRES_USER and ' +
      'therefore a SUPERUSER, and a superuser bypasses every grant — which makes ' +
      "§20's append-only `audit` schema unimplementable. `make up` creates the role " +
      '(infra/lib/ensure-app-role.sh).',
  )
}

export const pool = new pg.Pool({ connectionString })
export const db = drizzle(pool, { schema })

/**
 * THE ADVISORY LOCKS' OWN CONNECTIONS (`db/locks.ts`), never `pool`'s (the launch path plan's sitting
 * 12, F1). A session-level advisory lock is held by the connection that took it, for as long as its
 * holder works — and every holder's work queries through `db`. On ONE pool, ten holders at once (the
 * boot schedules a retire pass for every environment together) took all ten connections and each
 * waited for an eleventh: the control plane answered nothing that needed the database, its sign-in
 * included, for ever.
 *
 * **TWO POOLS, BECAUSE LOCKS NEST** (the same sitting's whole-branch review, I2): an archive or a
 * delete holds its PROJECT's lock and takes each ENVIRONMENT's inside it, and a rehearsal its own lock
 * and then the deploy's environment lock. On one lock pool, ten outer holders each waiting for an
 * inner connection wedged it the same way. So the outer locks take `outerLockPool` and the
 * environment locks take `lockPool`; nothing holding an environment lock ever takes another lock, so
 * `lockPool` always drains, and an outer holder waiting for it always gets one. Each pool's size bounds
 * how many hold — and wait — at once; the rest wait in its queue, in the process.
 */
export const lockPool = new pg.Pool({ connectionString, max: 10 })
/** The project and rehearsal locks' connections — the OUTER locks, which hold an environment lock inside. */
export const outerLockPool = new pg.Pool({ connectionString, max: 10 })
export type Db = typeof db
