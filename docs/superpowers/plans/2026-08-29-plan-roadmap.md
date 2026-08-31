# Manifest — Plan Roadmap

**Spec:** [`docs/superpowers/specs/2026-08-29-manifest-platform-design.md`](../specs/2026-08-29-manifest-platform-design.md)
**Spike briefs:** [`2026-08-29-phase-0-spike-briefs.md`](./2026-08-29-phase-0-spike-briefs.md)
**Date:** 2026-08-29
**Status:** toolchain decisions await sign-off; everything else agreed

---

## What this document is

The spec is the architecture for Phases 0–5 and says so on its first page. This is
the layer between it and the implementation plans: **which plans exist, in what
order, what each one has to demonstrate, and the six things §17's phasing does not
account for** — plus one §3 constraint, C6, that turns out to be miscalibrated and
needs rewording.

It is not itself a plan. No code appears here.

### What was validated

`manifest-phases.html` is a faithful plain-language rendering of §17 — spike
ordering, the 1a/1b/1c split, and the four sequencing defences all match the spec.
There is nothing to reconcile between the two documents. The six gaps below are
disagreements with **both**, not between them.

Three of §17's sequencing arguments were checked and stand as written:

- **Security lands in 1a, not spread through the middle.** §3.5's framing —
  Manifest is a containment system that happens to deploy — means containment has to
  be true before anything runs. Retrofitting per-app networks and egress policy after
  services and routing exist is the rework the rest of the document avoids.
- **The blueprint descriptor cannot wait.** D30's argument is correct and is the
  reason gap 2 below moves it *earlier* still.
- **The console comes before the real front-end.** D22's import rule converts "is
  the API complete?" from an opinion into a build failure, and finding the gaps in
  month two rather than month eight is worth the console's cost several times over.

---

**New here?** Read [`../ORIENTATION.md`](../ORIENTATION.md) first — what Manifest is,
what has been established, what this machine will do to you, and the plan queue. This
file is the *status* record; that one is the durable briefing.

## Spike status — the ledger plan authors read

Kept here rather than in a handoff note, because handoffs are rewritten and this is
what tells you whether a plan's blocking condition has cleared. **Update this row
when a findings note lands** — it is step 3 of the close-out checklist in
`../spikes/HANDOFF-2026-08-30.md` §6, which also lists the other documents that state
status and go stale.

| Spike | Status | Answer, in one line | Unblocked |
|---|---|---|---|
| **S7** | ✅ **done** 2026-08-29 (~1.5 h of 3 days) | **Yes** — split-horizon DNS works via two dnsmasq processes. **The zone changed to `*.manifest.internal`**: Laravel Valet owns `.test` plus ports 53/80/443 on UBC developers' machines. | **P1** in full; P3's routing |
| **S2** | ✅ **done** 2026-08-29 (~0.5 h of 2 days) | **Yes** — one `INSERT` registers a working SP, no reload, no restart, no cache TTL. Manifest writes no PHP. Attribute release needs `core:AttributeLimit` *and* registration-time validation, or it fails open. | **P4 (1b)**'s shape; P2's IdP metadata schema |
| **S1** | ✅ **done** 2026-08-30 (~2 h of 3 days) | **Yes** — bare repo → routed healthy container with a bound database, and **§11's `Driver` interface needed no revision**. Rootless BuildKit works, but not via buildx's own driver. | **P3**; **P2 Tasks 9+** |
| **S3** | ✅ **done** 2026-08-30 (~2 h of 2 days) | **Yes** — every mechanism §10 assumes works and `ubc-genai-toolkit` needs no change, but **three defaults are wrong**: keys need `allowed_routes` (one port serves admin *and* proxy, and an app key can mint a child that outlives it), `embed()` needs `encoding_format: 'float'` (192 zeros instead of 768 floats, silently), and the LiteLLM `user` must be namespaced per app (end-user budgets are global). | **P4 (1b)** |
| **S6** | ⬜ deferred — runs as P3's acceptance | Container isolation; becomes §16's security regression tier. | Phase 3 |
| **S4** | ⬜ deferred — before Phase 4 | Wake-on-request. | Phase 4 |
| **S5** | ⬜ deferred — before Phase 3, after S6 | An agent inside a sandbox. | Phase 3 |

**Every spike blocking Phase 1a is now done. P1, P2 and P3 can all be written.**
The remaining three spikes are deliberately later: S6 runs as P3's acceptance
exercise, S5 after S6, and S4 before Phase 4. **Nothing is waiting on a spike.**

