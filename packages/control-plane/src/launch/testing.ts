import { randomBytes } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import {
  appSpecs,
  builds,
  environments,
  iamRegistrations,
  instances,
  privacyAssessments,
  projects,
  releases,
  routes,
  type Db,
} from '../db/index.js'
import { manifestSchema } from '../spec/index.js'
import { mintSpKeypair, publicHalf, type SpCertificate } from '../sso/index.js'
import { assembleAssessment } from './assessment.js'
import { assemblePackage } from './package.js'
import type {
  IamRegistrationRow,
  PrivacyAssessmentRow,
  RegistrationEnvironment,
} from './records.js'

/**
 * The fixture certificate every `withDraft` package carries — minted ONCE per test process: an
 * RSA-4096 mint costs ~0.2–0.5 s, and a package's certificate is not what these drafts are about
 * (`api/launch.test.ts` drafts through the route, with the environment's own).
 */
let fixtureCertificate: Promise<SpCertificate> | undefined
const certificateOnce = () =>
  (fixtureCertificate ??= mintSpKeypair({
    projectId: '',
    environmentKind: 'staging',
    slug: 'draft-fixture',
    entityId: 'https://manifest.internal/sp/draft-fixture/staging',
  }).then(publicHalf))

/**
 * A registration DRAFT, written straight to the row in the shape `draftIamRegistration` stores
 * (the launch path plan's Task 10, which replaced Task 9's placeholder) — for the tests whose subject
 * is what a draft's EXISTENCE does (a submission, the checklist), not how one is generated.
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
    /** When the record was first written — a test of `sentAt`'s lower bound backdates it. */
    createdAt?: Date
    /** When this package was generated: `createdAt` when absent, as for a first draft. */
    generatedAt?: Date
    /** Where the draft says the app signs people in and out, when a case needs another. */
    acsUrl?: string
    sloUrl?: string
  },
): Promise<IamRegistrationRow> {
  // The PIA number a draft made NOW carries, as `draftIamRegistration` reads it: the approved
  // assessment's reference, else none (Task 10's review, I2).
  const [pia] = await db
    .select()
    .from(privacyAssessments)
    .where(eq(privacyAssessments.projectId, input.projectId))
  const [project] = await db
    .select({ slug: projects.slug })
    .from(projects)
    .where(eq(projects.id, input.projectId))
  if (project === undefined) throw new Error(`no project '${input.projectId}'`)
  const host =
    input.environment === 'production'
      ? `${project.slug}.manifest.internal`
      : `${project.slug}.staging.manifest.internal`
  const entity = {
    entityId: `https://manifest.internal/sp/${project.slug}/${input.environment}`,
    acsUrl: input.acsUrl ?? `https://${host}/auth/ubcshib/callback`,
    sloUrl: input.sloUrl ?? `https://${host}/auth/logout`,
    attributes: input.attributes ?? ['ubcEduCwlPuid', 'mail'],
  }
  const generatedPackage = assemblePackage({
    environment: input.environment,
    generatedAt: input.generatedAt ?? input.createdAt ?? new Date(),
    fromCommit: 'f'.repeat(40),
    entity,
    certificate: await certificateOnce(),
    uses: Object.fromEntries(
      entity.attributes.map((name) => [name, [{ path: 'server.js', line: 1 }]]),
    ),
    usedAtTruncated: false,
    contacts: { technical: [], support: [] },
    privacyAssessmentReference: pia?.state === 'approved' ? pia.externalTicketRef : null,
    warnings: [],
  })
  // DRAFTED AGAIN when the record exists — the package replaced, the row's first day kept — as a
  // person drafts again after the assessment is approved.
  const [row] = await db
    .insert(iamRegistrations)
    .values({
      projectId: input.projectId,
      environmentKind: input.environment,
      entityId: entity.entityId,
      acsUrl: entity.acsUrl,
      sloUrl: entity.sloUrl,
      state: 'draft',
      generatedPackage,
      ...(input.createdAt === undefined
        ? {}
        : { createdAt: input.createdAt, updatedAt: input.createdAt }),
    })
    .onConflictDoUpdate({
      target: [iamRegistrations.projectId, iamRegistrations.environmentKind],
      set: { generatedPackage, updatedAt: new Date() },
    })
    .returning()
  return row!
}

