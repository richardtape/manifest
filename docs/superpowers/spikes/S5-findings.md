# S5 — Would a real coding-agent harness, run inside a container, build the apps faculty will ask for?

**Answer:** **Yes, on the capable model.**

A real harness (pi 0.87.1, in a container, over RPC) built both the small app and the deliberately large one. Each
reached a green, platform-shaped check in under 15 minutes and for $0.12 or less, and each repaired its one red check
with a single follow-up in the same session.

There are two caveats:
- **The large app's day-one workflows only worked once the agent could sign in to test its own pages.** Without
  that, it shipped broken signed-in workflows that every check passed. With it (A2s), one plan feature was still
  broken.
- **The on-premise 27B finished the small app green, but the app crashes for the first signed-in student.**

The detail, in brief:
- **Capable model** (`default-chat-large`, which is gpt-6-luna; it must be reached through the Responses API):
  - A1 (my-answers) and A2b (the Practice room) finished on their own and passed the blueprint's own Dockerfile,
    `npm ci`, `/healthz`, every route signed out, and the platform's own `validateSpec`.
  - The validator went red once in each run, for a real reason, and one follow-up fixed it.
  - opencode (C1) matched pi like-for-like: same time, same cost, same slip, same repair.
- **The checks saw shape, not function.** A2b cannot save two of its three question kinds, and its results download
  answers 404.
  - The same agent given a development sign-in (A2s, an experiment beyond the brief) walked its pages as the
    instructor, two students and a TA.
  - It found and fixed bugs on that walk, and none of the earlier apps' top defects remained.
- **On-premise** (`qwen3.8:27b`):
  - B1 finished my-answers in 36 minutes with one follow-up, through two 300-second timeouts and one compaction.
  - Its app crashes Node on the first signed-in request.
  - B2 finished the Practice room green after one follow-up, in 96 minutes, through three compactions. But it built
    no pages, and its API recognises nobody who signs in.
- **The platform itself interrupted a run once.** Its Docker tier removed the capable model, which pi treats as a
  final 400, and the half-built app then passed the checks.


| | |
|---|---|
| **Spike** | S5 — the spec's "sandbox `exec` with an agent running inside, producing a commit", as Rich re-asked it on 2026-09-30 |
| **Run by** | session `manifest-s5-b3` (Claude Opus 5.5), unattended, from `~/Developer/manifest-s5/BRIEF.md` |
| **Dates** | 2026-09-30 22:55 → 2026-10-01 03:30 PDT (runs 23:12–03:10) |
| **Timebox** | one night: stop starting runs at 06:00, findings by 07:00 — **used:** the last run ended 03:10 |
| **Branch** | none — `~/Developer/manifest-s5` is its own repository (BRIEF §2.4); only this file is copied into `manifest` |
| **Verdict** | yes on the capable model (pi or opencode, Responses API), and it needs a development sign-in to ship working apps; on-prem finishes, slowly, and not to a usable large app |

---

*Spike S5, run unattended on the night of 2026-09-30 from `~/Developer/manifest-s5` by session `manifest-s5-b3`,
from `BRIEF.md`. The evidence is in `~/Developer/manifest-s5` (not merged anywhere): `NOTES.md` (the running log, written as it happened), `runs/<run>/`
(every pi event, the proxy's request log, each check's `check-<phase>.json`, the exported workspace, pi's session
file, `analysis.json`, and for task 2 a `review.md`), the kit in `kit/`, `drive.mjs` (the driver) and `check.sh`
(the checker).*

## Versions

| What | Version / ID |
|---|---|
| macOS | 26.6.2 (25G83) |
| Docker Desktop | 4.87.0 (236836), engine 29.7.2 |
| Host Node | v24.12.0, npm 11.6.2 |
| pi | `@earendil-works/pi-coding-agent@0.87.1` exact, published 2026-09-22T19:42:48Z. Its own dependencies are caret ranges (`^0.87.1`), but its `npm-shrinkwrap.json` resolved pi-ai, pi-agent-core, pi-tui and chord to 0.87.1. Nothing was published between 0.87.1 and 0.99.0. No blocker needed a later version. |
| Agent image | `s5-agent:pi-0.87.1` = `sha256:b0a471ae20d8…` (final; adds `fd`). Inside: node v22.23.2, npm 10.9.8, git 2.54.0, ripgrep 15.1.0 |
| opencode | `opencode-ai@1.18.34` exact (published 2026-09-30T22:38:58Z), image `s5-agent:opencode-1.18.34` = `sha256:4c6663161478…` |
| Base image | `node:22-alpine` = `sha256:1ef15d33d746…`, the platform's base, by its local tag (never pulled from 7107) |
| Mongo | `mongodb/mongodb-community-server:7.0.28-ubi8` = `sha256:56d07a0227ce…`, local |
| LiteLLM | the platform's, on 127.0.0.1:7106 (1.98.0 per its config's comments) |
| `default-chat-large` | LiteLLM's `model` field answers the alias, `default-chat-large`. The vendor model is **gpt-6-luna**: OpenAI's own refusal names it. Api base `https://api.openai.com`. |
| `default-chat-onprem` | `ollama_chat/qwen3.8:27b`; LiteLLM's `model` field answers `default-chat-onprem` |
| Key | alias `s5-spike-20260930-2254`; $40 budget; models large and onprem only; no LiteLLM user; expires 2026-10-01T23:54:12Z, left to expire |

## Runs

