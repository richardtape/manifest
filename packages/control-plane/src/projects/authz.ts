import { and, eq } from 'drizzle-orm'
import type { Db } from '../db/index.js'
import { projectMembers, projects } from '../db/index.js'

export type ProjectRole = 'owner' | 'collaborator'

/**
 * Every capability a ROLE can hold, as a value — and `Capability` is derived from it,
 * the way `EventType` is derived from `EVENT_TYPES` (`observability/events.ts`).
 *
 * A LIST rather than a bare union since P5b Task 4, because the mint route's request
 * schema has to name them: a `capabilities: string[]` on the wire would accept a typo
 * and mint a token that can do nothing, with nothing saying so. One list keeps the
 * document, the validator and the type from drifting — deriving the type from the array
 * means a member added to one is added to all three.
 */
export const CAPABILITIES = [
  'project:read',
  'project:write',
  'project:delete',
  'members:manage',
  'build:create',
  'release:create',
  'release:deploy',
  /**
   * §13 and D24: putting a release in front of real students, as distinct from
   * deploying it to staging. Separate from `release:deploy` because D24 forbids
   * exactly this one to a delegated token and permits the other — one capability
   * covering both would make the rule unstatable (P5b `[M2]`).
   */
  'release:promote',
  'release:approve',
  'quota:set',
] as const

export type Capability = (typeof CAPABILITIES)[number]

/**
 * D24's forbidden set, which is §20's step-up set — a SUPERSET of `Capability`.
 *
 * `secret:read` is in D24's list and deliberately NOT in `Capability`: no route reads a
 * secret in Phase 1 (P5b Decision 14), and adding it to the union would create a
 * capability nothing grants and nothing checks, which is the no-caller shape ORIENTATION
 * §9 names four times (measured as P5b `[M8]`). D24's list is a statement about the
 * SPEC; `Capability` is a statement about the routes that exist. The superset is what
 * lets `privileged.test.ts` hold the two against each other.
 */
export const PRIVILEGED_CAPABILITIES = [...CAPABILITIES, 'secret:read'] as const

export type PrivilegedCapability = (typeof PRIVILEGED_CAPABILITIES)[number]

/**
 * D24's four, and §20's step-up four. ONE list, because the spec says keeping the two
 * aligned is a test rather than a convention — `privileged.test.ts` is that test.
 *
 * A delegated token may NEVER hold one of these, however it was minted (P5b Task 6).
 * Step-up re-authentication for an interactive session is deferred (Rich, R1) and is
 * owed by the plan that adds the routes it would protect.
 */
export const PRIVILEGED: ReadonlySet<PrivilegedCapability> = new Set([
  'release:promote',
  'secret:read',
  'quota:set',
  'members:manage',
])

export function isPrivileged(capability: PrivilegedCapability): boolean {
  return PRIVILEGED.has(capability)
}

/** Who is asking. Carried from the session; never read from the request body. */
export interface Actor {
  userId: string
  platformRole: 'admin' | 'member'
}

const OWNER: readonly Capability[] = [
  'project:read',
  'project:write',
  'project:delete',
  'members:manage',
  'build:create',
  'release:create',
  'release:deploy',
  'release:promote',
]

// §13: "same as owner except member management and deletion" — and not promotion,
// which is the owner's decision about their own students (D24, P5b Task 2).
const COLLABORATOR: readonly Capability[] = OWNER.filter(
  (cap) =>
    cap !== 'members:manage' && cap !== 'project:delete' && cap !== 'release:promote',
)

// §13: the platform admin approves releases, sets quotas, and sees the whole fleet.
const PLATFORM_ADMIN: readonly Capability[] = [...OWNER, 'release:approve', 'quota:set']

export function capabilitiesFor(
  projectRole: ProjectRole | null,
  platformRole: 'admin' | 'member',
): ReadonlySet<Capability> {
  if (platformRole === 'admin') return new Set(PLATFORM_ADMIN)
  if (projectRole === 'owner') return new Set(OWNER)
  if (projectRole === 'collaborator') return new Set(COLLABORATOR)
  return new Set()
}

export class AuthorizationError extends Error {
  constructor(
    readonly code: 'FORBIDDEN' | 'NOT_FOUND',
    message: string,
  ) {
    super(message)
    this.name = 'AuthorizationError'
  }
}

export async function membershipOf(
  db: Db,
  userId: string,
  projectId: string,
): Promise<ProjectRole | null> {
  const [row] = await db
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(
      and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)),
    )
  return row?.role ?? null
}

/**
 * Throws NOT_FOUND when the actor has no business knowing the project exists, and
 * FORBIDDEN when they are a member who lacks this particular capability.
 *
 * The distinction is deliberate: answering FORBIDDEN to a stranger confirms the
 * project exists and turns the id space into an enumeration oracle across tenants.
 */
export async function assertCapability(
  db: Db,
  actor: Actor,
  projectId: string,
  capability: Capability,
): Promise<void> {
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId))
  if (!project) {
    throw new AuthorizationError('NOT_FOUND', `no project '${projectId}'`)
  }

  const projectRole =
    actor.platformRole === 'admin'
      ? null
      : await membershipOf(db, actor.userId, projectId)
  if (actor.platformRole !== 'admin' && projectRole === null) {
    throw new AuthorizationError('NOT_FOUND', `no project '${projectId}'`)
  }

  if (!capabilitiesFor(projectRole, actor.platformRole).has(capability)) {
    throw new AuthorizationError(
      'FORBIDDEN',
      `role '${projectRole ?? actor.platformRole}' may not '${capability}'`,
    )
  }
}
