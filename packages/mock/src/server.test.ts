import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as fixtures from './fixtures.js'
import {
  ANSWERED,
  createMockServer,
  FROM_EXAMPLE,
  operationsOf,
  readDocument,
} from './server.js'
import { createValidator } from './validate.js'

/**
 * THE MOCK'S OWN HALF OF D22. `server.ts` derives its paths from the document, so it cannot
 * answer an operation at the wrong URL; this is the other direction — every operation the
 * document declares has an entry in the routing table. Without it the mock silently
 * `501`s a route the contract grew, which reads to a front-end developer as a platform they
 * cannot use rather than as a mock they must extend.
 */
describe('manifest-mock answers the whole document', () => {
  /**
   * A SCRIPTED ANSWER OR THE DOCUMENT'S OWN EXAMPLE (the authoring API plan's Decision 15,
   * Task 10's Step 1 — built in its Task 5, which wrote the first examples): one source for an
   * answer, validated twice. An operation with NEITHER is named here.
   */
  it('has a scripted answer or a document example for every operation the contract declares', async () => {
    const operations = operationsOf(await readDocument())
    const missing = operations
      .filter((o) => !ANSWERED.includes(o.operationId) && o.example === undefined)
      .map((o) => o.operationId)
    expect(missing).toEqual([])
    // A document that failed to parse has no operations and no missing ones. Say which.
    expect(
      operations.length,
      'no operations were read from the document',
    ).toBeGreaterThan(30)
  })

  /**
   * EVERY EXAMPLE THE DOCUMENT PRINTS IS A BODY THIS MOCK CAN SEND (the authoring API plan's
   * Task 10, `[S6]`). The reference's gate parses each example through its ZOD schema; the mock
   * sends each answer through AJV, which reads `format`, `pattern` and `additionalProperties`
   * as the document states them — so an example zod accepts and Ajv refuses would be this
   * mock's `500` the first time a screen asked, not a red gate. Every example is checked,
   * including those of operations answered by a fixture, because the published reference
   * shows them all.
   */
  it('answers every document example through the validator every answer passes', async () => {
    const check = await createValidator()
    const examples = operationsOf(await readDocument()).filter(
      (o) => o.example !== undefined,
    )
    const refused = examples
      .map((o) => ({ id: o.operationId, ...check(o.example!.schema!, o.example!.body) }))
      .filter((r) => !r.ok)
      .map((r) => `${r.id}: ${r.errors}`)
    expect(refused).toEqual([])
    // Fifty JSON operations carry one since the reference was completed; fewer read means the
    // examples were not found, which would make the list above empty for the wrong reason.
    expect(examples.length, 'the examples were not read').toBeGreaterThanOrEqual(50)
  })

  /**
   * A SCRIPTED ANSWER BUILT ON THE DOCUMENT'S EXAMPLE NEEDS ONE — the four keyed answers
   * below answer `ctx.example`, so a document that lost it would make them `501` at the first
   * request while the gate above still counted them as answered.
   */
  it('has a document example for every scripted answer that is built on one', async () => {
    const operations = operationsOf(await readDocument())
    expect(
      FROM_EXAMPLE.filter(
        (id) => operations.find((o) => o.operationId === id)?.example === undefined,
      ),
    ).toEqual([])
    expect(FROM_EXAMPLE.every((id) => ANSWERED.includes(id))).toBe(true)
    expect(FROM_EXAMPLE.length).toBeGreaterThan(0)
  })

  it('compiles a path template into a pattern that captures its parameters', async () => {
    const operations = operationsOf(await readDocument())
    const remove = operations.find((o) => o.operationId === 'removeMember')
    expect(remove?.names).toEqual(['projectId', 'userId'])
    const m = remove?.pattern.exec('/v1/projects/p-1/members/u-2')
    expect(m?.slice(1)).toEqual(['p-1', 'u-2'])
    // And it does NOT match one segment too many, which is what an unanchored pattern would.
    expect(remove?.pattern.test('/v1/projects/p-1/members/u-2/extra')).toBe(false)
  })
})

/**
 * The refusals a client switches on, driven over a real socket. Each asserts the CODE and
 * not only the status: `401`, `403` and `400` are all reachable here for more than one
 * reason, and a status-only assertion passes for the wrong one (CLAUDE.md).
 */