Findings notes live in `docs/superpowers/spikes/`. All spec changes each spike
implied have already been applied to
[`2026-08-29-manifest-platform-design.md`](../specs/2026-08-29-manifest-platform-design.md),
so **the spec is current and outranks the spike briefs**, which are deliberately
left as a record of what was originally asked.

### Spec action raised by P2 — ✅ applied 2026-08-31

**§11 and §23 disagreed about environment hostnames.** §11's lifetime table gave
sandbox `{slug}-sbx-{id}` and staging `{slug}-staging` — suffixed labels sharing one
zone. §23 gives `<slug>.<zone for that environment kind>`, three separate zone
settings, and no id suffix. Both could not be right, and P3's `routing/` builds these
names for real.

**Resolved in §23's favour, with Rich's approval, and both edits applied:** §11's
hostname row now points at §23, and §23 records *why* the kind lives in the zone.

**What settled it was not seniority between the sections but a flaw neither of them
had noticed.** The suffixes in §11's scheme are themselves legal slugs under §7's
`^[a-z][a-z0-9-]{2,38}$`, so a project named `chem-labs-staging` and the staging
environment of a project named `chem-labs` both resolve to `chem-labs-staging` —
squattable in a platform where faculty create projects self-serve. Putting the kind in
the zone makes that unrepresentable, with no reserved-suffix list to keep in sync.
The alternative would have needed a new §7 rule just to be safe.

Everything already built agreed with §23 — S7 curled all three zones, P1's Caddyfile
serves all three, P2's `config.ts` and Task 14 assert them — so this was one stale
row, not a design change.

---

## Lessons that outlive any one spike

Recorded here because they are about *how to run this work*, and each was paid for.

- **A plan is not verified until it runs.** P2's written self-review found seven
  defects. Executing four of its twenty-one tasks then found five more, none of them
  findable on paper — pnpm 11 making an un-named build script a hard error, ESLint 9's
  gitignore-style globs having no extglob so the boundary rule caught almost nothing,
  typescript-eslint not honouring the `_` prefix the plan's own code used, a negative
  control pointed at a target that could not fail, and an unguarded table index that
  turned drift into a crash in an unrelated test. Five in four tasks. The seventeen
  unexecuted P2 tasks and all of P3–P5 carry the same unmeasured rate. Keep planning
  ahead — but execute a cheap representative slice early rather than banking a large
  unexecuted stack.
- **A green result is not evidence a control is in force.** S1's first build appeared
  to succeed while silently using the public npm registry instead of the mirror —
  `.npmrc` was copied *after* `npm install`. Only checking the mirror's storage caught
  it. Test every claimed control with a **negative control**: show it correctly
  failing when you remove the thing that makes it work.
- **Assert the shape of the answer, not that an answer arrived.** S3 ran six toolkit
  checks against LiteLLM and all six passed; one of them was returning 192 numbers
  where 768 belonged, almost all zero, with no error anywhere. The bug was visible
  only because the *dimension* was printed and someone knew what `nomic-embed-text`
  produces. "It returned a vector" and "it returned the right vector" are different
  claims, and only the second is worth writing down. The same applies to a stream
  that yields zero chunks and calls it success.
- **Treat a briefing document as evidence, not fact.** `START-HERE.md` stated that
  `/etc/resolver/test` pointed at a dead nameserver. It did not, and that single wrong
  premise is what forced the zone change. Re-verify anything you are about to depend
  on.
- **Briefings go stale within days.** `HANDOFF-2026-08-30.md` was sending its reader
  to a finished spike one day after it was written. Anything that states current
  status needs an owner and a date.
- **Handoff chains strand durable knowledge.** The list of this machine's landmines —
  Valet's ports, the three load-bearing dnsmasq flags, `PUT`-not-`POST` — spent a day
  behind a SUPERSEDED banner because it lived inside a dated handoff. Durable content
  belongs in a durable document (`../ORIENTATION.md`); only *what to do next* belongs
  in a handoff.
- **Run the plan self-review, and record what it caught.** P1's found five defects
  before anyone executed a line. The worst: the verification script used
  `apk add bind-tools` to get `dig` into a container — which needs the network, so
  the offline acceptance test would have failed on its own harness. Writing down what
  the review caught stops the next reader mistaking a deliberate fix for a mistake.
- **Decide, then document the decision.** Rich would rather an agent settle a routine
  question and record the reasoning than block on asking. P1's *Decisions this plan
  makes* section is the pattern: the option chosen, the options rejected, and what it
  would cost to change course later. Questions are for what is genuinely his — spec
  changes, host changes, anything irreversible.
