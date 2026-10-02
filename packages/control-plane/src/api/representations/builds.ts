import { z } from 'zod/v4'
import { buildStatus, type builds } from '../../db/index.js'
import type { StoredBuildLogLine } from '../../observability/index.js'
import { representation, request, Timestamp, Uuid } from '../contract/schemas.js'

const Counts = z
  .object({
    critical: z.number().int().nonnegative().describe('Critical findings.'),
    high: z.number().int().nonnegative().describe('High findings.'),
  })
  .describe(
    'Critical and High only: the two severities the vulnerability scan sorts into its buckets. Anything lower is neither attributed nor counted.',
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
          'Whether the vulnerability database was more than 7 days old, or of unknown age. A clean result from a stale database is not evidence there is nothing to find.',
        ),
      baseImageKnown: z
        .boolean()
        .describe(
          'False when the base image was not identified: every finding was attributed to the build, so `baseImage` counted nothing.',
        ),
      fixable: Counts.describe(
        'Introduced by this build, with a published fix. On a fresh database a build with any is refused.',
      ),
      unfixable: Counts.describe(
        'Introduced by this build, with no published fix: recorded, not blocking.',
      ),
      baseImage: Counts.describe('The base image’s own — the blueprint’s to fix.'),
      unfixableFindings: z
        .array(
          z.object({
            id: z.string().describe('The vulnerability’s id — a CVE or an advisory.'),
            severity: z.string().describe('`Critical` or `High`.'),
            package: z.string().describe('The package it is in, with its version.'),
          }),
        )
        .describe(
          'The unfixable findings by id, at most 50; `unfixable` counts them all.',
        ),
    })
    .describe('The vulnerability scan of the image a build produced (`Build.scan`).'),
)

export const Build = representation(
  'Build',
  z
    .object({
      id: Uuid.describe(
        'The build — what `getBuild`, `getBuildLog` and `createRelease` name.',
      ),
      projectId: Uuid.describe('Its project.'),
      commitSha: z
        .string()
        .regex(/^[0-9a-f]{40}$/)
        .describe('The commit built, whose own manifest.yaml it was built with.'),
      status: z
        .enum(buildStatus.enumValues)
        .describe(
          '`running` from the moment it is started, then `succeeded` or `failed` — the stream says which as it happens. `pending` is not answered today.',
        ),
      imageDigest: z
        .string()
        .nullable()
        .describe('`sha256:…` once the build has succeeded; the image a release names.'),
      error: z
        .string()
        .nullable()
        .describe('Why a failed build failed, in words its author can act on.'),
      scan: ScanSummary.nullable().describe(
        'Null until the build succeeds, and for a build from before scans were recorded.',
      ),
      createdAt: Timestamp.describe('When it was started.'),
    })
    .describe(
      'A build of one commit. It answers `running` when it starts, and ends as `succeeded` or `failed` on the project’s stream.',
    ),
)
export const BuildList = representation(
  'BuildList',
  z.array(Build).describe('A project’s newest builds, newest first.'),
)

export const BuildLog = representation(
  'BuildLog',
  z
    .object({
      buildId: Uuid.describe('The build.'),
      lines: z
        .array(
          z.object({
            seq: z.number().int().nonnegative().describe('Its position, from 0.'),
            stream: z
              .enum(['stdout', 'stderr'])
              .describe('Which of the build’s outputs wrote it.'),
            text: z.string().describe('The line’s text, redacted at capture.'),
            at: Timestamp.describe('When it was written.'),
          }),
        )
        .describe('Every line, in order.'),
    })
    .describe('A build’s log, as stored.'),
)

export const StartBuildRequest = request(
  'StartBuildRequest',
  z
    .strictObject({
      commitSha: z
        .string()
        .regex(/^[0-9a-f]{40}$/)
        .optional()
        .describe(
          'The full id of the commit to build. Without it, the commit of the project’s newest recorded validation — which need not be `main`’s head: name the commit you mean.',
        ),
    })
    .describe('Which commit to build.'),
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
