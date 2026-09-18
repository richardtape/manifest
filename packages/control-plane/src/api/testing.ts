import { db, type Db } from '../db/index.js'
import { loadConfig } from '../config.js'
import { testIssuer } from '../runtime/testing.js'
import { createFakeDriver } from '../runtime/index.js'
import { createLocalSourceDriver } from '../source/index.js'
import { loadBlueprints } from '../blueprints/index.js'
import { createServiceCredentials } from '../services/index.js'
import { createAppSecrets, generateMasterKeypair } from '../secrets/index.js'
import { SESSION_COOKIE, createSamlSp } from '../identity/index.js'
import {
  ensureTestUser,
  testSamlIdp,
  testSessionCookies,
  type TestIdp,
  type TestUserPuid,
} from '../identity/testing.js'
import {
  controlPlaneSpEntity,
  describeKeypair,
  mintSpKeypair,
  type SpKeypair,
} from '../sso/index.js'
import { declaredCatalogue } from '../ai/testing.js'
import { createEventBus } from '../observability/index.js'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { createBuildRunner, createRetirer } from '../releases/index.js'
import type { AiKeyService } from '../ai/index.js'
import type { FastifyInstance } from 'fastify'
import { buildServer, type ServerDeps } from './server.js'
import { resetDatabase } from '../db/testing.js'
import { addMember } from '../projects/index.js'
import { testReservedLabels } from '../projects/testing.js'
import {
  createKeyedRateLimiter,
  createRateLimiter,
  TOKEN_RATE_WINDOW_MS,
} from './rate-limit.js'

/**
 * THROWS RATHER THAN MINTING, for the reason `sso` does below. Every app the API suite
 * deploys declares no model, so nothing here should ever reach the gateway — and this
 * tier has no LiteLLM to reach. `enabled: true` to match `declaredCatalogue()`, so an
 * AI deploy that does arrive here fails loudly at the mint rather than quietly at a
 * guard.
 */
function testAiKeyService(): AiKeyService {
  return {
    enabled: true,
    mintAppKey: () => {
      throw new Error(
        'the API test harness has no LiteLLM: an app in this tier declared ai.models. ' +
          'Fake the key service as releases.test.ts does, or move the test to the ' +
          'Docker tier.',
      )
    },
    discardAppKey: () => {
      throw new Error('the API test harness has no LiteLLM to discard a key from')
    },
    storeInstanceKey: () => {
      throw new Error('the API test harness has no LiteLLM: nothing here mints a key')
    },
    // The two REVOKES answer rather than throwing, unlike everything above: a retire
    // (P4c) runs for every app, and no app in this tier declares a model — so a retire
    // here reaches a key that was never minted, which is not a failure.
    revokeInstanceKey: () => Promise.resolve(false),
    revokeLegacyAppKey: () => Promise.resolve(false),
  }
}

/**
 * Blueprints live at the repo root. Resolved from this file rather than from the
 * working directory: `pnpm --filter … test` runs with the package as cwd, but
 * `pnpm test` from the repo root — the command CLAUDE.md requires before a commit
 * — does not, and a cwd-relative path made every API test ENOENT there.
 */
const BLUEPRINTS_ROOT = fileURLToPath(new URL('../../../../blueprints', import.meta.url))

/**
 * One root for every repository directory the API tests create, removed wholesale
 * by the global teardown.
 *
 * `testDeps` is called once per test, and it used to mkdtemp straight into TMPDIR
 * with nothing ever removing the result: **944 directories** accumulated in a single
 * afternoon, and the lifecycle test's 1000 ms budget drifted from ~300 ms to ~820 ms
 * as they piled up. Both halves matter — the slow drift would eventually fail Task
 * 21's acceptance for no reason a reader could see, and leaving litter on the
 * machine is a non-negotiable in CLAUDE.md.
 *
 * Derived from tmpdir() rather than passed in, because vitest.global-setup.ts runs
 * in a different process and computes the identical path.
 */
export const TEST_REPOS_ROOT = join(tmpdir(), 'manifest-test-repos')

/**
 * A session for one of §16's four identities, in the shape `app.inject` wants.
 *
 * What every API test used `POST /auth/dev-login` for. Two steps, both of which
 * that route also did: the §6 `User` row has to exist, because a session carries
 * a `userId` and every authorization check resolves it; and the cookie has to be
 * signed with the secret THIS server was built with, which is why it takes
 * `deps` rather than a bare string.
 */
