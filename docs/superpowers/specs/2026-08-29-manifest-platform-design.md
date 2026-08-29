# Manifest — Platform Design

**Status:** Approved design, pre-implementation
**Date:** 2026-08-29
**Scope:** The Manifest control plane (the deployment back-end). The faculty-facing
"manifesting" front-end is a separate project and is out of scope here, except for
the API contract it consumes.

**Note on planning scope:** this document is the architecture for Phases 0–5
(§17). It is deliberately larger than one implementation plan. The first
implementation plan covers **Phase 0 (spikes S1–S3) and Phase 1 (the spine)**
only. Later phases get their own plans against this same architecture.

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
| `passport-ubcshib` | Used **unchanged** by manifested apps. Its `LOCAL`/`STAGING`/`PRODUCTION` presets and env var names constrain Manifest's injection contract (§7). |
| `docker-simple-saml` | Becomes the **Manifest IdP**. Its file-based `saml20-sp-remote.php` is replaced by a SQL metadata source so SPs can be registered programmatically (§9). |
| `ubc-genai-toolkit` | Used **unchanged** by manifested apps. Its `openai-compat` provider points at LiteLLM. |
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
  Privacy Impact Assessment. Non-negotiable.** IAM registration is manual and
  slow; no design may assume programmatic SP registration with real UBC CWL. A
  production launch is therefore gated on two external, human, multi-week
  processes, and the platform's job is to *drive* them, not merely wait on them
  (D19).
- **C5 — Start small, design for large.** Pilot scale now; no interface may
  foreclose the ~500-app case.
