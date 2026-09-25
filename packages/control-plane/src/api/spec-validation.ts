import { and, desc, eq } from 'drizzle-orm'
import { appSpecs } from '../db/index.js'
import { repositoryOf } from '../projects/index.js'
import { isSensitiveDiff, validateSpec, type ManifestSpec } from '../spec/index.js'
import { modelPolicy, validationContext } from './routes/projects.js'
import type { z } from 'zod/v4'
import type { SpecValidation } from './representations/specs.js'
import type { ServerDeps } from './server.js'

/** The route's own representation, so the two callers and the contract cannot drift apart. */
export type SpecValidationResult = z.output<typeof SpecValidation>

/**
 * §22 step 3 — `manifest.yaml` validated AT A COMMIT and the answer recorded, valid or not.
 * **TWO CALLERS** since the D5 plan's Task 9: `POST /v1/projects/{id}/spec`, and a GitHub push
 * whose `main` moved (the webhook route), so a person's push is validated as it arrives —
 * and never built: builds stay a request a person or an agent makes (Decision 10).
 *
 * The provider first (Decision 3) — `repositoryOf` is the ONE way the API names a project's
 * repository; without it a GitHub-mode control plane built a driver-1 project (sitting 4's
 * F6) — then the commit: `commitSha`, or HEAD, which is GitHub's NOW or a `503`, never the
 * mirror's last answer. Then the file AT that commit, which refuses a commit the repository
 * lacks rather than reading `null` and recording an invalid spec for a commit it never read
 * (the D5 plan's Task 7).
 *
 * `isSensitiveDiff` (D9) is COMPUTED against the NEWEST VALID spec — not the newest row (P6b
 * sitting 1, F7: compared with the previous row, an invalid commit in between made a
 * sensitive change report as none) — and REPORTED; it is enforced at the production deploy.
 */
export async function validateAndRecord(
  deps: ServerDeps,
  project: { id: string; slug: string; quota: unknown },
  commitSha: string | undefined,
): Promise<SpecValidationResult> {
  const [previous] = await deps.db
    .select()
    .from(appSpecs)
    .where(and(eq(appSpecs.projectId, project.id), eq(appSpecs.valid, true)))
    .orderBy(desc(appSpecs.createdAt))
    .limit(1)
  const repo = await repositoryOf(deps, project)
  const sha = commitSha ?? (await deps.source.headCommit(repo))
  const yamlText = (await deps.source.readFile(repo, sha, 'manifest.yaml')) ?? ''
  // Still before the spec row is written, and after the manifest is read: the catalogue is
  // consulted only if this manifest declares a model.
  const models = await modelPolicy(deps.catalogue, yamlText)
  const result = validateSpec(
    yamlText,
    validationContext(project.slug, project.quota as Record<string, unknown>, models),
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
  const sensitiveDiff =
    result.valid && previous !== undefined
      ? isSensitiveDiff(previous.parsed as ManifestSpec, result.spec)
      : { sensitive: false, fields: [] }
  return {
    appSpecId: appSpec!.id,
    commitSha: sha,
    valid: result.valid,
    errors: result.valid ? [] : result.errors,
    sensitiveDiff,
  }
}
