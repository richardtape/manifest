# P11 — The Administrator's Console (`packages/admin-ui`) — Implementation Plan

> **WRITTEN 2026-10-14, ~19:20–19:52 PDT (read from the clock), BY `manifest-p11-plan`** — the third coordinated run's job P11P (coordinator `manifest-coord5`),
> at Rich's ask of ~18:47 PDT to `manifest-coord4`: *"Do you think there's any possibility of having a separate agent, in parallel, work on
> the more stylized version of the console? Right now the console is suuuuper basic, but we're getting to the point where demos need to start
> showing what the operator experience is going to look like."* — and his answer through the question tool, **"Plan + review now, build after
> approval (Recommended)"** (`3011e11`, `docs/superpowers/2026-09-30-decisions.md`, the entry *"Rich's decisions — 2026-10-14, ~18:34 PDT"*
> and its appended words). **Every fact in *Read this first* was read from the code at manifest `977b1e7`** (contract `1.9.0`, 76
> operations) and B's drafted `1.10.0`.
>
> **REVISED 2026-10-14, ~20:11 PDT (read from the clock), TO ITS FRESH REVIEW** — [`2026-10-14-review-of-p11.md`](./2026-10-14-review-of-p11.md)
> (`14cffdc`, `manifest-p11-review`, job P11R; verdict **approve after the fixes**: 1 Critical, 8 Important, 12 Minor, two of them this
> writer's own, found after `b5fd9fe`). **Every finding is taken as written, none argued**; one is made more precise (I4: `approval.requested`'s
> `machineDetail.viaToken` is a boolean — the token's NAME is on that event's `actor.token`). *Revised to the review* (near the end) says
> where each went. **What changed most:** the demo fleet **validates every request body** against the operation's request schema, and the
> record-answer form sends what `recordIamRegistration` requires — `environment` from the queue item and the record's own facts — held by
> exact-body tests (C1); **every demo state is one the platform can reach** (I3: the approvals are `class` apps; no `large_course` or
> `public` app is launched at `1.9.0`); the worktree **builds the contract's `dist/` and reads the shared `.env` through a symlink** (I1);
> **`make doctor` asks 7101 and 7113 who they are** from the first sitting (I2); the approval pane opens the project's stream (I4);
> landings **skip the re-run when `main` moved by documents alone**, and RUNBOOK and WALKTHROUGH are written in the shared checkout after
> L3 (I5); **NINE SITTINGS** (I6); the mock's replay keeps §26's reason in its hash (I7); a granted change request is two writes (I8, A20).
> **APPROVED BY RICH, 2026-10-15, ~08:54 PDT** — *"Approve as revised (Recommended)"*, through `manifest-coord5`'s question tool, at
> `3d05fc8` with its fresh review (`14cffdc`, `8e77dd1`) — **with both decisions it flags as recommended**: (2) the mock's demo fleet keeps
> state, behind `MANIFEST_MOCK_FLEET=demo`, every request body validated and only states the platform can reach; (3) serving the console
> through the edge waits for P11b, with `make doctor`'s 7101/7113 ownership check built now. Recorded in `docs/superpowers/2026-09-30-decisions.md`,
> the entry *"Rich's decisions — 2026-10-15, ~08:54 PDT"* (`ab6c7b7a`). *Rejected:* "Approve, but serve via the edge now"; "Approve with the
> mock stateless"; "Not now". **Nine sittings, nine tabs (`manifest-p11-s1` … `-s9`), which Rich opens and `manifest-coord5` GOes.** **Its
> build runs as a parallel lane beside B**, in its own git worktree, taking 7100 windows from the coordinator only to land.
>
> **The design it builds** is [`../2026-09-27-admin-console-design.md`](../2026-09-27-admin-console-design.md), **refreshed the same evening
> against `1.9.0`** (its §0 says what moved; §10 gives every finding its status; §11 decisions 12 and 13 are revised and 21–25 added) — and
> its clickable mockup, [`../design/admin-console.html`](../design/admin-console.html) with [`../design/admin/`](../design/admin/),
> published at <https://claude.ai/artifact/N8qj84CVbvJ7f2L6xKfQ25>.

> **For agentic workers:** REQUIRED SUB-SKILL: **superpowers:executing-plans, inline** (Rich's standing yes (d), `bdfc6f2`: *"inline
> execution, one sitting per session"*). Steps use checkbox (`- [ ]`) syntax for tracking. **THIS PLAN IS BUILT IN A GIT WORKTREE AND
> FAST-FORWARD MERGED — NOT ON `main` IN THE SHARED CHECKOUT.** That is Rich's word for this plan (`3011e11`: *"built in a manifest
> worktree"*), and it is the one exception to ORIENTATION §6 rule 9; *How this plan is to be executed* says exactly how, and it is the
> faculty front-end's measured procedure (manifest-app ORIENTATION, *A background session in a sibling worktree*). **Never the worktree
> tools** (`EnterWorktree`/`ExitWorktree`): keep the session's directory in the shared checkout, edit by absolute path inside the worktree,
> and run git and the tests there by `cd`.

**Goal:** **An operator can run Manifest's administrator's job from a console designed for it** — the queue of everything waiting on an
administrator, oldest first, with the age of the oldest wait as its headline; a release signed off from a stored preview and its diff; a
launch record submitted to UBC or handed back, and UBC's answer recorded; the fleet with its instances and incidents; one project as an
operator sees it, its events naming who acted and why; health and risk; and the platform's settings, read-only — **in the look Rich chose
on 2026-09-27**, so a demo shows what the operator's experience is going to be. **Today the operator's only screens are the reference
console's two plain panels** (`packages/console/src/screens/queue-admin.tsx`, `fleet.tsx`), deliberately plain because that console is the
API's completeness proof (§22), not a product (§26's *Scope*).

It is proved by **`make demo-admin`** — the console against a **demo fleet in `manifest-mock`**, walked headless in Chrome: every screen's
shape asserted, three decisions made and seen to take — and **by Rich clicking it**.

**Architecture:**
- **`packages/admin-ui`**: React 19.3.0 and Vite 8.3.0, the **reference console's own toolchain and versions** (`packages/console/package.json`),
  served on **7101** — §21's inventory row *"Admin UI (Vite) | 7101 | Host process"*. **A client of the published contract and nothing
  else** (§26: *"The import boundary that binds `console/` binds `admin-ui/"*): `@manifest/contract`'s generated client in ONE file
  (`src/api.ts`), held by a boundary test and a lint rule copied from the console's.
- **Against `manifest-mock`**, which gains **a demo fleet behind its own option** (`MANIFEST_MOCK_FLEET=demo`): thirteen projects across
  every state the console draws **that the platform can reach** (I3), **and state for an administrator's decisions on them** (an approved
  release leaves the queue; a submitted registration moves to UBC's band) — held per mock server and lost on restart. **The fleet validates
  every request body it acts on** against the operation's request schema, so a console that sends the wrong body is refused here as on the
  platform (C1). `mock-app` and every default answer are unchanged (a test holds it) but one — the replay of a request that carried §26's
  reason, which today wrongly answers `409` (I7) — because the faculty front-end runs this mock from our working tree. **No contract
  change. No control-plane change.**
- **The look is the mockup's**: the components the mockup draws (`design/admin/components.js`, `window.ManifestAdmin`) and the six shared ones
  it composes (`design/system/components/bundle.js`) are **ported into TSX in `src/system/`, each held markup-identical to its reference by a
  parity test** that evaluates the reference in a `node:vm` context under React 19.3.0 — the faculty front-end's measured route
  (manifest-app `packages/ui/src/parity.test.tsx`). The stylesheets are imported from `docs/superpowers/design/` as they are.
