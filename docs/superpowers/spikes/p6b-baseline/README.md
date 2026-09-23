# P6b baseline — the measurements Task 1 bought

**Run 2026-09-22, sitting 1 of [P6b](../../plans/2026-09-22-p6b-subsequent-releases.md),
alone and first.** Fifteen measurements, `[M1]`–`[M15]`, taken before a line of P6b's feature
code exists. Every command and its untrimmed output is in
[`results-task1-2026-09-22.txt`](results-task1-2026-09-22.txt); this file is one section per
measurement — what was asked, the command, the raw answer, what it means for the plan, and
where it moves something, the task and the correction.

**The headline: ALL SIX PREMISES THE PLAN WAS WRITTEN AGAINST ARE TRUE — `[M3]`, `[M5]`, `[M6]`,
`[M7]`, `[M8]` and `[M9]` each measured exactly as predicted — AND DRIVING THEM FOUND A SEVENTH
THE PLAN DID NOT KNOW: THE EGRESS PROXY NEVER RE-RENDERS ITS ALLOWLIST** (F1). A changed
`egress.allow` never reaches a running environment: an ADDED host is `403 Filtered` exactly like
an undeclared one, and a REMOVED host **stays reachable**. So every approval of an `egress.allow`
change — which is a re-escalation, P6b's subject — approves a change that does not take effect,
in both directions, and Task 11's leg A would have proved a control that was not in force. **It
adds Task 5a to sitting 3** (see *What moved*), and corrects Task 11.

**The other headline is `[M7]`, measured twice — once by the plan's own acceptance.** `make
demo-production`'s re-use path rehearses an app that has already launched, and in doing so it
retired the live, approved production instance and served an unapproved release on the public
listener for 1.045 s before the approval that follows (F2). Step 15 then made it indefinite.

**The machine.** macOS 26.6.2 (25G83), arm64, 12 cores, 36 GiB. Node v24.12.0, pnpm 11.24.0,
Docker 29.7.2 (API 1.55), Docker Desktop 4.87.0, OpenSSL 3.6.3, bash 3.2.57, Caddy v2.11.4,
Ollama 0.34.3. Written at `9b335e8`; no other session committed during the sitting.

---

## The four gate numbers, as this sitting found them

| Gate | Command | Open | Close | §2's box |
|---|---|---|---|---|
| unit + packages | `pnpm test` (repo root, **twice** each time) | **1605 passed, 119 files**, 129.8 s then 128.6 s | **1605 / 119**, 125.8 s then 126.0 s | 1605 / 119 — **agrees** |
| lint / types / format | `pnpm lint`, `pnpm typecheck`, `pnpm format:check` | clean | clean | — |
| platform | `make doctor` | **19 checks, 0 failed, 0 warnings** | **19 / 0** | 19 / 0 — **agrees** |
| platform | `make verify` | **55 checks, 0 failed, 0 warnings** | **55 / 0** | 55 / 0 — **agrees** |
| Docker tier | `pnpm test:docker` | **NOT RUN, AND NOT OWED** | — | 194 / 31 |

**Nothing moved.** The committed diff is this directory and the plan; the two probe tests were
created and deleted in their own steps, and nothing under an owing path changed.

---

## `[M1]` — the state this sitting started from, queried before anything truncated it

```
lsof 7100 / 7102 / 7104      → nothing listening on any of them
ifconfig lo0                 → 127.0.0.1, 127.0.0.2, 127.0.0.3
projects releases approvals iam_registrations rehearsals users builds instances routes app_specs → all 0
drizzle.__drizzle_migrations → 21
docker ps                    → the nine platform containers; launch-app and click-launch standing in
                               production and staging (containers only — no rows hold them)
```

**Exactly what P6a sitting 11 handed over.** Docker Desktop was running. `git status` clean at
`9b335e8`.

## `[M2]` — the baseline, and the versions

The table above. **1605 / 119, 19 / 0, 55 / 0 — §2's box exactly.** `make verify`'s meters read
`runtime routes currently applied: 0` and `mf- containers=12 networks=4 volumes=8`.

## `[M11]` — the contract as it stands. **HOLDS.**

```
jq -r .info.version packages/contract/openapi.json            → 1.0.0
operationIds                                                   → 41 (41 distinct)
git log -3 -- document.ts packages/contract/package.json       → 58107aa (P5c) is the newest
commits touching openapi.json since 58107aa                    → 11
operationIds at 58107aa                                        → 34
added since: approveRelease getApproval getLaunchRecords recordIamRegistration
             recordPrivacyAssessment rejectRelease runRehearsal → P6a's seven, unbumped
