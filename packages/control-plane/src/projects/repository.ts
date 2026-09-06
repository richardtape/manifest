import { eq, inArray } from 'drizzle-orm'
import type { Db } from '../db/index.js'
import { environments, projectMembers, projects } from '../db/index.js'
import { type Config, hostnameFor } from '../config.js'
import type { Actor } from './authz.js'

export type Project = typeof projects.$inferSelect
export type Environment = typeof environments.$inferSelect

/**
 * §7's name rule, restated where a slug becomes a hostname. `spec/` validates the
 * name inside manifest.yaml; this validates the slug the API was handed, which is
 * a different input arriving by a different path. §23 depends on this holding:
 * "nothing free-text reaches a hostname".
 */
const SLUG = /^[a-z][a-z0-9-]{2,38}$/

const ENVIRONMENT_KINDS = ['sandbox', 'staging', 'production'] as const

export interface CreateProjectInput {
  slug: string
  ownerId: string
  blueprintRef: string
}

export async function createProject(
  db: Db,
  config: Config,
  input: CreateProjectInput,
): Promise<{ project: Project; environments: Environment[] }> {
  if (!SLUG.test(input.slug)) {
    throw new Error(
      `invalid project slug '${input.slug}' — must match ${SLUG.source} (§7)`,
    )
  }

  const [project] = await db
    .insert(projects)
    .values({ slug: input.slug, ownerId: input.ownerId, blueprintRef: input.blueprintRef })
    .returning()
  if (!project) throw new Error('project insert returned no row')

  await db.insert(projectMembers).values({
    projectId: project.id,
    userId: input.ownerId,
    role: 'owner',
  })

  // All three exist from the moment the project does. §23 requires the production
  // canonical hostname to be permanent, and §13 requires LaunchReadiness to be
  // visible "the moment a project is created", not at first deploy.
  const created = await db
    .insert(environments)
    .values(
      ENVIRONMENT_KINDS.map((kind) => ({
        projectId: project.id,
        kind,
        hostname: hostnameFor(config, kind, project.slug),
      })),
    )
    .returning()

  return { project, environments: created }
}

export async function getProject(db: Db, projectId: string): Promise<Project | undefined> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId))
  return project
}

/** A platform admin sees the whole fleet (§13); everyone else sees their memberships. */
export async function listProjectsFor(db: Db, actor: Actor): Promise<Project[]> {
  if (actor.platformRole === 'admin') return db.select().from(projects)

  const memberships = await db
    .select({ projectId: projectMembers.projectId })
    .from(projectMembers)
    .where(eq(projectMembers.userId, actor.userId))
  const ids = memberships.map((m) => m.projectId)
  if (ids.length === 0) return []
  return db.select().from(projects).where(inArray(projects.id, ids))
}

/**
 * Idempotent by conflict target, so a retried invitation updates the role rather
 * than violating the (project, user) primary key. D23.6 covers the HTTP replay; this
 * covers the same action arriving twice by any other route.
 */
export async function addMember(
  db: Db,
  projectId: string,
  userId: string,
  role: 'owner' | 'collaborator',
): Promise<void> {
  await db
    .insert(projectMembers)
    .values({ projectId, userId, role })
    .onConflictDoUpdate({
      target: [projectMembers.projectId, projectMembers.userId],
      set: { role },
    })
}

export async function listEnvironments(db: Db, projectId: string): Promise<Environment[]> {
  return db.select().from(environments).where(eq(environments.projectId, projectId))
}
