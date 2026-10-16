# P11b — The Administrator's Console Through the Edge, on the Real Platform — Implementation Plan

> **WRITTEN 2026-10-16, ~15:50–16:00 PDT (read from the clock), BY `manifest-p11b-plan`** (`531434b2`) — the fourth coordinated run's job
> P11BP (coordinator `manifest-coord6`), at Rich's word: P11b's plan is one of the four sets he set up at ~15:10 (`4cb1f2c9`,
> `docs/superpowers/2026-09-30-decisions.md`, the entry *"On 2026-10-16 at ~15:10 PDT … THE FOURTH COORDINATED RUN"*). **Every fact in
> *Read this first* was read from the code at manifest `4cb1f2c9`** (contract `1.10.0`, 79 operations; P11 EXECUTED `ed594b67`, B
> EXECUTED `62803b47`) and re-checked at `2c47ba24` for the revision. Documents only: nothing was run against 7100 or the edge to write it.
>
> **REVISED 2026-10-16, ~16:25–16:50 PDT, TO ITS FRESH REVIEW** — [`2026-10-16-review-of-p11b-plan.md`](./2026-10-16-review-of-p11b-plan.md)
> (`2c47ba24`, `manifest-review4`, the fourth run's REV4; verdict **approve with fixes**: 2 Critical, 2 Important, 11 Minor). **Every finding
> was checked against the code before it was taken, and every one holds; all fifteen are taken, none argued** (*Revised to the review*, near
> the end, says where each went). **What changed most:** the team's links have **two more readers** the plan now changes and runs
> (`launch/records.test.ts`, `make demo-launch`'s step 6 — C1); **the acceptance lands before it is run** — Task 4 has its own landing, and
> every live run and control is in the shared checkout (C2) — so **SEVEN SITTINGS AND THREE LANDINGS**; the seed's slugs are ones
> `demo-launch` accepts (I1); and **`make ci-acceptance` runs whole once** on the final tree (I2).
>
> **STATUS: WRITTEN AND REVIEWED — NOT APPROVED, NOT STARTED.** **Its build waits for Rich's approval** (G8). **Rich's click-6 question**
> (*"why would we not keep a reason for handing it back to help the person out?"*) is **not planned in**: it is drafted as an option with its
> cost (*Rich's click-6 question — an option*), for him to decide.

> **For agentic workers:** REQUIRED SUB-SKILL: **superpowers:executing-plans, inline** (Rich's standing yes (d), `bdfc6f2`: *"inline
> execution, one sitting per session"*). Steps use checkbox (`- [ ]`) syntax for tracking. **THE CODE IS BUILT ON A WORKTREE BRANCH AND
> FAST-FORWARD MERGED, AS P11 WAS** (`3011e11`; the fourth run's G8) — **BUT THE EDGE, 7100 AND EVERY LIVE RUN ARE ONLY EVER TOUCHED FROM
> THE SHARED CHECKOUT**, after a landing (*How this plan is to be executed* says why). **Never the worktree tools**
> (`EnterWorktree`/`ExitWorktree`): keep the session in the shared checkout, edit by absolute path inside the worktree, and run git and the
> tests there by `cd`.

**Goal:** **An operator opens `https://console.manifest.internal/admin/`, signs in with CWL, and works the platform's REAL queue** — the
releases waiting for sign-off, the launch records the owners sent to the team, the fleet, a project's page, Health and Settings, read from
7100 — in the console Rich clicked on the mock on 2026-10-16; **the step-up goes through the laptop IdP and lands back on the same pane**;
and **the Manifest team's emails link there**. Today `packages/admin-ui` runs only against its mock's demo fleet on 7101, and the real
queue's only screen is the reference console's plain panel.

It is proved by **`make demo-admin-edge`** — the launch path's own first four steps put a real release-approval and a real sent privacy
assessment on 7100, and the console is walked headless in Chrome THROUGH THE EDGE, signed in at the IdP as `operator`, eleven checks each
asserting a shape — and **by Rich clicking it**.

**Architecture:**
- **A path on the console's origin, not a new origin** — `/admin/`, served from 7101 by **one static run of lines in the Caddyfile's
  `console.manifest.internal` site**, between the API's `@api` route and the reference console's catch-all, inside the site's `@outside`
  guard. Same origin as the API and the reference console, so the session cookie (`__Host-`, `Path=/`), §20's CSRF origin and the SAML
  return are the ones the reference console already uses: **no control-plane change for sign-in, step-up or CSRF** (*Read this first*
  14–16). The faculty front-end's origin (`app.`) gets no such route.
- **`packages/admin-ui` under a base path**: `BASE = '/admin'` in one module (`src/base.ts`), Vite's `base`, and the router reading and
  writing every path under it — **in every mode**, the mock's demo included, so the demo's URLs are the platform's.
- **7101 is the platform's admin UI** (§21's row), served by `vite preview` of a build of its own (`.manifest/admin-ui-edge/dist`), started
  by `make admin-ui-edge`, and **left running like the reference console's 7104**. The demo pair moves off it — **its mock to 7114, its
  console to 7115** — because BYOA's approved plan owns 7113 and because the demo's acceptance refuses to start while its console's port is
  held.
- **The team's email** (`mail/team.ts`) links under `/admin`, moved in the same landing as the route, **with the two readers that assert
  those links** (`launch/records.test.ts`, `make demo-launch`'s step 6).
- **The project's page gains *Load rehearsals*** (B's `1.10.0`; P11's Task 10 named it), and the demo fleet answers each project's own.
- **No contract change. No spec change** (one spec action is DRAFTED — §21's row says where the admin UI is served).

**Tech Stack:** TypeScript 5.9.3 on Node 24.12.0; React and react-dom 19.3.0; Vite 8.3.0 with `@vitejs/plugin-react` 6.1.1 (all as P11
pinned them, `packages/admin-ui/package.json`); Caddy 2.11.4 (`manifest-caddy:local`, the xcaddy build); Vitest 2.1.9; Google Chrome
headless over raw CDP (Node 24's global `WebSocket`, no library); bash 3.2 and a BSD userland (macOS 26.7.1). **No new dependency.**

**Spec:** [`../specs/2026-08-29-manifest-platform-design.md`](../specs/2026-08-29-manifest-platform-design.md) — **§21** (the inventory's
*Admin UI (Vite) | 7101 | Host process*, l.2243; *The front-end in the local topology*, l.2298–2318: the reference console and the API
share one origin), **§26** (the queue; *"a link to the item in the admin console"*, l.3043; *Non-repudiation*), **§12** (*Edge*: static
sites and runtime routes, l.1333–1370; the control plane's paths refused to app networks, l.1367–1368), **§20** (the front door: CSRF, the
session, step-up). **Design:** [`../2026-09-27-admin-console-design.md`](../2026-09-27-admin-console-design.md) — its §11 decision 25
(*"Built against the mock; served through the edge on the real platform by a later plan (P11b)"*) and §12 (*"a path on the console's origin
(`/admin/…`, served from 7101 by a Caddy route above the console's catch-all) needs no new origin, no CSRF change and no SAML change"*).

**Roadmap:** P11's row; P11b's own section. **Placed by Rich as the fourth run's documents lane** (`4cb1f2c9`); its build is the fifth run's,
beside FE-32's sittings 2–5, at his approval (G8).

**Predecessor:** P11 (EXECUTED `ed594b67`; `packages/admin-ui` on `main` since `c64f067d`). **It builds beside FE-32** (approved
`933bdfa`), which takes the contract to `1.11.0` at its Task 3 — P11b changes no contract, so the two meet only in the test counts, the
`EXPECT_` lines and the 7100 windows.
**Successor:** none in its lane. Rich's click-6 question, if he chooses to keep a reason, is a conditional sitting here or a small plan of
its own (*the option*).

---

## How this plan is to be executed — sittings, one per session, on a worktree branch, every live run from the shared checkout

> **SEVEN SITTINGS, PROPOSED — SEVEN TABS, `manifest-p11b-s1` … `manifest-p11b-s7`, which Rich opens at his approval** (the fourth run's
> brief: *"P11b's build tabs are asked of him when he approves its plan"*). Six before the review, which found the acceptance run before it
> landed (C2): Task 4 now lands at its own L2, and its runs and controls are a sitting of their own. Inline, one fresh session per sitting.
> Task 1 is first; the base path before the route that serves it; the route before the walk that walks it; the walk landed before it is
> run; the review after all code; `make ci-acceptance` whole and Rich's click alone and last (G9).

| Sitting | Tasks | What it delivers | Lands on `main`? (a 7100 window) | Where it stops | Status |
|---|---|---|---|---|---|
| 1 | 1 | **The measurements and the worktree**: every fact re-read; Vite 8.3.0 under a base, in dev and preview, behind a throwaway Caddy; the walk's imports under Node 24; the platform's build in its own `outDir`; the ports; the edge as it is; the seed's queue, slug and emails; every reader of the team's links; the mock's load rehearsals for a fleet project | No (the baseline is a document on `main`) | After Task 1's commit | ← **next, once Rich approves** |
| 2 | 2 | **The base path and the demo's own ports**: `/admin/` everywhere, the router and the step-up's return under it; the demo on 7114/7115; `make doctor` asking `/admin/`; `scripts/admin-ui.sh`'s stop bounded; `make demo-admin` green on the new ports | No | After Task 2's commit | |
| 3 | 3 | **The edge**: the Caddyfile's `/admin` run, `make verify`'s new check and its parity check taught the one exception, the team's email links **and their two other readers**, the agreement test, `make admin-ui-edge`. **LANDING 1** — then, **from the shared checkout**, `make up`, 7100 restarted, `make doctor`, `make verify`, the console through the edge, **`make demo-launch` through step 6 on a control slug**, the port lines in RUNBOOK, WALKTHROUGH, ORIENTATION and TRAPS | **Yes — L1** | After L1's merge, the live checks and the documents' port lines, read back | |
| 4 | 4 (Steps 0–5) | **The Docker tier L1's `infra/` change owes** (once, in the background, under HOLD) while **the acceptance's headless half** is written in the worktree — `make demo-admin-edge`, the seed, the walk, its steps in both acceptances — then its gates and **LANDING 2** (no `packages/mock` file, so no G3) | **Yes — L2** | After L2's merge, read back | |
| 5 | 4 (Steps 6–8) | **The acceptance, run — from the shared checkout**: three runs on driver 1 and one on the fake; **its controls, each a landed file broken in the shared checkout inside the window, never committed, restored**; any defect the runs find fixed on the branch, test-first, for L3 | No (a fix lands at L3) | After the runs and controls are recorded | |
| 6 | 5, 6 | ***Load rehearsals*** on the project's page and the demo fleet's runs (Task 5, **G3**); **the plan's one whole-branch review and its fix wave**; **LANDING 3**; both acceptances from the shared checkout; RUNBOOK, WALKTHROUGH and the design in the shared checkout | **Yes — L3** | After L3's merge and the documents, read back. **If it overflows, L3 moves to sitting 7's open** | |
| 7 | 7 | **`make ci-acceptance` whole, once, on driver 1** (it truncates 7100, so before the click's seed); then **Rich clicks it** (G9, at the machine) on 7100's real queue through the edge; his words recorded; the close-out; the worktree removed; the machine as found | Documents only (in the shared checkout) | After the close-out commit | |

**THE WORKTREE** (Task 1 creates it; sittings 2–6 write code in it):

```bash
git -C /Users/rich/Developer/manifest worktree add -b p11b-admin-edge /Users/rich/Developer/manifest-p11b main
cd /Users/rich/Developer/manifest-p11b && pnpm install --offline --frozen-lockfile
pnpm --filter @manifest/contract build      # dist/ is git-ignored; @manifest/contract's runtime export is ./dist/index.js (P11's I1)
```

- **Every sitting opens with `git -C /Users/rich/Developer/manifest-p11b rebase main`** (FE-32's sittings commit on `main` throughout, its
  sitting 3 in `packages/contract` and `packages/mock`); the contract's `dist/` is rebuilt after a rebase that brings a contract change; a
  conflict is resolved in the worktree, keeping both sides, and named in the sitting's record.
- **Edit by absolute path inside `/Users/rich/Developer/manifest-p11b/…`**; run git, the tests and Prettier there by `cd`. A file in the
  shared checkout is never this plan's until a landing — except the plan's own record (this file, the baseline, the roadmap,
  ORIENTATION), the documents' port lines after L1 (Task 3 Step 8), RUNBOOK, WALKTHROUGH and the design after L3, which a sitting edits
  **in the shared checkout** and commits there by pathspec, documents only — **and a live control's break** (below), which is never
  committed.
- **The worktree has no `.env`**; before a landing's whole-suite run it reads the shared one through a symlink, never a copy and never
  printed: `ln -s /Users/rich/Developer/manifest/.env /Users/rich/Developer/manifest-p11b/.env` (git-ignored). Tried once; a refusal goes
  to the coordinator with the exact command. Task 7 removes the link. **Nothing else is linked** — the worktree also lacks the git-ignored
  `infra/ca/` and `infra/secrets/` (`.gitignore:37`, `:48`) and the shared checkout's `.manifest/`, which is why nothing live runs there.

**EVERY LIVE RUN IS FROM THE SHARED CHECKOUT** (*Read this first* 3). `manifest-caddy` bind-mounts
`/Users/rich/Developer/manifest/infra/caddy/Caddyfile` by absolute path, and `make up`'s compose command recreates **every** service with a
relative single-file mount (the edge's, the IdP's, LiteLLM's) on the paths of the tree it runs in. So a Caddyfile edit on the branch changes
nothing the edge serves until a landing's merge puts it in the shared checkout; **a `make up`, a `docker compose …` or a `pnpm test:docker`
from the worktree could move the platform's mounts onto the worktree, which `git worktree remove` would then delete from under them**; and
the seed needs `infra/ca/manifest-root.crt` (`demo-launch.sh:63`) and, on the fake, `infra/secrets/github-fake-developer.token`, which only
the shared checkout has; and 7101's pid file is the shared checkout's `.manifest/`. **None of `make up`, `docker compose`, `pnpm test:docker`,
`make verify`, `make demo-*` or `admin-ui-edge.sh` is ever run in the worktree.** Every live edge check, `make verify`, the Docker tier, both
acceptances and every live control run from the shared checkout, after a landing.

**THE LIVE CONTROLS** (C2). A negative control that needs the running platform **breaks a LANDED file in the shared checkout, inside the
coordinator's 7100 window and HOLD, and never commits it**: predicted first; the break kept type-check-clean (a broken `tsc` in the shared
checkout kept 7100 down for a peer — B's sitting 3, F1); the code rebuilt and the process restarted that serves it (`make admin-ui-edge` for
`admin-ui`, `bash scripts/gateway-controls.sh start local` for the control plane, `make up` for the Caddyfile); read red; **restored with
`git checkout -- <path>`** and the same rebuild or restart; **`git status --short` read clean of it** before the next. A Caddyfile break goes
through `make up` (the single-file mount's re-bind restart, `ensure-caddy-config.sh:43-58`) and a 7100 restart both ways. A unit-level
control breaks the branch's file in the worktree, as P11's did.

**THE GATES, BY SITTING.** The tree a sitting changes is `packages/admin-ui`, `packages/mock/src/fleet*.ts` (Task 5 only),
`packages/control-plane/src/mail/team*.ts` and **one assertion of `launch/records.test.ts`** (Task 3 only), **`packages/journey/src/launch.ts`'s
step-6 check** (Task 3 only), `infra/caddy/Caddyfile`, `infra/lib/common.sh`, `scripts/`, the `Makefile` and docs. So:

- **A sitting that does not land** runs, in the worktree and under the coordinator's FREE: `pnpm exec vitest run --project admin-ui
  --project packages` **twice** (no global setup: nothing truncated, 7100 untouched), `pnpm lint`, `pnpm typecheck`, `pnpm format:check`.
  `mail/team.test.ts` runs alone from a scratch Vitest config with no global setup (the memory *DB-free test files without truncation*);
  **`launch/records.test.ts` is a database file** — its changed line runs first in L1's `pnpm test`, never in the worktree before it.
- **A landing** (L1, L2, L3) asks the coordinator for **"7100 is yours"** and HOLD, then, in the worktree on the rebased branch with the
  `.env` symlink: **`pnpm test` twice** (through `scripts/test-gently.sh`; it truncates 7100's tables) and the other three gates; moves
  `scripts/ci-acceptance.sh`'s `EXPECT_` lines to what it measured **in the branch's landing commit**; for L3 sends **G3's notice**
  (`packages/mock` changes) and waits for *"land it"*; then from the shared checkout, exactly P11's sequence:

  ```bash
  cd /Users/rich/Developer/manifest
  TESTED=<the main sha the branch was rebased onto for the run>
  git status --short                                  # account for every path; a peer's uncommitted file is left alone
  git diff --name-only main...p11b-admin-edge         # an overlap with `git status --short` is a peer's edit — tell the coordinator, wait
  git merge --ff-only p11b-admin-edge                 # refuses if main moved since the rebase — THE RACE, below
  pnpm install --offline --frozen-lockfile
  pnpm typecheck
  git log --oneline -1                                # the sha reported to the coordinator
  ```

  then the landing's live steps (Task 3 Step 7 for L1, Task 4 Step 5 for L2, Task 6 Step 4 for L3), then **G4** (7100 restarted from `.env`
  — `bash scripts/gateway-controls.sh start real` — the boot line, one call proving `gpt-6.1-sol` answers with no fallback) before 7100 is
  given back.
- **THE RACE** (P11's I5 (a), unchanged): when `--ff-only` refuses, rebase onto the new `main` and read `git diff --name-only
  $TESTED..main` — if every path is under `docs/superpowers/` or `.superpowers/`, merge without re-running and record the paths;
  otherwise `pnpm test` twice on the new tree. At most two loops before the coordinator hears.
- **`pnpm test:docker` is owed ONCE**, by L1's `infra/` change (CLAUDE.md's list), run at sitting 4's open from the shared checkout under
  **"7100 is yours" and HOLD** — never beside a Vitest run, 7100 stopped (its set watcher, ORIENTATION §4's trap 7). L2 and L3 owe it again
  only if their changes touch `infra/` or a file in the list.

**EVERY SITTING ENDS THE SAME WAY** — its gates; a dated *What executing this plan found*; this table; the roadmap's P11b section;
ORIENTATION §7e only if the coordinator gives that turn (§7e names the platform lane's job, and P11b is a parallel lane); the report to
the coordinator, each commit's sha and a line. **Two rules survive any re-cut:** Task 1 first; Task 7 alone and last, with Rich.

---

## Decided by Rich — build them, do not re-open them

- **P11b is planned now, documents only, and reviewed before he approves it** (2026-10-16 ~15:10, `4cb1f2c9`): one of the fourth run's
  four sets; his click-6 question *"drafted in it as an option"*. Its build tabs are asked of him at approval (G8).
- **Serving the console through the edge was deferred from P11 to this plan, and `make doctor`'s ownership check was built in P11**
  (P11's Decision 3, approved with it 2026-10-15 ~08:54, `ab6c7b7a`; *"both decisions stand"* at his click, 2026-10-16 09:38).
- **The console's look and its decisions are his of 2026-09-27 and P11's** (the rail; no time on the Queue item; `radius-sm` filters;
  striped long tables; Settings read-only) — P11b changes no screen but the project page's new section, and draws it with P11's ported
  components.
- **The standing yeses** (`bdfc6f2`): inline execution, one sitting per session; the refresh of the vulnerability database when stale.
  **The laptop IdP's test passwords may be typed by an agent** (2026-10-03) — the walk types `operator` and `instructor`.
- **His delegation** (`6c9949a`): routine questions settled and recorded (*Decisions this plan makes* — the third landing among them, C2);
  spec changes, host changes and anything irreversible are his.
- **Carried, still binding:** D22 and D31 (one public API; the console imports only the contract); every refusal asserted by its code;
  G3's notice before a `packages/contract` or `packages/mock` commit lands; a classifier refusal goes to the coordinator, never round.

---

## What Rich does, and when

1. **Approve this plan** (G8) — the coordinator puts it to him with REV4's verdict and the seven tabs. **Two things are his to answer with
   it:** (i) **Spec action A**'s words (§21 says where the admin UI is served; REV4: *"(a), apply as worded"*) — or *"at sitting 3's
   open"*; (ii) **his click-6 question** — keep a hand-back's reason (option (a) or (b)), not now (c), or later (*the option*; REV4 concurs
   with (a), as a small plan of its own). Every other choice here, the third landing included, is recorded under his delegation.
2. **Open the seven tabs** (`manifest-p11b-s1` … `-s7`) when he approves.
3. **Sitting 7, at the machine (G9): click it.** After `make ci-acceptance` has run, the sitting seeds a real app's queue on 7100 and gives
   him <https://console.manifest.internal/admin/> — sign in as **`operator` / `operator`**: read the queue's headline and both bands, the
   project's two items in ours; open the release asked through the agent's token, take the preview, give a reason, **approve it — the
   step-up at the IdP and back to the same pane, the reason still there**; submit the privacy assessment with a reference and watch it move
   to UBC's band; record the Privacy Office's answer; open **Mailpit** (<http://127.0.0.1:7112>) and follow the team's emailed links — each
   lands in this console; the fleet; the project's page with his own approval in its events; Health and Settings; sign out. Say what is wrong
   with it. **His words are the clicked half.**
4. **Later, his own offline run** (CLAUDE.md, *Outstanding*): `scripts/offline-acceptance.sh` gains **step 22**, `make demo-admin-edge`.

---

## Read this first — what this plan knows from the code

*Read at manifest `4cb1f2c9` (2026-10-16, ~15:40 PDT), contract `1.10.0` (79 operations), and re-checked at `2c47ba24` (no code changed
between). Line numbers are those commits'. Task 1 re-reads every one.*

**The edge.**

1. **The console's site** (`infra/caddy/Caddyfile:51-107`) is ONE `route` block: `@outside not remote_ip 10.89.0.1/32` answered `403`
   first (`:64-65`); `@api path /v1/* /auth/*` to `host.docker.internal:7100` with `stream_close_delay 1h` (`:68-79`); then the reference
   console's catch-all, `reverse_proxy host.docker.internal:7104 { stream_close_delay 1h }` (`:103-105`) — **so today `/admin/` is
   answered by the reference console's SPA**. The comments say why each line is where it is: a handler must be **inside `route`, below
   `@api`** (`:49-50`, `:85-86`); the edge **does no SPA fallback and preserves `Host: console.manifest.internal`**, so the upstream owes
   both (`:92-94`); `vite dev`'s HMR socket needs `stream_close_delay` or every config reload reloads the page (`:96-102`). **`app.`'s
   site** (`:124-151`) is the console's with its non-API upstream `7105`. Runtime routes are PUT at `srv0`'s `routes/0`, host-matched
   (`routing/caddy.ts:451`), so a static path inside the console's site cannot collide with them.
2. **A Caddyfile edit reaches the edge through `make up`** (`Makefile:42-55` → `infra/lib/ensure-caddy-config.sh`): a reload conditional
   on the file's hash (`:60-64`), or a restart when the single-file bind mount went stale (`:43-58`) — **a merge that replaces the file's
   inode takes the restart**. **Either drops every runtime route**, so the control plane is restarted after it (RUNBOOK l.102-105), which
   re-applies them at boot (§12).
3. **The edge reads the SHARED checkout's file**: `docker inspect manifest-caddy` → `/Users/rich/Developer/manifest/infra/caddy/Caddyfile
   -> /etc/caddy/Caddyfile` (measured 2026-10-16 ~15:44, read only), from `infra/compose.yaml:109`'s relative `./caddy/Caddyfile` and
   `Makefile:17`'s `docker compose -f infra/compose.yaml -p manifest`. **A worktree's Caddyfile is not what the edge serves**, and a compose
   command run from a worktree would re-point every relative single-file mount at it.
4. **`make verify` holds the console's site three ways** (`scripts/verify.sh`): `console_serves_host` (`:1008-1020`) reads `/` and
   passes on `[502]` (nothing on 7104) or the reference console's document; `console_refuses_platform_container` (`:1023-1031`) asks
   `/v1/me` from a container on the platform network and wants the `403` body; **`app_site_is_the_consoles` (`:1074-1097`) strips comments
   and compares the two sites DIRECTIVE BY DIRECTIVE, failing unless they have the same number of directives and exactly one differs —
   the non-API upstream, `7104` → `7105`**; its awk ends a site only at a column-0 `}`. **A run added to the console's site alone turns it
   red** — P11b must teach it the one exception by name. The edge's admin API is published on `127.0.0.1:7119` (`Caddyfile:2-4`,
   `common.sh:88`).
5. **`make doctor` asks each host process who it is** (`scripts/doctor.sh:169-228`): `admin_ui_is_ours` (`:219-224`) reads
   `http://127.0.0.1:7101/` for `id="root"` and `<title>Manifest operations</title>`; `console_is_ours` (`:180-185`) reads 7104 for
   `<title>Manifest</title>`; `admin_mock_is_ours` (`:225-228`) asks 7113's undeclared path for `manifest-mock`; both admin ports are local
   constants (`:217-218`), *"a development process's ports, not the platform's"*. `PORT_CONSOLE=7104`, `PORT_MOCK=7102` and
   `PORT_FRONTEND=7105` are in `infra/lib/common.sh:75-82`, which `doctor.sh:10` and `verify.sh:7` source. **The gate numbers** are
   `scripts/ci-acceptance.sh:378-390` — read them there, never here.

**The ports.**

6. **7113 IS BYOA'S.** The BYOA plan (approved `2b3dd6d`, 2026-10-13) puts its MCP server on 7113 (`plans/2026-10-13-byoa-on-the-laptop.md`,
   its fact 15 and Decision 18), and Rich approved 7113 by name among its departures; its Task 8 adds `@mcp path /mcp` and a `reverse_proxy`
   to 7113 to **both** sites, between `@api` and the catch-all. **P11 took 7113 for the console's own mock the next day** (its Decision 14;
   `scripts/admin-ui.sh:19`, `scripts/demo-admin.sh:27`, `doctor.sh:218`) — its `[M5]` grepped `infra`, `scripts`, the `Makefile`, RUNBOOK
   and the spec, not the plans. **A dated note at BYOA's top says so** (`6e4837a6`). **7114 and 7115 are named nowhere** (grep across
   manifest's docs, infra, scripts, Makefile and packages, and manifest-app's tracked files, 2026-10-16 ~15:45; re-checked by REV4) and
   nothing listens on either.
7. **Both of P11's scripts refuse to start while 7101 or 7113 listens** (`admin-ui.sh:21-26`, `demo-admin.sh:30-35`), and `make demo-admin`
   is `make ci-acceptance`'s step 13 (`ci-acceptance.sh:649`, as a FAIL). **So a platform-mode console left running on 7101 would turn
   step 13 red** for as long as it runs. And **`make demo-admin` builds into `packages/admin-ui/dist/`** (`demo-admin.sh:46`; Vite empties
   it first) — the directory a platform build would be served from, if it shared it (`.gitignore:9` ignores `dist/`; `.manifest/` is
   ignored at `:34`).

**The console (`packages/admin-ui`).**

8. **`vite.config.ts:18-32` has no `base`, no `allowedHosts` and no `hmr`**; 7101 in both modes; under `MANIFEST_MOCK=1` it proxies `/v1`
   (with `ws: true`) and `/auth` to the mock on `MANIFEST_MOCK_PORT` (default 7113); unset, *"IS P11b's CASE AND IS NOT SERVED YET"*
   (`:14-16`). The reference console's (`packages/console/vite.config.ts:36-38`, `:98`, `:104-107`, `:118`) carries `allowedHosts:
   ['console.manifest.internal', 'app.manifest.internal']` — *"Without this line the console is a blank page and the reason is in Vite's
   terminal"* — and `hmr: { protocol: 'wss', host: CONSOLE_HOST, clientPort: 443 }` behind the edge.
9. **The router is base-unaware** (`src/router.ts`): `parseRoute` (`:51-93`) reads `/queue…`, `/releases/<id>/approval`,
   `/projects/<id>[/records]`, `/fleet`, `/health`, `/settings`, and anything else as the queue; `routePath` (`:96-117`) writes them;
   `canonicalPath` (`:124-126`) is `routePath(parseRoute(p))`, and **the shell's first effect `replaceState`s the address to it**
   (`app.tsx:48-52`); `linkTarget` (`:177-203`) keeps a click in the app only when `routePath(parseRoute(path)) === path`; `useRoute` reads
   `window.location.pathname + search` (`:141-151`). **Every in-app link is a `routePath`** (the rail, `app.tsx:90-108`; the tables) —
   `grep` finds no other hard-coded screen path in `src/` but `auth.ts:63`'s (two comments name the email's path: `router.ts:6-7`,
   `screens/record-pane.tsx:1107`, `:1132`).
10. **`src/auth.ts`**: `signIn(returnTo)` (`:15-17`) is called with `window.location.pathname + window.location.search` (`app.tsx:65`) — the
    base comes with it; **`stepUpUrl` hard-codes `'/releases/' + releaseId + '/approval?preview=' + previewId`** (`:60-65`) — the one return
    path that would land outside the base; `signOut` posts `/auth/logout` and follows `redirectTo` (`:29-51`).
11. **Every call is `${origin}/v1/…` with `origin = window.location.origin`** (`app.tsx:45`, `src/api.ts:22`), and the project's stream the
    same (`src/stream.ts:41`) — through the edge, `/v1` is the `@api` route's, so the console reaches 7100 with no proxy of its own.
12. **The walk** (`walk/walk.ts`, 852 lines): Chrome over raw CDP — `send` with a 30-second bound (`:122-139`), one page per walk
    (`:141-157`), and module-level helpers `evaluate`, `until`, `go`, `key`, `press`, `button`, `fill`, `click`, `shot` (`:159-260`) and
    `ageWords` (`:294`); `ORIGIN` from `DEMO_ADMIN_ORIGIN` (default `http://127.0.0.1:7101`, `:28`), every page `ORIGIN + path` (`:185`); its
    check 1 clicks the rail by `a[href="/fleet"]` (`:348`). **Node runs it directly** (types stripped; it imports only `node:` builtins). No
    tsconfig in the repository sets `allowImportingTsExtensions`; admin-ui's is `noEmit`.
13. **`scripts/admin-ui.sh`'s stop is unbounded** (`:43-48`: TERM to the tree, then `wait`) — P11's sitting 8 F9 bounded
    `demo-admin.sh`'s (TERM, ten seconds, KILL) and named this one *"for P11b"*.

**Sign-in, step-up, sign-out and CSRF on the console's origin — what needs no change.**

14. **`safeReturnTo`** (`identity/login-state.ts:24-28`): `^\/(?!\/)[^\s\\]{0,511}$` — any same-origin path. `/auth/login` (`api/routes/auth.ts:141-158`)
    and `/auth/step-up` (`:174-192`) keep it in their cookie; the callback redirects to it — the sign-in's at `:359`, the step-up's at
    `:288`. **`/admin/releases/<uuid>/approval?preview=<uuid>` (~95 characters) is accepted.** Both cookies are `Path=/` (`:151`, `:184`).
    The two consoles' `sessionStorage` keys cannot collide on the shared origin (`admin-ui/src/approval-state.ts:165`,
    `console/src/approval-state.ts:25`).
15. **Sign-out lands on `/`**: the IdP's single-logout answer redirects to `named === here ? '/' : `${named}/`` (`auth.ts:441`) — the
    reference console's root, which with no session shows its *Sign in* button (`packages/console/src/app.tsx:42-51`).
16. **CSRF is an origin check** (`api/csrf.ts:44-57`): a session-bearing request must carry `Origin` equal to the origin it arrived on —
    the admin console's requests come from that origin. The WebSocket upgrade is checked the same way (`api/contract/websocket.ts`).

**The team's email, and every reader of its links.**

17. **`mail/team.ts` writes three links on the platform's SP origin** (`config.sp.origin`, `mail/index.ts:64`): `${origin}/queue` (`:53`),
    `${origin}/releases/${releaseId}/approval` (`:63`), `${origin}/projects/${id}/records` (`:87`). **Today they land in the reference
    console**, which answers all three (`packages/console/src/router.ts:38`, `:43-57`, `:60-61`). **THREE readers assert them** (grep of
    `packages/*/src` and `scripts` for the three shapes, 2026-10-16 ~16:27 — every other hit is an API path, `/v1/releases/<id>/approval`):
    `mail/team.test.ts` (each email's WHOLE text, `:10`, `:41-42`, …); **`launch/records.test.ts:1159-1161`**
    (`toContain('https://console.manifest.internal/projects/${projectId}/records')` — a database file, the `unit` project); and
    **`packages/journey/src/launch.ts:1384-1386`** — `make demo-launch`'s step 6 (`theTeamsEmails`, `:1353-1390`): every team email contains
    `${origin}/queue` and the record's or the release's link. **`TeamNotice` has two kinds, `record-sent` and `sign-off-asked`, both to the
    team** (`:10-29`; `createMailer` sends only to `config.mail.team`, `mail/index.ts:63-72`): no email goes to an owner, ever — and §26:
    *"The email carries nothing a person wrote."*

**The real queue — what the launch path's own demo leaves on 7100.**

18. **`scripts/demo-launch.sh` takes `DEMO_LAUNCH_SLUG` — ONLY AS `launchpath-[a-z0-9-]*`** (`:84-88`, *"a slug beginning launchpath-"*;
    a project slug is `^[a-z][a-z0-9-]{2,38}$`, `spec/schema.ts:3`) — and `DEMO_LAUNCH_STOP_AFTER` (`:89-92`; *"a negative control's short
    run, on a project of its own that never launches"*), signs `operator` in and grants the role (`:245-251`, `scripts/admin-grant.sh grant
    opr000001 …`), and deletes and remakes a project an earlier run left unlaunched (`launch.ts:481-500`). **Its steps 1–4** (the `owner`
    phase; `STOP_AFTER=4` exits green after it, `demo-launch.sh:259-261`) build and deploy to sandbox and staging (`launch.ts:505`), draft
    the three records (`:650`), **mint a token `launch agent <runId>` with `approval:request` that asks for the staging release's sign-off**
    (`:803-…`, `:816-817`), and **send the privacy assessment to the team** (`:899`). So after `STOP_AFTER=4` the project's queue is
    **`release-approval` (asked through that token) and `privacy-assessment-to-submit`**, both in *Waiting on us*. Its `findPhase` deletes
    the project's leftover team emails (`:458-459`); its step 6 reads and deletes the new ones (`:1340`, `:1404`) — **so after step 4 the
    two emails stay in Mailpit.** Mailpit is searched by `subject:"(<slug>)"` (`:1411-1416`), the parenthesised slug a phrase.
19. **A release can be signed off before its launch records are done**: `approveRelease` (`api/routes/releases.ts:595-630`) needs a stored
    preview and a recent step-up, and refuses nothing for readiness.
20. **B's sitting 5 walked the reference console through the edge headless, signing in AT THE IdP** (`.superpowers/sdd/2026-10-03-load-rehearsal/walk-sitting5/walk.mjs`,
    git-ignored): the form's `input[name="username"]` and `input[name="password"]`, filled and `form.submit()`ed (`:103-106`), the step-up
    the same (`:148-153`). Chrome trusts the edge's certificate through the macOS keychain (`make seed`) and resolves `*.manifest.internal`
    through `/etc/resolver`. **To restart 7100 on the GitHub fake**: `bash scripts/gateway-controls.sh start fake` (`:6`, `:10-11`; `real` is
    `.env` as it is, `local` driver 1).

**What else this plan meets.**

21. **The load rehearsal's reads are in `1.10.0`**: `listLoadRehearsals` (`openapi.json:7461`), `getLoadRehearsal`; `LoadRehearsal` requires
    `id, projectId, releaseId, state, audience, profile, granted, evidence, runBy, createdAt, finishedAt, takenDownAt, pollAfterSeconds`;
    `state` is `running | passed | failed | teardown_failed | abandoned`; `evidence` carries the platform's `reason` and the counts. **P11's
    Task 10 built no section** (its condition was `1.10.0` at its sitting; P11 plan l.2736). **The mock answers `listLoadRehearsals` from
    `mock-app`'s run whatever the id** (`packages/mock/src/server.ts:707`) and the demo fleet has no case for it (`fleet.ts:2374-2481`) — so
    for a demo-fleet project it would answer `mock-app`'s runs. The demo fleet's one large-audience app is `mus-100-listening`
    (`fleet.ts:600-626`), its checklist item *"…has not been rehearsed yet…"* (`:2175`); `fixtures.LOAD_REHEARSAL_FAILED` exists
    (`fixtures.ts:1832`). The platform's item (`launch/readiness.ts:255-…`) is met only by a passed run of the candidate that covers the
    audience.
22. **The hand-back keeps no reason**: `returnIamRegistration` and `returnPrivacyAssessment` take `NO_BODY` (`api/routes/launch.ts:637`,
    `:650`, `:676`, `:686`; their descriptions, `:644`, `:683`: *"Why it came back travels outside the record"*); their events,
    `iam_registration.returned` (`launch/records.ts:1033`) and `privacy_assessment.returned` (`:1070`), carry `{ environment, to }` and
    `{ to }` and a sentence naming the administrator. A gap's answer is limited to 2,000 characters (`representations/launch.ts:625`).
23. **Two unit tests read the Caddyfile** — `projects/edge-names.test.ts` (every named SITE is a reserved label; P11b adds no site) and
    `routing/caddy.test.ts` (a comment). Seven Docker cases name the console's host (`routing/*.docker.test.ts`, `releases/*.docker.test.ts`,
    `runtime/docker/s6.docker.test.ts`); none counts the console site's directives (Task 1's `[M12]` re-reads).
24. **The acceptances**: `make ci-acceptance` has fourteen steps (13 `make demo-admin`, 14 `make demo-load`, `ci-acceptance.sh:641-665`); the
    offline acceptance twenty-two headings, 0–21. **No sitting of a plan since B's 7 has run `make ci-acceptance` whole.**

---

## Decisions this plan makes, and why

1. **A PATH ON THE CONSOLE'S ORIGIN, `/admin/`, NOT A NEW HOSTNAME.** Same origin as the API, so the session, CSRF origin and SAML return
   are the reference console's (facts 14–16) and an administrator signs in once for both consoles. *Rejected:* `admin.manifest.internal` —
   a third origin is a third SP origin registered with the IdP (§9), a third cookie, a dnsmasq pin, a reserved label, and three more
   `make verify` checks, for no property the path lacks. *Cost of changing course:* a site block, an SP origin and a pin.
2. **ONE BASE IN EVERY MODE** — `BASE = '/admin'` in `src/base.ts`, imported by `vite.config.ts` (`base: '/admin/'`), the router, the
   step-up and the walk; the mock's demo at `http://127.0.0.1:7115/admin/`. *Rejected:* a base by mode (two different builds, a demo whose
   URLs are not the platform's, and a walk that proves the wrong paths). *Cost:* the demo's URLs move.
3. **7101 IS THE PLATFORM'S; THE DEMO PAIR MOVES TO 7114 (MOCK) AND 7115 (CONSOLE); 7113 IS LEFT TO BYOA** (facts 6–7). *Rejected:* one
   port for both modes (the demo's acceptance — `ci-acceptance`'s step 13 — refuses for as long as the platform's console runs); keeping
   7113 (BYOA claimed it first, approved by name). *Cost:* four scripts, `vite.config.ts`, the documents' port lines. **BYOA's plan is told**
   (its top note, `6e4837a6`, and the M11 sentence added with this revision).
4. **THE PLATFORM'S CONSOLE IS `vite preview` OF A BUILD OF ITS OWN, IN `.manifest/admin-ui-edge/dist`, STARTED DETACHED BY
   `scripts/admin-ui-edge.sh`, STOPPED BY ITS RECORDED PID, AND LEFT RUNNING LIKE 7104.** The team's emailed links must land on something,
   and the reference console is kept up the same way. **Its own `outDir`** (M7), because `make demo-admin` empties and rebuilds
   `packages/admin-ui/dist/` (fact 7) — under a shared directory every demo run would 404 an open console's assets and reset `status`'s
   build time; `.manifest/` is git-ignored and already holds the script's pid and log. Vite's own bin is run by `node` so the pid is the
   server's (`[M4]`). *Rejected:* `vite dev` as the served mode (its HMR socket is the reason the Caddyfile carries `stream_close_delay`; dev
   stays a developer's choice, on the same port); Caddy's `file_server` over a bind-mounted `dist/` (a compose change, a second
   single-file-mount trap, and §21 says *Host process*); `dist-edge/` in the package (a `.gitignore` line for a directory `vite build`'s
   default does not need). *Cost:* one script; a stale build is served until someone runs `make admin-ui-edge` again — the acceptance always
   does.
5. **THE ROUTE IS A STATIC RUN IN THE CONSOLE'S SITE — NEVER A RUNTIME ROUTE, NEVER ON `app.`, ALWAYS BEHIND `@outside`.** Static, because
   runtime routes are lost when the edge restarts (§12; the Caddyfile's *"A SITE HERE, NOT A RUNTIME ROUTE"*, `:38-40`); not on `app.`,
   because the faculty front-end's origin never shows a faculty member the operator's console (C3 inverted is for administrators only);
   behind `@outside`, because app and sandbox networks reach the edge by address (§12). **`make verify`'s parity check learns the exception
   by name**: it strips exactly the console's `/admin` run (five lines, contiguous) before comparing, and fails if `app.` carries one.
   *Cost:* five lines and two checks. *§11's route ownership*, as the brief names it, is read here as: **the Caddyfile owns the platform's
   sites, the driver owns apps' runtime routes**.
6. **THE TEAM'S EMAIL LINKS MOVE WITH THE ROUTE, IN THE SAME LANDING — WITH ALL THREE OF THEIR READERS** (fact 17; C1). One constant in
   `mail/team.ts` (`ADMIN_CONSOLE = '/admin'`); `records.test.ts`'s one assertion and `launch.ts`'s step-6 check move with it, the latter
   through its own `ADMIN_CONSOLE` constant (the journey's boundary imports only the contract — `packages/journey/src/boundary.test.ts` —
   so it cannot import `admin-ui`'s `BASE`); **a test in `admin-ui` holds `BASE`, the Caddyfile's matcher and both constants to one string**,
   reading the files as text (P11's `settings.test.ts` reads the control plane's source the same way); and **L1 runs `make demo-launch`
   through step 6** on a control slug, so step 6's new check is seen green through the real entry point the day it lands. *Rejected:* a
   setting (`MANIFEST_ADMIN_CONSOLE_PATH`) — a path no deployment would set differently, and a fifth place to agree. *Cost:* two constants
   and a control run.
7. **SIGN-OUT STILL LANDS ON `/`** (fact 15): an operator who signs out of `/admin/` meets the reference console's *Sign in*. *Rejected:*
   carrying a return path through single logout — a cookie and a redirect in `api/routes/auth.ts`, reviewed as a redirect target, for one
   click. *Cost of changing course:* that cookie, later. RUNBOOK says so.
8. **THE ACCEPTANCE SEEDS THE REAL QUEUE WITH THE LAUNCH PATH'S OWN STEPS 0–4** — **`DEMO_LAUNCH_SLUG=launchpath-adminedge-local`**
   (driver 1) or **`launchpath-adminedge-github`** (the fake), **`DEMO_LAUNCH_STOP_AFTER=4 bash scripts/demo-launch.sh`** (fact 18; I1 —
   `demo-launch.sh:86` accepts only `launchpath-…`). Each slug, in Mailpit's `subject:"(<slug>)"` phrase, is not `(launchpath-local)` or
   `(launchpath-github)` — `[M10]` measures that `demo-launch`'s own step-6 count of five is not met by the seed's emails, and the walk
   picks its messages by the seed's project and release ids, never by a search alone. *Rejected:* a seed of its own in `packages/journey`
   (the project, the commit, the build, both deploys, the drafts, the token and the send — about 400 lines of `launch.ts` again); the demo
   fleet (not the platform). *Cost:* a renumbering of `demo-launch`'s steps moves the seed — and the walk's check 2 asserts the seed's two
   items by kind, so it fails loudly rather than walking an empty queue.
9. **ONE CDP MODULE, TWO WALKS** — `walk/cdp.ts` (Chrome's port from `DevToolsActivePort`, the 30-second calls, the console's lines, pages
   in isolated browser contexts, and `walk.ts`'s own helpers under their own names) moved out of `walk.ts`; `walk/edge.ts` beside it;
   imported as `./cdp.ts`, with `allowImportingTsExtensions` in admin-ui's `tsconfig.json` (allowed under its `noEmit`). *Rejected:* a third
   copy (B5's walk was a copy of FE-46/47/5's); one walk with a mode switch (a 1,400-line file). *Cost:* a tsconfig line; `make demo-admin`
   proves the move.
10. **THE WALK SIGNS IN AT THE REAL IdP, IN CHROME, AS `operator`** (fact 20; the standing yes of 2026-10-03), and steps up there too; the
    instructor in an isolated context of the same Chrome. *Rejected:* a session cookie from `infra/lib/idp-login.sh` injected into Chrome —
    it would skip the round trips Review Focus 1 is about. *Cost:* none; B5 measured it.
11. ***LOAD REHEARSALS* ON THE PROJECT'S PAGE, AND THE DEMO FLEET'S OWN** (fact 21). An operator signing off a large course needs to see
    whether it was rehearsed and how it fell over; and a demo fleet answering `mock-app`'s runs for every project is a lie the console
    would now draw. `mus-100-listening` gains one FAILED run on its candidate (a state the platform reaches — P11's I3 rule), every other
    fleet project none. *Rejected:* leaving it for a minors round (the section is P11's named remainder and B is executed); a passed run
    (it would make `mus-100-listening`'s item met and its launch a different story). *Cost:* a `packages/mock` change — **G3** at L3.
12. **`PORT_ADMIN_UI=7101` MOVES INTO `infra/lib/common.sh`**, beside `PORT_CONSOLE`: it is the platform's now, and `make verify` needs it.
    The demo's two stay in the scripts that bind them. *Cost:* a line under `infra/`, which the Caddyfile already makes owe the Docker tier.
13. **THREE LANDINGS** (C2, under Rich's delegation) — **L1** after the edge (Task 3); **L2** after the acceptance is written (Task 4 Step 5),
    **before it is run**, so every run and control is of landed code in the tree that has `infra/ca`, `infra/secrets` and 7101's pid file;
    **L3** after *Load rehearsals*, the run's fixes and the review's fix wave (Task 6). *Rejected:* running the acceptance from the worktree
    with `infra/ca` and `infra/secrets` symlinked as `.env` is (it leaves 7101's ownership and 7100's code unsolved, and breaks the plan's own
    reason for keeping the platform in one tree); two landings (the acceptance would be run unlanded — the review's C2). *Cost:* one more
    7100 window for `pnpm test` twice (~40 min through the wrapper); P11 measured three.
14. **`/admin` WITHOUT ITS SLASH IS REDIRECTED BY THE EDGE** (M4): `redir /admin /admin/ 308`, the first line of the run, and the matcher
    `@admin path /admin/*`. Vite answers a path outside its base with a *"did you mean"* page, which is not a page an operator should meet
    from a typed URL. *Rejected:* dropping `/admin` from the matcher (it would fall to the reference console's catch-all and draw *its* queue
    — the worst of the three). *Cost:* one line, in the stripped run.
15. **`make verify`'s `[502]` IS PROVED BY THE EDGE'S LOADED CONFIG** (M6): `console_serves_admin`'s `[502]` passes only while nothing
    listens on 7101 **and** the edge's admin API (`http://127.0.0.1:7119/config/apps/http/servers/srv0/routes`) shows, under the console's
    host, a handler dialling `host.docker.internal:7101` ahead of the one dialling `:7104` — so a missing route behind a down reference
    console cannot pass as the route's own `502`. *Rejected:* passing `[502]` only while 7104 answers (a machine state `make verify` already
    accepts for `/` — `console_serves_host`'s `[502]` — would fail this check for the wrong reason). *Cost:* one `curl` and a `node -e`
    reading JSON, as `scripts/lib/api.sh`'s `field` does.
16. **A LIVE CONTROL BREAKS A LANDED FILE, NEVER A COMMIT** (C2; *The live controls*). *Rejected:* committing a break to `main` and
    reverting it (two commits on a shared branch peers build on, for each control); breaking in the worktree (nothing live reads it).
17. **RICH'S CLICK-6 QUESTION IS AN OPTION, NOT A TASK** (*the option*, below) — a contract change, a spec action, a migration and the
    faculty front-end's work, which are his to want.

---

## Global Constraints

- **The worktree**: `/Users/rich/Developer/manifest-p11b`, branch `p11b-admin-edge`. Nothing in the shared checkout is changed by a build
  task until a landing's `git merge --ff-only`; never `git add -A`, `.`, or `commit -a`; commit with a pathspec (`git commit -m … -- <paths>`).
- **Every live run from the shared checkout**: never `make up`, `docker compose …`, `pnpm test:docker`, `make verify`, a `make demo-*` or
  `admin-ui-edge.sh` in the worktree. A live control's break is never committed, and is restored with `git checkout -- <path>` before the
  next step.
- **Files this plan may change**: `packages/admin-ui/**`; `packages/mock/src/fleet.ts` and `fleet.test.ts` (Task 5 only); in the control
  plane **only** `src/mail/team.ts`, `team.test.ts` and **the one assertion at `src/launch/records.test.ts:1159-1161`**; in the journey **only**
  **`src/launch.ts`'s step-6 link check (`:1384-1386`) and its constant**; in `infra/` **only** the Caddyfile's console site (the one run and its
  comment) and `infra/lib/common.sh`'s `PORT_ADMIN_UI`; `scripts/` (`admin-ui.sh`, `demo-admin.sh`, `doctor.sh`, `verify.sh`,
  `ci-acceptance.sh`, `offline-acceptance.sh`, the new `admin-ui-edge.sh` and `demo-admin-edge.sh`); the `Makefile`; docs. **No
  `packages/contract` change, no spec edit.**
- **`BASE` is `'/admin'`, stated once** (`packages/admin-ui/src/base.ts`) and held to the Caddyfile's matcher, `mail/team.ts`'s constant and
  `launch.ts`'s constant by a test. Every path the console writes or follows is under it; a path outside it is never read as one of its
  screens.
- **Ports**: the platform's console on **7101** (`strictPort`), the demo's console on **7115** and its mock on **7114**, the walk's Chrome on
  a port the system picks. **Never 7113** (BYOA's), 7102, 7104 or 7105. `make doctor` recognises 7101, 7114 and 7115. Never touch Laravel
  Valet.
- **The platform's build is `.manifest/admin-ui-edge/dist`**, never `packages/admin-ui/dist/` (the demo's).
- **The demo is unchanged but for its ports and its paths**: `make demo-admin`'s nine checks pass as P11 left them.
- **The route**: in the console's site only, inside its `route`, below `@api` and above the `7104` catch-all, with `stream_close_delay 1h`.
- **Every acceptance check asserts a shape** — a page's title and the screen's own words, a record read back through the API — never only
  that a page loaded; every refusal it expects names its code.
- **The walk types only the laptop IdP's test users' passwords**; Rich's own and real UBC credentials never.
- **A classifier refusal** — the exact command and the refusal to the coordinator; never another way, never another session.
- **Published words**: nothing the console shows cites a plan, a decision or a spec section.
- **Run `date` alone before writing any time** into a record or a message. **bash 3.2**: no `mapfile`, no `xargs -r`, no GNU-only flags.
- **No new dependency.**

## Review Focus

The five ways the console on the real platform is most likely to bite an operator, most likely first. Each has its test in the task
named.

1. **A round trip or a link lands outside the console** — the step-up, the sign-in, a reload of a deep link, a rail click, a pasted URL or
   `/admin` typed without its slash lands on the reference console (which answers every path below `/` but `/admin`) or on Vite's base page.
   The operator expects to land on the same `/admin/…` page, the same pane, the reason still typed. *Pinned in Task 2 Step 1* (the router
   and `stepUpUrl` under the base; a path outside it is never a screen), *Task 3 Step 1* (the redirect's line) *and Task 4's checks 1 and
   3* (through the edge and the IdP).
2. **The edge serves the wrong thing at `/admin`** — the reference console's catch-all answering because the route is missing or below it,
   a `502` read as success, `app.` serving the operator's console, or a container on an app network reaching it. The operator expects
   `/admin/` to be the operator console, from the host only, on the console's origin only. *Pinned in Task 3 Step 1* (the agreement test's
   order and `app.` cases) *and Steps 3 and 9* (`make verify`'s `console_serves_admin` with its loaded-config proof, the parity check, the
   container's `403` on `/admin/`).
3. **The emailed link and the console disagree** — a link to the reference console, to a path the admin console does not have, or to the
   wrong item; or the launch path's own acceptance still asserting the old links. The operator expects each of the team's three links to
   open that item in this console. *Pinned in Task 3 Step 1* (`team.test.ts`'s whole texts; `records.test.ts`; the agreement test, no
   unprefixed link), *Task 3 Step 7* (`make demo-launch` through step 6) *and Task 4's check 6* (the real email from Mailpit, opened).
4. **The real platform answers what the mock never did** — a preview that takes a model call (tens of seconds) and invites a second press;
   a step-up the IdP times out; a `409 APPROVAL_PREVIEW_STALE` because staging moved; a real `403 FORBIDDEN` for someone who is not an
   administrator; Health's fan-out across a real fleet. The operator expects the pane to say what it is waiting for, one decision recorded,
   and every refusal shown with its code. *Pinned in Task 4's checks 3, 9 and 11* (the preview awaited and the decision read back once; the
   instructor refused by the real role; Health and Settings from 7100) *and P11's unit cases, which the walk does not repeat*.
5. **A stale or foreign server is what the edge forwards to** — an old build left on 7101, the demo's console mistaken for the
   platform's, a demo run emptying the served build, or someone else's process on 7101. The operator expects the edge to serve the current
   platform-mode build, and the acceptance never to walk the mock. *Pinned in Task 3 Step 4* (`admin-ui-edge.sh` asks 7101 who it is,
   rebuilds into its own `outDir`) *and Task 4's check 2* (the queue holds the seed's project, which only 7100 has).

---

## File Structure

```
packages/admin-ui/
├── src/base.ts                        NEW (Task 2) — BASE = '/admin', the one statement
├── src/base.test.ts                   NEW (Task 3) — BASE, the Caddyfile's /admin run, team.ts's and launch.ts's constants agree
├── src/router.ts, router.test.ts      MODIFY (Task 2) — every path under BASE
├── src/auth.ts, auth.test.ts          MODIFY (Task 2) — stepUpUrl through routePath
├── src/app.test.tsx                   MODIFY (Task 2) — the rail's hrefs under BASE
├── src/api.ts, api.test.ts            MODIFY (Task 5) — listLoadRehearsals
├── src/project-state.ts, .test.ts     MODIFY (Task 5) — loadRehearsalsOf
├── src/screens/project.tsx, .test.tsx MODIFY (Task 5) — the *Load rehearsals* section
├── vite.config.ts                     MODIFY (Task 2) — base, the port by mode, allowedHosts, hmr
├── tsconfig.json                      MODIFY (Task 4) — allowImportingTsExtensions
└── walk/
    ├── cdp.ts                         NEW (Task 4) — Chrome over CDP, moved out of walk.ts
    ├── walk.ts                        MODIFY (Task 2: paths and origin; Task 4: imports cdp.ts; Task 5: check 8's section)
    └── edge.ts                        NEW (Task 4) — make demo-admin-edge's eleven checks
packages/mock/src/fleet.ts, fleet.test.ts                    MODIFY (Task 5) — each fleet project's load rehearsals
packages/control-plane/src/mail/team.ts, team.test.ts        MODIFY (Task 3) — the three links under /admin
packages/control-plane/src/launch/records.test.ts            MODIFY (Task 3) — its one assertion of the record's link (:1159-1161)
packages/journey/src/launch.ts                               MODIFY (Task 3) — make demo-launch step 6's link check (:1384-1386)
infra/caddy/Caddyfile                                         MODIFY (Task 3) — the console site's /admin run
infra/lib/common.sh                                           MODIFY (Task 3) — PORT_ADMIN_UI=7101
scripts/admin-ui.sh                                           MODIFY (Task 2) — 7114/7115, /admin/, a bounded stop
scripts/demo-admin.sh                                         MODIFY (Task 2) — 7114/7115
scripts/doctor.sh                                             MODIFY (Tasks 2, 3) — asks /admin/ on 7101 and 7115, the mock on 7114
scripts/verify.sh                                             MODIFY (Task 3) — console_serves_admin; the parity check's one exception; /admin/ refused to a container
scripts/admin-ui-edge.sh                                      NEW (Task 3) — the platform's console on 7101: start | stop | status
scripts/demo-admin-edge.sh                                    NEW (Task 4) — the acceptance's headless half
scripts/ci-acceptance.sh                                      MODIFY — EXPECT_ lines at each landing; step 15 (Task 4)
scripts/offline-acceptance.sh                                 MODIFY (Task 4) — step 22
Makefile                                                      MODIFY — admin-ui-edge (Task 3), demo-admin-edge (Task 4)
docs/superpowers/RUNBOOK.md, WALKTHROUGH.md, ORIENTATION.md, TRAPS.md   MODIFY (Task 3 Step 8: the port lines, IN THE SHARED CHECKOUT after L1)
docs/superpowers/RUNBOOK.md, WALKTHROUGH.md, the design                 MODIFY (Task 6, IN THE SHARED CHECKOUT after L3)
docs/superpowers/spikes/p11b-baseline/README.md               NEW (Task 1)
.manifest/admin-ui-edge/{dist/, pid, log}                     RUNTIME (git-ignored, the shared checkout's) — the platform's build and process
```

---

## Task 1: Measure what this plan rests on, and make the worktree

**Sitting 1. Documents and measurements; the worktree.** Writes `docs/superpowers/spikes/p11b-baseline/README.md` (one section per
measurement, its raw answer) **in the shared checkout**, committed there by pathspec. **Any live probe of the edge or 7100 is asked of the
coordinator first**; a Docker command waits for the flag to read FREE (the run's Hatchery rule).

- [ ] **Step 1: `[M1]` The contract and HEAD.** `jq -r .info.version packages/contract/openapi.json` and the operation count — expected
  `1.10.0` / `79`, **or `1.11.0` if FE-32's Task 3 has landed** (record which); the operations the console reads are present with the shapes
  facts 11, 21 and 22 state (`listQueue`, `listFleet`, the approval three, the team's four, the two records, `listLoadRehearsals`).
  Re-read facts 1–24 at the sitting's HEAD; a difference is a finding and changes the task that reads it.
- [ ] **Step 2: `[M2]` Vite 8.3.0 under a base** — in the session's scratchpad (outside both repositories), a one-page app with
  `base: '/admin/'` and the shared checkout's `node_modules` on `NODE_PATH`, in **dev and preview**: `GET /admin/` → `index.html`; `GET
  /admin/queue/release-approval/x` → `index.html`; `GET /admin` and `GET /` → record each status and body; the built assets under
  `/admin/assets/`; `-H 'Host: console.manifest.internal'` refused without `allowedHosts` and answered with it; **`/v1` (with `ws: true`) and
  `/auth` proxied although OUTSIDE the base**, to a throwaway `manifest-mock` on a scratch port (an HTTP request and a WebSocket upgrade);
  and in dev with `hmr: { protocol: 'wss', host: 'console.manifest.internal', clientPort: 443 }`, **the URL the HMR socket opens** — under
  the base, expected `wss://console.manifest.internal/admin/?token=…` (read from the page's WebSocket, not `/@vite/client`, which is the
  script). **Expected:** each as Task 2 assumes. **If `/v1` or `/auth` outside the base is NOT proxied**, record it: Task 2 then forwards both
  in demo mode with a Vite plugin's `configureServer`/`configurePreviewServer` middleware registered ahead of the base's, named in the record.
- [ ] **Step 3: `[M3]` The walk's imports.** In the scratchpad: `node a.ts` importing `./b.ts` runs on Node 24.12.0; `tsc --noEmit` accepts
  it with `allowImportingTsExtensions` under `moduleResolution: Bundler`; `pnpm lint`'s rules accept it (one throwaway file under
  `packages/admin-ui/walk/` in the worktree, deleted after).
- [ ] **Step 4: `[M4]` One process, its own `outDir`.** In the scratchpad copy: `vite build --outDir <abs>/admin-ui-edge/dist
  --emptyOutDir` (an `outDir` outside the root needs the flag) and `node node_modules/vite/bin/vite.js preview --outDir <same>` from
  `packages/admin-ui` — it serves that build at `/admin/`; `pgrep -P <pid>` shows no child holding the port, so the recorded pid is the
  server's; TERM stops it and frees the port.
- [ ] **Step 5: `[M5]` The ports.** `lsof -nP -iTCP:<p> -sTCP:LISTEN` for 7101, 7113, 7114, 7115; `grep -rn '\b711[45]\b'` across manifest's
  `docs`, `infra`, `scripts`, `Makefile`, `packages/*/src` and manifest-app's `docs` and `packages` (read-only) → nothing but P11b's own and
  BYOA's note. Re-read BYOA's claim on 7113 (fact 6). **If 7114 or 7115 is taken or named**, take the next free unnamed pair in 7114–7118
  and change every mention in this plan in the sitting's record. **If BYOA's sitting 1 has already moved the demo pair** (its top note),
  record what it moved, and Task 2 takes it as found.
- [ ] **Step 6: `[M6]` The edge as it is** (read only, at the coordinator's word): `docker inspect manifest-caddy --format '{{range
  .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}'` → the shared checkout's Caddyfile; `curl -sS -w ' [%{http_code}]'
  https://console.manifest.internal/admin/ | tail -c 300` → the reference console's document (`<title>Manifest</title>`): the catch-all
  answers `/admin` today; `docker exec manifest-caddy wget -qO- -T 3 http://host.docker.internal:7104/ | head -c 200` → the reference
  console — the edge reaches a host process by that name (7101 the same in Task 3); `curl -s http://127.0.0.1:7119/config/apps/http/servers/srv0/routes`
  → the console host's subroute with its `7100` and `7104` dials, in that order (the shape Task 3's `console_serves_admin` reads, Decision 15).
- [ ] **Step 7: `[M7]` A THROWAWAY Caddy** (BYOA's `[M6]` pattern; under FREE): `manifest-caddy:local` as `p11b-caddy-probe`, published on
  `127.0.0.1:18099` (outside 7100–7199), with a scratch Caddyfile of one plain-HTTP site whose `route` holds Task 3's five lines (`redir
  /admin /admin/ 308`, `@admin path /admin/*`, the `reverse_proxy @admin host.docker.internal:7101` block) and then `respond "catch-all" 200`,
  in front of Step 4's preview on 7101: `/admin` → `308` to `/admin/`; `/admin/` → the page; a deep path → the page; `/adminx` → `catch-all`
  (a path, not a prefix); `/` → `catch-all`; and, with Step 2's dev server on 7101 instead, **the HMR socket's upgrade carried through
  `/admin/*`**. Then `docker rm -f p11b-caddy-probe` by name, and the servers stopped by their pids.
- [ ] **Step 8: `[M8]` Sign-in under the base, from the code** — `node -e` with `login-state.ts:24`'s regex against
  `/admin/releases/<uuid>/approval?preview=<uuid>` → accepted; `auth.ts:288`, `:359` and `:441` re-read (facts 14–15); `csrf.ts:44-57` (fact 16).
- [ ] **Step 9: `[M9]` `make verify`'s and `make doctor`'s checks** — re-read `verify.sh:1008-1097` and `doctor.sh:169-252` at HEAD; the
  `EXPECT_` lines (FE-32 may have moved `EXPECT_VERIFY` first — Task 3 adds one to whatever `main` carries); `ci-acceptance.sh`'s steps and
  `offline-acceptance.sh`'s headings.
- [ ] **Step 10: `[M10]` The seed, its slug, its emails, and the IdP form** — `demo-launch.sh:84-92` (the slug's `launchpath-` rule and
  `STOP_AFTER`) and `launch.ts`'s steps 3 and 4, `findPhase` and `mailpitSearch` at HEAD (fact 18): the token's name, the two kinds, the
  emails left. **Mailpit's phrase search**, against a throwaway message (sent with `nodemailer` from the scratchpad to 7111, deleted by id
  after): `subject:"(launchpath-local)"` does **not** match a subject carrying `(launchpath-adminedge-local)`, and
  `subject:"(launchpath-github)"` not `(launchpath-adminedge-github)` — **if either matches, the seed's slugs become ones without
  `local`/`github` (`launchpath-adminedge-d1`, `-d2`), changed in this plan in the record**. B5's walk's selectors (fact 20). And **how long
  `make demo-launch` steps 0–4 took** in its last recorded runs (the launch path plan's and FE-46/47/5's records) — the seed's budget.
- [ ] **Step 11: `[M11]` The mock's load rehearsals for a fleet project** — a throwaway mock on `127.0.0.1:18102`
  (`MANIFEST_MOCK_PORT=18102 MANIFEST_MOCK_ROLE=admin MANIFEST_MOCK_FLEET=demo pnpm --filter @manifest/mock start`, stopped by its pid):
  `GET /v1/projects/<mus-100-listening's id>/load-rehearsals` with the mock's session → expected `mock-app`'s run (fact 21's lie, Task 5's);
  and `launch/readiness.ts`'s `load-rehearsal` clauses read whole — **the exact `why` a FAILED newest run of the candidate gives**, which
  Task 5 copies.
- [ ] **Step 12: `[M12]` What is owed, and who else reads it.** Confirm `infra/` is in CLAUDE.md's Docker-tier list (owed once, after L1)
  and `mail/` and `journey/` are not; **every reader of the team email's links**: `grep -rn '/queue\|/records\|/approval'
  packages/journey/src packages/control-plane/src` filtered to the email's three shapes (expected exactly fact 17's three; every other hit an
  API path); `grep -rn 'console.manifest.internal' packages/control-plane/src/**/*.docker.test.ts` — no case counts the console site's
  directives; `git -C /Users/rich/Developer/manifest-app grep -n '7101\|7113\|/admin/\|admin-ui' -- ':!node_modules'` (read-only) — nothing
  there depends on the console's paths or ports.
- [ ] **Step 13: Write the baseline, commit it** (shared checkout, by pathspec), **then make the worktree** (*The worktree*, above):
  ```bash
  cd /Users/rich/Developer/manifest
  git add docs/superpowers/spikes/p11b-baseline/README.md
  git commit -m "docs(p11b): Task 1's measurements — Vite under /admin/ behind a throwaway Caddy, the walk's imports, the platform's own outDir, the ports (7113 is BYOA's), the edge as it is, the seed's queue, slug and emails, every reader of the team's links, the mock's load rehearsals" -- docs/superpowers/spikes/p11b-baseline/README.md
  ```

---

## Task 2: The base path, and the demo's own ports

**Sitting 2. In the worktree. No landing.**

**Files:** Create `packages/admin-ui/src/base.ts`. Modify `vite.config.ts`, `src/router.ts`, `src/router.test.ts`, `src/auth.ts`,
`src/auth.test.ts`, `src/app.test.tsx`, the two comments that name the email's path (`router.ts:6-7`, `screens/record-pane.tsx:1107`,
`:1132`), `walk/walk.ts`, `scripts/admin-ui.sh`, `scripts/demo-admin.sh`, `scripts/doctor.sh`.

**Interfaces:**
- Produces: `export const BASE = '/admin'` (`src/base.ts` — no trailing slash; nothing else in the module). `routePath(route: Route):
  string` — every path begins `${BASE}/`. `parseRoute(path: string): Route` — reads a path under the base (`BASE` itself, or beginning
  `${BASE}/`); **any other path is the queue**. `canonicalPath(path: string): string` unchanged in signature. `stepUpUrl(releaseId: string,
  previewId: string): string` — `'/auth/step-up?returnTo=' + encodeURIComponent(routePath({ screen: 'release', releaseId, preview:
  previewId }))`.
- Consumes: nothing new.

- [ ] **Step 1: The failing tests.** In `router.test.ts`, every fixture path gains the base, and these cases are added:

  ```ts
  it('reads only paths under the base', () => {
    expect(parseRoute('/admin/fleet?prod=1')).toEqual({ screen: 'fleet', query: 'prod=1' })
    expect(parseRoute('/admin/releases/r1/approval?preview=p1')).toEqual({ screen: 'release', releaseId: 'r1', preview: 'p1' })
    expect(parseRoute('/fleet')).toEqual({ screen: 'queue' })          // the reference console's, not ours
    expect(parseRoute('/administrator/fleet')).toEqual({ screen: 'queue' }) // a segment, not a prefix
  })
  it('writes every path under the base, and round-trips each', () => {
    for (const p of ['/admin/queue', '/admin/releases/r1/approval?preview=p1', '/admin/projects/p1',
                     '/admin/projects/p1/records', '/admin/fleet?prod=1', '/admin/health', '/admin/settings'])
      expect(routePath(parseRoute(p))).toBe(p)
  })
  it('makes the bare base and the root the queue', () => {
    expect(canonicalPath('/admin')).toBe('/admin/queue')
    expect(canonicalPath('/admin/')).toBe('/admin/queue')
    expect(canonicalPath('/')).toBe('/admin/queue')
  })
  it('leaves a link outside the base to the browser', () => {
    expect(linkTarget(click('/admin/fleet'), ORIGIN)).toEqual({ screen: 'fleet', query: '' })
    expect(linkTarget(click('/fleet'), ORIGIN)).toBeNull()             // the reference console's Fleet
    expect(linkTarget(click('/auth/login?returnTo=%2Fadmin%2Fqueue'), ORIGIN)).toBeNull()
  })
  ```

  (`click(href)` is the file's existing `LinkClick` fixture builder; a queue item's path with its filter, `queue-state.ts`'s `queryOf`
  keys, joins the round-trip list as written at the step.) In `auth.test.ts`: `stepUpUrl('r1', 'p1')` is
  `'/auth/step-up?returnTo=%2Fadmin%2Freleases%2Fr1%2Fapproval%3Fpreview%3Dp1'`. In `app.test.tsx`: `railOf`'s hrefs are `/admin/queue`,
  `/admin/fleet`, `/admin/health`, `/admin/settings` and its `homeHref` `/admin/queue`.
- [ ] **Step 2: Run them; they fail** — `pnpm exec vitest run --project admin-ui src/router.test.ts src/auth.test.ts src/app.test.tsx`:
  red on the base, and only there.
- [ ] **Step 3: `src/base.ts`, the router, `stepUpUrl`.** `parseRoute` strips `BASE` when the path is under it and returns the queue
  otherwise; `routePath` prefixes it; `stepUpUrl` is built from `routePath` (the one place a release pane's path is written). No other
  file in `src/` names a path (fact 9); the two comments are brought to `/admin/…`.
- [ ] **Step 4: `vite.config.ts`** — `base: \`${BASE}/\`` (imported from `./src/base`); **the port by mode**: `7101` with no
  `MANIFEST_MOCK`, `7115` under it (`strictPort` both); the mock's default `MANIFEST_MOCK_PORT` `7114`; `allowedHosts:
  ['console.manifest.internal']` on `server` and `preview`; `hmr` as the reference console's (`packages/console/vite.config.ts:104-107`) —
  `{ protocol: 'wss', host: 'console.manifest.internal', clientPort: 443 }` with no mock, `{ protocol: 'ws', host: '127.0.0.1',
  clientPort: 7115 }` under it. The header comment says which mode is which and that 7113 is BYOA's.
- [ ] **Step 5: The scripts and the walk.** `scripts/admin-ui.sh` and `scripts/demo-admin.sh`: `PORT_ADMIN_DEMO=7115`,
  `PORT_ADMIN_MOCK=7114`, the URL `http://127.0.0.1:7115/admin/`; **`admin-ui.sh`'s stop bounded** — `demo-admin.sh`'s `tree_of`,
  `running` and `stop` (TERM every pid of both trees, ten seconds, KILL whatever ignored it, named) (fact 13). `walk/walk.ts`: `ORIGIN`'s
  default `http://127.0.0.1:7115`; every page, every expected URL and the rail's selector (`:348`, `a[href="/admin/fleet"]`) from the base —
  the string `'/admin'` beside a comment naming `src/base.ts` until Task 4's tsconfig line lets the walk import it. `scripts/doctor.sh`:
  `admin_ui_is_ours <port>` asks `http://127.0.0.1:<port>/admin/` for `id="root"` and `<title>Manifest operations</title>`, called for 7101
  and for 7115; `admin_mock_is_ours` on 7114; the comment says 7113 is BYOA's MCP server (its `mcp_is_ours` lands with it).
- [ ] **Step 6: Run them; they pass. The gates** (FREE): `pnpm exec vitest run --project admin-ui --project packages` twice, identical;
  `pnpm lint`, `pnpm typecheck`, `pnpm format:check`. **`make demo-admin` — 9/9 on the build, and on `vite dev`** (`DEMO_ADMIN_DEV=1`) —
  from the worktree (it needs no platform and reads nothing git-ignored but its own build). **`make admin-ui`**: `curl
  http://127.0.0.1:7115/admin/` → the title; `make doctor` → no `CLAIMED BY SOMETHING ELSE` for 7114 or 7115; then TERM to the script — both
  ports free within ten seconds.
- [ ] **Step 7: The negative control** (committed, broken, restored; predicted first): `routePath` without `BASE` → `router.test.ts`'s
  round-trip and base cases red, and **`make demo-admin`'s check 1 red on the ADDRESS** — the shell's first effect `replaceState`s
  `/admin/` to `/queue` (`app.tsx:48-52`), not the `/admin/queue` the check wants; and its rail click finds no `a[href="/admin/fleet"]`
  (M3: not *"the browser follows it"*). Record the reason each red gives. A control that stays green is a question.
- [ ] **Step 8: Commit** (the branch):
  ```bash
  git add packages/admin-ui/src/base.ts
  git commit -m "feat(admin-ui): every path under /admin/ — the router, the step-up's return, Vite's base; the demo on 7114/7115 (7113 is BYOA's); make doctor asks /admin/; admin-ui.sh's stop bounded" -- packages/admin-ui scripts/admin-ui.sh scripts/demo-admin.sh scripts/doctor.sh
  ```

---

## Task 3: The edge — the route, `make verify`, the team's links and their readers, the platform's console on 7101

**Sitting 3. In the worktree; then LANDING 1, and the live checks FROM THE SHARED CHECKOUT.**

**Files:** Modify `infra/caddy/Caddyfile`, `infra/lib/common.sh`, `scripts/doctor.sh`, `scripts/verify.sh`,
`packages/control-plane/src/mail/team.ts`, `packages/control-plane/src/mail/team.test.ts`, **`packages/control-plane/src/launch/records.test.ts`
(`:1159-1161` only)**, **`packages/journey/src/launch.ts` (`:1384-1386` and a constant)**, `Makefile`, `scripts/ci-acceptance.sh` (at L1).
Create `packages/admin-ui/src/base.test.ts`, `scripts/admin-ui-edge.sh`.

**Interfaces:**
- Consumes: `BASE` (Task 2).
- Produces: `export const ADMIN_CONSOLE = '/admin'` in `mail/team.ts` (exported for the test only) and `const ADMIN_CONSOLE = '/admin'` in
  `packages/journey/src/launch.ts` (its comment naming `admin-ui`'s `BASE` and `base.test.ts`); `make admin-ui-edge`;
  `scripts/admin-ui-edge.sh start | stop | status`, its build in `.manifest/admin-ui-edge/dist`, its pid in `.manifest/admin-ui-edge/pid`
  and its log in `.manifest/admin-ui-edge/log` (`.manifest/` is git-ignored, `.gitignore:34`); `PORT_ADMIN_UI=7101` in `infra/lib/common.sh`.

- [ ] **Step 1: The failing tests.**
  - `team.test.ts`: each of the three emails' whole text with `${ORIGIN}/admin/releases/<id>/approval`, `${ORIGIN}/admin/projects/<id>/records`
    and `${ORIGIN}/admin/queue`.
  - `records.test.ts:1159-1161`: `toContain(\`https://console.manifest.internal/admin/projects/${projectId}/records\`)` — **a database file:
    it is first run red-then-green in L1's `pnpm test`, on the tree with `team.ts`'s change; never in the worktree** (the gates, above).
  - `launch.ts`'s step-6 check: `${origin}${ADMIN_CONSOLE}/queue` and the record's and the release's links under it — run at Step 7, through
    `make demo-launch` (it has no unit test of its own).
  - `base.test.ts` (reading the files with `node:fs` from the repository root, as `settings.test.ts` reads `config.ts`):
    - *"the console's site redirects /admin and sends /admin/* to 7101, below the API and above the reference console"* — inside the
      `console.manifest.internal {` block, **one contiguous run of five lines**: `redir /admin /admin/ 308`, `@admin path /admin/*`,
      `reverse_proxy @admin host.docker.internal:7101 {`, `stream_close_delay 1h`, `}`; the run after `respond @outside` and after
      `reverse_proxy @api`'s block, and before `reverse_proxy host.docker.internal:7104 {`;
    - *"app's site serves no operator's console"* — the `app.manifest.internal {` block contains no `@admin`, no `/admin` and no `7101`;
    - *"the team's links are under the console's base"* — `team.ts`'s `ADMIN_CONSOLE` and `launch.ts`'s `ADMIN_CONSOLE` (each read by regex
      from the source, as text: the test imports nothing from either package) equal `BASE`, the matcher's path is `` `${BASE}/*` ``, **and
      neither file has a `${origin}/queue`, `${origin}/releases/` or `${origin}/projects/` literal outside `${ADMIN_CONSOLE}`** (M2 — so a
      link written without the constant is red here too).
- [ ] **Step 2: Run them; they fail** — `base.test.ts` in the `admin-ui` project; `team.test.ts` alone from a scratch config with no global
  setup.
- [ ] **Step 3: The route, the constants, the checks.** The Caddyfile's console site, inside `route`, after `@api`'s `reverse_proxy`
  block and before the `7104` comment:

  ```
  		# P11b: THE ADMINISTRATOR'S CONSOLE (packages/admin-ui, §26), a host process on 7101 (§21), on THIS origin under
  		# /admin/ — so its session, §20's CSRF origin and the SAML return are the API's own, as the reference console's are.
  		# Its build is served by `vite preview` (`make admin-ui-edge`) with Vite's `base: '/admin/'`, so the path is NOT
  		# stripped, and /admin without its slash is redirected rather than met by Vite's base page. Below @api, above the
  		# reference console's catch-all and inside this `route`, for the reasons above. `stream_close_delay` for `vite dev`'s
  		# HMR socket, as below. A 502 here means nothing listens on 7101.
  		# NOT ON app.'s SITE: the faculty front-end's origin never serves the operator's console — `make verify`'s parity
  		# check strips exactly these five lines and fails if app.'s site carries them.
  		redir /admin /admin/ 308
  		@admin path /admin/*
  		reverse_proxy @admin host.docker.internal:7101 {
  			stream_close_delay 1h
  		}
  ```

  `mail/team.ts`: `ADMIN_CONSOLE` and the three links through it; its header comment names `admin-ui`'s `BASE`. `launch.ts`: its constant
  and the step-6 check through it. `infra/lib/common.sh`: `PORT_ADMIN_UI=7101` beside `PORT_CONSOLE`, commented; `doctor.sh` drops its local
  copy. **`scripts/verify.sh`** — three changes:
  - **NEW `console_serves_admin`** (`check "the host reaches the administrator's console at https://$CONSOLE_HOST/admin/"`): `curl -sS -w
    ' [%{http_code}]' "https://$CONSOLE_HOST/admin/"` → **`[502]` passes only while nothing listens on `$PORT_ADMIN_UI` AND the edge's
    loaded config** (`curl -s http://127.0.0.1:$PORT_CADDY_ADMIN/config/apps/http/servers/srv0/routes`, read by `node -e`) **has, under the
    console's host, a handler dialling `host.docker.internal:7101` ahead of the one dialling `:7104`** (Decision 15); `[200]` with `id="root"`
    and `<title>Manifest operations</title>` passes; `<title>Manifest</title>` FAILS naming *"the reference console answered — the /admin
    route is missing or below its catch-all"*; `manifest OK host=` and the `@outside` body fail as in `console_serves_host`.
  - **`app_site_is_the_consoles`** strips from the console's block exactly the five-line run above **as one contiguous run** (the awk reads
    the run, not any matching line), then compares as before; and fails if the app's block holds `@admin` or `redir /admin`. Its echo says
    *"…; the console's /admin run excepted"*. The check's count does not move.
  - **`console_refuses_platform_container`** asks `/admin/` as well as `/v1/me` from the container and wants the `403` body for both.
  **`EXPECT_VERIFY` + 1 on whatever `main` carries at L1** (67 at `4cb1f2c9`; FE-32 may move it first, and BYOA's Task 8 adds one later), in
  L1's landing commit, with its dated comment.
- [ ] **Step 4: `scripts/admin-ui-edge.sh`** — `start`: if 7101 listens, it must answer `http://127.0.0.1:7101/admin/` with the title AND
  be the pid in `.manifest/admin-ui-edge/pid` — then it is stopped first; anything else on 7101 is refused, naming `lsof`'s line; then
  `pnpm --filter @manifest/contract build`, and **with `MANIFEST_MOCK` unset**, from `packages/admin-ui`, `node node_modules/vite/bin/vite.js
  build --outDir "$ROOT/.manifest/admin-ui-edge/dist" --emptyOutDir` and `nohup node node_modules/vite/bin/vite.js preview --outDir
  "$ROOT/.manifest/admin-ui-edge/dist" >"$LOG" 2>&1 &` with `$!` written to the pid file (`[M4]`: one process); it waits up to 30 s for the
  title on 7101, and prints `https://console.manifest.internal/admin/`. `stop`: TERM the recorded pid, ten seconds, KILL, the pid file
  removed; a pid file whose process is gone or does not hold 7101 is removed and said, never signalled. `status`: the pid, its port, its
  build's time (`.manifest/admin-ui-edge/dist/index.html`'s mtime). **Never by pattern.** The `Makefile`'s `admin-ui-edge` target runs
  `start`.
- [ ] **Step 5: Run them; they pass. The gates** in the worktree (FREE): `admin-ui` and `packages` twice; `team.test.ts` alone; `pnpm lint`,
  `pnpm typecheck`, `pnpm format:check`; `bash -n` on every changed script. (`make verify` cannot see the worktree's Caddyfile — fact 3 —
  and `records.test.ts` runs at L1.)
- [ ] **Step 6: Commit** (the branch, before the landing):
  ```bash
  git add packages/admin-ui/src/base.test.ts scripts/admin-ui-edge.sh
  git commit -m "feat(edge): the administrator's console at https://console.manifest.internal/admin/ — a static run to 7101 in the console's site; make verify's check and the parity check's one exception; the team's links under /admin, with records.test.ts and demo-launch's step 6; make admin-ui-edge" -- infra/caddy/Caddyfile infra/lib/common.sh scripts/verify.sh scripts/doctor.sh scripts/admin-ui-edge.sh Makefile packages/control-plane/src/mail packages/control-plane/src/launch/records.test.ts packages/journey/src/launch.ts packages/admin-ui/src/base.test.ts
  ```
- [ ] **Step 7: LANDING 1, and the edge live** (*How this plan is to be executed*'s sequence — `records.test.ts`'s changed line green in
  both `pnpm test` runs; no G3 — no `packages/mock` or `packages/contract` file). Then, **from the shared checkout**, in the same window:
  1. `make up` → the re-bind restart (*"the edge cannot see the current Caddyfile …"*: the merge replaced the inode) or *"Caddyfile changed —
     reloading the edge"*; both drop the runtime routes;
  2. **`bash scripts/gateway-controls.sh start local`** (driver 1) and **`DEMO_LAUNCH_SLUG=launchpath-control DEMO_LAUNCH_STOP_AFTER=6 bash
     scripts/demo-launch.sh`** — **step 6 green: five team emails, each linking under `/admin`** (C1, through the real entry point);
  3. **G4**: `bash scripts/gateway-controls.sh start real`, the boot line's `capableModel`/`gatewayModels`, one model call (the brief's);
  4. `make admin-ui-edge`; `make doctor` → `EXPECT_DOCTOR` passed, 0 warnings, 7101 among Manifest's; `make verify` → `EXPECT_VERIFY` passed,
     0 failed — `console_serves_admin` on its `[200]` branch;
  5. `curl -sS https://console.manifest.internal/admin/queue | grep -c '<title>Manifest operations</title>'` → 1; `…/admin` → `308`
     `Location: /admin/`; `…/adminx` → the reference console's title; `https://app.manifest.internal/admin/` → not `Manifest operations`;
     `https://console.manifest.internal/v1/me` → `401 UNAUTHENTICATED`, unchanged;
  6. `bash scripts/admin-ui-edge.sh stop` → `make verify`'s new check on its `[502]` branch, PASS (the loaded config read); `make admin-ui-edge`
     again — **7101 is left running** (Decision 4).
- [ ] **Step 8: The documents' port lines, in the shared checkout** (M9; after `git status --short` shows each clean of a peer's edit) — the
  demo's `http://127.0.0.1:7101` and 7113 become `http://127.0.0.1:7115/admin/` and 7114 in RUNBOOK (*Running the administrator's console*,
  l.669-682, l.722), WALKTHROUGH (l.398), ORIENTATION (l.309-311, §3's code map) and TRAPS (l.2938); one sentence in each that 7101 is now the
  platform's console through the edge (`make admin-ui-edge`), the rest of the edge's documentation following at L3:
  ```bash
  git commit -m "docs: the admin console's demo on 7115/7114 and 7101 the platform's through the edge — the port lines after P11b's L1" -- docs/superpowers/RUNBOOK.md docs/superpowers/WALKTHROUGH.md docs/superpowers/ORIENTATION.md docs/superpowers/TRAPS.md
  ```
- [ ] **Step 9: The negative controls** (each predicted first): (a) the run moved BELOW the `7104` catch-all — in the worktree, a unit break:
  `base.test.ts`'s order case red; **and, once, live** (*The live controls*: the shared checkout's landed Caddyfile edited, never committed;
  `make up` — its re-bind restart — and 7100 restarted; read red; `git checkout -- infra/caddy/Caddyfile`, `make up` and 7100 restarted again;
  `git status --short` clean): `make verify`'s `console_serves_admin` red with *"the reference console answered"*; (b) the run copied into
  `app.`'s site (worktree): `base.test.ts`'s `app.` case red, and — in the shared checkout, statically, no `make up` — `make verify`'s parity
  check red, restored by `git checkout`; (c) `team.ts`'s links written without the constant (worktree): **`team.test.ts` and `base.test.ts`'s
  third case red** (M2). **A control the classifier refuses** (a Caddyfile edit can read as a weakening) goes to the coordinator as one
  restore-safe script for Rich (the memory *Negative controls: Rich runs a script*), never round.

---

## Task 4: The acceptance's headless half — `make demo-admin-edge`, written and landed (sitting 4), then run (sitting 5)

**Sitting 4 — Steps 0–5.** **Step 0 first: the Docker tier L1 owes**, from the shared checkout, once, in the background, at the
coordinator's **"7100 is yours" and HOLD** (`make up`; the chat model warm; `docker network ls -q | wc -l` first; **7100 STOPPED** — its set
watcher; never beside a Vitest run): expected the count in ORIENTATION §2's row, unmoved (P11b adds no Docker case); a red is A/B'd against
`main` before L1 before it is called a known chance red (TRAPS.md). **Then G4.** While it runs, Steps 1–3 are written **in the worktree**
(no Vitest, no edit in the shared checkout). **Sitting 5 — Steps 6–8**, all from the shared checkout, at *"7100 is yours"*.

**Files:** Create `packages/admin-ui/walk/cdp.ts`, `walk/edge.ts`, `scripts/demo-admin-edge.sh`. Modify `walk/walk.ts`,
`packages/admin-ui/tsconfig.json`, `Makefile`, `scripts/ci-acceptance.sh`, `scripts/offline-acceptance.sh`.

**Interfaces:**
- Consumes: `BASE`; `scripts/admin-ui-edge.sh` (Task 3); `scripts/demo-launch.sh`'s `DEMO_LAUNCH_SLUG`/`DEMO_LAUNCH_STOP_AFTER` (fact 18).
- Produces: `walk/cdp.ts` — `connect(profileDir: string): Promise<Browser>` (Chrome's port read from the profile's `DevToolsActivePort`;
  every call failing after 30 s naming its method); `Browser.newPage(options?: { isolated?: boolean }): Promise<Page>` — `isolated` opens
  the page in a new browser context (`Target.createBrowserContext`), **its own cookies**; `Browser.consoleLines(): string[]`;
  `Browser.close(): Promise<void>`; and on `Page` **the helpers `walk.ts` has today as module-level functions, moved under the same names**
  — `evaluate<T>`, `until`, `go`, `key`, `press`, `button`, `fill`, `click`, `shot` (`walk.ts:159-260`) — with `go(url)` taking an absolute
  URL. `ageWords(fromIso: string, now: number): string` (`walk.ts:294`, the walk's copy of the drawing's age words) moves with them, for
  both walks. `make demo-admin-edge`; `DEMO_ADMIN_EDGE_STOP_AFTER=1–11`.

- [ ] **Step 1: `walk/cdp.ts`, moved** — the CDP plumbing out of `walk.ts` (fact 12) into `connect`/`newPage`, the helpers unchanged in
  behaviour; `walk.ts`'s checks change only their receiver (`page.evaluate(…)`); `tsconfig.json` gains `"allowImportingTsExtensions": true`
  (`[M3]`); `walk.ts` imports `./cdp.ts` and `../src/base.ts` (Task 2's string replaced).
- [ ] **Step 2: `scripts/demo-admin-edge.sh`** — step 0: which driver answers (`source_driver`, `scripts/lib/api.sh`), refusing real GitHub
  by name as the demos do; Chrome present; Mailpit's API on 7112; **the reference console answering on 7104** (`console_is_ours`'s question —
  check 10 and the console lines need it; refused with *"start the reference console: `pnpm --filter @manifest/console preview`"*, M1);
  the edge's `/admin/` answering the title or `502`. Step 1, **the seed**: `DEMO_LAUNCH_SLUG=launchpath-adminedge-local` (driver 1) or
  `launchpath-adminedge-github` (the fake), `DEMO_LAUNCH_STOP_AFTER=4 bash scripts/demo-launch.sh` — its exit status and its time. Step 2,
  **7101**: ours (asked, and the pid file's) → `admin-ui-edge.sh start` (rebuilt, restarted); free → started, and stopped at the end; anything
  else → refused. Step 3: Chrome headless, `--remote-debugging-port=0`, one fresh profile (P11's Decision 17) — the operator and the
  instructor each in **an isolated browser context of it** (`newPage({ isolated: true })`), so their cookies never meet. Step 4: the walk. A
  `trap` stops Chrome's tree (TERM, ten seconds, KILL), removes the profile and leaves 7101 as found; it prints `every check passed` last.
- [ ] **Step 3: `walk/edge.ts` — eleven checks, each asserting a shape** (`EDGE_ORIGIN` default `https://console.manifest.internal`; every
  path from `BASE`; the API asked from the page itself, with its own cookie, through `fetch`):
  1. **The sign-in round trip**: the operator's isolated page opens `/admin/` → the IdP's form (the URL on `idp.manifest.internal`) →
     `operator`/`operator` → back on **`/admin/queue`**; `document.title` `Manifest operations`; the rail names `GET /v1/me`'s
     `displayName` with *Platform administrator*; the cookie `__Host-manifest_session` (CDP `Network.getCookies`) is `Secure`, `Path=/`; a
     rail click to Fleet and back keeps the page (no `Page.frameNavigated`); **`/admin` typed bare → `/admin/queue`** (the edge's `308`).
  2. **The queue is 7100's**: `GET /v1/queue` from the page; **the seed's project holds exactly `release-approval` and
     `privacy-assessment-to-submit`**, both in *Waiting on us* as rows; the headline computed from our band (`ageWords`, as P11's walk reads
     it); both bands' row counts equal the API's.
  3. **The release, signed off through the real step-up**: the seed's `release-approval` row → its pane names the request **asked through
     the token `launch agent <runId>`** (the project's stream, through the edge); *Take the preview* — **awaited up to 120 s** (a model
     call), the press disabled while it is taken; the diff drawn; a reason typed; *Approve* → `403 STEP_UP_REQUIRED` on screen → the IdP's
     form again → `operator` → back on **`/admin/releases/<id>/approval?preview=<previewId>`**, the same preview, the reason still in the
     field → *Approve* → *"… approved this release for production."*; **read back** (`getApproval`): approved, by the operator, the reason
     as typed, `previewId` the pane's, `imageDigest` the release's.
  4. **The team submits the assessment**: its row → *Submit to the Privacy Office* with `PIA-EDGE-<runId>` → the row in *Waiting on UBC*;
     read back (`getLaunchRecords`): `submitted`, the reference, `submittedBy` the operator.
  5. **The Privacy Office's answer**: *Record it*, `approved` → the row gone from both bands; read back `approved` — the real platform
     validating the body P11's pane sends (P11's C1, now against `records.ts` itself).
  6. **The team's emailed links**: from Mailpit's API, **the messages whose text names the seed's project id or its release id** (never a
     search alone — Decision 8) — the sign-off's and the send's (fact 18); each one's links match `https://console.manifest.internal/admin/…`
     exactly (three distinct); each opened in the page → the admin console's screen for that item (the release's decision sentence, the
     records screen, the queue) and **never `<title>Manifest</title>`**; then those messages deleted by id.
  7. **The fleet**: `/admin/fleet` → the seed's project's row from `listFleet` — its slug, its owner, its staging cell *healthy · 1*.
  8. **The project's page**: the seed's events include the operator's approval, signed; the token named with its minter; the records.
  9. **A non-administrator**: the instructor's isolated page → `/admin/` → the IdP → `instructor` → *"This console is for platform
     administrators. You're signed in as …"*, and `GET /v1/queue` from that page answers **`403 FORBIDDEN`** — the real role, not a mock
     option.
  10. **The origin's other tenants are untouched**: `https://console.manifest.internal/` → `<title>Manifest</title>` (the reference console);
      `https://app.manifest.internal/admin/` → not `Manifest operations`.
  11. **Health and Settings read 7100** (M8): `/admin/health` draws its five panels from the real fleet, the seed's project counted where the
      fleet's answer puts it, none an error; `/admin/settings` lists exactly `listBlueprints`' names, every other row the admission.
  Then **the console's own lines**: only those this console is known to print (`/v1/me` `401` before the sign-in; `/favicon.ico` `404`
  **through the edge — the reference console's answer, measured on Step 6's first run** (M1); the approve's `403 STEP_UP_REQUIRED`; a project's
  socket closed before it opened when the page left for the IdP) — anything else fails the walk. Each check opens its own page and reads its
  own ids; each failure names its check; every CDP call fails after 30 s naming its method.
- [ ] **Step 4: The acceptances' steps, the gates, the commit.** `ci-acceptance.sh` **step 15**, `make demo-admin-edge`, on either driver
  (`NOT RUN` with no control plane), its comment saying what it walks and that it seeds through `demo-launch`; `offline-acceptance.sh`
  **step 22**, and both scripts' header counts (*"twenty-three … 0 to 22"*). The gates in the worktree (after the Docker tier, under FREE):
  `admin-ui` and `packages` twice, lint, typecheck, format; **`make demo-admin` 9/9** (the move proves itself); `bash -n` on the script.
  ```bash
  git add packages/admin-ui/walk/cdp.ts packages/admin-ui/walk/edge.ts scripts/demo-admin-edge.sh
  git commit -m "test(admin-ui): make demo-admin-edge — the console walked through the edge on 7100's real queue, signed in and stepped up at the IdP, eleven checks; one CDP module for both walks; steps 15 and 22" -- packages/admin-ui/walk packages/admin-ui/tsconfig.json scripts/demo-admin-edge.sh scripts/ci-acceptance.sh scripts/offline-acceptance.sh Makefile
  ```
- [ ] **Step 5: LANDING 2** (*How this plan is to be executed*'s sequence; **no G3** — no `packages/mock` or `packages/contract` file;
  `EXPECT_TESTS`/`EXPECT_FILES` only if a test moved). Its live step: `make demo-admin` 9/9 from the shared checkout. **Sitting 4 ends here.**
- [ ] **Step 6 (sitting 5): Run it, from the shared checkout, three times on driver 1** (`bash scripts/gateway-controls.sh start local`) —
  fresh (no `launchpath-adminedge-local`); again (the seed deletes and remakes its unlaunched project); with 7101 FREE at the start (the script
  starts its own and stops it) — **and once on the GitHub fake** (`make github-up`, then **`bash scripts/gateway-controls.sh start fake`**).
  Record each time, the seed's share of it, and the console lines measured through the edge (M1). G4 after.
- [ ] **Step 7 (sitting 5): The negative controls — each a LANDED file broken in the shared checkout, never committed** (*The live
  controls*), predicted first: (a) `routePath` without `BASE` (`make admin-ui-edge` on it) → **check 1 red on the address** — the shell
  `replaceState`s `/admin/` to `/queue`, and the reload of that lands on the reference console (M3); (b) `stepUpUrl` without the base (`make
  admin-ui-edge`) → check 3 red (back from the IdP on the reference console's approval page, the reason gone); (c) `team.ts`'s links without
  the constant (7100 restarted on it, `gateway-controls.sh start local`, and the seed re-run) → check 6 red (the release's link opens the
  reference console); (d) `vite.config.ts` without `allowedHosts` (`make admin-ui-edge`) → check 1 red, Vite's *"Blocked request"* on screen;
  (e) `gateOf` letting any signed-in person in (`make admin-ui-edge`) → check 9 red, the instructor's `403 FORBIDDEN` on the queue named. Each
  restored with `git checkout -- <path>` and the same rebuild or restart; `git status --short` read clean before the next. A control that
  stays green is a question.
- [ ] **Step 8 (sitting 5): A defect the runs find** is fixed **on the branch in the worktree**, test-first, never in the shared checkout,
  and lands at L3 — Task 6 runs the acceptance again from the shared checkout after it.

---

## Task 5: *Load rehearsals* on the project's page, and the demo fleet's own

**Sitting 6, first. In the worktree.**

**Files:** Modify `packages/admin-ui/src/api.ts` (+ `api.test.ts`), `src/project-state.ts` (+ test), `src/screens/project.tsx` (+ test),
`walk/walk.ts` (check 8); `packages/mock/src/fleet.ts`, `packages/mock/src/fleet.test.ts`.

**Interfaces:**
- Consumes: `LoadRehearsal`, `LoadRehearsalList` (contract, fact 21); the project's `audience` from `getProject`; `State`
  (`src/system/state-of.ts:2`: `'working' | 'waiting' | 'attention' | 'steady' | 'notyet'`).
- Produces: `api.listLoadRehearsals(projectId: string): Promise<Schemas['LoadRehearsalList']>`; `loadRehearsalsOf(audience:
  Schemas['Project']['audience'], list: Schemas['LoadRehearsalList'] | null): LoadRehearsalsSection | null`, where `LoadRehearsalsSection =
  { empty: string } | { rows: LoadRow[] }` and `LoadRow = { id; state: Schemas['LoadRehearsal']['state']; word: string; tone: State; when:
  string; release: string; answered: string | null; p95: string | null; reason: string | null }`.

- [ ] **Step 1: The failing tests.** `project-state.test.ts`:
  - `loadRehearsalsOf({ scale: 'class', … }, { items: [] })` → `null` — a class is never rehearsed, so no section;
  - `large_course` with `{ items: [] }` → `{ empty: 'Not rehearsed yet. …' }` — the sentence says the owner, a collaborator or an
    administrator runs it, and never names an operation;
  - a `failed` run (spread from `fixtures.LOAD_REHEARSAL_FAILED`) → one row: `state: 'failed'`, the word *Fell over*, `tone: 'attention'`,
    the share answered and the p95 from its `evidence` as the platform counted them, its `reason` verbatim, the release's id short, `when`
    its finished day in Vancouver;
  - `running` → *Running*, `tone: 'working'` (a machine is moving); `passed` → *Passed*, `'steady'`; `teardown_failed` and `abandoned` →
    their own words, `'attention'`; **newest first** by `createdAt`.
  `fleet.test.ts`: `listLoadRehearsals` for `mus-100-listening` → one `failed` run of its staging candidate, valid as `LoadRehearsalList`;
  for every other fleet project `{ items: [] }`; `getLoadRehearsal` of that run → it, of any other id → `404 NOT_FOUND`; **`mock-app`'s
  answer unchanged** (P11's fixed set of default answers); `mus-100-listening`'s `load-rehearsal` item's `why` is the platform's for a
  failed newest run (`[M11]`'s sentence, copied).
- [ ] **Step 2: Run them; they fail.**
- [ ] **Step 3: Build them.** The demo fleet answers both reads per project; the run's ids from `fleetId(…)` (P11's T4: no id twice), its
  times from the fleet's clock, its `releaseId` the candidate's. The project's page reads `listLoadRehearsals` once for a `large_course` or
  `public` app and draws the section with P11's ported `DataTable` and state chip; a refusal is the page's `<Refusal>`. `walk.ts`'s check 8
  also opens `mus-100-listening`'s page and finds *Fell over* with the run's share.
- [ ] **Step 4: Run them; they pass. The gates** (FREE): `admin-ui` and `packages` twice; lint, typecheck, format; `make demo-admin` 9/9.
- [ ] **Step 5: Commit** (the branch):
  ```bash
  git commit -m "feat(admin-ui): Load rehearsals on a large course's page; the demo fleet answers each project's own runs (mus-100-listening's one fell over)" -- packages/admin-ui packages/mock/src/fleet.ts packages/mock/src/fleet.test.ts
  ```

---

## Task 6: The one whole-branch review, its fix wave, LANDING 3, the documents

**Sitting 6, after Task 5.**

- [ ] **Step 1: The plan's one whole-branch review** — a fresh read-only reviewer (a subagent, the most capable model) on L1's and L2's
  commits on `main` and `git diff main...p11b-admin-edge`, against this plan, the design's §11–§12 and *Review Focus*; findings ranked, line
  references checked against the code. It may read; it runs nothing that touches 7100.
- [ ] **Step 2: Its one fix wave**, each fix test-first (red, then green), each named in the sitting's record; a finding not taken is ruled
  with its reason and its cost. Sitting 5's fixes (Task 4 Step 8) are on the branch beside it.
- [ ] **Step 3: G3's notice** (`packages/mock/src/fleet.ts` and its test — the demo fleet's load rehearsals; **no default answer changes**;
  `fleet.ts` enters manifest-app's typecheck through `index.ts` as before) — and wait for *"land it"*.
- [ ] **Step 4: LANDING 3** (*How this plan is to be executed*'s sequence; `EXPECT_TESTS`/`EXPECT_FILES` in the landing commit). Then from the
  shared checkout: `make demo-admin` 9/9 and **`make demo-admin-edge` 11/11 — the landed tree** (`make admin-ui-edge` restarted on it by the
  script); G4.
- [ ] **Step 5: The documents, in the shared checkout** (after `git status --short` shows each clean of a peer's edit): **RUNBOOK** — *Running
  the administrator's console* in two halves: **through the edge** (`make admin-ui-edge`; <https://console.manifest.internal/admin/>; sign
  in as `operator` once `scripts/admin-grant.sh grant opr000001 …` has run on this database; the served build is `.manifest/admin-ui-edge/dist`
  — run it again after a change; 7101 is left running like 7104, stopped only by `admin-ui-edge.sh stop`; sign-out lands on `/`) and **the
  demo** (`make admin-ui` on 7115 with its mock on 7114; 7113 is BYOA's); `make demo-admin-edge`, what it seeds and that it needs the
  reference console on 7104; **WALKTHROUGH** — *The administrator's console through the edge* (*What Rich does* 3, click by click, each with
  what must be true); the design's banner, §11 decision 25's cost (*"three links"*), §12 and §13 (*served through the edge*). Neither states a
  count.
  ```bash
  cd /Users/rich/Developer/manifest
  git commit -m "docs: the administrator's console through the edge — RUNBOOK, WALKTHROUGH and the design (P11b Task 6)" -- docs/superpowers/RUNBOOK.md docs/superpowers/WALKTHROUGH.md docs/superpowers/2026-09-27-admin-console-design.md
  ```

---

## Task 7: `make ci-acceptance` whole; Rich clicks it; the plan closes

**Sitting 7. Alone, and last. Rich at the machine for Step 2 (G9: the coordinator opens it with ⚠ BLOCKED ON YOU and a `PushNotification`
once Step 1 is done).**

- [ ] **Step 1: `make ci-acceptance` once, whole, on driver 1** (I2), on the final tree, in the background, at *"7100 is yours"* and HOLD —
  **before the click's seed**, because its `pnpm test` truncates 7100. Its summary recorded: step 13 (`make demo-admin`, on 7114/7115) and
  **step 15 (`make demo-admin-edge`) PASS**, step 7 (`make demo-launch`, its step 6 under `/admin`) PASS, every count as `EXPECT_` says. A red
  is a finding before the click, fixed test-first (a fourth landing) or named for Rich. G4 after.
- [ ] **Step 2: The real queue for his click** — 7100 on driver 1 (`gateway-controls.sh start local`); `DEMO_LAUNCH_SLUG=launchpath-adminedge-click
  DEMO_LAUNCH_STOP_AFTER=4 bash scripts/demo-launch.sh`; `bash scripts/admin-ui-edge.sh status` (serving, the landed build); hand him
  <https://console.manifest.internal/admin/>, **`operator` / `operator`**, and *What Rich does* 3 one click at a time, each with what must be
  true. **Record his words verbatim**, with `date`'s time.
- [ ] **Step 3:** Anything he finds is a finding in this sitting's record: fixed here only if it is small and test-first (then a fourth
  landing, as L3) — otherwise named for a minors round or the next plan, his call.
- [ ] **Step 4: The close-out** (shared checkout, documents only, by pathspec): this plan **EXECUTED** (its banner, the sittings table, *What
  executing this plan found*); the roadmap's P11b section and the P11 row's last sentence; ORIENTATION's summary, §2's table (a row), §3's
  map, §7a (a row), §7e only if the coordinator gives the turn, and §7e's *HOW THIS RUN WORKS* (**7101 is part of the machine as found,
  beside 7104**); CLAUDE.md's *State* (a plan finished: its row) and **its *Outstanding* offline run naming step 22** (I2); TRAPS.md (this
  plan's traps — a compose command from a worktree re-points the platform's mounts; 7113 is BYOA's; the parity check's one exception; the
  demo's build empties `packages/admin-ui/dist/`); the decisions page (his words). **The `.env` symlink removed** (`ls -la` first; the link
  only), then `git worktree remove /Users/rich/Developer/manifest-p11b` and `git branch -d p11b-admin-edge` (after L3 is on `main`).
- [ ] **Step 5: The machine, as found** (CLAUDE.md's *Machine cleanup*): the three cleanup scripts bare, then `--apply` where they name
  anything of this plan's; **7101 serving the landed build** (`admin-ui-edge.sh status`); 7114 and 7115 free; no walk's Chrome
  (`pgrep -fl 'remote-debugging-port=0'`) and no walk profile; `git worktree list` the shared checkout alone. The `launchpath-adminedge-*`
  and `launchpath-control` projects stay on 7100, unlaunched, like `demo-launch`'s own control projects — named in the record.

---

## What this plan does not build

- **Rich's click-6 question** — unless he chooses it (*the option*, below).
- **Who handed a record back, or recorded UBC's answer** (P11's sitting 8 M6: the records carry no `recordedBy`) — the stream's `*.returned`
  and `*.recorded` events name them; the option's (a) would add the hand-back's half.
- **Signing out back to `/admin/`** (Decision 7).
- **The console on UBC's infrastructure** — the same route on the platform's production console origin is a deployment's job (Phase 4/5);
  Spec action A says where it is served.
- **People, Spend, Audit; any owner's action; any setting's change; every other API gap in the design's §10** (A4, A5's remainder, A7–A9's,
  A10–A18, A20, A21) — each a finding for a platform plan.
- **A load rehearsal RUN through the edge in the acceptance** (~13 minutes, `make demo-load`'s) — the section is held by its unit cases, the
  demo fleet's walk and B's own acceptance.
- **The agent sessions table walked** — the seed starts no agent session (P11's sitting 7 F3, still).
- **`vite dev` through the edge as a walked path** — it works by the reference console's measured route (`hmr` told the public port; `[M7]`
  measures the upgrade through `/admin/*`) and is a developer's choice; the served and walked mode is `preview`.
- **The offline acceptance's step 22, run** — Rich's own offline run (CLAUDE.md, *Outstanding*).
- **The reference console's queue headline reading `oldestSince`** (P11's review M12) — the reference console's, not this plan's.
- **Narrow screens; the fleet's table scrolling sideways at 1440; a failed deploy drawn amber** (P11's sittings 6–7) — as P11 left them.

## Spec actions — ONE DRAFTED, NONE APPLIED

**A — §21: where the admin UI is served.** Today §21's inventory row reads *"Admin UI (Vite) | 7101 | Host process"* (l.2243) and *The
front-end in the local topology* says only that *"The reference console and the API share one origin"* (l.2305). After Task 3 the admin UI
is on that origin too. **Proposed words:**

- the row → *"Admin UI (Vite) | 7101 | Host process. Served at `console.manifest.internal/admin/` through Caddy, **on the console's
  origin** — its session, CSRF origin and SAML return are the API's own, as the reference console's are; the Manifest team's emails link
  to it (§26)"*;
- after *"The control plane's SP is registered for that origin."* (l.2312): *"**The admin console is served on that origin too**, under
  `/admin/`, so an administrator signs in once for both consoles; the faculty front-end's origin never serves it."*

*Options:* **(a) apply as worded** — recommended, and REV4's word: §21 is the topology, and it states every other process's address; **(b)
apply the row only**; **(c) leave §21 silent** — nothing in it forbids the path, but a reader of the spec would not know where the console
is. **When:** at sitting 3's open, before Task 3 builds it, or at the close; it does not block the build. **Shared pages swept:** none states
the admin UI's port or address (`grep -n '7101\|admin ui\|console\.manifest' docs/superpowers/specs/*.html` → nothing, 2026-10-16; REV4
re-checked) — unchanged. *Checked and not raised:* §26's *"a link to the item in the admin console"* is made literally true by Task 3, not
changed; §12's *"every route that forwards to the control plane refuses a request arriving from an app or sandbox network"* — the `/admin`
run forwards to the admin UI, not the control plane, and sits behind the same `@outside` guard regardless; the demo's ports are a
development process's, as P11's 7113 was, which §21 never named.

## Contract changes — none

No operation, schema, code or event changes; `@manifest/contract` is read, never written. **G3 is owed once, at L3**, for `packages/mock`
(Task 5: the demo fleet's `listLoadRehearsals` and `getLoadRehearsal` per project — no default answer changes, `mock-app`'s included; held by
P11's fixed-set test). L1 and L2 change no `packages/mock` or `packages/contract` file (`packages/journey` is neither). **FE-32's `1.11.0`**
may land during the build: a rebase brings it, the contract's `dist/` is rebuilt, and nothing here reads what it adds.

---

## Rich's click-6 question — an option, not a task

*Rich, 2026-10-16 09:44:56, at P11's click 6:* ***"why would we not keep a reason for handing it back to help the person out?"*** *— "a
follow up question for later". The design's A19; ORIENTATION §8 Open's first item. Nothing below is in the plan until he chooses it.*

**What is true today** (facts 17 and 22): a hand-back takes no body; its event says who handed it back, never why; the console says
*"Manifest doesn't keep a reason for a hand-back."* beside the button. **Two corrections to the question as ORIENTATION §8 first put it**
(swept with the draft, `531434b2`): no email goes to an owner at all — `mail/team.ts`'s two kinds both go to the team, and `createMailer`
sends only to the team's address (`mail/index.ts:63-72`) — and §26 keeps a person's words out of every email (*"The email carries nothing a
person wrote"*). So a kept reason would reach the owner **in the faculty front-end and the reference console**, on the record and in the
project's events — never by email. (Telling the owner by email that something came back would be a new email kind, a question of its own.)

| | What it is | What it costs |
|---|---|---|
| **(a) Keep it — optional in the contract, always asked by the admin console** *(recommended; REV4 concurs)* | `returnIamRegistration` and `returnPrivacyAssessment` accept `{ reason?: string }` (1–2,000 characters, the limit a gap's answer has, `representations/launch.ts:625`); the record keeps `returnedReason`, `returnedAt` and `returnedBy` until its owner's next send clears them (closing P11's M6 for hand-backs); the `*.returned` event quotes it in its sentence and carries it in `machineDetail`; the admin console's *Hand it back* asks for it and will not send without one; an old client's bodyless call still works | **A contract minor** (two request schemas, three fields on two records, two operations' words — *"travels outside the record"* goes); **a migration** (two tables); `launch/records.ts`, `api/routes/launch.ts` (today `NO_BODY`, `:650`, `:686`), the events; the mock (its fixtures, its default routes, the demo fleet's hand-back, any stage that shows a handed-back record — **G3**); the reference console's owner half; `admin-ui`'s pane; `make demo-launch`'s step 5 sends one and reads it back; `docs/api`'s guide; **a spec action** (§6's two records gain the three fields); **the faculty front-end's own follow-up** (an FE-n in its `docs/api-findings.md` — its session's, never ours); probably the Docker tier (the events' types sit under `observability/` — its first step reads). Its own measurement: whether the contract layer accepts an ABSENT body for an optional one (P5b's sitting 3 F1: the layer once keyed bodies on the method). **About one sitting**, plus the front end's |
| **(b) Keep it — required** | The same, but a hand-back without a reason is `400 REQUEST_INVALID` | (a)'s cost, and **a request that was valid becomes invalid** — every caller changes in the same commit (the reference console, the mock, `demo-launch`, `admin-ui`; the faculty front-end never hands back) — a compatibility break in a minor version |
| **(c) Not now** | The console's sentence stands; why it came back travels outside Manifest, as UBC's questions do | Nothing; the owner learns why from the team directly |

**Where it would go if chosen:** **as this plan's Task 8 in a sitting 6b**, after Task 6 and before `make ci-acceptance` and Rich's click,
with its own G3 notice and the contract's next minor at its landing (**`1.11.0` if it lands before FE-32's Task 3, else `1.12.0`** —
whichever of the two lands second takes the higher number, the coordinator's sequencing), so the click shows it — **or as a small plan of
its own after P11b**, keeping P11b free of contract change. *Recommended:* **(a), as a small plan of its own** — it changes the contract, the
spec and the faculty front-end, and a review of this plan should not have to judge those too; and the console's sentence is honest until
then. *Cost of the other placement:* one sitting here and a contract notice inside P11b's lane.

---

## What the self-review caught

*Run by the writer against the code at `4cb1f2c9`, the design and the run's brief, before the first commit (`531434b2`); each fixed in place.*

**Found while reading the code, before a line was written** — each is built in, and each would have cost a sitting:

1. **The demo's mock port is another plan's** (fact 6): BYOA's approved plan names 7113. Hence Decision 3 — and 7115 for the demo's console,
   so the platform's 7101 never blocks `make demo-admin` (fact 7). Told to `manifest-coord6`; BYOA's plan carries a dated note.
2. **`make verify`'s parity check goes red on the first landing** (fact 4) — it compares the two sites directive by directive. Task 3
   teaches it the one exception as a contiguous run, and a control proves `app.` cannot carry it.
3. **The edge reads the shared checkout's file by absolute path** (fact 3) — so every live check, `make verify` and the Docker tier run
   from the shared checkout after a landing, and nothing that recreates the edge is run in the worktree. Told to `manifest-coord6`, which
   reads G8's *"in a manifest worktree"* through this plan.
4. **The step-up's return is the one hard-coded path** (fact 10) — moved onto `routePath`, so no path is written in two places.
5. **A19's premise** (*"… and in the email"*) is wrong (fact 17) — corrected in the option; ORIENTATION §8 swept with the draft.

**Caught by the self-review of the draft:**

6. **Task 1 Step 2 ended in a half-finished thought** about what to do if Vite does not proxy outside its base — now one decided fallback.
7. **Task 4's helper names were invented** (`openPage`, `waitFor`, `text`) — replaced by `walk.ts`'s own (`evaluate`, `until`, `go`,
   `press`, `button`, `fill`, `click`, `shot`, `ageWords`, read at `walk.ts:159-294`), moved under the same names.
8. **Two Chrome profiles for two people** — one Chrome, two isolated browser contexts (`Target.createBrowserContext`): separate cookies, one
   process to stop.
9. **The section's tones were words** (*"the needs you tone"*) — now the console's own `State` values (`src/system/state-of.ts:2`).
10. **Check 6 read the email for *a* link** — now three distinct links, each matched exactly and opened, and the messages deleted after.
11. **The seed's emails were assumed to be in Mailpit** — read from `launch.ts` (fact 18): step 6 deletes them, so after step 4 they stay.
12. **Task 2's walk cannot import `src/base.ts` before Task 4's tsconfig line** — Task 2 keeps the string with a comment until Task 4.

**What the self-review missed, and the review found:** C1's two readers (it grepped `mail/` and the console, not the database tests and the
journey); C2 (it put the acceptance's runs in the sitting that writes them, a landing late — against its own rule); I1 (it cited
`demo-launch.sh:80-91` and did not read the slug's pattern at `:86`). Each is below.

---

## Revised to the review — what changed, finding by finding (2026-10-16, ~16:25–16:50 PDT, read from the clock)

*The review: [`2026-10-16-review-of-p11b-plan.md`](./2026-10-16-review-of-p11b-plan.md), `2c47ba24`, by `manifest-review4`. Verdict
**approve with fixes**. Each finding was checked against the code at `2c47ba24` before it was taken — `records.test.ts:1159-1161`,
`launch.ts:1353-1416`, `demo-launch.sh:84-92`, `app.tsx:48-52`, `walk.ts:348`, `demo-admin.sh:42-47`, `.gitignore:9/:34/:37/:48`,
`gateway-controls.sh:6-11`, the documents' port lines and BYOA's Task 8 — and every one holds. **All fifteen are taken; none is argued.**
A widened grep (C1's fix) found no third unlisted reader: the email's three link shapes appear in `team.test.ts`, `records.test.ts` and
`launch.ts` alone; every other hit is an API path.*

| Finding | What changed, and where |
|---|---|
| **C1** — two unlisted readers of the team's links (`records.test.ts:1159-1161`, red at L1; `launch.ts:1384-1386`, `make demo-launch` step 6, red after L1 and never run) | Fact 17 names all three readers; **Task 3's *Files*, Step 1 and Step 3** change both (`launch.ts` through its own `ADMIN_CONSOLE` — the journey's boundary forbids importing `BASE`); `base.test.ts`'s third case holds both constants; the Global Constraints' and File Structure's lists; **Task 3 Step 7.2 runs `DEMO_LAUNCH_SLUG=launchpath-control DEMO_LAUNCH_STOP_AFTER=6` at L1**; `records.test.ts` runs first in L1's `pnpm test` (*The gates*); Task 1's `[M12]` widened to every reader; Review Focus 3; Decision 6. And I2's `make ci-acceptance` (step 7) |
| **C2** — the acceptance run and its live controls before they land, from a worktree that has no `infra/ca`, no `infra/secrets` and no 7101 pid file | **Task 4 lands at its own L2 (no G3) before it is run**; its runs and controls are **sitting 5**, from the shared checkout; Task 5 and the fix wave land at **L3** (Decision 13 — under Rich's delegation, recorded); **seven sittings, seven tabs** (the table, *What Rich does*); ***The live controls***: a landed file broken in the shared checkout inside the window, never committed, type-check-clean, restored with `git checkout --`, `git status` read clean — a Caddyfile break through `make up`'s re-bind and a 7100 restart both ways (Task 3 Step 9 (a)); Decision 16; *Every live run is from the shared checkout* names `infra/ca`, `infra/secrets` and `.manifest/`, and every relative single-file mount (REV4's *"understated"*); a defect the runs find is fixed on the branch (Task 4 Step 8) |
| **I1** — `demo-launch.sh:86` accepts only `launchpath-…` | **`launchpath-adminedge-local`, `-github`, `-click`** (Decision 8, Task 4 Step 2, Task 7 Steps 2 and 5); fact 18 states the rule and the slug pattern; `[M10]` measures Mailpit's phrase search against `(launchpath-local)` and `(launchpath-github)`, with a named fallback (`-d1`, `-d2`); the walk picks its emails by the seed's ids, never by a search alone (check 6) |
| **I2** — neither acceptance runner run whole | **Task 7 Step 1: `make ci-acceptance` once, whole, on driver 1, on the final tree, before the click's seed** (it truncates 7100); fact 24; step 22 named in CLAUDE.md's *Outstanding* at the close (Task 7 Step 4) and in *What Rich does* 4 |
| **M1** — the edge walk needs the reference console on 7104 | `demo-admin-edge.sh`'s step 0 requires it (`console_is_ours`'s question), with the command in its refusal; the console lines' `/favicon.ico` measured through the edge on the first run (Task 4 Steps 2, 3, 6); RUNBOOK says so (Task 6) |
| **M2** — control (c)'s predicted `base.test.ts` red could not happen | `base.test.ts`'s third case also refuses an unprefixed `${origin}/queue`, `/releases/` or `/projects/` literal in either file, so (c) is red in both `team.test.ts` and it (Task 3 Steps 1 and 9) |
| **M3** — two controls predicted the wrong first red | Task 2 Step 7 and Task 4 Step 7 (a) predict the address (`replaceState` to `/queue`, `app.tsx:48-52`) and the rail selector that finds nothing; fact 9 and 12 name both lines; Task 2 Step 5 moves the walk's selector |
| **M4** — `/admin` without its slash undecided | **Decision 14**: `redir /admin /admin/ 308`, the first line of the run; the matcher `/admin/*`; the parity strip and `base.test.ts` take five lines; `[M7]` measures it; check 1 types it bare; Task 3 Step 7.5 |
| **M5** — `[M2]`'s HMR probe named the client script | `[M2]` reads the socket's URL from the page (expected `…/admin/?token=…`); `[M7]` measures the upgrade through `/admin/*` |
| **M6** — `console_serves_admin`'s `[502]` could pass for the wrong reason | **Decision 15**: the `[502]` branch also reads the edge's loaded config from its admin API (7119) for the 7101 dial ahead of 7104's; `[M6]` reads that shape first; fact 4 names 7119 |
| **M7** — both modes build into one `dist/` | **Decision 4**: the platform's build is `.manifest/admin-ui-edge/dist` (`--outDir … --emptyOutDir`), its pid and log beside it; `[M4]` measures it; fact 7; the Global Constraints; Review Focus 5; TRAPS at the close |
| **M8** — Health and Settings never seen on the real platform | **Check 11** (Task 4 Step 3); *eleven checks* throughout; `DEMO_ADMIN_EDGE_STOP_AFTER=1–11`; *What Rich does* 3; Review Focus 4 |
| **M9** — the documents lag the ports by two sittings | **Task 3 Step 8**: the port lines in RUNBOOK, WALKTHROUGH, ORIENTATION and TRAPS committed in the shared checkout right after L1 |
| **M10** — four smaller things | `gateway-controls.sh start fake` for the driver-2 run (Task 4 Step 6; fact 20); the Docker tier asks *"7100 is yours"* and HOLD in words (Task 4 Step 0; *The gates*); *"`EXPECT_VERIFY` + 1 on whatever `main` carries"* (Task 3 Step 3; `[M9]`); the design's *"two links"* → three, swept with this revision and again in Task 6 |
| **M11** — BYOA's Task 8 edits both sites | **One sentence added to BYOA's top note** (with this revision): the console's site carries P11b's five-line `/admin` run, which `make verify`'s parity check strips by name — BYOA's `@mcp` lines must be identical in both sites and outside that run; fact 6 |

**Counts after the revision:** seven tasks in **seven sittings**; **three landings**; no contract change; one spec action drafted; G3 once,
at L3; the Docker tier once, after L1; `make ci-acceptance` once, at the close.

---

## What executing this plan found

*Nothing yet: the plan is not approved.*
