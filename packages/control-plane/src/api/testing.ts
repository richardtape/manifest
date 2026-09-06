import { db } from '../db/index.js'
import { loadConfig } from '../config.js'
import { createFakeDriver } from '../runtime/index.js'
import { createLocalSourceDriver } from '../source/index.js'
import { loadBlueprints } from '../blueprints/index.js'
import { mkdtemp } from 'node:fs/promises'
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

export async function testDeps(opts: { devAuth: boolean }): Promise<ServerDeps> {
  const reposRoot = await mkdtemp(join(tmpdir(), 'manifest-api-repos-'))
  const config = loadConfig({
    MANIFEST_ENV: 'development',
    MANIFEST_DATABASE_URL: process.env.MANIFEST_DATABASE_URL!,
    MANIFEST_SESSION_SECRET: 'k'.repeat(32),
    MANIFEST_DEV_AUTH: opts.devAuth ? '1' : '0',
    MANIFEST_BLUEPRINTS_ROOT: BLUEPRINTS_ROOT,
    MANIFEST_REPOS_ROOT: reposRoot,
  })
  return {
    db,
    config,
    driver: createFakeDriver(),
    source: createLocalSourceDriver(reposRoot),
    blueprints: await loadBlueprints(config.blueprintsRoot),
  }
}
