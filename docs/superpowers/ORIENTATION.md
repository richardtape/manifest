# Orientation — read this first

**You are picking up a project whose design is finished, whose first three
implementation plans are written and EXECUTED, and whose fourth — P4a — is written
and waiting to be run.** This is the single entry
point: what Manifest is, what has been established, what the machine will do to
you, and what to do next. It is written for someone with **no prior context** —
a new agent with a fresh window, or a developer joining.

*Last verified 2026-09-07.* Two things in this file state current status and will go
stale: §2 and §7. **The roadmap's ledger outranks both** — it is the maintained
record. Everything else here is durable.

---

## 1. What Manifest is, in four sentences

Manifest is a self-hosted internal developer platform for UBC. A faculty member
describes an application in plain language, an AI agent builds it, and Manifest
deploys it — authenticated with UBC's CWL single sign-on, running on UBC
infrastructure — without the faculty member ever seeing a container or a YAML file.

The design is **approved and complete**. The whole platform must run on one laptop,
offline after a one-time seeding step, and that constraint (**C1**) shapes almost
everything.

---

## 2. Where things stand

**Five spikes are done. P1, P2 and P3 are written and EXECUTED**, the last of them on
2026-09-07. The platform runs offline, the control plane serves HTTP on 7100 with the
real Docker driver, and `make demo` takes an application from a bare git repository to
a healthy `https://…manifest.internal` URL.

