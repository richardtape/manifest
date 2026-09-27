import { lstat, readdir, readFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

/**
 * `docs/api/` — THE API'S DOCUMENTATION, READ ONCE AT BOOT AND SERVED OVER THE API (the authoring
 * API plan's Task 11, Decision 18; D23.4, D25): a bring-your-own agent on someone's laptop has
 * no checkout, so the guides it drives Manifest from are an API resource, as a blueprint's
 * knowledge pack is.
 *
 * Bounded, and refused — naming the page — when the directory holds something the API cannot
 * serve, as `loadBlueprints` refuses a broken blueprint. A boot error, never answered on the
 * wire: a control plane that half-read its documentation would serve half of it, silently.
 */
export class ApiDocsLoadError extends Error {
  constructor(
    readonly code:
      | 'DOCS_MISSING'
      | 'DOCS_TOO_MANY'
      | 'DOCS_SYMLINK'
      | 'DOCS_PAGE_TOO_LARGE'
      | 'DOCS_PAGE_NOT_TEXT'
      | 'DOCS_PAGE_UNTITLED'
      | 'DOCS_PAGE_NO_SUMMARY',
    message: string,
  ) {
    super(message)
    this.name = 'ApiDocsLoadError'
  }
}

/** Decision 18's bounds: each page at most 512 KiB, at most 100 pages. */
export const MAX_PAGE_BYTES = 512 * 1024
export const MAX_PAGES = 100

export interface ApiDocPage {
  /** Its path without `.md`, `/` as `-`: `reference/errors.md` is `reference-errors`. */
  slug: string
  /** Relative to the root, `/`-separated — for an operator line, never the wire. */
  path: string
  /** Its first `# ` line. */
  title: string
  /** Its first paragraph after the title, as one line — what the index shows. */
  summary: string
  markdown: string
}

export interface ApiDocs {
  /** `index` first, then the top-level pages, then each directory's, each by path. */
  pages: readonly ApiDocPage[]
  page(slug: string): ApiDocPage | undefined
}

/** FATAL, so a page that is not UTF-8 is refused rather than served with U+FFFD in it. */
const UTF8 = new TextDecoder('utf-8', { fatal: true })

export function slugOf(path: string): string {
  return path.replace(/\.md$/, '').split('/').join('-')
}

/** Top-level before nested, `index` first among the top level, then by path. */
function readingOrder(a: string, b: string): number {
  const depth = (p: string) => p.split('/').length
  if (depth(a) !== depth(b)) return depth(a) - depth(b)
  if (a === 'index.md') return -1
  if (b === 'index.md') return 1
  return a < b ? -1 : a > b ? 1 : 0
}

function titleOf(lines: readonly string[]): { title: string; at: number } | undefined {
  const at = lines.findIndex((l) => l.startsWith('# '))
  if (at === -1) return undefined
  const title = lines[at]!.slice(2).trim()
  return title === '' ? undefined : { title, at }
}

/**
 * The first paragraph after the title: consecutive prose lines, joined. A heading, a fence, a
 * table or an HTML comment (a generated page's marker) is not prose, and is passed over.
 */
function summaryOf(lines: readonly string[], from: number): string | undefined {
  const paragraph: string[] = []
  for (const raw of lines.slice(from)) {
    const line = raw.trim()
    if (paragraph.length > 0 && line === '') break
    const prose =
      line !== '' &&
      !line.startsWith('#') &&
      !line.startsWith('```') &&
      !line.startsWith('|') &&
      !line.startsWith('<!--')
    if (prose) paragraph.push(line)
    else if (paragraph.length > 0) break
  }
  return paragraph.length === 0 ? undefined : paragraph.join(' ')
}

/** Every `*.md` under `root`, read, checked and indexed by slug. */
export async function loadApiDocs(root: string): Promise<ApiDocs> {
  const files: string[] = []
  async function walk(dir: string): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      throw new ApiDocsLoadError(
        'DOCS_MISSING',
        `the API's documentation is not readable at ${root}`,
      )
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      const path = relative(root, full).split(sep).join('/')
      const stat = await lstat(full)
      if (stat.isSymbolicLink()) {
        throw new ApiDocsLoadError(
          'DOCS_SYMLINK',
          `the API's documentation: ${path} is a symbolic link, which is never served`,
        )
      }
      if (stat.isDirectory()) {
        await walk(full)
        continue
      }
      if (!entry.name.endsWith('.md')) continue
      if (stat.size > MAX_PAGE_BYTES) {
        throw new ApiDocsLoadError(
          'DOCS_PAGE_TOO_LARGE',
          `the API's documentation: ${path} is ${stat.size} bytes, over ${MAX_PAGE_BYTES}`,
        )
      }
      files.push(path)
      if (files.length > MAX_PAGES) {
        throw new ApiDocsLoadError(
          'DOCS_TOO_MANY',
          `the API's documentation is over ${MAX_PAGES} pages at ${root}`,
        )
      }
    }
  }
  await walk(root)
  if (files.length === 0) {
    throw new ApiDocsLoadError('DOCS_MISSING', `the API's documentation has no pages at ${root}`)
  }

  const pages: ApiDocPage[] = []
  for (const path of files.sort(readingOrder)) {
    const bytes = await readFile(join(root, ...path.split('/')))
    let markdown: string
    try {
      if (bytes.includes(0)) throw new Error('NUL')
      markdown = UTF8.decode(bytes)
    } catch {
      throw new ApiDocsLoadError(
        'DOCS_PAGE_NOT_TEXT',
        `the API's documentation: ${path} is not UTF-8 text`,
      )
    }
    const lines = markdown.split('\n')
    const titled = titleOf(lines)
    if (titled === undefined) {
      throw new ApiDocsLoadError(
        'DOCS_PAGE_UNTITLED',
        `the API's documentation: ${path} has no \`# \` title line`,
      )
    }
    const summary = summaryOf(lines, titled.at + 1)
    if (summary === undefined) {
      throw new ApiDocsLoadError(
        'DOCS_PAGE_NO_SUMMARY',
        `the API's documentation: ${path} has no paragraph after its title — the index shows it`,
      )
    }
    pages.push({ slug: slugOf(path), path, title: titled.title, summary, markdown })
  }
  const bySlug = new Map(pages.map((p) => [p.slug, p]))
  return { pages, page: (slug) => bySlug.get(slug) }
}
