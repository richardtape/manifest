# Manifest — Platform Design

**Status:** Approved design, pre-implementation
**Date:** 2026-08-29
**Scope:** The Manifest control plane (the deployment back-end). The faculty-facing
"manifesting" front-end is a separate project and is out of scope here, except for
the API contract it consumes.

**Note on planning scope:** this document is the architecture for Phases 0–5
(§17). It is deliberately larger than one implementation plan. The first
implementation plan covers **Phase 0 (spikes S1–S3 and S7) and Phase 1a (the local
baseline and deploy spine)** only. Phases 1b and 1c get their own plans against this
same architecture, as do the later phases.

---

## 1. Purpose

Manifest is a self-hosted internal developer platform for UBC. It lets a faculty
member describe an application in plain language, have an AI agent build it, and
have it deployed, authenticated, and running on UBC infrastructure — without the
faculty member ever encountering a container, a template, or a terminal.

### Bring your own agent

Manifest's own front-end is **one way in, not the only way**. Everything a faculty
member can do through it — create a project, build, deploy to staging, stream logs,
request production — is available over the public API to any client, including
someone's own coding agent running on their own machine.

For those users the **sandbox is optional**: they already have a machine and an
execution environment, so they need git plus an API. Faculty with no agent get the
sandbox and the console. Same API, same deploy path, same guarantees.

This widens the audience at nearly zero cost — research groups with one graduate
student who codes, central IT, developers who would never open a chat interface but
will happily `git push`. It also reframes what this repo is: **a platform with a
reference front-end, not a front-end with a backend.**

This document specifies the **deployment control plane**: the system that owns
projects, source, builds, releases, approvals, running instances, backing
services, routing, secrets, identity provisioning, and AI credential brokering.

### Success criteria

The platform is real when, **on a MacBook with no cloud dependencies**, a caller
can drive this loop end to end:

> a person logs into the **reference console** (§22) → creates a project → watches
> it provision → builds → deploys to staging → opens the app → logs in with CWL
> inside it → the app writes to its own database → the app asks an LLM a question →
> requests production and sees the launch-readiness gate.

Driven by a human through a UI, not by `curl`. Until that journey is clickable,
nothing has been proven to anyone outside the team.

The laptop proves the **mechanism** of that final step, not a real launch: a
genuine production launch additionally requires a UBC IAM registration and an
approved PIA (C4), neither of which exists on a MacBook. Locally, those
`LaunchReadiness` items are satisfiable by an admin override that is recorded as
such — the gate is exercised, never bypassed silently.

---

## 2. Context and prior art

Existing assets in `~/Developer` that this design builds on or deliberately
supersedes:

