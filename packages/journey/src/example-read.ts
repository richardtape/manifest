import { createManifestClient, unwrap } from '@manifest/contract'

/**
 * Read the tree at `main`, then one file AT THE COMMIT THE TREE WAS READ AT — so the file and
 * the listing agree even if somebody pushes in between, and that commit is the `baseCommit` of
 * the change you make next.
 */
export async function readAFile(
  origin: string,
  token: string,
  projectId: string,
  path: string,
): Promise<{ commitSha: string; paths: string[]; text: string }> {
  const client = createManifestClient({ origin, token })
  const tree = unwrap(
    await client.GET('/v1/projects/{projectId}/tree', {
      params: { path: { projectId } },
    }),
    'getTree',
  )
  // Never guess a path: list the tree. A binary file is listed and cannot be read as text.
  const entry = tree.entries.find((e) => e.path === path && e.type === 'file')
  if (entry === undefined || entry.binary === true) {
    throw new Error(`${path} is not a text file at ${tree.commitSha}`)
  }
  const file = unwrap(
    await client.GET('/v1/projects/{projectId}/file', {
      params: { path: { projectId }, query: { path, ref: tree.commitSha } },
    }),
    'getFile',
  )
  return {
    commitSha: tree.commitSha,
    paths: tree.entries.filter((e) => e.type === 'file').map((e) => e.path),
    text: file.content,
  }
}
