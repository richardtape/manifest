import { and, asc, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { stagedRelease } from '../launch/testing.js'
import { expectSqlState } from '../observability/testing.js'
import type { Db } from './client.js'
import { replaceRouteSet } from './routes.js'
import { environments, instances, releases, routes } from './schema.js'
import { resetDatabase, withProject } from './testing.js'

beforeAll(resetDatabase)

/**
 * Staging's environment and its first instance, as `stagedRelease` leaves them — its Route row
 * included — and a SECOND instance of the same release beside it, routed nowhere yet.
 */
async function twoInstances(
  tx: Db,
  ctx: { projectId: string; ownerId: string },
): Promise<{ hostname: string; first: string; second: string }> {
  const { releaseId } = await stagedRelease(tx, ctx)
  const [env] = await tx
    .select()
    .from(environments)
    .where(
      and(eq(environments.projectId, ctx.projectId), eq(environments.kind, 'staging')),
    )
  const [first] = await tx
    .select({ id: instances.id })
    .from(instances)
    .where(eq(instances.environmentId, env!.id))
  const [second] = await tx
    .insert(instances)
    .values({ environmentId: env!.id, releaseId, driver: 'fake', state: 'healthy' })
    .returning({ id: instances.id })
  return { hostname: env!.hostname, first: first!.id, second: second!.id }
}

const routedTo = async (tx: Db, hostname: string) =>
  (
    await tx
      .select({ instanceId: routes.instanceId })
      .from(routes)
      .where(eq(routes.hostname, hostname))
      .orderBy(asc(routes.instanceId))
  ).map((r) => r.instanceId)

/** The constraint a refused write names, read down drizzle's wrapping (`expectSqlState`'s walk). */
async function constraintOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise
  } catch (error) {
    for (let e: unknown = error; e instanceof Error; e = e.cause) {
      const found = (e as { constraint?: string }).constraint
      if (found !== undefined) return found
    }
  }
  return undefined
}

/**
 * §6's `Route` BECOMES A SET (A1 Task 3, Decision 5): a hostname reaches every instance of its
 * environment's set, one row each. The unique key moves from `hostname` alone — "one hostname
 * reaches one instance" — to `(hostname, instance_id)`.
 */
describe('routes: one row per (hostname, instance) (A1 Task 3)', () => {
  it('holds two rows for one hostname — one per instance of its set', async () => {
    await withProject(async (tx, ctx) => {
      const { hostname, first, second } = await twoInstances(tx, ctx)
      await tx
        .insert(routes)
        .values({ instanceId: second, hostname, listener: 'internal' })
      expect(await routedTo(tx, hostname)).toEqual([first, second].sort())
    })
  })

  /**
   * The same instance twice is still one too many — refused by the NEW key, by name, so a refusal
   * that came from the old hostname-only key cannot keep this green for the wrong reason.
   */
  it('refuses the same instance twice for one hostname, by the (hostname, instance) key', async () => {
    await withProject(async (tx, ctx) => {
      const { hostname, first } = await twoInstances(tx, ctx)
      // A SAVEPOINT, so the refusal does not abort the transaction the next assertion reads in.
      const again = () =>
        tx.transaction((sp) =>
          sp.insert(routes).values({ instanceId: first, hostname, listener: 'internal' }),
        )
      await expectSqlState(again(), '23505')
      expect(await constraintOf(again())).toBe('routes_hostname_instance_key')
    })
  })

  /**
   * THE ONE WRITER OF A HOSTNAME'S SET: delete what it had, insert what it reaches now, in one
   * transaction — never an upsert on `routes.hostname`, which Postgres refuses (`42P10`) once no
   * unique key is on `hostname` alone.
   */
  it('replaceRouteSet leaves exactly the set it is given', async () => {
    await withProject(async (tx, ctx) => {
      const { hostname, first, second } = await twoInstances(tx, ctx)
      expect(await routedTo(tx, hostname)).toEqual([first])

      await replaceRouteSet(tx, {
        hostname,
        listener: 'internal',
        instanceIds: [second, first],
      })
      expect(await routedTo(tx, hostname)).toEqual([first, second].sort())

      await replaceRouteSet(tx, { hostname, listener: 'public', instanceIds: [second] })
      const rows = await tx.select().from(routes).where(eq(routes.hostname, hostname))
      expect(
        rows.map((r) => ({
          instanceId: r.instanceId,
          listener: r.listener,
          kind: r.kind,
        })),
      ).toEqual([{ instanceId: second, listener: 'public', kind: 'canonical' }])
    })
  })

  it('replaceRouteSet refuses an empty set — a hostname with no route is a delete, not a set', async () => {
    await withProject(async (tx, ctx) => {
      const { hostname, first } = await twoInstances(tx, ctx)
      await expect(
        replaceRouteSet(tx, { hostname, listener: 'internal', instanceIds: [] }),
      ).rejects.toThrow(/no instance/)
      expect(await routedTo(tx, hostname)).toEqual([first])
    })
  })

  /**
   * `stagedRelease`'s route (the launch suites' fixture) upserted on `routes.hostname` — refused
   * `42P10` once that key went. Called twice for one project, the second release takes staging's
   * route, and the first's row is gone: one row, the second instance's.
   */
  it('the launch suites’ staged release, twice for one project, leaves one row — the second’s', async () => {
    await withProject(async (tx, ctx) => {
      await stagedRelease(tx, ctx)
      const { releaseId } = await stagedRelease(tx, ctx)
      const [env] = await tx
        .select()
        .from(environments)
        .where(
          and(
            eq(environments.projectId, ctx.projectId),
            eq(environments.kind, 'staging'),
          ),
        )
      const [second] = await tx
        .select({ id: instances.id })
        .from(instances)
        .innerJoin(releases, eq(releases.id, instances.releaseId))
        .where(eq(instances.releaseId, releaseId))
      expect(await routedTo(tx, env!.hostname)).toEqual([second!.id])
    })
  })
})