| Asset | Relationship to Manifest |
|---|---|
| `tlef-starter` | Source of the first **blueprint**. Already a TS client/server app wired to Mongo, Qdrant, `passport-ubcshib` and the GenAI toolkit, with per-component `AGENTS.md` written for coding agents. |
| `passport-ubcshib` | **Ours, changed only with discipline (C6).** Used as-is by manifested apps; its `LOCAL`/`STAGING`/`PRODUCTION` presets and env var names constrain Manifest's injection contract (§7). Manifest pins an exact version. |
| `docker-simple-saml` | **Ours, freely editable.** Becomes the **Manifest IdP**, deployed as its own instance separate from the standalone one (§21). Its file-based `saml20-sp-remote.php` is replaced by a programmatic metadata source — SimpleSAMLphp's SQL source if S2 confirms it, a metadata module we write if not (§9). |
| `ubc-genai-toolkit` | **Ours, changed only with discipline (C6).** Used as-is by manifested apps; its `openai-compat` provider points at LiteLLM. Manifest pins an exact version. |
| `tlef-ansible` | Describes how UBC deploys today (RHEL 9 VMs, nginx, Let's Encrypt, GitHub webhooks). Informs the eventual VM driver; not a dependency of the MVP. |
| `saml-metadata-generator` | **Absorbed as a library.** Already generates RSA-4096 certificates and UBC-standard SP metadata as a downloadable package — exactly the artifact a UBC IAM registration request requires (§9). Not rebuilt. |
| `FakeAcademicAPI`, `canvas-bridge` | Future `integrations:` targets. Reserved for post-MVP (§15). |
| `vibonarium`, `vibonarium-old` | Earlier prototype of the same idea, built on Coolify. **Inspiration only.** Coolify has been evaluated and rejected. No code is carried forward. |

---

## 3. Constraints

These are fixed. Designs that violate them are wrong.

- **C1 — Laptop-first, and reproducibly so.** The entire platform — control
  plane, IdP, LLM proxy, registry, package mirror, edge — plus the **faculty-facing
  front-end** must run on one developer laptop. Nothing may be stubbed to achieve
  this. "Offline" means **offline after first setup**: a one-time online `make
  seed` pulls digest-pinned base images, warms the package mirror with the
  blueprint's dependency closure, and pulls the Ollama models; after that the full
  loop runs with the network off. Adding a *new* dependency needs network — a
  stated limitation, not a surprise. The bar is not "it works on one machine" but
  "a new developer reaches a working loop from a clean checkout" (§21).
- **C2 — Infrastructure-agnostic.** The target may be RHEL 9 VMs or a Kubernetes
  cluster; UBC has not decided. The control plane must not encode either.
- **C3 — Faculty never see infrastructure.** No template picking, no resource
  sizing, no YAML authoring by a human. The AI writes the spec; the platform
  interprets it.
- **C4 — Every production app requires its own UBC IAM registration and its own
  Privacy Impact Assessment. Non-negotiable.** IAM registration is reviewed by
  people and runs on its own cadence; no design may assume programmatic SP
  registration with real UBC CWL. A
  production launch is therefore gated on two external, human, multi-week
  processes, and the platform's job is to *drive* them, not merely wait on them
  (D19).
- **C5 — Start small, design for large.** Pilot scale now; no interface may
  foreclose the ~500-app case.
- **C6 — Manifest adapts to existing app-side libraries rather than reshaping
  them.** `passport-ubcshib` and `ubc-genai-toolkit` are UBC's own, so "unchanged"
  is a discipline rather than a fact, and the constraint states the discipline.
  Changes to them are permitted only where they are strictly safer or more correct
  **for every consumer**, are released under a version Manifest **pins exactly**
  (never a range), and are **never a prerequisite for Manifest to work** — if
  Manifest requires a library change, the design is wrong and is fixed in Manifest.
  The discipline is what stops Manifest quietly becoming the system that dictates
  how every UBC application does authentication. The blast radius is smaller than it
  looks: six applications consume `passport-ubcshib` today, all on `0.1.4` or
  `^0.1.6`, and a caret range on a `0.x` version pins to the *minor* — so a `0.2.0`
  release reaches none of them silently, and each adopts deliberately.

---

## 3.5 Threat model

Manifest's constraints (§3) describe what it must do. This section describes what
it must defend against, because one property dominates every design choice here:

> **Manifest's primary security function is to be a blast-radius limiter for code
> that nobody reviewed.**

It is not a deployment system that happens to run AI-written code. It is a
containment system that happens to deploy. Where those two readings disagree, the
second one wins.

### Actors

| Actor | Capability | Principal risk |
|---|---|---|
| **The agent — unreliable, not hostile** | writes and executes code in a sandbox | ships vulnerable code; leaks secrets into logs and repositories |
| **A prompt-injected agent** — in our sandbox *or* a third-party agent on a user's own machine holding a delegated token (§1) | steered by attacker-supplied text that arrived in a PDF, a scraped page, a package README or student work | the sharpest threat in the model: a confused deputy with `exec` or an API token — addressed by D14 and D24 |
| **Curious or malicious faculty** | full control over what the agent is asked to build | tenant escape; lateral movement into UBC systems |
| **A student using a manifested app** | untrusted HTTP input into LLM-written code | other students' data, grades, impersonation |
| **External attacker** | the public production edge | a foothold inside UBC's network |
| **A compromised manifested app** | executes inside UBC, holds a CWL SP private key | assertion abuse, east-west movement |
| **Platform administrator** | approvals, secrets, the whole fleet | insider risk; requires non-repudiation |

### Assets, in rough order of value

1. **Production SP private keys** — one per production app, registered with real
   UBC Shibboleth. Compromise means impersonating that Service Provider to UBC's
   IdP and decrypting assertions about real staff and students. Blast radius is
   one app, but the data is real.
2. The **secrets encryption master key** — unwraps every application secret.
3. **Student and staff personal information** held by manifested apps (FIPPA).
4. **CWL attributes** released to apps.
5. The **control plane** itself — it holds credentials for every driver, registry, IdP and LiteLLM.
6. **Model credentials and budget** — abuse is expensive and attributable to UBC.
7. **The UBC network position** every deployed app occupies.
8. The **Manifest IdP signing key** — high value, but scoped to sandbox and
   staging only (D6), so its compromise never touches real user identities. This
   is a direct benefit of the C4 constraint.

### Trust boundaries

```
UNTRUSTED  app code, agent-written code, agent context, student input,
           third-party packages
SEMI       faculty owners (authenticated, accountable, not security-competent)
TRUSTED    control plane, drivers, IdP, registry, platform admins
```

The boundary that matters most is the one between an app or sandbox container and
everything in the TRUSTED column. Every control in §12 and §20 exists to keep that
boundary intact even when the code inside is actively hostile.

### Assumptions stated so they can be challenged

- Faculty owners are accountable for their app's data but **cannot assess its
  security**. Platform controls are what make that accountability tenable; this is
  the platform's core value proposition to the Privacy Office, not a caveat.
- Application code is **never reviewed by a human at all** — not at first launch
  either. §13's gate reviews `manifest.yaml`, not code (D9). Every compensating
  control is therefore preventive and containment-based, never review-based. The
  one exception is the blueprint itself (§20), which is reviewed on every change
  precisely because there is only one of it.
- A container is a **weak** boundary against a determined attacker. Sandbox
  isolation strength is recorded, not assumed (§20).

---

## 4. Decision log

| # | Decision | Rationale |
|---|---|---|
| D1 | Manifest owns an execution primitive, **"an instance of a build"**, with three lifetime policies: `build`, `sandbox`, `environment`. | The agent's dev sandbox and the staging runtime are the same object. Owning it once gives dev/prod parity for free and prevents a second, divergent orchestration layer growing inside the front-end project. |
| D2 | The AI coding agent runs **inside** the sandbox and obtains model access from a scoped, short-lived LiteLLM key. | Keeps provider credentials out of agent-reachable memory entirely, and gives the agent a fast local filesystem for its inner loop. |
| D3 | Backing services are **dedicated containers per app per environment**. | Simpler isolation, and it composes with hibernation: a sleeping app's database sleeps too, so an idle course tool costs nothing. Accepted costs: backup fan-out and version sprawl, both owned centrally by Manifest. |
| D4 | The app→platform contract is a schema-validated **`manifest.yaml` in the repo**. | Versioned with the code, diffable at the approval gate, and expressive enough to state "this app needs Qdrant and CWL with these attributes". |
| D5 | Git access is behind a **provider interface**; driver 1 is local bare repos, driver 2 is a UBC GitHub org. | Satisfies C1: the laptop build needs no GitHub org, no tokens, no webhook tunnel. |
| D6 | **Two identity paths.** The Manifest IdP (a SimpleSAMLphp instance Manifest controls) serves **sandbox and staging** with test users. **Production apps are registered directly with real UBC Shibboleth**, one registration per app. The Manifest IdP does not proxy to real CWL and never authenticates a real user. | Per C4, which is non-negotiable. A useful side effect: the Manifest IdP's signing key never touches real identities, which removes it from the top of the asset list in §3.5. *(A SAML-proxy variant was considered and rejected.)* |
| D7 | Manifest is a **client of LiteLLM's admin API**, not a gateway of its own. | LiteLLM already provides virtual keys, budgets, multi-provider routing and an admin API. Building a second one would be waste. |
| D8 | Virtual keys are minted **per app+environment**, **per agent session**, and spend is attributed **per end user** via hashed `ubcEduCwlPuid`. | A looping agent burns its own cap. Per-user attribution answers "which of 300 students spent the budget" and enables fair-share quotas inside a manifested app. |
| D9 | Production approval is **first-launch only**, plus **automatic re-escalation when a sensitive field changes**. | Preserves faculty velocity while closing the "the AI silently rewrote the app" hole. The escalation is free because the diff is computed for the first review anyway. |
| D10 | Control plane is a **desired-state reconciler with pluggable drivers**, but the first implementation is a **straight-line imperative path**. | Learn the domain against real Docker before committing to a loop. The reconciler later *wraps* the straight-line function rather than replacing it. |
| D11 | Stack: **TypeScript/Node + Fastify, Postgres, Drizzle, React+Vite** admin UI. | Team fit, and LiteLLM already requires Postgres — the control plane database adds no new infrastructure dependency. |
| D12 | Edge proxy is **Caddy**, with **separate listeners** for internal (sandbox+staging) and public (production) traffic. | HTTPS on a laptop from Caddy's internal CA (one automated trust-store step, not a manual mkcert dance — §21); JSON admin API instead of templated config. Separate listeners fail closed; IP allowlists fail open and quietly. |
| D13 | **Dockerfiles are blueprint-managed.** Apps cannot supply their own build definition. | Build time is the most privileged moment in the pipeline; an app-supplied Dockerfile is arbitrary RCE on the builder. It also violated the rule in D4/§7 that an app declares *what*, never *how*. Custom Dockerfiles may return later behind rootless BuildKit with a credential-free, network-restricted builder. |
| D14 | **Privileged actions require an interactive human session, whichever client initiates them.** No agent-held credential — Manifest's own or a third party's — carries privileged capability. A sandbox in particular holds no credential able to mutate anything outside itself. | Prompt injection makes any agent a confused deputy: text it reads — a student PDF, a scraped page, a package README — is potential attacker instruction. The property is *not* "our front-end does it", which would make third-party clients second-class by construction and misstate the control. Stated this way it protects against a prompt-injected agent on someone's laptop exactly as it protects against one in our sandbox: one rule, one enforcement point. Generalises Vibonarium's *"the agent suggests, the human clicks, the gateway executes."* |
| D15 | **SAML ACS and SLO URLs are derived by Manifest**, never accepted from the app. `auth.callback` is a path, not a URL. | Registering an SP means directing signed identity assertions at a URL. Free-text ACS is an assertion-phishing primitive reachable from a buggy agent or an injection in the registration path. |
| D16 | **A newly requested CWL attribute requires approval in every environment**, not only production. | Under D6 staging uses test users, so the harvesting risk is lower than first assessed — but the control is retained for a stronger reason: in production, `auth.attributes` must be a subset of what UBC IAM actually registered. Catching an attribute change at approval time turns a launch-day login failure into a change request raised weeks earlier. |
| D17 | **`data.classification` constrains which logical models an app may use.** | A BC public body sending student personal information to a US model provider is a FIPPA problem, and the pre-review design was one YAML line away from it by accident. Both fields already existed; linking them is nearly free. |
| D18 | **Egress is default-deny in every environment**, through a forced proxy. | The pre-review design enforced egress only in sandboxes. Production is long-lived, holds real data and sits inside UBC's network — a compromised production app is a better pivot than a 45-minute sandbox. |
| D19 | **Manifest generates and tracks the IAM registration and the PIA as first-class objects**, and blocks production deployment until both are approved. | The platform knows more about the app than its owner does: it can derive the SP metadata, a per-attribute justification, and most of a PIA from the AppSpec. A faculty member should review and sign, not author from nothing. This converts C4 from a blocker into the platform's most valuable service. |
| D20 | **The production SP keypair is long-lived and stable**, generated once at registration; rotation is a tracked IAM change request with an overlap window. Certificate expiry is monitored and alarmed months ahead. | An SP certificate is registered with UBC IAM; rotating it per deploy would break authentication. Conversely an unnoticed expiry silently kills login for a live course application mid-term — an operational hazard that is invisible until it is urgent. |
| D21 | **A pre-production rehearsal against UBC's staging IdP (`authentication.stg.id.ubc.ca`) is part of launch readiness**, not part of the daily build loop. | Staging on the Manifest IdP keeps iteration frictionless, but an app whose first contact with real Shibboleth is production launch day will fail on launch day. The rehearsal validates the registration, the attribute release and the certificate before anything is public. |
| D22 | **This repo ships a `console/` — a reference console — as a Phase 1 deliverable.** It is the executable proof that the public API is complete and sufficient, not the product. It imports *only* the generated client from `contract/`, enforced by a lint boundary and a test. | Without it, the faculty journey is undemonstrable until Phase 3, and API gaps surface when the front-end team hits them rather than while they are cheap to fix. The import rule converts "is the API complete?" from an opinion into a build failure. |
| D23 | **The public API is resource-oriented, event-streamed, and agent-framework agnostic** (§22). | These are the constraints that actually preserve front-end flexibility. In particular, no agent SDK type appears anywhere in the API surface: Vibonarium pinned `pi` to `0.79.3` and recorded that SDK's churn as a standing hazard. Manifest exposes sandbox lifecycle, `exec`, file operations and streams as primitives so any harness can drive them. |
| D24 | **Two credential classes.** An *interactive session* (browser, CWL, CSRF, step-up re-auth) can do anything the user can. A *delegated token* (agent, CLI, CI, MCP) is scoped and may **never** carry production promotion, secret read, quota change or member management; requesting one of those creates a **pending action** a human confirms interactively. | This is what makes "bring your own agent" (§1) safe rather than a hole. Note what a delegated token *can* do: create projects, read everything, trigger builds, deploy to sandbox and staging, stream logs and events — the entire build loop. Only four things need a human. |
| D25 | **The agent knowledge pack is served over the API**, versioned with its blueprint — not only baked into sandbox images. | A third-party agent on someone's laptop cannot read a file inside a container it never runs. Without this, a BYO agent has no way to learn how to write a valid `manifest.yaml` or wire CWL auth, which is exactly the knowledge that makes an app work on this platform. |
| D26 | **Every app has a permanent canonical hostname. A custom production domain is an addition to it, never a replacement.** | The canonical name is what Manifest controls, what its wildcard certificate covers, and what internal tooling, health checks and the SP `entityID` are pinned to. Letting a vanity domain *replace* it would make the identity registration (§9) a function of a field a faculty member can edit, which is precisely the assertion-phishing shape D15 exists to prevent. Keeping both means a broken or lapsed custom domain degrades to a working app on an ugly URL, rather than to an outage. |
| D27 | **A custom domain on a CWL app must be chosen before its UBC IAM registration is submitted.** Adding or changing one afterwards is an IAM change request, not a platform setting. | The ACS URL is part of what UBC IAM registers (§9, D15), and it must contain the hostname the browser is actually on or the assertion will not be accepted. This is the ordering constraint faculty are most likely to get wrong: choosing a domain is a five-second decision in week one that costs a multi-week change request in week twelve. Manifest therefore asks for the domain *at* registration time rather than offering it as a later convenience. Apps with `auth.provider: none` have no such constraint and may change domain freely. |
| D28 | **A custom domain is verified by DNS before it can be attached**, using a CNAME to the canonical hostname plus a proof-of-control TXT record; certificates are then issued automatically. A certificate upload path exists for departments that cannot CNAME. | Attaching an unverified hostname lets one project claim traffic for a name it does not control. Requiring the CNAME first also means the automated certificate challenge is reachable by construction — traffic already arrives at the edge — so verification and certificate issuance are the same event rather than two failure modes. The upload path is not a loophole: those certificates are tracked with the same expiry alarms as SP certificates (D20), because an unnoticed expiry kills a live course application mid-term. |
| D29 | **Audience size and burstiness are fields on the Project, set by a human, and shape production capacity only.** They are not `manifest.yaml` fields. | Faculty can answer "who is this for" and cannot answer "how many replicas" — that is C3 restated for capacity. Keeping the answer out of `manifest.yaml` matters for a second reason: the file is agent-writable, and capacity costs real money, so an agent that could edit it could silently multiply an app's hardware bill. Under D14 that makes it a human decision by definition. Burstiness is asked separately from headcount because 200 students over a week and 200 students at 10:03 on Tuesday are different engineering problems with the same headcount. |
| D30 | **Each blueprint ships a machine-readable descriptor**, and the control plane hard-codes nothing about any particular language or stack. One blueprint ships in v1. | This is the difference between "we will add more blueprints later" being a folder and being a rewrite. The v1 platform will otherwise grow implicit Node assumptions in the builder, the health-check convention, the service catalogue and the injection contract — none of them written down, all of them load-bearing. A descriptor costs little now because there is exactly one blueprint to describe, and it converts §18's "multi-language auto-detection is a non-goal" from a limitation into a deferred, cheap extension. Not a contradiction of §18: auto-*detection* remains a non-goal; explicit, admin-published blueprints are the mechanism instead. |
| D31 | **Administration is a role on the same public API, not a second API**, and the admin console's primary screen is the queue of things blocked on a human. | A private admin API would drift from the public one and would quietly become the place where capabilities land that faculty clients then cannot have — the exact failure D22's import rule exists to prevent for the console. The queue framing matters more than it sounds: the platform's own design (C4, D9, D14, D19, D24, D27, D29) deliberately routes a specific set of actions through human judgement, so the number of people waiting on an administrator is the platform's central operational metric, not an afterthought on a dashboard. |
| D32 | **A fork inherits the code and the spec, and none of the trust.** No data, no secrets, no SP keypair or IAM registration, no privacy assessment, no custom domain, no audience setting, no prior approval. | Forking is the platform's best answer to forty people building the same rubric tool, so it must be safe enough to encourage. Every item on the not-copied list is specific to a person, a cohort or a purpose: copying an SP keypair would put two applications behind one identity at UBC, and copying an audience setting would silently size a 14-person tool for 900. What *is* inherited is the expensive part — the design, the code, and a privacy draft a reviewer has already accepted for a similar app. |

---

## 5. System boundaries

```
        faculty                                  platform admins
           │                                            │
           ▼                                            ▼
┌────────────────────────────┐          ┌───────────────────────────┐
│  Manifesting front-end     │          │    Manifest Admin UI      │
│  (SEPARATE PROJECT)        │          │    (this repo)            │
│  chat · agent orchestration│          │  fleet · approvals ·      │
└────────────┬───────────────┘          │  quotas · audit           │
             │  REST + WS               └─────────────┬─────────────┘
             │                                        │
┌────────────▼────────────────────────────────────────▼─────────────┐
│                     MANIFEST CONTROL PLANE                        │
│   projects · specs · builds · releases · approvals · instances    │
│   services · routes · secrets · sso · ai-keys · events            │
└───┬──────────┬───────────┬────────────┬─────────────┬─────────────┘
    │          │           │            │             │
┌───▼────┐ ┌───▼──────┐ ┌──▼───────┐ ┌──▼─────┐ ┌─────▼────┐
│ Driver │ │   Git    │ │ Manifest │ │LiteLLM │ │  Caddy   │
│ docker │ │ local /  │ │   IdP    │ │ admin  │ │  edge    │
│ (→k8s) │ │ github   │ │(SSP+SQL) │ │  API   │ │          │
└────────┘ └──────────┘ └──────────┘ └────────┘ └──────────┘
```

**Out of scope for this repo:** chat UI, agent orchestration, project ideation.

**But the front-end is a first-class citizen of the local topology (C1), so this
repo owns the contract it consumes:** an OpenAPI document, a generated and
versioned TypeScript client, and **`manifest-mock`** — a single small process that
serves that contract from fixtures, including scripted WebSocket streams for build
logs, deploy transitions and incidents. A front-end developer runs one process, not
the whole platform. Without this, front-end work is gated on the entire stack being
healthy, which is exactly the fragility C1 exists to prevent.

It also ships a **reference console** (§22) — the minimal faculty-facing client
that makes the journey clickable in Phase 1 and proves the API can carry it.

**In scope, and easily misplaced:** the **agent knowledge pack** — the `AGENTS.md`
and task-skill files that teach an AI to write a valid `manifest.yaml` and wire CWL
auth. These must version alongside the platform contract they describe, so they
ship *inside blueprints*, in this repo.

### Module map

Each is a folder with its own public interface, its own tests, and no reach into
another module's internals.

```
identity/       Manifest's own CWL login, users, roles
projects/       projects, members, quotas, provenance
source/         git provider drivers (local, github)
spec/           manifest.yaml schema, parse, validate, diff, sensitivity
blueprints/     blueprint registry: descriptor, skeleton, Dockerfile, knowledge
                pack, versioning, compatibility checking (§25)
build/          source + spec -> image digest (Dockerfile comes from the blueprint, D13)
runtime/        Driver interface, drivers, instance state machine, reconciler
services/       backing service provisioning + credentials
routing/        hostnames, custom domains + DNS verification, Caddy config,
                listener assignment, certificates (§23)
secrets/        envelope encryption, injection
sso/            Manifest IdP SP registration (sandbox + staging)
launch/         production identity & privacy lifecycle: IamRegistration,
                PrivacyAssessment, LaunchReadiness, registration-package generation
ai/             LiteLLM admin client, key minting, spend
releases/       releases, approvals, promotion
observability/  events, logs, incidents, metrics
api/            HTTP + WS surface
contract/       OpenAPI document + generated TypeScript client (published)
mock/           manifest-mock: fixture server for the same contract
console/        reference console: the faculty-facing proof client (§22)
mcp/            MCP server: Manifest as tools for any agent (Phase 3, §22)
admin-ui/       React admin front-end
```

---

## 6. Domain model

| Entity | Key fields |
|---|---|
| **User** | `id`, `ubc_cwl_puid` (from `ubcEduCwlPuid`), `email`, `display_name`, `role` (`admin` \| `member`) |
| **Project** | `id`, `slug`, `owner_id`, `blueprint_ref`, `quota`, `audience`, `visibility`, `published`, `forked_from` |
| | `quota` = `{max_cpu, max_memory, max_services, ai_monthly_usd}`; enforced at spec validation (§7) |
| | `audience` = `{scale, burst, justification, set_by, set_at}`; human-set, shapes production capacity only (§24, D29) |
| **ProjectMember** | `project_id`, `user_id`, `role` (`owner` \| `collaborator`) |
| **Blueprint** | `name`, `major_version`, `source_ref`, `default_spec`, `knowledge_pack_path`, `descriptor` |
| | `descriptor` = the parsed `blueprint.yaml` of §25: runtime, capabilities, defaults, schema compatibility (D30) |
| **AppSpec** | `id`, `project_id`, `commit_sha`, `parsed` (jsonb), `schema_version`, `valid`, `errors` |
| **Build** | `id`, `project_id`, `commit_sha`, `appspec_id`, `image_digest`, `status`, `logs_ref` |
| **Release** | `id`, `project_id`, `build_id`, `appspec_id`, `resolved_config`, `created_by`, `summary` |
| **Environment** | `id`, `project_id`, `kind` (`sandbox` \| `staging` \| `production`), `policy`, `hostname` |
| **Instance** | `id`, `environment_id`, `release_id`, `driver`, `kind` (`web` \| `worker` \| `cron`), `state`, `handle`, `last_seen_at` |
| **ServiceInstance** | `id`, `environment_id`, `type`, `version`, `name`, `handle`, `credentials_secret_id` |
| **Route** | `id`, `instance_id`, `hostname`, `listener` (`internal` \| `public`), `kind` (`canonical` \| `custom`) |
| **Domain** | `id`, `project_id`, `hostname`, `state` (`pending` \| `verified` \| `attached` \| `failed` \| `detached`), `verification_token`, `cert_source` (`acme` \| `uploaded`), `cert_expires_at`, `last_checked_at`, `verified_at` |
| **Secret** | `id`, `project_id`, `environment_kind`, `name`, `ciphertext`, `created_at` |
| **Approval** | `id`, `release_id`, `decision`, `decided_by`, `reason`, `diff_snapshot` |
| **IamRegistration** | `id`, `project_id`, `entity_id`, `acs_url`, `slo_url`, `cert_fingerprint`, `cert_expires_at`, `registered_attributes`, `state` (`draft` \| `submitted` \| `active` \| `change_requested` \| `expired`), `external_ticket_ref` |
| **PrivacyAssessment** | `id`, `project_id`, `generated_draft`, `state` (`draft` \| `submitted` \| `approved`), `reviewer`, `approved_at` |
| **LaunchReadiness** | `project_id`, checklist state across IAM registration, PIA, rehearsal, security scan, admin approval |
| **DelegatedToken** | `id`, `user_id`, `project_id`, `capabilities` (explicit set; never the privileged four — D24), `expires_at`, `last_used_at`, `rate_limit` |
| **PendingAction** | `id`, `project_id`, `requested_by_token`, `action`, `payload`, `state` (`pending` \| `confirmed` \| `rejected` \| `expired`), `resolved_by`, `resolved_at` |
| **AgentSession** | `id`, `project_id`, `instance_id`, `litellm_key_id`, `expires_at` |
| **Event** | `id`, `project_id`, `subject`, `type`, `machine_detail`, `human_message`, `created_at` |
| **Incident** | `id`, `instance_id`, `exit_reason`, `log_tail`, `failed_check`, `diff_since_healthy` |

**Central economy:** `sandbox` is not a separate subsystem. It is an `Environment`
with a short TTL, internal-only routing, and `exec` enabled. One builder, one
scheduler, one binding mechanism serve all three lifetimes.

---

## 7. The `manifest.yaml` contract

**Design rule: the app declares *what*, never *how*.** This single constraint is
what satisfies C3 (faculty see no infrastructure) and C2 (drivers are swappable).

### Schema (v1)

```yaml
manifest: 1                       # required, schema version
name: chem-lab-scheduler          # required, ^[a-z][a-z0-9-]{2,38}$; renameable until
                                  # first production launch, immutable after (§9)
blueprint: node-ts-mongo@2        # required, pins the knowledge pack
description: string               # optional

runtime:
  port: 3000                      # required
  health: /healthz                # default /healthz
  command: null                   # optional entrypoint override
  # NOTE: no `build:` block. The Dockerfile is generated from the blueprint (D13).

resources:                        # defaults inherited from blueprint
  cpu: 0.5
  memory: 512Mi
  pids: 256                       # fork-bomb ceiling
  disk: 2Gi                       # volume + log ceiling

services:                         # may be empty
  - { type: mongo,  version: "7",   name: db }
  - { type: qdrant, version: "1.9", name: vectors }

auth:
  provider: cwl                   # cwl | none (default none)
  attributes: [ubcEduCwlPuid, mail, givenName, sn, eduPersonAffiliation]
  callback: /auth/ubcshib/callback   # PATH only, ^/[A-Za-z0-9/_-]{1,64}$ (D15)
  logout: /auth/logout               # PATH only, same validation

ai:
  models: [default-chat, default-embed]   # logical names only
  budget:
    project_monthly_usd: 50
    per_user_monthly_usd: 2

env:
  - { name: COURSE_CODE, value: CHEM_121 }
  - { name: SIS_API_KEY, secret: true }   # value held by Manifest, never in git

egress:
  allow: [api.ubc.ca, registry.npmjs.org]

data:                             # HOOK (§15)
  classification: internal        # public | internal | confidential
  retention_days: 365

integrations: []                  # HOOK (§15) — reserved, must be empty in v1
jobs: []                          # HOOK (§15) — reserved, must be empty in v1
checks: []                        # HOOK (§15) — reserved, must be empty in v1

environments:                     # per-environment overrides; resources and env only
  staging:    { resources: { memory: 256Mi } }
  production: { resources: { memory: 1Gi } }
```

### Logical model names

`ai.models` carries **logical** names (`default-chat`, `default-embed`), never
vendor model IDs. Manifest maps them to LiteLLM model groups. An admin repoints
the entire fleet at new on-prem hardware by editing one mapping — no app changes,
no redeploys, no faculty involvement.

### Sensitive fields

These seven fields, and only these, trigger re-escalation to approval (D9):

- `services`
- `auth.attributes`
- `egress.allow`
- `resources` (increase only)
- `data.classification`
- `ai.models` — a model change can move personal information to a different
  jurisdiction, which invalidates an approved PIA (§9). `data.classification`
  catches a change to the *claim*, not to where the data actually goes.
- `blueprint` (major version) — under D13 the blueprint **is** the build
  definition, so a major bump changes the Dockerfile, base image and knowledge pack
  in production. Ungated, that is an unreviewed change to every layer beneath the
  app.

The schema and the approval policy are therefore the same object. `spec/` exposes
`isSensitiveDiff(before, after) -> {sensitive: boolean, fields: string[]}`.

### Validation

Rejected at parse time, before any build:
- unknown top-level keys, or non-empty reserved blocks (`integrations`, `jobs`, `checks`)
- a `runtime.build` block of any kind (D13)
- `services[].type` outside the platform catalogue
- `auth.attributes` outside Manifest's attribute whitelist (copied into the schema
  from `passport-ubcshib/ATTRIBUTES.md`, which is prose in a repo Manifest does not
  version; a test asserts the copy has not drifted). Note `uid` is **not** a UBC
  attribute — the identifier is `ubcEduCwlPuid`. Only `ubcEduCwlPuid`, `mail` and
  `eduPersonAffiliation` are pre-authorized by UBC IAM; anything else needs
  justification in the registration request (§9).
