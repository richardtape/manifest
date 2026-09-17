import { z } from 'zod/v4'
import { buildStatus, type builds } from '../../db/index.js'
import type { StoredBuildLogLine } from '../../observability/index.js'
import { representation, request, Timestamp, Uuid } from '../contract/schemas.js'

const Counts = z
  .object({
    critical: z.number().int().nonnegative(),
    high: z.number().int().nonnegative(),
  })
  .describe(
    'Critical and High only: the two severities §12’s gate sorts into its buckets. Anything lower is neither attributed nor counted.',
  )

export const ScanSummary = representation(
  'ScanSummary',
  z
    .object({
      scanner: z
        .string()
        .describe('The scanner and its version — `fake` from the in-memory driver.'),
      scannedAt: Timestamp,
      databaseAgeDays: z
        .number()
        .nonnegative()
        .nullable()
        .describe(
          'How old the vulnerability database was, in days; null when the scanner could not say, and then `stale` is true.',
        ),
      stale: z
        .boolean()
        .describe(
          'A clean result from a stale database is not evidence there is nothing to find (§12).',
        ),
      baseImageKnown: z
        .boolean()
        .describe(
          'False when the base image was not identified: every finding was attributed to the build, so `baseImage` counted nothing.',
        ),
      fixable: Counts.describe(
        'Introduced by this build, with a published fix. On a fresh database a build with any is refused (§12).',
      ),
      unfixable: Counts.describe(
        'Introduced by this build, with no published fix: recorded, not blocking (§12).',
      ),
      baseImage: Counts.describe('The base image’s own — the blueprint’s to fix (§20).'),
      unfixableFindings: z
        .array(z.object({ id: z.string(), severity: z.string(), package: z.string() }))
        .describe(
          'The unfixable findings by id, at most 50; `unfixable` counts them all.',
        ),
    })
    .describe('§12’s scan of the image a build produced (§6 `Build.scan`).'),
)

export const Build = representation(
  'Build',
  z
    .object({
      id: Uuid,
      projectId: Uuid,
      commitSha: z.string().regex(/^[0-9a-f]{40}$/),
      status: z.enum(buildStatus.enumValues),
      imageDigest: z
        .string()
        .nullable()
        .describe('`sha256:…` once the build has succeeded; the image a release names.'),
      error: z
        .string()
        .nullable()
        .describe('Why a failed build failed, in words its author can act on (§14).'),
      scan: ScanSummary.nullable().describe(
        'Null until the build succeeds, and for a build from before scans were recorded.',
      ),
      createdAt: Timestamp,
    })
    .describe(
      'A build of one commit (§13). It answers `running` when it starts, and ends as `succeeded` or `failed` on the project’s stream (R6).',
    ),
)
export const BuildList = representation('BuildList', z.array(Build))

export const BuildLog = representation(
  'BuildLog',
  z
    .object({
      buildId: Uuid,
      lines: z.array(
        z.object({
          seq: z.number().int().nonnegative(),
          stream: z.enum(['stdout', 'stderr']),
          text: z.string().describe('Redacted at capture (§14).'),
          at: Timestamp,
        }),
      ),
    })
    .describe('§14’s build log, as stored.'),
)

export const StartBuildRequest = request(
  'StartBuildRequest',
  z.strictObject({
    commitSha: z
      .string()
      .regex(/^[0-9a-f]{40}$/)
      .optional()
      .describe('A full commit id. Defaults to the commit of the newest validated spec.'),
  }),
)

/**
 * Decision 2's first read of what is public: never `appSpecId`, `imageRepository` or
 * `logsRef` — the registry's host and the log store's key are the platform's. The scan is
 * a jsonb column written by `finishBuild`; the representation's parse is its second read.
 */
export function toBuild(row: typeof builds.$inferSelect): z.input<typeof Build> {
  return {
    id: row.id,
    projectId: row.projectId,
    commitSha: row.commitSha,
    status: row.status,
    imageDigest: row.imageDigest,
    error: row.error,
    scan: (row.scan as z.input<typeof ScanSummary> | null) ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}

export function toBuildLog(
  buildId: string,
  lines: readonly StoredBuildLogLine[],
): z.input<typeof BuildLog> {
  return {
    buildId,
    lines: lines.map((l) => ({
      seq: l.seq,
      stream: l.stream,
      text: l.text,
      at: l.at.toISOString(),
    })),
  }
}
