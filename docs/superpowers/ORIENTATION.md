# Orientation — read this first

**You are picking up a project whose design is finished, whose first four plans are
written, two of them executed, and whose third is more than half run.** This is the single entry
point: what Manifest is, what has been established, what the machine will do to
you, and what to do next. It is written for someone with **no prior context** —
a new agent with a fresh window, or a developer joining.

*Last verified 2026-09-06.* Two things in this file state current status and will go
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

**Four spikes are done. Four plans are written. P1 and P2 are both fully executed
and green — the platform runs offline, and the control plane serves HTTP on 7100.
P3 is the only written work left, and it is PART-EXECUTED: Tasks 1–12 are done and
green as of 2026-09-06, Tasks 13–19 remain.**

| | State |
|---|---|
| **Spikes** | S7, S2, S1, S3 — **all four answered yes**, each far inside its timebox. Their spec changes are applied. S6, S5 and S4 are deliberately later (S6 is P3's acceptance exercise, S5 follows S6, S4 precedes Phase 4). **Nothing is waiting on a spike.** |
| **Plans** | **P1 and P2 are both EXECUTED, 2026-09-05** — P1's 13 tasks green and green offline, P2's 21 tasks green with **224 tests**. **P0** (spike briefs) is written; **P3** (Docker driver and deploy spine, 19 tasks) is **part-executed — Tasks 1–12 green as of 2026-09-06, 13–19 remain**, and it is the only plan with unrun tasks. P3 was written 2026-08-31 and self-reviewed 2026-09-04, which found seven defects — the worst being that **nothing wired the Docker driver into the boot entry point**, so its own `make demo` would have passed against the fake driver. P2's execution hit that same defect in P2. **Executing P3's first twelve tasks has since found 45 more, 3.7 per task** — the highest rate measured here. **P4 and P5 are unwritten, deliberately** — see §7. |
| **Code** | **The platform runs, and so does the control plane.** P1 shipped `Makefile`, `infra/` and `scripts/`: split-horizon DNS, the custom `xcaddy` edge, Postgres with three databases, registry, Verdaccio, a native egress proxy, rootless BuildKit, LiteLLM and the Manifest IdP — `make seed / up / down / reset / doctor / verify`. **`make doctor` 14 checks / 0 failed, `make verify` 31 checks / 0 failed, both green offline.** P2 then shipped the whole control plane: `spec/`, `blueprints/`, `db/`, `errors/`, `runtime/`, `source/`, `identity/`, `projects/`, `releases/` and `api/` — a Fastify server on **7100** with D23.6 idempotency, the D23.7 error envelope, the §13 capability model and the §16 authorization contract suite. **224 tests via `pnpm test`**, and the full lifecycle runs in **~300 ms** against the fake driver. **P3 has since added `runtime/docker/` (fourteen files: the Engine API client, the `mf-` naming scheme, §12's hardening, per-app networks, the forced egress proxy, `services/`, the instance lifecycle, log demux and exec, the registry token issuer, the ephemeral builder), `services/`, `build/` and `api/routes/registry-token.ts`** — `pnpm test` **332** and a second tier, `pnpm test:docker`, **48**. |
| **Spec** | Current. Every spike's actions have been applied with Rich's explicit approval, and P2 raised a fifth change — the §11/§23 hostname disagreement, settled 2026-08-31. **Trust the spec over the spike briefs**, which are deliberately preserved as a record of what was originally asked. |

The immediate work is **the rest of P3 — Tasks 13–19** — see §7. Plan-writing
stays stopped until P3 has run in full. The reasoning is in the roadmap's
*Order of operations*, and the short version is that the only time anyone measured the
defect rate of an unexecuted plan, four of P2's tasks yielded five defects that no
amount of reading would have found.

---

## 3. The document map

Read for your purpose, not front to back. The spec is ~2,340 lines; nobody reads it all.

| You are… | Read |
|---|---|
| **new, any role** | This file. Then the roadmap's *Spike status* ledger and *Lessons*. |
| **writing a plan** | §7 below, the roadmap's section for your plan, the findings notes it names, and `plans/2026-08-30-p1-local-substrate.md` **or** `2026-08-29-p2-control-plane-spine.md` as the house style. |
| **executing a plan** | The plan itself — currently **P3, from Task 13**. It is self-contained by construction; if it is not, that is a defect in the plan, so fix it there as you go. **Read the plan's *What executing this plan found* first** — 45 defects across Tasks 1–12, and the *What Task 15 must carry forward* block at its end changes code Task 15 calls. |
| **running the platform** | [`RUNBOOK.md`](RUNBOOK.md). `make seed && make host-setup && make up`. |
| **writing code** | Ten modules exist: `spec/`, `blueprints/`, `db/`, `errors/`, `runtime/`, `source/`, `identity/`, `projects/`, `releases/` and `api/`. Read `runtime/driver.ts` and `runtime/driver-contract.ts` first — everything else is built against them — then `api/server.ts` for how a request becomes an actor, and `projects/authz.ts` for the one function every route's security depends on. |
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
│   └── 2026-08-31-p3-docker-driver-deploy-spine.md
│                                                  P3. 19 tasks; 1-12 RUN AND GREEN
│                                                  (2026-09-06), 13-19 REMAIN.
│                                                  CONTINUE FROM TASK 13. Ends with
│                                                  S6 as Task 18. Proposes five spec
│                                                  actions, applies none.
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
    └── api/
        ├── server.ts            Fastify, session hook, idempotency hook  (Task 17)
        ├── errors.ts            the D23.7 envelope — every failure exits here
        ├── idempotency.ts       D23.6; replay same body, 409 on a different one
        ├── testing.ts           testDeps — blueprints resolved from import.meta.url
        ├── authz-contract.ts    THE SHARED SUITE P3 IMPORTS UNCHANGED    (Task 20)
        ├── routes/auth.ts       dev login, me, logout
        ├── routes/projects.ts   projects, spec, members
        ├── routes/delivery.ts   builds, releases, deploy, environments   (Task 19)
        └── index.ts
```

`pnpm test` → **224 tests across 23 files**, **run from the repo root** (`pnpm test`,
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

## 7. What to do next — finish P3, from Task 13

**This section changed direction on 2026-09-04, and P1 has since executed.** The intent until then was to write
every remaining plan before implementing any of them. It is now the opposite:
**execute what is written, and do not write P4 until P3 has run.** The full reasoning
is the roadmap's *Order of operations*; the short version is that the defect rate of
an unexecuted plan has been measured exactly once — four of P2's twenty-one tasks
yielded **five** defects, and **none of the five was findable on paper.**

**P1's execution then measured it again, at full scale: 13 tasks, 18 defects** — a
third of them controls reporting green against something broken or absent. **P2 has
since run in full: 21 tasks, 52 defects across three sittings.** **19 written tasks
remain unrun — P3's, and only P3's.** Adding P4 to that stack prices nothing.

### 7a. P1 is done *(executed 2026-09-05)*

[`plans/2026-08-30-p1-local-substrate.md`](plans/2026-08-30-p1-local-substrate.md) —
13 tasks, all executed and green. The platform runs; read
[`RUNBOOK.md`](RUNBOOK.md) to start it, not the plan.

`make doctor` is 14 checks / 0 failed, `make verify` is 31 checks / 0 failed, and
**both are green with the network off** — the offline half no spike had ever tested.
The C1 demo holds: `https://console.manifest.internal/` returns a byte-identical
hostname and scheme from the host and from inside a container, no port, no `-k`.

**Executing it found 18 defects in an already-self-reviewed plan**, and the shape of
them is the durable lesson: **six were checks that passed while the thing under test
was broken or absent.** An egress negative control reported success because the
network did not exist; a retention check passed with LiteLLM not running; an IdP
metadata check passed against a SimpleSAMLphp **1.x** schema while every read threw.
One was a real platform bug nothing on paper would find — tinyproxy exits after
every denial without `DefaultErrorFile`, and `restart: unless-stopped` hid it.
Every fix is written back into the plan with the measurement that found it.

**The one thing P1 did not prove: the second-machine clean clone.** No second Mac
was available. It is recorded as a gap in `RUNBOOK.md`, not quietly dropped — and
the interesting case is a Mac **with Valet**, since that collision is why the zone
is `manifest.internal`. `make host-undo` has also never been run end to end.

### 7b. P2 is done *(executed 2026-09-05)*

[`plans/2026-08-29-p2-control-plane-spine.md`](plans/2026-08-29-p2-control-plane-spine.md)
— **all 21 tasks executed and green.** `pnpm test` is **224 tests / 23 files**;
`pnpm lint`, `pnpm --filter @manifest/control-plane typecheck` and
`pnpm format:check` are all clean. **Run `pnpm test` from the repo root**, not with
`--filter` — the two are not equivalent, and the difference found a defect.

The demo holds: log in, create a project, provision a bare repository, validate the
spec at that commit, build, release, deploy to staging and reach healthy, then be
refused production with §13's checklist — **~300 ms** against the fake driver, no
Docker for the driver itself. The control plane also boots and serves HTTP on 7100;
`README.md`'s *Running the control plane* has the exact commands, verified with
`curl`.

**Executing it found 52 defects across three sittings — 5, then 20, then 27.** The
last batch is the one to read before starting P3, because it is the first time this
project executed tasks that touch a *framework* rather than pure functions:

| | |
|---|---|
| **Six type errors no test could ever catch** | `exactOptionalPropertyTypes` rejects `hint: cond ? x : undefined`, `payload?: unknown`, a `Partial<T>` spread. **Vitest strips types without checking them**, so `pnpm test` is green while `tsc` has four errors. The typecheck is not a formality after the tests |
| **Five test-isolation defects** | API tests commit (they drive a real server), collided on a unique slug, and left `pnpm test` **not repeatable**. And `withRollback` does not isolate a suite from rows somebody else *committed* — three suites were green only because the database happened to be empty. One hand-inserted row turned 10 tests red |
| **Two controls one edit from being live** | `/auth/dev-login` passed `devAuthEnabled: true` as a literal, so the route-registration guard was the only thing between it and an authentication bypass — breaking that guard made it answer **200 with a real session**. And `GET /builds/:id` made to trust a client-supplied `projectId` let one user read another's build with **200** |
| **Nothing had ever run the boot entry point** | No test imports `src/index.ts`. The `dev` script did not exist, and would not have worked — Node resolves NodeNext `.js` specifiers literally, so `node src/index.ts` cannot find its own imports. **This is the same defect P3's self-review found in P3** |

**One rule earned the whole batch.** *Never accept a check you have not watched
fail.* Every task above ends by breaking the thing it built and naming the test that
goes red. Task 13 originally had no such step and was given one — the session MAC
had never been observed refusing a forged `role: admin` token.

### 7c. Finish P3 — the Docker driver and deploy spine *(start here, at Task 13)*

[`plans/2026-08-31-p3-docker-driver-deploy-spine.md`](plans/2026-08-31-p3-docker-driver-deploy-spine.md)
— **19 tasks. Tasks 1–12 are executed and green (2026-09-06); Tasks 13–19 remain.**
Finishing it is what unblocks writing P4.

**Where to pick up.** The plan is being executed in sessions, and the remaining two
are already scoped:

| Session | Tasks | What it is |
|---|---|---|
| **4 — next** | 13, 14, 15 | `routing/` (§23 hostnames, listener assignment, Caddy's JSON admin API) · readiness polled **through the edge** · then `DockerDriver` assembled, run against P2's `driver-contract.ts` **unchanged**, and wired into `src/index.ts` |
| **5** | 16–19 + close-out | promotion refusal · the fixture app and `make demo`, with the offline control that actually deletes the mirrored base image · S6's probe matrix and findings note · `doctor`/`verify`/`reset` learning about `mf-` · then the close-out sweep |

**Before you write a line of Task 13, read two things in the plan:** *What executing
this plan found* (45 defects across Tasks 1–12, per session, each with the
measurement that found it) and *What Task 15 must carry forward* at its very end —
three fixes in Tasks 10–12 changed code Task 15 calls, and Task 15's heading carries
a pointer to it.

**The baselines Tasks 1–12 leave you.** A different number on a clean checkout is
signal, not noise:

| | |
|---|---|
| `pnpm test` (repo root) | **332 tests**, and it must stay Docker-free |
| `pnpm test:docker` | **48 tests**, ~65 s, needs `make up` |
| `make doctor` | **15 checks / 0 failed** |
| `make verify` | **32 checks / 0 failed** |

**Two things Session 4 should treat as guilty until proven otherwise.** Task 15's
boot wiring is the defect P3's own self-review called its worst — nothing wired the
Docker driver into `src/index.ts`, so `make demo` would have passed against the fake
one — and P2 shipped the identical defect. Make the boot check **fail on demand**
before believing it. And `make verify`'s four builder checks are gated on
`docker inspect manifest-buildkitd`, a compose service behind the `build` profile
that P3 replaced with ephemeral `mf-builder-*` containers: **they are currently not
running, so they are not part of the 32.** That is Task 19's to fix, and it is
exactly the could-not-fail shape this plan keeps producing.

**What P2 leaves you.** Two shared artefacts P3 imports *unchanged*:
`src/runtime/driver-contract.ts`, which the Docker driver must pass exactly as the
fake one does, and `src/api/authz-contract.ts`, which P3 points at a server backed by
the Docker driver. The second resets the database in its own `beforeAll` for that
reason. Swapping the driver is meant to be one line in `src/index.ts`.

**Budget for the defects — the prediction was too low.** The rate was expected to be
2.7–2.9 per task, from P2's last two batches. **P3's first twelve tasks produced 45
defects: 3.7 per task**, the highest measured here. **P3 is almost entirely
infrastructure and controls**: the §12 hardening baseline, S6's probe matrix, the
scanner and SBOM gate, registry-token scoping. A false green on a *security* control
is the worst failure this project can ship — and of those 45, the recurring shape is
still a check that could not fail, plus a new one worth naming: **a rule that was
validated against the wrong image.** The scan gate was twice given a plausible
"who owns this finding" rule, and both times it was proved wrong by measuring
`node:22-alpine` — the image faculty apps actually run on — rather than `alpine`,
which is only a probe.

**Check every concrete value against the running system before trusting it** — see
the table at the end of this section. P2 hit that class three more times: an image
repository derived from a project UUID rather than the slug, `parseInt('1Gi')`
evaluating to 1, and two cwd-relative paths that work under `pnpm --filter` and
nowhere else.

P3 also **proposes five spec actions and applies none of them** — they are listed at
the end of the plan and they are Rich's to approve. One is deliberately deferred
until Task 18 has actually measured what it describes.

**Two things P1 leaves you.** `make verify` is a regression net — keep it and
`make doctor` green as you go, because they assert properties of the very
infrastructure P3 builds on. And read [`RUNBOOK.md`](RUNBOOK.md) before touching the
machine: its troubleshooting table is every failure this project has actually hit,
including the one where *nothing* resolves because Valet's dnsmasq has hung.

**Four facts that P2 and P3 originally got wrong about P1**, corrected 2026-09-05.
They are fixed in both plans; they are repeated because the same class of mistake
recurs wherever a plan names a concrete resource:

| | |
|---|---|
| database | **`manifest_control`** — not `manifest_control_plane` |
| password | from **`.env`** — not the literal `manifest` |
| base images | **`alpine:3.22`**, and they live at **`base/<repo>`** in the registry (`base/node`, `base/alpine`); per-app images go to **`local/<slug>`** |
| egress proxy | **`manifest-egress:local`** — not `vimagick/tinyproxy`, which is amd64-only and ran emulated |

**To run anything against the control plane**, the platform must be up:

```bash
make up                       # Postgres on 7103; asks for sudo only after a reboot
pnpm test                     # from the REPO ROOT — 224 tests, derives .env itself
```

`pnpm test` needs no exported variables: `vitest.setup.ts` derives
`MANIFEST_DATABASE_URL` from `.env` itself, and a `globalSetup` truncates the §6
tables once per run so a run never inherits the last one's rows. You still need the
export by hand for `db:generate` and `db:migrate`, which are CLI tools —
`README.md` has it. **There is no `psql` on the host**; reach the database from Node
or through the container:

```bash
docker exec manifest-postgres psql -U manifest -d manifest_control -c '\dt'
```

> **Never accept a check you have not watched fail.** Remove the thing it
> protects, confirm red, put it back. It costs seconds.


### 7d. Write P4 — identity, secrets and AI (1b) *(held)*

*Depends on S2 and S3, both done, and on P3 — which is written, so nothing blocks
this except the 2026-09-04 decision above. **Write it once P3 has executed.***

SP auto-provisioning against the SQL metadata mechanism S2 proved, per-app keypairs,
`secrets/` envelope encryption, the §8 injection contract and its drift test, the
`node-ts-mongo` blueprint content, the LiteLLM client with the classification-gated
catalogue, events, WebSocket streaming, redaction at capture, incidents.

**Three S3 findings are P4 tasks, not notes** — the three in §5 above. Each needs a
§16 test attached, and each fails silently without one.

**Demo:** the proof app — CWL login, a Mongo write, an LLM answer — driven by `curl`.

### 7e. Write P5 — contract and clients (1c)

*Depends on P4.* The published OpenAPI contract, `manifest-mock`, the generated
client, and the reference console (D22) that imports **only** the generated client —
a lint boundary *and* a test enforce it, which is what converts "is the API
complete?" from an opinion into a build failure.

**Demo:** the §1 faculty journey, clickable, driven twice over one contract.

---

## 8. Decisions waiting on Rich

Surface these; do not decide them.

- **P3 proposes five spec actions and applies none of them.** They are listed at the
  end of [`plans/2026-08-31-p3-docker-driver-deploy-spine.md`](plans/2026-08-31-p3-docker-driver-deploy-spine.md),
  in the same form the four spikes used, and every one of them is **measured** rather
  than argued: narrowing §21's divergence 8 now that app networks are `--internal`;
  recording in §12 that `--storage-opt size=` does not enforce on Docker Desktop;
  splitting §12's *"Bounded"* sentence into the four mechanisms it actually names;
  adding the registry token realm's mechanics to §12's builder paragraph; and adding
  positive controls to §16's security-regression tier. **The first should not be
  applied until P3's Task 18 has measured it** — the wording should follow the probe
  matrix, not precede it.
- **Where does the service-binding wire land — P3 Task 15, or P3 Task 17?**
  *Raised 2026-09-06, blocks nothing until Task 15, and it changes that task's
  scope.* Measured: `Driver.ensureService` is built and its `endpoint` is already a
  complete connectable URI, and `InstanceSpec.services` exists — but
  **`deployRelease` (`releases/release.ts:191`) passes `services: []` as a hardcoded
  literal**, and no task in P3 modifies that file except Task 16's promotion check.
  So nothing calls `ensureService`, `MONGODB_URI` is never set, and a deployed app
  comes up **with no database**. Task 17's fixture app pings Mongo on its *health*
  endpoint and its demo asserts a `boots` counter across a restart, so **P3's own
  acceptance cannot pass** as written — the same shape as the defect P3's
  self-review called its worst.

  **This is not §8.** P3 correctly defers the §8 *injection contract* — the general
  declared-service-to-variable mapping and its drift test — to P4. The missing piece
  is much smaller: derive a `ServiceBinding` per entry in `resolved.services`, call
  `ensureService`, pass the handles through. **Recommendation: Task 15**, where the
  driver is assembled and `ensureService` already exists. Recorded in full as a
  blockquote on Task 15 in the plan.

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
