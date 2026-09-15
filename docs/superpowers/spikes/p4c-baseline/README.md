# P4c baseline — the measurements behind the P4c brief

Taken on 2026-09-15, at the end of P4b, against the running platform on Rich's Mac (macOS
26.6.2, Docker Engine 29.7.2, the custom Caddy 2.11.4 edge, the proof app on
`node-ts-mongo@1`). The findings are in [`../../plans/2026-09-15-p4c-brief.md`](../../plans/2026-09-15-p4c-brief.md);
the raw output is [`results-2026-09-15.txt`](results-2026-09-15.txt). Kept so the plan's
first task can re-measure rather than trust these numbers.

| Script | What it measures |
|---|---|
| `p4c-loop.mjs` | A request loop that classifies each response **by body** — the app, the edge's wildcard page, an empty 502, a connection error. `NEWCONN=1` opens a new TLS connection per request |
| `p4c-summary.mjs` | Counts each class inside each `<name>-start` / `<name>-end` marker window |
| `p4c-caddy.sh` | Three ways to move a route between two containers, 20 moves each, on a throwaway route |
| `p4c-caddy-controls.sh` | The same with no config change (control), and keep-alive against new-connection clients |
| `p4c-redeploy.sh` | A real same-release and new-release redeploy of the proof app under a health loop and a signed-in student asking questions |
| `p4c-inflight.sh` | Whether a request in flight survives the route moving to another container |

**Before re-running:** they need `make up`, the control plane, and the proof app deployed
(`make demo-ai`). The container names, project, environment and release IDs are hard-coded
to what existed that day — edit them. Outputs go to `$P4C_OUT` (default
`$TMPDIR/p4c-baseline`). The Caddy scripts create a route `@id p4c-probe` on
`p4c-probe.staging.manifest.internal` and remove it at the end; the redeploy script builds
a release and leaves the previous container running, so clean up per RUNBOOK's *Known
gaps* — the container **and its `-files` volume**.
