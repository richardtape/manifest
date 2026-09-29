import { and, desc, eq, gt, inArray, ne, or, sql } from 'drizzle-orm'
import type { Db } from '../db/index.js'
import {
  environments,
  instances,
  projectMembers,
  projects,
  routes,
  sourceRepositories,
  users,
} from '../db/index.js'
import type {
  PublishedRepositoryLink,
  RepositoryVisibility,
  SourceDriver,
} from '../source/index.js'
import { type Config, hostnameFor } from '../config.js'
import type { Actor, ProjectRole } from './authz.js'
import type { ReservedLabels } from './reserved-labels.js'
import { assertSlugAvailable, SlugRefusedError, slugTaken } from './slugs.js'
import { linkOf, notMadeByRunning } from './source-repositories.js'

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
  /**
   * What people call it (§6; the front-end enablement plan's Task 6, Decision 13) — THE SLUG WHEN
   * NONE IS GIVEN, and this is the one place that rule is stated: every creation path comes here.
   */
  name?: string
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
        name: input.name ?? input.slug,
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

/**
 * WHAT PEOPLE CALL A PROJECT, CHANGED (the front-end enablement plan's Task 6, Decision 13) — and
 * nothing else: the slug, and every hostname, SP entity, Docker name and repository derived from
 * it, never moves. Answers the name it HAD, so the caller publishes `project.renamed` only for a
 * change — or `undefined` when there is no such project. The row is locked while it is read and
 * written, so two renames racing each record the name the other left, never the same `from`.
 */
export async function renameProject(
  db: Db,
  projectId: string,
  name: string,
): Promise<{ from: string } | undefined> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ name: projects.name })
      .from(projects)
      .where(eq(projects.id, projectId))
      .for('update')
    if (row === undefined) return undefined
    if (row.name !== name) {
      await tx.update(projects).set({ name }).where(eq(projects.id, projectId))
    }
    return { from: row.name }
  })
}

export async function getProject(
  db: Db,
  projectId: string,
): Promise<Project | undefined> {
  // A deleted project is ABSENT (§11, Decision 31): a tombstone for the audit trail, read by nobody.
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), ne(projects.state, 'deleted')))
  return project
}

export interface ProjectView {
  project: Project
  owner: { id: string; displayName: string }
  /**
   * Where its code lives, and whether `main` is protected there (the D5 plan's Task 12) — and
   * what Manifest last read of its visibility there (the authoring API plan's Task 12).
   */
  repository: PublishedRepositoryLink & { visibility: RepositoryVisibility | null }
}

/**
 * Projects with their owners' names and their repository links, in the order asked for.
 *
 * **A project with no `source_repositories` row is a platform defect** — every project has one
 * since migration 0024 — so it is THROWN, naming the project (a `500` and an operator line),
 * never answered without a link: `Project.repository` is required, and a client told nothing
 * about where the code lives would be told something false by omission.
 */
