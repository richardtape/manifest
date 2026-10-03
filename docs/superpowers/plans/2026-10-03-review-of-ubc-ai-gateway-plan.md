# A fresh review of the UBC AI Gateway plan (2026-10-03)

> **What this is.** A read-only review of [`2026-10-03-ubc-ai-gateway.md`](./2026-10-03-ubc-ai-gateway.md), at `f5faf87` plus the
> header edit `3f42f5d`. A fresh background agent of `manifest-94` wrote it at Rich's word (15:57 PDT, *"Quick review first"*). It checked
> `.env` key names by count only, never values. **The fixes are not yet applied**; a fresh platform session applies them before
> sitting 1.
>
> **Rich's answers (16:13 PDT, through the question tool; `2026-09-30-decisions.md`):**
> - **The plan: *"Approve with the fixes (Recommended)"*.** Approved once these fixes are applied, **except the one he declined below**.
> - **`OPENAI_API_KEY`: *"Keep it as a backup"*** (over the recommended *"required removal at sitting 2's close"*). So **do not** make
>   removing it a precondition. C1's other fixes (fail closed, measure the four cases, fingerprint the key) still apply, and matter
>   MORE because the key stays.
> - **The virtual key's ceiling: *"Yes, before sitting 2"*.** Rich sets a max budget and budget duration on the key in the gateway's
>   admin UI, and the figure is recorded. Make it a Rich-step before sitting 2.
> - **The key in `.env` now (I1): *"Comment out the .env line"*.** `manifest-94` prefixed `UBC_AI_GATEWAY_API_KEY=` with `# ` at
>   16:14 without reading the value, before faculty-ready's next control-plane restart. **Sitting 1 adds the scrub entry, with its
>   test, and THEN uncomments the line**: a Rich-step, or an agent's `sed` that reads no value.

## Summary
1. The shape matches Rich's 15:28 and 15:42 decisions. Almost every file:line premise checks out at HEAD; Read-this-first #14 is
   false (M1).
2. The main risk is Rich's real `OPENAI_API_KEY` reaching UBC's gateway. If the gateway-key reference resolves to nothing,
   LiteLLM's `openai/` provider very likely sends `OPENAI_API_KEY` instead, and a 401 then falls back silently to the on-prem model.
   The plan only detects this, with a `make verify` check, and Decision 4 keeps a gateway registration after the key is gone.
3. Several checks cannot fail as written:
   - the key's DB count, because LiteLLM encrypts the column;
   - the acceptance's spend "within a cent";
   - the acceptance's "answered by the gateway" check, which does not exist in phase 2;
   - control (b), whose prediction contradicts Decision 4;
   - the Task 2 Docker case's `"True"` stand-in, which LiteLLM likely turns into a boolean.
4. One boot-order bug: gateway models are registered after the capable model's fallback is set.
5. **Verdict: approve with the fixes below.** Most of them change Task 1's measurements, so apply them before sitting 1.

## Critical

**C1. `OPENAI_API_KEY` can be sent to UBC's gateway, and the fallback hides it.**
- **Evidence:**
  - Plan l.257–260 (Decision 4) only adds a `make verify` check, which detects but does not prevent.
  - Plan l.717–719: the witness Docker case is "red until make verify's check exists", but a verify script cannot change what
    LiteLLM sends, so it can never go green.
  - Decision 4 keeps the working model when `.env` lacks the key, and `capable.ts:211-216`'s `refuse` keeps every priced
    deployment, so a gateway registration survives the key's removal.
  - A 401 falls back by design (`manifest_guard.py:11-13`).
  - `infra/compose.yaml:235` hands `OPENAI_API_KEY` to LiteLLM.
  - [M7].1 (l.498) tests only an unset variable, but Task 2's compose line `${UBC_AI_GATEWAY_API_KEY:-}` produces a set-but-EMPTY
    one. That is falsy in LiteLLM's `api_key or … get_secret("OPENAI_API_KEY")` chain.
- **Fix:**
  - [M7] measures four cases on `openai/` and on `litellm_proxy/`: unset, empty, `"True"`, and no `api_key`. Note that
    `litellm_proxy/` falls back to `LITELLM_PROXY_API_KEY`, which is unset; weigh that in Decision 2.
  - **Fail closed:** on `canary`, the boot REMOVES gateway registrations when `keyInEnv` is false, instead of keeping them.
  - The verify check compares a fingerprint, not presence, so a rotated key in a stale LiteLLM is caught.
  - ~~Make removing `OPENAI_API_KEY` a precondition of sitting 2's close.~~ **Declined by Rich: the key is kept as a backup.**

