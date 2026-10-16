# Bring Your Own Agent, on the Laptop — Implementation Plan

> **⚠ NOTE, 2026-10-16 ~15:58 PDT (`manifest-p11b-plan`, at `manifest-coord6`'s ask) — 7113 IS HELD BY P11's ADMIN MOCK UNTIL P11b's
> PORT MOVE LANDS.** This plan's fact 15 (*"7113 is unassigned"*) and Decision 18 (the MCP server on 7113) were true when it was approved;
> **P11, written the next day, took 7113 for the administrator's console's own mock** (P11's Decision 14): `scripts/admin-ui.sh:19`,
> `scripts/demo-admin.sh:27` and `scripts/doctor.sh:218` (`PORT_ADMIN_MOCK=7113`), and `packages/admin-ui/vite.config.ts:21`'s default —
> so **whenever `make admin-ui` or `make demo-admin` (`make ci-acceptance`'s step 13) runs, nothing else can bind 7113**. **P11b**
> ([`2026-10-16-p11b-admin-console-edge.md`](./2026-10-16-p11b-admin-console-edge.md), its Task 2 and Decision 3) moves the demo pair to
> **7114 (mock) and 7115 (console)** and leaves 7113 to this plan. **If this plan's sitting 1 comes first**, its Task 1 makes that move
> itself — those four files, with `make demo-admin` green on the new ports — or picks another port for the MCP server and changes every
> mention here; either way it is recorded in the sitting's record, and P11b's Task 1 re-reads which happened. **And this plan's Task 8
> edge change** (`@mcp` in both sites, between `@api` and the catch-all): once P11b lands, the console's site also carries P11b's five-line
> `/admin` run (`redir /admin /admin/ 308`, `@admin path /admin/*` and its `reverse_proxy` to 7101), which `make verify`'s parity check
> strips by name — so the `@mcp` lines stay identical in both sites and outside that run (P11b's review, M11; added 2026-10-16 ~16:50).

> **✅ APPROVED BY RICH, 2026-10-13, ~21:50 PDT, AS REVISED (`7493be1`)** — *"Approve; inline per sitting (Recommended)"*, with every
> departure from the design named to him and approved (D2, D9, D10's three non-tools, D14, D19, D20, D21, 7113, the `initialize` check, the
> journey boundary): [`../2026-09-30-decisions.md`](../2026-09-30-decisions.md), *"Rich's decisions — 2026-10-13, 21:50 PDT (session
> manifest-byoa-coord, the BYOA planning run: both plans approved)"*, `2b3dd6d`. **Runs inline with superpowers:executing-plans, ONE FRESH
> SESSION PER SITTING**, as A1 and FE-46/47/5 ran. **QUEUED AFTER FE-32, BEFORE PHASE 3** (`0b17f87`, answer 2) — **NOTHING OF IT IS
> EXECUTING NOW**: its sittings table starts at sitting 1 when the roadmap reaches it, and Task 1 re-reads every fact then. The front end's F7
> plan runs beside it (its sittings 4–7 follow this plan's 4, 2–4, 6–7 and 8b).

> **WRITTEN 2026-10-13, FROM 20:38 PDT, BY `manifest-byoa-plan`** (job BP of the BYOA planning run, coordinated by `manifest-byoa-coord`,
> beside `manifest-coord3`'s second coordinated run), from **the design Rich APPROVED WHOLE at ~20:31 PDT**:
> [`2026-10-13-byoa-on-the-laptop-design.md`](./2026-10-13-byoa-on-the-laptop-design.md) (`e5a0c08`; his words in
> [`../2026-09-30-decisions.md`](../2026-09-30-decisions.md), *"Rich's decisions — 2026-10-13, 20:31 PDT (session manifest-byoa-coord, the BYOA
> planning run: BP's design)"*, `c5df7db`). **Every fact in *Read this first* was read from the code at `0b17f87`–`29b9724`**, while A1 was
> changing `runtime/` and `routing/` beside it. **Three plans run before this one** (the rest of A1, B, FE-32), so **Task 1 re-reads every
> fact** into `spikes/byoa-baseline/`.
>
>
> **REVISED 2026-10-13, FROM 21:35 PDT, TO A FRESH REVIEW** ([`2026-10-13-review-of-byoa-plans.md`](./2026-10-13-review-of-byoa-plans.md),
> `1fa72d6`, by `manifest-byoa-review`; verdict *approve with the fixes* — 10 Important, 13 Minor, and cross-plan X1–X7) **and to Rich's answer
> to its one question** (X1 (a), *"F7 gains a task"*, ~21:32 PDT, `327ca2f`). **Every finding, and where it went, is in *What the review
> found, and where it went*** (near the end). The cross-plan agreements (X1, X3, X5, X7) were made with BF (`manifest-app-byoa-plan`)
> directly. **Approved at ~21:50 PDT (above).** **Five spec actions are DRAFTED at the end, none applied** — each at its sitting, its shared
> pages swept with it.

> **For agentic workers:** REQUIRED SUB-SKILL: **superpowers:executing-plans, inline, one fresh session per sitting** (Rich, 2026-10-13,
> `2b3dd6d`). Steps use checkbox (`- [ ]`) syntax for tracking. **Commit on `main`; no branch, no worktree, no push** — ORIENTATION §6
> rule 9.

**Goal:** **An agent the platform did not write — Claude Code, Codex, any MCP-capable agent, running on the laptop — connects to Manifest
with one address and one header and builds an app through MCP alone, safely** — its token never put in its model's context by Manifest
(BP-M11: the client keeps it in its own configuration, which the agent must not read): it learns how from the platform (the agents guide, the
blueprint's knowledge pack, and each toolkit's); it can do nothing its delegated token cannot already do over HTTP; and a person bounds it — a
rate set at mint, a daily quota on what every app on the machine shares, and an owner or administrator able to revoke any token on their
project.

It is proved by **`make demo-byoa`** — a scripted MCP client, holding a delegated token, builds the bulletin board through `/mcp` alone,
is asked, refused and revoked where the platform says — on either driver; and **by Rich, clicking: a real Claude Code builds a small app**.

**Architecture:**
- **`packages/mcp`, a separate host process** (on 7113, Task 1 confirming it free) speaking **MCP's Streamable HTTP transport, stateless**,
  reached through the edge at **`/mcp` on `app.` and `console.`**, beside `/v1`. It imports **only `@manifest/contract`** from this
  repository (D22's rule, §22), holds **no credential of its own**, and forwards the caller's delegated token on every API call it makes.
- **Its tools are generated from the contract's OpenAPI document**: one tool per operation a delegated token may call — the document already
  marks the 27 session-only ones (`security: [{ session: [] }]`) — **less the three the document itself names in `x-manifest-alongside`'s
  `notTools`** (the WebSocket; `startAgentSession`, which answers a model key; `getOpenApiDocument`, 1.2 MB), named by `operationId`, with
  two composites (`waitForBuild`, `waitForPerson`) the same entry names. **A coverage gate** holds the tool list to the document, and the front
  end's read-tool test derives from the same entry (cross-plan X3).
- **Token controls in the control plane**: `MintTokenRequest.rateLimit` (1–600 a minute); **per-token daily quotas** on builds, deploys,
  commits and dependency resolutions, counted in a record of their own (`delegated_token_usage`), declared on the route and taken by the
  route wrapper; **`revokeToken` widened** to the minter, an owner (`members:manage`) or an administrator, with a new `token.revoked` event.
- **A toolkit catalogue beside blueprints** (`toolkits/<name>/toolkit.yaml` + a knowledge pack), loaded at boot, served by three reads;
  `cwl` and `models` first (Task 6a). **`AGENTS.md` points to them only after the front end's building agent reads them** (Task 6b, gated on
  F7's sitting 4 — Rich's X1 (a), `327ca2f`).
- **Manifest's own credentials join the secret scanner** (`mft_…`, `sk-…`).
- **The contract goes to its next minor ONCE, at Task 2** (expected `1.12.0` — A1's `1.9.0` landed at `163f42c`, B makes `1.10.0`, FE-32
  `1.11.0`; Task 1 re-chains it).

**Tech Stack:** TypeScript 5.9.3 on Node 24.12.0 (host), Fastify 5.12.3, `zod/v4` (routes) and `zod` 3 (descriptors), drizzle-orm 0.45 /
drizzle-kit 0.31, Vitest 2.1, Caddy 2.11.4 (custom build), Docker Desktop 29.7.2. **One new external package: `@modelcontextprotocol/sdk`**,
the MCP project's TypeScript SDK, **pinned at Task 1 to its current release** with its integrity recorded (no evidence argues for an older
one — memory *justify version pins*). Re-read every version at Task 1.

**Spec:** [`../specs/2026-08-29-manifest-platform-design.md`](../specs/2026-08-29-manifest-platform-design.md). Read:
- **§1** *Bring your own agent* (l. 24–38); **D24** (l. 220) and **D25** (l. 221);
- **§17**, Phase 3's row (l. 1904); **§20** *Credential classes (D24)* (l. 2031–2055) and *Machine-actionable errors* (l. 2057–2069);
- **§22** *The third reference client: MCP (Phase 3)* (l. 2461–2473) and *API design principles (D23)* (l. 2482–2546);
- **§21** *Platform inventory* (l. 2215–2252); **§25** *The descriptor* and *Starters* (l. 2868 and l. 2909 since A1's Spec action B,
  `3d57fc3`); **§6**'s `DelegatedToken` (l. 341).

**The design this plan implements:** [`2026-10-13-byoa-on-the-laptop-design.md`](./2026-10-13-byoa-on-the-laptop-design.md) — read it
first; this plan argues from it. Where the two differ, *Decisions this plan makes* names the difference and why.

**Roadmap:** placed by Rich, 2026-10-13 20:15 (`0b17f87`, answer 2): **… A1 → B → FE-32 → BYOA on the laptop → Phase 3 → A2 …** — split out
of Phase 3.

**Predecessor:** [`2026-10-03-fe32-dependencies.md`](./2026-10-03-fe32-dependencies.md) — FE-32, *an agent can add a dependency*, with
§12's package allowlist. **This plan starts only after its acceptance closes**: its allowlist means an outside agent cannot BUILD a
lockfile that names an unlisted direct dependency or remaps a tarball — **it can still COMMIT one**; FE-32 refuses at the operation and at the
build's gate, not at `createCommit` (`fe32:251-256`; BP-M12) — which is the reason Rich placed this plan after it; its `resolveDependencies`
becomes a tool (and a quota's); and a toolkit's packages are held to its EFFECTIVE allowed set (the file and the skeletons' direct
dependencies, BP-M7).

**Successor:** Phase 3 (sandboxes; unwritten), whose MCP line this plan takes.

---

## How this plan is to be executed — sittings, one per session

**One sitting per session, with a check-in at each boundary.** This plan commits after every task.

> **NINE SITTINGS, PROPOSED** (eight before the review; its BP-M13 split the acceptance). Task 1 is first and alone (it holds 7100, a probe
> server and the network). The token controls share a sitting, because the contract bump is the rate's and the quotas add to it. The revoke
> and the scanner share one: both are small, and both close a way an agent's mistakes outlive a person's intent. Toolkits are alone, and
> served before anything points to them. The MCP server is two sittings — its core against the mock, then what reaches it through the edge.
> The clients are a sitting. **The acceptance is two**: 8a the demo, its controls and its runs; 8b the whole-branch review, its fix wave and
> Rich's click — **one window shared with the front end's F7 sitting 7** (cross-plan X7). **The mock moves with each contract change**
> (BP-I4): Tasks 2, 3, 4 and 6a each commit the contract and the mock's fixtures as one unit; Task 7's document extension types nothing
> the mock serves.

| Sitting | Tasks | What it delivers | `pnpm test:docker` owed? | Where it stops | Status |
|---|---|---|---|---|---|
| 1 | 1 | **The measurements**: every fact re-read; the SDK's current release and its server/client API in a THROWAWAY probe; Claude Code (in a throwaway `CLAUDE_CONFIG_DIR`) and Codex (in a throwaway `CODEX_HOME`) against a probe `/mcp` on loopback — headers, timeout, where each keeps the token, its permission rules, what a `401` starts; Claude Code thinking over LiteLLM's `/v1/messages` (one gateway call); Codex's configuration; whether an edge reload cuts a streamed answer, on a THROWAWAY Caddy; a day's counts; `sk-` and `mft_` hits across every repository; 7113 free; the contract's version after FE-32 | No | After Task 1's commit. **It stops and asks Rich** if `[M3]` finds Claude Code cannot be configured for `/mcp` at all, or `[M6]` finds a reload cuts a streamed answer and no bound under the agents' timeouts survives it | ← **next when the roadmap reaches this plan** (after FE-32's acceptance closes) |
| 2 | 2, 3 | **A rate set at mint** (contract bump), `RATE_LIMITED` with its limit as fields; **per-token daily quotas** — the record, the route declaration, the wrapper's take, `429 TOKEN_QUOTA_EXHAUSTED` declared from the route, `Token.usage` — **each with the mock's fixtures** | No — `api/`, `tokens/`, `db/`, `config.ts`, `packages/mock` | After both commits, with a quota refusal through the edge quoted | |
| 3 | 4, 5 | **An owner or administrator revokes any token** (FE-11 (b)), `capability: 'members:manage'` and the 25-list, `token.revoked` and `Token.revokedBy` with the mock's fixtures; **`mft_` and `sk-` in the secret scanner** | Yes — `build/` (the scanner), `source/` (the hook renders the list) | After both commits, with an owner's revoke of a collaborator's token and a committed `.mcp.json` refused, each through the edge | |
| 4 | 6a | **Toolkits served**: the descriptor, the registry, three reads, `Blueprint.toolkits`, `cwl` and `models`, the mock's toolkit fixtures and answers. **`AGENTS.md` untouched** | Only if `src/blueprints/` changes | After the commit, with `listToolkits` through the edge quoted, and BF told (its F7 sitting 4 starts from this commit) | |
| 5 | 7 | **The MCP server's core**: the package, the boundary, `x-manifest-alongside` with `notTools` and the composites, the generated tools and their gate, the call mapping, the hints, the HTTP gates — against `manifest-mock` and a fake fetch | No | After the commit, with the gate's tool count stated | |
| 6 | 8 | **What reaches it**: the composites, resources and instructions; the edge's `/mcp`; `make doctor`'s marker and `make verify`'s check; RUNBOOK; a real Claude Code through the edge (throwaway configuration), its quotable block corrected | Yes — `infra/` | After the commit, with a `tools/list` through the edge on both origins quoted | |
| 7 | 9 | **The clients**: the guides (*For an AI agent*, a new *Connecting an agent over MCP*, `llms.txt`), the mock's quota switch and scripted `token.revoked` frame, `pnpm docs:write`; the front end told | No, unless a fix touches the owed list | After the commit, with `pnpm docs:write` clean | |
| 8a | 6b (gated), 10 Steps 1–3 | **6b first, only if F7's sitting 4 has landed on manifest-app's `main`** (else it waits, and 8a runs on `AGENTS.md` whole). **`make demo-byoa`** on each driver, fresh, re-used and from `make reset`; `scripts/byoa-controls.sh`; `make ci-acceptance` | Yes, if any code changes | After the runs and the controls, every result quoted | |
| 8b | 10 Steps 4–6 | **The plan's one whole-branch review and its one fix wave; then Rich's click** — a real Claude Code builds a small app over `/mcp` and he revokes it — **in one window with the front end's F7 sitting 7** (its clicks after BP's). **Prerequisites, named in both plans**: Rich's `make refresh-vulndb` (network on) within seven days, and `make demo-production` green that day on driver 1, launching `launch-app` (F7's production retry runs on it). The close-out | Yes, if the fix wave changes code | After the clicks, the close-out committed | |

**EVERY SITTING ENDS THE SAME WAY** — the four gates (`pnpm test` twice, alone, on the final tree; `pnpm lint`; `pnpm typecheck`; `pnpm
format:check`), the Docker tier when owed; a dated *What executing this plan found*; this table; and ORIENTATION §6's sweep.

**Four rules survive any re-cut:** Task 1 stays first and alone; 8a and 8b stay last, in that order; **Task 6b never lands before F7's
sitting 4 is on manifest-app's `main`** (Rich's X1 (a), `327ca2f`); no task a spec action changes runs before Rich has decided that spec
action (C before sitting 2; D before sitting 4; A, B and E before sitting 5).

---

## Decided by Rich — build them, do not re-open them

- **The plan exists, and its place** — *"Split it, after FE-32 (Recommended)"* (2026-10-13, ~20:15 PDT, `0b17f87`, answer 2): the MCP server,
  FE-19 and token controls come OUT of Phase 3 into this plan, placed between FE-32 and Phase 3. *Rejected:* before FE-32; MCP left in Phase 3.
- **The policy brief is a section of this plan** — *"Fold it into BP's plan"* (`0b17f87`, answer 4; not the recommendation). *Rejected:* its
  own file for the Privacy Office; not now.
- **The design, whole** — `c5df7db` (~20:28 and ~20:31 PDT):
  1. **The shape** — *"Served at /mcp beside /v1 (Recommended)"*. *Rejected:* a local stdio package; inside the control plane.
  2. **FE-11 (b)** — *"(b) owner/admin may revoke (Recommended)"*: an owner of the project, or a platform administrator (§26's reason when no
     member), may revoke ANY token on the project. **This reverses his 2026-09-29 choice of (a) alone; (a) — removing a member revokes their
     tokens — stays built.** *Rejected:* keep 2026-09-29's decision.
  3. **The first toolkits** — *"CWL + models, already wired (Recommended)"*. *Rejected:* and one new library toolkit; the machinery only.
  4. **Model keys** — *"Unchanged; measure at Task 1 (Recommended)"*: keys keep chat completions, embeddings and models; Task 1 measures
     Claude Code over LiteLLM 1.102.0's `/v1/messages` (one gateway call) and Codex's configuration. **Spec action F is dropped.**
     *Rejected:* keys gain `/v1/messages` now; and `/v1/responses` under the Phase 3 rule.
  5. **The rest, as written** — §2 (stateless, bearer only, `Origin` and a cookie refused, one tool per token-callable operation plus two
     composites, a coverage gate, the hints, tested against the mock); §3a (1–600 a minute, default 600); §3b (builds, deploys, commits,
     resolutions; **a record of their own**; starting 100/100/500/50, set from Task 1); §5.1; §5.3–5.5; §6; §7; §8.
- **Where the CWL and model know-how lives once toolkits exist — X1 (a)**, *"(a) F7 gains a task (Recommended)"* (2026-10-13, ~21:32 PDT,
  `327ca2f`): the front end's building agent reads each `Blueprint.toolkits` pack beside the blueprint's, as one new task in F7 (its sitting
  4), and **this plan's change to `AGENTS.md` (Task 6b) waits for it to land**. Design §4's *"points to a toolkit for the rest"* stands.
  *Rejected:* (b) `AGENTS.md` left whole, the toolkit packs carrying the same text held equal by a test; (c) as written.
- **Carried, still binding:** D24 (a delegated token never holds the privileged four or the person-only set; a privileged ask is a question
  a person answers); every refusal asserts its code; published text cites no section, decision or plan; **the front end is told before any
  commit to `packages/contract` or `packages/mock`**; Rich's Phase 3 rule for `/v1/responses` (2026-10-03 20:52) — this plan gives no key
  that route, so it does not yet bind.

---

## What Rich does, and when

1. ~~Approve this plan~~ — **APPROVED 2026-10-13, ~21:50 PDT (`2b3dd6d`), inline per sitting.** **Named to him at approval and approved** (BR): D2 (the
   bound is the constant 600), D9 (`x-manifest-alongside`), D10 with its three exceptions — `startAgentSession` and `getOpenApiDocument` are
   not tools, beside the WebSocket — D14 (the wait is resumable, where the design said ten minutes), and 7113; and the revision's own
   departures, listed in *What the review found* (the hints, the dropped OpenAPI resource, the `401`'s header).
2. **Decide the spec actions before the sittings they gate**: **C** before sitting 2; **D** before sitting 4; **A, B and E** before sitting 5.
   If the classifier refuses the spec edit, it is staged as a script he runs himself (as A1's Spec action A was, 2026-10-13). **Each names
   its shared pages** (BP-I10).
3. **The network, at his yes, each time** (BP-M8):
   - **sitting 1**: `[M2]`'s `npm view` and the SDK's install; `[M3]` and `[M4]` — a real Claude Code and Codex call Anthropic and OpenAI,
     sending only the probe's tool list and answers; `[M5]`'s one gateway call (a fraction of a cent);
   - **sitting 5**: Task 7's `pnpm install` of the SDK, if the store does not already hold it;
   - **sitting 6**: Task 8 Step 4 — a real Claude Code calls Anthropic with a fixture project's tools and answers;
   - **sitting 8b**: his own click (Anthropic sees what his Claude Code reads of the fixture app), and **`make refresh-vulndb`** within seven
     days before it.
   **Claude Code and Codex on this laptop** for `[M3]`–`[M5]` — if Codex is not installed, `[M4]` reads its documentation and says *not
   measured*.
4. **Sitting 8b, the clicked half, in one window with the front end's F7 sitting 7**: the fix wave first; then, on the front end's *Agents*
   screen (or the console's, if F7's panel has not landed), he lets an agent in, adds Manifest to **his own** Claude Code with the address and
   header shown, asks it to build a small app, watches its commits and builds arrive, revokes its token as the owner and watches it stop; then
   F7's clicks, on `launch-app`.

---

## Read this first — what this plan knows from the code

*Read at `0b17f87`–`29b9724` on 2026-10-13, and corrected to BR's re-reading at `163f42c` (BP-M1). Task 1's `[M1]` re-reads every one.*

**Tokens, as they are.**
1. **A delegated token is `mft_<32 hex id>_<base64url secret>`** (`tokens/token.ts:3-38`); the prefix was chosen *"so a leaked credential is
   recognisable in a log, a paste or a scanner"*. Only its sha256 is stored (`db/schema.ts:477`).
2. **Its rate is the column `delegated_tokens.rate_limit`, default 600** (`db/schema.ts:481`), a request a minute in a fixed window **in
   memory** (`api/rate-limit.ts:43-66`, `TOKEN_RATE_WINDOW_MS` `:83`), taken in the credential hook **after** the token is verified
   (`api/server.ts:323-341`). `RATE_LIMITED` is mapped to a body with no limit fields (`api/errors.ts:729-740`).
3. **`MintTokenRequest` takes only `name`, `capabilities`, `expiresInDays`** (`api/representations/tokens.ts:103-130`). **`CreateTokenInput`
   already has `rateLimit?` and writes it** (`tokens/repository.ts:24`, `:45`); the mint route simply never passes one
   (`api/routes/tokens.ts:225-235`). The test helper `mintTestToken` (`tokens/testing.ts:21-35`) takes a `rateLimit`.
4. **`revokeToken` is the minter's alone**: the route answers anyone else `404 NOT_FOUND` (`api/routes/tokens.ts:342-351`), and the
   repository's update is keyed on `user_id` (`tokens/repository.ts:149-166`). The revoke ends the token's questions in one transaction,
   closes its streams `4401`, and ends its agent sessions (`api/routes/tokens.ts:352-385`). **It publishes no `token.*` event** — only
   `token.minted` exists (`observability/events.ts:70`); the events table's `events_type_known` CHECK lists every type
   (`drizzle/0053_lumpy_boomerang.sql:12`), and **`recordEvent` refuses a type with no `EVENT_DETAIL_SCHEMAS` entry**
   (`observability/events.ts:326`; the schemas `observability/event-schemas.ts:228-…`, `token.minted`'s at `:422`), which is the published
   `EventFrame`. `recordEvent` takes a redactor as its third argument (`events.ts:303`). The authorization matrix's row expects `owner: pass, collaborator: 404, admin: 404`
   (`api/authz-contract.ts:2143-2160`).
5. **`Token.mintedBy` exists** (`api/representations/tokens.ts:24`), and `listTokens` answers every member's tokens on the project to any
   member (`api/routes/tokens.ts:296-306`).
6. **`members:manage` is the owner's and the administrator's, not the collaborator's** (`projects/authz.ts:452-489`), and is one of D24's
   privileged four (`:170-175`). `assertCapability` answers a stranger `404` and a member lacking it `403` (`:597-…`), and asks an
   administrator acting as no member for §26's reason (`:786-806`).

**Errors and limits.**
7. **`Limit`** carries `scope` (`person | platform`), `period` (`day | month`), `resetsAt`, and `amountUsd` or `count`
   (`api/representations/errors.ts:15-44`). §20: *"A refusal about a limit carries the limit as fields — whose it is, over what period, how
   much, and when it lifts."*

**The route wrapper.**
8. **`defineRoute`'s definition** carries `operationId`, `capability`, `credential?: 'session'`, `withholdOnReplay`, `pendingObject` and
   `handler` (`api/contract/route.ts:49-139`). `registerRoutes`'s wrapper authenticates, parses, resolves a confirmed question into a
   `grant`, then runs the handler (`:224-300`) — **the one place every route passes**, where this plan takes a quota.

**What a token can call.**
9. **The OpenAPI document (3.1.0, contract `1.8.0`) has 76 operations; 27 carry `security: [{ "session": [] }]`** — session-only, from
   `credential: 'session'` — **and 49 the document's default, `[{ session }, { delegatedToken }]`**, one of which is the WebSocket
   `streamProjectEvents` (measured with `node -e` over `packages/contract/openapi.json`). Header parameters `Idempotency-Key` (required on
   every mutation) and `Manifest-Admin-Reason` (optional) appear as `in: header`.
10. **`@manifest/contract` exports `createManifestClient({ origin, token })`** (no `Origin` header for a token client), `unwrap`,
    `ManifestApiError`, `subscribe` (a token subscription in Node sends `authorization`, `stream.ts:42-90`), and `./openapi.json`
    (`packages/contract/package.json`). It is `"private": true`.
11. **`UNVERSIONED` is held to the control plane's own routes EXACTLY** (`api/versioning.test.ts:9-15`) and written into the document as
    `x-manifest-unversioned` (`api/contract/document.ts:525` since A1). A path another process serves cannot go in it.
12. **The console's gate** (`packages/console/src/coverage.test.ts`) holds every operation to a caller, with a `DELIBERATELY_UNCALLED` list
    that must stay honest; its import boundary is `eslint.config.js:100-110` plus `packages/console/src/boundary.test.ts`.
13. **`manifest-mock`** exports `createMockServer()` (`packages/mock/src/index.ts`), serves the whole contract from fixtures on `node:http`,
    and its token fixture is `mft_…` (`packages/mock/src/fixtures.ts:838`). **Its fixtures are typed by the contract**: `TOKEN:
    Schemas['Token']` (`:806`) is spread into `REVOKED_TOKEN` (`:829`), so a REQUIRED field added to `Token` turns `@manifest/mock`'s typecheck
    red until its fixture has it (BP-I4).

**The edge and the laptop.**
14. **`console.manifest.internal` and `app.manifest.internal`** (`infra/caddy/Caddyfile:51`, `:124`) forward `@api path /v1/* /auth/*` to
    7100 (`:68`, `:141`) and everything else to 7104 / 7105, inside `route`, behind `@outside not remote_ip 10.89.0.1/32`.
15. **Ports**: `infra/lib/common.sh:75-95` assigns 7100, 7102–7110, 7119, 7122, 7153; Mailpit 7111/7112. **§21 reserves 7101 for the admin UI**
    (spec l. 2236) — so not 7101. **7113 is unassigned.**
16. **The laptop's CA** is `infra/ca/manifest-root.crt`; `make seed` asks a developer to export `NODE_EXTRA_CA_CERTS` (`infra/seed/seed.sh:121`),
    and every demo passes it (`scripts/demo-authoring.sh:85`).
17. **`make doctor` asks each host process who it is** by a marker (7104's body, 7102's `/v1/__doctor`, 7105's `/api/__doctor`;
    `scripts/doctor.sh:182-216`).
18. **An edge configuration reload closes every proxied WebSocket and can reset about one request in 300** (ORIENTATION §3, P4c R1); the API's
    and console's sites set `stream_close_delay 1h` for that reason (`Caddyfile:69-79`).

**The scanner.**
19. **`SECRET_PATTERNS`** (`build/secret-patterns.ts:22-58`) — one list for the build's gate, the drivers' pre-push scan, driver 2's mirror
    scan and driver 1's rendered hook (`source/pre-receive.ts:3-22`) — **has no rule for `mft_…` or `sk-…`**. Every rule has a sample in
    `SAMPLE_SECRETS` (`build/testing.ts:16-29`), and `secret-patterns.test.ts` refuses a rule without one.

**Blueprints and their packs.**
20. **`loadBlueprints(root)`** reads each `blueprint.yaml` through `descriptorSchema` (zod 3), its skeleton, starters and `knowledge_pack`
    files with a sha256 each (`blueprints/registry.ts:113-175`), refusing the boot on a malformed one (`BLUEPRINT_DESCRIPTOR_INVALID`).
    `pinned_dependencies` names `passport-ubcshib: 0.1.7-rc.1` and `ubc-genai-toolkit-llm: 0.7.0` for `node-ts-mongo@1`.
21. **`getKnowledgePack`** serves a blueprint's pack (`api/routes/blueprints.ts:101-…`); `node-ts-mongo@1`'s `agents/AGENTS.md` carries CWL's
    rules (*Never write an origin into `auth.callback`* l. 31; *Never request an attribute outside `auth.attributes`* l. 52; *The auth
    component: copy it* l. 73) and the model rules (*AI: call `skeleton/ai/llm.js`, never the toolkit directly* l. 195).

**What publishes what.**
22. **FE-32's plan publishes NO event for a resolution** (its Decisions: *"Rejected: `dependencies.resolved`"*), and a deploy publishes an
    event per **instance** (`instance.provisioning`, `observability/events.ts:41`) — several per deploy under A1's sets. So quotas cannot be
    counted from events (the design's §3b correction).

**Added by the revision** (read at `163f42c`–`327ca2f`, after BR's review).

23. **The wrapper's replay and `run`**: the handler runs inside `run` (`api/contract/route.ts:293`), and a mutation's `run` is handed to
    `app.idempotent` (`replayOrStore`, `:352`), which answers a repeated key from its record **without calling `run`**. So a quota taken
    inside `run` is not taken on a replay — whatever its order inside `run` (BP-I2).
24. **§26's codes are DERIVED from `RouteDefinition.capability`**: `document.ts:191-215` declares `PROJECT_ARCHIVED` (`refusedWhenArchived`)
    and `ADMIN_REASON_REQUIRED` with the `Manifest-Admin-Reason` header (`refusedWithoutAdminReason`, `projects/authz.ts:747-766`), and
    `api/authz-contract.ts:3089` holds the operations that ANSWER the reason's refusal equal to the declared set **and to a literal list of
    24**. `revokeToken` declares no `capability` today (BP-I5).
25. **A stranger's `assertCapability` refusal names the project** (`no project '<id>'`, `authz.ts:697`/`:705`), while the revoke today answers
    a stranger and a missing id alike, `no token '<id>'` (`routes/tokens.ts:354`) — deliberately (BP-M3).
26. **A production deploy after a person's yes still meets §13's gate**: `deploy` passes `assertCapability` and `assertStepUp` on the grant,
    then `ProductionGateError` answers `409` with the checklist (`api/routes/releases.ts:1168-1194`); the grant is spent only when a handler
    resolves. **`make demo-token` proves D24's loop with `addMember`** (`members:manage`; `packages/journey/src/token.ts:196-206`, `:550`,
    `:734`), and its production ask only as a refusal (`:441-485`) (BP-I1).
27. **`startAgentSession` answers a model key** — `{ session, key, baseUrl }` (`api/routes/agents.ts:228-260`, `AgentSessionStarted.key`
    `api/representations/agents.ts:122-130`) — and **`getOpenApiDocument` answers 1.2 MB** (`packages/contract/openapi.json`) (BP-I6).
28. **`Build.status`, not `state`** (`api/representations/builds.ts:74`), one of `pending`, `running`, `succeeded`, `failed`
    (`db/schema.ts:27-30`) — a build queued behind another app's is `pending`. **`Subscription.closed`** is a promise of `{ code, reason }`
    (`packages/contract/src/stream.ts:28-37`); `SubscribeOptions` has no close callback. An event frame is `{ kind: 'event', subject, type, … }`
    (BP-I7).
29. **`Member` carries `puid` and `email`** beside `cwlLogin` and `displayName` (`api/representations/members.ts:9-21`), and `listMembers`
    admits a token. **`getLaunchRecords` and the two drafts** carry the privacy assessment's answers; **`recordEvent` appends an
    administrator's §26 reason to the event's sentence** (`observability/events.ts:350-357`), which a token reads on the stream (BP-I9).
30. **FE-32's allowed set is the file AND the skeletons' direct dependencies** — the latter *"allowed by the loader, not listed"*
    (`2026-10-03-fe32-dependencies.md:601-602`); `listAllowedDependencies` answers both (BP-M7).
31. **The shared pages** (BP-I10): `specs/manifest-phases.html`'s stage-3 card (*"Sandboxes and building by describing"*, l. 281-292) says
    *"Manifest also becomes available as a set of tools any AI can use directly, which is what makes 'bring your own AI' real"*;
    `manifest-decisions.html`'s D24 card (l. 170-173) and D25 card (l. 175-177); `manifest-schematic.html` and `manifest-stories.html` carry
    no inventory or MCP line.

---

## Decisions this plan makes, and why

*Revised to BR's review: each finding that changed a decision names itself (BP-In, BP-Mn, Xn).*

1. **ONE CONTRACT BUMP, AT TASK 2** (expected `1.12.0`; Task 1 re-chains it after FE-32's). Tasks 3, 4, 6a and 7 add to it. Additive: a
   request field, representation fields, `Limit`'s new members, one error code, one event type, three toolkit operations, one document
   extension. *Cost to change course:* the version string.
2. **THE RATE'S BOUND IS A CONSTANT, 600, NOT A SETTING.** `MAX_TOKEN_RATE_PER_MINUTE = 600` beside `MAX_TOKEN_DAYS`, and the schema says
   `.max(600)`. The design proposed `MANIFEST_TOKEN_RATE_LIMIT_MAX`; Rich approved *"1 to 600 a minute, default 600"*. A configurable bound
   the published document cannot state is a contract that lies on a machine where it is set. *Rejected:* the setting. *Cost:* a setting
   later, and the document's bound moved with it. **Named to Rich at approval** (BR); Spec action C says *"at most 600 a minute"* (BP-M2).
3. **QUOTAS ARE DECLARED ON THE ROUTE AND TAKEN BY THE WRAPPER** — `quota: { counts, when? }` on `startBuild`, `deploy`, `createCommit`
   (`when: !dryRun`) and `resolveDependencies` — **inside `run`, after authentication and the question's resolution, immediately before the
   handler**, for a token actor only. *Why the wrapper:* §20's per-token limit is central so no route forgets it (`server.ts:327-336`); a
   quota a route has to remember is a quota the next route forgets. **`quota-declared.test.ts` holds the four operations to a declaration.**
   **Why inside `run`** (BP-I2): `app.idempotent` answers a replayed key without calling `run` (*Read this first* 23), so a replay is never
   counted — and that, not the take's order within `run`, is the property; Task 3's control (c) moves the take OUT of `run` to prove it.
   *What it counts:* attempts the handler is asked to do — a request refused inside the handler (a `403`, a `422`) has still been counted.
   *Rejected:* counting only successes (the expensive part of a runaway loop is the attempt, and a success-only count needs every handler to
   report back); counting inside each handler.
4. **A QUOTA IS TAKEN UNDER A PER-TOKEN TRANSACTION LOCK** (`pg_advisory_xact_lock` on the token id): count the window, refuse or insert, in
   one transaction. Without it two concurrent builds both read 99 and both insert. *Rejected:* `SERIALIZABLE` (a retry loop for every
   build); an in-memory counter (a restart empties it).
5. **THE WINDOW IS ROLLING, 24 HOURS, ON THE DATABASE'S CLOCK** (BP-M6): `created_at > clock_timestamp() - interval '24 hours'`, the same
   clock that stamps the rows — never the host's `Date.now()` (ORIENTATION's trap: the two differ). `resetsAt` is when the oldest counted
   act leaves, computed in SQL. *Rejected:* a calendar day (an agent that ran out at 23:50 starts fresh at midnight with no reason a person
   can read).
6. **THE QUOTAS ARE PLATFORM SETTINGS**, one per kind (`MANIFEST_TOKEN_QUOTA_BUILDS_PER_DAY` …), defaults from `[M7]` — starting 100, 100,
   500, 50 — never set at mint (design §3b). `Token.usage` reports used, allowed and when each lifts. **`TOKEN_QUOTA_EXHAUSTED` is declared
   from `RouteDefinition.quota`** in `document.ts`, as `PROJECT_ARCHIVED` is from `capability` (BP-M5), so exactly the four operations publish
   it.
7. **WHO MAY REVOKE A TOKEN: ITS MINTER ALWAYS; ANYONE ELSE THROUGH `assertCapability(…, 'members:manage')`** — the owner's and the
   administrator's. So a collaborator is `403`, an owner passes, and an administrator who is no member gives §26's reason — **no new rule**,
   the one that already decides who may manage the project's people. **No step-up**: revoking is the safe direction, as rejecting a question
   is (`authz-contract.ts`'s confirm/reject pair). **The definition declares `capability: 'members:manage'`** (BP-I5), so `document.ts`
   derives `PROJECT_ARCHIVED`, `ADMIN_REASON_REQUIRED` and the reason header, and `authz-contract.ts`'s literal list of 24 becomes 25 with
   `revokeToken`; its description says the minter's own revoke asserts none. **A stranger still reads `no token '<id>'`** (BP-M3): the route
   checks scope first — a member, or an administrator, of a project not deleted — and answers anyone else the token's `404`, so a token id
   never confirms a project. **The capability is asserted for a LIVE token only**: an already-revoked one goes straight to the route's
   idempotent path — which is how a retry ends the sessions a failed first attempt left live (the route's own comment) — so on an archived
   project, where the archive revoked every token, an owner's revoke answers `200` and never meets `PROJECT_ARCHIVED`; a token still live on
   an archived project cannot exist (the archive's revoke and the mint's hold on the project row). *Rejected:* a new capability (`token:revoke`) — a twelfth word for the owner's
   existing authority.
8. **`token.revoked`, FOR EVERY `revokeToken`**, the minter's own included, in the revoke's transaction, naming who revoked whose
   (`machineDetail: { tokenId, tokenName, mintedBy, revokedBy }` — the name because a reader on a token cannot `listTokens`, a person's
   read, and the front end's keeper names the agent in its email; asked by BF). Today a revoke is visible only as its questions' ends. It needs
   **an `EVENT_DETAIL_SCHEMAS` entry** (BP-M4; `recordEvent` refuses a type without one, and it is the published `EventFrame`), the CHECK
   widened by migration, and the events reference. **And `Token.revokedBy`** — a column stamped by every revoke, a removal's and an archive's
   too — so a page reading `listTokens` can say who stopped an agent (asked by BF). The event stays `revokeToken`'s alone: a removal and an
   archive already say so with their own.
9. **`/mcp` IS DECLARED IN A SIBLING LIST, `x-manifest-alongside`**, not `UNVERSIONED`: `versioning.test.ts` holds `UNVERSIONED` to the
   control plane's own routes exactly (*Read this first* 11), and `/mcp` is another process's. The design said *"joins the contract's
   unversioned endpoints"*; its intent — the contract says it exists — is kept. **Its entry carries the tool rule's data** (cross-plan X3,
   agreed with BF): `{ method: 'POST', path: '/mcp', servedBy: 'manifest-mcp', why, notTools: [{ operationId, why }], composites: [{ name,
   readOnly: true, why }] }`. `api/alongside.ts` holds it; **it lands in Task 7**, so the MCP server and the front end's read-tool test derive
   from the published document from the first day there is a server. **Named to Rich at approval** (BR).
10. **THE TOOL SET IS DERIVED, NOT LISTED**: an operation is a tool if and only if its effective `security` admits `delegatedToken`, it is
    not a WebSocket (`x-manifest-websocket`), and it is **not in `x-manifest-alongside`'s `notTools`** — read from the document by the server,
    its gate and the front end alike. **Three exceptions** (BP-I6): `streamProjectEvents` (a WebSocket — `waitForBuild` reads it);
    **`startAgentSession`** (*"answers a model key: a credential in the model's context"* — and an MCP agent thinks with its own provider,
    Rich's answer 4); **`getOpenApiDocument`** (*"1.2 MB; every operation is a tool with its schema"*). The gate: the generated names equal
    that set, and the two composites are the only additions. **The read tools are the `GET` ones and the two composites** (X3). **Named to
    Rich at approval with its two new exceptions**: they depart from *"one tool per operation a token may call"*, approved as written.
11. **A TOOL'S INPUT IS FLAT**: path and query parameters at the top level, the request body under `body`, and `idempotencyKey` (optional;
    made by the server when absent) for an operation with the `Idempotency-Key` header. `Manifest-Admin-Reason` is never an input (a token
    acts for no administrator). The generator refuses a parameter named `body` or `idempotencyKey`. Component `$ref`s are inlined as
    `$defs`, so every tool's schema stands alone.
12. **A TOOL'S ANSWER**: the response body as JSON text, and as `structuredContent` when it is an object. A refusal: `isError: true`, the
    envelope's `code`, `message` and `hint` as text, the envelope as `structuredContent`. No `outputSchema` (a client then requires
    `structuredContent` on every answer, and a text answer such as a build log has none). **No tool result carries a model key** (BP-I6): a
    test calls every tool against the mock and refuses any result matching `\bsk-[A-Za-z0-9_-]{20,}` or the caller's `mft_`.
13. **ONE SERVER AND ONE TRANSPORT PER REQUEST** (the SDK's stateless pattern): the token is read from the request and closed over; nothing
    outlives the response. *Rejected:* a session map keyed by `Mcp-Session-Id` (a store of who holds which token).
14. **THE COMPOSITES ARE BOUNDED BELOW EVERY AGENT'S TOOL TIMEOUT AND AN EDGE RELOAD** (`[M3]`, `[M6]`): `waitForBuild` waits at most
    `MANIFEST_MCP_WAIT_SECONDS` (default from Task 1; 60 if nothing is measured) and answers `{ done: false }` with the build as it stands,
    telling the agent to call again. **`done` means `status` is `succeeded` or `failed`** — never *"not running"*, which a `pending` build,
    queued behind another app's, also is (BP-I7) — and **the build is read FIRST**, answered at once when it has already ended, because the
    stream's replay may not hold its end. A revoke's `4401` ends the wait through `Subscription.closed`. *Rejected:* one ten-minute wait (the
    design's figure) — an edge reload or a client timeout would end it with nothing said. **Named to Rich at approval** (BR).
15. **THE TOOLKIT PACKS CARRY THE DETAIL; THE BLUEPRINT'S PACK KEEPS EVERY RULE AS ONE LINE AND POINTS — ONCE THE FRONT END'S AGENT READS
    THEM** (design §4: *"keeps what is its skeleton's own and points to a toolkit for the rest"*; Rich's X1 (a), `327ca2f`). Each CWL and
    model rule of `AGENTS.md` that is the library's, not the skeleton's, keeps its heading and one sentence, then *"— toolkit `cwl`'s pack
    has the rest"*; the detail moves. **The front end's building agent reads `getKnowledgePack` alone today** (X1: manifest-app's
    `packages/server/src/platform/project.ts:38-64`), so it would keep each rule's name and lose how to obey it. Hence **Task 6 splits**:
    6a serves the toolkits and touches no pack; **6b** slims `AGENTS.md`, **gated on F7's sitting 4** (its agent reading each
    `Blueprint.toolkits` pack beside the blueprint's, within one cap of 24,000 characters, blueprint first) having landed on manifest-app's
    `main`. *Rejected:* moving whole sections (an agent reading one pack loses rules); copying them held equal by a test (Rich's (b)).
16. **A TOOLKIT'S DECLARATIONS ARE PROVED BY AN EXAMPLE THE REAL VALIDATOR ACCEPTS**: `toolkit.yaml` carries `declares` (each `path` with
    `why`) and an `example` manifest fragment; the test validates a fixture manifest with the fragment through `manifestSchema`, and holds
    every declared `path` to appear in it. *Rejected:* walking the zod schema's internals for each path. **A toolkit's packages are held to
    FE-32's EFFECTIVE allowed set** — its file and the skeletons' direct dependencies (BP-M7) — read through FE-32's own loader, never the file
    alone, which would refuse `cwl` and `models` at boot.
17. **`Blueprint` GAINS `toolkits`** — the refs of the toolkits that work with it — so `getBlueprint` tells an agent where to read next.
18. **THE MCP SERVER LISTENS ON LOOPBACK ONLY, 7113**, and answers `GET /__doctor` with `{ "name": "manifest-mcp" }` there; the edge forwards
    only `/mcp`. **No `make up` change**: it is started as the control plane is (RUNBOOK), and `make demo-byoa` refuses to start without it,
    printing the command. **Named to Rich at approval** (BR).
19. **THE TOOL HINTS CLAIM ONLY WHAT IS TRUE** (BP-I8): `readOnlyHint: true` and `idempotentHint: true` for a `GET` alone; **a write sets
    neither, and never `destructiveHint: false`** — MCP's default for a tool that is not read-only is destructive, and `deploy` replaces what
    serves staging, `setAppSecret` overwrites a value, `createCommit` moves `main`. `idempotentHint` would be false on a write whenever the
    agent omits `idempotencyKey`, since the server then makes a fresh one. No `openWorldHint`. **Departs from the design's §2** (*"DELETE →
    destructiveHint; every mutation idempotentHint"*): named to Rich at approval.
20. **NO OPENAPI RESOURCE** (BP-I6): the resources are the guides and the knowledge packs (blueprints' and toolkits'). The document is 1.2
    MB, and every operation is already a tool with its own schema. **Departs from the design's §2** (*"and the OpenAPI document"*): named to
    Rich at approval.
21. **AN `initialize` IS ANSWERED ONLY FOR A LIVE TOKEN** (BP-M9): the server makes one cheap read with the bearer (`listProjects`) before
    answering `initialize`; a `401` there is the HTTP answer's `401`, so a wrong or revoked token never shows *"connected"* with a full tool
    list. **The `401`'s `WWW-Authenticate: Bearer` header stays only if `[M3]` finds Claude Code does not start OAuth discovery from it** —
    discovery would ask `app.`'s `/.well-known/…`, which the edge sends to the front end on 7105. If it does, the header is dropped and the
    body says what to send. **Conditionally departs from the design's §2** (*"`401` with `WWW-Authenticate: Bearer`"*): named to Rich.
22. **EVERY AGENT-RUN CLIENT USES A THROWAWAY CONFIGURATION** (cross-plan X2): a real Claude Code run by an agent — `[M3]`, Task 8 Step 4 —
    runs with `CLAUDE_CONFIG_DIR` under the scratchpad, removed at the step's end, and `[M3]` records that the client honours it; Codex with a
    throwaway `CODEX_HOME`. **Only Rich's own click (8b) uses his configuration, by his hand.**
23. **THE ACCEPTANCE'S PRIVILEGED PATH IS `addMember`** (BP-I1), as `make demo-token`'s is: on a fresh project a confirmed production deploy
    meets §13's gate (`409`, *Read this first* 26), so it cannot *"go through once"*. `make demo-byoa` keeps the production ask only as D24's
    refusal — a tool error carrying `pendingAction` — and proves the loop (asked, confirmed, through once, a third call a new question) with
    the agent asking to add the laptop IdP's `colleague` (`col000001`, faculty — FE-39 refuses anyone else) as a collaborator; that colleague
   then lets their own agent in, which the owner revokes (steps 11–12). A production retry after a yes belongs to a launched app: F7's clicks on
    `launch-app` in 8b (X7).

---

## Global Constraints

- **The four gates, clean before every commit**, from the repository root; `pnpm test` twice on a sitting's final tree; never `--filter`.
- **`pnpm test:docker`** is owed by any change to `runtime/`, `routing/`, `services/`, `build/`, `releases/`, `identity/`, `sso/`,
  `secrets/`, `projects/`, `blueprints/`, `spec/`, `ai/`, `observability/`, `launch/`, `source/`, `mail/`, `infra/`, or a
  `*.docker.test.ts`. In the background, never beside a Vitest run; `docker network ls -q | wc -l` first; from a shell where
  `MANIFEST_SOURCE_DRIVER` and every `MANIFEST_GITHUB_*` is unset; then restart the control plane, the three cleanup scripts, `make verify`.
- **One file**: `pnpm exec vitest run --project unit src/<path>` (control plane) or `pnpm exec vitest run --project packages
  packages/mcp/src/<file>`. **Never two Vitest processes at once.** `pnpm test` truncates the control plane's tables.
- **A route change is four commands, in order**: the definition, `pnpm contract:write`, `pnpm contract:generate`, `pnpm docs:write`.
- **A schema change is `pnpm --filter @manifest/control-plane db:generate`**, and the generated SQL is read before it is committed.
- **Published text cites no section, decision or plan.**
- **Every refusal asserts its code** (`refusal(res)` → `{ status, code }`), with a positive control in the same file. This plan adds
  `TOKEN_QUOTA_EXHAUSTED`.
- **Never accept a check you have not watched fail**: commit, break, predict, restore.
- **Every task names its CALLER.**
- **A token never appears in an MCP server's output, log line or tool result**; a test greps for it.
- **The front end is told before any commit to `packages/contract` or `packages/mock`**; keep them typecheck-clean together.
- **Commit on `main`, stage your own paths by name**; `git status` before each commit.
- **The network, each use at Rich's yes** (BP-M8; *What Rich does* 3): `[M2]`'s `npm view` and the SDK's install; `[M3]` and `[M4]`'s real
  clients calling their providers with the probe's content; `[M5]`'s one gateway call; Task 7's `pnpm install` (nothing if the store holds
  it); Task 8 Step 4's real Claude Code on a fixture project; 8b's `make refresh-vulndb` and Rich's own click.
- **An agent never touches Rich's own client configuration** (X2, Decision 22): `CLAUDE_CONFIG_DIR` and `CODEX_HOME` under the scratchpad,
  removed at the step's end.
- **The four protected containers survive; `caddy-data` is never destroyed; never touch Valet; ask before `sudo`; never edit the spec.**
- **macOS: bash 3.2, BSD userland, the tool shell zsh** — multi-line probes as files run with `bash`.
- **Leave the machine as you found it**: `scripts/snapshot-machine.sh` at the start and end; the three cleanup scripts, bare then `--apply`;
  every probe server stopped and every throwaway file removed.

---

## Review Focus

**The eight failure modes most likely to bite a person, that no happy path exercises.** Each has its test in the owning task.

1. **A credential that leaks through the convenience.** An agent's `.mcp.json` committed into its app; a tool result or an MCP server log
   line carrying the bearer; a refusal envelope echoed with the request's headers; **a model key answered into the model's context by
   `startAgentSession`** (BP-I6). Expected: **the commit refused `409 SOURCE_SECRET_DETECTED` naming the rule, nothing written; the token in
   no output of the MCP server, its log, or any tool result; `startAgentSession` no tool at all, and no tool result matching `sk-…`.** Owned
   by Task 5, and Task 7's *no echo* and *no model key*.
2. **The MCP server doing what the token cannot.** A request with a session cookie and no bearer; a browser page posting to `/mcp` with the
   person's cookie; a token for another project naming this one. Expected: **`401` with no API call for the first two (the cookie is never
   forwarded); `403` for any request carrying `Origin`; the API's own `404 NOT_FOUND` for the third, relayed as a tool error.** Owned by Task
   7's HTTP gates and Task 10.
3. **A runaway agent that costs everyone.** A loop building once a second; two builds racing at the quota's edge; a replay of the same
   `Idempotency-Key`. Expected: **refused `429 TOKEN_QUOTA_EXHAUSTED` with `limit: { scope: 'token', period: 'day', count, resetsAt, counts:
   'builds' }` at exactly the quota — never one over under concurrency; a replay answered from the record and not counted; a person's own
   session never counted.** Owned by Task 3.
4. **A revoke that leaves the agent working.** An owner revokes a collaborator's token while its stream is open, a question waits and a
   model session runs. Expected: **its next call `401`, its stream closed `4401`, its question `expired`, its session ended, and
   `token.revoked` naming both people** — exactly as the minter's own revoke does. A collaborator revoking the owner's token: `403`. Owned by
   Task 4.
5. **A wait that ends in silence, or too soon.** `waitForBuild` across an edge reload (a deploy elsewhere), past an agent's tool timeout, on
   a build still `pending` behind another app's, and on a build that ended before the call. Expected: **an answer before the bound; `{ done:
   false, build }` while it is `pending` or `running`; `done: true` only at `succeeded` or `failed`, at once if it had already ended; never a
   dropped connection with nothing said.** Owned by Task 8, measured in `[M3]` and `[M6]`.
6. **A pending action an agent cannot see through MCP.** A token asks to add a member, or for production. Expected: **a tool error whose
   structured content carries `pendingAction` (its id, what it would act on, when it stops waiting), and `waitForPerson` answering
   `confirmed` once a person has — after which the identical `addMember` call goes through once, and a third is a new question** (production,
   on a fresh project, stays refused by §13's gate after a yes — Decision 23). Owned by Task 7's refusal mapping and Task 10.
7. **A toolkit that teaches what the platform refuses.** A toolkit whose package version differs from the blueprint's pin, whose package is
   not on FE-32's allowlist, or whose example manifest the validator refuses. Expected: **the boot refuses the first two by name, and the test
   refuses the third.** Owned by Task 6a.

8. **"Connected" when it is not.** A wrong or revoked `mft_` bearer. Expected: **`initialize` answered `401`, never a tool list** (BP-M9,
   Decision 21). Owned by Task 7's HTTP gates.
---

## File Structure

```
packages/control-plane/src/
  api/representations/tokens.ts      MOD (T2) MintTokenRequest.rateLimit, MAX_TOKEN_RATE_PER_MINUTE; (T3) Token.usage, TokenUsage; (T4) Token.revokedBy
  api/representations/errors.ts      MOD (T2) Limit: scope 'token', period 'minute', counts
  api/rate-limit.ts                  MOD (T2) RateLimitedError carries scope, limit and resetsAt
  api/errors.ts                      MOD (T2) RATE_LIMITED's limit; (T3) TOKEN_QUOTA_EXHAUSTED's mapping and Retry-After
  api/error-codes.ts                 MOD (T3) TOKEN_QUOTA_EXHAUSTED
  api/routes/tokens.ts               MOD (T2) mint passes rateLimit; (T3) usage on every Token; (T4) revoke widened, capability, token.revoked
  api/contract/route.ts              MOD (T3) RouteDefinition.quota; the wrapper's take inside run
  api/routes/builds.ts, releases.ts, source.ts   MOD (T3) quota declarations (+ FE-32's resolveDependencies wherever it lives)
  api/quota-declared.test.ts         NEW (T3)
  api/contract/document.ts           MOD (T2) the version; (T3) TOKEN_QUOTA_EXHAUSTED derived from quota; (T7) x-manifest-alongside
  api/contract/document.test.ts      MOD (T3) the derived code; (T7) the alongside entry
  api/alongside.ts                   NEW (T7) POST /mcp, its notTools and composites
  api/authz-contract.ts              MOD (T4) revokeToken's row and the 24-list → 25; (T6a) the toolkit reads' rows
  api/routes/toolkits.ts             NEW (T6a) listToolkits, getToolkit, getToolkitKnowledgePack
  api/representations/toolkits.ts    NEW (T6a) Toolkit, ToolkitList, ToolkitKnowledgePack
  api/representations/blueprints.ts  MOD (T6a) Blueprint.toolkits
  tokens/quota.ts                    NEW (T3) takeTokenQuota, usageOf, TokenQuotaExhaustedError
  tokens/quota.test.ts               NEW (T3)
  tokens/repository.ts               MOD (T4) revokeTokenById; revokeTokensOf and revokeTokensOfMember take `by`
  db/schema.ts                       MOD (T3) delegated_token_usage; (T4) delegated_tokens.revoked_by and the events CHECK
  drizzle/00NN_*.sql                 NEW (T3, T4) generated
  observability/events.ts            MOD (T4) 'token.revoked'
  observability/event-schemas.ts     MOD (T4) token.revoked's detail schema
  build/secret-patterns.ts, build/testing.ts   MOD (T5) two rules, two samples
  toolkits/descriptor.ts, registry.ts, index.ts, toolkits.test.ts   NEW (T6a)
  config.ts, index.ts, api/server.ts MOD (T3) the quotas; (T6a) MANIFEST_TOOLKITS_ROOT and the registry in ServerDeps
toolkits/cwl/toolkit.yaml, toolkits/cwl/agents/CWL.md          NEW (T6a)
toolkits/models/toolkit.yaml, toolkits/models/agents/MODELS.md NEW (T6a)
blueprints/node-ts-mongo/agents/AGENTS.md                      MOD (T6b, gated on F7's sitting 4) one line per moved rule, and its pointer
packages/mock/src/fixtures.ts, packages/mock/src/server.ts     MOD (T2, T3, T4, T6a) each task's fields and answers; (T9) the quota switch, the scripted token.revoked frame
packages/mcp/                                                   NEW (T7, T8)
  package.json, tsconfig.json
  src/operations.ts    the token-callable operations, from the document and its x-manifest-alongside
  src/schema.ts        a tool's input schema, $refs inlined
  src/call.ts          a tool call → one API call → a tool result
  src/server.ts        McpOptions; createMcpServer({ apiOrigin, token, document, version, waitSeconds })
  src/http.ts          handleMcpRequest — path, Origin, method, bearer, then the transport
  src/composites.ts    (T8) waitForBuild, waitForPerson
  src/resources.ts     (T8) the guides and the packs
  src/instructions.ts  (T8)
  src/main.ts          the host process on 127.0.0.1:7113, /__doctor, one operator line per request
  src/*.test.ts        operations (the gate), schema, call, http, server (against the mock), boundary, composites, resources
eslint.config.js                                                MOD (T7) packages/mcp's import boundary
infra/caddy/Caddyfile                                           MOD (T8) @mcp in console. and app.
infra/lib/common.sh, scripts/doctor.sh, scripts/verify.sh       MOD (T8) PORT_MCP, the marker, the edge check
scripts/ci-acceptance.sh                                        MOD (T8) EXPECT_DOCTOR / EXPECT_VERIFY, their one place; (T10) a step
docs/api/agents.md, docs/api/mcp.md (NEW), docs/api/llms.txt, docs/api/events.md   MOD/NEW (T4 events.md; T9 the rest)
packages/journey/src/byoa.ts, scripts/demo-byoa.sh, scripts/byoa-controls.sh, Makefile   NEW/MOD (T10)
docs/superpowers/RUNBOOK.md                                     MOD (T8) Running the MCP server; (T10) make demo-byoa
docs/superpowers/spikes/byoa-baseline/                          NEW (T1)
```

---

## Task 1: Measure what this plan rests on

**Files:**
- Create: `docs/superpowers/spikes/byoa-baseline/README.md`, and its probes (each a THROWAWAY, removed at the sitting's end; the README keeps
  their text)

**Interfaces:**
- Consumes: nothing.
- Produces: the measured facts every later task's *"from `[Mn]`"* reads — the SDK version and its import paths; the port; the contract
  version; the composites' bound; the quotas' defaults; the scanner's false-positive count.

- [ ] **Step 1: `[M1]` — re-read every fact of *Read this first*** at the sitting's `HEAD`, one line each: holds, or what it is now, with
  the line. **A1, B and FE-32 have run**: read `api/contract/route.ts`'s wrapper, `tokens/`, `api/routes/tokens.ts`, `blueprints/registry.ts`
  and `build/secret-patterns.ts` again in full; find FE-32's `resolveDependencies` route and its allowlist file and their shapes; read A1's
  deploy events. Grep the plan for *"Task 1"* and *"`[M`"* and answer every deferred check here (memory *Task 1 owes deferred checks*) —
  among them: **FE-32's function that computes the EFFECTIVE allowed set** (the file and the skeletons' direct dependencies, Decision 16);
  the events tests' helper for reading a project's events by type (`eventsOfType` below) and the members tests' removal helper; the
  idempotency hook's replay path (*Read this first* 23); and **the contract's version — A1's `1.9.0` landed at `163f42c`, B makes `1.10.0`,
  FE-32 `1.11.0`, so this plan's is `1.12.0` unless one of them moved**.
- [ ] **Step 2: `[M2]` — the SDK.** `npm view @modelcontextprotocol/sdk version dist.integrity` (the network, read-only). In a throwaway
  directory under the scratchpad, install that exact version and write a 40-line stateless server (`Server`, `StreamableHTTPServerTransport`
  with `sessionIdGenerator: undefined`, one tool, `ListToolsRequestSchema`/`CallToolRequestSchema`) and a client (`Client`,
  `StreamableHTTPClientTransport` with `requestInit.headers.authorization`). Record: the exact import paths, whether `enableJsonResponse`
  exists, what a `GET` and a `DELETE` are answered without a session, whether `Server`'s options take `instructions`, and the tool
  `annotations` field names. **Every code block in Tasks 7 and 8 is written against this record; correct them here if it differs.**
- [ ] **Step 3: `[M3]` — Claude Code on the laptop, in a THROWAWAY configuration** (X2, Decision 22). `export
  CLAUDE_CONFIG_DIR="$SCRATCH/claude-m3"` (under the session's scratchpad) **for every command of this step**, and first prove the client
  honours it: `claude mcp list` there is empty, and Rich's `~/.claude.json` is byte-identical before and after the step (`shasum`, never
  printed). Run the probe server on `127.0.0.1:7113` (`lsof -nP -iTCP:7113 -sTCP:LISTEN` empty first); **the edge is not touched in this
  task**, so the probe is reached on loopback. `claude mcp add --transport http probe http://127.0.0.1:7113/mcp --header "Authorization:
  Bearer probe"`, then the same with `--scope project` in a throwaway directory, then `claude mcp remove` each. Record: it lists and calls
  the tool; **the header NAMES it sends** (the probe logs names only — `origin` present or not); **its tool-call timeout** (the probe's tool
  sleeps 30, 60, 120 s); **where each scope stores the header** (`local` → the file and key it writes, under `CLAUDE_CONFIG_DIR`; `project`
  → `.mcp.json` in the directory — read both files' shape, never print the value); **how it treats `readOnlyHint`** (does a read tool run
  without asking; how a person allows tools — the permission rule's syntax and the tool's name as Claude Code spells it, e.g.
  `mcp__probe__<tool>`, and whether `mcp__probe` allows them all). **And the two false "connected"s** (BP-M9): the probe answering
  `initialize` and `tools/list` to any bearer — what Claude Code shows; and the probe answering `401` **with** `WWW-Authenticate: Bearer` and
  **without** it — does the client start OAuth discovery (a request for `/.well-known/oauth-protected-resource` or
  `/.well-known/oauth-authorization-server`, which the probe logs), and what it shows the person. Decision 21's header follows this. And
  Node's half of the CA question: `node -e "fetch('https://app.manifest.internal/v1/docs').then(r=>console.log(r.status))"` with and
  without `NODE_EXTRA_CA_CERTS`. **Claude Code itself over `https://…/mcp` is measured at Task 8 Step 4, through the edge.** At the step's
  end `rm -rf "$SCRATCH/claude-m3"`. *(The network: Claude Code sends Anthropic the probe's tool list and answers — Rich's yes, What Rich
  does 3.)*
- [ ] **Step 4: `[M4]` — Codex.** If installed: a `[mcp_servers.probe]` table with `url` and `bearer_token_env_var` in a throwaway
  `CODEX_HOME`; does it list and call the tool; the header names; its timeout; where the configuration lives; how it treats `readOnlyHint`
  and how a person approves a tool; whether it needs a CA setting of its own. And whether its model provider can be configured for chat
  completions (`wire_api`), and to what base URL. If not installed: read its documentation and write *"not measured"* beside each answer.
- [ ] **Step 4a: For the front end, quotable.** `[M3]` and `[M4]` end in a block of the README headed *"For the front end — word for
  word"*: each client's exact command or table (with `$MANIFEST_TOKEN` in place of the token), where it stores the header per scope, the CA
  setting it needs, how a person lets read tools run without asking (the rule, with the tool names as the client spells them), and its tool
  timeout — **and** (X4): how each client's form keeps the token out of `~/.zsh_history` (an environment variable expanded at run time, a
  leading space with `HIST_IGNORE_SPACE`, or *"it cannot"*); **which scope and which directory** the person runs it in (local scope is per
  directory, and an agent that only uses MCP has no app folder — say which directory the front end should name); and **whether Codex's
  variable can be set for one session** rather than in a shell profile, where it would outlive the token. BF's plan quotes it (asked by BF,
  2026-10-13). Task 8 Step 4 corrects it from the real edge.
- [ ] **Step 5: `[M5]` — Claude Code thinking on a Manifest key** (Rich's yes, the network on): start an agent session through the API for a
  fixture project (`startAgentSession`, the capable model), then `ANTHROPIC_BASE_URL=http://127.0.0.1:7106 ANTHROPIC_AUTH_TOKEN=<key> claude -p
  "reply ok"` — **one call**. Record the status, whether LiteLLM 1.102.0 served `/v1/messages` at all (the key's `allowed_routes` should
  refuse it — that refusal IS the measurement of today), and, only if Rich then says so, one call with a key minted by hand with
  `/v1/messages` allowed. End the session. **Never write the key anywhere.**
- [ ] **Step 6: `[M6]` — an edge reload against a streamed answer.** **The live edge is never edited in this task**, so on a THROWAWAY
  Caddy: `docker run --rm` of the edge's own image (its digest from `infra/images.lock`) on a free loopback port, with a five-line
  Caddyfile whose one site `reverse_proxy`s to the probe server on 7113; start the probe's tool sleeping 90 s through it, both as a JSON
  answer and as the SDK's streamed (SSE) answer; `caddy reload` a changed config through the throwaway's admin API at 20 s; record whether
  each answer arrives, and how long it waited. The container and its config are removed at the step's end. **Its result sets the
  composites' bound (Decision 14)**: below every agent's tool timeout (`[M3]`, `[M4]`) and, if a reload cuts a streamed answer, short enough
  that a cut costs one call.
- [ ] **Step 7: `[M7]` — a day's worth.** From `make demo-authoring`'s and FE-32's acceptance's event logs (or their scripts): builds,
  deploys, commits and resolutions one agent run makes. Set the quotas' defaults to the larger of the design's starting values (100, 100, 500,
  50) and ten runs' worth; record both.
- [ ] **Step 8: `[M8]` — the scanner's two rules against everything real**: run `/\bmft_[0-9a-f]{32}_[A-Za-z0-9_-]{20,}/` and
  `/\bsk-[A-Za-z0-9_-]{20,}/` over `blueprints/`, `fixtures/`, `packages/*/src`, `docs/` and every bare repository under `.manifest/repos`
  (`git -C <repo> grep -E` over `HEAD`). Every hit is either a real credential (report it to Rich, never print it) or a false positive
  (narrow the rule, and record why). **BR ran it in advance at `163f42c`**: no hit in any of 53 app repositories, `blueprints/` or
  `fixtures/`; the hits are Manifest's own documented examples (`sk-example-not-a-real-key` and an `mft_…` example in
  `api/routes/agents.ts`, `api/routes/tokens.ts`, `operations.md`) and unit tests — none of which an app's scan reads. Re-run it; record
  any change.
- [ ] **Step 9: `[M9]` — the gate numbers and the contract**: `EXPECT_` lines as `scripts/ci-acceptance.sh` has them; the contract version;
  `docker network ls -q | wc -l`.
- [ ] **Step 10: Commit**

```bash
git add docs/superpowers/spikes/byoa-baseline/README.md
git commit -m "docs(byoa): Task 1 — the measurements this plan rests on"
```

---

## Task 2: A rate set at mint, and `RATE_LIMITED` with its limit as fields

**Files:**
- Modify: `packages/control-plane/src/api/representations/tokens.ts:95-140`, `api/representations/errors.ts:15-44`,
  `api/rate-limit.ts:7-83`, `api/errors.ts:728-740`, `api/routes/tokens.ts:225-235`, `api/contract/document.ts` (the version),
  `packages/mock/src/fixtures.ts` (the mint's answer echoes `rateLimit`; `Limit`'s fixtures, if any refusal fixture carries one)
- Test: `packages/control-plane/src/api/tokens.test.ts`, `api/rate-limit-token.test.ts`

**Interfaces:**
- Consumes: `[M9]`'s contract version.
- Produces: `MAX_TOKEN_RATE_PER_MINUTE = 600`; `MintTokenRequest.rateLimit?: number`; `Limit.scope` gains `'token'`, `Limit.period` gains
  `'minute'`, `Limit.counts?: 'requests' | 'builds' | 'deploys' | 'commits' | 'resolutions'`; `RateLimitedError(retryAfterSeconds, limit,
  resetsAt)`. Task 3 reuses `Limit.counts` and `scope: 'token'`.

- [ ] **Step 1: Write the failing tests** — in `api/tokens.test.ts`:

```ts
it('mints a token at the rate a person asks for, within 1 to 600 a minute', async () => {
  await withProjectServer(async ({ app, deps, projectId, ownerCookies }) => {
    const mint = (rateLimit?: number) =>
      app.inject({
        method: 'POST',
        url: `/v1/projects/${projectId}/tokens`,
        cookies: ownerCookies,
        headers: mutationHeaders(deps),
        payload: {
          name: 'slow agent',
          capabilities: ['project:read'],
          expiresInDays: 7,
          ...(rateLimit === undefined ? {} : { rateLimit }),
        },
      })
    const slow = await mint(30)
    expect(slow.statusCode).toBe(201)
    expect(slow.json().token.rateLimit).toBe(30)
    // Absent: the maximum, so no client that never sends it changes.
    expect((await mint()).json().token.rateLimit).toBe(600)
    expect(refusal(await mint(0))).toEqual({ status: 400, code: 'REQUEST_INVALID' })
    expect(refusal(await mint(601))).toEqual({ status: 400, code: 'REQUEST_INVALID' })
  })
})
```

  and in `api/rate-limit-token.test.ts`, extend *'refuses past the token’s own limit'*:

```ts
const body = refused.json() as { error: { limit?: Record<string, unknown> } }
expect(body.error.limit).toEqual({
  scope: 'token',
  period: 'minute',
  counts: 'requests',
  count: 3,
  resetsAt: expect.any(String),
})
expect(Date.parse(body.error.limit!.resetsAt as string)).toBeGreaterThan(Date.now())
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vitest run --project unit src/api/tokens.test.ts src/api/rate-limit-token.test.ts`
Expected: FAIL — `rateLimit` is refused as an unknown key by the strict object (`400 REQUEST_INVALID` for `mint(30)`), and `limit` is
`undefined`.

- [ ] **Step 3: Implement**

`api/representations/tokens.ts`, beside `MAX_TOKEN_DAYS`:

```ts
/** §20's per-token rate: the most a token may be minted with, and what it gets when none is asked for. */
export const MAX_TOKEN_RATE_PER_MINUTE = 600
```

and in `MintTokenRequest`'s `strictObject`, after `expiresInDays`:

```ts
rateLimit: z
  .int()
  .min(1)
  .max(MAX_TOKEN_RATE_PER_MINUTE)
  .optional()
  .describe(
    `Requests a minute this token may make, 1 to ${MAX_TOKEN_RATE_PER_MINUTE}. Absent, ${MAX_TOKEN_RATE_PER_MINUTE}. Fixed for the token's life: mint another to change it.`,
  ),
```

`tokens/repository.ts`'s `CreateTokenInput` **already has `rateLimit?` and writes it** (*Read this first* 3); the mint route passes
`...(body.rateLimit === undefined ? {} : { rateLimit: body.rateLimit })` (`exactOptionalPropertyTypes`).

`api/representations/errors.ts`'s `Limit`:

```ts
scope: z.enum(['person', 'platform', 'token']).describe(
  'Whose limit: the person the credential acts for, the platform’s own, or the delegated token’s.',
),
period: z.enum(['minute', 'day', 'month']).describe('What it counts over.'),
counts: z
  .enum(['requests', 'builds', 'deploys', 'commits', 'resolutions'])
  .optional()
  .describe('On a token’s limit: what it counts.'),
```

`api/rate-limit.ts`: `RateLimitedError` takes `(retryAfterSeconds, limit, resetsAt: Date)`; `createKeyedRateLimiter.take` throws `new
RateLimitedError(seconds, limit, new Date(window.start + options.windowMs))`. The slug limiter (`createRateLimiter`) passes the same — its
refusal carries `scope: 'person'` (Step 3's mapping reads which from a `scope` the error carries: the keyed limiter used for tokens is
constructed with `scope: 'token'`, the slug one with `'person'`).

`api/errors.ts:729`:

```ts
if (error instanceof RateLimitedError) {
  return {
    status: 429,
    body: {
      error: {
        code: error.code,
        message: error.message,
        hint: `Wait ${error.retryAfterSeconds} s; Retry-After says the same.`,
        limit: {
          scope: error.scope,
          period: 'minute',
          ...(error.scope === 'token' ? { counts: 'requests' as const } : {}),
          count: error.limit,
          resetsAt: error.resetsAt.toISOString(),
        },
      },
    },
  }
}
```

The contract's version: `document.ts`'s `info.version` to `[M9]`'s next minor. Then the four commands.

- [ ] **Step 4: Run them to verify they pass**, then the slug limiter's own test (`src/api/rate-limit.test.ts`) and `src/api/docs.test.ts`.
- [ ] **Step 5: The negative control** — remove `.max(MAX_TOKEN_RATE_PER_MINUTE)`; predict `mint(601)` answers `201`; watch it; restore.
- [ ] **Step 6: The mock, as one unit with the contract** (BP-I4): `pnpm contract:generate`, then the mock's fixtures for what changed —
  the mint's answer echoing a `rateLimit` it was sent — and `pnpm typecheck` for `@manifest/contract` and `@manifest/mock` together, clean.
  **Tell the front end** (its live session, through the coordinator if one runs) **which typed fields arrived**: the contract's new version;
  `MintTokenRequest.rateLimit?` (1–600; its page sends none); `Limit.scope` gains `'token'`, `Limit.period` gains `'minute'`, `Limit.counts?`
  is new. **Then commit.**

```bash
git add packages/control-plane/src/api/representations/tokens.ts packages/control-plane/src/api/representations/errors.ts \
  packages/control-plane/src/api/rate-limit.ts packages/control-plane/src/api/errors.ts packages/control-plane/src/api/routes/tokens.ts \
  packages/control-plane/src/tokens/repository.ts packages/control-plane/src/api/contract/document.ts \
  packages/control-plane/src/api/tokens.test.ts packages/control-plane/src/api/rate-limit-token.test.ts \
  packages/contract/openapi.json packages/contract/src/schema.d.ts packages/contract/package.json docs/api/reference/ \
  packages/mock/src/fixtures.ts
git commit -m "feat(tokens): a rate set at mint, 1 to 600 a minute — and RATE_LIMITED carries its limit as fields"
```

---

## Task 3: Per-token daily quotas on what every app shares

**Files:**
- Create: `packages/control-plane/src/tokens/quota.ts`, `tokens/quota.test.ts`, `api/quota-declared.test.ts`, the generated migration
- Modify: `db/schema.ts` (after `delegatedTokens`, `:463-490`), `api/contract/route.ts:49-139` and the wrapper `:224-300`,
  `api/routes/builds.ts` (`startBuild`), `api/routes/releases.ts` (`deploy`), `api/routes/source.ts` (`createCommit`), FE-32's
  `resolveDependencies` route, `api/error-codes.ts`, `api/errors.ts`, `api/representations/tokens.ts`, `api/routes/tokens.ts`, `config.ts`,
  `api/server.ts` (`ServerDeps.config` already carries config), `api/contract/document.ts` and `document.test.ts` (the code derived from
  `quota`, BP-M5), `packages/mock/src/fixtures.ts` (`Token.usage` on every token fixture, BP-I4)

**Interfaces:**
- Consumes: Task 2's `Limit` (`scope: 'token'`, `counts`).
- Produces: `TOKEN_QUOTA_KINDS = ['builds', 'deploys', 'commits', 'resolutions'] as const`; `type TokenQuotaKind`;
  `takeTokenQuota(db, { tokenId, counts, allowed }): Promise<void>` (throws `TokenQuotaExhaustedError`); `usageOf(db, tokenIds):
  Promise<Map<string, Record<TokenQuotaKind, { used: number; resetsAt: Date | null }>>>`; `RouteDefinition.quota?: { counts: TokenQuotaKind; when?: (body: unknown) =>
  boolean }`; `config.tokenQuotas: Record<TokenQuotaKind, number>`; `Token.usage: TokenUsage[]` where `TokenUsage = { counts, used, allowed, resetsAt }`
  — `resetsAt` when the oldest counted act leaves the 24 hours, `null` when none is counted (the front end, BF, asked for it: a page reading
  `listTokens` says *"it can build again from 4:12 pm"* without waiting for the agent's refusal).

- [ ] **Step 1: Write the failing tests** — `tokens/quota.test.ts`:

```ts
import { asc, eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { delegatedTokenUsage } from '../db/index.js'
import { resetDatabase } from '../db/testing.js'
import { withProjectServer } from '../api/testing.js'
import { mintTestToken } from './testing.js'
import { takeTokenQuota, TokenQuotaExhaustedError, usageOf } from './quota.js'

afterAll(resetDatabase)

describe('per-token daily quotas (§20)', () => {
  it('counts to the quota and refuses the next, naming what it counts and when it lifts', async () => {
    await withProjectServer(async ({ db, projectId, userId }) => {
      const { row } = await mintTestToken(db, { userId, projectId, capabilities: ['build:create'] })
      for (let i = 0; i < 3; i++) await takeTokenQuota(db, { tokenId: row.id, counts: 'builds', allowed: 3 })
      const refused = await takeTokenQuota(db, { tokenId: row.id, counts: 'builds', allowed: 3 }).catch((e: unknown) => e)
      expect(refused).toBeInstanceOf(TokenQuotaExhaustedError)
      const e = refused as TokenQuotaExhaustedError
      expect([e.counts, e.allowed]).toEqual(['builds', 3])
      // On the DATABASE's clock (Decision 5): exactly a day after the oldest counted row, never compared with the host's Date.now().
      const [first] = await db.select({ at: delegatedTokenUsage.createdAt }).from(delegatedTokenUsage)
        .where(eq(delegatedTokenUsage.tokenId, row.id)).orderBy(asc(delegatedTokenUsage.createdAt)).limit(1)
      expect(e.resetsAt.getTime() - first!.at.getTime()).toBe(86_400_000)
      // Another kind, and another token, are untouched.
      await takeTokenQuota(db, { tokenId: row.id, counts: 'deploys', allowed: 3 })
      const usage = (await usageOf(db, [row.id])).get(row.id)!
      expect(Object.fromEntries(Object.entries(usage).map(([k, v]) => [k, v.used]))).toEqual({ builds: 3, deploys: 1, commits: 0, resolutions: 0 })
      expect(usage.builds.resetsAt!.getTime()).toBe(e.resetsAt.getTime())
      expect(usage.commits.resetsAt).toBeNull()
    })
  })

  it('never lets two racing requests both take the last one', async () => {
    await withProjectServer(async ({ db, projectId, userId }) => {
      const { row } = await mintTestToken(db, { userId, projectId, capabilities: ['build:create'] })
      const results = await Promise.allSettled(
        Array.from({ length: 10 }, () => takeTokenQuota(db, { tokenId: row.id, counts: 'builds', allowed: 5 })),
      )
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(5)
      expect((await usageOf(db, [row.id])).get(row.id)?.builds.used).toBe(5)
    })
  })
})
```

  and, through the route — in the same file or `api/delegation.test.ts`'s neighbour `api/quota.test.ts`:

```ts
it('refuses a token’s build past its quota with the limit as fields, and never counts a person', async () => {
  await withProjectServer(
    async ({ app, deps, db, projectId, userId, ownerCookies, commitSha }) => {
      const { plaintext } = await mintTestToken(db, { userId, projectId, capabilities: ['build:create'] })
      const build = (auth: Record<string, unknown>) =>
        app.inject({ method: 'POST', url: `/v1/projects/${projectId}/builds`, payload: { commitSha },
          headers: { 'idempotency-key': randomUUID(), ...auth } })
      const asToken = { authorization: `Bearer ${plaintext}` }
      expect((await build(asToken)).statusCode).toBe(202)
      await deps.builds.idle()
      const refused = await build(asToken)
      expect(refusal(refused)).toEqual({ status: 429, code: 'TOKEN_QUOTA_EXHAUSTED' })
      expect(refused.json().error.limit).toEqual({
        scope: 'token', period: 'day', counts: 'builds', count: 1, resetsAt: expect.any(String),
      })
      // A person's own session is never counted.
      expect((await app.inject({ method: 'POST', url: `/v1/projects/${projectId}/builds`, payload: { commitSha },
        cookies: ownerCookies, headers: mutationHeaders(deps) })).statusCode).toBe(202)
    },
    { config: { ...(await testDeps()).config, tokenQuotas: { builds: 1, deploys: 100, commits: 500, resolutions: 50 } } },
  )
})

it('answers a replay from its record without counting it again', async () => {
  // `app.idempotent` answers a repeated key without calling `run`, where the take lives (Read this first 23; Decision 3).
  await withProjectServer(async ({ app, db, projectId, userId, commitSha }) => {
    const { row, plaintext } = await mintTestToken(db, { userId, projectId, capabilities: ['build:create'] })
    const key = randomUUID()
    const build = () =>
      app.inject({ method: 'POST', url: `/v1/projects/${projectId}/builds`, payload: { commitSha },
        headers: { authorization: `Bearer ${plaintext}`, 'idempotency-key': key } })
    expect((await build()).statusCode).toBe(202)
    expect((await build()).statusCode).toBe(202) // the first answer, replayed from the record
    expect((await usageOf(db, [row.id])).get(row.id)?.builds.used).toBe(1)
  })
})
```

`api/quota-declared.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ROUTE_DEFINITIONS } from './routes/index.js'

/** §20's quotas: what every app on the machine shares, declared on the route so the wrapper takes it — and no route forgets. */
const COUNTED = { startBuild: 'builds', deploy: 'deploys', createCommit: 'commits', resolveDependencies: 'resolutions' } as const

describe('every counted operation declares its quota', () => {
  it('declares exactly the four, and nothing else declares one', () => {
    const declared = Object.fromEntries(
      ROUTE_DEFINITIONS.filter((r) => r.quota !== undefined).map((r) => [r.operationId, r.quota!.counts]),
    )
    expect(declared).toEqual(COUNTED)
  })
  it('does not count a commit’s dry run', () => {
    const commit = ROUTE_DEFINITIONS.find((r) => r.operationId === 'createCommit')!
    expect(commit.quota!.when!({ dryRun: true })).toBe(false)
    expect(commit.quota!.when!({})).toBe(true)
  })
})
```

- [ ] **Step 2: Run them to verify they fail** — `pnpm exec vitest run --project unit src/tokens/quota.test.ts src/api/quota-declared.test.ts`.
  Expected: FAIL — `./quota.js` does not exist; `quota` is not a property of `RouteDefinition`.

- [ ] **Step 3: Implement**

`db/schema.ts`, after `delegatedTokens`:

```ts
/**
 * §20's PER-TOKEN QUOTAS (the BYOA plan's Task 3, Decisions 3–5): one row per counted act a token's request asked the platform to do —
 * a build, a deploy, a commit, a dependency resolution — over a rolling day. A RECORD OF ITS OWN, not the events: a resolution publishes
 * none, and a deploy publishes one per instance. Cascades with its token: it is a meter, not the audit trail.
 */
export const delegatedTokenUsage = pgTable(
  'delegated_token_usage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenId: uuid('token_id').notNull().references(() => delegatedTokens.id, { onDelete: 'cascade' }),
    counts: text('counts').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`clock_timestamp()`),
  },
  (t) => [
    index('delegated_token_usage_window_idx').on(t.tokenId, t.counts, t.createdAt),
    check('delegated_token_usage_counts_known', sql`${t.counts} IN ('builds', 'deploys', 'commits', 'resolutions')`),
  ],
)
```

Then `pnpm --filter @manifest/control-plane db:generate`; read the SQL; it creates the table, the index and the CHECK, nothing else.

`tokens/quota.ts`:

```ts
import { and, count, eq, inArray, sql } from 'drizzle-orm'
import type { Db } from '../db/index.js'
import { delegatedTokenUsage } from '../db/index.js'

export const TOKEN_QUOTA_KINDS = ['builds', 'deploys', 'commits', 'resolutions'] as const
export type TokenQuotaKind = (typeof TOKEN_QUOTA_KINDS)[number]

/**
 * THE WINDOW, ON THE DATABASE'S CLOCK (Decision 5; BP-M6): the rows are stamped `clock_timestamp()`, so the window is measured by the same
 * clock — never the host's `Date.now()`, which ORIENTATION's traps say differs. `LIFTS` is when the oldest counted act leaves it.
 */
const IN_WINDOW = sql`${delegatedTokenUsage.createdAt} > clock_timestamp() - interval '24 hours'`
const LIFTS = sql<Date | null>`min(${delegatedTokenUsage.createdAt}) + interval '24 hours'`.mapWith(
  (v: string | Date | null) => (v === null ? null : new Date(v)),
)

export class TokenQuotaExhaustedError extends Error {
  readonly code = 'TOKEN_QUOTA_EXHAUSTED'
  constructor(
    readonly counts: TokenQuotaKind,
    readonly allowed: number,
    readonly resetsAt: Date,
  ) {
    super(`this delegated token has used its ${allowed} ${counts} for the last 24 hours`)
    this.name = 'TokenQuotaExhaustedError'
  }
}

/**
 * Counts the act or refuses it, under a lock on the token so two requests at the edge cannot both take the last one (Decision 4).
 * The window is the last 24 hours, rolling (Decision 5); a refusal says when its oldest act leaves it.
 */
export async function takeTokenQuota(
  db: Db,
  input: { tokenId: string; counts: TokenQuotaKind; allowed: number },
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`token-quota:${input.tokenId}`}, 0))`)
    const where = and(
      eq(delegatedTokenUsage.tokenId, input.tokenId),
      eq(delegatedTokenUsage.counts, input.counts),
      IN_WINDOW,
    )
    const [row] = await tx.select({ used: count(), lifts: LIFTS }).from(delegatedTokenUsage).where(where)
    if ((row?.used ?? 0) >= input.allowed) {
      throw new TokenQuotaExhaustedError(input.counts, input.allowed, row!.lifts!)
    }
    await tx.insert(delegatedTokenUsage).values({ tokenId: input.tokenId, counts: input.counts })
  })
}

export type TokenUsageCounts = Record<TokenQuotaKind, { used: number; resetsAt: Date | null }>

/**
 * The last 24 hours' counts for each token, every kind present — `used: 0, resetsAt: null` when none is counted — and, for each kind
 * counted, when its oldest act leaves the window: what `Token.usage` reports, so a page can say when a spent quota lifts.
 */
export async function usageOf(db: Db, tokenIds: readonly string[]): Promise<Map<string, TokenUsageCounts>> {
  const none = () => ({ used: 0, resetsAt: null })
  const out = new Map<string, TokenUsageCounts>()
  for (const id of tokenIds) out.set(id, { builds: none(), deploys: none(), commits: none(), resolutions: none() })
  if (tokenIds.length === 0) return out
  const rows = await db
    .select({ tokenId: delegatedTokenUsage.tokenId, counts: delegatedTokenUsage.counts, used: count(), lifts: LIFTS })
    .from(delegatedTokenUsage)
    .where(and(inArray(delegatedTokenUsage.tokenId, [...tokenIds]), IN_WINDOW))
    .groupBy(delegatedTokenUsage.tokenId, delegatedTokenUsage.counts)
  for (const r of rows) out.get(r.tokenId)![r.counts as TokenQuotaKind] = { used: Number(r.used), resetsAt: r.lifts }
  return out
}
```

*(If `[M1]` finds `db.transaction`'s pool shares the advisory-lock pools' rule — `db/locks.ts`'s *"pools of their own"* — the lock moves
there as `withTokenQuotaLock`, in the file's own pattern; the test above is the same either way.)*

`config.ts`: four settings, each `z.coerce.number().int().positive().default(<[M7]>)` — `MANIFEST_TOKEN_QUOTA_BUILDS_PER_DAY`,
`…_DEPLOYS_PER_DAY`, `…_COMMITS_PER_DAY`, `…_RESOLUTIONS_PER_DAY` — read into `tokenQuotas: Record<TokenQuotaKind, number>`, with a comment
naming the shared resource each protects (the design's table).

`api/contract/route.ts`: the definition gains

```ts
/**
 * §20'S PER-TOKEN QUOTA (the BYOA plan's Task 3, Decision 3): what this operation counts against a delegated token's day. Taken by
 * the wrapper, for a token only, immediately before the handler — so a replay answered from its record is not counted, a person is
 * never counted, and no route can forget. `when` says which requests count (a commit's dry run does not).
 */
quota?: { counts: TokenQuotaKind; when?: (body: unknown) => boolean }
```

and in `run()`, before `route.handler(…)`:

```ts
if (route.quota !== undefined && scoped.credential === 'token' && (route.quota.when?.(body) ?? true)) {
  await takeTokenQuota(deps.db, {
    tokenId: scoped.tokenId,
    counts: route.quota.counts,
    allowed: deps.config.tokenQuotas[route.quota.counts],
  })
}
```

The four declarations: `startBuild` `quota: { counts: 'builds' }`; `deploy` `quota: { counts: 'deploys' }`; `createCommit` `quota: { counts:
'commits', when: (b) => (b as { dryRun?: boolean }).dryRun !== true }`; FE-32's `resolveDependencies` `quota: { counts: 'resolutions' }`.

`api/error-codes.ts`:

```ts
TOKEN_QUOTA_EXHAUSTED: api(
  429,
  'This delegated token has used its day’s quota of builds, deploys, commits or dependency resolutions; `limit` says which, how many, and when it lifts.',
  'Wait until `limit.resetsAt`, or ask the person who gave you this token to do it themselves. Do not retry before then.',
),
```

`api/errors.ts`, beside `RateLimitedError`'s mapping: `TokenQuotaExhaustedError` → `429`, `limit: { scope: 'token', period: 'day', counts,
count: allowed, resetsAt }`, and a `Retry-After` of the seconds to `resetsAt` (the error handler sets it as it does for `RateLimitedError`).

`api/contract/document.ts` (BP-M5), beside `refusedArchived`:

```ts
/**
 * §20'S PER-TOKEN QUOTA, DERIVED (the BYOA plan's Task 3), as PROJECT_ARCHIVED is from `capability`: an operation that declares a `quota`
 * can answer `429 TOKEN_QUOTA_EXHAUSTED`, and no other can — so no route lists it by hand.
 */
function refusedOverQuota(route: AnyRoute): readonly ErrorCode[] {
  return route.quota === undefined ? [] : ['TOKEN_QUOTA_EXHAUSTED']
}
```

joined where `refusedArchived` is; `document.test.ts` asserts the four operations, and only they, declare it.

`Token.usage` (`api/representations/tokens.ts`): `z.array(TokenUsage)`, `TokenUsage = { counts: enum(TOKEN_QUOTA_KINDS), used: int, allowed:
int, resetsAt: Timestamp.nullable() }`, described *"What this token has done in the last 24 hours of what every app on the machine shares, and its quota of each."*
`toToken(row, usage, quotas)`; `listTokens` reads `usageOf` once for the page; mint answers zeros; revoke reads its own.

- [ ] **Step 4: Run the tests to verify they pass**, then `src/api/authz-contract.test.ts` (every token actor's build/deploy/commit row must
  still pass at the default quotas) and `src/api/delegation.test.ts`.
- [ ] **Step 5: Negative controls** — (a) remove the advisory lock; predict the race test sees more than 5 fulfilled (run it five times; a
  race that never shows is recorded as such, with the count); restore. (b) Remove `createCommit`'s `when`; predict `quota-declared.test.ts`
  red; restore. (c) **Move the take OUT of `run`, into `handle` before `app.idempotent(…)`** (BP-I2: moved within `run` it could not fail, since a replay
  never calls `run`); predict the replay case counts 2; watch it red; restore.
- [ ] **Step 6: The mock, as one unit with the contract** (BP-I4): `Token.usage` on `TOKEN` and on every token fixture spread from it —
  all four kinds, and on one fixture a spent `builds` (`used` = `allowed`) with its `resetsAt`, so the front end can walk *"it can build
  again from …"*; `pnpm typecheck` for `@manifest/contract` and `@manifest/mock` together, clean. **Tell the front end which typed fields
  arrived**: `Token.usage: TokenUsage[]` (`{ counts, used, allowed, resetsAt }`, required) and `TOKEN_QUOTA_EXHAUSTED` with its `limit`.
  **Commit.**

```bash
git add packages/control-plane/src/tokens/quota.ts packages/control-plane/src/tokens/quota.test.ts \
  packages/control-plane/src/api/quota-declared.test.ts packages/control-plane/src/db/schema.ts packages/control-plane/drizzle/ \
  packages/control-plane/src/api/contract/route.ts packages/control-plane/src/api/routes/builds.ts \
  packages/control-plane/src/api/routes/releases.ts packages/control-plane/src/api/routes/source.ts \
  packages/control-plane/src/api/error-codes.ts packages/control-plane/src/api/errors.ts \
  packages/control-plane/src/api/representations/tokens.ts packages/control-plane/src/api/routes/tokens.ts \
  packages/control-plane/src/config.ts packages/control-plane/src/api/contract/document.ts \
  packages/control-plane/src/api/contract/document.test.ts packages/contract/ packages/mock/src/fixtures.ts docs/api/reference/
# and FE-32's resolveDependencies route file, by name, as [M1] found it
git commit -m "feat(tokens): per-token daily quotas on builds, deploys, commits and resolutions — 429 TOKEN_QUOTA_EXHAUSTED with its limit"
```

---

## Task 4: An owner or an administrator revokes any token on the project (FE-11 (b)), and `token.revoked`

**Files:**
- Modify: `packages/control-plane/src/api/routes/tokens.ts:309-386`, `tokens/repository.ts:79-166` (all three revokes),
  `observability/events.ts:70`, `db/schema.ts` (`delegated_tokens.revoked_by`; the events CHECK), `api/representations/tokens.ts`
  (`Token.revokedBy`), the removal's and the archive's callers of `revokeTokensOfMember` and `revokeTokensOf`, `api/authz-contract.ts:2143-2160`
  and its literal list of 24 (`:3089`, BP-I5), **`observability/event-schemas.ts`** (`token.revoked`'s detail schema, BP-M4), `docs/api/events.md`
  and the events reference (BP-M4), `packages/mock/src/fixtures.ts` (`revokedBy` on every token fixture, BP-I4); the generated migration
- Test: `packages/control-plane/src/api/tokens.test.ts`, `api/authz-contract.test.ts`

**Interfaces:**
- Consumes: `assertCapability(db, actor, projectId, 'members:manage')`; `personName(db, userId)`; `publishEvent` / the revoke's
  transaction as it stands.
- Produces: `revokeTokenById(tx, id, by): Promise<boolean>` (no `userId` key — the route decides who may); `revokeTokensOf(tx, projectId,
  by)` and `revokeTokensOfMember(tx, projectId, userId, by)` gain `by`; column `delegated_tokens.revoked_by` (uuid, nullable, `RESTRICT`, as
  the events' `actor_user_id`) and `Token.revokedBy: string | null` — **who revoked it, whichever way** (its minter, an owner, an
  administrator, the person who removed its minter, the person who switched the app off; the front end, BF, asked for it so a page can say
  who); event `token.revoked` with `machineDetail: { tokenId: string; tokenName: string; mintedBy: string; revokedBy: string }`, **published for a
  `revokeToken` alone** — a removal's revokes are said by `member.removed`, an archive's by `project.archived`, as today.

- [ ] **Step 1: Write the failing tests** — `api/tokens.test.ts`:

```ts
describe('who may revoke a delegated token (FE-11 (b))', () => {
  it('lets an OWNER revoke a collaborator’s token, which stops it everywhere the minter’s own revoke does', async () => {
    await withProjectServer(async (ctx) => {
      const colleague = await sessionFor(ctx, 'bio_colleague', 'collaborator')
      const minted = await ctx.app.inject({
        method: 'POST', url: `/v1/projects/${ctx.projectId}/tokens`, cookies: colleague,
        headers: mutationHeaders(ctx.deps), payload: { name: 'their agent', capabilities: ['project:read'], expiresInDays: 7 },
      })
      const { token, secret } = minted.json() as { token: { id: string }; secret: string }
      const revoked = await ctx.app.inject({
        method: 'DELETE', url: `/v1/tokens/${token.id}`, cookies: ctx.ownerCookies, headers: mutationHeaders(ctx.deps),
      })
      expect(revoked.statusCode).toBe(200)
      expect(revoked.json().revokedAt).not.toBeNull()
      expect(refusal(await ctx.app.inject({
        method: 'GET', url: `/v1/projects/${ctx.projectId}`, headers: { authorization: `Bearer ${secret}` },
      }))).toEqual({ status: 401, code: 'UNAUTHENTICATED' })
      const [event] = await eventsOfType(ctx.db, ctx.projectId, 'token.revoked')
      expect(event?.machineDetail).toEqual({ tokenId: token.id, tokenName: 'their agent', mintedBy: expect.any(String), revokedBy: ctx.userId })
      expect(event?.humanMessage).toMatch(/revoked .*'their agent'/)
      expect(revoked.json().revokedBy).toBe(ctx.userId)
    })
  })

  it('refuses a COLLABORATOR revoking the owner’s token (403), and a stranger (404)', async () => {
    await withProjectServer(async (ctx) => {
      const { row } = await mintTestToken(ctx.db, { userId: ctx.userId, projectId: ctx.projectId, capabilities: ['project:read'] })
      const del = (cookies: Record<string, string>) =>
        ctx.app.inject({ method: 'DELETE', url: `/v1/tokens/${row.id}`, cookies, headers: mutationHeaders(ctx.deps) })
      expect(refusal(await del(await sessionFor(ctx, 'bio_colleague', 'collaborator')))).toEqual({ status: 403, code: 'FORBIDDEN' })
      const stranger = await del(await sessionFor(ctx, 'unrelated_user'))
      expect(refusal(stranger)).toEqual({ status: 404, code: 'NOT_FOUND' })
      // BP-M3: the stranger reads the TOKEN's 404, exactly as for an id that does not exist — never the project's.
      expect(stranger.json().error.message).toBe(`no token '${row.id}'`)
      expect(stranger.body).not.toContain(ctx.projectId)
    })
  })

  it('answers an owner’s revoke of an already-revoked token 200 — on an archived project too', async () => {
    // BP-I5's archived question: the archive revoked every token, so an owner's revoke of one finds it revoked and answers its
    // idempotent 200 — never PROJECT_ARCHIVED.
    await withProjectServer(async (ctx) => {
      const colleague = await sessionFor(ctx, 'bio_colleague', 'collaborator')
      const theirs = (await ctx.app.inject({ method: 'POST', url: `/v1/projects/${ctx.projectId}/tokens`, cookies: colleague,
        headers: mutationHeaders(ctx.deps), payload: { name: 'x', capabilities: ['project:read'], expiresInDays: 7 } })).json().token.id
      await archiveThroughRoute(ctx) // the lifecycle tests' helper, as [M1] finds it
      const res = await ctx.app.inject({ method: 'DELETE', url: `/v1/tokens/${theirs}`, cookies: ctx.ownerCookies,
        headers: mutationHeaders(ctx.deps) })
      expect(res.statusCode).toBe(200)
      expect(res.json().revokedBy).toBe(ctx.userId) // the archive's actor: the owner archived it
    })
  })

  it('records token.revoked for the minter’s own revoke too, and revokedBy for a removal’s revoke', async () => {
    await withProjectServer(async (ctx) => {
      const { row } = await mintTestToken(ctx.db, { userId: ctx.userId, projectId: ctx.projectId, capabilities: ['project:read'] })
      await ctx.app.inject({ method: 'DELETE', url: `/v1/tokens/${row.id}`, cookies: ctx.ownerCookies, headers: mutationHeaders(ctx.deps) })
      const [own] = await eventsOfType(ctx.db, ctx.projectId, 'token.revoked')
      expect(own?.machineDetail).toEqual({ tokenId: row.id, tokenName: row.name, mintedBy: ctx.userId, revokedBy: ctx.userId })
      // A removal revokes the removed person's tokens and stamps who removed them — and publishes no token.revoked.
      const colleague = await sessionFor(ctx, 'bio_colleague', 'collaborator')
      const theirs = (await ctx.app.inject({ method: 'POST', url: `/v1/projects/${ctx.projectId}/tokens`, cookies: colleague,
        headers: mutationHeaders(ctx.deps), payload: { name: 'x', capabilities: ['project:read'], expiresInDays: 7 } })).json().token.id
      await removeMemberThroughRoute(ctx, 'bio_colleague') // the members test's helper, as [M1] finds it; stepped up
      const listed = (await ctx.app.inject({ method: 'GET', url: `/v1/projects/${ctx.projectId}/tokens`, cookies: ctx.ownerCookies })).json()
      expect(listed.tokens.find((t: { id: string }) => t.id === theirs).revokedBy).toBe(ctx.userId)
      expect(await eventsOfType(ctx.db, ctx.projectId, 'token.revoked')).toHaveLength(1)
    })
  })
})
```

  *(`eventsOfType` is the helper `[M1]` finds the other event tests use; written with that name at the step.)* And
  `api/authz-contract.ts`'s row:

```ts
{
  // FE-11 (b) (Rich, 2026-10-13, beside (a)): the minter, an OWNER, or an administrator — members:manage, the authority that already
  // decides who works on the project. The fixture's token is the owner's, so the collaborator is the member who lacks it: 403. No step-up:
  // revoking is the safe direction.
  method: 'DELETE',
  url: '/v1/tokens/:tokenId',
  request: (f) => ({ url: `/v1/tokens/${f.tokenId}` }),
  expect: {
    owner: 'pass', collaborator: 403, stranger: 404, admin: 'pass', anonymous: 401,
    'token-capable': SESSION_ONLY, 'token-incapable': SESSION_ONLY, 'token-other-project': SESSION_ONLY, 'token-privileged': SESSION_ONLY,
  },
},
```

  *(`admin: 'pass'` as the matrix's other owner-capability rows read for an administrator, with the reason header those rows send — read at
  `[M1]`.)* **And the §26 measurement's literal list** (`authz-contract.ts:3089`, *"the 24 [M5] measured"*) **gains `revokeToken` — 25** —
  because the definition now declares `capability: 'members:manage'`, so the document declares `ADMIN_REASON_REQUIRED` on it and an
  administrator who is no member, without a reason, is answered it (BP-I5). Its test name and comment say 25, and why.

- [ ] **Step 2: Run them to verify they fail** — `pnpm exec vitest run --project unit src/api/tokens.test.ts src/api/authz-contract.test.ts`.
  Expected: the owner's revoke `404 NOT_FOUND`; no `token.revoked` type; the matrix's `collaborator` cell answers `404` where it now expects
  `403`; the §26 measurement still reads 24 — **and, once the capability is declared but before the list grows, it reads 25 answered where 24
  are declared in the literal** (red either way, which is the point: the declaration, the answer and the list move together).

- [ ] **Step 3: Implement**

`observability/events.ts`: `'token.revoked'` after `'token.minted'`, with its comment; `db/schema.ts`'s `events_type_known` gains it, and
`delegatedTokens` gains `revokedBy: uuid('revoked_by').references(() => users.id, { onDelete: 'restrict' })` (null on every row revoked
before it, and on a live one); `db:generate`; read the SQL (the column, and a DROP and ADD of the CHECK, nothing else). `toToken` answers
`revokedBy`.

`tokens/repository.ts`: `revokeTokenById(db, id, by)` — the update keyed on `id` and `revoked_at IS NULL` only, setting `revoked_at` and
`revoked_by`; `revokeToken(db, id, userId)` stays for any caller `[M1]` finds, or is removed if the route was its only one.
`revokeTokensOf(db, projectId, by)` and `revokeTokensOfMember(db, projectId, userId, by)` set `revoked_by` too, and their callers (the
archive and the removal, inside their own transactions) pass their actor.

`api/routes/tokens.ts`'s handler, replacing the minter check:

```ts
const actor = requireSession(request)
const notFound = () => new AuthorizationError('NOT_FOUND', `no token '${params.tokenId}'`)
const row = await tokenById(deps.db, params.tokenId)
if (row === undefined) throw notFound()
if (row.userId !== actor.userId) {
  // SCOPE FIRST (BP-M3): a stranger — and anybody, on a deleted project — reads the TOKEN's 404, as for an id that does not exist;
  // `assertCapability`'s own would name the project.
  const member = actor.platformRole === 'admin' || (await membershipOf(deps.db, actor.userId, row.projectId)) !== null
  if (!member || (await projectStateOf(deps.db, row.projectId)) === 'deleted') throw notFound()
  // THE MINTER ALWAYS; ANYONE ELSE AS THE PROJECT'S MEMBER-MANAGER (FE-11 (b), Rich 2026-10-13, beside (a); Decision 7): `members:manage`
  // is the owner's and the administrator's — a collaborator 403, and an administrator who is no member gives §26's reason (the
  // definition's `capability` declares it). No step-up: revoking is the safe direction. ONLY FOR A LIVE TOKEN: a revoked one goes
  // straight to the idempotent path below — which is how a retry ends the sessions a failed first attempt left live (this route's own
  // comment) — so on an archived project, whose archive revoked every token, an owner's revoke answers 200, never PROJECT_ARCHIVED.
  if (row.revokedAt === null) await assertCapability(deps.db, actor, row.projectId, 'members:manage')
}
```

*(`membershipOf` is `projects/authz.ts:576`'s; `projectStateOf` is the one-column read `[M1]` finds — `state.ts`'s, or `assertCapability`'s
own `select({ state })` lifted out.)*

and in the transaction, `revokeTokenById(tx, params.tokenId, actor.userId)` then, only when it changed a row (a second revoke records nothing):

```ts
await recordEvent(tx, {
  projectId: row.projectId,
  subject: `token:${row.id}`,
  type: 'token.revoked',
  machineDetail: { tokenId: row.id, tokenName: row.name, mintedBy: row.userId, revokedBy: actor.userId },
  humanMessage:
    row.userId === actor.userId
      ? `${await personName(tx, actor.userId)} revoked their delegated token '${row.name}'.`
      : `${await personName(tx, actor.userId)} revoked ${await personName(tx, row.userId)}'s delegated token '${row.name}'.`,
})
```

*(`recordEvent` inside the transaction and the bus announcement after commit, as the revoke's questions already are; `recordEvent` takes a
redactor as its third argument, `events.ts:303`, as the mint's `makeRedactor([])` — the function names are `[M1]`'s.)*
`observability/event-schemas.ts` gains, after `token.minted`'s:

```ts
/**
 * FE-11 (b) (the BYOA plan's Task 4): who revoked whose — the minter, an owner or an administrator, through `revokeToken`. A removal's and an
 * archive's revokes say so with `member.removed` and `project.archived`. The NAME because a reader holding a token cannot `listTokens`.
 */
'token.revoked': z
  .strictObject({
    tokenId: Uuid.describe('The token (`listTokens`).'),
    tokenName: z.string().describe('Its name, as its minter gave it.'),
    mintedBy: Uuid.describe('The person who minted it.'),
    revokedBy: Uuid.describe('The person who revoked it — its minter, an owner of the project, or a platform administrator.'),
  })
  .describe('A delegated token was revoked: it authenticates nothing from now on, and its open streams close.'),
```

The definition gains **`capability: 'members:manage'`** (Decision 7). The operation's `description`: *"…Its minter, an owner of the project,
or a platform administrator may revoke it — the minter's own revoke asserts no capability; a collaborator revoking another person's token is
answered `403 FORBIDDEN`, and anyone else `404 NOT_FOUND`, as for an id that does not exist. A token already revoked answers `200` as it
stands…"*; `errors` gains `FORBIDDEN` (`PROJECT_ARCHIVED` and `ADMIN_REASON_REQUIRED` are derived). `docs/api/events.md` gains `token.revoked`
in its table, and `pnpm docs:write` the reference.

- [ ] **Step 4: Run them to verify they pass**, then `src/api/members.test.ts` and `src/api/lifecycle.test.ts`: a removal and an archive
  revoke exactly as before (FE-11 (a) is unchanged), now stamping `revokedBy`, and publish no `token.revoked`.
- [ ] **Step 5: Negative controls** — (a) restore the minter-only check; predict the owner's-revoke case `404` and the matrix's `admin` cell
  `404` (the fixture's token is the owner's), red; watch; restore. (b) Drop the scope check (leave `assertCapability` to answer the
  stranger); predict the stranger's message case red — it names the project; restore.
- [ ] **Step 6: The mock, as one unit with the contract** (BP-I4): `revokedBy` on `TOKEN` (`null`) and on `REVOKED_TOKEN` (a user id);
  typecheck `@manifest/contract` and `@manifest/mock` together. **Tell the front end which typed fields arrived**: `Token.revokedBy: string |
  null` (required), the event type `token.revoked` with its detail, and who may revoke. **Commit.**

```bash
git add packages/control-plane/src/api/routes/tokens.ts packages/control-plane/src/tokens/repository.ts \
  packages/control-plane/src/observability/events.ts packages/control-plane/src/db/schema.ts packages/control-plane/drizzle/ \
  packages/control-plane/src/api/authz-contract.ts packages/control-plane/src/api/tokens.test.ts \
  packages/control-plane/src/observability/event-schemas.ts packages/control-plane/src/api/representations/tokens.ts \
  packages/contract/ packages/mock/src/fixtures.ts docs/api/events.md docs/api/reference/
# and the archive's and the removal's route files that now pass `by`, by name, as [M1] found them
git commit -m "feat(tokens): an owner or administrator may revoke any token on the project (FE-11 (b), beside (a)) — token.revoked names who revoked whose"
```

---

## Task 5: Manifest's own credentials in the secret scanner

**Files:**
- Modify: `packages/control-plane/src/build/secret-patterns.ts:22-58`, `build/testing.ts:16-29`
- Test: `packages/control-plane/src/build/secret-patterns.test.ts`, `source/pre-receive.test.ts` (unchanged cases, re-run), and a commit
  through the route in `api/source-commit.test.ts`

**Interfaces:**
- Consumes: `[M8]`'s narrowed rules, if any.
- Produces: two rules, `'a Manifest delegated token'` and `'a model key'`.

- [ ] **Step 1: Write the failing tests** — `build/testing.ts`'s `SAMPLE_SECRETS` gains (split so this file never holds a scannable one):

```ts
'a Manifest delegated token': 'mft' + '_0123456789abcdef0123456789abcdef_' + 'ZmFrZS1zZWNyZXQtZm9yLWEtdGVzdA',
'a model key': 'sk' + '-0123456789abcdefghijKLMN',
```

  (`secret-patterns.test.ts`'s *"Every rule in the list has a sample"* now fails, and *"catches every rule’s own sample"* fails for both.)
  And in `api/source-commit.test.ts`, the agent's configuration committed:

```ts
it('refuses an agent’s MCP configuration carrying its token, and writes nothing', async () => {
  await withProjectServer(async ({ app, db, projectId, userId, commitSha }) => {
    const { plaintext } = await mintTestToken(db, { userId, projectId, capabilities: ['project:read', 'source:write'] })
    const res = await app.inject({
      method: 'POST', url: `/v1/projects/${projectId}/commits`,
      headers: { authorization: `Bearer ${plaintext}`, 'idempotency-key': randomUUID() },
      payload: {
        baseCommit: commitSha, message: 'add my agent config',
        changes: [{ op: 'write', path: '.mcp.json', content: JSON.stringify({ mcpServers: { manifest: {
          type: 'http', url: 'https://app.manifest.internal/mcp', headers: { Authorization: `Bearer ${plaintext}` } } } }) }],
      },
    })
    expect(refusal(res)).toEqual({ status: 409, code: 'SOURCE_SECRET_DETECTED' })
    expect(res.body).not.toContain(plaintext)
  })
})
```

  *(The `changes` shape is `createCommit`'s as `[M1]` reads it.)*
- [ ] **Step 2: Run to verify they fail** — `pnpm exec vitest run --project unit src/build/secret-patterns.test.ts
  src/api/source-commit.test.ts`. Expected: the samples' cases red; the commit `201`.
- [ ] **Step 3: Implement** — after the GitHub fine-grained token's rule:

```ts
// MANIFEST'S OWN CREDENTIALS (the BYOA plan's Task 5): a delegated token's prefix was chosen so a leaked one is recognisable "in a log,
// a paste or a scanner" (tokens/token.ts), and an outside agent's MCP configuration carries one in a header — committed into the app,
// it would be stored and, on driver 2, pushed. A model key (`sk-…`: Manifest's LiteLLM keys, and OpenAI's and Anthropic's) is the
// same leak. `\b` before `sk` so `task-…` and `disk-…` never match; [M8] measured both rules against every repository on the laptop.
{ name: 'a Manifest delegated token', pattern: /\bmft_[0-9a-f]{32}_[A-Za-z0-9_-]{20,}/ },
{ name: 'a model key', pattern: /\bsk-[A-Za-z0-9_-]{20,}/ },
```

- [ ] **Step 4: Run to verify they pass**, then `src/source/pre-receive.test.ts` (driver 1's hook renders the list; its corpus gains the two
  samples through `SECRET_CORPUS` if `[M1]` finds it built from `SAMPLE_SECRETS`).
- [ ] **Step 5: Negative control** — drop the `\b` from the model-key rule; predict `task-0123456789abcdefghijKLMN` in a clean file matches
  (add that line to the clean-file assertion first); watch it red; restore.
- [ ] **Step 6: Commit.**

```bash
git add packages/control-plane/src/build/secret-patterns.ts packages/control-plane/src/build/testing.ts \
  packages/control-plane/src/build/secret-patterns.test.ts packages/control-plane/src/api/source-commit.test.ts
git commit -m "feat(build): Manifest's own credentials in the secret scanner — a delegated token and a model key, refused at commit, push and build"
```

---

## Task 6a: Toolkits served — a catalogue beside blueprints (FE-19), `cwl` and `models` first

**Files:**
- Create: `packages/control-plane/src/toolkits/{descriptor.ts,registry.ts,index.ts,toolkits.test.ts}`, `api/routes/toolkits.ts`,
  `api/representations/toolkits.ts`, `toolkits/cwl/toolkit.yaml`, `toolkits/cwl/agents/CWL.md`, `toolkits/models/toolkit.yaml`,
  `toolkits/models/agents/MODELS.md`
- Modify: `config.ts` (`MANIFEST_TOOLKITS_ROOT`), `index.ts` (load after blueprints), `api/server.ts` (`ServerDeps.toolkits`),
  `api/routes/index.ts`, `api/representations/blueprints.ts` (`Blueprint.toolkits`), `api/routes/blueprints.ts`, `api/authz-contract.ts`,
  `api/testing.ts` (`testDeps` loads the toolkits), `packages/mock/src/fixtures.ts` and the mock's server (the toolkit fixtures, the three
  operations' answers and `Blueprint.toolkits` on the blueprint fixtures — BP-I4, and BF's F7 sitting 4 starts against this commit's mock).
  **`blueprints/node-ts-mongo/agents/AGENTS.md` is NOT touched here** — Task 6b, gated (Decision 15; Rich's X1 (a)).

**Interfaces:**
- Consumes: `BlueprintRegistry` (`resolve`, `list`); `readTextTree`; `manifestSchema`; **FE-32's EFFECTIVE allowed set** — the file and the
  skeletons' direct dependencies, through FE-32's own loader as `[M1]` names it, never the file alone (BP-M7).
- Produces: `loadToolkits(root, blueprints, allowed): Promise<ToolkitRegistry>`; `ToolkitRegistry { list(); resolve(ref);
  knowledgePack(ref); forBlueprint(blueprintRef): string[] }`; operations `listToolkits`, `getToolkit`, `getToolkitKnowledgePack`;
  `Blueprint.toolkits: string[]`.

- [ ] **Step 1: Write the two toolkits' files.** `toolkits/cwl/toolkit.yaml`:

```yaml
# A TOOLKIT: what an app on a listed blueprint uses to reach one UBC system, and what it must declare to do so (FE-19).
toolkit: cwl
major_version: 1
summary: Sign people in with UBC's Campus-Wide Login, and read who they are.
packages:
  passport-ubcshib: 0.1.7-rc.1   # equal to node-ts-mongo@1's pinned_dependencies — the registry refuses a difference
blueprints: [node-ts-mongo@1]
declares:
  - path: auth.provider
    why: cwl — the platform registers the app with the IdP and injects its keys.
  - path: auth.attributes
    why: The attributes the app reads, and only those. An attribute not listed is never released to it.
example: |
  auth:
    provider: cwl
    attributes: [ubcEduCwlPuid, mail]
knowledge_pack: ./agents/
```

  `toolkits/models/toolkit.yaml`: `toolkit: models`, `summary: Ask a model — through the platform's gateway, charged to the app's own budget.`,
  `packages: { ubc-genai-toolkit-llm: 0.7.0 }`, the same `blueprints`, `declares: [{ path: ai.models, why: … }, { path: ai.budget, why: … }]`
  with an `example` the fixture manifest accepts (the exact `ai` block `[M1]` reads from `fixtures/`). The two packs: `CWL.md` carries the
  detail of `AGENTS.md`'s *Never write an origin into `auth.callback`* and *Never request an attribute outside `auth.attributes`*; `MODELS.md`
  the library's half of *AI: call `skeleton/ai/llm.js`* — which models a level allows, `ai.models`, the budget. **Until Task 6b the detail is
  in both packs**: `AGENTS.md` stays whole here, so the front end's building agent — which reads the blueprint's pack alone until F7's sitting
  4 — loses nothing (X1). The window is short and named; Task 6b ends it.

- [ ] **Step 2: Write the failing tests** — `toolkits/toolkits.test.ts`:

```ts
describe('the toolkit catalogue (FE-19)', () => {
  it('loads cwl and models, each working with node-ts-mongo@1, with a pack whose files carry their digest', async () => {
    const blueprints = await loadBlueprints(BLUEPRINTS_ROOT)
    const toolkits = await loadToolkits(TOOLKITS_ROOT, blueprints, allowedForTest())
    expect(toolkits.list().map((t) => `${t.toolkit}@${t.major_version}`).sort()).toEqual(['cwl@1', 'models@1'])
    expect(toolkits.forBlueprint('node-ts-mongo@1').sort()).toEqual(['cwl@1', 'models@1'])
    for (const file of toolkits.knowledgePack('cwl@1')!) expect(file.sha256).toBe(sha256(file.content))
  })

  it('refuses the boot for a package version that differs from the blueprint’s pin, naming both', async () => {
    const root = await scratchToolkit({ packages: { 'passport-ubcshib': '0.1.6' } })
    await expect(loadToolkits(root, await loadBlueprints(BLUEPRINTS_ROOT), allowedForTest())).rejects.toThrow(
      /passport-ubcshib.*0\.1\.6.*node-ts-mongo@1.*0\.1\.7-rc\.1/,
    )
  })

  it('refuses the boot for a package not on the allowlist', async () => {
    const root = await scratchToolkit({ packages: { 'left-pad': '1.3.0' } })
    await expect(loadToolkits(root, await loadBlueprints(BLUEPRINTS_ROOT), allowedForTest())).rejects.toThrow(/left-pad.*allow/)
  })

  it('declares only what the validator accepts: each example validates, and names every declared path', async () => {
    const toolkits = await loadToolkits(TOOLKITS_ROOT, await loadBlueprints(BLUEPRINTS_ROOT), allowedForTest())
    for (const t of toolkits.list()) {
      const merged = mergeManifest(FIXTURE_MANIFEST, parseYaml(t.example))
      expect(manifestSchema.safeParse(merged).success, t.toolkit).toBe(true)
      for (const d of t.declares) expect(hasPath(merged, d.path), `${t.toolkit}: ${d.path}`).toBe(true)
    }
  })

})
```

  *(`BLUEPRINTS_ROOT`, `TOOLKITS_ROOT`, `FIXTURE_MANIFEST`, `allowedForTest`, `scratchToolkit`, `mergeManifest` and `hasPath` are written in
  the test file itself, ten lines each; `allowedForTest` is FE-32's EFFECTIVE set, through its own loader (BP-M7) — the file alone would
  refuse `cwl` and `models`, whose packages are the skeleton's own dependencies and listed nowhere.)* And through the routes, in
  `api/blueprints.test.ts`'s neighbour `api/toolkits.test.ts`: `listToolkits` answers both; `getToolkit` answers `cwl@1` with `packages`,
  `blueprints`, `declares`, `example`; `getToolkitKnowledgePack` answers its files; an unknown ref `404 NOT_FOUND`; a delegated token may read
  all three; `getBlueprint('node-ts-mongo@1').toolkits` is `['cwl@1', 'models@1']`.
- [ ] **Step 3: Run to verify they fail** — `pnpm exec vitest run --project unit src/toolkits/toolkits.test.ts src/api/toolkits.test.ts`.
- [ ] **Step 4: Implement.** `toolkits/descriptor.ts` (zod 3, as `blueprints/descriptor.ts`):

```ts
export const toolkitDescriptorSchema = z
  .object({
    toolkit: z.string().regex(/^[a-z][a-z0-9-]{2,38}$/),
    major_version: z.number().int().positive(),
    summary: z.string().min(1).max(200),
    /** Exact versions, as a blueprint's pinned_dependencies are (C6). */
    packages: z.record(z.string().regex(/^\d+\.\d+\.\d+(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/)),
    blueprints: z.array(z.string().regex(/^[a-z][a-z0-9-]{2,38}@[1-9][0-9]*$/)).min(1),
    declares: z.array(z.object({ path: z.string().regex(/^[a-z][a-zA-Z0-9_.]*$/), why: z.string().min(1) }).strict()).min(1),
    example: z.string().min(1),
    knowledge_pack: z.string().min(1),
  })
  .strict()
export type ToolkitDescriptor = z.infer<typeof toolkitDescriptorSchema>
```

  `toolkits/registry.ts`'s `loadToolkits(root, blueprints, allowed)`: for each directory, parse `toolkit.yaml` (refuse
  `TOOLKIT_DESCRIPTOR_INVALID` naming the file); each `blueprints` ref must `resolve` (`TOOLKIT_BLUEPRINT_UNKNOWN`); each package must equal
  that blueprint's `pinned_dependencies[name]` where the blueprint pins it (`TOOLKIT_PACKAGE_MISMATCH`, naming package, both versions and the
  blueprint) and be on the allowlist (`TOOLKIT_PACKAGE_NOT_ALLOWED`); the pack read by `readTextTree` with `PACK_LIMITS`, each file with its
  sha256. Codes are boot refusals (`BlueprintLoadError`'s pattern), not API codes. `index.ts` loads it after the blueprints and before the
  server; a refusal stops the boot with the message.

  `api/routes/toolkits.ts` — three `defineRoute`s modelled on `blueprints.ts`'s (`tag: 'toolkits'`, any credential, `errors: ['NOT_FOUND']`
  on the two by-ref reads, examples captured from the test). `ToolkitKnowledgePack = { toolkit: string, files: KnowledgePackFile[] }`.
  `Blueprint.toolkits` from `deps.toolkits.forBlueprint(ref)`.
- [ ] **Step 5: Run to verify they pass**; then `src/api/authz-contract.test.ts` with the three reads' rows (every actor `pass` but
  `anonymous: 401`), `src/api/docs.test.ts`. **The mock, as one unit with the contract** (BP-I4): `Blueprint.toolkits` on every blueprint
  fixture, two toolkit fixtures and the three operations answered from them; typecheck `@manifest/contract` and `@manifest/mock` together.
- [ ] **Step 6: Negative controls** — (a) set `cwl`'s `passport-ubcshib` to `0.1.6`; predict the boot refusal; restore. (b) Delete
  `auth.attributes` from `cwl`'s `example`; predict the *declares only what the validator accepts* case red; restore.
- [ ] **Step 7: Tell the front end which typed fields arrived** — `Blueprint.toolkits: string[]` (required), `Toolkit`, `ToolkitList`,
  `ToolkitKnowledgePack`, the three operations — **and that its F7 sitting 4 may start from this commit**, against the mock or the platform.
  **Commit.**

```bash
git add packages/control-plane/src/toolkits/ packages/control-plane/src/api/routes/toolkits.ts \
  packages/control-plane/src/api/representations/toolkits.ts packages/control-plane/src/api/representations/blueprints.ts \
  packages/control-plane/src/api/routes/blueprints.ts packages/control-plane/src/api/routes/index.ts \
  packages/control-plane/src/api/server.ts packages/control-plane/src/api/testing.ts packages/control-plane/src/api/authz-contract.ts \
  packages/control-plane/src/api/toolkits.test.ts packages/control-plane/src/config.ts packages/control-plane/src/index.ts \
  toolkits/ packages/contract/ packages/mock/src/ docs/api/reference/
git commit -m "feat(toolkits): a toolkit catalogue beside blueprints (FE-19) — cwl and models, each with its pack, held to the blueprint's pins and the allowed set"
```

---

## Task 6b: The blueprint's pack points to its toolkits — GATED on F7's sitting 4

*Rich's X1 (a), `327ca2f`: this task waits for the front end's building agent to read each `Blueprint.toolkits` pack beside the blueprint's
(F7's new sitting 4). It runs at the open of sitting 8a, or at any earlier sitting's open once the gate holds; if it does not hold by 8a, 8a
runs with `AGENTS.md` whole and this task waits (Decision 15).*

**Files:**
- Modify: `blueprints/node-ts-mongo/agents/AGENTS.md`
- Test: `packages/control-plane/src/toolkits/toolkits.test.ts`

**Interfaces:**
- Consumes: Task 6a's packs (`toolkits/{cwl,models}/agents/*.md`), which already carry the detail.
- Produces: `AGENTS.md` with one line per moved rule and its pointer; no API change.

- [ ] **Step 0: The gate.** `git -C ~/Developer/manifest-app log --oneline main` carries F7's sitting 4 close-out commit, and F7's plan's
  sittings table marks its sitting 4 done; F7's Step 0 recorded the packs' combined size within its 24,000-character cap (blueprint first,
  then each toolkit in `Blueprint.toolkits` order). **If any of the three does not hold: stop, record it, and leave `AGENTS.md` whole.** Read
  only — never write to manifest-app.
- [ ] **Step 1: Write the failing test** — in `toolkits/toolkits.test.ts`:

```ts
it('keeps every moved rule in the blueprint’s pack as one line that points to its toolkit — and the detail only in the toolkit', async () => {
  const blueprints = await loadBlueprints(BLUEPRINTS_ROOT)
  const agents = blueprints.knowledgePack('node-ts-mongo@1')!.find((f) => f.path === 'AGENTS.md')!.content
  const toolkits = await loadToolkits(TOOLKITS_ROOT, blueprints, allowedForTest())
  const cwl = toolkits.knowledgePack('cwl@1')!.find((f) => f.path === 'CWL.md')!.content
  for (const heading of ['Never write an origin into `auth.callback`', 'Never request an attribute outside `auth.attributes`']) {
    expect(agents, heading).toContain(heading)
    expect(cwl, heading).toContain(heading)
  }
  expect(agents).toContain('toolkit `cwl`')
  expect(agents).toContain('toolkit `models`')
  // The detail lives once: CWL.md's paragraph under each heading is not repeated in AGENTS.md.
  expect(agents).not.toContain(firstParagraphUnder(cwl, 'Never write an origin into `auth.callback`'))
})
```

  *(`firstParagraphUnder` is five lines in the test file.)*
- [ ] **Step 2: Run it to verify it fails** — `pnpm exec vitest run --project unit src/toolkits/toolkits.test.ts`. Expected: the detail is in
  both packs.
- [ ] **Step 3: Slim `AGENTS.md`**: each library rule keeps its heading and first sentence, then *"— toolkit `cwl`'s knowledge pack
  (`getToolkitKnowledgePack`) has the rest"* (or `models`'); the skeleton's own sections (*The auth component: copy it*, the `llm.js` wiring,
  the `embed()` rule) stay whole.
- [ ] **Step 4: Run it to verify it passes**, then `src/blueprints/blueprints.test.ts` (the pack's digest moved) and `src/api/docs.test.ts`.
- [ ] **Step 5: Negative control** — restore one rule's paragraph to `AGENTS.md`; predict the *detail lives once* assertion red; restore.
- [ ] **Step 6: Tell the front end** that the blueprint's pack now points to its toolkits for CWL and models (its agent reads both since its
  sitting 4). **Commit.**

```bash
git add blueprints/node-ts-mongo/agents/AGENTS.md packages/control-plane/src/toolkits/toolkits.test.ts
git commit -m "docs(blueprints): node-ts-mongo's pack points to its toolkits for CWL and models — now that the front end's agent reads them (X1 (a))"
```

---

## Task 7: The MCP server's core — generated tools, the gate, the HTTP gates

**Files:**
- Create: `packages/mcp/package.json`, `tsconfig.json`, `src/operations.ts`, `src/schema.ts`, `src/call.ts`, `src/server.ts`, `src/http.ts`,
  `src/main.ts`, and `src/{operations,schema,call,http,server,boundary}.test.ts`
- Create (control plane): `packages/control-plane/src/api/alongside.ts` — **the tool rule's data, published** (X3, Decision 9)
- Modify: `eslint.config.js` (the boundary), `vitest.config.ts` / the `packages` project (if `[M1]` finds packages listed by name),
  `pnpm-lock.yaml` (by `pnpm install`), `packages/control-plane/src/api/contract/document.ts` and `document.test.ts`
  (`x-manifest-alongside`), `packages/contract/openapi.json` (regenerated)

**Interfaces:**
- Consumes: `@manifest/contract` (`createManifestClient`, `ManifestApiError`, `./openapi.json` — **its `x-manifest-alongside` entry for
  `/mcp`**); `@manifest/mock` (`createMockServer`, tests only); `[M2]`'s SDK paths; `[M3]`'s answer on the `401`'s header.
- Produces: `tokenOperations(document): ToolOperation[]`; `toolInputSchema(op, document): JsonSchema`; `callTool(client, op, args):
  Promise<CallToolResult>`; `createMcpServer({ apiOrigin, token, document }): Server`; `handleMcpRequest(req, res, options): Promise<void>`.

```ts
// src/operations.ts — the shape Task 8 and the gate share
export interface ToolOperation {
  operationId: string
  method: 'get' | 'post' | 'put' | 'patch' | 'delete'
  path: string
  summary: string
  description: string
  pathParams: string[]
  queryParams: string[]
  hasBody: boolean
  takesIdempotencyKey: boolean
}
```

- [ ] **Step 1: The package.** `packages/mcp/package.json`: `"name": "@manifest/mcp"`, `"private": true`, `"type": "module"`, scripts
  `build: tsc`, `typecheck: tsc --noEmit`, `start: node dist/main.js`; dependencies `@manifest/contract: workspace:*` and
  `@modelcontextprotocol/sdk: <[M2]'s exact version>`; devDependencies `@manifest/mock: workspace:*`. `pnpm install` (the SDK and its
  dependencies through the registry — Rich's network, or already in the store from `[M2]`); **record what it added to the lockfile**.
- [ ] **Step 1a: The rule's data, in the document** (X3; agreed with BF, which derives its read tools from the same entry).
  `packages/control-plane/src/api/alongside.ts`:

```ts
/**
 * Endpoints served on the API's origins by ANOTHER PROCESS (the BYOA plan's Decision 9) — so the contract says they exist, as D23.8 asks
 * of everything outside /v1, without claiming the control plane serves them (`versioning.test.ts` holds UNVERSIONED to its own). The MCP
 * entry carries THE TOOL RULE'S DATA (Decision 10, cross-plan X3): a tool is an operation whose security admits a delegated token, that is
 * not a WebSocket and not in `notTools` — plus `composites`. The MCP server, its gate and the front end's read-tool test all read it here.
 */
export const ALONGSIDE = [
  {
    method: 'POST',
    path: '/mcp',
    servedBy: 'manifest-mcp',
    why: 'The Model Context Protocol endpoint: every operation a delegated token may call, as tools for an agent, with the guides and knowledge packs as resources. Its versioning is the protocol’s own. A delegated token as Authorization: Bearer, and no Origin header.',
    notTools: [
      { operationId: 'streamProjectEvents', why: 'A WebSocket: a tool call is one request and one answer. waitForBuild reads this stream on the agent’s behalf.' },
      { operationId: 'startAgentSession', why: 'It answers a model key — a credential that would sit in the agent’s model context. An agent connected over MCP thinks with its own provider.' },
      { operationId: 'getOpenApiDocument', why: 'It answers the whole contract, about 1.2 MB — past what a client passes to a model; every operation is already a tool with its own schema.' },
    ],
    composites: [
      { name: 'waitForBuild', readOnly: true, why: 'Waits on the project’s event stream for one build to succeed or fail, bounded; answers the build as it stands.' },
      { name: 'waitForPerson', readOnly: true, why: 'Waits for a person to answer a pending action, bounded; answers it as it stands.' },
    ],
  },
] as const
```

  written into the document as `'x-manifest-alongside'` beside `x-manifest-unversioned` (`document.ts:525`); `document.test.ts` holds the
  document's entry equal to `ALONGSIDE`, **and every `notTools` id to an operation the document declares and a delegated token may call** (an
  exception for an operation that no longer exists, or that a token could never call, is a stale line). Then `pnpm contract:write`.

- [ ] **Step 2: The gate and the boundary — failing tests.** `src/operations.test.ts`:

```ts
import document from '@manifest/contract/openapi.json' with { type: 'json' }
import { describe, expect, it } from 'vitest'
import { compositesOf, notToolsOf, tokenOperations } from './operations.js'

/**
 * THE GATE (§22: MCP is a client of the published contract, as the console is): every operation a delegated token may call is a tool,
 * and nothing else is — derived from the document's own `security`, never listed by hand. A new token operation becomes a tool by
 * construction; a new session-only one never does. The exceptions are the DOCUMENT's (`x-manifest-alongside`'s `notTools`, X3), each with
 * a reason a reader can check — the same list the front end's read-tool test reads.
 */
describe('the tools are the token’s operations', () => {
  it('derives exactly the operations whose security admits a delegated token, less the WebSocket', () => {
    const admitted = Object.values(document.paths).flatMap((methods) =>
      Object.values(methods as Record<string, { operationId?: string; security?: unknown[] }>)
        .filter((o) => o.operationId !== undefined)
        .filter((o) => (o.security ?? document.security).some((s) => 'delegatedToken' in (s as object)))
        .map((o) => o.operationId!),
    )
    const excepted = new Set(notToolsOf(document).map((n) => n.operationId))
    expect(tokenOperations(document).map((o) => o.operationId).sort()).toEqual(admitted.filter((id) => !excepted.has(id)).sort())
  })
  it('excepts exactly the three the document names, each with a reason', () => {
    expect(notToolsOf(document).map((n) => n.operationId).sort()).toEqual(['getOpenApiDocument', 'startAgentSession', 'streamProjectEvents'])
    for (const n of notToolsOf(document)) expect(n.why.length, n.operationId).toBeGreaterThan(20)
  })
  it('never makes a session-only operation a tool', () => {
    const names = tokenOperations(document).map((o) => o.operationId)
    for (const id of ['mintToken', 'createProject', 'getMe', 'approveRelease', 'runRehearsal', 'revokeToken'])
      expect(names).not.toContain(id)
  })
  it('adds only the two composites the document names', () =>
    expect(compositesOf(document).map((c) => c.name)).toEqual(['waitForBuild', 'waitForPerson']))
})
```

  `src/boundary.test.ts`: every `import … from '…'` in `src/**/*.ts` (tests excepted) is `@manifest/contract`, `@manifest/contract/openapi.json`,
  `@modelcontextprotocol/sdk/…`, `node:…` or `./…` — the console's scanner, copied (its comment says why it is copied, not imported).
  `eslint.config.js` gains the matching `no-restricted-imports` block for `packages/mcp/src/**/*.ts`.
- [ ] **Step 3: Run to verify they fail** — `pnpm exec vitest run --project packages packages/mcp/src/operations.test.ts
  packages/mcp/src/boundary.test.ts`.
- [ ] **Step 4: Implement `operations.ts`.**

```ts
/** The published document, as much of it as the server reads. `components.schemas` is what a tool's `$ref`s are inlined from. */
export type Doc = {
  info: { version: string }
  security: Record<string, unknown>[]
  paths: Record<string, Record<string, RawOperation>>
  components: { schemas: Record<string, unknown> }
  'x-manifest-alongside'?: Alongside[]
}
export type RawOperation = {
  operationId?: string; summary?: string; description?: string; security?: Record<string, unknown>[]
  parameters?: { name: string; in: 'path' | 'query' | 'header'; required?: boolean; description?: string; schema?: Record<string, unknown> }[]
  requestBody?: { required?: boolean; content: Record<string, { schema: unknown }> }
  'x-manifest-websocket'?: unknown
}

type Alongside = { path: string; notTools: { operationId: string; why: string }[]; composites: { name: string; readOnly: boolean; why: string }[] }

/** The `/mcp` entry of the document's `x-manifest-alongside` (X3): the exceptions and the composites, the document's — never this package's. */
function mcpEntry(document: Doc): Alongside {
  const entry = (document['x-manifest-alongside'] ?? []).find((e) => e.path === '/mcp')
  if (entry === undefined) throw new Error('the contract declares no /mcp in x-manifest-alongside: this server and that document disagree')
  return entry
}
export const notToolsOf = (document: Doc) => mcpEntry(document).notTools
export const compositesOf = (document: Doc) => mcpEntry(document).composites

export function tokenOperations(document: Doc): ToolOperation[] {
  const excepted = new Set(notToolsOf(document).map((n) => n.operationId))
  const out: ToolOperation[] = []
  for (const [path, methods] of Object.entries(document.paths)) {
    for (const [method, op] of Object.entries(methods)) {
      if (op.operationId === undefined || excepted.has(op.operationId) || op['x-manifest-websocket'] !== undefined) continue
      const security = op.security ?? document.security
      if (!security.some((s) => 'delegatedToken' in s)) continue
      const params = op.parameters ?? []
      out.push({
        operationId: op.operationId,
        method: method as ToolOperation['method'],
        path,
        summary: op.summary ?? op.operationId,
        description: op.description ?? '',
        pathParams: params.filter((p) => p.in === 'path').map((p) => p.name),
        queryParams: params.filter((p) => p.in === 'query').map((p) => p.name),
        hasBody: op.requestBody !== undefined,
        takesIdempotencyKey: params.some((p) => p.in === 'header' && p.name === 'Idempotency-Key'),
      })
    }
  }
  return out.sort((a, b) => a.operationId.localeCompare(b.operationId))
}
```

- [ ] **Step 5: Run the gate — it passes; state the tool count** (46 at contract `1.9.0` — 49 a token may call, less the three exceptions —
  plus whatever B, FE-32 and Tasks 2–6a added).
- [ ] **Step 6: The input schema — failing test, then implementation.** `src/schema.test.ts`: `createCommit`'s schema has `projectId`
  required, `body` required with `baseCommit` inside, `idempotencyKey` optional, **no `$ref` pointing outside the schema** (every `$ref`
  starts `#/$defs/` and each target exists), and no `Manifest-Admin-Reason`; a fabricated operation with a path parameter named `body` is
  refused. Implementation (`src/schema.ts`):

```ts
export function toolInputSchema(op: ToolOperation, document: Doc): Record<string, unknown> {
  const raw = document.paths[op.path]![op.method]!
  const properties: Record<string, unknown> = {}
  const required: string[] = []
  for (const p of raw.parameters ?? []) {
    if (p.in === 'header') continue // Idempotency-Key becomes idempotencyKey below; Manifest-Admin-Reason is never a token's
    if (p.name === 'body' || p.name === 'idempotencyKey') throw new Error(`${op.operationId}: a parameter named ${p.name} would collide`)
    properties[p.name] = { ...p.schema, description: p.description }
    if (p.required) required.push(p.name)
  }
  if (op.hasBody && raw.requestBody !== undefined) {
    // Every request body the contract declares is JSON; one that is not would be a tool this server cannot send, so it says so.
    const json = raw.requestBody.content['application/json']
    if (json === undefined) throw new Error(`${op.operationId}: a request body that is not JSON`)
    properties.body = json.schema
    if (raw.requestBody.required === true) required.push('body')
  }
  if (op.takesIdempotencyKey)
    properties.idempotencyKey = { type: 'string', minLength: 8, description: 'Send the same key to retry this action safely; one is made for you when absent.' }
  return inlineRefs({ type: 'object', properties, required, additionalProperties: false }, document.components.schemas)
}

/** Every `#/components/schemas/X` becomes `#/$defs/X`, and each X it reaches — transitively — is copied under `$defs`. */
export function inlineRefs(schema: Record<string, unknown>, components: Record<string, unknown>): Record<string, unknown> {
  const defs: Record<string, unknown> = {}
  const rewrite = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(rewrite)
    if (node === null || typeof node !== 'object') return node
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(node)) {
      if (k === '$ref' && typeof v === 'string' && v.startsWith('#/components/schemas/')) {
        const name = v.slice('#/components/schemas/'.length)
        if (!(name in defs)) { defs[name] = {}; defs[name] = rewrite(components[name]) }
        out.$ref = `#/$defs/${name}`
      } else out[k] = rewrite(v)
    }
    return out
  }
  const root = rewrite(schema) as Record<string, unknown>
  return Object.keys(defs).length === 0 ? root : { ...root, $defs: defs }
}
```

- [ ] **Step 7: The call — failing tests, then implementation.** `src/call.test.ts`, with the contract client over a FAKE `fetch` (no
  network, no mock): `getTree({ projectId })` sends `GET /v1/projects/<id>/tree` with `authorization: Bearer <t>` and answers `{ content: [{
  type: 'text', text }], structuredContent }`; `createCommit({ projectId, body })` sends an `Idempotency-Key` it made and the body;
  `createCommit({ …, idempotencyKey: 'k-12345678' })` sends exactly that; **a `403 TOKEN_ACTION_PENDING` envelope becomes `{ isError: true,
  structuredContent: envelope }` with the code, message and hint in the text and `pendingAction` in the structured content**; a `401` the
  same; and **the token is in no field of any result** (`JSON.stringify(result)` does not contain it). Implementation (`src/call.ts`):

```ts
import { idempotencyKey as makeKey, ManifestApiError, unwrap, type ManifestClient } from '@manifest/contract'

type Dynamic = Record<string, (path: string, init: Record<string, unknown>) => Promise<{ data?: unknown; error?: unknown; response: Response }>>

export async function callTool(client: ManifestClient, op: ToolOperation, args: Record<string, unknown>) {
  const pick = (names: string[]) => Object.fromEntries(names.filter((n) => args[n] !== undefined).map((n) => [n, args[n]]))
  const init = {
    params: { path: pick(op.pathParams), query: pick(op.queryParams) },
    ...(op.hasBody && args.body !== undefined ? { body: args.body } : {}),
    ...(op.takesIdempotencyKey
      ? { headers: { 'idempotency-key': typeof args.idempotencyKey === 'string' ? args.idempotencyKey : makeKey() } }
      : {}),
  }
  try {
    const verb = op.method.toUpperCase()
    const data = unwrap(await (client as unknown as Dynamic)[verb]!(op.path, init), op.operationId)
    return answer(data)
  } catch (error) {
    if (!(error instanceof ManifestApiError)) throw error
    const envelope = error.envelope ?? { error: { code: 'UNKNOWN', message: `HTTP ${error.status}`, hint: '' } }
    const { code, message, hint } = envelope.error
    return {
      isError: true,
      content: [{ type: 'text' as const, text: `${error.status} ${code}: ${message}${hint ? `\nWhat to do: ${hint}` : ''}` }],
      structuredContent: envelope as unknown as Record<string, unknown>,
    }
  }
}

function answer(data: unknown) {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
  return {
    content: [{ type: 'text' as const, text }],
    ...(data !== null && typeof data === 'object' && !Array.isArray(data) ? { structuredContent: data as Record<string, unknown> } : {}),
  }
}
```

- [ ] **Step 8: The server and the HTTP gates — failing tests, then implementation.** `src/http.test.ts` drives `handleMcpRequest` over a
  real `node:http` server on port 0 (no edge, no platform), with the API origin pointed at an unreachable address so any API call fails the
  test: a `POST /mcp` with no `authorization` → `401` (with or without `www-authenticate: Bearer`, as `[M3]` decided — Decision 21) and no
  API call; with a session cookie and no bearer → `401`; with `authorization: Bearer not-a-manifest-token` → `401` (only `mft_…` is
  forwarded); with **any** `origin` header → `403`; a `GET` → `405`; any path but `/mcp` → `404`; **an `initialize` whose one check read the
  fake API answers `401` → HTTP `401`, and no tool list** (BP-M9, Review Focus 8). `src/server.test.ts` drives it with the SDK's own
  `Client` against **`createMockServer()`** on port 0: `listTools` answers the gate's names plus the composites (Task 8 adds those; until
  then the gate's names), each with `inputSchema` and **hints that claim only what is true** (BP-I8, Decision 19): `getTree` `readOnlyHint:
  true, idempotentHint: true`; **`deploy` and `createCommit` with neither, and `destructiveHint` never `false`**; `clearAppSecret` likewise;
  `callTool('getProject', { projectId: PROJECT_ID })` answers the mock's fixture; **every tool called once with its mock fixture's arguments,
  and no result matching `\bsk-[A-Za-z0-9_-]{20,}` or the caller's token** (BP-I6, Decision 12); **a log spy over `console.*` sees the token in
  no line**.

  `src/server.ts` (the SDK's low-level `Server`, so each tool's JSON Schema goes out as the document has it — `[M2]`'s paths):

```ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { createManifestClient } from '@manifest/contract'

/** What every request's server is built from; the token is added per request and never kept. `bearerChallenge` is `[M3]`'s answer. */
export type McpOptions = { apiOrigin: string; document: Doc; version: string; waitSeconds: number; bearerChallenge: boolean }

export function createMcpServer(options: McpOptions & { token: string }): Server {
  const operations = tokenOperations(options.document)
  const byName = new Map(operations.map((op) => [op.operationId, op]))
  const client = createManifestClient({ origin: options.apiOrigin, token: options.token })
  const server = new Server({ name: 'manifest', version: options.version }, { capabilities: { tools: {} } })
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: operations.map((op) => ({
      name: op.operationId,
      title: op.summary,
      description: op.description,
      inputSchema: toolInputSchema(op, options.document),
      // ONLY WHAT IS TRUE (Decision 19; BP-I8): a read is read-only and idempotent; a write claims nothing — MCP's default for a tool
      // that is not read-only is destructive, and `deploy`, `setAppSecret` and `createCommit` each replace something. Never
      // `destructiveHint: false`, and never `idempotentHint` on a write, which a fresh server-made key per call would make untrue.
      annotations: op.method === 'get' ? { readOnlyHint: true, idempotentHint: true } : { readOnlyHint: false },
    })),
  }))
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const op = byName.get(request.params.name)
    if (op === undefined) return { isError: true, content: [{ type: 'text', text: `No tool '${request.params.name}'.` }] }
    return callTool(client, op, (request.params.arguments ?? {}) as Record<string, unknown>)
  })
  return server
}
```

  `src/http.ts`:

```ts
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createManifestClient } from '@manifest/contract'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createMcpServer, type McpOptions } from './server.js'

