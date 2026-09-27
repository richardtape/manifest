import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { generateDocs } from './docs-write.js'
import {
  descriptionFrom,
  guidesOf,
  openerFor,
  READING_ORDER,
  renderDocsHtml,
  slugOf,
} from './docs-html.js'

const DOCUMENT = new URL('../../contract/openapi.json', import.meta.url)

/**
 * `pnpm docs:html` — THE DOCUMENTATION AS ONE PAGE YOU OPEN FROM DISK (after the authoring API
 * plan's sitting 8, at Rich's request): the guides and the reference together, with no platform,
 * no mock and no server. What it rests on was measured on Scalar 1.72.0 before it was built — the
 * standalone bundle renders from `file://`, renders Markdown in the document's description with its
 * `#` headings in the sidebar, and follows a `#description/<slug>` link between them.
 */
describe('the documentation as one static page', () => {
  /**
   * SCALAR'S ANCHORS, AS MEASURED (2026-09-26, Scalar 1.72.0, from the rendered DOM): a heading's
   * id is its text lowercased with inline code and punctuation dropped. A link between guides is
   * rewritten to one of these, so a slug that disagrees with Scalar's is a link that goes nowhere.
   */
  it('names a heading exactly as Scalar anchors it', () => {
    expect(slugOf('Manifest’s API')).toBe('manifests-api')
    expect(slugOf('manifest.yaml')).toBe('manifestyaml')
    expect(slugOf('Error codes')).toBe('error-codes')
    expect(slugOf('For an AI agent')).toBe('for-an-ai-agent')
    expect(slugOf('When `main` has moved')).toBe('when-has-moved')
    expect(slugOf('Inside `details`, for `SPEC_INVALID`')).toBe('inside-for')
  })

  it('places every page docs:write writes, once — but the operations page, which the reference IS', async () => {
    const written = [...(await generateDocs()).keys()].filter(
      (k) => k.endsWith('.md') && !k.startsWith('/'),
    )
    expect(written.length).toBeGreaterThan(10)
    expect([...READING_ORDER].sort()).toEqual(
      written.filter((f) => f !== 'reference/operations.md').sort(),
    )
    expect(new Set(READING_ORDER).size).toBe(READING_ORDER.length)
  })

  it('makes every page a section, every link between pages an anchor that exists, and keeps no comment', async () => {
    const description = descriptionFrom(guidesOf(await generateDocs()))
    const headings = new Set(
      [...description.matchAll(/^#{1,6} (.+)$/gm)].map((m) => slugOf(m[1]!)),
    )
    for (const title of [
      'Manifest’s API',
      'For an AI agent',
      'Error codes',
      'manifest.yaml',
    ])
      expect(description, title).toMatch(new RegExp(`^# ${title}$`, 'm'))
    expect(description, 'a link to a Markdown file survived').not.toMatch(/\]\([^)]*\.md/)
    const targets = [...description.matchAll(/\]\(#description\/([^)]+)\)/g)].map(
      (m) => m[1]!,
    )
    expect(targets.length, 'no link between pages was rewritten').toBeGreaterThan(10)
    expect(targets.filter((t) => !headings.has(t))).toEqual([])
    expect(description).not.toContain('<!--')
    // The positive half: the guides' own words, and their inlined code, are there.
    expect(description).toContain(
      'Read → change → check → commit → build → deploy → read the result.',
    )
    expect(description).toContain(
      "import { createManifestClient, idempotencyKey, unwrap } from '@manifest/contract'",
    )
  })

  it('is one page that loads the bundle beside it and nothing else, offline, with the published document inside', async () => {
    const published = JSON.parse(await readFile(DOCUMENT, 'utf8')) as {
      info: { description: string }
    }
    const html = renderDocsHtml(published, guidesOf(await generateDocs()))
    const scripts = [...html.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]!.trim())
    expect(scripts).toEqual([
      'src="./scalar-standalone.js"',
      'id="document" type="application/json"',
      '',
    ])
    for (const setting of [
      'withDefaultFonts: false',
      'telemetry: false',
      'hideClientButton: true',
      'hideTestRequestButton: true',
      'mcp: { disabled: true }',
      "showDeveloperTools: 'never'",
      'agent: { disabled: true }',
    ])
      expect(html, setting).toContain(setting)
    // Nothing in the embedded document can close its <script>: every `<` is escaped.
    const embedded =
      /<script id="document" type="application\/json">([\s\S]*?)<\/script>/.exec(
        html,
      )![1]!
    expect(embedded).not.toContain('<')
    const document = JSON.parse(embedded) as typeof published
    expect({ ...document, info: { ...document.info, description: '' } }).toEqual({
      ...published,
      info: { ...published.info, description: '' },
    })
    // THE GUIDES OPEN IT, each a top-level entry in the sidebar: a description that opens with
    // prose is folded, whole, under one *Introduction* entry (measured, clicking the first build).
    // The published paragraph — about the document — introduces the reference at the end.
    expect(document.info.description.startsWith('# Manifest’s API\n')).toBe(true)
    expect(document.info.description).toContain('# For an AI agent')
    const reference = document.info.description.slice(
      document.info.description.indexOf('# The API reference'),
    )
    expect(reference).toContain(published.info.description)
  })

  /**
   * `pnpm docs:html` OPENS THE PAGE ITSELF (Rich, 2026-09-26: *"make it open the page itself"*), with
   * the command each platform opens a file with in its default browser — and `--no-open` skips it.
   */
  it('opens the page with the platform’s own opener', () => {
    const page = '/repo/dist/api-docs/index.html'
    expect(openerFor('darwin', page)).toEqual(['open', [page]])
    expect(openerFor('linux', page)).toEqual(['xdg-open', [page]])
    expect(openerFor('win32', page)).toEqual(['cmd', ['/c', 'start', '', page]])
  })
})
