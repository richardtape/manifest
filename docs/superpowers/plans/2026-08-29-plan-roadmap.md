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
[`../ORIENTATION.md`](../ORIENTATION.md) §6, which also lists the other documents that
state status and go stale. (That checklist used to live in `HANDOFF-2026-08-30.md`,
which is superseded; the pointer moved on 2026-09-04.)

| Spike | Status | Answer, in one line | Unblocked |
|---|---|---|---|
| **S7** | ✅ **done** 2026-08-29 (~1.5 h of 3 days) | **Yes** — split-horizon DNS works via two dnsmasq processes. **The zone changed to `*.manifest.internal`**: Laravel Valet owns `.test` plus ports 53/80/443 on UBC developers' machines. | **P1** in full; P3's routing |
| **S2** | ✅ **done** 2026-08-29 (~0.5 h of 2 days) | **Yes** — one `INSERT` registers a working SP, no reload, no restart, no cache TTL. Manifest writes no PHP. Attribute release needs `core:AttributeLimit` *and* registration-time validation, or it fails open. | **P4 (1b)**'s shape; P2's IdP metadata schema |
| **S1** | ✅ **done** 2026-08-30 (~2 h of 3 days) | **Yes** — bare repo → routed healthy container with a bound database, and **§11's `Driver` interface needed no revision**. Rootless BuildKit works, but not via buildx's own driver. | **P3**; **P2 Tasks 9+** |
| **S3** | ✅ **done** 2026-08-30 (~2 h of 2 days) | **Yes** — every mechanism §10 assumes works and `ubc-genai-toolkit` needs no change, but **three defaults are wrong**: keys need `allowed_routes` (one port serves admin *and* proxy, and an app key can mint a child that outlives it), `embed()` needs `encoding_format: 'float'` (192 zeros instead of 768 floats, silently), and the LiteLLM `user` must be namespaced per app (end-user budgets are global). | **P4 (1b)** |
| **S6** | ✅ **done** 2026-09-07 (as P3 Task 18) | **Every probe denied, every denial paired with a positive control, and one result better than the spec.** §21's divergence 8 no longer holds as written: the developer's machine is not merely policed but **unroutable** from an app network, because P3 Task 4 makes those networks `--internal`. Isolation measured as `container`; **whether that suffices for SANDBOXES is left to S5**, since these probes ran against a staging app. The matrix is a permanent test tier (`s6.docker.test.ts`), not a report. | Phase 3 |
| **S4** | ⬜ deferred — before Phase 4 | Wake-on-request. | Phase 4 |
| **S5** | ⬜ deferred — before Phase 3, after S6 | An agent inside a sandbox. | Phase 3 |

**Every spike blocking Phase 1a is now done, and S6 has since run as P3's acceptance
exercise.** Five of seven have reported. The remaining two are deliberately later:
**S5** after S6, and **S4** before Phase 4. **Nothing is waiting on a spike.**

### Controls probed outside a spike

The house rule is that **no plan may contain a step standing in for a spike result.**
S1's *Open questions* left two controls to P3 that a task must not merely assume, so
they were probed before P3 was written rather than discovered inside it.

| Probe | Status | Answer, in one line | Unblocked |
|---|---|---|---|
| **S1's two open controls** | ✅ **done** 2026-08-31 (~1 h 25 m of a 2 h timebox) | **Both work, and `registry:2` needs no design change.** A push token scoped to one repository path is enforceable with a JWT the control plane signs, and the negative control holds through `docker push` **and** rootless BuildKit. The builder's bounds are three mechanisms rather than one: **BuildKit has no build timeout at all**, and **`--storage-opt size=` is accepted, recorded in `HostConfig`, and silently does nothing** on Docker Desktop. | **P3** Tasks 9 and 10 |

| **P4's six** | ✅ **done 2026-09-07** (~1 h, before P4a was written) | **Four live defects and two version facts.** The Manifest IdP **could not issue an assertion at all** — no `saml20-idp-hosted.php`, empty `cert/`, metadata **500** — with `make verify` 34/0 throughout. `core:AttributeLimit` was unconfigured, so attribute release **failed open**. `authsources.php` used an OID `passport-ubcshib` does not map, so `ubcEduCwlPuid` was unreadable. **`MONGODB_DB_NAME` was never injected**, so every app wrote to a database called `app` while two Docker tests set it themselves and passed. Then: `ubc-genai-toolkit-llm@0.7.0` reproduces all three S3 findings, and **the toolkit cannot be forced through the egress proxy** — `http_proxy`, undici's global dispatcher and a patched `http.globalAgent` all bypassed, because the OpenAI SDK supplies its own `agentkeepalive` agent. | **P4a** Tasks 1, 2, 10, 11; **P4b**'s AI wiring and its LiteLLM route |

[`../spikes/S1-controls-settled.md`](../spikes/S1-controls-settled.md). The disk-quota
finding is a second `enforcesUserNamespaceRemapping`-shaped gap, and P3 reports it
through `capabilities()` for the same reason: declare it, do not imply it.

**P4's six are written up in P4a itself**, in its *Findings this plan is built from*,
rather than in a findings note — they were measurements against the running platform
rather than a spike, and the four defects are fixed by the tasks they motivated. The
pattern is the same one this section exists for: **probe first, then write the task**.

Findings notes live in `docs/superpowers/spikes/`. All spec changes each spike
implied have already been applied to
[`2026-08-29-manifest-platform-design.md`](../specs/2026-08-29-manifest-platform-design.md),
so **the spec is current and outranks the spike briefs**, which are deliberately
left as a record of what was originally asked.

### Spec action raised by P6b — APPROVED IN SUBSTANCE 2026-09-22, NOT APPLIED

Written in [P6b's *Spec actions*](./2026-09-22-p6b-subsequent-releases.md). **One. Rich chose the plan's Question 2 option (a) on 2026-09-22 with this wording shown beside it, which approves it in substance; it is NOT applied, and applying it waits for Rich to say so**: §13 D9.2's *"A change to `auth.attributes` additionally requires an IAM change request to reach `active`"* would read *"a change … **that adds an attribute UBC IAM has not registered**"*, with a sentence saying a removal re-escalates like any sensitive change and does not wait on IAM. `manifest-decisions.html` restates D9 and D16 and moves with it. **Not proposed, deliberately:** R4(d) (Rich kept §13 untouched on 2026-09-19), the new columns and table (§6 lists key fields, and P6a's `rehearsals` set the precedent), and the plan's Decisions 8 and 16, which make true what §13 and §9 already say.

### Spec actions raised by P6a — ✅ ALL THREE APPROVED AND APPLIED 2026-09-22

