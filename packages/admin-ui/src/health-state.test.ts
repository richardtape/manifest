import { createMockServer } from '@manifest/mock'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApi, type Api } from './api.js'
import {
  certificatesPanel,
  incidentsPanel,
  incidentTargets,
  readWords,
  scansPanel,
  supersededPanel,
  type HealthRead,
} from './health-state.js'
import { readHealth } from './screens/health.js'

/**
 * HEALTH'S FOUR PANELS, FROM THE DEMO FLEET'S OWN ANSWERS — read through the screen's own fan-out
 * (`readHealth`), with every call the console's client makes counted beside it, so the screen's *"from N
 * reads"* is held to what was actually sent.
 */
let server: ReturnType<typeof createMockServer>
let read: HealthRead
let calls = 0
const now = () => new Date()

/** The console's client, every operation it calls counted. */
function counting(api: Api): Api {
  return new Proxy(api, {
    get(target, name, receiver) {
      const value = Reflect.get(target, name, receiver) as unknown
      if (typeof value !== 'function' || name === 'newKey') return value
      return (...args: unknown[]) => {
        calls += 1
        return (value as (...a: unknown[]) => unknown).apply(target, args)
      }
    },
  })
}

beforeAll(async () => {
  server = createMockServer({ scanSilenceMs: 50, role: 'admin', fleet: 'demo' })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as { port: number }
  const api = createApi({ origin: `http://127.0.0.1:${port}`, session: 'mock-session' })
  read = await readHealth(counting(api), now())
})

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
})

describe('what Health reads', () => {
  it('counts its reads as it sends them — N is every call made, not an estimate', () => {
    expect(read.reads).toBe(calls)
    expect(read.reads).toBeGreaterThan(14)
  })

  it('reads the Incidents only where the fleet says one happened in 14 days, and never an archived app’s', () => {
    const slugs = incidentTargets(read.fleet, now()).map(
      (t) => read.fleet.find((p) => p.id === t.projectId)!.slug,
    )
    expect(slugs).toContain('econ-101-polls')
    expect(slugs).toContain('cpsc-110-help')
    expect(slugs).not.toContain('bio-201-scheduler')
    expect(slugs).not.toContain('hist-105-archive')
  })
})

describe('the certificates', () => {
  it('shows math-oh-queue red and bio-201-scheduler amber, soonest first', () => {
    const certs = certificatesPanel(read, now())
    expect(certs.map((c) => [c.slug, c.environment, c.tone])).toEqual([
      ['math-oh-queue', 'production', 'red'],
      ['bio-201-scheduler', 'production', 'amber'],
    ])
    expect(certs.map((c) => c.days)).toEqual([11, 60])
  })
})

describe('the Incidents, by cause', () => {
  it('leads with econ-101-polls’ replacing given up, then the stopped-and-replaced, then a failed deploy', () => {
    const entries = incidentsPanel(read, now())
    expect(entries[0]).toMatchObject({
      slug: 'econ-101-polls',
      kind: 'production',
      words: 'It stopped, and replacing it gave up',
      state: 'attention',
    })
    const rank = { exit_stopped: 0, exit: 1, deploy: 2 }
    const ranks = entries.map((e) => rank[e.incident.cause])
    expect([...ranks].sort()).toEqual(ranks)
    expect(
      entries.filter((e) => e.slug === 'cpsc-110-help').map((e) => e.incident.cause),
    ).toEqual(['exit'])
    expect(entries.filter((e) => e.slug === 'econ-101-polls')).toHaveLength(4)
  })
})

describe('the scans', () => {
  it('names stats-sim’s release, scanned against a stale database, serving sandbox and staging', () => {
    const scans = scansPanel(read)
    expect(scans.map((s) => [s.slug, s.why, [...s.kinds].sort()])).toEqual([
      ['stats-sim', 'stale', ['sandbox', 'staging']],
    ])
    expect(scans[0]!.release.scan!.databaseAgeDays).toBe(9)
  })
})

describe('the superseded blueprints', () => {
  it('is empty on the demo fleet — no older major exists at 1.9.0 (sitting 2, F3)', () => {
    expect(supersededPanel(read)).toEqual([])
  })

  it('names an app on an older major against the newest one', () => {
    const fleet = read.fleet.map((p) =>
      p.slug === 'stats-sim' ? { ...p, blueprint: 'node-ts-mongo@0' } : p,
    )
    expect(supersededPanel({ ...read, fleet })).toEqual([
      expect.objectContaining({
        slug: 'stats-sim',
        blueprint: 'node-ts-mongo@0',
        newer: 'node-ts-mongo@1',
      }),
    ])
  })
})

describe('what the screen cost', () => {
  it('says how long ago and from how many reads', () => {
    const at = new Date('2026-10-15T17:00:00Z')
    expect(readWords(31, at, new Date('2026-10-15T17:00:20Z'))).toBe(
      'Read just now from 31 reads',
    )
    expect(readWords(31, at, new Date('2026-10-15T17:02:00Z'))).toBe(
      'Read 2 minutes ago from 31 reads',
    )
    expect(readWords(1, at, new Date('2026-10-15T17:01:10Z'))).toBe(
      'Read a minute ago from 1 read',
    )
  })
})
