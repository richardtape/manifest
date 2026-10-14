# Bring your own agent, on the laptop — the platform's design (BP)

> **DRAFT, SECTION BY SECTION FOR RICH — written 2026-10-13 from 20:24 PDT by `manifest-byoa-plan`** (job BP of the BYOA planning run,
> coordinated by `manifest-byoa-coord`; brief: `manifest-app/docs/plans/2026-10-13-byoa-planning.md`, approved as written). **Rich's
> decisions it rests on**: [`../2026-09-30-decisions.md`](../2026-09-30-decisions.md), *"Rich's decisions — 2026-10-13, 20:15 PDT (session
> manifest-byoa-coord, the BYOA planning run)"* (`0b17f87`) — the split out of Phase 3 and its place after FE-32 (answer 2), the front end's
> whole half after this design (answer 3), and the policy brief folded into the plan (answer 4). **Every fact below was read from the code at
> `0b17f87`** while A1 was changing `runtime/` and `routing/` beside it; the plan's Task 1 re-reads each one.
>
> **This is a design, not the approved spec.** It never goes in `specs/`. What it would change in the spec is drafted as Spec actions in the
> plan ([`2026-10-13-byoa-on-the-laptop.md`](./2026-10-13-byoa-on-the-laptop.md)) and applied only at Rich's word, after this run.
>
> **Each section carries its status.** Rich approves them through `manifest-byoa-coord`; his words are recorded in the decisions file and
> cited here. *What is asked of Rich* (the end) lists every open question with its options and a recommendation.

| § | Section | Status |
|---|---|---|
| 0 | What this is for | PROPOSED |
| 1 | The shape: three ways to give an agent Manifest as tools | PROPOSED — **question 1** |
| 2 | The MCP server | PROPOSED (follows 1) |
| 3 | Token controls | PROPOSED — **question 2** (FE-11 (b), re-asked) |
| 4 | Toolkits (FE-19) | PROPOSED — **question 3** |
| 5 | What else the design found | PROPOSED — **question 4** (model keys); the rest decided here, for review |
| 6 | The policy section the plan carries | PROPOSED — its questions are UBC's and Rich's to answer later; none blocks the plan |
| 7 | Phase 5: the decisive gap, recorded and not planned | PROPOSED |
| 8 | Placement, spec actions, contract, proof | PROPOSED |

---

## 0. What this is for

