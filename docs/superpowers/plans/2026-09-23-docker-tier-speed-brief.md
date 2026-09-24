# The Docker tier's speed — a tracked item

**WRITTEN 2026-09-23 at Rich's request (P6b sitting 5). NOT SCHEDULED, AND NOTHING HAS CHANGED.** This is a
write-up of a question and what was measured in answer to it, with the candidate changes ranked by the time each
would save. Changing a test is a change to what the platform can prove about itself, so every candidate below
names what must stay true. The roadmap tracks it under *Tracked tooling items*.

**The question (Rich, 2026-09-23):** *why does `pnpm test:docker` take 25 minutes, is there anything we can do
about it, and are there any skippable tests?*

**The short answer:** the 31 files run one at a time by design, and **four of them take 60% of the run**. The
biggest lever is **building each fixture image once per run instead of once per file**. The second is **finding out
where `boot` and `releases/production` spend 384 s of setup**, which is not yet known (two guesses made while
answering were wrong). Shorter timeouts save little. **No test is recommended for deletion**: most Docker tests are
the only witness of some property. And whether a sitting should owe the tier as often as it does is a policy question
for Rich, not a code change.

---

## 1. What was measured

On 2026-09-23, P6b sitting 5's owed run at `3ae1cfd`, on this laptop (macOS 26.6.2, Docker 29.7.2, Node 24.12.0),
with a load average of about 4 shortly before it started (read with `uptime`). **198 tests, 31 files, all passed, 1574.9 s of wall time**:
1547.4 s inside files, of which **1020.6 s is inside tests and 526.8 s is setup**. *Setup* here means the file's
time minus the times Vitest prints for its tests. Vitest prints only tests over 300 ms, so a file's quick tests are
counted as setup too, which barely matters.

**Why the run is the SUM of its files.** The root `vitest.config.ts` sets `fileParallelism: false`, and its own
comment records the measured failure without it. Every Docker file shares **one Postgres** (each file truncates it),
**one Caddy edge** (routes are added and removed, and some files restart it), **one IdP** and **one registry**.

**Every file, slowest first** (seconds; *in tests* and *setup* as defined above):

| File | Tests | Total | In tests | Setup |
|---|---|---|---|---|
| `runtime/docker/driver.docker.test.ts` | 26 | 275 | 251 | 24 |
| `releases/production.docker.test.ts` | 8 | 251 | 73 | 178 |
| `boot.docker.test.ts` | 6 | 227 | 21 | 206 |
| `releases/redeploy.docker.test.ts` | 3 | 172 | 170 | 3 |
| `runtime/docker/s6.docker.test.ts` | 18 | 78 | 54 | 24 |
| `runtime/docker/redeploy.docker.test.ts` | 9 | 64 | 46 | 17 |
| `runtime/docker/roundtrip.docker.test.ts` | 4 | 60 | 59 | 1 |
| `sso/login.docker.test.ts` | 6 | 57 | 10 | 47 |
| `build/scan.docker.test.ts` | 6 | 52 | 52 | 0 |
| `runtime/docker/services.docker.test.ts` | 9 | 51 | 51 | 1 |
| `runtime/docker/node-ts-mongo.docker.test.ts` | 4 | 41 | 40 | 2 |
| `releases/incident.docker.test.ts` | 1 | 33 | 33 | 0 |
| `routing/routes.docker.test.ts` | 8 | 33 | 29 | 4 |
| `runtime/docker/builder.docker.test.ts` | 8 | 29 | 29 | 0 |
| `runtime/docker/instances.docker.test.ts` | 8 | 26 | 24 | 2 |
| `routing/listener-split.docker.test.ts` | 7 | 19 | 17 | 3 |
| `runtime/docker/egress.docker.test.ts` | 8 | 16 | 14 | 2 |
| `runtime/docker/networks.docker.test.ts` | 8 | 16 | 15 | 1 |
| `routing/readiness.docker.test.ts` | 7 | 13 | 12 | 1 |
| `ai/ai-path.docker.test.ts` | 6 | 12 | 11 | 0 |
| `identity/saml.docker.test.ts` | 2 | 7 | 0 | 7 |
| `routing/edge-source-refusal.docker.test.ts` | 3 | 4 | 4 | 1 |
| `sso/metadata-store.docker.test.ts` | 5 | 2 | 2 | 1 |
| `sso/registration.docker.test.ts` | 7 | 2 | 2 | 1 |
| `runtime/docker/logs.docker.test.ts` | 4 | 2 | 2 | 0 |
| `projects/admin-grant.docker.test.ts` | 4 | 2 | 1 | 0 |
| `releases/deploy-sso.docker.test.ts` | 1 | 1 | 1 | 0 |
| `runtime/docker/hardening.docker.test.ts` | 3 | 1 | 0 | 1 |
| `runtime/docker/registry-auth.docker.test.ts` | 4 | 1 | 0 | 1 |
| `ai/keys.docker.test.ts` | 2 | 1 | 0 | 1 |
| `api/registry-token.docker.test.ts` | 3 | 0 | 0 | 0 |

