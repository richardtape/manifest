# The front-end enablement plan's baseline — Task 1's measurements

**Measured 2026-09-27, 01:53–02:15 PDT, by the plan's sitting 1** — run at Rich's direct instruction, given before he went to
bed, to execute sitting 1 once the plan was written. **So it ran BEFORE his review of the plan and its sittings split**, which
stay open (ORIENTATION §7e and §8). Nothing under `packages/` changed. The plan is
[`../../plans/2026-09-27-front-end-enablement.md`](../../plans/2026-09-27-front-end-enablement.md); every measurement below
corrects or confirms a claim in its *Read this first* or *Decisions*, and each correction is a dated `[M<n>]` block at the head
of the task it changes.

**Machine:** macOS 26.6.2 (25G83); Docker Desktop 4.87.0, engine 29.7.2 (API window 1.40–1.55; the driver pins v1.44),
`json-file` logging, 12 CPUs and 7.7 GiB in the VM; Node v24.12.0; git 2.50.1 (Apple Git-155); LiteLLM as `infra/images.lock`
pins it (`sha256:20b5044b…`); SimpleSAMLphp as `infra/idp/` builds it; node-saml 5.1.0; cwebp 1.6.0 (Homebrew, only to make two
WebP samples). Load 2.4–5.9 across the session (the unit suite ran first, alone; no timing was taken while it ran).

**The raw output of every probe is [`results-task1-2026-09-27.txt`](results-task1-2026-09-27.txt)**, in the order run, failed
attempts included and labelled. **The probes are in [`probes/`](probes/)**; each `.mts` runs under `probes/run.sh`, which gives
Node 24 `--experimental-transform-types` and the GitHub fake's resolve hook so the control plane's own modules are imported
by path, and exports RUNBOOK's environment (`db/client.ts` throws at import without `MANIFEST_DATABASE_URL`). Every
container, SP row, LiteLLM user, key and route a probe made carries `probe` in its name and was removed by the same probe —
checked at the end of each, and by the snapshot diff below.

## What each measurement found

