import { eq } from 'drizzle-orm'
import { iamRegistrations, privacyAssessments, projects, type Db } from '../db/index.js'
import type {
  IamRegistrationRow,
  PrivacyAssessmentRow,
  RegistrationEnvironment,
} from './records.js'

/**
 * A registration DRAFT, as the launch path plan's Task 10 will store one — written straight to
 * the row, because until Task 10 lands nothing generates a package, and a submission refuses a
 * record that has none (`LAUNCH_DRAFT_REQUIRED`). The package here is a PLACEHOLDER: the
 * submission reads only that one exists, and Task 10 owns its shape.
 *
 * **A draft is not a registration**: `registered_attributes` is left to its default, `[]`, and
 * `registered_at` null — UBC has registered nothing — so the build's attribute check must ignore
 * it (Review Focus 1). `attributes` is what the draft would ASK for.
 */
export async function withDraft(
  db: Db,
  input: {
    projectId: string
    environment: RegistrationEnvironment
    attributes?: string[]
    /** When the draft was made — a test of `sentAt`'s lower bound backdates it. */
    createdAt?: Date
  },
): Promise<IamRegistrationRow> {
  const [project] = await db
    .select({ slug: projects.slug })
    .from(projects)
    .where(eq(projects.id, input.projectId))
  if (project === undefined) throw new Error(`no project '${input.projectId}'`)
  const host =
    input.environment === 'production'
      ? `${project.slug}.manifest.internal`
      : `${project.slug}.staging.manifest.internal`
  const [row] = await db
    .insert(iamRegistrations)
    .values({
      projectId: input.projectId,
      environmentKind: input.environment,
      entityId: `https://manifest.internal/sp/${project.slug}/${input.environment}`,
      acsUrl: `https://${host}/auth/ubcshib/callback`,
      sloUrl: `https://${host}/auth/logout`,
      state: 'draft',
      generatedPackage: {
        placeholder: 'the launch path plan’s Task 10 renders the package',
        attributes: input.attributes ?? ['ubcEduCwlPuid', 'mail'],
      },
      ...(input.createdAt === undefined
        ? {}
        : { createdAt: input.createdAt, updatedAt: input.createdAt }),
    })
    .returning()
  return row!
}

/** The privacy assessment's draft, the same way — Task 11 owns its shape. */
export async function withAssessmentDraft(
  db: Db,
  input: { projectId: string; createdAt?: Date },
): Promise<PrivacyAssessmentRow> {
  const [row] = await db
    .insert(privacyAssessments)
    .values({
      projectId: input.projectId,
      state: 'draft',
      generatedDraft: { placeholder: 'the launch path plan’s Task 11 renders the draft' },
      ...(input.createdAt === undefined
        ? {}
        : { createdAt: input.createdAt, updatedAt: input.createdAt }),
    })
    .returning()
  return row!
}

/** Today's date in Vancouver, `YYYY-MM-DD` — the day a person would say they sent something. */
export function vancouverToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Vancouver' }).format(now)
}

/** `days` before today in Vancouver, `YYYY-MM-DD`. */
export function vancouverDaysAgo(days: number): string {
  return vancouverToday(new Date(Date.now() - days * 86_400_000))
}
