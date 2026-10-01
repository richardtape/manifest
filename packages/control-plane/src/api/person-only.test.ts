import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { count, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, describe, expect, it } from 'vitest'
import { z } from 'zod/v4'
import { delegatedTokens, pendingActions } from '../db/index.js'
import { resetDatabase } from '../db/testing.js'
import { ensureTestUser } from '../identity/testing.js'
import { assertCapability, PERSON_ONLY, type Capability } from '../projects/index.js'
import { mintTestToken } from '../tokens/testing.js'
import { openApiDocument } from './contract/document.js'
import { defineRoute, NO_QUERY, registerRoutes } from './contract/route.js'
import { representation, request } from './contract/schemas.js'
import { ERROR_CODES } from './error-codes.js'
import { ROUTE_DEFINITIONS } from './routes/index.js'
import { buildServer, type ServerDeps } from './server.js'
import { loginAs, mutationHeaders, projectBody, refusal, testDeps } from './testing.js'

afterAll(resetDatabase)

/**
 * D24's PERSON-ONLY class, seen through a real route (P6b Task 2, Decision 14).
 *
 * **THE RULE IS CENTRAL, SO IT IS TESTED ON A ROUTE THAT DOES NOT CALL `requireSession`.**
 * Every real route asserting `release:approve`, `launch:record` or `launch:rehearse` calls
 * `requireSession` first and answers a token `403 TOKEN_CREDENTIAL_REFUSED` before the
 * capability is ever read — so no real route can show whether `assertCapability` refuses on its own. These
 * probes are that route: registered through `registerRoutes`, so they run under the same
 * wrapper that turns D24's privileged refusal into a pending action, and asserting one
 * capability and nothing else.
 *
 * Ids and paths are prefixed `zz` so they can never collide with a real component
 * (`contract/route.test.ts`'s rule). They are registered only in this file's servers.
 */
const Probe = representation('ZzPersonOnlyProbe', z.object({ id: z.uuid() }))
const ProbeBody = request(
  'ZzPersonOnlyProbeBody',
  z.strictObject({ reason: z.string().min(1) }),
)

function probeFor(capability: Capability, suffix: string) {
  return defineRoute({
    operationId: `zzPersonOnly${suffix}`,
    method: 'POST',
    path: `/v1/projects/{projectId}/zz-person-only-${suffix.toLowerCase()}`,
    tag: 'zz',
    summary: 'probe',
    description: 'probe',
    params: z.strictObject({ projectId: z.uuid() }),
    query: NO_QUERY,
    body: ProbeBody,
    success: { status: 201, description: 'probe', schema: Probe },
    errors: [],
    examples: {
      request: { reason: 'probe' },
      response: { id: '6f1c1d2e-8a4b-4c3d-9e2f-1a2b3c4d5e6f' },
    },
    handler: async ({ deps, actor, params }) => {
      await assertCapability(deps.db, actor, params.projectId, capability)
      return { id: randomUUID() }
    },
  })
}

const PROBES = {
  approve: probeFor('release:approve', 'Approve'),
  record: probeFor('launch:record', 'Record'),
  // D21's rehearsal (the launch path plan's Task 6b): person-only by Rich's option (a), and — unlike
  // the two above — held by the OWNER too, so the mint route's "no more than you hold" rule cannot be
  // what refuses the owner's mint of it below.
  rehearse: probeFor('launch:rehearse', 'Rehearse'),
  // An owner's "I've sent it" (the launch path plan's Task 9): person-only, and held by the OWNER.
  submit: probeFor('launch:submit', 'Submit'),
  // THE COUNTER'S POSITIVE CONTROL: one of D24's privileged four, on a route of exactly
  // this shape, DOES record a question. Without it "no pending action" is a claim that is
  // equally true of a wrapper that never runs on these probes.
  promote: probeFor('release:promote', 'Promote'),
} as const

interface Ctx {
  deps: ServerDeps
  app: FastifyInstance
  projectId: string
  ownerCookies: Record<string, string>
  adminCookies: Record<string, string>
  adminUserId: string
}