- `auth.callback` / `auth.logout` that are not paths matching `^/[A-Za-z0-9/_-]{1,64}$` (D15)
- `ai.models` outside the platform's logical catalogue
- `ai.models` whose catalogue `max_classification` is lower than `data.classification` (D17)
- resource requests above the project's quota
- `name` differing from the project slug
- for a production release: `auth.attributes` not a subset of the app's
  `IamRegistration.registered_attributes` (§9). Failing here, at build time, turns
  a launch-day login outage into a change request.

Schema validation is then followed by a **blueprint compatibility check** against
the pinned blueprint's descriptor — services it cannot bind, auth providers it does
not support, a `manifest:` version it does not understand (§25, D30).

### Classification gates model routing (D17)

The platform's logical model catalogue carries a `max_classification` per entry:

```
default-chat-onprem    max_classification: confidential
default-chat           max_classification: internal      # may route off-prem
default-embed          max_classification: internal
```

An app declaring `data.classification: confidential` may therefore resolve only to
on-premise model groups. This is checked at spec validation, so the failure is a
clear message at build time rather than a privacy incident at runtime.

LiteLLM's own request/response logging is a related exposure: those logs contain
prompt content, which is student data. Retention and destination for LiteLLM logs
are a deliberate, documented configuration decision, not a default.

---

## 8. Environment injection contract

**Frozen**, documented in every blueprint. Verified against
`passport-ubcshib/index.js` and `tlef-starter/.env.example` — these are the names
the blueprint actually reads.

Two facts about `passport-ubcshib` shape this table, and both are easy to get
wrong:

1. **The library itself reads exactly two environment variables** —
   `SAML_ENVIRONMENT` (`index.js:120` and again at `:307`) and `SAML_LOGOUT_URL`
   (`index.js:305`). Everything else is a *constructor option*. So this is
   **Manifest's contract with the blueprint**, which passes these values into the
   strategy; it is not a set of names the library picks up by itself.
2. **`SAML_ENVIRONMENT` defaults to `'STAGING'`** — at *both* sites, `:120` and
   `:307`. An app deployed without it points at
   `https://authentication.stg.id.ubc.ca`, real UBC infrastructure. Manifest must
   therefore inject it explicitly in **every** environment, and §16's identity-path
   regression test exists to catch exactly this.

   This is a fail-open default, and it is wrong for every consumer of the library,
   not just for Manifest. Making it throw on an unset value is precisely the kind of
   change C6 permits: strictly safer for all six consuming applications, released as
   `0.2.0`, adopted deliberately. Manifest must keep working against the currently
   published version regardless — C6's final clause — so the regression test stays
   either way.

| Variable | Value | Required in |
|---|---|---|
| `MANIFEST_ENV` | `sandbox` \| `staging` \| `production` | all |
| `MANIFEST_APP_URL` | the app's own base URL | all |
| `MANIFEST_PROJECT_SLUG` | project slug | all |
| `PORT` | `runtime.port` | all |
| `SESSION_SECRET` | generated per app+environment | all |
| **`SAML_ENVIRONMENT`** | `LOCAL` for sandbox and staging (Manifest IdP), `PRODUCTION` for production. **Never left unset** — see above. | all |
| `SAML_ISSUER` | sandbox/staging: `https://manifest.ubc.ca/sp/{slug}/{env}`; production: the entityID registered with UBC IAM (§9) | all |
| `SAML_CALLBACK_URL` | `{MANIFEST_APP_URL}{auth.callback}`, derived (D15) | all |
| **`SAML_ENTRY_POINT`** | the IdP SSO endpoint. Required because `UBC_CONFIG.LOCAL` hardcodes `http://localhost:8080/simplesaml/...` and the Manifest IdP is elsewhere (§21). | all |
| `SAML_LOGOUT_URL` | IdP logout endpoint. The library's `logout()` helper reads this from **env, not options** — so it must be injected even though the entry point is passed in code. | all |
| `SAML_IDP_METADATA_URL` | sandbox/staging: the Manifest IdP; production: `https://authentication.ubc.ca/idp/shibboleth` | all |
| **`SAML_IDP_CERT_PATH`** | mounted path to the IdP's public signing certificate. **Mandatory:** the strategy builds `cert: options.cert \|\| (() => { throw ... })()`, an IIFE that evaluates at construction — so it throws unless a certificate is supplied, and the library's `_fetchCertificate()` fallback is unreachable. Manifest mounts it; the blueprint never fetches it at runtime. | all |
| `SAML_PRIVATE_KEY_PATH` | mounted path to the **SP's own** private key, used to sign AuthnRequests and decrypt assertions. Required in staging and production (the Manifest IdP requires signed AuthnRequests per §9, and real UBC encrypts assertions). Optional in sandbox. | staging, production |
| `MONGODB_URI`, `MONGODB_DB_NAME` | per declared `mongo` service | if declared |
| `QDRANT_URL`, `QDRANT_API_KEY`, `QDRANT_COLLECTION` | per declared `qdrant` service | if declared |
| `LLM_PROVIDER` | `openai` — LiteLLM is OpenAI-compatible, so the toolkit's existing provider is used unchanged | if `ai.models` |
| `LLM_ENDPOINT` | the LiteLLM endpoint | if `ai.models` |
| `LLM_API_KEY` | this app+environment's virtual key (D8) | if `ai.models` |
| `LLM_DEFAULT_MODEL` | resolves the app's first logical chat model | if `ai.models` |
| `EMBEDDINGS_PROVIDER`, `EMBEDDINGS_MODEL` | resolves the app's logical embedding model | if declared |

**A service declaration produces more than one variable.** `services[].name` is a
convenience label, not a variable name: Mongo needs a URI *and* a database name;
Qdrant needs a URL, a key and a collection. The `spec/` module owns the mapping
from a declared service to its full variable set, and that mapping is versioned
with the blueprint.

Consequence: the AI's task for authentication is *"copy the blueprint's auth
component"*, not *"implement SAML"*. This is the single largest reliability lever
in the agent experience — and it is only true while this table matches the
blueprint, so §16 carries a test asserting exactly that.

---

## 9. Identity

There are **three** identity paths, and conflating them is the easiest mistake to
make in this design. The first is easy to forget: **Manifest itself is an SP.** Its
own users log in with CWL (`identity/`, §22 step 1), so on UBC infrastructure the
control plane needs **its own IAM registration and its own platform-level PIA**,
independent of any app's. Locally it uses the Manifest IdP like everything else.

The other two are the app-facing paths (D6):

| | **sandbox + staging** | **production** |
|---|---|---|
| IdP | Manifest IdP (SimpleSAMLphp) | real UBC Shibboleth |
| Users | test users (`bio_prof`, `bio_student`) | real staff and students |
| Registration | automatic, seconds | **a request to UBC IAM, reviewed by people** (C4) |
| Keypair | per app+environment, rotatable freely | long-lived and stable (D20) |
| PIA | not required | **required** (C4) |
| `passport-ubcshib` preset | `LOCAL` (pointed at the Manifest IdP) | `PRODUCTION` |

### Sandbox and staging: SP auto-provisioning

`docker-simple-saml` keeps its IdP role here. Its file-based
`saml20-sp-remote.php` is replaced by SimpleSAMLphp's **SQL metadata source**
(`metadata.sources` with a `pdo` entry). Manifest registers a Service Provider by
inserting a row — no file writes, no container reload, no restart.

Every value **derived by Manifest** (D15):

```
entityID    https://manifest.ubc.ca/sp/{slug}/{env}
ACS         {Manifest-owned origin for this app+env} + {validated auth.callback path}
SLO         {Manifest-owned origin for this app+env} + {validated auth.logout path}
attributes  exactly auth.attributes from the AppSpec
keypair     generated per app+environment; private key stored as a Secret,
            mounted at SAML_PRIVATE_KEY_PATH
```

### Production: real UBC IAM registration

No programmatic registration exists or is assumed. Manifest's contribution is to
make the submission accurate, complete and legible to someone who has never heard
of SAML (D19) — so that what reaches the reviewer needs as little back-and-forth as
possible.

**Manifest generates the registration package** from the AppSpec, reusing
`saml-metadata-generator` as a library:

- entityID — `https://{platform-domain}/sp/{slug}/production`, where the platform
  domain is deployment configuration (`manifest.ubc.ca` on UBC infrastructure,
  `manifest.internal` locally). SAML entityIDs are identifiers, not URLs to fetch, so
  they need not resolve — but they must be **stable**, so the value is fixed at
  registration and stored on the `IamRegistration` rather than recomputed.
  Because it is registered externally, **the project slug is immutable after
  production launch**; renaming requires re-registration.
- ACS and SLO URLs, derived as in D15
- an RSA-4096 keypair and SP metadata XML in UBC's expected structure
- the requested attribute list, **each with a justification derived from where the
  app actually uses that attribute** — this is what IAM asks for, and precisely
  what a faculty member cannot write unaided
- technical and privacy contacts from the project owner and platform admins

`IamRegistration` tracks state (`draft → submitted → active`, plus
`change_requested` and `expired`) against an external ticket reference.

**Attribute drift is a build-time failure, not a login-time one.** Manifest stores
`registered_attributes` and validates every production release against it (§7). If
the agent adds an attribute IAM never registered, the build fails with a plain
message and a pre-generated change request, long before a student would have hit
a broken login.

**Certificate lifecycle.** `saml-metadata-generator` issues certificates valid for
one to five years. An expired SP certificate silently breaks authentication for a
live course application, and nothing surfaces it until it is already urgent.
Manifest records `cert_expires_at` and raises escalating alerts starting 90 days
out; renewal is a tracked IAM change request with an overlap window (D20).

### Privacy Impact Assessment

A PIA is required per production app (C4). Manifest generates the draft from what
it already holds, so the owner reviews and signs rather than authoring from
nothing:

| PIA needs | Manifest derives it from |
|---|---|
| What personal information is collected | `auth.attributes` plus the app's schema |
| Where it is stored | `services:` and their environments |
| Where it flows | `egress.allow`, `ai.models`, `data.classification` (§7) |
| Retention and disposal | `data.retention_days`, plus the sunset policy |
| Who is accountable | project owner, collaborators, platform admins |
| Hosting and jurisdiction | the driver's placement and the model catalogue's `max_classification` |

`PrivacyAssessment` tracks `draft → submitted → approved`. Production deployment
is blocked until it is `approved`.

### Toward automated submission (direction, not a v1 feature)

Today Manifest **drafts and tracks**; a person submits, and colleagues at UBC IAM
and the Privacy Office review. That division is correct for v1 and is not a
workaround — but it is not the end state either.

Everything needed to submit directly already exists in the design: the registration
package is generated (§9), the PIA draft is generated, both are first-class tracked
objects with state machines (D19), and both carry the external ticket reference that
a submission API would populate. What is missing is an agreed machine interface on
the receiving side, and the trust relationship that would justify one.

So the hook is real and the sequencing is deliberate: `IamRegistration` and
`PrivacyAssessment` are modelled as objects with submission state rather than as
attachments or checklist booleans, precisely so that "submitted by a human, with a
ticket reference pasted in" and "submitted over an API" are the same state
transition with a different driver behind it. This mirrors the source and runtime
driver pattern (D5, D10): one interface, a manual first implementation, a
programmatic second one when it is available.

**What this changes for a faculty member today: nothing.** They must plan for review
time. What it changes for the design is that we do not build anything that would
have to be unpicked when submission becomes programmatic.

### Pre-production rehearsal (D21)

Before first production launch, the app is exercised once against UBC's staging
IdP (`authentication.stg.id.ubc.ca`) using the `STAGING` preset. This validates the
registration, the attribute release and the certificate against real Shibboleth —
so that launch day is not the first time any of it is tested. The rehearsal is a
`LaunchReadiness` item, not part of the daily build loop.

### Registration hardening

Registering an SP means instructing the IdP to send signed assertions about a real
person to a URL. That makes the registration path a high-value target, and the move
to SQL-backed metadata widens it. Controls:

- **Origins are never accepted as input.** The app supplies a path; Manifest
  supplies the origin, computed from the project slug, environment and the
  platform's own domain. A free-text ACS URL is an assertion-phishing primitive.
- **The SimpleSAMLphp *metadata* database user is read-only** — verified in S2 with
  `CONNECT`, schema `USAGE` and `SELECT` only. Only the control plane writes SP
  metadata, through parameterized statements. Note the scope: SimpleSAMLphp's
  session and data store (`store.sql.*`) is a **separate subsystem with its own
  credentials, and it writes**. Reading this as "SimpleSAMLphp never writes to
  Postgres" would mis-provision §21's shared server.
- **The deployed IdP ships no `saml20-sp-remote.php`.** S2 found that when the same
  entityID exists in both a flatfile and the SQL store, **the first matching
  `metadata.sources` entry wins** — so a stale file silently shadows a
  control-plane-written row and nothing reports it. `docker-simple-saml`'s current
  file defines 15 SPs, which Manifest would inherit unless packaging removes it.
  `make doctor` should assert its absence.
- **Every registration and change is an append-only audit Event**, with alerting
  specifically on ACS URL changes.
- **The Manifest IdP signing key is in separate custody** from application
  secrets, with a documented rotation procedure. Under D6 it signs assertions only
  for test users in sandbox and staging, so its compromise never touches a real
  identity — but it can still be used to forge access to a staging app holding
  real work, so it is treated as sensitive. The genuinely top-tier identity
  secrets are the **production SP private keys** (§3.5), one per production app.