Written in [P6a's *Spec actions*](./2026-09-19-p6a-first-production-launch.md). **Action 3** — §13's
*Residual risk* now says *"only changes to the sensitive fields §7 lists re-escalate"*, naming no
number (it said five; §7 says seven). **Action 2**, decided as a third option Rich chose over the
plan's two — §20's step-up bullet now lists promotion to production and says approving a release is
not one of D24's four but a stricter **person-only** action; D24's row gains the person-only class
(approving a release, recording UBC's IAM registration or Privacy Office assessment): no token can
hold either, and a token that asks is refused outright, not given a pending action. **P6b builds
it.** Both applied only after Rich read the exact wording; `manifest-decisions.html`'s D24 swept
to match. **Action 1** — §21's *honest divergences* item 2 now says the two listeners are real and
separate (`srv0` on `127.0.0.2` for sandbox, staging and the platform's own names; `srv1` on
`127.0.0.3` for production) and states what stays divergent: both are loopback on one host. Applied
the same day, with one factual correction to the plan's wording.

### Spec action raised by the P6 brief — ✅ APPROVED AND APPLIED 2026-09-19

**One, and Rich chose a narrower version than was proposed.** The brief's R4 asked what asserts
that an app's *code* is safe. Nothing does, and §20's control map said so: *"Unreviewed code
reaching production — Accepted under D9."* The draft proposed edits to §12, §13, §15 and §20;
**Rich took §15, §20 and a new D33**, on the argument that §12 is *Supply chain* — packages,
lockfiles, registries, SBOM — and reviewing app source is not that, while §13 already describes
the AI-written approval summary the change would touch.

- **D33 (new)** — code review gets an **interface** in Phase 2 and implementations later, shipped
  as a null implementation whose verdict states no review was performed, feeding a
  **non-blocking** `LaunchReadiness` item. Rationale is D30's, applied to a second seam:
  retrofitting it would touch the builder, the approval record and the checklist at once. And it
  is honest by construction, because a placeholder that *appeared* to review would be another
  setting that reads like a control and is not.
- **§15** — the extension-hook row, which is what §15 exists for.
- **§20** — the control-map row now opens *"Still accepted under D9"*, keeps containment as the
  control, and ends *"until one lands nothing reviews code"*.

**The four shared HTML pages were swept with it** — `manifest-decisions.html` gained a
plain-language D33 card and every hardcoded count went **32 → 33** across all four files. That is
the half of a spec action that gets forgotten; §6 lists it for this reason.

**Implementations are NOT in P6.** P6a ships the seam; the `SemgrepReviewer` is the tracked
hardening item above; LLM diff review comes later, and its own control is a corpus of planted
defects, because a model that stops noticing fails silently.

### Spec action raised by executing P5a — ✅ APPLIED to §12, 2026-09-16, on Rich's instruction; tracked as its own hardening item

**§12, *Egress — default deny* (and §7's `egress.allow`): an app may not egress to a platform
surface.** `egress.allow` may name only destinations *outside* the platform — not the platform
zone (`*.manifest.internal`, and each environment zone at UBC) nor a platform service
(`manifest-*`); a platform surface is refused at validation as `EGRESS_ALLOW_INVALID`, before
deploy. **Why:** P5a Task 1's `[M2g]` measured that `renderAllowlist` accepts any syntactic
hostname and that the app's forced proxy — dual-homed onto `manifest-platform`, the app network's
only route out — tunnels raw TCP to *any* port (the control opened `manifest-idp:80`) to any name
it resolves there, so a declared `manifest-postgres` or `console.manifest.internal` opens a tunnel
across the east-west boundary §12 exists to hold. The three platform destinations an app may reach
(mirror, AI proxy, IdP) are the baseline the platform adds, never declared, so a platform surface
has no honest use; and §12/§20 must not rest a network boundary on the service's credentials.
**Scope:** platform surfaces only — not app-to-app public hostnames (east-west, denied at the
network layer, untouched); not a replacement for the edge's source allow-list, which stays the
primary control (Task 3, probe 15). Derived from §23's reserved labels and the platform zones, not
hardcoded. **Placement:** its own hardening item (Rich, 2026-09-16), **not P5a** and not folded
into P5a Task 9 — the check reuses Task 9's reserved-label loader, so it can only be built after
P5a executes. Tracked below under *Tracked hardening items*. The full write-up, with the wording as
applied, is in P5a's *Spec actions* (raised while executing). **The §12 text is now applied**
(Rich told the executing agent to make the change so the decision would not be lost when another
agent takes over); the spec rule now describes a behaviour code does not yet enforce, which is why
the implementation is tracked rather than left to a future reader to notice.

### Spec action raised by executing P4a — ✅ approved 2026-09-08, spec text not yet edited

**§12, *Supply chain*.** The gate blocks on a Critical or High **that has a published
fix**; one with no fix is recorded on the Release and reported to the owner for §20's
fleet-wide rebuild, exactly as a base-image finding already is.

**Why it had to be settled rather than worked around.** `passport-ubcshib@0.1.6` →
`passport-saml` (npm-**deprecated**, GHSA-4mxg-3p6v-xgq3, critical, range `*`, no fix)
→ `@xmldom/xmldom@0.7.13` (five highs). §12 says dependency scanning is
platform-mandatory and *"cannot be waived by an app"*; C6 says a library change may
**never** be a prerequisite. Under the old rule the platform could not build the thing
it exists to build. Measured alongside: `@node-saml/passport-saml@5.1.0` audits
**clean**, so the long-term fix for UBC is a `passport-ubcshib` release — which is
exactly the "strictly safer for every consumer" change C6 permits, and is **not**
blocking Manifest.

**The gate kept its teeth**, and that was checked rather than assumed: the five xmldom
highs still blocked after the change, and only an npm `override` to 0.8.15 cleared
them. Implemented in `build/scan.ts`; **the spec's own text is unchanged**, per the
standing rule that only Rich edits the spec.

### Spec actions raised by P4a and P4b — 11 of 13 applied, 2026-09-14 and 2026-09-15

**Rich approved six on 2026-09-14**, applied in one commit so they are one `git revert`
away. From P4a: §12's scan gate blocks only on a Critical or High **with a published
fix** (settled 2026-09-08, its wording owed until now); §9 names the **Manifest IdP**
rather than `docker-simple-saml`; §9's registration hardening gains the IdP's hosted
entity and signing keypair as deployment artefacts; §8's `SAML_ENTRY_POINT` row gains
the SimpleSAMLphp 2.x paths; and §21's Postgres row states the IdP metadata database's
two roles, reworded as a requirement because `ssp_ro` now exists. From P4b: §21's
LiteLLM row records the digest pin Task 2 made. One consistency edit went with them:
§1's existing-assets row still said `docker-simple-saml` "becomes the Manifest IdP".

**Two more applied the same day, once Tasks 6 and 7 had run — §7, which Rich settled as three
questions.** An unclassified catalogue entry now refuses only the model that names it, not the
whole catalogue Task 6 refuses; §7 records how the catalogue is read — `/model/info` with the
master key, and no classification on `/v1/models`, the one model route an app may call; and a
declared model with an **omitted** project budget gets the project's AI quota instead of a
refusal, while an explicit `0` is still refused. Both behaviours change committed code, which
P4b's Task 9 now carries.

**The last three applied 2026-09-15, once Task 14 had run — Rich decided them as three questions
and chose the proposal each time.** §10's end-user row now says `ai.budget.per_user_monthly_usd`
is **validated, not enforced, in Phase 1**, with the measured reason beside it — enforcing it needs
a reconciler, so Phase 4 — while the project budget and the namespaced end-user identifier bind
from Phase 1. §10's agent-key row **binds from Phase 3**, when sandboxes exist. And §14's streaming
bullet describes the stream as built — build logs, instance state transitions, incidents, approval
decisions and every other audit `Event` — with **live tailing of an application's own output not
in v1**. Rejected: refusing the budget field, or enforcing it with a poller before P4b's acceptance;
streaming application output, or narrowing the stream to D23.2's list; leaving the agent-key row as
it was, or building a TTL with no caller. None of the three changes committed code or P4b's Task 16.

**Not applied:** P4a's `MONGODB_DB_NAME` note, which is history rather than design; and
**zero-downtime redeploys** — that §11 row, and seven more, were **applied on 2026-09-15** with Rich's approval, before P4c was written rather than after it was executed (his call, the reverse of P4b's pattern), so P4c argues from the spec as it now reads. The eight are listed in P4c's *Spec actions*.

### Spec actions raised by P3 — ✅ all six applied 2026-09-07

Proposed at the end of P3's plan and left unapplied, as the pattern requires; **Rich
approved applying them on 2026-09-07**, before P4a was written. Every one was measured
rather than argued. §21's divergence 8 narrows to platform and builder containers,
because app networks are `--internal` and the developer's machine is **unroutable
rather than policed**; §12 records S6's `isolationLevel` answer for staging and
production apps and states that the **sandbox** question stays open until S5; §12
records that `--storage-opt size=` does not enforce on Docker Desktop; §12's
*"Bounded"* sentence is split into the four mechanisms it actually names; §12's builder
gains the registry token realm's mechanics including the OAuth2 POST form grant; and
§16's security-regression tier now requires a positive control per denial and says an
unpairable control is **reported as unpaired rather than omitted**.

Two consistency edits went with them, because leaving either would have made the spec
disagree with itself: §11's `isolationLevel` sentence and §21's divergence 6 both
still said S6 was yet to run. One commit, `53ecb1d`.

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

- **Executing P1 measured the plan-to-reality gap a second time, and it got wider.**
  P1 was written, then self-reviewed (which found five defects). Executing its 13
  tasks on 2026-09-05 found **18 more**. The proportions matter more than the count:
  **six were checks that passed while the thing under test was broken or absent** —
  an egress *negative control* that reported success because the network did not
  exist and `docker` exited 125; a prompt-retention check that passed with LiteLLM
  not running; an IdP metadata check that passed against a table built to
  SimpleSAMLphp **1.x's** schema while every read threw; an IdP health check that
  asserted a 303 arrived while its destination returned 500; a `port 53` report that
  printed a blank line, which reads as *free*; and a builder egress check whose
  assertion could not pass in either direction. One was a **genuine platform bug no
  reading would find**: tinyproxy exits after every denial unless `DefaultErrorFile`
  is set, and `restart: unless-stopped` hid it entirely — three allowed requests
  caused zero restarts, one denied request caused one. Two were **plan-level
  impossibilities**: `make doctor` asserted 7100–7199 were unbound on a path that
  runs it *after* `make up`, and the `COMPOSE` constant had no `--env-file`, so
  Compose looked for `infra/.env` and every `${VAR}` interpolated to nothing.
  **The lesson is not "write better plans" — it is that a control is worth nothing
  until you have watched it fail.** Every fix was accompanied by removing the thing
  it protects and confirming red.
- **A plan is not verified until it runs.** P2's written self-review found seven
  defects. Executing four of its twenty-one tasks then found five more, none of them
  findable on paper — pnpm 11 making an un-named build script a hard error, ESLint 9's
  gitignore-style globs having no extglob so the boundary rule caught almost nothing,
  typescript-eslint not honouring the `_` prefix the plan's own code used, a negative
  control pointed at a target that could not fail, and an unguarded table index that
  turned drift into a crash in an unrelated test. Five in four tasks. The seventeen
  unexecuted P2 tasks and all of P3–P5 carry the same unmeasured rate. Keep planning
  ahead — but execute a cheap representative slice early rather than banking a large
  unexecuted stack. **Acted on 2026-09-04**: P4 is held until P3 executes, and P3's
  own self-review then found seven more defects including one that would have let its
  acceptance pass against the fake driver. See *Order of operations*.
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
| **P1** | 1a-i | Local substrate ✅ **EXECUTED 2026-09-05** | `make doctor` green offline; one name resolving correctly from host **and** container — **both demonstrated** |
| **P2** | 1a-ii | Control-plane spine ✅ **EXECUTED 2026-09-05** — all 21 tasks | project → spec → release → staging deploy, against the fake driver, **~300 ms**, no Docker — **demonstrated** |
| **P3** | 1a-iii | Docker driver & deploy spine ✅ **EXECUTED 2026-09-07** — all 19 tasks | fixture app healthy at a `manifest.internal` URL, from a bare repo, offline — **demonstrated**, and again from a dropped database and an emptied registry |
| **P4a** | 1b-i | Identity, secrets & the §8 contract — **EXECUTED AND GREEN: all 15 tasks, 2026-09-09.** A real CWL login works end to end — through a row `sso/` renders and `deployRelease` writes — `secrets/` holds every service credential, §20's audit log is append-only against a least-privilege role, §8's injection contract is ONE function with one producer, **`node-ts-mongo@1` — the blueprint faculty use — builds, deploys and issues a real AuthnRequest**, **Manifest logs its OWN users in with CWL: the dev shim is deleted**, and **`make demo-identity` takes §16's proof app from a bare repository to a CWL sign-in in which the instructor cannot see the student's note** — including from a reset machine. **The offline run is outstanding and is Rich's** | ✅ the proof app signing in with CWL and writing a note, via `curl` |
| **P4b** | 1b-ii | AI, events, streaming, incidents — **WRITTEN 2026-09-07; EXECUTED AND GREEN — ALL 16 TASKS, IN TEN SITTINGS, FINISHED 2026-09-15. 140 findings.** 16 tasks in **TEN AGREED SITTINGS of one session each (Rich, 2026-09-09)** — the table is at the top of the plan and is the maintained copy. Sitting 1 produced **10 findings**: the reconciliation pass corrected two migrations that would have failed on their first statement (`manifest_audit_owner` does not exist) and one `ON DELETE CASCADE` that bypassed §20's append-only grant; then LiteLLM was pinned by digest to **`sha256:20b5044b` / 1.98.0, the version S3 measured** — Rich's call, taken because the `main-stable` tag moved to a new build two hours before the task started. Sitting 2 produced **6**, one a correction to Task 7's code; **sitting 3 produced 11**, including a second correction to Task 7 — as written it throws on every redeploy of an AI app — and one to Task 9; **sitting 4 produced 12** — it decided that AI is on unless `MANIFEST_AI_ENABLED=0` and that on means a boot with no LiteLLM master key is refused, and measured that a key minted with an empty `models` list reaches every model; **sitting 5 produced 11** — it gave Tasks 6, 7 and 8 their caller: `deployRelease` mints the app key before the instance starts and commits it only after health (Rich's decision), refuses an AI release with AI switched off, and the gateway joins only an AI app's network — and it measured that **a network removed under a STOPPED container leaves that container unable to start**, which is why app-network teardown now sweeps every platform neighbour; **sitting 6 produced 14** — `node-ts-mongo@1` provides AI, its component proved on the wire against the real toolkit, and **seed's npm warm, inert on any machine whose npm cache already held a package**, fixed, which only `make verify` had seen; **sitting 7 produced 16** — build logs captured line by line, redacted and stored, and redaction's heuristic half, after a pre-flight read wrote 18 corrections; **migration 0005 applied without its grant** and was replayed, and a missing flush one test transaction could not see is now proved on the pool; its Docker tier ended 130 of 131 on a Mongo readiness race that predates it (finding 133); **sitting 8 produced 20** — it settled that race first, so a Mongo service is healthy only once it enforces authentication, with the race forced in the Docker tier; then it built §14's `Incident`, after finding that **the plan's caller position was unreachable on the Docker driver** — a readiness refusal threw with no handle, leaving no record and a row parked in `provisioning` — so a refusal now carries its handle and is recorded as a failed instance, and a failed deploy is a `200`; **sitting 9 produced 18** — `WS /projects/:projectId/events`, authorized in a route hook BEFORE the upgrade, because the plan's code authorized inside the socket handler after it and could not pass its own test; every build, deploy, Incident and AI key rotation reaches the stream through one `publishEvent`, P4a's two SSO events included; the nine event types closed by a database CHECK; and a deploy now opens the app's secret set before it mints anything, where a set that could not be opened had thrown with the instance recorded healthy and a minted key stranded; **sitting 10 produced 22** — §16's proof app answers a question from the asker's own notes, charged to `sha256(puid ‖ project ‖ environment)`, and `make demo-ai` proves it through the event stream, a streamed answer, a 768-dimension embedding and LiteLLM's own spend log, green from a `make reset` machine twice; the measurement behind its first failure found that **the blueprint's `embed()` charged every embedding to nobody** (fixed); and negative control (e) found that **an AI app whose gateway vanishes under a pooled connection waits 611 seconds** — named, and one of P4c's inputs. The external-track trigger fired | ✅ the proof app's LLM answer, from the asker's own notes and charged to them — including from a reset machine |
| **P4c** | *between 1b and 1c* | **Zero-downtime redeploys — REQUIRED and PLACED by Rich, 2026-09-14: straight after P4b, before P5. WRITTEN 2026-09-15 — 11 TASKS IN EIGHT AGREED SITTINGS OF ONE SESSION EACH. EXECUTED AND GREEN — ALL 11 TASKS, FINISHED 2026-09-16, 70 FINDINGS (13, 4, 7, 6, 9, 10, 9 AND 12): [`2026-09-15-p4c-zero-downtime-redeploys.md`](./2026-09-15-p4c-zero-downtime-redeploys.md), whose sitting 1 built the acceptance and watched it fail. **SITTING 8 (TASK 11) IS P4c's ACCEPTANCE: `make demo-redeploy` GREEN THREE TIMES — at once, again immediately, and from a `make reset` machine — every request in every redeploy window answered by the app, zero resets, nobody signed out, and in every redeploy that moves the route a question under way at the move answered by the instance it moved away from.** It watched the nine negative controls, and **FOUR OF THEM COULD NOT FAIL IN THE ACCEPTANCE** — delete-then-insert (a millisecond gap under 200 ms sampling), revoking the old key at promotion, a 1 ms drain (the deploy call itself outlasts the question a move leaves behind), and both serving guards removed (nothing in a run makes a retire find nothing serving) — each was watched red in the tier that can see it, and **one, the early key revoke, in no test at all until the sitting wrote it**. Two more controls changed the acceptance, which ends with 24 assertions: the asker counted a status the edge's wildcard also answers, and the failed release was read once at the end, when control (b) showed a never-ready instance serving for 90 s before the route came back. Two full `pnpm test:docker` runs each failed one route test — once on the connection reset R1 tolerates, which the test did not, and once on an empty 502 from the test's own `nc` stand-in app, which answers before it is asked and was first mistaken for an edge defect; both fixed in the tests, and R1 and the edge are unchanged. `make demo-redeploy` takes three minutes, not thirteen. **SITTING 7 MOVED `node-ts-mongo@1`'s SESSIONS INTO THE APP'S OWN MONGO, AND `make demo-redeploy` IS 21 OF 21 GREEN AND EXITS 0 FOR THE FIRST TIME** — nobody signed out, all 45 questions answered 200, all 560 requests in the three redeploy windows answered by the app. `skeleton/auth/session.js` is `express-session` over `connect-mongo` 6.0.0 on the app's own client and database, with no fallback for `SESSION_SECRET` or `MONGODB_DB_NAME`, and the skeleton and §16's proof app both mount it; the pin was added with the network on, the lockfile grew by seven packages and moved none, `npm audit` was unchanged, Verdaccio was watched warming (152 → 157 tarballs, `make verify` 250 pinned / 0 missing), and §12's scan gate passed. **A FIFTH of the plan's own negative controls could not fail** — Task 10's (d): with the network on, Verdaccio fetched the tarball it lacked in the middle of the build, so `make verify` is the control. And the `make seed` it needed **rebuilt four platform images**: the Manifest IdP came back on SimpleSAMLphp **v2.5.3.1** from `^2.0`, with the version it replaced unrecorded — **left unpinned on purpose, Rich's call on 2026-09-16: keep it current** — and a recreated `manifest-dns-containers` came up on no app network, named, not fixed. **SITTING 6 GAVE ALL OF IT A CALLER, AND THE PLATFORM NOW REDEPLOYS ITSELF WITHOUT INTERRUPTING ANYBODY.** `deployRelease` runs everything that changes what serves inside the environment's advisory lock — the instance row, the mint, the ensure, §6's `Route` record and the marking of every instance it replaced — and then schedules the retirer; an AI key is recorded against ITS OWN instance before the container starts and revoked when that instance is retired, and `commitAppKey` is deleted with its caller; a release that never becomes ready leaves the previous one serving and takes its own container, its files volume and its key with it. `recoverAtBoot` puts the routes back at the control plane's own boot — §12 said it did and nothing did — ends the deploys a restart interrupted and finishes the drains it cut short, before `listen`. **`make demo-redeploy` WAS 19 OF 21 GREEN AFTER SITTING 6**, against sitting 3's 14 and sitting 1's baseline of 10: of the 560 requests made through the edge across three redeploy windows, **every one was answered by the app** — no 5xx, no wildcard page, zero resets — and the two left red were one thing, the app's in-memory sessions: Task 10, which sitting 7 closed. **A FOURTH of the plan's own negative controls could not fail** (Task 8's (a): 58 of 58 passed with `withEnvironmentLock` removed, because two deploys against the fake driver stay in lockstep), and **sitting 5's correction 3 was confirmed by measurement** — the plan's code leaks a failed FIRST deploy's container and its files volume, refused with `INSTANCE_SERVING`. The finding to carry: **`retireEnvironment` opens the app's WHOLE secret set before it retires anything, so a set it cannot open silently stops every reap of that environment.** **SITTING 5 BUILT §6's `Route` RECORD — specified since P2 and never built — AND THE RETIRER, THE CONTROL PLANE'S FIRST BACKGROUND WORK.** An AI key is now stored PER INSTANCE, so a draining container's key stays live and dies exactly when that instance is retired; `withEnvironmentLock` serializes a deploy and a retire of one environment through a Postgres advisory lock on one pooled connection; and `retireEnvironment` reaps every instance of an environment that does not serve (R7) while **doing nothing at all when NOTHING serves** — the line that would otherwise remove the app people are using after an edge restart, and the one with two tests. **THREE of the plan's own negative controls could not fail** — Task 6's (c) could not discriminate the revoke order, Task 6's (d) could not fail at all because `TRUNCATE … CASCADE` already reaches `routes`, and Task 7's (c) came out GREEN because the fake's `ensureInstance` promotes in the same call and never models the window the lock protects. All three were measured and replaced, and the replacements go red naming the consequence — `no instance 'inst-4' to point a hostname at`, the retirer removing the instance a deploy was still starting. **Nothing calls the retirer yet: that is Task 8.** **SITTING 4 MADE THE DRIVER CONTRACT GREEN ON DOCKER — 25 of 25, 0 SKIPPED**, where sitting 3 left the eleven-test continuity block skipped: `retireInstance` drains a real request held open through the real edge and returns only once it has been ANSWERED, cuts it off at its bound, refuses anything a live route dials, removes the container with its `-files` volume, and takes §10's gateway off the network when nothing left on it needs one. **The driver can now reap what a redeploy replaced — but nothing CALLS it yet**, so a redeploy through the control plane still leaves two containers until Task 7 builds the retirer and Task 8 wires it. Two of the plan's OWN negative controls were defective and both were measured: (b) comes out green and cannot fail, and the retire guard as written protects NOTHING for a pre-P4c container — the one R7 exists to reap. **SITTING 3 BUILT THE EDGE AND THE DOCKER `ensureInstance`, AND THE PLAN'S CENTRAL CLAIM IS PROVED AT THE DRIVER**: `redeploy.docker.test.ts` takes a hostname over from one live instance to another under a request every 25 ms with **zero 502s and zero wildcard answers**, where the same test with the route moved before readiness — the pre-P4c order — records **seven empty 502s**. `applyRoute` upserts in place, every route serves `X-Manifest-Instance` from a **deferred** headers handler, readiness is proved from INSIDE THE EDGE against a bounded per-instance alias `mf-i-<instanceId>`, and a move the edge cannot confirm is rolled back. **AND THE ACCEPTANCE MOVED: `make demo-redeploy`, re-run at the end of sitting 3, is 14 of 21 green against sitting 1's baseline of 10 — no 5xx and no wildcard answer in any redeploy window, and of 399 questions asked under load, zero returned a 5xx where the baseline returned three. Every one of the seven still red belongs to Task 7, 8 or 10 — Task 5 has since built the driver half, and Task 7 is its caller.** Its seven findings include two negative controls that first came out WRONG — one red for the wrong reason, one GREEN — and a correction Task 5 must carry: **neither fixture app 404s an unknown path**, so the plan's `healthPath: '/never-ready'` never-ready fixture cannot work and a port nothing is bound to replaces it. **SITTING 1 RAN `make demo-redeploy` THREE TIMES, exit 1 each time, eleven assertions red**, and the baseline it produced is this plan's own: a redeploy is a window of **empty 502s about 1.0-1.9 s long** starting 0.2-0.4 s in, **every user is signed out** within ~2.3 s, and an AI question in flight when a same-release redeploy destroys its container comes back **502** — the brief measured a request surviving a route *move*; destroying the container is not a move. Two of the thirteen findings were defects in the harness that made the measurement meaningless and were fixed before the baseline was taken: **the acceptance rate-limited itself** (both loops share one 600/min per-IP budget, and an unfloored asker spinning on 401s took 43% of the health loop's own requests to 429), and **a fixed 8 s warm-up let a whole run answer zero questions**. Its five measurements settled the design's open constants: Caddy keeps counting an upstream whose route has moved until its in-flight request ends and only then unlists it (so `UNLISTED_UPSTREAM_IS_IDLE = true` and no drain parking is needed), a **deferred** headers handler replaces an app's own `X-Manifest-Instance` where an undeferred one leaves both, **zero wildcard answers in 330 requests across 20 in-place moves**, and **a 72-character container name does not resolve from the edge** — which makes the bounded per-instance alias load-bearing rather than tidy. ITS BRIEF — the baseline measured under load, the route-move mechanisms measured, the redeploy path traced through the code, one option-shape, and the decisions that are Rich's — IS [`2026-09-15-p4c-brief.md`](./2026-09-15-p4c-brief.md): READ IT FIRST.** A redeploy must not interrupt the app: the new instance ready before the edge route moves, an atomic move, a drain, and only then the old instance's AI key revoked and its container retired. **Its inputs, measured or read that day** (P4b findings 72–75): every redeploy 502s the whole app while the new container starts, because `DockerDriver.ensureInstance` moves the route first and `applyRoute` deletes before it re-adds; retiring an old instance through `destroyInstance` removes the live route; and LiteLLM checks a key only when a request starts. **What it must settle when written:** (1) **a baseline first** — MEASURED 2026-09-15 (the brief, §3): about 1–1.6 s of empty 502s per redeploy for an app that boots in a second, and every user signed out by every redeploy; (2) **where the guarantee lives** — in the §11 `Driver` contract, so Phase 5's UBC driver inherits it, rather than in `deployRelease` alone; (3) **two releases sharing one database during the overlap** — what that means for faculty apps is a rule for the blueprint's knowledge pack, and no platform code answers it; (4) **how the edge treats in-flight requests and long streams across a route change** — MEASURED 2026-09-15: a request in flight when the route moves finishes on the old upstream; the event WebSocket is served by the control plane directly and never crosses an app's route — which is the one Caddy measurement it shares with S4; S4 itself stays a Phase 4 spike, because a cutover starts the new instance before it switches and never holds a request through a cold start; (5) **retiring old instances** — which closes RUNBOOK's leaked-container gap as a straight-line step that Phase 4's reconciler later wraps (D10). **Why here:** P4b's Tasks 8–15 are still changing `releases/release.ts`, the driver interface and the contract suite, so this is the first point at which the deploy path it replaces is finished; and before P5, so the generated contract and the console describe redeploys as they will be rather than being retrofitted. Meanwhile P4b's Task 9 commits a new key only after health, so no AI call fails because a deploy revoked its key | the proof app, mid-answer, redeployed under a request loop with no failed request |
| **P5a** | 1c | **The contract** — split from P5 by Rich, 2026-09-16: public representations, route schemas, OpenAPI under a `/v1` prefix, the generated client, error codes, the event schemas and the journey's missing events, the missing reads, the `LaunchReadiness` view, audience, blueprints with starters and the knowledge pack, admin bootstrap and the fleet list. the API on the console's origin through the edge, refused to app and sandbox networks; reserved labels — six groups, UBC's faculties, departments and course subjects among them, 755 labels already in `infra/reserved-labels/` — and the slug check API, `GET /v1/slugs/{slug}`. **WRITTEN 2026-09-16 — [17 TASKS IN TWELVE AGREED SITTINGS](./2026-09-16-p5a-the-contract.md), from [its brief](./2026-09-16-p5-brief.md); its six spec actions applied before execution (`491f8be`). SITTING 1 (Task 1, the measurements) IS DONE, 2026-09-16, WITH 9 FINDINGS — the edge refuses an app network by source with its control watched, a CWL sign-in and a stream work through a new origin behind the edge, and the IdP echoes `RelayState`; five tasks carry a correction ([`spikes/p5a-baseline/`](../spikes/p5a-baseline/README.md)). SITTING 2 (Tasks 2–3) IS DONE, 2026-09-16, WITH 16 FINDINGS — every resource route is under `/v1`, and the API is served at `https://console.manifest.internal` through the edge, refused to every source but the host, with every demo green through it and `make verify` at 50/0; an edge reload turned out to close every proxied WebSocket (`stream_close_delay 1h` on the console), and a replacing save strands the edge's Caddyfile mount (`ensure-caddy-config.sh` re-binds). SITTING 3 — Tasks 4–5, 2026-09-16, 15 findings — IS DONE TOO: a session-bearing mutation or stream upgrade needs the console's `Origin` (`403 CSRF_ORIGIN_REFUSED`), a sign-in completes only in the browser that started it (`401 SAML_LOGIN_NOT_BOUND`), and `api/error-codes.ts` holds all 65 codes a client can receive, held to the source — writing it found Fastify's own refusals of an unreadable body answering `500 INTERNAL`. SITTING 4 — Task 6, 2026-09-16, 7 findings — IS DONE TOO: `defineRoute` declares a `/v1` route once, with `zod/v4` schemas that validate the request and shape the answer, and `packages/contract/openapi.json` is generated from the definitions and held by a drift test that is also its writer (`pnpm contract:write`); `GET /v1/me` is the first converted route. The plan's `ref()` would have emitted `$ref: …/undefined` for a `.describe()` copy of a registered schema (zod's registry inherits a parent's metadata minus its id). SITTING 5 — Task 7, 2026-09-16, 4 findings — IS DONE TOO: `@manifest/contract` is generated from the document by `openapi-typescript` 7.13.0 and called through `openapi-fetch` 0.17.0 (no install script, nothing in the new closure on `pnpm audit`), and `make demo-journey` runs §22 step 1 through it, through the edge, green; `pnpm test` runs a `packages` project and the typecheck gate is `pnpm typecheck`. SITTING 6 — Tasks 8–9, 2026-09-16, 13 findings — IS DONE TOO: projects, environments, members and specs answer public representations, with the environment and member lists that did not exist, and §23's reserved labels are loaded at boot behind `GET /v1/slugs/{slug}`, which answers exactly what creation will; the authorization suite now asserts each refusal's code (a stranger's `404` had passed against a route that did not exist), D9's sensitive diff stopped reporting every re-validation of a manifest with a service, and Fastify's router refusals reach the envelope. SITTING 7 — Tasks 10–11, 2026-09-16, 18 findings — IS DONE TOO: the proof app is `node-ts-mongo@1`'s first starter, the registry reads each skeleton, starter and knowledge pack as bounded UTF-8 text at load and refuses a starter that fails §7 or asks for what its blueprint cannot deliver, and `GET /v1/blueprints` and its knowledge pack answer over `/v1`; `POST /v1/projects` requires §24's audience, seeds the skeleton with the starter over it (the manifest's name spliced byte for byte), creates the rows in one transaction, deletes the project if its repository fails, and publishes `project.created`, `repository.seeded` and `spec.validated`. Closing P4b finding 178 took the demos' recovery with it after every `pnpm test`, so they now clear their own slug's orphaned repository when the slug check says no project holds it. AFTER IT, FOUND BY RICH IN A BROWSER: NO APP HAD EVER SIGNED ANYBODY OUT — the IdP trusted no app as a `ReturnTo`, the app never answered the IdP's `LogoutRequest`, and the strategy had no `logoutUrl` — fixed (`19fb279`, `c306520`), tested in Chrome, held by `make verify` (51) and `make demo-identity`'s new step 9; 8 findings, recorded after sitting 7's. SITTING 8 — Task 12, 2026-09-17, 15 findings — IS DONE TOO: every event type's `machineDetail` is a strict schema `recordEvent` enforces (`EVENT_DETAIL_INVALID`), the same schemas are the contract's `EventFrame` union, the stream is in `openapi.json` with its replay, ready frame and close codes, `@manifest/contract` has `subscribe`, and `make demo-journey` watches provisioning on the replay through the edge; the generated `EventFrame` narrows on `type` with no cast. The Docker tier's refusal of two fixtures that passed a git tag as a commit was the schema doing its job. SITTING 9 — Task 13, 2026-09-17, 18 findings — IS DONE TOO: `POST /v1/projects/{projectId}/builds` answers **202** with the build `running` and a `BuildRunner` built at boot finishes it on the stream (Rich's R6), a build a restart interrupted is failed at boot with `BUILD_INTERRUPTED` and published, the four build routes are definitions behind public representations (`GET /v1/projects/{projectId}/builds` is new), and **every driver's build returns §12's scan summary, stored on `builds.scan`** (migration 0011) — the scanner, its database's age and staleness, whether the base image was identified, and Critical and High counts for fixable, unfixable and base-image findings. Writing it found that the plan's `ImageRef.scan` would have put a scan on every deploy, that six-severity counts would have recorded zeros nothing counted, and that an unreadable database age is `Infinity` — which JSON cannot carry, so every such build would have answered 500. `make demo-journey` builds `journey-app` through the edge. SITTING 10 — Task 14, 2026-09-17, 10 findings — IS DONE TOO: releases, deploys and Incidents answer public representations and `api/routes/delivery.ts` is deleted, so **every `/v1` route is now a `defineRoute` definition**; a `Release` shows its build's digest and scan and, per environment, the frozen numbers and its env var **names** without their values (Decision 22), with two new reads; a deploy answers an `Instance` with no driver and no handle; and §22 step 5 became true — `deployRelease` publishes `instance.provisioning` and `instance.starting` and **stores** `starting` (migration 0012). `make demo-journey` is green through **step 6**: signed in with CWL inside the deployed app, a note written, a question answered from it. Writing it found that the OpenAPI document has said since sitting 4 that the error envelope cannot carry `launchReadiness` — while the production refusal has sent it since P2 — because nothing parses an error body through `ErrorEnvelope`. SITTING 11 — Tasks 15–16, 2026-09-17, 13 findings — IS DONE TOO: §13's first-launch checklist is **computed** by a new `launch/` module from what a project has and stored nowhere, answered by `GET /v1/projects/{projectId}/launch-readiness` and carried by the production `409` — the constant that stamped four items `deliveredBy: 'P4'` for things P4 never delivered is gone, and `scans` is computed from the release serving staging; and **the first administrator is made out of band** by `scripts/admin-grant.sh`, one transaction as the database owner appending to the append-only `audit.role_changes` (migration 0013), with a third IdP test user `operator` and §26's fleet at `GET /v1/fleet`, administrators only. Executing it found that the refusal and the read carried the same checklist as DIFFERENT BYTES — zod emits keys in schema order and a hand-built error body does not, which only `make demo-journey` could see — and that two of the plan's four controls could not fail as written. `make demo-journey` is green through **step 8**. SITTING 12 — Task 17, the acceptance, 2026-09-17, 8 findings — IS DONE, AND **P5a IS EXECUTED**: §22's journey ran green three times through the edge by nothing but the generated client — at once, on the re-use path, and **from a `make reset` machine** — `make demo-journey` is step 8 of `scripts/offline-acceptance.sh`, and thirteen of the fourteen negative controls were watched red or recorded green with the tier that does see them. **Three controls could not fail as written**: the builds route cannot leave `/v1` at all (`tsc` refuses it), a loosened `Instance` answers `500` before stripping is reached, and — the one that mattered — a `BuildRunner.start` that awaits the build still answers `running`, so the journey's R6 check passed a synchronous build; it now asserts the latency too, and goes red at 16 924 ms. The fourteenth, removing the edge's `@outside` refusal, was refused by the session's permission classifier — and was **closed on 2026-09-17 without weakening the edge at all**: `make verify`'s gateway check reads the Caddyfile on disk, so it was watched going red with no reload, and `routing/edge-source-refusal.docker.test.ts` now re-proves the causal link against a throwaway Caddy on every `pnpm test:docker`. **P5b IS NOW WRITTEN (2026-09-17)** — 13 tasks in nine sittings — and executing its sitting 1 is the next job.** Rich decided four things while it was written: builds answer `202` and finish on the stream; `openapi-typescript` + `openapi-fetch`; twelve sittings; the spec actions applied now | every §22 step driven by a script using only the generated client |
| **P5b** | 1c | **Delegated tokens and pending actions** (D24) — **EXECUTED AND GREEN — ALL 13 TASKS, IN NINE SITTINGS, FINISHED 2026-09-18. 116 findings.** Written 2026-09-17, [13 tasks in nine sittings](./2026-09-17-p5b-delegated-tokens.md), from [the P5 brief](./2026-09-16-p5-brief.md) and P5a's *What this plan does not build*. SITTING 1 (Task 1, the measurements — alone and first) IS DONE, 2026-09-17, WITH 11 FINDINGS** ([`spikes/p5b-baseline/`](../spikes/p5b-baseline/README.md)) — **and it moved the plan in five places.** `assertCapability` is NOT as central as the plan assumed: **`GET /v1/projects` escapes a token's scope entirely** (`listProjectsFor` selects by `actor.userId` alone and no capability check runs), so three route modules must change, not one. **Task 6 as drafted would have deadlocked D24's whole loop** — a refusal caught inside `app.idempotent` is cached by `replayOrStore`, and the confirmed retry, reusing its `Idempotency-Key` as D23.6 instructs, replays the cached 403 for ever while every test using a fresh key stays green; only catch PLACEMENT fixes it, not scoping the record. `secret:read` turned out not to be in the `Capability` union at all, so the privileged set cannot be four `Capability` values. **`Authorization` survives the edge on a plain request AND a WebSocket upgrade** (measured, with a negative control), so the stream stays in scope; the deploy route already branches on `kind`, so `release:promote` hangs off it. One existing defect was found and fixed in its own commit (`8d11025`): **`db/client.ts`'s error hint told the reader to connect as the SUPERUSER**, silently disabling §20's append-only audit grant for anyone who followed it. **Corrections at the top of Tasks 2, 5, 6, 7 and 11; no sitting boundary moved.** **Its four spec actions were approved by Rich and APPLIED on 2026-09-17**: §6's two rows gain the fields that make them usable, §20 records the stateless-session divergence **with its cost** and step-up's deferral, and D24's "create projects" is reconciled in **both** places it appeared — D24's own rationale column and §20's credential table — in favour of the scope rule; `manifest-decisions.html` carried the same claim in plain language and was corrected with them. **Sitting 2 is unblocked.** A second credential class: `Actor` becomes a discriminated union on `credential`, `assertCapability` refuses D24's privileged four to a token centrally, and the one route wrapper holding the request records a `PendingAction` a human confirms — which grants a ONE-SHOT retry rather than replaying the request server-side. Rich decided two things on 2026-09-17: the privileged set is named once now with §20's alignment test while **step-up re-authentication is deferred** (R1), and **Phase 1 sessions stay stateless with the spec amended to say so** (R2). **SITTING 2 (Tasks 2–3) IS DONE TOO, 2026-09-17, WITH 14 FINDINGS** (`d9de37d`, `5bccc29`, `766ac95`): D24's forbidden four are named once as `PRIVILEGED` with the alignment test §20 asks for — typed as a **superset** of `Capability`, because `secret:read` is not one and must not become one — **`release:promote` is now a capability of its own**, held by an owner and a platform admin and not a collaborator, asserted by the deploy route when the environment is production and **before** §13's launch gate, so a collaborator is refused without the project's readiness ever being consulted; and **migration 0014** adds `delegated_tokens` and `pending_actions` with the `tokens/` module that mints, hashes, parses and verifies a token. **Its headline finding is that the plan's own token parser would have refused 47.5% of the tokens the same file minted**: it split the plaintext on `_`, and base64url's alphabet contains `_`, so 949 of 2000 plaintexts were unparseable — behind a round-trip test that minted ONE token and would therefore have gone red about half the time, reading as a flaky harness rather than a credential that authenticates on a coin flip. Fixed with an anchored parse and re-measured at 5000 mints, 0 failures. **It also found that the plan's own TRUNCATE negative control cannot fail** — the statement's CASCADE reaches both new tables with neither named, and the reverse order succeeds too, so the entries are belt and braces and the comment now says so; `createToken` had to require the row id, because the plaintext names its own row; and every snippet in the plan names IdP puids (`ins000001`, `stu000001`) that are not the four `TestUserPuid` fixtures. Corrections at the top of Tasks 3, 4 and 5. **SITTING 3 (Tasks 4–5) IS DONE TOO, 2026-09-17, WITH 15 FINDINGS** (`e407ae3`, `eab5466`, `d992534`, migration **0015**): a person mints, lists and revokes a delegated token in an interactive session, and **an agent holding one can now authenticate with it** — `Actor` is a discriminated union on `credential`, the one `onRequest` hook turns either class into one, and a route D24 reserves to a person calls `requireSession` and answers a token `403 TOKEN_CREDENTIAL_REFUSED`. A token reads exactly the project it is scoped to, gets the STRANGER's `404` for any other, is refused a capability it was not minted with, and is refused the fleet, project creation and minting another token. The mint response is the only place in the API that returns a credential, and `Token` has no `secret` field at all rather than an optional one. **Its headline finding is that the contract layer could not carry a bodyless mutation**: `DELETE /v1/tokens/{tokenId}` is the API's first, and both the route wrapper and the document generator keyed the request body on `method === 'GET'`, so the route answered `400 REQUEST_INVALID` before its handler ever ran and the OpenAPI document could not be generated for it at all — both now ask the SCHEMA (`route.body !== NO_BODY`) rather than the method. **And running its own negative controls found three that answer `403` for the WRONG REASON** — CSRF applied to a token, the fleet reverted to `requireActor`, and a token allowed to mint a token all produce a `403` a status-only assertion accepts — so every refusal now asserts its CODE, which is P5a sitting 6's lesson reproduced live. It also measured that **five of Task 5's twelve tests pass before a line of it is written** (nothing reads the header, so every request is 401), that **`[M7]`'s CSRF worry needed zero lines** because `carriesSession` already expressed it, and that `tsc` named three route modules on the union change but **not** `POST /v1/projects`, which reads no session field — so Decision 13's refusal had to be added deliberately. `touchToken` was DECIDED rather than inherited: it stamps only when the stored value is older than a minute, because per-request stamping is the write-per-request cost Decision 9 rejected. `make demo-journey` was run at the end and is green, all eight steps. **SITTING 4 (Task 6, alone) IS DONE TOO, 2026-09-18, WITH 10 FINDINGS** (`11c47b9`, `f9f56f6`, migration **0016**): **D24's central refusal exists** — `assertCapability` refuses a delegated token any of `PRIVILEGED`, checking SCOPE, then the privileged rule, then the token's own set, in that order and for stated reasons; and the ONE route wrapper holding the request records a `PendingAction`, which the 403 carries as a `$ref`'d representation in the error envelope so an agent can find what it must wait for (D23.7). **The catch is OUTSIDE `app.idempotent`**, which is what sitting 1's `[M5]` correction bought, and the test that reads the idempotency table is the ONLY one of eleven that can see the difference. **Its headline finding is that the plan's own second negative control — the ordering — cannot fail against any test that existed, including the ten this task wrote.** With the privileged rule moved after the token's capability set, all 31 tests in `delegation.test.ts`, `credential.test.ts` and `tokens.test.ts` stay green, because every one of them writes a token holding the privileged capability straight to the store — correctly, since D24 says *however it was minted* — and so none exercises the branch a REAL token takes. Task 4's mint route refuses a privileged capability, so **no token the platform can mint can hold one**; measured with a throwaway probe, the swap answers `403 FORBIDDEN` instead of `403 TOKEN_ACTION_PENDING` — not a weakened refusal but a DEAD END, in which no pending action is ever written and D24's loop cannot start for any real token. A twelfth test now asserts exactly that case, and both answers being `403` is sitting 3's F13 for the fourth time. It also found that **the plan's Step 2 prediction was wrong and hid a control that could not fail** — the first case answers `400 MEMBER_USER_NOT_FOUND`, not `201`, because `bio_student` has never signed in, so *the member was NOT added* held for a reason unrelated to D24 until the test signs that person in; that **`PendingActionList`, written here, publishes a schema no route answers** and belongs to Task 8; and that the envelope-schema control is caught by **`tsc`, not by any test**. **§7e's diagnostic is satisfied**: breaking `isPrivileged` now turns **11 tests red across 4 files**, from 2 of 1088 at the end of sitting 3. Nine negative controls were watched, each restored. `pnpm test:docker` **177, unchanged for the fifth run**, and `make demo-journey` green again because Task 6 changes the wrapper every `/v1` route runs through. **SITTING 5 (Task 7, alone) IS DONE TOO, 2026-09-18, WITH 12 FINDINGS** (`7465590`, `9ac051b`, migration **0017**): **D24's loop closes.** `POST /v1/pending-actions/{id}/confirm` and `.../reject` are interactive-only, the person answering must hold the capability THEMSELVES, and a confirmation grants that EXACT request — this token, this method, this path, this body — one retry, which the agent makes itself through its normal route. The route wrapper matches the retry's fingerprint to the confirmed row and hands `assertCapability` a `grant` nothing else can manufacture; `consumed_at` is stamped AFTER the handler resolves, so a transient failure does not burn a person's decision; and a retry after a rejection is answered `403 TOKEN_ACTION_REJECTED` carrying the person's own words, so an agent stops rather than loops. **Its headline finding is that TWO of its own nine new tests were green before the route they test existed** — their confirm call answered `404 ROUTE_NOT_FOUND`, so the request that followed was refused for the ordinary reason and the assertion under it proved nothing; a precondition that is not asserted is not a precondition, and that is the fourth consecutive sitting in which a control could not fail as written. **It also found that the plan's own Step 3 snippet leaves the grant unable to grant anything** — it falls through to the token's own capability set, which no real token holds, so D24's loop would have closed for fixtures and for nothing else; that **`recordPendingAction`'s reuse lookup is a read-then-insert — five CONCURRENT identical asks create five rows**, measured, which defeats the very thing it exists for and is carried to Task 10 as a correction because the fix collides with that task's expiry sweeper; that **the plan's control for *cannot be confirmed twice* cannot fail**, because the real guard is the state clause inside the UPDATE rather than the route's read; that **`EmptyRequest` has been published in the contract with no caller since P5a**; and that **the RUNBOOK's token section had been stale for two sittings**, still saying a token cannot authenticate. Thirteen negative controls were run, ELEVEN red and the two that could not fail both findings. `pnpm test:docker` **177, unchanged for the sixth run**, and `make demo-journey` green again. **SITTING 6 — Tasks 8 and 9, 2026-09-18, 12 findings — IS DONE TOO**: §26's queue exists as two reads (`GET /v1/projects/{id}/pending-actions` and `GET /v1/pending-actions/{id}`), where a person who may read the project sees every question and a TOKEN sees only the ones it asked; **D24's fourth privileged action — removing a member — is reachable for the first time**, and it is the first privileged route written AFTER Task 6, so the test that it inherits the central refusal without doing anything is the task's real deliverable, and it passes; and **§20's per-token rate limit has a reader at last**, taken in the one credential hook after the token is verified, so a forged token spends nobody's window and no route can forget the check. **It found that the plan's `204` is not expressible** — `SuccessStatus` is `200 | 201 | 202`, so a bodyless RESPONSE would need new machinery, and the removal answers `200` with the members as they now are; that **a strict `404` for a non-member makes the authorization matrix inexpressible**, so the removal is idempotent, which is right on its own terms because the caller can already read the membership; that **`api/rate-limit.ts` DID need a change the plan predicted it would not**, because each token's limit is its own; that **`rate_limit` had no unit stated anywhere** (settled: requests a minute, now in the published contract); and — **found by reading this ledger rather than the sweep checklist — that the defect-rate table below had NO P5b rows at all, five sittings running**, while ORIENTATION §2 claimed it had every plan and sitting. **TWO of the sitting's own four rate-limit tests were green before the limiter existed**, both being *"is not limited"* claims that are true of a platform limiting nothing — the fifth consecutive sitting in which a control could not fail as written. Seven negative controls for Task 8, all seven red on the named assertion. **SITTING 7 — Tasks 10 and 11, 2026-09-18, 15 findings — IS DONE TOO** (`9d05fd9`, `dfdfe94`, migration **0018**): §6's fourth `PendingAction` state is applied by a sweeper `src/index.ts` calls at boot, with the count on the boot line — and `boot.docker.test.ts` is the ONLY test in the repository that fails if that caller goes, which is the point of a task whose whole risk was shipping a sweeper nothing runs. **Sitting 5's F10 is discharged**: a partial unique index over the token and the fingerprint `WHERE state = 'pending'` makes the database refuse the second open ask, `onConflictDoNothing` hands the loser of a race the winner's row, and only the caller that wrote the row publishes the event. **But a boot-only sweep does not make that index safe** — a row past its own `expiresAt` that still says `pending` satisfies the predicate while the reuse lookup deliberately will not reuse it, so it would block the same question for ever; measured by adding the index alone and watching a test written two sittings earlier go red. The sweep therefore also runs scoped to the token immediately before the insert, which is why `expirePendingActions` takes a scope the plan does not mention. §16's authorization matrix now has D24's second dimension — four token actors beside the five session ones, **361 tests in 3.5 s** against `[M6]`'s projection of ~310 and ~6 s, so the file is not split — and `Expectation` had to become a (status, code) pair first, exactly as the hand-off predicted: with the privileged rows asserting a bare `403`, **nine cases pass while D24's loop cannot start**, which is sitting 4's F1 arriving in the suite itself. Completeness for the actor dimension is now **`tsc`** (`error TS2739`), stronger than the runtime check the plan asked for. It also added the **production** deploy row: the suite had only ever deployed to staging, so **the one route that authorizes `release:promote` had no case in it at all**, and a collaborator's right to deploy but not promote was asserted nowhere. **Its headline finding is that `.map(toToken)` passes the array index as a second argument** — giving `toToken` a `now: Date = new Date()` parameter, the shape `toPendingAction` already has, made `now` arrive as `0` and every token in every list read `expired: false`, including one that expired an hour before; only the expired-token assertion could see it. **And the plan's own `Promise.all` control could not fail on a cold pool**: `pg.Pool` establishes a connection per acquire, so the five asks serialise and the test passed with no index and no conflict handling — the sixth consecutive sitting in which a control could not fail as written. 160 token cases passed on the FIRST run, so the bearer header was withheld: **140 go red**, and the 20 survivors are exactly the rows claiming the credential makes no difference. Nine negative controls, all watched and restored. `pnpm test:docker` **178**, up one and predicted before the run, and run TWICE. **Its thirteenth finding came from the post-sweep check**: sitting 6 had left ORIENTATION §2 and §7e stating one fact with two values — how many consecutive sittings the LiteLLM list's "held" entry has gone stale for — and the same shape sat on the `docker rmi` refusal. Both are now stated in §2 alone, structurally, which is what §9's *a document that restates a number drifts from it* prescribes. **Two more came out of being asked whether a cold agent could work from ORIENTATION alone** (F14, F15): the same restated-number defect sat on a THIRD count — how many sittings the post-sweep check has found a defect in, which §6 gave as "four" and §7e as "six" against a record of seven — so a structural fix to one instance is not a fix to the class; and **§7e's ordered run list omitted rebuilding and restarting the control plane**, which is the one step a demo-through-the-edge sitting rests on, while the fact sat in a *What will surprise you* bullet where no reader acts on it. **SITTING 8 — Task 12, 2026-09-18, 16 findings — IS DONE TOO** (`5955dd6`, `03dedc8`, no migration): **`make demo-token` runs D24's whole loop end to end through the edge**, on its own project `token-app`. An instructor signs in with CWL and mints a delegated token; an agent holding nothing but that token builds the project, releases it, deploys it to staging and is answered by the running app — while being refused the fleet, its own project creation, and a promotion to production. It then asks to add a member, is handed the question, the instructor confirms it in their own session, and the agent's own retry succeeds ONCE; a fresh ask is REJECTED in the instructor's own words and the token is revoked. **This is the first client any route in this plan has had outside `app.inject`, and both of its worst findings were in the CLIENT** — invisible to everything server-side, which is P5a sitting 10 finding 8's gap behaving exactly as §9 says it does. **Its headline finding is that `subscribe` could not carry a delegated token at all**: Task 5 gave `createManifestClient` a `token` and nothing gave the stream one, because until now no client of `@manifest/contract` held a token — so an agent could start a build through the generated client and had nothing to watch it end on, while the route had accepted a bearer all along and sitting 1's `[M3]` had already measured it surviving the edge. **And the journey's import boundary test matches English prose**: `\bfrom\s+['"]…['"]` hit *indistinguishable from "the token was minted without …"* inside a doc comment and turned `pnpm test` red on a file with no forbidden import — §4's *a `process.env` scan counts COMMENTS* in another guise, fixed with the same scanner and given two assertions that stop it passing vacuously. **THREE of its five negative controls answer `403` for the WRONG REASON** — the privileged rule disabled makes step 6 a DEAD-END `403 FORBIDDEN` (sitting 4's F1 reproduced in the acceptance), confirm reverted to `requireActor` answers `403 TOKEN_ACTION_PENDING`, and the fleet reverted answers `403 FORBIDDEN` — so a status-only demo would have passed all three. **And its own no-bearer control reported ONE red check**, because step 3's first read went through `unwrap`, which throws and ends the run before the claims underneath it are made; step 3 now reports instead, and the same control reads SIX. The demo's first assertion about the credential was also wrong — `mft_<id>_<secret>` embeds the row id with its dashes STRIPPED — which only asserting the shape could have found. It also predicts, in advance, that **Task 13's control (a) is invisible to the acceptance** for the same reason (c), (d) and (e) are: the demo mints through the route, which refuses a privileged capability by name. Six controls watched and restored; `make demo-journey` green, all eight steps. **SITTING 9 — Task 13, the acceptance, alone and last — IS DONE, 2026-09-18, WITH 11 FINDINGS, AND P5b IS EXECUTED.** `make demo-token` is step 9 of `scripts/offline-acceptance.sh` and ran green **three times** — from a truncated database, on the re-use path, and from an `echo reset | make reset` machine — with **twelve negative controls watched and restored**, the working tree proved clean between each. **Sitting 8's prediction that Task 13's control (a) would be invisible is WRONG, and in the direction that matters**: a token that does NOT hold the privileged capability is refused by a different rule with a different code, so moving D24's rule after the token's own set turns three checks red in steps 5 and 6 — and every real token is that token, which is the case sitting 4 added its twelfth test for. **Control (b) is invisible to all 1342 tests AND to the acceptance**, so the token secret's constant-time comparison — asserted by nothing — is now asserted at the source, watched failing three ways, and its first draft could not fail because a `not.toMatch` named the operands in the wrong order. **After `make reset` the host could not reach the edge while a container could** (11 of `make verify`'s 51 red, all `Recv failure`); `docker restart manifest-caddy` cleared it, and it did not reproduce under two cheaper triggers — remedy in the RUNBOOK. **One `pnpm test:docker` run recreates exactly the seven dead app networks and the volume cleared by hand the same day**, so the hand-over is now `scripts/dead-app-resources.sh`, which re-derives. **Next: P5c — the clients — WRITTEN 2026-09-18 and EXECUTING; **the P5c row below is the maintained record of how far, and this finished plan's row deliberately no longer says** — it read *"the next job is its sitting 2"* for three sittings after that stopped being true.** | a token runs the build loop and is refused the privileged four, each refusal a `PendingAction` a human confirms |
| **P5c** | 1c | **The clients** — `manifest-mock`, `console/` with its import boundary, the CI acceptance script. **WRITTEN 2026-09-18 — 14 TASKS IN NINE AGREED SITTINGS of one session each ([`2026-09-18-p5c-the-clients.md`](./2026-09-18-p5c-the-clients.md)). EXECUTED AND GREEN — ALL 14 TASKS, IN NINE SITTINGS, FINISHED 2026-09-19, 106 findings. PHASE 1c IS COMPLETE.** The per-sitting counts are in THE DEFECT-RATE TABLE BELOW AND IN THE PLAN'S OWN SITTINGS TABLE — not here, because this row said "sittings 1, 2 and 3 are done" for the whole of sitting 4 while describing sitting 4 further down the same row. Sitting 1 (Task 1, the measurements — alone and first) ran on 2026-09-18 with 19 findings** ([`spikes/p5c-baseline/`](../spikes/p5c-baseline/README.md)), **sitting 2 (Tasks 2–3, the one sitting with the network on) on 2026-09-18 with 10 findings, and sitting 3 (Task 4) on 2026-09-18 with 9 findings. Sitting 4 (Tasks 5–6 — my projects, creating one, and the project screen with its live stream) IS DONE, as are sitting 5 (Tasks 7–8, the two streaming screens) and **sitting 6 (Tasks 9–10, request production, the fleet and delegated tokens) and sitting 7 (Task 11, §26's queue) — ALL NINE ARE DONE, with 19, 10, 9, 9, 13, 12, 8, 11 and 15 findings.** See below.** **SITTING 3 SERVED THE CONSOLE AND §22 STEP 1 IS CLICKED**: `https://console.manifest.internal` is the reference console, not a placeholder, and Rich signed in with CWL in a browser and saw **Test Instructor `ins000001`** with the role and email `GET /v1/me` returned. Its sharpest finding is about the plan's own honesty: **Task 4's control table said no test sees the Caddyfile's console line — "the honest statement of this task's coverage" — and TWO OF THE FOUR PLATFORM GATES SEE IT.** `make doctor` read `CLAIMED BY SOMETHING ELSE: 7104` the moment a console ran on §21's own port, and `make verify`'s console check asserted the placeholder's literal words; both went red on their first run after the change. **The first is the identical defect this project fixed for port 7100 on 2026-09-07** — `doctor.sh` still carries the comment saying so — **and the same remedy applies: identify the process by ASKING IT, never by matching a name.** The verify check kept its question (did the HOST reach the console SITE, rather than the wildcard or `@outside`?) while losing its string, and now passes whether or not a developer's `vite dev` is running, because `make verify` is a platform check. Sitting 3 also found that **`signOut` never checked its answer** — it awaited `POST /auth/logout` and left for `/` whatever came back, so a refused sign-out reloaded the page and left the person signed in with nothing saying so — and that **`response.ok` would not have been enough**, because the console's own Vite server answers `GET /v1/me` with `index.html` and **200** when the console is wrongly reached at `127.0.0.1:7104`. It keys on `204`, and six Node tests with no DOM watch both directions.** **All ten of sitting 1's measurements ran, all nine `(T1: M<n>)` markers held, and NO task boundary moved, so the nine-sitting split stands.** **Sitting 2 made `packages/console` (React 19.3.0 + Vite 8.3.0) and `packages/mock` exist and put all four gates on them, and wrote the console's import boundary before a single screen** — two enforced rules, each read twice and each watched failing, including the half a lint rule cannot see: a screen that calls `fetch('/v1/projects')` imports nothing, and `pnpm lint` stayed green through exactly that while the test named the file. **It found that Task 2's own steps are in the wrong order** — `pnpm --filter @manifest/console add` answers *"No projects matched the filters"* because Step 2 installs into packages Step 3 creates — **and that Task 3 cannot go green as written**, because `main.tsx` is the only console file with an import and the boundary's *"read more than one file"* control therefore fails until `auth.ts` has a caller. **Nothing after this sitting may install a package.** **The headline is that §8's `stream_close_delay` question — open since 2026-09-16, across four plans — IS ANSWERED AND CLOSED: an app's WebSocket IS cut by an unrelated config reload** (`CLOSED 1001` 2 ms after an unrelated route was inserted; `SURVIVED 17971 ms` with the field), **so `routing/caddy.ts`'s `buildRoute` now sets `stream_close_delay: 3_600_000_000_000`** and a test asserts the value, not merely its presence. **And the plan's OWN snippet for that measurement would have answered Rich backwards**: it drives the Caddy admin API with node's `fetch`, which undici gives `Origin: ''` and Caddy refuses `403`, and it checks neither `r.ok` nor `r.status` — so it would have printed *"unrelated route inserted"*, then *"SURVIVED"*, and closed §8 as *not a problem* on a reload that never happened. Four more corrections landed on Tasks 2, 4, 13 and 14: `ajv-formats` must be installed in Task 2 or never (185 format assertions, and Ajv v8 implements none); the contract's `exports` map points `tsc` at `src/` and Vite at `dist/`, so a stale `dist/` ships silently; `streamProjectEvents` IS one of the document's 34 paths rather than a 35th operation beside them, which is Task 13's coverage-gate arithmetic; and `manifest_login` expires in **ten minutes**, which is a trap for Task 14's shared run where a human types the password. Written from [the P5 brief's §10, *What P5c INHERITS*](./2026-09-16-p5-brief.md), whose subsection *The one thing to get right first* says that §17's Phase 1c row is NOT P5c's scope — P5a and P5b already shipped four fifths of what that row lists, and P5c's share is the three deliverables above. **Rich decided three things on 2026-09-18 (its R1–R3):** nine sittings, the LEANER of three splits offered (eleven was recommended, and the cost was stated — sitting 5 carries both streaming screens); **§8's `stream_close_delay` question is answered by a MEASUREMENT in Task 1** rather than by reasoning, because the console's own stream is already safe behind the console site's `1h` and what the absence breaks is an app holding its own socket; and the **clicked half of the acceptance is SHARED and recorded** — the agent drives Chrome and reads every page, Rich types every password, because the Chrome extension will not (ORIENTATION §4). Its own fifteen decisions include: the console reaches the API through `@manifest/contract` and nothing else **except the two unversioned sign-in endpoints, which live in one file a test polices** (a lint rule cannot see a `fetch`); **every API call is a function in one file**, which is what makes D22's coverage gate, the import boundary and a DOM-free Node test of the console's calls all readable from one place; **no timer for the pending-action sweeper** — the decision P5b left to this plan — because the queue screen renders a lapsed question from `expiresAt` and needs no swept state; **no DOM test tier** and **no CI workflow file**, both named with what they cost. **Its self-review caught eleven**, among them a console that named CSS classes no file defined, a control listed in Task 4 that cannot fail until Task 6, and a coverage gate that can be disarmed by its own exemption list **SITTING 4 — Tasks 5 and 6, 2026-09-18, 9 findings — IS DONE TOO** (`f56409b`, `10c9c30`, no migration, no route): **§22 STEPS 2 AND 3 ARE CLICKED.** A signed-in person creates a project by typing a name checked while it is typed, choosing `node-ts-mongo@1` and the `proof-app` starter and answering §24's audience question, and lands on a project screen whose Activity panel holds a LIVE socket carrying the three events every project already has. **The liveness was proved rather than assumed** — `status: 'live'` only says a `control` frame arrived — by publishing a `token.minted` from a terminal and watching it appear in the open tab at `0s ago`, while the same event on ANOTHER project did not appear. **Its headline finding is a wrong render no gate can see**: `SlugCheck.reasons` is an array of OBJECTS, so the plan's `(check.reasons ?? []).join('; ')` puts `[object Object]` on the screen, and it typechecks, lints, formats and builds because `Array.prototype.join` accepts any array — measured against the real API before the screen was written. **Two halves of one rule disagreed**: the ESLint boundary regex allowed `./` and not `../`, so the console's first subdirectory made every screen a lint error while the boundary TEST, which resolves the target and checks containment, stayed green; widened, and the widening watched not to weaken anything (an escaping `../../../control-plane/…` import leaves `pnpm lint` exit 0 and turns the test red). **And nothing asserted that the boundary scanner DESCENDS** — with the recursion removed all three tests stayed green while every file under `src/screens/` went unread, which is sitting 2's F7 one level up; a fourth assertion now says so. **Two of the plan's own controls could not fail.** The idempotency-key row names the wrong consequence: `slug` is UNIQUE, so a double-click cannot create two projects however the key is made — measured, one project with a fresh key per submit — and what the key actually prevents is a **spurious `409 SLUG_TAKEN` shown to the person who just succeeded** (same key twice → `201` twice with the same id; different keys → `201` then `409`). And **Task 6's `stream_close_delay` row DID NOT FIRE**, measured two ways with the running config verified to hold zero occurrences of the field and `srv0` confirmed to be the only server: the console's stream stayed `live` through a full Caddyfile reload AND through the admin-API route change a deploy makes, and was proved still alive afterwards. That is in tension with P5a sitting 2 and this plan's own M8, **the difference is not isolated and was deliberately not guessed at**, and nothing in it argues for removing the field — but Task 4's row 1 has now gone unwatched for a second task running. It also found that **`POST /v1/projects/{id}/spec` publishes no event** where creation publishes `spec.validated`, so a re-validation is invisible to a console that never polls (D23.2) — a finding about the API, recorded and not fixed, because this plan changes no route; that a Caddyfile COMMENT is not a config change, so `make up` printed *Caddyfile changed — reloading the edge* while the edge logged *config is unchanged*; and that **the gates destroy the clicked state**, since the controls run after the commit and so after `pnpm test` truncates — which paid for itself, handing the plan's control row 2 honestly as `closed 1006`. **SITTING 5 — Tasks 7 and 8, the two streaming screens, the heavy one Rich was warned about — IS DONE, 2026-09-18/19, 13 findings** (`4b464d1`, `abe9e72`; no migration, no route, no spec change): **§22 STEPS 4 AND 5 ARE CLICKED, AND STEP 6 AS FAR AS THE SIGN-IN** — step 6 also says *write a note; ask the LLM*, which was not exercised and is `make demo-ai`'s ground and Task 14's. A person clicks *Build* and watches BuildKit's output arrive line by line, the build ends `succeeded` with no reload, they release it, deploy it to staging watching four states arrive live, open the app's URL and sign in to the running application with CWL. A redeploy answered 14 consecutive `200`s as the same person from the app's own tab — P4c's property, watched from a browser for the first time. **Its headline finding is that the stream alone is not the log**: `LogFrame` is never replayed, which the document says and `recentFramesFor` proves by selecting from `events`, so a screen opened after a build shows nothing unless it also reads `getBuildLog` — measured, 74 lines on screen against 0 log frames in the replay — and the plan's Task 7 never mentions that read. **Three of the plan's own claims were wrong and are corrected in place**: `<Refusal>` never rendered the envelope's `launchReadiness` although Task 4's own doc comment said it did and Task 8 relied on that sentence (6 items in the envelope, 0 on screen); an empty `StartBuildRequest` does NOT build the repository's HEAD but the last VALIDATED manifest's commit (`body.commitSha ?? spec.commitSha`); and **Task 7's control row 3 cannot fail**, two ways over — the replay/live overlap it describes cannot occur, and with the sort removed the screen was still in perfect order because nothing passes `tail`. **`createRelease` publishes no event**, the second instance of sitting 4's shape, so the Deploy panel is told by the Builds panel rather than by the platform. **The sharpest defect was the screen's own**: what is SERVING and what the last ATTEMPT did are two different facts, and the first draft got both wrong — a failed deploy is a `200` whose state is `failed` while the previous instance keeps serving, measured with the stream ending `instance.failed` while the environment answered `healthy` on the release before it. **Also measured: changing `runtime.port` cannot make a deploy fail**, because §8 injects the same port into the app, so the app listens exactly where the probe dials; the lever is the health PATH, and only because the proof app 404s where both fixture apps end in a catch-all 200. **SITTING 6 — Tasks 9 and 10 — IS DONE, 2026-09-19, 12 findings** (`1623e68`, `21d3100`, and `5d4c785` for F12; no migration, no route, no spec change): **§22 STEP 7 IS CLICKED**, and D24's credential class is operable by a person. A signed-in person reads §13's first-launch checklist with every item's state, reason, owner and the plan that builds it — seven items, because a `large_course` audience adds §24's load rehearsal — mints a delegated token and is shown its secret exactly once, lists it, revokes it, and an administrator reads §26's fleet. **The checklist's two paths were measured BYTE-IDENTICAL** — `GET /v1/projects/{id}/launch-readiness` against the production deploy's `409` envelope — re-proving P5a sitting 11's property rather than assuming it, and both now render through one component. **Its headline finding is a renderer that lied about every future instant**: `<Ago>` clamped its difference at zero, so a token expiring in thirty days read **`expires 0s ago`** beside a pill correctly reading `active`, with `tsc`, ESLint, Prettier and all 1355 tests green through it — both fields are `string`, so no gate here can tell a past instant from a future one. It is now one direction-aware `<Instant>`, because two components would put the choice back on the caller. **The D22 finding §7e predicted is confirmed**: `MintTokenRequest.capabilities` is a flat enum of eleven that marks none of D24's privileged four, naming them only in prose no client can read, so the console must restate a platform rule — the eleven ARE held to the document by `tsc` in both directions (watched failing both ways), the four are not, and the fix belongs to the document as `x-manifest-privileged`. **`revokeToken` publishes no event**, the third instance of the shape after `validateSpec` and `createRelease`. **Two of the plan's own control rows were weaker than they read**: Task 9's row 3 cannot fire, because both formulas answer `false` today AND the formula it proposes is not the plausible client re-derivation; and Task 9's row 2 appeared to be caught by Prettier until the leftover blank line was tidied, after which all four gates passed a checklist showing `not_built` with no reason at all. **Also measured, and new to §4**: Caddy's internal PKI issues a **12-hour** leaf over a **7-day** intermediate, so a browser tab left open across a longer sleep shows `ERR_CERT_DATE_INVALID` on a chain `openssl` and `curl` both accept — a new tab clears it, and the edge is not at fault; and **the console's sign-out ends Manifest's session and leaves the IdP's alive**, so the next *Sign in with CWL* silently returns the same person with no prompt. **A TWELFTH FINDING CAME AFTER THE CLOSE, FROM RICH DRIVING THE CONSOLE BY HAND**, which is what a reference console is for: he built a project, watched BuildKit print `#12 DONE`, pressed *Release* and was answered `409 RELEASE_BUILD_NOT_DEPLOYABLE`. **The platform was right** — `scanImage` runs inside `driver.buildImage` after BuildKit returns and takes no `onLog`, so §12's scan is **completely silent** and the row stays `running` for it. Measured twice: **11.29 s and 9.70 s** between the last log line and `build.succeeded`. The screen now says so while a build is not `succeeded`, reading the resource rather than the log, **with the button left enabled** because a transient `disabled` sticks if a frame is missed. **No API gap** — `GET /v1/builds/{buildId}` already answers `status` and `imageDigest` — **but the scan window is invisible to every client**, which is a platform finding recorded for whoever next opens §12. **SITTING 7 — TASK 11, §26'S QUEUE — IS DONE, 2026-09-19, 8 findings** (`aec8b90`; no migration, no route, no spec change, and no Docker tier owed or run). **D24's loop is operated by a PERSON for the first time**: an agent holding a token minted by clicking was refused `403 TOKEN_ACTION_PENDING`, the question reached the queue **576 ms later with no reload**, a person confirmed it, the agent's own retry with the same `Idempotency-Key` answered **201**, a retry with a FRESH key made a new question instead of succeeding, a rejection's sentence reached the agent **verbatim** as `403 TOKEN_ACTION_REJECTED`, and one question was left waiting. **Its headline finding contradicts both the plan and §7e**: they said Task 11 would be the first caller of `<Refusal>`'s `pendingAction`, and **it can never have one** — both envelopes carrying that field are raised only inside `assertCapability`'s `actor.credential === 'token'` branch, and the console is always a session, so the renderer would be the no-caller shape §9 names four times. It is not built, and `ui.tsx` now says why. **`consumeAction` publishes no event and neither does `addMember`** — the fourth and fifth instances of the shape after `validateSpec`, `createRelease` and `revokeToken` — so *has the agent spent its one retry?* cannot arrive on the stream, which is what gives `getPendingAction` a real caller. **The three `pending_action.*` events DO publish**, checked rather than assumed, so this is the first screen in the plan whose own writes reach every watcher. **Both of the plan's fireable controls fired**: `displayState` reverted rendered a lapsed question as `pending` with a Confirm button that answers `409 PENDING_ACTION_RESOLVED`, and with the socket closed a fourth question did not reach the screen in 18 s against 576 ms live. **Also found**: a `403 CSRF_ORIGIN_REFUSED` stood in for a capability refusal because zsh does not word-split an unquoted variable — a 403 for the wrong reason in exactly the place this project asserts 403s; `<Instant>`'s unit boundary at 86,400 s renders two questions asked 34 s apart as `1d` and `24h`; and `PendingActionResolvedError`'s hint says *somebody has already answered this one* for a row that merely expired. **SITTING 8 — TASKS 12 AND 13 — IS DONE, 2026-09-19, 11 findings** (`01225cb`, `58107aa`, and a third commit for the repair below; no migration, no route, no spec change). **A FRONT-END DEVELOPER NEEDS NO PLATFORM AT ALL**: `packages/mock` serves all 34 operations of the published contract from hand-written fixtures in one `node:http` process, with a scripted WebSocket, and the console was driven against it **in a browser** through Vite's proxy — signed in with no IdP, twenty log lines arriving, §12's silent scan window, §14's Incident, §26's queue with all four states on screen, the fleet's `403`. Its routing table's PATHS COME FROM `openapi.json` itself, compiled to regexes at startup, so the mock's idea of where an operation lives cannot drift from the contract's; every response body is validated against the document on its way OUT as well as in `validate.test.ts`; and `packages/console/src/api.test.ts` drives the console's whole data layer against it in Node with no DOM, so a fixture the console cannot consume fails a test rather than a demo. **D22's coverage gate is green with `DELIBERATELY_UNCALLED` EMPTY** — all 34 operations have a caller — and was watched failing three ways, because §7e warned it would be green on arrival and a gate nobody has seen fail is not a gate. `scripts/ci-acceptance.sh` and `scripts/demo-console.sh` are the acceptance's two halves, `@manifest/contract` is **1.0.0** (P5a Decision 8's reservation, spent), and `make ci-acceptance` was RUN: both headless journeys green over the new version. **Its headline finding is that `make doctor` failed `CLAIMED BY SOMETHING ELSE: 7102` — the THIRD time on that one check after 7100 in 2026-09-07 and 7104 in 2026-09-18 — and `doctor.sh`'s own comment had predicted it by name and said Task 12 was the task that must fix it.** It did not, until the first real `make ci-acceptance` run found it. Fixed by ASKING the mock, as both times before: it is sent a path the DOCUMENT DOES NOT DECLARE and answers `404` with its own name — `/v1/me` would not do, because the mock answers that with the same `UNAUTHENTICATED` envelope the control plane does. **Also found**: a token fixture listed `build:run`, which is not a capability, and NEITHER `tsc` NOR Ajv can see that, because `MintTokenRequest.capabilities` is a closed enum of eleven while `Token.capabilities` — the READ schema — is a bare `array<string>` (a finding about the API, the second instance of sitting 6's shape); **the same source file is typechecked under TWO module resolutions and the correct ajv import differs in each**, the named import being the only form right in both; the plan's *missing `Idempotency-Key` is `400 REQUEST_INVALID`* is wrong (the platform answers `IDEMPOTENCY_KEY_REQUIRED`, and refuses a key under eight characters); **a fixed DEADLINE made the queue screen unreachable**, because the only `pending` row had already lapsed and Decision 8's `displayState` correctly rendered it expired with no buttons; a staging Incident rendered under `sandbox` because the routing table ignored its path parameter; and the plan's own Break row 1 is caught by `tsc` too, so it proves the validator is connected to the fixtures and nothing about what Ajv adds. Eleven negative controls, all eleven watched firing — including **Decision 12's**: with one test file renamed away `pnpm test` exits **0** with seven fewer tests, which is why the CI script asserts counts. `pnpm test:docker` was OWED and run, because the doctor repair touches `infra/lib/common.sh` and `routing/edge-source-refusal.docker.test.ts` reads it. **SITTING 9 — TASK 14, THE ACCEPTANCE, ALONE AND LAST — IS DONE, 2026-09-19, 15 findings, AND P5c IS EXECUTED.** §16's Acceptance tier is met by **two independent clients over one contract**: `make ci-acceptance` ran **three times** — the baseline machine, the same machine again, and an `echo reset | make reset` machine — each `0 failed, 0 moved`, and **§22's journey was CLICKED end to end, all sixteen rows**, with the agent driving Chrome and Rich typing every password (R3), recorded as a 50-frame GIF. **Step 4's decision is Rich's and is applied**: `scripts/offline-acceptance.sh` gains a TENTH step, the console's preflight behind `MANIFEST_CONSOLE_PREFLIGHT_ONLY`, because nothing in its nine steps had ever fetched the console's own document — measured by extracting every URL the script requests. **Its headline finding is one only a person clicking could reach: signing out of a deployed app leaves you on a raw JSON `404`.** Manifest's own SP publishes `/auth/logout` as its Single Logout URL (`sso/entity.ts:117`) and that path answers **`POST` only** (`api/unversioned.ts:22`), while SAML's HTTP-Redirect logout binding sends a **`GET`** — measured both ways, `POST` → `204`, `GET ?SAMLRequest=` → `404` — so the IdP's logout chain 404s against Manifest and Manifest's own session is never ended. **1376 tests, doctor 18/0, verify 51/0 and three green `ci-acceptance` runs pass through it**, because no tier signs out of an app in a browser: Decision 7's stated cost, collected. **Step 1's own premise was overturned**: it asks for three machine states and the script normalises all three into one, because `pnpm test` truncates before the demos *by design* (`ci-acceptance.sh:117`), so all three runs produced **identical** summaries and the predicted count difference does not exist — and the runs take **228/221/225 s**, not the ~15 minutes both documents budget. **Three findings are about the checklist rather than the platform**: it names *"Instructor One"*, which is the MOCK's fixture (the platform says **Test Instructor**); row 8's *"write a note"* has **no user interface at all**, so that half is `make demo-ai`'s; and *"sign the student in before anything needs a member"* reads as though signing into the APP counts — **it does not**, the app and Manifest being different SPs with different user stores, measured as `count(*) = 1` in `users` after the app sign-in, and discharged with an incognito console sign-in. **Five of six negative controls were measured**, including the two the plan predicted invisible: `DELIBERATELY_UNCALLED` given all 34 operations leaves `coverage.test.ts` **green**, which is Decision 15's honest limit, and `stream_close_delay` deleted from the Caddyfile leaves the unit tier **1376 green**. `displayState` reverted proved load-bearing for **three** things — the pill, the buttons and §26's health number — rendering a lapsed row as `pending` while its own line read `expires 2h ago`. **(b)'s clicked half is the one control not measured**, and is recorded as such. **AND THEN F11 WAS FIXED, ON RICH'S INSTRUCTION RATHER THAN DEFERRED TO P6** (`b23674b`, 2026-09-19) — which is why sitting 9 reads SIXTEEN findings above and not fifteen. `GET /auth/logout` now answers the IdP's HTTP-Redirect LogoutRequest, validates its signature before ending anything, and returns a signed LogoutResponse; **single logout works end to end, proved in a browser against the real IdP** (`LogoutRequest arrived (536 chars)` → `ACCEPTED — session cleared`, the app landing on its own page instead of raw JSON and the console tab going to the sign-in screen). **IT TOOK TWO FIXES, AND THE SECOND IS THE LESSON (F16): the first passed every test and was still broken against the real IdP**, dying in `inflateRawAsync` with *"unexpected end of file"* — `+` is a literal character of the base64 alphabet, every FORM decoder reads it as a space, and `Buffer.from(x, 'base64')` silently drops spaces, so the deflate stream arrived short. The redirect binding's values are URI components, not form fields. **Every test missed it because they all fired GARBAGE at the route and asserted a refusal — and a route that refuses everything passes all of them.** Rich asked whether it had been tested in a browser; nothing else would have caught it. Gates after the fix: `pnpm test` **1390 in 108 files**, `pnpm test:docker` **178 in 29** run twice, doctor 18/0, verify 51/0. | the §1 journey, clickable, driven twice over one contract |
| **P6–P11** | 2 | **SEVEN plans since 2026-09-19, listed below** — P6 split into P6a and P6b on D9's own two clauses — **P6a IS EXECUTED (2026-09-22) and P6b IS WRITTEN (2026-09-22, eleven tasks in seven sittings; its sitting 1 is next)** — the P6a row below has the record, and this cell deliberately names no sitting (it named *"sitting 8"* for the whole of sitting 9 and into sitting 10 — found by P6a sitting 10's sweep). P6a IS BRIEFED** ([`2026-09-19-p6-brief.md`](./2026-09-19-p6-brief.md)), which records the three decisions Rich made that day and sizes the whole of P6 at 18–24 tasks | P6a: an app reaches production with every blocking item honestly met |

