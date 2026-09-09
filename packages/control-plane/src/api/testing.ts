import { db } from '../db/index.js'
import { loadConfig } from '../config.js'
import { testIssuer } from '../runtime/testing.js'
import { createFakeDriver } from '../runtime/index.js'
import { createLocalSourceDriver } from '../source/index.js'
import { loadBlueprints } from '../blueprints/index.js'
import { createServiceCredentials } from '../services/index.js'
import { generateMasterKeypair } from '../secrets/index.js'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { ServerDeps } from './server.js'

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

export async function testDeps(opts: { devAuth: boolean }): Promise<ServerDeps> {
  await mkdir(TEST_REPOS_ROOT, { recursive: true })
  const reposRoot = await mkdtemp(join(TEST_REPOS_ROOT, 'run-'))
  const issuer = testIssuer()
  const config = loadConfig({
    MANIFEST_ENV: 'development',
    MANIFEST_DATABASE_URL: process.env.MANIFEST_DATABASE_URL!,
    MANIFEST_IDP_DATABASE_URL: process.env.MANIFEST_IDP_DATABASE_URL!,
    MANIFEST_SESSION_SECRET: 'k'.repeat(32),
    MANIFEST_DEV_AUTH: opts.devAuth ? '1' : '0',
    MANIFEST_BLUEPRINTS_ROOT: BLUEPRINTS_ROOT,
    MANIFEST_REPOS_ROOT: reposRoot,
    // The GENERATED test issuer, not infra/registry-auth/ — the suite must not
    // depend on `make seed` having run. See runtime/docker/testing.ts for why it
    // is generated rather than committed.
    MANIFEST_REGISTRY_TOKEN_KEY: issuer.keyPath,
    MANIFEST_REGISTRY_TOKEN_CERT: issuer.certPath,
    MANIFEST_BUILD_CREDENTIAL_SECRET: 'c'.repeat(32),
  })
  return {
    db,
    config,
    driver: createFakeDriver(),
    source: createLocalSourceDriver(reposRoot),
    blueprints: await loadBlueprints(config.blueprintsRoot),
    // A keypair per call, not a shared one: two tests sharing a master key can
    // read each other's secrets, and that is the test-isolation shape that made
    // P2's suite depend on the order Vitest happened to pick.
    secrets: createServiceCredentials(await generateMasterKeypair(), config.masterSecret),
  }
}
