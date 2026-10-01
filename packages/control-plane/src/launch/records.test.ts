import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { events, iamRegistrations, privacyAssessments, type Db } from '../db/index.js'
import { withProject } from '../db/testing.js'
import { createEventBus } from '../observability/index.js'
import { expectSqlState } from '../observability/testing.js'
import {
  getIamRegistration,
  getPrivacyAssessment,
  LaunchRecordError,
  recordIamRegistration,
  recordPrivacyAssessment,
  submitIamRegistration,
  submitPrivacyAssessment,
  vancouverNoon,
} from './records.js'
import {
  vancouverDaysAgo,
  vancouverToday,
  withAssessmentDraft,
  withDraft,
} from './testing.js'
import { LaunchTransitionError } from './transitions.js'

const bus = createEventBus()
const ACTOR = { id: '', puid: 'opr000001' }

const IAM = {
  entityId: 'https://manifest.internal/sp/chem-labs/production',
  acsUrl: 'https://chem-labs.manifest.internal/auth/saml/callback',
  sloUrl: 'https://chem-labs.manifest.internal/auth/logout',
  registeredAttributes: ['displayName', 'mail'],
}

describe('§9’s IAM registration, as an administrator records it (R1)', () => {
  it('writes a first record, and the read finds it', async () => {
    // THE POSITIVE CONTROL FOR EVERY REFUSAL BELOW (Global Constraints, P5c F16): a
    // function that refused everything would pass all of them, and this is the pair.
    await withProject(async (db, { projectId, ownerId }) => {
      const row = await recordIamRegistration(db, bus, {
        ...IAM,
        projectId,
        state: 'submitted',
        externalTicketRef: 'IAM-2026-0412',
        actor: { ...ACTOR, id: ownerId },
      })
      expect(row.state).toBe('submitted')
      expect(row.registeredAttributes).toEqual(['displayName', 'mail'])
      expect(row.externalTicketRef).toBe('IAM-2026-0412')
      const read = await getIamRegistration(db, projectId, 'production')
      expect(read?.id).toBe(row.id)
    })
  })

  it('refuses a FIRST write straight into `active` — the same hole as a bad transition', async () => {
    // A record created straight into `active` satisfies §13's gate without ever having
    // been submitted. One code path: a new record starts at `draft` and the requested
    // state is reached by transition from there.
    await withProject(async (db, { projectId, ownerId }) => {
      await expect(
        recordIamRegistration(db, bus, {
          ...IAM,
          projectId,
          state: 'active',
          actor: { ...ACTOR, id: ownerId },
        }),
      ).rejects.toThrow(LaunchTransitionError)
      // AND NOTHING WAS WRITTEN. A refusal that left a `draft` row behind would be a
      // half-written record the next request could walk forward from.
      expect(await getIamRegistration(db, projectId, 'production')).toBeUndefined()
    })
  })

  it('walks draft → submitted → active across two calls, which is the real path', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      await recordIamRegistration(db, bus, {
        ...IAM,
        projectId,
        state: 'submitted',
        actor,
      })
      const active = await recordIamRegistration(db, bus, {
        ...IAM,
        projectId,
        state: 'active',
        actor,
      })
      expect(active.state).toBe('active')
      // ONE ROW, not two: the record is per project (§9), upserted on that.
      expect(await db.select().from(iamRegistrations)).toHaveLength(1)
    })
  })

  it('refuses submitted → draft, naming the CODE and what the state can become', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      await recordIamRegistration(db, bus, {
        ...IAM,
        projectId,
        state: 'submitted',
        actor,
      })
      let thrown: unknown
      try {
        await recordIamRegistration(db, bus, {
          ...IAM,
          projectId,
          state: 'draft',
          actor,
        })
      } catch (error) {
        thrown = error
      }
      // EVERY REFUSAL ASSERTS ITS CODE (Global Constraints): 409 is also every RELEASE_*.
      expect((thrown as LaunchTransitionError).code).toBe('LAUNCH_TRANSITION_INVALID')
      expect((thrown as Error).message).toMatch(
        /can only become 'active' or 'change_requested'/,
      )
      // And the state did not move.
      expect((await getIamRegistration(db, projectId, 'production'))?.state).toBe(
        'submitted',
      )
    })
  })

  it('re-records the same state without asking the machine for a self-arrow', async () => {
    // Pasting a corrected ticket reference against a `submitted` registration is an
    // ordinary edit, not a transition — and the machine has no self-arrows, so routing it
    // through `iamTransition` would refuse an edit that should succeed.
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      await recordIamRegistration(db, bus, {
        ...IAM,
        projectId,
        state: 'submitted',
        externalTicketRef: 'IAM-TYPO',
        actor,
      })
      const fixed = await recordIamRegistration(db, bus, {
        ...IAM,
        projectId,
        state: 'submitted',
        externalTicketRef: 'IAM-2026-0412',
        actor,
      })
      expect(fixed.externalTicketRef).toBe('IAM-2026-0412')
      expect(fixed.state).toBe('submitted')
    })
  })

  /**
   * §9 MEASURED THE FAIL-OPEN CASE and it is not theoretical: SimpleSAMLphp treats an
   * empty attribute list and a missing one identically and releases EVERYTHING. An empty
   * list here would make Task 13's subset check vacuously true, because every set is a
   * superset of nothing.
   *
   * **TWO GUARDS, AND THIS TEST EXERCISES THE FIRST.** `records.ts` refuses it with a
   * message an administrator can act on; the database's `iam_registrations_attributes_present`
   * CHECK refuses it independently, which the test below drives instead.
   */
  it('refuses an empty attribute list in the MODULE, with a message and a hint', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      let thrown: unknown
      try {
        await recordIamRegistration(db, bus, {
          ...IAM,
          projectId,
          registeredAttributes: [],
          state: 'submitted',
          actor: { ...ACTOR, id: ownerId },
        })
      } catch (error) {
        thrown = error
      }
      expect(thrown).toBeInstanceOf(LaunchRecordError)
      expect((thrown as LaunchRecordError).code).toBe('LAUNCH_RECORD_INVALID')
      expect((thrown as LaunchRecordError).hint).toMatch(/as they appear in the ticket/)
      // And the refusal happens BEFORE anything is written.
      expect(await getIamRegistration(db, projectId, 'production')).toBeUndefined()
    })
  })

  it('and the DATABASE refuses it on a REGISTERED row too, which is the guard that survives a code change', async () => {
    await withProject(async (db, { projectId }) => {
      // `expectSqlState`, NOT `rejects.toThrow(/constraint name/)`: drizzle wraps every
      // driver error in its own, whose message is `Failed query: insert into …` and
      // carries the real one on `.cause` — so the regex matches nothing while the query
      // IS being refused, and the test goes green the moment somebody relaxes it to a
      // bare `.rejects.toThrow()`. Its own doc comment says so; this test walked into it
      // first and is the second time that helper has earned its place.
      await expectSqlState(
        db.insert(iamRegistrations).values({
          projectId,
          entityId: IAM.entityId,
          acsUrl: IAM.acsUrl,
          sloUrl: IAM.sloUrl,
          registeredAttributes: [],
          // REGISTERED (the launch path plan's Task 9): the CHECK holds a row UBC has registered
          // to a non-empty list, and lets a DRAFT — which registers nothing — stand at `[]`.
          registeredAt: new Date(),
        }),
        // 23514 is check_violation. A message match would accept a typo'd table name or
        // a rolled-back transaction as proof of the constraint.
        '23514',
      )
    })
  })

  it('…and lets a DRAFT stand with nothing registered — its positive control (Task 9)', async () => {
    await withProject(async (db, { projectId }) => {
      const [row] = await db
        .insert(iamRegistrations)
        .values({
          projectId,
          entityId: IAM.entityId,
          acsUrl: IAM.acsUrl,
          sloUrl: IAM.sloUrl,
        })
        .returning()
      expect(row?.registeredAttributes).toEqual([])
      expect(row?.environmentKind).toBe('production')
    })
  })

  it('publishes the ticket reference and the attribute COUNT, never the attributes (§14)', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      await recordIamRegistration(db, bus, {
        ...IAM,
        projectId,
        state: 'submitted',
        externalTicketRef: 'IAM-2026-0412',
        actor: { ...ACTOR, id: ownerId },
      })
      const [event] = await db
        .select()
        .from(events)
        .where(eq(events.type, 'iam_registration.recorded'))
      expect(event?.machineDetail).toEqual({
        state: 'submitted',
        // Task 9: two registrations a project may have, so the event says which.
        environment: 'production',
        entityId: IAM.entityId,
        externalTicketRef: 'IAM-2026-0412',
        attributeCount: 2,
      })
      // A list of requested CWL attributes on a project's stream is more than the stream
      // needs to carry; `getLaunchRecords` is where a member reads them.
      expect(JSON.stringify(event?.machineDetail)).not.toContain('displayName')
      // The recorder BY NAME, never the PUID (the authoring API plan's Task 12).
      expect(event?.humanMessage).toContain('Test Owner')
      expect(event?.humanMessage).not.toContain('opr000001')
      expect(event?.humanMessage).toContain('IAM-2026-0412')
    })
  })
})

