import { and, desc, eq } from 'drizzle-orm'
import { appSpecs, type Db } from '../db/index.js'
import { makeRedactor, publishEvent } from '../observability/index.js'
import { repositoryOf } from '../projects/index.js'
import {
  isSensitiveDiff,
  validateSpec,
  type ManifestSpec,
  type ValidationResult,
} from '../spec/index.js'
import { modelPolicy, validationContext } from './routes/projects.js'
import type { z } from 'zod/v4'
import type { SpecValidation } from './representations/specs.js'
import type { ServerDeps } from './server.js'

/** The route's own representation, so the two callers and the contract cannot drift apart. */
export type SpecValidationResult = z.output<typeof SpecValidation>

/**
 * `manifest.yaml`'s TEXT, validated with exactly the context a recorded validation uses — the
 * model catalogue (read only if it declares a model), the quota — and NOTHING RECORDED OR
 * ANNOUNCED (the authoring API plan's Task 6). `createCommit` validates the manifest a commit
 * WOULD leave with this, before anything is written, so an API commit is refused `SPEC_INVALID`
 * rather than recorded invalid (Decision 6); `validateAndRecord` validates with it too, so the
 * two cannot disagree about what is valid.
 */
export async function validateManifestText(
  deps: ServerDeps,
  project: { slug: string; quota: unknown; blueprintRef: string },
  yamlText: string,
): Promise<ValidationResult> {
  const models = await modelPolicy(deps.catalogue, yamlText)
  return validateSpec(
    yamlText,
    validationContext(
      project.slug,
      project.quota as Record<string, unknown>,
      models,
      project.blueprintRef,
    ),
  )
}

/**
 * D9's sensitive diff of `spec` against the project's NEWEST VALID spec — not the newest row
 * (P6b sitting 1, F7: compared with the previous row, an invalid commit in between made a
 * sensitive change report as none). THE ONE QUERY both a recorded validation and a commit's dry
 * run use; `null` (an invalid manifest) reports nothing.
 */
export async function sensitiveAgainstNewestValid(
  db: Db,
  projectId: string,
  spec: ManifestSpec | null,
): Promise<{ sensitive: boolean; fields: string[] }> {
  if (spec === null) return { sensitive: false, fields: [] }
  const [previous] = await db
    .select()
    .from(appSpecs)
    .where(and(eq(appSpecs.projectId, projectId), eq(appSpecs.valid, true)))
    .orderBy(desc(appSpecs.createdAt))
    .limit(1)
  return previous === undefined
    ? { sensitive: false, fields: [] }
    : isSensitiveDiff(previous.parsed as ManifestSpec, spec)
}

/**
 * §22 step 3 — `manifest.yaml` validated AT A COMMIT and the answer recorded, valid or not —
 * and ANNOUNCED: `spec.validated` on the project's stream, every time (the authoring API plan's
 * Decision 7), so a client learns from the stream that a person's push left the manifest
 * invalid. **THREE CALLERS**: `POST /v1/projects/{id}/spec`; a GitHub push whose `main` moved
 * (the webhook route), so a person's push is validated as it arrives — and never built: builds
 * stay a request a person or an agent makes (the D5 plan's Decision 10); and every API commit
 * (`createCommit`). Project creation records and announces its own seed's validation.
 *
 * The provider first (Decision 3) — `repositoryOf` is the ONE way the API names a project's
 * repository; without it a GitHub-mode control plane built a driver-1 project (sitting 4's
 * F6) — then the commit: `commitSha`, or HEAD, which is GitHub's NOW or a `503`, never the
 * mirror's last answer. Then the file AT that commit, which refuses a commit the repository
 * lacks rather than reading `null` and recording an invalid spec for a commit it never read
 * (the D5 plan's Task 7).
 *
 * `isSensitiveDiff` (D9) is COMPUTED against the newest VALID spec, BEFORE this row is written
 * (`sensitiveAgainstNewestValid`), and REPORTED; it is enforced at the production deploy.
 */
export async function validateAndRecord(
  deps: ServerDeps,
  project: { id: string; slug: string; quota: unknown; blueprintRef: string },
  commitSha: string | undefined,
): Promise<SpecValidationResult> {
  const repo = await repositoryOf(deps, project)
  const sha = commitSha ?? (await deps.source.headCommit(repo))
  const yamlText = (await deps.source.readFile(repo, sha, 'manifest.yaml')) ?? ''
  // Still before the spec row is written, and after the manifest is read: the catalogue is
  // consulted only if this manifest declares a model.
  const result = await validateManifestText(deps, project, yamlText)
  const sensitiveDiff = await sensitiveAgainstNewestValid(
    deps.db,
    project.id,
    result.valid ? result.spec : null,
  )
  const [appSpec] = await deps.db
    .insert(appSpecs)
    .values({
      projectId: project.id,
      commitSha: sha,
      parsed: result.valid ? result.spec : {},
      schemaVersion: 1,
      valid: result.valid,
      errors: result.valid ? [] : result.errors,
    })
    .returning()
  const errorCount = result.valid ? 0 : result.errors.length
  await publishEvent(
    deps.db,
    deps.bus,
    {
      projectId: project.id,
      subject: `project:${project.slug}`,
      type: 'spec.validated',
      machineDetail: {
        appSpecId: appSpec!.id,
        commitSha: sha,
        valid: result.valid,
        errorCount,
      },
      humanMessage: result.valid
        ? `${project.slug}'s manifest.yaml is valid.`
        : `${project.slug}'s manifest.yaml has ${errorCount} problem(s) to fix.`,
    },
    makeRedactor([]),
  )
  return {
    appSpecId: appSpec!.id,
    commitSha: sha,
    valid: result.valid,
    errors: result.valid ? [] : result.errors,
    sensitiveDiff,
  }
}
