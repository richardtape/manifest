import { and, eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { events, iamRegistrations, privacyAssessments, type Db } from '../db/index.js'
import { withProject } from '../db/testing.js'
import { ensureTestUser } from '../identity/testing.js'
import { createMailer, teamEmail } from '../mail/index.js'
import { recordingMailer } from '../mail/testing.js'
import { createEventBus } from '../observability/index.js'
import { expectSqlState } from '../observability/testing.js'
import { readAssessmentDraft } from './assessment.js'
import {
  draftIamRegistration,
  draftPrivacyAssessment,
  getIamRegistration,
  getPrivacyAssessment,
  LaunchRecordError,
  recordAssessmentSubmission,
  recordIamRegistration,
  recordIamSubmission,
  recordPrivacyAssessment,
  returnIamRegistration,
  returnPrivacyAssessment,
  sendIamRegistration,
  sendPrivacyAssessment,
  vancouverDayInWords,
  vancouverNoon,
} from './records.js'
import {
  everyGapAnswered,
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
      expect(
        await db
          .select()
          .from(iamRegistrations)
          .where(eq(iamRegistrations.projectId, projectId)),
      ).toHaveLength(1)
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
        .where(
          and(
            eq(events.type, 'iam_registration.recorded'),
            eq(events.projectId, projectId),
          ),
        )
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
      expect(
        await db
          .select()
          .from(privacyAssessments)
          .where(eq(privacyAssessments.projectId, projectId)),
      ).toHaveLength(1)
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
        .where(
          and(
            eq(events.type, 'privacy_assessment.recorded'),
            eq(events.projectId, projectId),
          ),
        )
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

/**
 * WHAT A SEND NEEDS (the FE-46/47/5 plan's Task 5): the database, the bus and the mailer — and ONE ORDERED
 * LOG of what the bus heard and what the team was told, so *"after the event"* is read, not assumed.
 */
function sending(db: Db) {
  const said: string[] = []
  const local = createEventBus()
  const publish = local.publish.bind(local)
  local.publish = (frame) => {
    said.push(frame.kind === 'event' ? frame.type : frame.kind)
    publish(frame)
  }
  const mailer = recordingMailer()
  const tellTeam = mailer.tellTeam.bind(mailer)
  mailer.tellTeam = (notice) => {
    said.push(`told:${notice.kind}`)
    tellTeam(notice)
  }
  return { deps: { db, bus: local, mailer }, said, told: mailer.told }
}

/** A platform administrator — the Manifest team's records are theirs. */
const teamMember = async (db: Db) => {
  const admin = await ensureTestUser(db, 'platform_admin')
  return { id: admin.id, puid: admin.ubcCwlPuid }
}

const eventsOf = (db: Db, projectId: string, type: string) =>
  db
    .select()
    .from(events)
    .where(and(eq(events.type, type), eq(events.projectId, projectId)))

describe('the owner sends a registration to the Manifest team (FE-46/47/5 plan Task 5)', () => {
  it('sends a drafted production registration: sent, from its draft, now, by them — UBC’s submission untouched — told after the event', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      // UBC's order: the assessment approved, then staging registered (the whole-branch review's I3).
      await piaApproved(db, projectId, actor)
      await stagingActive(db, projectId, actor)
      await withDraft(db, { projectId, environment: 'production' })
      const { deps, said, told } = sending(db)
      const before = Date.now()
      const row = await sendIamRegistration(deps, {
        projectId,
        environment: 'production',
        actor,
      })
      expect(row).toMatchObject({
        environmentKind: 'production',
        state: 'sent',
        sentFrom: 'draft',
        sentBy: ownerId,
        submittedAt: null,
        submittedBy: null,
        externalTicketRef: null,
      })
      // THE MOMENT, NOT A DAY: the send is made in Manifest.
      expect(row.sentAt!.getTime()).toBeGreaterThanOrEqual(before - 1_000)
      expect(row.sentAt!.getTime()).toBeLessThanOrEqual(Date.now() + 1_000)
      const [event] = await eventsOf(db, projectId, 'iam_registration.sent')
      expect(event?.machineDetail).toEqual({
        environment: 'production',
        sentFrom: 'draft',
      })
      expect(event?.humanMessage).toBe(
        "Test Owner sent this app's production registration to the Manifest team, to submit to UBC IAM.",
      )
      // ONE NOTICE, AFTER THE EVENT — which app, which record, by whom, when.
      expect(said).toEqual(['iam_registration.sent', 'told:record-sent'])
      expect(told).toEqual([
        {
          kind: 'record-sent',
          record: 'production-registration',
          change: false,
          project: { id: projectId, slug: expect.any(String), name: expect.any(String) },
          by: 'Test Owner',
          at: row.sentAt,
        },
      ])
      // Staging's record is untouched: two rows, one per environment.
      const staging = await getIamRegistration(db, projectId, 'staging')
      expect(staging?.state).toBe('active')
      expect(staging?.id).not.toBe(row.id)
    })
  })

  it('refuses a record with no draft — 409 LAUNCH_DRAFT_REQUIRED — writes nothing and tells nobody', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      await piaApproved(db, projectId, actor)
      const { deps, told } = sending(db)
      const send = () =>
        sendIamRegistration(deps, { projectId, environment: 'staging', actor })
      await expect(send()).rejects.toMatchObject({
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
      await expect(send()).rejects.toMatchObject({ code: 'LAUNCH_DRAFT_REQUIRED' })
      // A package that is not one (`readPackage` reads none) is no draft either.
      await db
        .update(iamRegistrations)
        .set({ generatedPackage: { placeholder: true } })
        .where(eq(iamRegistrations.projectId, projectId))
      await expect(send()).rejects.toMatchObject({ code: 'LAUNCH_DRAFT_REQUIRED' })
      expect(told).toEqual([])
      // THE POSITIVE CONTROL: the same send once a draft exists (Task 10's real package).
      await withDraft(db, { projectId, environment: 'staging' })
      expect((await send()).state).toBe('sent')
      expect(told).toHaveLength(1)
    })
  })

  it('refuses a draft made since the one the owner read — 409 LAUNCH_DRAFT_CHANGED — and writes nothing', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      await piaApproved(db, projectId, actor)
      const read = await withDraft(db, {
        projectId,
        environment: 'staging',
        generatedAt: new Date(Date.now() - 60_000),
      })
      const readAt = (read.generatedPackage as { generatedAt: string }).generatedAt
      const remade = await withDraft(db, { projectId, environment: 'staging' })
      const { deps } = sending(db)
      await expect(
        sendIamRegistration(deps, {
          projectId,
          environment: 'staging',
          actor,
          draftGeneratedAt: readAt,
        }),
      ).rejects.toMatchObject({ code: 'LAUNCH_DRAFT_CHANGED' })
      expect((await getIamRegistration(db, projectId, 'staging'))?.state).toBe('draft')
      // THE POSITIVE CONTROL: naming the draft held.
      const sent = await sendIamRegistration(deps, {
        projectId,
        environment: 'staging',
        actor,
        draftGeneratedAt: (remade.generatedPackage as { generatedAt: string })
          .generatedAt,
      })
      expect(sent.state).toBe('sent')
    })
  })

  it('refuses a second send over a sent record, and a send of what UBC holds or decided — 409 LAUNCH_TRANSITION_INVALID', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      await piaApproved(db, projectId, actor)
      await withDraft(db, { projectId, environment: 'staging' })
      const { deps, told } = sending(db)
      const send = () =>
        sendIamRegistration(deps, { projectId, environment: 'staging', actor })
      const first = await send()
      // A SECOND SEND would restart the team's clock.
      await expect(send()).rejects.toMatchObject({
        name: 'LaunchTransitionError',
        code: 'LAUNCH_TRANSITION_INVALID',
      })
      const held = await getIamRegistration(db, projectId, 'staging')
      expect(held?.sentAt?.toISOString()).toBe(first.sentAt?.toISOString())
      expect(told).toHaveLength(1)
      // Nor from `submitted` or `active` — UBC holds it, or has answered.
      const admin = await teamMember(db)
      await recordIamSubmission(db, bus, {
        projectId,
        environment: 'staging',
        actor: admin,
        reference: 'IAM-STG-1',
      })
      await expect(send()).rejects.toMatchObject({ code: 'LAUNCH_TRANSITION_INVALID' })
      await recordIamRegistration(db, bus, {
        ...IAM,
        environment: 'staging',
        projectId,
        state: 'active',
        actor,
      })
      await expect(send()).rejects.toMatchObject({ code: 'LAUNCH_TRANSITION_INVALID' })
    })
  })

  it('sends again once UBC asked the owner for changes — from change_requested, its origin cleared and kept as sentFrom', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      await piaApproved(db, projectId, actor)
      const draft = await withDraft(db, { projectId, environment: 'staging' })
      const { deps } = sending(db)
      const admin = await teamMember(db)
      await sendIamRegistration(deps, { projectId, environment: 'staging', actor })
      await recordIamSubmission(db, bus, {
        projectId,
        environment: 'staging',
        actor: admin,
        reference: 'IAM-STG-2',
      })
      // UBC came back with questions, and an administrator recorded it.
      const asked = await recordIamRegistration(db, bus, {
        ...IAM,
        environment: 'staging',
        entityId: draft.entityId,
        acsUrl: draft.acsUrl,
        sloUrl: draft.sloUrl,
        projectId,
        state: 'change_requested',
        actor,
      })
      expect(asked.changeRequestedFrom).toBe('submitted')
      const again = await sendIamRegistration(deps, {
        projectId,
        environment: 'staging',
        actor,
      })
      expect(again).toMatchObject({
        state: 'sent',
        sentFrom: 'change_requested',
        changeRequestedFrom: null,
      })
    })
  })

  it('UBC’s order: a STAGING send waits for an approved assessment with its reference — 409 LAUNCH_PIA_NOT_APPROVED', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      await withDraft(db, { projectId, environment: 'staging' })
      const { deps } = sending(db)
      const send = () =>
        sendIamRegistration(deps, { projectId, environment: 'staging', actor })
      // No assessment at all.
      await expect(send()).rejects.toMatchObject({ code: 'LAUNCH_PIA_NOT_APPROVED' })
      // Submitted, not approved.
      await recordPrivacyAssessment(db, bus, { projectId, state: 'submitted', actor })
      await expect(send()).rejects.toMatchObject({ code: 'LAUNCH_PIA_NOT_APPROVED' })
      // Approved, but with no reference — UBC IAM asks for the PIA number.
      await recordPrivacyAssessment(db, bus, { projectId, state: 'approved', actor })
      await expect(send()).rejects.toMatchObject({ code: 'LAUNCH_PIA_NOT_APPROVED' })
      expect((await getIamRegistration(db, projectId, 'staging'))?.state).toBe('draft')
      // THE POSITIVE CONTROL: approved, with its reference — and drafted again, so the package carries
      // it (Task 10's review, I2: the week-one draft has none, and is refused LAUNCH_DRAFT_STALE).
      await recordPrivacyAssessment(db, bus, {
        projectId,
        state: 'approved',
        externalTicketRef: 'PIA-2026-0088',
        actor,
      })
      await expect(send()).rejects.toMatchObject({ code: 'LAUNCH_DRAFT_STALE' })
      await withDraft(db, { projectId, environment: 'staging' })
      expect((await send()).state).toBe('sent')
    })
  })

  it('UBC’s order: a PRODUCTION send waits for staging to be registered — 409 LAUNCH_STAGING_NOT_REGISTERED', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      await piaApproved(db, projectId, actor)
      await withDraft(db, { projectId, environment: 'production' })
      const { deps } = sending(db)
      const send = () =>
        sendIamRegistration(deps, { projectId, environment: 'production', actor })
      await expect(send()).rejects.toMatchObject({
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
      await expect(send()).rejects.toMatchObject({
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
      expect((await send()).state).toBe('sent')
    })
  })

  it('UBC’s order: a PRODUCTION send waits for the assessment too, even with staging recorded active — 409 LAUNCH_PIA_NOT_APPROVED', async () => {
    // The whole-branch review's I3: §9, "neither of an app's registrations is sent until the
    // assessment is approved".
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      await stagingActive(db, projectId, actor)
      await withDraft(db, { projectId, environment: 'production' })
      const { deps } = sending(db)
      const send = () =>
        sendIamRegistration(deps, { projectId, environment: 'production', actor })
      await expect(send()).rejects.toMatchObject({ code: 'LAUNCH_PIA_NOT_APPROVED' })
      expect((await getIamRegistration(db, projectId, 'production'))?.state).toBe('draft')
      // THE POSITIVE CONTROL: the assessment approved, with its reference — and the draft made again.
      await piaApproved(db, projectId, actor)
      await withDraft(db, { projectId, environment: 'production' })
      expect((await send()).state).toBe('sent')
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

  it('an administrator’s record that MOVES a registration into submitted stamps when and by whom; a ticket correction does not (a pin: the direct draft → submitted stays)', async () => {
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
      expect(sent.sentFrom).toBeNull()
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

describe('the owner sends the privacy assessment, every gap answered (FE-46/47/5 plan Task 5; Review Focus 3)', () => {
  it('sends a drafted assessment with an answer to every gap: sent, now, by them, the answers kept in the draft’s order — told after the event', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      const drafted = await withAssessmentDraft(db, { projectId })
      const answers = everyGapAnswered(drafted.generatedDraft, (id) => `About ${id}.`)
      const { deps, said, told } = sending(db)
      const row = await sendPrivacyAssessment(deps, {
        projectId,
        actor,
        answers: [...answers].reverse(),
      })
      expect(row).toMatchObject({
        state: 'sent',
        sentBy: ownerId,
        submittedAt: null,
        submittedBy: null,
        gapAnswers: answers,
      })
      expect(row.sentAt).toBeInstanceOf(Date)
      const [event] = await eventsOf(db, projectId, 'privacy_assessment.sent')
      expect(event?.machineDetail).toEqual({ gapCount: answers.length })
      expect(event?.humanMessage).toBe(
        "Test Owner sent this app's privacy assessment to the Manifest team, with an answer to each of its 8 gaps, to submit to the Privacy Office.",
      )
      // COUNTS, NEVER THE ANSWERS — on the stream or in the email.
      expect(JSON.stringify(event)).not.toContain('About ')
      expect(said).toEqual(['privacy_assessment.sent', 'told:record-sent'])
      expect(told).toEqual([
        {
          kind: 'record-sent',
          record: 'privacy-assessment',
          change: false,
          project: { id: projectId, slug: expect.any(String), name: expect.any(String) },
          by: 'Test Owner',
          at: row.sentAt,
        },
      ])
    })
  })

  it('a missing, unknown, repeated, blank or over-long answer — 400 LAUNCH_GAP_ANSWERS_INVALID — writes nothing and tells nobody; "does not apply" is sent', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      const drafted = await withAssessmentDraft(db, { projectId })
      const answers = everyGapAnswered(drafted.generatedDraft)
      const { deps, told } = sending(db)
      const send = (given: { gapId: string; answer: string }[]) =>
        sendPrivacyAssessment(deps, { projectId, actor, answers: given })
      const first = answers[0]!
      for (const [given, atFault] of [
        [answers.slice(1), first.gapId],
        [[...answers, { gapId: 'flows.no-such-gap', answer: 'x' }], 'flows.no-such-gap'],
        [[...answers, first], first.gapId],
        [[{ ...first, answer: ' \n ' }, ...answers.slice(1)], first.gapId],
        [[{ ...first, answer: 'x'.repeat(2_001) }, ...answers.slice(1)], first.gapId],
      ] as const)
        await expect(send([...given]), atFault).rejects.toMatchObject({
          name: 'LaunchRecordError',
          code: 'LAUNCH_GAP_ANSWERS_INVALID',
          message: expect.stringContaining(atFault),
        })
      const held = await getPrivacyAssessment(db, projectId)
      expect(held).toMatchObject({ state: 'draft', sentAt: null, gapAnswers: null })
      expect(told).toEqual([])
      // THE POSITIVE CONTROL: "does not apply" for every gap.
      expect((await send(answers)).gapAnswers).toEqual(answers)
    })
  })

  it('refuses one with no draft — 409 LAUNCH_DRAFT_REQUIRED — and a second send — LAUNCH_TRANSITION_INVALID', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      const { deps } = sending(db)
      await expect(
        sendPrivacyAssessment(deps, { projectId, actor, answers: [] }),
      ).rejects.toMatchObject({ code: 'LAUNCH_DRAFT_REQUIRED' })
      const drafted = await withAssessmentDraft(db, { projectId })
      const answers = everyGapAnswered(drafted.generatedDraft)
      expect(
        (await sendPrivacyAssessment(deps, { projectId, actor, answers })).state,
      ).toBe('sent')
      await expect(
        sendPrivacyAssessment(deps, { projectId, actor, answers }),
      ).rejects.toMatchObject({ code: 'LAUNCH_TRANSITION_INVALID' })
    })
  })

  it('the email names the app and the sender, and carries no answer and no gap’s words (Review Focus 2)', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      const drafted = await withAssessmentDraft(db, { projectId })
      const MARKER = 'MARKER-fe46-answer-7Q'
      const answers = everyGapAnswered(drafted.generatedDraft, (id) => `${MARKER} ${id}`)
      const { deps, told } = sending(db)
      await sendPrivacyAssessment(deps, { projectId, actor, answers })
      const project = (await getPrivacyAssessment(db, projectId))!
      const { subject, text } = teamEmail(told[0]!, 'https://console.manifest.internal')
      const email = `${subject}\n${text}`
      expect(email).not.toContain(MARKER)
      for (const gap of (
        readAssessmentDraft(project.generatedDraft)?.sections ?? []
      ).flatMap((s) => s.gaps))
        expect(email).not.toContain(gap.text)
      expect(email).toContain(told[0]!.project.slug)
      expect(email).toContain('Test Owner')
      expect(email).toContain(
        `https://console.manifest.internal/projects/${projectId}/records`,
      )
    })
  })

  it('an email that cannot be delivered never undoes the send: sent, and ONE operator line (Review Focus 2)', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      const drafted = await withAssessmentDraft(db, { projectId })
      const lines: unknown[] = []
      const spy = vi.spyOn(console, 'error').mockImplementation((line: unknown) => {
        lines.push(line)
      })
      try {
        const mailer = createMailer(
          {
            mail: {
              smtp: {
                host: '127.0.0.1',
                port: 1,
                secure: false,
                requireTLS: false,
                auth: null,
              },
              team: 'team@manifest.internal',
              from: 'Manifest <manifest@manifest.internal>',
            },
            sp: { origin: 'https://console.manifest.internal' },
          },
          {
            sendMail: async () => {
              throw Object.assign(new Error('refused'), { code: 'ESOCKET' })
            },
          } as never,
        )
        const row = await sendPrivacyAssessment(
          { db, bus, mailer },
          { projectId, actor, answers: everyGapAnswered(drafted.generatedDraft) },
        )
        expect(row.state).toBe('sent')
        await mailer.settled()
        expect((await getPrivacyAssessment(db, projectId))?.state).toBe('sent')
        expect(lines.map((l) => JSON.parse(l as string))).toEqual([
          {
            level: 'error',
            msg: 'the Manifest team could not be emailed; the queue still holds the item',
            notice: 'record-sent',
            projectId,
            error: 'ESOCKET',
          },
        ])
      } finally {
        spy.mockRestore()
      }
    })
  })
})