- **C6 — Existing app-side libraries are unchanged.** `passport-ubcshib` and
  `ubc-genai-toolkit` are used as-is. Manifest adapts to them, not the reverse.

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
- Application code is **never reviewed by a human** after first launch (D9). All
  compensating controls are therefore preventive and containment-based, not
  review-based.
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
| D19 | **Manifest generates and tracks the IAM registration and the PIA as first-class objects**, and blocks production deployment until both are approved. | The platform knows more about the app than its owner does: it can derive the SP metadata, a per-attribute justification, and most of a PIA from the AppSpec. A faculty member should review and sign, not author from nothing. This converts C4 from a blocker into the platform's most valuable service. |
| D20 | **The production SP keypair is long-lived and stable**, generated once at registration; rotation is a tracked IAM change request with an overlap window. Certificate expiry is monitored and alarmed months ahead. | An SP certificate is registered with UBC IAM; rotating it per deploy would break authentication. Conversely an unnoticed expiry silently kills login for a live course application mid-term — an operational hazard that is invisible until it is urgent. |
| D22 | **This repo ships a `console/` — a reference console — as a Phase 1 deliverable.** It is the executable proof that the public API is complete and sufficient, not the product. It imports *only* the generated client from `contract/`, enforced by a lint boundary and a test. | Without it, the faculty journey is undemonstrable until Phase 3, and API gaps surface when the front-end team hits them rather than while they are cheap to fix. The import rule converts "is the API complete?" from an opinion into a build failure. |
| D23 | **The public API is resource-oriented, event-streamed, and agent-framework agnostic** (§22). | These are the constraints that actually preserve front-end flexibility. In particular, no agent SDK type appears anywhere in the API surface: Vibonarium pinned `pi` to `0.79.3` and recorded that SDK's churn as a standing hazard. Manifest exposes sandbox lifecycle, `exec`, file operations and streams as primitives so any harness can drive them. |
| D21 | **A pre-production rehearsal against UBC's staging IdP (`authentication.stg.id.ubc.ca`) is part of launch readiness**, not part of the daily build loop. | Staging on the Manifest IdP keeps iteration frictionless, but an app whose first contact with real Shibboleth is production launch day will fail on launch day. The rehearsal validates the registration, the attribute release and the certificate before anything is public. |
| D7 | Manifest is a **client of LiteLLM's admin API**, not a gateway of its own. | LiteLLM already provides virtual keys, budgets, multi-provider routing and an admin API. Building a second one would be waste. |
| D8 | Virtual keys are minted **per app+environment**, **per agent session**, and spend is attributed **per end user** via hashed CWL `uid`. | A looping agent burns its own cap. Per-user attribution answers "which of 300 students spent the budget" and enables fair-share quotas inside a manifested app. |
| D9 | Production approval is **first-launch only**, plus **automatic re-escalation when a sensitive field changes**. | Preserves faculty velocity while closing the "the AI silently rewrote the app" hole. The escalation is free because the diff is computed for the first review anyway. |
| D10 | Control plane is a **desired-state reconciler with pluggable drivers**, but the first implementation is a **straight-line imperative path**. | Learn the domain against real Docker before committing to a loop. The reconciler later *wraps* the straight-line function rather than replacing it. |
| D11 | Stack: **TypeScript/Node + Fastify, Postgres, Drizzle, React+Vite** admin UI. | Team fit, and LiteLLM already requires Postgres — the control plane database adds no new infrastructure dependency. |
| D12 | Edge proxy is **Caddy**, with **separate listeners** for internal (sandbox+staging) and public (production) traffic. | HTTPS on a laptop from Caddy's internal CA (one automated trust-store step, not a manual mkcert dance — §21); JSON admin API instead of templated config. Separate listeners fail closed; IP allowlists fail open and quietly. |
| D13 | **Dockerfiles are blueprint-managed.** Apps cannot supply their own build definition. | Build time is the most privileged moment in the pipeline; an app-supplied Dockerfile is arbitrary RCE on the builder. It also violated the rule in D4/§7 that an app declares *what*, never *how*. Custom Dockerfiles may return later behind rootless BuildKit with a credential-free, network-restricted builder. |
| D14 | **Privileged actions require an interactive human session, whichever client initiates them.** No agent-held credential — Manifest's own or a third party's — carries privileged capability. A sandbox in particular holds no credential able to mutate anything outside itself. | Prompt injection makes any agent a confused deputy: text it reads — a student PDF, a scraped page, a package README — is potential attacker instruction. The property is *not* "our front-end does it", which would make third-party clients second-class by construction and misstate the control. Stated this way it protects against a prompt-injected agent on someone's laptop exactly as it protects against one in our sandbox: one rule, one enforcement point. Generalises Vibonarium's *"the agent suggests, the human clicks, the gateway executes."* |
| D24 | **Two credential classes.** An *interactive session* (browser, CWL, CSRF, step-up re-auth) can do anything the user can. A *delegated token* (agent, CLI, CI, MCP) is scoped and may **never** carry production promotion, secret read, quota change or member management; requesting one of those creates a **pending action** a human confirms interactively. | This is what makes "bring your own agent" (§1) safe rather than a hole. Note what a delegated token *can* do: create projects, read everything, trigger builds, deploy to sandbox and staging, stream logs and events — the entire build loop. Only four things need a human. |
| D25 | **The agent knowledge pack is served over the API**, versioned with its blueprint — not only baked into sandbox images. | A third-party agent on someone's laptop cannot read a file inside a container it never runs. Without this, a BYO agent has no way to learn how to write a valid `manifest.yaml` or wire CWL auth, which is exactly the knowledge that makes an app work on this platform. |
| D15 | **SAML ACS and SLO URLs are derived by Manifest**, never accepted from the app. `auth.callback` is a path, not a URL. | Registering an SP means directing signed identity assertions at a URL. Free-text ACS is an assertion-phishing primitive reachable from a buggy agent or an injection in the registration path. |
| D16 | **A newly requested CWL attribute requires approval in every environment**, not only production. | Under D6 staging uses test users, so the harvesting risk is lower than first assessed — but the control is retained for a stronger reason: in production, `auth.attributes` must be a subset of what UBC IAM actually registered. Catching an attribute change at approval time turns a launch-day login failure into a change request raised weeks earlier. |
| D17 | **`data.classification` constrains which logical models an app may use.** | A BC public body sending student personal information to a US model provider is a FIPPA problem, and the pre-review design was one YAML line away from it by accident. Both fields already existed; linking them is nearly free. |
| D18 | **Egress is default-deny in every environment**, through a forced proxy. | The pre-review design enforced egress only in sandboxes. Production is long-lived, holds real data and sits inside UBC's network — a compromised production app is a better pivot than a 45-minute sandbox. |

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
build/          source + spec -> image digest
runtime/        Driver interface, drivers, instance state machine, reconciler
services/       backing service provisioning + credentials
routing/        hostnames, Caddy config, listener assignment
secrets/        envelope encryption, injection
sso/            Manifest IdP SP registration
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
| **User** | `id`, `cwl_uid`, `email`, `display_name`, `role` (`admin` \| `member`) |
| **Project** | `id`, `slug`, `owner_id`, `blueprint_ref`, `quota`, `visibility`, `published`, `forked_from` |
| | `quota` = `{max_cpu, max_memory, max_services, ai_monthly_usd}`; enforced at spec validation (§7) |
| **ProjectMember** | `project_id`, `user_id`, `role` (`owner` \| `collaborator`) |
| **Blueprint** | `name`, `major_version`, `source_ref`, `default_spec`, `knowledge_pack_path` |
| **AppSpec** | `id`, `project_id`, `commit_sha`, `parsed` (jsonb), `schema_version`, `valid`, `errors` |
| **Build** | `id`, `project_id`, `commit_sha`, `appspec_id`, `image_digest`, `status`, `logs_ref` |
| **Release** | `id`, `project_id`, `build_id`, `appspec_id`, `resolved_config`, `created_by`, `summary` |
| **Environment** | `id`, `project_id`, `kind` (`sandbox` \| `staging` \| `production`), `policy`, `hostname` |
| **Instance** | `id`, `environment_id`, `release_id`, `driver`, `kind` (`web` \| `worker` \| `cron`), `state`, `handle`, `last_seen_at` |
| **ServiceInstance** | `id`, `environment_id`, `type`, `version`, `name`, `handle`, `credentials_secret_id` |
| **Route** | `id`, `instance_id`, `hostname`, `listener` (`internal` \| `public`) |
| **Secret** | `id`, `project_id`, `environment_kind`, `name`, `ciphertext`, `created_at` |
| **Approval** | `id`, `release_id`, `decision`, `decided_by`, `reason`, `diff_snapshot` |
| **IamRegistration** | `id`, `project_id`, `entity_id`, `acs_url`, `slo_url`, `cert_fingerprint`, `cert_expires_at`, `registered_attributes`, `state` (`draft` \| `submitted` \| `active` \| `change_requested` \| `expired`), `external_ticket_ref` |
| **PrivacyAssessment** | `id`, `project_id`, `generated_draft`, `state` (`draft` \| `submitted` \| `approved`), `reviewer`, `approved_at` |
| **LaunchReadiness** | `project_id`, checklist state across IAM registration, PIA, rehearsal, security scan, admin approval |
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
name: chem-lab-scheduler          # required, ^[a-z][a-z0-9-]{2,38}$, immutable
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
  attributes: [uid, mail, givenName, sn, eduPersonAffiliation]
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

