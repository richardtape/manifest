import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { loadApiDocs } from '../docs/index.js'
import { mutationHeaders, refusal, withProjectServer } from './testing.js'

/**
 * THE DOCUMENTATION, SERVED (the authoring API plan's Task 11, Decision 18): `docs/api/` read at
 * boot and answered over `/v1`, and the OpenAPI document the platform generates at boot — the
 * one `pnpm contract:write` publishes. Any credential reads them; the authorization matrix
 * holds every actor, and this file holds what each answers.
 */
const DOCS_ROOT = new URL('../../../../docs/api/', import.meta.url).pathname
const PUBLISHED = new URL('../../../contract/openapi.json', import.meta.url)

describe('the documentation, served (Decision 18)', () => {
  it('lists every page under docs/api — its slug, title and summary — in the loader’s order', async () => {
    const expected = await loadApiDocs(DOCS_ROOT)
    await withProjectServer(async (ctx) => {
      const res = await ctx.app.inject({
        method: 'GET',
        url: '/v1/docs',
        cookies: ctx.ownerCookies,
      })
      expect(res.statusCode, res.body).toBe(200)
      const { pages } = res.json() as {
        pages: { slug: string; title: string; summary: string }[]
      }
      expect(pages.length).toBeGreaterThan(0)
      expect(pages).toEqual(
        expected.pages.map((p) => ({ slug: p.slug, title: p.title, summary: p.summary })),
      )
      expect(pages[0]?.slug).toBe('index')
    })
  })

  it('answers a page’s Markdown exactly as the file holds it', async () => {
    const text = await readFile(new URL('index.md', `file://${DOCS_ROOT}`), 'utf8')
    await withProjectServer(async (ctx) => {
      const res = await ctx.app.inject({
        method: 'GET',
        url: '/v1/docs/index',
        cookies: ctx.ownerCookies,
      })
      expect(res.statusCode, res.body).toBe(200)
      const page = res.json() as { slug: string; title: string; markdown: string }
      expect(page.slug).toBe('index')
      expect(page.markdown).toBe(text)
      expect(page.title).toBe(text.split('\n', 1)[0]!.replace(/^# /, ''))
    })
  })

  it('refuses a slug that is not a page 404 DOC_NOT_FOUND — a page’s own slug is read', async () => {
    await withProjectServer(async (ctx) => {
      const get = (slug: string) =>
        ctx.app.inject({
          method: 'GET',
          url: `/v1/docs/${slug}`,
          cookies: ctx.ownerCookies,
        })
      expect((await get('index')).statusCode).toBe(200)
      const missing = await get('no-such-page')
      expect(refusal(missing)).toMatchObject({ status: 404, code: 'DOC_NOT_FOUND' })
    })
  })

  it('answers the OpenAPI document the platform publishes, byte for byte', async () => {
    const published = await readFile(PUBLISHED, 'utf8')
    await withProjectServer(async (ctx) => {
      const res = await ctx.app.inject({
        method: 'GET',
        url: '/v1/openapi.json',
        cookies: ctx.ownerCookies,
      })
      expect(res.statusCode, res.body.slice(0, 300)).toBe(200)
      expect(`${JSON.stringify(res.json(), null, 2)}\n`).toBe(published)
    })
  })

  /**
   * DOCUMENTATION IS NO PROJECT'S DATA: a token minted for one project, holding one capability,
   * reads all three — so a route that asserted a capability, or scoped to a project, is red here.
   */
  it('is read by a token holding project:read alone — every page, and the document', async () => {
    await withProjectServer(async (ctx) => {
      const minted = await ctx.app.inject({
        method: 'POST',
        url: `/v1/projects/${ctx.projectId}/tokens`,
        payload: {
          name: 'docs-reader',
          capabilities: ['project:read'],
          expiresInDays: 1,
        },
        cookies: ctx.ownerCookies,
        headers: mutationHeaders(ctx.deps),
      })
      expect(minted.statusCode, minted.body).toBe(201)
      const headers = {
        authorization: `Bearer ${(minted.json() as { secret: string }).secret}`,
      }
      for (const url of ['/v1/docs', '/v1/docs/index', '/v1/openapi.json']) {
        const res = await ctx.app.inject({ method: 'GET', url, headers })
        expect(res.statusCode, `${url}: ${res.body.slice(0, 200)}`).toBe(200)
      }
      const anonymous = await ctx.app.inject({ method: 'GET', url: '/v1/docs' })
      expect(refusal(anonymous)).toMatchObject({ status: 401, code: 'UNAUTHENTICATED' })
    })
  })
})
