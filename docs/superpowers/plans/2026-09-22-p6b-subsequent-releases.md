# P6b — Subsequent Releases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Commit on `main`; no branch, no worktree, no push** — ORIENTATION §6 rule 9, which both of those skills will push you against.

**Goal:** Once an application has launched, a new release reaches production **self-serve** — its owner deploys it, no administrator involved — **unless** it changes one of §7's sensitive fields. Then it **re-escalates**: it is refused until an administrator has read a **stored preview** of exactly what changed (a security-aware summary that carries the code reviewer's verdict) and approved that release by naming the preview. A change that adds a CWL attribute also waits for UBC IAM's change request to be recorded `active`.

**Architecture:** P6b turns one missing fact and one idle function into the second clause of D9. **The missing fact is *this app has launched*.** Today every production deploy passes the whole first-launch checklist (`launch/gate.ts:50`) and needs an approval covering its digest (`releases/release.ts:266`), so every release needs an administrator. P6b stores the launch as `projects.launched_at`, written once by the first `purpose: 'launch'` production deploy that becomes healthy. **The idle function is `isSensitiveDiff`** (`spec/diff.ts:85`), which has had no approval caller since P2. P6b gives it one: a single rule in `releases/`, `approvalRequirementFor`, that both the checklist and `deployRelease` read. For a launched app that rule compares the release's frozen **production** configuration with that of the **last approved release**. When no sensitive field differs, the deploy goes ahead with no approval. When one does, the deploy re-escalates. **The approval an administrator then makes binds a stored preview**: facts computed deterministically, plus a model-written summary. When the administrator approves, the platform recomputes the facts and refuses if they no longer match. It never compares the summary, because the summary can differ on every call. **The IAM change request is the registration's own `change_requested` state**, and the column that records what UBC has registered changes only when that registration is recorded `active`. Alongside all of this, **the person-only class** (`release:approve`, `launch:record`) becomes one central rule in `assertCapability`, with a code of its own.

**Tech Stack:** TypeScript on Node **24.12.0** (read 2026-09-22), Fastify 5.12.3, Drizzle over Postgres 16, `zod/v4` for representations, Vitest 2.1, React 19 + Vite in `packages/console`, `@manifest/contract` generated from `packages/contract/openapi.json` by `openapi-typescript` and driven through `openapi-fetch` 0.17.0. **This plan installs no package.** If a task believes it needs one, record that as a finding and raise it; do not install it as a step.

**Spec:** [`../specs/2026-08-29-manifest-platform-design.md`](../specs/2026-08-29-manifest-platform-design.md). Read these sections: **§7** *Sensitive fields* (the seven, and only these, re-escalate) and *Validation*'s last production clause; **§13** in full, especially *Gate (D9)* clause 2, the `diff_snapshot` sentence, *Integrity of the gate* and *Residual risk*; **§9** *Production: real UBC IAM registration* and *Attribute changes are gated in every environment (D16)*; **§20** *Manifest's own front door* (step-up and the person-only class) and *Credential classes*; §6's `Approval` and `IamRegistration`; and **D9, D14, D16, D24 and D33** in §4.

**Brief:** [`2026-09-19-p6-brief.md`](./2026-09-19-p6-brief.md). **§10 fixes this plan's scope. §5's R4(d) is this plan's: the summary becomes security-aware and carries the reviewer's verdict.** Its §8 traps all still apply.

**Predecessor:** [`2026-09-19-p6a-first-production-launch.md`](./2026-09-19-p6a-first-production-launch.md), executed 2026-09-22. **Its *What this plan does not build* is this plan's input list.** Its sitting 11 record, especially F3, F6 and F7, is the reason for three of the decisions below. Its top sections are the structural model this plan follows.

**Roadmap:** the **P6b** row of [`2026-08-29-plan-roadmap.md`](./2026-08-29-plan-roadmap.md). **D5's GitHub source driver comes after this plan, and the authoring API after that** (Rich, 2026-09-22). The reason is the roadmap's rule: *anything that widens who can change a spec goes after the gate that inspects spec changes.* That gate is this plan. **Write every control as though something hostile will one day write `manifest.yaml`**, because the next two plans are what make that possible.

---

## How this plan is to be executed — sittings, one per session

**One sitting per session, with a check-in at each boundary.** This pattern has carried every plan since P4a, and it means a session limit can never land in the middle of a task. This plan commits after every task: a stop *between* tasks is recoverable, a stop *inside* one is not.

> **THE SITTING COUNT IS RICH'S AND IS NOT YET AGREED (Question 1 below).** The table below is
> the RECOMMENDED split, eight sittings. The lean split (seven) and the cautious one (nine) are in
> Question 1 with their costs. **Task 1 is alone and first in all three**, so sitting 1 can run
> before Rich answers. **If he chooses another split, re-cut this table before sitting 2 and say
> so in the session record.**

*The **Status** column records what a sitting made true, never how many findings it produced — that number lives once, in the roadmap's defect-rate table (Rich, 2026-09-20).*

| Sitting | Tasks | What it delivers | `pnpm test:docker` owed? | Status |
|---|---|---|---|---|
| 1 | 1 | **The measurements this plan rests on** — fifteen measurements of the running platform before any code: the override blind spot, the baseline that counts a rejected release, a release freezing the wrong spec, a rehearsal that replaces live production, the gate evaluating one release and deploying another, the IAM record that overwrites what UBC registered. **Alone, and first** | **No** — nothing under the owing paths changes; two throwaway probe tests are written and deleted | not started ← **next** |
| 2 | 2–3 | **The person-only class** — one central refusal, a mint refusal, a code of its own — and **the sensitive diff over frozen releases**: one rule over §7's seven fields, the baseline that reads each release's *latest* decision, and a release that freezes its build's own spec | **Yes** — `projects/`, `spec/`, `releases/` | not started |
| 3 | 4–5 | **An app has launched** — migration 0021, the launch recorded once, a rehearsal refused afterwards — and **`deployRelease`'s half of D9.2**: approval required for a first launch and for a sensitive change, never for anything else, and never deploying a release an administrator rejected | **Yes** — `releases/`, `launch/`, `*.docker.test.ts` | not started |
| 4 | 6 | **The gate for a launched app — this plan's centre, alone.** The checklist branches on `launched`, the self-serve deploy goes through, a sensitive change is refused `RELEASE_REESCALATED` carrying the view, and a release that is not the one serving staging is refused `RELEASE_NOT_STAGED` | **Yes** — `launch/` | not started |
| 5 | 7 | **The IAM change request** — migration 0022, a registration's registered set that changes only when UBC registers it, the change request as the registration's own `change_requested` state, and the live-registration check (attributes, ACS and SLO) for every production release | **Yes** — `launch/` | not started |
| 6 | 8 | **R4(d)** — the summary becomes security-aware: deterministic security notes per sensitive field, the reviewer's verdict and D33's coverage limit in the record and in the prompt; and the `code-review` item reads the verdict (P6a F7) | **Yes** — `releases/`, `launch/` | not started |
| 7 | 9–10 | **The stored preview**: migration 0023, `createApprovalPreview` and `getApprovalPreview`, approve and reject binding a preview and refusing a stale one — and **the console's approvals screen**, which shows the preview BEFORE the decision and keeps it through the step-up round trip. **The heavy sitting**: the server half and the screen that uses it, together, so the console's Approve button is never broken across a session boundary | **Yes** — `releases/` | not started |
| 8 | 11 | **The acceptance**: `make demo-releases` — a self-serve production redeploy, then a sensitive change refused until an administrator approves it, then the IAM change request path — its offline-acceptance step, its `ci-acceptance` step, green three times, **and a clicked half by a person**. **Alone, and last** | **Yes** if any code changes | not started |

**EVERY SITTING ENDS THE SAME WAY, and none of these four steps is optional:**

1. **The four gates**, from the repository root: `pnpm test` (twice, alone), `pnpm lint`, `pnpm typecheck`, `pnpm format:check`. Add **`pnpm test:docker`** whenever the table above says it is owed (~23 min on the last run: P6a sitting 11 measured 1394 s). **Budget for it rather than being surprised by it, and restart the control plane afterwards.**
2. **A dated entry in *What executing this plan found*.** It records the tasks, every defect with the measurement that found it, and the negative controls, including which of them could not fail and why. It ends with the gate numbers and the state of the machine.
3. **This plan's sittings table, updated.** Mark the sitting done and move the `← next` marker. **State no findings count here**: the count lives once, in the roadmap's defect-rate table, and is derived at the CLOSE (the command is at the head of *What executing this plan found*).
4. **The close-out sweep in ORIENTATION §6.** Its first line is the roadmap ledger. The gate numbers live in **ORIENTATION's top-of-file box, §2's box, `README.md`, `RUNBOOK.md` and `scripts/ci-acceptance.sh`'s four `EXPECT_` lines**, and all five move together. **Then re-read your own §7e as a cold agent would, and verify every claim by opening what it points at.** That check has found a defect in every sitting since P5b's third.

**THIS TABLE IS A SCHEDULE, NOT A CONTRACT.** Moving task boundaries is Task 1's job; it did so in three of P6a's four predecessors. **If it moves one, re-cut the sittings before starting sitting 2.** Two rules survive any re-cut. **Task 1 stays first and alone. Task 11 stays alone and last**: it is this plan's own task, not something that happens after the last feature.

---

## Questions for Rich — decision, options, recommendation

**Three of them.** Each is his because it is a spec change, a policy with a cost that faculty would feel, or the schedule. **None blocks sitting 1.** Question 2 blocks Task 7's control (e), and nothing else. Question 3 changes one sentence in Task 8.

### Question 1 — the sitting count

| Split | Sittings | What it costs |
|---|---|---|
| **Lean** | **7**: [1] [2,3] [4,5] [6] [7,8] [9,10] [11] | Sitting 5 pairs the IAM change request with R4(d). **IAM is where P6a hid its worst logic hole** (sitting 8's F9, a release built before the registration existed reaching production unchecked), and pairing it leaves less room to chase a control that stays green |
| **Recommended** | **8**: [1] [2,3] [4,5] [6] [7] [8] [9,10] [11] | Task 7 gets a sitting to itself. Sitting 6 (R4(d)) is light, which leaves room for the sweep. **Sitting 7 is still heavy**: the preview's server half and the screen that uses it, together, so the Approve button is never broken across a session boundary |
| **Cautious** | **9**: [1] [2,3] [4] [5] [6] [7] [8] [9,10] [11] | Splits "launched" from `deployRelease`'s half. It buys isolation between two tasks that both touch `releases/release.ts`, **at the cost of a session in which the platform records launches that nothing reads yet** |

**Recommendation: eight.** The honest prior is **P6a's 9.8 findings per task** (the roadmap's defect-rate table), which puts eleven tasks at roughly **95–120 findings**. The eight-sitting split gives the one task most likely to hide a hole, IAM, its own session. The brief guessed five to seven. It could not have known that writing this plan would find six premises false (*Read this first* 2, 5, 6, 7, 8 and 9).

### Question 2 — does REMOVING a CWL attribute wait for an IAM change request? (Spec action 1)

§13 D9.2 reads: *"A change to `auth.attributes` additionally requires an IAM change request to reach `active` before the release can deploy (§9)."* The mechanism §9 describes, and D16's rationale, are both the **subset rule**: *"in production, `auth.attributes` must be a subset of what UBC IAM registered"*. **An addition breaks the subset. A removal cannot**, because the app asks for less than UBC releases, and sign-in still works.

| Option | What it means | Cost |
|---|---|---|
| **(a) Recommended: an addition waits; a removal re-escalates but does not wait** | A removal is still a sensitive change, so an administrator approves it (D9). It does not block on IAM, and the checklist notes that UBC now releases an attribute the app no longer asks for, and that a change request would stop it (data minimisation) | **§13's sentence must say "addition"**. That is Spec action 1: one word, and the sentence then describes the code. The platform never makes a faculty member wait weeks for UBC to *stop* sending something |
| (b) The literal sentence: any change waits | A removal also blocks until an administrator records a change request `active` with the smaller set | Weeks of lead time to *narrow* what an app receives, which is the change privacy wants encouraged. The platform must also track which change request answers which release, where the subset rule needs no such tracking |

**The plan builds (a).** If Rich chooses (b), the switch is one condition in `launch/readiness.ts`'s `liveRegistrationItem`: `added.length > 0` becomes `!sameSet(requested, registered)`. **Task 7's control (e) is that switch, and it is predicted.** The acceptance's leg A would then need a change request for its removal: four API calls, named in Task 11.

### Question 3 — a sensitive change to something the PIA was written from: back to `draft`?

§7 says of `ai.models`: *"a model change can move personal information to a different jurisdiction, which **invalidates an approved PIA** (§9)."* §9's PIA table derives *where it is stored* from `services` and *where it flows* from `egress.allow`, `ai.models` and `data.classification`. **Nothing in the spec says what happens to an approved PIA when one of those changes after launch.**

| Option | What it means | Cost |
|---|---|---|
| **(a) Recommended: never automatic.** The re-escalation's security note says the PIA may be invalidated, and names the field. The approving administrator decides, and can return the PIA to `draft` along P6a's existing `approved → draft` arrow | A human who has read the change makes the call, and the record says what they were shown | A PIA can stay `approved` over a change that invalidated it, if the administrator does not act on the note. **That is the same trust the whole re-escalation already rests on** |
| (b) Automatic: a change to any PIA input returns the PIA to `draft` | The Privacy Office sees every such change | **Every production release of the app is blocked for weeks**, self-serve ones included, because §9 blocks production until the PIA is `approved`. That includes renaming a model group or adding an egress host |
| (c) Automatic for `ai.models` only, the one field §7 names | Implements §7's sentence literally | The same weeks-long block, for the one field an administrator repoints fleet-wide (§7 *Logical model names*) |

**The plan builds (a).** If Rich chooses (b) or (c), it is a new task after Task 8, plus a spec action on §9's PIA subsection. It is not a one-line switch.

---

## Read this first — what this plan knows that the brief and P6a's record do not

**Read from the code on 2026-09-22, at `f71c43f`, while this plan was written.** Every item is a fact about the platform as it stands, with a pointer. **Task 1 re-measures each one marked *(T1: M<n>)*, and several were found only because the code contradicted the hand-off.** Six of them are premises this plan would otherwise have built on and that are false.

1. **THERE IS NO CONCEPT OF "LAUNCHED", SO EVERY PRODUCTION RELEASE IS A FIRST LAUNCH.** The deploy route calls `assertLaunchable` (`api/routes/releases.ts:430`) whenever the environment is production. `computeLaunchReadiness` (`launch/readiness.ts:69`) evaluates the *candidate*, meaning the release serving staging (`launch/candidate.ts:27`), against the full first-launch checklist, and `admin-approval` reads `latestApprovalFor(candidate.release.id)`. `deployRelease` then refuses any production `purpose: 'launch'` deploy that has no approval covering its digest (`releases/release.ts:266`). **Every rebuild is a new release, and every new release needs an administrator.**
2. **`isSensitiveDiff` HAS ONE CALLER, AND IT CANNOT SEE A RAISED PRODUCTION OVERRIDE.** Its only caller is `POST /v1/projects/{id}/spec` (`api/routes/project-reads.ts:382`), which *reports* the diff and gates nothing; the route's own description says *"reported, not yet enforced"*. It compares `ManifestSpec`s, and its `resources` check reads **`before.resources` against `after.resources` only** (`spec/diff.ts:58-66`). So a manifest that raises `environments.production.resources.memory` from `512Mi` to `8Gi` reports **no sensitive change**, while production would run with sixteen times the memory. *(T1: M3.)*
3. **`describeDiff` ALREADY COMPARES WHAT PRODUCTION RUNS.** It takes the two releases' frozen **production** `ResolvedConfig`s (`releases/approval.ts:185-186`), which include blueprint defaults and the production override. **It carries no `blueprint` reference**, because `ResolvedConfig` has none (`spec/resolve.ts:19`).
4. **THE MANIFEST'S `blueprint:` IS READ BY NOTHING EXCEPT `isSensitiveDiff`.** Builds, releases and deploys all use **`project.blueprintRef`** (`api/routes/builds.ts:84,101`, `api/routes/releases.ts:189`, `releases/release.ts:306-319`). Validation never compares the two (`spec/policy.ts` has no blueprint rule), and **no route changes `blueprintRef`**. So §7's `blueprint` field re-escalates on a change to a *claim* that changes nothing, while the build definition itself cannot change through any route. *(T1: M4.)* This plan compares the manifest's claim, because §7 names it, and records the gap in *What this plan does not build*.
5. **`lastApprovedReleaseFor` COUNTS A RELEASE THAT WAS APPROVED AND THEN REJECTED.** It filters approval rows on `decision = 'approved'` (`releases/approval.ts:129-142`) rather than taking each release's **latest** decision. The approvals table has no unique constraint on `release_id` precisely so that a release can be approved, rejected and approved again, and after such a rejection the old approval row still makes the release a baseline. **Every re-escalation diff would be taken against a release an administrator withdrew.** *(T1: M5.)*
6. **A RELEASE FREEZES THE PROJECT'S NEWEST SPEC, NOT ITS BUILD'S, AND DOES NOT CHECK THAT THE BUILD IS THIS PROJECT'S.** `createRelease`'s route selects the newest `app_specs` row by `created_at` (`api/routes/releases.ts:178-196`) and never reads `build.appSpecId`, nor checks `valid`. An invalid spec stores `parsed: {}` (`project-reads.ts:374`), which would reach `resolveConfig`. And `createRelease` itself (`releases/release.ts:140-163`) reads the build by id with **no check that it belongs to `input.projectId`**. So a release can carry a configuration that §7's build-time attribute check never saw (`releases/build.ts:320-340` checks the *build's* spec), and a member of two projects can put one project's image under the other's name. *(T1: M6.)*
7. **A REHEARSAL AFTER LAUNCH PUTS AN UNAPPROVED RELEASE ON THE LIVE PUBLIC LISTENER.** `runRehearsal` calls `deployRelease` with `purpose: 'rehearsal'` (`launch/rehearsal.ts:119-123`). That purpose skips the digest check (`release.ts:266`), and the instance it starts **stays serving** until something replaces it. Before a launch, that is R2's design: nothing is public yet. **After a launch, it lets an administrator put any candidate in front of real students with no approval record** (§13's non-repudiation). *(T1: M7.)*
8. **THE GATE EVALUATES ONE RELEASE AND DEPLOYS ANOTHER.** The checklist describes the *candidate*, but the route deploys `body.releaseId` (`api/routes/releases.ts:432-445`), and `deployRelease` checks *that* release's approval. **So an approved release that is not the one serving staging reaches production** while the checklist a person read described a different one. That breaks §13's *"production runs the exact digest that staging ran"* and Decision 2's *"the view and the gate cannot disagree"*. *(T1: M8.)*
9. **RECORDING AN IAM CHANGE REQUEST OVERWRITES WHAT UBC REGISTERED.** `recordIamRegistration` writes `registeredAttributes` on every record, including the transition `active → change_requested` that P6a's arrows allow (`launch/records.ts:131,150`; `launch/transitions.ts:39-46`). An administrator who types the requested set while filing a change request makes the record claim that UBC registered it. **From then on the build-time check passes an attribute UBC has not released, and students get a broken login in production.** *(T1: M9.)*
10. **NOTHING COMPARES THE RECORDED ACS WITH THE RELEASE'S.** The first-launch `iam-registration` item compares attributes only (`launch/readiness.ts:207-270`). The rehearsal compares its ACS with *its own row* (`rehearsal.ts:341-352`), not with what the administrator recorded from UBC. **A release whose `auth.callback` moved deploys with an ACS URL UBC never registered.** *(T1: M10.)*
11. **`@manifest/contract` IS `1.0.0` WITH 41 OPERATIONS, AND P6a ADDED SEVEN WITHOUT BUMPING IT.** `api/contract/document.ts:14-24` says *"an ADDITIVE change bumps the minor"*, but `CONTRACT_VERSION` and `packages/contract/package.json` were last changed in P5c (`58107aa`). *(T1: M11.)*
12. **`summarySource: 'llm'` IS RECORDED FOR A SENTENCE NO MODEL WROTE.** When nothing changed, `summariseChanges` returns a fixed sentence *"Nothing in manifest.yaml changed since the last approved release."* with source `'llm'` (`releases/summary.ts:44-48`), and P6a's acceptance printed that sentence as *"the model's summary"* (sitting 11, run D).
13. **THE SUMMARY IS WRITTEN AGAIN ON EVERY CALL, WHICH IS WHY RICH'S PREVIEW MUST BE STORED.** `buildDiffSnapshot` has exactly one caller, `decide()` (`api/routes/releases.ts:80-125`), and calls the model each time. A preview that was only *read*, and then recomputed at decision time, would record a summary nobody saw. *(T1: M12 measures two calls on one input.)*
14. **A PLATFORM ADMINISTRATOR CAN MINT A TOKEN HOLDING `release:approve` OR `launch:record` TODAY.** The mint route refuses only `isPrivileged` (`api/routes/tokens.ts:79-89`). Such a token is refused `403 TOKEN_CREDENTIAL_REFUSED` today only because every route that asserts those capabilities calls `requireSession` first. **The person-only rule has no central statement**, which is exactly what Rich's decision says to build. *(T1: M13.)*
15. **SELF-SERVE MEANS NO ADMINISTRATOR, NOT NO PERSON.** Every production deploy asks `assertStepUp(actor, 'release:promote')` (`api/routes/releases.ts:~420`; Rich, 2026-09-20). So a self-serve redeploy is the *owner* re-proving themselves at the IdP. And D24 still makes an agent's production promotion a pending action that a person confirms. **Neither changes in this plan.**
16. **AN EVENT TYPE IS FOUR EDITS AND PUBLISHED SURFACE.** Adding one means editing `EVENT_TYPES` (`observability/events.ts:29`), its payload schema (`observability/event-schemas.ts`), the `CHECK` literal in `db/schema.ts` (~line 748; drizzle then generates the `DROP`/`ADD` pair itself — P6a `[M10]`), and the OpenAPI document's event schemas (the drift test reddens with no route added — P6a sitting 4).
17. **A `ProductionGateError` CODE MUST BE A LITERAL, AND ITS HINT IS FIXED TEXT TODAY.** `error-codes.test.ts:67` finds codes by scanning for `new <WireClass>('CODE'`, so a code chosen at runtime (`new ProductionGateError(code, view)`) is invisible to the registry. And `api/errors.ts:438-450` gives every `ProductionGateError` the hint *"These items have multi-week lead times"*, which is wrong for a re-escalation.
18. **A VIEW FIELD WITHOUT A SCHEMA FIELD IS A CHECKLIST DROPPED FROM THE `409`.** `mapError` renders `launchReadiness` through the `LaunchReadiness` schema, and drops a checklist that does not parse (P6a `[M4]`). **Add a field to the view and to the representation in the same task, or the refusal arrives with no checklist at all.**
19. **`production.docker.test.ts` LAUNCHES ITS PROJECT AND THEN REHEARSES IT.** Its describe block shares one `project` (line 109). The launch deploy is at line 348 and the rehearsal at line 446. **Once launches are recorded, that rehearsal is refused**, and Task 4 predicts the red.
20. **THE UNIT TIER CAN ALREADY REACH PRODUCTION.** `api/delivery.test.ts`'s `releasedProject` (line 139) and the positive control at line 654 build `fixture-node@1` (no CWL, no services), record a PIA, approve the release and deploy it. Task 4 moves those helpers into `api/testing.ts` and adds `launchedProject`.
21. **THE ATTRIBUTE WHITELIST IS EXACTLY THE FIVE ATTRIBUTES `launch-app` REQUESTS** (`api/routes/projects.ts:67-73`: `ubcEduCwlPuid`, `mail`, `givenName`, `sn`, `eduPersonAffiliation`). **So the acceptance can add an attribute only after removing one**, and Task 11's legs are ordered around that fact.
22. **`make demo-production` ASSUMES A PROJECT THAT HAS NOT LAUNCHED.** On its re-use path, step 3 expects the production deploy to be refused, step 5 runs a rehearsal, and step 10 expects a rebuild to have no approval (`packages/journey/src/production.ts:319,449,683`). **For a launched app, P6b changes the answer to all three**, so Tasks 4, 6 and 9 each change that file, and each predicts which checks go red.
23. **THE CONSOLE'S STEP-UP LINK RETURNS TO `pathname + search`** (`packages/console/src/ui.tsx:87`). A preview id carried in the query string therefore survives the round trip, and the console can re-read the preview instead of asking the model again.
24. **D22's gate reads the document, and the mock reads it too.** `packages/console/src/coverage.test.ts` wants a console caller for every operation, and `DELIBERATELY_UNCALLED` is **empty**. `packages/mock/src/server.test.ts` wants an `ANSWERS` entry for every operation, and `validate.test.ts` holds every fixture to the document. **A new required response field is a red `validate.test.ts` until its fixture has the field**, which is the prediction for every task below that changes a representation.
25. **THE MATRIX'S TOKEN FIXTURES ARE WRITTEN STRAIGHT TO THE STORE.** `api/authz-contract.ts:1463-1500` gives `token-capable` `launch:record` through `mintTestToken`, which bypasses the mint route. Its comment says the capability *"is mintable, because it is not one of D24's four"*, which stops being true in Task 2. No expectation in the matrix moves, because `requireSession` answers first on every person-only route.

---

## Decisions Rich made — build them, do not re-open them

