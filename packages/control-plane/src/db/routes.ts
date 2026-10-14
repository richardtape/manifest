import { eq } from 'drizzle-orm'
import type { Db } from './client.js'
import { routes } from './schema.js'

/**
 * WHAT A HOSTNAME REACHES, REPLACED AS A SET (A1 Task 3, Decision 5): every Route row the
 * hostname had goes, and one per instance of `instanceIds` is written, in ONE transaction — so
 * a reader (boot recovery, the API's serving instance, the retirer) sees the old set or the new
 * one and never a mixture or nothing.
 *
 * It replaces the upsert on `routes.hostname` every writer used while a hostname reached one
 * instance; with the unique key on `(hostname, instance_id)` Postgres refuses that conflict
 * target (`42P10`). Two writers for one hostname at once are not this function's to order: the
 * deploy holds the environment's lock (`withEnvironmentLock`) around it.
 *
 * Its callers: the deploy (`releases/release.ts`) and the launch suites' `stagedRelease`
 * (`launch/testing.ts`).
 */
export async function replaceRouteSet(
  db: Db,
  input: {
    hostname: string
    /** §23's listener the rows record — the environment's (`listenerFor(kind)`). */
    listener: (typeof routes.$inferInsert)['listener']
    instanceIds: readonly string[]
  },
): Promise<void> {
  if (input.instanceIds.length === 0)
    throw new Error(
      `replaceRouteSet for ${input.hostname} was given no instance — a hostname that reaches nothing has its rows deleted, not replaced`,
    )
  await db.transaction(async (tx) => {
    await tx.delete(routes).where(eq(routes.hostname, input.hostname))
    await tx.insert(routes).values(
      input.instanceIds.map((instanceId) => ({
        instanceId,
        hostname: input.hostname,
        listener: input.listener,
        kind: 'canonical' as const,
      })),
    )
  })
}
