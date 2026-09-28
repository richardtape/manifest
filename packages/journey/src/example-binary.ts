import { createManifestClient, idempotencyKey, unwrap } from '@manifest/contract'

/**
 * Commit an image, a PDF or a font as its BYTES: `encoding: 'base64'` on the write, the bytes as
 * canonical base64, at most 2 MiB, at a path ending in one of the ten kinds' extensions. Text is
 * never sent as bytes — it is refused; send it as text. In a browser, base64 a `File` with
 * `FileReader.readAsDataURL` and keep what follows the comma.
 */
export async function commitAFile(
  origin: string,
  token: string,
  projectId: string,
  path: string,
  bytes: Uint8Array,
  message: string,
): Promise<string> {
  const client = createManifestClient({ origin, token })
  const tree = unwrap(
    await client.GET('/v1/projects/{projectId}/tree', {
      params: { path: { projectId } },
    }),
    'getTree',
  )
  const outcome = unwrap(
    await client.POST('/v1/projects/{projectId}/commits', {
      params: { path: { projectId }, header: { 'Idempotency-Key': idempotencyKey() } },
      body: {
        baseCommit: tree.commitSha,
        message,
        changes: [
          {
            op: 'write',
            path,
            content: Buffer.from(bytes).toString('base64'),
            encoding: 'base64',
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

/**
 * Read any file as bytes — an image, or text — up to 2 MiB: `getFile` with `encoding=base64`.
 * `getTree` marks a binary file `binary: true`; read those this way.
 */
export async function readBytes(
  origin: string,
  token: string,
  projectId: string,
  path: string,
  ref: string,
): Promise<Uint8Array> {
  const client = createManifestClient({ origin, token })
  const file = unwrap(
    await client.GET('/v1/projects/{projectId}/file', {
      params: { path: { projectId }, query: { path, ref, encoding: 'base64' } },
    }),
    'getFile',
  )
  return new Uint8Array(Buffer.from(file.content, 'base64'))
}
