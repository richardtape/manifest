# Orientation — read this first

**You are picking up a project whose design is finished, whose first four plans are
written, and which has one small island of running code.** This is the single entry
point: what Manifest is, what has been established, what the machine will do to
you, and what to do next. It is written for someone with **no prior context** —
a new agent with a fresh window, or a developer joining.

*Last verified 2026-09-05.* Two things in this file state current status and will go
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

**Four spikes are done. Four plans are written. P1 is fully executed and green —
the platform actually runs, offline — and P2's remaining tasks are next.**

| | State |
|---|---|
| **Spikes** | S7, S2, S1, S3 — **all four answered yes**, each far inside its timebox. Their spec changes are applied. S6, S5 and S4 are deliberately later (S6 is P3's acceptance exercise, S5 follows S6, S4 precedes Phase 4). **Nothing is waiting on a spike.** |
| **Plans** | **P1 is EXECUTED, 2026-09-05 — all 13 tasks, green, and green offline.** **P0** (spike briefs), **P2** (control-plane spine, 21 tasks) and **P3** (Docker driver and deploy spine, 19 tasks) are written. P3 was written 2026-08-31 and self-reviewed 2026-09-04, which found seven defects — the worst being that **nothing wired the Docker driver into the boot entry point**, so its own `make demo` would have passed against the fake driver. **P4 and P5 are unwritten, deliberately** — see §7. |
| **Code** | **The platform runs.** P1 shipped `Makefile`, `infra/` and `scripts/`: split-horizon DNS, the custom `xcaddy` edge, Postgres with three databases, registry, Verdaccio, a native egress proxy, rootless BuildKit, LiteLLM and the Manifest IdP — `make seed / up / down / reset / doctor / verify`. **`make doctor` 14 checks / 0 failed, `make verify` 31 checks / 0 failed, both green offline.** Alongside it, **P2's Tasks 1–11**: the runtime island (2026-08-31) — the §11 `Driver` interface, the fake driver, the contract suite P3 inherits, the state machine — and **Tasks 2–8 (2026-09-05)** — `spec/` (schema, machine-actionable errors, policy, `isSensitiveDiff`), `blueprints/` (descriptor, registry, compatibility), the `fixture-node` blueprint on disk, and `db/` with its first migration applied to `manifest_control`. **80 tests via `pnpm test`.** Still no HTTP surface (P2 Tasks 12–21). |
| **Spec** | Current. Every spike's actions have been applied with Rich's explicit approval, and P2 raised a fifth change — the §11/§23 hostname disagreement, settled 2026-08-31. **Trust the spec over the spike briefs**, which are deliberately preserved as a record of what was originally asked. |

The immediate work is **P2 Tasks 12–21**, then P3 — see §7. Plan-writing
stays stopped until P3 has run. The reasoning is in the roadmap's
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
| **executing a plan** | The plan itself. It is self-contained by construction; if it is not, that is a defect in the plan. |
| **running the platform** | [`RUNBOOK.md`](RUNBOOK.md). `make seed && make host-setup && make up`. |
| **writing code** | Five modules exist: `spec/`, `blueprints/`, `db/`, `errors/` and `runtime/`. Read `runtime/driver.ts` and `runtime/driver-contract.ts` first — everything else in the system is built against them — then `spec/index.ts`, which is what every later task validates through. |
| **changing the spec** | Don't, without asking. It is marked *Approved design*. Record the proposed change and Rich decides — that has been the pattern five times. |

```
docs/superpowers/
├── ORIENTATION.md          ← you are here
├── RUNBOOK.md              HOW TO RUN THE PLATFORM. Start here to use it.
├── external-track.md       the UBC IAM / PIA work that runs in parallel
├── specs/
│   ├── 2026-08-29-manifest-platform-design.md    AUTHORITATIVE. 27 sections.
│   └── manifest-*.html                            plain-language versions for
│                                                  non-engineers; markdown wins
├── plans/
│   ├── 2026-08-29-plan-roadmap.md                 THE LEDGER. Status lives here.
│   ├── 2026-08-29-phase-0-spike-briefs.md         P0. Historical record.
│   ├── 2026-08-29-p2-control-plane-spine.md       P2. Complete, 21 tasks.
│   │                                              Tasks 1, 9, 10, 11 are EXECUTED.
│   ├── 2026-08-30-p1-local-substrate.md           P1. Complete, 13 tasks.
│   │                                              EXECUTE THIS ONE NEXT.
│   └── 2026-08-31-p3-docker-driver-deploy-spine.md
│                                                  P3. Complete, 19 tasks. Ends with
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
and `scripts/verify.sh`. Below is the TypeScript island as of 2026-09-05, after P2
Tasks 1–11:

```
.nvmrc  package.json  pnpm-workspace.yaml  tsconfig.base.json
eslint.config.js  vitest.workspace.ts          the workspace (P2 Task 1)
.prettierrc  .prettierignore                   Prettier owns packages/ ONLY —
                                               without the ignore, `pnpm format`
                                               rewrites the approved spec
blueprints/fixture-node/                       the on-disk blueprint    (Task 7)
    blueprint.yaml  Dockerfile.tmpl  skeleton/  agents/
packages/control-plane/
├── drizzle/0000_*.sql           the first migration, applied  (Task 8)
├── drizzle.config.ts
├── vitest.config.ts + vitest.setup.ts   derives MANIFEST_DATABASE_URL from .env
└── src/
    ├── module-boundaries.test.ts   the §5 rule, enforced by a test that resolves
    │                               imports and compares modules
    ├── errors/index.ts             ManifestError + ManifestValidationError (Task 3)
    ├── spec/
    │   ├── schema.ts               the §7 v1 zod schema              (Task 2)
    │   ├── errors.ts               zod issue → stable code + hint    (Task 3)
    │   ├── policy.ts               catalogues, whitelist, quota, D17 (Task 4)
    │   ├── diff.ts                 isSensitiveDiff, the D9 gate      (Task 5)
    │   └── index.ts                THE module's public surface
    ├── blueprints/
    │   ├── descriptor.ts           §25 blueprint.yaml schema         (Task 6)
    │   ├── compatibility.ts        checkBlueprintCompatibility       (Task 6)
    │   ├── registry.ts             load, resolve name@major          (Task 6)
    │   └── index.ts
    ├── db/
    │   ├── schema.ts               the ten §6 tables P2 writes       (Task 8)
    │   ├── client.ts               Drizzle over pg, from MANIFEST_DATABASE_URL
    │   ├── testing.ts              withRollback — a tx that never commits
    │   └── index.ts
    └── runtime/
        ├── driver.ts               the §11 Driver interface           (Task 9)
        ├── fake-driver.ts          in-memory implementation           (Task 9)
        ├── driver-contract.ts      THE SHARED SUITE P3 IMPORTS UNCHANGED (Task 10)
        ├── fake-driver.test.ts     points the suite at the fake driver
        ├── state-machine.ts        §11 transitions + IDLE_POLICY      (Task 11)
        └── state-machine.test.ts
```

`pnpm test` → **80 tests**. Everything except `src/db/` needs no Docker, no Postgres
and no network; `src/db/` needs `make up`, and finds its connection string itself.
Also `pnpm lint`, `pnpm --filter @manifest/control-plane typecheck` and
`pnpm format:check`. All four must be clean before you commit.

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
   | `external-track.md` | Owners and states of the UBC items |
   | `machine-baseline-*.md` | **Do not edit these.** They are dated evidence. Re-run `scripts/snapshot-machine.sh` and add a new one |

   **The four HTML pages are the easiest to forget and the most expensive to get
   wrong**, because Rich shares them with people outside the team and nothing in the
   build checks them. They are also the slowest to drift: their architecture stays
   right for months while their *status* is wrong within days.

---

## 7. What to do next — finish P2, then P3

**This section changed direction on 2026-09-04, and P1 has since executed.** The intent until then was to write
every remaining plan before implementing any of them. It is now the opposite:
**execute what is written, and do not write P4 until P3 has run.** The full reasoning
is the roadmap's *Order of operations*; the short version is that the defect rate of
an unexecuted plan has been measured exactly once — four of P2's twenty-one tasks
yielded **five** defects, and **none of the five was findable on paper.**

**P1's execution then measured it again, at full scale: 13 tasks, 18 defects** — a
third of them controls reporting green against something broken or absent. **36
written tasks remain unrun** (P2's 17, P3's 19). Adding P4 to that stack prices
nothing.

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

### 7b. Execute P2 Tasks 12–21, then P3 *(start here)*

[`plans/2026-08-29-p2-control-plane-spine.md`](plans/2026-08-29-p2-control-plane-spine.md).
**10 of P2's 21 tasks remain: 12–21** — configuration and the whole HTTP surface.

**Tasks 2–8 were executed on 2026-09-05 and found 19 defects**, every one recorded
inline at its task with what it was measured against. Four are worth knowing before
you start, because they are about the *shape* of the mistakes this plan makes rather
than about `spec/`:

| | |
|---|---|
| **A command in the repo violated a non-negotiable** | `pnpm format` was `prettier --write .` with no `.prettierignore`, so it would have rewritten 50 files including the **approved spec**. Nothing in the build checked it. |
| **A plan step could not be committed green** | Task 6's Step 6 expected a test to fail until Task 7 landed, against this plan's own *"green before you commit"* rule. The test belonged to Task 7. |
| **A concrete value went stale between plans** | Task 7's base image was a row of zeros deferred to a `make seed` that had already run — and the obvious replacement, `infra/images.lock`'s digest, is **wrong**, because the local registry answers a different digest for the same tag. |
| **A new dependency took down unrelated tests** | Task 8's `db/client.ts` throws at import without `MANIFEST_DATABASE_URL`, and the plan's only provision was a documented `export` line. Eight test files that need no database went red. |

Tasks 12–21 are where the plan is thinnest against reality: they are the first that
serve HTTP, and §20's *"every route carries an explicit ownership check"* is the
likeliest defect class in the whole plan.

**Why that gap, and why it is not a skip.** Tasks **1, 9, 10 and 11 were executed on
2026-08-31** — commits `538251f`, `ac6e55e`, `262288c`, `e82711d`, still green in
`pnpm test`. They are the *runtime island*: workspace scaffolding and the §5
module-boundary rule, the §11 `Driver` interface, the fake driver, the contract
suite P3 inherits, and the instance state machine. Those four are the **only** P2
tasks that need no infrastructure whatsoever — no Docker, no Postgres, no HTTP —
which is exactly why they could be built before P1 existed. Everything else was
waiting on the substrate P1 has now delivered.

Tasks **2–8** followed on 2026-09-05 — the `manifest.yaml` schema, machine-actionable
spec errors, policy validation, `isSensitiveDiff`, the blueprint descriptor, the
`fixture-node` blueprint, and the **database schema**, the first task that touched
P1's Postgres. So the remaining work is **Tasks 12–21**, configuration and the HTTP
surface. Then P3 in full, whose **Task 18 is S6** and whose demo is the fixture app
healthy at a `manifest.internal` URL, from a clean checkout, offline.

**P2 is no longer standalone.** It was written when nothing was running. P1 has
since built the infrastructure it targets, so start it like this:

```bash
make up                       # the platform must be running for Task 8 onward
set -a; . ./.env; set +a      # make seed writes .env; never hardcode these
export MANIFEST_DATABASE_URL="postgres://manifest:${POSTGRES_PASSWORD}@127.0.0.1:7103/manifest_control"
```

**`pnpm test` no longer needs that export** — Task 8 added
`packages/control-plane/vitest.setup.ts`, which derives the same URL from `.env`
itself, because a documented `export` line is not something a test run executes. You
still need it for `db:generate` and `db:migrate`, which are CLI tools.

Verified 2026-09-05 — that exact string connects and returns
`CONNECTED to manifest_control as manifest`. **There is no `psql` on the host**, so
reach the database either from Node (which is what the control plane does) or
through the container:

```bash
docker exec manifest-postgres psql -U manifest -d manifest_control -c '\dt'
```

**Four facts that P2 and P3 originally got wrong about P1, corrected 2026-09-05
after checking the plans against what is actually running.** They are fixed in
both plans; they are repeated here because the same class of mistake will recur
wherever a plan names a concrete resource:

| | |
|---|---|
| database | **`manifest_control`** — not `manifest_control_plane` |
| password | from **`.env`** — not the literal `manifest` |
| base images | **`alpine:3.22`**, and they live at **`base/<repo>`** in the registry (`base/node`, `base/alpine`); per-app images go to `local/<slug>` |
| egress proxy | **`manifest-egress:local`** — not `vimagick/tinyproxy`, which is amd64-only and ran emulated |

**So: any time a plan names a port, database, password, image tag or registry
path, check it against the running system before trusting it.** That class of
defect is invisible on paper and immediate on contact.

**The one rule that matters most, and it is not about P2.** Executing P1 found
**19 defects in a plan that had already been self-reviewed**, and **seven of them
were checks that passed while the thing under test was broken or absent** — an
egress "negative control" that succeeded because the network did not exist; a
retention check that passed with LiteLLM stopped; a metadata check that passed
against a schema every read threw on; a teardown that reported failure when it
worked. Not one was findable by reading.

> **Never accept a check you have not watched fail.** Remove the thing it
> protects, confirm red, put it back. It costs seconds.

This matters more in P2 and P3 than it did in P1. **P3 is almost entirely
controls** — the §12 hardening baseline, S6's probe matrix, the scanner and SBOM
gate, the registry-token scoping — and a false green on a *security* control is
the worst failure this project can ship. P3's own self-review already caught the
shape of it: no task wired the Docker driver into the boot entry point, so its
`make demo` would have passed against the fake driver.

**Two things P1 leaves you.** `make verify` is now a regression net — keep it and
`make doctor` green as you go, because they assert properties of the very
infrastructure P2 and P3 build on. And read
[`RUNBOOK.md`](RUNBOOK.md) before touching the machine: its troubleshooting table
is every failure this project has actually hit, including the one where *nothing*
resolves because Valet's dnsmasq has hung.

P3 also **proposes five spec actions and applies none of them** — they are listed at
the end of the plan and they are Rich's to approve. One of them is deliberately
deferred until Task 18 has actually measured what it describes.

### 7c. Write P4 — identity, secrets and AI (1b) *(held)*

*Depends on S2 and S3, both done, and on P3 — which is written, so nothing blocks
this except the 2026-09-04 decision above. **Write it once P3 has executed.***

SP auto-provisioning against the SQL metadata mechanism S2 proved, per-app keypairs,
`secrets/` envelope encryption, the §8 injection contract and its drift test, the
`node-ts-mongo` blueprint content, the LiteLLM client with the classification-gated
catalogue, events, WebSocket streaming, redaction at capture, incidents.

**Three S3 findings are P4 tasks, not notes** — the three in §5 above. Each needs a
§16 test attached, and each fails silently without one.

**Demo:** the proof app — CWL login, a Mongo write, an LLM answer — driven by `curl`.

### 7d. Write P5 — contract and clients (1c)

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
- **C4's actual turnaround time** for UBC IAM registration and the PIA is
  **unmeasured**, and §9 calls it the highest-risk dependency in the design. It has
  weeks of latency and no software dependency, so it *could* start today —
  **and deliberately is not.** *Decided 2026-09-05, Rich's call:* the external track
  starts once the local proof of concept works end to end, because the goal is to
  get this right rather than to get it started, and the conversation goes better
  with a working demonstration behind it. **Do not re-raise this**; the trigger is
  P4's proof app running. See `external-track.md`.
- **Fix `passport-ubcshib` upstream, or leave it?** Not needed — `tlef-starter`
  already bridges both attribute formats and C6 forbids a library change being a
  prerequisite. Its real gaps are the unreachable MACE entry and missing OID entries
  for `uid` and `eduPersonPrincipalName`. If fixed, ship as **0.2.0** so the six live
  apps on `^0.1.6` adopt deliberately.
- **Does LiteLLM's embedding `encoding_format` bug affect a commercial provider, or
  only the Ollama path?** Unmeasured — only Ollama was reachable offline. Cheap to
  settle the first time anyone has a provider key.
- **Should the blueprint base image move from `node:22-alpine` to 24?** Still open,
  but **the cost is now measured** rather than guessed — P1 said to price it during
  execution, and execution has happened. It is **one line in `infra/images.txt` plus
  a `make seed`**. The offline acceptance check turned out to reference the registry
  *repository* (`/v2/node/tags/list`), not the tag, so it is unaffected; `make
  doctor` compares against `infra/images.lock`, which `make seed` regenerates. The
  digest S1 recorded stays valid as a record of what 22 was. So the earlier "not
  free, three places" framing was too pessimistic: the only real cost is pulling a
  new image once, with network. **Still Rich's call** — it changes what faculty apps
  run in, which is a compatibility decision, not a mechanical one.

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