**The four files at the top are 925 s of 1547.** Thirteen files take under 5 s each and are not worth touching.

**Five smaller measurements, each made while answering:**

1. **One control-plane compile takes 4.15 s** (`pnpm --filter @manifest/control-plane build`, twice, identical).
   So `boot`'s 206 s of setup is **not** its two compiles — which was the first guess, and it was wrong.
2. **A retire's drain ends the moment nothing is in flight** (`drainUpstream`, `runtime/docker/driver.ts:218`,
   read from the code). So `boot`'s booted control plane, which drains with the production default of 120 s, is
   **not** waiting out a fixed 120 s. That was the second guess, and it was wrong too.
3. **One fixture build, including §12's scan, is about 19 s**: `driver`'s *reports build progress through onLog*
   is one build at 19.8 s, and *builds the same source to the same digest* is two builds at 37.8 s. `build/scan`'s
   six tests are 3–14 s of scanning each.
4. **About ten files build their own image** (a static count of build call sites: `boot` 3, `driver` 2 including the
   contract block, and one each in `production`, `redeploy` ×2, `roundtrip`, `node-ts-mongo`, `s6`, `deploy-sso` and
   `incident`). Call sites inside `beforeAll` run once and those in helpers run more than once, so **the number of
   builds per run is not known**; 15–20 is an estimate.
