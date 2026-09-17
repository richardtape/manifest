import { desc, eq, inArray } from 'drizzle-orm'
import type { Db } from '../db/index.js'
import {
  environments,
  instances,
  projectMembers,
  projects,
  routes,
  users,
} from '../db/index.js'
import { type Config, hostnameFor } from '../config.js'
import type { Actor, ProjectRole } from './authz.js'
import type { ReservedLabels } from './reserved-labels.js'
import { assertSlugAvailable, SlugRefusedError, slugTaken } from './slugs.js'

export type Project = typeof projects.$inferSelect
export type Environment = typeof environments.$inferSelect

const ENVIRONMENT_KINDS = ['sandbox', 'staging', 'production'] as const

/** Postgres `unique_violation`. */
const UNIQUE_VIOLATION = '23505'

/**
 * `projects.audience` as it is stored — snake_case, like every other jsonb column (§24,
 * D29). Asked of a human at creation (P5a Task 11).
 */
export interface StoredAudience {
  scale: 'solo' | 'class' | 'large_course' | 'public'
  burst: 'steady' | 'synchronised'
  justification: string | null
  /** §24: "recorded with actor and timestamp on the project". */
  set_by: string
  set_at: string
}

export interface CreateProjectInput {
  slug: string
  ownerId: string
  blueprintRef: string
  /** §25: the starter the first commit is seeded from; null for the skeleton alone. */
  starter: string | null
  audience: StoredAudience
}

/**
 * §23: the slug is checked by THE one function the slug check API answers from
 * (`checkSlug`, P5a Task 9), before anything is written — so creation cannot accept a
 * name the check refused, or refuse one it accepted. §23 depends on this holding:
 * "nothing free-text reaches a hostname".
 *
 * The project, its owner's membership and its three environments in ONE TRANSACTION (P5a
 * Decision 29), so there is never a project without an owner or an environment.
 */
export async function createProject(
  db: Db,
  config: Config,
  reserved: ReservedLabels,
  input: CreateProjectInput,
): Promise<{ project: Project; environments: Environment[] }> {
  await assertSlugAvailable(db, reserved, input.slug)

  return db.transaction(async (tx) => {
    const [project] = await tx
      .insert(projects)
      .values({
        slug: input.slug,
        ownerId: input.ownerId,
        blueprintRef: input.blueprintRef,
        starter: input.starter,
        audience: input.audience,
      })
      .returning()
      .catch((error: unknown) => {
        // The slug is unique and it is also the first label of three hostnames
        // (§23), so "that name is taken" is a normal answer, not a fault. Drizzle
        // wraps the driver error; the pg code is on the `cause`.
        // This is the race between the check above and this insert, and it answers what
        // the check would have: the same code, the same sentence.
        const cause = (error as { cause?: { code?: string } }).cause
        if (cause?.code === UNIQUE_VIOLATION)
          throw new SlugRefusedError(slugTaken(input.slug))
        throw error
      })
    if (!project) throw new Error('project insert returned no row')

    await tx.insert(projectMembers).values({
      projectId: project.id,
      userId: input.ownerId,
      role: 'owner',
    })

    // All three exist from the moment the project does. §23 requires the production
    // canonical hostname to be permanent, and §13 requires LaunchReadiness to be
    // visible "the moment a project is created", not at first deploy.
    const created = await tx
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
  })
}

/**
 * Removes a project that never got a repository (P5a Decision 29) — and ONLY such a
 * project: creation calls it before any event is recorded, and `audit.events` RESTRICTs
 * the delete of a project that has one, which is the refusal this relies on never meeting.
 * Its membership and environments go with it (`ON DELETE CASCADE`).
 */
export async function deleteProject(db: Db, projectId: string): Promise<void> {
  await db.delete(projects).where(eq(projects.id, projectId))
}

export async function getProject(
  db: Db,
  projectId: string,
): Promise<Project | undefined> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId))
  return project
}

export interface ProjectView {
  project: Project
  owner: { id: string; displayName: string }
}

/** Projects with their owners' names, in the order asked for. */
export async function projectViews(
  db: Db,
  projectIds: readonly string[],
): Promise<ProjectView[]> {
  if (projectIds.length === 0) return []
  const rows = await db
    .select({ project: projects, ownerId: users.id, ownerName: users.displayName })
    .from(projects)
    .innerJoin(users, eq(projects.ownerId, users.id))
    .where(inArray(projects.id, [...projectIds]))
  const byId = new Map(
    rows.map((r) => [
      r.project.id,
      { project: r.project, owner: { id: r.ownerId, displayName: r.ownerName } },
    ]),
  )
  return projectIds.flatMap((id) => byId.get(id) ?? [])
}

/**
 * The caller's memberships — for EVERY caller, administrators included (P5a Decision 20).
 * A person's own list should not change shape the day they are made an administrator;
 * the fleet is `GET /v1/fleet` (Task 16). Newest first.
 */
export async function listProjectsFor(db: Db, actor: Actor): Promise<Project[]> {
  const memberships = await db
    .select({ projectId: projectMembers.projectId })
    .from(projectMembers)
    .where(eq(projectMembers.userId, actor.userId))
  const ids = memberships.map((m) => m.projectId)
  if (ids.length === 0) return []
  return db
    .select()
    .from(projects)
    .where(inArray(projects.id, ids))
    .orderBy(desc(projects.createdAt))
}

export interface MemberRow {
  userId: string
  puid: string
  displayName: string
  email: string
  role: ProjectRole
}

/** Owners first — Postgres orders an enum by declaration — then by name. */
export async function listMembers(db: Db, projectId: string): Promise<MemberRow[]> {
  return db
    .select({
      userId: users.id,
      puid: users.ubcCwlPuid,
      displayName: users.displayName,
      email: users.email,
      role: projectMembers.role,
    })
    .from(projectMembers)
    .innerJoin(users, eq(projectMembers.userId, users.id))
    .where(eq(projectMembers.projectId, projectId))
    .orderBy(projectMembers.role, users.displayName)
}

/**
 * WHAT SERVES an environment — §6's Route record — and, for an app deployed before P4c
 * that has none, its newest instance (P4c Task 8's rule, moved here from the route so the
 * environment list and the fleet read it once).
 *
 * Not the newest deploy: a failed deploy writes a newer `instances` row, and reporting
 * that one told a faculty member their app was failed while it was serving perfectly.
 * The newest row is only the fallback for an app with no Route record, which gets one at
 * its next deploy (P4c Decision 20 — there is no backfill).
 */
export async function servingInstanceOf(
  db: Db,
  environment: Environment,
): Promise<typeof instances.$inferSelect | undefined> {
  const [served] = await db
    .select({ instance: instances })
    .from(routes)
    .innerJoin(instances, eq(routes.instanceId, instances.id))
    .where(eq(routes.hostname, environment.hostname))
    .limit(1)
  if (served !== undefined) return served.instance
  const [latest] = await db
    .select()
    .from(instances)
    .where(eq(instances.environmentId, environment.id))
    .orderBy(desc(instances.lastSeenAt))
    .limit(1)
  return latest
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

export async function listEnvironments(
  db: Db,
  projectId: string,
): Promise<Environment[]> {
  return db.select().from(environments).where(eq(environments.projectId, projectId))
}
