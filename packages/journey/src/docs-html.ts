import { execFile } from 'node:child_process'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/**
 * `pnpm docs:html` — THE API REFERENCE AS ONE PAGE YOU OPEN FROM DISK: every operation, its
 * parameters, what it sends and answers, and the errors it can answer, rendered by Scalar from the
 * published OpenAPI document. It writes `dist/api-docs/index.html` and the renderer beside it — no
 * platform, no mock, no server and no network. Git-ignored and rebuilt on demand, so the renderer's
 * 4.3 MB bundle is never committed.
 *
 * **The reference only.** The guides are Markdown (`docs/api/`, and `GET /v1/docs` from the API),
 * and this page points at them rather than repeating them (Rich, 2026-09-30: the guides pasted in
 * above the reference doubled what the Markdown already says, squeezed beside Scalar's request
 * panel). The embedded document is the published one, its description followed by that pointer.
 *
 * Plain Node, run by type stripping, like `docs-write.ts`.
 */
const REPO = fileURLToPath(new URL('../../../', import.meta.url))
const DOCUMENT = join(REPO, 'packages', 'contract', 'openapi.json')
/** The console's renderer, installed with it — the artefact the offline measurement was made on. */
const BUNDLE = join(
  REPO,
  'packages',
  'console',
  'node_modules',
  '@scalar',
  'api-reference',
  'dist',
  'browser',
  'standalone.js',
)
export const OUT = join(REPO, 'dist', 'api-docs')

/** Where the guides are, said once at the top of the reference. */
export const GUIDES_POINTER =
  'The guides — getting started, authentication, conventions, authoring, secrets, events, launching, and the pages for an AI agent and for a front-end — are Markdown: `docs/api/` in the repository, and `GET /v1/docs` from the API. This page is the reference: every operation, what it takes, what it answers, and the errors it can answer.'

/**
 * The page: the renderer beside it, the document embedded in a JSON script — every `<` escaped, so
 * nothing in it can close the tag — and the renderer configured exactly as it was measured offline
 * (the console's `reference/main.ts` carries the same settings).
 */
export function renderDocsHtml(document: { info: { description: string } }): string {
  const withPointer = {
    ...document,
    info: {
      ...document.info,
      description: `${document.info.description}\n\n${GUIDES_POINTER}`,
    },
  }
  const embedded = JSON.stringify(withPointer).replace(/</g, '\\u003c')
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Manifest API reference</title>
  </head>
  <body>
    <div id="app"></div>
    <script src="./scalar-standalone.js"></script>
    <script id="document" type="application/json">${embedded}</script>
    <script>
      Scalar.createApiReference('#app', {
        content: JSON.parse(document.getElementById('document').textContent),
        withDefaultFonts: false,
        telemetry: false,
        hideClientButton: true,
        hideTestRequestButton: true,
        mcp: { disabled: true },
        showDeveloperTools: 'never',
        agent: { disabled: true },
      })
    </script>
  </body>
</html>
`
}

/**
 * The command that opens a file in the platform's default browser (Rich asked for the page to open
 * itself): `open` on macOS, `xdg-open` on Linux, `start` through `cmd` on Windows — whose empty
 * argument is `start`'s window title, which it would otherwise take from the path.
 */
export function openerFor(platform: NodeJS.Platform, file: string): [string, string[]] {
  if (platform === 'darwin') return ['open', [file]]
  if (platform === 'win32') return ['cmd', ['/c', 'start', '', file]]
  return ['xdg-open', [file]]
}

async function main(): Promise<void> {
  const published = JSON.parse(await readFile(DOCUMENT, 'utf8')) as {
    info: { description: string }
  }
  const html = renderDocsHtml(published)
  await mkdir(OUT, { recursive: true })
  try {
    await copyFile(BUNDLE, join(OUT, 'scalar-standalone.js'))
  } catch (cause) {
    throw new Error(
      `the renderer is not installed at ${relative(REPO, BUNDLE)} — run \`pnpm install\` first`,
      { cause },
    )
  }
  const page = join(OUT, 'index.html')
  await writeFile(page, html)
  const url = pathToFileURL(page).href
  console.log(`wrote ${relative(REPO, page)} — nothing needs to be running: ${url}`)
  if (process.argv.includes('--no-open')) return
  const [command, args] = openerFor(process.platform, page)
  execFile(command, args, (error) => {
    // Never a failure of the build: the page is written, and this line says where it is.
    if (error !== null)
      console.error(
        `could not open it (${command}: ${error.message}) — open ${url} in a browser`,
      )
  })
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main()
}
