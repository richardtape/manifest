# S6 — What can a hostile process inside an app container actually reach?

**Answer:** **Nothing it should not, and one thing better than the spec promises.**
Every probe in the matrix is denied, each denial is paired with the same probe
succeeding somewhere it should, and **§21's divergence 8 no longer holds as written**:
the developer's own machine is not merely *policed*, it is **unroutable**, because
P3 Task 4 makes every app network `--internal`. The spec calls that divergence *"the
one local divergence that is a real security weakening rather than a convenience"*,
and it has been removed rather than mitigated.

The measured isolation level is **`isolationLevel: 'container'`** — shared kernel,
no gVisor and no Kata. **Whether that is sufficient for SANDBOXES is left open for
S5**, deliberately: these probes ran against a *staging* app, and §11 gives sandboxes
`exec`, a wider egress baseline and session-scoped AI keys, none of which exist yet.
Answering a sandbox question on the strength of a staging app is precisely the kind
of claim this project has been burned by.

**The matrix is not a report. It is `src/runtime/docker/s6.docker.test.ts`**, part of
§16's security-regression tier, run by `pnpm test:docker` on every change. A findings
note ages; a test that stands the app up, probes it and tears it down does not.

| | |
|---|---|
| **Spike** | S6 |
| **Run by** | Claude Opus 5 (Claude Code), for Rich Tape |
| **Dates** | 2026-09-07 |
| **Timebox** | ran as P3's acceptance exercise (roadmap gap 4), Task 18 |
| **Branch** | `main` — not a throwaway spike branch, because its deliverable is a permanent test tier |
| **Verdict** | **Every probe denied, every denial paired with a positive control.** No probe reached, so P3 has no isolation defect to fix. |

---

## Versions

