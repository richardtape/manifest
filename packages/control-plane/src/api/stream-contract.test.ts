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
      Object.keys(PUBLISHED_ELSEWHERE).sort(),
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
