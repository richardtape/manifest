# S3 — Do LiteLLM's admin API, per-key budgets and per-user spend attribution work against Ollama on the host, and does `ubc-genai-toolkit` talk to it unchanged?

**Answer: yes — every mechanism §10 assumes works, and the toolkit needs no
modification. But three defaults are wrong for Manifest and must be corrected in
P4, or the platform ships a privilege-escalation path, silently corrupt embeddings,
and per-user budgets that leak between apps.**

D7 stands: be a client of LiteLLM, build no gateway. The corrections are all
configuration, not code: set `allowed_routes` on every key Manifest mints; pass
`encoding_format: 'float'` on every embedding call; and namespace the `user` value
per app+environment. Each is one line, each is verified below with a negative
control, and none of them requires a change to `ubc-genai-toolkit`.

| | |
|---|---|
| **Spike** | S3 |
| **Run by** | Claude (Opus 5) |
| **Dates** | 2026-08-30 |
| **Timebox** | 2 days — **used: ~2 h** |
| **Branch** | `spike/S3` |
| **Verdict** | **Yes**, with three mandatory configuration corrections and two model-selection consequences |

---

## Versions

Every finding below is a property of these exact versions. A finding without a
version is not reproducible.

| Component | Version / digest |
|---|---|
| macOS | 26.5.2 (build 25F84), arm64, 36 GiB RAM, 12 cores |
| Docker Desktop | 4.87.0 |
| Docker Engine | 29.7.2 (client and server) |
| Docker Compose | v5.4.0 |
| **LiteLLM** | **1.98.0**, `ghcr.io/berriai/litellm:main-stable`, digest `sha256:20b5044b619055374061a6d5b7b08754cad75aeabbf82ddf4f69cc0cf80ddaf4`, built 2026-08-22 |
| — Python inside it | 3.13 (`/app/.venv/lib/python3.13/site-packages/litellm`) |
| Postgres | `postgres:16-alpine`, digest `sha256:4e6e670bb069649261c9c18031f0aded7bb249a5b6664ddec29c013a89310d50`, server 16.13 |
| Ollama (host app) | **0.33.2**, 12 models present |
| — chat model used | `qwen3.5:4b` (3.4 GB) — **a thinking model**, see Evidence 9 |
| — non-thinking control | `ministral-3:latest` (6.0 GB) |
| — embedding model | `nomic-embed-text:latest` (274 MB), 768 dimensions |
| `ubc-genai-toolkit-llm` | **0.4.0**, checkout at `47e7a25`, **unmodified — `git status` clean before and after** |
| — `openai` Node SDK | **4.104.0** (this version number matters — see Evidence 8) |
| — `ubc-genai-toolkit-core` | 0.1.0 |
| node (host) | v24.12.0 |

---

## Evidence

### 1. LiteLLM + Postgres in Compose, `model_list` reaching Ollama on the host

Two containers, ports per §21 (Postgres 7103, LiteLLM 7106), Ollama left alone as a
host application. `extra_hosts: ["host.docker.internal:host-gateway"]` plus
`api_base: http://host.docker.internal:11434` is all the host reachability needs.

```
$ curl -s http://127.0.0.1:7106/health/readiness
{"status":"healthy","db":"connected"}

$ curl -s http://127.0.0.1:7106/v1/models -H "Authorization: Bearer $MASTER"
{"data":[{"id":"default-chat",...},{"id":"default-chat-onprem",...},{"id":"default-embed",...}],"object":"list"}
```

Only logical names are exposed. A client cannot see a vendor model id.

```
$ curl -s http://127.0.0.1:7106/v1/chat/completions -d '{"model":"default-chat",...,"max_tokens":600}'
  content: "MANIFEST OK"     usage: {completion_tokens: 172, prompt_tokens: 17}

$ curl -s http://127.0.0.1:7106/v1/embeddings -d '{"model":"default-embed","input":"chemistry lab scheduling"}'
  vectors: 1   dim: 768   usage: {prompt_tokens: 5}
```

**Verdict: pass.**

### 2. `/key/generate` mints a virtual key scoped to a `max_budget` — and to models

```
$ curl -X POST /key/generate -d '{"key_alias":"app-chem-lab-scheduler-staging-r1",
    "user_id":"app:chem-lab-scheduler:staging","models":["default-chat","default-embed"],
    "max_budget":50,"budget_duration":"30d","metadata":{"manifest_project":"chem-lab-scheduler",...}}'

key: sk-Q_C_O4G8h_RtNdPonoZ2iA
token_id: c900f0150bf7df6dc6fd372ee3a110492fded70265d99fb3835fc8029eb754db
models: ['default-chat', 'default-embed']   max_budget: 50.0   budget_duration: 30d
metadata: {'manifest_env': 'staging', 'manifest_project': 'chem-lab-scheduler', 'manifest_release': 'r1'}
```

`metadata` round-trips, so Manifest can stamp project/environment/release on the key
and join spend back to its own entities without a side table.

**Negative control — model scope is genuinely enforced:**

```
$ curl /v1/chat/completions -H "Authorization: Bearer $APP" -d '{"model":"default-chat-onprem",...}'
HTTP 403
{"error":{"message":"key not allowed to access model. This key can only access
 models=['default-chat', 'default-embed']. Tried to access default-chat-onprem",
 "type":"key_model_access_denied","param":"model","code":"403"}}
```

This matters beyond scoping: it means **D17's classification gate can be enforced
twice** — once by Manifest at spec validation (§7, where the error is legible) and
again by LiteLLM at request time (where it is a hard stop). A `confidential` app
whose key carries only on-prem groups cannot reach an off-prem model even if the
spec check is bypassed.

**`model_info` carries arbitrary keys and they survive**, so the classification
catalogue can live in the LiteLLM config as one source of truth rather than being
duplicated into Manifest:

```
$ curl /model/info -H "Authorization: Bearer $MASTER"
  default-chat           ollama_chat/qwen3.5:4b        max_classification=internal
  default-chat-onprem    ollama_chat/qwen3.5:4b        max_classification=confidential
  default-embed          ollama/nomic-embed-text       max_classification=internal
```

