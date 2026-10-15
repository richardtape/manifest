# P11's measurements — Task 1, 2026-10-15

**What this is.** The record of [P11, the administrator's console](../../plans/2026-10-14-p11-admin-console.md)'s Task 1: one
section per measurement, what was predicted, the raw answer, and what it confirms or corrects in the plan. Taken by
`manifest-p11-s1` (the third coordinated run's P11 build, sitting 1; coordinator `manifest-coord5`), from 09:10 PDT. **The probe**
for `[M3]` is in [`probes/`](probes/).

**The machine.** macOS 26.7.1 (build 25G241), Node 24.12.0, pnpm 11.24.0; Docker server 29.8.2 with **6 CPUs** and 8,320,028,672 B
(Rich's GT3 step, 09:02 — it read 12 until then); on AC, 100 %. Load 6.5–6.7 at 09:15. **The shared checkout at `2c9fc47`**; the
store holds `react`/`react-dom` 19.3.0, `@types/react`/`@types/react-dom` 19.3.0, `vite` 8.3.0 (and 5.4.21, Vitest's own),
`@vitejs/plugin-react` 6.1.1, `vitest` 2.1.9, `typescript` 5.9.3.

**Under the coordinator's HOLD until FREE at 09:31:18** (GT3's Docker tier at 6 CPUs): the measurements that need no CPU first —
reading, the worktree, a sub-second `node:vm` render — and the install, the contract's build, Vite and Vitest only after FREE, during
Rich's Zoom call (light steps only; load 3.7–6.9).

---

## `[M1]` The contract — Step 1

**Predicted `1.9.0` / 76. Measured `1.9.0`, 76 operations, 104 schemas** (`jq` over `packages/contract/openapi.json` at `2c9fc47`).
B's sitting 4 has not landed: **no load-rehearsal operation**, so Task 10's load-rehearsal row is not built at this contract.

*Read this first* 1–9 against the document — **every one confirmed**:

- `Queue` requires `items`, `oldestSince`, `truncated`; `QueueItem` requires exactly `kind, project, subjectId, environment,
  requestedBy, since, summary, note`. `QUEUE_KINDS` (`launch/queue.ts:19-27`) in the order fact 1 gives; `QUEUE_LIMIT = 200` (`:31`).
- `Fleet` is an array; a row requires `id, slug, name, state, archivedAt, blueprint, starter, owner, audience, createdAt,
  slugReserved, environments` — and each environment `kind, hostname, state, instances, releaseId, imageDigest, lastDeployAt,
  latestIncidentAt`. No `launchedAt`, no level.
- `ApprovalPreview` requires the nine fields fact 3 names; `ApproveReleaseRequest` requires nothing (`previewId`, `reason`
  optional in the schema — the operation refuses a missing `previewId`); `RejectReleaseRequest` requires `reason`.
- `RecordSubmissionRequest` requires `reference` (`sentAt` optional). **`RecordIamRegistrationRequest` requires `entityId, acsUrl,
  sloUrl, registeredAttributes, state`** (and offers `environment, certExpiresAt, certFingerprint, externalTicketRef,
  requestedAttributes`); `RecordPrivacyAssessmentRequest` requires `state`.
- `EventActor` requires `name, asAdministrator, reason, token`; in code `token: { id; name } | null`
  (`observability/bus.ts:63-69`).
- **`Manifest-Admin-Reason` is a parameter of exactly 24 operations** — among them `rejectPendingAction`; NOT `approveRelease`,
  `rejectRelease`, `submitIamRegistration`, `recordIamRegistration`, `revokeToken`.
- `Incident.cause` is `deploy | exit | exit_stopped`.

**M9's two reds, read now:** `incident.opened`'s `machineDetail` requires `incidentId, instanceId, releaseId, environment`,
`additionalProperties: false` — **no `cause` yet**; and `launch/readiness.ts`'s `loadRehearsalItems` still answers a BLOCKING
`not_built` item for `large_course`/`public` (B's Task 6 has not landed). Both arrive with B's sitting 4 and later; the plan's
*The worktree* names them.

## `[M2]` The mock — Step 2

**At `2c9fc47` the mock's newest commit is `59a540f`** (A1's Task 7). Facts 10–14 confirmed, line numbers within three of the
plan's: `createMockServer` `server.ts:1253`, its options from `:1254`; `HELD` `:230-253` and `assertHeld` `:256-266` (a `404
NOT_FOUND` naming the mock); `ANSWERS[operation.operationId] ?? example` `:1419-1421`; `listFleet` `:517-526` (`403 FORBIDDEN` to a
member, `f.FLEET` to an administrator); `listQueue` `:707` → `queueOf` (`launch.ts:976`), `otherProjectsItems` `launch.ts:908`;
the record routes answer the fixture whatever is sent (`:656-660`); **I7 holds** — the replay check hashes the body plus
`\0<reason>` (`:1457-1461`) while the store keeps `JSON.stringify(body ?? null)` alone (`:1559-1561`); `/auth/login` `:1363`,
`/auth/step-up` `:1376`; the stream's upgrade handler `:1626` (any `/v1/projects/<id>/events`); outgoing validation `:1539-1556`.
`ADMIN_ME` `fixtures.ts:65`; `OPERATOR_ME` `:73-80`, `OPERATOR_ID = '12121212-1212-4212-8212-121212121212'` (`:72`) — **still
`course-forum`'s project id in `otherProjectsItems`** (`launch.ts:929-930`, the design's T4).

**`packages/mock/src/index.ts` exports** `createMockServer`, `ANSWERED`, `operationsOf`, `readDocument`, `type MockOptions`,
`fixtures` (namespace), `REPLAY`, `READY`, `scripted`, `SCAN_SILENCE_MS`, `createValidator`, `type Validate`, `type Validation`.

**manifest-app (read-only `git grep` at its `fd22aed`)** imports from `@manifest/mock` only `createMockServer` (in
`packages/server/src/app.test.ts` and `packages/web/src/platform/api.test.ts`) and `fixtures` (those two and 17 more test files);
it reads 35 `fixtures.*` names, the most `LAUNCH_READINESS` (83), `PROJECT` (61), `RELEASE` (32), `PROJECT_ID` (30),
`LAUNCH_RECORDS` (29). **It names no `MANIFEST_MOCK_FLEET`, no `MANIFEST_MOCK_PORT`, no 7101 and no 7113.** (`fixtures.origin` in
its `scripts/walk/self-test.ts` is its own walk's object, not ours.) The demo fleet must change none of the `fixtures` it reads —
Task 3's *default answers unchanged* test.

## `[M3]` The references under React 19.3.0, and Vite — Step 3

**The `node:vm` half** ([`probes/render-references.mjs`](probes/render-references.mjs), 0.16 s): `bundle.js`, `components.js`,
`data.js` and `console.js` evaluated in ONE context whose `window` is the context itself, `React` the shared checkout's 19.3.0,
`ReactDOM.createRoot` a stub that keeps the element; every export of `window.Manifest` and `window.ManifestAdmin` wrapped to record
the props the mockup passes; then each of the mockup's four screens rendered with `renderToStaticMarkup` by setting
`location.hash`, and every export rendered ALONE.

- **All four screens render** — queue 18,385 bytes, fleet 27,309, health 11,366, settings 23,537. React's only complaints are
  eight *"unique key"* warnings from the mockup's `Settings` (an ungated mockup; nothing to port).
- **`window.Manifest`: 18 exports, all functions; `window.ManifestAdmin`: 14 components and the helpers `stateOf`, `shorten`, `icon`
  (functions) and `ICONS` (an object).** The parity test's *"counts function-valued exports"* (M3 of the review) reads 18 and 17.
- **Composed by the mockup's static render** (the default item of each screen; a pane needing a click is not reached): `StateChip`
  (11 calls, 2 shapes), `Button` (11), `InverseSurface` (4); `MachineValue` (19), `ConsoleRail` (4), `SettingRow` (31, 6 shapes),
  `WaitHeadline` (1), `QueueRow` (11, 8 shapes — one per item kind's `item`), `FactList` (5), `RawChip` (9), `EventLine` (5),
  `DataTable` (2), `FilterBar` (2), `EnvCell` (102). **Not reached by a static render:** `TwoFacts`, `Choice`, `Tags`, `DiffView`,
  `ObservedAction` — each sits in a pane the mockup opens on a click.
- **Every export renders alone** — with the mockup's first props where it passed some, with `{}` otherwise — **except `Tags`
  (`Cannot read properties of undefined (reading 'map')`) and `DiffView` (`… reading 'sensitiveFields'`)**, which need their props;
  Task 5's parity list supplies them.
- **Task 5's *"two reference changes … ARE MADE"* confirmed**: the mockup passes **`EnvCell` `env: { state, instances, age, incident }
  | null`** (it draws `· N` for instances) and **`EventLine` `who`, `asAdmin`, `reason`, `text`, `type`, `when`**. The prop shapes, as
  recorded:

  ```
  Manifest.StateChip: label:string pulse:boolean state:string || label:string pulse:undefined state:string
  Manifest.Button: children:string kind:string onClick:fn size:string
  Manifest.InverseSurface: inset:string
  ManifestAdmin.MachineValue: label:string value:string || copy:boolean label:string value:string
  ManifestAdmin.ConsoleRail: footItems:[1:{href,icon,label,on}] items:[3:{href,icon,label,on}] user:string
  ManifestAdmin.WaitHeadline: assembled:string items:number itemsLabel:string oldest:{note,text} people:number
  ManifestAdmin.FactList: rows:[5:{label,value}] || rows:[3:{label,value}]
  ManifestAdmin.RawChip: label:string pulse:boolean raw:string state:string || label:string raw:string state:string
  ManifestAdmin.EventLine: asAdmin:undefined reason:undefined text:string type:string when:string who:string || (who:undefined)
  ManifestAdmin.DataTable: caption columns:[8:{key,label,render,sortable}] onRow onSort rowKey rows:[17] sortDir sortKey striped
                            || caption columns:[4:{key,label}] compact rowKey rows:[2]
  ManifestAdmin.FilterBar: count facets:[4:{label,on,onToggle}] id label onClear onQuery placeholder query
  ManifestAdmin.EnvCell: env:{age,incident,instances,state} || env:null
  ```

**The Vite half** (09:32, after FREE): a throwaway page in the session's scratchpad (`index.html`, `main.js` importing `style.css`,
which `@import`s `docs/superpowers/design/system/tokens.css` by the relative path `../../../../../../../Users/rich/Developer/manifest/…`),
run by the shared checkout's `vite` **8.3.0** on port 5199 (outside 7100–7199), then deleted:

- **`vite` (dev)**: ready in 81 ms; `/` → the page; **`/queue/release-approval/x` → the same `index.html`, `200`**; `/style.css` carries
  `--surface-page: #f4f6fa` (the `@import` inlined in dev). No warning in the log.
- **`vite build`**: 0.15 s; the built CSS carries `--surface-page:#f4f6fa` and **no `@import`** (inlined).
- **`vite preview`**: `/` and **`/queue/release-approval/x` → `index.html`, `200`**. Port 5199 free again after.

**So Decision 5 (the stylesheets `@import`ed from `docs/superpowers/design/`, not copied) and Decision 13 (paths routed in-app, a deep
link reloadable) stand** — measured from OUTSIDE the workspace root, a harder case than `packages/admin-ui/src/styles.css`'s.

## `[M4]` The worktree, offline, and the contract's `dist/` — Step 4

**The worktree: made at 09:13:12–13 PDT** — `git -C /Users/rich/Developer/manifest worktree add -b p11-admin-ui
/Users/rich/Developer/manifest-p11 main` → `HEAD is now at 2c9fc47c`; `git worktree list` reads the shared checkout and
`/Users/rich/Developer/manifest-p11 2c9fc47c [p11-admin-ui]`. No `node_modules`, no `packages/contract/dist/` in it.

**The install, offline (09:31:47–51).** With `packages/admin-ui/` (Task 2's, written under HOLD) moved aside so the tree was `main`'s:
`pnpm install --offline --frozen-lockfile` → **exit 0 in 4.19 s** (2.49 s user) — *"Lockfile is up to date, resolution step is skipped"*,
*"resolved 610, reused 609, downloaded 0, added 610"*, the store at `~/Library/pnpm/store/v11`. **No network asked.** Then, the package
back, `pnpm install --offline` (09:32) → exit 0 in 0.24 s, the lockfile gaining exactly the `packages/admin-ui` importer (+28 lines:
`@manifest/contract`/`@manifest/mock` linked, `react`/`react-dom` 19.3.0, `@types/react`/`@types/react-dom` 19.3.0,
`@vitejs/plugin-react` 6.1.1, `vite` 8.3.0) — **no new package in the store** (the plan's *No new dependency*).

**The contract's `dist/` was needed (I1).** Before the build, from `packages/console`: `node -e "import('@manifest/contract')"` →
**`ERR_MODULE_NOT_FOUND Cannot find module '…/packages/console/node_modules/@manifest/contract/dist/index.js'`**. `pnpm --filter
@manifest/contract build` → exit 0 in 3.47 s. After it: **loaded** — `ManifestApiError, SESSION_COOKIE, createManifestClient,
idempotencyKey, sessionCookieFor, subscribe, unwrap`.

## `[M5]` The ports — Step 5

**Predicted nothing on 7101 or 7113, and 7113 named nowhere. Measured:** `lsof -nP -iTCP:7101 -sTCP:LISTEN` and `-iTCP:7113` both
exit 1 (nothing); `grep -rn "7113" infra scripts Makefile docs/superpowers/RUNBOOK.md docs/superpowers/specs` exits 1 (no match). **7113
stands.** `scripts/doctor.sh`'s `check_block` (`:210-230`) and its four `*_is_ours` (`control_plane_is_ours :169`, `console_is_ours
:180-185`, `mock_is_ours :196-199`, `frontend_is_ours :206-209`) are as fact 19b says; Task 2 adds two beside them.

## `[M6]` A `.test.tsx` under a new project — Step 6

**Predicted 1 passed. Measured 1 passed** (09:32:24): with Task 2's `admin-ui` entry in `vitest.workspace.ts` (root
`./packages/admin-ui`, include `src/**/*.test.{ts,tsx}`, the scaled timeouts) and the package installed, `pnpm exec vitest run --project
admin-ui smoke` → `✓ |admin-ui| src/smoke.test.tsx (1 test) 4ms` — `renderToStaticMarkup(<p>ok</p>)` is `<p>ok</p>`. **Vitest 2.1.9
transforms the `.tsx` through its own Vite 5.4.21's esbuild with the package's `tsconfig.json` (`jsx: react-jsx`)** — no Vitest
`esbuild`/`jsx` option needed. The smoke test was deleted in Task 2, as the plan says.

## `[M7]` What is owed — Step 7

**No file this plan changes is in CLAUDE.md's Docker-tier list** (`runtime/`, `routing/`, `services/`, `build/`, `releases/`,
`identity/`, `sso/`, `secrets/`, `projects/`, `blueprints/`, `ai/`, `observability/`, `infra/`, a `*.docker.test.ts`): the tree a
sitting changes is `packages/admin-ui`, `packages/mock`, `vitest.workspace.ts`, `package.json`, `eslint.config.js`,
`pnpm-lock.yaml`, `scripts/` and `Makefile`. **`pnpm test:docker` is never owed.** The gate numbers at `2c9fc47`
(`scripts/ci-acceptance.sh`): `EXPECT_TESTS=3691` (`:346`), `EXPECT_FILES=224` (`:347`), `EXPECT_DOCTOR=22` (`:350`),
`EXPECT_VERIFY=67` (`:355`).

## `[M8]` What a worktree's unit tier reads — Step 8

**Confirmed (fact 19a).** `packages/control-plane/vitest.env.ts:30-41`'s `envValue` reads `new URL('../../.env', import.meta.url)`
and, with no file, returns `undefined` — *"leave the variables unset. client.ts raises the actionable error"*; the global setup's
TRUNCATE is behind `ensureDatabaseUrls() && process.env.MANIFEST_ADMIN_DATABASE_URL` (`vitest.global-setup.ts:74`). In the
worktree `.env` is absent (`ls` → no such file) and git-ignored (`git check-ignore -v .env` → `.gitignore:22:.env`). **So the `unit`
project cannot run in the worktree** — which is what keeps a build sitting's gates off 7100's database.

**The symlink, tried once and removed (09:25:28 PDT)** — first held back on the coordinator's GO (*"The `.env` symlink is only for a
landing"*), then, at 09:25, the coordinator's correction: *"do as your plan's [M8] says — TRY IT ONCE NOW (no CPU), read back that it
resolves (never print the file), and remove it at once."* `ln -s /Users/rich/Developer/manifest/.env
/Users/rich/Developer/manifest-p11/.env` → **exit 0, not refused**; `readlink` → `/Users/rich/Developer/manifest/.env`; `[ -r … ]` →
readable; `git status --short` names no `.env` (git-ignored); `rm` → exit 0, and `ls` → no such file. **The file was never read or
printed. So the classifier allowed it on 2026-10-15**; each landing makes it again before its whole-suite run (the plan's *The
worktree*), and it may still be refused then — the classifier varies by session (ORIENTATION §4, trap 3).

## `[M9]` What the platform lets the demo fleet hold — Step 8a

Read at `2c9fc47`. **The rules Task 3's table must obey, at contract `1.9.0`:**

1. **Only a `class` app can launch.** `launch/readiness.ts`'s `loadRehearsalItems` (`:227-240`, spread into both clauses at `:168`
   and `:198`) answers, for `scale` `large_course` or `public`, a **blocking** `load-rehearsal` item with state **`not_built`** —
   *"An app for {the public | a large course} is rehearsed against staging with production-shaped capacity before launch."* No
   measurement can meet it until B's Task 6. A large-audience app may exist, be built, run on staging and wait at the checklist;
   it may not be in production, nor hold a production release approval that launched it.
2. **A release carrying FIXABLE findings exists only on a STALE scan.** The build gate blocks on fixable findings and records the
   rest (`build/scan.ts:90`, Rich's call of 2026-09-08); a stale database WARNS rather than blocks at build time (C1). And a stale
   scan leaves the checklist's `scans` item **`unmet`** (`readiness.ts:1015-1025`: *"…scanned against a vulnerability database {N}
   days old, more than 7 … rebuild once the database is refreshed."*). So a release with fixable findings is a staging release on a
   stale database, never one in production.
3. **UBC's order** (`launch/records.ts`'s send, the block at `:600-676`): either registration is sent only once the privacy
   assessment is `approved` **and carries its reference** (`409 LAUNCH_PIA_NOT_APPROVED` otherwise — *"UBC IAM asks for the PIA
   number"*); production's only once **staging's is `active`** (`409 LAUNCH_STAGING_NOT_REGISTERED`). A demo record beside each
   registration must say so.
4. **What a submission stamps.** The team's submission (`submitIamRegistration` / `submitPrivacyAssessment`) sets `submittedAt` to
   **Vancouver noon of the day** (`vancouverNoon(day)`, `records.ts:902` and `:959`; `day` is `sentAt` or today, `:544`), and the UBC
   item's `since` is `submittedAt ?? updatedAt` (`queue.ts:290`) — **before noon on the day it is in the future**. A recorded
   answer of `submitted` (UBC's path, `recordIamRegistration`) stamps `new Date()` (`records.ts:263-269`).
5. **A granted change is two writes.** The registration's arrows (`launch/transitions.ts:39-50`): `draft → submitted`; `sent →
   (none)`; `submitted → active | change_requested`; `active → change_requested | expired`; `change_requested → submitted |
   expired`; `expired → submitted`. **No `change_requested → active`.** The first write (`submitted`) re-stamps `submittedAt`, keeps
   `registeredAt` (`records.ts:249-254`), so the registration stays in force (`readiness.ts:552`: `registeredAt === null` is the
   "not in force" test). The assessment's (`:52-59`): `draft → submitted`; `sent → (none)`; `submitted → approved | draft`; `approved →
   draft`.
6. **What a record write requires** (`records.ts`): `environment` defaults to `production` (`:170`); `requestedAttributes` is
   required for `active → change_requested` (`:223-232`, `LAUNCH_RECORD_INVALID`); `entityId`, `acsUrl`, `sloUrl`,
   `registeredAttributes` are upserted from the body (`:291-294`, `:314-317`). Four `LAUNCH_RECORD_INVALID`s in all (`:164`, `:211`,
   `:217`, `:229`).
