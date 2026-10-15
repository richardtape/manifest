import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * THE ADMINISTRATOR'S CONSOLE ON 7101 — §21's inventory row *"Admin UI (Vite) | 7101 | Host
 * process"* — the reference console's shape (`packages/console/vite.config.ts`), cut to what this
 * console needs. `strictPort`: a console that quietly took 7102 would be the faculty front-end's
 * mock's port, and `make doctor` asks 7101 by name (Decision 16).
 *
 * `MANIFEST_MOCK=1` points `/v1` and `/auth` at a `manifest-mock` — its own, on 7113
 * (`MANIFEST_MOCK_PORT`, Decision 14), so the faculty front-end's on 7102 is never touched;
 * `scripts/admin-ui.sh` starts both. `ws: true` because a project's event stream is an upgrade.
 *
 * UNSET IS P11b's CASE AND IS NOT SERVED YET: the console through the edge on
 * `console.manifest.internal` under `/admin`, on the platform's origin (the plan's Decision 3).
 * Until then there is no proxy and nothing answers `/v1` here.
 */
const MOCK =
  process.env.MANIFEST_MOCK === undefined
    ? undefined
    : `http://127.0.0.1:${process.env.MANIFEST_MOCK_PORT ?? '7113'}`

const proxy =
  MOCK === undefined
    ? undefined
    : { '/v1': { target: MOCK, ws: true }, '/auth': { target: MOCK } }

export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 7101, strictPort: true, ...(proxy && { proxy }) },
  preview: { host: '127.0.0.1', port: 7101, strictPort: true, ...(proxy && { proxy }) },
})