/**
 * §9's CHANGE REQUEST (P6b Task 7, Decision 11): the registration's own `change_requested`
 * state IS the change request. Once UBC has registered this SP, what it registered —
 * `registeredAttributes`, the ACS and the SLO — changes only on a record whose resulting state
 * is `active`, and what is merely ASKED FOR lives in `requestedAttributes`. `[M9]` measured the
 * hole this closes: filing a change request overwrote the registered set with the requested
 * one, and the build then passed an attribute UBC does not release.
 */
describe('the change request (§9, Decision 11)', () => {
  /** submitted → active, the real first registration — what every case below starts from. */
  async function registered(
    db: Parameters<typeof recordIamRegistration>[0],
    projectId: string,
    actor: { id: string; puid: string },
  ) {
    await recordIamRegistration(db, bus, {
      ...IAM,
      projectId,
      state: 'submitted',
      actor,
    })
    return recordIamRegistration(db, bus, {
      ...IAM,
      projectId,
      state: 'active',
      externalTicketRef: 'IAM-2026-0412',
      actor,
    })
  }

  /** The thrown error, or `undefined`, so a test asserts WHAT was refused. */
  async function refusedWith(write: Promise<unknown>): Promise<LaunchRecordError> {
    let thrown: unknown
    try {
      await write
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(LaunchRecordError)
    return thrown as LaunchRecordError
  }

  it('files a change request: active → change_requested keeps what UBC registered and stores what is requested', async () => {
    // THE POSITIVE CONTROL for every refusal below: a module that refused every write after
    // `active` would pass them all.
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      const active = await registered(db, projectId, actor)
      expect(active.registeredAt).toBeInstanceOf(Date)
      expect(active.requestedAttributes).toBeNull()

      const filed = await recordIamRegistration(db, bus, {
        ...IAM,
        projectId,
        state: 'change_requested',
        requestedAttributes: ['displayName', 'mail', 'sn'],
        externalTicketRef: 'IAM-2026-0519',
        actor,
      })
      expect(filed.state).toBe('change_requested')
      // WHAT UBC REGISTERED IS UNCHANGED — `[M9]`'s overwrite, closed.
      expect(filed.registeredAttributes).toEqual(['displayName', 'mail'])
      expect(filed.requestedAttributes).toEqual(['displayName', 'mail', 'sn'])
      expect(filed.registeredAt).toEqual(active.registeredAt)
      expect(filed.externalTicketRef).toBe('IAM-2026-0519')
    })
  })

  it('refuses to change registeredAttributes outside `active` once registered: 400 LAUNCH_RECORD_INVALID — [M9]', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      await registered(db, projectId, actor)
      // `[M9]`'s exact request: the change request's attributes typed as the registered set.
      const error = await refusedWith(
        recordIamRegistration(db, bus, {
          ...IAM,
          projectId,
          registeredAttributes: ['displayName', 'mail', 'sn'],
          requestedAttributes: ['displayName', 'mail', 'sn'],
          state: 'change_requested',
          actor,
        }),
      )
      expect(error.code).toBe('LAUNCH_RECORD_INVALID')
      expect(error.message).toContain('changes only when it registers it')
      expect(error.hint).toContain('requestedAttributes')
      // AND NOTHING MOVED: still active, still what UBC registered.
      const row = await getIamRegistration(db, projectId, 'production')
      expect(row?.state).toBe('active')
      expect(row?.registeredAttributes).toEqual(['displayName', 'mail'])
    })
  })

  it('refuses a change request from `active` that names nothing requested: 400 LAUNCH_RECORD_INVALID', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      await registered(db, projectId, actor)
      const error = await refusedWith(
        recordIamRegistration(db, bus, {
          ...IAM,
          projectId,
          state: 'change_requested',
          actor,
        }),
      )
      expect(error.code).toBe('LAUNCH_RECORD_INVALID')
      expect(error.message).toContain('requestedAttributes')
      expect((await getIamRegistration(db, projectId, 'production'))?.state).toBe(
        'active',
      )
    })
  })

  it('change_requested → submitted → active records the new registration, clears the request, moves registeredAt', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      const first = await registered(db, projectId, actor)
      const requested = ['displayName', 'mail', 'sn']
      await recordIamRegistration(db, bus, {
        ...IAM,
        projectId,
        state: 'change_requested',
        requestedAttributes: requested,
        actor,
      })
      // `submitted` carries the request forward WITHOUT restating it.
      const submitted = await recordIamRegistration(db, bus, {
        ...IAM,
        projectId,
        state: 'submitted',
        actor,
      })
      expect(submitted.requestedAttributes).toEqual(requested)
      expect(submitted.registeredAttributes).toEqual(['displayName', 'mail'])

      const again = await recordIamRegistration(db, bus, {
        ...IAM,
        projectId,
        registeredAttributes: requested,
        state: 'active',
        actor,
      })
      expect(again.registeredAttributes).toEqual(requested)
      expect(again.requestedAttributes).toBeNull()
      expect(again.registeredAt!.getTime()).toBeGreaterThan(first.registeredAt!.getTime())
    })
  })

  it('refuses a different entityID once registered: 400 LAUNCH_RECORD_INVALID — §9: fixed at registration', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      await registered(db, projectId, actor)
      // Into `active` — the one state that MAY change what was registered — so the refusal
      // is the entityID's own and not the registered-set rule's.
      await recordIamRegistration(db, bus, {
        ...IAM,
        projectId,
        state: 'change_requested',
        requestedAttributes: ['displayName', 'mail'],
        actor,
      })
      await recordIamRegistration(db, bus, {
        ...IAM,
        projectId,
        state: 'submitted',
        actor,
      })
      const error = await refusedWith(
        recordIamRegistration(db, bus, {
          ...IAM,
          projectId,
          entityId: 'https://manifest.internal/sp/chem-labs-2/production',
          state: 'active',
          actor,
        }),
      )
      expect(error.code).toBe('LAUNCH_RECORD_INVALID')
      expect(error.message).toContain('entityID is fixed at registration')
      expect((await getIamRegistration(db, projectId, 'production'))?.entityId).toBe(
        IAM.entityId,
      )
    })
  })

  it('before the first `active`, registeredAttributes may still be edited — the first registration is P6a’s, unchanged', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      await recordIamRegistration(db, bus, {
        ...IAM,
        projectId,
        state: 'submitted',
        actor,
      })
      // IAM came back with questions: a change of what is being asked for, before UBC has
      // registered anything — there is no registration yet for a record to misstate.
      const edited = await recordIamRegistration(db, bus, {
        ...IAM,
        projectId,
        registeredAttributes: ['displayName', 'mail', 'sn'],
        state: 'change_requested',
        actor,
      })
      expect(edited.registeredAttributes).toEqual(['displayName', 'mail', 'sn'])
      expect(edited.registeredAt).toBeNull()
    })
  })

  it('re-recording `active` to correct the ticket does not move registeredAt — nothing new was registered', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      const first = await registered(db, projectId, actor)
      const fixed = await recordIamRegistration(db, bus, {
        ...IAM,
        projectId,
        state: 'active',
        externalTicketRef: 'IAM-2026-0413',
        actor,
      })
      expect(fixed.externalTicketRef).toBe('IAM-2026-0413')
      expect(fixed.registeredAt).toEqual(first.registeredAt)
    })
  })
})