const TOKEN = /^Bearer (mft_[0-9a-f]{32}_[A-Za-z0-9_-]+)$/

// McpOptions and createMcpServer are server.ts's.
export async function handleMcpRequest(req: IncomingMessage, res: ServerResponse, options: McpOptions): Promise<void> {
  const refuse = (status: number, message: string, extra: Record<string, string> = {}) => {
    res.writeHead(status, { 'content-type': 'application/json', ...extra })
    res.end(JSON.stringify({ error: { message } }))
  }
  if (new URL(req.url ?? '/', 'http://x').pathname !== '/mcp') return refuse(404, 'Not here: the MCP endpoint is /mcp.')
  // NO BROWSER IS A CLIENT OF THIS SERVER (MCP's guidance on DNS rebinding; the BYOA design's §2): an Origin header means one is.
  if (req.headers.origin !== undefined) return refuse(403, 'A browser may not call this endpoint.')
  if (req.method !== 'POST') return refuse(405, 'This server answers POST only; it starts no stream of its own.', { allow: 'POST' })
  // A DELEGATED TOKEN, OR NOTHING. A session cookie is never read and never forwarded (D24: MCP is a token holder).
  const token = TOKEN.exec(req.headers.authorization ?? '')?.[1]
  // THE 401's HEADER FOLLOWS [M3] (Decision 21): kept only if Claude Code does not start OAuth discovery from it.
  const unauthenticated = () =>
    refuse(401, 'Send a live Manifest delegated token as Authorization: Bearer mft_…', options.bearerChallenge ? { 'www-authenticate': 'Bearer' } : {})
  if (token === undefined) return unauthenticated()
  const body = await readJson(req, 1024 * 1024) // bounded; a body past it is 413
  // "CONNECTED" ONLY WITH A LIVE TOKEN (Decision 21; BP-M9): an `initialize` makes one cheap read with the bearer first, so a wrong or
  // revoked token never sees a tool list. Every other request meets the API's own 401 on its first call.
  if (isInitialize(body) && !(await tokenIsLive(options.apiOrigin, token))) return unauthenticated()
  const server = createMcpServer({ ...options, token })
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  res.on('close', () => { void transport.close(); void server.close() })
  await server.connect(transport)
  await transport.handleRequest(req, res, body)
}

