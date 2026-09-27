import { createManifestClient, unwrap } from '@manifest/contract'

/**
 * What a first production launch still needs, computed from what exists and never stored:
 * each blocking item that is not met, with who owns it and what to do.
 */
export async function whatALaunchNeeds(
  origin: string,
  token: string,
  projectId: string,
): Promise<{ ready: boolean; todo: { title: string; owner: string; why: string }[] }> {
  const client = createManifestClient({ origin, token })
  const readiness = unwrap(
    await client.GET('/v1/projects/{projectId}/launch-readiness', {
      params: { path: { projectId } },
    }),
    'getLaunchReadiness',
  )
  return {
    ready: readiness.ready,
    todo: readiness.items
      .filter((item) => item.blocking && item.state !== 'met')
      .map((item) => ({ title: item.title, owner: item.owner, why: item.why })),
  }
}