async function withServer(fn: (ctx: Ctx) => Promise<void>): Promise<void> {
  await resetDatabase()
  const deps = await testDeps()
  const app = await buildServer(deps)
  registerRoutes(app, deps, [
    PROBES.approve,
    PROBES.record,
    PROBES.rehearse,
    PROBES.submit,
    PROBES.promote,
  ])
  try {
    const ownerCookies = await loginAs(deps, 'bio_prof')
    const created = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      payload: projectBody(`person-only-${randomUUID().slice(0, 8)}`),
      cookies: ownerCookies,
      headers: mutationHeaders(deps),
    })
    expect(created.statusCode).toBe(201)
    // A PLATFORM ADMINISTRATOR, because only that role holds `release:approve` and
    // `launch:record` — so the mint route's own "no more than you hold" rule cannot be what
    // refuses here. (`launch:rehearse` the owner holds too, and has a case of its own below.)
    const admin = await ensureTestUser(deps.db, 'platform_admin')
    await fn({
      deps,
      app,
      projectId: (created.json() as { id: string }).id,
      ownerCookies,
      adminCookies: await loginAs(deps, 'platform_admin'),
      adminUserId: admin.id,
    })
  } finally {
    await deps.builds.idle()
    await app.close()
  }
}

async function pendingCount(ctx: Ctx): Promise<number> {
  const [row] = await ctx.deps.db
    .select({ n: count() })
    .from(pendingActions)
    .where(eq(pendingActions.projectId, ctx.projectId))
  return row?.n ?? -1
}

async function tokenCount(ctx: Ctx): Promise<number> {
  const [row] = await ctx.deps.db
    .select({ n: count() })
    .from(delegatedTokens)
    .where(eq(delegatedTokens.projectId, ctx.projectId))
  return row?.n ?? -1
}

/** A token written STRAIGHT TO THE STORE — what one minted before P6b looks like. */
async function holding(ctx: Ctx, capabilities: string[]): Promise<string> {
  const { plaintext } = await mintTestToken(ctx.deps.db, {
    userId: ctx.adminUserId,
    projectId: ctx.projectId,
    capabilities,
  })
  return plaintext
}

function ask(ctx: Ctx, probe: keyof typeof PROBES, plaintext: string) {
  return ctx.app.inject({
    method: 'POST',
    url: `/v1/projects/${ctx.projectId}/zz-person-only-${probe}`,
    headers: { authorization: `Bearer ${plaintext}`, 'idempotency-key': randomUUID() },
    payload: { reason: 'probe' },
  })
}

function mint(ctx: Ctx, capabilities: string[], cookies = ctx.adminCookies) {
  return ctx.app.inject({
    method: 'POST',
    url: `/v1/projects/${ctx.projectId}/tokens`,
    cookies,
    headers: mutationHeaders(ctx.deps),
    payload: { name: 'person-only', capabilities, expiresInDays: 1 },
  })
}

