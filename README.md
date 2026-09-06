# Manifest

A self-hosted internal developer platform for UBC. A faculty member describes an
application in plain language, an AI agent builds it, and Manifest deploys it —
authenticated with CWL, running on UBC infrastructure — without the faculty member
ever encountering a container, a template, or a terminal.

This repository is the **deployment control plane**. The faculty-facing front-end is
a separate project; what lives here is the platform it consumes, plus a reference
console that proves the API can carry the whole journey.

## Status: the platform runs locally

**P1 is executed and green as of 2026-09-05.** `make seed && make host-setup &&
make up` brings up the whole §21 inventory — split-horizon DNS, a custom `xcaddy`
edge with rate-limiting and Coraza, Postgres with three databases, a private
registry and npm mirror, a default-deny egress proxy, a rootless non-privileged
BuildKit, LiteLLM against host Ollama, and the Manifest IdP. `make doctor` is 14
checks / 0 failed and `make verify` is 31 checks / 0 failed, **both green with the
network off**. `https://console.manifest.internal/` returns the same hostname and
scheme from the host browser and from inside a container — no port, no certificate
warning. See [`docs/superpowers/RUNBOOK.md`](docs/superpowers/RUNBOOK.md).

**Before that, on 2026-08-31**, P2's runtime island landed: the §11 `Driver`
interface, the in-memory fake driver, the shared driver contract suite P3 inherits
unchanged, and the instance state machine — 19 tests, no Docker, no Postgres, no
network. The design is approved and complete.
Seven throwaway spikes de-risk it; **four are done — S7, S2, S1 and S3 — and all four
answered yes**, each far inside its timebox, with every spec change they implied
already applied. The remaining three are scheduled later, against machinery that does
not exist yet.

**Three implementation plans are complete** — P1, the local substrate (13 tasks,
**all executed**), P2, the control-plane spine (21 tasks, four executed), and P3,
the Docker driver and deploy spine (19 tasks). **P4 and P5 are unwritten, and that
is deliberate: on 2026-09-04 the project stopped writing plans and started executing
them.** P1's execution vindicated that decision — 13 tasks produced **18 defects** in
a plan that had already been self-reviewed, and a third of them were *checks that
passed while the thing under test was broken or absent*. **Finishing P2 is the
current work.**

## Where to start

**Everyone starts here:** [`docs/superpowers/ORIENTATION.md`](docs/superpowers/ORIENTATION.md).
It assumes no context and carries what the project is, what has been established, what
this machine will do to you, and what to do next. Then:

| If you are… | Read |
|---|---|
| Running the platform | [`docs/superpowers/RUNBOOK.md`](docs/superpowers/RUNBOOK.md) — `make seed && make host-setup && make up` |
| Finishing P2 (**the current job**) | ORIENTATION §7b, then [`docs/superpowers/plans/2026-08-29-p2-control-plane-spine.md`](docs/superpowers/plans/2026-08-29-p2-control-plane-spine.md) — Tasks 2–8 and 12–21 |
| Executing any plan | The plan itself. It is self-contained by construction; if it is not, that is a defect in the plan — fix it there |
| Writing the next plan (**P4, and not yet**) | ORIENTATION §7c, then [`docs/superpowers/plans/2026-08-29-plan-roadmap.md`](docs/superpowers/plans/2026-08-29-plan-roadmap.md). It is held until P3 executes |
| Looking for what a spike proved | `docs/superpowers/spikes/S{7,2,1,3}-findings.md` — the answer is the first sentence of each |
| Looking for the architecture | [`docs/superpowers/specs/2026-08-29-manifest-platform-design.md`](docs/superpowers/specs/2026-08-29-manifest-platform-design.md) — authoritative, ~2,340 lines. ORIENTATION §3 tells you which sections you actually need |
| Explaining this to someone non-technical | [`manifest-schematic.html`](docs/superpowers/specs/manifest-schematic.html) and its companions — the same design in plain language, plus six worked faculty stories |
| Tracking the UBC reviews | [`docs/external-track.md`](docs/external-track.md) — the items decided by people outside this team, which carry the longest lead times in the project |

## The three things that shape every decision

- **Laptop-first, and reproducibly so.** The entire platform runs on one developer
  machine, offline after a one-time seeding step. Not a demo mode — the real thing.
- **It is a containment system that happens to deploy.** Manifest's primary security
  function is to limit the blast radius of code nobody reviewed. Where "deployment
  platform" and "containment system" disagree, containment wins.
- **Every production app needs its own UBC IAM registration and privacy assessment.**
  Non-negotiable, human, multi-week. The platform's job is to *drive* those processes,
  not to wait on them.

## Conventions

- Specs live in `docs/superpowers/specs/`, plans in `docs/superpowers/plans/`, spike
  findings in `docs/superpowers/spikes/`.
- Spikes run on `spike/<id>` branches that are **never merged**. Only the artefacts
  named in the brief are copied out.
- The design document is marked *Approved design*. Proposed changes are recorded in
  a findings note or a plan and approved before they are made, not edited in directly.
- **Status lives in one place**: the *Spike status* ledger in the roadmap. If any
  other document disagrees with it, the ledger wins — several have gone stale within
  a day of being written, and that is now a documented lesson rather than a surprise.
