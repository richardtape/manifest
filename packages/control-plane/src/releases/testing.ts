import type { Db } from '../db/index.js'
import type { EventBus } from '../observability/index.js'
import type { Driver } from '../runtime/index.js'
import { createBuildRunner, getBuild, type Build, type StartBuildInput } from './build.js'

/**
 * A build started AND awaited to its end, for a test that needs a finished build (P5a Task
 * 13). `startBuild` returned the finished row until builds became asynchronous (R6); this
 * goes through the one production path, `createBuildRunner`, rather than keeping a
 * synchronous twin of it — two paths to one build is how the two drift.
 *
 * A runner of its own, so `idle()` waits for exactly this build.
 */
export async function buildToEnd(
  deps: { db: Db; driver: Driver; bus: EventBus },
  input: StartBuildInput,
): Promise<Build> {
  const runner = createBuildRunner(deps)
  const started = await runner.start(input)
  await runner.idle()
  const ended = await getBuild(deps.db, started.id)
  if (ended === undefined) throw new Error(`build ${started.id} vanished while it ran`)
  return ended
}
