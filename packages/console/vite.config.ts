import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * `MANIFEST_MOCK=1` POINTS THE CONSOLE AT `manifest-mock` ON 7102 INSTEAD OF THE PLATFORM
 * (P5c Task 12), and it is the ONE configuration in which the console is reached at
 * `http://127.0.0.1:7104` rather than through the edge: there is no control plane, no
 * session cookie the IdP set and no CSRF origin to satisfy. HMR's own socket must then be
 * told 7104 rather than the public 443, or the page opens a `wss://console.manifest.internal`
 * it cannot reach and reloads for ever.
 *
 * Unset — which is every other use — this proxy is `undefined` and nothing changes.
 */
const MOCK =
  process.env.MANIFEST_MOCK === undefined
    ? undefined
    : // The mock's own variable (RUNBOOK, *Running manifest-mock*), so a second mock — another
      // session's holds 7102 — can serve this console without stopping the first (sitting 10).
      `http://127.0.0.1:${process.env.MANIFEST_MOCK_PORT ?? '7102'}`

/**
 * THE TWO ORIGINS THE EDGE SERVES THIS CONSOLE ON (the front-end enablement plan's Task 8,
 * Decision 19): the console's own, and the faculty front-end's — `app.manifest.internal`, whose
 * non-API paths go to 7105. Nothing in this repository serves 7105 except THIS console, for a
 * clicked half of an acceptance, because it is the one client here that signs a person in
 * through a browser (RUNBOOK, *Serving the reference console on the front-end's origin*):
 *
 *   MANIFEST_CONSOLE_HOST=app.manifest.internal pnpm --filter @manifest/console preview --port 7105 --strictPort
 *
 * `MANIFEST_CONSOLE_HOST` names where the PAGE is reached, which is what HMR's socket must be
 * told under `vite dev` — `preview` has no HMR, so there it does nothing; the page reads `window.location.origin` for every call (`src/app.tsx`, `src/stream.ts`),
 * so it needs nothing else to call the API on the origin it was served from.
 */
const ALLOWED_HOSTS = ['console.manifest.internal', 'app.manifest.internal']
const CONSOLE_HOST = process.env.MANIFEST_CONSOLE_HOST ?? 'console.manifest.internal'

/**
 * THE HTML REFERENCE'S RENDERER, SERVED FROM THE PINNED PACKAGE (the authoring API plan's Task
 * 11, Decision 17 and `[M9]`'s first correction). What was measured offline is Scalar's
 * STANDALONE bundle — one file, no build step — not its ESM entry bundled by Vite, which is a
 * different artefact (Vue and its dependencies). So this step hands the browser exactly that
 * file, at `/reference/scalar-standalone.js`: from the package in `node_modules` while `vite`
 * serves, and emitted beside `reference.html` when `vite build` runs. It is never committed and
 * never fetched from a CDN.
 */
const STANDALONE = fileURLToPath(
  new URL(
    './node_modules/@scalar/api-reference/dist/browser/standalone.js',
    import.meta.url,
  ),
)
const SERVED_AT = '/reference/scalar-standalone.js'

function scalarStandalone(): Plugin {
  return {
    name: 'manifest-scalar-standalone',
    configureServer(server) {
      server.middlewares.use(SERVED_AT, (_request, response) => {
        response.setHeader('content-type', 'text/javascript; charset=utf-8')
        response.end(readFileSync(STANDALONE))
      })
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: SERVED_AT.slice(1),
        source: readFileSync(STANDALONE),
      })
    },
  }
}

/**
 * §21's inventory puts the reference console on 7104 as a host process, served at
 * `console.manifest.internal` THROUGH CADDY, on the same origin as the API — so the session
 * cookie, §20's CSRF origin and the control plane's own SAML return URL are one origin with
 * no CORS. Nothing here is reached at `127.0.0.1:7104` by a person: a mutation made from
 * that origin carries the wrong `Origin` and is refused `403 CSRF_ORIGIN_REFUSED`.
 *
 * `host: '127.0.0.1'` and not `0.0.0.0`: the edge reaches a host process as
 * `host.docker.internal:7104` on Docker Desktop, which is how it already reaches the control
 * plane on 7100 (P5c Task 1, M1).
 */
export default defineConfig({
  plugins: [react(), scalarStandalone()],
  server: {
    host: '127.0.0.1',
    port: 7104,
    strictPort: true,
    // Vite refuses a request whose Host header it does not know — "Blocked request. This
    // host is not allowed." — and every request arrives from Caddy with the console's
    // hostname, because Task 1's M1 measured that the edge PRESERVES `Host:
    // console.manifest.internal` rather than rewriting it to the upstream (F7). Without
    // this line the console is a blank page and the reason is in Vite's terminal, not the
    // browser's.
    allowedHosts: ALLOWED_HOSTS,
    // Task 1's M3 measured that a WebSocket upgrade DOES survive the edge hop to a host
    // process on 7104, from a Node client and from a real browser, with `Host` and path
    // intact (F13) — so the plan's `hmr: false` fallback branch is not taken. HMR's socket
    // is opened by the page, so it must be told the public port and scheme rather than
    // 7104/ws.
    hmr:
      MOCK === undefined
        ? { protocol: 'wss', host: CONSOLE_HOST, clientPort: 443 }
        : { protocol: 'ws', host: '127.0.0.1', clientPort: 7104 },
    // `ws: true` on both, because the project's event stream is an upgrade and a proxy that
    // forwards only HTTP leaves the console at `connecting` for ever.
    ...(MOCK === undefined
      ? {}
      : { proxy: { '/v1': { target: MOCK, ws: true }, '/auth': { target: MOCK } } }),
  },
  preview: {
    host: '127.0.0.1',
    port: 7104,
    strictPort: true,
    allowedHosts: ALLOWED_HOSTS,
  },
  // TWO PAGES (the authoring API plan's Task 11, Decision 17): the console, and the HTML reference
  // outside `src/`, whose boundary is its own (`src/boundary.test.ts`).
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        console: fileURLToPath(new URL('./index.html', import.meta.url)),
        reference: fileURLToPath(new URL('./reference.html', import.meta.url)),
      },
    },
  },
})
