# D5 baseline — the measurements the GitHub driver plan rests on

**Run 2026-09-24, sitting 1 of [the D5 GitHub source driver plan](../../plans/2026-09-24-d5-github-source-driver.md),
alone and first.** Nineteen measurements, `[M1]`–`[M19]`, taken before a line of the plan's feature code
exists. Every command and its untrimmed output is in
[`results-task1-2026-09-24.txt`](results-task1-2026-09-24.txt) (838 lines of Ajv's *unknown format*
warnings are replaced there by their count); the scripts that produced them are in [`probes/`](probes/).
This file is one section per measurement: what was asked, the raw answer, what it means for the plan, and,
where it moves something, the task and the correction. **Rich said yes to the network at the start** —
`[M3]`, `[M10]` and `[M4]`'s `apk add` ran live.

**The headline: EVERY PREMISE THE PLAN WAS WRITTEN AGAINST HOLDS, AND DRIVING THEM FOUND THAT THE MIRROR'S
NON-FORCED FETCH — THE PLAN'S OWN HISTORY-KEEPING RULE — FREEZES `main` AFTER ONE REWRITE** (F6). Git
refuses the rewrite exactly as predicted. But every later sync then reports the same refusal, so **a normal
push on top of the rewritten history is never an update**: never scanned for secrets, never validated,
never reported. And the driver's `headCommit` would answer the frozen `main` for ever, which is the stale
head Decision 18 forbids. One force-push on a free organisation, where `main` cannot be protected, would
switch push-time scanning off for `main` for good. **The fix is measured**: a second, forced refspec into
`refs/manifest/upstream/*` in the same fetch. It corrects Tasks 7, 9 and 11, and moves no sitting.

**The other headline is `[M15]`, and it is Rich's**: Task 13's own check withholds **7 of 10** summaries
under Task 13's own prompt — twice — which crosses the plan's *"more than 5 of 10 → raise it with Rich in
sitting 7"* line. **None of the fourteen withheld is a verdict**: they are backticks round a hostname and
the word *"blocked"* describing egress (F7).

**The machine.** macOS 26.6.2 (25G83), arm64, 12 cores, 36 GiB. Node v24.12.0, pnpm 11.24.0, git 2.50.1
(Apple Git-155), Docker 29.7.2 (API 1.55), Docker Desktop 4.87.0, docker compose 5.4.0, OpenSSL 3.6.3,
bash 3.2.57, Caddy v2.11.4, Ollama 0.34.4, TypeScript 5.9.3, Fastify 5.12.3, Ajv 8.20.0. Written at
`a2885ed`; no other session committed during the sitting.

---

## The four gate numbers, as this sitting found them

| Gate | Command | Open | Close | §2's box |
|---|---|---|---|---|
| unit + packages | `pnpm test` (repo root, **twice** each time) | **1742 passed, 123 files**, 181.7 s then 181.2 s | see the plan's sitting 1 record | 1742 / 123 — **agrees** |
| lint / types / format | `pnpm lint`, `pnpm typecheck`, `pnpm format:check` | clean | see the plan's record | — |
| platform | `make doctor` | **19 checks, 0 failed, 0 warnings** | see the plan's record | 19 / 0 — **agrees** |
| platform | `make verify` | **55 checks, 0 failed, 0 warnings** | see the plan's record | 55 / 0 — **agrees** |
| Docker tier | `pnpm test:docker` | **NOT RUN, AND NOT OWED** (nothing under the owing paths changed) | — | 200 / 31 |

**Nothing moved.** The committed diff is this directory and the plan. Every temporary change is listed
under *Everything that was temporarily changed*, with the proof it was restored.

---

## `[M1]` — the state this sitting started from, queried before anything truncated it

`launch-app` launched (`launched_at 2026-09-24 18:00:39Z`); **1 project, 4 releases, 3 approvals, 4 specs,
6 builds**; **24 migrations**; nothing on 7100, 7102, 7104 or 7110; `127.0.0.1`, `.2` and `.3` on `lo0`;
the nine platform containers and `launch-app`'s six up. `.manifest/repos/` holds **six** bare
repositories — `click-launch`, `journey-app`, `launch-app`, `p5c-acceptance`, `proof-app`, `token-app` —
against one project row: five orphans that `pnpm test` and earlier demos left behind, which
`clear_orphan_repository` handles and the plan's Decision 16 must never adopt on driver 2.
`docker-simple-saml-saml-idp-1` is present and **Exited (0) 2 weeks ago**, as it was found.
**`launch-app`'s repository is a driver-1 bare repository**, so Decision 3's trap applies to it.

