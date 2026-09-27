import { createManifestClient, idempotencyKey, unwrap } from '@manifest/contract'

/**
 * Release a build that succeeded, and deploy the release to staging. A deploy that never
 * becomes ready is still a `200` — its instance's `state` is `failed` and an Incident says
 * why — so read the state, never the status code alone.
 */
export async function releaseToStaging(
  origin: string,
  token: string,
  projectId: string,
  buildId: string,
): Promise<{ releaseId: string; url: string; state: string }> {
  const client = createManifestClient({ origin, token })
  const release = unwrap(
    await client.POST('/v1/projects/{projectId}/releases', {
      params: { path: { projectId }, header: { 'Idempotency-Key': idempotencyKey() } },
      body: { buildId },
    }),
    'createRelease',
  )
  const environments = unwrap(
    await client.GET('/v1/projects/{projectId}/environments', {
      params: { path: { projectId } },
    }),
    'listEnvironments',
  )
  const staging = environments.find((e) => e.kind === 'staging')
  if (staging === undefined) throw new Error('every project has a staging environment')
  const instance = unwrap(
    await client.POST('/v1/environments/{environmentId}/deploy', {
      params: {
        path: { environmentId: staging.id },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
      body: { releaseId: release.id },
    }),
    'deploy',
  )
  return { releaseId: release.id, url: staging.url, state: instance.state }
}
