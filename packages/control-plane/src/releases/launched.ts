import { and, eq, isNull } from 'drizzle-orm'
import { projects, type Db } from '../db/index.js'
import { makeRedactor, publishEvent, type EventBus } from '../observability/index.js'

/**
 * When this project first went to production, or `null` while it has not (P6b Decision 1).
 *
 * **Callers:** `runRehearsal` (a launched project is not rehearsed — Decision 16) and
 * `deployRelease` (the same refusal, a second read), and from Task 5 the approval rule
 * D9's two clauses turn on.
 */
export async function launchedAt(db: Db, projectId: string): Promise<Date | null> {
  const [row] = await db
    .select({ launchedAt: projects.launchedAt })
    .from(projects)
    .where(eq(projects.id, projectId))
  return row?.launchedAt ?? null
}

export interface RecordLaunchInput {
  projectId: string
  releaseId: string
  instanceId: string
  imageDigest: string
  slug: string
}

/**
 * §13 D9: THE LAUNCH, RECORDED ONCE, BY THE DEPLOY THAT MAKES IT TRUE (P6b Decision 1).
 * True when THIS call recorded it; false when the project had already launched.
 *
 * **Caller:** `deployRelease`, in its healthy branch, for a production deploy whose
 * purpose is `launch` — never a rehearsal, whose instance serves production too.
 */
export async function recordLaunch(
  db: Db,
  bus: EventBus,
  input: RecordLaunchInput,
): Promise<boolean> {
  // ONCE, BY THE WHERE CLAUSE — not by a read-then-write, which two deploys racing on one
  // project would both pass (P5b sitting 7's F2: a pooled race is observable only warm).
  const [row] = await db
    .update(projects)
    .set({ launchedAt: new Date() })
    .where(and(eq(projects.id, input.projectId), isNull(projects.launchedAt)))
    .returning({ id: projects.id })
  if (row === undefined) return false
  // THE DIGEST, TRUNCATED, as `release.approved` carries it: enough to recognise, and never
  // mistaken for the binding itself. Nothing here is secret, so the redactor is empty.
  await publishEvent(
    db,
    bus,
    {
      projectId: input.projectId,
      subject: `project:${input.projectId}`,
      type: 'project.launched',
      machineDetail: {
        releaseId: input.releaseId,
        instanceId: input.instanceId,
        imageDigest: input.imageDigest.slice(0, 19),
      },
      humanMessage: `${input.slug} launched: it is in production for the first time (§13).`,
    },
    makeRedactor([]),
  )
  return true
}
