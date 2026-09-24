import { db, type Db } from '../db/index.js'
import { loadConfig } from '../config.js'
import { testIssuer } from '../runtime/testing.js'
import { createFakeDriver } from '../runtime/index.js'
import { createLocalSourceDriver } from '../source/index.js'
import { loadBlueprints } from '../blueprints/index.js'
import { createServiceCredentials } from '../services/index.js'
import { createAppSecrets, generateMasterKeypair } from '../secrets/index.js'
import {
  SESSION_COOKIE,
  createSamlSp,
  issueSession,
  signSession,
  stepUpSession,
} from '../identity/index.js'
import {
  ensureTestUser,
  testSamlIdp,
  testSessionCookies,
  type TestIdp,
  type TestUserPuid,
} from '../identity/testing.js'
import {
  controlPlaneSpEntity,
  deriveSpEntity,
  describeKeypair,
  mintSpKeypair,
  type SpEntity,
  type SpKeypair,
} from '../sso/index.js'
import { declaredCatalogue } from '../ai/testing.js'
import { createEventBus, makeRedactor, publishEvent } from '../observability/index.js'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { createBuildRunner, createRetirer } from '../releases/index.js'
import { NullReviewer } from '../launch/index.js'
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
  options: {
    /**
     * §20's step-up claim, already stamped (P6a Task 9). **THE ONE PLACE A TEST GETS
     * ONE**, so the day step-up changes shape there is one line to change rather than
     * one per caller.
     *
     * **A test passes this only when the step-up is NOT what it is testing** — a
     * fixture's setup call, or a route whose subject is something else. The
     * authorization matrix deliberately does NOT: its sessions are ordinary, so a row
     * reading `pass` on a guarded route would be a row testing a guard that is not
     * there. `auth.test.ts` is where the claim is earned through a real SAML round trip,
     * and `step-up-guarded.test.ts` proves nothing else can set it on a real cookie.
     */
    steppedUp?: boolean
  } = {},
): Promise<Record<typeof SESSION_COOKIE, string>> {
  const user = await ensureTestUser(deps.db, puid)
  if (options.steppedUp !== true)
    return testSessionCookies(user, deps.config.sessionSecret)
  return {
    [SESSION_COOKIE]: signSession(
      stepUpSession(issueSession(user)),
      deps.config.sessionSecret,
    ),
  }
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
 * Commits `manifest.yaml` to a project's repository and validates it THROUGH THE ROUTE
 * (`POST /v1/projects/{id}/spec`), which is the only way a spec row is written — so the
 * next build, and the sensitive diff the route reports, both see it.
 *
 * Created by P6b Task 3, whose route tests are its first caller (sitting 1's F8); Task 5's
 * D9.2 tests reuse it, on a project `launchedProject` below has already launched. It THROWS rather than asserting, like `withProjectServer`,
 * because this file is a fixture and not a test. `valid: false` is for a test whose subject
 * is an invalid commit; everything else takes the default and is told loudly if the
 * manifest it wrote does not validate.
 */
export async function commitManifest(
  ctx: {
    app: FastifyInstance
    deps: ServerDeps
    cookies: Record<string, string>
    project: { id: string; slug: string }
  },
  yamlLines: readonly string[],
  message: string,
  options: { valid?: boolean } = {},
): Promise<{
  appSpecId: string
  commitSha: string
  valid: boolean
  sensitiveDiff: { sensitive: boolean; fields: string[] }
}> {
  await ctx.deps.source.commitFiles(
    ctx.deps.source.repositoryFor(ctx.project.slug),
    { 'manifest.yaml': [...yamlLines, ''].join('\n') },
    message,
  )
  const res = await ctx.app.inject({
    method: 'POST',
    url: `/v1/projects/${ctx.project.id}/spec`,
    payload: {},
    cookies: ctx.cookies,
    headers: mutationHeaders(ctx.deps),
  })
  if (res.statusCode !== 201) {
    throw new Error(`validating manifest.yaml answered ${res.statusCode}: ${res.body}`)
  }
  const body = res.json() as Awaited<ReturnType<typeof commitManifest>>
  const expected = options.valid ?? true
  if (body.valid !== expected) {
    throw new Error(
      `manifest.yaml validated ${body.valid}, expected ${expected}: ${res.body}`,
    )
  }
  return body
}

/**
 * THE DELIVERY FIXTURES, from a bare project to a LAUNCHED one (P6b Task 4) — moved here
 * from `delivery.test.ts` rather than copied, because `subsequent-releases.test.ts` (Task 5
 * onward) starts every case from `launchedProject`, and two copies of a path to production
 * would drift the first time the path changed (Task 9 adds a preview to its approval, and
 * changes it here, once). Each one THROWS rather than asserting, like every helper in this
 * file: a fixture that fails is a broken fixture, and the message says which call.
 */

/** A project created through the route by `puid`. */
export async function projectFor(puid: TestUserPuid, slug = 'chem-labs') {
  const deps = await testDeps()
  const app = await buildServer(deps)
  const cookies = await loginAs(deps, puid)
  const created = await app.inject({
    method: 'POST',
    url: '/v1/projects',
    payload: projectBody(slug),
    cookies,
    headers: mutationHeaders(deps),
  })
  if (created.statusCode !== 201)
    throw new Error(`creating '${slug}' answered ${created.statusCode}: ${created.body}`)
  return { app, deps, cookies, project: created.json() }
}

/**
 * A project with one SUCCEEDED build (P5a Task 14). `env` is written into its
 * `manifest.yaml` and pushed, so the release below resolves a config with an env var
 * whose VALUE must not travel with it — the property Decision 22 exists for cannot be
 * tested against a manifest that declares none.
 */
export async function builtProject(
  slug: string,
  options: { env?: { name: string; value: string }[] } = {},
) {
  // The slug reaches BOTH halves: the project this creates and the repository the manifest
  // below is committed to. Passing it to only one is a fixture that works for exactly one
  // name and fails confusingly for any other.
  const { app, deps, cookies, project } = await projectFor('bio_prof', slug)
  if (options.env !== undefined) {
    await deps.source.commitFiles(
      deps.source.repositoryFor(slug),
      {
        'manifest.yaml': [
          'manifest: 1',
          `name: ${slug}`,
          'blueprint: fixture-node@1',
          'runtime:',
          '  port: 3000',
          '  health: /healthz',
          'env:',
          ...options.env.map((e) => `  - { name: ${e.name}, value: ${e.value} }`),
          '',
        ].join('\n'),
      },
      'feat: an env var whose value is the app’s, not the contract’s',
    )
    const pushed = await app.inject({
      method: 'POST',
      url: `/v1/projects/${project.id}/spec`,
      payload: {},
      cookies,
      headers: mutationHeaders(deps),
    })
    if (pushed.json().valid !== true)
      throw new Error(`the manifest with env did not validate: ${pushed.body}`)
  }
  const started = await app.inject({
    method: 'POST',
    url: `/v1/projects/${project.id}/builds`,
    payload: {},
    cookies,
    headers: mutationHeaders(deps),
  })
  if (started.statusCode !== 202)
    throw new Error(`starting a build answered ${started.statusCode}: ${started.body}`)
  await deps.builds.idle()
  const build = (
    await app.inject({ method: 'GET', url: `/v1/builds/${started.json().id}`, cookies })
  ).json()
  if (build.status !== 'succeeded')
    throw new Error(`the build did not succeed: ${JSON.stringify(build)}`)
  return { app, deps, cookies, project, build }
}

/** The same, released — and its staging environment, which is what a deploy names. */
export async function releasedProject(
  slug: string,
  options: { env?: { name: string; value: string }[] } = {},
) {
  const built = await builtProject(slug, options)
  const created = await built.app.inject({
    method: 'POST',
    url: `/v1/projects/${built.project.id}/releases`,
    payload: { buildId: built.build.id },
    cookies: built.cookies,
    headers: mutationHeaders(built.deps),
  })
  if (created.statusCode !== 201)
    throw new Error(`creating a release answered ${created.statusCode}: ${created.body}`)
  const staging = built.project.environments.find(
    (e: { kind: string }) => e.kind === 'staging',
  )
  const production = built.project.environments.find(
    (e: { kind: string }) => e.kind === 'production',
  )
  return { ...built, release: created.json(), staging, production }
}

/**
 * RELEASED, SERVING STAGING, AND EVERY BLOCKING ITEM MET — everything a first launch needs
 * except the production deploy itself (P6b Task 4). The body of `delivery.test.ts`'s
 * positive control for the gate, moved: that test reads the checklist between this and the
 * deploy, which is why the helper stops here and `launchedProject` is this plus one call.
 *
 * `admin` is a STEPPED-UP administrator's cookie: approving is guarded by §20's step-up.
 * The app signs nobody in (`fixture-node@1` declares `auth_providers: [none]`), so there
 * is no IAM registration to record and nothing to rehearse — both items say so.
 */
export async function approvedProject(slug: string) {
  const released = await releasedProject(slug)
  const { app, deps, cookies, project, release, staging } = released
  // 1. SOMETHING MUST BE SERVING STAGING: production runs exactly what staging ran, so
  //    the checklist has no candidate at all until this deploy (§13).
  const toStaging = await app.inject({
    method: 'POST',
    url: `/v1/environments/${staging.id}/deploy`,
    payload: { releaseId: release.id },
    cookies,
    headers: mutationHeaders(deps),
  })
  if (toStaging.statusCode !== 200)
    throw new Error(
      `the staging deploy answered ${toStaging.statusCode}: ${toStaging.body}`,
    )

  // 2. An administrator records what the Privacy Office said, along §9's arrows. There
  //    is no IAM registration to record: this app signs nobody in.
  const admin = await loginAs(deps, 'platform_admin', { steppedUp: true })
  for (const state of ['submitted', 'approved'] as const) {
    const recorded = await app.inject({
      method: 'POST',
      url: `/v1/projects/${project.id}/launch-records/privacy-assessment`,
      payload: { state, reviewer: 'K. Privacy', externalTicketRef: 'PIA-DELIVERY-1' },
      cookies: admin,
      headers: mutationHeaders(deps),
    })
    if (recorded.statusCode !== 200)
      throw new Error(
        `recording the PIA ${state} answered ${recorded.statusCode}: ${recorded.body}`,
      )
  }

  // 3. And approves the release, which binds the build's digest (§13, §20).
  const approved = await app.inject({
    method: 'POST',
    url: `/v1/releases/${release.id}/approve`,
    payload: { reason: 'the checklist is met and the diff is what we expect' },
    cookies: admin,
    headers: mutationHeaders(deps),
  })
  if (approved.statusCode !== 201)
    throw new Error(
      `approving the release answered ${approved.statusCode}: ${approved.body}`,
    )
  return { ...released, admin }
}

/**
 * LAUNCHED: `approvedProject`, then deployed to production by a stepped-up owner — so the
 * project's `launched_at` is set by the deploy that made it true (P6b Decision 1), exactly as
 * a person's launch sets it. `owner` is that stepped-up cookie. **Every project this returns
 * has launched**, so a test of D9's FIRST clause must build its project without it.
 */
export async function launchedProject(slug: string) {
  const approved = await approvedProject(slug)
  const { app, deps, release, production } = approved
  const owner = await loginAs(deps, 'bio_prof', { steppedUp: true })
  const deployed = await app.inject({
    method: 'POST',
    url: `/v1/environments/${production.id}/deploy`,
    payload: { releaseId: release.id },
    cookies: owner,
    headers: mutationHeaders(deps),
  })
  if (deployed.statusCode !== 200 || deployed.json().state !== 'healthy')
    throw new Error(
      `the production deploy answered ${deployed.statusCode}: ${deployed.body}`,
    )
  return { ...approved, owner, launched: deployed.json() }
}

/**
 * THE TWO LABELLED FAKES A CWL APP NEEDS IN THIS TIER (P6b Task 7), and nowhere else.
 *
 * `testDeps()` refuses a CWL deploy and a rehearsal ON PURPOSE (its `sso` and `signIn` throw,
 * *"move that test to the Docker tier"*), because a harness that quietly answered would make
 * a registration and a sign-in properties of the fake. **That stays true for every test but
 * these**: the subject of `launchedCwlProject`'s callers is D9.2's GATE over a launched CWL
 * app — what the checklist and the deploy do with a registration UBC recorded — never the
 * registration or the sign-in themselves. The real IdP is driven by
 * `releases/production.docker.test.ts` and by P6b's acceptance, which is where a claim about
 * either belongs.
 *
 * The registrar DERIVES the entity with the real `deriveSpEntity` (so the ACS, SLO and
 * attributes are the platform's own derivation, not the fake's) and publishes the same
 * `sso.registered` event the real one does, because `runRehearsal` reads the registration
 * back off that event. The probe answers a passing sign-in releasing EXACTLY what was
 * registered at the ACS it is asked about — and nothing at all for an ACS nobody registered.
 */
export function cwlFakes(deps: ServerDeps): Pick<ServerDeps, 'sso' | 'signIn'> {
  const registered = new Map<string, SpEntity>()
  return {
    sso: {
      registerServiceProvider: async (db, input) => {
        const entity = deriveSpEntity({
          ...input,
          entityBase: deps.config.idp.spEntityBase,
        })
        registered.set(entity.acsUrl, entity)
        const { keypair } = await testSamlMaterial()
        await publishEvent(
          db,
          deps.bus,
          {
            projectId: input.projectId,
            subject: `sp:${input.slug}:${input.environmentKind}`,
            type: 'sso.registered',
            machineDetail: {
              entityId: entity.entityId,
              acsUrl: entity.acsUrl,
              attributes: entity.attributes,
              certificateFingerprint: keypair.fingerprint,
              changed: true,
            },
            humanMessage: `Single sign-on was set up for ${input.slug} in ${input.environmentKind} (the unit tier's labelled fake).`,
          },
          makeRedactor([]),
        )
        return { entity, keypair, changed: true }
      },
      idpSigningCertificate: async () => (await testSamlMaterial()).idp.certificatePem,
    },
    signIn: {
      signIn: (input) => {
        const entity = registered.get(input.acsUrl)
        return Promise.resolve(
          entity === undefined
            ? {
                status: null,
                attributesReleased: [],
                reason: `the unit tier's fake IdP holds no registration for ${input.acsUrl}`,
              }
            : {
                status: 302,
                attributesReleased: [...entity.attributes],
                reason:
                  'the unit tier’s labelled fake released exactly what was registered',
              },
        )
      },
    },
  }
}

/** The CWL attributes `launchedCwlProject` launches with — a subset of the whitelist (§7). */
export const CWL_LAUNCH_ATTRIBUTES = ['ubcEduCwlPuid', 'mail'] as const

/**
 * A minimal CWL manifest for `node-ts-mongo@1` — the one blueprint in this tier whose
 * descriptor offers `auth_providers: [cwl]` (`fixture-node@1` offers `none` only). No
 * services and no models, so nothing here reaches a database or LiteLLM.
 */
export const cwlManifest = (
  slug: string,
  attributes: readonly string[],
  extra: readonly string[] = [],
): string[] => [
  'manifest: 1',
  `name: ${slug}`,
  'blueprint: node-ts-mongo@1',
  'runtime:',
  '  port: 3000',
  '  health: /healthz',
  'auth:',
  '  provider: cwl',
  `  attributes: [${attributes.join(', ')}]`,
  ...extra,
]

/**
 * A LAUNCHED CWL APP, every step through the ROUTES a person uses (P6b Task 7): created,
 * a CWL manifest committed, built, released and deployed to staging; UBC IAM's registration
 * recorded `submitted` then `active` with exactly the values the platform derives for its
 * production hostname; the PIA approved; D21's rehearsal run and passed; the release approved
 * by a stepped-up administrator; and deployed to production by the stepped-up owner — which
 * is what records the launch (Decision 1). Over `cwlFakes`, and for the reason given there.
 *
 * Returns what `launchedProject` does, plus `registration` — the values recorded, so a test
 * that files a change request re-sends them as UBC has them.
 */
export async function launchedCwlProject(slug: string) {
  const base = await testDeps()
  const deps: ServerDeps = { ...base, ...cwlFakes(base) }
  const app = await buildServer(deps)
  const cookies = await loginAs(deps, 'bio_prof')
  const call = async (
    method: 'POST' | 'GET',
    url: string,
    as: Record<string, string>,
    payload?: unknown,
    expected = 200,
  ) => {
    const res = await app.inject({
      method,
      url,
      cookies: as,
      ...(method === 'POST'
        ? { payload: payload ?? {}, headers: mutationHeaders(deps) }
        : {}),
    })
    if (res.statusCode !== expected)
      throw new Error(`${method} ${url} answered ${res.statusCode}: ${res.body}`)
    return res.json()
  }
  const project = await call(
    'POST',
    '/v1/projects',
    cookies,
    projectBody(slug, { blueprint: 'node-ts-mongo@1' }),
    201,
  )
  await commitManifest(
    { app, deps, cookies, project },
    cwlManifest(slug, CWL_LAUNCH_ATTRIBUTES),
    'feat: sign in with CWL',
  )
  const started = await call(
    'POST',
    `/v1/projects/${project.id}/builds`,
    cookies,
    {},
    202,
  )
  await deps.builds.idle()
  const build = await call('GET', `/v1/builds/${started.id}`, cookies)
  if (build.status !== 'succeeded')
    throw new Error(`the CWL build did not succeed: ${JSON.stringify(build)}`)
  const release = await call(
    'POST',
    `/v1/projects/${project.id}/releases`,
    cookies,
    { buildId: build.id },
    201,
  )
  const env = (kind: string) =>
    project.environments.find((e: { kind: string }) => e.kind === kind)
  const staging = env('staging')
  const production = env('production')
  const staged = await call('POST', `/v1/environments/${staging.id}/deploy`, cookies, {
    releaseId: release.id,
  })
  if (staged.state !== 'healthy')
    throw new Error(`the CWL staging deploy was not healthy: ${JSON.stringify(staged)}`)

  const admin = await loginAs(deps, 'platform_admin', { steppedUp: true })
  const registration = {
    entityId: `${deps.config.idp.spEntityBase}/sp/${slug}/production`,
    acsUrl: `https://${production.hostname}/auth/ubcshib/callback`,
    sloUrl: `https://${production.hostname}/auth/logout`,
    registeredAttributes: [...CWL_LAUNCH_ATTRIBUTES],
    externalTicketRef: `IAM-${slug}`,
  }
  for (const state of ['submitted', 'active'] as const)
    await call(
      'POST',
      `/v1/projects/${project.id}/launch-records/iam-registration`,
      admin,
      { ...registration, state },
    )
  for (const state of ['submitted', 'approved'] as const)
    await call(
      'POST',
      `/v1/projects/${project.id}/launch-records/privacy-assessment`,
      admin,
      { state, reviewer: 'K. Privacy', externalTicketRef: `PIA-${slug}` },
    )
  const rehearsal = await call('POST', `/v1/projects/${project.id}/rehearsal`, admin)
  if (rehearsal.passed !== true)
    throw new Error(`the rehearsal did not pass: ${JSON.stringify(rehearsal)}`)
  await call(
    'POST',
    `/v1/releases/${release.id}/approve`,
    admin,
    { reason: 'the checklist is met and the registration is what UBC recorded' },
    201,
  )
  const owner = await loginAs(deps, 'bio_prof', { steppedUp: true })
  const launched = await call('POST', `/v1/environments/${production.id}/deploy`, owner, {
    releaseId: release.id,
  })
  if (launched.state !== 'healthy')
    throw new Error(
      `the CWL production deploy was not healthy: ${JSON.stringify(launched)}`,
    )
  return {
    app,
    deps,
    cookies,
    project,
    build,
    release,
    staging,
    production,
    admin,
    owner,
    launched,
    registration,
  }
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
    /**
     * **UNDEFINED, AND THAT IS THE HONEST HARNESS RATHER THAN A GAP** (P6a Task 11): the
     * unit tier has no LiteLLM, exactly as `catalogue` above says, so §13's approval
     * summary is recorded as `unavailable` here — which is the state Decision 7 exists for
     * and the one a route test should meet by default.
     *
     * A test that needs a model ANSWERING spreads its own over `testDeps()`, and
     * `summary.test.ts` drives `summariseChanges` directly. The Docker tier has a real
     * gateway; `ai/ai-path.docker.test.ts` is where a live call belongs.
     */
    llm: undefined,
    /**
     * THE BOOT'S OWN REVIEWER, not a stand-in (P6a Task 12): the honest `NullReviewer`,
     * so an approval in this tier records exactly the `not_performed` verdict production
     * records. A test that needs to see what the reviewer was ASKED spreads its own over
     * `testDeps()` — `NullReviewer` reads nothing, so the request is invisible through it.
     */
    reviewer: NullReviewer,
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
    /**
     * D21's rehearsal cannot run in this tier, and it says so rather than pretending
     * (P6a Task 14) — the same shape as `sso` below, and for the same reason. A harness
     * that quietly returned a passing sign-in would make `runRehearsal`'s verdict a
     * property of the fake, and §13's third blocking item is met by a MEASUREMENT.
     * `launch/rehearsal.test.ts` drives the refusals and the item's states with no probe
     * at all; the whole path is the Docker tier's (`releases/production.docker.test.ts`)
     * and the live drive's.
     */
    signIn: {
      signIn: () => {
        throw new Error(
          'the API test harness has no IdP and no deployed app: a test in this tier ran ' +
            "D21's rehearsal. Move it to the Docker tier, or drive `rehearsalItem` " +
            'directly.',
        )
      },
    },
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
  /**
   * The SAME owner with §20's step-up claim already stamped (P6a Task 9).
   *
   * For the `members:manage` calls only — `assertStepUp` refuses an ordinary session on
   * those two routes, and a test whose subject is member removal should not have to
   * drive a SAML round trip to get there. **Everything else keeps `ownerCookies`**, so a
   * guard accidentally added to another route turns that test red rather than being
   * absorbed by a fixture that steps up for everything.
   */
  ownerSteppedUp: Record<string, string>
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
    const ownerSteppedUp = await loginAs(deps, 'bio_prof', { steppedUp: true })
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
      ownerSteppedUp,
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
  /** §20's step-up, for a test whose subject is not the step-up (P6a Task 9). */
  options: { steppedUp?: boolean } = {},
): Promise<Record<string, string>> {
  const cookies = await loginAs(ctx.deps, puid, options)
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
