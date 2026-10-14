# A fresh review of the two bring-your-own-agent plans: BP's and BF's (2026-10-13)

> **What this is.** Job BR of the BYOA planning run: a read-only review, by `manifest-byoa-review`, of the two plans the run wrote,
> against the code, at `manifest-byoa-coord`'s GO (~21:15 PDT). The fixes are **not applied** here. BP and BF revise their own plans to
> this review, through the coordinator, and then Rich approves.
>
> **The two plans:**
> - **BP's** — `docs/superpowers/plans/2026-10-13-byoa-on-the-laptop.md` (`1ae8c70`, plus `c470221`). Its approved design is
>   `…-design.md` (`e5a0c08`).
> - **BF's** — manifest-app `docs/plans/2026-10-13-f7-start-your-agent.md` (`34c6b8d`). Its approved design is `…-design.md` (`42f637a`).
>
> **What the code was read at.**
> - manifest `163f42c`: A1's Task 5, contract `1.9.0`. HEAD moved twice more while this was written, `3d57fc3` and `6eb15e0`, both
>   spec-only. A1's sitting 4 had the tree mid-edit, so for the contract, the mock's fixtures and the spec I read the COMMITTED file
>   with `git show <sha>:<path>`. I counted the contract's operations at both `1ae8c70` (1.8.0) and `163f42c` (1.9.0). Every other
>   cited file was clean against HEAD.
> - manifest-app `34c6b8d`.
>
> **Rich's words this rests on:** `docs/superpowers/2026-09-30-decisions.md`, the three entries headed *"(session manifest-byoa-coord,
> the BYOA planning run…)"* — `0b17f87`, `c5df7db` and `3fe5299`.
>
> **The house rules this review held:**
> - Documents only. No test, Docker, make, demo, build or server, and nothing on 7100–7199.
> - The spec, the shared HTML pages and the 53 local app repositories under `.manifest/repos` were READ, and nothing else was touched.
>   The repositories were read with `git grep`, and no matched value was printed.

**In one paragraph.**
- **Both plans are sound in shape.** MCP adds no path around D24. Every cited fact I re-checked holds, or has drifted by a few lines.
  The two plans agree on every event name and field, and on the contract chain.
- **BP's plan: approve with the fixes below.** No Critical finding, ten Important and thirteen Minor. The Important ones:
  - its acceptance asks for something a fresh project cannot do;
  - two negative controls cannot fail;
  - its mock work comes too late for the typecheck gate;
  - the revoke misses §26's declared-code machinery;
  - one generated tool hands a model key into the outside model's context;
  - one composite misreads the build's state;
  - its tool hints call every write non-destructive;
  - its policy section under-states what a provider sees;
  - its spec actions name no shared page.
- **BF's plan: approve with the fixes below.** No Critical and no Important finding of its own, and five Minor. Three cross-plan
  Important findings touch it.
- **Cross-plan: three Important and four Minor.** The worst is that BP's Task 6 moves CWL and model know-how out of the one pack the
  front end's own building agent reads.
- **There is one question for Rich** (*Questions for Rich*, below).

---

## 1. BP — *Bring your own agent, on the laptop* (`2026-10-13-byoa-on-the-laptop.md`)

**Summary.**
- `packages/mcp` is a stateless MCP server, Streamable HTTP, on loopback port 7113. The edge reaches it at `/mcp` on `app.` and
  `console.`. It has one generated tool per operation a token may call, plus `waitForBuild` and `waitForPerson`, held to the contract by
  a coverage gate.
- A token's rate is set at mint (1–600 a minute), and `RATE_LIMITED` carries its limit as fields.
- There are daily quotas per token on builds, deploys, commits and resolutions. They are counted in `delegated_token_usage`, declared on
  the route, and taken by the wrapper.
- FE-11 (b): the minter, an owner or an administrator may revoke a token, and a new `token.revoked` event and `Token.revokedBy` record
  who did.
- `mft_` and `sk-` join the secret scanner.
- Toolkits (`cwl` and `models`) are served beside blueprints.
- Contract ~`1.12.0`. Ten tasks in eight sittings. The acceptance is `make demo-byoa` on either driver, plus Rich with a real Claude Code.
- Spec actions A–E are drafted, and the policy section asks P1–P5.

**Verdict: approve with the fixes below.**

### What I re-checked, and how it reads

**These hold at `163f42c`:**