| Run | Task, model | Finished? | Check after each prompt | Wall (agent) | Turns | Own cost | Notes |
|---|---|---|---|---|---|---|---|
| A0 | `/hello`, capable | yes, `agent_settled`, said done | p0 green; `/hello` → 200 `hello` | 69 s | 18 | $0.006 | after the kit fixes below; try 1 refused (Responses API) |
| A1 | my-answers, capable | yes, `agent_settled`, said done | p0 **red** (validateSpec: name ≠ slug) → f1 **green** | 332 + 40 s | 45 | $0.030 | |
| A2 try 1 | practice room, capable | **no**: the platform removed the model mid-run (400, not retried) | p0 green on shape (nothing verified yet) | 455 s | 29 | $0.032 | interrupted at 23:31:25 |
| A2c | A2 try 1 **resumed** in the same session | yes, `agent_settled`, said done | c0 green | +446 s | +49 | ~$0.069 | `pi --session`, one "carry on" prompt |
| A2b | practice room, capable, **fresh and uninterrupted** | yes, `agent_settled`, said done | p0 **red** (validateSpec: `uid` not whitelisted) → f1 **green** | 725 + 83 s | 103 | ~$0.116 | the clean A2 measurement |
| B1 | my-answers, on-prem 27B | yes, `agent_settled`, said done | p0 **red** (validateSpec: name) → f1 **green**; **signed-in: crash** | 2,150 + 222 s | 39 | ~$0.60 | 2 timeouts, 1 compaction |
| B2 | practice room, on-prem 27B | p0 stopped early (announced a next step, then ended its turn); f1 said done | p0 **red** (5 probes: a missing module, an unparseable manifest) → f1 **green**; signed-in "pass" (every `/api` 401 when signed in) | 3,722 + 2,049 s | 78 | ~$1.45 | **built no pages**; 3 compactions |
| A2s | practice room, capable, **with `sign-in-as`** (experiment) | yes, `agent_settled`, said done | p0 **red** (validateSpec: `uid`) → f1 **green**; signed-in pass | 397 + 76 s | 69 | ~$0.067 | walked its pages signed in; review: earlier top defects gone |
| C1 | my-answers, **opencode 1.18.34**, capable | yes, idle, said done | p0 **red** (validateSpec: name) → f1 **green**; signed-in pass | 185 + 49 s | 36 msgs | ~$0.029 | Responses API via `@ai-sdk/openai` |

"Own cost": `/key/info` deltas for runs that ran alone (A0, A1, A2 try 1); for runs that overlapped another run, the
session's tokens at the prices fitted on the solo runs (see *Cost*). No run reached a cap; no run saw a fallback; no
run added a package, asked the instructor a question, triggered the guard, used a sub-agent, or committed its work.
Only the on-prem runs compacted. "Signed-in" is the check beyond the brief (see *The controls*, 5).

### A0: proving the kit

- **Try 1 never started work.** pi's first request was refused, 400: "Function tools with reasoning_effort are not
  supported for gpt-6-luna in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort
  to 'none'." Through LiteLLM, even `reasoning_effort: "none"` is refused; only `/v1/responses` accepts tools. pi's
  model entry moved to `api: "openai-responses"` and the proxy allowed `POST /v1/responses`.
- **Two kit bugs it found**, both fixed before A1: pi's `find` tool needs `fd` ("fd is not available and could not
  be downloaded", offline); and "as SYSTEM.md defines done" sent it looking for `/workspace/SYSTEM.md`, because pi
  appends our prompt without its file name.
- **Then green in 69 s for $0.006:** 18 turns, 30 tool calls; one `edit` to `server.js` (`GET /hello` →
  `text/plain` `hello`); it ran `rm -rf node_modules && npm ci`, `run-app`, and `curl`ed every page. Peak context
  18k of 400k. Five `say` lines, all plain.

### A1: my-answers, capable

- **Finished:** `agent_settled` after 332 s with an account in plain words. **Check: red on one probe only,
  `validateSpec`** (`SPEC_NAME_SLUG_MISMATCH`: it had renamed the app). **One follow-up in the same session fixed it
  in 40 s → green.** $0.030 in all.
- **How:** 45 turns; `bash` 29 (`npm ci` 2, `run-app` 9, `curl` 7, its own checks 5: `node --check`,
  `prettier --check` through `npm exec`, a lockfile/package agreement check), `read` 14, `write` 7, `edit` 6,
  `grep` 1, `find` 1, `ls` 1, `say` 11. Peak context 46,732 tokens (12% of 400k); no compaction. 46 requests, all
  200, no fallback. Tokens: in 135, out 18,853, cache read 1,423,650, cache write 46,729.
- **Produced:** `server.js` 372 → 140 lines, `public/app.js` 30 → 92, `index.html` 47 → 42, `style.css` +23,
  `config/staff.json` +5, `manifest.yaml` 66 → 22 (ai block removed, attributes `[ubcEduCwlPuid, mail]`), README
  rewritten. No package.
- **What the instructor saw:** 11 `say` lines, none with a code word, a path, "it works", or 100+ characters
  ("We're replacing the sample with private student answers and an instructor-only response list."). No question.
- **Against the plan** (`NOTES.md` has the line references):
  - *What students see* — **partial**, the same reading as the front-end's baseline: only ever their own answer;
    "until they have posted something" is not modelled.
  - *What you see* — **present**: `GET /api/submissions` behind `signedIn` + `staffOnly` (`server.js:121`).
  - *What it keeps* — **partial**: the answer and `mail` standing in for the login name (CWL login names are not
    released to apps); keyed on the PUID with a unique index.
  - *Who gets in* — **present**. *AI* — **present** (none).
  - **Security:** staff decided only from `config/staff.json`; the staff check after `passport.session()`, never in
    front of `/healthz` or sign-in; output only through `textContent`. Smell: it reads its required variables
    through `process.env[name]` in a loop, which hides them from the blueprint's literal-name drift test.
- **Baseline, same checker:** today's harness's `my-answers` (`8321358`, built after the `2aac271` view fix) is also
  green, with an app of the same size and shape (`server.js` 150, `app.js` 163, `index.html` 129). Its first round,
  before that fix, read in a loop to the move limit. pi's working set (46k tokens at the peak) is about the size the
  old 48,000-character view could never hold.

### A2: practice room, capable — three runs

