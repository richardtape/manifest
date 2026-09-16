import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type pg from 'pg'
import { asc, eq } from 'drizzle-orm'
import { appSpecs, events, users } from '../db/index.js'
import { withRollback } from '../db/testing.js'
import { loadConfig } from '../config.js'
import { createProject } from '../projects/index.js'
import { loadBlueprints } from '../blueprints/index.js'
import { createFakeDriver } from '../runtime/index.js'
import type { Driver, InstanceSpec } from '../runtime/index.js'
import { describeDocker } from '../runtime/testing.js'
import { createAppSecrets, generateMasterKeypair } from '../secrets/index.js'
import { createServiceCredentials } from '../services/index.js'
import {
  createIdpPool,
  createSsoRegistrar,
  deleteSpRow,
  readSpRow,
} from '../sso/index.js'
import { idpDatabaseUrl } from '../sso/testing.js'
import { createRelease, deployRelease, startBuild } from './index.js'
import { disabledAiKeyService, disabledCatalogue } from '../ai/index.js'
import { createEventBus } from '../observability/index.js'

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
const BLUEPRINTS_ROOT = fileURLToPath(new URL('../../../../blueprints', import.meta.url))
const bus = createEventBus()

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
    ai: {
      models: [] as string[],
      budget: { project_monthly_usd: 0, per_user_monthly_usd: 0 },
    },
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
      const build = await startBuild(db, driver, bus, {
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
      const seen: InstanceSpec[] = []
      const recording: Driver = {
        ...driver,
        ensureInstance: (spec) => {
          seen.push(spec)
          return driver.ensureInstance(spec)
        },
      }
      const instance = await deployRelease(
        db,
        recording,
        config,
        {
          secrets: createServiceCredentials(keys, config.masterSecret),
          appSecrets: createAppSecrets(keys),
          blueprints: await loadBlueprints(BLUEPRINTS_ROOT),
          // The real one, bound exactly as `src/index.ts` binds it at boot —
          // including the IdP signing certificate `make up` mints, which
          // `deployRelease` now places in the container at SAML_IDP_CERT_PATH.
          sso: createSsoRegistrar(
            pool,
            keys,
            'https://manifest.internal',
            config.idp.signingCertPath,
            bus,
          ),
          // This app declares no model, so AI is SWITCHED OFF here rather than faked:
          // an AI deploy reaching this test would be refused naming the setting, which
          // is the honest answer for a suite that is not about AI. The live key path is
          // `ai/keys.docker.test.ts`'s; the end-to-end one is Task 16's.
          ai: disabledAiKeyService(),
          catalogue: disabledCatalogue(),
          // Nothing here reads what a retire does — that is `retire`'s own Docker
          // tier and Task 8's — so this records the call and removes nothing.
          retirer: { schedule: () => undefined },
          bus,
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
      // registration, no ACS change: this app has never been registered before. The
      // WHOLE list, in order, since P4b Task 15 records the build and the instance too
      // (sitting 9, finding 172): the registration lands after the build and BEFORE the
      // instance is healthy, which is the ordering this suite exists for.
      const rows = await db
        .select()
        .from(events)
        .where(eq(events.projectId, project.id))
        .orderBy(asc(events.createdAt))
      expect(rows.map((r) => r.type)).toEqual([
        'build.started',
        'build.succeeded',
        'sso.registered',
        'instance.healthy',
      ])
      const registered = rows.find((r) => r.type === 'sso.registered')!
      expect(registered.subject).toBe(`sp:${slug}:staging`)
      expect(registered.machineDetail).toMatchObject({ entityId })

      /**
       * TASK 11: what the app is actually told, from the REAL registration.
       *
       * §8's SAML rows are only correct if they agree with the row the IdP will
       * read — and the value that has to agree byte for byte is the ACS URL,
       * because an assertion is POSTed to whatever the row says. Asserting it
       * against `row!.AssertionConsumerService[0]` rather than against a string
       * built here is the whole point: a test that rebuilds the value cannot see
       * the two producers disagree, which is how this repository lost a day in
       * P3's Session 5.
       */
      const spec = seen.at(-1)!
      expect(spec.env.SAML_ISSUER).toBe(entityId)
      expect(spec.env.SAML_CALLBACK_URL).toBe(row!.AssertionConsumerService[0]?.Location)
      expect(spec.env.SAML_ENVIRONMENT).toBe('LOCAL')
      expect(spec.env.SAML_ENTRY_POINT).toBe(
        'https://idp.manifest.internal/module.php/saml/idp/singleSignOnService',
      )
      expect(spec.env.SESSION_SECRET).toMatch(/^[0-9a-f]{64}$/)

      /**
       * §8's two files, placed by the platform — the rows that named paths
       * nothing created until `InstanceSpec.files` existed.
       *
       * The certificate is the REAL one `make up` minted, read through the
       * registrar, so this fails if the file is missing or empty rather than
       * asserting that a write happened. The key is root-owned and 0440 with the
       * blueprint's gid: §12's `CapDrop: ALL` removes CAP_DAC_OVERRIDE, so
       * ownership is the only thing that can grant the app a read, and
       * root-owned means it cannot rewrite its own key.
       */
      const files = spec.files ?? []
      const cert = files.find((f) => f.path === spec.env.SAML_IDP_CERT_PATH)
      expect(cert, 'no file at the path SAML_IDP_CERT_PATH names').toBeDefined()
      expect(cert!.contents).toContain('BEGIN CERTIFICATE')
      const key = files.find((f) => f.path === spec.env.SAML_PRIVATE_KEY_PATH)
      expect(key, 'no file at the path SAML_PRIVATE_KEY_PATH names').toBeDefined()
      expect(key!.contents).toContain('BEGIN PRIVATE KEY')
      expect(key!.mode).toBe(0o440)
      expect(key!.uid).toBe(0)
      // fixture-node@1's run_as_uid, read from the descriptor rather than typed
      // here — the group is created with the same number by its Dockerfile.
      expect(key!.gid).toBe(10001)
    })

    // The control-plane rows rolled back; the IdP row did not, because it went
    // through another connection. Asserted rather than assumed — it is the reason
    // afterAll deletes unconditionally, and if it ever stops being true the
    // cleanup above becomes the thing hiding a leak.
    expect(await readSpRow(pool, entityId)).toBeDefined()
  })
})