## Important

**I1. Today: the gateway key is not scrubbed.** `secrets/scrub.ts:6-32` lacks `UBC_AI_GATEWAY_API_KEY`. A restart exports it into
`runtime/docker/builder.ts:441` and `source/scan-commits.ts:145`, which both spawn with `{...process.env}`. **Handled now** by
commenting out the `.env` line (above). **The plan:** Task 2's scrub line and its test move to **sitting 1**, before the line is
uncommented.

**I2. The Task 2 Docker case uses `"True"` as its stand-in bearer (l.701–705).**
- LiteLLM's `get_secret` very likely turns `"True"` into a boolean, so the case would send the real `OPENAI_API_KEY` to the host
  stub on every Docker-tier run. Control (c) (l.725–726) does the same deliberately.
- **Fix:**
  - Use a non-boolean, non-secret variable (e.g. compose-set `MANIFEST_STUB_BEARER: probe-not-a-key`), and add `"True"` to [M7].
  - Run control (c) at the unit tier only.
  - Delete the conditional "unset reference" Docker case.

**I3. Probes and cases that hit the stub may carry the real gateway key.** [M4].2 (l.462–463), [M6] (l.493) and Task 3's Docker case
(l.820–823) register stub-bound deployments without naming their key, so a copied `probe-capable` or `gatewayKeyRef()` would send
the real gateway key to the stub. **Fix:** every deployment aimed at the stub names a literal canary `api_key`, or I2's harmless
reference.

**I4. [M3].5's key count cannot fail (l.453–454).** LiteLLM encrypts every `litellm_params` value with the salt key, so a `pg_dump`
count of the clear-text key is 0 either way. **Fix:** decrypt the row inside `gw-probe` with its scratch salt key, printing only
"equals the reference" or "other". Do the same in Task 6's phase 5 against `manifest-litellm`.

**I5. Boot order.** Task 3 (l.735–736, 818) calls `gatewayModelsAtBoot` after `capableModelAtBoot`, which sets the fallback
(`capable.ts:454-458`). Decision 8 allows the fallback to name a gateway model, but on a fresh registration `unfit` refuses it as
"not in the catalogue". **Fix:** run `gatewayModelsAtBoot` first.

**I6. Task 6's acceptance and controls cannot fail as written.**
- Phase 2 (l.976–980) has no "answered by the gateway" check: a fallback reply is a 200, and spend still rises.
- "Within a cent" passes with spend = 0, since one call costs ~$0.0001.
- Control (a) (l.993–995) is predicted red at the missing check.
- Control (b) (l.996–997) predicts `NOT RUN`, but Decision 4 and Task 2's test (l.598–605) keep the registration.
- **Fix:**
  - Assert `x-litellm-attempted-fallbacks` is absent and the body's model is not `qwen3.8:27b`.
  - Assert spend > 0 and equal to the pinned price at `toBeCloseTo(…, 12)`, as `capable.docker.test.ts:280` does.
  - Re-predict control (b) under C1's fail-closed fix.

**I7. Spend on `/v1/responses` is never measured.** [M4] (l.458–471), Task 5's Docker case (l.925–930) and phase 3 (l.981–982)
check status only. If LiteLLM 1.98.0 charges `aresponses` at $0 or ignores the pinned price, opening the route lets agents spend
past budgets. Also untested: the provider storing responses by default (`store`), and `GET /v1/responses/{id}` from another key.
**Fix:**
- [M4] adds the key's spend against usage × price (streamed and not), whether `store` is set, and a second key reading the first
  key's response id.
- Task 5 and phase 3 assert spend.

**I8. Spend accounting across the two hops.** `capable.ts:228-234` pins only input and output prices, while S5 found 97% of
capable tokens were cache reads at ~a tenth of the price (`S5-findings.md:354-355`). [M3].6 never compares against the gateway's own
charge. **Fix:**
- [M3].6 sends a cacheable prompt twice and records `cached_tokens`, Manifest's spend and the gateway's `x-litellm-response-cost`.
- Pin `cache_read_input_token_cost` if needed.
- **The virtual key's `max_budget` and `budget_duration` are a Rich-step before sitting 2** (decided above).
- Task 6 compares the `/key/info` spend change, not by eye.