| | Measured | The plan predicted | Found | Changes |
|---|---|---|---|---|
| M14 | the gate numbers | 2330/162, 20, 57, 33 migrations | **2330/162 (474 s), 20/0/0, 57/0/0, 33** — `test:docker` not run (not owed) | nothing |
| M1 | a container's output at size, through `containerLogs` | `tail: 200` answers 200 lines; the unterminated last line arrives | **`tail` counts 16 KiB LOG ENTRIES, not lines: `tail: 200` answered 136 lines, `tail: 1000` 936** — the 1 MiB line is 64 entries. **The unterminated `last line` never arrived** while the process ran. RSS +15 MiB with the megabyte line in the window; 25–33 ms a read | **Task 2** |
| M2 | Docker's timestamps, raw frames | one stamp per line; `Date.parse` reads three digits | **one stamp per ENTRY**: each 16 KiB chunk of a long line is its own frame with its own (identical) stamp, and the line's `\n` arrives as a 32-byte frame of stamp + space + `\n`. The prefix is RFC 3339, UTC, **nine** fractional digits, one space. **`Date.parse` reads nine digits** (to the millisecond). The unterminated line is written **when the process exits, stamped with the exit time**. A tail can begin inside a long line | **Task 2** |
| M3 | one SP row with two ACS; an AuthnRequest naming the second | the IdP posts where the request names; an unlisted URL is refused with no login form | **Index 1 honoured** — the IdP posted to `app.`'s ACS for the second client, `Destination` and `Recipient` agreeing. **An UNLISTED URL is NOT refused**: the IdP shows the login form, authenticates, and posts to the DEFAULT ACS (index 0, the console's) — fail-safe (it never posts to the unlisted URL), and it logs nothing about it in either log | **Task 8** (Decision 17 stands; one control's expectation changes) |
| M4 | `app.manifest.internal` today | `127.0.0.3`; the wildcard's `manifest OK … listener=public`; an empty `200` in a container | **All three, exactly.** Nothing on 7105. **`dig +short` answers NOTHING on this Mac** — it bypasses `/etc/resolver`; `dscacheutil -q host` answers `127.0.0.3` | Task 8 (a note) |
| M5 | a logout's `RelayState`, and which SLO URL answers | the FIRST entry of the binding; `RelayState` unchanged | **Both, and the response is signed.** (The second run read `RelayState` as absent — a PROBE defect, parsing a display-cut string; the third run is the measurement) | nothing — Decision 18 stands |
| M6 | the redactor over an app's own output | the URI, its password and a Bearer token redacted; hex, a UUID and a weak password kept | **With the set the platform actually builds — 14 of 14.** With the plan's wording of the set (the URI whole in it) the password printed ALONE is kept: the real set holds `service:<name>:password`, not the URI (`services/credentials.ts:72`), and the URI is redacted by its password's exact match — so it reads `mongodb://app:[REDACTED]@…`, not `[REDACTED]` whole | **Task 2** (what its Docker case asserts) |
| M7 | LiteLLM 1.98.0's key mechanics | a key budget, a `duration`, deletion by alias, both budgets binding, a model refusal | **Every one.** The key's budget refuses the SECOND call **at once** (0.3 s — no batch lag): `429 budget_exceeded`. The user's budget: `429 budget_exceeded`, *"User=… over budget"*. Expiry: `401 expired_key`. `{ key_aliases }` deletes: `{ deleted_keys: [alias] }`, then `401 token_not_found_in_db`. A model outside the list: `403 key_model_access_denied`. **An empty `models` list reaches every model.** Error bodies echo the key's last four characters and its hash | Tasks 9–10 (confirmations and exact codes) |
| M8 | a person's spend | `user_info.spend`, with a lag | **`user_info.spend`**, and `/key/info`'s `info.spend`; 3–6 s after the call (3.1 s and 6.2 s on two runs). `budget_reset_at` is `2026-10-01T00:00:00Z` — a calendar month | Task 10 (confirmation) |
| M9 | a service's data surviving an archive | kept with `deleteData: false`, gone with `true` | **Both.** The re-created container reached its data with the SAME root credentials — Mongo ignores `MONGODB_INITDB_ROOT_*` on an existing data directory — so a restore needs the stored `service:*:password` that archive keeps | Tasks 11, 12 (confirmation; a note) |
| M10 | the local IdP and `uid` | (record only) | three users, friendly names, none with `uid`; `name2oid` maps `uid` to the platform's OID; **the row must list `uid` or `AttributeLimit` drops it**; the file is a single-file mount — a replacing save strands it, `docker restart manifest-idp` re-binds | **Task 7** |
| M11 | bytes through the write path and the scans | the table matches; zero findings; the blob ids equal | **23 files, every genuine one of the ten types recognised by its bytes**; one file named `.gif` is none of them (`file(1)`: *data*) and two named `.jpg` are PNGs — **the table read them by their bytes**. None would be refused as text. **Zero findings** from printable runs (≥16) and from the build gate's read. The byte path (`hash-object --stdin-paths`) equals `git hash-object`; **today's `buildCommit` turns an 18,403-byte PNG into a 33,360-byte blob** (the content is a UTF-8 string) | **Task 4** |
| M12 | a 200,000-file tree | whole-tree numstat takes seconds; `--pathspec-from-file` under 0.5 s | **Whole-tree numstat 0.46 s. `git diff` has NO `--pathspec-from-file` — exit 129, its usage.** The 10,000 listed paths as literal pathspec ARGUMENTS (`xargs -0`, two invocations under `ARG_MAX` 1,048,576): **0.17 s**. `getCommit`'s read (`git diff … --name-status`, not `diff-tree`) of a 200,000-file commit: 0.21 s | **Task 5** |
| M13 | the plan's seams | Task 3 first moves `openapi.json`; `1.4.0`; the hand-built lines counted; no matrix row changes | **Static reading agrees with all four**: the build log maps `stream`/`text`/`at` explicitly, so a new `LogLine` field publishes nothing; the contract is `1.3.0` (54 operations, 78 schemas); **18 hand-built lines in 13 files**, of which only the `LogLine`-typed break; `quota:set` is asserted by no route and D24's refusal fires on ASKING, so no row should change — **Task 11's run of the matrix is the only proof** | Task 2 (the count) |
| M15 | a switched-off route | a `static_response` 410 under the hostname's `@id`, replaced in place by `applyRoute` | **Exactly**: one route before and after each move; `patchRoute` back to the 410 in place (archive's direction) works too; `removeRoute` returns the name to the wildcard. **`servingRoute` answers `undefined` for the 410 route** — which is what lets the Docker driver's "refuse a serving instance" pass once a name is switched off | Task 11 (confirmation) |

