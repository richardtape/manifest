# A fresh review of P11b's plan — the administrator's console through the edge (2026-10-16)

> **What this is.** A read-only review by `manifest-review4`, the fourth coordinated run's job REV4 (review 1 of 2), at
> `manifest-coord6`'s GO, under the run's gate G5 and Rich's decision 18 (`4cb1f2c9`, `docs/superpowers/2026-09-30-decisions.md`, the entry
> *"On 2026-10-16 at ~15:10 PDT … THE FOURTH COORDINATED RUN"*). It reviews
> [`2026-10-16-p11b-admin-console-edge.md`](./2026-10-16-p11b-admin-console-edge.md) as committed at `531434b2` (with its sibling `6e4837a6`,
> the 7113 note atop BYOA's plan), **against the code at `531434b2`** (no code changed after `4cb1f2c9`). Every line reference below was
> read at that commit, 2026-10-16 between 16:02 and 16:17 PDT. **Nothing was run**: no test, no Vitest, no 7100, no Docker, no `make`
> target, no probe of the edge. The plan's author (`manifest-p11b-plan`) revises the plan to this review, finding by finding; the coordinator
> then puts it to Rich for approval (G8).
>
> **Read against:** the code (`infra/caddy/Caddyfile` and how the edge mounts it, `infra/lib/ensure-caddy-config.sh`, `packages/admin-ui`,
> `scripts/admin-ui.sh`, `scripts/demo-admin.sh`, `scripts/demo-launch.sh`, `scripts/doctor.sh`, `scripts/verify.sh`,
> `scripts/ci-acceptance.sh`, `mail/team.ts` and every reader of its text, the sign-in, step-up and CSRF paths, `packages/journey/src/launch.ts`,
> the mock's load rehearsals and demo fleet); the design (`docs/superpowers/2026-09-27-admin-console-design.md`, §11 decision 25, §12, A19);
> the P11 plan (*What this plan does not build*, its sitting 8 and 9 records); BYOA's plan (its 7113 claim and its Task 8 edge change);
> ORIENTATION §4, §7e and §8; the spec's §21 and §26 lines that Spec action A quotes; and the fourth run's brief.

---

## P11b — the administrator's console through the edge (`2026-10-16-p11b-admin-console-edge.md`)

**Summary.** `packages/admin-ui` served at `https://console.manifest.internal/admin/` by one static route in the console's Caddyfile site
(below `@api`, above the 7104 catch-all, behind `@outside`, never on `app.`), from `vite preview` of a build on 7101 left running like 7104.
`BASE = '/admin'` in every mode; the demo pair moves to 7114/7115 and leaves 7113 to BYOA. The team's three emailed links move under
`/admin`. `make verify` gains `console_serves_admin` and teaches its parity check one exception. `make demo-admin-edge` seeds 7100's real
queue with `demo-launch`'s steps 0–4 and walks the console headless through the edge and the IdP (ten checks); *Load rehearsals* joins the
project's page. Seven tasks, six sittings, two landings, code on a worktree branch and the edge only from the shared checkout. No contract
change; Spec action A drafted; A19 an option.

**Verdict: approve with the fixes below** — C1, C2, I1 and I2 before Rich approves; the Minors at the author's judgement. The design is
right: a path on the console's origin (the session, CSRF and SAML facts it rests on all hold — *Checked and holding*, below), a static route,
one base in every mode, the demo off 7101 and 7113. What is wrong is where the change reaches (C1, I1) and the execution model at sitting 4
(C2). Each fix is bounded and written out; none needs a second review if the revision takes it as written.

*Counts:* **2 Critical, 2 Important, 11 Minor.**

### Critical

- **C1. The team's links move, and two readers the plan does not list assert the old ones — one goes red at L1 in a file the plan may not
  change, the other lands `make demo-launch` broken and nothing in the plan would notice.**
  - Task 3 moves `mail/team.ts`'s three links under `/admin` (Decision 6, plan:336-339; Task 3 Step 3, plan:642). Fact 17 (plan:266-270)
    names `mail/team.test.ts` as their holder. There are two more:
    - **`packages/control-plane/src/launch/records.test.ts:1159-1161`** — `expect(email).toContain('https://console.manifest.internal/projects/${projectId}/records')`.
      `…/admin/projects/<id>/records` does not contain that string, so **L1's `pnpm test` is red** (the `unit` project — which Task 3
      Step 5's worktree gates never run). The Global Constraints (plan:375-379) allow only `mail/team.ts` and `team.test.ts` in the control
      plane, so sitting 3 cannot fix it without leaving its plan.
    - **`packages/journey/src/launch.ts:1384-1386`** — `make demo-launch`'s step 6 (`theTeamsEmails`) asserts every team email contains
      `${origin}/queue` and `${origin}/projects/<id>/records` or `${origin}/releases/<id>/approval`. After L1 none does: **step 6 goes red**.
      The plan never runs it — its seed stops after step 4 (Decision 8), and no sitting runs `make demo-launch` whole or `make
      ci-acceptance` — so it lands on `main` red, and the next person to run the launch path's acceptance meets it cold.
  - **Fix.** Add both files to Task 3's *Files*, the Global Constraints' list and File Structure; Task 3 Step 1's failing tests include
    `records.test.ts`'s line under `/admin`; `launch.ts`'s check builds its expected links with `/admin` (and names `admin-ui`'s `BASE` in a
    comment — or reads `base.ts`, as `base.test.ts` does). Task 3 Step 7 (L1's live steps) runs the launch path through step 6 on a
    control project (`DEMO_LAUNCH_SLUG=launchpath-control DEMO_LAUNCH_STOP_AFTER=6 bash scripts/demo-launch.sh`), and L2 or the close runs
    `make ci-acceptance` once on driver 1 — the plan adds its step 15 and moves step 13's ports, and nothing else runs either inside the
    runner. Task 1's `[M12]` widens to `grep -rn "/queue\|/records\|/approval" packages/journey/src packages/control-plane/src` for every
    reader of the email's text.

- **C2. Sitting 4 runs `make demo-admin-edge` and its live controls before they land — which the plan's own rule forbids, and which the
  worktree cannot do.**
  - The rule (plan:104-109): *"Every live edge check, `make verify`, the Docker tier and both acceptances run from the shared checkout, after
    a landing"*; and (plan:96-99) a file in the shared checkout *"is never this plan's until a landing"*. But Task 4 is written in sitting 4
    and lands at L2 (sitting 5, plan:81-82), while its Step 4 runs the acceptance three times plus once on the fake, and Step 5 runs five
    live controls (plan:753-761) — all in sitting 4. So they would run from the worktree, where:
    - **the seed fails**: `infra/ca/` and `infra/secrets/` are git-ignored (`.gitignore:37`, `:48`), so the worktree has no
      `infra/ca/manifest-root.crt` — `demo-launch.sh:63` sets `CA="$ROOT/$CA_FILE"` and `idp_login`'s `--cacert` and the journey's
      `NODE_EXTRA_CA_CERTS` find nothing — and no `infra/secrets/github-fake-developer.token` for the driver-2 run. The plan symlinks only
      `.env` (plan:100-102);
    - **7101 is refused**: after L1, 7101 runs the shared checkout's build with its pid in the shared checkout's `.manifest/`
      (`admin-ui-edge.sh`, Task 3 Step 4). The worktree's copy finds 7101 held by a pid it has no file for — *"anything else on 7101 is
      refused"* (plan:654-656);
    - **the controls have no tree**: (a), (b), (d) and (e) need 7101 serving a broken build, and (c) needs 7100 restarted on a broken
      `team.ts` (plan:756-761). 7100 runs from the shared checkout; the plan does not say which tree serves 7101 or runs 7100 for each.
      Task 3 Step 8 (a)'s live half (plan:679-681, after L1) has the same gap: it must break the shared checkout's Caddyfile, a single-file
      bind mount (ORIENTATION §4 trap 18), and the plan does not say so or how it is restored.
  - **Fix — decide it in the plan.** *Recommended:* **give Task 4 its own landing before its runs** — sitting 4 writes Task 4 in the
    worktree, runs the gates and **lands it (L2, no `packages/mock` file, so no G3)**. It then runs Steps 4–5 from the shared checkout.
    Task 5 and the review's fix wave land at **L3**, as P11 measured three. Decision 13's *"one landing at the end"* rejection already prices
    this. Each live control breaks a landed file in the shared checkout **inside the 7100 window, never committed**. It is predicted and read
    red, then restored with `git checkout -- <path>`, and `git status --short` is read clean. A Caddyfile break goes through `make up`
    (its re-bind restart) and a 7100 restart both ways. *Rejected alternative:* running from the worktree with `infra/ca` and
    `infra/secrets` symlinked as `.env` is. That leaves 7101's ownership and 7100's code unsolved, and it breaks the plan's own reason for
    keeping the edge in one tree.

### Important

- **I1. The seed's slug is refused.** `scripts/demo-launch.sh:86` accepts `DEMO_LAUNCH_SLUG` only as `launchpath-[a-z0-9-]*` and fails
  otherwise (*"a slug beginning launchpath-"*). The plan seeds with `adminedge-local`, `adminedge-github` and `adminedge-click` (Decision 8,
  plan:343-344; Task 4 Step 2, plan:713-714; Task 7 Step 1, plan:843-844). Fact 18 cites the lines (`:80-91`) but not the rule. So the
  acceptance and Rich's click fail at the seed's first line. The failure is loud, but it is every run. **Fix:** `launchpath-adminedge-local`,
  `launchpath-adminedge-github`, `launchpath-adminedge-click`; Task 7 Step 4's *"the `adminedge-*` projects stay"* follows. `[M10]`
  also confirms that Mailpit's search for `launchpath-local` (`launch.ts:1357`, whose step 6 counts exactly five emails) does not match
  `launchpath-adminedge-local`'s emails.
- **I2. Neither acceptance runner is ever run whole, and the plan changes both.** Task 4 Step 6 adds `make ci-acceptance`'s step 15 and the
  offline acceptance's step 22. Task 2 moves step 13's ports. C1 shows L1 changes what step 7 (`make demo-launch`) asserts. No sitting runs
  `make ci-acceptance`, so step 15's driver `case`, its `NOT RUN` branch and its order after step 14 (`demo-load`) are never exercised in
  the runner. The offline step 22 is Rich's to run (CLAUDE.md, *Outstanding*). **Fix:** one `make ci-acceptance` on driver 1 at L2 or
  sitting 6's open, in the background, its summary recorded (B measured its counts there, `ci-acceptance.sh:374-377`). Also name step 22
  in Rich's *Outstanding* offline run.

### Minor

- **M1. The edge walk depends on the reference console on 7104, and its step 0 does not ask.** Check 10 wants `<title>Manifest</title>` at
  `/` (plan:747), and the console-lines allowlist names `/favicon.ico 404` (plan:749-750). But through the edge `/favicon.ico` goes to the
  7104 catch-all, so with nothing on 7104 both are `502` — a machine state `make verify` itself passes (`console_serves_host`'s `[502]`
  branch, `verify.sh:1015`). **Fix:** step 0 requires the reference console (doctor's `console_is_ours`), or check 10 accepts a `[502]`
  with nothing on 7104. Either way, the allowlist is measured through the edge on Step 4's first run.
- **M2. Task 3 Step 8's control (c) predicts a red that cannot happen.** `base.test.ts`'s third case reads `ADMIN_CONSOLE`'s *value* from
  `team.ts` by regex and compares it to `BASE` (plan:621-622). Links written without the constant leave the constant, and that case, green.
  Only `team.test.ts` goes red. **Fix:** predict `team.test.ts` alone, or make the case also assert that `team.ts` has no `${origin}/queue`,
  `/releases/` or `/projects/` literal outside `${ADMIN_CONSOLE}`.
- **M3. Two controls predict the wrong first red.** With `routePath` unprefixed (Task 2 Step 7, plan:589-591; Task 4 Step 5 (a),
  plan:756-757), the shell's first effect `replaceState`s `/admin/` to `/queue` (`app.tsx:50-52`), so check 1's first red is the address
  bar. Under Task 2's walk, the rail click goes by `a[href="/admin/fleet"]` (`walk.ts:348` today, `a[href="/fleet"]`), so the selector finds
  nothing. Neither is *"the browser follows it, and Vite answers outside its base."* The controls still fail; record the actual reason
  (*A green control is a question*).
- **M4. `GET /admin` with no slash is undecided.** The matcher sends `/admin` to 7101 (plan:636), where Vite's base middleware 404s any path
  outside `/admin/` with *"did you mean to visit /admin/"*. `[M2]`/`[M7]` record it (plan:473, :495) but nothing decides it. **Fix:** decide now —
  `redir /admin /admin/ 308` inside the run (and in the parity check's stripped lines), or drop `/admin` from the matcher.
- **M5. `[M2]`'s HMR probe names the wrong URL.** Under `base: '/admin/'` the HMR socket is opened at the base
  (`wss://console.manifest.internal/admin/?token=…`), not at `/@vite/client`, which is the client script (plan:475). The fact worth
  measuring is that the `/admin/*` matcher carries that upgrade.
- **M6. `console_serves_admin`'s `[502]` can pass for the wrong reason.** With 7101 and 7104 both down and the route missing, the
  catch-all's `502` looks like the route's (plan:644-646). This is the same blind spot `console_serves_host` has. `base.test.ts` holds the
  file, but nothing live holds the edge's *loaded* config with both processes down. **Fix:** pass `[502]` only while 7104 answers (so the
  catch-all cannot be the 502), or read the loaded config from the edge's admin API (published on `127.0.0.1:7119`) for a handler dialling
  `host.docker.internal:7101` ahead of 7104's.
- **M7. Both modes build into one `dist/`.** `make demo-admin` (`demo-admin.sh:46`; `ci-acceptance`'s step 13; Tasks 2 and 5's gates after
  L1) rebuilds `packages/admin-ui/dist/` under the running 7101. Vite empties it first, so an open console's assets 404 for the build's
  length, and `admin-ui-edge.sh status`'s build time is then the demo's. Decision 4's *"stale until `make admin-ui-edge`"* (plan:328-329)
  is not the whole story. **Fix:** the platform's build into its own `outDir` (e.g. `dist-edge`, `vite preview --outDir dist-edge`), or
  say it.
- **M8. Health and Settings are never seen on the real platform.** The ten checks (plan:720-748) and Rich's click (plan:175-181) walk the
  queue, a release, the records, the fleet and a project, but not two of the console's six screens. They read 7100 too. **Fix:** one
  shape each in check 7, or an eleventh check.
- **M9. The documents lag the ports by two sittings.** After L1, RUNBOOK l.669-682 and l.722, WALKTHROUGH l.398, ORIENTATION l.311 and
  TRAPS l.2938 still send a reader to `http://127.0.0.1:7101` and 7113 for the demo. Task 6 Step 5 fixes them only after L2 (plan:825-831).
  **Fix:** a docs-only commit at L1 for the port lines (CLAUDE.md, *Close out properly*).
- **M10. Smaller things.**
  - Task 4 Step 4's driver-2 run needs `bash scripts/gateway-controls.sh start fake` (`gateway-controls.sh:10-11`: `real` is `.env` as it
    is), not only `make github-up` (plan:754-755).
  - Task 4 Step 0's Docker tier stops 7100, so it asks for *"7100 is yours"* and HOLD in so many words (plan:690-694), as the landings do.
  - *"`EXPECT_VERIFY` 67 → 68"* (plan:653) is +1 on whatever `main` carries at L1. FE-32 may add a `verify.sh` check first, and BYOA's Task 8
    adds one later.
  - The design's §11 decision 25 says *"two links in `mail/team.ts`"* (design l.781); there are three.
- **M11. Cross-plan: BYOA's Task 8 edits both sites between `@api` and the catch-all** (BYOA plan l.2071-2079: `@mcp path /mcp`, a
  `reverse_proxy` to 7113). It stays compatible with P11b's parity exception and `base.test.ts`'s order case only if its lines are identical
  in both sites and sit outside the `@admin` run. The note atop BYOA's plan (`6e4837a6`) names only the port. **Fix:** one sentence there —
  the console's site carries P11b's four-line `/admin` run, which `make verify`'s parity check strips by name.

### Checked and holding

Each was read against the code; each is as the plan states.

- **The three decisions the brief names.**
  - (1) **7114/7115 for the demo and 7101 as the platform's console.**
    - BYOA's claim on 7113 is real (BYOA plan l.52, l.245, l.397, its approval l.14).
    - 7114 and 7115 are named nowhere in `docs/superpowers/specs`, RUNBOOK, `infra`, `scripts`, the `Makefile`, `packages/*/src` or
      manifest-app's tracked files. The only plan mentions are P11b's own, the roadmap's P11b section and BYOA's new note.
    - Both P11 scripts refuse while their ports listen (`admin-ui.sh:21-26`, `demo-admin.sh:30-35`), and `make demo-admin` is
      `ci-acceptance.sh:649`. So the platform's console left on 7101 would turn step 13 red, as fact 7 says.
  - (2) **Code on a worktree branch; the edge only from the shared checkout.**
    - `manifest-caddy` mounts `./caddy/Caddyfile` relative to `infra/compose.yaml` (`compose.yaml:109`), run by `Makefile:17`'s
      `-p manifest`.
    - A `make up` from a worktree would recreate *every* service with a relative single-file mount (the IdP's, LiteLLM's) on the worktree's
      paths, not only the edge. The rule is right, and understated.
    - `ensure-caddy-config.sh:43-58` re-binds after L1's merge replaces the file's inode, and `:60-64` reloads. Either drops the runtime
      routes; RUNBOOK l.102-105 says restart 7100 after.
  - (3) **A19's option and its corrected premise.**
    - `TeamNotice` has two kinds (`team.ts:10-29`), and `createMailer` sends only to `config.mail.team` (`mail/index.ts:63-72`).
    - `mail/index.ts` is the only `nodemailer` importer outside tests.
    - The spec's §26 says *"The email carries nothing a person wrote"* (spec l.3043-3044).
    - No email reaches an owner, so the corrected premise holds.
    - Both hand-backs take `NO_BODY` (`api/routes/launch.ts:650`, `:686`); their events carry `{ environment, to }` and `{ to: 'draft' }`
      (`records.ts:1033-1034`, `:1070-1071`). A gap's answer is limited to 2,000 characters (`representations/launch.ts:625`).
    - I concur with the plan's recommendation: (a), as a small plan of its own.
- **Sign-in, step-up, CSRF on the console's origin — no control-plane change** (facts 14–16).
  - `safeReturnTo`'s pattern (`login-state.ts:24`) accepts `/admin/releases/<uuid>/approval?preview=<uuid>`.
  - Both cookies are `Path=/` (`auth.ts:151`, `:184`); the callbacks redirect to the kept path (`:288`, `:359`); sign-out lands on `/`
    (`:441`).
  - `assertSameOrigin` compares `Origin` with the arrival origin (`csrf.ts:44-53`).
  - The two consoles' `sessionStorage` keys cannot collide on the shared origin: `manifest.admin.approval-reason:<release>:<preview>`
    (`admin-ui/src/approval-state.ts:165`) against `manifest.approval-reason:<release>` (`console/src/approval-state.ts:25`).
- **The edge and the checks** (facts 1–5): every line reference holds.
  - The console's site and its `route` (`Caddyfile:51-107`) and `app.`'s (`:124-151`).
  - `console_serves_host` (`verify.sh:1008-1020`), `console_refuses_platform_container` (`:1023-1031`) and `app_site_is_the_consoles`
    (`:1074-1097`). The parity awk ends a site only at a column-0 `}`, so the contiguous-run strip is the right shape.
  - `doctor.sh:169-237`, and `common.sh:75-82`.
  - Runtime routes are PUT at `srv0`'s `routes/0`, host-matched (`routing/caddy.ts:451`), so a static path route cannot collide with them.
- **The console** (facts 8–13): every line reference holds.
  - `vite.config.ts:18-32`, `router.ts` (`:51-93`, `:96-117`, `:124-126`, `:141-151`, `:177-203`), `auth.ts:15-17`, `:29-51`, `:60-65`,
    `app.tsx:45`, `:65`, `walk.ts:28`, `:185`.
  - The only hard-coded screen path in `src/` is `auth.ts:63`.
  - No tsconfig sets `allowImportingTsExtensions`; admin-ui's is `noEmit` (`tsconfig.json`).
- **The seed** (fact 18, but for I1).
  - Steps 1–4 are the `owner` phase, and `STOP_AFTER=4` exits green after it (`demo-launch.sh:259-261`).
  - Step 3's token is `launch agent <runId>` with `approval:request` (`launch.ts:816-817`).
  - After step 4 the project's items are `release-approval` and `privacy-assessment-to-submit`; `findPhase` deletes the slug's leftover
    emails (`:458-459`).
  - A second run deletes an unlaunched project (`:481-500`). Approving its release never launches it, so the walk's approval does not
    block that delete.
- **The rest.**
  - The mock answers `listLoadRehearsals` from `mock-app`'s run for any id (`server.ts:707`). `LOAD_REHEARSAL_FAILED` exists
    (`fixtures.ts:1832`). `mus-100-listening` is `large_course` (`fleet.ts:600-626`), its item unrehearsed (`:2175`).
  - The contract is `1.10.0` with 79 operations. The `EXPECT_` lines are `ci-acceptance.sh:378-390`; the fourteen steps run to `:665`.
  - Spec action A's quoted lines are right: §21's row l.2243; *The front-end in the local topology* l.2298-2318, its *"share one origin"*
    l.2305; §26 l.3043. No shared HTML page names the admin UI, 7101 or the console's host.
- **Rubric items the GO asked about.**
  - **The acceptance drives the real entry point through the edge**: `https://console.manifest.internal/admin/`, signed in and stepped
    up at the IdP in Chrome, 7100's real queue, Mailpit's real emails, read back through the API.
  - **Every task names its caller**: `BASE` → the router, `vite.config.ts`, the walk; `ADMIN_CONSOLE` → the three links;
    `admin-ui-edge.sh` → `make admin-ui-edge` and `demo-admin-edge.sh`; `PORT_ADMIN_UI` → `doctor.sh`, `verify.sh`; `cdp.ts` → both
    walks; `edge.ts` → `make demo-admin-edge` → steps 15 and 22; `loadRehearsalsOf` → the project's page; the fleet's runs → check 8.
    The fleet's `getLoadRehearsal` has no console caller; it is mock consistency, which P11's I3 rule asks for.
  - **The G3 notice** is owed once, at L2 (Task 6 Step 3); L1 touches no `packages/mock` or `packages/contract` file. C1's fix adds
    `packages/journey`, which is neither.
  - **The negative controls fail as designed** except M2's leg (cannot) and M3's two (wrong reason); C2 says from which tree.
  - **Spec action A's words: (a), as worded** — the row and the sentence are accurate and match the reference console's row. *Checked
    and not raised*: §12's control-plane refusal does not cover `/admin`, which sits behind `@outside` regardless; and the demo's ports
    are a development process's, as P11's 7113 was, which §21 never named.

### Questions for Rich

None new. The plan already puts its two to him with its approval: **Spec action A** (this review's word: **(a), apply as worded**) and **his
click-6 question** (this review's word: **(a), as a small plan of its own** — the plan's recommendation). C2's fix changes the sittings table
(a third landing); that is the author's to make under his delegation, and the coordinator names it when it puts the plan to him.

---

## Addendum — the revision checked (2026-10-16, ~16:40–16:52 PDT, `manifest-review4`, at `manifest-coord6`'s ask)

**P11BP's revision `828215bf` closes all fifteen findings as this review meant them.** Each change is where its *Revised to the review*
table (plan l.1135-1151) says it is.

- **C1.** Task 3 now changes both readers (plan:706-709, :721-724). L1 runs `demo-launch` to step 6 on `launchpath-control` (plan:792-793).
  `launch.ts` keeps its own constant, which `base.test.ts` holds (plan:731-734).
- **C2.** Task 4 lands at L2 before it is run (plan:91-92, :897-898). The runs and controls are sitting 5, from the shared checkout. A live
  control breaks a landed file and is never committed (plan:127-133, Decision 16), and is restored with `git checkout --`. Decision 13 now
  names three landings, and nothing live runs in the worktree (plan:112-125).
- **I1.** The slugs are `launchpath-adminedge-*`. `[M10]` measures the same `subject:"(<slug>)"` phrase `launch.ts:1413` searches, and
  names a fallback.
- **I2.** `make ci-acceptance` runs whole at sitting 7's open, before the click's seed (plan:992-995). Step 22 is in *Outstanding*.
- **M1–M11.** Each is present, and the BYOA note and the design's *"three links"* are swept. Decisions 14 and 15 are sound; 15 rejects my
  *"pass only while 7104 answers"* for a good reason.

**One small side effect is new.** Control (b)'s live half (plan:812-814) edits the shared checkout's Caddyfile and restores it with
`git checkout --`, *"statically, no `make up`"*. Both writes replace the file's inode, so the edge's single-file mount goes stale
(ORIENTATION §4 trap 18), and no check reads the mount. The next `make up` — anyone's — then does the re-bind restart
(`ensure-caddy-config.sh:43-58`) and drops every runtime route until 7100 restarts. **Fix:** after (b)'s restore, `make up` and a 7100
restart, as (a) does; or write the break and the restore through the file in place. Nothing else the revision changed breaks: the
seven-sitting, three-landing re-cut, Decision 13, the L1 control slug, the L2-before-runs order and every other `git checkout --` restore
(each followed by its rebuild or restart) hold.