- **The deployed IdP must not inherit the local development configuration.**
  `docker-simple-saml/config/simplesamlphp/saml20-sp-remote.php` currently sets
  `validate.authnrequest => false` and `validate.logout => false`. Both must be
  `true` in staging and production; Manifest mints a per-app keypair anyway, so
  requiring signed AuthnRequests costs nothing.

### Attribute changes are gated in every environment (D16)

A newly requested attribute re-escalates to approval regardless of the target
environment. Under D6 staging uses the Manifest IdP with test users, so the
harvesting risk is lower than first assessed — the control is retained for a
stronger reason: in production, `auth.attributes` must be a subset of what UBC IAM
registered, so catching the change at approval turns a launch-day login outage into
a change request raised weeks earlier.

### Enforced attribute release (sandbox and staging)

Attribute release is enforced **at the IdP** by the `core:AttributeLimit`
processing filter, populated from `auth.attributes`. An app cannot receive an
attribute it did not declare.

**S2 found this is not free, and its failure mode is silent.** The filter is **not
in SimpleSAMLphp's default chain**: without it the metadata row's `attributes` list
is advisory and every attribute the auth source produced is released (13 where 3
were declared). Even with the filter enabled, a row whose `attributes` key is
**missing or empty** releases everything, because the filter treats an empty
allow-list as "no limit". Two requirements follow, and neither is optional:

- Manifest's IdP configuration enables `core:AttributeLimit` in `authproc.idp`.
- Registration **rejects** a row whose `attributes` list is missing or empty, before
  it is written; a database constraint should make the half-written row impossible.

With both in place the enforcement is real and was verified end to end. The approval
diff on that field is therefore backed by enforcement rather than by trust — which
is what makes reviewing it worth doing.

### Local behaviour

The same IdP runs on the laptop with the existing `bio_prof` / `bio_student` test
users from `authsources.php`. **App code is identical across all three
environments — because the blueprint makes it so, not because the environments
match.** They do not: `docker-simple-saml` releases friendly attribute names
(`saml20-idp-hosted.php` sets `attributes.NameFormat => basic`), while real UBC
Shibboleth sends OID and MACE URNs. `tlef-starter` carries
`server/src/components/auth/saml-attributes.ts` precisely to bridge that, because
`passport-ubcshib`'s own mapping has gaps.

**S2 closed most of that gap.** Manifest's own IdP instance sets URN/OID attribute
naming **per SP, from the metadata row** (`attributes.NameFormat` plus a per-SP
`core:AttributeMap` `authproc`), so sandbox and staging exercise the attribute
vocabulary production uses. Two conditions come with it: the blueprint must pass
`attributeConfig` to `passport-ubcshib` — the library only runs its OID mapping when
that option is non-empty — and must carry a complete attribute map, because the
library's own covers six names, has **no OID entry at all for `uid` or
`eduPersonPrincipalName`**, and its MACE entry for `ubcEduCwlPuid` is unreachable (a
reverse-map collision). `ubcEduCwlPuid` is in no attribute map SimpleSAMLphp ships,
so its OID is supplied inline.

**Use OID, not MACE. Confirmed:** `tlef-biocbot` authenticates against UBC
Shibboleth in **both staging and production** with no bridge of its own, and the OID
is its only reachable key for `ubcEduCwlPuid` — so real UBC Shibboleth sends OID.
The library's MACE gap is therefore latent rather than active, and **no
`passport-ubcshib` change is required for Manifest** — `tlef-starter`, the first
blueprint, already carries a bridge accepting both forms, and C6 forbids a library
change being a prerequisite in any case.

Manifest inherits that bridge in the blueprint. **This does not retire D21's
pre-production rehearsal:** registration validity, the certificate and UBC's actual
release policy still need proving against real Shibboleth, and which format UBC
sends is not yet known. That parity is what makes the production cutover a configuration
change rather than a code change, which matters when the code was written by an
agent that will not be present at launch.

### Risk

SimpleSAMLphp's SQL metadata source was an unverified property of third-party
software. **S2 verified it against SimpleSAMLphp 2.4.9 on 2026-08-29: the answer is
yes, and Manifest writes no PHP at all.** One `INSERT` registers a working SP on the
next HTTP request — no file write, no reload, no restart, and no metadata cache to
expire. Per-app keypairs, signed AuthnRequests and per-SP attribute naming all work
from the row. The residual risk is narrower and different in kind: a SimpleSAMLphp
**major upgrade** changing `MetaDataStorageHandlerPdo` or the `authproc` contract,
which a fixture test asserting that a known-good row still yields a known-good
assertion will catch in CI rather than in staging.

It is **not** the design's highest technical risk, and an earlier draft that said so
mispriced it. Auto-provisioning does not collapse without it: `docker-simple-saml`
is ours (§2), so a "no" means writing a metadata source module — implementing one
documented SimpleSAMLphp abstract class in a repository we already extend — rather
than redesigning §9. That fallback is in some respects *better*: we would own the
schema and the caching behaviour instead of inheriting both. What a "no" costs is
PHP we maintain and review on each SimpleSAMLphp major upgrade.

**The highest-risk technical unknown is S7's split-horizon DNS question** (§12): a
hostname must resolve correctly both from the developer's browser and from inside a
container, and no amount of ownership makes that requirement go away.

The highest-risk dependency overall is not technical: it is the **per-app IAM
registration and PIA turnaround** imposed by C4. It cannot be engineered away, only
absorbed and made fast (D19), and it sets the true lead time on every production
launch.

---

## 10. AI access

Manifest calls LiteLLM's admin API (`/key/generate`, `/key/update`, `/key/delete`,
`/user/new`, spend endpoints). It builds no gateway of its own (D7).

| Key | Scope | Lifetime | Budget source |
|---|---|---|---|
| **App key** | app + environment | rotated every deploy, revoked on archive | `ai.budget.project_monthly_usd` |
| **Agent key** | one `AgentSession` | dies with the sandbox | hard session cap, independent of the app budget |
| **End user** | app passes hashed `ubcEduCwlPuid` as LiteLLM `user` | per request | `ai.budget.per_user_monthly_usd` |

Local topology: LiteLLM + Postgres in Compose, configured against Ollama on the
host. Virtual keys and budgets work identically; the budgets simply never bind.

UBC topology: the same LiteLLM, fronting on-prem hardware plus commercial
providers, with real budgets.

---

## 11. Execution model

### Driver interface

Everything the control plane may ask of infrastructure, and nothing more:

```ts
interface Driver {
  buildImage(src: SourceRef, spec: AppSpec): Promise<ImageRef>
  ensureService(b: ServiceBinding): Promise<ServiceHandle>   // idempotent
  ensureInstance(d: InstanceSpec): Promise<InstanceHandle>   // idempotent
  stopInstance(id: string): Promise<void>       // hibernate — volumes survive
  destroyInstance(id: string): Promise<void>
  destroyService(id: string, opts: { deleteData: boolean }): Promise<void>
  status(id: string): Promise<InstanceStatus>
  logs(id: string, opts: LogOpts): AsyncIterable<LogLine>
  exec(id: string, cmd: string[], opts: ExecOpts): ExecStream  // sandbox only
  snapshotService(id: string): Promise<SnapshotRef>            // production only
  capabilities(): DriverCapabilities
}
```

Every call is idempotent and keyed by a deterministic name derived from
`(project, environment, release)`. That property is the entire reason
reconciliation is safe to retry.

`capabilities()` lets a driver honestly declare what it cannot enforce, rather than
silently pretending. The Docker driver reports
`{ enforcesEgress: true, isolationLevel: 'container', remoteTarget: false }` — it
*does* enforce egress, via an internal network with a proxy-only route (§12), which
is why default-deny egress is in Phase 1's non-negotiable baseline (§17).
`isolationLevel` (`container` | `gvisor` | `vm`) matters most for sandboxes, where a
plain container is a weak boundary around unreviewed code; the hardening baseline is
in §12 and spike S6 tests it. `remoteTarget` drives the image-promotion rule (§13). The control plane surfaces declared-but-unenforced policy as a warning
on the app, not as a silent gap.

### Lifetime policies

| | **sandbox** | **staging** | **production** |
|---|---|---|---|
| Lifetime | destroyed after 45 min idle | hibernated after 7 days idle | always-on (hibernate opt-in) |
| Hostname | `{slug}-sbx-{id}` | `{slug}-staging` | `{slug}` |
| Listener | internal | internal | public |
| `exec` | yes | no | no |
| Egress | broad (registries), via forced proxy | spec-declared | spec-declared |
| Data | disposable volumes | persistent, resettable | persistent, backed up |
| Secrets | throwaway only | environment secrets | environment secrets |
| AI key | session-scoped, hard cap | app key | app key |
| Approval | none | none | first launch + sensitive diff |

**Rule, stated concretely because it is easy to violate by accident: a sandbox
never receives staging or production secrets.** It receives its own scoped
LiteLLM key and its own throwaway database credentials. Nothing else.

### Instance state machine

```
pending → building → provisioning → starting → healthy
                                       ↓          ↕
                                    failed   hibernated ⇄ waking
                                                  ↓
                                             destroying → gone
```

One reconciliation loop **per project, serialized**. No two reconciliations of the
same project run concurrently, which removes an entire class of race conditions at
no cost. Failures back off exponentially and surface as an `Event`; there is no
silent retry.

Per D10, Phase 1 implements these transitions as a straight-line function driven
by API calls. Phase 4 wraps that same function in the loop.

### Hibernation and wake-on-request