## Does any of it break the split?

**No.** The one measurement the plan said could re-cut it — `[M3]`, whether SimpleSAMLphp honours an AuthnRequest's
`AssertionConsumerServiceURL` for index 1 — **held**, so Decision 17 stands and Spec action 2's option (b) (two SP entities) is
not needed as a fallback. `[M12]` removes Decision 12's mechanism but not its task, and the replacement is measured. `[M1]`/`[M2]`
change how Task 2 reads Docker's stream, not what the task delivers or which sitting delivers it. **The split is still Rich's
to approve** — this sitting ran at his instruction before his review.

## The corrections, in the plan

Each is a block headed `[M<n>] (2026-09-27)` at the head of its task:

- **Task 2** — `[M1]` `[M2]` `[M6]` `[M13]`: Docker's `tail` counts 16 KiB entries; stamps are per entry, so strip the stamp from
  EACH FRAME before joining partials; `truncated.lines` is known from the ENTRY count, not from receiving `lines + 1` lines; the
  oldest line of a full window may be a fragment; an unterminated line is invisible until the process exits; the redaction case
  builds its set as the platform does; `json-file` has no `max-size` on app containers.
- **Task 4** — `[M11]`: `buildCommit`'s `content` must carry bytes; the table and the ≥16 run rule stand, measured; bytes decide the
  type, whatever the extension says.
- **Task 5** — `[M12]`: `--pathspec-from-file` is not a `git diff` option; pass the listed paths as literal arguments after `--`,
  chunked under `ARG_MAX`.
- **Task 7** — `[M10]`: add `uid` in the auth source AND the platform's row; re-bind with `docker restart manifest-idp` and compare
  hashes.
- **Task 8** — `[M3]` `[M4]` `[M5]`: an unlisted ACS is answered at index 0, not refused — assert that; `dig` cannot see the zone on
  macOS.
- **Task 9 / 10** — `[M7]` `[M8]`: the codes each refusal arrives with, and the lag.
- **Task 11** — `[M9]` `[M15]`: restore relies on the kept credentials; `servingRoute` reads a switched-off name as serving nothing.

## The machine, before and after