export async function projectViews(
  deps: {
    db: Db
    source: Pick<SourceDriver, 'identity' | 'repositoryFor' | 'lastVisibility'>
  },
  projectIds: readonly string[],
): Promise<ProjectView[]> {
  if (projectIds.length === 0) return []
  const { db, source } = deps
  const rows = await db
    .select({
      project: projects,
      ownerId: users.id,
      ownerName: users.displayName,
      repository: sourceRepositories,
    })
    .from(projects)
    .innerJoin(users, eq(projects.ownerId, users.id))
    .leftJoin(sourceRepositories, eq(sourceRepositories.projectId, projects.id))
    // A deleted project is absent from every view (Decision 31), as from `getProject`.
    .where(and(inArray(projects.id, [...projectIds]), ne(projects.state, 'deleted')))
  const byId = new Map(
    await Promise.all(
      rows.map(async (r): Promise<[string, ProjectView]> => {
        if (r.repository === null) {
          throw new Error(
            `project '${r.project.slug}' (${r.project.id}) has no source_repositories row; every project has one since migration 0024`,
          )
        }
        const link = linkOf(r.repository)
        return [
          r.project.id,
          {
            project: r.project,
            owner: { id: r.ownerId, displayName: r.ownerName },
            // The running driver's last read, from this machine — never the network. A project
            // ANOTHER driver made is not this driver's to read (Decision 3): `null` — nor one
            // another GitHub made, whose mirror is not this GitHub's (the launch path plan's Task 2).
            repository: {
              ...link,
              visibility:
                notMadeByRunning(r.repository, source.identity()) === null
                  ? await source.lastVisibility(source.repositoryFor(r.project.slug))
                  : null,
            },
          },
        ]
      }),
    ),
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
    .where(and(inArray(projects.id, ids), ne(projects.state, 'deleted')))
    .orderBy(desc(projects.createdAt))
}

export interface MemberRow {
  userId: string
  puid: string
  /** Their CWL login name, from `uid` at sign-in; null if no assertion ever carried it (Task 7). */
  cwlLogin: string | null
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
      cwlLogin: users.cwlLogin,
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
  db: Pick<Db, 'select'>,
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
 * An environment's instances, the one seen most recently first — at most `limit`, and
 * whether there were more (the front-end enablement plan's Task 3, `listInstances`). A
 * failed instance stays listed after it is replaced: it is what an agent reads to learn why.
 * `id` breaks ties, so a page never reorders between two reads.
 */
export async function instancesOf(
  db: Db,
  environment: Environment,
  limit: number,
): Promise<{ rows: (typeof instances.$inferSelect)[]; truncated: boolean }> {
  const rows = await db
    .select()
    .from(instances)
    .where(eq(instances.environmentId, environment.id))
    .orderBy(sql`${instances.lastSeenAt} desc nulls last`, instances.id)
    .limit(limit + 1)
  return { rows: rows.slice(0, limit), truncated: rows.length > limit }
}

/**
 * Idempotent by conflict target, so a retried invitation updates the role rather
 * than violating the (project, user) primary key. D23.6 covers the HTTP replay; this
 * covers the same action arriving twice by any other route.
 *
 * **Answers the role they HAD** — null when they were not a member — so the route publishes
 * `member.added` only for a change (the front-end enablement plan's Task 7) — or `'last owner'`,
 * changing nothing, when it would make the project's only owner a collaborator. The project's row
 * is locked for the read and the write, so two additions of one person racing each read what
 * the other wrote, and only one of them reads "not a member".
 */
export async function addMember(
  db: Db,
  projectId: string,
  userId: string,
  role: 'owner' | 'collaborator',
): Promise<{ previousRole: ProjectRole | null } | 'last owner'> {
  return db.transaction(async (tx) => {
    await tx
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .for('update')
    const [before] = await tx
      .select({ role: projectMembers.role })
      .from(projectMembers)
      .where(
        and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)),
      )
    // The LAST OWNER stays one — `removeMember`'s rule, which a demotion would otherwise route
    // around (the review's I2). Counted under the project's lock, so two demotions racing
    // cannot each see the other still an owner.
    if (before?.role === 'owner' && role !== 'owner') {
      const [counted] = await tx
        .select({ owners: sql<number>`count(*)::int` })
        .from(projectMembers)
        .where(
          and(eq(projectMembers.projectId, projectId), eq(projectMembers.role, 'owner')),
        )
      if ((counted?.owners ?? 0) <= 1) return 'last owner'
    }
    await tx
      .insert(projectMembers)
      .values({ projectId, userId, role })
      .onConflictDoUpdate({
        target: [projectMembers.projectId, projectMembers.userId],
        set: { role },
      })
    return { previousRole: before?.role ?? null }
  })
}

/**
 * THE PERSON AN OWNER NAMES, by exactly one key (the front-end enablement plan's Task 7, Decision
 * 14): their PUID exactly; their CWL login name, lowercased, against the stored lowercased login;
 * or their email, case-insensitively — where two people sharing one address is `ambiguous`,
 * never a guess. A lookup of ONE name the owner already knows, never a search: nothing here
 * lists who has signed in.
 */
export async function findPerson(
  db: Db,
  key: { puid: string } | { cwlLogin: string } | { email: string },
): Promise<
  | { kind: 'found'; user: typeof users.$inferSelect }
  | { kind: 'nobody' }
  | { kind: 'ambiguous' }
> {
  const where =
    'puid' in key
      ? eq(users.ubcCwlPuid, key.puid)
      : 'cwlLogin' in key
        ? eq(users.cwlLogin, key.cwlLogin.toLowerCase())
        : sql`lower(${users.email}) = lower(${key.email})`
  const rows = await db.select().from(users).where(where).limit(2)
  if (rows.length === 0) return { kind: 'nobody' }
  if (rows.length > 1) return { kind: 'ambiguous' }
  return { kind: 'found', user: rows[0]! }
}

/**
 * Take a person off a project — §13's other half of `addMember`, and D24's fourth
 * privileged action to become reachable (P5b Task 8).
 *
 * **IDEMPOTENT, like `addMember`.** Removing somebody who is not a member changes nothing
 * and reports the same thing, because a caller who reaches this line holds
 * `members:manage` and can already read the membership — so a refusal would hide nothing
 * and would turn a repeated click, or two administrators acting at once, into an error for
 * an action that achieved its goal. The asymmetry with `revokeToken`, which DOES let its
 * route answer `404`, is deliberate: there the `404` hides which token ids exist from
 * somebody who may not see them.
 *
 * **It refuses to remove the last owner** — the caller sees `PROJECT_LAST_OWNER`. A
 * project with no owner is one nobody can grant access to, delete or deploy, and §13 has
 * no route back: the row would have to be repaired in the database. The count and the
 * delete are one statement so two removals racing cannot each see the other's owner.
 */
export async function removeMember(
  db: Db,
  projectId: string,
  userId: string,
): Promise<'removed' | 'not a member' | 'last owner'> {
  const [target] = await db
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(
      and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)),
    )
  if (target === undefined) return 'not a member'
  const [deleted] = await db
    .delete(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId),
        /**
         * THE GUARD IS IN THE DELETE, not in the read above — the same shape as
         * `resolveAction`'s `state = 'pending'` clause, and for the same reason (sitting
         * 5's F9). Two owners removing each other at the same moment would both pass a
         * read-then-delete and leave the project with none; here the second `DELETE`
         * matches no row, because the subquery counts what the first has already removed.
         */
        or(
          ne(projectMembers.role, 'owner'),
          gt(
            sql`(select count(*) from ${projectMembers} m where m.project_id = ${projectId} and m.role = 'owner')`,
            sql`1`,
          ),
        ),
      ),
    )
    .returning({ userId: projectMembers.userId })
  return deleted === undefined ? 'last owner' : 'removed'
}

export async function listEnvironments(
  db: Db,
  projectId: string,
): Promise<Environment[]> {
  return db.select().from(environments).where(eq(environments.projectId, projectId))
}