**P1 and P2 are both EXECUTED and green (2026-09-05).** P2's 21 tasks
ran in three sittings — 1 and 9–11 on 2026-08-31, **2–8** and then **12–21** on
2026-09-05, finding **20** and **27** defects respectively.

**P3 is EXECUTED and green — all 19 tasks, 2026-09-07.** The 2026-09-04 hold was
then discharged and **P4 was split into P4a and P4b (Rich's call, 2026-09-07).**

**P4a IS EXECUTED AND GREEN: all 15 tasks, finished 2026-09-09. P4b IS EXECUTED AND GREEN:
all 16 tasks, finished 2026-09-15. P4c — zero-downtime redeploys — IS EXECUTED AND GREEN: all 11 tasks in eight agreed sittings, finished 2026-09-16, 70 findings. The platform redeploys an app without interrupting anybody or signing anybody out, and `make demo-redeploy` — 24 assertions — is green from a `make reset` machine. P5 is three plans since 2026-09-16, and the first, P5a, is WRITTEN (2026-09-16): 17 tasks in twelve agreed sittings. Its sitting 1 — Task 1, the measurements — is done (2026-09-16, 9 findings, no platform code changed), and so is sitting 2 — Tasks 2–3, the API under `/v1` and through the edge at `https://console.manifest.internal` (2026-09-16, 16 findings), and so is sitting 3 — Tasks 4–5, CSRF by `Origin`, a sign-in bound to its browser, and the error-code registry (2026-09-16, 15 findings), and so is sitting 4 — Task 6, `defineRoute`, the generated OpenAPI document and its drift test, `GET /v1/me` the first converted route (2026-09-16, 7 findings); and so is sitting 5 — Task 7, `@manifest/contract` generated from the document and `make demo-journey` at step 1 (2026-09-16, 4 findings); sitting 6 — Tasks 8–9, projects, environments, members and specs as public representations with the two missing reads, then §23's reserved labels and `GET /v1/slugs/{slug}` (2026-09-16, 13 findings); sitting 7 — Tasks 10–11, blueprints with starters (the proof app is `node-ts-mongo@1`'s first) and the knowledge pack over `/v1`, then a project created from its skeleton and a starter for a stated audience, saying so on its stream (2026-09-16, 18 findings); sitting 8 — Task 12, every event payload a schema enforced where it is written, the stream in the contract, and `subscribe` (2026-09-17, 15 findings); sitting 9 — Task 13, builds that answer `202` and finish on the stream, a build a restart interrupted failed at boot, and §12's scan recorded on every build (2026-09-17, 18 findings); sitting 10 — Task 14, releases, deploys and Incidents as representations with every `/v1` route now a definition, and `instance.provisioning` and `instance.starting` stored and streamed (2026-09-17, 10 findings), which took `make demo-journey` through §22 step 6; sitting 11 — Tasks 15–16, §13's `LaunchReadiness` computed and read-only, the first administrator out of band with `audit.role_changes`, and §26's fleet (2026-09-17, 13 findings), which took `make demo-journey` through **step 8**; and sitting 12 — Task 17, the acceptance, 2026-09-17, 8 findings — which ran it green **three times, the third from a `make reset` machine**, put it in the offline acceptance as step 8, and watched thirteen of its fourteen negative controls. **P5a IS EXECUTED.** P5b — delegated tokens and pending actions (D24) — was **WRITTEN the same day**: [13 tasks in nine sittings](./2026-09-17-p5b-delegated-tokens.md), and **its sitting 1 — Task 1, the measurements — IS DONE, 2026-09-17, with 11 findings**, which corrected five of its tasks: a token would have escaped its scope on `GET /v1/projects`, Task 6 as drafted would have deadlocked D24's confirm-and-retry loop through the idempotency cache, and `db/client.ts`'s error hint was telling readers to connect as the superuser (fixed, `8d11025`). **Its sitting 2 — Tasks 2–3 — IS DONE TOO, 2026-09-17, with 14 findings**: D24's privileged four named once with §20's alignment test, `release:promote` separated from `release:deploy` and asserted before the launch gate, and migration 0014's two token tables with the `tokens/` module — and it found the plan's own token parser would have refused 47.5% of its own tokens, and that the plan's own TRUNCATE negative control cannot fail. **And its sitting 3 — Tasks 4–5 — IS DONE TOO, 2026-09-17, with 15 findings**: a token is minted, listed and revoked in an interactive session, and **an agent holding one authenticates with it** — one `onRequest` hook, two credential classes, and `requireSession` makes an interactive-only route a `tsc` error rather than a remembered check. It found that the contract layer could not carry a bodyless mutation at all (`DELETE` was a `400` before its handler and an ungenerable document), and that three of its own negative controls answer `403` for the wrong reason, so every refusal now asserts its code. **And its sitting 4 — Task 6, alone — IS DONE TOO, 2026-09-18, with 10 findings**: **D24's central refusal exists**, with the `PendingAction` it creates carried by the `403` itself, the catch OUTSIDE `app.idempotent` so a confirmed retry can reach the handler, and migration 0016's `pending_action.created`. It found that **the ordering control the plan named cannot fail against any test that existed** — every test writes a token holding the privileged capability, which no token the platform can mint can hold, so the swapped order answers a DEAD-END `403 FORBIDDEN` for every real token with all 31 tests green. **P5b IS EXECUTED — all 13 tasks in nine sittings, finished 2026-09-18, 116 findings.** *This paragraph deliberately stops enumerating P5b's sittings: it was frozen at sitting 4 while sittings 5 to 8 executed, which is sitting 8's F14 in a second copy. The plan's own sittings table is the maintained one, and the P5b row above is the ledger's statement.* **P5c — the clients — IS EXECUTED (2026-09-18/19): all 14 tasks in nine sittings, 107 findings, and PHASE 1c IS COMPLETE.** The P5c row above is the ledger's statement of what it decided and what Rich decided in it; the per-sitting counts are in the defect-rate table below. **P6a — the first production launch — WAS WRITTEN on 2026-09-19** ([19 tasks in eleven agreed sittings](./2026-09-19-p6a-first-production-launch.md), from [the P6 brief](./2026-09-19-p6-brief.md)) **and IS EXECUTING: its sitting 1 — Task 1, the measurements, alone and first — ran on 2026-09-19 with 15 findings, and moved no task boundary.** *This paragraph deliberately does not say how many of its sittings are done — the plan's own sittings table and the Phase 2 P6a row are the maintained copies, and this is the defect that froze the P5a and P5b paragraphs above.*
P4b ran in TEN AGREED SITTINGS of one session each (Rich, 2026-09-09), the same pattern
P4a used; the table is at the top of that plan. **Its Task 1 reconciliation did not come
back clean** — six divergences from the executed P4a, two of which would have failed a
migration outright. P4a's last twelve
tasks were split into **seven sittings of one session each** on 2026-09-08 with Rich's
approval, so a session limit could not land mid-task — **1: 4–5 · 2: 6–7 · 3: 8–9 ·
4: 10–11 · 5: 12–13 · 6: 14 · 7: 15** — and all seven are done. *Sittings pace execution; they are
not this document's product Phases.* Tasks 1–3 found
**18 defects**, and the identity half of the platform now works for the first time: a
real CWL login completes end to end, against an IdP that could not issue an assertion
— or authenticate anybody — when the session started. Two findings went beyond the
plan. **§12's dependency-scan gate blocked every CWL application**, because
`passport-ubcshib` depends on a deprecated `passport-saml` carrying a critical
signature-verification advisory with no fix; §12's unwaivable gate and C6's rule that
a library change may never be a prerequisite could not both hold, and **Rich settled
it on 2026-09-08** — see *Spec action raised by P4a*. And **§8's `SAML_IDP_CERT_PATH`
named a file nothing could create**, so `InstanceSpec` gained `files`. **P4b is now
written too — 16 tasks, 2026-09-07, on Rich's instruction and ahead of P4a's
execution**; the decision it departs from, and how that departure is answered, are
in *Order of operations* step 7. P4b previously stayed
unwritten until P4a has run, for the reason *Order of operations* gives. See
*Order of operations*. Each of P1–P5 carries the required plan header, its own file-structure
map, and bite-sized TDD steps with real content — no plan may contain a step
standing in for a spike result.