**P4 was split into P4a and P4b on 2026-09-07 (Rich's call), and P4a is WRITTEN —
15 tasks, not yet executed. EXECUTING P4a IS THE NEXT JOB.** See §7d. P4b is
deliberately unwritten until P4a has run. **P3's six proposed spec actions were all
applied on 2026-09-07**, with Rich's approval, so §8's list of things awaiting him is
shorter than it was.

| | State |
|---|---|
| **Spikes** | S7, S2, S1, S3 — **all four answered yes**, each far inside its timebox. Their spec changes are applied. **S6 has since run too, as P3's Task 18, 2026-09-07: every probe denied, every denial paired with a positive control, and one result BETTER than the spec** — §21's divergence 8 no longer holds, because app networks are `--internal` and the developer's machine is unroutable rather than merely policed. S5 and S4 are deliberately later (S5 follows S6, S4 precedes Phase 4). **Nothing is waiting on a spike.** |
| **Plans** | **P1, P2 AND P3 ARE EXECUTED; P4a IS WRITTEN AND UNRUN.** P1 (13 tasks) and P2 (21 tasks) on 2026-09-05; **P3 (19 tasks) on 2026-09-07**. **P0** (spike briefs) is written. Executing them found **152 defects** in plans that had all been self-reviewed first — P1 18, P2 52, **P3 82 across five sessions, 4.3 per task**, the highest rate measured here. P3's own self-review found seven, the worst being that **nothing wired the Docker driver into the boot entry point**, so its `make demo` would have passed against the fake driver; P2's execution hit that same defect in P2, and **P3's execution hit a third instance of it** — `waitForReady` and `edgeProbe` were built in Task 14 and nothing called them until Task 17. **P4a is WRITTEN (2026-09-07, 15 tasks) and is the next thing to execute**; P4b and P5 are unwritten — see §7. |
| **Code** | **The platform runs, and so does the control plane.** P1 shipped `Makefile`, `infra/` and `scripts/`: split-horizon DNS, the custom `xcaddy` edge, Postgres with three databases, registry, Verdaccio, a native egress proxy, rootless BuildKit, LiteLLM and the Manifest IdP — `make seed / up / down / reset / doctor / verify`. **`make doctor` 14 checks / 0 failed, `make verify` 31 checks / 0 failed, both green offline.** P2 then shipped the whole control plane: `spec/`, `blueprints/`, `db/`, `errors/`, `runtime/`, `source/`, `identity/`, `projects/`, `releases/` and `api/` — a Fastify server on **7100** with D23.6 idempotency, the D23.7 error envelope, the §13 capability model and the §16 authorization contract suite. **224 tests via `pnpm test`**, and the full lifecycle runs in **~300 ms** against the fake driver. **P3 has since added `runtime/docker/` (fourteen files: the Engine API client, the `mf-` naming scheme, §12's hardening, per-app networks, the forced egress proxy, `services/`, the instance lifecycle, log demux and exec, the registry token issuer, the ephemeral builder), `services/`, `build/` and `api/routes/registry-token.ts`** — `pnpm test` **332** and a second tier, `pnpm test:docker`, **48**. |
| **Spec** | Current. Every spike's actions have been applied with Rich's explicit approval, and P2 raised a fifth change — the §11/§23 hostname disagreement, settled 2026-08-31. **Trust the spec over the spike briefs**, which are deliberately preserved as a record of what was originally asked. |

The immediate work is **executing P4a** — see §7d. Writing it found **four live
defects in the running platform** before a line of it was executed, every one of them
green under `make verify` 34/0: the Manifest IdP could not issue an assertion at all,
attribute release failed open, the `ubcEduCwlPuid` OID matched nothing the library
maps, and `MONGODB_DB_NAME` was never injected. They are in §4 below and in P4a's
*Findings this plan is built from*.

---

## 3. The document map

Read for your purpose, not front to back. The spec is ~2,340 lines; nobody reads it all.

| You are… | Read |
|---|---|
| **new, any role** | This file. Then the roadmap's *Spike status* ledger and *Lessons*. |
| **executing a plan** | ← **this is the current job (P4a).** [`plans/2026-09-07-p4a-identity-secrets-injection.md`](plans/2026-09-07-p4a-identity-secrets-injection.md), 15 tasks, self-contained by construction — if it is not, that is a defect in the plan, so fix it there as you go. **Read P3's *What executing this plan found* first anyway**, especially Sessions 4 and 5: between them they establish that no build and then no deploy had ever succeeded, both invisible behind a green suite. |
| **writing a plan** | P4b is next, **after P4a executes**. Its scope and every seam it inherits are already recorded in P4a's *What this plan does not build*. House style: `plans/2026-08-30-p1-local-substrate.md`, `2026-08-29-p2-control-plane-spine.md`, or P4a itself. |
| **running the platform** | [`RUNBOOK.md`](RUNBOOK.md). `make seed && make host-setup && make up`. |
| **writing code** | Thirteen modules exist: `spec/`, `blueprints/`, `db/`, `errors/`, `runtime/` (with `runtime/docker/`), `source/`, `identity/`, `projects/`, `releases/`, `api/`, and P3's `services/`, `build/` and `routing/`. Read `runtime/driver.ts` and `runtime/driver-contract.ts` first — everything else is built against them — then `runtime/docker/driver.ts`, which is the one implementation of that interface and where every P3 module meets; then `api/server.ts` for how a request becomes an actor, and `projects/authz.ts` for the one function every route's security depends on. **Then run `make demo` once**: it is the only thing that exercises all of it through the real HTTP surface, and it is where the last four sessions' worst defects were found. |
| **changing the spec** | Don't, without asking. It is marked *Approved design*. Record the proposed change and Rich decides — that has been the pattern five times. |

```
docs/
├── external-track.md       the UBC IAM / PIA work that runs in parallel
│                           (NOTE: docs/, not docs/superpowers/)
docs/superpowers/
├── ORIENTATION.md          ← you are here
├── RUNBOOK.md              HOW TO RUN THE PLATFORM. Start here to use it.
├── specs/
│   ├── 2026-08-29-manifest-platform-design.md    AUTHORITATIVE. 27 sections.
│   └── manifest-*.html                            plain-language versions for
│                                                  non-engineers; markdown wins
├── plans/
│   ├── 2026-08-29-plan-roadmap.md                 THE LEDGER. Status lives here.
│   ├── 2026-08-29-phase-0-spike-briefs.md         P0. Historical record.
│   ├── 2026-08-29-p2-control-plane-spine.md       P2. 21 tasks, ALL EXECUTED.
│   ├── 2026-08-30-p1-local-substrate.md           P1. 13 tasks, ALL EXECUTED.
│   ├── 2026-08-31-p3-docker-driver-deploy-spine.md
│                                                  P3. 19 tasks, ALL EXECUTED
│                                                  2026-09-07. S6 ran as Task 18.
│                                                  Proposed six spec actions; all
│                                                  APPLIED 2026-09-07.
│   └── 2026-09-07-p4a-identity-secrets-injection.md
│                                                  P4a. 15 tasks, WRITTEN AND UNRUN.
│                                                  ← EXECUTE THIS NEXT. Records the
│                                                  four live defects found while
│                                                  writing it, and P4b's whole scope.
└── spikes/
    ├── S7-findings.md  DNS, the edge, TLS       ← P1's content
    ├── S2-findings.md  SimpleSAMLphp metadata   ← P4's shape
    ├── S1-findings.md  Docker round-trip        ← P3's content
    ├── S3-findings.md  LiteLLM, Ollama, budgets ← P4's AI half
    ├── S1-controls-settled.md  the two controls S1 left to P3, probed
    │                           2026-08-31 before P3 was written. Scoped
    │                           registry tokens work; the builder's bounds
    │                           are three mechanisms and one of them
    │                           does not exist.
    ├── START-HERE.md   the ORIGINAL spike briefing. Historical; §6 is wrong.
    └── HANDOFF-2026-08-3*.md  dated handoffs. BOTH SUPERSEDED by this file.
                               Kept as a record; do not act on either.
```

**And the code.** P1 added the whole `infra/` and `scripts/` tree on 2026-09-05 —
`Makefile`, `infra/compose.yaml` and the ten platform services, `scripts/doctor.sh`
and `scripts/verify.sh`. Below is the TypeScript tree as of 2026-09-05, after **all
21 of P2's tasks**:

```
.nvmrc  package.json  pnpm-workspace.yaml  tsconfig.base.json
eslint.config.js  vitest.workspace.ts          the workspace (P2 Task 1)
vitest.config.ts                               ROOT: fileParallelism: false. It is a
                                               root-level option and does nothing in
                                               the package config          (Task 18)
.prettierrc  .prettierignore                   Prettier owns packages/ ONLY —
                                               without the ignore, `pnpm format`
                                               rewrites the approved spec
blueprints/fixture-node/                       the on-disk blueprint    (Task 7)
    blueprint.yaml  Dockerfile.tmpl  skeleton/  agents/
packages/control-plane/
├── drizzle/0000_*.sql           the first migration, applied  (Task 8)
├── drizzle.config.ts
├── vitest.config.ts             setupFiles + globalSetup
├── vitest.env.ts                ensureDatabaseUrl() — .env → MANIFEST_DATABASE_URL
├── vitest.setup.ts              per file; calls it
├── vitest.global-setup.ts       ONCE per run: truncates the §6 tables, so a run
│                                never inherits the last one's rows   (Task 18)
└── src/
    ├── index.ts                 BOOT. loadConfig, buildServer, listen 7100 (Task 17)
    ├── config.ts                env parsing + the dev-auth kill switch    (Task 12)
    ├── module-boundaries.test.ts   the §5 rule, enforced by a test that resolves
    │                               imports and compares modules. THE enforcement —
    │                               the ESLint rule was removed, see Task 17's notes
    ├── lifecycle.test.ts        P2's acceptance: the whole journey, ~300ms (Task 21)
    ├── errors/index.ts          ManifestError + ManifestValidationError   (Task 3)
    ├── spec/
    │   ├── schema.ts            the §7 v1 zod schema                      (Task 2)
    │   ├── errors.ts            zod issue → stable code + hint            (Task 3)
    │   ├── policy.ts            catalogues, whitelist, quota, D17         (Task 4)
    │   ├── diff.ts              isSensitiveDiff, the D9 gate              (Task 5)
    │   ├── resolve.ts           §7's THREE-layer override merge          (Task 16)
    │   └── index.ts             THE module's public surface
    ├── blueprints/
    │   ├── descriptor.ts        §25 blueprint.yaml schema                 (Task 6)
    │   ├── compatibility.ts     checkBlueprintCompatibility — called from the
    │   │                        build route, not at validation time      (Task 19)
    │   ├── registry.ts          load, resolve name@major                  (Task 6)
    │   └── index.ts
    ├── db/
    │   ├── schema.ts            the ten §6 tables P2 writes               (Task 8)
    │   ├── client.ts            Drizzle over pg, from MANIFEST_DATABASE_URL
    │   ├── testing.ts           withRollback, AND resetDatabase — the second
    │   │                        because withRollback does not isolate you from
    │   │                        rows somebody else COMMITTED             (Task 18)
    │   └── index.ts
    ├── runtime/
    │   ├── driver.ts            the §11 Driver interface                  (Task 9)
    │   ├── fake-driver.ts       in-memory implementation                  (Task 9)
    │   ├── driver-contract.ts   THE SHARED SUITE P3 IMPORTS UNCHANGED    (Task 10)
    │   ├── state-machine.ts     §11 transitions + IDLE_POLICY            (Task 11)
    │   └── *.test.ts
    ├── source/                  D5 driver 1: bare repos on disk          (Task 15)
    │   ├── git-driver.ts        the provider interface driver 2 replaces
    │   ├── local-driver.ts      ~130ms per createRepository — seven git calls
    │   └── index.ts
    ├── identity/                roadmap gap 3. P4 DELETES this module    (Task 13)
    │   ├── session.ts           signed, expiring cookies; no sessions table
    │   ├── dev-auth.ts          four named test users, never arbitrary text
    │   └── index.ts
    ├── projects/
    │   ├── authz.ts             §13 capabilities; stranger → NOT_FOUND,  (Task 14)
    │   │                        member-without-capability → FORBIDDEN
    │   ├── repository.ts        createProject + all three environments at once
    │   └── index.ts
    ├── releases/                §5's build/ lives in here for P2         (Task 16)
    │   ├── build.ts             a failed build is a ROW, not an exception
    │   ├── release.ts           immutable releases; deploy waits for health
    │   └── index.ts
    ├── routing/                 P3 Tasks 13-14. §23 hostnames -> Caddy routes
    │   ├── hostnames.ts         listenerFor, routeIdFor
    │   ├── caddy.ts             the admin client. node:http, NOT fetch — Caddy
    │   │                        refuses any request carrying an Origin header
    │   ├── routes.ts            applyRoute / removeRoute / reapplyAllRoutes
    │   └── readiness.ts         waitForReady + edgeProbe, which runs FROM a
    │                            container, over HTTPS, with the platform CA.
    │                            CALLED BY DockerDriver.ensureInstance — it was
    │                            called by nothing at all until Task 17
    ├── build/                   P3. source+spec -> digest, with §12's gates
    │   ├── context.ts           assembleContext. TWO processes, never a pipe:
    │   │                        `git archive | tar` takes tar's exit status
    │   ├── gates.ts             secret + lockfile, platform-mandatory
    │   └── scan.ts              Syft SBOM, Grype, the staleness rule
    ├── services/                P3. dedicated Mongo per app+environment (D3)
    └── api/
        ├── server.ts            Fastify, session hook, idempotency hook  (Task 17)
        ├── errors.ts            the D23.7 envelope — every failure exits here
        ├── idempotency.ts       D23.6; replay same body, 409 on a different one
        ├── testing.ts           testDeps — blueprints resolved from import.meta.url
        ├── authz-contract.ts    THE SHARED SUITE P3 IMPORTS UNCHANGED    (Task 20)
        ├── routes/auth.ts       dev login, me, logout
        ├── routes/projects.ts   projects, members, and POST .../spec — the ONLY
        │                        way a project's manifest.yaml can change after
        │                        creation, and isSensitiveDiff's one call site
        ├── routes/delivery.ts   builds, releases, deploy, environments   (Task 19)
        └── index.ts
```

Plus, from P3: `fixtures/fixture-app/` (the build target — `server.js` at the tree
root, because the blueprint's `CMD` is not templated), `scripts/demo.sh`, and
`src/runtime/docker/{roundtrip,s6}.docker.test.ts`, which are the two suites that
exercise the whole thing rather than a part of it.

`pnpm test` → **381 tests**, **run from the repo root** (`pnpm test`,
not `pnpm --filter … test` — the two set a different working directory, and that
difference was a defect). Everything that touches `src/db/` or `src/api/` needs
`make up`; the rest needs no Docker, no Postgres and no network. The connection string
is derived from `.env` automatically.

Also `pnpm lint`, `pnpm --filter @manifest/control-plane typecheck` and
`pnpm format:check`. **All four must be clean before you commit, and the last two are
not formalities** — Vitest strips types without checking them, so `tsc` is the only
gate that sees a whole class of error (it caught six in P2), and `format:check` was
silently red on 29 files. **Run `pnpm test` twice:** a suite that is not repeatable
has a state leak, which is how five of P2's defects were found.

**Which spec sections matter, by topic:** §7 the `manifest.yaml` contract · §9 identity ·
§10 AI access · §11 execution model and the `Driver` interface · §12 networking,
secrets, the builder, supply chain · §13 releases · §16 testing tiers · §20 security
architecture · §21 local topology · §22 the public API · §23 hostnames · §25
blueprints. Decisions are **D1–D32** in §4; constraints **C1–C6** in §3.

---

## 4. The machine, and what it will do to you

**This section is the one that saves you a morning.** Every item was paid for by a
spike. It was previously stranded inside a superseded handoff; it lives here now.

### Laravel Valet owns things you will want

- **Valet owns the `.test` TLD, port 53, and ports 80 and 443.** A Homebrew dnsmasq
  2.91 runs as `nobody` on `127.0.0.1:53` answering `address=/.test/127.0.0.1`, and
  the nginx on 80/443 is Valet's. **Never touch any of it** — Rich needs it, and
  other UBC developers run it too.
- **This is why the zone is `*.manifest.internal`**, not `*.manifest.test`. ICANN
  reserved `.internal` in July 2024 for exactly this.
- **The resolver file is scoped to `manifest.internal`, never all of `.internal`** —
  Docker's own `host.docker.internal` lives in that TLD.
- **Caddy binds `127.0.0.2`**, a loopback alias, so Valet keeps `127.0.0.1:443`. The
  alias **does not survive a reboot**; `can't assign requested address` means it is
  gone.

### The toolchain, and what executing P2 put on this machine

- **Node is 24, not 22.** nvm has only `v24.12.0`; there is no Node 22 on this
  machine. P2's plan originally pinned 22 for no reason that survived checking — the
  spec names no Node version, no spike treated it as a variable, and the only evidence
  was `passport-ubcshib`'s `">=22.0.0"`, which is a floor. **Repinned to 24**
  (2026-08-31, Rich's call). Nothing was tried on 24 and found wanting.
- **The app-side base image is still `node:22-alpine`** and is a *separate* decision:
  it is what faculty apps run in, S1 recorded its digest and mirrored it into the
  local registry, and P1 references it in three places including the offline test.
- **`pnpm` was added via `corepack enable pnpm`** — pnpm 11.24.0, a shim in
  `~/.nvm/versions/node/v24.12.0/bin/`. User-owned, **no `sudo`**, reversible with
  `corepack disable pnpm`. This is the only host change P2's execution made.
- **pnpm 11 blocks dependency install scripts by default**, as a hard error, so
  `pnpm test` will not run until they are allowed. The key is `allowBuilds` in
  `pnpm-workspace.yaml`; pnpm 10's `onlyBuiltDependencies` is still *read back* by
  `pnpm config get` but has no effect, which makes hand-writing it look like a
  mystery. Use `pnpm approve-builds <pkg>`.

### What is a container, and what is actually on this machine

**Almost nothing Manifest runs is installed on the Mac.** This is worth stating
plainly because every list of "absent" images in this project reads like a missing
dependency and is not one. §21's inventory is the authority; this is its summary.

**Host-resident, and only these:**

| | Why it cannot be a container |
|---|---|
| **Ollama** | Metal GPU access is unavailable from a container |
| **The control plane** (Node, 7100) | It needs the Docker socket, which §12 forbids mounting into *workload* containers. Running it on the host sidesteps the question and iterates faster. It **cannot reach container IPs** on Docker Desktop (S1), so health checks go through the edge or a published port |
| **Admin UI (7101), `manifest-mock` (7102), reference console (7104)** | Vite dev servers |

**Everything else is a container**: Caddy, Postgres, the registry, Verdaccio,
LiteLLM, the Manifest IdP, both dnsmasq processes, the egress proxy, the builder, and
the Syft/Grype scanners. So:

- **Caddy is never `brew install`ed.** It is a **custom `xcaddy` build** (§20), because
  S7 established that **Coraza pins the Caddy version**. `make seed` builds that image.
  `caddy: ABSENT` from a host-tool check means nothing at all.
- **Syft and Grype are transient per build** (§21: *"Scanner + SBOM — transient, per
  build"*). P3 Task 12 runs each as a throwaway container against the Docker socket.
- **The Manifest IdP is ours and is built from scratch** — `infra/idp/Dockerfile`,
  `FROM php:8.3-apache` plus `composer create-project simplesamlphp/simplesamlphp:^2.0`,
  its own `manifest_idp` database, on **port 7122 deliberately not 6122**. It has **no
  dependency on `/Users/rich/Developer/docker-simple-saml`** running, or existing.
  That repository is read-only to us and stays clean; what S2 took from it was
  knowledge — `pdo_pgsql` needs `libpq-dev`, `database.*` and `store.sql.*` are
  different subsystems, one `INSERT` into `saml20_sp_remote` registers an SP — not code.

**The images `make seed` must therefore fetch or build include** `caddy:2.11.4` and
its builder, `anchore/syft`, `anchore/grype`, `php:8.3-apache` and `composer:2` —
none of which are on this machine today. Seed is the one step that needs the network,
which is why P1's **offline** acceptance can only run after a successful seed.

### Rules of engagement

- **`sudo` cannot prompt from a tool call.** You get
  `sudo: a terminal is required to read the password`. Bundle privileged steps into
  one script and ask Rich to run `! sudo bash <path>` in his terminal. **Ask before
  anything needing `sudo`** — standing instruction.
- **The machine must end up exactly as it started.** Snapshot before you change
  anything. Every spike has met this bar and Rich has confirmed each teardown.
- **Pre-existing containers that must survive**: `docker-simple-saml-saml-idp-1`,
  `qdrant-local-dev`, `mongodb`, `mongo-express`.
- **Work on a copy.** `docker-simple-saml` and `ubc-genai-toolkit` are read-only to
  you unless told otherwise; both are currently clean and must stay that way.

### Numbers

- Ports in use by other things: **6122** (`docker-simple-saml`), **27017** (mongodb),
  **6333/6334** (qdrant), **8081** (mongo-express), **11434** (Ollama), plus 80/443/53.
  The **7100–7199** block was entirely free.
- Docker VM memory is **8.32 GB decimal / 7.75 GiB binary** — passes or fails §21's
  "≥8 GB" floor *depending on the unit*, which is why the spec now states the unit.
- Host: 36 GiB RAM, 12 cores, ~163 GiB free. **macOS 26.6.2 (build 25G83)** — the
  machine was updated; §4 said 26.5.2 until 2026-09-04. arm64, Docker Engine 29.7.2,
  which serves **API 1.55, minimum 1.40** (so P3's deliberate `v1.44` pin is inside
  the window).
- **macOS ships bash 3.2 and a BSD userland.** No associative arrays, no `mapfile`,
  no `xargs -r`, no `readlink -f`. A script that needs Homebrew bash 5 is a C1 defect.

### Things that will cost you a morning

- **`--local=/manifest.internal/` is mandatory** on dnsmasq. Without it AAAA returns
  **SERVFAIL** instead of NODATA, and both musl and glibc treat SERVFAIL on either
  half of a dual-stack lookup as total failure. The symptom is
  `curl: (6) Could not resolve host` **while `dig +short` returns the correct A
  record.** The single most misleading failure in the project so far.
- **`--server=127.0.0.11` is mandatory.** Without it `--no-resolv` makes dnsmasq
  authoritative for everything and containers lose Docker service names *and*
  external resolution.
- **`--address` is global to a dnsmasq *process*.** Verified. That is why there are
  two dnsmasq containers rather than one with two listeners.
- **On Docker Desktop, `--dns` sets the *upstream*** for Docker's embedded resolver
  rather than replacing it. `/etc/resolv.conf` still says `nameserver 127.0.0.11`.
  Good news — service names survive. Do not conclude `--dns` is ignored.
- **Caddy admin API: `PUT` inserts, `POST` appends** — and appending puts your route
  behind the wildcard whose `terminal: true` swallows it.
- **A host process cannot reach container IPs** on Docker Desktop, so health checks
  go through the edge or a published port.
- **`localhost` resolves to `::1` and times out** in build tooling. Use `127.0.0.1`.
- **Restarting Caddy discards all runtime routes.** Route *changes* under load are
  safe: 0 failures in 400 requests across 12 add/remove cycles.
- **User-namespace remapping silently does nothing** on Docker Desktop. Every other
  §12 hardening flag genuinely enforces.
- **LiteLLM serves admin and proxy traffic on ONE port.** There is no admin port to
  firewall; confinement is per-key `allowed_routes`.
- **Most Ollama models on this machine are *thinking* models**, and that breaks
  streaming silently: zero content frames, no error, at any token budget.
- **`node src/index.ts` does not work here**, even though Node 24 strips TypeScript
  types natively. The source uses NodeNext `.js` specifiers and Node resolves them
  **literally**, so it looks for `src/api/index.js` and does not find it. Compile
  with `tsc` and run `dist/index.js`. `pnpm --filter @manifest/control-plane dev`
  does both.
- **`pnpm test` and `pnpm --filter … test` are not the same command.** The filtered
  form runs with the *package* directory as its working directory; the root form does
  not. Any cwd-relative path in a test passes under one and `ENOENT`s under the other.
  **`pnpm test` from the repo root is the one that counts** — it is what CLAUDE.md
  requires before a commit.
- **`node --experimental-strip-types` cannot run this repo's TypeScript either**, and
  for a *different* reason from the one above: strip-only mode rejects **parameter
  properties**, and `EngineError`, `ScanError`, `BuildGateError` and `ConfigError` all
  use them — `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. So a throwaway `node -e` script that
  imports a `.ts` file to poke at it does not work. Write a scratch **test** instead,
  or drive the thing through `docker`/`curl` directly.
- **A `sed`/`python .replace()` negative control silently matches nothing after
  Prettier has reformatted its target — and every test then passes.** That reads as
  *"the control cannot fail"* and means *"the control never ran"*; it happened on
  2026-09-06 while proving a scan rule, and it is the same shape as every other
  could-not-fail check this project has paid for. **Assert the pattern matched before
  writing the file.** A `git diff` after the edit is the other cheap proof.
- **Vitest strips types; it does not check them.** A file can pass every one of its
  tests and have four `tsc` errors. `pnpm --filter @manifest/control-plane typecheck`
  is the only gate that sees them, and this repo's `exactOptionalPropertyTypes` makes
  that class common: `hint: cond ? x : undefined` is a type error, conditional spread
  is the fix.
- **`fileParallelism` is a ROOT-level Vitest option.** Setting it in a package's
  `vitest.config.ts` has no effect on a workspace run, and the symptom is a suite that
  fails a *different* number of tests on each run.
- **A shell PIPELINE takes its exit status from the LAST command**, so
  `git archive … | tar -x` reports success when `git` dies. Measured 2026-09-07:
  `git --git-dir=file://… archive HEAD` exits **128** and the pipeline exits **0**,
  which made every failed build-context export produce an empty directory and a
  clean bill of health. `set -o pipefail` is not available in `execFile('sh', …)`
  by default — run the two commands separately.
- **BusyBox `wget` honours `http_proxy` and does not support `NO_PROXY` at all.**
  On BusyBox v1.37.0 a container health check of its own `127.0.0.1` is sent to the
  egress proxy and comes back `403 Filtered`. `wget -Y off` is the switch. This
  silently marked every deployed app `unhealthy` while it was serving perfectly.
- **`request.log.error` under `Fastify({ logger: false })` writes nothing** — it
  exists and accepts the call. Same trap as `app.log.info` on the boot line. Use
  `console.error` for anything an operator must be able to see.
- **An unqualified image name is DOCKER HUB to the daemon.** `local/chem-labs@sha…`
  resolves as `docker.io/local/chem-labs` and 401s. Record the repository the build
  produced; never re-derive it from a slug.
- **`docker network rm` fails while ANY container is still attached**, and the app
  networks always have two: `ensureAppNetwork` attaches `manifest-caddy` and
  `manifest-dns-containers` to every one of them by design. `make reset` only worked
  because `compose down` ran first and stopped them — correctness by accident of
  ordering, with `|| true` hiding the failure. It now disconnects them explicitly.
  Measured 2026-09-07: five app networks survived a cleanup that reported success.
- **`docker rm` without `-v` orphans the container's anonymous volumes**, and
  `mongodb/mongodb-community-server` declares **two** volumes while the driver binds
  only `/data/db`. `moby/buildkit` likewise declares one the ephemeral builder does
  not bind — harmless while the process lives, because the driver deletes with
  `v=true` in a `finally`, but one empty volume per build leaks if the control plane
  is killed mid-build. **`docker volume ls -f dangling=true` is NOT a safe prune
  list**: it includes *named* volumes that merely have no container attached, so it
  lists `manifest-caddy-data` — the trusted CA — and other people's volumes. List and
  date them, then remove by id.
- **`registry garbage-collect` on a RUNNING registry corrupts it.** It deletes the
  manifest blob and leaves the tag and revision links, after which every `docker
  push` of the same content reports success **with the correct digest** while the
  registry answers 404. Stop or restart the registry around a GC.
- **This `registry:2` does not split a comma-joined `Accept` header**, and mirrored
  base images are **OCI** manifests. Pass separate `-H 'Accept: …'` flags including
  `application/vnd.oci.image.manifest.v1+json`, or you get a 404 that reads exactly
  like a missing image: `OCI manifest found, but accept header does not support OCI
  manifests`.
- **npm's `replace-registry-host` defaults to `npmjs`**, so a mirror redirect only
  applies to lockfiles whose `resolved` URLs name registry.npmjs.org. Any other host
  is fetched directly, past the mirror. `replace-registry-host=always` is what D13
  actually means.
- **`pnpm test` TRUNCATES the control plane's §6 tables** — `vitest.global-setup.ts`
  does it once per run, deliberately, so a run never inherits the last one's rows.
  It also means running the suite wipes whatever `make demo` created.
- **The Manifest IdP could not issue an assertion, and `make verify` was 34/0.**
  Measured 2026-09-07: the image ships only `saml20-idp-hosted.php.dist` and an empty
  `cert/`, so `/module.php/saml/idp/metadata` answered **500** —
  *"Could not find any default metadata entities in set [saml20-idp-hosted]"*. Verify
  checked that the IdP served a page, that `pdo_pgsql` was present and that a row
  round-tripped through the metadata handler; none of that touches signing. **P4a
  Task 1 fixes it.** The general lesson is the one this project keeps re-learning: a
  check that does not complete the operation proves the operation can start.
- **SimpleSAMLphp 2.x's endpoint paths are not 1.x's, and `passport-ubcshib`
  hardcodes 1.x's.** `UBC_CONFIG.LOCAL` carries
  `/simplesaml/saml2/idp/SSOService.php`; 2.x serves
  `/module.php/saml/idp/singleSignOnService`, `…/singleLogout` and `…/metadata`
  (read off the running container's `routes.yml`). This is why §8 makes
  `SAML_ENTRY_POINT` mandatory, and a 404 from the IdP reads as "the IdP is down".
- **`core:AttributeLimit` is not in SimpleSAMLphp's default chain**, so a metadata
  row's `attributes` list is advisory — S2 measured three declared and thirteen
  released. An empty list is also treated as "no limit". Both fail **open**, silently,
  and both were live here until P4a Task 2.
- **The OpenAI SDK cannot be forced through an HTTP proxy by any environment setting.**
  Measured 2026-09-07 against three mechanisms: `http_proxy` is ignored; undici's
  `setGlobalDispatcher(new ProxyAgent(…))` fixes global `fetch` and **not** the SDK;
  a patched `http.globalAgent` is bypassed too. The SDK bundles `node-fetch` and
  supplies its own `agentkeepalive` agent, and its only supported override is the
  `httpAgent` constructor option — which `ubc-genai-toolkit-llm` does not expose.
  So an app on an `--internal` network cannot reach LiteLLM through the egress proxy.
- **Fastify runs root-level hooks for the not-found handler too**, and an unmatched
  route has no `routeOptions.config` to opt out with. A `preHandler` that throws will
  turn every 404 into whatever it throws. Guard on
  `request.routeOptions.url === undefined`.

### Images already pulled

`postgres:16-alpine`, `registry:2`, `verdaccio/verdaccio:6`, `vimagick/tinyproxy`,
`ghcr.io/berriai/litellm:main-stable`, `node:22-alpine`, `curlimages/curl:8.11.1`,
`moby/buildkit:v0.32.2-rootless`, `mongodb/mongodb-community-server:7.0.28-ubi8`.

**That list is a hint, not a fact.** P1's execution on 2026-09-05 pulled and built
what it needed, so `caddy:2.11.4`, `alpine:3.22`, `php:8.3-apache` and `composer:2`
are now present, and four base images are **mirrored into the local registry** with
their digests pinned in `infra/images.lock` — which is what makes offline builds
work, since merely pulling is not enough. As verified on 2026-09-04, before that:
**`anchore/syft:v1.51.1` and `anchore/grype:v0.118.0` are absent** and P3 Task 12
needs them; the `alpine` present is **3.20**, not 3.22, and its digest is the one
`S1-controls-settled.md` used; and **`moby/buildkit:v0.27.0-rootless` sits alongside
the `v0.32.2` P3 pins**, so do not let a tool pick the older one.

**Take a snapshot before you touch anything:** `./scripts/snapshot-machine.sh`. It is
read-only, needs no `sudo` and no network, and runs under macOS's bash 3.2. Run it
again at the end and `diff` the two — that is how "leave the machine exactly as you
found it" stops being a memory. Today's baseline is
[`machine-baseline-2026-09-04.md`](machine-baseline-2026-09-04.md).

**What P1's execution changed, 2026-09-05.** The three host changes are now **in
place**: `/etc/resolver/manifest.internal`, the `127.0.0.2` alias on `lo0`, and the
Caddy root trusted in the System keychain. All three are reversible with
`make host-undo`. `docker-simple-saml-saml-idp-1` is still **exited, not running** —
"must survive" means do not delete it, not that it is up. Valet was verified
untouched: its config files are unmodified (mtime 2026-07-03) and its dnsmasq is the
same process it has run since 1 September.

**Valet's dnsmasq hangs, and when it does NOTHING resolves — including `.test`.**
Hit on 2026-09-05 and diagnosed. The symptom is the most misleading kind: the
process is alive, `/etc/resolver/test` is correct, the config is correct,
`nc -z 127.0.0.1 53` **succeeds** — and every query times out. It is not a `.test`
problem: `vibonarium.local` and `google.com` time out too.

A stack sample of the hung process showed all 2497 samples in one place:

```
main → receive_query → forward_query → __sendto
```

**dnsmasq was blocked in `sendto` to an upstream nameserver, and dnsmasq is
single-threaded** — so one stuck upstream send freezes the entire resolver,
including names it would have answered locally with no upstream at all. `lsof`
showed `com.cisco` (root) holding DNS sockets to UBC's nameservers 137.82.1.2 and
142.103.1.42, so **suspect the Cisco Secure Client / VPN** on connect, disconnect
or network change.

**The fix, which changes no configuration:**

```bash
sudo launchctl kickstart -k system/homebrew.mxcl.dnsmasq
```

Then `sudo killall -HUP mDNSResponder`. **Diagnose before restarting** — if
`google.com` resolves and only `.test` does not, this is *not* the problem and a
restart will not help. Manifest is not involved either way: its dnsmasq containers
publish `127.0.0.1:7153`, never 53, and the two resolvers coexist — verified with
`cms.test` → 127.0.0.1 and `console.manifest.internal` → 127.0.0.2 answering at the
same time, each served by its own web server.

**Do not read a blank port as a free port.** Without `sudo`, `lsof` cannot see sockets
owned by other users, and Valet's dnsmasq runs as `nobody` — so port 53 reads as empty
while dnsmasq is plainly listening on it. The snapshot script reported `(free)` on its
first run and that was wrong; it now says "nothing visible to this user" and explains
why. `make doctor` (P1 Task 2) will need the same care.

---

## 5. What the spikes established

Read the findings note before touching the area it covers. Do not re-derive any of it.

| Spike | Answer | What it settles |
|---|---|---|
| **S7** ~1.5 h of 3 days | **Yes**, with a zone change | Split-horizon DNS works via two dnsmasq processes. `.test` is unusable (Valet). Trust is needed in **three** places — macOS keychain, container trust stores, **and host Node processes**, because Node ignores the keychain. The custom `xcaddy` build works; **Coraza pins the Caddy version**. |
| **S2** ~0.5 h of 2 days | **Yes** | One `INSERT` into `saml20_sp_remote` registers a working SP on the next HTTP request — no file write, no reload, no restart, no cache TTL. **Manifest writes no PHP.** Attribute release fails **open**: a row with an empty `attributes` list releases everything. `pdo_pgsql` also needs `libpq-dev`. `database.*` and `store.sql.*` are different subsystems. |
| **S1** ~2 h of 3 days | **Yes** | A bare repo drives to a routed healthy container with a bound database, and **§11's `Driver` interface needed no revision**. Rootless BuildKit works — but *not* via buildx's own driver, which wraps it in a `--privileged` container. **Offline builds need base images pushed into the local registry**, not merely pulled. |
| **S3** ~2 h of 2 days | **Yes**, with three corrections | LiteLLM does everything §10 assumes and `ubc-genai-toolkit` needs no change. But **three defaults are wrong and all three fail silently** — see below. |

**S3's three, because they are the ones most likely to be forgotten:**

1. **Every key needs `allowed_routes`.** Otherwise an app key whose user came from
   `/user/new` can mint a child key **that survives revocation of its parent**.
2. **Every `embed()` needs `encoding_format: 'float'`.** Otherwise the OpenAI SDK's
   base64 default meets LiteLLM's Ollama path and you get **192 near-zero values
   where 768 floats belong** — no error, every other assertion green.
3. **The LiteLLM `user` must be `hash(puid ‖ project ‖ environment)`.** End-user
   budgets are global, so a bare PUID hash lets one app's exhaustion lock a student
   out of every other Manifest app.

---

## 6. How to work here

These conventions have held across five sessions and are why the work has stayed
coherent. Follow them.

1. **Invoke the skill.** `superpowers:writing-plans` for a plan,
   `superpowers:subagent-driven-development` or `executing-plans` to execute one,
   `superpowers:brainstorming` before creative work. If a skill applies, use it.
2. **Ask before `sudo`, and before modifying anything outside your branch.**
   Installing a global tool counts. So does touching the spec.
3. **Green before you commit:** `pnpm test`, `pnpm lint`, and
   `pnpm --filter @manifest/control-plane typecheck`. All three, every time.
4. **Record exact versions.** Image digests, package versions, macOS and Docker
   Desktop versions. A finding without a version is not reproducible.
5. **Make the judgment call, then write down why.** Rich would rather you decide a
   routine question and record the reasoning as a documented decision than block on
   asking. Reserve questions for things that are genuinely his — spec changes, host
   changes, anything irreversible. P1's *Decisions this plan makes* section is the
   pattern.
6. **Capture negative controls.** "It works" is much weaker than "it works, and here
   it is correctly failing when I remove the thing that makes it work."
7. **Write for a reader who was not there.** Every one of these documents will be
   read cold by someone with no context. That is the normal case, not the exception.
8. **Close out properly.** Update the roadmap ledger, sweep every document that
   states status, and leave the machine as you found it. **The sweep is the step that
   gets forgotten**, and forgetting it is how four documents once spent a day lying
   about the state of the project — and how the four HTML pages spent five days
   telling outsiders the project was "designed, not yet built" after it was neither.

   Sweeping by memory is what fails, so here is the list. Check each one every time:

   | Document | What in it goes stale |
   |---|---|
   | `plans/2026-08-29-plan-roadmap.md` | **The ledger — update this first, it outranks the rest.** Spike status, the plan set table, *Order of operations* |
   | `ORIENTATION.md` | §2 and §7 by design; §4 whenever the machine changes; §8 when something becomes or stops being Rich's call |
   | `README.md` | The status section, and the *Where to start* table's "current job" row |
   | `CLAUDE.md` | The *State* paragraph |
   | `specs/manifest-schematic.html` | **Shared outside the team.** The `Status` line in the header, the footer, and the "no user interface has been built yet" disclaimers |
   | `specs/manifest-phases.html` | **Shared outside the team.** The spike section — how many have run, what they answered, where the remaining ones sit |
   | `specs/manifest-decisions.html` | **Shared outside the team.** Drifts when a **decision** changes, not when status does — check it after any spec action is applied |
   | `specs/manifest-stories.html` | **Shared outside the team.** Hostname examples, which must match §23's zone rule |
   | `docs/external-track.md` | Owners and states of the UBC items |
   | `machine-baseline-*.md` | **Do not edit these.** They are dated evidence. Re-run `scripts/snapshot-machine.sh` and add a new one |

   **The four HTML pages are the easiest to forget and the most expensive to get
   wrong**, because Rich shares them with people outside the team and nothing in the
   build checks them. They are also the slowest to drift: their architecture stays
   right for months while their *status* is wrong within days.

---

## 7. What to do next — execute P4a

P1, P2 and P3 are all executed and green; S6 has reported; **P3's six spec actions
were applied on 2026-09-07**. P4 was then split into **P4a** and **P4b** (Rich's
call), and **P4a is written and unrun — executing it is the next job.**

**The measured plan-to-reality gap, in one table.** Every one of these plans was
self-reviewed before anyone executed it.

| Plan | Tasks | Defects found by READING | Defects found by RUNNING |
|---|---|---|---|
| P1 | 13 | 5 | **18** |
| P2 | 21 | 7 | **52** |
| P3 | 19 | 7 (+8 reconciling against a real P2) | **82** |

The rate never fell with practice. It rose whenever the work stopped being pure
functions, and it rose again whenever something was made to run end to end for the
first time. **Budget accordingly.** P4a is written and unrun; that table is what to expect from it.

### 7a. P1 is done *(executed 2026-09-05)*

[`plans/2026-08-30-p1-local-substrate.md`](plans/2026-08-30-p1-local-substrate.md) —
13 tasks, all executed and green. The platform runs; read
[`RUNBOOK.md`](RUNBOOK.md) to start it, not the plan.

`make doctor` is **16 checks / 0 failed**, `make verify` is **34 / 0**, and both were
green with the network off. The C1 demo holds:
`https://console.manifest.internal/` returns a byte-identical hostname and scheme
from the host and from inside a container, no port, no `-k`.

**Executing it found 18 defects in an already-self-reviewed plan**, and the shape of
them is the durable lesson: **six were checks that passed while the thing under test
was broken or absent.** **The one thing P1 did not prove: the second-machine clean
clone.** No second Mac was available; it is recorded as a gap in `RUNBOOK.md`.

### 7b. P2 is done *(executed 2026-09-05)*

[`plans/2026-08-29-p2-control-plane-spine.md`](plans/2026-08-29-p2-control-plane-spine.md)
— **all 21 tasks executed and green.** The control plane boots, serves HTTP on 7100,
and the whole lifecycle runs against the fake driver in ~300 ms.

**Executing it found 52 defects across three sittings.** The classes worth carrying:
**six type errors no test could ever catch** (Vitest strips types without checking
them); **five test-isolation defects** that made the suite pass or fail on the order
Vitest happened to pick; **two controls one edit from being live** — `/auth/dev-login`
one line from an authentication bypass, and an IDOR in `GET /builds/:id`, both
answering **200** when broken; and **nothing had ever executed the boot entry point.**

**One rule earned that batch.** *Never accept a check you have not watched fail.*

### 7c. P3 is done *(executed 2026-09-07)*

[`plans/2026-08-31-p3-docker-driver-deploy-spine.md`](plans/2026-08-31-p3-docker-driver-deploy-spine.md)
— **all 19 tasks executed and green.** The real Docker driver passes P2's
`driver-contract.ts` unchanged, and `make demo` takes an application from a bare git
repository to `https://fixture-app.staging.manifest.internal` — then does it again
from a dropped database, a deleted repository root and an emptied registry.

| | |
|---|---|
| `pnpm test` (repo root) | **381 tests**, Docker-free |
| `pnpm test:docker` | **89 tests**, ~5 min, needs `make up` |
| `make doctor` | **16 checks / 0 failed** |
| `make verify` | **34 checks / 0 failed** |

**Read Sessions 4 and 5 of *What executing this plan found* before touching any of
it.** They are the most useful pages in this repository, because between them they
establish two things that were invisible behind a fully green test suite:

- **Session 4: no BUILD in this platform had ever succeeded.** The blueprint
  Dockerfile opened with a `# syntax=` directive, which makes BuildKit fetch a
  frontend from Docker Hub before it reads line two, and §12's builder has no egress.
  Underneath it, **D13's npm-mirror control was completely inert** — `.npmrc` arrived
  after `npm ci`, so the build used the public registry.
- **Session 5: no DEPLOY had ever succeeded either.** Seven separate defects of one
  shape: **the test constructs the value correctly and the running system re-derives
  it wrongly.** A blueprint directory, a repository path, an image repository, a port.
  Every one was green in 74 Docker tests, because a test hands the driver what it
  built while the control plane rebuilds it from a slug. Plus a health check that
  every app failed — BusyBox `wget` honours `http_proxy` and ignores `NO_PROXY`, so
  D18's forced proxy denied each app's probe of its own loopback with `403 Filtered`,
  and §11 recorded working deploys as `failed`.

**S6 ran as its Task 18** and is `docs/superpowers/spikes/S6-findings.md`: twelve
probes, every denial paired with a positive control, and the app still serving at the
end so the denials cannot be a dead container. Isolation is `container`; **whether
that suffices for sandboxes is left to S5**, deliberately.

**P3 proposes five spec actions and applies none.** They are Rich's, listed at the end
of the plan, and every one is measured rather than argued. The first — narrowing §21's
divergence 8 — was deliberately deferred until Task 18 measured it, and **it now has.**

### 7d. Execute P4a — identity, secrets and the §8 contract (1b-i) ← **START HERE**

*[`plans/2026-09-07-p4a-identity-secrets-injection.md`](plans/2026-09-07-p4a-identity-secrets-injection.md)
— **15 tasks, written 2026-09-07, none executed.** Invoke
`superpowers:subagent-driven-development` or `superpowers:executing-plans`.*

The IdP finished so it can actually issue an assertion, `secrets/` envelope
encryption, `sso/` SP auto-provisioning against the SQL metadata mechanism S2 proved,
per-app keypairs, §8's injection contract and its drift test, `node-ts-mongo@1`'s auth
half, and **the deletion of the dev auth shim** (roadmap gap 3), which has a task of
its own. **Demo:** the proof app signs a real person in with CWL and writes a note —
and the instructor cannot see the student's note, which is the only assertion that
proves the app knows *who*.

**Writing it found four live defects, every one green under `make verify` 34/0.**
They are in §4 above and are what Tasks 1, 2 and 11 exist to fix. Do not assume the
platform's identity half works because the gates are green; it does not work at all
yet.

**P4b — AI, streaming, incidents — is deliberately unwritten** until P4a has run.
Writing it now would bank a second unexecuted plan and would write it against an
imagined P4a, which is exactly what cost P3 eight defects in reconciliation. Its full
scope, and every seam it inherits, is recorded in P4a's *What this plan does not
build* — including two facts already measured for it: `ubc-genai-toolkit-llm@0.7.0`
reproduces all three S3 findings, and **the toolkit cannot be forced through the
egress proxy**.

**Three S3 findings are P4b tasks, not notes** — the three in §5 above. Each needs a
§16 test attached, and each fails silently without one.

**Four things P1–P3 paid for that should shape how P4 is written.** The roadmap's P4
section carries the first three; the fourth is new to P3's last session.

1. **Schedule the end-to-end task EARLY, and drive it through the real entry point.**
   P3's two worst sessions were its last two, both because something ran together for
   the first time. P4 has more of this exposure than P3, not less: §8's injection
   contract is precisely a set of values two code paths must agree on, and its drift
   test only checks the ones somebody thought to list.
2. **A module with no call site is not built.** P3 shipped `waitForReady`/`edgeProbe`
   and nothing called them for three tasks; P2 shipped `isSensitiveDiff` and nothing
   called it for a whole plan. Both had passing tests. **Give every task a step that
   names the caller**, not only the module.
3. **Diagnosability is a feature, and its absence hides other defects.** A failed
   build recorded no reason; an unexpected 500 left no trace anywhere, because the
   handler logged through a logger the server was built without. Fixing both took
   minutes and immediately named four more defects. P4 owns events, streaming and
   redaction — so it should own this deliberately rather than inherit it.
4. **`isSensitiveDiff` and `POST /projects/:id/spec` are now wired but not gated.**
   D9's sensitive-diff is *computed and reported* by that route and deliberately
   enforces nothing, because the approval flow it feeds is **P6's**. P4 should leave
   it that way and not quietly grow a half-gate.

**Demo:** the proof app — CWL login, a Mongo write, an LLM answer — driven by `curl`.
`fixtures/fixture-app/` is P3's build target and stays trivial; §16's proof app is
`fixtures/proof-app/`, and it is P4's.

### 7e. Write P5 — contract and clients (1c) *(after P4a and P4b)*

*Depends on P4.* The published OpenAPI contract, `manifest-mock`, the generated
client, and the reference console (D22) that imports **only** the generated client —
a lint boundary *and* a test enforce it, which is what converts "is the API
complete?" from an opinion into a build failure.

**Demo:** the §1 faculty journey, clickable, driven twice over one contract.

---

## 8. Decisions waiting on Rich

Surface these; do not decide them.

- **P4a proposes five spec actions and applies none.** They are at the end of
  [`plans/2026-09-07-p4a-identity-secrets-injection.md`](plans/2026-09-07-p4a-identity-secrets-injection.md).
  The load-bearing one: **§9 still says *"`docker-simple-saml` keeps its IdP role
  here"***, naming a repository that is read-only to this project and is not part of
  the platform — P1 built a separate IdP deliberately. The others record that the
  IdP's hosted entity and signing keypair are deployment artefacts rather than
  defaults (an IdP without them serves, answers health checks and cannot sign), the
  measured SimpleSAMLphp 2.x endpoint paths for §8's `SAML_ENTRY_POINT` row, that
  `MONGODB_DB_NAME` was specified and never injected, and that §21's IdP database
  needs the two roles S2 asked for and P1 shipped one of.
- **Where the service-binding wire lands — SETTLED 2026-09-06, Rich's call: P3 Task
  15.** `deployRelease` now derives a `ServiceBinding` per entry in
  `resolved.services`, calls `ensureService`, and passes the handles through with
  the endpoint injected under the name the catalogue gives it. Platform bindings are
  applied **after** the app's own `env`, so a declared `MONGODB_URI` cannot shadow
  one — an app is untrusted input (§12), and that has its own test. §8's injection
  contract, with its general mapping and drift test, remains P4's; this replaced the
  plumbing only, not the naming. **Do not re-raise.**
- **C4's actual turnaround time** for UBC IAM registration and the PIA is
  **unmeasured**, and §9 calls it the highest-risk dependency in the design. It has
  weeks of latency and no software dependency, so it *could* start today —
  **and deliberately is not.** *Decided 2026-09-05, Rich's call:* the external track
  starts once the local proof of concept works end to end, because the goal is to
  get this right rather than to get it started, and the conversation goes better
  with a working demonstration behind it. **Do not re-raise this**; the trigger is
  P4's proof app running. See `docs/external-track.md`.
- **Fix `passport-ubcshib` upstream, or leave it?** Not needed — `tlef-starter`
  already bridges both attribute formats and C6 forbids a library change being a
  prerequisite. Its real gaps are the unreachable MACE entry and missing OID entries
  for `uid` and `eduPersonPrincipalName`. If fixed, ship as **0.2.0** so the six live
  apps on `^0.1.6` adopt deliberately.
- **Does LiteLLM's embedding `encoding_format` bug affect a commercial provider, or
  only the Ollama path?** Unmeasured — only Ollama was reachable offline. Cheap to
  settle the first time anyone has a provider key.
- **Should the blueprint base image move from `node:22-alpine` to 24?** Open, and
  **now priced in exposure as well as effort** (measured 2026-09-06 with Grype
  v0.118.0 against a database built that morning):

  | | apk Critical / High | npm Critical / High |
  |---|---|---|
  | `node:22-alpine` *(what the blueprint pins)* | 4 / 14 | **1 / 10** |
  | `node:24-alpine` | 4 / 14 | **0 / 4** |

  The npm findings are npm's **own bundled dependency tree** inside the image
  (`/usr/local/lib/node_modules/npm/`), not anything an app chose. Moving to 24
  removes the Critical from that half. The mechanical cost is what P1's execution
  already measured: **one line in `infra/images.txt` plus a `make seed`**. **Still
  Rich's call** — it changes what faculty apps run in, which is a compatibility
  decision, not a mechanical one.

- **Should Phase 1 ship an apk mirror alongside Verdaccio?** *Raised 2026-09-06, not
  decided, and nothing in P3–P5 proposes one.* The 4 Critical and 14 High `apk`
  findings above are `libcrypto3`/`libssl3` at `3.5.7-r0`; the fix is `3.5.8-r0`,
  published 2026-08-26. **No newer base image clears them** — the `alpine:3.22` and
  `node:22-alpine` tags Docker Hub serves today have moved digest since
  `infra/images.lock` was written and scan *identically*. The only other route is
  `RUN apk upgrade` in the blueprint Dockerfile, and that cannot work: the builder
  sits on an `--internal` network with no route off it (a §12 control with its own
  negative test), and Verdaccio mirrors npm, not apk. So **an apk mirror is the only
  mechanism that would let a build clear them offline.** P3's scan gate does not
  block on them — they are the base image's, and §20 already makes the fleet-wide
  rebuild their remedy in Phase 4+ — but they are recorded on every Release, and
  "ship on day one with four Criticals in the base image" is a decision rather than
  an accident.

**Closed 2026-09-07: P3's six spec actions are all applied**, with Rich's approval,
in one commit (`53ecb1d`) so they are one `git revert` away. Two consistency edits went
with them — §11's `isolationLevel` sentence and §21's divergence 6 both still said S6
was yet to run. The roadmap's *Spec actions raised by P3* section is the record.

**Closed recently:** the §11/§23 hostname disagreement — settled 2026-08-31 in §23's
favour and both spec edits applied. The environment kind lives in the **zone**, never
as a suffix on the label, because those suffixes are themselves legal slugs and
`{slug}-staging` is squattable across tenants. §11's row now points at §23.

**Closed 2026-09-05, by executing P1.** Two things that had been open assumptions:
the **offline** half of C1 (now demonstrated — `make up`, doctor and verify all
green with Wi-Fi off), and whether `make host-setup`'s three privileged steps work
as one bundled command (they do, first time). What remains untested is the
**second machine**; see `RUNBOOK.md`'s *Known gaps*.

**Closed recently:** who re-adds the `127.0.0.2` alias after a reboot. P1 decides it:
`make up` does, with `sudo`, guarded so it prompts only when the alias is missing. A
launchd daemon was rejected because it leaves a root-owned service `make reset` would
not remove.

---

## 9. Lessons — each one was paid for

These are about *how to work here*, and they are in the roadmap too, which is the
maintained copy.

- **Integration is where the false greens sit, and units cannot reveal them.** Two of
  the three worst discoveries in this project arrived the first time something ran end
  to end: P3's Task 15 found that **no build had ever succeeded**, and its Task 17
  found that **no deploy had ever succeeded either** — through seven defects of one
  shape, *the test constructs the value correctly and the running system re-derives it
  wrongly*. Both were invisible behind a fully green suite of 74 Docker tests, because
  a test hands the driver what it built while the control plane rebuilds it from a
  slug. **Schedule the end-to-end task early and drive it through the real entry
  point**, not through a harness.
- **A module with no call site is not built.** `waitForReady` and `edgeProbe` shipped
  in P3 Task 14 with passing tests and nothing called them until Task 17;
  `isSensitiveDiff` shipped in P2 and nothing called it for a whole plan. This is the
  same defect as the unwired boot entry point, and it has now happened three times.
  Every task should name its caller, not just its module.
- **Diagnosability is a feature, and its absence hides other defects.** A failed build
  recorded no reason at all (`void error`), and an unexpected 500 left no trace
  anywhere because the handler logged through a logger the server was built without.
  Fixing both took minutes and immediately named four further defects that had been
  invisible.
- **A plan is not verified until it runs, and the gap is not small.** P2's written
  self-review found seven defects. Then executing just **four of its twenty-one
  tasks** found **five more**, and not one was findable on paper: a package manager
  that makes an un-named build script a hard error, a lint config whose glob dialect
  silently has no extglob, a linter that does not honour the `_` convention the
  plan's own code assumed, a negative control aimed at a target that could not fail,
  and an unguarded table index that turned drift into a crash in an unrelated test.
  **Five defects in four tasks.** P3's own self-review then found **seven** more,
  the worst being that no task wired the Docker driver into the boot entry point — so
  its `make demo`, the plan's entire acceptance, would have passed against the fake
  driver. **Acted on 2026-09-04**: plan-writing stops until P3 has executed. Treat
  "the plan is written" as a hypothesis, and execute the cheapest representative
  slice early rather than banking a large unexecuted stack.
- **A green result is not evidence a control is in force.** S1's first build appeared
  to succeed while silently using the public npm registry instead of the mirror.
  Only checking the mirror's storage caught it.
- **Some defects are invisible to every test that could be written.** Executing P2's
  Tasks 12–21 produced 27 defects; **six were type errors** that `pnpm test` cannot
  see, because Vitest strips types without checking them, and **five were test
  isolation** — the suite passed or failed on the order Vitest happened to pick, and
  three suites had been green only because the database happened to be empty. Neither
  class is findable by reading a plan, and neither is findable by running its tests.
  The gates are the plan: run all four, and run the suite twice.
- **A guard whose enabling condition is written twice is a guard.** P2's
  `/auth/dev-login` passed `devAuthEnabled: true` as a literal because the route was
  only registered when the shim was on. Removing that single registration guard made
  the endpoint mint **real sessions** — a complete authentication bypass, one line
  from live, and it read correctly in review. The same shape produced an IDOR in
  `GET /builds/:id`. Two independent reads of one setting cost nothing.
- **Assert the shape of the answer, not that an answer arrived.** S3 ran six toolkit
  checks and all six passed; one was returning 192 numbers where 768 belonged, almost
  all zero, with no error anywhere. "It returned a vector" and "it returned the right
  vector" are different claims.
- **Treat a briefing document as evidence, not fact.** `START-HERE.md` stated that
  `/etc/resolver/test` pointed at a dead nameserver. It did not, and that one wrong
  premise forced the zone change.
- **Briefings go stale in days.** A handoff was sending its reader to a finished spike
  one day after it was written, and three of twelve "already pulled" images vanished
  between sessions. Anything stating current status needs an owner and a date — which
  is why the ledger exists and why this file says which of its sections decay.
- **Handoff chains strand durable knowledge.** The machine landmines in §4 spent a day
  behind a SUPERSEDED banner because they lived in a dated handoff. Durable content
  belongs in a durable document; only *what to do next* belongs in a handoff.
- **Prefer ownership-adjusted risk.** S2's risk was priced as existential and was not,
  because `docker-simple-saml` is ours. Ask what a "no" costs *given what we control*
  before ranking a risk.
- **Run the plan self-review; record what it caught.** P1's found five defects, the
  worst being a verification script that used `apk add` — which needs the network, so
  the offline acceptance test would have failed on its own harness. Writing down what
  the review caught stops the next reader mistaking a fix for a mistake.
- **Spikes came in far under their timeboxes** (~1.5 h, ~0.5 h, ~2 h, ~2 h against 3,
  2, 3 and 2 days). Do not re-plan the schedule on that: all four were the tractable
  ones, and the estimate that matters — C4's turnaround — is still unmeasured.
