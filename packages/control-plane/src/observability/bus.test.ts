import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { projects } from '../db/index.js'
import { withProject } from '../db/testing.js'
import {
  createEventBus,
  recentFramesFor,
  recordEvent,
  type EventType,
  type StreamFrame,
} from './index.js'

const IDENTITY = (value: unknown): unknown => value

/** One well-formed event frame. Local to this file, as P4b's Global Constraints say. */
const frame = (projectId: string, id: string, type = 'build.started'): StreamFrame => ({
  kind: 'event',
  id,
  projectId,
  subject: 'build:1',
  type,
  humanMessage: 'Building.',
  machineDetail: {},
  createdAt: new Date().toISOString(),
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the event bus (D23.2)', () => {
  it('delivers only to subscribers of that project', () => {
    // Tenant isolation at the transport, not only at the route. Two independent reads
    // of one rule is the shape the roadmap's lesson asks for; the route's authorization
    // is the other one.
    const bus = createEventBus()
    const a: string[] = []
    const b: string[] = []
    bus.subscribe('project-a', (f) => a.push(f.id))
    bus.subscribe('project-b', (f) => b.push(f.id))
    bus.publish(frame('project-a', '1'))
    expect(a).toEqual(['1'])
    expect(b).toEqual([])
  })

  it('keeps delivering past a listener that throws — and says so, rather than swallowing it', () => {
    // One socket that dies mid-send must not take the fan-out with it: without this, a
    // browser tab closing during a build stops the build's log reaching every other
    // viewer. And the throw is REPORTED, because `.catch(() => undefined)` is this
    // codebase's most productive defect.
    const report = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const bus = createEventBus()
    const seen: string[] = []
    bus.subscribe('p', () => {
      throw new Error('socket gone')
    })
    const off = bus.subscribe('p', (f) => seen.push(f.id))
    expect(() => bus.publish(frame('p', '1'))).not.toThrow()
    expect(seen).toEqual(['1'])
    expect(report).toHaveBeenCalledTimes(1)
    expect(String(report.mock.calls[0]![0])).toContain('socket gone')
    off()
    bus.publish(frame('p', '2'))
    expect(seen).toEqual(['1'])
  })

  it('counts each project’s listeners, so a socket that closed and stayed subscribed is visible', () => {
    const bus = createEventBus()
    const listener = (): void => undefined
    // The SAME function twice is two subscriptions, each with its own unsubscribe.
    const first = bus.subscribe('p', listener)
    const second = bus.subscribe('p', listener)
    expect(bus.listenerCount('p')).toBe(2)
    expect(bus.listenerCount('q')).toBe(0)
    first()
    first()
    expect(bus.listenerCount('p')).toBe(1)
    second()
    expect(bus.listenerCount('p')).toBe(0)
  })
})

describe('recentFramesFor — the replay a new connection starts with', () => {
  async function record(
    db: Parameters<typeof recordEvent>[0],
    projectId: string,
    type: EventType,
  ) {
    return recordEvent(
      db,
      {
        projectId,
        subject: 's',
        type,
        machineDetail: { n: type },
        humanMessage: 'Something happened.',
      },
      IDENTITY,
    )
  }

  it('returns that project’s newest events, oldest first, as event frames', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const [other] = await db
        .insert(projects)
        .values({
          slug: `other-${projectId.slice(0, 8)}`,
          ownerId,
          blueprintRef: 'fixture-node@1',
        })
        .returning()
      const written = []
      for (const type of [
        'sso.registered',
        'sso.acs_changed',
        'instance.failed',
        'sso.registered',
      ] as const) {
        written.push(await record(db, projectId, type))
      }
      await record(db, other!.id, 'instance.failed')

      const frames = await recentFramesFor(db, projectId, 3)
      // The LAST three, in the order they happened — a stack of events read newest
      // first is a build that fails before it starts.
      expect(frames.map((f) => f.id)).toEqual(written.slice(1).map((e) => e.id))
      expect(frames.every((f) => f.kind === 'event' && f.projectId === projectId)).toBe(
        true,
      )
      expect(frames[0]).toEqual({
        kind: 'event',
        id: written[1]!.id,
        projectId,
        subject: 's',
        type: 'sso.acs_changed',
        humanMessage: 'Something happened.',
        machineDetail: { n: 'sso.acs_changed' },
        createdAt: written[1]!.createdAt.toISOString(),
      })
    })
  })

  it('orders events recorded inside ONE transaction as they were recorded', async () => {
    // `now()` is the TRANSACTION's start time, so every event one transaction writes
    // would carry the same `created_at`, and a replay ordered by it would come back in
    // whatever order the index happened to hold. The column must tell them apart.
    await withProject(async (db, { projectId }) => {
      const first = await record(db, projectId, 'sso.registered')
      const second = await record(db, projectId, 'sso.acs_changed')
      const third = await record(db, projectId, 'instance.failed')
      // Read in SQL: the column holds microseconds and a JS Date keeps milliseconds, so
      // two fast inserts can look equal here and be distinct there.
      const distinct = await db.execute(
        sql`SELECT count(DISTINCT created_at)::int AS n FROM audit.events WHERE project_id = ${projectId}`,
      )
      expect((distinct.rows[0] as { n: number }).n).toBe(3)
      const frames = await recentFramesFor(db, projectId, 50)
      expect(frames.map((f) => f.id)).toEqual([first.id, second.id, third.id])
    })
  })

  it('refuses a limit that is not a whole number of at least 1', async () => {
    await withProject(async (db, { projectId }) => {
      await expect(recentFramesFor(db, projectId, 0)).rejects.toThrow(/at least 1/)
    })
  })
})