| Plan fact | Where it was checked |
|---|---|
| 76 operations; 27 carry `security: [{session}]`; 49 take the document's default; 48 tools once the WebSocket is left out (Step 5). The same at 1.8.0 and 1.9.0 | `node` over `openapi.json` at both revisions |
| `streamProjectEvents` is the only operation with `x-manifest-websocket` | the same count |
| The token format and its prefix's purpose | `tokens/token.ts:1-40` |
| `rate_limit` defaults to 600 | `db/schema.ts:481` |
| The rate is taken after the token is verified | `api/server.ts:323-341` |
| `RATE_LIMITED` carries no limit fields | `api/errors.ts:729-740` |
| `MintTokenRequest` takes three fields | its representation |
| `revokeToken` is the minter's alone, with a 404 for anyone else | `api/routes/tokens.ts:342-354` |
| Questions end and streams close in one transaction | `api/routes/tokens.ts:360-385` |
| There is no `token.*` event but `token.minted` | `observability/events.ts:70` |
| The `events_type_known` CHECK | `drizzle/0053_lumpy_boomerang.sql` (`0054` does not touch it) |
| The authorization matrix's revoke row | `api/authz-contract.ts:2143-2160` |
| `Token.mintedBy` | `api/representations/tokens.ts:24` |
| `listTokens` answers to any member | `api/routes/tokens.ts:296-306` |
| `members:manage` is the owner's and the administrator's, and privileged | `projects/authz.ts:452-489`, `:170-175` |
| `assertCapability` answers 404, 403, then §26's reason | `projects/authz.ts:597-730` |
| `Limit` | `api/representations/errors.ts:15-44` |
| The wrapper: authenticate, resolve, then `run` | `api/contract/route.ts:224-420` |
| `UNVERSIONED` is held exactly | `api/versioning.test.ts:9-15` |
| The console's gate and its boundary | `packages/console/src/{coverage,boundary}.test.ts`, `eslint.config.js:100-110` |
| `createMockServer` | `packages/mock/src/index.ts:6` |
| The Caddyfile's sites | `infra/caddy/Caddyfile:51`, `:68`, `:124`, `:141` |
| `stream_close_delay` on both sites | the Caddyfile |
| 7113 is unassigned | `infra/lib/common.sh:72-100` |
| §21 reserves 7101 | spec l. 2236 |
| The CA hint and the demos' CA | `infra/seed/seed.sh:121`, `scripts/demo-authoring.sh:85` |
| Doctor asks each host process for its marker | `scripts/doctor.sh:182-216` |
| `SECRET_PATTERNS` has no `mft_` or `sk-` rule | `build/secret-patterns.ts:22-58` |
| Driver 1's hook is rendered from that list | `source/pre-receive.ts:3,22` |
| The build's gate skips `node_modules` | `build/gates.ts:37` |
| `AGENTS.md`'s four headings | lines 31, 52, 73, 195 |
| `node-ts-mongo@1`'s pins | `blueprints/node-ts-mongo/blueprint.yaml:102-106` |
| FE-32 publishes no event for a resolution | `2026-10-03-fe32-dependencies.md:243` |
| FE-32's `resolveDependencies` takes `source:write` | the same plan, l. 563-582 |

**[M8] in advance.** I ran both proposed scanner rules over `blueprints/`, `fixtures/`, `packages/*/src`, `docs/`, `infra/` and
`scripts/`, and over the HEAD of all 53 bare repositories in `.manifest/repos`.
- **The app repositories hold no hit, and neither do `blueprints/` and `fixtures/`.** So no starter, skeleton or existing app trips
  either rule.
- The hits are all in Manifest's own source and docs. The document's examples, `sk-example-not-a-real-key` and a `mft_…` example,
  live in `api/routes/agents.ts`, `api/routes/tokens.ts` and `operations.md`. Unit tests make up the rest. No app is scanned with any
  of them.

**Drifted, and harmless**, all collected in BP-M1.

### The departures from the approved design

| Departure | Sound? | Rich's word needed? |
|---|---|---|
| **D2 — the rate's bound is the constant 600, not `MANIFEST_TOKEN_RATE_LIMIT_MAX`** (plan:221-224) | **Yes.** Rich's recorded words are *"1 to 600 a minute, default 600"* (`c5df7db`, answer 5). A bound the published document states as `.max(600)` cannot lie on a machine where a setting changed it. Spec action C should then say *"at most 600"*, not *"the platform's maximum"* (BP-M2). | No. Name it in the approval message. |
| **D9 — `/mcp` goes in a new `x-manifest-alongside` extension, not `UNVERSIONED`** (plan:250-252) | **Yes, and necessary.** `versioning.test.ts:9-15` holds `UNVERSIONED` to the control plane's own registered routes exactly, so `/mcp` (another process's) cannot be in it. D23.8's intent is kept: the contract says the endpoint exists. | No. Optionally, Spec action B names `/mcp` in D23.8's list of endpoints outside `/v1` (BP-M2). |
| **D10 — the tool set is derived from each operation's `security`, not listed** (plan:253-256) | **Yes.** The document marks all 27 session-only operations (measured), so the derivation is exact and a new operation places itself. **But the exception list must grow** by two operations whose answers must not reach a model (BP-I6). | No for the derivation. **Name the two new exceptions at approval**: they depart from *"one tool per operation a token may call"*, which Rich approved as written. |
| **D14 — `waitForBuild` is short and resumable (`MANIFEST_MCP_WAIT_SECONDS`, default from Task 1, else 60) where the design said ten minutes** (plan:266-269; design l. 135) | **Yes.** No client's tool timeout or edge reload is measured to survive ten minutes. `{ done: false }` plus *"call again"* costs one call, while a dropped ten-minute wait costs the answer. | Not a question. **Name it at approval**: Rich approved *"bounded at ten minutes"* as written. |
| **7113, not 7101** (Decision 18; *What the self-review caught*) | **Yes.** The design offered both as unassigned, but spec l. 2236 gives 7101 to the admin UI. Spec action E records 7113. | No. |
| **`token.revoked` is a new event type with a CHECK migration** (Decision 8) | **Yes.** No `token.*` event but `token.minted` exists, and the design's *"the event names who revoked whose"* needs one. Two things are missing from its file list (BP-M4): `observability/event-schemas.ts`, because `recordEvent` refuses a type without a detail schema (`events.ts:326`), and the events reference. | No. |

### Findings

*Important*

**BP-I1. The acceptance's privileged path cannot pass on a fresh project.**
- *Plan:* `:1791-1793`, steps 5–7: deploy to production → a question → confirmed → *"the identical `deploy` call → through, once; a third
  → a new question"*. Also design l. 339.
