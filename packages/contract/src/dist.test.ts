import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
// @ts-expect-error — a plain ESM build script, deliberately not TypeScript.
import { build } from '../build.mjs'

/**
 * FE-18 (the front-end enablement plan's sitting 10): `@manifest/contract` is consumed from a
 * SIBLING repository — the faculty front-end links this package — so what `pnpm build` writes must
 * type-check on its own. It did not: `dist/index.d.ts` re-exports `./schema.js`, and `tsc` emits
 * nothing for the hand-over `schema.d.ts`, so a consumer reading `dist/` met TS2307 (measured by the
 * front-end's F1 sitting 1). This builds into a directory of its own and type-checks a consumer
 * against it with `skipLibCheck` OFF — the only setting under which a broken declaration is seen —
 * and with `erasableSyntaxOnly`, which recent Vite templates turn on.
 */
const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc')
const pkg = fileURLToPath(new URL('..', import.meta.url))
let dir: string

beforeAll(async () => {
  // INSIDE the package's own node_modules, so `openapi-fetch` resolves from the built files as it
  // does for a consumer that links this package — a system temp directory has no node_modules.
  const cache = join(pkg, 'node_modules', '.cache')
  await mkdir(cache, { recursive: true })
  dir = await mkdtemp(join(cache, 'dist-test-'))
  ;(build as (outDir: string) => void)(join(dir, 'dist'))
})
afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('@manifest/contract as another repository consumes it (FE-18)', () => {
  it('builds a dist/ whose declarations type-check on their own', async () => {
    await writeFile(
      join(dir, 'consumer.ts'),
      [
        "import { ManifestApiError, type Schemas, type ErrorCode } from './dist/index.js'",
        "const me: Schemas['Me'] | undefined = undefined",
        "const code: ErrorCode = 'NOT_FOUND'",
        'export const seen = [me, code, ManifestApiError]',
        '',
      ].join('\n'),
    )
    await writeFile(
      join(dir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { ...CONSUMER, types: [] },
        files: ['consumer.ts'],
      }),
    )
    expect(typecheck(dir)).toBe('')
  })

  /**
   * THE FRONT-END'S OWN PATH: it resolves this package's TYPES to `src/` (its `tsconfig` paths), so
   * `src/` is compiled under ITS settings — and `erasableSyntaxOnly` refuses a constructor parameter
   * property, which `src/errors.ts` used (FE-18 (b)).
   */
  it('has source a consumer compiles with erasableSyntaxOnly', async () => {
    const src = join(dir, 'src-consumer')
    await mkdir(src, { recursive: true })
    await writeFile(
      join(src, 'consumer.ts'),
      [
        `import { ManifestApiError, type Schemas } from '${join(pkg, 'src', 'index.js')}'`,
        "const me: Schemas['Me'] | undefined = undefined",
        'export const seen = [me, ManifestApiError]',
        '',
      ].join('\n'),
    )
    await writeFile(
      join(src, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { ...CONSUMER, types: ['node'] },
        files: ['consumer.ts'],
      }),
    )
    expect(typecheck(src)).toBe('')
  })
})

const CONSUMER = {
  target: 'ES2023',
  module: 'NodeNext',
  moduleResolution: 'NodeNext',
  strict: true,
  noEmit: true,
  skipLibCheck: false,
  erasableSyntaxOnly: true,
}

/** `tsc -p <dir>`'s complaints, or '' when it compiles. */
function typecheck(project: string): string {
  try {
    execFileSync(process.execPath, [tsc, '-p', project], { encoding: 'utf8' })
    return ''
  } catch (error) {
    return String((error as { stdout?: string }).stdout ?? error)
  }
}
