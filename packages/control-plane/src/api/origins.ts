import type { FastifyRequest } from 'fastify'

/**
 * WHICH OF MANIFEST'S OWN ORIGINS A REQUEST ARRIVED ON (the front-end enablement plan's Task 8,
 * Decision 16) — the configured origin whose host is the request's `Host`, which the edge
 * preserves (P5c Task 1, M1), or the FIRST (the console's) when none is.
 *
 * **The answer is always one of `origins`.** A request can choose between Manifest's own
 * origins by its `Host`, never name a new one — D15's reasoning (*"Origins are never accepted as
 * input"*), applied to the platform's own SP. And it is chosen by `Host`, never by the `Origin`
 * header: `Origin` is what CSRF CHECKS against this answer, so letting it choose the answer would
 * make the check compare a header with itself.
 *
 * Its readers: the CSRF check (`server.ts`, both stream checks in `routes/events.ts`), and
 * `routes/auth.ts`'s sign-in, step-up, callback and sign-out, each by the SAML client of the
 * origin it arrived on (`ServerDeps.samlSpFor`).
 */
export function originOf(request: FastifyRequest, origins: readonly string[]): string {
  const host = (request.headers.host ?? '').toLowerCase()
  return origins.find((origin) => hostsOf(origin).includes(host)) ?? origins[0]!
}

/**
 * The `Host` values that name an origin: its host as `URL` spells it (lowercased), and — when
 * it uses its scheme's default port — that host with the port spelled out, which a client may
 * send (`app.manifest.internal:443`). Only ITS OWN scheme's default: `:80` is not an https
 * origin.
 */
function hostsOf(origin: string): string[] {
  const url = new URL(origin)
  const defaultPort = url.protocol === 'https:' ? '443' : '80'
  return url.port === '' ? [url.host, `${url.host}:${defaultPort}`] : [url.host]
}
