import { execFile } from 'node:child_process'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, posix, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { generateDocs } from './docs-write.js'

/**
 * `pnpm docs:html` — THE API'S DOCUMENTATION AS ONE PAGE YOU OPEN FROM DISK (after the authoring API
 * plan's sitting 8, at Rich's request: *"we should be able to see the API docs without having the
 * entire thing spun up"*). It writes `dist/api-docs/index.html` and the renderer beside it: the
 * guides, in reading order, with the reference after them — no platform, no mock, no server and no
 * network. Git-ignored and rebuilt on demand, so the renderer's 4.3 MB bundle is never committed.
 *
 * **Scalar renders the guides itself** — no Markdown package: they become the description of a COPY
 * of the published document, which Scalar renders as Markdown with each `#` heading in its sidebar.
 * Measured on Scalar 1.72.0 before this was written: the standalone bundle renders from `file://`;
 * the guides' tables, lists and code render; and a link to `#description/<slug>` moves to that
 * heading. The published document is never changed.
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

/**
 * Every page `docs:write` writes, in the order a reader meets them — the index's own order — but
 * `reference/operations.md`: the reference that follows the guides IS that page. A new page is
 * placed here, or `docs-html.test.ts` names it.
 */
export const READING_ORDER: readonly string[] = [
  'index.md',
  'getting-started.md',
  'authentication.md',
  'conventions.md',
  'journey.md',
  'authoring.md',
  'secrets.md',
  'events.md',
  'launching.md',
  'agents.md',
  'frontend.md',
  'reference/errors.md',
  'reference/events.md',
  'reference/manifest-yaml.md',
]

/** Where a link to the operations page goes: the section that introduces the reference below. */
const REFERENCE_TITLE = 'The API reference'

export interface Guide {
  file: string
  markdown: string
}

/** The pages `generateDocs` wrote, in reading order. */
export function guidesOf(generated: ReadonlyMap<string, string>): Guide[] {
  return READING_ORDER.map((file) => {
    const markdown = generated.get(file)
    if (markdown === undefined) throw new Error(`pnpm docs:write writes no ${file}`)
    return { file, markdown }
  })
}

/**
 * A heading's anchor as SCALAR makes it — measured from its rendered DOM: the text with inline code
 * dropped, lowercased, anything but letters, digits, spaces and hyphens removed, spaces as hyphens.
 */
export function slugOf(heading: string): string {
  return heading
    .replace(/`[^`]*`/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

const titleOf = (markdown: string): string => {
  const line = markdown.split('\n').find((l) => l.startsWith('# '))
  if (line === undefined) throw new Error('a page with no `# ` title')
  return line.slice(2).trim()
}

/**
 * The guides as one Markdown description: each page in reading order — its `# ` title a section —
 * with HTML comments (the generated pages' markers, the examples' spans) removed and every link to
 * another page rewritten to that page's anchor. A link to a page that is not placed throws: the
 * docs gate already holds every link to a file that exists.
 */
export function descriptionFrom(guides: readonly Guide[], about = ''): string {
  const anchors = new Map(guides.map((g) => [g.file, slugOf(titleOf(g.markdown))]))
  anchors.set('reference/operations.md', slugOf(REFERENCE_TITLE))
  const sections = guides.map(({ file, markdown }) =>
    markdown
      .replace(/<!--[\s\S]*?-->\n?/g, '')
      .replace(/\]\(([^)\s#]+\.md)(#[^)\s]*)?\)/g, (_link, target: string) => {
        const page = posix.normalize(posix.join(posix.dirname(file), target))
        const anchor = anchors.get(page)
        if (anchor === undefined)
          throw new Error(`${file} links to ${target}, which is no page here`)
        return `](#description/${anchor})`
      })
      .trim(),
  )
  sections.push(
    [
      `# ${REFERENCE_TITLE}`,
      'Every operation follows, grouped by what it is about — the sections below the guides in the sidebar — each with its parameters, an example of what it sends and answers, and the errors it can answer. The console serves the same reference at `/reference.html`, and the document itself is `GET /v1/openapi.json`.',
      ...(about === '' ? [] : [about]),
    ].join('\n\n'),
  )
  return sections.join('\n\n')
}

/**
 * The page: the renderer beside it, the document embedded in a JSON script — every `<` escaped, so
 * nothing in it can close the tag — and the renderer configured exactly as it was measured offline
 * (the console's `reference/main.ts` carries the same settings).
 */
export function renderDocsHtml(
  document: { info: { description: string } },
  guides: readonly Guide[],
): string {
  const withGuides = {
    ...document,
    info: {
      ...document.info,
      // THE GUIDES FIRST: a description that opens with prose is folded, whole, under one
      // *Introduction* entry in Scalar's sidebar. The published paragraph, which is about the
      // document, introduces the reference instead.
      description: descriptionFrom(guides, document.info.description),
    },
  }
  const embedded = JSON.stringify(withGuides).replace(/</g, '\\u003c')
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Manifest API documentation</title>
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
  const html = renderDocsHtml(published, guidesOf(await generateDocs()))
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