| Component | Version / digest |
|---|---|
| macOS | 26.6.2 (build 25G83), arm64, 12 cores, 36 GiB |
| Docker | Engine **29.7.2**, API 1.55 (min 1.40), Compose v5.4.0 |
| Docker VM memory | 8.32 GB decimal / 7.75 GiB binary |
| App base image | `node:22-alpine` @ `sha256:1ef15d33d74602021f35ec64a4e72f4a21e2cfa68ebecd125fbe0c44af8f604a` (the LOCAL registry's single-arch manifest — see *What did not work*) |
| Probe image | `curlimages/curl:8.11.1` @ `sha256:c1fe1679c34d9784c1b0d1e5f62ac0a79fca01fb6377cdd33e90473c6f9f9a69` |
| Unhardened control image | `alpine:3.22` @ `sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce` |
| Edge | custom `xcaddy` build of Caddy 2.11.4 (S7) |
| Node (host) | v24.12.0 |

The app under test was **built by the platform** from `fixtures/fixture-app` through
the blueprint, not hand-run: `pids: 64`, `memoryMi: 256`, `egressAllow: []`.

---

## The matrix

Every row was measured. `curl` exit **6** is *"couldn't resolve host"* and exit **7**
is *"failed to connect"*; the difference matters and is discussed below.

| # | Probe | Result | Positive control |
|---|---|---|---|
| 1 | Docker socket inside the app container | `ABSENT` | the host's socket exists — this suite is driving it |
| 2 | app → the platform on the host: control plane `:7100`, **Caddy's admin API `:7119`** | **exit 6** and **exit 6** | `:7119` from a `bridge` container: **exit 0** |
| 3 | app → cloud metadata `169.254.169.254` | **exit 7** | *none exists locally* — stated, not faked |
| 4 | app → another app's database by name | **exit 6** | same name from **that app's own** network: **exit 0** |
| 5 | app → **its own** database | **exit 0** | this row IS the control for row 4 |
| 6 | app → the developer's machine, `:27017` and `:6333` | **exit 6** and **exit 6** | `:6333` from a `bridge` container: **exit 0** |
| 7 | app → the public internet, no proxy | **exit 6** | `bridge` → `registry.npmjs.org`: **exit 0** |
| 8 | app → the internet **through its own proxy**, undeclared host | **HTTP 403** | a *declared* host succeeds: `egress.docker.test.ts` |
| 9 | writing to `/` | `ROOT-READONLY` | `/tmp` is `TMP-WRITABLE` |
| 10 | `CapEff` in the app container | `0000000000000000` | unhardened `alpine:3.22`: `00000000a80425fb` |
| 11 | forking past `PidsLimit` | `PidsLimit=64`, 300 forks → `FORK-REFUSED` | the limit is the assertion |
| 12 | a Docker **client** inside the app container | `NONE` | — |

And, in the same suite, **the app is still serving**: `https://fixture-s6.staging.manifest.internal/healthz`
answers `{"status":"ok","mongo":true}` through the edge with the platform CA verified
and no `-k`. Without that row every denial above would also be satisfied by a
container that simply failed to start.

---

## What the numbers actually say

**The denials are topological, not policy.** Rows 2, 4, 6 and 7 all fail at exit
**6** — the name never resolved — while row 3, which uses a literal IP and needs no
resolution, fails at exit **7**, the connect. That distinction is the finding: an app
network created with `Internal: true` has **no gateway**, so there is no route to the
host, to another app, or off the machine, and the per-container resolver has nothing
to forward to. §12's east-west denials are a property of the topology rather than a
rule someone has to keep correct.

**Row 6 is the one §21 singles out.** Divergence 8 says *"Workload containers can
reach the developer's own machine… the host remains reachable. Egress policy must
deny the host gateway except for the ports an app actually needs, and S6 must test
it."* Measured: the host is **not reachable at all** from an app network, while the
same two ports answer immediately from a `bridge` container — so the ports are
genuinely open and it is the app network that cannot get to them. This is stronger
than the spec's own mitigation, and it is the basis of the first spec action below.

**Row 8 is a different kind of fact from rows 2–7.** Those are *"there is no
route"*. Row 8 is *"there is a route, to exactly one place, and it says no"* — the
forced egress proxy answering **403** rather than the connection failing. Both are
needed: D18's default-deny is only meaningful if an app that declares a destination
can reach it, which is what makes the 403 a decision and not an outage.

**Row 2's positive control deliberately targets Caddy's admin API rather than the
control plane.** Two reasons, and the second was measured. The admin API is the
juicier target — anything that reaches it can rewrite the routing table for every app
on the machine — and it is a platform container that is up whenever `make up` has run,
whereas the control plane is a host process that may not be. Aimed at the control
plane, this control failed honestly the moment that process was stopped, which is the
control working but also makes the tier depend on something it does not require.

**Row 10's control is the one that would have rotted quietly.** `CapEff: 0000…` is
also what you would read if the field had moved, the probe had run in the wrong
container, or `grep` had matched nothing. `00000000a80425fb` from an unhardened
container of the same family is what makes the zero mean something.

---

## What did not work

- **The first run of the tier failed on its two POSITIVE controls, and that is the
  system working.** `exitCode()` forced `--dns 10.89.0.53` on every probe, including
  the `bridge` ones — and `10.89.0.53` lives on the platform network, so a bridge
  container cannot reach it. Both controls came back **exit 6**, indistinguishable
  from the denial they exist to disprove. Had the same mistake been made only on the
  denial side, the matrix would have reported twelve confident greens measuring
  nothing. The probe now keeps Docker's embedded resolver on `bridge`, which is what
  knows `host.docker.internal`.
- **Probe 7's positive control needs the internet, and the rest of P3 runs offline.**
  Rather than let it fail or quietly pass, the suite probes once for reachability and,
  when there is no route, **prints that the pairing could not be made** and leaves the
  denial unpaired *out loud*. An unpaired denial is worth recording; an unpaired
  denial reported as a green is not.
- **`node:22-alpine`'s digest here is `sha256:1ef15d33…`, not the `sha256:c610fcdf…`
  in `infra/images.lock`.** Those are the same tag: the lock records what Docker Hub
  returned (a multi-arch index) and the local registry answers with the single-arch
  manifest `docker pull` selected on arm64 and `docker push` republished. The
  blueprint pins the registry's, because that is the only one an offline build can
  resolve.

---

## Spec actions

**Proposed, not applied.** Changing the spec is Rich's call.

| Section | Current text | Proposed change | Why |
|---|---|---|---|
| §21, divergence 8 | *"Workload containers can reach the developer's own machine… the host remains reachable"* | Narrow it to **platform and builder containers only**. App networks are `--internal` and have **no route to the host gateway**, so this is no longer a weakening for workloads. | Measured above: exit 6 from an app network, exit 0 from a bridge container to the same ports. This is the action P3's plan deliberately deferred *until Task 18 had measured it* — the wording follows the matrix rather than preceding it. |
| §16, *Security regression* | *(the tier)* | State that each denial in the tier is **paired with the same probe succeeding** from somewhere it should, and that an unpairable control must be reported as unpaired rather than omitted. | A matrix of denials with no positive control looks identical to a matrix where the probe tool is missing — and this run's first attempt produced exactly that, on the control side, where it was loud. |
| §12, *isolation* | `isolationLevel` is recorded as an open question | Record the measured answer for **staging/production apps: `container`**, and state explicitly that the **sandbox** question stays open until S5. | Answered for what was tested, and only for that. |

---

## Open questions

- **Is `container` isolation sufficient for SANDBOXES?** Not answered here, and
  deliberately. **S5** runs an agent inside a sandbox; §11 gives sandboxes `exec`, a
  wider egress baseline and session-scoped AI keys, and none of those exist in P3. A
  staging app shares the hardening baseline but not the threat model.
- **LiteLLM's `allowed_routes` probe is P4's.** §16 lists *app → LiteLLM's admin
  routes* in this tier. Keys are P4's, so the probe lands there, with the negative
  control S3 already specifies: *a key minted without `allowed_routes` is the
  negative control* — it can mint a child key that **survives revocation of its
  parent**.
- **No positive control exists locally for row 3.** There is no cloud metadata
  endpoint on a laptop, so *"unreachable"* is asserted alone. On UBC infrastructure
  this is the probe that matters most, and it should be re-run there.
- **Row 6's positive control covers `:6333` only.** `:27017` was measured as denied
  from the app network but its bridge-side control was not run; one port is enough to
  establish that the host's published ports are reachable from a bridge container,
  which is the property in question.

---

## Machine state

Nothing persistent was added. The suite creates `mf-fixture-s6-*` and
`mf-fixture-s6nb-*` containers, networks and volumes and removes them in `afterAll`;
`make reset` removes any survivor of a crashed run, since everything it creates
carries the `mf-` prefix. The four pre-existing containers this project must not
disturb — `docker-simple-saml-saml-idp-1`, `qdrant-local-dev`, `mongodb`,
`mongo-express` — were untouched, and two of them were **used as positive-control
targets** from a bridge network, read-only, on ports they already publish.
