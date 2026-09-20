import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetDatabase } from '../db/testing.js'
import { z } from 'zod/v4'
import {
  EVENT_DETAIL_SCHEMAS,
  EVENT_TYPES,
  readyFrame,
  recentFramesFor,
  REPLAY_LIMIT,
  type StreamFrame as BusFrame,
} from '../observability/index.js'
import {
  ControlFrame,
  EventFrame,
  LogFrame,
  StreamFrame,
} from './representations/events.js'
import { Audience } from './representations/projects.js'
import { ensureTestUser } from '../identity/testing.js'
import { mintTestToken } from '../tokens/testing.js'
import { buildServer } from './server.js'
import { loginAs, mutationHeaders, projectBody, testDeps } from './testing.js'

beforeEach(resetDatabase)
afterAll(resetDatabase)
afterEach(() => {
  vi.restoreAllMocks()
})

/**
 * Event types no publisher in THIS tier reaches, and the test that runs each one's
 * publisher against `recordEvent`'s schema instead. Listed, so a type that stops being
 * reached here — or starts — is a change somebody has to make on purpose.
 */
const PUBLISHED_ELSEWHERE = {
  'sso.registered': 'sso/registration.docker.test.ts — the real IdP',
  'sso.acs_changed': 'sso/registration.docker.test.ts — the real IdP',
  'ai.key_rotated': 'releases/releases.test.ts — a recording key service',
  'instance.retire_failed': 'releases/retire.test.ts — a driver that refuses',
} as const

/**
 * Types with NO PUBLISHER ANYWHERE YET, and a second list rather than four more entries
 * above — because the list above promises *"the test that runs each one's publisher"*, and
 * saying that about a type nothing publishes is the kind of reassuring claim this project
 * keeps paying for. The CHECK constraint and the document carry all five from migration
 * 0019 (P6a Decision 14: one constraint rewrite, not three), so they exist here before
 * their callers do.
 *
 * **Each entry names the task that writes its publisher, and removing the entry is that
 * task's job**: the moment a lifecycle in this file reaches one of these, the assertion
 * below goes red and somebody has to decide which list it belongs in.
 */
const NO_PUBLISHER_YET = {
  'iam_registration.recorded': 'P6a Task 6 — launch/records.ts',
  'privacy_assessment.recorded': 'P6a Task 6 — launch/records.ts',
  'rehearsal.completed': 'P6a Task 14 — launch/rehearsal.ts',
  'release.approved': 'P6a Task 10 — releases/approval.ts',
  'release.approval_rejected': 'P6a Task 10 — releases/approval.ts',
} as const

/**
 * THE DOCUMENT DESCRIBES WHAT STREAMS (P5a Task 12). Every frame the platform publishes
 * through a whole delivery lifecycle — and every frame a reconnecting client is replayed —
 * must parse as the contract's StreamFrame. A schema nothing checks against real frames is
 * a description of what somebody believed the frames were.
 */