- **The administrator sees the diff BEFORE deciding, as a STORED preview that the approval binds** (2026-09-22; P6a sitting 10's F15). The approve request names the preview, and the platform refuses if what it would record now differs. *Rejected:* a preview *read* alone, because the model-written summary can differ between preview and record.
- **A PERSON-ONLY class: `release:approve` and `launch:record`** (2026-09-22; in §20 and D24's row since that day). No delegated token can be minted holding either, and a token asking for either is **refused outright, with no pending action**, because each is a record that a named person decided.
- **§13 names no number of sensitive fields.** The code uses `SENSITIVE_FIELDS`, which has seven.
- **Ordering: P6b, then the GitHub source driver, then the authoring API.** Do not design for GitHub, and do not block it either. **This plan's re-escalation is the control both later plans depend on.**
- **R4(d)** (2026-09-19, brief §5): the approval summary gains a security dimension and surfaces the reviewer's verdict. *Coverage limit, stated:* under D9 it sees first launches and re-escalations only, **never a self-serve release**. **R4's spec action is applied (D33, §15, §20), and §13 was deliberately left untouched. Do not propose it again.**
- *Settled before this plan:* stateless session cookies with their two stated costs (§20). Step-up guards the production deploy as well as the approval (2026-09-20). Confirming a pending action needs step-up and rejecting one does not (P6a sitting 6, F12). An approval binds the build's digest and the deploy verifies it before starting anything (P6a Task 15).

---

## Decisions this plan makes, and why

**Nineteen questions below Rich's line.** Each one records what it rejected and what changing course would cost. The hand-off's six questions are Decisions 3, 4, 10, 11, 12 and 15, and each says so.

**Decision 1. "Launched" is a STORED fact: `projects.launched_at`.** It is written once, by the first `purpose: 'launch'` production deploy whose instance becomes healthy, and never cleared. An `project.launched` event is published with it. *Rejected:* **deriving it from a production instance**, because a rehearsal serves production too (*Read this first* 7) and would read as a launch. **Deriving it from an approval**, because an approved release may never have been deployed. **A `launches` table**: one fact, one column. **A backfill**: `pnpm test` empties the database on every run, and a launch that happened before migration 0021 simply reads as not launched. Its next production deploy then passes the full first-launch gate once more, which fails closed, and that deploy records the launch. **The same column is what §9's *"the project slug is immutable after production launch"* would read**, the day a rename route exists. *Changing course* costs a column.

**Decision 2. What a launched app's release must still pass.** A launched app gets a second checklist (§13 D9.2), computed by the same function as the first:

| Item | Blocking | Why it stays, or why it goes |
|---|---|---|
| `domain` | yes | Unchanged, and always `met` today |
| `iam-registration` | yes | **Stays, and becomes a *live* check** (Task 7). §7's last production clause says *"for a production release"*, which means every production release, not only the first. The registration must have been active once and must not be `expired`, and the release's attributes, ACS and SLO must all be covered by what UBC registered |
| `privacy-assessment` | yes | **Stays.** §9: *"Production deployment is blocked until it is `approved`."* If an administrator returns the PIA to `draft`, self-serve releases stop too |
| `scans` | yes | **Stays**, for the release being deployed. §12's scan gate is automated rather than an approval, so it is not what D9.2 waives |
| `admin-approval` | yes | **Becomes D9.2's.** `met` without any approval when no sensitive field changed since the last approved release. `unmet` when one did and no approval covers this release. **Always `unmet` for a release an administrator has rejected** (Decision 7) |
| `rehearsal` | — | **Removed from the view.** After launch, a rehearsal would put an unapproved release on the live listener (*Read this first* 7), so Task 4 refuses it outright. The consistency of the registration is now the `iam-registration` item's job |
| `load-rehearsal` | yes | Unchanged. A large-audience app cannot launch until P9, so this item never matters here |
| `code-review` | **no** | Unchanged in blocking, and reads the verdict (Decision 12) |

**The digest.** `deployRelease` still verifies an approval covering the digest **whenever an approval is required**: a first launch, a re-escalation, or no approved baseline at all. **When none is required, the integrity property is that promotion never rebuilds**: `builds.image_digest` is written once, and the registry refuses pushes from app and sandbox contexts (§13 *Integrity of the gate*, asserted by P6a Task 16). *Rejected:* **skipping every check for a self-serve release**, because a lapsed registration or a withdrawn PIA would then let a release straight through. **Keeping the whole first-launch checklist**, because then every release needs an administrator and D9.2 is never implemented.

**Decision 3 (hand-off Q1). An approval binds a RELEASE *and* its DIGEST; re-escalation reads the RELEASE.** `approvals` stores both (P6a Task 10), and `deployRelease` checks both. The diff that decides re-escalation is taken over releases, because it is **the frozen configuration that the platform actually runs**: the SP registration, the injected environment, the resources, the egress allowlist. **P6a's F3 measured that the builder is reproducible**, so an identical rebuild is a new release with the same digest. After launch, such a rebuild is self-serve **whenever its sensitive fields match the baseline, so nobody is ever asked to re-approve an identical image**. Before launch (D9.1) it still is asked, because the candidate changed. That is F3's behaviour, kept on purpose: it is the safe direction, and it costs one click and one step-up. *Rejected:* **binding a digest alone**. Two releases can share a digest and still differ in configuration, because `resolveConfig` reads the spec and the blueprint defaults at release time. **Binding a release alone** would drop the second half of §13's *Integrity of the gate*, which P6a built and F8 measured as independent. *Changing course* is one predicate.

**Decision 4 (hand-off Q2). The re-escalation baseline is the LAST APPROVED RELEASE.** That means the release whose **latest** decision is `approved`, the newest such decision first, excluding the release in hand. It is **not** whatever production is running. §13 already says the summary describes *"what changed since the last approved release"*, and this makes the gate and the summary compare against the same release. **The two readings differ in three situations**, and this is where:

| Situation | Last approved release (chosen) | What production runs (rejected) |
|---|---|---|
| R2 was approved (a re-escalation) but not yet deployed; R3 is an identical rebuild | R3 compared with R2: nothing changed, so **self-serve** | R3 compared with R1: sensitive, so **approve the same content again** |
| A self-serve R2 *lowered* memory; R3 raises it back to R1's approved level | R3 compared with R1: no increase, so **self-serve** | R3 compared with R2: an increase, so **needless approval** |
| R2 was approved, then abandoned; R3 returns to R1's configuration | R3 compared with R2: sensitive, so **re-escalates (conservative)** | R3 compared with R1: identical, so self-serve |

The chosen reading fails in exactly one direction, the conservative one: an unnecessary approval in the third row. **An administrator's rejection removes a release from the baseline**, which is *Read this first* 5's fix. *Changing course* is one query.

**Decision 5. The sensitive diff compares the frozen PRODUCTION configurations, through one rule over one shape.** `spec/diff.ts` gains a `SensitiveView` covering §7's seven fields, a single rule `sensitiveFieldsBetween` over it, and two adapters:

- `sensitiveViewOfRelease(production: ResolvedConfig, blueprint)` for the gate;
- `sensitiveViewOfSpec(spec)` for `isSensitiveDiff`, which keeps its signature. **This adapter now folds `environments.production.resources` over the top-level `resources`**, so the validate route's report also sees *Read this first* 2's blind spot.

`blueprint` is read from each release's own `AppSpec`. *Rejected:* **a second copy of the seven-field rule for releases**, because two statements of one rule drift ([`ORIENTATION §9`](../ORIENTATION.md)). **Keeping the comparison on `ManifestSpec`**, because a comparison that cannot see a production override is not a gate on production. *Changing course* costs an adapter.

**Decision 6. A release freezes its BUILD's spec, and refuses a build that belongs to another project.** The `createRelease` route reads `build.appSpecId`, and both the route and `createRelease` itself scope the build lookup to the project. That is two independent reads of one condition, which [`ORIENTATION §9`](../ORIENTATION.md) records as what a guard is. **Now the configuration a release freezes is the one §7's build-time attribute check ran against**, and an invalid newest spec can no longer reach `resolveConfig`. *Rejected:* **refusing only an invalid newest spec**, which leaves the mismatch in place. **Fixing `startBuild`'s own pairing** of `body.commitSha` with the newest spec: it is a real looseness (*What this plan does not build*), but it cannot reach a gate once the release takes the build's spec. *Changing course* is one query.

**Decision 7. A release whose latest decision is `rejected` is never deployed to production, sensitive or not.** Deploying it self-serve would override a recorded human decision. The cost is nil for a release nobody rejected.

**Decision 8. The release deployed to production must be the one serving staging.** Otherwise the deploy is refused `409 RELEASE_NOT_STAGED`, carrying the view. **The check runs after the readiness check**, so every refusal P6a built keeps its code. The new code appears only when the checklist is satisfied *for the candidate* and the request names some other release (*Read this first* 8). **The cost is that a rollback goes through staging**: deploy the old release to staging first, then promote it. That is seconds, and it keeps §13's *"production runs the exact digest that staging ran"* true. *Rejected:* **a separate rollback operation**, which nothing in the spec describes. **Evaluating the checklist for `body.releaseId` instead of the candidate**, which would let a release reach production that no person had ever seen work in staging.

**Decision 9. The gate refuses with one of three codes, each carrying the view, each thrown as a LITERAL.**

- `RELEASE_PRODUCTION_GATE_UNAVAILABLE`: a blocking item that an approval cannot fix is unmet. That covers every first-launch refusal as P6a built it, and a rejected release.
- `RELEASE_REESCALATED`: the app has launched, and **only** `admin-approval` is unmet, **for a reason an approval fixes**: a sensitive field changed (or nothing approved exists to compare with), and the release has not been rejected. The view carries that as `reescalated`, derived once.
- `RELEASE_NOT_STAGED`: see Decision 8.

**A client switches on the code** (D23.7), and the three remedies differ: fix the item, ask an administrator, or deploy what staging runs. **Each is thrown by its own `throw new ProductionGateError('<LITERAL>', view)`** (*Read this first* 17), and `api/errors.ts` chooses the hint by code. *Rejected:* one code for all three. The acceptance could then not tell a re-escalation from a lapsed registration, and three of this plan's negative controls would stay green for the wrong reason.

**Decision 10 (hand-off Q3). The stored preview's lifecycle.**

- **Computed on request.** An administrator sends `POST /v1/releases/{releaseId}/approval-preview`, which needs a session and `release:approve`, and **no step-up, because a preview decides nothing**.
- **Stored.** `approval_previews` is insert-only and holds the whole snapshot: the **facts** (deterministic) and the **annotations** (the model's summary, its source, and the reviewer's verdict).
- **Expires after `PREVIEW_TTL_MS = 30 min`.** That covers ten minutes of step-up plus reading time, and keeps *"shown at decision time"* meaning roughly now.
- **Invalidated** whenever the facts, recomputed at decision time, differ. In practice that means the **baseline moved**: another release of the project was approved meanwhile, or the baseline release itself was rejected. A release's own digest and configuration are immutable.
- **Not single-use.** The expiry bounds it, and a second decision naming the same preview makes a true claim about what was shown.
- **Required by approve and by reject**, which refuse `400 APPROVAL_PREVIEW_REQUIRED` without one. A preview of another release is `404 NOT_FOUND`, an expired one `409 APPROVAL_PREVIEW_EXPIRED`, and one whose facts changed `409 APPROVAL_PREVIEW_STALE`.
- **What is compared is the facts. The summary and the verdict never are.** Both are model-written or time-dependent (*Read this first* 13), so the record copies **the preview's**, which is what the administrator was shown. **The approve call never calls the model**, and Task 9 asserts that by counting calls.

*Rejected:* **a preview that is read and then recomputed**, which Rich rejected. **A preview that never expires**, because a stale reading would then be recorded as *"shown at decision time"*. **Single-use previews**, which are a second counter to race for nothing the expiry does not already bound.

**Decision 11 (hand-off Q4). The IAM change request is the registration's own `change_requested` state.** It is not a new table. Migration 0022 adds `requested_attributes` (what the change request asks for) and `registered_at` (when UBC last registered it). **Once a registration has been active once, `registered_attributes`, `acs_url` and `sloUrl` change only on a record whose resulting state is `active`**, and `entity_id` never changes (§9: *"fixed at registration"*). The build-time check (§7, P6a Task 13) is unchanged, and it becomes honest again: it reads `registered_attributes`, which can no longer hold something only requested (*Read this first* 9). **For a launched app, the gate reads the live registration** (Decision 2): an **added** attribute is `unmet` until UBC's registration covers it, and the reason names the change request and its ticket. **A removal re-escalates, because it is a sensitive change, but does not wait on IAM**, subject to Question 2. *Rejected:* **a `change_requests` table**. §9 modelled the registration's submission state *"precisely so that"* the manual and the programmatic case are one transition with a different driver behind it. **Letting a change request carry its own "registered" set**, which is the overwrite *Read this first* 9 measured. *Changing course* costs a table and a join.

**Decision 12 (hand-off Q5). The `code-review` item reads the newest verdict recorded for the candidate.** Previews (Task 9) and approvals both record one. `not_performed` reads as `not_built`, `clean` as `met`, and `findings` as `unmet` naming the count, and the item stays **`blocking: false`**. **With nothing recorded**, the item says so and states D33's coverage limit in words: a reviewer runs when an administrator previews an approval, **never for a self-serve release**. *Rejected:* **running the reviewer at readiness time**: the checklist is read on every page load and on every deploy, and a slow or model-backed reviewer there is an outage waiting to happen. **Leaving the item static**, which is P6a's F7: the first real reviewer would report `clean` beside an item that says `not_built`.

**Decision 13. R4(d): the security dimension is DETERMINISTIC first and model-written second.** `SECURITY_NOTES` is a `Record<SensitiveField, string>`. That type makes a note for an eighth field a `tsc` error rather than something to remember. The facts carry a note for each sensitive field that changed, **so the security reading exists even when the model is down** (Decision 7 of P6a). The model's prompt then gets the changes, the notes, **the reviewer's verdict** and **D33's coverage limit**. It is told to state the verdict as given, and never to imply the code was reviewed unless the verdict says it was. **The reviewer now runs before the summary**, so the summary can carry the verdict. And `summarySource` gains `'no-changes'` for the fixed sentence (*Read this first* 12). *Rejected:* **leaving "security-aware" to the prompt alone**: no test can assert what a model noticed, and R4(g)'s warning applies to the summary exactly as it does to the reviewer.

**Decision 14. The person-only class is one central rule, plus the mint refusal, plus the routes' `requireSession`, each answering with a DIFFERENT code.** `PERSON_ONLY` is named once in `projects/authz.ts` and held by a test that spells the two capabilities out as literals. `assertCapability`'s token branch refuses a person-only capability **after the scope check and before the privileged rule and the grant**, raising `PersonOnlyRefusedError`. That class is not `TokenCapabilityRefusedError`, so the wrapper in `api/contract/route.ts` never records a pending action for it. It is answered **`403 TOKEN_PERSON_ONLY`**. The mint route refuses the two with the existing `400 TOKEN_CAPABILITY_FORBIDDEN`. **Every route that asserts either keeps `requireSession`**, which answers `403 TOKEN_CREDENTIAL_REFUSED` first. **The distinct code is the point**: with a shared one, removing either layer would leave every test green. *Rejected:* **reusing `TOKEN_CREDENTIAL_REFUSED`**, for that reason. **Revoking tokens minted before this plan that hold either capability**, because the central rule refuses them however they were minted, which is D24's own phrase.

**Decision 15 (hand-off Q6). The contract goes from `1.0.0` to `1.1.0` once, in Task 2, and covers P6a's seven additions as well** (*Read this first* 11). Every change P6b makes to the document is **additive**:

- two operations;
- optional request fields;
- response fields, one enum value and one event type;
- and new error codes.

**One change tightens behaviour**: approve and reject now refuse a request that names no preview. That is treated as an additive refusal, **by the precedent P6a set** when step-up began refusing member changes that used to succeed, with no bump. `previewId` is therefore **optional in the schema and required at runtime**, and the operation's description says so. Making it required in the schema would be a breaking document change, which D23.8 answers with a new path prefix. **One bump for the whole plan, because nothing is published between tasks**: the package is `private: true`. *Changing course* is a version string.

**Decision 16. The rehearsal is refused once an app has launched.** `runRehearsal` answers `409 REHEARSAL_LAUNCHED` before it deploys anything. `deployRelease` refuses the `purpose: 'rehearsal'` exemption for a launched project with a plain `Error`, which is unreachable through the API and exists only as defence in depth. **Two reads of one condition, as Decision 6.** §9's run against real Shibboleth for a *changed* registration remains an external-track item.

**Decision 17. The acceptance is `make demo-releases`, on `launch-app`, and it is path-independent.**

- **Its fresh path runs `scripts/demo-production.sh` first**, and says it is doing so.
- **Leg A**, the sensitive change, **writes a canonical manifest**: the starter's, minus `sn`, with an egress host unique to the run. It is therefore sensitive whatever state an earlier run left behind.
- **Leg B**, the self-serve redeploy, follows A, and so meets a baseline A has just established.
- **Leg C**, the IAM change request, first records the registration back to the four attributes, then adds `sn` again.

Order: B is what the hand-off lists first, but it runs after A. **B's self-serve claim needs a known baseline, and only A guarantees one** (*Read this first* 21). **`make demo-production`'s re-use path changes too.** A first launch happens once per project, and no route deletes a project (P6a F5). So on re-use it checks what a launched project durably is, and leaves the rest to `make demo-releases`. **Its step 10 moves into `demo-releases`**, because that step's subject is this plan's. *Rejected:* **a new project on every run**: each project leaves about six containers behind with no route to remove them. **Folding everything into `demo-production`**, because a red run would then not say which half broke (P5b Decision 10's reasoning, for the fourth time).

**Decision 18. The approval's actor has a name.** P6a's F16 recorded that `decidedBy` is a user id and that no operation resolves another person's id. `Approval` gains `decidedByName`, joined from `users.display_name`, and `ApprovalPreview` gains `createdByName`. **P6b shows decisions to owners, who meet this first.**

**Decision 19. A new operation's console caller lands in the same task, or in the same sitting with a `DELIBERATELY_UNCALLED` entry naming its remover.** This is P6a's pattern. **Task 9 parks both preview operations there, and Task 10 removes both in the same sitting.** Everything else lands with its screen.

---

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from the spec, or from a dated measurement.

- **Four gates, all clean before every commit**, from the **repository root**: `pnpm test`, `pnpm lint`, `pnpm typecheck` and `pnpm format:check`. **Run `pnpm test` twice**, because a suite that is not repeatable has a state leak. Never run it with `--filter`: the two differ, and that difference once found a defect. **The baseline is `pnpm test` 1605 passed in 119 files, `pnpm test:docker` 194 in 31, `make doctor` 19/0, `make verify` 55/0, and 21 migrations** (P6a sitting 11, 2026-09-22).
- **`pnpm test:docker`** (~23 min, needs `make up`, **fails rather than skips**) is owed by any change to `runtime/`, `routing/`, `services/`, `build/`, `releases/`, `identity/`, `sso/`, `secrets/`, `projects/`, `blueprints/`, `spec/`, `ai/`, `observability/`, `launch/`, `infra/`, or any `*.docker.test.ts`. **In this plan that is every sitting but the first.** It restarts the edge, dropping every runtime route, truncates the tables and re-registers the platform's SP row. **Restart the control plane afterwards.** It also regenerates seven dead app networks and one volume every time it runs.
- **`pnpm test -- <filter>` does not filter.** Run one file this way instead:
  - a unit file: `pnpm exec vitest run --project unit src/<path>`;
  - a packages file: `pnpm exec vitest run --project packages packages/<pkg>/src/<path>`;
  - a Docker file: `MANIFEST_TEST_DOCKER=1 pnpm exec vitest run --project docker src/<path>`.

  All three run from the repository root. **Never run two Vitest processes at once**: they share a global setup that truncates the tables in both.
- **`pnpm test` TRUNCATES the control plane's tables.** So does a single file, and so does `pnpm contract:write`. **Run anything that needs a demo's rows BEFORE any Vitest run.**
- **Vitest strips types; it does not check them.** `pnpm typecheck` is the only gate that sees a whole class of error. `exactOptionalPropertyTypes` is on, so fix an optional field with a conditional spread, not `x: cond ? v : undefined`.
- **A route change is three files, in order**: the definition, then `pnpm contract:write`, then `pnpm contract:generate`. **`packages/contract/openapi.json` is generated; never edit it.** A route that is not in `ROUTE_DEFINITIONS` exists nowhere.
- **A migration is `pnpm --filter @manifest/control-plane db:generate`, then READ what it wrote.** Drizzle generates the `audit.events` `CHECK` rewrite itself whenever `db/schema.ts`'s literal changes. **Appending that constraint by hand makes the migration fail to apply** (P6a `[M10]`). What drizzle cannot express, such as a data backfill, is appended by hand, and the task says so.
- **EVERY REFUSAL ASSERTS ITS CODE, NEVER ITS STATUS ALONE.** In this plan, `409` means five different things: `RELEASE_PRODUCTION_GATE_UNAVAILABLE`, `RELEASE_REESCALATED`, `RELEASE_NOT_STAGED`, `APPROVAL_PREVIEW_STALE` and `APPROVAL_PREVIEW_EXPIRED`. `403` means six: `FORBIDDEN`, `STEP_UP_REQUIRED`, `TOKEN_CREDENTIAL_REFUSED`, `TOKEN_PERSON_ONLY`, `TOKEN_ACTION_PENDING` and `TOKEN_ACTION_REJECTED`. Use `refusal()` from `api/testing.ts`.
- **A REFUSAL TEST NEEDS A POSITIVE CONTROL IN THE SAME FILE**, and so does a negative claim. Every *"is self-serve"* and every *"is not blocked"* is true of a platform that blocks nothing (P5c F16; P5b sitting 6).
- **Never accept a check you have not watched fail.** Every task ends by breaking what it built, **after committing the task**, and naming the test that goes red with its assertion quoted. `git checkout <path>` restores from the index, so an uncommitted task is destroyed by the restore rather than by the experiment. **Predict what turns red before you run it**, because a wrong prediction is itself a finding (P5b sitting 9, F1). **A control that stays green is a question to chase, not a result**: P6a's worst defect, F6, was found only by chasing one.
- **Every task names its CALLER.** A module with no call site is not built, and this project has shipped one five times.
- **Ask before `sudo`.** No task in this plan needs it.
- **Never edit the spec.** It is *Approved design*. This plan's *Spec actions* section proposes one change, and **it may not be applied until Rich approves it**. A spec action is not finished when the spec changes: the four shared HTML pages restate it.
- **Never touch Laravel Valet.** These four containers must survive: `docker-simple-saml-saml-idp-1`, `qdrant-local-dev`, `mongodb` and `mongo-express`. **`caddy-data` must never be destroyed.**
- **macOS ships bash 3.2 and a BSD userland**: no associative arrays, no `mapfile`, no `xargs -r`, no `readlink -f`, and `sed -i ''`.
- **`request.log` writes nothing** under `Fastify({ logger: false })`. Use `console.error`, and never with a secret, a token, a cookie or an assertion in the message.
- **A swallowed `.catch(() => undefined)` is this codebase's most productive defect.**
- **`.map(fn)` passes the ARRAY INDEX as its second argument** (P5b sitting 7). A mapper that grows an optional `now` or `actor` parameter silently receives `0`.
- **Probing an address from Node**: pass `agent: false`, because a pooled socket answers from the wrong address (P6a F2). A custom `lookup` must handle the `{ all: true }` form, because Node 24's `net` asks for it (P6a F1).
- **The edge's wildcard answers `200` for any name.** On the public listener it answers `200` with an **empty body**. Assert `X-Manifest-Instance` or the body, never a status.
- **You cannot test "a rebuild is a new digest" by rebuilding**: the builder is reproducible (P6a F3). A test or demo that needs a new digest must commit a change.
- **COMMIT ON `main`, AND STAGE YOUR OWN PATHS BY NAME**, meaning files, never directories. **Where a commit step says `<each path in Files, by name>`, it means exactly that**: every file the task's **Files** list names, spelled out, plus the generated migration and the `drizzle/meta/` files `git status` shows for it. **Never use `git add -A`, `git add .`, `git commit -a` or `git checkout .`.** Other sessions commit on `main` while you work, so run `git status` before each commit and account for every path. End every commit message with the attribution lines the session's own system reminder gives.
- **`$SCRATCH` IS YOUR SESSION'S SCRATCHPAD AND YOU MUST SET IT.** An unset `$SCRATCH` turns `> "$SCRATCH/x"` into `> /x`, silently.
  ```bash
  export SCRATCH=<your session's scratchpad directory>
  [ -d "$SCRATCH" ] || { echo 'SCRATCH is not a directory'; exit 1; }
  ```
- **Leave the machine as you found it.** Run `./scripts/snapshot-machine.sh` at the start of a sitting and at the end, and `diff` the two. **At every sitting's close, run `bash scripts/dead-app-resources.sh` and `bash scripts/litellm-orphans.sh` bare, then TRY each with `--apply` yourself.** Hand the output to Rich only if you are refused.

---

## Review Focus

**The five failure modes the spec implies and no task's happy path exercises, most likely first.** Each has its test added to the task that owns the code.

1. **Two administrators, or one administrator with two tabs.** A preview of R2 is taken; R3 of the same project is then approved; R2 is approved naming the first preview. The baseline has moved, so the facts differ. **The expected behaviour is `409 APPROVAL_PREVIEW_STALE` and a console that offers *preview again*, not a dead end.** Owned by Task 9's *refuses a stale preview after another release was approved*, and by Task 10's handling of the stale refusal.
2. **A launched app whose staging is serving nothing** (a failed instance, or one retired). The self-serve deploy must be refused, and the reason must be that nothing is serving staging, not a first-launch item. Owned by Task 6's *a launched app with nothing in staging is refused with the scans reason*.
3. **Deploying the release production already runs, again.** It is self-serve with no approval, and it records **no second launch**. Owned by Task 4's *records the launch once* and Task 5's *redeploys the serving release self-serve*.
4. **A release an administrator rejected, even though it is not sensitive.** It is never deployable. Owned by Task 5's and Task 6's *rejected* cases.
5. **An agent asking to promote a launched app's non-sensitive release.** It is still `TOKEN_ACTION_PENDING`. A person confirms it, stepping up, and then it deploys **with no administrator**. Owned by Task 6's *an agent's self-serve promotion is still a question a person answers*.

---

## File Structure

```
packages/control-plane/drizzle/0021_*.sql   NEW (T4): projects.launched_at; the audit.events CHECK (+ project.launched)
packages/control-plane/drizzle/0022_*.sql   NEW (T7): iam_registrations.requested_attributes, .registered_at, + a backfill line
packages/control-plane/drizzle/0023_*.sql   NEW (T9): approval_previews; approvals.preview_id
packages/control-plane/src/
├── db/schema.ts                  MODIFIED (T4, T7, T8, T9): the columns, the table, DiffSnapshot's new optional keys
├── spec/diff.ts                  MODIFIED (T3, T8): SensitiveView, sensitiveFieldsBetween, two adapters; SECURITY_NOTES
├── projects/authz.ts             MODIFIED (T2): PERSON_ONLY, isPersonOnly, PersonOnlyRefusedError, the central refusal
├── projects/person-only.test.ts  NEW (T2): the literal list, disjointness, the central refusal
├── releases/
│   ├── approval.ts               MODIFIED (T3, T5, T8, T9): lastApprovedReleaseFor by LATEST decision; sensitiveChangeOf;
│   │                             approvalRequirementFor; productionApprovalFor; the facts/annotations split; the verdict first
│   ├── launched.ts               NEW (T4): launchedAt, recordLaunch
│   ├── preview.ts                NEW (T9): PREVIEW_TTL_MS, recordPreview, previewFor, assertPreviewCurrent, sameFacts
│   ├── release.ts                MODIFIED (T3, T4, T5): createRelease scoped; recordLaunch's call; D9.2's half of the check
│   └── summary.ts                MODIFIED (T8): the security framing, the verdict, the coverage limit; 'no-changes'
├── launch/
│   ├── readiness.ts              MODIFIED (T6, T7, T8): the launched branch; the live registration item; code-review reads
│   ├── gate.ts                   MODIFIED (T6): assertLaunchable(db, projectId, releaseId) — three literal codes
│   ├── rehearsal.ts              MODIFIED (T4): REHEARSAL_LAUNCHED
│   └── records.ts                MODIFIED (T7): registered changes only on `active`; requested; registered_at
├── observability/events.ts, event-schemas.ts   MODIFIED (T4): project.launched
├── api/
│   ├── errors.ts                 MODIFIED (T2, T6): TOKEN_PERSON_ONLY; the gate's hint by code
│   ├── error-codes.ts            MODIFIED (T2, T4, T6, T9): every new code, once
│   ├── authz-contract.ts         MODIFIED (T2, T9): the stale comment; two rows per new route
│   ├── testing.ts                MODIFIED (T4): builtProject, releasedProject, launchedProject, commitManifest
│   ├── contract/document.ts      MODIFIED (T2): CONTRACT_VERSION 1.1.0
│   ├── routes/tokens.ts          MODIFIED (T2): the person-only mint refusal
│   ├── routes/releases.ts        MODIFIED (T3, T6, T9): the build's spec; the gate's new signature; previews; decide()
│   ├── routes/launch.ts          MODIFIED (T4, T6, T7): REHEARSAL_LAUNCHED; descriptions; requestedAttributes
│   ├── routes/project-reads.ts   MODIFIED (T5): the validate route's description (reported here, enforced at deploy)
│   ├── representations/          MODIFIED (T4, T6, T7, T8, T9): Project, LaunchReadiness, IamRegistration, ApprovalDiff,
│   │                             Approval, ApprovalPreview, the two requests
│   ├── person-only.test.ts       NEW (T2): a synthetic route, a real token, no pending action
│   └── subsequent-releases.test.ts NEW (T5, T6, T7): D9.2 end to end in the unit tier
packages/contract/package.json     MODIFIED (T2): 1.1.0
packages/console/src/
├── api.ts                        MODIFIED (T9, T10): the preview functions; previewId on approve/reject
├── screens/tokens.tsx            MODIFIED (T2): the person-only two, disabled with a reason
├── screens/launch.tsx, deploy.tsx MODIFIED (T6): launched; the re-escalation refusal
├── screens/records.tsx           MODIFIED (T7): the change request
├── screens/approvals.tsx         MODIFIED (T8, T10): security notes; THE PREVIEW BEFORE THE DECISION
└── coverage.test.ts              MODIFIED (T9, T10): parked, then emptied
packages/mock/src/fixtures.ts, server.ts   MODIFIED (T4, T6, T7, T8, T9): every changed shape; two answers
packages/journey/src/production.ts         MODIFIED (T4, T6, T9): re-use path; step 10 moved; step 7 previews
packages/journey/src/releases.ts           NEW (T11): the acceptance, through @manifest/contract alone
scripts/demo-releases.sh                   NEW (T11)
scripts/offline-acceptance.sh, ci-acceptance.sh   MODIFIED (T11; ci-acceptance's EXPECT_ lines by every task that moves them)
Makefile                                    MODIFIED (T11): demo-releases
docs/superpowers/RUNBOOK.md, WALKTHROUGH.md MODIFIED (T11)
docs/superpowers/spikes/p6b-baseline/       NEW (T1)
```

---

## The fixtures and helpers every snippet below uses

**Test users** (`identity/testing.ts`'s `TEST_USERS`): `bio_prof` (a member who owns the fixture project), `unrelated_user`, and `platform_admin`. **Demo users** (the Manifest IdP): `instructor` / `instructor` (`ins000001`) and `operator` / `operator` (`opr000001`). `operator` becomes an administrator through `scripts/admin-grant.sh`, and **a role reaches a person only when they sign in again.**

**In the control plane:**

- `resetDatabase()` (`db/testing.ts`); `testDeps()`, `loginAs(deps, puid, { steppedUp? })`, `mutationHeaders(deps)`, `withProjectServer(fn)`, `sessionFor(ctx, puid, role?, { steppedUp? })` and **`refusal(res)`**, which returns `{ status, code }` together (`api/testing.ts`).
- `mintTestToken(db, {...})` (`tokens/testing.ts`) **writes a token row directly**, so it can hold a capability the mint route would refuse. That is what a token minted *before* this plan looks like. **A test that means to exercise the mint route must mint through the route.**
- `stepUpSession(session)` (`identity/step-up.ts:40`) and `loginAs(…, { steppedUp: true })` give a stepped-up actor without a SAML round trip.
- **Added by Task 4 to `api/testing.ts`**, moved out of `api/delivery.test.ts` rather than copied:
  - `builtProject(slug, options?)`, `releasedProject(slug, options?)`;
  - **`launchedProject(slug)`**: released, deployed to staging, a PIA recorded, approved (through a preview from Task 9 onwards), and deployed to production by a stepped-up owner. It returns `{ app, deps, cookies, project, release, staging, production, admin, owner }`, where `admin` and `owner` are stepped-up cookies;
  - **`commitManifest(ctx, yamlLines, message)`**: commits `manifest.yaml` through `deps.source.commitFiles` and validates it through `POST …/spec`, asserting `valid: true`.

**In the demos and scripts:**

- **`idp_login <sp-jar> <idp-jar> <url> <user> <pass> <acs> <ca>`** (`infra/lib/idp-login.sh`) is the three-hop CWL walk, and **`/auth/step-up` is driven through it exactly as `/auth/login` is.** Use **one jar per identity**: a shared IdP jar signs the second person in as the first.
- `scripts/lib/api.sh` (`api`, `field`, `clear_orphan_repository`, `wait_for_build`); `scripts/lib/check.sh`; `scripts/lib/redeploy-loop.mjs` (P4c's request loop, which classifies by body and by `X-Manifest-Instance`).
- **A step-up is a claim on a stateless cookie, so the cookie from before it is still a valid, un-stepped session.** `scripts/demo-production.sh` keeps both cookies for each person, which is how one run proves both sides of a refusal.
- **An app's repository is a bare repository at `.manifest/repos/<slug>.git`.** A demo commits to it with `git` directly. That is outside the contract, as signing in is (D23.8).

**THE TWO TRAPS THAT WILL COST A SITTING IF NOT DISARMED:**

1. **A production deploy needs the candidate SERVING STAGING.** A `pnpm test` between the staging deploy and the production one truncates the project, and the checklist then reads `candidateReleaseId: null`. **Order every sitting so that no Vitest run sits between them.**
2. **`POST /v1/projects/{id}/members` and every read of `users` know only people who have signed in to MANIFEST**, and `pnpm test` empties that table. Signing in to a deployed app does not count (P5c F14).

---

## Task 1: Measure what this plan rests on — before any of it is built

**ALONE, AND FIRST.** This task writes no feature code. Its output is a findings file and, wherever a measurement contradicts this plan, an **`[M<n>]` correction block at the top of the task it contradicts**.

**Fifteen measurements.** Two are of the machine (`[M1]`, `[M2]`). Eleven test the premises marked *(T1: M<n>)* in *Read this first* (`[M3]` to `[M13]`). `[M14]` asks whether P4c's request loop can watch the public listener, and `[M15]` lists the existing tests this plan will turn red. **Six of them are premises this plan would otherwise have built on**, and every one was found by reading the code while this plan was written (`[M3]`, `[M5]`, `[M6]`, `[M7]`, `[M8]`, `[M9]`). **Reading is not measuring.** P6a's sitting 1 corrected three of its own plan's *Read this first* items, and one of those three was about the very kind of claim these are.

**Files:**
- Create: `docs/superpowers/spikes/p6b-baseline/README.md` — one section per measurement: what was asked, the command, the RAW answer, what it means for this plan, and (where it moves something) the task and the correction
- Create: `docs/superpowers/spikes/p6b-baseline/results-task1-<date>.txt` — every command and its untrimmed output
- Modify: this plan — `[M<n>]` correction blocks; the sittings table if a boundary moves
- Create, then DELETE in the same step: `packages/control-plane/src/spec/m3-probe.test.ts`, `packages/control-plane/src/releases/m5-probe.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: the four gate numbers as they stand, a yes or no on M3 to M15, and `launch-app` launched twice over (two approved releases), which is the state Tasks 6 and 11 start from.

- [ ] **Step 1: `[M1]` — the state this plan starts from, queried BEFORE anything truncates it**

**Before Step 2, not after.** P6a's own `[M1]` found Step 1 destroying the state Step 2 existed to measure, because `pnpm test` truncates the tables.

```bash
cd /Users/rich/Developer/manifest
export SCRATCH=<your session's scratchpad directory>
[ -d "$SCRATCH" ] || { echo 'SCRATCH is not a directory'; exit 1; }
git log --oneline -5 && git status --short          # other sessions commit on main — note what is there
lsof -nP -iTCP:7100 -sTCP:LISTEN || echo 'NOTHING ON 7100 — the control plane is DOWN'
ifconfig lo0 | grep 'inet '                          # expect 127.0.0.1, 127.0.0.2 AND 127.0.0.3 (P6a F13)
docker ps --format '{{.Names}}\t{{.Status}}' | sort
Q() { docker exec manifest-postgres psql -U manifest -d manifest_control -Atc "$1"; }
for t in projects releases approvals iam_registrations rehearsals users; do echo "$t $(Q "select count(*) from $t")"; done
Q "select count(*) from drizzle.__drizzle_migrations" || Q "select count(*) from __drizzle_migrations"
```

**Expect the database EMPTY**, because P6a's sitting 11 closed after a Docker-tier run, **and 21 migrations**. If `launch-app` exists, you are on a machine some other session touched; record it and carry on.

- [ ] **Step 2: `[M2]` — the baseline, and the versions**

```bash
./scripts/snapshot-machine.sh > "$SCRATCH/before.txt"
make up && make doctor && make verify
pnpm test && pnpm test
pnpm lint && pnpm typecheck && pnpm format:check
node --version; pnpm --version; docker version --format '{{.Server.Version}}'; sw_vers -productVersion
```

**Expect ORIENTATION §2's box exactly: 1605 in 119, 19/0, 55/0.** A different number here is signal *before* you write any code.

- [ ] **Step 3: `[M11]` — the contract as it stands**

```bash
jq -r '.info.version' packages/contract/openapi.json
jq '[.paths[][] | objects | .operationId] | length' packages/contract/openapi.json
git log --oneline -3 -- packages/control-plane/src/api/contract/document.ts packages/contract/package.json
git log --oneline 58107aa..HEAD -- packages/contract/openapi.json | wc -l
```

**Predict: `1.0.0`, 41 operations, and the version last touched in P5c's `58107aa`, although the document changed many times after it.** If so, Decision 15 stands: `1.1.0`, once, in Task 2, covering P6a's additions too.

- [ ] **Step 4: `[M3]` — `isSensitiveDiff` has one caller, and cannot see a production override**

```bash
grep -rn 'isSensitiveDiff' packages/control-plane/src | grep -v '\.test\.ts' | grep -v 'spec/diff.ts\|spec/index.ts'
# Expect ONE: api/routes/project-reads.ts, the validate route — a report, not a gate.
```

Then write a throwaway probe, run it alone, record the output and **delete it in the same step**:

```ts
// packages/control-plane/src/spec/m3-probe.test.ts — DELETED after this step
import { expect, it } from 'vitest'
import { manifestSchema } from './schema.js'
import { isSensitiveDiff } from './diff.js'

const base = {
  manifest: 1, name: 'probe-app', blueprint: 'node-ts-mongo@1',
  runtime: { port: 3000 },
  environments: { production: { resources: { memory: '512Mi' } } },
}
it('[M3] a raised PRODUCTION override', () => {
  const before = manifestSchema.parse(base)
  const after = manifestSchema.parse({ ...base, environments: { production: { resources: { memory: '8Gi' } } } })
  console.log('[M3] override raised 512Mi -> 8Gi:', JSON.stringify(isSensitiveDiff(before, after)))
})
it('[M3] the positive control: a raised TOP-LEVEL limit', () => {
  const before = manifestSchema.parse({ ...base, resources: { memory: '512Mi' } })
  const after = manifestSchema.parse({ ...base, resources: { memory: '8Gi' } })
  const answer = isSensitiveDiff(before, after)
  console.log('[M3] top-level raised:', JSON.stringify(answer))
  expect(answer.fields).toContain('resources')   // the probe CAN see a true
})
```

```bash
pnpm exec vitest run --project unit src/spec/m3-probe.test.ts 2>&1 | tee -a "$SCRATCH/m3.txt"
rm packages/control-plane/src/spec/m3-probe.test.ts
```

**Predict: the override prints `{"sensitive":false,"fields":[]}` and the top-level change prints `fields:["resources"]`.** If the override *is* seen, Decision 5's premise is false. Task 3 then keeps its release adapter, but drops the claim that it closes a blind spot.

- [ ] **Step 5: `[M5]` — the baseline counts a release that was approved and then rejected**

Copy `releases/approval.test.ts`'s own setup into a throwaway probe: its `beforeAll`, its release fixture, and its stepped-up `platform_admin` login at line 73. Then approve a release and reject the same release, both through the routes, and ask:

```ts
// packages/control-plane/src/releases/m5-probe.test.ts — DELETED after this step
// …approval.test.ts's setup, verbatim…
it('[M5] approved, then rejected', async () => {
  // approve R, then reject R (reason: 'withdrawn'), both 201, through the routes
  const baseline = await lastApprovedReleaseFor(deps.db, projectId, randomUUID())
  console.log('[M5] baseline after approve-then-reject:', baseline?.id === releaseId ? 'THE REJECTED RELEASE' : String(baseline?.id))
})
it('[M5] the positive control: approved only', async () => { /* a second project: approve only — expect its id */ })
```

**Predict: `THE REJECTED RELEASE`.** Delete the probe, and record which of `approval.test.ts`'s helpers it needed. Task 3 moves the one it needs into `api/testing.ts` rather than copying it a third time.

- [ ] **Step 6: `[M4]`, `[M6]` (reading half) and `[M15]` — what reads what**

```bash
# M4: who reads the MANIFEST's `blueprint:` rather than project.blueprintRef?
grep -rn '\.blueprint\b' packages/control-plane/src --include='*.ts' | grep -v '\.test\.ts' | grep -v 'blueprintRef\|blueprints\.\|\.blueprints'
grep -n 'blueprint' packages/control-plane/src/spec/policy.ts
# M6: which spec does a release freeze, and is the build scoped to the project?
sed -n 170,215p packages/control-plane/src/api/routes/releases.ts
sed -n 140,163p packages/control-plane/src/releases/release.ts
# M15: which tests rely on "a release takes the NEWEST spec", and which launch a project and then expect first-launch
# behaviour from it — Tasks 3 and 4 predict their reds from this list.
# Test files that create a release AND validate a spec — the ones that could validate a newer spec between
# a build and its release. Read each hit; list the cases that would now freeze the BUILD's spec instead.
grep -rln '/releases' packages/control-plane/src --include='*.test.ts' | xargs grep -ln '/spec'
grep -n "it('" packages/control-plane/src/releases/production.docker.test.ts
grep -n "production" packages/control-plane/src/api/delivery.test.ts | grep "it('" 
```

**Predict: only `spec/diff.ts` reads `.blueprint`. `policy.ts` has no blueprint rule. The route selects the newest spec. `createRelease` has no `projectId` condition on the build.** Record the file list M15 prints; it is Tasks 3 and 4's list of expected reds.

- [ ] **Step 7: Start the control plane, and put `launch-app` into production — the fresh path**

README's *Running the control plane* has the commands. Check that the boot line says `{"driver":"docker"}` and names the right origin.

```bash
make demo-production 2>&1 | tee "$SCRATCH/demo-production-A.txt"      # fresh: pnpm test emptied the database
```

**Expect three phases, each ending with *every check passed*.** Record the timings and the digest printed at step 2. **Do not run any Vitest process from here until Step 16**, because `pnpm test` would truncate the state the next eight steps measure.

- [ ] **Step 8: `[M13]` — a person-only capability can be minted today, and only `requireSession` refuses it**

Set up the helpers for this step and every later one:

```bash
. infra/lib/common.sh; . infra/lib/idp-login.sh
CA="$PWD/$CA_FILE"; O=https://console.manifest.internal
OP="$SCRATCH/op.jar"; OPI="$SCRATCH/op-idp.jar"; IN="$SCRATCH/in.jar"; INI="$SCRATCH/in-idp.jar"
rm -f "$OP" "$OPI" "$IN" "$INI"
idp_login "$OP" "$OPI" "$O/auth/login" operator operator "$O/auth/saml/callback" "$CA"   # admin since Step 7
idp_login "$IN" "$INI" "$O/auth/login" instructor instructor "$O/auth/saml/callback" "$CA"
api_as() { local jar="$1" method="$2" path="$3" body="${4:-}"
  curl -sS --cacert "$CA" -b "$jar" -c "$jar" -H "Origin: $O" -H "Idempotency-Key: $(uuidgen)" \
    -H 'content-type: application/json' -X "$method" ${body:+-d "$body"} "$O$path"; }
PID=$(api_as "$IN" GET /v1/projects | jq -r '.[] | select(.slug=="launch-app") | .id')
```

Then mint, use and revoke:

```bash
for caps in '["project:read","release:approve"]' '["project:read","launch:record"]' '["release:promote"]'; do
  api_as "$OP" POST "/v1/projects/$PID/tokens" "{\"name\":\"m13\",\"capabilities\":$caps,\"expiresInDays\":1}" \
    | jq -c '{status: (.error.code // "201"), id: .token.id, secret: (.secret != null)}'
done
# Use the release:approve token on the approve route, then revoke both tokens that were minted (DELETE /v1/tokens/{id}).
```

**Predict: `release:approve` and `launch:record` are MINTED (201), `release:promote` is refused `400 TOKEN_CAPABILITY_FORBIDDEN` (the positive control), and the approve route answers the token `403 TOKEN_CREDENTIAL_REFUSED`.** That is the gap Task 2 closes: the refusal comes from the route, never from a central rule.

- [ ] **Step 9: `[M10]` — the recorded ACS is compared with nothing**

Re-record the registration **`active` → `active`**, which is an edit rather than an arrow, with the entityID and attributes unchanged and `acsUrl: https://wrong.example/acs`. Read the checklist's `iam-registration` item, then restore the right ACS and read it again.

**Predict: `met` both times.** Record the exact `why`.

- [ ] **Step 10: `[M9]` — recording a change request overwrites what UBC registered**

Record `active → change_requested` with `registeredAttributes` set to the **four** attributes without `sn` (as an administrator filing "please drop `sn`" would type it). Then read `GET …/launch-records`. Restore along the arrows: `change_requested → submitted → active`, with all five attributes.

**Predict: `registeredAttributes` reads four while the state is `change_requested`.** That is the record claiming UBC registered something it has only been asked for. **Also record** what `make demo-production`'s journey would now build, by reading `releases/build.ts:320-340` against those four: the next build of `launch-app` would **fail**, although UBC's real registration never changed.

- [ ] **Step 11: `make demo-production` again — the re-use path, which leaves two approved releases**

```bash
make demo-production 2>&1 | tee "$SCRATCH/demo-production-B.txt"
```

**Expect green, with `unmet [admin-approval]` at step 3 (P6a F4).** Record the two releases' ids and their latest decisions. The first run's is `R1` and this run's is `R2`, which is now in production and is the candidate.

```bash
api_as "$IN" GET "/v1/projects/$PID/releases" | jq -r '.[] | .createdAt + "  " + .id'     # newest first
for r in $(api_as "$IN" GET "/v1/projects/$PID/releases" | jq -r '.[].id'); do
  echo "$r $(api_as "$IN" GET "/v1/releases/$r/approval" | jq -r '.decision // .error.code')"; done
R1=<the older release whose decision is approved>; R2=<the newer one>
```

- [ ] **Step 12: `[M8]` and `[M14]` — the gate evaluates R2 and deploys R1; and the loop can watch the public listener**

```bash
# A stepped-up owner: /auth/step-up through the same walk (P6a's pattern)
idp_login "$IN" "$INI" "$O/auth/step-up" instructor instructor "$O/auth/saml/callback" "$CA"
PROD=$(api_as "$IN" GET "/v1/projects/$PID/environments" | jq -r '.[] | select(.kind=="production") | .id')
NODE_EXTRA_CA_CERTS="$CA" node scripts/lib/redeploy-loop.mjs https://launch-app.manifest.internal/healthz "$SCRATCH/m14.ndjson" 200 "$SCRATCH/m14.stop" &
sleep 3
api_as "$IN" POST "/v1/environments/$PROD/deploy" "{\"releaseId\":\"$R1\"}" | jq -c '{code: .error.code, state, releaseId}'
sleep 3; touch "$SCRATCH/m14.stop"; wait
jq -r .cls "$SCRATCH/m14.ndjson" | sort | uniq -c
jq -r .instance "$SCRATCH/m14.ndjson" | uniq -c
```

**Predict: `200`, `state: healthy`, `releaseId: R1`. The checklist evaluated R2 (the candidate, serving staging), and production now runs R1.** The loop should read **only `app` (and perhaps one `reset`)**, with the instance changing once, which is P4c's zero-downtime property on the public listener. **Positive control:** the loop's first records show the *existing* production instance, so the loop can see the app at all. Then restore: redeploy **R2** to production, and predict `200`.

- [ ] **Step 13: `[M6]` (driven half) and `[M12]` — a release takes the newest spec; the summary differs between two calls**

In a clone of `.manifest/repos/launch-app.git`:

1. **Build HEAD first** (`POST …/builds`, `{}`) and wait for the build. Call it B1, with spec S1.
2. **Commit** an `egress:` block, `allow: [m6.example.org]`, push it, and `POST …/spec` (predict `valid: true` and `sensitiveDiff.fields: ["egress.allow"]`).
3. **Positive control first:** release a build *made after* S2. Its `appSpecId` equals the build's.
4. **Then `POST …/releases {buildId: B1}`** and read `appSpecId` against B1's, and `config.production.egressAllow`.
5. **Deploy the egress release from step 4 to STAGING**, and record the state and the egress proxy's rendered allowlist. **This is Task 11 leg A's premise**, that a staging deploy with a new egress host is healthy. Predict `healthy`; if it is not, leg A needs a different sensitive field, and the correction block goes on Task 11.
6. **Commit an invalid manifest** (`runtime: { port: "x" }`), validate it (predict `valid: false`), and release B1 again.
7. **The cross-project half:** create a second throwaway project as the instructor, or use `journey-app` if one exists, then `POST /v1/projects/<other>/releases {buildId: B1}`.
8. **`[M12]`:** step the operator up (`idp_login "$OP" "$OPI" "$O/auth/step-up" operator operator "$O/auth/saml/callback" "$CA"`), then **reject the egress release twice**, with two reasons, and read both rows' `diff_snapshot->>'summary'`. Rejecting twice leaves the baseline untouched.
9. **Restore:** push a commit whose `manifest.yaml` is byte-identical to the original (`git diff <original> HEAD -- manifest.yaml` prints nothing), and validate it.

**Predict:** step 4 gives the release **S2's** `appSpecId` and `egressAllow: ["m6.example.org"]`. Step 5 is **healthy**. Step 6 answers **`500 INTERNAL`**, because `resolveConfig` meets `parsed: {}`. Step 7 answers **`201`**, a release in one project holding another project's image. Step 8 gives **two different summaries** for one list of changes. **If the two summaries are identical, record it and change nothing**: identical once is not identical always, and Decision 10 compares facts because nothing guarantees the words.

- [ ] **Step 14: `[M4]` (driven half) — the manifest's `blueprint:` validates, and changes nothing**

Commit `blueprint: node-ts-mongo@9`, validate it, and restore as in Step 13.

**Predict: `valid: true`, `sensitiveDiff.fields: ["blueprint"]`.** Nothing would build against `@9`, because `startBuild` reads `project.blueprintRef`. Record it; it is *What this plan does not build*'s first entry.

- [ ] **Step 15: `[M7]` — a rehearsal on a launched app replaces live production with an unapproved release. LAST, because it disturbs production**

1. Commit a code-only change, a comment appended to `server.js`, so the digest changes. Then build, release as `R3`, and deploy `R3` to **staging**.
2. Read production's current instance: `GET …/environments/$PROD`, then `.instance.id` and `.instance.releaseId`.
3. As the operator, `POST /v1/projects/$PID/rehearsal`.
4. Read production's instance again, and `curl --resolve launch-app.manifest.internal:443:127.0.0.3 -sI` for `X-Manifest-Instance`.
5. `Q "select count(*) from approvals where release_id = '$R3'"`.

**Predict: the rehearsal answers `200`, production's instance is now an instance of `R3`, and `R3` has NO approval.** A released, unapproved digest is serving students on the public listener, with no record of any decision. **Restore:** deploy R2 to staging, then to production (stepped-up owner, `200`), and push a revert of the `server.js` change so HEAD's tree matches the original.

- [ ] **Step 16: Write the findings, correct the plan, leave the machine as you found it**

```bash
mkdir -p docs/superpowers/spikes/p6b-baseline
./scripts/snapshot-machine.sh > "$SCRATCH/after.txt"; diff "$SCRATCH/before.txt" "$SCRATCH/after.txt"
bash scripts/dead-app-resources.sh && bash scripts/litellm-orphans.sh     # bare, then TRY --apply yourself
git status                                  # the spike directory and this plan; the probes are GONE
```

**A measurement that contradicts a later task gets an `[M<n>]` correction block at the top of that task.** Say what the task said, what the measurement found, and what the task now does. **If a boundary moves, re-cut the sittings table and say so.** Stop the control plane at the close unless the next sitting will want it; P6a's sitting 11 closed with nothing listening on 7100.

- [ ] **Step 17: Commit**

```bash
git add docs/superpowers/spikes/p6b-baseline/README.md docs/superpowers/spikes/p6b-baseline/results-task1-*.txt \
        docs/superpowers/plans/2026-09-22-p6b-subsequent-releases.md
git commit -m "docs(p6b): sitting 1 — the measurements this plan rests on"
```

**Negative controls for this task.** A measurement task's controls are the positive halves of its own measurements:

| | Control | What it proves | Predicted |
|---|---|---|---|
| a | `[M3]`'s top-level limit raised | that the probe can see a `true`, so a `false` for the override means something | **`fields: ["resources"]`** |
| b | `[M5]`'s approve-only release | that the probe returns a correct baseline when there is one | **that release's id** |
| c | `[M13]`'s `release:promote` mint | that the mint route refuses D24's four, so *minted* is about the person-only two specifically | **`400 TOKEN_CAPABILITY_FORBIDDEN`** |
| d | `[M14]`'s first records | that the loop sees the app before the deploy, so all `app` is not an empty loop | **`app` with the old instance id** |
| e | `[M6]`'s release of a build made after S2 | that a release *can* carry its build's spec, so step 4's mismatch is about ordering | **`appSpecId` equal to the build's** |

---

## Task 2: The person-only class — one central refusal, a mint refusal, and a code of its own

**Rich decided this on 2026-09-22, and §20 and D24's row have said it since that day.** Today the code states it nowhere (*Read this first* 14): each route guards its own capability with `requireSession`, and the mint route will issue a token holding either one. **This task makes it one rule, and it gives the rule a code that no other layer answers with**, so that removing either layer turns a test red.

**Files:**
- Modify: `packages/control-plane/src/projects/authz.ts` — `PERSON_ONLY`, `isPersonOnly`, `PersonOnlyRefusedError`, the token branch of `assertCapability`
- Modify: `packages/control-plane/src/projects/index.ts` — export them
- Create: `packages/control-plane/src/projects/person-only.test.ts`
- Modify: `packages/control-plane/src/projects/privileged.test.ts` — the `launch:record` case says *person-only*, not *mintable*
- Modify: `packages/control-plane/src/api/routes/tokens.ts` — the mint refusal, and the route's description
- Modify: `packages/control-plane/src/api/errors.ts` — `PersonOnlyRefusedError` → `403 TOKEN_PERSON_ONLY`
- Modify: `packages/control-plane/src/api/error-codes.ts` — `TOKEN_PERSON_ONLY`
- Create: `packages/control-plane/src/api/person-only.test.ts` — a synthetic route, a real token, no pending action
- Modify: `packages/control-plane/src/api/authz-contract.ts` — the stale comment at ~1470 (*"it is mintable"*); no expectation moves
- Modify: `packages/control-plane/src/api/contract/document.ts` and `packages/contract/package.json` — **`1.1.0`** (Decision 15)
- Modify: `packages/console/src/screens/tokens.tsx` — the two, disabled with the reason
- Regenerate: `packages/contract/openapi.json`, `packages/contract/src/schema.d.ts`

**Interfaces:**
- Consumes: `assertCapability`, `TokenCapabilityRefusedError`, `api/contract/route.ts`'s wrapper (unchanged: it catches only `TokenCapabilityRefusedError`).
- Produces: `PERSON_ONLY: ReadonlySet<Capability>`, `isPersonOnly(c: PrivilegedCapability): boolean`, `class PersonOnlyRefusedError { capability; projectId; tokenId }`, and the code `TOKEN_PERSON_ONLY` (403). **Its caller is `assertCapability`**, which every project-scoped route already goes through.

- [ ] **Step 1: The failing tests — the list as literals, disjoint from D24's four, and the central refusal**

```ts
// packages/control-plane/src/projects/person-only.test.ts
import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  assertCapability,
  isPersonOnly,
  PERSON_ONLY,
  PersonOnlyRefusedError,
  PRIVILEGED,
  type TokenActor,
} from './authz.js'

/**
 * §20 and D24's row (applied 2026-09-22): approving a release, and recording UBC's IAM
 * registration or Privacy Office assessment. LITERALS, so this file cannot agree with the
 * constant whatever it says — `privileged.test.ts`'s rule for D24's four.
 */
const D24_PERSON_ONLY = ['release:approve', 'launch:record'] as const

const token = (overrides: Partial<TokenActor> = {}): TokenActor => ({
  credential: 'token',
  userId: randomUUID(),
  tokenId: randomUUID(),
  projectId: 'p-1',
  capabilities: new Set(['project:read', 'release:approve', 'launch:record']),
  rateLimit: 60,
  ...overrides,
})

describe('the person-only class (D24, §20)', () => {
  it('is exactly the two, and nothing has been quietly added', () => {
    expect([...PERSON_ONLY].sort()).toEqual([...D24_PERSON_ONLY].sort())
  })

  it('is DISJOINT from the privileged four — a person-only action never becomes a pending action', () => {
    for (const c of PERSON_ONLY) expect(PRIVILEGED.has(c)).toBe(false)
    for (const c of D24_PERSON_ONLY) expect(isPersonOnly(c)).toBe(true)
    expect(isPersonOnly('release:promote')).toBe(false)
  })

  it('refuses a token HOLDING a person-only capability — however it was minted', async () => {
    // `db` is never read: the token branch refuses before the project is looked up.
    await expect(
      assertCapability(undefined as never, token(), 'p-1', 'release:approve'),
    ).rejects.toBeInstanceOf(PersonOnlyRefusedError)
    await expect(
      assertCapability(undefined as never, token(), 'p-1', 'launch:record'),
    ).rejects.toBeInstanceOf(PersonOnlyRefusedError)
  })

  it('refuses it even with a GRANT — no confirmation can make a token a person', async () => {
    await expect(
      assertCapability(undefined as never, token({ grant: 'release:approve' }), 'p-1', 'release:approve'),
    ).rejects.toBeInstanceOf(PersonOnlyRefusedError)
  })

  it('keeps scope FIRST: another project is NOT_FOUND, not a person-only refusal', async () => {
    await expect(
      assertCapability(undefined as never, token({ projectId: 'p-2' }), 'p-1', 'release:approve'),
    ).rejects.toMatchObject({ name: 'AuthorizationError', code: 'NOT_FOUND' })
  })

  it('the positive control: the same token may still do what it holds that is not person-only', async () => {
    await expect(
      assertCapability(undefined as never, token(), 'p-1', 'project:read'),
    ).resolves.toBeUndefined()
  })
})
```

```ts
// packages/control-plane/src/api/person-only.test.ts — the rule is CENTRAL, so it is tested on a route
// that does NOT call requireSession: the only way to see it, because every real person-only route
// answers TOKEN_CREDENTIAL_REFUSED first (Decision 14).
//
// Pattern: api/contract/route.test.ts:24-65 — a synthetic route, `registerRoutes(app, deps, [probe])`
// after `buildServer`. The probe is POST /v1/projects/{projectId}/zz-person-only and calls
// `assertCapability(deps.db, actor, params.projectId, 'release:approve')` and nothing else.
it('refuses a token holding release:approve: 403 TOKEN_PERSON_ONLY, and records NO pending action', …)
it('refuses a token holding launch:record the same way', …)            // a second synthetic probe, launch:record
it('the positive control: a platform administrator’s SESSION passes the same route', …)   // 201
it('the mint route refuses release:approve and launch:record: 400 TOKEN_CAPABILITY_FORBIDDEN, and writes no row', …)
it('the mint route’s positive control: project:read is minted, 201', …)
```

**Each refusal test counts `pending_actions` for the project before and after, and asserts both counts are `0`.** A test that checked only the `403` would stay green if the wrapper learned to record a question for this class.

- [ ] **Step 2: Run them — the central tests fail for the RIGHT reason**

```bash
pnpm exec vitest run --project unit src/projects/person-only.test.ts src/api/person-only.test.ts
```

**Expected:** `PERSON_ONLY` does not exist, so the module fails to import. Once it exists but is empty: the token case **resolves** (`release:approve` is not privileged, the token holds it, and the grant is never read), the synthetic route answers **`201`**, and the mint answers **`201`**. **Record all three**: they are *Read this first* 14, measured in the unit tier.

- [ ] **Step 3: The rule**

```ts
// packages/control-plane/src/projects/authz.ts, beside PRIVILEGED

/**
 * D24's PERSON-ONLY actions (Rich, 2026-09-22; §20's step-up bullet and D24's row): approving a
 * release (§13) and recording what UBC IAM or the Privacy Office decided (§9). **Stricter than
 * the privileged four.** A privileged action a token asks for becomes a question a person
 * answers, and a confirmed retry goes through once. A person-only action cannot, because each is a RECORD
 * THAT A NAMED PERSON DECIDED — and a confirmed retry would let the token make that record.
 *
 * Refused CENTRALLY, in `assertCapability`, so a route that forgot `requireSession` still
 * refuses. And refused with its OWN code, `TOKEN_PERSON_ONLY`, so that removing either the
 * central rule or a route's `requireSession` turns a test red (Decision 14). DISJOINT from
 * `PRIVILEGED` by construction, and `person-only.test.ts` holds it so.
 */
export const PERSON_ONLY: ReadonlySet<Capability> = new Set<Capability>([
  'release:approve',
  'launch:record',
])

export function isPersonOnly(capability: PrivilegedCapability): boolean {
  return (PERSON_ONLY as ReadonlySet<PrivilegedCapability>).has(capability)
}

/**
 * NOT `TokenCapabilityRefusedError`, and that is the whole point: `api/contract/route.ts`'s
 * wrapper turns THAT class into a PendingAction, and this one must never become one.
 * Carries no code; `api/errors.ts` supplies `TOKEN_PERSON_ONLY` at its `instanceof` branch,
 * the shape `StepUpRequiredError` uses for the reason recorded there.
 */
export class PersonOnlyRefusedError extends Error {
  constructor(
    readonly capability: Capability,
    readonly projectId: string,
    readonly tokenId: string,
  ) {
    super(
      `'${capability}' is a record that a named person decided (D24): no delegated token may ` +
        'hold it, and no confirmation can grant it',
    )
    this.name = 'PersonOnlyRefusedError'
  }
}
```

In `assertCapability`'s token branch, **after the scope check and before `isPrivileged`**:

```ts
    // PERSON-ONLY, BEFORE THE PRIVILEGED RULE AND BEFORE ANY GRANT (Decision 14). After scope,
    // so a token still learns nothing about a project it may not address. Before the grant,
    // because no confirmation may stand in for a person here — the whole difference between
    // this class and D24's four.
    if (isPersonOnly(capability)) {
      throw new PersonOnlyRefusedError(capability, projectId, actor.tokenId)
    }
```

**Update the doc comment above `assertCapability`**, which describes the check order as *"three checks"*. There are now four, in this order: scope, person-only, privileged, the token's own set.

- [ ] **Step 4: The mint refusal and the mapping**

```ts
// api/routes/tokens.ts — step 2b, directly after the privileged refusal
      const personOnly = body.capabilities.filter((capability) => isPersonOnly(capability))
      if (personOnly.length > 0) {
        throw new BadRequestError(
          'TOKEN_CAPABILITY_FORBIDDEN',
          `a delegated token may never hold ${personOnly.join(', ')} — each is a record that a named person decided (D24)`,
          'A person does these in the console, in their own session. Mint the token without them; no confirmation can grant them to an agent.',
        )
      }
```

The mint route's `description` gains one sentence: *"…nor release:approve or launch:record, which are person-only: a person does them, and no confirmation grants them."*

```ts
// api/errors.ts — beside the StepUpRequiredError branch
  if (error instanceof PersonOnlyRefusedError) {
    return {
      status: 403,
      body: {
        error: {
          // THE LITERAL LIVES HERE (Decision 14): the class carries no code, so it cannot be
          // constructed with the wrong one, and error-codes.test.ts finds this line under api/.
          code: 'TOKEN_PERSON_ONLY',
          message: error.message,
          hint: 'A person does this, in the console, in their own session. No token can hold it and no confirmation grants it — do not ask for one.',
        },
      },
    }
  }
```

```ts
// api/error-codes.ts
  TOKEN_PERSON_ONLY: api(
    403,
    'A delegated token asked for a person-only action (D24) — approving a release, or recording UBC’s IAM or privacy decision. Refused outright; no pending action is created.',
  ),
```

- [ ] **Step 5: The console, the matrix comment, the version, and the contract**

- `packages/console/src/screens/tokens.tsx`: a `PERSON_ONLY` set **restated beside `PRIVILEGED`**, with the same honest comment that restating is a finding about the document and not a preference. The two capabilities render `disabled`, with *"a person does this — no token and no confirmation can"*. `everyCapability` is unchanged, so the list is still held to the document by `tsc`.
- `api/authz-contract.ts` ~1470: the comment *"It is mintable, because it is not one of D24's four"* becomes *"It is NOT mintable since P6b Task 2 — `mintTestToken` writes it straight to the store, which is what a token minted before P6b looks like. `requireSession` answers first on both record routes, so no row's expectation moves; `api/person-only.test.ts` is what sees the central rule."*
- `CONTRACT_VERSION = '1.1.0'`, and the same in `packages/contract/package.json`. Extend the comment above `CONTRACT_VERSION` with **one sentence recording *Read this first* 11**: P6a's seven operations were added under `1.0.0`, and this bump covers them.

```bash
pnpm contract:write && pnpm contract:generate
```

- [ ] **Step 6: All four gates, twice; commit**

```bash
pnpm test && pnpm test && pnpm lint && pnpm typecheck && pnpm format:check
git status        # account for every path
git add packages/control-plane/src/projects/authz.ts packages/control-plane/src/projects/index.ts \
  packages/control-plane/src/projects/person-only.test.ts packages/control-plane/src/projects/privileged.test.ts \
  packages/control-plane/src/api/routes/tokens.ts packages/control-plane/src/api/errors.ts \
  packages/control-plane/src/api/error-codes.ts packages/control-plane/src/api/person-only.test.ts \
  packages/control-plane/src/api/authz-contract.ts packages/control-plane/src/api/contract/document.ts \
  packages/contract/package.json packages/contract/openapi.json packages/contract/src/schema.d.ts \
  packages/console/src/screens/tokens.tsx
git commit -m "feat(authz): D24's person-only class — refused centrally, never minted, never pending"
```

**Predicted test movement:** `pnpm test` gains the new cases (count them), with no existing test going red. **If the authorization matrix moves at all, that is a finding**: `requireSession` should answer first on every person-only route.

- [ ] **Step 7: Negative controls — predicted, then run, one at a time, restoring with `git checkout <path>` after each**

| | Control | Predicted |
|---|---|---|
| a | the `isPersonOnly` branch removed from `assertCapability` | `person-only.test.ts`'s *refuses a token HOLDING* and *…even with a GRANT* both red. The synthetic route answers **`201`**, so `api/person-only.test.ts`'s two refusal cases go red. **`api/authz-contract.test.ts` stays GREEN**: `requireSession` answers every real route first, which is *why* the synthetic route exists. **Green here is the prediction, not a question** |
| b | the mint refusal removed | *the mint route refuses release:approve and launch:record* red (`201` and a row). Nothing else moves, because the central rule still refuses the token's use |
| c | `PersonOnlyRefusedError` mapped to `TOKEN_CREDENTIAL_REFUSED` | the synthetic route's two refusals red **on the CODE alone**: the status is `403` either way |
| d | `'release:approve'` added to `PRIVILEGED` (Rich's rejected option) | `privileged.test.ts`'s literal-list case red, and *…is DISJOINT* red. **The synthetic route stays `TOKEN_PERSON_ONLY`**, because person-only is checked first |
| e | `requireSession` replaced by `requireActor` in `decide()` (restore at once) | **a `tsc` error**: `decide()` reads `actor.puid`, which a token actor has no field for (P6a Decision 18; P6a sitting 7's control (b)). **Forced past with a cast**, the matrix's four token rows for approve and reject read **`TOKEN_PERSON_ONLY`** where `TOKEN_CREDENTIAL_REFUSED` is expected. That is the two layers seen separately, which is what the distinct code is for |

---

## Task 3: The sensitive diff over frozen releases, the baseline by LATEST decision, and a release that freezes its build's spec

**Three premises of this plan, each measured false in Task 1**: `[M3]` the override blind spot, `[M5]` the rejected baseline, and `[M6]` the newest-spec release together with the unscoped build. **All three sit under the re-escalation**, and none is visible through a first launch. This task fixes them before anything builds on them.

**Files:**
- Modify: `packages/control-plane/src/spec/diff.ts` — `SensitiveView`, `sensitiveFieldsBetween`, `sensitiveViewOfSpec`, `sensitiveViewOfRelease`; `isSensitiveDiff` through the spec adapter
- Modify: `packages/control-plane/src/spec/index.ts` — export them
- Modify: `packages/control-plane/src/spec/diff.test.ts`
- Modify: `packages/control-plane/src/releases/approval.ts` — `lastApprovedReleaseFor` by each release's LATEST decision; `sensitiveChangeOf`
- Modify: `packages/control-plane/src/releases/approval.test.ts`
- Modify: `packages/control-plane/src/releases/release.ts` — `createRelease` refuses a build of another project
- Modify: `packages/control-plane/src/api/routes/releases.ts` — the route freezes `build.appSpecId`; `SPEC_NOT_FOUND` leaves its `errors:` list
- Modify: `packages/control-plane/src/api/delivery.test.ts` (or `releases/releases.test.ts`) — the two route cases

**Interfaces:**
- Consumes: `ResolvedConfigSet` (`releases/release.ts:120`), `approvals`, `appSpecs`.
- Produces:
  ```ts
  // spec/diff.ts
  export interface SensitiveView {
    services: readonly { type: string; version: string; name: string }[]
    attributes: readonly string[]
    egress: readonly string[]
    /** What the environment RUNS with where known; a raw spec leaves a dimension undefined (the blueprint supplies it). */
    resources: { cpu?: number | undefined; memory?: string | undefined; pids?: number | undefined; disk?: string | undefined }
    classification: string
    models: readonly string[]
    /** §7's `blueprint` — the MANIFEST's reference (Read this first 4). */
    blueprint: string
  }
  export function sensitiveFieldsBetween(before: SensitiveView, after: SensitiveView): SensitiveField[]
  export function sensitiveViewOfSpec(spec: ManifestSpec): SensitiveView        // production: top-level ⊕ environments.production.resources
  export function sensitiveViewOfRelease(production: ResolvedConfig, blueprint: string): SensitiveView
  export function isSensitiveDiff(before: ManifestSpec, after: ManifestSpec): { sensitive: boolean; fields: string[] }  // unchanged signature
  // releases/approval.ts
  export async function lastApprovedReleaseFor(db: Db, projectId: string, excludeReleaseId: string): Promise<ReleaseRow | undefined>  // semantics fixed
  export interface SensitiveChange { baseline: ReleaseRow | undefined; fields: SensitiveField[] }
  export async function sensitiveChangeOf(db: Db, release: ReleaseRow): Promise<SensitiveChange>
  ```
  **Callers:** `sensitiveFieldsBetween` is called by `isSensitiveDiff` (the validate route) and by `sensitiveChangeOf`. `sensitiveChangeOf` is called by Task 5's `approvalRequirementFor` and Task 8's snapshot. **In this task, `sensitiveChangeOf`'s only caller is its test. Say so in its doc comment and name Task 5**, which is the one sanctioned exception to *every task names its caller*: the two tasks are consecutive, and Task 5's commit is the proof.

- [ ] **Step 1: The failing tests**

```ts
// spec/diff.test.ts — additions
it('a raised PRODUCTION override is a resources change — [M3], and what production actually runs', () => {
  const before = spec({ environments: { production: { resources: { memory: '512Mi' } } } })
  const after = spec({ environments: { production: { resources: { memory: '8Gi' } } } })
  expect(isSensitiveDiff(before, after).fields).toEqual(['resources'])
})
it('a LOWERED production override is not — §7 is increase-only', () => {
  const before = spec({ environments: { production: { resources: { memory: '8Gi' } } } })
  const after = spec({ environments: { production: { resources: { memory: '512Mi' } } } })
  expect(isSensitiveDiff(before, after)).toEqual({ sensitive: false, fields: [] })
})
it('a staging override is not a production change at all', () => {
  const before = spec({ environments: { staging: { resources: { memory: '256Mi' } } } })
  const after = spec({ environments: { staging: { resources: { memory: '2Gi' } } } })
  expect(isSensitiveDiff(before, after).fields).toEqual([])
})
it('the release view reads the FROZEN production config, defaults and override included', () => {
  const defaults = { cpu: 0.5, memory: '512Mi', pids: 256, disk: '2Gi' }
  const a = resolveConfig(spec({}), 'production', defaults)
  const b = resolveConfig(spec({ environments: { production: { resources: { cpu: 2 } } } }), 'production', defaults)
  expect(sensitiveFieldsBetween(sensitiveViewOfRelease(a, 'node-ts-mongo@1'), sensitiveViewOfRelease(b, 'node-ts-mongo@1')))
    .toEqual(['resources'])
  // THE POSITIVE HALF IN THE SAME TEST: identical configs, identical answer.
  expect(sensitiveFieldsBetween(sensitiveViewOfRelease(a, 'node-ts-mongo@1'), sensitiveViewOfRelease(a, 'node-ts-mongo@1')))
    .toEqual([])
})
it('the two adapters agree whenever a spec sets every limit itself', () => {
  // A property over §7's seven: for each field, a pair of specs differing ONLY there, every
  // resource dimension set explicitly — the spec adapter and the release adapter (over
  // resolveConfig of the same specs) name the SAME fields. One rule, two inputs.
})
it('reports the fields in SENSITIVE_FIELDS order', () => { /* change blueprint and services together → ['services', 'blueprint'] */ })
```

```ts
// releases/approval.test.ts — additions
it('a release APPROVED AND THEN REJECTED is not a baseline — [M5]', …)      // approve R2, reject R2 → baseline for R3 is R1
it('a release rejected and then approved AGAIN is one — the latest decision is what counts', …)
it('sensitiveChangeOf compares FROZEN production configs against the last approved release', …)  // an egress change → ['egress.allow']
it('sensitiveChangeOf with no approved release answers no baseline and no fields — the caller decides', …)
```

```ts
// api/delivery.test.ts — the route
it('a release freezes its BUILD’s spec, not the newest one — [M6]', async () => {
  // build at S1; commitManifest(S2 with an egress host); POST releases {buildId}
  // → release.appSpecId === build.appSpecId, and config.production.egressAllow is S1's
})
it('an INVALID newest spec no longer reaches a release', …)          // commit an invalid manifest, validate (valid:false), release → 201 with S1's config
it('refuses a build of ANOTHER project: 409 RELEASE_BUILD_NOT_FOUND, and writes no release', …)
it('the positive control: a build of THIS project releases, 201', …)
```

- [ ] **Step 2: Run them — predict the reds**

```bash
pnpm exec vitest run --project unit src/spec/diff.test.ts src/releases/approval.test.ts src/api/delivery.test.ts
```

**Predicted:** the override case red with `[]`, which is `[M3]`. The baseline case red, returning the rejected release, which is `[M5]`. The route cases red: the release carries S2's spec, the invalid case answers `500`, and the cross-project build answers `201`, which is `[M6]`. **Any test in Task 1's `[M15]` list that expects the newest spec goes red once Step 4 lands.** Name each one and change its expectation, and say in the record why the old expectation was the defect.

- [ ] **Step 3: The one rule, and its two adapters**

`sensitiveFieldsBetween` is `isSensitiveDiff`'s current body with every read moved onto the view: `sameObjectSet` for services, `sameSet` for attributes, egress and models, `dimensionRose` for resources, `!==` for classification and blueprint. **The comments move with it, unchanged.** Each one records a defect this function has already had (`services` compared by `JSON.stringify`, `?? 0` reading a dropped limit as a decrease, the blueprint compared by its digit alone).

```ts
export function sensitiveViewOfSpec(spec: ManifestSpec): SensitiveView {
  // PRODUCTION's view of a raw spec (Decision 5): §7 lets `environments.production`
  // override `resources`, and a gate on production that cannot see that override is not a
  // gate on production ([M3]). No blueprint defaults here — a raw spec has none, and
  // `dimensionRose` already escalates where the direction cannot be known.
  const resources = { ...spec.resources, ...(spec.environments.production?.resources ?? {}) }
  return {
    services: spec.services, attributes: spec.auth.attributes, egress: spec.egress.allow,
    resources, classification: spec.data.classification, models: spec.ai.models,
    blueprint: spec.blueprint,
  }
}

export function sensitiveViewOfRelease(production: ResolvedConfig, blueprint: string): SensitiveView {
  // `describeDiff`'s own fallbacks for a release frozen before `auth` or `ai` existed
  // (P4b pre-flight 64) — the SAME constants, not copies of them.
  const auth = (production.auth as ResolvedConfig['auth'] | undefined) ?? NO_AUTH
  const ai = (production.ai as ResolvedConfig['ai'] | undefined) ?? NO_AI
  return {
    services: production.services, attributes: auth.attributes, egress: production.egressAllow,
    resources: production.resources, classification: production.classification,
    models: ai.models, blueprint,
  }
}
```

**Careful with `exactOptionalPropertyTypes`.** The spread in `sensitiveViewOfSpec` produces `cpu?: number | undefined`, which is why `SensitiveView.resources` declares `| undefined` explicitly. `tsc` is the gate that sees this, and Vitest is not.

- [ ] **Step 4: The baseline by LATEST decision, and `sensitiveChangeOf`**

```ts
/**
 * The newest release of this project whose LATEST decision is `approved` (Decision 4) — the
 * baseline a re-escalation is diffed against, and what §13's summary means by "the last
 * approved release".
 *
 * **EACH RELEASE'S LATEST DECISION, NOT ANY APPROVAL ROW** ([M5]). A release can be approved,
 * rejected and approved again (no unique constraint on `release_id`), and filtering the
 * rows on `decision = 'approved'` let a release an administrator had WITHDRAWN stay the
 * baseline for every diff after it. Rows are read newest first, and the first row seen for a
 * release is its latest decision.
 */
export async function lastApprovedReleaseFor(db: Db, projectId: string, excludeReleaseId: string) {
  const rows = await db
    .select({ decision: approvals.decision, release: releases })
    .from(approvals)
    .innerJoin(releases, eq(approvals.releaseId, releases.id))
    .where(eq(approvals.projectId, projectId))
    .orderBy(desc(approvals.decidedAt), desc(approvals.id))
  const seen = new Set<string>()
  for (const row of rows) {
    if (seen.has(row.release.id)) continue
    seen.add(row.release.id)
    if (row.release.id !== excludeReleaseId && row.decision === 'approved') return row.release
  }
  return undefined
}

async function sensitiveViewOf(db: Db, release: ReleaseRow): Promise<SensitiveView> {
  const [spec] = await db.select({ parsed: appSpecs.parsed }).from(appSpecs).where(eq(appSpecs.id, release.appSpecId))
  // '' when the reference cannot be read: compared with any real one it DIFFERS, so a
  // missing spec row re-escalates rather than waving the release through.
  const blueprint = (spec?.parsed as Partial<ManifestSpec> | undefined)?.blueprint ?? ''
  return sensitiveViewOfRelease((release.resolvedConfig as ResolvedConfigSet).production, blueprint)
}

export async function sensitiveChangeOf(db: Db, release: ReleaseRow): Promise<SensitiveChange> {
  const baseline = await lastApprovedReleaseFor(db, release.projectId, release.id)
  if (baseline === undefined) return { baseline, fields: [] }
  const [before, after] = await Promise.all([sensitiveViewOf(db, baseline), sensitiveViewOf(db, release)])
  return { baseline, fields: sensitiveFieldsBetween(before, after) }
}
```

**`buildDiffSnapshot` already calls `lastApprovedReleaseFor`** (`approval.ts:177`), so the summary's baseline moves in the same commit. That is intended. Its tests that approve and then reject may move, so predict which ones before you run them.

- [ ] **Step 5: A release freezes its build's spec, and the build must be this project's**

In `api/routes/releases.ts`'s `createRelease` handler, replace the newest-spec select:

```ts
      // THE BUILD'S OWN SPEC (Decision 6, [M6]) — the one §7's build-time attribute check ran
      // against, and a spec `startBuild` has already refused if it was invalid. The newest spec
      // is somebody's NEXT commit, and freezing it paired one commit's image with another's
      // configuration. SCOPED TO THE PROJECT, so another project's build is indistinguishable
      // from no build at all (the enumeration rule `getRelease` states).
      const [build] = await deps.db
        .select()
        .from(builds)
        .where(and(eq(builds.id, body.buildId), eq(builds.projectId, params.projectId)))
      if (build === undefined)
        throw new ReleaseError('RELEASE_BUILD_NOT_FOUND', `no build '${body.buildId}' in this project`)
      const [spec] = await deps.db.select().from(appSpecs).where(eq(appSpecs.id, build.appSpecId))
```

In `createRelease` itself (`releases/release.ts:140`), make the build lookup scoped too, with `and(eq(builds.id, input.buildId), eq(builds.projectId, input.projectId))`. **This is the second, independent read of the same condition**, which [`ORIENTATION §9`](../ORIENTATION.md) records as what a guard is.

- [ ] **Step 6: Gates; commit**

```bash
pnpm test && pnpm test && pnpm lint && pnpm typecheck && pnpm format:check
git add packages/control-plane/src/spec/diff.ts packages/control-plane/src/spec/index.ts packages/control-plane/src/spec/diff.test.ts \
  packages/control-plane/src/releases/approval.ts packages/control-plane/src/releases/approval.test.ts \
  packages/control-plane/src/releases/release.ts packages/control-plane/src/api/routes/releases.ts \
  packages/control-plane/src/api/delivery.test.ts packages/contract/openapi.json packages/contract/src/schema.d.ts
git commit -m "fix(releases): one sensitive-field rule over what production runs; the baseline by latest decision; a release freezes its build's spec"
```

`pnpm contract:write && pnpm contract:generate` is owed only if `createRelease`'s `errors:` list changed. Removing `SPEC_NOT_FOUND` changes it.

- [ ] **Step 7: Negative controls**

| | Control | Predicted |
|---|---|---|
| a | `sensitiveViewOfSpec` ignores `environments.production` | *a raised PRODUCTION override* red (`[]`); the release-view case **green**, because it never read the spec. That is Decision 5's argument, measured |
| b | `lastApprovedReleaseFor` goes back to filtering rows on `approved` | *approved and then rejected is not a baseline* red, returning R2 |
| c | `sensitiveViewOf`'s `''` fallback becomes the baseline's own blueprint | *no test goes red*. **Predicted green, and that is a question:** the fallback's only witness is a release whose spec row is missing, which cannot happen through the routes. Write the unit test that deletes the row and watch it go red, or record in the plan why the branch is untestable |
| d | the route's project scope removed (the `createRelease` scope kept) | *refuses a build of ANOTHER project* **stays green**: the second read refuses it. That is the guard working. **Then remove the second too** and watch it go red (`201`) |
| e | the route goes back to the newest spec | *freezes its BUILD's spec* red, and *an INVALID newest spec* red (`500`) |

---

## Task 4: An app has launched — migration 0021, the launch recorded once, and no rehearsal afterwards

**The fact P6b's whole second clause turns on** (Decision 1). It is recorded by the deploy that makes it true, and it is read by the checklist, by `deployRelease` and by the rehearsal. **After this task nothing branches on it except the rehearsal refusal.** The branches are Tasks 5 and 6, in the same sitting and the next.

**Files:**
- Modify: `packages/control-plane/src/db/schema.ts` — `projects.launchedAt`; `'project.launched'` in the `audit.events` CHECK literal (~748)
- Create: `packages/control-plane/drizzle/0021_*.sql` — **generated, then read**
- Create: `packages/control-plane/src/releases/launched.ts` — `launchedAt`, `recordLaunch`
- Modify: `packages/control-plane/src/releases/index.ts`, `release.ts` — `recordLaunch`'s call; the rehearsal exemption refused after launch
- Modify: `packages/control-plane/src/observability/events.ts`, `event-schemas.ts` — `project.launched`
- Modify: `packages/control-plane/src/launch/rehearsal.ts` — `REHEARSAL_LAUNCHED`
- Modify: `packages/control-plane/src/api/routes/launch.ts` — the rehearsal route's `errors:`
- Modify: `packages/control-plane/src/api/error-codes.ts` — `REHEARSAL_LAUNCHED`
- Modify: `packages/control-plane/src/api/representations/projects.ts` — `Project.launchedAt`
- Modify: `packages/control-plane/src/api/testing.ts` — `builtProject`, `releasedProject` moved here from `delivery.test.ts`; `launchedProject`, `commitManifest` added
- Modify: `packages/control-plane/src/api/delivery.test.ts` — imports the moved helpers
- Modify: `packages/control-plane/src/releases/releases.test.ts`, `launch/rehearsal.test.ts`
- Modify: `packages/control-plane/src/releases/production.docker.test.ts` — the rehearsal gets a project of its own (*Read this first* 19)
- Modify: `packages/mock/src/fixtures.ts` — `launchedAt` on every project fixture
- Modify: `packages/journey/src/production.ts` — the re-use path is a launched app
- Regenerate: the contract

**Interfaces:**
- Consumes: `deployRelease`'s healthy branch (`releases/release.ts`, where `instance.healthy` is published, ~line 846).
- Produces:
  ```ts
  // releases/launched.ts
  export async function launchedAt(db: Db, projectId: string): Promise<Date | null>
  /** Records the launch ONCE. True when THIS call recorded it; false when the project had already launched. */
  export async function recordLaunch(db: Db, bus: EventBus, input: {
    projectId: string; releaseId: string; instanceId: string; imageDigest: string; slug: string
  }): Promise<boolean>
  ```
  `Project.launchedAt: string | null`, the event `project.launched` `{ releaseId, instanceId, imageDigest }` (the digest truncated to 19 characters, as `release.approved` does), and the code **`REHEARSAL_LAUNCHED`** (409, `RehearsalError`). **Callers:** `recordLaunch` is called by `deployRelease`. `launchedAt` is called by `runRehearsal` and `deployRelease` here, and by Tasks 5 and 6.

- [ ] **Step 1: The failing tests**

```ts
// releases/releases.test.ts — "the launch (Decision 1)"
it('records the launch ONCE: the first healthy production deploy for purpose launch', …)
//   → launched_at set; ONE `project.launched` event; a second production deploy leaves launched_at and the event count unchanged
it('a REHEARSAL deploy does not launch', …)                       // purpose 'rehearsal' → launched_at null
it('a production deploy that FAILS does not launch', …)            // the fake driver's unhealthy instance → null
it('a STAGING deploy does not launch', …)                          // → null
it('refuses the rehearsal exemption for a LAUNCHED project — a programming fault, not a wire refusal', …)
//   → deployRelease(purpose: 'rehearsal') on a launched project rejects with a plain Error, BEFORE any instance row

// launch/rehearsal.test.ts
it('refuses a rehearsal once the app has launched: REHEARSAL_LAUNCHED, and production is untouched', …)
//   positive control in the same file: an unlaunched project's rehearsal proceeds (the existing cases)
```

**`launchedProject(slug)`** is `delivery.test.ts:654`'s positive control turned into a helper: released, deployed to staging, a PIA recorded along its arrows, approved, and deployed to production by a stepped-up owner. **Write it by MOVING that test's body, not by retyping it.** Then that test calls the helper and keeps its own assertions. **Its approve call will need a preview from Task 9 onward**, and Task 9 changes it in one place.

- [ ] **Step 2: Run — predict**

```bash
pnpm exec vitest run --project unit src/releases/releases.test.ts src/launch/rehearsal.test.ts
```

**Predicted:** every new case red. The column does not exist yet, so the tests fail on the missing export and the missing column; record the first error text.

- [ ] **Step 3: The schema, and the migration**

```ts
// db/schema.ts, on `projects`
    /**
     * WHEN THIS APP FIRST WENT TO PRODUCTION (P6b Decision 1) — written once, by the first
     * `purpose: 'launch'` production deploy that became healthy, and never cleared. D9 turns
     * on it: before it, a production deploy needs §13's whole checklist; after it, a release
     * is self-serve unless it changes a sensitive field. It is also the fact §9's *"the slug
     * is immutable after production launch"* reads, the day a rename exists.
     */
    launchedAt: timestamp('launched_at', { withTimezone: true }),
```

Add `'project.launched'` to the `CHECK` literal in `db/schema.ts` and to `EVENT_TYPES`, with its comment (*"§13 D9: the app's first production launch — recorded once"*), and give it its payload schema in `event-schemas.ts`:

```ts
  'project.launched': z.strictObject({
    releaseId: Uuid,
    instanceId: Uuid,
    imageDigest: z.string().describe('The first 19 characters — recognisable, and never mistaken for the binding.'),
  }),
```

```bash
pnpm --filter @manifest/control-plane db:generate
cat packages/control-plane/drizzle/0021_*.sql     # READ IT: ADD COLUMN launched_at, and the CHECK's DROP/ADD pair — nothing appended by hand
```

- [ ] **Step 4: `recordLaunch`, and its one call**

```ts
// releases/launched.ts
export async function recordLaunch(db: Db, bus: EventBus, input: RecordLaunchInput): Promise<boolean> {
  // ONCE, BY THE WHERE CLAUSE — not by a read-then-write, which two deploys racing on one
  // project would both pass (P5b sitting 7's F2: a pooled race is observable only warm).
  const [row] = await db
    .update(projects)
    .set({ launchedAt: new Date() })
    .where(and(eq(projects.id, input.projectId), isNull(projects.launchedAt)))
    .returning({ id: projects.id })
  if (row === undefined) return false
  await publishEvent(db, bus, {
    projectId: input.projectId,
    subject: `project:${input.projectId}`,
    type: 'project.launched',
    machineDetail: { releaseId: input.releaseId, instanceId: input.instanceId, imageDigest: input.imageDigest.slice(0, 19) },
    humanMessage: `${input.slug} launched: it is in production for the first time (§13).`,
  }, makeRedactor([]))
  return true
}
```

In `deployRelease`, **in the healthy branch, directly after `instance.healthy` is published**:

```ts
      // §13 D9: THE LAUNCH IS RECORDED BY THE DEPLOY THAT MAKES IT TRUE (P6b Decision 1). A
      // production deploy for purpose 'launch' that reached healthy — never a rehearsal, whose
      // instance serves production too and must not read as a launch.
      if (environment.kind === 'production' && (input.purpose ?? 'launch') === 'launch')
        await recordLaunch(db, deps.bus, {
          projectId: environment.projectId, releaseId: release.id, instanceId: updated!.id,
          imageDigest: digest, slug: projectSlug,
        })
```

And **before anything starts**, beside the digest check at ~266:

```ts
  // DECISION 16's second read. `runRehearsal` refuses a launched project with REHEARSAL_LAUNCHED
  // before it gets here; this is the exemption itself refusing to be used after launch, because
  // `purpose: 'rehearsal'` skips the digest check and its instance serves the PUBLIC listener
  // ([M7]). A plain Error: no client can reach it, and a wire code nothing can receive is one
  // `error-codes.test.ts` would rightly refuse to register.
  if (environment.kind === 'production' && input.purpose === 'rehearsal' && (await launchedAt(db, environment.projectId)) !== null)
    throw new Error(`project '${environment.projectId}' has launched, so a rehearsal would put an unapproved release on its live production listener`)
```

`runRehearsal`, **directly after it reads the project**, adds `if (project.launchedAt !== null) throw new RehearsalError('REHEARSAL_LAUNCHED', …)`. The message says why: *"…has launched: a rehearsal deploys into production, so it would put this candidate in front of real students with no approval. A change to its registration is proved by UBC IAM's change request (§9)."*

- [ ] **Step 5: `production.docker.test.ts`, and the demo's re-use path**

**Watch the Docker file go red first**:

```bash
MANIFEST_TEST_DOCKER=1 pnpm exec vitest run --project docker src/releases/production.docker.test.ts
```

**Predict: exactly one red, *runs the rehearsal, and records a sign-in that could not complete as FAILED*, refused `REHEARSAL_LAUNCHED`**, because the file's shared project launched at line 348. **Then give that case a `describeDocker` block and a project of its own.** Say in a comment why: a launched project refuses a rehearsal by design. Do not reorder it before the launch. The earlier cases' *"first production deploy"* claims would then meet a production instance the rehearsal left behind, and every one of them would need re-reading.

`packages/journey/src/production.ts`: in step 1, read `existing.launchedAt` from the project list. **When it is set, the re-use path is a LAUNCHED app**, so run the durable checks below, print why, and stop:

- the records are `active` and `approved`;
- `127.0.0.3` answers with an `X-Manifest-Instance`, and `127.0.0.2` answers without one;
- the release production serves (`GET /v1/environments/{productionId}` → `instance.releaseId`) has a latest decision of `approved` (`GET /v1/releases/{id}/approval`) — the durable trace of the first launch.

The reason it prints: *"(launch-app launched on <date>. A first launch happens once per project, and no route deletes one (P6a F5). The fresh path is what proves P6a; `make demo-releases` is what a launched app does next.)"* **`scripts/demo-production.sh` runs the admin and launch phases only when the instructor phase did not stop there.** Use a flag in the state file, because a phase that exits early must not read as red (P6a F9).

**Measure both paths before committing:** `make demo-production` fresh, after a `pnpm test`, and again on re-use. **Predict green on both.** The fresh run ends with `launched_at` set. Check it with `Q "select launched_at from projects where slug='launch-app'"`, and read the event.

- [ ] **Step 6: Representations, mock, contract; gates; commit**

`Project` gains `launchedAt: Timestamp.nullable().describe('When it first went to production (§13 D9) — null until then; never cleared.')`. **Every project fixture in `packages/mock/src/fixtures.ts` gains it.** Predict `validate.test.ts` red until it does.

```bash
pnpm contract:write && pnpm contract:generate
pnpm test && pnpm test && pnpm lint && pnpm typecheck && pnpm format:check
MANIFEST_TEST_DOCKER=1 pnpm test:docker          # owed at the sitting's close; the one file above is not the tier
git add <each path in Files, by name — including drizzle/0021_*.sql and drizzle/meta/*>
git commit -m "feat(launch): an app has launched — recorded once by the deploy that makes it true; no rehearsal after"
```

- [ ] **Step 7: Negative controls**

| | Control | Predicted |
|---|---|---|
| a | `recordLaunch`'s `isNull(projects.launchedAt)` removed | *records the launch ONCE* red: the second deploy publishes a second event and moves `launched_at` |
| b | the call's `purpose` condition removed | *a REHEARSAL deploy does not launch* red; **and `make demo-production`'s fresh path goes red at step 7**, because the rehearsal at step 5 launched the app, and step 7's approval-then-launch meets a launched project. Predict the exact check |
| c | `runRehearsal`'s refusal removed (`deployRelease`'s kept) | *refuses a rehearsal once the app has launched* red **on the CODE**: `409 REHEARSAL_DEPLOY_FAILED` (the plain `Error`, wrapped) where `REHEARSAL_LAUNCHED` is expected. *Production is untouched* stays green, which is the second read measured |
| d | `deployRelease`'s refusal removed (`runRehearsal`'s kept) | *refuses the rehearsal exemption for a LAUNCHED project* red; **every route-level test green**. Predicted, not a question: it is defence in depth, and this test is its one witness |

---

## Task 5: The approval requirement — `deployRelease`'s half of D9.2

**One rule, stated once, with two readers**: this task's `deployRelease`, and Task 6's checklist. **It is §13's *second half* of the gate** (P6a F8 measured the two halves as independent): it runs before anything starts, whatever the route decided. **After this task, a launched app's non-sensitive release deploys when `deployRelease` is called directly, while the route still refuses it**, because the route's checklist is first-launch until Task 6. **That window is one sitting long, and it is stated in the record.**

**Files:**
- Modify: `packages/control-plane/src/releases/approval.ts` — `ApprovalRequirement`, `approvalRequirementFor`, `ProductionApproval`, `productionApprovalFor`
- Modify: `packages/control-plane/src/releases/release.ts` — the digest check becomes `productionApprovalFor(...).satisfied`
- Modify: `packages/control-plane/src/api/routes/project-reads.ts` — the validate route's description: *reported here, enforced at the production deploy against the last approved release*
- Create: `packages/control-plane/src/api/subsequent-releases.test.ts` — D9.2 in the unit tier (Tasks 5, 6 and 7 all add to it)
- Modify: `packages/control-plane/src/releases/releases.test.ts`

**Interfaces:**
- Consumes: Task 3's `sensitiveChangeOf`, Task 4's `launchedAt`, `latestApprovalFor`, `approvalCoversDigest`.
- Produces:
  ```ts
  export type ApprovalRequirement =
    | { required: true; reason: 'first-launch'; baselineReleaseId: null; fields: readonly SensitiveField[] }
    /** Launched, and yet nothing approved to compare with — a hand-edited row, or a lost approval. FAIL CLOSED. */
    | { required: true; reason: 'no-baseline'; baselineReleaseId: null; fields: readonly SensitiveField[] }
    | { required: true; reason: 'sensitive'; baselineReleaseId: string; fields: readonly SensitiveField[] }
    | { required: false; reason: 'self-serve'; baselineReleaseId: string; fields: readonly SensitiveField[] }
  export async function approvalRequirementFor(db: Db, release: ReleaseRow): Promise<ApprovalRequirement>

  export interface ProductionApproval {
    requirement: ApprovalRequirement
    latest: ApprovalRow | undefined
    /** Decision 7: an administrator's rejection is final for this release, sensitive or not. */
    rejected: boolean
    covered: boolean
    satisfied: boolean
  }
  export async function productionApprovalFor(db: Db, release: ReleaseRow, digest: string): Promise<ProductionApproval>
  ```
  **Callers:** `deployRelease` (this task) and Task 6's `admin-approval` item. **Two readers of one function is Decision 2 of P6a applied a second time**: the view and the gate cannot disagree.

- [ ] **Step 1: The failing tests — positive control first**

```ts
// api/subsequent-releases.test.ts — "deployRelease's half (D9.2)"; every case starts from launchedProject(slug)
// EVERY CASE IN THIS BLOCK CALLS `deployRelease` DIRECTLY — `deps.db`, `deps.driver`, `deps.config`, the eight
// `DeployDeps` fields the deploy route builds (`api/routes/releases.ts:432-442`) — because the ROUTE's checklist
// is still first-launch until Task 6. That is this half, measured alone; Task 6 measures the route.
it('a launched app’s identical rebuild deploys to production with NO approval — self-serve (D9)', …)  // POSITIVE, first
//   the rebuild is a NEW release (F3); deployRelease directly → healthy; zero rows in approvals for it
it('redeploys the release production already serves, self-serve, and records no second launch', …)   // Review Focus 3
it('refuses a release that ADDS an egress host: RELEASE_DIGEST_NOT_APPROVED, naming egress.allow, before anything starts', …)
//   commitManifest(... egress: [x.example.org]) → build → release → deployRelease → rejects; no instance row for it
it('refuses a release that raises the PRODUCTION override — [M3], through the gate’s own half', …)
it('deploys the sensitive release once an approval covers its digest', …)
it('refuses a REJECTED release that changes nothing sensitive — Decision 7', …)                    // Review Focus 4
it('fails closed when launched_at is set and nothing was ever approved: required, no-baseline', …)
it('takes the baseline from the LATEST decision: R2 approved then rejected, R3 == R2 is re-escalated against R1', …)
it('a first launch is unchanged: no approval, refused, exactly as P6a built it', …)                // the existing first-launch tests, kept
```

**Every refusal case also asserts that no `instances` row exists for its release.** That is *"before anything starts"*, which P6a's `releases.test.ts` asserts the same way.

- [ ] **Step 2: Run — predict**

**Predicted red:** the positive control (`RELEASE_DIGEST_NOT_APPROVED`, because P6a's rule requires an approval for every release), the redeploy case, the rejected case and the no-baseline case. **The sensitive refusals are green before the change**, since every release is refused today. **That is a negative claim true of a platform that refuses everything**, and it is why the positive control comes first and must be red now.

- [ ] **Step 3: The rule**

```ts
/**
 * §13 D9's TWO CLAUSES, as ONE rule (P6b Decisions 2, 3, 4 and 7) — read by `deployRelease`,
 * which is the gate's second half, and by §13's checklist, which is its first. Two statements
 * of it would be the drift ORIENTATION §9 names.
 *
 *  - NOT LAUNCHED: every production release is a first launch and needs an approval (D9.1).
 *  - LAUNCHED: compare the release's frozen production config with the LAST APPROVED release
 *    (Decision 4). Nothing sensitive changed → self-serve. Something did → approval (D9.2).
 *  - LAUNCHED WITH NO BASELINE: fail closed. A launch needs an approval, so a launched project
 *    with none has had its history edited, and self-serve is the expensive direction to be
 *    wrong in.
 */
export async function approvalRequirementFor(db: Db, release: ReleaseRow): Promise<ApprovalRequirement> {
  if ((await launchedAt(db, release.projectId)) === null)
    return { required: true, reason: 'first-launch', baselineReleaseId: null, fields: [] }
  const { baseline, fields } = await sensitiveChangeOf(db, release)
  if (baseline === undefined)
    return { required: true, reason: 'no-baseline', baselineReleaseId: null, fields: [] }
  return fields.length > 0
    ? { required: true, reason: 'sensitive', baselineReleaseId: baseline.id, fields }
    : { required: false, reason: 'self-serve', baselineReleaseId: baseline.id, fields: [] }
}

export async function productionApprovalFor(db: Db, release: ReleaseRow, digest: string): Promise<ProductionApproval> {
  const [requirement, latest] = await Promise.all([approvalRequirementFor(db, release), latestApprovalFor(db, release.id)])
  const rejected = latest?.decision === 'rejected'
  const covered = latest !== undefined && approvalCoversDigest(latest, digest)
  return { requirement, latest, rejected, covered, satisfied: !rejected && (!requirement.required || covered) }
}
```

**Careful with `recordLaunch` inside `launchedProject`.** The helper's own production deploy launches the project, so every case built on it starts launched, and the first-launch case must build its project without the helper. **A fixture that launched by accident would make every D9.1 test a D9.2 test.** Assert `launchedAt === null` at the top of the first-launch case.

- [ ] **Step 4: `deployRelease`'s check reads the rule**

Replace `release.ts:266-275` with:

```ts
  if (environment.kind === 'production' && (input.purpose ?? 'launch') === 'launch') {
    const verdict = await productionApprovalFor(db, release, digest)
    if (!verdict.satisfied)
      throw new ReleaseError('RELEASE_DIGEST_NOT_APPROVED', unsatisfiedReason(verdict, digest))
  }
```

`unsatisfiedReason` says which of the three it was, in words: **rejected** (with the administrator's reason), **re-escalated** (naming the fields and the baseline release), or **no approval covers the digest** (P6a's sentence, kept). **The code stays `RELEASE_DIGEST_NOT_APPROVED`.** Through the route, Task 6's gate answers first with a more specific code and the view. This refusal is the second half, and one code for it is enough.

- [ ] **Step 5: Gates; commit**

```bash
pnpm test && pnpm test && pnpm lint && pnpm typecheck && pnpm format:check
MANIFEST_TEST_DOCKER=1 pnpm test:docker      # owed: releases/
git add packages/control-plane/src/releases/approval.ts packages/control-plane/src/releases/release.ts \
  packages/control-plane/src/releases/releases.test.ts packages/control-plane/src/api/subsequent-releases.test.ts \
  packages/control-plane/src/api/routes/project-reads.ts packages/contract/openapi.json packages/contract/src/schema.d.ts
git commit -m "feat(releases): D9.2's second half — approval required for a first launch or a sensitive change, never otherwise"
```

**`production.docker.test.ts`'s two refusal cases (lines 310 and 335) are on an unlaunched project**, so predict them unmoved.

- [ ] **Step 6: Negative controls**

| | Control | Predicted |
|---|---|---|
| a | `approvalRequirementFor` ignores `launchedAt` (always `first-launch`) | the positive control red (`RELEASE_DIGEST_NOT_APPROVED`), and the redeploy case red |
| b | `sensitiveChangeOf` built from `sensitiveViewOfSpec` over each release's `AppSpec` | *raises the PRODUCTION override* **green**, because the spec adapter now folds the override (Task 3). **Predicted green, and the reason is Task 3's fix, not a gap.** Then undo Task 3's fold as well and watch it go red |
| c | the `rejected` term dropped from `satisfied` | *refuses a REJECTED release* red |
| d | `no-baseline` returns `required: false` | *fails closed when … nothing was ever approved* red |
| e | `lastApprovedReleaseFor` reverted to Task 3's *before* | *takes the baseline from the LATEST decision* red (R3 self-serve) |

---

## Task 6: The gate for a launched app — self-serve, re-escalated, or not what staging runs

**THIS PLAN'S CENTRE, AND ALONE IN ITS SITTING.** §13's checklist learns that an app has launched. The view a person reads and the refusal they meet stay **one computation** (P6a Decision 2, whose byte-identical assertion is kept). **After this task, a launched app's owner deploys a non-sensitive release with no administrator; a sensitive release is refused `409 RELEASE_REESCALATED` carrying exactly what changed; and a release that is not the one serving staging is refused `409 RELEASE_NOT_STAGED`.**

**Files:**
- Modify: `packages/control-plane/src/launch/readiness.ts` — the `launched` branch; `admin-approval` for a launched app reads Task 5's rule; the view gains three fields
- Modify: `packages/control-plane/src/launch/gate.ts` — `assertLaunchable(db, projectId, releaseId)`, three LITERAL codes
- Modify: `packages/control-plane/src/api/routes/releases.ts` — the deploy route passes `body.releaseId`; its `errors:` and `description`
- Modify: `packages/control-plane/src/api/routes/launch.ts` — `getLaunchReadiness`'s description (it still says *"Read-only in Phase 1"*)
- Modify: `packages/control-plane/src/api/errors.ts` — `ProductionGateError`'s hint BY CODE (*Read this first* 17)
- Modify: `packages/control-plane/src/api/error-codes.ts` — `RELEASE_REESCALATED`, `RELEASE_NOT_STAGED`
- Modify: `packages/control-plane/src/api/representations/launch.ts` — `LaunchReadiness` gains `launched`, `baselineReleaseId`, `sensitiveFields`
- Modify: `packages/control-plane/src/api/subsequent-releases.test.ts`, `api/delivery.test.ts`, `launch/readiness.test.ts`
- Modify: `packages/mock/src/fixtures.ts` — `LAUNCH_READINESS` and every checklist fixture
- Modify: `packages/console/src/screens/launch.tsx`, `deploy.tsx` — *launched*, and the two new refusals
- Modify: `packages/journey/src/production.ts` — step 10 removed (it is Task 11's first leg)
- Regenerate: the contract

**Interfaces:**
- Consumes: Task 5's `productionApprovalFor`, Task 4's `launchedAt`, `candidateFor`.
- Produces:
  ```ts
  export interface LaunchReadinessView {
    projectId: string
    /** P6b: which of D9's two clauses this view is — the first launch's checklist, or a launched app's. */
    launched: boolean
    ready: boolean
    candidateReleaseId: string | null
    /** The last approved release the candidate is diffed against (D9.2); null before launch. */
    baselineReleaseId: string | null
    /** §7's fields the candidate changes since that release, in SENSITIVE_FIELDS order; [] before launch.
     *  `SensitiveField[]`, not `string[]`: the representation is `z.enum(SENSITIVE_FIELDS)`, and the route
     *  returns this view as its body, so a wider type is a `tsc` error at `defineRoute`. */
    sensitiveFields: SensitiveField[]
    /** True for the one refusal an administrator's approval FIXES: launched, an approval required (a sensitive
     *  change, or nothing approved to compare with), none covering the candidate, and NOT rejected. Derived once,
     *  from the same verdict as `admin-approval`, so the gate reads a fact rather than re-deciding one. */
    reescalated: boolean
    items: LaunchItem[]
  }
  export async function assertLaunchable(db: Db, projectId: string, releaseId: string): Promise<LaunchReadinessView>
  ```
  Codes: **`RELEASE_REESCALATED`** and **`RELEASE_NOT_STAGED`** (409, `ProductionGateError`). **Caller:** the production branch of the deploy route (`api/routes/releases.ts:430`).

- [ ] **Step 1: The failing tests — the positive control first, the byte-identical assertion kept**

```ts
// api/subsequent-releases.test.ts — "the gate for a launched app (D9.2)"
it('a launched app’s owner deploys an identical rebuild to production through the ROUTE, with no administrator', …)  // POSITIVE
//   rebuild → release → deploy to staging → GET readiness: launched true, ready true, sensitiveFields [], admin-approval met
//   → POST production deploy (stepped-up owner) → 200 healthy; no approval row for the release
it('refuses a sensitive release: 409 RELEASE_REESCALATED, and the envelope’s checklist IS the read, byte for byte', …)
//   egress change → staging → readiness: ready false, sensitiveFields ['egress.allow'], unmet ['admin-approval']
//   → deploy → refusal(res) === { status: 409, code: 'RELEASE_REESCALATED' }
//   → JSON.stringify(res.json().error.launchReadiness) === JSON.stringify(readRes.json())   ← P6a Decision 2, kept
//   → production still serves the launch instance (GET the environment)
it('deploys it once an administrator has approved it', …)          // approve (Task 9 adds the preview); deploy → 200
it('refuses a release that is not the one serving staging: 409 RELEASE_NOT_STAGED, with the view', …)
//   R_old (approved, launched) vs the candidate R_new (serving staging, ready) → deploy R_old → NOT_STAGED
it('a launched app with NOTHING serving staging is refused for that reason, not a first-launch one', …)   // Review Focus 2
//   → 409 RELEASE_PRODUCTION_GATE_UNAVAILABLE, launched true, scans unmet 'Nothing is serving in staging'
it('a rejected, non-sensitive release: 409 RELEASE_PRODUCTION_GATE_UNAVAILABLE — an approval cannot fix a rejection', …)
it('a rejected SENSITIVE release: RELEASE_PRODUCTION_GATE_UNAVAILABLE too, not RELEASE_REESCALATED — reescalated false', …)
it('an agent’s self-serve promotion is still a question a person answers (D24), and then needs no administrator', …)  // Review Focus 5
//   token deploy → 403 TOKEN_ACTION_PENDING → the owner confirms (stepped up) → the retry → 200 healthy; zero approvals
it('an unlaunched project’s view is P6a’s, unchanged: launched false, reescalated false, baselineReleaseId null, sensitiveFields []', …)
```

**`delivery.test.ts:654`'s positive control** (a helper since Task 4) deploys `releaseId: release.id`, which is the candidate, so `RELEASE_NOT_STAGED` must not fire there. **Predict it green.** If it goes red, the staged check refused the candidate, which is a defect in Step 4.

- [ ] **Step 2: Run — predict**

**Predicted red:** the positive control (`409 RELEASE_PRODUCTION_GATE_UNAVAILABLE`, because the rebuild is not approved and the checklist is first-launch), `RELEASE_REESCALATED` (it answers `GATE_UNAVAILABLE`), `NOT_STAGED` (it answers **`200`**, which is `[M8]`), and the agent case. **Green:** the nothing-in-staging case, *already right by accident* (the first-launch checklist also fails `scans`). **Record that it was green before the change, and why.** It becomes a real assertion once it checks `launched: true`.

- [ ] **Step 3: The launched branch**

In `computeLaunchReadiness`, read `project.launchedAt`. **When it is null, the items are exactly P6a's**, and the view gains `launched: false, reescalated: false, baselineReleaseId: null, sensitiveFields: []`. **When it is set**, the items are Decision 2's:

```ts
  const items: LaunchItem[] = [
    DOMAIN_ITEM,
    await iamItem(db, projectId, usesCwl, candidateAuth?.attributes ?? []),   // Task 7 turns this into the live check
    await piaItem(db, projectId),
    scansItem(candidate?.build.scan as ScanSummary | null | undefined, candidate !== undefined),
    await releaseApprovalItem(db, candidate),                                // D9.2's admin-approval, below
    ...loadRehearsalItems(audience),                                          // unchanged: a large audience cannot launch until P9
    { ...CODE_REVIEW_ITEM },                                                  // Task 8 makes it read the verdict
  ]
```

**No `rehearsal` item**: after launch there is nothing to rehearse (Decisions 2 and 16). **Extract `DOMAIN_ITEM` and `loadRehearsalItems`** so both branches use one statement of each.

```ts
/** §13 D9.2's `admin-approval`, from Task 5's rule — the SAME function `deployRelease` reads. */
async function releaseApprovalItem(db: Db, candidate: LaunchCandidate | undefined): Promise<LaunchItem & { baselineReleaseId: string | null; sensitiveFields: SensitiveField[]; reescalated: boolean }> {
  const base = { id: 'admin-approval' as const, title: 'Release approved by a platform administrator — only when a sensitive field changed (D9)', owner: 'platform admin', blocking: true }
  if (candidate === undefined)
    return { ...base, state: 'unmet', why: 'Nothing is serving in staging yet, so there is no release to promote. Production runs exactly what staging ran (§13).', baselineReleaseId: null, sensitiveFields: [], reescalated: false }
  const v = await productionApprovalFor(db, candidate.release, candidate.build.imageDigest ?? '')
  const extras = {
    baselineReleaseId: v.requirement.baselineReleaseId,
    sensitiveFields: [...v.requirement.fields],
    reescalated: v.requirement.required && !v.covered && !v.rejected,
  }
  if (v.rejected) return { ...base, ...extras, state: 'unmet', why: `An administrator did not approve this release: ${v.latest!.reason}` }
  if (!v.requirement.required)
    return { ...base, ...extras, state: 'met', why: `No sensitive field (§7) changed since the last approved release, so this release goes to production self-serve (D9). Its code is not reviewed: that is §13's residual risk, and containment is its control (§20).` }
  if (v.covered) return { ...base, ...extras, state: 'met', why: `This release changes ${v.requirement.fields.join(', ')}, and an administrator approved it on ${v.latest!.decidedAt.toISOString().slice(0, 10)}, bound to ${v.latest!.imageDigest.slice(0, 19)}…` }
  return { ...base, ...extras, state: 'unmet',
    why: v.requirement.reason === 'no-baseline'
      ? 'This app has launched, but no approved release exists to compare with — so every release needs an administrator until one is approved.'
      : `This release changes ${v.requirement.fields.join(', ')} since the last approved release, so an administrator must approve it before it goes to production (§13, D9).` }
}
```

The view takes `baselineReleaseId`, `sensitiveFields` and `reescalated` **off that item**, and the item's own copies are stripped before it joins `items`, **so there is one derivation**. `readyOf` is unchanged.

- [ ] **Step 4: The gate — three literal throws, and the staged check AFTER readiness**

```ts
export async function assertLaunchable(db: Db, projectId: string, releaseId: string): Promise<LaunchReadinessView> {
  const view = await computeLaunchReadiness(db, projectId)
  if (!view.ready) {
    const unmet = view.items.filter((i) => i.blocking && i.state !== 'met').map((i) => i.id)
    // RELEASE_REESCALATED ONLY WHEN AN APPROVAL IS THE ONE THING MISSING, AND BECAUSE A SENSITIVE
    // FIELD CHANGED (Decision 9) — a client switches on this code to go and ask an administrator,
    // and that would be the wrong errand for a lapsed registration or a rejection.
    // A LITERAL on each line: error-codes.test.ts reads `new ProductionGateError('CODE'` and
    // nothing else (Read this first 17).
    if (view.launched && view.reescalated && unmet.length === 1 && unmet[0] === 'admin-approval')
      throw new ProductionGateError('RELEASE_REESCALATED', view)
    throw new ProductionGateError('RELEASE_PRODUCTION_GATE_UNAVAILABLE', view)
  }
  // AFTER readiness (Decision 8), so every refusal P6a built keeps its code: this one appears only
  // when the checklist is satisfied FOR THE CANDIDATE and the request names something else ([M8]).
  if (view.candidateReleaseId !== releaseId) throw new ProductionGateError('RELEASE_NOT_STAGED', view)
  return view
}
```

**Carry the rejected case through TWO tests**: a rejected release answers `GATE_UNAVAILABLE` **whether or not it is sensitive** (`reescalated` is false for both), because an approval cannot fix a rejection that was already made. **Decision 9 is literally that sentence.** *(Found by the self-review: an earlier draft keyed `RELEASE_REESCALATED` on `sensitiveFields` being non-empty, which sends a client to ask an administrator who has already said no.)*

`api/errors.ts`: the `ProductionGateError` branch picks its hint by `error.code`:

| Code | Hint |
|---|---|
| `RELEASE_PRODUCTION_GATE_UNAVAILABLE` | unchanged for a first launch; for `launchReadiness.launched`, *"The unmet items say what to do; none of them is an administrator's approval alone."* |
| `RELEASE_REESCALATED` | *"This release changes a sensitive field (§7) since the last approved release, so an administrator must approve it (D9): they preview what changed and approve it. Deploy again once they have."* |
| `RELEASE_NOT_STAGED` | *"Production runs exactly what staging ran (§13). Deploy this release to staging first, or deploy the release that is serving staging."* |

- [ ] **Step 5: Representations, contract, mock, console, and `demo-production`'s step 10**

- `LaunchReadiness` gains `launched` (boolean, *"which of D9's two clauses this is"*), `reescalated` (boolean, *"an administrator's approval is what this release is waiting for"*), `baselineReleaseId` (`Uuid.nullable()`) and `sensitiveFields` (`z.array(z.enum(SENSITIVE_FIELDS))`: **`spec/`'s one list**, not a restatement, the rule P6a Task 12 set for item ids). Its description drops *"first-launch"*. **`mapError` drops a checklist that does not parse** (*Read this first* 18): add the fields to the schema and the view in this one commit.
- The deploy route's `errors:` gains both codes, and its description says *"Production answers 409 with the checklist: a first launch's, or — once launched — the self-serve check, re-escalated when a sensitive field changed (§13, D9)."*
- `pnpm contract:write && pnpm contract:generate`; the mock's checklist fixtures gain the three fields.
- **Console, kept small.** `launch.tsx`: *"Launched on <date> — releases go to production without an administrator unless they change a sensitive field (D9)"*, and the sensitive fields when there are any. `deploy.tsx`: for `RELEASE_REESCALATED`, the refusal plus *"An administrator approves it at"* followed by a link to `/releases/<candidateReleaseId>/approval`; `<Refusal>` renders the code and hint already. **Build it** (`pnpm --filter console build`), and **open it against `manifest-mock` once**, to see that the launched text renders (no DOM tier, P5c Decision 7).
- `packages/journey/src/production.ts`: **remove step 10** and its phase entry, and say so in the file's head comment: *"a launched app's rebuild is P6b's subject: `make demo-releases`, leg B"*. **Predict `make demo-production` green on the fresh path after this change**, and green on re-use (Task 4's early stop). **Run it, both paths, before committing.**

- [ ] **Step 6: Gates; commit**

```bash
pnpm test && pnpm test && pnpm lint && pnpm typecheck && pnpm format:check
MANIFEST_TEST_DOCKER=1 pnpm test:docker      # owed: launch/
make demo-journey                             # PREDICT GREEN: journey-app never launches, so its view is P6a's
git add <each path in Files, by name>
git commit -m "feat(launch): D9.2 — a launched app's release is self-serve unless it re-escalates; production runs what staging ran"
```

- [ ] **Step 7: Negative controls — including the two halves, each measured alone**

| | Control | Predicted |
|---|---|---|
| a | `computeLaunchReadiness` ignores `launchedAt` | the positive control red (`409 RELEASE_PRODUCTION_GATE_UNAVAILABLE`, `admin-approval` unmet): P6a's behaviour |
| b | the `RELEASE_NOT_STAGED` line removed | *not the one serving staging* red: `200`, the old release in production (`[M8]`) |
| c | the `RELEASE_REESCALATED` line removed | *refuses a sensitive release* red **on the CODE only** (`409` and the view both unchanged). **The code is the only witness**, which is Decision 9's argument |
| d | **`deployRelease`'s half disabled** (`satisfied` forced `true`), the gate kept | **every route test GREEN**: the gate refuses first. P6a F8's measurement, repeated. Task 5's direct tests are the only witnesses, so re-run them and watch them go red |
| e | **the gate's launched branch disabled** (`assertLaunchable` returns the view unchecked when launched), `deployRelease` kept | *refuses a sensitive release* red **on the CODE**: `409 RELEASE_DIGEST_NOT_APPROVED` with **no `launchReadiness`**. That is the second half answering alone. **Two independent controls, each seen** |
| f | `sensitiveFields` left out of the representation | the byte-identical assertion red, **because the `409` arrives with NO checklist** (`mapError` drops what does not parse): *Read this first* 18, watched |
| g | `reescalated` derived without `!v.rejected` | *a rejected SENSITIVE release* red: `RELEASE_REESCALATED` where `GATE_UNAVAILABLE` is expected. **The self-review's own defect, kept as a control** |

---

## Task 7: The IAM change request — what UBC registered changes only when UBC registers it

**§9's second production obligation, and the hole Task 1's `[M9]` measured.** Today an administrator filing a change request overwrites the attributes UBC registered with the ones merely requested. From then on the build-time check passes an attribute UBC does not release, and students get a broken login. **This task makes the registration's own `change_requested` state the change request** (Decision 11), and it makes the gate check the *live* registration for every production release of a launched app.

> **Question 2 (Rich) decides one condition in this task**, and nothing else in it: whether a *removal*
> waits for IAM. The plan builds the recommended answer, **an addition waits and a removal does not**.
> Control (e) is the switch, and it is predicted.

**Files:**
- Modify: `packages/control-plane/src/db/schema.ts` — `iamRegistrations.requestedAttributes`, `.registeredAt`
- Create: `packages/control-plane/drizzle/0022_*.sql` — generated, **plus one appended backfill line, said so in a comment**
- Modify: `packages/control-plane/src/launch/records.ts` — the rules
- Modify: `packages/control-plane/src/launch/readiness.ts` — `registrationCovers`; the first-launch item gains ACS/SLO; the launched branch uses `liveRegistrationItem`
- Modify: `packages/control-plane/src/spec/registered-attributes.ts` — the build-time message names how to record the change request
- Modify: `packages/control-plane/src/api/representations/launch.ts` — `IamRegistration` + `requestedAttributes`, `registeredAt`; `RecordIamRegistrationRequest` + `requestedAttributes`
- Modify: `packages/control-plane/src/api/routes/launch.ts` — pass it through; the description
- Modify: `packages/control-plane/src/launch/records.test.ts`, `readiness.test.ts`, `api/subsequent-releases.test.ts`
- Modify: `packages/mock/src/fixtures.ts`; `packages/console/src/screens/records.tsx`
- Regenerate: the contract

**Interfaces:**
- Consumes: `recordIamRegistration`, `iamTransition`, `unregisteredAttributes`, Task 6's launched branch.
- Produces:
  ```ts
  export interface RegistrationShape { acsUrl: string; sloUrl: string; attributes: readonly string[] }
  export function registrationCovers(row: Pick<IamRegistrationRow, 'acsUrl' | 'sloUrl' | 'registeredAttributes'>, would: RegistrationShape):
    { covers: boolean; missing: string[]; unused: string[]; acsDiffers: boolean; sloDiffers: boolean }
  ```
  `RecordIamInput.requestedAttributes?: string[]`. **Callers:** `iamItem` (first launch) and `liveRegistrationItem` (launched) both call `registrationCovers`, so **the two checklists share one statement of *covers***.

- [ ] **Step 1: The failing tests**

```ts
// launch/records.test.ts — "the change request (§9, Decision 11)"
it('files a change request: active → change_requested keeps what UBC registered and stores what is requested', …)  // POSITIVE
it('refuses to change registeredAttributes outside `active` once registered: 400 LAUNCH_RECORD_INVALID — [M9]', …)
it('refuses a change request from `active` that names nothing requested: 400 LAUNCH_RECORD_INVALID', …)
it('change_requested → submitted → active records the new registration, clears the request, moves registeredAt', …)
it('refuses a different entityID once registered: 400 LAUNCH_RECORD_INVALID — §9: fixed at registration', …)
it('before the first `active`, registeredAttributes may still be edited — the first registration is P6a’s, unchanged', …)

// launch/readiness.test.ts — the first launch
it('iam-registration is unmet when the recorded ACS is not the one this release derives — [M10]', …)
it('…and met when it is (the positive control in the same file)', …)

// api/subsequent-releases.test.ts — a launched CWL app
//   launchedProject builds fixture-node, whose descriptor offers `auth_providers: [none]`, so these
//   cases need `node-ts-mongo@1` (which the unit tier's blueprint root also loads — `api/testing.ts:87`)
//   with a minimal CWL manifest: no services, no models, attributes [ubcEduCwlPuid, mail].
//   **THE HARNESS REFUSES A CWL DEPLOY ON PURPOSE** (`api/testing.ts` ~304: its `sso` throws *"move that
//   test to the Docker tier"*), and its `signIn` throws too. So `launchedCwlProject` spreads TWO LABELLED
//   FAKES over `testDeps()`: an `sso` that records the registration it was asked for and answers it, and a
//   `signIn` that answers a passing sign-in releasing exactly the registered attributes. **Say in a comment
//   why that is acceptable here and nowhere else**: the subject is D9.2's gate, not the registration, and
//   the Docker tier (`production.docker.test.ts`) and Task 11's acceptance drive the real IdP. Then the
//   first launch goes through the ROUTES — records, rehearsal, preview-and-approve (from Task 9), deploy.
it('a release that ADDS an attribute: its BUILD fails (§7), naming the change request', …)
it('while the change request is change_requested or submitted, the build still fails — UBC has not registered it', …)
it('once it is active with the attribute, the build passes, and the release RE-ESCALATES (auth.attributes)', …)
it('a release built BEFORE the registration shrank is refused by the live check, naming what is missing', …)
//   §9's ordering, for D9.2: build with [puid, mail, sn] while registered has all three; the admin then records
//   active with [puid, mail] (UBC removed sn); the candidate → iam-registration unmet → GATE_UNAVAILABLE
it('a REMOVAL re-escalates but does not wait on IAM, and says UBC still releases what the app stopped asking for', …)
it('an `expired` registration stops every release, self-serve included', …)
it('an auth.callback change — a new ACS UBC never registered — is refused until the registration says so', …)
```

- [ ] **Step 2: Run — predict**

**Predicted red:** every rule case. **`[M9]`'s case answers `200`** and stores the four attributes. The ACS case reads `met`. The ordering case deploys: a launched app's `iam-registration` today requires `active` and the subset, so predict **which half** catches it before you run it. **The `expired` case: predict red**, because P6a's item reads `active` only, and an expired registration is not active. If it is green already, record why, and keep the test.

- [ ] **Step 3: Schema, and the migration with its one hand-appended line**

```ts
    /**
     * WHAT A CHANGE REQUEST ASKS UBC IAM FOR (§9, P6b Decision 11) — the registration's own
     * `change_requested` state IS the change request. Null when none is outstanding; cleared
     * when UBC's answer is recorded `active`.
     */
    requestedAttributes: jsonb('requested_attributes').$type<string[]>(),
    /** When UBC last REGISTERED this SP — set on reaching `active`. Null until the first time. */
    registeredAt: timestamp('registered_at', { withTimezone: true }),
```

```bash
pnpm --filter @manifest/control-plane db:generate
# READ it. Then APPEND, by hand — drizzle cannot express data — with a comment saying so:
#   -- P6b Task 7: a registration already active was registered; nothing else can be known.
#   UPDATE "iam_registrations" SET "registered_at" = "updated_at" WHERE "state" = 'active';
```

- [ ] **Step 4: The record's rules**

In `recordIamRegistration`, after `state` is computed:

```ts
  // §9's CHANGE REQUEST (Decision 11): once UBC has registered this SP, what it registered
  // changes ONLY when the record says it registered something new — `active`. Anything else
  // would make this row claim a registration UBC has not made ([M9]), and §7's build-time
  // check reads exactly this column.
  if (existing?.registeredAt != null) {
    if (input.entityId !== existing.entityId)
      throw new LaunchRecordError('LAUNCH_RECORD_INVALID', 'the entityID is fixed at registration (§9): a new one is a new registration, not a change', 'Record the entityID UBC IAM registered.')
    const unchanged = sameAttributeSet(input.registeredAttributes, existing.registeredAttributes) &&
      input.acsUrl === existing.acsUrl && input.sloUrl === existing.sloUrl
    if (state !== 'active' && !unchanged)
      throw new LaunchRecordError('LAUNCH_RECORD_INVALID',
        `what UBC IAM registered changes only when it registers it: record the registration 'active' with the new values. A change it has not registered yet is requestedAttributes`,
        'Keep registeredAttributes, acsUrl and sloUrl as UBC has them; put what you are asking for in requestedAttributes.')
  }
  if (from === 'active' && state === 'change_requested' && (input.requestedAttributes?.length ?? 0) === 0)
    throw new LaunchRecordError('LAUNCH_RECORD_INVALID', 'a change request names what it asks for: requestedAttributes', 'List every attribute the app will ask for once UBC IAM agrees.')
  const requestedAttributes = state === 'active' ? null : (input.requestedAttributes ?? existing?.requestedAttributes ?? null)
  const registeredAt = state === 'active' ? new Date() : (existing?.registeredAt ?? null)
```

Both values join the insert and the `onConflictDoUpdate` set. **The event stays as it is**: attributes stay off the stream (P6a Decision 14).

- [ ] **Step 5: One statement of *covers*, two items**

```ts
export function registrationCovers(row, would) {
  const missing = unregisteredAttributes(would.attributes, row.registeredAttributes)
  const unused = row.registeredAttributes.filter((a) => !would.attributes.includes(a))
  const acsDiffers = row.acsUrl !== would.acsUrl
  const sloDiffers = row.sloUrl !== would.sloUrl
  return { covers: missing.length === 0 && !acsDiffers && !sloDiffers, missing, unused, acsDiffers, sloDiffers }
}
```

`would` is **the candidate's production shape**. That is `https://<production hostname><auth.callback>`, and the same for `logout`, which is how `rehearsalItem` already derives it (`rehearsal.ts:416-419`). **`iamItem` (first launch) now calls it**, so a wrong recorded ACS is `unmet` (`[M10]`). **`liveRegistrationItem` (launched)** is `met` when:

- `registeredAt !== null`;
- `state !== 'expired'`;
- and `covers`.

Its `why` says, in words:

- **which attributes are missing**, and whether a change request is on file: its state, its ticket and what it asks for. When none is on file, it says how to file one (*"record it `change_requested` with `requestedAttributes`"*);
- **ACS or SLO differs**: *"auth.callback moved the ACS to … but UBC registered … — raise an IAM change request"*;
- **`expired`**: *"the registration lapsed (D20) — nothing reaches production until it is registered again"*;
- **`met` with `unused`**: *"UBC still releases <attrs> to this app, which no longer asks for them — a change request would stop it (data minimisation)"*.

**Under the recommended answer to Question 2, a REMOVAL is covered** (`missing` is empty), so this item is `met`. The re-escalation comes from `admin-approval`, because `auth.attributes` is a sensitive field.

`spec/registered-attributes.ts`: `AttributeDriftError`'s message gains *"— an administrator records it on the project as `change_requested`, with the attributes it asks for"*.

- [ ] **Step 6: Representations, console, mock, contract; gates; commit**

- `IamRegistration` gains `requestedAttributes: z.array(z.string()).nullable()` and `registeredAt: Timestamp.nullable()`. `RecordIamRegistrationRequest` gains `requestedAttributes: z.array(z.string().min(1)).min(1).max(64).optional()`, described as *"what a change request asks for; required when a registration goes from `active` to `change_requested`."*
- `records.tsx`: shows *registered* and *requested* side by side, plus *registered since*. The form offers a requested-attributes field when the chosen state is `change_requested` or `submitted`. **Open it against the mock once.**

```bash
pnpm contract:write && pnpm contract:generate
pnpm test && pnpm test && pnpm lint && pnpm typecheck && pnpm format:check
MANIFEST_TEST_DOCKER=1 pnpm test:docker      # owed: launch/
make demo-production                          # PREDICT GREEN: it records the ACS it derives, so [M10]'s check is met
git add <each path in Files, by name — drizzle/0022_*.sql and drizzle/meta/* included>
git commit -m "feat(launch): §9's IAM change request — what UBC registered changes only when UBC registers it"
```

- [ ] **Step 7: Negative controls**

| | Control | Predicted |
|---|---|---|
| a | the registered-set rule removed | *refuses to change registeredAttributes outside `active`* red. **And downstream**: *while the change request is change_requested … the build still fails* red, because the build **passes** once the record overwrote the set. `[M9]`'s consequence, watched |
| b | `liveRegistrationItem` accepts `expired` | *an `expired` registration stops every release* red |
| c | ACS/SLO dropped from `registrationCovers` | both ACS cases red (first launch and launched) |
| d | `requestedAttributes` not cleared on `active` | *…clears the request* red |
| e | **Question 2's switch**: `missing.length === 0` becomes *the sets are equal* | *a REMOVAL re-escalates but does not wait on IAM* red (`unmet`). **The one-line switch if Rich chooses (b).** Restore it unless he has |

---

## Task 8: R4(d) — a security-aware summary that carries the reviewer's verdict

**Rich's R4(d), from the brief's §5**: §13's AI-written summary *"gains a security dimension and surfaces the reviewer's verdict beside it."* **Coverage limit, stated in the record itself**: under D9 an administrator sees a first launch and a re-escalation, **never a self-serve release** (D33). **Decision 13 makes the security dimension deterministic first**, because no test can assert what a model noticed. And **the `code-review` item stops being static** (P6a F7, Decision 12).

**Files:**
- Modify: `packages/control-plane/src/spec/diff.ts` — `SECURITY_NOTES: Record<SensitiveField, string>`, `securityNotesFor(fields)`
- Modify: `packages/control-plane/src/releases/approval.ts` — the snapshot gains `baselineReleaseId`, `sensitiveFields`, `security`, `coverage`; **the reviewer runs BEFORE the summary**
- Modify: `packages/control-plane/src/releases/summary.ts` — the security framing, the verdict, the coverage limit; `'no-changes'`
- Modify: `packages/control-plane/src/db/schema.ts` — `DiffSnapshot`'s new keys, **optional**, because P6a's rows lack them
- Modify: `packages/control-plane/src/launch/readiness.ts` — `code-review` reads the newest recorded verdict for the candidate
- Modify: `packages/control-plane/src/api/representations/releases.ts` — `ApprovalDiff` + the four keys; `summarySource` + `'no-changes'`
- Modify: `packages/control-plane/src/releases/summary.test.ts`, `approval.test.ts`, `launch/readiness.test.ts`
- Modify: `packages/console/src/screens/approvals.tsx` — renders the notes, the fields, the coverage limit, and `'no-changes'`
- Modify: `packages/mock/src/fixtures.ts`; regenerate the contract

**Interfaces:**
- Consumes: Task 3's `sensitiveChangeOf`, `describeVerdict`, `ServerDeps.reviewer`.
- Produces: `SECURITY_NOTES`, `securityNotesFor(fields: readonly SensitiveField[]): { field: SensitiveField; note: string }[]`, and `COVERAGE_LIMIT: string` (in `releases/approval.ts`). `summariseChanges(ai, changes, context: { security; review; coverage })`, and `ChangeSummary.summarySource: 'llm' | 'unavailable' | 'no-previous-release' | 'no-changes'`. **And `latestReviewFor(db: Db, releaseId: string): Promise<DiffSnapshot['review'] | undefined>`** in `releases/approval.ts`: the newest verdict recorded for a release, read from `approvals` here and from `approval_previews` too from Task 9. **`launch/readiness.ts` reads it through `releases/`, never the table itself**, the direction the import already runs. **Callers:** `buildDiffSnapshot` (whose only caller is still `decide()` until Task 9 moves it into the preview), and `codeReviewItem` for `latestReviewFor`.

- [ ] **Step 1: The failing tests**

```ts
// releases/summary.test.ts — a recording fake LiteLlmClient: `post` stores its body and answers a fixed text
it('asks the model with the security notes, the reviewer’s verdict and the coverage limit in the request', …)
//   → the user message contains each note's text, `review.detail`, and COVERAGE_LIMIT;
//   → the system message says to state the verdict as given and never to imply code was reviewed
it('the positive control: a change with no sensitive field carries no security note', …)
it('records `no-changes` — not `llm` — for the fixed sentence no model wrote', …)       // Read this first 12
it('still records the notes when the model is DOWN — the security reading is not the model’s', …)
//   ai: undefined → summary null, summarySource 'unavailable', security non-empty

// releases/approval.test.ts
it('the snapshot names the baseline, the sensitive fields and a note for each', …)       // an egress change
it('asks the reviewer BEFORE the model, so the summary can carry the verdict', …)       // a recording reviewer + a recording LLM: call order
it('a first launch: no baseline, no sensitive fields, and the coverage limit still stated', …)

// launch/readiness.test.ts — P6a F7
it('code-review reads the newest verdict recorded for the candidate: clean → met, still non-blocking', …)
it('findings → unmet, naming the count; not_performed → not_built, in the reviewer’s own words', …)
it('with no verdict recorded, it says a reviewer runs only for a first launch or a re-escalation (D33)', …)
```

- [ ] **Step 2: Run — predict**

**Predicted red:** all but the positive control. **`no-changes` answers `'llm'` today**, which is *Read this first* 12.

- [ ] **Step 3: The notes, and why they are a `Record`**

```ts
/**
 * R4(d): what each of §7's seven fields MEANS for security and privacy when it changes — the
 * deterministic half of the approval summary's security dimension (P6b Decision 13), present
 * when the model is down. A `Record<SensitiveField, …>` so an eighth field is a `tsc` error
 * here rather than a change nobody explains to an administrator.
 */
export const SECURITY_NOTES: Record<SensitiveField, string> = {
  services: 'A service stores data somewhere new — the PIA’s “where it is stored” (§9) may no longer be accurate.',
  'auth.attributes': 'The app receives different personal information about every person who signs in. In production it must stay within what UBC IAM registered (§7, §9), and it is an input to the PIA.',
  'egress.allow': 'The app may send data to a host it could not reach before. Default-deny egress is §20’s containment for unreviewed code, and this widens it. An input to the PIA’s “where it flows”.',
  resources: 'More CPU, memory, processes or disk: cost and blast radius rather than data.',
  'data.classification': 'The app now claims a different class of data, which bounds the models it may use (D17) and is an input to the PIA.',
  'ai.models': 'A model change can move personal information to a different jurisdiction, which invalidates an approved PIA (§7, §9) — the administrator decides whether the PIA must be reviewed again.',
  blueprint: 'Under D13 the blueprint is the build definition: a change replaces the Dockerfile, base image and knowledge pack beneath the app.',
}
```

*(If Rich answers Question 3 with (b) or (c), `ai.models`'s sentence changes and a task is added. Nothing else in this task moves.)*

```ts
// releases/approval.ts
/** D33's coverage limit, written into every record so no reader mistakes an approval for a code review. */
export const COVERAGE_LIMIT =
  'An administrator sees a first launch and any release that changes a sensitive field (§7). A release that changes none reaches production without an administrator, and its code is reviewed by nothing (§13’s residual risk); containment is the control (§20).'
```

- [ ] **Step 4: The snapshot, in the new order**

In `buildDiffSnapshot`:

1. compute `changes` (`describeDiff`, unchanged) **and `sensitiveChangeOf(release)`**;
2. **ask the reviewer** (`reviewOf`, unchanged);
3. **then** call `summariseChanges(deps.llm, changes, { security, review, coverage: COVERAGE_LIMIT })`.

The snapshot gains `baselineReleaseId: baseline?.id ?? null`, `sensitiveFields: fields`, `security: securityNotesFor(fields)` and `coverage: COVERAGE_LIMIT`. **`previous` and the sensitive diff's `baseline` are the same call**, `lastApprovedReleaseFor`, so read it once and pass it to both.

The system prompt in `summary.ts` becomes:

> *You summarise changes to a university web application's configuration for a platform administrator deciding whether to allow it into production. Three sentences at most, plain English. Say what changed and what each change could expose — personal information, where data can go, what the app can reach. State the code reviewer's verdict exactly as given, in one sentence. Never say or imply that the application's code was reviewed unless the verdict says it was. Do not invent anything that is not in the list.*

The user message lists the changes, then the notes under *"Security notes:"*, then *"Code review: <review.detail>"*, then the coverage sentence.

- [ ] **Step 5: `code-review` reads the verdict (Decision 12)**

`CODE_REVIEW_ITEM` becomes `await codeReviewItem(db, candidate)`. It calls `latestReviewFor(db, candidate.release.id)`, which reads the newest `diff_snapshot->'review'` recorded **for the candidate release** from `approvals`; **Task 9 adds `approval_previews` to that function as a second source, in its own commit**, and the item does not change. It maps `not_performed` → `not_built` (with `builtBy`, as P6a's item has), `clean` → `met`, and `findings` → `unmet` (*"N finding(s) — <reviewer>"*). **`blocking: false` in every branch.** With nothing recorded, it answers `not_built` with *"No reviewer has looked at this release. A reviewer runs when an administrator previews an approval — a first launch or a re-escalation — and never for a self-serve release (D33)."* **`readiness.test.ts`'s Decision 13 case (`ready` unaffected by `code-review`) must stay green.** It is P6a's control that keeps production reachable.

- [ ] **Step 6: Representation, console, mock, contract; gates; commit**

`ApprovalDiff` gains:

- `baselineReleaseId: Uuid.nullable()`;
- `sensitiveFields: z.array(z.enum(SENSITIVE_FIELDS))`;
- `security: z.array(z.object({ field: z.enum(SENSITIVE_FIELDS), note: z.string() }))`;
- `coverage: z.string().nullable()`, which is **null only for a record made before P6b**;
- and `'no-changes'` in `summarySource`.

`toApproval` defaults the first three for an old row (`null`, `[]`, `[]`). **A mapper that grows a defaulting argument is `.map(fn)`'s index trap** (P5b sitting 7), so keep the defaults inside the mapper's body.

`approvals.tsx`: `DecisionRecord` gains *Sensitive fields*, *Security notes* (one line each), *Compared with* (the baseline release, linked) and the coverage sentence under the summary. `Summary` gets a branch for `'no-changes'` that says *"Nothing in manifest.yaml changed since the last approved release."*, **not the *"could not be produced"* fallback it would otherwise reach.**

```bash
pnpm contract:write && pnpm contract:generate
pnpm test && pnpm test && pnpm lint && pnpm typecheck && pnpm format:check
MANIFEST_TEST_DOCKER=1 pnpm test:docker     # owed: releases/, launch/
git add <each path in Files, by name>
git commit -m "feat(releases): R4(d) — a security-aware summary carrying the reviewer's verdict; code-review reads it"
```

- [ ] **Step 7: Negative controls**

| | Control | Predicted |
|---|---|---|
| a | `SECURITY_NOTES['egress.allow']` deleted | **`pnpm typecheck` red and `pnpm test` GREEN**: a control only `tsc` can see, by design. Record both results |
| b | the verdict dropped from the user message | *asks the model with … the reviewer's verdict* red |
| c | `reviewOf` moved back after `summariseChanges` | *asks the reviewer BEFORE the model* red |
| d | `codeReviewItem` returns P6a's static item | *code-review reads the newest verdict … clean → met* red; **the Decision 13 case stays green**, as it must |
| e | the `'no-changes'` branch answers `'llm'` again | *records `no-changes`* red |

---

## Task 9: The stored preview — what an administrator reads is what the approval records

**Rich's decision of 2026-09-22, built.** An administrator asks for a preview, the platform **stores** it, and approve and reject must **name** it. At decision time the platform recomputes the **facts** and refuses if they changed. **The summary and the verdict are never recomputed**: the record copies the preview's, because those are what was shown (Decision 10).

> **THIS TASK AND TASK 10 SHARE A SITTING, AND THE ORDER MATTERS.** Between this task's commit and
> Task 10's, the console's Approve button answers `400 APPROVAL_PREVIEW_REQUIRED`, which `<Refusal>`
> renders. **That window must not cross a session boundary.** If the sitting runs short, stop after
> this task and sweep, and **state the broken button in §7e's first paragraph.**

**Files:**
- Modify: `packages/control-plane/src/db/schema.ts` — `approvalPreviews`; `approvals.previewId`
- Create: `packages/control-plane/drizzle/0023_*.sql` — generated, then read
- Create: `packages/control-plane/src/releases/preview.ts`, `preview.test.ts`
- Modify: `packages/control-plane/src/spec/diff.ts` — export `stable`, so `sameFacts` uses the one serialisation that already ignores key order
- Modify: `packages/control-plane/src/releases/approval.ts` — `buildDiffSnapshot` becomes `diffFactsFor` + `annotate`; `recordApproval` takes `previewId`
- Modify: `packages/control-plane/src/api/routes/releases.ts` — `createApprovalPreview`, `getApprovalPreview`; `decide()` binds the preview
- Modify: `packages/control-plane/src/api/representations/releases.ts` — `ApprovalPreview`; `Approval` + `previewId`, `decidedByName`; the two requests + `previewId`
- Modify: `packages/control-plane/src/api/error-codes.ts` — `APPROVAL_PREVIEW_REQUIRED` (400, `BadRequestError`), `APPROVAL_PREVIEW_EXPIRED` and `APPROVAL_PREVIEW_STALE` (409, `ReleaseError`)
- Modify: `packages/control-plane/src/api/authz-contract.ts` — nine actors for each new route
- Modify: `packages/control-plane/src/releases/approval.ts`'s `latestReviewFor` — previews become its second source, so `codeReviewItem` sees a verdict from the moment an administrator previews
- Modify: `packages/control-plane/src/api/testing.ts` — `launchedProject` approves through a preview
- Modify: every test that approves or rejects: `grep -rlE '/(approve|reject)' packages/control-plane/src --include='*.test.ts'`
- Modify: `packages/console/src/coverage.test.ts` — the two operations parked in `DELIBERATELY_UNCALLED`, remover: *Task 10, this sitting*
- Modify: `packages/mock/src/server.ts`, `fixtures.ts` — two answers, the changed shapes
- Modify: `packages/journey/src/production.ts` — step 7 previews, then approves naming the preview, and asserts the record equals it
- Regenerate: the contract

**Interfaces:**
- Consumes: Task 8's snapshot, `assertStepUp`, `requireSession`, Task 2's person-only rule (both new routes assert `release:approve`).
- Produces:
  ```ts
  // releases/preview.ts
  export const PREVIEW_TTL_MS = 30 * 60 * 1000
  export type PreviewRow = typeof approvalPreviews.$inferSelect
  /** The deterministic half of a snapshot — what the approval compares. NEVER the summary or the verdict. */
  export type DiffFacts = Omit<DiffSnapshot, 'summary' | 'summarySource' | 'review'>
  export function factsOf(snapshot: DiffSnapshot): DiffFacts
  /** Key-order-insensitive: spec/diff.ts's `stable`, EXPORTED for this (one serialisation, not a second). */
  export function sameFacts(a: DiffFacts, b: DiffFacts): boolean
  export async function recordPreview(db: Db, input: { release: ReleaseRow; actor: { userId: string }; snapshot: DiffSnapshot; digest: string; now?: Date }): Promise<PreviewRow>
  export async function previewFor(db: Db, previewId: string, releaseId: string): Promise<PreviewRow | undefined>
  export async function assertPreviewCurrent(deps: SnapshotDeps, preview: PreviewRow, release: ReleaseRow, digest: string, now?: number): Promise<void>
  // releases/approval.ts
  export async function diffFactsFor(deps: Pick<SnapshotDeps, 'db'>, release: ReleaseRow, digest: string): Promise<DiffFacts>
  export async function annotate(deps: SnapshotDeps, release: ReleaseRow, facts: DiffFacts): Promise<Pick<DiffSnapshot, 'summary' | 'summarySource' | 'review'>>
  ```
  Routes: **`POST /v1/releases/{releaseId}/approval-preview`** → `201 ApprovalPreview`, and **`GET /v1/releases/{releaseId}/approval-previews/{previewId}`** → `200 ApprovalPreview`. **Callers:** Task 10's approvals screen; `make demo-production`'s step 7 and `make demo-releases`; `launchedProject`.

- [ ] **Step 1: The failing tests — the positive control counts the model's calls**

```ts
// releases/preview.test.ts and the approval route tests. The LLM is a fake whose `post` answers
// "summary #1", "summary #2", … — a model that answers differently on every call (Read this first 13).
it('a preview, then an approval naming it: 201, the approval’s diff DEEP-EQUALS the preview’s, and the model was asked ONCE', …)  // POSITIVE
it('refuses an approval that names no preview: 400 APPROVAL_PREVIEW_REQUIRED, and writes no row', …)
it('refuses a preview of ANOTHER release: 404 NOT_FOUND', …)
it('refuses an expired preview: 409 APPROVAL_PREVIEW_EXPIRED', …)                          // now + PREVIEW_TTL_MS + 1
it('refuses a stale preview after ANOTHER release of the project was approved: 409 APPROVAL_PREVIEW_STALE', …)  // Review Focus 1
//   preview R2 (diffed against R1); approve R3 (through its own preview); approve R2 naming the OLD preview → STALE;
//   a NEW preview of R2 → 201. The positive half in the same test.
it('a rejection binds a preview too, and records ITS summary', …)
it('the preview itself needs no step-up, and an approval still does', …)
it('a token is refused on both new routes: TOKEN_CREDENTIAL_REFUSED (the route), and TOKEN_PERSON_ONLY on the synthetic probe', …)
it('the approval names the person who decided — decidedByName (P6a F16)', …)
```

- [ ] **Step 2: Run — predict**

**Predicted red:** all of them. **The positive control fails by recording `summary #2`**, which is Rich's reason for the decision, measured.

- [ ] **Step 3: The table, and the migration**

```ts
/**
 * §13's "exact diff shown at decision time", made true BEFORE the decision (Rich, 2026-09-22;
 * P6b Decision 10). An administrator asks for one, reads it, and names it when deciding; the
 * approval COPIES its snapshot. INSERT ONLY, like `approvals`, and for the same reason.
 */
export const approvalPreviews = pgTable('approval_previews', {
  id: uuid('id').primaryKey().defaultRandom(),
  releaseId: uuid('release_id').notNull().references(() => releases.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  imageDigest: text('image_digest').notNull(),
  diffSnapshot: jsonb('diff_snapshot').notNull().$type<DiffSnapshotColumn>(),
}, (t) => [index('approval_previews_release_idx').on(t.releaseId)])
```

Hoist the `$type<…>` shape `approvals.diffSnapshot` declares into one named type, `DiffSnapshotColumn`, and have both columns use it. **One statement of the snapshot's shape.** `approvals` gains `previewId: uuid('preview_id').references(() => approvalPreviews.id)`, **nullable**, because P6a's rows have none.

- [ ] **Step 4: `decide()` binds the preview**

After P6a's four guards and the digest:

```ts
  // 5. RICH'S DECISION (2026-09-22): the administrator saw the diff BEFORE deciding, as a STORED
  //    preview, and names it. `previewId` is optional in the SCHEMA and required HERE —
  //    Decision 15: a refusal an older client meets, rather than a document that stops
  //    generating (D23.8).
  if (previewId === undefined)
    throw new BadRequestError('APPROVAL_PREVIEW_REQUIRED', 'an approval names the preview the administrator read',
      'POST /v1/releases/{releaseId}/approval-preview, read it, then decide naming its id.')
  const preview = await previewFor(deps.db, previewId, joined.release.id)
  if (preview === undefined) throw new AuthorizationError('NOT_FOUND', `no preview '${previewId}' of release '${joined.release.id}'`)
  // 6. EXPIRED, then STALE — the facts recomputed NOW; never the summary, never the verdict.
  await assertPreviewCurrent(deps, preview, joined.release, digest)
  return toApproval(await recordApproval(deps.db, deps.bus, {
    release: joined.release, actor, decision, previewId: preview.id,
    ...(reason === undefined ? {} : { reason }),
    diffSnapshot: preview.diffSnapshot,     // WHAT WAS SHOWN — not a second call to the model
    imageDigest: digest,
  }))
```

`assertPreviewCurrent` throws `new ReleaseError('APPROVAL_PREVIEW_EXPIRED', …)` or `new ReleaseError('APPROVAL_PREVIEW_STALE', …)`, **each a literal**. The stale message names what moved, and whenever the baseline moved it says so: *"the last approved release of this project changed since this preview was taken — take a new one."*

**`createApprovalPreview`** runs `requireSession`, then the release, then `assertCapability(…, 'release:approve')`, then the digest. It then builds `diffFactsFor` and `annotate`, calls `recordPreview`, and answers `201`. **No step-up, because a preview decides nothing.** **`getApprovalPreview`** is `requireSession` plus `release:approve`, then `previewFor`, answering `200` or `404`. The console re-reads the preview after the step-up round trip instead of asking the model again (*Read this first* 23).

- [ ] **Step 5: The matrix rows, the helper, the demo, the mock, D22's park, the contract**

- **Matrix**, two rows. `POST …/approval-preview`: `owner 403, collaborator 403, stranger 404, admin 'pass'` (**no step-up**, so an admin passes), `anonymous 401`, and all four tokens `SESSION_ONLY`. `GET …/approval-previews/:previewId`: the same, **with a fixture preview** the table creates in setup, as it does its fixture approval.
- **`launchedProject`**: preview, then approve naming it. **Every other test that approves** is changed the same way. Predict the count from the grep in *Files*.
- **`packages/journey/src/production.ts` step 7**: `POST …/approval-preview` (checking that `summarySource` is `no-previous-release` on a first launch, and that `coverage` is present), then approve with `previewId`, then **`checks.ok('the approval records exactly what was previewed', JSON.stringify(approval.diff) === JSON.stringify(preview.diff))`**. **Run `make demo-production` on both paths before committing.**
- **`coverage.test.ts`**: `createApprovalPreview` and `getApprovalPreview` in `DELIBERATELY_UNCALLED`, each with the reason *"P6b Task 10 gives it the approvals screen, in the same sitting"*.
- **Mock**: `ANSWERS` gains both, with an `APPROVAL_PREVIEW` fixture; `APPROVAL` gains `previewId` and `decidedByName`.

```bash
pnpm contract:write && pnpm contract:generate
pnpm test && pnpm test && pnpm lint && pnpm typecheck && pnpm format:check
git add <each path in Files, by name — drizzle/0023_*.sql and drizzle/meta/* included>
git commit -m "feat(releases): the stored preview — an approval records exactly what the administrator read"
```

- [ ] **Step 6: Negative controls**

| | Control | Predicted |
|---|---|---|
| a | `decide()` calls `buildDiffSnapshot` again instead of copying the preview | the positive control red **twice**: `summary #2` in the record, and the model asked twice. **Offline, with the model down, both summaries are `null`**, and this control **cannot fail in the acceptance** (Task 11, control c) |
| b | `sameFacts` compares the whole snapshot, summary included | the positive control red: `409 APPROVAL_PREVIEW_STALE` on **every** approval, because the model never answers twice alike |
| c | the expiry check removed | *refuses an expired preview* red (`201`) |
| d | `previewFor` ignores `releaseId` | *a preview of ANOTHER release* red (`201`, and the wrong diff recorded) |
| e | the `APPROVAL_PREVIEW_REQUIRED` check removed | *names no preview* red **on the code**: `previewFor(undefined, …)` answers `404 NOT_FOUND`. Predict it; if it answers `500`, that is a finding about `previewFor` |

---

## Task 10: The approvals screen — the preview before the decision, kept through the step-up

**The clicked half of Rich's decision.** An administrator opening a release's approval page sees the diff **first**. They click Approve and are sent through the IdP to step up, and **they come back to the same preview**, re-read from the store, not a fresh one the model wrote differently. The record they then make **is** that preview. **P6a's screen said, in its own words, that this was not possible** (`approvals.tsx:276-281`), and this task removes those words.

**Files:**
- Modify: `packages/console/src/api.ts` — `createApprovalPreview`, `getApprovalPreview`; `approveRelease`/`rejectRelease` take `previewId`
- Modify: `packages/console/src/api.test.ts` — the four functions, against the document
- Modify: `packages/console/src/screens/approvals.tsx` — `Preview`, `Decide` naming it, the query string, *preview again*
- Modify: `packages/console/src/coverage.test.ts` — **`DELIBERATELY_UNCALLED` empty again**
- Modify: `packages/console/src/ui.tsx` — only if `<Refusal>` needs a hook for *preview again* (prefer the screen)

**Interfaces:**
- Consumes: Task 9's two operations and the changed requests; `stepUpUrl`; `<Refusal>`.
- Produces: the screen. **No DOM test tier exists** (P5c Decision 7). The screen is proved by `tsc`, by D22's gate, by a click-through against `manifest-mock`, and by Task 11's clicked half.

- [ ] **Step 1: The API functions, and D22's reckoning**

`api.ts` gains `createApprovalPreview(releaseId, key)` and `getApprovalPreview(releaseId, previewId)`, and passes `previewId` through `approveRelease` and `rejectRelease`. **Remove both entries from `DELIBERATELY_UNCALLED`**, and restore the comment that the list is empty *and that emptiness is a measurement*. Predict `coverage.test.ts` green, **and watch it go red once with one entry left in place and one caller deleted**.

- [ ] **Step 2: The screen**

For an administrator:

1. **On load**, read `?preview=<id>` from `location.search`. If present, `getApprovalPreview`. If absent, **or if the read answers `404`** (expired and gone, or another release's), `createApprovalPreview` with a fresh key, then `history.replaceState` so the id is in the URL.
2. **Render the preview as the record would read**: the summary with its source sentence, the sensitive fields, one security note per field, *Compared with* (the baseline release, linked), the changes, the reviewer's verdict, the coverage limit, and *"Taken <time>; valid until <time>"*.
3. **`Decide` names `preview.id`.** On `STEP_UP_REQUIRED`, `<Refusal>`'s link returns to `pathname + search`, **so the same preview is re-read** after the round trip.
4. **On `APPROVAL_PREVIEW_STALE` or `APPROVAL_PREVIEW_EXPIRED`**, show the refusal **and a *Take a new preview* button** that creates one and replaces the URL. **Never retry the decision by itself**: the person must read what changed.

For an owner, nothing changes: the release's facts and the decision record. **Replace the hint at `approvals.tsx:276-281`** (*"the API offers no preview of them"*) with *"Read the preview above: it is exactly what your decision will record."* `DecisionRecord` shows `decidedByName` (P6a F16).

- [ ] **Step 3: Build, and click it against the mock**

```bash
pnpm --filter console build
MANIFEST_MOCK_ROLE=admin <README's mock + console commands>     # the mock needs no platform and no password
```

Drive it in Chrome, using the `claude-in-chrome` skill. **Open a release's approval page and confirm the preview renders before any decision.** Click Approve (the mock answers per its fixtures) and read the record. Reload with `?preview=<id>` and confirm the same preview is re-read. Force the stale path, if the mock can play it (`MANIFEST_MOCK_FAIL`), or record that it cannot. **Record a screenshot of the preview.** The real platform's click-through, with passwords, is Task 11's clicked half.

- [ ] **Step 4: Gates; commit**

```bash
pnpm test && pnpm test && pnpm lint && pnpm typecheck && pnpm format:check
MANIFEST_TEST_DOCKER=1 pnpm test:docker     # owed by the sitting (Task 9's releases/)
git add packages/console/src/api.ts packages/console/src/api.test.ts packages/console/src/screens/approvals.tsx \
  packages/console/src/coverage.test.ts
git commit -m "feat(console): the approval preview — read before deciding, and still the same after the step-up"
```

- [ ] **Step 5: Negative controls**

| | Control | Predicted |
|---|---|---|
| a | `Decide` stops sending `previewId` | **`pnpm typecheck` GREEN, because the field is optional in the schema** (Decision 15). The mock click answers `400 APPROVAL_PREVIEW_REQUIRED`. **Record that `tsc` cannot see it, by design**: only a click or a demo can, which is why Task 11 asserts it headlessly |
| b | the screen always creates a new preview, ignoring `?preview=` | invisible to every gate. In the click, the summary after a reload differs from before (the mock's fixture is fixed, so predict *identical on the mock*). **A green that proves nothing, predicted in writing**; Task 11's clicked half against the real model is its witness |
| c | one caller deleted from `api.ts` | `coverage.test.ts` red, naming the operation |

---

## Task 11: The acceptance — `make demo-releases`

**ALONE, AND LAST.** D9's second clause, driven through the edge by nothing but `@manifest/contract`. **A self-serve production redeploy of a launched app; a sensitive change refused until an administrator, having read the stored preview, approves it; and the IAM change request path.** Green three times, the third from an `echo reset | make reset` machine, plus an offline-acceptance step, a `ci-acceptance` step, **and a clicked half by a person.** **Ask Rich before this sitting whether he will click it.** It needs him to type the operator's and the instructor's passwords, and the step-up prompt more than once.

**Files:**
- Create: `scripts/demo-releases.sh` — sign-ins, step-ups and git commits, which are outside the contract (D23.8); everything else is TypeScript
- Create: `packages/journey/src/releases.ts` — phases, importing nothing but `@manifest/contract` (`boundary.test.ts` holds it so)
- Modify: `Makefile` — `demo-releases: up  ## P6b's acceptance: …`
- Modify: `scripts/offline-acceptance.sh` — **step 12**
- Modify: `scripts/ci-acceptance.sh` — `run "make demo-releases" make demo-releases`, after `demo-production`, and its step-list comment
- Modify: `docs/superpowers/RUNBOOK.md` — the demo, what it proves and what it leaves; `WALKTHROUGH.md` — the subsequent-release story a person can run

**Interfaces:**
- Consumes: everything above.
- Produces: `make demo-releases`, **path-independent** (Decision 17).

- [ ] **Step 1: The script's shape**

```text
0. build the client and the journey; the control plane answers through the edge; 127.0.0.3 is on lo0
1. launch-app is LAUNCHED — or, if it is not (a fresh machine), `bash scripts/demo-production.sh` runs first and says so
   sign in the instructor and the operator (admin-grant.sh), keeping BOTH cookies per person (plain + stepped)
   an administrator CANNOT mint a token holding release:approve: 400 TOKEN_CAPABILITY_FORBIDDEN     ← Task 2, headless
   RECOVERY: if GET launch-readiness is not `ready` for the candidate (an earlier run stopped part-way), print the
   unmet items and repair only those two it can: a registration that no longer covers the candidate is recorded
   `active` with the candidate's attributes; an unmet admin-approval is previewed and approved. Then deploy the
   candidate to production. Setup, printed as such, never a claim — and anything else unmet stops the demo red
2. LEG A — a sensitive change, refused until approved
   (bash) commit manifest.yaml: the starter's attributes WITHOUT sn, and egress.allow: [<run-id>.example.org]
   validate (valid, sensitiveDiff names both); build; release; deploy to staging (healthy)
   production deploy by the stepped-up owner → 409 RELEASE_REESCALATED; launchReadiness.launched true;
     sensitiveFields EXACTLY ['auth.attributes', 'egress.allow']; the envelope's checklist equals GET launch-readiness
   production still serves the instance it served before (X-Manifest-Instance on 127.0.0.3)
3. The administrator decides
   approve naming no preview → 400 APPROVAL_PREVIEW_REQUIRED
   POST approval-preview → 201: sensitiveFields both; a security note for each; coverage present; review.state not_performed;
     summarySource 'llm' or 'unavailable' (offline); baselineReleaseId === the release production serves (every run,
     and the recovery, end on an approved release in production)
   approve naming it, admin NOT stepped up → 403 STEP_UP_REQUIRED
   (bash) the administrator steps up
   GET the SAME preview → identical to what was read (the console's round trip, headless)
   approve naming it → 201; approval.diff DEEP-EQUALS preview.diff; approval.previewId === preview.id; decidedByName present
4. The owner deploys it → 200 healthy; 127.0.0.3 answers as the new instance; 127.0.0.2 answers the wildcard's empty body
   the owner then asks for the release production ran BEFORE A → 409 RELEASE_NOT_STAGED              ← Decision 8
     (here and not in leg A: NOT_STAGED is checked only once the checklist is ready for the candidate, and during
     leg A the candidate is re-escalated, so leg A would answer RELEASE_REESCALATED about A instead)
5. LEG B — a self-serve redeploy (the hand-off's first claim; after A, because B needs a known baseline)
   (bash) commit a code-only change (a comment in server.js carrying the run id) — a NEW digest (P6a F3: a rebuild is not one)
   build; release; staging; GET launch-readiness: launched true, ready true, sensitiveFields []
   start redeploy-loop.mjs against https://launch-app.manifest.internal/healthz
   production deploy by the stepped-up owner → 200 healthy, and NO approval row for the release (GET approval → 404)
   the loop: only `app` (and at most one `reset`), the instance changing once — a self-serve redeploy interrupts nobody
6. LEG C — the IAM change request (§9)
   the administrator records the registration `active` with the four attributes (UBC registered the narrower set)
   (bash) commit manifest.yaml adding sn back; validate; build → FAILED, its error naming sn and the change request
   the administrator records change_requested with requestedAttributes = the five → build again → STILL FAILED
   submitted → active with the five: GET launch-records shows registered = five, requested = null
   build → succeeded; release; staging; production deploy → 409 RELEASE_REESCALATED, sensitiveFields ['auth.attributes']
   preview → approve (stepped up) → the owner deploys → 200
7. The end state, printed: launch-app launched on <date>, the three approvals this run made, the registration's state
```

**Every refusal is checked by `refusal(…, status, code)`, never by status alone. Every `checks.ok` whose number matters also `console.log`s it**: `check.ok` prints its detail only on failure (P5a sitting 12, F1).

- [ ] **Step 2: Build it, and run it until green — fresh and re-use**

```bash
pnpm test                                   # empties the database: the FRESH path
<start the control plane>                    # README's "Running the control plane"
make demo-releases 2>&1 | tee "$SCRATCH/releases-A.txt"      # fresh: runs demo-production first
make demo-releases 2>&1 | tee "$SCRATCH/releases-B.txt"      # re-use
```

**Both green before any control is run.** The builder is reproducible, so every digest the demo needs to be new comes from a commit, and the demo commits for each one.

- [ ] **Step 3: The negative controls — predicted in writing FIRST, run one at a time on the re-use path, restored and re-run green after each**

| | Control | Predicted |
|---|---|---|
| a | `approvalRequirementFor` ignores `launchedAt` | **step 2 red on the CODE and the field list**: A is still refused, but as `RELEASE_PRODUCTION_GATE_UNAVAILABLE` with `sensitiveFields: []`, because a `first-launch` requirement carries no fields. **Step 5 red too**: B is refused. The demo's `set -e` stops at step 2 (P6a F9), so **step 5's red is predicted and not observed**; run the control a second time with step 2's checks made non-fatal to see it, or record it as unobserved |
| b | `sensitiveFieldsBetween` ignores `egress.allow` | **step 2 red on the field list alone**: status and code stay `409 RELEASE_REESCALATED`, because the attribute removal still re-escalates. **This is why the check asserts the list exactly** |
| c | `decide()` recomputes rather than copying the preview | **online: step 3 red** (the model's second summary differs). **Offline or with LiteLLM down: CANNOT FAIL**, because both summaries are `null`. **Predicted, and recorded as the one control whose power depends on the model** |
| d | the registered-set rule removed (Task 7) | **step 6 red at *build again → STILL FAILED*** (the build passes) |
| e | `recordLaunch`'s call removed | **fresh path: step 1 red**, since launch-app is not launched after `demo-production`, and the demo would run the first launch again and stop. **Re-use path: GREEN**, because `launched_at` survives. **Path-dependent, predicted** |
| f | the person-only mint refusal removed | **step 1's mint check red** (`201`) |
| g | the `RELEASE_NOT_STAGED` line removed | **step 4's previous-release check red** (`200`, and production now runs the release from before A). **Re-run the demo afterwards to restore production** |
| h | `NullReviewer` replaced by one answering `clean` | **step 3 red at `review.state not_performed`**, P6a's F7 lesson applied. **Also read `code-review` in the checklist**: it must now say `met`, which is Task 8's fix, seen end to end |

**A control that stays green where red was predicted is a question, not a result.** Chase it to its cause before recording it. P6a's worst defect, F6, was found exactly that way.

- [ ] **Step 4: Green three times; the third from a reset machine**

```bash
echo reset | make reset && make up        # P6a F13: both loopback aliases survive; no host-setup
<start the control plane; wait for the migration>   # make verify reads one red (the audit grant) until it has migrated
make demo-releases                         # the third: fresh, from nothing
```

- [ ] **Step 5: Offline acceptance, CI acceptance, and the documents**

- `scripts/offline-acceptance.sh`: `=== 12. P6b's acceptance: subsequent releases, offline ===`, with the same *"no control plane → SKIPPED"* rule as step 11. **Its comment says what step 12 proves offline that step 11 does not**: a self-serve production redeploy, a re-escalation, a stored preview and an IAM change request. **It also says that the preview's summary may legitimately read `unavailable` offline, and that control (c) cannot fail then.**
- `scripts/ci-acceptance.sh`: the run line, and its step-list comment. **Its four `EXPECT_` lines carry the gate numbers; set them from this sitting's own final run.**
- `RUNBOOK.md`: *Running `make demo-releases`*: what it needs, what it leaves (launch-app launched, three more approvals, the registration five-wide), and **that it runs `make demo-production` first on a fresh machine**. `WALKTHROUGH.md`: *What a launched app's next release does*, as a checklist a person can click.

- [ ] **Step 6: The clicked half, by a person — the console, against the real platform**

**Recorded as a GIF (`p6b-task11-clicked-releases.gif`), with the agent driving Chrome and Rich typing passwords.** The extension's permission on `idp.manifest.internal` is intermittent (P5c F15), so plan to proceed blind across the IdP hop, reading the tab's title.

| Row | What a person should see |
|---|---|
| sign in (instructor) | `launch-app`, *Launched on <date>* |
| a self-serve deploy | the Deploy panel's production deploy of a release with no sensitive change: step-up, then **healthy, with no administrator involved** |
| a sensitive change | the same panel refuses `RELEASE_REESCALATED`, names the fields, and links to the approval page |
| sign in (operator) | the approval page shows **the preview before any decision**: summary, security notes, verdict, coverage, *valid until* |
| approve | `STEP_UP_REQUIRED`, then the IdP's password page, then **back on the same preview**, same summary |
| approve again | the record: *bound to preview …*, *decided by Test Operator*, the same summary word for word |
| records | the IAM registration with *registered* and *requested* side by side, and a change request filed and then answered |

**The console is where the defects no gate can see live, for the fourth plan running** (P5c F11, P6a F10, F11 and F17). Record every row as seen, and every surprise as a finding.

- [ ] **Step 7: Gates; commit**

```bash
pnpm test && pnpm test && pnpm lint && pnpm typecheck && pnpm format:check
git add scripts/demo-releases.sh packages/journey/src/releases.ts Makefile scripts/offline-acceptance.sh \
  scripts/ci-acceptance.sh docs/superpowers/RUNBOOK.md docs/superpowers/WALKTHROUGH.md
git commit -m "feat(journey): P6b's acceptance — make demo-releases: self-serve, re-escalated, and the IAM change request"
```

---

## What this plan does not build

**Named so the next plan inherits a list rather than a surprise.**

- **Binding the manifest's `blueprint:` to the project's pin** (*Read this first* 4). §7's `blueprint` field re-escalates on the manifest's *claim*, and the build uses `project.blueprintRef`, which no route changes. **The first route that changes a project's pin, a blueprint upgrade, must re-escalate**, and validation should refuse a manifest whose `blueprint:` is not the project's. That second half is a proposed §7 validation rule for whichever plan builds the upgrade.
- **`startBuild`'s pairing of `body.commitSha` with the newest spec** (*Read this first* 6). A build of commit X can record commit Y's spec. After Decision 6, a release freezes the build's recorded spec, so **no gate reads the mismatch**, but a faculty member could still be confused by it.
- **D16's *every environment***. A newly requested attribute re-escalates in production (this plan), and the build fails in every environment once a registration exists (P6a Task 13). **Before a registration exists, staging accepts new attributes freely.** D16 says approval is required in every environment. The IdP's `AttributeLimit` bounds what a staging app receives, and staging uses test users (D6). **The divergence is recorded here, not closed.**
- **A PIA returned to `draft` automatically on a sensitive change**: Question 3's recommended answer.
- **Database-level non-repudiation for `approvals` and `approval_previews`** (P6a sitting 10, F5). Both are insert-only in code and asserted by tests; `manifest_app` still holds `UPDATE` and `DELETE`. The shape to copy is `audit.incidents`'.
- **A real `Reviewer`** (`SemgrepReviewer`, a tracked hardening item, advisory before blocking), **and its planted-defect corpus** (R4(g)). **`code-review` now reads a verdict, so the day one lands, the checklist shows it.** It becomes blocking in that same change, as D33 says.
- **A run against real UBC Shibboleth for a *changed* registration.** It is an external-track obligation, exactly as the launch rehearsal's is. **After launch this platform refuses to rehearse at all** (Decision 16).
- **A rollback operation.** A rollback goes through staging (Decision 8).
- **A route that deletes a project** (P6a F5). The acceptance is written around its absence.
- **Revoking pre-P6b tokens that hold `release:approve` or `launch:record`.** The central rule refuses them however they were minted.
- **IAM change-request *generation*** (P8). This plan records what an administrator files, and the checklist names the attributes to request.
- **Certificate expiry alerts** (D20). `cert_expires_at` is recorded and nothing reads it.
- **The GitHub source driver and the authoring API** (the next two plans, in that order). **Both widen who can write `manifest.yaml`**, and this plan's re-escalation is the gate that inspects what they write.

---

## Spec actions

**ONE IS PROPOSED, AND IT MAY NOT BE APPLIED UNTIL RICH APPROVES IT.** Proposing and asking is the pattern here, and every spec change this project has made was approved first. **A spec action is not finished when the spec changes**: `manifest-decisions.html` restates D9 and D16 in plain language, and must be swept with it.

**Not proposed, deliberately:**

- **R4(d)**. Rich applied R4 to D33, §15 and §20 on 2026-09-19, and chose not to touch §13.
- **`projects.launched_at`, `approval_previews` and the new `IamRegistration` columns**. P6a added `rehearsals` without a §6 action. §6 lists *key fields*, and none of these changes a decision.
- **Decision 8 and Decision 16**, which make true what §13 and §9 already say.

### 1. §13 D9.2's second sentence says *change* where the mechanism means *addition* — conditional on Question 2

It currently reads:

> 2. **Subsequent releases** — self-serve, *unless* `spec/isSensitiveDiff()` reports a change to a sensitive field (§7), in which case the release re-escalates. A change to `auth.attributes` additionally requires an IAM change request to reach `active` before the release can deploy (§9).

**Proposed**, if Rich chooses (a):

> …A change to `auth.attributes` **that adds an attribute UBC IAM has not registered** additionally requires an IAM change request to reach `active` before the release can deploy (§9). **A removal re-escalates like any sensitive change, and does not wait on IAM**: the app then asks for less than UBC releases, which a change request can narrow later.

**If Rich chooses (b), this action is WITHDRAWN.** Task 7's control (e) becomes the code, and Task 11's leg A files a change request for its removal.

---

## What the self-review caught

*Run against the spec and the code with fresh eyes after the plan was written, as `superpowers:writing-plans` prescribes. The record below states what it caught and what was changed; the items are listed where they were fixed.*

**Thirteen items. Six were real defects in the plan as first drafted**, the kind an executing agent would have met as a red it could not explain. Every item was found by opening the code or the plan, not by re-reading the prose.

1. **Task 7's CWL fixture could not have run.** The unit tier's `fixture-node` descriptor offers `auth_providers: [none]` only, and the harness's `sso` and `signIn` **throw on purpose** (`api/testing.ts` ~304). A "launched CWL app" in the unit tier is therefore `node-ts-mongo@1` with two **labelled** fakes, and the fixture states why they are acceptable there and nowhere else.
2. **The acceptance's `RELEASE_NOT_STAGED` check sat in leg A, where it cannot fire.** Decision 8 checks staging only once the checklist is ready for the candidate, and during leg A the candidate is re-escalated, so the request would have answered `RELEASE_REESCALATED` about the wrong release. Moved to step 4, and control (g) re-aimed.
3. **Task 11's control (a) predicted "step 2 green" and "red on the code" in one cell.** Rewritten: step 2 goes red on the code and on the field list. Step 5's red is predicted but **cannot be observed in the same run**, because a red phase stops the shell (P6a F9).
4. **`LaunchReadinessView.sensitiveFields: string[]` would have been a `tsc` error** against the representation's `z.enum(SENSITIVE_FIELDS)`, because the route returns the view as its body. Typed `SensitiveField[]` in the interface and in the item's return type.
5. **Task 1's measurement labels skipped `[M15]`** while the text claimed sixteen. Renumbered, and the count restated precisely: fifteen measurements, of which two are of the machine and eleven test *Read this first*'s premises.
6. **Seven line pointers were off, by between one and twenty lines.** They were in `spec/diff.ts`, `spec/resolve.ts`, `project-reads.ts`, `launch/transitions.ts`, `releases/summary.ts`, `launch/rehearsal.ts` and `console/…/approvals.tsx`. **Each was re-opened and corrected.** A wrong pointer in a hand-off is inherited and multiplied (ORIENTATION §6).
7. **`sameFacts` would have been a second key-order-insensitive serialisation** beside `spec/diff.ts`'s `stable`. Task 9 now exports the one that exists.
8. **`code-review` reading the `approvals` table from `launch/`** would have added a second reader of that table's JSON shape. It now goes through `releases/`'s new `latestReviewFor` (Task 8), which Task 9 extends to previews.
9. **Task 2's control (e) said "`requireSession` removed"**, which leaves no actor at all. It is now P6a's own control, `requireSession` replaced by `requireActor`, whose prediction is a `tsc` error.
10. **Task 4's durable re-use check named an event filter** that the events route may not have. It now reads two operations that exist.
11. **Task 6's gate would have answered a REJECTED sensitive release `RELEASE_REESCALATED`**, sending a client to ask an administrator who had already said no, because the first draft keyed the code on `sensitiveFields` being non-empty. The view now carries `reescalated`, derived once from the same verdict as `admin-approval`, and control (g) keeps it honest.
12. **Leg A's premise was unmeasured**: that a staging deploy with a new egress host is healthy. It is now Task 1 step 13's item 5, with the correction block's destination named.
13. **Spec coverage.** §13 D9.2 maps to Tasks 5 and 6, with its IAM sentence in Task 7 and Spec action 1. The `diff_snapshot` sentence maps to Tasks 8 and 9. *Integrity of the gate* is kept in Task 5 (the digest) and made true before the decision in Task 9. *Residual risk*'s sensitive fields are `SENSITIVE_FIELDS`, and its coverage limit is in every record (Task 8). §7's *Sensitive fields* and its increase-only rule are Task 3. §7's last production clause is P6a's build check plus Task 7's live check. §9's change request is Task 7. §20's and D24's person-only class is Task 2. D33's item is Task 8. **The one clause with no task is D16's *every environment***, named in *What this plan does not build* rather than left implicit.

**Review Focus**: each of its five lines has a named test in the task that owns the code (Tasks 4, 5, 6 and 9, and the console's handling of a stale preview in Task 10).

---

## What executing this plan found

**THE FINDINGS COUNT FOR EVERY SITTING LIVES IN ONE PLACE: the roadmap's defect-rate table**, where it is used for arithmetic (Rich, 2026-09-20). These headings deliberately state no number. To count a sitting's findings at its CLOSE, after the post-sweep check and the final gate run:

```bash
# The alternation is load-bearing: a sitting that numbers its findings in a list (`1. **F1 …`)
# reads as ZERO to a bare `^\*\*F` grep.
awk '/^### Sitting 2 —/,/^### Sitting 3 —/' docs/superpowers/plans/2026-09-22-p6b-subsequent-releases.md \
  | grep -cE '^[[:space:]]*([0-9]+\. )?\*\*F[0-9]+ '
```

**The honest prior, from the defect-rate table: 9.8 findings per task (P6a), 8.6 (P5a), 8.9 (P5b), 7.6 (P5c). It has risen, never fallen, with practice.** At eleven tasks that is **roughly 95–120 findings.** This plan makes a launched app's release, a stored preview and an IAM change request run for the first time. **This project's worst discoveries have all arrived at a first.** Treat this plan as a hypothesis.

*One dated section per sitting, added as it runs.*
