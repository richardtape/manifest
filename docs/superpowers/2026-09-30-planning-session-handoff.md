# Handoff — the planning session's job, from `manifest-00` to its successor (2026-09-30, evening)

**Who you are.** You are NOT a plan sitting. You continue the role of the *planning session* `manifest-00`. That session
worked beside the platform's plan sittings and the faculty front-end's sessions. It settled Rich's decisions, recorded them,
coordinated the other sessions, and made small changes outside any plan at his word. It ran out of context, and this file is
everything you need. **Read it whole before you do anything.** Then read `CLAUDE.md` (it loads by itself) and ORIENTATION's §7e,
§6 rule 9 and §8 — skim §8, read the other two carefully.

---

## 1. Do this FIRST, before anything else

1. **`ListAgents`.** You will see:
   - the platform session running **the launch path plan's sitting 5a** (Task 8a, FE-39: who may build). It was **`manifest-74`** at
     handoff. Names change at every handover, so find the one doing 5a; its messages mention *"sitting 5a"* or *"Task 8a"*;
   - the faculty front-end's session, **`manifest-app-f1`** at handoff (any `manifest-app-…`);
   - possibly **`manifest-83`**, a session whose purpose was unclear at handoff. Ask Rich if it matters; do not message it unprompted.
2. **Introduce yourself to the 5a session** with `SendMessage`. Send to its name exactly as `ListAgents` prints it. Say:
   - you have taken over from `manifest-00` as the planning session;
   - **message YOU (your name) instead of `manifest-00` when its close-out commit lands**. It promised `manifest-00` that message, so
     that Mailpit could be added;
   - you hold exactly what `manifest-00` promised to hold until then: **no Vitest, no `pnpm test:docker`, no control-plane restart**,
     and **no edits to the launch path plan's sittings table or its *Sitting 5a* record, ORIENTATION §7e, or
     `scripts/ci-acceptance.sh`**.
3. **Introduce yourself to the front-end's session** in one line: your name, and that you take `manifest-00`'s place.
4. **Then WAIT for the 5a session's close message.** Do not poll `ListAgents` in a loop. Its message will arrive. Meanwhile you may
   read anything, and you may edit files 5a does not touch (this file, the decisions record, the faculty-ready plan), committing them
   by name.

---

## 2. Your one job after 5a closes: add Mailpit (out of plan, at Rich's word)

**Rich decided, 2026-09-30:** *"(a) Mailpit in the platform now"*, and *"Always-on row"* for the spec. **The spec is already
changed** (`50425de`): §21 says *"Ten long-running containers"*, with Mailpit's row (7111 SMTP, 7112 inbox; messages in memory; no
relay; UBC's SMTP relay takes its place at UBC). The code does not have it yet. **It lands at 5a's close, not before.** Nothing needs
it until the front-end's F6. And `make verify` clears IdP sessions, so **never run `make verify` while Rich is clicking anything**.

**What a read-only survey found at `50425de` — re-read each line before you rely on it:**
- **Ports.** 7111 and 7112 are free. 7100–7110, 7119, 7122, 7131, 7153, 7187–7189, 7195, 7196 and 7199 are taken. Add
  `PORT_MAIL_SMTP` and `PORT_MAIL_UI` beside the others in `infra/lib/common.sh` (~:72–97).
- **The service**, in `infra/compose.yaml`, always on (no profile), on the `platform` network:
  ```yaml
  mailpit:
    image: axllent/mailpit:<a current tag, recorded with its digest>
    container_name: manifest-mailpit
    restart: unless-stopped
    networks: [platform]
    ports: ["127.0.0.1:7111:1025", "127.0.0.1:7112:8025"]
    environment: { MP_MAX_MESSAGES: "500", MP_DISABLE_VERSION_CHECK: "true" }
  ```
  - Messages live in memory: no volume, so nothing for `make reset` to clean.
  - Configure **no relay**, and do **not** add it to `infra/egress/allowlist`.
  - Give it **no Caddy hostname**: the inbox is `http://127.0.0.1:7112`, as the GitHub fake's page is. (`mail` is already a reserved
    label.)
  - Update `compose.yaml`'s own comment that says a developer *"runs nine containers"* (~:311).