describe('§9’s privacy assessment, as an administrator records it (R1)', () => {
  it('writes a first record, and the read finds it', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const row = await recordPrivacyAssessment(db, bus, {
        projectId,
        state: 'submitted',
        reviewer: 'Privacy Office',
        externalTicketRef: 'PIA-2026-0088',
        actor: { ...ACTOR, id: ownerId },
      })
      expect(row.state).toBe('submitted')
      expect(row.approvedAt).toBeNull()
      expect((await getPrivacyAssessment(db, projectId))?.id).toBe(row.id)
    })
  })

  it('refuses a first write straight into `approved` — the gate satisfied by a typo', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      await expect(
        recordPrivacyAssessment(db, bus, {
          projectId,
          state: 'approved',
          actor: { ...ACTOR, id: ownerId },
        }),
      ).rejects.toThrow(/a privacy assessment cannot go from 'draft' to 'approved'/)
      expect(await getPrivacyAssessment(db, projectId)).toBeUndefined()
    })
  })

  it('stamps approvedAt on reaching `approved`, and clears it on the way back to draft', async () => {
    // §9 names no rejection state: a refused assessment goes back to `draft` with the
    // note. A timestamp that survived that would say an assessment was approved while its
    // state said it was being rewritten — and §13's gate reads the state.
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      await recordPrivacyAssessment(db, bus, { projectId, state: 'submitted', actor })
      const approved = await recordPrivacyAssessment(db, bus, {
        projectId,
        state: 'approved',
        actor,
      })
      expect(approved.approvedAt).toBeInstanceOf(Date)
      const reopened = await recordPrivacyAssessment(db, bus, {
        projectId,
        state: 'draft',
        actor,
      })
      expect(reopened.state).toBe('draft')
      expect(reopened.approvedAt).toBeNull()
      expect(await db.select().from(privacyAssessments)).toHaveLength(1)
    })
  })

  it('publishes its own event, with the ticket reference and no reviewer note', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      await recordPrivacyAssessment(db, bus, {
        projectId,
        state: 'submitted',
        reviewer: 'Privacy Office',
        externalTicketRef: 'PIA-2026-0088',
        actor: { ...ACTOR, id: ownerId },
      })
      const [event] = await db
        .select()
        .from(events)
        .where(eq(events.type, 'privacy_assessment.recorded'))
      expect(event?.machineDetail).toEqual({
        state: 'submitted',
        externalTicketRef: 'PIA-2026-0088',
      })
      expect(JSON.stringify(event?.machineDetail)).not.toContain('Privacy Office')
    })
  })
})