```

**Decision 15 stands**: `1.1.0`, once, in Task 2, covering P6a's seven. **And `document.ts`'s own
comment says *"every one of its 34 operations"*** (lines 13–19) — stale at 41, and it will be 43
after Task 9 (F12). The constant is at line 26, not 14–24 as *Read this first* 11 says.

## `[M3]` — `isSensitiveDiff` has one caller, and cannot see a raised production override. **HOLDS.**

```
grep isSensitiveDiff (non-test, not diff.ts/index.ts)
  → api/routes/project-reads.ts:382 — the validate route. (approval.ts:169 is a comment.)
probe: [M3] override raised 512Mi -> 8Gi: {"sensitive":false,"fields":[]}
probe: [M3] top-level raised:            {"sensitive":true,"fields":["resources"]}   ← control (a)
```

**Decision 5's premise is true**, and control (a) proves the probe can see a `true`. The probe
was deleted in the same step.

## `[M5]` — the baseline counts a release that was approved and then rejected. **HOLDS.**

```
[M5] approve: 201 approved | reject: 201 rejected
[M5] GET …/approval (latest decision): rejected
[M5] baseline after approve-then-reject: THE REJECTED RELEASE
[M5] control, approve only: THAT RELEASE (correct)                                   ← control (b)
```

**What the probe needed:** `approval.test.ts`'s own local `releasedProject` (lines 28–77) and
`api/testing.ts`'s `loginAs`, `mutationHeaders`, `projectBody` and `testDeps`. **Task 3 does not
need to move anything to write its `[M5]` tests** — `approval.test.ts` already has
`releasedProject` and `secondRelease` — so Step 5's sentence *"Task 3 moves the one it needs into
`api/testing.ts`"* contradicts the plan's own File Structure and fixtures section, which give the
move to Task 4. **Ruled: Task 4 moves; Task 3 uses the file's locals** (F8, and Task 3's
correction block). `releasedProject` exists TWICE today (`approval.test.ts:28`,
`delivery.test.ts:139`), `builtProject` once (`delivery.test.ts:87`).

## `[M4]` — the manifest's `blueprint:` is read by nothing but `isSensitiveDiff`. **HOLDS, and driven.**

**Reading:** of every `.blueprint` read in `src/`, the ones on a **project's** manifest are
`spec/diff.ts:118` only; `index.ts`, `release.ts:1089`, `registry.ts:49/123` and
`compatibility.ts:21` read a blueprint DESCRIPTOR, and `projects.ts:142-238` the create request's
body. `spec/policy.ts` has no blueprint rule. **One read the plan did not name**:
`blueprints/registry.ts:80` refuses, at load, a STARTER whose `manifest.yaml` pins another
blueprint — *"validated against one blueprint and built by another"*, in its own comment. **The
rule *What this plan does not build* proposes for a project's manifest already exists for
starters**: that is the pattern to copy.

**Driven (Step 14, then further):**

```
commit blueprint: node-ts-mongo@9 → POST …/spec → {"valid":true,"sensitiveDiff":{"sensitive":true,"fields":["blueprint"]}}
project.blueprintRef → node-ts-mongo@1;  GET /v1/blueprints → ["fixture-node@1","node-ts-mongo@1"]
BUILD it → {"status":"succeeded","commitSha":"4573b089…","imageDigest":"sha256:266476843ef2…"}
```

**A manifest naming a blueprint that does not exist validates AND BUILDS** — built by `@1`, the
project's pin (F6). Restored byte-identically.

## `[M6]` — a release freezes the NEWEST spec, not its build's, and takes another project's build. **HOLDS, every half.**

**Reading:** `api/routes/releases.ts:178-183` selects the newest `app_specs` row by
`created_at` and never reads `build.appSpecId`; `releases/release.ts:141` reads the build by id
alone.

**Driven** (a clone of `launch-app.git`; S1 = `804b9793`, the original):

| Step | What | Raw answer |
|---|---|---|
| 1 | build HEAD → **B1** | `succeeded`, `app_spec_id = 804b9793` (S1) |
| 2 | commit `egress: allow: [m6.example.org]`, validate → **S2** | `valid: true`, `sensitiveDiff.fields: ["egress.allow"]` — **predicted exactly**; S2 = `e4b27617` |
| 3 | **control (e)**: build after S2 (B2), release it | release `app_spec_id = e4b27617` = B2's; `egressAllow ["m6.example.org"]` — **fired** |
| 4 | release **B1** | `201`; **B1.app_spec_id = 804b9793, release.app_spec_id = e4b27617**; production `egressAllow ["m6.example.org"]` |
| 5 | deploy that release to STAGING (leg A's premise) | **`healthy`** — and see F1 |
| 6 | commit `runtime.port: "x"`, validate; release B1 again | `valid: false` (`SPEC_INVALID_VALUE`), `parsed = {}`; **`500 INTERNAL`**, `TypeError: Cannot read properties of undefined (reading 'map') at resolveConfig (spec/resolve.js:16:26)` |
| 7 | the instructor creates `m6-other`; `POST /v1/projects/m6-other/releases {buildId: B1}` | **`201`**: `releases.project_id = m6-other`, `builds.project_id = launch-app` — one project's image under another's name |
| 9 | restore | `git diff <original> HEAD` prints nothing |

**Leg A's premise holds as the plan states it** — the deploy is `healthy`. **What it does not
say is that the new host is reachable, and it is not** (F1).

### F1 — THE EGRESS PROXY NEVER RE-RENDERS ITS ALLOWLIST

Step 5's *"record the egress proxy's rendered allowlist"* found the staging proxy, created at
`2026-09-23T02:52:21Z` by P6a sitting 11, still holding only the platform baseline after a
`healthy` deploy of a release declaring `m6.example.org`:

```
docker exec mf-launch-app-staging-egress cat /tmp/allowlist
  ^manifest-verdaccio$  ^manifest-litellm$  ^manifest-idp$
