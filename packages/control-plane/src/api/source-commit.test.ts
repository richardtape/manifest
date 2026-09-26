import { execFileSync } from 'node:child_process'
import { and, asc, count, eq, inArray } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { SAMPLE_SECRETS } from '../build/testing.js'
import { appSpecs, events } from '../db/index.js'
import { writeFiles } from '../source/testing.js'
import {
  mutationHeaders,
  refusal,
  sessionFor,
  withProjectServer,
  type TestProject,
} from './testing.js'

/**
 * COMMITTING OVER THE API (the authoring API plan's Task 6): the first route through which an
 * API client writes code — and `manifest.yaml`. Every refusal asserts its CODE; every negative
 * claim has its positive control in the same test.
 */

const commitBody = (base: string, changes: unknown[], extra: object = {}) => ({
  baseCommit: base,
  message: 'the agent’s change',
  changes,
  ...extra,
})

const post = (
  ctx: TestProject,
  payload: unknown,
  auth: { cookies?: Record<string, string>; headers?: Record<string, string> } = {},
) =>
  ctx.app.inject({
    method: 'POST',
    url: `/v1/projects/${ctx.projectId}/commits`,
    ...(auth.headers === undefined ? { cookies: auth.cookies ?? ctx.ownerCookies } : {}),
    headers: { ...mutationHeaders(ctx.deps), ...auth.headers },
    payload: payload as Record<string, unknown>,
  })

const get = (ctx: TestProject, url: string) =>
  ctx.app.inject({
    method: 'GET',
    url: `/v1/projects/${ctx.projectId}${url}`,
    cookies: ctx.ownerCookies,
  })

const headOf = async (ctx: TestProject): Promise<string> =>
  ((await get(ctx, '/tree')).json() as { commitSha: string }).commitSha

const slugOf = async (ctx: TestProject): Promise<string> =>
  ((await get(ctx, '')).json() as { slug: string }).slug

/** `audit.events` for the fixture project, of these types, oldest first. */
const eventsOf = async (ctx: TestProject, types: string[]) =>
  ctx.db
    .select({
      type: events.type,
      machineDetail: events.machineDetail,
      humanMessage: events.humanMessage,
    })
    .from(events)
    .where(and(eq(events.projectId, ctx.projectId), inArray(events.type, types)))
    .orderBy(asc(events.createdAt))
    .then((rows) =>
      rows.map((r) => ({
        ...r,
        machineDetail: r.machineDetail as Record<string, unknown>,
      })),
    )

const specRows = async (ctx: TestProject): Promise<number> =>
  (
    await ctx.db
      .select({ n: count() })
      .from(appSpecs)
      .where(eq(appSpecs.projectId, ctx.projectId))
  )[0]!.n

const errorOf = (res: { body: string }) =>
  (
    JSON.parse(res.body) as {
      error: { message: string; details?: { path: string; code: string }[] }
    }
  ).error

/** A token minted THROUGH THE ROUTE, as an agent's is. */
async function mint(ctx: TestProject, name: string, capabilities: string[]) {
  const res = await ctx.app.inject({
    method: 'POST',
    url: `/v1/projects/${ctx.projectId}/tokens`,
    payload: { name, capabilities, expiresInDays: 1 },
    cookies: ctx.ownerCookies,
    headers: mutationHeaders(ctx.deps),
  })
  expect(res.statusCode, res.body).toBe(201)
  return { authorization: `Bearer ${(res.json() as { secret: string }).secret}` }
}

/** The seeded manifest with `extra` lines appended — a VALID change unless `extra` breaks it. */
async function manifestWith(ctx: TestProject, ...extra: string[]): Promise<string> {
  const file = await get(ctx, '/file?path=manifest.yaml')
  return `${(file.json() as { content: string }).content}${extra.map((l) => `${l}\n`).join('')}`
}