5. **The timeout knobs are already tight.** S6's denial probes use `curl -m 6`, and much of each probe's 5–11 s is
   starting a probe container. The continuity block's `readinessTimeoutMs` is already 20 s, not the 90 s default, and
   its comment gives the reason (five times the fixture's measured 2–4 s boot).

## 2. What is NOT measured, and must come first

**Where `boot`'s 206 s and `releases/production`'s 178 s of setup actually go.** Both `beforeAll`s build, deploy
and wait: `boot` builds and deploys twice, boots a real control plane and then polls up to 120 s for its retire to
finish; `production` runs two suites, each a build, a staging deploy with a real SP registration, and in one a
production launch. Neither has timestamps, and the two obvious explanations both measured false. **So step 1 of any
work here is to time each phase** — a `console.error` with elapsed milliseconds per phase, run once, then removed —
and to count the builds per run. Everything below that says *estimate* should be re-ranked from that measurement
before anything is built.

## 3. The candidates, ranked by estimated saving

| # | Change | Saves (per run) | Confidence | What must stay true |
|---|---|---|---|---|
| 1 | **Build each fixture image ONCE per run and share it**: a global setup builds the contract repository's image(s) and hands the digests to every file that only needs *an* image to deploy | **~3–5 min** (15–20 builds × ~19 s, less the builds that must stay) | Medium — the build count is estimated | **Files whose subject IS building keep building**: `driver`'s *same source → same digest* (two builds on purpose), its `onLog` and scan cases, `builder`, `roundtrip` and `node-ts-mongo` (the only end-to-end build witnesses; P3's 74 green tests with no working deploy is why). A shared image must be tagged per file where a file pushes or deletes it |
| 2 | **Cut what `boot` and `production` actually spend setup on**, once §2 has measured it. One known option: `production`'s two suites each build the same repository; P6b sitting 3 split them because a launched project refuses a rehearsal, so the rehearsal suite needs a project that has not launched. **Ordering the rehearsal before the launch in ONE suite** would save a build and two deploys | **up to ~3 min**; ~90 s for the `production` option | Low until §2 is measured | The rehearsal still runs against a project that has not launched (Decision 16), and the launched project's *rehearsal refused* case still meets a LAUNCHED one. One suite with an ordering dependency is harder to read than two suites that cannot interfere, which is why it was split |
| 3 | **Shorter readiness timeouts in the three never-ready tests** (`driver`'s continuity block at 20 s, and the two `redeploy` files at 12 s each) | ~20–30 s | High | Each timeout stays a comfortable multiple of the fixture's measured boot time under load. A test that waits for *never ready* must still wait longer than a slow *ready* would take, or it passes for the wrong reason |
| 4 | **Shorter `curl -m` in S6's denial probes** (6 s → 3 s) | ~10–15 s (only the probes that time out, as opposed to failing at once) | Medium | **Every denial keeps its positive control on the SAME timeout**, so a probe that timed out on a slow machine cannot read as *denied*. P6b sitting 3 measured the unit tier's 5 s timeouts failing under a Zoom share — prove it on a loaded machine before keeping it |
| 5 | **Run the whole tier less often**: owe a *related* subset mid-plan (the Docker files that import what changed) and the full tier at the plan's acceptance and at least every few sittings | **~25 min for every sitting that no longer owes it** | High for the saving; the cost is the question | **Rich's call, not a code change.** Today any change under fifteen directories owes the whole tier, and in P6b that is every sitting but the first. The cost is finding an integration defect sittings later — and every one of this project's worst defects was integration (P3 found no build and then no deploy had ever succeeded) |
| 6 | **Run files in parallel lanes** | — | — | **Not recommended.** The heavy files all share the truncated database and the restarted edge, so lanes would need per-file schemas and per-file edges — a test-architecture change. The files that could safely run alongside take under 10 s together |

## 4. Are any tests skippable?

**None is recommended for deletion.** Most Docker tests are the only witness of some property, and this project
records several by name: `boot.docker.test.ts` is the only test that fails if `src/index.ts` stops calling the
pending-action expiry sweeper; `routing/edge-source-refusal.docker.test.ts` is the only causal proof of the edge's
`@outside` refusal; and `releases/production.docker.test.ts` is the only proof against the real edge that a launched
app is not rehearsed.

**Two things are worth examining for overlap**, and only as part of this item with the witness question asked first:

- **`releases/production`'s second suite** — a whole build and deploy to prove that a sign-in which cannot complete
  is recorded as a FAILED rehearsal. `make demo-production` proves a PASSING one; nothing else proves the failing
  one against the real IdP. That makes it candidate 2's merge, not a deletion.
- **`runtime/docker/redeploy` (64 s) and `releases/redeploy` (172 s)** — the first tests the driver's takeover, the
  second zero-downtime through `deployRelease` under a request loop. They are different layers, and P4c's record
  should be read before assuming either duplicates the other.

## 5. How any change here is proved

- **The same measurement before and after**: the per-file table above, from the run's own log.

  ```bash
  awk '
  /^ (✓|×) \|docker\| src\//{ f=$3; sub(/^src\//,"",f); t=$NF; sub(/ms$/,"",t); file=f; ftime[f]=t/1000; next }
  /^ (✓|×|❯) / { file="" }
  /^   +(✓|×) / && file!="" { t=$NF; if (t ~ /ms$/) { sub(/ms$/,"",t); tests[file]+=t/1000 } }
  END { for (f in ftime) printf "%7.1f %7.1f %7.1f %s\n", ftime[f], tests[f], ftime[f]-tests[f], f }' \
    <the tier's log> | sort -rn
  ```

- **198 tests before and 198 after**, unless tests are deliberately merged — and then the record says which property
  moved to which test.
- **Every shortened timeout gets a negative control**: break the thing the test waits for, and watch the named test go
  red within the new timeout, on a loaded machine as well as a quiet one.
- **The tier run twice**, since a shared fixture is shared state, and shared state is where this project's flaky runs
  have come from.

## 6. Placement

**Not scheduled.** Candidates 1–4 are the kind of change a plan touching the Docker test helpers
(`runtime/docker/testing.ts`, `releases/testing.ts`) can fold in, measuring first, the way the security items in the
roadmap's *Tracked hardening items* table are folded in. Candidate 5 is Rich's to decide. **It is tracked in its own
table rather than that one** because that table is for security rules the spec describes and nothing enforces, and
its columns (*Spec*, *Enforce in*) do not fit a test's speed.