/** A JSON-RPC body, or a batch, that carries `initialize`. */
const isInitialize = (body: unknown): boolean =>
  (Array.isArray(body) ? body : [body]).some((m) => (m as { method?: unknown } | null)?.method === 'initialize')

/** One `listProjects` with the bearer: `401` means the token is wrong, expired or revoked; anything else, it is live. */
async function tokenIsLive(apiOrigin: string, token: string): Promise<boolean> {
  const { response } = await createManifestClient({ origin: apiOrigin, token }).GET('/v1/projects')
  return response.status !== 401
}
```

  `readJson(req, limit)` is fifteen lines in `http.ts` (collect chunks to the limit, `413` past it, `400` for JSON that does not parse).
  `src/main.ts`: reads `MANIFEST_MCP_PORT` (default 7113), `MANIFEST_MCP_API_ORIGIN` (default `https://app.manifest.internal`),
  `MANIFEST_MCP_WAIT_SECONDS` (default `[M6]`'s bound, else 60) and `MANIFEST_MCP_BEARER_CHALLENGE` (default `[M3]`'s answer), the
  document from `@manifest/contract/openapi.json`; `http.createServer` on `127.0.0.1`; `GET /__doctor` → `{ "name": "manifest-mcp",
  "contract": <info.version> }`; everything else to `handleMcpRequest`; **one operator line per request — method, status, the tool's name
  if any, never a header value**; a thrown error is `500` with its message on `console.error` (never `.catch(() => undefined)`).