environments:                     # per-environment overrides
  staging:    { resources: { memory: 256Mi } }
  production: { resources: { memory: 1Gi }, replicas: 2 }
```

### Logical model names

`ai.models` carries **logical** names (`default-chat`, `default-embed`), never
vendor model IDs. Manifest maps them to LiteLLM model groups. An admin repoints
the entire fleet at new on-prem hardware by editing one mapping — no app changes,
no redeploys, no faculty involvement.

### Sensitive fields

These five fields, and only these, trigger re-escalation to approval (D9):

- `services`
- `auth.attributes`
- `egress.allow`
- `resources` (increase only)
- `data.classification`

The schema and the approval policy are therefore the same object. `spec/` exposes
`isSensitiveDiff(before, after) -> {sensitive: boolean, fields: string[]}`.

### Validation

Rejected at parse time, before any build:
- unknown top-level keys, or non-empty reserved blocks (`integrations`, `jobs`, `checks`)
- a `runtime.build` block of any kind (D13)
- `services[].type` outside the platform catalogue
- `auth.attributes` outside the whitelist in `passport-ubcshib/ATTRIBUTES.md`
- `auth.callback` / `auth.logout` that are not paths matching `^/[A-Za-z0-9/_-]{1,64}$` (D15)
- `ai.models` outside the platform's logical catalogue
- `ai.models` whose catalogue `max_classification` is lower than `data.classification` (D17)
- resource requests above the project's quota
- `name` differing from the project slug
- for a production release: `auth.attributes` not a subset of the app's
  `IamRegistration.registered_attributes` (§9). Failing here, at build time, turns
  a launch-day login outage into a change request.

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

**Frozen**, documented in every blueprint, and chosen so `passport-ubcshib` and
`ubc-genai-toolkit` work with zero adaptation — these are the variable names they
already read.

```
MANIFEST_ENV                 staging
MANIFEST_APP_URL             https://chem-lab-scheduler-staging.manifest.ubc.ca
MANIFEST_PROJECT_SLUG        chem-lab-scheduler