describe('the person-only class on a route (D24, §20)', () => {
  it('refuses a token holding release:approve: 403 TOKEN_PERSON_ONLY, and records NO pending action', async () => {
    await withServer(async (ctx) => {
      const plaintext = await holding(ctx, ['project:read', 'release:approve'])
      expect(await pendingCount(ctx)).toBe(0)
      const res = await ask(ctx, 'approve', plaintext)
      expect(refusal(res)).toEqual({ status: 403, code: 'TOKEN_PERSON_ONLY' })
      expect(await pendingCount(ctx)).toBe(0)
    })
  })

  it('refuses a token holding launch:record the same way', async () => {
    await withServer(async (ctx) => {
      const plaintext = await holding(ctx, ['project:read', 'launch:record'])
      expect(await pendingCount(ctx)).toBe(0)
      const res = await ask(ctx, 'record', plaintext)
      expect(refusal(res)).toEqual({ status: 403, code: 'TOKEN_PERSON_ONLY' })
      expect(await pendingCount(ctx)).toBe(0)
    })
  })

  it('refuses a token holding launch:rehearse the same way — the rehearsal is person-only too', async () => {
    await withServer(async (ctx) => {
      const plaintext = await holding(ctx, ['project:read', 'launch:rehearse'])
      expect(await pendingCount(ctx)).toBe(0)
      const res = await ask(ctx, 'rehearse', plaintext)
      expect(refusal(res)).toEqual({ status: 403, code: 'TOKEN_PERSON_ONLY' })
      expect(await pendingCount(ctx)).toBe(0)
    })
  })

  it('refuses a token holding launch:submit the same way — saying a request was sent is a person’s', async () => {
    await withServer(async (ctx) => {
      const plaintext = await holding(ctx, ['project:read', 'launch:submit'])
      expect(await pendingCount(ctx)).toBe(0)
      const res = await ask(ctx, 'submit', plaintext)
      expect(refusal(res)).toEqual({ status: 403, code: 'TOKEN_PERSON_ONLY' })
      expect(await pendingCount(ctx)).toBe(0)
    })
  })

  it('the counter’s positive control: a PRIVILEGED capability on a probe of the same shape does record a question', async () => {
    await withServer(async (ctx) => {
      const plaintext = await holding(ctx, ['project:read'])
      expect(await pendingCount(ctx)).toBe(0)
      const res = await ask(ctx, 'promote', plaintext)
      expect(refusal(res)).toEqual({ status: 403, code: 'TOKEN_ACTION_PENDING' })
      expect(await pendingCount(ctx)).toBe(1)
    })
  })

  it('the positive control: a platform administrator’s SESSION passes the same route', async () => {
    await withServer(async (ctx) => {
      for (const probe of ['approve', 'record', 'rehearse', 'submit'] as const) {
        const res = await ctx.app.inject({
          method: 'POST',
          url: `/v1/projects/${ctx.projectId}/zz-person-only-${probe}`,
          cookies: ctx.adminCookies,
          headers: mutationHeaders(ctx.deps),
          payload: { reason: 'probe' },
        })
        expect(res.statusCode, `${probe}: ${res.body}`).toBe(201)
      }
    })
  })

  it('the mint route refuses release:approve, launch:record, project:delete, launch:rehearse and launch:submit: 400 TOKEN_CAPABILITY_FORBIDDEN, and writes no row', async () => {
    await withServer(async (ctx) => {
      // `project:delete` since the front-end enablement plan's Task 11 (§11's archive and delete);
      // `launch:rehearse` since the launch path plan's Task 6b; `launch:submit` since its Task 9.
      for (const capability of [
        'release:approve',
        'launch:record',
        'project:delete',
        'launch:rehearse',
        'launch:submit',
      ]) {
        const res = await mint(ctx, ['project:read', capability])
        expect(refusal(res)).toEqual({ status: 400, code: 'TOKEN_CAPABILITY_FORBIDDEN' })
        // The message NAMES the capability, so an agent can correct itself (D23.7).
        expect((res.json() as { error: { message: string } }).error.message).toContain(
          capability,
        )
      }
      expect(await tokenCount(ctx)).toBe(0)
    })
  })

  /**
   * THE OWNER HOLDS `launch:rehearse` (Task 6b), so step 3 of the mint — *no more than the minter
   * holds* — would let it through, and the person-only rule alone refuses. The administrator's loop
   * above already sees that rule alone for every person-only capability; what this case adds is
   * the OWNER's side — a project member who is no administrator, holding a person-only capability
   * (as they hold `project:delete`), is refused its mint exactly as an administrator is.
   */
  it('refuses the OWNER’s mint of launch:rehearse too — they hold it, and a token still may not', async () => {
    await withServer(async (ctx) => {
      const res = await mint(ctx, ['project:read', 'launch:rehearse'], ctx.ownerCookies)
      expect(refusal(res)).toEqual({ status: 400, code: 'TOKEN_CAPABILITY_FORBIDDEN' })
      expect((res.json() as { error: { message: string } }).error.message).toContain(
        'launch:rehearse',
      )
      expect(await tokenCount(ctx)).toBe(0)
      // The positive control, as the same owner: what they may delegate is minted.
      const minted = await mint(ctx, ['project:read'], ctx.ownerCookies)
      expect(minted.statusCode, minted.body).toBe(201)
    })
  })

  it('the mint route’s positive control: project:read is minted, 201', async () => {
    await withServer(async (ctx) => {
      const res = await mint(ctx, ['project:read'])
      expect(res.statusCode, res.body).toBe(201)
      expect(await tokenCount(ctx)).toBe(1)
    })
  })
})