export async function loginAs(
  deps: ServerDeps,
  puid: TestUserPuid,
): Promise<Record<typeof SESSION_COOKIE, string>> {
  const user = await ensureTestUser(deps.db, puid)
  return testSessionCookies(user, deps.config.sessionSecret)
}

/**
 * What every mutation a session makes must carry: D23.6's Idempotency-Key and, since P5a
 * Task 4, §20's Origin — the configured one, read from `deps` rather than restated, so a
 * test that moves the origin moves what it sends.
 */
export function mutationHeaders(deps: ServerDeps): {
  'idempotency-key': string
  origin: string
} {
  return { 'idempotency-key': randomUUID(), origin: deps.config.sp.origin }
}

/**
 * A `POST /v1/projects` body (P5a Task 11). The audience is REQUIRED — §24 asks it at
 * creation — so every test that creates a project states one; `solo`/`steady` because no
 * test here depends on it.
 */
export function projectBody(
  slug: string,
  options: { blueprint?: string; starter?: string } = {},
): Record<string, unknown> {
  return {
    slug,
    blueprint: options.blueprint ?? 'fixture-node@1',
    ...(options.starter === undefined ? {} : { starter: options.starter }),
    audience: { scale: 'solo', burst: 'steady' },
  }
}

/**
 * The control plane's own SP, and the in-process IdP that can sign for it.
 *
 * Minted ONCE per test process for the same reason `testSamlIdp` is: two
 * RSA-4096 keypairs per test would dominate the unit tier's runtime. Sharing
 * them across tests is safe here in a way sharing a MASTER key is not — these
 * are the platform's own identity rather than an app's secrets, so there is no
 * isolation property to lose, and every test still gets its own `SamlSp`
 * instance and therefore its own in-memory request-ID cache.
 */
let testSp: Promise<{ idp: TestIdp; keypair: SpKeypair }> | undefined

async function testSamlMaterial(): Promise<{ idp: TestIdp; keypair: SpKeypair }> {
  testSp ??= (async () => {
    const idp = await testSamlIdp()
    const minted = await mintSpKeypair({
      projectId: '00000000-0000-0000-0000-000000000000',
      environmentKind: 'staging',
      slug: 'test-control-plane',
      entityId: 'https://manifest.internal/sp/manifest-control-plane/platform',
    })
    return { idp, keypair: describeKeypair(minted.privateKeyPem, minted.certificatePem) }
  })()
  return testSp
}

