import { createHash } from 'node:crypto'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { events, idempotencyKeys, incidents, instances } from '../db/index.js'
import { makeRedactor } from '../observability/index.js'
import type { InstanceSpec } from '../runtime/index.js'
import {
  mutationHeaders,
  refusal,
  sessionFor,
  withProjectServer,
  type TestProject,
} from './testing.js'

/**
 * AN APP'S DECLARED SECRETS (the authoring API plan's Task 8, Decision 13): set write-only per
 * environment, listed by name, rendered at deploy — and a deploy refused, before anything
 * starts, when a declared one has no value. Production per Spec action 2, option (a): a token
 * sets sandbox and staging values; a production value is set only in a session with step-up.
 *
 * Every refusal asserts its CODE. `VALUE` must reach no answer, no event and no Incident.
 */

const NAME = 'BOARD_ADMIN_CODE'
/** Fourteen characters: redacted by the app's own secret set, and by no heuristic (asserted). */
const VALUE = 'swordfish-7c2e'

type Auth = { cookies?: Record<string, string>; headers?: Record<string, string> }

const as = (ctx: TestProject, auth: Auth = {}) =>
  auth.headers === undefined ? { cookies: auth.cookies ?? ctx.ownerCookies } : {}

const secretsUrl = (environmentId: string, name?: string) =>
  `/v1/environments/${environmentId}/secrets${name === undefined ? '' : `/${name}`}`

const put = (
  ctx: TestProject,
  environmentId: string,
  name: string,
  value: unknown,
  auth: Auth = {},
) =>
  ctx.app.inject({
    method: 'PUT',
    url: secretsUrl(environmentId, name),
    ...as(ctx, auth),
    headers: { ...mutationHeaders(ctx.deps), ...auth.headers },
    payload: { value } as Record<string, unknown>,
  })

const clear = (ctx: TestProject, environmentId: string, name: string, auth: Auth = {}) =>
  ctx.app.inject({
    method: 'DELETE',
    url: secretsUrl(environmentId, name),
    ...as(ctx, auth),
    headers: { ...mutationHeaders(ctx.deps), ...auth.headers },
  })

const list = (ctx: TestProject, environmentId: string, auth: Auth = {}) =>
  ctx.app.inject({
    method: 'GET',
    url: secretsUrl(environmentId),
    ...as(ctx, auth),
    ...(auth.headers === undefined ? {} : { headers: auth.headers }),
  })

const get = (ctx: TestProject, url: string) =>
  ctx.app.inject({
    method: 'GET',
    url: `/v1/projects/${ctx.projectId}${url}`,
    cookies: ctx.ownerCookies,
  })

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

