import {
  createManifestClient,
  idempotencyKey,
  ManifestApiError,
  unwrap,
  type Schemas,
} from '@manifest/contract'

export type ManifestCheck =
  | { valid: true; sinceApproved: string[] | null; sensitiveFields: string[] }
  | { valid: false; problems: Schemas['ManifestError'][] }

/**
 * Check a new manifest.yaml WITHOUT WRITING ANYTHING: the commit, as a dry run. It runs every
 * check the commit would, in the same order, and answers what the commit would do — or
 * `422 SPEC_INVALID` with each problem in `details`: its path, its code, and a hint.
 */
export async function checkManifest(
  origin: string,
  token: string,
  projectId: string,
  manifest: string,
): Promise<ManifestCheck> {
  const client = createManifestClient({ origin, token })
  const tree = unwrap(
    await client.GET('/v1/projects/{projectId}/tree', {
      params: { path: { projectId } },
    }),
    'getTree',
  )
  try {
    const outcome = unwrap(
      await client.POST('/v1/projects/{projectId}/commits', {
        // A dry run writes nothing, so a fresh key each time: a replay would answer a check
        // made before main moved.
        params: { path: { projectId }, header: { 'Idempotency-Key': idempotencyKey() } },
        body: {
          baseCommit: tree.commitSha,
          message: 'Check manifest.yaml',
          changes: [{ op: 'write', path: 'manifest.yaml', content: manifest }],
          dryRun: true,
        },
      }),
      'createCommit',
    )
    // Valid — and whether an administrator reviews it before production: `sensitiveSinceApproved` is
    // what a release of it would change against the release last approved for production, as the
    // production deploy compares — an addition and its own removal cancel — and null before the first
    // launch, whose approval reviews everything. `sensitiveDiff` is the change since the newest valid
    // manifest, commit by commit.
    return {
      valid: true,
      sinceApproved: outcome.spec.sensitiveSinceApproved,
      sensitiveFields: outcome.spec.sensitiveDiff.fields,
    }
  } catch (error) {
    // Switch on the CODE, never the message: `details` is there to act on.
    if (error instanceof ManifestApiError && error.code === 'SPEC_INVALID') {
      return { valid: false, problems: error.envelope?.error.details ?? [] }
    }
    throw error
  }
}
