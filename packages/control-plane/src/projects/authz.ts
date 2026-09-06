import { and, eq } from 'drizzle-orm'
import type { Db } from '../db/index.js'
import { projectMembers, projects } from '../db/index.js'

export type ProjectRole = 'owner' | 'collaborator'

export type Capability =
  | 'project:read'
  | 'project:write'
  | 'project:delete'
  | 'members:manage'
  | 'build:create'
  | 'release:create'
  | 'release:deploy'
  | 'release:approve'
  | 'quota:set'

/** Who is asking. Carried from the session; never read from the request body. */
export interface Actor {
  userId: string
  platformRole: 'admin' | 'member'
}

const OWNER: readonly Capability[] = [
  'project:read', 'project:write', 'project:delete', 'members:manage',
  'build:create', 'release:create', 'release:deploy',
]

// §13: "same as owner except member management and deletion"
const COLLABORATOR: readonly Capability[] = OWNER.filter(
  (cap) => cap !== 'members:manage' && cap !== 'project:delete',
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
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
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
  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId))
  if (!project) {
    throw new AuthorizationError('NOT_FOUND', `no project '${projectId}'`)
  }

  const projectRole = actor.platformRole === 'admin' ? null : await membershipOf(db, actor.userId, projectId)
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