**Verdict: pass.**

### 3. `/user/new` and the spend endpoints work as §10's table assumes

```
$ curl -X POST /user/new -d '{"user_id":"app:chem-lab-scheduler:staging","max_budget":50,"budget_duration":"30d"}'
HTTP 200

$ curl "/user/info?user_id=app:chem-lab-scheduler:staging"
 user spend: 0.009164   max_budget: 50.0
 keys under this user:
   app-chem-lab-scheduler-staging-r1  spend=0.009164  max_budget=50.0
```

Key spend rolls up to the internal user, so §7's `project_monthly_usd` can sit at
either level. Putting it on the **user** is better: app keys rotate every deploy
(§10) and a budget on the key would reset with each rotation.

**Budgets do reset, but `budget_duration` does not mean what it says.** It writes a
`budget_reset_at` aligned to a *calendar boundary*, not `now + duration`:

```
 now (UTC): 2026-08-30 20:28:59
 bdprobe-1h    | 1h   | 2026-08-30 21:00:00     <- next hour
 bdprobe-1d    | 1d   | 2026-08-31 00:00:00     <- next midnight
 bdprobe-7d    | 7d   | 2026-08-31 00:00:00     <- ALSO next midnight, not 7 days
 budget-...-30d| 30d  | 2026-09-01 00:00:00     <- next month start, 2 days away
 budget-...-1mo| 1mo  | 2026-09-01 00:00:00
 bdprobe-60d   | 60d  | 2026-10-29 00:00:00     <- this one is ~60 days
```

The first window after minting is therefore a **partial** period. For §7's
*monthly* budget this is the desired behaviour and **`1mo` is the value to use** —
but `30d` must not be read as a rolling 30-day window, and `7d` behaved as one day.

**Verdict: pass**, with the `budget_duration` caveat recorded.

### 4. The budget actually binds — with a synthetic cost, and it overshoots by one request

Ollama is free, so §10's "the budgets simply never bind" is correct until a cost is
invented. `input_cost_per_token` / `output_cost_per_token` on the model entry is the
whole trick; nothing else is needed.

Key with `max_budget: 0.002`, each call ≈ $0.0004–0.0007:

```
call 1: HTTP 200  key.spend=0.0
call 2: HTTP 200  key.spend=0.000672
call 3: HTTP 200  key.spend=0.000672
call 4: HTTP 200  key.spend=0.000672
call 5: HTTP 200  key.spend=0.001878
call 6: HTTP 429
{"error":{"message":"Budget has been exceeded! Key=agent-session-tinybudget (sk-...Xm0w)
  Current cost: 0.0022919999999999998, Max budget: 0.002",
  "type":"budget_exceeded","param":null,"code":"429"}}
```

Two things to carry into P4:

- **The budget is a ceiling that is crossed, not one that is never reached.** Final
  spend was **$0.002292 against a $0.002 budget — a 14.6% overshoot**, because the
  cost of a request is unknowable until the completion exists. The overshoot is
  bounded by roughly one request (plus anything concurrently in flight), not by a
  fraction. A hard cap must therefore be set below the real limit.
- **`/key/info` lags the enforcement value.** At the moment call 6 was refused,
  `/key/info` still reported `0.001878` while the check used `0.002292`. Spend
  readback is eventually consistent; the *check* is not the number the API returns.
  A console showing "spend so far" will under-report.

The block applies to every route, and — importantly for the console — a **streaming**
request over budget fails as a clean JSON 429 *before* the stream opens, not as a
truncated SSE stream:

```
$ curl -N /v1/chat/completions -d '{"model":"default-chat","stream":true,...}'
{"error":{"message":"Budget has been exceeded! ...","type":"budget_exceeded",...}}
HTTP 429
```

Raising the budget with `/key/update` restores service immediately (HTTP 200 on the
next call), so an admin unblocking a class mid-term is a single call.

**The reset was watched, not inferred.** A key at `max_budget 0.0005` with
`budget_duration: 1h` was driven to 429 at 20:29 UTC with `budget_reset_at =
2026-08-30 21:00:00`, then polled across the boundary:

```
20:29:24  call 1: HTTP 200 ; call 2: HTTP 429      spend 0.000549 / budget 0.0005
20:39–21:00  … still HTTP 429 …
21:00:42  RESET CONFIRMED — HTTP 200 on a key that was 429
          budget-reset-proof | 0.0005 | 0 | 2026-08-30 22:00:00
```

Spend returned to `0` and `budget_reset_at` advanced to the next boundary. Budgets
are genuinely periodic, not a one-way door.

**Verdict: pass.**

### 5. Per-end-user attribution — D8's "which of 300 students spent the budget"

Passing `user` on a completion attributes spend to that user and **auto-creates the
end-user row**; 300 students need no pre-registration.

```
$ for u in $U1 $U1 $U2; do curl /v1/chat/completions -d "{...,\"user\":\"$u\"}"; done

$ curl "/customer/info?end_user_id=$U1"
{"user_id":"157b4c27b06398bdabf75fb37b6eb967","spend":0.00105,...}

$ curl /customer/list
   157b4c27b06398bdabf75fb37b6eb967  $0.001050
   28f6a19a8f855af21b1753f2067c6b3c  $0.000405
```

$0.00105 is exactly `(12×1e-6 + 233×3e-6) + (12×1e-6 + 109×3e-6)`. The arithmetic is
right, not approximate.

`/spend/logs` gives the per-request join, and **is correctly filtered to the calling
key** — an app sees only its own rows (23 rows, 1 distinct `api_key` hash, its own):

```
20:01:55  model_group=default-chat  end_user=28f6a19a…  spend=0.000405  api_key=c900f0150bf7df6d
20:01:51  model_group=default-chat  end_user=157b4c27…  spend=0.000339  api_key=c900f0150bf7df6d
20:01:45  model_group=default-chat  end_user=157b4c27…  spend=0.000711  api_key=c900f0150bf7df6d
```