**I9. Failure shapes are unmeasured where they matter.** [M5] has no streamed cases. (e), the gateway's budget spent, is optional
(l.158, 483), so Task 4's branch rule (l.489–492) has no answer for it and the stub's `budget` shape (l.851) would be invented. (c)
depends on whether the key has a model list: a refused model may answer 401, a removed one 400 "Invalid model name". **Fix:**
- Stream (a), (c), (e) and (g).
- Make the tiny-budget second key required (or treat (e) as Branch C).
- Measure (c) both ways.

**I10. The gateway URL accepts `http://`.** `MANIFEST_UBC_AI_GATEWAY_URL` (l.683) would send the bearer key in clear. **Fix:** refuse
plain `http` except on loopback, as `config.ts` does for the GitHub URLs (~l.690), and treat an empty value as unset.

## Minor
- **M1.** Read-this-first #14 (l.226–228) is FALSE. The guard's probes do name keys: `fallback-guard.docker.test.ts:179`
  `'probe-not-a-key'`, `capable.docker.test.ts:118` `'sk-probe-not-a-key'`. The one keyless deployment (`capable.docker.test.ts:309`)
  is `ollama_chat` at `127.0.0.1:9`. Correct it, and the self-review (l.1102–1104).
- **M2.** Task 3's unit test expects `[1e-6, 3e-6]` (l.788), but `testing.ts:282-292` never seeds a config entry's output price, so
  `outputCostOf` reads 0. Add `testing.ts` to Task 3's files.
- **M3.** The Task 2 Docker case names helpers that don't exist (`keyFor`, `STUB_HOST`, `GW_STUB_PORT`) and skips the
  `startingClear` the file requires. Port 7199 is `fallback-guard`'s, so pick a free one.
- **M4.** A 401 from LiteLLM echoes part of the key, which lands in `manifest-litellm`'s log and possibly its error table. Phase 5
  also counts the key's last 4–8 characters; record where [M5](d)'s canary fragment lands.
- **M5.** The setting's regex rejects `@` in model names (l.801), and Vertex-style ids contain one. Split on the last `@`.
- **M6.** Add commented `MANIFEST_GATEWAY_MODELS` and `MANIFEST_UBC_AI_GATEWAY_URL` lines to `.env.example`, and update the example
  at `.env.example:172`. `UBC_AI_GATEWAY_API_KEY`'s line exists already (`20c65ca`).
- **M7.** `2026-10-03-fe46-fe47-fe5.md` (l.50, 300, 641) names only `1.7.0`; add the `1.6.1` start at Task 5's close.
- **M8.** Spec action 1: "never seen by the control plane" should read "never kept", since `loadConfig` reads its presence. Its §7
  text implies the gateway is the only route, while `openai/` direct remains supported.
- **M9.** Sitting 1 commits only whether LTIC's upstream addresses are present, never their values ([M1].2). [M2].4 measures the
  Task 5 trigger at hop 2 only; repeat it through `gw-probe`.
- **M10.**
  - Give gateway deployments a `timeout` (a black-holed route could wait up to 600 s before falling back).
  - Record that TLS verifies from inside the container with no `ssl_verify` override.
  - `MANIFEST_GATEWAY_MODELS` entries have no fallback, so they fail offline. Say so in RUNBOOK.
  - Run the next offline acceptance with the gateway lines in `.env`.
- **M11.** Sitting 2 is at the edge of one session. Declare a stop point after Task 3, and split if both Task 4's Branch B and
  Task 5 run.

## Rich's decisions honoured
All six: our own LiteLLM; the gateway as upstream; one key; `default-chat`/`default-chat-onprem` stay Ollama;
`MANIFEST_GATEWAY_MODELS` registered at boot and removed when unset; `/v1/responses` only if measured, with app and intake keys
keeping three routes; placed after faculty-ready. Inline execution is in `3f42f5d`. The boot's refusal breaks no demo, CI or
offline acceptance on a machine without the key: with no gateway setting it never triggers, and every refusal is one operator line.

## Today's platform, regardless of this plan
1. **I1, the unscrubbed key.** Handled at 16:14 by commenting out the `.env` line (above).
2. **The leak to the Docker tier's host stub is not live today:** no current probe sends `OPENAI_API_KEY` there (M1). But the real
   key sits in `manifest-litellm`'s environment, so any future `openai/` deployment aimed at a stub with no `api_key` would send it.
3. **The capable model's pinned price omits cache-read cost** (`capable.ts:228-234`), unmeasured: cache-heavy agent sessions may be
   charged several times their real cost against budgets.
4. **A dead OpenAI key degrades silently.** A 401 falls back by design, so a revoked or rotated key moves every capable call to the
   on-prem model with no operator line; only `x-litellm-attempted-fallbacks` shows it.
