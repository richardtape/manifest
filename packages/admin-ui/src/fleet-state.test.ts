import type { Schemas } from '@manifest/contract'
import { createMockServer } from '@manifest/mock'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApi } from './api.js'
import {
  DEFAULT_SORT,
  envCellOf,
  filterFromQuery,
  incidentAfterDeploy,
  NO_FILTER,
  queryFromFilter,
  rowsOf,
  sortFromQuery,
  type FleetFilter,
  type FleetRow,
  type FleetSort,
} from './fleet-state.js'

/**
 * THE FLEET'S PURE HALF, ON THE DEMO FLEET'S OWN ANSWERS — `listFleet` and `listBlueprints` read through
 * the console's client from `MANIFEST_MOCK_FLEET=demo` (fourteen apps: the thirteen and `mock-app`).
 */
let server: ReturnType<typeof createMockServer>
let fleet: Schemas['Fleet']
let blueprints: Schemas['BlueprintList']
let now: Date

beforeAll(async () => {
  server = createMockServer({ scanSilenceMs: 50, role: 'admin', fleet: 'demo' })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as { port: number }
  const api = createApi({ origin: `http://127.0.0.1:${port}`, session: 'mock-session' })
  ;[fleet, blueprints] = await Promise.all([api.listFleet(), api.listBlueprints()])
  now = new Date()
})

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
})

const slugs = (rows: FleetRow[]) => rows.map((r) => r.slug)
const with_ = (over: Partial<FleetFilter>): FleetFilter => ({ ...NO_FILTER, ...over })
const envOf = (slug: string, kind: 'sandbox' | 'staging' | 'production') =>
  fleet.find((p) => p.slug === slug)!.environments.find((e) => e.kind === kind)!

describe('the filters in the URL', () => {
  it('round-trips every field — filterFromQuery(queryFromFilter(f)) is f', () => {
    const f: FleetFilter = {
      text: 'park & co',
      inProduction: true,
      failedLast: true,
      olderBlueprint: true,
      archived: true,
      scale: ['class', 'public'],
    }
    expect(filterFromQuery(queryFromFilter(f))).toEqual(f)
    for (const key of [
      'inProduction',
      'failedLast',
      'olderBlueprint',
      'archived',
    ] as const) {
      const one = { ...NO_FILTER }
      one[key] = true
      expect(filterFromQuery(queryFromFilter(one))).toEqual(one)
    }
  })

  it('writes no filter as no query, and reads nothing it does not know', () => {
    expect(queryFromFilter(NO_FILTER)).toBe('')
    expect(filterFromQuery('')).toEqual(NO_FILTER)
    expect(filterFromQuery('scale=huge&scale=solo&prod=yes&x=1')).toEqual(
      with_({ scale: ['solo'] }),
    )
  })

  it('keeps the sort beside them — the most recent deploy first when none is named', () => {
    expect(sortFromQuery('')).toEqual(DEFAULT_SORT)
    expect(DEFAULT_SORT).toEqual({ key: 'deploy', dir: 'desc' })
    const sort: FleetSort = { key: 'blueprint', dir: 'asc' }
    expect(sortFromQuery(queryFromFilter(with_({ inProduction: true }), sort))).toEqual(
      sort,
    )
    expect(queryFromFilter(NO_FILTER, DEFAULT_SORT)).toBe('')
    expect(sortFromQuery('sort=nonsense&dir=up')).toEqual(DEFAULT_SORT)
  })
})

