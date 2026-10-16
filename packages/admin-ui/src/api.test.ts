import { ManifestApiError } from '@manifest/contract'
import { createMockServer, fixtures, FLEET_PROJECTS } from '@manifest/mock'
import { describe, expect, it } from 'vitest'
import { createApi } from './api.js'
import { BAND, headlineOf } from './queue-state.js'
import { vancouverToday } from './time.js'
import {
  createKeys,
  grantedChange,
  iamAnswerBody,
  prefilledAttributes,
  submissionBody,
} from './transitions.js'

/**
 * THE CONSOLE'S CALLS, AGAINST `manifest-mock`, IN NODE — the reference console's pattern
 * (`packages/console/src/api.test.ts`): `createApi({ origin, session })` is the Node shape; in a
 * browser the console passes `{ origin: window.location.origin }` and the browser sends its own
 * cookie and `Origin`. Importing `@manifest/mock` here is outside the boundary by design: the
 * boundary test skips test files, and so does the lint rule.
 *
 * Every refusal asserts its CODE (CLAUDE.md, *Assert the shape of the answer*): a status-only `403`
 * is satisfied by any refusal at all.
 */
async function withMock<T>(
  fn: (origin: string) => Promise<T>,
  options: Parameters<typeof createMockServer>[0] = {},
): Promise<T> {
  const server = createMockServer({ scanSilenceMs: 50, ...options })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as { port: number }
  try {
    return await fn(`http://127.0.0.1:${port}`)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

const api = (origin: string) => createApi({ origin, session: 'mock-session' })

async function refusal(promise: Promise<unknown>): Promise<ManifestApiError> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(ManifestApiError)
  return error as ManifestApiError
}

describe('the administrator’s console’s client', () => {
  it('getMe answers an administrator under role admin, and a member without', async () => {
    const admin = await withMock((o) => api(o).getMe(), { role: 'admin' })
    expect(admin.role).toBe('admin')
    const member = await withMock((o) => api(o).getMe())
    expect(member.role).toBe('member')
  })

  it('listQueue and listFleet answer an administrator', async () => {
    await withMock(
      async (o) => {
        const queue = await api(o).listQueue()
        expect(Array.isArray(queue.items)).toBe(true)
        expect(typeof queue.truncated).toBe('boolean')
        const fleet = await api(o).listFleet()
        expect(fleet.map((p) => p.id)).toContain(fixtures.PROJECT_ID)
      },
      { role: 'admin' },
    )
  })

  it('refuses a member the queue and the fleet — 403 FORBIDDEN, each', async () => {
    await withMock(async (o) => {
      const queue = await refusal(api(o).listQueue())
      expect([queue.status, queue.code]).toEqual([403, 'FORBIDDEN'])
      const fleet = await refusal(api(o).listFleet())
      expect([fleet.status, fleet.code]).toEqual([403, 'FORBIDDEN'])
    })
  })

  /**
   * `getApproval` is the newest decision, and `404 NOT_FOUND` when nobody has decided — which is
   * not a failure for a console that is about to decide it, so the client answers `null` for that
   * and that alone.
   */
  it('getApproval answers the decision, and null when nobody has decided', async () => {
    const decided = await withMock((o) => api(o).getApproval(fixtures.RELEASE_ID), {
      role: 'admin',
    })
    expect(decided?.releaseId).toBe(fixtures.RELEASE_ID)
    const pending = await withMock((o) => api(o).getApproval(fixtures.RELEASE_ID), {
      role: 'admin',
      approval: 'pending',
    })
    expect(pending).toBeNull()
  })

  it('getApproval throws every other refusal — a signed-out read is 401 UNAUTHENTICATED, not null', async () => {
    // Only `404 NOT_FOUND` becomes `null`; any other refusal must reach <Refusal> or the sign-in
    // round trip, never read as "nobody has decided".
    await withMock(async (o) => {
      const signedOut = createApi({ origin: o })
      const error = await refusal(signedOut.getApproval(fixtures.RELEASE_ID))
      expect([error.status, error.code]).toEqual([401, 'UNAUTHENTICATED'])
    })
  })
})

/**
 * THE DEMO FLEET (`MANIFEST_MOCK_FLEET=demo`) — the queue the console is walked on. Its data carries
 * the headline's trap: our band's oldest wait is `reading-responses`' sign-off, while
 * `oldestSince` is a privacy assessment with the Privacy Office (`mock-app`'s).
 */
describe('the queue on the demo fleet', () => {
  const fleet = { role: 'admin', fleet: 'demo' } as const

  it('headlines reading-responses’ wait, not oldestSince — five people on our band', async () => {
    const queue = await withMock((o) => api(o).listQueue(), fleet)
    const rr = queue.items.find(
      (i) => i.kind === 'release-approval' && i.project.slug === 'reading-responses',
    )
    expect(rr?.project.id).toBe(
      FLEET_PROJECTS.find((p) => p.slug === 'reading-responses')?.id,
    )
    const headline = headlineOf(queue)
    expect(headline.oldestOnUs).toBe(rr?.since)
    expect(headline.peopleWaiting).toBe(5)
    expect(headline.truncated).toBe(false)
    const oldest = queue.items.find((i) => i.since === queue.oldestSince)
    expect(oldest && BAND[oldest.kind]).toBe('ubc')
    expect(queue.oldestSince).not.toBe(rr?.since)
  })
})

/**
 * A RELEASE SIGNED OFF FROM A STORED PREVIEW, ON THE DEMO FLEET (Task 7): the decision takes — the item
 * leaves the queue — and the same action retried with the same key is the same decision, replayed.
 */
describe('a release approved on the demo fleet', () => {
  const fleet = { role: 'admin', fleet: 'demo' } as const
  const rrOf = (queue: Awaited<ReturnType<ReturnType<typeof api>['listQueue']>>) =>
    queue.items.find(
      (i) => i.kind === 'release-approval' && i.project.slug === 'reading-responses',
    )

  it('preview → approve → the queue no longer lists reading-responses; the same key replays the same Approval', async () => {
    await withMock(async (o) => {
      const client = api(o)
      const rr = rrOf(await client.listQueue())!
      const preview = await client.createApprovalPreview(rr.subjectId, client.newKey())
      const key = client.newKey()
      const body = { previewId: preview.id, reason: 'The egress change is in the PIA.' }
      const approval = await client.approveRelease(rr.subjectId, body, key)
      expect(approval).toMatchObject({
        releaseId: rr.subjectId,
        decision: 'approved',
        decidedByName: 'Operator One',
        previewId: preview.id,
        reason: 'The egress change is in the PIA.',
      })
      expect(rrOf(await client.listQueue())).toBeUndefined()
      // A retry after a lost answer: the same key, the same body — one decision, replayed.
      const again = await client.approveRelease(rr.subjectId, body, key)
      expect(again).toEqual(approval)
      expect(await client.getApproval(rr.subjectId)).toEqual(approval)
    }, fleet)
  })

  it('refuses a decision without a recent step-up first — 403 STEP_UP_REQUIRED, the item still queued', async () => {
    await withMock(
      async (o) => {
        const client = api(o)
        const rr = rrOf(await client.listQueue())!
        const preview = await client.createApprovalPreview(rr.subjectId, client.newKey())
        const error = await refusal(
          client.approveRelease(rr.subjectId, { previewId: preview.id }, client.newKey()),
        )
        expect([error.status, error.code]).toEqual([403, 'STEP_UP_REQUIRED'])
        expect(rrOf(await client.listQueue())).toBeDefined()
      },
      { ...fleet, stepUp: true },
    )
  })
})

/**
 * THE TEAM'S STEP AND UBC'S ANSWER, ON THE DEMO FLEET (Task 8) — every body built by the pane's own
 * functions (`transitions.ts`), and the fleet VALIDATES EACH AGAINST ITS OPERATION'S REQUEST SCHEMA and
 * writes it as `launch/records.ts` does, so a wrong body fails here: refused, or written to the wrong
 * record and read back so (C1, Review Focus 1).
 */
describe('the team’s step and UBC’s answer on the demo fleet', () => {
  const fleet = { role: 'admin', fleet: 'demo' } as const
  type Client = ReturnType<typeof api>
  const itemOf = async (client: Client, slug: string, kind: string) => {
    const found = (await client.listQueue()).items.find(
      (i) => i.project.slug === slug && i.kind === kind,
    )
    expect(found, `${slug}'s ${kind}`).toBeDefined()
    return found!
  }
  const itemsOf = async (client: Client, slug: string) =>
    (await client.listQueue()).items
      .filter((i) => i.project.slug === slug)
      .map((i) => [i.kind, i.subjectId])

  it('submits phys-101-labs’ production registration to UBC IAM — the item is now iam-registration, waiting on UBC', async () => {
    await withMock(async (o) => {
      const client = api(o)
      const phys = await itemOf(client, 'phys-101-labs', 'iam-registration-to-submit')
      expect(phys.environment).toBe('production')
      const record = await client.submitIamRegistration(
        phys.project.id,
        'production',
        submissionBody({ ticket: 'IAM-2026-0631', sentOn: vancouverToday(new Date()) }),
        client.newKey(),
      )
      expect([record.id, record.state, record.externalTicketRef]).toEqual([
        phys.subjectId,
        'submitted',
        'IAM-2026-0631',
      ])
      expect(await itemsOf(client, 'phys-101-labs')).toEqual([
        ['iam-registration', phys.subjectId],
      ])
    }, fleet)
  })

  it('records stats-sim’s answer active with iamAnswerBody’s body — gone; STAGING active, production untouched', async () => {
    await withMock(async (o) => {
      const client = api(o)
      const stats = await itemOf(client, 'stats-sim', 'iam-registration')
      expect(stats.environment).toBe('staging')
      const before = await client.getLaunchRecords(stats.project.id)
      const staging = before.stagingRegistration!
      expect(staging.id).toBe(stats.subjectId)
      const attributes = prefilledAttributes(staging)
      await client.recordIamRegistration(
        stats.project.id,
        iamAnswerBody(staging, stats, {
          state: 'active',
          ticket: 'IAM-2026-0511',
          registeredAttributes: attributes,
        }),
        client.newKey(),
      )
      expect(await itemsOf(client, 'stats-sim')).toEqual([])
      const after = await client.getLaunchRecords(stats.project.id)
      expect(after.stagingRegistration).toMatchObject({
        id: staging.id,
        state: 'active',
        entityId: staging.entityId,
        registeredAttributes: attributes,
        externalTicketRef: 'IAM-2026-0511',
        certFingerprint: staging.package!.certificate.fingerprint,
      })
      expect(after.stagingRegistration!.registeredAt).not.toBeNull()
      expect(after.iamRegistration).toEqual(before.iamRegistration)
    }, fleet)
  })

  it('grants lang-202-journal’s change in grantedChange’s two writes — with UBC since now between them, then gone, active at the granted set', async () => {
    await withMock(async (o) => {
      const client = api(o)
      const lang = await itemOf(client, 'lang-202-journal', 'iam-change-request')
      const live = (await client.getLaunchRecords(lang.project.id)).iamRegistration!
      expect([live.id, live.state, live.changeRequestedFrom]).toEqual([
        lang.subjectId,
        'change_requested',
        'active',
      ])
      const granted = prefilledAttributes(live)
      expect(granted).toContain('sn')
      const [first, second] = grantedChange(live, lang, live.externalTicketRef!, granted)
      const t = Date.now()
      await client.recordIamRegistration(lang.project.id, first, client.newKey())
      // Sitting 3's F2: an administrator's record stamps NOW — the item is UBC's, waiting since this minute.
      const between = await itemOf(client, 'lang-202-journal', 'iam-registration')
      expect(Math.abs(Date.parse(between.since) - t)).toBeLessThan(60_000)
      await client.recordIamRegistration(lang.project.id, second, client.newKey())
      expect(await itemsOf(client, 'lang-202-journal')).toEqual([])
      const after = (await client.getLaunchRecords(lang.project.id)).iamRegistration!
      expect(after).toMatchObject({
        state: 'active',
        registeredAttributes: granted,
        requestedAttributes: null,
        entityId: live.entityId,
        certFingerprint: live.certFingerprint,
        certExpiresAt: live.certExpiresAt,
      })
    }, fleet)
  })

  it('hands rubric-helper’s assessment back — gone, a draft again', async () => {
    await withMock(async (o) => {
      const client = api(o)
      const rubric = await itemOf(client, 'rubric-helper', 'privacy-assessment-to-submit')
      const back = await client.returnPrivacyAssessment(
        rubric.project.id,
        client.newKey(),
      )
      expect([back.id, back.state]).toEqual([rubric.subjectId, 'draft'])
      expect(await itemsOf(client, 'rubric-helper')).toEqual([])
    }, fleet)
  })

  it('a second Submit after a lost answer sends the SAME key — the fleet replays the first answer, one submission', async () => {
    await withMock(async (o) => {
      const client = api(o)
      const keys = createKeys(client.newKey)
      const phys = await itemOf(client, 'phys-101-labs', 'iam-registration-to-submit')
      const body = submissionBody({
        ticket: 'IAM-2026-0631',
        sentOn: vancouverToday(new Date()),
      })
      const key = keys.keyFor('submit')
      const first = await client.submitIamRegistration(
        phys.project.id,
        'production',
        body,
        key,
      )
      // The network dropped the answer: no answer arrived, so the key is held.
      keys.answered('submit', new TypeError('fetch failed'))
      expect(keys.keyFor('submit')).toBe(key)
      const again = await client.submitIamRegistration(
        phys.project.id,
        'production',
        body,
        keys.keyFor('submit'),
      )
      expect(again).toEqual(first)
      expect(await itemsOf(client, 'phys-101-labs')).toEqual([
        ['iam-registration', phys.subjectId],
      ])
      // A NEW key on the same submission is a second act — refused, the record no longer with the team.
      const twice = await refusal(
        client.submitIamRegistration(
          phys.project.id,
          'production',
          body,
          client.newKey(),
        ),
      )
      expect([twice.status, twice.code]).toEqual([409, 'LAUNCH_TRANSITION_INVALID'])
    }, fleet)
  })
})

describe('an agent’s question rejected on the demo fleet', () => {
  const fleet = { role: 'admin', fleet: 'demo' } as const
  const REASON = 'Ask Dr. Moreno first.'
  const bioQuestion = async (o: string) => {
    const bio = FLEET_PROJECTS.find((p) => p.slug === 'bio-201-scheduler')!
    const [action] = await api(o).listPendingActions(bio.id)
    expect(action?.state).toBe('pending')
    return action!
  }
  const withReason = (o: string) =>
    createApi({ origin: o, session: 'mock-session', adminReason: () => REASON })

  it('is refused without §26’s header — 400 ADMIN_REASON_REQUIRED, the question still waiting', async () => {
    await withMock(async (o) => {
      const action = await bioQuestion(o)
      const refused = await refusal(
        api(o).rejectPendingAction(action.id, { reason: REASON }, api(o).newKey()),
      )
      expect([refused.status, refused.code]).toEqual([400, 'ADMIN_REASON_REQUIRED'])
      expect((await bioQuestion(o)).state).toBe('pending')
    }, fleet)
  })

  it('is recorded with the header — rejected, the reason the body’s', async () => {
    await withMock(async (o) => {
      const action = await bioQuestion(o)
      const answered = await withReason(o).rejectPendingAction(
        action.id,
        { reason: REASON },
        api(o).newKey(),
      )
      expect([answered.state, answered.reason]).toEqual(['rejected', REASON])
    }, fleet)
  })

  it('replays the rejection retried under the same key and reason — never 409 (I7)', async () => {
    await withMock(async (o) => {
      const action = await bioQuestion(o)
      const client = withReason(o)
      const keys = createKeys(client.newKey)
      const name = `reject:${action.id}`
      const first = await client.rejectPendingAction(
        action.id,
        { reason: REASON },
        keys.keyFor(name),
      )
      // The answer was lost: no answer arrived, so the key is held for the retry.
      keys.answered(name, new TypeError('fetch failed'))
      const again = await client.rejectPendingAction(
        action.id,
        { reason: REASON },
        keys.keyFor(name),
      )
      expect(again).toEqual(first)
    }, fleet)
  })
})