- **Prefer ownership-adjusted risk.** S2's risk was priced as existential and was not,
  because `docker-simple-saml` is ours. Ask what a "no" actually costs *given what we
  control* before ranking a risk.
- **Spikes have come in far under their timeboxes** (~1.5 h, ~0.5 h, ~2 h against
  3, 2 and 3 days). Do not re-plan the schedule on that: all three were the tractable
  ones, and the estimate that matters — C4's IAM/PIA turnaround — is still unmeasured.

---

## The plan set

| Plan | Phase | Scope | Demo |
|---|---|---|---|
| **P0** | 0 | Seven spike briefs | a findings note per spike |
| **P1** | 1a-i | Local substrate | `make doctor` green offline; one name resolving correctly from host **and** container |
| **P2** | 1a-ii | Control-plane spine | project → spec → release, against the fake driver, in milliseconds, no Docker |
| **P3** | 1a-iii | Docker driver & deploy spine | fixture app healthy at a `manifest.internal` URL, clean checkout, offline |
| **P4** | 1b | Identity, secrets & AI | the proof app — CWL login, Mongo write, LLM answer — via `curl` |
| **P5** | 1c | Contract & clients | the §1 journey, clickable, driven twice over one contract |
| **P6–P11** | 2 | six plans, listed below, **not written yet** | — |

**P0 is written.** P1–P5 are written when their inputs exist; see *Order of
operations*. Each of P1–P5 carries the required plan header, its own file-structure
map, and bite-sized TDD steps with real content — no plan may contain a step
standing in for a spike result.

### P1 — 1a-i · Local substrate

*Depends on: S7. **Written 2026-08-30** —
[`2026-08-30-p1-local-substrate.md`](./2026-08-30-p1-local-substrate.md), 13 tasks.
Ready to execute; nothing blocks it.*

§21's platform inventory as running infrastructure: dnsmasq with S7's resolved
split-horizon design, the custom `xcaddy` image carrying rate-limiting and
Coraza/OWASP-CRS (§20 — this is the one image built rather than pulled), Postgres
with its three databases, the registry, Verdaccio, the egress proxy, Ollama as a
host application, and `make seed` / `up` / `reset` / `doctor`.

**Why it is its own plan:** it is configuration and shell, not TypeScript, and it
is the one plan whose content S7 dictates almost line by line. It also carries C1's
real bar — *a new developer reaches a working loop from a clean checkout* — which
is a property of this plan and nothing else.

**Demo:** `make seed && make up && make doctor` on a second machine, offline after
seeding, with a placeholder served over trusted HTTPS at a `manifest.internal` name
that resolves identically from the host browser and from inside a container.

**Three decisions the plan makes**, called out here because they were open and are
now closed: `make up` re-adds the `127.0.0.2` loopback alias itself with `sudo`,
guarded so it prompts only when the alias is actually missing (a launchd daemon was
rejected — it leaves a root-owned service `make reset` would not remove); `make up`
brings up the **whole** §21 inventory including LiteLLM and the IdP, so P4 writes
clients rather than infrastructure; and `make doctor` (preconditions) and
`make verify` (properties) are separate deliverables, which is what gives an
infrastructure plan a real test cycle.

### P2 — 1a-ii · Control-plane spine

*Depends on: **S1**, for the `Driver` interface only. Executes after P1.*

*Status: **complete — 21 tasks**, 2026-08-31. Written in two passes. Tasks 1–8 landed
first and paused there: settled by §7 and §25, and safe against any spike outcome.
Tasks 9–10 were drafted at the same time but held back, because S1 existed to correct
the `Driver` interface and the contract suite P3 inherits; Tasks 11 onward were
blocked behind them, consuming their types. **S1 reported on 2026-08-30 and the
interface needed no revision**, so Tasks 9–10 were promoted rather than rewritten and
Tasks 11–21 written against them. The plan's self-review caught seven defects and
records each one.*

*Execution began 2026-08-31: **Tasks 1, 9, 10 and 11 are built and green** — the
runtime island, which needs no Postgres and no Docker. 19 tests. Running them found
four further defects the self-review could not have: pnpm 11 makes an un-named
dependency build script a hard error; the ESLint boundary patterns were backwards and
caught almost nothing; `typescript-eslint` does not honour an `_` prefix by default,
so the fake driver's faithful `exec(id, cmd, _opts)` failed lint; and the state
machine's unguarded table index turned drift into a TypeError in an unrelated test.
All four are fixed in the plan. **Tasks 2–8 and 12–21 are written but unexecuted.***

