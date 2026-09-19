import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

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
const MOCK = process.env.MANIFEST_MOCK === undefined ? undefined : 'http://127.0.0.1:7102'

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
  plugins: [react()],
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
    allowedHosts: ['console.manifest.internal'],
    // Task 1's M3 measured that a WebSocket upgrade DOES survive the edge hop to a host
    // process on 7104, from a Node client and from a real browser, with `Host` and path
    // intact (F13) — so the plan's `hmr: false` fallback branch is not taken. HMR's socket
    // is opened by the page, so it must be told the public port and scheme rather than
    // 7104/ws.
    hmr:
      MOCK === undefined
        ? { protocol: 'wss', host: 'console.manifest.internal', clientPort: 443 }
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
    allowedHosts: ['console.manifest.internal'],
  },
  build: { outDir: 'dist', emptyOutDir: true },
})