describe('the two records are independent', () => {
  it('records one without the other, and each read answers undefined on its own', async () => {
    // Either may be absent, which is a STATE and not an error: most projects never go to
    // production, so most will have neither.
    await withProject(async (db, { projectId, ownerId }) => {
      await recordIamRegistration(db, bus, {
        ...IAM,
        projectId,
        state: 'submitted',
        actor: { ...ACTOR, id: ownerId },
      })
      expect(await getIamRegistration(db, projectId, 'production')).toBeDefined()
      expect(await getPrivacyAssessment(db, projectId)).toBeUndefined()
    })
  })
})

/**
 * NO PUID IN A SENTENCE (the authoring API plan's Task 12; P6b's F14 found the rule, the D5 plan's
 * sitting 8 found these two breaking it). The feed names the administrator who recorded it.
 */
describe('the launch records name the person who recorded them, never a PUID (Task 12)', () => {
  it('an IAM registration and a privacy assessment', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      await recordIamRegistration(db, bus, {
        ...IAM,
        projectId,
        state: 'submitted',
        actor,
      })
      await recordPrivacyAssessment(db, bus, {
        projectId,
        state: 'submitted',
        reviewer: 'Privacy Office',
        actor,
      })
      const said = await db
        .select({ message: events.humanMessage })
        .from(events)
        .where(eq(events.projectId, projectId))
      expect(said.map((e) => e.message).sort()).toEqual([
        "Test Owner recorded this app's privacy assessment as submitted.",
        "Test Owner recorded this app's production UBC IAM registration as submitted.",
      ])
      expect(JSON.stringify(said)).not.toContain(ACTOR.puid)
    })
  })
})