from the app container, through its proxy:
  manifest-verdaccio:4873 → HTTP/1.1 200 OK                      ← positive control
  m6.example.org          → HTTP/1.1 403 Filtered                ← DECLARED, and refused
  never.example.org       → HTTP/1.1 403 Filtered                ← undeclared, refused
```

**The removal direction — the one that fails OPEN — measured by recreating the proxy:**

```
docker rm -f mf-launch-app-staging-egress; deploy RB1 (declares m6) → healthy
  allowlist: … ^m6\.example\.org$
deploy R2 (declares NO egress.allow) → healthy
  allowlist: … ^m6\.example\.org$                                ← unchanged
  m6.example.org    → HTTP/1.1 500 Unable to connect             ← PASSED the filter (offline: no DNS)
  never.example.org → HTTP/1.1 403 Filtered
```

**The cause is one early return**: `runtime/docker/egress.ts:78-81`, `ensureEgressProxy` —
*if the container exists, start it if stopped and return* — so the allowlist is rendered once, by
the first deploy an environment ever has, and never again. **Why nothing saw it**:
`egress.docker.test.ts`'s *ALLOWS a destination this app declared* calls `destroyEgressProxy`
**before** asking for the new list, so it tests around the defect; *is idempotent* asserts only
that the URL is the same. **What it means for P6b**: `egress.allow` is a sensitive field in both
directions (`sameSet`), so every change to it re-escalates — and an administrator approving
*"now allows m6.example.org"* or *"no longer allows it"* approves something that never happens.
**Restored** at the close of Step 15: the proxy removed and re-rendered by a deploy of R2, and
read back as the baseline alone. *Moves: Task 5a (new, sitting 3) and Task 11.*

## `[M15]` — the tests this plan will turn red

```
test files that create a release AND validate a spec:
  lifecycle.test.ts  releases/approval.test.ts  observability/incidents.test.ts  api/delivery.test.ts
production.docker.test.ts it()s: 310 digest-not-approved; 335 different digest; 348 deploys to PRODUCTION;
  371 not on srv0; 389 SP registration; 403 runs the approved digest; 446 runs the rehearsal
  (one shared `project`, line 109 — the launch at 348, the rehearsal at 446: Read this first 19 holds)
