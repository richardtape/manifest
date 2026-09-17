import { db } from '../db/index.js'
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
import { createRetirer } from '../releases/index.js'
import type { AiKeyService } from '../ai/index.js'
import type { ServerDeps } from './server.js'

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
