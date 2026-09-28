import { execFileSync } from 'node:child_process'
import { copyFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

/**
 * `@manifest/contract`'s build — `pnpm --filter @manifest/contract build` — as a function a test
 * can run into a directory of its own (FE-18, the front-end enablement plan's sitting 10).
 *
 * `tsc` then ONE COPY: `src/schema.d.ts` is `openapi-typescript`'s output, a declaration file, and
 * `tsc` emits nothing for a `.d.ts` input — so without the copy every `dist/*.d.ts` that names
 * `./schema.js` is unresolvable to a consumer that reads `dist/`, which is TS2307 under
 * `skipLibCheck: false` (`src/dist.test.ts`).
 */
const here = fileURLToPath(new URL('.', import.meta.url))
const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc')

export function build(outDir = `${here}dist`) {
  execFileSync(process.execPath, [tsc, '-p', here, '--outDir', outDir], {
    stdio: 'inherit',
  })
  copyFileSync(`${here}src/schema.d.ts`, `${outDir}/schema.d.ts`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) build()