delivery.test.ts production it()s: 566 step-up before checklist; 588 same checklist; 654 deploys to production; 775 collaborator
```

**For Decision 6 (Task 3): no case in the four files releases a build older than the newest
spec** — every `POST …/spec` precedes its `POST …/builds` — so the route change is predicted to
turn none of them red. **`createRelease` has 28 direct callers** (22 in `releases/releases.test.ts`,
six Docker files); the two opened pass their own project's build, so the scoped lookup is
predicted to turn none red either. **Task 3 runs the whole suite and names any that move.** For
Task 4: `production.docker.test.ts:446`'s rehearsal follows its own launch at 348, as predicted.

## Step 7 — `make demo-production`, the fresh path (run A)

**Green, 62 s, 59 checks.** Build 18.1 s; digest `sha256:25cdc95fb689…`; unmet
`[admin-approval, iam-registration, privacy-assessment, rehearsal]` → `[admin-approval, rehearsal]`
→ `[admin-approval]` → `[]`; rehearsal 5978 ms; production deploy 5301 ms, `127.0.0.3` answered as
`273923bf…`, `127.0.0.2` no header; the rebuild IDENTICAL (P6a F3, again).

## `[M13]` — a person-only capability can be minted today, and only `requireSession` refuses it. **HOLDS.**

```
as the (un-stepped) administrator, POST /v1/projects/launch-app/tokens:
  ["project:read","release:approve"] → 201, secret issued
  ["project:read","launch:record"]   → 201, secret issued
  ["release:promote"]                → 400 TOKEN_CAPABILITY_FORBIDDEN "a delegated token may never hold
                                        release:promote (D24)"                         ← control (c)
the release:approve token → POST /v1/releases/R1/approve
  → 403 TOKEN_CREDENTIAL_REFUSED "this action is only available in an interactive session (D24)"
the launch:record token → POST …/launch-records/iam-registration (a body identical to the record)
  → 403 TOKEN_CREDENTIAL_REFUSED, the same sentence
both revoked (200, 200); the revoked token → 401 UNAUTHENTICATED
```

**Both refusals come from the route's `requireSession`, with the same code a missing session
would get** — the gap Task 2 closes. The approve probe was aimed at the already-approved R1, so a
wrong prediction would have written a harmless second approval.

**The plan's `api_as` helper broke first (F9)**: it declares `local … path="$3"`, and zsh ties
`$path` to `$PATH`, so under zsh — this machine's shell and the agent's — every call answered
`command not found: curl`. Renamed `p`, and every later step ran under `bash`.

## `[M10]` — the recorded ACS is compared with nothing. **HOLDS, and stronger than predicted.**

```
active → active with acsUrl https://wrong.example/acs → 200, acsUrl https://wrong.example/acs
iam-registration: met — "Registered as https://manifest.internal/sp/launch-app/production, active
  (ticket IAM-ACCEPTANCE), releasing 5 attribute(s)."            (identical before, during and after)
EVERY item, wrong ACS: domain met · iam-registration met · privacy-assessment met · rehearsal met ·
  scans met · admin-approval unmet · code-review not_built       (identical to the right-ACS read)
rehearsal's why: "…This proves the SHAPE of the registration — the entityID, the ACS URL, the
  attribute release and the certificate all work together…"
```

**No item sees it — not even `rehearsal`, whose own sentence says it proved the ACS URL** beside a
record naming `wrong.example` (F5). `rehearsalCovers` compares the rehearsal with the candidate,
never with what the administrator recorded. Task 7 already makes the first-launch item compare
ACS and SLO; its correction block carries this. Restored.

## `[M9]` — recording a change request overwrites what UBC registered. **HOLDS, and driven.**

```
before:            {"state":"active","registeredAttributes":[…five…]}
active → change_requested, registeredAttributes = four without sn → 200
GET …/launch-records: {"state":"change_requested","registeredAttributes":["ubcEduCwlPuid","mail",
  "eduPersonAffiliation","givenName"],"externalTicketRef":"IAM-M9-DROP-SN"}