export async function testDeps(): Promise<ServerDeps> {
  await mkdir(TEST_REPOS_ROOT, { recursive: true })
  const reposRoot = await mkdtemp(join(TEST_REPOS_ROOT, 'run-'))
  const issuer = testIssuer()
  const config = loadConfig({
    MANIFEST_ENV: 'development',
    MANIFEST_DATABASE_URL: process.env.MANIFEST_DATABASE_URL!,
    MANIFEST_IDP_DATABASE_URL: process.env.MANIFEST_IDP_DATABASE_URL!,
    MANIFEST_SESSION_SECRET: 'k'.repeat(32),
    MANIFEST_BLUEPRINTS_ROOT: BLUEPRINTS_ROOT,
    MANIFEST_REPOS_ROOT: reposRoot,
    // The GENERATED test issuer, not infra/registry-auth/ — the suite must not
    // depend on `make seed` having run. See runtime/docker/testing.ts for why it
    // is generated rather than committed.
    MANIFEST_REGISTRY_TOKEN_KEY: issuer.keyPath,
    MANIFEST_REGISTRY_TOKEN_CERT: issuer.certPath,
    MANIFEST_BUILD_CREDENTIAL_SECRET: 'c'.repeat(32),
  })
  const masterKeypair = await generateMasterKeypair()
  const { idp, keypair } = await testSamlMaterial()
  // Hoisted, because the retirer below is built FROM them: one driver, one bus and one
  // key service per server, shared by the routes and by the background work.
  const driver = createFakeDriver()
  const bus = createEventBus()
  const appSecrets = createAppSecrets(masterKeypair)
  const ai = testAiKeyService()
  return {
    db,
    config,
    driver,
    source: createLocalSourceDriver(reposRoot),
    blueprints: await loadBlueprints(config.blueprintsRoot),
    // infra/litellm/config.yaml through the REAL projection, not a list written out
    // here — a harness copy of the catalogue is the second producer Task 6 deleted
    // from the route. The unit tier has no LiteLLM; the Docker tier compares this
    // file with the live proxy's answer.
    catalogue: declaredCatalogue(),
    // The REAL bus, one per server: a test subscribes to exactly what its routes publish.
    bus,
    /**
     * A REAL RETIRER (P4c Task 8), not a stub. A stub would let a deploy that never
     * schedules a retire pass every API test, and the schedule is half of what this
     * task builds. `drainMs: 0` because the fake driver counts nothing in flight.
     */
    retirer: createRetirer({ db, driver, ai, appSecrets, bus, drainMs: 0 }),
    /**
     * A REAL RUNNER (P5a Task 13), over the same driver and bus: a build answers 202 and
     * runs in the background, so a test that reads a build's end awaits `builds.idle()`.
     * A test that replaces `driver` must replace this too, or its builds run on this one.
     */
    builds: createBuildRunner({ db, driver, bus }),
    reservedLabels: await testReservedLabels(),
    // The production limit, so a test of the limit tests the number the boot uses.
    limits: {
      slugCheck: createRateLimiter({ limit: 60, windowMs: 60_000 }),
      tokens: createKeyedRateLimiter({ windowMs: TOKEN_RATE_WINDOW_MS }),
    },
    ai,
    // A keypair per call, not a shared one: two tests sharing a master key can
    // read each other's secrets, and that is the test-isolation shape that made
    // P2's suite depend on the order Vitest happened to pick.
    secrets: createServiceCredentials(masterKeypair, config.masterSecret),
    appSecrets,
    // THROWS RATHER THAN RETURNING A STUB. Every app the API suite deploys is
    // `fixture-node`, which declares `auth.provider: none`, so nothing here should
    // ever register an SP — and if that changes, this says so loudly instead of
    // letting a silent no-op stand in for a registration that never happened.
    // Registering for real would need the IdP container, which the unit tier
    // deliberately does not have.
    sso: {
      registerServiceProvider: () => {
        throw new Error(
          'the API test harness has no IdP: an app in this tier registered a Service ' +
            'Provider, which means its spec declares auth.provider: cwl. Move that ' +
            'test to the Docker tier, or use a fixture with no sign-on.',
        )
      },
      // Same reason. A harness that quietly returns a certificate would let a
      // CWL deploy get all the way to `ensureInstance` with no IdP behind it.
      idpSigningCertificate: () => {
        throw new Error('the API test harness has no IdP signing certificate')
      },
    },
    /**
     * The REAL `createSamlSp`, pointed at an IdP this process holds the key to.
     *
     * Not a stub. A stub `validate()` would make the callback route's refusals —
     * a wrong signature, a wrong audience — properties of the harness rather than
     * of the platform, and those two refusals are the whole reason the route can
     * be trusted to mint a session at all. The entity is `controlPlaneSpEntity`'s
     * too, so the audience the SP checks is the one `registerControlPlaneSp`
     * would have written into the IdP's row.
     */
    samlSp: createSamlSp({
      entity: controlPlaneSpEntity({
        entityBase: 'https://manifest.internal',
        // THE CONFIGURED ORIGIN, not a second statement of it (P5a Task 3): the ACS this
        // SP checks must be the one the running control plane registers.
        origin: config.sp.origin,
      }),
      idpBaseUrl: 'https://idp.test.manifest.internal',
      idpEntityId: idp.entityId,
      idpCertificatePem: idp.certificatePem,
      privateKeyPem: keypair.privateKeyPem,
      certificatePem: keypair.certificatePem,
    }),
  }
}

/**
 * A server, a project with its three environments, and a SECOND project owned by
 * somebody else — the shape almost every token test needs (P5b Task 4).
 *
 * Written here, in sitting 3, rather than in Task 3 where the plan first described it:
 * a fixture whose first caller is two sittings away is a fixture nothing has exercised,
 * which is the warning P5a sitting 10 finding 6 paid for.
 *
 * NOT `withProject` — `db/testing.ts` already exports one of those, with a different
 * shape (`(tx, { projectId, ownerId })`), and several test files import from both
 * modules. Two fixtures with one name is how a reader ends up calling the wrong one.
 *
 * It resets the database first, because these writes go through a real server on the
 * shared connection rather than a transaction anyone could roll back, and `projects_slug_key`
 * is unique. It drains the build runner before closing: a build started by the callback
 * runs in the background (R6), and closing under one fails it for a reason no test asked
 * about.
 */
