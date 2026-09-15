import { randomUUID } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { appSpecs, buildLogs, builds, type Db } from '../db/index.js'
import { withProject } from '../db/testing.js'
import {
  appendBuildLog,
  createBuildLogWriter,
  makeRedactor,
  readBuildLog,
} from './index.js'
import { expectSqlState } from './testing.js'

const IDENTITY = (value: unknown): unknown => value

/**
 * A rolled-back transaction holding a real build row. Local to this file (P4b's
 * convention for fixtures): `withProject` gives a project and nothing passes a
 * build, and a build needs an AppSpec first — `builds.app_spec_id` is NOT NULL.
 */
async function withBuild(
  fn: (db: Db, ctx: { projectId: string; buildId: string }) => Promise<void>,
): Promise<void> {
  await withProject(async (db, { projectId }) => {
    const [spec] = await db
      .insert(appSpecs)
      .values({
        projectId,
        commitSha: 'a'.repeat(40),
        parsed: {},
        schemaVersion: 1,
        valid: true,
      })
      .returning()
    const [build] = await db
      .insert(builds)
      .values({
        projectId,
        commitSha: 'a'.repeat(40),
        appSpecId: spec!.id,
        status: 'running',
      })
      .returning()
    await fn(db, { projectId, buildId: build!.id })
  })
}

const line = (seq: number, text: string, stream: 'stdout' | 'stderr' = 'stdout') => ({
  seq,
  at: new Date(),
  stream,
  text,
})

describe('build logs (§14)', () => {
  it('stores lines and reads back the TAIL, in order', async () => {
    await withBuild(async (db, { buildId }) => {
      await appendBuildLog(
        db,
        buildId,
        [line(0, 'step 1'), line(1, 'step 2', 'stderr'), line(2, 'step 3')],
        IDENTITY,
      )
      // The LAST lines, not the first, and in reading order. A tail that returns
      // the head looks right until a build fails on its 400th line, and one that
      // returns them newest-first reads a stack trace upside down.
      const tail = await readBuildLog(db, buildId, { tail: 2 })
      expect(tail.map((l) => l.text)).toEqual(['step 2', 'step 3'])

      const all = await readBuildLog(db, buildId)
      expect(all.map((l) => [l.seq, l.stream, l.text])).toEqual([
        [0, 'stdout', 'step 1'],
        [1, 'stderr', 'step 2'],
        [2, 'stdout', 'step 3'],
      ])
      expect(all[0]!.at).toBeInstanceOf(Date)
    })
  })

  it('redacts at capture, so the unredacted form is never persisted', async () => {
    // §14: "redacted at capture, never at display". Search the stored ROWS, not
    // what readBuildLog hands back — a redactor applied on the way out would pass
    // a read-back test and persist the secret.
    await withBuild(async (db, { buildId }) => {
      const redact = makeRedactor(['eyJhbGciOiJSUzI1NiJ9.CANARY'])
      await appendBuildLog(
        db,
        buildId,
        [line(0, 'auth: Bearer eyJhbGciOiJSUzI1NiJ9.CANARY', 'stderr')],
        redact,
      )
      const rows = await db.select().from(buildLogs).where(eq(buildLogs.buildId, buildId))
      expect(rows).toHaveLength(1)
      expect(JSON.stringify(rows)).not.toContain('CANARY')
      expect(JSON.stringify(rows)).toContain('[REDACTED]')
    })
  })

  it('numbers lines in the order they were WRITTEN, and lands every one before flush resolves', async () => {
    // `onLog` is synchronous and BuildKit is fast. One insert per line fired
    // concurrently races on PRIMARY KEY (build_id, seq), and an append-only table
    // cannot repair a collision afterwards — so the writer owns the counter and a
    // single queue, and `flush` is what a caller awaits before it records a status.
    await withBuild(async (db, { buildId }) => {
      const writer = createBuildLogWriter(db, buildId, IDENTITY)
      const count = 250
      for (let i = 0; i < count; i += 1) {
        writer.write({
          at: new Date(),
          stream: i % 2 === 0 ? 'stdout' : 'stderr',
          text: `line ${i}`,
        })
      }
      await writer.flush()
      const lines = await readBuildLog(db, buildId)
      expect(lines.map((l) => l.text)).toEqual(
        Array.from({ length: count }, (_, i) => `line ${i}`),
      )
      expect(lines.map((l) => l.seq)).toEqual(Array.from({ length: count }, (_, i) => i))
    })
  })

  it('surfaces a write that failed, rather than dropping the line', async () => {
    // No such build, so the foreign key refuses the insert. The failure has to
    // come back out of flush(): a log that silently has a hole in it is worse than
    // one that says it could not be written.
    await withBuild(async (db) => {
      const writer = createBuildLogWriter(db, randomUUID(), IDENTITY)
      writer.write({ at: new Date(), stream: 'stdout', text: 'orphan' })
      await expectSqlState(writer.flush(), '23503')
    })
  })
})

describe('build log integrity (§20)', () => {
  // The table is in the `audit` SCHEMA and `manifest_app` — the least-privilege
  // role the control plane and this suite both connect as — is granted SELECT and
  // INSERT only. There is no owner transfer and no REVOKE: a REVOKE against a
  // SUPERUSER is a no-op that reads exactly like a control, which P4a measured.
  //
  // ONE transaction per refusal. The first refused statement aborts the
  // transaction, and a second statement in it fails with 25P02 whether or not its
  // own grant is in place — which would pass this test against a writable table.
  const refusals: [string, (buildId: string) => ReturnType<typeof sql>, string][] = [
    ['UPDATE', () => sql`UPDATE audit.build_logs SET text = 'y'`, '42501'],
    ['DELETE', () => sql`DELETE FROM audit.build_logs`, '42501'],
    ['TRUNCATE', () => sql`TRUNCATE audit.build_logs`, '42501'],
    // The route around the grant that naming the verbs does not close: a
    // referential action runs with the REFERENCED table's privileges, so
    // ON DELETE CASCADE would let `DELETE FROM builds` erase the log.
    [
      'a delete of the build it belongs to',
      (buildId) => sql`DELETE FROM builds WHERE id = ${buildId}`,
      '23503',
    ],
  ]

  for (const [what, statement, code] of refusals) {
    it(`refuses ${what}`, async () => {
      await withBuild(async (db, { buildId }) => {
        await appendBuildLog(db, buildId, [line(0, 'x')], IDENTITY)
        await expectSqlState(db.execute(statement(buildId)), code)
      })
    })
  }
})
