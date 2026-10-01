# The Launch Path Implementation Plan

> **SITTING 1 — TASK 1 — DONE 2026-09-29, THE SAME SESSION, AT RICH'S WORD: THE CONTROL PLANE HAS RUN ON REAL GITHUB.** A project
> created through the platform (`lp-real-a`) is a real private repository in `Manifest-local-dev`, holding a commit made through
> the API; it was built from its mirror and served in the sandbox; and a scratch project was deleted and its repository gone
> from GitHub. Every measurement is in [`spikes/launch-baseline/`](../spikes/launch-baseline/README.md), and `[M<n>]` blocks
> head Tasks 2, 6, 7, 9, 10 and 11. **No task boundary moves**, and Task 6 is Branch G. **Rich's review is next** — the plan, its
> twelve sittings and its six spec actions (*What Rich does* 1–2) — **and, relayed after the close, FE-39: a thirteenth sitting
> (5a, Task 8a) and a seventh spec action — FE-39 CONFIRMED by Rich the same evening, its three open choices answered; Spec
> action 7 APPLIED at his word (Rich, 2026-09-29: *"apply 7"*)**.

> **SITTING 2 — TASKS 2 AND 3 — DONE 2026-09-29, after Rich APPROVED THIS PLAN AS WRITTEN, THIRTEEN SITTINGS** (sitting 2's first
> message). The test tiers refuse a real GitHub; a failed create leaves no repository; `source_repositories.api_host`; the demos refuse
> real GitHub by name; `scripts/github-real-repos.sh`; F26 drained centrally — and Step 6's real check green. *Sitting 2* is the record.

> **SITTING 3 — TASKS 4 AND 5 — DONE 2026-09-29.** FE-38: every instance says when the deploy made it (`0041`, contract **`1.5.0`**,
> the plan's one bump). FE-33: a stream whose credential is gone is closed at the moment it goes — `4401` for a revoked or expired
> token or session, `4404` at a delete's tombstone — and the race between the upgrade's credential check and the stream's registration
> is closed. *Sitting 3* is the record.

> **SITTING 4 — TASKS 6a AND 6 — DONE 2026-09-29/30.** FE-41: real GitHub refuses a repository it made seconds ago — not the
> starter — so driver 2's create retries its seed push and first fetch (by status, ≤30 s, a fresh token each time); 5 of 5 on
> github.com. Spec action 6 applied; FE-34's guard keeps §7's words in the gateway (`make verify` 62). *Sitting 4* is the record.

> **SITTING 5 — TASKS 7 AND 8 — DONE 2026-09-30.** Spec actions 8, 1 and 2 applied at Rich's word first. A session whose project no
> longer allows one of its models is narrowed in place (`agent_session.narrowed`), and ended only when nothing is left. Removing a member
> revokes their tokens on the project, closes their streams and ends their sessions (`member_removed`), and neither a mint nor a session
> start can race it into a live credential. Contract still `1.5.0`. *Sitting 5* is the record; **sitting 5b (Task 6c) is next.**

> **SITTING 5b — TASK 6c — DONE 2026-09-30** (Spec action 8's (b) and (c)). A rehearsal needs a step-up, and takes its production
> instance down — the name, the Route record, the instance — before it records; a second while one runs is `409 REHEARSAL_RUNNING`; a
> take-down that fails is `500 REHEARSAL_TEARDOWN_FAILED`; a deploy that throws releases the name, and the boot takes down a rehearsal a
> stopped control plane left serving. Contract still `1.5.0`. *Sitting 5b* is the record; **the faculty front-end's 7100 window, then
> sitting 5a (Task 8a), are next** — 5a may start during the window, with no Vitest and no restart until the walk is done.

> **SITTING 5a — TASK 8a — DONE 2026-09-30** (FE-39, Spec action 7). Only faculty build: the control plane asks for
> `eduPersonAffiliation` and keeps it at every sign-in (`0044`); `Me.mayBuild`; `createProject` and `startIntakeSession` refuse anyone else
> `403 BUILDING_NOT_OPEN`, and `addMember` a newcomer who may not build `409 MEMBER_MAY_NOT_BUILD`; `MANIFEST_ADMIN_PUIDS`, when set,
> reconciles the role at every sign-in, audited. Contract still `1.5.0`. *Sitting 5a* is the record; **Mailpit (`manifest-60`), then
> sitting 6 (Task 9), are next.**

> **SITTING 6 — TASK 9 — DONE 2026-09-30/10-01** (Spec actions 3 and 9). The three clocks' records: `IamRegistration` per environment
> (`0045`: `environment_kind`, UNIQUE `(project_id, environment_kind)`, `submitted_at`/`submitted_by`/`generated_package`, a CHECK that
> holds only a REGISTERED row); an owner's *"I've sent it"* (`submitIamRegistration`, `submitPrivacyAssessment` — `launch:submit`,
> person-only), gated in UBC's order (`409 LAUNCH_PIA_NOT_APPROVED` for EITHER registration, `409 LAUNCH_STAGING_NOT_REGISTERED` for
> production), a draft required (`409 LAUNCH_DRAFT_REQUIRED`), a day that can be true (`400 LAUNCH_SENT_AT_INVALID`), one locked
> transaction; the build checks only production's REGISTERED row; `LaunchReadinessItem.since`; `LaunchRecords.stagingRegistration`.
> Contract still `1.5.0`. *Sitting 6* is the record; **sitting 7 (Task 10) is next.**

> **SITTING 7 — TASK 10 — DONE 2026-10-01** (Spec action 4). D19's registration package: `draftIamRegistration` (`launch:draft`,
> mintable) stores what a person sends UBC IAM — the environment's entity, ACS and SLO; its certificate (the public half, minted once under
> a lock); every attribute with its purpose and the lines that read it; the contacts; the PIA number; the metadata in UBC's structure.
> `409 LAUNCH_RECORD_SUBMITTED`, `409 LAUNCH_NOT_CWL`; and what is sent is the draft read, carrying the PIA number (`409 LAUNCH_DRAFT_STALE`,
> `draftGeneratedAt` and `409 LAUNCH_DRAFT_CHANGED`). The checklist says when a draft no longer matches the release serving staging.
> Contract still `1.5.0`. *Sitting 7* is the record; **sitting 8 (Task 11) is next.**

> **AFTER SITTING 4a's CLOSE — SPEC ACTION 8 DECIDED BY RICH, 2026-09-30: (b) AND (c) TOGETHER** (*"b and c together, in its own
> small sitting after 5"*): a step-up before a rehearsal, and the rehearsal takes its production instance down before it records its
> result. **Task 6c, its own sitting 5b, after sitting 5.** The combined words are under *Spec actions*, 8 — **APPLIED at his word the same
> day** (*"apply 8"*). *After sitting 4a's close* is the record.

> **AFTER SITTING 5's CLOSE — RICH'S DECISIONS OF 2026-09-30 (the planning session `manifest-00`; his words in
> [`../2026-09-30-decisions.md`](../2026-09-30-decisions.md)).** **Spec actions 3, 4 and 5 are DECIDED and APPLIED** (`844605b`) — 3 and
> 5 option (a) as worded; 4 option (a) with two consequential edits and one bullet (the package carries the privacy assessment's
> reference, the PIA number). **A NEW Spec action 9, APPLIED the same day: UBC's order is SEQUENTIAL** — the privacy assessment first,
> then the staging registration (carrying the PIA number), then, once staging is registered and tested, the production registration
> — and **the platform gates the owner's *"I've sent it"* in that order** (Task 9's `[S9]` block). **Task 11 stays** (*"Keep Task
> 11"*). **Sittings 10 and 11 are MERGED** (Tasks 13 and 14 in one sitting; stop after Task 13 if it runs long) — **19 tasks in 14 sittings.**
> The successor is the *faculty-ready* plan, WRITTEN and APPROVED the same day.

> **WRITTEN 2026-09-29, AT RICH'S INSTRUCTION, FROM ORIENTATION §7e** (*"Yes: write the plan, then run its Task 1 (including the
> real-GitHub run) in the same session"*). **Reviewed and APPROVED by Rich as written, thirteen sittings, 2026-09-29** (sitting 2's first message). Its sitting 1 — Task 1, the measurements and THE FIRST
> RUN OF THE CONTROL PLANE AGAINST REAL GITHUB — runs in the same session, before his review, exactly as the front-end enablement
> plan's sitting 1 did. Every fact in *Read this first* was read from the code at `862851c` on 2026-09-29; Task 1 re-measures
> each one marked *(T1: M<n>)* into `spikes/launch-baseline/`, and a `[M<n>]` block at the head of a task is what it corrected.
> *What executing this plan found* is where every sitting's record goes. **Six spec actions are drafted below, each with its
> options and a recommendation; none is applied, and no task a spec action changes runs before Rich has decided it.**

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Commit on `main`; no branch, no worktree, no push** — ORIENTATION §6 rule 9, which both of those skills will push you against.

**Goal:** A faculty member can start the three long clocks of a launch from week one and see each one wait, and an administrator can see who is waiting on them. The owner **drafts** the staging registration, the production registration and the privacy assessment. For each registration Manifest generates D19's package: SP metadata in UBC's structure, the certificate the app will sign with, and every attribute with a justification taken from where the app's code reads it. For the assessment it generates D19's draft, derived from the manifest. The owner says **"I've sent it"**, and each record then reads *waiting since* that day. The owner asks an administrator to **sign this release off**. The request lands in **§26's queue** beside the records waiting for UBC's answer, oldest first, each saying how long it has waited. Around that path, this plan also delivers Rich's additions of 2026-09-29 and the front-end's three asks he carried:

- **The GitHub driver runs against REAL GitHub** — Task 1 runs it, and Task 2 fixes what it finds.
- **A session whose project no longer allows one of its models is TRIMMED in place**, and ended only when nothing it may use is left.
- **Removing a member revokes their tokens on the project and ends their agent sessions.**
- **A revoked, expired or removed credential's open event stream is closed** (FE-33, `4401`).
- **The capable model's fallback answers only a provider that could not be reached or failed** (FE-34 — measured first, because LiteLLM 1.98.0 has no setting for it).
- **Every instance carries when it was made** (FE-38).
- **The unit suite's retire-pass deadlock is drained centrally** (F26).

It is proved by `make demo-launch`: an owner and an administrator drive the whole path on either driver, through `@manifest/contract`. A person clicks it too.

**Architecture:** The records P6a built — `IamRegistration` and `PrivacyAssessment`, one row per project, an administrator's alone — become the three clocks. The staging registration is **a second kind of `IamRegistration`**, keyed by environment. Both kinds, and the assessment, gain what an owner writes: a **draft** Manifest generates and stores on the row, and a **submission** (`submitted_at`, `submitted_by`) that freezes the draft that was sent. UBC's answers stay the administrator's record, exactly as today.

The registration package is rendered in `sso/`, the module that already derives every value in it: `deriveSpEntity` gives the entity id and URLs, and `ensureSpKeypair` gives the RSA-4096 certificate. `sso/` renders the package as SAML metadata XML in the structure UBC IAM receives from `saml-metadata-generator` (UBC's own tool, read, never imported). The justifications come from `launch/`, deterministically: a stock purpose for each attribute, plus the lines of the committed tree that read it. **No model is asked.**

**A sign-off request** is a new row an owner writes against the launch candidate. **The queue** is one admin-scoped read derived from rows that already exist, as §26 says every queue item is.

The additions reuse what is there. The trim is LiteLLM's `/key/update` on the session's own alias. The member removal reuses `revokeTokensOf`'s shape and `endSessionsOf`. The streams get a registry the event route already needs. The fallback gets a guard that LiteLLM loads, if Task 1 measures that one can see the original error. F26 is a drain `resetDatabase` awaits.

**Tech Stack:** TypeScript 5.9.3 on Node **24.12.0** (host), Fastify **5.12.3**, Drizzle over Postgres 16, `zod/v4` for the API (the spec module is still `zod` 3.25.76's v3 API), Vitest 2.1, `git` **2.50.1** (Apple). React 19.3.0 + Vite 8.3.0 in `packages/console`; `@manifest/contract` generated by `openapi-typescript` 7.13.0 through `openapi-fetch` 0.17.0; Ajv 8.20.0 in `@manifest/mock`. LiteLLM **1.98.0** (`infra/images.lock:9`, `ghcr.io/berriai/litellm@sha256:20b5044b…`), `@node-saml/node-saml` **5.1.0**, `openssl` as `sso/keypair.ts` already runs it. **No new external package** — the registration XML is written by hand, as `saml-metadata-generator`'s own `metadata.ts` writes it (Decision 12).

**Spec:** [`../specs/2026-08-29-manifest-platform-design.md`](../specs/2026-08-29-manifest-platform-design.md). Read these sections: **§9** from *Staging: a registration with UBC's staging IdP* to *Pre-production rehearsal (D21)* inclusive; **§13** *First production launch is a checklist, not a button (D19)*, *Gate (D9)*, *Integrity of the gate* and *Roles*; **§26** *Administration is a role* (D31), *The primary screen is the queue*, *Non-repudiation*; **§6**'s `IamRegistration`, `PrivacyAssessment`, `Approval`, `LaunchReadiness`, `DelegatedToken`, `AgentSession` and `Instance` rows; **§7** *Classification gates model routing (D17)* — its last three paragraphs; **§10**'s *Agent key* row; **§19**'s rows for the staging registration and the privacy assessment; **§20** *Credential classes (D24)*; **§22** D23.2, D23.8 and D23.9; and D9, D15, D19, D20, D21, D24 and D31 in §4. **The six spec actions below change §6, §7, §9, §10, §13, §19, §20, §26 and D24** — read each before the sitting that builds it.

**Roadmap:** *The faculty front-end's message*'s second bullet (**"AFTER THE FRONT-END ENABLEMENT PLAN, IN RICH'S ORDER: THE LAUNCH PATH FIRST"**) in [`2026-08-29-plan-roadmap.md`](./2026-08-29-plan-roadmap.md) — and **P8, *Launch package generation*** (the roadmap's Phase 2 table: *"§9 and D19: the IAM registration package via `saml-metadata-generator`, and the PIA draft"*), **which this plan absorbs**: FE-6 is P8's generation plus the owner's half of the records P6a built. **This plan is the first to let a faculty member write to a launch record**, and the first admin-scoped read of more than one kind of thing.

**Predecessor:** [`2026-09-27-front-end-enablement.md`](./2026-09-27-front-end-enablement.md), executed 2026-09-29. **Its *What this plan does not build* and its *Sitting 12*'s deferred list are an input list**: M4 (Rich's decision) is Task 8; M6 is FE-33, Task 5; M3 is part of Task 12; F26 is Task 3. The rest stays named in *What this plan does not build* below.

**Successor:** **the *faculty-ready* plan — [`2026-09-30-faculty-ready.md`](./2026-09-30-faculty-ready.md), WRITTEN and APPROVED by Rich 2026-09-30** (*"(a) Faculty-ready → FE-32 → vuln DB"*; *"plan looks good"*): FE-28 widened, FE-30 with FE-29, FE-31, F8's `422` hook, `node:24-alpine`, `Init: true`, the IdP store's own role and §26's administrator reason. **Then FE-32** (an agent can add a dependency), **then the vulnerability database in the console.** It replaces *"FE-30 and FE-28 in a sitting of their own after it"* (2026-09-29).

---

## How this plan is to be executed — sittings, one per session

**One sitting per session, with a check-in at each boundary.** This pattern has carried every plan since P4a. It means a session limit never lands in the middle of a task. This plan commits after every task: a stop *between* tasks is recoverable, a stop *inside* one is not.

> **THIRTEEN SITTINGS — APPROVED BY RICH AS WRITTEN, 2026-09-29 (sitting 2's first message) — the thirteenth, 5a (Task 8a, FE-39),
> added after sitting 1's close from the front-end's relay and confirmed by Rich the same evening; the fourteenth, 4a (Task 6b,
> FE-42), after sitting 3's close; the fifteenth, 5b (Task 6c, Spec action 8's (b) and (c)), after sitting 4a's — Rich, 2026-09-30:
> *"in its own small sitting after 5"*. 5b runs BEFORE 5a: the letter says what it was added after, not its place in the order.** The order puts the **measured, small and self-contained** work first,
> so the suite is stable (F26) and real GitHub's fixes land before anything is built on driver 2 again. It then puts **the spec
> actions as LATE as possible**: sittings 2–4 need none (Spec action 6, the fallback's words, before sitting 4 only if Task 1
> finds a guard can be built), so Rich can decide Spec actions 1–2 before sitting 5, 3 before sitting 6, 4 before sitting 7 and
> 5 before sitting 9. **The heavy ones are 7 (the registration package — XML, a certificate, and code read for every attribute)
> and 12 (the acceptance, a first launch driven by two people).** *Offered, and not recommended:* **eleven** — Tasks 10 and 11 in
> one sitting, which puts D19's two generators, and both of their controls, in one session's context; **thirteen** — Task 6
> split into its measurement and its guard, which Task 1 already separates.

*The **Status** column records what a sitting made true, never how many findings it produced. That number lives once, in the roadmap's defect-rate table (Rich, 2026-09-20).*

| Sitting | Tasks | What it delivers | `pnpm test:docker` owed? | Spec action needed first | Status |
|---|---|---|---|---|---|
| 1 | 1 | **The measurements this plan rests on — and THE CONTROL PLANE ON REAL GITHUB for the first time**: a project created through the platform becomes a real private repository in `Manifest-local-dev`; a commit through the API lands on github.com; a build and a deploy come from the mirror; a scratch project is deleted and its repository is gone. Also: LiteLLM 1.98.0's `/key/update` on a live key; which provider errors a `general` fallback answers, and whether a LiteLLM hook can see the original error; an open stream after a revoke; F26's rate; `saml-metadata-generator`'s output structure; where the blueprint's code reads each attribute; the gate numbers. **Alone, and first — the same session that wrote the plan, at Rich's word** | **No** — nothing under the owing paths changes | — | **DONE 2026-09-29**, the session that wrote the plan — the control plane on the real App end to end (create, read, commit, build, deploy, delete; `lp-real-a` kept); `/key/update` by alias narrows a live key at once; FE-33 reproduced; every provider error falls back, a `422` answers `200 null`, and a trace-id guard can be built (Branch G); UBC's metadata structure recorded; `[M]` blocks at Tasks 2, 6, 7, 9, 10, 11; **the split stands** |
| 2 | 2, 3 | **What real GitHub found**, fixed: a repository left behind by a create that failed after GitHub made it; a project made against the fake refused on the real App, and the reverse (`source_repositories.api_host`); the demos refusing real GitHub by name; `scripts/github-real-repos.sh`; RUNBOOK's real-App section written from the run. **And F26**: every retirer and build runner a test builds, drained before `resetDatabase`'s `TRUNCATE` | **Yes** — `source/` | none | **DONE 2026-09-29**, after Rich approved the plan — subagent-driven: Step 0 first and alone (the tiers refuse a real GitHub, watched with the day's rows still in the tables); a failed create destroys what the driver made; `api_host` (migration `0040`, never published); the boot leaves another GitHub's mirror alone; the demos refuse real GitHub by name; `github-real-repos.sh`; F26 drained centrally (`delivery.test.ts` 1 of 8 red before, 0 of 8 after); **Step 6 on real GitHub green** (`lp-real-b` made with `api.github.com`, deleted, gone); one whole-branch review and its fix wave; Rich's demo paused it (F14) |
| 3 | 4, 5 | **FE-38 and FE-33**: `instances.created_at` and `Instance.createdAt`; a stream registry — a revoked or expired token's streams closed `4401`, a deleted project's closed `4404`, at the moment it happens | **Yes** — `observability/`, `releases/` | none | **DONE 2026-09-29** — subagent-driven, after Rich's answers (FE-40 confirmed; the database dumped first): `0041` and `Instance.createdAt`, **contract `1.5.0`** (the plan's one bump); the stream registry — `4401` at a revoke, an archive's revoke and an expiry (token AND session), a delete's `4404` at the tombstone, **the authorization → registration race window closed and held by a deterministic lock test**; one fix round per task, one whole-branch review beside the Docker tier, one fix wave; the front-end told at every contract commit and adopted `1.5.0` |
| 4 | 6, 6a | **FE-34**: the capable model's fallback answers a provider that could not be reached, timed out, rate-limited or failed — and **not** one that refused the request as malformed. It is a LiteLLM guard if Task 1's `[M5]` measures that one can be built, and otherwise documented and raised with Rich. **And FE-41 (Task 6a, Rich's, after sitting 3's close): a project created WITH a starter on real GitHub — reproduced at his yes, logged, fixed on driver 2, held by a test** | **Yes** — `ai/`, `infra/`, `source/` | **Spec action 6** — ✅ **DECIDED by Rich: option (a)** (2026-09-29, after sitting 3's close: *"(a) is good"*); **APPLIED by sitting 4 before Task 6** (`0ebe514`); Task 6a needs none | **DONE 2026-09-29/30** — subagent-driven: **FE-41's premise false** (not the starter — real GitHub refuses a repository it made seconds ago, 403/404 in four measured shapes); driver 2's create retries its seed push and first fetch by STATUS, one ≤30 s budget, a fresh token per retry, and forgets a slug's stale tokens first; a failed create logged; on github.com 6 of 7 failed before, 5 of 5 after (2 retried). **Spec action 6 applied**; the **fallback guard** (`manifest_guard.py`) refuses a fallback after a provider's 400/413/422, read from the request's own logging object, lets 401/403/404/408/429/5xx fall back — streamed too; `make verify` 62. F8 (`422` → `200 null`) stands, LiteLLM's — for Rich |
| 4a | 6b | **FE-42 (Rich's, after sitting 3's close — *"its own small sitting"*)**: the project's OWNER may run D21's rehearsal (today `launch:record`, an administrator's alone); the rehearsal's published description says who may run it | **Yes** — `launch/`, `projects/` | **To be read first** — Task 6b's Step 1 reads §13, §20 and D24; if any names who triggers the rehearsal, a spec action is drafted and the sitting stops for Rich. **A TOKEN MAY NOT RUN IT — Rich's (a), PERSONS ONLY** (relayed by `manifest-73`, his session for 4a, 2026-09-29: owner, collaborators and administrators from an interactive session; a delegated token stays refused, SESSION_ONLY as today; one D24 clause is DRAFTED as a spec action for his later approval — it does not block 4a); **Spec action 8 drafted by 4a — its premise RE-ASKED** (the rehearsal leaves the unapproved candidate on production's public listener) | **DONE 2026-09-30** — subagent-driven: Step 1 read by the controller (no spec text names who triggers it — no stop); **`launch:rehearse`**, in `OWNER` (collaborator and administrator inherit it), person-only, not step-up; `runRehearsal`'s description says who may run it and drops `FORBIDDEN`; the owner still refused `launch:record`; contract `1.5.0` (the enum gains it); the front-end told first; **the whole-branch review found the rehearsal leaves an UNAPPROVED candidate serving production's public listener until the launch — Rich's (a) had rested on the controller's wrong *"nothing is public"*, so Spec action 8 re-asks it** (`fa02bbc` stands meanwhile); one wave: the published person-only lists held by a test, the journey's launch row split, comments made true |
| 5 | 7, 8 | **Rich's two decisions of 2026-09-29**: a session whose project no longer allows one of its models is **narrowed in place** (`/key/update`, `agent_session.narrowed`) and ended only when nothing is left; **removing a member** revokes their tokens on the project, ends their agent sessions (`member_removed`) and closes their streams | **Yes** — `ai/`, `projects/` | **Spec actions 1 and 2** — ✅ **APPLIED as worded, 2026-09-30, at this sitting's open** | **DONE 2026-09-30** — subagent-driven, by `manifest-d4`: Spec actions 8, 1 and 2 applied first at Rich's word; **Task 7** (`d061ad7`): a session narrowed in place — `/key/update` by alias, then the row and `agent_session.narrowed` in one transaction, ended only when nothing is left (`0042`); **Task 8** (`baacc1c`, `0b4d50e`): a removal revokes the person's tokens on the project in its own transaction, closes their streams `4401`/`4404`, ends their sessions `member_removed` (`0043`), and a start or a mint racing it holds the membership row; one fix round (the mint race), one whole-branch review beside the Docker tier (269/269, no pool red — Rich removed the 42 orphan apps), one fix wave (`f27914e`: the seam guard's test, a false `409`); contract `1.5.0`, the front-end told before each commit |
| 5b | 6c | **Spec action 8's (b) and (c) (Rich, 2026-09-30 — *"b and c together, in its own small sitting after 5"*)**: running D21's rehearsal needs a step-up (`launch:rehearse` in `STEP_UP_GUARDED`, `assertStepUp` at the route), and the rehearsal **takes its production instance down** — the name first, then the instance — **before** its row is written, so nothing unapproved stays on production's public listener and the checklist cannot read the item met while the candidate serves. **Runs after 5 and BEFORE 5a** | **Yes** — `launch/`, `releases/`, `routing/`, `projects/` | **Spec action 8** — ✅ **DECIDED (b) and (c)**; ✅ **APPLIED 2026-09-30** (*"apply 8"*) | **DONE 2026-09-30** — INLINE, by `manifest-e2`: the step-up (`STEP_UP_GUARDED`, `assertStepUp` at the route); the take-down under the environment lock — the name only while it reaches the rehearsal's own instance, the Route record, the instance — BEFORE the row; `500 REHEARSAL_TEARDOWN_FAILED`; FE-43's `409 REHEARSAL_RUNNING` (a try-lock); one whole-branch review beside the Docker tier, one fix wave (a deploy that throws releases the name; the boot takes down a rehearsal a stopped process left serving); sitting 5's contract bundle; contract `1.5.0`; the front-end told before each contract commit |
| 5a | 8a | **FE-39 — who may build (Rich's, confirmed 2026-09-29)**: faculty — `eduPersonAffiliation` exactly `faculty` — refreshed at every sign-in, or an administrator named by a setting; one predicate, `mayBuild`, on `getMe`; `createProject`, `startIntakeSession` and `addMember`'s target refused anyone else (`403 BUILDING_NOT_OPEN`, `409 MEMBER_MAY_NOT_BUILD`); the mock's switch; every fixture and demo that builds as a non-faculty person moved | **Yes** — `identity/`, `sso/`, `projects/` | **Spec action 7** — ✅ APPLIED 2026-09-29, at Rich's word | **DONE 2026-09-30** — INLINE, by `manifest-74`, after the front-end's 7100 window (the database dumped first): the affiliation asked for and written at every sign-in (`0044`), `[]` when absent; `mayBuild` (admin, or `faculty` exactly); the three refusals, `addMember`'s for a NEWCOMER only, decided under a membership row lock; `MANIFEST_ADMIN_PUIDS` authoritative when set, each change a `RoleChange`; `TEST_USERS` with affiliations and a fifth, `bio_colleague`; the IdP's `colleague`; `make demo-token` and `make demo-frontend` green on driver 1; the mock's `MANIFEST_MOCK_MAY_BUILD=0`; one whole-branch review beside the Docker tier, one fix wave (a removal racing a role change re-added the person; the Docker pins; the published example; the hint); contract `1.5.0`; the front-end told before each contract commit |
| 6 | 9 | **The three clocks' records**: `IamRegistration` per environment (the staging registration); `submitted_at`, `submitted_by`; an owner's *"I've sent it"* (`launch:submit`, person-only); a draft that never gates a build; `LaunchRecords.stagingRegistration`; `LaunchReadinessItem.since` | **Yes** — `launch/`, `releases/` | **Spec action 3** — ✅ APPLIED 2026-09-30; **and 9** — ✅ APPLIED 2026-09-30 (the order: `[S9]`) | **DONE 2026-09-30/10-01** — INLINE, by `manifest-92`, after Mailpit (the database dumped first; the front-end's 7100 window in the middle, migration held until it closed): `0045` (the staging kind, the submission columns, the CHECK on a registered row only); `launch:submit` (person-only) and the two submission routes, refused in UBC's order — **the assessment first for EITHER registration (the spec's words, wider than `[S9]`)**, staging before production — with a draft required and a real day; the build reads only production's registered row; `since` on the checklist; `[M8]`'s administrator hint; one whole-branch review beside the Docker tier (270/270), one fix wave (one locked transaction per submission, held by two deterministic lock tests; `z.iso.date()`; the kept reference; the mock in UBC's order; examples captured); contract `1.5.0`; the front-end told before each contract commit |
| 7 | 10 | **D19's registration package**, staging and production: the SP metadata XML in UBC's structure, the certificate the app signs with (D20's keypair, minted once), every attribute with its justification and the lines that read it, contacts; stored on the draft and frozen when sent | **Yes** — `sso/`, `launch/` | **Spec action 4** — ✅ APPLIED 2026-09-30 | **DONE 2026-10-01** — INLINE, by `manifest-8e`, beside the faculty front-end's F6 (mock-only — 7100 the sitting's throughout): `draftIamRegistration` (`launch:draft`, mintable) and `IamRegistration.package` — the entity, the certificate's public half through the registrar, every attribute justified by where the app reads it (the bridge skipped, bounded), the contacts (`MANIFEST_LAUNCH_CONTACTS`), the PIA number, the metadata in the tool's structure (`[M6]`); production from the candidate; `LAUNCH_RECORD_SUBMITTED`, `LAUNCH_NOT_CWL`; Review Focus 1's checklist half; `cwlFakes` on the real keypair store; ten controls red as predicted; one whole-branch review beside the Docker tier (271/271), one fix wave (`dec71d8`: one mint per environment under a lock; `LAUNCH_DRAFT_STALE`; `draftGeneratedAt` and `LAUNCH_DRAFT_CHANGED`) with six more controls; contract `1.5.0`; the front-end told before each contract commit |
| 8 | 11 | **D19's privacy-assessment draft**: §9's six rows derived from the manifest, the members and the catalogue, with the gaps an owner must fill named; a document to paste | **Yes** — `launch/` | **Spec action 4** — ✅ APPLIED 2026-09-30 (Rich: *"Keep Task 11"*) | ← **next** — read Task 11's `[S7]` block first |
| 9 | 12 | **FE-25 and §26's queue**: `requestApproval` on the launch candidate (`approval.requested`); `listQueue` — sign-off requests, registrations and assessments waiting on UBC, oldest first, each with how long it has waited; the fleet's `name`, `state` and `archivedAt` (M3) | **Yes** — `launch/`, `projects/` | **Spec action 5** — ✅ APPLIED 2026-09-30 | |
| 10 | 13, 14 | **MERGED BY RICH, 2026-09-30** (*"(a) Merge"* — sitting 11 folded in; if Task 13 runs long, stop after it and give Task 14 its own sitting). **The console and the mock**: every new operation called (`DELIBERATELY_UNCALLED` empty again); the Launch records screen gains the owner's half; a Queue screen for an administrator; the mock scripting drafts, submissions, requests and the queue. **Then the guides**: *Launching* rewritten around the three steps IN UBC'S ORDER (Spec action 9); *Building a front-end*, *For an AI agent*, *Events* and *Conventions* brought up to it — `4401`, a narrowed session, the fallback's header; every code block a run example **And Rich's published-text pass (`[S10]` at Task 14)**: every schema, field, tag, error and event text and every guide cites no section, decision or plan, and the docs gate is widened to hold it | **No** — unless a change reaches an owing path | — | |
| 12 | 15 | **The acceptance**: `make demo-launch` on either driver, green three times on each; every other demo; the offline acceptance's step 16; **a clicked half**; the plan's one whole-branch review. **Alone, and last** | **Yes** if any code changes | — | |

**EVERY SITTING ENDS THE SAME WAY, and none of these four steps is optional:**

1. **The four gates**, from the repository root: `pnpm test` (twice, alone), `pnpm lint`, `pnpm typecheck` and `pnpm format:check`. Add **`pnpm test:docker`** whenever the table above says it is owed (1309 s on its last run, 2026-09-29). **Budget for it rather than being surprised by it, run it in the background, and restart the control plane afterwards.** **The test budget is LEAN** (ORIENTATION §8 *Decided*): no open run on an unchanged tree, single files while fixing, and the whole suite twice on the FINAL tree at the close.
2. **A dated entry in *What executing this plan found*.** It records the tasks, every defect with the measurement that found it, and the negative controls, including which of them could not fail and why. It ends with the gate numbers and the state of the machine, **queried at the close** (`psql`, `docker`, `curl`), never remembered.
3. **This plan's sittings table, updated.** Mark the sitting done and move the `← next` marker. **State no findings count here**: it lives once, in the roadmap's defect-rate table, derived at the CLOSE with the command at the head of *What executing this plan found*.
4. **The close-out sweep in ORIENTATION §6.** Its first line is the roadmap ledger. **The gate numbers are stated ONCE (since 2026-09-30, Rich's *"Trim + single source"*): `scripts/ci-acceptance.sh`'s `EXPECT_` lines for the unit suite, doctor and verify, and ORIENTATION §2's box for `pnpm test:docker`'s** — everything else points at them, so the sweep moves one place each. **Then re-read your own §7e as a cold agent would, and verify every claim by opening what it points at.**

**THIS TABLE IS A SCHEDULE, NOT A CONTRACT.** Moving task boundaries is Task 1's job. **If a measurement breaks the split, say so to Rich before sitting 2 and let him re-cut it. Do not re-cut it silently.** Three rules survive any re-cut. **Task 1 stays first and alone. Task 15 stays alone and last. No task that a spec action changes runs before Rich has decided that spec action** — and if he chooses an option other than the recommended one, the task's own *If Rich chooses otherwise* paragraph says what changes.

---

## Decided by Rich — build them, do not re-open them

**Each of these was said by Rich.** Each is recorded in ORIENTATION §8, *Decided*, or in the session that wrote this plan.

- **THE LAUNCH PATH IS NEXT — FE-6 AND FE-25** (2026-09-27, the front-end enablement plan's sitting 7, first message: *"Launch
  path first"*). FE-6: the three clocks (the staging registration, the production registration, the privacy assessment),
  D19's generated drafts, an owner's *"I've sent it"*, a state that can say *waiting since*, and the staging registration as a
  tracked object like `IamRegistration`. FE-25: an owner's *"please sign this off"* for a release, feeding §26's queue.
- **"WRITE THE PLAN, THEN RUN ITS TASK 1 (INCLUDING THE REAL-GITHUB RUN) IN THE SAME SESSION"** (2026-09-29, this plan's first
  message). **And:** *"The network is on; you have my yes to create private repositories in Manifest-local-dev."* So Task 1's
  real leg is approved in advance, for this session. **A later sitting's real-GitHub call needs his yes again** (*What Rich does* 3).
- **"I WANT TO SEE APPS CREATED THROUGH THE PLATFORM END UP ON REAL GITHUB — THAT'S WHY .env KEEPS
  `MANIFEST_SOURCE_DRIVER=github`"** (2026-09-29). **The six real-App settings were in `.env` at this plan's writing, each equal
  to ORIENTATION §7e's value** — checked by comparing each line against the value, never printing `.env`.
- **THE NEXT PLATFORM PLAN RUNS THE GITHUB DRIVER AGAINST REAL GITHUB, AS ONE OF ITS TASKS** (2026-09-29, after the front-end
  enablement plan's close: *"add the GitHub driver run to the next plan"*). Task 1 is the run; Task 2 is what it finds.
- **A SESSION HOLDING A MODEL ITS PROJECT NO LONGER ALLOWS IS TRIMMED IN PLACE, NOT ENDED** (2026-09-29, *"yes please"*).
  *"MEASURE first whether LiteLLM 1.98 changes a live key's `models` in place (`/key/update`) and refuses the withdrawn ones at
  once; then narrow the key and keep the session, ending it only when nothing it may still use is left. **A spec action
  first**: §7's 'and the sessions already holding more are ended' changes, and the `agent_session` events say what was
  withdrawn."* Task 1's `[M3]`, Spec action 1, Task 7.
- **REMOVING A MEMBER REVOKES THEIR TOKENS ON THE PROJECT AND ENDS THEIR AGENT SESSIONS** (2026-09-29, *"YEs"* to the review's M4
  option (a) — the path `revokeToken` already takes). *"A spec action for the words first"* — §10's *Agent key* row and the
  *DelegatedToken* rule. Spec action 2, Task 8.
- **CARRY FE-33, FE-34 AND FE-38, AND THE F26 TEST FIX, IN THE PLAN** (2026-09-29, this plan's first message). As the platform
  recommended them to the front-end's session, and as that session holds them (`manifest-app-9d`, 2026-09-29: *"exactly as
  manifest-8b sent them"*): **FE-33** — revoking, archiving, deleting or expiring a token closes its streams, `4401`; **FE-34** —
  the capable model's fallback only for an unreachable or failing provider, **measured first in LiteLLM 1.98's router**;
  **FE-38** — `createdAt` on `Instance` and `InstanceSummary`. Tasks 3, 4, 5 and 6.
- **Carried from earlier plans, still binding:** D24's privileged four and the person-only class; step-up for a production
  deploy, an approval, member management and a production secret; the stored preview an approval binds; `SENSITIVE_FIELDS`
  as §7's list; every platform model call whose answer is read or shown is STRUCTURED OUTPUT (the D5 plan's Decision 22 —
  **this plan makes none**: the justifications and the assessment are derived, Decision 13); writes go to `main` only; the
  idempotency fingerprint covers the path parameters; a model key is answered once and never stored.

## FE-39 — relayed as Rich's decision, then CONFIRMED by him (2026-09-29)

- **FE-39 — ONLY FACULTY BUILD, FOR NOW, PLUS A PRESCRIBED LIST OF ADMINISTRATORS** (relayed 2026-09-29, after sitting 1's close,
  by the faculty front-end's session `manifest-app-9d` as *"carrying FE-39 at Rich's word"*; its `docs/api-findings.md` FE-39 and
  walk-through D7, `31a3aa2`). Rich signed in to `app.manifest.internal` as the laptop's `student` and could start an app. The words
  it quotes as his: *"This should be available to all members of faculty (using the associated CWL role). For everyone else (save
  for a prescribed list of admins), they should see a screen telling them that it isn't available for them at the moment."* — *"the
  platform, because this would then also work for agentic use"* — *"Faculty members should be able to add other faculty members for
  now. Perhaps in the future they should be able to add TAs."* **Relayed, not said to this session — then CONFIRMED by Rich in
  it, the same evening**, by answering its three open choices (Rich, 2026-09-29, answering Spec action 7's three open choices: *"1. YEs, PUID 2. YEs keep but no new. 3. literally just those with 'faculty' as their affiliation"*): **the administrators' list by PUID; a person who stops being
  faculty keeps what they have and starts nothing new; and exactly `faculty`, no other affiliation, and no setting for it.** Built as
  **Task 8a in sitting 5a**, after **Spec action 7**'s words are applied (*What Rich does* 9). It reverses §9's deliberate stance
  (the control plane does not ask for `eduPersonAffiliation` — *"authorization is Manifest's"*, `sso/platform.ts:44-52`).

## FE-40 — relayed at Rich's word (2026-09-29, during sitting 2's close), then CONFIRMED by Rich at sitting 3's open — Task 13 carries it

- **FE-40 — THE MOCK CANNOT PLAY A LAUNCH** (relayed by the faculty front-end's session `manifest-app-ce` as *"carried at Rich's word
  (2026-09-29: 'file it, and carry it now')"*; its `docs/api-findings.md` FE-40). Read in `packages/mock` at `20838d4`: `LAUNCH_READINESS`
  is `ready: false` (`fixtures.ts:623-629`) and the only ready checklist is a LAUNCHED app's; step-up is deliberately not enforced
  (`server.ts:45-47`), so no production deploy is ever `403 STEP_UP_REQUIRED` and there is no `/auth/step-up`; a production deploy
  answers staging's fixture (`:250-257`); `getApproval` always answers the approved fixture (`:426-435`) and `runRehearsal` always
  `passed: true` (`:407-412`). **Asked, each OPT-IN like `MANIFEST_MOCK_LAUNCHED`** (defaults and the console's tests unchanged):
  (1) a first launch that is ready, with a production deploy answering a production instance of its own; (2) a production deploy and a
  production secret answered `403 STEP_UP_REQUIRED` until the session steps up, and an `/auth/step-up` that steps up and redirects to
  `returnTo`; (3) `getApproval` `404` before a decision, and a rejection with a reason; (4) `runRehearsal` `passed: false` with the
  platform's evidence shape. **Task 13 (sitting 10) already changes the mock, so it is the natural home.** Nothing of the front-end's
  waits on it; its F5b's acceptance would use it. **Relayed first, then CONFIRMED by Rich to a platform session** (2026-09-29, sitting 3's
  first message, answering ORIENTATION §7e's question: *"Confirm"*) — **Task 13 carries it.**

## FE-41 and FE-42 — relayed at Rich's word after sitting 3's close, then CONFIRMED by him to sitting 3's session (2026-09-29)

- **FE-41 — CREATING A PROJECT WITH A STARTER FAILS ON REAL GITHUB** (relayed by the faculty front-end's session `manifest-app-a0`,
  *"AT RICH'S WORD"* — his *"Carry it now"*; its `docs/api-findings.md` FE-41). Found by its F5 sitting 1 on 7100 (control plane
  98101 on `84d485a`, real GitHub): `createProject` from a person's session with `{ blueprint: 'node-ts-mongo@1', starter: 'proof-app',
  audience }` answered `409 SOURCE_GIT_FAILED` twice, ~8 s after the press (04:20:36Z, slug `class-readings`; 04:22:07Z, `read-responses`) —
  nothing left behind (slug free, no project, no mirror) — while the same call WITHOUT a starter answered `201` in 8.8 s (`f5-reading`,
  04:22:53Z). **The control plane's log holds only its boot lines**: a create's `SOURCE_GIT_FAILED` writes no operator line, so the cause
  is unseen. **Ruled out by sitting 3's session, reading only**: the App's missing `workflows` permission — `proof-app` is five small
  files, no `.github/`, no symlink, nothing over 1 MB. It matters because the front-end's blueprint agent picks `proof-app` for almost
  every class app. **CONFIRMED by Rich to sitting 3's session** (*"Fold into sitting 4"*): **Task 6a, in sitting 4**.
- **FE-42 — THE PROJECT'S OWNER MAY RUN THE DRY RUN (D21's rehearsal)** (relayed the same way — his *"Both: row now, ask platform"*).
  Today `runRehearsal` is `launch:record`, an administrator's alone (`authz-contract.ts`: owner `403 FORBIDDEN`, collaborator `403`), and
  its published description does not say who may run it. The front-end shows the row as an administrator's now (its option (c)); it
  asks the platform for option (a): the rehearsal deploys the candidate the owner already put on staging, behind the gate, with
  production-shaped values — it proves a shape and decides nothing about UBC's records, unlike `launch:record`'s IAM and PIA rows. **The
  spec calls the item *"Manifest, automated"*** (§13's checklist) and does not say who triggers it. **CONFIRMED by Rich to sitting 3's
  session** (*"Yes, its own small sitting"*): **Task 6b, in sitting 4a** — placed by sitting 3's session right after sitting 4 and
  before the spec-action sittings (a routine ruling; move it if he says otherwise). **Its *"behind the gate"* was the premise that
  proved false** (the rehearsal skips the approval gate and serves production's PUBLIC listener): **Spec action 8** re-asked it, and
  Rich decided **(b) and (c) together** (2026-09-30) — **Task 6c, sitting 5b**.

---

## What Rich does, and when

**Ten things in this plan are Rich's hands, not an agent's.** Each is asked at the sitting that needs it, never assumed.

1. ~~**Review this plan, and approve or re-cut the sittings split**~~ **DONE — approved as written, thirteen sittings** (Rich, 2026-09-29, sitting 2's first message).
2. **Read and decide the spec actions** (the seventh, FE-39's, relayed — item 9; the eighth, drafted by sitting 4a, re-asked FE-42's premise — **DECIDED 2026-09-30, (b) and (c) together, and APPLIED the same day** (*"apply 8"*)) (*Spec actions*, below), each **before the sitting that builds it**: **1 and 2 before
   sitting 5; 3 before sitting 6; 4 before sitting 7; 5 before sitting 9; 6 before sitting 4, and only if Task 1's `[M5]` finds a
   guard can be built.** Each carries its exact wording, its options and a recommendation, and is applied to the spec only after he
   has read the words. A sitting that finds one undecided stops and asks.
3. **The network, and his yes, for every call to real GitHub** — given for Task 1 in this plan's first message. **Task 2's real
   check, Task 6a's reproduction of FE-41 and Task 15's optional real leg each ask again.** Every repository created on the real App is PRIVATE, in
   `Manifest-local-dev`, and named `lp-…` (Decision 3). **Never install the App on UBC's organisation.**
4. **Which driver the control plane runs at each sitting's close, and the faculty front-end's two driver-1 projects**
   (`my-weekly-thoughts`, `notes-and-answers`, made by its real-platform acceptance). On driver 2 they answer
   `409 SOURCE_PROVIDER_MISMATCH`. Their rows and bare repositories are untouched by a restart, and a restart back onto driver 1
   restores them. The front-end's session said nothing of its depends on them (*"If you hear nothing, treat them as
   disposable"*). **But the FIRST VITEST RUN OF SITTING 2 TRUNCATES EVERY TABLE, their rows with it** — as every sitting's first
   run has done to whatever was made since the last (ORIENTATION §4 trap 7). No task deletes them deliberately, and nothing keeps a
   row across the unit tier. **His word, before sitting 2: let them go, or have them dumped first.**
5. **Which of the real repositories to remove.** `scripts/github-real-repos.sh` (Task 2) lists every repository in the organisation
   against the projects that own them. Deleting one on github.com is his, or is done by the script's `--delete <name>` at his yes,
   named one at a time. **The same truncation takes `lp-real-a`'s ROW at sitting 2's first Vitest run, and its repository on
   GitHub stays** — the script then reads it `NONE`. That is expected, and it is exactly what the script is for.
6. ~~**FE-28 TO FE-32 — do any join this plan?**~~ **DECIDED 2026-09-30: none joins it** — FE-29, FE-31 and FE-32 CONFIRMED by Rich, and FE-28, FE-29, FE-30 and FE-31 placed in the *faculty-ready* plan, FE-32 in the plan after it. *As written:* They were relayed as his decisions and not yet confirmed by him (ORIENTATION §8
   *Open*): FE-28 (`__Host-manifest_session`), FE-31 (`listBlueprints` offers only blueprints meant for people) and FE-30 (a
   request id on every answer) *"before faculty use it for real"*; FE-29 (a refusal's facts as fields) *"when the error envelope
   is next touched"*; FE-32 (an agent cannot add a dependency). **This plan carries none of them**, because none was named in its
   first message. *Recommended:* FE-30 as a sitting of its own after this plan, and FE-28 with it, because both are small and are
   a real faculty's first day.
7. **`make refresh-vulndb`, with the network on — next due after 2026-10-06.** This plan's sittings will cross that date. Past
   it, §13's `scans` item refuses every production launch, and `make demo-launch` launches a project (Task 15).
8. **The contacts a real package names** — §9's *"technical and privacy contacts from the project owner and platform
   admins"*. The platform's half is a setting (`MANIFEST_LAUNCH_CONTACTS`, Decision 15). On the laptop it defaults to the
   first administrator. **At UBC the names are his.**
9. ~~**FE-39 — CONFIRMED 2026-09-29, and Spec action 7's options DECIDED**~~ **DONE — and Spec action 7 APPLIED at his word (Rich, 2026-09-29: *"apply 7"*)**. *As written:* **FE-39 — CONFIRMED 2026-09-29, and Spec action 7's options DECIDED** (Rich, 2026-09-29, answering Spec action 7's three open choices: *"1. YEs, PUID 2. YEs keep but no new. 3. literally just those with 'faculty' as their affiliation"*). **What is still his:** reading Spec action
   7's words, which now carry those answers, before they are applied to the spec — before sitting 5a.
10. **The clicked half of the acceptance — sitting 12.** A person signs in, **and Rich types every password** (ORIENTATION §4
   trap 6). He is the owner who drafts and sends, and then the administrator who sees the queue. Task 15 stages everything first
   and asks once.

---
## Read this first — what this plan knows that the roadmap and ORIENTATION §7e do not

**Read from the code at `862851c` on 2026-09-29, while this plan was written (three read-only surveys, and LiteLLM's own source read inside its running container). Task 1 re-measures each one marked *(T1: M<n>)* into `spikes/launch-baseline/`, where it becomes the record. A plan is a hypothesis.**

**The launch records**

1. **A LAUNCH RECORD IS AN ADMINISTRATOR'S ALONE, AND ONE PER PROJECT.** `iam_registrations.project_id` is UNIQUE
   (`db/schema.ts:659-715`; created in `0019_useful_taskmaster`, `requested_attributes` and `registered_at` added in
   `0022_useful_harrier`), commented *"ONE per project (§9: one registration per production app)"*. `privacy_assessments` is the
   same (`:718-733`). Both are written only by `recordIamRegistration` and `recordPrivacyAssessment` (`launch/records.ts:96-253`,
   `:261-321`). Both routes assert `launch:record` (`api/routes/launch.ts:141-275`), which only `PLATFORM_ADMIN` holds
   (`projects/authz.ts:384-389`), and which is `PERSON_ONLY` (`:139-143`) with `requireSession` in front. **An owner gets `403
   FORBIDDEN` on every launch write** (`authz.ts:592`). *(T1: M8.)*
2. **THE STATE MACHINES SAY WHERE A RECORD MAY GO, NEVER WHO MAY MOVE IT** (`launch/transitions.ts:39-54`). The IAM arrows are
   `draft→submitted`, `submitted→active|change_requested`, `active→change_requested|expired`,
   `change_requested→submitted|expired`, `expired→submitted`. The PIA arrows are `draft→submitted`, `submitted→approved|draft`,
   `approved→draft`. An illegal move is `409 LAUNCH_TRANSITION_INVALID`. A first write is read as coming from `draft`
   (`records.ts:128`, `:267`).
3. **NOTHING RECORDS WHEN A RECORD WAS SENT, OR BY WHOM.** Neither table has a `submitted_at` or `submitted_by`. `updated_at`
   is the only date that moves, and `recorded_by` holds the last writer. **`registered_at` is set when the registration reaches
   `active`** (`records.ts:182-185`), and it is the one date the checklist prints (*"since YYYY-MM-DD"*,
   `launch/readiness.ts:430`).
4. **NOTHING GENERATES A PACKAGE OR A DRAFT.** Searches for `saml-metadata-generator`, `EntityDescriptor`, `SPSSODescriptor`
   and `metadata.xml` find nothing in the control plane, the console or the mock. `privacy_assessments.generated_draft` exists and
   is always null — *"P8's output … the column exists so P8 adds no migration"* (`schema.ts:724-725`). No representation exposes
   it (`api/representations/launch.ts:152-180`). `launch/records.ts:13-18` says Manifest *"tracks and does not produce"* the
   records, and that *"P8 generates the submissions"*.
5. **EVERY VALUE A REGISTRATION PACKAGE CARRIES IS ALREADY DERIVED — FOR EVERY ENVIRONMENT.**
   - `deriveSpEntity` (`sso/entity.ts:72-127`) gives the entity id `${entityBase}/sp/${slug}/${environmentKind}` (`:134-140`),
     the ACS `https://${hostname}${auth.callback}` and the SLO `https://${hostname}${auth.logout}`.
   - `ensureSpKeypair` (`sso/keypair.ts:192`) gets or mints the environment's RSA-4096 keypair (`-newkey rsa:4096`, `:135-136`;
     two years, `VALIDITY_DAYS = 730`), stored as two secrets. `SpKeypair` carries `certificatePem`, `certData`, a SHA-256
     `fingerprint` and `expiresAt` (`:26-40`). **Its comment says its ONLY caller is `registerServiceProvider`** (`:186-190`),
     and that a partial pair is regenerated. That is safe only while the row and the app move together — **a second caller
     (Task 10's draft) must never regenerate a keypair whose certificate has been SENT.**
   - `renderSpMetadata` (`sso/metadata-store.ts:57-102`) renders SimpleSAMLphp's JSON `entity_data`, **not XML**.
   - Every environment of a CWL app is registered with the Manifest IdP at deploy (`releases/release.ts:538-551`), which
     publishes `sso.registered` (`sso/registration.ts:120-137`).
6. **`saml-metadata-generator` IS UBC'S OWN WEB TOOL, NOT A LIBRARY** (`~/Developer/saml-metadata-generator`, `baefa3b`, with
   uncommitted changes that are not this project's — **read-only; never change, install or run it in place**). It is an Express
   app on port 3121 (`src/server.ts`, 8.3 KB). It uses `node-forge` for certificates (`src/utils/certificate.ts`, 100 lines) and
   writes metadata XML by hand (`src/utils/metadata.ts`, 277 lines). **Its ACS endpoints are the Shibboleth daemon's**
   (`/Shibboleth.sso/SAML2/POST` and five more), not an app's `auth.callback`. It **hands the person the private key in a zip**,
   which Manifest never does — the platform holds it (§8). **§9 says *"reusing `saml-metadata-generator` as a library"***. What
   Manifest can reuse is its STRUCTURE — the elements, the organisation block, the algorithm extensions UBC IAM expects — not its
   code (Decision 12; Spec action 4). *(T1: M6.)*
7. **THE BUILD READS THE REGISTRATION BY PROJECT ALONE, AND FAILS ON ANY ROW.** `assertAttributesRegistered`
   (`releases/build.ts:317-345`) selects `iam_registrations` by `project_id` — *"`project_id` is UNIQUE on that table, so this
   select cannot mean anything but what the getter means"* (`:314-315`). **Whenever a row exists**, it checks the build's
   `auth.attributes` against `registered_attributes`. So **a draft an owner writes today would fail the next build that asks for
   an attribute the draft did not list**, in the sandbox as much as production. And the CHECK
   `iam_registrations_attributes_present` (`schema.ts:711-712`) requires `registered_attributes` to be non-empty on every row,
   drafts included. *(T1: M8.)*
8. **STAGING NEVER SIGNS INTO UBC — ON THE LAPTOP, OR ANYWHERE YET.** `spec/injection.ts:446-469` sets `SAML_ENVIRONMENT` to
   `PRODUCTION` for production and to `LOCAL` for everything else. `UBC_PRODUCTION` (`:184-188`) is the only UBC constant, and
   `authentication.stg.id.ubc.ca` appears only in comments. **§9 says staging is UBC's real staging world, and that *"how
   Manifest drafts and tracks the request is not yet designed (§19)"***. §21 says the laptop's staging keeps the fake sign-in.
   **So on the laptop the staging registration is TRACKED and gates nothing** — the honest divergence Task 9 states.
9. **THE CHECKLIST'S STATES CANNOT SAY "WAITING".** `LaunchReadinessItem.state` is `met | unmet | not_built`
   (`representations/launch.ts:35-40`). Its `id` is a published enum of eight (`launch/readiness.ts:29-38`). `docs/api/
   conventions.md`'s *Versions* rule is: *"an answer may gain fields, and a client ignores fields it does not know"*. It says
   nothing of an enum gaining a VALUE, and the faculty front-end writes a sentence for every `id` × `state` (its FE-9). **So
   *waiting since* is a new FIELD, never a new state or id** (Decision 5).
10. **NOBODY ASKS FOR AN APPROVAL, AND NOTHING LISTS WHAT WAITS.** An approval begins on the administrator's side
    (`createApprovalPreview`, `api/routes/releases.ts:762-850`). `getApproval` answers `404` until someone decides (`:914-982`). A
    refused production deploy writes **no row and no event** (`launch/gate.ts:64-98` is a pure read; `api/errors.ts:540-552`'s
    hint says *"…an administrator must approve it… Deploy again once they have"*). **There is no cross-project read of anything
    but the fleet** (`GET /v1/fleet`, `api/routes/fleet.ts:8-126`, session-only, administrator-only), and the fleet has no
    `name`, `state` or `archivedAt` (`api/representations/fleet.ts:6-64` — the review's M3). `pending_actions` is D24's
    question to a PERSON about their token, per project only (`api/routes/pending-actions.ts:150-216`).

**The source driver on real GitHub**

11. **THE CONTROL PLANE HAS NEVER RUN ON THE REAL APP** (ORIENTATION §8 *Decided*). Real GitHub was called once, by the
    conformance script (`packages/github-fake/src/conformance.ts:197-464`), and **that script is not the driver's code**:
    - it minted the installation-wide admin token for C12–C14 (`:412`, `:420-421`, `:448`);
    - the driver uses **per-repository** tokens for `PATCH` private, `PUT` protection and `DELETE`
      (`source/github/driver.ts:434-494`, `:598-641`, `:643-674`);
    - and nothing ever read a private repository's own data with a `contents: read` token (the driver's `readPrivate`).

    **So three token-and-endpoint pairs the driver depends on have never met GitHub.** *(T1: M1.)*
12. **THE BOOT READS THE KEY AND THE WEBHOOK SECRET, AND CALLS NOTHING.**
    - `loadAppKey` (`source/github/app-auth.ts:16-46`, called at `index.ts:326`) refuses a loose or non-RSA key.
    - `loadWebhookSecret` (`:55-75`, `api/server.ts:463-471`) needs a file. On the real App it stays the fake's, which `make up`
      writes (`infra/lib/ensure-github-fake.sh:45-47`) — *"nothing will deliver to a laptop"* (`.env.example:91`).
    - **A wrong App or installation id shows only at the first token mint**, as `409 SOURCE_GITHUB_REFUSED`
      (`source/github/tokens.ts:44-49`).
    - The boot line prints `"source":"github","github":"api.github.com","githubOrg":"Manifest-local-dev"` (`index.ts:513-521`)
      and never a key or a token.
13. **A CREATE THAT FAILS AFTER GITHUB MADE THE REPOSITORY CAN LEAVE IT BEHIND.** Inside `createRepository`
    (`source/github/driver.ts:684-781`), a failure in steps 4–10 deletes the repository and the mirror (`:770-779`). **But the
    route records the repository row and syncs again AFTER the driver returns** (`api/routes/projects.ts:281-289`), and a failure
    there deletes only the database's project (`:290-292`). The repository on GitHub and the local mirror stay, and the slug is
    then refused `SOURCE_REPOSITORY_EXISTS` for ever. *(T1: M1(g).)*
14. **A PROJECT MADE AGAINST THE FAKE IS ALSO PROVIDER `github`.** `repositoryOf` (`projects/source-repositories.ts:55-75`)
    compares only the provider name, so after a restart onto the real App a fake-made project raises no mismatch. Its mirror's
    remote becomes `https://github.com/Manifest-local-dev/<slug>.git`, its token mint answers `422` (*"does not exist or is not
    accessible"*), and **`destroyRepository` reads that `422` as GONE** (`driver.ts:643-674`) — so deleting it removes the local
    mirror and leaves the fake's repository. `.env.example:83`'s *"never reuse a project name across the fake and a real App"*
    is the only guard. *(At this plan's writing the database held no driver-2 project — the tests had truncated it.)*
15. **EVERY DRIVER-2 DEMO IS THE FAKE'S.**
    - `make demo-github` depends on `github-up` and on the fake's `/_fake/*` endpoints, its `manifest-apps` organisation and its
      team plan throughout (`packages/journey/src/github.ts:49`, `:372-396`, `:781-788`; `scripts/demo-github.sh:54-58`,
      `:188-199`).
    - `make demo-authoring` and `make demo-frontend` refuse at step 0 without the fake's health
      (`scripts/demo-authoring.sh:123-129`, `scripts/demo-frontend.sh:170-179`).
    - `demo-authoring`'s step 6 pushes as a person through the FAKE (`:155-168`).
    - `demo-frontend`'s step 9 asks the FAKE whether the scratch repository is there (`:325-357`).

    **Against real GitHub each would create a real repository and then fail part-way**, leaving it behind.
16. **WITHOUT A WEBHOOK, A PERSON'S PUSH IS SEEN AT THE NEXT SYNC — AND A BUILD OF `{}` DOES NOT SYNC.** Every read of a tree, a
    file, the history or a commit calls `resolveRef`, which syncs (`api/routes/source.ts:314`, `:374`, `:441`, `:491`). So does
    `validateSpec` — the console's *Re-validate*. But **an empty `StartBuildRequest` builds the newest VALIDATED commit, already
    in the mirror, and fetches nothing** (`api/routes/builds.ts:114-116`). `.env.example:79-80`'s *"or a build"* is half true.
    *(T1: M1(e).)*
17. **ON THE FREE ORGANISATION, `main` IS NOT PROTECTED — AND THE PROJECT SAYS SO.** GitHub answered `403` *"Upgrade to GitHub
    Pro or make this repository public to enable this feature."* (`packages/github-fake/conformance/github.com-2026-09-25.json`,
    C13). The driver records `mainProtected: false` with GitHub's words (`driver.ts:598-641`), the route publishes
    `repository.protection_unavailable` (`api/routes/projects.ts:372-395`), and the console shows *"main NOT protected"*
    (`packages/console/src/screens/project.tsx:225-250`).

**The additions**

18. **A LIVE KEY'S MODELS ARE NEVER CHANGED — A SESSION IS ENDED.** `withdrawWhatItNoLongerAllows`
    (`api/spec-validation.ts:177-207`) runs after a valid manifest is recorded. The same sweep runs after a production deploy
    (`api/routes/releases.ts:1108-1113`) and after a rehearsal (`api/routes/launch.ts:370`), and at boot `endSessionsHoldingMore`
    runs over every project (`index.ts:485-502`).
    - `withdrawn = row.models.filter(m => served.has(m) && !allowed.has(m))`, and **any** withdrawn model ends the whole session
      `models_withdrawn` (`ai/sessions.ts:543-603`).
    - **`/key/update` is called nowhere** (every admin endpoint: `ai/keys.ts:66-266`, `ai/agent-keys.ts:51-235`,
      `ai/capable.ts:79-387`).
    - A key is found by its alias `mf-agent-<sessionId>` (`/key/delete {key_aliases}`, `agent-keys.ts:185-192`).
    - `agent_sessions.models` is `jsonb NOT NULL` (`schema.ts:566-604`).
    - **The faculty front-end copes today by starting a new session itself** (its `5a1aa1f`), and asks the person only when the
      model it was using is gone. *(T1: M3.)*
19. **A MEMBER'S REMOVAL TOUCHES NEITHER THEIR TOKENS NOR THEIR SESSIONS, AND A TOKEN NEVER RE-READS MEMBERSHIP.**
    - `removeMember` (`api/routes/project-reads.ts:491-556`; the repository's `projects/repository.ts:434-470`) deletes the
      membership row and publishes `member.removed`, and does nothing else.
    - `tokenActor` reads the token row and the project's state only (`tokens/actor.ts:40-50`); `projects/authz.ts:495-499`
      says so in words (*"A token therefore outlives its minter's membership"*).
    - `delegated_tokens.user_id` IS the minter (`schema.ts:428-459`).
    - `revokeTokensOf(db, projectId)` revokes a whole project and returns the ids (`tokens/repository.ts:79-92`), but **nothing
      revokes by person and project**.
    - `endSessionsOf` targets `{projectId}` or `{tokenId}` only (`ai/sessions.ts:461-514`). A session a person started in their
      own browser has `requested_by_token` null, so no token revocation ends it.
    - And a removed person cannot end their own session: `endAgentSession` answers them `404` (`api/routes/agents.ts:313-315`).
20. **AN OPEN STREAM IS CHECKED ONCE, AT THE UPGRADE.** The event route checks the credential in `preValidation` and again in
    `wsHandler` (`api/routes/events.ts:67-121`). `streamProject` (`:131-203`) never re-reads it.
    - The only ways a stream stops are the socket's close, backpressure (`1013`) and a replay failure (`1011`).
    - The bus is a `Map<projectId, Set<listener>>` of anonymous closures (`observability/bus.ts:112-160`). **Nothing maps a
      socket to its token or its person.**
    - `TokenActor` carries no `expiresAt` (`authz.ts:332-358`); `SessionActor` does (`:328`).
    - **No `4401` exists** in code, contract or guide. The close codes are `1001`, `1006`, `1011`, `1013`, `4403` and `4404`
      (`api/contract/websocket.ts:88-98`; `docs/api/events.md:91-99`).
    - The front-end measured a revoked token's socket open for a whole minute, receiving `agent_session.*` (its FE-33). *(T1: M4.)*
21. **LITELLM 1.98.0'S `general` FALLBACK ANSWERS EVERY ERROR THAT IS NOT A CONTEXT-WINDOW OR A CONTENT-POLICY ONE — AND NO
    SETTING NARROWS IT.** Read inside `manifest-litellm` at `…/site-packages/litellm/router.py:6279-6531`.
    `async_function_with_fallbacks_common_utils` raises the original error only when `disable_fallbacks` is set (`:6301`). It
    special-cases `ContextWindowExceededError` and `ContentPolicyViolationError` (`:6406-6470`) and sends everything else,
    `BadRequestError` included, to `run_async_fallback` (`:6471-6505`).
    - The `Router`'s constructor takes `fallbacks`, `context_window_fallbacks`, `content_policy_fallbacks`, `retry_policy`,
      `allowed_fails_policy` and `max_fallbacks`. **None filters a `general` fallback by the error's class.**
    - `disable_fallbacks` can be set on a key's metadata (`proxy/litellm_pre_call_utils.py:1338-1339`), but it disables EVERY
      fallback, the unreachable one Spec action 8 exists for included.
    - `CustomLogger.async_pre_call_deployment_hook(kwargs, call_type)` runs before each deployment's call
      (`integrations/custom_logger.py:251`) — **whether the fallback deployment's call can see the original error is the
      measurement that decides Task 6** *(T1: M5)*.
    - The platform sets `{ model: 'default-chat-large', fallback_models: [setting], fallback_type: 'general' }`
      (`ai/capable.ts:387-391`) and never a context-window or content-policy fallback (`:340`).
22. **AN INSTANCE HAS NO TIME OF ITS OWN.** `instances` has `id, environment_id, release_id, driver, kind, state, handle,
    last_seen_at` and no `created_at` (`schema.ts:294-311`). `Instance` publishes `id, environmentId, releaseId, kind, state,
    lastSeenAt` (`api/representations/instances.ts:5-43`), and `InstanceSummary` adds `serving`. `listInstances` orders by
    `last_seen_at desc nulls last, id` (`projects/repository.ts:333`) — *"seen most recently first"*, a published order this plan
    does not change. **The only production insert is `releases/release.ts:420-429`.** `Instance` is also `deploy`'s answer
    (`api/routes/releases.ts:984`, `:997`, `:1114`).
23. **F26 IS A RETIRE PASS NOBODY WAITS FOR.**
    - `createRetirer` (`releases/retire.ts:308-368`) starts each pass as a fire-and-forget promise held in an `inFlight` set, and
      `idle()` waits for it to empty.
    - `testDeps()` builds a real retirer per call (`api/testing.ts:812`). `withProjectServer`'s `finally` drains builds and
      **not the retirer** (`:1090-1093`).
    - `api/delivery.test.ts` builds its own retirer (`:44-59`), closes about thirty servers, and drains it **zero** times.
    - `resetDatabase` (`db/testing.ts:151-153`) truncates twenty-two tables on the admin pool. **Postgres chose the `TRUNCATE` as
      the victim**, so the only tell is `deadlock detected` at `resetDatabase` (TRAPS.md's P6b sitting 4, F7 entry).
    - `api/subsequent-releases.test.ts`'s `closed(ctx)` (`:70-82`) is P6b's local fix, and it works.
    - `buildServer` has no `onClose` hook, and the retirer is a dependency Fastify does not own.

    *(T1: M7.)*

**The numbers**

24. **THE CONTRACT IS `1.4.0`, WITH 66 OPERATIONS, 90 SCHEMAS, 128 ERROR CODES AND 46 EVENT TYPES.** An additive change bumps the
    minor once per plan: **this plan takes `1.5.0`**, at the first task whose change reaches `openapi.json` — **predicted: Task 4**
    (`Instance.createdAt`).
25. **MIGRATIONS ARE `0000`–`0039` (40), the newest `0039_harsh_jack_power`** (`models_withdrawn`). This plan's start at
    `0040`. **An event type is a migration**: `audit.events`'s `events_type_known` CHECK lists every type literally
    (`schema.ts:1026-1029`).
26. **THE BASELINE** (ORIENTATION §2, 2026-09-29, the front-end enablement plan's sitting 12): `pnpm test` **2826 passed, 0
    skipped, in 180 files**; `pnpm test:docker` **248 in 41**; `make doctor` **20/0/0**; `make verify` **61/0/0**; contract
    `1.4.0`. **This plan's starting line, kept as written; the CURRENT baseline is always ORIENTATION §2's box.** *(T1: M10.)*

---

## Decisions this plan makes, and why

**Each is a routine call, made and written down with the options rejected and what it would cost to change course** (Rich's rule). The ones that change spec text are also spec actions, and wait for him.

### Real GitHub (Tasks 1–2)

1. **TASK 1 RUNS THE CONTROL PLANE ON THE REAL APP THROUGH THE API, NOT THROUGH A DEMO.** Every driver-2 demo is the fake's
   (*Read this first* 15), and each would leave a real repository behind when it failed part-way. Task 1 drives the platform
   with `scripts/lib/api.sh` and `curl`, one step at a time, and reads github.com's answer after each. *Rejected:* adapting
   `make demo-authoring` first (it pushes as a person through the fake); running `make demo-github` (fake throughout). *Cost to
   change:* Task 2 could make one demo real-capable later; nothing in Task 1 depends on it.
2. **A PERSON'S PUSH ON GITHUB.COM IS RICH'S HANDS.** No agent holds a GitHub credential of a person, and the App's own token is
   not a person. So *"a push the platform did not make is seen at the next read"* is measured only if Rich edits one file in the
   repository's web editor while Task 1 waits. It is optional, and it is asked once.
3. **EVERY PROJECT MADE ON THE REAL APP IS NAMED `lp-<purpose>`** — `lp-real-a`, `lp-real-scratch`. No slug is ever used on both
   the fake and the real App (*Read this first* 14), and the prefix makes `github-real-repos.sh`'s list legible.
4. **A PROJECT RECORDS WHICH GITHUB IT LIVES ON** (Task 2): `source_repositories.api_host`, written at creation from
   `new URL(config.github.apiUrl).host`. `repositoryOf` refuses `409 SOURCE_PROVIDER_MISMATCH` when it differs from the running
   driver's, **naming both hosts**. Driver-1 rows keep null. *Rejected:* a separate provider name for the fake (`github-fake`) —
   it would change every driver-2 test's rows, and the host is the fact that actually differs. *Cost:* one column and one
   comparison.
5. **A CREATE THAT FAILS AFTER THE DRIVER RETURNED DESTROYS WHAT THE DRIVER MADE** (Task 2). The route's cleanup at
   `api/routes/projects.ts:290-292` calls `destroyRepository` before it deletes the row, and a failure of that is an operator line
   naming the repository, never swallowed.

### The three clocks (Tasks 9–11)

6. **THE STAGING REGISTRATION IS A SECOND KIND OF `IamRegistration`, NOT A NEW OBJECT** (Spec action 3). One table keyed
   `(project_id, environment_kind)`, `environment_kind` in `staging | production`, the existing rows backfilled `production`.
   The same state machine, the same record route (gaining an optional `environment`, default `production`), and the same
   representation, gaining `environment`. **§19 asks *"beside `IamRegistration` or as a second kind of it"***. *Why a kind:* UBC
   IAM reviews the same shape (entity id, ACS, SLO, attributes, certificate) with the same wait, and D19's hook is *"objects with
   submission state"* — two tables would be two copies of every rule this plan adds. *Rejected:* a `StagingRegistration` entity.
   *Cost to change:* a table split later is a migration and a representation; the API shape would not move.
7. **THE BUILD'S ATTRIBUTE CHECK READS ONLY A REGISTRATION UBC HAS REGISTERED** (Task 9): the PRODUCTION row, and only when its
   `registered_at` is set. A draft or a submission gates nothing. The CHECK becomes `registered_at IS NULL OR
   jsonb_array_length(registered_attributes) > 0`, and `registered_attributes` defaults to `[]`. **This is what makes an owner's
   draft safe to write in week one** (*Read this first* 7). The staging row gates nothing on the laptop (§21), and at UBC it
   gates signing in at staging — a check on the IdP's side, not the build's.
8. **"I'VE SENT IT" IS AN OWNER'S STATEMENT, PERSON-ONLY — `launch:submit`** (Spec action 3). Owner, collaborator and
   administrator hold it (§13: a collaborator is *"the same as owner except member management, archiving and deletion"*). It is
   in `PERSON_ONLY` beside `launch:record`, because it is a record that a named person did something. A token that could claim
   a person sent a document to UBC is D14 inverted. It moves `draft → submitted` for the privacy assessment, and `draft |
   change_requested | expired → submitted` for a registration — **never anything UBC decides**, which stays `launch:record`.
   It needs no step-up: it grants nothing. *Rejected:* letting an owner record UBC's answer — P6a's Decision 4, and a faculty
   member cannot assert that their own PIA was approved.
9. **A SUBMISSION NEEDS A DRAFT, AND FREEZES IT.** `submitIamRegistration` refuses `409 LAUNCH_DRAFT_REQUIRED` when the row has
   no package: the package IS what the person sends. The request carries an optional `sentAt` (a date — a person may say
   *"last Tuesday"*; never in the future, never before the draft) and an optional `reference` (UBC's ticket number, if they have
   one yet). From `submitted` onwards the package is never regenerated: `draftIamRegistration` refuses `409
   LAUNCH_RECORD_SUBMITTED` while the record is `submitted` or `active`, and drafts again only from `change_requested` or
   `expired`, where a new request is the point.
10. **"WAITING SINCE" IS `LaunchReadinessItem.since`, A NEW FIELD** (*Read this first* 9): the time the item's current state
    began, when Manifest knows it — `submitted_at` while a record waits on UBC, the request's time while `admin-approval` waits
    on an administrator (Task 12), `registered_at` or `approved_at` once met — and `null` otherwise. **No new state, and no new
    item id.** The staging registration is **not** a checklist item (it gates signing in at staging, not a launch — §13); it is
    `LaunchRecords.stagingRegistration`, beside the other two.
11. **THE DRAFT IS STORED ON THE ROW, NOT COMPUTED ON READ.** A package carries a certificate, and the first draft mints the
    environment's keypair (D20: *"generated once at registration"*). A read that mints a key is a side effect. So
    `draftIamRegistration` is a `POST` that stores `generated_package` (jsonb) and answers it; `getLaunchRecords` returns it.
    `privacy_assessments.generated_draft` already exists for exactly this (*Read this first* 4). **Drafting needs its own
    capability, `launch:draft`** — owner, collaborator and administrator; MINTABLE, neither privileged nor person-only. A draft
    sends nothing and decides nothing, and an agent may prepare one for its person to read. *Rejected:* drafting under
    `launch:submit`, which would make preparing a document as person-only as saying it was sent.
12. **THE PACKAGE'S XML FOLLOWS `saml-metadata-generator`'S STRUCTURE, WRITTEN IN `sso/`, NOT IMPORTED** (Spec action 4). The
    tool is a web app and not a library. It is not a dependency, its ACS paths are the Shibboleth daemon's, and it hands out the
    private key (*Read this first* 6). `sso/registration-xml.ts` renders an `EntityDescriptor` with the same elements, in the same
    order, with the same organisation block and algorithm extensions as Task 1 records from the tool's own output (`[M6]`). The
    ACS and SLO are Manifest's derived URLs (D15), and the certificate is the environment's own. **The private key never leaves
    the platform.** *Rejected:* vendoring the tool's `metadata.ts` (it would carry Shibboleth paths and `Math.random` ids).
    *Cost to change:* if UBC IAM asks for a different shape, one renderer changes.
13. **A JUSTIFICATION IS DERIVED, NEVER WRITTEN BY A MODEL.** Each attribute's justification is its purpose from one table
    (`ATTRIBUTE_PURPOSES`, in `launch/package.ts`) plus **the lines of the committed tree that read it**, found by
    `source/`'s read path at the spec's commit, bounded (Decision 14). An attribute the code never reads says so, as a warning to
    remove it *before* sending — which is exactly the back-and-forth D19 exists to spare the reviewer. *Rejected:* a model's
    sentence (structured output, a person's budget, and prose that can be wrong in a document sent to UBC). *Named in *What this
    plan does not build**: a model's plain-language summary beside the derived facts.
14. **"WHERE THE APP READS IT" IS A BOUNDED TEXT SEARCH FOR THE NAMES THE BLUEPRINT EXPOSES.** The blueprint's attribute bridge
    decides how app code sees an attribute (`[M9]` records its field names). The search reads each text file of the tree at the
    spec's commit through the read path, at most **200 files and 2 MiB**, and stops with `usedAtTruncated: true`. It is a hint
    for a reviewer, and it says so in the package — never a proof that an attribute is unused.
15. **THE PLATFORM'S CONTACTS ARE A SETTING** — `MANIFEST_LAUNCH_CONTACTS`, a comma-separated list of `Name <email>`. It defaults
    to the first administrator's name and email (read from `users` where `role = 'admin'`, oldest first). The owner is the
    technical contact, and the collaborators are listed. At UBC the names are Rich's (*What Rich does* 8).
16. **THE PRIVACY-ASSESSMENT DRAFT IS §9'S SIX ROWS, EACH A LIST OF FACTS WITH THEIR SOURCE, AND ITS GAPS NAMED.** *"What
    personal information is collected — `auth.attributes` plus the app's schema"*: Manifest knows the first and not the second,
    so the draft lists the attributes and names *"what the app keeps in its own database"* as a gap for the owner. Every fact
    carries where it came from (`manifest.yaml:auth.attributes`, the model catalogue, the project's members). The draft is JSON
    for a client, plus one plain-text rendering for the owner to paste into the Privacy Office's form — **no HTML, no PDF**.

### The sign-off request and the queue (Task 12)

17. **A SIGN-OFF REQUEST IS ITS OWN ROW, `approval_requests`, AGAINST THE LAUNCH CANDIDATE** (Spec action 5). `requestApproval`
    (`POST /v1/releases/{releaseId}/approval-request`) needs the new `approval:request`, which owner, collaborator and
    administrator hold. **It is mintable**, and neither privileged nor person-only: a request grants nothing and decides
    nothing, and a front-end's server acting for the owner may ask. The request is refused:
    - `409 RELEASE_NOT_STAGED` unless the release is the candidate — the release serving staging, healthy;
    - `409 APPROVAL_NOT_NEEDED` when the checklist's `admin-approval` item is already `met`.

    **One request per release** — `approval_requests.release_id` is UNIQUE. A rejection is final for its release (P6b), so a
    new ask after one is always a new release. A second ask answers the existing request, `200`, never a duplicate. A request
    CLOSES itself, derived at read and never stored: when an approval or a rejection is recorded for the release, or when
    the release is no longer the candidate. It carries an optional `note` (≤ 500 characters), shown to administrators in the
    queue and **never put in an event**.
18. **THE QUEUE IS ONE ADMIN-SCOPED READ, DERIVED, OLDEST FIRST** — `listQueue` (`GET /v1/queue`), session-only, administrator
    only, as `listFleet` is. Its items:
    - an open sign-off request (*Release awaiting approval*, `Approval (D9)`);
    - a `submitted` registration, staging or production (*IAM registration to submit or amend* — here, to record UBC's answer);
    - a `change_requested` registration;
    - a `submitted` privacy assessment.

    Each item carries its `kind`, the project (`id`, `slug`, `name`, `state`), the subject's id, who asked, `since`, and one
    sentence. The read's `oldestSince` is the console's headline (§26: *"the age of the oldest item"*). **Pending actions are
    NOT in it** — §26 lists them *"in the requesting user's queue"*, and they are per project already. *Domains* and *audience
    upgrades* do not exist yet.
19. **`approval.requested` IS AN EVENT; THE QUEUE IS NOT A STREAM.** The request publishes on the project's stream, naming the
    person and the release. An administrator's console reads `listQueue`. A cross-project stream is §26's admin console's
    question, not this plan's (D23.2 is per project).

### The additions (Tasks 3–8)

20. **F26 IS FIXED IN THE TEST HARNESS, NOT IN PRODUCTION'S SHUTDOWN.** `db/testing.ts` gains `registerBackgroundWork(idle)`
    and `resetDatabase` awaits every registered `idle()` before its `TRUNCATE`. `testDeps` registers its retirer's and its build
    runner's. `api/delivery.test.ts`'s own `depsWithDriver` registers too. *Rejected:* `buildServer` awaiting retire passes on
    close — that changes the control plane's shutdown, where a drain is §11's and its bound is production's.
21. **`instances.created_at` IS `NOT NULL DEFAULT now()`, AND OLD ROWS ARE BACKFILLED FROM THEIR RELEASE'S `created_at`**, the
    earliest moment the instance could have been made, and said so in the migration. `listInstances`'s published order does
    not change (FE-38 option (a)).
22. **THE STREAM REGISTRY LIVES IN `observability/`, BESIDE THE BUS**, so `releases/lifecycle.ts` and `api/` both reach it
    through `observability/index.ts`. An entry is `{ projectId, tokenId | null, userId, expiresAt }`. The codes:
    - `4401` — the credential was revoked or expired. It is new, and it is FE-33's.
    - `4404` — not found, or not yours. A deleted project, and a removed member's session.
    - A token's expiry, and a session's, is a timer armed at the upgrade (re-armed past `2^31−1` ms).
    - **An archived project's person streams stay open**: `project:read` is allowed on an archived project. Its tokens were
      revoked by the archive, so theirs close `4401`.
23. **THE TRIM IS `/key/update` ON THE SESSION'S ALIAS**, if `[M3]` measures that LiteLLM 1.98.0 narrows a live key in place and
    refuses a withdrawn model on the next call. Then `agent_sessions.models` is updated, and `agent_session.narrowed` publishes
    `{ sessionId, withdrawn, models }`. The session is ended `models_withdrawn` only when `models` would be empty. **If `[M3]`
    measures otherwise, the trim cannot be built**: a replacement key would never reach the agent, because a key is answered
    once and never stored. **Then Task 7 stops and raises it with Rich**, before Spec action 1 is applied.
24. **A REMOVED MEMBER'S TOKENS ARE REVOKED IN THE SAME TRANSACTION AS THE MEMBERSHIP ROW**, by a new
    `revokeTokensOfMember(tx, projectId, userId)` returning the ids. Their sessions — started by those tokens, or by the person
    in a browser (`requested_by_token` null) — are then ended `member_removed`, a new `end_reason`. Their streams close. The
    removal answers once all of it is done. A gateway outage while ending sessions is the `503` `revokeToken` already answers,
    and the membership row stays removed — the same order `revokeToken` keeps.
25. **FE-34'S GUARD IS BUILT ONLY IF IT CAN BE PROVED** (Task 6). If `[M5]` measures that a hook on the fallback deployment's
    call can see the original error's status, `infra/litellm/manifest_guard.py` refuses the fallback for a `4xx` other than `408`
    and `429`, re-raising the original. It is loaded through `infra/litellm/config.yaml`'s `litellm_settings.callbacks`, and a
    Docker case drives a stub provider through every status. **If it cannot**, the guides say what an answer's
    `x-litellm-attempted-fallbacks` means, and the finding goes to Rich with the options (a newer LiteLLM, the setting off,
    accepting it). *Rejected:* `disable_fallbacks` on the key's metadata (it disables the unreachable case too).

### Who may build — FE-39 (Task 8a; CONFIRMED by Rich 2026-09-29, with his three answers — Decisions 28–30 are his)

26. **ONE PREDICATE, `mayBuild(user)`, DECIDED BY THE PLATFORM AND ANSWERED ON `getMe`** (`Me.mayBuild: boolean`) — true for an
    administrator, and for a person whose last sign-in carried `eduPersonAffiliation` value `faculty` — **exactly that value, and no
    setting for it** (Decision 30). **No client re-derives it.** FE-39 names the three operations that refuse anyone else:
    `createProject`, `startIntakeSession` and `addMember`'s TARGET. `createProject` and `startIntakeSession` answer
    `403 BUILDING_NOT_OPEN`; `addMember` answers `409 MEMBER_MAY_NOT_BUILD` naming the target. Each is session-only already, so no
    token path exists to guard. *TAs later* are a change to this one function.
27. **THE AFFILIATION IS UBC'S CURRENT FACT, REFRESHED AT EVERY SIGN-IN — AND AN ASSERTION WITHOUT IT MEANS "NOT FACULTY".**
    `users.affiliations jsonb` and `affiliations_seen_at` are written by `upsertUserFromAssertion` every time. Unlike `cwl_login` —
    never overwritten with null — an absent attribute writes `[]`, because §9's release is enforced against the list, and an
    attribute UBC did not send is UBC saying nothing.
28. **THE ADMINISTRATORS' LIST IS A SETTING OF PUIDS — `MANIFEST_ADMIN_PUIDS` — NOT CWL LOGINS** (Rich, 2026-09-29: *"YEs,
    PUID"*). A CWL login can be reassigned by UBC — ORIENTATION §3: the login is *"held by whoever signed in with it last"* —
    so a list of logins can hand the platform's highest role to a stranger. A PUID is never reassigned, and it is the one key §9
    identifies a person by. **When the setting is set, it is authoritative**: at every sign-in the person's role is reconciled to
    it, each change a `RoleChange` with actor `setting:MANIFEST_ADMIN_PUIDS` (§20's audit). **When it is empty, today's
    `scripts/admin-grant.sh` stays the procedure.** *Rejected:* both at once, where a person granted by the script and absent
    from the list would flip at every sign-in.
29. **A PERSON WHO STOPS BEING FACULTY CANNOT START ANYTHING NEW, AND KEEPS WHAT THEY HAVE** (Rich, 2026-09-29: *"YEs keep but
    no new."*). `mayBuild` becomes false at their next sign-in. Their
    memberships and the tokens they minted are unchanged, as FE-39's *"Unchanged"* says for tokens, so a course app mid-term keeps
    its owner. An administrator archives it if it must stop. *Rejected by Rich:* losing their projects' access too (the front-end's
    recommendation).
30. **EXACTLY `faculty` — NO OTHER AFFILIATION, AND NO SETTING** (Rich, 2026-09-29: *"literally just those with 'faculty' as their
    affiliation"*). The predicate compares the value exactly. **The consequence, stated so nobody meets it as a surprise**: a
    sessional lecturer, or an instructor UBC marks `staff`, may not build until an administrator's PUID list names them or the rule
    changes. *Rejected:* a setting of affiliations (the draft's `MANIFEST_BUILDER_AFFILIATIONS`), which Rich's *"literally"* rules
    out. Locally the IdP already releases
    `instructor: [faculty]`, `student: [student]` and `operator: [staff]` (`infra/idp/config/authsources.php`).
31. **A SECOND FACULTY TEST USER, `colleague`**, is added to the laptop IdP, because a demo that adds a colleague must now add a
    faculty member. `demo-frontend`'s step 7 adds `student` by login name today, and becomes: `student` refused
    `MEMBER_MAY_NOT_BUILD`, then `colleague` added.

---
## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from the spec, or from a dated measurement.

- **Four gates, all clean before every commit**, from the **repository root**: `pnpm test`, `pnpm lint`, `pnpm typecheck` and
  `pnpm format:check`. **Run `pnpm test` twice** on the final tree of a sitting — a suite that is not repeatable has a state leak.
  Never with `--filter`. `pnpm test` is ~12–14 minutes a run (782 s alone, 2026-09-29).
- **`pnpm test:docker`** (~22 min, needs `make up` and the chat model warm, **fails rather than skips**) is owed by any change to
  `runtime/`, `routing/`, `services/`, `build/`, `releases/`, `identity/`, `sso/`, `secrets/`, `projects/`, `blueprints/`, `spec/`,
  `ai/`, `observability/`, `launch/`, `source/`, `infra/`, or any `*.docker.test.ts`. **Run it in the background** (it outlasts the
  10-minute tool limit), **never beside a Vitest run**, then **restart the control plane**, run the three cleanup scripts, and
  `make verify` (a `docker restart manifest-caddy` has twice fixed a host that could not reach the edge after it). Warm the model
  first: `curl -s http://127.0.0.1:11434/api/generate -d '{"model":"qwen3.5:4b","prompt":"ok","stream":false,"think":false,"keep_alive":"30m","options":{"num_predict":1}}'`.
  **A shell that sourced `.env` boots the tier's control planes on DRIVER 2** while `.env` carries `MANIFEST_SOURCE_DRIVER=github`
  (ORIENTATION §7e) — run the tier from a shell where `MANIFEST_SOURCE_DRIVER` and every `MANIFEST_GITHUB_*` is **unset**, and
  read one tier control plane's boot line to prove it.
- **One file**, from the repository root: `pnpm exec vitest run --project unit src/<path>`;
  `pnpm exec vitest run --project packages packages/<pkg>/src/<path>`; `MANIFEST_TEST_DOCKER=1 pnpm exec vitest run --project docker src/<path>`.
  **Never two Vitest processes at once.** `pnpm test -- <filter>` does not filter.
- **`pnpm test` TRUNCATES the control plane's tables** — so does one file, and so does `pnpm contract:write`. **Run anything that
  needs a demo's rows BEFORE any Vitest run.**
- **Vitest strips types.** `pnpm typecheck` is the only gate that sees a type; `exactOptionalPropertyTypes` is on (an optional
  field is a conditional spread).
- **A route change is four commands, in order**: the definition, `pnpm contract:write`, `pnpm contract:generate`, `pnpm docs:write`.
  `openapi.json`, `schema.d.ts`, `docs/api/reference/` and `llms.txt` are generated; never edit them. **Every new operation needs**:
  - `examples` captured from its own tests;
  - a row in `api/authz-contract.ts`;
  - a step in `packages/journey/src/coverage.ts`'s `JOURNEY`, or an `OUTSIDE_THE_JOURNEY` line with its reason;
  - a declared `capability`, so `refusedWhenArchived` decides its `PROJECT_ARCHIVED` declaration (the front-end enablement plan's
    F19);
  - **either** a caller in `packages/console/src/api.ts` **or** a `DELIBERATELY_UNCALLED` line naming Task 13 as its remover.
- **A new capability** is `CAPABILITIES` (`projects/authz.ts`), its role grants, `PERSON_ONLY` when it is one (and
  `person-only.test.ts` holds the set), and **the console's `everyCapability([...])` in `packages/console/src/screens/tokens.tsx`**
  — a `tsc` error until it names it.
- **A migration is `pnpm --filter @manifest/control-plane db:generate`, then READ what it wrote**, then APPLY it to
  `manifest_control` before the unit tier runs (RUNBOOK's export block, then `db:migrate`). Drizzle rewrites `audit.events`'s
  `events_type_known` CHECK itself when an event type is added — never append it by hand. **Migration numbers here are
  predictions** (`0040` onwards). A backfill or a partial index is `db:generate --custom`, written by hand and read back with `\d`.
- **An EVENT TYPE is four edits and published surface**:
  - `EVENT_TYPES` (`observability/events.ts`);
  - its payload schema (`observability/event-schemas.ts`), with a `.describe()` on the entry and every field;
  - the `CHECK` literal in `db/schema.ts`, and so a migration;
  - `EXAMPLE_DETAILS` (`observability/examples.ts`).

  It must be REACHED by `api/stream-contract.test.ts`'s lifecycle or listed in its `PUBLISHED_ELSEWHERE`. **A payload never
  carries a secret's value, a model key, a token, a file's content, a person's free text (a request's `note`), or a laptop path.** A
  sentence names a person by name, never by PUID.
- **PUBLISHED TEXT CARRIES NO SECTION, DECISION OR PLAN NUMBERS, AND NO MAINTAINER NOTES** (Rich, 2026-09-30, relayed by
  `manifest-00` during sitting 5b: *"One of the things that we don't need to see in the API docs is things like section or plan
  numbers. They're irrelevant to the person reading the docs."*) — no `§n`, `Dnn`, `Cn`, plan, sitting or FE names in a route or field
  description, an error's meaning or remedy (`api/error-codes.ts`), an event description, a guide in `docs/api/` or the mock's text.
  The gates hold only plan, sitting and FE names, and operation descriptions (`api/contract/docs.test.ts`) — hold the rest BY HAND
  until sitting 10's pass, where Rich placed the cleanup of the existing references and the gate's widening; code comments get a plan
  of their own later.
- **EVERY REFUSAL ASSERTS ITS CODE, NEVER ITS STATUS ALONE** — `refusal()` from `api/testing.ts`. This plan adds:
  - **`409 LAUNCH_DRAFT_REQUIRED`**, **`409 LAUNCH_RECORD_SUBMITTED`** and **`400 LAUNCH_SENT_AT_INVALID`** (family
    `LaunchRecordError`, beside `LAUNCH_RECORD_INVALID` and `LAUNCH_TRANSITION_INVALID`; Tasks 9–10);
  - **`409 LAUNCH_NOT_CWL`** — a draft for an app that registers nothing (Task 10);
  - **`409 APPROVAL_NOT_NEEDED`** (Task 12; it reuses `RELEASE_NOT_STAGED`);
  - **`403 BUILDING_NOT_OPEN`** and **`409 MEMBER_MAY_NOT_BUILD`** (Task 8a — Rich's, confirmed 2026-09-29).

  **Every new code is thrown as a literal and needs its meaning and remedy** in `api/error-codes.ts`. A new family is four edits:
  its class, its registry entries, `WIRE_CLASSES` in `api/error-codes.test.ts`, and its branch in `api/errors.ts`.
- **A REFUSAL TEST NEEDS A POSITIVE CONTROL IN THE SAME FILE, AND SO DOES A NEGATIVE CLAIM** — *"a draft does not fail the
  build"* is true of a build that checks nothing.
- **Never accept a check you have not watched fail.** Every task ends by breaking what it built, **after committing the task**,
  and naming the test that goes red with its assertion quoted. **Predict what turns red before you run it.** A control that stays
  green is a question to chase (ORIENTATION §9; the memory *a green control is a question*).
- **Every task names its CALLER.** A module with no call site is not built.
- **A CERTIFICATE IS PUBLIC; A PRIVATE KEY NEVER LEAVES THE SECRETS STORE.** A package carries `certificatePem`, `fingerprint`
  and `expiresAt` — never a private key, in an answer, a row, an event, an operator line or a test's snapshot. **A test asserts
  its absence** (`-----BEGIN PRIVATE KEY` and `-----BEGIN RSA PRIVATE KEY` absent from the whole answer).
- **A MODEL KEY IS A CREDENTIAL** — in `startAgentSession`'s answer and nowhere else. A trim never answers a key.
- **REAL GITHUB IS CALLED ONLY AT RICH'S YES, WITH THE NETWORK ON, AND ONLY IN THE STEPS THAT SAY SO** — Task 1's real leg,
  Task 2's Step 6, and Task 15's optional leg. **No unit or Docker test ever reaches `api.github.com`**: `config.ts`'s defaults are
  the fake, and a test that finds `MANIFEST_GITHUB_API_URL` set to anything but a loopback host refuses to run. Every repository
  made on the real App is PRIVATE, in `Manifest-local-dev`, named `lp-…`. **The App's key is a file, and no step reads, prints or
  copies it** (`infra/secrets/github-app.pem`, `-rw-------`).
- **A DESTRUCTIVE OPERATION IN A TEST TOUCHES ONLY WHAT THE TEST CREATED**; no test, probe or demo archives, deletes or removes a
  member from `launch-app`, `board-*`, `frontend-*` or the faculty front-end's projects.
- **Tests that run `git` set their own identity and ignore the machine's config**: `-c user.name=… -c user.email=… -c
  commit.gpgsign=false`, `GIT_CONFIG_NOSYSTEM=1`, `GIT_CONFIG_GLOBAL=/dev/null`.
- **Nothing in this plan installs an external package.** A task that believes it needs one records a finding and raises it.
- **Ask before `sudo`.** No task needs it. **Never edit the spec** — the spec actions go to Rich. **Never touch Laravel
  Valet.** These four containers must survive: `docker-simple-saml-saml-idp-1`, `qdrant-local-dev`, `mongodb`, `mongo-express`.
  **`caddy-data` must never be destroyed.** **`docker-simple-saml`, `ubc-genai-toolkit` and `saml-metadata-generator` are
  read-only** — Task 1 runs the tool's `generateMetadata` from a COPY in `$SCRATCH`, never in place.
- **Config files are single-file bind mounts**: `infra/litellm/config.yaml`, the Caddyfile and the IdP's are bound to an inode.
  Edit in place, restart the container, and read it back with `docker exec … cat` (ORIENTATION §4 trap 18).
- **macOS ships bash 3.2 and a BSD userland**: no associative arrays, no `mapfile`, no `xargs -r`, `sed -i ''`. **The tool shell is
  zsh**: run multi-line probes with `bash <file>`, never name a loop variable `path`, quote every multi-word variable.
- **`request.log` writes nothing**; use `console.error`, never with a secret, a key, a token, a cookie or a note in it. **A
  swallowed `.catch(() => undefined)` is this codebase's most productive defect.** **`.map(fn)` passes the ARRAY INDEX.**
- **COMMIT ON `main`, AND STAGE YOUR OWN PATHS BY NAME** — files, never directories; never `git add -A`, `git add .`, `git commit
  -a` or `git checkout .`. `git status` before each commit, every path accounted for; other sessions commit on `main` while you
  work. **The faculty front-end links `packages/contract` and runs `packages/mock` from THIS working tree** — before a commit that
  touches either, `ListAgents`, message its live session (`manifest-app-…`), and commit after its reply or its silence has been
  given a fair wait (the memory *faculty front-end is a sibling repo*). End every commit message with the attribution lines the
  session's system reminder gives.
- **`$SCRATCH` IS YOUR SESSION'S SCRATCHPAD AND YOU MUST SET IT.**
  ```bash
  export SCRATCH=<your session's scratchpad directory>
  [ -d "$SCRATCH" ] || { echo 'SCRATCH is not a directory'; exit 1; }
  ```
- **Leave the machine as you found it.** `./scripts/snapshot-machine.sh` at the start and the end of a sitting, and `diff`
  the two. **At every close, run `bash scripts/dead-app-resources.sh`, `bash scripts/litellm-orphans.sh` and `bash
  scripts/app-images.sh` bare, then TRY each with `--apply` yourself**; hand the output to Rich only if you are refused. **And
  from Task 2 on, `bash scripts/github-real-repos.sh` bare** — it reads only, and it needs the network.
- **The control plane runs ONE source driver**, and every demo but `demo-authoring`, `demo-frontend`, `demo-github` and (Task 15)
  `demo-launch` is driver 1's. **`.env` carries `MANIFEST_SOURCE_DRIVER=github` and the six real-App settings by Rich's decision** —
  a sitting that needs driver 1 or the fake starts the control plane with those unset in its own shell (`env -u …`), says so in
  its record, and restores what Rich chose at its close.

---

## Review Focus

**The five failure modes the spec implies and no task's happy path exercises, most likely first.** Each has its test added to the task that owns the code.

1. **A draft that gates the build loop.** An owner drafts the production registration in week one, and in week three the agent
   adds `sn` to `auth.attributes`. Expected: **the next sandbox, staging and production build all succeed** — only a registration
   UBC has registered (`registered_at` set) is checked — and the checklist's `iam-registration` item says the draft no longer
   covers the app, and to draft again. Owned by Task 9's *a draft never fails a build, and a registered production row still
   does*.
2. **A package that says something false.** A staging package carrying the production hostname; a certificate that is not the
   one the app will sign with; an attribute the app no longer asks for; a package regenerated after it was sent; a private key
   in the answer. Expected: **the staging package names only staging's entity id, ACS and SLO; its certificate's fingerprint is
   the one `sso.registered` publishes when that environment deploys; the package sent is the package kept; no `PRIVATE KEY`
   anywhere.** Owned by Task 10's *a package's certificate is the one the environment registers with*, *a submitted package is
   never regenerated*, and *no answer carries a private key*.
3. **A credential that is gone but still hears the project.** A token revoked, a token expired, a member removed, a project
   deleted — each with a stream open. Expected: **the stream closes with `4401` (credential) or `4404` (project, or a removed
   person) at the moment it happens — within one second of the revoke, and within one second of `expiresAt`** — and a new
   upgrade is refused as before. Owned by Task 5's *a revoked token's open stream closes 4401* and *an expired token's stream
   closes at its expiry*, and Task 8's *a removed member's streams close*.
4. **A narrowed key that still answers a withdrawn model.** Expected: **LiteLLM refuses the withdrawn model on the very next call
   through the SAME key, and still answers a model it kept** — measured by calling it, never by reading the row. Owned by Task 7's
   Docker case *a narrowed key is refused the withdrawn model at once and keeps the rest*.
5. **Real GitHub left untidy.** A create that fails after GitHub made the repository; a fake-made project run against the real App;
   a delete that read a `422` as gone. Expected: **no repository in `Manifest-local-dev` without a live project row — or one
   named by `github-real-repos.sh` — and a fake-made project refused `409 SOURCE_PROVIDER_MISMATCH` naming both hosts, before any
   call to GitHub.** Owned by Task 2's *a create that fails after the driver made the repository destroys it* and *a project made
   on another GitHub is refused before GitHub is asked*.

---

## File Structure

```
packages/control-plane/src/launch/
  records.ts                  MOD (T9) environment-keyed reads; submitIamRegistration, submitPrivacyAssessment; drafts stored
  transitions.ts              MOD (T9) SUBMIT_ARROWS — the moves launch:submit may make
  readiness.ts                MOD (T9, T12) since; the draft's coverage in the iam item's why; the request in admin-approval
  package.ts                  NEW (T10) ATTRIBUTE_PURPOSES, justify(), draftIamRegistration's assembly
  usage.ts                    NEW (T10) findAttributeUses — the bounded search of a tree for the bridge's names
  assessment.ts               NEW (T11) draftPrivacyAssessment's six rows, and renderAssessmentText
  requests.ts                 NEW (T12) approval_requests: requestApproval, openRequestFor
  queue.ts                    NEW (T12) listQueue — derived items, oldest first
packages/control-plane/src/sso/
  registration-xml.ts         NEW (T10) renderRegistrationMetadata — UBC's structure, Manifest's values
  index.ts                    MOD (T10) exports it, and describeKeypair/ensureSpKeypair for launch/
packages/control-plane/src/releases/
  build.ts                    MOD (T9) the production row, registered only
  lifecycle.ts                MOD (T5) closes a deleted project's streams; an archive's revoked tokens' streams
packages/control-plane/src/source/
  github/driver.ts            MOD (T2) apiHost on the repository it reports
  (projects/source-repositories.ts) MOD (T2) api_host written and compared
packages/control-plane/src/observability/
  streams.ts                  NEW (T5) the stream registry: register, closeToken, closeProject, closePerson
  events.ts, event-schemas.ts, examples.ts   MOD (T7–T12) seven event types
packages/control-plane/src/ai/
  agent-keys.ts               MOD (T7) narrowAgentKey — /key/update on the alias
  sessions.ts                 MOD (T7, T8) trimOrEnd; endSessionsOf gains { projectId, userId }
packages/control-plane/src/identity/, sso/   MOD (T8a) eduPersonAffiliation asked for and kept; mayBuild; the admin setting
packages/control-plane/src/tokens/
  repository.ts               MOD (T8) revokeTokensOfMember
packages/control-plane/src/projects/
  authz.ts                    MOD (T9, T10, T12) launch:submit (T9, person-only), launch:draft (T10), approval:request (T12)
  repository.ts               MOD (T8) removeMember in one transaction with the revoke
  fleet.ts                    MOD (T12) name, state, archivedAt (M3)
packages/control-plane/src/api/
  routes/events.ts            MOD (T5) registers each stream; closes with the registry's code
  routes/tokens.ts            MOD (T5) closes the revoked token's streams
  routes/project-reads.ts     MOD (T8) removeMember: tokens, sessions, streams
  routes/launch.ts            MOD (T9–T11) draft and submission routes
  routes/releases.ts          MOD (T12) requestApproval
  routes/queue.ts             NEW (T12) listQueue
  routes/projects.ts          MOD (T2) a failed create destroys the repository
  representations/launch.ts   MOD (T9–T11) environment, submittedAt/By, createdAt, since, package, draft
  representations/instances.ts MOD (T4) createdAt
  representations/queue.ts    NEW (T12) Queue, QueueItem
  representations/fleet.ts    MOD (T12) name, state, archivedAt
  contract/websocket.ts       MOD (T5) closeCodes gains 4401
  error-codes.ts, errors.ts   MOD (T9–T12) five codes
  authz-contract.ts           MOD (T9–T12) rows for every new route
packages/control-plane/src/db/
  schema.ts + drizzle/        MOD (T2, T4, T7–T12) api_host; instances.created_at; end_reason member_removed;
                              environment_kind, submitted_at/by, generated_package, the CHECK; approval_requests
  testing.ts                  MOD (T3) registerBackgroundWork; resetDatabase drains first
packages/control-plane/src/api/testing.ts   MOD (T3) testDeps registers its retirer and builds
packages/control-plane/src/config.ts        MOD (T10) MANIFEST_LAUNCH_CONTACTS
infra/litellm/                MOD (T6, only if [M5] allows) manifest_guard.py; config.yaml's callbacks; compose's mount
packages/contract/            GENERATED openapi.json, schema.d.ts (1.5.0)
packages/journey/src/
  launch.ts                   NEW (T15) make demo-launch's phases, through @manifest/contract
  coverage.ts                 MOD (T9–T12) the new steps
  example-*.ts                NEW (T14) the guides' code, run against the mock
packages/mock/src/            MOD (T13) drafts, submissions, a request, the queue
packages/console/src/         MOD (T13) Launch records (the owner's half), Queue, everyCapability
docs/api/                     MOD (T14) launching.md rewritten; frontend, agents, events, conventions
scripts/github-real-repos.sh  NEW (T2) the organisation's repositories against their projects
scripts/demo-authoring.sh, demo-frontend.sh, demo-github.sh   MOD (T2) refuse real GitHub by name
scripts/demo-launch.sh        NEW (T15); scripts/ci-acceptance.sh, offline-acceptance.sh, Makefile MOD (T15)
docs/superpowers/spikes/launch-baseline/   NEW (T1) the measurements' record
```

---

## The fixtures and helpers every snippet below uses

- **`withProjectServer(fn)`** (`api/testing.ts:1027-1094`): a fresh database, a server, `bio_prof` as owner of a project created
  **through the route**, a second project owned by `unrelated_user`, and `ctx.commitSha` — the seed's validated commit.
  **`sessionFor(ctx, puid, role?, { steppedUp })`**, **`mutationHeaders(deps)`**, **`refusal(res)`** and **`loginAs(deps, puid,
  { steppedUp })`** are beside it.
- **`testDeps()`** (`api/testing.ts:768+`) builds a real retirer (`:812`) — Task 3 registers it with `db/testing.ts`.
- **`fakeLiteLlm`** (`ai/testing.ts`): the recording fake LiteLLM the unit tier mints against. Task 7 teaches it `/key/update`.
- **`ai/testing.ts`**'s `litellmUrl()`, `litellmMasterKey()`, `ensureProbeUser`, `mintProbeKey`, `deleteProbeKeyByAlias` — the
  Docker tier's direct line to the running LiteLLM.
- **`describeSourceDriver(name, make, extra)`** (`source/driver-contract.ts`), run for driver 2 in `source/github/driver.test.ts`
  against the in-process fake.
- **The launch fixtures**: `launch/testing.ts` (read it before Task 9), and `api/launch.test.ts`'s administrator session
  (`loginAs(deps, 'opr000001', { steppedUp: true })` is how the existing record tests act).
- **A stream in a test** — `api/events.test.ts` opens one with its own WebSocket helper and reads `listenerCount` from the bus
  (`:191`, `:409`). Read it before Task 5.
- **`idp_login jar idp_jar login_url user pass expect_acs ca`** (`infra/lib/idp-login.sh`) — a real sign-in, for the demo.
- **`$SCRATCH`** as in *Global Constraints*.

---
## Task 1: Measure what this plan rests on — and run the control plane on REAL GitHub

**ALONE, AND FIRST — the same session that wrote the plan, at Rich's word.** Every item in *Read this first* marked *(T1: M<n>)*
is re-run here, and the rest are measured for the first time. **Nothing under `packages/` changes in this task.** The record is
`spikes/launch-baseline/README.md` — one section per measurement, its command, its raw answer, and what it confirms or corrects
in this plan — with every command's full output in `results-task1-2026-09-29.txt` beside it, and every probe in `probes/`.

**Every throwaway LiteLLM user, key, model, fallback, container and stub a probe makes carries `probe` in its name, and the same
probe removes it**; none is named `mf-…`, which the cleanup scripts read as an app's. **The two real projects are the exception,
by design**: `lp-real-a` stays, so Rich can see it on github.com, and `lp-real-scratch` is deleted by Step 1(j) itself.

**NO VITEST RUN IN THIS TASK.** Any Vitest run truncates the control plane's tables — the faculty front-end's two projects and
`lp-real-a`'s row with them — and a real repository outlives its row. F26's rate is measured at Task 3's start, not here.

**Files:**
- Create: `docs/superpowers/spikes/launch-baseline/README.md`, `results-task1-2026-09-29.txt`, `probes/*`
- Create (git-ignored, never committed): `.superpowers/sdd/2026-09-29-launch-path/cp-start.sh` — sitting 11a's start script with
  nothing added, because `.env` now carries the driver and the six real-App settings
- Modify: this plan — a `[M<n>]` block at the head of every task a measurement corrects, and the sittings table if a boundary
  moves (**and then ask Rich before sitting 2**)

**Interfaces:** Produces the facts Tasks 2–15 rely on. Consumes nothing.

- [x] **Step 0: The machine, before anything.**
  - `./scripts/snapshot-machine.sh > "$SCRATCH/before.txt"`.
  - Read `uptime` — a load over ~10 makes every timing here suspect.
  - Query the control database: projects, users, agent sessions, instances, `source_repositories`.
  - Read `lsof` for 7100, 7102 and 7105.
  - `make doctor` and `make verify` (cheap, and they read the machine).
  - **No `pnpm test` and no Docker tier**: the tree is unchanged since the front-end enablement plan's close (the LEAN budget),
    so ORIENTATION §2's numbers are the baseline, cited, not re-run. *(M10.)*

- [x] **Step 1: THE CONTROL PLANE ON THE REAL APP — `[M1]`.** Rich's yes and the network are in this plan's first message. **Every
  call is through the platform's API**, driven one step at a time by `probes/t1-real-github.sh`, which:
  - sources `scripts/lib/api.sh`;
  - signs in as `instructor` the way `scripts/demo-authoring.sh` does;
  - steps up the way `scripts/demo-frontend.sh` does.

  **GitHub's own answer is read by `probes/t1-github-read.ts`**. It imports the driver's own `source/github/app-auth.ts` and
  `tokens.ts` under Node 24's type stripping (the `packages/github-fake` resolve hook, `--import`ed), mints an installation token
  in memory, and prints only names, booleans, shas and statuses — **never the key, a JWT or a token**. It asserts its own output
  holds no `ghs_`, `ghp_` or `-----BEGIN`, as `conformance.ts:100-119` does.
  (a) **Before**: `curl -sS -o /dev/null -w '%{http_code}' https://api.github.com/zen` (predict `200`). Then
      `t1-github-read.ts list` — every repository in `Manifest-local-dev` (predict **none**: the conformance runs deleted theirs).
  (b) **The restart.** Tell the faculty front-end's live session first (`ListAgents`; it cleared 7100 at 13:18 on 2026-09-29).
      Stop the control plane (PID 63494 at the plan's writing — read `lsof`, never remember). Start it with
      `cp-start.sh > "$SCRATCH/cp-real.log" 2>&1 &`. **Read the boot line**: predict
      `"source":"github","github":"api.github.com","githubOrg":"Manifest-local-dev"`,
      `"sourceRepositoriesPrepared"`, `"capableModel"`, and **no key or token anywhere in the log** (`grep -c 'ghs_\|BEGIN'`
      → 0).
  (c) **The front-end's two projects on driver 2**: `GET /v1/projects/<id>/source/tree` for each, as `instructor` if a member,
      else as the administrator. Predict **`409 SOURCE_PROVIDER_MISMATCH`**, its message naming the restart; record the
      envelope. Read-only.
  (d) **Create `lp-real-a`** through `POST /v1/projects`, from the `proof-app` starter as `packages/journey/src/main.ts:150-170`
      does, with name *"Launch path — real GitHub"*. **Predict**:
      - `201` in a few seconds, and `repository.provider: github`;
      - `repository.webUrl` is `https://github.com/Manifest-local-dev/lp-real-a`, and `visibility: private`;
      - **`mainProtected: false`**, with `protectionDetail` in GitHub's words (C13's *"Upgrade to GitHub Pro…"*), through the
        driver's PER-REPOSITORY admin token — never exercised before (*Read this first* 11);
      - `repository.protection_unavailable` on the stream's replay.

      Then `t1-github-read.ts repo lp-real-a`: predict `private: true`, `visibility: private`, and `main`'s head equal to the
      seed sha the platform reports.
  (e) **Reads through the platform** — `getTree`, `getFile manifest.yaml`, `listCommits`: each syncs through the
      `contents: read` token (never exercised). Predict `200` each, one commit (the seed), and its message *"chore: seed from
      blueprint skeleton"*.
  (f) **A commit through the authoring API** — `createCommit` adding `docs/made-by-manifest.md` (*"Made through Manifest, on
      real GitHub, 2026-09-29"*) against the seed. Predict `201` with a sha. Then `t1-github-read.ts repo lp-real-a` shows `main` at
      that sha, and GitHub's commit author is the platform's commit identity. **Record exactly what GitHub shows as author and
      committer** — the authoring API plan's attribution is the platform's record, never git's.
  (g) **Build and deploy from the mirror.** `validateSpec` (the commit is the newest), `startBuild {}`, wait, then `deploy` to
      SANDBOX. Predict `succeeded` then `healthy`. `curl` the sandbox hostname and assert the app's own answer, **never the edge's
      wildcard**. Record the build's time, and whether the build fetched from github.com (`GIT_TRACE`-free: read the mirror's
      `FETCH_HEAD` mtime before and after).
  (h) **OPTIONAL, AND RICH'S HANDS — a push the platform did not make.** Ask Rich once: edit `README.md` on github.com in
      `lp-real-a`'s web editor, committing to `main`.
      - `startBuild {}` → predict it builds the OLD validated commit (*Read this first* 16).
      - Then `listCommits` → predict the new commit appears (the read synced), scanned, and on the stream a
        `repository.*` event if the sync publishes one — **record which, or none**.
      - Then `validateSpec` → predict it validates the new head.

      If Rich declines or is away, record *not measured* and move on.
  (i) **Not done, by design**: making a real repository public (it would expose it); a failed create (no way to force one
      without a code change — Task 2's test does it against the fake); a fake-made project on the real App (none exists — Task
      2's test).
  (j) **Delete, for real**: create `lp-real-scratch` (the skeleton, no deploy); predict `201`, and `t1-github-read.ts repo
      lp-real-scratch` → `200`, there. Step up, then `DELETE /v1/projects/<id>`: predict `200`, and `project.deleted` on the
      stream. Then `t1-github-read.ts repo lp-real-scratch` → **`404`** (GitHub's own `Not Found`), and the local mirror
      `.manifest/repos/lp-real-scratch.git` gone. **This is the per-repository admin token's `DELETE`, never exercised before.**
      Then `createProject lp-real-scratch` AGAIN → predict `201`: the slug is free, and GitHub accepts the name. **Delete it
      again** the same way, so that only `lp-real-a` remains.
  (k) **After**: `t1-github-read.ts list` → predict exactly `lp-real-a`. **Record the time every call to GitHub took** (the REST
      client's 10 s timeout, `client.ts:52-74`, and git's 120 s).

- [x] **Step 2: LiteLLM 1.98.0 narrowing a live key — `[M3]`.** Against the running proxy with the master key (`ai/testing.ts`'s
  helpers from a scratch script), as a probe user `probe-trim-person` (`/user/new`, `max_budget: 0.05`,
  `auto_create_key: false`):
  (a) `/key/generate` with `key_alias: 'probe-trim-1'`, `models: ['default-chat', 'default-embed']`, `duration: '10m'`,
      `max_budget: 0.01`, and the frozen `allowed_routes` (`ai/keys.ts:21-25`). One chat call (predict `200`) and one embedding
      call (predict `200`).
  (b) `/key/update` with `{ key_alias: 'probe-trim-1', models: ['default-embed'] }` — **the alias alone**, because the platform
      never keeps the key. Record the answer. **If it is refused**, read `/key/list?key_alias=probe-trim-1&return_full_object=true`
      and record the field holding the key's HASHED token. Then `/key/update { key: <that hash>, models: [...] }` — record the
      answer.
  (c) **At once** — no sleep — a chat call through the SAME key: predict **refused**. Record the status, the body's `type`, and
      the milliseconds after the update's answer. If it is still `200`, repeat every 5 s until refused, and record how long —
      **that number decides whether Decision 23's "at once" holds, or whether the trim must also end the session when the gap is
      too long**.
  (d) An embedding call through the same key: predict `200` (the model it kept).
  (e) `/key/info?key=…` is NOT available (the platform has only the alias): record what `/key/list?key_alias=…` says of the
      key's `models` after the update.
  (f) Delete the probe key (`/key/delete {key_aliases}`) and the user.

  **If (b) cannot narrow a key by any route, or (c) never refuses, Decision 23 falls** and Task 7 is re-cut with Rich before
  sitting 5.

- [x] **Step 3: An open stream after a revoke — `[M4]`.** Against the control plane of Step 1, on `lp-real-a`:
  (a) mint a token (`project:read` only, `expiresInDays` the mint route's minimum);
  (b) open `wss://console.manifest.internal/v1/projects/<id>/events` with it, using Node 24's global `WebSocket` and
      `--use-system-ca` or the platform CA;
  (c) read the replay and the ready frame;
  (d) revoke the token (`DELETE /v1/tokens/<id>`, `200`);
  (e) rename the project (`PATCH`, which publishes `project.renamed`).

  **Predict**: the socket stays open and RECEIVES `project.renamed` (FE-33's measurement, repeated on this machine). Watch 30 s,
  and record every frame's `type` and the close code, if any. A new upgrade with the same token: predict refused (`1006`), and a
  `GET` of the same URL answers `401 UNAUTHENTICATED`. Rename the project back.

- [x] **Step 4: The fallback by the provider's error — `[M5]`.**
  **(a) Which errors a `general` fallback answers.** Write `probes/t1-stub-provider.mjs`: an OpenAI-shaped HTTP stub on the host
  at `127.0.0.1:7199` (free at the plan's writing — check `lsof` first). It answers `POST /s<status>/v1/chat/completions` with
  that status and an OpenAI-shaped error body, `/ok/…` with a valid completion, and `/slow/…` after 20 s.
  - Register throwaway models through `/model/new`: `probe-fb-400`, `-401`, `-403`, `-404`, `-408`, `-422`, `-429`, `-500`,
    `-502`, `-503`, `-slow` (with `litellm_params.timeout: 5`) and `-refused` (at `127.0.0.1:7198`, where nothing listens).
    Each is `openai/stub` with `api_base: http://host.docker.internal:7199/s<status>/v1` and `api_key: 'probe'`.
  - Give each a `general` fallback to `default-chat` (`POST /fallback`).
  - Mint one probe key holding every probe name, and call each once.

  **Record, for each: the status the client sees, `x-litellm-attempted-fallbacks`, and the answering `model`.** *Predict from
  `router.py:6279-6531`*: **every one falls back** — `400` included — **except none**. Remove every probe model, fallback, key
  and user.

  **(b) Whether a hook can tell a fallback from a first call, and see the original error.** Start `manifest-probe-litellm` from
  the SAME pinned image (`infra/images.lock:9`) on `127.0.0.1:7197`:
  - its own throwaway master key and no database;
  - a config with two models — `probe-primary` (the stub's `/s400`) and `probe-fallback` (the stub's `/ok`);
  - `router_settings.fallbacks: [{probe-primary: [probe-fallback]}]`;
  - `litellm_settings.callbacks: probe_hook.proxy_handler_instance`;
  - `probes/t1-probe_hook.py` mounted read-only. Its `async_pre_call_deployment_hook(kwargs, call_type)` prints, to stdout, the
    KEYS of `kwargs` and of `kwargs['metadata']` / `kwargs['litellm_metadata']`, and any value whose key names a model group, a
    fallback depth, a previous model or an exception. **Never a key's value, a message or a header.**

  Call `probe-primary` once. **Record**: whether the hook runs for the fallback deployment's call; what in `kwargs` says it is a
  fallback; and whether the ORIGINAL exception — or its status — is reachable. Then change the hook to raise
  `litellm.BadRequestError` on a fallback call whose original status is `400`, restart the probe container, and record what the
  CLIENT receives: status, body `type`, and whether the fallback's answer is gone. `docker rm -f manifest-probe-litellm`.
  **If the original status is not reachable, Decision 25's guard falls, and Task 6 is its documented branch.**

- [x] **Step 5: The structure UBC IAM receives — `[M6]`.** Copy `~/Developer/saml-metadata-generator/src/utils/metadata.ts` and
  `algorithms.ts` into `$SCRATCH/smg/` (**the repository itself is read-only**, and dirty with changes that are not ours). Mint a
  throwaway self-signed certificate with `openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=lp-sample`, keeping only
  the certificate. Run `generateMetadata` with `appName: 'lp-sample'`, `appUrl: 'https://lp-sample.manifest.internal'`, the
  tool's own defaults for the organisation and the algorithm lists (read from its `server.ts`'s form defaults), and a
  `contactEmail`. Save the XML as `probes/ubc-structure.xml`. **Record**:
  - every namespace;
  - the element order under `EntityDescriptor` and `SPSSODescriptor`;
  - the `Extensions` (`alg:DigestMethod`, `alg:SigningMethod`), the `KeyDescriptor` uses, and the `EncryptionMethod`s;
  - `NameIDFormat`;
  - the ACS bindings (Shibboleth's six — Decision 12 keeps ONE, HTTP-POST at the app's callback, and records the difference);
  - `Organization` and `ContactPerson`;
  - whether any `RequestedAttribute` appears (predict **none** — UBC asks for attributes on its form);
  - `xmllint --noout` (predict well-formed);
  - and whether `packages/control-plane` has an XML parser as a DIRECT dependency (`grep xmldom packages/control-plane/package.json` —
    predict **none**, so Task 10's tests assert the XML with a small parse of their own, or with `xmllint` in the Docker tier).

- [x] **Step 6: Where the blueprint's code reads each attribute — `[M9]`.** Read `blueprints/node-ts-mongo/skeleton/auth/*.js`
  and `server.js`: the bridge (`auth/attributes.js`) turns a profile into a FLAT object keyed by FRIENDLY name —
  `ubcEduCwlPuid`, `mail`, `givenName`, `sn`, `eduPersonAffiliation`, `eduPersonPrincipalName`, `uid`. Record where the skeleton
  puts that object (`req.user`? a session field?), and therefore what an app's code writes to read one (`req.user.mail`,
  `user.givenName`…). Then grep the `proof-app` starter and `fixtures/*-app/` for those reads and count them. **Predict**: every
  read is `<something>.<friendlyName>`, so Decision 14's search is the friendly name as a whole word, outside the files the
  blueprint owns (`auth/`), in `.js`, `.mjs`, `.ts` and `.html` files.

- [x] **Step 7: The launch records today — `[M8]`.** On `lp-real-a`:
  (a) `getLaunchRecords` (predict both `null`) and `getLaunchReadiness` — record every item's `state` and `why`;
  (b) as `instructor` (the owner), `recordIamRegistration` → predict `403 FORBIDDEN`;
  (c) as the administrator — `operator`, given the role by `scripts/admin-grant.sh` as `scripts/demo-production.sh` does (it
      records nothing when the role is already set), signed in, stepped up where a route needs it —
      `recordIamRegistration { state: 'draft', registeredAttributes: ['ubcEduCwlPuid'], … }` → `201`. Then as the owner,
      commit a manifest whose `auth.attributes` holds one attribute the draft lists and one it does not (read the `proof-app`
      starter's list first), and `startBuild {}`. **Predict the build FAILS** with the unregistered-attribute message — *Read this first* 7, a draft gating
      a sandbox build;
  (d) restore the manifest by a second commit. **The row cannot be deleted through the API** — record that it stays, as a
      `draft`, on a probe project.

- [x] **Step 8: The numbers and the seams' predictions — `[M10]`.**
  - Contract counts with `jq`: `info.version`, operations, schemas, `ErrorCode`'s enum length, `x-manifest-event-types`.
  - Migrations with `ls packages/control-plane/drizzle/*.sql | wc -l`.
  - **Write down, before sitting 2**:
    - which task first moves `openapi.json` (predicted **Task 4**);
    - the contract's version after this plan (predicted **`1.5.0`**, taken once);
    - which existing tests Task 9's CHECK change turns red (predicted **none** — the administrator's route still refuses an
      empty list, `records.ts`);
    - which tests Task 3's drain changes (predicted **none red**; `api/delivery.test.ts`'s deadlock rate to 0);
    - how many event types this plan adds — predicted **six**: `agent_session.narrowed`, `iam_registration.drafted`,
      `iam_registration.submitted`, `privacy_assessment.drafted`, `privacy_assessment.submitted` and `approval.requested`.
      Task 8 adds fields to `member.removed`, not a type;
    - and **which migrations this plan writes**: predicted eight, `0040`–`0047` (Tasks 2, 4, 7, 8, 9, 10, 11, 12), each event
      type's CHECK riding its task's migration.

  A wrong prediction is a finding.

- [x] **Step 9: The record, and the machine.**
  - Write `README.md`, and correct every task a measurement contradicts with a dated `[M<n>]` block at its head.
  - `diff` a fresh snapshot against `before.txt`: no probe container, LiteLLM probe user, key, model or fallback, and no stub
    left; `lp-real-a` present, `lp-real-scratch` absent on GitHub and in the database.
  - **The control plane stays on real GitHub** — Rich's `.env`, his decision — **unless he says otherwise at the close**. Tell
    the front-end's session which driver it is on.
  - Commit:
  ```bash
  git add docs/superpowers/spikes/launch-baseline/README.md docs/superpowers/spikes/launch-baseline/results-task1-2026-09-29.txt docs/superpowers/spikes/launch-baseline/probes/<each probe, by name> docs/superpowers/plans/2026-09-29-launch-path.md
  git commit -m "docs(launch): Task 1 — the measurements the launch path rests on, and the control plane's first run on real GitHub"
  ```

---
## Task 2: What real GitHub found — a repository never left behind, a project never pointed at the wrong GitHub, and the demos honest about which GitHub they need

> **`[M1]` (Task 1, 2026-09-29 — `spikes/launch-baseline/`, F1, F3, F4): the real run was green end to end, and adds two
> items to this task.** (1) **The real App's driver adopts the FAKE's orphaned mirrors**: the boot's `prepare` rewrote
> `frontend-github.git` and `frontend-scratch-github.git` (`manifest.webUrl` `http://127.0.0.1:7110/…`, no row) as its own.
> `api_host` (Step 3) covers a project with a row. For a mirror with NONE, `prepare` skips a mirror whose `manifest.webUrl` host
> is not the running `MANIFEST_GITHUB_GIT_URL`'s, and `scripts/dead-app-resources.sh` names orphan mirrors. Add a test: *a
> mirror of another GitHub is left alone at boot*. (2) **`scripts/lib/api.sh`'s `api` sends `content-type: application/json`
> with no body**, so a bodyless `DELETE` through it is `400 REQUEST_INVALID` — `content-type` only with a body, and a line in
> TRAPS.md. And `.env.example:78`'s *"nothing deletes"* is measured wrong (Step 7 already corrects it). The real run's timings
> for RUNBOOK: token mints 313–448 ms, REST reads 350–1101 ms, a create 8–9 s, a commit 5 s, a delete 1 s.

**The list below is PREDICTED from *Read this first* 13–16. Task 1's `[M1]` block, written at the head of this task, adds what
the run actually found and removes anything it disproved.** Every test here runs against the in-process fake (`source/github/
testing.ts`) or the fake's container — never real GitHub. Step 6 is the one real check, at Rich's yes.

**Files:**
- Modify: `packages/control-plane/src/api/routes/projects.ts:280-292` — a failed create destroys what the driver made
- Modify: `packages/control-plane/src/projects/source-repositories.ts` — `api_host` written by `recordRepository` and compared by `repositoryOf`
- Modify: `packages/control-plane/src/source/git-driver.ts` (`RepositoryLink` gains `apiHost: string | null`), `source/github/driver.ts` (sets it), `source/local-driver.ts` (null)
- Modify: `packages/control-plane/src/db/schema.ts` + a generated migration (predicted `0040`) — `source_repositories.api_host text` (nullable)
- Create: `scripts/github-real-repos.sh`, `packages/journey/src/github-real-repos.ts`
- Modify: `scripts/lib/api.sh` (`require_fake_github`), `scripts/demo-authoring.sh`, `scripts/demo-frontend.sh`, `scripts/demo-github.sh`
- Modify: `docs/superpowers/RUNBOOK.md` (*The control plane on driver 2* gains *On the real App*, written from Task 1), `.env.example:77-83`
- Modify: `packages/control-plane/vitest.global-setup.ts` — **the test tiers refuse real GitHub** (Step 0)
- Test: `packages/control-plane/src/api/projects.test.ts`, `src/projects/source-repositories.test.ts`, `src/source/github/driver.test.ts`

**Interfaces:**
- Produces: `RepositoryLink.apiHost: string | null`; `repositoryOf(db, projectId, running: { name: SourceDriverName; apiHost: string | null })` — its second argument widens from the driver's name, and **every caller passes `deps.source.identity()`**, a new one-line method on `SourceDriver` (`{ name, apiHost }`); `SOURCE_PROVIDER_MISMATCH`'s message names both hosts when they differ.
- Consumes: nothing from earlier tasks.

- [ ] **Step 0: FIRST — no test tier may ever reach real GitHub.** `.env` now carries the six real-App settings (Rich's
  decision), and ORIENTATION §7e measured that `pnpm test:docker` from a shell that sourced `.env` boots its control planes on
  driver 2 — **against the real App, which would create real repositories from every Docker case that creates a project**. So
  `vitest.global-setup.ts` refuses to start, before its `TRUNCATE`, when `MANIFEST_SOURCE_DRIVER=github` and
  `MANIFEST_GITHUB_API_URL` or `MANIFEST_GITHUB_GIT_URL` names a non-loopback host:
  ```
  refusing to run: MANIFEST_GITHUB_API_URL points at a real GitHub (api.github.com). The test tiers use the GitHub fake.
  Unset MANIFEST_SOURCE_DRIVER and every MANIFEST_GITHUB_* in this shell (RUNBOOK, "On the real App").
  ```
  It prints the HOST, never the whole value. **Until this step lands, every Vitest run in sitting 2 is from a shell with those
  variables unset** (*Global Constraints*). Its control: export the real API URL in a scratch shell, run one unit file, and
  predict the refusal, with no table truncated (`psql` before and after). Commit it alone, first:
  `git commit -m "test: the test tiers refuse to run against a real GitHub"`.

- [ ] **Step 1: The failing tests.**
  ```ts
  // api/projects.test.ts — against the in-process fake, driver 2
  it('a create that fails after the driver made the repository destroys it, and frees the slug', async () => {
    // make the route's own follow-up fail: the driver's headCommit throws once, AFTER createRepository returned
    const { deps, fake } = await githubDeps({ failHeadCommitOnce: true })
    const res = await create(deps, 'lp-fail-after')
    expect(refusal(res).code).toBe('SOURCE_GIT_FAILED')        // whatever the injected failure maps to — assert the CODE
    expect(fake.repository('manifest-apps', 'lp-fail-after')).toBeUndefined()   // gone on "GitHub"
    expect(existsSync(join(deps.config.reposRoot, 'lp-fail-after.git'))).toBe(false)  // and the mirror
    expect((await create(deps, 'lp-fail-after')).statusCode).toBe(201)          // positive control: the slug is free
  })

  // projects/source-repositories.test.ts
  it('refuses a project made on another GitHub before GitHub is asked, naming both hosts', async () => {
    await recordRepository(db, projectId, { ...link, provider: 'github', apiHost: '127.0.0.1:7110' })
    await expect(repositoryOf(db, projectId, { name: 'github', apiHost: 'api.github.com' }))
      .rejects.toMatchObject({ code: 'SOURCE_PROVIDER_MISMATCH', message: expect.stringContaining('127.0.0.1:7110') })
    // positive control, same file: the same host is answered
    await expect(repositoryOf(db, projectId, { name: 'github', apiHost: '127.0.0.1:7110' })).resolves.toBeDefined()
  })
  it('a row with no host (made before api_host existed) is answered by any host of the same provider', …)
  ```
  **Why the last one:** rows written before the migration have `api_host` null. Refusing them would strand every existing
  driver-2 project. Treating null as *"unknown, allowed"* keeps today's behaviour for them, and **the migration's comment says
  so**.
- [ ] **Step 2: Run them — predict red** (`fake.repository` still present; `repositoryOf`'s second argument is a string).
- [ ] **Step 3: Implement.**
  - The route's `try` keeps a flag set once `createRepository` returned. On a failure after it, it calls
    `deps.source.destroyRepository(repo)`, and **a failure of that is `console.error` naming the slug and the provider — never
    swallowed** — then deletes the row and rethrows the ORIGINAL error.
  - `api_host` is written by `recordRepository` from `link.apiHost`, and compared only when both are non-null.
  - `pnpm --filter @manifest/control-plane db:generate`, read it, apply it.
- [ ] **Step 4: The demos refuse real GitHub by name.** `require_fake_github` in `scripts/lib/api.sh` reads `.env`'s
  `MANIFEST_GITHUB_API_URL` **by `grep -c`, never printing it**. It refuses when that is set to anything but a loopback host:
  ```
  FAIL this demo drives the GitHub FAKE (make github-up); the control plane is set to real GitHub (.env's
       MANIFEST_GITHUB_API_URL). Run it with the real-App lines unset, or see RUNBOOK's "On the real App".
  ```
  `demo-authoring.sh` and `demo-frontend.sh` call it in their step 0's driver-2 branch, and `demo-github.sh` in its step 0.
  **Nothing is created before it.**
- [ ] **Step 5: `scripts/github-real-repos.sh`** — bare, it lists every repository in the organisation `.env` names, by
  calling `packages/journey/src/github-real-repos.ts`, which mints an installation token through the driver's own
  `app-auth.ts` and `tokens.ts` in memory. It never prints the key or a token, and asserts its own output as Task 1's probe
  does. Beside each repository it prints the project that owns it, from `psql` on `source_repositories`: `live <project id>`,
  `deleted` (a tombstone), or `NONE`. With `--delete <name>` it deletes ONE named repository, and only when its line reads
  `NONE`, after printing what it will do and reading `yes` on stdin. **It never deletes a repository a live project owns.**
  Refused without the network: `SKIPPED — api.github.com unreachable` and exit 0, as `github-conformance.sh` does.
- [ ] **Step 6: RICH'S YES — the real check.** With the control plane on the real App (as Task 1 left it, or restarted onto it):
  run `bash scripts/github-real-repos.sh` and predict `lp-real-a  live <id>`. Then create `lp-real-b`, read its `api_host`
  with `psql` (predict `api.github.com`), and delete it (step-up); predict it gone from the list. **If Rich declines, record
  it — the unit tests stand without it.**
- [ ] **Step 7: RUNBOOK and `.env.example`.** *On the real App* is written from Task 1's record, and covers:
  - what a restart does, and the boot line to read;
  - `mainProtected: false` on the free organisation;
  - no webhooks, so a push is seen at the next READ — **not at a build of `{}`** (*Read this first* 16);
  - that deleting a never-launched project **does** delete its repository on GitHub (`.env.example:78`'s *"nothing deletes"* was
    wrong);
  - that any Vitest run truncates the rows and leaves the repositories, so `github-real-repos.sh` is how to find them;
  - and that the demos refuse it.
- [ ] **Step 8: Gates and commit.** The four gates; `pnpm test:docker` is owed (`source/`), in sitting 2's close with Task 3.
  ```bash
  git add <each path in Files, by name> packages/control-plane/drizzle/<the migration> packages/control-plane/drizzle/meta/_journal.json packages/control-plane/drizzle/meta/<its snapshot>
  git commit -m "fix(source): real GitHub, found by the first run — a failed create leaves no repository; a project names the GitHub it lives on; the demos refuse real GitHub by name; github-real-repos.sh"
  ```
- [ ] **Step 9: Negative controls — after the commit, each restored from git.**
  (a) Remove the route's `destroyRepository` call. **Predict red**: *a create that fails after the driver made the repository
      destroys it*, at `fake.repository(...)` being defined.
  (b) Make `repositoryOf` compare the provider only. **Predict red**: *refuses a project made on another GitHub…*, at
      `rejects` — and **its positive control stays green**, which is what shows the control applied.
  (c) Point `require_fake_github` at a key `.env` does not have. **Predict** `make demo-authoring`'s step 0 no longer refuses
      when the control plane is set to real GitHub — run it with `DEMO_AUTHORING_STOP_AFTER=0` only, so nothing is created.

---

## Task 3: F26 — every background pass a test starts is drained before the next test's `TRUNCATE`

**Measure first, at this task's start** — Task 1 could not, because Vitest truncates. Run
`pnpm exec vitest run --project unit src/api/delivery.test.ts` **eight times, alone**. Count `deadlock detected` and
`[retire] … failed` lines, and record each run's wall time. *Predict*: 1–2 of 8 red, as sitting 12 measured. **This is the
control's baseline**: a drain that works reads 0 of 8.

**Files:**
- Modify: `packages/control-plane/src/db/testing.ts` — `registerBackgroundWork`, and `resetDatabase` drains first
- Modify: `packages/control-plane/src/api/testing.ts:768-812` — `testDeps` registers its retirer's and its build runner's `idle`
- Modify: `packages/control-plane/src/api/delivery.test.ts:44-59` — `depsWithDriver` registers its own retirer
- Test: `packages/control-plane/src/db/testing.test.ts` (new, or beside the harness's existing test)

**Interfaces:**
- Produces: `registerBackgroundWork(idle: () => Promise<void>): void` and `drainBackgroundWork(): Promise<void>` in
  `db/testing.ts`. `resetDatabase()` calls `drainBackgroundWork()` before its `TRUNCATE`. The set is cleared by the drain, so a
  retirer from a finished test is waited for once and then forgotten.
- Consumes: `Retirer.idle()` (`releases/retire.ts:39-43`) and `BuildRunner.idle()`.

- [ ] **Step 1: The failing test — deterministic, never a race.**
  ```ts
  it('resetDatabase waits for registered background work before it truncates', async () => {
    let release!: () => void
    const pass = new Promise<void>((r) => { release = r })
    const order: string[] = []
    registerBackgroundWork(async () => { await pass; order.push('drained') })
    const reset = resetDatabase().then(() => order.push('truncated'))
    await new Promise((r) => setTimeout(r, 50))
    expect(order).toEqual([])                 // the truncate has NOT run while a pass is in flight
    release()
    await reset
    expect(order).toEqual(['drained', 'truncated'])
  })
  it('a drained pass is not waited for again', …)   // registers, drains, then a second resetDatabase does not await it
  ```
- [ ] **Step 2: Run — predict red** (`registerBackgroundWork` is `undefined` — Vitest strips types, so it is an undefined call).
- [ ] **Step 3: Implement.** A module-level `Set<() => Promise<void>>`. `drainBackgroundWork` awaits them all with
  `Promise.allSettled`, and **logs a rejection with `console.error` rather than swallowing it**, then clears the set.
  `testDeps` and `depsWithDriver` register `retirer.idle` and `builds.idle` as they build them.
- [ ] **Step 4: The rate again.** `api/delivery.test.ts` eight times alone: **predict 0 of 8**, and **no new `[retire]`
  lines**. Then `pnpm test` twice (the close's runs), each with its `deadlock detected` count (predict 0) and the single
  deliberate `[retire]` line `retire.test.ts` writes (TRAPS.md).
- [ ] **Step 5: Commit.**
  ```bash
  git add packages/control-plane/src/db/testing.ts packages/control-plane/src/db/testing.test.ts packages/control-plane/src/api/testing.ts packages/control-plane/src/api/delivery.test.ts
  git commit -m "test(db): F26 — resetDatabase drains every retirer and build runner a test built before it truncates"
  ```
- [ ] **Step 6: Negative control.** Remove the `drainBackgroundWork()` call from `resetDatabase`. **Predict red**:
  *resetDatabase waits for registered background work…*, at `expect(order).toEqual([])` — deterministically, every run.
  (`delivery.test.ts`'s own rate going back to ~2 of 8 is the weaker, probabilistic half; record it, but the unit test is the
  control.) Restore from git. **And TRAPS.md's P6b-F7 entry gains one line**: the central fix, and where it is.

---
## Task 4: FE-38 — every instance carries when it was made

**Files:**
- Modify: `packages/control-plane/src/db/schema.ts:294-311` + a custom migration (predicted `0041`) — `instances.created_at
  timestamptz NOT NULL DEFAULT now()`, old rows backfilled from their release's `created_at`
- Modify: `packages/control-plane/src/api/representations/instances.ts:5-54` — `Instance.createdAt` (and so `InstanceSummary`'s)
- Modify: `packages/mock/src/fixtures.ts` — every instance fixture gains `createdAt` (the mock answers from the document)
- Test: `packages/control-plane/src/api/instances.test.ts`, `src/releases/release.test.ts` (or wherever a deploy's instance is asserted)

**Interfaces:** Produces `Instance.createdAt: string` (ISO 8601, never null) — on `deploy`'s answer, `listInstances` and
`getEnvironment`. Consumes nothing.

- [ ] **Step 1: The failing tests.**
  ```ts
  it('an instance says when the deploy made it, and a newer attempt is newer whatever the list order', async () => {
    // deploy A (healthy), then deploy B whose instance fails — the fixture driver of releases/*.test.ts
    const list = (await listInstances(ctx, sandboxId)).instances
    const a = list.find((i) => i.releaseId === releaseA)!, b = list.find((i) => i.releaseId === releaseB)!
    expect(Date.parse(b.createdAt)).toBeGreaterThan(Date.parse(a.createdAt))
    expect(list[0].id).toBe(a.id)   // the PUBLISHED order is unchanged: the serving one, seen most recently, first
  })
  ```
  **Why the second assertion:** FE-38's point is that the order and the time answer different questions. The test holds both,
  so a later "fix" that reorders the list goes red here.
- [ ] **Step 2: Run — predict red** (`createdAt` stripped: the representation lacks it).
- [ ] **Step 3: Implement.** `db:generate --custom`: add the column nullable, `UPDATE instances i SET created_at =
  r.created_at FROM releases r WHERE r.id = i.release_id`, then `SET NOT NULL` and `SET DEFAULT now()`. A comment says the
  backfill is the earliest the instance could have been made. Apply it. The representation maps `createdAt`. Then
  `pnpm contract:write`, `contract:generate` and `docs:write` — **the contract becomes `1.5.0` here** (`api/contract/document.ts:57`).
- [ ] **Step 4: The mock and its fixtures** — `pnpm test`'s packages project parses every fixture against the document, so a
  fixture without `createdAt` is red until it has one.
- [ ] **Step 5: Tell the faculty front-end's live session before committing** (`packages/contract` and `packages/mock` move):
  what changed, and that FE-38's option (a) is built. Then commit.
  ```bash
  git add <each path in Files, by name> packages/control-plane/drizzle/<the migration> packages/control-plane/drizzle/meta/_journal.json packages/control-plane/drizzle/meta/<its snapshot> packages/contract/openapi.json packages/contract/src/schema.d.ts packages/control-plane/src/api/contract/document.ts docs/api/reference/<each regenerated page> docs/api/llms.txt
  git commit -m "feat(api): FE-38 — Instance.createdAt, when the deploy made it; contract 1.5.0"
  ```
- [ ] **Step 6: Negative control.** Map `createdAt` from `lastSeenAt` instead. **Predict red**: the test above, at
  `toBeGreaterThan` — the failed instance B was never seen, so its `lastSeenAt` is null.

---

## Task 5: FE-33 — a stream whose credential is gone is closed, at the moment it goes

**Files:**
- Create: `packages/control-plane/src/observability/streams.ts` — the registry
- Modify: `packages/control-plane/src/observability/index.ts` — exports it
- Modify: `packages/control-plane/src/api/routes/events.ts:131-203` — `streamProject` registers the socket, arms the expiry
  timer, and unregisters on close
- Modify: `packages/control-plane/src/api/routes/tokens.ts:277-340` — `revokeToken` closes the token's streams `4401`
- Modify: `packages/control-plane/src/releases/lifecycle.ts:401-425`, `:614-691` — the archive closes its revoked tokens'
  streams `4401`; the delete closes every stream on the project `4404`
- Modify: `packages/control-plane/src/api/server.ts` / `src/index.ts` — one registry built at boot and passed in deps, as the bus is
- Modify: `packages/control-plane/src/api/contract/websocket.ts:88-98` — `closeCodes` gains `4401`; `docs/api/events.md:91-99` its row
- Modify: `packages/control-plane/src/tokens/actor.ts` / `projects/authz.ts:332-358` — `TokenActor` gains `expiresAt`
- Test: `packages/control-plane/src/observability/streams.test.ts`, `src/api/events.test.ts`, `src/releases/lifecycle.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface StreamEntry { projectId: string; tokenId: string | null; userId: string; expiresAt: Date }
  export interface StreamRegistry {
    register(entry: StreamEntry, close: (code: 4401 | 4404, reason: string) => void): () => void  // answers its unregister
    closeToken(tokenId: string): number                      // 4401; answers how many closed
    closeTokens(tokenIds: readonly string[]): number
    closeProject(projectId: string): number                  // 4404
    closePerson(projectId: string, userId: string): number   // 4404 — Task 8's caller
  }
  export function createStreamRegistry(): StreamRegistry
  ```
  `ServerDeps.streams: StreamRegistry`, and the lifecycle's deps gain it the way they carry `bus`.
- Consumes: `revokeTokensOf`'s returned ids (`tokens/repository.ts:79-92`).

- [ ] **Step 1: The failing tests.**
  ```ts
  // api/events.test.ts — with the file's own WebSocket helper
  it('a revoked token’s open stream closes 4401, and hears nothing after the revoke', async () => {
    const { socket, frames, closed } = await openStream(ctx, { token })
    await revoke(ctx, tokenId)
    expect(await closed).toEqual({ code: 4401, reason: expect.stringContaining('revoked') })
    await rename(ctx)                                        // publishes project.renamed
    expect(frames.map((f) => f.type)).not.toContain('project.renamed')
    expect(deps.bus.listenerCount(ctx.projectId)).toBe(0)
  })
  it('a second token’s stream on the same project stays open', …)   // the positive control — closing is per token
  it('an expired token’s stream closes 4401 at its expiry', …)       // a token minted to expire 1.5 s after the upgrade; fake timers are NOT used — the timer is real, bounded by 3 s
  it('a session stream stays open when a token on the project is revoked', …)
  // releases/lifecycle.test.ts
  it('archiving closes the streams of the tokens it revoked, 4401, and leaves a member’s session stream open', …)
  it('deleting a project closes every stream on it, 4404', …)
  ```
  **Why the session stream stays open on archive:** `project:read` is allowed on an archived project
  (`authz.ts:619-621`) — a person may still watch it. Closing it would be a second, unstated rule.
- [ ] **Step 2: Run — predict red** (`closed` never resolves within the test's bound).
- [ ] **Step 3: Implement.**
  - `streamProject` registers `{ projectId, tokenId: actor.kind === 'token' ? actor.tokenId : null, userId, expiresAt }`, with a
    `close` that calls `socket.close(code, reason)` and `stop()`.
  - It arms `setTimeout` for `expiresAt − now`, clamped to `2 ** 31 - 1` and re-armed when clamped.
  - Unregister and clear the timer on the socket's `close`.
  - `revokeToken` calls `deps.streams.closeToken(id)` **after the revoke commits and BEFORE `endSessionsOf`**, which can answer
    `503` on a gateway outage — closing a stream needs no gateway, and an outage must never leave a revoked token listening.
    Write that case: *a revoked token's stream closes even when ending its sessions fails*.
  - `switchOffUnderLock` closes the ids `revokeTokensOf` answered. `deleteProject` closes the project after its tombstone
    commits.
- [ ] **Step 4: The contract and the guide.** `websocket.ts`'s `closeCodes` gains `"4401": "The credential was revoked or
  expired. Ask the person for a new one; reconnecting with the same credential is refused."`. `docs/api/events.md`'s table gains
  its row. `pnpm contract:write`, `contract:generate`, `docs:write`.
- [ ] **Step 5: Tell the front-end's live session** (the contract moved), then commit.
  ```bash
  git add <each path in Files, by name> packages/contract/openapi.json packages/contract/src/schema.d.ts docs/api/reference/<each regenerated page> docs/api/llms.txt
  git commit -m "feat(events): FE-33 — a revoked, expired or archived token's open streams close 4401; a deleted project's 4404"
  ```
- [ ] **Step 6: Negative controls.**
  (a) Remove `closeToken` from `revokeToken`. **Predict red**: *a revoked token's open stream closes 4401…*, at `closed`.
  (b) Make `closeToken` close every stream on the project. **Predict red**: *a second token's stream … stays open* — the
      positive control earns its place here.
  (c) Drop the expiry timer. **Predict red**: *an expired token's stream closes 4401 at its expiry*.

---

## Task 6: FE-34 — the capable model's fallback answers a provider that failed, and not a request the provider refused

> **`[M5]` (Task 1, 2026-09-29 — F7–F10): THIS TASK IS BRANCH G, and Spec action 6's option (a) is needed before sitting
> 4.** Measured on LiteLLM 1.98.0:
> - **Every provider error falls back** — `400`, `401`, `403`, `404`, `408`, `429`, `5xx`, a timeout and a refused
>   connection each answered `200` by `ollama_chat/qwen3.5:4b` with `x-litellm-attempted-fallbacks: 1`.
> - **The hook runs on the fallback's call with `fallback_depth: 1`**, and the failed call's `exception_type` is in
>   `metadata.previous_models` — **a ROUTER-WIDE list of at most four entries, shared across requests**.
> - **The guard picks ITS OWN entry by `litellm_trace_id`**, and ALLOWS the fallback when it finds none (evicted under load).
>   The probe's `t1-probe_hook.py` is the working shape.
> - With it, a `400` primary reached the client as `400` — the provider's message, with LiteLLM's fallback debug text appended —
>   and a `503` still fell back. **Assert the status and the error's `type`, never the whole message.**
> - **NEW (F8): a provider's `422` reaches the client as HTTP `200` with a body of literal `null`**, no fallback header, and
>   the stub was called twice. Step 1's Docker test adds the `422` case and **predicts it red** under the guard too. If the guard
>   does not change it (LiteLLM answers before any fallback), the case is recorded as LiteLLM's, raised with Rich beside
>   Branch D's options, and the guides say a `200` with a `null` body is a refusal.

**`[M5]` decides which branch this task is.** *Branch G* is built if Task 1 measured that a hook on the fallback deployment's
call can see the original error's status, and that raising there reaches the client as the original refusal. *Branch D* is the
documented answer if it cannot. **Spec action 6 is needed before Branch G** (the words *"whenever its provider fails"* gain
what *fails* means). Branch D needs a sentence in §7 too, and it goes to Rich either way.

**Files (Branch G):**
- Create: `infra/litellm/manifest_guard.py` — a `CustomLogger` whose `async_pre_call_deployment_hook` refuses a FALLBACK call
  when the original error's status is a `4xx` other than `408` and `429`, raising the original error's class with its status
- Modify: `infra/litellm/config.yaml` — `litellm_settings.callbacks: manifest_guard.proxy_handler_instance` (a single-file bind
  mount: edit in place, restart `manifest-litellm`, read it back)
- Modify: `infra/compose.yaml` — the guard mounted read-only beside the config; `make up` recreates LiteLLM (its database keeps
  every model, key and fallback)
- Modify: `scripts/verify.sh` — a check that the running LiteLLM loaded the guard (its startup line), asserted by its text
- Create: `packages/control-plane/src/ai/fallback-guard.docker.test.ts` — Task 1's stub provider as a test fixture
  (`ai/testing.ts`'s `startStubProvider(port)`), every status of `[M5]`'s table
- Modify: `docs/api/agents.md`, `docs/api/frontend.md` — what a fallback answers, and `x-litellm-attempted-fallbacks`

**Files (Branch D):** only the two guides, and the finding in this plan's record, raised with Rich with three options: a
LiteLLM newer than 1.98.0 that filters fallbacks by error class, if one exists (checked with the network, at his yes); the
fallback off (`MANIFEST_CAPABLE_MODEL_FALLBACK=` empty — unreachable then fails loudly); or accepting it, as the guides say.

**Interfaces:** None in the control plane. The guard reads nothing the platform writes. It is infrastructure, like the config it
sits beside.

- [ ] **Step 1 (G): The failing Docker test.** For each of `400`, `401`, `403`, `404`, `422` — the stub answers the primary,
  and **predict the CLIENT sees that status, and `x-litellm-attempted-fallbacks` is absent or `0`**. For each of `408`, `429`,
  `500`, `502`, `503`, the timeout and the refused connection — **predict `200` from the fallback,
  `x-litellm-attempted-fallbacks: 1`**. The probe models, fallbacks, key and user are made by the test and removed in its
  `afterAll`, all named `probe-…`.
- [ ] **Step 2 (G): Run it alone** (`MANIFEST_TEST_DOCKER=1 pnpm exec vitest run --project docker src/ai/fallback-guard.docker.test.ts`) —
  **predict the five `4xx` cases red**, answered by the fallback.
- [ ] **Step 3 (G): The guard**, exactly as `[M5]` measured what `kwargs` carries. The config line, the mount, `make up`, and
  the startup line read back.
- [ ] **Step 4 (G): Green, and `ai/capable.docker.test.ts` and `ai/ai-path.docker.test.ts` still green** — they run the
  unreachable-primary fallback this must keep.
- [ ] **Step 5: The guides** (both branches): *what a fallback answers*, the header, and — Branch D — that a request the
  provider refuses as malformed is answered by the on-premise model, so a client reads `x-litellm-attempted-fallbacks`.
- [ ] **Step 6: Commit.**
  ```bash
  git add <each path in Files, by name>
  git commit -m "feat(ai): FE-34 — the capable model's fallback answers a provider that failed, never a request it refused"
  ```
- [ ] **Step 7 (G): Negative control.** Remove the `callbacks` line. **Predict red**: the five `4xx` cases, each answered `200`
  with `attempted-fallbacks: 1` — and the `5xx` cases stay green, which is what shows the guard is narrow. Restore; restart
  LiteLLM; read the config back.

---
## Task 6a: FE-41 — a project created with a starter on real GitHub

> **Added after sitting 3's close, confirmed by Rich** (the *FE-41* section above). **Real GitHub is called only at his yes, with the
> network on** (*What Rich does* 3); every repository made is PRIVATE, in `Manifest-local-dev`, named `lp-…`, and deleted after.

**Files** (to be confirmed by Step 1's cause): `packages/control-plane/src/source/github/*.ts` (the driver's `createRepository` and its
seed push), `src/api/routes/projects.ts` (an operator line for a create's source failure — F-class: nothing was logged), a driver-2
test in `src/source/github/*.test.ts` against the fake reproducing the cause, and — if the fake cannot show it — a Docker or conformance
case; `packages/github-fake` if the fake must learn GitHub's real behaviour (then `make github-conformance` at Rich's yes).

- [ ] **Step 1: Reproduce and SEE the cause.** First make the failure visible: a create whose source step fails writes one
  `console.error` operator line naming the driver's error code and GitHub's status/message (never a token) — watched on the fake by
  injecting a failure. Then, at Rich's yes and with the network on, restart nothing: call `createProject` with `starter: 'proof-app'`
  as a person (slug `lp-starter-…`) against the running real-GitHub control plane and read the new line. Compare the seed commit a
  starter makes with the blueprint-only seed (file modes, paths, sizes, the commit's tree) — the difference is the cause.
- [ ] **Step 2: The failing test** on the fake (or the conformance leg), red for the cause Step 1 read.
- [ ] **Step 3: Fix the seed on driver 2**, green; driver 1 unchanged and its starter tests still green.
- [ ] **Step 4: The real check, at Rich's yes**: the same create with `proof-app` answers `201`; the repository is private; delete it
  (step-up) and see it gone (`bash scripts/github-real-repos.sh`).
- [ ] **Step 5: Tell the front-end's session** (FE-41 fixed; nothing in the contract moves unless the fix does), then commit.
- [ ] **Step 6: Negative control** — revert the fix, predict the named test red at the cause's assertion; restore.

---

## Task 6b: FE-42 — the project's owner may run D21's rehearsal

> **Added after sitting 3's close, confirmed by Rich** (the *FE-42* section above), as **its own small sitting, 4a**.
>
> **`[S4a]` (sitting 4a, 2026-09-30 — DONE, `fa02bbc` and `7814f75`):** Step 1 found no spec text naming who triggers the rehearsal;
> `launch:rehearse` was built in `OWNER`, person-only, not step-up. **Step 1's *"the rehearsal does not touch production"* is FALSE**: it
> deploys the unapproved candidate onto production's PUBLIC listener and nothing retires it until the launch (the whole-branch review's
> I1; the record's F1) — so **Spec action 8 re-asks Rich who may run it and whether it should take itself down**; the published
> description and `launching.md` step 2 still say *"behind the gate"* and change with his answer.
>
> **Answered (Rich, 2026-09-30): (b) and (c) together — Task 6c, directly below, in sitting 5b.** Step 1's *"Step-up: the rehearsal
> does not touch production, so none"* is superseded by it.

**Files** (to be confirmed by Step 1): `packages/control-plane/src/api/routes/launch.ts` (`runRehearsal`'s `capability`, today
`launch:record`, and its description — which must say who may run it), `src/projects/authz.ts` (`CAPABILITIES`, the role grants,
`PERSON_ONLY`), `src/projects/person-only.test.ts`, `src/api/authz-contract.ts` (the rehearsal row: owner allowed), the console's
`everyCapability([...])` in `packages/console/src/screens/tokens.tsx` if a capability is added, `docs/api/` (*Launching* and the front-end
guide), the mock if it scripts the rehearsal's refusal; then the four regeneration commands (contract stays `1.5.0`).

- [ ] **Step 1: Read what decides it.** §13 (*Roles*, the checklist), §20 (credential classes) and D24: if any names who may trigger
  the rehearsal, DRAFT a spec action with options and STOP for Rich. Then read Task 9's new capabilities (`launch:draft`, `launch:submit`,
  sitting 6) and decide — recording why — whether the rehearsal gets its own capability (e.g. `launch:rehearse`, owner and admin,
  PERSON-ONLY like `launch:record`, since it deploys production-shaped values) or rides on an existing one. Collaborator: follow §13's
  *"same as owner except member management and deletion"* unless the reading says otherwise. Step-up: the rehearsal does not touch
  production, so none unless the reading says so.
- [ ] **Step 2: The failing tests** — the owner's `runRehearsal` answers as the administrator's does (a real rehearsal on the fixture);
  a delegated token is refused its person-only code; a stranger `404`; the authz contract's row. Every refusal asserts its CODE.
- [ ] **Step 3: Implement**, the description saying who may run it; regenerate; tell the front-end (its button returns); commit.
- [ ] **Step 4: Negative control** — the grant removed from the owner's role; predict the owner's test red at its code.

---

## Task 6c: Spec action 8 — a rehearsal needs a step-up, and takes its production instance down before it records

> **Rich, 2026-09-30, after sitting 4a's close: *"b and c together, in its own small sitting after 5"*** — Spec action 8's options
> (b) and (c), taken together. **Sitting 5b, after sitting 5 and before 5a.** Written the same day by the session that put the
> question to him, from the code at `09e3d7b` (every claim below was read there, and the file references are that tree's).
> **Spec action 8's combined words were APPLIED at Rich's word on 2026-09-30** (*"apply 8"*; the *Spec actions* section, 8) — the
> spec runs ahead of the code until this task lands. Step 3 also corrects `projects/authz.ts`'s `PERSON_ONLY` comment (*"D24's clause
> naming it is DRAFTED … and not yet applied"*) and whatever in `person-only.test.ts` names the rehearsal apart from D24's others.
>
> **`[S5b]` (sitting 5b, 2026-09-30 — DONE, `3333acc`, `253a923`, `0b09efc`, `fff8a7f`):** built as below, with three departures recorded
> in *Sitting 5b*: the route check asks the DRIVER (F1); a case only the route check can see was added, since a racing deploy is caught by
> the first guard (F2); and the fix wave's two additions — a deploy that throws releases the name, and the boot takes down a rehearsal a
> stopped control plane left serving (F10). FE-43 is answered `409 REHEARSAL_RUNNING`. Every `[S5]` item below was delivered or found
> already done (`revokeToken`'s, F6).
>
> **`[S5]` (sitting 5, 2026-09-30 — what 5b inherits):**
> - **THE CONTRACT BUNDLE — 5b's contract commit carries these five as well** (sitting 5's whole-branch review, triaged *"one contract
>   commit, the next one"*): `removeMember`'s description says removing a non-member *"publishes nothing"* — it can publish
>   `agent_session.ended` (say *"publishes no `member.removed`"*); `AI_CATALOGUE_DISABLED`'s published remedy (*"Remove `ai.models` from
>   manifest.yaml…"*) does not fit a removal or a revoke; `revokeToken`'s description still does not say the token is revoked BEFORE a
>   `503` (twice deferred — do not let it slip a third time); `member.removed`'s `tokensRevoked` says *"every one still live"* but expired,
>   unrevoked tokens are stamped and counted too; and `agent_session.narrowed`'s `models`/`withdrawn` say *"Never empty"* with no
>   `.min(1)`. Tell the front-end before the commit, as always.
> - **THE FACULTY FRONT-END HAS BUILT AGAINST THIS TASK'S DESCRIBED SHAPE** (`manifest-app-f1`, its F5 sitting 6, told on 2026-09-30 from
>   the code): the owner's dry-run press reads `403 STEP_UP_REQUIRED` by code (the production deploy's refusal — one serializer,
>   `api/errors.ts`); a take-down refusal matched as **`REHEARSAL_TEARDOWN_FAILED`**; production's `gone` instance read as nothing there
>   before a launch (`getEnvironment(production).instance` is the `gone` instance, not `null` — Decision 4); a failed start inside the dry
>   run read from that instance's production Incident. **If 5b's final code, or `getEnvironment`'s answer, differs from any of these,
>   message it before the commit** — and at 5b's close in any case (it waits for the window, below).
> - **FE-43 (the front-end's, Rich's to carry)**: nothing reads a dry run back — one under way, or the last one's result — so a reload or a
>   second tab can offer a second run beside one running. **5b decides whether a second rehearsal while one runs is refused** (a `409`
>   with a code of its own, the environment's lock already serialises the deploys) **and tells the front-end the code**, or records why
>   not; a read of the last rehearsal is FE-43's, not 5b's.
> - **THE 7100 WINDOW**: the front-end's real-platform walk and Rich's click run BETWEEN 5b's close and 5a's first Vitest — no platform
>   Vitest, no control-plane restart while it walks; `scripts/admin-grant.sh grant opr000001` once `operator` has signed in; one real
>   private repository, at Rich's word. 5b's close restarts the control plane FIRST, then hands 7100 over.

**Why both.** (c) alone leaves the stolen-session case open, because nothing bounds how often a rehearsal runs: a stolen owner
session can commit, build, deploy to staging (none of that is step-up) and then loop the rehearsal, keeping its code up on production's
hostname for most of each run. (b) alone leaves an honest owner's rehearsal serving an unapproved candidate on the public listener
until the launch. Together, a rehearsal needs a fresh CWL round trip and leaves nothing serving, and every run is a
`rehearsal.completed` Event naming who ran it. **And (b) closes a hole older than FE-42**: before `fa02bbc` an administrator ran it
under `launch:record`, which is not in `STEP_UP_GUARDED` either — so a stolen ADMIN session could already do it, against §20's
*"A stolen admin session must not be sufficient to put an app on the public internet."*

**What the code does today** (read at `09e3d7b`): the route (`api/routes/launch.ts:334`) calls `requireSession` and
`assertCapability(…, 'launch:rehearse')` and never `assertStepUp`; `runRehearsal` (`launch/rehearsal.ts:149`) calls
`deployRelease(…, purpose: 'rehearsal')`, which skips `productionApprovalFor` (`releases/release.ts:284`), injects PRODUCTION's app
secrets (`:331`) and points the app at the rehearsal IdP (`spec/injection.ts:450` — the Manifest IdP here,
`authentication.stg.id.ubc.ca` at UBC); the listener is `public` (`routing/hostnames.ts:24`); and nothing retires the instance —
`retireEnvironment` reaps only instances that are NOT serving (`releases/retire.ts:56`).

**Files:** `packages/control-plane/src/projects/authz.ts` (`STEP_UP_GUARDED` gains `launch:rehearse`, with a §20 comment in the
style of its `secret:write` and `project:delete` lines), `src/projects/step-up-guarded.test.ts` (its literal list — it names the set
a second time on purpose), `src/api/routes/launch.ts` (`assertStepUp(actor, 'launch:rehearse')` after `assertCapability`; the
declared errors gain `403 STEP_UP_REQUIRED`; the description rewritten), `src/launch/rehearsal.ts` (the take-down, and every comment
that says the instance stays), `src/releases/retire.ts` (if the take-down needs an export — see Step 3), `src/api/authz-contract.ts`
(the rehearsal rows: un-stepped `403 STEP_UP_REQUIRED`, stepped `200`, a token still `TOKEN_PERSON_ONLY`),
`src/releases/production.docker.test.ts` (where the rehearsal's Docker tests live), `src/launch/rehearsal.test.ts`,
`packages/journey/src/production.ts` and `scripts/demo-production.sh` (the admin phase runs the rehearsal BEFORE step 7's step-up — it
must step up first, and the refusal before it is a check worth keeping, like step 6's), `packages/console/src/api.ts` and the screen
that presses it (the console already handles `STEP_UP_REQUIRED` for approvals and deploys — reuse it), `docs/api/launching.md` step 2,
and `rehearsalItem`'s `why` (it says the app *"was deployed to its production hostname on the … listener"* — say it was taken down
again). Then the four regeneration commands; **the contract stays `1.5.0`**, and the front-end is told before each contract commit.

**Decisions this task makes, recommended, and the sitting may re-decide with its reasons:**

1. **The ORDER: deploy → probe → take-down → row → Event → answer.** The row is written only after the take-down, so §13's
   `rehearsal` item can never read `met` while the candidate still serves, and a launch cannot start in between.
2. **The take-down is ARCHIVE'S PATTERN, for one environment** (`releases/lifecycle.ts`'s `switch-off-names` and `retire-instances`):
   under `withEnvironmentLock(production.id)`, **the name first** — `driver.removeName(hostname, 'production')`
   (`runtime/docker/driver.ts:747` → `routing/routes.ts:132`) and the `routes` row deleted — **then the instance**, marked `destroying`
   and retired by `retireInstanceRow` (`releases/retire.ts:200`, which takes no lock itself, exported for exactly this). Name first
   because the driver refuses to retire an instance any live route dials (`INSTANCE_SERVING`, `runtime/docker/driver.ts:592`).
   **Under the lock, remove the name only if the route still names THE REHEARSAL'S instance** (`instanceIdOf`/`servingRoute`,
   `routing/routes.ts`): the environment lock is the one a deploy holds from its instance row to its Route row, so this is what makes a
   deploy racing the take-down safe.
3. **What the hostname answers afterwards: NOTHING of the app's — the public listener's wildcard**, `manifest OK host=<host> …
   listener=public` (`infra/caddy/Caddyfile`'s `:8443` block), **exactly as before any rehearsal**. So no switched-off page, no new
   Route kind, and no change to `releases/recover.ts`: a deleted `routes` row is one the boot never puts back. *(The session that put
   the question to Rich had told him a static page and a `recover.ts` change would be needed; reading the Caddyfile corrected it.)*
4. **What the API reads afterwards — unchanged shapes, said in the descriptions:** `listInstances(production)` lists the rehearsal's
   instance `gone`, `serving: false`; **`getEnvironment(production).instance` is that `gone` instance, NOT `null`**, because
   `servingInstanceOf` falls back to the latest instance when no route names one (`projects/repository.ts:299`) — the shape an archived
   environment already has. *Rejected:* making it `null` (a second rule for one read, and an archive would then disagree). The faculty
   front-end was told this on 2026-09-30 and reads `instance === null || instance.state === 'gone'` as nothing serving.
5. **A take-down that fails is LOUD and writes no row**: a coded refusal (`REHEARSAL_TEARDOWN_FAILED` proposed — registered, declared,
   its message naming what is left serving), an `instance.retire_failed` Event from `retireInstanceRow`, and a `console.error` operator
   line. Running the rehearsal again is the remedy, because it deploys and takes down afresh. **Never a `.catch(() => undefined)`.**
6. **A rehearsal that fails part-way still takes down what it deployed** — a `try`/`finally` around the probe; a deploy that never
   became healthy has no route to remove, and its instance goes the way a failed deploy's always has (check which, and test it).
7. **What stays, deliberately:** the production SERVICES the deploy provisioned (internal, never on the public listener; the launch
   reuses them), and the production SP row in the Manifest IdP (a delete's `deregister-production-sp` removes it; at UBC the rehearsal
   IdP's registration is UBC's). Neither is exposure. **The `Rehearsal` representation gains no field.**
8. **The mock is not in this task.** It has no step-up refusal for ANY operation (no `STEP_UP_REQUIRED` under `packages/mock/src`), so
   refusing one would mean modelling step-up for every guarded operation — sitting 10's mock work, or an FE-n. Told to the front-end.

- [ ] **Step 1: Read what decides it**, confirm the facts above still hold at the sitting's `HEAD`, and confirm Spec action 8's words
  are applied (if not, stop and ask Rich).
- [ ] **Step 2: The failing tests.** (i) An owner's session that has not stepped up is refused `403 STEP_UP_REQUIRED` — assert the
  CODE — and nothing is deployed (no production instance row); stepped up, `200`. The same for an administrator. A token still
  `TOKEN_PERSON_ONLY`. (ii) Docker tier: after a rehearsal that passed, production's hostname on the PUBLIC listener answers the
  wildcard — **assert the body's `manifest OK host=` prefix and `listener=public`, never the status: the wildcard answers `200`** — and
  the rehearsal's instance is `gone`, and the container is not running. (iii) The same after a rehearsal whose probe FAILED.
  (iv) The race: a route naming another instance (a deploy's) under the lock is left alone — deterministic, with the lock, never a
  `Promise.all`. (v) The row's `ranAt` is after the instance's retirement, from the database's clock (ORIENTATION §4 trap 14).
- [ ] **Step 3: Implement**; regenerate; the published description and `launching.md` step 2 say what it does now (*"deployed to
  production's public listener for as long as its sign-in takes, then taken down; a second sign-in (step-up) first"*); tell the
  front-end before the contract commit; commit.
- [ ] **Step 4: The demos.** The journey's admin phase steps up before the rehearsal, keeping the un-stepped refusal as a check;
  `make demo-production` green fresh and re-use; `make demo-frontend` if it presses the rehearsal.
- [ ] **Step 5: Negative controls — commit, break, watch the NAMED test go red, restore:** (a) `assertStepUp` removed from the
  route → (i) red at its code; (b) `launch:rehearse` removed from `STEP_UP_GUARDED` → `step-up-guarded.test.ts` red, and predict
  whether (i) is too (does `assertStepUp` consult the set, or trust its caller?); (c) the take-down removed → (ii) red on the BODY;
  (d) the route check in the take-down removed → (iv) red. **A control that stays green is a question, not a result** (the memory
  *a green control is a question*).

---

## Task 7: A session whose project no longer allows one of its models is narrowed in place

> **`[M3]` (Task 1, 2026-09-29 — F5): `/key/update { key_alias, models }` narrows a live key by its ALIAS alone (`200`), and
> the same key's next call to the withdrawn model is refused 20 ms later — `403 key_model_access_denied`, *"This key can only
> access models=[…]"* — while the kept model answers `200`.** So `narrowAgentKey` is one `POST /key/update` with the alias
> `mf-agent-<sessionId>`; no `/key/list`, no hashed token and no cache window. The Docker case's refusal is `403
> key_model_access_denied`, asserted by its `type`. `fakeLiteLlm` records `/key/update` only.

**Spec action 1 first.** **`[M3]` decides the mechanism**: `/key/update` by alias, or by the hashed token read from `/key/list`.
It also decides whether *"at once"* holds or a cache delay must be named. If `[M3]` found no route that narrows a live key and
refuses the withdrawn model, this task does not start — Decision 23, and Rich re-cuts it.

**Files:**
- Modify: `packages/control-plane/src/ai/agent-keys.ts:185-235` — `narrowAgentKey(ai, sessionId, models)`
- Modify: `packages/control-plane/src/ai/sessions.ts:543-603` — `trimOrEnd`: narrow a session keeping what it may still use; end
  it `models_withdrawn` only when nothing is left
- Modify: `packages/control-plane/src/ai/testing.ts` — `fakeLiteLlm` records `/key/update` (and `/key/list` if `[M3]` needs it)
- Modify: `packages/control-plane/src/observability/{events,event-schemas,examples}.ts`, `db/schema.ts` + migration — `agent_session.narrowed`
- Modify: `docs/api/agents.md` — a narrowed session
- Test: `packages/control-plane/src/ai/sessions.test.ts`, `src/ai/agent-sessions.docker.test.ts`

**Interfaces:**
- Produces:
  - `narrowAgentKey(ai: AgentKeyAdmin, sessionId: string, models: readonly string[]): Promise<void>`, which throws
    `CatalogueError` on a gateway failure, as `revokeAgentKey` does;
  - `agent_session.narrowed` with payload `{ sessionId: string; withdrawn: string[]; models: string[] }` and a sentence naming
    the person: *"Ada Lovelace's agent session can no longer use default-chat and default-chat-reasoning, because the project is
    now confidential; it keeps default-chat-large and default-chat-onprem."*;
  - `AgentSession.models` updated on the row, so `listAgentSessions` answers what the key now holds.
- Consumes: `agentModelsFor`, `classificationFloor` (`ai/models.ts`), and the sweep's three triggers and boot run (*Read this
  first* 18).

- [ ] **Step 1: The failing tests.**
  ```ts
  // ai/sessions.test.ts — against fakeLiteLlm
  it('a project raised to confidential narrows a session to what it may still use, and keeps it', async () => {
    // session holds default-chat, default-chat-reasoning, default-embed, default-chat-large (capable setting allows it)
    await raiseToConfidential(ctx)          // commits a manifest with data.classification: confidential
    const [s] = await listSessions(ctx)
    expect(s.endedAt).toBeNull()
    expect(s.models).toEqual(['default-chat-large', 'default-chat-onprem'])     // what confidential still allows (T1: M3)
    expect(fake.calls('/key/update')).toHaveLength(1)
    expect(fake.calls('/key/delete')).toHaveLength(0)
    expect(events(ctx, 'agent_session.narrowed')[0].detail.withdrawn).toEqual(['default-chat', 'default-chat-reasoning', 'default-embed'])
  })
  it('a session left with nothing it may use is ended models_withdrawn, as before', …)   // the positive control of the old rule
  it('a gateway failure while narrowing leaves the session live and the row unchanged, and the sweep says so', …)
  ```
  **The expected lists are PREDICTIONS** from `agentModelsFor` under `capable`. `[M3]` and a read of `ai/models.ts` fix them
  before the test is written. Never adjust an expectation to what the code answers.
- [ ] **Step 2: Run — predict red** (the session is ended).
- [ ] **Step 3: Implement.** `trimOrEnd` computes `kept = row.models.filter((m) => allowed.has(m) || !served.has(m))`:
  - when `withdrawn` is empty, nothing is done;
  - when `kept` is empty, the existing end;
  - otherwise `narrowAgentKey`, then — **only after the gateway answered** — the row's `models` and the event, in one
    transaction.

  **A gateway failure is logged and the session is LEFT LIVE, not ended.** That is the same trade the sweep makes today, which
  never throws (`api/spec-validation.ts:177-207`). The key still holds the withdrawn model until the next sweep, so the sweep
  retries at every trigger and at boot, and the operator line says so.
- [ ] **Step 4: The Docker case** — *a narrowed key is refused the withdrawn model at once and keeps the rest*: a real session
  on a real LiteLLM, the project raised, then a chat call through the key on a withdrawn model (predict `[M3]`'s refusal) and
  on a kept local one (predict `200`). **Use `default-embed` or `default-chat-onprem`'s 27B only if `[M3]` says the kept model
  is one of them** — never `default-chat-large` (C1: no network in the tier).
- [ ] **Step 5: The migration** (the event type's CHECK), apply it; the four event edits; the guide's paragraph; then
  `contract:write`, `contract:generate`, `docs:write`. Tell the front-end's live session. Commit.
  ```bash
  git add <each path in Files, by name> packages/control-plane/drizzle/<the migration> packages/control-plane/drizzle/meta/_journal.json packages/control-plane/drizzle/meta/<its snapshot> packages/contract/openapi.json packages/contract/src/schema.d.ts docs/api/reference/<each regenerated page> docs/api/llms.txt
  git commit -m "feat(ai): a session whose project no longer allows one of its models is narrowed in place (Rich, 2026-09-29; Spec action 1)"
  ```
- [ ] **Step 6: Negative controls.**
  (a) Make `trimOrEnd` end whenever anything is withdrawn — the old rule. **Predict red**: the first test, at `endedAt`.
  (b) Update the row before the gateway answers. **Predict red**: *a gateway failure while narrowing leaves … the row
      unchanged*.

---

## Task 8: Removing a member revokes their tokens on the project, ends their agent sessions and closes their streams

**Spec action 2 first.**

**Files:**
- Modify: `packages/control-plane/src/tokens/repository.ts` — `revokeTokensOfMember(tx, projectId, userId): Promise<string[]>`
- Modify: `packages/control-plane/src/projects/repository.ts:434-470` — `removeMember` takes the transaction the revoke runs in
- Modify: `packages/control-plane/src/api/routes/project-reads.ts:491-556` — the route revokes, ends and closes
- Modify: `packages/control-plane/src/ai/sessions.ts:461-514` — `endSessionsOf` gains `{ projectId, userId }`; `end_reason`
  gains `member_removed`
- Modify: `packages/control-plane/src/db/schema.ts:594-597` + migration — the `end_reason` CHECK
- Modify: `packages/control-plane/src/observability/event-schemas.ts` — `member.removed`'s payload gains `tokensRevoked: number`
  and `sessionsEnded: number` (additive; **no new event type** — Task 1 Step 8 predicted six types, none of them this task's)
- Modify: `docs/api/frontend.md`, `docs/api/authentication.md` — what removing a person does
- Test: `packages/control-plane/src/api/members.test.ts` (or the file `addMember`'s tests live in), `src/ai/agent-sessions.docker.test.ts`

**Interfaces:**
- Produces: `revokeTokensOfMember`; `endSessionsOf(deps, { projectId, userId }, 'member_removed', …)`.
- Consumes: Task 5's `deps.streams.closeTokens(ids)` and `closePerson(projectId, userId)`.

- [ ] **Step 1: The failing tests.**
  ```ts
  it('removing a member revokes their tokens on THIS project, and only theirs', async () => {
    // ta holds a token on the project and one on another project; the owner holds one on the project
    await removeMember(ctx, ta.id)                       // stepped up, as the route requires
    expect(await tokenState(taTokenHere)).toBe('revoked')
    expect(await tokenState(taTokenElsewhere)).toBe('live')     // another project's is not this removal's
    expect(await tokenState(ownerToken)).toBe('live')
    // and the revoked token is refused at once
    expect(refusal(await get(ctx, '/v1/projects/…', { token: taTokenHere })).code).toBe('UNAUTHENTICATED')
  })
  it('removing a member ends their agent sessions on the project — token-started and browser-started — member_removed', …)
  it('removing a member closes their token streams 4401 and their session streams 4404', …)
  it('removing the last owner is still refused, and revokes nothing', …)     // LastOwnerError — the transaction rolls back
  ```
  **Why the last one:** the revoke now shares the removal's transaction. A refused removal must leave every token live —
  otherwise a refusal has side effects.
- [ ] **Step 2: Run — predict red.**
- [ ] **Step 3: Implement.**
  - One transaction: `removeMember`, then `revokeTokensOfMember` — `UPDATE delegated_tokens SET revoked_at = now() WHERE
    project_id = $1 AND user_id = $2 AND revoked_at IS NULL RETURNING id`.
  - Then, outside it, `closeTokens(ids)` and `closePerson(projectId, userId)` FIRST (no gateway), then
    `endSessionsOf({ projectId, userId })` — Task 5's order, for Task 5's reason.
  - `member.removed` carries both counts.
  - A gateway failure ending sessions answers the `503 AI_CATALOGUE_DISABLED` `revokeToken` already declares, **with the member
    already removed and the tokens already revoked** — the description says so, as `revokeToken`'s should (the front-end
    enablement plan's deferred re-review line).
- [ ] **Step 4: The Docker case** — a real session a removed member's token started: after the removal, LiteLLM refuses its
  key (measured by calling it, never by reading the row).
- [ ] **Step 5: Migration, contract, guides; tell the front-end's session; commit.**
  ```bash
  git add <each path in Files, by name> packages/control-plane/drizzle/<the migration> packages/control-plane/drizzle/meta/_journal.json packages/control-plane/drizzle/meta/<its snapshot> packages/contract/openapi.json packages/contract/src/schema.d.ts docs/api/reference/<each regenerated page> docs/api/llms.txt
  git commit -m "feat(members): removing a member revokes their tokens on the project, ends their agent sessions and closes their streams (Rich, 2026-09-29; Spec action 2)"
  ```
- [ ] **Step 6: Negative controls.**
  (a) Drop the `project_id` condition from `revokeTokensOfMember`. **Predict red**: *…and only theirs*, at `taTokenElsewhere`.
  (b) Run the revoke outside the removal's transaction. **Predict red**: *removing the last owner is still refused, and revokes
      nothing*.
  (c) Skip `endSessionsOf` for browser-started sessions (`tokenId` only). **Predict red**: the second test's browser-started
      half.

---
## Task 8a: FE-39 — who may build: faculty, or an administrator named by a setting (Rich's, confirmed 2026-09-29)

**Spec action 7 is APPLIED** (2026-09-29, at Rich's word) — FE-39 and its three choices are Rich's (Decisions 28–30). **Its own sitting, 5a**: it moves every test fixture and demo that builds as someone other than a
faculty member, which is the whole unit tier's `withProjectServer` owner.

**Files:**
- Modify: `packages/control-plane/src/sso/platform.ts:44-62` — `CONTROL_PLANE_ATTRIBUTES` gains `eduPersonAffiliation` (six names).
  The comment explaining its omission is rewritten, as Spec action 7 rewrites §9.
- Modify: `packages/control-plane/src/identity/saml.ts` — `toIdentity` reads the attribute's values; `upsertUserFromAssertion`
  (`:584`) writes `affiliations` and `affiliations_seen_at` every time, and reconciles the role to `MANIFEST_ADMIN_PUIDS` when it is
  set (a `RoleChange` per change)
- Create: `packages/control-plane/src/identity/builders.ts` — `mayBuild(user, config): boolean`, the ONE predicate
- Modify: `packages/control-plane/src/config.ts` — `MANIFEST_ADMIN_PUIDS` (default empty); `.env.example` its commented line.
  **No setting for the affiliation** (Decision 30): `builders.ts` holds the one literal, `'faculty'`.
- Modify: `packages/control-plane/src/db/schema.ts` + migration — `users.affiliations jsonb NOT NULL DEFAULT '[]'`,
  `users.affiliations_seen_at timestamptz`
- Modify: `packages/control-plane/src/api/routes/me.ts` (or wherever `getMe` lives) and `api/representations/` — `Me.mayBuild`
- Modify: `packages/control-plane/src/api/routes/projects.ts` (`createProject`), `api/routes/intake.ts` (`startIntakeSession`),
  `api/routes/project-reads.ts` (`addMember`'s target) — the refusals
- Modify: `packages/control-plane/src/identity/testing.ts` — the test people carry affiliations: `bio_prof` faculty;
  `bio_student` and `unrelated_user` as their roles say
- Modify: `infra/idp/config/authsources.php` — `colleague` (faculty), a second faculty test user (Decision 31). A single-file bind
  mount: edit in place, restart the IdP, read it back.
- Modify: `packages/journey/src/frontend.ts`, `packages/journey/src/token.ts`, `scripts/demo-frontend.sh` — adding a member adds
  `colleague`; `student` is shown refused `MEMBER_MAY_NOT_BUILD`
- Modify: `packages/mock/src/server.ts`, `fixtures.ts` — `mayBuild: true`, and `MANIFEST_MOCK_MAY_BUILD=0` answering `false` and
  refusing the three operations (FE-39's ask 6)
- Modify: `docs/api/frontend.md`, `docs/api/authentication.md` — who may build, and the codes
- Test: `src/identity/builders.test.ts`, `src/identity/saml.test.ts`, `src/api/projects.test.ts`, `src/api/intake.test.ts`,
  `src/api/members.test.ts`, `src/sso/platform.test.ts` (six names), `src/boot.docker.test.ts` (the release list),
  `src/identity/saml.docker.test.ts` (a real sign-in carries the affiliation)

**Interfaces:**
- Produces: `mayBuild(user: { role: 'admin' | 'member'; affiliations: readonly string[] }): boolean` — `role === 'admin' ||
  affiliations.includes('faculty')`; `Me.mayBuild: boolean`; `403 BUILDING_NOT_OPEN` (family `BuildingError`, new) and
  `409 MEMBER_MAY_NOT_BUILD`.
- Consumes: Task 8's `removeMember` (unchanged), and the front-enablement plan's `cwl_login` rule.

- [ ] **Step 1: The failing tests.**
  ```ts
  it('a faculty member may build; a student may not, and is told so by code', async () => {
    const student = await signIn(deps, { puid: 'stu000001', affiliations: ['student'] })
    expect((await get(ctx, '/v1/me', student)).json().mayBuild).toBe(false)
    expect(refusal(await createProject(ctx, student, 'st-app')).code).toBe('BUILDING_NOT_OPEN')
    expect(refusal(await startIntake(ctx, student)).code).toBe('BUILDING_NOT_OPEN')
    const prof = await signIn(deps, { puid: 'ins000001', affiliations: ['faculty'] })
    expect((await get(ctx, '/v1/me', prof)).json().mayBuild).toBe(true)
    expect((await createProject(ctx, prof, 'prof-app')).statusCode).toBe(201)     // the positive control
  })
  it('the affiliation is refreshed at every sign-in — faculty last time, not this time, may not build', …)
  it('an assertion without eduPersonAffiliation signs the person in, and they may not build', …)
  it('an administrator named by MANIFEST_ADMIN_PUIDS may build, whatever their affiliation, and the role change is audited', …)
  it('with MANIFEST_ADMIN_PUIDS set, an administrator absent from it is reconciled to member at sign-in, audited', …)
  it('with MANIFEST_ADMIN_PUIDS empty, admin-grant.sh’s grant stands (today’s procedure)', …)
  it('a faculty owner adding a student is refused MEMBER_MAY_NOT_BUILD, naming them; adding a faculty colleague works', …)
  it('a person who stops being faculty keeps their memberships and their tokens, and cannot start anything new', …)  // Decision 29, Rich's
  it('only faculty exactly: staff, employee, member, Faculty and "faculty " may not build', …)                    // Decision 30, Rich's
  it('a token a faculty member minted keeps working after their session is gone', …)
  ```
- [ ] **Step 2: Run — predict red**, and **predict the WIDE red** before running the whole unit tier: every test whose project owner
  is built without an affiliation. Count them first with `grep -rn "sessionFor\|loginAs\|withProjectServer" src | wc -l`, and
  record the count against the red.
- [ ] **Step 3: Implement** — the predicate, the sign-in writer, the refusals, the fixtures' affiliations, and the migration.
- [ ] **Step 4: The demos** — `demo-frontend` step 7 and `demo-token` add `colleague`, and show `student` refused. Run both on
  driver 1 once (**the control plane restarted on driver 1 for it, and back to what Rich chose after**).
- [ ] **Step 5: The contract, the mock, the guides; tell the front-end's live session** (it waits on `mayBuild`); commit.
  ```bash
  git add <each path in Files, by name> packages/control-plane/drizzle/<the migration> packages/control-plane/drizzle/meta/_journal.json packages/control-plane/drizzle/meta/<its snapshot> packages/contract/openapi.json packages/contract/src/schema.d.ts docs/api/reference/<each regenerated page> docs/api/llms.txt
  git commit -m "feat(identity): FE-39 — only faculty build, and administrators named by a setting; mayBuild on getMe (Spec action 7)"
  ```
- [ ] **Step 6: Negative controls.**
  (a) `mayBuild` returning true. **Predict red**: the first test, at `BUILDING_NOT_OPEN` — its positive control stays green.
  (b) The sign-in writer keeping the old affiliations when the attribute is absent. **Predict red**: *an assertion without
      eduPersonAffiliation … may not build*.
  (c) The admin list read by CWL login instead of PUID. **Predict red**: a case where a login is reassigned (the cwl_login rule's
      own test shape) — write it in Step 1.

---

## Task 9: The three clocks' records — the staging registration, "I've sent it", and *waiting since*

> **`[S9]` (Rich, 2026-09-30, Spec action 9 — APPLIED, `844605b`): THE THREE RUN IN UBC'S ORDER, AND THE OWNER'S *"I'VE SENT IT"* IS
> GATED IN IT.** Rich: *"app developed -> apply for PIA -> once a PIA is given -> provide info to IAM team -> once IAM approval and
> implementation -> we can now go on the staging environment -> once tested -> send production details to IAM team -> once received
> and implemented -> go live in production"*, and *"Gate each step"*. So `submitIamRegistration` gains **two `409`s** (name them in
> the `LaunchRecordError` family, with their remedies in `api/error-codes.ts`; suggested `LAUNCH_PIA_NOT_APPROVED` and
> `LAUNCH_STAGING_NOT_REGISTERED`):
> - **a STAGING submission is refused unless the project's privacy assessment is `approved` AND has its reference**
>   (`external_ticket_ref`, the PIA number — Spec action 4's package carries it, Task 10);
> - **a PRODUCTION submission is refused unless the staging registration is `active`** (*"tested"* is the owner's judgement, not
>   measured).
>
> **An administrator's `launch:record` of UBC's answer is NEVER refused for order** — UBC's decision is a fact (Spec action 9's §9
> words) — which also keeps `make demo-production` and the demos that record production `active` directly green. **An app with
> `auth.provider: none` registers nothing**; its privacy assessment still comes first for production. **The laptop's demo** (Task 15)
> records staging `active` as an administrator before the production submission. Each refusal gets its refusal test, a positive control
> (the same submission after the prerequisite is recorded), and a negative control. **The faculty front-end designs the sequence in its
> F5b** (walk-through moment 10 was *"three long clocks, started early"*): tell it the two codes before the contract commit.

> **`[S4a]` (sitting 4a, 2026-09-30 — Task 6b, `fa02bbc`, and its final wave): `launch:rehearse` IS ALREADY IN `CAPABILITIES`, `OWNER`
> and `PERSON_ONLY`** (`projects/authz.ts`), and in the console's `everyCapability([...])` and its own `PERSON_ONLY` set
> (`packages/console/src/screens/tokens.tsx`) — `launch:submit` goes beside it, and `person-only.test.ts`'s set keeps it. **The
> published person-only lists are now HELD BY A TEST** (the sitting's final wave, the whole-branch review's I2): adding
> `launch:submit` to `PERSON_ONLY` goes red until it is named in `mintToken`'s description (`api/routes/tokens.ts`),
> `MintTokenRequest.capabilities`' (`api/representations/tokens.ts`), and — by the test's phrase map — the `TOKEN_PERSON_ONLY`
> summary (`api/error-codes.ts`) and `docs/api/agents.md`'s *a person's alone* list. **Add all four to this task's Files**, and a phrase
> for `launch:submit` to the test's map. (How `project:delete` went missing from two of them for a whole plan.)

> **`[M8]` (Task 1, 2026-09-29 — F13, F14, F15):**
> - **A draft recorded by an administrator FAILED the next SANDBOX build** (`SPEC_ATTRIBUTE_NOT_REGISTERED`, naming the four
>   attributes the draft did not list), and the same build succeeded once the record was `active` with all five — *Read this
>   first* 7, measured with its positive control.
> - **The build check's tests are in `releases/build-attributes.test.ts`**: Step 1's first two tests go THERE, not in
>   `build.test.ts`.
> - **An owner refused `launch:record` is told *"Ask a project owner to grant you the role this action needs"***. Step 3 gives a
>   platform-administrator-only capability (`launch:record`, and `release:approve` — check its hint too) a refusal hint that
>   names an administrator. Add *an owner refused launch:record is told an administrator records it*.

**Spec action 3 first.** This task builds the records and the owner's submission. The DRAFT an owner submits is Task 10's and
Task 11's, so this task's tests write a row's package directly (`launch/testing.ts`'s new `withDraft(db, …)`). **Until Task 10
lands, the submission routes have no client that can meet their precondition** — they are `DELIBERATELY_UNCALLED` naming Task 13.

**Files:**
- Modify: `packages/control-plane/src/db/schema.ts:659-733` + a custom migration (predicted `0044` — `0040` Task 2, `0041` Task 4, `0042` Task 7, `0043` Task 8):
  - `iam_registrations.environment_kind text NOT NULL DEFAULT 'production' CHECK (environment_kind IN ('staging','production'))`,
    every existing row backfilled `production`;
  - the UNIQUE on `project_id` replaced by UNIQUE `(project_id, environment_kind)`;
  - `submitted_at timestamptz`, `submitted_by uuid REFERENCES users(id)` and `generated_package jsonb` on `iam_registrations`;
  - `submitted_at` and `submitted_by` on `privacy_assessments`;
  - `registered_attributes` DEFAULT `'[]'`, and its CHECK becomes
    `registered_at IS NULL OR jsonb_array_length(registered_attributes) > 0`.
- Modify: `packages/control-plane/src/launch/records.ts` — every read and write keyed by environment;
  `submitIamRegistration`, `submitPrivacyAssessment`
- Modify: `packages/control-plane/src/launch/transitions.ts` — `SUBMIT_ARROWS`
- Modify: `packages/control-plane/src/launch/readiness.ts` — `since` on every item it can date; the production row only
- Modify: `packages/control-plane/src/releases/build.ts:305-345` — the production row, and only when `registered_at` is set
- Modify: `packages/control-plane/src/projects/authz.ts` — `launch:submit` in `CAPABILITIES`, owner/collaborator/admin grants,
  `PERSON_ONLY`
- Modify: `packages/control-plane/src/api/routes/launch.ts`, `api/representations/launch.ts`
- Modify: `packages/control-plane/src/observability/{events,event-schemas,examples}.ts` — `iam_registration.submitted`,
  `privacy_assessment.submitted`
- Modify: `packages/console/src/screens/tokens.tsx` (`everyCapability`), `packages/console/src/coverage.test.ts`
  (`DELIBERATELY_UNCALLED`, naming Task 13)
- Test: `src/launch/records.test.ts`, `src/launch/readiness.test.ts`, `src/api/launch.test.ts`, `src/releases/build-attributes.test.ts` (`[M8]`),
  `src/projects/person-only.test.ts`, `src/api/authz-contract.ts`

**Interfaces:**
- Produces:
  ```ts
  type RegistrationEnvironment = 'staging' | 'production'
  getIamRegistration(db, projectId, environment: RegistrationEnvironment): Promise<IamRegistrationRow | undefined>
  submitIamRegistration(db, { projectId, environment, userId, sentAt?: string /* YYYY-MM-DD */, reference?: string }): Promise<IamRegistrationRow>
  submitPrivacyAssessment(db, { projectId, userId, sentAt?, reference? }): Promise<PrivacyAssessmentRow>
  export const SUBMIT_ARROWS: { iam: ReadonlySet<IamState>; pia: ReadonlySet<PiaState> }   // the states launch:submit may move FROM
  ```
  The routes:
  - `submitIamRegistration` — `POST /v1/projects/{projectId}/launch-records/iam-registration/{environment}/submission`;
  - `submitPrivacyAssessment` — `POST /v1/projects/{projectId}/launch-records/privacy-assessment/submission`.

  Both are `credential: 'session'`, `requireSession`, capability `launch:submit`, and answer `200` with the record.
  - `recordIamRegistration`'s request gains an optional `environment` (default `production`).
  - `LaunchRecords` gains `stagingRegistration: IamRegistration | null`.
  - `IamRegistration` gains `environment`, `submittedAt`, `submittedBy: { id, displayName } | null` and `createdAt`.
  - `PrivacyAssessment` gains `submittedAt`, `submittedBy` and `createdAt`.
  - `LaunchReadinessItem` gains `since: string | null`.
- Consumes: nothing from Tasks 2–8.

- [ ] **Step 1: The failing tests.**
  ```ts
  // releases/build-attributes.test.ts — Review Focus 1 (`[M8]`: where the build check's tests live)
  it('a draft never fails a build, and a registered production row still does', async () => {
    await withDraft(db, { projectId, environment: 'production', attributes: ['ubcEduCwlPuid'] })
    await commitManifest(ctx, { auth: { provider: 'cwl', attributes: ['ubcEduCwlPuid', 'mail'] } })
    expect((await build(ctx)).status).toBe('succeeded')                          // a draft gates nothing
    await recordAsAdmin(ctx, { environment: 'production', state: 'submitted' })
    await recordAsAdmin(ctx, { environment: 'production', state: 'active', registeredAttributes: ['ubcEduCwlPuid'] })
    expect((await build(ctx)).failure).toMatch(/mail/)                           // the positive control: registered → checked
  })
  it('a staging registration, even active, never fails a build', …)
  // api/launch.test.ts
  it('an owner says the production registration was sent; it waits since that day, and the checklist says so', async () => {
    await withDraft(db, { projectId, environment: 'production' })
    const res = await submit(ctx, 'production', { sentAt: '2026-10-01', reference: 'IAM-2026-0500' }, ownerSession)
    expect(res.json()).toMatchObject({ state: 'submitted', submittedAt: '2026-10-01T…', submittedBy: { displayName: 'Bio Prof' } })
    const item = (await readiness(ctx)).items.find((i) => i.id === 'iam-registration')!
    expect(item).toMatchObject({ state: 'unmet', since: '2026-10-01T…' })
    expect(item.why).toMatch(/sent to UBC IAM on 1 October 2026/)
  })
  it('refuses a submission with no draft — LAUNCH_DRAFT_REQUIRED', …)
  it('refuses a sentAt in the future, or before the draft — LAUNCH_SENT_AT_INVALID', …)
  it('refuses a token outright — TOKEN_PERSON_ONLY — and a collaborator may submit', …)
  it('an owner cannot record UBC’s answer: submitted → active is launch:record’s alone — FORBIDDEN', …)
  it('a registration is per environment: staging and production are two records, one read', …)
  it('the administrator’s record route still works unchanged, and defaults to production', …)   // P6a's tests stay green too
  it('refuses a second submission of a submitted record — LAUNCH_TRANSITION_INVALID', …)
  ```
- [ ] **Step 2: Run — predict red.** Then **`pnpm exec vitest run --project unit src/launch/ src/api/launch.test.ts
  src/releases/build-attributes.test.ts` alone** — predict ONLY the new tests red. P6a's and P6b's record tests are what hold the
  administrator's path.
- [ ] **Step 3: Implement.**
  - **The migration** — `db:generate --custom`, written by hand, read back with `\d iam_registrations` — then applied.
  - **`build.ts`** reads `environment_kind = 'production' AND registered_at IS NOT NULL`. Its doc comment's *"UNIQUE on
    project_id"* sentence is rewritten, because it is no longer true.
  - **`readiness.ts`**:
    - the production row everywhere it read *the* row;
    - `since` is `submitted_at` for `submitted` and `change_requested`, `registered_at` for `active`, and `approved_at` for an
      approved PIA — otherwise null;
    - a `why` that names the day in words. Use `Intl.DateTimeFormat('en-CA', { dateStyle: 'long', timeZone:
      'America/Vancouver' })` — the Vancouver-day trap, the front-end enablement plan's F23: format the stored instant, never
      "now's" offset.
  - **`transitions.ts`**: `SUBMIT_ARROWS.iam = {draft, change_requested, expired}`, `SUBMIT_ARROWS.pia = {draft}`. A submission
    from anywhere else is `409 LAUNCH_TRANSITION_INVALID`, the existing code.
  - **`sentAt`** is a date. It defaults to today in Vancouver, and is stored as that day's noon in Vancouver, so the day is
    right in every zone. It is refused when after today or before the row's `created_at` day.
- [ ] **Step 4: The contract** — `contract:write`, `contract:generate`, `docs:write`. The authz matrix's rows for both routes,
  the person-only row, the journey's `OUTSIDE_THE_JOURNEY` lines (until Task 15's demo adds them to `JOURNEY`). Tell the
  front-end's live session. Commit.
  ```bash
  git add <each path in Files, by name> packages/control-plane/drizzle/<the migration> packages/control-plane/drizzle/meta/_journal.json packages/control-plane/drizzle/meta/<its snapshot> packages/contract/openapi.json packages/contract/src/schema.d.ts docs/api/reference/<each regenerated page> docs/api/llms.txt packages/journey/src/coverage.ts
  git commit -m "feat(launch): the three clocks' records — a staging registration, an owner's \"I've sent it\" (launch:submit, person-only), and waiting since (Spec action 3)"
  ```
- [ ] **Step 5: Negative controls.**
  (a) Revert `build.ts`'s `registered_at IS NOT NULL`. **Predict red**: *a draft never fails a build…*, at `'succeeded'` — and
      its positive control half stays green.
  (b) Remove `launch:submit` from `PERSON_ONLY`. **Predict red**: `person-only.test.ts`, AND *refuses a token outright —
      TOKEN_PERSON_ONLY*, at the code (not the status: `requireSession` still refuses first, with `TOKEN_CREDENTIAL_REFUSED` —
      **predict which code the test sees before running it**; the P6a lesson is that two layers answer two codes).
  (c) Add `submitted` to `SUBMIT_ARROWS.iam` (a re-submission allowed). **Predict red**: *refuses a second submission of a
      submitted record — LAUNCH_TRANSITION_INVALID*.

---

## Task 10: D19's registration package — UBC's structure, Manifest's values, a justification for every attribute

> **`[S6]` (sitting 6, 2026-10-01 — Task 9, `b2c75e6` and its fix wave `db2ddbf`): WHAT TASK 10 BUILDS ON, AND WHAT IT NOW OWNS.**
> - **The row.** `iam_registrations` is per environment (`environment_kind`, UNIQUE `(project_id, environment_kind)`, migration `0045`).
>   `getIamRegistration(db, projectId, environment)` takes the environment, REQUIRED. A draft is a row in `draft` with
>   `registered_attributes` `[]` (its default; the CHECK holds only a row with `registered_at` set) and `generated_package` — null until
>   drafted. **`submitIamRegistration` refuses a null package `409 LAUNCH_DRAFT_REQUIRED`**, so Task 10's draft is what unlocks it.
> - **The fixture.** `launch/testing.ts`'s `withDraft` writes a PLACEHOLDER package `{ placeholder, attributes }` straight to the row.
>   Task 10 owns the real shape: change `withDraft` to write it (or call the drafting function), and read every Task 9 test that uses it.
> - **Review Focus 1's checklist half is Task 10's** (the whole-branch review's I4): *"the checklist's `iam-registration` item says the
>   draft no longer covers the app, and to draft again"*. Task 9 could not — it needs the package's attribute list. `iamItem` must compare
>   a DRAFT's (or a submitted, unregistered record's) attributes with the candidate's and say so, with its refusal-free test and a
>   positive control. `releases/build.ts`'s comment says it will.
> - **The draft takes the submission's row lock** (I1): `submitIamRegistration` reads the record `FOR UPDATE` inside one transaction
>   (and the assessment and staging's registration `FOR SHARE`). A re-draft from `change_requested` or `expired` must lock the same row,
>   or a draft and a submission interleave — the deterministic test shape is `api/launch.test.ts`'s `holdingThen`.
> - **The day's lower bound reads the row's `created_at`** (the review's M4). After a re-draft that is the FIRST draft's day. Store a
>   `generatedAt` in the package and make `sentDay` (`launch/records.ts`) read it.
> - **UBC's order, as built**: NEITHER registration is sent until the assessment is approved with its reference (`409
>   LAUNCH_PIA_NOT_APPROVED` — the spec's words, wider than `[S9]`, the review's I3); production's also waits for staging `active`. The
>   package's PIA number is `privacy_assessments.external_ticket_ref` — and an administrator's record that omits a ticket now KEEPS it.
> - `409 LAUNCH_RECORD_SUBMITTED` (Decision 9's re-draft refusal) is NOT registered yet: the registry refuses a code the source never
>   throws — Task 10 adds it with its thrower. `IamRegistration` has no `package` field yet; Task 10 adds it to the representation.
> - **Who may build** (sitting 5a): a test that creates a project or adds a person THROUGH THE ROUTE does it as someone who may build.

> **`[S9]` (Rich, 2026-09-30, Spec action 4 as applied):** the package also carries **the privacy assessment's reference — the PIA
> number, which UBC IAM asks for** (§9's package list). And §2's asset row and §9's *Certificate lifecycle* now say the tool's
> STRUCTURE is used, never its code, and that Manifest issues the certificate itself (D20) — the `sso/` renderer's comments should say
> the same.

> **`[M6]` and `[M9]` (Task 1, 2026-09-29 — F11, F12).** **The structure** is `spikes/launch-baseline/probes/ubc-structure.xml`,
> the tool's own output. Copy it into the test's fixture directory as `UBC_STRUCTURE_ORDER`'s source.
> - **Keep**: the `md`, `ds` and `alg` namespaces; the top `md:Extensions` with the tool's default lists (sha256, sha384, sha512;
>   rsa-sha256/384/512 and ecdsa-sha256); both `KeyDescriptor`s — `ds:KeyName` is the hostname, `X509SubjectName` is the
>   certificate's own subject, and the encryption descriptor carries aes128-gcm, aes256-gcm and aes256-cbc; `Organization`;
>   `ContactPerson technical`.
> - **Change**: `protocolSupportEnumeration` is SAML 2.0 alone; ONE `SingleLogoutService` (HTTP-Redirect, the app's
>   `auth.logout`) and ONE `AssertionConsumerService` (HTTP-POST, the app's `auth.callback`, index 1, `isDefault="true"`); a
>   second `ContactPerson contactType="support"` for the platform's contacts.
> - **Drop**: `init:RequestInitiator` and `ManageNameIDService` (Shibboleth daemon paths).
> - **No `NameIDFormat`**, as the tool writes none.
>
> **The tool's `entityID` is the app URL and its `ID` is random — ours are §9's derived id and a hash.** **The search**
> (Decision 14) reads `.js`, `.mjs`, `.ts` and `.html`, the served `public/` included: the proof app reads `mail` only in
> BROWSER code (`public/app.js:25`, `me.attributes?.mail`). A read found only under `public/` justifies the attribute as *"shown
> to the person in the browser"*. The skeleton exposes `req.user.user.<name>`.

**Spec action 4 first.** **`[M6]`** gives the XML's structure, and **`[M9]`** the names the search looks for.

**Files:**
- Create: `packages/control-plane/src/sso/registration-xml.ts` — `renderRegistrationMetadata`
- Modify: `packages/control-plane/src/sso/index.ts` — exports it, `ensureSpKeypair` and `deriveSpEntity` for `launch/`
- Create: `packages/control-plane/src/launch/package.ts` — `ATTRIBUTE_PURPOSES`, `assemblePackage`
- Create: `packages/control-plane/src/launch/usage.ts` — `findAttributeUses`
- Modify: `packages/control-plane/src/launch/records.ts` — `draftIamRegistration`
- Modify: `packages/control-plane/src/projects/authz.ts` — `launch:draft` (owner, collaborator, admin; mintable; neither
  privileged nor person-only)
- Modify: `packages/control-plane/src/config.ts` — `MANIFEST_LAUNCH_CONTACTS`; `.env.example` its commented line
- Modify: `packages/control-plane/src/api/routes/launch.ts`, `api/representations/launch.ts` — `draftIamRegistration`,
  `IamRegistrationPackage`
- Modify: the event files + migration — `iam_registration.drafted`
- Test: `src/sso/registration-xml.test.ts`, `src/launch/package.test.ts`, `src/launch/usage.test.ts`, `src/api/launch.test.ts`,
  `src/sso/registration.docker.test.ts` (the certificate a staging deploy registers is the package's)

**Interfaces:**
- Produces:
  ```ts
  // sso/registration-xml.ts
  export interface RegistrationXmlInput {
    entityId: string; acsUrl: string; sloUrl: string
    certificatePem: string                       // the environment's own — never a private key
    organization: { name: string; displayName: string; url: string }
    contacts: { technical: Contact[]; support: Contact[] }   // Contact = { name: string; email: string }
  }
  export function renderRegistrationMetadata(input: RegistrationXmlInput): string

  // launch/usage.ts
  export interface AttributeUse { path: string; line: number }
  export function findAttributeUses(
    tree: { path: string; text: string }[],        // already read and bounded by the caller
    names: readonly string[],
  ): Record<string, AttributeUse[]>

  // launch/package.ts
  export const ATTRIBUTE_PURPOSES: Readonly<Record<AttributeName, string>>    // the bridge's seven friendly names
  export interface PackageAttribute {
    name: string; oid: string; purpose: string; usedAt: AttributeUse[]; justification: string; unused: boolean
  }
  export interface RegistrationPackage {
    environment: 'staging' | 'production'; generatedAt: string; fromCommit: string
    entityId: string; acsUrl: string; sloUrl: string
    certificate: { pem: string; fingerprint: string; expiresAt: string }
    attributes: PackageAttribute[]; usedAtTruncated: boolean
    contacts: { technical: Contact[]; support: Contact[] }
    metadataXml: string
    warnings: string[]
  }
  ```
  **The route**: `draftIamRegistration` — `POST /v1/projects/{projectId}/launch-records/iam-registration/{environment}/draft`,
  capability `launch:draft`, a token allowed. It answers `200` with the `IamRegistration`, which gains
  `package: RegistrationPackage | null`. It is refused:
  - `409 LAUNCH_NOT_CWL` when the manifest it draws from is not `auth.provider: cwl`;
  - `409 LAUNCH_RECORD_SUBMITTED` while the record is `submitted` or `active`.
- Consumes: Task 9's environment-keyed record, and `candidateFor` (`launch/candidate.ts:27`).
  - **Production is drawn from the launch candidate's spec** — the release serving staging, healthy — else from the newest
    valid manifest, with a warning saying so.
  - **Staging is drawn from the newest valid manifest.**
  - The tree is read with `listTreeIn` and `readTextIn` (`source/reading.ts:150`, `:244`) at that spec's commit.

- [ ] **Step 1: The failing tests.**
  ```ts
  // sso/registration-xml.test.ts
  it('renders UBC’s structure with Manifest’s values, and escapes what it is given', () => {
    const xml = renderRegistrationMetadata({ ...INPUT, organization: { ...ORG, displayName: 'Arts & Science <One>' } })
    expect(elementOrder(xml)).toEqual(UBC_STRUCTURE_ORDER)        // recorded by [M6], as a fixture beside the test
    expect(xml).toContain('entityID="https://manifest.internal/sp/lp-sample/staging"')
    expect(xml).toContain('Location="https://lp-sample.staging.manifest.internal/auth/saml/callback"')
    expect(xml).toContain('Arts &amp; Science &lt;One&gt;')
    expect(xml).not.toMatch(/PRIVATE KEY/)
    expect(xml).not.toMatch(/Shibboleth\.sso/)                     // the tool's daemon paths are never ours (Decision 12)
  })
  // launch/usage.test.ts
  it('finds a friendly name read as a property, never inside a longer word or the bridge itself', () => {
    const uses = findAttributeUses([
      { path: 'server.js', text: 'const who = req.user.mail\nconst mailbox = 1' },
      { path: 'auth/attributes.js', text: 'mail: …' },               // the blueprint's own file: excluded by the caller's list
    ], ['mail'])
    expect(uses.mail).toEqual([{ path: 'server.js', line: 1 }])
  })
  it('a name in prose or a comment is not a read', () => {
    const uses = findAttributeUses([{ path: 'server.js', text: "// we email the user's mail address\nconst to = user.mail" }], ['mail'])
    expect(uses.mail).toEqual([{ path: 'server.js', line: 2 }])
  })
  // api/launch.test.ts
  it('drafts the staging package: staging’s entity, the certificate staging registers with, a justification per attribute', …)
  it('a package’s certificate is the one the environment registers with', …)   // draft, then deploy staging (fake driver): sso.registered's certificateFingerprint equals package.certificate.fingerprint
  it('an attribute the app never reads is flagged unused, with a warning to remove it before sending', …)
  it('a submitted package is never regenerated — LAUNCH_RECORD_SUBMITTED — and a change_requested one is', …)
  it('no answer carries a private key', …)        // the whole body, every environment, every state
  it('refuses an app that registers nothing — LAUNCH_NOT_CWL', …)
  it('production is drawn from the launch candidate, and says so when there is none', …)
  ```
- [ ] **Step 2: Run — predict red.**
- [ ] **Step 3: Implement**, in this order, each file's tests green before the next:
  - `registration-xml.ts` — string building exactly as `[M6]` recorded. One HTTP-POST ACS at index 0 (`isDefault="true"`), one
    HTTP-Redirect SLO, `KeyDescriptor use="signing"` and `use="encryption"` with the certificate's base64 body, `NameIDFormat`
    transient, the `alg:` extensions, `Organization`, and one `ContactPerson` per contact. The `ID` is derived from the entity
    id's hash, **never `Math.random`**, so the same input renders the same bytes.
  - `usage.ts` — `\b<name>\b` preceded by `.`, `['` or `["` on each line. Decision 14's bound (200 files, 2 MiB) is applied by
    the CALLER, which reads text files only (`readTextIn` refuses binary), skips the blueprint's own `auth/` files, and sets
    `usedAtTruncated`.
  - `package.ts` — the purposes (one plain sentence each, reviewed against §9's *"precisely what a faculty member cannot write
    unaided"*), and the justification: *"<purpose> The app reads it in server.js:12 and routes/posts.js:40."* or *"The app asks
    for it and does not read it anywhere Manifest looked — remove it from `auth.attributes` before you send this."*
  - `draftIamRegistration`:
    1. `deriveSpEntity` for the environment;
    2. `ensureSpKeypair` for the environment — refused `409 LAUNCH_RECORD_SUBMITTED` before it is reached when the record is
       sent;
    3. the contacts: the owner as technical, the collaborators beside, and `MANIFEST_LAUNCH_CONTACTS` — default, the oldest
       administrator — as support;
    4. store `generated_package` on the row (state `draft`, created if absent; `entity_id`, `acs_url` and `slo_url` from the
       package);
    5. publish `iam_registration.drafted`.
- [ ] **Step 4: The Docker case** — `sso/registration.docker.test.ts` gains *the certificate a staging deploy registers is the
  package's*: draft staging, then a real deploy to staging, then read the Manifest IdP's SP row. Its `certData` is the package's
  certificate body.
- [ ] **Step 5: `xmllint --noout`** on a rendered package in the Docker tier (the host has it; the unit tier does not assume it).
- [ ] **Step 6: The contract, the matrix, the journey, the console's `everyCapability`; tell the front-end's session; commit.**
  ```bash
  git add <each path in Files, by name> packages/control-plane/drizzle/<the migration> packages/control-plane/drizzle/meta/_journal.json packages/control-plane/drizzle/meta/<its snapshot> packages/contract/openapi.json packages/contract/src/schema.d.ts docs/api/reference/<each regenerated page> docs/api/llms.txt packages/journey/src/coverage.ts packages/console/src/screens/tokens.tsx packages/console/src/coverage.test.ts .env.example
  git commit -m "feat(launch): D19's registration package — UBC's structure, the environment's own certificate, every attribute justified by where the app reads it (Spec action 4)"
  ```
- [ ] **Step 7: Negative controls.**
  (a) Render the production entity for a staging draft. **Predict red**: *drafts the staging package…*, at the entity id.
  (b) Let `draftIamRegistration` run in `submitted`. **Predict red**: *a submitted package is never regenerated*.
  (c) Put `privateKeyPem` in `certificate.pem`. **Predict red**: *no answer carries a private key* — and
      `registration-xml.test.ts`'s `not.toMatch(/PRIVATE KEY/)`.
  (d) Drop the property-access rule in `usage.ts` (the leading `.`, `['` or `["`), leaving `\b<name>\b`. **Predict red**:
      *a name in prose or a comment is not a read* (Step 1), at the comment's line — while *…never inside a longer word* stays
      green, because `\b` alone already stops `mailbox`. The two tests hold the two halves of the rule.

---

## Task 11: D19's privacy-assessment draft — §9's six rows, what Manifest knows and what the owner must add

> **`[S7]` (sitting 7, 2026-10-01 — Task 10, `6cbb489`): WHAT THE ASSESSMENT'S DRAFT INHERITS FROM THE REGISTRATION'S.**
> - **`launch:draft` exists** (owner, collaborator, admin; MINTABLE) — the assessment's draft asserts it too, and its route is a sibling
>   of `draftIamRegistration` (`api/routes/launch.ts`): no `requireSession`, the capability first.
> - **The shape to mirror**: the draft STORED on the row (`generated_draft`), a `generatedAt` inside it, a guard that reads it back
>   (`launch/package.ts`'s `readPackage`), precomputed OUTSIDE the transaction and written under the record's `FOR UPDATE` with the state
>   re-checked there (`draftIamRegistration`; the lock test is `api/launch.test.ts`'s *"a re-draft waits for a submission holding the
>   record…"*).
> - **`submitPrivacyAssessment`'s `sentDay` still reads the row's `createdAt`** — Task 10 moved only the registration's to the package's
>   `generatedAt` (the whole-branch review's M4). Move the assessment's to its draft's `generatedAt` in this task, with the same test
>   shape (*"the day a person may say they sent it is the newest draft's"*).
> - **`withAssessmentDraft` still writes a PLACEHOLDER** (`launch/testing.ts`) — Task 11 owns the real shape; `withDraft` shows how Task 10
>   replaced its own (a real package from `assemblePackage`, a certificate minted once per process).
> - **`409 LAUNCH_RECORD_SUBMITTED` exists**, registered with a registration's words (*"This registration is with UBC IAM…"*): reuse it
>   for an assessment that is `submitted` or `approved`, and widen its summary and remedy to name both.
> - **`PrivacyAssessment.draft` will be a REQUIRED field** — the mock's `PRIVACY_ASSESSMENT` fixture is typed `Schemas['…']`, so it needs
>   `draft` in the same commit (Task 10's F10 twin: `IAM_REGISTRATION` and `STAGING_REGISTRATION` gained `package: null`).
> - **Examples are CAPTURED** — `api/routes/launch-examples.ts` holds Task 10's (`satisfies z.input<…>`); and
>   `api/contract/docs.test.ts`'s internal-name gate now exempts a package's `certificate.pem`, `certificate.fingerprint` and
>   `metadataXml` BY PATH — extend `MACHINE_DATA` only for machine data, never for prose.
> - **The registration's package carries the PIA number only once the assessment is `approved`** — so drafting the registrations after
>   the assessment's approval is what puts it there (the package warns otherwise), and a registration drafted before it is refused
>   `409 LAUNCH_DRAFT_STALE` when sent (the fix wave, `dec71d8`).
> - **What to reuse, by name** (all in `launch/`): Task 10's source rule is `drawnFrom` and its contacts `contactsFor` — both PRIVATE in
>   `records.ts`; export them rather than writing a second rule. The collected section's purposes are `ATTRIBUTE_PURPOSES`
>   (`package.ts`). `Contact` is `sso/`'s.
> - **A submission names the draft it sent** (`SubmitLaunchRecordRequest.draftGeneratedAt`, `409 LAUNCH_DRAFT_CHANGED`) — already on
>   `submitPrivacyAssessment`, reading `generatedAt` off the stored draft; Task 11's draft must carry `generatedAt` for it to mean
>   anything (until then no real assessment draft exists).

> **`[M1]` (Task 1, 2026-09-29 — F2): on driver 2, GitHub shows the PERSON as the author of every commit made through the
> API** (*"Test Instructor <…@users.manifest.internal>"*). So the **flows** section gains a fact whenever the project's
> repository is on GitHub: *"The names of the people who change the app through Manifest are sent to GitHub (<organisation>),
> as the author of each change."* — source `the project's repository`. On driver 1 there is no such fact. Add it to Step 1's
> flows test.

**Spec action 4 first** (its §9 half).

**Files:**
- Create: `packages/control-plane/src/launch/assessment.ts` — `assembleAssessment`, `renderAssessmentText`
- Modify: `packages/control-plane/src/launch/records.ts` — `draftPrivacyAssessment`
- Modify: `packages/control-plane/src/api/routes/launch.ts`, `api/representations/launch.ts` — `draftPrivacyAssessment`,
  `PrivacyAssessmentDraft`; `PrivacyAssessment` gains `draft: PrivacyAssessmentDraft | null`
- Modify: the event files + migration — `privacy_assessment.drafted`
- Test: `src/launch/assessment.test.ts`, `src/api/launch.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type SectionId = 'collected' | 'stored' | 'flows' | 'retention' | 'accountable' | 'hosting'   // §9's six rows, in its order
  interface Fact { label: string; value: string; source: string }       // source e.g. 'manifest.yaml: auth.attributes'
  interface Section { id: SectionId; title: string; facts: Fact[]; gaps: string[] }
  interface PrivacyAssessmentDraft { generatedAt: string; fromCommit: string; sections: Section[]; text: string }
  export function assembleAssessment(input: {
    spec: ManifestSpec; project: { slug: string; name: string }
    members: { name: string; email: string; role: 'owner' | 'collaborator' }[]
    contacts: Contact[]; catalogue: CatalogueEntry[]; driver: string
  }): PrivacyAssessmentDraft
  export function renderAssessmentText(draft: PrivacyAssessmentDraft): string
  ```
  **The route**: `draftPrivacyAssessment` — `POST /v1/projects/{projectId}/launch-records/privacy-assessment/draft`, capability
  `launch:draft`. It answers `200` with the `PrivacyAssessment`, and is refused `409 LAUNCH_RECORD_SUBMITTED` while `submitted`
  or `approved`.
- Consumes: Task 9's records, Task 10's source rule (the candidate's spec, else the newest valid), and the model catalogue
  (`ai/catalogue.ts`).

- [ ] **Step 1: The failing tests** — one per section, from a fixture manifest:
  - **collected**: every `auth.attributes` entry, with its purpose from `ATTRIBUTE_PURPOSES` — the same sentence the
    registration uses — and the gap *"what the app keeps in its own database"*.
  - **stored**: each service, and the three environments it runs in, with staging's *"never backed up; resettable"* (§19's
    open question named as a gap).
  - **flows**: each `egress.allow` host; each `ai.models` name with its catalogue classification, and whether it leaves
    on-premise hardware; `data.classification`.
  - **retention**: `data.retention_days`, or the gap *"no retention declared — add data.retention_days"*; sunset as a gap
    (§19: *"data disposal on app sunset"*).
  - **accountable**: the owner, the collaborators and the platform contacts.
  - **hosting**: the driver's name, and each model's `max_classification`; the gap *"where UBC hosts the app in production is
    not decided yet (§19)"*.

  And:
  - *the text rendering carries every fact and every gap, and no field name the owner would not recognise* — a list of
    forbidden tokens (`jsonb`, `uuid`, `null`, `undefined`);
  - *a submitted assessment is never regenerated*.
- [ ] **Step 2: Run — predict red.** **Step 3: Implement** — `assembleAssessment` is pure. `draftPrivacyAssessment` reads, calls
  it, stores `generated_draft`, and publishes. **Step 4: contract, matrix, journey; tell the front-end's session; commit.**
  ```bash
  git add <each path in Files, by name> packages/control-plane/drizzle/<the migration> packages/control-plane/drizzle/meta/_journal.json packages/control-plane/drizzle/meta/<its snapshot> packages/contract/openapi.json packages/contract/src/schema.d.ts docs/api/reference/<each regenerated page> docs/api/llms.txt packages/journey/src/coverage.ts packages/console/src/coverage.test.ts
  git commit -m "feat(launch): D19's privacy-assessment draft — §9's six rows from what Manifest knows, and the gaps the owner fills (Spec action 4)"
  ```
- [ ] **Step 5: Negative controls.**
  (a) Drop the `flows` section's AI models. **Predict red**: the flows test, at the model's line.
  (b) Render `null` for an absent `retention_days`. **Predict red**: the text test's forbidden tokens.

---
## Task 12: FE-25 and §26's queue — an owner asks for sign-off, and an administrator sees everything waiting on them

> **`[S6]` (sitting 6, 2026-10-01 — Task 9): WHAT THE QUEUE'S *since* READS, AND A QUESTION FOR RICH FIRST.**
> - **`submitted_at` / `submitted_by` mean "when the request now with UBC was sent, and who said so"**: stamped by the owner's *"I've
>   sent it"* (the day they name, at NOON in Vancouver — up to ~12 h ahead of the moment; count waits in Vancouver DAYS), by an
>   administrator's record that MOVES a record into `submitted` (now), and by filing a change request (`active → change_requested`,
>   now); never by UBC's answer and never by a ticket correction. A `submitted` or `change_requested` registration's `since` is it.
> - **ASK RICH BEFORE BUILDING THE QUEUE'S `change_requested` ITEM** (the whole-branch review's M13): `change_requested` carries two
>   meanings — UBC came back with questions (`submitted → change_requested`: the ball is the OWNER's, and `since` is still the original
>   submission) and an administrator FILED a change request with UBC (`active → change_requested`: waiting on UBC, stamped when filed).
>   `SUBMIT_ARROWS` lets an owner say *"I've sent it"* from either. Options: (a) one state, and the queue item reads both as "with UBC or
>   with the owner" from `from`; (b) split the state; (c) leave it. Put it as code-level options, one recommendation.
> - `LaunchReadinessItem.since` exists (Task 9) and is null for `admin-approval` — Task 12 dates it from the request.

**Spec action 5 first.**

**Files:**
- Modify: `packages/control-plane/src/db/schema.ts` + migration — `approval_requests`:
  - `id`; `release_id` (UNIQUE, → `releases`); `project_id` (→ `projects`); `requested_by` (→ `users`);
  - `requested_by_token` (nullable, → `delegated_tokens`, **`RESTRICT`**, as `pending_actions`' is);
  - `note text` (CHECK `length(note) <= 500`); `created_at`;
  - and the `approval.requested` event CHECK
- Create: `packages/control-plane/src/launch/requests.ts` — `requestApproval`, `openRequestFor`
- Create: `packages/control-plane/src/launch/queue.ts` — `listQueue`
- Modify: `packages/control-plane/src/launch/readiness.ts` — `admin-approval`'s `since` and `why` from the open request
- Modify: `packages/control-plane/src/projects/authz.ts` — `approval:request` (owner, collaborator, admin; mintable)
- Modify: `packages/control-plane/src/projects/fleet.ts`, `api/representations/fleet.ts` — `name`, `state`, `archivedAt` (M3)
- Create: `packages/control-plane/src/api/routes/queue.ts`, `api/representations/queue.ts`
- Modify: `packages/control-plane/src/api/routes/releases.ts` — `requestApproval`; `api/errors.ts`'s production-gate hint names it
- Test: `src/launch/requests.test.ts`, `src/launch/queue.test.ts`, `src/api/queue.test.ts`, `src/api/fleet.test.ts`

**Interfaces:**
- Produces:
  - **`requestApproval`** — `POST /v1/releases/{releaseId}/approval-request` with `{ note?: string }`, capability
    `approval:request`, a token allowed. It answers `201` with an `ApprovalRequest`, or `200` with the existing one for a
    second ask. `ApprovalRequest` is `{ id, releaseId, projectId, requestedBy: { id, displayName }, viaToken: { id, name } |
    null, createdAt, open: boolean }` — **the note is not in it**; the queue shows it, to administrators only. It is refused:
    - `409 RELEASE_NOT_STAGED` when the release is not the candidate;
    - `409 APPROVAL_NOT_NEEDED` when `admin-approval` is `met` — naming the item's `why`;
    - `409 PROJECT_ARCHIVED`, declared through `capability` as every route is.
  - **`listQueue`** — `GET /v1/queue`, session-only, administrator-only, as `listFleet` is. It answers `{ items: QueueItem[],
    oldestSince: string | null, truncated: boolean }`, where:
    ```ts
    type QueueKind = 'release-approval' | 'iam-registration' | 'iam-change-request' | 'privacy-assessment'
    interface QueueItem {
      kind: QueueKind; project: { id: string; slug: string; name: string; state: 'active' | 'archived' }
      subjectId: string                 // the release, or the record
      environment: 'staging' | 'production' | null
      requestedBy: { id: string; displayName: string } | null
      since: string; summary: string    // one sentence, a person's words
      note: string | null               // a sign-off request's, shown here and nowhere else
    }
    ```
    The items are ordered by `since`, oldest first, at most 200.
  - The fleet's `Fleet` gains `name`, `state` and `archivedAt` (additive).
- Consumes: `candidateFor`, `computeLaunchReadiness`, Task 9's `since`.

- [ ] **Step 1: The failing tests.**
  ```ts
  it('an owner asks for sign-off on the release serving staging; an administrator sees it waiting, with its note', async () => {
    const res = await requestApproval(ctx, candidateReleaseId, { note: 'Week 3 — students start Monday' }, ownerSession)
    expect(res.statusCode).toBe(201)
    const queue = (await get(ctx, '/v1/queue', adminSession)).json()
    expect(queue.items[0]).toMatchObject({ kind: 'release-approval', subjectId: candidateReleaseId,
      requestedBy: { displayName: 'Bio Prof' }, note: 'Week 3 — students start Monday' })
    expect(queue.oldestSince).toBe(queue.items[0].since)
    expect(events(ctx, 'approval.requested')[0].detail).not.toHaveProperty('note')       // never in an event
  })
  it('a second ask answers the first request, 200, and the queue holds one item', …)
  it('refuses a release that is not the candidate — RELEASE_NOT_STAGED', …)
  it('refuses when no approval is needed — APPROVAL_NOT_NEEDED', …)
  it('a request closes when the release is approved, and when it stops being the candidate', …)   // derived, never stored
  it('the queue holds submitted registrations and assessments, oldest first, with the environment', …)
  it('the queue is refused to an owner — FORBIDDEN — and to a token — TOKEN_CREDENTIAL_REFUSED', …)
  it('the checklist’s admin-approval item says who asked and when, and waits since then', …)
  it('the fleet names each project, and says it is archived', …)
  ```
- [ ] **Step 2: Run — predict red.** **Step 3: Implement.**
  - `openRequestFor` is a join: the request, with no `approvals` row for the release, and the release still the candidate.
  - `listQueue` is four selects unioned in TypeScript and sorted. **No materialised queue** (§26: *"derived from an entity that
    already exists"*).
  - The production gate's hint (`api/errors.ts:256-265`) becomes: *"…an administrator must approve it — ask them with
    requestApproval, then deploy again once they have."*
- [ ] **Step 4: The contract, the matrix (both routes, every actor), the journey; tell the front-end's session; commit.**
  ```bash
  git add <each path in Files, by name> packages/control-plane/drizzle/<the migration> packages/control-plane/drizzle/meta/_journal.json packages/control-plane/drizzle/meta/<its snapshot> packages/contract/openapi.json packages/contract/src/schema.d.ts docs/api/reference/<each regenerated page> docs/api/llms.txt packages/journey/src/coverage.ts packages/console/src/screens/tokens.tsx packages/console/src/coverage.test.ts
  git commit -m "feat(launch): FE-25 — an owner asks for sign-off, and §26's queue shows every wait on an administrator, oldest first (Spec action 5); the fleet's name and state (M3)"
  ```
- [ ] **Step 5: Negative controls.**
  (a) Drop the "still the candidate" condition from `openRequestFor`. **Predict red**: *a request closes … when it stops being
      the candidate*.
  (b) Put `note` in the event's payload. **Predict red**: the first test's `not.toHaveProperty('note')`, and the stream
      contract's payload schema (`strictObject`).
  (c) Sort the queue newest first. **Predict red**: *oldest first*, and `oldestSince`.

---

## Task 13: The console and the mock — every new operation called, the owner's half of the launch records, and a Queue

> **`[S7]` (sitting 7, 2026-10-01 — Task 10, `6cbb489`): THE PACKAGE, AS THE CONSOLE AND THE MOCK MEET IT.**
> - **`draftIamRegistration` is parked** in `DELIBERATELY_UNCALLED` (`packages/console/src/coverage.test.ts`) beside the two submissions,
>   naming this task.
> - **The mock's `IAM_REGISTRATION` and `STAGING_REGISTRATION` carry `package: null`** although an owner submitted both — a state the
>   platform cannot produce (a submission needs a package). Script real packages for them. Until then `draftIamRegistration` and
>   `submitIamRegistration` answer from their DOCUMENT EXAMPLES — a real captured staging package (`api/routes/launch-examples.ts`).
> - **What the records screen shows of a package** is `RegistrationPackage`: each attribute's `justification`, `usedAt` and `unused`; the
>   `warnings` (an unread attribute, a missing PIA number, production drawn without a release serving staging); `metadataXml` with
>   *Copy*; the certificate's `fingerprint` and `expiresAt`; the `contacts`; `privacyAssessmentReference`. Never a private key: none is
>   ever in the answer.
> - **The checklist's `iam-registration` `why` gains a sentence** when a draft — or a request already sent — no longer matches the release
>   serving staging (*"The draft no longer matches the release serving staging: it asks for sn, which the draft does not. Draft it again
>   before you send it."*). The launch screen shows it as it is.

> **FE-40 (relayed 2026-09-29, CONFIRMED by Rich at sitting 3's open — its section above)**: four OPT-IN mock switches so the mock
> can play a first launch — ready, step-up enforced, `getApproval` `404` before a decision, a failed rehearsal. They are this
> task's, beside the defaults, which do not move.

**Files:**
- Modify: `packages/console/src/screens/records.tsx` — for each of the three records:
  - *Draft the request* / *Fill in what we know* (`launch:draft`);
  - the package: the attributes with their justifications and warnings, the metadata XML in a `<pre>` with *Copy*, the certificate's fingerprint and expiry;
  - the assessment's sections with their gaps, and its text with *Copy*;
  - *I've sent it* (`launch:submit`), with a date and a reference;
  - *waiting since* in words.
- Modify: `packages/console/src/screens/launch.tsx` — *Ask an administrator to sign this off* beside the unmet `admin-approval`
  item, and each item's `since`
- Create: `packages/console/src/screens/queue-admin.tsx` — the administrators' queue: kind, project, who, how long it has
  waited, the note, and a link to the record or the approval screen. The headline is the oldest item's age. (`screens/queue.tsx`
  is the per-project pending-actions tab and keeps its name.)
- Modify: `packages/console/src/screens/fleet.tsx` — name and state
- Modify: `packages/console/src/api.ts`, `router.ts` — every new operation called; `coverage.test.ts`'s `DELIBERATELY_UNCALLED`
  empty again
- Modify: `packages/mock/src/server.ts`, `fixtures.ts` — drafts, a submission, a request and a queue scripted per the request
  (FE-27's rules: `404` for an unknown id, times from now), `MANIFEST_MOCK_QUEUE` for a full queue
- Test: `packages/console/src/*.test.tsx` beside each screen, `packages/mock/src/server.test.ts`

- [ ] **Step 1: The failing tests** — each screen renders its states from the mock's answers (the console's tests run against
  the mock): no record; a draft with an unused-attribute warning; submitted (*"Sent on 1 October 2026 — waiting 12 days"*); a
  queue of four, oldest first. **The console's plain bar** (§26's *Scope*: it stays plain; the admin console proper is P11's).
- [ ] **Step 2: Run — predict red. Step 3: Build.** **Step 4: Click it against the mock**
  (`pnpm --filter @manifest/console dev` against `manifest-mock`), then against the platform: an owner drafts and sends, an
  administrator sees the queue. **The Chrome extension cannot sign in** (ORIENTATION §4 trap 6) — the platform half is Rich's
  typing, or the demo's sessions, and it is repeated in Task 15.
- [ ] **Step 5: Tell the front-end's live session** (`packages/mock` moves). Commit.
  ```bash
  git add <each path in Files, by name>
  git commit -m "feat(console,mock): the owner's half of the launch records, the administrators' queue, and every new operation called"
  ```
- [ ] **Step 6: Negative control.** Remove the console's `requestApproval` caller. **Predict red**: `coverage.test.ts`, naming
  `requestApproval`.

---

## Task 14: The guides — *Launching* rewritten around the three clocks

> **`[S7]` (sitting 7, 2026-10-01 — Task 10, `6cbb489`): WHAT *LAUNCHING* MUST NOW SAY ABOUT A DRAFT.** `draftIamRegistration` per
> environment; `launch:draft` is MINTABLE (an agent may prepare the draft its person reads and sends); the package's fields and its
> `warnings`; production's drawn from the release serving staging — so draft production once the release you will launch serves staging;
> drafting again until it is sent, then `409 LAUNCH_RECORD_SUBMITTED` until UBC asks for changes or it lapses; `409 LAUNCH_NOT_CWL`; the
> checklist's drift sentence; and, for operators, `MANIFEST_LAUNCH_CONTACTS` (RUNBOOK). Task 10's NEW descriptions carry no section,
> decision or plan number; the older ones it sat beside (`IamRegistration`'s fields, `LAUNCH_RECORD_INVALID`'s summary) are this task's
> published-text pass.

> **`[S10]` (Rich, 2026-09-30 — *"One of the things that we don't need to see in the API docs is things like section or plan
> numbers. They're irrelevant to the person reading the docs … This needs to be looked at for all the docs"*; placed HERE, *"In the
> merged sitting 10"*): THIS TASK ALSO MAKES EVERY PUBLISHED TEXT CITE NO SECTION, DECISION OR PLAN, AND NO MAINTAINER NOTE.**
> - **The document**: every schema, property, tag (`TAG_DESCRIPTIONS`), error entry (`api/error-codes.ts`'s meanings and
>   remedies, `x-manifest-spec-errors`), event (`observability/event-schemas.ts`, `examples.ts`) and unversioned-endpoint text — about
>   **101** references (`§n`, `Dnn`, `Cn`) measured on 2026-09-30, plus the info paragraph's *"Generated from the control plane's route
>   definitions; do not edit"* (a note for someone editing the repository, not for a reader — move it to a comment beside the
>   generator, or drop it), and the rehearsal checklist item's *"D21: …"*, *"(D6)"* and *"(§9)"* that sitting 5b left for this pass
>   (`launch/readiness.ts`). The operation descriptions were done on 2026-09-30 (`5246d4d`).
> - **The guides** (`docs/api/*.md`): **52** measured — `events.md` 48 (read where they come from: a table `docs:write` generates is
>   fixed at its source), `journey.md` 3, `conventions.md` 1.
> - **The style** (`5246d4d`'s): what is true now, in its own words — no history, no future, no reason a caller cannot act on; keep
>   every fact a caller needs (codes, capabilities, limits, who may and who never may).
> - **The gate**: widen `api/contract/docs.test.ts`'s *"cites no spec section where every reader starts"* to the WHOLE published
>   document, and add the same check over `docs/api/**/*.md` (where a test already reads them — `packages/journey/src/docs.test.ts`).
>   Its negative control: one `§20` put back in a field description goes red, naming it.
> - **Then** `pnpm contract:write`, `contract:generate`, `docs:write` (contract `1.5.0` — text only), and tell the faculty front-end
>   first. **Code comments are NOT this pass** — a later plan of their own (Rich).

**Files:**
- Modify: `docs/api/launching.md` — rewritten:
  - the three steps IN UBC'S ORDER (Spec action 9): the privacy assessment first, then the staging registration carrying its
    reference, then — once staging is registered and tested — the production registration; and the two refusals that hold the order;
  - drafting, and what a package holds;
  - *I've sent it*, and *waiting since*;
  - asking for sign-off;
  - what an administrator does with the queue;
  - what a token may and may not do (`launch:draft` and `approval:request` yes; `launch:submit`, `launch:record` and `launch:rehearse`
    never — the last since sitting 4a's Task 6b, and whatever Rich decides on Spec action 8 about who runs a rehearsal and what it leaves serving).
- Modify: `docs/api/events.md` (`4401`, the new events), `docs/api/agents.md` (a narrowed session; the fallback's header),
  `docs/api/frontend.md` (removing a person; the queue is not the front-end's), `docs/api/conventions.md` (a field that says *since*)
- Create: `packages/journey/src/example-launch-path.ts` (the guide's code, run against the mock) — **browser code where it is a
  person's action** (the front-end enablement plan's sitting 11 Critical)
- Test: the docs gates (`api/contract/docs.test.ts`, the examples' run, the public-text gate — no `FE-n`, no internal name)

- [ ] **Step 1: Write, then `pnpm docs:write`; the gates red where a page is stale — predict which.** **Step 2: Green. Step 3:
  Commit.**
  ```bash
  git add docs/api/launching.md docs/api/events.md docs/api/agents.md docs/api/frontend.md docs/api/conventions.md packages/journey/src/example-launch-path.ts docs/api/reference/<each regenerated page> docs/api/llms.txt
  git commit -m "docs(api): Launching — the three clocks, drafting, sending, asking for sign-off; 4401; a narrowed session; the fallback's header"
  ```
- [ ] **Step 4: Negative control.** Put `launch:submit` in the guide's *a token may* list. **Predict red**: the public-text
  gate's capability check, if one exists (read `docs.test.ts` first). **If none exists, record that the guide's list is held by
  nothing** — and add the check.

---

## Task 15: The acceptance — `make demo-launch`, and a person clicking it

> **`[S7]` (sitting 7, 2026-10-01 — Task 10, `6cbb489`):** the demo drafts BOTH registrations through `@manifest/contract`, and checks end
> to end what the unit tier holds through a labelled fake and the Docker tier through the real registrar alone: **the staging package's
> certificate fingerprint is the one `sso.registered` publishes when staging deploys** (Review Focus 2). On driver 2 the draft reads the
> app's tree through the mirror, at the commit it is drawn from.

**ALONE, AND LAST.**

**Files:**
- Create: `scripts/demo-launch.sh` (bash: sign-ins, step-ups, the edge) and `packages/journey/src/launch.ts` (every client call
  through `@manifest/contract`) — the split every headless demo keeps
- Create: `fixtures/launch-path-app/` — a CWL app on `node-ts-mongo@1` that reads `mail` and `givenName`, and asks for `sn`
  without reading it (so the package's unused warning fires)
- Modify: `Makefile` (`demo-launch`), `scripts/ci-acceptance.sh` (a step, either driver), `scripts/offline-acceptance.sh`
  (**step 16**), `docs/superpowers/RUNBOOK.md`, `docs/superpowers/WALKTHROUGH.md`, `packages/journey/src/coverage.ts`
  (`JOURNEY` names every new operation)

- [ ] **Step 1: The demo, on EITHER driver** (`launchpath-<driver>`). The steps:
  0. The driver: refused on real GitHub by name (Task 2), unless `DEMO_LAUNCH_REAL=1` and Rich's yes.
  1. The owner creates the project, commits the fixture, builds, deploys to staging (healthy, **the app's own answer**).
  2. The owner drafts the staging and production packages and the assessment. Assert:
     - the entity ids and ACS per environment;
     - the certificate's fingerprint against `sso.registered`'s for staging;
     - `sn` flagged unused;
     - no `PRIVATE KEY` anywhere;
     - the assessment's six sections.
  3. The owner says *I've sent it* for all three — `sentAt` two days ago. The checklist's items read `since`, in words.
  4. A token holding `launch:draft` and `approval:request` redrafts the assessment (`200`), is refused the submission
     (`TOKEN_PERSON_ONLY`), and asks for sign-off (`201`).
  5. The administrator's queue: four items, oldest first, the note present. The owner is refused the queue (`FORBIDDEN`).
  6. The administrator records UBC's answers (`active`, `approved`), runs the rehearsal, takes a preview and approves (stepped
     up). The request leaves the queue.
  7. The owner deploys to production (stepped up): healthy, on `127.0.0.3`.
  8. A stream on the token is open; the owner revokes the token and the stream closes `4401`. A collaborator is added and then
     removed: their token is revoked, and their session stream closes `4404`.
  9. The project is raised to `confidential` while an agent session holds `default-chat` and a model it keeps. The session is
     narrowed, not ended, and the kept model still answers through the same key.
  10. `listInstances`: every instance carries `createdAt`, and the failed attempt made after the serving one is newer.

  `DEMO_LAUNCH_STOP_AFTER=<0–10>` for a control's short run.
- [ ] **Step 2: Green three times on each driver** — fresh, re-use, and from a `make reset` machine (Rich's yes for the reset,
  which removes the front-end's projects if they are still there). **Driver 2 is the FAKE** here (Task 2's refusal), and the
  real leg is Step 5.
- [ ] **Step 3: The negative controls, each seen RED**, predicted first; the classifier may refuse some to the agent, and
  Rich runs those from a script he reads (the memory *negative controls: Rich runs a script*):
  (a) Task 9's `registered_at` condition removed → step 1's build fails;
  (b) `launch:submit` out of `PERSON_ONLY` → step 4;
  (c) the queue sorted newest first → step 5;
  (d) `closeToken` removed → step 8;
  (e) the trim reverted to ending → step 9;
  (f) `createdAt` from `lastSeenAt` → step 10.
- [ ] **Step 4: The clicked half — Rich types every password.** He is the owner: draft, read the package, send, ask. Then he is
  the administrator: the queue, the records, the approval. Then the launch.
- [ ] **Step 5: OPTIONAL, AT RICH'S YES — the real leg.** Steps 0–3 against the REAL App with `DEMO_LAUNCH_REAL=1` and
  `DEMO_LAUNCH_STOP_AFTER=3`: a real private repository, a real package drafted from a real repository's code. Then delete the
  project, and `github-real-repos.sh` reads it gone.
- [ ] **Step 6: The plan's ONE whole-branch review** (a fresh reviewer, the most capable model, read-only, over the plan's whole
  range). Its fix pass is red-first, and one scoped re-review follows.
- [ ] **Step 7: Commit, and the close-out** — the plan EXECUTED in every document ORIENTATION §6 lists; the four HTML pages
  checked (a faculty member can now draft and send their launch requests — `manifest-phases.html` and
  `manifest-schematic.html` will need a sentence each).

---
## What this plan does not build

**Named so the next plan — and the faculty front-end — inherits a list rather than a surprise.**

- **Signing in at staging against UBC's staging IdP** — §9's real staging world. It needs access to
  `authentication.stg.id.ubc.ca` (§19; the external track's item 5), and on the laptop staging keeps the fake sign-in (§21). This
  plan TRACKS the staging registration; nothing yet GATES on it.
- **Submitting to UBC over an API** — §9's *Toward automated submission*. The records carry a submission state and a reference
  precisely so a programmatic driver is the same transition (D19). No agreed interface exists.
- **A model's plain-language summary beside a package's derived facts** (Decision 13) — structured output, a person's budget,
  and a reviewer's trust in a document sent to UBC. The derived justification is the floor.
- **An administrator's reason for acting on another person's project** — §26's non-repudiation rule, ORIENTATION §8's open
  question. The queue makes it more visible: an administrator now acts from a list of other people's projects.
- **Certificate-expiry alarms (D20)** — the package records `expiresAt`; §26's *Health and risk* screen and its 90-day alarms are
  the admin console's.
- **An audience upgrade, a domain, a launch override in the queue** — §26's other rows, whose entities do not exist yet (§24,
  §23, `LaunchReadiness` overrides).
- **An owner revoking any token on their project, and `Token` naming its minter** — FE-11's option (b). Rich chose (a) (Task 8).
- **FE-28 to FE-32** — CONFIRMED by Rich 2026-09-30 and placed: FE-28 to FE-31 in the *faculty-ready* plan, FE-32 in the plan after it.
- **TAs building, or being added** — FE-39's *"Perhaps in the future"*: a change to Task 8a's one predicate, when Rich says so.
- **From the front-end enablement plan, still open:**
  - M1 — a restore after a part-way teardown (`teardown_finished_at`);
  - M5 — a non-default capable fallback below `confidential`;
  - `AI_UNMAPPED` undeclared on the session routes;
  - F12 and F14 — the reference console's slug field and a step-up's wording;
  - F13 — a crashed-at-start app probed for ~2 minutes;
  - F18 — a secret driver 1's hook catches answering `SOURCE_GIT_FAILED`;
  - the whole-branch review's triaged minors.

  Each is named, and none is urgent.
- **Webhooks from real GitHub to a laptop** — impossible without a public address. A production control plane on UBC's
  infrastructure is where they are proved (the D5 plan's *What this plan does not build*).
- **Every driver-2 demo on real GitHub** — each pushes as a person or reads the fake. `make demo-launch`'s optional real leg
  (Task 15, Step 5) is the one real acceptance path.

---

## Spec actions

**SIX, DRAFTED 2026-09-29 WITH THIS PLAN — AND A SEVENTH, FROM FE-39, DRAFTED AFTER SITTING 1'S CLOSE, ITS OPTIONS DECIDED BY RICH THE SAME EVENING AND APPLIED AT HIS WORD (Rich, 2026-09-29: *"apply 7"*); 6 APPLIED BY SITTING 4 (`0ebe514`); AND AN EIGHTH, FROM FE-42, DRAFTED BY SITTING 4a (2026-09-30) — ITS PREMISE RE-ASKED OF RICH (who may run the rehearsal, and what it leaves serving), AND DECIDED BY HIM THE SAME DAY: (b) AND (c) TOGETHER, ITS COMBINED WORDS APPLIED AT HIS WORD (*"apply 8"*); 1 AND 2 APPLIED AS WORDED AT SITTING 5's OPEN (2026-09-30); 3–5 NOT APPLIED.** Each is decided by Rich before the sitting that builds it, and applied
only after he has read the words. **A spec action is not finished when the spec changes**: the four shared HTML pages restate §6,
§7, §9, §10, §13, §20, §26 and D24 in plain language, and each action below names the pages it moves.

### 1. §7 — a session whose project no longer allows one of its models is narrowed, not ended (before sitting 5) — ✅ **OPTION (a) APPLIED AS WORDED, 2026-09-30** (Rich, 2026-09-30, at sitting 5's open, reading each proposed text: *"Apply as worded"*); shared pages: `manifest-decisions.html`'s D17 names no session ending — unchanged; the others do not describe agent sessions at this depth — checked, unchanged

**Why.** Rich, 2026-09-29, *"yes please"* (*Decided by Rich*). Spec action 10's words end every session holding a model the
project no longer allows — so when a building agent's own commit raised `notes-and-answers` to `confidential`, three live
sessions ended although the capable model they were using was still allowed.

**Proposed**, one edit — §7, *Classification gates model routing (D17)*, the building-agent paragraph: *"Set to on-premise only,
every such session gets the on-premise models alone, and the sessions already holding more are ended."* becomes:

> *"Set to on-premise only, every such session gets the on-premise models alone. **Whenever a project's classification or this
> setting withdraws a model from a live agent session, the session is narrowed in place**: its key keeps the models the project
> still allows and loses the rest at once, the session goes on, and its event says what was withdrawn. A session left with
> nothing it may use is ended."*

*Options:*
- **(a) as proposed** (recommended) — narrowed in place, IF Task 1's `[M3]` measured LiteLLM refusing the withdrawn model at once;
- **(b) as (a), with a bound** — narrowed, but ended when the gateway's refusal lags by more than `[M3]`'s measured cache window;
- **(c) keep ending**, and let a client start a new session (the faculty front-end's `5a1aa1f` does).

**Shared pages:** `manifest-decisions.html` (D17's plain sentence, if it names sessions ending — check); the others do not
describe agent sessions at this depth (check, and say so).

### 2. §10, §6 and §20 — removing a member revokes their tokens on the project and ends their agent sessions (before sitting 5) — ✅ **OPTION (a) APPLIED AS WORDED, 2026-09-30** (Rich, 2026-09-30, at sitting 5's open, reading each proposed text: *"Apply as worded"*); shared pages: `manifest-decisions.html`'s D24 gains *"And a person removed from a project takes their agents' access with them: their tokens there are revoked and their AI sessions there end."*; the schematic, phases and stories describe no removal — checked, unchanged

**Why.** Rich, 2026-09-29, *"YEs"* to the review's M4 option (a). Today a TA removed in week five keeps an agent working on the
app for up to a year (the faculty front-end's FE-11).

**Proposed**, three edits:
- **§10's table, the *Agent key* row**: *"…revoked when its session is ended, when the delegated token that started it is
  revoked, and when the project is archived; never outlives that token."* becomes *"…revoked when its session is ended, when the
  delegated token that started it is revoked, **when the person it works for is removed from the project**, and when the project
  is archived; never outlives that token."*
- **§6, `DelegatedToken`**: after *"…and `revoked_at` is how one is ended **before** its expiry."*, add: *"**A token is revoked
  when its minter is removed from its project**, because it acts for that person there and nowhere else."*
- **§20, *Credential classes (D24)***: after *"This is enforced centrally at the authorization layer, not per-route…"*, add:
  *"**Removing a person from a project revokes every token they minted on it, ends their agent sessions there, and closes their
  open streams** — a removal that left their agent working would not be a removal."*

*Options:*
- **(a) as proposed** (recommended, and Rich's choice);
- **(b) re-read membership on every token request** — the same outcome, lazily, at a read per request
  (`projects/authz.ts:495-499` rejected it);
- **(c) an owner may revoke any token on the project** — FE-11's option (b), a person's act rather than the platform's rule.

**Shared pages:** `manifest-decisions.html` D24 (a sentence: *"and a person removed from a project takes their agents' access
with them"*); check the others.

### 3. §9, §6, §13, §19 and D24 — the staging registration is a second kind of `IamRegistration`, and an owner says *"I've sent it"* (before sitting 6) — ✅ **OPTION (a) APPLIED AS WORDED, 2026-09-30** (Rich, planning session `manifest-00`: *"(a) Apply as worded"*; `844605b`); shared pages: `manifest-phases.html` stage 2, the schematic's launch checklist, `manifest-decisions.html` D19 and D24 — swept

**Why.** FE-6, the launch path Rich placed first. §9 says how Manifest drafts and tracks the staging request *"is not yet
designed"*, and §19 asks *"beside `IamRegistration` or as a second kind of it"*. And nothing records that a request was sent, so
nothing can say *waiting since*.

**Proposed**, six edits:
- **§9, *Staging***: *"**How Manifest drafts and tracks the request is not yet designed** (§19). `IamRegistration` (§6) is
  production's today."* becomes *"**Manifest drafts and tracks it as it does production's** — an `IamRegistration` of the
  `staging` kind (§6), with its own package, its own submission and its own state, beside the production one."*
- **§9, *Production***, after *"`IamRegistration` tracks state (`draft → submitted → active`, plus `change_requested` and
  `expired`) against an external ticket reference."*: *"**The owner moves it to `submitted`** — *I've sent it* — with the day
  they sent it, which is how Manifest can say how long it has waited; **UBC's answers are an administrator's record**. The same
  holds for a `PrivacyAssessment`. A registration no reviewer has registered gates nothing: a production build is checked
  against `registered_attributes` only once UBC has registered them."*
- **§6, `IamRegistration`**, gains `environment` (`staging` \| `production`), `submitted_at`, `submitted_by` and
  `generated_package` — *"one per environment that signs people in against UBC"*. **§6, `PrivacyAssessment`**, gains
  `submitted_at` and `submitted_by`.
- **§13**, after *"…and it is surfaced at the same moment as the other two."*: *"Each of the three is drafted by Manifest and
  sent by the owner, and each says, while it waits, how long it has waited."*
- **§19**, the staging registration's row: *"…How Manifest drafts and tracks it, beside `IamRegistration` or as a second kind of
  it, is not yet designed"* becomes *"…Manifest drafts and tracks it as a second kind of `IamRegistration` (§9)"*.
- **D24**, the person-only sentence: *"recording UBC's IAM registration or Privacy Office assessment (§9)"* becomes *"recording
  UBC's IAM registration or Privacy Office assessment, **or saying that a request to either was sent** (§9)"* — and the rationale's
  *"Only four things need a human"* stays true (the four are the privileged ones).

*Options:*
- **(a) as proposed** (recommended) — one object, two kinds; the owner sends, person-only;
- **(b) a separate `StagingRegistration`** — two tables and two sets of rules for one shape;
- **(c) *"I've sent it"* allowed to a token** — an agent could say a person sent a document to UBC, which D14 is written against;
- **(d) the administrator records the submission too, as today** — the owner still cannot start the clock, which is FE-6's
  whole point.

**Shared pages:** `manifest-phases.html` stage 2 (a faculty member drafts and sends their launch requests from week one);
`manifest-schematic.html`, where it describes the launch checklist; `manifest-decisions.html` D19 and D24.

### 4. §9 — D19's package: UBC's structure, not the tool's code; justifications from where the code reads each attribute; the assessment names its gaps (before sitting 7) — ✅ **OPTION (a) APPLIED 2026-09-30, WITH TWO CONSEQUENTIAL EDITS AND ONE BULLET** (Rich: *"(a) + follow-ons + PIA no."*; `844605b`): §2's asset row (*"Its structure, not its code"*), §9's *Certificate lifecycle* (Manifest issues the certificate itself, D20), and the package list's *"the privacy assessment's reference (the PIA number), which UBC IAM asks for"*; shared pages checked — none names the tool

**Why.** §9 says the package is generated *"reusing `saml-metadata-generator` as a library"*. The tool is a web application, not
a library (*Read this first* 6): its ACS paths are the Shibboleth daemon's, it hands the person the private key, and it is not a
dependency Manifest may add (C6). What UBC IAM needs from it is its STRUCTURE.

**Proposed**, three edits:
- **§9, *Production***: *"**Manifest generates the registration package** from the AppSpec, reusing `saml-metadata-generator`
  as a library:"* becomes *"**Manifest generates the registration package** from the AppSpec, **in the structure UBC's
  `saml-metadata-generator` produces** — its elements, organisation and algorithms — with Manifest's own derived values:"*
- **§9**, the attribute bullet, after *"…precisely what a faculty member cannot write unaided"*: *"— each attribute's purpose,
  and the lines of the app's code that read it, found by a bounded search. An attribute the code never reads is flagged before the
  package is sent, so it can be removed rather than asked for. The private key never leaves the platform: the package carries the
  certificate."*
- **§9, *Privacy Impact Assessment***, after *"…so the owner reviews and signs rather than authoring from nothing:"* and the
  table: *"**What Manifest cannot know, the draft names as a gap for the owner** — what the app keeps in its own database, where
  UBC will host it — rather than leaving it out."*

*Options:*
- **(a) as proposed** (recommended);
- **(b) import the tool** — it would need to become a package, lose its Shibboleth paths and stop handling private keys first,
  which is UBC's code to change;
- **(c) a model writes the justifications** — Decision 13's rejection.

**Shared pages:** `manifest-decisions.html` D19 (*"drafts it"* is still true — check the wording); the others do not name the tool
(check).

### 5. §6, §13 and §26 — an owner asks for sign-off, and the request is a queue item (before sitting 9) — ✅ **OPTION (a) APPLIED AS WORDED, 2026-09-30** (Rich: *"(a) Apply as worded"*; `844605b`); shared pages: `manifest-phases.html` stage 2

**Why.** FE-25. §26's queue lists *"Release awaiting approval — `Approval` (D9)"*, but nothing makes a release await one: an
approval begins on the administrator's side, and a refused production deploy writes nothing (*Read this first* 10).

**Proposed**, three edits:
- **§6**, a new row: *| **ApprovalRequest** | `id`, `release_id`, `project_id`, `requested_by`, `requested_by_token`, `note`,
  `created_at` — an owner's request that an administrator sign off the release serving staging. It is answered by an `Approval`
  and closes when one is recorded or the release stops being the launch candidate; its `note` is shown to administrators and to
  nobody else |*
- **§13**, the checklist's last row stays; after the table's paragraph: *"**The owner asks for the administrator's approval** on
  the release serving staging, and the request waits in the administrators' queue (§26) with how long it has waited — so the one
  approval a launch needs from a person at the platform is never waited for without being asked for."*
- **§26**, the queue's first row: *"| Release awaiting approval | `Approval` (D9) | admin |"* becomes *"| Release awaiting
  approval | `ApprovalRequest`, answered by an `Approval` (D9) | admin |"*.

*Options:*
- **(a) as proposed** (recommended) — its own row, a token may ask, the note only for administrators;
- **(b) a requested state on `Approval`** — an `Approval` is an INSERT-only record of a decision (P6a), and a request is not one;
- **(c) a refused production deploy creates the request automatically** — every refused attempt becomes a queue item, including
  ones made to see what the gate says.

**Shared pages:** `manifest-schematic.html` (the approval step, if it describes who starts it — check); `manifest-phases.html`
stage 2.

### 6. §7 — what *"its provider fails"* means for the capable model's fallback (before sitting 4 — ONLY if Task 1's `[M5]` finds a guard can be built) — ✅ **OPTION (a) DECIDED BY RICH, 2026-09-29, after sitting 3's close** (*"(a) is good"*, having read the words below) — ✅ **APPLIED BY SITTING 4, 2026-09-29, before Task 6**, exactly as worded under *Proposed* (the bold, a diff marker, dropped); the four shared pages checked then (below)

**Why.** FE-34. The spec says the gateway answers `default-chat-large` with the on-premise model *"whenever its provider fails,
the network off included"*. LiteLLM 1.98.0 also answers a request the provider REFUSED as malformed. The client's own mistake
looks like success from a smaller model, fed a prompt cut to its context (*Read this first* 21; FE-34's measurement).

**Proposed** (Branch G), one edit — §7, *Its fallback is the on-premise model*: *"…that the gateway answers `default-chat-large`
with whenever its provider fails, the network off included."* becomes *"…whenever its provider **cannot be reached or fails — a
refused connection, a timeout, a rate limit or a server error**, the network off included — **and never for a request the
provider refused as malformed**, which is answered as the provider's refusal so its caller can correct it."*

**If Task 6 is Branch D** (no guard can be built on LiteLLM 1.98.0), the edit is instead: *"…the network off included. **The
gateway also answers a request the provider refused as malformed**; a client tells a fallback's answer by its
`x-litellm-attempted-fallbacks` header."* — so the spec says what the platform does.

*Options:*
- **(a) Branch G's words** (recommended, when it can be built);
- **(b) Branch D's words**;
- **(c) no fallback for the capable model** — an unreachable provider fails loudly, which Spec action 8 chose against.

**Shared pages:** ~~none restates the fallback (checked by `grep` on 2026-09-29 — recheck at application).~~ **Rechecked at application (sitting 4): `manifest-schematic.html` DOES** — *"when that provider cannot be reached, the network off included, the platform's own on-premise model answers in its place"* — the 2026-09-29 grep missed it. It stays true under option (a) (it names the unreachable case and never claims a malformed request falls back), so it is **unchanged**; `manifest-decisions.html`'s one match is FIPPA's, and `manifest-phases.html` and `manifest-stories.html` carry none.

### 7. §9, §6, §13 and §20 — who may build: faculty, or an administrator named by a setting (FE-39; before sitting 5a) — ✅ FE-39 CONFIRMED AND ITS OPTIONS DECIDED BY RICH, 2026-09-29; ✅ **APPLIED AT HIS WORD THE SAME EVENING** (Rich, 2026-09-29: *"apply 7"*), as the four edits below, with one consequential phrase beyond them — §13's *collaborator* was *"invited TA or co-instructor"*, which the drafted *"only a person who may build is added"* made false; it reads *"an invited co-instructor (a TA once* who may build *includes TAs)"*. **Shared pages:** `manifest-schematic.html`'s *Signing in* step gains that Manifest is for faculty, for now; `manifest-decisions.html` (no D-number changed), `manifest-phases.html` and `manifest-stories.html` (their CWL and TA lines describe an APP's users) checked and unchanged

**Why.** FE-39, relayed as Rich's decision and then confirmed by him ((Rich, 2026-09-29, answering Spec action 7's three open choices: *"1. YEs, PUID 2. YEs keep but no new. 3. literally just those with 'faculty' as their affiliation"*)). A student with a CWL can start an app today,
and spend the platform's model money doing it. §9 has the control plane deliberately not ask for `eduPersonAffiliation`, and §13's
roles know nothing of faculty.

**Proposed**, four edits (a fifth, to §26's *Platform settings*, was dropped with the affiliation setting — Decision 30):
- **§9**, after *"…and `uid`, the CWL login name — the last so that a person can add a colleague to a project by the name the
  colleague signs in with."*: *"**And `eduPersonAffiliation`, read at every sign-in as UBC's current fact about the person**:
  Manifest is for faculty, for now, and only a person whose affiliation is `faculty` — or an administrator — may start a project,
  start an intake session, or be added to a project. Authorization stays
  Manifest's; the attribute is one fact it decides from."*
- **§6, `User`**, gains *`affiliations` (from `eduPersonAffiliation`, as of the person's last sign-in)*.
- **§13, *Roles***, gains a first line: *"**Who may build** — a faculty member (by CWL affiliation) or a platform admin. Everyone
  else who signs in is told it is not open to them yet. Only a person who may build is added to a project; one who stops being
  faculty keeps the projects they are on, and starts nothing new."*
- **§20**, *Admin bootstrapping*: *"…the first administrator is created by a documented out-of-band procedure…"* gains *"— or
  named in a platform setting of PUIDs, which is authoritative when it is set, reconciled at every sign-in and audited as a
  `RoleChange`."*

*Options* — **DECIDED by Rich, 2026-09-29**: the list by **PUID** (not CWL login — a login can be reassigned); a person who stops
being faculty **keeps their projects and tokens and starts nothing new** (not losing access); and **exactly `faculty`** (no setting of
affiliations). *Declined:* building open to every CWL holder.

**Shared pages:** `manifest-decisions.html` — a sentence on who may build; `manifest-schematic.html`, where it describes who signs
in; check the others.

### 8. D24 and §20 — who may run D21's rehearsal, and what it leaves serving (drafted by sitting 4a, 2026-09-30) — ITS PREMISE RE-ASKED; ✅ **DECIDED BY RICH, 2026-09-30: (b) AND (c) TOGETHER** (*"b and c together, in its own small sitting after 5"*) — Task 6c, sitting 5b; ✅ **APPLIED at his word the same day** (*"apply 8"*), as the combined words at the end of this action

**Why.** FE-42 (the faculty front-end's F5 sitting 1): a project's owner pressing *Run the dry run* was refused `403 FORBIDDEN`,
*"role 'owner' may not 'launch:record'"*. Rich carried option (a) (*"Both: row now, ask platform"*; *"Yes, its own small sitting"*),
and sitting 4a (Task 6b, `fa02bbc`) built it: `launch:rehearse`, held by the owner, a collaborator and an administrator, person-only,
no step-up. Asked by sitting 4a's session *"may a delegated token run it too?"*, Rich answered **(a), PERSONS ONLY** (2026-09-29).

**What that question left out — the whole-branch review's I1, verified by the controller.** The question told Rich the rehearsal
deploys the candidate *"into production, behind the gate, so nothing is public"*. **That was wrong.** The rehearsal deploys the
UNAPPROVED candidate (`purpose: 'rehearsal'`, which skips the digest check) into production, whose listener is `public`, and
**nothing retires it afterwards** (`releases/launched.ts`: *"a rehearsal, whose instance serves production too"*) — so until the
launch, or a later deploy, the candidate serves the app's production hostname on the public listener, signing people in under the
production-shaped registration. P6b's Decision 16 (*"Before a launch nothing is public"*) is a premise about students — nobody has
been sent the address — not a barrier. Until `fa02bbc` only an administrator could do that. **Now an owner's or a collaborator's
ordinary session can, with no step-up, and repeatedly** — so an owner could keep an unapproved candidate serving at the production
address without an approval, a registration or an assessment, and a stolen owner session could put one there. §20: *"A stolen admin
session must not be sufficient to put an app on the public internet."*

**Decide first — what may a rehearsal leave serving, and who may run one:**
- **(a) accept it as built** — persons (owner, collaborator, administrator), no step-up, the instance kept until the launch;
- **(b) as (a), with step-up** — §20's second authentication round trip before a rehearsal (adds the rehearsal to §20's step-up list);
  closes the stolen-session case, not the owner's own repeated use;
- **(c) as (a), and the rehearsal retires its production instance once its probe is recorded** (recommended) — the rehearsal proves
  the registration's shape and then takes itself down, so nothing unapproved stays on the public listener whoever runs it; the ~90 s
  of the probe itself remain; a later sitting's code change in `launch/rehearsal.ts` (and the demos that read production afterwards);
- **(d) back to an administrator alone** — `launch:rehearse` granted to `PLATFORM_ADMIN` only; the faculty front-end keeps its
  *"an administrator runs it"* row (its FE-42 option (b)).

**Proposed wording (for (a), (b) or (c); (d) needs only the §20 row):**
- **D24**, the person-only sentence: *"**Three actions are stricter still — *person-only*: approving a release (§13), recording UBC's
  IAM registration or Privacy Office assessment (§9), and archiving or deleting a project (§11).** A delegated token can never be
  minted holding any of them, and a token that asks is refused outright rather than given a pending action, because each is a record
  that a named person decided — and a confirmed retry would let the token make that record."* becomes:

  > *"**Four actions are stricter still — *person-only*: approving a release (§13), recording UBC's IAM registration or Privacy
  > Office assessment (§9), running D21's pre-production rehearsal (§9), and archiving or deleting a project (§11).** A delegated
  > token can never be minted holding any of them, and a token that asks is refused outright rather than given a pending action:
  > three of them are records that a named person decided — and a confirmed retry would let the token make that record — and the
  > rehearsal puts an unapproved release on production's public listener, past anything a token deploys (§20)."*
- **§20**, *Credential classes*, the delegated token's row: *"**Not project creation, archiving or deletion**, which need an
  interactive session (D24, §11)"* becomes *"**Not project creation, archiving or deletion, or D21's rehearsal**, which need an
  interactive session (D24, §9, §11)"*.
- **For (b)**, also §20's step-up bullet: *"… plus archiving or deleting a project …"* gains *"plus running D21's rehearsal, which
  puts an unapproved release on production's public listener"*.
- **For (c)**, also §9's *Pre-production rehearsal (D21)*: after *"before anything is public"*, *"The rehearsal's production instance
  is retired once its sign-in is recorded; nothing it deployed keeps serving."*
- **§13**, the roles list is unchanged (the owner has *"Full control of their own project"*; the collaborator is *"same as owner
  except member management, archiving and deletion"*).

*Coordination with Spec action 3*, which edits the same D24 sentence (*"… **or saying that a request to either was sent** (§9)"*):
the two touch different clauses and compose — whichever is applied second keeps the other's words.

**Published text that already says "(D24)" for the rehearsal** (depends on this action; changes only if the clause does): the
`TOKEN_PERSON_ONLY` summary (`api/error-codes.ts`), `PersonOnlyRefusedError`'s message (`projects/authz.ts`) and the mint's person-only
refusal (`api/routes/tokens.ts`).

**Shared pages:** `manifest-decisions.html` D24 (*"Three things are stricter still, because each is a record that a named person
decided: …"* — becomes four, with the rehearsal's own reason; for (b) and (c) its §9/§20 sentences too); `manifest-schematic.html`
where it describes the launch checklist (check whether it says who runs the rehearsal or that it stays up); `manifest-phases.html` and
`manifest-stories.html` (check, and say so).

**DECIDED — (b) AND (c) TOGETHER (Rich, 2026-09-30, answering a developer-level account of the code: the route, the skipped digest
check, the production secrets, the rehearsal IdP, the public listener, the missing retire). The combined words, APPLIED at his word the same
day (*"apply 8"*)** — the drafted words above with two phrases changed, each marked here and said why:

- **D24**, the person-only sentence (quoted above, as the spec reads at `09e3d7b`), becomes:

  > *"**Four actions are stricter still — *person-only*: approving a release (§13), recording UBC's IAM registration or Privacy
  > Office assessment (§9), running D21's pre-production rehearsal (§9), and archiving or deleting a project (§11).** A delegated
  > token can never be minted holding any of them, and a token that asks is refused outright rather than given a pending action:
  > three of them are records that a named person decided — and a confirmed retry would let the token make that record — and the
  > rehearsal puts an unapproved release on production's public listener **while its sign-in runs**, past anything a token deploys
  > (§20)."*

  *Changed:* **"while its sign-in runs"** added — under (c) it is no longer there afterwards.
- **§20**, *Credential classes*, the delegated token's row — **as drafted**: *"**Not project creation, archiving or deletion, or
  D21's rehearsal**, which need an interactive session (D24, §9, §11)"*.
- **§20**, the step-up bullet: after *"… plus archiving or deleting a project, which take an app away from its students (§11),"*
  insert *"plus running D21's rehearsal, which puts an unapproved release on production's public listener **while its sign-in runs
  (§9)**,"* — before *"plus the admin-only actions of changing the model catalogue and publishing a blueprint"*.
  *Changed:* **"while its sign-in runs (§9)"** added, for D24's reason.
- **§9**, *Pre-production rehearsal (D21)*: after *"… attributes and certificate, before anything is public."* insert:

  > *"The rehearsal takes its production instance down once its sign-in is measured, **before its result is recorded**; nothing it
  > deployed keeps serving."*

  *Changed:* the draft's *"retired once its sign-in is recorded"* → **"once its sign-in is measured, before its result is recorded"**
  — Task 6c's Decision 1 writes the row only after the take-down, so §13's item can never read met while the candidate serves, and the
  draft's words would have said the opposite order.
- **§13** unchanged, as drafted. *Spec action 3* composes with the D24 edit as drafted (*Coordination*, above).

**Shared pages**, as drafted for (b) and (c): `manifest-decisions.html` D24 (three → four, with the rehearsal's reason, and its
§9/§20 sentences); `manifest-schematic.html`'s launch checklist (check); `manifest-phases.html` and `manifest-stories.html` (check, and
say so). **Done at the application**: `manifest-decisions.html`'s D24 (*"Four things are stricter still"*, the rehearsal's own reason)
and D21 (up only for its sign-in, taken down before it records, its runner re-proved); `manifest-schematic.html`'s §9 rehearsal line (the
same sentence) — its *"a rehearsal the platform runs by itself"* in the P6a status paragraph is left, because it records what that
launch did; `manifest-phases.html` and `manifest-stories.html` checked — their rehearsals are load rehearsals and history — unchanged.

---

### 9. §9 and §13 — UBC's order: the privacy assessment first, then the staging registration, then production's (NEW, drafted 2026-09-30 by the planning session `manifest-00` from Rich's own description of UBC's process) — ✅ **APPLIED AS WORDED, 2026-09-30** (Rich: *"Apply as worded"*; `844605b`)

**Why.** Rich, answering Spec action 4: *"In order to get IAM integration, the app needs a PIA … a separate tool to help collect
everything needed by the IAM team (which includes the PIA number) … the process needs to exist in the app as app developed -> apply
for PIA -> once a PIA is given -> provide info to IAM team -> once IAM approval and implementation -> we can now go on the staging
environment -> once tested -> send production details to IAM team -> once received and implemented -> go live in production."* The
spec had three parallel clocks, the staging registration *"the first of the three to start"*. Asked how Manifest holds the order, he
chose *"Gate each step"* — on the owner's *"I've sent it"* only; an administrator's record of UBC's answer is never refused for order.

**Applied**, four edits: §9 *Staging* (*"the second of three steps, in UBC's order … sent only once the privacy assessment is
approved, and its package carries the assessment's reference"*); §9 *Production* (*"sent only once the staging registration is
`active` … What UBC decides … is never refused for order"*); §9 *Privacy Impact Assessment* (*"it comes first"*); §13 (*"They run in
UBC's order, one after another …"*). Two consequential phrases: §6's `PrivacyAssessment` row gains `external_ticket_ref` (the PIA
number), and §19's PIA row also blocks *"sending an app's staging registration"*. **Shared pages**: the schematic (its going-live
mock-up showed the registration with UBC while the assessment was still a draft), the stories (two said *"in parallel"*), the
decisions page's D19, and phases stage 2. **Built by Task 9's `[S9]` block.**

## What the self-review caught

**The self-review ran on 2026-09-29, before sitting 1, against the spec's §6, §7, §9, §10, §13, §19, §20, §26 and D24, and
against this plan's own names.** Each finding was fixed in place.

1. **THE TEST TIERS COULD HAVE REACHED REAL GITHUB.** `.env` carries the six real-App settings by Rich's decision, and a shell
   that sourced it boots the Docker tier's control planes on driver 2 against the real App. No task guarded it. **Task 2's Step 0
   now refuses a Vitest run pointed at a non-loopback GitHub**, before its `TRUNCATE`, and *Global Constraints* says how to run
   the tiers until then.
2. **"No sitting deletes them" was false.** The first Vitest run of sitting 2 truncates the faculty front-end's two projects,
   and `lp-real-a`'s row. *What Rich does* 4 and 5 now say so, and ask before sitting 2.
3. **A closed stream depended on the gateway.** Tasks 5 and 8 closed a revoked credential's streams AFTER ending its agent
   sessions, which can answer `503`. A gateway outage would have left a revoked token listening. Both now close first.
4. **`launch:draft` had no decision.** It appeared in *File Structure* and Task 10, and in no decision. Decision 11 now
   introduces it — mintable, and why.
5. **Decision 17 said "a partial unique index"; Task 12 built a plain UNIQUE.** The decision now says one request per release,
   and why that is enough (a rejection is final for its release).
6. **Task 1 predicted seven event types; the tasks add six** (Task 8 adds fields to `member.removed`). The prediction now says
   six, and names the eight migrations.
7. **Two negative controls corrected themselves mid-sentence** (Task 10's (d), Task 9's (c)), and one referred to a test Step 1
   did not list. Each now names a test its Step 1 writes.
8. **Task 1's administrator was unnamed** — *"as the administrator"*. It is now `operator`, given the role by
   `scripts/admin-grant.sh` as `demo-production.sh` does.
9. **Counts** — *File Structure* said six new codes (it is five) and gave `authz.ts` the wrong tasks. Task 9's migration was
   predicted `0043` when Tasks 2, 4, 7 and 8 come first (`0044`).

**Spec coverage, checked:** §9's staging paragraph (Task 9, Spec action 3); §9's package bullets (Task 10, Spec action 4); §9's
PIA table, row by row (Task 11); §13's *"surfaces them the moment a project is created"* (Tasks 9 and 13 — the records read and
the console show *Draft the request* from week one; nothing is created automatically, and the checklist's `why` names the
draft); §26's queue rows that have entities (Task 12); §7's trim (Task 7); §10's and §20's member rule (Task 8). **Not covered,
deliberately**: §26's domain, audience and override rows (no entity), and D20's alarms (*What this plan does not build*).

---

## What executing this plan found

**The findings count for each sitting is derived at its close, never recalled**:
`awk '/^### Sitting N —/,/^### Sitting N+1 —/' docs/superpowers/plans/2026-09-29-launch-path.md | grep -cE '^[[:space:]]*([0-9]+\. )?\*\*F[0-9]+ '`
— and it goes to the roadmap's defect-rate table, and nowhere else.

### Sitting 1 — 2026-09-29: Task 1, the measurements — and the control plane's first run on real GitHub

**Run in the session that wrote the plan, at Rich's word** (*"write the plan, then run its Task 1 (including the real-GitHub run)
in the same session"*; *"you have my yes to create private repositories in Manifest-local-dev"*). Inline
(`superpowers:executing-plans`), on `main`. The faculty front-end's session (`manifest-app-9d`, its F4 sitting 7, closing) was
told before the restart. It had cleared 7100 at 13:18 (*"restart whenever you're ready"*), holds FE-33, FE-34 and FE-38 *"exactly
as manifest-8b sent them"*, has no new FE-n, and left its two driver-1 projects to Rich's word (*"If you hear nothing, treat them
as disposable"*).

**What it made true**:
- **The control plane has run on the real App.** It stopped on driver 1 (PID 63494) and started on real GitHub from Rich's
  `.env` (PID 31897).
- **`lp-real-a`**, created through the platform, is a private repository in `Manifest-local-dev` holding a commit made through
  the API. It was built from its mirror and is served in the sandbox.
- **A scratch project was deleted, and its repository is gone from GitHub** — twice, the slug taken again between.

And every premise the plan's additions rest on was measured. Commits: `0904ad5` (the plan) and the close-out.

**Findings** (each with the measurement that found it; the README has the raw answers):

1. **F1 The real App's driver adopts the FAKE's orphaned mirrors.** The boot's `sourceRepositoriesPrepared: 2` is
   `frontend-github.git` and `frontend-scratch-github.git` (fake `webUrl`s, no rows). Nothing tells a fake-made repository from a
   real one. → Task 2's `[M1]`.
2. **F2 GitHub shows the PERSON as the author of each commit made through the API** (*"Test Instructor <…@users.manifest.internal>"*).
   → Task 11's `[M1]`, a *where it flows* fact.
3. **F3 `.env.example:78`'s *"nothing deletes"* is wrong**, measured live. → Task 2 Step 7.
4. **F4 `scripts/lib/api.sh`'s `api` cannot send a bodyless `DELETE`** — it always sends `content-type: application/json` (`400
   REQUEST_INVALID`). → Task 2's `[M1]`.
5. **F5 `/key/update` by ALIAS narrows a live key, and the withdrawn model is refused 20 ms later.** Decision 23 holds, simpler
   than planned. → Task 7's `[M3]`.
6. **F6 FE-33 reproduced**: a revoked token's socket open for 30 s, receiving `project.renamed`.
7. **F7 Every provider error falls back** — `400` through `503`, a timeout and a refused connection.
8. **F8 A provider's `422` reaches the client as HTTP `200` with a `null` body**, with no fallback header, the stub called twice. →
   Task 6's `[M5]`.
9. **F9 LiteLLM's `previous_models` is router-wide and shared across requests; `litellm_trace_id` ties an entry to its request.**
10. **F10 A trace-id guard in a LiteLLM callback turns a `400`'s fallback back into the `400`**, and leaves a `503`'s. **Task 6 is
    Branch G.**
11. **F11 `saml-metadata-generator`'s `entityID` is the app URL, its `ID` random, and its endpoints the Shibboleth daemon's**; the
    structure is recorded as `probes/ubc-structure.xml`. → Task 10's `[M6]`.
12. **F12 An app can read an attribute only in its browser code** (the proof app's `mail`, `public/app.js:25`). → Task 10's `[M9]`.
13. **F13 An owner refused `launch:record` is told *"Ask a project owner to grant you the role"*.** → Task 9's `[M8]`.
14. **F14 An administrator's DRAFT registration failed the next SANDBOX build** (`SPEC_ATTRIBUTE_NOT_REGISTERED`); `active` with all
    five built. *Read this first* 7, measured with its positive control.
15. **F15 The build check's tests are `releases/build-attributes.test.ts`**, not `build.test.ts`. → Task 9's `[M8]`.
16. **F16 Four defects in the probes themselves**, each caught by reading the answer: an empty starter ending `set -e` silently, a
    `content-type` on a bodyless `DELETE` (F4's cause), a top-level `return` in `node -e`, and one script's unexplained
    `REQUEST_INVALID`s (replaced by plain `curl`). None reached a record.
17. **F17 Step 1(h) — a push on github.com the platform did not make — was NOT measured**: it is Rich's hands, and it was asked at
    the close.

**Rulings** (the ledger's):
- **Task 1 inline**, because the real-GitHub calls rest on Rich's yes in this conversation.
- **The probes import the control plane's BUILT `dist/`**: Node's strip-only mode refuses `src/`'s parameter properties, and
  `dist/` is `c5f1493`'s, identical to `src/` at `0904ad5`.
- **The cleanup scripts' two orphaned LiteLLM budgets and one dead image were left**. They are the faculty front-end's, made before
  this sitting opened, and deleting a budget resets someone's month.
- **`lp-real-a` keeps an `active` probe registration (`PROBE-T1`), and `operator` stays an administrator** — until the next
  Vitest run truncates both.

**Gates**: no code changed, so none is owed (the LEAN budget). `make doctor` **20/0/0** and `make verify` **61/0/0** at the open;
`pnpm test` **2826 in 180** and `pnpm test:docker` **248 in 41** stand from `11f2526`, not re-run. Contract **`1.4.0`**, 66
operations, 128 codes, 46 event types; **40 migrations**.

**The machine at the close** (queried at 13:53–13:56, 2026-09-29, not remembered):
- **THE CONTROL PLANE RUNNING ON REAL GITHUB** — PID 31897 on 7100, from `.superpowers/sdd/2026-09-29-launch-path/cp-start.sh` (git-ignored; sitting 11a's, unchanged), boot line
  `"source":"github","github":"api.github.com","githubOrg":"Manifest-local-dev"`. **The front-end's `my-weekly-thoughts` and
  `notes-and-answers` answer `409 SOURCE_PROVIDER_MISMATCH` until a restart on driver 1**, and their containers still run.
- The control database:
  - `my-weekly-thoughts`, `notes-and-answers` and `lp-real-a` active; `lp-real-scratch` deleted, twice;
  - users `ins000001` (member) and `opr000001` (**admin**, granted by this sitting, audited).
- **GitHub**: `Manifest-local-dev` holds exactly `lp-real-a` (private; `main` at `cec7653`).
- **`lp-real-a`'s sandbox** is healthy at `https://lp-real-a.sandbox.manifest.internal/` (`mf-lp-real-a-sandbox-*`).
- 7102 and 7105 are the faculty front-end's.
- **No probe container, stub, LiteLLM probe model, fallback, key or user** is left (LiteLLM: 0 named `probe`).
- Load 6–7.

**The four shared HTML pages, checked, and unchanged**:
- `manifest-phases.html`'s *"an app's code can live on (practice) GitHub"* and `manifest-schematic.html`'s status still describe what
  is BUILT — this sitting ran a measurement, not a feature;
- no spec action was applied, so `manifest-decisions.html` does not move;
- `manifest-stories.html` names no GitHub or hostname rule this sitting touched.

### After sitting 1's close — 2026-09-29: FE-39, relayed as Rich's decision, written in as Task 8a (sitting 5a) and Spec action 7

The faculty front-end's session (`manifest-app-9d`) sent FE-39 *"at Rich's word"*: only faculty build, for now, plus a prescribed
list of administrators, decided by the platform so it holds for agents too. Rich found it by signing in as the laptop's `student`
and starting an app. **Relayed, so first PROPOSED** — then **confirmed by Rich the same evening** ((Rich, 2026-09-29, answering Spec action 7's three open choices: *"1. YEs, PUID 2. YEs keep but no new. 3. literally just those with 'faculty' as their affiliation"*)); the
plan was updated in place. As first written: *Relayed as Rich's decision — to confirm*, *What Rich does* 9, Decisions 26–31, Task 8a
in its own sitting 5a, and Spec action 7. Its open choices are the administrators' list by PUID (recommended — a CWL login can be
reassigned) or by login; what a person who stops being faculty keeps; and which affiliations count at UBC. Writing it found that
**`demo-frontend` and `demo-token` add `student` as a member**, which the rule refuses; so a second faculty test user, `colleague`,
is proposed. The laptop IdP already releases `eduPersonAffiliation` for all three test users.

### Sitting 2 — 2026-09-29: Tasks 2 and 3 — what real GitHub found, and F26

**Run after Rich's review** (his first message: the plan *"approved as written, thirteen sittings"*; the three rows allowed to go at
the first Vitest run; the control plane left on real GitHub; *"Land Task 2's Step 0 … first and alone"*; *"you have my yes for Task
2's Step 6 real-GitHub check"*; FE-28 to FE-32 not in this plan — *"FE-30 and FE-28 in a sitting of their own after it"*; the
commit-author question left open; `make refresh-vulndb` not due until after 2026-10-06). **Subagent-driven**
(`superpowers:subagent-driven-development`), on `main`, session `manifest-13`: an implementer and a reviewer per task, one fix round
(Task 3), one whole-branch review and one fix wave. The faculty front-end's session was told before the first truncation
(`manifest-app-9d`: *"go ahead, nothing of ours is on 7100"*), and its successor `manifest-app-ce` was answered mid-sitting. **Rich
paused the sitting for a demo** of the live platform, which could not run (F14), and then said *"Please finish your work"*.

**What it made true**:
- **The test tiers refuse a real GitHub** (Step 0, `a816502`, landed first and alone): `src/test-tier-guard.ts`'s
  `realGithubRefusal`, the first statement of the global setup both tiers run, refuses when `MANIFEST_SOURCE_DRIVER=github` and a
  `MANIFEST_GITHUB_*_URL` names a non-loopback host — printing the host, never the value — before the repository root is removed or a
  table truncated. Its control ran while the database still held the day's rows: two refusals (the API URL, then the git URL) left
  `projects` at 5 and `users` at 3; the positive control, unset, truncated them to 0.
- **A create that fails after the driver made the repository destroys it** (`7e5f615`), logging a failed destroy with
  `console.error` and answering the original error; a clash refused inside `createRepository` never reaches the destroy (the final
  fix wave's route test, watched red).
- **A project names the GitHub it lives on**: `source_repositories.api_host` (migration `0040_keen_northstar`, nullable — rows older
  than it are answered by any host of the same provider), written at creation from the driver's new `identity()`, compared by
  `repositoryOf`, which refuses `409 SOURCE_PROVIDER_MISMATCH` naming both hosts before GitHub is asked. **Never published**:
  `linkOf` returns `PublishedRepositoryLink`, and `openapi.json` did not move (contract `1.4.0`).
- **The boot leaves another GitHub's mirror alone** (sitting 1's F1): `sourceRepositoriesPrepared` read **1** at the restart onto the
  real App (sitting 1 read 2 — the fake's two orphans).
- **The demos refuse real GitHub by name** (`require_fake_github`, before any fake health check in `demo-authoring`, `demo-frontend`
  and `demo-github`); **`scripts/github-real-repos.sh`** lists the organisation against the projects that own it and deletes one
  `NONE` repository at a typed `yes`; `scripts/lib/api.sh` sends `content-type` only with a body (sitting 1's F4); `dead-app-resources.sh`
  names orphan mirrors; RUNBOOK's *On the real App*; `.env.example`.
- **F26 is drained centrally** (`7bf40b6`, `20838d4`, `60ff3cd`): `registerBackgroundWork`/`drainBackgroundWork` in `db/testing.ts`;
  `resetDatabase` awaits every retirer, build runner and source sync a test built before it truncates. `api/delivery.test.ts` alone,
  eight runs each: **1 of 8 red (2 `deadlock detected`) before, 0 of 8 after**, no `[retire] … failed` line either way.
- **Step 6 — Rich's yes, the network on — green**, on the control plane restarted onto `7e5f615` (16:16): `github-real-repos.sh` read
  `lp-real-a  NONE` (its row truncated, as Rich allowed; the repository stays on GitHub — his to remove); `lp-real-b` created (8 s,
  private, `mainProtected: false` with GitHub's words), `api_host` = `api.github.com` in `psql`, listed `live`, stepped up, deleted
  (1 s, through `api.sh`'s bodyless `DELETE`), gone from GitHub and the mirror. The listing's first real run (the fake serves no
  `/installation/repositories`).

Commits: `a816502`, `7e5f615`, `7bf40b6`, `7a2135d`, `20838d4`, `60ff3cd`, `46f3988`, and the close-out.

**Findings** (each with what found it):
1. **F1 The plan's `repositoryOf` interface was not the code's.** It gave `(db, projectId, running)` with *"every caller passes
   `deps.source.identity()`"*; the code is `(deps, project)` with eight callers passing `deps`. Ruled at the pre-flight scan: the
   signature stays and `SourceDriver` gains `identity()`, so no call site moved.
2. **F2 The plan's `githubDeps({ failHeadCommitOnce })` does not exist** — the test wraps `githubTestDeps(fake).source`'s `headCommit`.
3. **F3 Step 6's prediction (`lp-real-a  live <id>`) was false by construction** once the first Vitest run truncated the row; Rich's
   answer 3 said so, and `NONE` was predicted and read.
4. **F4 Task 1's `[M1]` added four items Task 2's *Files* list omitted** (`prepare()`'s skip and its test, `dead-app-resources.sh`'s
   mirrors, `api.sh`'s header, a TRAPS line) — built.
5. **F5 Control (c) could have stayed green for the wrong reason**: the fake is not running, so `demo-authoring`'s step 0 refuses on
   the fake's health with the guard removed. The control asserts the guard's own words.
6. **F6 Before `api_host`, a project made on another fake was already refused `409` — as `SOURCE_GIT_FAILED`**, after the driver had
   reached for the repository (Task 2's RED). A status-only assertion would have been green for the wrong reason.
7. **F7 The plan put `github-real-repos.ts` in `packages/journey`, whose boundary test admits only `@manifest/contract`** — it is
   `src/source/github/real-repos.ts` and `real-repos-main.ts`, run from the built `dist/` (git-ignored) as Task 1's probe was.
8. **F8 The GitHub fake serves no `/installation/repositories`**, so the unit test answers that one path with a spy and Step 6 was the
   listing's first real exercise (2 repositories, `total_count` asserted).
9. **F9 The plan's own F26 test could not tell an AWAITED drain from one merely called.** The TRUNCATE outlasts its 50 ms window, so a
   `void drainBackgroundWork()` variant stayed green, and the drain-removed control went red at a different assertion than predicted.
   Found by the task review; fixed with a sentinel row the held pass reads, and both variants watched red (`drained-after-truncate`).
10. **F10 `require_fake_github`'s FAIL text could defeat the guard** (the whole-branch review's I1): the guard reads `.env`, so
    commenting the block out WITHOUT restarting would pass while the control plane still ran the real App. The text now says to
    restart; control (c) re-run.
11. **F11 No route test held *"a clash never reaches the destroy"*** (I2) — added, and watched red (`expected 404 to be 200`) with the
    route believing it had made the repository.
12. **F12 `sourceSync`, the third background worker in `ServerDeps`, was not drained** (M2) — registered in the fix wave.
13. **F13 `SOURCE_PROVIDER_MISMATCH`'s published description no longer covers every cause** (M1): `error-codes.ts` says *"made by a
    different source driver"*; the same driver on another GitHub is new. The runtime message names both hosts. **The contract is
    frozen this sitting, so it waits for Task 4, which takes `1.5.0`** — and the front-end is told then.
14. **F14 Rich's demo could not run** (mid-sitting): `app.manifest.internal` sends `/v1` and `/auth` to 7100 and everything else to
    7105, which ran the faculty front-end's server with `MANIFEST_APP_MODE=mock` (origin `http://127.0.0.1:7105`, asking 7102). A real
    session met a mock-mode server; the page showed `0565-503F`, and the report never reached the front-end's problem store (its newest
    row was 20:00Z) — refused, by inference, the same way: its server logs nothing for a refused request. Not this platform's code; told to
    `manifest-app-ce`.
15. **F15 Left, and recorded for the sitting whose paths they touch**: `real-repos.ts` deletes by `.env`'s org, not the listed
    `fullName` (fails safe — `source/`, so the next sitting that touches it); hosts compared as spelled (`localhost:7110` and
    `127.0.0.1:7110` are two GitHubs to `api_host`); the drain has no time bound (a stuck `idle()` is an unnamed 10 s hook timeout);
    `source-repositories.test.ts` leaves an `lp-hosts` row until the next run; `dead-app-resources.sh` reads an unreadable mirror as
    driver 1's; both `.env` readers miss an indented line.
16. **F16 The Docker tier prints no control-plane boot line into its output**, so the plan's *"read one tier control plane's boot line
    to prove it"* could not be done that way; the shell's `MANIFEST_*` count (0) and Step 0's guard stand in.
17. **F17 The fix wave's own new test broke the module boundary**, and only the close's whole-suite runs saw it: `pnpm test` read
    **2853 passed, 1 failed, twice** — `module-boundaries.test.ts`'s *"never imports another module by a deep path"*, naming
    `api/projects.test.ts: from '../source/github/git.js'` — because the fix wave ran single files. The helper moved into
    `source/testing.ts` (`lsRemoteMainAsPerson`, `46f3988`) and both runs were repeated on the new tree.
18. **F18 RUNBOOK said the offline acceptance has *"FOURTEEN steps, 1 to 14"*** while `scripts/offline-acceptance.sh` has steps 1 to 15
    since the front-end enablement plan's sitting 12 (ORIENTATION §2 and CLAUDE.md had it right) — found by this sitting's sweep.
19. **F19 The roadmap's Phase 2 row still said the launch path was *"NOT YET WRITTEN"*** — stale since the plan was written the same
    morning; found by this sitting's sweep.
20. **F20 The hand-off's first draft said the platform held *"no project"* at the close** — written before the close's re-run of
    `webhook.docker.test.ts`, which leaves `gh-hooks`; `psql` said one. Found by the post-sweep check, opening what §7e pointed at.

**Rulings** (the ledger's, in order): Q5 (the github.com push) came back with both options — measured instead: a build of `{}` and a
read at 15:13–15:14 left the mirror's `main` at `cec7653`, so no push was made and sitting 1's F17 stays unmeasured; `repositoryOf`
keeps its signature (F1); the failure injection (F2); Step 6 predicts `NONE` (F3); `[M1]`'s items built (F4); `api_host` never
published; Step 6 run by the controller; control (c) asserts words (F5); the drain clears its set (only `auth-page.test.ts` builds
`testDeps()` in a `beforeAll`, and it retires nothing — the doc comment says so); the F26 test made deterministic (F9); one fix wave
for I1, I2, two FIX-NOW minors, M2 and M4; M1, M3, M5–M8 left (F13, F15); `litellm-orphans.sh --apply` NOT run — its one mode also
deletes the front-end's person budget and the platform's intake budget (resetting their month), as sitting 1 ruled.

**Negative controls**, each after its commit and restored from git: Step 0 (the guard's call removed → the refused run ran; restored →
refused); Task 2 (a) the destroy removed → red at the fake's repository; (b) `repositoryOf` provider-only → red at `SOURCE_GIT_FAILED`
where `SOURCE_PROVIDER_MISMATCH` belonged, its positive control green; (c) `require_fake_github` on a missing key → step 0 no longer
printed the guard's line; Task 3 `void drain` → red `drained-after-truncate`, drain removed → 3 of 3 red; I2 → red `expected 404 to be
200`. **None could not fail.**

**Gates** (on the final tree, `60ff3cd`): `pnpm test` **2854 passed, 0 skipped, in 183 files**, twice on `46f3988` (711 s and 710 s alone, load ~3.5–4.2;
`deadlock detected` **0** in both — F26's first whole runs with the drain; one `[retire]` line each, `retire.test.ts`'s deliberate one)
— up from 2826 in 180 (+28 tests; +3 files: `test-tier-guard.test.ts`, `source/github/real-repos.test.ts`, `db/testing.test.ts`); its
first two runs, on `60ff3cd`, read 2853 and one red (F17). `pnpm lint`, `pnpm typecheck` and `pnpm format:check` clean. `pnpm
test:docker` **248 in 41**, 1231 s, green FIRST run, alone (the whole-branch reviewer reading only), on `20838d4` — owed by `source/`;
after the fix wave, `source/github/webhook.docker.test.ts` alone on `46f3988`, 1 of 1 — the one Docker file in which the wave's
source-sync registration waits on anything. `make doctor` **20/0/0** and `make verify` **61/0/0** after the restart. Contract
**`1.4.0`**, unchanged (66 operations, 128 codes, 46 event types); **41 migrations** (`0040_keen_northstar` newest).

**The machine at the close** (queried 18:49–18:52, not remembered): - **THE CONTROL PLANE RUNNING ON REAL GITHUB** — PID 49186 on 7100, restarted 18:49 from the git-ignored
  `.superpowers/sdd/2026-09-29-launch-path/cp-start.sh` (unchanged), boot line
  `"source":"github","github":"api.github.com","githubOrg":"Manifest-local-dev"`.
- **The control database**: one project, **`gh-hooks`** — left by the close's re-run of `webhook.docker.test.ts` (driver 2 on a fake,
  `api_host` `127.0.0.1:60083`, so the real-GitHub control plane refuses it `SOURCE_PROVIDER_MISMATCH`) — and its one user. The
  front-end's `my-weekly-thoughts` and `notes-and-answers` and `lp-real-a`'s row are gone, as Rich allowed.
- **GitHub**: `Manifest-local-dev` holds exactly `lp-real-a`, owned by no project (`github-real-repos.sh`: `lp-real-a  NONE`).
- **Mirrors** `dead-app-resources.sh` names and never removes: `frontend-github.git` and `frontend-scratch-github.git` (the fake's)
  and `lp-real-a.git` (real).
- **Containers**: the truncated projects' apps still run (`make verify`'s INFO: `mf- containers=33 networks=11 volumes=22`); **no
  runtime route is applied** (the Docker tier restarted the edge, and no row remains to re-apply one).
- **Cleanup**: `dead-app-resources.sh` 0 dead after its `--apply`; `app-images.sh` 0 dead after its `--apply` (it took the front-end's
  dead `my-weekly-thoughts` image too); `litellm-orphans.sh` reads 3 orphaned — `p4b-probe-user`, the front-end's person budget and
  the platform's intake budget — **not applied** (a budget's deletion resets its month; its one mode takes all three).
- **7102 and 7105 are the faculty front-end's** (its server in MOCK mode); **nothing on 7104** (the console is not running).
- **Not this project's**: the `cwl-spike-*` containers (up), and `openwebui-verify-*` (gone since the open) — another session's.
- Load 5–7.

**The four shared HTML pages, checked, and unchanged**: no spec action was applied this sitting, and none describes the source
driver's test guards, `api_host` or F26.

### Sitting 3 — 2026-09-29: Tasks 4 and 5 — FE-38's `createdAt` (contract `1.5.0`) and FE-33's stream registry

**Run after Rich's answers in its first message** (FE-40 *"Confirm"*; the control database DUMPED before the first truncation — it held
`gh-hooks` and one user; `lp-real-a` left on GitHub; the control plane left on real GitHub at the close). **Subagent-driven**
(`superpowers:subagent-driven-development`), on `main`, session `manifest-c3`: a pre-flight scan against the code (its table and seven
rulings are the ledger's), an implementer and a reviewer per task (Task 4 sonnet, Task 5 opus), one fix round each, one whole-branch
review beside the Docker tier, and one fix wave. The faculty front-end's session (`manifest-app-a0`) was told before the first
truncation, before each commit touching `packages/contract` or `packages/mock` and after each landed; it adopted `1.5.0` at `d894b8e`
(its typecheck and 1248 tests, twice) and stayed off 7100 until this close (its F5 sitting 1 waits on it, Rich's word).

**What it made true**:
- **Every instance says when the deploy made it** (`d894b8e`, `2a26547`): `instances.created_at` (migration `0041_broad_power_man`,
  hand-written: added nullable, backfilled from its release's `created_at` — the earliest it could have been made — then `NOT NULL`,
  `DEFAULT now()`; the snapshot carries it, so `db:generate` after it reports no change), `Instance.createdAt` (and so
  `InstanceSummary`'s) on `deploy`, `listInstances` and `getEnvironment`, every published example and mock fixture. **Contract `1.5.0`**
  — the plan's ONE bump, in its three carriers (`document.ts`, `packages/contract/package.json`, `openapi.json`), covering Task 5 and
  every later task. `SOURCE_PROVIDER_MISMATCH`'s description names the same-driver, other-GitHub cause (sitting 2's F13).
- **A stream whose credential is gone is closed at the moment it goes** (`4bac1cf`, `9ac609d`): `observability/streams.ts`, ONE registry
  per process (built at boot beside the bus, carried in `ServerDeps` and the lifecycle's deps); `streamProject` registers before its
  second authorization read and re-reads a token actor's token after registering (the race window); an expiry timer per stream —
  token AND session — clamped to `2 ** 31 - 1` and re-armed; `revokeToken` closes `4401` after the revoke commits and BEFORE
  `endSessionsOf` (a gateway outage never leaves a revoked token listening — tested); the archive closes the tokens its transaction
  revoked, after it commits; a delete closes its tokens' streams `4401` at the switch-off and the rest `4404` at the tombstone;
  `closePerson` for Task 8; an `onClose` hook. `closeCodes` gains `4401` (*"The credential was revoked or expired. Get a new one —
  sign the person in again, or ask them for a new token; reconnecting with the same credential is refused."*); `revokeToken`,
  `archiveProject` and `deleteProject` each say what they close; `events.md`, `agents.md`, `authentication.md`, `frontend.md`.
- **FE-40 CONFIRMED by Rich** — recorded in its section, Task 13's block, ORIENTATION §8 *Decided* and the roadmap.

Commits: `d894b8e`, `2a26547` (Task 4); `4bac1cf`, `9ac609d` (Task 5); `84d485a` (the final fix wave); and the close-out.

**Findings** (each with what found it):
1. **F1 Task 4's premise was false**: a failed deploy's instance IS stamped `lastSeenAt` at its health verdict (`releases/release.ts:811`,
   the column's only writer), and the list is `last_seen_at desc nulls last` (`projects/repository.ts:334`) — so a real failed deploy B
   lists FIRST, and the plan's `list[0].id toBe(a.id)` could not hold. The one real state where age and published order disagree is an
   instance a deploy has made and not yet seen; the test models B as that row. Found by the implementer's RED.
2. **F2 Task 4's *Files* omitted `packages/contract/package.json`**, the version's third carrier (`document.ts`'s own comment names
   three) — the pre-flight scan.
3. **F3 The plan named test files and helpers that do not exist**: `src/releases/release.test.ts` (Task 4), `src/releases/lifecycle.test.ts`
   and the `openStream`/`revoke`/`rename` helpers (Task 5) — the pre-flight scan; every FE-33 case lives in `api/events.test.ts`, which has a
   listening server.
4. **F4 Task 5's interface consumed `TokenActor.expiresAt`, which did not exist** — the pre-flight scan; added (epoch ms, as
   `SessionActor`'s).
5. **F5 `0041`'s backfill ran only against empty tables** (every Vitest run truncates) — the controller ran its exact statements on three
   rows in a scratch schema, rolled back: each instance dated by its release, `NOT NULL`, `DEFAULT now()` on insert.
6. **F6 Task 4's first test bounded the DATABASE's `now()` with the HOST's `Date.now()`** (±2 s) — ORIENTATION §4 trap 14. The task
   review ranked it Minor (*"not flaky here"*); the controller raised it, because that is exactly the trap's shape. Now bounded by
   `clock_timestamp()` read from the database (`2a26547`).
7. **F7 That bound then compared the driver's millisecond `createdAt` with the database's microsecond floats exactly** — a flake if the
   INSERT's `now()` fell within 1 ms of either reading (the re-review); `Math.floor`/`Math.ceil` (`9ac609d`).
8. **F8 `getOpenApiDocument`'s published example still said `1.4.0`** (Task 4's review) — it now reads `CONTRACT_VERSION`.
9. **F9 The widened `SOURCE_PROVIDER_MISMATCH` description omitted that a row older than `api_host` is answered by any host of the
   provider** (Task 4's review; `notMadeByRunning`) — one clause.
10. **F10 THE AUTHORIZATION → REGISTRATION WINDOW WAS REAL.** A revoke that committed after the upgrade's credential hook read the
    token and before the stream registered called `closeToken` on nothing, and the stream stayed open FOR GOOD. Named by the pre-flight
    scan (the front-end enablement plan's sitting 8 found three windows of this shape); the implementer drove it DETERMINISTICALLY
    without a production hook — a second connection holds `UPDATE … revoked_at` uncommitted, the hook's own `touchToken` blocks on the
    row, the test waits for the lock in `pg_stat_activity`, then commits — and watched it red before the fix. Fixed by registering
    before the second authorization read and re-reading a token actor's token after registering; held by control (d) alone.
11. **F11 The archive revokes inside a transaction**, so a close there would announce a revoke that could still roll back — the
    pre-flight ruling: close the ids after the transaction resolves. By construction, not by a test (no seam rolls it back).
12. **F12 The plan's delete test name (*"every stream on it, 4404"*) contradicted its own Step 3**, which routes a delete's tokens through
    the shared switch-off that closes `4401` — ruled: token streams `4401` at the switch-off, the rest `4404` at the tombstone (the same
    rule Task 8 states for a removed member).
13. **F13 `@fastify/websocket` 11.3.0 lets `app.close()` resolve while a stream is still registered** — its `preClose` sends each socket
    a close frame and calls `done()` at once. Measured by control (e) (`expected 1 to be +0`); the route's `onClose` hook stops every open
    stream, so no entry or timer outlives a server (TRAPS.md).
14. **F14 Review Focus 3's *"within one second of the revoke, and within one second of expiresAt"* was asserted by nothing** — the
    expiry tests held only *not before* (Task 5's review, a Minor raised to Important by the controller as a stated requirement). All
    four revoke tests and both expiry tests now bound the close under 1000 ms (a 5 ms early tolerance for Node's timers).
15. **F15 The expiry tests fixed `expiresAt` 1.5 s ahead BEFORE the mint** — under Rich's Zoom-level load, setup alone could eat it
    and read as a false red at the ready frame (Task 5's review); +2.5 s, the close awaited 4 s.
16. **F16 The race test's lock poll was cluster-wide — and `datname = current_database()` alone would not have fixed it**, because the
    dev control plane on 7100 shares `manifest_control` with the unit tier; scoped exactly by `$1 = ANY(pg_blocking_pids(pid))` on the
    test's own lock connection.
17. **F17 The plan's `4401` text was token-only** (*"Ask the person for a new one"*) while a session stream closes `4401` at its expiry
    (the pre-flight ruling that armed sessions) — plan-mandated wording amended to cover both.
18. **F18 A thrown `null` in the registry's report line threw a `TypeError` out of its catch**, aborting the remaining closes and turning
    a revoke into a `500` (Task 5's review) — red first (*"Cannot read properties of null (reading 'code')"*), guarded.
19. **F19 The mock never closes a stream `4401` or `4404`** — told to the front-end's session, not built (FE-40-shaped).
20. **F20 The fix's own test repeated trap 14** — B's `createdAt` built from `rowA.lastSeenAt` (the host's `new Date()`) and compared with
    A's database `createdAt` (the whole-branch review's M1; `84d485a`).
21. **F21 `InstanceList` said *"newest first"*** — false against its `lastSeenAt` order since before this range, and now against
    `createdAt` (M2; reworded, contract regenerated under `1.5.0`).
22. **F22 Task 4 put the mock's instances BEFORE their release** (08:59 and 08:39 against the release's 09:00) — contradicting `0041`'s
    own rule (M3; moved after it, order kept). **And, older than this range, the mock's failed instance has `lastSeenAt: null` where the
    platform stamps a failed deploy** — told to the front-end, which judged it needs no FE-n (nothing of its reads the order any more).
23. **F23 The stream route's catch read `.statusCode` off a thrown value before reporting** — a thrown `null` would escape AFTER
    registration, leaving an entry and its timer until expiry (M7); null-safe, and the stream stopped in a `finally`.
24. **F24 *"Hears nothing after the revoke"* was asserted on a socket already seen closed, so it could not fail** (M8) — MEASURED: with the
    route's unsubscribe deferred and `send`'s guard removed it stayed green (a CLOSING socket refuses `send`), while `listenerCount` and
    `closeToken(...) === 0` went red in three tests. Labelled with what holds the claim.
25. **F25 Two stale texts**: `LifecycleDeps.streams`' *"a delete … every stream `4404`"* (M4) and the front-end's own guide's
    `listInstances` paragraph not naming `createdAt` (M5).
26. **F26 The fix wave's commit was about to carry the wrong model in its attribution trailer** — caught reading the report, corrected
    before the commit.
27. **F27 CLAUDE.md's *State*, ORIENTATION's top box and two of its §3 rows each said *"its sittings 1 and 2 have run"*** — a sitting
    statement each of them says it never makes (Rich, 2026-09-24), stale the moment this sitting closed. Found by this sitting's sweep;
    each now says the plan is in execution and points at its sittings table.

**Rulings** (the ledger's, in order): the pre-flight scan's seven — no second version bump (`1.5.0` covers the plan); `package.json` and
F13's description carried into Task 4; the implementers stop before a commit touching `packages/contract` or `packages/mock` and the
controller tells the front-end; the archive closes after its transaction commits (F11); the race window closed by registering first
and re-reading the token (F10); a session stream's expiry armed too; `closePerson` built now for Task 8. Then: Task 4's never-seen-B
test shape accepted (F1); trap 14 raised from Minor to Important (F6); Task 4's contract minors folded into Task 5's regeneration
(F8, F9); the delete's split codes (F12) and `closePerson` closing session streams only (Task 8's own test); the three description
clauses and the registry-owned timer accepted; Review Focus 3's bound raised to Important (F14) with five cheap minors bundled into the
same round because no `src/` edit may land while the Docker tier runs; the final wave's seven items, and M6 and the mock's `lastSeenAt`
left (F22); the wave owed no Docker re-run (a comment in `releases/`, and neither Docker file that names the stream opens a socket);
`litellm-orphans.sh --apply` NOT run — the same three as sittings 1 and 2, one mode deleting a person's and the platform's budgets.

**Negative controls**, each after its commit and restored from git: Task 4 — `createdAt` mapped from `lastSeenAt` → red as PREDICTED,
at the list request (`expected 500 to be 200`, `ResponseContractError … at: instances.1.createdAt`), not at `toBeGreaterThan`, because the
representation refuses a null first; its fix round's two — a constant `createdAt` red at the order assertion, a −10 minute shift red
at the database-clock window. Task 5 — (a) `closeToken` removed from `revokeToken` → 4 red; (b) `closeToken` closing the whole project →
the 2 positive controls red, the single-stream tests green (the positive controls earn their place); (c) the timer dropped → both expiry
tests red; (d) the post-registration re-read removed → ONLY the race-window test red; (e) the `onClose` hook removed → red, and a
measurement (F13). The fix wave's M8 control stayed GREEN at the assertion it tried to break — which is the finding (F24), not a pass.
**One control could not fail as written (F24); none other.**

**Gates** (on the final tree, `84d485a`): `pnpm test` **2875 passed, 0 skipped, in 184 files**, twice (710 s and 703 s alone, load ~4–6.5;
`deadlock detected` **0** in both; one `[retire]` line each, `retire.test.ts`'s deliberate one) — up from 2854 in 183 (+21 tests; +1 file,
`observability/streams.test.ts`). `pnpm lint`, `pnpm typecheck` and `pnpm format:check` clean. `pnpm test:docker` **248 in 41**, 1181 s,
green FIRST run, alone (the task re-review and the whole-branch reviewer reading only, no Vitest beside it), on `9ac609d` — owed by
`observability/` and `releases/`; the count did not move (two Docker files gained a `streams` line, no case); the fix wave after it
owed no re-run (the rulings above). `make doctor` **20/0/0** and `make verify` **61/0/0** after the close's restart. Contract **`1.5.0`**;
**42 migrations** (`0041_broad_power_man` newest).

**The machine at the close** (queried 21:13–21:17, not remembered):
- **THE CONTROL PLANE RUNNING ON REAL GITHUB** — PID 98101 on 7100, restarted 21:13 onto `84d485a` from the git-ignored
  `.superpowers/sdd/2026-09-29-launch-path/cp-start.sh` (unchanged), boot line
  `"source":"github","github":"api.github.com","githubOrg":"Manifest-local-dev"`, `sourceRepositoriesPrepared: 1`.
- **The control database: EMPTY** — 0 projects, 0 users (the close's two unit runs truncated it; `gh-hooks` went at the first run, as
  Rich allowed, after the open's dump). **The dump**: `.superpowers/sdd/2026-09-29-launch-path/manifest_control-before-sitting3-2026-09-29.dump`
  (`pg_dump --format=custom`, 79 KB; `gh-hooks`, one user, 0 instances, 41 migration rows — a `--clean` restore needs `db:migrate`
  after, and a data-only restore collides with today's 42-row migrations table).
- **GitHub**: `Manifest-local-dev` holds exactly `lp-real-a`, owned by no project (`github-real-repos.sh`: `lp-real-a  NONE`) — left, at
  Rich's word.
- **Mirrors** `dead-app-resources.sh` names and never removes: `frontend-github.git`, `frontend-scratch-github.git` (the fake's) and
  `lp-real-a.git` (real).
- **Containers**: 33 `mf-` (`make verify`'s INFO: `mf- containers=33 networks=11 volumes=22`), unchanged from the open; **no runtime route
  applied**.
- **Cleanup**: `dead-app-resources.sh --apply` (the tier's 7 networks and 1 volume) and `app-images.sh --apply` (14 dead) — both ALLOWED,
  both re-measured 0 dead; `litellm-orphans.sh` reads the same 3 as sittings 1 and 2 — **not applied** (ruling above).
- **7102 and 7105 are the faculty front-end's** (node 35047 and 49070 — restarted by its session during this sitting, its mock on
  `1.5.0`'s fixtures); **nothing on 7104**.
- **Not this project's**: the `cwl-spike-*` containers and `openwebui-openwebui-1` (another session's). **Ollama moved 0.34.4 → 0.35.0**
  during the sitting (its own updater — nothing here upgrades it; the Docker tier was green on it). **Free disk 114 → 95 GiB**: not
  attributed — Docker's build cache holds 25 GB, 21 GB reclaimable, and `docker builder prune` is machine-wide, so it is Rich's.
- Load 3–4.

**The four shared HTML pages, checked, and unchanged**: none describes an event stream, a close code, the contract's version or an
instance's time; their two *revoked* mentions are of tokens in general. No spec action was applied this sitting.

### After sitting 3's close — 2026-09-29: F5 sitting 1 on 7100, an administrator granted at Rich's yes, and FE-41 and FE-42 confirmed

- **The faculty front-end's F5 sitting 1 ran on 7100** (04:20–04:40Z, at Rich's word to it): ONE project, `f5-reading`, made through its
  UI as `instructor` — a REAL private repository `Manifest-local-dev/f5-reading` — and LAUNCHED to production (04:39:16Z). It released
  7100 needing none of it kept; **the repository is Rich's to remove**.
- **`operator` (`opr000001`) was made a platform administrator** with `scripts/admin-grant.sh`, at the front-end's request and **Rich's own
  yes to sitting 3's session** (a peer's relay is not his approval); read back `admin`.
- **A spend-log read for its measurement** (*does an aborted stream stop billing?*): LiteLLM's `LiteLLM_SpendLogs` billed the cut
  stream **594 completion tokens, $0.0014973** — what it streamed (~2,354 chars), not a whole answer; the three calls sum to the
  session's `spentUsd` step exactly. LiteLLM's accounting, from the chunks it relayed; the provider's own is not visible here.
- **FE-41 and FE-42 relayed at Rich's word, then CONFIRMED by him to sitting 3's session** (their section above): FE-41 → Task 6a in
  sitting 4; FE-42 → Task 6b in a new sitting 4a. **18 tasks in 14 sittings.**
28. **F28 The close-out's own**: the sittings table's row 4, edited at sitting 3's close, carried `||` before its marker — an empty
  seventh cell — found while adding row 4a, and fixed.

### Sitting 4 — 2026-09-29/30: Tasks 6a and 6 — FE-41 (a repository GitHub made seconds ago, retried) and FE-34 (the fallback guard); Spec action 6 applied

**Run after sitting 3's close and Rich's two answers to it** (*"yes for real github"* for Task 6a; Spec action 6 *"(a) is good"*), by
session `manifest-a1`, **subagent-driven** on `main`: an implementer and a reviewer per task (both opus; re-reviews sonnet or opus),
one whole-branch review beside the Docker tier. **Task 6a first** (it needed no spec action), then Spec action 6 applied, then Task 6.
Peers: the faculty front-end (`manifest-app-a0` → `-e2` → `-58` → `-6d`/`-6b`, mock mode throughout — *"truncate freely"*, *"restart
LiteLLM as often as you need"*); `manifest-c8` (no task; held everything); **`manifest-73`, Rich's session for sitting 4a, waiting
read-only for this close** — and, relayed by it, Rich's answer for 4a (below). The database was DUMPED before the first truncation:
`.superpowers/sdd/2026-09-29-launch-path/manifest_control-before-sitting4-2026-09-29.dump` (120 KB; `f5-reading`, `ins000001`,
`opr000001` admin, 8 instances).

**What it made true**:
- **A project created on driver 2 survives GitHub's first seconds** (`0f2275a`, `fd2de69`, `9c9972a`, `f054bd9`, `ebfc571`). **FE-41's
  premise was false — it is not the starter.** Real GitHub answers a repository it created seconds earlier as REFUSED over git, for
  ~2–4 s, with or without a starter, in at least four measured shapes (`spikes/launch-baseline/`'s *Sitting 4* section has every
  answer). Driver 2's `createRepository` now retries its seed push and its first fetch **while GitHub refuses the NEW repository 403 or
  404, by status, in whatever words git prints it** — one budget of at most ~30 s per creation (`[1000, 2000, 4000, 8000, 15000]` ms,
  shared), a FRESH token for every retry, an operator line for every retry — and nowhere else (a 404 after the creation window means
  gone). A failed create writes an operator line naming its code and cause (FE-41's *"nothing was logged"*). The GitHub fake learns
  the lag as TEST-ONLY quirks (`notFoundAfterCreate`'s `push`/`fetch`/`pushPack`/`fetchPack`, `writeNotGrantedAfterCreate`, and
  `protocolV2`), never its default. **On github.com: before the fix 6 of 7 creates failed; on `ebfc571`, 5 of 5 proof-app creates
  succeeded, 2 of them after a retry** (`lp-starter-r`'s seed push refused `403`, `lp-starter-v`'s first fetch refused `404`) — every
  repository private, then deleted.
- **Spec action 6 is in §7** (`0ebe514`): the capable model's fallback answers a provider that *"cannot be reached or fails — a refused
  connection, a timeout, a rate limit or a server error, the network off included — and never for a request the provider refused as
  malformed"*.
- **The gateway keeps that sentence** (`8ef6d46`, `c16b23d`): `infra/litellm/manifest_guard.py`, loaded by `config.yaml`'s `callbacks`
  and mounted by `compose.yaml`, refuses a FALLBACK call when the request's OWN failed attempt was a malformed-request refusal — `400`,
  `413` or `422`, read by STATUS from the request's own `litellm_logging_obj` (no shared store, nothing a client can name) — and lets
  `401`, `403`, `404`, `408`, `429`, every `5xx`, a timeout and a refused connection fall back to the on-premise model, exactly as
  before. **`make verify` gains a check that the running LiteLLM loaded it (61 → 62).** `ai/fallback-guard.docker.test.ts` holds every
  status; `agents.md` and `frontend.md` say what a fallback answers and how a client tells (`x-litellm-attempted-fallbacks`).

Commits: `0f2275a`, `fd2de69`, `9c9972a`, `f054bd9`, `ebfc571` (Task 6a and its three rounds from the real checks, and a fresh token per
retry); `0ebe514` (Spec action 6); `8ef6d46`, `c16b23d` (Task 6 and its fix round); `7fc25f9` (the whole-branch review's wave); and the
close-out.

**Findings** (each with what found it):
1. **F1 FE-41's premise was false**: a create WITHOUT a starter failed too (`lp-starter-e`, `-g`), and one WITH a starter succeeded
   (`lp-starter-b`) — the controller's reproduction, through the control plane and through the driver's own built code. The cause is
   GitHub's propagation after a create; sittings 1–2's five no-starter creates happened to land.
2. **F2 A failed create wrote no operator line** — the control plane's log held only boot lines for FE-41's two failures (the
   answer's own message named the cause: `git fetch failed: remote: Repository not found`).
3. **F3 `lp-starter-g`'s push exited 1 with stdout `Done` and no ref line** — a `404` on the push's SECOND request (the implementer's
   throwaway proxy recorded real git's output for all four 404 positions before the quirk was written).
4. **F4 The retry bound applied per step** — ~60 s worst case where the ruling said ≤30 s (the implementer's concern 2, the review's
   M1); one budget per creation.
5. **F5 A second-leg 404 on github.com is worded in git protocol v2's words** — `error: RPC failed; HTTP 404 … | fatal: expected flush
   after ref listing` (`lp-starter-m`, real check #1) — which round 1's classifier, built on the fake's v0 words (*"the remote end hung
   up unexpectedly"*), did not retry. **Found only by the real check.**
6. **F6 A third shape: `403` `Write access to repository not granted`** on the seed push (`lp-starter-p`, real check #2) — the fresh
   `contents: write` token not yet granted on the new repository. **Found only by the real check**; the classifier moved from wording to
   STATUS.
7. **F7 A retried `403` reused the token GitHub had just refused** (the implementer's round-3 concern) — every retry now mints afresh;
   **proved on github.com**: `lp-starter-r`'s `403` retried with a fresh token and created.
8. **F8 The GitHub fake speaks git protocol v0 by default; GitHub speaks v2** (the implementer's round 2) — a test-only `protocolV2`
   quirk reproduces v2's words; moving the default touches the Docker tier and conformance, and is left.
9. **F9 Driver 1's `SourceError` messages carry git's command line and the repository's laptop path** — `local-driver.ts:103–106`
   wraps `String(error)` (execFile's `Command failed: git --git-dir <path> …`), and `api/errors.ts:757` puts the message in a `409`
   body. Pre-existing; found because Ruling 5 assumed the opposite (the implementer's concern 4, verified by the controller). The new
   operator line is scrubbed; **the wire is not — left for the sitting whose paths it touches.**
10. **F10 The plan's Spec action 6 said no shared page restates the fallback — `manifest-schematic.html` does** (*"when that provider
    cannot be reached … the platform's own on-premise model answers in its place"*); true under (a), unchanged.
11. **F11 The permission classifier refused a READ-ONLY grep of the four shared pages** (*Modify Shared Resources*) **and reading
    sitting 1's `[M5]` probe files** (*Security Weaken*) — neither worked around; both cleared on one retry after Rich's *"Yes you can go
    ahead I give you permission"*.
12. **F12 The plan's Task 6 said *"a 4xx other than 408 and 429"*; the approved spec says *"never for a request the provider refused as
    malformed"*** — so a provider's `401`, `403` and `404` (the platform's own credential, permission or model name failing) FALL BACK.
    The controller's ruling, the spec winning; one list in the guard if Rich wants otherwise.
13. **F13 LiteLLM 1.98.0 names a provider's `401`, `403`, `404`, `408`, `413` and `422` ALL `BadRequestError`** when the body says
    `invalid_request_error` (`exception_mapping_utils.py`, before its status branch), and `previous_models` keeps only the name — so a
    guard reading class names cannot keep ruling F12; it reads the STATUS.
14. **F14 Round one's guard keyed on a CLIENT-SUPPLIED id** (the task review's Important): LiteLLM sets `litellm_trace_id` and
    `litellm_session_id` from `x-litellm-trace-id`, `x-litellm-session-id`, any `x-<vendor>-session-id` and `traceparent`, and its
    logging payload's trace id prefers the session id — so one request could be judged by another's failure, a `no-log` request was
    unseen, and a missed status fell to the class name and REFUSED a `401`. Now read from the request's own logging object (verified in
    LiteLLM's source: fresh per request, passed by reference through every fallback, the provider error stored synchronously before the
    fallback's hook). Red on round one's guard: a `baggage` case (session ≠ trace → a `401` refused) and a `no-log` case.
15. **F15 The concurrent shared-session pair cases could not fail against round one's guard** — the race never interleaved in two runs,
    and the stub cannot force it. The property is held by construction (no shared store) and by F14's two deterministic cases.
16. **F16 [M5]'s F8 STANDS UNDER THE GUARD: a provider's `422` still reaches the client as HTTP `200` with a body of literal `null`** —
    LiteLLM's `drop_params` retry loop returns `None` before any fallback. The Docker case asserts it as `KNOWN (F8)`, so a LiteLLM that
    fixes it turns red; the guides say a `200` whose body is `null` is a refusal. **Rich's** (ORIENTATION §8).
17. **F17 A refused capable-model request now carries LiteLLM's debug text** — the router-wide list of LOGICAL fallback pairs and a
    provider-class prefix (`OpenAIException`); **no underlying model id, host or port** (asserted on every refusal case).
18. **F18 `ai/capable.docker.test.ts` removed the dev control plane's capable model** (`default-chat-large`, `openai/gpt-6-luna`) and its
    fallback — ORIENTATION §2's known trap; the close's restart restores it.
19. **F19 A ROUTER-made `400`** (*no healthy deployments*, `router.py:10903`) is logged fire-and-forget, so the guard refuses or allows it
    by a race — a platform failure, no worse than round one; the guard's comment now says the synchronous store is a PROVIDER error's.
20. **F20 §7 and response HEADERS** (the Task 6 re-review): a success answer carries `x-litellm-model-api-base`
    (`http://host.docker.internal:11434`, measured 2026-09-28) and an error may carry `x-litellm-model-name` from the deployment's
    underlying model — pre-existing and platform-wide; §7 says logical names only. **Rich's** (ORIENTATION §8).
21. **F21 No test ran the PRODUCTION retry schedule** (the whole-branch review's m1): every FE-41 test passed `createRetryDelaysMs`, so a
    default of `[]` — a driver that never retries — stayed green; only github.com had seen `retry 1 of 5 … in 1000 ms`. A case now builds
    the driver without the option (`7fc25f9`), red with the default emptied.
22. **F22 A same-slug create after a failed one started with the FAILED create's cached tokens** — its `contents: write` AND its
    `administration: write` (m2): the cache is keyed by NAME, GitHub binds a token to the repository's ID, and `createRepository`'s catch
    never forgot them — so `protectMain` could have recorded `main` unprotected, or a delete read a `404` as gone (inferred, unmeasured).
    `tokens.forget(projectSlug)` first (`7fc25f9`), red before: `{ write: 1, administration: 1 }` against `{ write: 2, administration: 2 }`.
23. **F23 The guard had no case on a STREAMED request** (m3), the only chat route a platform key has — added (`7fc25f9`): a streamed
    `400` is a JSON `400`, not an SSE frame, and no fallback is called. **The controller's control, the guard removed IN PLACE: `200
    attempted-fallbacks=1` — LiteLLM does fall back a streamed `400` without it, so the case can fail.**
24. **F24 The guard's header comment claimed more than the guard does** (m4 and the re-review's O1): it refuses every fallback TYPE of
    every model after a `400`/`413`/`422` (a future `context_window_fallbacks` would be defeated), a `400` is not always the caller's (a
    billing `400`; `LiteLLMUnknownProvider`), and only a PROVIDER's error is stored before the fallback's hook — all said now.
25. **F25 The controller's wave brief said the agent's Edit tool edits in place — it replaces the inode** (`manifest_guard.py` 87984135 →
    88068457; the container then saw NO file until a restart) — ORIENTATION §4 trap 18 already named the edit tool; trap 18 and TRAPS.md
    now say what the container shows and how to write through a file.
26. **F26 The Docker tier went red twice at 33 Docker networks: *"all predefined address pools have been fully subnetted"*** —
    `runtime/docker/driver.docker.test.ts` and `networks.docker.test.ts`, code this sitting never touched; Docker Desktop's default pools
    hold ~31 user networks. After `dead-app-resources.sh --apply` both were 40 of 40 alone (TRAPS.md).
27. **F27 The ledger's own gate-count note was stale** — *"`pnpm test` +1, Docker +15"* when the branch added +17 unit and +19 Docker by
    then (the whole-branch review; measured below after the wave's two more).
28. **F28 CLAUDE.md still named Spec action 7 as the latest spec change** after `0ebe514` (the whole-branch review) — swept.

**Rulings** (the ledger's, in order): Task 6a's cause and fix confined to the creation window; the fake's lag test-only; Step 1's
reproduction on the running control plane and its line read at Step 4; one budget and the second-leg 404 (concerns 1–2); the planted
hook in test F accepted; F9 left; the round-2 and round-3 widenings (F5, F6) and a fresh token per retry (F7) — each from a real check;
Spec action 6 applied as worded, the diff marker's bold dropped; the schematic unchanged (F10); F12's status list (spec over plan);
the guard keyed by status (F13); M4 (a fixed refusal sentence, `400` for a `413`) accepted; a per-request key (F14).
**Negative controls**, each after its commit and restored from git (the implementers' reports have every quoted assertion). Task 6a:
round 1's six — the classifier answering `false`, the no-line predicate removed, the retry leaking into every fetch and into every push,
every verdict retried, the route's line unscrubbed — each red where predicted; then one per round: the `RPC failed; HTTP 404` match
removed (only the new fetch case red), the old wording (only test B), round 1's regex (only the ls-refs case), round 2's regex ((a) and
the github.com-strings case), the `\b` removed (`HTTP 4040` retried), the per-retry `forget` removed (two mint counts red); the wave's
default `[]` (the production-schedule case) and the top-of-create `forget` removed (the same-slug case). Task 6: `callbacks` removed →
`400`, `413` and the concurrent pair red, every falling-back case green, `make verify` 1 failed; the old trace-keyed store → only the
`baggage` and `no-log` cases red; **the controller's, the guard removed IN PLACE → the streamed `400` answered `200
attempted-fallbacks=1`** (F23). **One control could not fail as written — the concurrent shared-session pairs (F15).**

**Gates** (on the final tree, `7fc25f9`): `pnpm test` **2894 passed, 0 skipped, in 184 files**, twice (739 s and 747 s alone, load ~4–9;
`deadlock detected` **0** in both) — up from 2875 (+19: `projects.test.ts` 1, `driver.test.ts` 14, the fake's `git-http.test.ts` 3,
`examples.test.ts` 1; no new unit file). `pnpm lint`, `pnpm typecheck` and `pnpm format:check` clean. **`pnpm test:docker` 267 in 42 on
`c16b23d`** (1257 s, alone, the whole-branch reviewer reading only) — **265 green and 2 red for the ENVIRONMENT** (F26: Docker's address
pools, in `runtime/docker/`, which this sitting never touched), both **40 of 40 alone** after the cleanup; +19 cases and one file,
`ai/fallback-guard.docker.test.ts`. The wave after it re-ran the Docker files reaching its lines alone — `fallback-guard` 20 of 20 (+1, the
streamed case), `source/github/build` 1 of 1, `source/github/webhook` 1 of 1 — so the tier stands at **268 in 42** on the final tree
(derived: 267 measured + the one case run alone). `make doctor` **20/0/0** and `make verify` **62/0/0** after the close's restart
(+1: *the running LiteLLM loaded the fallback guard*). Contract **`1.5.0`** (unmoved); **42 migrations** (unmoved).

**The machine at the close** (queried 01:11–01:13 on 2026-09-30, not remembered):
- **THE CONTROL PLANE RUNNING ON REAL GITHUB** — PID 65663 on 7100, restarted 01:11 onto `7fc25f9` from the git-ignored
  `.superpowers/sdd/2026-09-29-launch-path/cp-start.sh` (unchanged), boot line `"source":"github","github":"api.github.com",
  "githubOrg":"Manifest-local-dev"`, `capableModel: registered`, `capableFallback: set` (the Docker tier had removed them — F18),
  `sourceRepositoriesPrepared: 2`.
- **The control database: EMPTY** — 0 projects, 0 users (the close's unit runs truncated it); **42 migrations**.
- **GitHub**: `Manifest-local-dev` holds exactly `f5-reading` and `lp-real-a`, both owned by no project (`github-real-repos.sh`: `NONE`);
  no `lp-starter-*` — all twenty-two made this sitting are gone.
- **Mirrors** `dead-app-resources.sh` names and never removes: `f5-reading.git`, `lp-real-a.git` (real), `frontend-github.git`,
  `frontend-scratch-github.git` (the fake's).
- **Containers**: 42 `mf-` (`make verify`'s INFO: `mf- containers=42 networks=14 volumes=28`) — the demos' and the front-end's apps,
  `f5-reading`'s nine among them, no rows behind them; 26 Docker networks in all.
- **LiteLLM** serves the guard: `config.yaml` and `manifest_guard.py` in the container hash as the host's (`31e05149…`, `04ba779a…`).
- **Cleanup**: `dead-app-resources.sh --apply` (1 network, 1 volume — after the tier's 7 and 1 earlier) and `app-images.sh --apply` (17
  dead) — both ALLOWED, both re-measured 0 dead; `litellm-orphans.sh` reads the same 3 as sittings 1–3 — **not applied** (a budget's
  deletion resets its month).
- **7102 and 7105 are the faculty front-end's** (node 35047 and 32247, mock mode); **nothing on 7104**.
- **Not this project's**: the `cwl-spike-*` containers and `openwebui-openwebui-1`. Ollama **0.35.0**. **Free disk 95 → 73 GiB** — not
  attributed: Docker's images hold 31.9 GB and its build cache 25.1 GB (20.9 reclaimable); `docker builder prune` is machine-wide, so
  it is Rich's.
- Load 5–7.

**The four shared HTML pages, checked**: Spec action 6's recheck (F10) — `manifest-schematic.html`'s fallback sentence stays true,
unchanged; `manifest-decisions.html` (no D-number moved), `manifest-phases.html` (its *"an app's code can live on (practice) GitHub"*
still describes what is built — this sitting made a create reliable, not a new capability) and `manifest-stories.html` unchanged.

### Sitting 4a — 2026-09-30: Task 6b — FE-42 (the project's owner may run D21's rehearsal); Spec action 8 drafted, its premise re-asked

**Run after sitting 4's close** (`0510c63`, handed over by `manifest-a1` with the machine as its §7e said), by session `manifest-73` —
Rich's session for 4a, which had waited read-only through sitting 4 — **subagent-driven** on `main`: one implementer (opus), one task
review (opus), one whole-branch review (opus) beside the Docker tier, one fix wave (opus) and its scoped re-review. Rich answered 4a's
one question before bed (*"may a delegated token run the rehearsal too?"* — **(a), persons only**), relayed into sitting 4's close.
Peers: the faculty front-end (`manifest-app-e2` → `-58` → `-6d`/`-6b`, mock mode throughout, *"truncate freely"*; told before the
contract commit, and it checked `fa02bbc` against its own code — typecheck and 1568 tests green, no mock restart); `manifest-c8` (no
task). **The database was EMPTY at open** (0 projects, 0 users), so nothing was dumped.

**What it made true**:
- **A project's owner, and a collaborator, may run D21's rehearsal** (`fa02bbc`): a new capability, **`launch:rehearse`**, granted in
  `OWNER` (so `COLLABORATOR`, which filters `OWNER`, and `PLATFORM_ADMIN`, which spreads it, hold it too), **PERSON-ONLY** (the mint
  refuses it `400 TOKEN_CAPABILITY_FORBIDDEN`; `assertCapability` refuses a token holding it `403 TOKEN_PERSON_ONLY`; the route's
  `requireSession` refuses every token `403 TOKEN_CREDENTIAL_REFUSED` first — two layers, two codes), **not step-up** (§20's list omits
  it). `runRehearsal` asserts it; its published description says who may run it; its declared codes lose `FORBIDDEN` (every role that
  can see the project holds it; a stranger is `404`). **`launch:record` — recording what UBC decided — stays an administrator's
  alone**, and the owner is still refused both records, held with the administrator's record as the positive control. The console's
  Launch screen shows the rehearsal button to everyone who can read the checklist; its Tokens screen lists `launch:rehearse`, disabled
  with the person-only reason. The contract stays **`1.5.0`** (the token capability enum gains `launch:rehearse`).
- **The published person-only lists are held to `PERSON_ONLY`** (`7814f75`, the whole-branch review's I2): `api/person-only.test.ts`
  finds a member missing from `mintToken`'s description or `MintTokenRequest.capabilities`' (by name, from the OpenAPI document), or from
  the `TOKEN_PERSON_ONLY` summary or `agents.md`'s *a person's alone* line (by a phrase map that fails CLOSED — a member with no phrase is
  red, and the map's keys must equal the set). `agents.md` names the rehearsal. **The journey's launch row is three** — *see what a first
  launch needs* (either), *rehearse* (a person), *record UBC's answers* (an administrator) — so `docs/api/journey.md` no longer offers the
  rehearsal or the records to an agent. The owner's records refusal has the administrator's IAM record as its positive control. The
  comments that said a rehearsal puts nothing public say what it leaves serving and name Spec action 8.

Commits: `fa02bbc` (Task 6b); `7814f75` (the whole-branch review's wave); and the close-out.

**Findings** (each with what found it):
1. **F1 Task 6b's premise — and the question Rich answered — misdescribed what a rehearsal leaves serving** (the whole-branch
   review's I1, verified by the controller in `launch/rehearsal.ts:90`, `releases/launched.ts:33`, `releases/production.docker.test.ts`'s
   `[M7]` and P6b's Decision 16). The rehearsal deploys the UNAPPROVED candidate (`purpose: 'rehearsal'`, the digest check skipped) into
   production, whose listener is `public`, and nothing retires it: it serves the production hostname until the launch or a later
   deploy. The brief's *"the rehearsal does not touch production"*, the FE-42 framing's *"behind the gate"*, the controller's own
   question to Rich (*"so nothing is public"*) and `authz.ts`'s *"puts nothing in front of students"* were all wrong; Decision 16's
   *"Before a launch nothing is public"* is a premise about students, not a barrier. **Before `fa02bbc` only an administrator could put
   an unapproved candidate there; now an owner's or a collaborator's session can, with no step-up, and repeatedly.** Not decided here:
   `fa02bbc` stays (a laptop, no real exposure; the front-end has not built its press), the comments are corrected, and **Spec action 8
   re-asks Rich** with four options — (a) accept, (b) step-up, **(c) retire the rehearsal's production instance once its probe is
   recorded (recommended)**, (d) back to an administrator alone.
2. **F2 Nothing held the published person-only lists to `PERSON_ONLY`** (the whole-branch review's I2): `mintToken`'s description,
   `MintTokenRequest.capabilities`', the `TOKEN_PERSON_ONLY` summary and `agents.md`'s list were written by hand — which is how
   `project:delete` had been missing from two of them since the front-end enablement plan's Task 11, and how Task 9's `launch:submit`
   would repeat it. Held by a test since `7814f75`; Task 9's `[S4a]` says what `launch:submit` must add.
3. **F3 `project:delete` was missing from both token descriptions** (the implementer, while adding `launch:rehearse`) — person-only since
   the front-end enablement plan, never named in them; added in `fa02bbc`.
4. **F4 `TOKEN_CAPABILITY_FORBIDDEN`'s summary said *"one of its two person-only ones"*** — stale at three since Spec action 3 of the
   front-end enablement plan; count-free since `fa02bbc`.
5. **F5 The journey's launch row offered the rehearsal and both records to an agent** (the task review's m10, the whole-branch review's
   M1): `packages/journey/src/coverage.ts`'s `who: 'either'` put *"rehearse, and record UBC's answers | either"* in the public
   `docs/api/journey.md`, contradicting `launching.md`; `coverage.test.ts` never checked `who`. Split into three rows in `7814f75`; nothing yet checks `who` against an operation's credential.
6. **F6 The owner's records refusal had a positive control for the PIA only** (the task review's m5) — no administrator's IAM record
   succeeded anywhere in `delivery.test.ts`. The administrator's IAM record, from `launchedCwlProject`'s payload shape, since `7814f75`.
7. **F7 PRE-EXISTING: the authz matrix's archived case passes over a `500`** (the implementer; the task review's m9, judged by the
   whole-branch review): `makeConfidential` (`api/authz-contract.ts:~2363`) inserts a hand-written `parsed` with no `env`, valid, one second
   ahead, so `listAppSecrets` → `newestValidSpec` → `resolveEnv`'s `spec.env.map` throws `TypeError` → `500 INTERNAL`, and the case
   compares declared and answered codes only, so it stays green and prints to stderr on every run. **Not a real-manifest risk** — every
   valid row the platform writes is `manifestSchema`'s output with `env` defaulted to `[]` (`spec-validation.ts:121`, `routes/projects.ts:361`,
   `spec/schema.ts:239`) — except a row written under an older schema on a long-lived database. **Carried**: the fixture should write a
   schema-parsed spec, and the archived case should fail on any `INTERNAL`.
8. **F8 The Docker tier ran out of Docker Desktop's address pools again** — 2 red at 33 networks (`driver.docker.test.ts`,
   `networks.docker.test.ts`), exactly as sitting 4's F26 predicted from a start of 26; 40 of 40 alone after the cleanup script's
   `--apply` of the tier's own seven networks. **The 14 `mf-` networks of apps with no rows (the demos', the front-end's, `f5-reading`'s
   three) leave the tier ~5 networks of headroom it needs 7 of**: removing those apps' containers, or widening Docker Desktop's pools, is
   Rich's (a host change, and another session's leftovers).
9. **F9 The controller's pre-flight named `launch:rehearse` "person-only like `launch:record`" without asking what the rehearsal
   deploys** — the ruling was right about tokens and blind about exposure; F1 is the measurement it skipped. A capability's grant is a
   question about what the operation DOES, not only about who holds its neighbours.
10. **F10 The wave found two more published sentences that misdescribe the rehearsal** — `runRehearsal`'s description (*"behind the
    gate"*, *"on the live listener"*) and `docs/api/launching.md` step 2 (*"deployed behind the gate"*). **Left for Spec action 8's answer**
    (the true words depend on the option; the description is a contract commit).
11. **F11 `tokens.tsx` said *"the person-only two"*, *"all eleven"* and — added by `fa02bbc` — *"refuses all four"*** (the task review's m6,
    and the wave): counts that drift; reworded without one. **The console's own `PERSON_ONLY` set is still held by no test** (the import
    boundary keeps it from reading the server's) — carried.

**Negative controls** (after the commit, each predicted first, restored with `git checkout`, the tree clean after):
- **(a) `launch:rehearse` removed from `OWNER`** → 9 red / 769 green across the five files: the owner's and collaborator's rehearsals
  (`403 FORBIDDEN`), the matrix's owner, collaborator AND administrator rows (`PLATFORM_ADMIN` spreads `OWNER`), the archived-state check
  (`runRehearsal` declared `PROJECT_ARCHIVED` and no longer answering it), the administrator's probe, the privileged role check — and one
  unnamed red that follows from the prediction's own logic (`delivery.test.ts`'s *refuses a rehearsal when nothing is serving staging*,
  the administrator having lost the capability too).
- **(b) `launch:rehearse` removed from `PERSON_ONLY`** → 7 red / 771 green, exactly as predicted (the class tests, the privileged check,
  the token probe `201` for `TOKEN_PERSON_ONLY`, the mint loop, the owner's mint `201`); **green as predicted: the route's token case and
  the matrix's token rows** — `requireSession` refuses a token before any capability is read, which is the second layer holding alone.
- **(c) the wave's: `launch:rehearse` removed from `mintToken`'s description** → 1 red as predicted, *"expected [ 'launch:rehearse' ] to
  deeply equal []"* (1 failed, 13 passed); and two more, each as predicted — the rehearsal dropped from `agents.md` turns only the guide
  case red; its phrase deleted from the map turns exactly three cases red. Restored, the tree clean.

**Rulings** (the ledger's, in order): no worktree (CLAUDE.md); Step 1 read by the controller — no spec text names who triggers the
rehearsal, so no stop; `launch:rehearse` new, in `OWNER`, `PERSON_ONLY`, not step-up; the collaborator holds it (§13); the tier run at 26
networks rather than removing another session's apps or changing the host; I1 re-asked of Rich, `fa02bbc` kept; one wave (I1's comments,
I2's test, M1, m5, m6, m3); the minors carried (m1 beside Spec action 8, m4, m7 to the clicked half, m8 before FE-39, m9 as F7); the wave's two published
sentences (F10) left for Spec action 8's answer; the plan's workspace kept (nine sittings remain).

**Gates on the final tree** (`7814f75`): `pnpm test` **2908 passed, 0 skipped, in 184 files**, twice (722 s and 711 s alone,
0 `deadlock detected`); `pnpm lint`, `pnpm typecheck` and `pnpm format:check` clean; `pnpm test:docker` **268 in 42** on `fa02bbc` —
266 and the two pool reds (1210 s, alone, the whole-branch reviewer reading only), and the two files 40 of 40 alone after the cleanup
(218 s); the wave owed no Docker re-run — comments only in the owing paths (`projects/authz.ts`, `launch/rehearsal.ts`), checked line by line;
`make doctor` **20/0/0**, `make verify` **62/0/0**
after the close's restart; contract **`1.5.0`**.

**The machine at the close** (queried 03:03–03:04 on 2026-09-30, not remembered):
- **The control plane: PID 53532 on 7100, on `7814f75`, REAL GitHub** (Rich's `.env`), restarted at the close by
  `.superpowers/sdd/2026-09-29-launch-path/cp-start.sh` (unchanged; detached, `nohup`), boot line `"source":"github","github":"api.github.com",
  "githubOrg":"Manifest-local-dev"`, `capableModel: registered`, `capableFallback: set`, `sourceRepositoriesPrepared: 2`.
- **The control database: EMPTY** — 0 projects, 0 users; **42 migrations** (`0041_broad_power_man` newest; 4a added none).
- **GitHub**: `Manifest-local-dev` holds exactly `f5-reading` and `lp-real-a`, both `NONE`.
- **Mirrors** `dead-app-resources.sh` names and never removes: `f5-reading.git`, `lp-real-a.git` (real), `frontend-github.git`,
  `frontend-scratch-github.git` (the fake's).
- **Containers**: 42 `mf-` (`make verify`'s INFO: `mf- containers=42 networks=14 volumes=28`) — the demos' and the front-end's apps,
  `f5-reading`'s nine among them, no rows behind them; **26 Docker networks** in all (the pool is ~31 — the record's F8); no runtime route
  applied. `make verify` **62/0/0**, `make doctor` **20/0/0**; LiteLLM healthy, serving the fallback guard.
- **Cleanup**: `dead-app-resources.sh` (1 network + 1 volume at the close, after the tier's seven mid-sitting) and `app-images.sh` (15) 0 dead
  after their `--apply`; `litellm-orphans.sh` reads the same 3 as sittings 1–4 — `p4b-probe-user`, the front-end's person budget and the
  platform's intake budget — **not applied** (a budget's deletion resets its month; its one mode takes all three).
- **7102 and 7105 are the faculty front-end's** (node 35047 and 51453 — 7105's restarted during 4a; mock mode by its word); **nothing on 7104**.
- **Not this project's**: the `cwl-spike-*` containers and `openwebui-openwebui-1`. Ollama **0.35.0**. **Free disk 73 GiB** (73 at 4a's open;
  Docker's build cache 25 GB, 21 GB reclaimable — Rich's).
- Load 3–4.

**The four shared HTML pages, checked**: no spec action was applied, so none moved; `manifest-decisions.html`'s D24 (*"Three things are
stricter still …"*) moves only when Spec action 8 is applied, and says so in the action.

### After sitting 4a's close — 2026-09-30: Spec action 8 decided — (b) and (c) together, as Task 6c in a new sitting 5b

*Not a sitting: a session Rich opened to ask where the project stood. It changed no code and ran no test.*

- **The question was put again at developer level, and every claim in it was read from the code at `09e3d7b` first** (the memory
  *verify a question's premise first*). The route is `requireSession` plus `assertCapability`, with no `assertStepUp`.
  `purpose: 'rehearsal'` skips `productionApprovalFor`, injects production's app secrets and points the app at the rehearsal IdP
  (the Manifest IdP here, `authentication.stg.id.ubc.ca` at UBC). The listener is `public`, and `retireEnvironment` reaps only
  instances that are not serving, so the rehearsal's instance stays.
- **One fact the draft had not said, and it went into the question**: the hole is older than FE-42. Before `fa02bbc` the rehearsal
  was `launch:record`'s, which is not in `STEP_UP_GUARDED` either, so a stolen ADMIN session could already do it. That makes option
  (d) no cure for §20's sentence. **And one limit of (c) alone**: nothing bounds how often a rehearsal runs, so a stolen session could
  loop it. Hence the session's recommendation of (b) and (c) together, which Rich took: *"b and c together, in its own small sitting
  after 5"*.
- **A correction made before anything was written down**: the session had told Rich that (c) would need a static page on the name
  and a `releases/recover.ts` change, because the edge's wildcard answers `200` for any name. Reading `infra/caddy/Caddyfile`
  showed that the public listener's wildcard (`manifest OK … listener=public`) is exactly what a production hostname answered
  before any rehearsal. So removing the route and its `routes` row restores the prior state: no new page, and nothing for the boot to
  put back. Task 6c's Decision 3.
- **Written in**: **Task 6c**, with eight decisions and five negative controls, all read from the code; **sitting 5b**, after 5 and
  **before 5a** (the letter says when it was added, not where it runs); Spec action 8's header and **its combined words** (two
  phrases changed from the draft, each marked). **Applied at his word the same day** (*"apply 8"*) — see below. **19 tasks in 15 sittings.**
- **The faculty front-end** (`manifest-app-f1`, its F5 sitting 6) wrote in during the session, at Rich's word, with five questions,
  and was answered from the code. The answers: the step-up refusal is a production deploy's `403 STEP_UP_REQUIRED`, byte for
  byte except `message`. The answer comes after the take-down. Afterwards `getEnvironment(production).instance` is the `gone`
  instance and not `null`, because `servingInstanceOf` falls back to the latest instance. `Rehearsal` gains no field. The mock
  gains no step-up in 5b. F8 is unchanged and Rich's. **It accepted the order 5 → 5b → its real-platform walk on 7100 → 5a**, and
  asks for a message when sitting 5 closes (it adopts `agent_session.narrowed` and `member_removed` before its walk) and when 5b
  closes (with the final take-down refusal code, and whether `getEnvironment` answers `null` after all). **Its walk needs a quiet
  7100**: no platform Vitest, no control-plane restart, and `scripts/admin-grant.sh grant opr000001` once `operator` has signed in.
  It creates a real private repository, at Rich's word.
- **APPLIED at Rich's word, later the same day** (*"apply 8"*, with *"and then proceed with the next sitting"*): the four spec edits
  exactly as the combined words (each matched once), and the shared pages above. **The spec now runs ahead of the code in two places**: §20
  lists the rehearsal for step-up and §9 says it takes itself down, and the code does neither until Task 6c. D24's fourth person-only
  action is already the code's (`PERSON_ONLY`, since `fa02bbc`).

### Sitting 5 — 2026-09-30: Tasks 7 and 8 — a session narrowed in place; removing a member revokes their tokens, closes their streams and ends their sessions

**Run by session `manifest-d4`**: the session Rich opened that afternoon to ask where the project stood. It took Spec action 8's answer
(`f0ca32b`) and applied it at his *"apply 8"* (`9468ff9`), then opened this sitting at his *"and then proceed with the next
sitting"*. **Subagent-driven** on `main`:
- one implementer per task (opus) and one task review each (opus);
- one fix round on Task 8 (resumed implementer) and its scoped re-review (sonnet);
- one whole-branch review (opus), run beside the Docker tier;
- one fix wave (opus) and its scoped re-review (sonnet), run beside the first unit run.

Peers:
- **The faculty front-end** (`manifest-app-f1`, its F5 sitting 6, mock mode throughout): told before each contract commit, and adopted
  both.
- **The planning session `manifest-00`** (Rich's; no task here). While this sitting ran, it applied Spec actions 3, 4, 5 and a new 9 to
  the spec and wrote the next plan — `844605b`, `50425de`, `b7a80b1`, `b269149`, `348c2c8` — touching none of this sitting's paths. It
  also relayed that Rich had run the orphan-app script, which this sitting then measured.

**The database was EMPTY at open** (0 projects, 0 users), so nothing was dumped.

**At the open, Rich gave four answers**, each read with its text:
- Spec actions 1 and 2: **"Apply as worded"** → `62c8019` (§7; §10, §6, §20; `manifest-decisions.html`'s D24).
- The orphan apps: **"Remove"** (F12).
- The two real repositories: **"Delete both"**. `lp-real-a` and `f5-reading` were deleted on github.com at his yes, and
  `Manifest-local-dev` now holds 0.

**What it made true**:
- **A session is NARROWED in place, not ended** (`d061ad7`, Task 7 — Spec action 1). When a project's classification rises, or the
  builder setting narrows, the sweep — renamed **`narrowSessionsHoldingMore`**, with every caller moved — first calls `narrowAgentKey`:
  one `POST /key/update { key_alias, models }`. Only after the gateway answers does it write the row's `models` and a new event,
  **`agent_session.narrowed`** (`{ sessionId, withdrawn, models, via, userId, tokenId }`), in ONE transaction, and it publishes after the
  commit.
  - The withdrawn models are refused through the SAME key at once (`403 key_model_access_denied`, measured on the real LiteLLM by calling
    it), and the kept local model answers `200`.
  - A gateway failure leaves the session live and the row unchanged, and the next sweep retries it (a commit, a production deploy, a
    rehearsal, the boot).
  - **It is ended `models_withdrawn` only when nothing it may use is left.** A key is never narrowed to an empty list, which LiteLLM
    reads as every model.
  - Migration **`0042`** (`events_type_known`). The boot line's `agentSessionsWithdrawn` gains `narrowed`. The console re-reads its
    session list on the new event. The guides (`agents.md`, `frontend.md`) and RUNBOOK say it.
- **Removing a member removes their access** (`baacc1c`, Task 8 — Spec action 2):
  - In the removal's OWN transaction, `revokeTokensOfMember` revokes every token the person minted on THIS project, and only theirs.
  - After the commit, their token streams close `4401` and their session streams on the project close `4404` (Task 5's registry).
  - Then their agent sessions there — token-started and browser-started — end **`member_removed`**: a new end reason in the CHECK (migration
    **`0043`**), the type, the representation and the event's enum.
  - `member.removed` gains `tokensRevoked` and `sessionsEnded` (required).
  - The route declares **`503 AI_CATALOGUE_DISABLED`**, which comes AFTER the removal and the revoke; repeating the request finishes
    ending the sessions.
  - **Neither a session start nor a token mint can race a removal into a live credential.** `startAgentSession` (`baacc1c`) and
    `mintToken` (`0b4d50e`, the fix round) each hold the person's membership row `FOR SHARE` inside their transaction. A removal either
    waits for them and then revokes or ends what they made, or it committed first and they are refused `404 NOT_FOUND` — the stranger's
    answer, so it is no oracle.
- **The fix wave** (`f27914e`):
  - the seam guard's test (F8);
  - a second queued removal is no longer a false last owner (F9);
  - the console's token list refreshes on `member.removed`;
  - one race test made deterministic;
  - a stale comment in `journey/src/token.ts`.

**What sitting 5 found** (the count is derived by the command at the head of this section):

**F1 The plan's names had drifted since `862851c`.**
- `trimOrEnd` is `endSessionsHoldingMore`, and `AgentKeyAdmin` is `LiteLlmClient`.
- `ai/sessions.test.ts` does not exist; the old rule's tests and helpers live in `api/agents.test.ts`.

Found by the pre-flight scan and ruled routine (the implementer built on what exists).

**F2 The plan's predicted kept list was wrong.** The prediction was `['default-chat-large', 'default-chat-onprem']`. The list derived from
`agentModelsFor` under `capable`, before any test ran, is `[default-chat-onprem, default-chat-onprem-reasoning, default-chat-large]`, in
the row's order. The plan called the list a prediction to be fixed first, and it was.

**F3 `/key/update` for an alias that no key holds answers `404 not_found_error`** (measured on LiteLLM 1.98.0). It is read as done, as
`revokeKeyByAlias` reads `/key/delete`'s 404, so a narrowing that lands after a removal's `/key/delete` recreates nothing. **And
`/key/update` checks no model name**: the whole-branch review read LiteLLM's own source in image `20b5044b`. So a kept name the gateway
no longer serves does not make every sweep fail (Task 7's m9, resolved).

**F4 Task 8's control (b), as the plan wrote it, could not fail.** `removeMember` RETURNS `'last owner'` from a DELETE whose guard held;
it never throws. So a revoke gated on `'removed'` is skipped whether or not it shares the transaction. The pre-flight scan predicted it,
and the control confirmed it: (b1) stayed GREEN. The transaction's real property is *no removal without its revoke*. It is held by an
injected-failure test: the revoke's UPDATE fails inside the transaction, and the member stays and every token stays live. That test went
RED with the revoke moved outside (b2, `members.test.ts:687`).

**F5 `endSessionsOf`'s third target had to be checked FIRST.** Its old branch is `'tokenId' in target ? … : eq(projectId)`, so a
`{ projectId, userId }` target falling to the fallback would end every session on the project. Ruled before dispatch, and held by a
colleague's session surviving the removal. Control (d) dropped the discrimination and went RED at `:617`, where the colleague's key
answered `401`.

**F6 A browser-started session racing a removal would have left a live key** for someone off the project. The implementer added
`startAgentSession`'s `FOR SHARE` hold beyond the brief, and the controller ruled to keep it. But its first test's pre-implementation red
came from nothing ending sessions at all, not from the missing lock. **The task review caught that the lock had never been watched
failing** (its I2). Control (g), in the fix round, dropped it and went RED at the "WHILE starting" test (`:773`, a key answering `200`
instead of `401`).

**F7 A token minted while its minter was being removed survived the removal, and nothing could revoke it** (the task review's I1).
- `mintToken` read membership outside its transaction and held only `projects`.
- A removal committing between that read and the INSERT revoked before the row existed, leaving a live token for up to 365 days.
- A repeat of the removal answered `'not a member'`, and an owner cannot revoke another person's token.
- It contradicted what the diff stated as fact (`authz.ts`, `authentication.md`, `member.removed`'s description).

Ruled fixed in the task, because Spec action 2 says *every* token. The fix is the mint's membership hold plus a `NOT_FOUND`. Two race
tests are forced into each order by a row that a second connection holds (the new `holding` helper). Controls: (e), the lock dropped, went
RED only mid-mint (`:865`); (f), the refusal dropped, went RED only after the removal committed (`:891`).

**F8 The narrowing's `ended_at IS NULL` guard — the one place the two tasks meet — had no test.** Removing it stayed green, and
Task 7's report had called that "a green control to record as such". The whole-branch review's Important 1, and the memory's rule:
*a green control is a question*. The fix wave added a test in which a gate holds `/key/update`'s answer, a removal lands, and no
`narrowed` event is recorded for the ended session while the same sweep narrows the owner's. Its control went RED at `:1562`.

**F9 A second removal of the same person, queued behind a start's or a mint's new `FOR SHARE` hold, answered a FALSE
`409 PROJECT_LAST_OWNER`.** `removeMember` read *"the DELETE removed no row"* as the last owner — a window this sitting's own holds
opened (the whole-branch review's Minor 2). Now a no-row DELETE re-reads the membership: gone means `'not a member'`. The test was RED
first (`409`), and its control went RED at `:941`.

**F10 Four documents still stated rules this sitting reversed.**
- ORIENTATION's §3: `endSessionsHoldingMore` ends every session, and *"A token therefore outlives its minter's membership"*.
- RUNBOOK's member paragraph: removal *"does nothing about tokens"*.
- A comment in `journey/src/token.ts`.

Swept at the close, and the comment in the fix wave. Three of the four were NOT on the close-out list until the whole-branch review named
them.

**F11 The skill's `task-brief` extractor matched `Task 8` as a prefix and pulled Task 8a into Task 8's brief.** It was trimmed by hand
to the 62 lines that are Task 8, so the implementer could not build 8a by mistake. Check a brief's last heading whenever a task number has
a lettered sibling.

**F12 The orphan apps.** Of 26 Docker networks (the pool is ~31), 14 belonged to 42 `mf-` app containers with no rows behind them, which
made every tier go red twice (sitting 4a's F8).
- Rich chose to remove them, but `docker rm -f` of the 42 was REFUSED by the permission classifier ("Unverifiable Deletion Scope" — the
  list was computed in the same command). Not retried.
- A script naming the 42, as read first-hand, followed by `dead-app-resources.sh --apply`, was handed to Rich, and he ran it in his own
  tab.
- Measured afterwards: 0 `mf-` containers, 0 `mf-` volumes, **12 networks**. **The tier then ran 269/269 with no pool red**, the first
  time since sitting 4.

**F13 A race test rested on a 150 ms margin** (*"a member removed before their browser session reaches its key"*). The whole removal
request had to reach its DELETE before a slowed `/user/info` returned, on a machine whose load reaches 50–90 during a screen share. The
fix wave made it deterministic, with a hold on the project row and an assertion that `/user/info` was called first. Its control went
RED at `:809`.

**F14 The console's token list re-read only on `token.minted`**, so tokens a removal revoked showed as live until a reload. It now
re-reads on `member.removed` too. No console test covers the trigger list.

**The negative controls**, each predicted before it ran, quoted and restored (Task 7's two, Task 8's six, the fix wave's three):
- Task 7 (a), the old rule: RED 9/38 at `agents.test.ts:1002`.
- Task 7 (b), the row written before the gateway: RED 2/38 at `:1361` and `:1459`.
- Task 8 (a), `project_id` dropped: RED at `:512`.
- Task 8 (b1): GREEN, as predicted (F4).
- Task 8 (b2): RED at `:687`.
- Task 8 (c), browser-started sessions skipped: RED 4/19.
- Task 8 (d): RED at `:617`.
- Fix round (e): RED at `:865`.
- Fix round (f): RED at `:891`.
- Fix round (g): RED at `:773`.
- Fix wave: the seam guard RED at `:1562`; the false 409 RED at `:941`; the race test RED at `:809`.

**Carried, not fixed** (the whole-branch review's triage; the ledger has each ruling):
- **5b's contract bundle**: Task 6c's `[S5]` block.
- **The narrowing's m1 does NOT heal itself.** Two concurrent narrowings with different lists leave the key holding more than the row,
  and no later sweep sees it. It is unreachable with today's catalogue. The fix is the row `FOR UPDATE` across `/key/update`.
- **A removal answered `503` finishes only if a person repeats it.** The residue: model-only keys charged to the removed person, at most
  480 minutes, with no project access. A boot sweep ending the sessions of non-members would close it — a plan gap.
- **The keep rule** `allowed ∨ ¬served` versus §7's *"keeps the models the project still allows"*.
- **A removed person's tokens' pending questions stay `pending`** until their own expiry.
- Task 7's m3–m7 and Task 8's r2, r3, r5–r7, minor.

**Gates on the final tree (`f27914e` code; HEAD `f27914e`; HEAD `f27914e` before this close-out)**:
- `pnpm test` **2923 passed, 0 skipped, in 184 files (737 s alone, load ~4, 0 `deadlock detected`)**, then **2923 / 184 (737 s alone, 0 `deadlock detected`)** — twice, alone.
- `pnpm test:docker` **269 passed, 0 failed, in 42 files**, 1337 s, on `348c2c8` (code `0b4d50e`). The fix wave's one source change is
  not reached by it (the controller's ruling).
- `pnpm lint`, `typecheck` and `format:check` clean.
- `make verify` **62 / 0 / 0**, `make doctor` **20 / 0 / 0**.

**The machine at the close**, queried, not remembered: 
- **The control plane: PID 932 on 7100, on `f27914e`, REAL GitHub** (Rich's `.env`), restarted at the close by
  `.superpowers/sdd/2026-09-29-launch-path/cp-start.sh` (unchanged; detached, `nohup`) after the unit runs truncated it. Its boot line
  reads `"source":"github"`, `"github":"api.github.com"`, `"githubOrg":"Manifest-local-dev"`, `capableModel: registered`,
  `capableFallback: set`, `sourceRepositoriesPrepared: 2`, and `agentSessionsWithdrawn: {ended: 0, narrowed: 0, failed: 0}` (Task 7's new
  shape).
- **The control database: EMPTY** — 0 projects, 0 users; **44 migrations** (`0043_gray_expediter` newest; this sitting added `0042` and
  `0043`).
- **GitHub**: `Manifest-local-dev` holds **0 repositories** (`lp-real-a` and `f5-reading` deleted at Rich's yes).
- **Mirrors** that `dead-app-resources.sh` names and never removes: `f5-reading.git` and `lp-real-a.git` (their repositories are gone), and
  `frontend-github.git` and `frontend-scratch-github.git` (the fake's).
- **Containers**: **0 `mf-`** (Rich removed the 42; F12). `make verify`'s INFO reads `mf- containers=0 networks=0 volumes=0`, and there are
  **12 Docker networks** in all.
- **Cleanup**: `dead-app-resources.sh` (7 networks + 1 volume — the tier's) and `app-images.sh` (26) applied by this session, and both
  re-measured to 0 dead. `litellm-orphans.sh` lists **13**, not applied: the deleted apps' nine users, `p4b-probe-user`, two people's agent
  budgets and the platform's intake budget. A budget's deletion resets its month, and the script's one mode takes all thirteen.
- **7102 and 7105 are the faculty front-end's** (node 35047 and 15448; mock mode by its word). **Nothing on 7104.**
- **Not this project's**: the `cwl-spike-*` containers and `openwebui-openwebui-1`. Ollama **0.35.0**. **Free disk 74 GiB** (77 at open;
  Docker's build cache 25 GB, 21 GB reclaimable — Rich's).
- Load ~4.4.
- `scripts/snapshot-machine.sh` at open and close: identical in the must-survive containers, the ports, the loopback alias, the
  resolvers, Valet, the toolchain and the daemon. The rest of the diff is the containers, images, networks and volumes removed on purpose.

### Sitting 5b — 2026-09-30: Task 6c — a rehearsal needs a step-up, and takes its production instance down before it records

**Run by session `manifest-e2`, INLINE** (`superpowers:executing-plans`: one context, TDD per step, one fresh whole-branch review
beside the Docker tier, one fix wave) on `main`, from `1c5d063` — opened only after the planning session `manifest-00` said its
boundary pass had landed. **The database was EMPTY at open** (0 projects, users, instances, routes; 44 migrations), so nothing was
dumped. Rich's three first-message questions (the truncation, his click after 5b, `make refresh-vulndb` after 2026-10-06) were asked
and nothing waited on them.

Peers:
- **The faculty front-end** (`manifest-app-f1`, its F5 sitting 6, mock mode on 7102/7105): asked first what had changed since sitting 5
  — nothing, plus one new question (a failed start's Incident) — and told before each contract commit. It adopted `500
  REHEARSAL_TEARDOWN_FAILED`, `409 REHEARSAL_RUNNING` and *"any non-healthy production instance before a launch reads as nothing there"*.
- **The planning session `manifest-00`**: finished `5246d4d`/`1c5d063` before this sitting began, asked to be told at its close, and
  relayed two rulings of Rich's during it: published text carries no section, decision or plan numbers (now a *Global Constraints*
  line; the cleanup is placed in sitting 10), and Mailpit moves to 5a's close.

**What it made true** (`3333acc`, `253a923`, `0b09efc`, `fff8a7f`):
- **(b) A rehearsal needs a step-up.** `launch:rehearse` is in `STEP_UP_GUARDED`; the route calls `assertStepUp` after the capability,
  so an ordinary session — owner, collaborator or administrator — is refused `403 STEP_UP_REQUIRED` before anything is read or
  deployed, and a stranger is still `404`. A token is still `TOKEN_CREDENTIAL_REFUSED` first.
- **(c) It takes its production instance down before it records.** Deploy → measure (in a `try`) → `takeDown` → row → event → answer.
  `takeDown`, under the environment's lock, with two guards each read under it: (1) the instance is still `healthy` (a later deploy, a
  failed start or an archive has it otherwise); (2) the name is removed only while the edge's route dials THIS instance (an archive's
  switched-off page, or another instance, stays). Then the Route record naming it goes and `retireInstanceRow` retires it. The name
  answers the public wildcard afterwards; `getEnvironment(production).instance` is the rehearsal's instance, `gone` (`failed` when it
  never started) — never `null` (Decision 4).
- **A take-down that fails** is `500 REHEARSAL_TEARDOWN_FAILED` (registered, declared, its message naming what is left), an operator line,
  no row. `RehearsalError`'s codes are a typed union, mapped by the registry's status (the other five stay `409`).
- **FE-43**: a second rehearsal of a project while one runs is refused `409 REHEARSAL_RUNNING` and deploys nothing — `tryWithRehearsalLock`,
  a Postgres advisory try-lock on its own connection (cross-process; released with a dead process).
- **The fix wave** (the whole-branch review's I2): a deploy that THROWS after the name moved releases it (`releaseUnlaunchedName`); and the
  boot takes down every production Route record of an active, never-launched project (`takeDownLeftRehearsals`, `recoverAtBoot`'s pass
  2¾; boot line `rehearsalsTakenDown`/`rehearsalsNotTakenDown`) — a control plane that stopped mid-rehearsal, and any rehearsal from
  before this task.
- **Sitting 5's contract bundle**, four of five (the fifth was already done): `removeMember` *"publishes no `member.removed`"*;
  `AI_CATALOGUE_DISABLED`'s remedy covers a removal or a revoke; `member.removed.tokensRevoked` counts an expired, unrevoked token;
  `agent_session.narrowed`'s lists `minItems: 1`. **Contract still `1.5.0`.**
- The guides (`launching.md` step 2, `authentication.md`'s step-up list), the console's wording (its `<Refusal>` already offered the
  step-up link), `make demo-production`'s admin phase (refused un-stepped, nothing deployed, then stepped up; the wildcard and `gone`
  after), RUNBOOK, WALKTHROUGH and ORIENTATION §3.

**The timing the front-end asked for**: with the take-down, a PASSING rehearsal took **8.8 s** through the edge in `make demo-production`
(fresh, load ~11) and **5.6 s** in the Docker tier (twice: 5597 ms, 5629 ms); sitting 1 measured ~7 s without one. The front-end's
150 s client deadline stands with a wide margin.

**What sitting 5b found** (the count is derived by the command at the head of this section):

**F1 The plan's Decision 2 named routing/'s `instanceIdOf`/`servingRoute` for the route check; `launch/` holds a `Driver`, not
`RoutingDeps`.** Ruled: `driver.servingInstance(hostname) === instance.handle` — the edge's own route by hostname, the question the
retirer already asks, and one the fake driver answers.

**F2 The plan's control (d) — *"the route check in the take-down removed → (iv) red"* — could not fail as the plan wrote (iv).** A racing
DEPLOY marks the rehearsal's instance `destroying` in the same lock section it moves the name in, so guard (1) returns before the route
check is read. A case only the route check sees was added — an archive's switched-off page put on the name during the sign-in — and (d)
went red there alone; a separate control (d1) holds guard (1).

**F3 A sign-in probe that THREW, or a registration the rehearsal could not read back, would have left the candidate serving**: both throw
between the deploy and the row. Steps 2–4 now run in a `try` and the take-down after them whatever they did; the take-down's error wins
(it is the one that leaves something serving), the measurement's becomes an operator line.

**F4 FE-43, measured before the lock: a second press during the first rehearsal RAN** — `200`, with its own production deploy (the red
run). Two rehearsals at once probe each other's instance.

**F5 Decision 6's *"check which, and test it"*: a start that fails inside the rehearsal stays `failed`** — the deploy captured its Incident
and removed the container before it answered — and the take-down retires nothing. The test was written after the code; its red is
control (d1). It is exactly what the front-end reads (`passed: false`, `signInStatus: null`, the Incident on production).

**F6 The `[S5]` contract bundle's `revokeToken` item was already done**: `manifest-00`'s boundary pass wrote its revoke-before-`503` sentence
(`5246d4d`) after the block was written.

**F7 WALKTHROUGH's clicked order changed**: an approval within ten minutes of the rehearsal's step-up is not refused, so its row 9 refusal
is conditional now (and row 7 gains the step-up). Found while sweeping it, not by any gate.

**F8 Two callers ran the rehearsal un-stepped**: `delivery.test.ts`'s `REHEARSAL_NO_CANDIDATE` case and `make demo-production`'s admin
phase. Both step up now; the journey keeps the un-stepped refusal as a check, and asserts nothing was deployed by it.

**F9 The first full Docker tier (on `0b09efc`): 268 of 270, the two new rehearsal cases RED at the container check** — the helper filtered
`manifest.slug` + `manifest.environment=production`, which production's EGRESS PROXY also carries (`mf-prod-rehearse-production-egress`,
meant to stay, Decision 7). A test defect, predicted by the whole-branch review (I1) before the tier answered; the BODY assertions passed.
Now `manifest.instance`, `-a`, with a positive control while the instance serves.

**F10 The whole-branch review's I2: the take-down ran only when `deployRelease` RETURNED.** (a) A control plane that stopped between the
deploy and the take-down left the candidate on the public listener — the edge is its own process and keeps the route, and the boot's
pass 1 restores the Route record — and so would every rehearsal from before this task; (b) a deploy that threw after `ensureInstance`
moved the name returned no instance to take down. Both fixed (above), each with a test.

**F11 Two sentences this sitting published were false in a branch** (the review's M1): *"reads the rehearsal's instance as `gone`"* (a
failed start reads `failed`) and `REHEARSAL_TEARDOWN_FAILED`'s *"the project's events name the step"* (the name step publishes none).
Corrected in the fix wave's contract commit.

**F12 Comments the take-down falsified** (M2): the FE-36 floor comment (*"what production's route then serves"* — the floor now rests on
`servingInstanceOf`'s fallback to the `gone` instance), `removeName`'s *"only a delete calls it"*, `retireInstanceRow`'s *"for the archive"*,
and step 6's *"a launch cannot start in between"* (an earlier passing row keeps the item met through a re-run).

**F13 The TEARDOWN re-run test rested on a race** (M4(c)): the re-run's take-down could take the lock before the retirer's pass, which
then found nothing serving and left the first instance `destroying`, its container running. Made deterministic (the probe awaits the
retirer); the leftover is carried.

**F14 Process — the boot pass's code was written BEFORE its test**, a TDD breach; its reds are controls (g) and (h). **And restoring
control (g) with `git checkout recover.ts` WIPED the uncommitted fix**: control (h)'s first run was red for that reason (`undefined`
where the report belonged) and is not counted. Re-applied, committed (`fff8a7f`), and (h) re-run red at its own assertion. Commit BEFORE
breaking — the plan's own order, which the fix wave skipped.

**F15 Control (e)'s first edit matched nothing** — Prettier had wrapped the line — and the script's own assert stopped it before a run
(ORIENTATION §4 trap 11's class, caught rather than recorded as "cannot fail").

**The negative controls**, each predicted, applied (the diff read), run and restored:
- (a) `assertStepUp` removed from the route → RED 1: the ORDINARY-session case (`bio_prof`: `200` where `403 STEP_UP_REQUIRED` belonged).
- (b) `launch:rehearse` removed from `STEP_UP_GUARDED` → RED 3: `step-up-guarded.test.ts` ×2 AND the ORDINARY-session case — the plan's
  question answered: `assertStepUp` consults the set (`if (!STEP_UP_GUARDED.has(capability)) return`), it does not trust its caller.
- (c) `takeDown` removed → unit RED 6 (`healthy` where `gone` belonged); the deploy race and `REHEARSAL_RUNNING` GREEN, as predicted.
  **Docker (`production.docker.test.ts` alone): RED 2 ON THE BODY** — `{"status":"ok"}` (the app) where `manifest OK host=… listener=public`
  belonged.
- (d) the route check removed → RED 1: the switched-off page only (F2).
- (d1) the `healthy` guard removed → RED 2: the failed start (retired to `gone`) and the deploy race (`500` — `nextState('gone', …)` throws).
- (e) the rehearsal lock bypassed → RED 1: `REHEARSAL_RUNNING` (a second `200`).
- (f) the take-down moved after the row → RED 4: PASSED at the ORDER check (`ran_at >= instance.retired`, `after: false`), THROWS, both
  TEARDOWN cases.
- (g) the boot pass not called → RED 1 (`takenDown: []`). (h) the launched filter removed → RED 1 at the LAUNCHED half.

**Carried, not fixed** (the review's minors and what the fix wave exposed; the ledger has each):
- A failed take-down's `destroying` instance is retried by nothing until a re-run, a launch or an archive — and `instance.retire_failed`
  says *"it will be tried again"*; `instance.retiring`/`retired` call the candidate *"the previous version"*.
- `releaseUnlaunchedName` leaves the failed deploy's container on no listener, for the next deploy's retirer (it lists the name's containers).
- Between a crash and the next boot, the edge still serves the candidate: the boot pass is the remedy, and it needs a boot.
- `REHEARSAL_RUNNING`'s remedy assumes the running one answered `200` (a refused one writes no row).
- `tryWithRehearsalLock` holds a pooled connection for the whole rehearsal (pool max 10, no connection timeout) — stated nowhere yet; an
  unlock that throws replaces the answer's error (shared with `withAdvisoryLock`).
- No test asserts the environment lock around `takeDown`, or the take-down-over-measurement error precedence.
- **The mock's fixture `why` (`packages/mock/src/fixtures.ts:667`) still reads the old sentence** (no *"taken down again"*) — Decision 8;
  sitting 10's mock work.

**Gates on the final tree** (`fff8a7f` code; HEAD `02497dc` — `manifest-00`'s, its own two files — before this close-out):
- `pnpm test` **2936 passed, 0 skipped, in 184 files (800 s, load ~4, 0 `deadlock detected`)**, then **2936 / 184 (801 s, 0 `deadlock
  detected`)** — twice, alone. Up 12 from 2924, no new file (`api/delivery.test.ts`'s rehearsal cases); `EXPECT_TESTS` moved.
- `pnpm test:docker` — the whole tier on `0b09efc` (code `3333acc`/`0b09efc`): **268 passed, 2 FAILED, 270 in 42 files**, 1238 s — the two
  new rehearsal cases at the container check (F9). After the fix wave, the two files it reached, alone on `fff8a7f`:
  `releases/production.docker.test.ts` **9/9** and `boot.docker.test.ts` **7/7**. **270 in 42**, ORIENTATION §2's row.
- `pnpm lint`, `typecheck` and `format:check` clean.
- `make verify` **62 / 0 / 0**, `make doctor` **20 / 0 / 0**.
- `make demo-production` fresh (47 s) and re-use (4 s), and `make demo-releases` (124 s), green on driver 1 on `253a923`'s tree.

**The machine at the close**, queried, not remembered: 
- **The control plane: PID 21628 on 7100, on `fff8a7f`, REAL GitHub** (Rich's `.env`), restarted LAST, after the unit runs, by
  `.superpowers/sdd/2026-09-29-launch-path/cp-start.sh` (unchanged; detached, `nohup`). Its boot line reads `"source":"github"`,
  `"github":"api.github.com"`, `"githubOrg":"Manifest-local-dev"`, `capableModel: registered`, `capableFallback: set`,
  `sourceRepositoriesPrepared: 2`, and the new `rehearsalsTakenDown: 0`, `rehearsalsNotTakenDown: 0`. **This sitting ran it on DRIVER 1**
  (PID 52233, the driver and real-App settings unset) for `make demo-production` and `make demo-releases`, and restored Rich's choice at
  the close.
- **The control database: EMPTY** — 0 projects, users, instances, routes; **44 migrations** (none added).
- **GitHub**: `Manifest-local-dev` holds **0 repositories** (`bash scripts/github-real-repos.sh`).
- **Containers: 6 `mf-launch-app-*`** (both environments' app, database and egress proxy) — `make demo-production`'s, whose rows the final
  unit runs truncated — with their **2 networks and 4 volumes** (`make verify`'s INFO: `mf- containers=6 networks=2 volumes=4`). The edge
  holds no route to them (srv0 and srv1 read). **Their removal by name was REFUSED by the permission classifier**; a script naming the six,
  then `dead-app-resources.sh --apply`, was handed to Rich. **14 Docker networks** in all.
- **Cleanup**: `dead-app-resources.sh --apply` (7 networks + 1 volume) and `app-images.sh --apply` (22 images) applied by this session, and
  re-measured: what is left is `launch-app`'s. `litellm-orphans.sh` lists **13** orphaned (people's agent budgets and the platform's intake
  budget among them) — **not applied**, for sitting 5's reason: a budget's deletion resets its month, and the script's one mode takes all.
- **7102 and 7105 are the faculty front-end's** (node 35047 and 15448). **Nothing on 7104.**
- Ollama **0.35.0**; **free disk 70 GiB** (75 at open). Load ~5.5.
- `scripts/snapshot-machine.sh` at open and close: identical but for the uptimes, the free disk, and `launch-app`'s containers, image and
  network.

### Sitting 5a — 2026-09-30: Task 8a — FE-39: who may build — faculty, or an administrator named by a setting

**Run by session `manifest-74`, INLINE** (`superpowers:executing-plans`: one context, TDD per step, one fresh whole-branch review
beside the Docker tier, one fix wave) on `main`, from `3124d8c`, after Rich's word that the faculty front-end's 7100 window was done
(its walk and his click of `class-check-ins`). **Rich's four first-message answers**: dump the database first — done,
`.superpowers/sdd/2026-09-29-launch-path/manifest_control-before-sitting5a-2026-09-30.dump` (143 KB, `pg_dump --format=custom`: `my-answers`,
`class-check-ins` — launched — `operator` admin and `instructor`, 7 instances, 4 tokens, 44 migrations); **delete both real repositories at
the close**; remove the window's 22 app containers at the close; `make refresh-vulndb` is his.

Peers:
- **The faculty front-end**: `manifest-app-f1` had ended; its handover reached this session through `manifest-83` (a research-only session).
  Its successor `manifest-app-4d` was told the shape before the contract commit and at the close; it OK'd moving the mock's `MEMBER`
  fixture to a faculty colleague (*"it breaks nothing of ours"*), and starts its F4a at this close.
- **The planning session**: `manifest-00` handed over to `manifest-60` during the sitting; it adds Mailpit right after this close.
- **`manifest-92`** runs sitting 6 (Task 9), after Mailpit; it held Vitest, restarts, cleanup and edits until this close.

**What it made true** (`8771272`, and the fix wave's `42cd8c5`):
- **The control plane asks for `eduPersonAffiliation`** — six attributes (`sso/platform.ts`); the platform's SP row the boot writes lists
  it, so the real IdP releases it (seen in `make demo-frontend`: the student's real sign-in carried `student`, the colleague's `faculty`).
- **It is UBC's current fact, written at EVERY sign-in** — `users.affiliations` (every value as sent) and `affiliations_seen_at`
  (migration `0044`), `[]` when the assertion carries none, never kept from an earlier sign-in (Decision 27).
- **ONE predicate, `identity/builders.ts`'s `mayBuild`**: an administrator, or `faculty` exactly — no folding, no trimming, no setting
  (Decision 30). `Me.mayBuild` answers it from the SESSION's role and the row's affiliations.
- **`createProject` and `startIntakeSession` refuse anyone else `403 BUILDING_NOT_OPEN`, FIRST** — before a blueprint, a starter or a
  slug is checked, and before any count is read or key minted. **`addMember` refuses a NEWCOMER who may not build `409
  MEMBER_MAY_NOT_BUILD`**, naming them by display name — decided in `projects/`'s `addMember`, against the membership read `FOR
  UPDATE` under the project's lock; a member who stops being faculty keeps their place and their role can still change (Decision 29).
  A token's confirmed retry meets the same rule.
- **`MANIFEST_ADMIN_PUIDS`** (Decision 28): set, authoritative — every sign-in reconciles the role to it, `FOR UPDATE`, an
  `audit.role_changes` row with actor `setting:MANIFEST_ADMIN_PUIDS`; unset (the default), nothing is reconciled and
  `scripts/admin-grant.sh` stays the procedure; a stray comma refuses the boot.
- **The people**: the unit tier's `TEST_USERS` carry affiliations and gain a fifth, `bio_colleague` (faculty); the laptop IdP gains
  `colleague` / `colleague` (`col000001`, faculty — Decision 31); `make demo-frontend`'s step 7 and `make demo-token` add the colleague
  and show the student refused; the mock answers `mayBuild` and plays `MANIFEST_MOCK_MAY_BUILD=0`, and its `MEMBER` is a colleague now.
- The guides (`frontend.md`'s new *Who may build*, `authentication.md`), `.env.example`, RUNBOOK, WALKTHROUGH, `docs/external-track.md`
  (six attributes for the control plane's UBC registration). **Contract still `1.5.0`.**

**What sitting 5a found** (the count is derived by the command at the head of this section):

**F1 The plan's Step 2 count measured the wrong thing.** `grep sessionFor|loginAs|withProjectServer` reads 401 occurrences in 28 files,
and almost none of them could go red: once `TEST_USERS` carry `faculty` for `bio_prof` and `unrelated_user`, every fixture owner may
build. The wide red, measured on the implemented tree over the 26 files that call the three routes, was **19 tests in 9 files** —
exactly where a STUDENT is added through the route (the members suite's lookup block ×9, delegation ×3, projects ×2, delivery ×1,
events ×1), starts an intake (×1), the authorization matrix's fixture, and `auth.test.ts`'s exact `Me` (a shape change). Then the
matrix's two rows that expected the student collaborator to `pass` (×2).

**F2 The plan says the three operations are session-only, "so no token path exists to guard" — `addMember` is not.** A delegated
token's request becomes a pending action, and the CONFIRMED RETRY reaches the same handler. The check in the handler covers it; a pair
in `delegation.test.ts` holds it (a student refused after the confirmation, a colleague added by the same loop).

**F3 The plan did not say what a role change is for a member who stopped being faculty.** Ruled from §13 as Spec action 7 amended it
(*"keeps the projects they are on"*): not an add, so not refused; decided under the project's lock in `projects/`'s `addMember`
(`newcomerMayBuild`). Control (d).

**F4 `unrelated_user` must be faculty.** `withProjectServer` creates its second project AS `unrelated_user` through the route; the
plan's *"as their roles say"* would have made every fixture red. Another instructor, a stranger to the first project.

**F5 The authorization matrix's collaborator persona is a student**, made a member through the route. Its fixture now adds them through
`projects/`'s `addMember` (a member who keeps their place), and its `POST /v1/projects` and `POST /v1/intake-sessions` rows expect `403
BUILDING_NOT_OPEN` for that persona — by code, a new constant beside `STEP_UP`.

**F6 The test IdP signed one value per attribute**; UBC's `eduPersonAffiliation` is multi-valued. Widened to arrays.

**F7 The mock's `MEMBER` fixture was a student added as a collaborator** — a picture of an add the platform now refuses. Moved to a
faculty colleague at the front-end's word (*"it breaks nothing of ours"*); the console's own test with it.

**F8 Process — the Docker tier was started BEFORE the two Docker files the plan names were changed.** `boot.docker.test.ts` pinned
the five names — and went RED there, as predicted before it answered (*expected six to equal five*); `identity/saml.docker.test.ts`
asserted nothing about the affiliation, so the tier was green on it for the wrong reason. Both fixed in the fix wave and run alone.

**F9 `make demo-token`'s student refusal needed the student signed in to Manifest** — or the refusal is `400 MEMBER_USER_NOT_FOUND`,
which reads as a different defect. The script signs both the colleague (added) and the student (refused) in.

**F10 The whole-branch review's I2: a removal racing a role change RE-ADDED a person who may not build** — and the repository's comment
said it could not. `addMember` read `before` with a plain SELECT; a removal committing between that read and the upsert left the call
believing it was a role change, and the upsert, finding the row gone, INSERTED it. Reproduced deterministically (the membership held FOR
SHARE as a start holds it; the removal's DELETE waiting; the role change queued behind): `201` where `409 MEMBER_MAY_NOT_BUILD`
belonged. Fixed NARROWLY — the `before` read `FOR UPDATE` — rather than by the reviewer's preferred project lock in `removeMember`, which
would hang Task 8's two deterministic tests (`members.test.ts`, *"refused NOT_FOUND"* and *"a mint that read the membership…"*, built
on the removal NOT needing the project row). The older race that lock would also close is carried (below).

**F11 The review's I3: `addMember`'s published example added `student`, `201`** — the request the same description now says is refused.
The example names the colleague now.

**F12 The review's I5: `docs/external-track.md` told the control plane's UBC registration to leave `eduPersonAffiliation` OUT** — filed as
written, UBC would release none and nobody but an administrator could build. Six attributes now.

**F13 The review's M7, re-graded Important: `BUILDING_NOT_OPEN`'s hint sent a faculty member to an administrator who cannot help.**
Migration `0044` gives every existing row `[]`, and a session issued before it decides from that row: every faculty member signed in
before the change is refused until they sign in AGAIN. The hint and the remedy now lead with that.

**F14 The review's M11(a), re-graded Important: Decision 30's "exactly `faculty`" was held only in the predicate**, not where UBC's value
enters — a reader that folded or trimmed would have left every test green. A sign-in carrying `Faculty`, ` faculty` and `faculty ` now
stores them verbatim and may not build; its control (the reader folding) is red.

**F15 Process — my first-message question to Rich said the window left "22 app containers"; there were 17.** Not counted when asked —
§6's *count what you summarised*. Corrected in the close message.

**The negative controls**, each predicted, applied (the diff read), run and restored by `git checkout` of the committed file:
- (a) `mayBuild` → `true`: RED 17 of 24 across the seven files' FE-39 tests — every refusal and every `mayBuild: false`; the seven green
  are exactly the positive-only cases. The first test red at its FIRST assertion.
- (b) the sign-in writer keeping the affiliations when the attribute is absent: RED 1 — *an assertion without eduPersonAffiliation …
  may not build*.
- (c) the administrators' list read by CWL login: RED 2 — *an administrator named by MANIFEST_ADMIN_PUIDS…* (the operator carries no
  `uid`) and *the administrators' list is of PUIDs…*.
- (d) the already-a-member exemption removed: RED 1 — *a member who stops being faculty keeps their place…*.
- (e) the refusal moved after the slug check: RED 1 — *a slug check never runs first…* (`409 SLUG_RESERVED`).
- (f) the reader folding and trimming (on the fix tree): RED 1 — *keeps each affiliation exactly as UBC sent it…*.
- (g) `eduPersonAffiliation` removed from `CONTROL_PLANE_ATTRIBUTES` (Docker, `identity/saml.docker.test.ts` alone, on `42cd8c5`): RED 1 at
  `mayBuild` — the REAL IdP released nothing it was not asked for.
- The race (F10) was watched red before its fix, at its own assertion.

**Carried, not fixed** (the review's minors and what the fix wave left; the ledger has each):
- **The older no-owner race**: demoting owner A while owner B is removed can leave a project with no owner — `removeMember`'s guard is in
  its DELETE and it takes no project lock (by Task 8's tests' design); pre-existing since P5b Task 8.
- The target check reads the target's ROW role: with `MANIFEST_ADMIN_PUIDS` set, a former administrator the list no longer names is
  addable until their next sign-in (M6).
- The step-up callback discards the assertion's affiliation, unstated (M8); `scripts/admin-grant.sh` does not warn that the setting, when
  set, undoes a grant it does not name (M9); a role reconciled at sign-in writes no operator line (M10).
- Three tests that cannot fail for what they name: `affiliationsSeenAt >= first` cannot see a never-updated column; the keeps-tokens
  test simulates the sign-in with a raw UPDATE; `toIdentity`'s friendly-name fallback is untested (M11 b–d).
- Two comments overclaim: `createProject`'s *"learns nothing about which names are taken"* (`checkSlug` is open to them), and the
  reconciliation's `FOR UPDATE` credited with what the upsert's row lock already gives (M12).

**Gates on the final tree** (`42cd8c5` code):
- `pnpm test` **2962 passed, 0 skipped, in 185 files (813 s, load ~4–5, 0 `deadlock detected`)**, then **2962 / 185 (798 s, 0 `deadlock
  detected`)** — twice, alone, identical. Up 26 from 2936 and one file (`identity/builders.test.ts`); `EXPECT_TESTS`/`EXPECT_FILES` moved.
- `pnpm test:docker` — the whole tier on `8771272`: **269 passed, 1 FAILED, 270 in 42 files**, 1239 s — `boot.docker.test.ts` at the
  attribute list (F8), predicted. After the fix wave, the two files it reached, alone: `boot.docker.test.ts` **7/7**,
  `identity/saml.docker.test.ts` **4/4**. **270 in 42**, ORIENTATION §2's row.
- `pnpm lint`, `typecheck` (all six packages) and `format:check` clean.
- `make verify` **62 / 0 / 0**, `make doctor` **20 / 0 / 0** (after the restart and the cleanup).
- `make demo-token` (32 s) and `make demo-frontend` (127 s, fresh) green on driver 1 on `8771272`'s tree.

**The machine at the close**, queried at 22:45, not remembered:
- **The control plane: PID 50862 on 7100, on `42cd8c5`, REAL GitHub** (Rich's `.env`), restarted LAST, after the unit runs, by
  `.superpowers/sdd/2026-09-29-launch-path/cp-start.sh` (unchanged; detached). Boot line: `"source":"github"`, `"github":"api.github.com"`,
  `"githubOrg":"Manifest-local-dev"`, `capableModel: registered`, `capableFallback: set`, `sourceRepositoriesPrepared: 4`,
  `rehearsalsTakenDown: 0`. **This sitting ran it on DRIVER 1** (PID 39828, `$SCRATCH/cp-driver1.sh`: `.env` sourced, then the source
  driver and the real-App settings unset) for `make demo-token` and `make demo-frontend`, then stopped it for the Docker tier and the unit
  runs (one control plane per database).
- **The control database: EMPTY** — 0 projects, users, instances, routes; **45 migrations** (`0044_big_black_panther` newest).
- **GitHub**: `Manifest-local-dev` holds **0 repositories** — `class-check-ins` and `my-answers` DELETED at Rich's word
  (`github-real-repos.sh --delete`, one at a time). Their mirrors stay in `.manifest/repos/` (named by `dead-app-resources.sh`, never
  removed by it; the S5 spike reads `my-answers.git`).
- **Containers: 0 `mf-`** — the window's 17 and this sitting's demos' 6 removed by name (`docker rm -f -v`, allowed); then
  `dead-app-resources.sh --apply` (15 networks, 17 volumes) and `app-images.sh --apply` (21 images), each re-measured to 0. `make verify`'s
  INFO: `mf- containers=0 networks=0 volumes=0`. **12 Docker networks** in all. `litellm-orphans.sh` lists **17** orphaned — **not applied**,
  for sitting 5's reason (a budget's deletion resets its month, and the script's one mode takes all).
- `infra/idp/config/authsources.php` written through in place (inode `41391714` unchanged); the container reads the new file
  (`sha256` equal, `php -l` clean).
- **7102 and 7105 are the faculty front-end's** (node 35047 and 73117). **Nothing on 7104.**
- Ollama **0.35.0**; **free disk 67 GiB** (71 at open). Load ~5.
- `scripts/snapshot-machine.sh` at open and close: identical but for the uptimes, the free disk, the edge restarted by the Docker tier, and
  the 17 window containers removed.

### Sitting 6 — 2026-09-30/10-01: Task 9 — the three clocks' records: a staging registration, an owner's "I've sent it", and waiting since

**Run by session `manifest-92`, INLINE** (`superpowers:executing-plans`: one context, TDD per step, one fresh whole-branch review beside
the Docker tier, one fix wave) on `main`, from `2d03271`. **Rich's word, in this session's chat**: *"I confirm that you can work on this
when the other agents say that it is your turn"*. It started after sitting 5a's close (`manifest-74`, `003adf7`) and the planning session's
*"Mailpit landed"* (`manifest-60`, `8155bcf`/`2d03271`). §7e's two questions answered themselves: the database held only the front-end's
walk's two users (dumped anyway: `.superpowers/sdd/2026-09-29-launch-path/manifest_control-before-sitting6-2026-09-30.dump`, 77 KB), and
`make refresh-vulndb` is not due until after 2026-10-06.

Peers:
- **The faculty front-end, `manifest-app-4d`**: ran F4a beside this sitting; asked for a 7100 window mid-implementation (Rich's ask) — given
  at once, with no Vitest, no Docker tier, no `make verify`, no restart and the migration HELD until it closed; told before each contract
  commit (*"OK, commit it"*, twice); its 1671 tests pass on this tree, and five of its going-live test files gained `since` in its own
  F4a-close commit (`bb943c2`).
- **The planning session, `manifest-60`**: Mailpit first (`EXPECT_DOCTOR` 21, `EXPECT_VERIFY` 64).
- **The S5 spike, `manifest-s5-b3`** (Rich's overnight spike, its own repository): held its on-premise and capable-model runs at this
  sitting's ask — the Docker tier's control planes remove `default-chat-large`, which ended one of its runs — until the close.

**What it made true** (`b2c75e6`, and the fix wave's `db2ddbf`):
- **A registration per environment** (migration `0045_organic_quasar`): `iam_registrations.environment_kind` (`staging` | `production`,
  every older row `production` by the column default), UNIQUE `(project_id, environment_kind)`; `submitted_at`, `submitted_by`,
  `generated_package`; `registered_attributes` defaults to `[]` and **its CHECK holds only a REGISTERED row** (`registered_at IS NULL OR
  jsonb_array_length(...) > 0`). `privacy_assessments` gains `submitted_at`, `submitted_by`. `getIamRegistration` takes the environment,
  required.
- **An owner's *"I've sent it"*** — `submitIamRegistration` (`POST …/launch-records/iam-registration/{environment}/submission`) and
  `submitPrivacyAssessment` (`POST …/launch-records/privacy-assessment/submission`), session-only, **`launch:submit`** (owner,
  collaborator, administrator; **PERSON_ONLY**, in all four published lists). In ONE transaction (the record `FOR UPDATE`, the assessment
  and staging's registration `FOR SHARE`), each refusal before anything is written: a draft is required (`409 LAUNCH_DRAFT_REQUIRED`);
  only along `SUBMIT_ARROWS` (`409 LAUNCH_TRANSITION_INVALID`); **UBC's order** — neither registration until the assessment is approved
  WITH its reference (`409 LAUNCH_PIA_NOT_APPROVED`), production's only once staging's is `active` (`409 LAUNCH_STAGING_NOT_REGISTERED`);
  a day that can be true (`400 LAUNCH_SENT_AT_INVALID`, `sentAt` a `format: date`, stored at noon in Vancouver). The events
  `iam_registration.submitted` and `privacy_assessment.submitted`. **An administrator's record of UBC's answer is never refused for
  order**; its move into `submitted`, or a filed change request, stamps when and by whom; and it keeps a reference it does not give.
- **The build checks only the PRODUCTION registration UBC has registered** (`registered_at` set): a draft, a submission and the staging
  registration gate nothing (Review Focus 1's build half).
- **The checklist reads production's row only**, and every item carries **`since`** — while a record waits on UBC, the day it was said to
  be sent (*"It was sent to UBC IAM on October 14, 2026."*); once met, the day UBC registered it or the Office approved it; else null.
- `LaunchRecords.stagingRegistration`; `IamRegistration.environment/submittedAt/submittedBy/createdAt`;
  `PrivacyAssessment.submittedAt/submittedBy/createdAt`; `RecordIamRegistrationRequest.environment` (default production).
- **`[M8]`**: a capability no project role holds (`launch:record`, `release:approve`, `quota:set`) is refused with a hint naming a platform
  administrator; `LaunchRecordError`'s status is the registry's.
- The mock's fixtures carry it all, in UBC's order; the console parks both operations for Task 13; the journey names them outside it.
  **Contract still `1.5.0`.**

**What sitting 6 found** (the count is derived by the command at the head of this section):

**F1 The plan's two test files do not exist.** It names `src/api/launch.test.ts` and `launch/testing.ts`'s `withDraft` as if present;
neither existed at `2d03271`. Both were created (the records' older route tests live in `api/delivery.test.ts` and
`api/subsequent-releases.test.ts`).

**F2 The predicted migration number was taken**: `0044` is sitting 5a's; Task 9's is `0045`.

**F3 The plan's own test contradicted its own formatter.** It asserts *"sent to UBC IAM on 1 October 2026"* while Step 3 names
`Intl.DateTimeFormat('en-CA', { dateStyle: 'long' })`, which renders *"October 1, 2026"* (node 24.12.0). The formatter is the
instruction; the tests follow it.

**F4 The plan's snippet sends a day its own rule refuses**: `sentAt: '2026-10-01'` on 2026-09-30 is in the future. Tests compute days
relative to today in Vancouver (`vancouverToday`, `vancouverDaysAgo`).

**F5 The plan's interface omits the bus.** `submitIamRegistration(db, { userId, … })` publishes an event; it takes `(db, bus, { …, actor
})`, as `recordIamRegistration` does.

**F6 `LaunchRecordError` was always `400`**, and the plan puts three `409`s in its family. `api/errors.ts` now reads each code's status
from the registry — the existing *"answers each class-thrown code with the status the registry states"* test would have gone red.

**F7 The build test's fixture called a row registered by its STATE alone** — `active`, `registered_at` null. Under Decision 7 its refusal
case would have stopped refusing; the fixture now says when UBC registered it.

**F8 The plan's control (c) could not have failed** had the submission asked the state machine too: the machine's arrows INTO `submitted`
are exactly `SUBMIT_ARROWS`, so adding `submitted` to the set changes nothing while `iamTransition` still refuses `submitted →
submitted`. The submission decides by `SUBMIT_ARROWS` alone (`refuseSubmission`), and control (c) is red (3).

**F9 An existing test asserted the invariant Decision 7 changes** — *"the DATABASE refuses an empty list"*. It now inserts a REGISTERED
row, beside a draft positive control (a draft at `[]` stands).

**F10 The contract's new required fields broke the mock's `tsc`** (its fixtures are typed `Schemas['…']`) at regeneration; the fixtures
gained them in the same commit, and the front-end, which reads this tree live, fixed five test files of its own.

**F11 Two test defects of my own**, caught at the first green run: a sorted list asserted in the wrong order, and an event case that sent
a day before its own draft existed — which the code rightly refused.

**F12 Ruling: the assessment's submission needs a draft too.** Decision 9 names only the registration; §13 (*"Each of the three is drafted
by Manifest and sent by the owner"*) and *"the package sent is the package kept"* cover both. Until Task 11, nothing can meet it.

**F13 Ruling: what `submitted_at` means.** *"When the request now with UBC was sent, and who said so"* — stamped by the owner's
submission, by an administrator's move INTO `submitted`, and by filing a change request; never by UBC's answer. So `since` for
`submitted` and `change_requested` (the plan's rule) is the moment that request went, for both of `change_requested`'s meanings — and
Task 12's queue can date an administrator-recorded submission too. `change_requested`'s two meanings are carried to Rich (Task 12's `[S6]`).

**F14 The whole-branch review's I1: every submission was check-then-act.** It read the row, checked the arrows and UBC's order, then
`UPDATE … WHERE id`: two submissions, or an administrator's write in the window, moved the day the clock started, or let a submission
through a gate that had just closed (an assessment reopened, staging lapsed). Fixed: one transaction, the record `FOR UPDATE`, the
assessment and staging's registration `FOR SHARE`. **Held by two DETERMINISTIC tests** (a second connection holds the row, changes it and
commits once the submission waits on it): RED before — `200` where `409 LAUNCH_TRANSITION_INVALID` belonged, and a gate read that never
waited — GREEN after; controls (h) and (i).

**F15 The review's I2: `sentAt` accepted impossible days** — `2026-02-30` was stored as March 2, `2026-00-15` passed a December draft
and was stored before it, and the event's day and sentence disagreed. `z.iso.date()` at the route, and the module refuses a day that does
not round-trip; controls (j) and (j2).

**F16 The review's I3: a PRODUCTION submission never checked the assessment.** The applied spec says *"neither of an app's registrations
is sent until the assessment is approved"*; `[S9]` named only staging's check for production, and the transitivity failed whenever an
administrator recorded staging `active` — never refused for order, and the laptop's normal path — or the assessment was reopened. Now both
check it, first; control (k). **A ruling wider than `[S9]`, from the spec's own words.**

**F17 The review's I4: Review Focus 1's checklist half belonged to no task** — *"the item says the draft no longer covers the app, and to
draft again"* needs a draft's attribute list (Task 10's package) — and `build.ts`'s comment claimed it was done. The comment says *will*,
and Task 10's `[S6]` owns it.

**F18 The review's I5: the mock showed an order the platform refuses** — the owner's staging submission dated before the assessment's
approval. I had carried it to sitting 10; the review graded it by its effect on the front-end's F5b, which designs the sequence from these
fixtures. The dates now follow UBC's order (the assessment approved, staging, production, then the assessment reopened and re-sent), every
state the fixtures showed kept.

**F19 The review's I6: `registeredAttributes`' published description became false** (*"a production build fails when a release asks for
an attribute that is not in here"* — of a staging or unregistered row, now untrue). Rewritten.

**F20 The review's M1, re-graded Important: the build test passed for a wrong reason.** Control (a)'s red came from the EMPTY-list
refusal, not the `registered_at` predicate — so a check that skipped empty lists would have stayed green while an administrator-recorded
`submitted` row (never empty) gated builds: Review Focus 1's own failure. The submitted case now holds a non-empty list; control (m) is the
one the old test could not be.

**F21 The review's M2, re-graded Important: an administrator's record without a ticket ERASED the owner's reference** — for the assessment,
the PIA number the staging gate reads, so a later submission would be refused. It keeps it now.

**F22 The review's M11, re-graded: the new operations' examples were invented**, against *Global Constraints*' *"captured from its own
tests"*. Captured from `api/launch.test.ts`'s answers (six), the test file restored after.

**F23 Process — my first fix-pass edit script stopped at its second edit**, so the two race tests and the kept-reference test did not exist
at the first red run: it read 4 red where 7 were written. Caught by counting the reds against the tests written, before any source fix.

**F24 Process — the front-end's 7100 window opened in the middle of implementation.** The migration was generated but not applied until
the walk was done, so the control plane it walked (on `42cd8c5`) saw the schema it was built for.

**The negative controls**, each predicted, applied (the diff read), run and restored by `git checkout` of the committed file
(`$SCRATCH/control.sh`) — on `b2c75e6`:
- (a) `build.ts`'s `registered_at` condition removed: RED 2 (the draft, the unregistered submission), at `toBe('succeeded')`.
- (a2) its environment filter removed: RED 1 (*a staging registration, even active…*).
- (b) `launch:submit` out of `PERSON_ONLY`: RED 6 (the literals ×3, the API probe, the mint loop, the phrase map) — and the route's own
  token case GREEN, as predicted: `requireSession` answers `TOKEN_CREDENTIAL_REFUSED` first, the second layer.
- (c) `submitted` in `SUBMIT_ARROWS.iam`: RED 3 (the literals ×2, *refuses a second submission*); the route's case GREEN (it drives the
  assessment).
- (d) the assessment's reference not required: RED 1. (e) staging merely present: RED 2. (f) the administrator hint never given: RED 2.
  (g) `since` never set for a registration: RED 2.

On `db2ddbf` (the fix wave): (h) no `FOR UPDATE` on the record: RED 1 (`200`). (i) no `FOR SHARE` on the assessment: RED 1 (timed out
waiting for the read under lock). (j) the module's real-day check removed: RED 1, the route green (its schema first). (j2) the schema back
to a pattern: RED 1. (k) production skipping the assessment: RED 2. (l) the reference erased again: RED 1. (m) the build skipping EMPTY
lists instead of unregistered rows: RED 1. **Every one red exactly where predicted.**

**Carried, not fixed** (the review's minors; the ledger has each):
- `since` for a FILED change request is read by no test; nor *"`submitted → change_requested` keeps the stamp"*, nor an administrator's
  move of the assessment into `submitted` (M10).
- A same-day submission's `submittedAt` is noon in Vancouver, up to ~12 h AHEAD of the moment — the descriptions should say it marks a
  DAY (M3; sitting 10's pass or Task 14).
- "Today" is the host's clock and the draft's day the database's (M5; TRAPS: the database's clock is not the host's).
- The older `why` sentences print UTC days beside the new Vancouver `since` (M6, the F23 trap).
- `LAUNCH_TRANSITION_INVALID`'s and `FORBIDDEN`'s registry remedies do not fit the owner's second submission or an administrator-only
  capability (M7).
- The CHECK no longer refuses `active` with `registered_at` null and `[]` — consider `CHECK (state <> 'active' OR registered_at IS NOT
  NULL)` (M8).
- `(D24)`/`(§9)` kept in lines this commit rewrote — sitting 10's pass (M9).
- **For Rich**: `change_requested`'s two meanings (Task 12's `[S6]`), and whether a RE-submission (production after `expired`) must wait
  for staging `active` too — Rich's *"Gate each step"* was asked of a first launch (§8 *Open*).

**Gates on the final tree** (`db2ddbf` code):
- `pnpm test` **3024 passed, 0 skipped, in 186 files (822 s, load ~4–7, 0 `deadlock detected`)**, then **3024 / 186 (823 s, 0 `deadlock detected`)** — twice, alone, identical. Up 62 from 2962 and one file (`api/launch.test.ts`); `EXPECT_TESTS`/`EXPECT_FILES` moved.
- `pnpm test:docker` — the whole tier on `b2c75e6`: **270 passed, 0 failed, 270 in 42 files**, 1246 s (load ~5). The fix wave's one
  Docker file, `releases/production.docker.test.ts`, alone on `db2ddbf`: **9/9**, 62 s; the rest of the tier reaches nothing it changed
  (ruled by grep). **270 in 42**, ORIENTATION §2's row.
- `pnpm lint`, `typecheck` (all six packages) and `format:check` clean.
- `make verify` **64 / 0 / 0**, `make doctor` **21 / 0 / 0** (after the restart and the cleanup).

**The machine at the close**, queried at 00:38 on 2026-10-01, not remembered:
- **The control plane: PID 96152 on 7100, on `db2ddbf`, REAL GitHub** (Rich's `.env`), restarted LAST — after the two unit runs — by
  `.superpowers/sdd/2026-09-29-launch-path/cp-start.sh` (unchanged; detached). Boot line: `"source":"github"`, `"github":"api.github.com"`,
  `capableModel: registered`, `rehearsalsTakenDown: 0`. **It was STOPPED for the Docker tier and the unit runs** (one control plane per
  database), so the capable model was out of LiteLLM from the tier's start (23:27) to the restart (00:35).
- **The control database: EMPTY** — 0 projects, 0 users, 0 registrations; **46 migrations** (`0045_organic_quasar` newest).
- **GitHub**: `Manifest-local-dev` holds **0 repositories** (`scripts/github-real-repos.sh`).
- **Containers: 0 `mf-`**, 10 `manifest-`; `dead-app-resources.sh --apply` (7 networks, 1 volume) and `app-images.sh --apply` (16 images),
  each re-measured to 0; `make verify`'s INFO `mf- containers=0 networks=0 volumes=0`; **12 Docker networks** in all.
  `litellm-orphans.sh` lists **18** orphaned — **not applied**, for sitting 5's reason (a budget's deletion resets its month).
- `make doctor` **21/0/0**, `make verify` **64/0/0** (Mailpit's counts).
- **The S5 spike's, not this sitting's**: its `s5-*` containers and images, and **32 anonymous volumes** created 23:08–23:31 PDT — in pairs,
  a MongoDB container's two; 2 used by its running `s5-A2-mongo`, 30 by nothing. Left alone; the spike told — **and it removed the
  30 itself at 00:46** (re-measured: of the 32, the 2 in use remain), its scripts now `docker rm -f -v`.
- **7102 and 7105 are the faculty front-end's** (node 26430 and 26458). **Nothing on 7104.**
- Ollama **0.35.0** (the S5 spike is loading `qwen3.8:27b` from 00:35, evicting the 4B, and re-warms it after); **free disk 63 GiB** (68 at
  open). Load ~4.
- `scripts/snapshot-machine.sh` at open and close: identical but for the uptimes, the free disk and the S5 spike's containers, images and
  volumes.

### Sitting 7 — 2026-10-01: Task 10 — D19's registration package: UBC's structure, the environment's own certificate, every attribute justified by where the app reads it

**Run by session `manifest-8e`, INLINE** (`superpowers:executing-plans`: one context, TDD per step, one fresh whole-branch review beside
the Docker tier, one fix wave) on `main`, from `0bb544c`. **Rich's word, in this session's chat**: *"proceed with the next sitting which I
believe is sitting 7"*, with the faculty front-end's new session started beside it — *"Do you think they will be able to work in
parallel with you?"*. They did: the front-end (`manifest-app-34`) was writing F6 against the MOCK, so 7100 was this sitting's for its whole
length, and it was told before and after each of the two contract commits. §7e's two questions answered themselves: the database was
EMPTY at open (0 projects, 0 users, 46 migrations — nothing to dump), and `make refresh-vulndb` is not due until after 2026-10-06.

Peers:
- **The faculty front-end, `manifest-app-34`** (F6, mock-only): *"OK, go ahead"* before both commits; it adopts `6cbb489` and `dec71d8`
  in its own repository (`package` on every `IamRegistration`; `draftGeneratedAt`; four new codes for F5b). It relayed **FE-45**, a
  decision of Rich's from its F6 design (ORIENTATION §8 *Open*).
- **The S5 spike, `manifest-s5-b3`**: finished at 03:17, nothing running; told before the Docker tier (which removes the capable model).

**What it made true** (`6cbb489`, the fix wave's `dec71d8`, and `06b5333`):
- **`draftIamRegistration`** — `POST /v1/projects/{projectId}/launch-records/iam-registration/{environment}/draft`, capability
  **`launch:draft`** (owner, collaborator, administrator; **MINTABLE** — an agent may prepare a draft for its person). Manifest generates
  and STORES on the record (`generated_package`) what a person sends UBC IAM, and `IamRegistration.package` answers it
  (`RegistrationPackage`):
  - the environment's entity id, ACS and SLO — derived as a deploy registers them (`deriveSpEntity`, the environment row's hostname);
  - **the certificate the environment signs with** — its PUBLIC half only, through the registrar that holds the master key
    (`SsoCertificates.spCertificate` → `ensureSpCertificate`; the `SpCertificate` type has no field a private key could travel in);
  - **every attribute with its purpose and the lines that read it** — `findAttributeUses` (a property read, `.name` or `['name']`), over
    the commit's `.js/.mjs/.ts/.html`, the blueprint's own `auth/` bridge skipped, at most 200 files and 2 MiB, `usedAtTruncated` whenever
    a file was not read; a read only under `public/` is *"shown to the person in the browser"*; an attribute nothing reads is `unused`,
    with a warning to remove it before sending;
  - the contacts — the project's owners then collaborators as technical, the platform's as support (**`MANIFEST_LAUNCH_CONTACTS`**,
    `Name <email>`; unset, the oldest administrator);
  - **the PIA number** (`privacyAssessmentReference`) once the assessment is approved with it — else null, and a warning;
  - the SAML metadata in **`saml-metadata-generator`'s structure, never its code** (`sso/registration-xml.ts`, `[M6]`): SAML 2.0 alone,
    one HTTP-POST ACS at index 1 (default), one HTTP-Redirect SLO, the tool's algorithm lists, both key descriptors, the organisation, one
    `ContactPerson` per contact — every value escaped, the `ID` the entity's hash. Its element order is held against the tool's own output
    (`src/sso/fixtures/ubc-structure.xml`, Task 1's probe) with `[M6]`'s changes applied in the test.
- **Production's is drawn from the launch candidate** (the release serving staging — its frozen auth, its build's commit), else from the
  newest valid manifest with a warning; **staging's from the newest valid manifest**.
- **A record UBC holds is not drafted again** (`409 LAUNCH_RECORD_SUBMITTED`, `submitted` or `active`) — again from `change_requested`
  or `expired`, where **a registered row keeps what UBC registered** (entity, ACS, SLO) and only the package changes. **`409
  LAUNCH_NOT_CWL`** for an app that signs nobody in with CWL — or asks for no attribute, which no registration may. Written under the
  record's `FOR UPDATE`, as a submission takes it; `iam_registration.drafted` (migration `0046_pink_proteus`, the CHECK only) names the
  environment, the entity, the commit and the counts — never the attributes.
- **What is SENT is the draft the person read, carrying what UBC asks for** (the fix wave): a registration whose package does not carry
  the approved assessment's PIA number is **`409 LAUNCH_DRAFT_STALE`** — draft it again; a submission names the draft it sent
  (`SubmitLaunchRecordRequest.draftGeneratedAt`, optional) and one drafted since is **`409 LAUNCH_DRAFT_CHANGED`**; the earliest day it can
  have been sent is the package's `generatedAt`, not the row's first day (Task 9's review M4).
- **One mint per environment, ever**: `ensureSpKeypair` reads, mints and writes in one transaction under an advisory lock on the scope —
  a draft is a second caller beside a deploy.
- **Review Focus 1's checklist half**: the first launch's `iam-registration` item says when a draft — or a request already sent — no
  longer matches the release serving staging, in both directions and for the ACS and SLO (*"The draft no longer matches the release
  serving staging: it asks for sn, which the draft does not. Draft it again before you send it."*).
- The authz matrix's row; `launch:draft` in the console's capability list; `draftIamRegistration` parked for Task 13 and outside the
  journey; the mock's two registration fixtures `package: null` (Task 13's `[S7]`); examples CAPTURED from the tests
  (`api/routes/launch-examples.ts`). **Contract still `1.5.0`.**

**What sitting 7 found** (the count is derived by the command at the head of this section):

**F1 The plan's Step 3 contradicts its own measurement.** It renders the ACS *"at index 0"* with *"`NameIDFormat` transient"*; `[M6]` —
the tool's own output, which Task 1 recorded — has the ACS at index 1 and no `NameIDFormat`. `[M6]` is the measurement that corrected the
plan, so it wins.

**F2 The plan's interface would have handed `launch/` the private key.** *Files* exports `ensureSpKeypair` to `launch/`, whose answer
carries `privateKeyPem`, and `ServerDeps` holds no key material on purpose. The certificate comes through the registrar, which already
binds the master key, as its public half — a type with no private-key field.

**F3 The unit tier could not hold *"a package's certificate is the one the environment registers with"*.** `cwlFakes`' registrar
registered ONE shared test keypair for every project and environment, so the plan's test would have been impossible, or green for the
wrong reason. The fake now keeps its keypair with the real `ensureSpKeypair` under `testDeps()`'s master key (found through a `WeakMap`
on its `appSecrets`); control (g) — the fake back on the shared keypair — turns the test red.

**F4 The plan's package predates the PIA number** (`[S9]`, Spec action 4's bullet): `privacyAssessmentReference` added to the package,
null with a warning until the assessment is approved with it.

**F5 A CWL manifest may list no attributes, and `deriveSpEntity` then throws an unmapped `SpEntityError`** — a `500`. The draft refuses it
first, `LAUNCH_NOT_CWL`, with its own message. (A DEPLOY of such an app is the same `500` today — pre-existing, not this task's.)

**F6 The plan's control (d) predicted green a test its own fixture turns red.** *"…never inside a longer word stays green, because `\b`
alone already stops `mailbox`"* — but the same test's bridge line, `mail: …`, matches a bare `\bmail\b`. Both usage tests go red, and so
does the route's (the skeleton's `ai/*.js` take `ubcEduCwlPuid` as a parameter).

**F7 Every existing launch example lacked `package` — and two of them, the submission's and the records', would have been examples of a
state the platform cannot produce** had they been given `null`. Recaptured from the tests, as one flow. One `package: null` my own regex put
into the PRIVACY ASSESSMENT's example was caught by `tsc` (the assessment has no package).

**F8 The docs gate's internal-name pattern read a certificate fingerprint's hex pair `F0` as a finding number** (three hits in the
captured examples). Exempt by PATH (`certificate.pem`, `certificate.fingerprint`, `metadataXml`), never by content; control (p).

**F9 The mock's two registration fixtures were submitted by their owner and carry no package** — a state the platform cannot produce.
`null` until Task 13 scripts real drafts (its `[S7]`).

**F10 `withDraft`'s placeholder package could not test the checklist half** (`[S6]` said Task 10 owns its shape). It now writes the real
package (`assemblePackage`, a certificate minted once per process), and is an UPSERT whose package carries the approved assessment's
number — a person drafting again.

**F11 Step 3 would have overwritten what UBC registered.** *"entity_id, acs_url and slo_url from the package"* applied to a re-draft of a
REGISTERED row (from `change_requested` or `expired`) puts the app's new ACS where the checklist and the build read UBC's. Only the package
changes on a registered row; control (j).

**F12 Task 9's M4, fixed for the registration**: a submission's earliest day is the package's `generatedAt`; control (f). **The assessment's
is still the row's first day** — Task 11's (its `[S7]`).

**F13 A test defect of mine at RED**: the mint route's body lacked `expiresInDays`.

**F14 The whole-branch review's I1: the draft was a new, UNLOCKED caller of `ensureSpKeypair`.** Until now its only caller ran inside a
deploy, under the environment's lock. Two first mints of one environment at once — a draft beside the first deploy, two drafts, a draft
beside a rehearsal — each read nothing, each mint, each write: a package naming a certificate the app never signs with, or a key from
one mint stored beside the other's certificate, every later signature failing (*"Invalid certificate signature"*). My ruling had called
the cost *"a wasted mint"*; the lost race's mint is WRITTEN. Fixed in `ensureSpKeypair` itself — one transaction under
`pg_advisory_xact_lock` on the scope. **Held by a test on separate connections** (a rolled-back transaction's one connection would take the
lock twice and serialise nothing): RED before, two fingerprints; control (k).

**F15 The review's I2: a registration package without the PIA number could be SENT.** The spec says the request *"is sent only once the
privacy assessment is approved, and its package carries the assessment's reference"*; the plan's own flow drafts in week one, before
that, and the submission checked only the assessment's CURRENT state — so the published example showed a `submitted` record whose package
told its reader to draft again. **`409 LAUNCH_DRAFT_STALE`**; control (l) turns three tests red, among them Task 9's own order test, which
now drafts again.

**F16 The review's I3: a submission was not tied to the draft the person read.** `launch:draft` is mintable and a collaborator holds it,
so a re-draft between reading and *"I've sent it"* froze a package nobody saw — Review Focus 2's *"the package sent is the package kept"*,
false. **`draftGeneratedAt` and `409 LAUNCH_DRAFT_CHANGED`**, on both submissions; control (m). A contract change made now rather than at
Task 13, because the code is here and the front-end then only sends the field.

**F17 Three `records.test.ts` cases read rows across the WHOLE database** from inside a rolled-back transaction — two row counts and
four event reads — so committed rows left by the last `api/launch.test.ts` case (`withProjectServer` resets at a test's START) turned them
red when the files ran in that order. Green alone; a pre-existing order dependency the file selection exposed. Scoped to the test's project.

**F18 The journey's guides gate read `draftGeneratedAt` as an unknown OPERATION**: it decides an operation by its shape — camelCase led
by a verb an operation begins with — and `draft` became one with this task. It now knows every property name the document declares;
controls (n) and (o) — the second a guide naming `draftImaginaryRegistration`, which it still catches.

**F19 My own deep import, caught only by the full suite.** The registration Docker case imported `../launch/package.js`; the
module-boundary gate refuses a path past a module's `index`. Every file selection this sitting ran had left `module-boundaries.test.ts`
out, so the first full run (3070/3071) was the first to see it — the second run was stopped, the import fixed (`06b5333`), and both runs
started again on the final tree. **Run the whole suite before believing a selection.**

**The negative controls** (each predicted in the ledger before it ran, applied with its diff read, restored by `git checkout` of a
committed file):
- On `6cbb489`: **(a)** staging's draft rendering production's entity → RED 1 (*drafts the staging package*); **(b)** drafting allowed in
  `submitted`/`active` → RED 2 (*never regenerated*; the re-draft lock test); **(c)** the private key in the public half → RED 3 (the
  keypair's public half; the package's *never its private key*; *no answer carries a private key*); **(d)** the search reduced to
  `\bname\b` → RED 3 (F6); **(e)** the bridge not skipped → RED 1; **(f)** the day from the row again → RED 1; **(g)** the fake on the
  shared keypair → RED 1; **(h)** the drift sentence never said → RED 3 (the fourth, nothing to compare, green by design); **(i)** the
  draft's write without `FOR UPDATE` → RED 1 (it never waits); **(j)** a re-draft overwriting what UBC registered → RED 1.
- On `dec71d8`: **(k)** no keypair lock → RED 1; **(l)** no STALE → RED 3; **(m)** no CHANGED → RED 1; **(n)** the guides gate without the
  document's fields → RED 1; **(o)** a guide naming an operation the API lacks → RED 1; **(p)** the docs gate without its exemption → RED 1.

**Rulings** (each in the ledger with its cost): `[M6]` over Step 3; the public half through the registrar; `cwlFakes` on the real keypair
store; `privacyAssessmentReference`; `ContactPerson` with `EmailAddress` only, as the tool writes it; no-attribute CWL as `LAUNCH_NOT_CWL`;
no valid manifest at all a plain `500` (unreachable through the API); a registered row keeps UBC's values; the draft precomputes outside the
transaction and re-checks under the lock; the PIA number only once approved; the drift sentence in both directions; the docs gate's path
exemption; the examples recaptured; the lock inside `ensureSpKeypair`, not around the draft; two new codes rather than overloading
`LAUNCH_DRAFT_REQUIRED`; I3 fixed now rather than routed to Task 13; the guides gate learning the document's fields.

**Deviation**: Step 4's Docker case drives the REAL registrar — `spCertificate`, then `registerServiceProvider`, then the IdP's row — not
`draftIamRegistration` and a whole deploy; the seam between the draft's scope and a deploy's is the unit tier's real-`deployRelease` case
(*"a package's certificate is the one the environment registers with"*).

**Carried — named so it is not lost:**
- **To Task 11** (its `[S7]`): the assessment's draft mirrors the registration's — stored, `generatedAt`, the same lock; its submission's day
  still reads the row's first day; `withAssessmentDraft` is still a placeholder; reuse `LAUNCH_RECORD_SUBMITTED` (its words name only a
  registration); `PrivacyAssessment.draft` breaks the mock's typed fixture.
- **To Task 13** (its `[S7]`): the mock's two `package: null` fixtures; the package on the records screen; `draftGeneratedAt` always sent.
- **To Task 14** (its `[S7]`), **and Task 15** (its `[S7]`): what *Launching* must say; the demo checks the package's fingerprint end to end.
- **Minors deferred** (the review's): `LAUNCH_NOT_CWL`'s message names the newest manifest when it is the CANDIDATE that is not CWL (M2);
  no support contact, silently, with no administrator and no setting (M3). And from the review's *declined to judge*: `.jsx/.tsx/.cjs`
  are not searched; a property of the same name on another object counts as a read (the stated hint); a staging package drifting from the
  newest manifest is surfaced nowhere; `usedAt` is unbounded by count; an `SpEntityError` from the draft is a `500`.

**Gates on the final tree** (`06b5333` code):
- `pnpm test` **3071 passed, 0 skipped, in 189 files (920 s, load ~4–5, 0 `deadlock detected`)**, then **3071 / 189 (881 s, 0 `deadlock
  detected`)** — twice, alone, identical. Up 47 from 3024 and three files (`sso/registration-xml.test.ts`, `launch/usage.test.ts`,
  `launch/package.test.ts`); `EXPECT_TESTS`/`EXPECT_FILES` moved. (The first full run on `dec71d8` was 3070/3071 — F19.)
- `pnpm test:docker` — the whole tier on `6cbb489`: **271 passed, 0 failed, 271 in 42 files**, 1217 s (load ~4–6). The fix wave's ten Docker
  files that reach the keypair or the registrar, alone on `dec71d8`: **46/46**, 413 s; and `sso/registration.docker.test.ts` alone on the
  boundary fix: **9/9**. **271 in 42**, ORIENTATION §2's row.
- `pnpm lint`, `typecheck` (all six packages) and `format:check` clean.
- `make verify` **64 / 0 / 0**, `make doctor` **21 / 0 / 0** (after the restart and the cleanup).
- The shared HTML pages checked — they describe the design (*"Manifest prepares the request"*), which this sitting made truer, not staler:
  unchanged. WALKTHROUGH and CLAUDE.md: unchanged (no plan started or finished). RUNBOOK gains `MANIFEST_LAUNCH_CONTACTS`; TRAPS gains
  F17's and F18's traps.

**The machine at the close**, queried at 09:46 on 2026-10-01, not remembered:
- **The control plane: PID 93832 on 7100, on `06b5333`, REAL GitHub** (Rich's `.env`), restarted LAST — after the two unit runs — by
  `.superpowers/sdd/2026-09-29-launch-path/cp-start.sh` (unchanged; `nohup`, detached). Boot line: `"source":"github"`,
  `"github":"api.github.com"`, `capableModel: registered`, `rehearsalsTakenDown: 0`. It was STOPPED from ~07:40 for the unit tier and the
  Docker tier (one control plane per database), so the capable model was out of LiteLLM from the tier's start (08:09) to the restart.
- **The control database: EMPTY** — 0 projects, 0 users, 0 registrations; **47 migrations** (`0046_pink_proteus` newest).
  `MANIFEST_ADMIN_PUIDS` is NOT set in `.env` (the line is absent) — `operator` needs `scripts/admin-grant.sh` after its first sign-in.
- **GitHub**: `Manifest-local-dev` holds **0 repositories** (`scripts/github-real-repos.sh`).
- **Containers: 0 `mf-`**, 10 `manifest-`; `dead-app-resources.sh --apply` (7 networks, 1 volume) and `app-images.sh --apply` (18 images),
  each re-measured to 0; `make verify`'s INFO `mf- containers=0 networks=0 volumes=0`; **12 Docker networks** in all.
  `litellm-orphans.sh` lists **18** orphaned — **not applied**, for sitting 5's reason (a budget's deletion resets its month).
- `make doctor` **21/0/0**, `make verify` **64/0/0**.
- **7102 and 7105 are the faculty front-end's** (node 64522 — its mock, restarted by it after `6cbb489` — and 26458). **Nothing on 7104.**
  **The front-end's F6 sitting 1 was given 7100 at this close** — it makes a project (`f6-watch`, a real private repository) and takes
  it to LAUNCHED, and a second to delete, at Rich's word: **expect its rows and that repository when you open.**
- Ollama **0.35.0**; **free disk 63 GiB** (67 at open). Load ~5–6. The Mac was on **UBC's VPN** at the close (`snapshot-machine.sh`'s
  host: `host167-126.vpn.ubc.ca`).
- Not Manifest's, left alone: `cwl-spike-*` (4 up, 1 exited) and `openwebui-openwebui-1`, made 2026-09-29.
- `scripts/snapshot-machine.sh` at open and close: identical but for the uptimes, the free disk, the edge (restarted by the Docker tier)
  and the host name.
