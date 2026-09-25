import { createHmac, randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { and, count, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { startFake, type StartedFake } from '@manifest/github-fake/testing'
import { appSpecs, db, events, webhookDeliveries } from '../db/index.js'
import { SAMPLE_SECRETS } from '../build/testing.js'
import { resetDatabase } from '../db/testing.js'
import { pushAsPerson, rewriteAsPerson } from '../source/testing.js'
import { buildServer, type ServerDeps } from './index.js'
import {
  githubTestDeps,
  loginAs,
  mutationHeaders,
  projectBody,
  refusal,
  testDeps,
} from './testing.js'

/**
 * GITHUB'S DELIVERIES (the D5 plan's Task 9). §20: *"Webhook payloads verified by HMAC before
 * any processing."* — and the 2026-09-24 lesson this task is built against: a verifier that
 * checked a signature that was PRESENT and accepted one that was ABSENT, while every test
 * fired garbage and passed. **So every refusal here is asserted by its CODE, beside a
 * correctly signed delivery that IS accepted, in this file** (Decision 9; Review Focus 1).
 */

const SLUG = 'hook-app'
const MAIN = 'refs/heads/main'

interface Ctx {
  fake: StartedFake
  deps: ServerDeps
  app: FastifyInstance
  projectId: string
}

let open: Ctx | undefined
afterEach(async () => {
  if (open === undefined) return
  await open.deps.sourceSync.idle()
  await open.deps.builds.idle()
  await open.app.close()
  await open.fake.stop()
  open = undefined
})

/** A driver-2 server over an in-process fake, and `hook-app` created through the API. */
async function setup(options: Parameters<typeof startFake>[0] = {}): Promise<Ctx> {
  await resetDatabase()
  const fake = await startFake(options)
  const deps = await githubTestDeps(fake)
  const app = await buildServer(deps)
  const res = await app.inject({
    method: 'POST',
    url: '/v1/projects',
    payload: projectBody(SLUG),
    cookies: await loginAs(deps, 'bio_prof'),
    headers: mutationHeaders(deps),
  })
  expect(res.statusCode, res.body).toBe(201)
  open = { fake, deps, app, projectId: res.json().id }
  return open
}

const hmac = (algorithm: 'sha256' | 'sha1', secret: string, body: Buffer) =>
  createHmac(algorithm, secret).update(body).digest('hex')

/** POST /webhooks/github as GitHub would — or as something that is not GitHub would. */
async function deliver(
  ctx: { app: FastifyInstance; fake: { webhookSecret: string } },
  o: {
    event: string
    body: unknown
    /** `good`, nothing, only a CORRECT legacy SHA-1, or this literal header. */
    signature?: 'good' | 'none' | 'sha1-only' | string | string[]
    id?: string
    secret?: string
    contentType?: string | null
  },
) {
  const body = Buffer.isBuffer(o.body)
    ? o.body
    : Buffer.from(typeof o.body === 'string' ? o.body : JSON.stringify(o.body))
  const secret = o.secret ?? ctx.fake.webhookSecret
  const headers: Record<string, string | string[]> = {
    'x-github-event': o.event,
    'x-github-delivery': o.id ?? randomUUID(),
    'user-agent': 'GitHub-Hookshot/test',
  }
  if (o.contentType !== null)
    headers['content-type'] = o.contentType ?? 'application/json'
  const signature = o.signature ?? 'good'
  if (signature === 'good')
    headers['x-hub-signature-256'] = `sha256=${hmac('sha256', secret, body)}`
  else if (signature === 'sha1-only')
    headers['x-hub-signature'] = `sha1=${hmac('sha1', secret, body)}`
  else if (signature !== 'none') headers['x-hub-signature-256'] = signature
  return ctx.app.inject({
    method: 'POST',
    url: '/webhooks/github',
    headers,
    payload: body,
  })
}

const deliveryRows = async () =>
  (await db.select({ n: count() }).from(webhookDeliveries))[0]!.n
const eventsOf = (projectId: string, type: string) =>
  db
    .select({ machineDetail: events.machineDetail })
    .from(events)
    .where(and(eq(events.projectId, projectId), eq(events.type, type)))
    .then((rows) => rows.map((r) => r.machineDetail))
const specAt = async (projectId: string, commitSha: string) =>
  (
    await db
      .select({ n: count() })
      .from(appSpecs)
      .where(and(eq(appSpecs.projectId, projectId), eq(appSpecs.commitSha, commitSha)))
  )[0]!.n

/** The seeded head, and a person's push onto it that changes manifest.yaml. */
async function personPushes(ctx: Ctx) {
  const repo = ctx.deps.source.repositoryFor(SLUG)
  const before = await ctx.deps.source.headCommit(repo)
  const yaml = (await ctx.deps.source.readFile(repo, before, 'manifest.yaml')) ?? ''
  const after = await pushAsPerson(
    ctx.fake,
    SLUG,
    { 'manifest.yaml': `${yaml}# changed by a person, on GitHub\n` },
    'a manifest change',
  )
  return { repo, before, after, body: await ctx.fake.pushPayload(SLUG, before, after) }
}

describe('POST /webhooks/github — verified, recorded once, and synced off the request', () => {
  it('accepts a signed push, queues ONE sync, and the new commit is validated — the positive control', async () => {
    const ctx = await setup()
    const { repo, before, after, body } = await personPushes(ctx)
    const sync = vi.spyOn(ctx.deps.source, 'sync')
    const res = await deliver(ctx, { event: 'push', body })
    expect(res.statusCode, res.body).toBe(202)
    expect(res.json()).toEqual({ queued: true })
    await ctx.deps.sourceSync.idle()
    expect(sync).toHaveBeenCalledTimes(1)
    expect((await ctx.deps.source.localGitDir(repo, after)).commitSha).toBe(after)
    expect(await deliveryRows()).toBe(1)
    expect(await eventsOf(ctx.projectId, 'repository.pushed')).toEqual([
      { ref: MAIN, from: before, to: after },
    ])
    expect(await specAt(ctx.projectId, after)).toBe(1)
  })

  it('refuses an absent signature and records NOTHING — no row, no sync, no event, no spec', async () => {
    const ctx = await setup()
    const { after, body } = await personPushes(ctx)
    const sync = vi.spyOn(ctx.deps.source, 'sync')
    const res = await deliver(ctx, { event: 'push', body, signature: 'none' })
    expect(refusal(res)).toEqual({ status: 401, code: 'WEBHOOK_SIGNATURE_MISSING' })
    await ctx.deps.sourceSync.idle()
    expect(await deliveryRows()).toBe(0)
    expect(sync).not.toHaveBeenCalled()
    expect(await eventsOf(ctx.projectId, 'repository.pushed')).toEqual([])
    expect(await specAt(ctx.projectId, after)).toBe(0)
  })

  it('refuses a delivery carrying only the legacy SHA-1 signature as MISSING', async () => {
    const ctx = await setup()
    const { body } = await personPushes(ctx)
    const res = await deliver(ctx, { event: 'push', body, signature: 'sha1-only' })
    expect(refusal(res)).toEqual({ status: 401, code: 'WEBHOOK_SIGNATURE_MISSING' })
    expect(await deliveryRows()).toBe(0)
  })

  it('refuses a malformed signature, and a wrong one, each by its own code', async () => {
    const ctx = await setup()
    const { body } = await personPushes(ctx)
    expect(
      refusal(await deliver(ctx, { event: 'push', body, signature: 'sha256=zz' })),
    ).toEqual({
      status: 401,
      code: 'WEBHOOK_SIGNATURE_MALFORMED',
    })
    const good = `sha256=${hmac('sha256', ctx.fake.webhookSecret, Buffer.from(JSON.stringify(body)))}`
    expect(
      refusal(await deliver(ctx, { event: 'push', body, signature: [good, good] })),
    ).toEqual({ status: 401, code: 'WEBHOOK_SIGNATURE_MALFORMED' })
    const other = `sha256=${hmac('sha256', ctx.fake.webhookSecret, Buffer.from('other bytes'))}`
    expect(
      refusal(await deliver(ctx, { event: 'push', body, signature: other })),
    ).toEqual({
      status: 401,
      code: 'WEBHOOK_SIGNATURE_INVALID',
    })
    expect(
      refusal(
        await deliver(ctx, { event: 'push', body, secret: 'not the App’s secret' }),
      ),
    ).toEqual({ status: 401, code: 'WEBHOOK_SIGNATURE_INVALID' })
    expect(await deliveryRows()).toBe(0)
  })

  it('verifies BEFORE it parses: a wrongly signed body that is not JSON is INVALID, not a parse error', async () => {
    const ctx = await setup()
    const other = `sha256=${hmac('sha256', ctx.fake.webhookSecret, Buffer.from('other'))}`
    expect(
      refusal(await deliver(ctx, { event: 'push', body: 'not json', signature: other })),
    ).toEqual({ status: 401, code: 'WEBHOOK_SIGNATURE_INVALID' })
    // The ordering's own positive control: the SAME bytes, correctly signed, reach the parse.
    expect(refusal(await deliver(ctx, { event: 'push', body: 'not json' }))).toEqual({
      status: 400,
      code: 'WEBHOOK_PAYLOAD_INVALID',
    })
    expect(await deliveryRows()).toBe(0)
  })

  it('answers a delivery it has seen with 200 duplicate, and changes nothing', async () => {
    const ctx = await setup()
    const { before, after, body } = await personPushes(ctx)
    const id = randomUUID()
    const first = await deliver(ctx, { event: 'push', body, id })
    expect(first.statusCode, first.body).toBe(202)
    await ctx.deps.sourceSync.idle()
    const again = await deliver(ctx, { event: 'push', body, id })
    expect(again.statusCode).toBe(200)
    expect(again.json()).toEqual({ duplicate: true })
    await ctx.deps.sourceSync.idle()
    expect(await deliveryRows()).toBe(1)
    expect(await eventsOf(ctx.projectId, 'repository.pushed')).toEqual([
      { ref: MAIN, from: before, to: after },
    ])
    expect(await specAt(ctx.projectId, after)).toBe(1)
  })

  it('ignores a repository this platform does not hold — after verifying, with nothing synced', async () => {
    const ctx = await setup()
    const { body } = await personPushes(ctx)
    const sync = vi.spyOn(ctx.deps.source, 'sync')
    const notOurs = {
      ...body,
      repository: {
        ...(body.repository as Record<string, unknown>),
        full_name: 'manifest-apps/not-ours',
      },
    }
    const res = await deliver(ctx, { event: 'push', body: notOurs })
    expect(res.statusCode, res.body).toBe(202)
    expect(res.json()).toEqual({ ignored: 'unknown repository' })
    await ctx.deps.sourceSync.idle()
    expect(sync).not.toHaveBeenCalled()
  })

  it('answers ping', async () => {
    const ctx = await setup()
    const res = await deliver(ctx, {
      event: 'ping',
      body: { zen: 'Keep it logically awesome.', hook_id: 1 },
    })
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json()).toEqual({ pong: true })
  })

  it('answers 404 WEBHOOKS_NOT_CONFIGURED on driver 1, even correctly signed', async () => {
    await resetDatabase()
    const app = await buildServer(await testDeps())
    try {
      const res = await deliver(
        { app, fake: { webhookSecret: 'any secret at all' } },
        { event: 'ping', body: { zen: 'x' } },
      )
      expect(refusal(res)).toEqual({ status: 404, code: 'WEBHOOKS_NOT_CONFIGURED' })
    } finally {
      await app.close()
    }
  })

  it('refuses a delivery with no content type, or form-encoded, before HMAC — never a 500 (Step 1, [M9])', async () => {
    const ctx = await setup()
    const body = { zen: 'x' }
    expect(
      refusal(await deliver(ctx, { event: 'ping', body, contentType: null })),
    ).toEqual({
      status: 415,
      code: 'REQUEST_MEDIA_TYPE_UNSUPPORTED',
    })
    expect(
      refusal(
        await deliver(ctx, {
          event: 'ping',
          body: 'payload=%7B%7D',
          contentType: 'application/x-www-form-urlencoded',
        }),
      ),
    ).toEqual({ status: 415, code: 'REQUEST_MEDIA_TYPE_UNSUPPORTED' })
    expect(await deliveryRows()).toBe(0)
  })

  it('takes a body over the API’s 1 MiB limit, up to its own 5 MiB (Decision 8)', async () => {
    const ctx = await setup()
    const big = { zen: 'x', padding: 'p'.repeat(2 * 1024 * 1024) }
    const ok = await deliver(ctx, { event: 'ping', body: big })
    expect(ok.statusCode, ok.body.slice(0, 200)).toBe(200)
    const huge = { zen: 'x', padding: 'p'.repeat(6 * 1024 * 1024) }
    expect(refusal(await deliver(ctx, { event: 'ping', body: huge }))).toEqual({
      status: 413,
      code: 'REQUEST_BODY_TOO_LARGE',
    })
  })

  it('a person’s push reaches the control plane by the FAKE’S OWN delivery', async () => {
    const ctx = await setup()
    await ctx.app.listen({ host: '127.0.0.1', port: 0 })
    const port = (ctx.app.server.address() as AddressInfo).port
    ctx.fake.setWebhookUrl(`http://127.0.0.1:${port}/webhooks/github`)
    const pushed = await pushAsPerson(ctx.fake, SLUG, { 'b.txt': 'b\n' }, 'a push')
    await ctx.fake.webhooksIdle()
    expect(ctx.fake.deliveries()).toEqual([
      expect.objectContaining({ event: 'push', status: 202 }),
    ])
    await ctx.deps.sourceSync.idle()
    expect(await eventsOf(ctx.projectId, 'repository.pushed')).toEqual([
      expect.objectContaining({ ref: MAIN, to: pushed }),
    ])
    expect(await specAt(ctx.projectId, pushed)).toBe(1)
  })

  it('a rewritten main is refused by the mirror and reported ONCE, the commit a build used still builds, and the next push is a push', async () => {
    const ctx = await setup({ plan: 'free' }) // main cannot be protected (Read this first 8)
    const repo = ctx.deps.source.repositoryFor(SLUG)
    const c = await ctx.deps.source.headCommit(repo)
    expect((await ctx.deps.source.localGitDir(repo, c)).commitSha).toBe(c) // "built"
    const x = await rewriteAsPerson(ctx.fake, SLUG)
    const forced = await ctx.fake.pushPayload(SLUG, c, x)
    expect(forced.forced).toBe(true)
    expect((await deliver(ctx, { event: 'push', body: forced })).statusCode).toBe(202)
    await ctx.deps.sourceSync.idle()
    expect(await eventsOf(ctx.projectId, 'repository.history_rewritten')).toEqual([
      { ref: MAIN, mirror: c, upstream: x },
    ])
    expect((await ctx.deps.source.localGitDir(repo, c)).commitSha).toBe(c)
    // GitHub's main NOW is X: the shadow holds it, so it validates and builds too (the
    // plan's "SOURCE_COMMIT_NOT_FOUND" predates sitting 1's F6 — the ruling in the record).
    expect((await ctx.deps.source.localGitDir(repo, x)).commitSha).toBe(x)
    expect(await specAt(ctx.projectId, x)).toBe(1)
    // [M14]: a NORMAL push after the rewrite is a push — reported, validated — and the
    // rewrite is still reported exactly once.
    const y = await pushAsPerson(ctx.fake, SLUG, { 'c.txt': 'c\n' }, 'after the rewrite')
    const next = await deliver(ctx, {
      event: 'push',
      body: await ctx.fake.pushPayload(SLUG, x, y),
    })
    expect(next.statusCode).toBe(202)
    await ctx.deps.sourceSync.idle()
    expect(await eventsOf(ctx.projectId, 'repository.pushed')).toEqual([
      { ref: MAIN, from: x, to: y },
    ])
    expect(await eventsOf(ctx.projectId, 'repository.history_rewritten')).toHaveLength(1)
    expect(await specAt(ctx.projectId, y)).toBe(1)
  })
})

describe('enforced private — a repository found public is made private again, reported, and never built while public (Task 10, §20)', () => {
  async function makePublic(ctx: Ctx): Promise<void> {
    const res = await fetch(`${ctx.fake.apiUrl}/repos/${ctx.fake.org}/${SLUG}`, {
      method: 'PATCH',
      headers: {
        authorization: `token ${ctx.fake.developerToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ private: false }),
    })
    expect(res.status).toBe(200)
  }
  async function isPrivate(ctx: Ctx): Promise<boolean> {
    const res = await fetch(`${ctx.fake.apiUrl}/repos/${ctx.fake.org}/${SLUG}`, {
      headers: { authorization: `token ${ctx.fake.developerToken}` },
    })
    return ((await res.json()) as { private: boolean }).private
  }
  const build = (ctx: Ctx) =>
    loginAs(ctx.deps, 'bio_prof').then((cookies) =>
      ctx.app.inject({
        method: 'POST',
        url: `/v1/projects/${ctx.projectId}/builds`,
        payload: {},
        cookies,
        headers: mutationHeaders(ctx.deps),
      }),
    )
  /** The fake's deliveries, the syncs they queue, and the deliveries THOSE cause, all settled. */
  async function settle(ctx: Ctx): Promise<void> {
    for (let i = 0; i < 3; i++) {
      await ctx.fake.webhooksIdle()
      await ctx.deps.sourceSync.idle()
    }
  }
  async function listening(ctx: Ctx): Promise<void> {
    await ctx.app.listen({ host: '127.0.0.1', port: 0 })
    const port = (ctx.app.server.address() as AddressInfo).port
    ctx.fake.setWebhookUrl(`http://127.0.0.1:${port}/webhooks/github`)
  }

  it('a repository nobody touched: the sync’s GET reads private, and nothing is reported (the positive control)', async () => {
    const ctx = await setup()
    const advance = await ctx.deps.source.sync(ctx.deps.source.repositoryFor(SLUG))
    expect(advance.visibility).toEqual({
      observed: 'private',
      enforced: false,
      result: 'private',
    })
    expect(await eventsOf(ctx.projectId, 'repository.visibility_enforced')).toEqual([])
    expect((await build(ctx)).statusCode).toBe(202)
  })

  it('a person makes it public, GitHub delivers publicized, and the sync makes it private again — reported once; a build is accepted', async () => {
    const ctx = await setup()
    await listening(ctx)
    await makePublic(ctx)
    await settle(ctx)
    expect(await isPrivate(ctx)).toBe(true)
    expect(await eventsOf(ctx.projectId, 'repository.visibility_enforced')).toEqual([
      expect.objectContaining({ observed: 'public', result: 'private' }),
    ])
    // publicized was queued; privatized — the revert's own delivery — was verified and ignored.
    expect(ctx.fake.deliveries().map((d) => [d.event, d.status])).toEqual([
      ['repository', 202],
      ['repository', 202],
    ])
    expect((await build(ctx)).statusCode).toBe(202)
  })

  it('a revert GitHub refuses: still-public is reported, a build is 409 SOURCE_REPOSITORY_PUBLIC — and accepted once a sync reads private', async () => {
    const quirks = { refusePrivatize: true }
    const ctx = await setup({ quirks })
    await listening(ctx)
    await makePublic(ctx)
    await settle(ctx)
    expect(await isPrivate(ctx)).toBe(false)
    expect(await eventsOf(ctx.projectId, 'repository.visibility_enforced')).toEqual([
      expect.objectContaining({ observed: 'public', result: 'still-public' }),
    ])
    expect(refusal(await build(ctx))).toEqual({
      status: 409,
      code: 'SOURCE_REPOSITORY_PUBLIC',
    })
    quirks.refusePrivatize = false
    await ctx.deps.source.sync(ctx.deps.source.repositoryFor(SLUG))
    expect(await isPrivate(ctx)).toBe(true)
    expect((await build(ctx)).statusCode).toBe(202)
  })
})

describe('push-time secret scanning — a key pushed straight to GitHub is REPORTED, never repeated (Task 11, §20)', () => {
  const KEY = SAMPLE_SECRETS['an AWS access key id']

  it('a person pushes a key to GitHub: ONE repository.secret_detected names the commit, path, line and rule — never the key', async () => {
    const ctx = await setup()
    const repo = ctx.deps.source.repositoryFor(SLUG)
    const before = await ctx.deps.source.headCommit(repo)
    const after = await pushAsPerson(
      ctx.fake,
      SLUG,
      { 'config/aws.js': `// config\nmodule.exports = '${KEY}'\n` },
      'a key',
    )
    const res = await deliver(ctx, {
      event: 'push',
      body: await ctx.fake.pushPayload(SLUG, before, after),
    })
    expect(res.statusCode, res.body).toBe(202)
    await ctx.deps.sourceSync.idle()
    expect(await eventsOf(ctx.projectId, 'repository.secret_detected')).toEqual([
      {
        commit: after,
        findings: [{ path: 'config/aws.js', line: 2, rule: 'an AWS access key id' }],
        truncated: false,
      },
    ])
    const [row] = await db
      .select()
      .from(events)
      .where(
        and(
          eq(events.projectId, ctx.projectId),
          eq(events.type, 'repository.secret_detected'),
        ),
      )
    expect(row!.humanMessage).toContain(after.slice(0, 12))
    expect(row!.humanMessage).toContain('config/aws.js:2')
    expect(row!.humanMessage).toContain('rotate')
    expect(JSON.stringify(row)).not.toContain(KEY)
    // The push itself is still reported, as every push is: the scan adds an event, it does
    // not replace one.
    expect(await eventsOf(ctx.projectId, 'repository.pushed')).toEqual([
      { ref: MAIN, from: before, to: after },
    ])
    // Scanned once: a later read reports nothing new.
    await ctx.deps.source.headCommit(repo)
    expect(await eventsOf(ctx.projectId, 'repository.secret_detected')).toHaveLength(1)
  })

  it('a clean push reports no secret — the positive control', async () => {
    const ctx = await setup()
    const { body } = await personPushes(ctx)
    expect((await deliver(ctx, { event: 'push', body })).statusCode).toBe(202)
    await ctx.deps.sourceSync.idle()
    expect(await eventsOf(ctx.projectId, 'repository.pushed')).toHaveLength(1)
    expect(await eventsOf(ctx.projectId, 'repository.secret_detected')).toEqual([])
  })
})
