import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { events } from '../db/index.js'
import { withProject } from '../db/testing.js'
import { makeRedactor, recordEvent } from './index.js'
// Why a message match cannot stand in for this is on the helper itself.
import { expectSqlState } from './testing.js'

const IDENTITY = (value: unknown): unknown => value

describe('recordEvent (§14, §20)', () => {
  it('never persists the unredacted form', async () => {
    await withProject(async (db, { projectId }) => {
      const redact = makeRedactor(['STUDENT-PII-CANARY'])
      await recordEvent(
        db,
        {
          projectId,
          subject: 'instance:abc',
          type: 'instance.failed',
          machineDetail: { stderr: 'connect failed: STUDENT-PII-CANARY' },
          humanMessage: 'Your app could not start.',
        },
        redact,
      )
      // Search the whole row, not the field we expect it in. §14's rule is about
      // what is persisted, and a canary in `human_message` is just as persisted
      // as one in `machine_detail`.
      const [row] = await db.select().from(events)
      expect(JSON.stringify(row)).not.toContain('STUDENT-PII-CANARY')
      expect(JSON.stringify(row)).toContain('[REDACTED]')
    })
  })

  it('redacts the human message too, not only the machine detail', async () => {
    // §14 names `Event.machine_detail`, and it would be easy to read that as the
    // only field at risk. A faculty-legible message is assembled from the same
    // failure text, so it carries the same values.
    await withProject(async (db, { projectId }) => {
      await recordEvent(
        db,
        {
          projectId,
          subject: 'instance:abc',
          type: 'instance.failed',
          machineDetail: {},
          humanMessage: 'Your app could not reach mongodb://app:hunter2xyz@db.',
        },
        makeRedactor(['hunter2xyz']),
      )
      const [row] = await db.select().from(events)
      expect(row!.humanMessage).not.toContain('hunter2xyz')
      expect(row!.humanMessage).toContain('[REDACTED]')
    })
  })

  it('carries a faculty-legible message alongside the machine detail', async () => {
    // §14's first bullet. A row with only machine_detail is a row a faculty
    // member cannot act on, and P3 measured what that costs: a failed build
    // recorded `failed` and nothing else.
    await withProject(async (db, { projectId }) => {
      await expect(
        recordEvent(
          db,
          {
            projectId,
            subject: 'sp:chem-labs:staging',
            type: 'sso.registered',
            machineDetail: {},
            humanMessage: '   ',
          },
          IDENTITY,
        ),
      ).rejects.toThrow(/human_message/i)
    })
  })

  it('refuses a type outside the closed set', async () => {
    await withProject(async (db, { projectId }) => {
      await expect(
        recordEvent(
          db,
          {
            projectId,
            subject: 's',
            // @ts-expect-error — the point of the test is the runtime guard, which
            // is what a JS caller or a future JSON body would reach.
            type: 'sso.invented',
            machineDetail: {},
            humanMessage: 'Something happened.',
          },
          IDENTITY,
        ),
      ).rejects.toThrow(/EVENT_TYPE_UNKNOWN|unknown event type/i)
    })
  })

  it('returns the row it wrote, so a caller need not read it back', async () => {
    await withProject(async (db, { projectId }) => {
      const event = await recordEvent(
        db,
        {
          projectId,
          subject: 'sp:chem-labs:staging',
          type: 'sso.registered',
          machineDetail: { entityId: 'https://manifest.internal/sp/chem-labs/staging' },
          humanMessage: 'Single sign-on was set up.',
        },
        IDENTITY,
      )
      expect(event.id).toMatch(/^[0-9a-f-]{36}$/)
      expect(event.createdAt).toBeInstanceOf(Date)
      expect(event.projectId).toBe(projectId)
    })
  })
})

describe('audit integrity (§20)', () => {
  it('runs as an application role that is not a superuser', async () => {
    // The two tests below assert a GRANT, and a grant is invisible from a
    // superuser — `REVOKE UPDATE, DELETE` followed by `UPDATE 1` was the measured
    // starting point of this task. If the suite ever goes back to connecting as
    // `manifest`, this says so directly instead of leaving the reader to work out
    // why an append-only test suddenly passes on a writable table.
    await withProject(async (db) => {
      const who = await db.execute(
        sql`SELECT current_user AS role, usesuper AS superuser FROM pg_user WHERE usename = current_user`,
      )
      const row = who.rows[0] as { role: string; superuser: boolean }
      expect(row.role).toBe('manifest_app')
      expect(row.superuser).toBe(false)
    })
  })

  it('refuses an UPDATE and a DELETE at the GRANT level, not in code', async () => {
    await withProject(async (db, { projectId }) => {
      await recordEvent(
        db,
        {
          projectId,
          subject: 's',
          type: 'sso.registered',
          machineDetail: {},
          humanMessage: 'Registered.',
        },
        IDENTITY,
      )
      // Raw SQL deliberately: a code-level guard is a convention, and §20 says
      // "append-only by grant, not by convention". This asserts the grant.
      await expectSqlState(
        db.execute(sql`UPDATE audit.events SET human_message = 'x'`),
        '42501',
      )
    })
    await withProject(async (db, { projectId }) => {
      await recordEvent(
        db,
        {
          projectId,
          subject: 's',
          type: 'sso.registered',
          machineDetail: {},
          humanMessage: 'Registered.',
        },
        IDENTITY,
      )
      await expectSqlState(db.execute(sql`DELETE FROM audit.events`), '42501')
    })
  })

  it('refuses TRUNCATE, and refuses to lose events with the project', async () => {
    // Two routes around the grant that naming UPDATE and DELETE does not close.
    // The second is not hypothetical: with the grant working exactly as intended,
    // `DELETE FROM projects` took the audit rows with it through the foreign key's
    // ON DELETE CASCADE, because a referential action runs with the referenced
    // table's privileges rather than the caller's. Measured, `events_after_project_delete = 0`.
    await withProject(async (db, { projectId }) => {
      await recordEvent(
        db,
        {
          projectId,
          subject: 's',
          type: 'sso.registered',
          machineDetail: {},
          humanMessage: 'Registered.',
        },
        IDENTITY,
      )
      await expectSqlState(db.execute(sql`TRUNCATE audit.events`), '42501')
    })
    await withProject(async (db, { projectId }) => {
      await recordEvent(
        db,
        {
          projectId,
          subject: 's',
          type: 'sso.registered',
          machineDetail: {},
          humanMessage: 'Registered.',
        },
        IDENTITY,
      )
      await expectSqlState(
        db.execute(sql`DELETE FROM projects WHERE id = ${projectId}`),
        '23503',
      )
    })
  })
})