Refused requests are logged too (spend 0, empty `model_group`), so a rejection is
visible in the same place as a success.

**A per-end-user *budget* also binds**, and blocks only that user:

```
$ curl -X POST /customer/new -d '{"user_id":"student-carol-hash","max_budget":0.001}'
call 1: HTTP 200 ; call 2: HTTP 200 ; call 3: HTTP 429
{"error":{"message":"ExceededBudget: End User=student-carol-hash over budget.
  Spend=0.0011819999999999999, Budget=0.001","type":"budget_exceeded",...,"code":"429"}}

$ # a different end user on the same app key:
other end user: HTTP 200
```

**Verdict: pass — but see the next finding, which changes how it must be used.**

### 6. **The end-user budget is global across apps.** `user` must be namespaced.

§7 makes `ai.budget.per_user_monthly_usd` a **per-app** field. LiteLLM's end-user
budget is not per-app — it is keyed on the `user` string alone, so the same value
sent by two different apps shares one budget. Same end user, an entirely different
app's key:

```
$ curl -X POST /key/generate -d '{"key_alias":"app-other-tool-staging-r1","user_id":"app:other-tool:staging",...}'
$ curl /v1/chat/completions -H "Authorization: Bearer $APP2" -d '{...,"user":"student-carol-hash",...}'
{"error":{"message":"ExceededBudget: End User=student-carol-hash over budget.
  Spend=0.0011819999999999999, Budget=0.001",...}}
HTTP 429
```

A student who exhausts their budget in one course tool is locked out of **every**
Manifest app that sends the same identifier. Left as-is this is a cross-app denial
of service triggered by ordinary use.

**Fix:** the value Manifest passes as `user` must be scoped to the app and
environment, e.g. `sha256(ubcEduCwlPuid ‖ project ‖ environment)`, not
`sha256(ubcEduCwlPuid)`. Manifest already hashes the PUID, so this costs nothing and
it keeps the cross-app view available on Manifest's side of the mapping. §10's row
currently reads *"app passes hashed `ubcEduCwlPuid`"*, which specifies the wrong
thing — see **Spec actions**.

### 7. Model groups resolve logical names, and repointing changes routing with no client change

This is §7's "an admin repoints the entire fleet by editing one mapping". It works,
at runtime, with no restart — but only for deployments held **in the database**.

```
$ curl -X POST /model/new -d '{"model_name":"default-summarize",
    "litellm_params":{"model":"ollama_chat/qwen3.5:4b","api_base":"http://host.docker.internal:11434",...}}'
model_id=cebe046e-704c-4c09-9728-e1b39e360748
routable after 0.5s

$ curl -X POST /model/update -d '{"model_name":"default-summarize",
    "model_info":{"id":"cebe046e-…"},
    "litellm_params":{"model":"ollama_chat/ministral-3:latest",...}}'
update HTTP 200
  attempt 1: still ollama_chat/qwen3.5:4b
  attempt 2: still ollama_chat/qwen3.5:4b
ROUTING MOVED after ~7.7s — client sent 'default-summarize' throughout
```

Four operational facts P1 and P4 need:

- **A new group is routable in ~0.5 s, but a change to an existing group takes
  ~10 s** to propagate (the DB poll). A new group name falls through to a DB lookup
  on cache miss; an existing group serves from the router's cached deployment list
  until it refreshes. This is why an earlier probe saw four consecutive requests
  still hitting the old deployment after a new one had been added.
- **A config-file model cannot be removed through the API.**
  `POST /model/delete` on a `db_model=False` entry returns
  `{"error": "Model with id=… not found in db"}`, HTTP 400. **So the model catalogue
  belongs in the database, not in `config.yaml`**, or every fleet change needs a
  LiteLLM restart.
- **DB models and their repointing survive a restart**, verified by recreating the
  container: `default-summarize` came back still pointing at ministral-3.
- `/model/update` **requires `model_info.id`**, and omitting it returns a misleading
  `{"message": "Authentication Error, model_info not provided", "type": "auth_error", "code": "400"}` —
  a validation failure dressed as an auth failure.

**Verdict: pass.**

### 8. `ubc-genai-toolkit` unchanged — and the embedding bug that hides inside a green result

The toolkit was loaded read-only from its own checkout at `47e7a25`. Nothing was
edited, installed, or patched; `git status` was clean before and after. Configuration
is exactly §8's injection contract — `provider: 'openai'`, `endpoint` pointing at
LiteLLM, logical model names.

```
PASS  completion  — content="MANIFEST OK" model=default-chat usage={"promptTokens":561,"completionTokens":6} stopReason=stop
PASS  embedding   — vectors=2 dim=192 model=default-embed
PASS  streaming   — chunks=5 chars=9 final="1\n2\n3\n4\n5"
PASS  per-user attribution (user passed via LLMOptions) — content="OK"
PASS  conversation — content="TWO"
PASS  NEGATIVE CONTROL model scope — refused: 403 key not allowed to access model...

ALL TOOLKIT CHECKS PASSED
```

**Every check passed and one of them was wrong.** `nomic-embed-text` is 768
dimensions. The toolkit returned **192**. Nothing errored.

This is exactly the failure mode the roadmap's *"a green result is not evidence a
control is in force"* lesson describes, so here is the mechanism in full.

```
$ curl /v1/embeddings -d '{"model":"default-embed","input":"…"}'                       dim 768
$ curl /v1/embeddings -d '{"model":"default-embed","input":"…","encoding_format":"base64"}'
    type: list | len: 768 | sample: [-0.055561144, -0.011874512, …]        <- NOT base64
$ curl http://127.0.0.1:11434/api/embed …                                   dim 768 (ground truth)
```

