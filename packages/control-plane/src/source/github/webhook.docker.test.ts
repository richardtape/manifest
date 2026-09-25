import { createServer } from 'node:net'
import { and, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { buildServer, type ServerDeps } from '../../api/index.js'
import { loginAs, mutationHeaders, projectBody, testDeps } from '../../api/testing.js'
import { db, events } from '../../db/index.js'
import { resetDatabase } from '../../db/testing.js'
import { createSourceObserver } from '../../projects/index.js'
import { describeDocker } from '../../runtime/testing.js'
import { pushAsPerson } from '../testing.js'
import { createGithubSourceDriver } from './driver.js'
import { startFakeContainer, type FakeContainer } from './testing.js'

/**
 * A DELIVERY ACROSS THE REAL BOUNDARY (the D5 plan's Task 9, Step 5): the fake's IMAGE, on the
 * platform network, delivering to a control plane listening on the HOST's loopback, through
 * `host.docker.internal` — the edge's own way in (Decision 8), never through the edge. This is
 * Task 1 `[M7]`'s measurement made permanent, and the only test in the repository that crosses
 * from a platform container to the control plane's loopback port.
 */

const SLUG = 'gh-hooks'

async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const p = (server.address() as { port: number }).port
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return p
}

interface Delivery {
  event: string
  status: number | null
  error?: string
}

let fake: FakeContainer
let app: FastifyInstance
let deps: ServerDeps

describeDocker(
  'a delivery from the fake’s IMAGE reaches the control plane on the host',
  () => {
    beforeAll(async () => {
      await resetDatabase()
      const port = await freePort()
      fake = await startFakeContainer({
        webhookUrl: `http://host.docker.internal:${port}/webhooks/github`,
        network: 'manifest-platform',
      })
      const base = await testDeps()
      deps = {
        ...base,
        config: {
          ...base.config,
          sourceDriver: 'github',
          github: {
            ...base.config.github,
            apiUrl: fake.options.apiUrl,
            gitUrl: fake.options.gitUrl,
            org: fake.options.org,
            appId: fake.options.appId,
            installationId: fake.options.installationId,
            webhookSecretPath: fake.webhookSecretPath,
          },
        },
        source: createGithubSourceDriver({
          mirrorRoot: base.config.reposRoot,
          ...fake.options,
          observer: createSourceObserver({ db: base.db, bus: base.bus }),
        }),
      }
      app = await buildServer(deps)
      await app.listen({ host: '127.0.0.1', port })
    }, 120_000)
    afterAll(async () => {
      await deps?.sourceSync.idle()
      await app?.close()
      await fake?.remove()
    }, 60_000)

    it('a person’s push is delivered from the container, verified, and synced into the mirror', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/v1/projects',
        payload: projectBody(SLUG),
        cookies: await loginAs(deps, 'bio_prof'),
        headers: mutationHeaders(deps),
      })
      expect(created.statusCode, created.body).toBe(201)
      const projectId = created.json().id as string

      const pushed = await pushAsPerson(fake, SLUG, { 'b.txt': 'b\n' }, 'a person’s push')
      // The seed's push and the person's: both delivered, both answered by the HOST's server.
      let deliveries: Delivery[] = []
      for (let i = 0; i < 100 && deliveries.length < 2; i++) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        deliveries = (await (
          await fetch(`${fake.url}/_fake/deliveries`)
        ).json()) as Delivery[]
      }
      expect(deliveries).toHaveLength(2)
      for (const d of deliveries) expect(d).toMatchObject({ event: 'push', status: 202 })

      await deps.sourceSync.idle()
      const repo = deps.source.repositoryFor(SLUG)
      expect((await deps.source.localGitDir(repo, pushed)).commitSha).toBe(pushed)
      const pushedEvents = await db
        .select({ machineDetail: events.machineDetail })
        .from(events)
        .where(and(eq(events.projectId, projectId), eq(events.type, 'repository.pushed')))
      expect(pushedEvents.map((e) => e.machineDetail)).toContainEqual(
        expect.objectContaining({ ref: 'refs/heads/main', to: pushed }),
      )
    })
  },
)
