# FE-46/47/5 baseline — Task 1's measurements (2026-10-08)

*Measured 2026-10-08, 09:11–09:35 PDT, by `manifest-p1` — the coordinated run's job P1, the FE-46/47/5 plan's sitting 1
([`../../plans/2026-10-03-fe46-fe47-fe5.md`](../../plans/2026-10-03-fe46-fe47-fe5.md), Task 1), executed inline (Rich, 2026-10-08
09:07). HEAD `4abbbc8`; the tree held only `manifest-p0`'s uncommitted `blueprints/` edits, none of them in a file read here. macOS
26.7.1 (25G241), Docker Desktop 4.87.0 (engine 29.7.2), Node v24.12.0, pnpm 11.24.0, load 3.4–5.5.*

**Nothing under `packages/` changed, and nothing running was touched beyond Mailpit's `EHLO`/`QUIT`.** The Postgres was a throwaway
on 7198, removed with its volume; nodemailer's add ran in a scratch COPY of the workspace's manifests and lockfile; the pure functions
ran from the control plane's `dist/` (built 2026-10-05 16:00, from source last changed at `4273aed`) with a dummy database URL nothing
queried. Raw output: [`results-task1-2026-10-08.txt`](results-task1-2026-10-08.txt). Probes: [`probes/`](probes/).

## The answers, and what each changes

