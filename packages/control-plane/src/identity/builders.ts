import { eq } from 'drizzle-orm'
import { users, type Db } from '../db/index.js'

/**
 * WHO MAY BUILD — THE ONE PREDICATE (FE-39; §9, §6, §13 and §20 as Spec action 7 amended them —
 * Rich's, confirmed 2026-09-29, Decisions 26–30 of the launch path plan).
 *
 * Manifest is for faculty, for now: a person whose LAST sign-in carried `eduPersonAffiliation`
 * `faculty`, or a platform administrator, may create a project, start an intake session, or be
 * added to a project. Everyone else who signs in is told it is not open to them yet. **No client
 * re-derives this** — `Me.mayBuild` answers it, and the three refusals call it.
 *
 * **Exactly `faculty`** (Decision 30, Rich's *"literally just those with 'faculty' as their
 * affiliation"*): no case-folding, no trimming and no setting. A sessional lecturer or an
 * instructor UBC marks `staff` may not build until an administrator's PUID list names them or this
 * rule changes. *TAs later* is a change to this one function.
 *
 * Authorization stays Manifest's: the attribute is one fact it decides from, and it is UBC's
 * CURRENT fact, written at every sign-in (`identity/saml.ts`'s `upsertUserFromAssertion`).
 */
export const BUILDER_AFFILIATION = 'faculty'

export function mayBuild(user: {
  role: 'admin' | 'member'
  affiliations: readonly string[]
}): boolean {
  return user.role === 'admin' || user.affiliations.includes(BUILDER_AFFILIATION)
}

/**
 * A person who may not build, refused. Two codes, one family, the status from the registry:
 * `403 BUILDING_NOT_OPEN` — the asker may not build; and `409 MEMBER_MAY_NOT_BUILD` — the person
 * an owner named may not be added (the asker may manage members; the target refuses it).
 */
export class BuildingError extends Error {
  constructor(
    readonly code: 'BUILDING_NOT_OPEN' | 'MEMBER_MAY_NOT_BUILD',
    message: string,
    readonly hint: string,
  ) {
    super(message)
    this.name = 'BuildingError'
  }
}

/** Refuses a person who may not build — before anything is read for, or written by, the request. */
export function assertMayBuild(user: {
  role: 'admin' | 'member'
  affiliations: readonly string[]
}): void {
  if (mayBuild(user)) return
  throw new BuildingError(
    'BUILDING_NOT_OPEN',
    'building apps on Manifest is open only to faculty members for now',
    'Nothing was created. Manifest reads your CWL affiliation when you sign in, so if you are faculty, sign out and sign in again. If you still cannot build, ask a platform administrator.',
  )
}

/**
 * The signed-in person, refused unless they may build: the SESSION's role — the one every
 * authorization decision uses — and the affiliations their last sign-in wrote on their row (the
 * same sign-in that issued the session). Called by `createProject` and `startIntakeSession` first.
 */
export async function assertSignedInMayBuild(
  db: Db,
  person: { userId: string; platformRole: 'admin' | 'member' },
): Promise<void> {
  const [row] = await db
    .select({ affiliations: users.affiliations })
    .from(users)
    .where(eq(users.id, person.userId))
  assertMayBuild({ role: person.platformRole, affiliations: row?.affiliations ?? [] })
}

/**
 * The refusal for adding a person who may not build to a project, naming them by the name people
 * read — never by PUID. A person ALREADY on the project is not added, so this is answered only for
 * one who is not (Decision 29: a person who stops being faculty keeps the projects they are on) —
 * which `projects/`'s `addMember` decides under the project's lock, from `mayBuild` of the person.
 */
export function memberMayNotBuild(person: { displayName: string }): BuildingError {
  const name =
    person.displayName.trim() === '' ? 'This person' : person.displayName.trim()
  return new BuildingError(
    'MEMBER_MAY_NOT_BUILD',
    `${name} cannot be added: building apps on Manifest is open only to faculty members for now`,
    'Add a faculty colleague instead. Nobody was added.',
  )
}