DB_URL / <NAME>_URL          one per declared service, named from services[].name
                             e.g. name: db -> DB_URL ; name: vectors -> VECTORS_URL

SAML_ENTITY_ID               sandbox/staging: https://manifest.ubc.ca/sp/{slug}/{env}
                             production:      the entityID registered with UBC IAM (§9)
SAML_CALLBACK_URL            <MANIFEST_APP_URL>/auth/ubcshib/callback
SAML_LOGOUT_URL              <IdP logout endpoint>
SAML_IDP_METADATA_URL        sandbox/staging: the Manifest IdP
                             production:      https://authentication.ubc.ca/idp/shibboleth
                             (matches passport-ubcshib's LOCAL / PRODUCTION presets)
SAML_PRIVATE_KEY_PATH        /run/manifest/saml/private.key   (mounted)

AI_BASE_URL                  LiteLLM endpoint
AI_API_KEY                   this app+environment's virtual key
AI_CHAT_MODEL                resolves default-chat
AI_EMBED_MODEL               resolves default-embed

SESSION_SECRET               generated per app+environment
PORT                         runtime.port
```

Consequence: the AI's task for authentication is *"copy the blueprint's auth
component"*, not *"implement SAML"*. This is the single largest reliability lever
in the agent experience.

**Note (from `vibonarium/AGENTS.md`, verified against `passport-ubcshib`):** the
package's `logout()` helper reads the logout URL from the `SAML_LOGOUT_URL`
environment variable rather than from strategy options. `SAML_LOGOUT_URL` must
therefore always be injected, not just `SAML_IDP_METADATA_URL`.

---

## 9. Identity

There are **two identity paths** (D6), and conflating them is the easiest mistake
to make in this design:

| | **sandbox + staging** | **production** |
|---|---|---|
| IdP | Manifest IdP (SimpleSAMLphp) | real UBC Shibboleth |
| Users | test users (`bio_prof`, `bio_student`) | real staff and students |
| Registration | automatic, seconds | **manual UBC IAM request, weeks** (C4) |
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

No automation exists or is assumed. Manifest's contribution is to make the manual
process fast, accurate and legible to someone who has never heard of SAML (D19).

**Manifest generates the registration package** from the AppSpec, reusing
`saml-metadata-generator` as a library:

- entityID — stable, derived from the production hostname, fixed at registration.
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
message and a pre-generated change request — weeks before a student would have hit
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
- **The SimpleSAMLphp database user is read-only.** Only the control plane writes
  SP metadata, through parameterized statements.
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
environment. Staging on UBC infrastructure authenticates real users against real
CWL, so gating only production would leave a silent harvesting path open.

### Enforced attribute release

Attribute release is enforced **at the IdP**, populated from `auth.attributes`.
An app cannot receive an attribute it did not declare. The approval diff on that
field is therefore backed by enforcement rather than by trust — which is what
makes reviewing it worth doing.

### Local behaviour

The same IdP runs on the laptop with the existing `bio_prof` / `bio_student` test
users from `authsources.php`. **App code is byte-identical across all three
environments** — only the IdP metadata URL, entityID and keys differ, which is
exactly what `passport-ubcshib`'s `LOCAL` / `STAGING` / `PRODUCTION` presets
already express. That parity is what makes the production cutover a configuration
change rather than a code change, which matters when the code was written by an
agent that will not be present at launch.

### Risk

SimpleSAMLphp's SQL metadata source is **the highest-risk *technical* unknown in
this design** — it is an unverified property of third-party software, and
auto-provisioning for sandbox and staging collapses without it. It is spiked first
(§17, S2).

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
| **End user** | app passes hashed CWL `uid` as LiteLLM `user` | per request | `ai.budget.per_user_monthly_usd` |

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

`capabilities()` lets a driver honestly declare what it cannot enforce — e.g.
`{ enforcesEgress: false, isolationLevel: 'container' }` for the Docker driver —
rather than silently pretending. `isolationLevel` (`container` | `gvisor` | `vm`)
matters most for sandboxes, where a plain container is a weak boundary around
unreviewed code; see §20. The control plane surfaces declared-but-unenforced policy as a warning
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
streams a *"starting your app…"* holding page, then proxies through. Because
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

`*.manifest.localhost` fails that test. It resolves on the host (verified on
macOS, though to `::1`, not `127.0.0.1`), but **inside a container `.localhost` is
the container's own loopback** — so an app container fetching
`SAML_IDP_METADATA_URL` would call itself, and Manifest's health checks would do
the same. It also does not resolve at all on Linux, where glibc special-cases
`localhost` but not `*.localhost`, which breaks any colleague not on a Mac.

The design is therefore:

- **`*.manifest.test`**, served by a **dnsmasq container** that is the DNS server
  for every Manifest Docker network, resolving to the host-gateway address.
- On the host, `/etc/resolver/manifest.test` points at that dnsmasq. Scoped to
  `manifest.test` rather than all of `.test` so it cannot collide with a
  developer's other projects.
- One hostname, correct from host and container alike, resolving with the network
  off, on macOS and Linux.
- Everything binds `127.0.0.1` explicitly; relying on `::1` produces intermittent
  failures under Node's IPv6-first resolution order.
- UBC: a wildcard DNS record per listener.

### Egress — default deny, every environment (D18)

All environments route outbound traffic through a forced HTTP(S) proxy. The policy
is **deny by default**: a platform baseline (the registry mirror, LiteLLM, the
Manifest IdP) plus whatever the app declares in `egress.allow`.

Sandboxes get a wider baseline — package registries — because they must install
dependencies; production does not, because a production app that suddenly needs a
new registry is a signal, not a convenience.

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
  `coder.com` reference compose file in this repository's sibling directory mounts
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

### Supply chain

The agent installs packages it chose, sometimes packages it hallucinated —
*slopsquatting*, where an attacker registers a plausible name an LLM invents, is a
live attack class aimed squarely at this workflow.

- dependencies resolve through a **private registry mirror** with an allowlist, or
  quarantine-on-first-use for unknown packages
- committed lockfiles are required; builds fail without one
- install scripts disabled where the ecosystem allows it
- base images pinned by digest, not tag
- an SBOM is produced per build and retained with the Release
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
- **Images built on a developer laptop are never promoted beyond it.** Developer
  machines are arm64; UBC infrastructure will be x86-64, and "promote the exact
  digest" makes an architecture mismatch unresolvable at deploy time rather than
  build time. Everything reaching staging or production is built by CI on the
  target architecture. Locally this is enforced by tagging laptop-built images with
  a `local` registry namespace that the staging and production drivers refuse.

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
| `data: {classification, retention_days}` | recorded, unenforced | FIPPA-driven placement constraints and backup policy |
| `Project.forked_from` | always null | fork and remix — one good rubric tool becomes forty |
| `Project.visibility` / `published` | private | an institutional app gallery |
| `checks: []` in the spec | reserved, must be empty | *app-declared* checks. Platform-mandatory scanning (dependency, secret) does **not** use this field — it runs on every build regardless (§12). Unlocks the automated WCAG accessibility gate before public launch (a legal requirement for UBC; `tlef-starter` already carries Playwright a11y configs). |
| Platform-initiated `AgentSession` | API present, callable by any client holding a delegated token (D24) | self-healing apps: crash at 2am, repair sandbox opens, owner accepts a release in the morning |

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
| **S7** | **The local baseline boots.** The full platform stack of §21 plus the dnsmasq/`manifest.test` resolution design, on a clean machine, offline after seeding. This is the spike that decides whether C1 is a real constraint or an aspiration, and it is cheap — run it early. |
| **S6** | **Container isolation.** With the hardening baseline of §20 applied, what can a hostile process in a sandbox actually reach — the runtime socket, the control plane, another app's database, a metadata endpoint? Establishes whether plain containers are adequate for sandboxes or whether gVisor/Kata is needed, and produces the security regression tests. |

S1–S3 are required before Phase 1. **S6 is required before Phase 3** (the first
time untrusted code executes with `exec`), and earlier is better. S4 and S5 may run
alongside Phases 1–2.

### Phases

| Phase | Deliverable | Question answered |
|---|---|---|
| **1 — The spine** | The §1 journey, clickable in the reference console (§22): project → repo → build → staging deploy → CWL login → AI call, live at a URL. One blueprint (`node-ts-mongo`, from `tlef-starter`). Imperative path. Laptop only. **Plus the non-negotiable security baseline:** container hardening, per-app networks, default-deny egress, derived ACS URLs, redaction at capture, authorization contract suite. **Plus the local baseline of §21** and the front-end contract: OpenAPI document, generated client, and `manifest-mock`. **Plus the delegated-token model and `PendingAction` flow (D24)** — CI needs it regardless — and the agent knowledge pack served over the API (D25). | Is the loop real, is the containment real, and can a second developer reproduce it? |
| **2 — Environments & approvals** | production, promotion by digest, `LaunchReadiness`, sensitive-diff escalation, secrets, admin UI, IAM registration package + PIA draft generation | Is it safe, and can we get an app legitimately launched? |
| **3 — Sandboxes** | agent `exec`, per-session keys, preview routes; a chat pane added to the reference console against the same API; the **MCP server** (§22), making "bring your own agent" real. **The separate front-end project can now begin against a real, exercised API.** | Can an AI build here? |
| **4 — Reconciler & hibernation** | straight-line path becomes the loop; wake-on-request | Does it scale down? |
| **5 — UBC infra driver** | k8s or VM driver passing the contract suite; real deployment | Does it leave the laptop? |

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
- Multi-language buildpack auto-detection. One blueprint in v1.
- A metrics or logging platform. Manifest surfaces what faculty need and forwards
  the rest.
- Programmatic registration with real UBC IAM (C4).

---

## 19. External dependencies and open questions

| Item | Status | Owner |
|---|---|---|
| SimpleSAMLphp SQL metadata source works as required | **Unverified — spike S2** | Manifest team |
| Final UBC target infrastructure (RHEL 9 VMs vs Kubernetes) | Undecided; Phase 5 blocked on it, Phases 0–4 are not | UBC IT |
| One-time UBC IAM registration for a future real-CWL path | Not required for Phases 0–5 (D6) | UBC IAM |
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
- **Step-up re-authentication** for approving a release, reading a secret, or
  changing the model catalogue. A stolen admin session must not be sufficient to
  put an app on the public internet.
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

One configuration point protects the whole fleet. This is the highest-leverage
control in the platform.

### Availability

- **Wake-on-request is an amplification primitive** — one unauthenticated request
  starts a container *and* a database. Wake is rate-limited per app and globally,
  with a cap on concurrent wakes and a queue beyond it.
- Build concurrency is bounded per project and globally; builds have timeouts.
- Sandboxes carry `pids` and disk ceilings (§7) as well as CPU and memory.

### Vulnerability management

Dedicated per-app service containers (D3) make patching *harder*, not easier: 500
apps means 500 Mongo and Qdrant instances that will not update themselves. This is
the security half of the "version sprawl" cost accepted in D3, and it needs a
control-plane capability rather than a script written later:

- service images are **platform-owned and platform-pinned**; apps choose a
  supported version line, not an arbitrary tag
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

Eight containers, plus the control plane as a host process and Ollama as a host
application:

| Component | Port | Notes |
|---|---|---|
| Caddy (edge) | 80, 443 | Both listeners on loopback locally |
| dnsmasq | 7153 | Serves `*.manifest.test`; see §12 |
| Postgres | 7103 | **One server, three databases**: control plane, LiteLLM, IdP metadata — consistent with D11 and worth ~400 MB on a 16 GB machine |
| Manifest IdP (SimpleSAMLphp) | 7122 | Deliberately *not* 6122 — that is already taken by the standalone `docker-simple-saml` on this machine |
| LiteLLM | 7106 | Virtual keys and budgets against the shared Postgres |
| Registry (`registry:2`) | 7107 | Required: §13 binds approval to a digest and restricts pushes |
| Verdaccio | 7108 | The private package mirror §12 mandates; also what makes offline installs possible |
| Egress proxy | 7109 | Default-deny must exist locally, or an app works here and fails in staging |
| Control plane | 7100 | **Host Node process**, not a container — it needs the Docker socket, and §12 forbids mounting that socket into a container. Also faster to iterate on. |
| Admin UI (Vite) | 7101 | |
| `manifest-mock` | 7102 | |
| Reference console (§22) | 7104 | Served at `console.manifest.test` through Caddy, leaving `app.manifest.test` for the separate front-end project |
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
| Minimum | 16 GB RAM, 4 cores, 40 GB free disk, ≥8 GB allocated to the Docker VM |
| Recommended | 32 GB |
| Rough budget | platform ~3 GB · Ollama chat model ~6 GB · embedding model ~1 GB · each app environment ~0.5 GB |

At 16 GB, cap concurrent local instances at two and set the sandbox idle timeout to
10 minutes. **Hibernation (§11) is what makes the laptop case viable at all** — the
same mechanism that makes 500 apps affordable on UBC infrastructure is what keeps a
laptop from thrashing.

### TLS

Caddy's internal CA issues the certificates, but the root must be trusted in two
places: the macOS keychain (for the browser) and container trust stores via
`NODE_EXTRA_CA_CERTS` (for server-side SAML metadata fetches and LiteLLM calls).
This is one automated step in `make seed`, not a manual dance — but it is not free,
and D12 should not be read as claiming otherwise.

### Commands

| | |
|---|---|
| `make seed` | **The only step needing network.** Pulls digest-pinned base images, warms Verdaccio with the blueprint's dependency closure, pulls Ollama models, installs the resolver file and trusts the CA. |
| `make up` | Boots the stack. Works offline after seeding. |
| `make reset` | Destroys all projects, volumes and registry contents; keeps the seed cache. |
| `make doctor` | **The reproducibility tool.** Checks Docker running and VM memory, Ollama up with the required models present, resolver file installed, CA trusted, ports free, disk space, and architecture. Every "works on my machine" report should start with its output. |

### The front-end in the local topology

The faculty-facing front-end is a first-class citizen of this stack (C1). It is
served at `app.manifest.test` **through the same Caddy**, so cookie scope, CSRF
origin and SAML redirect origins match production rather than being accidentally
different on a bare Vite port.

Front-end developers are not required to run the platform. `manifest-mock` (§5,
§16) serves the published contract from fixtures — including scripted WebSocket
streams for build logs, deploy transitions and incidents — so the common case is
one process, not eight containers plus a language model.

**Sequencing for the front-end team:** the contract, the mock and the reference
console land in Phase 1 — so the team starts against an API that has already been
driven end to end by a real client, not a paper contract. Real read and deploy APIs
in Phase 2; the live agent loop needs sandbox `exec` and WS streaming, so it is
genuinely available in **Phase 3**.

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
6. `Driver.capabilities().isolationLevel` is `container`, the weakest level (§20).
   Spike S6 determines whether that is acceptable for sandboxes.


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