1. The OpenAI Node SDK ≥ 4.75 (PR #1312) **defaults `encoding_format` to `'base64'`**
   whenever the caller does not set it, then unconditionally decodes the reply with
   `toFloat32Array` (`node_modules/openai/resources/embeddings.js`).
2. **LiteLLM's Ollama embedding path ignores `encoding_format` and returns a plain
   float list**, as the second curl above shows.
3. `toFloat32Array` on a 768-element float list coerces each float to one byte —
   768 bytes — and reads them as float32: **192 values, almost all zero.**

```
$ node -e "Core.toFloat32Array(Array.from({length:768},…))"
input length 768 -> 192 floats; first 4: [ 0, 0, 0, 0 ]
```

**The toolkit needs no change.** `EmbeddingOptions` has an index signature and
`openai-provider.ts` spreads `...providerOptions` into `embeddings.create`, so the
caller can supply the format and the SDK then returns the response untouched:

```
DEFAULT (no encoding_format)          dim=192  first3=[0,0,0]
CALLER PASSES encoding_format:'float' dim=768  first3=[-0.055561144,-0.011874512,-0.15076102]
matches Ollama ground truth: true
```

C6 holds — but **`encoding_format: 'float'` must be passed on every `embed()` call
through LiteLLM**, which makes it a blueprint and knowledge-pack obligation and a
§16 regression test (assert the dimension, not merely that a vector came back).

**D8 works through the toolkit unmodified.** `user` passed in `LLMOptions` survives
`separateOpenAIOptions`' `rest` and reaches the wire; the spend row carries it:

```
20:10:45 acompletion  ollama_chat/qwen3.5:4b  p=12 c=129  eu=025316b7b08a554df06b7c6325cc6579
```

**Streaming works**, and a streamed call is attributed and charged correctly —
`stream-user | acompletion | 562 | 10 | 0.000592`.

**Verdict: pass, conditional on `encoding_format: 'float'`.**

### 9. The thinking-model trap, in its streaming form — worse than the handoff describes

The handoff warns that a small `max_tokens` returns empty `content` with non-zero
`completion_tokens`. **When streaming, the failure has no floor and no error.**

`qwen3.5:4b` asked to "Count 1 to 5, digits only":

```
max_tokens 600 : SSE frames=500   content frames=0   reasoning_content frames=499
max_tokens 2000: SSE frames=1678  content frames=0   reasoning_content frames=1677
```

At 2000 tokens on a trivial instruction it **still never emitted a content frame**.
LiteLLM faithfully forwards `reasoning_content` deltas; the toolkit's stream callback
reads only `delta.content`, so the app sees **zero chunks, empty string, no error**.
Raising the token budget does not fix it.

Control — the same prompt against a non-thinking model:

```
ministral-3 (default-summarize): frames=6  content frames=5  reasoning frames=0
content: '1\n2\n3\n4\n5'
```

LiteLLM has a per-deployment `merge_reasoning_content_in_choices: true`. It does
change the symptom but is **not** the fix:

```
merge_reasoning_content_in_choices=true: frames=200 content frames=199 reasoning frames=0
content starts: '<think>Thinking Process:\n\n1.  **Analyze the Request:**…'
content ends  : 'l Response:** 1 2 3 4 5</think>1 2 3 4 5'
```

The stream is no longer silent, but the model's chain of thought is now delivered to
the app as visible content — worse for a faculty-facing console, and it can restate
student input. Useful for debugging, wrong for production.

**Consequence: `make seed` must pull a non-thinking chat model for the local
`default-chat` group**, or the reference console demonstrably streams nothing.

**Verdict: pass** (mechanism understood, control captured), **with a model-selection
requirement for P1.**

### 10. Key revocation is immediate

```
$ curl -X POST /key/delete -d '{"keys":["sk-Zoda…"]}'
{"deleted_keys":["sk-ZodaRai6JfSPX_lZVFXm0w"]}
revoked: HTTP 401 after 0.11s and 1 attempt

{"error":{"message":"Authentication Error, Invalid proxy server token passed.
 Received API Key = sk-...Xm0w, Key Hash (Token) =1badf2fea768945550f4327759f5c9ba…",
 "type":"token_not_found_in_db","param":"key","code":"401"}}
```

0.11 s, first attempt. Good enough for app keys that rotate every deploy.

**A TTL is also available and is the better backstop for agent keys.**
`duration: "70s"` on `/key/generate`:

```
immediately: HTTP 200
expired: HTTP 401 after 71s
{"error":{"message":"Authentication Error - Expired Key. Key Expiry time 2026-08-30 20:28:19…",
 "type":"expired_key","param":"sk-...HEaQ","code":"401"}}
```

§11 says the agent key "dies with the sandbox". With a TTL it dies **even if
Manifest never gets to call `/key/delete`** — a crashed control plane or a
destroyed-but-unreconciled sandbox cannot leave a live key behind. Set both.

**Note for §20:** the revocation error body contains the masked key *and the full
key hash*. It must not be passed through verbatim into a faculty-visible `Event`.

**Verdict: pass.**

### 11. **There is no admin port. §12's separation cannot be built as specified.**

§12 denies apps and sandboxes "the LiteLLM **admin** port (the proxy port only is
reachable)". LiteLLM listens on **one** HTTP port:

```
$ # bind addresses inside the container
  127.0.0.11:34377     <- Docker embedded DNS
  127.0.0.1:41973      <- Prisma query engine, loopback only
  0.0.0.0:4000         <- the only HTTP listener: admin AND proxy
```

So a network rule cannot separate them. And by default an ordinary app key reaches
real admin surface:

```
  /key/generate  POST -> HTTP 403  "User can only create keys for themselves…"   <- see below
  /model/info    GET  -> HTTP 200  leaks api_base + costs for the whole catalogue
  /spend/logs    GET  -> HTTP 200  (own rows only — correctly filtered)
  /key/info      GET  -> HTTP 200  (own key)
  /user/new      POST -> HTTP 401
  /customer/list GET  -> HTTP 401
  /model/new     POST -> HTTP 500  Internal server error   <- not a clean refusal
```

`/model/info` does **not** leak upstream `api_key` (LiteLLM strips it), but it does
expose every `api_base` and every per-token cost. In the UBC topology that hands any
app the on-prem endpoints and the commercial providers' base URLs.