The edge holds the incoming request, asks the control plane to wake the instance,
and proxies through once it is healthy. **The exact mechanism is S4's question**, not
a settled design: a response body cannot be streamed and then replaced by a proxied
response, so the options are a retry window at the edge (Caddy's `lb_try_duration`)
for short waits, or a holding page that polls and reloads for longer ones. The
difference matters to both user experience and timeouts, so the spike decides it. Because
services are dedicated per app (D3), the database hibernates with the app, so an
idle app consumes nothing. This is what makes C5's ~500-app case affordable.

---

## 12. Networking, routing, secrets

### Edge

Caddy, driven by its JSON admin API from `routing/`. Two listeners:

- **internal** — sandbox and staging. On UBC infra, bound to an internal-only
  address. On the laptop, loopback.
- **public** — production only.

The staging-is-UBC-only requirement is met by listener assignment, not IP
allowlisting: a misconfigured allowlist leaks quietly, whereas a route bound to
the wrong listener is simply unreachable.

### DNS

A hostname in this system is resolved from **two different places** — the
developer's browser on the host, and a process inside a container — and it must
resolve correctly from both, because a SAML `entityID` and ACS URL must match
byte-for-byte in both contexts (§9).

`*.manifest.localhost` fails that test. It resolves fine on the host (verified on
macOS: `dscacheutil` returns both `::1` and `127.0.0.1`), but **inside a container
`.localhost` is the container's own loopback** — so an app container fetching
`SAML_IDP_METADATA_URL` would call itself, and Manifest's health checks would do
the same. It also does not resolve at all on Linux, where glibc special-cases
`localhost` but not `*.localhost`, which breaks any colleague not on a Mac.

The design is therefore:

- **`*.manifest.internal`**, served by **dnsmasq**.
- **Not `*.manifest.test`.** S7 found that Laravel Valet claims the entire `.test`
  TLD — its own dnsmasq on port 53 answering `address=/.test/127.0.0.1`, plus nginx
  on ports 80 and 443 — and several UBC developers run Valet. The failure is quiet:
  names resolve, so DNS looks healthy, and requests land on the wrong web server.
  `.internal` was reserved by ICANN in July 2024 for exactly this purpose and will
  never be delegated publicly.
- On the host, `/etc/resolver/manifest.internal` points at it. Scoped to
  `manifest.internal` rather than all of `.internal`, because Docker's own
  `host.docker.internal` and `gateway.docker.internal` live in that TLD and must
  keep resolving. The same scoping rule that protects a developer's other projects
  protects Docker's names here.
- Containers receive it as their resolver. This is **per-container** (`--dns` takes
  an IP and no port), not a Docker network setting, so the driver configures every
  workload container explicitly. On Docker Desktop `--dns` sets the **upstream** for
  Docker's embedded resolver rather than replacing it, so container-to-container
  service names keep working — provided our dnsmasq forwards non-zone queries back
  to `127.0.0.11`.

**Settled by S7** (`docs/superpowers/spikes/S7-findings.md`). The host needs these
names to resolve to a loopback address while containers need an address they can
route to, and a single A record cannot serve both. `--address` is global to a
dnsmasq **process**, not per-interface — verified, so interface-bound views do not
exist. The answer is **two dnsmasq processes, run as two containers**:

- **Containers** — `--listen-address=<dnsmasq-A's platform-network IP>`,
  `--address=/manifest.internal/<Caddy's platform-network IP>`. Workload containers
  get `--dns <dnsmasq-A's IP>`.
- **Host** — `--listen-address=<dnsmasq-B's platform-network IP>`,
  `--address=/manifest.internal/127.0.0.2`, published to the host as
  `127.0.0.1:7153` (UDP **and** TCP). `/etc/resolver/manifest.internal` carries
  `nameserver 127.0.0.1` and `port 7153`.

Two containers rather than two processes in one, because each needs
`--bind-interfaces` on a different address and a container has one platform-network
IP; `docker logs` then also separates host queries from container queries, which is
most of the debugging value when this misbehaves.

Three flags are load-bearing and none is obvious:

- **`--local=/manifest.internal/`** — without it dnsmasq answers AAAA with
  **SERVFAIL** rather than NODATA, and both musl and glibc treat SERVFAIL on either
  half of a dual-stack lookup as total failure. The symptom is
  `curl: could not resolve host` **while `dig +short` returns the correct A record**.
- **`--server=127.0.0.11`** — forwards everything outside the zone to Docker's
  embedded resolver. Without it, `--no-resolv` makes dnsmasq authoritative for the
  whole namespace and containers lose service names and external resolution alike.
- **`--bind-interfaces`** — required to bind one address rather than the wildcard.

Verified end to end: `https://console.manifest.internal/` returns the same response
from the host browser, host `curl` and inside a container, with a trusted
certificate and no port in the URL — including names allocated at runtime through
Caddy's admin API.
- Everything binds `127.0.0.1` explicitly; relying on `::1` produces intermittent
  failures under Node's IPv6-first resolution order.
- UBC: a wildcard DNS record per listener.

**The names themselves — the zone per environment kind, custom production domains
and their verification and certificates — are §23.** This subsection settles only
how a name resolves in both contexts.

### Egress — default deny, every environment (D18)

All environments route outbound traffic through a forced HTTP(S) proxy. The policy
is **deny by default**: a platform baseline (the registry mirror, LiteLLM, the
Manifest IdP) plus whatever the app declares in `egress.allow`.

Sandboxes get a wider baseline than production, but **that baseline is the package
mirror, not the public registries** — Verdaccio is the only dependency source, which
is what makes C1's offline claim true and what gives the supply-chain controls below
something to enforce. Production is narrower still: an app that suddenly needs a new
outbound destination is a signal, not a convenience.

`capabilities()` still reports what a driver cannot enforce, and any
declared-but-unenforced policy surfaces as a warning on the app rather than a
silent gap.

### East-west isolation

Dedicated per-app services (D3) provide nothing if every container shares one
bridge network. Each app+environment gets its own network, and the following are
denied by default:

- app → any other app or its services
- app or sandbox → the control plane API
- app or sandbox → the LiteLLM **admin** port (the proxy port only is reachable)
- app or sandbox → the IdP administrative interface
- app or sandbox → `169.254.169.254` and any cloud/hypervisor metadata endpoint
- app or sandbox → UBC management subnets

### Container hardening baseline

Applies to every app, service and sandbox container, on every driver:

- **The container runtime socket is never exposed to a workload container.** This
  is the primary container-escape path and it is worth naming explicitly: the
  reference compose file at `/Users/rich/Developer/coder.com/docker-compose.yml` mounts
  `/var/run/docker.sock`, and that pattern is deliberately rejected here. The
  control plane's own socket access is unreachable from any container network.
- never `--privileged`; `cap-drop ALL` with a minimal, documented add list
- `no-new-privileges`, read-only root filesystem with explicit tmpfs mounts
- the default seccomp profile, never `unconfined`
- user-namespace remapping; the blueprint runs the app as a non-root UID
- resource ceilings including `pids` and disk, not only CPU and memory

`DriverCapabilities.isolationLevel` (`container` | `gvisor` | `vm`) records the
strength of the boundary a driver actually provides. A plain container is a weak
boundary for a sandbox running unreviewed code; recording that honestly is what
lets us upgrade sandboxes to a stronger runtime later without redesign.

### The builder

Build time is the most privileged moment in the pipeline (D13), so the builder is a
specified component, not an implied one:

- **Ephemeral per build**, created and destroyed by the driver.
- **Holds no control-plane credential** — no database access, no driver access, no
  secrets. It receives a source tree, a blueprint-generated Dockerfile and a
  registry push token scoped to one repository path.
- **Network-restricted to the package mirror and the registry.** Nothing else,
  including the control plane. This is what makes "network-restricted builder" in
  §20's control map a real control rather than an aspiration.
- **Rootless BuildKit**, so a malicious dependency's build script cannot reach the
  host daemon.
- **Bounded**: build timeout, disk quota, and a concurrency cap per project and
  globally.

It appears in §21's local inventory as a transient container, not a long-running
service.

### Supply chain

The agent installs packages it chose, sometimes packages it hallucinated —
*slopsquatting*, where an attacker registers a plausible name an LLM invents, is a
live attack class aimed squarely at this workflow.

- dependencies resolve through a **private registry mirror** with an allowlist, or
  allowlist. (Quarantine-on-first-use is the Phase 4+ alternative; v1 picks the
  allowlist, because two mechanisms would be built and neither finished.)
- committed lockfiles are required; builds fail without one
- install scripts disabled where the ecosystem allows it
- base images pinned by digest, not tag
- an SBOM is produced per build and retained with the Release (Syft or equivalent,
  in the local inventory)

**Offline behaviour, stated because scanners age badly.** Vulnerability databases go
stale without network. `make seed` pulls the scanner database; `make doctor` reports
its age. Secret scanning and lockfile enforcement are pattern-based and run fully
offline, so they never degrade. Vulnerability scanning **warns rather than blocks**
when its database is older than 7 days, and the staleness is recorded on the Release
— a local developer is not stopped, and a stale scan can never be mistaken for a
clean one.
- dependency and secret scanning run as **platform-mandatory build gates** on
  every build — they are not app-declared and cannot be waived by an app

### Backups

Production `ServiceInstance` volumes are snapshotted nightly by a Manifest-owned
job, one per service instance, through a `Driver.snapshotService()` call. Retention
comes from `data.retention_days`. Staging and sandbox volumes are never backed up —
staging is resettable by design and sandbox data is disposable. This is the
centrally-owned answer to the backup fan-out cost accepted in D3.

### Secrets

Envelope-encrypted in Postgres (libsodium sealed box). The master key comes from a
file locally and from Vault/KMS on UBC infra. Secrets are never written to git,
are injected at container start as environment variables or mounted files, and are
scrubbed from the control plane's own `process.env` at boot so that any child
process it spawns cannot read them. Rotation is re-inject plus instance restart.

---

## 13. Releases and approvals

A **Release** is immutable: `Build` (image digest) + `AppSpec` + resolved config.

**Promotion never rebuilds.** Production runs the exact digest that staging ran.
This eliminates dependency drift between what was tested and what is public.

### First production launch is a checklist, not a button (D19)

Because every production app needs its own IAM registration and PIA (C4), the
first launch is gated on `LaunchReadiness` — external state Manifest tracks and
drives, rather than a single approval click:

| Item | Owner | Blocking |
|---|---|---|
| `IamRegistration` is `active` | UBC IAM, package generated by Manifest (§9) | yes |
| `PrivacyAssessment` is `approved` | UBC Privacy Office, draft generated by Manifest (§9) | yes |
| Pre-production rehearsal passed (D21) | Manifest, automated | yes |
| Dependency and secret scans clean (§12) | Manifest, automated | yes |
| Admin approval of the release | platform admin | yes |

The first two have multi-week lead times, so Manifest surfaces them the moment a
project is created — not at the point the owner asks to go live. A faculty member
should never discover the existence of a PIA on the day they wanted to launch.

### Gate (D9)

1. **First launch to production** — requires the full `LaunchReadiness` checklist
   above.
2. **Subsequent releases** — self-serve, *unless* `spec/isSensitiveDiff()` reports
   a change to a sensitive field (§7), in which case the release re-escalates. A
   change to `auth.attributes` additionally requires an IAM change request to
   reach `active` before the release can deploy (§9).

The approval record captures a `diff_snapshot`: image digest, `manifest.yaml`
diff, services requested, CWL attributes requested, resource delta, and an
AI-written plain-English summary of what changed since the last approved release.

### Integrity of the gate

- Approval binds to an **immutable image digest**, and deployment verifies that
  digest before starting anything. Binding to a tag would let a later push
  silently replace approved content.
- The image registry **rejects pushes from app and sandbox contexts**. Only the
  builder may push. Without this, "promotion never rebuilds" is defeated by
  overwriting a tag.
- Approval is a non-repudiable record: actor, timestamp, and the exact diff shown
  at decision time. Approving requires step-up re-authentication (§20).
- **Images built on a developer laptop never reach UBC infrastructure.** Developer
  machines are arm64; UBC infrastructure will be x86-64, and "promote the exact
  digest" makes an architecture mismatch unresolvable at deploy time rather than
  build time. Everything reaching *UBC* staging or production is built by CI on the
  target architecture.

  The rule is scoped to the **driver**, not the environment kind: laptop builds go
  to a `local/` registry namespace, and a driver whose `capabilities()` declare a
  remote target refuses it. A laptop's own staging environment runs on the local
  Docker driver and accepts `local/` images — which is what makes the Phase 1
  journey (§1) possible offline. Attaching the rule to "staging and production"
  would have forbidden the only image a laptop can produce.

### Residual risk, stated plainly

**The gate reviews `manifest.yaml`, not code.** Under D9, after an app's first
production launch, arbitrary code changes reach production without human review;
only changes to the five sensitive fields re-escalate. This is an accepted trade
for faculty velocity, not an oversight. The compensating controls are the
containment measures in §20 — default-deny egress, network isolation, least
privilege, edge-enforced protections — which are what make unreviewed code
tolerable in production at all.

### Roles

- **platform admin** — approves releases, sets quotas, manages blueprints and the
  model catalogue, sees the whole fleet.
- **project owner** — the faculty member. Full control of their own project.
- **collaborator** — invited TA or co-instructor. Same as owner except member
  management and deletion.

---

## 14. Observability

- Every `Event` carries a **faculty-legible** `human_message` alongside
  `machine_detail`. *"Your app couldn't start — it's asking for a database it
  hasn't declared"*, not `exit code 1`.
- Build and deploy logs stream over WebSocket to the front-end.
- Per-app metrics: request count, error rate, p95 latency, memory, AI spend.
  Sufficient for a faculty dashboard; not a general-purpose metrics system.

### Incidents

A crash loop or failed health check produces a structured `Incident`: exit reason,
last 200 log lines, the failing check, and the diff since the last healthy release.

The `Incident` is deliberately shaped to be handed **straight back to an AI agent
as a repair prompt**. The app broke; the platform has already assembled everything
needed to fix it; the faculty member never reads a stack trace. This closes the
loop from "AI builds it" to "AI keeps it running" and costs almost nothing, since
the data is captured regardless.

### Redaction at capture

That same feature is the platform's most reliable exfiltration path, and it
crosses a model-provider boundary. Applications log connection strings, tokens and
whole environment dumps as a matter of routine.

Therefore `Incident.log_tail`, build logs and `Event.machine_detail` are
**redacted at capture, never at display** — the unredacted form is never persisted.
Redaction matches every value in the app's own secret set (an exact, high-confidence
match), plus entropy and pattern heuristics for tokens and credential-bearing URLs.

This is defence in depth, not a guarantee: heuristics miss things. It is one reason
production secrets never reach a sandbox (§11) and why the blast radius of any
single app's secrets is limited to that app and environment.

---

## 15. Extension hooks

Deliberately built now because they are cheap today and expensive to retrofit.
Everything else on the ambition list can wait.

| Hook | Shipped in v1 as | Unlocks later |
|---|---|---|
| `Instance.kind` (`web`\|`worker`\|`cron`) | always `web` | scheduled jobs and background workers |
| `integrations: []` in the spec | reserved, must be empty | LTI 1.3 launch inside Canvas; roster/class-list integration via `FakeAcademicAPI` and `canvas-bridge` |
| `data: {classification, retention_days}` | **partly enforced already**: `classification` gates model routing at spec validation (D17); `retention_days` drives backup retention (§12). Placement is the unenforced part. | FIPPA-driven placement constraints |
| `Project.forked_from` | **used from Phase 2** — the showcase ships with forking (§27) | remix at scale; provenance across a fleet of derived apps |
| `Project.visibility` / `published` | **used from Phase 2** — the showcase (§27) | department- and faculty-scoped galleries; curation |
| `IamRegistration` / `PrivacyAssessment` submission state | a human submits and pastes a ticket reference | **direct submission to UBC IAM and the Privacy Office** when a machine interface exists on their side (§9). Modelled now as a state transition with a swappable driver, so nothing is unpicked later |
| `auth.audience` — *who* may sign in, not just *whether* | reserved; today an app admits any valid CWL holder | **roster-scoped access**: only students registered in a named course section. Needs the roster integration below, but the *question* is asked from day one because the answer changes the attribute request and the PIA even while the answer is "everyone with a CWL" |
| `checks: []` in the spec | reserved, must be empty | *app-declared* checks. Platform-mandatory scanning (dependency, secret) does **not** use this field — it runs on every build regardless (§12). Unlocks the automated WCAG accessibility gate before public launch (a legal requirement for UBC; `tlef-starter` already carries Playwright a11y configs). |
| Platform-initiated `AgentSession` | **Phase 3**, with sandboxes — an AgentSession has nothing to attach to before then. Callable by any client holding a delegated token (D24). | self-healing apps: crash at 2am, repair sandbox opens, owner accepts a release in the morning |

**Named but explicitly not designed here:** auto-sunset of dormant apps (falls out
of hibernation plus Events), cost and carbon attribution per department (falls out
of Events plus LiteLLM spend), and app export as repo + compose file (falls out of
`manifest.yaml` plus the blueprint).

---

## 16. Testing

The highest-leverage decision: a **fake Driver**, an in-memory implementation of
the interface. It lets the entire control plane — reconciler, approval logic, API,
routing decisions — be tested with no Docker, no network, in milliseconds. Most of
the system becomes ordinary test-first development.

| Tier | Covers |
|---|---|
| **Unit** | spec parse/validate/diff/sensitivity, state-machine transitions, policy decisions, injection-contract rendering. Pure functions, no I/O. |
| **Driver contract suite** | One suite every driver must pass. The k8s driver later proves itself against the exact tests the Docker driver passes — this is what keeps the abstraction honest rather than aspirational. |
| **Authorization contract suite** | Every API route, exercised as owner, collaborator, unrelated user, and admin. IDOR is the likeliest bug class in a multi-tenant control plane, so tenant isolation is a test tier rather than a code-review hope. |
| **Injection-contract drift** | The §8 table is asserted against the blueprint: every variable the blueprint reads is injected, and `SAML_ENVIRONMENT` is never absent. This is what keeps §8 honest — it was wrong once, from being written against memory of the libraries rather than against them. |
| **Identity-path regression** | A production release whose `auth.attributes` exceed `IamRegistration.registered_attributes` fails at build; a production environment never resolves to the Manifest IdP; a sandbox or staging environment never resolves to real UBC Shibboleth; certificate expiry within 90 days raises an alert. |
| **Security regression** | Secrets never appear in captured logs, incidents or events; a sandbox cannot reach the control plane, the LiteLLM admin port or a metadata endpoint; a spec with a `runtime.build` block or a non-path `auth.callback` is rejected; a `confidential` app cannot resolve an off-premise model. |
| **Contract** | The OpenAPI document is generated from the routes and checked in; drift fails CI. `manifest-mock` is validated against the same document, so a front-end built against the mock cannot compile against a contract the real API does not serve. |
| **Integration** | Real Postgres, real Docker driver, one tiny fixture app; Supertest per route. |
| **Acceptance** | The §1 journey, driven twice against the same published API: by a human in the reference console, and headlessly in CI by a script using the same generated client. Two independent clients over one contract. |
| **API completeness** | `console/` imports nothing but `contract/`. A violation fails the build — this is what makes "the API is sufficient" a checkable claim rather than an assertion. |

### The proof app

Deliberately tiny; exercises every integration on one page:

> log in with CWL → write a note to its own Mongo → ask the LLM a question →
> display the answer.

If that runs on a MacBook, the platform is real.

---

## 17. Phasing

### Phase 0 — Spikes (throwaway code; each answers one question)

| ID | Question |
|---|---|
| **S2** | *Run first.* Does SimpleSAMLphp's SQL metadata source actually work such that inserting a row registers a functioning SP? A "no" reshapes §9, and that is worth learning in an afternoon rather than in month two. |
| **S1** | Docker round-trip: repo → image → routed, healthy container with a bound database. |
| **S3** | LiteLLM + Ollama + virtual keys + budgets on macOS. |
| **S4** | Wake-on-request: can Caddy hold a request while the control plane starts an instance? |
| **S5** | Sandbox `exec` with an agent running inside, producing a commit. |
| **S7** | **The local baseline boots.** The full platform stack of §21 plus the dnsmasq/`manifest.internal` resolution design, on a clean machine, offline after seeding. This is the spike that decides whether C1 is a real constraint or an aspiration, and it is cheap — run it early. |
| **S6** | **Container isolation.** With the hardening baseline of §20 applied, what can a hostile process in a sandbox actually reach — the runtime socket, the control plane, another app's database, a metadata endpoint? Establishes whether plain containers are adequate for sandboxes or whether gVisor/Kata is needed, and produces the security regression tests. |

**S7 runs first, alongside S2.** Phase 1a's entire deliverable is the local baseline,
so S7 is its prerequisite rather than a nice-to-have — and it must settle the
split-horizon DNS question §12 leaves open. S2 runs first among the rest because a
"no" reshapes §9. S1 and S3 follow. **S6 is required before Phase 3** (the first time
untrusted code executes with `exec`), and earlier is better; it must also test the
host-gateway exposure recorded in §21's divergences. S4 and S5 may run alongside
Phases 1–2.

### Phases

**Phase 1 is three increments, not one.** As first written it pulled in fifteen of
the seventeen modules in §5 plus the whole of §21 — a platform, not an increment. It
also could not be sequenced honestly, because D22's "the console proves the API is
complete" is a *retrospective* check that wants the API to exist, while §1's "the
journey must be clickable" wants the console to co-evolve with it. Splitting resolves
both.

