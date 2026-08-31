# Orientation — read this first

**You are picking up a project with no product code in it yet.** This is the single
entry point: what Manifest is, what has been established, what the machine will do to
you, and what to do next. It is written for someone with **no prior context** —
a new agent with a fresh window, or a developer joining.

*Last verified 2026-08-31.* Two things in this file state current status and will go
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

**Four spikes are done. Two plans are complete. The first product code is running.**

| | State |
|---|---|
| **Spikes** | S7, S2, S1, S3 — **all four answered yes**, each far inside its timebox. Their spec changes are applied. S6, S5 and S4 are deliberately later (S6 is P3's acceptance exercise, S5 follows S6, S4 precedes Phase 4). **Nothing is waiting on a spike.** |
| **Plans** | **P0** (spike briefs), **P1** (local substrate, 13 tasks) and **P2** (control-plane spine, 21 tasks) are complete. P2 was finished on 2026-08-31: its Tasks 9–10 banners were lifted against S1, and Tasks 11–21 written. **P3, P4, P5 are unwritten.** |
| **Code** | **P2's runtime island, built 2026-08-31 and green**: pnpm workspace, the §11 `Driver` interface, the fake driver, the driver contract suite P3 inherits unchanged, the instance state machine. 19 tests via `pnpm test`; no Docker, no Postgres, no network. No `Makefile` yet (P1), no HTTP surface yet (P2 Tasks 12–21). |
| **Spec** | Current. Every spike's actions have been applied with Rich's explicit approval, four times running. **Trust the spec over the spike briefs**, which are deliberately preserved as a record of what was originally asked. |

The immediate work is **writing the remaining plans** — see §7.

---

## 3. The document map

Read for your purpose, not front to back. The spec is ~2,340 lines; nobody reads it all.

| You are… | Read |
|---|---|
| **new, any role** | This file. Then the roadmap's *Spike status* ledger and *Lessons*. |
| **writing a plan** | §7 below, the roadmap's section for your plan, the findings notes it names, and `plans/2026-08-30-p1-local-substrate.md` **or** `2026-08-29-p2-control-plane-spine.md` as the house style. |
| **executing a plan** | The plan itself. It is self-contained by construction; if it is not, that is a defect in the plan. |
| **changing the spec** | Don't, without asking. It is marked *Approved design*. Record the proposed change and Rich decides — that has been the pattern four times. |

```
docs/superpowers/
├── ORIENTATION.md          ← you are here
├── external-track.md       the UBC IAM / PIA work that runs in parallel
├── specs/
│   ├── 2026-08-29-manifest-platform-design.md    AUTHORITATIVE. 27 sections.
│   └── manifest-*.html                            plain-language versions for
│                                                  non-engineers; markdown wins
├── plans/
│   ├── 2026-08-29-plan-roadmap.md                 THE LEDGER. Status lives here.
│   ├── 2026-08-29-phase-0-spike-briefs.md         P0. Historical record.
│   ├── 2026-08-29-p2-control-plane-spine.md       P2. Complete through Task 8.
│   └── 2026-08-30-p1-local-substrate.md           P1. Complete, 13 tasks.
└── spikes/
    ├── S7-findings.md  DNS, the edge, TLS       ← P1's content
    ├── S2-findings.md  SimpleSAMLphp metadata   ← P4's shape
    ├── S1-findings.md  Docker round-trip        ← P3's content
    ├── S3-findings.md  LiteLLM, Ollama, budgets ← P4's AI half
    ├── START-HERE.md   the ORIGINAL spike briefing. Historical; §6 is wrong.
    └── HANDOFF-2026-08-3*.md  dated handoffs. Historical once superseded.
```

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
- Host: 36 GiB RAM, 12 cores, ~173 GiB free. macOS 26.5.2, arm64, Docker Desktop
  4.87.0, Docker Engine 29.7.2, Compose v5.4.0.
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

**`alpine:3.22`, `caddy:2.11.4` and `caddy:2.11.4-builder` were on this list and are
now gone** — pruned between sessions. Treat any list of machine state as a hint, not
a fact; `make doctor` is the thing that should check.

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
3. **Record exact versions.** Image digests, package versions, macOS and Docker
   Desktop versions. A finding without a version is not reproducible.
4. **Make the judgment call, then write down why.** Rich would rather you decide a
   routine question and record the reasoning as a documented decision than block on
   asking. Reserve questions for things that are genuinely his — spec changes, host
   changes, anything irreversible. P1's *Decisions this plan makes* section is the
   pattern.
5. **Capture negative controls.** "It works" is much weaker than "it works, and here
   it is correctly failing when I remove the thing that makes it work."
6. **Write for a reader who was not there.** Every one of these documents will be
   read cold by someone with no context. That is the normal case, not the exception.
7. **Close out properly.** Update the roadmap ledger, sweep for documents that state
   status, and leave the machine as you found it. The sweep is the step that gets
   forgotten, and forgetting it is how four documents once spent a day lying about
   the state of the project.

---

## 7. What to do next — the plan queue

Rich's current intent is to **write the remaining plans before implementing any of
them.** Each item below is a self-contained job for one agent with a fresh context.
They are listed in the order they should be written.

### 7a. Write P3 — Docker driver and deploy spine (1a-iii) *(start here)*

*Depends on S1, which is done, and on **P2's driver contract suite**, which exists.
Executes after P1 and P2.*

This is the largest remaining plan and **S1's findings are most of its content**:
the rootless builder invocation, the dual-homed registry, digest-not-tag promotion,
the §12 hardening flag set as an Engine API `HostConfig`, the Caddy admin API request
shapes, log demuxing, and the idempotency properties. It imports P2's driver contract
suite **unchanged** — that is what makes the abstraction a contract rather than a
hope. **S6 is P3's acceptance exercise**, so the plan ends with it and its probes
become §16's security-regression tier.

**Demo:** a fixture app healthy at a `manifest.internal` URL, from a clean checkout,
offline.

### 7b. Write P4 — identity, secrets and AI (1b)

*Depends on S2 and S3, both done, and on P3.*

SP auto-provisioning against the SQL metadata mechanism S2 proved, per-app keypairs,
`secrets/` envelope encryption, the §8 injection contract and its drift test, the
`node-ts-mongo` blueprint content, the LiteLLM client with the classification-gated
catalogue, events, WebSocket streaming, redaction at capture, incidents.

**Three S3 findings are P4 tasks, not notes** — the three in §5 above. Each needs a
§16 test attached, and each fails silently without one.

**Demo:** the proof app — CWL login, a Mongo write, an LLM answer — driven by `curl`.

### 7c. Write P5 — contract and clients (1c)

*Depends on P4.* The published OpenAPI contract, `manifest-mock`, the generated
client, and the reference console (D22) that imports **only** the generated
client — a lint boundary *and* a test enforce it, which is what converts "is the API
complete?" from an opinion into a build failure.

**Demo:** the §1 faculty journey, clickable, driven twice over one contract.

### Then, and only then

Execute in order: **P1 → P2 → P3** (with S6 as P3's acceptance) **→ P4 → P5**.
P1's own demo is C1's bar and has two parts nothing has tested yet — an offline
`make up`, and a fresh clone on a second machine. **Run the second-machine test on a
machine that has Valet installed**; that is the known interesting case.

---

## 8. Decisions waiting on Rich

Surface these; do not decide them.

- **§11 and §23 disagree about environment hostnames.** §11's lifetime table says
  sandbox is `{slug}-sbx-{id}` and staging `{slug}-staging`; §23 says
  `<slug>.<zone for that environment kind>` with three zone settings and **no id
  suffix**, because there is one sandbox per project at a time. P2 follows §23 and
  says why (Task 14). **Proposed: replace §11's hostname row with a pointer to §23.**
  Worth settling before P3, whose `routing/` builds these names for real.

- **C4's actual turnaround time** for UBC IAM registration and the PIA is
  **unmeasured**, §9 calls it the highest-risk dependency in the design, and
  **nobody has started the clock.** It has weeks of latency and no software
  dependency, so it can start today. See `external-track.md`. This is the single
  most valuable non-code action available.
- **Fix `passport-ubcshib` upstream, or leave it?** Not needed — `tlef-starter`
  already bridges both attribute formats and C6 forbids a library change being a
  prerequisite. Its real gaps are the unreachable MACE entry and missing OID entries
  for `uid` and `eduPersonPrincipalName`. If fixed, ship as **0.2.0** so the six live
  apps on `^0.1.6` adopt deliberately.
- **Does LiteLLM's embedding `encoding_format` bug affect a commercial provider, or
  only the Ollama path?** Unmeasured — only Ollama was reachable offline. Cheap to
  settle the first time anyone has a provider key.

**Closed recently:** who re-adds the `127.0.0.2` alias after a reboot. P1 decides it:
`make up` does, with `sudo`, guarded so it prompts only when the alias is missing. A
launchd daemon was rejected because it leaves a root-owned service `make reset` would
not remove.

---

## 9. Lessons — each one was paid for

These are about *how to work here*, and they are in the roadmap too, which is the
maintained copy.

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