## `[M2]` — the baseline, and the versions. **HOLDS, with one version wrong in the plan (F1).**

The four gates read §2's box exactly (table above). **F1:** the plan's Tech Stack said *"Fastify **5.12.2**
(installed; P6b's header said 5.12.3)"*. **The installed package is 5.12.3** — the only `fastify@` in
`node_modules/.pnpm`, what `packages/control-plane/node_modules/fastify` links to, and what
`packages/control-plane/package.json` asks for (`^5.12.3`); `pnpm-lock.yaml` names no 5.12.2. **P6b was
right. And the plan's number has a source**: fastify 5.12.3's own `fastify.js` says `const VERSION =
'5.12.2'`, so `app.version` answers 5.12.2 (seen in `[M9]`). Also: the plan's Step 2 version command
`node -e … --prefix packages/control-plane` fails with `node: bad option: --prefix` (exit 9) and only its
fallback answers. **Corrected in the plan's header.**

## `[M3]` — Gitea and Forgejo, re-read (network). **HOLDS EXACTLY.**

Gitea `1.27.0+dev-954-g1f3981a301`, **342 paths**; Forgejo `16.0.0-dev-753-6bcc6da0+gitea-1.22.0`,
**326 paths**; **0 and 0** matching `^/app|installation|access_token`. The token paths they do have are
user tokens and runner registration tokens, listed in the results. **The fake stays our own.**

## `[M4]` — git over HTTP with core git alone. **HOLDS — after the probe's own defect (F2).**

`probes/smart-http.mjs` (the plan's 40 lines, verbatim) served a push, a 3 MB push and a clone, all exit 0,
with the Basic header passed only through `GIT_CONFIG_*`; a clone WITHOUT the header was refused
(`terminal prompts disabled`, exit 128). Alpine's git **2.49.1** advertises both services under
`--stateless-rpc --advertise-refs`, and **`git-http-backend` is absent** (`No such file or directory`).

**F2 — THE FIRST RUN "PASSED" AND CLONED NOTHING.** The probe created its bare repository with `git init
--bare` under `GIT_CONFIG_NOSYSTEM=1`, so no `init.defaultBranch` applied and `HEAD` named
`refs/heads/master`. The push to `main` succeeded, and the clone **exited 0** with *"warning: remote HEAD
refers to nonexistent ref, unable to checkout"* — 0 commits, no files. **Alpine's git does the same by
default** (`cat /r.git/HEAD` → `ref: refs/heads/master`). The fake will run exactly there. **Corrected in
Task 4**: every fake repository is `git init --bare -b main`, and a clone test asserts the file, not the
exit code.

## `[M5]` — where a token leaks, with a canary. **HOLDS, and one more path (F3).**

`probes/leak.mjs`, against a port nothing listens on, building exactly `local-driver.ts`'s message
(`` `git ${args[0]} failed: ${String(error)}` ``):

| Form | canary in the message | its base64 in the message |
|---|---|---|
| A: `-c http.extraHeader=Authorization: Basic …` in argv | false | **true** |
| B: `http://x-access-token:<token>@host/…` | **true** | false |
| C: `GIT_CONFIG_COUNT/KEY_0/VALUE_0` in the environment | false | false |

**The positive control is strict:** a server that accepts ONLY the canary's exact header took form C's
push (exit 0, the served `main` equal to the pushed one) and refused the same push with a wrong token
(exit 128). So *no leak* means git sent the token and nothing printed it, not that git never sent it.
Git's own stderr redacts the URL's userinfo; **it is `String(error)`'s `Command failed: git <every
argument>` that carries A and B.**

**The path to the wire:** `local-driver.ts:67-76` `git()` → `new SourceError('SOURCE_GIT_FAILED', …
String(error))` → a route throws → `api/server.ts:306` `setErrorHandler` → `toErrorResponse` →
`mapError`'s state-conflict branch (`api/errors.ts:640-650`: `error instanceof SourceError`) →
**`409 { error: { code, message: error.message } }`**. That is Decision 4's reason and Task 7's canary test.

**F3 — THE ENVIRONMENT CARRIES TRACE VARIABLES TOO.** `probes/leak-trace.mjs`: with form C against a
server that answers `401` after git has sent the header, `GIT_CURL_VERBOSE=1` and `GIT_TRACE_CURL=1` write
`<redacted>` to stderr, because `GIT_TRACE_REDACT` defaults on. With **`GIT_TRACE_REDACT=0`** inherited,
the **base64 reaches stderr**. Task 7's `gitWithToken` builds its message from stderr and redacts both
forms, so the MESSAGE survives that. But `probes/leak-trace-file.mjs` shows the case no redactor reaches:
**an inherited `GIT_TRACE_CURL=<file>` with `GIT_TRACE_REDACT=0` writes the token's base64 to that file**,
because Task 7 spreads `process.env` into git's environment. Forcing `GIT_TRACE_REDACT=1` after the spread
writes `<redacted>` instead. **Corrected in Task 7.**

## `[M6]` — the stateless installation token against the build's patterns. **HOLDS EXACTLY.**

`probes/patterns.mjs` read **seven** patterns from `build/gates.ts` (it throws otherwise). **Three** of the
seven entries put `pattern:` on the next line, not four as the probe's comment said. The negative control
comes first: the classic 40-character `ghs_…` is caught by *a GitHub token*. **The stateless
`ghs_1234567_<JWT>` (438 characters) is caught by NOTHING**, and a bare JWT (426) by *a JSON Web Token*.
Task 11's new pattern stands.

## `[M7]` — the webhook's route, both ways. **HOLDS, with one exit code wrong and a control added.**

A container on `manifest-platform` reached a throwaway `127.0.0.1:7197` listener through
`host.docker.internal`, both with Docker Desktop's name and with `--add-host …:host-gateway`
(`reached`, exit 0, twice). **An app network (`mf-launch-app-staging-net`) could not resolve the name —
`curl: (28) Resolving timed out`, exit 28, not the predicted exit 6**: the name never resolves, and the
DNS there times out rather than answering NXDOMAIN. A test that asserts exit 6 would be wrong. Through
the edge, from a container: **`manifest: the control plane is not reachable from this network`**
(`403`), the `@outside` body.

**The plan's claim that the console site does not forward `/webhooks/*` needed a control the plan did not
have.** Every container is refused by `@outside` first, whatever the path, so the container test cannot
tell the two apart. From the HOST, which arrives from the gateway and passes `@outside`, both
`/webhooks/github` and `/v1/me` answered `502` with nothing listening, which also tells nothing. **With a
throwaway listener on 7104 for two requests:** `POST /webhooks/github` → **501 from the 7104 listener,
which logged it**, and `GET /v1/me` → **502** (7100 down). So through the edge, `/webhooks/*` reaches the
CONSOLE's catch-all (`Caddyfile`'s `reverse_proxy host.docker.internal:7104`) and **never the control
plane**. Decision 8 holds.

## `[M8]` — HMAC, the vector and the crash. **HOLDS EXACTLY.**

`sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17`, which is GitHub's documented
value. `timingSafeEqual(Buffer.from(h ?? ''), want)` **throws `ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH`** for an
absent, an empty and a short header. The codebase's equal-length guard (`tokens/token.ts:83`,
`identity/session.ts:119`, `runtime/docker/registry-auth.ts:117`) refuses all three without throwing, and
accepts the right digest. It refuses a digest one byte off. *(The probe's first "right digest" line was
not a control: a `||` fallback made it true whatever the guard said. Fixed and re-run; both runs are in
the results.)*

## `[M9]` — a raw-body parser scoped to one plugin. **HOLDS EXACTLY.**

`/v1/x` → `{"isBuf":false}`, `/webhooks/github` → `{"isBuf":true}`; at 2 MiB `/v1/x` **413** and the
webhook **200**; at 6 MiB the webhook **413** (its own 5 MiB limit). With no content type, and with
`application/x-www-form-urlencoded`, the webhook answers **415** in Fastify's own body — a bare test app
has no error handler. **A GitHub App's webhook must be configured to send `application/json`**, and a
form-encoded delivery is refused before HMAC runs. `app.version` read **5.12.2** here: F1's source.

## `[M10]` — GitHub's own description (network). **HOLDS EXACTLY.**

`api.github.com.json`: **12,964,527 bytes** (the same size the writer read), sha256
`bbe036143857ba2dd734a93f5beca2417dcd2b4f737729e6cff7bd52ee836f1a`, OpenAPI 3.0.3, `info.version`
**1.1.4**. [`extract-schemas.mjs`](extract-schemas.mjs) (the plan's, verbatim) pulled **31 component
schemas** into [`github-schemas.json`](github-schemas.json) (167,542 bytes as written, indented). Facts:
`POST /user/repos` `enabledForGitHubApps: false`, `POST /orgs/{org}/repos` **true**. The
protection sentence is as *Read this first* 8 quotes it. **The `ghs_APPID_JWT` stateless-format note is
present, word for word.** Required fields: `full-repository` **75**, `installation` **17**, `integration`
**11**, `installation-token` **2**, `webhook-push` **12**, `webhook-repository-publicized` **3**.

## `[M11]` — can Ajv hold the fake to those schemas? **HALF HOLDS: `nullable` works, and two schemas do not compile (F4).**

Ajv **8.20.0** honours OpenAPI 3.0's `nullable` beside a `type`: `{type:'string', nullable:true}` accepts
`null` and `"x"` and refuses `1`. **But compiling the ten roots from the extracted file, 2 of 10 THROW:
`GET /orgs/{org}/installation 200` and `webhook push` — *"nullable" cannot be used without "type"*.**
`probes/nullable-sites.mjs` finds exactly two nodes where GitHub writes `nullable: true` beside
`anyOf`/`oneOf` with no `type`: **`installation.properties.account`** and
**`webhook-push.properties.repository.properties.pushed_at`**. Task 4 validates `installation` and Task 9
validates push payloads, so Task 4's `expectGitHubShape` would have thrown at compile on its own first
use of either. **And without `ajv-formats` Ajv emitted 838 *unknown format* warnings** (`uri` 652,
`date-time` 80, `int64` 48, `uri-template` 48, `email` 10) and enforced none of them.

**The correction, measured** (`probes/normalise.mjs`): rewrite each such node at LOAD, dropping `nullable`
and appending `{ "type": "null" }` to its list, and throw on a node that has neither list. Then add
`ajv-formats`. Result: **2 nodes rewritten, 10 of 10 roots compile, 0 format warnings**,
`installation.account` accepts `null` and refuses `42`, `pushed_at` accepts `null`, an integer and a
date-time and refuses `"yesterday"`, and a `uri` field refuses `"not a uri"`. **Corrected in Task 4.** The
committed `github-schemas.json` stays verbatim.

## `[M12]` — the resolve hook in `node:22-alpine`. **HOLDS EXACTLY.**

`node:22-alpine` = `sha256:1ef15d33…604a` (what `infra/images.lock` pins). Without the hook:
`ERR_MODULE_NOT_FOUND … '/app/src/b.js'`. With `--import ./resolve-ts.mjs` (the plan's hook, verbatim, in
`probes/`), the greeting prints under `--network none` on **v22.23.2**, and on the host on **v24.12.0**.
**Negative control:** an `enum` in the imported file → **`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX: TypeScript
enum is not supported in strip-only mode`**, so `erasableSyntaxOnly` is required, as the plan says.

## `[M13]` — a profiled service under `build`, `up` and `down`. **HOLDS, and the `down` half is a finding (F5).**

`probes/profiles.sh` gives both services a trivial build context. With `image:` alone, `compose build`
has nothing to build for EITHER service, and the measurement would read as "skipped" for the wrong
reason. `compose build --dry-run` built **`always` only**, and `--profile github build --dry-run` built
**both**. So `seed.sh` must name the profile.

**F5 — A BARE `compose down` EXITS 0 AND LEAVES THE PROFILED SERVICE RUNNING.** After `--profile github up
-d`, a bare `docker compose down` stopped and removed `always`, reported the shared network *"Resource is
still in use"*, and **exited 0**. `opt` kept running and the network stayed. `--profile github down` then
removed both. *(The first run read `tail`'s exit status through a pipe; the re-run reads compose's own,
and it is 0.)* **So Task 5's conditional resolves YES, and it reaches `make reset` too**: `reset`'s own
`$(COMPOSE) down` (`Makefile:70`) is followed by `docker volume rm -f … 2>/dev/null || true`, which
against a still-running fake fails just as silently. **Corrected in Task 5.** Cleanup verified: 0
containers, 0 networks, 0 images of the probe project left.

## `[M14]` — git's own protections, and the mirror's non-forced fetch. **HOLDS EXACTLY — AND IS THE SOURCE OF F6.**

`probes/mirror.sh`: the mirror HELD `c2` before the rewrite (the writer's first probe did not). A
non-forced `refs/heads/*:refs/heads/*` fetch after upstream's rewrite: **`! [rejected] main -> main
(non-fast-forward)`, exit 1, mirror `main` unchanged**. The positive control is the same fetch with `+`,
which moves it. `receive.denyNonFastForwards` → *"denying non-fast-forward refs/heads/main"*;
`receive.denyDeletes` → *"denying ref deletion"*; a fast-forward push to the protected upstream still
lands. A `pre-receive` exiting 1 refused a push to the mirror (*"pre-receive hook declined"*, with the
hook's message), and a fetch of a NEW ref into the same mirror landed.

### F6 — ONE REWRITE FREEZES THE MIRROR'S `main`, AND EVERYTHING DOWNSTREAM OF IT

The plan measured what git does to ONE fetch after a rewrite. It never measured the NEXT fetch.
`probes/mirror-after-rewrite.sh` did *(its first run measured nothing: the amend put `-c` after `commit`,
failed, and no rewrite happened. Both runs are in the results)*:

```
sync 2 (after the rewrite to X):          ! <c1> <X>  refs/heads/main    exit=1
sync 3 (a NORMAL push Y on top of X):     ! <c1> <Y>  refs/heads/main    exit=1
   Y present in the mirror's object store: YES     Y reachable from any mirror ref: NO
```

**A perfectly ordinary push after a rewrite is reported as another rewrite, and never as an update**, on
every sync, for ever. Read against the plan as written:

- **Task 9** publishes `repository.history_rewritten` on every push after the first rewrite, and never
  `repository.pushed`. Its *"a push whose `refs/heads/main` moved"* never fires, so `manifest.yaml` is
  never validated again.
- **Task 11** scans `updated.map(u => u.to)`, so **no commit pushed to `main` after a rewrite is ever
  scanned for secrets**. On a free organisation, where a private repository's `main` cannot be protected
  (`[M10]`), one force-push switches push-time scanning off for `main` for good.
- **Task 7**'s `headCommit` is `rev-parse refs/heads/<ref>` in the mirror. It **answers the frozen
  `main` as current for ever**, which is exactly the stale head Decision 18 forbids (*"would validate and
  build the wrong commit"*). `listBranches` is stale the same way. `commitFiles` clones the frozen `main`,
  commits on it, and is refused non-fast-forward by GitHub: **`SOURCE_CONFLICT` for ever**, however often
  the caller retries.
- `localGitDir(Y)` finds Y in the object store (a rejected ref update still downloads the pack) and would
  hand out a commit nothing scanned, with no ref holding it against `gc` until Task 9 pins it.

**The fix, measured** (`probes/mirror-shadow.sh`): one fetch, two refspecs. `refs/heads/*:refs/heads/*`
stays non-forced and keeps history (Decision 1). `+refs/heads/*:refs/manifest/upstream/*` is forced, so it
always holds what GitHub has now:

```
sync 1 (first push c1):   * …        refs/heads/main          * …  refs/manifest/upstream/main   exit=0
sync 2 (rewritten to X):  ! c1 → X   refs/heads/main          + c1 → X  refs/manifest/upstream/main   exit=1
sync 3 (normal push Y):   ! c1 → Y   refs/heads/main            X → Y  refs/manifest/upstream/main   exit=1
sync 4 (nothing new):     ! c1 → Y   refs/heads/main                                            exit=1
```

The shadow says `+` **once**, for the rewrite, then a plain fast-forward for Y, and nothing on a quiet
sync. **Corrected in Tasks 7, 9 and 11**: reads of "GitHub now" (`headCommit`, `listBranches`,
`commitFiles`' base) use the shadow; the porcelain is parsed from the shadow's lines; a `+` update is
reported once AND its new commits scanned; `refs/heads/*` is only the history keeper, beside Task 9's
`refs/manifest/kept/<sha>`. Each task gains one case that is red against the plan as first written. **No
sitting boundary moves.**

## `[M15]` — F9 on the real model, before and after Task 13's prompt. **F9 REPRODUCES; TASK 13'S CHECK CROSSES ITS OWN LINE (F7). RICH'S.**

`probes/f9.mjs` sends ten requests per prompt through LiteLLM (`default-chat-onprem` →
`ministral-3:latest`, warmed first, Ollama 0.34.4). It reads every input from the source: `summary.ts`'s
`SYSTEM_PROMPT`, `diff.ts`'s two notes in `SENSITIVE_FIELDS` order, `NullReviewer`'s reason (which
`describeVerdict` returns verbatim) and `COVERAGE_LIMIT`. The two change lines are `describeDiff`'s
wording for leg A: `sn` removed, one egress host added. It ran **twice**, so each prompt has twenty
answers. `probes/f9-triggers.mjs` names what trips Task 13's `checkSummary` in each answer.

| | current prompt | Task 13's prompt |
|---|---|---|
| states "the verdict" | **20 of 20** (as instructed) | 0 of 20 |
| attributes a verdict to the coverage sentence or an administrator | **6 of 20** — *"The administrator's verdict was: An administrator sees a first launch…"* | **0 of 20** |
| backticks / asterisks | 20 / 1 | 11 / 0 |
| **withheld by `checkSummary` as Task 13 writes it** | 20 of 20 | **14 of 20 — 7 of 10, twice** |
| … of which actually state or suggest a decision | 20 | **0** — 11 backticks alone, 3 *"previously blocked"* describing egress |
| withheld without the backtick rule and without "blocked" | 20 of 20 (each says "verdict") | **0 of 20** |

**F9 is real and the plan's mechanism is right**: under the current prompt the invention follows the
instruction to state a verdict, 3 in 10 twice. The plan measured 3 in 10 as well. Its *"4 of 10 contained
Markdown"* is now backticks in 20 of 20. **And Task 13's prompt fixes it**: no verdict in twenty.
**But Task 13's check, as written, would withhold 7 summaries in 10 for reasons that are not decisions.**
The plan's own rule sends that to Rich in sitting 7 before building. **Rich decided it the same day, choosing
a fourth option: STRUCTURED OUTPUT** — see the addendum below.

### `[M15]` addendum — the summary as structured output, on `qwen3.5:4b` (2026-09-24, after the sitting)

Rich switched the chat model to **`qwen3.5:4b`** and asked for structured output where it makes sense. Two
measurements, both in the results file under *[M15] ADDENDUM*:

- **Thinking must be OFF.** `qwen3.5:4b` is the thinking model S3 rejected (Evidence 9). With only the mapping
  switched, `default-chat` streamed **260 frames, 258 reasoning, 0 content** — the negative control. With
  `reasoning_effort: none` on each chat mapping (LiteLLM 1.98.0's adapter maps anything but `low`/`medium`/`high`
  to Ollama's `think: false`): **7 frames, 5 content, 0 reasoning**, on both logical names.
- **A schema reaches the model, and shapes the answer.** `probes/structured.mjs` hands the model leg A's facts as
  JSON and asks, through `response_format: json_schema`, for `{ changes: [{ path, exposure }] }` with `path` an enum
  of the diff's paths: **10 of 10 parsed and matched, 0 decision words, 0 backticks or asterisks, ~3.3 s each.** One
  sentence paraphrased `sn` as *"the full name attribute"* — an accuracy residual, not a decision.
  `probes/structured-control.mjs`: a field renamed **in the schema only** was used 3 of 3 times, so LiteLLM
  forwards it and Ollama enforces it; with no `response_format` the model invented its own keys and fenced them in
  Markdown 1 time in 3.

**Task 13 is rewritten for it** (the plan's Decisions 19 and 22).

**Then the pin was made request-proof, and reasoning names were added** (Rich, the same afternoon). A request's own
`reasoning_effort` overrode `reasoning_effort: none` (`"low"`: 0 content in 233). The default names now pin Ollama's
`think: false`, which LiteLLM applies after mapping a request's `reasoning_effort`: `"high"` and `"low"` both answer, 5
content frames and 0 reasoning (`probes/think-pin.sh`); a request sending Ollama's own `think: true` is the measured
residual. `default-chat-reasoning` and `default-chat-onprem-reasoning` think (`probes/reasoning-variant.sh`: 300 tokens →
empty; no limit → the answer after 17–129 s). The controls for the two new Docker tests are in the results file.

## `[M16]` — the seam's callers. **HOLDS EXACTLY.**

`api/routes/builds.ts:107` and `releases/approval.ts:571` read `.path`; `api/routes/project-reads.ts:362`
and `api/routes/projects.ts:195` read through `headCommit`/`readFile`. `api/testing.ts:185,288` also call
`repositoryFor`, but only to hand the reference to `commitFiles`, so they survive `path`'s removal.
**No reader of `RepoRef.url`**: every `.url` near `repo` is `import.meta.url`.

## `[M17]` — the contract. **HOLDS — AND THE PREDICTION WAS WRONG (F8).**

`1.1.0`, **43 operations**, and `x-manifest-unversioned` is written into the document
(`document.ts:223`). **The prediction was Task 8. It is Task 2.** Every route's `errors:` list is printed
into its operation's `default` response (*"An error, in the D23.7 envelope. This operation can answer:
…"*, `document.ts:169`). `SOURCE_*` codes already appear there for `createProject` and `validateSpec`.
Task 2 adds `SOURCE_COMMIT_NOT_FOUND` to `startBuild`'s `errors:`. **So Task 2 moves `openapi.json` and
takes the `1.2.0` bump**, which Task 2's own note already provides for. Its commit step must also stage
`document.ts` and `packages/contract/package.json`. **Corrected in Task 2, Task 8 and Decision 15.**

## `[M18]` — a new workspace package links OFFLINE. **HOLDS EXACTLY.**

A throwaway `packages/m18-probe` with Task 4's exact devDependencies (**`ajv` 8.20.0 and `ajv-formats`
3.0.1**; the plan's probe named `ajv` alone) → `pnpm install --offline`: **exit 0, `downloaded 0`**,
both linked from the store (`ajv-formats@3.0.1_ajv@8.20.0`), and `pnpm-lock.yaml` +9 lines naming the
probe. Restored by deleting the package, copying the lockfile back and a second offline install. The
lockfile's sha256 is identical before and after (`b9745041…f8225`), and `git status` holds nothing of the
step's. **Task 4's link needs no network window.**

## `[M19]` — what only the real App can answer. **UNMEASURED, BY DESIGN.**

No earlier measurement can answer these, and Task 6's real leg can, at Rich's yes. Each is a line in
`golden.json` whose `source` is `documentation` until the real run replaces it:

- **(a)** Can a token be minted with `repositories: [<name>]` **one second** after that repository was
  created by the same installation? Spec action 3's exception rests on the installation-wide token being
  needed only for the create itself.
- **(b)** What do `PUT …/branches/main/protection` answer on a **free organisation's private** repository —
  status and `message`? (Decision 13 records it as `mainProtected: false` with GitHub's own words.)
- **(c)** What does git print when a **`contents: read`** token pushes? (Task 7 maps it; the fake must
  print the same.)
- **(d)** What does `GET /repos/{owner}/{repo}` answer for a repository **the token was not scoped to** —
  `404` or `403`?
- **(e)** Does GitHub mint the **stateless `ghs_APPID_JWT`** format for this App, or the classic 40
  characters? Both must be caught by Task 11's patterns either way.
- **(f)** *(added by this sitting, from F6)* after the conformance run's own rewrite of a scratch branch,
  does the real `git fetch --porcelain` print the shadow's `+` exactly as host git does against a bare
  repository? A single `git fetch` against GitHub settles it.

---

## Negative controls, and which of them could not fail

| Measurement | The control | Result |
|---|---|---|
| `[M4]` | a clone with NO header | refused, exit 128 — the header is what authenticates |
| `[M4]` | *(missing on the first run)* the clone's content, not its exit code | **the first run's clone exited 0 with nothing in it (F2)** |
| `[M5]` | form C must authenticate against a server that accepts ONLY the canary | pushed; and a wrong token was refused — so *no leak* is not *never sent* |
| `[M6]` | the classic token must be caught before *stateless: none* is believed | caught by *a GitHub token* |
| `[M7]` | *(added)* a throwaway listener on 7104 to see where `/webhooks/*` goes | the plan's container test **could not fail**: every container is refused by `@outside` before the path is read |
| `[M8]` | the guard accepts the right digest and refuses one byte off | true / false — *the first version of this line could not fail (a `\|\|` fallback)* |
| `[M12]` | an `enum` must not run | `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` |
| `[M13]` | *(added)* each service has a build context | without one, `build` skips BOTH and the profile measurement reads as a pass |
| `[M14]` | the forced fetch DOES move the mirror; a fast-forward to the protected upstream DOES land | both — so the refusals are the rules, not a broken repository |
| `[M14]` F6 | *(the rewrite actually happened)* `merge-base --is-ancestor` says X does not descend from c1 | the first run of the addendum **measured nothing** — the amend failed |
| `[M11]` | an installation token without `token` must fail the schema | refused (`{expires_at}` alone: false) |
| `[M11]` | formats live after `ajv-formats` | `"not a uri"` refused |

**Six of this sitting's own probes measured the wrong thing on their first run** — `[M4]`'s `HEAD`,
`[M8]`'s `||`, `[M13]`'s piped exit status, `[M14]`'s failed amend, `[M15]`'s regex matching an interface's
`reason: string`, and `[M11]`'s ESM import resolved from the probe's own directory. Every one was caught
by reading the raw output rather than the summary line, and every first run is kept in the results.

## What moved

**No sitting boundary.** The corrections add a case, a refspec or a rule inside the task that owns them:

| Finding | Task(s) | Correction |
|---|---|---|
| F1 Fastify is 5.12.3 | header | the Tech Stack line |
| F2 bare `HEAD` → `master` | 4 | `git init --bare -b main`; assert the clone's content |
| F3 trace variables | 7 | force `GIT_TRACE_REDACT=1` after the spread; one `git.test.ts` case |
| F4 two schemas do not compile | 4 | normalise `nullable` at load; `ajv-formats`; one case |
| F5 bare `down` exits 0 | 5 | `make down` AND `make reset` name the profile; assert, don't trust the exit code |
| F6 one rewrite freezes `main` | 7, 9, 11 | the forced shadow refspec; reads and porcelain from it; one red-first case each |
| F7 the check withholds 7 in 10 | 13 | **Rich chose structured output the same day**; Task 13 rewritten, Decisions 19 and 22 |
| F8 the contract moves in Task 2 | 2, 8, Decision 15 | the `1.2.0` bump in Task 2; two more paths in its commit |

The heaviest addition is F6's to Task 7, in sitting 4, and it is a second refspec plus reads from a
different ref. Sitting 2 gains the contract bump, which is one `contract:write` and two version strings.

## Everything that was temporarily changed, and the proof it was restored

- `packages/control-plane/m9-probe.mjs`, `packages/mock/m11-probe.mjs`, `packages/mock/m11b-probe.mjs`:
  each copied in, run, and deleted in the same command. `git status` afterwards showed only this directory.
- `packages/m18-probe/` and `pnpm-lock.yaml`: restored by copy, with the lockfile's sha256 identical and a
  second `pnpm install --offline`.
- Throwaway listeners on `127.0.0.1:7195`, `7196` (never listened), `7197` and **`7104` for two
  requests**: each killed by its script, and `lsof` read `7104 free again`.
- The compose project `m13probe` (two containers, a network, two images): `down -v --remove-orphans` and
  `image rm`, then counted 0 / 0 / 0.
- Throwaway `curlimages/curl:8.11.1`, `alpine:3.22` and `node:22-alpine` containers: all `--rm`.
- Scratch git repositories under the session's scratchpad and `$TMPDIR` (`m5-*`, `m5c-*`).
- `ministral-3` was loaded by the warm-up with `keep_alive: 20m`, and Ollama unloads it on its own.

## The machine, at close — queried, not recalled

See the plan's *What executing this plan found*, sitting 1, which records the close's gate run, the
snapshot diff and the cleanup scripts' output after they ran.
