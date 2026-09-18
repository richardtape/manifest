import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { withProject } from '../db/testing.js'
import { createToken, revokeToken, tokenById, touchToken } from './repository.js'
import { mintTestToken } from './testing.js'
import { mintToken, parseToken, secretMatches } from './token.js'

/** A day from now: every token has an expiry, and Task 10 is what makes it bite. */
function tomorrow(): Date {
  return new Date(Date.now() + 86_400_000)
}

describe('the delegated token store', () => {
  it('stores a hash and reads the row back by id', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const id = randomUUID()
      const minted = mintToken(id)
      const row = await createToken(db, {
        id,
        userId: ownerId,
        projectId,
        name: 'ci',
        tokenHash: minted.tokenHash,
        capabilities: ['project:read', 'build:create'],
        expiresAt: tomorrow(),
      })
      const read = await tokenById(db, row.id)
      expect(read?.tokenHash).toBe(minted.tokenHash)
      expect(read?.capabilities).toEqual(['project:read', 'build:create'])
      expect(read?.revokedAt).toBeNull()
      expect(read?.lastUsedAt).toBeNull()
      // The column default, so the number Task 9 limits on is the number stored here.
      expect(read?.rateLimit).toBe(600)
    })
  })

  /**
   * THE PROPERTY TASK 5 AUTHENTICATES ON, asserted here where it is cheap: the plaintext
   * names its own row, so a bearer header alone is enough to find the row and verify the
   * secret against it. Nothing else in this plan proves the three functions agree, and
   * `[M4]` measured the hash without ever parsing a minted token back (P5b sitting 2).
   */
  it('a token’s plaintext names the row it was stored as, and verifies against it', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const id = randomUUID()
      const minted = mintToken(id)
      const row = await createToken(db, {
        id,
        userId: ownerId,
        projectId,
        name: 'ci',
        tokenHash: minted.tokenHash,
        capabilities: ['project:read'],
        expiresAt: tomorrow(),
      })
      expect(row.id).toBe(id)
      const parsed = parseToken(minted.plaintext)
      expect(parsed, minted.plaintext).toBeDefined()
      const found = await tokenById(db, parsed!.id)
      expect(found?.id).toBe(row.id)
      expect(secretMatches(parsed!.secret, found!.tokenHash)).toBe(true)
      // And the wrong secret against the right row, so the check above is not vacuous.
      expect(secretMatches(mintToken(id).secret, found!.tokenHash)).toBe(false)
    })
  })

  it('refuses two tokens with the same hash', async () => {
    // The unique index is the real guard: a duplicated hash would make one secret
    // authenticate two rows, and which one wins would be the planner's choice.
    await withProject(async (db, { projectId, ownerId }) => {
      const minted = mintToken(randomUUID())
      const args = {
        userId: ownerId,
        projectId,
        name: 'ci',
        tokenHash: minted.tokenHash,
        capabilities: ['project:read'],
        expiresAt: tomorrow(),
      }
      await createToken(db, { ...args, id: randomUUID() })
      await expect(
        createToken(db, { ...args, id: randomUUID(), name: 'ci-2' }),
      ).rejects.toThrow()
    })
  })

  it('revokes once, and says so', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const id = randomUUID()
      const minted = mintToken(id)
      const row = await createToken(db, {
        id,
        userId: ownerId,
        projectId,
        name: 'ci',
        tokenHash: minted.tokenHash,
        capabilities: ['project:read'],
        expiresAt: tomorrow(),
      })
      expect(await revokeToken(db, row.id, ownerId)).toBe(true)
      expect((await tokenById(db, row.id))?.revokedAt).not.toBeNull()
      // Idempotent: revoking a revoked token is not an error, and does not move the stamp.
      const stamp = (await tokenById(db, row.id))?.revokedAt
      expect(await revokeToken(db, row.id, ownerId)).toBe(false)
      expect((await tokenById(db, row.id))?.revokedAt).toEqual(stamp)
    })
  })

  it('will not revoke somebody else’s token', async () => {
    // The scope is the whole point of the userId argument: Task 4's route takes the id
    // from the path, and a token id is guessable in the way any uuid is.
    await withProject(async (db, { projectId, ownerId }) => {
      const id = randomUUID()
      const row = await createToken(db, {
        id,
        userId: ownerId,
        projectId,
        name: 'ci',
        tokenHash: mintToken(id).tokenHash,
        capabilities: ['project:read'],
        expiresAt: tomorrow(),
      })
      expect(await revokeToken(db, row.id, randomUUID())).toBe(false)
      expect((await tokenById(db, row.id))?.revokedAt).toBeNull()
    })
  })

  it('the fixture writes a usable token, including one no route would mint', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const { plaintext, row } = await mintTestToken(db, {
        userId: ownerId,
        projectId,
        // `members:manage` is one of D24's privileged four: Task 4's mint route refuses
        // it, and Task 6 has to authenticate a token holding one anyway — that is what
        // D24's "however it was minted" means, and only a fixture can write it.
        capabilities: ['project:read', 'members:manage'],
      })
      const parsed = parseToken(plaintext)
      expect(parsed?.id).toBe(row.id)
      const read = await tokenById(db, row.id)
      expect(read?.capabilities).toEqual(['project:read', 'members:manage'])
      expect(secretMatches(parsed!.secret, read!.tokenHash)).toBe(true)
    })
  })

  it('records last use without rewriting anything else', async () => {
    await withProject(async (db, { projectId, ownerId }) => {
      const id = randomUUID()
      const minted = mintToken(id)
      const row = await createToken(db, {
        id,
        userId: ownerId,
        projectId,
        name: 'ci',
        tokenHash: minted.tokenHash,
        capabilities: ['project:read'],
        expiresAt: tomorrow(),
      })
      await touchToken(db, row.id)
      const read = await tokenById(db, row.id)
      expect(read?.lastUsedAt).not.toBeNull()
      expect(read?.tokenHash).toBe(minted.tokenHash)
      expect(read?.revokedAt).toBeNull()
      expect(read?.capabilities).toEqual(['project:read'])
    })
  })
})