DB row:            change_requested|["ubcEduCwlPuid", "mail", "eduPersonAffiliation", "givenName"]
DRIVEN — a build of the UNCHANGED app: {"status":"failed","failureReason":"SPEC_ATTRIBUTE_NOT_REGISTERED:
  manifest.yaml asks for 1 CWL attribute(s) UBC IAM did not register for 'launch-app': sn. Registered:
  eduPersonAffiliation, givenName, mail, ubcEduCwlPuid. — … Raise an IAM change request against
  IAM-M9-DROP-SN for the missing attribute(s), or remove them from auth.attributes."}
```

**The record claims UBC registered four, and the build believes it** — and tells the owner to
raise a change request against the change request (F4). UBC's real registration never changed.
Restored along the arrows: `change_requested → submitted → active`, five attributes; unmet back to
`[admin-approval]`.

## Step 11 — `make demo-production`, the re-use path (run B)

**Green, 61 s, 58 checks**; unmet `[admin-approval]` at step 3; summary `llm`; production
`c473be07…`. Releases, newest first, and each one's latest decision:

```
4ffab38e  NOT_FOUND   ← run B's step-10 rebuild — SERVING STAGING, unapproved
44eb3841  approved    ← R2, run B's launch — in production
5562330d  NOT_FOUND   ← run A's rebuild
b3a1c485  approved    ← R1, run A's launch
```

**The plan's Step 11 says R2 *"is now in production and is the candidate"* — it is not the
candidate** (F3): `make demo-production`'s step 10 deploys its rebuild to staging, so the
candidate is `4ffab38e`. Step 12 as written would have been refused before it measured anything.

### F2 — THE ACCEPTANCE ITSELF DOES `[M7]`

Run B's step 5 rehearsed a launched app. `audit.events`:

```
05:17:44.222 instance.healthy   9244a5b1 (R2, not yet approved)  launch-app is running in production.
05:17:44.279 instance.retiring  273923bf (R1, APPROVED, LIVE)    The previous version … is finishing its last requests.
05:17:44.748 rehearsal.completed
05:17:45.324 release.approved   44eb3841 (R2)
```

**The live, approved launch was retired, and the public listener served a release with no
approval, for 1.045 s** — bounded here only because the demo approves next. Task 4's
`REHEARSAL_LAUNCHED` closes it, and *Read this first* 22 already predicts that step's change.

## `[M8]` and `[M14]` — the gate evaluates one release and deploys another. **HOLDS, both directions.**

**12a — as the plan's state actually was** (candidate = the unapproved rebuild): the stepped-up
owner deploys **approved R1** → `409 RELEASE_PRODUCTION_GATE_UNAVAILABLE`, the envelope's
checklist naming candidate `4ffab38e` with `admin-approval` unmet. **An approved release refused
because a DIFFERENT, unapproved release is in staging** — `[M8]`'s mirror.

**12b — `[M8]` proper**: R2 deployed to staging (`healthy`; checklist `ready: true`, candidate
R2), then the owner deploys **R1** to production:

```
{"state":"healthy","releaseId":"b3a1c485-…" (R1),"instance":"6e10e5fc-…"}
production after: {"instance":"6e10e5fc-…","release":"b3a1c485-…"}
```

**The checklist described R2 and production now runs R1.** R1 and R2 share a digest (the builder
is reproducible), so this shows a different RELEASE reaching production, not a different digest —
the claim is that nothing compares `body.releaseId` with the candidate, and nothing did.
Restored: R2 back to production, `200`.

**`[M14]` — the loop on the public listener, HOLDS**: `57 app`, nothing else; the instance
`c473be07… ×22 → 6e10e5fc… ×35`, changing once. **Control (d) fired**: the first records are the
existing instance. **One caveat for Task 11 (F11)**: the loop classifies only a body starting
`manifest OK` as `wildcard`, and the PUBLIC listener's wildcard answers an EMPTY `200`, so it
would read `status-200` — still not `app`, so the check stays honest, but a red run's label
differs.

## `[M12]` — the summary differs between two calls on one input. **HOLDS.**

The operator stepped up and rejected the egress release twice:

```
05:24:04 llm  The firewall rule now explicitly permits outgoing traffic to **m6.example.org** (previously
              blocked entirely). This could expose the system to risks if the domain is compromised or
              misused, so verify its necessity and security posture before enabling. Ensure no sensitive
              data is sent to this host.
05:24:06 llm  The rule now explicitly permits traffic to **m6.example.org** (previously blocked all egress).
              This could expose the system to risks if the domain is compromised or misused. Verify if
              this domain is a trusted third-party service and confirm no sensitive data is sent there.
distinct summaries 2 · rows 2 · distinct change lists 1
```

**Decision 10 compares facts because the words differ, and here they did.** Both summaries also
carry Markdown `**…**` under a prompt that already says *"Plain English"*, and the console renders
`{diff.summary}` as text — literal asterisks, P6a F11's shape (F10). The baseline is untouched
(two `rejected` rows on a release never approved).

**Also measured, *Read this first* 12**: R2's approval records
`summarySource: llm` beside *"Nothing in manifest.yaml changed since the last approved release."* —
the fixed sentence, no model involved.

### F7 — THE VALIDATE ROUTE SAYS "NOT SENSITIVE" WHEN IT DID NOT COMPARE

Restoring from S2 (which added `egress.allow`) through the invalid spec reported
`{"sensitive":false,"fields":[]}` — although removing `m6.example.org` is a sensitive change.
`project-reads.ts:381-384`: the diff runs only when the **immediately previous** row is valid, and
otherwise answers the same `{sensitive: false, fields: []}` a genuine no-change answers. **Any
sensitive change committed after an invalid one reports as not sensitive.** It is a report, not a
gate, but it is a negative claim made without looking. *Moves: Task 3.*

## `[M7]` — a rehearsal on a launched app replaces live production with an unapproved release. **HOLDS EXACTLY.**

```
R3: a comment appended to server.js → build sha256:07ddf5b9fe9e…, a NEW digest; staging healthy
production before: {"instance":"bef81dab-…","release":"44eb3841-…" (R2)}   127.0.0.3 → x-manifest-instance: bef81dab-…
POST /v1/projects/launch-app/rehearsal (operator) → {"passed":true,"releaseId":"ff6808ae-…" (R3)}
production after:  {"instance":"7221f2c2-…","release":"ff6808ae-…" (R3)}   127.0.0.3 → x-manifest-instance: 7221f2c2-…
select count(*) from approvals where release_id = R3 → 0
the checklist: admin-approval unmet for the candidate; NOTHING says production runs an unapproved release
```

**A new, never-approved digest serving the public listener, with no record of any decision.**
Restored: the staging egress proxy re-rendered (F1), R2 to staging, the owner stepped up again, R2
to production (`200`, `d49d8f59…`), and a revert pushed — **`git diff <original> HEAD` prints
nothing; the tree is `c181e70d…`, the original's.**

---

## Negative controls

| | Control | Predicted | **Measured** |
|---|---|---|---|
| a | `[M3]`'s top-level limit raised | `fields: ["resources"]` | **FIRED** — `{"sensitive":true,"fields":["resources"]}` |
| b | `[M5]`'s approve-only release | that release's id | **FIRED** — `THAT RELEASE (correct)`, asserted |
| c | `[M13]`'s `release:promote` mint | `400 TOKEN_CAPABILITY_FORBIDDEN` | **FIRED** — `400`, *"a delegated token may never hold release:promote (D24)"* |
| d | `[M14]`'s first records | `app` with the old instance id | **FIRED** — `c473be07…`, 22 records before the change |
| e | `[M6]`'s release of a build made after S2 | `appSpecId` equal to the build's | **FIRED** — `e4b27617` both |

**All five fired. None stayed green.** F1 adds its own pair: `manifest-verdaccio` `200 OK` beside
`never.example.org` `403 Filtered`, so the proxy's answers mean something.

## What moved

| Finding | Task | The correction |
|---|---|---|
| F1 — the egress proxy never re-renders | **Task 5a (NEW, sitting 3)**; Task 11 | A new task: `ensureEgressProxy` re-renders when the list differs, with a Docker test in both directions. Leg A asserts through the proxy |
| F3 — "R2 is the candidate" | Task 1 (the record) | Step 12 needs R2 re-staged first; recorded, not a later task |
| F5 — no item sees a wrong ACS | Task 7 | A note: its first-launch ACS/SLO case is the fix; the rehearsal item's sentence overclaims until then |
| F6 — a blueprint that does not exist builds | *What this plan does not build* | The measurement, and `registry.ts:80` as the pattern |
| F7 — the validate route's negative claim | Task 3 | Compare with the newest VALID spec |
| F8 — `commitManifest` before it exists | Task 3 | Task 3 creates it in `api/testing.ts`; Task 4 reuses it |
| F9 — `local path` in zsh | Task 1's snippet | Renamed `p` |
| F10 — Markdown in the summary | Tasks 8 and 10 | The prompt says so; the clicked row checks it; the record stays verbatim |
| F11 — the loop's public wildcard | Task 11 | A note on reading a red leg B |
| F12 — "34 operations" | Task 2 | The comment's count goes with the bump |

**The sittings table moves by one task, not by a boundary**: sitting 3 becomes Tasks 4, 5 and 5a,
with the same overflow rule the lean split already has for sitting 5 — **if it runs long, stop
after Task 5 and sweep; Task 5a then opens sitting 4, ahead of Task 6**, because it shares nothing
with Task 6.

## Everything that was temporarily changed, and the proof it was restored

| Changed | Restored | Proof |
|---|---|---|
| `spec/m3-probe.test.ts`, `releases/m5-probe.test.ts` | deleted in their own steps | `ls` → *No such file*; `git status` clean before the docs |
| the IAM registration's ACS (`[M10]`) | re-recorded | `acsUrl …/auth/ubcshib/callback` read back |
| the IAM registration's state and attributes (`[M9]`) | `→ submitted → active`, five | `GET …/launch-records` |
| production running R1 (`[M8]`), then R3 (`[M7]`) | R2 redeployed, twice | `GET …/environments`, `X-Manifest-Instance` on `127.0.0.3` |
| `launch-app.git`'s HEAD (nine probe commits, the last a revert) | reverted | `git diff <original> HEAD` empty; tree `c181e70d…` |
| the staging egress proxy (F1) | removed, re-rendered by R2 | `/tmp/allowlist` = the baseline alone |
| two delegated tokens (`[M13]`) | revoked | `DELETE` `200` ×2; the token `401` |
| `m6-other` (project and repository) | rows truncated by the close's `pnpm test`; `.manifest/repos/m6-other.git` removed | `ls .manifest/repos` |

## The machine, at close — queried, not recalled

**`make doctor` 19/0, `make verify` 55/0, `pnpm test` 1605 in 119 twice.** The control plane was
stopped: **nothing listens on 7100, 7102 or 7104.** **THE DATABASE IS EMPTY** (the close's `pnpm
test` truncates) with **21 migrations**. `make verify` reads **`mf- containers=12 networks=4
volumes=8`** — `launch-app` (now R2's instances `d49d8f59…` in production and `c63c9ba8…` in
staging) and `click-launch` — and **`runtime routes currently applied: 1`**, where the edge holds
TWO live routes: `mf-launch-app-staging-manifest-internal` on `srv0` and `mf-launch-app-manifest-internal`
on `srv1`. **That meter counts `srv0` only** (`scripts/verify.sh:1142`), so it cannot see a
production route (F13). **Cleanup:** `dead-app-resources.sh` — *none dead*, nothing to apply;
`litellm-orphans.sh --apply` **was allowed** — the twelfth consecutive sitting — and deleted two
orphans (`mf-99c1dc2d-…-production` and `-staging`, P6a's `launch-app`, orphaned when run A
recreated the project); re-measured, *Nothing to delete*. **Images, with the metric named**:
`docker images -q` **56**, `sort -u` **48**, `127.0.0.1:7107/local/*` **6** (`launch-app` 5).
**At the open the snapshot listed only 2 `local/*` images, where P6a's close counted 142** —
swept by somebody between the two sessions; not this sitting's doing (F14).

**`snapshot-machine.sh` at open and close, diffed — 64 lines, every one accounted for**: the
timestamps and uptimes; free disk 107 → 108 Gi; `launch-app`'s two app containers replaced by R2's
(same shape); its staging egress proxy recreated by F1's restore (*Up 9 minutes*); four new
`launch-app` images (`07ddf5b9` R3, `25cdc95f`, `26647684` the `@9` build, `4d965414` B2); and the
two `-app-files` volumes renamed with their instances. **The four protected containers survive**
(`docker-simple-saml-saml-idp-1` still `Exited (0) 2 weeks ago`), `caddy-data` is intact, all three
loopback aliases are on `lo0`, and `docker-simple-saml`'s only dirty path is its untracked
`cert.zip`.
