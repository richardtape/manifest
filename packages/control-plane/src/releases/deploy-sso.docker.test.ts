import { afterAll, beforeAll, expect, it } from 'vitest'
import type pg from 'pg'
import { asc, eq } from 'drizzle-orm'
import { appSpecs, events, users } from '../db/index.js'
import { withRollback } from '../db/testing.js'
import { loadConfig } from '../config.js'
import { createProject } from '../projects/index.js'
import { createFakeDriver } from '../runtime/index.js'
import { describeDocker } from '../runtime/testing.js'
import { generateMasterKeypair } from '../secrets/index.js'
import { createServiceCredentials } from '../services/index.js'
import {
  createIdpPool,
  createSsoRegistrar,
  deleteSpRow,
  readSpRow,
} from '../sso/index.js'
import { idpDatabaseUrl } from '../sso/testing.js'
import { createRelease, deployRelease, startBuild } from './index.js'

/**
 * Task 9's composition, against the REAL registrar.
 *
 * `releases.test.ts` proves the ORDER — the SP is registered before the instance
 * starts — with a recorder, which is the right tool for an ordering question and
 * the wrong one for everything else. A recorder accepts whatever `deployRelease`
 * hands it. The real `registerServiceProvider` derives an entityID, refuses an
 * origin, mints a keypair, writes a `saml20_sp_remote` row and records two audit
 * Events, and NONE of that had ever been reached from `deployRelease`.
 *
 * That gap is this project's most expensive shape: P3's Session 5 lost a day to
 * seven defects where the test constructed the value correctly and the running
 * system re-derived it wrongly. Docker tier because the metadata table is the IdP
 * container's artefact.
 */
describeDocker('deployRelease registers a real SP (§9, Task 9)', () => {
  let pool: pg.Pool
  const entityIds: string[] = []

  const config = loadConfig({
    MANIFEST_ENV: 'development',
    MANIFEST_DATABASE_URL: 'postgres://unused',
    MANIFEST_IDP_DATABASE_URL: 'postgres://unused-idp',
    MANIFEST_SESSION_SECRET: 'k'.repeat(32),
    MANIFEST_BLUEPRINTS_ROOT: '/tmp/blueprints',
    MANIFEST_REPOS_ROOT: '/tmp/repos',
  })

  const resolvedFor = (kind: 'sandbox' | 'staging' | 'production') => ({
    environmentKind: kind,
    port: 3000,
    health: '/healthz',
    resources: { cpu: 0.5, memory: '512Mi', pids: 256, disk: '2Gi' },
    env: [],
    services: [],
    egressAllow: [],
    classification: 'internal' as const,
    auth: {
      provider: 'cwl' as const,
      attributes: ['ubcEduCwlPuid', 'mail'],
      callback: '/auth/ubcshib/callback',
      logout: '/auth/logout',
    },
  })

  beforeAll(() => {
    pool = createIdpPool(idpDatabaseUrl())
  })
  afterAll(async () => {
    // Unconditional. The transaction rolls the control-plane rows back; the IdP
    // row is written through a DIFFERENT pool and survives it, and a leaked row
    // breaks the next `make up` — ensure-idp-sql.sh refuses to start while one
    // violates §9's attributes constraint.
    for (const entityId of entityIds) await deleteSpRow(pool, entityId)
    await pool.end()
  })

  it('writes the metadata row and the audit events, from a deploy', async () => {
    const slug = 'deploy-sso-probe'
    const entityId = `https://manifest.internal/sp/${slug}/staging`
    entityIds.push(entityId)

    await withRollback(async (db) => {
      const [user] = await db
        .insert(users)
        .values({
          ubcCwlPuid: `puid-${slug}`,
          email: `${slug}@ubc.ca`,
          displayName: 'O',
          role: 'member',
        })
        .returning()
      const { project, environments } = await createProject(db, config, {
        slug,
        ownerId: user!.id,
        blueprintRef: 'fixture-node@1',
      })
      const staging = environments.find((e) => e.kind === 'staging')!
      const [appSpec] = await db
        .insert(appSpecs)
        .values({
          projectId: project.id,
          commitSha: 'a'.repeat(40),
          parsed: {},
          schemaVersion: 1,
          valid: true,
        })
        .returning()

      const driver = createFakeDriver()
      const build = await startBuild(db, driver, {
        projectId: project.id,
        projectSlug: project.slug,
        appSpecId: appSpec!.id,
        commitSha: appSpec!.commitSha,
        blueprintRef: project.blueprintRef,
        repoPath: `/tmp/${slug}.git`,
      })
      const release = await createRelease(db, {
        projectId: project.id,
        buildId: build.id,
        appSpecId: appSpec!.id,
        createdBy: user!.id,
        resolvedConfig: {
          sandbox: resolvedFor('sandbox'),
          staging: resolvedFor('staging'),
          production: resolvedFor('production'),
        },
      })

      const keys = await generateMasterKeypair()
      const instance = await deployRelease(
        db,
        driver,
        config,
        {
          secrets: createServiceCredentials(keys, config.masterSecret),
          // The real one, bound exactly as `src/index.ts` binds it at boot.
          sso: createSsoRegistrar(pool, keys, 'https://manifest.internal'),
        },
        { releaseId: release.id, environmentId: staging.id },
      )
      expect(instance.state).toBe('healthy')

      // The row the IdP will actually read, at the entityID D15 derives — not one
      // the test built and handed over.
      const row = await readSpRow(pool, entityId)
      expect(row).toBeDefined()
      expect(row!.AssertionConsumerService[0]?.Location).toBe(
        `https://${staging.hostname}/auth/ubcshib/callback`,
      )
      expect(row!.attributes).toEqual(['ubcEduCwlPuid', 'mail'])
      // §9's fail-open row is unrepresentable, and the certificate is mandatory
      // for any app that signs — which is every app this registers.
      expect(row!.certData).toMatch(/^[A-Za-z0-9+/=]{100,}$/)

      // §9: "Every registration and change is an append-only audit Event." One
      // registration, no ACS change: this app has never been registered before.
      const rows = await db
        .select()
        .from(events)
        .where(eq(events.projectId, project.id))
        .orderBy(asc(events.createdAt))
      expect(rows.map((r) => r.type)).toEqual(['sso.registered'])
      expect(rows[0]!.subject).toBe(`sp:${slug}:staging`)
      expect(rows[0]!.machineDetail).toMatchObject({ entityId })
    })

    // The control-plane rows rolled back; the IdP row did not, because it went
    // through another connection. Asserted rather than assumed — it is the reason
    // afterAll deletes unconditionally, and if it ever stops being true the
    // cleanup above becomes the thing hiding a leak.
    expect(await readSpRow(pool, entityId)).toBeDefined()
  })
})