describe('the rows', () => {
  it('hides archived apps by default, and shows them with the Archived filter', () => {
    const all = rowsOf(fleet, blueprints, NO_FILTER, DEFAULT_SORT)
    expect(all).toHaveLength(13)
    expect(slugs(all)).not.toContain('hist-105-archive')
    expect(
      slugs(rowsOf(fleet, blueprints, with_({ archived: true }), DEFAULT_SORT)),
    ).toEqual(['hist-105-archive'])
  })

  it('finds the apps in production', () => {
    const rows = rowsOf(fleet, blueprints, with_({ inProduction: true }), DEFAULT_SORT)
    expect(slugs(rows).sort()).toEqual(
      [
        'bio-201-scheduler',
        'cpsc-110-help',
        'econ-101-polls',
        'lang-202-journal',
        'math-oh-queue',
        'reading-responses',
      ].sort(),
    )
  })

  it('finds an environment whose newest Incident came after its last deploy — econ’s stopped member, rubric-helper’s staging; never cpsc’s replaced one', () => {
    const rows = rowsOf(fleet, blueprints, with_({ failedLast: true }), DEFAULT_SORT)
    expect(slugs(rows)).toContain('econ-101-polls')
    expect(slugs(rows)).toContain('rubric-helper')
    expect(slugs(rows)).not.toContain('cpsc-110-help')
    expect(incidentAfterDeploy(envOf('cpsc-110-help', 'production'))).toBe(false)
  })

  it('finds an older blueprint from listBlueprints’ majors — on a synthetic row, since no fleet app is on one (sitting 2, F3)', () => {
    expect(
      rowsOf(fleet, blueprints, with_({ olderBlueprint: true }), DEFAULT_SORT),
    ).toEqual([])
    const ref = blueprints[0]!.ref
    const [name, major] = ref.split('@') as [string, string]
    const old: Schemas['Fleet'][number] = {
      ...fleet[0]!,
      id: 'old',
      slug: 'old-one',
      state: 'active',
      blueprint: `${name}@${Number(major) - 1}`,
    }
    const rows = rowsOf(
      [...fleet, old],
      blueprints,
      with_({ olderBlueprint: true }),
      DEFAULT_SORT,
    )
    expect(slugs(rows)).toEqual(['old-one'])
    expect(rows[0]!.newerBlueprint).toBe(ref)
  })

  it('filters by audience and by text over slug, name, owner and blueprint', () => {
    expect(
      slugs(rowsOf(fleet, blueprints, with_({ scale: ['large_course'] }), DEFAULT_SORT)),
    ).toEqual(['mus-100-listening'])
    expect(
      slugs(rowsOf(fleet, blueprints, with_({ text: 'leo park' }), DEFAULT_SORT)),
    ).toEqual(['stats-sim'])
    expect(
      slugs(rowsOf(fleet, blueprints, with_({ text: 'Field Notes' }), DEFAULT_SORT)),
    ).toEqual(['field-notes'])
  })

  it('puts the most recent deploy first by default, a never-deployed app last', () => {
    const rows = rowsOf(fleet, blueprints, NO_FILTER, DEFAULT_SORT)
    const deployed = rows
      .filter((r) => r.lastDeployAt !== null)
      .map((r) => Date.parse(r.lastDeployAt!))
    expect(deployed).toEqual([...deployed].sort((a, b) => b - a))
    expect(rows.slice(0, deployed.length).every((r) => r.lastDeployAt !== null)).toBe(
      true,
    )
  })

  it('sorts by every column, both ways', () => {
    for (const key of [
      'slug',
      'audience',
      'sandbox',
      'staging',
      'production',
      'serving',
      'blueprint',
      'deploy',
    ] as const) {
      const up = rowsOf(fleet, blueprints, NO_FILTER, { key, dir: 'asc' })
      const down = rowsOf(fleet, blueprints, NO_FILTER, { key, dir: 'desc' })
      expect(up, key).toHaveLength(13)
      if (key === 'slug') {
        expect(slugs(up)).toEqual([...slugs(up)].sort())
        expect(slugs(down)).toEqual([...slugs(up)].reverse())
      }
    }
    const byProduction = rowsOf(fleet, blueprints, NO_FILTER, {
      key: 'production',
      dir: 'asc',
    })
    // Not deployed sorts after every state, whichever way the rest go.
    expect(byProduction.at(-1)!.envs.production?.state ?? null).toBeNull()
  })
})

describe('an environment’s cell', () => {
  it('econ-101-polls’ production: healthy, the set’s two, the last deploy’s age, and the incident after it', () => {
    const cell = envCellOf(envOf('econ-101-polls', 'production'), now)!
    expect(cell).toMatchObject({ state: 'healthy', instances: 2 })
    expect(cell.age).toMatch(/ ago$/)
    expect(cell.incident).toMatch(/^\d+m ago$/)
  })

  it('cpsc-110-help’s production: its replacement served after the exit — no incident marker', () => {
    expect(envCellOf(envOf('cpsc-110-help', 'production'), now)?.incident).toBeUndefined()
  })

  it('mus-100-listening’s production: never deployed — no state, no age', () => {
    expect(envCellOf(envOf('mus-100-listening', 'production'), now)).toEqual({
      state: null,
    })
  })
})