/**
 * THE THREE CLOCKS' RECORDS (the launch path plan's Task 9; Spec actions 3 and 9). An owner says
 * *"I've sent it"*: the record moves to `submitted`, stamped with the day they sent it and who said
 * so — and UBC's ORDER is gated on that statement only: the privacy assessment approved (with its
 * reference) before the staging registration is sent, and staging registered before production's.
 * UBC's answers stay an administrator's record, and are never refused for order.
 */
describe('the owner’s “I’ve sent it” (Task 9)', () => {
  /** What an administrator records once the Privacy Office has approved the assessment. */
  async function piaApproved(
    db: Db,
    projectId: string,
    actor: typeof ACTOR,
    ref = 'PIA-0001',
  ) {
    await recordPrivacyAssessment(db, bus, { projectId, state: 'submitted', actor })
    await recordPrivacyAssessment(db, bus, {
      projectId,
      state: 'approved',
      externalTicketRef: ref,
      actor,
    })
  }
  /** What an administrator records once UBC IAM has registered staging. */
  async function stagingActive(db: Db, projectId: string, actor: typeof ACTOR) {
    for (const state of ['submitted', 'active'] as const)
      await recordIamRegistration(db, bus, {
        ...IAM,
        environment: 'staging',
        projectId,
        state,
        actor,
      })
  }

  it('submits a drafted production registration: submitted, stamped with the day and the person', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      await stagingActive(db, projectId, actor)
      await withDraft(db, { projectId, environment: 'production' })
      const today = vancouverToday()
      const row = await submitIamRegistration(db, bus, {
        projectId,
        environment: 'production',
        actor,
        sentAt: today,
        reference: 'IAM-2026-0500',
      })
      expect(row).toMatchObject({
        environmentKind: 'production',
        state: 'submitted',
        submittedBy: ownerId,
        externalTicketRef: 'IAM-2026-0500',
      })
      // THE DAY, NOT THE MOMENT: noon in Vancouver, so it is the same day in every zone.
      expect(row.submittedAt?.toISOString()).toBe(vancouverNoon(today).toISOString())
      // Staging's record is untouched: two rows, one per environment.
      const staging = await getIamRegistration(db, projectId, 'staging')
      expect(staging?.state).toBe('active')
      expect(staging?.id).not.toBe(row.id)
    })
  })

  it('defaults the day to today in Vancouver, stored as noon there', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      await piaApproved(db, projectId, actor)
      await withDraft(db, { projectId, environment: 'staging' })
      const row = await submitIamRegistration(db, bus, {
        projectId,
        environment: 'staging',
        actor,
      })
      expect(row.submittedAt?.toISOString()).toBe(
        vancouverNoon(vancouverToday()).toISOString(),
      )
    })
  })

  it('vancouverNoon is noon in Vancouver on either side of the clock change', () => {
    expect(vancouverNoon('2026-10-01').toISOString()).toBe('2026-10-01T19:00:00.000Z')
    expect(vancouverNoon('2026-12-01').toISOString()).toBe('2026-12-01T20:00:00.000Z')
  })

  it('refuses a record with no draft — 409 LAUNCH_DRAFT_REQUIRED — and writes nothing', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      await piaApproved(db, projectId, actor)
      await expect(
        submitIamRegistration(db, bus, { projectId, environment: 'staging', actor }),
      ).rejects.toMatchObject({
        name: 'LaunchRecordError',
        code: 'LAUNCH_DRAFT_REQUIRED',
      })
      expect(await getIamRegistration(db, projectId, 'staging')).toBeUndefined()
      // A row an administrator recorded carries no package either: still nothing to send.
      await recordIamRegistration(db, bus, {
        ...IAM,
        environment: 'staging',
        projectId,
        state: 'draft',
        actor,
      })
      await expect(
        submitIamRegistration(db, bus, { projectId, environment: 'staging', actor }),
      ).rejects.toMatchObject({ code: 'LAUNCH_DRAFT_REQUIRED' })
      // THE POSITIVE CONTROL: the same submission once a draft exists.
      await db
        .update(iamRegistrations)
        .set({ generatedPackage: { placeholder: true } })
        .where(eq(iamRegistrations.projectId, projectId))
      const sent = await submitIamRegistration(db, bus, {
        projectId,
        environment: 'staging',
        actor,
      })
      expect(sent.state).toBe('submitted')
    })
  })

  it('refuses a day after today, or before the draft was made — 400 LAUNCH_SENT_AT_INVALID', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      await piaApproved(db, projectId, actor)
      await withDraft(db, {
        projectId,
        environment: 'staging',
        createdAt: new Date(Date.now() - 3 * 86_400_000),
      })
      const submit = (sentAt: string) =>
        submitIamRegistration(db, bus, {
          projectId,
          environment: 'staging',
          actor,
          sentAt,
        })
      await expect(submit(vancouverDaysAgo(-1))).rejects.toMatchObject({
        code: 'LAUNCH_SENT_AT_INVALID',
      })
      await expect(submit(vancouverDaysAgo(5))).rejects.toMatchObject({
        code: 'LAUNCH_SENT_AT_INVALID',
      })
      expect((await getIamRegistration(db, projectId, 'staging'))?.state).toBe('draft')
      // THE POSITIVE CONTROL: a day between the draft and today — "last Tuesday".
      const row = await submit(vancouverDaysAgo(2))
      expect(row.submittedAt?.toISOString()).toBe(
        vancouverNoon(vancouverDaysAgo(2)).toISOString(),
      )
    })
  })

  it('refuses a second submission of a submitted record — 409 LAUNCH_TRANSITION_INVALID', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      await piaApproved(db, projectId, actor)
      await withDraft(db, { projectId, environment: 'staging' })
      await submitIamRegistration(db, bus, { projectId, environment: 'staging', actor })
      await expect(
        submitIamRegistration(db, bus, { projectId, environment: 'staging', actor }),
      ).rejects.toMatchObject({
        name: 'LaunchTransitionError',
        code: 'LAUNCH_TRANSITION_INVALID',
      })
      // Nor from `active`, which is UBC's answer: an owner cannot send what UBC has registered.
      await recordIamRegistration(db, bus, {
        ...IAM,
        environment: 'staging',
        projectId,
        state: 'active',
        actor,
      })
      await expect(
        submitIamRegistration(db, bus, { projectId, environment: 'staging', actor }),
      ).rejects.toMatchObject({ code: 'LAUNCH_TRANSITION_INVALID' })
    })
  })

  it('submits again from change_requested — a new request is the point', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      await piaApproved(db, projectId, actor)
      const draft = await withDraft(db, { projectId, environment: 'staging' })
      await submitIamRegistration(db, bus, { projectId, environment: 'staging', actor })
      // UBC came back with questions, and an administrator recorded it.
      await recordIamRegistration(db, bus, {
        ...IAM,
        environment: 'staging',
        entityId: draft.entityId,
        acsUrl: draft.acsUrl,
        sloUrl: draft.sloUrl,
        projectId,
        state: 'change_requested',
        actor,
      })
      const again = await submitIamRegistration(db, bus, {
        projectId,
        environment: 'staging',
        actor,
      })
      expect(again.state).toBe('submitted')
    })
  })

  it('UBC’s order: a STAGING submission waits for an approved assessment with its reference — 409 LAUNCH_PIA_NOT_APPROVED', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      await withDraft(db, { projectId, environment: 'staging' })
      const submit = () =>
        submitIamRegistration(db, bus, { projectId, environment: 'staging', actor })
      // No assessment at all.
      await expect(submit()).rejects.toMatchObject({ code: 'LAUNCH_PIA_NOT_APPROVED' })
      // Submitted, not approved.
      await recordPrivacyAssessment(db, bus, { projectId, state: 'submitted', actor })
      await expect(submit()).rejects.toMatchObject({ code: 'LAUNCH_PIA_NOT_APPROVED' })
      // Approved, but with no reference — UBC IAM asks for the PIA number.
      await recordPrivacyAssessment(db, bus, { projectId, state: 'approved', actor })
      await expect(submit()).rejects.toMatchObject({ code: 'LAUNCH_PIA_NOT_APPROVED' })
      expect((await getIamRegistration(db, projectId, 'staging'))?.state).toBe('draft')
      // THE POSITIVE CONTROL: approved, with its reference.
      await recordPrivacyAssessment(db, bus, {
        projectId,
        state: 'approved',
        externalTicketRef: 'PIA-2026-0088',
        actor,
      })
      expect((await submit()).state).toBe('submitted')
    })
  })

  it('UBC’s order: a PRODUCTION submission waits for staging to be registered — 409 LAUNCH_STAGING_NOT_REGISTERED', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      await piaApproved(db, projectId, actor)
      await withDraft(db, { projectId, environment: 'production' })
      const submit = () =>
        submitIamRegistration(db, bus, { projectId, environment: 'production', actor })
      await expect(submit()).rejects.toMatchObject({
        code: 'LAUNCH_STAGING_NOT_REGISTERED',
      })
      // Staging sent, not yet registered.
      await recordIamRegistration(db, bus, {
        ...IAM,
        environment: 'staging',
        projectId,
        state: 'submitted',
        actor,
      })
      await expect(submit()).rejects.toMatchObject({
        code: 'LAUNCH_STAGING_NOT_REGISTERED',
      })
      // THE POSITIVE CONTROL: staging `active`.
      await recordIamRegistration(db, bus, {
        ...IAM,
        environment: 'staging',
        projectId,
        state: 'active',
        actor,
      })
      expect((await submit()).state).toBe('submitted')
    })
  })

  it('an administrator’s record of UBC’s answer is never refused for order', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      // No assessment, no staging registration — and production recorded `active` all the same.
      for (const state of ['submitted', 'active'] as const)
        await recordIamRegistration(db, bus, { ...IAM, projectId, state, actor })
      expect((await getIamRegistration(db, projectId, 'production'))?.state).toBe(
        'active',
      )
      expect(await getIamRegistration(db, projectId, 'staging')).toBeUndefined()
    })
  })

  it('publishes iam_registration.submitted naming the environment, the day and the person — never a PUID', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      await piaApproved(db, projectId, actor)
      // Drafted before the day it was sent, as a real one is.
      await withDraft(db, {
        projectId,
        environment: 'staging',
        createdAt: new Date('2026-09-20T17:00:00.000Z'),
      })
      await submitIamRegistration(db, bus, {
        projectId,
        environment: 'staging',
        actor,
        sentAt: '2026-09-29',
        reference: 'IAM-STG-7',
      })
      const [event] = await db
        .select()
        .from(events)
        .where(eq(events.type, 'iam_registration.submitted'))
      expect(event?.machineDetail).toEqual({
        environment: 'staging',
        sentAt: '2026-09-29',
        externalTicketRef: 'IAM-STG-7',
      })
      expect(event?.humanMessage).toBe(
        "Test Owner said this app's staging registration was sent to UBC IAM on September 29, 2026 (ticket IAM-STG-7).",
      )
      expect(JSON.stringify(event)).not.toContain(ACTOR.puid)
    })
  })

  it('an administrator’s record that MOVES a registration into submitted stamps when and by whom; a ticket correction does not', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      const sent = await recordIamRegistration(db, bus, {
        ...IAM,
        projectId,
        state: 'submitted',
        actor,
      })
      expect(sent.submittedAt).toBeInstanceOf(Date)
      expect(sent.submittedBy).toBe(ownerId)
      const corrected = await recordIamRegistration(db, bus, {
        ...IAM,
        projectId,
        state: 'submitted',
        externalTicketRef: 'IAM-LATER',
        actor,
      })
      expect(corrected.submittedAt?.toISOString()).toBe(sent.submittedAt?.toISOString())
      // A record that never reached `submitted` says nothing was sent.
      const draft = await recordIamRegistration(db, bus, {
        ...IAM,
        environment: 'staging',
        projectId,
        state: 'draft',
        actor,
      })
      expect(draft.submittedAt).toBeNull()
      expect(draft.submittedBy).toBeNull()
    })
  })

  it('filing a change request (active → change_requested) stamps when it went to UBC', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      for (const state of ['submitted', 'active'] as const)
        await recordIamRegistration(db, bus, { ...IAM, projectId, state, actor })
      const before = await getIamRegistration(db, projectId, 'production')
      await db
        .update(iamRegistrations)
        .set({ submittedAt: new Date('2026-01-01T19:00:00.000Z') })
        .where(eq(iamRegistrations.id, before!.id))
      const filed = await recordIamRegistration(db, bus, {
        ...IAM,
        projectId,
        state: 'change_requested',
        requestedAttributes: ['displayName', 'mail', 'sn'],
        actor,
      })
      expect(filed.submittedAt!.getTime()).toBeGreaterThan(
        new Date('2026-01-01T19:00:00.000Z').getTime(),
      )
    })
  })
})

