import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { withRollback } from '../db/testing.js'
import { users } from '../db/index.js'
import { DevAuthDisabledError, UnknownDevUserError, devLogin } from './dev-auth.js'

describe('the dev auth shim (roadmap gap 3)', () => {
  it('creates the test user on first login', async () => {
    await withRollback(async (db) => {
      const { user, session } = await devLogin(db, 'bio_prof', { devAuthEnabled: true })
      expect(user.ubcCwlPuid).toBe('bio_prof')
      expect(session.userId).toBe(user.id)
      const rows = await db.select().from(users).where(eq(users.ubcCwlPuid, 'bio_prof'))
      expect(rows).toHaveLength(1)
    })
  })

  it('is idempotent — the second login returns the same user', async () => {
    await withRollback(async (db) => {
      const first = await devLogin(db, 'bio_prof', { devAuthEnabled: true })
      const second = await devLogin(db, 'bio_prof', { devAuthEnabled: true })
      expect(second.user.id).toBe(first.user.id)
      const rows = await db.select().from(users).where(eq(users.ubcCwlPuid, 'bio_prof'))
      expect(rows).toHaveLength(1)
    })
  })

  it('seeds the platform admin with the admin role', async () => {
    await withRollback(async (db) => {
      const { user, session } = await devLogin(db, 'platform_admin', { devAuthEnabled: true })
      expect(user.role).toBe('admin')
      expect(session.role).toBe('admin')
    })
  })

  it('refuses when dev auth is disabled', async () => {
    await withRollback(async (db) => {
      await expect(devLogin(db, 'bio_prof', { devAuthEnabled: false })).rejects.toThrow(
        DevAuthDisabledError,
      )
    })
  })

  it('refuses a PUID that is not one of the seeded test users', async () => {
    await withRollback(async (db) => {
      await expect(
        devLogin(db, 'someone-i-invented', { devAuthEnabled: true }),
      ).rejects.toThrow(UnknownDevUserError)
    })
  })
})
