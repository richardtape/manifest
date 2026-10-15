# Gentler Test Tiers — Implementation Plan

> **WRITTEN 2026-10-14, 08:13–08:48 PDT, BY `manifest-fix`** (the second coordinated run's job PT, coordinated by `manifest-coord3`),
> documents only — nothing in it has been run. **Rich's words** (2026-10-14 ~08:12 PDT, to `manifest-coord3`, recorded in
> [`../2026-09-30-decisions.md`](../2026-09-30-decisions.md), `abdd01e`): *"yes to 1–4, can you get a separate agent to write that up as
> the next thing to do so we can stop this (and include in the plan the reminder for me to change Docker Desktop's settings)."* **Every
> fact in *Read this first* was read from the code at `abdd01e`** while A1's sitting 8 was running in the same checkout, so **Task 1
> re-reads every one** — line numbers in `scripts/ci-acceptance.sh` and the test files move with A1's close-out.
>
> **APPROVED 2026-10-14 ~08:48 PDT by `manifest-coord3` under Rich's standing delegation (`028bb94`), for his review** — inline, one
> fresh session per sitting; the writer's three calls accepted (three sittings; the 58 explicit limits scaled; B waits for sitting 3).
>
> **Placed as THE NEXT PLATFORM JOB: after A1 closes, before B** (the load rehearsal). B measures load on the Docker VM, so it starts
> only after this plan's sitting 3 — Rich's Docker Desktop step — has set the VM's CPUs it will measure on.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The unit, packages and Docker test tiers run without making the laptop unusable, and without failing because it is in use: at a
lower macOS priority, with timeouts scaled to that priority, refusing to start on a machine already overloaded, recording the load on
every run, and with `resetDatabase` surviving the deadlock a timed-out test leaves behind.

**Architecture:** One bash script, `scripts/test-gently.sh`, becomes what `pnpm test` and `pnpm test:docker` run: it gates on the 1-minute
load, starts a load sampler, runs the Vitest command under `taskpolicy -c utility` (or `-b`), exports a timeout scale, and prints one
summary line at exit. One TypeScript module, `packages/control-plane/src/test-timeouts.ts`, turns that scale into the unit and packages
projects' timeouts, every explicit per-test timeout, and `resetDatabase`'s lock budget. One more, `src/db/truncate.ts`, retries the reset's
`TRUNCATE` on a deadlock or a lock timeout. Docker Desktop's CPU limit is Rich's step, measured before and after.

**Tech Stack:** bash 3.2 and macOS's `taskpolicy(8)` and `sysctl`; Vitest 2.1.9 (Vite 5.4.21, its esbuild 0.21.5); node-postgres 8.23.0
(its `lock_timeout` client option); Postgres in Docker Desktop 4.87.0 (Engine 29.7.2); macOS 26.7.1 (25G241); Node v24.12.0.

**Spec:** [`docs/superpowers/specs/2026-08-29-manifest-platform-design.md`](../specs/2026-08-29-manifest-platform-design.md) — **no section
describes the test harness's timing** (grepped at `abdd01e` for `testTimeout`, `Vitest`, `5 s`, `test tier`, `unit tier`: the only hit is
§16's *Authorization contract suite* row, which is about what is tested). **This plan raises no spec action.**

**Roadmap:** [`2026-08-29-plan-roadmap.md`](./2026-08-29-plan-roadmap.md) — this plan's section, between A1's and B's.

---

## How this plan is to be executed — sittings, one per session

> **THREE SITTINGS, PROPOSED.** The measurements must come first, on today's tree, because they set the scale and they are the "before"
> of every comparison. The wrapper and the scale share a sitting with them because neither is useful alone and both are small. The reset's
> retry, the documents and the after-measurements share the second, which ends with the Docker tier this plan owes (it changes the global
> setup's `TRUNCATE` and `test:docker`'s command). The third is Rich's Docker Desktop step and the one Docker-tier run after it — short,
> and placed when he is at the machine; it may run as the tail of sitting 2 if he is.

| Sitting | Tasks | What it delivers | `pnpm test:docker` owed? | Where it stops | Status |
|---|---|---|---|---|---|
| 1 | 1, 2, 3 | **The measurements on today's tree** — every fact re-read, versions, the QoS priorities, the whole unit suite quiet at normal, utility and background priority and once under imitated load, each with every test's duration — **the timeout scale** (`test-timeouts.ts`, the two projects, `slowTestThreshold`, the 58 explicit timeouts) **and the wrapper** (`scripts/test-gently.sh`, `package.json`) | No — no Docker-tier path changes until Task 4 | After Task 3's commit, with `pnpm test` running through the wrapper twice, green | **DONE 2026-10-14** (`manifest-gt-s1`) — `adf9127`, `44b4e49`, `a2060ce`; scales **utility 3, background 7**; *What executing this plan found*, *Sitting 1* |
| 2 | 4, 5, 6 | **`resetDatabase` survives a deadlock**; ci-acceptance's line, the RUNBOOK, ORIENTATION and TRAPS; **the after-measurements** (the same imitated load, wrapped) and every control; the plan's one whole-branch review; `make ci-acceptance`; **the Docker tier at 12 CPUs** — owed, and the "before" of Rich's step | **Yes — once, at the end, beside the reviewer** | After the Docker tier and the review's one fix wave | ← **next** — read *Sitting 1*'s *What it left sitting 2* first |
| 3 | 7 | **Rich's Docker Desktop step** — 6 CPUs, after A1's click — **the Docker tier at 6 CPUs**, the comparison, and the plan's close | Yes — it is the measurement | After the comparison is recorded and Rich has said keep or change | |

**EVERY SITTING ENDS THE SAME WAY** — the four gates (`pnpm test` twice, alone, on the final tree — through the wrapper from Task 3 on),
the Docker tier when owed, **`EXPECT_TESTS` / `EXPECT_FILES` in `scripts/ci-acceptance.sh` set from the run with a dated comment in the
house form** (sitting 1: Tasks 2 and 3, +19 tests and +2 files on A1's numbers; sitting 2: Task 4, +6 and +1 — counted from the run, not
from this line), the slow list read, a dated *What executing this plan found*, this table, and ORIENTATION §6's sweep. **Every whole-suite run and
every Docker-tier run needs `manifest-coord3`'s *"7100 is yours"* and its HOLD** (the coordinated run's worker rules), and **every
imitated-load run needs Rich's yes on its time, asked through the coordinator** — it makes his machine slow for twenty minutes or more.
**Two rules survive any re-cut:** Task 1 first, on the unchanged tree; Task 7 only after A1's clicked half is done (Docker Desktop restarts).

---

## Decided by Rich — build them, do not re-open them

- **GENTLER TEST TIERS, ALL FOUR** — *"yes to 1–4"* (2026-10-14 ~08:12 PDT, `abdd01e`), put to him at ~08:05 from a read-only survey:
  1. **a wrapper** that runs the test tiers at macOS background QoS (`taskpolicy -c utility`; `-b` when he is on a call), inherited by
     their child processes;
  2. **a timeout scale** for the unit and packages projects under the wrapper (`MANIFEST_TEST_TIMEOUT_SCALE`; `slowTestThreshold` keeps
     the old 5 s visible) — **his yes given to this policy change, since a real hang then takes longer to report**;
  3. **a load gate**: a run refuses to start above a load threshold unless forced, samples the load through the run, and every red records
     it (ci-acceptance.sh's FAIL line too);
  4. **`resetDatabase` survives a deadlock**: retries on SQLSTATE `40P01` / `55P03` with a `lock_timeout`, logged, the test that timed out
     still red.
- **HIS STEP, IN THE PLAN** — *"include in the plan the reminder for me to change Docker Desktop's settings"*: Docker Desktop → 6 CPUs
  (Settings → Resources), **after A1's click** (it restarts Docker), with one Docker-tier run measured before and after (Task 7).
- **NOT THIS PLAN** (the same entry): fewer runs at agreed times (the coordinator asks him first while he is at the machine — already the
  practice), the Docker tier's speed brief, CI off the laptop.
- **WHERE IT GOES** — *"as the next thing to do"*: the next platform job after A1, before B.

---

## What Rich does, and when

1. **Nothing to approve unless the coordinator asks**: `manifest-coord3` approves this plan under his standing delegation (`028bb94`); it
   needs no word of his beyond `abdd01e`.
2. **Say yes to a time for each imitated-load run** (one in sitting 1, two in sitting 2): twelve (or six) `yes` processes run beside the
   suite for 20–40 minutes, and the machine is slow for him while they do. Never during a call.
3. **When you are on a call, say so** (to the coordinator or the sitting): runs started then use `MANIFEST_TEST_QOS=background`.
4. **Sitting 3 — Docker Desktop's CPUs, after A1's clicked half is done:**
   - Docker Desktop → **Settings** (the gear) → **Resources** → **Advanced** → **CPU limit: 6** (it reads 12 — all of them — today; its
     `settings-store.json` has no `Cpus` key; the label may read differently in another version — it is the CPU count) → **Apply &
     restart**.
   - Docker restarts. The platform's containers return by their restart policy (ORIENTATION §4's trap 5); the agent then checks
     `docker info` reads 6, restarts the control plane and runs `make verify`.
   - The agent runs the Docker tier once more and compares it with sitting 2's run at 12 CPUs (on record before this plan: 1322–1538 s).
     **Then you say keep 6, or try another number** — the agent asks with the two numbers in front of you.

---

## Read this first — what this plan knows from the code

*Read at `abdd01e` (2026-10-14, ~08:15–08:35 PDT) by `manifest-coord3`'s survey and this session. Task 1's Step 1 re-reads every one.*

**How the tiers run today**

- `package.json:9` — `"test": "vitest run --project unit --project packages"`; `:10` — `"test:docker": "MANIFEST_TEST_DOCKER=1 vitest run
  --project docker"`; `:17` — `"contract:write"` runs one file through `vitest` directly.
- `vitest.config.ts:17` — `test: { fileParallelism: false }`: **one file at a time, in one worker**. Capping workers changes nothing.
- `vitest.workspace.ts:13-22` (`unit`) and `:37-51` (`packages`) set no timeout, so Vitest's defaults hold: **5 000 ms a test, 10 000 ms a
  hook**. `:29-30` — the `docker` project's `testTimeout` and `hookTimeout`, **120 000 ms**. No project sets `retry`.
- **Vitest 2.1.9 reads `slowTestThreshold` from the ROOT config only**: its reporters compare against `this.ctx.config.slowTestThreshold`
  (`node_modules/.pnpm/vitest@2.1.9_…/dist/chunks/index.DsZFoqi9.js:3470`, `:3481`, `:4822`; `project.globalConfig` at `:202`). A project's
  value is ignored. **Default 300 ms** (`dist/config.js:129`). In a non-TTY run (an agent's, ci-acceptance's `tee`) the default reporter
  prints, under each file, **every passing test slower than the threshold with its duration** (`:3470-3473`) — today, every test over
  300 ms.
- **A forked worker's environment is the main process's** at the run's start (`resolveConfig.rBxzbVsl.js:7613-7622`: `...process.env`), so
  a variable the wrapper exports reaches every test file.
- **Vite's config loader resolves `./x.js` to `./x.ts`**: measured with Vite 5.4.21's own esbuild 0.21.5 in a scratch directory (`import {
  scale } from './sub/b.js'` bundled `sub/b.ts`). So `vitest.workspace.ts` can import from `packages/control-plane/src/`.