- *Code:* `api/routes/releases.ts:1168-1194`. `assertCapability` passes on the grant, then `assertStepUp` passes on the grant, and then
  `ProductionGateError` answers `409` with §13's checklist. A project `demo-byoa` created at step 1 has no rehearsal, approval or
  records, so the retry is refused by the gate, not let through.
- The grant is spent only after a handler resolves (`route.ts`, after the try), so it stays unconsumed. The *third* call then matches
  the same confirmed row, and is refused by the gate again: it is not a new question.
- *Fix:* do as `make demo-token` does, and confirm an `addMember` (`members:manage`; `packages/journey/src/token.ts:196-206`, `:550`,
  `:734`). Its retry goes through once, and its third call is a new question. Keep step 5's production ask only as D24's refusal (a
  tool error carrying `pendingAction`), as `demo-token`'s step 5 does (`token.ts:441-485`). A production "goes through" belongs to a
  launched app, which is the clicked half (cross-plan X7).

**BP-I2. Task 3's negative control (c) cannot fail.**
- *Plan:* `:899`: *"Move the take after `route.handler`; predict the replay case counts 2."*
- *Code:* `api/contract/route.ts:293` and `:352`. The take sits inside `run`, and `app.idempotent` (`replayOrStore`) answers a repeated
  key from its record without calling `run` at all. Moved after the handler, the take is still inside `run`, so a replay still counts
  1, and the control stays green. *"A replay is not counted"* rests on the take being inside `run`, not on its order within it.
- *Fix:* move the take OUT of `run`, into `handle` before `app.idempotent(…)`, and predict that the replay case counts 2. Keep (a) and
  (b) as written.

**BP-I3. Task 7's negative control (c) cannot fail.**
- *Plan:* `:1591-1592`: *"Put `options.token` into the `/__doctor` body; predict the no-echo spy red."*
- `/__doctor` is answered by `main.ts`, where no token exists, because the token is per request (`http.ts`, plan:1573-1576). The spy
  reads `console.*`, not an HTTP body. So the edit cannot be made as written, and if it were made, the spy could not see it.
- *Fix:* put the request's `authorization` header into `main.ts`'s per-request operator line, or into `callTool`'s refusal text. Predict
  that `server.test.ts`'s log spy, or `call.test.ts`'s *"token in no field"* check, goes red.

**BP-I4. Tasks 2–4 and 6 change representations the mock's fixtures are typed by, and the mock waits for Task 9 (sitting 7).**
- *Plan:* Task 3 adds a REQUIRED `Token.usage`, Task 4 `Token.revokedBy`, and Task 6 `Blueprint.toolkits`. The mock is only Task 9's
  (`:1739-1740`). The plan's own Global Constraint says *"keep them typecheck-clean together"* (`:302`).
- *Code:* `packages/mock/src/fixtures.ts:806` declares `TOKEN: Schemas['Token'] = {…}`, and `:829` spreads it into `REVOKED_TOKEN`. So
  once `usage` is required, `pnpm typecheck` for `@manifest/mock` is red. The four gates must be clean before every commit, so Task 3's
  commit cannot be made. The same holds for Task 4, and for Task 6's blueprint fixtures.
- The faculty front end links this working tree's contract and mock (memory *Faculty front-end is a sibling repo*). Its typed fakes
  meet the same fields at that moment, not at BP's sitting 7.
- *Fix:*
  - Each of Tasks 2, 3, 4 and 6 updates the mock's fixtures, and its answers where the operation changes, in its own commit, with
    contract and mock as one unit.
  - Each *"Tell the front end"* step says which typed fields arrived.
  - Task 9 keeps the docs, the mock's `TOKEN_QUOTA_EXHAUSTED` switch, the toolkit operations' answers and a scripted `token.revoked`
    frame (X5).

**BP-I5. Task 4 misses the machinery §26 derives from a route's `capability`.**
- *Plan:* `:1027-1059`. The handler calls `assertCapability(…, 'members:manage')` for a non-minter, and the only declaration change is
  *"`errors` gains `FORBIDDEN`"*.
- *Code:*
  - `api/contract/document.ts:191-215` declares `PROJECT_ARCHIVED` and `ADMIN_REASON_REQUIRED` (and the `Manifest-Admin-Reason` header)
    from `RouteDefinition.capability`, through `refusedWhenArchived` and `refusedWithoutAdminReason` (`projects/authz.ts:747-766`).
  - `revokeToken` has no `capability` today. Once its handler reaches `requireAdminReason` (`authz.ts:781-813`), an administrator who
    is no member is answered `400 ADMIN_REASON_REQUIRED` while the document declares nothing.
  - `api/authz-contract.ts:3089` holds the answered set equal to the declared set, *and* to a literal list of 24 operations. So
    `authz-contract.test.ts` goes red either way.
  - An owner's revoke on an archived project now reaches the archived refusal too (`authz.ts:734`).