describe('createCommit — changes checked before anything is written (Task 6)', () => {
  it('commits writes and a deletion, records the validation, and publishes who made it — by name, never a PUID', async () => {
    await withProjectServer(async (ctx) => {
      const server = (
        (await get(ctx, '/file?path=server.js')).json() as { content: string }
      ).content
      const res = await post(
        ctx,
        commitBody(ctx.commitSha, [
          { op: 'write', path: 'src/board.js', content: 'export const board = []\n' },
          { op: 'write', path: 'server.js', content: `${server}// the board\n` },
          { op: 'delete', path: 'package-lock.json' },
        ]),
      )
      expect(res.statusCode, res.body).toBe(201)
      const out = res.json() as {
        dryRun: boolean
        commitSha: string
        parent: string
        changes: { path: string; status: string }[]
        spec: { appSpecId: string | null; sensitiveDiff: { sensitive: boolean } }
      }
      expect(out).toMatchObject({ dryRun: false, parent: ctx.commitSha })
      expect(out.changes).toEqual([
        { path: 'package-lock.json', status: 'deleted' },
        { path: 'server.js', status: 'modified' },
        { path: 'src/board.js', status: 'added' },
      ])
      expect(out.commitSha).toMatch(/^[0-9a-f]{40}$/)
      expect(out.spec.appSpecId).not.toBeNull()
      expect(out.spec.sensitiveDiff.sensitive).toBe(false)
      // `main` IS the new commit, and holds what was written.
      expect(await headOf(ctx)).toBe(out.commitSha)
      expect(
        (await get(ctx, '/file?path=src/board.js')).json() as { content: string },
      ).toMatchObject({ content: 'export const board = []\n' })

      const found = await eventsOf(ctx, ['repository.committed', 'spec.validated'])
      const committed = found.find((e) => e.type === 'repository.committed')!
      expect(committed.machineDetail).toEqual({
        commitSha: out.commitSha,
        parent: ctx.commitSha,
        added: 1,
        modified: 1,
        deleted: 1,
        via: 'session',
        userId: ctx.userId,
        tokenId: null,
      })
      // The fixture user's display name (`identity/testing.ts`) — read, not guessed.
      expect(committed.humanMessage).toBe(
        'Bio Prof committed 3 changes to main: the agent’s change',
      )
      expect(committed.humanMessage).not.toMatch(/bio_prof|[0-9]{9}/)
      expect(
        found.filter(
          (e) =>
            e.type === 'spec.validated' && e.machineDetail.commitSha === out.commitSha,
        ),
      ).toHaveLength(1)

      // Git's record: the PERSON is the author, at an address that is nobody's mailbox
      // (Decision 5); Manifest is the committer.
      const { gitDir } = await ctx.deps.source.localGitDir(
        ctx.deps.source.repositoryFor(await slugOf(ctx)),
        out.commitSha,
      )
      expect(
        execFileSync('git', [
          '--git-dir',
          gitDir,
          'log',
          '-1',
          '--format=%an <%ae>|%cn <%ce>',
          out.commitSha,
        ])
          .toString()
          .trim(),
      ).toBe(
        `Bio Prof <${ctx.userId}@users.manifest.internal>|Manifest <manifest@manifest.internal>`,
      )
    })
  })

  it('refuses a stale base, SOURCE_CONFLICT, and main does not move', async () => {
    await withProjectServer(async (ctx) => {
      const first = await post(
        ctx,
        commitBody(ctx.commitSha, [{ op: 'write', path: 'a.txt', content: 'a\n' }]),
      )
      expect(first.statusCode, first.body).toBe(201)
      const landed = (first.json() as { commitSha: string }).commitSha
      const stale = await post(
        ctx,
        commitBody(ctx.commitSha, [{ op: 'write', path: 'b.txt', content: 'b\n' }]),
      )
      expect(refusal(stale)).toEqual({ status: 409, code: 'SOURCE_CONFLICT' })
      expect(await headOf(ctx)).toBe(landed)
      // …and a dry run on the stale base says the same.
      expect(
        refusal(
          await post(
            ctx,
            commitBody(ctx.commitSha, [{ op: 'write', path: 'b.txt', content: 'b\n' }], {
              dryRun: true,
            }),
          ),
        ),
      ).toEqual({ status: 409, code: 'SOURCE_CONFLICT' })
    })
  })

  it('refuses a commit that would leave manifest.yaml invalid — 422 SPEC_INVALID with details — and a dry run answers the same', async () => {
    await withProjectServer(async (ctx) => {
      const invalid = await manifestWith(ctx, 'data:', '  classification: secret')
      const before = await specRows(ctx)
      for (const dryRun of [false, true]) {
        const res = await post(
          ctx,
          commitBody(
            ctx.commitSha,
            [{ op: 'write', path: 'manifest.yaml', content: invalid }],
            {
              dryRun,
            },
          ),
        )
        expect(refusal(res), `dryRun ${dryRun}`).toEqual({
          status: 422,
          code: 'SPEC_INVALID',
        })
        expect(errorOf(res).details?.[0]?.path).toBe('data.classification')
      }
      // Deleting the manifest leaves no valid one either.
      expect(
        refusal(
          await post(
            ctx,
            commitBody(ctx.commitSha, [{ op: 'delete', path: 'manifest.yaml' }]),
          ),
        ),
      ).toEqual({ status: 422, code: 'SPEC_INVALID' })
      expect(await headOf(ctx)).toBe(ctx.commitSha)
      expect(await specRows(ctx)).toBe(before)
      // Nor may a commit move the project to another blueprint (Task 7, Decision 12): the
      // fixture project pins fixture-node@1, and node-ts-mongo@1 is a real blueprint.
      const renamed = await post(
        ctx,
        commitBody(ctx.commitSha, [
          {
            op: 'write',
            path: 'manifest.yaml',
            content: (await manifestWith(ctx)).replace(
              'blueprint: fixture-node@1',
              'blueprint: node-ts-mongo@1',
            ),
          },
        ]),
      )
      expect(refusal(renamed)).toEqual({ status: 422, code: 'SPEC_INVALID' })
      expect(errorOf(renamed).details?.map((d) => d.code)).toEqual([
        'SPEC_BLUEPRINT_NOT_PINNED',
      ])
      // The positive control: a VALID manifest change commits.
      const valid = await post(
        ctx,
        commitBody(ctx.commitSha, [
          {
            op: 'write',
            path: 'manifest.yaml',
            content: await manifestWith(ctx, 'description: a bulletin board'),
          },
        ]),
      )
      expect(valid.statusCode, valid.body).toBe(201)
    })
  })

  it('a dry run answers what would change, writes nothing, records nothing and announces nothing', async () => {
    await withProjectServer(async (ctx) => {
      const before = await specRows(ctx)
      const announced = (await eventsOf(ctx, ['repository.committed', 'spec.validated']))
        .length
      const res = await post(
        ctx,
        commitBody(
          ctx.commitSha,
          [{ op: 'write', path: 'src/board.js', content: 'x\n' }],
          {
            dryRun: true,
          },
        ),
      )
      expect(res.statusCode, res.body).toBe(201)
      expect(res.json()).toEqual({
        dryRun: true,
        commitSha: null,
        parent: ctx.commitSha,
        changes: [{ path: 'src/board.js', status: 'added' }],
        spec: { appSpecId: null, sensitiveDiff: { sensitive: false, fields: [] } },
      })
      expect(await headOf(ctx)).toBe(ctx.commitSha)
      expect(await specRows(ctx)).toBe(before)
      expect(
        (await eventsOf(ctx, ['repository.committed', 'spec.validated'])).length,
      ).toBe(announced)
    })
  })

  it('refuses a secret, names where and which rule, and publishes the finding — never the value', async () => {
    await withProjectServer(async (ctx) => {
      const value = SAMPLE_SECRETS['an AWS access key id']
      const changes = [
        { op: 'write', path: 'config.js', content: `export const key = '${value}'\n` },
      ]
      // A DRY RUN is refused the same way and announces nothing: probing is not an attempt.
      const probe = await post(ctx, commitBody(ctx.commitSha, changes, { dryRun: true }))
      expect(refusal(probe)).toEqual({ status: 409, code: 'SOURCE_SECRET_DETECTED' })
      expect(await eventsOf(ctx, ['repository.secret_refused'])).toEqual([])

      const res = await post(ctx, commitBody(ctx.commitSha, changes))
      expect(refusal(res)).toEqual({ status: 409, code: 'SOURCE_SECRET_DETECTED' })
      expect(res.body).toContain('config.js:1')
      expect(res.body).not.toContain(value)
      const refused = await eventsOf(ctx, ['repository.secret_refused'])
      expect(refused).toHaveLength(1)
      expect(refused[0]!.machineDetail).toEqual({
        findings: [{ path: 'config.js', line: 1, rule: 'an AWS access key id' }],
      })
      expect(JSON.stringify(refused)).not.toContain(value)
      expect(refused[0]!.humanMessage).toContain('Bio Prof')
      expect(await headOf(ctx)).toBe(ctx.commitSha)
      // The positive control: the same file without the key commits.
      const clean = await post(
        ctx,
        commitBody(ctx.commitSha, [
          {
            op: 'write',
            path: 'config.js',
            content: 'export const key = process.env.KEY\n',
          },
        ]),
      )
      expect(clean.statusCode, clean.body).toBe(201)
    })
  })

  it('a retried commit — the same Idempotency-Key — is one commit and one event', async () => {
    await withProjectServer(async (ctx) => {
      const headers = mutationHeaders(ctx.deps)
      const once = () =>
        ctx.app.inject({
          method: 'POST',
          url: `/v1/projects/${ctx.projectId}/commits`,
          cookies: ctx.ownerCookies,
          headers,
          payload: commitBody(ctx.commitSha, [
            { op: 'write', path: 'a.txt', content: 'a\n' },
          ]),
        })
      const first = await once()
      const second = await once()
      expect(first.statusCode, first.body).toBe(201)
      expect(second.statusCode, second.body).toBe(201)
      expect(second.json()).toEqual(first.json())
      const history = (await get(ctx, '/commits')).json() as { commits: unknown[] }
      expect(history.commits).toHaveLength(2) // the seed, and ONE commit
      expect(await eventsOf(ctx, ['repository.committed'])).toHaveLength(1)
    })
  })

  it('refuses a path into .git, a path that escapes, and text that is not text — before anything is read', async () => {
    await withProjectServer(async (ctx) => {
      const commit = vi.spyOn(ctx.deps.source, 'commit')
      const cases: [unknown, RegExp][] = [
        [{ op: 'write', path: '.git/config', content: 'x' }, /\.git/],
        [{ op: 'write', path: 'sub/.GIT/hooks/post-commit', content: 'x' }, /\.git/],
        [{ op: 'delete', path: '../x' }, /empty, \. or \.\. component/],
        [{ op: 'write', path: 'a//b', content: 'x' }, /empty, \. or \.\. component/],
        [{ op: 'write', path: 'a'.repeat(1025), content: 'x' }, /at most 1024 bytes/],
        [{ op: 'write', path: 'nul.txt', content: 'a\u0000b' }, /NUL/],
        [{ op: 'write', path: 'lone.txt', content: 'a\ud800b' }, /well-formed/],
        [{ op: 'rename', path: 'a.txt' }, /./],
      ]
      for (const [change, rule] of cases) {
        const res = await post(ctx, commitBody(ctx.commitSha, [change]))
        expect(refusal(res), JSON.stringify(change).slice(0, 80)).toEqual({
          status: 400,
          code: 'REQUEST_INVALID',
        })
        expect(errorOf(res).message).toMatch(rule)
      }
      // No changes, and 501 of them, are the request's too.
      expect(refusal(await post(ctx, commitBody(ctx.commitSha, [])))).toEqual({
        status: 400,
        code: 'REQUEST_INVALID',
      })
      const many = Array.from({ length: 501 }, (_, i) => ({
        op: 'write',
        path: `f${i}.txt`,
        content: 'x',
      }))
      expect(refusal(await post(ctx, commitBody(ctx.commitSha, many)))).toEqual({
        status: 400,
        code: 'REQUEST_INVALID',
      })
      expect(commit).not.toHaveBeenCalled()
      // The positive control: an ordinary path reaches the driver and commits.
      const ok = await post(
        ctx,
        commitBody(ctx.commitSha, [
          { op: 'write', path: 'src/a b/é.js', content: 'é\n' },
        ]),
      )
      expect(ok.statusCode, ok.body).toBe(201)
      expect(commit).toHaveBeenCalled()
    })
  })

  it('refuses what the planner refuses, each by its own code', async () => {
    await withProjectServer(async (ctx) => {
      const seeded = await post(
        ctx,
        commitBody(ctx.commitSha, [
          { op: 'write', path: 'src/app.js', content: 'app\n' },
        ]),
      )
      expect(seeded.statusCode, seeded.body).toBe(201)
      const base = (seeded.json() as { commitSha: string }).commitSha
      const cases: [unknown[], string][] = [
        [[{ op: 'write', path: 'src', content: 'x' }], 'SOURCE_PATH_CONFLICT'],
        [[{ op: 'write', path: 'server.js/x', content: 'x' }], 'SOURCE_PATH_CONFLICT'],
        [[{ op: 'delete', path: 'nope.txt' }], 'SOURCE_PATH_NOT_FOUND'],
        [[{ op: 'delete', path: 'src' }], 'SOURCE_PATH_CONFLICT'],
        [
          [
            { op: 'write', path: 'a.txt', content: 'a' },
            { op: 'delete', path: 'a.txt' },
          ],
          'SOURCE_PATH_CONFLICT',
        ],
        [
          [{ op: 'write', path: 'src/app.js', content: 'app\n' }],
          'SOURCE_NOTHING_TO_COMMIT',
        ],
      ]
      for (const [changes, code] of cases) {
        expect(refusal(await post(ctx, commitBody(base, changes))), code).toEqual({
          status: 409,
          code,
        })
      }
      expect(await headOf(ctx)).toBe(base)
    })
  })

  it('takes a file of exactly 1 MiB and refuses one byte more; takes a 7 MiB body and refuses a 9 MiB one', async () => {
    await withProjectServer(async (ctx) => {
      const MiB = 1024 * 1024
      const exact = await post(
        ctx,
        commitBody(ctx.commitSha, [
          { op: 'write', path: 'big.txt', content: 'a'.repeat(MiB) },
        ]),
      )
      expect(exact.statusCode, exact.body.slice(0, 300)).toBe(201)
      const base = (exact.json() as { commitSha: string }).commitSha
      const over = await post(
        ctx,
        commitBody(base, [
          { op: 'write', path: 'bigger.txt', content: 'a'.repeat(MiB + 1) },
        ]),
      )
      expect(refusal(over)).toEqual({ status: 400, code: 'REQUEST_INVALID' })
      expect(errorOf(over).message).toMatch(/1 MiB/)
      // The positive control for the route's OWN body limit: seven files at the limit is a
      // body far past Fastify's 1 MiB default.
      const seven = Array.from({ length: 7 }, (_, i) => ({
        op: 'write',
        path: `f${i}.txt`,
        content: String(i).repeat(MiB),
      }))
      const wide = await post(ctx, commitBody(base, seven))
      expect(wide.statusCode, wide.body.slice(0, 300)).toBe(201)
      const nine = Array.from({ length: 9 }, (_, i) => ({
        op: 'write',
        path: `g${i}.txt`,
        content: 'b'.repeat(MiB),
      }))
      const tooLarge = await post(ctx, commitBody(base, nine))
      expect(refusal(tooLarge)).toEqual({ status: 413, code: 'REQUEST_BODY_TOO_LARGE' })
      // The hint says what the limits ARE — it said "no API request needs more than 1 MiB",
      // which this route made false.
      expect(
        (JSON.parse(tooLarge.body) as { error: { hint: string } }).error.hint,
      ).toMatch(/1 MiB.*createCommit.*8 MiB/)
      // …and no other route widened: 2 MiB to POST …/spec is still past the default.
      expect(
        refusal(
          await ctx.app.inject({
            method: 'POST',
            url: `/v1/projects/${ctx.projectId}/spec`,
            cookies: ctx.ownerCookies,
            headers: mutationHeaders(ctx.deps),
            payload: { pad: 'c'.repeat(2 * MiB) },
          }),
        ),
      ).toEqual({ status: 413, code: 'REQUEST_BODY_TOO_LARGE' })
    })
  })

  it('a token holding source:write commits, and the record names the agent and the person — a person’s own push is null', async () => {
    await withProjectServer(async (ctx) => {
      const agent = await mint(ctx, 'claude-code', ['project:read', 'source:write'])
      const res = await post(
        ctx,
        commitBody(ctx.commitSha, [{ op: 'write', path: 'a.txt', content: 'a\n' }]),
        { headers: agent },
      )
      expect(res.statusCode, res.body).toBe(201)
      const byAgent = (res.json() as { commitSha: string }).commitSha
      const [committed] = await eventsOf(ctx, ['repository.committed'])
      expect(committed!.machineDetail).toMatchObject({ via: 'token', userId: ctx.userId })
      expect(committed!.machineDetail.tokenId).toMatch(/^[0-9a-f-]{36}$/)
      expect(committed!.humanMessage).toBe(
        "Bio Prof's agent (token 'claude-code') committed 1 change to main: the agent’s change",
      )
      // A person commits through a session beside it…
      const byPerson = (
        (
          await post(
            ctx,
            commitBody(byAgent, [{ op: 'write', path: 'b.txt', content: 'b\n' }]),
          )
        ).json() as { commitSha: string }
      ).commitSha
      // …and pushes with git, claiming to be the owner — which git's author text cannot refute.
      const pushed = await writeFiles(
        ctx.deps.source,
        ctx.deps.source.repositoryFor(await slugOf(ctx)),
        { 'c.txt': 'c\n' },
        'a push',
        { name: 'Bio Prof', email: 'bio_prof@example.ubc.ca' },
      )
      const list = (await get(ctx, '/commits')).json() as {
        commits: { commitSha: string; authorName: string; madeThrough: unknown }[]
      }
      const of = (sha: string) => list.commits.find((c) => c.commitSha === sha)!
      expect(of(pushed)).toMatchObject({ authorName: 'Bio Prof', madeThrough: null })
      expect(of(byPerson).madeThrough).toEqual({
        kind: 'person',
        name: 'Bio Prof',
        tokenName: null,
      })
      expect(of(byAgent)).toMatchObject({
        authorName: "Bio Prof (via token 'claude-code')",
        madeThrough: { kind: 'agent', name: 'Bio Prof', tokenName: 'claude-code' },
      })
      expect(of(ctx.commitSha).madeThrough).toBeNull() // the seed: Manifest's, not a person's
      const one = (await get(ctx, `/commits/${byAgent}`)).json() as {
        madeThrough: unknown
      }
      expect(one.madeThrough).toEqual({
        kind: 'agent',
        name: 'Bio Prof',
        tokenName: 'claude-code',
      })
    })
  })

  /**
   * WRITING SOURCE IS `source:write` (Decision 8), NOT `project:write` — and the authorization
   * matrix cannot tell them apart, because every actor there that passes holds both (sitting 3's
   * F9). Only a token minted with `project:write` and WITHOUT `source:write` shows it.
   */
  it('refuses a token minted with project:write but not source:write — FORBIDDEN, and nothing committed', async () => {
    await withProjectServer(async (ctx) => {
      const writer = await mint(ctx, 'no-source', ['project:read', 'project:write'])
      const res = await post(
        ctx,
        commitBody(ctx.commitSha, [{ op: 'write', path: 'a.txt', content: 'a\n' }]),
        { headers: writer },
      )
      expect(refusal(res)).toEqual({ status: 403, code: 'FORBIDDEN' })
      expect(await headOf(ctx)).toBe(ctx.commitSha)
      // A stranger learns nothing; a collaborator commits (§13: as the owner, less members).
      const stranger = await sessionFor(ctx, 'unrelated_user')
      expect(
        refusal(
          await post(
            ctx,
            commitBody(ctx.commitSha, [{ op: 'write', path: 'a.txt', content: 'a\n' }]),
            { cookies: stranger },
          ),
        ),
      ).toEqual({ status: 404, code: 'NOT_FOUND' })
      const collaborator = await sessionFor(ctx, 'bio_student', 'collaborator')
      const ok = await post(
        ctx,
        commitBody(ctx.commitSha, [{ op: 'write', path: 'a.txt', content: 'a\n' }]),
        { cookies: collaborator },
      )
      expect(ok.statusCode, ok.body).toBe(201)
    })
  })
})
