# UBC AI Gateway baseline — Task 1's measurements

**Taken on 2026-10-03, 20:35–21:14 PDT, by `manifest-ec`**, in the UBC AI Gateway plan's sitting 1
([`../../plans/2026-10-03-ubc-ai-gateway.md`](../../plans/2026-10-03-ubc-ai-gateway.md), Task 1), coordinated by `manifest-af`, with
Rich's answers relayed through it and recorded — with the clock's times quoted here — in [`../../2026-09-30-decisions.md`](../../2026-09-30-decisions.md). **HEAD was `90bca1e`**
(Task 0's commit) with the coordinator's docs-only commits landing on top. No file under `packages/`, `scripts/`, `infra/` or
`blueprints/` changed in Task 1.

**The machine:** macOS 26.6.2 (25G83), Docker 29.7.2, Node 24.12.0, curl 8.7.1. **Manifest's LiteLLM is 1.98.0**
(`ghcr.io/berriai/litellm@sha256:20b5044b…`, `infra/images.lock`); **the gateway's is 1.102.0** (its `x-litellm-version`).
`postgres:16-alpine` (`sha256:4e6e670b…`).

**The record:**
- every raw answer, redacted, is in [`results-task1-2026-10-03.txt`](results-task1-2026-10-03.txt); where a probe of mine was broken
  (a body, a quoting slip) the record says so beside the re-run, and the broken run's answers are marked as the probe's, not the gateway's;
- every probe is in [`probes/`](probes/): `up.sh`/`down.sh` (the throwaway), `lib.sh`, `stub.mjs`, `redact.pl`, `probe-config.yaml`,
  `guard-inspect.py`, `decrypt-verdict.py` (kept for Task 6's phase 5), and `m1.sh`…`m7c.sh`, one per measurement;
- **the throwaway:** `gw-probe` (LiteLLM from the pinned digest) and `gw-probe-pg` on their own network `gw-probe-net`, LiteLLM on
  127.0.0.1:7197, the host stub on 7198; `OPENAI_API_KEY` a canary; both gateway keys by NAME (`-e NAME`). **Nothing touched
  `manifest-litellm`, 7100 or the control database** — 7100 was F5b's from 20:35:46.
- **No key's value was printed, written or committed.** The real key and the probe key were read only by `set -a; . <file>` inside a
  probe script and sent only by `curl -K -`; every captured body went through `redact.pl`; the count of the real key's value in
  gw-probe's logs, the probe's raw files, the results file and the control plane's boot logs is **0** each time it was counted. **The
  gateway names its own upstreams in its answers' headers** (`x-litellm-model-api-base`, `llm_provider-*`): the record keeps only
  their CLASS (*OpenAI's public API*, *a UBC host*), never an address (M9), and the gateway's own address where it is the gateway.

## Does any measurement break the plan's split? Yes — four things go to Rich before sitting 2

1. **Task 5 DROPS** (`[M4]`.8): through both hops the capable model ACCEPTS a function tool on `/v1/chat/completions`, so Spec
   action 2 is **not needed** and the contract stays `1.6.0`. Sitting 2 is Tasks 2–4. *(Relayed 20:45; Rich's binding Phase 3
   rule followed at 20:52 — below, `[M4]`'s STOP.)*
2. **Decision 6's premise moves** (`[M3]`.6): **hop 1 charges whatever the GATEWAY reports** (`llm_provider-x-litellm-response-cost`)
   and ignores its own pinned price whenever the gateway reports one; a pin binds only when the gateway reports none.
3. **The gateway's own budget and spend reach every hop-1 caller** (`[M3]`.6, `[M2]`): `llm_provider-x-litellm-key-max-budget` and
   `-key-spend` — UBC's key's — and the gateway's upstream address. LiteLLM's tracked `llm_provider-*` leak, now naming UBC's key.
   **And where no fallback stands, the gateway's budget refusal reaches the caller verbatim** — the gateway key's alias and `sk-...` last-4
   fragment with it (`[M5]`(e)).
   Options at code level are in *For sitting 2*, below.
4. **Task 4's branch** (`[M5]`): **A for every case but one** — a spent budget answers **429** (not the `400` the plan feared), a key
   refused a model **403**, a wrong key **401**, an unreachable gateway **500**, and each falls back. **The one C: a model the gateway does not
   serve answers `400 invalid_request_error`**, which the guard refuses a fallback as malformed — nothing but `param=None` tells it from a
   malformed request. Options are in *For sitting 2*.

And one fact for Rich as the gateway's administrator, at his ask (`[M4c]`): **any virtual key reads any other key's stored response
by id.**

---

## [M1] The gateway's models, and the key's own limits — direct, the real key

`GET /v1/models` → `200`, **ten models**. `GET /model/info` (and `/v1/model/info`, identical) shows `litellm_params` for every model
to an ordinary virtual key, an `api_base` for three of them — recorded as PRESENT/ABSENT only.

| Model | Price in / out per 1M (cache read) | Gateway's `litellm_provider` | `api_base` shown | Where it runs (Rich, `[M9]`) |
|---|---|---|---|---|
| `gpt-6-luna` | 0.10 / 0.50 (0.01) | openai | absent | OpenAI, off-prem (its upstream header: OpenAI's public API) |
| `gpt-5.6-luna` | 0.20 / 1.20 (0.02) | openai | absent | OpenAI, off-prem |
| `gpt-5.6-terra` | 2.00 / 12.00 (0.20) | openai | absent | OpenAI, off-prem |
| `gpt-5.4-mini` | 0.75 / 4.50 (0.075) | openai | absent | OpenAI, off-prem |
| `llama3` | 2.65 / 3.50 | **bedrock** | absent | AWS Bedrock, off-prem |
| `qwen3.8-27b` | — | — | absent | UBC hardware (its upstream header: a UBC host behind istio-envoy) |
| `qwen3.6-35b-a3b` | 0.05 / 0.10 | — | absent | on-prem (Rich, 20:25); **the gateway falls back from it to `gpt-6-luna`** (`[M5]`) |
| `phi3.5` | — | — | **present** | old on-prem hardware, *"aren't really to be used"* (Rich) |
| `llamacpp/llama3.1` | 0 / 0 | openai | **present** | the same |
| `nomic-embed-text` | 0 / 0 | ollama | **present** | the same (an embedding model; its `mode` reads `chat`) |

- **`GET /key/info` → `403`**: *"Virtual key is not allowed to call this route. Only allowed to call routes: ['llm_api_routes']"* —
  the real key's and the probe key's alike. So **`UBC_AI_GATEWAY_KEY_EXPIRES` is Rich's reading of his admin UI** (20:56: *"Expires Jan
  1, 2027 at 3:23 PM"*), appended to `.env` as `2027-01-01` at 20:57, and **Task 6's `/key/info` comparisons become the response
  headers'**: every answer carries `x-litellm-key-max-budget` and `x-litellm-key-spend` for the key that asked.
- **The key's ceiling is 30 USD, not 20** (`x-litellm-key-max-budget: 30.0` on every answer; Rich, 20:56 in the decisions file: *"The
  platform key has $30 budget … No rpm/tpm limits. All models. No fallbacks set up."*). **The 16:23 figure of 20 USD is superseded.**
- **The gateway's LiteLLM is 1.102.0**, sent as `x-litellm-version` on completions (not on `/v1/models`).
- **`[M9]` (Rich):** *"No, prompts aren't stored"* (20:42); off-prem models are `internal` for this plan's purposes (U1's High Risk may go
  off-prem; mapping Manifest's classes to U1 is a separate spec question, the coordinator's); **the on-premise models' classifications
  are DEFERRED by Rich, 20:42, to sitting 2's close** (`MANIFEST_GATEWAY_MODELS`).

## [M2] Hop 2 alone — direct to the gateway, the real key

- **Chat, plain and streamed:** `gpt-6-luna` `200` in 2.7 s / 1.8 s, the body's `model` the gateway's name, `usage` complete, a streamed
  answer's last frame carrying `usage` with a `cost` field; `qwen3.8-27b` `200` in 0.85 s / 0.62 s, a THINKING model (23 of 27
  completion tokens reasoning; content `"\n\nok"`).
- **`x-litellm-response-cost`:** `3.3e-06` for `gpt-6-luna`'s 13/4 tokens (= the map's 1e-7 / 5e-7); `0.0` for `qwen3.8-27b`. A
  STREAMED answer's header reads `0.0` (sent before the stream ends) — the cost is in the last frame's `usage.cost`.
- **`/chat/completions` without `/v1` answers `200` too**; Decision 5's default keeps `/v1`.
- **A function tool on chat completions: ACCEPTED** — `finish_reason: tool_calls`, `get_weather`, with `reasoning_effort` unset and
  `"none"`. **S5's refusal does not reproduce on the gateway** (`[M4]`.8 repeats it through both hops).
- **Latency, Decision 12:** `gpt-6-luna`, ~1,500 words not streamed: **35.2 s** (2,963 tokens, 1,024 reasoning), 27.9 s, 31.1 s; streamed,
  the **first frame after 13.0 s** (reasoning before any text), `[DONE]` after 35.6 s.

## [M3] Both hops, through `gw-probe` — the key by REFERENCE

- **`POST /model/new`** with `api_key: 'os.environ/UBC_AI_GATEWAY_API_KEY'` → `200`. **`/model/info` shows NO `api_key`** (absent, not
  masked, not the reference) and shows `api_base` (the gateway's address). The real key's value in that answer: **0**.
- **The price LiteLLM 1.98.0 gives the gateway's names** (`openai/<name>`): `gpt-6-luna` **1e-7 / 5e-7, cache read 1e-8** — LiteLLM's
  own map, identical to the gateway's; `qwen3.8-27b` **0 / 0** (Decision 6's `confidential` case).
- **The row, decrypted by verdict** (`decrypt-verdict.py`, LiteLLM's own
  `litellm.proxy.common_utils.encrypt_decrypt_utils.decrypt_value_helper` and the container's salt key): **`equals the reference`**, for
  both registrations; stored as ciphertext. A clear-text `pg_dump`: the reference string **0** times, the key's value **0**. **The
  value is never stored**; Task 6's phase 5 runs the same snippet against `manifest-litellm`.
- **Hop 1 charges exactly what the gateway charges — and ignores its own pin** (`[M3]`.6, 6c, 6d). Measured with the cache
  (*I8*): a ~2,800-token fixed preamble sent twice — call 1 **$0.0003528** at both hops (the gateway's breakdown: input 3e-7, output
  2e-6, **cache creation 3.505e-4**), call 2 **$0.00003034** at both (**cache read 2.804e-5**). Then **pinned** as Task 2 pins (input and
  output in `litellm_params`): at the map's price, and at **10× it** — **hop 1 still charged the gateway's $0.00003124**, to the
  digit. Hop 1 reads the provider's `llm_provider-x-litellm-response-cost` when one is sent. **When the gateway sends none
  (`qwen3.8-27b`), the pin binds**: pinned at the stand-in's $1 / $3 a million, 59/30 tokens were charged **$0.000149** (= 59×1e-6 +
  30×3e-6); unpinned, **$0**. *What Task 2's pin then means:* for a gateway model the gateway prices, the pin is a fallback only — the
  person is charged UBC's price, cache rows included (the ratio Decision 6 rests on is **1.0**); for one it does not price, the pin is
  the whole price, and Decision 6's `confidential` synthetic pin works as written.
- **A scratch key's own `/key/info` is refused by its `allowed_routes`**: the agent key's three routes do not include it, so a key
  reads its spend only through the admin (`/key/info?key=`) or its answers' `x-litellm-key-spend`.
- **`litellm_proxy/gpt-6-luna`** registers, prices (1e-7 / 5e-7 / 1e-8) and answers exactly as `openai/` does (cost `3.3e-06` at both
  hops). *(m3.sh's first attempt answered `422`: my body, broken by brace expansion.)*
- **TLS:** `gw-probe` reached `https://ai-gateway.apps.ltic.ubc.ca` with verification ON — no `ssl_verify` in any `litellm_params`, the
  image's own `SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt`, no override. No STOP.
- **Timeouts (Decision 12)**, at the stub's `/slow/` path (first byte after 6 s): **`timeout: 2` is honoured per ATTEMPT, and LiteLLM
  retries twice** — `408` after ~10.8 s, 3 attempts, streamed or not; **`stream_timeout: 2` alone bounds only a stream** (a plain call
  waited the full 6 s and answered `200`); **with `num_retries: 0` in `litellm_params`, `timeout: 2` gives up at ~2.05 s**, streamed or
  not, one attempt. So a black-holed gateway holds a caller `(1 + retries) × timeout` plus backoff before the fallback answers —
  `GATEWAY_TIMEOUT_S` must be read with the retries, and the longest legitimate answer measured is `[M2]`'s 35.2 s.

## [M4] `/v1/responses` through both hops — **Task 5 DROPS; a STOP for Phase 3**

- **`[M4]`.8 — A TOOL ON `/v1/chat/completions` THROUGH BOTH HOPS IS ACCEPTED** (`finish_reason: tool_calls`, `reasoning_effort`
  unset and `"none"`). By the plan, **Task 5 does not run and Spec action 2 is not needed** (Rich, Q2: conditional on a refusal).
- `POST /v1/responses` with a function tool, on a key with the three routes plus `/v1/responses`: `200`, a `function_call` output,
  **charged `1.52e-05` = usage × the price, streamed and not** (never `$0`). Hop 1 calls the provider's **`/v1/responses` natively**
  (the stub saw that path), never bridging. On `default-chat` (Ollama) it answers offline.
- **Responses are STORED by default** (`store: true`). `previous_response_id` reaches the provider (its `400` was OpenAI's *"No tool
  output found"* — my follow-up was malformed).
- **`allowed_routes` matches by PREFIX**: a key listing only `/v1/responses` was refused `/responses` and `/v1/chat/completions` (`403`,
  *"Virtual key is not allowed to call this route"*) but **admitted `GET /v1/responses/{id}` and `/v1/responses/{id}/input_items`**.
  An intake-shaped key (the three routes) is refused `/v1/responses` `403` with a `detail` body — not the error envelope.
- **`/key/update { models }` KEEPS `allowed_routes`** (re-measured through the admin — a key whose routes omit `/key/info` cannot read
  itself, which is what the first reading read as `null`).
- **THE STOP — ONE KEY READS ANOTHER KEY'S CONVERSATION.** Key B, a second scratch key with the same routes, asked `GET
  /v1/responses/{key R's id}` and was answered `200`: the same response (model, the `function_call`, 57/19 tokens); a key with only
  `/v1/responses` read its `input_items` — the first key's prompt. Hop 1 forwards the GET to the provider with the DEPLOYMENT's key,
  and on the gateway every Manifest key shares ONE upstream key. **Nothing open today is exposed** — every app, agent and intake key
  holds the three routes, and Task 5 dropped. **Rich, 20:52 (decisions file): *"Yes, a binding Phase 3 rule"*** — when Phase 3 first
  gives any Manifest key `/v1/responses`, its plan forces `store: false` OR refuses `GET /v1/responses/{id}` and `…/input_items`, with a
  test that one key cannot read another's answer.

## [M4c] At Rich's ask — two gateway keys and one stored response, direct (hop 2 only)

The real key made one `POST /v1/responses` (13/5 tokens, `store: true` by default); **the PROBE key — restricted to
`qwen3.6-35b-a3b`, on another team — read it: `GET /v1/responses/{id}` `200`** (the whole response object: `output`, `instructions`,
`usage`, `user`, `metadata`, …) **and `…/input_items` `200`** (the prompt). Only field names were recorded. **The real key's `DELETE
/v1/responses/{id}` answered `200 deleted`**, and its `GET` after it `404`; the id and every body were deleted from the scratchpad.
**At UBC's gateway, a response id is all a key needs** to read another key's conversation, whatever its model list or team. A fact
for Rich as the gateway's administrator.

## [M5] The error shapes the guard meets — through both hops — **Task 4's branch**

Each case its own model with a `general` fallback to `probe-ok` (the stub); the REAL guard decides; `guard-inspect.py` printed the failed
attempt's class and status attributes. *(The first a–d run's bodies were broken by my default messages — every case `400 "Invalid JSON
payload"`, the probe's error; and it left `probe-capable` with no fallback. Phase `a2` re-ran (a) with one.)*

| Case | Client sees | Guard reads | Fallback |
|---|---|---|---|
| (a) malformed (`max_tokens: -1`, role `wizard`, `n: "abc"`) | **`400` `invalid_request_error`**, `param` = the field | `BadRequestError` 400, `invalid_request_error`, code `'400'`, param = the field | **refused** — correct |
| (b) a `422` | none found: `temperature: "hot"` is answered `200`; `n: "abc"` is `400` | — | — |
| (c-i) a model the gateway does not serve | **`400` `invalid_request_error`** *"Invalid model name"* | `BadRequestError` 400, `invalid_request_error`, code `'400'`, **param `None`** | **refused** — as if malformed |
| (c-ii) a served model the key may not use (the probe key) | `200` from the fallback | `APIError` **403** | allowed, silently |
| (d) a wrong key | `200` from the fallback | `AuthenticationError` **401** | allowed, silently |
| (e) the key's budget spent (the probe key) | `200` from the fallback, ~4.7 s; **with no fallback, the gateway's `429` verbatim** | `RateLimitError` **429**, `throttling_error`, code `'429'` | allowed, silently |
| (f) the key's rate limit | **unmeasured: no limit set** (Rich, 20:56) | | |
| (g) the gateway unreachable | `200` from the fallback, ~4.5 s | `InternalServerError` 500 | allowed |

Streamed, (a), (c-i), (c-ii) and (g) behave the same: (a) and (c-i) are refused `400` before any frame; (c-ii) and (g) stream the
fallback's answer. **(d)'s key fragment:** the fallback answered, so the client never saw the gateway's `401`; the count of `sk-...`
fragments in `docker logs gw-probe` and in LiteLLM's tables is **0**.

**The gateway has its own fallback.** Its `400`s quote its router: *"Fallbacks=[{'qwen3.6-35b-a3b': ['gpt-6-luna']}]"* — on-prem
`qwen3.6-35b-a3b` falls back to off-prem `gpt-6-luna` at the gateway, though the key's admin page shows none (Rich: *"No fallbacks set
up"*, 20:56 — he read the key's page). So `qwen3.6-35b-a3b` cannot be `confidential` while that fallback exists (Decision 7). Rich, 21:12:
*"Don't worry about the fallback that's currently set I can sort that later, it's not a blocker for us here."* Sitting 2's close chooses
`MANIFEST_GATEWAY_MODELS` knowing it.

**(e), measured on the PROBE key, never the real one.** Its budget first read **`0.1`** (`x-litellm-key-max-budget: 0.1`), not the `$0.01`
asked for: twelve identical ~32k-token calls were served from the gateway's prompt cache after the first (`$0.0016`, then `$0.0000118`
each), and ten more with a unique prefix each (`$0.0016` each, 20 s apart) took its spend to `$0.016` — still short. Rich lowered it to
**$0.01** (21:12, the decisions file), below what it had spent. Then, at 21:13:
- **direct (hop 2): `429`, `type: budget_exceeded`**, *"Budget has been exceeded! Key=<the key's alias> (sk-...<last 4>) Current cost: …, Max
  budget: 0.01"* — the gateway's budget refusal is a **429, not the `400`** `manifest_guard.py:48-50` names as its known limit;
- **through both hops, with a fallback: the guard reads `RateLimitError` 429 and allows it** — the fallback answers, plain and streamed;
- **through both hops with NO fallback: the caller receives the gateway's `429` verbatim** — `throttling_error`, the gateway key's
  ALIAS, its `sk-...` last-4 fragment, its current cost and its budget (21:13:39). On the real key that is what every app on a
  `MANIFEST_GATEWAY_MODELS` name — which carry no fallback — would read once the $30 is spent. Finding 3's other face.

**The branch — A for every case but one:** (c-ii) `403`, (d) `401`, (e) `429` and (g) `500` arrive as non-malformed statuses and fall back;
(a) is refused, correctly. **(c-i) is C**: a model the gateway does not serve arrives as `400 invalid_request_error` with nothing but
`param=None` to tell it from a malformed request (which can carry `param=None` too) — so the capable model withdrawn by LTIC, or a typo in
the setting, answers every caller `400` with no on-premise fallback. Put to Rich through the coordinator (21:14) with the options in *For
sitting 2*.

## [M6] What hop 1 forwards to its provider (names only)

To a stub provider, with an app-shaped key (a budgeted LiteLLM user, key metadata) and a request carrying `user` (§10's end-user hash),
`metadata`, `x-litellm-trace-id`, `x-litellm-session-id`, `traceparent` and a custom header: **the body's fields were `messages` and
`model`** (and `stream`, `stream_options` when streamed); **the headers were the OpenAI SDK's own** (`authorization`, `user-agent`,
`x-stainless-*`). **Neither the end-user hash, nor the key's or the request's metadata, nor any trace header reached the provider.** So
UBC's gateway sees one key and the messages, and cannot attribute a call to a Manifest user, project or app.

## [M7] Where the key goes — four cases on both providers

`gw-probe`'s `OPENAI_API_KEY` is a canary; the stub records only the bearer's class.

| `api_key` | `openai/` | `litellm_proxy/` |
|---|---|---|
| `os.environ/PROBE_UNSET` (no such variable) | **canary** | **canary** |
| `os.environ/PROBE_EMPTY` (set, empty — what `${…:-}` gives) | **canary** | **canary** |
| `os.environ/STORE_MODEL_IN_DB` (`"True"`) | **the row poisons the router** (below) | the same |
| none at all | **canary** | **canary** |
| `os.environ/MANIFEST_STUB_BEARER` | **the stub bearer** (`probe-not-a-key`) | — |

- **Every unresolved, empty or absent key sends `OPENAI_API_KEY`, on BOTH providers** — `litellm_proxy/` too. So the mechanism
  Decision 4 guards is LIVE, and **Decision 2's hoped-for difference does not exist**: `litellm_proxy/` is no safer, so `openai/` stands
  (the guard's and F8's measurements were made on it).
- **A reference that resolves to a BOOLEAN poisons LiteLLM's router.** LiteLLM's `get_secret` turns `"True"` into `True`, which fails
  `LiteLLM_Params`'s string check at the router's reload (*"Input should be a valid string … input_type=bool"*), and **from then on every
  later `/model/new` answers `500` *"saved to the database, but … not live in this pod's router"*** — five registrations in a row never
  went live. Deleting the row is not enough while a second such row remains; with both gone, every pending row went live within ~45 s.
  The plan's Global Constraints already forbid a boolean-looking reference; this is why, measured (TRAPS).
- **The real key's value**: **0** in `docker logs gw-probe`, **0** in the probe's raw files.

## [M8] The platform's gates, 20:34–20:35

`EXPECT_TESTS=3289`, `EXPECT_FILES=201`, `EXPECT_DOCTOR=21`, `EXPECT_VERIFY=66`. `make doctor` 21 checks, 0 failed, 0 warnings (after
Task 0's uncomment — `.env` gaining a key `.env.example` holds commented is no failure); `make verify` 66, 0 failed, 0 warnings. No
`pnpm test` on an unchanged tree: Task 0's two runs (3289/3289 each) are the sitting's.

## [M9] Rich's statements (relayed by `manifest-af`, quoted in the decisions file)

- **Classifications:** off-prem (`gpt-*`, `llama3`) — `internal` for this plan; on-prem — **deferred by Rich, 20:42, to sitting 2's close**.
- **Prompt retention:** *"No, prompts aren't stored."* (20:42)
- **Gateway-side fallbacks:** *"No fallbacks set up"* (20:56) — **but the gateway's router quotes one, `qwen3.6-35b-a3b → gpt-6-luna`**
  (`[M5]`, measured from its own `400`s); Rich, 21:12: *"Don't worry about the fallback that's currently set I can sort that later, it's not a
  blocker for us here."*
- **The key's limits:** *"$30 budget. Expires Jan 1, 2027 at 3:23 PM. No rpm/tpm limits. All models."* (20:56) — 30, not 20.
- **`UBC_AI_GATEWAY_KEY_EXPIRES=2027-01-01`** appended to `.env` at 20:57 (Decision 11), from his reading.

## For sitting 2

- **Task 2's pin** charges the gateway's price for a priced model (the pin is never read) and the pin's for an unpriced one. Its
  *refuse a model LiteLLM prices at `0`* rule still matters for the latter; Decision 6's cache-read row is moot.
- **Task 2's `timeout`:** `GATEWAY_TIMEOUT_S` with `num_retries` beside it, or the stall is three times the constant.
- **Task 2's compose line `${UBC_AI_GATEWAY_API_KEY:-}`** gives LiteLLM an EMPTY variable when `.env` has none, and an empty reference
  sends `OPENAI_API_KEY` (`[M7]`) — the fail-closed boot (Decision 4) is what keeps it from UBC.
- **The `llm_provider-*` leak (finding 3).** Read in the pinned image: LiteLLM 1.98.0 forwards EVERY provider header as
  `llm_provider-{header}` (`litellm_core_utils/llm_response_utils/get_headers.py:7-38`), keeps them in the response's
  `_hidden_params["additional_headers"]`, and **prices hop 1 from one of them** — `cost_calculator.py:1698-1712`,
  `get_response_cost_from_hidden_params`, reads `llm_provider-x-litellm-response-cost` (the streaming path sets it at
  `streaming_handler.py:1805`). **So the leak and the billing are one mechanism**: anything that drops the headers BEFORE the cost is
  computed also moves every gateway charge from UBC's price to the pin. No setting that drops them was found in this read. Options,
  each at code level, for Rich before sitting 2:
  (a) **strip in the guard file, AFTER costing**: a hook on `manifest_guard.py`'s class that removes `llm_provider-x-litellm-key-*` and
  `llm_provider-x-litellm-model-api-base` from what the CLIENT receives (the proxy's response headers), leaving `additional_headers` —
  and so the cost — alone; covers every caller, streamed or not, testable against the stub with headers the stub sends. Which hook
  sees the outgoing headers in 1.98.0 is to be read first;
  (b) **strip at the edge**: Caddy's `header_down -llm_provider-*` on the route to LiteLLM — apps reach LiteLLM on their own network,
  not through the edge, so it covers the console and agents only;
  (c) **accept and record** until *before production*, where LiteLLM's four leaks are already tracked — the gateway key's budget and
  spend, and the gateway's upstream addresses, visible to every app and agent until then.
  *Recommendation: (a), measured in sitting 2 — or (c) if Rich judges a 30 USD key's spend no secret.*
- **Task 4:** Branch **A** for (c-ii), (d), (e), (g); **C for (c-i)**. Options for (c-i), at code level:
  (1) *recommended* — **the guard unchanged (Task 4 writes no guard code); the BOOT catches it**: Task 2's and Task 3's registration makes
  one real call on each new gateway deployment through LiteLLM (its `/health?model=` or a one-token completion by the admin) and refuses a
  registration the gateway answers *"Invalid model name"*, with one `[boot]` line — a typo is caught at boot; a model withdrawn while
  running stays a LOUD `400` to callers rather than a silent move to the on-premise model; `make verify` could carry the same probe; cost:
  about one call per boot per gateway model;
  (2) the guard allows a fallback after a `400` whose `param` is `None` — which lets every param-less malformed request through, reversing
  Spec action 6's rule;
  (3) the guard reads the message text — which its own rule forbids, and which no LiteLLM version promises.

## Step 10 — torn down, 21:14

`down.sh`: **0** `gw-probe*` containers, networks and volumes left, the stub gone (7197 and 7198 free). **The probe key's file
`/Users/rich/manifest-gw-probe.env` removed — `rm`, then `test ! -e` passes.** Every raw answer in the scratchpad deleted. The real key's
value counted **0** in the results file and in this README before the commit. **The probe key itself is Rich's to delete at the gateway**
(it expires within a day regardless). The real key's own spend header last read **$0.0056** at ~20:41 (cumulative since its creation);
the measurements after it were single small calls, and the large ones were all on the probe key.
