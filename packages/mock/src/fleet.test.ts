import type { Server } from 'node:http'
import type { Schemas, StreamFrame } from '@manifest/contract'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import * as f from './fixtures.js'
import { createFleet, FLEET_PROJECTS, type FleetContext } from './fleet.js'
import { queueOf, vancouverDay, vancouverNoon } from './launch.js'
import { MockRefusal } from './refusal.js'
import { READY, REPLAY } from './script.js'
import { createMockServer, type MockOptions } from './server.js'
import { createValidator } from './validate.js'

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
    // `lastDeployAt` IS THE NEWEST DEPLOY'S — `max(lastSeenAt)`, and only the deploy that starts an
    // instance writes `lastSeenAt` (`releases/release.ts`; no probe, retire pass or watcher does): econ's
    // last replacement started before its fourth exit, so its newest Incident is after it; cpsc-110-help's
    // replacement served after its exit, so its Incident is before it; and a set nobody redeployed was
    // last deployed when it launched, never "a minute ago".
    const incidentAfterDeploy = (slug: string, kind: string) => {
      const e = env(slug, kind)
      return Date.parse(e.latestIncidentAt!) > Date.parse(e.lastDeployAt!)
    }
    expect(incidentAfterDeploy('econ-101-polls', 'production')).toBe(true)
    expect(incidentAfterDeploy('cpsc-110-help', 'production')).toBe(false)
    expect(
      Date.now() - Date.parse(env('reading-responses', 'production').lastDeployAt!),
    ).toBeGreaterThan(8 * 86_400_000)
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

// ─── Task 4: an administrator's decisions, kept ───