| Phase | Deliverable | Question answered |
|---|---|---|
| **1a — Baseline & deploy spine** | S1–S3 + S7 applied. §21's local stack (dnsmasq/`manifest.internal`, custom Caddy + trusted CA, Postgres, registry, Verdaccio, egress proxy, builder), `make seed/up/reset/doctor`. Driver interface + Docker driver + fake Driver + driver contract suite. Spec parse/validate, local git driver, service provisioning, staging deploy, routing. **The blueprint *machinery*** — the §25 registry, descriptor parsing, `checkBlueprintCompatibility()` and major-version pinning — plus **one minimal blueprint**, because under D13 the builder needs a Dockerfile from somewhere and D30's argument applies to the builder, health check, service catalogue and injection contract that all live here. **All cross-cutting security lands here**: container hardening, per-app networks, default-deny egress, authorization contract suite. **Demo:** a fixture app routed and healthy at a `manifest.internal` URL, from a clean checkout, offline. | Does C1 hold, and is the containment real? |
| **1b — Identity, secrets & AI** | SP auto-provisioning against the metadata mechanism S2 selects, per-app keypairs, `secrets/` envelope encryption, the §8 injection contract, the **`node-ts-mongo` blueprint *content*** against 1a's machinery — auth component, attribute bridge, AI wiring, knowledge pack — LiteLLM client with the classification-gated model catalogue, events, WS streaming, redaction at capture, incidents. **Demo:** the proof app — CWL login, writes to its own Mongo, asks the LLM — driven by `curl`. | Is the loop real? |
| **1c — Contract & clients** | OpenAPI generation, versioned TS client, `manifest-mock`, delegated tokens and `PendingAction` (D24), the knowledge pack API (D25), `console/` with its import boundary, a read-only `LaunchReadiness` view, **the audience question at project creation (§24) and a read-only fleet list**, the CI acceptance script. **Demo:** the §1 journey, clickable, run twice over one contract. | Is the API complete, and can a second developer reproduce all of it? |
| **2 — Environments & approvals** | production environments, promotion by digest, the `LaunchReadiness` *gate* (1c ships only its read-only view), sensitive-diff escalation, approvals with step-up re-auth, **custom domains end to end (§23), the audience tiers' production effects (§24), and the showcase with forking (§27)**, the admin console built around its queue (§26), IAM registration package + PIA draft generation | Is it safe, and can we get an app legitimately launched? |
| **3 — Sandboxes** | agent `exec`, per-session keys, preview routes; a chat pane added to the reference console against the same API; the **MCP server** (§22), making "bring your own agent" real. **The separate front-end project can now begin against a real, exercised API.** | Can an AI build here? |
| **4 — Reconciler & hibernation** | straight-line path becomes the loop; wake-on-request | Does it scale down? |
| **5 — UBC infra driver** | k8s or VM driver passing the contract suite; real deployment | Does it leave the laptop? |

**Security lands in 1a, not spread across the three.** §3.5's framing means
containment has to be true before anything runs; retrofitting per-app networks and
egress policy after services and routing exist is exactly the rework this document
avoids elsewhere.

**Two boundaries corrected, because they contradicted §1 and §9.** `secrets/` was
listed as Phase 2 but Phase 1's CWL login needs the SAML private key and
`SESSION_SECRET` — it is a **1b** module. `LaunchReadiness` was listed as Phase 2 but
§1 and §22 step 7 put "request production and see the gate" in the Phase 1 journey —
so **1c** ships the read-only view and **Phase 2** ships the gate that blocks on it.

**The blueprint descriptor is a Phase 1 item, not a Phase 5 one (D30).** It is the
only piece of §23–§26 that cannot be deferred: everything else adds capability to a
platform that already works, whereas a descriptor added after the fact is a
refactor of the builder, the health check, the service catalogue and the injection
contract at once. §23's custom domains and §24's capacity tiers both need
production environments, so both belong in Phase 2 with them — but §24's *question*
is asked at project creation, so 1c collects the answer even though nothing acts on
it until Phase 2.

**Start the proof app's IAM registration and PIA during Phase 1.** Both have
multi-week external lead times (C4). Sequencing them after Phase 2 would leave a
finished platform idling on tickets; running them in parallel means Phase 2 ends
with a genuinely launchable application. This also exercises the registration
package generator against a real IAM reviewer while it is still cheap to change.

Each phase ends in something demonstrable in a browser.

---

## 18. Non-goals

- A general-purpose PaaS. Manifest serves AI-built UBC teaching and research apps.
- Long-lived human-attached dev environments (SSH, port forwarding, IDE attach,
  persistent home directories). Coder's core product; dead weight here, because
  our users never open a terminal.
- Multi-language buildpack **auto-detection**. One blueprint in v1. Additional
  blueprints are explicit and admin-published (§25); nothing is ever inferred from
  the contents of a repository.
- A metrics or logging platform. Manifest surfaces what faculty need and forwards
  the rest.
- Programmatic registration with real UBC IAM (C4).

---

## 19. External dependencies and open questions