describe('the owner’s “I’ve sent it” for the privacy assessment (Task 9)', () => {
  it('submits a drafted assessment: submitted, stamped with the day and the person', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      await withAssessmentDraft(db, { projectId })
      const row = await submitPrivacyAssessment(db, bus, {
        projectId,
        actor,
        reference: 'PIA-2026-0101',
      })
      expect(row).toMatchObject({
        state: 'submitted',
        submittedBy: ownerId,
        externalTicketRef: 'PIA-2026-0101',
      })
      expect(row.submittedAt?.toISOString()).toBe(
        vancouverNoon(vancouverToday()).toISOString(),
      )
      const [event] = await db
        .select()
        .from(events)
        .where(eq(events.type, 'privacy_assessment.submitted'))
      expect(event?.machineDetail).toEqual({
        sentAt: vancouverToday(),
        externalTicketRef: 'PIA-2026-0101',
      })
    })
  })

  it('refuses one with no draft — 409 LAUNCH_DRAFT_REQUIRED — and a second submission — LAUNCH_TRANSITION_INVALID', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      await expect(
        submitPrivacyAssessment(db, bus, { projectId, actor }),
      ).rejects.toMatchObject({ code: 'LAUNCH_DRAFT_REQUIRED' })
      await withAssessmentDraft(db, { projectId })
      expect((await submitPrivacyAssessment(db, bus, { projectId, actor })).state).toBe(
        'submitted',
      )
      await expect(
        submitPrivacyAssessment(db, bus, { projectId, actor }),
      ).rejects.toMatchObject({ code: 'LAUNCH_TRANSITION_INVALID' })
    })
  })
})