Repository scaffolding (gap 1), the Fastify service, Drizzle schema for §6's
entities, and the modules that are pure functions or driver-agnostic:

- `spec/` — parse, validate, `isSensitiveDiff()`, `checkBlueprintCompatibility()`
- `source/` — the local bare-repo git driver (D5 driver 1)
- `blueprints/` — registry, descriptor parsing, version pinning, and one minimal
  blueprint (gap 2)
- `runtime/` — the `Driver` interface, the **fake driver**, the driver contract suite
- `projects/`, `identity/` — the authorization model, `ProjectMember` checks, and
  the **authorization contract suite**, against a dev-only auth shim (gap 3)
- `releases/` — Release as an immutable `Build` + `AppSpec` + resolved config
- a minimal HTTP surface sufficient to drive the above (P5 formalises it into a
  published contract)

**Why this is the interesting plan.** §16 calls the fake Driver *"the
highest-leverage decision"* in the design: it lets the reconciler, approval logic,
API and routing decisions be tested with no Docker, no network, in milliseconds.
Putting every fake-driver-testable module in one plan, before any real Docker
exists, is what cashes that in. §17's single 1a obscures it.

**Demo:** the full lifecycle — create a project, validate a spec, produce a
release, deploy it — driven end to end against the fake driver by a test suite that
runs in under a second.

### P3 — 1a-iii · Docker driver & deploy spine

*Depends on: S1, S7, P1, P2. **S6 runs as its acceptance.***

The real Docker driver passing the same contract suite the fake driver passes, plus
everything that only exists once containers do:

- the builder — ephemeral, rootless BuildKit, credential-free, network-restricted
  to the mirror and registry (§12, D13)
- registry push and digest binding (§13)
- `services/` — dedicated per-app-per-environment containers (D3)
- `routing/` — hostname derivation from §23's zone rule, listener assignment,
  Caddy's JSON admin API
- **all of §12's cross-cutting security**: container hardening baseline, per-app
  networks, east-west denials, default-deny egress through the forced proxy
- `Driver.capabilities()` reporting honestly what it cannot enforce

**Demo:** the fixture app built from a bare repo, routed, healthy at a
`manifest.internal` URL, from a clean checkout, with the network off — plus S6's probe
matrix showing what a hostile process in that container could reach.

### P4 — 1b · Identity, secrets & AI

*Depends on: S2, S3, P3. **Both spikes have reported**; only P3 is outstanding.*

As §17 has it, with gap 2's boundary applied: SP auto-provisioning against
**whichever metadata mechanism S2 selects**, per-app keypairs, `secrets/` envelope
encryption, the §8 injection contract and its drift test, the full `node-ts-mongo`
blueprint with its knowledge pack, the LiteLLM client with the classification-gated
model catalogue (D17), events, WebSocket streaming, redaction at capture,
incidents. Deletes the dev auth shim (gap 3).

Two consequences of the revised C6 land here: the blueprint descriptor **pins exact
versions** of `passport-ubcshib` and `ubc-genai-toolkit`, and if either 0.2.0 safety
change has shipped by then, this is where Manifest adopts it. Neither is a
prerequisite — P4 must work against the currently published versions, or C6's final
clause is violated. S3 confirmed the AI half of that: `ubc-genai-toolkit-llm` 0.4.0
drives completions, embeddings, streaming and per-user attribution through LiteLLM
**unmodified**.

**Three S3 findings are P4 tasks, not notes.** The LiteLLM client mints every key
with `allowed_routes` and every agent key with a `duration` TTL; the blueprint's AI
wiring passes `encoding_format: 'float'` on every embedding call; and the end-user
identifier is `hash(ubcEduCwlPuid ‖ project ‖ environment)`, never a bare PUID hash.
Each has a §16 test attached. Read `spikes/S3-findings.md` §Evidence 8 and 11 before
writing the AI module — the two failures they describe are both silent.

**Demo:** §16's proof app — log in with CWL, write a note to its own Mongo, ask the
LLM a question, display the answer — driven by `curl`.

### P5 — 1c · Contract & clients

*Depends on: P4.*

OpenAPI generation from the routes, the versioned TypeScript client,
`manifest-mock`, delegated tokens and `PendingAction` (D24), the knowledge pack API
(D25), `console/` with its import boundary, a read-only `LaunchReadiness` view, the
audience question at project creation (§24 — collected, acted on in Phase 2), and
the CI acceptance script.