#### The escalation: an app key can mint a key that outlives it

That 403 above is not a refusal to mint — it refused only because the requested
`user_id` was someone else's. Minting for itself succeeds:

```
$ curl -X POST /key/generate -H "Authorization: Bearer $APP" -d '{"key_alias":"minted-by-the-app-itself","max_budget":10,…}'
child key: sk-aG31FbBZgAFKj15VGwkhvQ
  completion with child key: HTTP 200

$ curl -X POST /key/delete -d '{"keys":["<the parent>"]}'
{"deleted_keys":["sk-Q_C_O4G8h_RtNdPonoZ2iA"]}
  parent after delete:      HTTP 401
  CHILD after parent delete: HTTP 200      <-- the orphan survives
```

Budget cannot be escalated — `max_budget (9999.0) cannot exceed the caller's own
max_budget (50.0)` — but **an orphan key with its own budget survives revocation of
the key that created it.** For a sandbox running unreviewed agent code (§3.5, D2,
D14) that breaks §11's "the agent key dies with the sandbox": a prompt-injected
agent mints a successor before the sandbox is destroyed.

**The capability comes from `/user/new`.** A key whose `user_id` has a row in
`LiteLLM_UserTable` can mint; a key whose `user_id` was auto-created by
`/key/generate` gets `401 … Your role=unknown`. §10's table has Manifest calling
`/user/new` and minting app keys under that user — so **following §10 as written is
what enables the escalation.**

#### The fix, with a matched-pair negative control

`allowed_routes` on the key confines it exactly:

```
$ curl -X POST /key/generate -d '{…,"allowed_routes":["/v1/chat/completions","/v1/embeddings","/v1/models"]}'

  GET   /v1/models           -> HTTP 200
  POST  /v1/chat/completions -> HTTP 200
  POST  /v1/embeddings       -> HTTP 200
  POST  /key/generate        -> HTTP 403  "Virtual key is not allowed to call this route…"
  GET   /model/info          -> HTTP 403
  GET   /spend/logs          -> HTTP 403
  GET   /key/info            -> HTTP 403
```

Two keys under the *same* `/user/new` user, identical but for `allowed_routes`:

```
  UNCONFINED key mints a child:  -> MINTED sk-b6dlwIHbn9CVxy0mWB3xYA
  CONFINED   key mints a child:  {"detail":"Virtual key is not allowed to call this
                                   route. … Tried to call route: /key/generate"}
```

**`allowed_routes` must be set on every key Manifest mints.** It is strictly stronger
than the port separation §12 asks for, because it also survives an app that reaches
LiteLLM by some path the network policy did not anticipate.

**Verdict: fail as specified, pass with `allowed_routes`.**

### 12. Request/response logging — the default is safe, and the switch is not where you would look

§7 asks what the default *is*. Across **105 spend rows**:

```
 rows | rows_with_messages | rows_with_response | rows_with_request
  105 |         0          |         0          |         0
```

**Negative control**, default settings, a canary string in the prompt:

```
  canary in container stdout:               0
  canary anywhere in the litellm database:  0
  spend row: default-chat | canary-user | {} | {}
```

Prompt content is persisted nowhere by default. Three qualifications:

**(a) `--detailed_debug` writes full prompts to stdout.** The spike ran with it
initially and the container log carried the prompt text 72 times:

```
receiving data: {'model': 'default-chat', 'messages': [{'role': 'user',
 'content': 'Reply with exactly: MANIFEST OK'}], …}
```

Container logs are captured by §14's log pipeline. **P1 must not ship
`--detailed_debug`**, and §20's redaction-at-capture has to assume it may appear.

**(b) The switch is `general_settings.store_prompts_in_spend_logs`, and turning it on
does not populate the column you would check.** With it `true`, `messages` *stays*
`{}` — that column is only written for realtime calls — while the prompt lands in
`proxy_server_request` and the model output in `response`:

```
canary-user-2 | {} | {"id":"chatcmpl-…","model":"default-chat","usage":{…}
              | {"user":"canary-user-2","model":"default-chat","messages":[{"role":"user",
                 "content":"Say OK. My secret is STUDENT-PII-CANARY-ON"}], …}
```

An auditor who checks `LiteLLM_SpendLogs.messages` and finds `{}` would wrongly
conclude nothing is retained.

**(c) It can be flipped at runtime from the admin UI unless it is pinned in YAML.**
`proxy_server.py:6247` prefers the YAML value *only when the key is present in the
YAML*; otherwise the DB value — which the admin UI writes — wins. Verified:

```
config.yaml:  store_prompts_in_spend_logs: false      # explicit
$ curl -X POST /config/update -d '{"general_settings":{"store_prompts_in_spend_logs":true}}'
{"message":"Config updated successfully"}              <- reports success
canary-user-3 | {}                                      <- but does not take effect
canary_leaks: 0
```

So §7's "deliberate, documented configuration decision" has a concrete form:
**`store_prompts_in_spend_logs: false` written explicitly in `config.yaml`**. Absent
the line, one click in the LiteLLM UI silently starts retaining student prompts.

What *is* always stored: `requester_ip_address` (`192.168.65.1`) and `request_tags`
carrying the User-Agent (`["User-Agent: OpenAI", "User-Agent: OpenAI/JS 4.104.0"]`).
Minor, but they belong in the retention decision.

**Verdict: pass — default is safe; three specific things must be pinned.**

### 13. Health, and the error shapes P4 must map to Events

```
/health/liveliness  "I'm alive!"
/health/readiness   {"status":"healthy","db":"connected"}
/health (admin)     healthy 5  unhealthy 1
                      UNHEALTHY: ollama_chat/qwen3.5:4b litellm.APIConnectionError…
/health  without auth -> HTTP 401
```

`/health` genuinely probes each deployment — a group deliberately pointed at a dead
port was reported unhealthy — so it is a real `make doctor` check, not a liveness
ping. It names the *vendor* model rather than the logical group, but it is
admin-only.