- **13 test files pass Vitest an explicit timeout — 58 sites**, every one a bare number (counted with Task 2's exact regex): `api/lifecycle`
  21, `blueprints/ai-component` 9, `api/events` 6, `blueprints/session-component` 5, `blueprints/saml-request-cache` 4,
  `blueprints/proof-app-boot` 3, `api/agents` 2 (`{ timeout: 30_000 }`, e.g. `:1309`), `db/locks` 2, `sso/platform` 2, `api/admin-reason`
  1, `mail/mailer` 1, `source/github/driver` 1 (`:1135`, *"vitest's 5 s leaves too little under load"*), and `packages/journey/src/
  examples.test.ts:260` 1. Values: `10_000` ×3, `15_000` ×5, `20_000` ×2, `30_000` ×44, `60_000` ×4. **At a scale of 4 the default
  becomes 20 s, so ten of them would have LESS time than a test that asked for nothing** — which is why Task 2 scales them too.
- 220 test files in the two projects (`find packages -path '*/src/*' -name '*.test.ts' ! -name '*.docker.test.ts'`), matching
  `EXPECT_FILES=220` (`scripts/ci-acceptance.sh:332`).

**The reset**

- `packages/control-plane/vitest.global-setup.ts:74-76` — once per run, before any file: a `pg.Pool` on the admin URL and `TRUNCATE TABLE
  … RESTART IDENTITY CASCADE` over its own 20-table list (`:23-56`); `42P01` is translated into the migration instructions (`:84-93`).
- `packages/control-plane/src/db/testing.ts:69-121` — `resetDatabase`'s 22-table list (two more than the global setup's —
  `agent_sessions` and `intake_sessions`, which the global setup's `CASCADE` reaches unnamed); `:137-149` — the lazily created admin pool
  (`manifest`, because `manifest_app` cannot truncate `audit.events`); `:165-183` — `registerBackgroundWork` / `drainBackgroundWork`
  (the launch path plan's Task 3); `:185-188` — `resetDatabase`: drain, then **one `TRUNCATE`, no `lock_timeout`, no retry**.
- `resetDatabase` is named in 49 test files, 143 lines (re-read at `7627517`; 50 and 147 at `abdd01e`), most inside `beforeEach`; **some inside a test body** (`releases/releases.test.ts:441`,
  `:3362`, and several `*.docker.test.ts`) — so its lock budget must fit inside the TEST timeout (5 s), not only the hook's (10 s).
- A `TRUNCATE` takes `ACCESS EXCLUSIVE` on its tables in the order named, then the cascaded ones. `audit.incidents` is first and `users`
  last in both lists.
- **When a hook times out, Vitest moves on but the `TRUNCATE` does not**: the query stays queued on the server, holding the locks it has
  taken, and every later test that touches those tables queues behind it. Nothing ends it until its blocker does.
- node-postgres 8.23.0 accepts `lock_timeout` (ms) as a client option and sends it at connect (`pg/lib/client.js:561-562`;
  `@types/pg/index.d.ts:26`).
- **7100 — the running control plane — uses the same database** (`manifest_control` on 7103). Since A1's Task 6 its set watcher reads
  launched projects' Route rows every 15 s (ORIENTATION §4's trap 7).

**What the load did**

- `TRAPS.md:1387-1392` — a Zoom screen share, load 50–90: four `pnpm test` runs of one unchanged tree read **17, 0, 2 and 7 red**, every
  red `Test timed out in 5000ms`, plus one follow-on `SLUG_TAKEN` from a timed-out test's leftover row.
- `TRAPS.md:1409-1427` — `deadlock detected` inside `resetDatabase` is work an earlier test started and did not await; the drain registry
  fixed the known starters; when Postgres picks the `TRUNCATE` as the victim, the only tell is the reset's own red.
- `scripts/ci-acceptance.sh:294-299` — A1's sitting 3: *"a run between them timed out 17 tests in two untouched files under load, 15-min
  average 7.3, and is not counted"*.
- 2026-10-13/14 overnight (the survey): **14 reds at load 33 — 11 timeouts at 5 s, 2 `deadlock detected` in `resetDatabase`'s `TRUNCATE`**.
- `TRAPS.md:1636-1643` — the Docker tier's *a retire waits for a request that is in flight* reds at load 12–15. **That check is now
  `packages/control-plane/src/runtime/driver-contract.ts:624-641`** (the survey's `:408` has drifted), and its neighbour *a retire never
  waits longer than its drain bound* `:643-659` reads `Date.now()` against a drain bound: **in-test wall-clock limits, which no Vitest
  timeout reaches.**
- `scripts/ci-acceptance.sh:419-431` (re-read at `7627517`; `:419-430` at `abdd01e`) — the test step: `pnpm test 2>&1 | tee "$LOG"`, `TEST_RC="${PIPESTATUS[0]}"`, and `record "pnpm test"
  FAIL "exit $TEST_RC"` — **no load recorded**. `:357-358` — `LOG="$(mktemp -t manifest-ci)"; trap 'rm -f "$LOG"' EXIT`.
- `scripts/gateway-controls.sh:47` and `scripts/levels-controls.sh:58` loop over `pgrep -f vitest`; the coordinator's flag rule reads `ps
  -ax -o pid,command | grep -i vitest`. **A wrapper whose argv contains `vitest` is seen by all three** — correct while it runs, wrong if
  any piece of it outlives the run.

**The machine** (2026-10-14, 08:13–08:35)

- 6 performance + 6 efficiency cores (`hw.perflevel0.physicalcpu` 6, `hw.perflevel1.physicalcpu` 6, `hw.ncpu` 12), 36 GiB.
- **Docker Desktop has all 12 CPUs and 7.75 GiB** (`docker info`: `NCPU 12`, `MemTotal 8319238144`); `~/Library/Group Containers/
  group.com.docker/settings-store.json` has no `Cpus` key (defaults). Ollama runs natively.
- `sysctl -n vm.loadavg` prints `{ 3.61 5.71 6.54 }` — the second field is the 1-minute load. The load read 3.6–8.2 while this plan was
  written, with Rich working and several sessions open.
- **`taskpolicy(8)`**: `-c utility` runs a program under a utility QoS clamp, `-b` with `PRIO_DARWIN_BG` (background: lowest CPU priority,
  throttled disk I/O); *"All children of the specified program also inherit these policies."* **Measured** with `ps -o pri= -p $$`: normal
  **31**, utility **20**, background **4** — the same in a grandchild — and nesting takes the lower (`-c utility` then `-b`: 4; `-b` then
  `-c utility`: 4). `taskpolicy -p <pid>` changes one process, not its tree.

---

## Decisions this plan makes, and why

**1. `pnpm test` and `pnpm test:docker` ARE the wrapper.** `package.json` runs `bash scripts/test-gently.sh vitest run …`. Every document,
every agent and ci-acceptance already say `pnpm test`; an opt-in `pnpm test:gently` would change nothing anyone runs. *Rejected:*
`taskpolicy` inline in `package.json` (no gate, no sampler, Mac-only syntax in a script line nobody reads); a separate opt-in script.
*Cost to change:* one line each in `package.json`. **Single-file runs** (`pnpm exec vitest run --project unit src/<path>`, trap 9) stay
unwrapped — normal priority, scale 1 — and the RUNBOOK gives the wrapped form.

**2. Utility by default; background on request; normal for measuring — chosen by `MANIFEST_TEST_QOS`.** An environment variable, because
pnpm appends a script's extra arguments to the end of its command line, where they would reach Vitest. *Rejected:* detecting a call (Zoom's
share helper is one of several call apps, and Meet runs in a browser); switching a running run (`taskpolicy -p` reaches one process, and
the scale is fixed at the start).

**3. The scale is set by the wrapper from the QoS, read once by `test-timeouts.ts`, and reaches everything Vitest times.** `testTimeout`
5 000 × scale and `hookTimeout` 10 000 × scale for `unit` and `packages`; **every explicit per-test timeout through `scaled(ms)`**, because
ten of the 58 would otherwise invert (*Read this first*); the `docker` project keeps its 120 s. A value outside 1–10 refuses the run,
naming it. **The values are measured, not guessed** (Task 1): for each QoS, `s` = its quiet whole-suite wall time ÷ normal's, and **scale =
max(2, ⌈2 × s⌉)** — the factor 2 is headroom for the load the gate admits, and Task 6 proves it under that load. The wrapper ships with
2 (utility) and 4 (background) and Task 3 replaces them with Task 1's numbers.

**4. `slowTestThreshold: 5000`, in the ROOT config.** It is the only place Vitest 2.1.9 reads it. It replaces the 300 ms default, so a
non-TTY run lists exactly the tests that would have failed at the old limit. **The slow list is reviewed at every close** (Task 5 writes
it into ORIENTATION §6): on a quiet run it should match the previous sitting's; a test new to it has grown slower, or is a hang the scale
now hides.

**5. The gate: the 1-minute load, against this machine's CPU count, refused unless forced.** `sysctl -n vm.loadavg`'s second field against
`MANIFEST_TEST_MAX_LOAD` (default `sysctl -n hw.ncpu`, 12); above it the wrapper exits **75** (`EX_TEMPFAIL`) without running anything,
and `MANIFEST_TEST_FORCE=1` runs it anyway, marked forced. Sampled every 30 s; at exit one line — min / median / max, the QoS, the scale,
the gate, forced, the exit status — to stdout and to `MANIFEST_TEST_LOAD_REPORT` when set. **12 because it is the load Task 6 proves the
scaled run green at** (twelve burners). *Rejected:* 6 (the ordinary load of a working day with several sessions open is 6–8, so nothing
would start); waiting for the load to fall (an agent's tool call cannot sleep — it waits with `Monitor` on `sysctl -n vm.loadavg`);
**pausing a run with `kill -STOP`** — Vitest's timeouts are wall-clock timers, and on `kill -CONT` every one that came due fires at once.

**6. The reset retries `40P01` and `55P03`, three attempts, with a lock budget on its own connection.** `src/db/truncate.ts`'s
`truncateWithRetry(pool, tables, log)`, used by `resetDatabase` and the global setup (it imports no database client, so the global setup
can). The admin pool is created with `lock_timeout` = ⌊5 000 × scale ÷ 4⌋ ms (1 250 at scale 1): three attempts and their 100/200 ms
pauses fit inside the TEST timeout, because some callers reset inside a test body. Each retry and the final failure is a `console.error`
naming the code. **The test that timed out stays red** — Vitest already failed it; the retry only spares the NEXT test. *Rejected:*
`pg_terminate_backend` / `pg_cancel_backend` on the blocker (7100 shares the database, and ending a worker's client mid-transaction
crashes the worker); retrying every error (a real failure would read as slowness); a longer hook timeout alone (the `TRUNCATE` keeps
waiting on the server after its hook has given up — the lock budget is what ends it).

**7. ci-acceptance's test step carries the wrapper's line, PASS or FAIL.** It sets `MANIFEST_TEST_LOAD_REPORT` for `pnpm test` and appends
the file's line to the step's note. *Rejected:* running all of ci-acceptance under the wrapper — it would move the demos to utility QoS, a
change to the acceptance's conditions nobody asked for, costing another full acceptance run to prove.

**8. The measurements.** **Quiet**: the 1-minute load below 6 at the start, every other session's Vitest and Docker held by the
coordinator. **Imitated load**: N × `yes > /dev/null` at normal priority — **12 for the utility runs** (the gate's threshold: every core
busy) **and 6 for the background runs** (a call's worth: the performance cores busy, which is where a call's work goes) — started 120 s
before the run so the 1-minute load has risen. Every run writes Vitest's JSON report, from which `durations.mjs` reads the wall time, every
test's duration, the reds and the slow list. The JSON stays in the scratchpad; the summaries are committed.

**9. Rich's Docker step lands before B.** B's rehearsal measures an app's capacity on the Docker VM; its numbers should be taken on the
CPU count that stays. Task 7 records both Docker-tier runs and asks him to keep 6 or choose again.

**10. The wrapper is tested in the unit tier, as `scripts/github-real-repos.sh` and `scripts/admin-grant.sh` are**
(`src/source/github/real-repos.test.ts`, `src/projects/admin-grant.docker.test.ts`): `src/test-gently.test.ts` spawns it around tiny
commands, DB-free, and reads the QoS a grandchild got with `ps -o pri=`.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **macOS bash 3.2 and a BSD userland** in every script: no associative arrays, no `mapfile`, no `xargs -r`, no `readlink -f`, no GNU
  `sed -i` (BSD's is `sed -i ''`), no `timeout(1)`. `sleep` takes fractions on macOS.
- **The agent's shell is zsh**: write multi-line probes to a file and run them with `bash <file>`; `grep` is a `ugrep` function (use `-F`
  for a literal `$`); `ls` is aliased to a long listing — use `find` or a glob.
- **Never run two Vitest processes at once**, and never a Vitest run beside the Docker tier. **Every whole-suite or Docker-tier run needs
  `manifest-coord3`'s "7100 is yours" and HOLD.** A run longer than 10 minutes goes in the background (`run_in_background`) and is waited
  for, never polled with `sleep`.
- **Never pause a test run with `kill -STOP`.** Never `pg_terminate_backend` or `pg_cancel_backend` from the harness.
- **Every imitated-load run: Rich's yes on its time, through the coordinator; the burners' PIDs printed; after it, `pgrep -x yes` empty**
  (kill the printed PIDs if not — never `pkill yes`, which would take anyone's).
- **Commit staged by name, with a pathspec** (`git commit -m … -- <paths>`): other sessions commit in this checkout. Never `git add -A`,
  `.`, `commit -a`, `checkout .`. Account for every path in `git status`; what you cannot explain is someone else's.
- **The four gates before every commit**: `pnpm test` (from the root, twice at a sitting's close), `pnpm lint`, `pnpm typecheck`,
  `pnpm format:check`. Vitest strips types — `pnpm typecheck` is the only gate that sees `exactOptionalPropertyTypes`.
- **`console.error` for an operator line, never `request.log`, never a secret; no swallowed `.catch(() => undefined)`.**
- **Every refusal asserts its code** — the wrapper's `75`, `64`, `69`; a SQLSTATE by value.
- **Record exact versions** with every measurement (macOS, Docker Desktop, Engine, Vitest, Node, pg).
- **Nothing here changes `packages/contract` or `packages/mock`**, so the faculty front-end needs no notice; if a task finds it must, stop
  and tell the coordinator.
- **The spec is not edited.**

---

## Review Focus

*The five ways this plan's own tests could pass while a person's run still breaks — each has its test in the task that owns the code.*

1. **The suite runs inside the wrapper, so its own tests inherit the wrapper's environment.** `MANIFEST_TEST_GENTLY=1` is in every test's
   `process.env`; a wrapper test that does not scrub it runs every case through the nested `exec` and asserts nothing. And a QoS test run
   under the wrapper sees utility whatever the script does. → Task 3: `cleanEnv()` removes every `MANIFEST_TEST_*`; one case sets
   `MANIFEST_TEST_GENTLY=1` on purpose and expects the pass-through; the priorities are asserted relative to the test process's own, and
   the QoS control is run unwrapped.
2. **A red run must stay red through the wrapper, pnpm and ci-acceptance's `PIPESTATUS[0]`.** A wrapper that exits with its summary's
   status turns every red green. → Task 3: a child's `exit 3` is the wrapper's 3, and the summary says `exit 3`; Task 5 keeps
   `TEST_RC="${PIPESTATUS[0]}"`.
3. **Nothing of the wrapper may outlive its run.** Its sampler is a bash subshell with the wrapper's argv — which contains `vitest` — so a
   leftover is read by `gateway-controls.sh:47`, `levels-controls.sh:58` and the coordinator's flag check as a run in progress. → Task 3:
   a unique marker in the command, and `pgrep -f <marker>` empty after the wrapper returns.
4. **An explicit per-test timeout must scale with the default.** A bare `}, 10_000)` under a scale of 4 has half the time of a test that
   asked for nothing. → Task 2: every one of the 58 through `scaled()`, and a test that scans every unit and packages test file for a bare
   one — with a planted line proving the scanner can see it.
5. **The reset's `TRUNCATE` must not outlive its budget, and must not hide the red that caused it.** Without `lock_timeout` a hook that
   times out leaves its `TRUNCATE` queued on the server, holding `ACCESS EXCLUSIVE` on every table it has reached. → Task 4:
   `resetDatabase` itself, under a lock held past three budgets, fails with `55P03` before the holder lets go — and red when the budget is
   removed; Task 6's scratch pair shows the timed-out test red with and without the retry, and the next test red only without it.
   *Named, not built:* when Postgres picks the leftover work as the deadlock's victim instead, that work fails on its own line (a
   `[retire] … failed` or an unhandled rejection) — the drain registry is the remedy for a starter that does not register.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `scripts/test-gently.sh` | **Create** | The wrapper: QoS, the scale's default, the gate, the sampler, the summary line |
| `package.json` | Modify `:9-10` | `test` and `test:docker` run through the wrapper |
| `packages/control-plane/src/test-timeouts.ts` | **Create** | The one reading of `MANIFEST_TEST_TIMEOUT_SCALE`: the projects' timeouts, `scaled(ms)`, the reset's lock budget |
| `packages/control-plane/src/test-timeouts.test.ts` | **Create** | The scale's parsing and arithmetic; the bare-timeout scanner |
| `packages/control-plane/src/test-gently.test.ts` | **Create** | The wrapper, spawned around tiny commands |
| `vitest.workspace.ts` | Modify `:1`, `:13-22`, `:37-51` | `unit` and `packages` take the scaled timeouts |
| `vitest.config.ts` | Modify `:1-18` | `slowTestThreshold: 5000` beside `fileParallelism` |
| 12 control-plane test files + `packages/journey/src/examples.test.ts` | Modify (58 lines + one import each) | Every explicit timeout through `scaled()` |
| `packages/control-plane/src/db/truncate.ts` | **Create** | `truncateWithRetry` — the retry, its log lines |
| `packages/control-plane/src/db/truncate.test.ts` | **Create** | The retry against real locks; `resetDatabase`'s own budget |
| `packages/control-plane/src/db/testing.ts` | Modify `:56-121`, `:137-149`, `:185-188` | `RESET_TABLES` exported; the admin pool's `lock_timeout`; `resetDatabase` through the retry |
| `packages/control-plane/vitest.global-setup.ts` | Modify `:1-6`, `:72-98` | The once-per-run `TRUNCATE` through the retry |
| `scripts/ci-acceptance.sh` | Modify `:357-358`, `:419-431` | The test step's note carries the wrapper's line |
| `docs/superpowers/spikes/gentler-tiers-baseline/` | **Create** | `burn.sh`, `durations.mjs`, `README.md` — the measurements |
| `docs/superpowers/RUNBOOK.md`, `ORIENTATION.md`, `TRAPS.md` | Modify | How to run the tiers gently; §2's row, §4's trap 4, §6's slow-list review; three traps |

---

## Task 1: Measure what this plan rests on

**Files:**
- Create: `docs/superpowers/spikes/gentler-tiers-baseline/burn.sh`
- Create: `docs/superpowers/spikes/gentler-tiers-baseline/durations.mjs`
- Create: `docs/superpowers/spikes/gentler-tiers-baseline/README.md`

**Interfaces:**
- Produces: the scale for `utility` and for `background` (Decision 3's rule), the quiet slow list (Decision 4's baseline), and the "today"
  red count under twelve burners — Task 3 sets the wrapper's defaults from the first, Task 5 cites the second, Task 6 compares with the third.

- [ ] **Step 1: Re-read every fact in *Read this first*.** Write the probe to a file and run it with `bash`:

```bash
cd /Users/rich/Developer/manifest
git log --oneline -1
sed -n '9,10p' package.json
sed -n '17p' vitest.config.ts
sed -n '13,22p;29,30p;37,51p' vitest.workspace.ts
sed -n '74,76p' packages/control-plane/vitest.global-setup.ts
sed -n '137,149p;185,188p' packages/control-plane/src/db/testing.ts
grep -n "a retire waits for a request that is in flight\|a retire never waits longer" packages/control-plane/src/runtime/driver-contract.ts
grep -n 'pnpm test 2>&1\|TEST_RC=\|record "pnpm test"\|^LOG=\|^trap' scripts/ci-acceptance.sh
grep -n '^EXPECT_' scripts/ci-acceptance.sh
find packages/control-plane/src packages/contract/src packages/journey/src packages/console/src packages/mock/src packages/github-fake/src \
  -name '*.test.ts' ! -name '*.docker.test.ts' -print0 \
  | xargs -0 grep -cE '^[[:space:]]*\}, [0-9][0-9_]*\)[[:space:]]*(//.*)?$|^[[:space:]]*\{ timeout: [0-9][0-9_]* \},?[[:space:]]*$' \
  | grep -v ':0$'