/** The seeded manifest with `lines` appended, committed through `createCommit`. */
async function commitManifest(ctx: TestProject, ...lines: string[]): Promise<string> {
  const head = ((await get(ctx, '/tree')).json() as { commitSha: string }).commitSha
  const manifest = (
    (await get(ctx, `/file?path=manifest.yaml&ref=${head}`)).json() as { content: string }
  ).content
  const res = await ctx.app.inject({
    method: 'POST',
    url: `/v1/projects/${ctx.projectId}/commits`,
    cookies: ctx.ownerCookies,
    headers: mutationHeaders(ctx.deps),
    payload: {
      baseCommit: head,
      message: 'declare a secret',
      changes: [
        {
          op: 'write',
          path: 'manifest.yaml',
          content: `${manifest}${lines.map((l) => `${l}\n`).join('')}`,
        },
      ],
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { commitSha: string }).commitSha
}

const declaring = (...names: string[]) => [
  'env:',
  ...names.flatMap((n) => [`  - name: ${n}`, '    secret: true']),
]

/** Build `commitSha`, release it, and deploy it to `environmentId` — through the routes. */
async function deployCommit(ctx: TestProject, commitSha: string, environmentId: string) {
  const mutate = (url: string, payload: Record<string, unknown>) =>
    ctx.app.inject({
      method: 'POST',
      url,
      cookies: ctx.ownerCookies,
      headers: mutationHeaders(ctx.deps),
      payload,
    })
  const build = await mutate(`/v1/projects/${ctx.projectId}/builds`, { commitSha })
  expect(build.statusCode, build.body).toBe(202)
  await ctx.deps.builds.idle()
  const release = await mutate(`/v1/projects/${ctx.projectId}/releases`, {
    buildId: (build.json() as { id: string }).id,
  })
  expect(release.statusCode, release.body).toBe(201)
  return mutate(`/v1/environments/${environmentId}/deploy`, {
    releaseId: (release.json() as { id: string }).id,
  })
}

/** `audit.events` of the two secret types for the fixture project, oldest first. */
const secretEvents = (ctx: TestProject) =>
  ctx.db
    .select({
      type: events.type,
      machineDetail: events.machineDetail,
      humanMessage: events.humanMessage,
    })
    .from(events)
    .where(
      and(
        eq(events.projectId, ctx.projectId),
        inArray(events.type, ['app_secret.set', 'app_secret.cleared']),
      ),
    )
    .orderBy(asc(events.createdAt))

type Status = { name: string; declared: boolean; set: boolean; updatedAt: string | null }

describe('an app’s declared secrets — write-only, per environment (Task 8)', () => {
  it('sets a value, lists the name as set — and no operation ever answers the value', async () => {
    await withProjectServer(async (ctx) => {
      await commitManifest(ctx, ...declaring(NAME))
      const set = await put(ctx, ctx.stagingEnvironmentId, NAME, VALUE)
      expect(set.statusCode, set.body).toBe(200)
      expect(set.json()).toMatchObject({ name: NAME, declared: true, set: true })
      expect((set.json() as Status).updatedAt).toMatch(/^\d{4}-\d\d-\d\dT/)
      expect(set.body).not.toContain('swordfish')
      const listed = await list(ctx, ctx.stagingEnvironmentId)
      expect(listed.statusCode, listed.body).toBe(200)
      expect(listed.json()).toEqual({
        environmentId: ctx.stagingEnvironmentId,
        environmentKind: 'staging',
        secrets: [
          { name: NAME, declared: true, set: true, updatedAt: expect.any(String) },
        ],
      })
      expect(listed.body).not.toContain('swordfish')
      // Per ENVIRONMENT: staging's value is not production's.
      expect((await list(ctx, ctx.productionEnvironmentId)).json()).toMatchObject({
        environmentKind: 'production',
        secrets: [{ name: NAME, declared: true, set: false, updatedAt: null }],
      })
    })
  })

  it('one Idempotency-Key on ANOTHER secret is IDEMPOTENCY_KEY_REUSED — never the first secret’s answer replayed (the final review’s Important 2)', async () => {
    await withProjectServer(async (ctx) => {
      // The resource is all in the path here — the body is only `{ value }`, and a clear has no
      // body at all — so a fingerprint of the body alone cannot tell two secrets apart.
      const headers = mutationHeaders(ctx.deps)
      const putWith = (name: string) =>
        ctx.app.inject({
          method: 'PUT',
          url: secretsUrl(ctx.stagingEnvironmentId, name),
          cookies: ctx.ownerCookies,
          headers,
          payload: { value: VALUE },
        })
      const first = await putWith(NAME)
      expect(first.statusCode, first.body).toBe(200)
      // The positive control: the same key, path and body is the retry, answered the first time.
      const retry = await putWith(NAME)
      expect(retry.statusCode, retry.body).toBe(200)
      expect(retry.json()).toEqual(first.json())
      // Another secret, the same key and body: a different request.
      expect(refusal(await putWith('SIS_API_KEY'))).toEqual({
        status: 409,
        code: 'IDEMPOTENCY_KEY_REUSED',
      })
      const listed = (await list(ctx, ctx.stagingEnvironmentId)).json() as {
        secrets: { name: string; set: boolean }[]
      }
      expect(listed.secrets.find((s) => s.name === 'SIS_API_KEY')).toBeUndefined()
      // Two clears, no body at all, one key: the second is refused, not answered as the first.
      const clearHeaders = mutationHeaders(ctx.deps)
      const clearWith = (name: string) =>
        ctx.app.inject({
          method: 'DELETE',
          url: secretsUrl(ctx.stagingEnvironmentId, name),
          cookies: ctx.ownerCookies,
          headers: clearHeaders,
        })
      expect((await clearWith('SIS_API_KEY')).statusCode).toBe(200)
      expect(refusal(await clearWith(NAME))).toEqual({
        status: 409,
        code: 'IDEMPOTENCY_KEY_REUSED',
      })
      const after = (await list(ctx, ctx.stagingEnvironmentId)).json() as {
        secrets: { name: string; set: boolean }[]
      }
      expect(after.secrets.find((s) => s.name === NAME)?.set).toBe(true)
    })
  })

  it('keeps nothing in the idempotency record a reader of the database could check the value against', async () => {
    await withProjectServer(async (ctx) => {
      expect((await put(ctx, ctx.stagingEnvironmentId, NAME, VALUE)).statusCode).toBe(200)
      const [row] = await ctx.db
        .select()
        .from(idempotencyKeys)
        .where(
          eq(idempotencyKeys.route, 'PUT /v1/environments/:environmentId/secrets/:name'),
        )
      // The positive control: the record exists, so a retry replays.
      expect(row).toBeDefined()
      expect(row!.requestHash).not.toBe(
        createHash('sha256')
          .update(JSON.stringify({ value: VALUE }))
          .digest('hex'),
      )
      expect(JSON.stringify(row)).not.toContain('swordfish')
    })
  })

  it('lists a declared name with no value as unset — the state that stops a deploy', async () => {
    await withProjectServer(async (ctx) => {
      // The positive control first: the seed declares nothing, so the list is empty.
      expect((await list(ctx, ctx.stagingEnvironmentId)).json()).toMatchObject({
        secrets: [],
      })
      await commitManifest(ctx, ...declaring(NAME, 'SIS_API_KEY'))
      expect((await list(ctx, ctx.stagingEnvironmentId)).json()).toMatchObject({
        secrets: [
          { name: NAME, declared: true, set: false, updatedAt: null },
          { name: 'SIS_API_KEY', declared: true, set: false, updatedAt: null },
        ],
      })
    })
  })

  it('takes a value before the manifest declares it — listed undeclared, set', async () => {
    await withProjectServer(async (ctx) => {
      const set = await put(ctx, ctx.stagingEnvironmentId, NAME, VALUE)
      expect(set.statusCode, set.body).toBe(200)
      expect(set.json()).toMatchObject({ name: NAME, declared: false, set: true })
      expect((await list(ctx, ctx.stagingEnvironmentId)).json()).toMatchObject({
        secrets: [{ name: NAME, declared: false, set: true }],
      })
    })
  })

  it('reads a declaration from the manifest AS RESOLVED for the environment — a production override is production’s alone', async () => {
    await withProjectServer(async (ctx) => {
      await commitManifest(
        ctx,
        'environments:',
        '  production:',
        '    env:',
        '      - name: PROD_ONLY_KEY',
        '        secret: true',
      )
      expect((await list(ctx, ctx.productionEnvironmentId)).json()).toMatchObject({
        secrets: [{ name: 'PROD_ONLY_KEY', declared: true, set: false }],
      })
      expect((await list(ctx, ctx.stagingEnvironmentId)).json()).toMatchObject({
        secrets: [],
      })
    })
  })

  it('refuses a platform-reserved name by its own code, and a malformed one as a malformed request', async () => {
    await withProjectServer(async (ctx) => {
      // The positive control: an ordinary name is taken.
      expect((await put(ctx, ctx.stagingEnvironmentId, 'MY_KEY', VALUE)).statusCode).toBe(
        200,
      )
      for (const reserved of ['MONGODB_URI', 'SESSION_SECRET', 'PORT']) {
        expect(
          refusal(await put(ctx, ctx.stagingEnvironmentId, reserved, VALUE)),
        ).toEqual({
          status: 400,
          code: 'SECRET_NAME_RESERVED',
        })
        expect(refusal(await clear(ctx, ctx.stagingEnvironmentId, reserved))).toEqual({
          status: 400,
          code: 'SECRET_NAME_RESERVED',
        })
      }
      for (const malformed of ['lower', '1ABC', `A${'B'.repeat(128)}`]) {
        expect(
          refusal(await put(ctx, ctx.stagingEnvironmentId, malformed, VALUE)),
        ).toEqual({
          status: 400,
          code: 'REQUEST_INVALID',
        })
      }
    })
  })

  it('refuses a value the platform could not hold safely — too short to redact, not text, too long', async () => {
    await withProjectServer(async (ctx) => {
      const ok = (value: string) => put(ctx, ctx.stagingEnvironmentId, NAME, value)
      // Positive controls: six characters, and 16384 bytes exactly (é is two).
      expect((await ok('abcdef')).statusCode).toBe(200)
      expect((await ok('é'.repeat(8192))).statusCode).toBe(200)
      for (const bad of [
        'abcde',
        '',
        'abc\u0000def',
        'abcdef\ud800',
        'é'.repeat(8192) + 'x',
        42,
      ]) {
        expect(refusal(await put(ctx, ctx.stagingEnvironmentId, NAME, bad))).toEqual({
          status: 400,
          code: 'REQUEST_INVALID',
        })
      }
    })
  })

  it('clears a value, idempotently — and announces only a value that was there', async () => {
    await withProjectServer(async (ctx) => {
      await commitManifest(ctx, ...declaring(NAME))
      expect((await put(ctx, ctx.stagingEnvironmentId, NAME, VALUE)).statusCode).toBe(200)
      for (let i = 0; i < 2; i += 1) {
        const res = await clear(ctx, ctx.stagingEnvironmentId, NAME)
        expect(res.statusCode, res.body).toBe(200)
        expect(res.json()).toEqual({
          name: NAME,
          declared: true,
          set: false,
          updatedAt: null,
        })
      }
      expect((await list(ctx, ctx.stagingEnvironmentId)).json()).toMatchObject({
        secrets: [{ name: NAME, declared: true, set: false }],
      })
      expect((await secretEvents(ctx)).map((e) => e.type)).toEqual([
        'app_secret.set',
        'app_secret.cleared',
      ])
    })
  })

  it('announces who set and cleared a value, by name — never the value, never a PUID', async () => {
    await withProjectServer(async (ctx) => {
      expect((await put(ctx, ctx.stagingEnvironmentId, NAME, VALUE)).statusCode).toBe(200)
      const token = await mint(ctx, 'board-agent', ['secret:write'])
      expect(
        (await clear(ctx, ctx.stagingEnvironmentId, NAME, { headers: token })).statusCode,
      ).toBe(200)
      const recorded = await secretEvents(ctx)
      expect(recorded).toHaveLength(2)
      expect(recorded[0]).toMatchObject({
        type: 'app_secret.set',
        machineDetail: {
          environmentKind: 'staging',
          name: NAME,
          via: 'session',
          userId: ctx.userId,
          tokenId: null,
        },
      })
      expect(recorded[0]!.humanMessage).toMatch(/^Bio Prof set BOARD_ADMIN_CODE /)
      expect(recorded[1]).toMatchObject({
        type: 'app_secret.cleared',
        machineDetail: { environmentKind: 'staging', name: NAME, via: 'token' },
      })
      expect(recorded[1]!.humanMessage).toMatch(
        /^Bio Prof's agent \(token 'board-agent'\) cleared BOARD_ADMIN_CODE /,
      )
      expect(JSON.stringify(recorded)).not.toContain('swordfish')
      expect(JSON.stringify(recorded)).not.toContain('bio_prof')
    })
  })

  it('a token sets a staging value, and is refused production outright', async () => {
    await withProjectServer(async (ctx) => {
      // `secret:write` ALONE: the capability this route asserts, and nothing else.
      const token = await mint(ctx, 'secrets-agent', ['secret:write'])
      const staging = await put(ctx, ctx.stagingEnvironmentId, NAME, VALUE, {
        headers: token,
      })
      expect(staging.statusCode, staging.body).toBe(200)
      expect(
        refusal(
          await put(ctx, ctx.productionEnvironmentId, NAME, VALUE, { headers: token }),
        ),
      ).toEqual({ status: 403, code: 'TOKEN_CREDENTIAL_REFUSED' })
      expect(
        refusal(await clear(ctx, ctx.productionEnvironmentId, NAME, { headers: token })),
      ).toEqual({ status: 403, code: 'TOKEN_CREDENTIAL_REFUSED' })
      // And nothing was stored for production.
      expect((await list(ctx, ctx.productionEnvironmentId)).json()).toMatchObject({
        secrets: [],
      })
    })
  })

  it('refuses a token that holds project:write and not secret:write — the matrix cannot see this (sitting 3’s F9)', async () => {
    await withProjectServer(async (ctx) => {
      const token = await mint(ctx, 'writer', ['project:read', 'project:write'])
      expect(
        refusal(
          await put(ctx, ctx.stagingEnvironmentId, NAME, VALUE, { headers: token }),
        ),
      ).toEqual({ status: 403, code: 'FORBIDDEN' })
      // project:read is enough to LIST names — the positive control for the same token.
      expect(
        (await list(ctx, ctx.stagingEnvironmentId, { headers: token })).statusCode,
      ).toBe(200)
    })
  })

  it('a person sets a production value only with step-up', async () => {
    await withProjectServer(async (ctx) => {
      expect(refusal(await put(ctx, ctx.productionEnvironmentId, NAME, VALUE))).toEqual({
        status: 403,
        code: 'STEP_UP_REQUIRED',
      })
      expect(refusal(await clear(ctx, ctx.productionEnvironmentId, NAME))).toEqual({
        status: 403,
        code: 'STEP_UP_REQUIRED',
      })
      const stepped = await put(ctx, ctx.productionEnvironmentId, NAME, VALUE, {
        cookies: ctx.ownerSteppedUp,
      })
      expect(stepped.statusCode, stepped.body).toBe(200)
      expect(
        (
          await clear(ctx, ctx.productionEnvironmentId, NAME, {
            cookies: ctx.ownerSteppedUp,
          })
        ).statusCode,
      ).toBe(200)
      // Staging asks no step-up of a person — the positive control for the plain session.
      expect((await put(ctx, ctx.stagingEnvironmentId, NAME, VALUE)).statusCode).toBe(200)
    })
  })

  it('answers another project’s environment 404, found from the environment row, never the request', async () => {
    await withProjectServer(async (ctx) => {
      const stranger = await sessionFor(ctx, 'unrelated_user')
      for (const res of [
        await put(ctx, ctx.stagingEnvironmentId, NAME, VALUE, { cookies: stranger }),
        await put(ctx, ctx.productionEnvironmentId, NAME, VALUE, { cookies: stranger }),
        await clear(ctx, ctx.stagingEnvironmentId, NAME, { cookies: stranger }),
        await list(ctx, ctx.stagingEnvironmentId, { cookies: stranger }),
        await put(ctx, '00000000-0000-4000-8000-000000000000', NAME, VALUE),
      ]) {
        expect(refusal(res)).toEqual({ status: 404, code: 'NOT_FOUND' })
      }
    })
  })
})

describe('a deploy renders what is set, and refuses what is declared and not set (Task 8)', () => {
  it('refuses to deploy a release whose declared secret has no value — before any instance exists — and renders it once set', async () => {
    await withProjectServer(async (ctx) => {
      const commitSha = await commitManifest(ctx, ...declaring(NAME))
      const ensure = vi.spyOn(ctx.deps.driver, 'ensureInstance')
      const refused = await deployCommit(ctx, commitSha, ctx.stagingEnvironmentId)
      expect(refusal(refused)).toEqual({ status: 409, code: 'RELEASE_SECRET_NOT_SET' })
      expect(refused.body).toContain(NAME)
      expect(ensure).not.toHaveBeenCalled()
      expect(
        await ctx.db
          .select()
          .from(instances)
          .where(eq(instances.environmentId, ctx.stagingEnvironmentId)),
      ).toEqual([])

      // A value for PRODUCTION does not satisfy staging.
      expect(
        (
          await put(ctx, ctx.productionEnvironmentId, NAME, VALUE, {
            cookies: ctx.ownerSteppedUp,
          })
        ).statusCode,
      ).toBe(200)
      expect(
        refusal(await deployCommit(ctx, commitSha, ctx.stagingEnvironmentId)),
      ).toEqual({
        status: 409,
        code: 'RELEASE_SECRET_NOT_SET',
      })

      expect((await put(ctx, ctx.stagingEnvironmentId, NAME, VALUE)).statusCode).toBe(200)
      const deployed = await deployCommit(ctx, commitSha, ctx.stagingEnvironmentId)
      expect(deployed.statusCode, deployed.body).toBe(200)
      expect((deployed.json() as { state: string }).state).toBe('healthy')
      expect(deployed.body).not.toContain('swordfish')
      const spec = ensure.mock.calls.at(-1)![0] as InstanceSpec
      expect(spec.env[NAME]).toBe(VALUE)
    })
  })

  it('renders ONLY a declared name — a value set and not declared never reaches the app', async () => {
    await withProjectServer(async (ctx) => {
      expect(
        (await put(ctx, ctx.stagingEnvironmentId, 'UNDECLARED_KEY', VALUE)).statusCode,
      ).toBe(200)
      const ensure = vi.spyOn(ctx.deps.driver, 'ensureInstance')
      const deployed = await deployCommit(ctx, ctx.commitSha, ctx.stagingEnvironmentId)
      expect(deployed.statusCode, deployed.body).toBe(200)
      const env = (ensure.mock.calls.at(-1)![0] as InstanceSpec).env
      // The positive control: the deploy rendered the platform's own rows.
      expect(env.MANIFEST_ENV).toBe('staging')
      expect(env).not.toHaveProperty('UNDECLARED_KEY')
      expect(Object.values(env)).not.toContain(VALUE)
    })
  })

  it('redacts a set value from the Incident of an app that prints it as it dies (§14)', async () => {
    await withProjectServer(async (ctx) => {
      // No heuristic catches it: only the app's own secret set, read at capture, can.
      expect(makeRedactor([])(VALUE)).toBe(VALUE)
      const commitSha = await commitManifest(ctx, ...declaring(NAME))
      expect((await put(ctx, ctx.stagingEnvironmentId, NAME, VALUE)).statusCode).toBe(200)
      vi.spyOn(ctx.deps.driver, 'status').mockResolvedValue({
        id: 'unused',
        state: 'failed',
        healthy: false,
      })
      vi.spyOn(ctx.deps.driver, 'logs').mockImplementation(async function* () {
        yield {
          at: new Date(),
          stream: 'stderr' as const,
          text: `boot failed; ${NAME}=${VALUE}`,
        }
      })
      const deployed = await deployCommit(ctx, commitSha, ctx.stagingEnvironmentId)
      expect(deployed.statusCode, deployed.body).toBe(200)
      expect((deployed.json() as { state: string }).state).toBe('failed')
      const [incident] = await ctx.db
        .select()
        .from(incidents)
        .where(eq(incidents.instanceId, (deployed.json() as { id: string }).id))
      expect(incident!.logTail).toBe(`boot failed; ${NAME}=[REDACTED]`)
      expect(JSON.stringify(incident)).not.toContain('swordfish')
    })
  })
})
