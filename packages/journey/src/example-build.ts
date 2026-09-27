import {
  createManifestClient,
  idempotencyKey,
  subscribe,
  unwrap,
  type EventFrame,
} from '@manifest/contract'

/**
 * Start a build of the commit you wrote — naming it, so the build uses THAT commit's
 * manifest.yaml — and watch it end on the project's event stream rather than polling. The
 * answer is `202` with the build `running`: the answer that arrived is not the outcome.
 */
export async function buildAndWatch(
  origin: string,
  token: string,
  projectId: string,
  commitSha: string,
): Promise<{ buildId: string; status: string; logLines: number }> {
  const client = createManifestClient({ origin, token })
  let logLines = 0
  let ended: (frame: EventFrame) => void = () => undefined
  const end = new Promise<EventFrame>((resolve) => (ended = resolve))
  let buildId: string | undefined
  // Subscribe FIRST, so nothing the build says is missed; the stream replays what came before.
  const stream = subscribe({
    origin,
    token,
    projectId,
    onFrame(frame) {
      if (frame.kind === 'log') logLines += 1
      if (
        frame.kind === 'event' &&
        frame.subject === `build:${buildId}` &&
        (frame.type === 'build.succeeded' || frame.type === 'build.failed')
      )
        ended(frame)
    },
  })
  await stream.ready
  try {
    const build = unwrap(
      await client.POST('/v1/projects/{projectId}/builds', {
        params: { path: { projectId }, header: { 'Idempotency-Key': idempotencyKey() } },
        body: { commitSha },
      }),
      'startBuild',
    )
    buildId = build.id
    await end
    // The stream says it ended; the build itself says how. Read it before releasing it.
    const done = unwrap(
      await client.GET('/v1/builds/{buildId}', {
        params: { path: { buildId: build.id } },
      }),
      'getBuild',
    )
    return { buildId: done.id, status: done.status, logLines }
  } finally {
    stream.close()
  }
}