- **Pure state modules, tested in Node** (`*-state.ts`, the console's pattern) — the queue's bands and headline, the allowed moves of a launch
  record, the approval pane's states, the fleet's filters — and **screens rendered in tests with `react-dom/server`**, no DOM library.
- **Its own Vitest project, `admin-ui`** (no global setup, so it never touches the database), named in `pnpm test`'s script. **`make
  doctor` recognises the console (7101) and its mock (7113) as Manifest's** by asking them, as it does the four ports before them (I2).
- **Served through the edge on the real platform by a later plan, P11b** (the refreshed design's §11 decision 25): a route on the console's
  origin under `/admin` is an `infra/` change with the Docker tier owed, and the team's email links move with it.

**Tech Stack:** TypeScript 5.9.3 on Node 24.12.0; React and react-dom 19.3.0; Vite 8.3.0 with `@vitejs/plugin-react` 6.1.1; Vitest 2.1.9;
`openapi-fetch` 0.17.0 under `@manifest/contract` 1.9.0 (1.10.0 once B's Task 5 lands); `ws` 8.21.3 and Ajv 8.20.0 in the mock (unchanged);
Google Chrome headless (the walk; raw CDP over Node 24's global `WebSocket`, no library); macOS 26.7.1. **No new dependency**: every
package `admin-ui` needs is already in the store at the version the console pins (Task 1's `[M4]` measures an offline install).

**Spec:** [`../specs/2026-08-29-manifest-platform-design.md`](../specs/2026-08-29-manifest-platform-design.md) — **§26** (*The admin console*,
l.2970-3077 at `977b1e7`: D31, the queue as the primary screen and its table, the team told by email, the other screens, *Non-repudiation*,
*Scope*), **§21**'s inventory (7101), **§22** (D22's boundary), **§13** (the approval bound to a digest; the checklist), **§9** (the launch
records and UBC's order), **§20** (step-up). **Design:** the refreshed [`2026-09-27-admin-console-design.md`](../2026-09-27-admin-console-design.md).

**Roadmap:** P11 (*Admin console*) — the roadmap's row says *"NOT PLANNED AND NOT BUILT"* until this plan's commit; **Rich placed it
(`3011e11`) as a parallel lane beside B — not ahead of the gentler test tiers, B, FE-32 or BYOA.**

**Predecessor:** none in its lane. It builds on manifest `977b1e7` (contract `1.9.0`, A1's `c196004`); **B (approved `0e9db93`, revised
`b25d7e3`, FE-62 in its Task 5, `517b8a9`) runs beside it** and takes the contract to `1.10.0` at its sitting 4.
**Successor:** P11b — the console served through the edge on the real platform (*What this plan does not build*).

---

## How this plan is to be executed — sittings, one per session, in a worktree

> **NINE SITTINGS, PROPOSED — NINE TABS, `manifest-p11-s1` … `manifest-p11-s9`, which Rich opens at his approval** (the third run's
> brief: *"P11's build tabs are asked of Rich when its plan is approved (one per sitting)"*). Eight before the review, which judged sitting 2
> too big for one session (I6) — the demo fleet's reads and its decisions are now a sitting each, and L1 closes the second. Inline, one fresh
> session per sitting. Task 1 is first; the mock's demo fleet lands before any screen needs it; the queue and its panes are the heart and come
> before the fleet; the acceptance is last, its clicked half alone because it waits for Rich at the machine (G9).

| Sitting | Tasks | What it delivers | Lands on `main`? (a 7100 window) | Where it stops | Status |
|---|---|---|---|---|---|
| 1 | 1, 2 | **The measurements and the worktree**: every fact re-read; an offline install and the contract's `dist/`; the references rendered under React 19.3.0 in a `node:vm`; a `.test.tsx` under a new Vitest project; what the platform's rules let the demo fleet hold. **The skeleton**: `packages/admin-ui` on 7101, its Vitest project in `pnpm test`, its lint block and boundary test, `src/api.ts`, the router and the shell, the administrator's gate, **`make doctor` asking 7101 and 7113** | No | After Task 2's commit on the branch | ✅ **DONE 2026-10-15** (`manifest-p11-s1`, 09:10–09:47 PDT): the baseline `7fd25e4` on `main`; the skeleton `c2cb418` on `p11-admin-ui`; *What executing this plan found*, *Sitting 1* |
| 2 | 3 | **The mock's demo fleet, read**: thirteen projects, each object spread from a validated fixture, their reads by id, the queue across them, their event streams; every state one the platform can reach | No | After Task 3's commit | ← **next** (a fresh session, `manifest-p11-s2`; it opens with `git -C /Users/rich/Developer/manifest-p11 rebase main`) |
| 3 | 4 | **The demo fleet's decisions, with state**, every request body validated; the replay's hash keeping §26's reason. **LANDING 1** at the close — the mock's first change in this lane (**G3**), the new package, `pnpm install` in the shared checkout | **Yes — L1** | After L1's merge and the shared checkout's install, both read back | |
| 4 | 5 | **The look**: the six shared and fourteen operations components ported to TSX in `src/system/`, each held markup-identical to its reference by the parity test; the stylesheets; the shell's rail in the system's own component | No | After Task 5's commit | |
| 5 | 6, 7 | **The queue** — the headline from our band, the two bands, the rows, the filter, the keyboard, the URL, the 60-second read (Task 6) — and **the release approval pane**: the request and its token from the project's stream, the preview on a click, the diff, approve and reject observed, the step-up round trip with the reason kept, stale and expired, decided by someone else (Task 7) | No | After Task 7's commit | |
| 6 | 8, 9 | **The team's step and UBC's answer** — submit, file, hand back, record, every body exactly what the operation requires, a granted change in its two writes (Task 8) — and **the fleet**: the table, its filters in the URL, the instance count, archived rows (Task 9). **LANDING 2** at the close | **Yes — L2** | After L2's merge, read back. **If it overflows, L2 moves to sitting 7's open** | |
| 7 | 10, 11 | **The project's page** — environments and their sets, incidents by cause, releases, the launch, people and agents, events live with the administrator's reason; reject an agent's question (Task 10) — and **Health and Settings** (Task 11) | No (L2, if it moved here) | After Task 11's commit | |
| 8 | 12 | **The acceptance's headless half**: `make demo-admin` (the walk) and its step in both acceptances, its negative controls, **the plan's one whole-branch review and its one fix wave**. **LANDING 3** at the close; then RUNBOOK and WALKTHROUGH in the shared checkout | **Yes — L3** | After L3's merge and the two documents, read back | |
| 9 | 13 | **Rich clicks it** (G9 — he is at the machine); his words recorded; the close-out: EXECUTED, the roadmap, ORIENTATION, CLAUDE.md's *State*; the worktree removed; the machine as found | Documents only (in the shared checkout) | After the close-out commit | |

**THE WORKTREE** (Task 1 creates it; every sitting works in it):

```bash
# Task 1, once — from the shared checkout, on a clean `git status` for the paths below:
git -C /Users/rich/Developer/manifest worktree add -b p11-admin-ui /Users/rich/Developer/manifest-p11 main
cd /Users/rich/Developer/manifest-p11 && pnpm install --offline --frozen-lockfile   # [M4]: from the store, no network
pnpm --filter @manifest/contract build      # dist/ is git-ignored, and @manifest/contract's runtime export is ./dist/index.js (I1)
```

- **The contract's `dist/` is rebuilt after any rebase that brings a `packages/contract` change** (B's sitting 4 takes it to `1.10.0`):
  `pnpm --filter @manifest/contract build`. `scripts/admin-ui.sh` and `scripts/demo-admin.sh` build it first, as `ci-acceptance.sh:451`
  does.
- **The worktree has no `.env`** (git-ignored, `.gitignore:22`) — so `packages/control-plane/vitest.env.ts:30-40` leaves the database URLs
  unset and the `unit` project cannot run there (I1). **Before a landing's whole-suite run** the worktree reads the shared one through a
  symlink, never a copy and never printed: `ln -s /Users/rich/Developer/manifest/.env /Users/rich/Developer/manifest-p11/.env`
  (git-ignored, so `git status` never shows it; Task 13 removes it with the worktree). *Rejected:* `set -a; . ../manifest/.env`, which
  exports every variable — the driver's and the gateway key's — into Vitest, as no run in the shared checkout does. **Tried once; if the
  classifier refuses it, the exact command and refusal go to the coordinator — never another way.**

- **A sibling of the checkout, never under `.claude/worktrees/`** (manifest-app's lesson: a relative `link:` must resolve; and the faculty
  front-end links `../manifest/packages/contract` — the SHARED checkout, which this worktree never changes until a landing).
- **Every sitting opens with `git -C /Users/rich/Developer/manifest-p11 rebase main`** (other sessions commit on `main` all the time — B's
  sittings 4 and 5 touch `packages/contract` and `packages/mock`); a conflict is resolved in the worktree, keeping both sides, and named in
  the sitting's record. **Two reds B will bring are expected, not surprises** (M9): when `1.10.0` lands, `incident.opened`'s `machineDetail`
  may gain a required `cause` (FE-62) — the fleet's incident events then fail the mock's validator until they carry it; and B's Task 6
  makes the checklist's `load-rehearsal` item `met` by a passed rehearsal — the fleet's large-audience app follows the contract on `main`.
- **Edit by absolute path inside `/Users/rich/Developer/manifest-p11/…`**; run git, tests and Prettier there by `cd`. A file in
  `/Users/rich/Developer/manifest/…` is never this plan's until a landing — except the plan's own record (this file, the roadmap,
  ORIENTATION), which a sitting edits **in the shared checkout** and commits there by pathspec, documents only, like any sitting's close.
- **A background session ends after ~60 minutes idle** (manifest-app's measurement): commit finished work on the branch before a long hold.

**THE GATES, BY SITTING.** The tree a sitting changes is `packages/admin-ui`, `packages/mock`, the root `vitest.workspace.ts`,
`package.json`'s `test` script, `eslint.config.js`, `pnpm-lock.yaml`, `scripts/` and the `Makefile` — **never `packages/control-plane`**
(Global Constraints). So:

- **A sitting that does not land** runs, in the worktree and under the coordinator's FREE (no Vitest under HOLD): `pnpm exec vitest run
  --project admin-ui --project packages` **twice** (neither project has a global setup: nothing is truncated and 7100 is untouched), `pnpm
  lint`, `pnpm typecheck`, `pnpm format:check`. The `unit` project is not run: it tests `packages/control-plane`, which no task changes, and
  its global setup truncates the database 7100 serves (`[M8]`).
- **A landing** (L1, L2, L3) asks the coordinator for **"7100 is yours"** and HOLD, then, in the worktree on the rebased branch, with the
  `.env` symlink in place: **`pnpm test` twice** (the whole suite, through `scripts/test-gently.sh`; it truncates 7100's tables, so 7100 is
  the coordinator's to restart — G4) and the other three gates; moves `scripts/ci-acceptance.sh`'s `EXPECT_TESTS`/`EXPECT_FILES` to what
  it measured, **in the branch's landing commit**; for L1 sends **G3's notice** (`packages/mock` changes) and waits for *"land it"*; then,
  **from the shared checkout**:

  ```bash
  cd /Users/rich/Developer/manifest
  TESTED=<the main sha the branch was rebased onto for the run>   # recorded when the run began
  git status --short                                  # account for every path; a peer's uncommitted file is left alone
  git diff --name-only main...p11-admin-ui            # compare with `git status --short`: an overlap is a peer's uncommitted edit (I5 (c))
  git merge --ff-only p11-admin-ui                    # refuses if main moved since the rebase — see THE RACE, below
  pnpm install --offline --frozen-lockfile            # the lockfile gained packages/admin-ui; without it `pnpm typecheck` fails here
  pnpm typecheck                                      # read back in the shared checkout
  git log --oneline -1                                # the sha reported to the coordinator
  ```

  and gives 7100 back. **An overlap between the branch's paths and the shared checkout's uncommitted ones** is a peer's edit: tell the
  coordinator and wait; never stash, revert or stage it (I5 (c)). **`pnpm test:docker` is never owed** (no file in its list changes —
  CLAUDE.md's list; Task 1's `[M7]` re-checks it).
- **THE RACE** (I5 (a); `main` took 15 commits between 18:16 and 20:00 on 2026-10-14, 13 of them documents only). When `--ff-only` refuses,
  rebase onto the new `main`, then **`git diff --name-only $TESTED..main`**: **if every path is under `docs/superpowers/` or `.superpowers/`
  — nothing a test, a build or the served API reads (`docs/api/` IS read: the control plane serves it and its tests check it, so it is NOT
  in the exception)** — merge without re-running and record the paths in the sitting's record; **otherwise re-run** `pnpm test` twice on
  the new tree. A landing never loops more than twice without telling the coordinator.
- **The shared documents** (RUNBOOK, WALKTHROUGH) **are never on the branch** (I5 (b)): they are written in the shared checkout after L3,
  committed by pathspec like any close — the branch carries code, scripts and `ci-acceptance.sh`'s `EXPECT_` lines (measured there) only.

**EVERY SITTING ENDS THE SAME WAY** — its gates, a dated *What executing this plan found*, this table, the roadmap's P11 row, ORIENTATION §7e
only if the coordinator gives that turn (§7e names the platform lane's job; P11 is a parallel lane), and the report to the coordinator: each
commit's sha and a line. **Two rules survive any re-cut:** Task 1 first; Task 13 alone and last, with Rich.

---

## Decided by Rich — build them, do not re-open them

- **"Plan + review now, build after approval (Recommended)"** (2026-10-14, ~18:47 PDT, through `manifest-coord4`'s question tool, `3011e11`):
  P11 joins the third run as a planning session and a fresh review, documents only; **he approves the plan**; its build sittings then run
  **as a parallel lane beside B, taking 7100 windows from the coordinator**; **built in a manifest worktree**. *Rejected:* "Plan and build
  straight through" (the coordinator approving under the delegation); "Not now".
- **His ask** (~18:47): *"the more stylized version of the console … demos need to start showing what the operator experience is going to
  look like."* So **the demo is the deliverable** (the memory *The demo is the deliverable*): the path an operator clicks, on data that tells
  the operator's story, beats breadth — and this plan names the breadth it trades (*What this plan does not build*).
- **The console's look and its first decisions are his, of 2026-09-27** (the design's §2, §7a, §11 decisions 1, 2, 16–20): **the rail, not a
  top bar** (*"I prefer the left hand side menu rather than the tabs at the top"*); **no time on the Queue item** (*"I don't like the time
  being part of the queue menu item"*); **`radius-sm` on filters**; **subtle stripes on long tables**; **a Settings screen**. And §26's
  *Scope*, changed at his word on 2026-09-27 (`577ad91`): the console gets real design effort.
- **The third run's standing yeses** (`bdfc6f2`): inline execution, one sitting per session. **The laptop IdP's test passwords** may be
  typed by an agent (2026-10-03) — not needed here: the walk signs in to the mock, which has no IdP.
- **Carried, still binding:** D22 and D31 (one public API; the console imports only the contract); every refusal asserts its code; the
  front-end is told before any commit to `packages/contract` or `packages/mock` lands (G3); a classifier refusal goes to the coordinator,
  never round.

---

## What Rich does, and when

1. **Approve this plan** after its fresh review (G8) — the coordinator puts it to him with the review's verdict, the revised plan, the sitting
   count and the tabs. **Two decisions it makes are worth his eye** (*Decisions this plan makes* 2 and 3): the mock keeping state for its demo
   fleet, and the console served through the edge by a later plan rather than this one.
2. **Open the nine tabs** (`manifest-p11-s1` … `-s9`) when he approves.
3. **Sitting 9, at the machine (G9): click it.** `make admin-ui` (or `bash scripts/admin-ui.sh`) — the mock's demo fleet and the console —
   then <http://127.0.0.1:7101>: read the queue's headline and both bands; open the oldest release approval, take the preview, read the
   diff, **approve it** (the mock's step-up round trip, if the sitting turns it on); submit a registration to UBC IAM with a reference and
   watch it move to UBC's band; record UBC's answer on another; hand back an assessment; filter the fleet to the apps in production; open a
   launched app's page — its instances, an incident by cause, an event an administrator signed with a reason; Health; Settings. Say what is
   wrong with it. **His words are the clicked half.** (He reads the two decisions flagged for him — 2 and 3 — with the review's
   recommendation: yes to both, on the conditions it names, which this revision builds.)

---

## Read this first — what this plan knows from the code

*Read at manifest `977b1e7` (2026-10-14, ~19:40 PDT), contract `1.9.0`. Line numbers are that commit's. Task 1 re-reads every one.*

**The API the console reads (1.9.0, 76 operations — `packages/contract/openapi.json`).**

1. **The queue is one read**: `listQueue`, `GET /v1/queue` — *"Everything waiting on a platform administrator, oldest first"*; administrators
   only (`403 FORBIDDEN`; a token `403 TOKEN_CREDENTIAL_REFUSED`). `Queue = { items: QueueItem[]; oldestSince: instant | null; truncated:
   boolean }`; `QueueItem = { kind; project: { id, slug, name }; subjectId; environment: 'staging' | 'production' | null; requestedBy: {
   id, displayName } | null; since; summary; note: string | null }`. The seven kinds and their order are `launch/queue.ts:19-27`
   (`QUEUE_KINDS`): `release-approval`, `iam-registration-to-submit`, `iam-change-to-file`, `privacy-assessment-to-submit`,
   `iam-registration`, `iam-change-request`, `privacy-assessment`; **at most 200 items** (`QUEUE_LIMIT`, `:31`). `subjectId` is the release
   (for `release-approval`) or the record. **`oldestSince` is the oldest of ALL items, UBC's waits included** (the design's A15).
2. **The fleet**: `listFleet`, `GET /v1/fleet`, administrators only. Each row: `id, slug, name, state ('active'|'archived'), archivedAt,
   blueprint, starter, owner { id, displayName, email }, audience, createdAt, slugReserved, environments[]` — each environment `{ kind,
   hostname, state, instances, releaseId, imageDigest, lastDeployAt, latestIncidentAt }`. **No `launchedAt`, no data level** (A7, A17).
3. **A release's sign-off**: `createApprovalPreview` (`POST /v1/releases/{releaseId}/approval-preview`, bodyless, idempotent) →
   `ApprovalPreview { id, releaseId, projectId, createdBy, createdByName, createdAt, expiresAt, imageDigest, diff: ApprovalDiff }`;
   `getApprovalPreview`; `approveRelease` (`{ reason?, previewId? }` — `previewId` REQUIRED by the operation, `400
   APPROVAL_PREVIEW_REQUIRED`; *"Session only, with a recent step-up"*: `403 STEP_UP_REQUIRED`); `rejectRelease` (`{ reason, previewId? }`);
   `409 APPROVAL_PREVIEW_STALE` and `409 APPROVAL_PREVIEW_EXPIRED`; `getApproval` — the newest decision, `404` when none. The console's own
   calls are `packages/console/src/api.ts:870-960`.
4. **The Manifest team's step**: `submitIamRegistration` (`POST …/launch-records/iam-registration/{environment}/submission`, body
   `RecordSubmissionRequest { sentAt?: date; reference: string }`; from `sent`: → `submitted`, or → `change_requested` with
   `changeRequestedFrom: active` for a change to a live registration; `400 LAUNCH_SENT_AT_INVALID`; anything not with the team `409
   LAUNCH_TRANSITION_INVALID`); `returnIamRegistration` (**bodyless** — *"Why it came back travels outside the record"*);
   `submitPrivacyAssessment` and `returnPrivacyAssessment` the same for the assessment. **UBC's answer**: `recordIamRegistration`,
   `recordPrivacyAssessment`, along the arrows `launch/transitions.ts:38-58` allows — a registration `draft → submitted`; `submitted → active |
   change_requested`; `active → change_requested | expired`; `change_requested → submitted | expired`; `expired → submitted`; **`sent → (none)`**
   (with the team: only its submission or hand-back takes it out); an assessment `draft → submitted`; `submitted → approved | draft`;
   `approved → draft`; `sent → (none)` — **which the published document states in words** on each request's `state`
   (`api/representations/launch.ts:564`, `:673`). **There is no arrow from `change_requested` to `active`** (`:47`): recording that UBC
   GRANTED a change the team filed is two writes, `submitted` then `active` — and the first re-stamps `submittedAt` (`records.ts:263-269`), so
   the queue item turns from `iam-change-request` into `iam-registration` with its `since` reset (`queue.ts:290`), while `registeredAt` is
   kept (`records.ts:249-253`) and the registration stays in force (`readiness.ts:552`) — the design's A20.
   **`RecordIamRegistrationRequest` REQUIRES `entityId`, `acsUrl`, `sloUrl`, `registeredAttributes` and `state`** (`openapi.json`);
   `environment` is *production's when absent* (`records.ts:170`); `registeredAttributes`, once registered, must be repeated unchanged by a
   write that does not reach `active`; `requestedAttributes` is required for `active → change_requested` (`records.ts:224-232`); and the
   platform **upserts** `entityId`, `acsUrl`, `sloUrl` and `registeredAttributes` from the body (`records.ts:291-294`, `:314-317`). **A
   submission's `submittedAt` is Vancouver noon of its day** (`records.ts:902`, `:959`), and the UBC item's `since` is that stamp
   (`queue.ts:290`) — before noon it is in the future. **UBC's order** (`records.ts:600-676`): either registration is sent only once the
   assessment is approved, and production's only once staging is registered.
5. **One project**: `getProject` (with `launchedAt`), `listEnvironments`, `listInstances` (per environment, at most 50, each `serving` or not),
   `getInstanceOutput`, `listIncidents` (per environment, newest first, each with **`cause`: `deploy` | `exit` | `exit_stopped`**),
   `listReleases`, `getRelease` (its `scan`, its `config.<environment>.classification` — **where a project's U1 level lives**),
   `getLaunchReadiness` (items with `id`, `blocking`, `state`, `since` — and **at `1.9.0` a `large_course` or `public` app carries a BLOCKING
   `load-rehearsal` item `not_built`, in both clauses**, `launch/readiness.ts:226-239` at `:168` and `:198`: **no large-audience app can launch
   until B's Task 6 makes it met by a measurement**; a release with fixable findings exists only on a stale scan, which leaves `scans` unmet,
   `readiness.ts:1015-1025`, `build/scan.ts:90`), `getLaunchRecords` (the assessment and both registrations, `sentAt`,
   `sentBy`, `submittedAt`, `submittedBy`, `certExpiresAt`), `listMembers`, `listTokens` (`mintedBy`: an id), `listPendingActions`,
   `listAgentSessions`, and `streamProjectEvents` (a WebSocket; replay, the `control` frame, then live).
6. **Who acted**: every `EventFrame` carries `actor: EventActor | null` — `{ name; asAdministrator; reason; token }`
   (`observability/bus.ts:63-69`; `eventFrame`, `:75-100`). `asAdministrator` is true exactly when *"a platform administrator acted with an
   owner's capability their place on the project does not give them"*, and `reason` is present exactly then. **Nothing but the stream says
   through which token a sign-off was asked**: `QueueItem` carries no token, no operation reads an `ApprovalRequest` (`requestApproval` is
   POST only; `getApproval` reads the decision), and `approval.requested`'s `machineDetail.viaToken` is a boolean — the token's NAME is that
   event's `actor.token` (I4; the design's A21).
7. **§26's reason**: the `Manifest-Admin-Reason` header, on 24 operations, `400 ADMIN_REASON_REQUIRED` — among them
   `rejectPendingAction`; **not** on `approveRelease`, `rejectRelease`, the team's or UBC's record operations (an administrator's own duties).
   `revokeToken` answers anyone but the minter `404` (A14).
8. **The blueprints**: `listBlueprints`. Nothing reads any other setting (A13).
9. **B's 1.10.0, drafted** (`plans/2026-10-03-load-rehearsal.md`, Task 5): `runLoadRehearsal`, `getLoadRehearsal`, `listLoadRehearsals`,
   `load_rehearsal.completed`, `LOAD_REHEARSAL_RUNNING`/`_BUSY`/`_NOT_NEEDED`; `incident.opened` gains `cause` (FE-62). Additive. B's sitting
   4 lands it; its Task 7 changes `packages/mock/src/launch.ts` and `scripted.test.ts`.

**The mock (`packages/mock`).**

10. `createMockServer(options: MockOptions = {})` (`server.ts:1253`) resolves every option from its argument or `MANIFEST_MOCK_*`
    (`:1254-1310`). **It is one project**, `mock-app`, scripted by options; **`HELD`** (`:230-253`) is a module constant listing the ids it
    answers, and `assertHeld` (`:256-266`) refuses any other `404 NOT_FOUND`, naming the mock. An operation is answered by `ANSWERS[operationId]`
    or the document's own example (`:1419-1421`). `listFleet` (`:517-526`) answers `fixtures.FLEET` (one row) to an administrator;
    `listQueue` (`:707`) answers `queueOf` (`launch.ts:976`) — `mock-app`'s stage, plus, under `MANIFEST_MOCK_QUEUE=full`, four items on
    projects the mock does not hold (`otherProjectsItems`, `launch.ts:908`). **It keeps no state but its idempotency record** (`seen`).
    **Its record routes answer the fixture whatever is sent** (`:656-660`), and **its replay keeps the wrong hash** for a request that
    carried §26's reason: the check hashes the body plus `\0<reason>` (`:1460-1463`), the store keeps the body alone (`:1559-1561`), so a
    retry with the same key and reason is `409 IDEMPOTENCY_KEY_REUSED`, never the replay (I7; pre-existing since the faculty-ready plan's
    Task 10).
11. **Sign-in has no IdP**: `/auth/login` sets `manifest_session=mock-session` and redirects to `returnTo`; `/auth/step-up` sets a ten-minute
    step-up cookie and redirects back (`:1363-1395`); `MANIFEST_MOCK_STEP_UP=1` makes the operations it scripts refuse `403 STEP_UP_REQUIRED`
    until then. **The stream** (`:1625-1690`): any `/v1/projects/<id>/events` upgrade plays `mock-app`'s replay and script, whatever the id;
    every frame is validated as `StreamFrame` before it is sent.
12. **Every answer is validated against the document on the way out** (`createValidator`; `server.ts:1539-1556`), so a fixture that drifts
    from the contract is a `500` naming the schema, not a plausible lie. **No REQUEST is validated** — a console that sends the wrong body
    passes against the mock (C1). The validator takes any component name (`validate(schema, value)`, `validate.ts`), request schemas
    included.
13. **The administrators**: `ADMIN_ME` is `ME` with `role: 'admin'` — Instructor One, `mock-app`'s owner (`fixtures.ts:65`); **`OPERATOR_ME`**
    (`:72-80`) is *Operator One*, `opr000001`, `role: 'admin'`, a member of nothing — **the demo fleet's administrator**. Its id,
    `12121212-1212-4212-8212-121212121212`, is ALSO `course-forum`'s project id in `otherProjectsItems` (the design's T4): the demo fleet's
    ids must collide with none.
14. **The faculty front-end runs this mock from our working tree and its tests read our fixtures live** (the memory *Faculty front-end is a
    sibling repo*; manifest-app ORIENTATION): **every default answer must stay byte-identical**, and a commit touching `packages/mock` lands
    only after G3's notice. It imports only `createMockServer` and `fixtures` (read-only `git grep` there, by the review), sets no
    `MANIFEST_MOCK_FLEET`, and **type-checks our mock's source** — its `@manifest/mock` types are `./src/index.ts`, under a `tsconfig` as strict
    as ours — so `fleet.ts` enters its typecheck through `index.ts` (M10).

**The reference console (`packages/console`) — what `admin-ui` copies, and what it must not import.**

15. `src/api.ts` is the one file that calls the API (`createApi(options: { origin; session?; adminReason? })`, `:1-120`); its `adminReason`
    middleware sends `Manifest-Admin-Reason` percent-encoded on every non-GET when set. `src/boundary.test.ts` (a comment-stripping scanner,
    copied three times in the repository on purpose) holds its imports to `@manifest/contract`, `react`, `react-dom`, `node:` and its own
    files; `eslint.config.js:100-115` is the lint half (`files: ['packages/console/src/**/*.ts', …tsx]`, a `no-restricted-imports` regex).
    `src/stream.ts`'s `useProjectStream` is the one socket per open project, guarded against React 19's StrictMode double effect.
    `vite.config.ts` points `/v1` and `/auth` at the mock under `MANIFEST_MOCK=1` (`MANIFEST_MOCK_PORT`, default 7102) and binds 7104.
    **`admin-ui` may import none of these** — it copies the patterns, as the console copied the journey's.
16. **The console's tests** are `.test.ts` and run in the `packages` Vitest project (`vitest.workspace.ts`); `api.test.ts` starts a
    `createMockServer` on port 0 per test (`withMock`) and calls `createApi({ origin, session: 'mock-session' })`.

**The workspace's gates.**

17. **`vitest.workspace.ts`** has three projects — `unit` (root `packages/control-plane`, a global setup that **truncates the database**),
    `docker`, and `packages` (root `.`, an explicit include list — *"A package not named here runs under NO project: its tests are silently
    not run, which reads exactly like a suite that passes"*) — with the gentler tiers' scaled timeouts (`testTimeouts(process.env)`).
    **`package.json`'s `test` script names the projects**: `bash scripts/test-gently.sh vitest run --project unit --project packages`. A new
    project not named there runs under no `pnpm test`.
18. **`eslint.config.js` ignores `docs/superpowers/design/**`** (`:14`; Rich, 2026-09-27: the mockups *"are not Manifest's code, so no
    gate holds them"*). **`.prettierignore` ignores `docs/`** — Prettier owns `packages/`. `tsconfig.base.json`: `strict`,
    `noUncheckedIndexedAccess`, **`exactOptionalPropertyTypes`**, `verbatimModuleSyntax`.
19. **The gate numbers are `scripts/ci-acceptance.sh`'s `EXPECT_` lines** (moved by the gentler tiers' sitting 1; read them there). Any task
    that adds a test moves `EXPECT_TESTS`/`EXPECT_FILES` — at a landing, in that landing's commit.
19a. **A worktree is not the shared checkout** (I1): `.env` is git-ignored (`.gitignore:22`) and `packages/control-plane/vitest.env.ts:30-40`
    reads `../../.env`, leaving the database URLs unset without it — `db/client.ts` then throws and the global setup skips its TRUNCATE
    (`vitest.global-setup.ts:74`), so the `unit` project is red there; and `packages/contract/dist/` is git-ignored (`.gitignore:9`) while
    `@manifest/contract`'s runtime export is `./dist/index.js` (RUNBOOK: *"the console BUNDLES dist/"*).
19b. **`make doctor` reads any port in 7100–7199 it cannot identify as "CLAIMED BY SOMETHING ELSE"** (`scripts/doctor.sh:210-231`,
    `check_block`), and recognises only the control plane, the reference console (`console_is_ours`, `:180-185`: `id="root"` and
    `<title>Manifest</title>` at 7104), the mock on `$PORT_MOCK` (`mock_is_ours`, `:196-199`: an undeclared path's 404 names `manifest-mock`)
    and the front end (7105). Its comments record this failure four times. While the console runs, 7101 and 7113 are foreign to it.

**The design and its references.**

20. **`design/system/components/bundle.js`** is a classic script, `(function (global) { … global.Manifest = { … } })(window)`, eighteen
    components, `React.createElement` only, no hooks. **`design/admin/components.js`** is the same idiom, reads `window.Manifest`, assigns
    `window.ManifestAdmin` — `MachineValue, ConsoleRail, SettingRow, WaitHeadline, QueueRow, FactList, Tags, RawChip, DiffView,
    ObservedAction, EventLine, DataTable, FilterBar, EnvCell` and the helpers `stateOf, shorten, icon, ICONS`. The mockup's screens
    (`design/admin/console.js`) compose six of the eighteen: `StateChip`, `Button`, `TwoFacts`, `InverseSurface`, `SegmentedControl`,
    `Choice`. The stylesheets: `design/system/tokens.css`, `design/system/components/bundle.css`, `design/admin/components.css` (five tokens
    of its own at the top).
21. **The faculty front-end's port** (manifest-app `packages/ui`, copied from manifest `3c38199`): `src/parity.test.tsx:1-20` evaluates the
    reference `bundle.js` with `runInNewContext(source, { window, React })` and compares `renderToStaticMarkup` of each port with the
    reference's, prop set by prop set. **Its `bundle.js` is byte-identical to ours; its stylesheets have diverged** (119 and 1,226 lines,
    measured 2026-10-14 — the design's T3).
22. **The fonts** (Instrument Sans, IBM Plex Mono) are named by the tokens with system fallbacks; the mockup loads them from Google Fonts,
    the faculty front-end does not load them at all. C1 (offline) rules out a CDN.

**The platform's links into a console.**

23. **The team's email links** (`mail/team.ts:53`, `:63`, `:87`): `${origin}/queue`, `${origin}/releases/<releaseId>/approval`,
    `${origin}/projects/<projectId>/records`, where `origin` is the platform's SP origin (the console's). `admin-ui` answers the same three
    paths, so P11b's change to the links is a base path and nothing else.
24. **`safeReturnTo`** (`identity/login-state.ts:24-28`) accepts any same-origin path of up to 512 characters — so `admin-ui`'s step-up and
    sign-in round trips may return to any of its own URLs, here and through the edge later.
25. **§21 reserves 7101 for "Admin UI (Vite)"**; nothing listens on it (`lsof`, 2026-10-14). 7102 is the faculty front-end's mock; **7113**
    is unassigned and unlisted (Task 1's `[M5]`), and is this plan's choice for the console's own mock.

---

## Decisions this plan makes, and why

1. **`packages/admin-ui` is a new workspace package, a client of the contract and nothing else** (D22, D31, §26). *Rejected:* building the
   operations screens into `packages/console` — §26's *Scope* keeps that console plain as the API's completeness proof; a second product in
   it would make its coverage gate meaningless and its quality bar ambiguous. *Rejected:* building in manifest-app — §5 places `admin-ui/` in
   this repository, and the faculty front-end never shows infrastructure (C3), which this console inverts. *Cost of changing course:* a
   package directory.

2. **THE MOCK GAINS A DEMO FLEET, AND STATE FOR AN ADMINISTRATOR'S DECISIONS ON IT, BEHIND `MANIFEST_MOCK_FLEET=demo`** — *for Rich's eye*.
   P5c's Decision 9 made the mock stateless, and it stays so for `mock-app` and every default answer. But the operator's experience IS
   deciding: an approval that does not take — the item still in the queue on the next read, the release still awaiting sign-off — is the one
   thing a demo of this console cannot be allowed to show. So **the demo fleet's state lives in the server instance** (a closure created by
   `createMockServer`, never a module global: two servers in one test process never share it), and is lost on restart, which is the reset.
   Every answer is still validated against the document on the way out. *Rejected:* stateless fixtures for the fleet (the approval does not
   take); local state in `admin-ui` hiding decided items (a console that hides what the API still answers would lie on the real platform the
   day a decision fails to record); a fixture layer inside `admin-ui` (bypasses the mock's validation — the design's decision 13, kept).
   *Cost:* one module in `packages/mock` and one hook in `server.ts`; the option scopes it. **ON TWO CONDITIONS, from the review (*For
   Rich* 1), both built here:** the fleet **validates every request body it acts on** against the operation's request schema (C1), so state
   does not make the mock a more convincing liar; and **every state it holds is one the platform can reach** (I3), checked by a test.

3. **SERVED THROUGH THE EDGE ON THE REAL PLATFORM BY A LATER PLAN, P11b** — *for Rich's eye*. This plan's console runs on 7101 against the
   mock, and its clicked half is on the demo fleet. *Why not now:* a route on `console.manifest.internal` under `/admin` is a Caddyfile change
   (`infra/`, so the Docker tier is owed — ~25 min, beside B's own), Vite's `base`, a `make doctor`/`make verify` check for 7101, and the
   team's email links (`mail/team.ts`) — a control-plane change in a plan that otherwise touches none. And a demo on 7100 needs projects in
   every state the console draws, which the platform's emptied tables do not have and the demo fleet does. *Cost of doing it later:* none
   lost — every URL `admin-ui` answers is a same-origin path, `safeReturnTo` accepts it, and its calls read `window.location.origin` (as the
   console's do). *Rejected:* doing it as this plan's last sitting — it would put an `infra/` change and a Docker tier in a lane meant to run
   beside B without taking B's windows. **What deferring costs** (the review's *For Rich* 2): the clicked half is on demo data; the real queue
   on 7100 stays the reference console's plain panel, whose headline counts UBC's waits (M12); the team's emailed links point at the reference
   console until P11b. **But `make doctor`'s ownership check is not deferred** (Decision 16).

4. **THE LOOK IS PORTED, NOT LOADED** (the design's decision 12, reversed): `src/system/*.tsx`, each held markup-identical to its reference by
   `src/system/parity.test.tsx`. *Rejected:* loading `bundle.js` and `components.js` as classic scripts with React on `window` — it makes two
   ungated files (lint ignores `docs/superpowers/design/**`) part of a shipped product, and a `window` global is an import the boundary test
   cannot see. *Rejected:* copying the faculty front-end's `packages/ui` — its stylesheets have diverged from the drawing Rich changed (T3).
   *Cost:* a component's markup changes in two places, and the parity test says so.

5. **THE STYLESHEETS ARE IMPORTED FROM `docs/superpowers/design/` BY CSS `@import`, NOT COPIED** — one look for the mockup and the console.
   `src/styles.css` `@import`s the three; the boundary test scans `.ts`/`.tsx` only, so a stylesheet outside `src` is not an import it judges.
   Vite serves files under the workspace root (`[M3]` measures it in dev and in `vite build`). *Rejected:* a copy, which drifts from the
   drawing the parity test holds the markup to. *Cost:* a path in one CSS file.

6. **NO WEB FONTS** — the tokens' families with their system fallbacks, as the faculty front-end ships (C1: the laptop works offline).
   *Rejected:* Google Fonts (a network dependency); a `@fontsource` package (a new dependency through Verdaccio, for a typeface). *Cost:* the
   console reads in the system sans on a machine without Instrument Sans — named in the RUNBOOK, and a font package is one line later.

7. **ONE VITEST PROJECT, `admin-ui`, NAMED IN `pnpm test`'s SCRIPT, WITH A TEST THAT SAYS SO.** Its root is `packages/admin-ui`, it has no
   global setup (DB-free, so a sitting that does not land never touches 7100), and it includes `src/**/*.test.{ts,tsx}`. *Rejected:* adding
   it to `packages`' include list — `packages` would then compile `.tsx` for one package's sake, and the build sittings could not run the
   console's tests alone. *The trap it closes:* `vitest.workspace.ts:51-53`'s *"A package not named here runs under NO project"* — the same
   is true of a project not named in `pnpm test`'s script, so `src/workspace.test.ts` reads the root `package.json` and fails when the
   script stops naming `admin-ui`.

8. **THE QUEUE IS ONE READ, AND A ROW IS ONE `QueueItem`** (the design's decision 21); **its headline is computed from the *waiting on us*
   band** (decision 22, A15); **it is read every 60 seconds and on focus** (decision 10, kept). *Rejected:* fanning out per row for the
   digest and scan; `oldestSince` for the headline.

9. **THE RECORD-ANSWER FORM OFFERS ONLY THE PLATFORM'S ALLOWED MOVES, RESTATED IN `src/transitions.ts` AND HELD TO THE DOCUMENT'S SENTENCE**
   (decision 23): `transitions.test.ts` parses the moves out of `recordIamRegistration`'s and `recordPrivacyAssessment`'s published `state`
   description and compares. *Rejected:* every state, leaving `409 LAUNCH_TRANSITION_INVALID` to refuse (still handled when it arrives).
   P6b's lesson (sitting 7, F3): a client that re-derives a platform rule must implement THE rule — and here a test says when it stops.
   **AND IT SENDS WHAT THE OPERATION REQUIRES** (C1): `environment` from the queue item, the record's own `entityId`, `acsUrl`, `sloUrl`,
   certificate and ticket, `registeredAttributes` (for `active` what UBC registered, pre-filled from the requested or package attributes and
   editable; for any other move the record's own, unchanged), and `requestedAttributes` where a change needs them — an exact body per move,
   held by tests and refused by the fleet's request validation if wrong. **A change UBC granted is ONE decision in TWO writes** (I8, A20):
   `submitted` on its own key, then `active` on another; a failed second write leaves the record shown at `submitted` with *"record UBC's
   answer"* offered again. *Rejected:* `active` straight from `change_requested` — the platform refuses it.

10. **NO OWNER'S ACTIONS** (decision 8, kept with its reason changed): the console's one action on a project's page is rejecting an agent's
    question; everything an owner does stays in the reference console, which carries §26's reason.

11. **AGENTS' QUESTIONS ARE NOT IN THE QUEUE** (`listQueue` omits them; §26 decides them by the minter) — they are on the project's page,
    reject only (decision 7, kept).

12. **SETTINGS IS READ-ONLY** (decision 24): the blueprints read; every other setting named, keyed and placed — *where it is set* — with its
    value an admission. `src/settings.ts`'s table is held by a test to the names the control plane reads (`packages/control-plane/src/config.ts`
    and `.env.example`), so a renamed variable turns it red rather than the screen wrong.

13. **URLs are paths, routed in-app** (no router dependency): `/queue`, `/queue/<kind>/<subjectId>`, `/releases/<releaseId>/approval` (opens
    that release's queue item, or its decision when it has left the queue), `/projects/<projectId>` and `/projects/<projectId>/records` (the
    email's three — fact 23), `/fleet` (its filters in the query string), `/health`, `/settings`. Vite's dev and preview servers answer any
    path with `index.html` (an SPA), measured in `[M3]`.

14. **THE CONSOLE'S MOCK RUNS ON 7113** (`MANIFEST_MOCK_PORT=7113`, with `MANIFEST_MOCK_ROLE=admin MANIFEST_MOCK_FLEET=demo`), so the faculty
    front-end's mock on 7102 is never touched; `scripts/admin-ui.sh` starts both processes and stops both. *Not a spec change*: §21 lists the
    platform's components, and a second mock is a development process like the console's own `MANIFEST_MOCK_PORT`.

15. **THREE LANDINGS, NOT NINE** (L1, L2, L3): each costs `pnpm test` twice (~18 min each through the wrapper) in a 7100 window. *Rejected:*
    landing every sitting (nine windows from a coordinator running B serially); landing once at the end (the mock's change meets B's
    sitting 5 in one large rebase, and the faculty front-end learns of the demo fleet last). **When `main` moved only by documents no test
    reads** (`docs/superpowers/`, `.superpowers/`), a landing rebases and merges without re-running (I5 (a); *THE RACE*).

16. **`make doctor` ASKS THE CONSOLE AND ITS MOCK WHO THEY ARE — NOW, NOT IN P11b** (I2): `admin_ui_is_ours` reads 7101's `index.html` for
    `id="root"` and `<title>Manifest operations</title>` (the reference console's is `<title>Manifest</title>`, so neither is mistaken for the
    other), and `mock_is_ours` is asked on 7113 as well as on `$PORT_MOCK`. *Rejected:* deferring it with the edge route — the ownership check is
    needed the first time the console runs, or every `make doctor` beside it (ci-acceptance's first gate in B's sittings, G4) reads red: the
    parallel lane failing the serial one. `EXPECT_DOCTOR` does not move (the same check). *Cost:* two functions in `doctor.sh`.

17. **THE WALK'S CHROME TAKES ITS DEBUGGING PORT FROM THE SYSTEM** (`--remote-debugging-port=0`, read back from the profile's
    `DevToolsActivePort`), never a fixed port in 7100–7199 — the ownership check above cannot vouch for a stranger's browser, and two walks
    never collide.

18. **THE APPROVAL PANE OPENS ITS PROJECT'S STREAM** (I4): `src/stream.ts` arrives in Task 7, not Task 10 — the one read of *through which token
    a sign-off was asked* is `approval.requested`'s `actor.token` on the replay (A21 filed), and the pane's recent events come from the same
    socket, opened on entering the pane and closed on leaving it.

---

## Global Constraints

- **The worktree**: `/Users/rich/Developer/manifest-p11`, branch `p11-admin-ui`. Nothing in the shared checkout is changed by a build task
  until a landing's `git merge --ff-only`; never `git add -A`, `.`, or `commit -a`; commit with a pathspec (`git commit -m … -- <paths>`).
- **No file under `packages/control-plane/`, `packages/contract/`, `infra/` or `docs/superpowers/specs/` changes.** No contract change (no
  G3 for the contract); a change to `packages/mock` lands only after G3's notice and *"land it"*.
- **`mock-app`'s answers and every default answer of the mock are unchanged** — the demo fleet answers only under `fleet: 'demo'`, and a test
  compares a fixed set of default answers before and after — **with one named exception**: the replay of a request that carried §26's reason
  (I7), which today answers `409` where the platform replays; G3's notice says so.
- **The demo fleet validates every request body it acts on** against the operation's request schema (C1), and **every state it holds is one
  the platform can reach** at the contract on `main` (I3).
- **`admin-ui` imports only `@manifest/contract`, `react`, `react-dom`, `node:` builtins and its own files** (D22, §26) — lint and the
  boundary test; `vite.config.ts` and the tests are outside the rule as in the console.
- **Every call is in `src/api.ts`.** A screen never holds the client.
- **Every mutation takes its `Idempotency-Key` from the user's action** (`api.newKey()` once per action, reused on a retry — D23.6).
- **Every refusal is rendered by one component** that shows the `code`, then the `message`, then the `hint`, then the request id (C3
  inverted), and **every test that expects a refusal names its code**.
- **The five states and their colours** (`20-states.md`) — the platform's enum beside the word in mono; **queue rows amber, red only for
  breakage** (decision 3); **motion only where a machine is moving** — every age still, ticking by the minute.
- **Times**: ages from instants; a day in words in **America/Vancouver** (`Intl.DateTimeFormat('en-CA', { dateStyle: 'long', timeZone:
  'America/Vancouver' })`, as the platform writes them).
- **1440 wide, keyboard-first** (`j`/`k`, `Enter`, `Esc`, `/`), every item and project a pasteable URL; **in-app navigation never reloads the
  page** (a delegated click listener in the shell — the ported rail and table render plain `<a href>`s, M5).
- **A non-administrator, or an ended session**, meets a sentence or a sign-in round trip back to the same URL — never a blank page or a screen
  of `403`s (*Pinned in Task 2 Step 1*).
- **Ports**: `admin-ui` on **7101** (`strictPort`); its mock on **7113**; the walk's Chrome on a port the system picks. Never 7102, 7104 or
  7105 (other processes'). `make doctor` recognises 7101 and 7113 (Decision 16). Never touch Laravel Valet.
- **No new dependency**; versions exactly the console's (`react`/`react-dom`/`@types/react`/`@types/react-dom` 19.3.0, `vite` 8.3.0,
  `@vitejs/plugin-react` 6.1.1).
- **Published words**: nothing the console shows cites a spec section, decision or plan (the API docs' rule) — *"Manifest can't read this
  yet"*, never *"A13"*.
- **Run `date` alone before writing any time** into a record or a message.

## Review Focus

The five ways this console is most likely to bite an operator, most likely first. Each has its test in the task named. *(Revised to the
review: C1's failure is now first; the non-administrator's case, fifth before, is a Global Constraint pinned in Task 2.)*

1. **A recorded answer is refused by the platform, or written to the wrong registration** — the form sends `{ state }` alone, or omits
   `environment`, or fills the attributes from the wrong source. The operator expects UBC's answer recorded on the registration they are
   looking at, exactly as UBC gave it, and nothing else changed. *Pinned in Task 4 Step 1* (the fleet refuses a body missing a required field,
   `400 REQUEST_INVALID`, one case per operation), *Task 8 Step 1* (the exact body per move, staging's item sending `environment: 'staging'`)
   *and Task 12's check 6* (the record read back: staging moved, production untouched, entity ID and attributes as sent).
2. **A decision made twice, or retried after a failure** — a double-click on *Approve*, a retry after the network dropped the answer, or a
   granted change whose second write failed. The operator expects one decision recorded and the pane to show it, not a second refusal or a
   second record. *Pinned in Task 7, Task 8 and Task 10's Step 1*: the same key on a retry; the button disabled while in flight; a replayed
   answer rendered as the decision; the two-write change resumed, not restarted; a retry carrying §26's reason replayed, not `409` (I7).
3. **The step-up round trip loses the operator's place** — *Approve* answered `403 STEP_UP_REQUIRED`, the browser sent to step up and back.
   The operator expects to land on the same item with the same preview and the reason they typed still there; and if the preview expired or
   went stale meanwhile, to be told so and offered a new one — never a silent re-take. *Pinned in Task 7 Step 1*.
4. **The queue moves under an open pane** — another administrator decides the item while it is open, and the 60-second read drops it. The
   operator expects the pane to stay on its subject and say what became of it, by whom — never to vanish or show the next item's facts. *Pinned
   in Task 6 Step 1 and Task 7 Step 1*.
5. **The headline lies** — UBC's three-week wait headlined as the team's staleness; an empty queue drawn as zeros; a truncated queue counted as
   whole; a submission stamped at Vancouver noon read as a wait in the future. The operator expects *"Oldest waiting on us"* from our band
   only, *"Nobody is waiting on us."* when empty, the 200 said, and a `since` ahead of now read as *"today"*. *Pinned in Task 2 and Task 6
   Step 1*.

---

## File Structure

```
packages/admin-ui/                        NEW — the administrator's console (§26)
├── package.json                          @manifest/admin-ui; dev/build/preview/typecheck; the console's versions
├── tsconfig.json                         the console's, plus src/**/*.tsx tests
├── vite.config.ts                        7101, strictPort; /v1 and /auth to the mock under MANIFEST_MOCK=1 (port MANIFEST_MOCK_PORT, 7113)
├── index.html
├── walk/walk.ts                          Task 12: the headless walk (raw CDP), run by scripts/demo-admin.sh
└── src/
    ├── main.tsx                          mounts <App/>
    ├── app.tsx                           the shell: the administrator's gate, the rail, the routes
    ├── api.ts                            THE ONE PLACE THE CONSOLE CALLS THE API
    ├── router.ts                         paths → screens; navigate(); useRoute()
    ├── stream.ts                         useProjectStream — one socket for the open project (Task 7)
    ├── time.ts                           ages and Vancouver days
    ├── refusal.tsx                       <Refusal> — code, message, hint, request id
    ├── queue-state.ts                    bands, headline, people, filter, words per kind
    ├── approval-state.ts                 the release pane's states
    ├── transitions.ts                    the launch records' allowed moves (held to the document)
    ├── fleet-state.ts                    rows, filters ⇄ query string, sort, environment cells
    ├── project-state.ts                  a project's sections from its reads
    ├── health-state.ts                   the four panels from the fleet and its fan-out
    ├── settings.ts                       every setting: name, key, where it is set
    ├── styles.css                        @imports design/system and design/admin's stylesheets; the console's own layout
    ├── system/                           the ported components (Task 5) + index.ts + parity.test.tsx
    ├── screens/                          not-admin, queue, approval-pane, record-pane, fleet, project, health, settings
    └── *.test.ts(x)                      beside what they test; boundary.test.ts; workspace.test.ts; api.test.ts
packages/mock/src/
├── fleet.ts                              NEW — the demo fleet: its data, its reads, its decisions, its events (Tasks 3–4)
├── fleet.test.ts                         NEW
├── server.test.ts                        MODIFY (Task 4) — the replay of a request that carried §26's reason
└── server.ts                             MODIFY — `fleet` option; HELD by option; one dispatch line; the stream's per-project branch;
                                                   the replay's stored hash (I7)
vitest.workspace.ts                       MODIFY — the `admin-ui` project
package.json                              MODIFY — `test` names `--project admin-ui`
eslint.config.js                          MODIFY — admin-ui's boundary block
scripts/admin-ui.sh                       NEW — the contract built, the mock on 7113 and the console on 7101, together
scripts/demo-admin.sh                     NEW — the acceptance's headless half
scripts/doctor.sh                         MODIFY (Task 2) — admin_ui_is_ours (7101); mock_is_ours asked on 7113 too (Decision 16)
Makefile                                  MODIFY — `admin-ui`, `demo-admin`
scripts/ci-acceptance.sh                  MODIFY at each landing — EXPECT_TESTS / EXPECT_FILES; Task 12 — a `make demo-admin` step
scripts/offline-acceptance.sh             MODIFY (Task 12) — a `make demo-admin` step
docs/superpowers/RUNBOOK.md               MODIFY (Task 12, IN THE SHARED CHECKOUT after L3) — *Running the administrator's console*
docs/superpowers/WALKTHROUGH.md           MODIFY (Task 12, IN THE SHARED CHECKOUT after L3) — one section
```

---

## Task 1: Measure what this plan rests on, and make the worktree

**Sitting 1. Documents and measurements; the worktree.** Writes `docs/superpowers/spikes/p11-baseline/README.md` (one section per
measurement, its raw answer) **in the shared checkout**, committed there by pathspec.

- [ ] **Step 1: `[M1]` The contract.** `jq -r .info.version packages/contract/openapi.json` and the operation count (`jq '[.paths[][] |
  objects | select(.operationId)] | length'`). Expected `1.9.0` / `76`; **`1.10.0` with B's three load-rehearsal operations if B's sitting 4
  has landed** — then record which, and Task 10's load-rehearsal row is built. Re-read *Read this first* 1–9 against the document; any
  difference is a finding and changes the task that reads it. **Read whether `incident.opened`'s `machineDetail` requires `cause` yet, and
  whether B's Task 6 has made the `load-rehearsal` item met by a measurement** (M9: the two reds B will bring).
