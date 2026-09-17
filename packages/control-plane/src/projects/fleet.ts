import { desc, eq, max } from 'drizzle-orm'
import {
  builds,
  environments,
  incidents,
  instances,
  projects,
  releases,
  users,
  type Db,
} from '../db/index.js'
import { servingInstanceOf, type Project, type StoredAudience } from './repository.js'
import type { ReservedLabels } from './reserved-labels.js'

export interface FleetEnvironment {
  kind: 'sandbox' | 'staging' | 'production'
  hostname: string
  state: string | null
  releaseId: string | null
  imageDigest: string | null
  lastDeployAt: string | null
  latestIncidentAt: string | null
}

export interface FleetEntry {
  project: Project
  owner: { id: string; displayName: string; email: string }
  audience: StoredAudience | null
  /** §23: a project holding a label reserved after it was created — reported, never renamed. */
  slugReserved: boolean
  environments: FleetEnvironment[]
}

/**
 * §26's *Fleet* screen, with the columns that exist today (P5a Decision 21): owner,
 * environments and their state, current release digest, audience, last deploy, newest
 * Incident. AI spend and department are not built; the document says so.
 */
export async function listFleet(db: Db, reserved: ReservedLabels): Promise<FleetEntry[]> {
  const rows = await db
    .select({
      project: projects,
      owner: { id: users.id, displayName: users.displayName, email: users.email },
    })
    .from(projects)
    .innerJoin(users, eq(projects.ownerId, users.id))
    .orderBy(desc(projects.createdAt))
  const entries: FleetEntry[] = []
  for (const row of rows) {
    const envs = await db
      .select()
      .from(environments)
      .where(eq(environments.projectId, row.project.id))
    const fleetEnvs: FleetEnvironment[] = []
    for (const env of envs.sort((a, b) => a.kind.localeCompare(b.kind))) {
      // The SERVING instance, not the newest row: a failed deploy writes a newer one, and
      // reporting that told a faculty member their app was failed while it served
      // perfectly (P4c Decision 20).
      const serving = await servingInstanceOf(db, env)
      const [digest] =
        serving === undefined
          ? []
          : await db
              .select({ imageDigest: builds.imageDigest })
              .from(releases)
              .innerJoin(builds, eq(releases.buildId, builds.id))
              .where(eq(releases.id, serving.releaseId))
      const [last] = await db
        .select({ at: max(instances.lastSeenAt) })
        .from(instances)
        .where(eq(instances.environmentId, env.id))
      const [incident] = await db
        .select({ at: max(incidents.createdAt) })
        .from(incidents)
        .innerJoin(instances, eq(incidents.instanceId, instances.id))
        .where(eq(instances.environmentId, env.id))
      fleetEnvs.push({
        kind: env.kind,
        hostname: env.hostname,
        state: serving?.state ?? null,
        releaseId: serving?.releaseId ?? null,
        imageDigest: digest?.imageDigest ?? null,
        lastDeployAt: last?.at?.toISOString() ?? null,
        latestIncidentAt: incident?.at?.toISOString() ?? null,
      })
    }
    entries.push({
      project: row.project,
      owner: row.owner,
      audience: row.project.audience as StoredAudience | null,
      slugReserved: reserved.lookup(row.project.slug) !== undefined,
      environments: fleetEnvs,
    })
  }
  return entries
}