export interface TestProject {
  app: FastifyInstance
  deps: ServerDeps
  db: Db
  /** The OWNER's `users.id`: `bio_prof`, who created the project and is therefore its owner (§13). */
  userId: string
  ownerCookies: Record<string, string>
  projectId: string
  /** A SECOND project, owned by `unrelated_user` — what Decision 3's scope rule is tested against. */
  otherProjectId: string
  /** The commit its seeded manifest was validated at — what a build takes. */
  commitSha: string
  stagingEnvironmentId: string
  productionEnvironmentId: string
}

export async function withProjectServer(
  fn: (ctx: TestProject) => Promise<void>,
): Promise<void> {
  await resetDatabase()
  const deps = await testDeps()
  const app = await buildServer(deps)
  try {
    const ownerCookies = await loginAs(deps, 'bio_prof')
    const owner = await ensureTestUser(deps.db, 'bio_prof')
    // THROUGH THE ROUTE, not through `createProject`: the environments, the repository
    // and the spec all come from it, and a fixture that wrote the rows by hand would be
    // a project no deploy could use.
    const created = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      payload: projectBody(`fixture-${randomUUID().slice(0, 8)}`),
      cookies: ownerCookies,
      headers: mutationHeaders(deps),
    })
    if (created.statusCode !== 201) {
      throw new Error(`the fixture project was not created: ${created.body}`)
    }
    const project = created.json() as {
      id: string
      spec: { commitSha: string }
      environments: { id: string; kind: string }[]
    }
    const otherCookies = await loginAs(deps, 'unrelated_user')
    const other = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      payload: projectBody(`other-${randomUUID().slice(0, 8)}`),
      cookies: otherCookies,
      headers: mutationHeaders(deps),
    })
    if (other.statusCode !== 201) {
      throw new Error(`the fixture's second project was not created: ${other.body}`)
    }
    const environmentId = (kind: string): string => {
      const found = project.environments.find((e) => e.kind === kind)
      if (found === undefined) throw new Error(`the fixture project has no ${kind}`)
      return found.id
    }
    await fn({
      app,
      deps,
      db: deps.db,
      userId: owner.id,
      ownerCookies,
      projectId: project.id,
      otherProjectId: (other.json() as { id: string }).id,
      commitSha: project.spec.commitSha,
      stagingEnvironmentId: environmentId('staging'),
      productionEnvironmentId: environmentId('production'),
    })
  } finally {
    await deps.builds.idle()
    await app.close()
  }
}

/**
 * A session for `puid`, added to `ctx`'s project with `role` first when one is given.
 *
 * With NO role the person is a STRANGER to the project, which is what the 404-versus-403
 * distinction is tested with — so the argument is deliberately optional rather than
 * defaulted.
 */
export async function sessionFor(
  ctx: TestProject,
  puid: TestUserPuid,
  role?: 'owner' | 'collaborator',
): Promise<Record<string, string>> {
  const cookies = await loginAs(ctx.deps, puid)
  if (role !== undefined) {
    const user = await ensureTestUser(ctx.deps.db, puid)
    await addMember(ctx.deps.db, ctx.projectId, user.id, role)
  }
  return cookies
}

/**
 * A refusal's STATUS AND CODE TOGETHER, so neither can hide behind the other.
 *
 * Asserted separately, the status fires first and the code assertion below it is never
 * reached — which matters because the two can disagree: `404 ROUTE_NOT_FOUND` (no such
 * route) satisfies a status-only 404 exactly as `404 NOT_FOUND` (the authorization
 * answer) does, and P5a sitting 6 paid for the difference. Sitting 3's F13 then measured
 * THREE of its own negative controls answering `403` for the wrong reason.
 *
 * Here rather than local to one test file since P5b Task 6: `credential.test.ts` wrote it
 * first, `delegation.test.ts` needs the same shape, and Task 7 will be the third — and a
 * helper copied three times drifts three ways. The same shape `api/authz-contract.ts`
 * uses.
 */
export function refusal(res: { statusCode: number; body: string }): {
  status: number
  code: unknown
} {
  let code: unknown
  try {
    code = (JSON.parse(res.body) as { error?: { code?: unknown } }).error?.code
  } catch {
    code = undefined
  }
  return { status: res.statusCode, code }
}