**Demo:** the §1 journey — login through to seeing the launch-readiness gate —
clickable in the console *and* driven headlessly by a script, both using nothing but
the generated client.

### Phase 2 — six plans, deliberately not written yet

§17 lists Phase 2 as one stage. It is six independent subsystems that happen to
share a boundary, and the writing-plans scope check is explicit that each should be
its own plan producing working software:

| | Plan | Covers |
|---|---|---|
| P6 | Production & approvals | production environments, promotion by digest, the `LaunchReadiness` **gate** (P5 ships only its read-only view), sensitive-diff escalation, approvals with step-up re-auth, gate integrity (§13) |
| P7 | Custom domains | §23 end to end: `Domain` lifecycle, CNAME + TXT verification, certificate issuance, the upload path, expiry alarms, D27's ordering constraint |
| P8 | Launch package generation | §9 and D19: the IAM registration package via `saml-metadata-generator`, the PIA draft, both as tracked objects with submission state |
| P9 | Audience & capacity | §24: the tiers' production effects, pre-warming for `burst: synchronised`, the load rehearsal, upgrade requests through the admin queue |
| P10 | Showcase & forking | §27: publishing, the fork operation, and D32's not-copied list — which is the whole of its security argument |
| P11 | Admin console | §26: the queue as the primary screen, fleet, people, spend, health and risk, audit; built on admin-scoped endpoints of the same public API (D31) |

Dependencies among these are real but shallow: P6 is a prerequisite for P7, P8 and
P9; P10 and P11 depend on P6 only. P8 should start earliest of the four that follow
P6, because it feeds the external track below.

### Phases 3–5 — not planned

Deliberately. Phase 3 depends on S5 and S6 outcomes that do not exist yet, and
Phase 5 is blocked on a UBC decision — RHEL 9 VMs or Kubernetes — that has not been
made (§19). A detailed plan written today would be substantially wrong by the time
anyone executed it. **The spec is the durable artefact; plans are the disposable
execution layer.** Each is written when its predecessor lands.

---

## Order of operations

1. **Write P0.** Done.
2. **Run S7 and S2.** These are the two the spec puts first. Nothing else on this
   list should start before they report.
3. **Run S1 and S3.** Done — 2026-08-30. All four Phase-1a-blocking spikes have
   reported.
4. **Write P1, P2 and P3** with real findings in them. **P1 is written**
   (2026-08-30). **P2 is complete** (2026-08-31, 21 tasks). **P3 is next to write**,
   and can be written now — S1 and S7 have both reported, and P3 inherits P2's driver
   contract suite unchanged.
5. **Execute P1 → P2 → P3.** S6 is P3's acceptance exercise.
6. **Start the external track now** (below), in parallel with all of the above. It
   has the longest lead time in the project and no software dependency.
7. **Write P4 when P3 lands**, and P5 when P4 lands.

**Spikes come before plans, including P2.** An earlier version of this section said
to write P2 during step 2 on the grounds that it was spike-independent. That was
wrong in two ways:

- **S1 revises the `Driver` interface.** Its brief lists *"a list of `Driver`
  interface signatures that turned out to be wrong"* under what survives the spike.
  P2 ships that interface, the fake driver and the **contract suite P3 inherits
  unchanged** — building all three on an unvalidated interface is exactly the rework
  the spikes exist to prevent.
- **P1 executes before P2, and P1 needs S7.** So a finished P2 would sit
  unexecutable while S7 ran. Writing it early bought no schedule, only risk.

Roughly the first half of P2 — scaffolding, `spec/`, `blueprints/` and the database
schema — is genuinely settled by §7 and §25 and survives any spike outcome, and was
written first for that reason. **S1 reported on 2026-08-30 and the `Driver` interface
needed no revision**, which validated Tasks 9 and 10's existing sketch rather than
superseding it and unblocked Tasks 11 onward. The plan is now complete
([`2026-08-29-p2-control-plane-spine.md`](./2026-08-29-p2-control-plane-spine.md),
21 tasks).

The point of steps 2–4 is that **no plan ever contains a placeholder standing in
for a spike result.** A step reading *"determine the dnsmasq configuration"* is a
plan failure, not a task.

---

## Six gaps in §17's phasing, and how each is resolved

### 1 — Nothing anywhere covers repository scaffolding

The repo is documentation only. D11 fixes the stack — TypeScript/Node + Fastify,
Postgres, Drizzle, React + Vite — but package manager, test runner, workspace layout
and the machinery that enforces D22's import rule are unspecified, and every plan's
commands depend on all four.

