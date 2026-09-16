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
| **`p4c-measure-edge.sh`** | **P4c Task 1's five measurements** (2026-09-15): whether Caddy keeps counting an upstream whose route has moved while a request is in flight (M1, with a parked-route control M1b); whether a **deferred** `headers` handler replaces an app's own `X-Manifest-Instance` (M2, with the app's forgery proved first); twenty in-place `PATCH` moves of the **real** route shape (M3); whether a container name past DNS's 63-octet label resolves from the edge (M4); and whether repeated `--filter label=` filters AND (M5). Takes two upstream addresses to move a throwaway route between. Results: [`results-task1-2026-09-15.txt`](results-task1-2026-09-15.txt), which also carries the three `make demo-redeploy` baseline runs |

**`make demo-redeploy` has been run three times so far, and they are the before, the
middle and the after.** [`results-task1-2026-09-15.txt`](results-task1-2026-09-15.txt)
holds sitting 1's three baseline runs against the platform as P4b left it — **ten green,
eleven red**, and the outage numbers this plan exists to remove.
[`results-sitting3-2026-09-15.txt`](results-sitting3-2026-09-15.txt) holds the same script
re-run after Tasks 3 and 4 — **fourteen green, seven red**, no 5xx and no wildcard answer
in any redeploy window, and every remaining question failure a 401 rather than a 502. Read
that one's note on the failed-release phase: its 450 `app` answers look identical to the
baseline's 448 and are a different fact, which is what the identity header is for.
[`results-sitting6-2026-09-15.txt`](results-sitting6-2026-09-15.txt) holds it re-run after
Tasks 8 and 9, which gave the driver and the retirer their caller — **nineteen green, two
red**. Every retire assertion is green in all three phases, all 560 requests across the
three windows were answered by the app, and there were **zero resets**. The two still red
are one thing: the app keeps its sessions in memory, so a redeploy signs the student out
and their next 122 questions are 401s. That is Task 10.

**Before re-running:** they need `make up`, the control plane, and the proof app deployed
(`make demo-ai`). The container names, project, environment and release IDs are hard-coded
to what existed that day — edit them. Outputs go to `$P4C_OUT` (default
`$TMPDIR/p4c-baseline`). The Caddy scripts create a route `@id p4c-probe` on
`p4c-probe.staging.manifest.internal` and remove it at the end; the redeploy script builds
a release and leaves the previous container running, so clean up per RUNBOOK's *Known
gaps* — the container **and its `-files` volume**.
