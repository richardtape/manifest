import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Driver, ImageRef, ServiceHandle } from '../driver.js'
import { instanceName, serviceName } from '../driver.js'
import { mintSpKeypair, renderSpMetadata, type SpKeypair } from '../../sso/index.js'
import { idpLogin, withRegisteredMetadata, type SamlSpHandle } from '../../sso/testing.js'
import { INJECTED_FILE_PATHS, renderInjection } from '../../spec/index.js'
import { appContainer, serviceContainer } from './names.js'
import { describeDocker } from './docker-tier.js'
import { CA_CERT, REPO_ROOT, dockerDriverForTests, fixtureBareRepo } from './testing.js'

/**
 * `node-ts-mongo@1` — the blueprint faculty applications are generated from —
 * built and deployed for real (P4a Task 12, step 6).
 *
 * IT LIVES IN `runtime/docker/` rather than beside the blueprint's unit tests
 * because §5's boundary rule puts `runtime/docker/testing.ts` out of reach of
 * every other module, and this test needs the real driver.
 *
 * WHAT IT PROVES, and each half was a session's work somewhere in P3 or P4a:
 *
 *  * the blueprint's OWN SKELETON builds — its Dockerfile, its `.npmrc`, its
 *    lockfile through the platform mirror, and §12's scan gate against a
 *    dependency tree that contains `passport-ubcshib` and therefore a deprecated
 *    `passport-saml` with a critical advisory that has no fix;
 *  * §8's variables reach it through `renderInjection` and it reads every one of
 *    them with no fallback — `/` reports the injected database name, so a build
 *    that silently fell back to `app` cannot pass;
 *  * the auth component CONSTRUCTS from those variables and issues a real
 *    AuthnRequest. `configureCwl()` is where the library's traps live: the
 *    CommonJS export shape, and the `cert` IIFE that throws at construction.
 *
 *  * a sign-in is kept in the app's OWN DATABASE (P4c Task 10). This is the one
 *    completed login in this file, and it is here for the session store rather than
 *    for SAML: a redeploy replaces the container, so a session that lives anywhere
 *    but Mongo signs every user out.
 *
 * WHAT IT DELIBERATELY DOES NOT PROVE: that SAML login works in general. That is
 * `sso/login.docker.test.ts` (§16's identity-path tier) and P4a Task 15's
 * acceptance. The SP row here is rendered by `renderSpMetadata` and registered by
 * the test rather than by the real registrar for the same reason — registration is
 * P4a Task 9's and has its own test; what is under test here is the blueprint's
 * consumption of what the platform renders. That a session SURVIVES a redeploy is
 * `make demo-redeploy`'s *nobody was signed out*, which drives two containers.
 */
const run = promisify(execFile)

const SLUG = 'blueprint-ntm'
const KIND = 'staging' as const
const RELEASE = 'r1'
const HOST = `${SLUG}.staging.manifest.internal`
// §11's key gained the INSTANCE (P4c). A constant, for the reason this suite removes
// its containers by name.
const INSTANCE_ID = '7a7a7a7a-0000-4000-8000-000000000007'
const INSTANCE = appContainer(instanceName(SLUG, KIND, RELEASE, INSTANCE_ID))
const SERVICE = serviceName(SLUG, KIND, 'db')

/**
 * §12 stores service credentials and the CALLER resolves them; the driver derives
 * nothing. The database name is deliberately NOT `app` — that is the value every
 * deploy before 2026-09-09 silently fell back to, so a fallback anywhere in this
 * path would be indistinguishable from success if it matched.
 */
const CREDENTIALS = {
  username: 'ntm_blueprint',
  password: 'n'.repeat(32),
  database: 'ntm_blueprint',
}

async function throughEdge(path: string, ...extra: string[]): Promise<string> {
  const { stdout } = await run('docker', [
    'run',
    '--rm',
    '--network',
    'manifest-platform',
    '--dns',
    '10.89.0.53',
    '-v',
    `${CA_CERT}:/ca.crt:ro`,
    'curlimages/curl:8.11.1',
    '--cacert',
    '/ca.crt',
    '-sS',
    '-m',
    '20',
    ...extra,
    `https://${HOST}${path}`,
  ])
  return stdout
}

