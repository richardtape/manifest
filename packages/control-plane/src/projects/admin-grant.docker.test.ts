import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, roleChanges, users } from '../db/index.js'
import { resetDatabase } from '../db/testing.js'
import { expectSqlState } from '../observability/testing.js'

const run = promisify(execFile)
const ROOT = new URL('../../../../', import.meta.url).pathname
const grant = (...args: string[]) =>
  run('bash', ['scripts/admin-grant.sh', ...args], { cwd: ROOT }).then(
    (r) => ({ code: 0, out: r.stdout + r.stderr }),
    (e: { code?: number; stdout?: string; stderr?: string }) => ({
      code: e.code ?? 1,
      out: `${e.stdout ?? ''}${e.stderr ?? ''}`,
    }),
  )

beforeEach(resetDatabase)
afterAll(resetDatabase)

async function signedInOnce(puid: string) {
  const [user] = await db
    .insert(users)
    .values({ ubcCwlPuid: puid, email: `${puid}@ubc.ca`, displayName: 'Test Operator' })
    .returning()
  return user!
}

describe('the first administrator, out of band (§20, P5a Task 16)', () => {
  it('grants the role and records who, when and why', async () => {
    const user = await signedInOnce('opr-test-1')
    const result = await grant(
      'grant',
      'opr-test-1',
      'the first administrator for this laptop',
    )
    expect(result.code, result.out).toBe(0)
    expect(result.out).toContain('sign in again')
    const [after] = await db.select().from(users).where(eq(users.id, user.id))
    expect(after!.role).toBe('admin')
    const [audit] = await db
      .select()
      .from(roleChanges)
      .where(eq(roleChanges.userId, user.id))
    expect(audit).toMatchObject({
      fromRole: 'member',
      toRole: 'admin',
      reason: 'the first administrator for this laptop',
    })
    expect(audit!.actor).toMatch(/^bootstrap:.+@.+$/)
  })

  it('refuses a person who has never signed in, and an empty reason — changing nothing', async () => {
    expect((await grant('grant', 'nobody-ever', 'a reason')).code).not.toBe(0)
    await signedInOnce('opr-test-2')
    expect((await grant('grant', 'opr-test-2', '   ')).code).not.toBe(0)
    expect(await db.select().from(roleChanges)).toEqual([])
    expect(
      (await db.select().from(users).where(eq(users.ubcCwlPuid, 'opr-test-2')))[0]!.role,
    ).toBe('member')
  })

  it('records nothing for a grant that changes nothing, and revokes', async () => {
    await signedInOnce('opr-test-3')
    await grant('grant', 'opr-test-3', 'first')
    expect((await grant('grant', 'opr-test-3', 'again')).code).toBe(0)
    expect(await db.select().from(roleChanges)).toHaveLength(1)
    expect((await grant('revoke', 'opr-test-3', 'no longer needed')).code).toBe(0)
    expect(
      (await db.select().from(users).where(eq(users.ubcCwlPuid, 'opr-test-3')))[0]!.role,
    ).toBe('member')
  })

  /**
   * `42501` is insufficient_privilege, asserted by SQLSTATE rather than by message:
   * drizzle wraps the driver's error and its own message is `Failed query: …`, so
   * `rejects.toThrow(/permission denied/)` goes red against a working grant
   * (`observability/testing.ts`, whose docstring records what that cost).
   */
  it('is append-only to the control plane’s own role', async () => {
    await signedInOnce('opr-test-4')
    await grant('grant', 'opr-test-4', 'for the grant test')
    expect(await db.select().from(roleChanges)).toHaveLength(1)
    await expectSqlState(
      db.execute(sql`UPDATE audit.role_changes SET reason = 'rewritten'`),
      '42501',
    )
    await expectSqlState(db.execute(sql`DELETE FROM audit.role_changes`), '42501')
  })
})