**The error envelope is not uniform.** §20 needs machine-actionable codes; this is
what LiteLLM 1.98.0 actually returns:

| Condition | HTTP | `type` | Envelope |
|---|---|---|---|
| Key over budget | 429 | `budget_exceeded` | `{"error":{…}}` |
| End user over budget | 429 | `budget_exceeded` | `{"error":{…}}` |
| Model not allowed for key | 403 | `key_model_access_denied` | `{"error":{…}}` |
| Route not allowed for key | 403 | *(none)* | **`{"detail": "…"}`** |
| Key revoked | 401 | `token_not_found_in_db` | `{"error":{…}}` |
| Key expired (TTL) | 401 | `expired_key` | `{"error":{…}}` |
| Unknown logical model | 400 | **`"None"` (the string)** | `{"error":{…}}` |
| Backend unreachable | 500 | `null` | `{"error":{…}}` |

Two consequences:

- **Key-over-budget and user-over-budget are indistinguishable by code.** Both are
  `429` / `budget_exceeded`; only the message differs — `"Budget has been exceeded!
  Key=…"` versus `"ExceededBudget: End User=… over budget."`. Those are different
  faculty-legible Events ("this app has spent its monthly budget" vs "this student
  has"), so P4 must match on the message string, which is brittle and needs a
  regression test pinned to this LiteLLM version.
- **Route denial uses a different envelope entirely** (`detail`, no `type`), so a
  client that only parses `error.type` will treat it as an unstructured failure.

**Verdict: pass**, with the error table recorded as P4 input.

---

## Sub-question answers

| Sub-question | Answer | Evidence | Consequence |
|---|---|---|---|
| LiteLLM + Postgres in Compose, `model_list` reaching Ollama on the host? | **Yes** — `extra_hosts` + `api_base: http://host.docker.internal:11434` | 1 | P1 ships this verbatim. |
| `/key/generate` mints a key scoped to `max_budget`? | **Yes**, and to `models`, with `metadata` round-tripping | 2 | Manifest joins spend to its own entities with no side table. |
| `/user/new` and the spend endpoints as §10 assumes? | **Yes**; key spend rolls up to the user | 3 | Put `project_monthly_usd` on the **user**, not the key — app keys rotate every deploy. |
| Does the budget actually bind? | **Yes**, with a synthetic per-token cost — and it overshoots by ~one request | 4 | Set the hard cap below the real limit. `/key/info` under-reports during enforcement. |
| Per-end-user attribution — D8's "which of 300 students"? | **Yes**, auto-creating the end-user row | 5 | No pre-registration for a cohort. |
| Is the per-user budget per app? | **No — it is global.** | 6 | **`user` must be `hash(puid ‖ project ‖ env)`.** §10 currently specifies the wrong value. |
| Model groups resolve logical names; repointing changes routing? | **Yes**, at runtime, ~10 s to propagate, no restart | 7 | Catalogue must live in the **DB**: config-file models cannot be deleted via the API. |
| `ubc-genai-toolkit` unchanged, completion **and** embedding? | **Yes** — C6 holds, zero toolkit changes | 8 | But `encoding_format: 'float'` is mandatory on every `embed()`. |
| …does the embedding come back correct? | **No, not by default** — 192 dims of zeros instead of 768, silently | 8 | Blueprint obligation + §16 regression test asserting dimension. |
| Does `user` reach LiteLLM through the toolkit? | **Yes**, via `LLMOptions`' index signature | 8 | D8 needs no library change. |
| Streaming through LiteLLM to the toolkit? | **Yes**, and streamed calls are attributed and charged correctly | 8, 9 | But a thinking model streams **zero** content frames with no error. |
| Key revocation immediate? | **Yes**, 0.11 s | 10 | Also set `duration` — the key then dies even if Manifest never calls `/key/delete`. |
| Does the admin API have its own port? | **No. One port, 4000.** | 11 | §12's port separation is unbuildable; `allowed_routes` replaces it and is stronger. |
| Can an app key mint keys? | **Yes** — and the child survives the parent's revocation | 11 | Closed by `allowed_routes`; matched-pair negative control captured. |
| LiteLLM's request/response logging default? | **Off.** 105 rows, zero prompt content | 12 | Pin `store_prompts_in_spend_logs: false` in YAML or the UI can flip it. |
| Do budgets reset? | **Yes**, but `budget_duration` aligns to a calendar boundary, not `now + duration` | 3 | Use `1mo`. `30d` is not a rolling 30 days; `7d` behaved as one day. |

---

## What survives

The brief names four artefacts. All four are here rather than in a directory,
because they are configuration and prose, not runnable scaffolding — S3 needed no
stack beyond two containers.

- **The working `config.yaml` model-group mapping** → below, and the compose file
  that runs it. **Note the two deliberate changes from what the spike started with:**
  `store_prompts_in_spend_logs: false` is explicit, and the local `default-chat`
  group should point at a **non-thinking** model (Evidence 9) rather than
  `qwen3.5:4b`.

```yaml
model_list:
  - model_name: default-chat
    litellm_params:
      model: ollama_chat/ministral-3:latest    # non-thinking; see Evidence 9
      api_base: http://host.docker.internal:11434
      # SYNTHETIC COST. Ollama is free, so without this every budget is
      # unreachable and every per-user spend row reads $0.00.
      input_cost_per_token: 0.000001     # $1.00 / M input tokens
      output_cost_per_token: 0.000003    # $3.00 / M output tokens
    model_info:
      max_classification: internal

  - model_name: default-chat-onprem
    litellm_params:
      model: ollama_chat/ministral-3:latest
      api_base: http://host.docker.internal:11434
      input_cost_per_token: 0.000001
      output_cost_per_token: 0.000003
    model_info:
      max_classification: confidential

  - model_name: default-embed
    litellm_params:
      model: ollama/nomic-embed-text
      api_base: http://host.docker.internal:11434
      input_cost_per_token: 0.0000001
      output_cost_per_token: 0.0
    model_info:
      mode: embedding
      max_classification: internal

litellm_settings:
  drop_params: true

general_settings:
  master_key: <from the secret store, never a literal>
  # EXPLICIT. Without this line the admin UI can turn on student-prompt
  # retention at runtime and config.yaml will not override it. Evidence 12.
  store_prompts_in_spend_logs: false
```

  Compose, for the two containers (§21 ports):

```yaml
  litellm:
    image: ghcr.io/berriai/litellm:main-stable   # digest-pin in P1
    environment:
      DATABASE_URL: postgresql://…@postgres:5432/litellm
      LITELLM_MASTER_KEY: …
      LITELLM_SALT_KEY: …
      STORE_MODEL_IN_DB: "True"        # required: the catalogue must be DB-held
    extra_hosts: ["host.docker.internal:host-gateway"]
    volumes: ["./config.yaml:/app/config.yaml:ro"]
    command: ["--config", "/app/config.yaml", "--port", "4000"]   # NOT --detailed_debug
    ports: ["7106:4000"]
```

- **The synthetic-cost trick for making budgets testable offline** →
  `input_cost_per_token` / `output_cost_per_token` on the model entry, above. It is
  needed for *two* things, not one: without it budgets never bind **and** every
  per-user spend row reads `$0.00`, so D8's attribution is untestable too.

- **The over-budget error shape** → Evidence 4 and the error table in Evidence 13.
  `HTTP 429`, `type: budget_exceeded`, with key and end-user cases distinguishable
  only by the message text.

- **The LiteLLM logging decision, written down** → Evidence 12. Default is off and
  safe. Manifest pins `store_prompts_in_spend_logs: false` in `config.yaml`, never
  ships `--detailed_debug`, and treats `requester_ip_address` / `request_tags` as
  the only always-retained request metadata.

**One artefact the brief did not ask for and P4 needs most:** the key-minting
template. Every key Manifest mints must carry `allowed_routes` (Evidence 11),
and agent keys must also carry `duration` (Evidence 10):

```json
{ "key_alias": "app-<slug>-<env>-<release>",
  "user_id": "app:<slug>:<env>",
  "models": ["default-chat", "default-embed"],
  "max_budget": 50, "budget_duration": "1mo",
  "allowed_routes": ["/v1/chat/completions", "/v1/embeddings", "/v1/models"],
  "metadata": { "manifest_project": "…", "manifest_env": "…", "manifest_release": "…" } }
```

---

## What did not work

- **`max_user_budget` on `/key/generate` is silently dropped.** It is accepted, not
  echoed in the response, and absent from `/key/info`. Per-end-user budgets are set
  through `/customer/new` (or `/customer/update`) instead — a different object from
  the internal user that `/user/new` creates. LiteLLM has **two** user concepts and
  D8 needs the *customer* one; conflating them wastes an afternoon.

- **`/model/update` without `model_info.id`** returns
  `"Authentication Error, model_info not provided"` with `type: auth_error` and
  HTTP 400. It is a validation error wearing an auth error's clothes; do not go
  looking at credentials.

- **`POST /model/delete` on a config-file model** — `not found in db`, HTTP 400. Only
  DB-held deployments can be removed at runtime.

- **`POST /model/new` from an ordinary virtual key** returns HTTP 500
  `Internal server error` rather than a clean 403. Confining the key with
  `allowed_routes` turns it into a proper 403.

- **Measuring propagation by adding a deployment to an existing group** was the wrong
  first experiment: four consecutive requests still hit the old deployment and it
  looked like the addition had failed. A *new* group name is routable in ~0.5 s
  because it misses the cache and hits the DB; an *existing* group serves from the
  router's cached list until the ~10 s refresh. Test with a new group name.

- **Concluding anything from `LiteLLM_SpendLogs.messages`.** It is `{}` whether
  prompt storage is on or off, for everything except realtime calls. The prompt
  lands in `proxy_server_request`.

- **`merge_reasoning_content_in_choices: true`** as a fix for the thinking-model
  problem. It works — and delivers the chain of thought to the app inside
  `<think>…</think>`, which is worse than silence for a faculty-facing console.

---

## Spec actions

Do not apply these; they are the human's call. Quoted current text, cited section,
proposed replacement.

| Section | Current text | Proposed change | Why |
|---|---|---|---|
| **§10**, key table, "End user" row | "app passes hashed `ubcEduCwlPuid` as LiteLLM `user`" | "app passes `hash(ubcEduCwlPuid ‖ project ‖ environment)` as LiteLLM `user`. **LiteLLM's end-user budget is keyed on this string globally, not per key**, so an un-namespaced hash lets one app's budget exhaustion lock the same student out of every other Manifest app." | Evidence 6. As written, §7's per-app `per_user_monthly_usd` cannot be implemented and ordinary use becomes a cross-app denial of service. |
| **§10**, opening sentence | "Manifest calls LiteLLM's admin API (`/key/generate`, `/key/update`, `/key/delete`, `/user/new`, spend endpoints)." | Add: "**Every key Manifest mints carries `allowed_routes`** restricting it to `/v1/chat/completions`, `/v1/embeddings` and `/v1/models`. Without it, a key whose `user_id` was created by `/user/new` can call `/key/generate` and mint a child key that **survives revocation of its parent**." | Evidence 11. Following §10 as written is what *enables* the escalation, because the capability comes from `/user/new`. |
| **§12**, egress denials | "app or sandbox → the LiteLLM **admin** port (the proxy port only is reachable)" | "app or sandbox → LiteLLM's admin **routes**. LiteLLM serves admin and proxy traffic on a **single port**, so this is enforced per-key with `allowed_routes`, not by network policy. The control is stronger than a port rule: it holds regardless of how the app reaches the proxy." | Evidence 11. One listener on `0.0.0.0:4000`; the specified control cannot be built. |
| **§11**, lifetime policies / sandbox row | "AI key — session-scoped, hard cap" | Add: "and a `duration` TTL, so the key expires even if the control plane never calls `/key/delete`." | Evidence 10. `/key/delete` alone leaves a live key behind if reconciliation fails, and an orphan minted by an unconfined key survives it outright. |
| **§7**, *Classification gates model routing* | "LiteLLM's own request/response logging is a related exposure … Retention and destination for LiteLLM logs are a deliberate, documented configuration decision, not a default." | Add the decision: "**The default is off** — verified across 105 spend rows. Manifest pins `store_prompts_in_spend_logs: false` explicitly in `config.yaml`, because when the key is absent from YAML the admin UI's runtime value wins. Manifest never runs LiteLLM with `--detailed_debug`, which writes full prompts to stdout and hence into §14's log pipeline. When the flag *is* on, prompts land in `proxy_server_request`, not in the `messages` column." | Evidence 12. Turns a stated intention into a checkable configuration, and names the column an auditor would otherwise check and be misled by. |
| **§7**, *Logical model names* | "Manifest maps them to LiteLLM model groups. An admin repoints the entire fleet at new on-prem hardware by editing one mapping" | Add: "The catalogue is held in LiteLLM's **database** (`STORE_MODEL_IN_DB`), not in `config.yaml`: a config-file deployment cannot be removed through the admin API, so a file-held catalogue makes every fleet change a restart. Repointing propagates in about ten seconds." | Evidence 7. |
| **§21**, *What offline AI does and does not prove* | "A 7–8B model through Ollama exercises the *mechanism* end to end: key minting, budget enforcement, streaming, the agent's tool loop, incident-to-repair." | Add: "**The local chat model must be a non-thinking model.** A thinking model streams `reasoning_content` deltas that the toolkit's stream callback discards, so the console receives zero chunks, an empty string and no error — at any token budget. `make doctor` should assert that a streamed completion through `default-chat` returns non-empty content." | Evidence 9. Otherwise the local topology fails the very demo §21 says it proves. |
| **§21**, *Honest divergences from production* | *(list of 7)* | Add an 8th: "**Embeddings through LiteLLM's Ollama path ignore `encoding_format`.** The OpenAI Node SDK defaults to base64 and decodes unconditionally, so an `embed()` call that does not pass `encoding_format: 'float'` returns 192 zeros where 768 floats are expected — silently. Blueprints pass it explicitly; §16 asserts the dimension." | Evidence 8. This is a silent-corruption divergence, not a convenience one, and it is invisible in every green test that does not check the dimension. |
| **§8**, injection contract table | rows `LLM_PROVIDER`, `LLM_ENDPOINT` | No change to the rows; add a note: "the toolkit's provider type is **`openai`** — there is no `openai-compat` provider. `ProviderType` is `'openai' \| 'anthropic' \| 'ollama' \| 'ubc-llm-sandbox'`; `openai-compat-mapping.ts` is a shared internal mapping module, not a provider." | The S3 brief and some prose say "the `openai-compat` provider"; §8 already has it right and the discrepancy should not propagate into P4. |
| **§20** / §14 | *(redaction at capture)* | Add: "LiteLLM's key-revocation error body contains the masked key **and the full key hash**; it must not be surfaced verbatim in an `Event`." | Evidence 10. |

---

## Open questions

- **Does the message-text distinction between key-over-budget and end-user-over-budget
  survive a LiteLLM upgrade?** Both are `429`/`budget_exceeded` and only the prose
  differs, so P4's Event mapping is pinned to strings in 1.98.0. Needs a regression
  test, not a spike. A cleaner alternative worth asking upstream for: distinct
  `type` values.
- **Is the embedding `encoding_format` behaviour specific to LiteLLM's Ollama path,
  or does it also affect a real provider?** Only the Ollama path was reachable
  offline. If LiteLLM passes base64 through from a commercial provider, the bug is
  **local-only** — which is worse in one way: an app's RAG index would be corrupt on
  a laptop and correct at UBC, or the reverse. Cheap to settle the first time anyone
  has a provider key; not worth its own spike.
- **`budget_duration` semantics.** `7d` produced the next midnight and `30d` the
  next month boundary, while `60d` was genuinely ~60 days. `1mo` is what §7 wants
  and is what should be used, but the inconsistency is unexplained and worth a note
  in P4 rather than an investigation.
- **Whether the ~10 s catalogue propagation is configurable.** It is fine for an
  admin fleet repoint. It would matter if Manifest ever needed a model change to be
  atomic with a deploy — it does not today.
- **What happens to in-flight budget accounting under concurrency.** Overshoot was
  measured serially at ~one request. With 300 students on one key the bound is
  "one request per concurrent caller", which is a different number. Not answered
  here; relevant to how far below the real limit the hard cap is set.

---

## Manual steps that could not be automated

C1's bar is *"a new developer reaches a working loop from a clean checkout."*

- **None for S3 itself.** The whole spike ran without `sudo` and without touching
  the host: two containers, `docker compose up`, Ollama already present. No resolver
  file, no CA trust, no loopback alias — S7's host setup was not needed, exactly as
  the handoff predicted.
- **`make seed` must pull a non-thinking chat model** in addition to an embedding
  model (Evidence 9). This is a seed-time download, not a manual step, but it is a
  *choice* that must be recorded rather than inherited from whatever the developer
  happens to have in Ollama. `make doctor`'s "required models present" check should
  name them.
- **`make doctor` gains three checks** from this spike: `/health/readiness` returns
  `db: connected`; `/health` reports zero unhealthy deployments; and a streamed
  completion through `default-chat` returns non-empty content.

---

## Machine state

Left exactly as found. The spike created one Compose project (`s3-spike`: two
containers, one network, no named volumes) in the scratchpad, outside the repository.
Nothing on the host was modified: no resolver file, no keychain change, no loopback
alias, no `sudo`. Ollama was read from and never reconfigured.

`/Users/rich/Developer/ubc-genai-toolkit` was **read only** — `git status` clean at
`47e7a25` before and after, no `npm install`, no patch. `docker-simple-saml` was not
touched. The four pre-existing containers (`docker-simple-saml-saml-idp-1`,
`qdrant-local-dev`, `mongodb`, `mongo-express`) were running before and after.