**Resolution:** the decisions below, made once, here. Scaffolding is **Task 1 of
P2**, not its own plan — setup folds into the task whose deliverable needs it.

### 2 — The blueprint straddles 1a and 1b

§17 line 1198 puts *"blueprint-managed build → image digest"* in 1a. Line 1199 puts
the blueprint **and its descriptor** in 1b. Under D13 the Dockerfile comes from the
blueprint, so 1a's builder needs one and the phasing does not say where from.

**Resolution: split the blueprint into machinery and content.**

- **P2 ships the machinery** — the `blueprints/` registry, `blueprint.yaml`
  descriptor parsing, `checkBlueprintCompatibility()`, major-version pinning, and
  **one minimal blueprint** (`fixture-node@1`: a Dockerfile template, a health path,
  no auth, no AI) sufficient for P3 to build something.
- **P4 ships the content** — `node-ts-mongo@1` in full: the auth component, the
  attribute bridge §9 requires, AI wiring, and the knowledge pack.

This follows D30's own argument rather than departing from it: *"a descriptor added
after the fact is a refactor of the builder, the health check, the service catalogue
and the injection contract at once."* Every one of those four lives in P2 or P3, so
the descriptor has to be there with them.

**Spec action:** §17's 1a and 1b rows should be reworded to say machinery and
content rather than both saying "blueprint".

### 3 — Manifest's own login has no home in 1a

§9 (line 528) makes Manifest itself a Service Provider — its own users log in with
CWL, and locally it uses the Manifest IdP like everything else. But the Manifest IdP
lands in 1b, and §17 puts the **authorization contract suite** in 1a. As written,
1a needs a login it cannot have.

**Resolution:** P2 ships the authorization *model* — `User`, `ProjectMember`, roles,
and the contract suite exercising every route as owner, collaborator, unrelated user
and admin — against a **dev-only auth shim**: a local endpoint that mints a session
for a named test user, gated behind an explicit `MANIFEST_DEV_AUTH` flag.

Two safeguards, because a temporary shim is exactly the kind of thing that survives
quietly:

- the service **refuses to start** if `MANIFEST_DEV_AUTH` is set while
  `MANIFEST_ENV` is `staging` or `production`
- **a test asserts that**, in the same style as §8's injection-drift test and §16's
  identity-path regressions

P4 replaces the shim with real CWL against the Manifest IdP, and carries an explicit
task to delete it.

### 4 — S6 is placed too late to shape anything

§17 requires S6 "before Phase 3, and earlier is better." But S6 tests the container
hardening baseline, and §17 also says *all cross-cutting security lands in 1a*. Run
before 1a, S6 has nothing to test; run before Phase 3, its findings arrive after the
code they were meant to shape.

**Resolution:** S6 runs as **P3's acceptance exercise**, against the real Docker
driver with the hardening baseline applied. Its probe matrix becomes the §16
security regression tier, and any probe that reaches is a defect P3 must fix before
it is done — in particular §21 divergence 7, the reachable host gateway, which the
spec itself calls *"the one local divergence that is a real security weakening
rather than a convenience."*

This is the only deliberate departure from §17's spike ordering.

### 5 — The UBC external track has no home in any plan

§17 says to start the proof app's IAM registration and PIA during Phase 1. §19 adds
two more that gate everything: **Manifest's own IAM registration** (it is an SP for
its own CWL login) and a **platform-level PIA for the control plane**. None of it is
software, so no implementation plan will ever contain it — and it has the longest
lead time in the project. C4 is non-negotiable and multi-week by nature.

**Resolution:** a tracked checklist at `docs/external-track.md`, started now,
carrying for each item: what it gates, who at UBC owns it, what Manifest must supply,
when it was raised, and its current state. Five items to open with:

| Item | Gates | Raise |
|---|---|---|
| Proof app IAM registration | Phase 2 ending with a genuinely launchable app | during Phase 1 (§17) |
| Proof app PIA | same | during Phase 1 (§17) |
| Manifest's own IAM registration | deploying the control plane to UBC infrastructure | now |
| Platform-level PIA for the control plane | same | now |
| Access to `authentication.stg.id.ubc.ca` for D21's rehearsal | Phase 2 | before Phase 2 |

Raising the first two during Phase 1 does a second job §17 names: it puts the
documents Manifest generates in front of a real reviewer while they are still cheap
to change, which is the only way to find out whether they are any good.

