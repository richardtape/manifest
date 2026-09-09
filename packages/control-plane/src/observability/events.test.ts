import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { events } from '../db/index.js'
import { withProject } from '../db/testing.js'
import { makeRedactor, recordEvent } from './index.js'

const IDENTITY = (value: unknown): unknown => value

/**
 * Asserts a query failed with a specific Postgres SQLSTATE.
 *
 * `rejects.toThrow(/permission denied/i)` does NOT work here and the way it fails
 * is worth keeping: drizzle wraps every driver error in its own, whose message is
 * `Failed query: UPDATE audit.events …` and carries the real one on `.cause`. So
 * the regex matched nothing while the query was in fact being refused — a test
 * that would have gone red against a working control and green against a broken
 * one the moment somebody relaxed it to `.rejects.toThrow()`.
 *
 * The code is also the stronger assertion. `42501` is insufficient_privilege and
 * `23503` is foreign_key_violation; a message match would accept a typo'd table
 * name or a rolled-back transaction as proof of a grant.
 */
async function expectSqlState(promise: Promise<unknown>, code: string): Promise<void> {
  let thrown: unknown
  try {
    await promise
  } catch (error) {
    thrown = error
  }
  expect(thrown, 'the query was expected to fail and did not').toBeDefined()
  const codes: string[] = []
  for (let e = thrown; e instanceof Error; e = e.cause) {
    const found = (e as { code?: string }).code
    if (found !== undefined) codes.push(found)
  }
  expect(codes).toContain(code)
}

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