grep -rn 'pgrep -f vitest' scripts/
```

Expected: each line as *Read this first* quotes it, the explicit-timeout count **58 in 13 files** (unless A1's close added one — then
count the new number into Task 2), and `EXPECT_TESTS`/`EXPECT_FILES` as A1 left them. **Correct every number in this plan that moved**
before Task 2, and say so in the sitting's record.

- [ ] **Step 2: Record the versions and the database's lock settings.**

```bash
sw_vers; uname -m; node --version
docker info --format 'NCPU {{.NCPU}} MemTotal {{.MemTotal}} Engine {{.ServerVersion}}'
defaults read /Applications/Docker.app/Contents/Info.plist CFBundleShortVersionString
grep -o '"Cpus"[^,]*' ~/Library/Group\ Containers/group.com.docker/settings-store.json || echo 'no Cpus key (all CPUs)'
grep '"version"' node_modules/vitest/package.json
(cd packages/control-plane && node -e "console.log('pg', require('pg/package.json').version)")
docker exec manifest-postgres psql -U manifest -d manifest_control -Atc 'show deadlock_timeout' -c 'show lock_timeout'
sysctl -n hw.ncpu hw.perflevel0.physicalcpu hw.perflevel1.physicalcpu vm.loadavg
```

Expected: macOS 26.7.1 or later, Docker Desktop 4.87.0, NCPU 12, Vitest 2.1.9, pg 8.23.0, `deadlock_timeout` **`1s`** and `lock_timeout`
**`0`** (none). **If `deadlock_timeout` is not 1 s**, Task 4's deadlock test's timing (it relies on the `TRUNCATE` reaching it first) must
be re-derived before Task 4 — stop and work it out.

- [ ] **Step 3: Measure the QoS priorities.**

```bash
echo "normal $(sh -c 'ps -o pri= -p $$')"
echo "utility $(taskpolicy -c utility sh -c 'sh -c "ps -o pri= -p \$\$"')"
echo "background $(taskpolicy -b sh -c 'sh -c "ps -o pri= -p \$\$"')"
```

Expected: **31, 20, 4** (a grandchild each time). Task 3's test asserts these; if this macOS reads others, use these.

- [ ] **Step 4: Write `burn.sh`.**

```bash
#!/usr/bin/env bash
# The gentler test tiers plan's measurements: run a command beside N CPU burners (`yes > /dev/null`, at
# normal priority — the imitated load), sample the 1-minute load every 30 s, and print the wall time
# and the load's min / median / max. The burners die with this script, whatever ends it — except
# SIGKILL: after any run, `pgrep -x yes` must be empty (kill the PIDs printed below if not).
#
#   bash burn.sh <N> -- <command...>
#
# macOS bash 3.2 and BSD userland.
set -uo pipefail

N="${1:?usage: bash burn.sh <N> -- <command...>}"
shift
[ "${1:-}" = "--" ] && shift
[ "$#" -gt 0 ] || { echo "usage: bash burn.sh <N> -- <command...>" >&2; exit 64; }

BURNERS=""
SAMPLER=""
SAMPLES="$(mktemp -t gentler-load)"
cleanup() {
  for pid in $BURNERS; do kill "$pid" 2>/dev/null; done
  if [ -n "$SAMPLER" ]; then
    pkill -P "$SAMPLER" 2>/dev/null
    kill "$SAMPLER" 2>/dev/null
  fi
  rm -f "$SAMPLES"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

load1() { sysctl -n vm.loadavg | awk '{ print $2 }'; }

i=0
while [ "$i" -lt "$N" ]; do
  yes > /dev/null &
  BURNERS="$BURNERS $!"
  i=$((i + 1))
done
if [ "$N" -gt 0 ]; then
  # The 1-minute load is an exponential average: two minutes take it ~86% of the way to a step.
  echo "burn.sh: $N burners, PIDs:$BURNERS — waiting 120 s for the 1-minute load to rise"
  sleep 120
fi

load1 > "$SAMPLES"
( while sleep 30; do load1 >> "$SAMPLES"; done ) &
SAMPLER=$!

echo "burn.sh: starting at $(date '+%H:%M:%S'), 1-minute load $(head -1 "$SAMPLES"): $*"
START=$(date +%s)
"$@"
RC=$?
END=$(date +%s)

n="$(wc -l < "$SAMPLES" | tr -d ' ')"
min="$(sort -n "$SAMPLES" | head -1)"
max="$(sort -n "$SAMPLES" | tail -1)"
med="$(sort -n "$SAMPLES" | awk '{ v[NR] = $1 } END { print v[int((NR + 1) / 2)] }')"
echo "burn.sh: $N burners, wall $((END - START)) s, exit $RC, load (1-min) min $min / median $med / max $max over $n samples"
exit "$RC"
```

- [ ] **Step 5: Write `durations.mjs`.**

```js
// The gentler test tiers plan's measurements: read a Vitest JSON report (and, given a second, compare).
//   node durations.mjs <report.json> [<baseline.json>]
import { readFileSync } from 'node:fs'

function read(path) {
  const report = JSON.parse(readFileSync(path, 'utf8'))
  const tests = report.testResults.flatMap((file) =>
    file.assertionResults.map((test) => ({
      key: `${file.name.replace(/^.*?\/packages\//, 'packages/')} > ${test.fullName}`,
      status: test.status,
      ms: test.duration ?? 0,
      failure: (test.failureMessages[0] ?? '').split('\n')[0],
    })),
  )
  // A file whose hook failed may have no failed assertion of its own; its message is the file's.
  const fileFailures = report.testResults
    .filter((file) => file.status === 'failed' && file.message)
    .map((file) => `${file.name.replace(/^.*?\/packages\//, 'packages/')}: ${file.message.split('\n')[0]}`)
  const end = Math.max(...report.testResults.map((file) => file.endTime))
  return { tests, fileFailures, wallS: (end - report.startTime) / 1000 }
}

const [path, basePath] = process.argv.slice(2)
const run = read(path)
const red = run.tests.filter((test) => test.status === 'failed')
console.log(`wall ${run.wallS.toFixed(0)} s, ${run.tests.length} tests, ${red.length} failed`)
console.log(`  timed out: ${red.filter((test) => /timed out/i.test(test.failure)).length}`)
console.log(`  deadlock detected: ${red.filter((test) => /deadlock detected/i.test(test.failure)).length}`)
for (const test of red) console.log(`  RED ${test.key}: ${test.failure.slice(0, 160)}`)
for (const line of run.fileFailures) console.log(`  FILE ${line.slice(0, 200)}`)
console.log('slowest 25:')
for (const test of [...run.tests].sort((a, b) => b.ms - a.ms).slice(0, 25)) {
  console.log(`  ${String(Math.round(test.ms)).padStart(7)} ms  ${test.key}`)
}
const slow = run.tests.filter((test) => test.ms > 5000)
console.log(`over 5000 ms (the slow list): ${slow.length}`)
for (const test of slow) console.log(`  ${String(Math.round(test.ms)).padStart(7)} ms  ${test.key}`)

if (basePath) {
  const base = read(basePath)
  const before = new Map(base.tests.map((test) => [test.key, test.ms]))
  console.log(`wall ratio (this / baseline): ${(run.wallS / base.wallS).toFixed(2)}`)
  // Ratios only for tests that took at least half a second in the baseline: below that, noise.
  const ratios = run.tests
    .filter((test) => (before.get(test.key) ?? 0) >= 500)
    .map((test) => ({ key: test.key, ratio: test.ms / before.get(test.key) }))
    .sort((a, b) => b.ratio - a.ratio)
  console.log(`per-test ratio over ${ratios.length} tests ≥ 500 ms in the baseline: max ${ratios[0]?.ratio.toFixed(2)}`)
  for (const { key, ratio } of ratios.slice(0, 10)) console.log(`  ×${ratio.toFixed(2)}  ${key}`)
}
```

- [ ] **Step 6: The quiet baseline at normal priority** — with "7100 is yours", the HOLD, and `uptime`'s 1-minute load below 6. In the
background (it outlasts the tool limit); `OUT` is the session's scratchpad:

```bash
cd /Users/rich/Developer/manifest
B=docs/superpowers/spikes/gentler-tiers-baseline
bash $B/burn.sh 0 -- pnpm exec vitest run --project unit --project packages \
  --reporter=default --reporter=json --outputFile.json="$OUT/normal.json" > "$OUT/normal.log" 2>&1
tail -3 "$OUT/normal.log"; node $B/durations.mjs "$OUT/normal.json"
```

Expected: green (`Tests  <EXPECT_TESTS> passed`), the wall time near 737–900 s, the load line. **If it is not green on a quiet machine,
stop**: a red here is not load, and this plan measures nothing until it is understood.

- [ ] **Step 7: The same tree under utility, then under background**, each quiet, each in the background, one after the other:

```bash
bash $B/burn.sh 0 -- taskpolicy -c utility pnpm exec vitest run --project unit --project packages \
  --reporter=default --reporter=json --outputFile.json="$OUT/utility.json" > "$OUT/utility.log" 2>&1
node $B/durations.mjs "$OUT/utility.json" "$OUT/normal.json"
```

```bash
bash $B/burn.sh 0 -- taskpolicy -b pnpm exec vitest run --project unit --project packages \
  --reporter=default --reporter=json --outputFile.json="$OUT/background.json" > "$OUT/background.log" 2>&1
node $B/durations.mjs "$OUT/background.json" "$OUT/normal.json"
```

Expected: each prints its wall ratio `s`. **Any red under background on a quiet machine is recorded by name** — it is a test that cannot
finish in 5 s at that priority, which the scale must cover.

- [ ] **Step 8: Today's tree under twelve burners** — after Rich's yes on the time:

```bash
bash $B/burn.sh 12 -- pnpm exec vitest run --project unit --project packages \
  --reporter=default --reporter=json --outputFile.json="$OUT/load-today.json" > "$OUT/load-today.log" 2>&1
node $B/durations.mjs "$OUT/load-today.json" "$OUT/normal.json"
pgrep -x yes || echo 'no burners left'
```

Expected: **red** — some number of `Test timed out in 5000ms`, perhaps a `deadlock detected`. That number is the "before" of Task 6. (If
it is green, record that honestly: the comparison then rests on Task 1's quiet ratios and the record in *Read this first*, and Task 6
says so.)

- [ ] **Step 9: Set the scales and write the README.** For each of utility and background: `s` = its wall ÷ normal's; **scale =
max(2, ⌈2 × s⌉)**. Then check every test in that run slower than 2 500 × scale ms: each must be one of the 58 explicit sites (it scales
too); any other is a finding — name it. `README.md` records: the date and versions (Step 2), the priorities (Step 3), the four runs' wall
times, loads and red counts, the ratios, **the two scales and the arithmetic**, the quiet run's slow list (the baseline Decision 4's review
compares against), and the reds under twelve burners by name.

- [ ] **Step 10: Commit.**

```bash
git status --short
git add docs/superpowers/spikes/gentler-tiers-baseline/burn.sh docs/superpowers/spikes/gentler-tiers-baseline/durations.mjs \
  docs/superpowers/spikes/gentler-tiers-baseline/README.md
git commit -m "docs(tests): the gentler test tiers plan's Task 1 — the unit suite quiet at normal, utility and background priority, and under twelve burners; the scales" \
  -- docs/superpowers/spikes/gentler-tiers-baseline/
```

---

## Task 2: The timeout scale

**Files:**
- Create: `packages/control-plane/src/test-timeouts.ts`
- Test: `packages/control-plane/src/test-timeouts.test.ts`
- Modify: `vitest.workspace.ts`, `vitest.config.ts`
- Modify: the 13 files Task 1's Step 1 listed (58 lines, and one import each)

**Interfaces:**
- Produces (from `packages/control-plane/src/test-timeouts.ts`):
  - `BASE_TEST_TIMEOUT_MS = 5_000`, `BASE_HOOK_TIMEOUT_MS = 10_000`, `MAX_TIMEOUT_SCALE = 10`
  - `timeoutScale(env?: NodeJS.ProcessEnv): number` — 1 when unset or blank; throws naming the variable and value outside 1–10
  - `testTimeouts(env?): { testTimeout: number; hookTimeout: number }`
  - `scaled(ms: number, env?): number`
  - `resetLockTimeoutMs(env?): number` — ⌊5 000 × scale ÷ 4⌋ (Task 4's admin pools)

- [ ] **Step 1: Write the failing test.** `packages/control-plane/src/test-timeouts.test.ts`:

```ts
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  BASE_HOOK_TIMEOUT_MS,
  BASE_TEST_TIMEOUT_MS,
  resetLockTimeoutMs,
  scaled,
  testTimeouts,
  timeoutScale,
} from './test-timeouts.js'

/**
 * The timeout scale (the gentler test tiers plan, Task 2): a test tier run at a lower priority is slower,
 * so Vitest's limits grow with it — and every one, or a test that asked for more time ends up with less.
 */
const scale = (value: string) => ({ MANIFEST_TEST_TIMEOUT_SCALE: value })

describe('the timeout scale', () => {
  it('is 1 when unset or blank', () => {
    expect(timeoutScale({})).toBe(1)
    expect(timeoutScale(scale(''))).toBe(1)
    expect(timeoutScale(scale('  '))).toBe(1)
  })

  it('reads a number from 1 to 10, a fraction too', () => {
    expect(timeoutScale(scale('1'))).toBe(1)
    expect(timeoutScale(scale('2'))).toBe(2)
    expect(timeoutScale(scale('1.5'))).toBe(1.5)
    expect(timeoutScale(scale('10'))).toBe(10)
  })

  it('refuses anything else, naming the variable and what it was given', () => {
    for (const value of ['0', '0.5', '-2', '11', 'abc', 'NaN', 'Infinity', '2s']) {
      expect(() => timeoutScale(scale(value))).toThrow(
        `MANIFEST_TEST_TIMEOUT_SCALE must be a number from 1 to 10 — got '${value}'`,
      )
    }
  })

  it('scales Vitest’s own defaults: 5 s a test, 10 s a hook', () => {
    expect(BASE_TEST_TIMEOUT_MS).toBe(5_000)
    expect(BASE_HOOK_TIMEOUT_MS).toBe(10_000)
    expect(testTimeouts({})).toEqual({ testTimeout: 5_000, hookTimeout: 10_000 })
    expect(testTimeouts(scale('4'))).toEqual({ testTimeout: 20_000, hookTimeout: 40_000 })
    expect(testTimeouts(scale('1.5'))).toEqual({ testTimeout: 7_500, hookTimeout: 15_000 })
  })

  it('scales an explicit timeout by the same factor', () => {
    expect(scaled(30_000, {})).toBe(30_000)
    expect(scaled(10_000, scale('4'))).toBe(40_000)
  })

  it('gives the reset a lock budget whose three attempts and pauses fit inside a TEST’s timeout', () => {
    expect(resetLockTimeoutMs({})).toBe(1_250)
    expect(resetLockTimeoutMs(scale('4'))).toBe(5_000)
    for (const value of ['1', '2', '4', '10']) {
      const budget = resetLockTimeoutMs(scale(value))
      // Three attempts, and the 100 ms and 200 ms pauses between them (db/truncate.ts).
      expect(3 * budget + 300).toBeLessThan(testTimeouts(scale(value)).testTimeout)
    }
  })
})

