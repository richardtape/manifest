import { describe, expect, it } from 'vitest'
import { decisionOf, judgeTrace, type TraceFacts } from './launch-trace.js'

const LAUNCH = { releaseId: 'r-launch', decidedAt: '2026-10-14T10:00:00.000Z' }

const facts = (over: Partial<TraceFacts>): TraceFacts => ({
  servingReleaseId: 'r-serving',
  servingSince: '2026-10-14T11:00:00.000Z',
  decision: { kind: 'undecided' },
  approved: [LAUNCH],
  ...over,
})

describe('the launch demos’ re-use check: a release was approved, and what serves is it or a self-serve release since', () => {
  it('passes when production serves the approved release itself — the launch, as the fresh path leaves it', () => {
    expect(
      judgeTrace(facts({ decision: { kind: 'approved' }, approved: [] })),
    ).toMatchObject({
      ok: true,
    })
  })

  it('passes when production serves a release nobody decided, deployed after an approval — what make demo-capacity leaves', () => {
    const judged = judgeTrace(facts({}))
    expect(judged.ok).toBe(true)
    expect(judged.detail).toContain('r-launch')
  })

  it('fails when nothing of the project was approved — production serving an undecided release is then no launch at all', () => {
    expect(judgeTrace(facts({ approved: [] })).ok).toBe(false)
  })

  it('fails when the only approval came AFTER what serves was deployed — no self-serve release “since”', () => {
    expect(
      judgeTrace(
        facts({
          approved: [{ releaseId: 'r-later', decidedAt: '2026-10-14T12:00:00.000Z' }],
        }),
      ).ok,
    ).toBe(false)
    // ...and an earlier approval beside the later one is enough.
    expect(
      judgeTrace(
        facts({
          approved: [
            { releaseId: 'r-later', decidedAt: '2026-10-14T12:00:00.000Z' },
            LAUNCH,
          ],
        }),
      ).ok,
    ).toBe(true)
  })

  it('fails when production serves a REJECTED release, or getApproval answered anything but 404 NOT_FOUND', () => {
    expect(judgeTrace(facts({ decision: { kind: 'rejected' } })).ok).toBe(false)
    const refused = judgeTrace(
      facts({ decision: { kind: 'refused', status: 403, code: 'FORBIDDEN' } }),
    )
    expect(refused).toEqual({
      ok: false,
      detail: 'r-serving: getApproval answered 403 FORBIDDEN',
    })
  })
})

describe('decisionOf — getApproval’s answer by status AND code', () => {
  const envelope = (code: string) => ({ error: { code, message: 'm', hint: 'h' } })

  it('reads a decision, and 404 NOT_FOUND as undecided', () => {
    expect(
      decisionOf({ data: { decision: 'approved' }, response: { status: 200 } }),
    ).toEqual({
      kind: 'approved',
    })
    expect(
      decisionOf({ data: { decision: 'rejected' }, response: { status: 200 } }),
    ).toEqual({
      kind: 'rejected',
    })
    expect(
      decisionOf({ error: envelope('NOT_FOUND'), response: { status: 404 } }),
    ).toEqual({
      kind: 'undecided',
    })
  })

  it('never reads another refusal, or a 404 with another code or no envelope, as undecided', () => {
    expect(
      decisionOf({ error: envelope('FORBIDDEN'), response: { status: 403 } }),
    ).toEqual({
      kind: 'refused',
      status: 403,
      code: 'FORBIDDEN',
    })
    expect(
      decisionOf({ error: envelope('PROJECT_ARCHIVED'), response: { status: 404 } }),
    ).toEqual({ kind: 'refused', status: 404, code: 'PROJECT_ARCHIVED' })
    expect(decisionOf({ error: '', response: { status: 404 } })).toEqual({
      kind: 'refused',
      status: 404,
      code: 'UNPARSEABLE',
    })
  })
})