describeDocker('node-ts-mongo@1 builds, deploys and authenticates (Task 12)', () => {
  let driver: Driver
  let repo: { repoPath: string; commitSha: string }
  let image: ImageRef
  let service: ServiceHandle
  let keypair: SpKeypair

  const spEntity = {
    entityId: `https://manifest.internal/sp/${SLUG}/${KIND}`,
    acsUrl: `https://${HOST}/auth/ubcshib/callback`,
    sloUrl: `https://${HOST}/auth/logout`,
    attributes: ['ubcEduCwlPuid', 'mail', 'givenName', 'sn', 'eduPersonAffiliation'],
  }

  const specFor = () => ({
    name: instanceName(SLUG, KIND, RELEASE, INSTANCE_ID),
    instanceId: INSTANCE_ID,
    hostname: HOST,
    projectSlug: SLUG,
    environmentKind: KIND,
    releaseId: RELEASE,
    image,
    /** THE PLATFORM'S renderer. Nothing in this file adds a variable to it. */
    env: renderInjection({
      resolved: {
        environmentKind: KIND,
        // NOT the blueprint's `default_port` of 3000. If PORT were not really
        // injected the app would listen on 3000 while the health check and the
        // Caddy upstream both point at 8080, and this deploy would fail rather
        // than pass by coincidence.
        port: 8080,
        health: '/healthz',
        resources: { cpu: 0.5, memory: '512Mi', pids: 256, disk: '1Gi' },
        env: [],
        services: [{ type: 'mongo', version: '7', name: 'db' }],
        egressAllow: [],
        classification: 'internal',
        auth: {
          provider: 'cwl',
          attributes: [
            'ubcEduCwlPuid',
            'mail',
            'givenName',
            'sn',
            'eduPersonAffiliation',
          ],
          callback: '/auth/ubcshib/callback',
          logout: '/auth/logout',
        },
        ai: { models: [], budget: { project_monthly_usd: 0, per_user_monthly_usd: 0 } },
      },
      environmentKind: KIND,
      hostname: HOST,
      projectSlug: SLUG,
      idp: {
        entityId: 'https://idp.manifest.internal/idp/shibboleth',
        baseUrl: 'https://idp.manifest.internal',
        spEntityBase: 'https://manifest.internal',
      },
      spEntity,
      secrets: { sessionSecret: 'n'.repeat(48) },
      services: [{ type: 'mongo', endpoint: service.endpoint }],
    }),
    port: 8080,
    healthPath: '/healthz',
    needsAiGateway: false,
    resources: { cpu: 0.5, memoryMi: 512, pids: 256, diskMi: 1024 },
    services: [service],
    egressAllow: [],
    // §8: "Manifest mounts it; the blueprint never fetches it at runtime."
    // Both paths are `spec/injection.ts`'s own constants, so the variable the app
    // is told and the file the platform writes are one value.
    files: [
      {
        path: INJECTED_FILE_PATHS.idpCertificate,
        contents: readFileSync(join(REPO_ROOT, 'infra/idp/cert/server.crt'), 'utf8'),
      },
      {
        path: INJECTED_FILE_PATHS.spPrivateKey,
        contents: keypair.privateKeyPem,
        // 0440 root-owned with the blueprint's own gid. §12's `CapDrop: ALL`
        // takes CAP_DAC_OVERRIDE with it, so ownership is the only thing that can
        // grant the read — and `node-ts-mongo@1`'s Dockerfile creates group 10001
        // from `run_as_uid`, which is what makes this number correct here.
        mode: 0o440,
        gid: 10001,
      },
    ],
  })

  beforeAll(async () => {
    driver = await dockerDriverForTests()
    // THE BLUEPRINT'S OWN SKELETON as the application source. That is what every
    // generated app starts from, so a skeleton that does not build is a blueprint
    // that cannot be used — and no other test would notice.
    repo = fixtureBareRepo(join('/tmp', `mf-${SLUG}.git`), {
      source: join(REPO_ROOT, 'blueprints/node-ts-mongo/skeleton'),
    })
    keypair = await mintSpKeypair({
      projectId: 'project-ntm',
      environmentKind: KIND,
      slug: SLUG,
      entityId: spEntity.entityId,
    })
  }, 180_000)

  afterAll(async () => {
    await driver.destroyInstance(INSTANCE).catch(() => undefined)
    await driver
      .destroyService(serviceContainer(SERVICE), { deleteData: true })
      .catch(() => undefined)
    await run('docker', ['rm', '-f', '-v', `mf-${SLUG}-${KIND}-egress`]).catch(
      () => undefined,
    )
  }, 120_000)

  it("builds the blueprint's own skeleton, through §12's gates", async () => {
    image = await driver.buildImage(repo, {
      blueprintRef: 'node-ts-mongo@1',
      projectSlug: SLUG,
    })
    expect(image.digest).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(image.repository).toContain(`local/${SLUG}`)
  }, 900_000)

  it('deploys it, and it reads every variable the platform injected', async () => {
    service = await driver.ensureService({
      name: SERVICE,
      type: 'mongo',
      version: '7',
      environmentId: 'env-ntm',
      projectSlug: SLUG,
      credentials: CREDENTIALS,
    })
    const handle = await driver.ensureInstance(specFor())
    expect(handle.url).toBe(`https://${HOST}`)

    // The SHAPE of the answer. `{status:'ok'}` alone would pass with no database:
    // `mongo: true` is written only after a successful ping against the bound
    // service, so this is evidence the binding is real.
    const health = JSON.parse(
      await throughEdge(
        '/healthz',
        '--retry',
        '15',
        '--retry-all-errors',
        '--retry-delay',
        '2',
      ),
    ) as Record<string, unknown>
    expect(health).toEqual({ status: 'ok', mongo: true })

    /**
     * `database` is `MONGODB_DB_NAME` as the app read it, and the skeleton has NO
     * fallback for it. `ntm_blueprint` is what the credentials were minted for;
     * `app` is what every deploy before 2026-09-09 silently used instead.
     */
    expect(JSON.parse(await throughEdge('/'))).toEqual({
      app: SLUG,
      env: KIND,
      url: `https://${HOST}`,
      auth: 'cwl',
      database: CREDENTIALS.database,
      // P4b Task 10: `server.js` imports the AI component for EVERY app, so a boot
      // at all is the evidence that the toolkit links on the image's Node from the
      // mirror's closure. `false`, because this deploy declared no models and was
      // injected no AI rows — the platform's signal, not a manifest read.
      ai: false,
    })
  }, 300_000)

  it('issues a real AuthnRequest from the injected SAML block', async () => {
    // 302 to the Manifest IdP's 2.x SSO endpoint, carrying a SAMLRequest. This is
    // the whole auth component working: the strategy constructed (the `cert` IIFE
    // did not throw), and every endpoint came from §8 rather than from
    // UBC_CONFIG's defaults — whose LOCAL entry is a SimpleSAMLphp 1.x path that
    // 404s, and whose STAGING entry is real UBC infrastructure.
    const out = await throughEdge(
      '/login',
      '-o',
      '/dev/null',
      '-w',
      '%{http_code} %{redirect_url}',
    )
    const [code, location = ''] = out.trim().split(' ')
    expect(code).toBe('302')
    expect(location).toContain(
      'https://idp.manifest.internal/module.php/saml/idp/singleSignOnService',
    )
    expect(location).toContain('SAMLRequest=')
  }, 120_000)

  /**
   * What the app's own database holds, read from INSIDE the service container with
   * the credentials the app was bound with. Counted rather than listed, so no session
   * contents — which carry a person's attributes — reach the test log.
   */
  async function sessionsInDatabase(): Promise<{ total: number; signedIn: number }> {
    const { stdout } = await run('docker', [
      'exec',
      serviceContainer(SERVICE),
      'mongosh',
      '--quiet',
      '-u',
      CREDENTIALS.username,
      '-p',
      CREDENTIALS.password,
      '--authenticationDatabase',
      'admin',
      '--eval',
      `const c = db.getSiblingDB('${CREDENTIALS.database}').sessions;` +
        `print(JSON.stringify({ total: c.countDocuments(),` +
        ` signedIn: c.countDocuments({ session: /"ubcEduCwlPuid":"stu000001"/ }) }))`,
    ])
    return JSON.parse(stdout.trim().split('\n').at(-1) ?? '{}') as {
      total: number
      signedIn: number
    }
  }

  it("writes a sign-in to the app's OWN DATABASE, not to the container's memory", async () => {
    // The student is not signed in anywhere yet: nothing before this test completes a
    // login, and `saveUninitialized: false` means an anonymous request stores nothing.
    // Asserted, so the count below cannot be a document some earlier request left.
    expect((await sessionsInDatabase()).signedIn).toBe(0)

    // A real CWL login against the deployed blueprint app, through the edge, with the
    // app's SP row rendered by the platform's own renderer and signed by the keypair
    // whose private half the platform placed in the container.
    const handle: SamlSpHandle = {
      hostname: HOST,
      idpBaseUrl: 'https://idp.manifest.internal',
      row: { entityId: spEntity.entityId, acsUrl: spEntity.acsUrl, attributes: [] },
      instance: INSTANCE,
      stop: () => Promise.resolve(),
    }
    const login = await withRegisteredMetadata(
      spEntity.entityId,
      renderSpMetadata(spEntity, keypair),
      () => idpLogin(handle, { user: 'student', password: 'student' }),
    )
    // `status` is the app's `/me` with the login's cookie: 200 only for a session the
    // app can read back, which is the whole login working.
    expect(login.status).toBe(200)

    // THE EVIDENCE IS IN MONGO, NOT IN THE COOKIE. `express-session` writes a document
    // only when it has a store, and this one carries the person the IdP asserted.
    const after = await sessionsInDatabase()
    expect(after.signedIn).toBeGreaterThanOrEqual(1)
  }, 600_000)
})
