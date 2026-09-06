import { eq } from 'drizzle-orm'
import type { Db } from '../db/index.js'
import { users } from '../db/index.js'
import { type Session, issueSession } from './session.js'

/**
 * TEMPORARY (roadmap gap 3). P4 replaces this with real CWL against the Manifest
 * IdP and carries an explicit task to delete this file. Two safeguards keep it
 * from surviving quietly: config.ts refuses to start with it enabled outside
 * development, and a test asserts that refusal.
 *
 * The test identities are §9's `bio_prof` and `bio_student`, plus two the
 * authorization contract suite needs and §9 does not name: a platform admin, and
 * an unrelated user who is a member of nothing. §16's tier is "owner, collaborator,
 * unrelated user, and admin" — four distinct actors, so four distinct identities.
 * Reusing one identity for two tiers is how a suite comes to assert nothing.
 */
export const DEV_USERS = Object.freeze([
  {
    puid: 'bio_prof',
    email: 'bio_prof@example.ubc.ca',
    displayName: 'Bio Prof',
    role: 'member',
  },
  {
    puid: 'bio_student',
    email: 'bio_student@example.ubc.ca',
    displayName: 'Bio Student',
    role: 'member',
  },
  {
    puid: 'unrelated_user',
    email: 'unrelated_user@example.ubc.ca',
    displayName: 'Unrelated User',
    role: 'member',
  },
  {
    puid: 'platform_admin',
    email: 'platform_admin@example.ubc.ca',
    displayName: 'Platform Admin',
    role: 'admin',
  },
] as const)

export class DevAuthDisabledError extends Error {
  readonly code = 'DEV_AUTH_DISABLED'
  constructor() {
    super('the dev auth shim is disabled; set MANIFEST_DEV_AUTH=1 in development')
    this.name = 'DevAuthDisabledError'
  }
}

export class UnknownDevUserError extends Error {
  readonly code = 'DEV_AUTH_UNKNOWN_USER'
  constructor(puid: string) {
    super(
      `'${puid}' is not a seeded test user. The shim logs in a named identity, ` +
        `not an arbitrary one: ${DEV_USERS.map((u) => u.puid).join(', ')}`,
    )
    this.name = 'UnknownDevUserError'
  }
}

export type DevUser = typeof users.$inferSelect

export async function devLogin(
  db: Db,
  puid: string,
  opts: { devAuthEnabled: boolean },
  now: number = Date.now(),
): Promise<{ user: DevUser; session: Session }> {
  if (!opts.devAuthEnabled) throw new DevAuthDisabledError()

  const seed = DEV_USERS.find((candidate) => candidate.puid === puid)
  if (!seed) throw new UnknownDevUserError(puid)

  await db
    .insert(users)
    .values({
      ubcCwlPuid: seed.puid,
      email: seed.email,
      displayName: seed.displayName,
      role: seed.role,
    })
    .onConflictDoUpdate({
      target: users.ubcCwlPuid,
      set: { email: seed.email, displayName: seed.displayName, role: seed.role },
    })

  const [user] = await db.select().from(users).where(eq(users.ubcCwlPuid, seed.puid))
  if (!user) throw new Error(`dev login upserted '${seed.puid}' but could not read it back`)

  return { user, session: issueSession(user, now) }
}