describe('the Manifest team submits what it was sent to UBC (FE-46/47/5 plan Task 5)', () => {
  /** A staging registration the owner sent, the assessment approved first. */
  async function stagingSent(db: Db, projectId: string, actor: typeof ACTOR) {
    await piaApproved(db, projectId, actor)
    await withDraft(db, { projectId, environment: 'staging' })
    return sendIamRegistration(sending(db).deps, {
      projectId,
      environment: 'staging',
      actor,
    })
  }

  it('sent → submitted: the team’s day at noon in Vancouver, the administrator, UBC’s reference — the owner’s send kept', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      const sent = await stagingSent(db, projectId, actor)
      const admin = await teamMember(db)
      const today = vancouverToday()
      const row = await recordIamSubmission(db, bus, {
        projectId,
        environment: 'staging',
        actor: admin,
        sentAt: today,
        reference: 'IAM-2026-0500',
      })
      expect(row).toMatchObject({
        state: 'submitted',
        sentFrom: null,
        sentBy: ownerId,
        submittedBy: admin.id,
        externalTicketRef: 'IAM-2026-0500',
      })
      expect(row.sentAt?.toISOString()).toBe(sent.sentAt?.toISOString())
      expect(row.submittedAt?.toISOString()).toBe(vancouverNoon(today).toISOString())
      const [event] = await eventsOf(db, projectId, 'iam_registration.submitted')
      expect(event?.machineDetail).toEqual({
        environment: 'staging',
        sentAt: today,
        externalTicketRef: 'IAM-2026-0500',
        changeRequest: false,
      })
      expect(event?.humanMessage).toBe(
        `Platform Admin recorded that the Manifest team submitted this app's staging registration to UBC IAM on ${vancouverDayInWords(vancouverNoon(today))} (ticket IAM-2026-0500).`,
      )
      expect(JSON.stringify(event)).not.toContain(admin.puid)
    })
  })

  it('the day: not after today, not before the owner sent it, and a day that is one — 400 LAUNCH_SENT_AT_INVALID; today when absent', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      const sent = await stagingSent(db, projectId, actor)
      // The owner sent it three days ago.
      await db
        .update(iamRegistrations)
        .set({ sentAt: new Date(Date.now() - 3 * 86_400_000) })
        .where(eq(iamRegistrations.id, sent.id))
      const admin = await teamMember(db)
      const submit = (sentAt?: string) =>
        recordIamSubmission(db, bus, {
          projectId,
          environment: 'staging',
          actor: admin,
          reference: 'IAM-1',
          ...(sentAt === undefined ? {} : { sentAt }),
        })
      await expect(submit(vancouverDaysAgo(-1))).rejects.toMatchObject({
        code: 'LAUNCH_SENT_AT_INVALID',
        message: expect.stringContaining('after today'),
      })
      await expect(submit(vancouverDaysAgo(5))).rejects.toMatchObject({
        code: 'LAUNCH_SENT_AT_INVALID',
        message: expect.stringContaining('before the owner sent it to the Manifest team'),
      })
      for (const impossible of ['2026-02-30', '2026-00-15', '2025-13-01'])
        await expect(submit(impossible), impossible).rejects.toMatchObject({
          code: 'LAUNCH_SENT_AT_INVALID',
        })
      expect((await getIamRegistration(db, projectId, 'staging'))?.state).toBe('sent')
      // THE POSITIVE CONTROLS: a day between the owner's send and today — and no day, today.
      const row = await submit(vancouverDaysAgo(2))
      expect(row.submittedAt?.toISOString()).toBe(
        vancouverNoon(vancouverDaysAgo(2)).toISOString(),
      )
    })
  })

  it('is never refused for UBC’s order — staging submitted while the assessment is no longer approved', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      await stagingSent(db, projectId, actor)
      // The Privacy Office reopened the assessment after the owner sent staging's registration.
      await recordPrivacyAssessment(db, bus, { projectId, state: 'draft', actor })
      const row = await recordIamSubmission(db, bus, {
        projectId,
        environment: 'staging',
        actor: await teamMember(db),
        reference: 'IAM-2',
      })
      expect(row.state).toBe('submitted')
    })
  })

  it('refuses a record that is not with the team — 409 LAUNCH_TRANSITION_INVALID — and writes nothing', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      await piaApproved(db, projectId, actor)
      await withDraft(db, { projectId, environment: 'staging' })
      const admin = await teamMember(db)
      const submit = () =>
        recordIamSubmission(db, bus, {
          projectId,
          environment: 'staging',
          actor: admin,
          reference: 'IAM-3',
        })
      await expect(submit()).rejects.toMatchObject({
        name: 'LaunchTransitionError',
        code: 'LAUNCH_TRANSITION_INVALID',
      })
      expect(await getIamRegistration(db, projectId, 'staging')).toMatchObject({
        state: 'draft',
        submittedAt: null,
        externalTicketRef: null,
      })
      expect(await eventsOf(db, projectId, 'iam_registration.submitted')).toEqual([])
      // And none at all — no record is with the team.
      await expect(
        recordIamSubmission(db, bus, {
          projectId,
          environment: 'production',
          actor: admin,
          reference: 'IAM-4',
        }),
      ).rejects.toMatchObject({ code: 'LAUNCH_TRANSITION_INVALID' })
      // THE POSITIVE CONTROL: once the owner sent it.
      await sendIamRegistration(sending(db).deps, {
        projectId,
        environment: 'staging',
        actor,
      })
      expect((await submit()).state).toBe('submitted')
    })
  })

  it('the assessment: sent → submitted with the Privacy Office’s reference; the owner’s answers kept', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      const drafted = await withAssessmentDraft(db, { projectId })
      const answers = everyGapAnswered(drafted.generatedDraft)
      await sendPrivacyAssessment(sending(db).deps, { projectId, actor, answers })
      const admin = await teamMember(db)
      const row = await recordAssessmentSubmission(db, bus, {
        projectId,
        actor: admin,
        reference: 'PIA-2026-0101',
      })
      expect(row).toMatchObject({
        state: 'submitted',
        submittedBy: admin.id,
        externalTicketRef: 'PIA-2026-0101',
        sentBy: ownerId,
        gapAnswers: answers,
      })
      expect(row.submittedAt?.toISOString()).toBe(
        vancouverNoon(vancouverToday()).toISOString(),
      )
      const [event] = await eventsOf(db, projectId, 'privacy_assessment.submitted')
      expect(event?.machineDetail).toEqual({
        sentAt: vancouverToday(),
        externalTicketRef: 'PIA-2026-0101',
      })
      expect(event?.humanMessage).toBe(
        `Platform Admin recorded that the Manifest team submitted this app's privacy assessment to the UBC Privacy Office on ${vancouverDayInWords(vancouverNoon(vancouverToday()))} (ticket PIA-2026-0101).`,
      )
      // A second submission: it is no longer with the team.
      await expect(
        recordAssessmentSubmission(db, bus, {
          projectId,
          actor: admin,
          reference: 'PIA-2',
        }),
      ).rejects.toMatchObject({ code: 'LAUNCH_TRANSITION_INVALID' })
    })
  })
})