### P1 — 1a-i · Local substrate

*Depends on: S7. **Written 2026-08-30**, **executed 2026-09-05** —
[`2026-08-30-p1-local-substrate.md`](./2026-08-30-p1-local-substrate.md), 13 tasks,
all 13 done. `make doctor` 14 checks / 0 failed; `make verify` 31 checks / 0 failed;
both green **offline**. Runbook: [`../RUNBOOK.md`](../RUNBOOK.md).*

**Execution found 18 defects in a plan that had already been self-reviewed** — see
*Lessons*. Six of them were **checks that passed while the thing under test was
broken or absent**, and one was a genuine platform bug the plan's own check could
never have caught. All are fixed in the code and written back into the plan with
the measurement that found each. **The one part of P1's acceptance not run is the
second-machine clean-clone test** — no second Mac was available; it is recorded as
a gap in `RUNBOOK.md` rather than marked complete.

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

*Status: **EXECUTED — all 21 tasks, 2026-09-05.** Written 2026-08-31 in two passes. Written in two passes. Tasks 1–8 landed
first and paused there: settled by §7 and §25, and safe against any spike outcome.
Tasks 9–10 were drafted at the same time but held back, because S1 existed to correct
the `Driver` interface and the contract suite P3 inherits; Tasks 11 onward were
blocked behind them, consuming their types. **S1 reported on 2026-08-30 and the
interface needed no revision**, so Tasks 9–10 were promoted rather than rewritten and
Tasks 11–21 written against them. The plan's self-review caught seven defects and
records each one.*