**The outcome** (the brief's Goal, Rich's approval at answer 1): *a faculty member points their own coding agent — Claude Code, Codex, any
MCP-capable agent — at their Manifest app and builds with it, safely*, **on the laptop**. The spec has intended this since §1 (*"one way in,
not the only way … including someone's own coding agent running on their own machine … they need git plus an API"*) and D24 (*"what makes
'bring your own agent' (§1) safe rather than a hole"*).

**Most of it works today** (the brief's survey, re-checked): a person mints a delegated token on the front end's *Agents* screen; an agent
holding it drives the whole build loop over HTTP from the served guides (`docs/api/agents.md`, `make demo-authoring`); D24's privileged four
come back as a question a named owner answers; person-only actions are refused. **What is missing is what an agent the platform did not write
needs to use that safely and easily** — Manifest as native tools, the know-how it cannot get from a blueprint, and the controls a person needs
over code nobody at Manifest wrote.

**Done means**, for this plan:
1. An agent connects to Manifest by MCP with **one address and one header**, and builds, deploys to staging and reads the result of an app
   **through MCP alone** — no shell, no `curl`, and **the token never in its model's context**.
2. It learns how **from the platform**: the agents guide, the blueprint's knowledge pack and each toolkit's (FE-19), served over the API.
3. **Nothing widens.** D24 refuses what it refuses today; a question still reaches a person; the MCP server can do nothing the token cannot
   do over HTTP.
4. **A person bounds it**: a rate set at mint, a daily quota on what every app on the machine shares, and — if Rich says so (question 2) — an
   owner stops a collaborator's agent without removing the colleague.
5. **Proved twice**: headlessly (an MCP client builds an app on a token, `make demo-byoa`), and **clicked by Rich with a real Claude Code**.

**What Rich said** (decisions entry, `0b17f87`): the plan comes out of Phase 3 and goes between FE-32 and Phase 3; it holds the MCP server,
FE-19, token controls (a rate at mint, §20's quotas, FE-11 (b) re-asked) and whatever the design finds; the policy brief is a section of the
plan; Phase 5 is recorded as the decisive gap and planned not at all. **What this design assumes** (correct any): the agent runs on the same
laptop as the platform; the person is faculty (FE-39, unchanged); the agent thinks with its own provider unless question 4 is answered
otherwise; every word a faculty member reads is BF's, and C3 holds there.

---

## 1. The shape: three ways to give an agent Manifest as tools

§22 (spec ll. 2461–2473): *"`mcp/` is a thin MCP server over the published API, so any MCP-capable agent gets Manifest as native tools and
the knowledge pack (D25) as MCP resources … it may use nothing but `contract/`."* Three ways to build that:

**A. Served by the platform, over HTTP, at `/mcp` beside `/v1` — RECOMMENDED.** A separate process (`packages/mcp`, importing only
`@manifest/contract` from this repository), speaking MCP's Streamable HTTP transport, reached through the edge at `/mcp` on the same origins
as the API (`app.manifest.internal`, `console.manifest.internal`). The agent's whole configuration is a URL and an `Authorization` header —
for Claude Code `claude mcp add --transport http manifest https://app.manifest.internal/mcp --header "Authorization: Bearer $MANIFEST_TOKEN"`,
for Codex a `[mcp_servers.manifest]` table with `url` and `bearer_token_env_var` (both to be measured at Task 1; BF writes the words).
- *For:* nothing to install on the person's machine; **the token lives in the agent's tool configuration and travels in a header, never in
  the model's context** — over `curl` the model reads the token and can echo it into a log or a commit; one address that moves with the API
  in Phase 5; the third independent client over one contract (§22's *"much stronger evidence that the API is genuinely client-agnostic"*).
- *Against:* one more host process on the laptop (like the console's on 7104); the agent's process must trust the laptop's CA — which it
  must already to reach `/v1` (§5.4).

**B. A local stdio server the agent runs** (`npx @manifest/mcp`).
- *For:* every MCP client speaks stdio; no edge change.
- *Against:* it has to reach the person's machine — **publishing a package** (outward-facing, permanent per version, and Phase 5's question,
  not the laptop's) or a path into this repository (which only Rich has); a copy per machine that drifts from the platform's contract; the
  token in the environment of a process the agent spawns.

**C. Inside the control plane, as routes.** Rejected: §22 makes it *"a thin MCP server over the published API"* using *"nothing but
`contract/`"*; a server inside the control plane can reach around the API, and the evidence of an independent client is lost.

**Cost of changing course:** A → B later is a second transport on the same server object (the SDK ships both) and a way to distribute it;
no tool changes. **Question 1** asks Rich to approve A.

---

## 2. The MCP server

*Follows §1's A. Every choice here is this design's; the plan's Decisions section records each with what it rejects.*

**Where it runs.**
- `packages/mcp`: TypeScript on Node 24, the MCP project's TypeScript SDK (`@modelcontextprotocol/sdk`, **pinned at Task 1 to its current
  release**, recorded with the reason — no evidence yet argues for an older one), and `@manifest/contract`. **An import boundary like the
  console's** (D22): a lint rule and a test refuse any import from `packages/control-plane`.
- A **host process on a free port in 7100–7199** (Task 1 measures which; 7101 and 7113 are unassigned in `infra/lib/common.sh:75-95` today),
  started the way the control plane is (RUNBOOK). `make doctor` asks it who it is by a marker, as it asks 7105; nothing listening is a `502`
  that doctor reports and tolerates, exactly as it tolerates 7104's.
- **The edge**: one matcher, `@mcp path /mcp`, in the `console.` and `app.` sites (`infra/caddy/Caddyfile:51`, `:124`), beside `@api` and
  inside `route`, with the same `@outside` guard. No new hostname, reserved label, dnsmasq pin or certificate.
- **`/mcp` joins the contract's unversioned endpoints** (`api/unversioned.ts`, served as `x-manifest-unversioned`), so the contract says it
  exists rather than omitting it (D23.8). Its version is MCP's own protocol negotiation.
- **It calls the API through the edge**, at the origin it was reached on, exactly as an outside client does — never 7100 directly
  (*"integration is where the false greens sit"*).

**Transport and credential.**
- **Streamable HTTP, stateless**: no MCP session id, no resumption store; every `POST /mcp` carries its own bearer. A `GET` (a
  server-initiated stream) is answered `405` — the server initiates nothing.
- **The bearer must be a delegated token** (`mft_…`). It is forwarded, unchanged, on each API call that one request makes; it is **never
  stored, never logged and never put in a tool's result**. A session cookie is ignored and never forwarded (D24: MCP is a token holder, §20's
  table). No bearer → `401` with `WWW-Authenticate: Bearer`, and no API call is made.
- **It holds no credential of its own.** Whatever it does, the API answers it as the token, under the token's capabilities, D24's central
  refusal, the per-token rate and the quotas (§3).
- **A request carrying an `Origin` header is refused `403`**: no browser is its client, and the MCP specification asks a server to defend
  against DNS rebinding this way.
- **MCP's own OAuth flow is not built** (the person signing in from their agent and consenting, instead of pasting a token): it would make
  Manifest an OAuth authorization server over CWL. Named for Phase 5, where the copy-paste costs most.

**Tools.**
- **One tool per operation a delegated token may call, generated from the contract's OpenAPI document** — its name the `operationId` as the
  guides already use it (`getTree`, `createCommit`, `startBuild` …), so an agent reading *agents.md* finds the tool it names; its input the
  operation's path, query and body schemas; its description the operation's summary and description, already written for agents.
- **A coverage gate, like the console's** (`packages/console/src/coverage.test.ts`): every one of the document's operations (76 at
  `0b17f87`) is either a tool or on a `NOT_TOOLS` list with its reason — a session-only operation (`mintToken`, `createProject`, `getMe`,
  `approveRelease`, `runRehearsal` …). A new operation fails the gate until it is placed.
- **Annotations from the method**, so a client's permission presets can allow reads and ask before writes (BF's *preset permissions*):
  `GET` → `readOnlyHint`; `DELETE` → `destructiveHint`; every mutation `idempotentHint` (D23.6).
- **An `Idempotency-Key` on every mutation**: the tool's input takes an optional `idempotencyKey`; absent, the server makes one. The tool's
  description says to send the same key to retry safely, which is the guides' rule.
- **Two composite tools, the only ones that are not one operation each**, because each is something an agent otherwise does with a loop and
  a socket it cannot hold: **`waitForBuild`** (the project's event stream, through the contract's own `stream.ts`, until that build's
  `build.succeeded` or `build.failed`, bounded at ten minutes; answers the build and its last log lines) and **`waitForPerson`** (reads
  `getPendingAction` until it is not `pending`, bounded).
- **A refusal is a tool error** (`isError: true`) whose text is the envelope's `code`, `message` and `hint`, and whose structured content is
  the envelope — with `pendingAction` on `TOKEN_ACTION_PENDING`, so the agent tells its person what it asked and calls `waitForPerson`.
- **Bounded**: a generated tool makes one API call; the composites make a bounded number.

**Resources and instructions.**
- **Resources**: the served guides (`manifest://docs/{slug}`), each blueprint's knowledge-pack files and each toolkit's (§4), and the OpenAPI
  document — each read through the API with the caller's token. Some clients surface resources poorly, so the same content is reachable as
  tools too (`getDoc`, `getKnowledgePack`, `getToolkitKnowledgePack` are generated anyway).
- **The initialize answer's `instructions`**: a few lines — read the `agents` guide first, then the project's blueprint's knowledge pack;
  switch on `code`; some things wait for a person. Their words are in the plan, for Rich's review; **the prompt a person pastes is BF's**.
- **Not built**: MCP prompts (the paste prompt is BF's), sampling, elicitation, server-initiated notifications.

**The address.** The agents guide says the MCP endpoint is **`/mcp` on the origin the API is on**; the front end shows its own origin's.
No new operation: an operation answering a constant the client already knows is a view-shaped read (D23.1).

**Tests.** The package's unit tests run **against `manifest-mock`**, which serves the whole contract from fixtures with no platform (§21) —
every generated tool's mapping, the composites, the refusals, the boundary, the `Origin` and no-bearer refusals, and the token in no output.
The acceptance (§8) drives the real platform through the edge.

---

## 3. Token controls

§20 (spec ll. 2052–2055): *"Delegated tokens carry **per-token rate limits and quotas** … because a third-party agent is code the platform
did not write, running on a machine it does not control."* Today: the rate is the column default `delegated_tokens.rate_limit = 600`
(`db/schema.ts:481`), a fixed window per minute in memory (`api/rate-limit.ts`, taken at `api/server.ts:341`); `MintTokenRequest` takes
only `name`, `capabilities` and `expiresInDays` (`api/representations/tokens.ts:103-130`); no quota exists; only the minter revokes
(`api/routes/tokens.ts:347-351`).

**3a. A rate set at mint.** `MintTokenRequest` gains an optional `rateLimit` — requests a minute, `1 ≤ n ≤` the platform's maximum
(`MANIFEST_TOKEN_RATE_LIMIT_MAX`, default 600, so no existing token or client changes); absent, the maximum. Stored in the column that
exists, enforced where it is. **A token's rate is fixed for its life** — no change operation; a person mints another. `429 RATE_LIMITED`
gains §20's limit facts (*"whose it is, over what period, how much, and when it lifts"*): `limit: { scope: 'token', period: 'minute',
count, resetsAt }` — `Limit` gains `token` and `minute` (`api/representations/errors.ts:15-44`). The window stays in memory: a restart
forgets at most a minute.

**3b. Per-token daily quotas** — on what every app on the machine shares, and on nothing else:

| Counted | Why it is shared |
|---|---|
| builds started (`startBuild`) | one builder and one registry serve every app |
| deploys (`deploy`, any environment a token reaches) | every route change reloads the edge's **whole** configuration, which can reset about one request in 300 for **every** app and closes their proxied WebSockets (ORIENTATION §3, P4c R1) |
| commits (`createCommit`, not dry runs) | on driver 2 each is GitHub API calls on the **one** App installation every project shares |
| dependency resolutions (FE-32's `resolveDependencies`) | a builder run and registry fetches each |

- **Not counted**: reads (the rate covers them); model sessions (bounded in money already — a session's cap and the person's month, §10);
  questions to a person (one open question per request, by the database).
- **Counted from the platform's own record** — the events that carry `actor_token_id` (`db/schema.ts:1280`) — over a rolling 24 hours, so
  a restart forgets nothing and no counter table exists.
- **Platform settings, one per counted action, not set at mint** (a later field if a person ever needs it). **Starting values proposed: 100
  builds, 100 deploys, 500 commits and 50 resolutions a day** — generous for an agent iterating all day, and a loop at one a minute stops
  inside two hours rather than running all night. Task 1 measures a day's worth from the demos and the plan sets them from that.
- **The refusal**: `429 TOKEN_QUOTA_EXHAUSTED`, `limit: { scope: 'token', period: 'day', count, resetsAt }` and which quota — `resetsAt`
  when the oldest counted action leaves the window. A person's own session is never counted (§20 scopes this to tokens).
- **Readable**: `Token` gains today's counts beside its quotas, so a front end can show what a person's agent has done today.

**3c. An owner stops a collaborator's agent — FE-11 (b), RE-ASKED (question 2).** Rich chose (a) on 2026-09-29: removing a member revokes
every token they minted on the project (built, the launch path plan's Task 8). (b) — *an owner may revoke any token on their project* — was
declined then. **The new reason**: an outside agent is code nobody at Manifest wrote, on a machine nobody at Manifest controls. When a
colleague's agent misbehaves on an owner's app — at night, committing and deploying to staging — the owner's only stop today is taking the
colleague off the app.
- **(b) An owner, or a platform administrator, may revoke any token on the project.** `Token.mintedBy` already names its minter (built
  since FE-11 was written, `api/representations/tokens.ts:24`). Code: `revokeToken`'s check widens from *the minter* to *the minter, an owner,
  or an administrator* (§26's reason when the administrator is no member); the same transaction ends its questions and sessions and closes
  its streams; the event names who revoked whose. *Closes:* one agent stopped, the colleague kept. *Leaves open:* nothing new.
- **(a) Keep the decision of 2026-09-29.** *Closes:* nothing new.
- **(c) An owner may pause a token** — rejected here: a state and its undo, for what revoke-and-mint-another already does.
- **Recommended: (b).**

---

## 4. Toolkits (FE-19)

FE-19 (`manifest-app/docs/api-findings.md:472`): D25 serves one knowledge pack per **blueprint**; the know-how for each UBC integration a
faculty app uses (Rich, 2026-09-27: *"just like we have a toolkit/library for CWL integration, we have quite a few other toolkits"*) has
no home in the API. **A bring-your-own agent needs the same knowledge, and it must match what the platform lets an app declare** — D25's
argument, on a second axis. Option (a) of FE-19, which the front end recommended:

- **A toolkit catalogue beside blueprints**: `toolkits/<name>/toolkit.yaml` — its name and major (pinned as blueprints are, §25), a summary,
  **the packages it is** (each on FE-32's allowlist — a test holds every toolkit's packages to it), **the blueprints it works with**, **what
  an app declares to use it** (in today's `manifest.yaml` fields: services, egress, secrets, auth attributes, `ai`), and `agents/*.md`, its
  knowledge pack. Loaded at boot beside the blueprints; a malformed one refuses the boot, as a blueprint's does.
- **Three reads**: `listToolkits`, `getToolkit`, `getToolkitKnowledgePack` (each file with its sha256, as `getKnowledgePack`). Any
  credential may read them.
- **No new `manifest.yaml` field**: a toolkit is packages and declarations the platform already validates. That keeps §7 unchanged.
- **The blueprint's pack keeps what is its skeleton's own** and points to a toolkit for the rest.

**Which toolkits first — question 3:**
- **(1) The catalogue, with the two toolkits `node-ts-mongo@1` already wires — CWL sign-in (`passport-ubcshib`) and models
  (`ubc-genai-toolkit-llm`, through the skeleton's `ai/llm.js`)** — their know-how served as toolkits. **Recommended**: the catalogue is real,
  tested and served, and every later integration — RAG over Qdrant (FE-21), Canvas and the academic API (FE-20) — lands as a toolkit rather
  than as a blueprint's edit. *Costs:* nothing an app could not do before.
- **(2) (1), and one toolkit an app could not use before** — the genai toolkit's document parsing or chunking (libraries, no new service),
  put on FE-32's allowlist with its pack. *Gains:* the first know-how a BYO agent has that no blueprint carries. *Costs:* its dependency tree
  through the allowlist, the mirror and the scan; a pack written and proved by the acceptance; a task more.
- **(3) The machinery only**, empty until an integration needs it. *Costs:* a catalogue nobody reads, proved by nothing real.

---

## 5. What else the design found

**5.1 Manifest's own credentials are not in its secret scanner — decided here: add them.** The token's prefix was chosen *"so a leaked
credential is recognisable in a log, a paste or a scanner"* (`tokens/token.ts:3-6`), but `SECRET_PATTERNS` (`build/secret-patterns.ts:22-58`)
has no rule for `mft_…`, nor for a model key (`sk-…`). An outside agent's MCP configuration — a `.mcp.json` carrying the header — committed
through `createCommit` would be stored, and on driver 2 pushed to GitHub. Two rules join the list (the scan at commit, push and build reads
it); the knowledge pack and the agents guide say never to commit an agent's configuration. *Rejected:* a rule for `mft_` only — an agent's
model key is the same leak.

**5.2 What an outside agent thinks with — question 4.** A Manifest model key reaches three routes (`ai/keys.ts:22-26`: chat completions,
embeddings, models). **Claude Code speaks Anthropic's Messages API (`/v1/messages`) and Codex OpenAI's Responses API (`/v1/responses`)**, so
neither can do its own thinking on a Manifest key today (inferred from each tool's documented configuration, not measured); an agent that
speaks chat completions can (opencode, aider, Cline …: a model key from the *Agents* screen at `http://127.0.0.1:7106/v1`,
`api/routes/agents.ts:233,260`).
- **(a) Unchanged in this plan, and (b) measured at Task 1 — RECOMMENDED.** The outside agent thinks with its own provider; the policy
  section asks UBC whether that is allowed (§6, question P1). Task 1 measures whether Claude Code can think on a Manifest key over LiteLLM
  1.102.0's `/v1/messages` (one call through the gateway, a fraction of a cent), so the platform is ready the day the Privacy Office says
  only attested providers may see UBC code.
- **(b) Agent-session keys gain `/v1/messages`** in this plan, so Claude Code thinks on UBC's gateway or on-premise and the code reaches
  only providers the platform attests. *Costs:* unmeasured — LiteLLM's translation to `gpt-6-luna` and the on-premise model under Claude
  Code's tool use, and how well Claude Code works on a model that is not Claude.
- **(c) (b), and `/v1/responses` for Codex.** **Rich's Phase 3 rule binds** (decisions file, 2026-10-03 20:52; roadmap ll. 1789–1795): the
  plan forces `store: false` or refuses `GET /v1/responses/{id}` and `…/input_items`, with a test that one key cannot read another's answer.

**5.3 `@manifest/contract` stays private — decided here.** It is `"private": true` (`packages/contract/package.json`). An MCP agent needs
no client; any other agent drives HTTP from the served OpenAPI document and guides (`/v1/openapi.json`, `/v1/docs`). Publishing to npm is
outward-facing and permanent per version, and belongs with Phase 5's reach. **But the guides' examples import it** (`docs/api/agents.md`),
which an outsider cannot install: the guides gain one sentence saying the examples use Manifest's own client and the same requests go over
HTTP. *Cost of changing course:* publish it later; nothing here depends on it staying private.

**5.4 Reaching the platform from the agent's process.** `*.manifest.internal` resolves through the macOS resolver to the laptop's dnsmasq,
and its certificates are signed by the laptop's CA (`infra/ca/manifest-root.crt`), which `make seed` asks a developer to give Node with
`NODE_EXTRA_CA_CERTS` (`infra/seed/seed.sh:121`) — every demo does (`scripts/demo-authoring.sh:85`). A Node-based agent needs the same;
Codex's need is unmeasured. **Task 1 measures each agent reaching `/v1` and `/mcp`**, and the guide says the one setting. A §21 honest
divergence: Phase 5's certificate is public.

**5.5 The credential and the stream on revoke already behave.** A revoked or expired token is `401` on its next call, its open stream
closes `4401` (FE-33, the launch path plan's Task 5), and its questions end in the same transaction (FE-52). The MCP server inherits all of
it by forwarding the token; the acceptance shows it through `/mcp`.

---

## 6. The policy section the plan carries (Rich's answer 4: *"Fold it into BP's plan"*)

The plan has a section, written for Rich to carry to UBC's Privacy Office, in two parts. **Nothing in it blocks the plan**: on the laptop
every person is a test user and every app a fixture.

**What an outside agent's provider would see** — everything a delegated token can read is context the agent sends to whatever model it
thinks with, under that provider's terms (a personal subscription's may allow training; an enterprise one may keep nothing):
- the app's code, `manifest.yaml` and history, **commit authors' names** (`CommitSummary.authorName`, `madeThrough.name`);
- **the project's people** — names and CWL logins (`listMembers`), and the names in events' sentences and questions' objects;
- build logs; a sandbox instance's output, redacted (test users' input); Incidents — the sandbox's always, staging's and production's only on
  a `low` or `medium` project (`high` and `very-high` are refused to a token, the U1 plan);
- **never** a secret's value (write-only), and never staging's or production's output.

**The questions only Rich or UBC can answer** (the brief's *Policy* paragraph, each with what the platform could do once answered):
- **P1. May a faculty member point a commercial agent** (Claude Code → Anthropic, Codex → OpenAI, on a personal or an enterprise plan) at a
  UBC app's code, and does the platform's PIA name it? *If not, or only for some levels:* question 4's (b)/(c) — the agent thinks on
  attested providers — or a project's level bounds whether a token may be minted for an outside agent. The platform cannot see which provider
  an agent uses (S9: *"a token's model is unattested"*).
- **P2. ZDR, widened** (ORIENTATION §8 *Open*): the platform's own `high` routing rests on a provider keeping nothing; an outside agent's
  provider is attested by nobody.
- **P3. Who brings an agent** — only faculty build (FE-39, *"for now"*); §1 imagines *"research groups with one graduate student who
  codes"*. A TA's or a graduate student's own agent waits on that answer.
- **P4. FE-24**: whether a token should still deploy to staging and set staging's secrets once staging signs real people in (UBC's staging
  IdP) — moot on the laptop, live at Phase 5.
- **P5. A person's name reaching GitHub** (ORIENTATION §8 *Open*): an outside agent's commits go through the API as its person, so the same
  flow.

---

## 7. Phase 5: the decisive gap, recorded and not planned

BYOA beyond Rich's laptop needs Manifest **reachable from a faculty member's own machine**: UBC's hosting decision (RHEL 9 VMs or
Kubernetes, §19), Manifest's own IAM registration and the platform's PIA (the external track, deferred by Rich on 2026-09-30), a public
certificate (§5.4's divergence ends), and — where pasting a token costs most — MCP's OAuth flow over CWL (§2). **This plan builds none of
it**, and its acceptance says so: every agent in it runs on the laptop.

---

## 8. Placement, spec actions, contract, proof

- **Place** (Rich's answer 2): **A1 → B → FE-32 → BYOA on the laptop → Phase 3 → A2 …**. **FE-32 is a prerequisite**: its allowlist stops
  an outside agent committing any lockfile, and `resolveDependencies` becomes a tool.
- **Contract**: the next minor after FE-32's — expected `1.12.0` (A1 `1.9.0`, B `1.10.0`, FE-32 `1.11.0`), re-chained at Task 1.
- **Spec actions, DRAFTED in the plan and applied only at Rich's word**:
  - **A. §17** — Phase 3's row loses *"the MCP server (§22), making 'bring your own agent' real"* (l. 1904); a row **2b — Bring your own
    agent** goes between 2 and 3, as 1b+ was placed (2026-09-14). §5's `mcp/` line (l. 305) says *Phase 2b*.
  - **B. §22** — *"It lands in Phase 3, when sandboxes make the agent story real"* (**l. 2472**, not 2471 as the brief has it) becomes *it
    lands before sandboxes: an agent on its person's own machine needs no sandbox (§1)*, served at `/mcp` beside `/v1`, bearer only.
  - **C. §20** — the quotas made concrete (what is counted, over what, the refusal); the rate set at mint within the platform's maximum;
    and, if question 2 is (b), who may revoke a token.
  - **D. D25 and §25** — toolkits, a catalogue beside blueprints, each with a pack versioned with it (FE-19).
  - **E. §21** — the MCP server in the inventory, and the laptop divergence of §5.4.
  - **F.** only if question 4 is (b) or (c): §10's three routes widened, with the Phase 3 rule for `/v1/responses`.
- **Proof — `make demo-byoa`, either driver.** A scripted MCP client (the SDK's client over Streamable HTTP; no model) on a token minted
  for it: connects at `/mcp` on `app.`; lists tools and reads the agents guide and the pack as resources; builds the bulletin board through
  tools alone (dry run, commit, build, `waitForBuild`, release, deploy to staging, the sandbox's output); adds a dependency
  (`resolveDependencies`); asks for production and is answered a question, which a person confirms, and the retry goes through once; is
  refused by the rate at mint and by a quota, each with its fields; has its `.mcp.json` refused `SOURCE_SECRET_DETECTED`; (if (b)) is
  revoked by the owner, its next call `401` and its stream `4401`. The MCP server refuses a cookie-only request and an `Origin` header, and
  the token is in none of its output. Each control is broken once and seen red.
- **And clicked by Rich**: a real Claude Code (and Codex, if Task 1 finds it connects), configured from the front end's *Agents* screen,
  asked to build a small app — watched in the front end.
- **Not built**: MCP's OAuth; stdio; MCP prompts, sampling and elicitation; quotas set at mint; per-person quotas; a CLI; publishing the
  contract; sandboxes; anything of Phase 5.

---

## What is asked of Rich

1. **The shape (§1)**: an MCP server served by the platform at `/mcp` beside `/v1` (recommended) / a local stdio package / inside the
   control plane.
2. **FE-11 (b), re-asked (§3c)**: an owner or administrator may revoke any token on the project (recommended) / keep 2026-09-29's decision
   (removing the person is the stop).
3. **The first toolkits (§4)**: the catalogue with CWL and models (recommended) / and one new library toolkit / the machinery only.
4. **What an outside agent thinks with (§5.2)**: unchanged, with `/v1/messages` measured at Task 1 (recommended) / agent keys gain
   `/v1/messages` now / and `/v1/responses` under the Phase 3 rule.

And, for approval as written: §2 (the MCP server's details), §3a–b (the rate and the quotas, their starting values), §5.1, 5.3–5.5 (decided
here), §6 (the policy section's contents), §7 and §8.
