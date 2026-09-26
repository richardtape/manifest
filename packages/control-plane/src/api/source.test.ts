import { describe, expect, it } from 'vitest'
import { writeFiles } from '../source/testing.js'
import { sourceRoutes } from './routes/source.js'
import {
  mutationHeaders,
  refusal,
  sessionFor,
  withProjectServer,
  type TestProject,
} from './testing.js'

/**
 * READING A PROJECT'S SOURCE OVER THE API (the authoring API plan's Task 5): what an agent
 * reads before it writes. Every answer names the commit it read; every refusal is asserted
 * by its CODE, beside a positive control in the same test.
 */

const slugOf = async (ctx: TestProject): Promise<string> =>
  (
    (
      await ctx.app.inject({
        method: 'GET',
        url: `/v1/projects/${ctx.projectId}`,
        cookies: ctx.ownerCookies,
      })
    ).json() as { slug: string }
  ).slug

const get = (ctx: TestProject, url: string, cookies = ctx.ownerCookies) =>
  ctx.app.inject({ method: 'GET', url: `/v1/projects/${ctx.projectId}${url}`, cookies })

describe('reading source over the API (Task 5)', () => {
  /**
   * Each operation's EXAMPLE is printed into the document (Step 4), so one that has drifted
   * from its representation would publish an answer the API never gives. Task 9's gate holds
   * every operation to this; these four hold it from the task that wrote them.
   */
  it('every example is an answer its own representation accepts — and a request its own schema does', () => {
    expect(sourceRoutes.map((r) => r.operationId)).toEqual([
      'getTree',
      'getFile',
      'listCommits',
      'getCommit',
      'createCommit',
    ])
    for (const route of sourceRoutes) {
      const parsed = route.success.schema.safeParse(route.examples?.response)
      expect(parsed.success, `${route.operationId}: ${String(parsed.error)}`).toBe(true)
      // A body's example is a REQUEST the route would accept (Task 6's is the first).
      if (route.method !== 'GET') {
        const sent = route.body.safeParse(route.examples?.request)
        expect(sent.success, `${route.operationId} request: ${String(sent.error)}`).toBe(
          true,
        )
      }
    }
  })

  it('reads the tree at main, and says which commit it read', async () => {
    await withProjectServer(async (ctx) => {
      const res = await get(ctx, '/tree')
      expect(res.statusCode, res.body).toBe(200)
      const tree = res.json() as {
        ref: string
        commitSha: string
        truncated: boolean
        entries: { path: string; type: string; mode: string; binary: boolean | null }[]
      }
      expect(tree.ref).toBe('main')
      expect(tree.commitSha).toBe(ctx.commitSha)
      expect(tree.truncated).toBe(false)
      expect(tree.entries.find((e) => e.path === 'manifest.yaml')).toMatchObject({
        type: 'file',
        mode: '100644',
        binary: false,
      })
    })
  })

  it('reads a file at a commit, and refuses a directory and a missing path by code', async () => {
    await withProjectServer(async (ctx) => {
      // The fixture blueprint's skeleton has no directory (`server.js`, `package.json`,
      // `package-lock.json` and the manifest), so the test gives it one.
      const repo = ctx.deps.source.repositoryFor(await slugOf(ctx))
      const head = await writeFiles(
        ctx.deps.source,
        repo,
        { 'src/app.js': 'app\n' },
        'a dir',
      )
      const file = await get(ctx, `/file?path=manifest.yaml&ref=${ctx.commitSha}`)
      expect(file.statusCode, file.body).toBe(200)
      expect(file.json()).toMatchObject({
        ref: ctx.commitSha,
        commitSha: ctx.commitSha,
        path: 'manifest.yaml',
        content: expect.stringContaining('name:'),
        mode: '100644',
        blobSha: expect.stringMatching(/^[0-9a-f]{40}$/),
      })
      // `ref` defaults to main — which is now the commit that added the directory.
      const nested = await get(ctx, '/file?path=src/app.js')
      expect(nested.json()).toMatchObject({ commitSha: head, content: 'app\n', size: 4 })
      expect(refusal(await get(ctx, '/file?path=src'))).toEqual({
        status: 409,
        code: 'SOURCE_PATH_NOT_A_FILE',
      })
      expect(refusal(await get(ctx, '/file?path=nope'))).toEqual({
        status: 409,
        code: 'SOURCE_PATH_NOT_FOUND',
      })
      // …and `src/app.js` is not at the seed's commit: a read is AT the commit it names.
      expect(
        refusal(await get(ctx, `/file?path=src/app.js&ref=${ctx.commitSha}`)),
      ).toEqual({
        status: 409,
        code: 'SOURCE_PATH_NOT_FOUND',
      })
      expect(refusal(await get(ctx, '/file'))).toEqual({
        status: 400,
        code: 'REQUEST_INVALID',
      })
    })
  })

  it('pages the history and describes a commit', async () => {
    await withProjectServer(async (ctx) => {
      const repo = ctx.deps.source.repositoryFor(await slugOf(ctx))
      const a = await writeFiles(ctx.deps.source, repo, { 'a.txt': 'a\n' }, 'add a')
      const b = await writeFiles(ctx.deps.source, repo, { 'a.txt': 'a\nb\n' }, 'change a')
      const page = await get(ctx, '/commits?limit=1')
      expect(page.statusCode, page.body).toBe(200)
      expect(page.json()).toMatchObject({
        ref: 'main',
        commits: [{ commitSha: b, subject: 'change a', parents: [a] }],
        next: a,
      })
      const rest = (await get(ctx, `/commits?cursor=${a}`)).json() as {
        commits: { commitSha: string; parents: string[] }[]
        next: string | null
      }
      expect(rest.commits.map((c) => c.commitSha)).toEqual([a, ctx.commitSha])
      expect(rest.commits[1]!.parents).toEqual([])
      expect(rest.next).toBeNull()
      const detail = await get(ctx, `/commits/${b}`)
      expect(detail.statusCode, detail.body).toBe(200)
      expect(detail.json()).toMatchObject({
        commitSha: b,
        subject: 'change a',
        patchesTruncated: false,
        changes: [
          {
            path: 'a.txt',
            status: 'modified',
            binary: false,
            additions: 1,
            deletions: 0,
            patch: expect.stringContaining('+b'),
          },
        ],
      })
      // A limit is text on the wire, bounded by the schema.
      expect(refusal(await get(ctx, '/commits?limit=0'))).toEqual({
        status: 400,
        code: 'REQUEST_INVALID',
      })
      expect(refusal(await get(ctx, '/commits?limit=101'))).toEqual({
        status: 400,
        code: 'REQUEST_INVALID',
      })
    })
  })

  it('refuses a ref that is not a ref, before git sees it', async () => {
    await withProjectServer(async (ctx) => {
      expect((await get(ctx, '/tree?ref=main')).statusCode).toBe(200)
      expect(refusal(await get(ctx, '/tree?ref=-x'))).toEqual({
        status: 400,
        code: 'REQUEST_INVALID',
      })
      expect(refusal(await get(ctx, '/tree?ref=main..x'))).toEqual({
        status: 400,
        code: 'REQUEST_INVALID',
      })
      expect(refusal(await get(ctx, '/tree?ref=no-such'))).toEqual({
        status: 409,
        code: 'SOURCE_REF_NOT_FOUND',
      })
      expect(refusal(await get(ctx, `/tree?ref=${'f'.repeat(40)}`))).toEqual({
        status: 409,
        code: 'SOURCE_COMMIT_NOT_FOUND',
      })
      // A cursor is checked to be a commit of THIS repository, exactly as a ref is.
      expect(refusal(await get(ctx, `/commits?cursor=${'f'.repeat(40)}`))).toEqual({
        status: 409,
        code: 'SOURCE_COMMIT_NOT_FOUND',
      })
      expect(refusal(await get(ctx, `/commits/${'f'.repeat(40)}`))).toEqual({
        status: 409,
        code: 'SOURCE_COMMIT_NOT_FOUND',
      })
      expect(refusal(await get(ctx, '/commits/main'))).toEqual({
        status: 400,
        code: 'REQUEST_INVALID',
      })
    })
  })

  /**
   * READING SOURCE IS `project:read` (Decision 8) — and only a token holding that ALONE can
   * show it: every actor in the authorization matrix that passes also holds `project:write`,
   * so a route asserting the wrong one would leave the whole matrix green (Step 6).
   */
  it('reads source on a token minted with project:read alone — and not on one without it', async () => {
    await withProjectServer(async (ctx) => {
      const mint = async (capabilities: string[]) => {
        const res = await ctx.app.inject({
          method: 'POST',
          url: `/v1/projects/${ctx.projectId}/tokens`,
          payload: {
            name: `read-${capabilities.join('-')}`,
            capabilities,
            expiresInDays: 1,
          },
          cookies: ctx.ownerCookies,
          headers: mutationHeaders(ctx.deps),
        })
        expect(res.statusCode, res.body).toBe(201)
        return { authorization: `Bearer ${(res.json() as { secret: string }).secret}` }
      }
      const reader = await mint(['project:read'])
      const builder = await mint(['build:create'])
      for (const url of [
        '/tree',
        '/file?path=manifest.yaml',
        '/commits',
        `/commits/${ctx.commitSha}`,
      ]) {
        const read = await ctx.app.inject({
          method: 'GET',
          url: `/v1/projects/${ctx.projectId}${url}`,
          headers: reader,
        })
        expect(read.statusCode, `${url}: ${read.body}`).toBe(200)
        expect(
          refusal(
            await ctx.app.inject({
              method: 'GET',
              url: `/v1/projects/${ctx.projectId}${url}`,
              headers: builder,
            }),
          ),
          url,
        ).toEqual({ status: 403, code: 'FORBIDDEN' })
      }
    })
  })

  it('answers a stranger 404 and a token of another project 404 — never the tree', async () => {
    await withProjectServer(async (ctx) => {
      const stranger = await sessionFor(ctx, 'unrelated_user')
      for (const url of [
        '/tree',
        '/file?path=manifest.yaml',
        '/commits',
        `/commits/${ctx.commitSha}`,
      ]) {
        expect(refusal(await get(ctx, url, stranger)), url).toEqual({
          status: 404,
          code: 'NOT_FOUND',
        })
        // The positive control: the owner reads every one.
        expect((await get(ctx, url)).statusCode, url).toBe(200)
      }
      // A collaborator reads, as for every other read of a project (`project:read`).
      const collaborator = await sessionFor(ctx, 'bio_student', 'collaborator')
      expect((await get(ctx, '/tree', collaborator)).statusCode).toBe(200)
    })
  })
})