describe('manifest-mock refuses what the platform refuses', () => {
  let server: Server
  let origin: string

  beforeAll(async () => {
    server = createMockServer({ scanSilenceMs: 50 })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address() as { port: number }
    origin = `http://127.0.0.1:${address.port}`
  })
  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve))
  })

  const session = { cookie: 'manifest_session=mock-session' }

  it('answers the console’s sign-out as the platform does: 200 and where to go next', async () => {
    // The console's `signOut` refuses anything else — including the 204 the platform
    // answered until P6b's F10 was fixed — so a mock still answering 204 would make
    // *Sign out* fail against it while working against the platform.
    const response = await fetch(`${origin}/auth/logout`, {
      method: 'POST',
      headers: session,
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ redirectTo: '/' })
    expect(response.headers.get('set-cookie')).toContain('manifest_session=;')
  })

  it('answers a request with no credential 401 UNAUTHENTICATED', async () => {
    const response = await fetch(`${origin}/v1/me`)
    expect(response.status).toBe(401)
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'UNAUTHENTICATED',
    )
  })

  it('answers a request carrying both credentials 400 CREDENTIAL_AMBIGUOUS', async () => {
    const response = await fetch(`${origin}/v1/me`, {
      headers: { ...session, authorization: 'Bearer mft_x_y' },
    })
    expect(response.status).toBe(400)
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'CREDENTIAL_AMBIGUOUS',
    )
  })

  it('answers a path the document does not declare 404 ROUTE_NOT_FOUND', async () => {
    const response = await fetch(`${origin}/v1/nonsense`, { headers: session })
    expect(response.status).toBe(404)
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'ROUTE_NOT_FOUND',
    )
  })

  it('answers an operation it has no fixture for with the DOCUMENT’s example — getTree', async () => {
    const document = (await readDocument()) as unknown as {
      paths: Record<
        string,
        {
          get: {
            responses: Record<string, { content: Record<string, { example?: unknown }> }>
          }
        }
      >
    }
    const example =
      document.paths['/v1/projects/{projectId}/tree']!.get.responses['200']!.content[
        'application/json'
      ]!.example
    expect(example).toBeDefined()
    expect(ANSWERED).not.toContain('getTree')
    const response = await fetch(
      `${origin}/v1/projects/22222222-2222-4222-8222-222222222222/tree`,
      { headers: session },
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(example)
  })

  /**
   * THE DOCUMENT'S EXAMPLES, KEYED ON WHAT NAMES THEM (Task 10). A file's text is answered for
   * ITS path, a commit's changes for ITS id, the one page of history for no cursor (or its own
   * first commit), and a dry run as a dry run. Anything else is refused with the platform's
   * code in the mock's own words — each asserted by CODE, with the example's own request as
   * the positive half in the same test.
   */
  describe('answers the document’s source examples only for what they are examples of', () => {
    const PROJECT = '22222222-2222-4222-8222-222222222222'
    const example = async (path: string, method = 'get') => {
      const document = (await readDocument()) as unknown as {
        paths: Record<
          string,
          Record<
            string,
            {
              responses: Record<
                string,
                { content?: Record<string, { example?: unknown }> }
              >
            }
          >
        >
      }
      const responses = document.paths[path]![method]!.responses
      const status = Object.keys(responses).find((s) => /^2/.test(s))!
      return responses[status]!.content!['application/json']!.example as Record<
        string,
        unknown
      >
    }
    const codeOf = async (response: Response) =>
      ((await response.json()) as { error: { code: string } }).error.code

    it('getFile — the example’s path is answered, any other is SOURCE_PATH_NOT_FOUND', async () => {
      const file = await example('/v1/projects/{projectId}/file')
      const read = (p: string) =>
        fetch(
          `${origin}/v1/projects/${PROJECT}/file?path=${encodeURIComponent(p)}&ref=main`,
          { headers: session },
        )
      const held = await read(file.path as string)
      expect(held.status).toBe(200)
      expect(await held.json()).toEqual(file)
      const other = await read('manifest.yaml')
      expect(other.status).toBe(409)
      expect(await codeOf(other)).toBe('SOURCE_PATH_NOT_FOUND')
    })

    it('getCommit — the example’s commit is answered, its parent is SOURCE_COMMIT_NOT_FOUND', async () => {
      const commit = await example('/v1/projects/{projectId}/commits/{commitSha}')
      const read = (sha: string) =>
        fetch(`${origin}/v1/projects/${PROJECT}/commits/${sha}`, { headers: session })
      const held = await read(commit.commitSha as string)
      expect(held.status).toBe(200)
      expect(await held.json()).toEqual(commit)
      const parent = await read((commit.parents as string[])[0]!)
      expect(parent.status).toBe(409)
      expect(await codeOf(parent)).toBe('SOURCE_COMMIT_NOT_FOUND')
    })

    it('listCommits — one page, and its `next` is refused rather than answered again', async () => {
      const page = await example('/v1/projects/{projectId}/commits')
      const list = (query: string) =>
        fetch(`${origin}/v1/projects/${PROJECT}/commits${query}`, { headers: session })
      const first = await list('')
      expect(first.status).toBe(200)
      expect(await first.json()).toEqual(page)
      expect(page.next).not.toBeNull()
      const next = await list(`?cursor=${page.next as string}`)
      expect(next.status).toBe(409)
      expect(await codeOf(next)).toBe('SOURCE_COMMIT_NOT_FOUND')
    })

    it('createCommit — a dry run is answered as one, and a commit as the example', async () => {
      const outcome = await example('/v1/projects/{projectId}/commits', 'post')
      const commit = (body: Record<string, unknown>) =>
        fetch(`${origin}/v1/projects/${PROJECT}/commits`, {
          method: 'POST',
          headers: {
            ...session,
            'content-type': 'application/json',
            'idempotency-key': crypto.randomUUID(),
          },
          body: JSON.stringify(body),
        })
      const request = {
        baseCommit: outcome.parent,
        message: 'Greet the world',
        changes: [{ op: 'write', path: 'src/app.js', content: 'x\n' }],
      }
      const made = await commit(request)
      expect(made.status).toBe(201)
      expect(await made.json()).toEqual(outcome)
      const dry = await commit({ ...request, dryRun: true })
      expect(dry.status).toBe(201)
      expect(await dry.json()).toEqual({
        ...outcome,
        dryRun: true,
        commitSha: null,
        spec: { ...(outcome.spec as object), appSpecId: null },
      })
    })
  })

  /**
   * THE DOCUMENTATION (the authoring API plan's Task 11). A page's Markdown is answered for ITS
   * slug alone — the example's — as `getFile` answers one path; and the OpenAPI document is
   * answered as the document this mock serves from, whole, because an HTML reference or a Docs
   * screen pointed at the mock must render the API, not the example's three keys.
   */
  describe('answers the documentation', () => {
    const codeOf = async (response: Response) =>
      ((await response.json()) as { error: { code: string } }).error.code

    it('getDoc — the example’s page is answered, any other slug is DOC_NOT_FOUND', async () => {
      const document = (await readDocument()) as unknown as {
        paths: Record<string, { get: { responses: Record<string, unknown> } }>
      }
      const responses = document.paths['/v1/docs/{slug}']!.get.responses as Record<
        string,
        { content: Record<string, { example: { slug: string } }> }
      >
      const page = responses['200']!.content['application/json']!.example
      const read = (slug: string) =>
        fetch(`${origin}/v1/docs/${slug}`, { headers: session })
      const held = await read(page.slug)
      expect(held.status).toBe(200)
      expect(await held.json()).toEqual(page)
      const other = await read('no-such-page')
      expect(other.status).toBe(404)
      expect(await codeOf(other)).toBe('DOC_NOT_FOUND')
    })

    it('getOpenApiDocument — the whole document the mock serves from', async () => {
      const response = await fetch(`${origin}/v1/openapi.json`, { headers: session })
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual(await readDocument())
    })
  })

  it('answers the stream’s plain GET 426 EVENTS_UPGRADE_REQUIRED', async () => {
    const response = await fetch(
      `${origin}/v1/projects/22222222-2222-4222-8222-222222222222/events`,
      { headers: session },
    )
    expect(response.status).toBe(426)
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'EVENTS_UPGRADE_REQUIRED',
    )
  })

  /**
   * P6b Task 9's RUNTIME RULE, which the document cannot state: `previewId` is optional in the
   * request schema and REQUIRED by the operation (Decision 15). A mock that accepted a decision
   * naming no preview would let a console that never sends one look finished — and the
   * difference would first appear against the platform (P6b sitting 6, found by clicking).
   */
  it('answers a decision naming no preview 400 APPROVAL_PREVIEW_REQUIRED', async () => {
    const decide = (verb: 'approve' | 'reject', body: Record<string, unknown>) =>
      fetch(`${origin}/v1/releases/${fixtures.RELEASE_ID}/${verb}`, {
        method: 'POST',
        headers: {
          ...session,
          'content-type': 'application/json',
          'idempotency-key': crypto.randomUUID(),
        },
        body: JSON.stringify(body),
      })
    for (const [verb, body] of [
      ['approve', {}],
      ['reject', { reason: 'no preview was read' }],
    ] as const) {
      const refused = await decide(verb, body)
      expect(refused.status).toBe(400)
      expect(((await refused.json()) as { error: { code: string } }).error.code).toBe(
        'APPROVAL_PREVIEW_REQUIRED',
      )
      // The positive half: the same request NAMING a preview is the platform's 201.
      const named = await decide(verb, {
        ...body,
        previewId: fixtures.APPROVAL_PREVIEW_ID,
      })
      expect(named.status).toBe(201)
    }
  })

  it('answers §26’s fleet 403 FORBIDDEN unless the role is admin', async () => {
    const member = await fetch(`${origin}/v1/fleet`, { headers: session })
    expect(member.status).toBe(403)
    expect(((await member.json()) as { error: { code: string } }).error.code).toBe(
      'FORBIDDEN',
    )
    // The positive half, on a second server: a refusal that is unconditional refuses
    // nothing in particular.
    const admin = createMockServer({ role: 'admin' })
    await new Promise<void>((resolve) => admin.listen(0, '127.0.0.1', resolve))
    const { port } = admin.address() as { port: number }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/v1/fleet`, {
        headers: session,
      })
      expect(response.status).toBe(200)
      expect((await response.json()) as unknown[]).toHaveLength(1)
    } finally {
      await new Promise((resolve) => admin.close(resolve))
    }
  })
})
