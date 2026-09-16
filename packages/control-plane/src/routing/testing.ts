/**
 * The routing module's surface FOR TESTS: the stand-in app its Docker-tier suites put
 * behind the edge.
 */

/**
 * `docker run` arguments for a container that answers every request on :8080 with
 * `200` and `body`, plus any `headers`, on `manifest-platform`.
 *
 * A REAL HTTP SERVER — Node's, on the base image apps are built from — and never an
 * `nc` one-liner. `printf … | nc -l` writes its canned response the moment a
 * connection OPENS, before any request arrives; measured 2026-09-16 by connecting and
 * sending nothing, which read back `HTTP/1.1 200 OK … ok`. The edge keeps pooled
 * connections to an upstream, so one it opened and parked received an answer to a
 * request nobody had made: Caddy logged `Unsolicited response received on idle HTTP
 * channel`, discarded the connection, and the request it was handed at that moment
 * came back an empty `502` (`readLoopPeekFailLocked`). That failed a full
 * `pnpm test:docker` and read as an edge defect when it was the stand-in's (P4c
 * sitting 8, finding 74). Node reads a request before it answers and closes idle
 * connections itself, exactly as every app on the platform does.
 *
 * `node:22-alpine` is pinned in `infra/images.lock` and present after `make seed`, so
 * this needs no network.
 */
export function stubAppArgs(
  name: string,
  body: string,
  headers: Record<string, string> = {},
): string[] {
  const server =
    "const body = process.env.STUB_BODY; const extra = JSON.parse(process.env.STUB_HEADERS); require('node:http').createServer((req, res) => { req.resume(); res.writeHead(200, { 'Content-Length': Buffer.byteLength(body), ...extra }); res.end(body) }).listen(8080)"
  return [
    'run',
    '-d',
    '--name',
    name,
    '--network',
    'manifest-platform',
    '-e',
    `STUB_BODY=${body}`,
    '-e',
    `STUB_HEADERS=${JSON.stringify(headers)}`,
    'node:22-alpine',
    'node',
    '-e',
    server,
  ]
}