describe('the Manifest team hands a record back to its owner (FE-46/47/5 plan Task 5; Review Focus 1)', () => {
  it('a registration returns to the state it was sent from — draft, a lapse, or UBC’s questions to the owner', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      const admin = await teamMember(db)
      await piaApproved(db, projectId, actor)
      const draft = await withDraft(db, { projectId, environment: 'staging' })
      const { deps } = sending(db)
      const send = () =>
        sendIamRegistration(deps, { projectId, environment: 'staging', actor })
      const handBack = () =>
        returnIamRegistration(db, bus, {
          projectId,
          environment: 'staging',
          actor: admin,
        })

      // From a draft, back to it.
      await send()
      const back = await handBack()
      expect(back).toMatchObject({
        state: 'draft',
        sentFrom: null,
        changeRequestedFrom: null,
      })
      const [returned] = await eventsOf(db, projectId, 'iam_registration.returned')
      expect(returned?.machineDetail).toEqual({ environment: 'staging', to: 'draft' })
      expect(returned?.humanMessage).toBe(
        "Platform Admin handed this app's staging registration back to its owner, unsubmitted.",
      )

      // From UBC's questions to the owner: back to them, the owner's move again.
      await send()
      await recordIamSubmission(db, bus, {
        projectId,
        environment: 'staging',
        actor: admin,
        reference: 'IAM-5',
      })
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
      expect((await send()).sentFrom).toBe('change_requested')
      expect(await handBack()).toMatchObject({
        state: 'change_requested',
        changeRequestedFrom: 'submitted',
        sentFrom: null,
      })

      // From a lapse: back to `expired`, still not registered.
      await recordIamRegistration(db, bus, {
        ...IAM,
        environment: 'staging',
        entityId: draft.entityId,
        acsUrl: draft.acsUrl,
        sloUrl: draft.sloUrl,
        projectId,
        state: 'expired',
        actor,
      })
      expect((await send()).sentFrom).toBe('expired')
      expect(await handBack()).toMatchObject({
        state: 'expired',
        registeredAt: null,
        sentFrom: null,
      })
    })
  })

  it('the assessment returns to draft; a second send replaces the first’s day and answers', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      const admin = await teamMember(db)
      const drafted = await withAssessmentDraft(db, { projectId })
      const { deps } = sending(db)
      const first = await sendPrivacyAssessment(deps, {
        projectId,
        actor,
        answers: everyGapAnswered(drafted.generatedDraft, 'first'),
      })
      await db
        .update(privacyAssessments)
        .set({ sentAt: new Date(Date.now() - 86_400_000) })
        .where(eq(privacyAssessments.id, first.id))
      const back = await returnPrivacyAssessment(db, bus, { projectId, actor: admin })
      expect(back.state).toBe('draft')
      const [returned] = await eventsOf(db, projectId, 'privacy_assessment.returned')
      expect(returned?.machineDetail).toEqual({ to: 'draft' })
      const second = await sendPrivacyAssessment(deps, {
        projectId,
        actor,
        answers: everyGapAnswered(drafted.generatedDraft, 'second'),
      })
      expect(second.gapAnswers!.every((a) => a.answer === 'second')).toBe(true)
      expect(second.sentAt!.getTime()).toBeGreaterThan(Date.now() - 60_000)
    })
  })

  it('refuses a hand-back of what the team does not hold — 409 LAUNCH_TRANSITION_INVALID — and writes nothing', async () => {
    await withProject(async (db, { projectId }) => {
      const admin = await teamMember(db)
      await withAssessmentDraft(db, { projectId })
      await expect(
        returnPrivacyAssessment(db, bus, { projectId, actor: admin }),
      ).rejects.toMatchObject({ code: 'LAUNCH_TRANSITION_INVALID' })
      await withDraft(db, { projectId, environment: 'staging' })
      await expect(
        returnIamRegistration(db, bus, {
          projectId,
          environment: 'staging',
          actor: admin,
        }),
      ).rejects.toMatchObject({ code: 'LAUNCH_TRANSITION_INVALID' })
      expect(await eventsOf(db, projectId, 'iam_registration.returned')).toEqual([])
      expect(await eventsOf(db, projectId, 'privacy_assessment.returned')).toEqual([])
    })
  })
})

