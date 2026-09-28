import {
  createManifestClient,
  ManifestApiError,
  unwrap,
  type Schemas,
} from '@manifest/contract'

export type AppOutput =
  | { read: true; instanceId: string; lines: Schemas['InstanceOutput']['lines'] }
  | { read: false; instanceId: string | null; code: string | null; next: string }

/**
 * What a running app printed: the last lines of the instance an environment's hostname reaches,
 * oldest first and redacted. Only a SANDBOX instance's output is readable — staging and
 * production serve real people, and each is refused by its own code — so to see what a staging
 * release prints, deploy the same release to the sandbox and read it there. Nothing is kept:
 * each read asks the running instance again.
 */
export async function whatTheAppPrinted(
  origin: string,
  token: string,
  environmentId: string,
  lines: number,
): Promise<AppOutput> {
  const client = createManifestClient({ origin, token })
  const list = unwrap(
    await client.GET('/v1/environments/{environmentId}/instances', {
      params: { path: { environmentId } },
    }),
    'listInstances',
  )
  // The one the hostname reaches now. A failed one stays listed after it is replaced.
  const serving = list.instances.find((i) => i.serving)
  if (serving === undefined)
    return {
      read: false,
      instanceId: null,
      code: null,
      next: 'Nothing is running here: deploy a release first.',
    }
  try {
    const output = unwrap(
      await client.GET('/v1/instances/{instanceId}/output', {
        // At most `lines` — a long line the runtime split counts as several.
        params: { path: { instanceId: serving.id }, query: { lines } },
      }),
      'getInstanceOutput',
    )
    return { read: true, instanceId: serving.id, lines: output.lines }
  } catch (error) {
    if (!(error instanceof ManifestApiError)) throw error
    switch (error.code) {
      case 'INSTANCE_OUTPUT_STAGING':
      case 'INSTANCE_OUTPUT_PRODUCTION':
        return {
          read: false,
          instanceId: serving.id,
          code: error.code,
          next: 'Deploy the same release to the sandbox and read it there, or read a failed instance’s Incident (listIncidents).',
        }
      case 'INSTANCE_OUTPUT_UNAVAILABLE':
        // It stopped between the two reads: its last lines are in its Incident.
        return {
          read: false,
          instanceId: serving.id,
          code: error.code,
          next: 'It no longer runs: read its Incident (listIncidents).',
        }
      default:
        throw error
    }
  }
}