- *Fix:*
  - Give `revokeToken`'s definition `capability: 'members:manage'`. Its description says the minter's own revoke asserts none.
  - Grow the literal list to 25, with `revokeToken`.
  - Read the archived measurement (`authz-contract.ts`'s *PROJECT_ARCHIVED* case) at Step 4, and say what an owner's revoke of a
    collaborator's token answers on an archived project. Every token there is already revoked by the archive, so an idempotent `200`
    before the check is the kinder answer.
  - Put all of this in Task 4's files and its Step 2 prediction.

**BP-I6. Two generated tools must not be tools.**
- *Plan:* Decision 10 (`:253-256`) makes every operation a token may call a tool, with only `streamProjectEvents` left out (`:1382`).
  Resources include `manifest://openapi.json` (`:1616`). Decision 12 sends every answer as text AND as `structuredContent` (`:261-263`).
- **`startAgentSession` answers a model key.** `AgentSessionStarted.key` (`api/representations/agents.ts:122-130`) is answered as
  `{ session, key, baseUrl }` (`api/routes/agents.ts:228-260`). Through MCP that key becomes a tool result, which is the outside
  model's context. That contradicts the design's own reason for `/mcp` (design l. 71-72: *"over `curl` the model reads the token and
  can echo it into a log or a commit"*).
  - It is also useless to an MCP agent, which thinks with its own provider (Rich's answer 4, `c5df7db`).
  - The `sk-` rule (Task 5) would catch a commit of it, and nothing catches a log line.
- **`getOpenApiDocument` answers 1.2 MB** (`packages/contract/openapi.json` at `163f42c`). As text plus structured content that is
  ~2.4 MB per call, far past what an MCP client passes to a model. Claude Code's default MCP output cap is in the tens of thousands of
  tokens. Every operation is already a tool with its own schema.
- *Fix:*
  - Put both in `NOT_TOOLS` with their reasons: *"answers a model key: a credential in the model's context"* and *"1.2 MB; every
    operation is a tool with its schema"*.
  - Drop `manifest://openapi.json` from the resources, or serve one line per operation.
  - Publish the exception list in the document, so the front end derives the same set (X3).
  - Add `startAgentSession` to Review Focus 1, and test that no tool result carries `sk-`.

**BP-I7. `waitForBuild` misreads the build.**
- *Plan:* `:1652-1654`: `const done = build.state !== 'running'`. And `:1647`: `subscribe({ …, onClose })`.
- *Code:* `Build` has **`status`**, not `state` (`api/representations/builds.ts:74`). Its enum begins `pending`, `running`,
  `succeeded` (`db/schema.ts:27-30`). So once renamed, `!== 'running'` answers **`done: true` for a `pending` build**, one queued behind
  another app's on the one builder. The agent then calls `createRelease` on an unfinished build.
- `SubscribeOptions` has no `onClose`. The subscription offers `closed: Promise<{code, reason}>` (`packages/contract/src/stream.ts:9-30`).
- *Fix:*
  - `done` means `succeeded` or `failed`. Read the build FIRST and answer at once when it is already terminal, because the replay may
    not hold its end.
  - Use `subscription.closed.then(…)` for the revoke's `4401`.
  - Add a `pending` case to `composites.test.ts`.

**BP-I8. The tool hints call every write non-destructive.**
- *Plan:* `:1537-1542`: `destructiveHint: op.method === 'delete'` and `idempotentHint: op.method === 'get' || op.takesIdempotencyKey`.
- **Explicit `false` is a claim.** It tells a client that `deploy` (it replaces what serves staging), `setAppSecret` (it overwrites a
  value), `updateProject` and `createCommit` destroy nothing. MCP's default for a tool that is not read-only is destructive.
- **`idempotentHint: true` is false whenever the agent omits `idempotencyKey`.** The server then makes a fresh key per call
  (`:1479`), so two identical calls make two builds.
- These hints are what BF's Layer 2 and a client's own presets lean on (design §2).
- *Fix:*
  - `readOnlyHint` for `GET` alone.
  - Leave `destructiveHint` unset (its default, true) for every write, or set it true. `DELETE` stays true.
  - `idempotentHint` for `GET` alone.
  - Assert the hints on `deploy` and `createCommit` in `server.test.ts`.

**BP-I9. The policy section under-states what a provider sees.**
- *Plan:* `:1851`: *"the project's people: names and CWL login names"*. The design's §6 says the same.
- *Code:*
  - `Member` carries **`puid`** (the ubcEduCwlPuid) and **`email`** (`api/representations/members.ts:9-21`), and `listMembers` is a
    token's.
  - `getLaunchRecords` and the two drafts (a token's: `launch:draft`) carry the privacy assessment's answers, including who is
    accountable.
  - `recordEvent` appends an administrator's §26 reason to the event's sentence (`observability/events.ts:350-357`), which a token
    reads on the stream.
- This section is written to be carried to the Privacy Office as it stands, so an omission there is a misstatement.
- *Fix:* add the PUID and email, the launch records, and administrators' reasons. Add BP-M11's line on where the client keeps what it
  read.

**BP-I10. The spec actions name no shared page to sweep.**
- *Plan:* `:1897-1898` says the pages *"are swept with it"*, and no action says which. CLAUDE.md: *"A spec action is not finished when
  the spec changes."*
- *Read:*
  - **A and B**: `specs/manifest-phases.html`'s stage-3 card (*"Sandboxes and building by describing"*, l. 284) says *"Manifest also
    becomes available as a set of tools any AI can use directly, which is what makes 'bring your own AI' real"*. That moves to a new
    2b card.
  - **D**: `manifest-decisions.html`'s D25 card (l. 175).
  - **C**: `manifest-decisions.html`'s D24 card (l. 170). It names no rate or revoke today, so read it and record it as unchanged, or
    add a clause.
  - **E**: `manifest-schematic.html` and `manifest-stories.html` carry no inventory or MCP line. Checked, unchanged.
- *Fix:* each spec action names its pages and what changes on each.

*Minor*

**BP-M1. Small facts that drifted. Task 1 re-reads them, but the plan should not carry them.**
- `CreateTokenInput` **already has** `rateLimit?` and writes it (`tokens/repository.ts:24`, `:45`), so plan:554's *"gains"* is a
  no-op.
- `mintTestToken` lives in `tokens/testing.ts:21-35`. Plan:145-146 cites a caller.
- `TOKEN_RATE_WINDOW_MS` is `rate-limit.ts:83` (plan:142 says `:75`).
- `token_hash` is `schema.ts:477` (the plan says 475).
- `x-manifest-unversioned` is `document.ts:525` at `163f42c` (`:514` before A1).
- The mock's token is `fixtures.ts:838` (the plan says 835).
- **D25 is spec l. 221**, not 222 (plan:48, :1941).
- §25's *The descriptor* and *Starters* moved to l. 2868 and l. 2909 with A1's Spec action B (`3d57fc3`).
- `recordEvent` takes a redactor as its third argument (`events.ts:303`; plan:1045).

**BP-M2. The spec actions' wording.**
- **A** (`:1911`): *"A fifth, 2b"*. That paragraph counts Phase 1's increments (*"A fourth increment, 1b+, was placed between 1b and
  1c"*, spec l. 1893-1894), and 2b is not one. Write a sentence of its own.
- **B** (`:1917`) replaces l. 2472-2473 but leaves the heading at **l. 2461, *"The third reference client: MCP (Phase 3)"***. Add it.
  Optionally, add `/mcp` to D23.8's list of endpoints outside the versioned contract (l. 2528-2531).
- **C** (`:1931`): *"at most the platform's maximum"* should be *"at most 600 a minute"*, by D2.
- **E** (`:1955`) does not draft its sentence. Write it word for word, against l. 2217-2218's current text: *"Ten long-running
  containers, plus three host processes (control plane, admin UI, console)"*.

**BP-M3. The stranger's 404 now names the project.**
- *Plan:* `:1037-1039` sends a non-minter through `assertCapability`.
- *Code:* a stranger is answered `no project '<projectId>'` (`authz.ts:697`/`:705`). Today a stranger and a missing id both get `no
  token '<id>'` (`routes/tokens.ts:354`), deliberately the same answer (`authz-contract.ts`'s comment at 2143).
- *Fix:* catch the stranger's `NOT_FOUND` and rethrow the token's. Assert the message, not only the code.

**BP-M4. `token.revoked`'s detail schema and the events reference.**
- `recordEvent` refuses a type without an `EVENT_DETAIL_SCHEMAS` entry (`events.ts:326`). That schema is the published `EventFrame`.
- *Fix:* add `observability/event-schemas.ts` to Task 4's files and to the File Structure (`:369`), and add `docs/api/events.md` and
  the reference to its commit.

**BP-M5. Declare `TOKEN_QUOTA_EXHAUSTED` where it can be answered.**
- *Plan:* Task 3 adds the code to `error-codes.ts` only.
- *Fix:* derive it in `document.ts` from `RouteDefinition.quota`, as `PROJECT_ARCHIVED` is derived from `capability`, so the four
  operations publish it. `RATE_LIMITED` is in `EVERY_ROUTE` (`document.ts:167-178`), and this code is not.

**BP-M6. Task 3 mixes two clocks.**
- *Plan:* `:800`: `since = new Date(Date.now() - DAY_MS)`, the host's clock. The rows are stamped `clock_timestamp()`, the database's
  (`:755`). ORIENTATION's trap: the database's clock is not the host's.
- *Fix:* compute the window in SQL, `created_at > clock_timestamp() - interval '24 hours'`, and the same in `usageOf`.

**BP-M7. A toolkit's allowlist check must use FE-32's EFFECTIVE set.**
- *Plan:* `:1233`: `allowedForTest` *"reads FE-32's allowlist file"*. The registry refuses `TOOLKIT_PACKAGE_NOT_ALLOWED`.
- FE-32's skeleton dependencies are *"allowed by the loader, not listed"* (`2026-10-03-fe32-dependencies.md:601-602`). So
  `passport-ubcshib` and `ubc-genai-toolkit-llm` are not in the file, and reading the file alone refuses `cwl` and `models` at boot.
- *Fix:* read the allowed set FE-32's loader computes, the file plus the skeletons' direct dependencies.

**BP-M8. The network list is incomplete** (`:304-305`).
- Every real-agent run calls Anthropic or OpenAI with probe or fixture content: `[M3]` and `[M4]`'s *"lists and calls the tool"*, Task
  8 Step 4, and Task 10 Step 4.
- That is P1's flow in miniature, and harmless on fixtures, but it is network Rich has not been asked for.
- *Fix:* list each in *What Rich does* and the Global Constraints.

**BP-M9. `[M3]` should also measure the two ways Claude Code may show "connected" falsely.**
- **A wrong or revoked token.** `initialize` and `tools/list` make no API call, so any `mft_`-shaped bearer gets a full tool list. The
  first failure is the first tool call.
- **A `401` with `WWW-Authenticate: Bearer`** (plan:1574-1575). This can start the client's OAuth discovery at `app.`'s
  `/.well-known/…`, which the edge sends to 7105.
- *Fix:* measure both. Consider validating the token at `initialize` with one cheap read, answering an HTTP `401` there.

**BP-M10. The real client should call a tool whose schema carries `$defs`.**
- *Plan:* Task 8 Step 4 calls *"one read tool"* (`:1719`). A path-only read does not exercise `$defs`, where a client or its provider
  may refuse the generated schema.
- *Fix:* call `createCommit` with `dryRun: true` on each client.

**BP-M11. Word the token's absence from the model's context honestly.**
- *Plan:* the design's Done 1 says *"the token never in its model's context"* (design l. 43-44; carried at plan:18-22).
- That is true of what Manifest hands the model. But the token sits in plaintext in the client's own configuration, `~/.claude.json`
  for the default local scope or a shell profile for Codex's variable, and an agent can read that with its own file tools. The client
  also keeps a transcript of every tool result (code, members, logs) on the person's machine.
- *Fix:*
  - Done 1: *"never put in its model's context by Manifest"*.
  - The guide's rules: *"never read your own configuration"*.
  - The policy section: one more line, where the client keeps what it read.

**BP-M12. The FE-32 dependency is real, and its rationale is over-stated.**
- It is real in Task 3 (the quota on `resolveDependencies`), Task 6 (the allowlist) and Task 10 (step 4).
- But the plan says FE-32's allowlist *"stops an outside agent committing any lockfile"* (`:60`; design l. 323-324). FE-32 refuses at
  the operation and at the build's gate (`fe32:251-256`), not at `createCommit`. An agent can still commit any lockfile; it cannot
  BUILD one that names an unlisted direct dependency or remaps a tarball.
- *Fix:* say so, in both places.

**BP-M13. Sitting 8 is two sittings** (`:85`).
- It holds:
  - a new 15-step demo and its journey file;
  - five controls that restart 7100 and 7113;
  - three runs on each driver;
  - `make ci-acceptance` (~30 min);
  - the whole-branch review and its fix wave;
  - Rich's click;
  - the close-out.
- Every acceptance sitting of this size so far has split.
- *Fix:* split it into **8a**, `make demo-byoa`, its controls and the runs, and **8b**, the review, its fix wave and Rich's click,
  shared with BF's sitting 6 (X7). Nine sittings.
- Sitting 6 is the next heaviest and can stand. Task 1's nine measurements fit one sitting, because no code changes in it.

---

## 2. BF — *F7, Start your agent* (manifest-app `2026-10-13-f7-start-your-agent.md`)

**Summary.**
- Their agents' work is a pure fold over the keeper's history (`theirWorkOf`), served at `GET /api/apps/:projectId/their-agents`. It
  shows as a row and a page in *Conversations* in our words, and as *"… is working on it too"* beside our line, never holding it.
- Three preset choices, *Build and try it out* first and chosen.
- After BP lands:
  - an owner's [Revoke] on any agent;
  - `token.revoked` heard, with the maker emailed;
  - the last day's counts;
  - *Start your agent*'s setup and prompt, from BP's Task 1 block.
- Nine tasks in six sittings. Sittings 1–3 run in mock mode on today's platform. The acceptance is Rich's click, beside BP's.

**Verdict: approve with the fixes below**, its own Minors and its share of X1–X7.

### What I re-checked, and how it reads

- **The contract holds at 1.8.0 and 1.9.0.**
  - 65 paths; 33 `GET`s a token may call, less the WebSocket.
  - `EventActor { name, asAdministrator, reason, token }`.
  - `Token` carries `rateLimit` and `lastUsedAt`, and `MintTokenRequest` its three fields.
  - `CommitSummary.madeThrough` carries no token id (FE-61).
- **Each event detail BF reads holds**, at `observability/event-schemas.ts`:
  - `repository.committed` has `tokenId` (885);
  - `app_secret.*` has `environmentKind` and `tokenId` (`AppSecretChange`, 162-171);
  - `pending_action.created` has `pendingActionId`, `tokenId`, `action`, `object` and `expiresAt` (438);
  - `instance.healthy` and `.failed` have `instanceId`, `releaseId` and `environment` (`InstanceDetail`, 173-180);
  - `agent_session.started` has `tokenId` (985).
- **The platform side holds.**
  - `TOUCH_INTERVAL_MS = 60_000` (`tokens/actor.ts:21`).
  - The stream does not filter event types for a token (`api/routes/events.ts`), so the keeper's watch hears `token.revoked`.
  - `listProjects` answers a token its one project (`docs/api/agents.md:7`).
- **The front end holds.**
  - `MINTABLE` is the eleven (`screens/agents/model.ts:16-28`), and `activeOf`, `Row`, `machineryIn` and `CopyButton` exist.
  - `launch-actions.test.ts:146-147` holds `mintToken` and `revokeToken` to the page.
  - F6b's *"nothing ticked"* is at its plan's l. 1533.
  - The store's `historyOf` is ordered by `at` then `rowid` (`store/keeping.ts:351-354`).
  - `StoppedWhy` is the three strings (`keeping/emails.ts:374`).
- **C3 holds in BF's words.** No sentence in the design's §11 or the plan's new words uses *MCP, server, endpoint, header, bearer,
  token, config* or *environment variable*. The only such strings are in mono copies, which Q1 allows.
- **The presets hold.**
  - *Build and try it out* is `project:read`, `source:write`, `build:create`, `release:create`, `release:deploy` and `output:read`.
  - *Only look at it* is `project:read` and `output:read`.
  - *Choose for yourself* is the eleven.
  - All of them are within `MINTABLE`, and none is one of D24's four. FE-32's `resolveDependencies` is `source:write`
    (`fe32:582`), so *Build* includes it, as BF expected.

### Findings

*Minor*

**BF-M1. An agent's build whose end the watch missed reads "working" for ever.**
- *Plan:* `:469-470`: *"building with `lastUsedAt` an hour ago → at work"*. D7.5 and §5c count a build *"with no end in history"* as
  at work.
- A gap in the watch is exactly the design's honest limit (§5a), so the chip and the line stay on.
- *Fix:* count `building` as at work only while the build is younger than the builder's bound, or re-read `getBuild` on the page for
  that one build. Add the case to `at-work.test.ts`.

**BF-M2. D7.3 dedupes a deploy per (release, place) for ever.**
- *Plan:* `:168-171`.
- A later deploy of the same release to the same place reads as no act: a rollback to it, or a restore. A1's replacement of an exited
  member carries no token (the platform's own act), so it is already left out.
- *Fix:* a new act when a different release was put in that place in between, keyed by `(releaseId, environment, run)`.

**BF-M3. The click's production step needs a launched app, and the plan names none of its prerequisites.**
- *Plan:* Task 9 Step 3 (`:699-707`: *"a launched app: `launch`"*), and design §0 step 3.
- A launch needs, among others:
  - the vulnerability database fresh within seven days, by `make refresh-vulndb`, Rich's, with the network on;
  - the launch path's records, rehearsal and approval.
- *Fix:* name them in Task 9 and in the sittings table's sitting 6, and pick the fixture (`make demo-launch`'s).

**BF-M4. The design's §6a still lists three fields of `token.revoked`** (design l. 294). BP's `c470221` and BF's plan (`:143`) carry
four, with `tokenName`.
- *Fix:* add a line under the design's §6a pointing to the plan. The design is approved, so annotate it; do not rewrite it.

**BF-M5. `READ_TOOLS` lets every read run unasked, personal data included.**
- Layer 2's rule, when Task 1 finds one, includes `listMembers` (with emails and PUIDs, BP-I9) and `getInstanceOutput`. That is the
  person's choice, and it is the flow P1 and P2 ask about.
- *Fix:* say so in one line of the plan's Review Focus. No product change.

---

## Cross-plan

*Important*

**X1. BP's Task 6 moves CWL and model know-how out of the one pack the front end's own building agent reads.**
- *BP:* Decision 15 (`:270-274`) and Task 6 Step 1 (`:1186-1188`). Each library rule in `AGENTS.md` keeps its heading and one sentence,
  and the detail moves to `toolkits/{cwl,models}/agents/*.md`. Plan:272 claims *"an agent reading only the blueprint's pack — the
  faculty front end's own — loses no rule"*.
- *Code:* manifest-app's building agent reads `getKnowledgePack` alone (`packages/server/src/platform/project.ts:38-64`, used by
  `agents/plan.ts` and `build/round.ts`). It would keep the rule's name and lose how to obey it, for example *Never write an origin into
  `auth.callback`* (`AGENTS.md:31`). That is the class of defect `ask-my-notes` found in October.
- BF's plan has no task that reads `Blueprint.toolkits`' packs.
- *Fix, recommended:* BF gains one small task: its lead reads each `Blueprint.toolkits` pack beside the blueprint's. It lands before
  BP's `AGENTS.md` change, and BP's Task 6 gates that change on it.
- *The alternative* is that BP's Task 6 adds the toolkits and their pointers but leaves `AGENTS.md`'s detail whole, copies held equal
  by a test. That departs from design §4's approved *"points to a toolkit for the rest"*.
- **Either fix touches an approved line, so it is the question for Rich below.**

**X2. Agent-driven runs of a real Claude Code write a Manifest token into Rich's own client configuration.**
- *BP:* `[M3]` (`:421-430`: `claude mcp add` in the default local scope, then `--scope project`; a probe token, harmless), and **Task
  8 Step 4** (`:1716-1720`: a real token for a fixture project, `claude mcp add … --header "Authorization: Bearer $MANIFEST_TOKEN"`,
  removed after).
- *BF:* Task 9 Step 3 (`:699-707`: *"the copied command run in a scratch shell and the copied prompt given to a real Claude Code"*).
- CLAUDE.md requires leaving the machine as found, and asking before touching anything outside the repository. The local scope writes
  `~/.claude.json`, Rich's own. `[M4]` already does this right, with a throwaway `CODEX_HOME`.
- *Fix:* every agent-run Claude Code uses a throwaway `CLAUDE_CONFIG_DIR` under the scratchpad, removed at the step's end, and
  `[M3]` records that the client honours it. Only Rich's own click (BP Task 10 Step 4, BF Task 9 Step 4) uses his configuration, by
  his hand.

**X3. The read-tool set must come from one list.**
- *BF:* `READ_TOOLS`' test (`:656-658`) derives the set from the document by *"BP's rule"*, hard-coding its single exception, *"less
  `streamProjectEvents`"*.
- *BP:* the exceptions grow with BP-I6, and `getOpenApiDocument` is a `GET`. BF's list would then offer a tool `/mcp` does not serve,
  and a rule naming it.
- BF cannot import `packages/mcp`, because its web boundary takes `@manifest/contract` alone.
- *Fix:* BP publishes the exceptions in the document. The `/mcp` entry of `x-manifest-alongside` gains `notTools: [{ operationId, why
  }]`. BP's gate and BF's test both derive the set as *"admits `delegatedToken`, not a WebSocket, not in `notTools`"*. Then a new
  exception moves both at once.

*Minor*

**X4. Task 1's block lacks two answers BF's design needs.**
- *BF design:* §3 (l. 184-186) keeps the key out of the app's folder, and out of the shell's history *"where the client allows"*.
  Codex's *"and this to your terminal's settings:"* (l. 167-169) would persist the key in a shell profile past the token's expiry.
- *BP:* Step 4a (`:435-438`) lists the command, the scope's storage, the CA, the read rule and the timeout, and nothing on history or
  which directory.
- *Fix:* Step 4a also records:
  - how each client's form keeps the key out of `~/.zsh_history`, or says it cannot;
  - which scope and which directory the person runs it in. Local scope is per directory, and an MCP-only agent has no app folder.
  - whether Codex's variable can be per-session rather than in a profile.

**X5. BF's sitting 4 waits on BP's sitting 7 for fixtures its Task 9 text does not list.**
- *BF:* `:52` and `:155` expect the mock to serve `Token.usage`, `revokedBy` and `token.revoked`.
- *BP:* Task 9's text (`:1739-1740`) names `Token.usage`, `rateLimit`, the toolkits and the code. Only the File Structure line
  (`:391`) mentions `token.revoked`, and nothing mentions `revokedBy`.
- With BP-I4 the fields arrive at sittings 2–4. *Fix:* Task 9 still scripts a `token.revoked` frame in the mock's stream for BF's
  mock-mode walk.

**X6. The contract chain is consistent in both plans.**
- A1 `1.9.0` landed at `163f42c`, B makes `1.10.0`, FE-32 `1.11.0`, and BYOA ~`1.12.0`. BP's Task 1 re-chains, and BF adopts at each
  Step 0.
- Two OTHER plans still state stale numbers:
  - **B's** says it takes `1.9.0` (`2026-10-03-load-rehearsal.md:58`, `:96`, `:199`, `:830`);
  - **FE-32's** says *"A2, before this one, leaves it `1.10.0`"* (`fe32:51`). Its own number is right, and its reason is not.
- These are lines for `manifest-coord3`, not for BP or BF.

**X7. "One click proves both plans" needs one window, named.**
- BF's §0 step 3, a production retry after an owner's yes, needs a launched app (BF-M3). BP's clicked half (Task 10 Step 4) launches
  nothing, and BP-I1 moves BP's headless privileged path to `addMember`.
- *Fix:* the shared window is BP's 8b with BF's sitting 6 (BP-M13). Its prerequisites are a launched fixture and a fresh vulnerability
  database, both named in each plan.

**Agreed, checked.**
- The event name and fields: `token.revoked { tokenId, tokenName, mintedBy, revokedBy }`, published by `revokeToken` alone. A
  removal's revokes and an archive's say so with their own events.
- `Token.usage: TokenUsage[]`, with `TokenUsage = { counts, used, allowed, resetsAt }` and `resetsAt` null when nothing is counted.
- `Token.revokedBy: uuid | null`, stamped by every revoke path.
- *"For the front end — word for word"*: its five items, corrected at BP's Task 8 Step 4. BF reads it at its sitting 5's Step 0.
- The sittings:

  | BF sitting | Waits for BP | |
  |---|---|---|
  | 1–3 | nothing | |
  | 4 | sittings 2, 3 and 7 | |
  | 5 | sittings 6 and 7 | `/mcp` served; the block corrected |
  | 6 | sitting 8's window | |

- `rateLimit` is never sent from the front end (BF D7.8), and its absence means 600 (BP D2).

## Safety, as asked

- **D24 is not widened by MCP.**
  - The server forwards only an `mft_` bearer (plan:1560-1575). It never reads or forwards a cookie, and never sends
    `Manifest-Admin-Reason`.
  - It holds no credential and calls the API through the edge, where a bearer request is judged by its token alone (`api/server.ts:
    304-341`).
  - Its tools are exactly what the document lets a token call (measured: 49 less the WebSocket). Privileged asks still become questions
    in the wrapper (`route.ts:358-381`), which is the API's, not the MCP server's.
- **The token can leak into:**
  - a tool result. Not as written, but `startAgentSession`'s model key can (BP-I6).
  - the client's config and transcript (BP-M11).
  - a commit. The new rule catches it; the 53 repositories show no false positive.
  - a log. The operator line names no header (plan:1586-1587).
- **Origin and DNS rebinding.**
  - A browser sends `Origin` on every `POST`, so refusing any `Origin` with `403` and every non-`POST` with `405` covers a rebinding
    page. It is MCP's own advice, and the page has no bearer anyway.
  - Optionally, also check `Host` against the two origins and `127.0.0.1:7113`.
- **The quotas cannot be bypassed** by:
  - a replay, which is answered before `run` (`route.ts:352`);
  - a person, who is never counted;
  - a new token, because minting is session-only;
  - a push, because the agent holds no git credential.
- **Writes the quotas do not count, and why each is bounded:**
  - `setAppSecret` redeploys nothing (its description, `secrets.ts:222`).
  - `requestApproval` emails the team once per release serving staging (`releases.ts:998`), so its emails are bounded by the deploy
    quota.
  - The drafts are computed, not modelled.
- **FE-11 (b)'s authorization** is right in substance: the minter always, then `members:manage` (owner or administrator), with no
  step-up. The gaps are BP-I5 (§26's declared reason and the 24-list) and BP-M3 (the stranger's message).

## Questions for Rich

1. **X1. Where the CWL and model know-how lives once toolkits exist.**
   - **(a) Recommended:** F7 gains one small task — the front end's building agent reads each `Blueprint.toolkits` pack beside the
     blueprint's — and BP's `AGENTS.md` change waits for it. This widens F7's approved scope by one task.
   - **(b)** BP leaves `AGENTS.md` whole and the toolkit packs carry the same text, held equal by a test. This departs from design §4's
     *"points to a toolkit for the rest"*.
   - **(c)** As written. The front end's agent loses the detail until someone notices.

**Named for Rich at approval, not asked:**
- D14: the wait is resumable, where the design said ten minutes.
- BP-I6: two operations are not tools.
- D2: the bound is the constant 600.
- D9: `x-manifest-alongside`.
- Each is sound, as argued above.
