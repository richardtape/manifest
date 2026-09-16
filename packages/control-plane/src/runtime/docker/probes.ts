import type { EngineClient } from './engine.js'
import { containerExec } from './exec.js'

/**
 * Is this instance ready, asked from INSIDE THE EDGE.
 *
 * The edge is attached to every app network (`PLATFORM_NEIGHBOURS`), carries `curl`,
 * and has no proxy environment — measured 2026-09-15: `docker exec manifest-caddy
 * curl http://<container>:3000/healthz` answered the app's own body in 3 ms. So this
 * asks the same question, from the same place, that Caddy will ask when the route
 * moves.
 *
 * AND IT ASKS IT WITHOUT THE PUBLIC HOSTNAME, which is what keeps the edge's
 * wildcard out of the answer: a status-only probe of a hostname that holds no route
 * gets 200 for any path (P4b finding 193, measured again 2026-09-15). The alias
 * resolves to exactly one container on one network, so a 200 here is this instance's
 * 200 by construction — there is nothing else it could have come from.
 *
 * This is the whole of §11's Redeploys in one call position: the new instance is
 * proved ready BEFORE anything touches the route, so whatever serves the hostname
 * keeps serving it while the new container starts.
 */
export function privateProbe(
  engine: EngineClient,
  edgeContainer: string,
  upstream: string,
  healthPath: string,
): () => Promise<number> {
  return async () => {
    const exec = containerExec(
      engine,
      edgeContainer,
      [
        'curl',
        '-sS',
        '-m',
        '5',
        '-o',
        '/dev/null',
        '-w',
        '%{http_code}',
        `http://${upstream}${healthPath}`,
      ],
      {},
    )
    let out = ''
    // A failure to RUN the probe — no edge container, no exec — reaches
    // `waitForReady` as a throw, which reports "the probe could not run" rather than
    // a status. Both stream drains await the same started promise, so this is where
    // that rejection surfaces.
    for await (const chunk of exec.stdout) out += chunk
    await exec.exitCode
    // `slice(-3)` rather than a parse of the whole string: curl writes the code last
    // and writes nothing else here, but a connection failure prints `000` and any
    // stray byte ahead of it would otherwise make this NaN rather than 0.
    const code = Number.parseInt(out.trim().slice(-3), 10)
    return Number.isNaN(code) ? 0 : code
  }
}