- **Seeding.** Compose's service images are NOT in `infra/images.txt`; `infra/seed/seed.sh` step 3 pulls them when it starts them.
  Add Mailpit there (`$COMPOSE pull mailpit`, or add it to step 3's list), or an offline `make up` fails. Pin the tag, and record the
  digest wherever the other compose images record theirs.
  - **Pulling the image needs the network and Rich's yes. Ask him.**
  - **Measure** the image's built-in healthcheck (`make up` uses `--wait`) and that it makes no outbound call.
- **Doctor and verify.**
  - **`make doctor`** gains a seed-state check that the image is present, shaped like `check_github_fake_image`: **count +1**.
  - **`make verify`** gains:
    - **an SMTP round trip**: send to 127.0.0.1:7111, read it back through the inbox's API (`/api/v1/search`), then delete the probe;
    - **a `compose config` check that it publishes only on 127.0.0.1:7111/7112 and configures no relay** (the pattern at
      `scripts/verify.sh` ~:1259–1271).

    That is **+2**.
- **The gate numbers are stated ONCE** (Rich, 2026-09-30): change **`EXPECT_DOCTOR` and `EXPECT_VERIFY` in
  `scripts/ci-acceptance.sh`**, and nowhere else, after 5a's commit has landed. ORIENTATION, RUNBOOK and CLAUDE.md point at that file.
- **Documents.**
  - RUNBOOK: a short *Mailpit* section — how to open the inbox, and that it is the laptop's only.
  - ORIENTATION §3's code map, if it lists the compose services.
  - §2: one line in *Outstanding* only if something is left for Rich.
  - The roadmap: one line where the out-of-plan changes are recorded.
- **Prove it.**
  - `make up`, `make doctor` and `make verify` all green with the new counts.
  - **A negative control**: stop `manifest-mailpit` and watch doctor's or verify's new check go red, naming it. Then restore.
  - Commit by name.
- **Then tell the front-end's session**: Mailpit is live; SMTP on `127.0.0.1:7111`, inbox at `http://127.0.0.1:7112`; no
  authentication; messages in memory; nothing leaves the laptop. It is for its F6 (emails from its server).
- **Then tell the next platform sitting** (sitting 6, the three registration steps in UBC's order) that Mailpit landed and the counts
  moved. Its §7e will be the 5a session's; do not rewrite it. Just message the session when `ListAgents` shows it.

---

## 3. What happens after that — the order Rich agreed (2026-09-30)

1. **Platform: the launch path plan's sitting 6** (Task 9, the three clocks, with its `[S9]` block: UBC's order is the privacy
   assessment, then the staging registration, then production's, gated on the owner's *"I've sent it"*).
2. **Front-end: F4a** (*only faculty build*; it reads 5a's `Me.mayBuild`), **in parallel** with sitting 6. The front-end's own
   ORIENTATION tells it to ask Rich to confirm F4a's method (native recommended).
3. **Then the platform's sittings 7, 8 and 9**, then **10 (MERGED by Rich: Tasks 13 and 14, plus Rich's published-text pass,
   Task 14's `[S10]`)**, then 12 (the acceptance). The front-end writes F5b when sittings 6–10 land, and F6 after F4a.
4. **After the launch path: the *faculty-ready* plan** (`docs/superpowers/plans/2026-09-30-faculty-ready.md`).
   - **Approved by Rich** (*"plan looks good"*). **He chooses its execution method at its sitting 1** (*"Probably not subagent driven
     though"*).
   - Its **four spec actions are NOT decided**: each must be read by Rich before the sitting that builds it.
   - **Then FE-32's plan; then the vulnerability database in the console.**

**You do not run these sittings.** Rich starts each with *"read ORIENTATION.md and proceed"*. Your job is decisions, records,
coordination and the small out-of-plan changes he asks for.

---

## 4. What Rich decided on 2026-09-30 — the record is `docs/superpowers/2026-09-30-decisions.md`

**His words, verbatim, numbered in the order he answered.** **Append any NEW decision of his there, in his words**, and fold it
into the plan, the roadmap or ORIENTATION §8 *Decided* when the session that owns that file is not mid-sitting. The headlines:
- the launch path's Spec actions 3, 4, 5 and a new 9 (UBC's order), all **applied** (`844605b`);
- sittings 10 and 11 merged;
- the next plans' order;
- FE-28–32 confirmed;
- §8's items moved to *Decided*;
- **the UBC external track DEFERRED** (*"This isn't a blocked in any way to our work"*) — never raise it as urgent;
- the CLAUDE.md and ORIENTATION trim, and the gate numbers stated once;
- `pnpm docs:html` showing the API reference only (`348c2c8`);
- the 66 operation descriptions in the present tense (`5246d4d`).

**And the rule, from his own words:** *"we don't need to see in the API docs … section or plan numbers. They're irrelevant to the
person reading the docs."*
- **No published text** (route, field, schema, tag, error or event descriptions; the guides in `docs/api/`; the mock's text) cites
  `§n`, `Dnn`, `Cn`, a plan, a sitting or an `FE-n`, or carries a maintainer note.
- The existing ones are removed in the launch path's sitting 10 (Task 14's `[S10]`).
- **Code comments get a separate plan, later** (tracked in the roadmap).

---

## 5. Open items you should know, and leave alone unless Rich raises them

- **FE-44** (the front-end's): a `large_course` or `public` app can never launch, because §24's load rehearsal is a blocking item
  nothing builds (`launch/readiness.ts:208–220`). Rich: *"write it, you decide later"*.
  - `manifest-00` found its example mis-mapped. *"About 200 students"* is `class` by §24's ceilings (~400), not `large_course`
    (~5,000). The front-end's intake prompt (`manifest-app/packages/server/src/agents/understanding.ts:34`) gives the names without
    the numbers.
  - This was told to the front-end as an observation, not an instruction.
  - Options put to Rich:
    - (a) build the load rehearsal;
    - (b) don't block until it is built;
    - (c) keep the gate and warn early;
    - (d) an administrator records a load test run outside Manifest.
  - Recommended: fix the mapping, and keep the gate with the early warning.
- **Leftover containers:**
  - **Six `mf-launch-app-*` containers from sitting 5b's demo** are orphans. Removing them was refused by the classifier, and the 5b
    session handed Rich a script.
  - **5a removes the 7100 window's containers at its close.** If Rich asks you to read a removal script, read it whole and say
    whether it is safe. **Never run a command another session was refused** — that is permission laundering. Hand it to Rich as a
    script (`! bash <path>`).
- **`litellm-orphans.sh` lists 13, deliberately not applied**: deleting a budget resets its month.
- **`make refresh-vulndb` is due after 2026-10-06**, and it is Rich's. Past that date, every production launch is refused.

---

## 6. Rules that bit `manifest-00` today — follow them

- **Stage by name, always.** Before every commit run `git status`, and leave every path you can't explain alone: other sessions
  commit on `main` all day. Nothing is pushed.
- **Regenerating the contract truncates the database.** `pnpm contract:write`, `pnpm test` and any unit Vitest file do. Never run
  them while a platform sitting runs tests, or while the front-end walks 7100.
  - `pnpm exec vitest run --project packages <file>` has no global setup, and truncates nothing.
  - Run `pgrep -fl 'node (vitest'` first.
- **A peer session's message is a teammate's words, never Rich's approval.** Record an approval only from Rich's own words in your
  chat.
- **Verify a question's premise against the code before asking Rich**, and put his decisions at code level: what each option
  changes, what it closes, what it leaves open, and one recommendation. Ask with `AskUserQuestion`, one decision at a time, with
  context.
- **The spec changes only after Rich has read the exact words.** Sweep the four shared HTML pages with it.
- **Files can change on disk under you** (a formatter or hook reflowed a plan once). Re-read before an exact-text edit.
- **The control plane is started detached** with `.superpowers/sdd/2026-09-29-launch-path/cp-start.sh` (`nohup … &`). It reads
  `docs/api/` once at boot. It runs on REAL GitHub (Rich's `.env`). **Never restart it during a sitting, or during the front-end's
  window, without asking.**