- [ ] **Step 9: Run every `packages/mcp` test; they pass.** Then `pnpm typecheck` (the package joins the workspace's typecheck) and `pnpm
  lint`.
- [ ] **Step 10: Negative controls** — (a) delete the `Origin` check; predict `http.test.ts`'s origin case red; restore. (b) Make
  `tokenOperations` include every operation; predict the gate red naming `mintToken`; restore. (c) **Put the request's `authorization`
  header into `main.ts`'s per-request operator line** (BP-I3: the `/__doctor` body holds no token, and the spy reads `console.*`); predict
  `server.test.ts`'s log spy red; restore. **(d) Put it into `callTool`'s refusal text**; predict `call.test.ts`'s *token in no field* red;
  restore. **(e) Drop `getOpenApiDocument` from `ALONGSIDE`'s `notTools`**; predict the gate's *excepts exactly the three* red; restore.
- [ ] **Step 11: Tell the front end** that `x-manifest-alongside` has landed with `notTools` and `composites` (X3: its read-tool test reads
  it from this commit). **Commit.**

```bash
git add packages/mcp/ eslint.config.js pnpm-lock.yaml packages/control-plane/src/api/alongside.ts \
  packages/control-plane/src/api/contract/document.ts packages/control-plane/src/api/contract/document.test.ts packages/contract/openapi.json
git commit -m "feat(mcp): Manifest as MCP tools — every operation a delegated token may call but the three the contract excepts, held to it; bearer only, no browser"
```

---

## Task 8: What reaches it — composites, resources, instructions, the edge, doctor and verify

**Files:**
- Create: `packages/mcp/src/composites.ts`, `src/resources.ts`, `src/instructions.ts`, their tests
- Modify: `packages/mcp/src/server.ts`, `infra/caddy/Caddyfile` (both sites), `infra/lib/common.sh` (`PORT_MCP=7113`), `scripts/doctor.sh`
  (the marker), `scripts/verify.sh` (the edge check), `scripts/ci-acceptance.sh` (`EXPECT_DOCTOR`/`EXPECT_VERIFY` if they move — their
  one place), `docs/superpowers/RUNBOOK.md` (*Running the MCP server*)

**Interfaces:**
- Consumes: Task 7's `createMcpServer`; `subscribe` from `@manifest/contract`; `[M3]`/`[M6]`'s bound.
- Produces: tools `waitForBuild({ projectId, buildId, seconds? })` → `{ done, build, lastLines }`; `waitForPerson({ pendingActionId,
  seconds? })` → `{ done, pendingAction }`; resources `manifest://docs/{slug}`, `manifest://blueprints/{ref}/{path}`,
  `manifest://toolkits/{ref}/{path}` — **no OpenAPI resource** (Decision 20); `instructions`.

- [ ] **Step 1: Failing tests.** `composites.test.ts`, over the fake fetch and a scripted stream (the mock's `scripted` helper or a fake
  `subscribe`): `waitForBuild` answers `{ done: true, build }` when `build.succeeded` arrives for that build and ignores another build's;
  **answers at once, without subscribing, when the build has ALREADY ended** (the replay may not hold its end); **answers `{ done: false }`
  for a build still `pending` at the bound — never `done: true` for `pending`** (BP-I7); answers `{ done: false, build }` at the bound,
  having said nothing wrong; never waits longer than `MANIFEST_MCP_WAIT_SECONDS`; **when the
  stream closes `4401` (the token revoked mid-wait) answers at once, a tool error `401 UNAUTHENTICATED` — never a wait to the bound**;
  `waitForPerson` answers `{ done: true, pendingAction }` once `getPendingAction` reads `confirmed`, `{ done: false }` at the bound.
  `resources.test.ts` against the mock: `resources/list` names `manifest://docs/agents` and the blueprint's pack files; `resources/read` of
  `manifest://docs/agents` answers its markdown; of a toolkit file, its content and `mimeType: text/markdown`; **no resource names the
  OpenAPI document** (Decision 20). `server.test.ts` gains: the initialize answer carries `instructions` mentioning `agents` and
  `listProjects`; `tools/list` ends with the two composites, each `readOnlyHint: true`.
- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement.** `composites.ts`:

```ts
/** The request's own: its origin, its token (for the stream), and the bound from `MANIFEST_MCP_WAIT_SECONDS` (Decision 14). */
export type WaitOptions = { apiOrigin: string; token: string; waitSeconds: number }

export async function waitForBuild(client: ManifestClient, options: WaitOptions, args: { projectId: string; buildId: string; seconds?: number }) {
  const read = async () =>
    unwrap(await client.GET('/v1/builds/{buildId}', { params: { path: { buildId: args.buildId } } }), 'getBuild')
  // ENDED MEANS SUCCEEDED OR FAILED (BP-I7) — never "not running": a build queued behind another app's on the one builder is `pending`.
  const ended = (build: { status: string }) => build.status === 'succeeded' || build.status === 'failed'
  // READ FIRST: a build that ended before this call is answered at once — the stream's replay may not hold its end.
  const before = await read()
  if (ended(before)) return answer({ done: true, build: before })
  const bound = Math.min(args.seconds ?? options.waitSeconds, options.waitSeconds) * 1000
  await new Promise<void>((resolve) => {
    const subscription = subscribe({
      origin: options.apiOrigin,
      token: options.token,
      projectId: args.projectId,
      onFrame: (frame) => {
        if (frame.kind === 'event' && (frame.type === 'build.succeeded' || frame.type === 'build.failed') && frame.subject === `build:${args.buildId}`)
          subscription.close()
      },
    })
    // Whatever ends it — the build's end, the bound, or a revoke's `4401` (FE-33) — ends the wait; the re-read below then answers, and for a
    // revoked token that re-read is the API's `401`, a tool error.
    void subscription.closed.then(() => resolve())
    setTimeout(() => subscription.close(), bound).unref()
  })
  const build = await read()
  const done = ended(build)
  return answer({ done, build, ...(done ? {} : { next: 'Not finished. Call waitForBuild again.' }) })
}
```

  *(`subscribe`'s options and `Subscription.closed` are `stream.ts`'s (*Read this first* 28); the frame's `kind`, `type` and `subject` are
  `EventFrame`'s. The answer re-reads the build rather than trusting the frame, so a frame missed across a reload costs nothing; a `401` on
  the re-read is thrown as `ManifestApiError` and answered by `callTool`'s refusal mapping, which wraps both composites.)* `waitForPerson`
  polls `getPendingAction` every 3 s to the bound. `instructions.ts`:

```ts
export const INSTRUCTIONS = [
  'You are working on one Manifest project with a delegated token. Before your first change:',
  '1. Read the agents guide (resource manifest://docs/agents, or getDoc with slug "agents").',
  '2. listProjects — your token sees exactly one project, so you need no id — then getBlueprint for its blueprint, getKnowledgePack, and',
  '   getToolkitKnowledgePack for each toolkit the blueprint names.',
  'Then work in the loop: getTree → createCommit with dryRun → createCommit → startBuild → waitForBuild → createRelease → deploy → read the result.',
  'Switch on an error’s code, never its message. Some actions wait for a person: TOKEN_ACTION_PENDING carries the question — tell your person what you asked and why, then waitForPerson.',
  'Never put a credential in a file or a commit — your own configuration included — and never read your own configuration: it holds your token.',
].join('\n')
```

  `resources.ts`: `ListResourcesRequestSchema` → `listDocs` + each blueprint's pack files + each toolkit's — **and no OpenAPI document**
  (Decision 20); `ReadResourceRequestSchema` → the matching read, `mimeType` from the file's `mediaType`. `server.ts` registers both composites (with input schemas written by hand,
  `annotations: { readOnlyHint: true }`), resources, and `instructions` (`[M2]`'s option name).

  **The edge** — in both `console.manifest.internal` and `app.manifest.internal`, after the `@api` handler and before the catch-all, inside
  `route`:

```caddyfile
		# THE MCP SERVER (the BYOA plan's Task 8): a host process on 7113 — Manifest as tools for an agent the platform did not
		# write. Bearer only; it refuses any request carrying Origin. Behind the same @outside guard as the API. A 502 means
		# nothing listens on 7113.
		@mcp path /mcp
		reverse_proxy @mcp host.docker.internal:7113
```

  `infra/lib/common.sh`: `PORT_MCP=7113` with its comment. `scripts/doctor.sh`: `mcp_is_ours()` — `curl -sS -m 2
  http://127.0.0.1:$PORT_MCP/__doctor` contains `"name":"manifest-mcp"` — joined to the host processes it already names; nothing listening
  is tolerated as 7104's is. `scripts/verify.sh`: **`POST https://app.manifest.internal/mcp` with no bearer answers `401` with the MCP
  server's own body** (`Send a live Manifest delegated token…` — the body, not the status, since a `401` is not proof of who answered) when
  7113 is ours (proving the edge reaches it), and is reported `NOT RUN` when it is not. Their counts move
  in `ci-acceptance.sh`'s `EXPECT_` lines, their one place.

  RUNBOOK gains *Running the MCP server*: `pnpm --filter @manifest/mcp build && NODE_EXTRA_CA_CERTS="$PWD/infra/ca/manifest-root.crt"
  MANIFEST_MCP_API_ORIGIN=https://app.manifest.internal node packages/mcp/dist/main.js`, what a `502` means, how to stop it.
- [ ] **Step 4: Run every test; they pass.** Then, **through the edge** (7100 granted, 7113 started): `make doctor`, `make verify`; and the
  SDK's client against `https://app.manifest.internal/mcp` and `https://console.manifest.internal/mcp` with a token minted for a fixture
  project — `tools/list` answers on both; quote the count. **And real Claude Code, in a THROWAWAY configuration** (X2, Decision 22:
  `CLAUDE_CONFIG_DIR` under the scratchpad, removed after; Rich's `~/.claude.json` byte-identical before and after) — and Codex, if `[M4]`
  found it, in a throwaway `CODEX_HOME`: `claude mcp add --transport http manifest https://app.manifest.internal/mcp --header "Authorization:
  Bearer $MANIFEST_TOKEN"`, with and without `NODE_EXTRA_CA_CERTS`; **`createCommit` with `dryRun: true` called** (BP-M10: its schema
  carries `$defs`, which a client or its provider may refuse where a path-only read would pass); the result and the CA answer written into
  Task 1's quotable block, which the front end re-reads. *(The network: Claude Code sends Anthropic the fixture project's tool list and
  answers — Rich's yes, What Rich does 3.)*
- [ ] **Step 5: The Docker tier** (owed: `infra/`), in the background, alone.
- [ ] **Step 6: Negative controls** — (a) remove `@mcp` from `app.`'s site; predict `make verify`'s MCP check red and `/mcp` answered by
  7105; restore (the edge's config is reloaded either way — say so to anyone watching streams). (b) Set `waitForBuild`'s bound to ten
  minutes; predict the composites test's bound case red; restore. (c) Restore `done = status !== 'running'`; predict the `pending` case red
  (BP-I7); restore.
- [ ] **Step 7: Tell the front end** (`/mcp` served through the edge on both origins; Task 1's quotable block corrected — its F7 sitting 5
  waits for exactly this). **Commit.**

```bash
git add packages/mcp/src/ infra/caddy/Caddyfile infra/lib/common.sh scripts/doctor.sh scripts/verify.sh \
  scripts/ci-acceptance.sh docs/superpowers/RUNBOOK.md docs/superpowers/spikes/byoa-baseline/README.md
git commit -m "feat(mcp): waitForBuild and waitForPerson, the guides and packs as resources, instructions — and /mcp through the edge on app. and console."
```

---

## Task 9: The clients — the guides, the mock's switch and its scripted frame, the front end told

*Since BR's review (BP-I4) each contract change carried its own mock fixtures (Tasks 2, 3, 4, 6a). This task keeps what is not a typed
field: the guides, the mock's quota switch, and its scripted `token.revoked` frame (X5, agreed with BF).*

**Files:**
- Modify: `packages/mock/src/` — `TOKEN_QUOTA_EXHAUSTED`'s switch (the FE-40 switch pattern: `MANIFEST_MOCK_TOKEN_QUOTA=builds` answers
  `startBuild` `429` with its `limit`), and **`DELETE /v1/tokens/{id}` emitting `token.revoked` on that project's scripted stream** with `{
  tokenId, tokenName, mintedBy, revokedBy }` — `revokedBy` the mock's session user, `tokenName` the fixture's name, `mintedBy` the fixture's
  minter (a different user for the collaborator's fixture token, so the front end's *"someone else revoked it"* path is walkable);
  `docs/api/agents.md`, `docs/api/llms.txt`, `docs/api/index.md`
- Create: `docs/api/mcp.md`

- [ ] **Step 1: Failing tests** — the mock's tests: the switch answers `429 TOKEN_QUOTA_EXHAUSTED` with a `limit` the contract's schema
  accepts; a scripted subscriber on the fixture project receives `token.revoked` with the four fields after the mock's revoke of the
  collaborator's fixture token, and its `revokedBy` differs from its `mintedBy`; `docs.test.ts` red until `mcp.md` is listed.
- [ ] **Step 2: Implement.** **`docs/api/mcp.md` — *Connecting an agent over MCP*** (for a developer or an agent's person; published text cites
  no section or plan): the endpoint is `/mcp` on the origin the API is on; the token as `Authorization: Bearer`; Claude Code's command and
  Codex's table **as `[M3]`, `[M4]` and Task 8 Step 4 measured them**, each with the token in an environment variable, never in a committed
  file or the shell's history, and the scope and directory to run it in (X4); the laptop's CA (`NODE_EXTRA_CA_CERTS`, `[M3]`); what the tools
  are — every operation a token may call, by its `operationId`, but the three the contract names in `x-manifest-alongside` (and why), plus the
  two composites; that the hints mark reads and nothing else; that a privileged ask comes back as a question; **that the client keeps the
  token in its own configuration, and the agent must never read that file** (BP-M11). **`agents.md`**: a sentence under *What you hold*
  naming the MCP endpoint; *When something goes wrong* gains `429 TOKEN_QUOTA_EXHAUSTED` (*wait until `limit.resetsAt`*) and `401` after *"an
  owner of the project revoked it"*; `429 RATE_LIMITED`'s line says the limit is in `limit`; *The rules* gains *"Never commit your own
  configuration, and never read it — an MCP configuration carries your token, and a commit carrying one is refused"*; and **one sentence
  under the first example: the examples use Manifest's own TypeScript client, which is not published — the same requests go over HTTP, as
  the reference says** (design §5.3). `llms.txt` names `mcp`.
- [ ] **Step 3: Run `pnpm docs:write`, the examples and the mock's tests; they pass.** `pnpm typecheck` with `contract` and `mock` as a unit.
- [ ] **Step 4: Tell the front end** — its live session, through the coordinator: the switch, the scripted frame, `mcp.md`, and that its
  *Agents* panel (F7) can be walked against the mock end to end. **Commit.**

```bash
git add packages/mock/src/ docs/api/agents.md docs/api/mcp.md docs/api/llms.txt docs/api/index.md docs/api/reference/
git commit -m "docs(api): connecting an agent over MCP — and the agents guide's quotas, owner's revoke and unpublished client; the mock's quota switch and token.revoked frame"
```

---

## Task 10: The acceptance — `make demo-byoa` (8a), then the review and Rich with a real Claude Code (8b)

*Two sittings since BR's review (BP-M13). **8a**: Task 6b if its gate holds, then Steps 1–3. **8b**: Steps 4–6, in **one window with the
front end's F7 sitting 7** (X7).*

**Files:**
- Create: `packages/journey/src/byoa.ts`, `scripts/demo-byoa.sh`, `scripts/byoa-controls.sh`
- Modify: `Makefile` (`demo-byoa: up`), `scripts/offline-acceptance.sh` (a new step, either driver), `scripts/ci-acceptance.sh` (a step),
  `docs/superpowers/RUNBOOK.md`, **`packages/journey/package.json`** (the SDK, client only) **and `packages/journey/src/boundary.test.ts`**:
  its rule admits `@manifest/contract` and `node:` alone (`boundary.test.ts:68-101`), and the acceptance's agent speaks MCP as an outside
  agent would — so the rule gains **`@modelcontextprotocol/sdk/client/…`, and `byoa.ts` alone may import it** (the client, never the server;
  every other journey file keeps the contract alone). *Found by this plan's revision; not in BR's review.*

**Interfaces:**
- Consumes: everything above; `infra/lib/idp-login.sh` for the people's sessions; the SDK's `Client` and `StreamableHTTPClientTransport`.

- [ ] **Step 1: The script** — `scripts/demo-byoa.sh`, in `demo-authoring.sh`'s shape (step 0 asks the driver; `byoa-local` on driver 1,
  `byoa-github` on the fake; `DEMO_BYOA_STOP_AFTER=<step>`; it **refuses to start unless 7113 answers its marker**, printing RUNBOOK's
  command). The people are the laptop IdP's `instructor` (the owner) and `colleague` (`col000001`, faculty). The agent's half is
  `packages/journey/src/byoa.ts`, which uses **only the SDK's `Client` over `https://app.manifest.internal/mcp` for the agent** (a person's half
  uses `@manifest/contract` with a session, as every demo does):

| Step | Who | What | Asserts |
|---|---|---|---|
| 0 | bash | which driver; 7113 is ours | — |
| 1 | the instructor (session) | creates the project; mints a token for the agent **at 30 a minute**, holding the build loop's capabilities (below) — never `members:manage`, which D24 refuses to mint, so asking to add a member becomes a question | `Token.rateLimit` 30; `Token.usage` all zero |
| 2 | the agent (MCP) | `initialize`; `tools/list`; reads `manifest://docs/agents`, the pack and both toolkit packs | instructions present and naming `listProjects`; the tool count = the gate's; no `startAgentSession`, no `getOpenApiDocument`; `getTree` `readOnlyHint`, `deploy` without `destructiveHint: false` |
| 3 | the agent | `listProjects` finds its one project; builds the bulletin board as `make demo-authoring` does — `getTree`, `createCommit` (dry run, then real), `startBuild`, `waitForBuild` (looping on `done: false`), `createRelease`, `deploy` to staging, then the same release to the sandbox and `getInstanceOutput` there | the board answers at its staging hostname |
| 4 | the agent | `resolveDependencies` adding `marked`, commits it, builds | build `succeeded` |
| 5 | the agent | `deploy` to production | **D24's refusal only**: a tool error, `TOKEN_ACTION_PENDING`, `pendingAction` structured — left unanswered (Decision 23) |
| 6 | the agent | `addMember` — the `colleague` as a collaborator | a tool error, `TOKEN_ACTION_PENDING`, its `pendingAction` naming them by PUID (not yet a member) |
| 7 | the instructor | confirms that question (step-up) | — |
| 8 | the agent | `waitForPerson` → `confirmed`; the identical `addMember` call → `201`, once; the same call a third time → a NEW question | as `make demo-token`'s step proves it (*Read this first* 26) |
| 9 | the agent | commits `.mcp.json` carrying its own token | `SOURCE_SECRET_DETECTED`; the repository unchanged |
| 10 | the agent | 31 reads inside a minute | the 31st a tool error, `RATE_LIMITED`, `limit.count` 30, `limit.scope` `token` |
| 11 | the instructor (session) | `listTokens` | the agent's `Token.usage`: `builds.used` = the builds it started, `commits.used` its real commits (no dry run), `deploys.used` its deploys, each `resetsAt` a day after its first — the quota's REFUSAL at its real default is `byoa-controls.sh`'s (a) |
| 12 | the colleague (now a member) | mints their own token; their agent connects over MCP and holds a `waitForBuild` | — |
| 13 | the instructor | revokes the colleague's token | the colleague's agent's `waitForBuild` answers at once with `401` (never at its bound); its next call `401`; `token.revoked` names both, with the token's name; `Token.revokedBy` the instructor |
| 14 | bash | the MCP server's own refusals through the edge: a cookie-only `POST /mcp`, a request with `Origin`, an `initialize` with a revoked token | `401`, `403`, `401` and no tool list |
| 15 | bash | grep the MCP server's log (its stdout file, `DEMO_BYOA_MCP_LOG`) for every token the run minted, and for `sk-` | 0 hits |

  *(Step 1's mint: the token holds `project:read`, `source:write`, `build:create`, `release:create`, `release:deploy`, `secret:write`,
  `output:read` — what `make demo-authoring`'s agent holds; never `members:manage`, which the mint refuses.)*
- [ ] **Step 2: Run it three times on each driver** — fresh, re-used, and from a `make reset` machine — and every other demo once
  (`make ci-acceptance`, in the background).
- [ ] **Step 3: Its controls — `scripts/byoa-controls.sh`**, in `scripts/gateway-controls.sh`'s shape (it restarts 7100 and 7113 as it
  needs and **restores both** from `.env` at its end, saying so first, since a restart signs everyone out): **(a)** 7100 restarted with
  `MANIFEST_TOKEN_QUOTA_BUILDS_PER_DAY=2` — the agent's third `startBuild` through `/mcp` is a tool error `TOKEN_QUOTA_EXHAUSTED` with its
  `limit` fields (the quota's refusal through the edge); **(b)** the edge's `@mcp` removed — `make demo-byoa`'s step 2 fails at connect;
  **(c)** the scanner's `mft_` rule removed — step 9 commits; **(d)** the revoke narrowed back to minter-only — step 13 `404`; **(e)** the
  `Origin` check removed — step 14 passes a browser. Each predicted, watched red (or, for (a), refused), restored; `BYOA_CONTROLS_DRY=1`
  prints each edit without making it. **8a ends here**, every result quoted in *What executing this plan found*.
- [ ] **Step 4 (8b): The plan's one whole-branch review** (a fresh reviewer, the most capable model), and its one fix wave — the Docker
  tier if the wave touches the owed list.
- [ ] **Step 5 (8b): The clicked half — Rich, in one window with F7's sitting 7** (X7). **Its prerequisites, named in both plans**: Rich's
  `make refresh-vulndb` (the network on) within the seven days before it, and `make demo-production` green that day on driver 1, which
  launches `launch-app`. Staged first (the token's address and header on F7's panel, or the console's *Tokens* screen). Then Rich, with **his
  own** Claude Code: `claude mcp add --transport http manifest https://app.manifest.internal/mcp --header "Authorization: Bearer
  $MANIFEST_TOKEN"` (with `NODE_EXTRA_CA_CERTS` as `[M3]` found, and the scope and directory the quotable block names), asks it to build a
  small app, watches the commits arrive as *"<his name>'s agent"*, revokes the token, sees the agent stop. **Codex too, if `[M4]` found it
  connects.** Then F7's clicks on `launch-app` (its production retry after an owner's yes). His words are recorded in the decisions file.
- [ ] **Step 6 (8b): Close out** — this plan's sittings table and *What executing this plan found*; ORIENTATION §2's table (a twentieth plan),
  §7e (the next job: Phase 3), §8; the roadmap's ledger; CLAUDE.md's *State*; the offline acceptance's new step. **Commit.**

```bash
git add packages/journey/src/byoa.ts packages/journey/package.json packages/journey/src/boundary.test.ts pnpm-lock.yaml \
  scripts/demo-byoa.sh scripts/byoa-controls.sh Makefile scripts/offline-acceptance.sh scripts/ci-acceptance.sh \
  docs/superpowers/RUNBOOK.md docs/superpowers/plans/2026-10-13-byoa-on-the-laptop.md
git commit -m "test(byoa): make demo-byoa — an agent builds an app through MCP alone, asked, refused and revoked where the platform says"
```

---

## What this plan does not build

- **MCP's OAuth flow** — a person signing in from their agent and consenting, instead of pasting a token. It would make Manifest an OAuth
  authorization server over CWL. Phase 5, where the paste costs most.
- **A stdio transport, a published package or a published client** — `@manifest/contract` stays `"private": true` (design §5.3).
- **MCP prompts, sampling, elicitation, server-initiated notifications.** The paste prompt is the front end's words.
- **`startAgentSession` and `getOpenApiDocument` as tools, and the OpenAPI document as a resource** (Decisions 10 and 20): a model key in the
  model's context, and 1.2 MB of what the tools already say.
- **Quotas set at mint; per-person quotas; changing a token's rate after mint.**
- **Model keys for `/v1/messages` or `/v1/responses`** (Rich's answer 4) — measured at `[M5]` only.
- **A CLI.**
- **Anything of Phase 3** (sandboxes, `exec`, the chat pane) **or Phase 5** (below).
- **Starting the MCP server from `make up`** (Decision 18).

---

## The policy section — for Rich, and for UBC's Privacy Office (Rich's answer 4)

**Nothing here blocks this plan**: on the laptop every person is a test user and every app a fixture. It is written to be carried to the
Privacy Office as it stands.

**What an outside agent's provider would see.** Manifest lets a person give their own coding agent — Claude Code, Codex, or another — a
delegated token for one app. Everything that token can read becomes context the agent sends to whichever model it thinks with, under that
provider's terms; **Manifest cannot see which provider that is, or on which terms** (a personal subscription's terms may allow training on what
it is sent; an enterprise agreement may keep nothing). A token can read:
- the app's code, its `manifest.yaml` and its history — **including commit authors' names**;
- **the project's people**: their names, CWL login names, **CWL PUIDs (`ubcEduCwlPuid`) and email addresses** — the whole member list — and
  the names in the activity feed's sentences and in the questions an agent asks;
- **the app's launch records**: the privacy assessment's answers, including who is accountable, and both IAM registrations' drafts;
- **an administrator's own words**: when an administrator acts on a project they are not a member of, the reason they give is appended to
  the activity feed's sentence, which a token reads;
- build logs; what a sandbox instance printed, redacted (test users' input);
- incidents — the sandbox's always; staging's and production's only on a `low` or `medium` app (a `high` or `very-high` app's are refused to a
  token).

A token can **never** read a secret's value, or what a staging or production instance printed.

**And where it then stays.** The agent's own client keeps what it read — a transcript of every tool result, so the code, the member list and
the logs above — **on the person's machine**, outside Manifest and outside anything Manifest can delete; and it keeps the token itself in its
own configuration file in plain text, which the agent could read with its own file tools (Manifest's guide tells it never to). Manifest never
puts the token in the model's context; the client's files are the person's to keep safe.

**What it would take, per answer.** Manifest's own agents already think only with models the platform attests by level (UBC's AI Gateway
under zero data retention, or on-premise). An outside agent could too — an agent that speaks chat completions can be given a Manifest model
key today, and this plan's Task 1 measures whether Claude Code can; or the platform could refuse a token for an outside agent on an app above
a level.

**The questions only Rich or UBC can answer:**
- **P1.** May a faculty member point a commercial agent (Claude Code → Anthropic, Codex → OpenAI; on a personal or an enterprise plan) at a
  UBC app's code? Does the platform's PIA need to name it? If only for some levels, which?
- **P2.** The platform's own `high` routing rests on a provider keeping nothing it is sent (Rich's reported determination, *"as long as ZDR
  is enabled"*, not yet a document). **An outside agent's provider is attested by nobody** — does the same bar apply, and who checks it?
- **P3.** Who may bring an agent: today only faculty build (FE-39, *"for now"*). Should a TA or a graduate student working on a faculty
  member's app bring their own?
- **P4.** Once staging signs real people in through UBC's staging IdP (FE-24), should a token — any agent's — still deploy to staging and set
  staging's secrets? (Moot on the laptop.)
- **P5.** A commit made through the API carries its person's name to GitHub as author; an outside agent's commits do the same. Keep the
  person as author, author as Manifest, or a pseudonym?

---

## Phase 5 — the decisive gap, recorded and not planned

Bring-your-own-agent beyond Rich's laptop needs Manifest **reachable from a faculty member's own machine**: UBC's hosting decision (RHEL 9
VMs or Kubernetes, §19); Manifest's own IAM registration and the platform's PIA (the external track, deferred by Rich 2026-09-30); a public
certificate (the laptop's CA ends); and — where pasting a token costs most — MCP's OAuth over CWL. **This plan builds none of it, and its
acceptance says so: every agent in it runs on the laptop.**

---

## Asked of Rich

1. ~~Approve the plan~~ — **APPROVED 2026-10-13, ~21:50 PDT (`2b3dd6d`)**, its nine sittings, inline per sitting; every departure named
   in *What Rich does* 1 approved with it.
2. **Spec actions A–E**, each before the sitting it gates, with their shared pages.
3. **The network**, each use listed in *What Rich does* 3.
4. **At sitting 8b**: `make refresh-vulndb` within the seven days before it, and the clicked half — his own Claude Code, then F7's clicks on
   `launch-app`.

---

## Spec actions — DRAFTED, NONE APPLIED

*Each is Rich's to approve in words before the sitting it gates. Line numbers at `327ca2f`. **A spec action is not finished when the spec
changes**: each names its shared pages below and what changes on each (BP-I10), and the sitting that applies it sweeps them in the same
commit. If the classifier refuses the edit, it is staged as a script Rich runs himself.*

### A. §17 and §5 — bring your own agent before sandboxes (before sitting 5)

- **§17's table** (l. 1904): Phase 3's deliverable loses *"; the **MCP server** (§22), making "bring your own agent" real"*. A row is placed
  between 2 and 3:

  > | **2b — Bring your own agent** | the **MCP server** (§22) at `/mcp` beside `/v1`; **toolkits** served beside blueprints, each with its
  > knowledge pack (D25, §25); a delegated token's **rate set at mint** and its **daily quotas** (§20); an owner or administrator revoking any
  > token on the project (§20); Manifest's own credentials in the secret scanner (§12). **Demo:** an agent the platform did not write, on the
  > person's own machine, builds an app through MCP alone, and is asked, refused and revoked where D24 and §20 say. | Can someone else's
  > agent build here, safely? |

- **§17's paragraph before the table** keeps its own sentences, and **gains a sentence of its own after them** (BP-M2: that paragraph counts
  Phase 1's increments, and 2b is not one): *"**2b** was placed between 2 and 3 on <date>, out of Phase 3: an agent on its person's own
  machine needs no sandbox (§1), only the published API, a delegated token and the knowledge packs."*
- **§5's layout** (l. 305): `mcp/  MCP server: Manifest as tools for any agent (Phase 2b, §22)`.
- **Shared pages — `specs/manifest-phases.html`**: the stage-3 card (*"Sandboxes and building by describing"*, l. 281-292) loses *"Manifest
  also becomes available as a set of tools any AI can use directly, which is what makes &ldquo;bring your own AI&rdquo; real rather than
  theoretical."*; **a new card, between stage 2's and stage 3's**, in the page's own words:

  > **2b — your own AI. Bring your own AI.** Someone who already uses an AI coding assistant on their own computer can point it at their
  > app and build with it: Manifest offers itself as a set of tools any such assistant can use, with the same instructions Manifest's own
  > assistant reads. The person decides how fast it may work and the platform how much it may build in a day; the app's owner can stop any
  > assistant on their app; and the four consequential things still wait for a person. **You can show:** an AI the platform did not write
  > building an app on a laptop — asked, refused and stopped where the platform says. *Can someone else's AI build here, safely?*

  (in the page's markup: `<div class="ph"><div class="pid">2b<span>your own AI</span></div>…`, as the other cards are). **Checked, unchanged:**
  `manifest-decisions.html`, `manifest-schematic.html`, `manifest-stories.html` (none names a phase's MCP line).

### B. §22 — the MCP server lands before sandboxes (before sitting 5)

- **The heading** (l. 2461), *"The third reference client: MCP (Phase 3)"* → *"The third reference client: MCP (Phase 2b)"* (BP-M2).
- **Replace l. 2472–2473** (*"It lands in Phase 3, when sandboxes make the agent story real. The delegated token model it depends on lands in
  Phase 1, because CI needs it regardless."*) with:

  > It lands in Phase 2b, before sandboxes: an agent on its person's own machine needs no sandbox (§1), only the published API, a delegated
  > token and the knowledge pack. It is served at `/mcp` on the API's own origins, by a process of its own, and takes a delegated token as its
  > only credential: every operation a token may call is a tool, but those the contract names as not tools — each with its reason, such as an
  > answer carrying a model key — and nothing else is. The delegated token model it depends on lands in Phase 1, because CI needs it
  > regardless.

- **D23.8** (l. 2528-2531), its list of endpoints outside the versioned contract, gains *"and endpoints another process serves beside the
  API, such as the MCP endpoint (`/mcp`)"* before *"— sit outside the versioned contract"* (BP-M2, optional; recommended, since the document
  now declares it in `x-manifest-alongside`).
- **Shared pages**: `manifest-phases.html` — A's card says it; nothing more. **Checked, unchanged:** `manifest-decisions.html` (D22 and D23's
  cards name no MCP phase), `manifest-schematic.html`, `manifest-stories.html`.

### C. §20 and §6 — the token's rate, its quotas, and who may revoke it (before sitting 2)

- **Replace §20's l. 2052–2055** (*"Delegated tokens carry **per-token rate limits and quotas**. …"*) with:

  > Delegated tokens carry **per-token rate limits and quotas**. The edge limits in this section protect deployed apps; the control-plane
  > API needs its own, because a third-party agent is code the platform did not write, running on a machine it does not control. **A token's
  > rate** — requests a minute — is set when it is minted, at most 600 a minute, and fixed for its life. **Its quotas** count, over a rolling
  > day, what every app on the machine shares — builds, deploys, commits and dependency resolutions — and a refusal carries the limit as
  > fields. A person's own session is never counted. **A token is revoked by its minter, by an owner of its project, or by a platform
  > administrator**, and by removing its minter from the project.

- **§6's `DelegatedToken` row** (l. 341): *"**A token is revoked when its minter is removed from its project**"* → *"**A token is revoked when
  its minter is removed from its project, or by an owner of the project or a platform administrator**"*, and its fields gain `revoked_by`.
- **Shared pages — `manifest-decisions.html`'s D24 card** (l. 170-173): after *"…their tokens there are revoked and their AI sessions there
  end."* it gains: *"An owner — or an administrator — can also stop any one AI's access to their project without removing the person who let
  it in, and every token has a speed limit set when it is made and a daily allowance of what every app shares: builds, deployments and
  changes."* **Checked, unchanged:** `manifest-phases.html` (A's card says it), `manifest-schematic.html`, `manifest-stories.html`.

### D. D25 and §25 — toolkits (before sitting 4)

- **D25** (l. 221) gains a second sentence: *"**A toolkit's** knowledge pack is served the same way, versioned with the toolkit."*
- **§25** gains a subsection after *Starters* (l. 2909):

  > ### Toolkits
  >
  > A **toolkit** is what an app on a blueprint uses to reach one UBC system — CWL sign-in, models, and later Canvas or the academic API —
  > published beside the blueprints as `toolkit.yaml` with a knowledge pack: the packages it is (each allowed by §12's allowlist, and equal to
  > a blueprint's pin where the blueprint pins it), the blueprints it works with, and what an app declares in `manifest.yaml` to use it. It
  > adds no field of its own to `manifest.yaml`. A blueprint's knowledge pack keeps what is its skeleton's own and points to its toolkits for
  > the rest, once every client that builds from the pack reads them too.

- **Shared pages — `manifest-decisions.html`'s D25 card** (l. 175-177): its *dwhy* gains, before *"An assistant given nothing but an
  address…"*: *"**The same goes for each toolkit** — how an app uses UBC's sign-in, or its AI models — published beside the blueprints, so
  an AI learns a toolkit's rules from the platform as well."* **Checked, unchanged:** `manifest-phases.html` (A's card names no toolkit),
  `manifest-schematic.html`, `manifest-stories.html`. **The D23 card (l. 166) says *"tied to no particular AI toolkit"*** — meaning an agent
  framework, not these toolkits: unchanged, and the D25 card's new sentence says *"toolkit"* only beside *"how an app uses UBC's sign-in"*,
  so the two senses do not meet in one card.

### E. §21 — the MCP server in the inventory, and the laptop's divergence (before sitting 5)

- **§21's sentence before the inventory** (l. 2217-2218), word for word (BP-M2): *"Ten long-running containers, plus three host processes
  (control plane, admin UI, console) and Ollama as a host application."* → *"Ten long-running containers, plus four host processes (control
  plane, admin UI, console, MCP server) and Ollama as a host application."*
- **§21's inventory** gains a row after the reference console's: *"| MCP server (§22) | 7113 | Host process. Reached through the edge at
  `/mcp` on the console's and the front end's origins; listens on loopback only |"*.
- **§21's *Honest divergences from production*** gains a ninth: *"9. **An agent on the laptop must trust the laptop's CA** to reach `/v1`
  or `/mcp` — `NODE_EXTRA_CA_CERTS` for one built on Node (§21's *TLS*). Production's certificate is public."*
- **Shared pages. Checked, unchanged:** `manifest-schematic.html` and `manifest-stories.html` carry no inventory or MCP line (BR read both);
  `manifest-phases.html` and `manifest-decisions.html` name no port.

---

## What the review found, and where it went (2026-10-13)

*The review is [`2026-10-13-review-of-byoa-plans.md`](./2026-10-13-review-of-byoa-plans.md) (`1fa72d6`), §1, *Cross-plan* and *Safety*. Its
verdict on this plan: **approve with the fixes**. Rich answered its one question, X1, *"(a) F7 gains a task"* (`327ca2f`). Each finding was
re-checked against the code at `163f42c`–`327ca2f` before it was written in. **Every finding is fixed; none is argued.** X1, X3, X5 and X7
were agreed with BF (`manifest-app-byoa-plan`) directly, in the words below.*

| Finding | What it said | Where it went |
|---|---|---|
| **BP-I1** | The acceptance's privileged path cannot pass on a fresh project: a confirmed production deploy meets §13's gate | `make demo-byoa`'s privileged loop is `addMember` (the `colleague`), as `make demo-token`'s is; production stays D24's refusal only (Decision 23; Task 10 steps 5–8; *Read this first* 26; Review Focus 6) |
| **BP-I2** | Task 3's control (c) cannot fail: a replay never calls `run` | Control (c) moves the take OUT of `run`, before `app.idempotent`; predicts the replay counts 2 (Decision 3; Task 3 Step 5; *Read this first* 23) |
| **BP-I3** | Task 7's control (c) cannot fail: `/__doctor` holds no token, and the spy reads `console.*` | (c) puts the `authorization` header into the per-request operator line (the log spy goes red); (d) into `callTool`'s refusal text (*token in no field* goes red) (Task 7 Step 10) |
| **BP-I4** | The mock's typed fixtures wait for Task 9 while Tasks 2–4 and 6 change `Token` and `Blueprint` | Tasks 2, 3, 4 and 6a each commit the mock's fixtures with the contract, typechecked as one unit, and say which typed fields arrived; Task 9 keeps the docs, the quota switch and the scripted `token.revoked` frame (X5) (*How this plan is executed*; each task's mock step) |
| **BP-I5** | `revokeToken` misses §26's derived codes and the authz contract's literal list of 24 | The definition declares `capability: 'members:manage'`; the list becomes 25; an owner's revoke of an already-revoked token on an archived project answers `200` — the capability is asserted for a live token only, and a revoked one takes the route's idempotent retry path (Decision 7; Task 4 Steps 1–3; *Read this first* 24) |
| **BP-I6** | `startAgentSession` would put a model key in the model's context; `getOpenApiDocument` is 1.2 MB | Both in the document's `notTools` with their reasons; no OpenAPI resource; a test that no tool result carries `sk-…` or the token; Review Focus 1 (Decisions 10, 12, 20; Task 7 Steps 1a and 8) |
| **BP-I7** | `waitForBuild` reads `state` (it is `status`); `!== 'running'` is true for `pending`; no `onClose` exists | `done` is `succeeded` or `failed`; the build is read first; `Subscription.closed` ends the wait; a `pending` case and a control (Decision 14; Task 8 Steps 1, 3 and 6) |
| **BP-I8** | The hints call every write non-destructive and idempotent | `readOnlyHint` and `idempotentHint` for `GET` alone; a write claims neither and is never `destructiveHint: false`; asserted on `deploy` and `createCommit` (Decision 19; Task 7 Step 8) |
| **BP-I9** | The policy section under-states what a provider sees | PUIDs and emails, the launch records, administrators' reasons, and where the client keeps what it read and the token (*The policy section*) |
| **BP-I10** | The spec actions name no shared page | Each names its pages and what changes on each: a new 2b card and stage 3's sentence on `manifest-phases.html`; the D24 and D25 cards on `manifest-decisions.html`; schematic and stories checked, unchanged (*Spec actions* A–E) |
| **BP-M1** | Small facts drifted | Corrected in *Read this first* (3, 4, 11, 13), the Spec line and Task 2 — `CreateTokenInput` already writes `rateLimit` |
| **BP-M2** | A's *"a fifth"*; B's heading; C's *"platform's maximum"*; E undrafted | A's own sentence; B renames l. 2461's heading and offers D23.8's `/mcp`; C says *"at most 600 a minute"*; E drafted word for word against l. 2217-2218, with its inventory row and a ninth divergence |
| **BP-M3** | A stranger's `404` would name the project | Scope is checked first and the token's `404` answered; the message asserted (Decision 7; Task 4 Step 1, control (b)) |
| **BP-M4** | `token.revoked` needs an `EVENT_DETAIL_SCHEMAS` entry and the events reference | Both in Task 4's files, code and commit; File Structure |
| **BP-M5** | `TOKEN_QUOTA_EXHAUSTED` should be declared where it can be answered | Derived in `document.ts` from `RouteDefinition.quota`, as `PROJECT_ARCHIVED` is (Decision 6; Task 3) |
| **BP-M6** | Task 3 mixes the host's clock and the database's | The window and `resetsAt` in SQL on `clock_timestamp()`; the test compares database times only (Decision 5; Task 3) |
| **BP-M7** | A toolkit's allowlist check must use FE-32's effective set | Through FE-32's loader — the file and the skeletons' direct dependencies (Decision 16; Task 6a; *Read this first* 30) |
| **BP-M8** | The network list is incomplete | Every real-client run listed in *What Rich does* 3 and the Global Constraints |
| **BP-M9** | Claude Code may show "connected" falsely: any bearer gets a tool list; a `401`'s header may start OAuth discovery | `initialize` makes one cheap read with the bearer and answers `401` for a dead token; `[M3]` measures both, and the header follows it (Decision 21; Task 1 Step 3; Task 7 Step 8; Review Focus 8) |
| **BP-M10** | The real client should call a tool whose schema carries `$defs` | Task 8 Step 4 calls `createCommit` with `dryRun: true` |
| **BP-M11** | *"The token never in its model's context"* over-claims | *"Never put in its model's context by Manifest"* (the Goal); the guides' *never read your own configuration*; the policy section's line on what the client keeps |
| **BP-M12** | FE-32's rationale over-stated: an agent can still COMMIT any lockfile | Said exactly in *Predecessor*; and as an annotation to the design's §8 |
| **BP-M13** | Sitting 8 is two sittings | 8a (Task 6b if gated in, the demo, its controls and runs) and 8b (the review, its fix wave, Rich's click with F7's sitting 7) — nine sittings |
| **X1** | Task 6 moves the know-how out of the one pack the front end's agent reads | Rich's (a): Task 6a serves the toolkits and touches no pack; **Task 6b** slims `AGENTS.md`, gated on **F7's sitting 4** (its agent reads each `Blueprint.toolkits` pack, within one 24,000-character cap, blueprint first) — **agreed with BF**: 6b at 8a's open, or earlier once landed; if not landed, 8a runs with `AGENTS.md` whole (Decision 15; the sittings' fourth rule) |
| **X2** | Agent-run Claude Code writes a token into Rich's own configuration | Every agent-run client uses a throwaway `CLAUDE_CONFIG_DIR` / `CODEX_HOME` under the scratchpad, removed after, `[M3]` proving it is honoured; only Rich's click uses his (Decision 22; Task 1 Step 3; Task 8 Step 4) |
| **X3** | The read-tool set must come from one list | `x-manifest-alongside`'s `/mcp` entry carries `notTools` and `composites`, landing in Task 7; the gate, the server and BF's test derive from it — **agreed with BF**: read tools = `GET` tools plus the composites (Decisions 9 and 10; Task 7 Step 1a) |
| **X4** | Step 4a lacks history, directory and Codex's per-session variable | All three added (Task 1 Step 4a); the guide says them (Task 9) |
| **X5** | The mock's `token.revoked` frame is unlisted | Task 9: the mock's revoke emits it with all four fields, `mintedBy` ≠ `revokedBy` on the collaborator's fixture — **agreed with BF**, which needs nothing else |
| **X6** | Two OTHER plans state stale contract numbers | Not this plan's — lines for `manifest-coord3`; this plan's chain is stated (A1 `1.9.0` landed, B `1.10.0`, FE-32 `1.11.0`, this `1.12.0`) |
| **X7** | One window, named | 8b with **F7's sitting 7** (BF's renumbering); prerequisites in both plans — Rich's `make refresh-vulndb` within seven days, `make demo-production` green that day launching `launch-app` — **agreed with BF**: BP's fix wave, then BP's clicks, then F7's on `launch-app` (Task 10 Step 5; *What Rich does* 4) |

**Departures from the approved design this revision adds** (beside D2, D9, D10 with its exceptions, D14 and 7113, which BR named): the
hints claim less than the design's *"every mutation idempotentHint"* (Decision 19); no OpenAPI resource (Decision 20); the `401`'s
`WWW-Authenticate` header may be dropped on `[M3]`'s evidence (Decision 21). And one addition the design did not have: `initialize` checks
the token (Decision 21). Each is named to Rich at approval (*What Rich does* 1).

**Found by the revision itself, not in the review:** `packages/journey`'s import boundary admits `@manifest/contract` alone, and the
acceptance's agent speaks MCP — so `byoa.ts` alone may import the SDK's client (Task 10's files). And a first draft of Task 4's fix returned
early for an already-revoked token, which would have skipped the retry path that ends sessions a failed first revoke left live; the scope
check comes first instead, and the capability is asserted for a live token only.

---

## What the self-review caught

*(The plan's own review, 2026-10-13, before BR's. BR's findings, and the revision's own two, are in the table above.)*
- **Port 7101 is the admin UI's in §21** (spec l. 2236), though `infra/lib/common.sh` does not assign it; the design named it as free. The
  plan takes 7113.
- **`/mcp` cannot go in `UNVERSIONED`**: `versioning.test.ts` holds it to the control plane's own routes. Decision 9's `x-manifest-alongside`.
- **The document already marks every session-only operation** — the design's hand-written `NOT_TOOLS` became a derivation with one exception
  (three since BR's review, published in `x-manifest-alongside`).
- **No `token.revoked` event exists**; the design's *"the event names who revoked whose"* needs a new type and a CHECK migration (Task 4).
- **A ten-minute `waitForBuild` would die across an edge reload or a client's timeout** — bounded and resumable instead (Decision 14).
- **Moving whole sections out of `AGENTS.md` would cost the front end's own agent rules** — one line each stays (Decision 15).
- **A revoke mid-`waitForBuild` would have waited to the bound** — it now answers at the stream's `4401` (Task 8).
- **`[M6]` first proposed editing the live edge to measure a reload** — it uses a throwaway Caddy of the same image instead; and the quota's
  refusal through the edge, which `make demo-byoa` cannot reach at the real defaults, is `scripts/byoa-controls.sh`'s (a).
- **Four names in Tasks 7–8's code were used and never defined** (`DocWithComponents`, `jsonBodySchema`, `McpOptions`, `WaitOptions`) — each
  is now declared where it is used.

**Asked by the front end (BF, `manifest-app-byoa-plan`) while this plan was written, and taken in:** `Token.revokedBy`, stamped by every revoke,
and `tokenName` in `token.revoked`'s detail (Decision 8, Task 4); `TokenUsage.resetsAt` (Task 3); the instructions naming `listProjects` (Task 8); Task 1's *"For the front end — word for
word"* block of each client's configuration, CA setting, timeout and permission rule (Step 4a), corrected through the real edge at Task 8.

---

## What executing this plan found

*Nothing yet: the plan has not been executed.*