| Item | Status | Owner |
|---|---|---|
| SimpleSAMLphp SQL metadata source works as required | **Verified 2026-08-29 (spike S2)** against SimpleSAMLphp 2.4.9 — a row registers a working SP with no reload. Attribute release needs `core:AttributeLimit` plus registration-time validation (§9) | Manifest team |
| Final UBC target infrastructure (RHEL 9 VMs vs Kubernetes) | Undecided; Phase 5 blocked on it, Phases 0–4 are not | UBC IT |
| **UBC IAM registration for the Manifest control plane itself** — Manifest is an SP for its own CWL login (§9) | Blocks deploying the control plane to UBC infrastructure | UBC IAM + Manifest team |
| **Platform-level PIA for the control plane** (separate from each app's) | Blocks UBC deployment | UBC Privacy Office |
| On-prem model endpoints and their LiteLLM configuration | Exists; needs a logical-name mapping | Manifest team |
| Wildcard DNS and certificates on UBC infra | Needed at Phase 5 | UBC IT |
| **Privacy Impact Assessment — resolved: one per production app** (C4). Manifest generates the draft (§9); the owner reviews and signs. A platform-level PIA covering the control plane itself is still needed separately. | Blocks every production launch | UBC Privacy Office + project owner |
| **UBC IAM registration — one per production app** (C4). Manifest generates the package (§9); turnaround is external and multi-week. | Blocks every production launch | UBC IAM + Manifest team |
| Access to UBC's staging IdP (`authentication.stg.id.ubc.ca`) for the pre-production rehearsal (D21) | Needed at Phase 2 | UBC IAM |
| **Independent security review / penetration test** | Required before the first public production app | UBC IT Security |
| **Incident response ownership.** When a manifested app is breached at 3am, who responds? The faculty owner cannot. | Must be named before public launch | To be assigned |
| Breach notification procedure, and data disposal on app sunset | Required before public launch | UBC Privacy Office |
| Private package registry mirror (§12 supply chain) | Needed at Phase 1 | Manifest team |


---

## 20. Security architecture

§12 covers network, container, egress and supply-chain controls; §13 covers gate
integrity; §14 covers redaction. This section holds the controls that belong
nowhere else, and maps everything back to §3.5.

### Manifest's own front door

- Session cookies `Secure`, `HttpOnly`, `SameSite=Lax`; server-side session store;
  rotation on privilege change.
- CSRF protection on every state-changing route.
- **Admin bootstrapping is explicit:** the first administrator is created by a
  documented out-of-band procedure, never by "first user to log in wins". Role
  changes are audited.
- **Step-up re-authentication** for the privileged set — approving a release,
  reading a secret, changing a quota, changing project membership — plus the
  admin-only actions of changing the model catalogue and publishing a blueprint. A
  stolen admin session must not be sufficient to put an app on the public internet.
  The first four are exactly D24's forbidden delegated-token capabilities; the two
  admin actions are additionally restricted to platform admins. Keeping the two
  lists aligned is a test, not a convention.
- Multi-factor authentication for administrators, delegated to CWL where available.

### Credential classes (D24)

| | Obtained by | Carries |
|---|---|---|
| **Interactive session** | CWL login in a browser; `Secure`/`HttpOnly`/`SameSite` cookie, CSRF-protected | everything the user is entitled to; step-up re-auth for the most privileged actions |
| **Delegated token** | minted by the user in an interactive session, scoped to a project and a capability set, with an expiry | the build loop: create, read, build, deploy to sandbox and staging, stream events, *request* production |

A delegated token can **never** hold production promotion, secret read, quota change
or member management, regardless of how it was minted. Requesting one of those
produces a `PendingAction` that a human resolves in an interactive session. This is
enforced centrally at the authorization layer, not per-route, so a new privileged
route cannot accidentally omit it.

Delegated tokens carry **per-token rate limits and quotas**. The edge limits in this
section protect deployed apps; the control-plane API needs its own, because a
third-party agent is code the platform did not write, running on a machine it does
not control.

### Machine-actionable errors

Agents read error responses and act on them. Every error carries a stable code and a
remediation hint alongside the human-readable message — the same discipline that
makes §14's faculty-legible events work, extended to clients that are programs. This
improves the console too; it is not extra work done only for third parties.

### Authorization

Every route carries an explicit ownership check against `ProjectMember`. Because
IDOR is the most likely defect class in a multi-tenant control plane, this is
enforced by the authorization contract suite in §16 rather than by convention.

### The edge as a control point

Application code is untrusted, so baseline protections live where an app cannot
remove them. Caddy applies, on every route:

- security headers: CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`,
  `frame-ancestors`
- per-app and per-IP rate limits; request body size caps
- optionally Coraza / OWASP CRS on public production routes

**These are not stock Caddy.** Rate limiting and Coraza are third-party modules
requiring an `xcaddy` build, so §21's inventory carries a **pinned custom Caddy
image**, built during `make seed` — the one image that is built rather than pulled.
S7 built it successfully and recorded two constraints that belong in §12's
supply-chain review: **Coraza pins the Caddy version** (`coraza-caddy/v2@v2.6.0`
requires `caddy/v2@v2.11.4` and xcaddy refuses any other, so upgrading Caddy is
gated on Coraza), and **`caddy-ratelimit` has exactly one published release ever**
(`v0.1.0`) — a single-version dependency inside what this section calls the
highest-leverage control in the platform.
Security headers and the admin API are stock. Deferring the custom build would mean
calling the edge "the highest-leverage control in the platform" while shipping only
part of it.

One configuration point protects the whole fleet. This is the highest-leverage
control in the platform.

### Availability

- **Wake-on-request is an amplification primitive** — one unauthenticated request
  starts a container *and* a database. Wake is rate-limited per app and globally,
  with a cap on concurrent wakes and a queue beyond it.
- Build concurrency is bounded per project and globally; builds have timeouts.
- Sandboxes carry `pids` and disk ceilings (§7) as well as CPU and memory.

### Vulnerability management

*Phase 4+ unless noted. Specified here so the interfaces anticipate it; none of it
is needed to answer Phase 1's question.*

Dedicated per-app service containers (D3) make patching *harder*, not easier: 500
apps means 500 Mongo and Qdrant instances that will not update themselves. This is
the security half of the "version sprawl" cost accepted in D3, and it needs a
control-plane capability rather than a script written later:

- service images are **platform-owned and platform-pinned**; apps choose a
  supported version line, not an arbitrary tag *(Phase 1 — it is how services get
  provisioned at all)*
- a fleet-wide **"rebuild every app on base image X"** operation, with staged
  rollout and per-app health verification
- forced rolling upgrade of service containers on a CVE above an agreed severity
- dependency scanning as a platform-mandatory build gate (§12), reported to owners

### Audit integrity

The `events` table is append-only **by grant**, not by convention: the application
role holds no `UPDATE` or `DELETE` privilege on it. Events ship to write-once
storage; hash chaining is available if tamper evidence is later required. Reading
another project's events is an administrator action and is itself logged.

### Key management

- Application secrets use envelope encryption: per-secret data keys wrapped by a
  master key. Master-key rotation re-wraps data keys without re-encrypting
  plaintext, so rotation is cheap enough to actually happen.
- The master key comes from a file locally and from Vault/KMS on UBC
  infrastructure. **It must not share a backup domain with the Postgres
  ciphertext** — a single restored backup must never yield both halves.
- **Production SP private keys** are the highest-value identity secrets (§3.5):
  one per production app, registered with real UBC Shibboleth, long-lived by
  necessity (D20). They are held per app+environment so that a compromise is
  contained to a single application, and their expiry is tracked (§9).
- The Manifest IdP signing key is held separately from application secrets (§9)
  with its own rotation procedure. It signs only for test users (D6).

### Git driver

- GitHub App private key held in the same custody class as the master key;
  installation tokens are short-lived and scoped per repository.
- Webhook payloads verified by HMAC before any processing.
- **Repositories are private by default and enforced private.** A public repository
  containing a course application leaks student data immediately and irreversibly.
- Push-time secret scanning on both drivers; a detected secret blocks the push and
  raises an Event.
- The sandbox's git credential can push to exactly one branch of one repository
  (D14) — never `main`, never another project.

### The blueprint is a security multiplier

Whatever the blueprint contains is replicated into every application on the
platform. Secure session configuration, security headers, CSRF protection, input
validation, output encoding, parameterised queries, non-root UID, a health
endpoint that leaks nothing — done once, inherited 500 times.

Correspondingly, a vulnerability in the blueprint is a vulnerability in every app.
The blueprint therefore gets human security review on every change, which is
affordable precisely because there is only one of them (§17, Phase 1).

### Control map

| Threat (§3.5) | Primary controls |
|---|---|
| Prompt-injected agent acts as confused deputy | D14 (no mutating credential in sandbox); human-triggered infrastructure actions; branch-scoped git credential |
| Container escape from a sandbox | §12 hardening baseline; no runtime socket; `isolationLevel`; spike S6 |
| Lateral movement between tenants | per-app networks; dedicated services (D3); authorization contract suite |
| Assertion phishing via SP registration | D15 derived ACS; read-only IdP metadata user; ACS-change alerting |
| Silent attribute escalation | D16 (gated in every environment); IdP-enforced attribute release in sandbox/staging; in production, `auth.attributes` must be a subset of `IamRegistration.registered_attributes`, enforced at build (§9) |
| Production SP certificate expiry breaking a live app | D20: `cert_expires_at` tracked, escalating alerts from 90 days, renewal as a tracked IAM change |
| An app reaching production without a PIA or IAM registration | `LaunchReadiness` blocks deployment on both (§13); surfaced at project creation, not at launch |
| Personal information reaching an off-premise model | D17 classification-constrained model routing; LiteLLM log retention policy |
| Secret exfiltration through logs | §14 redaction at capture; per-app+env secret scoping; push-time secret scanning |
| Malicious or hallucinated dependency | §12 supply chain: registry mirror, lockfiles, disabled install scripts, SBOM, scanning |
| Build-time RCE | D13 blueprint-managed Dockerfiles; credential-free, network-restricted builder |
| Unreviewed code reaching production | Accepted under D9; contained by egress default-deny, network isolation, least privilege, edge controls |
| Stolen admin session approves a release | step-up re-authentication; non-repudiable approval records; digest binding |
| Resource exhaustion / DoS | wake rate limiting; build concurrency caps; `pids` and disk ceilings; edge rate limits |
| Stale, unpatched service containers | platform-owned images; fleet-wide rebuild; forced rolling upgrades |


---

## 21. Local development topology

C1 makes this a requirement, not a convenience. The bar is that **a new developer
reaches a working loop from a clean checkout**, so everything here is designed to
be verifiable rather than described.

### Platform inventory

Nine long-running containers, plus three host processes (control plane, admin UI,
console) and Ollama as a host application. The builder and scanner are transient,
created per build and destroyed:

| Component | Port | Notes |
|---|---|---|
| Caddy (edge) | 80, 443 | Both listeners on loopback locally. **Custom `xcaddy` build** (§20). **80 and 443 are the likeliest conflict on any developer machine** — both are held by Laravel Valet's nginx on the author's right now — so `make doctor` checks them explicitly and both are overridable. **Prefer a loopback alias to a port override** (S7): `sudo ifconfig lo0 alias 127.0.0.2 up`, then bind Caddy to `127.0.0.2:80`/`:443`. A port in the host URL breaks the byte-for-byte hostname parity §9 requires, whereas the alias keeps host and container URLs identical and leaves the conflicting service untouched. The alias does not survive a reboot, so `make up` re-adds it. |
| Builder | — | Transient, per build; rootless BuildKit (§12) |
| Scanner + SBOM | — | Transient, per build; database age reported by `make doctor` (§12) |
| dnsmasq | 7153 | Serves `*.manifest.internal`; see §12. **Two processes** — one answering containers, one answering the host — because `--address` is global to a dnsmasq process (S7) |
| Postgres | 7103 | **One server, three databases**: control plane, LiteLLM, IdP metadata — consistent with D11 and worth ~400 MB on a 16 GB machine |
| Manifest IdP (SimpleSAMLphp) | 7122 | Deliberately *not* 6122 — that is already taken by the standalone `docker-simple-saml` on this machine |
| LiteLLM | 7106 | Virtual keys and budgets against the shared Postgres |
| Registry (`registry:2`) | 7107 | Required: §13 binds approval to a digest and restricts pushes |
| Verdaccio | 7108 | The private package mirror §12 mandates; also what makes offline installs possible |
| Egress proxy | 7109 | Default-deny must exist locally, or an app works here and fails in staging |
| Control plane | 7100 | **Host Node process**, not a container — it needs the Docker socket, which §12 forbids mounting into *workload* containers while explicitly permitting the control plane's own access. Running on the host sidesteps the question and iterates faster. |
| Admin UI (Vite) | 7101 | Host process |
| `manifest-mock` | 7102 | Host process; needed only when working on the front-end without the platform |
| Reference console (§22) | 7104 | Host process (Vite). Served at `console.manifest.internal` through Caddy, leaving `app.manifest.internal` for the separate front-end project |
| Ollama | 11434 | **Host application** — Metal GPU access is unavailable from a container |

Git uses the local driver (bare repositories on disk), so it needs no container.
The 7100–7199 block was chosen to avoid the ports already in use on this machine
(3000, 4000, 5001, 6060, 6118, 6122, 8020, 8050–8052, 8768, 11434); `make doctor`
verifies they are free rather than assuming it.

Per project, per environment: the app container plus its declared services
(typically one Mongo). Qdrant is opt-in, not part of the default blueprint —
running one per app per environment is affordable on UBC infrastructure and is not
affordable on a laptop.

### Hardware floor and resource budget

| | |
|---|---|
| Minimum | 16 GB RAM, 4 cores, 40 GB free disk, **≥8 GB (decimal, i.e. 8,000,000,000 bytes) allocated to the Docker VM** — state the unit or `make doctor` cannot implement the check: the author's machine reports 8.32 GB decimal but 7.75 GiB binary, and passes or fails depending on the reading |
| Recommended | 32 GB |
| Rough budget | platform ~3 GB · Ollama chat model ~6 GB · embedding model ~1 GB · each app environment ~0.5 GB |

At 16 GB, cap concurrent local instances at two and set the sandbox idle timeout to
10 minutes. **Hibernation (§11) is what makes the laptop case viable at all** — the
same mechanism that makes 500 apps affordable on UBC infrastructure is what keeps a
laptop from thrashing.

### TLS

Caddy's internal CA issues the certificates, but the root must be trusted in
**three** places (S7 — the earlier "two" missed one):

1. the **macOS keychain**, for browsers and `curl`;
2. **container** trust stores via `NODE_EXTRA_CA_CERTS`, for server-side SAML
   metadata fetches and LiteLLM calls;
3. the **host Node processes** — control plane, admin UI and console are host
   processes in the inventory above, and Node ignores the macOS keychain, so they
   need `NODE_EXTRA_CA_CERTS` exported too.

This is automated in `make seed`, but it is not silent: `security add-trusted-cert`
**prompts for a password** even under `sudo`. D12 should not be read as claiming
otherwise.

### Commands

| | |
|---|---|
| `make seed` | **The only step needing network.** Pulls digest-pinned base images, warms Verdaccio with the blueprint's dependency closure, pulls Ollama models, installs the resolver file and trusts the CA. |
| `make up` | Boots the stack. Works offline after seeding. |
| `make reset` | Destroys all projects, volumes and registry contents; keeps the seed cache. |
| `make doctor` | **The reproducibility tool.** Checks Docker running and VM memory, Ollama up with the required models present, resolver file installed, CA trusted, ports free, disk space, and architecture. Every "works on my machine" report should start with its output. |

### The front-end in the local topology

The faculty-facing front-end is a first-class citizen of this stack (C1). It is
served at `app.manifest.internal` **through the same Caddy**, so cookie scope, CSRF
origin and SAML redirect origins match production rather than being accidentally
different on a bare Vite port.

Front-end developers are not required to run the platform. `manifest-mock` (§5,
§16) serves the published contract from fixtures — including scripted WebSocket
streams for build logs, deploy transitions and incidents — so the common case is
one process, not eight containers plus a language model.

**Sequencing for the front-end team:** the contract, the mock and the reference
console land in **Phase 1c** — so the team starts against an API that has already
been driven end to end by two real clients, not a paper contract. Production and
approvals arrive in Phase 2; the live agent loop needs sandbox `exec` and WS
streaming, so it is genuinely available in **Phase 3**.

### What offline AI does and does not prove

A 7–8B model through Ollama exercises the *mechanism* end to end: key minting,
budget enforcement, streaming, the agent's tool loop, incident-to-repair. It does
not represent the *quality* of an agent building a full-stack application, which at
that size will be poor.

Offline mode is for verifying plumbing and for CI. A developer with network points
LiteLLM at a real provider by changing one line — which is exactly what LiteLLM's
model groups and §7's logical model names were chosen to make possible.

### Gates that cannot exist offline

| Gate | Local behaviour |
|---|---|
| `IamRegistration` active (§9) | Admin override, **recorded as an override** in the audit log |
| `PrivacyAssessment` approved (§9) | Admin override, recorded |
| Pre-production rehearsal (D21) | Skipped; recorded |

The checklist is exercised in full and the deploy path is identical. What differs
is that three items are satisfied by a recorded human override rather than an
external system. The gate is never silently bypassed — an app that reached
production locally carries visible evidence of how it got there.

### Honest divergences from production

Stated so nobody discovers them at the wrong moment:

1. The control plane runs as a host process, not a container.
2. Both Caddy listeners are on loopback — there is no real internal/public network
   separation to enforce (§12).
3. One Postgres server holds three databases; production separates them.
4. **Developer laptops are arm64 and UBC infrastructure is x86-64.** Laptop-built
   images are never promoted (§13); CI builds everything that leaves the laptop.
5. The Manifest IdP serves test users only; no real Shibboleth is involved (D6).
6. `Driver.capabilities().isolationLevel` is `container`, the weakest level (§12).
   Spike S6 determines whether that is acceptable for sandboxes.
7. **Workload containers can reach the developer's own machine.** **S7 narrowed
   this, but did not close it.** The zone now resolves, for containers, to Caddy's
   address on the platform network rather than to the host gateway, so
   `*.manifest.internal` no longer hands every container a route to the host — the
   original wording of this divergence overstated it. Docker still provides
   `host.docker.internal` and `gateway.docker.internal` independently of our DNS,
   and a developer machine listens on far more than Manifest's ports (MongoDB,
   MySQL, other projects' databases; all three are live on the author's machine
   now). §12's east-west denials cover app-to-app, the control plane and metadata
   endpoints, but the host remains reachable. Egress policy must deny the host
   gateway except for the ports an app actually needs, and **S6 must test it** —
   this is the one local divergence that is a real security weakening rather than a
   convenience.


---

## 22. The public API and its reference clients

### Why this section exists

The faculty-facing front-end is a separate project (§5), which creates a specific
risk: an API designed in the abstract, discovered to be insufficient months later
by a team that cannot change it quickly. The countermeasure is to build a client in
this repo, in Phase 1, that drives the entire journey — and to constrain it so that
any gap in the API becomes a build failure rather than a conversation.

### The reference console (D22)

`console/` is a small web client with one job: **prove the public API is complete
and sufficient.** It is not the product.

**Quality bar: plain but presentable.** No design system, no branding, system
fonts, minimal CSS — coherent enough that a pilot faculty member can be walked
through it, obviously not polished enough that anyone mistakes its choices for
product decisions. The real experience is the separate front-end project's job.

**The rule that makes it work:** `console/` imports *only* the generated client
from `contract/`. A lint boundary and a test enforce this. If the console needs
something the API does not expose, the API is incomplete — and that is discovered
in Phase 1, while it is cheap, rather than in Phase 3 by a team blocked on it.

**A hard constraint on scope:** no capability may exist in the console that is not
available through the published API. The console never gets a shortcut.

### The journey it drives

Phase 1 — no AI authoring yet, since sandboxes arrive in Phase 3, so "describe your
app" is "choose a blueprint":

1. Log in with CWL (Manifest IdP, test user)
2. Create a project — name and blueprint
3. Watch provisioning: repository created, `manifest.yaml` validated
4. Trigger a build; build logs stream live
5. Deploy to staging; instance state transitions stream live
6. Open the running app; log in with CWL *inside* it; write a note; ask the LLM
7. Request production; see `LaunchReadiness` (§13) with its blocked items and why

Phase 3 adds a chat pane, sandbox lifecycle and agent streaming — to the same
console, against the same API.

### The third reference client: MCP (Phase 3)

`mcp/` is a thin MCP server over the published API, so any MCP-capable agent gets
Manifest as native tools and the knowledge pack (D25) as MCP resources. Subject to
the same import rule as the console: it may use nothing but `contract/`.

Its value is not only convenience. Console (human), CI script (automation) and MCP
(agent) are **three independent clients over one contract**, which is much stronger
evidence that the API is genuinely client-agnostic than two clients written by the
same person in the same week.

It lands in Phase 3, when sandboxes make the agent story real. The delegated token
model it depends on lands in Phase 1, because CI needs it regardless.

### The CI half comes free

The acceptance harness is a **script using the same generated client** (§16). Same
journey, same contract, headless, no browser automation. Two independent clients
over one API is also the cheapest possible evidence that the API is genuinely
client-agnostic rather than shaped around one consumer.

### API design principles (D23)

Flexibility for the future front-end is preserved by constraints, not intentions:

1. **Resource-oriented, never view-oriented.** No `GET /dashboard` returning a blob
   shaped for today's layout — that quietly makes the API a function of one UI, and
   the real front-end then cannot diverge without server changes. Resources, plus
   an explicit `?expand=` where round-trips genuinely hurt.

2. **One event stream per project, not polling.** Build logs, instance state
   transitions, incidents and approval decisions all flow over
   `WS /projects/:id/events`. A polling API bakes in an assumption about UI shape;
   a stream lets a chat interface, a dashboard, a CLI or a notification bot all
   react to the same source.

3. **Agent-framework agnostic.** No agent SDK type appears anywhere in the API
   surface. Sandbox lifecycle, `exec`, file operations and output streams are
   exposed as primitives, so any harness — or a plain shell script — can drive
   them. Vibonarium pinned `pi` to `0.79.3` and recorded that SDK's release
   velocity as a standing hazard; that dependency must not reach this API.

4. **The API is the only integration point**, authentication included: an
   interactive session cookie for browsers, a scoped delegated token for agents,
   CLI and CI (D24). Nothing a client needs is available only through a side
   channel — including the **agent knowledge pack**, which is served over the API
   and versioned with its blueprint (D25) so a third-party agent can learn the
   platform's conventions without ever running inside it.

5. **No server-held UI state.** The server owns domain state; clients own
   presentation state. Otherwise the API accretes fields like `sidebarCollapsed`
   and every client inherits one client's habits.

6. **Idempotency keys on every mutating action.** Clients retry, and users
   double-click. Creating a project twice because a request was replayed is the
   kind of defect that is trivial to prevent now and miserable to retrofit.

7. **Errors are machine-actionable** (§20): stable codes plus remediation hints, so
   an agent can correct itself rather than surfacing a wall of text to its user.

8. **The contract is versioned and generated from the routes** (§16). Drift between
   the implementation, the OpenAPI document and `manifest-mock` fails CI, so a
   front-end built against the mock cannot compile against a contract the real API
   does not serve.

---

## 23. Hostnames and custom domains

§12 settles how a name *resolves*. This section settles what the names **are**, who
chooses them, and what it takes to put an app on a name the platform does not own.

### The three platform zones

Each environment kind is served from one zone, and the zone is **platform
configuration — one setting each**, not something derived from the app. The only
app-supplied part of any platform hostname is the project slug:

```
<slug>.<zone for that environment kind>
```

| Environment | UBC zone | Example |
|---|---|---|
| sandbox | `manifest.sandbox.apps.ltic.ubc.ca` | `chem-labs.manifest.sandbox.apps.ltic.ubc.ca` |
| staging | `manifest.staging.apps.ltic.ubc.ca` | `chem-labs.manifest.staging.apps.ltic.ubc.ca` |
| production (canonical) | `manifest.apps.ltic.ubc.ca` | `chem-labs.manifest.apps.ltic.ubc.ca` |

On the laptop the same three settings hold the `manifest.internal` equivalents
(`chem-labs.sandbox.manifest.internal`, `.staging.`, and
`chem-labs.manifest.internal`). All three were verified serving with a trusted
wildcard certificate in S7.
The zones differ between deployments; the derivation rule does not, which is what
lets the same code path build every hostname.

Because the app contributes only a slug that is already validated as
`^[a-z][a-z0-9-]{2,38}$` (§7), hostname construction cannot be steered by app
content. This is D15's reasoning applied to routing rather than to SAML: nothing
free-text reaches a hostname.

**One sandbox environment per project at a time**, so its hostname is stable and
predictable. Concurrent sandboxes, if they are ever needed, take a suffixed slug;
the zone scheme does not change.

### Certificates for the platform zones

One wildcard certificate per zone — `*.manifest.sandbox.apps.ltic.ubc.ca` and the
other two — covers every app in that tier, because every platform hostname is
exactly one label deep. Three certificates for the whole fleet, renewed centrally,
with no per-app issuance on the critical path of a deploy. On the laptop, Caddy's
internal CA serves all three (§21).

### The canonical hostname is permanent (D26)

Every project has a production canonical hostname from the moment it exists, and it
never changes. A custom domain is **added alongside it**, never in place of it.

Three things depend on that permanence:

- The SP `entityID` and ACS URL registered with UBC IAM (§9). These must be stable
  for the life of the app; a rotating hostname would mean a rotating registration.
- Health checks, internal tooling and the event stream, which should not care what
  a faculty member typed into a domain field last week.
- Failure behaviour. If a custom domain lapses, is mistyped, or its department
  restructures its DNS, the app degrades to *a working app on an ugly URL* rather
  than to an outage.

`Route.kind` distinguishes the two. Both point at the same instance; only the
canonical route is created automatically.

### Custom production domains

A custom domain is production-only, and only on the public listener. Sandbox and
staging are bound to the internal listener (D12) precisely so they cannot be
reached from outside UBC, and a custom domain is a request to be reachable — the
two are contradictory, so the API rejects the combination rather than quietly
ignoring it.

**Lifecycle.** `Domain` moves through `pending → verified → attached`, with
`failed` and `detached` as exits:

1. **Requested.** The owner enters `labs.chem.ubc.ca`. Manifest allocates a
   verification token and shows the two records to be created — worded as a request
   the owner can forward to whoever runs that zone, since a faculty member almost
   never controls departmental DNS themselves:

   ```
   labs.chem.ubc.ca.                       CNAME  chem-labs.manifest.apps.ltic.ubc.ca.
   _manifest-challenge.labs.chem.ubc.ca.   TXT    "manifest-domain-verification=<token>"
   ```

2. **Verified.** Manifest polls until both records resolve. The CNAME proves
   traffic will arrive; the **TXT proves *this project* was authorised to claim the
   name**, which the CNAME alone does not — without it, a department that had
   already pointed a name at the platform could have it claimed by whichever
   project asked first.

3. **Attached.** Attaching is a change to the public edge, so it is done by an
   **administrator in an interactive session** (D14) and is never available to a
   delegated token — the owner requests, an admin attaches.
   Certificate issuance happens here, and it works by construction: the CNAME
   already directs the ACME challenge at the edge that is answering it. Verification
   and issuance are one event rather than two independent failure modes.

**Apex domains and departments that cannot CNAME** take the upload path: an A
record to the public edge plus a certificate supplied by the department or by UBC
IT. This is not a loophole. Uploaded certificates are tracked with an expiry date
and alarmed months ahead, exactly as SP certificates are under D20 — an unnoticed
expiry silently kills a live course application mid-term, and it does not matter
whether the certificate was issued automatically or by hand.

**After attachment, checking continues.** DNS blips, so a failed check does not
detach anything; it marks the custom route degraded, notifies the owner, and leaves
the canonical route serving. Detachment is always an explicit human action.

### Choosing a domain must precede IAM registration (D27)

**This is the ordering constraint faculty are most likely to get wrong, and it is
expensive.** For an app with `auth.provider: cwl`, the ACS URL is part of what UBC
IAM registers (§9, D15), and it must carry the hostname the browser is actually on
or the assertion will not be accepted. So:

- The custom domain question is asked **at registration time**, inside the launch
  readiness flow — not offered later as a convenience setting.
- Adding or changing a custom domain after registration is an **IAM change
  request** with the same multi-week external turnaround as the original (C4).
  Manifest generates it and tracks it like any other, but it cannot make it fast.
- Apps with `auth.provider: none` have no such constraint and may add, change or
  remove custom domains freely.

The platform states this at the moment of choice rather than discovering it at
launch. A five-second decision in week one otherwise costs a month in week twelve.

### What this adds to launch readiness

`LaunchReadiness` (§13) gains a domain item: either *canonical only — no action* or
*custom domain verified and attached*. For a CWL app it is ordered **before** the
IAM registration item, because the registration consumes its answer.

---

## 24. Audience and scale

C3 says faculty never see infrastructure. That has been read so far as "no YAML, no
containers", but it applies just as much to capacity: a faculty member can answer
*who is this for*, and cannot answer *how many replicas*. This section is C3
applied to sizing.

### Two questions, asked of a human (D29)

Both live on the `Project`, set through an interactive session, and **neither is a
`manifest.yaml` field**:

**How many people?**

| `scale` | Means | Rough ceiling |
|---|---|---|
| `solo` | Me, or me and a few colleagues | ~25 |
| `class` | One course section | ~400 |
| `large_course` | A large course, or several sections | ~5,000 |
| `public` | Anyone with the link, including people outside UBC | unbounded |

**Do they all arrive at once?**

| `burst` | Means |
|---|---|
| `steady` | Usage spreads across days — a booking tool, a reference app |
| `synchronised` | Everyone arrives inside a few minutes — used live in a lecture, or opened the moment registration does |

Burstiness is asked separately because it is a different engineering problem with
the same headcount: 200 students across a week is trivial, and 200 students at
10:03 on Tuesday because the URL went on a slide is not.

**Why not in `manifest.yaml`.** Two reasons, and the second is the load-bearing
one. First, it is a statement about people rather than about code, so it does not
belong in a file that describes the app. Second, `manifest.yaml` is
**agent-writable**, and capacity costs real money — a field an agent can edit is a
field an agent can be talked into multiplying twentyfold. Under D14 that makes it a
human decision by construction.

### What each answer actually changes — production only

| | `solo` | `class` | `large_course` | `public` |
|---|---|---|---|---|
| Instances | 1 | ≥2 | ≥3 with headroom | ≥3 with headroom |
| Hibernation (§11) | yes | not during term | never | never |
| Backups | weekly | daily | daily | daily |
| Alerting | none | health only | health + saturation, paged | health + saturation, paged |
| Edge rate limiting | default | default | tuned | tuned, plus abuse controls |
| Extra launch gate | — | — | load rehearsal | load rehearsal + security review |

`burst: synchronised` additionally pre-warms capacity ahead of a window the owner
declares, because **wake-on-request (§11) is correct for `solo` and wrong here** —
a cold start is invisible to one person checking a tool on Thursday and is a failed
lecture for 200 people at 10:03. The two features are not in tension; they serve
different rows of the same table.

`public` carries the extra scrutiny not because of headcount but because its users
are unauthenticated, which removes CWL as an accountability layer and widens §3.5's
"student using a manifested app" actor to anyone.

### Sandbox and staging ignore all of it

Both are always one small instance that hibernates when idle, whatever the project
says — with exactly one exception, the rehearsal below. That keeps iteration cheap
and the fleet's idle cost near zero, but it means **staging does not test load by
default**, and that divergence must be stated rather than discovered.

The mitigation mirrors D21's IdP rehearsal: for `large_course` and `public`, launch
readiness includes a **load rehearsal** against staging with production-shaped
capacity temporarily granted. An app whose first contact with its real audience is
launch day will fail on launch day, and that is as true of capacity as it is of
identity.

### Audience is not `resources`

`manifest.yaml`'s `resources` block sizes *one instance* and is bounded by the
project quota (§7); audience decides *how many of them run in production* and
under which policies. The two compose and neither
subsumes the other — which is why one is a spec field the agent may write and the
other is not.

### Changing the answer

Upward is a request an admin approves, because it consumes shared capacity and
budget; it appears in the admin queue (§26) with the owner's justification.
Downward is immediate and needs no approval. Both are recorded with actor and
timestamp on the project, so "why is this app running three instances" always has
an answer.

---

## 25. Blueprints as a pluggable catalogue

A blueprint is Manifest's equivalent of a Coder template: an admin-published,
versioned definition of what a generated app looks like. §18 keeps "one blueprint
in v1" and keeps auto-detection a non-goal. This section is about making the second
blueprint a **new folder rather than a rewrite** (D30).

### The failure being prevented

Ship one blueprint with no descriptor and the platform grows implicit Node
assumptions in the builder, the health-check convention, the service catalogue and
the injection contract — none written down, all load-bearing, and every one of them
discovered the week someone asks for Python. The cost of avoiding this is small
precisely because there is currently one blueprint to describe.

### The descriptor

Each blueprint ships a `blueprint.yaml` at its root, parsed into `Blueprint.descriptor`:

```yaml
blueprint: node-ts-mongo
major_version: 2
schema_versions: [1]              # manifest: versions this blueprint understands

runtime:
  language: typescript
  base_image: <digest-pinned reference>
  default_port: 3000
  health_path: /healthz
  run_as_uid: 10001

provides:
  services: [mongo, qdrant]       # service types this blueprint can bind
  auth_providers: [cwl, none]
  ai: true

defaults:
  resources: { cpu: 0.5, memory: 512Mi, pids: 256, disk: 2Gi }

injection:
  contract: v1                    # which §8 table this blueprint reads

dockerfile: ./Dockerfile.tmpl     # blueprint-managed, per D13
knowledge_pack: ./agents/         # served over the API, per D25
```

### What this changes in the control plane

**Validation becomes two stages.** Schema validation (§7) is unchanged. It is
followed by a **compatibility check against the blueprint's descriptor**, which
produces errors of a distinctly more useful kind:

```
blueprint node-ts-mongo@2 cannot bind service type "postgres"
  (supported: mongo, qdrant)
blueprint node-ts-mongo@2 does not support auth.provider "cwl"
```

**And four assumptions become lookups**, which is the whole point: the builder asks
the descriptor for the language and base image rather than knowing them; the health
check asks for the path rather than defaulting to `/healthz`; the service catalogue
is intersected with `provides.services` rather than being global; and the injection
contract is a version the blueprint names rather than the only table that exists.

`spec/` therefore exposes `checkBlueprintCompatibility(spec, descriptor)` alongside
its existing schema validation, and no module outside `blueprints/` names a
language.

### Publishing and versioning

Blueprints are published by administrators, never by faculty and never by an agent
— they are the one artifact in the system that *is* reviewed on every change (§20),
and that property only holds while the set of people who can change them is small.

Apps pin a major version. A major bump is already one of §7's seven sensitive
fields, so moving an app to a new blueprint major re-escalates to approval (D9);
under D13 the blueprint *is* the build definition, so this is a change to every
layer beneath the app and is gated accordingly.

**v1 ships exactly one catalogue entry.** The registry, the descriptor and the
version pinning all exist anyway, because they are what make entry two cheap.

---

## 26. The admin console

§5 places `admin-ui/` in this repo and §17 lands it in Phase 2. This section says
what it is for.

### Administration is a role, not a second API (D31)

The admin console consumes the same public API as `console/`, `mcp/` and the CI
harness, with administrative capability granted by role. A private admin API would
drift from the public one, and would become the place where capabilities
accumulate that faculty clients then cannot have — the exact failure D22's import
rule exists to prevent. The import boundary that binds `console/` binds
`admin-ui/`.

Cross-project and fleet-wide reads are therefore **admin-scoped endpoints on the
public API**, documented in the same OpenAPI document as everything else.

### The primary screen is the queue

Not the fleet list. Manifest's design deliberately routes a specific, enumerable
set of actions through human judgement — C4, D9, D14, D19, D24, D27, D29 — so the
number of people waiting on an administrator is the platform's central operational
metric rather than an afterthought.

Every queue item is derived from an entity that already exists:

| Queue item | Source | Decided by |
|---|---|---|
| Release awaiting approval | `Approval` (D9) | admin |
| Confirmation of a delegated-token action | `PendingAction` (D24) | the requesting user, in *their* queue — listed here because it is the same mechanism |
| IAM registration to submit or amend | `IamRegistration` (D19) | admin + UBC IAM |
| Privacy assessment to review | `PrivacyAssessment` | owner, then Privacy Office |
| Verified domain awaiting attach | `Domain` (D28) | admin |
| Audience upgrade request | `Project.audience` (D29) | admin |
| Launch item needing an override | `LaunchReadiness` | admin, recorded as an override |

Each item shows what is being asked, by whom, what changes if it is granted, the
diff where there is one, and **how long it has waited**. The console's headline
health number is the age of the oldest item, because a queue that is merely long is
working and a queue that is stale is not.

### The other screens

- **Fleet** — every app: owner and department, environments and their state, current
  release digest, audience tier, domains, last deploy, open incidents, AI spend this
  month.
- **People** — every user, role, the projects they own or collaborate on, last seen,
  and their outstanding delegated tokens.
- **Spend** — AI spend by project and by end user, which D8's per-user attribution
  already produces. Answers "which of 300 students spent the budget" without a
  bespoke report.
- **Health and risk** — open incidents (§14); certificates expiring within 90 days,
  covering both SP certificates (D20) and uploaded custom-domain certificates
  (D28); policies a driver reports it cannot enforce (§12 `capabilities()`); failed
  vulnerability scans (§20); apps still pinned to a superseded blueprint major.
- **Audit** — the append-only log (§20), filterable by actor, project and action.

### Non-repudiation

Every administrative action is audited with its actor. An admin action taken **on
another person's project** additionally requires a reason string, which is stored
with the audit entry and shown to the project owner in their event stream. §3.5
lists insider risk as a real threat with a stated need for non-repudiation; this is
where that is discharged.

### Scope

Rudimentary and deliberately so: tables, filters, a queue, and the actions the API
already exposes. It is an operations tool for the team running the platform, not a
product surface, and it inherits `console/`'s quality bar (§22) for the same reason.

---

## 27. The showcase and forking

`Project.visibility`, `Project.published` and `Project.forked_from` have been in the
domain model since §6 with no section describing what they are for. This is that
section.

### The problem it solves

Forty faculty members will independently describe a rubric tool, a queue, a booking
page. Each description will be slightly different, each build will burn model
budget, and each result will be reviewed, registered and assessed separately. The
platform's most valuable asset after its first year is not any single app — it is
**the set of apps that already work and have already been through review.**

### Publishing

An owner may publish a project to the showcase. Publishing exposes, to every
authenticated Manifest user:

- the description, the blueprint, and the `manifest.yaml` — what it needs, in
  platform terms
- a screenshot or short description supplied by the owner
- provenance: what it was forked from, and how many projects have forked it
- whether it is live, and roughly what audience it serves (`Project.audience`)

Publishing exposes **no data, no secrets, no logs, no user list and no running
instance.** A published project is a description and a recipe, never a running
system — the showcase is a catalogue, not a hosting tier.

`visibility` remains the access control on the project itself; `published` is the
separate act of listing it. The two are deliberately not one flag: an owner may
want colleagues to collaborate on a project without it appearing in an institutional
gallery, and may want a gallery entry for an app whose repository stays closed.

### Forking (D32)

Forking creates a **new project owned by the person who forked it**, seeded from the
source project's code and `manifest.yaml`, with `forked_from` set.

What a fork carries: the code, the spec, the blueprint pin, the description.

**What a fork never carries**, and this is the whole of the security argument:

| Not copied | Why |
|---|---|
| The database and its contents | The source app's data is its owners' and often its students'. A fork is a new app with an empty database, always. |
| Secrets | Envelope-encrypted per project (§12). A fork gets none and must supply its own. |
| The SP keypair and IAM registration | Registered to a specific `entityID` and ACS URL for a specific app (§9, D15). A fork is a different app and needs its own registration; copying one would mean two applications presenting the same identity to UBC. |
| The privacy assessment | Assessed against a specific owner, audience and purpose. A different course with a different roster is a different assessment. |
| Custom domains | Verified against a specific project (§23, D28). |
| `Project.audience` | Reset to unanswered. A tool built for 14 people being forked for 900 is exactly the case the question exists to catch. |
| Production approval | A fork has never been approved. It starts at the beginning of the gate. |

A fork therefore **inherits the work and none of the trust.** That is the correct
default: the expensive part of the source project was the design and the code, and
the parts that are not copied are precisely the parts that are specific to a person,
a cohort and a purpose.

### What forking does inherit, usefully

The generated PIA draft and registration package for a fork are seeded from the
source project's approved ones. The owner still reviews, signs and submits their own
— but they start from a document that a reviewer has already accepted for a
substantially similar app, rather than from nothing. Over time this is where most of
the showcase's value accrues.

### Scope

Phase 2, alongside production environments and approvals. The showcase is a list, a
detail page and a fork button; curation, ratings, categories and search beyond a
text filter are explicitly out of scope until there is enough in it to need them.