describe('the stream in the contract (D23.2)', () => {
  it('every published and every replayed frame is a StreamFrame', async () => {
    const deps = await testDeps()
    const app = await buildServer(deps)
    const cookies = await loginAs(deps, 'bio_prof')
    const published: BusFrame[] = []
    const publish = deps.bus.publish.bind(deps.bus)
    deps.bus.publish = (frame) => {
      published.push(frame)
      publish(frame)
    }
    const post = async (url: string, payload: Record<string, unknown>) => {
      const response = await app.inject({
        method: 'POST',
        url,
        cookies,
        headers: mutationHeaders(deps),
        payload,
      })
      expect(response.statusCode, `${url}: ${response.body}`).toBeLessThan(300)
      return response.json()
    }

    const project = await post('/v1/projects', projectBody('chem-labs'))
    const staging = project.environments.find(
      (e: { kind: string }) => e.kind === 'staging',
    )

    // D24's token.minted (P5b Task 4). Driven here rather than listed in
    // PUBLISHED_ELSEWHERE, because the point of this test is that a REAL frame parses as
    // the contract's StreamFrame — and `api/tokens.test.ts` asserts the route's answer,
    // not the frame the bus carries.
    await post(`/v1/projects/${project.id}/tokens`, {
      name: 'stream-contract',
      capabilities: ['project:read'],
      expiresInDays: 30,
    })

    // D24's central refusal (P5b Task 6), driven here for the same reason: the frame
    // §26's queue is built from has to parse as the contract's StreamFrame too. The token
    // is written STRAIGHT TO THE STORE holding a capability Task 4's mint route refuses,
    // which is what "regardless of how it was minted" means — no route can produce this
    // one, so no `post` above can reach this event type.
    const { plaintext } = await mintTestToken(deps.db, {
      userId: (await ensureTestUser(deps.db, 'bio_prof')).id,
      projectId: project.id,
      capabilities: ['members:manage'],
    })
    const pendingRefusal = await app.inject({
      method: 'POST',
      url: `/v1/projects/${project.id}/members`,
      headers: {
        authorization: `Bearer ${plaintext}`,
        'idempotency-key': 'p'.repeat(12),
      },
      payload: { puid: 'bio_student', role: 'collaborator' },
    })
    expect(pendingRefusal.statusCode, pendingRefusal.body).toBe(403)

    // And D24's two ANSWERS (P5b Task 7), driven the same way and for the same reason:
    // §26's queue is built from these frames, so they have to parse as the contract's
    // StreamFrame too. Two refusals, because one question takes one answer.
    await post(
      `/v1/pending-actions/${pendingRefusal.json().error.pendingAction.id}/confirm`,
      {},
    )
    const secondRefusal = await app.inject({
      method: 'POST',
      url: `/v1/projects/${project.id}/members`,
      headers: {
        authorization: `Bearer ${plaintext}`,
        'idempotency-key': 'q'.repeat(12),
      },
      payload: { puid: 'unrelated_user', role: 'owner' },
    })
    expect(secondRefusal.statusCode, secondRefusal.body).toBe(403)
    await post(
      `/v1/pending-actions/${secondRefusal.json().error.pendingAction.id}/reject`,
      { reason: 'not this term' },
    )

    // The unit tier's whole lifecycle, as `delivery.test.ts` drives it, plus a redeploy so
    // the retirer publishes too: a build that fails, one that succeeds, a release, a
    // healthy deploy, a second that replaces it, and one whose instance never starts.
    vi.spyOn(deps.driver, 'buildImage').mockRejectedValueOnce(
      Object.assign(new Error('npm ci exited 1'), { code: 'BUILD_FAILED' }),
    )
    // Each build answers 202 and ends in the background (R6): awaited, then read back.
    const failed = await post(`/v1/projects/${project.id}/builds`, {
      commitSha: project.spec.commitSha,
    })
    await deps.builds.idle()
    const readBuild = async (id: string) =>
      (await app.inject({ method: 'GET', url: `/v1/builds/${id}`, cookies })).json()
    expect((await readBuild(failed.id)).status).toBe('failed')
    const build = await post(`/v1/projects/${project.id}/builds`, {
      commitSha: project.spec.commitSha,
    })
    await deps.builds.idle()
    expect((await readBuild(build.id)).status).toBe('succeeded')
    const release = await post(`/v1/projects/${project.id}/releases`, {
      buildId: build.id,
    })
    const deploy = () =>
      post(`/v1/environments/${staging.id}/deploy`, { releaseId: release.id })
    expect((await deploy()).state).toBe('healthy')
    expect((await deploy()).state).toBe('healthy')
    await deps.retirer.idle()
    vi.spyOn(deps.driver, 'status').mockResolvedValue({
      id: 'unused',
      state: 'failed',
      healthy: false,
    })
    expect((await deploy()).state).toBe('failed')

    const replayed = await recentFramesFor(deps.db, project.id, REPLAY_LIMIT)
    const frames = [...published, ...replayed, readyFrame(project.id)]
    // The union's own refusal is `invalid_union` at the root, naming nothing (measured,
    // control (b) of P5a sitting 8) — so a refused frame is re-read by its kind's schema,
    // which names the path.
    const byKind = { event: EventFrame, log: LogFrame, control: ControlFrame }
    const refused = frames.flatMap((frame) => {
      // Through JSON, because that is what a client receives: a Date or an undefined that
      // survives in memory does not survive the socket.
      const json: unknown = JSON.parse(JSON.stringify(frame))
      if (StreamFrame.safeParse(json).success) return []
      const issues = byKind[frame.kind].safeParse(json).error?.issues ?? []
      return [
        `${frame.kind} ${'type' in frame ? frame.type : ''}: ` +
          (issues.map((i) => i.path.join('.') || '(root)').join(', ') || 'kind'),
      ]
    })
    expect(refused).toEqual([])

    // And the run reached what it claims to — every kind, and every event type but the
    // ones named above — so an empty or partial lifecycle cannot pass by parsing little.
    expect(new Set(frames.map((f) => f.kind))).toEqual(
      new Set(['event', 'log', 'control']),
    )
    const reached = new Set(
      published.flatMap((f) => (f.kind === 'event' ? [f.type] : [])),
    )
    expect(EVENT_TYPES.filter((type) => !reached.has(type)).sort()).toEqual(
      [...Object.keys(PUBLISHED_ELSEWHERE), ...Object.keys(NO_PUBLISHER_YET)].sort(),
    )
    await app.close()
  })

  it('describes project.created’s audience with the Audience representation’s own answers', () => {
    // Two copies of §24's lists, because `observability/` cannot import `api/`. Compared as
    // the document emits them, so a scale added to one is a drift this names.
    const answers = (schema: z.ZodType) => {
      const json = z.toJSONSchema(schema, { io: 'output' }) as {
        properties: { scale: { enum: string[] }; burst: { enum: string[] } }
      }
      return { scale: json.properties.scale.enum, burst: json.properties.burst.enum }
    }
    expect(answers(EVENT_DETAIL_SCHEMAS['project.created'].shape.audience)).toEqual(
      answers(Audience),
    )
  })

  it('pairs each event type with its own machineDetail, not with any event’s', () => {
    // Without this, a frame of one type carrying another type's detail would parse, and the
    // contract's `type → machineDetail` pairing — what lets a generated client narrow on
    // `type` — would be a claim nothing holds.
    const frame = {
      kind: 'event',
      id: '6f1c1d2e-8a4b-4c3d-9e2f-1a2b3c4d5e6f',
      projectId: '6f1c1d2e-8a4b-4c3d-9e2f-1a2b3c4d5e6f',
      subject: 'build:x',
      type: 'build.started',
      humanMessage: 'Building.',
      machineDetail: { from: null, to: 'https://x.staging.manifest.internal/' },
      createdAt: new Date().toISOString(),
    }
    expect(StreamFrame.safeParse(frame).success).toBe(false)
  })
})