describe('no way around the team’s step (FE-46/47/5 plan Task 5; Review Focus 5)', () => {
  it('the administrator’s record never moves a registration into or out of `sent` — 409 LAUNCH_TRANSITION_INVALID naming the team’s operations', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      await piaApproved(db, projectId, actor)
      const draft = await withDraft(db, { projectId, environment: 'staging' })
      const record = (state: 'sent' | 'active' | 'submitted') =>
        recordIamRegistration(db, bus, {
          ...IAM,
          environment: 'staging',
          entityId: draft.entityId,
          acsUrl: draft.acsUrl,
          sloUrl: draft.sloUrl,
          projectId,
          state,
          actor,
        })
      // draft → sent: only the owner sends.
      await expect(record('sent')).rejects.toMatchObject({
        code: 'LAUNCH_TRANSITION_INVALID',
        message: expect.stringMatching(/sendIamRegistration/),
      })
      await sendIamRegistration(sending(db).deps, {
        projectId,
        environment: 'staging',
        actor,
      })
      const before = await getIamRegistration(db, projectId, 'staging')
      // sent → active, sent → submitted: only the team's own operations take it out.
      for (const state of ['active', 'submitted'] as const)
        await expect(record(state)).rejects.toMatchObject({
          code: 'LAUNCH_TRANSITION_INVALID',
          message: expect.stringMatching(/submitIamRegistration.*returnIamRegistration/s),
        })
      expect(await getIamRegistration(db, projectId, 'staging')).toEqual(before)
    })
  })

  it('the assessment the same — recordPrivacyAssessment never moves one into or out of `sent`', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      const drafted = await withAssessmentDraft(db, { projectId })
      await expect(
        recordPrivacyAssessment(db, bus, { projectId, state: 'sent', actor }),
      ).rejects.toMatchObject({ code: 'LAUNCH_TRANSITION_INVALID' })
      await sendPrivacyAssessment(sending(db).deps, {
        projectId,
        actor,
        answers: everyGapAnswered(drafted.generatedDraft),
      })
      const before = await getPrivacyAssessment(db, projectId)
      for (const state of ['submitted', 'approved', 'draft'] as const)
        await expect(
          recordPrivacyAssessment(db, bus, { projectId, state, actor }),
        ).rejects.toMatchObject({
          code: 'LAUNCH_TRANSITION_INVALID',
          message: expect.stringMatching(
            /submitPrivacyAssessment.*returnPrivacyAssessment/s,
          ),
        })
      expect(await getPrivacyAssessment(db, projectId)).toEqual(before)
    })
  })

  it('a record with the team, or a change request the team filed, is not drafted again — 409 LAUNCH_RECORD_SUBMITTED — nor sent over (Decision 5)', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      // Drafting refuses before it reads anything else, so these deps are never reached.
      const draftDeps = { db, bus } as unknown as Parameters<
        typeof draftIamRegistration
      >[0]
      await piaApproved(db, projectId, actor)
      await withDraft(db, { projectId, environment: 'staging' })
      await sendIamRegistration(sending(db).deps, {
        projectId,
        environment: 'staging',
        actor,
      })
      await expect(
        draftIamRegistration(draftDeps, { projectId, environment: 'staging', actor }),
      ).rejects.toMatchObject({
        code: 'LAUNCH_RECORD_SUBMITTED',
        message: expect.stringMatching(/with the Manifest team/),
      })
      // A change request the team FILED with UBC (from `active`) is UBC's to answer.
      for (const state of ['submitted', 'active'] as const)
        await recordIamRegistration(db, bus, { ...IAM, projectId, state, actor })
      await recordIamRegistration(db, bus, {
        ...IAM,
        projectId,
        state: 'change_requested',
        requestedAttributes: ['displayName', 'mail', 'sn'],
        actor,
      })
      // A package on it, so the send is refused for where it is, not for having no draft.
      await withDraft(db, { projectId, environment: 'production' })
      const filed = await getIamRegistration(db, projectId, 'production')
      expect(filed?.changeRequestedFrom).toBe('active')
      await expect(
        draftIamRegistration(draftDeps, { projectId, environment: 'production', actor }),
      ).rejects.toMatchObject({ code: 'LAUNCH_RECORD_SUBMITTED' })
      await expect(
        sendIamRegistration(sending(db).deps, {
          projectId,
          environment: 'production',
          actor,
        }),
      ).rejects.toMatchObject({ code: 'LAUNCH_TRANSITION_INVALID' })
      expect(await getIamRegistration(db, projectId, 'production')).toEqual(filed)
    })
  })

  it('an assessment with the team is not drafted again — 409 LAUNCH_RECORD_SUBMITTED, in its own words', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      const drafted = await withAssessmentDraft(db, { projectId })
      await sendPrivacyAssessment(sending(db).deps, {
        projectId,
        actor,
        answers: everyGapAnswered(drafted.generatedDraft),
      })
      const deps = { db, bus } as unknown as Parameters<typeof draftPrivacyAssessment>[0]
      await expect(
        draftPrivacyAssessment(deps, { projectId, actor }),
      ).rejects.toMatchObject({
        code: 'LAUNCH_RECORD_SUBMITTED',
        message: expect.stringMatching(/with the Manifest team/),
      })
    })
  })

  it('the database refuses a `sent` row that says nothing of where it came from or who sent it, and an origin on any other row', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      await piaApproved(db, projectId, actor)
      const draft = await withDraft(db, { projectId, environment: 'staging' })
      const where = eq(iamRegistrations.id, draft.id)
      // Each in its own SAVEPOINT, so one refusal does not abort the next.
      await expectSqlState(
        db.transaction((tx) =>
          tx.update(iamRegistrations).set({ state: 'sent' }).where(where),
        ),
        '23514',
      )
      await expectSqlState(
        db.transaction((tx) =>
          tx.update(iamRegistrations).set({ sentFrom: 'draft' }).where(where),
        ),
        '23514',
      )
      await expectSqlState(
        db.transaction((tx) =>
          tx
            .update(iamRegistrations)
            .set({ state: 'sent', sentFrom: 'draft' })
            .where(where),
        ),
        '23514',
      )
      // THE POSITIVE CONTROL: all of it together is a row the database keeps.
      await db
        .update(iamRegistrations)
        .set({ state: 'sent', sentFrom: 'draft', sentAt: new Date(), sentBy: ownerId })
        .where(where)
      // The assessment: `sent` with no answers.
      const piaWhere = eq(privacyAssessments.projectId, projectId)
      await db.update(privacyAssessments).set({ state: 'draft' }).where(piaWhere)
      await expectSqlState(
        db.transaction((tx) =>
          tx
            .update(privacyAssessments)
            .set({ state: 'sent', sentAt: new Date(), sentBy: ownerId })
            .where(piaWhere),
        ),
        '23514',
      )
      await db
        .update(privacyAssessments)
        .set({ state: 'sent', sentAt: new Date(), sentBy: ownerId, gapAnswers: [] })
        .where(piaWhere)
    })
  })
})

