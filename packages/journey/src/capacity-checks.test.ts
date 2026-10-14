import { describe, expect, it } from 'vitest'
import {
  crashLoop,
  inFlightAt,
  notTheApp,
  overlapping,
  setRuns,
  wavesOf,
  type Exit,
  type LoopRecord,
} from './capacity-checks.js'

const at = (t: number, instance: string | null, cls = 'app', ms = 20): LoopRecord => ({
  t,
  ms,
  status: cls === 'app' ? 200 : 502,
  cls,
  instance,
})

describe('a loop’s records (make demo-capacity)', () => {
  it('overlapping keeps every request that was under way inside the window, at either edge', () => {
    const records = [
      at(0, 'a', 'app', 50),
      at(100, 'a'),
      at(990, 'a', 'app', 30),
      at(1100, 'a'),
    ]
    expect(overlapping(records, 40, 1000).map((r) => r.t)).toEqual([0, 100, 990])
  })

  it('inFlightAt is true only for a request that started before the moment and ended after it', () => {
    expect(inFlightAt(at(100, 'a', 'app', 50), 120)).toBe(true)
    expect(inFlightAt(at(100, 'a', 'app', 50), 150)).toBe(true)
    expect(inFlightAt(at(100, 'a', 'app', 50), 151)).toBe(false)
    expect(inFlightAt(at(100, 'a', 'app', 50), 99)).toBe(false)
  })

  it('notTheApp is every answer that was neither the app nor a reset', () => {
    const records = [
      at(0, 'a'),
      at(1, null, 'reset'),
      at(2, null, 'wildcard'),
      at(3, null, '502-empty'),
      at(4, null, 'status-401'),
    ]
    expect(notTheApp(records).map((r) => r.cls)).toEqual([
      'wildcard',
      '502-empty',
      'status-401',
    ])
  })

  it('setRuns collapses the answers into the sets they came from, in order', () => {
    const sets = { A: ['a1', 'a2'], B: ['b1', 'b2'] }
    const records = [
      at(0, 'a1'),
      at(1, 'a2'),
      at(2, null, 'reset'),
      at(3, 'a1'),
      at(4, 'b2'),
      at(5, 'b1'),
    ]
    expect(setRuns(records, sets)).toEqual(['A', 'B'])
    // Back again is two changes, not one — the shape a route that flapped would leave.
    expect(setRuns([...records, at(6, 'a2')], sets)).toEqual(['A', 'B', 'A'])
    // An instance outside both sets is NAMED, never folded into a neighbour.
    expect(setRuns([at(0, 'a1'), at(1, 'zz'), at(2, 'b1')], sets)).toEqual([
      'A',
      'zz',
      'B',
    ])
  })
})

describe('the replacement waves', () => {
  it('groups the members one deploy started, and keeps deploys apart', () => {
    const waves = wavesOf([
      { id: 'w1a', at: 10_000 },
      { id: 'w1b', at: 10_200 },
      { id: 'w2a', at: 70_000 },
      { id: 'w2b', at: 70_050 },
    ])
    expect(waves).toEqual([
      { at: 10_000, ids: ['w1a', 'w1b'] },
      { at: 70_000, ids: ['w2a', 'w2b'] },
    ])
  })
})

/** A crash loop as the watcher records it: exits at 0 s, then 60 s, then 240 s, then stopped. */
function loop(): { exits: Exit[]; waves: { at: number; ids: string[] }[] } {
  const exit = (
    instanceId: string,
    t: number,
    attempt: number,
    nextInSeconds: number | null,
  ): Exit => ({
    instanceId,
    at: t,
    attempt,
    replacement: nextInSeconds === null ? 'stopped' : 'scheduled',
    nextInSeconds,
  })
  return {
    exits: [
      exit('p1', 20_000, 1, 0),
      exit('p2', 20_010, 1, 0),
      exit('r1a', 50_000, 2, 60),
      exit('r1b', 50_020, 2, 60),
      exit('r2a', 140_000, 3, 240),
      exit('r2b', 140_010, 3, 240),
      exit('r3a', 410_000, 4, null),
      exit('r3b', 410_020, 4, null),
    ],
    waves: [
      { at: 20_300, ids: ['r1a', 'r1b'] },
      { at: 110_100, ids: ['r2a', 'r2b'] },
      { at: 380_200, ids: ['r3a', 'r3b'] },
    ],
  }
}

describe('crashLoop — three replacements at once, a minute, four minutes, then stopped', () => {
  it('passes the loop the watcher is built to make', () => {
    const { exits, waves } = loop()
    const result = crashLoop(exits, waves)
    expect(result.problems).toEqual([])
    expect(result.ok).toBe(true)
    expect(result.rows).toHaveLength(4)
  })

  it('refuses a second replacement started before the minute was up', () => {
    const { exits, waves } = loop()
    waves[1] = { at: 80_000, ids: ['r2a', 'r2b'] }
    const result = crashLoop(exits, waves)
    expect(result.ok).toBe(false)
    expect(result.problems.join(' ')).toMatch(/replacement 2 started 30 s after/)
  })

  it('refuses a third replacement started before four minutes were up', () => {
    const { exits, waves } = loop()
    waves[2] = { at: 200_000, ids: ['r3a', 'r3b'] }
    expect(crashLoop(exits, waves).problems.join(' ')).toMatch(
      /replacement 3 started 60 s after/,
    )
  })

  it('refuses a first replacement that did not start at once', () => {
    const { exits, waves } = loop()
    waves[0] = { at: 80_000, ids: ['r1a', 'r1b'] }
    expect(crashLoop(exits, waves).problems.join(' ')).toMatch(
      /replacement 1 started 60 s after/,
    )
  })

  it('refuses an exit that announced the wrong wait', () => {
    const { exits, waves } = loop()
    exits[2] = { ...exits[2]!, nextInSeconds: 0 }
    expect(crashLoop(exits, waves).problems.join(' ')).toMatch(
      /exit 2 said 0 s, not 60 s/,
    )
  })

  it('refuses a fourth replacement — a loop that did not stop', () => {
    const { exits, waves } = loop()
    waves.push({ at: 420_000, ids: ['r4a', 'r4b'] })
    expect(crashLoop(exits, waves).problems.join(' ')).toMatch(/4 replacements/)
  })

  it('refuses a loop with no stopped exit', () => {
    const { exits, waves } = loop()
    const result = crashLoop(
      exits.filter((e) => e.replacement === 'scheduled'),
      waves,
    )
    expect(result.problems.join(' ')).toMatch(/no exit said replacing had stopped/)
  })

  it('refuses a stop said before the third replacement, or on the wrong attempt', () => {
    const { exits, waves } = loop()
    const early = exits.map((e) =>
      e.attempt === 3
        ? { ...e, replacement: 'stopped' as const, nextInSeconds: null }
        : e,
    )
    expect(crashLoop(early, waves).ok).toBe(false)
    const wrong = exits.map((e) => (e.attempt === 4 ? { ...e, attempt: 5 } : e))
    expect(crashLoop(wrong, waves).problems.join(' ')).toMatch(/attempt 5, not 4/)
  })

  it('refuses a replacement started after the stop', () => {
    const { exits, waves } = loop()
    waves.push({ at: 500_000, ids: ['late'] })
    expect(crashLoop(exits, waves).ok).toBe(false)
  })
})