/**
 * Every explicit timeout in the unit and packages tiers goes through `scaled()`. These two shapes are the
 * ones the tiers used — `}, 30_000)` closing a test or hook, and `{ timeout: 30_000 },` on its own line.
 */
const BARE_TIMEOUT =
  /^[\t ]*\}, [0-9][0-9_]*\)[\t ]*(\/\/.*)?$|^[\t ]*\{ timeout: [0-9][0-9_]* \},?[\t ]*$/

const ROOT = new URL('../../../', import.meta.url).pathname
const SOURCES = [
  'packages/control-plane/src',
  'packages/contract/src',
  'packages/journey/src',
  'packages/console/src',
  'packages/mock/src',
  'packages/github-fake/src',
]

describe('every explicit timeout in the unit and packages tiers is scaled', () => {
  it('no test file passes Vitest a bare number of milliseconds', () => {
    // The scanner can see one: a negative claim needs a positive control in the same test.
    expect(BARE_TIMEOUT.test('  }, 30_000)')).toBe(true)
    expect(BARE_TIMEOUT.test('  }, 15_000) // a reason')).toBe(true)
    expect(BARE_TIMEOUT.test('    { timeout: 30_000 },')).toBe(true)
    expect(BARE_TIMEOUT.test('  }, scaled(30_000))')).toBe(false)
    expect(BARE_TIMEOUT.test('    { timeout: scaled(30_000) },')).toBe(false)

    const offenders: string[] = []
    for (const source of SOURCES) {
      const dir = join(ROOT, source)
      for (const file of readdirSync(dir, { recursive: true, encoding: 'utf8' })) {
        if (!file.endsWith('.test.ts') || file.endsWith('.docker.test.ts')) continue
        readFileSync(join(dir, file), 'utf8')
          .split('\n')
          .forEach((line, index) => {
            if (BARE_TIMEOUT.test(line)) offenders.push(`${source}/${file}:${index + 1}`)
          })
      }
    }
    expect(offenders).toEqual([])
  })
})
```

- [ ] **Step 2: Run it to see it fail.**

Run: `pnpm exec vitest run --project unit src/test-timeouts.test.ts`
Expected: FAIL — the import of `./test-timeouts.js` cannot be resolved (the module does not exist). *Read the reason: not a red for any
other cause.*

- [ ] **Step 3: Write `packages/control-plane/src/test-timeouts.ts`.**

```ts
/**
 * How long a unit or packages test may take: Vitest's own defaults, multiplied by
 * MANIFEST_TEST_TIMEOUT_SCALE (the gentler test tiers plan, Rich's yes of 2026-10-14).
 *
 * scripts/test-gently.sh runs the tiers at a lower macOS priority so the laptop stays usable, and a
 * lower priority is a slower run; it sets the scale from the priority it chose. Unset, the scale is 1,
 * so a single file run with `pnpm exec vitest run` keeps Vitest's 5 s. The cost, accepted by Rich: a
 * real hang takes the scale's multiple to report. `slowTestThreshold` (vitest.config.ts) keeps every
 * test over the old 5 s named in the output.
 *
 * Read by vitest.workspace.ts (the projects' limits), every test that sets its own limit (`scaled`),
 * and db/testing.ts and the global setup (the reset's lock budget). The docker project keeps 120 s.
 */
export const BASE_TEST_TIMEOUT_MS = 5_000
export const BASE_HOOK_TIMEOUT_MS = 10_000
export const MAX_TIMEOUT_SCALE = 10

export function timeoutScale(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.MANIFEST_TEST_TIMEOUT_SCALE
  if (raw === undefined || raw.trim() === '') return 1
  const scale = Number(raw)
  if (!Number.isFinite(scale) || scale < 1 || scale > MAX_TIMEOUT_SCALE) {
    throw new Error(
      `MANIFEST_TEST_TIMEOUT_SCALE must be a number from 1 to ${MAX_TIMEOUT_SCALE} — got '${raw}'. ` +
        'scripts/test-gently.sh sets it from the priority it runs the tier at; unset, it is 1.',
    )
  }
  return scale
}

export function testTimeouts(env: NodeJS.ProcessEnv = process.env): {
  testTimeout: number
  hookTimeout: number
} {
  const scale = timeoutScale(env)
  return {
    testTimeout: Math.round(BASE_TEST_TIMEOUT_MS * scale),
    hookTimeout: Math.round(BASE_HOOK_TIMEOUT_MS * scale),
  }
}

/** A test's or hook's own limit, scaled as the defaults are — or it would end up with less than they have. */
export function scaled(ms: number, env: NodeJS.ProcessEnv = process.env): number {
  return Math.round(ms * timeoutScale(env))
}

/**
 * The reset's lock budget, per attempt (db/truncate.ts). A quarter of a TEST's limit, not a hook's:
 * some files reset inside a test body, and three attempts with their pauses must fit inside it.
 */
export function resetLockTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  return Math.floor((BASE_TEST_TIMEOUT_MS * timeoutScale(env)) / 4)
}
```

- [ ] **Step 4: Run the parsing tests to see them pass, and the scanner fail.**

Run: `pnpm exec vitest run --project unit src/test-timeouts.test.ts`
Expected: the six scale tests PASS; **the scanner FAILS listing 58 offenders** (or Task 1's corrected count) by `file:line` — its
expected red, and the proof it reads every file.

- [ ] **Step 5: Convert the 58 sites.** BSD `sed`, on exactly the files the scanner named (write it to a file and run it with `bash`):

```bash
cd /Users/rich/Developer/manifest
FILES=$(find packages/control-plane/src packages/journey/src -name '*.test.ts' ! -name '*.docker.test.ts' -print0 \
  | xargs -0 grep -lE '^[[:space:]]*\}, [0-9][0-9_]*\)[[:space:]]*(//.*)?$|^[[:space:]]*\{ timeout: [0-9][0-9_]* \},?[[:space:]]*$')
for f in $FILES; do
  sed -E -i '' \
    -e 's/^([[:space:]]*\}, )([0-9][0-9_]*)\)([[:space:]]*(\/\/.*)?)$/\1scaled(\2))\3/' \
    -e 's/^([[:space:]]*\{ timeout: )([0-9][0-9_]*)( \},?[[:space:]]*)$/\1scaled(\2)\3/' "$f"
  echo "$f: $(grep -c 'scaled(' "$f")"