/**
 * WHERE A CHANGE REQUEST CAME FROM (the launch path plan's Task 12; Spec action 10, from Rich's (a) on
 * `change_requested`'s two meanings): `submitted → change_requested` is UBC IAM asking the OWNER for
 * changes, and `active → change_requested` is an administrator filing a change request WITH UBC IAM —
 * one state, two different people to wait on. `change_requested_from` records which, set by the move
 * INTO the state and cleared by any move out of it, and the queue reads it. One test per arrow.
 */
describe('where a change request came from (Task 12, Spec action 10)', () => {
  it('UBC asking for changes (submitted → change_requested) records `submitted`; a ticket correction keeps it', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      const sent = await recordIamRegistration(db, bus, {
        ...IAM,
        projectId,
        state: 'submitted',
        actor,
      })
      // THE POSITIVE CONTROL beside the arrows: outside `change_requested` it is null.
      expect(sent.changeRequestedFrom).toBeNull()
      const asked = await recordIamRegistration(db, bus, {
        ...IAM,
        projectId,
        state: 'change_requested',
        actor,
      })
      expect(asked.changeRequestedFrom).toBe('submitted')
      // Not an arrow: the same state, a ticket corrected — where it came from is unchanged.
      const corrected = await recordIamRegistration(db, bus, {
        ...IAM,
        projectId,
        state: 'change_requested',
        externalTicketRef: 'IAM-2026-0600',
        actor,
      })
      expect(corrected.changeRequestedFrom).toBe('submitted')
    })
  })

  it('an administrator filing a change request (active → change_requested) records `active`', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      for (const state of ['submitted', 'active'] as const)
        await recordIamRegistration(db, bus, { ...IAM, projectId, state, actor })
      const filed = await recordIamRegistration(db, bus, {
        ...IAM,
        projectId,
        state: 'change_requested',
        requestedAttributes: ['displayName', 'mail', 'sn'],
        actor,
      })
      expect(filed.changeRequestedFrom).toBe('active')
    })
  })

  it('leaving change_requested clears it — to submitted, and to expired', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      for (const state of ['submitted', 'change_requested', 'submitted'] as const)
        await recordIamRegistration(db, bus, { ...IAM, projectId, state, actor })
      expect(
        (await getIamRegistration(db, projectId, 'production'))?.changeRequestedFrom,
      ).toBeNull()
      for (const state of ['active', 'change_requested'] as const)
        await recordIamRegistration(db, bus, {
          ...IAM,
          projectId,
          state,
          requestedAttributes: ['displayName', 'mail', 'sn'],
          actor,
        })
      expect(
        (await getIamRegistration(db, projectId, 'production'))?.changeRequestedFrom,
      ).toBe('active')
      const lapsed = await recordIamRegistration(db, bus, {
        ...IAM,
        projectId,
        state: 'expired',
        actor,
      })
      expect(lapsed.changeRequestedFrom).toBeNull()
    })
  })

  it('the owner’s send from change_requested clears it — and keeps where it was sent from', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      await piaApproved(db, projectId, actor)
      const draft = await withDraft(db, { projectId, environment: 'staging' })
      const { deps } = sending(db)
      await sendIamRegistration(deps, { projectId, environment: 'staging', actor })
      await recordIamSubmission(db, bus, {
        projectId,
        environment: 'staging',
        actor,
        reference: 'IAM-STG-9',
      })
      const asked = await recordIamRegistration(db, bus, {
        ...IAM,
        environment: 'staging',
        entityId: draft.entityId,
        acsUrl: draft.acsUrl,
        sloUrl: draft.sloUrl,
        projectId,
        state: 'change_requested',
        actor,
      })
      expect(asked.changeRequestedFrom).toBe('submitted')
      const again = await sendIamRegistration(deps, {
        projectId,
        environment: 'staging',
        actor,
      })
      expect(again).toMatchObject({
        state: 'sent',
        sentFrom: 'change_requested',
        changeRequestedFrom: null,
      })
    })
  })

  it('the database refuses a change_requested row that does not say where it came from, and an origin on any other state', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const actor = { ...ACTOR, id: ownerId }
      await recordIamRegistration(db, bus, {
        ...IAM,
        projectId,
        state: 'submitted',
        actor,
      })
      // A writer that forgot it — CHECK `iam_registrations_change_requested_from` (23514). Each in
      // its own SAVEPOINT (a nested transaction), so the first refusal does not abort the second.
      await expectSqlState(
        db.transaction((tx) =>
          tx
            .update(iamRegistrations)
            .set({ state: 'change_requested' })
            .where(eq(iamRegistrations.projectId, projectId)),
        ),
        '23514',
      )
      await expectSqlState(
        db.transaction((tx) =>
          tx
            .update(iamRegistrations)
            .set({ changeRequestedFrom: 'submitted' })
            .where(eq(iamRegistrations.projectId, projectId)),
        ),
        '23514',
      )
      // THE POSITIVE CONTROL: the two together are a row the database keeps.
      await db
        .update(iamRegistrations)
        .set({ state: 'change_requested', changeRequestedFrom: 'submitted' })
        .where(eq(iamRegistrations.projectId, projectId))
    })
  })
})