*Executed in three sittings: **Tasks 1, 9, 10 and 11** on 2026-08-31 (the runtime
island — no Postgres, no Docker), **Tasks 2–8 on 2026-09-05** (the `manifest.yaml`
schema, machine-actionable errors, policy validation, `isSensitiveDiff`, the
blueprint descriptor and registry, the `fixture-node` blueprint, and the database
schema against P1's Postgres), and **Tasks 12–21 on 2026-09-05** — configuration and
the dev-auth kill switch, sessions and the shim, the §13 capability model, the D5
source driver, environment resolution and immutable releases, the Fastify server with
D23.6 idempotency and the D23.7 error envelope, the project, spec and delivery
routes, the §16 authorization contract suite, and the lifecycle acceptance.*

***P2's demo holds.** `pnpm test` is **224 tests / 23 files**, with `pnpm lint`,
`typecheck` and `format:check` clean. The full lifecycle — log in, create a project,
provision a bare repository, validate the spec at that commit, build, release, deploy
to staging and reach healthy, then be refused production with its §13 checklist —
runs against the fake driver in **~300 ms** against a 1000 ms budget. The control
plane also **boots and serves HTTP on 7100**, verified with `curl` rather than only
by `app.inject`. fastify 5.12.3, @fastify/cookie 11.1.2.*

*Executing Tasks 2–8 found **20 defects**, each recorded inline at its task with what
it was measured against. The three worst were not in the code the tasks wrote but in
what the tasks assumed: `pnpm format` would have rewritten the **approved spec**,
because Task 1 shipped the script with no `.prettierignore`; Task 7's Dockerfile
called `groupadd` and `useradd`, **neither of which exists in `node:22-alpine`**, so
P3's whole acceptance would have failed at its first `RUN`; and Task 8's database
client broke `pnpm test` **for the entire workspace**, taking down eight test files
that need no database. Two more were holes in the D9 approval gate: swapping to a
different blueprint at the same major version was not sensitive, and removing a
declared resource read as a decrease to zero. **Three were checks that passed while
the thing under test was absent** — three of the four quota checks could each be
deleted with the suite still green.*

*Execution began 2026-08-31: **Tasks 1, 9, 10 and 11 are built and green** — the
runtime island, which needs no Postgres and no Docker. 19 tests. Running them found
four further defects the self-review could not have: pnpm 11 makes an un-named
dependency build script a hard error; the ESLint boundary patterns were backwards and
caught almost nothing; `typescript-eslint` does not honour an `_` prefix by default,
so the fake driver's faithful `exec(id, cmd, _opts)` failed lint; and the state
machine's unguarded table index turned drift into a TypeError in an unrelated test.
All four are fixed in the plan. **Tasks 2–8 followed on 2026-09-05** — see the
paragraphs above.*

*Executing **Tasks 12–21** on 2026-09-05 found **27 more defects**, each recorded
inline with its measurement. **Tasks 12–15 had none**; all 27 landed in the six tasks
from `releases/` onward, where the plan stopped being pure functions and started
touching a framework, a database and a process. The classes, in size order: **six**
`exactOptionalPropertyTypes` failures in six files that **no test could ever catch**,
because Vitest strips types without checking them; **five** test-isolation defects —
API tests share one real database, collide on a unique slug, and left `pnpm test`
not repeatable, while `withRollback` turned out not to isolate a suite from rows
somebody else **committed**, so three suites had been green only because the database
happened to be empty; **five** controls that were green because they were not looking;
**four** concrete values wrong on contact; **four** stated properties the code did not
have.*

***Two of them were one edit away from being live.** `/auth/dev-login` passed
`devAuthEnabled: true` as a literal, so the route-registration guard was the only
thing between that endpoint and an authentication bypass — removing it made the route
answer **200 with a real session**, not the refusal the plan's own step predicted.
And `GET /builds/:buildId` made to honour a client-supplied `projectId` let one user
read another's build with **200**. Both read, in review, as "check the project".*

***And nothing had ever executed the boot entry point.** No test imports
`src/index.ts`; the `dev` script the plan's README section names did not exist, and
would not have worked if it had, because Node resolves NodeNext `.js` specifiers
literally. **This is the same gap P3's self-review found in P3** — no task wired the
Docker driver into boot, so `make demo` would have passed against the fake one. P3
should assume its entry point is untested until something has curled it.*

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

**✅ EXECUTED AND GREEN. All 19 tasks, finished 2026-09-07.**

| | |
|---|---|
| **Executed in five sittings** | 1–4 (Engine client, Docker tier, §12 hardening, per-app networks) · 5–8 (egress proxy, `services/`, instance lifecycle, logs + exec) · 9 (scoped registry push tokens) · 10–12 (ephemeral builder, `build/` + its gates, SBOM and vulnerability scanning) · 13–15 (`routing/`, readiness through the edge, the `DockerDriver` assembled and wired into boot) · **16–19** (§13's promotion refusal, `make demo`, S6's probe matrix, and doctor/verify/reset) |
| **Gates** | `pnpm test` **381** · `pnpm test:docker` **89** (~5 min, needs `make up`) · `make doctor` **16 / 0** · `make verify` **34 / 0**. A different number on a clean checkout is signal, not noise. |
| **Defects** | **82 across 19 tasks — 4.3 per task**, the highest rate this project has measured and well above the 2.7–2.9 predicted. Recorded per session in the plan's *What executing this plan found*. |
| **Read first** | **Sessions 4 and 5.** Between them they establish that **no build** and then **no deploy** in this platform had ever succeeded — and that both were invisible to a green test suite, because every test constructs its own inputs while the production path re-derives them. |
| **The demo holds** | `make demo` drives the real HTTP API: log in, create the project, push the fixture app, validate its manifest at that commit, build, release, deploy to staging, be refused production, then reach the app from a container through the edge with the platform CA verified. It runs again from a **dropped database, a deleted repository root and an emptied registry**. |


*Reconciled against a running P2 on 2026-09-05, before execution.* P3 was written
2026-08-31 against an imagined P2. Every **seam** was re-checked — each place it
modifies a file P2 built, calls a P2 symbol, adds a sibling to a P2 error type, or
asserts through P2's HTTP surface — and that found **eight defects**, fixed inline.
Two would have silently reverted P2's own fixes (a `vitest.workspace.ts` rewrite that
dropped the database reset and the `.env` derivation); one sat on the single
assertion P3's self-review had already flagged as its worst (a boot check reading a
log line that `logger: false` swallows, whose negative control could not fail); and
one would have left the builder unable to obtain a registry token, because P2's D23.6
hook demands an `Idempotency-Key` that BuildKit never sends. Trying to *run* the fix
rather than reason about it also turned up **two live defects in P2** — a temp-dir
leak and an acceptance budget that was measuring `git`.

**Deliberately not re-reviewed:** the Engine API client, §12's hardening, the builder
bounds, S6's probe matrix. Reading does not find what running finds; the pass was
scoped to stale references to things that now exist.

*Depends on: S1, S7, P1, P2. **S6 runs as its acceptance**, as Task 18.*
***Written 2026-08-31*** —
[`2026-08-31-p3-docker-driver-deploy-spine.md`](./2026-08-31-p3-docker-driver-deploy-spine.md),
**19 tasks, 136 steps**, self-reviewed 2026-09-04. Written against
`../spikes/S1-controls-settled.md`, so no step stands in for a spike result. It
**proposes five spec actions and applies none of them** — those are Rich's, and they
are listed at the end of the plan.

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

### P4 — 1b · Identity, secrets & AI — **SPLIT INTO P4a AND P4b, 2026-09-07**

*Depends on: S2, S3, P3. **All three have landed** — both spikes reported, and P3
executed in full on 2026-09-07.*

**Rich's call, 2026-09-07: P4 is two plans.** The scope below spans four subsystems
and would have been ~23 tasks against P3's 19-at-82-defects, and the writing-plans
scope check asks for one plan per subsystem where each still produces working,
testable software. Both halves do.

| | Scope | Demo | State |
|---|---|---|---|
| **P4a** | The IdP finished, `secrets/` envelope encryption, `sso/` SP auto-provisioning, per-app keypairs, §8's injection contract and its drift test, `node-ts-mongo@1`'s auth half, Manifest's own CWL login (deleting the dev shim), the proof app's sign-in | the proof app: CWL sign-in and a per-user note, by `curl` — and the instructor cannot see the student's note | ✅ **EXECUTED — all 15 tasks, green, 2026-09-09**, in seven agreed sittings. **80 defects**, recorded per session in the plan's *What executing this plan found*. The offline acceptance is outstanding and is Rich's to run. [`2026-09-07-p4a-identity-secrets-injection.md`](./2026-09-07-p4a-identity-secrets-injection.md) |
| **P4b** | The LiteLLM client with `allowed_routes`, the classification-gated catalogue (D17), key lifecycle, the blueprint's AI wiring, `WS /projects/:id/events`, heuristic redaction, incidents | ✅ the proof app's LLM answer, charged to the person who asked | ✅ **EXECUTED — all 16 tasks, green, 2026-09-15**, in ten agreed sittings. **140 findings**, recorded per sitting in the plan's *What executing this plan found*. The offline acceptance of `make demo-ai` is outstanding and is Rich's to run. [`2026-09-07-p4b-ai-events-streaming-incidents.md`](./2026-09-07-p4b-ai-events-streaming-incidents.md). Writing it measured **ten more facts**, one of which is a §10 requirement that **cannot be implemented at LiteLLM 1.98.0** |

**Six facts were measured on 2026-09-07 before P4a was written**, because no plan may
contain a step standing in for a spike result. Four were live defects nothing could
have noticed: **the Manifest IdP could not issue an assertion at all** (no
`saml20-idp-hosted.php`, empty `cert/`, metadata 500 — with `make verify` 34/0
throughout); `core:AttributeLimit` was not configured, so attribute release **failed
open**; `authsources.php` released `ubcEduCwlPuid` under an OID `passport-ubcshib`
does not map, so no app could read its own user identifier; and **`MONGODB_DB_NAME`
was never injected**, so every deployed app wrote to a database called `app` while
two Docker tests set the variable themselves and passed. The other two settle P4b's
inputs: `ubc-genai-toolkit-llm@0.7.0` reproduces all three of S3's findings, and
**the toolkit cannot be forced through §12's egress proxy** — measured against three
separate mechanisms. All six are written up in P4a's *Findings this plan is built
from*.

**What P4's author should take from executing P1–P3, beyond the module list below.**
Three things, each paid for:

1. **Schedule the end-to-end task early, and drive it through the real entry point.**
   P3's two worst sessions were its last two, and both for the same reason: the first
   time the parts were made to work together, and then the first time the *control
   plane* drove them, each exposed a class of defect a green test suite had been
   hiding. Seven of Session 5's twenty-one were one shape — **the test constructs the
   value correctly and the production path re-derives it wrongly**. P4 has the same
   exposure and more of it, because §8's injection contract is exactly a set of values
   two paths must agree on.
2. **A module with no call site is not built.** P3 shipped `waitForReady`/`edgeProbe`
   in Task 14 and nothing called them until Task 17; P2 shipped `isSensitiveDiff` and
   nothing has called it yet outside a test. Both had tests and both passed. **Give
   every task a step naming the caller**, not just the module.
3. **Diagnosability is a feature, and its absence hides other defects.** A failed
   build recorded no reason and an unexpected 500 left no trace anywhere, because the
   error handler used a logger the server was built without. Fixing those two took
   minutes and immediately named four more defects. P4 adds events, WebSocket
   streaming and redaction — so it owns this properly rather than by accident.

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

**What P4 inherits, concretely.** These are the seams P4 touches, as they actually
exist after P3 — the equivalent of the *What P2 leaves you* section P3 had, and the
place to check before writing a task that assumes any of them.

| | |
|---|---|
| `identity/` | The dev shim: `session.ts` (signed, expiring cookies, no sessions table) and `dev-auth.ts` (four named test users, never arbitrary text). **P4 deletes this module** and needs an explicit task for it. Two safeguards exist and must survive the replacement: the service refuses to start if `MANIFEST_DEV_AUTH` is set outside development, and a test asserts that. |
| `POST /projects/:projectId/spec` | **New in P3 Task 17.** Re-validates `manifest.yaml` at a commit and is the ONLY thing that can change a project's spec after creation. It computes D9's `isSensitiveDiff` and **reports it without enforcing** — the escalation is P6's. P4 should not grow a half-gate there. |
| Service bindings | `deployRelease` derives a `ServiceBinding` per `resolved.services` entry, calls `ensureService`, and injects the endpoint under the catalogue's variable name. Platform bindings — including `PORT`, `MANIFEST_ENV`, `MANIFEST_PROJECT_SLUG` and `MANIFEST_APP_URL` — are applied **after** the app's own `env`, so a declared variable cannot shadow one. **§8's general injection contract and its drift test are P4's**; this is the plumbing only, and the ordering rule has a test. |
| Secrets today | `MANIFEST_MASTER_SECRET` derives every backing-service credential by HMAC (P3 Task 6). It must be STABLE — a regenerated one makes every existing database reject the process, and the failure reads as a Mongo fault, so boot warns when it generated one. `secrets/` envelope encryption is P4's and replaces this. |
| Blueprints | `blueprints/fixture-node/` is P3's minimal one and its `Dockerfile.tmpl` carries two hard-won refusals — no `# syntax=` directive, and `.npmrc` copied WITH the lockfile rather than after it. **`node-ts-mongo@1` is P4's**, and it must keep both. The blueprint registry's `pathOf(ref)` is how a reference becomes a directory; the driver takes it as `blueprintDirFor`, so a second blueprint needs no driver change. |
| The IdP | `infra/idp/` is ours, built from `php:8.3-apache` plus SimpleSAMLphp 2.x, on port **7122**, with its own `manifest_idp` database. It has **no dependency on `docker-simple-saml` running or existing**. S2 established that one `INSERT` into `saml20_sp_remote` registers an SP on the next request — no reload, no restart, no cache TTL — and that attribute release **fails open**. |
| Fixtures | `fixtures/fixture-app/` is P3's build target and stays trivial. **`fixtures/proof-app/` is P4's** and is §16's proof app — the one that goes to UBC on the external track, which is why it should be honest rather than minimal. |

