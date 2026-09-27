import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { users } from '../db/index.js'
import { withProject } from '../db/testing.js'
import { personName } from './source-attribution.js'

/**
 * THE ONE LOOKUP every sentence that names a person uses (the authoring API plan's Task 12):
 * a launch record, a rehearsal, a minted token, an answered request, an approval and a commit.
 */
describe('personName — a person by name, never a PUID (Task 12)', () => {
  it('answers the display name; a blank one or a missing user is “A Manifest user”, never the PUID', async () => {
    await withProject(async (db, { ownerId }) => {
      // The positive control: a named person is named.
      expect(await personName(db, ownerId)).toBe('Test Owner')
      const [owner] = await db.select().from(users).where(eq(users.id, ownerId))
      await db.update(users).set({ displayName: '  ' }).where(eq(users.id, ownerId))
      const blank = await personName(db, ownerId)
      expect(blank).toBe('A Manifest user')
      expect(blank).not.toContain(owner!.ubcCwlPuid)
      expect(await personName(db, randomUUID())).toBe('A Manifest user')
    })
  })
})