interface Answered<T = unknown> {
  status: number
  body: T
}
type Error_ = { error: { code: string; message: string; hint?: string } }
/** A session's call: a GET as it is; a mutation with a fresh key unless one is given. */
const caller =
  (origin: string, cookie = SESSION.cookie) =>
  async <T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<Answered<T>> => {
    const response = await fetch(`${origin}${path}`, {
      method,
      headers: {
        cookie,
        ...(method === 'GET'
          ? {}
          : {
              'content-type': 'application/json',
              'idempotency-key': crypto.randomUUID(),
            }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    return { status: response.status, body: (await response.json()) as T }
  }
type Api = ReturnType<typeof caller>
const refusalOf = (answer: Answered) => (answer.body as Error_).error

const recordsOf = async (api: Api, slug: string) =>
  (
    await api<Schemas['LaunchRecords']>(
      'GET',
      `/v1/projects/${idOf(slug)}/launch-records`,
    )
  ).body
const itemsOf = async (api: Api, slug: string) =>
  (await api<Schemas['Queue']>('GET', '/v1/queue')).body.items.filter(
    (i) => i.project.slug === slug,
  )
const readinessOf = async (api: Api, slug: string) =>
  (
    await api<Schemas['LaunchReadiness']>(
      'GET',
      `/v1/projects/${idOf(slug)}/launch-readiness`,
    )
  ).body
/** Newest first, as `listReleases` answers. */
const releasesOf = async (api: Api, slug: string) =>
  (await api<Schemas['ReleaseList']>('GET', `/v1/projects/${idOf(slug)}/releases`)).body
const recordPath = (slug: string, what: string) =>
  `/v1/projects/${idOf(slug)}/launch-records/${what}`

/** Every live subscription a test opened — closed before the servers, so a red case cannot hang them. */
const streams: { close: () => void }[] = []
afterAll(() => streams.forEach((s) => s.close()))

/** A subscription that keeps listening: every frame after the control frame, as it comes. */
function liveOf(origin: string, projectId: string) {
  const frames: StreamFrame[] = []
  const waiting: { type: string; resolve: (frame: StreamFrame) => void }[] = []
  let live = false
  const ws = new WebSocket(
    `${origin.replace('http', 'ws')}/v1/projects/${projectId}/events`,
    { headers: SESSION },
  )
  const opened = new Promise<void>((resolve, reject) => {
    ws.on('error', reject)
    ws.on('message', (data: Buffer) => {
      const frame = JSON.parse(data.toString()) as StreamFrame
      if (frame.kind === 'control') {
        live = true
        resolve()
        return
      }
      if (!live) return
      frames.push(frame)
      for (const w of waiting.splice(0))
        if (frame.kind === 'event' && frame.type === w.type) w.resolve(frame)
        else waiting.push(w)
    })
  })
  streams.push(ws)
  return {
    opened,
    next: (type: string) =>
      new Promise<StreamFrame>((resolve) => {
        const seen = frames.find((f) => f.kind === 'event' && f.type === type)
        if (seen !== undefined) resolve(seen)
        else waiting.push({ type, resolve })
      }),
    close: () => ws.close(),
  }
}

const ADMIN_REASON = 'The owner is on leave; their department asked.'
const today = () => vancouverDay(new Date())
const noonOf = (day: string) => vancouverNoon(day).toISOString()
const inWords = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', {
    dateStyle: 'long',
    timeZone: 'America/Vancouver',
  }).format(new Date(iso))

describe('the demo fleet keeps an administrator’s decisions (MANIFEST_MOCK_FLEET=demo)', () => {
  const fleetServer = async (options: MockOptions = {}) =>
    caller(await serve({ role: 'admin', fleet: 'demo', ...options }))

  it('validates every request body it acts on before acting — 400 REQUEST_INVALID naming the field, nothing changed (C1)', async () => {
    const api = await fleetServer()
    const before = await recordsOf(api, 'stats-sim')
    const staging = before.stagingRegistration!
    const full = {
      environment: 'staging',
      entityId: staging.entityId,
      acsUrl: staging.acsUrl,
      sloUrl: staging.sloUrl,
      registeredAttributes: ['ubcEduCwlPuid', 'mail', 'givenName'],
      state: 'active',
    }
    for (const field of [
      'entityId',
      'acsUrl',
      'sloUrl',
      'registeredAttributes',
      'state',
    ] as const) {
      const body: Record<string, unknown> = { ...full }
      delete body[field]
      const refused = await api('POST', recordPath('stats-sim', 'iam-registration'), body)
      expect(refused.status, field).toBe(400)
      expect(refusalOf(refused).code, field).toBe('REQUEST_INVALID')
      expect(refusalOf(refused).message, field).toContain(`'${field}'`)
    }
    const assessment = await api(
      'POST',
      recordPath('field-notes', 'privacy-assessment'),
      { externalTicketRef: 'PIA-2026-0118' },
    )
    expect(refusalOf(assessment).code).toBe('REQUEST_INVALID')
    expect(refusalOf(assessment).message).toContain(`'state'`)

    const submit = recordPath('phys-101-labs', 'iam-registration/production/submission')
    const noReference = await api('POST', submit, {})
    expect(noReference.status).toBe(400)
    expect(refusalOf(noReference).code).toBe('REQUEST_INVALID')
    expect(refusalOf(noReference).message).toContain(`'reference'`)
    const notADay = await api('POST', submit, {
      reference: 'IAM-2026-0612',
      sentAt: 'yesterday',
    })
    expect(refusalOf(notADay).code).toBe('REQUEST_INVALID')
    expect(refusalOf(notADay).message).toContain('sentAt')

    const [candidate] = await releasesOf(api, 'reading-responses')
    const preview = await api<Schemas['ApprovalPreview']>(
      'POST',
      `/v1/releases/${candidate!.id}/approval-preview`,
    )
    expect(preview.status).toBe(201)
    const noReason = await api('POST', `/v1/releases/${candidate!.id}/reject`, {
      previewId: preview.body.id,
    })
    expect(noReason.status).toBe(400)
    expect(refusalOf(noReason).code).toBe('REQUEST_INVALID')
    expect(refusalOf(noReason).message).toContain(`'reason'`)
    const badPreview = await api('POST', `/v1/releases/${candidate!.id}/approve`, {
      previewId: 7,
    })
    expect(refusalOf(badPreview).code).toBe('REQUEST_INVALID')
    expect(refusalOf(badPreview).message).toContain('previewId')

    const [question] = (
      await api<Schemas['PendingActionList']>(
        'GET',
        `/v1/projects/${idOf('bio-201-scheduler')}/pending-actions`,
      )
    ).body
    const unexplained = await api(
      'POST',
      `/v1/pending-actions/${question!.id}/reject`,
      {},
      { 'manifest-admin-reason': ADMIN_REASON },
    )
    expect(unexplained.status).toBe(400)
    expect(refusalOf(unexplained).code).toBe('REQUEST_INVALID')
    expect(refusalOf(unexplained).message).toContain(`'reason'`)

    // NOTHING MOVED: every refused write left its record, its question and the queue as they were.
    expect(await recordsOf(api, 'stats-sim')).toEqual(before)
    expect((await recordsOf(api, 'phys-101-labs')).iamRegistration?.state).toBe('sent')
    expect((await recordsOf(api, 'field-notes')).privacyAssessment?.state).toBe(
      'submitted',
    )
    expect(
      (await api<Schemas['PendingAction']>('GET', `/v1/pending-actions/${question!.id}`))
        .body.state,
    ).toBe('pending')
    expect(await itemsOf(api, 'reading-responses')).toHaveLength(1)
  })

  it('records UBC’s answer on the registration it names — staging when asked, production when absent — as the platform writes it', async () => {
    const origin = await serve({ role: 'admin', fleet: 'demo' })
    const api = caller(origin)
    const stream = liveOf(origin, idOf('stats-sim'))
    await stream.opened
    const staging = (await recordsOf(api, 'stats-sim')).stagingRegistration!
    const body = {
      environment: 'staging',
      entityId: staging.entityId,
      acsUrl: staging.acsUrl,
      sloUrl: staging.sloUrl,
      registeredAttributes: ['ubcEduCwlPuid', 'mail', 'givenName'],
      state: 'active',
      certFingerprint: 'AB:CD:EF:01',
      certExpiresAt: '2027-10-15T00:00:00.000Z',
    }
    const recorded = await api<Schemas['IamRegistration']>(
      'POST',
      recordPath('stats-sim', 'iam-registration'),
      body,
    )
    expect(recorded.status).toBe(200)
    expect(recorded.body).toMatchObject({
      environment: 'staging',
      state: 'active',
      entityId: staging.entityId,
      registeredAttributes: body.registeredAttributes,
      requestedAttributes: null,
      certFingerprint: 'AB:CD:EF:01',
      certExpiresAt: '2027-10-15T00:00:00.000Z',
      externalTicketRef: 'IAM-2026-0511',
      // The team's submission stays what it was: UBC's answer moves no stamp of the team's.
      submittedAt: staging.submittedAt,
    })
    expect(recorded.body.registeredAt).not.toBeNull()
    const records = await recordsOf(api, 'stats-sim')
    expect(records.stagingRegistration).toEqual(recorded.body)
    expect(records.iamRegistration).toBeNull()
    expect(await itemsOf(api, 'stats-sim')).toEqual([])
    expect(await stream.next('iam_registration.recorded')).toMatchObject({
      humanMessage:
        "Operator One recorded this app's staging UBC IAM registration as active (ticket IAM-2026-0511).",
      machineDetail: {
        state: 'active',
        environment: 'staging',
        entityId: staging.entityId,
        externalTicketRef: 'IAM-2026-0511',
        attributeCount: 3,
        changeRequestedFrom: null,
      },
      actor: { name: 'Operator One', asAdministrator: false, reason: null, token: null },
    })
    stream.close()

    // THE SAME BODY WITHOUT `environment` IS PRODUCTION'S — and stats-sim has none: a record that does not
    // exist starts at `draft`, from which UBC's answer is no arrow.
    const absent: Record<string, unknown> = { ...body }
    delete absent.environment
    const production = await api(
      'POST',
      recordPath('stats-sim', 'iam-registration'),
      absent,
    )
    expect(production.status).toBe(409)
    expect(refusalOf(production).code).toBe('LAUNCH_TRANSITION_INVALID')
    expect(refusalOf(production).message).toBe(
      "an IAM registration cannot go from 'draft' to 'active' — from 'draft' it can only become 'submitted'",
    )
    expect((await recordsOf(api, 'stats-sim')).iamRegistration).toBeNull()

    // And the assessment: field-notes', with the Privacy Office, approved with its reviewer.
    const pia = await api<Schemas['PrivacyAssessment']>(
      'POST',
      recordPath('field-notes', 'privacy-assessment'),
      { state: 'approved', reviewer: 'UBC Privacy Office (M. Ortiz)' },
    )
    expect(pia.status).toBe(200)
    expect(pia.body).toMatchObject({
      state: 'approved',
      reviewer: 'UBC Privacy Office (M. Ortiz)',
      externalTicketRef: 'PIA-2026-0118',
    })
    expect(pia.body.approvedAt).not.toBeNull()
    expect(await itemsOf(api, 'field-notes')).toEqual([])
    const item = (await readinessOf(api, 'field-notes')).items.find(
      (i) => i.id === 'privacy-assessment',
    )
    expect(item).toMatchObject({ state: 'met', since: pia.body.approvedAt })
  })

  it('refuses what the platform’s record refuses, by its code, and changes nothing', async () => {
    const api = await fleetServer()
    const live = (await recordsOf(api, 'reading-responses')).iamRegistration!
    const asRegistered = {
      entityId: live.entityId,
      acsUrl: live.acsUrl,
      sloUrl: live.sloUrl,
      registeredAttributes: live.registeredAttributes,
    }
    const record = (slug: string, body: unknown) =>
      api('POST', recordPath(slug, 'iam-registration'), body)

    const nothingAsked = await record('reading-responses', {
      ...asRegistered,
      state: 'change_requested',
    })
    expect(nothingAsked.status).toBe(400)
    expect(refusalOf(nothingAsked)).toMatchObject({
      code: 'LAUNCH_RECORD_INVALID',
      message: 'a change request names what it asks for: requestedAttributes',
    })
    // AN EMPTY LIST NEVER REACHES THE RECORD: the request schema's `minItems: 1` refuses it first, as the
    // platform's route does — `records.ts`'s own LAUNCH_RECORD_INVALID for it is a guard behind that one.
    const empty = await record('reading-responses', {
      ...asRegistered,
      registeredAttributes: [],
      state: 'active',
    })
    expect(empty.status).toBe(400)
    expect(refusalOf(empty).code).toBe('REQUEST_INVALID')
    expect(refusalOf(empty).message).toContain('registeredAttributes')
    const otherEntity = await record('reading-responses', {
      ...asRegistered,
      entityId: 'https://manifest.internal/sp/another/production',
      state: 'active',
    })
    expect(refusalOf(otherEntity)).toMatchObject({
      code: 'LAUNCH_RECORD_INVALID',
      message:
        'the entityID is fixed at registration (§9): a new one is a new registration, not a change',
    })
    const typedIn = await record('reading-responses', {
      ...asRegistered,
      registeredAttributes: [...live.registeredAttributes, 'sn'],
      requestedAttributes: [...live.registeredAttributes, 'sn'],
      state: 'change_requested',
    })
    expect(refusalOf(typedIn).code).toBe('LAUNCH_RECORD_INVALID')
    expect((await recordsOf(api, 'reading-responses')).iamRegistration).toEqual(live)

    const stats = (await recordsOf(api, 'stats-sim')).stagingRegistration!
    const lapsed = await record('stats-sim', {
      environment: 'staging',
      entityId: stats.entityId,
      acsUrl: stats.acsUrl,
      sloUrl: stats.sloUrl,
      registeredAttributes: ['ubcEduCwlPuid', 'mail', 'givenName'],
      state: 'expired',
    })
    expect(lapsed.status).toBe(409)
    expect(refusalOf(lapsed).code).toBe('LAUNCH_TRANSITION_INVALID')
    expect((await recordsOf(api, 'stats-sim')).stagingRegistration).toEqual(stats)

    // WITH THE TEAM, NO RECORD MOVES IT: only the team's submission or hand-back does, named.
    const phys = (await recordsOf(api, 'phys-101-labs')).iamRegistration!
    const aroundTheTeam = await record('phys-101-labs', {
      entityId: phys.entityId,
      acsUrl: phys.acsUrl,
      sloUrl: phys.sloUrl,
      registeredAttributes: ['ubcEduCwlPuid', 'mail', 'givenName', 'sn'],
      state: 'submitted',
    })
    expect(aroundTheTeam.status).toBe(409)
    expect(refusalOf(aroundTheTeam).code).toBe('LAUNCH_TRANSITION_INVALID')
    expect(refusalOf(aroundTheTeam).message).toContain('submitIamRegistration')
    expect(refusalOf(aroundTheTeam).message).toContain('returnIamRegistration')
    const piaWithTeam = await api(
      'POST',
      recordPath('rubric-helper', 'privacy-assessment'),
      {
        state: 'submitted',
      },
    )
    expect(refusalOf(piaWithTeam).code).toBe('LAUNCH_TRANSITION_INVALID')
    expect(refusalOf(piaWithTeam).message).toContain('submitPrivacyAssessment')

    // AN ARCHIVED PROJECT IS READ, AND NOTHING ELSE.
    const archived = await api(
      'POST',
      recordPath('hist-105-archive', 'privacy-assessment'),
      {
        state: 'submitted',
      },
    )
    expect(archived.status).toBe(409)
    expect(refusalOf(archived).code).toBe('PROJECT_ARCHIVED')
  })

  it('grants a filed change in the platform’s two writes — submitted, then active — and a failed second write leaves the first (A20)', async () => {
    const api = await fleetServer()
    const filed = (await recordsOf(api, 'lang-202-journal')).iamRegistration!
    expect(filed).toMatchObject({
      state: 'change_requested',
      changeRequestedFrom: 'active',
    })
    const facts = {
      entityId: filed.entityId,
      acsUrl: filed.acsUrl,
      sloUrl: filed.sloUrl,
    }
    const record = (body: unknown) =>
      api<Schemas['IamRegistration']>(
        'POST',
        recordPath('lang-202-journal', 'iam-registration'),
        body,
      )
    const before = Date.now()
    const first = await record({
      ...facts,
      registeredAttributes: filed.registeredAttributes,
      state: 'submitted',
    })
    expect(first.status).toBe(200)
    expect(first.body).toMatchObject({
      state: 'submitted',
      changeRequestedFrom: null,
      // UBC's registration stands while it considers the change: kept, and what is asked kept beside it.
      registeredAt: filed.registeredAt,
      registeredAttributes: filed.registeredAttributes,
      requestedAttributes: filed.requestedAttributes,
      submittedBy: { id: f.OPERATOR_ID, displayName: 'Operator One' },
    })
    // AN ADMINISTRATOR'S RECORD STAMPS NOW — not a Vancouver noon, which is the team's submission's.
    expect(Date.parse(first.body.submittedAt!)).toBeGreaterThanOrEqual(
      Math.floor(before / 1000) * 1000,
    )
    expect(Date.parse(first.body.submittedAt!)).toBeLessThanOrEqual(Date.now())
    const [waiting] = await itemsOf(api, 'lang-202-journal')
    expect(waiting).toMatchObject({
      kind: 'iam-registration',
      since: first.body.submittedAt,
      environment: 'production',
    })

    // THE SECOND WRITE FAILS (an entity UBC never registered) — the first stands, the item still waits.
    const failed = await record({
      ...facts,
      entityId: 'https://manifest.internal/sp/lang-202-journal/other',
      registeredAttributes: filed.requestedAttributes,
      state: 'active',
    })
    expect(failed.status).toBe(400)
    expect(refusalOf(failed).code).toBe('LAUNCH_RECORD_INVALID')
    expect((await recordsOf(api, 'lang-202-journal')).iamRegistration).toEqual(first.body)
    expect(await itemsOf(api, 'lang-202-journal')).toEqual([waiting])

    const granted = await record({
      ...facts,
      registeredAttributes: filed.requestedAttributes,
      state: 'active',
    })
    expect(granted.status).toBe(200)
    expect(granted.body).toMatchObject({
      state: 'active',
      registeredAttributes: filed.requestedAttributes,
      requestedAttributes: null,
    })
    expect(Date.parse(granted.body.registeredAt!)).toBeGreaterThan(
      Date.parse(filed.registeredAt!),
    )
    expect(await itemsOf(api, 'lang-202-journal')).toEqual([])
    const item = (await readinessOf(api, 'lang-202-journal')).items.find(
      (i) => i.id === 'iam-registration',
    )!
    expect(item.state).toBe('met')
    expect(item.why).toContain(
      `releasing ${filed.requestedAttributes!.length} attribute(s)`,
    )
  })

  it('signs off a release on a stored preview — the request closed, the checklist met, the decision read back and streamed; the same key replays it', async () => {
    const origin = await serve({ role: 'admin', fleet: 'demo' })
    const api = caller(origin)
    const [candidate, serving] = await releasesOf(api, 'reading-responses')
    expect((await readinessOf(api, 'reading-responses')).candidateReleaseId).toBe(
      candidate!.id,
    )
    const none = await api('GET', `/v1/releases/${candidate!.id}/approval`)
    expect(none.status).toBe(404)
    expect(refusalOf(none)).toMatchObject({
      code: 'NOT_FOUND',
      message: `nobody has approved or rejected release '${candidate!.id}'`,
    })

    const preview = await api<Schemas['ApprovalPreview']>(
      'POST',
      `/v1/releases/${candidate!.id}/approval-preview`,
    )
    expect(preview.status).toBe(201)
    expect(preview.body).toMatchObject({
      releaseId: candidate!.id,
      projectId: idOf('reading-responses'),
      createdBy: f.OPERATOR_ID,
      createdByName: 'Operator One',
      imageDigest: candidate!.imageDigest,
    })
    expect(Date.parse(preview.body.expiresAt) - Date.parse(preview.body.createdAt)).toBe(
      30 * MINUTE,
    )
    // WHAT THE ADMINISTRATOR READS: the change since the last approved release, and what each means.
    expect(preview.body.diff).toMatchObject({
      baselineReleaseId: serving!.id,
      sensitiveFields: ['egress.allow', 'ai.models'],
      summarySource: 'llm',
      changes: [
        {
          path: 'egress.allow',
          from: 'none',
          to: 'readings.library.example.test',
          summary: 'now allows readings.library.example.test',
        },
        {
          path: 'ai.models',
          from: 'default-chat-onprem',
          to: 'default-chat-large, default-chat-onprem',
          summary: 'now uses default-chat-large',
        },
      ],
    })
    expect(preview.body.diff.security.map((s) => s.field)).toEqual([
      'egress.allow',
      'ai.models',
    ])
    const reread = await api(
      'GET',
      `/v1/releases/${candidate!.id}/approval-previews/${preview.body.id}`,
    )
    expect(reread.body).toEqual(preview.body)

    const stream = liveOf(origin, idOf('reading-responses'))
    await stream.opened
    const key = crypto.randomUUID()
    const approve = () =>
      api<Schemas['Approval']>(
        'POST',
        `/v1/releases/${candidate!.id}/approve`,
        { previewId: preview.body.id },
        { 'idempotency-key': key },
      )
    const approved = await approve()
    expect(approved.status).toBe(201)
    expect(approved.body).toMatchObject({
      releaseId: candidate!.id,
      decision: 'approved',
      decidedBy: f.OPERATOR_ID,
      decidedByName: 'Operator One',
      imageDigest: candidate!.imageDigest,
      reason: null,
      previewId: preview.body.id,
      diff: preview.body.diff,
    })
    expect(await stream.next('release.approved')).toMatchObject({
      subject: `release:${candidate!.id}`,
      humanMessage: 'Operator One approved this release for production.',
      machineDetail: {
        releaseId: candidate!.id,
        imageDigest: candidate!.imageDigest.slice(0, 19),
        decision: 'approved',
      },
      actor: { name: 'Operator One', asAdministrator: false, reason: null, token: null },
    })
    stream.close()
    expect(await itemsOf(api, 'reading-responses')).toEqual([])
    expect((await api('GET', `/v1/releases/${candidate!.id}/approval`)).body).toEqual(
      approved.body,
    )
    const readiness = await readinessOf(api, 'reading-responses')
    expect(readiness.items.find((i) => i.id === 'admin-approval')).toMatchObject({
      state: 'met',
      why: `This release changes egress.allow, ai.models since the last approved release, and an administrator approved it on ${approved.body.decidedAt.slice(0, 10)}, bound to ${candidate!.imageDigest.slice(0, 19)}…`,
    })
    expect(readiness).toMatchObject({ ready: true, reescalated: false })

    // THE SAME KEY IS THE SAME DECISION (the server's replay) — one record, not two.
    const again = await approve()
    expect(again.status).toBe(201)
    expect(again.body).toEqual(approved.body)

    // A NEW KEY ON THE SAME, STILL-CURRENT PREVIEW IS A SECOND DECISION, as on the platform — here a
    // withdrawal in the administrator's words, which the checklist then says is final.
    const withdrawn = await api<Schemas['Approval']>(
      'POST',
      `/v1/releases/${candidate!.id}/reject`,
      {
        previewId: preview.body.id,
        reason: 'withdrawn — the reading service is not in the PIA',
      },
    )
    expect(withdrawn.status).toBe(201)
    expect(withdrawn.body.decision).toBe('rejected')
    expect((await api('GET', `/v1/releases/${candidate!.id}/approval`)).body).toEqual(
      withdrawn.body,
    )
    expect(
      (await readinessOf(api, 'reading-responses')).items.find(
        (i) => i.id === 'admin-approval',
      ),
    ).toMatchObject({
      state: 'unmet',
      why: 'An administrator did not approve this release: withdrawn — the reading service is not in the PIA. A rejection is final for this release; build and release again.',
    })

    // THE HISTORY'S OWN DECISION: the launch release, approved by Operator One on a preview still readable.
    const launch = await api<Schemas['Approval']>(
      'GET',
      `/v1/releases/${serving!.id}/approval`,
    )
    expect(launch.body).toMatchObject({
      decision: 'approved',
      decidedByName: 'Operator One',
      diff: {
        baselineReleaseId: null,
        summarySource: 'no-previous-release',
        changes: [],
      },
    })
    const its = await api(
      'GET',
      `/v1/releases/${serving!.id}/approval-previews/${launch.body.previewId}`,
    )
    expect(its.status).toBe(200)
  })

  it('refuses a decision on no preview, an unknown one, another release’s, a stale one and an expired one — by the platform’s codes', async () => {
    const api = await fleetServer()
    const [r2, r1] = await releasesOf(api, 'chem-lab-booking')
    const decide = (releaseId: string, body: unknown) =>
      api('POST', `/v1/releases/${releaseId}/approve`, body)
    const previewOf = async (releaseId: string) =>
      (
        await api<Schemas['ApprovalPreview']>(
          'POST',
          `/v1/releases/${releaseId}/approval-preview`,
        )
      ).body

    const unnamed = await decide(r2!.id, {})
    expect(unnamed.status).toBe(400)
    expect(refusalOf(unnamed).code).toBe('APPROVAL_PREVIEW_REQUIRED')
    const unknown = await decide(r2!.id, { previewId: f.APPROVAL_PREVIEW_ID })
    expect(unknown.status).toBe(404)
    expect(refusalOf(unknown)).toMatchObject({
      code: 'NOT_FOUND',
      message: `no preview '${f.APPROVAL_PREVIEW_ID}' of release '${r2!.id}'`,
    })

    const shown = await previewOf(r2!.id)
    expect(shown.diff).toMatchObject({
      baselineReleaseId: null,
      summarySource: 'no-previous-release',
    })
    const ofR1 = await previewOf(r1!.id)
    const crossed = await decide(r2!.id, { previewId: ofR1.id })
    expect(crossed.status).toBe(404)
    expect(refusalOf(crossed).code).toBe('NOT_FOUND')

    // ANOTHER DECISION MOVES THE LAST APPROVED RELEASE: r1 approved, r2's preview no longer what it is.
    expect((await decide(r1!.id, { previewId: ofR1.id })).status).toBe(201)
    const stale = await decide(r2!.id, { previewId: shown.id })
    expect(stale.status).toBe(409)
    expect(refusalOf(stale)).toMatchObject({
      code: 'APPROVAL_PREVIEW_STALE',
      message:
        'the last approved release of this project changed since this preview was taken — take a new one. Moved: baselineReleaseId.',
    })
    // …and still asked for: a refused decision closes nothing.
    expect((await itemsOf(api, 'chem-lab-booking')).map((i) => i.kind)).toEqual([
      'release-approval',
    ])
    const fresh = await previewOf(r2!.id)
    expect(fresh.diff.baselineReleaseId).toBe(r1!.id)
    const approved = await decide(r2!.id, { previewId: fresh.id })
    expect(approved.status).toBe(201)
    expect(await itemsOf(api, 'chem-lab-booking')).toEqual([])
    expect(
      (await readinessOf(api, 'chem-lab-booking')).items.find(
        (i) => i.id === 'admin-approval',
      ),
    ).toMatchObject({
      state: 'met',
      why: `Approved by an administrator on ${(approved.body as Schemas['Approval']).decidedAt.slice(0, 10)}, bound to image digest ${r2!.imageDigest.slice(0, 19)}…`,
    })
  })

  it('refuses a decision on a preview older than thirty minutes — FleetContext.now', async () => {
    const t0 = Math.floor(Date.now() / 1000) * 1000
    const fleet = createFleet(t0)
    const validate = await createValidator()
    const ctx = (now: number): FleetContext => ({
      now,
      query: new URLSearchParams(),
      steppedUp: false,
      stepUpRequired: false,
      actor: f.OPERATOR_ME,
      adminReason: null,
      validate,
    })
    const [candidate] = fleet.answer(
      'listReleases',
      { projectId: idOf('chem-lab-booking') },
      undefined,
      ctx(t0),
    )!.body as Schemas['ReleaseList']
    const params = { releaseId: candidate!.id }
    const preview = fleet.answer('createApprovalPreview', params, undefined, ctx(t0))!
      .body as Schemas['ApprovalPreview']
    let refused: unknown
    try {
      fleet.answer(
        'approveRelease',
        params,
        { previewId: preview.id },
        ctx(t0 + 31 * MINUTE),
      )
    } catch (error) {
      refused = error
    }
    expect(refused).toBeInstanceOf(MockRefusal)
    expect(refused).toMatchObject({
      status: 409,
      code: 'APPROVAL_PREVIEW_EXPIRED',
      message: `preview '${preview.id}' expired at ${preview.expiresAt} — take a new one and read it before deciding.`,
    })
    // The positive half: a minute inside its thirty, it decides.
    expect(
      fleet.answer(
        'approveRelease',
        params,
        { previewId: preview.id },
        ctx(t0 + 29 * MINUTE),
      )!.status,
    ).toBe(201)
  })

  it('asks for the step-up round trip when it is scripted, and decides after it', async () => {
    const origin = await serve({ role: 'admin', fleet: 'demo', stepUp: true })
    const api = caller(origin)
    const [candidate] = await releasesOf(api, 'chem-lab-booking')
    const preview = await api<Schemas['ApprovalPreview']>(
      'POST',
      `/v1/releases/${candidate!.id}/approval-preview`,
    )
    expect(preview.status).toBe(201)
    const flat = await api('POST', `/v1/releases/${candidate!.id}/approve`, {
      previewId: preview.body.id,
    })
    expect(flat.status).toBe(403)
    expect(refusalOf(flat).code).toBe('STEP_UP_REQUIRED')
    const stepped = await fetch(`${origin}/auth/step-up?returnTo=%2Fqueue`, {
      redirect: 'manual',
      headers: SESSION,
    })
    expect(stepped.status).toBe(302)
    const cookie = stepped.headers.get('set-cookie')!.split(';')[0]!
    const after = await caller(origin, `${SESSION.cookie}; ${cookie}`)(
      'POST',
      `/v1/releases/${candidate!.id}/approve`,
      { previewId: preview.body.id },
    )
    expect(after.status).toBe(201)
  })

  it('takes the team’s step as the platform does — submitted at Vancouver noon of its day, a change filed, a record handed back', async () => {
    const origin = await serve({ role: 'admin', fleet: 'demo' })
    const api = caller(origin)
    const submit = recordPath('phys-101-labs', 'iam-registration/production/submission')
    const sent = (await recordsOf(api, 'phys-101-labs')).iamRegistration!

    const tomorrow = vancouverDay(new Date(Date.now() + DAY))
    const early = await api('POST', submit, {
      reference: 'IAM-2026-0612',
      sentAt: tomorrow,
    })
    expect(early.status).toBe(400)
    expect(refusalOf(early).code).toBe('LAUNCH_SENT_AT_INVALID')
    const beforeSent = vancouverDay(new Date(Date.parse(sent.sentAt!) - 3 * DAY))
    const tooEarly = await api('POST', submit, {
      reference: 'IAM-2026-0612',
      sentAt: beforeSent,
    })
    expect(refusalOf(tooEarly).code).toBe('LAUNCH_SENT_AT_INVALID')
    expect((await recordsOf(api, 'phys-101-labs')).iamRegistration).toEqual(sent)

    const stream = liveOf(origin, idOf('phys-101-labs'))
    await stream.opened
    const submitted = await api<Schemas['IamRegistration']>('POST', submit, {
      reference: 'IAM-2026-0612',
    })
    expect(submitted.status).toBe(200)
    const noon = noonOf(today())
    expect(submitted.body).toMatchObject({
      state: 'submitted',
      sentFrom: null,
      submittedAt: noon,
      submittedBy: { id: f.OPERATOR_ID, displayName: 'Operator One' },
      externalTicketRef: 'IAM-2026-0612',
      sentAt: sent.sentAt,
    })
    // WITH UBC NOW, from Vancouver noon of today — in the future before noon, and still the stamp.
    expect(await itemsOf(api, 'phys-101-labs')).toEqual([
      expect.objectContaining({
        kind: 'iam-registration',
        subjectId: sent.id,
        environment: 'production',
        since: noon,
      }),
    ])
    expect(await stream.next('iam_registration.submitted')).toMatchObject({
      humanMessage: `Operator One recorded that the Manifest team submitted this app's production registration to UBC IAM on ${inWords(noon)} (ticket IAM-2026-0612).`,
      machineDetail: {
        environment: 'production',
        sentAt: today(),
        externalTicketRef: 'IAM-2026-0612',
        changeRequest: false,
        requestedAttributes: null,
      },
    })
    stream.close()
    const twice = await api('POST', submit, { reference: 'IAM-2026-0612' })
    expect(twice.status).toBe(409)
    expect(refusalOf(twice)).toMatchObject({
      code: 'LAUNCH_TRANSITION_INVALID',
      message:
        "this app's production registration is 'submitted': the Manifest team submits, or hands back, only what its owner sent it ('sent')",
    })

    // A CHANGE TO A LIVE REGISTRATION IS FILED AS A CHANGE REQUEST.
    const change = (await recordsOf(api, 'math-oh-queue')).iamRegistration!
    const filed = await api<Schemas['IamRegistration']>(
      'POST',
      recordPath('math-oh-queue', 'iam-registration/production/submission'),
      { reference: 'IAM-2026-0631' },
    )
    expect(filed.body).toMatchObject({
      state: 'change_requested',
      changeRequestedFrom: 'active',
      requestedAttributes: change.requestedAttributes,
      registeredAt: change.registeredAt,
      submittedAt: noon,
    })
    expect((await itemsOf(api, 'math-oh-queue')).map((i) => [i.kind, i.since])).toEqual([
      ['iam-change-request', noon],
    ])

    // HANDED BACK, unsubmitted: the assessment a draft again, the item gone.
    const rubric = await api<Schemas['PrivacyAssessment']>(
      'POST',
      recordPath('rubric-helper', 'privacy-assessment/return'),
    )
    expect(rubric.status).toBe(200)
    expect(rubric.body.state).toBe('draft')
    expect(await itemsOf(api, 'rubric-helper')).toEqual([])
    const back = await api(
      'POST',
      recordPath('rubric-helper', 'privacy-assessment/return'),
    )
    expect(back.status).toBe(409)
    expect(refusalOf(back).code).toBe('LAUNCH_TRANSITION_INVALID')
  })

  it('hands a change back to the live registration, nothing asked of UBC any more', async () => {
    const api = await fleetServer()
    const change = (await recordsOf(api, 'math-oh-queue')).iamRegistration!
    const back = await api<Schemas['IamRegistration']>(
      'POST',
      recordPath('math-oh-queue', 'iam-registration/production/return'),
    )
    expect(back.status).toBe(200)
    expect(back.body).toMatchObject({
      state: 'active',
      sentFrom: null,
      requestedAttributes: null,
      registeredAt: change.registeredAt,
      registeredAttributes: change.registeredAttributes,
    })
    expect(await itemsOf(api, 'math-oh-queue')).toEqual([])
    const pia = await api<Schemas['PrivacyAssessment']>(
      'POST',
      recordPath('rubric-helper', 'privacy-assessment/submission'),
      { reference: 'PIA-2026-0188' },
    )
    expect(pia.body).toMatchObject({
      state: 'submitted',
      externalTicketRef: 'PIA-2026-0188',
      submittedAt: noonOf(today()),
    })
    expect((await itemsOf(api, 'rubric-helper')).map((i) => i.kind)).toEqual([
      'privacy-assessment',
    ])
  })

  it('refuses an agent’s question in the administrator’s words — §26’s reason asked first, then kept beside their name', async () => {
    const origin = await serve({ role: 'admin', fleet: 'demo' })
    const api = caller(origin)
    const [question] = (
      await api<Schemas['PendingActionList']>(
        'GET',
        `/v1/projects/${idOf('bio-201-scheduler')}/pending-actions`,
      )
    ).body
    const reject = (headers: Record<string, string> = {}) =>
      api<Schemas['PendingAction']>(
        'POST',
        `/v1/pending-actions/${question!.id}/reject`,
        { reason: 'Not someone this course knows.' },
        headers,
      )
    const unexplained = await reject()
    expect(unexplained.status).toBe(400)
    expect(refusalOf(unexplained).code).toBe('ADMIN_REASON_REQUIRED')
    const confirm = await api('POST', `/v1/pending-actions/${question!.id}/confirm`, {})
    expect(refusalOf(confirm).code).toBe('ADMIN_REASON_REQUIRED')

    const stream = liveOf(origin, idOf('bio-201-scheduler'))
    await stream.opened
    const rejected = await reject({
      'manifest-admin-reason': encodeURIComponent(ADMIN_REASON),
    })
    expect(rejected.status).toBe(200)
    expect(rejected.body).toMatchObject({
      id: question!.id,
      state: 'rejected',
      reason: 'Not someone this course knows.',
    })
    expect(rejected.body.resolvedAt).not.toBeNull()
    expect(await stream.next('pending_action.rejected')).toMatchObject({
      humanMessage: `Operator One refused an agent's request to make the person whose CWL login is dpatel a collaborator of this project: Not someone this course knows. Operator One acted as a platform administrator — reason: '${ADMIN_REASON}'.`,
      machineDetail: {
        pendingActionId: question!.id,
        tokenId: question!.tokenId,
        action: 'members:manage',
        resolvedBy: f.OPERATOR_ID,
        reason: 'Not someone this course knows.',
      },
      actor: {
        name: 'Operator One',
        asAdministrator: true,
        reason: ADMIN_REASON,
        token: null,
      },
    })
    stream.close()
    const twice = await reject({ 'manifest-admin-reason': 'again' })
    expect(twice.status).toBe(409)
    expect(refusalOf(twice)).toMatchObject({
      code: 'PENDING_ACTION_RESOLVED',
      message: 'this pending action was already rejected',
    })
  })

  it('keeps each server’s decisions its own, and a restart is the reset', async () => {
    const a = await fleetServer()
    const b = await fleetServer()
    const [candidate] = await releasesOf(a, 'reading-responses')
    const preview = await a<Schemas['ApprovalPreview']>(
      'POST',
      `/v1/releases/${candidate!.id}/approval-preview`,
    )
    expect(
      (
        await a('POST', `/v1/releases/${candidate!.id}/approve`, {
          previewId: preview.body.id,
        })
      ).status,
    ).toBe(201)
    expect(await itemsOf(a, 'reading-responses')).toEqual([])
    expect(await itemsOf(b, 'reading-responses')).toHaveLength(1)
    // A PREVIEW IS ITS SERVER'S: the other has never heard of it.
    const elsewhere = await b(
      'GET',
      `/v1/releases/${candidate!.id}/approval-previews/${preview.body.id}`,
    )
    expect(elsewhere.status).toBe(404)
    const restarted = await fleetServer()
    expect(await itemsOf(restarted, 'reading-responses')).toHaveLength(1)
  })
})