/**
 * THE PUBLISHED PERSON-ONLY LISTS, HELD TO `PERSON_ONLY` (the launch path plan's sitting 4a, the
 * whole-branch review's I2). Four texts name the set BY HAND — `mintToken`'s description,
 * `MintTokenRequest.capabilities`' description, `TOKEN_PERSON_ONLY`'s summary and the *Agents*
 * guide — and nothing checked them: `project:delete` was missing from two for a whole plan, and
 * the guide never named the rehearsal. The set is read from `PERSON_ONLY` itself, so a member
 * added there (Task 9's `launch:submit`) is red here until every text says it.
 *
 * The descriptions are checked by capability NAME, in the document GENERATED FROM THE ROUTES
 * (`openApiDocument`, as `contract/docs.test.ts` builds it), so an edit to a route's source is seen
 * without `contract:write`. The summary and the guide are prose, so they are checked by the phrase
 * each capability is written as — and a member with NO phrase here is red too, so adding one to
 * the set means writing its phrase and putting it in both.
 */
const PERSON_ONLY_PHRASES: Readonly<Record<string, string>> = {
  'release:approve': 'approving a release',
  'launch:record': 'recording UBC’s IAM',
  'launch:rehearse': 'running the pre-production rehearsal',
  'launch:submit': 'saying a request to UBC IAM or the Privacy Office was sent',
  'project:delete': 'switching an app off, bringing it back or deleting it',
}

const AGENTS_GUIDE = new URL('../../../../docs/api/agents.md', import.meta.url)

describe('the published person-only lists name every PERSON_ONLY capability', () => {
  type Json = Record<string, unknown>
  const doc = openApiDocument(ROUTE_DEFINITIONS) as Json
  const members = [...PERSON_ONLY].sort()

  it('reads a set that has members — so every rule below has cases', () => {
    expect(members.length).toBeGreaterThan(0)
  })

  it('names each in mintToken’s description', () => {
    const operation = Object.values(doc.paths as Record<string, Record<string, Json>>)
      .flatMap((item) => Object.values(item))
      .find((o) => o.operationId === 'mintToken')
    const text = operation?.description
    expect(text, 'mintToken is in the document with a description').toEqual(
      expect.stringContaining('person-only'),
    )
    expect(members.filter((c) => !(text as string).includes(c))).toEqual([])
  })

  it('names each in MintTokenRequest.capabilities’ description', () => {
    const schemas = (doc.components as { schemas: Record<string, Json> }).schemas
    const text = (
      schemas.MintTokenRequest?.properties as Record<string, Json> | undefined
    )?.capabilities?.description
    expect(text, 'MintTokenRequest.capabilities has a description').toEqual(
      expect.stringContaining('person-only'),
    )
    expect(members.filter((c) => !(text as string).includes(c))).toEqual([])
  })

  it('has a phrase for each, and none for a capability that is not person-only', () => {
    expect(members.filter((c) => PERSON_ONLY_PHRASES[c] === undefined)).toEqual([])
    expect(Object.keys(PERSON_ONLY_PHRASES).sort()).toEqual(members)
  })

  it('says each in TOKEN_PERSON_ONLY’s summary', () => {
    const summary = ERROR_CODES.TOKEN_PERSON_ONLY.summary
    expect(
      members.filter(
        (c) => !summary.includes(PERSON_ONLY_PHRASES[c] ?? `(no phrase for ${c})`),
      ),
    ).toEqual([])
  })

  it('says each in the Agents guide’s list of what is a person’s alone', async () => {
    const guide = await readFile(AGENTS_GUIDE, 'utf8')
    const list = guide
      .split('\n')
      .find((line) => line.startsWith('Some things are a person’s alone'))
    expect(list, 'agents.md has its "a person’s alone" paragraph').toBeDefined()
    expect(
      members.filter(
        (c) => !list!.includes(PERSON_ONLY_PHRASES[c] ?? `(no phrase for ${c})`),
      ),
    ).toEqual([])
  })
})
