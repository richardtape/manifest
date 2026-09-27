import { createManifestClient, idempotencyKey, unwrap } from '@manifest/contract'

/**
 * Set the value of a secret the app declares in manifest.yaml (`env: - { name: SIS_API_KEY,
 * secret: true }`) for its staging environment. The value is never answered back — the list
 * says only which names are declared and which are set — and it takes effect at the next deploy.
 */
export async function setStagingSecret(
  origin: string,
  token: string,
  projectId: string,
  name: string,
  value: string,
): Promise<{ declared: boolean; set: boolean }> {
  const client = createManifestClient({ origin, token })
  const environments = unwrap(
    await client.GET('/v1/projects/{projectId}/environments', {
      params: { path: { projectId } },
    }),
    'listEnvironments',
  )
  const staging = environments.find((e) => e.kind === 'staging')
  if (staging === undefined) throw new Error('every project has a staging environment')
  unwrap(
    await client.PUT('/v1/environments/{environmentId}/secrets/{name}', {
      params: {
        path: { environmentId: staging.id, name },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
      body: { value },
    }),
    'setAppSecret',
  )
  const list = unwrap(
    await client.GET('/v1/environments/{environmentId}/secrets', {
      params: { path: { environmentId: staging.id } },
    }),
    'listAppSecrets',
  )
  const status = list.secrets.find((s) => s.name === name)
  return { declared: status?.declared ?? false, set: status?.set ?? false }
}