Two further §19 items — **incident response ownership** and the **independent
security review** — are required before the first public production app and should
be named on the same checklist even though they bite later.

### 6 — Nobody owns the proof app

§16 specifies it, P3 needs it as a fixture, and §17 makes it the app whose external
registration starts in Phase 1. It has no home in the module map.

**Resolution: two artefacts, not one.**

- **`fixtures/fixture-app/`** — P3's build target. Trivial by design: a health
  endpoint and one route that writes to Mongo. No auth, no AI, because P3 has
  neither.
- **`fixtures/proof-app/`** — P4's deliverable and §16's proof app: log in with CWL,
  write a note to its own Mongo, ask the LLM a question, display the answer. Built
  on `node-ts-mongo@1`, so it exercises the blueprint rather than bypassing it.

The proof app is the one that goes to UBC on the external track. Its `manifest.yaml`
is therefore the first real input to P8's registration package and PIA draft, which
is a good reason for it to be honest rather than minimal.

---

## C6 needs rewording

C6 currently reads: *"Existing app-side libraries are unchanged.
`passport-ubcshib` and `ubc-genai-toolkit` are used as-is. Manifest adapts to them,
not the reverse."* §3 says of its constraints: *"These are fixed. Designs that
violate them are wrong."*

**But these libraries are ours.** `passport-ubcshib` is `github.com/ubc/passport-ubcshib`
at 0.1.6; `ubc-genai-toolkit` and `docker-simple-saml` are equally in our hands.
C6 was written as though ownership and immutability were the same thing. They are
not, and the difference is worth several weeks of avoided work.

### What the constraint is actually protecting

Not our inability to edit — the **blast radius**, and the discipline. Six
applications consume `passport-ubcshib` today:

```
tlef-biocbot  0.1.4     tlef-engeai     ^0.1.6
tlef-create   ^0.1.4    tlef-financebot ^0.1.6
tlef-grasp    ^0.1.6    tlef-starter    ^0.1.6
```

**The blast-radius half dissolves on inspection.** A caret range on a `0.x` version
pins to the *minor*: `^0.1.6` resolves to `>=0.1.6 <0.2.0`. So a **0.2.0 release
reaches none of these applications silently.** Manifest's blueprint pins its version
explicitly (the descriptor is the natural place — D30), and the others adopt when
they choose.

**The discipline half survives and is worth keeping.** It is what stops Manifest
quietly becoming the system that dictates how every UBC application does
authentication.

### Proposed wording

> **C6 — Manifest adapts to existing app-side libraries rather than reshaping
> them.** Changes to `passport-ubcshib` and `ubc-genai-toolkit` are permitted only
> where they are strictly safer or more correct **for every consumer**, are released
> under a version Manifest pins, and are **never a prerequisite for Manifest to
> work**.

The final clause is the load-bearing one. If Manifest *requires* a library change,
the design is wrong and should be fixed in Manifest. If a library change makes every
consumer safer, ship it.

### Two changes that clear that bar

1. **`SAML_ENVIRONMENT` should fail closed.** `(process.env.SAML_ENVIRONMENT || 'STAGING')`
   appears at `index.js:120` **and `:307`** — §8 names only the first. An app
   deployed without that variable points at `https://authentication.stg.id.ubc.ca`,
   which is real UBC infrastructure. §8 already calls this out as easy to get wrong
   and §16 carries a regression test for it. Throwing on an unset value is strictly
   safer for all six consumers, not a Manifest convenience.
2. **The attribute mapping gaps.** §9 records that `tlef-starter` carries
   `server/src/components/auth/saml-attributes.ts` *"precisely to bridge that,
   because `passport-ubcshib`'s own mapping has gaps."* Fixing it upstream removes
   the bridge from every consumer, rather than replicating it into the blueprint —
   which is §20's *"the blueprint is a security multiplier"* argument applied one
   level further down.

Both are additive safety work, released as 0.2.0, adopted deliberately.

### What gets *more* important as a result

**§16's injection-contract drift test.** §8 exists because the contract *"was wrong
once, from being written against memory of the libraries rather than against them."*
If those libraries become moving targets, that test is the only thing keeping §8
honest — and it must now assert against a **pinned exact version**, recorded in the
blueprint descriptor, not against whatever is installed.

**Spec actions:** reword C6 in §3; soften §9's risk paragraph and §19's status line
for the SQL metadata source (see spike briefs, S2); note in §2's asset table which
assets are editable-with-discipline rather than fixed.

---

## Toolchain decisions

