import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ApiDocsLoadError, loadApiDocs, slugOf } from './load.js'

/**
 * `docs/api/` is read ONCE AT BOOT and refused — naming the page — when it holds something
 * the API cannot serve (the authoring API plan's Task 11, Decision 18), as `loadBlueprints`
 * refuses a broken blueprint. Every refusal below has the positive case beside it: a loader
 * that refused everything would pass each refusal on its own.
 */
let root: string
afterEach(async () => {
  if (root !== undefined) await rm(root, { recursive: true, force: true })
})

async function tree(files: Record<string, string | Buffer>): Promise<string> {
  root = await mkdtemp(join(tmpdir(), 'manifest-docs-'))
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(root, path, '..'), { recursive: true })
    await writeFile(join(root, path), content)
  }
  return root
}

const page = (title: string, summary: string, body = '') =>
  `# ${title}\n\n${summary}\n\n${body}`

async function refusal(dir: string): Promise<{ code: string; message: string }> {
  const error = await loadApiDocs(dir).then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(error, 'the loader accepted a tree it must refuse').toBeInstanceOf(
    ApiDocsLoadError,
  )
  const { code, message } = error as ApiDocsLoadError
  return { code, message }
}

describe('loadApiDocs (Decision 18)', () => {
  it('reads every page under the root: its slug, its title and its first paragraph', async () => {
    const docs = await loadApiDocs(
      await tree({
        'index.md': page('Manifest’s API', 'Where to start.\nTwo lines, one paragraph.'),
        'agents.md': page('For an AI agent', 'The loop.', '## More\n\nText.'),
        'reference/errors.md': page(
          'Error codes',
          '<!-- generated -->\nEvery code the API answers.',
        ),
        'notes.txt': 'not a page',
      }),
    )
    expect(docs.pages.map((p) => p.slug)).toEqual(['index', 'agents', 'reference-errors'])
    expect(docs.page('agents')).toMatchObject({
      slug: 'agents',
      path: 'agents.md',
      title: 'For an AI agent',
      summary: 'The loop.',
    })
    expect(docs.page('index')?.summary).toBe('Where to start. Two lines, one paragraph.')
    // A comment line is not prose: the generated pages open with their marker.
    expect(docs.page('reference-errors')?.summary).toBe('Every code the API answers.')
    expect(docs.page('agents')?.markdown).toBe(
      page('For an AI agent', 'The loop.', '## More\n\nText.'),
    )
    expect(docs.page('notes')).toBeUndefined()
    expect(docs.page('reference/errors')).toBeUndefined()
  })

  it('names a slug by its path: without `.md`, with `/` as `-`', () => {
    expect(slugOf('reference/errors.md')).toBe('reference-errors')
    expect(slugOf('getting-started.md')).toBe('getting-started')
  })

  it('refuses a root that is not there, naming it', async () => {
    const missing = join(tmpdir(), `manifest-docs-absent-${process.pid}`)
    const { code, message } = await refusal(missing)
    expect(code).toBe('DOCS_MISSING')
    expect(message).toContain(missing)
  })

  it('refuses a root with no pages', async () => {
    expect((await refusal(await tree({ 'notes.txt': 'x' }))).code).toBe('DOCS_MISSING')
  })

  it('refuses a page with no `# ` title, naming it', async () => {
    const { code, message } = await refusal(
      await tree({
        'index.md': page('Fine', 'Fine.'),
        'guide.md': '## Only a second-level heading\n\nText.\n',
      }),
    )
    expect(code).toBe('DOCS_PAGE_UNTITLED')
    expect(message).toContain('guide.md')
  })

  it('refuses a page with no paragraph after its title, naming it', async () => {
    const { code, message } = await refusal(
      await tree({ 'index.md': page('Fine', 'Fine.'), 'bare.md': '# Bare\n\n## Next\n' }),
    )
    expect(code).toBe('DOCS_PAGE_NO_SUMMARY')
    expect(message).toContain('bare.md')
  })

  it('refuses a page that is not UTF-8 text, naming it', async () => {
    const latin1 = Buffer.concat([Buffer.from('# Caf'), Buffer.from([0xe9]), Buffer.from('\n\nx.\n')])
    const { code, message } = await refusal(
      await tree({ 'index.md': page('Fine', 'Fine.'), 'latin.md': latin1 }),
    )
    expect(code).toBe('DOCS_PAGE_NOT_TEXT')
    expect(message).toContain('latin.md')
  })

  it('refuses a page over 512 KiB, naming it — and reads one at the limit', async () => {
    const at = page('At', 'At the limit.').padEnd(512 * 1024, 'x')
    expect((await loadApiDocs(await tree({ 'at.md': at }))).page('at')?.title).toBe('At')
    await rm(root, { recursive: true, force: true })
    const { code, message } = await refusal(await tree({ 'over.md': `${at}x` }))
    expect(code).toBe('DOCS_PAGE_TOO_LARGE')
    expect(message).toContain('over.md')
  })

  it('refuses more than 100 pages — and reads 100', async () => {
    const pages = (n: number) =>
      Object.fromEntries(
        Array.from({ length: n }, (_, i) => [`p${i}.md`, page(`P${i}`, 'x.')]),
      )
    expect((await loadApiDocs(await tree(pages(100)))).pages).toHaveLength(100)
    await rm(root, { recursive: true, force: true })
    expect((await refusal(await tree(pages(101)))).code).toBe('DOCS_TOO_MANY')
  })

  it('refuses a symbolic link, naming it', async () => {
    const dir = await tree({ 'index.md': page('Fine', 'Fine.') })
    await symlink('/etc/hosts', join(dir, 'hosts.md'))
    const { code, message } = await refusal(dir)
    expect(code).toBe('DOCS_SYMLINK')
    expect(message).toContain('hosts.md')
  })
})