| | Question | Answer | For |
|---|---|---|---|
| `[M2]` | Can `ADD VALUE` and a CHECK naming the value share drizzle's one migration transaction? | **Yes, when the CHECK compares `state::text`** — measured in psql and through `drizzle-kit migrate` from a fresh database (all 54: `0000`–`0052` and a `0053` probe). The uncast CHECK is refused `55P04` and rolls back **all 53 earlier migrations** with it (the control). `drizzle-kit generate` writes exactly `ALTER TYPE … ADD VALUE 'sent' BEFORE 'submitted'`. **Decision 7 stands; no stop for Rich.** | Task 5 |
| | | **drizzle-kit 0.31.10 prints NOTHING when a migration fails** — exit 1, an empty stderr; the error is only in Postgres's own log. | Task 5's `db:migrate` |
| `[M3]` | What will nodemailer's add meet? | **The offline add SUCCEEDS**: `nodemailer` **10.0.13** (released 2026-09-30) is already in the shared store, because the faculty front-end's server pins it. It ships its own types (no `@types/nodemailer`), has no install script (no `allowBuilds` change) and no dependencies (three lockfile entries). **Task 3's Step 1 needs no network** — said to Rich through `manifest-coord`. Mailpit offers `SIZE 52428800`, `ENHANCEDSTATUSCODES`, `8BITMIME`, `SMTPUTF8` — **no `STARTTLS`, no `AUTH`**. pnpm 11's built-in `minimumReleaseAge` is one day, in LOOSE mode. | Task 3 |
| `[M4]` | A manifest asking for an attribute UBC never registered: valid? built? | **`valid: true`** — validation's context holds a five-name whitelist and no registration. **The build is refused in its BACKGROUND half**: the build row goes `failed` with `SPEC_ATTRIBUTE_NOT_REGISTERED: … — <hint>`, and `build.failed`; `startBuild` itself answers success. FE-47's draft from the newest valid manifest rests on the first answer, and it holds. | Task 7 |
| FE-55 | A CWL app asking no attribute (Rich placed it 2026-10-08: P1 measures, Task 7 fixes) | **Measured, both halves**: `auth: { provider: cwl, attributes: [] }` validates `valid: true` with no warning; the build passes (nothing asked is a subset of anything); the deploy's `deriveSpEntity` throws `SpEntityError` `SP_ENTITY_NO_ATTRIBUTES`, which `mapError` does not know, so it is **`500 INTERNAL`**. No `SP_ENTITY_*` code is in `api/error-codes.ts`. | Task 7 |
| `[M5]` | How was a field added to an existing event? | `environment` joined `iam_registration.recorded` as a **required** field (`b2c75e6`, contract 1.5.0); stored events were **never rewritten** (the application role holds only `SELECT, INSERT` on `audit.events`), and a replay sends them **as stored, unparsed** — so the published `EventFrame` says `environment` is required while a replay of an older event lacks it. | Tasks 2, 5, 7 |
| `[M6]` | FE-5's premises | `findPerson` (`projects/repository.ts:415`): PUID exact, CWL login lowercased on both sides, email `lower()` on both sides, two rows → `ambiguous`. `project_members` is keyed `(project_id, user_id)`. `makeRedactor([])` changes none of an email address, a PUID or a CWL login in a sentence. A token's `addMember` 403 carries `pendingAction` with fifteen fields and no object. | Task 2 |
| `[M7]` | The gate numbers | `EXPECT_TESTS=3395`, `EXPECT_FILES=206`, `EXPECT_DOCTOR=22`, `EXPECT_VERIFY=67`; the Docker tier 289/43 (ORIENTATION §2). Contract **`1.7.0`**, **72 operations** on 61 paths, 100 schemas. **`pnpm test` not run** (Rich, 2026-10-08: *"Skip it"*). | Sitting 2 |
| `[M1]` | The 26 facts of *Read this first*, at HEAD | **15 HOLD, 8 MOVED (lines only), 3 CHANGED** — Fact 8 (U1 reworded two gaps), Fact 15 (its "operator lines never carry a message" is not true codebase-wide), Fact 26 (the faculty-ready plan's Tasks 15 and 16 have landed). The table below is the current map. **Of the code that reads a record's state or a queue kind, `pnpm typecheck` sees 5 sites; 55 fall through silently** — and the record routes' request enums would offer `sent` (Task 5 does not say so). | Tasks 2–9 |

## `[M1]` — every *Read this first* fact, re-read

*Read by four read-only surveys and spot-checked by hand (Fact 26's two commits, the mock's stage parse, its question summary, an
operator line). "Now" is HEAD `4abbbc8`. Files unchanged since `8def435`, where the plan was written: `launch/records.ts`,
`launch/transitions.ts`, `launch/readiness.ts`, `launch/queue.ts`, `launch/requests.ts`, `releases/build.ts`, `api/routes/launch.ts`,
`api/representations/launch.ts`, `api/contract/route.ts`, `tokens/pending.ts`, `api/refusal.ts`, the mock's `launch.ts`, and every cited
console and journey file.*

| # | Status | Now (paths under `packages/control-plane/src/` unless named) | What differs |
|---|---|---|---|
| 1 | HOLDS | `db/schema.ts:665-671`, `:678-682`; `drizzle/0019_useful_taskmaster.sql:2-3` | No `ADD VALUE` or `ALTER TYPE` in any migration; the newest, `0052`, touches no enum |
| 2 | HOLDS | drizzle-orm 0.45.2 `pg-core/dialect.js:44-72` (`transaction` `:60`, the loop `:61`); `db:migrate` `package.json:13` | No migration at boot anywhere in `packages/*/src`. **Measured, not only read: `[M2]`** |
| 3 | HOLDS | `iam_registrations` `:691-804`; `change_requested_from` `:751`, its CHECK `:799-802`; `submitted_at`/`submitted_by` `:760-761` (comment `:755-758`); `privacy_assessments` `:807-829`, the pair `:824-825` | The plan's `~:766-768` was already wrong when written |
| 4 | HOLDS | `IAM_ARROWS` `launch/transitions.ts:39-47`, `PIA_ARROWS` `:49-54`; `SUBMIT_ARROWS` `:103-106` (comment `:95-96`); `records.ts:584` checks only the set | **A second administrator move into `submitted`, uncited**: `journey/src/releases.ts:1120` `record('submitted', FOUR)` |
| 5 | HOLDS | `submitIamRegistration` `launch/records.ts:565-676`, `submitPrivacyAssessment` `:682-737`; the transaction `:570`, `FOR UPDATE` `:580`, `FOR SHARE` `:591`, `:612` (`:555-560` is the comment); `noDraft` `:530-535`; `LAUNCH_PIA_NOT_APPROVED` `:594`, `LAUNCH_STAGING_NOT_REGISTERED` `:615`; `assertDraftRead` `:486-495`; `LAUNCH_DRAFT_STALE` `:631`; `sentDay` `:502-528`; the events `:663`, `:728`; the routes `api/routes/launch.ts:360-413`, `:414-456`; `SubmitLaunchRecordRequest` `api/representations/launch.ts:539-564` | Its comment (`:536`) says *"Both fields"* over three |
| 6 | HOLDS | `recordIamRegistration` `:139-343`, `recordPrivacyAssessment` `:351-425`; `sentNow` `:246-254`; `changeRequestedFrom` `:261-266`; `registeredAt` `:232-237`; routes `api/routes/launch.ts:142-230`, `:231-271`; `RecordIamRegistrationRequest` `api/representations/launch.ts:468-533` | *"The whole registration in the body"* is the IAM route's only; the assessment's takes `state`, `reviewer?`, `externalTicketRef?` (`:566-589`) |
| 7 | HOLDS | `DRAFTABLE` `:756`; `alreadySent` `:758-763`; `:1002`; `:1108` under `FOR UPDATE` `:1082`; `drawnFrom` `:845-866`; `:1113-1119`; `:1199`; `:1262` | — |
| 8 | **CHANGED** | `gaps: string[]` `launch/assessment.ts:43`; the six lists `:132`, `:194`, `:275`, `:322`, `:349`, `:397`; *For you to add* `:453-454`; `readAssessmentDraft` `:464-476`; the contract's `gaps` `api/representations/launch.ts:373-374` | U1 reworded `:279` and `:402` (`levelWords(…)`); `high` models count as off-premise (`:105`). **Decision 8's eleven ids match the twelve gap strings one-to-one** (below). Copies of the strings sit in `api/routes/launch-examples.ts` (`:340`, `:379`, `:404`, `:422`, `:442`, `:467`, text `:476`) |
| 9 | HOLDS | `waitingOnUbc` `launch/readiness.ts:459-464`; `iamItem` `:359-409` (its words `:374`); `draftDrift` `:419-452`; `liveRegistrationItem` `:494-553`; `changeRequestOnFile` `:627-630`; `IAM_BASE.owner` `:638`; `piaItem` `:876-918` (`:892`) | Ranges one to three lines short |
| 10 | HOLDS | `QUEUE_KINDS` `launch/queue.ts:15-20`; `registrationsWithUbc` `:161-215`; `assessmentsWithUbc` `:217-243`; `requestedBy` via `submittedBy` `:170`, `:226`; active only `:103`; `since` is `submittedAt ?? updatedAt` (`:187`, `:231`) | — |
| 11 | HOLDS | No mail code, no mail package; `allowBuilds` `pnpm-workspace.yaml:24-26`; neither `make seed` (`infra/seed/seed.sh:74` is an npm install in a temporary directory, to warm Verdaccio) nor the offline acceptance runs a workspace install | **The store already holds nodemailer** (`[M3]`) |
| 12 | MOVED | Mailpit `infra/compose.yaml:355-368`; `scripts/verify.sh` round trip `:1330-1355`, narrowness `:1362-1387`; ports `infra/lib/common.sh:96-97` | Lines only |
| 13 | MOVED | `MANIFEST_CONTROL_PLANE_ORIGIN` `config.ts:169-172`; `config.sp.origin` `:538`/`:544`, built `:871-872`; the console's paths `packages/console/src/router.ts:37-61`; `MANIFEST_LAUNCH_CONTACTS` `config.ts:449`, `parseLaunchContacts` `:958-969` (called `:716`) | Lines only. `parseLaunchContacts`' address check is `/^(\S.*?)\s*<([^<>\s@]+@[^<>\s@]+\.[^<>\s@]+)>$/`, `CONFIG_INVALID` per entry — the one email-shaped setting today |
| 14 | MOVED | `requestApproval` `launch/requests.ts:48`, its publish `:102-124`; called `api/routes/releases.ts:1042`; `ServerDeps` `api/server.ts:58-179`; the boot `index.ts:344-398`; `testDeps` `api/testing.ts:819-992` | The call site only (`1038 → 1042`) |
| 15 | **CHANGED** | `releases/build.ts:72-89` (`inFlight` `:68`); `releases/release.ts:1121-1138` (`discardMintedKey`); `api/refusal.ts:12-40` | **The general claim is false**: operator lines are not all JSON, and some carry a message or a PUID — `api/routes/auth.ts:192` `` `[auth] step-up started for ${actor.puid}` `` (and `:234`, `:287`, `:484`), `releases/build.ts:241`, `releases/recover.ts:139`, `releases/summary.ts:282`, `source/queue.ts:24`, `runtime/docker/driver.ts:401`, `ai/capable.ts:328`, `:342`. The mailer follows `api/refusal.ts` (Decision 11), which is unchanged |
| 16 | MOVED | The mock: `RecordsStage` `packages/mock/src/launch.ts:27`; the default `server.ts:1231-1237`; `launchRecords` `:144-172`; `IAM_SUBMIT_FROM`/`PIA_SUBMIT_FROM` `:200-201`; the submits `:282-365`; `queueOf` `:608-637`; handlers `server.ts:591-619`, `listQueue` `:666` | **`MANIFEST_MOCK_RECORDS` is an allow-list, `['none', 'drafted', 'assessed', 'approved']`, and anything else silently means `sent`** — so Task 8a's `with-team` and 8b's `change-with-team` must join it. **Under `sent` only the ASSESSMENT is with UBC**; both registrations are `active` (`fixtures.ts:1495`, `:1524`, `:1545`); `server.ts:302` reads `sent` as *no launch scripted* |
| 17 | HOLDS | `packages/console/src/launch-records-state.ts:103-208` (`switch` `:114`, `:183`), `queueKindWords` `:248-260`; `SendForm` `screens/records.tsx:849-935`; `IamForm` `:283-455`; `PiaForm` `:457-539`; `AdminQueue` `screens/queue-admin.tsx:25-70`; the submits `api.ts:696-749` | — |
| 18 | HOLDS | `packages/journey/src/launch.ts` phases `:1738-1748`; step 4 `:876-932`, 5 `:937-1005`, 6 `:1011-1167`; `sayItWasSent` `example-launch-path.ts:82-115`, called six times (`:887`, `:895`, `:921`, `:1023`, `:1053`, `:1096`); the guide `docs/api/launching.md:68`; `examples.test.ts:664-730` | — |
| 19 | MOVED | `api/authz-contract.ts`: the `launch:record` rows `:1339-1405`; the `/submission` rows `:1406-1450`; the admin-reason list `:3078-3103` (the submits `:3099-3100`), its test `:3032`; `stream-contract.test.ts:46-49` | Lines only |
| 20 | HOLDS | The payload `db/schema.ts:516-521`; `fingerprintOf` `tokens/pending.ts:74-86`; the route's summary `api/routes/project-reads.ts:416`; `openAsk` `:164-182`; `resolutionFor` `:351-353`; the unique index `db/schema.ts:567-574` | — |
| 21 | HOLDS | The fingerprint `api/contract/route.ts:246-254`; `recordPendingAction` `:357-363`; the cap `tokens/pending.ts:197-201` | — |
| 22 | MOVED | `pending_action.created` `observability/event-schemas.ts:362-374`; its sentence `tokens/pending.ts:264` (still cites *D24*); validated where written `observability/events.ts:314` | Lines only (`ai.models_withdrawn` landed above it). Replay never parses (`[M5]`) |
| 23 | MOVED | `PRIVILEGED` `projects/authz.ts:170-175`; `addMember` `api/routes/project-reads.ts:411` (`findPerson` `:476`, after the capability `:459` and step-up `:465`); `removeMember` `:543`; `deploy` `api/routes/releases.ts:1070` (`release:promote` asserted `:1145`); `environmentById` `:208` | Lines only. No route declares `quota:set` or `secret:read`; confirm and reject are session-only |
| 24 | HOLDS | `PERSON_ONLY` `projects/authz.ts:203-211`; `TokenCredentialRefusedError` `api/actor.ts:13-14`, thrown `:41-49`; the backstop `TOKEN_PERSON_ONLY` `authz.ts:646-648`, before `isPrivileged` `:649` | — |
| 25 | MOVED | The console `screens/queue.tsx:241`; the mock's `PENDING_ACTION` and variants `packages/mock/src/fixtures.ts:983-1040` | **The mock's summary is not the platform's**: `'add a member to this project'` (`fixtures.ts:992`) against `'Add or change a member'` |
| 26 | **CHANGED** | **Both landed**: Task 15 `9b216d3`, Task 16 `7d789b3`. `requireAdminReason` `projects/authz.ts:781-813` (one caller, `:721`) decides by a PREDICATE, `refusedWithoutAdminReason` `:760-766` — owner's ∧ not a read ∧ not an administrator's duty — so `launch:submit` asks and `launch:record` does not. `tokens/expiry.ts`: `expirePendingActions` `:55` (**six** callers), `recordQuestionsEnded` `:128` and `announceQuestionsEnded` `:161` (three each), `EVERY_QUESTION` `:177` | `publishQuestionsEnded` is gone. Task 5's move of the submits to `launch:record` takes them off the reason list by the predicate; the list in `authz-contract.ts` is the test that says so |

**The assessment's gaps** (Fact 8; `launch/assessment.ts`, HEAD) — twelve strings, eleven of Decision 8's ids (`retention.removal` and
`retention.declare` are one id each for two exclusive strings):

| Id | Line | When |
|---|---|---|
| `collected.app-data` | `:133` | always |
| `stored.staging-cover` | `:195` | always |
| `flows.classification` | `:279` | no `data.classification` declared (`:276`) |
| `flows.unknown-model` | `:284` | any declared model the catalogue cannot place (`:281`) — **ONE gap naming every such model** |
| `retention.removal` | `:324` | `retention_days` declared (`:323`) |
| `retention.declare` | `:325` | otherwise |
| `retention.disposal` | `:326` | always |
| `accountable.platform-contact` | `:352` | no platform contact (`:350`) |
| `accountable.breach` | `:356` | always |
| `hosting.production` | `:398` | always |
| `hosting.offshore-ai` | `:402` | a declared model the catalogue places below `very-high` (`:399`) |
| `hosting.repository` | `:406` | the repository is on GitHub (`:404`) |

### Every reader of the records' states, and every switch — Tasks 5 and 6's typecheck work, and what typecheck will NOT find

*A read-only survey of `packages/control-plane/src`, `packages/console/src`, `packages/mock/src`, `packages/journey/src` and
`packages/contract/src` (`schema.d.ts` is generated — *"auto-generated by openapi-typescript"* — and not counted). The state types are
`IamState` and `PiaState` (`launch/transitions.ts:3-4`) and the kind type `QueueKind` (`launch/queue.ts:21`); there is no
`assertNever` and no `satisfies never` anywhere. The two queue-kind strings that are ALSO readiness item ids (`'iam-registration'`,
`'privacy-assessment'`, `LaunchItemId`) are a different domain and were excluded.*

| | Hand-written files | Sites |
|---|---|---|
| A record's state read, written, typed or put in words (not tests) | 19 | 211 — control plane 12 files/125, console 2/18, mock 2/28, journey 3/40 |
| A queue kind (not tests) | 7 | 28 |
| Tests and test support naming a state | 13 + 3 | ~279 |
| Tests naming a kind | 4 | 23 |
| **Exhaustive — a new member fails `pnpm typecheck`** | **2** | **5** |
| **Non-exhaustive — a new member falls through SILENTLY** | **10** | **55**, and 11 hand lists in 6 test files |
| zod and Postgres enum lists | 5 (+1 generated) | 13 (+8 generated) |

**The five exhaustive sites**: `IAM_ARROWS` and `PIA_ARROWS` (`launch/transitions.ts:39`, `:49`, `Record<IamState|PiaState, …>`); and the
console's `registrationActions` (`launch-records-state.ts:114`), `assessmentActions` (`:183`) and `queueKindWords` (`:250`) — switches with
no `default` in functions with a declared return type, so `TS2366` — **which fail only once `openapi.json` and `schema.d.ts` are
regenerated**. The mock's `launchRecords` switches over its own `RecordsStage`, not a state.

**The silent ones that matter most** (the full list is in the survey; each is a line Task 5 or 6 must read, because typecheck will not):
- **`launch/queue.ts:190`** — `record.state === 'submitted' ? 'iam-registration' : 'iam-change-request'`: any other state the query
  selects becomes a change request. `:172-181` and `:227` select only `submitted` (and a change request filed from `active`), so a `sent`
  record is never queued until Task 6 says so; `:80` orders by `QUEUE_KINDS.indexOf`, so where a new kind sits in the array is its order.
- **`launch/readiness.ts:425`** (`const sent = row.state === 'submitted'` — a `sent` record would be called a *draft*), **`:460`**
  (`waitingOnUbc` — no `since` for `sent`), **`:905`** (the assessment's `since`), **`:376`**, **`:510`**, **`:894`**.
- **`launch/records.ts:247-248`** (`sentNow` stamps `submitted_at` only on `submitted` or a filed change), **`:261-265`**
  (`change_requested_from`), **`:756`** (`DRAFTABLE`), **`:592`/`:613`** (UBC's order: `approved`, `active`), and the console's
  `screens/records.tsx:149`, `:243` (`waiting=`) and `:315`.
- **The mock** (`launch.ts:200-201`, `:382`, `:400`, `:407`, `:622` — its queue emits no IAM item from its own state) and **the journey**
  (`production.ts:321-322`, `releases.ts:625`, and `launch.ts`' exact `kindsOf(…).join(',')` strings at `:957`, `:1000`, `:1163`).
- **The hand lists in tests**: `transitions.test.ts:17-24` and its grid counts (`:96` `{ allowed: 8, refused: 17 }`, `:124` `{ allowed: 4,
  refused: 5 }`), `readiness.test.ts:150`, `:175`, `queue.test.ts:56-57`, `:94`, the console's `launch-records-state.test.ts:238-242`, the
  mock's `scripted.test.ts:1000-1008` (`toBe(4)`).

**AND ONE THAT IS NOT SILENT BUT WRONG: the generic record routes' REQUEST enums are derived from the database's.**
`RecordIamRegistrationRequest.state` is `z.enum(iamRegistrationState.enumValues)` (`api/representations/launch.ts:509`), and
`RecordPrivacyAssessmentRequest.state` the same (`:571`). Adding `sent` to the Postgres enum **adds it to what the published contract says
`recordIamRegistration` and `recordPrivacyAssessment` accept** — while Decision 4 says those routes never move into or out of `sent`, so
the arrows refuse it at run time (`409 LAUNCH_TRANSITION_INVALID`). The console's `IAM_STATES`/`PIA_STATES` select lists
(`screens/records.tsx:255-266`) are typed by those request types and would not fail either. **Task 5 does not mention these two enums.**
The events' `iam_registration.recorded`/`privacy_assessment.recorded` `state` (`observability/event-schemas.ts:459`, `:482`) derive the
same way; a record route never writes `sent`, so they would only over-describe.

## `[M2]` — `ADD VALUE` inside drizzle's one transaction

1. **The Postgres.** `infra/images.lock` holds **no Postgres line**: `infra/compose.yaml:120` pins `postgres:16-alpine` by tag only. The
   probe ran the running `manifest-postgres`'s image by digest, `postgres@sha256:4e6e670bb069649261c9c18031f0aded7bb249a5b6664ddec29c013a89310d50`
   (PostgreSQL 16.13), on `127.0.0.1:7198`.
2. **Uncast** (`probes/m2-step2-uncast.sql`): `ERROR: 55P04: unsafe use of new value "sent" of enum type s` / `HINT: New enum values must
   be committed before they can be used.` — and the whole transaction rolls back (`s` does not exist after it).
3. **`state::text`** (`probes/m2-step3-text-cast.sql`): commits; `enum_range` reads `{draft,sent,submitted}`; `('sent','x')` and
   `('draft', NULL)` insert; `('sent', NULL)` and `('draft','x')` are refused by `c`. Stored as `CHECK ((((state)::text = 'sent'::text) = (f IS NOT NULL)))`.
4. **Through `drizzle-kit migrate` 0.31.10 itself**, from a fresh database: `drizzle/` copied, `0053_probe.sql`
   (`probes/m2-step4-0053_probe.sql` — `ADD VALUE 'sent' BEFORE 'submitted'` on the REAL `iam_registration_state`, a `sent_from` column
   and its `::text` CHECK on the REAL `iam_registrations`, and the step-3 pair) and its journal entry. **Exit 0; 54 rows in
   `drizzle.__drizzle_migrations`; `iam_registration_state` reads `{draft,sent,submitted,active,change_requested,expired}`.**
   - **The control** — the same, its CHECK uncast (`probes/m2-step4-control-0053_probe-uncast.sql`): exit 1, and the fresh database
     holds **only** `drizzle.__drizzle_migrations`, with **0 rows**: every one of `0000`–`0052` rolled back with the probe. One
     transaction, measured.
   - **drizzle-kit said nothing.** Run again with stdout and stderr apart: stderr 0 bytes, stdout the config line, the driver line and
     the spinner. The error was only in `docker logs` (`ERROR: unsafe use of new value…`, its `STATEMENT`). A failing `db:migrate` in Task
     5 reads as a bare exit 1: read `docker logs manifest-postgres`.
5. **What `drizzle-kit generate` writes** (`schema.ts` copied with `'sent'` inserted before `'submitted'` in both enums):
   `ALTER TYPE "public"."iam_registration_state" ADD VALUE 'sent' BEFORE 'submitted';` and the same for `privacy_assessment_state` —
   Decision 7's form, generated. A CHECK in `schema.ts` is written verbatim, so Task 5 writes `${t.state}::text = 'sent'` there.
6. **Removed**: `docker rm -f fe46-probe` — which **left the image's anonymous volume** (`VOLUME /var/lib/postgresql/data`; dangling
   volumes 28 → 29), removed by id. `docker rm -f -v` is the command.

## `[M3]` — what nodemailer's add will meet

- **Mailpit** (`axllent/mailpit:v1.31.3`, `probes/m3-ehlo.mjs`, `EHLO` and `QUIT` only): `250-SIZE 52428800`, `250-ENHANCEDSTATUSCODES`,
  `250-8BITMIME`, `250 SMTPUTF8`. **No `STARTTLS`** — nodemailer's opportunistic upgrade never starts on the laptop, and
  `MANIFEST_SMTP_REQUIRE_TLS=1` against Mailpit will fail every send (a ready negative control for Task 3). **No `AUTH`.**
- **The add, offline, in a scratch copy** (root `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, the seven
  `packages/*/package.json`): `pnpm --filter @manifest/control-plane add --offline --save-exact nodemailer` → **exit 0** in 3.5 s,
  *"Lockfile passes supply-chain policies (verified 11d ago)"*. It wrote `"nodemailer": "10.0.13"` to the control plane's
  `package.json` and three lockfile entries (`importers`, `packages`, `snapshots`); `pnpm-workspace.yaml` unchanged.
  - **Why it worked:** the faculty front-end's `packages/server` pins `"nodemailer": "10.0.13"` (its lockfile `:1475`, the same
    integrity), so the shared store holds the tarball and pnpm's cache the packument (written 2026-10-01; `latest` 10.0.13, 322 versions);
    the lockfile's supply-chain verification was cached. TRAPS' earlier offline refusals were that verification uncached.
  - **10.0.13 is the release current as this machine knows it** (2026-09-30). The registry may hold a newer one today; Decision 10 says
    *"the release current on the day of the add"* and Task 3 tries `--offline` first. The two agree unless a newer release exists.
    **Recommended: 10.0.13 offline** — the front-end's pin, and no network.
  - **The package**: `"type": "module"`, ESM and CJS builds under `dist/`, **no dependencies**, `engines` `node >=20.0.0`, **no
    install script** (so nothing for `allowBuilds`), an `exports` map with no `types` condition — and 76 `.d.ts` files beside the `.js`.
- **The types**: `probes/m3-nodemailer-types.ts` — `createTransport` with `host`, `port`, `secure`, `requireTLS`, the three timeouts,
  `disableFileAccess`, `disableUrlAccess`, and a `streamTransport` — typechecks under the repository's `tsconfig.base.json` (NodeNext,
  strict, `exactOptionalPropertyTypes`), resolved to `dist/esm/nodemailer.d.ts`. **The control**: `disableFileAccess: 'yes'` →
  `TS2769`. **So `@types/nodemailer` is not needed.** Its error codes (`dist/esm/errors.d.ts`): `ECONNECTION`, `ETIMEDOUT`, `ESOCKET`,
  `EDNS`, `ETLS`, `EREQUIRETLS`, `EPROTOCOL`, `EENVELOPE`, `EMESSAGE`, `ESTREAM`, `EAUTH`, `ENOAUTH`, `EOAUTH2`, `EMAXLIMIT`,
  `EMAXRECIPIENTS`, `ESENDMAIL`, `ESES`, `ECONFIG`, `EPROXY`, `EFILEACCESS`, `EURLACCESS`, `EFETCH` — what Decision 11's operator line
  carries.
- **The policy**: pnpm 11.24.0; no user or workspace setting for `minimumReleaseAge`, `trustPolicy`, `blockExoticSubdeps` or
  `strictDepBuilds` (each `undefined`). **pnpm 11's built-in defaults** (its CHANGELOG): `minimumReleaseAge: 1440` — a release younger
  than a day is not resolved — with `minimumReleaseAgeStrict: false`, **LOOSE: an immature pick is written into `pnpm-workspace.yaml`'s
  `minimumReleaseAgeExclude` and the install proceeds**; `strictDepBuilds: true`; `blockExoticSubdeps: true`; and since 11.1.3 every
  install re-validates the lockfile's entries against those policies before fetching. **A networked add must read `pnpm-workspace.yaml`'s
  diff as well as the lockfile's `importers:`.**

## `[M4]` and FE-55 — an attribute UBC did not register, and none at all

*`probes/m4-fe55-m6-pure-functions.mjs`: `validateSpec` with `validationContext` exactly as `api/spec-validation.ts` builds it (no model
declared, so no catalogue), `assertRegisteredAttributes`, `deriveSpEntity` and `toErrorResponse`, from `dist/`. Each half has its control.*

| Case | Answer |
|---|---|
| The proof app's manifest, five attributes | `valid: true` |
| `attributes: [ubcEduCwlPuid, sn]` — `sn` registered by nobody | **`valid: true`** (the context's keys: `projectSlug`, `projectBlueprint`, `attributeWhitelist`, `serviceCatalogue`, the model policy, `quota` — no registration) |
| *(control)* `attributes: [ubcEduCwlPuid, cn]` | `SPEC_ATTRIBUTE_NOT_WHITELISTED` at `auth.attributes.1` |
| **FE-55** `provider: cwl, attributes: []` | **`valid: true`, no warning** |
| The build's rule, a registration holding `[ubcEduCwlPuid, mail]`, asked `[ubcEduCwlPuid, sn]` | `AttributeDriftError` `SPEC_ATTRIBUTE_NOT_REGISTERED` — *"…did not register for 'fe46-probe': sn. Registered: mail, ubcEduCwlPuid."* — hint: *"…Raise an IAM change request against RITM0000001 … an administrator records it on the project as 'change_requested' … or remove them from auth.attributes."* (the sentence Task 7 rewrites) |
| *(control)* asked `[ubcEduCwlPuid]` | passes |
| **FE-55** `deriveSpEntity` with `attributes: []` | `SpEntityError` `SP_ENTITY_NO_ATTRIBUTES` — *"auth.attributes is empty — an SP registered with no attribute list receives every attribute the IdP holds, so Manifest refuses to write the row (§9)"* |
| **FE-55** `toErrorResponse(that)` | **`500 INTERNAL`**, *"the control plane failed to handle this request"* |
| *(controls)* `LaunchRecordError`, `SpecInvalidError` | `409 LAUNCH_NOT_CWL`; `422 SPEC_INVALID` |

**Where each is reached** (read): validation — `api/spec-validation.ts:100` `validateAndRecord` → `validateManifestText` → `validateSpec`;
the per-attribute rule is `spec/policy.ts:155-165`, whitelist only. The build — `releases/build.ts:184`, inside `finishBuild` (the
background half): `assertAttributesRegistered` (`:330-364`) reads production's row only when `registered_at` is set, and a throw becomes a
`failed` row whose `error` is `<code>: <message> — <hint>` and the log's last line, then `build.failed` (`:209-262`). The deploy —
`releases/release.ts:547-557`: **every deploy of a `cwl` app**, sandbox, staging, production and the rehearsal, calls
`registerServiceProvider` → `sso/registration.ts:86` → `deriveSpEntity` (`sso/entity.ts:72`; the empty-list refusal `:113-119`).
`SpEntityError` extends `SsoError` (`sso/errors.ts:9`), and `mapError` (`api/errors.ts:337-861`) has no branch for either. **The drafts
already refuse the same manifest**: `launch/records.ts:1017-1022`, `409 LAUNCH_NOT_CWL`, *"…asks for no attribute…"*. Nothing in the
tree builds a `cwl` manifest with no attribute through `validateSpec` (the one `cwl, []` fixture, `blueprints/blueprints.test.ts:134`,
calls `checkBlueprintCompatibility`).

## `[M5]` — a field added to an existing event

`b2c75e6` (2026-09-30, the launch path plan's Task 9, contract 1.5.0) added `environment: z.enum(['staging', 'production'])` to
`iam_registration.recorded`'s **strict** object, **required**. Its migration (`0045_organic_quasar.sql`) rewrote only `audit.events`'
type CHECK; no stored event was touched — nor could the application touch one: `manifest_app` holds `SELECT, INSERT` on `audit.events`
and nothing more (`0004`). A reconnecting client's replay (`recentFramesFor`, `observability/bus.ts:235-264`) maps the stored rows through `eventFrame(…)`
**without parsing** (`api/representations/events.ts:50-53` says so), so a replay of an `iam_registration.recorded` written before
1.5.0 carries no `environment` while the published `EventFrame` says it is required. No event field anywhere is `.optional()`; no
document mentions older events. **Tasks 2, 5 and 7 add fields the same way** (`pending_action.created`'s `object`, `expiresAt`,
`tokenExpiresAt`, `tokenMintedBy`; `iam_registration.submitted`'s `changeRequest`).

## `[M6]` — FE-5's premises

- **`findPerson`** `projects/repository.ts:415` — `(db, key: { puid } | { cwlLogin } | { email }) → { kind: 'found', user } | { kind:
  'nobody' } | { kind: 'ambiguous' }`, `limit(2)`. The **PUID** is matched exactly (`:426`); the **CWL login** lowercased on both sides —
  stored trimmed and lowercased at every sign-in (`identity/saml.ts:564`), looked up `.toLowerCase()` (`:427`); the **email** by
  `lower(…) = lower(…)` (`:428`). `users.ubc_cwl_puid` and `users.cwl_login` are UNIQUE; `email` is not (hence `ambiguous`).
- **`project_members`** — `PRIMARY KEY (project_id, user_id)` (`db/schema.ts:164`).
- **`makeRedactor([])`** on four sentences — an email address (`jane.doe@ubc.ca`), a 32-hex PUID-like string, a CWL login (`jdoe42`) and
  a 12-character PUID — **changes none of them**: the empty-secret redactor's heuristics do not touch a person's identifiers.
- **A token's `addMember` today** (`api/delegation.test.ts:176-200`): `403 TOKEN_ACTION_PENDING`, its hint, and `error.pendingAction` —
  `question()` (`api/errors.ts:323-335`) parses `toPendingAction(row)` through `PendingAction`: `id`, `projectId`, `tokenId`, `action`,
  `state`, `method`, `path`, `bodySha256`, `summary`, `expiresAt`, `createdAt`, `resolvedAt`, `waitingSeconds`, `reason`, `consumedAt`.
  **No object, and nothing about the person.** `toPendingAction`'s `now` default is never reached through a bare `.map` (its one list
  call passes `now`, `api/routes/pending-actions.ts:214`).

## `[M7]` — the numbers this plan starts from

`scripts/ci-acceptance.sh`: `EXPECT_TESTS=3395`, `EXPECT_FILES=206`, `EXPECT_DOCTOR=22`, `EXPECT_VERIFY=67`. The Docker tier: 289 tests,
43 files (ORIENTATION §2). The contract: `CONTRACT_VERSION = '1.7.0'` (`api/contract/document.ts:87`); `packages/contract/openapi.json`
`info.version` 1.7.0, **72 operations** (72 distinct ids) on 61 paths, 100 schemas. **`pnpm test` was not run** — Rich, 2026-10-08
09:07: *"Skip it"*; sitting 1 changed no code.

## What this leaves the plan

- **Task 2** — the event's new fields meet `[M5]`: decide, and record, whether they are required (the precedent; a replay of an earlier
  `pending_action.created` lacks them) or optional. The mock's question summary differs from the platform's (Fact 25): align it while the
  fixtures gain their object. `findPerson`'s three lookups are as Decision 18 assumes; the PUID is exact.
- **Task 3** — the add is offline (10.0.13), types included, no `allowBuilds`; Mailpit offers no `STARTTLS`; nodemailer's codes above.
- **Task 5** — Decision 7 measured; a failed `db:migrate` is silent but for the exit code. **Narrow the two record routes' request
  enums so they do not offer `sent`** (above). Typecheck finds five sites; the silent list above is the rest. The current lines of every
  fact it cites are in the table above.
- **Task 6** — `launch/queue.ts:190`'s two-way kind choice, `:80`'s ordering by array position, and `readiness.ts:425`/`:460`/`:905`.
- **Task 7** — `[M4]`'s refusal is a FAILED BUILD ROW, not a 4xx; **FE-55 is Task 7's** (Rich, 2026-10-08).
- **Tasks 8a and 8b** — `MANIFEST_MOCK_RECORDS`' allow-list.
