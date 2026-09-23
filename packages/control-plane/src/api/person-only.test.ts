import { randomUUID } from 'node:crypto'
import { count, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, describe, expect, it } from 'vitest'
import { z } from 'zod/v4'
import { delegatedTokens, pendingActions } from '../db/index.js'
import { resetDatabase } from '../db/testing.js'
import { ensureTestUser } from '../identity/testing.js'
import { assertCapability, type Capability } from '../projects/index.js'
import { mintTestToken } from '../tokens/testing.js'
import { defineRoute, NO_QUERY, registerRoutes } from './contract/route.js'
import { representation, request } from './contract/schemas.js'
import { buildServer, type ServerDeps } from './server.js'
import { loginAs, mutationHeaders, projectBody, refusal, testDeps } from './testing.js'

afterAll(resetDatabase)

/**
 * D24's PERSON-ONLY class, seen through a real route (P6b Task 2, Decision 14).
 *
 * **THE RULE IS CENTRAL, SO IT IS TESTED ON A ROUTE THAT DOES NOT CALL `requireSession`.**
 * Every real route asserting `release:approve` or `launch:record` calls `requireSession`
 * first and answers a token `403 TOKEN_CREDENTIAL_REFUSED` before the capability is ever
 * read — so no real route can show whether `assertCapability` refuses on its own. These
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
    handler: async ({ deps, actor, params }) => {
      await assertCapability(deps.db, actor, params.projectId, capability)
      return { id: randomUUID() }
    },
  })
}

const PROBES = {
  approve: probeFor('release:approve', 'Approve'),
  record: probeFor('launch:record', 'Record'),
  // THE COUNTER'S POSITIVE CONTROL: one of D24's privileged four, on a route of exactly
  // this shape, DOES record a question. Without it "no pending action" is a claim that is
  // equally true of a wrapper that never runs on these probes.
  promote: probeFor('release:promote', 'Promote'),
} as const

interface Ctx {
  deps: ServerDeps
  app: FastifyInstance
  projectId: string
  adminCookies: Record<string, string>
  adminUserId: string
}

async function withServer(fn: (ctx: Ctx) => Promise<void>): Promise<void> {
  await resetDatabase()
  const deps = await testDeps()
  const app = await buildServer(deps)
  registerRoutes(app, deps, [PROBES.approve, PROBES.record, PROBES.promote])
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
    // A PLATFORM ADMINISTRATOR, because only that role holds either capability — so the
    // mint route's own "no more than you hold" rule cannot be what refuses here.
    const admin = await ensureTestUser(deps.db, 'platform_admin')
    await fn({
      deps,
      app,
      projectId: (created.json() as { id: string }).id,
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

function mint(ctx: Ctx, capabilities: string[]) {
  return ctx.app.inject({
    method: 'POST',
    url: `/v1/projects/${ctx.projectId}/tokens`,
    cookies: ctx.adminCookies,
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
      for (const probe of ['approve', 'record'] as const) {
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

  it('the mint route refuses release:approve and launch:record: 400 TOKEN_CAPABILITY_FORBIDDEN, and writes no row', async () => {
    await withServer(async (ctx) => {
      for (const capability of ['release:approve', 'launch:record']) {
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

  it('the mint route’s positive control: project:read is minted, 201', async () => {
    await withServer(async (ctx) => {
      const res = await mint(ctx, ['project:read'])
      expect(res.statusCode, res.body).toBe(201)
      expect(await tokenCount(ctx)).toBe(1)
    })
  })
})
