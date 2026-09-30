import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { generateDocs } from './docs-write.js'
import { GUIDES_POINTER, openerFor, renderDocsHtml } from './docs-html.js'

const DOCUMENT = new URL('../../contract/openapi.json', import.meta.url)

type Published = { info: { description: string } }

const published = async (): Promise<Published> =>
  JSON.parse(await readFile(DOCUMENT, 'utf8')) as Published

const embeddedIn = (html: string): Published =>
  JSON.parse(
    /<script id="document" type="application\/json">([\s\S]*?)<\/script>/.exec(html)![1]!,
  ) as Published

/**
 * `pnpm docs:html` — THE API REFERENCE AS ONE PAGE YOU OPEN FROM DISK, with no platform, no mock and
 * no server. What it rests on was measured on Scalar 1.72.0 before it was built: the standalone
 * bundle renders from `file://`. Since 2026-09-30 it is the reference ONLY — the guides are Markdown,
 * and the page points at them rather than repeating them (Rich).
 */
describe('the API reference as one static page', () => {
  it('is one page that loads the bundle beside it and nothing else, offline', async () => {
    const html = renderDocsHtml(await published())
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
  })

  it('embeds the published document unchanged, its description followed by where the guides are', async () => {
    const document = await published()
    const embedded = embeddedIn(renderDocsHtml(document))
    expect({ ...embedded, info: { ...embedded.info, description: '' } }).toEqual({
      ...document,
      info: { ...document.info, description: '' },
    })
    expect(embedded.info.description).toBe(
      `${document.info.description}\n\n${GUIDES_POINTER}`,
    )
    expect(GUIDES_POINTER).toContain('`docs/api/`')
    expect(GUIDES_POINTER).toContain('`GET /v1/docs`')
  })

  /**
   * THE GUIDES ARE NOT REPEATED (Rich, 2026-09-30). The positive half first: each phrase below IS in
   * the guides `docs:write` writes — so its absence from the page is the split, not a phrase that
   * exists nowhere.
   */
  it('repeats no guide: the guides stay Markdown', async () => {
    const guides = [...(await generateDocs()).values()].join('\n')
    const phrases = [
      '# For an AI agent',
      'Read → change → check → commit → build → deploy → read the result.',
      "import { createManifestClient, idempotencyKey, unwrap } from '@manifest/contract'",
    ]
    for (const phrase of phrases) expect(guides, phrase).toContain(phrase)
    const description = embeddedIn(renderDocsHtml(await published())).info.description
    for (const phrase of phrases) expect(description, phrase).not.toContain(phrase)
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
