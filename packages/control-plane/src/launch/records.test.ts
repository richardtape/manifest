import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { events, iamRegistrations, privacyAssessments } from '../db/index.js'
import { withProject } from '../db/testing.js'
import { createEventBus } from '../observability/index.js'
import { expectSqlState } from '../observability/testing.js'
import {
  getIamRegistration,
  getPrivacyAssessment,
  LaunchRecordError,
  recordIamRegistration,
  recordPrivacyAssessment,
} from './records.js'
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
      const read = await getIamRegistration(db, projectId)
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
      expect(await getIamRegistration(db, projectId)).toBeUndefined()
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
      expect((await getIamRegistration(db, projectId))?.state).toBe('submitted')
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
      expect(await getIamRegistration(db, projectId)).toBeUndefined()
    })
  })

  it('and the DATABASE refuses it too, which is the guard that survives a code change', async () => {
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
        }),
        // 23514 is check_violation. A message match would accept a typo'd table name or
        // a rolled-back transaction as proof of the constraint.
        '23514',
      )
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
        entityId: IAM.entityId,
        externalTicketRef: 'IAM-2026-0412',
        attributeCount: 2,
      })
      // A list of requested CWL attributes on a project's stream is more than the stream
      // needs to carry; `getLaunchRecords` is where a member reads them.
      expect(JSON.stringify(event?.machineDetail)).not.toContain('displayName')
      expect(event?.humanMessage).toContain('opr000001')
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
      const row = await getIamRegistration(db, projectId)
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
      expect((await getIamRegistration(db, projectId))?.state).toBe('active')
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
      expect((await getIamRegistration(db, projectId))?.entityId).toBe(IAM.entityId)
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
      expect(await getIamRegistration(db, projectId)).toBeDefined()
      expect(await getPrivacyAssessment(db, projectId)).toBeUndefined()
    })
  })
})