- [ ] **Step 2: `[M2]` The mock.** Re-read facts 10–14 at the sitting's HEAD (`git log --oneline -5 -- packages/mock`): `HELD`'s shape,
  where `ANSWERS` is consulted, the upgrade handler, `OPERATOR_ME`. List every export of `packages/mock/src/index.ts` and **grep
  manifest-app for each** (`git -C /Users/rich/Developer/manifest-app grep -n "@manifest/mock\|fixtures\." -- ':!node_modules'`) — read-only,
  never an edit there: the demo fleet must change none of what it reads.
- [ ] **Step 3: `[M3]` The references and Vite.** In a scratch directory **outside both repositories** (the session's scratchpad), with the
  shared checkout's `node_modules` on `NODE_PATH`: evaluate `bundle.js` then `components.js` with `runInNewContext(src, { window, React })`
  under React 19.3.0, and `renderToStaticMarkup` **every export of `window.Manifest` and `window.ManifestAdmin`** with the props the
  mockup's `console.js` passes it — record which render and what each needs. Then a throwaway Vite 8.3.0 page (in the scratchpad) that
  `@import`s `docs/superpowers/design/system/tokens.css` by a relative path: `vite` serves it, `vite build` inlines it, and a deep path
  (`/queue/release-approval/x`) answers `index.html` in both `dev` and `preview`. Delete the scratch page after.
- [ ] **Step 4: `[M4]` The worktree, offline, and the contract's `dist/`.** `date`; `git -C /Users/rich/Developer/manifest worktree add -b
  p11-admin-ui /Users/rich/Developer/manifest-p11 main`; `cd /Users/rich/Developer/manifest-p11 && time pnpm install --offline
  --frozen-lockfile` (under FREE — it is CPU); then **`pnpm --filter @manifest/contract build`**, and show that it was needed: before it,
  `node -e "import('@manifest/contract')"` from `packages/console` fails to resolve `dist/index.js`; after it, it loads (I1). Record the times
  and that no network was asked. **If the install fails offline, stop and report** (the store lacks a package — a Rich-step: the network for
  one `pnpm install`).
- [ ] **Step 5: `[M5]` The ports.** `lsof -nP -iTCP:7101 -sTCP:LISTEN` and `-iTCP:7113` → nothing; `grep -rn "7113" infra scripts Makefile
  docs/superpowers/RUNBOOK.md docs/superpowers/specs` → nothing. If 7113 is taken or named, pick the next free unnamed port in 7113–7118 and
  change every mention in this plan in the sitting's record. Re-read `scripts/doctor.sh`'s `check_block` and its four `*_is_ours` (fact 19b)
  for Task 2's two additions.
- [ ] **Step 6: `[M6]` A `.test.tsx` under a new project.** In the worktree, with Task 2's `vitest.workspace.ts` entry in place (Task 2 Step
  3 — do it here first), a one-line `src/smoke.test.tsx` rendering `<p>ok</p>` through `renderToStaticMarkup`: `pnpm exec vitest run
  --project admin-ui` → 1 passed. Delete it in Task 2.
- [ ] **Step 7: `[M7]` What is owed.** Confirm no file this plan changes is in CLAUDE.md's Docker-tier list (`runtime/`, `routing/`,
  `services/`, `build/`, `releases/`, `identity/`, `sso/`, `secrets/`, `projects/`, `blueprints/`, `ai/`, `observability/`, `infra/`, a
  `*.docker.test.ts`) — so `pnpm test:docker` is never owed. The gate numbers: `grep -n EXPECT_ scripts/ci-acceptance.sh`.
- [ ] **Step 8: `[M8]` What a worktree's unit tier reads.** Read `packages/control-plane/vitest.env.ts:30-40` and `vitest.global-setup.ts:74`
  in the worktree. **Expected (fact 19a): with no `.env` the database URLs are UNSET — the `unit` project cannot run in the worktree at all**
  (`db/client.ts` throws at import). Then `ls -la /Users/rich/Developer/manifest-p11/.env` → absent, and **try the symlink once**: `ln -s
  /Users/rich/Developer/manifest/.env /Users/rich/Developer/manifest-p11/.env`; `git -C /Users/rich/Developer/manifest-p11 status --short` →
  nothing new (git-ignored). Never `cat` it. **With it, a whole-suite run in the worktree reads the same Postgres on 7103 that 7100 serves —
  so it needs the coordinator's window, exactly as one in the shared checkout does.** If the classifier refuses the symlink: the exact command
  and refusal to the coordinator; never another way. Run no test.
- [ ] **Step 8a: `[M9]` What the platform lets the demo fleet hold** (I3) — read `launch/readiness.ts` (the `load-rehearsal` clauses
  `:226-239`, `scans` `:1015-1025`, the in-force check `:552`), `launch/records.ts` (UBC's order `:600-676`, the stamps `:902`, `:959`,
  `:263-269`), `build/scan.ts:90` and `launch/queue.ts:290` at the sitting's HEAD, and write each rule Task 3's table must obey into the
  baseline: which audiences can launch at the contract `[M1]` read, what a fixable finding implies, UBC's order, what a submission stamps.
- [ ] **Step 9: Write the baseline and commit it** (shared checkout, by pathspec):
  ```bash
  cd /Users/rich/Developer/manifest
  git add docs/superpowers/spikes/p11-baseline/README.md
  git commit -m "docs(p11): Task 1's measurements — the contract, the mock, the references under React 19.3.0, the worktree offline with the contract built and the shared .env linked, the ports, the rules the demo fleet must obey" -- docs/superpowers/spikes/p11-baseline/README.md
  ```

---

## Task 2: The skeleton — the package, its project, its boundary, its client, its shell

**Sitting 1, after Task 1. In the worktree.**

**Files:**
- Create: `packages/admin-ui/package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/app.tsx`, `src/api.ts`,
  `src/router.ts`, `src/time.ts`, `src/refusal.tsx`, `src/screens/not-admin.tsx`, `src/styles.css` (layout only until Task 5)
- Create tests: `src/boundary.test.ts`, `src/workspace.test.ts`, `src/api.test.ts`, `src/router.test.ts`, `src/time.test.ts`, `src/app.test.tsx`
- Modify: `vitest.workspace.ts` (the `admin-ui` project), `package.json` (`test`), `eslint.config.js` (the block), `pnpm-lock.yaml` (by `pnpm
  install --offline`)
- Create: `scripts/admin-ui.sh`; Modify: `Makefile` (`admin-ui`), **`scripts/doctor.sh`** (Decision 16)

**Interfaces:**
- Produces: `createApi(options: ApiOptions): Api` (below); `type Route` and `parseRoute(path: string): Route`, `routePath(route: Route):
  string`, `navigate(route: Route): void`, `useRoute(): Route`; `ageWords(fromIso: string, now: Date): string` (*"3 days, 4 hours"*),
  `ageShort(fromIso: string, now: Date): string` (*"3d 4h"*), `dayInWords(iso: string): string` (Vancouver); `<Refusal error={unknown} />`;
  `linkTarget(event: MouseEvent): Route | null` — the shell's delegated click listener's decision (M5).

- [ ] **Step 1: The failing tests.**
  - `src/workspace.test.ts` — **the trap of fact 17**:
    ```ts
    import { readFile } from 'node:fs/promises'
    import { describe, expect, it } from 'vitest'

    describe('admin-ui’s tests run under pnpm test', () => {
      it('the root test script names the admin-ui project', async () => {
        const pkg = JSON.parse(
          await readFile(new URL('../../../package.json', import.meta.url), 'utf8'),
        ) as { scripts: { test: string } }
        expect(pkg.scripts.test).toMatch(/--project admin-ui(\s|$)/)
      })
    })
    ```
  - `src/boundary.test.ts` — copy `packages/console/src/boundary.test.ts` whole (its scanner, its containment check), change `SRC`'s package
    to `admin-ui`, the allowed specifiers to `@manifest/contract`, `react`, `react-dom`, `react-dom/client`, `node:` and relative files that
    resolve under `packages/admin-ui/src`, and **skip `.test.ts` AND `.test.tsx`**. Its doc comment says it is the fourth copy and why.
  - `src/api.test.ts` — against `createMockServer` on port 0 (`withMock`, copied from the console's `api.test.ts:7-19`):
    `getMe` answers `role: 'admin'` under `{ role: 'admin' }` and `'member'` without; `listQueue` and `listFleet` answer an administrator and
    refuse a member **`403 FORBIDDEN`** (assert `error.code`); a mutation without a key is impossible by type (no test — `tsc` is the gate).
  - `src/router.test.ts` — `parseRoute` of every path in *Decision 13*, a query string kept for `/fleet`, an unknown path → `{ screen:
    'queue' }`, and `routePath(parseRoute(p)) === p` for each; **`/` → `{ screen: 'queue' }` and the shell REPLACES the URL with `/queue`**
    (`canonicalPath('/') === '/queue'`, M6). **`linkTarget`** (M5): a plain left click on a same-origin `<a href="/fleet">` → its route (the
    shell then `preventDefault`s and `navigate`s, so an open pane and its typed reason survive); a click with a modifier key, a middle click,
    an `href` to another origin, `/auth/…` or `/v1/…` → `null` (the browser's own).
  - `src/time.test.ts` — `ageWords` at 59 s (*"under a minute"*), 3 h 20 min (*"3 hours, 20 minutes"*), 3 d 4 h 10 min (*"3 days, 4 hours"*
    — never more than two units), 23 d (*"23 days"*), **and a `since` AHEAD of now** (a submission stamped at Vancouver noon, read at 9 am)
    → *"today"*, never a negative age (I3 (c)); `dayInWords('2026-10-14T06:30:00Z')` → *"October 13, 2026"* (Vancouver, not UTC).
  - `src/app.test.tsx` — **the non-administrator** (a Global Constraint): `renderToStaticMarkup(<NotAdmin me={member} />)` contains *"This
    console is for platform administrators"* and the person's name and the sentence *"An administrator's role is granted on the host"*; and
    the gate function `gateOf(me | ApiError)` → `'admin'` for `role: 'admin'`, `'not-admin'` for `'member'`, `'sign-in'` for `401
    UNAUTHENTICATED`. And **`index.html`** read as text: `id="root"` and `<title>Manifest operations</title>` (what `make doctor` asks).
- [ ] **Step 2: Run, and predict** (`cd /Users/rich/Developer/manifest-p11 && pnpm exec vitest run --project admin-ui`): every file red —
  the package does not exist; `workspace.test.ts` red on the script.
- [ ] **Step 3: Implement.**
  - `packages/admin-ui/package.json`:
    ```json
    {
      "name": "@manifest/admin-ui",
      "version": "0.1.0",
      "description": "§26's administrator's console: the queue, the fleet, a project, health and settings, on the public API (D31).",
      "private": true,
      "type": "module",
      "scripts": {
        "dev": "vite",
        "build": "tsc --noEmit && vite build",
        "preview": "vite preview",
        "typecheck": "tsc --noEmit"
      },
      "dependencies": {
        "@manifest/contract": "workspace:*",
        "react": "19.3.0",
        "react-dom": "19.3.0"
      },
      "devDependencies": {
        "@manifest/mock": "workspace:*",
        "@types/react": "19.3.0",
        "@types/react-dom": "19.3.0",
        "@vitejs/plugin-react": "6.1.1",
        "vite": "8.3.0"
      }
    }
    ```
  - `tsconfig.json` — the console's (`extends ../../tsconfig.base.json`, `jsx: react-jsx`, DOM libs, `vite/client`, `Bundler`), `include:
    ["src", "walk", "vite.config.ts"]`.
  - `vite.config.ts` — the console's shape, cut to what this console needs: `plugins: [react()]`; `server: { host: '127.0.0.1', port: 7101,
    strictPort: true, proxy: MOCK === undefined ? undefined : { '/v1': { target: MOCK, ws: true }, '/auth': { target: MOCK } } }` with
    `MOCK = process.env.MANIFEST_MOCK === undefined ? undefined : `http://127.0.0.1:${process.env.MANIFEST_MOCK_PORT ?? '7113'}``; `preview:
    { host: '127.0.0.1', port: 7101, strictPort: true, proxy: (the same) }`. A doc comment: unset `MANIFEST_MOCK` is P11b's case and is not
    served yet.
  - `vitest.workspace.ts` — a fourth entry:
    ```ts
    {
      // P11: the administrator's console. No global setup — it never touches the database, so a build sitting runs it
      // without a 7100 window. Named in package.json's `test` script (src/workspace.test.ts holds that).
      test: {
        name: 'admin-ui',
        root: './packages/admin-ui',
        include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
        testTimeout: SCALED.testTimeout,
        hookTimeout: SCALED.hookTimeout,
      },
    },
    ```
    and `package.json`'s `test`: `bash scripts/test-gently.sh vitest run --project unit --project packages --project admin-ui`.
  - `eslint.config.js` — a block after the console's, `files: ['packages/admin-ui/src/**/*.ts', 'packages/admin-ui/src/**/*.tsx']`,
    `ignores: ['packages/admin-ui/src/**/*.test.ts', 'packages/admin-ui/src/**/*.test.tsx']`, the console's regex with `react-dom(/.*)?$`
    kept, its message naming the admin console and §26.
  - `src/api.ts` — the console's frame (its `ApiOptions`, `key()`, the `adminReason` middleware, `newKey: idempotencyKey`) with **only the
    operations *Read this first* 1–8 names**, each a thin `unwrap(await client.…, '<operationId>')` exactly as `packages/console/src/api.ts`
    writes it (`:723-750`, `:870-960`, `:1183-1195` are the patterns for a body, a bodyless POST and a path pair). Signatures:
    ```ts
    export interface ApiOptions { origin: string; session?: string; adminReason?: () => string | null }
    export type Api = ReturnType<typeof createApi>
    export function createApi(options: ApiOptions): {
      newKey: () => string
      getMe(): Promise<Schemas['Me']>
      listQueue(): Promise<Schemas['Queue']>
      listFleet(): Promise<Schemas['Fleet']>
      listBlueprints(): Promise<Schemas['BlueprintList']>
      getProject(projectId: string): Promise<Schemas['Project']>
      listEnvironments(projectId: string): Promise<Schemas['EnvironmentList']>
      listInstances(environmentId: string): Promise<Schemas['InstanceList']>
      listIncidents(environmentId: string): Promise<Schemas['IncidentList']>
      listReleases(projectId: string): Promise<Schemas['ReleaseList']>
      getRelease(releaseId: string): Promise<Schemas['Release']>
      getLaunchReadiness(projectId: string): Promise<Schemas['LaunchReadiness']>
      getLaunchRecords(projectId: string): Promise<Schemas['LaunchRecords']>
      listMembers(projectId: string): Promise<Schemas['MemberList']>
      listTokens(projectId: string): Promise<Schemas['TokenList']>
      listPendingActions(projectId: string): Promise<Schemas['PendingActionList']>
      listAgentSessions(projectId: string): Promise<Schemas['AgentSessionList']>
      getApproval(releaseId: string): Promise<Schemas['Approval'] | null>          // 404 NOT_FOUND → null, any other refusal thrown
      createApprovalPreview(releaseId: string, idempotency: string): Promise<Schemas['ApprovalPreview']>
      getApprovalPreview(releaseId: string, previewId: string): Promise<Schemas['ApprovalPreview']>
      approveRelease(releaseId: string, body: Schemas['ApproveReleaseRequest'], idempotency: string): Promise<Schemas['Approval']>
      rejectRelease(releaseId: string, body: Schemas['RejectReleaseRequest'], idempotency: string): Promise<Schemas['Approval']>
      submitIamRegistration(projectId: string, environment: 'staging' | 'production', body: Schemas['RecordSubmissionRequest'], idempotency: string): Promise<Schemas['IamRegistration']>
      returnIamRegistration(projectId: string, environment: 'staging' | 'production', idempotency: string): Promise<Schemas['IamRegistration']>
      submitPrivacyAssessment(projectId: string, body: Schemas['RecordSubmissionRequest'], idempotency: string): Promise<Schemas['PrivacyAssessment']>
      returnPrivacyAssessment(projectId: string, idempotency: string): Promise<Schemas['PrivacyAssessment']>
      recordIamRegistration(projectId: string, body: Schemas['RecordIamRegistrationRequest'], idempotency: string): Promise<Schemas['IamRegistration']>
      recordPrivacyAssessment(projectId: string, body: Schemas['RecordPrivacyAssessmentRequest'], idempotency: string): Promise<Schemas['PrivacyAssessment']>
      rejectPendingAction(pendingActionId: string, body: Schemas['RejectPendingActionRequest'], idempotency: string): Promise<Schemas['PendingAction']>
    }
    ```
    **Read every `Schemas[…]` name from `packages/contract/src/schema.d.ts` before writing it** — `EnvironmentList`, `ReleaseList` and
    `PendingActionList` are the document's names if `tsc` says so; `pnpm typecheck` is the only gate that sees a wrong one.
  - `src/router.ts` — `type Route = { screen: 'queue'; kind?: QueueKind; subjectId?: string } | { screen: 'release'; releaseId: string } |
    { screen: 'fleet'; query: string } | { screen: 'project'; projectId: string; section?: 'records' } | { screen: 'health' } | { screen:
    'settings' }`; `navigate` is `history.pushState` + a `popstate`-style event `useRoute` listens to; `canonicalPath` maps `/` to `/queue`,
    which the shell applies with `history.replaceState` on load (M6).
  - `src/app.tsx` — `getMe` first: `401 UNAUTHENTICATED` → `location.assign('/auth/login?returnTo=' + encodeURIComponent(location.pathname
    + location.search))`; `role !== 'admin'` → `<NotAdmin me={me} />` (*"This console is for platform administrators. You're signed in as
    {name}. An administrator's role is granted on the host — ask the Manifest team if you need it."*); otherwise the rail (plain markup until
    Task 5) and the route's screen (each a placeholder heading until its task). **One `click` listener on the shell's root** calls
    `linkTarget(event)` and, for a route, `preventDefault()` and `navigate(route)` (M5): the ported rail and table render plain `<a href>`s,
    and a port may not add a handler its reference lacks.
  - `index.html` — `<div id="root">` and **`<title>Manifest operations</title>`**.
  - `scripts/doctor.sh` — **Decision 16**, beside the four it already has, in their words and style:
    ```bash
    # THE FIFTH TIME (P11's Task 2, the review's I2). The administrator's console on 7101 and its own mock on 7113 read "CLAIMED BY
    # SOMETHING ELSE" whenever the console runs, because nothing could tell them from strangers. ASK IT, as for the four above: the
    # console's index.html carries `id="root"` and its own title (the reference console's is `<title>Manifest</title>`), and the mock
    # names itself in an undeclared path's 404.
    PORT_ADMIN_UI=7101
    PORT_ADMIN_MOCK=7113
    admin_ui_is_ours() {
      local body
      body=$(curl -sS -m 2 "http://127.0.0.1:$PORT_ADMIN_UI/" 2>/dev/null) || return 1
      case "$body" in *'id="root"'*) ;; *) return 1 ;; esac
      case "$body" in *'<title>Manifest operations</title>'*) return 0 ;; *) return 1 ;; esac
    }
    admin_mock_is_ours() {
      curl -sS -m 2 "http://127.0.0.1:$PORT_ADMIN_MOCK/v1/__doctor" 2>/dev/null | grep -q 'manifest-mock'
    }
    ```
    and in `check_block`: `if admin_ui_is_ours; then ours="$ours $PORT_ADMIN_UI "; fi` and `if admin_mock_is_ours; then ours="$ours
    $PORT_ADMIN_MOCK "; fi`. **`EXPECT_DOCTOR` does not move** — the same one check. **The two constants stay in `doctor.sh`**, though it
    reads the others from `infra/lib/common.sh` (`doctor.sh:10`): a change under `infra/` owes the Docker tier (CLAUDE.md's list), and these
    two ports are a development process's, not the platform's.
  - `src/refusal.tsx` — `code` (mono), `message`, `hint`, `requestId` from `ManifestApiError` (`@manifest/contract`'s `errors.ts`); an
    unknown error as its message.
  - `scripts/admin-ui.sh` — bash 3.2 (no `mapfile`, no `xargs -r`): refuse if 7101 or 7113 listens (`lsof`); **build the contract first**
    (`pnpm --filter @manifest/contract build`, as `ci-acceptance.sh:451` does — I1); start
    `MANIFEST_MOCK_PORT=7113 MANIFEST_MOCK_ROLE=admin MANIFEST_MOCK_FLEET=demo MANIFEST_MOCK_STEP_UP="${MANIFEST_MOCK_STEP_UP:-0}" pnpm
    --filter @manifest/mock start &` (the mock reads `=== '1'`; an assignment written by an expansion is not an assignment in bash, so the
    variable is always set, to `0` when the caller did not), wait for 7113, then `MANIFEST_MOCK=1 MANIFEST_MOCK_PORT=7113 pnpm --filter
    @manifest/admin-ui dev`; a `trap` stops both on exit. `Makefile`: `admin-ui:` runs it. (Until Task 3 the mock ignores
    `MANIFEST_MOCK_FLEET`.)
  - Then `pnpm install --offline` in the worktree (the lockfile gains the package).
- [ ] **Step 4: Run** — `pnpm exec vitest run --project admin-ui` green; `pnpm lint`, `pnpm typecheck`, `pnpm format:check` clean. **Negative
  controls**: (a) remove `--project admin-ui` from the script → `workspace.test.ts` red, naming the script; restore. (b) add `import
  '../../console/src/api'` to `src/app.tsx` → the boundary test AND lint red; restore. (c) `bash scripts/admin-ui.sh` with the mock's
  default port: the console answers `/queue` and `/v1/me` through its proxy (`curl -s http://127.0.0.1:7101/v1/me`), then Ctrl-C stops both
  (`lsof` reads nothing on either port). (d) **`make doctor` with the console up**: the ports line names 7101 and 7113 among Manifest's own;
  with a stranger on 7113 (`python3 -m http.server 7113 --bind 127.0.0.1`, stopped after) it reads `CLAIMED BY SOMETHING ELSE: 7113` —
  the check working; and with `admin_ui_is_ours` returning 1, 7101 reads foreign. Restore each.
- [ ] **Step 5: Commit on the branch.**
  ```bash
  cd /Users/rich/Developer/manifest-p11
  git add packages/admin-ui scripts/admin-ui.sh
  git commit -m "feat(admin-ui): the administrator's console's skeleton — its package on 7101, its Vitest project in pnpm test, its boundary, its client, its gate; make doctor asks 7101 and 7113 who they are" -- packages/admin-ui scripts/admin-ui.sh scripts/doctor.sh Makefile vitest.workspace.ts package.json eslint.config.js pnpm-lock.yaml
  ```

---

## Task 3: The mock's demo fleet — thirteen projects, read by id, every state reachable

**Sitting 2, alone (the review's I6). In the worktree. `packages/mock` — G3 at L1 (sitting 3).**

**Files:**
- Create: `packages/mock/src/fleet.ts`, `packages/mock/src/fleet.test.ts`
- Modify: `packages/mock/src/server.ts` — `MockOptions.fleet?: 'off' | 'demo'` (`MANIFEST_MOCK_FLEET=demo`); `HELD` becomes `heldFor(fleet:
  Fleet | undefined)` (the fixtures' ids, plus the fleet's when there is one); one dispatch line before `ANSWERS` (`:1419`); `getMe` answers
  `OPERATOR_ME` when the fleet is on and `role` is `admin`; `listFleet` and `listQueue` append the fleet's rows and items; the upgrade
  handler's `play` branches on a fleet project id
- Modify: `packages/mock/src/index.ts` — export `createFleet` and the fleet's ids for `admin-ui`'s tests

**Interfaces:**
- Produces:
  ```ts
  export interface Fleet {
    readonly t0: number                          // the server's creation; every fleet time is relative to it
    readonly ids: Record<'projectId' | 'environmentId' | 'instanceId' | 'releaseId' | 'previewId' | 'pendingActionId' | 'tokenId', string[]>
    fleetRows(): Schemas['Fleet']
    queueItems(): Schemas['QueueItem'][]
    /** An answer for a fleet id, or undefined when the request names none (the fixtures answer it). */
    answer(operationId: string, params: Record<string, string>, body: unknown, ctx: FleetContext): { status: number; schema: string; body: unknown } | undefined
    events(projectId: string): Schemas['EventFrame'][]
    onEvent(projectId: string, listener: (frame: Schemas['EventFrame']) => void): () => void
  }
  export interface FleetContext { now: number; steppedUp: boolean; stepUpRequired: boolean; actor: { id: string; displayName: string }; adminReason: string | null }
  export function createFleet(t0: number): Fleet
  export const FLEET_PROJECTS: readonly { slug: string; id: string }[]   // for tests
  ```
- Consumes: `fixtures` (`OPERATOR_ME`, the blueprints, `ApprovalDiff`'s security notes and review sentences verbatim), `MockRefusal`.

**THE DEMO FLEET.** Every id is `fleetId(kind, project, k)` = `` `f1ee7${kind.toString(16).padStart(3, '0')}-${String(project).padStart(4,
'0')}-4${String(k).padStart(3, '0')}-8000-000000000000` `` — a valid UUID that collides with no fixture (T4; a test asserts it). Times are
`t0 − age`, **except what the platform stamps itself**: a submission's `submittedAt` is **Vancouver noon of its day** (fact 4) — so a record
*"with UBC IAM since 4 days"* has `submittedAt = vancouverNoon(day of t0 − 4 d)`. People are invented and named once each; the
administrator is `OPERATOR_ME` (*Operator One*), a member of none.

**TWO RULES THE TABLE OBEYS** (the review's I3 and I6):
- **Every state is one the platform can reach at the contract `[M1]` read** — the rules `[M9]` wrote into the baseline. At `1.9.0`: **no
  `large_course` or `public` app is launched** (its blocking `load-rehearsal` item is `not_built`), so both sign-off stories are `class` apps
  and every launched app is `class` (two instances); **a release with fixable findings is never beside a met `scans` item**; **UBC's order
  holds** (a registration with the team or with UBC has an approved assessment beside it, and a production one a registered staging one).
  If `[M1]` reads B's Task 6 landed, row 13's `load-rehearsal` is `met` by a passed rehearsal and one large app may launch (three
  instances) — the sitting's record says which was built.
- **Every object is built by SPREADING ITS VALIDATED FIXTURE** — `{ ...f.RELEASE, id, projectId, createdAt, … }`, the registration package
  from the fixtures' package, the assessment's draft from theirs, each event from a fixture or replay frame of the same `type` — overriding
  only ids, names, times, states and the story's own fields. The fixtures are already validated against the document, so a spread object
  inherits its shape; the builder (`project(spec)`) keeps the thirteen consistent.

| # | slug · name | owner | audience · level | environments (state · instances) | the story it tells |
|---|---|---|---|---|---|
| 1 | `reading-responses` · Reading responses | Instructor One (`fixtures.USER_ID`) | `class` · synchronised · `high` | sandbox, staging healthy · 1; **production healthy · 2**, launched 9 d ago | **`release-approval`, re-escalated**: asked **3 d 4 h** ago **by an agent on Instructor One's token** (`approval.requested`, `actor.token`: *"the agent that builds this app"*), note *"The class starts on Monday — the egress change is the only new thing."*; its preview's diff changes `egress.allow` and `ai.models`, two security notes, summary `llm`; every other blocking item met (the self-serve check) |
| 2 | `chem-lab-booking` · Chem lab booking | Dr. Mateo Silva | `class` · steady · `medium` | sandbox, staging healthy · 1; production none | **`release-approval`, first launch**: asked **19 h** ago in his own session, no note; **every other blocking item met** — the assessment approved, both registrations `active`, the rehearsal passed, **its scan clean**; `summarySource: no-previous-release` |
| 3 | `phys-101-labs` · Physics 101 labs | Jordan Lee | `class` · steady · `medium` | sandbox, staging healthy | **`iam-registration-to-submit`** (production), sent **1 d 2 h** ago with its package (four attributes, one `unused`) — beside an approved assessment and a staging registration `active` (UBC's order) |
| 4 | `math-oh-queue` · Math office-hours queue | Dr. Priya Raman | `class` · synchronised · `medium` | production healthy · 2, launched 15 d ago | **`iam-change-to-file`**: a change asking for `sn`, sent **2 d 7 h** ago; **its production certificate expires in 11 days** (Health: red) |
| 5 | `rubric-helper` · Rubric helper | Dr. Hana Kobayashi | `class` · steady · `medium` | **staging failed · 1** (a deploy Incident, `cause: deploy`, 2 h 10 min ago); blueprint **`node-ts-mongo@0`** (superseded) | **`privacy-assessment-to-submit`**, sent **5 h** ago, every gap answered |
| 6 | `stats-sim` · Stats simulator | Leo Park | `class` · steady · `low` | staging healthy — **its serving release's scan `stale`** (Health's scans story; a stale database warns at build time and does not block staging, §12) | **`iam-registration`** (staging) with UBC IAM since **4 d** (Vancouver noon), ticket `IAM-2026-0511`, beside an approved assessment |
| 7 | `lang-202-journal` · Language 202 journal | Sam Whitfield | `class` · steady · `medium` | production healthy · 2, launched 30 d ago | **`iam-change-request`** with UBC IAM since **21 d**, asking for `sn` (`changeRequestedFrom: 'active'`, `registeredAt` kept — the A20 story: granting it is two writes) |
| 8 | `field-notes` · Field notes | Dr. Ayesha Karim | `solo` · steady · `high` | staging healthy | **`privacy-assessment`** with the Privacy Office since **23 d**, `PIA-2026-0118` — **the oldest item in the queue, and not ours** (Review Focus 5) |
| 9 | `cpsc-110-help` · CPSC 110 help | Dr. Gregor Novak | `class` · synchronised · `high` | production healthy · 2, one member **exited and replaced** 2 h ago (`instance.exited`, an Incident `cause: exit`) — three instances listed, two serving | Health: worth knowing |
| 10 | `econ-101-polls` · Econ 101 polls | Dr. Samir Haddad | `class` · steady · `low` | **production healthy · 1 of 2** — a member stopped and replacing gave up (`exit_stopped`) 40 min ago | Health: **attention** |
| 11 | `bio-201-scheduler` · Bio 201 scheduler | Dr. Lucia Moreno | `class` · steady · `very-high` | production healthy · 2; certificate expires in 60 days (amber) | **a pending agent question** (a member's agent asks to add a collaborator, waiting 3 h, lapses in 21 h); **an event an administrator signed**: `project.renamed` by Operator One, `actor.asAdministrator: true`, reason *"The course code changed this term — the department asked."* (`updateProject` takes §26's reason) |
| 12 | `hist-105-archive` · History 105 archive | Dr. Owen Price | `class` · steady · `medium` | none | **archived** 10 d ago (filtered out of the fleet by default) |
| 13 | `mus-100-listening` · Music 100 listening | Dr. Aiko Tanaka | `large_course` · steady · `low` | sandbox, staging healthy; production none | **The large-audience launch as the contract on `main` says it**: its checklist's blocking `load-rehearsal` item `not_built` at `1.9.0` (so it cannot launch), or `met` by a passed load rehearsal once B's Task 6 is on `main` — the project page's launch story, and the reason no large app is launched above |

Each project has: a `Fleet` row; `Project` (with `launchedAt`); its environments (with `instances[]` — the production sets of 2 or 3 —
and `instance` the newest serving); `InstanceList` per environment (a replaced member kept `failed`, `serving: false`); `IncidentList` per
environment; one or two releases (`Release` with `scan` — clean, but for `stats-sim`'s staging release, `stale` — and `config.<env>.
classification` = the level; `bio-201-scheduler`'s newest release, not yet serving, raises the level, so *serving* and *newest* differ, M2); `LaunchReadiness` (the items as the story needs, each `since`); `LaunchRecords` (registrations with
`certExpiresAt`, `sentAt`/`sentBy`, `submittedAt`/`submittedBy`, `externalTicketRef`, the `package` for a sent one; the assessment with its
`draft` and `gapAnswers` for a sent one); members (the owner, and a collaborator on three); tokens (one each on three, `mintedBy` a member);
pending actions (project 11's); agent sessions (none); and **events** — `project.created`, `repository.seeded`, a build and its deploy's
`instance.*`, the record sends with `actor`, and the story's own — every frame a valid `EventFrame`, newest last.

- [ ] **Step 1: The failing tests** (`fleet.test.ts`, against `createMockServer({ role: 'admin', fleet: 'demo' })` on port 0, with
  `createManifestClient` and the mock's session):
  - **Every answer validates** — the server validates on the way out, so a `200` IS the check; the test reads every fleet project through
    every read operation of *Read this first* 5 and asserts `200` and the project's own id in each body.
  - **The fleet**: `listFleet` → 14 rows (`mock-app` + 13), `reading-responses` production `instances: 2`, `econ-101-polls` `instances: 1`,
    `hist-105-archive` `state: 'archived'`, `mus-100-listening` with no production.
  - **Every state is reachable** (I3) — read through the API, never from the builder's input: for each `release-approval` item, every
    `blocking` item of its project's `getLaunchReadiness` is `met` except `admin-approval`; **no project whose audience is `large_course` or
    `public` has a production environment** (unless `[M1]` read B's Task 6 on `main`, and then only with a met `load-rehearsal`); **no
    serving release with `fixable` findings beside a met `scans` item**; **every registration that is `sent`, `submitted`, `active` or
    `change_requested` has an approved assessment beside it, and every production one a staging one registered**; every UBC item's `since`
    is a Vancouver noon.
  - **The queue**: `listQueue` → the eight items of the table, each `kind`, `project.slug` and `since` (`t0 − age`, to the second) as the
    table says, oldest first — **plus whatever `mock-app`'s default stage leaves** (`queueOf` over `f.LAUNCH_RECORDS`; `[M2]` records it —
    expected one item in UBC's band, with an absolute fixture date). **`reading-responses` is the oldest item in OUR band** — Task 3 makes
    its age older than anything `mock-app` puts there — **and `oldestSince` is an item of UBC's band** (`field-notes`' 23 days, or
    `mock-app`'s own if `[M2]` finds it older): the A15 trap the console must not fall into is IN the data.
  - **By id**: `getProject(fleet[3])` → `phys-101-labs`; `listInstances(<cpsc-110-help production>)` → 3 instances, 2 `serving`, 1
    `failed`; `listIncidents(<econ-101-polls production>)` → newest `cause: 'exit_stopped'`; `getLaunchRecords(<phys-101-labs>)` →
    `iamRegistration.state: 'sent'` with its `package`; `getRelease(<reading-responses candidate>).config.production.classification ===
    'high'`.
  - **The stream**: a `subscribe` to `bio-201-scheduler` replays its events, the last `project.renamed` with `actor.asAdministrator: true`
    and the reason, then `control`; to `reading-responses`, an `approval.requested` whose `actor.token.name` is *"the agent that builds this
    app"* (Task 7 reads it); to `mock-app` still plays the old script.
  - **The fleet on, `mock-app` untouched** (M1): with `fleet: 'demo'`, `getProject(f.PROJECT_ID)`, `listEnvironments(f.PROJECT_ID)` and
    `getLaunchRecords(f.PROJECT_ID)` still answer the fixtures (`toStrictEqual`) — the collision that matters is the fleet answering a
    fixture's id.
  - **Ids**: no id `fleetId(…)` makes equals any UUID-shaped value in `fixtures` (walk the module's exports) — T4. (A fleet project MAY
    name a fixture PERSON on purpose — `reading-responses`' owner is Instructor One, `fixtures.USER_ID`; people are not what T4 is about.)
  - **The defaults are untouched**: with `fleet` off, a fixed list of reads — `getMe`, `listFleet`, `listQueue`, `getProject(PROJECT_ID)`,
    `listEnvironments`, `getLaunchRecords`, `getLaunchReadiness`, `listPendingActions` — answers **byte-identically** to the same server
    built from `main`'s `server.ts`… which a test cannot import; so instead: the test's expected values ARE the fixtures (`f.FLEET`,
    `f.ME`, …) compared with `toStrictEqual`, and `listQueue` with `queueOf(…)` called directly. And a fleet project id with `fleet` off →
    `404 NOT_FOUND` naming the mock.
- [ ] **Step 2: Run, and predict** (`pnpm exec vitest run --project packages packages/mock/src/fleet.test.ts`): red on the option; the
  defaults' cases green already (they pin today).
- [ ] **Step 3: Implement** `fleet.ts` (a `project(spec)` builder from the table's compact rows, **every object spread from its validated
  fixture**, so the thirteen stay consistent; times from `t0`, submissions at Vancouver noon), the server's hook, `heldFor`, the stream's
  branch (`play(ws, projectId)`: a fleet id → `fleet.events(id)`, `READY`, then `fleet.onEvent(id, write)` until close). **Never** change an
  existing fixture or a default branch.
- [ ] **Step 4: Run** — `fleet.test.ts` green; **the mock's whole suite** (`--project packages packages/mock`) green, unchanged in count but
  for the new file; `pnpm typecheck`, `lint`, `format:check`.
- [ ] **Step 5: Commit on the branch, then the negative controls.**
  ```bash
  git add packages/mock/src/fleet.ts packages/mock/src/fleet.test.ts
  git commit -m "feat(mock): a demo fleet behind MANIFEST_MOCK_FLEET=demo — thirteen projects across every state an administrator meets that the platform can reach, read by id, their streams replayed; every default answer unchanged" -- packages/mock/src/fleet.ts packages/mock/src/fleet.test.ts packages/mock/src/server.ts packages/mock/src/index.ts
  ```
  (a) Give `reading-responses` a fixture id (`f.PROJECT_ID`) → **the ids case red, and the *fleet on, `mock-app` untouched* case red** (the
  fleet now answers the fixture's id) — not a fleet-off default case, which never consults the fleet (M1); restore. (b) Make
  `econ-101-polls`' environment `instances: 'two'` → every read of it `500` naming `Fleet` (the validator), the test red; restore. (c) Answer
  the fleet's rows with `fleet` off → the defaults' `listFleet` case red; restore. (d) Launch `mus-100-listening` (a production environment,
  `launchedAt`) at `1.9.0` → the *reachable* case red, naming it; restore.

---

## Task 4: The mock's demo fleet — an administrator's decisions, with state

**Sitting 3, alone, then LANDING 1** (the review's I6). **In the worktree.**

**Files:** Modify `packages/mock/src/fleet.ts`, `fleet.test.ts`; **`packages/mock/src/server.ts`** and **`server.test.ts`** (the replay's
stored hash, I7).

**Interfaces:** `Fleet.answer` handles, for fleet ids only: `createApprovalPreview`, `getApprovalPreview`, `approveRelease`, `rejectRelease`,
`getApproval`, `submitIamRegistration`, `returnIamRegistration`, `submitPrivacyAssessment`, `returnPrivacyAssessment`,
`recordIamRegistration`, `recordPrivacyAssessment`, `rejectPendingAction`, `confirmPendingAction` (refused here as the console never sends it
— answered as the platform would, with §26's reason rule). The idempotency replay stays the server's (`seen`), unchanged.

**The rules, each the platform's** (re-read in Task 1 `[M1]`; their codes from the document):
- **EVERY REQUEST BODY THE FLEET ACTS ON IS VALIDATED FIRST** (C1) against the operation's request schema — `validate(<the operation's
  request component>, body)`, the validator the server already builds (`createValidator`; it takes any component name) — and refused `400
  REQUEST_INVALID` naming the field, as the platform's schema refusal does: `RecordIamRegistrationRequest` (its five required fields),
  `RecordPrivacyAssessmentRequest`, `RecordSubmissionRequest` (`reference` required, `sentAt` a `date`), `RejectReleaseRequest` (`reason`),
  `ApproveReleaseRequest`, `RejectPendingActionRequest` (`reason`). **The mock's own record routes for `mock-app` are left as they are** (a
  default branch; `server.ts:656-660` — named in *What this plan does not build*).
- **A preview** is stored with `expiresAt = now + 30 min`; `approveRelease`/`rejectRelease` without `previewId` → `400
  APPROVAL_PREVIEW_REQUIRED`; an unknown preview `404 NOT_FOUND`; an expired one `409 APPROVAL_PREVIEW_EXPIRED`; a preview of a release
  decided since → `409 APPROVAL_PREVIEW_STALE`; under `MANIFEST_MOCK_STEP_UP=1`, a decision without the step-up cookie → `403
  STEP_UP_REQUIRED` (the server's existing check, extended to these two operations for fleet ids); reject without a reason → **the request
  schema refuses it**, `400 REQUEST_INVALID` (the rule above; `[M2]` confirms the platform's code from `api/routes/releases.ts`). A decision
  records an `Approval`
  (`decidedByName: 'Operator One'`), closes the request (the item leaves `queueItems()`), moves the checklist's `admin-approval` to `met`, and
  appends `release.approved` / `release.approval_rejected` with *"Operator One approved this release for production."* / *"Operator One did
  not approve this release: <reason>"* and `actor: { name: 'Operator One', asAdministrator: false, reason: null, token: null }`.
- **The team's step**: submit from `sent` → `submitted` (or `change_requested`, `changeRequestedFrom: 'active'`, from a change), `submittedAt`
  = **Vancouver noon of** `sentAt ?? today` (`records.ts:902`, `:959`), `submittedBy` the operator, `externalTicketRef` the reference; the
  item becomes the UBC kind with `since` that stamp (before noon, in the future); `sentAt` after today or before the owner's send → `400 LAUNCH_SENT_AT_INVALID`; a record not `sent` → `409
  LAUNCH_TRANSITION_INVALID`. Return → the `sentFrom` state; the item leaves. Each appends the publisher's sentence (`launch/records.ts`
  `:928-930`, `:977`, `:1035`, `:1072` — copy them verbatim).
- **UBC's answer**: `recordIamRegistration` / `recordPrivacyAssessment` along `launch/transitions.ts:38-58` (`sent` has no arrow: `409
  LAUNCH_TRANSITION_INVALID` naming the team's two operations), `409 LAUNCH_TRANSITION_INVALID` otherwise, naming the moves allowed. **The
  platform's write, not just its arrow** (`records.ts:160-330`): `environment` is production's when absent; `entityId`, `acsUrl`, `sloUrl` and
  `registeredAttributes` are **upserted from the body**; `LAUNCH_RECORD_INVALID` for an empty `registeredAttributes`, an `entityId` that
  differs from a registered one, registered values changed by a write that does not reach `active`, and `active → change_requested` without
  `requestedAttributes`; `requestedAttributes` cleared on `active`; **`change_requested → submitted` re-stamps `submittedAt` and keeps
  `registeredAt`** (`:249-269`), so the item turns `iam-registration` with its `since` reset (A20). Reaching `active`/`approved` removes the
  item and meets the checklist's item; the sentence of `:355-357` / `:452-454`.
- **An agent's question**: `rejectPendingAction` needs `reason` (body) and — the operator being no member — `Manifest-Admin-Reason`, else
  `400 ADMIN_REASON_REQUIRED` (the server's existing check, for fleet projects with the fleet on); it moves to `rejected`, and appends
  `pending_action.rejected` with `actor.asAdministrator: true` and the reason.
- **Every appended event reaches open sockets** for that project (`onEvent`).
- **THE REPLAY KEEPS §26's REASON IN ITS HASH** (I7): `server.ts`'s store (`:1559-1561`) keeps the hash as the check computes it
  (`:1460-1463` — the body plus `\0<reason>` when one was sent), so a retry with the same key and the same reason is the replay, and another
  reason under the key `409 IDEMPOTENCY_KEY_REUSED`, as on the platform. **A default answer changes, towards the platform's** — G3's notice
  says so.

- [ ] **Step 1: The failing tests** — one per rule above, each asserting its **code** and the state after. **Request validation, one case per
  operation** (C1): `recordIamRegistration` without `entityId` (and without each of the other four required fields), `submitIamRegistration`
  without `reference`, with `sentAt: 'yesterday'` (not a `date`), `rejectRelease` and `rejectPendingAction` without `reason` → each `400
  REQUEST_INVALID` naming the field, the record unchanged; `recordIamRegistration` on `stats-sim` with `environment: 'staging'` and its own
  facts moves **staging**, and the same body without `environment` is refused because production's registration does not exist there —
  read `[M2]` for the platform's code and assert it; `active → change_requested` without `requestedAttributes` → `400
  LAUNCH_RECORD_INVALID`. **A20**: `lang-202-journal`'s change → `submitted` (its item now `iam-registration`, `since` a Vancouver noon) →
  `active` with the requested attributes → the item gone, `registeredAttributes` the new set, `registeredAt` moved; and **a failed second
  write** (an invalid body on the `active` write) leaves the record `submitted`, the item in the queue. **I7, in `server.test.ts`**: a
  mutation sent with `Manifest-Admin-Reason`, retried with the same key and reason → the replayed answer; with another reason → `409
  IDEMPOTENCY_KEY_REUSED`. Then: approve with a preview → `201`,
  then `listQueue` without that item and `getApproval` the decision, and a socket on the project receives `release.approved`; the same
  request again with the same key → the same answer (the server's replay); a new key → `409 APPROVAL_PREVIEW_STALE`; an expired preview (the
  test passes `now` 31 min on — `FleetContext.now`) → `409 APPROVAL_PREVIEW_EXPIRED`; step-up on → `403 STEP_UP_REQUIRED` then, after
  `/auth/step-up`, `201`; submit `phys-101-labs`' production registration with `{ reference: 'IAM-2026-0612' }` → `submitted`, and the
  queue's item for it is now `iam-registration` with `since` **Vancouver noon of today**; `sentAt: tomorrow` → `400 LAUNCH_SENT_AT_INVALID`; submit it again →
  `409 LAUNCH_TRANSITION_INVALID`; return `rubric-helper`'s assessment → `draft`, item gone; record `stats-sim`'s staging registration
  `active` → item gone; `expired` from `submitted` → `409 LAUNCH_TRANSITION_INVALID`; reject `bio-201-scheduler`'s question without the
  header → `400 ADMIN_REASON_REQUIRED`, with it → `rejected`; **two servers in one process do not share a decision** (approve on one, the
  other's queue unchanged); **a restart is a reset** (a new server after a decision answers the original queue).
- [ ] **Step 2: Run, and predict. Step 3: Implement. Step 4: Run** the mock's whole suite and the four static gates.
- [ ] **Step 5: Commit on the branch, then the negative controls.**
  ```bash
  git commit -m "feat(mock): the demo fleet keeps an administrator's decisions — every request validated, a release signed off, a record submitted, handed back or answered as the platform writes it, an agent refused — and the replay keeps §26's reason in its hash" -- packages/mock/src/fleet.ts packages/mock/src/fleet.test.ts packages/mock/src/server.ts packages/mock/src/server.test.ts
  ```
  (a) Keep the state in a module-level `Map` → the *two servers* case red; restore. (b) Allow `submitted → expired` → its case red; restore.
  (c) **Skip the request validation** → every *request validation* case red, and nothing else (C1's control); restore. (d) Store the hash
  without the reason again → the I7 case red; restore.
- [ ] **Step 6: LANDING 1** — *How this plan is to be executed*, **THE GATES, BY SITTING**: the G3 notice to the coordinator as the mock's
  edits are about to land (*"`packages/mock` gains `MANIFEST_MOCK_FLEET=demo`, a demo fleet with state that validates every request it acts
  on; every default answer unchanged — `fleet.test.ts`'s defaults cases — **but one: a retry carrying `Manifest-Admin-Reason` under its
  first key is now the replay, as on the platform, where it was `409`**; and `fleet.ts` enters manifest-app's typecheck through
  `@manifest/mock`'s `src/index.ts` (M10); its running mock on 7102 needs no restart"*), the `.env` symlink in place, the 7100 window, `pnpm test` twice, `EXPECT_TESTS`/`EXPECT_FILES` in a landing commit on the branch,
  *"land it"*, `git merge --ff-only`, the shared checkout's `pnpm install --offline --frozen-lockfile` and `pnpm typecheck`, 7100 back.
  **Message any live `manifest-app-*` session** with the same line (the memory *Faculty front-end is a sibling repo*), through the
  coordinator.

---

## Task 5: The look — the system's components, ported and held to their references

**Sitting 4. In the worktree.**

**Files:**
- Create: `packages/admin-ui/src/system/{StateChip,Button,TwoFacts,InverseSurface,SegmentedControl,Choice}.tsx` (the shared six),
  `{MachineValue,ConsoleRail,SettingRow,WaitHeadline,QueueRow,FactList,Tags,RawChip,DiffView,ObservedAction,EventLine,DataTable,FilterBar,
  EnvCell}.tsx` (the fourteen), `cx.ts`, `icons.tsx` (the references' `icon()` and path sets), `state-of.ts` (`stateOf`, `shorten`),
  `index.ts`; `src/system/parity.test.tsx`
- Modify: `src/styles.css` — `@import` the three stylesheets (*Decision 5*); `src/app.tsx` — the rail is `<ConsoleRail>`

**Interfaces:** each component's props are **exactly what its reference reads** — typed from the reference's `props.*` reads (read at
`977b1e7`): `StateChip { state; label?; pulse?; steps?; className? }`; `Button { kind?; size?; href?; type?; disabled?; onClick?; style?;
className?; children }`; `TwoFacts { serving?: Fact; attempt?: Fact; foot?: string | null; title?; className? }` with `Fact { overline?;
title?; note?; tone? }`; `InverseSurface { title?; warn?; body?; inset?; style?; className?; children? }`; `SegmentedControl { options:
string[]; value; role?; onChange? }`; `Choice { name; type?; value; options: { value; title; note? }[]; label?; onChange? }`; `MachineValue {
value; full?; copy?; label?; className? }`; `ConsoleRail { items; footItems; user; role?; product?; homeHref?; signOutHref?; className? }`
with `RailItem { label; icon: 'queue' | 'fleet' | 'health' | 'settings'; href; on? }`; `SettingRow { label; keyName?; value; changed?;
source; action?; editor?; editing? }`; `WaitHeadline { oldest: { text; bound?; note?; gap? } | null; people?; items?; itemsLabel?;
assembled?; assembledGap? }`; `QueueRow { item: { ageText; bound?; kindLabel; kindGap?; project; ask; meta?: { text; mono?; flag?; holder?;
gap? }[] }; selected?; onSelect?; id? }`; `FactList { rows: ({ label; value; mono?; gap? } | null | false)[] }`; `Tags { items: (string |
{ text; add?; sens? })[] }`; `RawChip { raw?; state?; label?; pulse? }`; `DiffView { diff: ApprovalDiff }`; `ObservedAction { id; owner;
reason?; onReason?; placeholder?; hint?; note?; canRecord?; admission?; admissionGap?; actions?: { label; kind?; onClick?; disabled?;
needsReason? }[]; previews?: { label; type; lead; reasonIn?: 'sentence' | 'record'; after?; gap?; afterGap? }[]; previewIndex?;
onPreviewIndex?; seeLabel?; children? }`; `EventLine { when; text; type }` (and, after the mockup's refresh, `who?; asAdmin?; reason?`);
`DataTable { caption; columns: { key; label; sortable?; mono?; align?; render?; gap? }[]; rows; rowKey; striped?; compact?; sortKey?;
sortDir?; onSort?; onRow? }`; `FilterBar { id?; query; placeholder; onQuery?; facets?: { label; on; onToggle? }[]; onClear?; count; label?
}`; `EnvCell { env: { state; age?; incident? } | null }` (and, after the refresh, `instances?`). **`data-gap` attributes are the mockup's
*Show API gaps* switch** — the ports keep the attribute where the reference writes it (parity), and the console never sets a `gap` prop.
Interaction state (a filter's text, a sort, a selection) is the screen's, passed in as props, exactly as in the references.

**The two reference changes this console needs** — **`EnvCell`'s instance count** (`env.instances`, *healthy · 2*) and **`EventLine`'s actor**
(`who`, `asAdmin`, `reason`: who acted, *as a platform administrator*, and the reason quoted) — **ARE MADE**, in `design/admin/components.js`,
by the mockup's refresh (`99af8df`, republished to the same URL as version 3), with **`ObservedAction`'s `admissionLead`** (the strong first
words of its no-reason variant: *"No reason is asked. "* for UBC's answer, *"Manifest doesn't keep a reason for a hand-back. "* for a
hand-back) — so `ObservedAction`'s props above gain `admissionLead?`. A port never renders what its reference does not.

- [ ] **Step 1: The failing test** — `parity.test.tsx`:
  ```tsx
  import { readFileSync } from 'node:fs'
  import { runInNewContext } from 'node:vm'
  import * as React from 'react'
  import { renderToStaticMarkup } from 'react-dom/server'
  import { describe, expect, it } from 'vitest'
  import * as Ours from './index.js'

  type Component = React.FC<Record<string, unknown>>
  const DESIGN = new URL('../../../../docs/superpowers/design/', import.meta.url)

  /** The references, evaluated as the classic scripts they are, under OUR React — the faculty front-end's route (its parity.test.tsx). */
  function references(): { system: Record<string, Component>; admin: Record<string, Component> } {
    const window: Record<string, unknown> = { React }
    for (const file of ['system/components/bundle.js', 'admin/components.js'])
      runInNewContext(readFileSync(new URL(file, DESIGN), 'utf8'), { window, React })
    return {
      system: window['Manifest'] as Record<string, Component>,
      admin: window['ManifestAdmin'] as Record<string, Component>,
    }
  }
  const REF = references()
  const html = (c: Component, props: Record<string, unknown>) => renderToStaticMarkup(React.createElement(c, props))

  const STATES = ['working', 'waiting', 'attention', 'steady', 'notyet'] as const
  const DIGEST = 'sha256:9b2c1d0e3f4a5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4'
  // API-SHAPED PROPS ARE TYPED BY THE CONTRACT (M3): `satisfies` makes `tsc` hold the real shape, so a list change's `added`/`removed`
  // — which DiffView renders — cannot be left out of the cases unnoticed.
  const DIFF = {
    imageDigest: DIGEST,
    changes: [
      { path: 'egress.allow', from: '[]', to: '["api.openai.com"]', summary: 'one host added', added: ['api.openai.com'], removed: [] },
      { path: 'ai.models', from: '["default-chat"]', to: '["default-chat","default-chat-large"]', summary: 'one model added', added: ['default-chat-large'] },
    ],
    services: ['mongodb'],
    attributes: ['eduPersonPrincipalName', 'displayName'],
    resources: { cpu: 1, memory: '1Gi', disk: '2Gi', pids: 256 },
    summary: 'It may now call one outside host and a larger model.',
    summarySource: 'llm',
    summaryWithheldBecause: null,
    summaryExposures: [{ path: 'egress.allow', sentence: 'What a student writes could reach api.openai.com.' }],
    baselineReleaseId: 'f1ee7004-0001-4000-8000-000000000000',
    sensitiveFields: ['egress.allow', 'ai.models'],
    security: [{ field: 'egress.allow', note: 'A new host can be sent anything the app holds.' }],
    coverage: 'This compares manifest.yaml only.',
    review: { state: 'not_performed', reviewer: 'none', detail: 'No review is performed yet.' },
  } satisfies Schemas['ApprovalDiff']   // `import type { Schemas } from '@manifest/contract'` at the top
  const RAIL = {
    user: 'Operator One', role: 'Platform administrator', homeHref: '/queue', signOutHref: '/auth/logout',
    items: [
      { label: 'Queue', icon: 'queue', href: '/queue', on: true },
      { label: 'Fleet', icon: 'fleet', href: '/fleet' },
      { label: 'Health', icon: 'health', href: '/health' },
    ],
    footItems: [{ label: 'Settings', icon: 'settings', href: '/settings' }],
  }

  /** Every prop set the console renders each component with, and the edges (empty, long, every state and kind). */
  const CASES: Record<string, { from: 'system' | 'admin'; props: Record<string, unknown>[] }> = {
    StateChip: { from: 'system', props: STATES.flatMap((state) => [{ state, label: 'Label' }, { state, label: 'Label', pulse: false }]) },
    Button: {
      from: 'system',
      props: [
        ...['primary', 'secondary', 'tertiary', 'danger', 'ghostDanger'].map((kind) => ({ kind, size: 'sm', children: 'Approve' })),
        { kind: 'primary', disabled: true, children: 'Approve' },
        { kind: 'secondary', href: '/fleet', children: 'Fleet' },
      ],
    },
    TwoFacts: {
      from: 'system',
      props: [
        {
          serving: { overline: 'Serving · production', title: 'healthy · 3', note: 'sha256:9b2c1d0e…d3e4', tone: 'steady' },
          attempt: { overline: 'Last attempt · 2h ago', title: 'failed: exited (137)', note: 'GET /health answered 502', tone: 'attention' },
        },
        { serving: {}, attempt: {}, foot: null },
      ],
    },
    InverseSurface: {
      from: 'system',
      props: [{ inset: 'line one\nline two' }, { title: 'Its last lines', warn: true, body: 'The instance exited.', inset: 'x' }],
    },
    SegmentedControl: { from: 'system', props: [{ options: ['Approve', 'Reject'], value: 'Approve', role: 'tablist' }] },
    Choice: {
      from: 'system',
      props: [{
        name: 'next', type: 'radio', value: 'active',
        options: [
          { value: 'active', title: 'Registered (active)' },
          { value: 'change_requested', title: 'Sent back with questions', note: 'For its owner to answer' },
        ],
      }],
    },
    MachineValue: { from: 'admin', props: [{ value: DIGEST, label: 'image digest' }, { value: 'short-value' }, { value: DIGEST, full: true, copy: false }] },
    ConsoleRail: { from: 'admin', props: [RAIL, { ...RAIL, items: [], footItems: [], role: undefined }] },
    SettingRow: {
      from: 'admin',
      props: [
        { label: 'Blueprints', keyName: 'listBlueprints', value: 'node-ts-mongo@1', source: 'This repository', action: null },
        { label: 'The capable model', keyName: 'MANIFEST_CAPABLE_MODEL', value: 'Manifest can’t read this yet.', source: '.env, on the host' },
      ],
    },
    WaitHeadline: {
      from: 'admin',
      props: [
        { oldest: null },
        { oldest: { text: '3 days, 4 hours' }, people: 5, items: 9, itemsLabel: 'items · 5 on us, 4 with UBC', assembled: 'Read just now · again every 60 seconds' },
        { oldest: { text: '19 hours' }, people: 1, items: 1 },
      ],
    },
    QueueRow: {
      from: 'admin',
      props: [
        {
          id: 'q1', selected: true,
          item: {
            ageText: '3d 4h', kindLabel: 'Release approval', project: 'reading-responses',
            ask: 'Approve the release serving staging for production',
            meta: [{ text: 'Instructor One asked on October 11, 2026' }, { text: '✎ a note', flag: true }, { text: 'Waiting on us', holder: true }],
          },
        },
        {
          id: 'q2',
          item: {
            ageText: '23d', kindLabel: 'Privacy assessment', project: 'field-notes', ask: 'Record the Privacy Office’s answer',
            meta: [{ text: 'PIA-2026-0118', mono: true }, { text: 'With the Privacy Office', holder: true }],
          },
        },
      ],
    },
    FactList: {
      from: 'admin',
      props: [
        { rows: [{ label: 'Release', value: 'f1ee7004-0001-4000-8000-000000000000', mono: true }, null, { label: 'Made by', value: 'Instructor One' }] },
        { rows: [] },
      ],
    },
    Tags: { from: 'admin', props: [{ items: ['mongodb', { text: 'sn', add: true }, { text: 'egress.allow', sens: true }] }, { items: [] }] },
    RawChip: { from: 'admin', props: [{ raw: 'healthy' }, { raw: 'failed', label: 'Needs you' }, { raw: 'exit_stopped', state: 'attention', label: 'Stopped' }] },
    DiffView: {
      from: 'admin',
      props: [
        { diff: DIFF },
        { diff: { ...DIFF, summarySource: 'unavailable', summary: null, summaryExposures: null } },
        { diff: { ...DIFF, summarySource: 'no-previous-release', baselineReleaseId: null, sensitiveFields: [], security: [], changes: [] } },
        { diff: { ...DIFF, summarySource: 'withheld', summary: null, coverage: null } },
      ],
    },
    ObservedAction: {
      from: 'admin',
      props: [
        {
          id: 'r1', owner: 'Instructor One', reason: '', onReason: () => undefined,
          actions: [{ label: 'Approve', kind: 'primary' }, { label: 'Reject', kind: 'danger', needsReason: true }],
          previews: [
            { label: 'Approve', type: 'release.approved', lead: 'Operator One approved this release for production.', reasonIn: 'record' },
            { label: 'Reject', type: 'release.approval_rejected', lead: 'Operator One did not approve this release:', reasonIn: 'sentence' },
          ],
          previewIndex: 0, onPreviewIndex: () => undefined,
        },
        {
          id: 'r2', owner: 'Instructor One', reason: 'The new host is not on UBC’s list.', onReason: () => undefined,
          actions: [{ label: 'Reject', kind: 'danger', needsReason: true }],
          previews: [{ label: 'Reject', type: 'release.approval_rejected', lead: 'Operator One did not approve this release:', reasonIn: 'sentence' }],
        },
        {
          id: 'r3', owner: 'Jordan Lee', canRecord: false, admissionLead: 'Manifest doesn’t keep a reason for a hand-back. ', admission: 'Tell Jordan Lee why yourself.',
          actions: [{ label: 'Hand back', kind: 'secondary' }],
          previews: [{ label: 'Hand back', type: 'iam_registration.returned', lead: 'Operator One handed this app’s production registration back to its owner, unsubmitted.' }],
        },
      ],
    },
    EventLine: {
      from: 'admin',
      props: [
        { when: '2h ago', text: 'cpsc-110-help is running in production.', type: 'instance.healthy' },
        // The refreshed reference's actor (the mockup's refresh, or this task's own first edit — see above): written against it.
        { when: '3h ago', text: 'Operator One renamed this project to Bio 201 scheduler.', type: 'project.renamed', who: 'Operator One', asAdmin: true, reason: 'The course code changed this term — the department asked.' },
      ],
    },
    DataTable: {
      from: 'admin',
      props: [
        {
          caption: 'Every app', rowKey: 'slug', striped: true, sortKey: 'slug', sortDir: 'asc', onSort: () => undefined,
          columns: [{ key: 'slug', label: 'App', sortable: true, mono: true }, { key: 'n', label: 'Instances', align: 'right' }],
          rows: [{ slug: 'a', n: 3 }, { slug: 'b', n: 2 }],
        },
        { caption: 'Administrators', rowKey: 'who', columns: [{ key: 'who', label: 'Who' }], rows: [] },
      ],
    },
    FilterBar: {
      from: 'admin',
      props: [
        {
          id: 'f', query: '', placeholder: 'Filter by app, owner or blueprint', count: '13 apps', onQuery: () => undefined,
          facets: [{ label: 'In production', on: false }, { label: 'Archived', on: true }],
        },
        { id: 'f', query: 'chem', placeholder: 'Filter', count: '1 app', onQuery: () => undefined, facets: [] },
      ],
    },
    EnvCell: {
      from: 'admin',
      props: [
        { env: null },
        { env: { state: 'healthy', age: '9d' } },
        { env: { state: 'failed', age: '2h', incident: '2h 10m ago' } },
        // The refreshed reference's count (as EventLine's actor, above).
        { env: { state: 'healthy', age: '9d', instances: 3 } },
      ],
    },
  }

  describe('the console’s components render exactly as the drawing’s', () => {
    for (const [name, { from, props }] of Object.entries(CASES))
      it.each(props)(`${name} %#`, (p) => {
        const ours = (Ours as unknown as Record<string, Component>)[name]!
        expect(html(ours, p)).toBe(html(REF[from][name]!, p))
      })

    it('ports every component the console uses, and no other', () => {
      // FUNCTION-VALUED exports only: the reference exports `ICONS` (an object) beside its components, and so may the port (M3).
      const components = Object.entries(Ours).filter(([k, v]) => /^[A-Z]/.test(k) && typeof v === 'function').map(([k]) => k)
      expect(Object.keys(CASES).sort()).toEqual(components.sort())
    })
  })
  ```
  **`[M3]`'s list adds a case** for any prop set the mockup's `console.js` renders that `CASES` lacks — the rule is *every prop set the
  console renders*, and each screen task that passes a new shape to a port adds its case here in the same commit.
- [ ] **Step 2: Run, and predict** — red: no ports.
- [ ] **Step 3: Implement the twenty ports**, each a TSX function returning the same elements in the same order with the same attributes as
  its reference (`className` strings via `cx`, `aria-*` and `role` kept, inline `style` objects kept), no hooks, no `useId` (it would
  differ from the reference's markup).
- [ ] **Step 4: Run** — green; the four static gates. Then `bash scripts/admin-ui.sh` and screenshot `/queue` at 1440 × 1000 headless
  (`Page.captureScreenshot`) beside the mockup's: the rail, its *Operations* overline, the person and their role look the same.
- [ ] **Step 5: Commit on the branch, then the negative controls.**
  ```bash
  git commit -m "feat(admin-ui): the operations surface's components, ported from the drawing and held markup-identical to it by a parity test" -- packages/admin-ui/src/system packages/admin-ui/src/styles.css packages/admin-ui/src/app.tsx
  ```
  (a) Change one class name in `QueueRow.tsx` → exactly `QueueRow`'s cases red; restore. (b) Export a new `Foo` from `index.ts` without a
  case → the *no other* case red; restore.

---

## Task 6: The queue

**Sitting 5. In the worktree.**

**Files:** Create `src/queue-state.ts`, `src/queue-state.test.ts`, `src/screens/queue.tsx`, `src/screens/queue.test.tsx`; Modify
`src/app.tsx`, `src/api.test.ts`.

**Interfaces:**
- Produces:
  ```ts
  export type QueueKind = Schemas['QueueItem']['kind']
  export type Band = 'us' | 'ubc'
  export const BAND: Record<QueueKind, Band> = {
    'release-approval': 'us', 'iam-registration-to-submit': 'us', 'iam-change-to-file': 'us', 'privacy-assessment-to-submit': 'us',
    'iam-registration': 'ubc', 'iam-change-request': 'ubc', 'privacy-assessment': 'ubc',
  }
  export function holderWords(item: Schemas['QueueItem']): string   // 'Waiting on us' | 'With UBC IAM' | 'With the Privacy Office'
  export function kindWords(kind: QueueKind): string                 // 'Release approval', 'Registration to submit', …
  export interface Headline { oldestOnUs: string | null; peopleWaiting: number; items: number; onUs: number; withUbc: number; truncated: boolean }
  export function headlineOf(queue: Schemas['Queue']): Headline
  export function bandsOf(queue: Schemas['Queue'], filter: QueueFilter): { us: Schemas['QueueItem'][]; ubc: Schemas['QueueItem'][] }
  export interface QueueFilter { text: string; kinds: QueueKind[] }
  export function itemKey(item: Schemas['QueueItem']): string        // `${kind}:${subjectId}` — the URL's and React's key
  ```
- Consumes: `Api.listQueue`; `ageWords`, `ageShort`, `dayInWords`; `WaitHeadline`, `QueueRow`, `FilterBar` from `system/`; `navigate`.

- [ ] **Step 1: The failing tests.**
  - `queue-state.test.ts` — **Review Focus 5**:
    ```ts
    import { describe, expect, it } from 'vitest'
    import { headlineOf, bandsOf, BAND } from './queue-state.js'
    import type { Schemas } from '@manifest/contract'

    const item = (kind: Schemas['QueueItem']['kind'], since: string, who: string | null): Schemas['QueueItem'] => ({
      kind, since, summary: 's', note: null, environment: null,
      project: { id: '00000000-0000-4000-8000-000000000001', slug: 'p', name: 'P' },
      subjectId: crypto.randomUUID(),
      requestedBy: who === null ? null : { id: who, displayName: who },
    })

    describe('the headline', () => {
      it('is the oldest wait on US — never UBC’s, whatever oldestSince says', () => {
        const q = { items: [item('privacy-assessment', '2026-09-21T00:00:00Z', 'a'), item('release-approval', '2026-10-11T00:00:00Z', 'b')],
          oldestSince: '2026-09-21T00:00:00Z', truncated: false }
        expect(headlineOf(q).oldestOnUs).toBe('2026-10-11T00:00:00Z')
      })
      it('counts distinct people on our band, nobody-recorded as one', () => {
        const q = { items: [item('release-approval', '2026-10-11T00:00:00Z', 'b'), item('iam-change-to-file', '2026-10-12T00:00:00Z', 'b'),
          item('iam-registration-to-submit', '2026-10-13T00:00:00Z', null), item('iam-registration', '2026-10-01T00:00:00Z', 'c')],
          oldestSince: '2026-10-01T00:00:00Z', truncated: false }
        expect(headlineOf(q)).toMatchObject({ peopleWaiting: 2, items: 4, onUs: 3, withUbc: 1 })
      })
      it('is null — "Nobody is waiting on us." — when our band is empty, even with UBC items', () => {
        expect(headlineOf({ items: [item('iam-registration', '2026-10-01T00:00:00Z', 'c')], oldestSince: '2026-10-01T00:00:00Z', truncated: false }).oldestOnUs).toBeNull()
      })
      it('says when the read was truncated', () => {
        expect(headlineOf({ items: [], oldestSince: null, truncated: true }).truncated).toBe(true)
      })
    })
    describe('the bands', () => {
      it('put every kind in exactly one band, oldest first, filtering never regrouping', () => {
        expect(Object.keys(BAND).sort()).toEqual(['iam-change-request', 'iam-change-to-file', 'iam-registration', 'iam-registration-to-submit',
          'privacy-assessment', 'privacy-assessment-to-submit', 'release-approval'])
        const q = { items: [
          item('release-approval', '2026-10-12T00:00:00Z', 'b'), item('iam-registration', '2026-09-20T00:00:00Z', 'c'),
          item('iam-change-to-file', '2026-10-10T00:00:00Z', 'd'), item('privacy-assessment', '2026-10-01T00:00:00Z', 'e'),
        ], oldestSince: '2026-09-20T00:00:00Z', truncated: false }
        const { us, ubc } = bandsOf(q, { text: '', kinds: [] })
        expect(us.map((i) => i.kind)).toEqual(['iam-change-to-file', 'release-approval'])        // oldest first
        expect(ubc.map((i) => i.kind)).toEqual(['iam-registration', 'privacy-assessment'])
        expect(bandsOf(q, { text: 'd', kinds: [] }).us.map((i) => i.kind)).toEqual(['iam-change-to-file'])   // the requester's name
        expect(bandsOf(q, { text: '', kinds: ['release-approval', 'iam-registration'] })).toEqual({
          us: [q.items[0]], ubc: [q.items[1]],                                                   // a filter, never a regrouping
        })
      })
    })
    ```
    **plus a test that `BAND`'s keys are exactly the document's `QueueItem.kind` enum**, read from `@manifest/contract/openapi.json` — a new
    kind from the platform turns it red, not grey.
  - `screens/queue.test.tsx` — rendered with a fixed `now` and a queue: the headline's three numbers and *"Oldest waiting on us"*; the empty
    state *"Nobody is waiting on us."* in `steady`; *"Only the oldest 200 are shown"* when truncated; every row's `mfa-qrow`-class markup
    (from the port) amber, none red; a note marker only on a row with a note; *"Read just now · again every 60 seconds"*.
  - **Review Focus 4** — `queue-state.test.ts`: `selectionAfterRead(selected: string | null, queue): { key: string | null; left: boolean }`
    — a selected item absent from a new read is still selected, `left: true` (the pane keeps it; Task 7 says what became of it).
  - `api.test.ts` — against the demo fleet: `headlineOf(await api.listQueue())` → `oldestOnUs` is `reading-responses`' since, `peopleWaiting:
    5` (the table's five first-band owners; a `mock-app` item there, if `[M2]` finds one, is Instructor One's — already counted), and
    **`oldestSince` is an item of UBC's band, not `reading-responses`'** (the data carries the trap).
- [ ] **Step 2: Run, and predict.**
- [ ] **Step 3: Implement** `queue-state.ts` and the screen: the headline (`WaitHeadline`), the filter (`FilterBar`: text over slug, name and
  requester; the kinds as facets; held in the query string), the two bands with their headings (*Waiting on us — the headline counts
  these.*; *Waiting on UBC — ours to chase and record.*), each `QueueRow`; the pane slot (Tasks 7–8) beside the list; **keyboard**: `j`/`k`
  move the selection within the visible rows (stopping at the ends), `Enter` opens, `Esc` closes, `/` focuses the filter — none while a text
  field has focus; the read on mount, every 60 s and on `visibilitychange` to visible; ages re-rendered every minute from `since`.
- [ ] **Step 4: Run** the project's tests and the static gates; walk it on the demo fleet (`bash scripts/admin-ui.sh`): the headline reads
  *3 days, 4 hours*, not *23 days*.
- [ ] **Step 5: Commit on the branch, then the negative control:** compute `oldestOnUs` from `oldestSince` → the first headline case and the
  `api.test.ts` case red; restore.
  ```bash
  git commit -m "feat(admin-ui): the queue — oldest waiting on us from our own band, two bands by who holds the wait, filtered, keyboard-first, read every minute" -- packages/admin-ui/src
  ```

---

## Task 7: The release approval pane

**Sitting 5, after Task 6. In the worktree.**

**Files:** Create `src/approval-state.ts`, `src/approval-state.test.ts`, `src/screens/approval-pane.tsx`, `src/screens/approval-pane.test.tsx`,
**`src/stream.ts`** (moved here from Task 10 — the review's I4: the console's `useProjectStream`, copied with its comments — StrictMode's
double effect guarded, `1013` retried once — plus a pure `askedThrough(frames, releaseId): { token: string | null } | null` that finds the
newest `approval.requested` for the release and reads its `actor.token?.name`), `src/stream.test.ts`; Modify `src/screens/queue.tsx`,
`src/router.ts` (`/releases/<id>/approval`), `src/api.test.ts`.

**Interfaces:**
- Produces:
  ```ts
  export type ApprovalPane =
    | { at: 'reading' }                                             // the facts; no preview yet — opening one calls no model (decision 6)
    | { at: 'previewing' }
    | { at: 'previewed'; preview: Schemas['ApprovalPreview'] }
    | { at: 'deciding'; preview: Schemas['ApprovalPreview']; verb: 'approve' | 'reject'; key: string }
    | { at: 'decided'; approval: Schemas['Approval']; byYou: boolean }
    | { at: 'gone-elsewhere'; approval: Schemas['Approval'] | null } // left the queue while open (Review Focus 4)
    | { at: 'refused'; preview: Schemas['ApprovalPreview'] | null; code: string; message: string }
  export function paneAfter(pane: ApprovalPane, event: PaneEvent): ApprovalPane    // a pure reducer; PaneEvent listed in the test
  export function draftReasonKey(releaseId: string, previewId: string): string    // sessionStorage key for the typed reason
  ```

**What the pane shows** (the design's §3.5, refreshed): the request — who asked (`requestedBy`), when, **through which token — from the
project's stream** (the pane opens ONE socket for its project on entering and closes it on leaving; `askedThrough` reads the replay's
`approval.requested` and its `actor.token.name`; no operation reads it, the design's A21 — *"An agent on Instructor One's token,
'the agent that builds this app', asked"*), **the owner's note quoted with the system's left rule**; **the project's recent events** from the
same replay, as `EventLine`s; the release (`getRelease`: id and digest as `MachineValue`, who made it — named from
`listMembers`, else *"someone no longer on the project"* — its scan in full, `stale` in words); the checklist (`getLaunchReadiness`: every
item's raw `id` beside its words, `since`); **Take the preview** (*"a stored copy of exactly what your decision will record. A language model
writes its summary; it is kept for 30 minutes."*); the diff (`DiffView`: changes, sensitive fields flagged, security notes, the summary with
its `summarySource` said honestly — `unavailable` reads *"The model didn't answer. The diff beside it is the control."* — exposures, the
review, the coverage line); `ObservedAction` for **Approve** (reason optional, *"kept on the approval record"*) and **Reject** (reason
required); *What Instructor One will see*: the publisher's sentence (fact 3; the design's §4 table).

- [ ] **Step 1: The failing tests** — **Review Focus 2, 3 and 4**:
  - `approval-state.test.ts`: `reading → previewing → previewed` on *Take the preview*; `previewed → deciding` keeps ONE key across a
    retry (the reducer reuses `key` when `deciding` is re-entered from `refused` by a network error, and makes a new one only for a new
    preview); `deciding` + `STEP_UP_REQUIRED` → a navigation to the step-up with the pane's own URL as `returnTo`, **encoded** — the
    function `stepUpUrl(releaseId, previewId)` asserted exactly as `'/auth/step-up?returnTo=' + encodeURIComponent('/releases/' + releaseId +
    '/approval?preview=' + previewId)`, as the reference console encodes it (`packages/console/src/auth.ts:41-42`, M4); on return with `?preview=`, `getApprovalPreview` restores `previewed` and
    the reason typed is read back from `sessionStorage[draftReasonKey]`; `APPROVAL_PREVIEW_STALE` and `APPROVAL_PREVIEW_EXPIRED` →
    `refused` with *"Something moved since you read the preview. Nothing was recorded, and the release is untouched. Take a new one."* /
    *"The preview is more than 30 minutes old. Nothing was recorded. Take a new one."* and **no automatic re-take**; a re-read while open
    finding the item gone → `gone-elsewhere` with `getApproval`'s `decidedByName` (the reducer's case gives it a synthetic approval by
    *"Operator Two"* — the demo fleet has one administrator — and expects *"Operator Two approved this on October 14, 2026."*), or null
    (*"This is no longer waiting on us."*).
  - `stream.test.ts`: `askedThrough` over a replay holding two `approval.requested` frames for the release (the newest wins), one with
    `actor.token` → its name, one without → `null` (asked in a session), and none → `null` for the request itself (*"through which token"* is
    then not said, never guessed).
  - `approval-pane.test.tsx`: the note quoted; the token's name when the replay carries one; `summarySource: 'unavailable'`'s sentence; *Approve* disabled while `deciding` (Review Focus
    2); *Reject* disabled until a reason is written; *What Instructor One will see* reads *"Operator One approved this release for
    production."*.
  - `api.test.ts` against the fleet: preview → approve → the queue no longer lists `reading-responses`; the same call with the same key →
    the same `Approval` (replayed); step-up on (`stepUp: true`) → `403 STEP_UP_REQUIRED` first.
- [ ] **Step 2: Run, and predict. Step 3: Implement.** The reason field writes `sessionStorage` on change, in a `try` (a private window
  throws), and clears it on `decided`.
- [ ] **Step 4: Run**; walk it on the fleet with `MANIFEST_MOCK_STEP_UP=1 bash scripts/admin-ui.sh`: approve `reading-responses` through the
  step-up and back, the reason still typed, the item gone from the queue.
- [ ] **Step 5: Commit on the branch, then the negative controls:** (a) make a new key on every click → the retry case red; restore. (b)
  re-take the preview automatically on `STALE` → its case red; restore.
  ```bash
  git commit -m "feat(admin-ui): a release signed off from a stored preview — its diff, observed, stepped up and back with the reason kept, stale and expired said, decided elsewhere said" -- packages/admin-ui/src
  ```

---

## Task 8: The team's step and UBC's answer

**Sitting 6. In the worktree.**

**Files:** Create `src/transitions.ts`, `src/transitions.test.ts`, `src/screens/record-pane.tsx`, `src/screens/record-pane.test.tsx`;
Modify `src/screens/queue.tsx`, `src/router.ts` (`/projects/<id>/records`), `src/api.test.ts`.

**Interfaces:**
- Produces:
  ```ts
  // `launch/transitions.ts:38-58`. `sent` has NO arrow (with the team, only its submission or hand-back moves it), so the record
  // form is never offered for a `sent` record — the team's pane is (M7).
  export const IAM_MOVES: Record<'draft' | 'sent' | 'submitted' | 'active' | 'change_requested' | 'expired', readonly string[]> = {
    draft: ['submitted'], sent: [], submitted: ['active', 'change_requested'], active: ['change_requested', 'expired'],
    change_requested: ['submitted', 'expired'], expired: ['submitted'],
  }
  export const PIA_MOVES: Record<'draft' | 'sent' | 'submitted' | 'approved', readonly string[]> = {
    draft: ['submitted'], sent: [], submitted: ['approved', 'draft'], approved: ['draft'],
  }
  export function movesFromSentence(sentence: string): Record<string, string[]>   // parses "`a` to `b` or `c`; …"
  /** THE BODY a move sends (C1) — exactly what `recordIamRegistration` requires, from the record and the queue item, never from the form alone. */
  export function iamAnswerBody(
    record: Schemas['IamRegistration'],
    item: Schemas['QueueItem'],
    answer: { state: 'active' | 'change_requested' | 'submitted' | 'expired'; ticket: string; registeredAttributes?: string[];
              requestedAttributes?: string[]; certFingerprint?: string; certExpiresAt?: string },
  ): Schemas['RecordIamRegistrationRequest']
  /** A change UBC granted (A20): the two writes, in order, each with its own key — `[{ state: 'submitted', … }, { state: 'active', … }]`. */
  export function grantedChange(record: Schemas['IamRegistration'], item: Schemas['QueueItem'], ticket: string, granted: string[]):
    [Schemas['RecordIamRegistrationRequest'], Schemas['RecordIamRegistrationRequest']]
  ```

- [ ] **Step 1: The failing tests.**
  - `transitions.test.ts` — **decision 9**: read `@manifest/contract/openapi.json`, take `RecordIamRegistrationRequest.properties.state.
    description` and `RecordPrivacyAssessmentRequest`'s, `movesFromSentence` each, and `toEqual` `IAM_MOVES` / `PIA_MOVES` (each list
    sorted; `sent: []` added by the table, since the sentence names it only to say it is not recorded here). `movesFromSentence` on the two
    literal sentences of fact 4 first (its own unit cases), so a parse failure is told apart from a rule change — **including the three
    shapes it must not misread** (M7): the PIA sentence's *"`submitted` to `approved`, or back to `draft` when the Privacy Office refuses
    it"*; the backticked codes and operation names after the arrows (*"refused `409 LAUNCH_TRANSITION_INVALID`"*,
    *"(`submitIamRegistration`)"*), which are not states; and *"the state it is in, or one step on"* — staying is allowed, and is not an
    arrow.
  - **`iamAnswerBody` — the exact body per move** (C1; Review Focus 1): for `stats-sim`'s staging item recording `active`, the body is
    exactly `{ environment: 'staging', entityId: <the record's>, acsUrl: <the record's>, sloUrl: <the record's>, registeredAttributes:
    <what the form holds, pre-filled from the record's requested or package attributes>, state: 'active', externalTicketRef: 'IAM-2026-0511',
    certFingerprint, certExpiresAt }` (`toStrictEqual`); for `change_requested` (UBC's questions) from `submitted`, `registeredAttributes`
    is **the record's own, unchanged**; for `active → change_requested`, `requestedAttributes` present; a production item sends
    `environment: 'production'` — **never omitted** (omitted means production, `records.ts:170`).
  - **`grantedChange` — A20's two writes** (I8): `lang-202-journal`'s change gives `[{ …, state: 'submitted', registeredAttributes: <the
    record's, unchanged> }, { …, state: 'active', registeredAttributes: <the granted set> }]`; the pane runs them in order, **each on its own
    key held until its answer**; **a failed second write** leaves the pane showing the record at `submitted` with *"Record UBC IAM's answer"*
    offered again and the first write never repeated; the sentence beside the moves says *"A change UBC IAM granted is recorded in two
    steps: with UBC IAM, then active."*
  - `record-pane.test.tsx` — a `sent` registration: its package (every attribute's name, OID, purpose, `usedAt`, *unused* marked), the
    certificate's fingerprint and expiry, the warnings; **Submit** needs a reference and offers today in Vancouver, refusing a day after today
    in the form before the API does; **File the change request** for a change (`sentFrom: 'active'`), with registered and requested
    attributes side by side; **Hand back** with *"Tell Jordan Lee why yourself — Manifest doesn't keep a reason for a hand-back."*; a `sent`
    assessment: the six sections, every gap with the owner's answer by `gapId`; with UBC: the answer form offering exactly `IAM_MOVES[state]`
    (or `PIA_MOVES`), with the record's facts shown and the attributes editable only for `active`; `LAUNCH_TRANSITION_INVALID` or
    `LAUNCH_RECORD_INVALID` arriving anyway → the refusal shown and the record re-read.
  - `api.test.ts` against the fleet — **whose request validation refuses a wrong body, so these cases fail if the pane's body is wrong**:
    submit `phys-101-labs` → the queue's item is now `iam-registration`; record `stats-sim`'s answer `active` with `iamAnswerBody`'s body →
    gone, **and `getLaunchRecords` shows STAGING `active` and production untouched**; grant `lang-202-journal`'s change with `grantedChange`'s
    two bodies → gone, `registeredAttributes` the granted set; hand back `rubric-helper`'s assessment → gone. **Review Focus 2**: each action makes ONE key and reuses it on a retry (the
    pane's `keyFor(action)` keeps it until the answer arrives — a second *Submit* after a network error sends the same key, and the mock
    replays the first answer), and the button is disabled while its request is in flight.
- [ ] **Step 2–4: Run and predict; implement; run** — and walk each on the fleet.
- [ ] **Step 5: Commit on the branch, then the negative controls:** (a) add `'expired'` to `IAM_MOVES.submitted` → the document case red;
  restore. (b) **Drop `environment` from `iamAnswerBody`** → the exact-body case red AND the `api.test.ts` case red (the fleet writes
  production's registration, or refuses it — the C1 failure, caught twice); restore. (c) Send `active` straight from `change_requested` →
  the fleet's `409 LAUNCH_TRANSITION_INVALID`, the A20 case red; restore.
  ```bash
  git commit -m "feat(admin-ui): the team's step — submit to UBC, file a change, hand back — and UBC's answer recorded as the platform requires it, along its own moves, a granted change in two writes" -- packages/admin-ui/src
  ```

---

## Task 9: The fleet

**Sitting 6, after Task 8. In the worktree. Then LANDING 2 — or, if the sitting overflows, at sitting 7's open.**

**Files:** Create `src/fleet-state.ts`, `src/fleet-state.test.ts`, `src/screens/fleet.tsx`, `src/screens/fleet.test.tsx`.

**Interfaces:**
- Produces: `interface FleetFilter { text: string; inProduction: boolean; failedLast: boolean; olderBlueprint: boolean; archived: boolean;
  scale: Schemas['Audience']['scale'][] }`; `filterFromQuery(q: string): FleetFilter`; `queryFromFilter(f: FleetFilter): string`;
  `rowsOf(fleet, blueprints, filter, sort): FleetRow[]`; `envCellOf(env, now): EnvCellProps` — the state word and raw enum, **the
  instance count** (*"healthy · 3"*), the last deploy's age, the incident marker when `latestIncidentAt` is after `lastDeployAt`.

- [ ] **Step 1: The failing tests** — `filterFromQuery(queryFromFilter(f))` round-trips every field; archived rows hidden by default and shown
  by the filter; *older blueprint* from `listBlueprints`' majors (`rubric-helper`'s `@0`); sort by every column, default the most recent
  deploy first; `envCellOf` for `econ-101-polls`' production → *healthy · 1* and the incident marker (one of its two stopped, not
  replaced); the screen: `DataTable` `striped` (decision 17), a row is a link to `/projects/<id>` (followed in-app by the shell's delegated
  listener, M5), *"14 apps · 1 archived, hidden"*. **And the gaps said**: the header's sentence *"The
  fleet doesn't carry an app's data level, department, domains or this month's AI spend yet."*
- [ ] **Step 2–4.** **Step 5: Commit on the branch, then the negative control:** default `archived: true` → the default case red; restore.
  ```bash
  git commit -m "feat(admin-ui): the fleet — every app, its instances by environment, filtered and sorted in the URL" -- packages/admin-ui/src
  ```
- [ ] **Step 6: LANDING 2** — as L1, without G3 unless `packages/mock` changed since L1 (then G3 again). **If the sitting is out of room, it
  stops after Task 9's commit and L2 opens sitting 7** (the review's I6) — the sittings table and the record say so.

---

## Task 10: The project's page

**Sitting 7. In the worktree (L2 first, if sitting 6 moved it here).**

**Files:** Create `src/project-state.ts`, `src/project-state.test.ts`, `src/screens/project.tsx`, `src/screens/project.test.tsx`. **Consumes
`src/stream.ts`'s `useProjectStream`** (Task 7 made it).

**What it reads and shows:** the refreshed design's §6 table — the head (with **the U1 level from the serving release's `config`**, A17),
environments with `TwoFacts` and **the set** (`listInstances`: state word and raw, `serving`, `lastSeenAt`, the release), **incidents by
`cause`** with the log tail in `InverseSurface`, releases and scans, the launch (checklist with raw ids; the records with who has each and
since), people and agents (members; tokens with **who minted each**, named from members; agents' questions — pending ones with **Reject**,
answered ones read-only; sessions), and **events live** — `EventLine` with the actor's name and, when `asAdministrator`, *"as a platform
administrator"* and the reason quoted. **If `[M1]` found 1.10.0**: *Load rehearsals* — `listLoadRehearsals`' newest with its result in words;
otherwise not built (named in the sitting's record).

- [ ] **Step 1: The failing tests** — `project-state.test.ts`: the level from **the SERVING** production release, else staging's, else *"not
  deployed yet"* — held on `bio-201-scheduler`, whose newest release (a candidate that raised the level) is not the serving one (M2); a token's minter named, or *"someone no longer on the project"*; incidents grouped newest first with `cause` words (*"A
  deploy failed"*, *"A serving instance stopped and was replaced"*, *"It stopped, and replacing it gave up"*); `project.test.tsx` on
  `bio-201-scheduler`: the renamed event reads *"Operator One · as a platform administrator"* with the reason in the left-rule quote;
  **Reject** on its question needs a reason and sends it as the body's `reason` AND as `Manifest-Admin-Reason` (the `createApi` middleware
  with `adminReason` set for the open project — the field says *"Written for two readers: the agent is told it, and the project's people see
  it."*); `api.test.ts`: the rejection without the header → `400 ADMIN_REASON_REQUIRED` (the api function given no `adminReason`), with it →
  `rejected`; **Review Focus 2 (I7)**: the same rejection retried with the same key and reason → the replayed `rejected` answer, never `409`;
  the button disabled in flight.
- [ ] **Step 2–4.** Walk `cpsc-110-help` (three instances, one failed and replaced) and `econ-101-polls` (`exit_stopped`).
- [ ] **Step 5: Commit on the branch, then the negative control:** read the level from **the newest release instead of the serving one** →
  the level case red on `bio-201-scheduler` (M2: reading `Release.config.sandbox` could not fail — one `data.classification` feeds all three
  environments, `fixtures.ts:486-499`); restore.
  ```bash
  git commit -m "feat(admin-ui): one project as an operator sees it — its sets, incidents by cause, releases, launch, people, agents and events naming who acted and why" -- packages/admin-ui/src
  ```

---

## Task 11: Health and Settings

**Sitting 7, after Task 10. In the worktree.**

**Files:** Create `src/health-state.ts`, `src/health-state.test.ts`, `src/screens/health.tsx`, `src/settings.ts`, `src/settings.test.ts`,
`src/screens/settings.tsx`, and their `.test.tsx`.

- [ ] **Step 1: The failing tests.**
  - `health-state.test.ts` — the four panels from the fleet and its fan-out (the refreshed design's §7): **incidents** from `listIncidents` of
    each environment whose `latestIncidentAt` is within 14 days, `exit_stopped` first in `attention`, then `exit`, then `deploy`;
    **certificates** from `getLaunchRecords` (both registrations), amber within 90 days, red within 14 (decision 14) — `math-oh-queue` red,
    `bio-201-scheduler` amber; **scans** of each serving release, `stale` or fixable — `stats-sim`'s staging release `stale` (I3 (b): a
    fixable finding never sits beside a met launch); **superseded blueprints**; and *"Read just now from N
    reads"* with N counted, not estimated. Each panel's *"cannot see"* sentence present.
  - `settings.test.ts` — **decision 12**: every `key` in `SETTINGS` that names an environment variable appears in
    `packages/control-plane/src/config.ts` or `.env.example` (read as text — test files are outside the boundary); the blueprints row reads
    `listBlueprints`; **no row renders a value it cannot read** (every non-blueprint row's value cell is the admission).
- [ ] **Step 2–4.** **Step 5: Commit on the branch, then the negative control:** rename one key in `SETTINGS` → the settings case red;
  restore.
  ```bash
  git commit -m "feat(admin-ui): Health — incidents by cause, certificates, scans, superseded blueprints, each saying what it cannot see — and Settings, read-only, saying where each is set" -- packages/admin-ui/src
  ```

---

## Task 12: The acceptance's headless half — `make demo-admin`, its controls, the documents, the review

**Sitting 8. Alone. In the worktree, then LANDING 3; then the two shared documents in the shared checkout.**

**Files:** Create `packages/admin-ui/walk/walk.ts`, `scripts/demo-admin.sh`; Modify `Makefile` (`demo-admin`), **`scripts/ci-acceptance.sh`
and `scripts/offline-acceptance.sh`** (a `make demo-admin` step each — M11: a demo no acceptance runs is how two stayed red for five days,
D5's sitting 8). **After L3, in the shared checkout:** `docs/superpowers/RUNBOOK.md` (*Running the administrator's console*),
`docs/superpowers/WALKTHROUGH.md` (*The administrator's console*) — never on the branch (I5 (b)).

- [ ] **Step 1: The walk** — `walk.ts`, raw CDP over Node 24's `WebSocket`, modelled on
  `.superpowers/sdd/2026-10-03-fe46-fe47-fe5/walk-sitting3/walk.mjs` (git-ignored; read it in the shared checkout): Chrome
  `--headless=new --remote-debugging-port=0 --user-data-dir=<scratch>` — **the port the system gives, read back from the profile's
  `DevToolsActivePort`** (Decision 17), never one in 7100–7199; the console at 1440 × 1000; **nine checks, each asserting a shape, never
  only that a page loaded**:
  1. `/` signs in through the mock's `/auth/login` and **the URL becomes `/queue`** (`history.replaceState`, M6); the rail shows *Operator
     One · platform administrator*; a rail click to Fleet and back keeps the page (no reload — the shell's delegated listener, M5).
  2. The headline reads `reading-responses`' age (computed from the mock's own `listQueue`, read by the walk through `fetch`) and **not**
     `oldestSince`'s; *5 people*; both bands' row counts equal the API's.
  3. `j` `j` `Enter` opens the second row's pane; its URL is `/queue/<kind>/<subjectId>`.
  4. `reading-responses`: the request names *"the agent that builds this app"* (from the stream, I4); *Take the preview* → the diff's two
     sensitive fields; *Approve* with a reason → (step-up on) the step-up round trip → back on the same preview, the reason still in the
     field → *Approve* → *"Operator One approved this release for production."*; the row gone on the next read.
  5. `phys-101-labs`: *Submit* with `IAM-2026-0612` → the row moves to *Waiting on UBC*.
  6. `stats-sim`: record `active` → the row gone; **then the walk reads the records back through the API** (C1): STAGING's registration
     `active` with the entity ID and attributes it had, production's untouched (absent, as before).
  7. `/fleet?inProduction=1` → only the launched apps; `econ-101-polls`' production cell *healthy · 1* with the incident marker.
  8. `/projects/<bio-201-scheduler>` → the administrator's event with its reason; reject the agent's question with a reason → *rejected*.
  9. `/health` → `math-oh-queue`'s certificate red; `econ-101-polls`' `exit_stopped` first. `/settings` → the blueprints listed, every other
     value an admission.
  Screenshots of each to `$DEMO_ADMIN_SHOTS` (default: the scratchpad). Exit 0 only when all nine pass; each failure names its check.
- [ ] **Step 2: `scripts/demo-admin.sh`** — refuses if 7101 or 7113 listens; **builds the contract** (`pnpm --filter @manifest/contract
  build`, I1) and the console (`pnpm --filter @manifest/admin-ui build`), starts the mock (`MANIFEST_MOCK_PORT=7113 MANIFEST_MOCK_ROLE=admin MANIFEST_MOCK_FLEET=demo MANIFEST_MOCK_STEP_UP=1`) and `vite
  preview` (`MANIFEST_MOCK=1 MANIFEST_MOCK_PORT=7113`), runs the walk, stops all three and deletes the profile in a `trap`; prints `every check
  passed` last. `DEMO_ADMIN_STOP_AFTER=<1–9>` for a control's short run. **No 7100, no Docker, no network.** `make demo-admin` runs it;
  **`scripts/ci-acceptance.sh` gains it as a step** (on either driver — it needs no control plane; it reads `PASS`/`FAIL` like its
  neighbours) **and `scripts/offline-acceptance.sh` as step 20** (M11).
- [ ] **Step 3: Run it three times** — fresh, again (the mock restarted: a reset), and after `git clean -fdx packages/admin-ui/dist`. Record
  each time.
- [ ] **Step 4: The negative controls, each committed-then-broken-then-restored, each predicted first**: (a) the headline from
  `oldestSince` → check 2 red, naming *23 days*; (b) a new key per click → none of the walk's checks (it does not retry) — so (b) is held by
  Task 7's unit case, and the record says so; (c) the mock's state in a module `Map` → check 4's *row gone* still green (one server) — held by
  Task 4's two-servers case; say so; (d) `IAM_MOVES.submitted` gains `expired` → check 6 green, Task 8's document case red; (e) the fleet's
  archived filter defaulted on → check 7 red; (f) `asAdministrator` ignored in `EventLine` → check 8 red; (h) **`iamAnswerBody` without
  `environment`** → check 6 red (the fleet refuses it, or production moves) — C1 through the real entry point; (g) the mock with
  `MANIFEST_MOCK_ROLE=member` → check 1 red with *"This console is for platform administrators"* on screen — the gate working, the walk
  correctly failing. **A control that stays green is a question** (the memory): work out why before recording *cannot fail here*.
- [ ] **Step 5: The documents — drafted here, committed in the shared checkout after L3 (Step 7a)** — RUNBOOK *Running the administrator's
  console* (`make admin-ui`, the two ports and that `make doctor` knows them, `MANIFEST_MOCK_STEP_UP=1`, the demo fleet's thirteen and what each
  shows, *a restart resets it*, no web fonts, the contract's `dist/` built first, P11b not built); WALKTHROUGH one section; both state no
  counts.
- [ ] **Step 6: The plan's one whole-branch review** — a fresh reviewer (a subagent, the most capable model) on `git diff main...p11-admin-ui`
  against this plan, the refreshed design and *Review Focus*; findings ranked; **its one fix wave**, each fix test-first; the walk again after.
- [ ] **Step 7: Commit** (the branch, before the merge):
  ```bash
  git commit -m "test(admin-ui): make demo-admin — the console walked headless on the demo fleet, nine checks, its controls; a step of ci-acceptance and the offline acceptance" -- packages/admin-ui/walk scripts/demo-admin.sh scripts/ci-acceptance.sh scripts/offline-acceptance.sh Makefile
  ```
- [ ] **Step 7a: LANDING 3** — as L1 (G3 if `packages/mock` changed since L2). Then `make demo-admin` once more **from the shared checkout**
  after the merge and install — the landed tree, not the worktree's. **Then the two documents, in the shared checkout**, after `git status
  --short` shows each clean of a peer's edit (else wait and tell the coordinator):
  ```bash
  cd /Users/rich/Developer/manifest
  git commit -m "docs: running the administrator's console — RUNBOOK and WALKTHROUGH (P11 Task 12)" -- docs/superpowers/RUNBOOK.md docs/superpowers/WALKTHROUGH.md
  ```

---

## Task 13: Rich clicks it, and the plan closes

**Sitting 9. Alone, and last. Rich at the machine (G9: the coordinator opens it with ⚠ BLOCKED ON YOU and a `PushNotification`).**

- [ ] **Step 1:** In the shared checkout, `make admin-ui` (with `MANIFEST_MOCK_STEP_UP=1`); hand Rich the URL and the walk of *What Rich does*
  3. **Record his words verbatim**, with `date`'s time.
- [ ] **Step 2:** Anything he finds is a finding in this sitting's record: fixed here only if it is small and test-first (then a fourth
  landing, as L1) — otherwise named for P11b or a minors round, his call.
- [ ] **Step 3: The close-out** (shared checkout, documents only, by pathspec): this plan **EXECUTED** (its sittings table, *What executing
  this plan found*); the roadmap's P11 row and ledger; ORIENTATION §2's plan table (a row), §3's document map, and §7e only if the coordinator
  gives the turn; CLAUDE.md's *State* (a plan finished: its table's row); the design's §13 (*BUILT*); **the `.env` symlink removed**
  (`rm /Users/rich/Developer/manifest-p11/.env` — the link, never the file it points at; `ls -la` first), then `git worktree remove
  /Users/rich/Developer/manifest-p11` and `git branch -d p11-admin-ui` (both after L3 is on `main`; `-d`, never `-D`).
- [ ] **Step 4: The machine, as found** (M8; CLAUDE.md's *Machine cleanup*): run `scripts/dead-app-resources.sh`, `litellm-orphans.sh` and
  `app-images.sh` bare, then `--apply` where they name anything — **P11 makes no Docker resource, so expect nothing of its own, and say so
  with each script's count**; `lsof -nP -iTCP:7101 -iTCP:7113 -sTCP:LISTEN` reads nothing; no walk's Chrome is running (`pgrep -fl
  'remote-debugging-port=0'`) and every walk profile directory is gone; `git worktree list` shows the shared checkout alone.

---

## What this plan does not build

- **P11b — the console through the edge on the real platform** (Decision 3): a Caddy route for `/admin*` on `console.manifest.internal` to
  7101, above the console's catch-all; Vite's `base: '/admin/'`; `make doctor`/`make verify`'s 7101 check; `mail/team.ts`'s three links
  under `/admin`; the Docker tier. **What that costs until then:** the operator's console is a demo on the mock; the real queue on 7100 is
  still the reference console's plain panel.
- **People, Spend, Audit** (the design's §8): no API (A5, A10, A11).
- **Any owner's action** (Decision 10), **confirming an agent's question** (Decision 11), **any setting's change** (A13).
- **Every API gap the design's §10 lists** — A4, A5's remainder, A7–A9's remainders, A10–A19. Each is a finding for a platform plan, never
  worked around here.
- **The design system's documents** (the refreshed design's §9: the system's README, the vocabulary table, per-component READMEs and
  previews, the gallery) — a design session's, when the two copies are reconciled (T3).
- **Narrow screens** — 1440 desktop, as the faculty design.
- **The mockup's *Show API gaps* switch** — a mockup affordance; the console renders each gap as an admission in place.
- **Request validation for `mock-app`'s own routes** — the mock's default record routes still answer the fixture whatever is sent
  (`server.ts:656-660`); the demo fleet validates its own (C1). Changing a default branch is the faculty front-end's concern too, so it is a
  finding for the mock's next owner, not a change made here.
- **The reference console's queue headline** reads `oldestSince` (`packages/console/src/launch-records-state.ts:393-399`), so A15's trap is
  live there: a three-week wait with the Privacy Office headlines as the team's (the review's M12). Not this plan's to fix — the reference
  console is deliberately plain and outside P11's files; **named for the roadmap's tracked defects or a minors round**, the coordinator's to
  place.
- **A read of an approval request's token** (A21) — the console reads it from the project's stream, which is the only place it is.

## Spec actions — none

§26 already says what this console is, where it lives (§5), that D22's boundary binds it, which screens it has and what its queue holds;
§21 reserves its port. Nothing this plan builds changes a decision, a security property or a section's meaning. **The design document is not
the spec** (the design's decision 15) and was refreshed in the same commit set as this plan. *Checked and not raised:* §21's inventory does
not list a second mock (7113) — a development process like the console's `MANIFEST_MOCK_PORT`, stated in the RUNBOOK; §26's *"with a link to
the item in the admin console"* is true of the reference console's routes today and of `admin-ui`'s paths, which are the same.

## Contract changes — none

No operation, schema, code or event changes. **The mock changes** (Tasks 3–4) — a `packages/mock` commit, so **G3** (the third run's brief:
notices for every commit touching `packages/contract` or `packages/mock`) at L1, and again at L2/L3 only if the mock changed again. **L1's
notice names the one default answer that changes** (I7: a retry carrying `Manifest-Admin-Reason` under its first key is the replay, as on the
platform, where it was `409`) and that `fleet.ts` enters manifest-app's typecheck (M10). **Two gaps are filed in the design, not worked
round:** A20 (a granted change request is two writes) and A21 (no read of an approval request's token).

---

## What the self-review caught

*Run by the writer against the code at `977b1e7` and the refreshed design, before the commit; each fixed in place.*

1. **The parity test's cases were a placeholder** (`/* … from [M3]'s list */`) — written out from each reference's own `props.*` reads
   (`components.js:63-399`, `bundle.js`'s six) with the shapes the console will pass; `[M3]` now only adds a case the mockup renders that
   the list lacks. The same for the bands test's *"… ordering by since"* comment, now four assertions.
2. **The port could not show two things the console needs**: `EnvCell` draws no instance count and `EventLine` no actor — and a port
   that renders what its reference does not fails its own parity test. Both become reference changes (the mockup's refresh, or Task 5's
   first edit), written as such.
3. **`mock-app`'s default stage puts its own item in the queue**, with an absolute fixture date — so *"`oldestSince` is `field-notes`'"*
   could be false on the day. Restated as *an item of UBC's band, not `reading-responses`'*, with `[M2]` reading which; the demo fleet's
   first-band ages are made older than anything `mock-app` puts in our band.
4. **The mock validates no request body** (it validates answers on the way out, `server.ts:1543`) — so a rejection without a reason is
   refused by `fleet.ts` itself, in the platform's code, not by *"the validator"*. **SUPERSEDED by the review's C1**: the fleet now validates
   every request body against the operation's request schema, and *the request schema refuses it*.
5. **`${MANIFEST_MOCK_STEP_UP:+MANIFEST_MOCK_STEP_UP=1} pnpm …`** in `scripts/admin-ui.sh` is not an assignment in bash (assignments are
   recognised before expansion) — rewritten to always set the variable.
6. **The fleet-id test would have failed on purpose-chosen people** (`reading-responses`' owner is `fixtures.USER_ID`) — narrowed to ids
   `fleetId(…)` makes (T4 is about ids of things, not people).
7. **Two line references were wrong**: `vitest.workspace.ts:57-59` (it is `:51-53`) and `mail/team.ts:72` (the release link is `:63`).
8. **A thinking-aloud phrase in the demo fleet's table** (row 11: *"…-shaped? — no:"*) — rewritten as the one event it is.
9. **A decided-elsewhere case named *Operator Two***, whom the demo fleet does not have — made explicit as the reducer's synthetic case.
10. **Review Focus 1 (now 2) was not pinned in Task 8** — its *one key per action, reused on a retry; disabled in flight* case added.

**Coverage of the design, section by section:** §2 (the rail, keyboard, URLs) → Tasks 2, 5, 6; §3 (the queue, its headline, bands, rows,
kinds) → Task 6; §3.5 (the panes) → Tasks 7, 8, 10 (agents' questions); §3.6 → Task 6; §4 (`ObservedAction`, what the owner will see) →
Tasks 5, 7, 8, 10; §5 → Task 9; §6 → Task 10; §7 and §7a → Task 11; §8 → *not built*; §9 → Task 5 (and its documents *not built*); §10 →
*not built* (findings for platform plans); §11's decisions → *Decisions this plan makes*; §12 → P11b.

---

## Revised to the review — what changed, finding by finding (2026-10-14, 20:11–20:20 PDT, read from the clock)

*The review: [`2026-10-14-review-of-p11.md`](./2026-10-14-review-of-p11.md), `14cffdc`, by `manifest-p11-review`. Verdict **approve after
the fixes**. Each finding was checked against the code before it was taken (the doctor's `check_block`, the replay's two hashes, the worktree's
`.env` loading, the submission stamp, UBC's order, `incident.opened`'s required fields, `records.ts`'s four `LAUNCH_RECORD_INVALID`s); every one
holds, and every one is built in. One is made more precise, none argued.*

| Finding | What changed, and where |
|---|---|
| **C1** — no request validated; the record form omitted `recordIamRegistration`'s required fields and `environment` | Task 4: the fleet validates **every request body it acts on** against the operation's request schema (`400 REQUEST_INVALID`, one case per operation), and writes a registration **as the platform does** — `environment` production's when absent, the four fields upserted, its four `LAUNCH_RECORD_INVALID`s. Task 8: `iamAnswerBody` and `grantedChange` build the exact bodies, held by `toStrictEqual` and by the fleet refusing a wrong one. Task 12's check 6 reads the records back. Review Focus 1 (new, first). Decision 9. Fact 4, fact 12 |
| **I1** — no `.env`, no contract `dist/` in the worktree | *The worktree*: the contract built after the install and after a contract rebase; `scripts/admin-ui.sh` and `demo-admin.sh` build it; the shared `.env` read through a symlink before a landing, tried once, refused → the coordinator. `[M8]` restated (unset), `[M4]` shows the build was needed. Task 13 removes the link. Fact 19a |
| **I2** — `make doctor` reads 7101 and 7113 as foreign | Task 2: `admin_ui_is_ours` and `admin_mock_is_ours` in `doctor.sh` (constants kept there — `infra/` owes the Docker tier), `<title>Manifest operations</title>` held by `app.test.tsx`, a control. Decision 16. The walk's Chrome takes a system port (Decision 17). Fact 19b |
| **I3** — demo states the platform cannot reach | Task 3: one rule (reachable at the contract `[M1]` read; `[M9]` writes the rules) and a test reading the fleet back through the API; both sign-offs and every launched app `class`; a thirteenth project, `mus-100-listening`, tells the large-audience launch as the contract says it; the scan story moved to a stale staging release; submissions at Vancouver noon; UBC's order beside every record; `ageWords` reads a future `since` as *today* (Task 2) |
| **I4** — the pane's token and events need the stream | `src/stream.ts` moved to Task 7 with `askedThrough` (the token's NAME is `approval.requested`'s `actor.token`; its `machineDetail.viaToken` is a boolean — the review's one imprecision); the fleet's replay carries it; A21 filed in the design; Decision 18 |
| **I5** — landings race `main`; shared documents on the branch | *The race*: no re-run when `main` moved only under `docs/superpowers/` or `.superpowers/` — **`docs/api/` excluded**, because the control plane serves it and its tests read it; at most two loops before the coordinator hears. RUNBOOK and WALKTHROUGH written in the shared checkout after L3 (Task 12 Step 7a). The overlap check before every merge |
| **I6** — sitting 2 too big | **Nine sittings, nine tabs**: Task 3 alone in sitting 2; Task 4 and L1 in sitting 3; every object spread from its validated fixture; L2 may move to sitting 7's open |
| **I7** — the mock's replay drops §26's reason from its stored hash | Task 4 fixes `server.ts`'s store with a `server.test.ts` case, red first; G3's notice names the changed default; Review Focus 2 pinned in Task 10 |
| **I8** — a granted change is two writes (this writer's, confirmed and extended) | Design finding A20; Task 4's fleet re-stamps and keeps `registeredAt` as the platform does; Task 8's `grantedChange`, its keys, and a failed second write; the mockup's change-request pane offers the platform's moves (`99af8df`) |
| **M1** | Task 3: *the fleet on, `mock-app` untouched* case; control (a) predicted red there |
| **M2** | Task 10's control reads the newest release, not the serving one; `bio-201-scheduler`'s candidate raises its level |
| **M3** | The parity test counts function-valued exports; `DIFF` `satisfies Schemas['ApprovalDiff']`, with `added`/`removed` |
| **M4** | `stepUpUrl` asserted encoded, as the reference console's `auth.ts:41-42` |
| **M5** | A delegated click listener in the shell (`linkTarget`), tested; walk check 1 clicks the rail without a reload |
| **M6** | `/` replaced by `/queue` (`canonicalPath`), tested; walk check 1 |
| **M7** (part this writer's) | `transitions.ts:38-58` everywhere; `sent: []` in both tables; the parser's three shapes named and cased |
| **M8** | Task 13 Step 4: the cleanup scripts measured, the ports, Chrome and its profiles, the worktree list |
| **M9** | *The worktree*: B's two expected reds named; `[M1]` reads both |
| **M10** | L1's G3 notice says `fleet.ts` enters manifest-app's typecheck; fact 14 |
| **M11** | Task 12: `make demo-admin` a step of `ci-acceptance.sh` and the offline acceptance's step 20 |
| **M12** | *What this plan does not build*, named for the coordinator to place |
| ***For Rich*** | Decisions 2 and 3 carry the review's conditions and costs; *What Rich does* 3 says he reads them there |

**Counts after the revision:** thirteen tasks in **nine sittings**; three landings; no contract change, no spec action, no Docker tier.

---

## What executing this plan found

*One dated section per sitting: the tasks, every defect with the measurement that found it, the negative controls, the gate numbers at the
end, and the machine.*

### Sitting 1 — Tasks 1 and 2: the measurements, the worktree and the skeleton (2026-10-15, `manifest-p11-s1`)

**Who and when.** `manifest-p11-s1`, the third coordinated run's P11 build, sitting 1, GOed by `manifest-coord5` at ~09:10 PDT (Rich's
approval `ab6c7b7a`; `3011e11` and `bdfc6f2` before it), inline (`superpowers:executing-plans`). **Under HOLD until 09:31:18** (GT3's
Docker tier at 6 CPUs): reading, the worktree, the sub-second `node:vm` render, and the code written. **FREE from 09:31:18, during
Rich's Zoom call — light steps only** (no Docker build, nothing on 7100). The ledger is `.superpowers/sdd/2026-10-14-p11-admin-console/progress.md`.

**Task 1 — the measurements** ([`spikes/p11-baseline/`](../spikes/p11-baseline/README.md), `7fd25e4` on `main`). Every Expected met:
`[M1]` `1.9.0`, 76 operations — *Read this first* 1–9 confirmed, `incident.opened` without `cause` and `load-rehearsal` still `not_built`
(M9's two reds, still to come with B); `[M2]` the mock's facts 10–14 within three lines, manifest-app (`fd22aed`) importing only
`createMockServer` and `fixtures` and naming no `MANIFEST_MOCK_FLEET`, 7101 or 7113; `[M3]` all four mockup screens and every export
rendered under React 19.3.0 in one `node:vm` context (`Tags` and `DiffView` alone need props), Task 5's *"two reference changes … ARE
MADE"* confirmed, and Vite 8.3.0 inlining an `@import` from outside its root and answering a deep path with `index.html` in `dev`, `build`
and `preview`; `[M4]` **the worktree `/Users/rich/Developer/manifest-p11` on `p11-admin-ui` at `2c9fc47`** (09:13), installed offline in
4.19 s with nothing downloaded, and the contract's `dist/` shown to be needed (`ERR_MODULE_NOT_FOUND` before the build, loaded after);
`[M5]` 7101 and 7113 free, 7113 named nowhere — **kept**; `[M6]` a `.test.tsx` under the new `admin-ui` project, 1 passed (Vitest 2.1.9's
own Vite 5.4.21 transforms it from the package's `jsx: react-jsx`); `[M7]` no Docker tier owed, `EXPECT_` 3691 / 224 / 22 / 67; `[M8]`
the unit project cannot run in the worktree without `.env` — **and the shared `.env` symlink is allowed**: made once at 09:25:28 at the
coordinator's word, readable, git-ignored, removed at once, never read (the GO had first said *"only for a landing"*; the coordinator
corrected it to the plan's order); `[M9]` six rules the demo fleet must obey at `1.9.0` — only a `class` app launches; a fixable finding
lives only on a stale staging scan; UBC's order (the assessment approved WITH its reference; production after staging is `active`); a
submission stamped at Vancouver noon; a granted change in two writes; what a record write requires.

**Task 2 — the skeleton** (`c2cb418` on `p11-admin-ui`). `packages/admin-ui` (React 19.3.0 / Vite 8.3.0 / `@vitejs/plugin-react` 6.1.1,
the console's pins; `strictPort` 7101; `/v1` and `/auth` to the mock on 7113 under `MANIFEST_MOCK=1`); `src/api.ts` with the 28 operations
*Read this first* 1–8 names (`getApproval`'s `404 NOT_FOUND` alone answered `null`); `src/router.ts` (Decision 13's paths, `canonicalPath`,
`navigate`, `useRoute`, `linkTarget`); `src/time.ts`; `src/refusal.tsx`; `src/auth.ts`; `src/screens/not-admin.tsx`; `src/app.tsx` (the
gate, the rail as plain markup, each screen a placeholder heading, ONE delegated click listener); `index.html` titled *Manifest
operations*; the `admin-ui` Vitest project in `vitest.workspace.ts` and `pnpm test`'s script; the lint block; `scripts/admin-ui.sh` and
`make admin-ui`; `doctor.sh`'s `admin_ui_is_ours` and `admin_mock_is_ours`. **RED first, as predicted**: all six files red (four missing
modules; the boundary scanner reading nothing, three of four; the script not naming the project) — **then GREEN, 6 files, 42 tests**.

**Rulings** (the ledger has each with its cost):
- **The `/auth/login` round trip lives in `src/auth.ts`**, not inline in `app.tsx` as Step 3 writes it: the boundary test, copied whole from
  the console's, lets only `auth.ts` name an `/auth/` path. Its positive control reads `> 0` (one round trip) where the console's reads
  `> 1`; **Task 7's `stepUpUrl` belongs in `auth.ts` too**, and raises it.
- **`gateOf` has a fourth answer, `'refused'`** — any refusal but `401 UNAUTHENTICATED`, or a non-API error — rendered by `<Refusal>`: Step 1
  names three, and a `500` must be neither a sign-in loop nor a blank page.

**Findings:**

**F1 Control (b)'s predicted lint-red stays GREEN — the plan's prediction was wrong, not the rule.** `import '../../console/src/api'` in
`app.tsx`: the boundary test went red (`app.tsx: ../../console/src/api`); `eslint` exited 0. The copied regex exempts every relative
specifier, as the console's own block says (`eslint.config.js:96`: *"a regex over a specifier cannot tell `../api` from
`../../control-plane/…`"*). **(b′)** `import '@manifest/mock'` → lint red (`no-restricted-imports`, this console's message) AND the test red.
Recorded; no change — the test is the half that resolves a path.

**F2 `scripts/admin-ui.sh` started with `&` by a non-interactive shell IGNORES SIGINT, so its INT trap never runs.** Bash sets SIGINT to
ignored for an asynchronous command when job control is off, and a signal ignored on entry cannot be trapped: `kill -INT` left the
harness waiting past the tool's 300 s. **TERM is trapped** (measured: both ports freed, the script gone), and **a terminal's Ctrl-C works**
(simulated under `set -m`, SIGINT to the script's process group: exit 130, both ports free). **For Task 12:** `scripts/demo-admin.sh` must
stop it with TERM, or start it under `set -m`.

**F3 `make doctor` run IN THE WORKTREE reads `22 checks, 3 failed, 1 warnings`** — `.env`, `infra/ca/manifest-root.crt` and
`infra/registry-auth/token.key` are git-ignored and exist only in the shared checkout. Only its ports line is the worktree's to read (control
(d)); the doctor that counts is the shared checkout's, after a landing brings `doctor.sh`'s change there.

**The negative controls (Step 4), all seen:** (a) the script without `--project admin-ui` → `workspace.test.ts` red, naming the script;
(b) F1; (c) `bash scripts/admin-ui.sh`: `/queue` → `index.html` `200`; `/v1/me` `401 UNAUTHENTICATED`, and with the mock's session `200`
`role: admin`; `/v1/queue` `200`; `/auth/login?returnTo=%2Ffleet` → `302` to `/fleet`; Ctrl-C → both ports free (F2); (d) `make doctor`
with both up → the ports line PASSES naming 7101 and 7113 among Manifest's own; a `python3 -m http.server` on 7113 → **`CLAIMED BY
SOMETHING ELSE: 7113`**; `admin_ui_is_ours` forced to `return 1` → **`CLAIMED BY SOMETHING ELSE: 7101`**; each restored by `git
checkout` from the commit (doctor 7.6 s a run).

**The gates, on the final branch tree `c2cb418`:** `pnpm exec vitest run --project admin-ui --project packages` **twice, identical — 38
files, 347 passed** (the `admin-ui` project 6 files / 42 tests), 36.8 s and 37.1 s, load 3.7–4.8; `pnpm lint`, `pnpm typecheck` (seven
packages, `admin-ui` among them) and `pnpm format:check` clean. The `unit` project not run (the plan's rule). **For L1's `EXPECT_` lines:**
`pnpm test` gains the `admin-ui` project — 6 files and 42 tests so far, before Tasks 3–4.

**The machine:** 7101 and 7113 free at the close, no stray process; nothing of 7100's touched; no Docker resource made. The three
cleanup scripts bare: `dead-app-resources.sh` and `app-images.sh` *"Nothing was changed. 0 … dead"*; `litellm-orphans.sh` exit 1,
*"/user/list answered no users at all, which is not a state this machine reaches"* — 7100's lane's to read, told to the coordinator.
**The worktree stays** (node_modules, the contract's `dist/`), for sitting 2, on `p11-admin-ui` at `c2cb418` — **behind `main` by
documents only**: GT3's close (`d2e2d77`, `2dc2024`), this sitting's baseline (`7fd25e4`) and its close-out. Sitting 2 opens with the
rebase (*The worktree*).
