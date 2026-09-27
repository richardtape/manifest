import {
  createManifestClient,
  idempotencyKey,
  ManifestApiError,
  unwrap,
  type Schemas,
} from '@manifest/contract'

type Change = Schemas['CreateCommitRequest']['changes'][number]

/**
 * Commit against the commit you read, and when `main` has moved since — somebody pushed, or
 * another agent committed — read it again and redo the change on what is there now. The
 * platform never merges for you: a change nobody has seen against the new code is a change
 * nobody reviewed. `changesOn` is your own step that reads the files it changes at a commit.
 */
export async function commitOnWhatIsThere(
  origin: string,
  token: string,
  projectId: string,
  readAt: string,
  changesOn: (commitSha: string) => Promise<Change[]>,
): Promise<{ commitSha: string; attempts: number }> {
  const client = createManifestClient({ origin, token })
  let base = readAt
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const outcome = unwrap(
        await client.POST('/v1/projects/{projectId}/commits', {
          params: {
            path: { projectId },
            header: { 'Idempotency-Key': idempotencyKey() },
          },
          body: {
            baseCommit: base,
            message: 'Show the newest posts first',
            changes: await changesOn(base),
          },
        }),
        'createCommit',
      )
      if (outcome.commitSha === null)
        throw new Error('a commit that is not a dry run has an id')
      return { commitSha: outcome.commitSha, attempts: attempt }
    } catch (error) {
      if (!(error instanceof ManifestApiError) || error.code !== 'SOURCE_CONFLICT')
        throw error
      // `main` moved. Read it again; the next attempt redoes the change on the new commit.
      const tree = unwrap(
        await client.GET('/v1/projects/{projectId}/tree', {
          params: { path: { projectId } },
        }),
        'getTree',
      )
      base = tree.commitSha
    }
  }
  throw new Error(
    'main kept moving; stop and tell the person rather than retrying for ever',
  )
}