done
git diff --stat
```

Expected: the 13 files, `58` `scaled(` lines in total, and **every changed line a Vitest timeout** — read each diff hunk's opening `it(`,
`test(` or hook (a `setTimeout` closer would match the shape too; there is none at `abdd01e`, and one found now is left as it was and the
scanner's shape narrowed instead).

Then add one import to each file, after its last import — the path by depth:

| File | Import |
|---|---|
| `src/api/{admin-reason,agents,events,lifecycle}.test.ts`, `src/blueprints/{ai-component,proof-app-boot,saml-request-cache,session-component}.test.ts`, `src/db/locks.test.ts`, `src/mail/mailer.test.ts`, `src/sso/platform.test.ts` | `import { scaled } from '../test-timeouts.js'` |
| `src/source/github/driver.test.ts` | `import { scaled } from '../../test-timeouts.js'` |
| `packages/journey/src/examples.test.ts` | `import { scaled } from '../../control-plane/src/test-timeouts.js'` — with the comment `// The one reading of the scale (the gentler test tiers plan); journey's tests are not typechecked (tsconfig excludes them), so the reach across packages costs nothing.` |

- [ ] **Step 6: Give the two projects the scaled limits, and the root the threshold.** `vitest.workspace.ts`:

```ts
import { defineWorkspace } from 'vitest/config'
// The gentler test tiers plan: `unit` and `packages` take Vitest's limits multiplied by
// MANIFEST_TEST_TIMEOUT_SCALE, which scripts/test-gently.sh sets (1 when unset; a value outside 1–10
// stops the run here, naming it). The docker project keeps its own 120 s.
import { testTimeouts } from './packages/control-plane/src/test-timeouts.js'

const SCALED = testTimeouts(process.env)
```

and in both the `unit` project's `test` (after `globalSetup`) and the `packages` project's (after `include`):

```ts
      testTimeout: SCALED.testTimeout,
      hookTimeout: SCALED.hookTimeout,
```

`vitest.config.ts` — the import, a paragraph in the comment, and the option:

```ts
import { defineConfig } from 'vitest/config'
import { BASE_TEST_TIMEOUT_MS } from './packages/control-plane/src/test-timeouts.js'

/**
 * …(the existing paragraphs, unchanged)…
 *
 * `slowTestThreshold` is root-level too: Vitest 2.1.9's reporters read the ROOT config's, never a
 * project's. Set to Vitest's old 5 s limit, it names — with its duration — every test the timeout
 * scale would otherwise let pass unremarked (the gentler test tiers plan); it replaces the 300 ms
 * default, so a run through a pipe lists only those. ORIENTATION §6 reviews the list at every close.
 */
export default defineConfig({
  test: { fileParallelism: false, slowTestThreshold: BASE_TEST_TIMEOUT_MS },
})
```

- [ ] **Step 7: Run the test file to see it pass, then the scale's own control.**

Run: `pnpm exec vitest run --project unit src/test-timeouts.test.ts` — Expected: 7 PASS.

Then, **not committed**, `packages/control-plane/src/scale.scratch.test.ts` and `packages/journey/src/scale.scratch.test.ts`, each:

```ts
import { expect, it } from 'vitest'
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
it('takes one second', async () => {
  await sleep(1_000)
  expect(true).toBe(true)
})
it('takes six seconds', async () => {
  await sleep(6_000)
  expect(true).toBe(true)
})
```

```bash
pnpm exec vitest run --project unit src/scale.scratch.test.ts 2>&1 | cat          # A
MANIFEST_TEST_TIMEOUT_SCALE=2 pnpm exec vitest run --project unit src/scale.scratch.test.ts 2>&1 | cat   # B
MANIFEST_TEST_TIMEOUT_SCALE=2 pnpm exec vitest run --project packages packages/journey/src/scale.scratch.test.ts 2>&1 | cat   # C
MANIFEST_TEST_TIMEOUT_SCALE=abc pnpm exec vitest run --project unit src/scale.scratch.test.ts 2>&1 | cat  # D
```

Expected: **A** — *takes six seconds* RED, `Test timed out in 5000ms`; **B** and **C** — both green, and in the piped output **only** the
six-second test carries a duration (`✓ … takes six seconds 60xxms`), the one-second test none; **D** — the run stops before any test,
naming `MANIFEST_TEST_TIMEOUT_SCALE` and `'abc'`. **Control for the threshold**: remove `slowTestThreshold` from `vitest.config.ts`, run B
again — the ONE-second test now carries a duration too (the 300 ms default); restore. Delete both scratch files; `git status` shows
neither.

- [ ] **Step 8: Control for the scanner.** Revert one converted site by hand (`}, scaled(30_000))` → `}, 30_000)` in
`src/api/lifecycle.test.ts`), run the test file: RED naming that `file:line`; restore it; green.

- [ ] **Step 9: The four gates, and commit.** `pnpm lint`, `pnpm typecheck`, `pnpm format:check` (run `pnpm exec prettier --write` on
the changed files first), then `pnpm test` — still the old `vitest run`, so the scale is 1 and nothing should change but the count (+7, one
file). Then:

```bash
git status --short
git commit -m "feat(tests): a timeout scale for the unit and packages tiers — Vitest's limits, every explicit one, and slowTestThreshold at the old 5 s" \
  -- packages/control-plane/src/test-timeouts.ts packages/control-plane/src/test-timeouts.test.ts vitest.workspace.ts vitest.config.ts \
  packages/control-plane/src/api/admin-reason.test.ts packages/control-plane/src/api/agents.test.ts \
  packages/control-plane/src/api/events.test.ts packages/control-plane/src/api/lifecycle.test.ts \
  packages/control-plane/src/blueprints/ai-component.test.ts packages/control-plane/src/blueprints/proof-app-boot.test.ts \
  packages/control-plane/src/blueprints/saml-request-cache.test.ts packages/control-plane/src/blueprints/session-component.test.ts \
  packages/control-plane/src/db/locks.test.ts packages/control-plane/src/mail/mailer.test.ts \
  packages/control-plane/src/source/github/driver.test.ts packages/control-plane/src/sso/platform.test.ts \
  packages/journey/src/examples.test.ts
```

(If Task 1's Step 1 found a fourteenth file, add it here.)

---

## Task 3: The wrapper — `scripts/test-gently.sh`

**Files:**
- Create: `scripts/test-gently.sh`
- Test: `packages/control-plane/src/test-gently.test.ts`
- Modify: `package.json:9-10`

**Interfaces:**
- Consumes: Task 1's two scales (the `DEFAULT_SCALE` values below are the provisional 2 and 4 — **replace them with Task 1's**, and with
  them every `2` and `4` the test pins: the scale case's two lines and the summary regex's `timeout scale 2`).
- Produces: the environment contract every later task reads — `MANIFEST_TEST_QOS` (`utility` | `background` | `normal`),
  `MANIFEST_TEST_TIMEOUT_SCALE`, `MANIFEST_TEST_FORCE`, `MANIFEST_TEST_MAX_LOAD`, `MANIFEST_TEST_LOAD_REPORT` (a file path; one line
  written), `MANIFEST_TEST_SAMPLE_SECONDS` (default 30), `MANIFEST_TEST_GENTLY` (set for the child); exit **75** refused by the gate,
  **64** a usage error or a bad QoS, **69** no `taskpolicy`; otherwise the command's own status.

- [ ] **Step 1: Write the failing test.** `packages/control-plane/src/test-gently.test.ts`:

```ts
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

/**
 * scripts/test-gently.sh (the gentler test tiers plan, Task 3) — the wrapper `pnpm test` and
 * `pnpm test:docker` run through. DB-free: it spawns the script around tiny commands.
 *
 * THIS SUITE MAY ITSELF BE RUNNING INSIDE THE WRAPPER, so every run starts from `cleanEnv()`, and the
 * priorities are asserted against this process's own. The QoS control (Step 5) is run unwrapped.
 */
const ROOT = new URL('../../../', import.meta.url).pathname
const SCRIPT = join(ROOT, 'scripts/test-gently.sh')
const OURS = [
  'MANIFEST_TEST_GENTLY',
  'MANIFEST_TEST_QOS',
  'MANIFEST_TEST_TIMEOUT_SCALE',
  'MANIFEST_TEST_FORCE',
  'MANIFEST_TEST_MAX_LOAD',
  'MANIFEST_TEST_LOAD_REPORT',
  'MANIFEST_TEST_SAMPLE_SECONDS',
]

function cleanEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const name of OURS) delete env[name]
  // A gate no machine reaches, unless a case sets its own.
  return { ...env, MANIFEST_TEST_MAX_LOAD: '100000', ...extra }
}

function gently(command: string[], extra: Record<string, string> = {}) {
  const run = spawnSync('bash', [SCRIPT, ...command], {
    cwd: ROOT,
    env: cleanEnv(extra),
    encoding: 'utf8',
  })
  return { status: run.status, stdout: run.stdout, stderr: run.stderr }
}

/** The one line of a run's output that is only a number — what the command printed, not the wrapper. */
function printed(stdout: string): string {
  const lines = stdout.split('\n').filter((line) => !line.startsWith('test-gently:') && line.trim() !== '')
  return lines.join('\n').trim()
}

/** `ps -o pri=`: 31 at normal priority, 20 under a utility clamp, 4 in the background (Task 1, Step 3). */
function priorityOf(pid: number): number {
  return Number(spawnSync('ps', ['-o', 'pri=', '-p', String(pid)], { encoding: 'utf8' }).stdout.trim())
}
const GRANDCHILD_PRI = ['sh', '-c', `sh -c 'ps -o pri= -p $$'`]

let scratch: string | undefined
afterEach(() => {
  if (scratch) rmSync(scratch, { recursive: true, force: true })
  scratch = undefined
})

describe('scripts/test-gently.sh', () => {
  it('runs the command under a utility clamp by default, inherited by a grandchild', () => {
    const run = gently(GRANDCHILD_PRI)
    expect(run.status).toBe(0)
    expect(Number(printed(run.stdout))).toBe(Math.min(20, priorityOf(process.pid)))
  })

  it('runs it in the background when asked', () => {
    const run = gently(GRANDCHILD_PRI, { MANIFEST_TEST_QOS: 'background' })
    expect(run.status).toBe(0)
    expect(Number(printed(run.stdout))).toBe(4)
  })

  it('runs it at the caller’s own priority when asked for normal', () => {
    const run = gently(GRANDCHILD_PRI, { MANIFEST_TEST_QOS: 'normal' })
    expect(run.status).toBe(0)
    expect(Number(printed(run.stdout))).toBe(priorityOf(process.pid))
  })

  it('hands the command the scale for its priority, and keeps one already set', () => {
    const echo = ['sh', '-c', 'echo "$MANIFEST_TEST_TIMEOUT_SCALE"']
    expect(printed(gently(echo).stdout)).toBe('2') // Task 1's utility scale
    expect(printed(gently(echo, { MANIFEST_TEST_QOS: 'background' }).stdout)).toBe('4') // Task 1's background scale
    expect(printed(gently(echo, { MANIFEST_TEST_QOS: 'normal' }).stdout)).toBe('1')
    expect(printed(gently(echo, { MANIFEST_TEST_TIMEOUT_SCALE: '3' }).stdout)).toBe('3')
  })

  it('refuses to start above the gate with 75, naming the load and the gate, and runs nothing', () => {
    const run = gently(['sh', '-c', 'echo RAN'], { MANIFEST_TEST_MAX_LOAD: '-1' })
    expect(run.status).toBe(75)
    expect(run.stdout).not.toContain('RAN')
    expect(run.stderr).toMatch(
      /REFUSED to start: the 1-minute load is [0-9.]+, above the gate of -1 .*MANIFEST_TEST_FORCE=1/,
    )
  })

  it('runs anyway when forced, and its summary says so', () => {
    const run = gently(['sh', '-c', 'echo RAN'], {
      MANIFEST_TEST_MAX_LOAD: '-1',
      MANIFEST_TEST_FORCE: '1',
    })
    expect(run.status).toBe(0)
    expect(run.stdout).toContain('RAN')
    expect(run.stdout).toMatch(/test-gently: load \(1-min\) .* forced yes; exit 0/)
  })

  it('exits with the command’s own status, and its summary names it', () => {
    const run = gently(['sh', '-c', 'exit 3'])
    expect(run.status).toBe(3)
    expect(run.stdout).toMatch(/; exit 3$/m)
  })

  it('samples the load through the run and writes the summary to MANIFEST_TEST_LOAD_REPORT', () => {
    scratch = mkdtempSync(join(tmpdir(), 'gently-'))
    const report = join(scratch, 'load')
    const run = gently(['sleep', '1'], {
      MANIFEST_TEST_LOAD_REPORT: report,
      MANIFEST_TEST_SAMPLE_SECONDS: '0.2',
    })
    expect(run.status).toBe(0)
    const line = readFileSync(report, 'utf8').trim()
    const match = line.match(
      /^load \(1-min\) min ([0-9.]+) \/ median ([0-9.]+) \/ max ([0-9.]+) over ([0-9]+) samples 0\.2 s apart; QoS utility, timeout scale 2, gate 100000, forced no; exit 0$/,
    )
    expect(match).not.toBeNull()
    expect(Number(match![4])).toBeGreaterThanOrEqual(3)
    expect(Number(match![1])).toBeLessThanOrEqual(Number(match![2]))
    expect(Number(match![2])).toBeLessThanOrEqual(Number(match![3]))
  })

  it('writes the refusal to MANIFEST_TEST_LOAD_REPORT too', () => {
    scratch = mkdtempSync(join(tmpdir(), 'gently-'))
    const report = join(scratch, 'load')
    const run = gently(['true'], { MANIFEST_TEST_MAX_LOAD: '-1', MANIFEST_TEST_LOAD_REPORT: report })
    expect(run.status).toBe(75)
    expect(readFileSync(report, 'utf8')).toMatch(/^REFUSED to start: the 1-minute load is /)
  })

  it('leaves nothing running behind it — its sampler carries the command line, `vitest` and all', () => {
    const marker = `gently-marker-${randomUUID()}`
    const run = gently(['sh', '-c', 'sleep 0.5', marker], { MANIFEST_TEST_SAMPLE_SECONDS: '0.1' })
    expect(run.status).toBe(0)
    const left = spawnSync('pgrep', ['-f', marker], { encoding: 'utf8' })
    expect(left.stdout.trim()).toBe('')
    expect(left.status).toBe(1) // pgrep: nothing matched
  })

  it('passes straight through inside a gentle run — no second gate, sampler or summary', () => {
    const run = gently(['sh', '-c', 'echo INNER; exit 5'], {
      MANIFEST_TEST_GENTLY: '1',
      MANIFEST_TEST_MAX_LOAD: '-1',
    })
    expect(run.status).toBe(5)
    expect(run.stdout.trim()).toBe('INNER')
  })

  it('refuses an unknown priority with 64, naming it', () => {
    const run = gently(['true'], { MANIFEST_TEST_QOS: 'urgent' })
    expect(run.status).toBe(64)
    expect(run.stderr).toContain(
      "MANIFEST_TEST_QOS must be utility, background or normal — got 'urgent'",
    )
  })
})
```

- [ ] **Step 2: Run it to see it fail.**

Run: `pnpm exec vitest run --project unit src/test-gently.test.ts`
Expected: FAIL — every case: `bash: …/scripts/test-gently.sh: No such file or directory`, status 127.

- [ ] **Step 3: Write `scripts/test-gently.sh`.**

```bash
#!/usr/bin/env bash
# Runs a test tier GENTLY on this Mac, so Rich can use the machine while it runs (the gentler test
# tiers plan, his yes of 2026-10-14). `pnpm test` and `pnpm test:docker` ARE this script; so is
# ci-acceptance's test step, through `pnpm test`.
#
#   1. PRIORITY. The command runs under `taskpolicy -c utility`, so the scheduler serves Rich's own
#      work first — or `taskpolicy -b` (background: the lowest priority, throttled disk) with
#      MANIFEST_TEST_QOS=background, which is what to ask for while he is on a call. Every child
#      inherits it (taskpolicy(8)): `ps -o pri=` reads 31 normal, 20 utility, 4 background.
#      MANIFEST_TEST_QOS=normal runs as before, for measuring.
#   2. THE TIMEOUT SCALE. A lower priority is a slower run, so this exports MANIFEST_TEST_TIMEOUT_SCALE
#      for its priority unless it is already set, and packages/control-plane/src/test-timeouts.ts
#      multiplies the unit and packages tiers' limits by it. The values are the plan's Task 1's.
#   3. THE LOAD GATE. Above a 1-minute load of MANIFEST_TEST_MAX_LOAD (default: this machine's CPU
#      count) it refuses to start, exit 75, unless MANIFEST_TEST_FORCE=1. It samples the load every
#      MANIFEST_TEST_SAMPLE_SECONDS (30) and prints one line at the end — min, median, max, the
#      priority, the scale, the gate, forced, the exit status — written to MANIFEST_TEST_LOAD_REPORT
#      too when that names a file (ci-acceptance's test step reads it).
#
# NEVER PAUSE A RUN WITH `kill -STOP`. Vitest's limits are wall-clock timers: on `kill -CONT` every
# one that came due while it was stopped fires at once, and every test in flight times out. Stop it
# (Ctrl-C) and start it again with MANIFEST_TEST_QOS=background instead.
#
# Exit: the command's own status; 75 refused by the gate; 64 a usage error or an unknown priority;
# 69 no taskpolicy. macOS ships bash 3.2 and a BSD userland: no associative arrays, no `mapfile`.
set -uo pipefail

if [ "$#" -eq 0 ]; then
  echo "usage: bash scripts/test-gently.sh <command> [args...]" >&2
  exit 64
fi

# Inside a gentle run already (a `pnpm test` started from one): the priority is inherited, and the
# outer run gates and samples. One gate, one sampler, one summary.
if [ -n "${MANIFEST_TEST_GENTLY:-}" ]; then
  exec "$@"
fi

QOS="${MANIFEST_TEST_QOS:-utility}"
case "$QOS" in
  utility)
    POLICY="-c utility"
    DEFAULT_SCALE=2
    ;;
  background)
    POLICY="-b"
    DEFAULT_SCALE=4
    ;;
  normal)
    POLICY=""
    DEFAULT_SCALE=1
    ;;
  *)
    echo "test-gently: MANIFEST_TEST_QOS must be utility, background or normal — got '$QOS'" >&2
    exit 64
    ;;
esac
if [ -n "$POLICY" ] && ! command -v taskpolicy > /dev/null 2>&1; then
  echo "test-gently: taskpolicy is not on PATH (macOS has it at /usr/sbin/taskpolicy); MANIFEST_TEST_QOS=normal runs without it" >&2
  exit 69
fi

export MANIFEST_TEST_TIMEOUT_SCALE="${MANIFEST_TEST_TIMEOUT_SCALE:-$DEFAULT_SCALE}"
export MANIFEST_TEST_GENTLY=1
INTERVAL="${MANIFEST_TEST_SAMPLE_SECONDS:-30}"
GATE="${MANIFEST_TEST_MAX_LOAD:-$(sysctl -n hw.ncpu)}"

# `sysctl -n vm.loadavg` prints `{ 3.61 5.71 6.54 }`; the second field is the 1-minute load.
load1() { sysctl -n vm.loadavg | awk '{ print $2 }'; }

# report <line> — to stdout, and to MANIFEST_TEST_LOAD_REPORT when it names a file.
report() {
  echo "test-gently: $1"
  if [ -n "${MANIFEST_TEST_LOAD_REPORT:-}" ]; then
    echo "$1" > "$MANIFEST_TEST_LOAD_REPORT"
  fi
}

NOW="$(load1)"
FORCED=no
if awk -v l="$NOW" -v g="$GATE" 'BEGIN { exit !(l > g) }'; then
  if [ -z "${MANIFEST_TEST_FORCE:-}" ]; then
    report "REFUSED to start: the 1-minute load is $NOW, above the gate of $GATE (MANIFEST_TEST_MAX_LOAD; by default this machine's CPU count). Wait for it to fall, or set MANIFEST_TEST_FORCE=1 — a forced run says so in its summary." >&2
    exit 75
  fi
  FORCED=yes
fi

SAMPLES="$(mktemp -t manifest-load)"
echo "$NOW" > "$SAMPLES"
(
  while sleep "$INTERVAL"; do
    load1 >> "$SAMPLES"
  done
) &
SAMPLER=$!

RC=0
summary() {
  local n lo mid hi
  # The sampler's `sleep` first, then the loop — or the sleep outlives the run by up to $INTERVAL,
  # and the loop, whose command line is ours (`vitest` and all), reads as a run still going.
  pkill -P "$SAMPLER" 2> /dev/null
  kill "$SAMPLER" 2> /dev/null
  wait "$SAMPLER" 2> /dev/null
  n="$(wc -l < "$SAMPLES" | tr -d ' ')"
  lo="$(sort -n "$SAMPLES" | head -1)"
  hi="$(sort -n "$SAMPLES" | tail -1)"
  mid="$(sort -n "$SAMPLES" | awk '{ v[NR] = $1 } END { print v[int((NR + 1) / 2)] }')"
  rm -f "$SAMPLES"
  report "load (1-min) min $lo / median $mid / max $hi over $n samples $INTERVAL s apart; QoS $QOS, timeout scale $MANIFEST_TEST_TIMEOUT_SCALE, gate $GATE, forced $FORCED; exit $RC"
}
trap summary EXIT
trap 'RC=130; exit 130' INT
trap 'RC=143; exit 143' TERM

echo "test-gently: QoS $QOS, timeout scale $MANIFEST_TEST_TIMEOUT_SCALE, 1-minute load $NOW (gate $GATE, forced $FORCED)"
if [ -n "$POLICY" ]; then
  # Unquoted on purpose: `-c utility` is two words.
  taskpolicy $POLICY "$@"
else
  "$@"
fi
RC=$?
exit "$RC"
```

- [ ] **Step 4: Run the test to see it pass.**

Run: `pnpm exec vitest run --project unit src/test-gently.test.ts`
Expected: 12 PASS. (Put Task 1's scales in `DEFAULT_SCALE` and the test's three pins first, if they differ.)

- [ ] **Step 5: The controls, each run UNWRAPPED (this process at priority 31), each restored after.**
  - Replace `taskpolicy $POLICY "$@"` with `"$@"` → *runs the command under a utility clamp* RED (`expected 31 to be 20`) and *in the
    background* RED (`31` vs `4`).
  - Change `exit "$RC"` to `exit 0` → *exits with the command's own status* RED (`0` vs `3`).
  - Remove the `pkill -P "$SAMPLER"` and `kill "$SAMPLER"` lines → *leaves nothing running behind it* RED (`pgrep` finds the subshell).
  - Remove the `MANIFEST_TEST_GENTLY` pass-through → *passes straight through* RED (status 75, the gate refused).
  - `git diff scripts/test-gently.sh` empty after each restore.

- [ ] **Step 6: Make `pnpm test` and `pnpm test:docker` the wrapper.** `package.json`:

```json
    "test": "bash scripts/test-gently.sh vitest run --project unit --project packages",
    "test:docker": "MANIFEST_TEST_DOCKER=1 bash scripts/test-gently.sh vitest run --project docker",
```

- [ ] **Step 7: The gates — `pnpm test` through the wrapper, twice.** `pnpm lint`, `pnpm typecheck`, `pnpm format:check` (shell scripts
are not Prettier's), then `pnpm test` twice, each beginning `test-gently: QoS utility, timeout scale <Task 1's>` and ending with the
summary line, both green with the new count (+12 tests, one file, beyond Task 2's). Run the first in the background if it may pass 10
minutes. **Compare its wall time with Task 1's utility run** — the same tree plus three files, so within ~10 %. Read the slow list
(`grep -E '^ +✓ .* [0-9]+ms$'` in the log) against Task 1's quiet list.

- [ ] **Step 8: Commit** (with sitting 1's `EXPECT_` move in `scripts/ci-acceptance.sh`, if this is the sitting's last commit).

```bash
git status --short
git commit -m "feat(tests): scripts/test-gently.sh — pnpm test and test:docker at utility priority (background on request), the timeout scale, a load gate and the load over the run" \
  -- scripts/test-gently.sh packages/control-plane/src/test-gently.test.ts package.json
```

---

## Task 4: `resetDatabase` survives a deadlock

> **SITTING 1 MEASURED (2026-10-14, *What executing this plan found*, *Sitting 1*):** the scales are **utility 3, background 7** — so
> `resetLockTimeoutMs()` is **3 750 ms** an attempt under `pnpm test`, 8 750 ms at background and 1 250 ms in an unwrapped single-file run.
> A case that holds a lock *past three budgets* computes the hold from `resetLockTimeoutMs()` at the scale it runs at, or it passes under
> one and fails under the other.

**Files:**
- Create: `packages/control-plane/src/db/truncate.ts`
- Test: `packages/control-plane/src/db/truncate.test.ts`
- Modify: `packages/control-plane/src/db/testing.ts:56-121` (`TABLES` → exported `RESET_TABLES`), `:137-149`, `:185-188`
- Modify: `packages/control-plane/vitest.global-setup.ts:1-6`, `:72-98`

**Interfaces:**
- Consumes: `resetLockTimeoutMs()` (Task 2).
- Produces: `truncateWithRetry(pool: Pool, tables: readonly string[], log?: (line: string) => void): Promise<void>`,
  `TRUNCATE_ATTEMPTS = 3`, `RETRYABLE_TRUNCATE_CODES` (`40P01`, `55P03`) from `db/truncate.ts`; `RESET_TABLES: readonly string[]` from
  `db/testing.ts`.

- [ ] **Step 1: Write the failing test.** `packages/control-plane/src/db/truncate.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { resetLockTimeoutMs, scaled } from '../test-timeouts.js'
import { RESET_TABLES, resetDatabase } from './testing.js'
import { TRUNCATE_ATTEMPTS, truncateWithRetry } from './truncate.js'

/**
 * resetDatabase survives a lock it did not cause (the gentler test tiers plan, Task 4). Every case holds a
 * lock from a second connection — the shape of a retire pass that outlived the test that started it
 * (TRAPS: `deadlock detected` INSIDE `resetDatabase`) — and truncates the real reset list, as the harness does.
 */
function adminUrl(): string {
  const url = process.env.MANIFEST_ADMIN_DATABASE_URL
  if (!url) throw new Error('MANIFEST_ADMIN_DATABASE_URL is not set — vitest.env.ts derives it from .env')
  return url
}

const pools: pg.Pool[] = []
function poolWith(lockTimeoutMs: number): pg.Pool {
  const pool = new pg.Pool({ connectionString: adminUrl(), lock_timeout: lockTimeoutMs })
  pools.push(pool)
  return pool
}
afterAll(async () => {
  await Promise.all(pools.map((pool) => pool.end()))
})
afterEach(() => {
  vi.restoreAllMocks()
})

/** Resolves once a TRUNCATE is queued behind someone's lock on `users` — the last table it locks. */
async function untilTruncateWaitsOnUsers(probe: pg.Pool): Promise<void> {
  for (let i = 0; i < 200; i += 1) {
    const { rows } = await probe.query<{ n: number }>(
      `SELECT count(*)::int AS n
         FROM pg_locks l JOIN pg_class c ON c.oid = l.relation
        WHERE l.database = (SELECT oid FROM pg_database WHERE datname = current_database())
          AND c.relname = 'users' AND l.mode = 'AccessExclusiveLock' AND NOT l.granted`,
    )
    if (rows[0]!.n > 0) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error('the TRUNCATE never queued behind the lock on users')
}

/** A settled promise's error, or undefined — so no rejection is ever left unhandled. */
const outcome = (promise: Promise<void>): Promise<unknown> =>
  promise.then(
    () => undefined,
    (error: unknown) => error,
  )

describe('truncateWithRetry', () => {
  it('retries a TRUNCATE Postgres chose as a deadlock’s victim, logging 40P01, and completes', async () => {
    const pool = poolWith(5_000)
    const holder = await pool.connect()
    const lines: string[] = []
    try {
      await holder.query('BEGIN')
      await holder.query('LOCK TABLE users IN ROW EXCLUSIVE MODE')
      const reset = outcome(truncateWithRetry(pool, RESET_TABLES, (line) => lines.push(line)))
      await untilTruncateWaitsOnUsers(pool)
      // The cycle: the TRUNCATE holds audit.incidents and waits on users; this waits on audit.incidents.
      // The TRUNCATE has waited longer, reaches deadlock_timeout (1 s) first, and is the one ended.
      await holder.query('LOCK TABLE audit.incidents IN ROW EXCLUSIVE MODE')
      await holder.query('COMMIT')
      expect(await reset).toBeUndefined()
    } finally {
      holder.release(true)
    }
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('40P01')
    expect(lines[0]).toContain(`attempt 1 of ${TRUNCATE_ATTEMPTS}`)
  })

  it('gives up after three lock budgets with 55P03, logging every attempt', async () => {
    const pool = poolWith(300)
    const holder = await poolWith(60_000).connect()
    const lines: string[] = []
    try {
      await holder.query('BEGIN')
      await holder.query('LOCK TABLE users IN ROW EXCLUSIVE MODE')
      const error = await outcome(truncateWithRetry(pool, RESET_TABLES, (line) => lines.push(line)))
      expect(error).toMatchObject({ code: '55P03' })
    } finally {
      holder.release(true)
    }
    expect(lines).toHaveLength(TRUNCATE_ATTEMPTS)
    expect(lines.every((line) => line.includes('55P03'))).toBe(true)
    expect(lines[TRUNCATE_ATTEMPTS - 1]).toContain('giving up')
  })

  it('waits for a lock let go inside its budget, and logs nothing', async () => {
    const pool = poolWith(5_000)
    const holder = await pool.connect()
    const lines: string[] = []
    try {
      await holder.query('BEGIN')
      await holder.query('LOCK TABLE users IN ROW EXCLUSIVE MODE')
      const reset = outcome(truncateWithRetry(pool, RESET_TABLES, (line) => lines.push(line)))
      await untilTruncateWaitsOnUsers(pool)
      await holder.query('COMMIT')
      expect(await reset).toBeUndefined()
    } finally {
      holder.release(true)
    }
    expect(lines).toEqual([])
  })

  it('throws any other failure at once, and logs nothing', async () => {
    const lines: string[] = []
    const error = await outcome(
      truncateWithRetry(poolWith(1_000), ['no_such_table_for_this_test'], (line) => lines.push(line)),
    )
    expect(error).toMatchObject({ code: '42P01' })
    expect(lines).toEqual([])
  })

  it('never ends another connection — 7100 shares this database', () => {
    for (const file of [
      new URL('./truncate.ts', import.meta.url),
      new URL('./testing.ts', import.meta.url),
      new URL('../../vitest.global-setup.ts', import.meta.url),
    ]) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/pg_terminate_backend|pg_cancel_backend/)
    }
  })
})

describe('resetDatabase', () => {
  it(
    'has a lock budget of its own: a lock held past three of them fails the reset with 55P03, named on stderr, before the lock is let go',
    async () => {
      const budget = resetLockTimeoutMs()
      const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const holder = await poolWith(60_000).connect()
      let letGo: Promise<unknown> = Promise.resolve()
      try {
        await holder.query('BEGIN')
        await holder.query('LOCK TABLE users IN ROW EXCLUSIVE MODE')
        // Let go well after three budgets: a reset with no budget of its own waits for this and succeeds.
        letGo = new Promise((resolve) => setTimeout(resolve, 3 * budget + 1_500)).then(() =>
          outcome(holder.query('COMMIT').then(() => undefined)),
        )
        expect(await outcome(resetDatabase())).toMatchObject({ code: '55P03' })
      } finally {
        await letGo
        holder.release(true)
      }
      const logged = errors.mock.calls.map((call) => String(call[0]))
      expect(logged.filter((line) => line.includes('55P03'))).toHaveLength(TRUNCATE_ATTEMPTS)
    },
    scaled(20_000),
  )
})
```

- [ ] **Step 2: Run it to see it fail.**

Run: `pnpm exec vitest run --project unit src/db/truncate.test.ts`
Expected: FAIL — `./truncate.js` cannot be resolved, and `RESET_TABLES` is not exported. *Read the reason.*

- [ ] **Step 3: Write `packages/control-plane/src/db/truncate.ts`.**

```ts
import type { Pool } from 'pg'

/**
 * The harness's TRUNCATE, retried when the lock it needs is someone else's (the gentler test tiers
 * plan, Rich's yes of 2026-10-14).
 *
 * A test that times out does not stop: Vitest fails it and moves on, and the work it started — a
 * retire pass, a build — runs on into the next test's reset. If that work holds a lock the TRUNCATE
 * needs and then asks for one the TRUNCATE holds, Postgres ends one of them with `40P01 deadlock
 * detected`; when it chooses the TRUNCATE, the NEXT test went red for the first one's sake (TRAPS:
 * `deadlock detected` INSIDE `resetDatabase`). And a TRUNCATE that only waits holds every lock it has
 * taken while it does — the pool's `lock_timeout` ends it with `55P03` instead (db/testing.ts).
 *
 * So both are retried, three attempts in all, each logged. The test that timed out stays red — Vitest
 * failed it already — and anything else is thrown at once. It never ends another connection: the
 * running control plane on 7100 uses this database, and a worker whose client is killed
 * mid-transaction crashes.
 *
 * Imports no database client, so the once-per-run global setup can use it too.
 */
export const RETRYABLE_TRUNCATE_CODES: ReadonlySet<string> = new Set(['40P01', '55P03'])
export const TRUNCATE_ATTEMPTS = 3

const MEANING: Record<string, string> = {
  '40P01': 'deadlock detected',
  '55P03': 'lock not available within the lock budget',
}

export async function truncateWithRetry(
  pool: Pool,
  tables: readonly string[],
  log: (line: string) => void = (line) => console.error(line),
): Promise<void> {
  const statement = `TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY CASCADE`
  for (let attempt = 1; ; attempt += 1) {
    try {
      await pool.query(statement)
      return
    } catch (error) {
      const code = (error as { code?: string }).code
      if (code === undefined || !RETRYABLE_TRUNCATE_CODES.has(code)) throw error
      if (attempt === TRUNCATE_ATTEMPTS) {
        log(
          `[test harness] resetDatabase: the TRUNCATE failed with ${code} (${MEANING[code]}) on attempt ` +
            `${attempt} of ${TRUNCATE_ATTEMPTS} — giving up; the hook fails with it.`,
        )
        throw error
      }
      const pause = 100 * attempt
      log(
        `[test harness] resetDatabase: the TRUNCATE failed with ${code} (${MEANING[code]}), attempt ` +
          `${attempt} of ${TRUNCATE_ATTEMPTS} — retrying in ${pause} ms. Work an earlier test started ` +
          'still holds a lock; if that test timed out, its own red stands.',
      )
      await new Promise((resolve) => setTimeout(resolve, pause))
    }
  }
}
```

- [ ] **Step 4: Route `resetDatabase` and the global setup through it.** In `db/testing.ts`:
  - `const TABLES = [` → `export const RESET_TABLES: readonly string[] = [` (its comments unchanged).
  - The imports gain `import { resetLockTimeoutMs } from '../test-timeouts.js'` and `import { truncateWithRetry } from './truncate.js'`.
  - In `admin()`: `adminPool ??= new pg.Pool({ connectionString, lock_timeout: resetLockTimeoutMs() })`, and the doc comment above it
    gains: *"With a `lock_timeout` (the gentler test tiers plan): a reset that cannot get its locks within a quarter of a test's limit
    gives up and retries (`db/truncate.ts`), rather than waiting on the server after its hook has timed out, holding every lock it has
    taken."*
  - `resetDatabase`:

```ts
export async function resetDatabase(): Promise<void> {
  await drainBackgroundWork()
  await truncateWithRetry(admin(), RESET_TABLES)
}
```

  - Fix the stale sentence in the `TABLES` comment (`:66-67`): *"`vitest.config.ts` disables file parallelism so this cannot run while
    another file holds a transaction open"* gains *"— but work a timed-out test left running can; `db/truncate.ts` retries for that."*

  In `vitest.global-setup.ts`: the imports gain `import { truncateWithRetry } from './src/db/truncate.js'` and `import {
  resetLockTimeoutMs } from './src/test-timeouts.js'`; `:74` becomes `const pool = new pg.Pool({ connectionString, lock_timeout:
  resetLockTimeoutMs() })` and `:76` `await truncateWithRetry(pool, TABLES)` — the `42P01` translation below it unchanged (that code is
  not retried, so it still arrives first).

- [ ] **Step 5: Run the test to see it pass.**

Run: `pnpm exec vitest run --project unit src/db/truncate.test.ts`
Expected: 6 PASS; the deadlock case ~1.1 s, the reset's own case ~3 × budget.

- [ ] **Step 6: The controls, each restored after.**
  - In `truncate.ts`, `TRUNCATE_ATTEMPTS = 1` → the deadlock case RED with `40P01` (and *gives up after three* RED on the line count).
  - Remove `lock_timeout: resetLockTimeoutMs()` from `admin()` → *resetDatabase has a lock budget of its own* RED: the reset waits for
    the holder and resolves (`expected undefined to match { code: '55P03' }`).
  - Change `'40P01'` to `'40P02'` in `RETRYABLE_TRUNCATE_CODES` → the deadlock case RED, `40P01` thrown on the first attempt.
  - `git diff` of the three files empty after each restore.

- [ ] **Step 7: The four gates, and commit.** `pnpm test` twice through the wrapper (+6 tests, one file); then:

```bash
git status --short
git commit -m "fix(tests): resetDatabase survives a deadlock — a TRUNCATE retried on 40P01 and 55P03 under a lock budget, logged, the timed-out test still red" \
  -- packages/control-plane/src/db/truncate.ts packages/control-plane/src/db/truncate.test.ts \
  packages/control-plane/src/db/testing.ts packages/control-plane/vitest.global-setup.ts
```

---

## Task 5: The load on ci-acceptance's line, and the documents

> **SITTING 1 MOVED THE LINES:** its `EXPECT_` comment added five, so at Task 3's commit the temp files are **`:362-363`** and the test
> step **`:424-436`** (`bold "=== pnpm test ==="` to the `MOVED` record). And `pnpm test` already runs through the wrapper (Task 3), so
> §2's row was given one sentence by sitting 1's close-out; Step 3 replaces it with the full one.

**Files:**
- Modify: `scripts/ci-acceptance.sh:357-358`, `:419-431` (Task 1's Step 1 re-read the lines)
- Modify: `docs/superpowers/RUNBOOK.md`, `docs/superpowers/ORIENTATION.md` (§2's `pnpm test` row, §4's trap 4, §6), `docs/superpowers/TRAPS.md`

**Interfaces:**
- Consumes: `MANIFEST_TEST_LOAD_REPORT` and the wrapper's two line shapes (Task 3).

- [ ] **Step 1: ci-acceptance.** The temp files:

```bash
LOG="$(mktemp -t manifest-ci)"
LOAD_REPORT="$(mktemp -t manifest-load)"
trap 'rm -f "$LOG" "$LOAD_REPORT"' EXIT
```

and the test step:

```bash
bold "=== pnpm test ==="
# `pnpm test` is scripts/test-gently.sh: utility priority, the timeout scale, the load gate. Its one
# line — the load over the run, or why it refused to start — goes on this step's line in the summary,
# PASS or FAIL, so a red says what the machine was doing (the gentler test tiers plan, Task 5).
: > "$LOAD_REPORT"
MANIFEST_TEST_LOAD_REPORT="$LOAD_REPORT" pnpm test 2>&1 | tee "$LOG"
TEST_RC="${PIPESTATUS[0]}"
LOAD_NOTE="$(cat "$LOAD_REPORT")"
LOAD_NOTE="${LOAD_NOTE:-no load line — did pnpm test run through scripts/test-gently.sh?}"
GOT_TESTS="$(grep -E '^ +Tests +[0-9]+ passed' "$LOG" | awk '{print $2}' | tail -1)"
GOT_FILES="$(grep -E '^ +Test Files +[0-9]+ passed' "$LOG" | awk '{print $3}' | tail -1)"
if [ "$TEST_RC" -ne 0 ]; then
  record "pnpm test" FAIL "exit $TEST_RC — $LOAD_NOTE"
elif [ "$GOT_TESTS" = "$EXPECT_TESTS" ] && [ "$GOT_FILES" = "$EXPECT_FILES" ]; then
  record "pnpm test" PASS "$GOT_TESTS tests in $GOT_FILES files — $LOAD_NOTE"
else
  record "pnpm test" MOVED \
    "counts moved: expected $EXPECT_TESTS in $EXPECT_FILES files, got ${GOT_TESTS:-none} in ${GOT_FILES:-none} — update ORIENTATION §2 and this script together — $LOAD_NOTE"
fi
```

`EXPECT_TESTS` / `EXPECT_FILES` are not this task's: each sitting's close sets them from its own run (*How this plan is to be
executed*). `bash -n scripts/ci-acceptance.sh` clean.

- [ ] **Step 2: RUNBOOK — a section *Running the test tiers gently*, beside the tests' own.** Its content:
  - `pnpm test` and `pnpm test:docker` run through `scripts/test-gently.sh`: utility priority, the scale (the values and Task 1's README),
    the gate (12, `hw.ncpu`), the line at the end. **Exit 75 is the gate**: wait (`Monitor` on `sysctl -n vm.loadavg`, never a `sleep`
    loop), or `MANIFEST_TEST_FORCE=1`, and say so in the record.
  - **Rich on a call**: `MANIFEST_TEST_QOS=background pnpm test` — slower, and gentler.
  - **One file, gently**: `bash scripts/test-gently.sh pnpm exec vitest run --project unit src/<path>`; unwrapped it keeps the 5 s.
  - **A new explicit timeout**: `}, scaled(30_000))`, never a bare number — `test-timeouts.test.ts` refuses one.
  - **Never `kill -STOP` a run**; stop it and start it again in the background.
  - The variables, the exit codes, and that `MANIFEST_TEST_GENTLY` in a shell's environment makes the wrapper pass straight through.

- [ ] **Step 3: ORIENTATION.**
  - §2's `pnpm test` row: one sentence — *"Through `scripts/test-gently.sh` since the gentler test tiers plan: utility priority, the
    timeout scale, a load gate, and a line at the end giving the load (RUNBOOK, *Running the test tiers gently*)"* — and the run's wall
    time as Task 3 measured it.
  - §4's trap 4: replace *"read `uptime` before believing a red … times out at 5 s"* with: *"**every run ends with its load line — read it
    before believing a red**; a run the gate refused exits 75; the in-test drain bounds in `driver-contract.ts` are still load gauges no
    scale reaches (TRAPS: `uptime`, `exit 75`)."*
  - §6's close-out checklist, the gates row: *"**Read the slow list** of the final-tree run — every test over 5 s, printed with its
    duration (`grep -E '^ +✓ .* [0-9]+ms$' <log>`) — beside its load line. On a quiet run (median under 6) it should be the last
    sitting's; a test new to it has grown slower or is a hang the scale hides: fix it, or give it an explicit `scaled()` limit with a
    reason. Record the list."*

- [ ] **Step 4: TRAPS — three entries**, in the house form (heading sentence in capitals, the plan and task, what was measured):
  - **A RUN THAT EXITS 75 WITHOUT RUNNING A TEST WAS REFUSED BY THE LOAD GATE** — the line names the load and the gate.
  - **NEVER `kill -STOP` A TEST RUN** — on `kill -CONT` every Vitest timer that came due fires at once.
  - **`MANIFEST_TEST_GENTLY` IN YOUR SHELL MAKES THE WRAPPER PASS STRAIGHT THROUGH** — no gate, no priority of its own, no line; and a
    test of the wrapper must scrub it.

- [ ] **Step 5: The gates, and commit.** `bash -n scripts/ci-acceptance.sh`; `pnpm format:check`; then:

```bash
git status --short
git commit -m "docs(tests): the load on ci-acceptance's test line; RUNBOOK, ORIENTATION §2/§4/§6 and TRAPS for the gentle tiers" \
  -- scripts/ci-acceptance.sh docs/superpowers/RUNBOOK.md docs/superpowers/ORIENTATION.md docs/superpowers/TRAPS.md
```

---

## Task 6: The after-measurements, the controls, the review and the Docker tier at 12 CPUs

> **SITTING 1 MEASURED:** twelve `yes` burners read a 1-minute load of **60.02 at the start, 53–333 over the run** — not ~12 (F5) — so
> Step 1's refusal names a load near 60, not `1x.xx`, and the forced run there is the evidence for keeping or moving the gate's default.
> For Step 2: `lifecycle.test.ts`'s in-test budgets are scaled now (F3); `source/github/driver.test.ts`'s lag cases and the unscaled
> in-test limits F9 names are what may still read red at background. Task 1's `load-today`: **78 red, 76 timed out.**

**Files:**
- Modify: `docs/superpowers/spikes/gentler-tiers-baseline/README.md` (the after section)
- Scratch, never committed: `packages/control-plane/src/db/knock-on.scratch.test.ts`

**Interfaces:**
- Consumes: Task 1's `load-today` numbers and `normal.json`; everything Tasks 2–5 built.

*The JSON runs below call the wrapper directly — `bash scripts/test-gently.sh pnpm exec vitest run …`, which is `pnpm test` plus a
reporter — because `pnpm test --reporter=…` collides with pnpm's own `--reporter` option.*

- [ ] **Step 1: The same load, wrapped.** After Rich's yes on the time; with "7100 is yours" and the HOLD. **Dispatch the plan's one
whole-branch review now** (Step 4 reads its findings) — a fresh reviewer on the most capable model over the paths this plan touched since
`abdd01e`; it reads and runs no tests, so it may work beside these runs.

```bash
cd /Users/rich/Developer/manifest
B=docs/superpowers/spikes/gentler-tiers-baseline
# First WITHOUT force: the gate must refuse it (the gate's live control).
bash $B/burn.sh 12 -- pnpm test; echo "exit $?"
```

Expected: **exit 75**, `REFUSED to start: the 1-minute load is 1x.xx, above the gate of 12`. (If the load read at the start is still
below 12 after burn.sh's two minutes, the run starts: stop it, record the reading — the burners alone did not pass the gate on that
machine's base load — and the forced run below is then simply not forced.) Then:

```bash
MANIFEST_TEST_FORCE=1 bash $B/burn.sh 12 -- bash scripts/test-gently.sh pnpm exec vitest run --project unit --project packages \
  --reporter=default --reporter=json --outputFile.json="$OUT/load-after.json" > "$OUT/load-after.log" 2>&1
tail -2 "$OUT/load-after.log"; node $B/durations.mjs "$OUT/load-after.json" "$OUT/normal.json"
pgrep -x yes || echo 'no burners left'
```

Expected: **0 red**, against Task 1's `load-today` count; the wrapper's line says `forced yes`. **If it is red**: raise the utility
scale by 1 (the wrapper and its test), run once more; **if still red**, stop and send the coordinator the reds, the load line and both
scales — the question for Rich is a higher scale or a named slow test, not another run.

- [ ] **Step 2: Background under six burners.**

```bash
MANIFEST_TEST_QOS=background bash $B/burn.sh 6 -- bash scripts/test-gently.sh pnpm exec vitest run --project unit --project packages \
  --reporter=default --reporter=json --outputFile.json="$OUT/load-background.json" > "$OUT/load-background.log" 2>&1
node $B/durations.mjs "$OUT/load-background.json" "$OUT/normal.json"
pgrep -x yes || echo 'no burners left'
```

Expected: 0 red, its wall time recorded (the price of a call). The same rule if red.

- [ ] **Step 3: The knock-on, with and without the retry.** `packages/control-plane/src/db/knock-on.scratch.test.ts`:

```ts
import pg from 'pg'
import { beforeEach, expect, it } from 'vitest'
import { resetDatabase } from './testing.js'

// NOT COMMITTED (the gentler test tiers plan, Task 6). Test 1 times out at 500 ms and leaves work
// running that takes `users`, then — a second later — `audit.incidents`: a retire pass that outlived
// its test. Test 2's reset meets it: the TRUNCATE holds audit.incidents and waits on users.
beforeEach(async () => {
  await resetDatabase()
})

it('1: times out with its work still running', async () => {
  const client = new pg.Client({ connectionString: process.env.MANIFEST_ADMIN_DATABASE_URL })
  await client.connect()
  void (async () => {
    await client.query('BEGIN')
    await client.query('LOCK TABLE users IN ROW EXCLUSIVE MODE')
    await client.query('SELECT pg_sleep(1.0)')
    await client.query('LOCK TABLE audit.incidents IN ROW EXCLUSIVE MODE')
    await client.query('COMMIT')
    await client.end()
  })()
  await new Promise((resolve) => setTimeout(resolve, 3_000))
}, 500)

it('2: the next test', () => {
  expect(true).toBe(true)
})
```

Run unwrapped, alone: `pnpm exec vitest run --project unit src/db/knock-on.scratch.test.ts 2>&1 | cat`

Expected **with the retry**: test 1 RED (`Test timed out in 500ms`), test 2 GREEN, one `[test harness] resetDatabase: … 40P01 …` line.
**Control** — `TRUNCATE_ATTEMPTS = 1`: test 1 RED, **test 2 RED** (`deadlock detected`, in its `beforeEach`) — the knock-on, back. Restore;
delete the scratch file; `git status` clean of it.

- [ ] **Step 4: The review's one fix wave.** Each finding accepted is fixed with its own red-then-green test or control, single files
while fixing; each rejected one is recorded with the reason. Committed by name, as the tasks are.

- [ ] **Step 5: The final tree's gates.** `pnpm lint`, `pnpm typecheck`, `pnpm format:check`; then **`make ci-acceptance`** (it counts as
the first `pnpm test` of the two) — its `pnpm test` line reads `PASS <n> tests in <m> files — load (1-min) min … ; exit 0`, and the
`EXPECT_` counts hold — and **`pnpm test`** once more. Read both slow lists.

- [ ] **Step 6: The Docker tier at 12 CPUs, on the final tree** — owed (Task 4 changed the global setup's `TRUNCATE`; Task 3
`test:docker`'s command), and the "before" of Task 7. **Stop 7100 first** (ORIENTATION §4's trap 7), count `docker network ls -q | wc -l`,
warm the chat model (§2's box), then in the background:

```bash
docker info --format 'NCPU {{.NCPU}}'
pnpm test:docker > "$OUT/docker-12.log" 2>&1; echo "exit $?"
tail -6 "$OUT/docker-12.log"
```

Expected: `test-gently: QoS utility …` first, the tier's count as ORIENTATION §2's row states it, 0 failed, the wrapper's load line last,
and the wall time. Afterwards, as §2's row says: restart 7100 from `.env`, the three cleanup scripts (try `--apply`), `make verify`.

- [ ] **Step 7: Record and commit.** The README's *After* section: both loaded runs beside Task 1's, the gate's refusal, the knock-on
pair, the Docker tier at 12 CPUs with its load line. Then:

```bash
git commit -m "docs(tests): the gentler test tiers plan's Task 6 — 0 red under twelve burners wrapped (n before), background under six, the knock-on controls, the Docker tier at 12 CPUs" \
  -- docs/superpowers/spikes/gentler-tiers-baseline/README.md
```

---

## Task 7: Rich's Docker Desktop step, and the Docker tier at 6 CPUs

**Files:**
- Modify: `docs/superpowers/spikes/gentler-tiers-baseline/README.md`, ORIENTATION §2's `pnpm test:docker` row and §4's *Numbers*

- [ ] **Step 1: Confirm A1's clicked half is done** (A1's sittings table) — a Docker restart in the middle of it would end it. Then ask
Rich, through the coordinator, opening with **⚠ BLOCKED ON YOU**: *"Docker Desktop → Settings → Resources → Advanced → CPU limit: 6 →
Apply & restart. Tell me when it is back."* Stop 7100 before he does.

- [ ] **Step 2: Read it back.**

```bash
docker info --format 'NCPU {{.NCPU}} MemTotal {{.MemTotal}}'
grep -o '"Cpus"[^,]*' ~/Library/Group\ Containers/group.com.docker/settings-store.json
docker ps --format '{{.Names}} {{.Status}}' | grep -E '^manifest-|docker-simple-saml|qdrant-local-dev|mongodb|mongo-express'
```

Expected: `NCPU 6`, `"Cpus": 6`, every platform container `Up` (their restart policy) and the four that must survive, up. Then restart
7100 from `.env`, `make verify` — **if every host→edge check fails** (`Failed to connect … port 443`), `docker restart manifest-caddy`
(RUNBOOK's reboot row) and `make verify` again.

- [ ] **Step 3: The Docker tier at 6 CPUs**, as Task 6's Step 6 (7100 stopped, networks counted, the model warm, in the background):

```bash
pnpm test:docker > "$OUT/docker-6.log" 2>&1; echo "exit $?"
tail -6 "$OUT/docker-6.log"
```

Expected: the same count, 0 failed. Record the wall time beside the 12-CPU run's and the record's 1322–1538 s. **A file red here that was
green at 12** is re-run alone once (TRAPS' drain-bound entry); still red, it is a finding for Rich's decision in Step 4.

- [ ] **Step 4: Rich decides.** Through the coordinator, the two wall times, the load lines and any red: *keep 6; try 8; or back to 12* —
with the recommendation (keep 6 unless the tier is more than ~1.5× slower or a file reds at 6 that never did at 12). Record his words in
the decisions file, as the coordinated run records them.

- [ ] **Step 5: Close the plan.** The README; ORIENTATION §2's `pnpm test:docker` row (its wall time at the CPU count Rich chose — the one
statement of the tier's numbers) and §4's *Numbers* (Docker Desktop's CPUs); the cleanup scripts; then the plan's close-out (below).

```bash
git commit -m "docs(tests): the gentler test tiers plan's Task 7 — Docker Desktop at <n> CPUs (Rich), the Docker tier before and after" \
  -- docs/superpowers/spikes/gentler-tiers-baseline/README.md docs/superpowers/ORIENTATION.md
```

---

## What this plan does not build

- **Fewer runs, at agreed times.** The coordinator already asks Rich first while he is at the machine (his words, `abdd01e`).
- **The Docker tier's speed** — [`2026-09-23-docker-tier-speed-brief.md`](./2026-09-23-docker-tier-speed-brief.md) and the roadmap's
  *Tracked tooling items* row. This plan measures the tier; it does not shorten it.
- **CI off the laptop** — nothing is pushed, and the tier needs this Mac: Docker Desktop, the `127.0.0.2` alias, the keychain's CA,
  Ollama (`scripts/ci-acceptance.sh`'s header).
- **In-test wall-clock limits** — `runtime/driver-contract.ts:624-641` (*a retire waits for a request that is in flight*) and `:643-659`
  (*a retire never waits longer than its drain bound*) compare `Date.now()` with a drain bound; no Vitest timeout reaches them, and a lower
  priority can make them slower to pass. They stay load gauges: re-run alone (TRAPS).
- **Scaling the Docker project's limits** — 120 s, which tolerated a Zoom share's load where 5 s did not (TRAPS).
- **Retrying a red test** (Vitest's `retry`) — it would turn a real failure green; Rich's rule is that the test that timed out stays red.
- **The deadlock's other victim** — when Postgres ends the leftover work instead of the `TRUNCATE`, that work fails on its own line; the
  drain registry (`registerBackgroundWork`) is the remedy for a starter that does not register.
- **Detecting a call, or changing a running run's priority** — Decision 2.
- **Unifying the global setup's table list with `resetDatabase`'s** — they differ by two tables the `CASCADE` reaches; noticed, not this
  plan's.
- **Docker Desktop's memory** — not asked for; 7.75 GiB stays.

---

## Spec actions

None. The spec does not describe the test harness's timing (*Spec*, above).

---

## What the self-review caught

- **The survey's `driver-contract.ts:408` had drifted to `:624-641`** — A1 rewrote the driver contract for sets. Cited by the test's name
  as well, so the next drift is findable.
- **Fifty-eight explicit timeouts, not thirteen files' worth of exceptions**: scaling only the defaults would have left ten of them with
  less time than a test that asked for nothing (at a scale of 4) — the opposite of what each one's author meant. Task 2 scales all of them
  and holds the line with a scanner.
- **`slowTestThreshold` is ignored per project in Vitest 2.1.9** — read from the reporters' source, so it goes in the root config.
- **`resetDatabase` runs inside some test BODIES**, so its lock budget is a quarter of the test's limit, not the hook's.
- **The wrapper's own test inherits the wrapper**: without `cleanEnv()` every case would have passed straight through and asserted nothing;
  and a QoS assertion run under utility cannot see utility removed — so the QoS controls are run unwrapped.
- **A green control would have hidden the lock budget**: Task 4's first `55P03` test built its own pool, so removing the budget from
  `resetDatabase`'s pool would have left it green. The `resetDatabase` case tests the harness's own pool.
- **The gate would refuse Task 6's own measurement** at twelve burners — which makes it the gate's live control, then `MANIFEST_TEST_FORCE`.
- **B depends on Rich's step**: the load rehearsal measures on the Docker VM, so Task 7 lands before B's sitting 1.

---

## What executing this plan found

*Each sitting adds its dated section here: what it measured, with versions; every finding as **F*n***; the controls and how each went
red; what it left the next.*

### Sitting 1 — 2026-10-14, 13:28–19:15 PDT (`manifest-gt-s1`, the second coordinated run's job GT1): Tasks 1–3 — the measurements, the scale and the wrapper

**Opened** by `manifest-coord4`'s GO (~13:27), which relayed Rich's decisions recorded in
[`../2026-09-30-decisions.md`](../2026-09-30-decisions.md): ~08:12 (`abdd01e`, *"yes to 1–4"*), ~08:48 (`b492e31`, this plan approved
under his delegation), ~13:25 (`5fad350`, the queue after his demo: this sitting's reading and code at once, its first whole suite only
after W8's proof on 7100) and ~13:28 (`7627517`: the imitated-load run *"Whenever it's ready today"*, warned ~5 min before). HEAD
`7627517`; other sessions committed documents during the sitting (`6fa660a`, `ccb500f`, …), nothing of theirs staged here. **Inline**
(`superpowers:executing-plans`), the workspace's ledger `.superpowers/sdd/2026-10-14-gentler-test-tiers/progress.md`.

**How the time went.** The reading, Task 1's re-reads, and Tasks 2–3 DRAFTED test-first in the scratchpad (a Vitest config with no global
setup — nothing truncated) while W8 proved its fix on 7100; kept OUT of the repository because the plan's rule is *Task 1 first, on the
unchanged tree* (all four of Task 1's runs had to see `7627517`'s code). `manifest-coord4`'s *"7100 is yours"* and HOLD at 14:20; the three
quiet runs 14:19–15:58; a FREE window for F7; Rich closed the laptop (~16:05, everything held, state written to the ledger); it woke at
17:23:51; HOLD and *go* at 17:29 (Rich warned at 17:26, on AC, no call); the burner run 17:32–18:15; F7's window; HOLD at 18:18; Tasks 2–3
landed; `pnpm test` twice through the wrapper 18:32–19:09; G4 at 19:10.

**Task 1** (`7e264f0` the plan's two moved numbers; `adf9127` the record): [`../spikes/gentler-tiers-baseline/README.md`](../spikes/gentler-tiers-baseline/README.md)
— versions, priorities (31 / 20 / 4), the four runs, the scales and their arithmetic, the quiet slow list, the 78 burner reds by name.

| Run (`7627517`'s code) | 1-min load at start · median / max | Wall | ÷ normal | Result |
|---|---|---|---|---|
| normal, quiet | 2.86 · 4.86 / 10.42 | 1119.6 s | 1.00 | green 3654/3654 |
| utility, quiet | 5.11 · 4.81 / 6.25 | 1166.8 s | 1.04 | green 3654/3654 |
| background, quiet | 4.17 · 5.16 / 7.38 | 3541.7 s | 3.16 (a lower bound) | **red 192** — 186 `Test timed out in 5000ms` |
| normal, twelve burners | 60.02 · 128.17 / 332.82 | 2588.1 s | 2.31 | **red 78** — 76 `Test timed out in 5000ms` |

No run read `deadlock detected`. **The scales: utility 3 (⌈2 × 1.04⌉), background 7 (⌈2 × 3.16⌉)** — the plan's provisional 2 and 4 replaced.

**Task 2** (`44b4e49`): `test-timeouts.ts`, the two projects' limits, `slowTestThreshold: 5000`, **61** explicit limits through `scaled()`
(F2), `lifecycle.test.ts`'s budgets (F3); the scanner with its planted positive control. **Task 3** (`a2060ce`): `scripts/test-gently.sh`
(utility 3, background 7, gate 12), its twelve-case test (F1), `package.json`, `EXPECT_` moved.

**The controls, each seen red then restored:** the scale — an unset scale times a six-second test out at 5 s, `MANIFEST_TEST_TIMEOUT_SCALE=2`
passes it in the unit AND the packages project, `abc` stops the run before any test naming the variable and the value; the threshold — without
it the one-second test is listed too (`1005ms`); the scanner — `lifecycle.test.ts:338` and `authz-contract.ts:3020` each reverted to a bare
number, each red naming its `file:line`; `lifecycle.test.ts`'s budgets — red ×3 under `taskpolicy -b` at scale 7 with 400 ms (571.0, 474.7,
586.2 ms), green ×3 scaled; the wrapper, run UNWRAPPED (this shell at `pri` 31) — no `taskpolicy` → `expected 31 to be 20` and `31 to be 4`;
`exit 0` → `expected +0 to be 3`; no pass-through → `expected 75 to be 5`; no sampler kill (F1's corrected form) → `expected '17227' to be ''`
and seven `spawnSync bash ETIMEDOUT` at 10 s, never a hang.

**Findings:**

1. **F1 — THE PLAN'S OWN CONTROL 3 HUNG INSTEAD OF GOING RED** (Task 3, Step 5). Removing the `pkill -P` and `kill` lines left `wait
   "$SAMPLER"` waiting on a loop nobody ends — and with `wait` removed too, `spawnSync` still waits for EOF on the pipe the surviving sampler
   holds (measured: a backgrounded grandchild held `spawnSync` 3 s; with `timeout` it returns status **0** and error `ETIMEDOUT`). No Vitest
   limit can end a synchronous `spawnSync`, so a sampler leak would have HUNG the suite rather than reddened it. **Fixed in the test:**
   `gently()` passes `timeout: scaled(10_000)` and throws `run.error`; the leak case runs with output ignored (so its own `pgrep` assertion
   is what reads red) and `pkill`s its marker in `finally`; the control removes `pkill`, `kill` AND `wait` — red as above, never a hang.
2. **F2 — THE PLAN'S COUNT OF EXPLICIT LIMITS MISSED A SUITE MODULE**: `api/authz-contract.ts` (not a `*.test.ts`, run only by
   `authz-contract.test.ts` in the unit tier) passes `}, 60_000)` three times (`:3019`, `:3070`, `:3170` at `7627517`). Converted (61 sites
   in 14 files), and the scanner reads it by name. `runtime/driver-contract.ts`'s 23 (120–900 s) are deliberately left: the Docker tier runs
   that suite too, and its limits are never below a scaled default.
3. **F3 — AN IN-TEST BUDGET THE SCALE DID NOT REACH WAS RED AT BACKGROUND PRIORITY ON A QUIET MACHINE**: `lifecycle.test.ts:198`'s
   `controlPlaneWork < 400` (`performance.now()`) read 531.9 ms in the background quiet run, and 571.0 / 474.7 / 586.2 ms in three single-file
   runs under `taskpolicy -b` at scale 7 — so every run Rich asks for on a call would have been red there. Both budgets (400 ms, 5 s) now
   go through `scaled()`: green ×3 at background, scale 7; unchanged at scale 1. *Outside the plan's letter (its* does not build *names
   in-test limits); inside Rich's item 2 — ruled, for the review.*
4. **F4 — PRETTIER RE-LAYS-OUT EVERY CONVERTED TEST** (+2067/−1789 in 14 files): its test-call layout (`it(name, fn, 30_000)`, hugged)
   holds only when the third argument is a numeric LITERAL, so `scaled(30_000)` puts each test's arguments on their own lines. Accepted
   (`format:check` is a gate; 61 `// prettier-ignore`s or a patched `it` are worse). **Proved layout-only**: every file's `HEAD` text and
   its new text, with `scaled(N)` → `N`, the import dropped, whitespace and trailing commas stripped, are identical — 13 of 14 exactly;
   `api/lifecycle.test.ts` by one type literal's `;` (`semi: false`); `src/lifecycle.test.ts` by F3's intended edit.
5. **F5 — TWELVE BURNERS DO NOT MAKE A LOAD OF 12**: twelve `yes` at ~90 % of a core each read a 1-minute load of **60.02 at the start,
   53–333 over the run (median 128)**; the scheduler also decayed ten of them to `pri` 17 while the suite's worker stayed 31. The plan's
   Decision 5 chose the gate's default (12, `hw.ncpu`) as *"the load … twelve burners"* make — that premise does not hold. **The default
   stays 12** (it still refuses a Zoom share's 50–90, TRAPS, and passes this machine's ordinary 4–10); **Task 6's forced run under twelve
   burners is the evidence for any other number**, and its Step 1's expected refusal will read ~60, not `1x.xx`.
6. **F6 — THE SUITE'S SLOWEST TEST CANNOT TIME OUT**: `api/contract/document.test.ts`'s *is exactly what the route definitions generate*
   — 28 s quiet, 98 s at background, 48 s under burners — is synchronous: `generated.split('\n')` is re-run inside `findIndex` for every
   line (O(n²)), even when the documents match, so no Vitest timer fires before it returns. ~2.5 % of every run. **Not this plan's**; a
   two-line fix (split once; compare only when unequal) for whoever owns the contract tests.
7. **F7 — *Read this first* had moved** at `7627517`: ci-acceptance's test step `:419-431` (not `:419-430`), `resetDatabase` named in 49
   test files, 143 lines (not 50, 147) — corrected in `7e264f0`; and Task 1 Step 6's expected wall *"737–900 s"* is older than A1: the quiet
   normal run took **1119.6 s**.
8. **F8 — THE ROADMAP'S DEFECT-RATE TABLE HAD NO ROWS FOR A1'S SITTINGS 7 AND 8, NOR A1'S EXECUTED TOTAL** — found sweeping this sitting;
   added, derived with ORIENTATION §6's command over A1's record (sitting 7: 11, sitting 8: 13; 104 in all over its twelve rows of tasks).
9. **F9 — TWO NON-TIMEOUT REDS RECUR UNDER LOAD, AND OTHER IN-TEST LIMITS NO SCALE REACHES** (named for Task 6, not changed):
   `source/github/driver.test.ts`'s lag cases (*absorbs GitHub's lag …*) read `expected [] to have a length of N` in BOTH the background
   and the burner run (their file also timed out 43 and 10 tests, so possibly a follow-on); still unscaled in-test limits:
   `api/events.test.ts`'s `closeOf(socket, 4_000)` (its two FE-33 cases take ~3.1 s quiet at normal), `api/agents.test.ts`'s
   `lite.slow(…, 6_000)`, the four blueprints' child-process `timeout: 30_000` (`execFile`, not Vitest), and `driver-contract.ts`'s drain
   bounds (the plan's *does not build*).

**What it left sitting 2** (Tasks 4–6): the scales are **3 and 7** — so `resetLockTimeoutMs()` is **3 750 ms** under `pnpm test`
(utility) and 8 750 ms at background, 1 250 ms in a single-file run; Task 4's tests must hold their lock past three budgets of whatever
scale they run at. `scripts/ci-acceptance.sh`'s lines moved by this sitting's `EXPECT_` comment: the temp files are **`:362-363`**, the test
step **`:424-436`**. F5 for Task 6's gate control and its expected line; F3 and F9 for its background run under six burners; the quiet slow
list (the README's) is the one the close-out review compares against — run 1's and run 2's matched it.

**The four gates on the final tree:** `pnpm lint`, `pnpm typecheck`, `pnpm format:check` clean; **`pnpm test` twice through the wrapper**,
each beginning `test-gently: QoS utility, timeout scale 3, 1-minute load …` and ending with its load line, **3673/3673 in 222 files, 0
failed**: 18:32:55–18:50:50 (1072.6 s, load 6.46 at the start, median 4.08 / max 7.53) and 18:51:24–19:09:22 (1074.7 s, load 3.82 at the start, median 3.79 / max 7.58) — against Task 1's quiet utility run,
1166.8 s. The slow list, both runs: the quiet baseline's four. `EXPECT_TESTS` 3654 → **3673**, `EXPECT_FILES` 220 → **222**. No Docker
tier owed (no Docker-tier path changed; Task 6 runs it). **The machine:** no `yes` left after the burner run; the three cleanup scripts
bare — no dead network, volume or image of a dead app; 16 orphan mirrors, named, not removed (the demo's apps' among them: every whole run
truncated their rows, as `manifest-coord4` knew); LiteLLM's two unheld budgets (a person's agent budget, the platform's intake) and three
dead app images removed by `--apply`, every held user and used image left. 7100 restored from `.env` (G4) at 19:10 — `gateway-controls.sh
start real`: `capableModel` `unchanged` on `.env`'s `ubc-ai-gateway/gpt-6.1-sol`, PID 22185 — and handed back to `manifest-coord4`.
