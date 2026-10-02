import { execFileSync } from 'node:child_process'
import { and, asc, count, eq, inArray } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { SAMPLE_SECRETS } from '../build/testing.js'
import { appSpecs, events } from '../db/index.js'
import { writeFiles } from '../source/testing.js'
import { ROUTE_DEFINITIONS } from './routes/index.js'
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

  /**
   * THE ANSWER `manifest-mock` PLAYS, WORD FOR WORD (the authoring API plan's Task 11): a commit
   * that deletes manifest.yaml or empties it is refused with exactly this envelope — one problem,
   * at the root. `packages/mock/src/fixtures.ts`'s `EMPTIED_MANIFEST` copies it so the guides'
   * *check a manifest* example can run against the mock; this is the platform's half, and a
   * change to either wording must change both.
   */
  it('refuses a deleted or emptied manifest.yaml with one problem at the root — the envelope the mock plays', async () => {
    await withProjectServer(async (ctx) => {
      for (const change of [
        { op: 'delete', path: 'manifest.yaml' },
        { op: 'write', path: 'manifest.yaml', content: '' },
        { op: 'write', path: 'manifest.yaml', content: '  \n' },
      ]) {
        const res = await post(ctx, commitBody(ctx.commitSha, [change], { dryRun: true }))
        expect(res.statusCode, JSON.stringify(change)).toBe(422)
        expect(JSON.parse(res.body)).toEqual({
          error: {
            code: 'SPEC_INVALID',
            message: 'the manifest.yaml in this commit is not valid',
            hint: 'Fix each path `details` lists in manifest.yaml, then commit or push again.',
            details: [
              {
                code: 'SPEC_INVALID_VALUE',
                path: '',
                message: 'Expected object, received null',
                hint: 'Check the type and permitted values of this field in the ManifestYaml schema.',
              },
            ],
          },
        })
      }
      // The positive half: the base's own manifest, unchanged, is valid in the same dry run.
      const kept = await post(
        ctx,
        commitBody(ctx.commitSha, [{ op: 'write', path: 'README.md', content: 'hi\n' }], {
          dryRun: true,
        }),
      )
      expect(kept.statusCode, kept.body).toBe(201)
    })
  })

  it('carries a validation’s WARNINGS — on the dry run, on the commit, and on validateSpec — and a warning never makes a commit invalid (Spec action 4)', async () => {
    await withProjectServer(async (ctx) => {
      const manifest = await manifestWith(
        ctx,
        'ai:',
        '  budget:',
        '    per_user_monthly_usd: 2',
      )
      const change = [{ op: 'write', path: 'manifest.yaml', content: manifest }]
      const codes = (w: { code: string }[]) => w.map((x) => x.code)
      const dry = await post(ctx, commitBody(ctx.commitSha, change, { dryRun: true }))
      expect(dry.statusCode, dry.body).toBe(201)
      expect(codes(dry.json().spec.warnings)).toEqual(['SPEC_FIELD_NOT_ENFORCED'])
      const made = await post(ctx, commitBody(ctx.commitSha, change))
      expect(made.statusCode, made.body).toBe(201)
      expect(codes(made.json().spec.warnings)).toEqual(['SPEC_FIELD_NOT_ENFORCED'])
      const validated = await ctx.app.inject({
        method: 'POST',
        url: `/v1/projects/${ctx.projectId}/spec`,
        cookies: ctx.ownerCookies,
        headers: mutationHeaders(ctx.deps),
        payload: { commitSha: made.json().commitSha },
      })
      expect(validated.statusCode, validated.body).toBe(201)
      expect(validated.json()).toMatchObject({ valid: true, errors: [] })
      expect(validated.json().warnings).toEqual([
        expect.objectContaining({
          code: 'SPEC_FIELD_NOT_ENFORCED',
          path: 'ai.budget.per_user_monthly_usd',
        }),
      ])
      // THE PUBLISHED EXAMPLES SAY EXACTLY THIS — createCommit's and validateSpec's warnings are
      // what the route answers for $2, so the document's examples are captured, not invented.
      const example = (operationId: string) =>
        ROUTE_DEFINITIONS.find((r) => r.operationId === operationId)!.examples
          .response as { spec?: { warnings: unknown }; warnings?: unknown }
      expect(example('createCommit').spec!.warnings).toEqual(made.json().spec.warnings)
      expect(example('validateSpec').warnings).toEqual(validated.json().warnings)
      // Above the project's AI quota it is an ERROR, refused before anything is written.
      const over = await post(
        ctx,
        commitBody(made.json().commitSha, [
          {
            op: 'write',
            path: 'manifest.yaml',
            content: manifest.replace(
              'per_user_monthly_usd: 2',
              'per_user_monthly_usd: 100000',
            ),
          },
        ]),
      )
      expect(refusal(over)).toEqual({ status: 422, code: 'SPEC_INVALID' })
      expect(errorOf(over).details).toEqual([
        expect.objectContaining({
          code: 'SPEC_QUOTA_EXCEEDED',
          path: 'ai.budget.per_user_monthly_usd',
        }),
      ])
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
        spec: {
          appSpecId: null,
          sensitiveDiff: { sensitive: false, fields: [] },
          warnings: [],
        },
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

  /**
   * THE MESSAGE IS PART OF THE COMMIT (Review Focus 4): it goes into git history — and GitHub's,
   * on driver 2 — and its subject into `repository.committed`'s sentence, where the redactor's
   * heuristics do not catch an AWS key id (20 characters; the entropy rule starts at 24 — Task
   * 6's control (b′)). No driver's scan reads a message, so the route does.
   */
  it('refuses a secret in the commit MESSAGE too — the value in neither history nor the record', async () => {
    await withProjectServer(async (ctx) => {
      const value = SAMPLE_SECRETS['an AWS access key id']
      const res = await post(ctx, {
        baseCommit: ctx.commitSha,
        message: `use the key ${value}`,
        changes: [{ op: 'write', path: 'a.txt', content: 'a\n' }],
      })
      expect(refusal(res)).toEqual({ status: 409, code: 'SOURCE_SECRET_DETECTED' })
      expect(res.body).not.toContain(value)
      expect(await headOf(ctx)).toBe(ctx.commitSha)
      const refused = await eventsOf(ctx, [
        'repository.secret_refused',
        'repository.committed',
      ])
      expect(refused.map((e) => [e.type, e.machineDetail])).toEqual([
        [
          'repository.secret_refused',
          {
            findings: [
              { path: '(the commit message)', line: 1, rule: 'an AWS access key id' },
            ],
          },
        ],
      ])
      expect(JSON.stringify(refused)).not.toContain(value)
      // The positive control: the same commit with an ordinary message.
      const ok = await post(
        ctx,
        commitBody(ctx.commitSha, [{ op: 'write', path: 'a.txt', content: 'a\n' }]),
      )
      expect(ok.statusCode, ok.body).toBe(201)
    })
  })

  it('refuses a message with a NUL, a lone surrogate or an escape, before anything is scanned (F8)', async () => {
    await withProjectServer(async (ctx) => {
      const commit = vi.spyOn(ctx.deps.source, 'commit')
      const key = SAMPLE_SECRETS['an AWS access key id']
      // Each message ALSO carries a secret: were the text rules not first, the answer would be
      // 409 SOURCE_SECRET_DETECTED and a `repository.secret_refused` event.
      const cases: [string, RegExp][] = [
        [`a\u0000b ${key}`, /NUL|control character/],
        [`a\ud800b ${key}`, /well-formed/],
        [`colour\u001b[31m red ${key}`, /control character/],
        [`over\rwrite ${key}`, /control character/],
        [`c1\u009b31m ${key}`, /control character/],
      ]
      for (const [message, rule] of cases) {
        const res = await post(ctx, {
          baseCommit: ctx.commitSha,
          message,
          changes: [{ op: 'write', path: 'a.txt', content: 'a\n' }],
        })
        expect(refusal(res), JSON.stringify(message)).toEqual({
          status: 400,
          code: 'REQUEST_INVALID',
        })
        expect(errorOf(res).message).toMatch(/message/)
        expect(errorOf(res).message).toMatch(rule)
      }
      expect(commit).not.toHaveBeenCalled()
      expect(await eventsOf(ctx, ['repository.secret_refused'])).toEqual([])
      // The positive control: a subject, a blank line and a body with a tab commit as they did.
      const ok = await post(ctx, {
        baseCommit: ctx.commitSha,
        message: 'the subject\n\n\tan indented body line — é\n',
        changes: [{ op: 'write', path: 'a.txt', content: 'a\n' }],
      })
      expect(ok.statusCode, ok.body).toBe(201)
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

  it('a commit that LANDED is answered 201 and recorded even when its validation after the push fails — and the same key replays it (the final review’s Important 1)', async () => {
    await withProjectServer(async (ctx) => {
      // The failure lands in the one window that matters: the commit is on main, and the next
      // read — the validation's, of the new commit's manifest.yaml — fails, as a catalogue that
      // stopped answering between the check and the record would.
      const source = ctx.deps.source
      const realCommit = source.commit.bind(source)
      const realRead = source.readFile.bind(source)
      let landed = false
      vi.spyOn(source, 'commit').mockImplementation(async (repo, request) => {
        const done = await realCommit(repo, request)
        if (request.dryRun !== true) landed = true
        return done
      })
      vi.spyOn(source, 'readFile').mockImplementation(async (...args) => {
        if (landed) {
          landed = false
          throw new Error('the validation after the push could not read the manifest')
        }
        return realRead(...args)
      })
      const operator = vi.spyOn(console, 'error').mockImplementation(() => undefined)
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
      try {
        const first = await once()
        expect(first.statusCode, first.body).toBe(201)
        const outcome = first.json() as {
          commitSha: string
          spec: { appSpecId: string | null; warnings: unknown[] }
        }
        // Landed, and said so — with no recorded validation, which a build makes first.
        expect(await headOf(ctx)).toBe(outcome.commitSha)
        expect(outcome.spec.appSpecId).toBeNull()
        expect(outcome.spec.warnings).toEqual([])
        // The platform's own record of who made it exists regardless.
        const committed = await eventsOf(ctx, ['repository.committed'])
        expect(committed).toHaveLength(1)
        expect(committed[0]!.machineDetail.commitSha).toBe(outcome.commitSha)
        // And an operator line names the commit whose validation was not recorded.
        expect(operator.mock.calls.flat().map(String).join(' ')).toContain(
          outcome.commitSha,
        )
        // The documented retry: the same key is answered the first commit, never SOURCE_CONFLICT.
        const second = await once()
        expect(second.statusCode, second.body).toBe(201)
        expect(second.json()).toEqual(first.json())
        const history = (await get(ctx, '/commits')).json() as {
          commits: { commitSha: string; madeThrough: unknown }[]
        }
        expect(history.commits).toHaveLength(2)
        expect(history.commits[0]!.madeThrough).toMatchObject({ kind: 'person' })
      } finally {
        operator.mockRestore()
      }
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

/**
 * BINARY FILES (the front-end enablement plan's Task 4, Decisions 7–10; Review Focus 5): a write's
 * `encoding: 'base64'`, confined to ten media types by their bytes, refused for text sent as bytes,
 * and scanned for secrets by its printable runs — and `getFile?encoding=base64` reading the bytes
 * back. Every sample is BUILT from its magic bytes.
 */
describe('createCommit — binary files, as base64 (the front-end enablement plan’s Task 4)', () => {
  const MiB = 1024 * 1024
  /** A PNG's head, then every byte value — most of them no UTF-8 sequence at all. */
  const PNG = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]),
    Buffer.from('IHDR', 'latin1'),
    Buffer.from(Array.from({ length: 1024 }, (_, i) => 255 - (i % 256))),
  ])
  const b64 = (bytes: Buffer | string) =>
    (typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : bytes).toString('base64')
  const bytesWrite = (path: string, bytes: Buffer | string) => ({
    op: 'write',
    path,
    content: b64(bytes),
    encoding: 'base64',
  })

  it('commits a PNG as bytes, and reads back exactly those bytes', async () => {
    await withProjectServer(async (ctx) => {
      const res = await post(
        ctx,
        commitBody(ctx.commitSha, [
          bytesWrite('public/logo.png', PNG),
          // A text write beside it, with its encoding said — the default made explicit.
          {
            op: 'write',
            path: 'public/index.html',
            content: '<img src=logo.png>\n',
            encoding: 'utf8',
          },
        ]),
      )
      expect(res.statusCode, res.body).toBe(201)
      const head = (res.json() as { commitSha: string }).commitSha
      const read = await get(
        ctx,
        `/file?path=public/logo.png&ref=${head}&encoding=base64`,
      )
      expect(read.statusCode, read.body).toBe(200)
      expect(read.json()).toMatchObject({
        commitSha: head,
        path: 'public/logo.png',
        encoding: 'base64',
        content: b64(PNG),
        size: PNG.length,
        mode: '100644',
      })
      // git's own id for the bytes: what a person's `git hash-object` says of the same file.
      expect((read.json() as { blobSha: string }).blobSha).toBe(
        execFileSync('git', ['hash-object', '--stdin'], { input: PNG }).toString().trim(),
      )
      const tree = (await get(ctx, `/tree?ref=${head}`)).json() as {
        entries: { path: string; binary: boolean | null }[]
      }
      expect(tree.entries.find((e) => e.path === 'public/logo.png')?.binary).toBe(true)
      expect(tree.entries.find((e) => e.path === 'public/index.html')?.binary).toBe(false)
      // …and as TEXT it is still refused, by the read's own code, pointing at the byte read.
      const asText = await get(ctx, `/file?path=public/logo.png&ref=${head}`)
      expect(refusal(asText)).toEqual({ status: 409, code: 'SOURCE_FILE_NOT_TEXT' })
      expect(errorOf(asText).message).toMatch(/encoding=base64/)
      // A binary manifest.yaml is refused by its NAME before its bytes are read as a manifest
      // (the whole-branch review's I1: a PDF-headed manifest parsed as valid YAML).
      expect(
        refusal(await post(ctx, commitBody(head, [bytesWrite('manifest.yaml', PNG)]))),
      ).toEqual({ status: 400, code: 'REQUEST_INVALID' })
      expect(await headOf(ctx)).toBe(head)
    })
  })

  it('refuses text sent as bytes', async () => {
    await withProjectServer(async (ctx) => {
      const commit = vi.spyOn(ctx.deps.source, 'commit')
      const res = await post(
        ctx,
        commitBody(ctx.commitSha, [bytesWrite('src/run.js', 'console.log(1)\n')]),
      )
      expect(refusal(res)).toEqual({ status: 400, code: 'REQUEST_INVALID' })
      expect(errorOf(res).message).toMatch(/body\.changes\.0\.content/)
      expect(errorOf(res).message).toMatch(
        /'src\/run\.js' is text; send it with encoding: 'utf8'/,
      )
      // A SCRIPT THAT BEGINS LIKE A PDF — or a font, or a GIF — is still text. The media-type
      // rule reads only its first bytes and would take it; the text rule is what refuses it.
      for (const disguised of [
        "%PDF-1.4\nrequire('child_process').execSync('id')\n",
        'OTTO = 1\n',
        'GIF89a; process.exit(0)\n',
      ]) {
        const as = await post(
          ctx,
          commitBody(ctx.commitSha, [bytesWrite('public/logo.pdf', disguised)]),
        )
        expect(refusal(as), disguised.slice(0, 8)).toEqual({
          status: 400,
          code: 'REQUEST_INVALID',
        })
        expect(errorOf(as).message).toMatch(/'public\/logo\.pdf' is text/)
      }
      expect(commit).not.toHaveBeenCalled()
      // The positive control: the same text, sent as text, commits.
      const ok = await post(
        ctx,
        commitBody(ctx.commitSha, [
          { op: 'write', path: 'src/run.js', content: 'console.log(1)\n' },
        ]),
      )
      expect(ok.statusCode, ok.body).toBe(201)
    })
  })

  it('refuses an executable whatever its name', async () => {
    await withProjectServer(async (ctx) => {
      const commit = vi.spyOn(ctx.deps.source, 'commit')
      const elf = Buffer.concat([
        Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0]),
        PNG.subarray(16),
      ])
      const zip = Buffer.concat([
        Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0]),
        PNG.subarray(16),
      ])
      for (const [path, bytes] of [
        ['public/logo.png', elf],
        ['fonts/body.woff2', zip],
      ] as const) {
        const res = await post(ctx, commitBody(ctx.commitSha, [bytesWrite(path, bytes)]))
        expect(refusal(res), path).toEqual({ status: 400, code: 'REQUEST_INVALID' })
        expect(errorOf(res).message).toContain(`'${path}'`)
        expect(errorOf(res).message).toMatch(
          /only images \(PNG, JPEG, GIF, WebP, ICO\), PDF and fonts \(WOFF, WOFF2, TTF, OTF\) may be written as bytes/,
        )
      }
      expect(commit).not.toHaveBeenCalled()
      // The positive control: a real PNG's bytes at the same path commit.
      const ok = await post(
        ctx,
        commitBody(ctx.commitSha, [bytesWrite('public/logo.png', PNG)]),
      )
      expect(ok.statusCode, ok.body).toBe(201)
    })
  })

  it('refuses a key inside a PDF’s printable text, naming the path and rule, never the value', async () => {
    await withProjectServer(async (ctx) => {
      const value = SAMPLE_SECRETS['an AWS access key id']
      const pdf = (inside: string) =>
        Buffer.concat([
          Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1'),
          Buffer.from([0]),
          Buffer.from(`(${inside}) Tj`, 'latin1'),
          Buffer.from([0, 0xff, 0xfe]),
        ])
      const res = await post(
        ctx,
        commitBody(ctx.commitSha, [bytesWrite('docs/syllabus.pdf', pdf(`key ${value}`))]),
      )
      expect(refusal(res)).toEqual({ status: 409, code: 'SOURCE_SECRET_DETECTED' })
      expect(res.body).toContain('docs/syllabus.pdf:1')
      expect(res.body).toContain('an AWS access key id')
      expect(res.body).not.toContain(value)
      const refused = await eventsOf(ctx, ['repository.secret_refused'])
      expect(refused.map((e) => e.machineDetail)).toEqual([
        {
          findings: [
            { path: 'docs/syllabus.pdf', line: 1, rule: 'an AWS access key id' },
          ],
        },
      ])
      expect(JSON.stringify(refused)).not.toContain(value)
      expect(await headOf(ctx)).toBe(ctx.commitSha)
      // The positive control: the same PDF without the key commits.
      const ok = await post(
        ctx,
        commitBody(ctx.commitSha, [
          bytesWrite('docs/syllabus.pdf', pdf('Chemistry 101')),
        ]),
      )
      expect(ok.statusCode, ok.body).toBe(201)
    })
  })

  it('refuses base64 that is not canonical', async () => {
    await withProjectServer(async (ctx) => {
      const good = b64(PNG)
      for (const content of [
        `${good.slice(0, 8)} ${good.slice(8)}`, // a space
        `${good.slice(0, 76)}\n${good.slice(76)}`, // a MIME line break
        good.replace(/=+$/, ''), // padding dropped
        b64(Buffer.concat([PNG, Buffer.from([0xfb, 0xff])]))
          .replace(/\+/g, '-')
          .replace(/\//g, '_'), // base64url
      ]) {
        expect(content).not.toBe(good)
        const res = await post(
          ctx,
          commitBody(ctx.commitSha, [
            { op: 'write', path: 'public/logo.png', content, encoding: 'base64' },
          ]),
        )
        expect(refusal(res), content.slice(0, 20)).toEqual({
          status: 400,
          code: 'REQUEST_INVALID',
        })
        expect(errorOf(res).message).toMatch(/canonical base64/)
      }
      // The positive control: the canonical form of the same bytes commits.
      const ok = await post(
        ctx,
        commitBody(ctx.commitSha, [
          { op: 'write', path: 'public/logo.png', content: good, encoding: 'base64' },
        ]),
      )
      expect(ok.statusCode, ok.body).toBe(201)
    })
  })

  it('refuses a binary over 2 MiB', async () => {
    await withProjectServer(async (ctx) => {
      const sized = (n: number) =>
        Buffer.concat([PNG, Buffer.alloc(n - PNG.length, 0xab)])
      const over = await post(
        ctx,
        commitBody(ctx.commitSha, [bytesWrite('public/big.png', sized(2 * MiB + 1))]),
      )
      expect(refusal(over)).toEqual({ status: 400, code: 'REQUEST_INVALID' })
      expect(errorOf(over).message).toMatch(/2 MiB/)
      // The positive control: exactly 2 MiB commits, and reads back whole.
      const exact = await post(
        ctx,
        commitBody(ctx.commitSha, [bytesWrite('public/big.png', sized(2 * MiB))]),
      )
      expect(exact.statusCode, exact.body.slice(0, 300)).toBe(201)
      const head = (exact.json() as { commitSha: string }).commitSha
      const read = await get(ctx, `/file?path=public/big.png&ref=${head}&encoding=base64`)
      expect((read.json() as { size: number }).size).toBe(2 * MiB)
    })
  })

  /**
   * THE WHOLE-BRANCH REVIEW'S I1 AND I2: Decision 8's text rule reads only UTF-8 and a NUL, and
   * Decision 9's kinds only a 4–8-byte prefix — so a page that begins `%PDF-1.4\n\0` is neither
   * text nor refused, and an app serves `index.html` as HTML by its name while git and every diff
   * call it binary. A binary write's PATH must end in one of the ten kinds' extensions — any of
   * them for any kind, so `[M11]`'s PNG named `.jpg` is still taken.
   */
  it('refuses bytes at a path that is none of the ten kinds’ names — a PDF-headed page, a crafted manifest — and takes a PNG named .JPG', async () => {
    await withProjectServer(async (ctx) => {
      const commit = vi.spyOn(ctx.deps.source, 'commit')
      const page = Buffer.from(
        '%PDF-1.4\n\u0000<script>alert(document.cookie)</script>\n',
        'latin1',
      )
      const manifest = (await get(ctx, '/file?path=manifest.yaml')).json() as {
        content: string
      }
      const crafted = Buffer.from(`%PDF-1.4\n---\n${manifest.content}# \u0000\n`, 'utf8')
      for (const [path, bytes] of [
        ['public/index.html', page],
        ['manifest.yaml', crafted],
        ['server.js', page],
        ['public/logo.png.sh', PNG],
      ] as const) {
        const res = await post(ctx, commitBody(ctx.commitSha, [bytesWrite(path, bytes)]))
        expect(refusal(res), path).toEqual({ status: 400, code: 'REQUEST_INVALID' })
        expect(errorOf(res).message).toContain(`'${path}'`)
        expect(errorOf(res).message).toMatch(
          /\.png, \.jpg, \.jpeg, \.gif, \.webp, \.ico, \.pdf, \.woff, \.woff2, \.ttf, \.otf/,
        )
      }
      expect(commit).not.toHaveBeenCalled()
      // The positive control: a PNG named .JPG — another kind's name, in capitals — commits.
      const ok = await post(
        ctx,
        commitBody(ctx.commitSha, [bytesWrite('public/logo.JPG', PNG)]),
      )
      expect(ok.statusCode, ok.body).toBe(201)
    })
  })
})
