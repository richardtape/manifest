import type { Server } from 'node:http'
import type { Schemas, StreamFrame } from '@manifest/contract'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import * as f from './fixtures.js'
import { createFleet, FLEET_PROJECTS } from './fleet.js'
import { queueOf, vancouverDay, vancouverNoon } from './launch.js'
import { READY, REPLAY } from './script.js'
import { createMockServer, type MockOptions } from './server.js'

/**
 * THE DEMO FLEET (P11's Task 3): thirteen projects behind `MANIFEST_MOCK_FLEET=demo`, for the
 * administrator's console — every one read by its own id, the queue across them, their streams
 * replayed — and EVERY STATE ONE THE PLATFORM CAN REACH (the review's I3), read back through the API
 * here rather than from the builder's input. With the fleet off, every default answer is what it was:
 * the faculty front-end runs this mock from our working tree and its tests read our fixtures live.
 */

const servers: Server[] = []
async function serve(options: MockOptions): Promise<string> {
  const server = createMockServer(options)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  servers.push(server)
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`
}
afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise((resolve) => s.close(resolve))))
})

const SESSION = { cookie: 'manifest_session=mock-session' }
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

interface Read<T> {
  status: number
  body: T
}
const reader =
  (origin: string) =>
  async <T>(path: string): Promise<Read<T>> => {
    const response = await fetch(`${origin}${path}`, { headers: SESSION })
    return { status: response.status, body: (await response.json()) as T }
  }
const codeOf = (body: unknown) => (body as { error: { code: string } }).error.code
const idOf = (slug: string): string => {
  const found = FLEET_PROJECTS.find((p) => p.slug === slug)
  if (found === undefined) throw new Error(`no fleet project '${slug}'`)
  return found.id
}

/** Subscribe, and collect every frame up to and including the control frame. */
function replayOf(origin: string, projectId: string): Promise<StreamFrame[]> {
  return new Promise((resolve, reject) => {
    const frames: StreamFrame[] = []
    const ws = new WebSocket(
      `${origin.replace('http', 'ws')}/v1/projects/${projectId}/events`,
      { headers: SESSION },
    )
    ws.on('message', (data: Buffer) => {
      const frame = JSON.parse(data.toString()) as StreamFrame
      frames.push(frame)
      if (frame.kind === 'control') {
        ws.close()
        resolve(frames)
      }
    })
    ws.on('close', (code, reason) => {
      if (frames.at(-1)?.kind !== 'control')
        reject(new Error(`closed ${code} before the control frame: ${reason.toString()}`))
    })
    ws.on('error', reject)
  })
}

const OUR_BAND = [
  'release-approval',
  'iam-registration-to-submit',
  'iam-change-to-file',
  'privacy-assessment-to-submit',
]
const KIND_ORDER = [
  ...OUR_BAND,
  'iam-registration',
  'iam-change-request',
  'privacy-assessment',
]
const isVancouverNoon = (iso: string) =>
  vancouverNoon(vancouverDay(new Date(iso))).toISOString() === iso

describe('the demo fleet (MANIFEST_MOCK_FLEET=demo)', () => {
  let origin = ''
  let read: ReturnType<typeof reader>
  let before = 0
  let after = 0
  beforeAll(async () => {
    before = Date.now()
    origin = await serve({ role: 'admin', fleet: 'demo' })
    after = Date.now()
    read = reader(origin)
  })

  it('answers every read of every fleet project with that project’s own — the server validates each on the way out, so a 200 is the check', async () => {
    for (const { slug, id } of FLEET_PROJECTS) {
      const project = await read<Schemas['Project']>(
        `/v1/projects/${id}?expand=environments`,
      )
      expect(project.status, slug).toBe(200)
      expect(project.body.slug).toBe(slug)
      expect(project.body.environments).toHaveLength(3)

      const environments = await read<Schemas['EnvironmentList']>(
        `/v1/projects/${id}/environments`,
      )
      expect(environments.status, slug).toBe(200)
      expect(environments.body.map((e) => e.kind)).toEqual([
        'sandbox',
        'staging',
        'production',
      ])
      for (const environment of environments.body) {
        expect(environment.projectId).toBe(id)
        const one = await read<Schemas['Environment']>(
          `/v1/environments/${environment.id}`,
        )
        expect(one.status, `${slug} ${environment.kind}`).toBe(200)
        expect(one.body).toEqual(environment)

        const instances = await read<Schemas['InstanceList']>(
          `/v1/environments/${environment.id}/instances`,
        )
        expect(instances.status, `${slug} ${environment.kind}`).toBe(200)
        expect(instances.body.environmentId).toBe(environment.id)
        for (const instance of instances.body.instances) {
          expect(instance.environmentId).toBe(environment.id)
          const output = await read<Schemas['InstanceOutput']>(
            `/v1/instances/${instance.id}/output`,
          )
          // ONLY A RUNNING SANDBOX INSTANCE'S OUTPUT IS READ, as on the platform; every other is
          // refused by its own code.
          const expected =
            environment.kind === 'production'
              ? [403, 'INSTANCE_OUTPUT_PRODUCTION']
              : environment.kind === 'staging'
                ? [403, 'INSTANCE_OUTPUT_STAGING']
                : instance.serving
                  ? [200, undefined]
                  : [409, 'INSTANCE_OUTPUT_UNAVAILABLE']
          expect(output.status, `${slug} ${environment.kind} ${instance.state}`).toBe(
            expected[0],
          )
          if (output.status === 200) expect(output.body.instanceId).toBe(instance.id)
          else expect(codeOf(output.body)).toBe(expected[1])
        }

        const incidents = await read<Schemas['IncidentList']>(
          `/v1/environments/${environment.id}/incidents`,
        )
        expect(incidents.status, `${slug} ${environment.kind}`).toBe(200)
        expect(incidents.body.environmentId).toBe(environment.id)
      }

      const releases = await read<Schemas['ReleaseList']>(`/v1/projects/${id}/releases`)
      expect(releases.status, slug).toBe(200)
      for (const release of releases.body) {
        expect(release.projectId).toBe(id)
        const one = await read<Schemas['Release']>(`/v1/releases/${release.id}`)
        expect(one.status).toBe(200)
        expect(one.body).toEqual(release)
      }

      for (const [path, schema] of [
        ['launch-readiness', 'LaunchReadiness'],
        ['launch-records', 'LaunchRecords'],
      ] as const) {
        const answer = await read<{ projectId: string }>(`/v1/projects/${id}/${path}`)
        expect(answer.status, `${slug} ${schema}`).toBe(200)
        expect(answer.body.projectId).toBe(id)
      }
      const members = await read<Schemas['MemberList']>(`/v1/projects/${id}/members`)
      expect(members.status, slug).toBe(200)
      expect(members.body.find((m) => m.role === 'owner')?.userId).toBe(
        project.body.owner.id,
      )
      const tokens = await read<Schemas['TokenList']>(`/v1/projects/${id}/tokens`)
      expect(tokens.status, slug).toBe(200)
      expect(tokens.body.every((t) => t.projectId === id)).toBe(true)
      const pending = await read<Schemas['PendingActionList']>(
        `/v1/projects/${id}/pending-actions`,
      )
      expect(pending.status, slug).toBe(200)
      expect(pending.body.every((a) => a.projectId === id)).toBe(true)
      const sessions = await read<Schemas['AgentSessionList']>(
        `/v1/projects/${id}/agent-sessions`,
      )
      expect(sessions.status, slug).toBe(200)
      expect(sessions.body).toEqual({ sessions: [], truncated: false })
    }
  })

  it('lists fourteen projects in the fleet — mock-app and the thirteen — newest first', async () => {
    const fleet = await read<Schemas['Fleet']>('/v1/fleet')
    expect(fleet.status).toBe(200)
    expect(fleet.body).toHaveLength(14)
    expect(fleet.body.map((p) => p.slug).sort()).toEqual(
      ['mock-app', ...FLEET_PROJECTS.map((p) => p.slug)].sort(),
    )
    const created = fleet.body.map((p) => Date.parse(p.createdAt))
    expect(created).toEqual([...created].sort((a, b) => b - a))
    const row = (slug: string) => fleet.body.find((p) => p.slug === slug)!
    const env = (slug: string, kind: string) =>
      row(slug).environments.find((e) => e.kind === kind)!
    // Each row names its three environments, in the platform's order (by kind).
    expect(row('reading-responses').environments.map((e) => e.kind)).toEqual([
      'production',
      'sandbox',
      'staging',
    ])
    expect(env('reading-responses', 'production')).toMatchObject({
      state: 'healthy',
      instances: 2,
    })
    // ITS SET IS STILL TWO, ONE OF THEM STOPPED: replacing gave up, and a member that stopped stays in
    // the set until a replacement serves (`Fleet`'s `state` and `instances`, A1) — `listInstances` says
    // which one serves.
    expect(env('econ-101-polls', 'production')).toMatchObject({
      state: 'healthy',
      instances: 2,
    })
    expect(row('hist-105-archive')).toMatchObject({ state: 'archived' })
    expect(row('hist-105-archive').archivedAt).not.toBeNull()
    expect(env('mus-100-listening', 'production')).toMatchObject({
      state: null,
      instances: 0,
      releaseId: null,
    })
    expect(env('rubric-helper', 'staging')).toMatchObject({
      state: 'failed',
      instances: 1,
    })
  })

  it('holds only states the platform can reach (I3) — read back through the API, never from the builder', async () => {
    const queue = await read<Schemas['Queue']>('/v1/queue')
    const fleet = await read<Schemas['Fleet']>('/v1/fleet')
    const ours = fleet.body.filter((p) => p.slug !== 'mock-app')

    // A SIGN-OFF IS ASKED ONLY WHEN EVERY OTHER BLOCKING ITEM IS MET (the self-serve check).
    const asked = queue.body.items.filter((i) => i.kind === 'release-approval')
    expect(asked.map((i) => i.project.slug).sort()).toEqual([
      'chem-lab-booking',
      'reading-responses',
    ])
    for (const item of asked) {
      const readiness = await read<Schemas['LaunchReadiness']>(
        `/v1/projects/${item.project.id}/launch-readiness`,
      )
      const unmet = readiness.body.items.filter((i) => i.blocking && i.state !== 'met')
      expect(
        unmet.map((i) => i.id),
        item.project.slug,
      ).toEqual(['admin-approval'])
      expect(readiness.body.candidateReleaseId).toBe(item.subjectId)
    }

    for (const row of ours) {
      const project = await read<Schemas['Project']>(`/v1/projects/${row.id}`)
      const production = row.environments.find((e) => e.kind === 'production')!
      // AT 1.9.0 ONLY A `class` APP LAUNCHES: a large-audience app's blocking `load-rehearsal` is
      // `not_built` (`launch/readiness.ts`), so it is never in production — and every launched app runs
      // its audience's set of two.
      if (row.audience?.scale === 'large_course' || row.audience?.scale === 'public') {
        expect(project.body.launchedAt, row.slug).toBeNull()
        expect(production.instances, row.slug).toBe(0)
        const readiness = await read<Schemas['LaunchReadiness']>(
          `/v1/projects/${row.id}/launch-readiness`,
        )
        expect(
          readiness.body.items.find((i) => i.id === 'load-rehearsal'),
          row.slug,
        ).toMatchObject({ blocking: true, state: 'not_built' })
      }
      if (project.body.launchedAt !== null) {
        expect(row.audience?.scale, row.slug).toBe('class')
        expect(production.instances, row.slug).toBe(2)
      } else expect(production.instances, row.slug).toBe(0)

      // A RELEASE WITH FIXABLE FINDINGS IS NEVER BESIDE A MET `scans` ITEM: the build gate blocks on
      // them unless the database was stale, and a stale scan leaves `scans` unmet.
      const readiness = await read<Schemas['LaunchReadiness']>(
        `/v1/projects/${row.id}/launch-readiness`,
      )
      const scans = readiness.body.items.find((i) => i.id === 'scans')!
      for (const environment of row.environments.filter((e) => e.releaseId !== null)) {
        const release = await read<Schemas['Release']>(
          `/v1/releases/${environment.releaseId}`,
        )
        const fixable =
          release.body.scan!.fixable.critical + release.body.scan!.fixable.high
        if (fixable > 0) {
          expect(release.body.scan!.stale, row.slug).toBe(true)
          expect(scans.state, row.slug).toBe('unmet')
        }
      }

      // UBC'S ORDER: a registration with the team, with UBC or registered has an assessment approved
      // WITH its PIA number beside it, and production's a staging one registered.
      const records = await read<Schemas['LaunchRecords']>(
        `/v1/projects/${row.id}/launch-records`,
      )
      const moving = ['sent', 'submitted', 'active', 'change_requested']
      for (const registration of [
        records.body.stagingRegistration,
        records.body.iamRegistration,
      ]) {
        if (registration === null || !moving.includes(registration.state)) continue
        expect(records.body.privacyAssessment?.state, row.slug).toBe('approved')
        expect(records.body.privacyAssessment?.externalTicketRef, row.slug).not.toBeNull()
        if (registration.environment === 'production') {
          expect(records.body.stagingRegistration?.state, row.slug).toBe('active')
          expect(records.body.stagingRegistration?.registeredAt, row.slug).not.toBeNull()
        }
      }
    }

    // EACH PROJECT'S HISTORY IN AN ORDER THE PLATFORM ALLOWS, read from its stream: a sign-off is asked,
    // and a rehearsal run, only for a release already serving staging; a launch follows its approval;
    // and production's registration was in force before the launch.
    for (const row of ours) {
      const events = (await replayOf(origin, row.id)).filter((e) => e.kind === 'event')
      const detail = (e: (typeof events)[number]) =>
        e.machineDetail as Record<string, unknown>
      const earlier = (
        type: string,
        releaseId: unknown,
        before: string,
        environment?: string,
      ) =>
        events.some(
          (e) =>
            e.type === type &&
            detail(e).releaseId === releaseId &&
            (environment === undefined || detail(e).environment === environment) &&
            Date.parse(e.createdAt) < Date.parse(before),
        )
      for (const e of events) {
        const what = `${row.slug} ${e.type} at ${e.createdAt}`
        if (e.type === 'approval.requested' || e.type === 'rehearsal.completed')
          expect(
            earlier('instance.healthy', detail(e).releaseId, e.createdAt, 'staging'),
            what,
          ).toBe(true)
        if (e.type === 'project.launched')
          expect(
            earlier('release.approved', detail(e).releaseId, e.createdAt),
            what,
          ).toBe(true)
      }
      const launchedAt = (await read<Schemas['Project']>(`/v1/projects/${row.id}`)).body
        .launchedAt
      if (launchedAt !== null) {
        const records = await read<Schemas['LaunchRecords']>(
          `/v1/projects/${row.id}/launch-records`,
        )
        const registeredAt = records.body.iamRegistration?.registeredAt ?? null
        expect(registeredAt, row.slug).not.toBeNull()
        expect(Date.parse(registeredAt!), row.slug).toBeLessThan(Date.parse(launchedAt))
      }
    }

    // A RECORD WITH UBC WAITS FROM ITS SUBMISSION'S STAMP — Vancouver noon of the day it was sent.
    for (const item of queue.body.items.filter((i) => !OUR_BAND.includes(i.kind)))
      expect(isVancouverNoon(item.since), `${item.kind} ${item.project.slug}`).toBe(true)
  })

  it('queues the table’s eight items beside mock-app’s own, oldest first — and its headline is not ours to read', async () => {
    const queue = await read<Schemas['Queue']>('/v1/queue')
    expect(queue.status).toBe(200)
    expect(queue.body.truncated).toBe(false)
    const items = queue.body.items
    // THE PLATFORM'S ORDER: since, then the kind's place, then the subject.
    expect(items).toEqual(
      [...items].sort(
        (a, b) =>
          Date.parse(a.since) - Date.parse(b.since) ||
          KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
          a.subjectId.localeCompare(b.subjectId),
      ),
    )
    // `mock-app`'s default stage leaves its re-sent assessment with the Privacy Office, as it always has.
    const mockApp = items.filter((i) => i.project.slug === 'mock-app')
    expect(mockApp).toEqual(
      queueOf(
        { records: 'sent', approval: 'approved', rehearsal: 'passed', queue: 'default' },
        'admin',
        Date.now(),
      ).items,
    )

    // EVERY TIME IS `t0 − age`, to the second — t0 being the server's creation.
    const first = items.find((i) => i.project.slug === 'reading-responses')!
    const t0 = Date.parse(first.since) + 3 * DAY + 4 * HOUR
    expect(t0).toBeGreaterThanOrEqual(Math.floor(before / 1000) * 1000)
    expect(t0).toBeLessThanOrEqual(after)
    const noonDaysAgo = (days: number) =>
      vancouverNoon(vancouverDay(new Date(t0 - days * DAY))).toISOString()
    const table: [string, string, string | null, string][] = [
      [
        'release-approval',
        'reading-responses',
        null,
        new Date(t0 - 3 * DAY - 4 * HOUR).toISOString(),
      ],
      [
        'release-approval',
        'chem-lab-booking',
        null,
        new Date(t0 - 19 * HOUR).toISOString(),
      ],
      [
        'iam-registration-to-submit',
        'phys-101-labs',
        'production',
        new Date(t0 - DAY - 2 * HOUR).toISOString(),
      ],
      [
        'iam-change-to-file',
        'math-oh-queue',
        'production',
        new Date(t0 - 2 * DAY - 7 * HOUR).toISOString(),
      ],
      [
        'privacy-assessment-to-submit',
        'rubric-helper',
        null,
        new Date(t0 - 5 * HOUR).toISOString(),
      ],
      ['iam-registration', 'stats-sim', 'staging', noonDaysAgo(4)],
      ['iam-change-request', 'lang-202-journal', 'production', noonDaysAgo(21)],
      ['privacy-assessment', 'field-notes', null, noonDaysAgo(23)],
    ]
    const fleetItems = items.filter((i) => i.project.slug !== 'mock-app')
    expect(
      fleetItems.map((i) => [i.kind, i.project.slug, i.environment, i.since]).sort(),
    ).toEqual(table.sort())
    for (const item of fleetItems) {
      expect(item.project.id).toBe(idOf(item.project.slug))
      expect(item.requestedBy).not.toBeNull()
    }
    // The agent's ask is said as the platform says it, and its note travels with it.
    expect(first).toMatchObject({
      requestedBy: { id: f.USER_ID, displayName: 'Instructor One' },
      summary:
        'An agent on Instructor One’s token asked for the release serving staging to be approved for production.',
      note: 'The class starts on Monday — the egress change is the only new thing.',
    })

    // THE A15 TRAP IS IN THE DATA: our band's oldest is reading-responses', while `oldestSince` — the
    // oldest of ALL — waits on UBC.
    const ourOldest = items.filter((i) => OUR_BAND.includes(i.kind))[0]!
    expect(ourOldest.project.slug).toBe('reading-responses')
    const oldest = items.find((i) => i.since === queue.body.oldestSince)!
    expect(OUR_BAND).not.toContain(oldest.kind)
    expect(queue.body.oldestSince).toBe(items[0]!.since)
  })

  it('reads each thing by its own id', async () => {
    const phys = await read<Schemas['Project']>(`/v1/projects/${idOf('phys-101-labs')}`)
    expect(phys.body).toMatchObject({ slug: 'phys-101-labs', name: 'Physics 101 labs' })

    const environmentOf = async (slug: string, kind: string) => {
      const list = await read<Schemas['EnvironmentList']>(
        `/v1/projects/${idOf(slug)}/environments`,
      )
      return list.body.find((e) => e.kind === kind)!
    }
    // A MEMBER REPLACED: the deploy that replaced it moved the whole set, and the set it left is
    // retired — the stopped member `failed`, its partner `gone` — so four are listed, two serving.
    const cpsc = await environmentOf('cpsc-110-help', 'production')
    const instances = await read<Schemas['InstanceList']>(
      `/v1/environments/${cpsc.id}/instances`,
    )
    expect(instances.body.instances).toHaveLength(4)
    expect(instances.body.instances.filter((i) => i.serving)).toHaveLength(2)
    expect(instances.body.instances.map((i) => i.state).sort()).toEqual([
      'failed',
      'gone',
      'healthy',
      'healthy',
    ])
    expect(cpsc.instances.map((i) => i.id).sort()).toEqual(
      instances.body.instances
        .filter((i) => i.serving)
        .map((i) => i.id)
        .sort(),
    )

    // REPLACING GAVE UP: one of its set of two serves, and its newest Incident says why.
    const econ = await environmentOf('econ-101-polls', 'production')
    const econInstances = await read<Schemas['InstanceList']>(
      `/v1/environments/${econ.id}/instances`,
    )
    expect(econInstances.body.instances.filter((i) => i.serving)).toHaveLength(1)
    expect(econ.instances.map((i) => i.state).sort()).toEqual(['failed', 'healthy'])
    const incidents = await read<Schemas['IncidentList']>(
      `/v1/environments/${econ.id}/incidents`,
    )
    expect(incidents.body.incidents[0]!.cause).toBe('exit_stopped')
    expect(incidents.body.incidents.map((i) => i.cause)).toEqual([
      'exit_stopped',
      'exit',
      'exit',
      'exit',
    ])

    const records = await read<Schemas['LaunchRecords']>(
      `/v1/projects/${idOf('phys-101-labs')}/launch-records`,
    )
    const registration = records.body.iamRegistration!
    expect(registration.state).toBe('sent')
    expect(registration.package!.attributes).toHaveLength(4)
    expect(
      registration.package!.attributes.filter((a) => a.unused).map((a) => a.name),
    ).toEqual(['sn'])
    expect(registration.package!.entityId).toBe(
      'https://manifest.internal/sp/phys-101-labs/production',
    )

    const readiness = await read<Schemas['LaunchReadiness']>(
      `/v1/projects/${idOf('reading-responses')}/launch-readiness`,
    )
    expect(readiness.body).toMatchObject({
      launched: true,
      reescalated: true,
      sensitiveFields: ['egress.allow', 'ai.models'],
    })
    const candidate = await read<Schemas['Release']>(
      `/v1/releases/${readiness.body.candidateReleaseId}`,
    )
    expect(candidate.body.config.production.classification).toBe('high')

    // SERVING AND NEWEST DIFFER (M2): bio-201-scheduler's newest release raises its level and serves
    // nowhere yet.
    const bio = await read<Schemas['ReleaseList']>(
      `/v1/projects/${idOf('bio-201-scheduler')}/releases`,
    )
    expect(bio.body.map((r) => r.config.production.classification)).toEqual([
      'very-high',
      'high',
    ])
  })

  it('replays each project’s own events, then the control frame — and mock-app still plays its script', async () => {
    const bio = await replayOf(origin, idOf('bio-201-scheduler'))
    expect(bio.at(-1)).toEqual({ ...READY, projectId: idOf('bio-201-scheduler') })
    const events = bio.filter((frame) => frame.kind === 'event')
    expect(events.length).toBeGreaterThan(5)
    expect(events.every((e) => e.projectId === idOf('bio-201-scheduler'))).toBe(true)
    const times = events.map((e) => Date.parse(e.createdAt))
    expect(times).toEqual([...times].sort((a, b) => a - b))
    const renamed = events.filter((e) => e.type === 'project.renamed').at(-1)!
    expect(renamed.actor).toEqual({
      name: 'Operator One',
      asAdministrator: true,
      reason: 'The course code changed this term — the department asked.',
      token: null,
    })

    const reading = await replayOf(origin, idOf('reading-responses'))
    const asked = reading.filter(
      (frame) => frame.kind === 'event' && frame.type === 'approval.requested',
    )
    expect(asked.at(-1)).toMatchObject({
      machineDetail: { viaToken: true },
      actor: {
        name: 'Instructor One',
        token: { name: 'the agent that builds this app' },
      },
    })

    const mockApp = await replayOf(origin, f.PROJECT_ID)
    expect(mockApp).toEqual([...REPLAY, READY])
  })

  it('leaves mock-app untouched with the fleet on (M1)', async () => {
    const project = await read(`/v1/projects/${f.PROJECT_ID}`)
    expect(project.body).toStrictEqual(f.PROJECT)
    const environments = await read(`/v1/projects/${f.PROJECT_ID}/environments`)
    expect(environments.body).toStrictEqual(f.ENVIRONMENTS)
    const records = await read(`/v1/projects/${f.PROJECT_ID}/launch-records`)
    expect(records.body).toStrictEqual(f.LAUNCH_RECORDS)
    // The administrator of the fleet is Operator One, a member of nothing.
    const me = await read('/v1/me')
    expect(me.body).toStrictEqual(f.OPERATOR_ME)
  })

  it('makes no id a fixture already uses (T4)', () => {
    const fixtureIds = new Set<string>()
    const walk = (value: unknown): void => {
      if (typeof value === 'string') {
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value))
          fixtureIds.add(value)
      } else if (Array.isArray(value)) value.forEach(walk)
      else if (value !== null && typeof value === 'object')
        Object.values(value).forEach(walk)
    }
    Object.values(f).forEach(walk)
    expect(fixtureIds.size).toBeGreaterThan(20)
    const fleetIds = Object.values(createFleet(Date.now()).ids).flat()
    expect(fleetIds.length).toBeGreaterThan(50)
    expect(fleetIds.filter((id) => fixtureIds.has(id))).toEqual([])
    expect(new Set(fleetIds).size).toBe(fleetIds.length)
  })
})

describe('with the fleet off, every default answer is what it was', () => {
  let read: ReturnType<typeof reader>
  let origin = ''
  beforeAll(async () => {
    origin = await serve({ role: 'admin' })
    read = reader(origin)
  })

  it('answers the fixtures it always has', async () => {
    expect((await read('/v1/me')).body).toStrictEqual(f.ADMIN_ME)
    expect((await read('/v1/fleet')).body).toStrictEqual(f.FLEET)
    expect((await read('/v1/queue')).body).toStrictEqual(
      queueOf(
        { records: 'sent', approval: 'approved', rehearsal: 'passed', queue: 'default' },
        'admin',
        Date.now(),
      ),
    )
    expect((await read(`/v1/projects/${f.PROJECT_ID}`)).body).toStrictEqual(f.PROJECT)
    expect((await read(`/v1/projects/${f.PROJECT_ID}/environments`)).body).toStrictEqual(
      f.ENVIRONMENTS,
    )
    expect(
      (await read(`/v1/projects/${f.PROJECT_ID}/launch-records`)).body,
    ).toStrictEqual(f.LAUNCH_RECORDS)
    expect(
      (await read(`/v1/projects/${f.PROJECT_ID}/launch-readiness`)).body,
    ).toStrictEqual(f.LAUNCH_READINESS)
    expect(
      (await read(`/v1/projects/${f.PROJECT_ID}/pending-actions`)).body,
    ).toStrictEqual(f.PENDING_ACTIONS)
  })

  it('holds no fleet project — 404 NOT_FOUND, naming the mock', async () => {
    const answer = await read(`/v1/projects/${idOf('reading-responses')}`)
    expect(answer.status).toBe(404)
    expect(codeOf(answer.body)).toBe('NOT_FOUND')
    expect((answer.body as { error: { message: string } }).error.message).toMatch(
      /^manifest-mock holds no project/,
    )
    // …and a subscription to one plays mock-app's script, as any id always has.
    expect(await replayOf(origin, idOf('reading-responses'))).toEqual([...REPLAY, READY])
  })
})
