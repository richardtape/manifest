# Orientation — read this first

**What this is.** The single entry point to Manifest for someone with no prior context — a new agent with a fresh
window, or a developer joining. **The next job is always §7e.** This box says only where the project is and what
the gates read; it deliberately states no job and no sitting's story (Rich, 2026-09-24).

**Where things stand.** The design is approved and complete, five spikes are done, and **fourteen plans are
executed** (§2's table): an application goes from a bare repository to a production launch, authenticated with CWL,
on one laptop, offline — its code can live in a GitHub organisation instead (D5's driver 2) — an agent can CREATE it through
the API alone, from the API's own served documentation (the authoring API), and **a separate faculty front-end can now drive all
of it from its own origin** (the front-end enablement plan, the newest, EXECUTED 2026-09-29): a person signs in on
`app.manifest.internal`, names a project and adds a colleague by CWL login, gives an agent a model key charged to them (or is
given one the platform pays for while describing an app), reads a sandbox app's recent output redacted, commits images, PDFs and
fonts, switches an app off and back on or deletes one that never launched, and builds with the capable model and its on-premise
fallback — even a `confidential` app, while the platform setting allows it. **No plan is being executed; §7e says what is next.**
The roadmap's ledger outranks every document on status.

*Last verified 2026-09-29, at the close of the front-end enablement plan's sitting 12 (Task 15 — the acceptance — and the plan's one
whole-branch review's fix pass): THE PLAN IS EXECUTED. ONE NUMBER MOVED: `pnpm test` **2826 passed, 0 skipped, in 180 files** on the
final tree (`11f2526`) — run 2 alone, 782 s; run 1, inside `make ci-acceptance`, read 2825 and ONE red, `api/delivery.test.ts`'s
`deadlock detected` in the harness's `TRUNCATE` (the plan's F26 — P6b's trap, a deploy's retire pass outliving its test; the file 6 of
7 green alone); `pnpm test:docker` **248 in 41** (owed by the fix pass's `ai/`, `projects/`, `releases/`; green on its first run, alone,
1309 s); **`make doctor` 20 checks, 0 failed, 0 warnings** (the vulnerability database refreshed by Rich 2026-09-29, fresh until
2026-10-06); **`make verify` 61**. `pnpm typecheck`, `pnpm lint` and `pnpm format:check` clean. `scripts/ci-acceptance.sh` reads
`2826 / 180 / 20 / 61`.
**This line states only the latest sitting** — each sitting's numbers are in its plan's *What executing this plan found*, dated,
where they cannot drift.*

**Short of context? Read §7e, §2's numbers box, §6 and §4's curated traps, in that order.** The full trap catalogue
is [`TRAPS.md`](TRAPS.md), meant to be searched, not read through.

---

## 1. What Manifest is, in four sentences

Manifest is a self-hosted internal developer platform for UBC. A faculty member
describes an application in plain language, an AI agent builds it, and Manifest
deploys it — authenticated with UBC's CWL single sign-on, running on UBC
infrastructure — without the faculty member ever seeing a container or a YAML file.

The design is **approved and complete**. The whole platform must run on one laptop,
offline after a one-time seeding step, and that constraint (**C1**) shapes almost
everything.

---

## 2. Where things stand

**Five spikes are done — S7, S2, S1, S3 and S6 — and all five answered yes (§5); S5 and S4 are deliberately later.
FOURTEEN plans are executed, and each has an acceptance that passes:**

| Plan | Executed | What it made true | Acceptance |
|---|---|---|---|
| P1 | 2026-09-05 | The platform runs on one laptop, offline after `make seed` | `make doctor`, `make verify` |
| P2 | 2026-09-05 | The control plane serves the API on 7100 | its unit tier |
| P3 | 2026-09-07 | An app goes from a bare repository to a URL, through the Docker driver and the edge | `make demo` |
| P4a | 2026-09-09 | A real CWL sign-in; secrets stored, not derived; §8's injection contract | `make demo-identity` |
| P4b | 2026-09-15 | AI answers charged to the asker; build logs, events and Incidents | `make demo-ai` |
| P4c | 2026-09-16 | A redeploy interrupts and signs out nobody | `make demo-redeploy` |
| P5a | 2026-09-17 | The API is a published contract under `/v1`, and §22's journey runs through a generated client | `make demo-journey` |
| P5b | 2026-09-18 | An agent acts on a delegated token, is refused D24's privileged four centrally, and a person confirms one retry | `make demo-token` |
| P5c | 2026-09-19 | **The clients, and Phase 1c's acceptance**: `manifest-mock`, the console behind its import boundary, and the CI acceptance script — §22's journey proved by two independent clients over one contract | `make ci-acceptance` **and a person clicking all sixteen rows** |
| P6a | 2026-09-22 | **The first production launch**: §12's public listener, the two external records, D21's rehearsal, step-up, an approval bound to a digest verified before anything starts — every blocking item honestly met | `make demo-production` **and a person clicking the launch** |
| P6b | 2026-09-23 | **Subsequent releases**: a launched app's release is self-serve unless it changes a sensitive field; then it re-escalates to an administrator who approves a STORED preview; the egress proxy follows the release; §9's IAM change request; the person-only class | `make demo-releases` **and a person clicking it, stale path included** |
| D5 driver 2 | 2026-09-25 | **The GitHub source driver**: an app's code in a GitHub organisation — private and kept private, a person's push reaching Manifest by an HMAC-verified webhook, every commit it learns of scanned for secrets, `main` protected where GitHub will, and still built offline from a local mirror; proved against a GitHub-compatible FAKE and checked against a real App | `make demo-github` (driver 2) **and a person clicking both drivers** |
| Authoring API | 2026-09-27 | **An app CREATED through the API**: a project's files listed, read and committed against the commit read — planned against the base tree with git plumbing and no worktree, on both drivers — its history attributed by the platform's own record, its app secrets set write-only per environment, a build of exactly the commit written with that commit's own manifest, and every operation, field, code and event documented and SERVED by the API (`/v1/docs`, `/v1/openapi.json`, the console's Docs screen, `/reference.html`) | `make demo-authoring` (either driver: an agent builds a bulletin board through the API alone) **and a person clicking it** |
| Front-end enablement | 2026-09-29 | **What the faculty front-end at `app.manifest.internal` needs from Manifest**: a second origin (sign-in, step-up, CSRF and cookies judged by the origin a request arrived on), a project's `name`, people by CWL login name, agent and intake model keys charged to a person (or the platform), an app's recent output (sandbox only, redacted), binary files, archive/restore and delete of a never-launched app, the capable model with its on-premise fallback and the building agent's models as a setting — ten spec actions, all Rich's | `make demo-frontend` (either driver: a front-end's server on `app` drives all of it for a signed-in instructor) **and a person clicking it** |

**Executing a plan finds defects at a rate that has never fallen with practice** — 18 in P1's 13 tasks, 52 in P2's
21, 82 in P3's 19, 80 in P4a's 15, 140 in P4b's 16, 70 in P4c's 11, 146 in P5a's 17 — plus 8 more found in a
browser after sitting 7, which no tier had ever looked at — **116 in P5b's 13**, 107 in P5c's 14, and P6a's in the
roadmap's table — every plan self-reviewed first. The roadmap's defect-rate table has every plan and sitting. Treat
a written plan as a hypothesis (§9).

**The four numbers you will check first, re-measured 2026-09-29 on this machine at the front-end enablement plan's sitting 12
(Task 15, the acceptance, and the plan's one whole-branch review's fix pass; its record is in the plan). `pnpm test` **2826** in **180** files
(was 2817 — the fix pass's nine tests); `make doctor` **20** with **0 failed and 0 warnings**; `make verify` **61**; `pnpm test:docker` **248** in
**41** — owed (`ai/`, `projects/`, `releases/`), green on its first run, alone:**

| Gate | What it reads now |
|---|---|
| `pnpm test` (from the **repo root**) | **2826 passed, 0 skipped, 180 files**, **~12–14 min (782 s alone, the front-end enablement plan's sitting 12, at load ~5–6, exactly as predicted — its run 1, inside `make ci-acceptance`, 716 s, read 2825 and ONE red: `api/delivery.test.ts`'s `deadlock detected` in `resetDatabase`'s TRUNCATE, the plan's F26, TRAPS.md's P6b-F7 trap — a deploy's retire pass outliving its test, 2 of 8 runs of that file; 759 s and 753 s alone, its sitting 11a, at load ~5–10, identical on both runs, exactly as predicted; 725 s and 719 s alone, its sitting 11, at load ~3–7, identical on both runs; 854 s and 847 s alone, its sitting 10, at load ~5–13 — its run 1 read 2769: two 5-second timeouts at load 6–7 in `api/intake.test.ts` and `api/webhooks.test.ts`, green re-run alone, trap 7; 830 s and 791 s alone, its sitting 9b, at load ~3–6; 693 s and 690 s alone, its sitting 9a, at load ~5–7; 688 s and 656 s alone, its sitting 9, at load ~6–13; 633 s and 651 s alone, its sitting 8, at load ~4–5; 605 s and 600 s alone, its sitting 7, at load ~4–6; 562 s and 578 s alone, the front-end enablement plan's sitting 6, at load ~4; 615 s and 559 s in its sitting 5, at load ~4–7; 520 s and 517 s in its sitting 4; 520 s and 514 s in its sitting 3; 487 s and 482 s in its sitting 2; 525 s inside `make ci-acceptance` before it) — up from ~240 s before the D5 plan's sitting 6**, because every driver-1 push in the suite runs the rendered secret-scanning hook (that sitting's F6). Run it twice, identical, on the FINAL tree at every close — `make ci-acceptance`'s run counts as one — and single files while working (§8 *Decided*: the LEAN budget); `scripts/ci-acceptance.sh`'s `EXPECT_TESTS` is **2826**. It is the `unit` and `packages` projects: no Docker except Postgres for the database suites, connecting as **`manifest_app`**, not `manifest` (§3). **Before you believe a red, read §4's traps 4, 7, 8 and 14**: it truncates the tables, two Vitest processes corrupt each other, load times it out, and the database's clock is not the host's |
| `pnpm test:docker` | **248 tests, 0 SKIPPED, 41 files** (2026-09-29, the front-end enablement plan's sitting 12: 1309 s, green FIRST run, alone — no Vitest beside it — at load ~6–8, exactly as predicted, owed by the whole-branch review's fix pass (`ai/sessions.ts`, `projects/authz.ts`, `releases/`); **the tier restarts the edge: `make verify` straight after read 61/0/0 this time, but three `make reset`s and a `make up` earlier the same day left the PUBLIC listener resetting the host, seen only by `make verify` (the plan's F17)**. Its sitting 11a: 1257 s, green FIRST run, alone — no Vitest beside it, the reviewer reading only — at load ~5–7, +2 exactly as predicted (`ai/agent-sessions.docker.test.ts`'s FE-36 case and `boot.docker.test.ts`'s boot sweep); **+106 s is the on-premise model `qwen3.8:27b`'s loads** — `ai-path.docker.test.ts` 4.7 s → 36.8 s and `capable.docker.test.ts` 32.6 s, each evicting `qwen3.5:4b` (TRAPS.md); its fix pass re-ran the two Docker files reaching its changed lines alone, 10 of 10. Its sitting 11: 246 in 41, 1151 s, green FIRST run, alone — no Vitest beside it — at load ~5–7, exactly as predicted: owed by `c4e10cc` (the faculty front-end's FE-37 — the SP key in every environment, `releases/release.ts` and `blueprints/`), no Docker file changed and none asserts a keyless sandbox (grepped; `deploy-sso` asserts the key on staging). Its sitting 10: 1145 s, green FIRST run, alone — no Vitest beside it — at load ~4–6, beside its whole-branch reviewer, exactly as predicted: owed by `observability/output.ts`'s code union (FE-24), and no Docker file changed; its fix pass touched no owing path (the console, the mock and a comment in `api/`). Its sitting 9b: 1142 s, green FIRST run, alone — no Vitest beside it — at load ~4–6, beside its whole-branch reviewer; +2 tests in `ai/capable.docker.test.ts` (4 → 6: an unreachable primary answered by the on-premise model, and a public-rank fallback refused) — and one more than predicted, because 9a's fix pass added its I3 boot case after its tier ran, so the tree held 244 from `5df6322` (F10); its fix pass changed only that Docker file's own two cases, re-run alone, 6 of 6, **and they chat on `default-chat-large` only after clearing the name, asserted — never beside the owner's real model**. Its sitting 9a: 1084 s, green FIRST run, alone — no Vitest beside it — at load ~2.5–4.8, beside its whole-branch reviewer; +3 tests and one file, `ai/capable.docker.test.ts`; its fix pass changed `ai/capable.ts` and `index.ts`, so the three Docker files that run them — `ai/capable.docker.test.ts` (now 4, with the boot-on-a-held-port case), `ai/ai-path.docker.test.ts` and `boot.docker.test.ts` — were re-run alone, 18 of 18; **the tier's own control planes boot without `MANIFEST_CAPABLE_MODEL` and REMOVE the capable model — restart the control plane with `.env` after it**. Its sitting 9: 240 in 40, 1098 s, green FIRST run, alone — no Vitest beside it — at load ~6–7, beside its whole-branch reviewer; +8 tests and one file, `releases/delete.docker.test.ts` (7) and the Docker driver's `removeName` contract case (1); its fix pass changed `releases/lifecycle.ts`, which that file and `releases/lifecycle.docker.test.ts` run, so both were re-run alone, 12 of 12 — grepped: no Docker case reaches the fix pass's `build/context.ts` or GitHub lines. Its sitting 8: 232 in 39, 1064 s, green FIRST run, alone — no Vitest beside it — at load ~5–9, beside its whole-branch reviewer; +10 tests and one file, `releases/lifecycle.docker.test.ts` (5), the SSO deregistration (1) and the Docker driver's contract (4); its fix pass changed `releases/lifecycle.ts`, which that file runs, so it was re-run alone, 5 of 5. Its sitting 7: 222 in 38, 985 s, green on its SECOND run, alone, at load ~5–6 — its first, 985 s beside the reviewer, read 2 failed in Task 10's own Docker file because unit Vitest ran beside it, trap 8, and did not count (that sitting's F10); +4 tests in two files, `ai/agent-keys.docker.test.ts` and `ai/agent-sessions.docker.test.ts`. Its sitting 6: 953 s, green first time at load ~3–7, run once beside its whole-branch review — Task 8 ADDED `identity/saml.docker.test.ts`'s two-origin real sign-in; its fix pass touched no line a Docker case runs, grepped. Its sitting 5: 217 in 36, 940 s, green first time at load ~4, run once beside its whole-branch review — Task 7 EXTENDED `identity/saml.docker.test.ts`'s real sign-in to read `cwl_login`, so the count did not move; its fix pass touched no line a Docker case runs, GREPPED before ruling. Its sitting 4: 945 s, green first time at load ~3.4, run once beside its whole-branch review — and its fix pass's one Docker file, `identity/saml.docker.test.ts`, re-run alone on the final tree, 3 of 3, because a sign-out case drives the changed `completeSpLogout` (that sitting's F15). Its sitting 3: 940 s, green first time at load ~3.5, run once beside its whole-branch review — its fix pass touched no line a Docker case runs. Its sitting 2: 949 s all green on its pre-fix tree, then 926 s on its final tree with ONE red — the wall-clock *a retire waits for a request that is in flight*, green re-run alone at load 4–7. Before it, 210 in 35 — the authoring API plan's sitting 9: 957 s, green first time at load ~5; its sitting 8's 932 s, green first time at load ~3–5; its sitting 6's 943 s, green first time at load 4–9; its sitting 5's 927 s, green on its SECOND run — the first, 895 s, was red in `sso/login.docker.test.ts` alone because macOS had half-deleted a cached fixture repository in `$TMPDIR` (that sitting's F14; `runtime/docker/testing.ts` now rebuilds one) — its sitting 4's 881 s, its sitting 3's 895 s, its sitting 2's 896 s and 878 s, and its sitting 1's 906 s; the D5 plan's sitting 8's 1341 s at load 5–16 — the Docker VM itself — and its sitting 7's 1201 s at load ~2–5. Its one wall-clock case — *a retire waits for a request that is in flight*, a drain bound — was red at load 12–15 in sittings 5 and 6 and green re-run alone at ~6; TRAPS.md has the re-run command, which leaves one dead network behind). Owed only when the current plan's sittings rule says so. **Needs `make up` and the chat model warm** — `curl -s http://127.0.0.1:11434/api/generate -d '{"model":"qwen3.5:4b","prompt":"ok","stream":false,"think":false,"keep_alive":"30m","options":{"num_predict":1}}'` — fails rather than skips, and **outlasts the agent's 10-minute tool limit: run it in the background**. It restarts the edge (dropping every runtime route), truncates the tables and re-registers the platform's SP row: **restart the control plane afterwards**, then run the cleanup scripts, because it regenerates seven dead app networks and one volume every time — and about thirteen app images, which `scripts/app-images.sh` removes — **and then `make verify`**: TWICE now — D5 sittings 2 and 5 — the edge's restart left the host unable to reach it (12, then 11, host→edge failures, `curl: (35) Recv failure: Connection reset by peer`; fixed each time by `docker restart manifest-caddy`; sitting 6's two tiers did not show it). Where its time goes: [`plans/2026-09-23-docker-tier-speed-brief.md`](plans/2026-09-23-docker-tier-speed-brief.md) |
| `make doctor` | **20 checks, 0 failed, 0 warnings** — the faculty front-end's server on 7105 counted as the platform's by its marker (`GET /api/__doctor` → `manifest-app`, sitting 9a; before it, 1 failed while that server ran) — one of them the GitHub fake's image (`make seed`, profile `github`); the vulnerability database is fresh until **2026-10-06** (refreshed by Rich 2026-09-29, `make refresh-vulndb`, ~1–3 min); after that doctor warns, and §13's `scans` item refuses every production launch until `make refresh-vulndb` runs with the network on (*Outstanding*, below). Its `127.0.0.3` checks assert what dnsmasq answers, so **it cannot tell you production is REACHABLE** |
| `make verify` | **61 checks, 0 failed, 0 warnings** — four of them `app.manifest.internal`'s (sitting 6: it serves the API, refuses a container, allows only the gateway, and its site is the console's changed in two places), two the GitHub fake's, static, whether or not it runs. Straight after `make reset` it reads ONE red — the audit grant — until the control plane has migrated the empty database. Its INFO line reads `mf- containers=21 networks=7 volumes=14` at sitting 12's close — `make ci-acceptance`'s demos (`launch-app`'s six, `board-local`, `journey-app`, `token-app`, `frontend-local`) and driver 2's `frontend-github`, all with no rows behind them since the tests' truncation; the day's three `make reset`s removed the open's thirty. *Runtime routes currently applied* counts the internal listener (`srv0`) only, so it never sees a production route |
| `make demo-production` | P6a's acceptance: ~1 min fresh, three phases each ending `every check passed`; ~4 s on the re-use path, where `launch-app` has launched. Step 11 of `scripts/offline-acceptance.sh`. Last green 2026-09-29, FRESH (after the day's resets), inside `make ci-acceptance` (the front-end enablement plan's sitting 12) |
| `make demo-releases` | P6b's acceptance: ~2 min re-used, ~3 fresh (it runs `make demo-production` first when `launch-app` has not launched). Step 12 of the offline acceptance and the last step of `make ci-acceptance`. It leaves `launch-app` on its leg C release. Last green 2026-09-29 inside `make ci-acceptance`, fresh (the front-end enablement plan's sitting 12); before it 2026-09-27 (the authoring API plan's sitting 10); before it 2026-09-25, fresh after a `pnpm test`, 140 s: leg A's preview `llm` with ONE model sentence (the egress change's — none for `sn`), leg C's `not-modelled` (its only change is `sn`, so no model was asked) |
| `make demo-token` | P5b's acceptance, ~30 s; step 9 of the offline acceptance. **It steps the instructor up since the D5 plan's sitting 8** — confirming a privileged action has needed §20's step-up since P6a (`f989fcb`, 2026-09-20), and it was RED from then until that sitting ran it (F16). Last green 2026-09-29, inside `make ci-acceptance` |
| `make demo` | P3's acceptance, ~35 s, driver 1. **In no acceptance** — which is how it stayed red from P6a's step-up until the D5 plan's sitting 8 (F15); it now asserts `STEP_UP_REQUIRED`, steps up, and then §13's checklist refusal. Last green 2026-09-26 (the authoring API plan's sitting 10, 26 s, the fake running) |
| `make demo-github` | **The D5 plan's acceptance — driver 2 ONLY** (`MANIFEST_SOURCE_DRIVER=github`, `make github-up`): ~70 s re-used, ~80 s fresh, ten steps against the GitHub fake, each phase ending `every check passed`. On driver 1 it stops at step 0 and creates nothing. Step 13 of the offline acceptance; `NOT RUN` in `make ci-acceptance` on driver 1. Green three times 2026-09-25 (fresh, re-use, after `make reset`) |
| `make demo-authoring` | **The authoring API plan's acceptance — EITHER driver** (step 0 asks: `board-local` on driver 1, `board-github` on driver 2): an agent on a delegated token builds a bulletin board through the API alone, refused and helped by its codes, and people use it. ~35–40 s re-used or fresh; `DEMO_AUTHORING_STOP_AFTER=<step>` for a control's short run. Step 14 of the offline acceptance; a step of `make ci-acceptance`. Green 2026-09-26/27 three times on each driver (fresh, re-use, from `make reset`) and inside `make ci-acceptance` |
| `make demo-frontend` | **The front-end enablement plan's acceptance — EITHER driver** (step 0 asks: `frontend-local` on driver 1, `frontend-github` on driver 2): a front-end's server on `app.manifest.internal` drives the whole plan for a signed-in instructor — the fixture `confidential`, the model read from `session.models` (the 27B, warmed), a sandbox's output redacted, a PDF's key refused, archive, restore, delete and the slug taken again. ~115–260 s; `DEMO_FRONTEND_STOP_AFTER=<0–10>` for a control's short run. Step 15 of the offline acceptance; a step of `make ci-acceptance`. Green 2026-09-29 three times on EACH driver (fresh, re-use, from `make reset`) and inside `make ci-acceptance`; seven negative controls seen red |
| `make demo-journey` | P5a's acceptance: all eight steps, ~51 s, over the contract; last green 2026-09-29 in `make ci-acceptance` (the front-end enablement plan's sitting 12) |
| `make ci-acceptance` | The headless half of 1c's acceptance, ~13 min — run it in the background: `make doctor`, `make verify`, the three fast gates, `pnpm test` with its count asserted, the three package builds, then — **after asking which source driver answers** — `make demo-journey`, `make demo-token`, `make demo-production` and `make demo-releases` on driver 1, and `make demo-github` on driver 2 — and `make demo-authoring` on EITHER; the other driver's steps read `NOT RUN`, which is not a pass. Every step REPORTS rather than exits, so a red run is a measurement; a count that has moved reads `MOVED`, not `FAIL`. **Its four `EXPECT_` lines are this box's numbers in code — `2826 / 180 / 20 / 61` — and move with it** (§6). Last run 2026-09-29 on driver 1 (the front-end enablement plan's sitting 12): every step PASS but `pnpm test` (F26's one red), `demo-frontend` among them — its first run with `launch-app` launched, so its `409 PROJECT_LAUNCHED_NOT_DELETABLE` ran — `demo-github` NOT RUN, 1212 s |

**A different number on a clean checkout is signal, not noise** — it means something moved, and finding out what is
cheaper before you start than after. **This box is the only current one in this file**; the same four numbers are
stated in the top box, in `RUNBOOK.md` and in `scripts/ci-acceptance.sh`, and all four move together (§6). A plan's record carries the numbers as
each sitting left them, dated, and they deliberately do not move.

**Outstanding, and Rich's.**

- **The offline acceptance.** Turning the network off from a tool call cuts the agent off too, so
  `scripts/offline-acceptance.sh` is run by hand. Its step 6 runs `make demo-identity`, the step most likely to
  need a route out; its step 7 runs `make demo-ai`, whose open question is whether Ollama — a host application, not
  a container — answers with the network off. **It has sixteen headings, 0 to 15, since the front-end enablement plan's sitting 12
  added step 15, `make demo-frontend`, which runs on EITHER driver like step 14, `make demo-authoring`** (the D5 plan's sitting 8 added step 13, `make
  demo-github`, which needs the control plane on DRIVER 2 while steps 6 to 12 need driver 1, so each step asks which driver
  answers and reads SKIPPED on the wrong one, step 13 printing both restart commands); run the script on driver 1, then
  restart on driver 2 and run steps 13 and 14 again. Step 12's preview summary may legitimately read `unavailable`
  offline, and its control (c) cannot fail then. **Every step's demo was green on 2026-09-26/29 with the network on** — `make demo-frontend` on both drivers on 2026-09-29,
  `make demo-identity`, `make demo-ai` and `make demo-redeploy` in the authoring API plan's sitting 10, `make demo-github` and
  `make demo-authoring` on both drivers, and `make ci-acceptance`'s five — so a red step offline is the network's. **A skipped acceptance is not a passed one.**
- **The second-machine clean clone** — no second Mac has been available; `RUNBOOK.md`'s *Known gaps* records it.
- **`Manifest (local dev)` — REGISTERED 2026-09-24, before the D5 plan's sitting 3**, on the free organisation
  **`Manifest-local-dev`** (the plan's *What Rich does* 2). Checked locally the same evening, never printing the key:
  `infra/secrets/github-app.pem` is a 2048-bit RSA private key and `github-conformance.json` holds exactly `appId`,
  `installationId` and `org`, both `-rw-------` and owned by `rich`, git-ignored, and no copy left in `~/Downloads`; a
  JWT signed with the key verifies under its own public half. **And checked against GitHub, at Rich's yes, with two
  read-only calls** (no installation token minted): `GET /app` → `200`, App id `5068172` = the file's, permissions
  exactly `administration: write`, `contents: write`, `metadata: read`, no events, **installed once**; `GET
  /orgs/Manifest-local-dev/installation` → `200`, installation `164652178` = the file's, `repository_selection: all`,
  not suspended. **Its first real conformance run was the D5 plan's sitting 3, 2026-09-24, at Rich's yes**
  (`make github-conformance`, ~12 s, both repositories deleted; `packages/github-fake/conformance/github.com-2026-09-24.json`)
  — and its C7s answer corrected §20's git-driver bullet 1 (Rich chose option (b) the same evening; §8, *Decided*).
  - **What is still Rich's:** the conformance run creates two private repositories, pushes one commit, force-pushes a
    rewrite of it (C9r, added by the D5 plan's sitting 8) and deletes both, and runs **only at his yes, with the network
    on, each time**. **Its second real run was 2026-09-25, at his yes** — seventeen of seventeen as golden, C9r included
    (`packages/github-fake/conformance/github.com-2026-09-25.json`). Nothing schedules the next one. **Never install this App on UBC's
    organisation**; to revoke it, delete the key or the App on its GitHub page.
- **Refreshing the vulnerability database — weekly, with the network on: `make refresh-vulndb`** (added 2026-09-24
  at Rich's request; `scripts/refresh-vulndb.sh` re-reads Grype's own status afterwards and names the new build
  date). **Last run by Rich 2026-09-29 (it had been 2026-09-24) — NEXT DUE after 2026-10-06.** Nothing needs to be up or down but
  Docker Desktop; it downloads a ~175 MB archive and unpacks ~2.8 GB, ~1–3 minutes. The database is now built
  `2026-09-29T06:32:31Z`, and `make doctor` reads 0 warnings — and names the target in its staleness line. **Once
  it is past §12's seven days**, every scan WARNS rather than blocks at build time (by design — C1 lets an offline
  laptop deploy to staging), `make doctor` says so with one warning (P6b sitting 2, F13), and **§13's `scans` item
  refuses EVERY production launch** (F14), so `make demo-production` goes red at its step 3. **`make demo-releases`
  needs it fresh on a machine where `launch-app` has not launched** (it runs `make demo-production` first). It
  needs the network, which makes it Rich's call; the target touches only the `manifest-grype-db` volume, where
  `make seed` also rebuilds images, re-mirrors and re-warms (P6b sitting 3 chose the one line the target now wraps
  for exactly that reason). **Its offline-failure branch has never run** — it prints that the refresh needs the
  network and exits 1. Refreshing it from the CONSOLE is a plan of its own, placed after the GitHub plan (§8
  *Decided*).
- **Starting the UBC external track** — its trigger, §16's proof app answering a question, fired on 2026-09-15 and
  was raised with Rich that day. **P6a MAKES IT MORE URGENT, NOT LESS (written 2026-09-19)**: under R1 the plan
  builds `IamRegistration` and `PrivacyAssessment` as real rows an administrator records, so the platform is now
  waiting on a real registration and a real PIA rather than on code.
  [`docs/external-track.md`](../external-track.md). **AND SINCE SITTING 9 ITEM 5 — access to
  `authentication.stg.id.ubc.ca` — IS THE ONLY PART OF A FIRST PRODUCTION LAUNCH THIS PLATFORM CANNOT DO FOR
  ITSELF**: Manifest runs D21's rehearsal locally, against its own IdP, and the checklist item says in its own
  words that this proves the registration's SHAPE and never UBC's acceptance of it. Two settings change when the
  access arrives, and no code does.
- **§8's open questions.**

**The spec is current, with no open follow-up.** Every spec change has been applied only after Rich approved it —
**most recently the front-end enablement plan's Spec action 10** (drafted at its sitting 11's close from Rich's words on the faculty front-end's FE-35 and FE-36; approved as drafted WITH its safeguard, option (a), and applied 2026-09-28, `d9a1fa1`): the agent that BUILDS an app is governed by a platform setting — the capable model allowed on a `confidential` project by default, the app's own AI on-premise either way, and a `confidential` project's tokens refused staging's and production's Incident log tails while it is (§7, §10, §26). Before it **the same plan's Spec action 9** (drafted by its sitting 11 after the faculty front-end's session fixed FE-37 at Rich's word, `c4e10cc`; approved as drafted, option (a), and applied 2026-09-28, `d82b3a2`): §8's `SAML_PRIVATE_KEY_PATH` row is `all` — every environment's app is given its SP key and every sign-in is signed. Before it **the same plan's Spec action 8** (drafted by its sitting 9a from its measurements of LiteLLM's
`/fallback`; approved as drafted, option (a), and applied 2026-09-28, `e6c272d`): the capable model's fallback is the on-premise
model — a platform setting naming a catalogue entry, `default-chat-onprem` by default, answering `default-chat-large` when its
provider fails, at its own price, its classification the platform's to enforce (§7, §21, §26). Before it **the same plan's Spec action 7** (drafted at its sitting 8's close from Rich's decision; approved
as drafted, option (a), and applied 2026-09-27, `959af7f`): the capable model — `default-chat-large` in §7's catalogue at
`internal`, a platform setting naming its provider (§26), and §21's note that it needs the network and nothing offline depends on
it. Before it **the same plan's Spec actions 5 and 6** (drafted by its sitting 6 from the faculty front-end's
message; approved as drafted, option (a), in its sitting 7's first message; applied 2026-09-27, `25e7445`): an intake key before
a project exists, paid by the platform, and staging as UBC's real staging world. Before them **the same plan's FOUR, applied
2026-09-27 (`1d1afd7`), each as option (a)**: agent model
keys outside a sandbox, charged to the person (D2, D8, §6, §10, §15, §17, §20, D24); the faculty front-end's origin is
`app`, with one SP entity and an assertion-consumer URL per origin (§21, §20, §9, and §12's one sentence); archive, restore
and delete — a new §11 subsection, person-only with step-up, delete for a never-launched project, synchronous as a second
exception to D23.9 (§6, §13, §20, D24, §22); and a project's `name` and a person's `cwl_login` from `uid` (§6, §9). Before
them §26's *Scope*, applied the same day (the interface design brief's §13: the admin console gets real
design effort and no longer inherits `console/`'s plain bar; §8, *Decided*), before it the authoring API plan's Spec
actions 1 and 3 (2026-09-26, `1d42c80`), and before those §7's two edits for the per-user AI budget, applied 2026-09-26 (the authoring API plan's Spec action 4,
option (a), as worded: the schema line says it is validated and not enforced before Phase 4, and §7's *Validation* list
refuses it above the project's AI quota and warns that it binds no one; §8, *Decided*), before them §20's and D24's three
edits for who may set an app secret's value (the same day; Spec action 2, option (a)), before those §19's row for the production GitHub organisation (2026-09-25,
the D5 plan's Spec action 4), and before that §20's git-driver bullet 1, corrected on the evening of
2026-09-24 (option (b), after the D5 plan's real conformance run met Spec action 3's condition), and the chat-model
switch's two the same day. The roadmap's *Spec
actions raised by…* sections list every one, with its wording, and say which shared HTML pages were swept.

---

## 3. The document map, the code, and what it keeps true

Read for your purpose, not front to back. The spec is ~2,340 lines; nobody reads it all.

| You are… | Read |
|---|---|
| **new, any role** | This file — §7e and §2 first. Then the roadmap's ledger and its *Lessons*. |
| **executing a plan** | **None is being executed.** [The front-end enablement plan](plans/2026-09-27-front-end-enablement.md) was EXECUTED on 2026-09-29 — eighteen tasks in fifteen sittings, all ten of its spec actions Rich's; its *What executing this plan found* is the record. **The current plan is always the one §7e names**: when one is, its sittings table says which sitting is next, and its *What executing this plan found* is the record of every sitting before — read that before the task. One sitting per session, with a check-in at each boundary. A plan is self-contained by construction; if it is not, that is a defect in the plan — fix it there. |
| **writing a plan** | **The faculty front-end's LAUNCH PATH (FE-6, FE-25) is next in Rich's order** (the roadmap's *The faculty front-end's message*; §7e asks him to confirm it first); the vulnerability database in the console comes after it (§8 *Decided*). House style: [`plans/2026-08-30-p1-local-substrate.md`](plans/2026-08-30-p1-local-substrate.md), or the newest, [`plans/2026-09-27-front-end-enablement.md`](plans/2026-09-27-front-end-enablement.md). |
| **seeing it run end to end** | [`WALKTHROUGH.md`](WALKTHROUGH.md) — start it, deploy the demos, what to open in a browser and with which test users, how to check it, and the traps. |
| **running the platform** | [`RUNBOOK.md`](RUNBOOK.md) — `make seed && make host-setup && make up`, every demo step by step, and *Known gaps*. Its *Running the control plane* is the export block to start it with. |
| **writing code** | *The code* and *What the platform keeps true* below. **Then run `make demo` once**: it is the only thing that exercises boot, build, release, deploy and the edge through the real HTTP surface, and it is where this project's worst defects were found. |
| **changing the spec** | Don't, without asking. It is marked *Approved design*. Record the proposed change and Rich decides. |

```
docs/external-track.md          the UBC IAM / PIA work that runs in parallel (docs/, not docs/superpowers/)
~/Developer/manifest-app/       THE FACULTY FRONT-END — a SEPARATE repository (§5), ANOTHER SESSION'S: never edit it. Served at
                                app.manifest.internal from 7105; links @manifest/contract to THIS working tree (so keep it
                                buildable at every commit); its asks of the platform are FE-1…FE-25 in docs/api-findings.md, and
                                Rich's decisions on them are in docs/2026-09-27-to-the-platform-session.md (begun 2026-09-27)
docs/api/                       THE API'S DOCUMENTATION, served at GET /v1/docs: ten guides, reference/ (GENERATED by
                                `pnpm docs:write`) and llms.txt — PUBLIC TEXT; names nothing internal (a gate)
docs/superpowers/
├── ORIENTATION.md              ← you are here
├── TRAPS.md                    every trap this machine has sprung, word for word — search it; §4 has the top 27
├── WALKTHROUGH.md              run it, see it, check it — one page, browser included
├── RUNBOOK.md                  run and operate the platform; every demo; Known gaps
├── specs/
│   ├── 2026-08-29-manifest-platform-design.md   AUTHORITATIVE. 27 sections.
│   └── manifest-*.html         plain-language versions, SHARED OUTSIDE THE TEAM; markdown wins
├── plans/
│   ├── 2026-08-29-plan-roadmap.md                 THE LEDGER. Status and the defect-rate table.
│   ├── 2026-08-29-phase-0-spike-briefs.md         P0. Historical record.
│   ├── 2026-08-30-p1-local-substrate.md           P1 — and the house style for a plan
│   ├── 2026-08-29-p2-control-plane-spine.md       P2
│   ├── 2026-08-31-p3-docker-driver-deploy-spine.md P3 — its Sessions 4 and 5 above all
│   ├── 2026-09-07-p4a-identity-secrets-injection.md P4a
│   ├── 2026-09-07-p4b-ai-events-streaming-incidents.md P4b
│   ├── 2026-09-15-p4c-brief.md + …-p4c-zero-downtime-redeploys.md P4c
│   ├── 2026-09-16-p5-brief.md                     the brief P5a, P5b and P5c are written from
│   ├── 2026-09-16-p5a-the-contract.md             P5a — executed 2026-09-17
│   ├── 2026-09-17-p5b-delegated-tokens.md         P5b — executed 2026-09-18
│   ├── 2026-09-18-p5c-the-clients.md              P5c — executed 2026-09-19; PHASE 1c COMPLETE
│   ├── 2026-09-19-p6-brief.md                     the brief P6a and P6b are written from
│   ├── 2026-09-19-authoring-api-brief.md          the brief the authoring API's plan was written from (2026-09-25)
│   ├── 2026-09-19-interface-design-brief.md      for a DESIGN agent: the faculty product and the admin console
│   ├── 2026-09-19-p6a-first-production-launch.md  P6a — executed 2026-09-22
│   ├── 2026-09-22-p6b-subsequent-releases.md      P6b — executed 2026-09-23; its *What this plan does not build* is the next plan's input
│   ├── 2026-09-24-d5-github-source-driver.md       D5's driver 2 — EXECUTED 2026-09-25, 15 tasks in eight sittings; its *What this plan does not build* is the next plan's input
│   ├── 2026-09-25-authoring-api.md                THE AUTHORING API — EXECUTED 2026-09-27, 13 tasks in ten sittings; its *What this plan does not build* is the next plan's input
│   ├── 2026-09-27-front-end-enablement.md         THE FRONT-END ENABLEMENT PLAN — EXECUTED 2026-09-29, 18 tasks in 15 sittings (9a, 9b, 11a added by Rich); all 10 spec actions APPLIED; its *What this plan does not build* and *Sitting 12* are the next plan's input
│   └── 2026-09-23-docker-tier-speed-brief.md       a tracked item: why the Docker tier takes ~26 min, ranked fixes
└── spikes/
    ├── S7, S2, S1, S3, S6-findings.md   each one's answer is its first sentence (§5)
    ├── S1-controls-settled.md          scoped registry tokens; the builder's bounds
    ├── p4c-, p5a-, p5b-, p5c-, p6a-, p6b-baseline/   THE MEASUREMENT SITTINGS, one per plan since P4c (P6b's ran 2026-09-22).
    │                                   Each README.md is one section per measurement with its raw
    │                                   answer; the results-*.txt beside it is every command's full
    │                                   output. Read the CURRENT plan's before its sitting 2
    ├── authoring-baseline/            THE AUTHORING API'S MEASUREMENT SITTING (its Task 1, 2026-09-25): README.md,
    │                                   results-task1-2026-09-25.txt and probes/ — the writing session's and Task 1's
    ├── START-HERE.md                   the ORIGINAL spike briefing. Historical; its §6 is wrong
    └── HANDOFF-2026-08-3*.md           dated handoffs, SUPERSEDED by this file; do not act on either
```

**Every executed plan's *What executing this plan found* is its record**: every defect with the measurement that
found it, every negative control, the gate numbers and the machine, sitting by sitting. §7a says which entries to
read first.

### The code

```
Makefile  infra/  scripts/        P1's platform: compose.yaml and its services; make seed / up / down / reset /
                                  doctor / verify / demo*; infra/lib/ holds the ensure-*.sh steps and idp-login.sh
vitest.config.ts                  ROOT: fileParallelism: false — a root-level option; it does nothing in a package config
.prettierrc  .prettierignore      Prettier owns packages/ ONLY — without the ignore, `pnpm format` rewrites the approved spec
blueprints/fixture-node/          P2's minimal blueprint
blueprints/node-ts-mongo/         THE blueprint faculty apps are generated from: descriptor, Dockerfile, skeleton
                                  (auth/, ai/, server.js), agents/AGENTS.md — the knowledge pack — and starters/
blueprints/node-ts-mongo/starters/proof-app/
                                  §16's proof app, node-ts-mongo@1's first STARTER (P5a Task 10; it was
                                  fixtures/proof-app/) — laid over the skeleton by scripts/lib/proof-app.sh
fixtures/fixture-app/             make demo's build target — server.js at the tree root, because the blueprint's CMD
                                  is not templated
fixtures/saml-sp/                 a throwaway SP on the real passport-ubcshib — §16's identity-path tier
infra/reserved-labels/            §23's reserved labels, loaded at boot
packages/control-plane/src/       the control plane — below
packages/contract/                openapi.json (GENERATED) and @manifest/contract, the client generated from it
packages/journey/                 §22's journey through that client — make demo-journey; and every other headless demo's
                                  TypeScript half: token.ts, production.ts, releases.ts, github.ts (make demo-github);
                                  coverage.ts (§22's path as data, a gate), example-*.ts (the guides' code, run against
                                  the mock), docs-write.ts (`pnpm docs:write`) and docs-html.ts (`pnpm docs:html` — the
                                  documentation as one page opened from disk) — the authoring API plan's Task 11
packages/console/reference.html   the HTML reference: Scalar's standalone bundle over /v1/openapi.json; reference/ imports
                                  nothing (Task 11)
packages/github-fake/             D5's GitHub FAKE (the D5 plan, Tasks 4–6, 9–10, 12): App JWTs, scoped tokens, repositories,
                                  git over HTTP, signed webhooks (push; repository publicized/privatized), `main`'s
                                  protection by plan, enforced by its own pre-receive in GitHub's GH006 words — held to
                                  GitHub's own schemas, its HMAC vector and a real App's answers (golden.json);
                                  run from TS source in manifest-github-fake:local, --profile github, 127.0.0.1:7110;
                                  its delivery log in its volume (three days, with the receiver's answer), and a page at a
                                  repository's html_url saying it is NOT GitHub (sitting 8). make demo-github is its acceptance
```

`packages/control-plane/src/` — one directory per §5 module, and **`module-boundaries.test.ts` refuses an import of
another module except through its `index.ts` or `testing.ts`**:

| Module | What it is |
|---|---|
| `index.ts`, `config.ts` | the boot, and env parsing (repo paths resolve from the repo root, never the cwd) |
| `spec/` | §7's schema and policy, `diff.ts` (D9's sensitive diff, §14's readable diff), `resolve.ts` (three layers), `injection.ts` (§8) |
| `blueprints/` | §25 descriptors and the registry |
| `db/` | Drizzle schema and client, `locks.ts`, `testing.ts` — `withRollback` isolates a test from its OWN writes only; `resetDatabase` is for a test that drives a real server, whose rows are committed |
| `runtime/` | §11's `Driver`, the fake driver, **`driver-contract.ts`**, the state machine; `runtime/docker/` is the one real driver |
| `routing/` | §23 hostnames → Caddy routes; readiness and identity probes run from inside the edge. `caddy.ts` speaks `node:http`, not `fetch` — Caddy's admin API refuses any request carrying an `Origin` header |
| `build/`, `services/`, `source/` | the build context, §12's gates and scan — and `secret-patterns.ts`, THE list of secret rules every path reads (the D5 plan's Task 11); per-app Mongo; D5's `SourceDriver` — bare git repositories (driver 1), `driver-contract.ts` (the suite every driver passes) and `github/` (driver 2 — a mirror, tokens in memory; `MANIFEST_SOURCE_DRIVER=github`, the D5 plan's Tasks 7–8; its sync reports to ONE observer, enforces private and scans every new commit, Tasks 9–11; `main` protected where GitHub will, Task 12), `plumbing.ts` (THE write path: every commit, on both drivers, planned against the base tree and built with no worktree — the authoring API plan's Task 3), `reading.ts` (THE read path: a tree, a text file, a first-parent history and one commit's changes, over a git dir each driver resolves — that plan's Task 4), `pre-receive.ts` (driver 1's secret-scanning hook, RENDERED from `build/secret-patterns.ts`), `scan-commits.ts` (the added lines of new commits; the pre-push scan and the path check), `queue.ts` (the webhook's serial queue) and `testing.ts` (a person pushing, rewriting or deleting on the fake; a recording observer) |
| `identity/`, `sso/`, `secrets/` | sessions and Manifest's own SAML SP; per-app SP registration in the IdP; envelope encryption, and `app-env.ts` — an app's declared secrets, write-only (`env:<NAME>`; the authoring API plan's Task 8) behind `resolver.ts`'s bound resolver |
| `projects/` | §13 authorization (`authz.ts`), the repository, reserved labels, `checkSlug`, §26's `fleet.ts`, and `source-attribution.ts` (who made a commit through Manifest, from `repository.committed` — the authoring API plan's Task 6) |
| `releases/` | build (the `BuildRunner` a build runs on), release, deploy, retire, recover-at-boot; the approval, its stored preview (`preview.ts`'s `factsOf`) and `summary.ts` — the summary as STRUCTURED OUTPUT (the D5 plan's Task 13); `lifecycle.ts` — §11's archive, restore and delete, `TEARDOWN_STEPS`, `DELETE_STEPS` and the boot's `finishTeardowns` (the front-end enablement plan's Tasks 11–12) |
| `observability/` | events and every event type's payload schema (`event-schemas.ts`) and published example (`examples.ts`), redaction, build logs, Incidents, the event bus |
| `ai/` | the LiteLLM admin client, D17's catalogue, app keys |
| `launch/` | §13's first-launch checklist, computed from what exists and never stored (`readiness.ts`) |
| `docs/` | `load.ts` — `docs/api/` read at boot, bounded, and refused naming the page (the authoring API plan's Task 11) |
| `api/` | the Fastify server; `contract/` (`defineRoute`, the OpenAPI document, and `docs.test.ts` — the reference's completeness gate, the authoring API plan's Task 9); `representations/`; `routes/` (and `routes/webhooks.ts`, GitHub's deliveries — a plugin, not a contract route; `routes/docs.ts`, the documentation served, with `served-docs.ts` building what it answers at boot — Task 11); `webhook-signature.ts`; `spec-validation.ts` (`validateAndRecord` — the validate route and a push); `error-codes.ts`; CSRF; idempotency; **`authz-contract.ts`** |

**Read first:** `runtime/driver.ts` and `runtime/driver-contract.ts` — everything is built against them — then
`runtime/docker/driver.ts`, `api/server.ts` for how a request becomes an actor, `projects/authz.ts`, and
`api/contract/route.ts`.

### What the platform keeps true

Each of these was built, measured and paid for; the record is in the plan named. **A change that breaks one is a
defect even when every test is green.**

**Identity**

- **Manifest is its own SP (§9), and there is no login shim.** `GET /auth/login` sets `manifest_login` and sends
  its nonce as `RelayState`; `POST /auth/saml/callback` refuses an assertion not bound to the browser that started
  the sign-in (`401 SAML_LOGIN_NOT_BOUND`) before node-saml validates it, then lands on `/` or a same-origin
  `?returnTo=`. Sessions are stateless signed cookies that carry the role they were issued with. Tests sign their
  own with `identity/testing.ts`. *(P4a Task 14, P5a Task 4.)* **A BROWSER REFUSED AT `/auth/*` IS SHOWN A PAGE, NEVER
  RAW JSON** (FE-17; the front-end enablement plan's sitting 10): a request to `/auth/*` whose `Accept` names `text/html` —
  every navigation's, no script's by default — is answered `api/auth-page.ts`'s short page with the envelope's own status,
  message, hint and CODE, relative links only (*Sign in again*, *Go to the start*), `no-store`, CSP `default-src 'none'`;
  every other caller keeps the envelope byte for byte. The error handler's two branches and `GET /auth/logout`'s refusal use
  it.
- **The control plane's SAML library is `@node-saml/node-saml` 5.1.0, NOT the `passport-saml` the blueprint pins**,
  which audits one Critical with no fix. Three node-saml defaults fail open and are set explicitly — sha1 signing
  and digest, `validateInResponseTo: never`, `emailAddress` — and nothing scans the control plane's own dependency
  tree (§12's gate scans app images). *(P4a.)*
- **The platform's SP row is written at every boot**, through `renderSpMetadata` — the one renderer of an
  `entity_data` document — with its ACS from `MANIFEST_CONTROL_PLANE_ORIGIN` (default
  `https://console.manifest.internal`) and its keypair in `infra/sp/control-plane.{key,crt}`. The Docker tier boots
  control planes on 7188/7189 that re-register it at a loopback ACS: **restart the control plane after `pnpm
  test:docker`.**
- **The Manifest IdP releases attributes by `core:AttributeLimit` at priority 50 on friendly names, then
  `core:AttributeMap` at 60 to the OIDs UBC sends — the order is load-bearing** (reversed, it releases nothing),
  and `make verify` asserts it. `ssp_ro` reads metadata and cannot write it; a CHECK makes a row with an empty or
  absent `attributes` — which S2 measured releasing everything — unrepresentable.
- **Four settings read like controls and are not**: SimpleSAMLphp's `validate.authnrequest` (a present signature is
  always validated), node-saml's `wantAssertionsSigned` and `wantAuthnResponseSigned`, and the blueprint's
  `attributeConfig` (its bridge reads the OID first). §9's release enforcement is the control. *(P4a, measured.)*
- **Signing out of an app ends BOTH sessions and lands back on the app** (fixed 2026-09-16, found in a browser — no
  app had ever signed anybody out). The IdP trusts exactly §23's app hostnames as a `ReturnTo` (`trusted.url.regex`
  in `infra/idp/config/config.php`; `make verify` holds both directions), and the blueprint's
  `cwl.logout(returnTo)` answers the IdP's own `LogoutRequest` at `auth.logout` — which is also the
  SingleLogoutService the platform registers — with a `LogoutResponse`, addressed through `SAML_LOGOUT_URL`, which
  the strategy is now given. `make demo-identity`'s step 9 signs the student out and the instructor in through the
  same cookie jars.
- **§20's STEP-UP IS A SECOND SAML ROUND TRIP, AND IT GUARDS FIVE CAPABILITIES** (P6a Task 8/9). `GET
  /auth/step-up` sends the same signed AuthnRequest with `ForceAuthn="true"` — a SECOND `SAML` instance inside the
  one `SamlSp`, because `forceAuthn` is a constructor option in node-saml 5.1.0 — bound to its browser by a
  `manifest_stepup` cookie, told apart from a sign-in at the SHARED ACS by whose nonce matches `RelayState`, and
  validated by the instance that issued the request because `validateInResponseTo` caches per instance. **One
  entityID and one ACS, so the IdP's registration does not change.** The callback refuses an assertion for anybody
  but the person already in hand, and stamps `steppedUpAt` onto the existing session cookie **without extending its
  expiry**. `assertStepUp` refuses `PRIVILEGED ∪ {release:approve}` outside a ten-minute window with `403
  STEP_UP_REQUIRED`. **A token is refused unless it carries a human-confirmed grant for that exact capability** —
  D24's loop is what stands in step-up's place for an agent, because a token can never step up. **It inherits §20's
  recorded divergence: a stepped-up session cannot be revoked before its own expiry**, which is why the window is
  short and is enforced at ASSERT time.
- **A LOGOUT MESSAGE IS INFLATED NO FURTHER THAN 64 KiB, AND THE ONE BOUNDED IS THE ONE node-saml WILL READ** (the front-end
  enablement plan's sitting 4). `GET /auth/logout` is unauthenticated, and node-saml 5.1.0's `validateRedirectAsync` inflates
  with no bound and parses the XML twice BEFORE the signature — a query inside Node's 16 KiB header limit inflated to 8 MiB and
  held the control plane 1.5 s. `identity/saml.ts`'s `requireBoundedMessage` bounds whichever message node-saml reads
  (`SAMLRequest` when present), on both paths; the SP path refuses a query carrying both (its review's C1); the InResponseTo
  pre-check reads each tag once (`answersARequest`). The tests assert the operator line's reason — the code is the same
  whatever refused.
- **The three-hop CWL sign-in is ONE function, `idp_login` in `infra/lib/idp-login.sh`.** It proves the SP row and
  the AuthnRequest signature; it does not prove the session authenticates anybody, so **a caller's identity check
  is the assertion**.
- **THE CWL LOGIN NAME IS ASKED FOR, NEVER REQUIRED, AND HELD BY WHOEVER SIGNED IN WITH IT LAST** (the front-end
  enablement plan's sitting 5). `CONTROL_PLANE_ATTRIBUTES` names `uid` (five names — `sso/platform.test.ts` and
  `boot.docker.test.ts` pin them), `toIdentity` reads it lowercased, and `upsertUserFromAssertion` keeps it as the unique
  `users.cwl_login` — **clearing it from any other row first**, because UBC can reassign a login and the new holder's
  first sign-in otherwise fails on the old row (a `500`, measured), and **never overwriting it with null** when an
  assertion lacks `uid`. It is how an owner FINDS a colleague (`addMember` by exactly one of `puid`, `cwlLogin`,
  `email`), never how anybody is identified: the PUID is. **Only the real IdP enforces the attribute list** — an
  in-process test IdP signs whatever it is handed, so a unit test cannot see `uid` dropped from it
  (`identity/saml.docker.test.ts` can).

- **EVERY ENVIRONMENT'S APP IS GIVEN ITS SP KEY, THE SANDBOX'S INCLUDED, AND EVERY SIGN-IN IS SIGNED** (the faculty front-end's
  FE-37, `c4e10cc`, made by its session at Rich's word; §8 as Spec action 9 amended it, `d82b3a2`). Every app's row in the Manifest
  IdP requires a signed AuthnRequest (`renderSpMetadata`'s `'validate.authnrequest': true`), so `spec/injection.ts` renders
  `SAML_PRIVATE_KEY_PATH` and `releases/release.ts` places the key file in EVERY environment — before it, a sandbox app sent an
  unsigned request and the IdP answered `500` *"no signature found on message"*: no draft app could sign in. The blueprint still
  reads the variable as allowed-absent, so an app deployed before the change starts — and signs in only after a redeploy.

- **MANIFEST SIGNS A PERSON IN ON EITHER OF ITS TWO ORIGINS, EACH JUDGED BY THE ORIGIN A REQUEST ARRIVED ON** (the front-end
  enablement plan's sitting 6; §21, §20 and §9 as Spec action 2 amended them). `config.origins` is the console's first, then
  `MANIFEST_FRONTEND_ORIGIN` (`https://app.manifest.internal`; empty disables it). `api/origins.ts`'s `originOf` answers the
  configured origin whose host is the request's `Host` — the edge preserves it — or the FIRST, **never the request's own
  `Origin`**; CSRF, the sign-in, the step-up, the cookies' `Secure`/`SameSite` and the sign-out all read it. **One SP entity**
  lists an assertion-consumer URL per origin (index 0 the console's — the IdP's default for a URL the row does not list,
  `[M3]`) and ONE SingleLogoutService, the first's; **one SAML client per origin** (`createSamlSpFor`), so each AuthnRequest
  names its own ACS and each InResponseTo cache holds only its own requests — an assertion answering one origin's request is
  refused on the other even when bound. A sign-out sends its origin as `RelayState`; the IdP answers at the console's SLO,
  which validates the answer with the client that `RelayState` names (only exactly one of `config.origins`) and sends the
  browser home. **Each origin's cookie is its own**: a session on one is not a session on the other, and a sign-out the IdP
  begins reaches only the console's origin. A browser sign-in on `app`, Rich typing, is the proof (2026-09-27). **The
  `RelayState` read there is the one the signature covers** (sitting 6's review, M2; fixed in sitting 10):
  `signedRelayState` takes the FIRST raw query token matching `/RelayState/` — node-saml 5.1.0's own `getParam` — never
  Fastify's decoding, which also reads a `Relay%53tate=` no signature covers.

**Data, secrets and audit**

- **A PROJECT'S `name` IS WHAT PEOPLE READ AND NOTHING ELSE** (the front-end enablement plan's sitting 5): the slug when
  none is given, one visible line of at most 80 characters with no control character, line separator or bidirectional
  mark, changed by `updateProject` — and it reaches no hostname, SP entity, Docker name or repository: every one of those
  is derived from the SLUG, which never changes. `projects.name` is `NOT NULL`, so **a raw `INSERT INTO projects`
  anywhere — a script included — must name one** (`make verify`'s audit probe did not, and read its own failed seed as an
  editable audit log: F16).
- **The control plane connects as `manifest_app`, never as `manifest`**: `manifest` is `POSTGRES_USER` and so a
  superuser, and a superuser bypasses every grant — which made §20's append-only audit unimplementable. **Three
  database URLs, none derived from another**: `MANIFEST_DATABASE_URL` (the app role), `MANIFEST_ADMIN_DATABASE_URL`
  (migrations and the test harness's `TRUNCATE` only; `src/` never reads it) and `MANIFEST_IDP_DATABASE_URL`.
  `vitest.env.ts` derives all three from `.env`.
- **`audit` is its own schema** — `events`, `build_logs` and `incidents`, append-only by grant, with foreign keys
  `ON DELETE RESTRICT`, because a referential action runs with the referenced table's privileges and a cascade let
  the application erase the trail. `recordEvent` takes its redactor as a PARAMETER, so nothing writes an unredacted
  row, and **every event goes through `publishEvent`**, which records it and streams it; a database CHECK closes
  the event types. **No event's sentence names a PUID** (P6b's F14; the authoring API plan's Task 12 found five more):
  a person is named through `projects/source-attribution.ts`'s `personName` — a blank name is *"A Manifest user"* —
  while the publishers that take a `puid` KEEP it in their input, because requiring one is what makes a token actor a
  type error at the launch, approval and pending-action routes.
- **AN APP'S RECENT OUTPUT IS READ IN THE SANDBOX ONLY** (§14; the front-end enablement plan's sitting 2, and FE-24's code in
  its sitting 10). `getInstanceOutput` (`output:read`) reads a SANDBOX instance's last lines through THE reader
  (`observability/output.ts`'s `readRecentOutput`), redacted as `Incident.log_tail` is; a production instance is `403
  INSTANCE_OUTPUT_PRODUCTION` and a staging one `403 INSTANCE_OUTPUT_STAGING` — each decided from the environment's KIND
  after the capability check and BEFORE the instance's state or the driver is read, so a laptop's staging (the fake sign-in)
  is refused as UBC's will be; a gone or never-started sandbox instance is `409 INSTANCE_OUTPUT_UNAVAILABLE`.
  `InstanceOutput.environmentKind` keeps `staging` in its enum so a client written against earlier 1.4.0 compiles, and
  never answers it. The authorization matrix has a row per kind.
- **§14'S REDACTOR READS A LINE ONCE** (the front-end enablement plan's sitting 4, `[S3]`'s class). It reads an app's output
  (up to 1000 lines of 8 KiB, joined), an Incident's tail and every build-log line, and three of its heuristics and
  `trimCut`'s tail were quadratic — the PEM rule 11 s for 1 MiB of headers, the JWT ~100 s, the URL rule ~280 s for 1 MiB of
  `a.`, the tail 10.9 s at 128 KiB. `HEURISTICS` are now functions (PEM header-then-footer, stopping when none follows; JWT
  from its first dot, its start from the lookbehind's `d` index; URL from its `://`), each held to its old expression by
  `redact.test.ts`'s oracle. **A new rule that can begin again inside its own run is the same defect** — TRAPS.md has the shape.
- **The master key and the GitHub App key are ONE custody class, enforced** (§20; the D5 plan's Task 3):
  `secrets/custody.ts`'s `assertOwnerOnly` refuses a key file its group or others can touch, or another user owns,
  and both `loadMasterKeypair` and `loadAppKey` call it — **so a control plane handed a `644` master key refuses to
  boot** (`SECRET_MASTER_KEY_PERMISSIONS`, naming the file; measured). A test that writes a key file must `chmod 600`
  it. `make up` mints the fake App's four credentials into `infra/secrets/` beside `master.key`, once.
- **`secrets/` is libsodium envelope encryption over a `secrets` table**; service credentials and each app's
  `SESSION_SECRET` are STORED, not derived; `process.env` is scrubbed at boot. Tests use `withSecretScope`
  (`secrets/testing.ts`). **`deriveCredentials` survives on purpose**: a service created before credentials were
  stored still holds the derived password, which the store adopts on first call — deleting it before every existing
  service has been deployed once is the trap P4a's Decision 8 describes. **`infra/secrets/master.key`,
  `infra/idp/cert/`, `infra/sp/` and the Caddy CA are minted by `make up`, gitignored, and NOT removed by `make
  reset`.**
- **THE IDEMPOTENCY RECORD KEEPS NO HASH A READER OF THE DATABASE COULD CHECK A GUESS AGAINST** (the authoring API plan's
  sitting 5, F3). `replayOrStore`'s request fingerprint is an HMAC under `config.sessionSecret` (a REQUIRED `hashKey`),
  never a bare SHA-256 of the body — `setAppSecret`'s body IS the value. A retry spanning a `MANIFEST_SESSION_SECRET`
  rotation answers `IDEMPOTENCY_KEY_REUSED`. **AND NO RECORD HOLDS A CREDENTIAL** (that plan's Task 12, sitting 9 — sitting 5's
  F4, Rich's option (a)): a route whose answer carries one declares `withholdOnReplay` — `mintToken` alone — so its record
  keeps `stored(answer)` (the token, never its secret) and a retry with the same key and body throws `refuse(stored)`, `409
  TOKEN_ALREADY_MINTED` naming the token; the fingerprint is still checked first. Migration 0032 (CUSTOM) scrubbed the secrets
  stored before it — measured on a real row, the token still authenticating. Every other route still replays its first
  answer. Nothing deletes a row (a retention is named, not built). **AND THE FINGERPRINT IS THE REQUEST'S PATH PARAMETERS AS
  WELL AS ITS BODY** (the plan's whole-branch review, Important 2 — sitting 10): the record is keyed on the route TEMPLATE, so
  a body-only fingerprint let one key on `setAppSecret` for another name or environment, or two bodyless clears, replay the
  first resource's answer and do nothing. `IdempotencyParams.params` is REQUIRED (`request.params`), the HMAC's prefix is
  `v2`, and a retry spanning the change answers `IDEMPOTENCY_KEY_REUSED`.
- **A migration is always its own file** — drizzle-kit keeps a journal and never re-runs an applied one — written
  by `pnpm --filter @manifest/control-plane db:generate` from `db/schema.ts` and applied with `db:migrate`.
  **`db:migrate` reads `MANIFEST_ADMIN_DATABASE_URL` FROM THE ENVIRONMENT, and nothing exports it for you**: run
  bare, from the root or the package, it fails `Please provide required params for Postgres driver: [x] url:
  undefined`, which reads like a broken config rather than a missing export. `vitest.env.ts` derives the three URLs
  for the TEST harness only. From the repo root:
  ```bash
  set -a; . ./.env; set +a
  MANIFEST_ADMIN_DATABASE_URL="postgres://manifest:${POSTGRES_PASSWORD}@127.0.0.1:7103/manifest_control" \
    pnpm --filter @manifest/control-plane db:migrate
  ```
  RUNBOOK's *Running the control plane* exports it along with everything else the process needs; this is the
  one-line form for a migration on its own. *(Measured in P5b sitting 3, which applied 0015.)*

**Build and deploy**

- **§8's injection contract is ONE function with ONE producer** — `spec/injection.ts`'s `renderInjection` — and
  `deployRelease` adds nothing; service variables are read out of the endpoint the driver returned, and §8's two
  files reach the container through `InstanceSpec.files` — the IdP certificate `0444`, the SP key `0440`,
  root-owned with the blueprint's `run_as_uid` as its group. **§16's drift tier reads the blueprint's SOURCE**,
  comments stripped, against the renderer's output; `ALLOWED_UNSET` and `PLATFORM_ONLY` are deliberately empty.
  *(P4a Tasks 10–13.)*
- **The build path goes through D5's driver, never a path** (the D5 plan's Task 2). `RepoRef` is `{ projectSlug,
  provider }` — no path, no URL — so the builder and the code reviewer ask `SourceDriver.localGitDir(repo, sha)` for
  the commit, present in a bare repository on this machine, and a reader of a laptop path off a reference is a `tsc`
  error. `localGitDir` refuses anything but a full 40-character id the repository has (`409
  SOURCE_COMMIT_NOT_FOUND`, which `startBuild` answers before anything starts) and another driver's reference
  (`SOURCE_PROVIDER_MISMATCH`). `source/driver-contract.ts`'s `describeSourceDriver` is the contract; every driver
  runs it unchanged.
- **A project's repository is named ONLY through `repositoryOf`, and another driver's project is refused** (the D5
  plan's Task 8, Decision 3). `source_repositories` (migration 0024, backfilled `local`) records each project's
  provider, full name and web address; `builds`, `validateSpec` and the approval preview's reviewer ask
  `projects/source-repositories.ts`'s `repositoryOf`, which answers `409 SOURCE_PROVIDER_MISMATCH` naming both
  drivers. **Measured: without it, a GitHub-mode control plane BUILT a driver-1 project** — both drivers keep
  repositories at `config.reposRoot`, so driver 1's bare repository sits exactly where driver 2's mirror would.
  `MANIFEST_SOURCE_DRIVER=github` boots driver 2 (the boot line says `"source":"github"`): a mirror fetched with TWO
  refspecs — `refs/heads/*` non-forced (the history an approved release names) and `+refs/heads/*:refs/manifest/upstream/*`
  forced (what GitHub has NOW, which every read of the head uses), ONE fetch at a time per mirror (concurrent reads
  after a push failed five in six until it was — sitting 4's F19) — installation tokens per repository and purpose,
  in memory and in git's ENVIRONMENT only (a canary and an argv recorder hold it), and **`503 SOURCE_UNREACHABLE`
  offline while a mirrored commit still builds**. `readFile` names a COMMIT on both drivers: one the repository
  lacks is `SOURCE_COMMIT_NOT_FOUND`, never "no such file".
- **GitHub's deliveries are verified BEFORE anything reads them, and every refusal has its own code** (the D5 plan's
  Task 9, Decision 9). `POST /webhooks/github` — unversioned, reached at `127.0.0.1:7100` as the edge reaches the
  control plane, never through the edge — checks `X-Hub-Signature-256` over the RAW bytes first (its plugin drops EVERY
  inherited content-type parser and reads exactly `application/json`: with the registry realm's form parser inherited, a
  form-encoded delivery was `500` — sitting 5's F1), and REPLIES its refusals, because `server.ts` flattens a thrown
  `401` to `UNAUTHENTICATED`: absent (a SHA-1-only delivery included) `WEBHOOK_SIGNATURE_MISSING`, `…_MALFORMED`,
  `…_INVALID`, a signed non-JSON body `400 WEBHOOK_PAYLOAD_INVALID`, and driver 1 `404 WEBHOOKS_NOT_CONFIGURED` to
  everyone. A verified delivery is recorded ONCE (`webhook_deliveries`, 0025) and its sync runs off the request on ONE
  serial queue (`ServerDeps.sourceSync`); a push whose `main` moved is VALIDATED, never built. The secret is the App
  key's custody class (`loadWebhookSecret`, refusing an empty one).
- **Every advance of driver 2's mirror goes to ONE required observer, once** (Task 9, Decision 11).
  `createGithubSourceDriver` has no default for `observer` — omitting it at boot is a `tsc` error — and
  `createSourceObserver({ db, bus })` publishes `repository.pushed` and `repository.history_rewritten`, read from the
  SHADOW's porcelain so a rewrite is reported once and the next push is a push. The observer runs inside the mirror's
  turn (`exclusively`), and a report that fails fails the read that synced. **The creation's first fetch is not
  reported**: `audit.events` is `ON DELETE RESTRICT`, so an event there would block `deleteProject`. `localGitDir` pins
  every commit it hands out (`refs/manifest/kept/<sha>`).
- **A repository found PUBLIC is made private again, reported, and never built while public** (Task 10, Decision 12).
  Every sync — webhook, read or Manifest's own commit — reads GitHub's visibility (failing CLOSED), PATCHes a public one
  private with an `administration` token for that repository alone, READS AGAIN, and keeps the last read on the mirror;
  `localGitDir` refuses `409 SOURCE_REPOSITORY_PUBLIC` while it says public, offline too; `repository.visibility_enforced`
  reports it (0026).
- **A secret-shaped value is refused or found on EVERY path Manifest can see, by ONE list** (the D5 plan's Task 11,
  §20's sentence as applied). `build/secret-patterns.ts` is the list — the gate's seven rules, then GitHub's stateless
  `ghs_<APPID>_<JWT>` token (which neither older rule catches) and the fine-grained PAT, APPENDED because the first rule
  that matches a line names it. **Manifest's own commits** are scanned before anything is written, on both drivers
  (`409 SOURCE_SECRET_DETECTED`, naming `path:line` and the rule, never the value). **A push to a driver-1 repository**
  is refused by that repository's `pre-receive`, RENDERED from the list — a `sh` half that finds Node (the control
  plane's own binary first, then `PATH`, else it refuses and says why) and a JavaScript half walking `git log -p --cc`
  of exactly the incoming commits (`--cc`: a merge's OWN additions; plain `-p` shows a merge no diff). **A push straight
  to GitHub** is found when the mirror learns of it, whatever caused the sync: every commit the shadow has and no
  `refs/manifest/scanned/*` reaches, reported to the one observer as `repository.secret_detected` — the `scanned` refs
  move only AFTER the report, so it is at least once. `source/pre-receive.test.ts` holds the hook's loop to `scanText`'s
  answer over a shared corpus with a real push. **The build gate still refuses the tree**, so a secret GitHub has is
  never deployed. *(A file git calls binary — a NUL in its first 8000 bytes — is skipped at push time and read by the
  build gate: named, not fixed. **Manifest's OWN binary writes** — `createCommit`'s `encoding: base64`, the front-end
  enablement plan's Task 4 — are scanned before they are written by their printable runs of 16 bytes or more
  (`writesOf` → `printableRuns`), on the route and in both drivers: **the only layer a binary write meets** (measured, that
  task's control (b): driver 1's hook let a PDF carrying a key land). Text a PDF COMPRESSES, UTF-16 text and a PNG's
  `zTXt` chunks have no printable run and are not seen — named in `printableRuns`, not fixed.)* **And the mirror's scan reads EVERY new commit, to the end** (the authoring API plan's
  Task 12): oldest first, in batches of 1000, a batch past 20 MiB of patch split in half — and ONE commit whose own patch
  is past it is `unscannable`, reported as `repository.scan_incomplete` (commit ids only) before the `scanned` refs move,
  never counted read. (Until then one scan read the newest 1000 and marked the branch scanned.) **And every rule reads a line
  ONCE** (the front-end enablement plan's sitting 4, `[S3]`): the JWT and installation-token rules begin at the token's FIRST
  DOT and read back with a lookbehind — written as they read, a crafted 1 MiB line took 100 s, the event loop blocked, three
  times per commit. One regex source, so the hook inherits it; `secret-patterns.test.ts` holds both to the old rules' answers
  and the corpus's 1 MiB line holds the hook and the gate. *Named, not fixed*: a run of `[A-Za-z0-9_-]` past ~5.33 MiB followed
  by two dotted parts overflows V8's backtrack stack — only a PERSON's push reaches it (driver 1's hook refuses, *"scan could
  not run"*; driver 2's sync throws before its observer).
- **A COMMIT IS BUILT WITH GIT PLUMBING AND NO WORKTREE, ON BOTH DRIVERS** (the authoring API plan's Task 3; *Read this
  first* 1 of that plan measured the worktree's hole: a symlink a person pushed redirected a write outside, and one to
  `.git` ran `core.fsmonitor`). `SourceDriver.commit(repo, { base, changes, message, author, dryRun })` — `commitFiles`
  is gone — goes through `source/plumbing.ts`: `planChanges` refuses, against the BASE's tree, every shape `update-index
  --index-info` would silently replace (`409 SOURCE_PATH_CONFLICT`, `SOURCE_PATH_NOT_FOUND`, `SOURCE_NOTHING_TO_COMMIT`) — and,
  since the front-end enablement plan's Task 5 (F7), a file and a directory at one path written in ONE commit;
  `buildCommit` writes blobs from numbered scratch files in a scratch bare repository that BORROWS the repository's objects
  through `alternates`, checks the tree written against the plan (`SOURCE_GIT_FAILED` otherwise), and commits with Manifest
  as committer; the driver pushes it NON-FORCED — into driver 1's bare repository, where its hook runs, or to GitHub from
  driver 2's mirror. **`base` must be `main`'s head, or `409 SOURCE_CONFLICT`** — and a refused push reads the BRANCH, so a
  race lost inside git's receive-pack is a conflict too. A project's seed goes the same way with no base. **Nothing in the
  control plane writes a repository's file at its own path**; tests commit through `source/testing.ts`'s `writeFiles`.
- **EVERY READ OF SOURCE NAMES A COMMIT, AND SAYS WHICH** (the authoring API plan's Tasks 4 and 5). `SourceDriver`'s
  `resolveRef(repo, ref)` turns a branch name or a full commit id into the commit it names NOW — driver 2 syncs first —
  and `listTree`, `readText`, `history` and `describeCommit` read AT that commit (`source/reading.ts`); the four `/v1`
  operations (`getTree`, `getFile`, `listCommits`, `getCommit`, `project:read`) answer the commit they read, which is what
  a client sends back as the base of a write. **A branch name is only ever `refs/heads/<name>`, checked first** — without
  the check `main^` resolved to the parent (measured) — and a missing one is `409 SOURCE_REF_NOT_FOUND`; a repository
  that is not there is `SOURCE_GIT_FAILED` on both drivers, never a missing branch. **A path is read LITERALLY and
  EXACTLY** — `ls-tree` takes a path as a PATHSPEC, so without both `:(top)README.md` read `README.md` and `src/` read
  what is inside `src` — and **a symlink or a submodule is reported, never followed** (`SOURCE_PATH_NOT_A_FILE`). A file
  past 1 MiB is refused from its SIZE before its blob is read; a binary or non-UTF-8 one is `SOURCE_FILE_NOT_TEXT`, and
  a text file's bytes come back exactly, byte-order mark included. **`getFile?encoding=base64` reads ANY regular file up
  to 2 MiB as its bytes** (`SourceDriver.readBytes`, sharing `readTextIn`'s lookup — the front-end enablement plan's Task
  4); every `SourceFile` says its `encoding`. **`getCommit` answers at most 1000 changes, the first by path, with `truncated`**,
  and git's line counts (`numstat`) are read for the LISTED paths only — `getTree`'s 10,000 and `getCommit`'s 1000 — as literal
  arguments in runs under `ARG_MAX`, never a diff of the whole tree (that plan's Task 5, F9; `git diff` has no
  `--pathspec-from-file`). **The history is FIRST-PARENT**: a walk of both
  parents lost a commit when a page ended at a merge's newer side branch (measured), and a merge is described against
  its first parent. `headCommit` is kept as `resolveRef`'s alias.
- **AN API COMMIT IS CHECKED BEFORE ANYTHING IS WRITTEN, AND ATTRIBUTED BY THE PLATFORM'S OWN RECORD** (the authoring API
  plan's Task 6). `createCommit` (`POST /v1/projects/{projectId}/commits`, **`source:write`** — its own capability, never
  `project:write`; mintable, neither privileged nor person-only) takes writes and deletions against a REQUIRED
  `baseCommit`, in Decision 6's order: the request schema (the path and text rules, stated once as `source/plumbing.ts`'s
  `pathProblem` — `400 REQUEST_INVALID` — and, since the front-end enablement plan's Task 4, a write's `encoding: base64`:
  canonical, at most 2 MiB decoded, NOT text, at a path ending in one of the ten kinds' extensions, and one of PNG, JPEG,
  GIF, WebP, ICO, PDF, WOFF, WOFF2, TTF or OTF by its first bytes — `source/binary.ts`; `Change` carries the BYTES), **secret-shaped values in the files AND the message** (the message goes into
  git history and its subject into an event; the redactor misses an AWS key id — the plan's sitting 4, F18), the driver's
  own dry run (base, planner, tree), then the `manifest.yaml` the commit would leave, validated with
  `validateAndRecord`'s own function (`validateManifestText`) — **an API commit never leaves the manifest invalid**:
  `422 SPEC_INVALID`. `dryRun: true` answers exactly what would change and writes, records and announces nothing. Its own
  8 MiB `bodyLimit`; every other route keeps Fastify's 1 MiB. **The message keeps text's rules** (F8): well-formed Unicode, no
  control character but `\n` and `\t` — `400 REQUEST_INVALID`, before anything is scanned. **Who made a commit is `repository.committed`**, read back
  as `madeThrough` on `listCommits`/`getCommit` (`projects/source-attribution.ts`, one query per page) — never git's
  author text, which a person's push can forge; the author is the person's NAME at `<userId>@users.manifest.internal`,
  never a PUID or a real address. A refused secret publishes `repository.secret_refused` — where and which rule, never
  the value, never for a dry run. **Every validation publishes `spec.validated`** — creation, `POST …/spec`, a pushed
  `main` and every API commit. **A COMMIT THAT LANDED IS ALWAYS ANSWERED `201` AND RECORDED** (the whole-branch review,
  Important 1 — sitting 10): after the push, `repository.committed` goes FIRST, and a validation that cannot be recorded
  answers the check made before the push with `appSpecId: null` (a build of it validates it first) — each failure an
  operator line naming the commit. A throw there had answered 5xx for a commit on `main`, so the documented same-key retry
  was `SOURCE_CONFLICT` against the client's own commit and its `madeThrough` read `null` for ever.
- **A BUILD OF A COMMIT IS BUILT WITH THAT COMMIT'S OWN MANIFEST, AND THE MANIFEST NAMES THE PROJECT'S PIN** (the plan's
  Task 7). `startBuild` with a `commitSha` uses that commit's newest validation, or validates it first (recorded and
  announced like any other); it paired the commit with the project's NEWEST spec until 2026-09-26, whatever commit that
  came from. With no `commitSha` it still builds the newest RECORDED validation's commit (§4 trap 23), and its
  description says so. `ValidationContext.projectBlueprint` is REQUIRED, so a manifest whose `blueprint:` is not the
  project's pin — compared whole, major included — is `SPEC_BLUEPRINT_NOT_PINNED` at every validation.
- **AN APP'S DECLARED SECRET IS SET WRITE-ONLY, PER ENVIRONMENT, AND A DEPLOY NEVER STARTS AN APP WITHOUT ONE** (the
  authoring API plan's Task 8). `listAppSecrets`, `setAppSecret` (the API's first `PUT`) and `clearAppSecret` on
  `/v1/environments/{environmentId}/secrets` answer NAMES — declared by the environment's newest valid manifest (resolved
  for its kind by `resolveEnv`) or set — and **never a value**. Values are `env:<NAME>` in `secrets` (the third namespace
  beside `app:` and `service:`), so §14's redactor covers them; a value is at least **six characters**, the redactor's own
  `MIN_SECRET_LENGTH`, because a shorter one would be rendered and never redacted. **`secret:write`** — owner,
  collaborator, administrator; mintable — sets sandbox and staging; **production is a stepped-up session's alone**
  (`secret:write` is in `STEP_UP_GUARDED` and NOT in D24's four; a token is `TOKEN_CREDENTIAL_REFUSED`). **`deployRelease`
  refuses a release whose frozen config declares a secret with no value in that environment — `409
  RELEASE_SECRET_NOT_SET`, naming the names, before anything exists** — and `renderInjection` renders declared values only,
  refusing a missing one itself (`INJECTION_SECRET_MISSING`). It DROPPED them silently until 2026-09-26.
- **MANIFEST NEVER WRITES INSIDE A REPOSITORY'S OWN `.git`, NOR OUTSIDE IT** (the D5 plan's final review, Important 1; the
  authoring API plan's Task 3). `assertWritablePaths(paths)` (`source/scan-commits.ts`, beside `assertNoSecrets`) refuses
  any path with a `.git` component, in any case — macOS folds case — and any that is not inside the repository (a leading
  `/`, an empty, `.` or `..` component, a NUL) as `409 SOURCE_PATH_ESCAPE`, before anything is built, on both drivers'
  seed and commit paths; the contract suite holds both.
- **A PUSH IS VALIDATED EVEN WHEN A READ TOOK ITS ADVANCE FIRST** (the final review, Important 2; sitting 5's F9). A read
  that syncs between a person's push and GitHub's delivery reports the push, and the delivery's own sync then moves
  nothing — so the receiver also reads the verified payload's `ref`, and when it is `main` validates GitHub's `main` NOW
  unless a spec is recorded for it (NOW, never the payload's `after`, so a late delivery of an older push never becomes
  the newest validation). **A validation publishes no event** — only project creation publishes `spec.validated` — so
  `GET …/spec` is where a pushed `manifest.yaml`'s answer is seen (the D5 plan's sitting 8, F6).
- **`SourceDriver.prepare()` runs at boot, before `listen`, and each driver prepares ONLY its own repositories** (Task
  11): driver 1 re-renders every bare repository's hook and git's protection; driver 2 re-writes every mirror's
  refuse-everything hook. Both drivers share `config.reposRoot`, so a mirror is told apart by the `manifest.fullName`
  its creation writes — without that, driver 1's boot would give a mirror the scanning hook and a clean push would land
  in it. The boot line's `sourceRepositoriesPrepared` is the count.
- **`main` IS PROTECTED ON BOTH DRIVERS, AND RECORDED HONESTLY WHERE GITHUB WILL NOT** (Task 12, Decision 13). Driver 1:
  git's `receive.denyNonFastForwards` and `receive.denyDeletes`, at creation and at every boot. Driver 2: branch
  protection `PUT` after the seed push — no reviews, no push restrictions — and where GitHub refuses (`403`: a private
  repository on a free organisation) the project records `mainProtected: false` with GitHub's own words, the route
  publishes `repository.protection_unavailable` LAST, and the console shows it in the refusal's style. **The mirror's
  non-forced history keeps what a release names on either plan.** `createRepository` answers `{ ref, link }`, and
  **`Project.repository` is REQUIRED** — `{ provider, fullName, webUrl (null on driver 1), mainProtected,
  protectionDetail }` (migrations 0027, 0028).
- **The GitHub fake answers what GitHub MEASURABLY answers, and a disagreement goes to the fake** (the D5 plan,
  Tasks 4–6, Decision 7). `@manifest/github-fake` imports nothing from the control plane (`boundary.test.ts`); every
  JSON answer it gives is validated against GitHub's own schemas (`conformance/github-schemas.json`, verbatim); and
  `conformance.test.ts` holds it to `conformance/golden.json` — **GitHub's recorded answers since the first real
  run, 2026-09-24** — on every `pnpm test`. `make github-conformance` re-records them at Rich's yes. **It keeps
  GitHub's defaults, not kinder ones**: a repository created without `private: true` is public.
- **A deploy reads only the `ResolvedConfig` frozen at release (§13)**, never `app_specs.parsed` — a second source
  of truth is the defect shape P3 paid for seven times.
- **A release freezes its BUILD's spec, and only its own project's build** (P6b Task 3, Decision 6). `POST
  /v1/projects/{id}/releases` resolves the config from `build.appSpecId` — the spec §7's build-time attribute check
  ran against, and one `startBuild` refused if it was invalid — never the project's newest spec row, which is
  somebody's NEXT commit. Both the route and `createRelease` scope the build to the project (**two independent
  reads**, each with its own test), so another project's build is `409 RELEASE_BUILD_NOT_FOUND`, indistinguishable
  from none.
- **§7's seven sensitive fields are ONE rule over what PRODUCTION runs** (P6b Task 3, Decision 5). `spec/diff.ts`'s
  `sensitiveFieldsBetween` reads a `SensitiveView`, built by two adapters: `sensitiveViewOfSpec` (a raw spec, with
  `environments.production.resources` folded over the top level — before P6b a raised production override reported
  no change) and `sensitiveViewOfRelease` (a release's FROZEN production config). `isSensitiveDiff` keeps its
  signature over the first; D9.2's re-escalation (`releases/approval.ts`'s `sensitiveChangeOf`) uses the second,
  against **the last approved release — each release's LATEST decision**, so a release approved and then rejected
  is never a baseline.
- **A redeploy interrupts nobody (P4c).** The new instance starts beside the old one, is proved ready from inside
  the edge, and takes the route with one in-place `PATCH`, under a per-environment advisory lock, with §6's `Route`
  record written; the retirer drains and removes the old one after the deploy returns. `recoverAtBoot` puts routes
  back from `Route` rows, ends interrupted deploys and finishes drains. **A release that never becomes ready is a
  `200` whose state is `failed`**, with §14's Incident, and the previous instance keeps serving. Sessions live in
  the app's own Mongo.
- **§12's scan gate blocks on a Critical or High that has a published fix**; findings with no fix, and the base
  image's, are **recorded on `builds.scan`** as a `ScanSummary` (P5a Task 13) — the scanner, its database's age
  (null when it could not say) and staleness, whether the base image was identified, and Critical and High counts
  for the three buckets, which are the only severities §12 classifies. Every release of that build shows it.
- **AI (P4b):** the gateway joins an app's network only when the app declares models; each instance's key is
  confined to `/v1/chat/completions`, `/v1/embeddings` and `/v1/models`, under a budgeted LiteLLM user
  `mf-<project>-<environment>`; the end-user identifier `sha256(puid ‖ project ‖ environment)` has one producer,
  the blueprint's `skeleton/ai/end-user.js`. AI is on unless `MANIFEST_AI_ENABLED=0`, and on refuses a boot with no
  master key.
- **AN AGENT OUTSIDE MANIFEST IS GIVEN A MODEL KEY CHARGED TO THE PERSON IT WORKS FOR, AND A PERSON DESCRIBING A NEW APP
  ONE THE PLATFORM PAYS FOR** (the front-end enablement plan's sitting 7; §10 as Spec actions 1 and 5 amended it). Every such
  key comes from ONE mint (`ai/agent-keys.ts`'s `mintCappedKey`): a `duration`, a `max_budget`, the frozen routes, never an
  empty model list (LiteLLM reads that as every model), and an alias DERIVED from its row's id — `mf-agent-<id>` on the
  person's LiteLLM user `mf-person-<userId>` (their month, `MANIFEST_AGENT_MONTHLY_USD`), `mf-intake-<id>` on the platform's
  `mf-platform-intake` (`MANIFEST_INTAKE_MONTHLY_USD`). **No row holds a key**: it is in the start's answer alone, and the
  idempotency record keeps the session without it (`withholdOnReplay`). An agent key's models are those D17 allows for the
  project — the newest valid manifest's classification, never below production's serving release — and, on a `confidential`
  project while `MANIFEST_AGENT_BUILDER_MODELS` is `capable`, the capable model too (below); an intake key's is ONE
  setting (`MANIFEST_INTAKE_MODEL`) checked for `internal` at every mint. **A key never outlives the credential that asked**:
  a token's expiry, or the signed-in session's (`SessionActor.expiresAt`). A revoked token ends the sessions it started, on
  a retry too; ending revokes by alias BEFORE the row is stamped, and records the key's spend first (FE-23 — the gateway
  deletes an ended key's row). Spend is read from ONE `/user/info` a person, cached 10 s, and is **null with a reason, never
  0**, when the gateway cannot say. Intake is session-only, a few a person a **Vancouver** day under a per-person lock.
  `scripts/litellm-orphans.sh` holds a budget user while it holds an unexpired key; reclaiming one resets that month here.
- **THE CAPABLE MODEL IS ONE NAME, `default-chat-large`, AND ITS PRICE TRAVELS WITH IT** (the front-end enablement plan's sitting
  9a; §7, §21, §26 as Spec action 7 amended them). `MANIFEST_CAPABLE_MODEL` (a LiteLLM model string — `openai/gpt-6-luna` today;
  empty is unset) is made true by `ai/capable.ts` at every boot, **straight after `listen`** (a boot that fails before it serves
  changes nothing in the shared gateway): registered through `/model/new` at `internal` under an id the control plane CHOOSES (an
  unknown provider is a `500` whose row LiteLLM saves anyway, findable only by id), **pinned at the price LiteLLM itself reported**
  (`gpt-6-*` is priced only by the list LiteLLM downloads at its own start online; a price in `litellm_params` survives any restart),
  a repoint created before the old one goes, and **a model LiteLLM will not serve or cannot price REFUSED — never offered at `$0`** —
  with the working one kept; unset removes it. **Never fatal**: one `[boot]` line and the boot line's `capableModel`. **Never a
  `config.yaml` line**, and **the provider's key is LiteLLM's alone** (`infra/compose.yaml`) — the control plane scrubs
  `OPENAI_API_KEY` from its environment at boot, because RUNBOOK's `set -a` exports all of `.env`. D17 hands it to an agent on an
  `internal` or `public` project, and on a `confidential` one only while the builder setting allows it (below) — never to an app's own
  `ai.models` there. **Every control plane that boots without the setting removes it** —
  the Docker tier's included. **ITS FALLBACK IS THE ON-PREMISE MODEL, AND ITS CLASSIFICATION IS THE PLATFORM'S** (sitting 9b; Spec
  action 8): `MANIFEST_CAPABLE_MODEL_FALLBACK` names a CATALOGUE entry — `default-chat-onprem` by default, EMPTY is none — set
  straight after the capable model with LiteLLM's own `POST /fallback` (a `general` fallback held in LiteLLM's database, measured to
  survive a LiteLLM restart and a repoint), **removed by `DELETE` whenever the setting is empty or the capable model absent** — the
  entry is keyed by NAME and OUTLIVES its primary (measured), so one left behind re-attaches to the next registration — and
  **refused unless every deployment of the name is a classified CHAT entry ranked at least the capable model's**, because LiteLLM
  falls back WITHOUT consulting a key's list of models (measured twice). A refused setting keeps a working fallback only if it passes
  the same check now. A call the fallback answers is charged to the same key at the FALLBACK's price, and names the fallback's
  provider string in `model`. The boot line's `capableFallback`; a failed capable-model step skips it, one line for both.
  **On the laptop the on-premise model is `qwen3.8:27b`** (`default-chat-onprem` and `-reasoning`, pinned `think: false` like
  `default-chat`; sitting 11a) — Ollama will not hold it beside `qwen3.5:4b`, so the two evict each other (TRAPS.md).
- **THE AGENT THAT BUILDS A `confidential` APP IS A PLATFORM SETTING, AND A SESSION NEVER HOLDS MORE THAN ITS PROJECT NOW ALLOWS**
  (the front-end enablement plan's sitting 11a; §7, §10, §26 as Spec action 10 amended them). `MANIFEST_AGENT_BUILDER_MODELS` is
  `capable` (the default) or `on-premise` and NOTHING else (an empty line refuses the boot); `agentModelsFor(catalogue, floor,
  builder)` adds `default-chat-large`'s NAME on a `confidential` floor under `capable` when the catalogue holds it, and nothing else the
  classification refuses. The app's own `ai.models` is D17's alone (`spec/policy.ts`) whatever the setting. **`endSessionsHoldingMore`
  ends every ACTIVE session whose key names a model the catalogue still serves and the project no longer allows** — `models_withdrawn`,
  revoked at the gateway before the row — after every VALID manifest `validateAndRecord` records, after every PRODUCTION deploy (the
  serving release floors the classification) — **the launch rehearsal's included**, in the route's `finally` (sitting 12's F20,
  reversing sitting 11a's ruling) — and at every boot over every project (the only way a narrowed setting reaches a
  session; the boot line's `agentBuilderModels` and `agentSessionsWithdrawn`). **Never a refusal** of what has landed: a session not
  ended is an operator line with its cause, and the next boot finishes it. **The race is closed both ways**: a start re-reads the
  classification under `holdActiveProject` (`FOR SHARE`), and the check first takes the project row `FOR UPDATE` and lets it go — a
  barrier that waits for any start in flight. An end nobody asked for is attributed to the session's own person. **THE SAFEGUARD**:
  while the setting is `capable`, `listIncidents` for a STAGING or PRODUCTION environment asked with a delegated TOKEN is `403
  INCIDENT_LOG_CONFIDENTIAL` when `environmentFloor` says `confidential` — the project's floor AND every release that has had an
  instance in THAT environment, so a commit lowering the manifest does not unlock the Incidents of the release before it; decided
  after the capability and before any read; a person's session and every token's sandbox read are answered. *Not swept*: a D21
  rehearsal (only the launch after it is).
- **AN OWNER SWITCHES AN APP OFF, AND GETS IT BACK** (the front-end enablement plan's sitting 8; §11's *Ending an app*, Spec
  action 3). `projects.state` is `active` or `archived`; **`assertCapability` refuses an archived project every capability but
  `project:read` and `project:delete`** (`409 PROJECT_ARCHIVED`, after the membership and capability checks, so a stranger is
  still `404`) — **and every operation that can answer it DECLARES it** (sitting 12's F19): a route states the capability it asserts
  (`capability`, on 50 routes), and ONE function, `projects/authz.ts`'s `refusedWhenArchived`, decides both the refusal and
  `document.ts`'s declaration; `api/authz-contract.ts` holds the two equal by archiving the fixture — and **`tokenActor` refuses any token of a project that is not active** — on its one lookup, a join. Archive
  (`POST …/archive`) and restore are person-only (`project:delete` is in `PERSON_ONLY`) and archive steps up. **The state goes
  to `archived` FIRST**; then `releases/lifecycle.ts`'s `TEARDOWN_STEPS`, each idempotent: agent sessions ended at the gateway,
  tokens revoked, pending questions expired, **every environment's name switched to a `410` page** (`Driver.switchOff` — a
  `static_response` under the hostname's own `@id`, `no-store`; it dials nothing, so the old instance can be retired) and its
  Route record emptied, every instance RETIRED (never destroyed — the Docker driver's `destroyInstance` would remove the page and
  the name would answer the wildcard), each environment's services, egress proxy and network removed **keeping each `-data`
  volume**, sandbox's and staging's SP rows deregistered. A failed step is `500 PROJECT_TEARDOWN_INCOMPLETE`; the same request
  retried continues, and `recoverAtBoot` runs every archived project's teardown again (`finishTeardowns`), because an edge
  restart drops the pages. **Three races are closed as sitting 7's I1 was**: an agent start and a token mint hold the project row
  `FOR SHARE` (`holdActiveProject`), and a deploy reads the state again under its environment's lock. **A DELETED project's stale work reaches nothing** (sitting 12's
  F22): the retirer skips an environment whose project is `deleted` (a new project may hold its slug, and so its hostnames), and an
  archive re-reads the state under the project lock and returns for `deleted`. Restore starts nothing: the
  next deploy brings the app back on its kept data. Code, data, secrets and records are kept; a delete is what destroys.
- **AN OWNER DELETES AN APP THAT NEVER LAUNCHED, AND IT LEAVES A TOMBSTONE** (the front-end enablement plan's sitting 9;
  Decision 31). `DELETE /v1/projects/{projectId}` is person-only with step-up, and `releases/lifecycle.ts`'s `deleteProject`
  refuses, under the project lock and **before anything is touched**, a launched project (`409 PROJECT_LAUNCHED_NOT_DELETABLE`) and
  one whose repository another source driver made (`409 SOURCE_PROVIDER_MISMATCH`). It then switches the app off exactly as an
  archive does — **KEEPING everything** (`switchOffUnderLock`; the project lock is NOT re-entrant, so never call `archiveProject`
  from inside it) — **reads `launched_at` AGAIN** (a launch in flight held production's lock through the switch-off: refused, left
  archived), and only then runs `DELETE_STEPS`: the data volumes, the Manifest IdP's production row, the names
  (`Driver.removeName` — the name then answers the edge's wildcard, as a name nobody holds does), the three LiteLLM users (ONE per
  call — a list with one missing deletes nothing), the repository (idempotent on driver 2: only GitHub's own *"does not exist"*
  `422` is gone) and every secret, LAST. `project.deleted` once, then `state = 'deleted'`. **The row can never go** (`23503`:
  `audit.events` references it), so **`projects_slug_key` is partial, `WHERE state <> 'deleted'`** — a raw `ON CONFLICT (slug)`
  must state that predicate or it is `42P10` (`make verify`'s probe, F18) — and **every read by slug or repository name says `state
  <> 'deleted'`**. A deleted project is the stranger's `404` to everyone, the administrator included (`assertCapability`, BEFORE
  membership; `projectStateRefusal` in the race windows). The boot finishes an interrupted delete only as an archive; the same
  request retried finishes the delete. Registry images are kept.
- **`node-ts-mongo@1` is §20's security multiplier**: its skeleton — CWL sign-in, the AI component, sessions — is
  written once and inherited by every app, its skeleton is a Docker-tier build target, and every app-side
  dependency is pinned exactly (C6, D30).

**The API (P5a)**

- **Every resource route is under `/v1`, reached at `https://console.manifest.internal` through the edge, which
  refuses every source but the host** (`10.89.0.1/32`); the sign-in endpoints and the registry's token realm stay
  outside `/v1`, listed in `api/unversioned.ts`.
- **EVERY `/v1` route is declared once, through `defineRoute`** (complete at P5a Task 14;
  `api/contract/coverage.test.ts` holds it so), with `zod/v4` schemas; its answer is parsed through a registered
  representation, so no column a mapper forgets can leave — and, measured in sitting 10, **a handler that skips its
  mapper altogether is a `500`, not a stripped `200`**, because the row's `Date` fails the representation's string
  `Timestamp` before stripping is reached. `packages/contract/openapi.json` is generated from the definitions and
  held by a drift test (`pnpm contract:write`), and `@manifest/contract` is generated from the document (`pnpm
  contract:generate`). **Whether a route reads a request body is the SCHEMA's answer, not the method's** —
  `readsBody(route)` is `route.body !== NO_BODY` — because `DELETE /v1/tokens/{tokenId}` (P5b Task 4) is the API's
  first bodyless mutation and, keyed on the method, it was `400 REQUEST_INVALID` before its handler ran and could
  not be put in the document at all.
- **THE PUBLISHED REFERENCE IS COMPLETE, AND `api/contract/docs.test.ts` KEEPS IT SO** (the authoring API plan's Task
  9, 2026-09-26). Every operation, parameter, tag, schema and property is described; every `RouteDefinition` carries
  `examples` — REQUIRED, typed by its own schemas, parsed again by the gate — which are REAL answers, captured from the
  route's own tests and shortened; every error code has a `remedy` beside its `summary` (`api/error-codes.ts`,
  published as `x-manifest-errors`), and so does every code inside `details` (`MANIFEST_ERRORS`,
  `x-manifest-spec-errors`); every event type has its sentence and example (`x-manifest-event-types`); `ManifestYaml`
  is manifest.yaml as a JSON Schema, held to §7's own schema by a corpus (`manifest-yaml.test.ts`); and **no public
  string names a plan, a task, a decision number, a finding or a person**. `ALLOWED_GAPS` is empty and stays so: **a
  new route, field, code or event type without its description is a red `pnpm test`.** `lint.test.ts` runs
  `@redocly/openapi-core` 1.34.20 over the committed document — resolved through `openapi-typescript`, NOT a
  dependency, because pnpm 11 refused the offline add (TRAPS). Path parameters are described once, as `PATH` in
  `api/contract/schemas.ts`.
- **A SESSION-ONLY OPERATION SAYS SO, AND THE ROUTE WRAPPER ENFORCES IT** (Task 9; sitting 5's F17). `credential:
  'session'` on a `RouteDefinition` makes `registerRoutes` refuse a token `403 TOKEN_CREDENTIAL_REFUSED` before a
  parameter or a project is read — identically for every id — and prints the operation's `security` as the session
  alone; fifteen routes carry it. `authz-contract.ts` refuses a route whose token rows are all
  `TOKEN_CREDENTIAL_REFUSED` without it, and `route.test.ts` refuses a token on a probe whose handler asks nothing.
  The document declares `delegatedToken` (`Authorization: Bearer mft_<id>_<secret>`) beside `session`, and the global
  `security` is either.
- **EVERY OPERATION HAS A CALLER IN THE CONSOLE — OR A NAMED REMOVER — AND EVERY EXAMPLE THE DOCUMENT PRINTS IS A BODY
  `manifest-mock` CAN SEND** (the authoring API plan's Task 10, 2026-09-26). `packages/console/src/coverage.test.ts`'s
  `DELIBERATELY_UNCALLED` was **empty — 54 of 54 operations** at the authoring API's close, and **is EMPTY AGAIN — 66 of 66 —
  since the front-end enablement plan's Task 13 (sitting 10)**, which called the twelve that plan had parked (recent output,
  the rename, agent and intake sessions, archive, restore and delete) and removed the parks in the same commit (the authoring API plan's sitting 8 added the three docs
  operations with the console's **Docs** screen as their caller) — since the console's **Code** tab (the tree, a file,
  edits, **Check** as a dry run, **Commit**, the history with `madeThrough`) and **Secrets** tab (per environment: names,
  declared, set, Set and Clear; production's step-up link) call the eight the plan had parked; its pure half is
  `code-state.ts`. The mock answers an operation with no fixture from the document's own example, **through the same Ajv
  2020 validator as every answer** — and `packages/mock/src/server.test.ts` holds all fifty examples to crossing it — and
  answers five (`FROM_EXAMPLE`: `getFile`, `getCommit`, `listCommits`, `createCommit`, `getDoc`) **keyed on what names
  them**: the example's own path, commit, first page or slug, and a dry run as a dry run; anything else is refused with
  the platform's code in the mock's own words. **And it plays two platform refusals over its one state** (sitting 8):
  `main` is the tree example's commit, so a commit based on any other is `409 SOURCE_CONFLICT` — the document's own
  request example included — and a commit that deletes or empties `manifest.yaml` is the platform's `SPEC_INVALID`
  word for word (`fixtures.EMPTIED_MANIFEST`, pinned on the platform's side by `source-commit.test.ts`).
  `getOpenApiDocument` answers the whole document it serves from. **A new route needs a console caller** (or a `DELIBERATELY_UNCALLED` line naming its
  remover — and the gate refuses a stale one), **and its example is what the mock answers.** **Since sitting 10 the mock
  trusts only what it issued and holds only its fixtures' ids** (FE-26, FE-27): a session other than `mock-session` — empty
  included — is `401 UNAUTHENTICATED`; a Bearer on an operation whose `security` names the session alone is `403
  TOKEN_CREDENTIAL_REFUSED` (any Bearer is still accepted elsewhere — it has no token store); a path id it does not hold
  (`HELD`) is `404 NOT_FOUND`; `listInstances` answers each environment's own (the sandbox runs one, beside an earlier failed
  one), keys' times are counted from the request, and its refusal states are options (`MANIFEST_MOCK_LAUNCHED`,
  `_AGENT_BUDGET`, `_INTAKE`). It keeps NO state (P5c Decision 9) and plays no step-up, and it STARTS FROM SOURCE — `pnpm
  --filter @manifest/mock start` writes nothing (`packages/mock/src/scripted.test.ts`). **`@manifest/contract`'s `dist/`
  type-checks on its own** (FE-18): its build is `node build.mjs` — `tsc` then a copy of `schema.d.ts` — and its source
  compiles under a consumer's `erasableSyntaxOnly` (`src/dist.test.ts`).
- **THE API'S DOCUMENTATION IS SERVED BY THE API, GENERATED FROM IT, AND ITS CODE IS RUN** (the authoring API plan's
  Task 11, 2026-09-26). `docs/api/` — ten hand-written guides (*Building a front-end* the tenth, the front-end enablement plan's sitting 11) for a developer and an agent at once, four reference
  pages, and `llms.txt` — is read at boot by `docs/load.ts` (bounded; a page with no title or first paragraph, a
  symlink, a non-UTF-8 page or an empty root refuses the boot, naming it — and, since the front-end enablement plan's
  Task 5 (F11), two pages that make ONE slug, naming both, and a name `getDoc` cannot address; `DOC_SLUG` is stated once and
  the route reads it) and served by **`listDocs`** (`GET /v1/docs`)
  and **`getDoc`** (`GET /v1/docs/{slug}`, `404 DOC_NOT_FOUND`); **`getOpenApiDocument`** (`GET /v1/openapi.json`)
  answers the document generated from `ROUTE_DEFINITIONS` at boot,
  **held byte-for-byte equal to the published one** by
  `api/docs.test.ts`. Any credential reads all three. **Every code block in a guide is a `packages/journey/src/example-*.ts`
  file** — type-checked against the generated client and run against `manifest-mock` by `examples.test.ts` — inlined by
  **`pnpm docs:write`**, which also writes the reference pages, `journey.md`'s and `events.md`'s tables and `llms.txt`
  (and its copy in `packages/console/public/`). `packages/journey/src/docs.test.ts` refuses a committed page that is not
  what `docs:write` writes, a name a page uses that the API lacks, a dangling relative link, and an internal name. **So
  a change to the document is `pnpm contract:write && pnpm contract:generate && pnpm docs:write`, or `pnpm test` is red
  naming the page.** §22's end-to-end path is data — `coverage.ts`'s `JOURNEY` — held to the document both ways by
  `coverage.test.ts`. The console's **Docs** screen shows the pages as plain text, and **`reference.html`**, a second
  page outside `src/`, mounts Scalar 1.72.0's standalone bundle — served from the pinned package by `vite.config.ts`'s
  `scalarStandalone`, never committed and never a CDN — with the configuration measured to make no request to any
  other host; `reference/` imports nothing (`src/boundary.test.ts`). `node-ts-mongo@1`'s AGENTS.md sends an agent to
  `GET /v1/docs/agents`, and a test holds the pointer to a page the API serves. **And with nothing running at all, `pnpm
  docs:html`** writes `dist/api-docs/` (git-ignored) and opens it: one page, from disk, with the guides and the reference pages as
  sidebar sections before the whole API reference — Scalar renders the guides as the description of a COPY of the document
  (`packages/journey/src/docs-html.ts`, held by `docs-html.test.ts`; after sitting 8, at Rich's request).
- **A `Release` names its env vars and never their values, and an `Instance` never names a container** (P5a Task
  14, Decisions 22 and 23): a release carries its build's digest and scan and, per environment, the frozen numbers
  and `envNames` — the value still reaches the container through §8's injection and stops there — and a deploy
  answers an instance with no `driver` and no `handle`. `GET /v1/releases/{releaseId}` and `GET
  /v1/projects/{projectId}/releases` read them back.
- **A deploy says it began before it says how it ended** (§22 step 5, P5a Task 14): `deployRelease` publishes
  `instance.provisioning` the moment the row exists and `instance.starting` the moment before the driver is asked
  for a container, and it **stores** `starting`. **An app with CWL sign-on puts `sso.registered` between the two**,
  because the SP is registered after the services are bound and before the container starts. A deploy that throws
  leaves the trail: `provisioning` alone if it never bound its services, `starting` if it did — both states
  `recoverAtBoot` can end.
- **There are TWO CREDENTIAL CLASSES and ONE place that reads either** (D23.4, P5b Task 5). `api/server.ts`'s
  single `onRequest` hook turns a `manifest_session` cookie into a `SessionActor` and an `Authorization: Bearer`
  into a `TokenActor`; **no route reads a cookie or a header**, which is what makes D24's central refusal possible
  at all. A request carrying BOTH is `400 CREDENTIAL_AMBIGUOUS`, refused before either is read. `Actor` is a
  **discriminated union on `credential`**, so a route D24 reserves to a person calls `requireSession(request)` and
  a token gets `403 TOKEN_CREDENTIAL_REFUSED` — `/v1/me`, `/v1/fleet`, `POST /v1/projects` and all three token
  routes. **That is a `tsc` error rather than a remembered check only where the handler reads a session FIELD**:
  `POST /v1/projects` reads none, so its refusal is deliberate and measured (sitting 3, F10). **A token's authority
  is the token's, not its minter's**: `assertCapability` checks its scope first — any other project is the
  STRANGER's `404`, never `403`, so it is no more an enumeration oracle than a stranger — then its own capability
  set. **A token therefore outlives its minter's membership**; revoking the token is what stops it. `GET
  /v1/projects` answers a token exactly its one project, scoped in the route because no capability check runs there
  at all.
- **A SESSION-bearing mutation or stream upgrade must carry the console's `Origin`** (`403 CSRF_ORIGIN_REFUSED`) —
  **and a bearer request must not**, because CSRF is a browser attack and a token is not sent automatically by one.
  `assertSameOrigin` keys on the COOKIE (`carriesSession`), so it exempted a token with no change at all when the
  class was added. **Every mutation carries an `Idempotency-Key`** (D23.6); **every code a client can receive is in
  `api/error-codes.ts`**, held to the source in both directions.
- **A token is `mft_<id>_<secret>`, minted only in an interactive session, and its secret is returned exactly
  once** (D24, P5b Tasks 3–4). Only a SHA-256 of the secret is stored; the id is the row's, so verification is one
  indexed lookup. The mint response is the **one place in this API that returns a credential**, and the read schema
  has **no `secret` field at all** rather than an optional one. A mint is refused any of `PRIVILEGED` by name (`400
  TOKEN_CAPABILITY_FORBIDDEN`), refused anything the minter does not hold themselves (`403`), and bounded at 365
  days. **Every bad token — unknown, wrong secret, revoked, expired, malformed — gets the same `401`**, so a caller
  cannot enumerate ids or read the state of a credential they do not hold. Only the minter may revoke; everyone
  else gets the `404` a token id that does not exist gets.
- **§13's authorization is `projects/authz.ts`**: a stranger gets `404 NOT_FOUND`, a member without the capability
  `403 FORBIDDEN`. **`api/authz-contract.ts` covers every registered route and asserts each refusal's code — and
  since P5b Task 11 it runs NINE actors, not five**: the five people (`owner`, `collaborator`, `stranger`, `admin`,
  `anonymous`) and four agents (`token-capable`, `token-incapable`, `token-other-project`, `token-privileged`), 40
  route cases, **361 tests**. `Expectation` is `'pass' | RefusalStatus | { status, code }` — the bare status still
  maps through `REFUSAL_CODE`, so no row written before that change moved, but a `403` that is
  `TOKEN_ACTION_PENDING` rather than `FORBIDDEN` must say so, and with the privileged rows asserting a bare `403`
  **nine cases pass while D24's loop cannot start**. **Completeness for the actor dimension is `tsc`**, not a
  runtime check: `Record<Actor, Expectation>` makes a row missing a token expectation a compile error. The deploy
  route has TWO rows — staging asserts `release:deploy` and production `release:promote`, which is the only place
  either the token rule or a collaborator's inability to promote is exercised. **D24's four privileged capabilities
  are named ONCE** as `PRIVILEGED` (P5b Task 2), which §20 requires be held to its own step-up list **by a test
  rather than a convention** — `projects/privileged.test.ts` is that test, and it names the four as literals so it
  cannot agree with the constant it checks. It is typed over `PrivilegedCapability = Capability | 'secret:read'`, a
  **superset**: `secret:read` is in D24's list and deliberately NOT a `Capability`, because no route reads a secret
  in Phase 1 and a capability nothing grants and nothing checks is the no-caller shape §9 names four times.
  **Promoting to production is its own capability, `release:promote`** — an owner and a platform admin hold it, a
  collaborator does not — **asserted by the deploy route when the environment's `kind` is production, and BEFORE
  §13's launch gate**, so a collaborator is refused without the project's readiness ever being consulted.
  `release:deploy` still covers sandbox and staging and is not privileged, which is what makes D24's rule statable
  at all.
- **D24's CENTRAL REFUSAL EXISTS, and it is two layers that cannot do each other's half** (P5b Task 6).
  `assertCapability`'s token branch runs **four checks in this order** — scope, then `isPersonOnly(capability)`
  (since P6b Task 2, next bullet), then `isPrivileged(capability)`, then the token's own capability set — and the
  order is the security property: scope first so a token cannot learn another tenant's project exists, and the
  privileged rule **before** the token's own set because D24 says *"regardless of how it was minted"*. It throws
  `TokenCapabilityRefusedError`, which carries what was refused and nothing about the request; **the ONE wrapper in
  `api/contract/route.ts` that runs for every `/v1` route** is holding the request, so it records the
  `PendingAction` and answers `403 TOKEN_ACTION_PENDING` with that row `$ref`'d into the error envelope, so an
  agent can find the thing it must wait for (D23.7). **The catch is OUTSIDE `app.idempotent`**: caught inside, the
  403 caches under `(key, userId, route)` and the confirmed retry — which reuses its `Idempotency-Key`, exactly as
  D23.6's own hint instructs — replays a cached refusal for ever, while every test minting a fresh key per request
  stays green. **The wrapper does not run for the event stream**, which `routes/events.ts` registers with
  `app.route` directly; that is harmless while the stream's only capability is `project:read`, and `mapError` fails
  closed with an operator line if it ever stops being. An identical ask **reuses its pending row** rather than
  filling a person's queue, matched on token, method, concrete path and a **key-sorted** SHA-256 of the body; **the
  body itself is never stored**, because a person reads that row on a screen.
- **A PERSON-ONLY ACTION IS REFUSED OUTRIGHT, WITH A CODE OF ITS OWN** (P6b Task 2; §20 and D24's row since
  2026-09-22). `PERSON_ONLY` in `projects/authz.ts` is `release:approve` and `launch:record` — approving a release,
  recording what UBC IAM or the Privacy Office said — each a record that a named person decided. `assertCapability`
  refuses a token asking for either **after scope and before the privileged rule and any grant**, raising
  `PersonOnlyRefusedError` — deliberately NOT `TokenCapabilityRefusedError`, so the wrapper never turns it into a
  pending action — answered **`403 TOKEN_PERSON_ONLY`**; the mint route refuses both `400
  TOKEN_CAPABILITY_FORBIDDEN`. **Every real route asserting either ALSO calls `requireSession`, which answers `403
  TOKEN_CREDENTIAL_REFUSED` first** — so the central rule is visible only on a route that does not, which is why
  `api/person-only.test.ts` registers synthetic probes. **Two layers, two codes: removing either turns a test
  red**, and that is the whole reason the code is distinct. `PERSON_ONLY` is disjoint from `PRIVILEGED`, held by
  literals in `projects/person-only.test.ts`.
- **AND A PERSON ANSWERS THE QUESTION, WHICH IS WHAT CLOSES D24'S LOOP** (P5b Task 7). `POST
  /v1/pending-actions/{id}/confirm` and `.../reject` are **interactive only** — a token confirming its own pending
  action would be a loop with no human in it — and the person answering must hold the capability **themselves**: a
  collaborator who may not manage members is `403 FORBIDDEN`, a stranger `404`. **Confirming does not replay the
  request.** It grants that EXACT request — this token, this method, this concrete path, this key-sorted body hash
  — **one retry**, which the agent makes itself through its normal route with its normal validation. The wrapper
  resolves the confirmed row and hands `assertCapability` a `grant`; the grant **returns** rather than falling
  through to the token's own capability set, because no token the platform can mint holds a privileged capability,
  and `consumed_at` is stamped **after** the handler resolves so a transient failure does not burn a person's
  decision. **"Exactly once" describes the ACTION, not the ANSWER**: the confirmed retry's `2xx` is stored under
  its `Idempotency-Key` and replays for ever without reaching the handler — not an escalation, and a reader who
  assumes otherwise mis-reads `consumed_at`. A retry after a rejection is `403 TOKEN_ACTION_REJECTED` carrying the
  person's own reason, so an agent stops rather than loops. **An expired question cannot be answered**, and an
  expired confirmation cannot be spent.
- **§26'S QUEUE IS A READ, AND THE TWO CREDENTIAL CLASSES SEE DIFFERENT SETS** (P5b Task 8). `GET
  /v1/projects/{projectId}/pending-actions` and `GET /v1/pending-actions/{pendingActionId}`. **A session that may
  read the project reads the PROJECT's queue** — it is `project:read`, so a collaborator watches it even though
  *answering* needs the capability the question is about — **and a token reads only the questions IT asked**,
  because a token's authority is its own and one agent enumerating another agent's requests is a read D24 grants
  nobody. The rule is stated ONCE, as `pendingActionsFor`'s `tokenId` parameter, and both routes apply it; a row
  the caller may not see is `404`, never `403`, for §13's enumeration reason. Every state is listed, not only
  `pending`, and **the body is never carried** — only `bodySha256`. `waitingSeconds` is computed by the platform
  (§26's headline number), from `createdAt` to `resolvedAt ?? now`.
- **A NEW PRIVILEGED ROUTE INHERITS D24'S REFUSAL WITHOUT DOING ANYTHING, AND THAT IS NOW MEASURED** (P5b Task 8).
  `DELETE /v1/projects/{projectId}/members/{userId}` is the first privileged route written after Task 6 made the
  rule central: it calls `assertCapability(…, 'members:manage')` and does nothing else about tokens, and an agent
  asking is answered `403 TOKEN_ACTION_PENDING` with a row a person confirms. **Assert that by CODE** — `403
  FORBIDDEN` is also a `403`, and a status-only assertion passes against a route on which D24's loop cannot start.
  It answers **`200` with `MemberList`** (`SuccessStatus` is `200 | 201 | 202`; a bodyless response is machinery
  nothing yet needs), is **idempotent** — removing a non-member is not an error, because the caller can already
  read the membership, unlike `DELETE /v1/tokens/{tokenId}` where the `404` hides which ids exist — and **refuses
  the last owner** (`409 PROJECT_LAST_OWNER`), with the guard inside the DELETE's own predicate so two owners
  removing each other cannot both win.
- **A QUESTION NOBODY ANSWERS EXPIRES, AND THE DATABASE REFUSES A SECOND OPEN ASK** (§6, P5b Task 10).
  `tokens/expiry.ts`'s `expirePendingActions(db, now, scope?)` moves a `pending` row past its own `expiresAt` to
  `expired` and never touches one a person decided; `src/index.ts` calls it at boot beside `recoverAtBoot` and puts
  the count on the boot line, and **`boot.docker.test.ts` is the only test that fails if that caller goes** — the
  unit tier stays green, which is the whole risk of the task. **It is not the control that stops a lapsed question
  being answered**: `answerable` and `resolutionFor` both compare the TIMESTAMP, so a row the sweep has not reached
  is already unanswerable, and what the sweep fixes is the stored state §26's queue displays. **It does not run on
  a timer** — named in P5b's *What this plan does not build* — so a long-running process can show a stale
  `pending`. Migration **0018** adds a PARTIAL unique index over `(requested_by_token, method, path, bodySha256)
  WHERE state = 'pending'`, so five concurrent identical asks make ONE row (sitting 5's F10, which measured five);
  `recordPendingAction` tolerates the race with `onConflictDoNothing` and hands the loser the winner's row, and
  **only the caller that wrote the row publishes the event**. **The two halves depend on each other in one
  direction**: the index's predicate turns a stale `pending` row into a permanent block on the same question, so
  the sweep ALSO runs scoped to that one token immediately before the insert. `Token` carries a computed `expired`,
  and it is NOT `revokedAt !== null` — a clock and a person are different answers to why a credential stopped.
- **EVERY REQUEST A TOKEN MAKES IS RATE-LIMITED, FROM THE TOKEN'S OWN ROW** (§20, P5b Task 9).
  `delegated_tokens.rate_limit` is **requests a minute** (600 by default), and that unit is now in the published
  contract rather than nowhere. The limit is taken in the ONE `onRequest` hook — **after** the token is verified,
  so nobody can exhaust a real token's window by sending its id with a wrong secret, and **before** any route, so
  none can forget it — and `RATE_LIMITED` is therefore in `EVERY_ROUTE` in `api/contract/document.ts`, not on each
  route's `errors:`. **A session is deliberately NOT limited**; `GET /v1/slugs/{slug}` keeps its own per-user
  limiter (P5a Task 9), a different control with the same code. `createRateLimiter` is one line over
  `createKeyedRateLimiter`, whose `take(key, limit)` reads the limit per call — one window implementation, two
  surfaces.

- **Every test of the token refusal writes its token STRAIGHT TO THE STORE holding a privileged capability, and
  that is not a state a real token is ever in.** The mint route refuses one, so the only realistic token is one
  minted **without** it — and P5b sitting 4 measured that all 31 tests that existed stayed green through a
  reordering that answers every real token a dead-end `403 FORBIDDEN` and stops D24's loop from ever starting.
  **When a fixture can write a row no route would, check which of the two states your control is actually in.**
- **The stream carries EITHER credential class, and the client could not until P5b Task 12.** `subscribe`'s
  `SubscribeOptions` had only `session`, so an agent could start a build through the generated client and had
  nothing to watch it end on — while the route had accepted a bearer all along, because the upgrade authorizes
  `project:read` like any other read. A token subscription sends the bearer and **no `Origin`**, for the reason
  `createManifestClient` states: `assertSameOrigin` returns early unless the request carries the session cookie,
  and claiming the console's origin from an agent would say something untrue. Passing both is refused in the
  client, where the mistake is — on an upgrade a `400 CREDENTIAL_AMBIGUOUS` reaches a WebSocket client as close
  1006 and no status.
- **One event stream per project**, `WS /v1/projects/:projectId/events`, authorized before it upgrades — **and in
  the contract** (P5a Task 12): `openapi.json` documents it as `streamProjectEvents` with `x-manifest-websocket`,
  every frame is a `StreamFrame`, and `@manifest/contract`'s `subscribe` opens it. **Every event type's
  `machineDetail` is a strict schema in `observability/event-schemas.ts`, and `recordEvent` refuses a detail that
  is not its type's** (`EVENT_DETAIL_INVALID`, naming the path) — the same schemas are the document's `EventFrame`,
  so a key a call site adds without adding it there is refused, not streamed. **A new event type is now four
  edits**: `EVENT_TYPES`, the database CHECK (a migration), `EVENT_DETAIL_SCHEMAS` — with a `.describe()` sentence on
  its entry and on every field (the authoring API plan's Task 9) — and `EXAMPLE_DETAILS`, which lives in
  `observability/examples.ts` since then (production code: the document publishes it; `testing.ts` re-exports it).
  `api/stream-contract.test.ts` parses every frame a whole delivery lifecycle publishes and replays.
- **§13's first-launch checklist is COMPUTED, never stored** (P5a Task 15), **and since P6a Task 7 it is the thing
  that GATES production** — `assertLaunchable` throws on the same computation the read renders.
  `launch/readiness.ts` builds it from what the project has — the domain, IAM registration, the privacy assessment,
  the rehearsal, scans, admin approval, a load rehearsal only for a `large_course` or `public` audience, and
  **LAST, `code-review`, the one NON-BLOCKING item** (R4, D33: it reads `not_built` because nothing reviews code,
  and `blocking: false` is what keeps production reachable). **`ready` is `readyOf(items)`** — every BLOCKING item
  met — and nothing else states it. The item ids are `LAUNCH_ITEM_IDS`, once; the representation's enum is built
  from it. Since P6a sitting 8 **`iam-registration` is `met` only when the registration is `active` AND the
  candidate release asks for a subset of its `registered_attributes`**, and a BUILD fails on the same rule when a
  registration already exists — two places, because the build cannot see a registration recorded after it, which §9
  makes the normal order. **EVERY BLOCKING ITEM IS NOW BUILDABLE, AND ONE PROJECT HAS MET THEM ALL** (P6a sitting
  9): `rehearsal` is a row `runRehearsal` writes and reads `unmet` until somebody runs one. *(`grep "state:
  'not_built'" launch/readiness.ts` returns TWO: `load-rehearsal` — P9's, and only for a `large_course` or `public`
  audience — and `code-review`, which is unconditional and does not block. It returned THREE until Task 14, and
  sitting 7's F15 was this same sentence one item earlier; **run the grep rather than trusting this count**.)* `GET
  /v1/projects/{projectId}/launch-readiness` answers it and the production deploy's `409` carries **the same
  bytes** — `mapError` parses the checklist through its representation, because zod emits an object's keys in
  SCHEMA order and a hand-built body does not (sitting 11 finding 1). `api/errors.ts`'s `ErrorEnvelope` now DERIVES
  from `api/representations/errors.ts`'s schema instead of restating it.
- **D21'S REHEARSAL IS A ROW, MET BY A MEASUREMENT** (P6a Task 14, R2). `POST /v1/projects/{id}/rehearsal` deploys
  the candidate release into PRODUCTION behind the gate (`deployRelease` directly, with `purpose: 'rehearsal'` —
  the one production deploy that may precede an approval, because §13's checklist puts the rehearsal's evidence in
  front of the administrator who decides), reads the Service Provider values back off the `sso.registered` event
  the registration itself wrote, completes **one real CWL sign-in from a probe container**, and records pass or
  fail with the evidence — the instance, the listener, the status the app answered at its REGISTERED ACS, and the
  attributes the assertion actually released, read out of the assertion rather than from the app (no app endpoint
  is common to every starter: the skeleton serves `/me`, the proof-app `/api/me`). **A REHEARSAL DEPLOY IS POINTED
  AT THE LOCAL IdP AND NOTHING ELSE ABOUT IT MOVES**: §8 sends a production app to real UBC Shibboleth, which C1
  puts out of reach, so `InjectionContext.purpose` changes three URLs and `SAML_ENVIRONMENT` and leaves the
  hostname, the entityID, the ACS, the attribute list and the certificate rules alone. The item goes `unmet` again
  when the candidate would register something else (Decision 10, `rehearsalCovers`), and its `why` says in R2's
  required words that it proves the registration's SHAPE and never UBC's acceptance of it — **which has its own
  test, because a required sentence with no test is a sentence that gets edited out**.
- **AN APPROVAL BINDS A DIGEST, AND THE DEPLOY VERIFIES IT BEFORE ANYTHING STARTS** (§13, P6a Task 15).
  `deployRelease` refuses `RELEASE_DIGEST_NOT_APPROVED` immediately after it reads the digest and before
  `assertPromotable` — before an instance row, a service, an SP registration or a network exists, which is a claim
  about SIDE EFFECTS that only a side-effect assertion can see. **A production deploy also asks for step-up**
  (`release:promote`, §20, Rich 2026-09-20), on that branch alone, so an ordinary admin session never reaches §13's
  gate — which is why `make demo-journey` reads the checklist from `GET …/launch-readiness` rather than from the
  refusal. **The approval is FOUND BY RELEASE** (`latestApprovalFor`), so a rebuild — a new release — has none,
  **even when the digest is identical**: BuildKit pins layer timestamps to the commit (`source-date-epoch`), so on
  this machine the same commit always rebuilds to the same digest (P6a sitting 11, F3). §13 says an approval binds
  a digest; the code binds it to a release too. **P6b's plan decides it** (its Decision 3): an approval keeps
  binding both, and re-escalation reads the release's frozen configuration. **R4's seam reviews nothing and says
  so**: every approval records `review: not_performed` from `NullReviewer`, in words, and the checklist's
  `code-review` item is `not_built` and non-blocking — and it does not read the reviewer's verdict at all, which
  the first real reviewer will have to change (sitting 11, F7; P6b's Task 8 makes it read the verdict).
- **AN APPROVAL COPIES THE STORED PREVIEW IT NAMES** (P6b Tasks 9–10; Rich, 2026-09-22). An administrator takes a
  preview — `POST /v1/releases/{id}/approval-preview`, a session and `release:approve`, NO step-up — and the
  platform stores it (`approval_previews`, insert-only, `PREVIEW_TTL_MS` = 30 min). Approve and reject must name
  it: `400 APPROVAL_PREVIEW_REQUIRED` without one (optional in the schema, required at runtime — Decision 15), `404
  NOT_FOUND` for another release's, `409 APPROVAL_PREVIEW_EXPIRED` past its TTL, `409 APPROVAL_PREVIEW_STALE` when
  its FACTS (`diffFactsFor`, recomputed at decision time) moved. **The record copies the preview's snapshot**, so
  the model and the reviewer are asked once, when the preview is taken, and a decision never asks again —
  `releases/preview.test.ts` counts the model's calls. The console shows the preview BEFORE the decision, through
  the one component the record uses, with its id in `?preview=` so §20's step-up returns to the same preview.
  `manifest-mock` refuses a decision naming no preview, as the platform does. **Every test that decides goes
  through `previewThenDecide`** (`api/testing.ts`).
- **THE APPROVAL SUMMARY IS STRUCTURED OUTPUT, AND THE MODEL CANNOT STATE A VERDICT IN IT** (the D5 plan's Task 13;
  Decisions 19 and 22, Rich 2026-09-24). `releases/summary.ts` hands the model the diff's FACTS as JSON — each change
  and the security notes, never the reviewer's verdict or `COVERAGE_LIMIT`, which the snapshot keeps in their own
  fields — and sends `response_format: json_schema` built by `z.toJSONSchema(exposureSchema(changes))`: one `exposure`
  sentence per change, `path` an enum of the diff's own paths. **One zod definition is the request and the check.**
  An answer that is not JSON, breaks the schema, names a change twice or leaves one out, or uses decision words
  (`checkExposure`; NOT `blocked`) is **withheld** — `summarySource: 'withheld'`, `summaryWithheldBecause` naming the
  rule and never the model's text, one operator line — and the approval still stands (Decision 7). A provider that
  ignores `response_format` fails the parse and is withheld, never shown unconstrained (measured, 5 of 5). The
  console lays each sentence UNDER its deterministic change line, labelled as a model's reading. **Every platform model
  call whose answer is read or shown follows this rule** (Decision 22): the authoring API and a real reviewer inherit it.
- **A KEY THE MODEL WRITES MUST BE NAMED IN `factsOf`** (`releases/preview.ts`). It takes the written half out BY NAME
  and compares everything else as a fact, the conservative direction — so a new model-written snapshot key that is
  not named there makes every preview carrying it STALE at decision time. `exposures` and `summaryWithheldBecause`
  were exactly that until the D5 plan's sitting 7 named them (its F1).
- **ONCE AN APP HAS LAUNCHED, ITS CHECKLIST IS D9's SECOND CLAUSE** (P6b Tasks 4–6). `projects.launched_at` is
  written once, by the first production deploy for purpose `launch` that becomes healthy, and
  `computeLaunchReadiness` branches on it: a launched app's list has **no `rehearsal`** (a launched app is never
  rehearsed — `REHEARSAL_LAUNCHED`), and its `admin-approval` reads **`productionApprovalFor`, the same verdict
  `deployRelease` reads** — met self-serve when no sensitive field changed since the LAST APPROVED release, met
  when an approval covers the digest, never met for a rejected release. The view carries `launched`,
  `baselineReleaseId`, `sensitiveFields` and `reescalated`. **`assertLaunchable(db, projectId, releaseId)` refuses
  with three literal codes, each with its own remedy**: `RELEASE_PRODUCTION_GATE_UNAVAILABLE` (fix an item),
  `RELEASE_REESCALATED` (launched, and an administrator's approval is the one thing missing — ask them) and, only
  after the checklist is satisfied, `RELEASE_NOT_STAGED` (production deploys only the release serving staging, so a
  rollback goes through staging). **The candidate is a HEALTHY staging instance's release** — `candidateFor`
  refuses the pre-P4c fallback's failed instance (P6b sitting 4, F2). **`RELEASE_NOT_STAGED` has one layer, the
  route**: `deployRelease` does not compare with the candidate (sitting 4, F9), which no client can reach.
- **A PRODUCTION ROUTE IS ON THE PUBLIC LISTENER — AND ONE FOUND ON THE WRONG LISTENER IS MOVED, NOT PATCHED IN
  PLACE** (§12; P6a Task 4, and sitting 11's F6). `applyRoute` writes a new route to
  `deps.servers[listenerFor(kind)]`; for a route that already exists it checks that server holds it, PATCHes it in
  place if so, and otherwise deletes it and puts it on the right one with a `[routing] … moving it there` line.
  Until 2026-09-22 it patched by `@id` unconditionally — `@id` names no server — so a route kept whatever listener
  already held it, and renaming the public server would have left every live production app on the internal
  listener. **`make demo-production` probes BOTH addresses** for the production name: `127.0.0.3` must answer as
  the instance the deploy started, `127.0.0.2` must not — over a FRESH socket each, because a pooled keep-alive
  socket answers the second probe from the first address (sitting 11, F2).
- **The first administrator is made out of band, and role changes are audited** (§20, P5a Task 16).
  `scripts/admin-grant.sh grant|revoke <puid> "<reason>"` runs one transaction as the database OWNER inside the
  Postgres container: no control-plane route changes a platform role and no delegated token ever will (D24). It
  refuses a person who has never signed in and an empty reason, records nothing for a no-op, and appends to
  **`audit.role_changes`** (migration 0013, append-only by grant). **A session carries the role it was issued with,
  so the change reaches a person when they SIGN IN AGAIN.** The IdP's third test user, `operator` / `operator`
  (`opr000001`), is the one `make demo-journey` promotes. **`GET /v1/fleet` is §26's fleet, administrators only** —
  `403` for everyone else, not `404`: there is no tenant's resource to hide.
- **One slug function, `checkSlug`**, answers `GET /v1/slugs/{slug}` and project creation with the same code,
  message and hint.
- **A build answers `202` and ends on the stream** (Rich's R6, P5a Task 13): `POST /v1/projects/{projectId}/builds`
  records the build and `build.started` and returns it `running`; a `BuildRunner` built at boot — the control
  plane's second background work, after the retirer — runs it, and `build.succeeded` or `build.failed` says how it
  ended. **`recoverAtBoot`'s pass 0 fails every `pending` or `running` build** with `BUILD_INTERRUPTED` and
  publishes it, so ONE control plane runs against a database. A replayed `Idempotency-Key` answers the recorded
  `202` and starts nothing; `GET /v1/builds/{buildId}` has the present state, and `GET
  /v1/projects/{projectId}/builds` the newest 50.
- **A blueprint is read whole at load, and a broken one refuses the boot, naming its file** (P5a Task 10):
  `loadBlueprints` reads each `skeleton/`, starter and knowledge pack as bounded UTF-8 text, and refuses a starter
  whose `manifest.yaml` fails §7, pins another blueprint, or asks for what its blueprint cannot deliver. **The
  proof app is `node-ts-mongo@1`'s first starter**, `blueprints/node-ts-mongo/starters/proof-app/` — it was
  `fixtures/proof-app/`. `GET /v1/blueprints` never carries the base image or build internals.
- **A project is created in ONE order** (P5a Decision 29, Task 11): blueprint and starter exist → `checkSlug` → the
  seed rendered (skeleton, the starter over it, the manifest's `name` spliced to the slug byte for byte) and the
  model catalogue read only if it declares a model → project, owner and three environments in one transaction → the
  repository, **and the project deleted if that fails** → the spec validated and stored → `project.created`,
  `repository.seeded`, `spec.validated`, **last**, because `audit.events` RESTRICTs the delete. `audience` is
  required (§24).

### What it deliberately does not do yet

Each is named in its plan's *What this plan does not build*, and none is an accident:

- **A sign-in under way at the IdP when a route moves fails once** — `passport-ubcshib` 0.1.6 drops passport-saml's
  `cacheProvider`, so the request id lives in the old container. Rich: tolerate it. *(P4c.)*
- **An edge configuration reload can reset about one request in 300 per admin change** (P4c R1), and **closes every
  app's proxied WebSocket** — only the console sets `stream_close_delay` (§8).
- **Two releases share one database for up to two minutes** during a redeploy — a knowledge-pack rule, checked by
  nothing. *(P4c R8.)*
- **An AI app whose gateway vanishes under a pooled connection makes a person wait 611 s** — the toolkit exposes no
  timeout. *(P4b finding 181.)*
- **Nothing notices an edge restart while the control plane runs** — that is Phase 4's reconciler; restart the
  control plane after `docker restart manifest-caddy` or `pnpm test:docker`.
- **§10's per-user AI budget is validated, not enforced**, in Phase 1.
- **`egress.allow` may still name a platform surface** — decided in §12, enforced by nothing until the roadmap's
  tracked hardening item.
- **A CHANGED `egress.allow` NEVER REACHES A RUNNING ENVIRONMENT** (P6b sitting 1, F1 — a defect since P3, not a
  decision). The per-environment proxy renders its allowlist once, at the environment's first deploy
  (`runtime/docker/egress.ts:78-81`): an added host is `403 Filtered`, and **a REMOVED host stays reachable**.
  P6b's Task 5a fixes it, in sitting 3; until then, the egress an environment enforces is the one its first deploy
  declared. *(§4 has how to read the proxy's answer.)*
- **A `POST /v1/projects` for a slug whose repository outlived its project answers `SOURCE_GIT_FAILED` with git's
  raw output, host path included** — `pnpm test` and `make reset` leave `.manifest/repos` behind. Since P5a Task 11
  it leaves no project; the demos and the journey clear their OWN slug's orphan first (`clear_orphan_repository`).
  A distinct code, and a message without the path, are not built. *(P4b finding 178's other half.)*
- **An app accepts an UNSIGNED `LogoutRequest`** — passport-saml 3.2.4 checks a signature only when one is present
  — so a crafted link can sign somebody out of an app; the plain `GET` of `auth.logout` already could. **`make up`
  does not re-bind the IdP's single-file config mounts** after a `git pull` or `git checkout` replaces `config.php`
  or `authsources.php` (§4). Both named, not fixed.
- **THE CONSOLE EXISTS AND IS SERVED, and as of P5c sitting 6 (2026-09-19) §22 STEPS 1 TO 5 AND 7 ARE CLICKABLE,
  AND STEP 6 AS FAR AS THE SIGN-IN — sign in, create a project, watch its stream, build it and read the log as it
  is written, release it, deploy it to staging, open the running app and sign in INSIDE it. **Step 6's *write a
  note; ask the LLM* is NOT part of this**; it is `make demo-ai`'s and Task 14's.** **Sitting 6 added §22 step 7 —
  §13's first-launch checklist with every item's state, reason, owner and the plan that builds it — §26's fleet for
  an administrator, and D24's delegated tokens minted once, listed and revoked.** **SITTING 7 ADDED §26'S QUEUE,
  WHICH WAS THE LAST SCREEN — SO EVERY SCREEN THIS PLAN BUILDS NOW EXISTS**: a person reads the question an agent
  asked, who asked it, how long it has waited, and confirms or rejects it in their own words. **D24's loop is no
  longer `curl`.** **SITTING 8 ADDED THE MOCK BEHIND IT AND THE CI SCRIPT, so the only thing P5c has left is the
  ACCEPTANCE itself.** `packages/mock` serves all 34 operations of the published contract from hand-written
  fixtures in one `node:http` process with a scripted WebSocket — no Docker, no Postgres, no control plane, no
  language model (§21: *front-end developers are not required to run the platform*) — and the console was driven
  against it in a browser, the whole journey. It is the one configuration in which the console is reached at
  `127.0.0.1:7104` rather than through the edge, because there is no CSRF origin to satisfy; RUNBOOK's *Running
  `manifest-mock`* has the four environment variables and what a green run against it does NOT prove. **D22's
  question is now a GATE**: `packages/console/src/coverage.test.ts` holds every one of the 34 operations to having
  a caller in `src/api.ts` (or `subscribe` in `stream.ts`, for the stream), with `DELIBERATELY_UNCALLED` **empty**.
  `make ci-acceptance` runs the headless half of 1c's acceptance and `make demo-console` prints the clicked half's
  checklist; `@manifest/contract` is **1.0.0**. *The paragraph below was written at sitting 3 and its first
  sentence is kept because the rest of it is still true.* `https://console.manifest.internal` is a `reverse_proxy`
  to a host process on 7104 (§21's inventory) for every path that is not `/v1/*` or `/auth/*`; the placeholder
  `respond` is gone. **What a person could do at sitting 3 was sign in with CWL and see who the platform thinks
  they are** — name, PUID, email and platform role, from `GET /v1/me`. `/fleet` and the project's `queue` and
  `tokens` tabs still render *"the `<name>` screen is built by a later task of P5c"*. **Nothing starts it for
  you**: `vite dev`/`vite preview` on 7104 is a developer's host process, `make up` does not run it, and with 7104
  free the origin answers **502** — which `make doctor` and `make verify` both tolerate by design (sitting 3, F3).
  **No production deploy, no custom domain.** **Delegated tokens are BUILT** (P5b, executed 2026-09-18): a token is
  minted, listed and revoked in an interactive session, an agent holding one authenticates with it scoped to one
  project and one capability set, D24's privileged four are refused centrally with a `PendingAction` a person
  confirms or rejects, a confirmation grants that exact request one retry, §26's queue is readable, every request a
  token makes is rate-limited from its own row, a question nobody answers is swept to `expired` and a second open
  ask for the same one is refused by the database, and §16's matrix asserts all of it across four token actors.
  **`make demo-token` runs the whole loop end to end through the edge** and is step 9 of the offline acceptance.
  **A PERSON NOW OPERATES THAT LOOP** (P5c Task 11, 2026-09-19): confirming and rejecting are a screen, clicked end
  to end, with the question reaching it 576 ms after the agent was refused. A project owner still cannot revoke a
  collaborator's token — only the minter can. **And two things about the loop reach no client at all**:
  `consumeAction` publishes no event, so *has the agent spent its one retry?* is answerable only by re-reading `GET
  /v1/pending-actions/{id}`, and `addMember` publishes none either.
- **NOTHING SWEEPS PENDING ACTIONS ON A TIMER, AND THE SCREEN THAT NEEDED THAT DECIDING IS NOW BUILT** (P5b Task
  10; P5c Task 11). The sweep runs at boot and, scoped to one token, before a new question is recorded — which is
  what the partial unique index needs. So a control plane up for a week can show §26's queue a `pending` row whose
  life ran out days ago. **A display staleness, not a refusal one**: `answerable` refuses a lapsed row `409
  PENDING_ACTION_RESOLVED` on the timestamp, so the lie self-corrects the moment anybody acts on it. **P5c HAS NOW
  DECIDED IT, AND THE ANSWER IS NO** (its Decision 8, 2026-09-18): `PendingAction.expiresAt` is in the
  representation, so the queue SCREEN renders a lapsed question as lapsed — with no confirm button — from the
  timestamp rather than from the stored state, and a timer would be a third piece of background work to correct a
  display that can correct itself. **BUILT AND WATCHED, 2026-09-19**: `screens/queue.tsx`'s `displayState` renders
  a `pending` row past its own `expiresAt` as `expired` with no buttons, and the control fired — reverted to the
  stored state, that row offered a Confirm button which answered `409 PENDING_ACTION_RESOLVED — this pending action
  was already expired`. *Its hint says* “somebody has already answered this one” *even when nobody did, which is
  recorded as P5c sitting 7's F6 and not fixed.*

**Which spec sections matter, by topic:** §7 the `manifest.yaml` contract · §9 identity ·
§10 AI access · §11 execution model and the `Driver` interface · §12 networking,
secrets, the builder, supply chain · §13 releases · §16 testing tiers · §20 security
architecture · §21 local topology · §22 the public API · §23 hostnames · §25
blueprints. Decisions are **D1–D33** in §4; constraints **C1–C6** in §3.

---

## 4. The machine, and what it will do to you

**This section is the one that saves you a morning.** Its short subsections are the machine's fixed facts. Its list
is the 27 traps most likely to cost the next sitting, curated on 2026-09-24 from the full catalogue, which is
[`TRAPS.md`](TRAPS.md) — every entry that was here, word for word.

### Laravel Valet owns things you will want

- **Valet owns the `.test` TLD, port 53, and ports 80 and 443.** A Homebrew dnsmasq
  2.91 runs as `nobody` on `127.0.0.1:53` answering `address=/.test/127.0.0.1`, and
  the nginx on 80/443 is Valet's. **Never touch any of it** — Rich needs it, and
  other UBC developers run it too.
- **This is why the zone is `*.manifest.internal`**, not `*.manifest.test`. ICANN
  reserved `.internal` in July 2024 for exactly this.
- **The resolver file is scoped to `manifest.internal`, never all of `.internal`** —
  Docker's own `host.docker.internal` lives in that TLD.
- **Caddy binds `127.0.0.2` AND, since P6a, `127.0.0.3`** — two loopback aliases, so Valet
  keeps `127.0.0.1:443`. `127.0.0.2` is §12's INTERNAL listener (`srv0`: staging, sandbox,
  the console, the IdP and `edge.`) and `127.0.0.3` is the PUBLIC one (`srv1`: the
  production zone and nothing else), **two servers inside the ONE `manifest-caddy`
  container**, so there is still one `caddy-data` volume and one internal CA. **Ask the
  wrong one for the other's names and you get `200` WITH AN EMPTY BODY** — not a
  certificate error, because Caddy's certificate cache is app-global and both servers
  present the same `*.manifest.internal` certificate (P6a sitting 2, F5). Neither
  alias **survives a reboot**; `can't assign requested address` means it is
  gone. **`make up` re-adds it, and that is not always enough** (measured 2026-09-14):
  starting Docker Desktop restarts `manifest-caddy` itself before `make up` can add the
  alias, the port forward fails, and Docker never retries it. The container reports
  healthy from inside, so `make up` and `make doctor` both pass; `make verify` fails
  every host→edge check while every container→edge check passes.
  `docker restart manifest-caddy` fixes it. RUNBOOK's *Known gaps* has the detail.

### The toolchain, and what executing P2 put on this machine

- **Node is 24, not 22.** nvm has only `v24.12.0`; there is no Node 22 on this
  machine. P2's plan originally pinned 22 for no reason that survived checking — the
  spec names no Node version, no spike treated it as a variable, and the only evidence
  was `passport-ubcshib`'s `">=22.0.0"`, which is a floor. **Repinned to 24**
  (2026-08-31, Rich's call). Nothing was tried on 24 and found wanting.
- **The app-side base image is still `node:22-alpine`** and is a *separate* decision:
  it is what faculty apps run in, S1 recorded its digest and mirrored it into the
  local registry, and P1 references it in three places including the offline test.
- **`pnpm` was added via `corepack enable pnpm`** — pnpm 11.24.0, a shim in
  `~/.nvm/versions/node/v24.12.0/bin/`. User-owned, **no `sudo`**, reversible with
  `corepack disable pnpm`. This is the only host change P2's execution made.
- **pnpm 11 blocks dependency install scripts by default**, as a hard error, so
  `pnpm test` will not run until they are allowed. The key is `allowBuilds` in
  `pnpm-workspace.yaml`; pnpm 10's `onlyBuiltDependencies` is still *read back* by
  `pnpm config get` but has no effect, which makes hand-writing it look like a
  mystery. Use `pnpm approve-builds <pkg>`.

### What is a container, and what is actually on this machine

**Almost nothing Manifest runs is installed on the Mac.** This is worth stating
plainly because every list of "absent" images in this project reads like a missing
dependency and is not one. §21's inventory is the authority; this is its summary.

**Host-resident, and only these:**

| | Why it cannot be a container |
|---|---|
| **Ollama** | Metal GPU access is unavailable from a container |
| **The control plane** (Node, 7100) | It needs the Docker socket, which §12 forbids mounting into *workload* containers. Running it on the host sidesteps the question and iterates faster. It **cannot reach container IPs** on Docker Desktop (S1), so health checks go through the edge or a published port |
| **Admin UI (7101), `manifest-mock` (7102), reference console (7104)** | Vite dev servers |

**Everything else is a container**: Caddy, Postgres, the registry, Verdaccio,
LiteLLM, the Manifest IdP, both dnsmasq processes, the egress proxy, the builder, and
the Syft/Grype scanners. So:

- **Caddy is never `brew install`ed.** It is a **custom `xcaddy` build** (§20), because
  S7 established that **Coraza pins the Caddy version**. `make seed` builds that image.
  `caddy: ABSENT` from a host-tool check means nothing at all.
- **Syft and Grype are transient per build** (§21: *"Scanner + SBOM — transient, per
  build"*). P3 Task 12 runs each as a throwaway container against the Docker socket.
- **The Manifest IdP is ours and is built from scratch** — `infra/idp/Dockerfile`,
  `FROM php:8.3-apache` plus `composer create-project simplesamlphp/simplesamlphp:^2.0`,
  its own `manifest_idp` database, on **port 7122 deliberately not 6122**. It has **no
  dependency on `/Users/rich/Developer/docker-simple-saml`** running, or existing.
  That repository is read-only to us and stays clean; what S2 took from it was
  knowledge — `pdo_pgsql` needs `libpq-dev`, `database.*` and `store.sql.*` are
  different subsystems, one `INSERT` into `saml20_sp_remote` registers an SP — not code.

**The images `make seed` must therefore fetch or build include** `caddy:2.11.4` and
its builder, `anchore/syft`, `anchore/grype`, `php:8.3-apache` and `composer:2` —
none of which are on this machine today. Seed is the one step that needs the network,
which is why P1's **offline** acceptance can only run after a successful seed.

### Rules of engagement

- **`sudo` cannot prompt from a tool call.** You get
  `sudo: a terminal is required to read the password`. Bundle privileged steps into
  one script and ask Rich to run `! sudo bash <path>` in his terminal. **Ask before
  anything needing `sudo`** — standing instruction.
- **The machine must end up exactly as it started.** Snapshot before you change
  anything. Every spike has met this bar and Rich has confirmed each teardown.
- **Pre-existing containers that must survive**: `docker-simple-saml-saml-idp-1`,
  `qdrant-local-dev`, `mongodb`, `mongo-express`.
- **The Bash tool's shell is zsh, and zsh ties `path` to `$PATH`.** A loop written
  `for path in /v1/models /key/info` empties `$PATH` for the rest of the command, so
  `docker`, `curl` and `python3` all become *command not found* partway through —
  measured 2026-09-14, when it leaked a LiteLLM key minted before the loop. Name loop
  variables anything else.
- **Work on a copy.** `docker-simple-saml` and `ubc-genai-toolkit` are read-only to
  you unless told otherwise; both are currently clean and must stay that way.
- **`git checkout <path>` restores from the INDEX, so on an uncommitted file it destroys
  your work, not your experiment.** Measured 2026-09-15: reverting one three-line negative
  control in `runtime/docker/driver.ts` reverted all 200 lines of the task with it, because
  the task had not been committed. **Commit the task BEFORE breaking anything to watch a
  control fail** — the restore is then exact, and `git status` proves it.

### Numbers

- Ports in use by other things: **6122** (`docker-simple-saml`), **27017** (mongodb),
  **6333/6334** (qdrant), **8081** (mongo-express), **11434** (Ollama), plus 80/443/53.
  The **7100–7199** block was entirely free.
- **7110 is the GitHub fake's** (the D5 plan, Task 5): `make github-up`, published on
  `127.0.0.1` only, behind the `github` profile. `make doctor` counts it Manifest's own
  without being told — its port map is every `manifest-*` container's published ports.
- Docker VM memory is **8.32 GB decimal / 7.75 GiB binary** — passes or fails §21's
  "≥8 GB" floor *depending on the unit*, which is why the spec now states the unit.
- Host: 36 GiB RAM, 12 cores, ~163 GiB free. **macOS 26.6.2 (build 25G83)** — the
  machine was updated; §4 said 26.5.2 until 2026-09-04. arm64, Docker Engine 29.7.2,
  which serves **API 1.55, minimum 1.40** (so P3's deliberate `v1.44` pin is inside
  the window).
- **macOS ships bash 3.2 and a BSD userland.** No associative arrays, no `mapfile`,
  no `xargs -r`, no `readlink -f`. A script that needs Homebrew bash 5 is a C1 defect.

### The traps most likely to cost you a sitting

*Curated on 2026-09-24 from the 234 entries now in [`TRAPS.md`](TRAPS.md): the ones a sitting on the current plan
and the next is most likely to hit, and that fail SILENTLY or cost an hour when they do. Each ends with what to
search `TRAPS.md` for, where the measurements are. CLAUDE.md's *Before you trust a green result* is the other half,
and is not repeated here.*

**Your shell and your tools**

1. **The agent's shell is zsh, not bash.** An unquoted `$VAR` is not word-split (`$PSQL …` → *command not found*);
   `${PIPESTATUS[0]}` is empty (zsh's is `$pipestatus[1]`); `local path=…` in a function empties `$PATH`; a word
   beginning with `=` is expanded; and a pipeline and a backgrounded wrapper both report their LAST command's
   status. **Write multi-line probes to a file and run them with `bash <file>`** — the plans' snippets are bash.
   *(TRAPS: `zsh`, `PIPESTATUS`, `LAST command`)*
2. **`grep` is a `ugrep`-backed shell function, and `ls` is aliased to a long listing.** A `$` in a grep pattern is
   an anchor — use `grep -F`; `F=$(ls …)` captures the long listing — **and `$(ls … | xargs grep -l …)` came back EMPTY in
   the front-end enablement plan's sitting 5, so a Vitest run meant for six files ran the whole unit project** (use a glob or
   `find`). *(TRAPS: `ugrep`, `aliased`, `IN A PIPE`)*
3. **The permission classifier varies by session and can tighten in the middle of one.** Try the command rather
   than assuming. If it is refused, never work around it — not another tool, not smaller pieces — tell Rich what
   was refused and why; his explicit permission in the chat has cleared a refusal on one retry. *(TRAPS:
   `classifier`)*
4. **`pnpm test:docker` (~19 min) and `make ci-acceptance` (~15 min) outlast the agent's 10-minute tool limit** —
   run them in the background and wait for the notification. **And read `uptime` before believing a red**: a Zoom
   screen share on this machine pushes the load to 50–90, and the unit tier then times out at 5 s. *(TRAPS:
   `uptime`)*
5. **Docker Desktop may not be running when a session starts.** `open -a Docker`; the platform's containers come
   back by their restart policy. *(TRAPS: `DOCKER DESKTOP`)*
6. **An agent driving Chrome cannot sign anybody in**: the extension will not type a password — measured again in the
   D5 plan's sitting 7, where every action on `idp.manifest.internal` was refused *"Permission denied for this action
   on this domain"* — and a password is not an agent's to type even with Rich's permission, so a clicked acceptance is
   shared: Rich types, the agent drives and reads. Its network reader, its redactor and its click-by-reference each
   have a measured quirk, **and its `find` misreports a controlled input's value** — read the screenshot or the DOM.
   *(TRAPS: `Chrome`)*

**Tests and gates**

7. **`pnpm test` TRUNCATES the control plane's tables — so does ONE test file, and so does `pnpm contract:write`**
   — deletes the test repositories, and leaves `.manifest/repos` and LiteLLM's users behind. Run anything that
   needs a demo's rows BEFORE any Vitest run. *(TRAPS: `TRUNCATES`, `both leave`)*
8. **Never run two Vitest processes at once**: they share a global setup that truncates and deletes in both, and a
   run you overlapped does not count. **One control plane per database**: a second one's boot fails the first one's
   builds. *(TRAPS: `TWO VITEST`, `ONE control plane`)*
9. **`pnpm test -- <filter>` does not filter, and `pnpm --filter … test` runs from the package directory.** One
   file is `pnpm exec vitest run --project unit src/<path>`; the commit gate is `pnpm test` from the repository
   root. *(TRAPS: `does not filter`, `not the same command`)*
10. **Vitest strips types — and a named export that does not exist yet is `undefined`, not an import error**, so a
    new test can be green before its feature exists. `pnpm typecheck` is the only gate that sees a type. *(TRAPS:
    `strips types`, `NAMED EXPORT`)*
11. **A negative control that never applied reads as "cannot fail".** A `sed`/`.replace()` that matched nothing
    after Prettier reformatted the file; a status-only `404` satisfied by a route that does not exist; a text scan
    matching English prose; a control that committed into a project's git repository and survives `git checkout`.
    Prove the break applied (assert the match, read the `git diff`), and assert the refusal's CODE. *(TRAPS:
    `matches nothing`, `status-only`, `ENGLISH PROSE`, `GIT REPOSITORY`)*
12. **`packages/contract/openapi.json` is generated.** A route change is the definition, then `pnpm contract:write`
    (which truncates), then `pnpm contract:generate`; a stale copy turns `pnpm test` red. **So does registering or
    retiring an ERROR CODE, with no route touched** — the `ErrorCode` enum is the registry — and the generated client
    is `schema.d.ts`. **And since the authoring API plan's sitting 8, then `pnpm docs:write`**: `docs/api/reference/` and
    `llms.txt` are generated from the document, and a page older than it is a red `pnpm test` naming the page.
    *(TRAPS: `GENERATED from the route`, `REGISTERING AN ERROR CODE`, `THREE COMMANDS, NOT TWO`)*
13. **An applied migration is never re-run, and one applied with a line missing is replayed, not patched.** New SQL
    needs a new migration. `db:migrate` needs RUNBOOK's whole export block (*Running the control plane*) — the admin URL is derived, not in `.env`
    — and fails naming neither. *(TRAPS: `APPLIED drizzle`, `REPLAYED`, `ADMIN URL`)*
14. **The database's clock is not the host's** — Postgres runs in Docker Desktop's VM — and Postgres `now()` is the
    transaction's start. Never bound one with the other. *(TRAPS: `CLOCK`, `TRANSACTION's start`)*
15. **`.map(fn)` passes the array index as the second argument, and a field left out of a zod representation is
    stripped silently from every answer.** *(TRAPS: `PASSES THE INDEX`, `STRIPPED`)*

**The platform**

16. **A `200` from a `*.manifest.internal` name can be the edge's wildcard, not the app** — `manifest OK host=…
    scheme=https`, for ANY path. After `pnpm test:docker` every demo hostname answers it. Read the body. *(TRAPS:
    `wildcard`)*
17. **`console.manifest.internal` refuses every source but the host; a session's mutation must carry `Origin:
    https://console.manifest.internal`; and a sign-in completes only in the cookie jar that started it.** **Since the
    front-end enablement plan's sitting 6, `app.manifest.internal` is the same, with `Origin: https://app.manifest.internal`
    — each origin is judged by the `Host` it arrived on, and a session on one is not a session on the other.**
    `scripts/lib/api.sh` and `infra/lib/idp-login.sh` do all three. *(TRAPS: `refuses every source`, `Origin:`,
    `cookie jar`)*
18. **Config files are SINGLE-FILE bind mounts: edit them IN PLACE, then restart the container.** The Caddyfile,
    the IdP's `config.php` and `authsources.php`, and `infra/litellm/config.yaml` are bound to an inode. A save
    that writes a new file — the agent's edit tool, `git checkout`, `git pull` — strands the container on the old
    one, and `make up` does not apply a content change. Read it back with `docker exec … cat`. *(TRAPS: `bind
    mount`, `inode`)*
19. **Restarting the edge drops every runtime route, and a runtime route outlives its app** — the Docker tier does
    the first, any `pnpm test` the second. **Restarting the control plane the documented way signs everybody out**:
    RUNBOOK's export block makes a fresh session secret each time. *(TRAPS: `discards all runtime routes`,
    `OUTLIVES`, `SIGNS EVERYBODY OUT`)*
20. **`make reset` prompts** (`echo reset | make reset`), leaves both loopback aliases in place, leaves `make
    verify` one red until the migrations run, and has intermittently left the host unable to reach the edge.
    *(TRAPS: `make reset`)*
21. **The edge rate-limits 600 requests a minute per client IP**; a test loop faster than about ten a second gets
    `429` with no instance header. *(TRAPS: `RATE-LIMITS`)*
22. **A failed deploy is a `200` whose `state` is `failed`, and the previous instance keeps serving.** Check
    `state: healthy`, and never read the newest instance event as the environment's state. *(TRAPS: `FAILED
    DEPLOY`, `never becomes ready`)*
23. **Build log frames are never replayed** — merge `GET /v1/builds/{id}/logs` with the live stream — **and an
    empty `StartBuildRequest` builds the last VALIDATED manifest's commit, not the repository's HEAD.** *(TRAPS:
    `NEVER REPLAYED`, `StartBuildRequest`)*
24. **Docker cleanup: `docker network rm` fails while any container is attached** (the edge and DNS are on every
    app network), **`docker rm` without `-v` orphans anonymous volumes, and one image can carry two names.** Use
    the three cleanup scripts (`dead-app-resources.sh`, `litellm-orphans.sh`, `app-images.sh`), and name the metric
    when you count images. *(TRAPS: `network rm`, `orphans the
    container`, `two names`)*
25. **`make verify` needs Homebrew's OpenSSL on `PATH`, and removing `127.0.0.3` from `lo0` turns it into a
    ten-minute run.** *(TRAPS: `HOMEBREW`, `127.0.0.3`)*

**AI**

26. **The chat model is a THINKING model with thinking pinned off** — Ollama's `think: false` on `default-chat` and
    `default-chat-onprem` in `infra/litellm/config.yaml`; without it every answer is empty, with no error. The
    `-reasoning` names think by design. **S6's probe 14 needs the model resident**: warm it before `pnpm
    test:docker` (§2's box has the `curl`). *(TRAPS: `THINKING MODEL`, `PROBE 14`)*

**Git, for the D5 plan**

27. **A bare repository's `HEAD` is `master` unless it is created with `-b main`, and a clone of it "succeeds"
    empty. A bare `docker compose down` exits 0 and leaves a profiled service running. And since sitting 6, `main`
    is PROTECTED — by git on every driver-1 repository after one boot, by the fake on its `team` plan — so a
    force-push is refused and a test that rewrites `main` needs `plan: 'free'`.** *(TRAPS: `HEAD`, `compose down`,
    `plan: 'free'`, `RENDERED`)*

### The full catalogue — [`TRAPS.md`](TRAPS.md)

**All 234 entries that were in this section until 2026-09-24 are in [`TRAPS.md`](TRAPS.md), word for word**, with
*Images already pulled*. A plan or record that cites "ORIENTATION §4" or "§4's *Things that will cost you a
morning*" means that file. **Add a new trap there, and to the list above only if it belongs among the ones the next
sitting is most likely to hit.**

---

## 5. What the spikes established

Read the findings note before touching the area it covers. Do not re-derive any of it.

| Spike | Answer | What it settles |
|---|---|---|
| **S7** ~1.5 h of 3 days | **Yes**, with a zone change | Split-horizon DNS works via two dnsmasq processes. `.test` is unusable (Valet). Trust is needed in **three** places — macOS keychain, container trust stores, **and host Node processes**, because Node ignores the keychain. The custom `xcaddy` build works; **Coraza pins the Caddy version**. |
| **S2** ~0.5 h of 2 days | **Yes** | One `INSERT` into `saml20_sp_remote` registers a working SP on the next HTTP request — no file write, no reload, no restart, no cache TTL. **Manifest writes no PHP.** Attribute release fails **open**: a row with an empty `attributes` list releases everything. `pdo_pgsql` also needs `libpq-dev`. `database.*` and `store.sql.*` are different subsystems. |
| **S1** ~2 h of 3 days | **Yes** | A bare repo drives to a routed healthy container with a bound database, and **§11's `Driver` interface needed no revision**. Rootless BuildKit works — but *not* via buildx's own driver, which wraps it in a `--privileged` container. **Offline builds need base images pushed into the local registry**, not merely pulled. |
| **S3** ~2 h of 2 days | **Yes**, with three corrections | LiteLLM does everything §10 assumes and `ubc-genai-toolkit` needs no change. But **three defaults are wrong and all three fail silently** — see below. |

**S3's three, because they are the ones most likely to be forgotten:**

1. **Every key needs `allowed_routes`.** Otherwise an app key whose user came from
   `/user/new` can mint a child key **that survives revocation of its parent**.
2. **Every `embed()` needs `encoding_format: 'float'`.** Otherwise the OpenAI SDK's
   base64 default meets LiteLLM's Ollama path and you get **192 near-zero values
   where 768 floats belong** — no error, every other assertion green.
3. **The LiteLLM `user` must be `hash(puid ‖ project ‖ environment)`.** End-user
   budgets are global, so a bare PUID hash lets one app's exhaustion lock a student
   out of every other Manifest app.

---

## 6. How to work here

These conventions have held since P1 and are why the work has stayed
coherent. Follow them.

1. **Invoke the skill.** `superpowers:writing-plans` for a plan,
   `superpowers:subagent-driven-development` or `executing-plans` to execute one,
   `superpowers:brainstorming` before creative work. If a skill applies, use it.
2. **Ask before `sudo`, and before modifying anything outside your branch.**
   Installing a global tool counts. So does touching the spec.
3. **Green before you commit:** `pnpm test`, `pnpm lint`,
   `pnpm typecheck` (all three packages, since P5a Task 7) and `pnpm format:check`. All
   four, every time — `CLAUDE.md` says why the last two are not optional extras.
4. **Record exact versions.** Image digests, package versions, macOS and Docker
   Desktop versions. A finding without a version is not reproducible.
5. **Make the judgment call, then write down why.** Rich would rather you decide a
   routine question and record the reasoning as a documented decision than block on
   asking. Reserve questions for things that are genuinely his — spec changes, host
   changes, anything irreversible. P1's *Decisions this plan makes* section is the
   pattern.
6. **Capture negative controls.** "It works" is much weaker than "it works, and here
   it is correctly failing when I remove the thing that makes it work."
7. **Write for a reader who was not there.** Every one of these documents will be
   read cold by someone with no context. That is the normal case, not the exception.
8. **Close out properly — AT THE END OF EVERY SITTING, not at the end of the plan.**
   Update the roadmap ledger, sweep every document that states status, and leave the
   machine as you found it. **The sweep is the step that gets forgotten**, and
   forgetting it is how four documents once spent a day lying about the state of the
   project — and how the four HTML pages spent five days telling outsiders the project
   was "designed, not yet built" after it was neither.

   **WHY EVERY SITTING, AND NOT JUST AT THE END.** A sitting is one session, and the
   next one is a different agent with an empty window that will believe whatever these
   documents say. If a sitting ends without the sweep, the next agent starts by
   executing a task that is already done, or re-deriving a decision that is already
   made, or trusting a gate count that moved — and it will not know to doubt any of it,
   because everything here is written to be trusted. **The plan's own sittings table is
   the single most important line**: it is what says which task is next, and it is
   wrong the moment a sitting ends.

   This is also the step a session limit eats. **Budget for it**: leave enough room to
   sweep before you run out, and if you are close, stop a task early and sweep rather
   than finishing the task and leaving the documents lying. A finished task nobody can
   find is worth less than an unfinished one that is accurately described.

   Sweeping by memory is what fails, so here is the list. Check each one every time:

   | Document | What in it goes stale |
   |---|---|
   | `plans/2026-08-29-plan-roadmap.md` | **The ledger — update this first, it outranks the rest.** Spike status, the plan set table, *Order of operations* |
   | **THE FINDINGS COUNT** | **ONE PLACE: the roadmap's DEFECT-RATE TABLE** (Rich, 2026-09-20). Nothing else states it — not the plan's sitting headings, not its sittings table, not the roadmap's own prose rows, not this file's top-of-file box, not §7e. **Derive it, don't recall it**: `awk '/^### Sitting N —/,/^### Sitting N+1 —/' <the plan> | grep -cE '^[[:space:]]*([0-9]+\. )?\*\*F[0-9]+ '` — **the alternation is load-bearing**, because some sittings number their findings in a list and a bare `^\*\*F` grep reads those as zero, and do it at the CLOSE, **after** the post-sweep check and the final gate run, because both produce findings. *P6a sitting 6 is why: its count moved THREE times — 15 → 17 → 18 → 19 — across SIX documents, and the test count moved twice beside it. Every move was caught, and only by grepping the phrase each time.* **Finished plans' prose keeps its historical counts** (P1–P5c): they cannot drift, and rewriting them buys nothing — but do not read them as licence to restate a LIVE plan's. |
| **The plan's own SITTINGS TABLE** | **Added 2026-09-09. The first thing to change and the easiest to forget** — it is at the top of the plan, it says which sitting is next, and a stale one sends the next agent at a task that is already committed. Mark the sitting done, move the `← next` marker, and say how many findings it produced |
   | **The plan's *What executing this plan found*** | One dated section per sitting: the tasks, every defect with the measurement that found it, the negative controls, and the gate numbers at the end. **This is the record that stops the next agent repeating the work rather than continuing it** — and it is where a defect that is not worth fixing yet gets named instead of lost |
   | `ORIENTATION.md` | **§7e, §2's numbers box and the top box's *Last verified* line, every sitting — REPLACE, never append.** §7e is one of the TWO places the next job is stated; the other is the current plan's sittings table (Rich, 2026-09-24). The top box, §2 and §7's preamble point at §7e and state no job and no sitting's story — a sitting's story goes in its plan's *What executing this plan found*, which is how this file grew to 325 KB before it was trimmed on 2026-09-24. §2's plan table when a plan starts or finishes; §3's *What the platform keeps true* when an invariant changes; a new trap in `TRAPS.md`, and in §4's curated list only if it belongs there; §8 when something becomes or stops being Rich's call |
   | `README.md` | **Usually nothing.** Since 2026-09-24 it is a short description of what Manifest IS — no status, no job, no numbers, and its *Running the control plane* moved to RUNBOOK. Sweep it only if what Manifest is changes |
   | `TRAPS.md` | **Added 2026-09-24**, when §4's catalogue moved there. A new trap goes at the end of it; §4's curated list gains it only if it is among the most likely to cost the next sitting |
   | `RUNBOOK.md` | **Added to this list 2026-09-09, having been missed once.** Its *C1's acceptance* preamble restates the CURRENT `make doctor` / `make verify` totals beside the dated 2026-09-05 ones, so it drifts every time a check lands — and it is the document a new agent opens to run the platform |
   | `WALKTHROUGH.md` | **Added 2026-09-15.** Its *What is built* status lines, and any URL, command, test user or demo that changes. It deliberately states no counts — keep it that way |
   | `CLAUDE.md` | The *State* section — **only when a plan starts or finishes, or an item in its *Outstanding, and Rich's* line moves.** It points at §7e and states no job, no sitting and no gate numbers (Rich, 2026-09-24) — keep it that way; every fact it used to repeat is in this file, the roadmap or a plan |
   | `specs/manifest-schematic.html` | **Shared outside the team.** The `Status` line in the header, the footer, and the "no user interface has been built yet" disclaimers |
   | `specs/manifest-phases.html` | **Shared outside the team.** The spike section — how many have run, what they answered, where the remaining ones sit |
   | `specs/manifest-decisions.html` | **Shared outside the team.** Drifts when a **decision** changes, not when status does — check it after any spec action is applied |
   | `specs/manifest-stories.html` | **Shared outside the team.** Hostname examples, which must match §23's zone rule |
   | `docs/external-track.md` | Owners and states of the UBC items |
   | `machine-baseline-*.md` | **Do not edit these.** They are dated evidence. Re-run `scripts/snapshot-machine.sh` and add a new one |
   | **`scripts/ci-acceptance.sh`** | **Added 2026-09-20, having gone stale the FIRST time the numbers moved.** Its four `EXPECT_` lines are the gate numbers in CODE — `EXPECT_TESTS`, `EXPECT_FILES`, `EXPECT_DOCTOR`, `EXPECT_VERIFY` — and P6a sitting 2 moved doctor to 19 and verify to 54 while this file kept 18 and 51, because every list of what to sweep named only DOCUMENTS. It reports `MOVED` rather than `FAIL`, so a stale copy is quiet: `make ci-acceptance` would have read *"counts moved: expected 18, got 19"* and nobody would have seen it until the next full run. Found by P6a sitting 3 by opening the file |

   **THE GATE NUMBERS LIVE IN FOUR PLACES: TWO DOCUMENTS (ONE OF THEM TWICE) AND ONE SCRIPT** — README stopped
   stating them on 2026-09-24 — and they move
   whenever a check or a test file lands — which is most sittings. `make doctor`, `make verify`, `pnpm test` and
   `pnpm test:docker` are stated in **ORIENTATION's TOP-OF-FILE BOX**, in **ORIENTATION §2's numbers box**, in
   **`RUNBOOK.md`** — and **`scripts/ci-acceptance.sh`'s four `EXPECT_` lines are a fourth
   copy, in code**, which this sentence said nothing about until 2026-09-20 and which was therefore stale from P6a
   sitting 2 until P6a sitting 3 found it. `CLAUDE.md` stated them too until 2026-09-16 and now deliberately does
   not — do not add them back. One `grep` catches the documents, and **the script needs its own**, because
   its numbers are bare assignments that match none of these patterns: `grep -n 'EXPECT_'
   scripts/ci-acceptance.sh`.

   ```bash
   grep -rn "make doctor\|pnpm test\` \|checks / 0 failed\|passed, .* files" \
     ORIENTATION.md RUNBOOK.md   # from docs/superpowers
   ```

   Update them together or not at all. A half-swept set is worse than a stale one,
   because the disagreement makes every number suspect — which is exactly why §2's box
   says in its own text that it is the only current one and wins any disagreement.

   **AFTER THE SWEEP, RE-READ YOUR OWN §7e AS A COLD AGENT AND CHECK ITS CLAIMS — THIS HAS NOW FOUND A DEFECT IN
   EVERY ONE OF P5b's SITTINGS 3, 4, 5, 6, 7, 8 AND 9 — EVERY SITTING FROM THE THIRD TO THE LAST, WITHOUT
   EXCEPTION; IN SITTING 7 IT FOUND THREE, IN SITTING 8 SIX AND IN SITTING 9 THREE.** *This list of sittings is the
   ONLY statement of that count; §7e points here rather than restating it, because sitting 7 found §6 saying "four"
   and §7e saying "six" when the records said seven — F13's own shape, in the pair F13 did not sweep (F14).* What
   it has caught: two wrong numbers in one hand-off (`65cc59c`, `7fce531`, sitting 3); a correction block called
   "one paragraph" when it had two, so a summariser dropped the half that contradicted the next task's own test
   (`b8f6111`, sitting 4); two more in sitting 5, both derived by subtracting from the previous sitting's figures
   instead of counting; a recount in sitting 6 that stated a number nobody had measured; and in sitting 7 two
   drifted counts **and an ordered run list that omitted the one step the sitting's whole deliverable rested on** —
   which is the kind this check had not caught before, because every earlier one was a wrong fact and that one was
   a missing one; and in sitting 8 THREE: a hand-off that said the RUNBOOK *lists* the demo's nine steps where the
   RUNBOOK groups them into seven; **a claim about this plan's own record that was wrong at both ends** — *“a
   control that could not fail in every sitting but the first two”*, when sitting 2's F14 found one and sitting 8's
   was a different shape; and **§2's P5b paragraph still saying “six sittings are done” while §2's own box said
   eight**, stale for two sittings. **All three were found by opening the thing pointed at and counting it, not by
   re-reading the sentence** — and the third says what to grep for after fixing a restated number: **the PHRASE,
   never the number**, because the stale copy carries a different number by definition. **The last three were worse
   than the first three**, and all three came from the same cause: a state table written from what the sitting DID
   rather than from a query at close. The gates run LAST and `pnpm test` TRUNCATES, so the sitting's own narrative
   is stale about the database the moment it finishes — one of the three told the next agent that `student` had
   signed in, which **disarms the very trap §7e names as most likely to cost them the sitting**. **And in sitting 9
   three, two of which were the SAME CLASS AGAIN**: a claim that *"two of §8's open questions are P5c's"* when §8
   has one (found by opening §8 and counting its bullets), and *"§10's FIRST PARAGRAPH is that §17's Phase 1c row
   is not P5c's scope"* when §10's first paragraph is about the brief's stale sections and the Phase 1c statement
   is three paragraphs later — **a claim sitting 8 wrote into Task 13's own step list, which sitting 9 then
   propagated into FIVE documents before the check opened §10 and read it.** That is the strongest argument this
   list makes: **a wrong pointer is inherited and multiplied by the next sitting, because the next sitting trusts
   the hand-off it is told to trust.** Both were found by opening the thing pointed at; neither is visible from the
   sentence. **Write the state table from `psql`, `docker` and `curl` at close, never from memory of the session**,
   and name the command beside any number. The sweep is written by the one person in the project who cannot read it
   cold, and a handover defect costs the next sitting more than a code defect, because the next agent has no way to
   know to doubt it.

   **Check, do not re-read.** Every defect found this way was found by *verifying a
   claim*, not by reading the prose again:

   - **Count what you summarised.** Sitting 4's defect was one word — a correction
     block called *"one paragraph"* when it had two, so the paragraph the summariser
     did not need vanished, and it was the one that contradicted the next task's own
     test. Open what you pointed at and count it.
   - **Grep for every file, export and command you named**, rather than trusting that
     you wrote it correctly an hour ago.
   - **Re-derive every number**, rather than subtracting from the last one.
   - **Open the next task and read it as the next agent will.** Its snippets are where
     a wrong hand-off actually bites.

   **The four HTML pages are the easiest to forget and the most expensive to get
   wrong**, because Rich shares them with people outside the team and nothing in the
   build checks them. They are also the slowest to drift: their architecture stays
   right for months while their *status* is wrong within days. Most sittings do not
   touch them — a pinned digest or a reconciliation pass is invisible to an outsider —
   but **check rather than assume**, and say in the session record that you checked.

9. **YOU ARE PROBABLY NOT THE ONLY AGENT IN THIS REPOSITORY, AND THE COMMIT RULE FOLLOWS
   FROM THAT.** Rich runs several sessions at once. They should not be touching code, but they
   **do** add markdown files and assets and they **do commit on `main` while you work** — P6a
   sitting 1 watched `HEAD` move under it twice (`45e5b9d`, `c68481a`) and found two untracked
   files that were not its own.

   - **Commit on `main`. No branch, no worktree, no push.** `superpowers:executing-plans` and
     `using-git-worktrees` will both push you the other way; **Rich gives the consent, and it
     is recorded here rather than in each plan** so that a sitting need not re-derive it.
   - **NEVER `git add -A`, `git add .`, `git commit -a` or `git checkout .`.** Stage the paths
     you actually changed, **by name**, every time. A parallel session's file was swept into an
     unrelated commit exactly that way on 2026-09-19. (`git checkout <path>` on a file *you*
     changed is fine and is how a measurement restores itself — it is the bare `.` that is
     destructive.)
   - **Before committing, run `git status` and account for every path.** Anything you cannot
     explain belongs to somebody else: leave it alone — do not stage it, revert it or stash it.
   - **A `HEAD` you did not expect is normal, not a conflict.** Nothing is pushed, so there is
     nothing to reconcile; land on top of it. If you amend, check first that `HEAD` is still
     your own commit.
   - The same rule protects them from you, which is the real reason it is not negotiable.

### Your first ten minutes, in this order

Establish a baseline before you change anything — every session that skipped this spent longer working out whether
a red result was theirs.

```bash
./scripts/snapshot-machine.sh > <scratchpad>/before.txt  # read-only, no sudo, no network
make up                                                  # ~1 min; re-adds the loopback alias
make doctor && make verify                               # expect §2's box
pnpm test                                                # expect §2's box
pnpm lint && pnpm typecheck && pnpm format:check
curl -s --cacert infra/ca/manifest-root.crt \
  https://idp.manifest.internal/module.php/saml/idp/metadata | head -3   # signed metadata, entityID …/idp/shibboleth
```

**Reading the big files.** This file is ~1,700 lines and the current plan ~3,700, many of them long: one Read of a
few hundred plan lines can exceed the tool's 25k-token limit and fail. Outline first — `grep -n '^## \|^### '
<file>` — then read by section with an offset and a limit of ~150–250 lines. The plan's Tasks are `## Task N:`
headings; read the one you are on in full, never from memory.

**`pnpm test:docker`** (~15 minutes, `make up` first, §2's box has the count) is owed by any change to `runtime/`,
`routing/`, `services/`, `build/`, `releases/`, `identity/`, `sso/`, `secrets/`, `projects/`, `blueprints/`, `ai/`,
`observability/`, `infra/` or a `*.docker.test.ts` — and whenever the current plan's sittings rule says so, which
wins. One Docker file, **from the repository root**: `MANIFEST_TEST_DOCKER=1 pnpm exec vitest run --project docker src/<path>`. **Restart the
control plane after it.**

**`make demo` is worth one run before you start** — RUNBOOK's *Running the control plane* first. It is the only
thing that exercises boot, build, release, deploy and the edge through the real HTTP surface.

---

## 7. What to do next

**The next job is §7e.** *This preamble deliberately does not restate it (Rich, 2026-09-24): the job is stated in
exactly TWO places — §7e and the current plan's sittings table — so those are the only two a sitting changes.* Each
plan's own *What executing this plan found* is its record. The roadmap's ledger outranks this section on status.

### 7a. The executed plans, and which of their records to read first

*Until 2026-09-16 each executed plan had a hand-off section here — P1 was §7a, P2 §7b, P3 §7c, P4a §7d, P4b §7d-2,
P4c §7d-3 — and a paragraph per sitting in §2. What in them was durable is now §3's* What the platform keeps true
*and* What it deliberately does not do yet*, §4 and §9; the rest was each plan's history, which is in that plan's
record, and in this file as it stood at `191cc60`. A plan or brief that cites one of those sections means the plan
named in the row below.*

| Plan | Record | Acceptance | Read first |
|---|---|---|---|
| **P1** | [`plans/2026-08-30-p1-local-substrate.md`](plans/2026-08-30-p1-local-substrate.md) | `make doctor`, `make verify` | 18 defects in 13 tasks, and **six were checks that passed while the thing under test was broken or absent**. The second-machine clean clone is untested. |
| **P2** | [`plans/2026-08-29-p2-control-plane-spine.md`](plans/2026-08-29-p2-control-plane-spine.md) | its unit tier; `lifecycle.test.ts` | 52 defects: six type errors no test could catch, five test-isolation defects, a login shim one line from an authentication bypass, and a boot entry point nothing had ever executed. |
| **P3** | [`plans/2026-08-31-p3-docker-driver-deploy-spine.md`](plans/2026-08-31-p3-docker-driver-deploy-spine.md) | `make demo` | **Sessions 4 and 5**: no build had ever succeeded (a `# syntax=` directive the egress-free builder could not fetch, and a `.npmrc` that arrived after `npm ci`), and then no deploy — seven defects of one shape behind 74 green Docker tests. S6 ran as its Task 18 ([`spikes/S6-findings.md`](spikes/S6-findings.md)). |
| **P4a** | [`plans/2026-09-07-p4a-identity-secrets-injection.md`](plans/2026-09-07-p4a-identity-secrets-injection.md) | `make demo-identity` | 80 defects in seven sittings. **Session 5's first**: §20's audit grant was unimplementable while the application connected as a superuser. The acceptance passed first time and eight defects came out of disbelieving it. |
| **P4b** | [`plans/2026-09-07-p4b-ai-events-streaming-incidents.md`](plans/2026-09-07-p4b-ai-events-streaming-incidents.md) | `make demo-ai` | 140 findings in ten sittings. **Sitting 9**: the plan's stream authorized after the upgrade and could not pass its own test. **Sitting 10**: every embedding had been charged to nobody. |
| **P4c** | [`plans/2026-09-15-p4c-zero-downtime-redeploys.md`](plans/2026-09-15-p4c-zero-downtime-redeploys.md), with [its brief](plans/2026-09-15-p4c-brief.md) | `make demo-redeploy` | 70 findings in eight sittings. **Sitting 8**: four of the acceptance's nine negative controls could not fail in it — §4 says which tier sees each. |
| **P5a** | [`plans/2026-09-16-p5a-the-contract.md`](plans/2026-09-16-p5a-the-contract.md), with [the P5 brief](plans/2026-09-16-p5-brief.md) | `make demo-journey` | 146 findings in twelve sittings. **Sitting 12**, the acceptance: three of fourteen negative controls could not fail as written — including one where the journey read a *status* while the property was a *latency*, so a synchronous build passed R6's own check. **Sitting 10's finding 1** is the other one to read: the document said for six sittings that the error envelope could not carry the field the production refusal had been sending since P2, because nothing parsed an error body through its schema. |
| **P5b** | [`plans/2026-09-17-p5b-delegated-tokens.md`](plans/2026-09-17-p5b-delegated-tokens.md) — **EXECUTED 2026-09-18**, all nine sittings | `make demo-token` — green three times, the third from a `make reset` machine; step 9 of the offline acceptance | 116 findings in nine sittings. **Sitting 9's F1 is the newest one to read, and it is a lesson about PREDICTIONS**: sitting 8 predicted Task 13's control (a) would be invisible to the acceptance, and it turns three checks red — the reasoning was about the FIXTURE token, which holds the privileged capability and is refused identically either way, while every REAL token lacks it and is refused by a different rule with a different code. **Sitting 9's F3** is the second: replacing the token secret's constant-time comparison with `===` left all 1342 tests AND all nine demo steps green, so the property was asserted by nothing; it is now asserted at the source, and the first draft of that assertion could not fail. **Sitting 9's F8**: one `pnpm test:docker` run recreates exactly the seven dead app networks cleared by hand the same day. **Sitting 8's F1 is the newest one to read**, and it is what the first integration client is for: **`subscribe` could not carry a delegated token at all**, so an agent could start a build through the generated client and had nothing to watch it end on — the route had accepted a bearer all along, and nothing server-side could see the hole. **Sitting 8's F4 and F5** are the second: **three of its five negative controls answer `403` for the WRONG REASON** — the privileged rule disabled makes the refusal a dead-end `403 FORBIDDEN`, confirm reverted answers `403 TOKEN_ACTION_PENDING`, the fleet reverted answers `403 FORBIDDEN` — so a status-only demo passes all three. **Sitting 7's F4**, and it is a JavaScript trap rather than a platform one: `toToken` was given an optional `now: Date = new Date()`, and `api/routes/tokens.ts` maps it as `.map(toToken)` — so `now` arrived as the ARRAY INDEX, `0`, and every token in every list read `expired: false`, including one that had expired an hour before. Only the assertion about an expired token could see it. **Sitting 7's F2** is the one after that: the plan's own `Promise.all` control for a read-then-insert **passed against the defect**, because `pg.Pool` establishes a connection per acquire and the five calls serialised — a warm pool is what makes a pooled race observable, and a deterministic SQLSTATE test belongs beside it. **Sitting 6's F5:** two of that sitting's own four new tests were green before the feature, because both were *"is not limited"* claims — and a claim that something is NOT refused is true of a platform that refuses nothing. A negative claim needs a positive control in the same test. **Sitting 4's F1** is the one to read: the plan's own negative control for the ORDER of the two token checks could not fail against any of the 31 tests that existed, because every test writes a token holding the privileged capability and **no token the platform can mint can hold one** — so the swapped order answers a dead-end `403 FORBIDDEN` for every real token, with D24's loop unable to start, and all 31 green. **Sitting 2's F1**: the plan's token parser split on `_` while base64url's alphabet contains it, so it refused 47.5% of the tokens the same file minted — and the round-trip test minted ONE token, so it would have gone red about half the time and read as a flaky harness. **Sitting 2's F14**: the plan's own TRUNCATE negative control cannot fail, because the statement's CASCADE reaches both new tables unnamed. **Sitting 3's F1**: `DELETE /v1/tokens/{tokenId}` is the API's first bodyless mutation, and the contract layer could not carry one — the route answered `400` before its handler ran and the OpenAPI document could not be generated for it at all, because both kept on `method === 'GET'` rather than on the body schema. **Sitting 3's F13**: three of that sitting's own negative controls answer `403` for the WRONG REASON, so a status-only assertion is green through all of them. |
| **P6a** | [`plans/2026-09-19-p6a-first-production-launch.md`](plans/2026-09-19-p6a-first-production-launch.md), with [the P6 brief](plans/2026-09-19-p6-brief.md) — **EXECUTED 2026-09-22**, all eleven sittings | `make demo-production` — green on the fresh path, the re-use path and from a `make reset` machine; step 11 of the offline acceptance; **and a whole launch clicked by a person** | **Sitting 11's F6 is the one to read**: the acceptance's own control (e) stayed GREEN because `applyRoute` patched an existing route in place, so a production route kept whatever listener held it — a fail-open in the control the plan exists to build, found only by asking why a control was green. **Sitting 11's F2** is its mirror image in the instrument: a pooled keep-alive socket reported the production app on the internal listener when it was not there, and in the other order would have hidden a real leak. **Sitting 9's F5**: §8 sends a production app to real UBC Shibboleth, so R2's rehearsal could not pass on this laptop until `InjectionContext.purpose` existed. **Sitting 10's F17 and sitting 11's F10**: two console defects no gate could see, both found by clicking. |
| **P6b** | [`plans/2026-09-22-p6b-subsequent-releases.md`](plans/2026-09-22-p6b-subsequent-releases.md) — **EXECUTED 2026-09-23**, all seven sittings | `make demo-releases` — green fresh, re-use and from a `make reset` machine; step 12 of the offline acceptance; **clicked by a person, stale path included** | **Sitting 7's F3 is the one to read**: the acceptance's own baseline derivation used release order where the platform uses decision order, agreed on every path until the first run after the clicked half, and would have gone red for the wrong reason there — a client that re-derives a platform rule must implement THE rule. **Sitting 7's F9 and F10** are what the next plan inherits: the model's summary invented an administrator's verdict before anyone decided, and the console's *Sign out* leaves the IdP session alive. **Sitting 1's F1** is the plan's best: the egress proxy never re-rendered its allowlist, so a removed host stayed reachable — found by a measurement, fixed as Task 5a, and held by the acceptance's control (i). |
| **D5 driver 2** | [`plans/2026-09-24-d5-github-source-driver.md`](plans/2026-09-24-d5-github-source-driver.md) — **EXECUTED 2026-09-25**, all eight sittings | `make demo-github` (driver 2) — green fresh, re-use and from a `make reset` machine; step 13 of the offline acceptance; `NOT RUN` in `make ci-acceptance` on driver 1; **clicked by a person on both drivers**; the real conformance leg 17 of 17 | **Sitting 8's F11 and F12 are the ones to read**, found by the plan's one fresh whole-branch review: a path into a worktree's own `.git` could be written on both drivers (`core.fsmonitor` is code execution — latent until the authoring API supplies paths), and a push a read synced first was never validated. **Sitting 8's F15/F16**: `make demo` and `make demo-token` were red for five days after P6a's step-up because nothing ran them. **Sitting 1's F6**: one rewrite of GitHub's `main` froze a non-forced mirror's `main` for ever — the two-refspec mirror is its fix. **Sitting 4's F6**: without `repositoryOf`, a GitHub-mode control plane BUILT a driver-1 project. |
| **Authoring API** | [`plans/2026-09-25-authoring-api.md`](plans/2026-09-25-authoring-api.md) — **EXECUTED 2026-09-27**, all ten sittings | `make demo-authoring` — either driver, green three times on EACH; step 14 of the offline acceptance; a step of `make ci-acceptance`; **clicked by a person on the platform** | **Sitting 10's F5 and F6 are the ones to read**, found by the plan's one whole-branch review: a commit that LANDED could be answered 5xx and left unrecorded (so the documented retry was `SOURCE_CONFLICT` and its attribution lost), and one idempotency key replayed another resource's answer (the record keyed on a route TEMPLATE, fingerprinted over a body of only `{ value }`). **Sitting 10's F1**: the acceptance's own app signed nobody in, silently — a CWL app without `express.urlencoded` — and only the app's identity check saw it. **Sitting 10's F15–F19**: a fresh agent built an app from the served docs alone, and its five guesses are the guides' gaps. **Sitting 2's findings** are the write path's: a race lost inside git's receive-pack is not `[rejected]`, and the plan's own push reader would have read a refused push as success. **Sitting 5's F3/F4**: the idempotency record kept an unkeyed hash of a secret's value, and a delegated token's plaintext. |
| **Front-end enablement** | [`plans/2026-09-27-front-end-enablement.md`](plans/2026-09-27-front-end-enablement.md) — **EXECUTED 2026-09-29**, eighteen tasks in fifteen sittings | `make demo-frontend` — either driver, green three times on EACH (fresh, re-use, from a `make reset` machine); step 15 of the offline acceptance; a step of `make ci-acceptance`; seven negative controls seen red; **clicked by a person** | **Sitting 12's F19 is the one to read**: `409 PROJECT_ARCHIVED` was answered by 23 operations and declared by NONE of the 66 — found only by the plan's one whole-branch review, because each sitting's own review saw one sitting's routes; a route now states its capability and one function decides both the refusal and the declaration. **Sitting 12's F16/F17** are the process ones: the classifier refuses a control that weakens security even after Rich's yes (he ran them from a script he read), and a `make reset` can leave the edge's public listener resetting the host, which only `make verify` sees — control (a) went red for that reason first. **Sitting 8's findings**: Decision 27's *"a token cannot reach an archived project"* was false in three race windows. **Sitting 11's Critical**: the guides presented the person's own actions as a front-end SERVER's pattern. |
### 7e. Write the next plan — the faculty front-end's LAUNCH PATH (FE-6, FE-25), with REAL GITHUB in its Task 1 ← **START HERE**

**The front-end enablement plan is EXECUTED** (2026-09-29, [all eighteen tasks in fifteen sittings](plans/2026-09-27-front-end-enablement.md);
its acceptance, `make demo-frontend`, green three times on EACH driver and inside `make ci-acceptance`, the offline acceptance's step
15, seven negative controls seen red, a person clicking it — its *Sitting 12* is the record). **No plan is written or being executed.**
Fourteen plans are executed (§2's table).

**THE NEXT JOB, IN RICH'S ORDER** (the roadmap's *The faculty front-end's message*, his *"Launch path first"* of 2026-09-27): **write
the plan for the faculty front-end's launch path** — **FE-6**, the three clocks (the staging registration, the production registration,
the privacy assessment: D19's generated drafts, an owner's *"I've sent it"*, a state that can say *waiting since*, the staging
registration as a tracked object like `IamRegistration`), and **FE-25**, an owner's *"please sign this off"* for a release, feeding
§26's queue (today no administrator is told and nothing records it). **And, Rich's additions of 2026-09-29, each a task of the next plan, not a plan of its own** (§8 *Decided*'s first lines): **the
GitHub driver run against REAL GitHub**, and **a session holding a model its project no longer allows TRIMMED in place rather than
ended** (measured first, with a spec action for §7's sentence). **Then** the vulnerability database in the console (§8
*Decided*). Plan-writing house style: `superpowers:writing-plans`, [`plans/2026-09-27-front-end-enablement.md`](plans/2026-09-27-front-end-enablement.md)
as the newest example — a Task 1 that measures, sittings approved by Rich, spec actions drafted with options and a recommendation.

**RICH WANTS TO SEE APPS CREATED THROUGH THE PLATFORM END UP ON GITHUB — `.env` KEEPS `MANIFEST_SOURCE_DRIVER=github`, BY HIS
DECISION** (2026-09-29, after sitting 12's close: *"I'm keeping it in, I want to see apps created through the platform end up on
github"*). **But that line alone is driver 2 against the GitHub FAKE's defaults, not real GitHub**: at the close none of `.env.example`
section 2a's six real-App settings was set (checked by counting lines — **never print `.env`**). For REAL GitHub all six go in together,
and none is a secret (the key is a file, `infra/secrets/github-app.pem`, `-rw-------`, git-ignored — never read or print it):

```
MANIFEST_GITHUB_API_URL=https://api.github.com
MANIFEST_GITHUB_GIT_URL=https://github.com
MANIFEST_GITHUB_ORG=Manifest-local-dev
MANIFEST_GITHUB_APP_ID=5068172
MANIFEST_GITHUB_INSTALLATION_ID=164652178
MANIFEST_GITHUB_APP_KEY=infra/secrets/github-app.pem
```

**What a restart onto real GitHub does** (RUNBOOK *The control plane on driver 2*, `.env.example` 2a): every project CREATED makes a
real PRIVATE repository in `Manifest-local-dev`, which nothing deletes (remove them on github.com by hand); every source operation
needs the network; GitHub cannot reach a laptop, so there are NO webhooks — a person's push on github.com is seen at the next read
(Re-validate, or a build); on the FREE organisation `main` is NOT protected, and the project says so in GitHub's words; never reuse a
slug across the fake and the real App. **Every project made on driver 1 answers `409 SOURCE_PROVIDER_MISMATCH`** after the restart —
the faculty front-end's `my-weekly-thoughts` and `notes-and-answers` included, made in ITS real-platform acceptance after the close —
and every driver-1 demo stops at its driver check (`make demo-github` and, with the fake, the others' driver-2 runs are the ones that
work); `pnpm test:docker` from a shell that sourced `.env` boots its control planes on driver 2. **The control plane running at the
close (PID 63494) started BEFORE the line, on driver 1: nothing has changed until it is restarted. Read the boot line's `"source"` and
`"github"` after any restart.**

**ASK RICH IN THE FIRST MESSAGE:**
1. **The order**: write the plan (the launch path, FE-6 and FE-25, with the additions in §8 *Decided*'s first lines), whose **Task 1
   measures and RUNS REAL GITHUB** — and **run Task 1 in the same session, straight after writing, before his review of the rest?** The
   front-end enablement plan's sitting 1 did exactly that at his word, and it is the quickest way to what he asked to see. Recommend yes.
2. **The real-App settings** — he adds the six lines above to `.env`, or tells the agent to append them (never printing `.env`).
3. **The network on, and his yes** — the run creates real private repositories in `Manifest-local-dev`. And **when to restart the
   control plane**: ask the faculty front-end's session first (`ListAgents`) — a restart strands its driver-1 projects mid-acceptance.
4. **Does the plan carry FE-33, FE-34 and FE-38?** (`manifest-app/docs/api-findings.md`; the front-end's session has the platform's
   recommendations, sent at his request: FE-33 — revoking, archiving, deleting or expiring a token closes its streams, `4401`, also the
   review's M6; FE-34 — the capable model's fallback only for an unreachable or failing provider, measured first in LiteLLM 1.98's router;
   FE-38 — `createdAt` on `Instance` and `InstanceSummary`), and F26's test fix — **his word.**
5. **`make refresh-vulndb` — next due after 2026-10-06** (network on; ~1–3 minutes; only Docker Desktop needs to be up).

**WHAT THE NEXT PLAN INHERITS** (the front-end enablement plan's *What this plan does not build* and its *Sitting 12* deferred list —
read both): **M4, DECIDED by Rich at the close — removing a member revokes their tokens and ends their agent sessions (§8
*Decided*; a spec action for §10's *Agent key* row and the *DelegatedToken* rule first)**; the whole-branch review's M1 (a restore after a part-way teardown: `teardown_finished_at`), M3 (the fleet's `name`,
`state`, `archivedAt`), M5 (a non-default capable fallback below `confidential`), M6 (a stream opened before an archive or a revoke
stays open — the front-end's FE-33); `AI_UNMAPPED` undeclared on the session routes and `revokeToken`'s 503-after-revoke unsaid; a secret driver 1's hook
catches answering `SOURCE_GIT_FAILED` (its F18); a crashed-at-start app probed for ~2 minutes (F13); the reference console's
create field labelled *Name* holding the slug (F12); **and a deploy's retire pass outliving its unit test, which can deadlock the
next test's `TRUNCATE` (F26: `api/delivery.test.ts`, 2 of 8 runs) — a red there is that trap, not the code; re-run the file.** **Every one is named, none is urgent.**

**THE FRONT-END'S SESSION** (`ListAgents`; the memory *a peer may open the next sitting*): at sitting 12's close it was
**`manifest-app-9d`** — its F4 plan's sitting 7, the real-platform acceptance — holding 7102 (its mock, pid 93237 — restarted today; it was 28239) and 7105 (its server,
mock mode, pid 6548); **it will message before it touches 7100, and waits for Rich's yes.** A session name changes at every handover —
`ListAgents` immediately before every promised message; **heads-up, read its delivery, THEN commit** anything in `packages/contract` or
`packages/mock`.

**WHERE A PLAN-WRITING SITTING STOPS, AND HOW IT ENDS.** The plan written, self-reviewed, committed, and put to Rich with its sittings and
spec actions — never executed in the same session. No test tier is owed by a document. The close: the roadmap's ledger, this §7e, §3's
map, CLAUDE.md's *State* (a plan WRITTEN), and the cleanup scripts if anything ran.

**THE MACHINE, AS SITTING 12 LEFT IT — queried at its close, 12:11 on 2026-09-29, not remembered:**

- the control database **EMPTY at 12:11 — 0 projects, 0 users, 0 agent sessions, 0 instances, 40 migrations** (`psql`) — the tests truncated
  last; **since then the faculty front-end's real-platform acceptance, Rich clicking, made `my-weekly-thoughts` and `notes-and-answers` (driver
  1) with their agent sessions** — the latter raised to `confidential` by its own building agent, which ended its sessions `models_withdrawn`
  (§8 *Decided*'s key trim) — and the front-end fixed a 60 s model timeout its round had (`0dca1e9` in `manifest-app`);
- **21 `mf-` containers with no rows behind them** (`make ci-acceptance`'s demos and driver 2's `frontend-github`); `make verify`'s INFO
  `mf- containers=21 networks=7 volumes=14`;
- **THE CONTROL PLANE RUNNING** — PID 63494 on 7100, **driver 1**, from Rich's `.env` by the git-ignored
  `.superpowers/sdd/2026-09-27-front-end-enablement/s11a-cp-start.sh` (RUNBOOK's block plus `MANIFEST_CAPABLE_MODEL`), on `11f2526` —
  boot line `"capableModel"`, `"agentBuilderModels":"capable"`, `"agentSessionsWithdrawn":{"ended":0,"failed":0}`;
  **7102 and 7105 are the faculty front-end's** (its mock and its server in mock mode) — never stop them;
- **Ollama**: `qwen3.5:4b` and `nomic-embed-text` resident, the 27B unloaded; LiteLLM 4 users; the GitHub fake absent (its container
  removed, its volume kept); the vulnerability database built `2026-09-29T06:32:31Z`;
- the three cleanup scripts clean after `--apply`; `make doctor` 20/0/0; `make verify` 61/0/0;
- **not this project's**: `docker-simple-saml-saml-idp-1` RUNNING and `cwl-spike-*` / `openwebui-openwebui-1` containers, started ~11:00
  on 2026-09-29 by another project's session — leave them.

**Query it again at open** — `docker exec manifest-postgres psql -U manifest -d manifest_control`, `docker ps`,
`lsof -nP -iTCP:7100 -sTCP:LISTEN` — because Rich, or the front-end's sessions, will have used it since.

**THE TWO RULES A SITTING CANNOT GET FROM ANYWHERE ELSE**, restated because they live only in each plan's *Global
Constraints*:

- **COMMIT ON `main`, AND STAGE YOUR OWN PATHS BY NAME — §6 RULE 9 IS THE FULL RULE AND THIS
  LINE DELIBERATELY DOES NOT RESTATE IT.** Read it: **other agents are working in this
  repository at the same time as you** — and a SECOND REPOSITORY now depends on this one's working tree (the faculty
  front-end links `packages/contract`, and runs `packages/mock` from source) — and `superpowers:executing-plans` and `using-git-worktrees` will both push you toward a
  branch you must not make.
- **Ask before `sudo`, and before touching anything outside the repository** — `~/Developer/manifest-app` included.
  §6 rule 2, and CLAUDE.md's *Non-negotiables* has the rest.


## 8. Decisions waiting on Rich

Surface these; do not decide them. **When one is decided, move it to *Decided* as one line naming where the
reasoning is recorded.**

### Open

- **FE-28 TO FE-32 — RELAYED AS RICH'S DECISIONS, TO CONFIRM (2026-09-28); FE-26 AND FE-27 CONFIRMED BY RICH AT SITTING 10's OPEN
  (*"Both join Task 13"*) AND BUILT THERE (`18f3214`) — *Decided*.** The faculty front-end's session sent them to sitting
  9b as *"Rich's decisions … carried at his word"*, and its `docs/api-findings.md` records each as option (a): FE-28
  (`__Host-manifest_session`), FE-31 (`listBlueprints` offers only blueprints meant for people) and FE-30 (a request id on every answer
  and refusal, and a log line for every refusal) before faculty use it for real; FE-29 (a refusal's facts as fields) when the error
  envelope is next touched; FE-32 (an agent cannot add a dependency) before a change after launch meets it; FE-27 and FE-26 (the
  MOCK) before the front-end's F6 and with FE-18. **Relayed, not said to a platform session** — so FE-28 to FE-32 are here until he
  confirms them: the roadmap's *The faculty front-end's message* places them after the current plan, for the next planning session.
- **SHOULD MANIFEST AT UBC USE UBC'S EXISTING LITELLM, RATHER THAN RUN ITS OWN? — RAISED 2026-09-28 by Rich at sitting 9a.** UBC
  already runs its own LiteLLM in AWS, routing to several providers — Pickerel, UBC's on-premise inference (reachable only from UBC's
  network, or from that LiteLLM, whose address is allowed) among them; **Manifest's LiteLLM on the laptop is a stand-in for it.**
  But §10 has Manifest create users, keys and budgets in its gateway, register models through its admin API (the capable model
  since 9a) and set router-wide fallbacks (9b) — all with the gateway's MASTER KEY — and §21 runs it `STORE_MODEL_IN_DB` beside
  Manifest's Postgres. Joining a SHARED gateway means holding its master key, sharing its model names and its router settings with
  whoever else uses it, and its budgets and spend being read beside other tenants'. *The options, not yet weighed:* Manifest keeps
  its own LiteLLM and names UBC's as a provider (Pickerel reached through it); or Manifest joins UBC's with a scoped admin
  credential, if that LiteLLM offers one (teams, per-team model access); or the two are one gateway run by UBC. **Rich's and UBC's
  to decide**; nothing in the plan depends on it until Phase 2's production deployment.

- **FE-24'S OPEN QUESTIONS, for the external track and the Privacy Office** (carried from Spec action 6's draft — APPLIED
  2026-09-27, `25e7445`, so the first three are now §19's rows and `docs/external-track.md`'s items 12–14): whether D21's
  rehearsal keeps a purpose once staging signs people in against UBC's staging IdP every day; **whether a privacy assessment
  covers an app's staging use by real people** (staging CWL holders; staging data is never backed up and *"resettable"*); the
  staging registration as a tracked object, with FE-6 (a first-class object or a kind of `IamRegistration`; D19's draft; *"I've
  sent it"*; *waiting since*; a §26 queue row); and three the drafter found — whether a staging release's attributes are
  validated against staging's registration, whether the slug becomes immutable once staging is registered, and whether D24
  should still let a token deploy to staging and set staging secrets now that real people use staging.
- **MAY `internal` DATA REACH A MODEL PROVIDER OUTSIDE CANADA? — FOR THE PRIVACY OFFICE, RAISED 2026-09-27** by Rich's
  capable-model decision (*Decided*, below): the capable model is OpenAI's for now, at `internal`, as §7's catalogue already
  allows `default-chat` to *"route off-prem"*. The platform enforces the name's `max_classification`, and `confidential` never
  leaves on-premise hardware; whether a US-hosted provider suits `internal` course data is FIPPA's question, and the Privacy
  Office's, not the platform's. *For the external track* (`docs/external-track.md`), beside FE-24's questions. **Since Spec action
  10 (2026-09-28) it reaches `confidential` projects too**: by default the agent BUILDING one may call the capable model, so the
  code and the person's description of the app go to that provider (the app's own AI, and staging's and production's Incident logs,
  do not) — the Privacy Office may want the setting at *on-premise only*.
- **AN IdP-BEGUN SIGN-OUT DOES NOT REACH THE `app` ORIGIN — a concrete reason the server-side session store is owed? RAISED
  2026-09-27 by the front-end enablement plan's sitting 6 (its review's M5).** Signing out of a deployed app makes the IdP send
  a LogoutRequest to Manifest's ONE SingleLogoutService, the console origin's; it ends the console's session and an `app`
  session lives on until it expires (12 h). §20 already accepts that a stateless session cannot be revoked before its expiry,
  and a clearing hop from the console to `app` gated on the IdP's answer would be replayable (node-saml never removes a
  redirect-binding LogoutResponse from its cache) — so it is recorded, not fixed (the plan's *What this plan does not build*).
  **But it lands on the origin faculty will actually use.** *Recommended:* name it in §20's accepted consequences of Phase 1's
  stateless sessions as a reason the server-side store (§20's own deferral) is owed, when the spec is next opened.
- **Manifest's licence — RAISED BY THE AUTHORING API PLAN (sitting 1's `[M8]`; sitting 6 accepted the linter's
  `info-license` warning pending it).** The published document states none; stating one is the project owner's decision.
  The day it is stated, `info` gains `license` and `lint.test.ts`'s `ACCEPTED` loses its line — whose second check refuses
  an accepted rule that no longer fires, so the two move together.

- **Should Manifest's OWN commits on driver 1 skip the secret-scanning hook, to win back ~75 s a unit-suite run? —
  RAISED 2026-09-25 (the D5 plan's sitting 6, F6).** Since Task 11 every push into a driver-1 bare repository runs the
  rendered `pre-receive` (~40 ms a push, measured), and the suite pushes on every project a test creates: `pnpm test`
  went 240 s → 372 s. **Decided for now, and reversible: kept** — the hook is the backstop behind the pre-push scan for
  Manifest's own commits, which is exactly what makes the plan's control (e) a `SOURCE_GIT_FAILED` rather than a secret
  committed. *The alternative:* driver 1 FETCHES its own commits into the bare repository (a fetch runs no hook), so
  only a person's push meets the hook — faster, and one layer thinner. One function changes either way.
- **§26'S NON-REPUDIATION RULE IS NOT BUILT — how urgent is it? RAISED 2026-09-27 by the admin
  console's design session.** §26: *"An admin action taken on another person's project additionally
  requires a reason string, which is stored with the audit entry and shown to the project owner in
  their event stream."* Read from the code that day: `PLATFORM_ADMIN` holds every owner capability
  on every project (`projects/authz.ts`), so an administrator can deploy, add a member, commit, set a
  secret or confirm another person's agent's question on any project; **no operation requires an
  administrator's reason** (`approveRelease`'s is optional, the two launch records and
  `confirmPendingAction` take none — only the two rejections carry one); and **who acted is
  half-recorded**: most event sentences name the person since the authoring API plan's sitting 9,
  but a deploy's name nobody, revoking a token writes no event at all (adding or removing a member has published
  `member.added` / `member.removed`, with who acted, since the front-end enablement plan's sitting 5),
  no sentence says the person acted *as an administrator*, and `EventFrame` has no actor field because
  `audit.events` has no actor column (`db/schema.ts` deferred it to "P4b or P5", and neither added
  it). So an owner may learn who acted, and almost never why. It is live today through the API and
  the reference console, not only a gap the admin console will meet. **The front-end enablement plan makes it more
  pressing** (its Spec action 3, applied 2026-09-27): an administrator can archive anyone's course app, and
  `project.archived` names who did it but nothing records why. *Recommended:* the console
  designs the reason exactly as §26 says and reports the shape it needs; the rule itself becomes a
  hardening item that lands **before** `admin-ui` is anything but a prototype against the mock.
  [The console's design](2026-09-27-admin-console-design.md) carries the proposed shape (its finding
  A1).
- **Should app containers run with an init (`Init: true`)? — RAISED 2026-09-16 (P5a sitting 2).** An app's PID 1 is
  its own `node`, which never reaps the orphans it adopts, so a process an app starts that leaves children behind
  turns them into zombies holding pids against §12's `PidsLimit` (64 in the S6 fixture) for the container's life —
  measured with twenty orphaned `sleep`s in state `Z`, and with S6 probe 11 leaving `docker exec … node` unable to
  start. It changes every app's process tree, which is why it is asked rather than done.
- **Should the blueprint base image move from `node:22-alpine` to 24?** Priced in exposure as well as effort (Grype
  v0.118.0, 2026-09-06):

  | | apk Critical / High | npm Critical / High |
  |---|---|---|
  | `node:22-alpine` *(what the blueprint pins)* | 4 / 14 | **1 / 10** |
  | `node:24-alpine` | 4 / 14 | **0 / 4** |

  The npm findings are npm's own bundled tree inside the image, not anything an app chose; moving removes the
  Critical. Mechanically one line in `infra/images.txt` plus a `make seed` — but it changes what faculty apps run
  in, which is a compatibility decision.
- **Should Phase 1 ship an apk mirror alongside Verdaccio? — RAISED 2026-09-06.** The 4 Critical and 14 High apk
  findings are `libcrypto3`/`libssl3` at `3.5.7-r0`, fixed in `3.5.8-r0`; no newer base image clears them, and `RUN
  apk upgrade` cannot work from a builder with no route off its `--internal` network. An apk mirror is the only
  mechanism that would let a build clear them offline. The scan gate does not block on base-image findings, but
  "ship on day one with four Criticals in the base image" is a decision rather than an accident.
- **SimpleSAMLphp's session store connects as the superuser `manifest`** (found 2026-09-14). §9 says that store has
  "its own credentials"; `infra/idp/config/config.php` gives it the superuser the control plane writes SP rows
  with. The spec is right and the implementation is not; not fixed.
- **The long-term fix for `passport-ubcshib` is UBC's.** `@node-saml/passport-saml@5.1.0` audits clean, and moving
  to it is the "strictly safer for every consumer" change C6 permits. It does not block Manifest — but somebody
  should tell the owners of the six UBC applications that depend on a library with a critical
  signature-verification advisory. If it is fixed upstream, ship it as **0.2.0** so apps on `^0.1.6` adopt
  deliberately; its other gaps are the unreachable MACE entry and missing OID entries for `uid` and
  `eduPersonPrincipalName`.
- **Does LiteLLM's embedding `encoding_format` bug affect a commercial provider, or only the Ollama path?**
  Unmeasured — only Ollama was reachable offline. Cheap to settle the first time anyone has a provider key.
- **Starting the UBC external track (C4)** — the trigger fired 2026-09-15; see §2 and `docs/external-track.md`.

### Decided

- **A SESSION HOLDING A MODEL ITS PROJECT NO LONGER ALLOWS IS TRIMMED IN PLACE, NOT ENDED — the next plan** (Rich, 2026-09-29,
  *"yes please"*, after the faculty front-end's click on `notes-and-answers`: the building agent's own commit raised the project to
  `confidential`, and FE-36's sweep ended all three live sessions `models_withdrawn` although the capable model was still allowed —
  each key held `default-chat`, `default-chat-reasoning` and `default-embed`, which confidential withdraws). The next plan: MEASURE
  first whether LiteLLM 1.98 changes a live key's `models` in place (`/key/update`) and refuses the withdrawn ones at once; then narrow
  the key and keep the session, ending it only when nothing it may still use is left. **A spec action first**: §7's *"and the sessions
  already holding more are ended"* (Spec action 10's words) changes, and the `agent_session` events say what was withdrawn.
- **THE NEXT PLATFORM PLAN RUNS THE GITHUB DRIVER AGAINST REAL GITHUB** (Rich, 2026-09-29, after the front-end enablement plan's
  close: *"add the GitHub driver run to the next plan"*). D5's driver 2 was proved against the FAKE and the fake checked against GitHub by
  the conformance run, but the control plane has never run on the real `Manifest (local dev)` App. The run: `.env.example` section 2a's
  real-App block, a project created through the platform → a real PRIVATE repository in `Manifest-local-dev`, clicked on github.com;
  network on and his yes, because it creates real repositories nothing deletes (and there are no webhooks on a laptop; `main` is not
  protected on the free organisation). **He set `MANIFEST_SOURCE_DRIVER=github` in `.env` the same day** — §7e says what that does alone.
- **REMOVING A MEMBER REVOKES THEIR TOKENS ON THE PROJECT AND ENDS THEIR AGENT SESSIONS** (Rich, 2026-09-29, after the front-end
  enablement plan's close: *"YEs"* to the recommended option (a) — the path `revokeToken` already takes). Raised by that plan's
  whole-branch review (M4; its *Sitting 12* and *What this plan does not build*). **Not built**: the next platform plan builds it,
  and drafts a SPEC ACTION for the words first — §10's *Agent key* row lists when a key is revoked (its session ended, its token
  revoked, the project archived) and names no removal, and the *DelegatedToken* rule (D24, §6) says nothing of the minter's
  membership. Told to the faculty front-end's session the same day.
- **FE-35 and FE-36 — the agent that BUILDS an app is a platform setting** (Rich, 2026-09-28, at the front-end enablement plan's
  sitting 11's close, his own words: *"It's okay to use the larger models to BUILD the app, but if the app needs AI, then we should
  switch to use the on-prem model for the AI within the created app … Can we perhaps make this a setting?"*; and *"qwen3.8:27b will be
  the default on prem model and one to use locally"*). Spec action 10, with its safeguard, applied (`d9a1fa1`); BUILT by sitting 11a
  (Task 14a, 2026-09-28/29 — `qwen3.8:27b` measured first and told to Rich: it cannot sit beside `qwen3.5:4b`). The relayed FE-35 — a capable ON-PREMISE model for building — is superseded. Recorded in the plan's *Decided by Rich*.

- **FE-26 and FE-27 join Task 13** (Rich, 2026-09-28, sitting 10's first exchange: *"Both join Task 13"*) — built in `18f3214`; the
  plan's *Sitting 10* record.

- **THE CAPABLE MODEL IS `openai/gpt-6-luna`, AND ITS FALLBACK IS THE ON-PREMISE MODEL, NAMED BY A CATALOGUE ENTRY** (Rich,
  2026-09-28, at the front-end enablement plan's sitting 9a). The model: *"openai/gpt-6-luna is what we'll try to start with"* — in
  his `.env` as `MANIFEST_CAPABLE_MODEL` (he added it himself); a more capable one (`gpt-6-sol`) is a REPOINT, one line and a restart.
  The fallback: *"sol … shouldn't really be a 'fallback' model — as it's a more capable (and expensive) model. The fallback really
  should be the on-prem models"* — Pickerel at UBC, Ollama on the laptop; asked, **a catalogue name** (not a provider string), and
  **its own sitting, 9b** (Task 12b). **Its words are Spec action 8 — drafted by sitting 9a from its measurements of LiteLLM's `/fallback`, APPROVED BY RICH AS
  DRAFTED, option (a) — the default `default-chat-onprem`, on-premise by definition — and APPLIED at 9a's close (2026-09-28).**
  The plan's *Decided by Rich* has the reasoning.
- **THE CAPABLE MODEL: AN OPTION TO SET IT, AND OPENAI'S MODELS FOR NOW, AT `internal`** (Rich, 2026-09-27, at the front-end
  enablement plan's sitting 8 close: *"We'll need an option to set the capable model. But for now it can use OpenAI's
  models."*; then, asked, `internal` and its own sitting in this plan). One logical name, `default-chat-large`, whose provider is
  a setting (`MANIFEST_CAPABLE_MODEL`); built by **Task 12a, sitting 9a**. **Then, the same evening: Spec action 7 approved (a)
  and applied (`959af7f`); his OpenAI key in his `.env`; the live steps approved in advance** (*"1. (a) 2. Done 3. should be
  fine"*); the budget defaults unchanged. Options A (UBC-hosted GPUs) and D (a larger local model and an eval) stay the roadmap's tracked item; `qwen3.5:4b` stays
  the offline floor. The plan's *Decided by Rich* and Task 12a have the reasoning.
- **AFTER THIS PLAN, THE FRONT-END'S LAUNCH PATH FIRST (FE-6, FE-25), THEN THE VULNERABILITY DATABASE IN THE CONSOLE** (Rich,
  2026-09-27, the front-end enablement plan's sitting 7, first message: *"Launch path first"* — the recommendation). The
  roadmap's order of 2026-09-24 moves one place: the vulnerability database in the console follows the launch path, and `make
  refresh-vulndb` covers it by hand meanwhile. **And Spec actions 5 and 6 — the intake key (FE-1) and staging is UBC's real
  staging world (FE-24) — approved as drafted, option (a), in the same message and APPLIED (`25e7445`)**; the plan's *Spec
  actions* has their words, and FE-24's open questions are §19's rows and `docs/external-track.md`'s items 12–14. — do not
  re-raise
- **SPEC ACTIONS 5 AND 6 — APPROVED AS DRAFTED, OPTION (a) EACH, AND APPLIED** (Rich, 2026-09-27, in the front-end enablement
  plan's sitting 7's first message, and confirmed to its sitting 6 directly; `25e7445`). **5**: an intake key before a project
  exists, paid by the platform, its own `IntakeSession` table (D2, D8, §6, §10, §17, §20, §26). **6**: staging is UBC's real
  staging world — three identity paths, one per environment; the laptop's staging keeps the fake sign-in; the recent-output
  read is the sandbox's alone (D6, D16, D21, §3.5, §5, §8, §9, §11, §13, §14, §15, §16, §19, §20, §21). Drafted by sitting 6;
  the plan's *Spec actions* keeps the words.
- **THE FACULTY FRONT-END'S MESSAGE — FE-2, FE-1, FE-23, A CAPABLE MODEL, FE-24, FE-17/18/5, THE ORDER AFTER THIS PLAN, AND
  FE-4** (Rich, 2026-09-27, in the front-end's OWN session, relayed to the front-end enablement plan's sitting 6 as
  `manifest-app/docs/2026-09-27-to-the-platform-session.md`). **FE-2**: the front-end's server may replay the person's
  session cookie to `GET /v1/me` and nothing else — the cookie is `Path=/`, so every page request on `app.` delivers it to that
  server; sitting 6 left it alone and sitting 11's guide states the rule (*rejected*: stripping it at the edge; a signed
  identity statement). **FE-1**: a platform-paid INTAKE key with no project, approved in principle, built in sitting 7 — its
  words are **Spec action 5**, APPLIED 2026-09-27 (`25e7445`) after Rich approved them as drafted. **FE-23**: `AgentSession.spentUsd`, sitting 7.
  **A capable model option** beside `qwen3.5:4b`, behind the same LiteLLM with D17's classification — which provider is UBC's,
  and the options are *Open*, below. **FE-24**: staging is UBC's real staging world (the fake IdP is the sandbox's; the
  laptop's staging keeps it) — **Spec action 6**, APPLIED the same day (`25e7445`); its code (the output read sandbox-only) is sitting
  10's. **FE-17, FE-18, FE-5's sentence** in sittings 10–11. **After this plan, the launch path first (FE-6, FE-25)**, then
  FE-19, FE-20, FE-21, FE-22, FE-7, FE-3. **FE-4 stays in Phase 4**; meanwhile the front-end's server requests every launched
  app's production address once a minute through the edge. **Each sitting's close-out lists its contract changes**, which Rich
  relays; `packages/contract` stays buildable at every commit. The plan's *Decided by Rich* (its front-end bullet) has each
  in full, and Tasks 9, 10, 11, 13 and 14 carry an `[S6]` block. — do not re-raise
- **THE FRONT-END ENABLEMENT PLAN: APPROVED AS WRITTEN, TWELVE SITTINGS, BINARY FILES, AND ALL FOUR SPEC ACTIONS AS OPTION
  (a) — APPLIED** (Rich, 2026-09-27, after its sitting 1: *"I've read the plan, all seems good. 12 sittings is fine. I do
  mean binary files, not just text files only."*; then, the four spec actions explained, *"I am happy to go with all of your
  recommendations."*). All thirty-one *Decisions* stand; Spec action 3 keeps its sixth edit (archive and delete answer when
  done, a second exception to D23.9), not option (e)'s `202`; the agent budget defaults are Decision 22's, $10 a month and
  $2 a session, on the laptop. Applied in `1d1afd7` with two consequential words (D24's *"either"* → *"any of them"*, and
  §12's one-origin sentence). The plan's *Decided by Rich* and its record's *Between sittings 1 and 2*.
- **THE DESIGN MOCKUPS ARE OUT OF THE GATES** (Rich, 2026-09-27: *"remove the mockups from our tests and lints"*).
  `docs/superpowers/design/**` is in `eslint.config.js`'s `ignores` (`aad1a7e`) — lint was the only gate that reached them,
  and it was red on two unused names in the admin console's mockup. A design session's scripts are not Manifest's code.
- **THE FACULTY FRONT-END: AGENT MODEL KEYS BROUGHT FORWARD AND CHARGED TO THE PERSON (OPTION (b)), ITS ORIGIN IS `app`, AND
  ONE PLAN FOR ALL OF IT** (Rich, 2026-09-27, after the review of whether a real faculty front-end can be built). The
  review offered three answers to *where the building agent runs and whose model it uses* — (a) the front-end brings its
  own provider key, outside §10's budgets and D17's gate; **(b) agent keys brought forward from Phase 3, charged to the
  person — a spec change**; (c) wait for Phase 3 — and two for the front-end's address; he chose (b) and `app`
  (`app.manifest.internal`). He then asked for **one plan** covering Spec action 1's recent-output read, the second origin,
  the agent's model access, a project's name, binary files (**reversing *text files only in v1*** of 2026-09-22), adding
  members by CWL login, and delete/archive. It **replaces *Spec action 1's plan*** in the same position — after the
  authoring API, ahead of the vulnerability database in the console. [The plan](plans/2026-09-27-front-end-enablement.md),
  its *Decided by Rich*. He also said the design system (`docs/superpowers/design/system/`) is solid and liked, the
  prototype's layout and some of its interaction are decent, and the front-end is to be thought through screen by screen,
  step by step, when it is built. — do not re-raise

- **THE AUTHORING API PLAN'S SPEC ACTIONS 1 AND 3: (a) AND (a), AS PROPOSED — AND SPEC ACTION 1'S PLAN IS NEXT** (Rich,
  2026-09-26, at the opening of that plan's sitting 10, taking every recommendation; applied the same hour, `1d42c80`).
  §14 gains a bounded, redacted read of an instance's recent output in sandbox and staging only, never streamed, production
  keeping `Incident.log_tail` as its only window; §17 puts the authoring slice in Phase 2 and says the front-end project
  began against it; D23 principle 4 serves the API's own documentation the way it serves the knowledge pack. **Spec action
  1's plan is placed DIRECTLY AFTER the authoring API, ahead of the vulnerability database in the console** — an agent
  debugging a running app is blind today. The plan's *Spec actions* and the roadmap's section have the words.
- **THE TEST BUDGET IS LEAN** (Rich, 2026-09-26, sitting 10: *"these sessions can take hours, so let's see if we can reduce
  that"*). No full `pnpm test` at a sitting's open when the code tree is the last green close's; single test files while
  fixing, each red first; the whole suite **twice on the FINAL tree at the close** — `make ci-acceptance`'s run counts as
  one — and `pnpm test:docker` only when an owing path changed. Sitting 9 ran the suite eight times; sitting 10 twice.
  *Rejected:* the house rule as written (twice after every code commit), and once only at the close (a state leak would go
  unseen a sitting). A plan's own sittings rule still wins where it names a run.
- **THE ADMIN CONSOLE GETS REAL DESIGN EFFORT — §26's *Scope* CHANGED** (Rich, 2026-09-27: *"Apply the spec
  action, and go live with admin-ui"*). The paragraph that called it *"rudimentary… not a product surface"* now
  says it shares the faculty product's vocabulary, shows its reader the infrastructure C3 hides, and does not
  inherit `console/`'s plain bar — which stays with §22, unchanged. Wording and sweep:
  [the interface design brief's §13](plans/2026-09-19-interface-design-brief.md). **Then, the same day, NO PLAN —
  A MOCKUP** (*"We're just trying to get some sense of a design"*): the design is
  [`2026-09-27-admin-console-design.md`](2026-09-27-admin-console-design.md), drawn as a clickable mockup on the
  shared design system (`design/admin-console.html`, published at
  <https://claude.ai/artifact/N8qj84CVbvJ7f2L6xKfQ25>). `packages/admin-ui` is not built and no P11 plan is written;
  the design's §13 says what one would do.
- **HOW SCALAR ARRIVES — OPTION (a): THE NETWORK, FOR THAT ONE ADD, IN THE AUTHORING API PLAN'S SITTING 8** (Rich,
  2026-09-26, after its sitting 7, taking the recommendation). Sitting 7 measured `pnpm --filter @manifest/console add
  --offline @scalar/api-reference@1.72.0` refused by pnpm 11's supply-chain check in a scratch copy of the workspace, so
  Task 11 runs the add WITH the network — `vue-demi: false` in `allowBuilds` with its reason (`[M9]` correction 2) — and
  the lockfile pins it. **The yes covers that one add and nothing else**; any other networked command is asked again.
  *Rejected:* (b) copying `dist/browser/standalone.js` out of the pnpm store and committing it (4.3 MB, upgraded by hand,
  the extraction unmeasured). The plan's *Decided by Rich* and sitting 7's record have it. **DONE in sitting 8
  (2026-09-26)**: that one command, exactly as worded, `+250` packages and `downloaded 0` — the network served the
  supply-chain check — and it also re-resolved the control plane's `drizzle-orm` peer, with no runtime effect (sitting 8's F5).

- **THE PER-USER AI BUDGET — SPEC ACTION 4, OPTION (a), AS WORDED — BUILT IN SITTING 9 (2026-09-26)** (Rich, 2026-09-26, after
  the authoring API plan's sitting 6; applied the same evening). §7's schema line gains *"# validated, NOT enforced, before Phase 4 (§10)"*, and §7's
  *Validation* list refuses `ai.budget.per_user_monthly_usd` above the project's AI quota and says a validation carries a
  warning that it binds no one. **Built in Task 12**: the quota refusal, a `warnings` list on a validation with
  `SPEC_FIELD_NOT_ENFORCED`, and the field's published description and the knowledge pack. *Rejected:* (b) the words without
  a warning; (c) the schema comment alone. The plan's *Spec actions*, 4, has the reasoning.

- **`mintToken`'S IDEMPOTENCY RECORD — OPTION (a): KEEP THE TOKEN WITHOUT ITS SECRET, AND REFUSE A REPLAY BY NAMING THE
  TOKEN — DECIDED 2026-09-26, BUILT IN THE AUTHORING API PLAN'S TASK 12 (sitting 9, the same day; migration 0032)** (Rich, after that plan's sitting 5
  closed, taking the recommendation). Sitting 5's F4 measured `idempotency_keys.response_body` holding every minted token's
  plaintext secret, rows never deleted, against D24's *"stores only a hash of it and cannot show it again"*. A replay of a
  mint answers **`409 TOKEN_ALREADY_MINTED`** naming the token the first request minted, so a client that lost the answer
  revokes it and mints again; no second token is ever minted, and a migration scrubs the secrets already stored. *Rejected:*
  (b) store the answer encrypted and replay it within a short window; (c) leave it. **A retention for `idempotency_keys` is
  NOT part of it**: once no row holds a credential it is housekeeping, not security, and it is named in the plan's *What
  this plan does not build*. Task 12's Step 5 has the design.
- **THE AUTHORING API PLAN'S SPEC ACTION 2 — OPTION (a): A TOKEN SETS SANDBOX AND STAGING SECRETS; A PRODUCTION VALUE ONLY
  IN A STEPPED-UP INTERACTIVE SESSION — DECIDED AND APPLIED 2026-09-26** (Rich, at the close of that plan's sitting 4, taking
  the recommendation). §20's credential table and step-up bullet and D24's rationale carry the three edits as the plan
  words them; `manifest-decisions.html`'s D24 restates it. *Rejected:* (b) a token sets any environment's; (c) production
  secret-setting joins D24's privileged set. Task 8 builds it as written. The plan's *Spec actions*, 2, has the words.
- **F7 — OPTION (b): NO MODEL SENTENCE FOR A CWL ATTRIBUTE CHANGE — DECIDED AND APPLIED 2026-09-25** (Rich, after the
  authoring API plan's sitting 2 closed, taking the recommendation). Option (a) had been measured over 320 hand-read
  answers and read worse (22 → 30 reversals of a removed `sn`); the shipped summary reversed it in 21% of three-change
  diffs, and called `sn` a student number or a social security number. **`releases/summary.ts`'s `NOT_MODELLED`**
  (`auth.attributes`) leaves such a change — and its security note — out of what the model is asked; its change line
  (*"no longer requests the sn attribute"*) is the whole record, and the console says so. A diff whose only change is to
  the attributes asks no model and records **`summarySource: 'not-modelled'`** (contract `1.3.0`). *Rejected:* (c) no
  sentences at all; (d) keep them shown and labelled. The plan's record, *Sitting 2*, *After the close*. — do not
  re-raise
- **The authoring API plan's split and how it is executed — DECIDED 2026-09-25** (Rich, at the opening of its sitting 1;
  the plan's *How this plan is to be executed* has the four answers). **Ten sittings, as proposed.** **Sitting 1 may fetch
  the two HTML-renderer candidates** (`@scalar/api-reference`, `redoc`) into the scratchpad so they land in the pnpm store —
  its only outward action — judged offline by the browser's network log. **Executed inline with
  `superpowers:executing-plans`, no subagent per task**; the one fresh whole-branch review is at the plan's end. Spec action
  2 stays open (above). — do not re-raise
- **The authoring API plan's scope — SIX DECISIONS, 2026-09-25**, all recorded in the plan's *Decided by Rich*: **F7's fix is
  its first task** after the measurements; **the acceptance is a bulletin board** an agent builds from the bare skeleton through
  the API; **the plan covers the full end-to-end path and the documentation must let humans and agents drive the API alone**;
  **app secret values are built in it** (taking the recommendation); **a running app's output is a spec action now and a later
  plan** (taking the recommendation); and **the reference is Markdown served and in the console AND a rendered HTML page** (over
  the recommendation of Markdown alone — one new package, at his yes). It executes over the weekend of 2026-09-26/27. — do not
  re-raise

- **§19's row for the production GitHub organisation — APPROVED AND APPLIED 2026-09-25** (Rich, at the close of the D5
  plan's sitting 7, taking the recommendation). §20's bullet 4 ends *"…which the production organisation enables
  (§19)"*, and §19 now has that row: dedicated to Manifest; members may not create or publicise public repositories;
  GitHub push protection on, with Manifest's secret rules as custom patterns; needed before driver 2 serves UBC; UBC IT
  + Manifest team. The plan's *Spec actions*, 4, has the wording; no HTML page restates §19.
- **The model's per-change sentence stays SHOWN AND LABELLED; the reversal rate is fixed AFTER the D5 plan — DECIDED
  2026-09-25** (Rich, taking the recommendation, on the plan's sitting 7 F7: 5 of 40 sentences got a removed CWL
  attribute backwards). **Not in sitting 8**, which stays the acceptance alone. The fix to try is option (a): hand the
  model each attribute change's ADDED and REMOVED halves as their own fields, and measure it over 40 answers before
  adopting it — a small follow-up after the plan, or the authoring API plan's first task. *Rejected for now:* (b) no
  sentence for attribute changes; (c) no sentences at all. The measurement is in the plan's sitting 7 record.
  **Option (a) was TRIED by the authoring API plan's sitting 2 and NOT ADOPTED — it measured worse; Rich then chose
  option (b), above.**
- **The D5 plan's final whole-branch review may use ONE fresh reviewer agent, on the most capable model — DECIDED
  2026-09-25** (Rich, taking the recommendation). `superpowers:executing-plans` requires a fresh-context review at the
  plan's end, sittings 1–7 each deferred it to sitting 8, and the session's own rule is not to spawn an agent unless
  Rich asks — **this is him asking**, for that one review. It reads from `a2885ed` (Task 1's BASE in the ledger).
- **§20's git-driver bullet 1 is CORRECTED — option (b), DECIDED AND APPLIED 2026-09-24** (Rich, answering the D5
  plan's sitting 3 F10 the same evening). The real conformance run met Spec action 3's condition — a token scoped
  to another repository created one (C7s) — so the bullet now says GitHub does not confine creation to a token's
  repositories, and that no administration token ever leaves the control plane. Decision 4 is unchanged. The plan's
  *Spec actions*, 3, has the measurement and the options; the roadmap's *Spec actions raised by the D5 plan* the
  wording.
- **Task 13's summary is STRUCTURED OUTPUT — DECIDED 2026-09-24** (Rich, answering the D5 plan's sitting 1 F7, the
  same day it was raised). The model is handed the diff's facts as JSON and fills a schema — one `exposure`
  sentence per change, `path` an enum of the diff's own paths — with no field a verdict could go in. Task 13 is
  rewritten; the plan's Decisions 19 and 22 have the reasoning, and its sitting 1 record, *After the sitting*, the
  measurement (10 of 10 in shape, 0 decision words, on `qwen3.5:4b`).
- **The chat model is `qwen3.5:4b`, with thinking OFF, and a `-reasoning` name for each chat name with it ON —
  DECIDED 2026-09-24** (Rich, in two steps the same afternoon). `default-chat` and `default-chat-onprem` pin
  Ollama's `think: false` (a request cannot override it; `reasoning_effort: none` could be, so it was replaced);
  `default-chat-reasoning` (internal) and `default-chat-onprem-reasoning` (confidential) are the same model
  thinking, chosen by declaring them in `ai.models`. §4 has the measurements; commits `be7042e`, `36c7e92`.
  `ministral-3` is still installed and unused — removing it (6.0 GB) is Rich's. A per-model "needs a more explicit
  prompt" attribute was discussed and NOT built: the D5 plan's Decision 22 says where it would go. **Its two spec
  actions were APPROVED AND APPLIED the same day, after Rich read the exact wording**: §7 gains *"A logical name
  also fixes whether the model reasons"* and the two `-reasoning` catalogue entries; §21 says the local chat model
  *"must stream content"* (not *"must be a non-thinking model"*), names `make verify` as the check, and reads *"A
  4–8B model"*. The wording is in the roadmap's *Spec actions raised by the chat-model switch*.
- **The D5 plan's three spec actions — APPROVED AND APPLIED 2026-09-24** (Rich, the day the plan was written, from
  the options and exact wording in [its *Spec actions*](plans/2026-09-24-d5-github-source-driver.md)). **(1) §20
  bullet 4, option (a)**: push-time scanning says what each path does — Manifest blocks every push it makes and
  every push to driver 1, and FINDS every commit pushed straight to GitHub, raising an Event and refusing to build
  it; blocking such a push is GitHub's push protection on UBC's organisation (external track item 10). *Rejected:*
  (b), requiring GitHub Secret Protection as a precondition of driver 2 (paid, untestable on a free organisation).
  **(2) §21's inventory** gains the opt-in GitHub fake on 7110. **(3) §20 bullet 1** names the one installation
  token that cannot be scoped to a repository, **approved *unless the conformance run says otherwise*** — if Task
  6's real leg contradicts it, the measurement and the reverting edit go to Rich. No shared HTML page restates any
  of the three. — do not re-raise

- **THE VULNERABILITY DATABASE IN THE CONSOLE — REQUESTED AND PLACED by Rich, 2026-09-24: its own plan, AFTER THE
  AUTHORING API**, so the order is **GitHub → the authoring API → this**. Refresh it through the control plane's
  API, show its age and when it goes stale, let an administrator adjust the threshold, scoped properly, with a
  console screen. What it needs is the roadmap's section of the same name — a §12 spec action among it. **Why after
  the authoring API** (recommended, and Rich agreed): `make refresh-vulndb` already meets the laptop's need and a
  scheduled refresh matters only on a server, which is unplanned; the authoring API is what a waiting front-end
  team needs, and this would have made them wait a second plan; nothing couples the two; and its screen is an admin
  surface, so it lands after the open admin-console design question (above) has had longer to settle. *Rejected:*
  straight after GitHub (the front end waits twice); folding it into P11 (it carries a spec action and the first
  platform-level setting, cleaner alone). *The cost, accepted:* the threshold stays seven days and a refresh stays
  a `make` command for two more plans. `make refresh-vulndb` was asked for too, and **added and run the same day**.
  — do not re-raise

- **D5's GitHub source driver plan — its two questions DECIDED by Rich on 2026-09-24**, from options with their
  costs. **The stand-in: a FAKE plus an opt-in REAL check** (recommended). A small GitHub-compatible fake in a
  container — App JWT → per-repository installation tokens, private repositories, git over HTTP, HMAC-signed
  webhooks — carries the plan's acceptance offline and in CI, and is the only way a webhook can reach a laptop at
  all; a short opt-in conformance run against a real GitHub App (`Manifest (local dev)`, on Rich's account, network
  on, at his yes) checks that the fake answers what GitHub answers; UBC's own org stays on the external track.
  *Rejected:* the fake alone (a fake written by the agent that writes the driver agrees with the driver — P3's
  false-green shape); a real org alone (the network and an external account on the acceptance path). **Eight
  sittings** (recommended; seven and ten offered): 1 the measurements; 2 the build path behind `SourceDriver` and
  the App key's custody; 3 the fake; 4 the driver; 5 webhooks and enforced-private; 6 push-time secret scanning,
  `main` protected and the repository link; 7 P6b's inherited findings (F9, F11–F15); 8 the acceptance. *Seven
  would merge 6 and 7 and put the inheritance in the sitting most likely to run long; ten would split the fake and
  the mirror.* — do not re-raise

- **F10 — the console's *Sign out* leaves the IdP session alive — is FIXED IN ITS OWN SITTING, BEFORE the D5 plan**
  (Rich, 2026-09-24), not folded into it; P5c's `b23674b` is the precedent. **DONE the same day, `0aa1824`** —
  P6b's record, *After the plan*. — do not re-raise

- **P6b's three questions — ALL DECIDED by Rich on 2026-09-22**, the day the plan was written, each from options
  with their costs stated; the plan's *Decided by Rich, 2026-09-22* section keeps the options he rejected. **Seven
  sittings, the LEAN split** (eight was recommended): its cost is that sitting 5 pairs the IAM change request with
  R4(d), and the plan says to stop after Task 7 and sweep if it runs long. **Removing a CWL attribute does not wait
  for IAM; adding one does**: a removal still re-escalates to an administrator. **That approves the plan's Spec
  action 1 in substance** — §13 D9.2's *"a change to `auth.attributes`"* becoming *"a change … that adds an
  attribute UBC IAM has not registered"* — with the wording shown to him, **and APPLIED on 2026-09-24 at Rich's
  word**, with `manifest-decisions.html`'s D9 and D16 cards swept the same day. **An approved PIA never returns to
  `draft` automatically** on a sensitive change: the re-escalation's security note tells the administrator, who
  decides. — do not re-raise

- **§21's *honest divergences* item 2 is REWRITTEN, not deleted** (Rich, 2026-09-22; P6a's Spec action 1): the two
  Caddy listeners are real and separate — `srv0` on `127.0.0.2` for sandbox, staging and the platform's own names,
  `srv1` on `127.0.0.3` for production — and what stays divergent is stated: both are loopback on one host, so the
  separation is a listener assignment rather than a network topology. Applied with one factual correction to the
  plan's wording (the plan said `srv0` held sandbox and staging only). **With it, every spec action P6a raised is
  applied.** — do not re-raise

- **§13's *Residual risk* names NO number of sensitive fields** — *"only changes to the sensitive fields §7 lists
  re-escalate"* — rather than five or seven (Rich, 2026-09-22; P6a's Spec action 3). **APPLIED to the spec on
  2026-09-22 after Rich read the exact wording.** — do not re-raise

- **A PERSON-ONLY class of actions: `release:approve` and `launch:record`** (Rich, 2026-09-22; P6a's Spec action 2,
  option (c) of three). A delegated token can never be minted holding either, and asking for one is refused
  outright — **not** turned into a pending action, because each is a record that a named person decided, and the
  confirm-and-retry loop would let a token make that record. *Rejected:* documenting the route-level guard only (a
  future route could forget it); adding `release:approve` to D24's four (the confirm path would let an agent's
  retry record the approval). **Built in P6b**, which adds approval paths; the code today already guards both by
  `requireSession`. **APPLIED to the spec on 2026-09-22 after Rich read the exact wording** — §20's step-up bullet
  and D24's row — and `manifest-decisions.html`'s D24 in plain language. — do not re-raise

- **The authoring API: its own Phase 2 plan, placed P6b → GitHub source driver → authoring slice** (Rich,
  2026-09-22), with **text files only in v1**, **the front-end project specced against that slice** rather than
  waiting for sandboxes, and **S5 not scheduled until after the slice**. Why after GitHub: the slice writes through
  `SourceDriver`, which the GitHub plan gives a second implementation and puts the build path behind — so the write
  path is designed once, and API commits reach GitHub from the start. The cost, accepted: a front-end team waits
  one plan longer. [`plans/2026-09-19-authoring-api-brief.md`](plans/2026-09-19-authoring-api-brief.md) §6. — do
  not re-raise

- **An administrator sees the approval's diff BEFORE deciding — as a STORED preview that the approval binds, built
  in P6b** (Rich, 2026-09-22; raised by P6a sitting 10's F15). Rich asked what the diff is *of*; D9's answer
  settled it — an administrator approves a first launch and afterwards only a re-escalation, and a re-escalation's
  diff is the whole question. *Rejected:* a preview read alone (the summary can differ from the record), §13 saying
  "computed at" (a spec change that weakens non-repudiation), building it in P6a. P6a's sitting 11 record, *Rich's
  decision this sitting*; P6b inherits it through P6a's *What this plan does not build*. — do not re-raise

- **R4's code-safety spec action — APPROVED AND APPLIED 2026-09-19.** §4 gains **D33** (a code `Reviewer` gets an
  interface in Phase 2 and implementations later, shipped as a null implementation whose verdict says no review was
  performed, feeding a **non-blocking** checklist item); §15 gains its extension-hook row; and §20's control map
  row now opens *"Still accepted under D9"* and ends *"until one lands nothing reviews code"*. **§12 and §13 were
  deliberately not touched** — supply chain is about packages, and §13 already describes the summary. The four
  shared HTML pages moved with it, every count 32 → 33. Reasoning: the P6 brief's §5 R4 and §7. — do not re-raise

- **The SLO binding defect (F11/F16) — FIXED ON 2026-09-19, at Rich's direction**, rather than deferred to P6. `GET
  /auth/logout` now answers the IdP's HTTP-Redirect LogoutRequest, and the redirect binding's values are decoded as
  URI components rather than form fields. The reasoning, the three negative controls and the browser proof are in
  P5c's record, sitting 9. — do not re-raise

- **An APP route DOES need `stream_close_delay`, and now carries it** (2026-09-18) — **RAISED 2026-09-16, and
  closed by the measurement Rich asked for** (P5c R2). P5c Task 1's M8 held a WebSocket open through a runtime
  route shaped exactly as `buildRoute` shapes one, then inserted an unrelated route: **without the field `CLOSED
  code=1001`, 2 ms after the reload; with it `SURVIVED 17971 ms`, still open.** So one app's deploy, anywhere on
  the platform, was disconnecting every WebSocket every OTHER app held. `routing/caddy.ts`'s `buildRoute` now sets
  `stream_close_delay: 3_600_000_000_000` — **nanoseconds, because `"1h"` is a different type the admin API
  refuses** — matching the hour the console's own site has carried since P5a, and `routing/caddy.test.ts` asserts
  the VALUE (a `toBeDefined()` would pass on a route the edge rejects). **What the hour costs is recorded rather
  than hidden**: a stream opened on an old config keeps the old handler, and so the old upstream, alive for up to
  that long — bounded in practice by §11's retire drain, after which the container is gone and the connection
  breaks anyway. **No spec change was needed.** *Worth reading for a second reason:* **the plan's own snippet for
  this measurement would have answered it BACKWARDS** — it drives the admin API with node's `fetch`, which undici
  gives `Origin: ''` and Caddy refuses `403`, and it checked neither `r.ok` nor `r.status`, so it would have
  reported `SURVIVED` on a reload that never happened. P5c sitting 1's F1, and
  [`spikes/p5c-baseline/`](spikes/p5c-baseline/README.md).
- **The edge's `@outside` refusal is proved in both directions** (2026-09-17) — **closed without ever weakening the
  running edge**, and no longer Rich's. `make verify`'s gateway check reads the Caddyfile on disk and was watched
  going red with the rule removed; `routing/edge-source-refusal.docker.test.ts` proves the causal link against a
  throwaway Caddy on every `pnpm test:docker`. The documented manual procedure is **superseded — do not run it**:
  it is the only option that leaves the real edge weakened for a window and needs the control plane restarted
  afterwards. §2's *Outstanding* has the detail.
- **P5b's four spec actions** (2026-09-17) — **ALL FOUR APPROVED AND APPLIED**: §6's `DelegatedToken` gains `name`,
  `token_hash` and `revoked_at` and `PendingAction` gains `expires_at` and `consumed_at`; §20 records that Phase 1
  sessions are stateless **and what that costs** (a role change reaches a person at next sign-in; a session cannot
  be revoked before it expires), with the store still the design and the divergence the reason to build it; §20
  records that step-up lands with the routes it protects while the privileged set is named and tested from Phase
  1c; and **D24's "create projects" is reconciled in BOTH places it appeared** — D24's own rationale column and
  §20's credential table — in favour of the scope rule. `manifest-decisions.html` carried the same claim in plain
  language and was corrected with them. P5b's *Spec actions*; the spec commit is named in the roadmap.
- **`egress.allow` may not name a platform surface** (2026-09-16) — §12 applied; enforcing it is the roadmap's
  tracked hardening item, after P5a. Only the implementation is open.
- **P5a's R6–R9** (2026-09-16) — builds answer `202`; `openapi-typescript` + `openapi-fetch`; twelve sittings; spec
  actions applied first. P5a's *Decisions Rich made*.
- **P5's five** (2026-09-16) — starters; P5a/P5b/P5c; one console origin through the edge with §23's reserved
  labels and a slug check; a `/v1` prefix; no acceptance on a second machine. The P5 brief's §5; spec `1d88846`,
  `ecf5f29`, `5065c13`.
- **§12's scan gate blocks only on a Critical or High with a published fix** (2026-09-08) — §12, `build/scan.ts`.
- **P4a's and P4b's spec actions** (2026-09-14 and 2026-09-15), among them §10's per-user AI budget validated not
  enforced in Phase 1, §14's stream as built with no app-output tailing, and §10's agent-key row from Phase 3 — the
  roadmap and each plan's *Spec actions*.
- **Zero-downtime redeploys required, as P4c, before P5** (2026-09-14) — executed; P4c's *Decisions Rich made*.
- **A sign-in under way when a route moves may fail once** — tolerated (P4c).
- **The Manifest IdP's SimpleSAMLphp is kept current, not pinned** (2026-09-16) — a sitting that runs `make seed`
  records the version it left running; P4c finding 62.
- **Task 12's entropy redaction rule** (2026-09-14) — P4b Task 12.
- **Where the service-binding wire lands** (2026-09-06) — P3 Task 15; platform bindings apply after the app's own
  `env`.
- **The external track starts once the local proof works end to end** (2026-09-05) — that trigger has fired;
  starting it is the open item above.
- **`make doctor` asserts the host tools the control plane spawns** (2026-09-09); **P3's six spec actions**
  (2026-09-07, `53ecb1d`); **the §11/§23 hostname rule — the environment lives in the zone** (2026-08-31); **`make
  up` re-adds the `127.0.0.2` alias** (P1); **the hung Docker credential helper** (2026-09-14, cleared by
  restarting Docker Desktop).

---

## 9. Lessons — each one was paid for

These are about *how to work here*, and they are in the roadmap too, which is the
maintained copy.

- **Integration is where the false greens sit, and units cannot reveal them.** Two of
  the three worst discoveries in this project arrived the first time something ran end
  to end: P3's Task 15 found that **no build had ever succeeded**, and its Task 17
  found that **no deploy had ever succeeded either** — through seven defects of one
  shape, *the test constructs the value correctly and the running system re-derives it
  wrongly*. Both were invisible behind a fully green suite of 74 Docker tests, because
  a test hands the driver what it built while the control plane rebuilds it from a
  slug. **Schedule the end-to-end task early and drive it through the real entry
  point**, not through a harness.
- **A module with no call site is not built.** `waitForReady` and `edgeProbe` shipped
  in P3 Task 14 with passing tests and nothing called them until Task 17;
  `isSensitiveDiff` shipped in P2 and nothing called it for a whole plan. This is the
  same defect as the unwired boot entry point, and it has now happened three times.
  Every task should name its caller, not just its module. **And its mirror image: a plan
  can ask you to BUILD what already exists with no caller.** P6a sitting 8 found §7's whole
  attribute-subset check in `spec/policy.ts` since P2, behind an OPTIONAL context field no
  caller had ever passed — tested, published under its own error code, and unreachable —
  while Task 13 was about to add a second one under a second spelling of the code. **Before
  building a rule, grep for its error code and for the spec clause's key words**; an
  optional parameter nobody sets is a module with no caller wearing a type.
- **Diagnosability is a feature, and its absence hides other defects.** A failed build
  recorded no reason at all (`void error`), and an unexpected 500 left no trace
  anywhere because the handler logged through a logger the server was built without.
  Fixing both took minutes and immediately named four further defects that had been
  invisible.
- **A plan is not verified until it runs, and the gap is not small.** P2's written
  self-review found seven defects. Then executing just **four of its twenty-one
  tasks** found **five more**, and not one was findable on paper: a package manager
  that makes an un-named build script a hard error, a lint config whose glob dialect
  silently has no extglob, a linter that does not honour the `_` convention the
  plan's own code assumed, a negative control aimed at a target that could not fail,
  and an unguarded table index that turned drift into a crash in an unrelated test.
  **Five defects in four tasks.** P3's own self-review then found **seven** more,
  the worst being that no task wired the Docker driver into the boot entry point — so
  its `make demo`, the plan's entire acceptance, would have passed against the fake
  driver. **Acted on 2026-09-04**: plan-writing stops until P3 has executed. Treat
  "the plan is written" as a hypothesis, and execute the cheapest representative
  slice early rather than banking a large unexecuted stack.
- **A green result is not evidence a control is in force.** S1's first build appeared
  to succeed while silently using the public npm registry instead of the mirror.
  Only checking the mirror's storage caught it.
- **Some defects are invisible to every test that could be written.** Executing P2's
  Tasks 12–21 produced 27 defects; **six were type errors** that `pnpm test` cannot
  see, because Vitest strips types without checking them, and **five were test
  isolation** — the suite passed or failed on the order Vitest happened to pick, and
  three suites had been green only because the database happened to be empty. Neither
  class is findable by reading a plan, and neither is findable by running its tests.
  The gates are the plan: run all four, and run the suite twice.
- **A guard whose enabling condition is written twice is a guard.** P2's
  `/auth/dev-login` passed `devAuthEnabled: true` as a literal because the route was
  only registered when the shim was on. Removing that single registration guard made
  the endpoint mint **real sessions** — a complete authentication bypass, one line
  from live, and it read correctly in review. The same shape produced an IDOR in
  `GET /builds/:id`. Two independent reads of one setting cost nothing.
- **Assert the shape of the answer, not that an answer arrived.** S3 ran six toolkit
  checks and all six passed; one was returning 192 numbers where 768 belonged, almost
  all zero, with no error anywhere. "It returned a vector" and "it returned the right
  vector" are different claims.
- **Treat a briefing document as evidence, not fact.** `START-HERE.md` stated that
  `/etc/resolver/test` pointed at a dead nameserver. It did not, and that one wrong
  premise forced the zone change.
- **A document that restates a number drifts from it.** ORIENTATION §2's *Code* row
  carried `make doctor` 14, `make verify` 31, `pnpm test` 224 and then 332, and
  `pnpm test:docker` 48 — **five stale figures at once**, four releases behind, while
  §3 and §7c of the same file had them right. A new agent's first act is to run the
  gates and compare, so the cost lands on exactly the person with the least context.
  Fixed structurally on 2026-09-07 rather than by correcting the numbers: **§2 now has
  one box, measured and dated, and every other mention points at it.**
- **Briefings go stale in days.** A handoff was sending its reader to a finished spike
  one day after it was written, and three of twelve "already pulled" images vanished
  between sessions. Anything stating current status needs an owner and a date — which
  is why the ledger exists and why this file says which of its sections decay.
- **Handoff chains strand durable knowledge.** The machine landmines in §4 spent a day
  behind a SUPERSEDED banner because they lived in a dated handoff. Durable content
  belongs in a durable document; only *what to do next* belongs in a handoff.
- **Prefer ownership-adjusted risk.** S2's risk was priced as existential and was not,
  because `docker-simple-saml` is ours. Ask what a "no" costs *given what we control*
  before ranking a risk.
- **Run the plan self-review; record what it caught.** P1's found five defects, the
  worst being a verification script that used `apk add` — which needs the network, so
  the offline acceptance test would have failed on its own harness. Writing down what
  the review caught stops the next reader mistaking a fix for a mistake.
- **Spikes came in far under their timeboxes** (~1.5 h, ~0.5 h, ~2 h, ~2 h against 3,
  2, 3 and 2 days). Do not re-plan the schedule on that: all four were the tractable
  ones, and the estimate that matters — C4's turnaround — is still unmeasured.