**Demo:** §16's proof app — log in with CWL, write a note to its own Mongo, ask the
LLM a question, display the answer — driven by `curl`.

### P5 — 1c · Contract & clients

*Depends on: P4 — and on P4c by order rather than by code: Rich placed zero-downtime redeploys first (2026-09-14), so that the generated contract and the console describe redeploys as they will be.*

OpenAPI generation from the routes, the versioned TypeScript client,
`manifest-mock`, delegated tokens and `PendingAction` (D24), the knowledge pack API
(D25), `console/` with its import boundary, a read-only `LaunchReadiness` view, the
audience question at project creation (§24 — collected, acted on in Phase 2), **a
read-only fleet list** (§17 lists it; this section omitted it until 2026-09-16), and
the CI acceptance script.

**ITS BRIEF IS [`2026-09-16-p5-brief.md`](./2026-09-16-p5-brief.md) — READ IT BEFORE WRITING THE
PLAN.** Written from the code the day P4c finished, it finds that §17's one line hides three large
pieces of work — the public representations of every resource (routes have no schemas and return
database rows), delegated tokens with pending actions, and a browser console — and estimates **30–40
tasks**. **Five decisions are Rich's and should be settled first**: what a console-created project
contains (today it is a stub, so §22's step 6 is unreachable from a browser); whether P5 becomes
three plans (contract, D24, clients) as P4 became three; where the API is served and whether app
containers may reach it through the edge (measured: they could); the contract's version scheme; and
whether 1c's *second developer* question requires the never-run second-machine clone. **Rich decided
four on 2026-09-16** — starters; **three plans, P5a/P5b/P5c** (table above); a `/v1` prefix; no
acceptance that depends on a second machine — **and the fifth the same day: the console and the API on
one origin through the edge, refused to app and sandbox networks, with the platform's own labels
reserved as slugs. All five are applied to the spec (`1d88846`).** **P5a IS WRITTEN (2026-09-16): [`2026-09-16-p5a-the-contract.md`](./2026-09-16-p5a-the-contract.md), 17 tasks in twelve agreed sittings, with its six spec actions applied (`491f8be`). Sitting 1 ran the same day, with 9 findings, sitting 2 too, with 16, sitting 3, with 15, sitting 4, with 7, and sitting 5, with 4, and sitting 6, with 13, and sitting 7, with 18, and sitting 8, with 15, and sitting 9, with 18, and sitting 10, with 10, and sitting 11, with 13, and sitting 12 — Task 17, the acceptance — with 8. **P5a IS EXECUTED (2026-09-17), and P5b was WRITTEN the same day: 13 tasks in nine sittings, whose sittings 1 (the measurements, 11 findings), 2 (the privileged set, `release:promote` and the two token tables, 14 findings) and 3 (minting a token, and bearer authentication, 15 findings) all ran on 2026-09-17, and whose sitting 4 (D24's central refusal and the `PendingAction` it creates, 10 findings) ran on 2026-09-18. Its four spec actions were approved and applied on 2026-09-17.**

**Demo:** the §1 journey — login through to seeing the launch-readiness gate —
clickable in the console *and* driven headlessly by a script, both using nothing but
the generated client.

### Phase 2 — SEVEN plans since 2026-09-19, deliberately not written yet

§17 lists Phase 2 as one stage. It is six independent subsystems that happen to share a boundary,
and the writing-plans scope check is explicit that each should be its own plan producing working
software. **P6 became P6a and P6b on 2026-09-19** — split on D9's own two clauses, *first launch*
and *subsequent releases* — so the table below has seven rows for six subsystems:

| | Plan | Covers |
|---|---|---|
| **P6a** | *(Findings counts for every sitting are in the defect-rate table below — this row states none.)* **The first production launch** — ✅ **EXECUTED 2026-09-19 → 2026-09-22 — [all 19 tasks in the eleven agreed sittings](./2026-09-19-p6a-first-production-launch.md); no task boundary ever moved.** SITTING 1 (Task 1, the measurements, alone and first) IS DONE, 2026-09-19** ([`spikes/p6a-baseline/`](../spikes/p6a-baseline/README.md)) — **and NO task boundary moved, so the eleven-sitting split stands.** All three must-buy answers came back usable: **SimpleSAMLphp HONOURS `ForceAuthn`** (1 login form against the control's 0, with the flag proved on the wire), so Task 8 stands as written and nothing goes to §8; **R3 is a GO** — two Caddy servers in one container work, the dnsmasq split's pin-backs win, and Decision 1's fallback is NOT taken; and **Decision 13 is MEASURED** — six blocking items met reads `ready: true`, a seventh blocking item in `not_built` reads `false`, the same item non-blocking reads `true`. **Its two most expensive findings are both in the plan**: Task 5's own step would have appended a duplicate `ADD CONSTRAINT` and made **migration 0019 fail to apply**, because drizzle writes the `audit.events` CHECK itself (measured by generating one) and `events.test.ts:283` already asserts it out of Postgres — so *Read this first* 16 is wrong at both ends; and **Task 3 as written takes `edge.manifest.internal` off the internal listener**, where an unmatched Host fails at the **TLS handshake** rather than with a status, turning a `make verify` check red in a way that reads as a certificate fault. Correction blocks on Tasks 1, 2, 3, 4, 5, 7 and 12. **`[M6]` confirmed Spec action 2 is real**: a platform admin minted a delegated token holding `release:approve` through the real mint route, with `release:promote` refused beside it. **SITTING 2 — TASKS 2–3 — IS DONE TOO, 2026-09-19/20, and §12's LISTENER SPLIT IS REAL**: two Caddy servers in one container, `srv0` on `127.0.0.2` (staging, sandbox, the console, the IdP, `edge.`) and `srv1` on `127.0.0.3` (the production zone alone), with the nested-zone dnsmasq split pinning five names back. A production name on the internal address and a staging name on the public one are served by NOTHING, watched in both directions — so **§21's honest divergence 2 no longer describes this machine and Spec action 1 is unconditional in practice** (approved and applied 2026-09-22). doctor **18 → 19**, verify **51 → 54**, `pnpm test:docker` **178 in 29 → 180 in 30**. **Its headline CORRECTS sitting 1's F3**: a name the split makes unreachable answers **`200` with an EMPTY BODY**, not a TLS handshake error, because Caddy's certificate cache is app-global — **so a status assertion is green whether the split holds or leaks**, which is exactly what Task 4's control (c) exists to prove. **TWO of the plan's own controls could not fail as written**: its crossover check probed `edge.manifest.internal`, a name `[M5]`'s own repair pins to the internal listener, and was MEASURED passing through the very leak it exists for. **SITTING 3 — TASK 4 — IS DONE TOO, 2026-09-20, and §12's claim is now enforced on an APP'S OWN ROUTE rather than only in the edge's configuration**: `applyRoute` writes a production route to `srv1` and a staging route to `srv0`, five new Docker-tier cases put a REAL route on each listener and read `X-Manifest-Instance` back, `edgeIdentityProbe` and `edgeProbe` take a `port`, and the Docker driver passes `config.edgePublicPort` for `environmentKind === 'production'` and nothing else (Decision 15 — the host's split is by ADDRESS, the container's by PORT). `MANIFEST_EDGE_PUBLIC_PORT` defaults to 8443 and `make verify` now holds it equal to compose's `127.0.0.3:443:8443`. `pnpm test` **1390 → 1395**, `pnpm test:docker` **180 → 185** (the predicted 180 + 5), doctor **19/0** and verify **54/0** both UNMOVED — the new assertion went inside an existing check. **Its headline is about CONTROLS rather than the platform, and both halves matter for the rest of this plan**: control (c) went RED where the plan predicted green, because the case asserts the response BODY as well as the identity and both had to be weakened before the control fired — *a control that weakens one assertion measures nothing if a second one catches the same defect*; and **control (b) CANNOT FAIL AT ALL** — removing the driver's `port` spread leaves 1353 unit tests and all 26 driver-contract Docker tests green, because **nothing deploys a production instance through the driver until Task 15**. It also found that `[M5]` names ONE hardcoded `public: 'srv0'` and there are NINE — two of them the Docker tier's own driver factory, which is what Task 15 will use — that three doc comments still described the pre-split world, one in the file the plan calls *unchanged*, and that **`scripts/ci-acceptance.sh` is a FOURTH place the gate numbers live and went stale the first time they moved** (18 and 51 against a machine at 19 and 54), so ORIENTATION §6's sweep table now has a row for it. **SITTING 4 — TASKS 5 AND 6 — IS DONE TOO, 2026-09-20, and §13's GATE NOW HAS REAL ROWS TO BLOCK ON — which is the whole of R1**: migration **0019** adds `approvals`, `iam_registrations` and `privacy_assessments` with §9's submission states, `launch/transitions.ts` holds the two state machines as pure table-driven functions, and an administrator records a real IAM registration and a real PIA over the API with a pasted ticket reference. `launch:record` is Decision 4's new capability, granted to `PLATFORM_ADMIN` alone and **NOT one of D24's four** — so the control is `requireSession` on every route asserting it, enforced by nine matrix rows per route **and by `tsc`**, which refuses `requireActor` because `actor.puid` does not exist on the token branch. **`[M10]` is confirmed in every particular and it would have cost the sitting**: `drizzle-kit generate` emitted the `audit.events` `DROP`/`ADD CONSTRAINT` pair unprompted, so appending the plan's SQL would have made 0019 fail to apply **after its three `CREATE TABLE`s had run** — nothing was appended, and no second guard was built, because `events.test.ts:283` already asserts the constraint out of Postgres. `pnpm test` **1395 → 1449 in 110 files**; doctor 19/0 and verify 54/0 both unmoved. **Its headline is that the plan's own matrix row for `token-other-project` is WRONG** — it says `404 NOT_FOUND` and both record routes answer `403 TOKEN_CREDENTIAL_REFUSED`, because `requireSession` runs before `assertCapability` and the project is never read; that is the RIGHT order, since the alternative tells a token which projects exist, and control (a) proves the row was written for the other one. It also found that **Task 6 says "four routes" and there are three** (the plan's own *Read this first* 18 enumerates seven for all of P6a, of which three are Task 6's); that **an EVENT TYPE is published surface** — five new types turned the OpenAPI drift test red with no route added, which Task 5's file list does not mention; that **Task 6's Step 5 as written would leave `pnpm test` red for six sittings**, because D22's coverage gate wants a console caller and the records screen is Task 17's; and that **`pnpm typecheck` caught what 1449 green tests could not**, the console's `everyCapability` holding the capability list to the document in both directions. **ALL NINE negative controls fired and none could not fail** — the first sitting in this plan where that is true. **SITTING 5 — TASK 7, THE GATE THAT BLOCKS, ALONE — IS DONE TOO, 2026-09-20, AND §13's CHECKLIST IS NOW THE THING THAT GATES PRODUCTION**: `assertLaunchable` in `launch/gate.ts` is ONE evaluation over `computeLaunchReadiness`, called by the deploy route while the read route renders the same computation, so the view a person reads and the thing that refuses them cannot disagree (Decision 2) — and **BOTH** unconditional refusals are gone, the one inside `deployRelease` **DELETED** (Decision 3), which is what makes that function's production path reachable for Task 15. `iam-registration` and `privacy-assessment` read migration 0019's real rows over four and three states, with **`builtBy` gone from both**. **Measured live against `journey-app` through the edge, and this is the deliverable rather than the tests**: with nothing recorded the deploy is refused blocking on FOUR items; an administrator records an `active` IAM registration and an `approved` PIA and the same deploy is refused blocking on TWO — `rehearsal` and `admin-approval` — with the `met` reasons naming what UBC said and the ticket. `pnpm test` **1449 → 1456 passed plus the suite's FIRST SKIPPED TEST**, no new file; `pnpm test:docker` **OWED, RUN and UNMOVED at 185 in 30, 826 s**, which is itself the measurement that no Docker test deploys to production; doctor 19/0 and verify 54/0 unmoved. **Its headline is that the plan's own Steps 2 and 4 CONTRADICT EACH OTHER** — the class cannot both move to `launch/` and keep the `api` family — **and that moving it as written would have made the error code invisible to its own registry**, which is sitting 4's F5 one sitting later, in the same module: `error-codes.test.ts` scans `readonly code = '…'` only under `api/`, and Task 7 deletes the `ReleaseError` that was the registry's only other sighting of that code. It also found that **Task 7 touches five files its list does not name**, one of them `packages/journey/src/main.ts` — so `make demo-journey`, step 9 of the offline acceptance and a step of `make ci-acceptance`, would have gone red; that `releases/releases.test.ts` held the ONLY assertion that the second gate existed, and its replacement is **the first thing in the repository ever to walk `deployRelease`'s production path**; and that `lifecycle.test.ts`'s readiness assertion was true of almost any checklist. **CONTROL (b) FIRED SIX RED ACROSS FOUR FILES where the plan predicted the matrix alone and said the delivery test would stay green** — it asserts the status before the assertion the prediction reasoned about; **control (a) could not fail against all 1456 tests, predicted in advance**; and **control (d) is the second gate SEEN** — `409`, the same code, and **no `launchReadiness`**. **SITTING 6 — TASKS 8 AND 9 — IS DONE TOO, 2026-09-20, AND §20's SECOND AUTHENTICATION ROUND TRIP IS REAL AND PROVED AGAINST THE REAL IdP**: `GET /auth/step-up` sends a signed AuthnRequest carrying `ForceAuthn="true"`, told apart from a sign-in at the shared ACS by its own `manifest_stepup` cookie (Decision 17 — so the IdP's registration does not change), and the callback stamps `steppedUpAt` onto the existing session cookie only when the assertion is for the person already in hand. `assertStepUp` refuses `PRIVILEGED ∪ {release:approve}` to a session that has not re-proved itself inside ten minutes, with `403 STEP_UP_REQUIRED` — the API's FIFTH `403`. **Driven live through the edge rather than only in the tests**: an ordinary session is refused with the remedy in its hint, `/auth/step-up` makes the IdP serve a login form **on the same warm cookie jar that had just signed in** — which is `[M3]`'s control re-fired inside the real flow — the claim lands with `userId`, `puid`, `role`, `issuedAt` and `expiresAt` all unchanged, the same request then answers `201`, and a step-up in which the IdP authenticates a DIFFERENT person is refused with the session left byte-identical. `pnpm test` **1456 → 1496 passed + 1 skipped in 112 files**, two new files; `pnpm test:docker` **OWED, RUN and UNMOVED at 185 in 30, 829 s**, and unmoved is the measurement — **no `*.docker.test.ts` makes a member call over HTTP or drives `/auth/step-up`, so that tier cannot see Task 9 at all**; doctor 19/0 and verify 54/0 unmoved. **Its headline is that the plan's own `assertStepUp` KILLS D24'S CONFIRM-AND-RETRY LOOP**: its first line refuses every token on the stated premise that a token never reaches it, and a token carrying a human-confirmed GRANT does — so all four privileged capabilities became unreachable even after a person said yes, measured as four red in `delegation.test.ts`. The grant is what stands in step-up's place and is the stronger control, and everything else still fails closed, which is what refuses a token holding `release:approve`. It also found that **NEITHER of the two error-class shapes §7e offers fits**, because `error-codes.test.ts`'s scan cannot tell an EXPECTATION from a THROW — `api/authz-contract.ts`'s `{ status, code: 'X' }` constants match its `code: '…'` pattern under `api/` — so the class carries no code and `api/errors.ts` supplies it, which is `TokenCapabilityRefusedError`'s shape in the same file; and that **the guard reddened 48 tests across 7 files rather than the 4 predicted, 29 of them the authorization matrix's own fixture, which builds its collaborator THROUGH THE ROUTE and never read the answer**. **NINE of ten controls fired, four WIDER than predicted and one — Task 8's (e), which the plan calls its most important row and predicts in bold will redden nothing — turning a test red**, because `ForceAuthn` is an XML attribute the unit tier can inflate and read exactly as `[M3]` did; only whether the IdP HONOURS it stays invisible there. **Control (d) COULD NOT FAIL** — every test of the freshness window derived its instants from the constant under test — and was fixed rather than recorded. **F12 was raised open and CLOSED THE SAME DAY by Rich's decision**: a person CONFIRMING a pending action now needs step-up, because `answerable()` already requires them to hold the privileged capability themselves, so confirming is exercising it by proxy — while REJECTING stays free, since it grants nothing and stops an agent. **The exposure was re-measured before deciding and the sitting's own first framing was wrong in the direction that would have justified inaction**: a stolen session needs NO second credential to reach the confirm route, only a question already in the queue, which is the normal state of the system for a day. **A second gap was found the same way and is tracked to Task 15**: `release:promote` is in `STEP_UP_GUARDED` and NO route enforces it — unreachable today because §13's checklist refuses every production deploy, and Task 15 now carries a correction block with the exact change. **SITTING 7 — TASKS 10 AND 11 — IS DONE TOO, 2026-09-20, AND `release:approve` HAS A CALLER**: it has existed as a capability since P5b and no route had ever asserted it. Three routes now do — `POST /v1/releases/{id}/approve`, `.../reject` and `GET .../approval` — behind four guards in order: `requireSession` (D14, enforced by the return type), `release:approve`, `assertStepUp` (§20, AFTER the capability so somebody who may not approve is told THAT rather than sent on a round trip), and the BUILD's immutable image digest, which is §13's binding. The record is INSERT ONLY, the event carries the truncated digest and never the diff, and §13's `admin-approval` item reads the row across five states instead of saying `not_built`. **Decision 7 is DRIVEN rather than reasoned about**: a server whose LiteLLM client rejects every call answers the approval **`201` with `summary: null`, `summarySource: 'unavailable'` and the diff still in the record**, while the control for it answers `503 AI_BACKEND_UNAVAILABLE` — the shape Decision 7 exists to refuse, on the wire. `pnpm test` **1496 → 1544 passed + 1 skipped in 114 files**, two new files; `pnpm test:docker` **OWED, RUN and UNMOVED at 185 in 30, 823 s** — and unmoved is the measurement for the THIRD sitting running, checked by grepping all thirty `*.docker.test.ts` for the approval, which returns one hit and it is a test NAME; doctor 19/0 and verify 54/0 unmoved. **Its headline is the CONTROLS: nine run, SIX fired, THREE could not fail — and two of those three paid for themselves immediately.** Task 10's control (e) could not fail as written, because the test sent no `reason` key at all and `strictObject` refuses that whatever `min(1)` says; writing the case it was aimed at found **a live defect** — a rejection reason made of spaces satisfied the schema, reached Postgres and was refused by `approvals_rejection_has_reason`, which through `mapError` is **`500 INTERNAL`**, a client error wearing a server error's clothes (fixed: the schema trims before it counts, and `openapi.json` is unchanged because `.trim()` has no JSON Schema form). Task 11's control (c) **could not fail against the test the plan names for it** — the substituted digest differed at the first character, so a prefix comparison caught it too, and only the unit test the plan separately asks for saw the defect. Task 11's control (d) **cannot fail in this tier at all**, exactly as predicted: both sorted lists are EMPTY in the fixture, so every ordering is sorted, and the test now says so in an assertion. It also found that **the plan passes `deps.ai` to `summariseChanges` and `deps.ai` has no `post`** — it is §10's key LIFECYCLE, and the `LiteLlmClient` it is built from was on nothing in `ServerDeps`, which now carries `llm`; that **Decision 11's rebuild branch is UNREACHABLE through the platform**, because a release's `build_id` is immutable and `builds.image_digest` is written exactly once, so a rebuild is a new release reading *"has not been reviewed yet"* and never *"was rebuilt"* — the branch stays for §13's claim and for Task 15's reachable caller, and the test writes the digest directly and says so; and that **control (b) does NOT make `[M6]`'s finding live** — `tsc` refused it outright, which is **Decision 18's claim measured**, and forced past with a cast the token is still refused, `403 STEP_UP_REQUIRED`, by `assertStepUp`'s own first line, so sitting 6's *belt and braces* is now measured rather than argued. `RELEASE_NOT_FOUND` was dropped from the plan's `errors:` list because a distinct code for *"no such release"* is an enumeration oracle in the published contract. **SITTING 8 — TASKS 12 AND 13 — IS DONE TOO, 2026-09-20: R4'S SEAM HAS A CALLER AND §7'S LAST PRODUCTION CLAUSE IS ENFORCED, IN TWO PLACES.** `launch/review.ts` is Decision 12's `Reviewer` with an honest `NullReviewer` (`not_performed`, naming itself); `ServerDeps.reviewer` is typed as the interface and built once at boot; `buildDiffSnapshot` asks it about the release's OWN build and stores the verdict; and `code-review` is the checklist's LAST item, `blocking: false`. A build asking for a CWL attribute UBC IAM did not register FAILS before the driver runs, the reason its log's last line. `pnpm test` **1544 → 1565 passed + 1 skipped in 117 files**. **Its headline is a HOLE the plan's design leaves**: the build can only check a registration that exists when it runs, and §9 makes the other order NORMAL — build for staging for weeks, then IAM answers — so the release §13 would promote without rebuilding was never checked, and `iam-registration` read `met` on `active` alone (**measured `met` for a candidate asking for `sn` against `[ubcEduCwlPuid, mail]`**). The item now reads the candidate's attributes through the rule's one statement, `unregisteredAttributes`. **And §7's check was not new**: `spec/policy.ts` has carried it since P2 behind a context field no caller of `validateSpec` ever passed — the fifth *module with no caller* — so the dormant branch is deleted and the build-time error throws the code the contract has published since P2, rather than the plan's second spelling. It also found that the plan's caller calls a helper that does not exist (`repoPathFor`), that Decision 13's test cannot run until Task 14 builds `rehearsal` (so `readyOf` is exported and the other items are forced met), that `[M4]`'s missing-id failure is a silently DROPPED checklist on the `409` rather than a `500`, and that sitting 7's hand-off over-predicted `main.ts` going red. **All nine runnable controls fired as predicted; the PLAN's prediction for Task 12's (d) did not hold**, because this sitting put two more `tsc` layers under `describeVerdict`. Tasks 14 and 19 now carry a sitting 8 correction block. **SITTING 9 — TASKS 14 AND 15 — IS DONE TOO, 2026-09-20, AND THIS PLATFORM HAS PUT AN APPLICATION INTO PRODUCTION.** `journey-app` answers `https://journey-app.manifest.internal/` on **127.0.0.3**, §12's public listener, as the instance the deploy started — with all SIX blocking items honestly met, while the same name on 127.0.0.2 answers `200` with **no instance header**. Migration **0020** adds `rehearsals`; `POST /v1/projects/{id}/rehearsal` deploys the candidate into production behind the gate, reads the Service Provider values back off the `sso.registered` event the registration itself wrote, completes a real CWL sign-in from a probe container and records pass or fail with the evidence; §13's third item reads that row and says in R2's own words that it proves the registration's SHAPE and never UBC's acceptance of it. `deployRelease` verifies the approved digest **before anything starts** (`RELEASE_DIGEST_NOT_APPROVED`), and the production branch of the deploy route calls `assertStepUp(actor, 'release:promote')` — sitting 6's set member, which had no caller. `pnpm test` **1565 + 1 skipped → 1598 passed, 0 skipped, 118 files**: `api/delivery.test.ts`'s production positive control is UN-SKIPPED, and it is where Decision 13 is seen end to end. **Its headline is that §8 SENDS A PRODUCTION APP TO REAL UBC SHIBBOLETH, so R2's rehearsal could not pass on this laptop at all** — the probe followed `/login` to `authentication.ubc.ca` and failed TLS against the platform CA, which no test could have found: the Docker tier's app has no CWL login, and every unit test asserts production is UBC, which it is. `InjectionContext.purpose` makes a rehearsal deploy production in every respect but the IdP it is pointed at. **The plan's own Task 15 refuses its own Task 14** (the digest check would refuse a rehearsal that precedes an approval, which is the order §13 and Task 19 both use), so `DeployInput.purpose` defaults to the CHECKED value and the rehearsal is the one exemption. **Control (c) DID NOT FIRE and was worth all the others**: a rehearsal that deployed to STAGING recorded *"production, public listener"* and all seven Docker tests stayed green, because the evidence was derived from intent rather than from the instance — fixed, and the control fires now. **`make demo-journey` went red on three checks** the moment the step-up call site landed, which `make ci-acceptance` and the offline acceptance both run. **SITTING 10 — TASKS 16, 17 AND 18 — IS DONE TOO, 2026-09-20, AND AN APPLICATION REACHED PRODUCTION THROUGH THE CONSOLE, CLICKED**: Rich typed the password twice (sign-in, and the step-up re-prompt) and the agent drove the records along §9's arrows, the rehearsal rendered as its measurement, an approval refused `403 STEP_UP_REQUIRED` with the link that does it, and *Deploy to production* — `127.0.0.3` then answered as the healthy production instance. §13's five *Integrity of the gate* claims are all falsifiable, and **`DELIBERATELY_UNCALLED` is EMPTY — all 41 operations have a caller.** `pnpm test` **1598 → 1604 in 119**, `pnpm test:docker` **192 → 194 in 31**, verify **54 → 55** (the registry's realm), doctor 19. **Its headline is that NO CLIENT CAN SHOW THE DIFF BEFORE THE DECISION** — `buildDiffSnapshot` runs inside the approve call — raised for Rich in ORIENTATION §8 and handed to P6b. **Clicking found a live defect no gate could see**: every deploy reloaded every open `vite dev` console, so the rehearsal lost its own answer — one Caddyfile line, fixed and measured both ways. **The realm test's registry half could not fail**, signing with a key the registry never trusted. **SITTING 11 — TASK 19, THE ACCEPTANCE — IS DONE, 2026-09-22, AND P6a IS EXECUTED**: `make demo-production` is green on the fresh path, the re-use path, from an `echo reset \| make reset` machine and on the final code; it is step 11 of the offline acceptance and the last step of `make ci-acceptance`; and **Rich clicked a whole launch through the console**, typing the password twice. `pnpm test` **1604 → 1605 in 119**. **Its headline is control (e), which stayed GREEN because of a live fail-open**: `applyRoute` patched an existing route in place, so a production route kept whatever listener held it — fixed, and watched moving both ways. **Clicking found two console defects no gate could see** (a checklist that did not notice a deploy, and literal markdown), both fixed. **The builder is reproducible** — the same commit rebuilds to the same digest — so Decision 11's premise is false here and the approval is bound to a RELEASE, not a digest; P6b inherits that. **Rich decided the diff question the same day: a stored preview the approval binds, in P6b.** | the public listener made real (§12), production environments, promotion by verified digest, the `LaunchReadiness` **gate** that blocks (P5 ships only its read-only view), `IamRegistration` and `PrivacyAssessment` **as tracked objects with manual state transitions** (Rich, 2026-09-19 — generation stays P8's), the D21 rehearsal, admin approval with step-up re-auth, gate integrity (§13), and the **`Reviewer` seam** — an interface, an honest `NullReviewer` and a NON-blocking checklist item, so code review can be built in later without unpicking anything (2026-09-19). **Demo:** `make demo-production` — an app reaches production, every blocking item honestly met. **Rich chose ELEVEN sittings on 2026-09-19, the LEAN of three splits offered** (thirteen recommended, sixteen cautious), with its three costs stated: sitting 6 builds a second authentication round trip AND applies it; sitting 10 is three tasks including both console screens; sitting 9 pairs the rehearsal with the first production deploy the rehearsal depends on. **The plan raised THREE spec actions — ALL THREE approved and applied on 2026-09-22** — §21's divergence 2 (conditional on the listener split landing), §20's step-up list naming `release:approve`, and §13's *Residual risk* saying **five** sensitive fields where §7 says **seven**. **Writing it found two things from the code the brief did not have**: there are **TWO** unconditional production gates, not one — the route's and `deployRelease`'s own — so a plan replacing only the outer one ships a production deploy that still refuses; and **`release:approve` is not one of D24's privileged four**, so a platform admin can mint a delegated token holding it, which would have let an agent approve a production release the day that capability got its first route |
| **P6b** | *(Findings counts for every sitting are in the defect-rate table below — this row states none.)* **Subsequent releases** — **WRITTEN 2026-09-22 — [eleven tasks](./2026-09-22-p6b-subsequent-releases.md); its SITTING 1 (Task 1, the measurements, alone and first) IS NEXT.** **Rich answered its three questions on 2026-09-22**: **SEVEN sittings** (the lean split; eight was recommended); **removing a CWL attribute does not wait for IAM, adding one does** (which approves the plan's one spec action, on §13 D9.2's sentence, in substance — **not yet applied**); and **a sensitive change never returns an approved PIA to `draft` automatically**. **Writing it found six premises false in the code**, each now a Task 1 measurement: `isSensitiveDiff` cannot see a raised production override; the baseline counts a release approved and then rejected; a release freezes the project's NEWEST spec rather than its build's, and accepts another project's build; a rehearsal after launch puts an unapproved release on the live public listener; the gate evaluates the candidate and deploys whatever release is named; and recording an IAM change request overwrites what UBC registered. **Its design**: "launched" is stored (`projects.launched_at`, written once by the first healthy launch deploy); one rule, `approvalRequirementFor`, read by the checklist and by `deployRelease`, compares the release's frozen PRODUCTION config with the last APPROVED release; the gate answers `RELEASE_REESCALATED` or `RELEASE_NOT_STAGED` beside P6a's code; the stored preview binds facts and never the model's words; the IAM change request is the registration's own `change_requested` state; the person-only class is one central rule with its own code (`TOKEN_PERSON_ONLY`); and the contract goes to `1.1.0`, covering P6a's seven additions too. **Acceptance:** `make demo-releases`. *Its inputs, as recorded before it was written:* **It inherited Rich's 2026-09-22 decisions — build the PERSON-ONLY class (`release:approve`, `launch:record`: no token may hold them, no pending action grants them), and §13 names no number of sensitive fields — and, from P6a's execution (2026-09-22):** (1) **Rich's decision — the administrator sees the diff BEFORE deciding, as a STORED preview the approval binds** (the approve request names the preview; the platform refuses if what it would store now differs); (2) **an approval is bound to a RELEASE in code and to a DIGEST in §13**, and the builder is reproducible, so an identical rebuild is a new release needing a new approval — decide which one re-escalation reads; (3) the `code-review` checklist item never reads the reviewer's verdict, which the first real reviewer will need; (4) `make demo-production` re-uses `launch-app` and so is P6b's natural starting state. | D9.2: self-serve production redeploys, sensitive-diff re-escalation (`isSensitiveDiff` gets its first caller), the `diff_snapshot` and its **security-aware** AI summary carrying the reviewer's verdict, and the `auth.attributes` → IAM change-request path (§9). **Demo:** a self-serve redeploy, then a sensitive change refused until approved. **D5's GitHub source driver is placed immediately after this plan** — see below for why the ordering is a security argument rather than a dependency |
| P7 | Custom domains | §23 end to end: `Domain` lifecycle, CNAME + TXT verification, certificate issuance, the upload path, expiry alarms, D27's ordering constraint. **Depends on P6a's public listener.** *Can a custom domain be proved on this laptop? Read from the config on 2026-09-19 — see the note below the table: yes, cheaply, except for real ACME issuance* |
| P8 | Launch package generation | §9 and D19: the IAM registration package via `saml-metadata-generator`, and the PIA draft. **The two tracked objects themselves moved to P6a on 2026-09-19** (Rich's decision, P6 brief §5 R1) — P8 GENERATES what they carry, and §9's own *"submitted by a human, with a ticket reference pasted in"* is what P6a builds first, the manual driver of the same state transition (D5, D10) |
| P9 | Audience & capacity | §24: the tiers' production effects, pre-warming for `burst: synchronised`, the load rehearsal, upgrade requests through the admin queue |
| P10 | Showcase & forking | §27: publishing, the fork operation, and D32's not-copied list — which is the whole of its security argument |
| P11 | Admin console | §26: the queue as the primary screen, fleet, people, spend, health and risk, audit; built on admin-scoped endpoints of the same public API (D31) |

Dependencies among these are real but shallow: P6 is a prerequisite for P7, P8 and
P9; P10 and P11 depend on P6 only. P8 should start earliest of the four that follow
P6, because it feeds the external track below. **P6 became P6a and P6b on 2026-09-19**,
split on D9's own two clauses (*first launch*, then *subsequent releases*) so that each
half demos on its own; only **P6a** is a prerequisite for P7, P8 and P9.

### P7's local proof — feasible and cheap, except for the half that is not

*Rich asked on 2026-09-19 whether a genuinely different URL — something outside
`.manifest.internal` — is possible locally, so that custom domains are known to be feasible
before P7 is written. **Read from the machine's configuration that day; NOT measured.** The check
is ten minutes and belongs in P7's Task 1, like every plan's measurements since P4c.*

**Three additions, and none of them is hard.** The machine already does exactly this for one
zone:

1. **A resolver file.** `/etc/resolver/manifest.internal` is two directives — `nameserver
   127.0.0.1` and `port 7153`. A custom zone is one more `install` line in
   `infra/host/host-setup.sh`, plus the matching `rm` in `host-undo.sh`, which already verifies
   its own removal.
2. **A dnsmasq rule** on `dns-host`, beside `--address=/manifest.internal/127.0.0.2`, pointing the
   new zone at **the public-listener alias P6a adds**. That is the correct target by construction:
   §23 makes a custom domain production-only and public-listener-only.
3. **Nothing at all for certificates.** Every Caddy site here is `tls internal`, and
   `make host-setup` already trusts Caddy's CA in the System keychain — so Caddy mints a
   browser-trusted certificate for *any* hostname on demand.

**THE ONE HARD CONSTRAINT, and this project already paid for it.** `host-setup.sh`'s step 2 says
in its own comment: *scoped to `manifest.internal` — **NOT to all of `.internal`**, which would
break Docker's own `host.docker.internal` and `gateway.docker.internal`.* So scope any new zone to
a **second level**, never a bare TLD. Two names on this machine are already taken: **`.test` is
Laravel Valet's and is never to be touched**, and a `vibonarium.local` resolver exists — which is
also the reason to **avoid `.local` entirely**, since macOS special-cases it for mDNS.

**Suggested name.** A second-level zone under **`.example`**, which RFC 6761 reserves permanently
so it can never be delegated to anyone — for instance `chem-labs.courses.example` beside the
canonical `chem-labs.manifest.internal`. It reads like a department vanity domain in a demo and
cannot collide with a real one. `.localprod` would work too, but an unreserved TLD is a habit that
eventually meets a real delegation.

**What this proves:** a name **outside the platform's own zone**, which the platform does not
control by construction, arriving on the public listener; the canonical hostname still serving
beside it (D26); the refusal of a custom domain on sandbox or staging, which §23 requires the API
to reject rather than quietly ignore; D27's ordering constraint; and **the certificate-upload
path**, which is fully testable locally.

**What it does NOT prove, and P7 should decide what to do about it:** D28 makes verification and
certificate issuance *the same event*, because the CNAME means the ACME challenge is reachable —
traffic already arrives at the edge. Locally there is no ACME and no public CA; Caddy's internal
CA simply issues. **So the real issuance path stays unexercised** unless P7 chooses to run a local
ACME server, which is its own decision with its own cost.

**And one part is honest theatre:** proof-of-control is circular, since we would own the zone
whose control is being proved. But dnsmasq serves TXT records, so the *code path* — the platform
asks for a token, an operator publishes it, the platform verifies it — is genuinely exercised.
**That is the same shape as P6a's rehearsal** (P6 brief R2): it proves the mechanism, never the
external fact, and it should be written down as such rather than discovered.

### Tracked hardening items — small, not a plan of their own

Security hardening the spec now *describes* but no code yet *enforces*. Each is here
so it is not lost between plans, and because a spec rule with no caller is this
project's most-repeated defect. **A plan that touches the named module should fold the
item in and delete its row.**

| Item | Spec | Enforce in | Needs | Why it is not done yet |
|---|---|---|---|---|
| **`egress.allow` may not name a platform surface** — the platform zone (`*.manifest.internal`, UBC's zones) or a `manifest-*` service. Refuse at validation as `EGRESS_ALLOW_INVALID`. | §12 *Egress* (applied 2026-09-16) | `spec/` validation, reusing the reserved-label set; the syntactic check is `runtime/docker/egress.ts`'s `renderAllowlist` today | **P5a Task 9's reserved-label loader** (`projects/reserved-labels.ts`), plus the environment zones | Rich's call (2026-09-16): its own hardening item, built **after P5a executes** so the loader exists. Measured exposure: P5a Task 1 `[M2g]` — the dual-homed egress proxy tunnels raw TCP to any name it resolves on `manifest-platform`, so a declared `manifest-postgres` reaches the platform DB across the east-west boundary. Defense in depth behind the edge's source check (§21), which already refuses the console leg. |
| **Static analysis of app code — `SemgrepReviewer`** — the second implementation of the `Reviewer` seam P6a defines. Offline (C1 forbids a cloud service), **advisory before blocking**. | **D33 and §15** (applied 2026-09-19); §12 deliberately unchanged | `build/`, beside `scan.ts` and `gates.ts` | **P6a's `Reviewer` interface**, so this is one implementation and not a new seam | Rich's call (2026-09-19): tiers 1 and 2 of the code-safety question are wanted, and this is tier 2. It is NOT P6 scope — P6a ships the seam and the honest null implementation, and §20's control map row stays *accepted, with a named plan* until something real lands. A static analyser pointed at AI-written code will find a great deal on its first run, which is why §12's own *block on what a rebuild can clear* rule applies here from the start. |

### The authoring API — BRIEFED 2026-09-19, PLACED 2026-09-22: after the GitHub source driver, which is after P6b

**Rich, 2026-09-22:** its own Phase 2 plan, in the order **P6b → D5's GitHub source driver → the authoring slice**; **text files only in v1**; the front-end project is specced against the slice rather than waiting for sandboxes; **S5 is not scheduled until after it**. The slice writes through `SourceDriver`, which the GitHub plan gives a second implementation and puts the build path behind, so the write path is designed once. The cost — a front-end team waits one plan longer — was stated and accepted.

**Not in the plan set, and that is the open question.** §17 bundles authoring with sandboxes in
Phase 3, and Phase 3 is blocked on S5 — but
[`2026-09-19-authoring-api-brief.md`](./2026-09-19-authoring-api-brief.md) measured the split and
found that **most of what a front end needs does not touch S5 at all**: committing files to a git
repository and writing `manifest.yaml` are control-plane git operations, not sandbox operations.

The brief's finding in one line: **an app can be deployed through the API and cannot be created
through it.** The contract is 23 `GET`, 9 `POST`, 2 `DELETE` and **zero `PATCH`/`PUT`**; it carries
no repository reference at all; and `validateSpec` reads `manifest.yaml` rather than writing it.
The write primitives mostly exist and are unexposed — `commitFiles` is traversal-safe, D13's
overwrite of an app-supplied `Dockerfile` is tested with a hostile fixture, and `exec` is
implemented in both drivers, **called by nothing and not covered by the driver contract suite**.

**Sized at 8–14 tasks for the no-S5 slice.** Five decisions are Rich's (the brief's §6), the first
being whether it becomes its own plan and where it sits. **One ordering dependency is real**: a
spec write path makes D9's sensitive-diff re-escalation load-bearing for the first time, and P6b
is what builds it. **This is one of two instances of the same rule** — see *D5's driver 2* below:
*anything that widens who can change a spec goes after the gate that inspects spec changes.*

### D5's driver 2 — the GitHub source driver. PLACED AFTER P6b, 2026-09-19

**Fully specified, and until now owned by no plan.** D5 names it (*"driver 1 is local bare repos,
driver 2 is a UBC GitHub org"*), §5's module map lists `source/  git provider drivers (local,
github)`, and **§20's *Git driver* subsection specifies its security properties in detail**:
a **GitHub App** whose private key is held *"in the same custody class as the master key"*, with
**installation tokens that are short-lived and scoped per repository**; webhook payloads verified
by HMAC; **repositories private by default and enforced private**; push-time secret scanning on
both drivers; and a sandbox git credential that can push to exactly one branch of one repository
and never `main` (D14). Nothing about the mechanism is an open question — only its placement was.

**PLACED AFTER P6b (Rich, 2026-09-19), and the reason generalises.** There is **no technical
coupling in either direction** — measured: `isSensitiveDiff(before: ManifestSpec, after:
ManifestSpec)` works on parsed specs, and `releases/`, `launch/` and `spec/` do not import
`source/` at all. The ordering is a security argument instead. **GitHub widens who can change
`manifest.yaml`**: today that needs filesystem access to the bare repos on one laptop, and
afterwards it is everyone with write access in the org — the faculty member, their agent, a TA, a
leaked token — any of whom could change `auth.attributes`, `egress.allow`, `services`,
`data.classification` or `ai.models`, five of §7's seven sensitive fields. **P6b's sensitive-diff
re-escalation is the control that catches exactly that**, so shipping this first would open a
window in which the exposure is real and the gate is absent.

> **The rule this establishes, because it is the second instance and not the first:** *anything
> that widens who can change a spec goes after the gate that inspects spec changes.* The
> [authoring API brief](./2026-09-19-authoring-api-brief.md) reaches the same conclusion from the
> opposite direction — a spec WRITE path wants P6b first for the identical reason. Two unrelated
> features, one ordering constraint.

**THREE FINDINGS THAT MAKE THIS SMALLER THAN IT SOUNDS**, read from the code on 2026-09-19:

1. **The builder does not use the source driver.** `ContextInput` is
   `{ repoPath: string, commitSha, blueprintDir, workDir }` and `assembleContext` runs
   `git archive` against a bare repository on disk; nothing under `build/` imports `source/`. So
   **a GitHub driver that keeps a LOCAL MIRROR leaves the build path untouched** — offline builds
   keep working, C1 holds, and §13's *same source → same digest* determinism is undisturbed.
   GitHub becomes the durable, reviewable copy and the CI trigger rather than the build's source
   of truth. *Rejected alternative:* growing `SourceDriver` an "export tree at commit" method and
   downloading a tarball, which is a cleaner abstraction and puts the network on the build path.
2. **The interface exists but the build path is not behind it**, which is the seam to fix
   whichever option is taken. "We already have a driver interface" is true and slightly
   misleading.
3. **Use TWO App registrations, not one.** An App's private key mints tokens for **every**
   installation of that App, and generating a second key does not isolate anything. So a single
   "Manifest" App installed on both a developer's account and the UBC org means **a laptop key
   that can mint tokens for production repositories**. One registration per deployment —
   `Manifest (local dev)` owned by the developer with its key in `infra/secrets/`, and `Manifest`
   owned by UBC with its key in Vault/KMS — makes that impossible by construction rather than by
   policy, and matches what §20 already says about where the master key lives in each environment.

**Two more things settled on the way.** **A dedicated GitHub org for manifested apps** rather than
UBC's main one: 500 course repositories would drown it, the App needs `administration: write` to
create repositories and that is far safer scoped to a purpose-built org, slug collisions stay
contained, and archival policy for finished courses can differ. And **the GitHub driver must stay
OPTIONAL locally** — C1 requires the platform to run on one laptop offline after `make seed`, so
driver 1 remains the default and `make demo` must keep working with no GitHub at all. That also
disposes of webhooks: the local App registration has no webhook URL and builds stay **pull-based**
through the API exactly as they are today, which C1 requires anyway since there is no public URL
to deliver to.

**When it becomes load-bearing rather than merely useful:** §13 says *"Everything reaching UBC
staging or production is built by CI on the target architecture"*, because laptops are arm64 and
UBC is x86-64 — and CI needs a git host. So this and *Toolchain decisions*' GitHub Actions row are
effectively one milestone; that row calls CI *"the only legitimate source of promotable images"*
(this document's phrasing, not the spec's) and says it *"binds at Phase 5"*. **The local proof needs none of it**: the platform
already goes bare repo → build → release → deploy → URL, offline, end to end.

**The one argument for doing it EARLIER, recorded rather than hidden:** §13's `diff_snapshot`
would naturally carry a commit or PR link if GitHub already existed, and an approver would want
one. Building GitHub afterwards makes that one field added later — minor and retrofittable, and
not worth reordering for.

### Phases 3–5 — not planned

Deliberately. **Phase 3 depends on S5, which is unrun** — S6 reported on 2026-09-07 (as P3
Task 18) and found container isolation adequate for staging and production apps, while §12 leaves
**the sandbox question open until S5**. Phase 5 is blocked on a UBC decision — RHEL 9 VMs or Kubernetes — that has not been
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
4. **Write P1, P2 and P3** with real findings in them. **All three are written, and P1 and P2 are executed** —
   P1 on 2026-08-30 (13 tasks), P2 on 2026-08-31 (21 tasks), P3 on 2026-08-31
   (19 tasks, self-reviewed 2026-09-04).
5. **Execute P1 → P2 → P3.** ✅ **All three are done.** P1 and P2 executed and green
   on 2026-09-05, P1 green offline too; **P3 finished 2026-09-07, all 19 tasks**. S6
   ran as its Task 18 and has reported. **P4a is EXECUTED IN FULL — all 15 tasks,
   2026-09-09 — and P4b is EXECUTED IN FULL too — all 16 tasks, 2026-09-15. P4c is
   EXECUTED IN FULL too — all 11 tasks, 2026-09-16 (step 7).**
6. **Start the external track once the local proof of concept works end to end.**
   **Changed 2026-09-05, Rich's call.** This step previously said *"start now, in
   parallel"*, on the argument that C4 has the longest lead time and no software
   dependency. That is still true, and it is deliberately not being acted on: the
   goal is to get this right rather than to get it started, and a registration
   conversation with UBC IAM goes better with a working end-to-end demonstration
   behind it than with a design document. **Not a rush; not forgotten.** The
   trigger is the local PoC running end to end — P4's proof app: CWL login, a Mongo
   write, an LLM answer. **Two of those three landed on 2026-09-09**, with P4a's
   Task 15: `make demo-identity` signs a real person in with CWL and stores a
   per-user note. The LLM answer is P4b's, so **the trigger is P4b's Task 16 and
   not this one** — recorded here so a reader does not mistake a half-met trigger
   for a missed one. **THE TRIGGER FIRED ON 2026-09-15**: P4b's Task 16 completed the
   third — `make demo-ai`, including from a `make reset` machine — and it was raised with
   Rich that day. Starting the track is his call; `docs/external-track.md` says so, and
   nothing in it has been raised.
7. **Write P4 once P3 has executed**, and P5 when P4 lands. **P4 was split into P4a
   and P4b on 2026-09-07 (Rich's call), and P4a is WRITTEN** —
   [`2026-09-07-p4a-identity-secrets-injection.md`](./2026-09-07-p4a-identity-secrets-injection.md),
   15 tasks. **ALL 15 ARE EXECUTED AND GREEN — 1–5 on 2026-09-08, 6–15 on
   2026-09-09.** **P4b IS EXECUTED TOO — all 16 tasks, 2026-09-15.**
   **P4b was then written on 2026-09-07 as well, at Rich's request** —
   [`2026-09-07-p4b-ai-events-streaming-incidents.md`](./2026-09-07-p4b-ai-events-streaming-incidents.md),
   16 tasks. **This departs from the decision recorded immediately below**, which
   said P4b stays unwritten until P4a runs, on the evidence that P3 cost eight
   defects reconciling against an imagined P2. That reason has not gone away, so
   the plan answers it rather than ignoring it: **P4b's Task 1 is a reconciliation
   pass** against the executed P4a, with a named checklist of every P4a symbol,
   file and table it consumes. Writing P4b also found **three ambiguities in P4a**
   — an untyped `InjectionContext`, a `parsedSpec` with no stated provenance, and a
   redactor with no stated source — and **those were fixed in P4a itself** rather
   than worked around in P4b, which is the one unambiguous benefit of having written
   the second plan early. **The unexecuted stack is now 17 tasks** — P4a's remaining 1 and
   P4b's 16 — which is the cost this decision was made to avoid, and it is recorded
   here rather than left implicit.
   ✅ **Then P4c, before P5 (Rich, 2026-09-14): zero-downtime redeploys — WRITTEN 2026-09-15,
   11 tasks in eight agreed sittings, AND EXECUTED — FINISHED 2026-09-16 WITH SITTING 8, THE
   ACCEPTANCE (12 findings; four of its nine controls could not fail in it, and each was watched red
   where it can). Sittings 1 to 7 before it
   (2026-09-15; 13 findings, 4, 7, 6, 9 and 10 — the acceptance built and watched failing with
   the baseline it is judged against, §11's redeploy contract in code, the edge and an
   `ensureInstance` that starts beside what serves, the retire that reaps what it
   replaced, §6's `Route` record with the retirer that decides what to reap, and then
   **the caller for all of it**: `deployRelease` serialized per environment, and boot
   recovery; and sitting 7, on 2026-09-16 with 9 findings, sessions in the app's own Mongo.
   `make demo-redeploy` 21 of 21 green, up from a baseline of 10).** ✅ **Then P5a, written 2026-09-16 — 17 tasks in twelve agreed sittings, its six spec actions applied (`491f8be`); sitting 1, the measurements, done the same day with 9 findings, and sitting 2 — the API under `/v1`, through the edge at `https://console.manifest.internal` — with 16, and sitting 3 — CSRF by `Origin`, a sign-in bound to its browser, the error-code registry — with 15, and sitting 4 — `defineRoute`, the OpenAPI document generated from it and its drift test — with 7, and sitting 5 — the generated client and `make demo-journey` — with 4, and sitting 6 — public representations and the slug check — with 13, and sitting 7 — starters, the knowledge pack, and a project created from a starter for a stated audience — with 18, and sitting 8 — the event stream in the contract — with 15, and sitting 9 — builds that answer `202` and end on the stream, with §12's scan recorded on each — with 18, and sitting 10 — releases, deploys and Incidents as representations, every `/v1` route now a definition, and the instance's states stored and streamed — with 10, which took `make demo-journey` through §22 step 6, and sitting 11 — `LaunchReadiness` computed and read-only, the first administrator out of band, and §26's fleet — with 13, which took it through step 8, and sitting 12 — the acceptance, green three times and the third from a `make reset` machine — with 8. **P5a IS EXECUTED, 2026-09-17**, and **P5b was WRITTEN the same day** — 13 tasks in nine sittings — **whose sitting 1, the measurements, ran on 2026-09-17 with 11 findings and corrected five of its tasks, and whose sitting 2 — the privileged set, `release:promote`, and the two token tables — ran the same day with 14 findings, and whose sitting 3 — minting a token in an interactive session, then bearer authentication, one hook and two credential classes — ran the same day with 15 findings, and whose sitting 4 — D24's central refusal, and the `PendingAction` a human confirms — ran on 2026-09-18 with 10 findings, and sittings 5 to 8 the same day — confirm, reject and the one-shot retry (12); §26's queue, member removal and per-token rate limits (12); expiry and the matrix's four token actors (15); and `make demo-token`, D24's loop end to end through the edge (16) — and sitting 9, the acceptance, green three times and the third from a `make reset` machine, with 8**. **P5b IS EXECUTED, 2026-09-18 — 13 tasks, nine sittings, 116 findings; its four spec actions were applied on 2026-09-17.** ← **P5c — the clients — IS EXECUTED (2026-09-18/19): [all 14 tasks in nine sittings](./2026-09-18-p5c-the-clients.md), 107 findings, from [the P5 brief's §10](./2026-09-16-p5-brief.md) — and PHASE 1c IS COMPLETE. Its sitting 1 closed §8's `stream_close_delay` question by measurement; its sitting 9 proved §16's Acceptance tier two ways and then found and fixed the SLO binding defect. ✅ **P6a IS EXECUTED — 2026-09-19 → 2026-09-22, [all 19 tasks in the eleven agreed sittings](./2026-09-19-p6a-first-production-launch.md), from [the P6 brief](./2026-09-19-p6-brief.md): an application reaches production through §12's public listener with every blocking item honestly met, and `make demo-production` proves it headlessly while a person has clicked it. ← P6b IS WRITTEN (2026-09-22) from P6a's record, the pattern P5a–P5c used, and its sitting 1 is next.** (P5 became P5a, P5b and P5c on 2026-09-16; P5c was written after P5b executed.) It waited for P4b to execute, because P4b's Tasks 8–15 were changing the deploy
   path it replaces; that path is now finished. The plan table's P4c row is its brief — including
   the five things it must settle, first among them a measured baseline — and P4b's sitting 10
   adds two inputs: an AI app whose gateway vanishes under a pooled connection waits 611 s
   (finding 181), and every redeploy's leaked container stays attached (189).

### Decided 2026-09-04: execute before writing P4

**The intent until now was to write every remaining plan before executing any of
them. That is changed. P1 executes next, and P4 is not written until P3 has run.**
Rich's call, on this evidence.

*Why.* The first lesson above already said to execute a cheap representative slice
early rather than bank a large unexecuted stack, and nothing had acted on it. The
measurements are one-sided:

- **P2 is now fully measured, and the rate did not fall.** 21 tasks, executed in
  three sittings, produced **7** defects on paper and **51** in execution — 5 from
  Tasks 1/9/10/11, 20 from Tasks 2–8, 27 from Tasks 12–21. The last batch is the
  most useful, because it is the first time this project executed tasks that touch a
  *framework*: six of those 27 were type errors **no test could catch**, since Vitest
  strips types without checking them, and five were test-isolation defects that made
  the suite pass or fail depending on the order Vitest happened to pick. **Two were
  one edit from a live authentication bypass or a live IDOR**, and both read in
  review as "check the thing".
- P2's written self-review found **seven** defects. Executing **four** of its
  twenty-one tasks then found **five more**, and **not one of the five was findable
  by reading**.
- P3's self-review has just found **seven** more. The worst of them was a driver that
  no task ever wired into the boot entry point — which would have let this plan's
  entire acceptance, `make demo` included, pass against an in-memory fake.

Three written plans is 53 tasks, of which **49 had never been run** when this was
written (P2's Tasks 1, 9, 10 and 11 were executed and green). That is a stack
carrying a defect rate measured exactly once, at five per four tasks. Writing P4
would add to it rather than price it. *As of 2026-09-05 the stack is **19 unrun** —
P3's tasks, and nothing else. P1's 13 and all of P2's 21 have run, and every batch
raised the measured rate rather than lowering it. As of 2026-09-06 it is **4**:
P3's Tasks 16–19, its first fifteen having run at **4.1 defects per task**.*

**Confirmed by P1's execution, 2026-09-05.** All 13 of P1's tasks ran; they yielded
**18 defects** on top of the five its own self-review had already caught. The
decision above was correct and the effect is larger than the numbers that motivated
it: a third of the defects were controls reporting green against something broken or
absent, which is the one failure mode that a *stack of unexecuted plans* cannot
reveal and actively conceals.

**Confirmed again, and harder, by finishing P2 the same day.** The whole plan has now
run. The measured rate by batch:

**THIS TABLE IS THE ONE PLACE A FINDINGS COUNT LIVES (Rich, 2026-09-20).** Every other
document — the plan's own sitting headings and sittings table, the P6a row above,
ORIENTATION's top-of-file box and §7e — **states the count NOWHERE and points here.**

**Why here.** It already carries one row per sitting for every plan; it is the only place
that does ARITHMETIC with the number, so a wrong value shows up as a wrong rate; and §6
already makes the roadmap ledger outrank every other document on status.

**The number is DERIVED, and this table caches the derivation.** A sitting's findings are
the `**F<n>` headings in its section of its plan, so the count is one command:

```bash
# One sitting's findings. The alternation matters: some sittings head a finding with
# `**F1 …` at line start and others number them in a list, `1. **F1 …` — P6a's sitting 1
# does, and a `^\*\*F` grep reads it as ZERO. Verified against all six of P6a's sittings,
# which derive 15, 12, 11, 21, 14 and 19 — exactly what the rows below say.
awk '/^### Sitting 6 —/,/^### Sitting 7 —/' docs/superpowers/plans/2026-09-19-p6a-first-production-launch.md \
  | grep -cE '^[[:space:]]*([0-9]+\. )?\*\*F[0-9]+ '
```

**Derive it at the CLOSE, after the post-sweep check and the final gate run, because those
produce findings too.** P6a sitting 6 is why this rule exists: its count moved **three
times** — 15 → 17 → 18 → 19 — across **six** documents, and the test count moved twice
beside it. Every move was caught, but only by grepping the PHRASE each time (§6). One place
makes the third move a one-line edit instead of a six-document sweep. *(A prose line that begins `**F12` is counted and is not a finding — it read 20 for 19 once. Do not start a sentence with a finding's number; the trailing space in the pattern is what stops `**F12's` matching, not the line start.)*

**The totals row is arithmetic over the rows above it — recompute it, never adjust it.**

| Batch | Tasks | Defects | Per task |
|---|---|---|---|
| P1 | 13 | 18 | 1.4 |
| P2 Tasks 1, 9, 10, 11 | 4 | 5 | 1.3 |
| P2 Tasks 2–8 | 7 | 20 | 2.9 |
| **P2 Tasks 12–21** | **10** | **27** | **2.7** |
| P2, found later while reconciling P3 | — | 2 | — |
| P3 Tasks 1–12 | 12 | 45 | 3.7 |
| P3 Tasks 13–15 | 3 | 16 | 5.3 |
| **P3 Tasks 16–19** | **4** | **21** | **5.3** |
| **P3, total** | **19** | **82** | **4.3** |
| P4a Tasks 1–3 | 3 | 18 | 6.0 |
| P4a Tasks 4–9 | 6 | 25 | 4.2 |
| P4a Tasks 10–11 | 2 | 10 | 5.0 |
| P4a Tasks 12–13 | 2 | 9 | 4.5 |
| **P4a Task 14** | **1** | **8** | **8.0** |
| **P4a so far** | **14** | **70** | **5.0** |
| P4b Tasks 1–5 (sittings 1–3) | 5 | 27 | 5.4 |
| P4b Tasks 6–7 (sitting 4) | 2 | 12 | 6.0 |
| P4b Tasks 8–9 (sitting 5) | 2 | 11 | 5.5 |
| P4b Task 10 (sitting 6) | 1 | 14 | 14.0 |
| P4b Tasks 11–12 (sitting 7) | 2 | 16 | 8.0 |
| P4b Task 13 (sitting 8) | 1 | 20 | 20.0 |
| P4b Tasks 14–15 (sitting 9) | 2 | 18 | 9.0 |
| P4b Task 16 (sitting 10) | 1 | 22 | 22.0 |
| **P4b, total** | **16** | **140** | **8.8** |
| P4c Task 1 (sitting 1) | 1 | 13 | 13.0 |
| P4c Task 2 (sitting 2) | 1 | 4 | 4.0 |
| P4c Tasks 3–4 (sitting 3) | 2 | 7 | 3.5 |
| P4c Task 5 (sitting 4) | 1 | 6 | 6.0 |
| P4c Tasks 6–7 (sitting 5) | 2 | 9 | 4.5 |
| P4c Tasks 8–9 (sitting 6) | 2 | 10 | 5.0 |
| P4c Task 10 (sitting 7) | 1 | 9 | 9.0 |
| P4c Task 11 (sitting 8) | 1 | 12 | 12.0 |
| **P4c, total** | **11** | **70** | **6.4** |
| P5a Task 1 (sitting 1) | 1 | 9 | 9.0 |
| P5a Tasks 2–3 (sitting 2) | 2 | 16 | 8.0 |
| P5a Tasks 4–5 (sitting 3) | 2 | 15 | 7.5 |
| P5a Task 6 (sitting 4) | 1 | 7 | 7.0 |
| P5a Task 7 (sitting 5) | 1 | 4 | 4.0 |
| P5a Tasks 8–9 (sitting 6) | 2 | 13 | 6.5 |
| P5a Tasks 10–11 (sitting 7) | 2 | 18 | 9.0 |
| P5a Task 12 (sitting 8) | 1 | 15 | 15.0 |
| P5a Task 13 (sitting 9) | 1 | 18 | 18.0 |
| P5a Task 14 (sitting 10) | 1 | 10 | 10.0 |
| P5a Tasks 15–16 (sitting 11) | 2 | 13 | 6.5 |
| P5a Task 17 (sitting 12, the acceptance) | 1 | 8 | 8.0 |
| **P5a, total** | **17** | **146** | **8.6** |
| P5b Task 1 (sitting 1) | 1 | 11 | 11.0 |
| P5b Tasks 2–3 (sitting 2) | 2 | 14 | 7.0 |
| P5b Tasks 4–5 (sitting 3) | 2 | 15 | 7.5 |
| P5b Task 6 (sitting 4) | 1 | 10 | 10.0 |
| P5b Task 7 (sitting 5) | 1 | 12 | 12.0 |
| P5b Tasks 8–9 (sitting 6) | 2 | 12 | 6.0 |
| P5b Tasks 10–11 (sitting 7) | 2 | 15 | 7.5 |
| P5b Task 12 (sitting 8) | 1 | 16 | 16.0 |
| P5b Task 13 (sitting 9, the acceptance) | 1 | 11 | 11.0 |
| **P5b, total** | **13** | **116** | **8.9** |
| P5c Task 1 (sitting 1) | 1 | 19 | 19.0 |
| P5c Tasks 2–3 (sitting 2) | 2 | 10 | 5.0 |
| P5c Task 4 (sitting 3) | 1 | 9 | 9.0 |
| P5c Tasks 5–6 (sitting 4) | 2 | 9 | 4.5 |
| P5c Tasks 7–8 (sitting 5) | 2 | 13 | 6.5 |
| P5c Tasks 9–10 (sitting 6) | 2 | 12 | 6.0 |
| P5c Task 11 (sitting 7) | 1 | 8 | 8.0 |
| P5c Tasks 12–13 (sitting 8) | 2 | 11 | 5.5 |
| P5c Task 14 (sitting 9, the acceptance) | 1 | 16 | 16.0 |
| **P5c, EXECUTED** | **14 of 14** | **107** | **7.6** |
| P6a Task 1 (sitting 1, the measurements) | 1 | 15 | 15.0 |
| P6a Tasks 2–3 (sitting 2, the second listener) | 2 | 12 | 6.0 |
| P6a Task 4 (sitting 3, the production route on the public listener) | 1 | 11 | 11.0 |
| P6a Tasks 5–6 (sitting 4, migration 0019 and the two external records) | 2 | 21 | 10.5 |
| P6a Task 7 (sitting 5, the gate that blocks) | 1 | 14 | 14.0 |
| P6a Tasks 8–9 (sitting 6, step-up re-authentication) | 2 | 19 | 9.5 |
| P6a Tasks 10–11 (sitting 7, the approval and its diff snapshot) | 2 | 15 | 7.5 |
| P6a Tasks 12–13 (sitting 8, the Reviewer seam and §7's last production clause) | 2 | 17 | 8.5 |
| P6a Tasks 14–15 (sitting 9, the rehearsal and the first production deploy) | 2 | 18 | 9.0 |
| P6a Tasks 16–18 (sitting 10, gate integrity and both console screens) | 3 | 27 | 9.0 |
| P6a Task 19 (sitting 11, the acceptance) | 1 | 17 | 17.0 |
| **P6a, EXECUTED** | **19 of 19** | **186** | **9.8** |

***P5a's total and every P5b row above were added on 2026-09-18, by P5b sitting 6.** They had
been missing since P5a finished — five consecutive P5b sittings closed out without them, each
believing it had swept, while ORIENTATION §2 said in its own words that this table "has every
plan and sitting". It is the cheapest line in the close-out and the one nobody checked; it is
now P5b sitting 6's F10.*


***That was true on 2026-09-06. As of 2026-09-09 the unrun stack is 17 tasks:
P4a's remaining 1 and P4b's 16.*** Task 14 came in at **8 defects in one task**, the
highest per-task rate measured here — and every one of them was found by a gate rather
than by reading: `tsc` after 508 green tests, a negative control that stayed green, and
a row read back out of the IdP's database after the Docker tier had run. The rate never fell with practice; it rose the
moment the tasks stopped being pure functions, and it kept rising. **P3 finished at
82 defects across 19 tasks — 4.3 per task**, well above the 2.7–2.9 this section
predicted, with its two worst sessions at the end.

The reason is the single most useful thing this project has measured about itself.
**Task 15 was the first task that made the parts built in Tasks 1–12 do anything end
to end**, and it immediately established that *no build in this platform had ever
succeeded*. **Task 17 was the first task that made the CONTROL PLANE drive those
parts**, and it established that *no deploy had ever succeeded either* — through
seven separate defects of one shape: **the test constructed the value correctly and
the running system re-derived it wrongly.** A blueprint directory, a repository path,
an image repository, a port. Every one of those was green in a suite of 74 Docker
tests, because a test hands the driver what it built while the control plane rebuilds
it from a slug.

**The lesson for P4, and it is a scheduling lesson rather than a coding one:
integration is where the false greens sit, so schedule the end-to-end task EARLY and
drive it through the real entry point, not through a harness.** Two further classes
stay invisible to any amount of reading: **six of P2's last 27 were type errors no
test could see**, and **five were test isolation**.

*Rejected:* writing P4 and P5 first, on the argument that plan-writing and execution
want different context and batching them is cheaper per plan. It is — and it is more
expensive overall when the plans are wrong in ways only execution reveals, which is
what the one measurement says happens.

*Cost of changing course back:* structurally nothing. P4's inputs — S2, S3 and P3 —
are all in hand, so it can be written at any point without waiting on anything.

*What executing P1 needed from Rich, and could not do for itself* — **all settled
2026-09-05.** `sudo` cannot prompt from a tool call, so `make host-setup` was
bundled and Rich ran it in his own terminal; the alias, resolver and keychain trust
all landed first time. The **offline** run was likewise his, because disabling Wi-Fi
cuts the agent off too — `scripts/offline-acceptance.sh` exists for exactly that, and
it **passed**: `make up` green with no network, doctor 14/14, verify 33/33. The
**fresh clone on a second machine remains untested** — no second Mac was available,
and it is recorded as a gap in `RUNBOOK.md` rather than claimed. It should be a
machine with Valet installed, because that is the known interesting case.

*What is still Rich's:* `make host-undo` has never been run end to end. It is one
command, and `make host-setup` puts everything straight back.

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
- **Whether sandboxes need gVisor or Kata** (§12). Recorded as `isolationLevel`.
  **S6 answered it for staging and production apps — `container` — on 2026-09-07,
  and deliberately did not answer it for SANDBOXES**, because its probes ran
  against a staging app and §11 gives a sandbox `exec`, a wider egress baseline
  and a session-scoped AI key. **S5 owns the sandbox half.** Both halves are now
  recorded in §12 (spec action applied 2026-09-07).
- **Quarantine-on-first-use for dependencies** (§12). v1 picks the allowlist,
  because two mechanisms would be built and neither finished.
- **Anything in §15's hook table.** The hooks are built now because they are cheap
  now; what they unlock is not.