`scripts/snapshot-machine.sh` before and after, diffed (below, in *What executing this plan found*'s sitting 1 entry); no probe
container, SP row, LiteLLM user or key, Caddy route or scratch repository was left. The twenty-three sample binaries and the
200,000-file repository lived only in the session's scratchpad.

## Task 12a — the capable model (2026-09-28, sitting 9a)

**Measured against the running LiteLLM 1.98.0** (`ghcr.io/berriai/litellm@sha256:20b5044b619055374061a6d5b7b08754cad75aeabbf82ddf4f69cc0cf80ddaf4`),
every deployment named `probe-capable-*` and deleted by its own probe; `probes/t12a-*.sh`, and every command's output in
`results-task12a-2026-09-28.txt`, with the predictions written first. **Rich chose `openai/gpt-6-luna`** (*"what we'll try to start
with. We may switch to openai/gpt-6-terra if luna is not able"*).

- **(a) `POST /model/new` → `200`**, answering `model_id` (= `model_info.id`) and its `litellm_params` ENCRYPTED (the salt key);
  `/model/info` answers them decrypted, with `db_model: true` (the five `config.yaml` entries read `db_model: false`).
  **A `model_info.id` the caller chooses is honoured.**
- **(b) THE PRICE IS `/model/info`'s `model_info.input_cost_per_token` — AND FOR RICH'S MODEL IT COMES FROM THE NETWORK.**
  `openai/gpt-5.6-luna` → `2e-07` (LiteLLM's BUNDLED map, which stops at gpt-5.6 and is dated Aug 22); **`openai/gpt-6-luna` →
  `1e-07` in, `5e-07` out ONLY because LiteLLM fetches a newer map at its own start when the network is on** — in the container,
  `LITELLM_LOCAL_MODEL_COST_MAP=True python -c 'import litellm; …'` answers `None` for it, the default answers `1e-07` from 4394
  entries. The fetched map's gpt-6 chat models: `gpt-6-astra` ($10/$50 a million), `gpt-6-luna` ($0.10/$0.50), `gpt-6-sol`
  ($2/$10). **There is no `gpt-6-terra`.**
- **(c) "unpriced" is TWO shapes, neither the plan's `null`.** An `openai/*` model neither map knows (`openai/gpt-6-terra`)
  REGISTERS, with `input_cost_per_token: 0` (and a LiteLLM warning); **an unknown provider (`unpriced/whatever`) answers `500`
  *"Model create was saved to the database, but the model id(s) […] are not live in this pod's router"* — and the ROW STAYS in
  `LiteLLM_ProxyModelTable`, absent from `/model/info`** (so nothing reading the catalogue can find it); deleted by its id → `200`.
- **(d) `POST /model/delete { id }` → `200`**, gone from `/model/info`; a second delete → **`400`** *"Model with id=… not found in
  db"* (type `auth_error`).
- **(f) (live, the network on, NO provider key in the container)** a chat through a probe key limited to the probe → **`500`**
  (not the predicted `401`), *"litellm.AuthenticationError: … The api_key client option must be set either by passing api_key to
  the client or by setting the OPENAI_API_KEY environment variable"* — refused inside LiteLLM, before any call to the provider; the
  key's spend `0.0`.
- **(e) (live, Rich's key, after `make up` recreated LiteLLM with `OPENAI_API_KEY`)** the same chat → **`200`**, `"ok"`, 13 prompt
  and 4 completion tokens; the key's spend **`3.3e-06`** after ~10 s — exactly 13 × 1e-07 + 4 × 5e-07. **LiteLLM read the provider's
  own variable for a DB-stored deployment naming no `api_key`.**

**What it changed in Task 12a** (the ledger's rulings): the refusal rule stands (a price that is not a positive number); the operator
line names the network-fetched map as the cause; the control plane registers under an id it CHOOSES and deletes by it on any failure
(the not-live row); `unchanged` requires a positive price too; the fake copies both unpriced shapes.

### Task 12a, after its review — a pinned price, and LiteLLM's fallbacks (2026-09-28, sitting 9a)

Measured for the review's I1 and for Spec action 8 (`probes/t12a-pin.sh`, `probes/t12a-fallback.sh`; predictions first; every probe
row, user and key deleted):
- **A price PINNED in `/model/new`'s `litellm_params` overrides both of LiteLLM's lists** — `openai/gpt-6-terra` 0 → the pinned
  `2e-06`, `openai/gpt-6-luna` 1e-07 → the pinned `3e-07` — shows in `/model/info`'s `litellm_params` AND `model_info`, and **charges
  spend exactly** (a local deployment pinned at 5e-05 / 1e-04: 19 + 2 tokens → key spend `0.00115`). So `ensureCapableModel`
  registers the price LiteLLM itself reported, pinned; an offline restart of LiteLLM cannot unprice it.
- **LiteLLM 1.98.0's fallbacks**: `POST /fallback {model, fallback_models: ["default-chat"], fallback_type: "general"}` → `200`, DB-held
  (`LiteLLM_Config.router_settings`); `GET /fallback/{model}` lists it; `DELETE` → `200`, then `404` *"No general fallbacks configured"*.
  A primary at an unreachable `api_base` (the network-off case) → **`200` from `default-chat`** (`x-litellm-attempted-fallbacks: 1`,
  `x-litellm-model-group: default-chat`, the answer's `model` = `ollama_chat/qwen3.5:4b`), **charged to the same key at the fallback's
  price** (`2.5e-05` = 19 × 1e-06 + 2 × 3e-06); without the fallback → `500` *"Connection error. No fallback model group found"*.
  **A key holding ONLY the primary was answered by the fallback too** (predicted refused) — the gateway does not check a key's model
  list before falling back. Left behind: `LiteLLM_Config` now holds `router_settings = {"fallbacks": []}` (the DELETE empties the
  list, it does not remove the row) — inert.

## Task 12b — the capable model's fallback (2026-09-28, sitting 9b)

**Measured against the running LiteLLM 1.98.0** (`@sha256:20b5044b…`, as above), the primary a PROBE name
(`probe-fallback-primary`) at `api_base` `http://127.0.0.1:9/v1` with a key that is not a key — nothing left the container, no
money. `probes/t12b-fallback.sh`; every line of its output in `results-task12b-2026-09-28.txt`; the predictions written first, from
the source read in the container (`proxy/management_endpoints/fallback_management_endpoints.py`, 357 lines, `get_all_fallbacks`, and
`_add_router_settings_from_db_config`, which merges the database's `router_settings` into the router at start). **All eight
predictions held.**

- **`POST /fallback` twice is an update, in place**: the second answers *"Fallback configuration updated successfully"* and
  `LiteLLM_Config.router_settings` still holds ONE entry for the model; a different list replaces it in place.
- **`GET /fallback/{model}?fallback_type=general`** answers `{"model", "fallback_models", "fallback_type"}`.
- **It survives `docker restart manifest-litellm`** (live again in ~12 s): the same `GET`, the same row, and a chat through a key
  holding ONLY the primary answered `200` by `default-chat-onprem` (`model` `ollama_chat/qwen3.5:4b`, `x-litellm-model-group:
  default-chat-onprem`, `x-litellm-attempted-fallbacks: 1`) — before the restart and after it. `default-chat-large` (the running
  control plane's, `openai/gpt-6-luna`) came back pinned at `1e-07`, as sitting 9a's fix intends.
- **The entry OUTLIVES its primary**: after `/model/delete` of the primary's only deployment, `GET` still answers `200` with the
  list (the router's list is keyed by NAME, and nothing prunes it); `POST` for the absent name is `404` *"Model '…' not found in
  router"*. **`DELETE` never consults the router**: `200` for the absent name, then `404` *"No general fallbacks configured"*, and
  `GET` `404`.
- **A repoint keeps it**: the primary deleted and re-created under a new id → `GET` `200`, the same list, and the chat answered by
  the fallback.
- **Every refusal is FastAPI's `{"detail": {...}}`**, which the control plane's error map reads as `AI_UNMAPPED` with the status —
  so the code decides on the status (`404` none, anything else answered).

**What it changed in Task 12b** (the ledger's rulings): the fallback is removed by `DELETE` whenever the capable model is absent or
the setting empty (an entry left behind would re-attach silently to the next registration of the name); the admin transport gained
`delete`; `ensureCapableFallback` reads the catalogue itself; a first registration made offline stays refused.

### Task 12b, after its review — a request's own fallbacks, and a fallback's own fallbacks (2026-09-28, sitting 9b)

Measured for the whole-branch review's two questions (`probes/t12b-review.sh`; predictions first, from `user_api_key_auth.py:1773`'s
*"1a. If token can call fallback models (if client-side fallbacks given)"* and the router's `fallback_depth`; every target Ollama, every
failing deployment an address nothing listens on):
- **A REQUEST's own `fallbacks` cannot reach a model outside the key's list**: a key holding only `default-chat-onprem` asking for it
  with `fallbacks: ["default-chat"]` is refused `403 key_model_access_denied` — *"… Tried to access default-chat"*, the FALLBACK named —
  exactly as asking for `default-chat` directly is (predicted `401`: it is `403`). **And 1.98.0 refuses `mock_testing_fallbacks` itself**
  (`400` *"Mock testing request params are disabled on this proxy"* unless an admin sets
  `general_settings.dangerously_allow_mock_testing_request_params`), so the positive control could not force a fallback — predicted
  wrong, and a safer default than predicted.
- **The ROUTER follows a fallback's own fallbacks**: `A` (unreachable) → `B` (unreachable) → `default-chat`, through a key holding only
  `A`, answered `200` by the `default-chat` group — with `x-litellm-attempted-fallbacks: 1`, not the `2` predicted. So a general
  fallback set BY HAND on `default-chat-onprem` would carry `default-chat-large`'s calls a second hop that `ai/capable.ts` never
  checks (the review's M4, deferred: only a holder of LiteLLM's master key can set one, and that holder can repoint any entry).


## Task 14a — the laptop's on-premise model, `qwen3.8:27b` (2026-09-28, sitting 11a)

**Measured through LiteLLM 1.98.0's own LIBRARY inside `manifest-litellm`** (`probes/t14a-model.py`, run with the container's
interpreter, so the proxy's mapping code and nothing in its database) against Ollama 0.34.4 on the host; every line in
`results-task14a-2026-09-28.txt`, with Ollama's own log lines for each load. macOS 26.6.2, 36 GiB, Docker Desktop's VM 7.75 GiB,
load 5–8 (Rich's other sessions running). `qwen3.8:27b` is `22130167c4c2`, 27.3B, Q4_K_M, a THINKING model.

- **[M16] It answers non-thinking with the same pin as `qwen3.5:4b`** — `ollama_chat/qwen3.8:27b` with `think: false`, streamed:
  16, 17 and 23 content frames and **0 reasoning frames** in three runs. **The pin is load-bearing for it too** (the negative
  control): without it, 57 reasoning frames came before the first content at 200 tokens, and at 50 tokens **50 of 50 frames were
  reasoning and the answer was empty** — §21's *"a thinking model streams no content at all"*, again. So the `-reasoning` names keep
  their shape (`reasoning_effort: medium`, no pin) and `ai-path.docker.test.ts`'s two cases hold for the 27B unchanged.
- **[M17] It fits beside Docker, and NOT beside `qwen3.5:4b`.** Resident, it is 17.57 GB, all of it on Metal (`/api/ps`
  `size_vram` = `size`), at Ollama's context of 32768. **Ollama will not hold both**: loading either EVICTS the other, and its log
  says why — `"llama-server model predicted to exceed available memory, evicting" predicted="22.4 GiB" … system_free="7.6 GiB"
  system_limited=true` (the 27B), and `predicted="3.8 GiB" … system_free="2.0 GiB"` (the 4B, while the 27B was resident). The limit
  is the SYSTEM's free memory, not the GPU's (27.6 GiB available to Metal throughout): 13–17 GiB was free before a load on this
  machine as it is used (Docker's VM, browsers, other sessions), and **while the 27B is resident the machine reads 14–15% free**
  (`memory_pressure`), swap 14 of 15 GB used (it was already).
- **[M18] Latency**: cold, first content at **12.4 s** (the runner started in 11.1 s); warm, **0.49 s** first content and 2.6 s for a
  17-frame answer. **Every alternation between `default-chat` and an on-premise name reloads**: the 27B again in 8.3 s (first content
  9.3 s), the 4B in 2.5 s (first content 3.1 s).
- **[M19] What it costs the Docker tier** (predicted here; measured by the tier itself at the close): three cases load the 27B —
  `ai-path.docker.test.ts`'s `default-chat-onprem` (thinking off) and `default-chat-onprem-reasoning` (50 tokens), and
  `capable.docker.test.ts`'s fallback (`default-chat-onprem` answering an unreachable primary) — each evicting the 4B that the next
  `default-chat` case reloads: about four swaps, ~10 s each way plus ~3 s back. `agent-keys.docker.test.ts`'s two `default-chat-onprem`
  calls are refused `403` before any model loads. **`capable.docker.test.ts` asserts the fallback's provider string
  (`ollama_chat/qwen3.5:4b`)** — Step 2 changes it with the mapping.

**Does it break the task?** No: Step 1's STOP condition — *"does not fit this 36 GiB machine beside Docker"* — is not met; it
loads whole onto the GPU and answers. What it costs is [M17]–[M18]: the on-premise names and `default-chat` cannot be warm at once on
this machine, so a confidential project's first call after anything else pays ~9–12 s, and the laptop runs at ~15% free memory while
the 27B is resident. Told to Rich before Step 2 built on it (§7e's item 0). **Restored**: the 27B unloaded (`keep_alive: 0`), the 4B
re-warmed (30 minutes), the probe removed from the container.
