import { createManifestClient, unwrap, type Schemas } from '@manifest/contract'

/**
 * A load rehearsal, read to its end. A person starts it in their own session (`runLoadRehearsal` answers at once with
 * the run `running`); anyone who may read the project — a token included — then reads it again after `pollAfterSeconds`
 * until it is no longer `running`. A run that does not pass is still a run: read its `state` and `evidence.reason`,
 * never the HTTP status.
 */
export async function loadRehearsalToItsEnd(
  origin: string,
  token: string,
  projectId: string,
  loadRehearsalId: string,
): Promise<Schemas['LoadRehearsal']> {
  const client = createManifestClient({ origin, token })
  for (;;) {
    const run = unwrap(
      await client.GET('/v1/projects/{projectId}/load-rehearsals/{loadRehearsalId}', {
        params: { path: { projectId, loadRehearsalId } },
      }),
      'getLoadRehearsal',
    )
    if (run.state !== 'running' || run.pollAfterSeconds === null) return run
    const wait = run.pollAfterSeconds * 1000
    await new Promise((resolve) => setTimeout(resolve, wait))
  }
}