**These need sign-off.** D11 fixes the stack; these fill the gaps it leaves, and
every plan's commands depend on them.

| | Decision | Why |
|---|---|---|
| **Package manager** | pnpm workspaces | Strict `node_modules` means a package cannot import what it did not declare, which reinforces §5's module boundary rule mechanically rather than by convention. The content-addressed store also makes repeat offline installs cheap, which matters to C1. |
| **Test runner** | Vitest, plus Supertest for route tests | TypeScript-native with no build step, and fast enough that §16's fake-driver tier gives millisecond feedback — the property that makes it "the highest-leverage decision". §16 already names Supertest. |
| **Browser automation** | **none in Phase 1** | §16 is explicit that the CI half of the acceptance tier is *"a script using the same generated client… headless, no browser automation."* Playwright arrives with §15's WCAG gate, not before. |
| **Lint / format** | ESLint flat config + Prettier | D22 requires the import boundary be enforced by **both** a lint rule and a test. A lint rule can be disabled inline; a test that walks the import graph cannot. Ship both. |
| **Migrations** | Drizzle Kit, checked in | Follows D11. §20 needs `events` to be append-only **by grant**, so the migration set owns role grants too, not just tables. |
| **Node** | pinned LTS via `.nvmrc` and `engines` | Reproducibility is C1's bar. The blueprint's base image is pinned separately by digest in its descriptor (D30). |
| **Local orchestration** | Compose for the platform stack; the Docker **Engine API** for workloads | §11's `Driver` is per-instance and idempotent; Compose is file-oriented with the wrong granularity. Using it for workloads would grow a second orchestration layer, which is exactly what D1 exists to prevent. |
| **CI** | GitHub Actions | Not optional infrastructure: §13 makes CI the **only legitimate source of promotable images**, because laptops are arm64 and UBC is x86-64. Configure it early even though it binds at Phase 5. |
| **App-side library versions** | pinned exactly in the blueprint descriptor, never by range | Under the revised C6 these libraries can change, so §8's contract is only meaningful against a stated version. §16's injection-drift test asserts against the pinned one — a caret range would let the contract drift underneath the test that exists to catch drift. |

### Workspace layout

```
manifest/
├── packages/
│   ├── control-plane/        # Fastify service; §5's modules as src/<module>/index.ts
│   │   └── src/{identity,projects,source,spec,blueprints,build,runtime,
│   │             services,routing,secrets,sso,launch,ai,releases,
│   │             observability,api}/
│   ├── contract/             # OpenAPI document + generated TS client (published)
│   ├── mock/                 # manifest-mock
│   ├── console/              # reference console (§22)
│   ├── admin-ui/             # admin console (§26)
│   └── mcp/                  # Phase 3 (§22)
├── blueprints/
│   ├── fixture-node/         # P2: minimal, for P3's builder
│   └── node-ts-mongo/        # P4: descriptor, Dockerfile.tmpl, skeleton, agents/
├── fixtures/
│   ├── fixture-app/          # P3's build target
│   └── proof-app/            # P4's deliverable (§16)
├── infra/                    # Compose, dnsmasq, xcaddy build, seed scripts
├── Makefile
└── docs/
```

**Why the control plane is one package and not fourteen.** §5 requires each module
to have its own public interface and no reach into another's internals. Inside one
package that is an ESLint boundary rule plus deep-import restrictions; as fourteen
packages it is fourteen `package.json` files, fourteen build steps and a dependency
graph to maintain before any of it has earned its keep.

The packages that **are** separate are the ones with a genuine independent consumer:
`contract/` is published to the front-end team, `mock/` runs standalone as one
process, and `console/`, `admin-ui/` and `mcp/` are separate build targets whose
import rule (D22, D31) is then expressible as the cleanest possible statement —
*this package may depend on `contract` and nothing else.*

---

## What is deliberately not being decided yet

- **The UBC target driver** (§19). Kubernetes or RHEL 9 VMs is UBC's decision;
  C2 requires the control plane not to encode either, and Phases 0–4 are not blocked
  on it.
- **Wake-on-request's mechanism** (§11, S4). Genuinely open, and nothing before
  Phase 4 needs it.
- **Whether sandboxes need gVisor or Kata** (§12, S6). Recorded as
  `isolationLevel`, answered by S6, acted on in Phase 3.
- **Quarantine-on-first-use for dependencies** (§12). v1 picks the allowlist,
  because two mechanisms would be built and neither finished.
- **Anything in §15's hook table.** The hooks are built now because they are cheap
  now; what they unlock is not.
