import { z } from 'zod/v4'
import type { builds, releases } from '../../db/index.js'
import type { ResolvedConfigSet } from '../../releases/index.js'
import type { ScanSummary as DriverScanSummary } from '../../runtime/index.js'
import { representation, request, Timestamp, Uuid } from '../contract/schemas.js'
import { ScanSummary } from './builds.js'

const ReleaseConfig = z
  .object({
    port: z.number().int(),
    health: z.string(),
    resources: z.object({
      cpu: z.number(),
      memory: z.string(),
      pids: z.number().int(),
      disk: z.string(),
    }),
    services: z.array(
      z.object({ type: z.string(), version: z.string(), name: z.string() }),
    ),
    egressAllow: z.array(z.string()),
    classification: z.string(),
    auth: z.object({
      provider: z.enum(['cwl', 'none']),
      attributes: z.array(z.string()),
    }),
    ai: z.object({ models: z.array(z.string()) }),
    envNames: z
      .array(z.string())
      .describe('The names the app declares — never their values (P5a Decision 22).'),
  })
  .describe('One environment’s view of the release, frozen when it was made (§13).')

export const Release = representation(
  'Release',
  z
    .object({
      id: Uuid,
      projectId: Uuid,
      buildId: Uuid,
      appSpecId: Uuid,
      imageDigest: z.string().describe('What an approval binds to (§13).'),
      summary: z.string().nullable(),
      createdBy: Uuid,
      createdAt: Timestamp,
      scan: ScanSummary.nullable().describe(
        '§12: its build’s scan, recorded on the Release.',
      ),
      config: z.object({
        sandbox: ReleaseConfig,
        staging: ReleaseConfig,
        production: ReleaseConfig,
      }),
    })
    .describe(
      'Immutable: a build, a spec and the configuration resolved for every environment (§13).',
    ),
)
export const ReleaseList = representation('ReleaseList', z.array(Release))

export const CreateReleaseRequest = request(
  'CreateReleaseRequest',
  z.strictObject({ buildId: z.uuid(), summary: z.string().max(500).optional() }),
)
export const DeployRequest = request(
  'DeployRequest',
  z.strictObject({ releaseId: z.uuid() }),
)

export function toRelease(
  row: typeof releases.$inferSelect,
  build: typeof builds.$inferSelect,
): z.input<typeof Release> {
  const resolved = row.resolvedConfig as ResolvedConfigSet
  const configOf = (kind: keyof ResolvedConfigSet) => {
    const c = resolved[kind]
    return {
      port: c.port,
      health: c.health,
      resources: c.resources,
      services: c.services.map((s) => ({
        type: s.type,
        version: s.version,
        name: s.name,
      })),
      egressAllow: c.egressAllow,
      classification: c.classification,
      auth: { provider: c.auth.provider, attributes: [...c.auth.attributes] },
      // `?.` — a release frozen before ResolvedConfig.ai existed has none (P4b pre-flight 64).
      ai: { models: [...(c.ai?.models ?? [])] },
      envNames: c.env.map((e) => e.name),
    }
  }
  return {
    id: row.id,
    projectId: row.projectId,
    buildId: row.buildId,
    appSpecId: row.appSpecId,
    // The COLUMN is nullable and a release's build never is: `createRelease` refuses a
    // build that is not `succeeded` with a digest (RELEASE_BUILD_NOT_DEPLOYABLE), so this
    // branch is unreachable. It is here for `tsc`, and it is `''` rather than a plausible
    // `sha256:…` so that a release that somehow reached it is obviously wrong to a reader
    // rather than quietly wrong to an approver — an approval binds to this value (§13).
    imageDigest: build.imageDigest ?? '',
    summary: row.summary,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    scan: (build.scan as DriverScanSummary | null) ?? null,
    config: {
      sandbox: configOf('sandbox'),
      staging: configOf('staging'),
      production: configOf('production'),
    },
  }
}