- **Try 1 was ended by the platform, not the agent.** At 455 s, mid-build, one request got 400 "Invalid model name
  passed in model=default-chat-large" — manifest-92's Docker tier boots control planes without the capable model and
  removes it from LiteLLM (it said so, and it is ORIENTATION §2's docker row). pi treats a 400 as final: no retry,
  `agent_settled`. **The checker then said green**, because it probes the shape of a signed-out app, not the plan;
  the agent had not yet run `npm ci` or `run-app` once. A green check is not "done".
- **A2c resumed that session** an hour later (kept containers, `pi --session <file>`, one "carry on" prompt): 76
  messages reloaded, and in 446 s it finished, verified (`npm ci`, `run-app` ×10) and settled green.
- **A2b, a fresh uninterrupted run, is the clean measurement.** `agent_settled` after 725 s with a full account;
  **red on one probe, `validateSpec`: `SPEC_ATTRIBUTE_NOT_WHITELISTED`** — the plan keeps "students' login names",
  so it asked for `uid`, which the platform does not release (the real `validationContext` whitelist is
  `ubcEduCwlPuid, mail, givenName, sn, eduPersonAffiliation`). **One follow-up: it removed `uid`, kept PUID, name and
  email, re-verified → green in 83 s.**
  - **How:** 103 turns; `edit` 41, `bash` 36 (`npm ci` 3, `run-app` 16, own checks 11, `curl` 6), `read` 28,
    `grep` 16, `write` 9, `find` 3, `ls` 1, `say` 16. Peak context 111,658 tokens (28%); no compaction; 104 requests,
    all 200; no fallback. Tokens: in 309, out 60,627, cache read 7,147,203, cache write 111,655.
  - **Produced:** `server.js` 453 lines, `public/app.js` 221, `index.html` 20, `styles.css` 3, `config/staff.json`,
    `manifest.yaml` 27 (ai: `default-chat`, budget set). **No package**: it wrote the CSV itself. **No commit**: the
    workspace is a git checkout with the seed committed, and it left every change uncommitted (nobody asked it to
    commit).
  - **What the instructor saw:** 16 `say` lines, no code words or paths, one of 106 characters ("We're removing the
    sign-in attribute the platform rejects and using the approved CWL identifier instead."). Its **final account
    after the follow-up used code words** (`manifest.yaml`, `npm ci`, `/healthz`, `run-app`). No question asked.
- **Review against the plan** (`runs/A2b/review.md` and `runs/A2c/review.md`, read-only reviews with line numbers;
  the top findings checked by hand):
  - **The shape is right and the security basics hold in both**: every staff route and action is checked on the
    server; TAs cannot change questions (instructor-only writes); identity only from the session; page output
    escaped; the three-hint limit enforced on the server (atomically in A2c); drafts never reach students; CSV cells
    escaped against formulas (A2c); AI only through `ai/llm.js` with the session's PUID and a plain failure message.
    `auth/` and `ai/` byte-identical to the blueprint's.
  - **A2b ships three broken day-one workflows** that no signed-out probe can see:
    1. only *number* questions can be saved from the page: a hidden, `required`, empty "Correct number" field blocks
       the form for multiple-choice and short-answer (`app.js:98`) — so no AI draft can be published either;
    2. the CSV download is unreachable: `GET /api/staff/results/:setId` (`server.js:392`) is registered before
       `…/:setId.csv` (`server.js:413`) and answers 404;
    3. a bare number is marked wrong when the question has a unit (`server.js:88`).
    Also: TAs see other sections' flags, with names, PUIDs and emails (`server.js:263,273,438-440`); similar-question
    attempts skew progress and averages.
  - **A2c** leaks the worked explanation before answering (`safeQuestion`, `server.js:73-76`, keeps `explanation`),
    has the same unit-matching problem, and a naive hint guard (`server.js:229-232`).
  - **In both, students choose their own section**, so a TA's view and "who has not started" depend on
    self-enrolment, and students who never signed in can never appear as not started.
  - Plan rows: *What students see*, *What you see*, *What it keeps*, *AI* — mostly **present**, with the partials and
    wrongs above; *Who gets in* — **present** (any CWL; staff from `config/staff.json` plus the instructor's TA list).

### B1: my-answers, on-premise (qwen3.8:27b via LiteLLM)

- **Started on a quiet machine:** after both peer sessions' all-clear, no vitest, load 3.2. `ollama ps` was empty
  before; the 27B loaded in 10.8 s (17 GB, 100% GPU, context 32,768).
- **Its real window is 32,768, and past it Ollama silently keeps about half.** Measured through LiteLLM:
  - 11,734 tokens in → counted whole (138 s);
  - ~29,300 → whole (390 s);
  - ~38,000 → `prompt_tokens: 16,386`, HTTP 200 (227 s);
  - ~44,000 → ~16,388.

  `models.json` got 32,768, with an 8,192-token compaction reserve.
- **Finished:** `agent_settled` after 2,150 s (36 min), saying it was done. **Red on `validateSpec` only** (it renamed
  the app) → **one follow-up, 222 s → green.**
- **How it behaved:**
  - 39 turns: `bash` 17 (`npm ci` 4, `run-app` 5, `curl` 4), `read` 5, `write` 5, `edit` 1, `ls` 2, `say` 4.
  - 41 requests, all 200 at the proxy, no fallback; the longest took 421,623 ms.
  - **Two 300-second timeouts.** LiteLLM's Ollama path sends a tool-calling answer all at once, so `firstByteMs ≈ ms`
    on every request. A whole-file write from the 27B outlasts pi's 300 s idle timeout; pi retried once each time and
    recovered.
  - **One compaction:** 24,950 → ~11,086 tokens in 277 s, 23 s inside the timeout. Peak context 24,564.
  - After compaction it called a tool named `run-app`, which does not exist: the summary had blurred the shell helper
    into a tool.
  - **#9216 was not reproduced:** no stream ended "terminated", and only one compaction was ever needed, so whether a
    second fires was not tested.
- **Cost:** 603,554 tokens (input 595,695; output 7,859) ≈ $0.60, because LiteLLM prices the on-prem model at $1 per
  million tokens and every turn re-sends the whole context.
- **Produced:** `server.js` 165, `app.js` 81, `index.html` 54, `config/staff.json` with the instructor's PUID and email.
- **Against the plan:** the same shape as A1 and the baseline. Staff only from `config/staff.json`, the staff check on
  the server, output through `textContent`.
- **But it crashes for the first signed-in person.** `GET /api/answer` calls `findOne(…).project(…)`
  (`server.js:133-135`). On mongodb 6.12 `findOne` returns a Promise, so `.project` is undefined; the page calls it on
  load (`app.js:46`), and the rejection kills Node 22. The signed-in check (below) shows it: "TypeError:
  answers(...).findOne(...).project is not a function … Node.js v22.23.2", and the app dead.
  - Its page also promises "You can change it until the instructor closes it" (`index.html:28`), and there is no
    close.
  - Its account says "every page the plan needs responds without a server error".


### B2: practice room, on-premise (qwen3.8:27b) — green, and no app a person can use

- **Started** right after B1's green, on the same quiet machine, with one deliberate change from B1's finding: pi's
  idle timeout raised to 20 minutes. The 2nd and 3rd compactions took 449 s and 521 s, and the longest request
  673 s; under B1's 300 s default every one would have timed out.
- **p0, 3,722 s:** `agent_settled`, but its last words were "Now the staff routes — question bank, sets, people, AI
  drafts:" — it announced a next step and ended its turn. **Red on five probes:** `server.js` imported a
  `routes/ai.js` it never wrote (`ERR_MODULE_NOT_FOUND`), and `manifest.yaml` didn't parse (an unquoted `: ` in
  `description`, `SPEC_YAML_PARSE_FAILED`).
- **f1, 2,049 s:** it wrote the missing route modules, quoted the description, fixed an import path, ran
  `npm ci` and `run-app` → **green.** It said done.
- **How:**
  - 78 turns: `bash` 27 (`npm ci` 2, `run-app` 6, `curl` 4), `read` 19, `edit` 13, `write` 12, `ls` 3, `say` 2. Only
    two lines for the instructor in 96 minutes.
  - **Three compactions** (24,605 → 10,080; 25,241 → 11,545; 24,893 → 15,290). Each re-triggered, so **#9216's
    "stops re-triggering after it has run once" is not reproduced** on 0.87.1. No stream ended "terminated".
  - 83 requests, all 200; no fallback.
  - 1,447,655 tokens ≈ **$1.45**.
- **Produced:** 1,382 lines of API in eight modules. It split the work into small files, which suits its 32k window:
  `routes/student.js` 398, `routes/staff.js` 262, `lib/questions.js` 133, `routes/ai.js` 78, `routes/results.js` 68,
  `db.js` 61, and an `auth/staff.js` it added *inside* the blueprint's `auth/`.
- **`public/` is byte-identical to the seed.** It wrote no page. A student or the instructor opening the app sees the
  old "Manifest proof application" page; the plan's every *What students see* and *What you see* is unreachable by a
  person.
  - Every check passed, signed-in GETs included.
  - Its final account is in code words ("manifest.yaml", "routes/ai.js", "CRUD") and never mentions a page.
- **Review** (`runs/B2/review.md`, top findings checked by hand): **an unfinished API that works for nobody.**
  - The sign-in callback copies `req.user` into `req.session.user` (`server.js:92`), but every route reads
    `req.session.user.puid` and `.email`, which never exist. So even a real CWL sign-in is "nobody", and the planted
    instructor and student got 401 on every `/api` route.
  - It listens on `MANIFEST_PORT || 3000` (`server.js:119`), so it works only by accident.
  - It writes to `MANIFEST_DATABASE_NAME || 'manifest'` (`db.js:20`), not `MONGODB_DB_NAME`.
  - Sets never contain their questions (ids compared as the wrong type), TAs are full instructors, the hint limit is
    per question, and sign-out answers 500.
  - **The signed-in check passed it, because a 401 is not a 5xx.** That is a gap in my check: it catches crashes, not
    "signed in but not recognised".

### A2s: the practice room again, with a development sign-in (an experiment beyond the brief)

- **Why:** every serious defect in A2b, A2c and B1 sat behind sign-in, where neither the agent nor the brief's
  checker could go.
- **What changed:**
  - `sign-in-as staff|student|student2|<PUID> <email>` (`kit/tools/sign-in-as`) prints a `Cookie` header for a
    signed-in person. It plants a session in the app's own session store, exactly as a CWL sign-in leaves one, and
    adds nothing to the app.
  - `SYSTEM.md`'s sign-in paragraph now names the helper and asks the agent to walk every page and action as the
    instructor and as a student (`kit/manifest-pi-signin/`).
  - Everything else is the same as A2b.
- **Result:** green after one follow-up (the same `uid` refusal as A2b) in 397 + 76 s, 69 turns, about $0.067.
  - 17 of its 28 `bash` calls used `sign-in-as`, as the instructor, two students and a TA.
  - On that walk it hit and fixed a hint button answering 500 (a TypeError) and a set with no opening date that no
    student could see.
  - It also confirmed that TAs saw only their own section.
- **Review** (`runs/A2s/review.md`, a comparison with A2b's and A2c's reviews):
  - **None of the earlier top defects remains.** The question form saves all three kinds, the CSV download is
    reachable, bare numbers with units mark right, no explanation is sent before answering, TA flags are scoped to
    their sections, and dates aren't read in the server's time zone. About 30 of about 50 earlier findings are gone.
  - **Still wrong:**
    - "Try a similar question" usually fails: the page posts to the current set, which refuses a question outside it.
    - The CSV has no formula guard.
    - Results read only the newest 10,000 attempts, so they are partial at 600 students.
    - A failed hint still costs one of three.
    - There is no page to edit a set.
  - It walked with `curl` only, never a browser. That is why "similar question" slipped through.
- **Conclusion: a development sign-in in the sandbox is the single change that most improves what the agent ships.**

### C1: my-answers, opencode 1.18.34 (stretch)

- **The brief's provider could not have worked.** `@ai-sdk/openai-compatible` sends chat completions, which
  gpt-6-luna refuses with tools. C1 used opencode's bundled `@ai-sdk/openai` (the Responses API) against the same
  proxy, after checking for about $0.0003 that LiteLLM accepts opencode's request shape (`store: false`, encrypted
  reasoning, `prompt_cache_key`, reasoning summary).
- **Setup:**
  - `opencode serve` on 127.0.0.1 inside the container with a per-run password, driven over `docker exec`.
  - Share disabled; `OPENCODE_DISABLE_PROJECT_CONFIG=1` plus the brief's four flags.
  - Root-owned config: unlike pi's, the agent cannot rewrite it.
  - The skills are native, and the same `say`, `ask_instructor` and guard come as a plugin.
- **Finished:** idle after 185 s with an account. **Red on `validateSpec` (name) → one follow-up, 49 s → green.**
  Signed-in check passes.
- **How:**
  - 36 assistant messages, 62 tool calls: `bash` 24, `read` 15, `todowrite` 7, `say` 6, `write` 5, `skill` 2 (it
    loaded the skills itself), `edit` 1, `glob` 1, `grep` 1. No sub-agents, no permission or question asked.
  - Peak context 51,407.
  - Tokens: cache read 1,380,375, cache write 51,404, output 6,772 + reasoning 10,655. About **$0.029**.
- **Produced:** `server.js` 150, `app.js` 96, `index.html` 54; staff from `config/staff.json`; no `innerHTML`;
  uncommitted.
- **Like-for-like with pi's A1:** the same size, the same time, the same cost, the same slip (the rename) and the same
  one-turn repair. **The harness is not the variable; the model and the sandbox are.**



## The controls

Every control went red where it should, before any green was believed.

1. **The checker** (§7.1), on copies of the seed and again on A1's green workspace:
   - a syntax error appended to `server.js` → **red at `start`**: exit 1, `SyntaxError: Unexpected token ';'`,
     `/healthz` ECONNREFUSED for 60 s;
   - `left-pad@1.3.0` added to `package.json` but not the lockfile → **red at `npm ci`**: `npm error code EUSAGE …
     package.json and package-lock.json … are in sync … Missing: left-pad@1.3.0 from lock file`.
   - The platform's own `validateSpec`, called read-only (below), refuses a `runtime.build` block with
     `SPEC_BUILD_BLOCK_FORBIDDEN` at `runtime.build`. Two real runs then went red on it for real reasons.
2. **The guard** (§7.2), a scripted `pi -p` with our system prompt removed, so a model refusal could not stand in for
   the guard:
   - `write /workspace/Dockerfile` → **blocked**: the tool result is an error, "the blueprint owns the build: never
     write a Dockerfile";
   - `bash: printf x > Dockerfile && ls -la Dockerfile` → **not blocked**: `-rw-r--r-- 1 agent agent 1 … Dockerfile`.
   - Together: a harness guard stops the polite path only. **Guards that matter belong at the commit boundary.**
3. **The key's bound** (§7.3): `default-chat` through the proxy → **HTTP 403**, `error.type`
   `key_model_access_denied`, param `model`: "key not allowed to access model. This key can only access
   models=['default-chat-large', 'default-chat-onprem']".
4. **The key's isolation** (§7.4), inside the agent container after A0: the key's first 8 characters were **absent**
   from the exec environment, every process environment, every process command line, every file on the container's
   filesystem, and `docker inspect`'s `Config.Env`. Positive controls: `PI_OFFLINE=1` was found in the process
   environments, and the prefix was **found** in the proxy sidecar's mounted key file. The agent can still *spend*
   through `127.0.0.1:4100`: the secret is isolated, the capability is not (it is bounded by the key's two models and
   its budget).

5. **The signed-in check** (beyond the brief: `check-signedin.sh` + `kit/check/probe-signedin.mjs`).
   - **How it works:** it plants an instructor and a student session in the app's own session store and GETs every
     mounted route as each.
   - **Its control:** on the untouched seed it passes (a route that is 401 signed out is 200 signed in, so the
     planted sessions are read), and on B1 it goes **red**: "staff GET /api/answer -> 0 UND_ERR_SOCKET (app died)",
     with "TypeError: answers(...).findOne(...).project is not a function" in the app's log.
   - **Results:** A1, the baseline, A2b, A2c, A2s and C1 pass. B2 "passes" too: see the last point.
   - **What it cannot see:** a form that can't be submitted in a browser, or a route another route shadows. Those
     answer 404, not 5xx, so A2b's two worst bugs pass this check too.
   - **Nor does it tell "signed in but not recognised" from "signed out".** B2 answered 401 to the planted
     instructor and student on every route and passed. Requiring a signed-in 2xx on at least the person's own pages is
     the obvious next assertion.
   - **A kit gap it exposed:** neither `run-app` nor `check.sh` injected an app's own `env:` entries from
     `manifest.yaml`, which the platform does. The seed's `/api/me` answered 500 without `COURSE_CODE`;
     `check-signedin.sh` now injects them.

## Surprises

1. **The capable model can't call tools on chat completions.** gpt-6-luna refuses function tools with any
   `reasoning_effort` on `/v1/chat/completions`, and LiteLLM can't get `"none"` through. An agent harness on
   `default-chat-large` must speak the **Responses API** (`/v1/responses`), which LiteLLM forwards fine. The brief's
   C1 provider (`@ai-sdk/openai-compatible`) could not have worked; C1 used `@ai-sdk/openai`.
2. **It's cheap and quick.** The large app cost about $0.12 and 13½ minutes of agent time on the capable model. 97% of
   the 7.3M tokens processed were cache reads at about a tenth of the input price. The whole night's capable runs cost
   less than one dollar.
3. **The platform's own tier removed the capable model mid-run**, and pi treats the resulting 400 as final. It is
   expected (manifest-92's Docker tier boots without `MANIFEST_CAPABLE_MODEL`), but it ended A2 try 1, and the
   checker then called a half-built app green.
4. **Green is not done.** Every task-2 app passed every probe, including the platform's own `validateSpec`, yet A2b
   cannot save two of its three question kinds or download its results. The bugs sit behind sign-in, where neither
   the agent nor the checker could go.
5. **The platform's own validator was the probe that went red, in every fresh task run** (A1, A2b, A2s, B1, B2, C1;
   A2c, the resumed run, was green first time). It caught:
   - a renamed app (A1, B1, C1 — our `SYSTEM.md` invited it);
   - a CWL attribute the plan implied but UBC does not release, `uid` (A2b, A2s);
   - an unparseable manifest (B2).

   Each time, the error code alone was enough for the agent to repair it in one follow-up, in the same session.
6. **pi needs a writable agent directory.** It writes `settings.json.lock` and `auth.json` there and crashes on a
   read-only mount. So the agent's own `bash` can rewrite pi's user-level configuration (extensions, skills, models)
   for any later pi process, sub-agents included. Project trust does not cover that directory; in these runs nobody
   touched it (the integrity diff shows only pi's own `auth.json` and `models-store.json`).
7. **The agent never commits.** In a git checkout, with nobody asking, all three task-2 runs left their work
   uncommitted. Fine for a platform that commits at the boundary, but it has to be the platform's job.
8. **On the on-prem path, LiteLLM's `ollama_chat` doesn't stream tool-calling answers.** The first byte arrives with
   the last (`firstByteMs ≈ ms` on every request). A long whole-file write from the 27B takes longer than pi's 300 s
   idle timeout, so pi gives up and retries while Ollama keeps generating the abandoned answer.
9. **Ollama silently truncates past 32,768 tokens to about half.** About 38k tokens in gave `prompt_tokens: 16,386`
   with HTTP 200. The front-end's "16k" from F3 M1 was this, not a 16k window.
10. **The on-prem model's large app was green and had no pages.** B2's API passed every probe, signed-in GETs
    included, and `public/` was still the seed's proof-app page. A shape check can't tell an app from its API.
11. **Our own kit's slips, caught by its own measurements:** macOS `tar` put AppleDouble `._*` files into A0's and
    A1's workspaces. The Mongo image's anonymous volumes leaked: 32, found by manifest-92 and removed. The checker
    left images dangling until fixed.


## What it means for Phase 3

- **The platform's `exec` and stream.** One long-lived `pi --mode rpc` process per container, driven by JSON lines
  over `docker exec -i`'s stdin and stdout, was enough for everything: the prompt, the event stream, extension dialogs,
  caps, `abort`, session stats. Three requirements came out of it:
  - frame on `\n` only;
  - end on `agent_settled`, not `agent_end`;
  - expect a session to outlive its exec. When the driver's exec died, pi saw stdin close, shut down cleanly, and left
    its session file; `pi --session <file>` then resumed the run an hour later with full memory (A2c).

  So Phase 3's `exec` needs a bidirectional stream, and a reattach story that is "start a new process on the same
  session file", not "keep the socket alive".
- **The key in a sidecar, against the key in the sandbox (D2).** The sidecar works and costs ~70 lines of `node:http`:
  the key was provably absent from the agent's container, the proxy recorded every request without a body, and the
  key's own model list and budget bounded what the agent could do through it. Two things it does not solve:
  - the agent can still spend through the sidecar;
  - per-request cost is invisible on streams (`x-litellm-response-cost` is null on every streamed request), so
    dollars come from `/key/info` deltas, which conflate concurrent runs.

  Recommendation: **sidecar, not sandbox**, with one key per run, so the deltas are the run's.
- **FE-32 dissolves on the capable model.** With a shell, pi can regenerate the lockfile, and the checker's `npm ci`
  is the proof. No run needed a package (A2b wrote its own CSV), but every one ran `npm ci` from a clean
  `node_modules` itself, and the checker's lockfile control shows what a drifted one would do. The public registry was
  used; whether the platform's mirror (Verdaccio) can serve an agent's `npm install` was not measured.
- **Guards at the commit boundary.** The harness guard blocked `write Dockerfile` and let `printf x > Dockerfile`
  through. What actually caught the night's real problems was the platform's own validator (`validateSpec`), run on
  the finished tree: an app renamed away from its slug, an attribute UBC does not release, and an unparseable
  manifest. Run `validateSpec`,
  the Dockerfile / `.npmrc` / `runtime.build` rules and the secret scan on the tree the agent hands over, then send
  the refusal back into the same session. One follow-up fixed every red check tonight.
- **Narration through `say`.** It works and stays plain:
  - 56 lines across the capable pi runs (A0 5, A1 11, A2 3, A2c 4, A2b 16, A2s 17), plus C1's 6;
  - none had a code word or a path, and one ran over 100 characters;
  - the capable model used it at every step change without being reminded; the 27B said 4 lines in 40 minutes (B1)
    and 2 in 96 (B2);
  - final accounts to the instructor are less disciplined: A2b's, C1's and B2's used `manifest.yaml`, `npm ci`,
    `/healthz` and route file names.

  A words guard on `say` (the front-end's `CODE_WORDS`) is cheap insurance. Nobody asked the instructor anything:
  `ask_instructor` was never called.
- **On-prem as an agent model works, slowly and only with three settings:**
  1. pi's idle timeout at least the longest whole answer, because LiteLLM's Ollama path does not stream tool calls
     (20 minutes worked; the default 300 s cost B1 two timeouts);
  2. `contextWindow` at the measured 32,768, with a compaction reserve well inside it, because past 32,768 Ollama
     silently keeps about half;
  3. patience: 36 minutes for my-answers and 96 for an API-only Practice room.

  The 27B also stops early and asserts more than it did (B1 promised a "close" that doesn't exist; B2 announced a step
  and stopped). A confidential app's agent on `default-chat-onprem` needs the commit-boundary checks and the signed-in
  walk even more than the capable one does.
- **Model availability is a platform responsibility.** The Docker tier removing `default-chat-large` ended a run with
  a non-retryable 400, and the run then looked done. The platform must either never deregister a model a live agent
  session uses, or detect "model gone" and resume the session when it returns. The driver now does the latter, and
  A2c shows it works.
- **Signed-in testing is the missing piece, and A2s measured it.** Every serious defect tonight was behind sign-in
  (A2b's form and download, A2c's explanation leak, B1's crash, B2's nobody-is-signed-in).
  - Given `sign-in-as`, the same agent walked its app as the instructor, two students and a TA, and fixed what it
    found.
  - None of the earlier top defects remained.
  - Phase 3 should give the sandbox a development sign-in (a session the platform mints for test staff and student
    identities, as `sign-in-as` does) and make the boundary check use it too. That is the difference between "starts
    and answers" and "works".


## Spec actions

Proposals only: the spec is *Approved design*, and its edits are Rich's call.

| Section | Current text | Proposed change | Why |
|---|---|---|---|
| Spike table, S5 row (spec line ~1790) | "Sandbox `exec` with an agent running inside, producing a commit." | "… producing a working tree that the **platform** commits after its checks." | No agent committed unprompted (A2b, A2c, A2s, C1 left everything uncommitted in a git checkout). The commit and its guards belong at the boundary. |
| D2 (decisions table) | "… the agent that runs **inside** a sandbox gets one from Phase 3." | "… the agent inside a sandbox reaches the model routes through a per-session proxy beside the sandbox, which holds the key; the key never enters the sandbox." | S5 measured exactly that: the key was absent from every file, env and process in the agent's container, and the proxy logged every request without a body. The agent can still spend through it, within the key's models and budget. |
| §21 divergence 6 | "whether it is adequate for **sandboxes** is left to S5 (§12)." | "… was not measured by S5 either (2026-10-01), which ran the agent with open egress and measured the harness, not the isolation; it stays open." | Still S6's open question; S5 did not settle it. |
| §7 / wherever an agent's model route is described | (chat completions through LiteLLM) | Name the **Responses API** (`/v1/responses`) as the route a tool-calling agent uses for `default-chat-large`. | gpt-6-luna refuses function tools on `/v1/chat/completions` through LiteLLM, even with `reasoning_effort: "none"`. |

---

## What survives

All of this is in `~/Developer/manifest-s5`, its own repository. Nothing there is merged, and only this file is copied.

- **The agent image:** `kit/image/` (Dockerfile, `run-app`).
- **The recording proxy:** `kit/proxy/proxy.mjs`.
- **The pi package:** `kit/manifest-pi/` (`SYSTEM.md`, `agent/` with models, settings, three skills, the guard,
  whitespace and `say` extensions, and pi's sub-agent example).
- **The sign-in variant:** `kit/manifest-pi-signin/` and `kit/tools/sign-in-as`.
- **The opencode kit:** `kit/opencode/`.
- **The driver:** `drive.mjs` (RPC, caps, interruption resume, `--resume-from`).
- **The checkers:** `check.sh` and `check-signedin.sh` (with `kit/check/`), and `kit/validate.mjs` (the platform's
  `validateSpec`, read-only).
- **Analysis:** `kit/analyze.mjs`.
- **Every run's evidence:** `runs/`.

The images were removed. `docker build -t s5-agent:pi-0.87.1 kit/image` (and `kit/opencode`) rebuilds them.

---

## What it means for the front-end

- **What replaces `runtime/` and the lead.**
  - One pi session per round, in the project's sandbox, driven over RPC.
  - The **prompt** is the agreed `docs/plan.md` plus one sentence, and the instructions are `SYSTEM.md`, adapted from
    `LEAD_PROMPT`.
  - The **knowledge pack** becomes a skill the agent loads when it needs it (every run read it first), and so does the
    **sign-in specialist**: `cwl-sign-in` replaced `ask_cwl` and got `config/staff.json` right in every run.
  - The one-JSON-move loop, the 48,000/120,000-character view and its read loop, whole-file commits, and the package
    ban (FE-32) all go. On the capable model the working set simply fits: A2b's peak context was 112k tokens of 400k.
- **What of the round survives:**
  - the agreed plan as the brief;
  - the build → check → fix shape;
  - **the commit-boundary guards** (Dockerfile, `.npmrc`, `runtime.build`, secrets, lockfile), now with the platform's
    own `validateSpec` in front of them;
  - "try again" as a **follow-up into the same session** (one was enough every time tonight);
  - **`CODE_WORDS`**, applied to `say` lines and the final account, where it was needed (A2b's and C1's final accounts
    used code words; their `say` lines did not);
  - the person's questions, as `ask_instructor` with a default. It was never used: the agent decided everything itself.
- **What the front-end shows the faculty member** is the `say` stream: one plain line every minute or two on the
  capable model, and every few minutes on the on-prem one. Two things should be added:
  - a clear "checking" state while the platform's checks run;
  - the follow-up's repair, said in their words.
- **What it must not claim:** that a green check means the app works. Until the sandbox can sign people in, "It
  started and answered" is the honest line (moment 6's wording), and the instructor's own try-out is the real test.


## The cost of a task-2-sized app

**A task-2-sized app on the capable model costs about $0.12, with prompt caching doing almost all the work.**
A2b, the clean run, processed 7,319,794 tokens in 103 turns (session stats), at the prices fitted on the solo runs:

| Tokens | Count | Price per million | Cost |
|---|---|---|---|
| cached input (cache read) | 7,147,203 | ~$0.010 | $0.0715 |
| uncached input (input + cache write) | 309 + 111,655 = 111,964 | $0.125 (measured) | $0.0140 |
| output (reasoning included) | 60,627 | ~$0.50 | $0.0303 |
| **total** | | | **≈ $0.116** |

- **Without prompt caching** the same tokens would cost 7,259,167 × $0.125/M + $0.0303 ≈ **$0.94**: still under a
  dollar.
- **A follow-up costs about $0.02.**
- **With the interruption, A2 try 1 + A2c cost $0.032 + ~$0.069 ≈ $0.10.**
- **The whole night cost $2.716** of the key's $40 (`/key/info`). About $2.18 of that is the on-prem model: B1
  0.60, B2 1.45, about 0.07 of context probes, and B1's two abandoned requests. **Everything on the capable model** (A0,
  A1, three A2s, A2s, C1, and every probe) **comes to about $0.53.**
- **On-prem**, LiteLLM charges the 27B at $1 per million tokens, with no cache discount, and every turn re-sends the
  context. B1 (my-answers) processed 603,554 tokens: **$0.60, and 36 minutes**.
- **B2, the Practice room on-prem, processed 1,447,655 tokens: ≈ $1.45 and 96 minutes**, for an API with no pages that
  recognises nobody.
  - A complete on-prem task-2 app would need the pages too.
  - B2 spent 1,447,655 tokens and 5,771 s on 1,382 lines: about **1,050 tokens and 4.2 s per line**.
  - A2b's pages (`app.js` 221 + `index.html` 20 + styles 3 ≈ 250 lines) were about a third of its app. At B2's rates,
    250–450 lines of pages add 0.26–0.47M tokens ($0.26–0.47) and 17–31 minutes.
  - **A complete task-2 app on-prem: ≈ $1.70–1.90 and about 2 hours**, against $0.12 and 13½ minutes on the capable
    model. The on-prem dollars are LiteLLM's notional price for a local model; the hours are real.
- **The arithmetic behind the fitted prices:** uncached input is measured directly (410,856 prompt tokens cost
  $0.051365, i.e. $0.125/M). The cached-input and output prices are solved from A1 and A2 try 1, which ran alone
  (exact fit), and A0 is predicted at $0.0042 against $0.0061 measured.


## What was NOT measured

- **A real CWL sign-in.** Nothing in the sandbox can sign a person in, so neither the agent nor the checker ever
  exercised a signed-in page. That is where both task-2 apps' worst bugs are.
- **The platform's own build, its scan gate, and a deploy.** The checker renders the blueprint's real
  `Dockerfile.tmpl` and builds it locally against the public registry, with an `.npmrc` it writes itself.
- **`validateSpec` *was* run** (read-only, from the control plane's compiled `dist/spec/index.js`, with the
  platform's real `validationContext` whitelist); the build-time attribute registration (`AttributeDriftError`) was
  not.
- **Egress enforcement, the mirror (Verdaccio), and sandbox isolation** (S6's open question). The agent's container
  had open egress through Docker's default bridge.
- **Pushing through 7100**, and the platform's `exec` and stream: the driver used `docker exec -i` on the host.
- **AI features at run time.** The app was given no model access in the sandbox; hints and AI-drafted questions were
  reviewed by reading code only.
- **pi's sub-agents.** The extension was loaded in every run, and no run used it.
- **Any page in a browser.** Even A2s walked its app with `curl`. A browser walk (form validation, scripts) is what
  would have caught A2b's unsubmittable form.
- **#9216 in full.** No stream ended "terminated", and compaction re-triggered (B2, three times), but only on a model
  wired through LiteLLM with a 20-minute idle timeout.

## For Rich in the morning

**Decisions I took that are yours to confirm or reverse:**
1. **The capable model through the Responses API.**
   - Why: gpt-6-luna refuses tools on chat completions, so pi's `default-chat-large` entry is
     `api: "openai-responses"`, and the proxy allows `POST /v1/responses`.
   - For C1, `@ai-sdk/openai` replaced the brief's `@ai-sdk/openai-compatible`, which could not have worked.
2. **Our `SYSTEM.md` is appended to pi's prompt, not a replacement** (it is the agent dir's `APPEND_SYSTEM.md`).
   - Why: a replacement drops pi's tool list and rules. Appending also reaches sub-agents.
3. **pi's agent dir is a writable copy of our read-only package**, because pi 0.87.1 crashes on a read-only one.
   - Every run's summary has an integrity diff. Nothing but pi's own `auth.json` and `models-store.json` ever changed,
     except where I edited the package mid-run (noted per run).
4. **Additions:**
   - an **`ask_instructor`** tool (never used);
   - **from A2 on, the workspace is a git checkout** with the seed committed;
   - **the driver resumes a session** when the model disappears: A2c, after your platform's tier removed
     `default-chat-large`;
   - the **on-prem idle timeout raised to 20 minutes for B2** (B1 ran with pi's 300 s default).
5. **Two things beyond the brief:**
   - the **signed-in check**;
   - the **A2s experiment** with a development sign-in.

   Both are labelled as such wherever they appear, and neither changes how any other run was judged.
6. **`validateSpec` was run read-only** by importing the control plane's compiled `dist/spec/index.js` in place, with
   the platform's own `validationContext()` whitelist. Nothing was installed or run in that repository.

**Kit defects of mine, recorded rather than hidden:**
- `SYSTEM.md` told the agent it could change `manifest.yaml`'s `name`. Three my-answers runs of three renamed the app,
  and the validator refused each one.
- macOS `tar` put AppleDouble `._*` files into A0's and A1's workspaces.
- 32 anonymous Mongo volumes leaked. manifest-92 noticed; all were removed, and `-v` was added.
- `run-app` doesn't inject an app's `env:`.

**Refused:**
- Nothing was refused by the permission classifier all night.
- One harness rule blocked a foreground `sleep 45` ("To wait for a condition, use Monitor with an until-loop …").

**Waits:**
- Both peer sessions asked me to hold the on-prem leg. manifest-92 also asked me to hold the capable runs while its
  Docker tier ran (it removes `default-chat-large`).
- I held everything from 23:34 to 00:35, when it gave the all-clear, and acknowledged every message.

**The 7100 leg, if you want it** (a window you grant):
- For my-answers, push **A1** (`runs/A1/workspace`) or **C1**; both pass every check, signed-in included.
- For the Practice room, push **A2s** (`runs/A2s/workspace`), which is the best of the four task-2 apps. Its known gaps
  are in `runs/A2s/review.md`.
- Don't push **B1**: it crashes on the first signed-in request.

**Plan-side follow-ups for the front-end:**
- The Practice room's plan says "students' login names". UBC does not release a CWL login name to apps (the
  whitelist is PUID, mail, given name, surname, affiliation), and two agents asked for `uid` and were refused.
- The plan and intake should say "name and email" instead.

**The key:** $2.716 spent of $40; left to expire at 2026-10-01T23:54:12Z (16:54 PDT). Never deleted.


## Docs a later sitting must sweep

- `ORIENTATION.md` §2 says "five spikes", and §5 says "S5 and S4 are deliberately later": S5 has now run.
- The spec's spike table (S5 row) still reads as open.
- Anything that names `@ai-sdk/openai-compatible` or chat completions as the way an agent reaches
  `default-chat-large`: with tools, gpt-6-luna answers only on `/v1/responses`.
- The front-end's notes that the capable model's fallback is safe for an agent: an agent's 400s are never retried,
  and a removed model is a 400.