/**
 * The privacy assessment's DRAFT, the same way: written straight to the row in the shape
 * `draftPrivacyAssessment` stores (the launch path plan's Task 11, which replaced Task 9's
 * placeholder) — for the tests whose subject is what a draft's existence does, not how one is made.
 */
export async function withAssessmentDraft(
  db: Db,
  input: {
    projectId: string
    /** When the record was first written — a test of `sentAt`'s lower bound backdates it. */
    createdAt?: Date
    /** When this draft was generated: `createdAt` when absent, as for a first draft. */
    generatedAt?: Date
  },
): Promise<PrivacyAssessmentRow> {
  const [project] = await db
    .select({ slug: projects.slug, name: projects.name })
    .from(projects)
    .where(eq(projects.id, input.projectId))
  if (project === undefined) throw new Error(`no project '${input.projectId}'`)
  const generatedDraft = assembleAssessment({
    generatedAt: input.generatedAt ?? input.createdAt ?? new Date(),
    fromCommit: 'f'.repeat(40),
    spec: manifestSchema.parse({
      manifest: 1,
      name: project.slug,
      blueprint: 'fixture-node@1',
      runtime: { port: 3000 },
    }),
    declared: { retention: false, classification: false },
    project: { slug: project.slug, name: project.name },
    members: [],
    platformContacts: [],
    catalogue: [],
    runtime: 'fake',
    repository: { provider: 'local' },
    warnings: [],
  })
  // DRAFTED AGAIN when the record exists — the draft replaced, the row's first day kept.
  const [row] = await db
    .insert(privacyAssessments)
    .values({
      projectId: input.projectId,
      state: 'draft',
      generatedDraft,
      ...(input.createdAt === undefined
        ? {}
        : { createdAt: input.createdAt, updatedAt: input.createdAt }),
    })
    .onConflictDoUpdate({
      target: privacyAssessments.projectId,
      set: { generatedDraft, updatedAt: new Date() },
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

/**
 * A RELEASE SERVING STAGING — the launch candidate — written straight to the rows (the launch path
 * plan's Task 12), for the tests whose subject is what the candidate's sign-off request and the
 * administrators' queue READ, not how a deploy gets there (`api/queue.test.ts` deploys through the
 * routes). Called again for the same project, the NEW release takes staging's route and the earlier
 * one stops being the candidate. The app signs nobody in, so no registration is involved.
 */
export async function stagedRelease(
  db: Db,
  input: { projectId: string; ownerId: string },
): Promise<{ releaseId: string; imageDigest: string }> {
  const kind = 'staging' as const
  const [existing] = await db
    .select()
    .from(environments)
    .where(and(eq(environments.projectId, input.projectId), eq(environments.kind, kind)))
  const env =
    existing ??
    (
      await db
        .insert(environments)
        .values({
          projectId: input.projectId,
          kind,
          hostname: `${input.projectId.slice(0, 8)}.staging.manifest.internal`,
        })
        .returning()
    )[0]!
  const commitSha = randomBytes(20).toString('hex')
  const imageDigest = `sha256:${randomBytes(32).toString('hex')}`
  const [spec] = await db
    .insert(appSpecs)
    .values({
      projectId: input.projectId,
      commitSha,
      parsed: {},
      schemaVersion: 1,
      valid: true,
    })
    .returning()
  const [build] = await db
    .insert(builds)
    .values({
      projectId: input.projectId,
      commitSha,
      appSpecId: spec!.id,
      status: 'succeeded',
      imageDigest,
    })
    .returning()
  const resolved = {
    auth: { provider: 'none', attributes: [] },
    ai: { models: [] },
    env: [],
    services: [],
  }
  const [release] = await db
    .insert(releases)
    .values({
      projectId: input.projectId,
      buildId: build!.id,
      appSpecId: spec!.id,
      createdBy: input.ownerId,
      resolvedConfig: { sandbox: resolved, staging: resolved, production: resolved },
    })
    .returning()
  const [instance] = await db
    .insert(instances)
    .values({
      environmentId: env.id,
      releaseId: release!.id,
      driver: 'fake',
      state: 'healthy',
    })
    .returning()
  await db
    .insert(routes)
    .values({ instanceId: instance!.id, hostname: env.hostname, listener: 'internal' })
    .onConflictDoUpdate({ target: routes.hostname, set: { instanceId: instance!.id } })
  return { releaseId: release!.id, imageDigest }
}
