import { createManifestClient, idempotencyKey, unwrap } from '@manifest/contract'

/**
 * Commit a change: read the tree, then commit against exactly the commit it was read at. A
 * retry after a timeout reuses the same Idempotency-Key, and is answered the first commit.
 */
export async function commitAChange(
  origin: string,
  token: string,
  projectId: string,
): Promise<string> {
  const client = createManifestClient({ origin, token })
  // 1. Read what you are changing — and keep the commit it was read at.
  const tree = unwrap(
    await client.GET('/v1/projects/{projectId}/tree', {
      params: { path: { projectId } },
    }),
    'getTree',
  )
  // 2. Commit against exactly that commit. One key for this action, reused on a retry.
  const key = idempotencyKey()
  const outcome = unwrap(
    await client.POST('/v1/projects/{projectId}/commits', {
      params: { path: { projectId }, header: { 'Idempotency-Key': key } },
      body: {
        baseCommit: tree.commitSha,
        message: 'Count the replies to each post',
        changes: [
          {
            op: 'write',
            path: 'src/replies.js',
            content: 'export const countReplies = (post) => post.replies.length\n',
          },
        ],
      },
    }),
    'createCommit',
  )
  if (outcome.commitSha === null)
    throw new Error('a commit that is not a dry run has an id')
  return outcome.commitSha
}
