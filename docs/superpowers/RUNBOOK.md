# Running Manifest locally

Everything here is verified. If a step does not behave as described, that is a bug
in the platform, not in your machine — `make doctor` first, then open an issue with
its output.

**Just want to see it working?** [`WALKTHROUGH.md`](WALKTHROUGH.md) is the one-page version:
start it, deploy the demos, what to open in a browser and with which test users, and how
to check it. This file is the full operator's manual behind it.

## First time

```bash
git clone <repo> && cd manifest
make seed            # the only step needing network. Pulls images and models.
make host-setup      # three privileged steps. Prompts for a password twice.
export NODE_EXTRA_CA_CERTS="$PWD/infra/ca/manifest-root.crt"   # add to your profile
make up
make doctor && make verify
```

Then open <https://console.manifest.internal/>. No port, no certificate warning. It answers
`manifest console: not built yet` — that name is the console's and the API's origin (P5a Task 3);
the API is under `/v1`, reached once the control plane runs (*Running the control
plane*, below), and every other source than the host is refused.

`make seed` must run **before** `make host-setup`: the CA it mints is what
`host-setup` trusts. Seed also adds the loopback aliases itself, so Caddy can bind
80/443 the first time — that is what removes S7's run-the-script-twice dance.

## Every day

```bash
make up        # re-adds the 127.0.0.2 and 127.0.0.3 aliases if a reboot removed them
make down      # stops everything, including the profiled builder
```

## Running the control plane

*Every setting the control plane reads is listed and explained in `.env.example`'s section 2, commented out with its
default (added 2026-09-25); `packages/control-plane/src/config.ts` is the authority. The block below exports the few that
are required, derived from the secrets in section 1.* *Its email — the Manifest team's — goes to Mailpit with no setting at
all; *Mailpit — the laptop's mail sink*, below, has its four settings (since 2026-10-08).*

*Moved here from `README.md` on 2026-09-24, word for word, when the README became a short description of what Manifest is.*


Requires P1's substrate (`make up`) — Postgres on 7103, the registry, the edge and
its admin API, and the registry issuer keypair `make up` generates. **The control
plane now constructs the Docker driver** (P3 Task 15), so it needs the Docker socket
and refuses to boot without the issuer.

Run these **from the repo root** — `MANIFEST_BLUEPRINTS_ROOT` and
`MANIFEST_REPOS_ROOT` are read as given, and `pnpm --filter` runs with the *package*
directory as its working directory, so relative paths there point at the wrong
place. The issuer paths are no longer among them: they resolve against the
repository root, because the documented command below could not otherwise find
them.

```bash
set -a; . ./.env; set +a   # make seed writes .env; the password is NOT "manifest"
# The control plane connects as `manifest_app`, NOT as `manifest`. `manifest` is
# POSTGRES_USER and therefore a SUPERUSER, and a superuser bypasses every
# privilege check — which makes §20's append-only `audit.events` grant
# unimplementable. `make up` creates the role (infra/lib/ensure-app-role.sh).
export MANIFEST_DATABASE_URL="postgres://manifest_app:${MANIFEST_APP_PASSWORD}@127.0.0.1:7103/manifest_control"
# Admin, for DDL only: `db:migrate` below, and the test harness's TRUNCATE. Never
# read by src/ — the control plane has no code path that needs it.
export MANIFEST_ADMIN_DATABASE_URL="postgres://manifest:${POSTGRES_PASSWORD}@127.0.0.1:7103/manifest_control"
# The IdP metadata database is a THIRD, required setting — never derived from
# either line above by swapping the name (P4a Decision 13). It has its own roles:
# `ssp_ro` reads the SP metadata, `manifest` writes it, `ssp_store` owns the IdP's
# session store (its own schema, since 2026-10-03 — SSP_STORE_PASSWORD in .env), and
# there is no `manifest_app` in it.
export MANIFEST_IDP_DATABASE_URL="postgres://manifest:${POSTGRES_PASSWORD}@127.0.0.1:7103/manifest_idp"
export MANIFEST_SESSION_SECRET=$(openssl rand -hex 32)
export MANIFEST_BLUEPRINTS_ROOT="$PWD/blueprints"
export MANIFEST_REPOS_ROOT="$PWD/.manifest/repos"
# The key that mints and revokes every app's LiteLLM key (§10). ONE stored secret:
# LiteLLM reads LITELLM_MASTER_KEY from .env, and this names the same value for the
# control plane. Required outside development; never add a second copy to .env.
export MANIFEST_LITELLM_MASTER_KEY="${LITELLM_MASTER_KEY}"
# MANIFEST_MASTER_SECRET comes from .env. Every backing-service credential is
# derived from it, so it must be STABLE — a value that changes between restarts
# cannot reproduce the password an existing database container already holds.

pnpm --filter @manifest/control-plane db:migrate
pnpm --filter @manifest/control-plane dev      # tsc, then node dist/index.js
```

It listens on `127.0.0.1:7100` and **is reached at `https://console.manifest.internal`**,
through the edge (§21, P5a Task 3): the edge forwards `/v1/*` and `/auth/*` to it and refuses
every source but the host, so a container — an app included — gets `403 manifest: the control
plane is not reachable from this network`. It prints one line saying which driver it built
and where it is reached. **Read it** — every acceptance in P3 is meaningless if it says
`fake`, and a sign-in completes only at the origin it names:

```
{"driver":"docker","port":7100,"origin":"https://console.manifest.internal","ai":"enabled",…,"msg":"control plane ready"}
```

**Restart the control plane after `make up` applies a Caddyfile change, and after
`pnpm test:docker`.** Either one drops the edge's runtime routes, and the Docker tier also
re-registers the platform's SP row at a loopback ACS, so a sign-in through the console fails
at the ACS comparison until the control plane's boot puts both back.

Verified end to end on 2026-09-05:

```bash
curl -s https://console.manifest.internal/v1/me
# {"error":{"code":"UNAUTHENTICATED","message":"a session is required","hint":"Log in first."}}

# §9: Manifest is its own SP, so logging in is a real CWL round trip against the
# Manifest IdP. `scripts/demo.sh` step 1 drives all three hops with curl; in a
# browser, just open https://console.manifest.internal/auth/login and sign in as
# `instructor` / `instructor` (D6 — the IdP serves TEST USERS ONLY).
curl -s -o /dev/null -w '%{redirect_url}\n' https://console.manifest.internal/auth/login
# https://idp.manifest.internal/module.php/saml/idp/singleSignOnService?SAMLRequest=…&Signature=…

curl -s -b /tmp/jar -X POST -H 'content-type: application/json' \
  -H "idempotency-key: $(uuidgen)" -H "origin: https://console.manifest.internal" \
  -d '{"slug":"boot-check","blueprint":"fixture-node@1","audience":{"scale":"solo","burst":"steady"}}' \
  https://console.manifest.internal/v1/projects
```

**`audience` is required** (§24, P5a Task 11) — `scale` is `solo`, `class`, `large_course` or
`public`, `burst` is `steady` or `synchronised` — and `starter` is optional: `GET /v1/blueprints`
lists what each blueprint offers, and `node-ts-mongo@1`'s `proof-app` seeds §16's proof app over the
skeleton. The answer carries the project, its environments and `spec` — the validation of the
manifest its first commit carries — and the project's event stream has `project.created`,
`repository.seeded` and `spec.validated`.

**A mutation carrying a session is refused `403 CSRF_ORIGIN_REFUSED` without that `origin`
header** (§20, P5a Task 4), and so is an event-stream upgrade: every deployed app is
same-site with the console, so a session cookie alone proves nothing about which page sent
the request. A browser on the console sends it itself; a script sets it, as
`scripts/lib/api.sh` does. A sign-in lands on `/`, or on the same-origin path it was started
with — `https://console.manifest.internal/auth/login?returnTo=/v1/me` — and it completes only
in the browser that started it: the callback refuses an assertion whose `RelayState` is not
the nonce in that browser's `__Host-manifest_login` cookie (`401 SAML_LOGIN_NOT_BOUND`).
**On an https origin every sign-in cookie is `__Host-`** — `__Host-manifest_session`,
`__Host-manifest_login`, `__Host-manifest_stepup`, each Secure and `Path=/` — and a plain-named
one there is not read (the faculty-ready plan's Task 5, FE-28). The plain names are loopback
`http`'s alone: the Docker tier's control planes and the mock. A curl jar holds the `__Host-`
name, so a script reads `$6=="__Host-manifest_session"` (every `scripts/demo-*.sh` does).

**`node src/index.ts` does not work**, though Node 24 strips types natively: the
source uses NodeNext `.js` specifiers, which Node resolves literally rather than
mapping back to `.ts`. Hence the build step.

**There is no login shim any more.** `POST /auth/dev-login` and `MANIFEST_DEV_AUTH`
were deleted in P4a Task 14: the route minted a real session for a named test user
with no credential of any kind, and P2 measured that its only protection was a
registration guard — removing that one condition made it answer 200 with a live
session. Manifest logs its own users in with CWL (§9), and the test suite signs its
own sessions in-process (`identity/testing.ts`), which needs no HTTP surface.

**The control plane registers its own Service Provider at boot**, through the same
`renderSpMetadata` every deployed app's row goes through — entityID
`https://manifest.internal/sp/manifest-control-plane/platform`, ACS
`https://console.manifest.internal/auth/saml/callback`. It is built from
`MANIFEST_CONTROL_PLANE_ORIGIN`, which defaults to `https://console.manifest.internal` —
the console's origin, through the edge — and becomes the console's production origin at
UBC; `loadConfig` refuses a loopback origin whose port is not `MANIFEST_PORT` (the Docker
tier boots control planes at loopback origins). The session cookie is `Secure` whenever the
origin is `https`, in development too. The
keypair it signs with is `infra/sp/control-plane.{key,crt}`, minted by `make up`,
gitignored, and — like the IdP keypair and the envelope master key — **not removed by
`make reset`**.

### The capable model

*Added 2026-09-28 (the front-end enablement plan's Task 12a, as its whole-branch review left it; §7, §21 and §26 as Spec action 7
amended them).* `default-chat-large` is ONE logical name for the agent and app work `qwen3.5:4b` cannot do. Which model answers it
is a setting, a commercial provider's today, **and it needs the network**. Nothing offline depends on it: `default-chat` stays the
floor every demo and the offline acceptance run on (C1). It is **unset by default**, and a laptop without a provider key registers
nothing. **When its provider fails — the network off included — the on-premise model answers it** (§7, §21 and §26 as Spec
action 8 amended them; the front-end enablement plan's Task 12b): `MANIFEST_CAPABLE_MODEL_FALLBACK` names a CATALOGUE entry,
`default-chat-onprem` by default — Ollama's `qwen3.8:27b` here (the front-end enablement plan's Task 14a), UBC's on-premise inference
at UBC — and the boot sets it as `default-chat-large`'s fallback.

1. **In `.env`, set the two lines `.env.example`'s section 2f documents**: `OPENAI_API_KEY=` (the provider's key — real money; it
   is yours, and no agent types, reads or prints it) and `MANIFEST_CAPABLE_MODEL=openai/gpt-6-luna` (a LiteLLM model string;
   Rich's choice on 2026-09-28 — a more capable model, `openai/gpt-6-sol`, is a one-line REPOINT, never a fallback). **Since 2026-10-14
   (Rich, ~14:19, `6fa660a`) this laptop's line is `MANIFEST_CAPABLE_MODEL=ubc-ai-gateway/gpt-6.1-sol`** — OpenAI's newer model through UBC's AI Gateway (from 2026-10-03, Rich 22:08, it was `ubc-ai-gateway/gpt-6-luna`, the model above through the gateway), with
   `MANIFEST_GATEWAY_MODELS=ubc-qwen-27b=ubc-ai-gateway/qwen3.8-27b@confidential` beside it (*Through UBC's AI Gateway*, below). Both are
   commented in `.env.example`, because `make doctor` reads every uncommented line there as a key every `.env` must have.
2. **`make up`, with the network ON** — LiteLLM reads its environment only when it is CREATED (`docker restart` keeps the old
   one), and `infra/compose.yaml` hands it `OPENAI_API_KEY` and hands the key to nothing else. Check with
   `docker exec manifest-litellm sh -c '[ -n "$OPENAI_API_KEY" ] && echo set'`, never by printing it. Online matters: `gpt-6-*`
   is priced only by the list LiteLLM fetches when it starts online, because the list bundled in 1.98.0 stops at gpt-5.6.
3. **Start (or restart) the control plane** as above. RUNBOOK's `set -a; . ./.env` exports both lines into it; it reads
   `MANIFEST_CAPABLE_MODEL` and **scrubs `OPENAI_API_KEY` at boot**, before any child process can inherit it. **Straight after it
   starts listening** it registers `default-chat-large` at its LEVEL (step 3a) through LiteLLM's admin API — never as an
   `infra/litellm/config.yaml` line, which the admin API could not remove — **pinned at the price LiteLLM itself reported**, so a
   later LiteLLM restart without the network cannot make it free. **Read the boot line's `capableModel`**: `registered`,
   `unchanged`, `removed`, `absent`, `disabled` (AI off), or `refused` / `failed`, each of the last two with ONE `[boot] the
   capable model (MANIFEST_CAPABLE_MODEL) …` line. **Then it sets the fallback** with LiteLLM's own `POST /fallback` — held in
   LiteLLM's database, measured to survive `docker restart manifest-litellm` and a repoint — and **the boot line's
   `capableFallback`** reads `set`, `unchanged`, `removed`, `absent`, `disabled`, or `refused` (with ONE `[boot] the capable
   model's fallback (MANIFEST_CAPABLE_MODEL_FALLBACK) …` line) or `failed` (with one, or under the capable model's own line when
   that step failed — the fallback is then not tried). The boot always goes on.
3a. **Its level is `MANIFEST_CAPABLE_MODEL_CLASSIFICATION`** (*added 2026-10-04, the U1 plan's Task 4; S3*): one of UBC's U1 levels —
   `low`, `medium`, `high`, `very-high`, or an earlier name for one — and **the administrator's attestation of EVERYTHING that may answer
   it**, the vendor behind the gateway and any gateway fallback included: `high` only when every one of them keeps nothing it is sent (zero
   data retention), `very-high` only when every one runs on UBC's hardware. **`medium` when unset or empty** (the level it had before);
   any other word refuses the boot (`CONFIG_INVALID`, naming the setting). **Rich's line is `high`** (OpenAI's `gpt-6.1-sol` through UBC's
   gateway since 2026-10-14 — `gpt-6-luna` before — ZDR on UBC's organisation; the same vendor, his attestation, `e2377ab`). The boot line's `capableClassification` says which level is in force. **The ONE boot that changes
   it RE-REGISTERS the model** (`registered`, then `unchanged` at every boot after; a row registered at an earlier name is its level, so
   `internal` stored and `medium` asked re-creates nothing) — **and that re-registration needs LiteLLM's LAST START to have had the
   network**, because `gpt-6-*` is priced only by the list LiteLLM fetches at its own start. Restarted offline, LiteLLM prices it at `0`
   and the re-registration is REFUSED: a row at or BELOW the new level is kept (raising `medium` → `high` keeps the `medium` row, so `high`
   apps cannot use it yet); a row ABOVE it is REMOVED, never kept at a level it no longer has (lowering `high` → `medium` offline leaves no
   capable model until LiteLLM is restarted online, then this control plane). The fallback is refused if it ranks below the level.
4. **Check it**: `curl -s http://127.0.0.1:7106/model/info -H "authorization: Bearer $LITELLM_MASTER_KEY"` — `default-chat-large`
   with `max_classification` at the setting's level (or its earlier name, on a row registered before 2026-10-04) and a positive
   `input_cost_per_token` in BOTH `litellm_params` (pinned) and `model_info`. `startAgentSession` on a project at or below its level
   lists it in `session.models`; a project above it lists it only while `MANIFEST_AGENT_BUILDER_MODELS` is `capable` (the default —
   *The building agent's models*, below).
   `curl -s 'http://127.0.0.1:7106/fallback/default-chat-large?fallback_type=general' -H "authorization: Bearer
   $LITELLM_MASTER_KEY"` answers `"fallback_models":["default-chat-onprem"]`.

**`refused` says why, in its `[boot]` line.** *Cannot price*: LiteLLM has no price for the model — a model priced at $0 would never
bind an agent budget, a session cap or the intake month, so the platform will not offer it; the usual cause is a LiteLLM started
offline — `docker restart manifest-litellm` with the network on, then restart the control plane. *Would not serve*: LiteLLM answered
the registration with an error — check the provider prefix (`openai/<model>`), and `docker logs manifest-litellm`. **A refused
REPOINT keeps the model that was working** (the line says which), unless that one is itself unpriced. `failed` means LiteLLM did
not answer, or refused a change it was asked for; the line says which.

**The fallback is refused** — and a working one KEPT only if it still passes the same check — when the setting names an entry the
catalogue lacks, one with no valid `max_classification`, an embedding model, `default-chat-large` itself, or one classified BELOW
`internal`: LiteLLM falls back WITHOUT consulting a key's list of models (measured at sittings 9a and 9b — a key holding only
`default-chat-large` was answered by its fallback), so a `public` fallback would carry `internal` data where no key was allowed to
send it. **A call the fallback answers is charged to the same key at the FALLBACK's price** (measured: `$1 / $3` a million, never
the provider's), and its answer's `model` names the fallback's provider string — `ollama_chat/qwen3.8:27b` since Task 14a — with
`x-litellm-attempted-fallbacks: 1`. `MANIFEST_CAPABLE_MODEL_FALLBACK=` written EMPTY means none; absent or commented takes the
default. **A FIRST registration made offline is still refused**: LiteLLM cannot price the provider's model, so there is no
`default-chat-large` to fall back FROM — after one online boot the price is pinned, and offline the fallback answers.

**Every control plane that boots WITHOUT the line removes `default-chat-large` from the shared LiteLLM — and its fallback with it** — the Docker tier's own
control planes and `ai/capable.docker.test.ts` included (only a boot that fails before it serves changes nothing). So after `pnpm
test:docker`, or a control plane started without the line, restart it WITH the line. **Unsetting the line and restarting removes
it** — and an app whose manifest declares `default-chat-large` is then refused `SPEC_MODEL_UNKNOWN`, and a launched one's redeploy
`RELEASE_MODEL_NOT_IN_CATALOGUE`, until it is set again. `MANIFEST_INTAKE_MODEL` may name it too, which means the platform pays for
intake on it. A call with no provider key in LiteLLM was refused inside LiteLLM as `500 litellm.AuthenticationError` — measured with
the variable ABSENT from the container; the compose line now sets it EMPTY when `.env` lacks it, which was not re-measured.

#### Through UBC's AI Gateway

*Added 2026-10-03 (the UBC AI Gateway plan's Task 2; §7, §21 and §26 as its Spec action 1 amended them).* **`MANIFEST_CAPABLE_MODEL=ubc-ai-gateway/<model>`**
names a model UBC's AI Gateway serves (`https://ai-gateway.apps.ltic.ubc.ca`, a LiteLLM proxy LTIC runs — `gpt-6-luna` the first measured; `gpt-6.1-sol` this laptop's since 2026-10-14, `6fa660a`).
Manifest's own LiteLLM stays in front of it — per-person keys, budgets, the fallback guard — and registers `default-chat-large` as
`openai/<model>` at the gateway's address (`MANIFEST_UBC_AI_GATEWAY_URL`, `https://ai-gateway.apps.ltic.ubc.ca/v1` when absent or empty;
plain `http` is refused off loopback), **naming the key BY REFERENCE** — `api_key: os.environ/UBC_AI_GATEWAY_API_KEY` — which LiteLLM
resolves from its OWN environment on every call. Neither the control plane nor LiteLLM's database holds the value: `/model/info` lists no
`api_key` at all, and the stored row decrypts to the reference. **Each registration carries a 60 s `timeout` and no retries**
(`ai/providers.ts`): a gateway that stops answering hands the call to the fallback in about a minute, not LiteLLM's 600 s three times
over; a NON-streamed answer longer than 60 s is cut off and answered by the fallback instead (the longest measured was 35.2 s).

**THE ORDER IS LOAD-BEARING: the key in `.env`, then `make up`, THEN restart the control plane.**
1. `.env` holds `UBC_AI_GATEWAY_API_KEY=` (a VIRTUAL key generated in the gateway's admin UI — never printed, never on a command line),
   `UBC_AI_GATEWAY_KEY_EXPIRES=<YYYY-MM-DD>` (read from that UI: a gateway key cannot read its own `/key/info`) and the
   `MANIFEST_CAPABLE_MODEL=ubc-ai-gateway/<model>` line.
2. **`make up`** — LiteLLM reads its environment only when it is CREATED, and `infra/compose.yaml` hands it the gateway key and nothing
   else does. Check with `docker exec manifest-litellm sh -c '[ -n "$UBC_AI_GATEWAY_API_KEY" ] && echo set'`, never by printing it.
3. **Restart the control plane.** It reads only WHETHER `.env` held the key (and scrubs it at boot), and registers. The boot line's
   `capableModel` reads as above.

**Between steps 1 and 3 in the wrong order** — the control plane restarted before `make up` — the boot registers a gateway deployment
whose reference LiteLLM cannot resolve, and **an unresolved or empty reference makes LiteLLM send `OPENAI_API_KEY` instead** (measured on
LiteLLM 1.98.0, both providers — the plan's `[M7]`): OpenAI's key would reach UBC's gateway. `make verify` reads red throughout that window
(below). Run `make up`, then restart.

**THE BOOT FAILS CLOSED.** A `ubc-ai-gateway/` setting when `.env` carried NO key is refused with ONE `[boot] the capable model
(MANIFEST_CAPABLE_MODEL) was refused: … UBC_AI_GATEWAY_API_KEY is not in .env, so every gateway registration is removed rather than kept …`
line, and **every gateway registration is REMOVED** — a keyless one could only answer a `401` the fallback hides, or send `OPENAI_API_KEY` to
UBC. A DIRECT `openai/<model>` registration that was working is kept: that is OpenAI's key going to OpenAI. **`OPENAI_API_KEY` stays in
`.env` as a backup** (Rich, 2026-10-03: *"Keep it as a backup"*): a direct `openai/…` setting still uses it, and repointing between the two is
one line — the ADDRESS is compared, so `openai/gpt-6-luna` and `ubc-ai-gateway/gpt-6-luna` are different registrations.

**`make verify`'s *LiteLLM holds the UBC AI Gateway key .env holds*** compares a FINGERPRINT of each side — `.env`'s hashed in the shell,
LiteLLM's inside its container — and prints only a verdict: `not configured` (neither holds one) and `matches` PASS; **`absent from
LiteLLM`** (`.env` gained the key, `make up` not run), **`differs`** (rotated in `.env`, LiteLLM stale) and **`LiteLLM holds a key .env does
not`** FAIL, each naming `make up`. **`make doctor`'s *the UBC AI Gateway key is not near its expiry*** WARNS from 14 days before
`UBC_AI_GATEWAY_KEY_EXPIRES`, when it is past, when it is missing beside a key, or when it is not a date — an expired key answers `401`, and the
fallback answers that silently, every capable call moving to the on-premise model. **To rotate:** a new key in the gateway's admin UI; both
`.env` lines; `make up`; restart the control plane; `make verify` reads `matches`.

**What a person is charged.** For a model the gateway prices, LiteLLM charges what the GATEWAY reports
(`llm_provider-x-litellm-response-cost`), cache reads included — the pin is never read; for one it does not price, the pin is the whole price.
**A streamed call too, since LiteLLM 1.102.0** (re-pinned 2026-10-03, the gateway plan's F32): the gateway sends a stream's usage and cost
in a frame that also carries an empty choice, and 1.98.0 dropped it and charged its own count of the visible text — a model's reasoning
tokens uncharged. `fallback-guard.docker.test.ts`'s F32 case holds it.
A gateway model LiteLLM cannot price at all is refused, as above; the fix is at the gateway (its administrator exposes it under its vendor
name). **The gateway's own failures** — the key refused a model (`403`), a wrong or expired key (`401`), its budget spent (`429
budget_exceeded`), the gateway unreachable (`500`) — fall back to the on-premise model; **a model the gateway does not serve is a `400` the
fallback does not answer** (Rich, 2026-10-03: *"accept it"*), so a mistyped setting is loud to every caller until it is corrected.

#### UBC's AI Gateway's models

*Added 2026-10-03 (the UBC AI Gateway plan's Task 3; Rich's Q1: *"New names from one setting"*).* **`MANIFEST_GATEWAY_MODELS`** puts the
gateway's own models into the catalogue under names of their own:
`MANIFEST_GATEWAY_MODELS=<name>=ubc-ai-gateway/<model>@<level>,…` — for example
`ubc-onprem=ubc-ai-gateway/<an on-premise model>@confidential, ubc-mini=ubc-ai-gateway/<another>@internal` (the names and
classifications on this laptop are Rich's, in `.env`). Every boot registers each entry
at its own classification, at the gateway's address with the key by reference, under an id beginning `manifest-gateway-`, and REMOVES every
one the setting no longer lists; empty or unset is none. The boot line's `gatewayModels` is each entry's state (`registered`, `unchanged`,
`refused` with ONE `[boot] a gateway model (MANIFEST_GATEWAY_MODELS) '<name>' was refused: …` line each), `failed` (one line), or
`disabled`. It runs BEFORE the capable model's step, so `MANIFEST_CAPABLE_MODEL_FALLBACK` may name an entry. The same key rules apply: the
order (`.env`, `make up`, restart), the fail-closed boot (every `manifest-gateway-` deployment removed when `.env` carries no key), and
`make verify`'s fingerprint.

- **The names are yours, and never one the catalogue already holds** — `default-chat-onprem` stays Ollama (the capable model's fallback and
  the offline floor for `confidential` apps), so naming it is refused and registers nothing; `default-chat-large` is refused at boot (it is
  `MANIFEST_CAPABLE_MODEL`'s). Lowercase letters, digits and `-`. A model id may hold `@` — the classification follows the LAST one.
- **The level is the entry's, never assumed**: an entry without one, or with any word but UBC's U1 levels — `low`, `medium`, `high`,
  `very-high` — or an earlier name for one (`public`, `internal`, `confidential`), refuses the boot (`CONFIG_INVALID`, naming the entry);
  an earlier name is registered as its level, and a row stored at it is `unchanged`. **`high` only for a model whose every provider keeps
  nothing it is sent (zero data retention); `very-high` (`confidential`) only for a model on UBC's own hardware with no gateway-side
  fallback off it** — the platform cannot see the gateway's fallbacks (measured on 2026-10-03: the gateway falls back from
  `qwen3.6-35b-a3b` to off-premise `gpt-6-luna`, so that model cannot be `confidential` while it does). D17 then hands each entry to
  whoever its classification allows: a `confidential` entry reaches a `confidential` project's agent and app; an `internal` one never does.
- **The price**: LiteLLM's own for the gateway's model name, pinned, as the capable model's is (and for a model the gateway prices, the
  person is charged UBC's figure). **A `confidential` entry LiteLLM cannot price is pinned at `default-chat-onprem`'s synthetic price**
  ($1 / $3 a million, read from its config entry), because on-premise hardware has no per-token price and `$0` binds no budget. **Any other
  entry LiteLLM cannot price is refused** — the fix is at the gateway, which exposes the model under its vendor name.
- **An entry has NO fallback**: with the network off — or the gateway down, or its budget for Manifest spent — a call to one fails. An app or
  agent that needs to work offline names `default-chat` or `default-chat-onprem`. **Naming an entry as `MANIFEST_CAPABLE_MODEL_FALLBACK`
  loses the capable model's offline fallback** for the same reason: `default-chat-onprem` answers with the network off, a gateway model does
  not.

**A LOWERED LEVEL REACHES RUNNING APPS AT THE NEXT BOOT** (*added 2026-10-04, the U1 plan's Task 6; §7's E3, S11*). Lowering a
model's level — a `MANIFEST_GATEWAY_MODELS` entry's `@high` become `@medium` because its provider's zero retention lapsed, or
`MANIFEST_CAPABLE_MODEL_CLASSIFICATION` lowered — makes D17 refuse it to new validations and deploys at once; a RUNNING app's key
already holds it. So every boot, straight after the agent sessions' check, reads each live instance's key from LiteLLM itself
(`/key/info`) and takes off every model the level of the release that instance runs (its FROZEN level) no longer allows —
`/key/update` by the key's value, the same key going on — or, when nothing it may use is left, REVOKES it (never `models: []`, which
LiteLLM reads as every model). Each change is an `ai.models_withdrawn` event on the project's stream and an `app key sweep: …` operator
line. **Read the boot line's `appKeysWithdrawn`**: `{"narrowed":n,"revoked":k,"failed":m}`, `disabled` (AI off), or `failed` (ONE
`[boot] the running apps' AI keys could not be checked …` line — the next boot tries again). A `failed` instance is named in its own
line: its release names no level the platform reads, or LiteLLM refused the change. **What the owner does:** a narrowed app keeps
working on what is left; a REVOKED one's AI calls fail until it is deployed again — change `ai.models` (or `data.classification`) in
`manifest.yaml` to models its level allows, then deploy. A model the catalogue no longer lists at all stays on the key: LiteLLM refuses
it. P4b's environment-level keys are counted in one line and not checked — redeploy those apps.

### The building agent's models

*Added 2026-09-28 (the front-end enablement plan's Task 14a; §7, §10 and §26 as Spec action 10 amended them; in U1's words since the U1
plan's Task 4, S4).* **`MANIFEST_AGENT_BUILDER_MODELS` decides whether the agent that BUILDS an app whose level is ABOVE the capable model's
may call it** — Rich: *"It's okay to use the larger models to BUILD the app, but if the app needs AI, then we should switch to use the
on-prem model for the AI within the created app"*, and *"make this a setting"*. **`capable`, the default**: such a project's agent session
lists the models its level allows AND `default-chat-large` (when it is registered) — with the capable model at `high`, a `very-high`
project's; at `medium`, a `high` or `very-high` one's. **`on-premise`**: what its level allows alone. At or below the capable model's level
D17 already allows it, so the setting changes nothing there. Nothing else is accepted — the boot refuses a mistyped or empty value rather
than guess. **The app's own `ai.models` is validated by D17 whatever this says**, so a `very-high` app's own AI stays on-premise either way.
It is a platform setting (§26): put the line in `.env` and restart the control plane.

**The faculty front-end chooses the model its plans are written on from what the session offers** (since manifest-app `ec7cf43`,
2026-10-08, its A1 job — the fix for the first `ask-my-notes` defect of 2026-10-05). Its server on 7105 writes every plan — the first and
every *Ask for a change* — on `MANIFEST_APP_PLAN_MODEL` when the agent session offers it, and otherwise on the first the session offers of
`default-chat-large`, `default-chat` and `default-chat-onprem` (`packages/server/src/api/plan.ts`, `model/client.ts`'s `modelFor`); a
session offering none of them is refused `PLAN_MODEL_NONE` in the front-end's own words. **So the variable only names its first choice**,
and a `high` or `very-high` project — whose session never offers `default-chat` — is planned on `default-chat-large` without it. Until
2026-10-08 it planned on that ONE model or refused, which is why `.env` holds `MANIFEST_APP_PLAN_MODEL=default-chat-large`
(`.env.example`'s section 2g); the line is harmless now and Rich's to remove. **The front-end reads only its process environment** — no
`.env` of its own — so a start that still passes it passes that ONE line, never the whole file, which holds the master secret and the
gateway key the front-end must not hold:

```bash
cd ~/Developer/manifest-app
MANIFEST_APP_PLAN_MODEL="$(sed -n 's/^MANIFEST_APP_PLAN_MODEL=//p' ~/Developer/manifest/.env)" \
  nohup pnpm dev > "<your scratchpad>/manifest-app-edge.log" 2>&1 &
# the start line reads: manifest-app (edge) on http://127.0.0.1:7105, asking http://127.0.0.1:7100, who at https://app.manifest.internal
ps eww -p "$(lsof -nP -iTCP:7105 -sTCP:LISTEN -t)" | tr ' ' '\n' | grep '^MANIFEST_APP_PLAN_MODEL='   # proves it arrived
```

Stop the old one first by its whole process tree — `tsx watch` outlives a killed child and takes 7105 back (the front-end's ORIENTATION,
*Our own server is left running*).

**A session never holds more than its project now allows** (FE-36; since the launch path plan's Task 7, Spec action 1, it is
NARROWED IN PLACE). Every valid `manifest.yaml` the platform records — a commit through the API, a push, a validation — and every
PRODUCTION deploy, the rehearsal's included (the release production serves floors the classification; the review's I2), is followed
by a check of the project's ACTIVE agent sessions, and every session whose key names a model the project no longer allows is
narrowed: its key's models cut at LiteLLM by `/key/update` on its alias, so the SAME key is refused the withdrawn models at once
(`403 key_model_access_denied`) and still answers the rest; then its row's `models`, and `agent_session.narrowed` published. Raising a
project from `medium` to `very-high` narrows the sessions started before it to the on-premise models (and the capable model
while the setting is `capable`). So does a restart that sets `on-premise` — or, under `on-premise`, LOWERS the capable model's level — for each session whose
project is now above the capable model's level. **Only a session left with nothing it may use is ended** — its key revoked, `agent_session.ended`
with reason **`models_withdrawn`**. **Every boot** runs the same check over every project — which is how `on-premise` reaches the
sessions a `capable` platform started, and how a check that failed at a commit is finished. **Read the boot line's
`agentBuilderModels`** (the setting in force) **and `agentSessionsWithdrawn`**: `{"ended":n,"narrowed":k,"failed":m}`, `disabled`
(AI off), or `failed` (with ONE `[boot] the agent sessions could not be checked …` line). A session that could not be narrowed or
ended is named in an operator line with what its key may still hold, and stays live until it expires or the next check — a commit, a
production deploy, a rehearsal or a boot — finishes it; a commit is never refused for it.

**The safeguard, whatever the setting** (S9, since the U1 plan's Task 5): `listIncidents` for the STAGING or PRODUCTION environment of a
project at `high` or above (by its manifest or any release that has run there), asked with a delegated TOKEN, is refused **`403
INCIDENT_LOG_CONFIDENTIAL`** before anything is read — an Incident's log tail can carry the input of the people the level protects,
redaction does not remove names or student numbers, and a token's model is one no administrator has attested. A person's session still
reads it, and every token reads the sandbox's. Neither the builder setting nor the capable model's level changes it.

## The four verbs

| | |
|---|---|
| `make seed` | The only step that needs network. Pulls and **pushes** base images into the local registry, warms the npm mirror, mints the CA, pulls the Ollama models — and builds every platform image **including the GitHub fake's** (`--profile github build`; its `apk add git` is why it cannot be built offline). **With the network on it re-resolves moving upstream tags, so it can REBUILD Caddy and the IdP and RECREATE `manifest-caddy` and both dnsmasq containers — every runtime route dropped — and the next `make up` recreates `manifest-idp`; it also refreshes the vulnerability database, as `make refresh-vulndb` does** (TRAPS: *`make seed` WITH THE NETWORK ON*). |
| `make up` | Boots the platform and waits for every healthcheck. Re-adds **both** loopback aliases, prompting for `sudo` **only** when one is genuinely missing. Mints, once, the keys that live on this machine — among them `infra/secrets/master.key` and, since the D5 plan's Task 3, the **fake** GitHub App's four credentials beside it (`github-fake-*`, all `600`: its private key, public half, webhook secret and `faculty-dev`'s token). A second run changes none of them. |
| `make down` | Stops everything — **the GitHub fake too** (`--profile github down`: a bare `compose down` exits 0 and leaves a profiled service running, measured 2026-09-24). Data, the seed cache and the CA all survive. |
| `make reset` | Destroys project data, the databases, the registry's contents **and the GitHub fake's repositories** (`manifest-github-fake-data`). **Keeps** the Caddy CA, everything in `infra/secrets/` (the master key, and the fake GitHub App's credentials beside it), the npm mirror cache, `infra/images.lock` and the Ollama models, and re-pushes the base images from the local daemon — so the machine stays offline-capable. |

Plus `make doctor` (*can this machine run the platform?* — works with nothing up) and
`make verify` (*is the running platform correct?* — needs `make up` first).

And two acceptances: `make demo` (P3's — an app, from a bare repository to a URL) and
`make demo-identity` (P4a's — a real person, signed in with CWL, whose note nobody
else can see). Both are described below, and both need the control plane running.

## Running the reference console

*Added by P5c sitting 3, 2026-09-18 (Task 4). D22's reference console — the executable
proof that the public API is complete and sufficient. It is not the product.*

It is a plain React + Vite client (`packages/console`) run as a **host process on 7104**,
exactly where §21's inventory puts it. The edge forwards everything that is not `/v1/*` or
`/auth/*` to it, so the console and the API are **one origin**.

```bash
make up
# ... the control plane running, per "Running the control plane" above ...
pnpm --filter @manifest/contract build      # the console BUNDLES dist/, and typechecks src/
pnpm --filter @manifest/console dev         # or `preview`, after `pnpm --filter @manifest/console build`
open https://console.manifest.internal/
```

**Reach it at `https://console.manifest.internal` and NEVER at `127.0.0.1:7104`.** The
second address serves the same bytes and is a trap, and what it actually does is worth
knowing because it is not a refusal — **measured 2026-09-18**: on 7104 there is no edge
and no control plane, so **Vite answers `GET /v1/me` itself with `index.html` and `200`**
(its SPA fallback) and a `POST /auth/logout` with `404`. The console then fails on
`SyntaxError: Unexpected token '<' … is not valid JSON` — visible, at least, because
`<Refusal>` renders a non-`ManifestApiError` too. Sign-in cannot work there either: the
control plane's SAML ACS is registered at the console's origin, so the assertion never
comes back to where the sign-in started. `403 CSRF_ORIGIN_REFUSED` (§20, P5a Task 4) is
what a console served from some *other* origin that CAN reach the API would get; it is not
what 7104 gives you.

**Build the contract first, every time.** `packages/contract`'s `exports` map is
conditional — `"types": "./src/index.ts"`, `"default": "./dist/index.js"` — so `tsc`
reads the SOURCE and Vite bundles `dist/`. A stale `dist/` ships with every gate green
(P5c sitting 1, F3).

| What you see | What it is |
|---|---|
| `502` at `/` | Nothing is listening on 7104. The edge is fine; start the console. |
| `manifest OK host=… scheme=https` | The request never reached the console site at all — it was answered by the wildcard. **Read the body, never the status.** |
| *Blocked request. This host is not allowed.* | `vite.config.ts` lost `allowedHosts`. The edge **preserves** `Host: console.manifest.internal` rather than rewriting it (P5c sitting 1, M1). |
| The sign-in screen when you were signed in | `GET /v1/me` answered `401`. `pnpm test` truncates `users` on every run, and a restart of the control plane does not restore a session. |

`dev` gives HMR (its socket goes through the edge as `wss://console.manifest.internal`,
measured in P5c sitting 1's M3); `preview` serves the production build and is what the
acceptance uses. **Vite RELOADS THE PAGE when that socket drops**, which matters more than it
sounds: until P6a sitting 10 every deploy on the platform dropped it (a route change reloads
the edge's whole config), so pressing *Run the rehearsal* under `dev` lost its own answer to
the rehearsal's production deploy. The Caddyfile's console proxy now carries
`stream_close_delay`, measured both ways — but `make demo-journey` still reloads a `dev` page,
by rebuilding `@manifest/contract`, and an edge restart still cuts everything. **Click an
acceptance under `preview`**, which holds no socket. Either way **stop it by port** when you are done —
`lsof -nP -iTCP:7104 -sTCP:LISTEN -t | xargs kill` — because each shell is its own and
`kill %1` has no job table to read.

### Serving the reference console on the front-end's origin

*Added by the front-end enablement plan's sitting 6, 2026-09-27 (Task 8, Decision 19).* The edge serves
**`https://app.manifest.internal`** — the faculty front-end's origin (§21) — exactly as it serves the console's:
`/v1/*` and `/auth/*` to the control plane on 7100, everything else to **7105**. The faculty front-end is a
SEPARATE project (`~/Developer/manifest-app`, §5); nothing in this repository serves 7105 except this console,
for a clicked half of an acceptance, because it is the one client here that signs a person in through a browser:

```bash
pnpm --filter @manifest/contract build && pnpm --filter @manifest/console build
MANIFEST_CONSOLE_HOST=app.manifest.internal pnpm --filter @manifest/console preview --port 7105 --strictPort
open https://app.manifest.internal/
```

`MANIFEST_CONSOLE_HOST` matters only under `vite dev`, where it names the host HMR's socket connects to; `preview` has no
HMR, so under `preview` it is harmless and does nothing (the sitting's review, M7).

The control plane judges each request against the origin it ARRIVED on, so a sign-in begun here names app's
assertion-consumer URL, comes back here, and sets a cookie on `app.` only — **a session on one origin is not a
session on the other**, and signing out of one leaves the other signed in (the plan's *What this plan does not
build*). The platform's SP row lists both ACS URLs and ONE single-logout URL, the console's; a sign-out begun here
is answered there by the IdP and sent back here by its `RelayState`. **A `502` at `/` means nothing listens on
7105**; `manifest OK host=app.manifest.internal … listener=public` means dnsmasq's `app.` pin is missing (the name
reached the PUBLIC wildcard). **Stop it by port when you are done**:
`lsof -nP -iTCP:7105 -sTCP:LISTEN -t | xargs kill`.

### The documentation, and the HTML reference

*Added by the authoring API plan's sitting 8, 2026-09-26 (Task 11).* The console's header has **Docs**: the pages
`GET /v1/docs` lists, each as plain text, and the contract's version. The Docs screen links **`/reference.html`**, a second
Vite page outside `src/` that mounts Scalar 1.72.0's **standalone bundle** over `GET /v1/openapi.json` — served by
`vite.config.ts`'s `scalarStandalone` step from `node_modules` (under `dev` a middleware, under `build` an emitted
`dist/reference/scalar-standalone.js`, 4,331,361 bytes) and never from a CDN. Signed out, it offers CWL sign-in. **Open it
with the browser's network log**: every request goes to the console's own origin, and one to any other host is a defect.
`vite build` warns that the page's classic `<script>` *"can't be bundled without type="module""* — that is the point.

The pages themselves are `docs/api/`, read by the control plane **once, at boot** (a page with no `# ` title or no first
paragraph refuses the boot, naming it — restart the control plane to serve an edit). **`pnpm docs:write`** regenerates
`docs/api/reference/`, `journey.md`'s and `events.md`'s tables, the guides' inlined code and `llms.txt` (with its copy in
`packages/console/public/`, which the console serves at `/llms.txt`); run it after `pnpm contract:write && pnpm
contract:generate`, and commit what it writes, or `pnpm test` is red naming the page.

**To read the API reference with NOTHING running — no Docker, no control plane, no mock, no server — run `pnpm docs:html`**
(added after sitting 8, at Rich's request). It writes `dist/api-docs/` — git-ignored, rebuilt whenever you run it — and
**opens `dist/api-docs/index.html` in your default browser itself**, straight from disk (`open` on macOS, `xdg-open` on
Linux), printing its `file://` address too:

```bash
pnpm docs:html                     # writes the page and opens it
pnpm docs:html --no-open           # writes it and only prints where it is
```

It is one page, **the reference only**: every operation, grouped by tag, with its parameters, examples and errors —
as `/reference.html` shows it — rendered by Scalar from the standalone bundle copied beside the page, so the one
prerequisite is `pnpm install`. It makes no request but for its own two files. **The guides are not in it** (Rich,
2026-09-30: pasted above the reference, they doubled the Markdown and were squeezed beside Scalar's request panel):
read them as Markdown in `docs/api/`, or from `GET /v1/docs`; the page's introduction says so.

## Running `manifest-mock`

*Added by P5c sitting 8, 2026-09-19 (Task 12). §21: "front-end developers are not
required to run the platform" — one process, not ten containers plus a language model.*

`packages/mock` serves the **published contract** from hand-written fixtures and, for every
operation without one, the document's own examples — with a scripted WebSocket stream. It needs no Docker, no Postgres, no Ollama and no control
plane.

```bash
pnpm --filter @manifest/mock dev            # runs from source (writes nothing) on 127.0.0.1:7102
MANIFEST_MOCK=1 pnpm --filter @manifest/console dev
open http://127.0.0.1:7104/                 # THE ONE TIME 7104 IS THE RIGHT ADDRESS
```

**This is the only configuration in which the console is reached at `127.0.0.1:7104`.**
There is no edge, no control plane, no IdP and no CSRF origin to satisfy, so the trap the
section above describes does not apply: `MANIFEST_MOCK=1` makes `vite.config.ts` proxy
`/v1` and `/auth` (and the stream's upgrade, `ws: true`) to 7102. *Sign in with CWL* sets
a fake cookie and comes straight back — a mock that made a person sign in would defeat its
own purpose.

**It starts from SOURCE since the front-end enablement plan's sitting 10 (FE-26 (b))** —
`node --import ../github-fake/resolve-ts.mjs src/main.ts`, Node 24's own type stripping, no
`tsc` and no `dist/` — so a sibling repository starting it writes nothing into this one.
`MANIFEST_MOCK_PORT=0` takes any free port, and the line it prints names the one it took.

**Whom it trusts (FE-26):** exactly the session its own sign-in sets —
`manifest_session=mock-session` — and **any** Bearer (it has no token store; its one mint
answers one fixed secret, and the guides' examples send one it never minted). Any other
session value, empty included, is `401 UNAUTHENTICATED`; a Bearer on an operation whose
`security` names the session alone (`getMe`, `mintToken`, `createProject`, the intake and
lifecycle operations, the approvals…) is `403 TOKEN_CREDENTIAL_REFUSED`, as the platform
answers it. **What it holds (FE-27):** the fixtures' ids — a path naming any other project,
environment, instance, release, build, pending action, agent or intake session, token,
approval preview or blueprint is `404 NOT_FOUND`, naming the mock. `mock-app`'s sandbox runs
an instance (and keeps an earlier failed one), staging runs one, production none —
`listInstances` and `getProject` agree — and every key's time is counted from the request.

| Variable | Default | What it changes |
|---|---|---|
| `MANIFEST_MOCK_PORT` | `7102` | Where it listens |
| `MANIFEST_MOCK_ROLE` | `member` | `admin` makes §26's fleet answer `200` instead of `403 FORBIDDEN` |
| `MANIFEST_MOCK_FAIL` | unset | `1` plays the deploy's other ending: `instance.failed` + `incident.opened` |
| `MANIFEST_MOCK_LAUNCHED` | unset | `1`: `mock-app` has been to production — `launchedAt` set, and a delete is `409 PROJECT_LAUNCHED_NOT_DELETABLE` |
| `MANIFEST_MOCK_AGENT_BUDGET` | `ok` | `exhausted`: the month is spent — a session start is `409 AGENT_BUDGET_EXHAUSTED`; `unavailable`: the gateway does not answer — every spend reads `null` with its reason, and a session start is `503 AI_BACKEND_UNAVAILABLE`, as the platform's is |
| `MANIFEST_MOCK_CONFIDENTIAL` | unset | `1`: `mock-app`'s data is `confidential` (`very-high`) and its building agent may use the capable model — a TOKEN is refused staging's and production's Incidents, `403 INCIDENT_LOG_CONFIDENTIAL` (a session and the sandbox are answered), and every agent session holds `default-chat-onprem`, `default-chat-onprem-reasoning` and `default-chat-large` |
| `MANIFEST_MOCK_LEVEL` | `medium` | `mock-app`'s UBC U1 level — `low`, `medium`, `high` or `very-high`; anything else is ignored. At `high` or above it answers as `MANIFEST_MOCK_CONFIDENTIAL=1` does (the token's `403 INCIDENT_LOG_CONFIDENTIAL`, and the same agent models); `MANIFEST_MOCK_CONFIDENTIAL=1` wins |
| `MANIFEST_MOCK_INTAKE` | `open` | `daily-limit` or `budget-spent`: describing a new app is paused — `409 INTAKE_DAILY_LIMIT_REACHED` or `INTAKE_BUDGET_EXHAUSTED` |
| `MANIFEST_MOCK_RECORDS` | unset (`sent`) | Where `mock-app` stands in UBC's order (the launch path plan's Task 13, `packages/mock/src/launch.ts`). Unset: both registrations `active`, the privacy assessment sent again and with the Privacy Office — drafting is `409 LAUNCH_RECORD_SUBMITTED`. `none`: nothing recorded; `drafted`: all three drafted, the assessment sendable, a registration `409 LAUNCH_PIA_NOT_APPROVED`; `assessed`: the assessment approved, staging sendable, production `409 LAUNCH_STAGING_NOT_REGISTERED`; `approved`: every blocking item met (FE-40 (1)) — a production deploy answers production's own instance. Each draft and send is answered as the platform answers it from that stage |
| `MANIFEST_MOCK_APPROVAL` | `approved` | FE-40 (3): `pending` — `getApproval` `404`, `admin-approval` unmet, `requestApproval` answers an open request; `rejected` — a rejection with its reason, `requestApproval` `409 RELEASE_REJECTED`. Unset, `requestApproval` is `409 APPROVAL_NOT_NEEDED` |
| `MANIFEST_MOCK_REHEARSAL` | `passed` | FE-40 (4): `failed` — `runRehearsal` answers `200` with `passed: false` and its evidence, and the checklist's item is unmet |
| `MANIFEST_MOCK_STEP_UP` | unset | FE-40 (2): `1` — a production deploy and a production secret are `403 STEP_UP_REQUIRED` until the browser visits `/auth/step-up?returnTo=…`, which sets a ten-minute cookie and redirects back |
| `MANIFEST_MOCK_QUEUE` | `default` | `full` (with `MANIFEST_MOCK_ROLE=admin`): `listQueue` holds one item of each kind, the three beyond `mock-app`'s on projects the mock does not hold (their links answer its `404`) |
| `MANIFEST_MOCK_ADMIN_REASON` | unset | the faculty-ready plan's Task 10: `1` — `getMe` is *Operator One*, an administrator who is NOT a member of `mock-app`, so every operation the document declares `Manifest-Admin-Reason` on is `400 ADMIN_REASON_REQUIRED` without it (or past 500 characters); the reason is part of the mock's idempotency hash |
| `MANIFEST_MOCK_SCAN_MS` | `10000` | §12's silent scan window (below). Shorten it in a test |

**What the scripted stream does, and why each part is there.** On subscribe it replays the
three events every project already has (`project.created`, `repository.seeded`,
`spec.validated`), sends the **control frame** — which is the only thing `subscribe`'s
`ready` resolves on — and then plays a build and a deploy on a timer:
`build.started` → twenty log lines 150 ms apart → **ten seconds of silence** →
`build.succeeded` → `instance.provisioning` → `sso.registered` → `instance.starting` →
`instance.healthy`.

**Those ten seconds are the point.** §12's scan runs inside `driver.buildImage` after
BuildKit returns and emits nothing at all, so on the real platform the log's last word is
`DONE` while the build row is still `running` with no digest — measured at 11.29 s and
9.70 s (P5c sitting 6, F12), and a person who pressed *Release* in that window got
`409 RELEASE_BUILD_NOT_DEPLOYABLE`. The mock's `GET /v1/builds/{id}` answers `running`
for exactly that window too, so a client developed here meets the trap before a faculty
member does. **Log frames are never replayed**, exactly as the platform never replays
them: a screen opened mid-build must also read `GET /v1/builds/{id}/logs`.

**What it does NOT prove.** A green run against the mock is never evidence about the
platform (the P5 brief's §8). Specifically:

- **Its fixtures are hand-written.** They are held honest by three things and by nothing
  else: `tsc` against the generated types, **Ajv against `openapi.json` on its 2020-12
  dialect** (`validate.test.ts`, and every response is validated again on its way out, so
  a body that does not match its schema is a `500` naming the schema), and
  `packages/console/src/api.test.ts`, which drives the console's whole data layer against
  it. A field the platform sends and no fixture carries is invisible here.
- **It does not enforce §20's CSRF origin check.** A browser reaching it through Vite's
  proxy sends `Origin: http://127.0.0.1:7104`, and the platform wants the console's own
  origin — so enforcing it would refuse every mutation the mock exists to let you make.
  It **does** enforce the credential rules, `Idempotency-Key` (`400
  IDEMPOTENCY_KEY_REQUIRED` under eight characters, `409 IDEMPOTENCY_KEY_REUSED` for a key
  replayed with a different body) and the fleet's `403`.
- **It has no state.** Every read answers a fixture; a mutation does not change what the
  next read returns. It is a contract mock, not a simulator. A rename answers the name you
  asked for and an archive `archived`, but the next read is the fixture again; a delete
  answers the tombstone, and the platform's `404` afterwards is the platform's to show.
- **It does not play §20's step-up.** Archive, delete, a production secret or deploy, and
  adding a member are answered without a second sign-in, as they always have been here; the
  console's step-up round trip is proved against the platform.
- **It does not know §23’s reserved labels, and it answers as though they were free.**
  `checkSlug` treats the one slug its fixtures already use as taken and *everything else* as
  available, so `edge` — which `infra/reserved-labels/labels.yaml` reserves as "Manifest’s
  edge proxy" — reads **`edge is available`** here and is refused by the platform. The
  contract declares three refusal codes (`SLUG_INVALID`, `SLUG_RESERVED`, `SLUG_TAKEN`) and
  the fixtures carry **one**, so the console’s rendering of the other two is exercised by
  nothing. Measured in a browser, P5c sitting 9 (F9): it is the second half of the clicked
  journey’s row 3, and the mock cannot show it.
- **An operation with no fixture is answered with the DOCUMENT's own example** (the
  authoring API plan's Decision 15), through the same Ajv check — and `server.test.ts` holds
  every example to crossing it. **Five are answered only for what their example is
  of** (`FROM_EXAMPLE`, 2026-09-26): `getFile` reads `src/app.js` alone, `getCommit`
  describes one commit, `listCommits` has one page, `createCommit` answers a dry run as
  a dry run, and `getDoc` reads the page `index` alone. Anything else is `409
  SOURCE_PATH_NOT_FOUND`, `SOURCE_COMMIT_NOT_FOUND` or `404 DOC_NOT_FOUND` **in the mock's
  own words** (*"manifest-mock holds the text of one file…"*) — the mock, not the platform.
  `getOpenApiDocument` answers the WHOLE document it serves from, so `/reference.html`
  renders the API against the mock. **It plays two platform refusals over its one state**
  (the authoring API plan's sitting 8): `main` is the tree example's commit (`c2ac2119…`), so
  a commit — or a dry run — based on any other is `409 SOURCE_CONFLICT`, the document's own
  request example included; and one that deletes or empties `manifest.yaml` is the
  platform's `422 SPEC_INVALID` word for word. **Otherwise it validates no request**, so a
  refusal the platform gives a malformed body — a secret's value under six characters, a
  commit's bad path — is a `200` here, any other invalid manifest is answered valid, and
  `SOURCE_SECRET_DETECTED` is never answered. **Its
  secrets are the example's**: every environment lists the same two declared names, a Set
  answers the example's name whatever was sent, and the list still reads *not set* after
  it. **It serves no `/auth/step-up`**, so production's round trip is the platform's.
- An operation the document declares and the mock has no answer for is **`501`** — the
  contract has grown a route the mock has not caught up with. A path the document does not
  declare is `404 ROUTE_NOT_FOUND`, exactly as the platform answers it.

**Stop it by port** when you are done —
`lsof -nP -iTCP:7102 -sTCP:LISTEN -t | xargs kill`.

## Mailpit — the laptop's mail sink

*Added 2026-09-30, out of plan at Rich's word — §21's tenth container.*

`make up` starts it — `manifest-mailpit`, always on, no profile. It is **this laptop's only mail server, and it sends
nothing on**: a message to anyone, at any address, lands here and stays here. On UBC infrastructure UBC's SMTP relay takes
its place. The faculty front-end's server sends to it, and so does the control plane.

**The control plane's own email** (since the FE-46/47/5 plan's Task 3, 2026-10-08): the Manifest team is emailed when an owner
asks for a release's sign-off — after the request is recorded and announced, in the background, so a relay that is down slows
nobody and costs one operator line (`"the Manifest team could not be emailed; the queue still holds the item"`, with the
transport's code). Four settings, all defaulted for the laptop, so nothing needs setting here (`.env.example` 2c):

| Setting | Default | |
|---|---|---|
| `MANIFEST_SMTP_URL` | `smtp://127.0.0.1:7111` | `smtp://` or `smtps://`, a host and an explicit port; UBC's relay with `user:password@` — a secret, so a refusal never repeats it |
| `MANIFEST_SMTP_REQUIRE_TLS` | `0` | `1`: STARTTLS or refuse. **Mailpit offers no STARTTLS, so `1` fails every send here** (`ETLS`) |
| `MANIFEST_TEAM_EMAIL` | `team@manifest.internal` | the team's one address — at UBC, Rich's to give |
| `MANIFEST_MAIL_FROM` | `Manifest <manifest@manifest.internal>` | `Name <address>` or an address |

Read one back: `curl -s "http://127.0.0.1:7112/api/v1/search?query=subject:%22<slug>%22"`. The sender is **nodemailer**
(`packages/control-plane`'s one mail dependency, pinned exactly); a clean clone's `pnpm install` fetches it like every other
dependency.

| | |
|---|---|
| **SMTP** | `127.0.0.1:7111` — no authentication, no TLS |
| **The inbox** | <http://127.0.0.1:7112> in a browser; its API under `http://127.0.0.1:7112/api/v1/` — e.g. `GET /api/v1/search?query=subject:"…"`, `DELETE /api/v1/messages` with `{"IDs":[…]}` |
| **Messages** | **in memory only** (`/tmp` is a tmpfs) — gone when the container restarts or is recreated; at most 500, oldest dropped first |

```bash
f=$(mktemp); printf 'Subject: hello\r\n\r\nfrom the runbook\r\n' > "$f"
curl -sS smtp://127.0.0.1:7111 --mail-from me@manifest.internal --mail-rcpt anyone@example.ubc.ca -T "$f"; rm -f "$f"
open http://127.0.0.1:7112
```

- **Use `127.0.0.1` or `localhost` in the address.** The inbox has no password, so it answers only those Host names —
  the guard against a web page reading it by DNS rebinding; any other name is answered `403`.
- **No hostname under `manifest.internal`**, deliberately, like the GitHub fake: nothing in a container reads the inbox.
- **What still reaches out is yours to click**: the inbox's *Link check* and *Screenshot* fetch a message's own links and
  images. Nothing else does — no relay, forward or webhook, no reverse-DNS lookup per connection, no version check.
  `infra/compose.yaml` says how each setting was measured, and `make verify` asserts them.
- **`make verify` sends one message and deletes it by its ID**; the rest of the inbox is left alone.
- **`make seed` pulls the image**, pinned by tag and digest in `compose.yaml`; `make doctor` says whether the daemon holds
  exactly that reference, which is what an offline `make up` needs.

## The GitHub fake — D5's driver 2, locally

*Added by the D5 plan's sitting 3, 2026-09-24 (Task 5). Rich's decision: **a fake in a
container, plus an opt-in check against real GitHub** (the plan's* Decided by Rich*).*

`manifest-github-fake` is a GitHub-compatible **FAKE** — App JWTs, stateless `ghs_`
installation tokens scoped to repositories and permissions, an organisation's private
repositories, and git over HTTP — so driver 2 can be built and accepted **offline**. It is
the package `packages/github-fake`, run from its TypeScript source by Node 22 in a
container, **behind the `github` profile**: `make up` never starts it, so a developer on
driver 1 never runs it.

```bash
make github-up        # `make up`, then the fake: http://127.0.0.1:7110 (loopback only)
curl -s http://127.0.0.1:7110/_fake/health            # ok
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:7110/api/v3/app   # 401 — no JWT
make github-down      # stops it; its repositories survive in manifest-github-fake-data
```

- **Its organisation is `manifest-apps`, its App `1000001`, its installation `2000001`**, and
  its API is under `/api/v3` — GitHub Enterprise Server's layout, so one host serves the API
  and git. Clone URLs are `http://127.0.0.1:7110/manifest-apps/<repo>.git`.
- **Its credentials are `make up`'s**, in `infra/secrets/` beside `master.key`, all `600`:
  it is given the App's **public** key, the webhook secret and `faculty-dev`'s token,
  read-only. **It is never given the App's private key** — GitHub holds only the public
  half — and `make verify` asserts both that and its loopback-only port.
- **`make reset` destroys its repositories** (they are project state). `pnpm test` does not:
  the unit tier starts its own fakes in process, on random ports.
- **What it is NOT.** It is not GitHub, and it does not try to be more of GitHub than
  driver 2 calls: no pull requests, no users beyond the App's installation and
  `faculty-dev`, and **no web interface**: a repository's `html_url` — what `Project.repository.webUrl`
  links to — serves one plain page saying, in its own words, **"This is not GitHub."**, naming the
  repository and its visibility and showing no code (since the D5 plan's Task 15). Its answers are held to
  **GitHub's own schemas** in the unit tier, and to a real App's recorded answers by the
  conformance run (*The conformance run*, below). A repository created without
  `private: true` is **public**, as on GitHub.
- **It needs the network once**, when `make seed` builds it (`apk add git` — there is no apk
  mirror). An image that was never built cannot be built offline; `make doctor` says so.

### The control plane on driver 2

*Added by the D5 plan's sitting 4, 2026-09-24 (Tasks 7–8).* **One driver per control-plane
process.** Start the fake, then start the control plane exactly as *Running the control plane*
says, with one more variable:

```bash
make github-up
export MANIFEST_SOURCE_DRIVER=github     # every MANIFEST_GITHUB_* default is the fake's
pnpm --filter @manifest/control-plane dev
```

**Or set it in `.env`**: `.env.example`'s section 2a documents every driver setting, commented out with its default —
uncomment `MANIFEST_SOURCE_DRIVER` and set it to `github`, and the block in *Running the control plane* (which starts
with `set -a; . ./.env; set +a`) picks it up at the next start. The same section has the block that points driver 2 at a
REAL GitHub App instead of the fake, with what changes when you do. **Comment it out again before running any other
demo**, and don't run `pnpm test:docker` from a shell that sourced an overridden `.env`: its boot tests start control
planes with that shell's environment.

**Read the boot line**: it says `"source":"github"`, the API's host (`"github":"127.0.0.1:7110"`)
and `"githubOrg":"manifest-apps"`. The App's private key is read at boot through the master key's
custody rule, so a key its group can read refuses the boot, naming the file.

- **A project keeps the driver it was created with.** Each one's `source_repositories` row says
  which; on the other driver every source operation — a build, a validate, an approval preview —
  answers **`409 SOURCE_PROVIDER_MISMATCH`**, naming both. **Every demo today is a driver-1 demo**:
  on driver 2, `launch-app` is refused that way, and a demo that pushes into `.manifest/repos/` is
  refused by the mirror's hook. Restart on driver 1 (unset the variable) before any `make demo*`,
  and never read that red as a regression. **Since 2026-09-26 each driver-1 demo asks first**
  (`require_driver local`, `scripts/lib/api.sh`, right after its up-check) and on driver 2 stops with
  the restart command, creating nothing. **Driver 2's own acceptance is `make demo-github`**
  (below, and the D5 plan's Task 15).
- **The mirror lives where driver 1's repositories do**, `.manifest/repos/<slug>.git`. It refuses
  every push (*"this repository is a mirror of GitHub"*) — push to the fake instead, at
  `http://127.0.0.1:7110/manifest-apps/<slug>.git` with `infra/secrets/github-fake-developer.token`
  in `http.extraHeader`, never in the URL.
- **With the fake stopped**, a commit the mirror already has still builds; anything that needs
  GitHub NOW — creating a project, validating at `HEAD` — answers **`503 SOURCE_UNREACHABLE`**.
- **A name GitHub already holds is never adopted**: `409 SOURCE_REPOSITORY_EXISTS`, and the project
  is not created. The fake's repositories outlive `pnpm test`; `make reset` removes them.
- **A push to the fake is DELIVERED to the control plane** (sitting 5, Task 9): `make github-up`'s
  container sends a signed `push` to `http://host.docker.internal:7100/webhooks/github` — the edge's
  own way in, never through the edge — and the control plane verifies it with
  `infra/secrets/github-fake-webhook.secret` (`600`, minted by `make up`), records it once, syncs the
  mirror and validates a moved `main`. It never builds. Each advance is an Event on the project's
  stream: `repository.pushed`, `repository.history_rewritten`. `GET http://127.0.0.1:7110/_fake/deliveries`
  lists what the fake sent and the answer it got. **On driver 1 the route answers
  `404 WEBHOOKS_NOT_CONFIGURED`**, which is how to ask a control plane which driver it runs.
  **A REAL App's webhook must be registered with content type `application/json`** — a
  form-encoded delivery is `415`. **After changing `packages/github-fake/src/`, rebuild the image**
  (`docker compose -f infra/compose.yaml -p manifest --env-file .env --profile github build github-fake`):
  the container runs what was built.
- **Every repository is kept PRIVATE** (sitting 5, Task 10): make one public on the fake (a `PATCH`
  with the developer token) and the next sync — the fake's `publicized` delivery, or any read —
  makes it private again and publishes `repository.visibility_enforced`. If it cannot, a build is
  **`409 SOURCE_REPOSITORY_PUBLIC`** until a sync reads it private, with the network off too.
- **A secret pushed straight to GitHub is FOUND, not blocked** (sitting 6, Task 11): GitHub.com runs no
  custom hook, so the next sync — any cause — scans every commit it has not reported and publishes
  `repository.secret_detected` per commit (commit, path, line, rule; never the value). The build of
  that commit still fails at the build gate. A commit MANIFEST makes is refused before it leaves:
  **`409 SOURCE_SECRET_DETECTED`**.
- **`main` is protected where GitHub will protect it** (sitting 6, Task 12): the fake's container
  runs the `team` plan, so a person's force-push or deletion of `main` is refused
  `GH006: Protected branch update failed for refs/heads/main.` On a FREE organisation GitHub will not
  protect a private repository — the project's `repository` says `mainProtected: false` with
  GitHub's words, `repository.protection_unavailable` is on its stream, and the console shows it.

**Driver 1's bare repositories are guarded too, since sitting 6** (Tasks 11 and 12): every
`.manifest/repos/<slug>.git` has a `pre-receive` hook RENDERED from the build gate's list of secret
rules, and git's `receive.denyNonFastForwards` / `receive.denyDeletes` — both set at creation and
re-set at every boot by `prepare()` (the boot line's `sourceRepositoriesPrepared`). A demo or a
person pushing a secret-shaped value to one is refused *"Manifest refused this push (§20): …"*; a
force-push is refused `non-fast-forward`. An edit to the hook does not survive the next boot.

#### On the real App

*Added by the launch path plan's Task 2, 2026-09-29, from Task 1's record — the control plane's first
run against REAL GitHub (`docs/superpowers/spikes/launch-baseline/README.md`, `[M1]`), with `Manifest
(local dev)` on the free organisation `Manifest-local-dev`.* **It creates real repositories, needs the
network, and every project made on it lives on github.com whatever the database says.**

- **Switching.** `.env.example`'s section 2a has the block: uncomment all of it, set the three ids, and
  restart with *Running the control plane*'s block. **Read the boot line**: it must say
  `"source":"github","github":"api.github.com","githubOrg":"Manifest-local-dev"`, with no credential in the
  log. `sourceRepositoriesPrepared` counts only the mirrors of THIS GitHub: a mirror another GitHub made —
  the fake's, say — is left exactly as it is, with an operator line *"… is a mirror of the GitHub at
  127.0.0.1:7110, and this control plane runs against github.com; it is left as it is"* (Task 1 measured
  the boot rewriting two of the fake's orphaned mirrors as its own; since Task 2 it does not). To go back,
  comment the block out and restart.
- **A project keeps the GitHub it was made on.** `source_repositories.api_host` records the API's host
  (never published); on a control plane running another GitHub, every source operation — a read, a
  build, a delete — answers **`409 SOURCE_PROVIDER_MISMATCH`**, naming both hosts and the restart that
  fixes it. A row older than migration 0040 has no host and is answered by any GitHub, as before — so
  never reuse a project name across the fake and a real App.
- **`main` is not protected on the free organisation**: `Project.repository` says `mainProtected: false`
  with GitHub's own words (*"Upgrade to GitHub Pro or make this repository public to enable this
  feature."*), and `repository.protection_unavailable` is on the stream. The mirror still refuses a
  rewrite of the history a release names.
- **No webhooks: GitHub cannot reach a laptop**, so a person's push to github.com is seen at the NEXT
  READ — a tree, a file, the history or a commit, or the console's *Re-validate* — and **NOT at a build
  of `{}`**, which builds the newest VALIDATED commit already in the mirror and fetches nothing. *That is
  read from the code (`api/routes/builds.ts`), not measured end to end: no push was made on github.com at
  sitting 2's open, 2026-09-29.*
- **Deleting a never-launched project DELETES ITS REPOSITORY ON GITHUB** (measured: `lp-real-scratch`,
  GitHub `404` afterwards and the mirror gone). A create that fails after GitHub made the repository
  destroys it too, since Task 2; if even that fails, the operator line *"POST /v1/projects: <slug>'s
  repository was made by the github driver and could not be destroyed …"* names what to remove.
- **Any Vitest run truncates the rows and leaves the repositories.** `bash scripts/github-real-repos.sh`
  lists every repository in `.env`'s organisation beside its owner — `live <project id>`, `deleted` or
  `NONE` — and `--delete <name>` deletes ONE whose line reads `NONE`, after `yes` on stdin; it never
  deletes one a project row names, and says `SKIPPED` with the network off. `scripts/dead-app-resources.sh`
  names the mirrors no project holds. **While `.env` carries the real-App lines, run `pnpm test` and
  `pnpm test:docker` from a shell with `MANIFEST_SOURCE_DRIVER` and every `MANIFEST_GITHUB_*` unset** — the
  tiers refuse to start otherwise (*"refusing to run: MANIFEST_GITHUB_API_URL points at a real GitHub
  (api.github.com). The test tiers use the GitHub fake."*), before they truncate anything.
- **The demos refuse it.** `make demo-github`, and the driver-2 branch of `make demo-authoring` and `make
  demo-frontend`, stop at step 0 — before the fake's health and before anything is created — with *"FAIL
  this demo drives the GitHub FAKE (make github-up); the control plane is set to real GitHub (.env's
  MANIFEST_GITHUB_API_URL)"*: each is the fake's end to end, and against github.com would leave a real
  repository behind when it failed part-way. Every driver-1 demo stops too (`require_driver local`).
- **A repository GitHub made seconds ago may be REFUSED over git for ~2–4 s** (the launch path plan's sitting 4, FE-41 — measured on
  github.com: 6 of 7 creates failed one evening, with or without a starter). Driver 2's create retries its seed push and its first
  fetch while GitHub refuses the new repository `403`/`404` — one budget of at most ~30 s per creation, a fresh token each time — and
  each retry writes *"github driver: Manifest-local-dev/<slug>: the seed push [or: the first fetch] of a repository GitHub made seconds
  ago was refused (…); retry n of 5 for this creation, in <ms> ms (FE-41)"*. A create that still fails writes *"POST /v1/projects:
  <slug> was not created; its repository step failed (<code>): …"* and leaves nothing behind. **So a create may take up to ~30 s
  longer than below** (8–11 s typical, 5 of 5 after the fix).
- **What GitHub took** (Task 1, 2026-09-29): token mints 313–448 ms; REST reads 350–1101 ms; a create 8–9 s;
  a commit through the authoring API 5 s; a delete 1 s.

## The conformance run — the fake against REAL GitHub

*Added by the D5 plan's sitting 3, 2026-09-24 (Task 6). **Opt-in, with the network on, and
at Rich's yes EACH TIME**: it acts on a real GitHub account.*

`packages/github-fake/src/conformance.ts` is one request script — seventeen steps, C1 to
C14 with C5b, C7s and C9r — that records a **normalised** answer per step (a status and a few
facts; never a token, a key or a per-run id). It runs against two targets:

- **the in-process fake, on every `pnpm test`** (`conformance.test.ts`), compared with
  `packages/github-fake/conformance/golden.json` — which holds **GitHub's measured
  answers** since the first real run, 2026-09-24;
- **real GitHub, from `make github-conformance`**, with `Manifest (local dev)`. It creates
  two private repositories named `mf-conformance-<timestamp>-a` and `-b` in the App's
  organisation, pushes one commit, **force-pushes a rewrite of it to `-a` (C9r**, added by the D5
  plan's Task 15: what a real `git fetch --porcelain` with driver 2's two refspecs prints — `!` for
  the mirror's `main`, `+` for the shadow's), **deletes both in a `finally`** (printing their names if
  a delete fails, so they can be removed by hand), and writes
  `conformance/github.com-<date>.json` beside golden, printing every step that differs.
  **It never makes a repository public.** ~12 s.

```bash
make github-conformance     # SKIPPED (exit 0) without a registered App or the network
```

**Afterwards:** commit the dated file as evidence; fold any difference into golden (its
`source` names the run); **fix the fake until `pnpm test` is green again** — a
disagreement goes to the fake, never to golden, unless the run shows golden wrong.

**What it needs — `Manifest (local dev)`, registered once** (the D5 plan's *What Rich does*
2 has every setting): a **free organisation** of its own (an installation token cannot
create a repository on a personal account); a GitHub App registered under it with
**Administration: read and write, Contents: read and write, Metadata: read-only**, nothing
else, **no webhook** and *Only on this account*; installed on *All repositories*; its key
at `infra/secrets/github-app.pem` (`chmod 600` — the script refuses a looser one) and
`infra/secrets/github-conformance.json` holding `{"appId": …, "installationId": …, "org":
"…"}`. **Never install it on UBC's organisation**: its key mints a token for every
installation of the App. To revoke it, delete the key or the App on its GitHub page.
**An App that DOES get a webhook** — UBC's, which has a public address to deliver to — must be
registered with **content type `application/json`** and a secret in `infra/secrets/`'s custody
class: the receiver reads exactly JSON, and answers a form-encoded delivery `415` (the D5 plan's
`[M9]`, and sitting 5's F1).

**What the first run measured (2026-09-24, App 5068172, organisation `Manifest-local-dev`,
free plan)** — the fake was corrected for the first three:

- a token's `permissions` answer ADDS `metadata: read` to what was requested (C5);
- **a token SCOPED to one existing repository, holding `administration: write`, CREATED
  another repository** (C7s): GitHub does not confine creation to a token's repositories;
- a `contents: read` token's push is refused with `remote: Write access to repository not
  granted.` (C11);
- a token CAN name a repository one second after it was created (C8); the stateless
  `ghs_<APPID>_<JWT>` format is what this App gets (C5); a token cannot name a repository
  that does not exist (C5b, `422`); a free organisation refuses protection on a private
  repository with the documented upgrade message (C13).

## `make demo` — an app, from a bare repository to a URL

*Added by P3 Task 17. First run green 2026-09-07.*

`make demo` drives the **real HTTP API** end to end, so it proves the platform
rather than a test harness. The control plane must be running first — see
*Running the control plane*, above — and its boot line
must say `{"driver":"docker"}`. Against the fake driver every claim below is empty,
which is why step 0 of the script checks and why the boot line exists at all.

```bash
make up
# ... start the control plane in another terminal, per "Running the control plane" above ...
make demo
```

Nine steps: **log in with CWL — a real three-hop SAML round trip against the Manifest
IdP, as `instructor`/`instructor`** (the dev shim it used to call is deleted) · create
the project (three environments and a
provisioned bare repository) · push `fixtures/fixture-app` into that repository with
a `manifest.yaml` declaring a Mongo · validate the manifest at that commit · build
(blueprint Dockerfile, egress-free builder, npm mirror, SBOM and scan, digest) ·
release · deploy to staging · **be refused production** with §13's checklist · then
reach the app from a container, through the edge, with the platform CA verified and
no `-k`.

The last step prints the app's own body:

```json
{"app":"fixture-app","env":"staging","url":"https://fixture-app.staging.manifest.internal",
 "uid":10001,"boots":1,"writes":1}
```

**Read `uid` and `boots`, not the 200.** `uid: 10001` is §12's non-root baseline
observed from outside the container. `boots` is written once per *process start* and
never by a request, so a rising value across a stop and start is evidence the bound
database and its volume are real — where a 200 is evidence only that something
answered. The Caddyfile wildcard returns 200 for **every** name in the zone whether a
route exists or not, so "it answered" genuinely proves nothing here; the script
checks the body for that reason.

`make reset` removes every `mf-` container, network and volume the demo created and
keeps `manifest-caddy-data`, so the CA you trusted stays trusted.

### Proving it is really offline

*Run 2026-09-07. This is the control, and without it a build that succeeded because
the daemon had the image cached is indistinguishable from one that succeeded because
the mirroring worked — which is the mistake S1 made once, in the other direction,
with the npm registry.*

Removing the mirrored base image must make the build **fail**. *The digest below is the one the blueprints pinned
then, `node:22-alpine`'s; since 2026-10-03 they pin `node:24-alpine`'s registry digest, `sha256:38a36422…` — read it from
either `blueprint.yaml`'s `base_image` before you delete anything.*

```bash
# `delete` is a SEPARATE registry action. The default token has pull and push only,
# and a DELETE without it answers 401 — leaving the image in place, the build
# succeeding, and the wrong conclusion drawn.
TOKEN=$(node infra/seed/mint-token.mjs --actions=pull,push,delete base/node)
curl -sS -X DELETE -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:7107/v2/base/node/manifests/sha256:1ef15d33…"   # -> 202
docker exec manifest-registry registry garbage-collect \
  --delete-untagged /etc/docker/registry/config.yml
make demo                                                          # -> MUST FAIL
```

Observed, and it is the right failure for the right reason:

```
ERROR: failed to solve: manifest-registry:5000/base/node@sha256:1ef15d33…:
failed to resolve source metadata … : not found
```

It does **not** fall back to Docker Hub, because §12 puts the builder on an
`--internal` network with no route off it — which `make verify` asserts as a named
negative control. Restore with no network at all, because the daemon still holds the
image:

```bash
docker restart manifest-registry        # see the warning below
bash infra/seed/mirror-images.sh
```

**Three things about this procedure, each of which silently does nothing if you get
it wrong**, and a control that quietly does nothing is worse than no control:

| | |
|---|---|
| The token needs `delete` | Without it the DELETE is **401** and the image is still there. |
| `REGISTRY_STORAGE_DELETE_ENABLED` must be `true` | It is, in `infra/compose.yaml`. Without it the DELETE is **405**. |
| `Accept` headers must be **separate `-H` flags** | This `registry:2` does not split a comma-joined list, and the mirrored base is an **OCI** manifest, so `-H 'Accept: application/vnd.oci.image.manifest.v1+json'` is the one that matters. Comma-joined, the registry answers **404** `OCI manifest found, but accept header does not support OCI manifests` — which reads exactly like "the image is missing". |

**And `registry garbage-collect` on a RUNNING registry corrupts it.** Upstream
requires the registry to be read-only or stopped during a GC; run live, it deletes
the manifest blob while leaving the tag and revision links pointing at it, and every
later `docker push` of the same content reports success with the right digest while
the registry keeps answering 404. Measured 2026-09-07. A `docker restart
manifest-registry` before re-mirroring is what clears it.

## If something is wrong

`make doctor` first. Every check in it corresponds to something that actually went
wrong during a spike, during P1's execution, or — the host-tool check — during P4a's;
none is hypothetical.

| Symptom | Cause |
|---|---|
| `curl: (6) Could not resolve host` **while `dig +short` returns the right address** | dnsmasq is missing `--local=/manifest.internal/`, so AAAA is answered with a hard error instead of NODATA and both musl and glibc fail the whole dual-stack lookup. Measured on dnsmasq 2.91: the status is `REFUSED` (S7 recorded `SERVFAIL`; the code varies, the symptom does not). |
| `bind: can't assign requested address` — **or, after a reboot, every host request to `*.manifest.internal` fails with `Failed to connect … port 443` while containers reach the edge** | The `127.0.0.2` alias is gone — a reboot removes it. `make up` re-adds it, **but if Docker Desktop started first it has already restarted Caddy without the alias, and it never retries that port forward**: `docker port manifest-caddy` prints nothing. Run `docker restart manifest-caddy`. See *Known gaps*. |
| A container cannot resolve `manifest-postgres` | dnsmasq is missing `--server=127.0.0.11`, so `--no-resolv` made it authoritative for everything. |
| Node reaches the edge but `curl` does not, or vice versa | Trust is needed in **three** places, not two: the macOS keychain, container trust stores, and `NODE_EXTRA_CA_CERTS` for host Node processes. Without it Node gives `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` while `curl` on the same URL is fine. |
| A build fails on `failed to resolve source metadata` | The base image is not in the local registry. `make seed`. Pulling alone is not enough — BuildKit cannot see the daemon's cache. |
| `docker push` hangs | You used `localhost`. It resolves to `::1`. Use `127.0.0.1`. |
| The console streams nothing, with no error | The app is talking to a *thinking* model with thinking ON. Its reasoning arrives as `reasoning_content`, which clients discard, so a token limit spent on thinking answers empty. Measured: 0 content frames in 472 from a 4B thinking model asked to count to five, and 0 in 260 from `qwen3.5:4b` (2026-09-24). **`default-chat` and `default-chat-onprem` are `qwen3.5:4b` with Ollama's `think: false` pinned in `infra/litellm/config.yaml`** — check it is there (`docker exec manifest-litellm grep 'think: false' /app/config.yaml`; the file is a single-file bind mount, so edit it IN PLACE and `docker restart manifest-litellm`). A request's `reasoning_effort` cannot override it; a request sending Ollama's own `think: true` can. **Or the app declared a `-reasoning` name** (`default-chat-reasoning`, `default-chat-onprem-reasoning`), where thinking is ON by design: it needs a generous `max_tokens`, or none — measured: 300 tokens → empty; no limit → the answer after 17–129 s of thinking. |
| An embedding "works" but retrieval is nonsense | The caller omitted `encoding_format: 'float'` and got 192 zeros instead of 768 floats. LiteLLM's Ollama path ignores the parameter, so a client's base64 default decodes to rubbish. |
| The egress proxy 403s correctly but requests near it fail with `Empty reply from server` | tinyproxy exits after serving a denial unless `DefaultErrorFile` is set, and `restart: unless-stopped` hides it. `make verify` checks the restart count across a denial. |
| **Nothing** resolves — not `.test`, not `manifest.internal`, not `google.com` — while `nc -z 127.0.0.1 53` succeeds | Valet's dnsmasq is hung in `sendto` to an upstream nameserver. It is single-threaded, so one stuck send freezes everything it serves. `sudo launchctl kickstart -k system/homebrew.mxcl.dnsmasq`, then `sudo killall -HUP mDNSResponder`. Nothing to do with Manifest, which uses port 7153. |
| A build fails with `unknown flag: --builder` | Not a buildx version problem. `runBuildxBuild` builds a throwaway `DOCKER_CONFIG`, and setting that moves CLI-plugin discovery with it, so buildx must be at `~/.docker/cli-plugins/docker-buildx` specifically. Installed anywhere else it passes `docker buildx version` and fails every build. `make doctor` asserts the symlinked path, not the command. |
| A service shows `unhealthy` while plainly working | Its healthcheck uses a binary the image does not ship. The LiteLLM image has no `curl`, `wget` or `nc` — only `python3`. |

## What this does to your machine

Three things, all reversible with `make host-undo`:

1. `/etc/resolver/manifest.internal` — scoped to our zone only, never all of
   `.internal`, which would break Docker's own `host.docker.internal`.
2. **Two** aliases on `lo0`: `127.0.0.2` and, since P6a, `127.0.0.3`.
3. Caddy's CA root trusted in the System keychain.

### The second address, `127.0.0.3` (P6a, R3)

§12 splits the edge into two listeners, and **a second address is what makes that real
on this machine**. `127.0.0.2` carries the internal listener — staging, sandbox, the
console and the IdP — and **`127.0.0.3` carries the public one, which serves the
production zone and nothing else**. The two are separate Caddy *servers*, `srv0` and
`srv1`, inside the one `manifest-caddy` container, so there is still exactly one
`caddy-data` volume and one internal CA.

**Why an address rather than a port:** the faculty-facing URL has to stay
`https://<slug>.manifest.internal` with no port, or the byte-for-byte host/container
hostname parity §9 needs is broken — `infra/compose.yaml` refuses a port in that URL in
its own words.

**FROM A CONTAINER IT IS A PORT, AND THAT IS NOT A CONTRADICTION** (P6a Task 4,
Decision 15). `manifest-dns-containers` answers the edge's single address, `10.89.0.10`,
for the whole zone, so a container cannot pick a server by address the way the host does
— it picks one by port: **`:443` is `srv0` and `:8443` is `srv1`**. The readiness probe
runs from a container (a host process cannot reach a container address on Docker
Desktop), so a PRODUCTION deploy's probe is the one thing that carries a port:
`MANIFEST_EDGE_PUBLIC_PORT`, default **8443**, which `make verify` holds equal to the
container-side half of compose's `127.0.0.3:443:8443`. Nothing a person types ever
carries it.

**If a production deploy hangs for about fifteen seconds and then rolls its route
back**, that port is the first thing to check. The message it prints is
`the edge answered 200 with no X-Manifest-Instance … that is the edge's wildcard, not a
routed app` — which names the wildcard and says nothing about a port, because the probe
reached `srv0` and found no route there.

**The zones are nested and production is the parent.** `manifest.internal` *contains*
`staging.`, `sandbox.`, `console.`, `idp.` and `edge.`, so `dns-host` pins those five
back to `127.0.0.2` with more-specific `--address=` rules. Without the pin-backs the
console and the IdP move to the public address and the console goes down. `make doctor`
checks both directions of this — that a production name answers `127.0.0.3` **and** that
the console does not.

**Adding it needs `sudo` once:**

```bash
sudo bash infra/host/p6a-second-address.sh
```

It is additive, it does not touch Valet, and after that `make up` re-adds both aliases
on every start because neither survives a reboot. **`make host-undo` removes both and
asserts both removals.**

**Laravel Valet is never touched.** It keeps `.test`, port 53, and `127.0.0.1:80`
and `:443`. Verified during P1's execution rather than assumed: Valet's config files
were unmodified (mtime 2026-07-03), its dnsmasq was the same process throughout, and
Manifest binds only `127.0.0.2:80/443`, `127.0.0.3:443`, `127.0.0.1:7119` and
`127.0.0.1:7153` — never 53, never `127.0.0.1:80/443`. Its nginx still answers on
`127.0.0.1:443`.

## C1's acceptance — what was actually run

**These are dated measurements, not current counts.** The check totals below are
what those commands reported *on 2026-09-05*; P3 and then P4a have since added checks,
and the current numbers are stated ONCE each (Rich, 2026-09-30): **`scripts/ci-acceptance.sh`'s `EXPECT_` lines** for
`pnpm test`, `make doctor` and `make verify`, and **ORIENTATION §2's `pnpm test:docker` row** — this file states none of them. **The offline acceptance has not been
re-run since 2026-09-05**, and P4a Task 15 owes it: it is Rich's to run, because
disabling Wi-Fi cuts an agent off too. **It now has NINETEEN steps, 1 to 19, after step 0's offline check** (A1's Task 10 added step 19, `make demo-capacity`, on either driver — it builds and deploys, so `make refresh-vulndb` first with the network on; the U1 plan's Task 7 added step 18, `make demo-levels`; the faculty-ready plan's Task 11 step 17, `make demo-faculty-ready`; the launch path plan's Task 15 step 16, `make demo-launch`; the front-end enablement plan's Task 15 step 15, `make demo-frontend`; and the authoring API plan's Task 13 step 14, `make demo-authoring` — all six run on either driver; this line said EIGHTEEN until A1's sitting 8, SEVENTEEN until the U1 plan's sitting 3, SIXTEEN until the faculty-ready plan's sitting 7, FIFTEEN until the launch path plan's sitting 12, and FOURTEEN until its sitting 2's sweep) — P5a sitting 12 added `make demo-journey` as step 8,
P5b sitting 9 added `make demo-token` as step 9, P5c sitting 9 added the console's
preflight as step 10 (2026-09-19), and P6a sitting 11 added `make demo-production` as step 11
(2026-09-22), and P6b sitting 7 added `make demo-releases` as step 12 (2026-09-23) — whose
approval summaries may legitimately read `unavailable` offline — or `withheld`, with the rule the
model's answer broke, since the D5 plan's sitting 7 — which is Decision 7 working, not a failure — all guarded by the same control-plane check as steps 6
and 7. **The D5 plan's sitting 8 added `make demo-github` as step 13 (2026-09-25), and the guards now ask
WHICH SOURCE DRIVER the control plane runs**: steps 6 to 12 are driver 1's and step 13 is driver 2's, so a
run reaches step 13 on driver 1 and prints both restart commands, SKIPPED — restart on driver 2 and run it
by hand, then restart on driver 1. The evidence is left exactly as recorded — a run is a run — and this
note exists so nobody reads it as today's baseline.

**Offline: PASSED, 2026-09-05.** Wi-Fi disabled on `en0` (the machine's only
route), then `make down && make up && make doctor && MANIFEST_VERIFY_OFFLINE=1
make verify` via `scripts/offline-acceptance.sh`:

- `make up` — **0 failed**, every service Healthy, with no network. *This is the
  half no spike had ever tested*: S7 could not test offline at all, and S1
  evidenced only the build half, never the boot half.
- `make doctor` — 14 checks, 0 failed, 0 warnings.
- `make verify` — 33 checks, 0 failed, 0 warnings, including base images
  resolving from the local registry and `npm install` against the mirror.
- The C1 demo itself, host and container, no port and no `-k`:

  ```
  manifest OK host=console.manifest.internal scheme=https remote=10.89.0.1
  manifest OK host=console.manifest.internal scheme=https remote=10.89.0.8
  ```

Machine: macOS 26.6.2 (arm64), Docker Engine 29.7.2, Docker Compose v5.4.0,
Node 24.12.0, Ollama 0.33.3.

## `make demo-identity` — a real person, and data that stays theirs

*Added by P4a Task 15. First run green 2026-09-09, including from a `make reset`
machine.*

P3's `make demo` proves the platform can deploy an application. This one proves the
application knows **who** is using it. Same requirements: `make up`, the control plane
running, and a boot line saying `{"driver":"docker"}`.

```bash
make up
# ... start the control plane in another terminal, per "Running the control plane" above ...
make demo-identity
```

Nine steps: log in to **Manifest itself** with CWL (§9 — Manifest is its own Service
Provider) · create the project · push the `proof-app` starter
(`blueprints/node-ts-mongo/starters/proof-app`) **over `node-ts-mongo@1`'s skeleton**, the way an agent generates an application · validate · build, release,
deploy to staging · **sign in to the deployed app as `student`**, through the edge,
over TLS with the platform CA · write a note and read it back · **sign in as
`instructor` and do not show them the student's note** · **sign the student out, and sign the
instructor in through the same two cookie jars** — a shared lab machine. The proof app's third half —
a question answered — is `make demo-ai`'s, below. Both scripts assemble and deploy the
proof app through one shared `scripts/lib/proof-app.sh`, so they cannot disagree about
what the proof app is. The proof app declares `ai.models` and needs its AI half to
start, so this demo also needs LiteLLM up and the control plane's AI switched on.

**Step 8 is the whole point.** Steps 6 and 7 prove a login happened; only step 8 proves
the app can tell two people apart. It is checked in both directions — neither person
sees the other's note, and each reads back their own — because "the note is absent" is
also true of an application that returns nothing to anybody.

**Step 9 is what a browser does, and until 2026-09-16 it could not pass.** Signing out must land back on the
app, not on the IdP's `500 URL not allowed`; the app must forget the person (`/api/me` 401); and the IdP must
forget them too — its next answer to *Sign in* is a password form, not an assertion for the person who just
left. Each half was measured failing: the IdP trusted no app as a `ReturnTo`, and the app's `/auth/logout` —
which is also the SingleLogoutService the platform registers — treated the IdP's own `LogoutRequest` as a new
sign-out, so the two redirected into each other. `make verify`'s *the IdP signs an app's user out to the app,
and to nowhere else* holds the IdP's half without an app.

It is **re-runnable**: it reuses its project and makes each run's notes unique. Run it
twice. A first run that passes and a second that fails is a state leak, and that is
exactly what its own first version had.

`blueprints/node-ts-mongo/starters/proof-app/README.md` carries the attribute justifications UBC IAM will ask
for — `givenName` and `sn` are the two that are not pre-authorized.

## `make demo-journey` — P5a's acceptance, as it grows: §22 through the generated client

*Added by P5a sitting 5, 2026-09-16. It grows one step per P5a task and becomes the acceptance at Task 17.*

The control plane running, per *Running the control plane* above. It builds `@manifest/contract` and `packages/journey` from the checked-in
document, checks the control plane answers through the edge, signs the instructor in with CWL through
`infra/lib/idp-login.sh`, and runs the journey — a Node process calling `https://console.manifest.internal` through nothing but
the generated client, under `NODE_EXTRA_CA_CERTS`.

```bash
make up
# ... the control plane running, per "Running the control plane" above ...
make demo-journey           # ~1 minute; ends with `every check passed` and exit 0
```

Every check prints `ok` or `FAIL` and the run exits 1 listing each failure. **A journey that does not build stops at step 0 and
prints `tsc`'s errors** — the journey is type-checked against the generated contract, so a call or a field the contract does
not have stops it there. `FAIL no step threw — [cause UNABLE_TO_GET_ISSUER_CERT_LOCALLY] TypeError: fetch failed` is a journey
run without the platform CA. So far it runs §22 step 1 (`GET /v1/me`), step 2's list of the instructor's projects, step 2a's slug checks (`GET /v1/slugs/{slug}` for `console`, `chem`, `Journey_App` and `journey-app`), step 2b's catalogue and knowledge pack (`GET /v1/blueprints`), and step 2's creation: **it creates `journey-app` from `node-ts-mongo@1`'s `proof-app` starter, for a class, the first time, and reuses it after** — a project and a bare repository, no container. Step 3 subscribes to the project's event stream through the edge (`subscribe` in `@manifest/contract`, with the session and the console's `Origin` on the upgrade) and checks the replay carries `project.created`, `repository.seeded` and `spec.validated` in order, then the ready frame; `FAIL the stream became ready — the event stream closed before it was ready (1006)` is an upgrade the control plane refused. **Step 4 builds `journey-app`** (P5a Task 13): subscribed first, it starts a build, checks the answer came back `running` at once (R6), waits on the stream for that build's `build.succeeded` or `build.failed` — up to 960 s, past the builder's own 900 s bound — checks its log lines arrived before its end, and reads `GET /v1/builds/{buildId}` for a digest and a scan by `anchore/grype`. It prints how long the build took and what the scan said. **Step 5 releases that build and deploys it to staging** (P5a Task 14): it checks the release carries the build's digest and a real scan and names its env vars **without their values** (`COURSE_CODE`, never `CHEM_121`), reads the release back and lists the project's releases, then subscribes and deploys — the instance must be `healthy`, must carry no `driver` or `handle`, and the stream must have carried `instance.provisioning`, `instance.starting` and `instance.healthy` **in that order**. **Step 6 leaves the contract and enters the deployed app** (Decision 38): `idp_login` signs the instructor in at `journey-app.staging.manifest.internal` with CWL, writes a note through the app's own `/api/notes`, and asks `/api/ask` a question the note answers — checking the reply came back embedded in 768 dimensions (S3's silent failure). **Step 7 asks for production** (P5a Task 15): the deploy is refused `409 RELEASE_PRODUCTION_GATE_UNAVAILABLE`, the refusal carries §13's checklist, and `GET /v1/projects/{projectId}/launch-readiness` answers the same bytes — not ready, the candidate the release serving staging, the domain before IAM registration, scans computed from that release, and every other item saying which plan builds it. **Step 8 reads the fleet** (P5a Task 16): the instructor is refused `403`, then the script signs `operator` in, runs `scripts/admin-grant.sh grant opr000001`, signs them in AGAIN — a session carries the role it was issued with — and `GET /v1/fleet` shows `journey-app` owned by the instructor, for a class, healthy in staging on the journey's release. After `pnpm test` has emptied the tables it first removes `.manifest/repos/journey-app.git`, as the demos do for theirs (*Known gaps*).

## `make demo-token` — P5b's acceptance: an agent runs the build loop, and a human answers it

*Added by P5b sitting 8, 2026-09-18 (Task 12).*

D24's loop, end to end, through the edge. The control plane running, per *Running the control plane* above. It builds
`@manifest/contract` and `packages/journey` from the checked-in document, checks the control plane answers
through the edge, signs the **instructor** in with CWL, signs the **student** in once as well — see below —
and runs `packages/journey/dist/token.js`: a Node process holding two credentials, calling
`https://console.manifest.internal` through nothing but the generated client, under `NODE_EXTRA_CA_CERTS`.

```bash
make up
# ... the control plane running, per "Running the control plane" above ...
make demo-token             # ~40 seconds; ends with `every check passed` and exit 0
```

It works on its own project, **`token-app`**, created from `node-ts-mongo@1`'s `proof-app` starter the first
time and reused after — creating it is the *instructor's* job, because `POST /v1/projects` is interactive-only
(D24's scope rule). **The run prints nine steps**; they are grouped here into seven, so the numbers below are
not the step numbers it prints:

1. **The instructor mints a delegated token** for the agent: `project:read`, `build:create`, `release:create`,
   `release:deploy` — and a mint carrying `members:manage` is refused `400 TOKEN_CAPABILITY_FORBIDDEN` first,
   so the token step 6 is refused with demonstrably *could not* have been minted differently. The secret is
   checked to be `mft_<the row id with its dashes stripped>_<43 base64url characters>`, and the token object
   itself is checked to carry no `secret` field at all.
2. **The agent reads its own project** — and `GET /v1/projects` answers it exactly that one, never its
   minter's others — and is refused `GET /v1/fleet` and `POST /v1/projects`, both `403
   TOKEN_CREDENTIAL_REFUSED`.
3. **The agent builds**, watching its own event stream on its own bearer, and **deploys to staging**; the app
   then answers its own `/healthz` through the edge. **Promoting the same release to production is refused
   `403 TOKEN_ACTION_PENDING`** — `release:promote` is privileged and `release:deploy` is not.
4. **The agent asks to add a member** and is refused `403 TOKEN_ACTION_PENDING`, carrying the question.
5. **The instructor reads §26's queue and confirms it** — and the agent trying to confirm its own question is
   refused `403 TOKEN_CREDENTIAL_REFUSED` first, because a loop with no human in it is not D24's loop.
6. **The agent retries** with the same body and the **same `Idempotency-Key`** and gets `201`; the same key
   again replays that `201` and asks nobody anything; a **fresh** key is a new question. The instructor
   **rejects** that one, and the agent's retry is `403 TOKEN_ACTION_REJECTED` carrying their words verbatim.
   Then the instructor, stepped up, names the STUDENT and is refused `409 MEMBER_MAY_NOT_BUILD` (FE-39: only
   a faculty member or an administrator is added).
7. **The instructor revokes the token** and the agent's next call is `401 UNAUTHENTICATED` — while the token
   still reads `expired: false`, because a clock and a person are different answers to why a credential stopped.
   **Since the faculty-ready plan's sitting 4 (FE-52, FE-49)** the agent first asks a NEW question (adding
   `col000002`) that nobody answers; after the revoke it reads `expired`, a stepped-up confirm of it is `409
   PENDING_ACTION_RESOLVED`, and the revoked token's `mintedBy` is the instructor's own `getMe` id. *That step was
   first run by `.superpowers/sdd/2026-09-30-faculty-ready/s4-edge-proof.sh` (driver 1), not by the sitting.*

**Every check prints `ok` or `FAIL` and the run exits 1 listing each failure**, so a red run is a measurement
rather than the first thing that broke. It prints, on the green path, the token's capability count and expiry,
how long the build took, how long the question waited for a human, and each retry's status — a green
`checks.ok` prints no detail, so the numbers a filed run is evidence for would otherwise be thrown away.

**THE ONE PRECONDITION, and why the script signs two more people in.** Step 6 has the agent ask to add
`col000001` — the IdP's `colleague`, a faculty member, because since FE-39 a student cannot be added — and
`POST /v1/projects/{id}/members` refuses `400 MEMBER_USER_NOT_FOUND` for anybody who has never signed in —
`pnpm test` and `make reset` both empty `users`. So `scripts/demo-token.sh` signs the colleague in, and the
student too (the refusal above needs a student who has signed in, or it is `400`), and throws both sessions away;
all it needs is the rows. Without them the **confirmed retry** answers `400`, which reads as a defect in D24's
grant rather than as a missing sign-in.

**What it leaves behind.** One `pending` question — the production promotion nobody answered — which is honest:
it is what Task 10's expiry sweeper exists for, and §26's queue shows it beside the run's `confirmed` and
`rejected` ones. A `FAIL no step threw — [cause UNABLE_TO_GET_ISSUER_CERT_LOCALLY] TypeError: fetch failed` is a
run without the platform CA; a demo that does not build stops at step 0 and prints `tsc`'s errors.

## `make demo-production` — P6a's acceptance: the first production launch

*Added by P6a sitting 11, 2026-09-22 (Task 19).*

An application reaches production with every one of §13's six blocking items honestly met,
through the edge, on its OWN project, `launch-app`. Needs `make up`, **`127.0.0.3` on `lo0`**
(`make host-setup` adds it; `make reset` does not remove it) and the control plane running, per *Running the control plane* above.

```bash
make demo-production        # ~3 minutes; three phases, each ending `every check passed`, exit 0
```

**The split.** `scripts/demo-production.sh` signs people in and — the new part — **steps them
up**, both through `infra/lib/idp-login.sh` (`/auth/step-up` is driven exactly as `/auth/login`
is). `packages/journey/src/production.ts` does everything Manifest's API does, importing nothing
but `@manifest/contract`, in three phases: **instructor** (create, build, release, staging, refused
production `403 STEP_UP_REQUIRED`, and the checklist's unmet ids), **admin** (both external records
along §9's steps with an illegal jump refused, the rehearsal, and the approval refused
`403 STEP_UP_REQUIRED`), and **launch** (a stepped-up owner refused `409
RELEASE_PRODUCTION_GATE_UNAVAILABLE` naming only `admin-approval`, the approval, the production
deploy, the app probed on BOTH addresses, and the checklist read again — now a LAUNCHED app's,
`ready`, with no `rehearsal` item and the launch release covered by its own approval). **Its step 10,
a rebuild after the launch, was removed by P6b Task 6 (2026-09-23)**: a launched app's rebuild now goes
to production self-serve, which is what P6b's acceptance, [`make demo-releases`](#make-demo-releases--p6bs-acceptance-what-a-launched-apps-next-release-does), proves.

**A step-up is a claim on the session cookie, and sessions are stateless** — so the cookie from
before the step-up is still an ordinary session afterwards. The script keeps both for each person;
that is how one run proves the refusal and the approval.

**What a green run prints that a wrong one would not**: the candidate digest; the unmet ids at step
3 and step 9; the rehearsal's evidence line; the approval's digest, `summarySource` and review
state; and the production instance id beside the `X-Manifest-Instance` each address answered with.
*(A rebuild's digest is IDENTICAL to the approved one on this machine — BuildKit pins layer
timestamps to the commit (`source-date-epoch`) — which step 10 printed until P6b removed it.)*

**A second run RE-USES `launch-app`**, because no route deletes a project — and since P6b Task 4 a
re-used `launch-app` has LAUNCHED, so step 1 checks what a launched project durably is (the records,
the approval of the release production serves, §12's split), prints `launch-app has launched — the
re-use path ends here`, and stops green in about four seconds: a launched app is never rehearsed.
After a `pnpm test` or a reset it is the fresh path again, with step 3's unmet set `[admin-approval,
iam-registration, privacy-assessment, rehearsal]`.

**A red phase stops the script** (`set -e`, like every demo), so a red rehearsal never reaches the
launch phase and its output is not there to read.

**It leaves `launch-app` in production, its launch release serving staging and production.** A
production app on this laptop points at UBC's real CWL and signs nobody in — do not read that as a failure.

## `make demo-releases` — P6b's acceptance: what a launched app's next release does

*Added by P6b sitting 7, 2026-09-23 (Task 11).*

§13 D9's second clause, through the edge, on `launch-app`. Needs what `make demo-production` needs —
`make up`, **`127.0.0.3` on `lo0`**, the control plane running per *Running the control plane* above — and a vulnerability
database younger than seven days (`make refresh-vulndb`, with the network on), because on a machine where `launch-app` has not
launched **it runs `make demo-production` first, and says so** (Decision 17), and that launch needs
§13's `scans` item met.

```bash
make demo-releases          # ~1.5 minutes re-used, ~3 fresh; each phase ends `every check passed`, exit 0
```

**Three legs, in this order** — A before B, although B is the headline, because B's *"nothing
sensitive changed"* is a claim about a baseline and only A guarantees one:

| Leg | The commit (bash) | What must happen |
|---|---|---|
| **A** | `manifest.yaml` rewritten from the starter: `sn` removed, `egress.allow: [<run id>.example.org]` | refused `409 RELEASE_REESCALATED` with EXACTLY the fields that changed since the last approved release; an administrator takes a **stored preview** (no step-up), is refused `403 STEP_UP_REQUIRED`, steps up, is refused `400 APPROVAL_PREVIEW_REQUIRED` naming none, re-reads the SAME preview, approves naming it — the record's diff deep-equals the preview's — and the owner deploys. Then, from production's app container through its egress proxy, **this run's host is let through and the previous run's is `403 Filtered`** (Task 5a), beside `manifest-verdaccio:4873` answering `200 OK`; and asking for the release production ran before A is `409 RELEASE_NOT_STAGED` |
| **B** | a comment in `server.js` — a new digest, nothing sensitive | the checklist `ready` with no sensitive field; the stepped-up owner deploys to production with **no administrator** (the release has no approval: `404`), while `scripts/lib/redeploy-loop.mjs` on the public listener sees only the app and the instance change once |
| **C** | `sn` back | the administrator records the registration `active` with the four (UBC registered the narrower set); the build FAILS naming `sn`; `[M9]`'s request — the change request written as what UBC *registered* — is `400 LAUNCH_RECORD_INVALID`; the proper change request is filed and the build STILL fails, saying one is on file; `submitted → active` with the five; the build succeeds, re-escalates on `auth.attributes` alone, is approved from a preview and deployed |

**Path-independent.** Every leg writes its manifest from the starter, so it is what it claims whatever an
earlier run left; the baseline every assertion compares with is **derived through the contract** — the
newest release whose latest decision is `approved` — never assumed to be what production serves; and
step 1's **RECOVERY** repairs the two things it honestly can when a run stopped part-way (the registration
recorded `active` for what the candidate asks, an approval from a preview) and **prints that it did, as
setup**. Anything else unmet stops the run red.

**Each leg steps up right before its stepped-up calls**: a step-up lasts ten minutes, and every leg builds
first. The script keeps a plain and a stepped cookie for each person, as `demo-production` does.

**What a green run prints that a wrong one would not**: the expected field list and the baseline it was
derived from; the preview's id, author, expiry, `summarySource` and summary; the approval naming the
preview; the three egress answers; the loop's counts and its instance sequence; both failed builds'
errors; and the registration after each record.

**The preview's summary may read `unavailable` offline** — Decision 7: the record carries the diff and a
security note per field without the model's words, and the approval goes ahead. **Since the D5 plan's sitting 7 it is
STRUCTURED OUTPUT**: the model is handed the diff's facts and fills a schema with one sentence per change and no place
for a verdict, so an online run reads `summarySource llm` and prints the sentences joined — or `withheld` with the rule
the answer broke, which the journey accepts WITH its reason. P6b sitting 7's invented *"administrator's verdict"* (F9)
cannot be expressed in that shape. **Since 2026-09-25 (F7, option (b)) a change to the CWL attributes gets NO model
sentence** — the model got removed attributes backwards and misnamed `sn` — so leg A prints one sentence (egress), and
leg C, whose only change is `sn`, reads **`summarySource not-modelled`**: no model was asked, by design (ORIENTATION §8,
*Decided*). The console shows every sentence under the deterministic change line, which is the record.

**A red phase stops the script** (`set -e`). **It leaves `launch-app` launched, on its leg C release in
staging and production, the registration `active` five-wide, two more approvals** (three on a fresh
machine, counting the launch), **and three more commits in its repository** — one per leg.

## `make demo-capacity` — A1's acceptance: a launched `class` app on two instances

*Added by A1 sitting 7, 2026-10-14 (Task 9).*

Production runs as many instances as its audience needs (§24: `class` 2), behind one edge route that balances across
them. This proves it through the edge, **on either driver**: on driver 1 against `launch-app` (it runs `make
demo-production` first when `launch-app` has not launched), on driver 2 — **the GitHub fake, through the `.env` swap,
because `require_fake_github` reads `.env` itself** — against `launchpath-github` (it runs `make demo-launch` first). It
needs what those need: `make up`, **`127.0.0.3` on `lo0`**, the control plane per *Running the control plane*, and a
vulnerability database younger than seven days.

```bash
make demo-capacity                             # ~12 min; each phase ends `every check passed`, exit 0
DEMO_CAPACITY_PHASES="1 5" make demo-capacity  # only these phases — 1 always runs: it builds the releases
```

| Phase | What must happen |
|---|---|
| **1** | production's two members both answer through the public listener, bare, within 8 requests; `GET /login` on each answers `302` to `authentication.ubc.ca`; three code-only commits through the authoring API (a good release, one that never becomes ready in production, one that crash-loops in production), each built and released, then `server.js` committed back as it was |
| **2** | a SAME-release and a NEW-release redeploy, each under a `/healthz` loop and a loop on the app's page (`Sign in with CWL`), classified by body AND header: no answer but the app's (≤ 1 reset, §11's reload), the SET changing exactly once, only the new pair after, the old pair retired (said by the stream), exactly two app containers and — `launch-app` declares models — two live LiteLLM keys |
| **3** | the never-ready release: the deploy answers `failed`, both loops see only the pair that was serving, an Incident (`cause: deploy`) names the member that failed, no container of it is left, still two keys |
| **4** | one member `docker kill`ed under the loops: no failure but a request in flight at the kill; `instance.exited` (`exited`, 137, attempt 1, at once) within the watcher's interval; a NEW pair healthy; an Incident (`cause: exit`) |
| **5** | the crash-looping release (it exits 15 s after its first health check, code 3): replacements at once, ≥ 60 s and ≥ 240 s after the exit before; the fourth exit `replacement: stopped`; nothing more started; the pair left `failed`; the `exit_stopped` Incident's prompt read. Then the owner's good release — two healthy members — and one killed is replaced AT ONCE, attempt 1: the count started again |
| **6** | **NOT RUN, and it says so**: a launched app signs people in with UBC's production IdP, so no sign-in completes on a laptop — nor phase 2's signed-in half. Held by `blueprints/node-ts-mongo.docker.test.ts` (a sign-in crossing two instances both ways, a replay refused) and the sessions in the app's own database. It shows every member sending its sign-in to UBC |

**Measured 2026-10-14** (sitting 7): **705–754 s** on driver 1 (fresh — `make demo-production` first — re-used, and from a `make
reset` machine), **710 s** re-used on the fake and **956 s** from a `make reset` machine there (`make demo-launch` first, a cold build
cache). The crash loop alone is ~7½ minutes; the never-ready deploy fails at the readiness timeout, ~91 s.

**The demo's own reads ask once more on §11's reset** — an edge reload, which any route change makes, closes the idle keep-alive
sockets, so an API read that reuses one fails `UND_ERR_SOCKET` (sitting 7, F6) — and say so in the output; **the witness loops never
retry**: each reset is its own class, at most one per loop, a second a failure.

**The failing releases fail only in production** (`MANIFEST_ENV`): production deploys only the release serving
staging (`RELEASE_NOT_STAGED`), so a release that never became ready on staging could never be asked of production.

**IT LEAVES ITS APP ON A SELF-SERVE RELEASE — so run no launch demo's RE-USE right after it** (A1 sitting 8): `make demo-launch`'s and `make
demo-production`'s re-use paths assert *"the release production serves was approved"*, and a code-only release has no approval — both
read `getApproval` `404` in seconds. `make reset` first, or run the launch demo before it; `make ci-acceptance` (step 12, last) never meets
it. The demo fix is placed with the driver-2 sensitive-diff race fix, before B (the roadmap's *Tracked defects*, `1fe7d7f`).
**It runs every phase and fails at the end**, naming each failed phase, and keeps its working directory (the loops'
`.ndjson`, the state file) when red. **It leaves** the app on its good release in staging and production, two
healthy members, four more commits in its repository (three releases and `server.js` back), and the crash loop's
Incidents in production's history.

## `make demo-github` — the D5 plan's acceptance: an application whose code is on GitHub

*Added by the D5 plan's sitting 8, 2026-09-25 (Task 15).*

D5's driver 2 end to end, through the edge, against the **GitHub fake**, offline, on `github-app`. **It
needs the control plane on DRIVER 2** — every other demo needs it on driver 1, and one process runs one
driver (the plan's Decision 3):

```bash
make github-up                            # `make demo-github` runs it too
export MANIFEST_SOURCE_DRIVER=github      # every MANIFEST_GITHUB_* default is the fake's
pnpm --filter @manifest/control-plane dev # the boot line says "source":"github"
make demo-github                          # ~70 s re-used, ~2 min fresh; each phase ends `every check passed`
```

and afterwards, **back to driver 1 before any other demo**:

```bash
unset MANIFEST_SOURCE_DRIVER
pnpm --filter @manifest/control-plane dev # "source":"local"
make github-down                          # the fake's repositories survive until `make reset`
```

**Step 0 asks which driver answers**, with an UNSIGNED delivery to `http://127.0.0.1:7100/webhooks/github`
(push-shaped, for a repository no project holds): `401 WEBHOOK_SIGNATURE_MISSING` is driver 2, and the
demo goes on; **`404 WEBHOOKS_NOT_CONFIGURED` is driver 1, and it stops, printing the restart commands and
CREATING NOTHING** — no route deletes a project (P6a F5), so a `github-app` made on driver 1 would block it
for ever.

| Step | What happens | What must be true |
|---|---|---|
| 1–3 | the instructor signs in; an orphan `github-app` is cleared (`clear_orphan_repository` — its mirror, and its repository ON THE FAKE, deleted as `faculty-dev` would, when no project holds the slug); `github-app` created from `proof-app`, or re-used | `repository` is exactly `{ provider: github, fullName: manifest-apps/github-app, webUrl: http://127.0.0.1:7110/manifest-apps/github-app, mainProtected: true, protectionDetail: null }`, and the fake, asked by a person, says `private: true` |
| 4 | `faculty-dev` clones from the fake and pushes a page change (the token in git's ENVIRONMENT, never a URL) | within 30 s `repository.pushed` for that commit on the stream; the project's newest validation is that commit; **no build started**; the fake's log shows ONE push delivery, answered `202` |
| 5 | build it; release; deploy to staging | a commit nobody has is first refused `409 SOURCE_COMMIT_NOT_FOUND`; the build `succeeded`; staging `healthy`; the app answers **as the new instance** with **the pushed page text** — the shape, not a `200` |
| 6 | `docker stop manifest-github-fake`; build the same commit; validate HEAD; build a commit nobody has; `docker start` | the build `succeeded` **to the same digest**, from the mirror (C1); HEAD `503 SOURCE_UNREACHABLE`; the unknown commit `503 SOURCE_UNREACHABLE` too — never `NOT_FOUND`, because GitHub cannot be asked (Decision 18); the fake back within 30 s |
| 7 | `faculty-dev` makes the repository PUBLIC | within 30 s the fake reads `private: true` again, and a new `repository.visibility_enforced { observed: public, result: private }` |
| 8 | `faculty-dev` pushes an AWS-key-shaped value and a stateless-format installation token, **made at run time** | ONE `repository.secret_detected` naming both files and both rules, **its JSON holding neither value**; that commit's build `failed` at `[secret]`, its reason quoting neither; then both files are removed |
| 9 | `faculty-dev` force-pushes a rewritten `main` | git refuses, `GH006: Protected branch update failed for refs/heads/main.` (the fake's `team` plan), and `main` is unchanged on the fake. **Were it accepted**, the phase asserts the mirror refused it: `repository.history_rewritten` naming what Manifest kept |
| 10 | SHA-1 only; malformed; a wrong signature; then the fake REDELIVERS step 4's delivery | `401 WEBHOOK_SIGNATURE_MISSING`, `…_MALFORMED`, `…_INVALID`, beside step 4's `202`; the redelivery answered **`200 {"duplicate":true}`** (the fake's log keeps the answer's body), and **still exactly one `repository.pushed`** for step 4's commit |

**A red phase after step 3 does not stop it**: each phase records itself and the run goes on, exiting 1 at
the end naming every phase that failed — so a negative control is seen at every step it reaches. Steps 0
and 3 stop it. **It leaves `github-app` in staging on this run's page, four more commits on the fake**
(the page, the two values, their removal — the values stay in GitHub's history, as they would on GitHub, and
the build gate refuses only a TREE that holds one), and the fake's delivery log in its volume.

**What it does not cover, by design** (the plan's Decision 17): a PRODUCTION launch on driver 2 — `releases/`,
`launch/` and `spec/` import nothing from `source/`, so it would re-prove P6a over another git host; and the
control plane's OWN commit carrying a secret, which nothing in the contract makes before the authoring API
(the source-driver contract suite holds it on both drivers).

## `make demo-authoring` — the authoring API's acceptance: an agent builds an app through the API

*Added by the authoring API plan's sitting 10, 2026-09-26 (Task 13).*

An **agent**, holding a delegated token, builds a course **bulletin board** from the bare `node-ts-mongo@1`
skeleton through nothing but the API (`packages/journey/src/authoring.ts`, over `@manifest/contract`), and
then people use it. **It runs on EITHER driver** — step 0 asks which answers and picks the project:
`board-local` on driver 1, `board-github` on driver 2, because a project's repository never moves between
drivers. Run it on driver 1, then restart on driver 2 and run it again:

```bash
make demo-authoring                       # driver 1: board-local — ~35 s, fresh or re-used
make github-up                            # then driver 2 — RUNBOOK's 'The control plane on driver 2'
export MANIFEST_SOURCE_DRIVER=github
pnpm --filter @manifest/control-plane dev # "source":"github"
make demo-authoring                       # driver 2: board-github — ~40 s
DEMO_AUTHORING_STOP_AFTER=5 make demo-authoring   # stop after a step — a negative control's short run
```

| Step | What happens | What must be true |
|---|---|---|
| 0 | which driver: an unsigned `POST /webhooks/github` (`source_driver`, `scripts/lib/api.sh`) | `404` → driver 1, `board-local`; `401` → driver 2, `board-github`; anything else stops it, creating nothing |
| 1 | the instructor signs in (bash); the project is created with **no starter** or re-used; a token minted with `project:read`, `source:write`, `secret:write`, `build:create`, `release:create`, `release:deploy` | `repository.provider` is the driver's; `visibility` `null` on driver 1, `private` on driver 2; exactly six capabilities |
| 2 | the agent reads `GET /v1/docs/agents`, the knowledge pack and the tree at `main` | the guide names `createCommit` and `baseCommit`; the pack points at the guide; the tree is the skeleton. **On the re-use path** the agent first starts the board again from the project's first commit — one commit — so every run makes the same change |
| 3 | a dry run of the board with `classification: secret` | `422 SPEC_INVALID`, its first problem at `data.classification`; `main` unmoved |
| 4 | the board committed: `manifest.yaml`, `server.js`, `public/index.html`, `public/app.js` and a `NOTES.md` | `201`, exactly those five changes; the sensitive diff names `auth.attributes` and `services`; no warning; `repository.committed` whose sentence names *"Test Instructor's agent (token '…')"*; `spec.validated` for it |
| 5 | six refusals beside step 4's commit: a stale base, an AWS-key-shaped value made at run time, `.git/config`, a file named `public`, a delete of `nope.txt`, the same content again | `SOURCE_CONFLICT`, `SOURCE_SECRET_DETECTED` (and a `repository.secret_refused` holding no value), `400 REQUEST_INVALID`, `SOURCE_PATH_CONFLICT`, `SOURCE_PATH_NOT_FOUND`, `SOURCE_NOTHING_TO_COMMIT` — **`main` still step 4's after all six** |
| 6 | a PERSON pushes `link → .git` (driver 1 into the bare repository, driver 2 to the fake); the agent commits `link/config` holding a `core.fsmonitor` that would create a canary file; then deletes `NOTES.md` | `409 SOURCE_PATH_CONFLICT`; **the canary never exists**; the deletion `201` |
| 7 | the history | step 4's and step 6's commits `madeThrough` the instructor's agent and the token; the person's push `null`; `getCommit` of step 4 has `server.js`'s patch |
| 8 | build **step 4's commit, not the newest**; release; deploy to staging before the secret is set | the build of step 4's commit `succeeded`; the release froze **step 4's** validation; `409 RELEASE_SECRET_NOT_SET` naming `BOARD_ADMIN_CODE`, and the environment's instance unchanged |
| 9 | the agent sets staging's `BOARD_ADMIN_CODE`; deploys again | `200`, `set: true`, no value in the answer; `healthy`; the app answers **as the new instance** with *Bulletin board*; `/api/status` `{"adminCodeConfigured":true}`; the value in no frame, build log or answer |
| 10 | the agent tries production's secret | `403 TOKEN_CREDENTIAL_REFUSED` (§20, Spec action 2) |
| 11 | a student signs in to the BOARD and posts a question; the instructor signs in and replies; the instructor pins it with the code the agent set | the pin with a wrong code `403` and with the code `200`; `GET /api/posts` shows the question by *Test Student*, pinned, with *Test Instructor*'s reply |

**It stops at the first red phase** (each phase prints every check first): a later step needs the earlier
one's state. **It leaves the board running in staging** with the question, one token minted per run (a day's
expiry), and the repository a few commits longer. **What it does not cover:** the console's Code and Secrets
screens, the Docs screen and `/reference.html` — the clicked half (WALKTHROUGH) — and production, which a
token cannot reach by design.

## Running the front-end demo — `make demo-frontend`, the front-end enablement plan's acceptance

*Added by the front-end enablement plan's sitting 12, 2026-09-29 (Task 15).*

Everything the faculty front-end at **`https://app.manifest.internal`** needs from the platform, driven end to end through
THAT origin: `https://app.manifest.internal/v1/*` and `/auth/*`, which the edge forwards to the control plane on 7100. It
needs nothing on 7105 — that is the faculty front-end's own server, a separate project. **Two credentials, and which one
acts is the point**: the INSTRUCTOR acts in their own session (on the real front-end that is browser code — the page's own
client, which carries no credential because the browser sends the cookie; the demo passes the cookie's value only because
it has no browser), and the FRONT-END'S SERVER acts on the delegated token the instructor mints for it, and on the model
key it starts a session for. The bash half (`scripts/demo-frontend.sh`) does the sign-ins, the step-ups, the edge's
answers and the app's own pages; the TypeScript half (`packages/journey/src/frontend.ts`) is every client call, through
`@manifest/contract` alone. **It runs on EITHER driver**, as `make demo-authoring` does: step 0 asks which answers and picks
`frontend-local` and `frontend-scratch-local` on driver 1, `frontend-github` and `frontend-scratch-github` on driver 2.

```bash
make demo-frontend                          # driver 1: frontend-local
make github-up                              # then driver 2 — 'The control plane on driver 2'
export MANIFEST_SOURCE_DRIVER=github
pnpm --filter @manifest/control-plane dev   # "source":"github"
make demo-frontend                          # driver 2: frontend-github
DEMO_FRONTEND_STOP_AFTER=4 make demo-frontend   # stop after a step, 0 to 10 — a negative control's short run
```

**Measured on driver 1, 2026-09-29, with `bash scripts/demo-frontend.sh`** — the script the target runs, called directly
because `make`'s `up` was not to be touched while a person clicked on the same machine: **258 s fresh, 136 s and 142 s
re-used**. The fresh run's build is most of the difference (the re-used build hits the cache).

**The app is `confidential`** (`fixtures/frontend-app/manifest.yaml`: it keeps students' names), which decides three things
the demo meets (the plan's `[S11a]`): its manifest is committed BEFORE the model session starts, because a commit raising
the classification ends every session started before it (`models_withdrawn`); the session holds **no `default-chat`**, so
the demo reads the model from `session.models` and calls **`default-chat-onprem` — `qwen3.8:27b`**, which bash warms first
straight at Ollama (~12–14 s cold; it evicts `qwen3.5:4b`, so the next demo that calls `default-chat` reloads it, ~3 s); and
a token is refused staging's Incidents. **It never calls `default-chat-large`** (it needs the network); it prints whether
`session.models` lists it.

| Step | What happens | What must be true |
|---|---|---|
| 0 | `GET https://app.manifest.internal/v1/me`; which driver | `401` with `UNAUTHENTICATED` — **and never the edge's wildcard** (`manifest OK host=…` means dnsmasq's `app.` pin is missing) |
| 1 | the instructor signs in ON `app` (`idp_login … /auth/login`, the ACS `https://app.manifest.internal/auth/saml/callback`) | the jar's `__Host-manifest_session` is `app.manifest.internal`'s alone; **the control**: `createProject` with that cookie and `Origin: https://console.manifest.internal` → `403 CSRF_ORIGIN_REFUSED`, and the project list unchanged; both slugs' orphan repositories cleared |
| 2 | the instructor, in the session: an intake key started and ended; `frontend-<driver>` created as *"Week 3 — reading responses"* and renamed *"Reading responses"*; `frontend-scratch-<driver>` (`fixture-node@1`) created; the server's token minted | the gateway lists the intake model for the key, then answers it `401 token_not_found_in_db`; `project.renamed` on the stream, `from`/`to` and `via: session`; the token holds exactly `project:read`, `source:write`, `secret:write`, `build:create`, `release:create`, `release:deploy`, `output:read`, `agent:session`, for a day |
| 3 | the server, on the token: the confidential `manifest.yaml`; `getAgentBudget`; `startAgentSession`; one real completion through `baseUrl` | the commit's sensitive diff names `data.classification`; the budget is the minter's; `201`, an `sk-` key, `via` the token; **no `default-chat`, and `default-chat-onprem`**; the same `Idempotency-Key` again → `409 AGENT_SESSION_ALREADY_STARTED` with no `sk-` in the body; the completion `200` with an answer; `listAgentSessions` active, and its `spentUsd` above zero within 45 s |
| 4 | the agent commits `server.js` as text and `logo.png` — a 1×1 PNG the demo MAKES — as bytes: a dry run, then the commit | the dry run no commit, `logo.png added, server.js modified`, `main` unmoved; then `201` with the same two; `server.js` as base64 → `400 REQUEST_INVALID` saying it *is text; send it with encoding: 'utf8'*; an ELF header as `logo2.png` → `400 REQUEST_INVALID` saying it *is not a kind the API writes* (each rule's own words, because all three binary rules answer the same code); **a PDF with an AWS-key-shaped value made at run time** → `409 SOURCE_SECRET_DETECTED` naming `syllabus.pdf:` and never the value, and `repository.secret_refused` naming it; `main` still the app's commit; `getTree` marks `logo.png` binary; `getFile?encoding=base64` the same bytes |
| 5 | the server builds that commit, releases it, deploys it to **staging and the sandbox**; the STUDENT signs in inside the staging app and posts a response | the release froze `confidential`; both `healthy`; the app's `/api/me` is *Test Student* (**F1's guard**: without `express.urlencoded` nobody signs in); the post `303` to `/`; the page lists it under *Test Student*; `/logo.png` the committed bytes as `image/png` |
| 6 | bash requests the SANDBOX page with the run's id; the server reads that instance's output | `listInstances` names step 5's sandbox instance as serving; `getInstanceOutput` holds the marker line for this run's request, with **`[REDACTED]` in its `mongo` field, where the app printed its own `MONGODB_URI`**, and no line holding the password; **staging's output is `403 INSTANCE_OUTPUT_STAGING`** (recent output is the sandbox's, FE-24); production's refusal is the unit tier's; the token's staging `listIncidents` → `403 INCIDENT_LOG_CONFIDENTIAL`, its sandbox's and the person's staging `200` |
| 7 | the instructor steps up ON `app`; the student and `colleague` (faculty) sign in to MANIFEST on `app` (so the platform knows the logins); the student's `createProject`; `addMember { cwlLogin: 'student' }`, then `{ cwlLogin: 'colleague' }` | `getMe`: the student `mayBuild: false`, the colleague `true`; the student's create `403 BUILDING_NOT_OPEN`; without the step-up `403 STEP_UP_REQUIRED`; stepped up, the student `409 MEMBER_MAY_NOT_BUILD` naming them, the colleague `201`, `cwlLogin: colleague`, a collaborator; ONE `member.added`, `memberId` the colleague and `userId` the instructor; `nobody` → `400 MEMBER_USER_NOT_FOUND` |
| 8 | archive (stepped up); then restore, a NEW token for the server, the same release deployed again, and a new model session | the key answered before (`200`, listing the session's model), then `401 token_not_found_in_db`; the token `401 UNAUTHENTICATED`; the instructor's `startBuild` `409 PROJECT_ARCHIVED`; step 3's session `ended`, `project_archived`; **both names `410`** with *This app has been switched off by its owner.*; after the restore the old token stays `401`, the redeploy is `healthy`, and **the page shows the response the student posted before the archive** |
| 9 | the scratch project is built, deployed to its sandbox, then deleted (stepped up); then a NEW project is created with its slug | its repository THERE before the delete (driver 1: `.manifest/repos/<slug>.git`; driver 2: the fake's `200` naming it, and the mirror) — so "gone" afterwards is a change seen, not an empty path; its sandbox name answered *fixture-app in sandbox*, and afterwards the edge's wildcard; `checkSlug` available; `getProject` `404 NOT_FOUND`; its repository gone (driver 1: no directory; driver 2: the fake's `404` *Not Found*, and no mirror); **then `createProject` with the same slug `201`, a new id** — the only check that meets the partial unique index (`checkSlug` reads its own copy of the predicate) — and its repository there again. **When `launch-app` has launched** (`make demo-production`), `deleteProject` on it → `409 PROJECT_LAUNCHED_NOT_DELETABLE`, still `active` — the one call to a project the demo did not create, and read-only; otherwise it says why it did not ask. **That branch has never run on this machine**: on 2026-09-29 `launch-app` did not exist here (the tables had been truncated), so all three runs printed that it was not asked |
| 10 | the server ends its session; the instructor revokes its token | `ended`/`ended`; the key `401 token_not_found_in_db`; the token `401 UNAUTHENTICATED`; `listAgentSessions` holds the session just ended, as `ended`, and no session of the project is active |

**It stops at the first red phase** (each phase prints every check first). **The re-use path** starts the app again from the
project's first commit — one commit — so every run commits the same two changes, removes and re-adds the colleague, and renames
the project back first; its step 2 finds the scratch project the last run's step 9 created again, and its step 9 deletes it.
**A green, FULL run leaves** `frontend-<driver>` running in staging with the student's responses (its sandbox switched off
until the next deploy — the restore redeploys staging only), the colleague a collaborator, and no session or token of its own
live; a new `frontend-scratch-<driver>`, never deployed, beside the deleted one's tombstone; and a `mf-person-` user at
LiteLLM, which `scripts/litellm-orphans.sh` reclaims. **A `DEMO_FRONTEND_STOP_AFTER` run, or a red one, leaves more live**:
step 3's model session (its key, for up to its 60 minutes) and step 2's token (for its day) — and after step 8, the second
token and session. The next FULL run's archive ends every session and revokes every token of the project, and its step 10
ends and revokes its own. **What it does not cover:** production (a token cannot reach it by
design, and nothing here launches), the capable model, and the CLICKED half — the reference console served on `app`
(*Serving the reference console on the front-end's origin*, above) and a person clicking the same journey.

## `make demo-launch` — the launch path plan's acceptance: a faculty member launches an app themselves

*Added by the launch path plan's sitting 12, 2026-10-02 (Task 15).*

A faculty member takes an app to production THEMSELVES, through the edge: the three records UBC asks for drafted by Manifest
from the app's own code and certificates, read, and sent **in UBC's order**; an administrator's sign-off asked for and given;
the launch. Then what a launched app's people, credentials and models do. The bash half (`scripts/demo-launch.sh`) signs
people in and steps them up; the TypeScript half (`packages/journey/src/launch.ts`) is every client call, through
`@manifest/contract` alone. **It runs on EITHER driver**: `launchpath-local` on driver 1, `launchpath-github` on driver 2 —
**the GitHub FAKE**: with `.env`'s real-App block in force the demo refuses by name (`require_fake_github`, which reads `.env`,
so the block is commented out for the fake's run and the control plane restarted, as its refusal says).

```bash
make demo-launch                                   # whichever driver answers
DEMO_LAUNCH_STOP_AFTER=4 make demo-launch          # stop after a step, 0 to 11
DEMO_LAUNCH_SLUG=launchpath-control DEMO_LAUNCH_STOP_AFTER=2 make demo-launch
                                                   # a negative control of steps 1–8, on a project of its own
DEMO_LAUNCH_REAL=1 DEMO_LAUNCH_STOP_AFTER=3 make demo-launch
                                                   # the REAL App, steps 0–3, then deleted — Rich's yes, the network on
```

**Measured 2026-10-02** (sitting 12, on `94dc0d0`'s tree): driver 1 **260 s fresh** (on a `make reset` machine, a cold build
cache) and **154 s re-used**; driver 2 on the fake **201–253 s fresh** and **138–149 s re-used**; the real leg **133 s**.
**Measured again 2026-10-08** (the FE-46/47/5 plan's sitting 5, on `3565b10` and `154f220`, with the team's step and the change leg):
**~3 min 30 s fresh** on either driver (3 min 50 s from a `make reset` machine, a cold build cache) and **~3 min 05 s re-used**, 8b included.

**The app** is `fixtures/launch-path-app/`: an office-hours booking app on `node-ts-mongo@1` that reads `ubcEduCwlPuid`,
`givenName` and `mail`, and asks for `sn` WITHOUT reading it — so the package flags `sn` unread and warns before it is sent.
It is `internal` until step 11 raises it.

| Step | What happens | What must be true |
|---|---|---|
| 0 | the build; `/v1/me`; the driver; `127.0.0.3` | `401 UNAUTHENTICATED` through the edge; on driver 2 the fake answers (or, with `DEMO_LAUNCH_REAL=1`, the real App) |
| 1 | the project from the bare skeleton; the app committed, built, released; deployed to sandbox and staging | staging's `sso.registered` caught on the stream with its certificate fingerprint and staging's entity id; staging answers `/healthz` **as the app** (`"mongo":true`, `X-Manifest-Instance` the deploy's instance) |
| 2 | the owner drafts the assessment, then staging's and production's registrations, and reads them; a build after the drafts | the assessment's six questions in the Privacy Office's order, with gaps; each package names ITS environment's entity id, ACS and SLO, lists the four attributes, flags `sn` alone unread with its warning, justifies `mail` by `server.js:<line>`, says the PIA number is not recorded, and carries a certificate — **staging's the one `sso.registered` published**, each environment its own — and **no `PRIVATE KEY` anywhere**; the checklist's three items in their draft words; **the build succeeds** (a draft registers nothing) |
| 3 | an agent on a token (`project:read`, `launch:draft`, `approval:request`) drafts the assessment again, tries to send it to the Manifest team, asks for sign-off with a note | `200` and a newer draft; **`403 TOKEN_CREDENTIAL_REFUSED`**, still a draft; `requestApproval` **`200`**, open; `admin-approval` reads *An agent on Test Instructor’s token asked an administrator to approve it on <today>*; the note nowhere in the checklist |
| 4 | the owner sends the assessment to the Manifest team — first naming the draft they read before the agent's, then leaving a gap unanswered, then every gap answered (one carrying the run's marker) | `409 LAUNCH_DRAFT_CHANGED`; `400 LAUNCH_GAP_ANSWERS_INVALID`; then `sent`, by the instructor, its answers kept in the draft's order; both registrations' sends **`409 LAUNCH_PIA_NOT_APPROVED`** |
| 5 | the team hands the assessment back; the owner sends it again; the team's submission recorded with its PIA number; the queue; approved | the owner `403 FORBIDDEN` on the queue and on the team's submission; back to `draft`, the first send kept as history; the second send's answers replace the first's; before the team's submission the queue's **`privacy-assessment-to-submit`**, `since` the SECOND send, naming the instructor; after it, the whole queue oldest first; this app's two items (the assessment with the Privacy Office — still naming the instructor, who sent it — and the sign-off request with its note); *It was sent to the UBC Privacy Office on <today>.* with `since` the team's day; the assessment leaves the queue |
| 6 | staging's send from the old draft; drafted again, sent and submitted by the team; production's send early; staging recorded active; production drafted again, sent, submitted by the team, recorded active; the team's emails | `409 LAUNCH_DRAFT_STALE`; the PIA number in both packages; each record `sent` from its draft before the team's submission, the queue's **`iam-registration-to-submit`** since the send (production's checklist: *It was sent to the Manifest team on <today>, to submit to UBC IAM.*); **`409 LAUNCH_STAGING_NOT_REGISTERED`**; each registration waits in the queue and leaves it; *It was sent to UBC IAM on <today>.*; both records met; **five emails to the team in Mailpit** — the assessment twice, each registration, the sign-off request — none carrying an answer, a gap's words or the note, deleted by id |
| 7 | stepped up: the rehearsal, a preview, the approval | the rehearsal passed on the public listener, releasing exactly the four; approved, bound to the digest, as previewed; the request leaves the queue; ready |
| 8 | stepped up: the owner deploys to production | healthy; `127.0.0.3` answers as the instance; `127.0.0.2` does not; launched |
| 8b | **the RE-USE path only** — a change to the live production registration: reset from wherever a run left it (a change with the team handed back; the registration walked back to the launched four; a manifest asking for more committed back); the manifest asks for `eduPersonAffiliation`; production's registration drafted again and sent; handed back once and sent again; filed by the team; UBC's answer recorded | the build refused naming *"Ask for the change from Manifest … send it to the Manifest team"*; the draft from the NEWEST valid manifest, with its warning, what UBC registered kept; `sent` from `active`, asking for the five; the queue's **`iam-change-to-file`**, then **`iam-change-request`**; the release serving production **met throughout**, saying *"A change is with the Manifest team since …"*; the build still refused, naming the change request on file; recorded `active` with it, nothing requested, the build green; the team emailed twice, *"a change to the production IAM registration"*, deleted by id |
| 9 | a token's stream, then the token revoked; the colleague added, minting a token, with a session stream and a token stream — then removed | **`4401`** within two seconds, and a new stream refused; the colleague's session stream **`4404`** and token stream **`4401`**, their token `401 UNAUTHENTICATED`, the project `404` to them |
| 10 | in SANDBOX: the launched release, then a release whose health check never answers | `failed` after ~90 s; every instance carries `createdAt`; **the failed attempt's `createdAt` is when its deploy was asked for** (not ~90 s later, when it was last seen), and newer than the serving one's |
| 11 | an agent session started (`default-chat` warmed first); the app raised to `confidential` by a commit | `default-chat` answers, then **`403 key_model_access_denied`** through the SAME key; the session still open, keeping `default-chat-onprem`, which answers; the manifest committed back to `internal` |

**A launched project re-runs 8b and steps 9–11**, after checking what its launch durably is (the three records, production serving
an approved release on `127.0.0.3`, nothing of it in the queue) — so the change leg needs a SECOND run on each driver; **a project an earlier run left unlaunched is deleted and
made again**, so steps 1–8 always run whole. **A green FULL run leaves** the app in production, sandbox and staging, the
manifest `internal`, and a `mf-person-` user at LiteLLM (`scripts/litellm-orphans.sh`). **A control run with
`DEMO_LAUNCH_SLUG`** leaves that project unlaunched — the next run with the name deletes it. **A green re-use run leaves** production's
registration `active` with the five, which the next run's 8b walks back first. **What it does not cover:** the
CLICKED half (WALKTHROUGH, *A launch's three records and the administrators' queue, clicked*), `default-chat-large` (it needs
the network), and the console's screens for the team's step and a change (the FE-46/47/5 plan's sittings 3 and 4 walked them
headless; Rich clicked them on 2026-10-09, its sitting 5).

## `make demo-faculty-ready` — the faculty-ready plan's acceptance: what stood before a faculty member's first day

*Added by the faculty-ready plan's sitting 7, 2026-10-03 (Task 11).*

What stood between the platform and a real faculty member's first day, each seen through the edge. The bash half
(`scripts/demo-faculty-ready.sh`) signs people in, steps them up, reads the cookie jars, asks the app's container for its PID 1
and walks an app's sign-out; the TypeScript half (`packages/journey/src/faculty-ready.ts`) is every client call, through
`@manifest/contract` alone. **It runs on EITHER driver**: `facultyready-local` on driver 1, `facultyready-github` on driver 2 —
**the GitHub FAKE**, refused by name while `.env`'s real-App block is in force (`require_fake_github` reads `.env`), as
`make demo-launch` is. **Nothing in it launches**, so it needs no fresh vulnerability database, and a project an earlier run left
is deleted and made again: every step runs whole every time.

```bash
make demo-faculty-ready                                  # whichever driver answers
DEMO_FACULTY_READY_STOP_AFTER=3 make demo-faculty-ready  # stop after a step, 0 to 8 — a negative control's short run
DEMO_FACULTY_READY_CP_LOG=<file> make demo-faculty-ready # the control plane's output, when it is not on 7100's stderr
```

**Measured 2026-10-03** (sitting 7, on `68fb971`): **~45 s** on either driver, fresh, re-used, or from a `make reset` machine
(the app's image layers come from the build cache).

**The app** is `make demo-launch`'s, `fixtures/launch-path-app/` — a CWL sign-in and §8's single logout at `/auth/logout`.
**Step 2 reads the control plane's own output**: the file 7100's stderr is written to (found with `lsof`), or
`DEMO_FACULTY_READY_CP_LOG`; when there is none — a control plane started in a terminal — it says so and checks the rest.

| Step | What happens | What must be true |
|---|---|---|
| 0 | the build; `/v1/me`; the driver; the control plane's output found | `401 UNAUTHENTICATED` through the edge; on driver 2 the fake answers |
| 1 | the instructor signs in on `console.` and on `app.`; the operator (granted) and a colleague sign in; a plain `manifest_session` carrying the OPERATOR's session is tossed with `Domain=manifest.internal` | each jar holds `__Host-manifest_session` **HttpOnly, host-only, `Path=/`, Secure** and no plain name; `/v1/me` answers the instructor on each origin; with the tossed cookie beside it (curl's trace shows it sent) it still answers the instructor; the tossed cookie ALONE is **`401 UNAUTHENTICATED`** |
| 2 | an unknown blueprint asked for | **`404 NOT_FOUND`**; `x-request-id` a UUID **equal to `error.requestId`**; a success carries an id of its own; the control plane's output holds **exactly one** line with that id — `msg: refused`, the code, the status, no credential |
| 3 | the blueprints listed; `fixture-node@1` asked for | the list offers `node-ts-mongo@1` and **not** `fixture-node@1`; `getBlueprint(fixture-node@1)` still answers it |
| 4 | the project from the bare skeleton; a model session started, then started again with the SAME Idempotency-Key; ended | **`409 AGENT_SESSION_ALREADY_STARTED`** with `error.session.id` the first session's, and no key in the refusal |
| 5 | the app committed, built, released, deployed to staging by its owner | healthy; the stream's `instance.healthy` names the owner, `asAdministrator: false`, no reason; staging answers `/healthz` **as the app**; **the container's PID 1 is `docker-init`**, and `node server.js` runs as its child |
| 6 | stepped up: the operator (an administrator, NOT a member) deploys staging, without and with a reason; the owner adds the operator as a COLLABORATOR; the operator renames the project, then adds the colleague — without a reason, with one but un-stepped, then with both | **`400 ADMIN_REASON_REQUIRED`**, then healthy — the owner's LIVE stream names *Test Operator*, `asAdministrator: true`, the reason as typed (it is not plain ASCII: sent percent-encoded) and the sentence *"… acted as a platform administrator — reason: '…'"*; the rename asked nothing, recorded `asAdministrator: false`; the addition **`400 ADMIN_REASON_REQUIRED`** saying *beyond your role*, then **`403 STEP_UP_REQUIRED`**, then **`201`** with `member.added`'s actor `asAdministrator: true` and that reason |
| 7 | stepped up: a token asks to add a person; its minter revokes it; the instructor confirms; the colleague removed, twice | **`403 TOKEN_ACTION_PENDING`**; the question **`expired`**; the confirm **`409 PENDING_ACTION_RESOLVED`**; exactly ONE `pending_action.expired`, `cause: token_revoked`, `by` the instructor; the removal **`200`** both times; exactly ONE `member.removed`, live and in the replay |
| 8 | a student signs in to the app and out (`/auth/logout`, every redirect walked) | the app greets them; **the app's LogoutResponse to the IdP decodes `status:Success`** — read from the walk's own hops AND from the IdP's access log since the sign-in; the app has forgotten them |

**What it does not cover:** the CLICKED half (a person seeing the cookie, a refusal's reference and the reason panel —
WALKTHROUGH); production; a model call. **Its eight negative controls**, one per step, each red where predicted, are in the plan's
*Sitting 7*. **A green run leaves** the project on staging, a `mf-person-` user at LiteLLM and the operator an administrator.

## `make demo-gateway` — the UBC AI Gateway plan's acceptance: models answered by UBC's AI Gateway, charged exactly

*Added by the UBC AI Gateway plan's sitting 3, 2026-10-03 (Task 6).*

The capable model and the gateway's own models (`MANIFEST_GATEWAY_MODELS`) ANSWERED BY UBC'S AI GATEWAY through an agent's key, each
call charged to the person who asked, and the gateway's key nowhere but LiteLLM's environment. The bash half
(`scripts/demo-gateway.sh`) reads LiteLLM's catalogue with its master key, the gateway's own spend for its key, and counts the key
in every log; the TypeScript half (`packages/journey/src/gateway.ts`) is every client call, through `@manifest/contract` and an
agent's key alone. **It needs the network and the key** (*Through UBC's AI Gateway*, above), so it is in no offline or CI step; on a
control plane whose catalogue does not put `default-chat-large` at the gateway it prints **`NOT RUN`** and exits `2`. **Driver 1 or
the GitHub fake, never real GitHub**: it makes two projects (`gateway-int-<driver>`, `gateway-conf-<driver>`), and on real GitHub each
would be a real repository. **Every call is on the gateway key's budget** — one run makes five calls through Manifest's LiteLLM and a
few `$0` reads of the gateway's spend, a fraction of a cent in all.

```bash
make demo-gateway                                   # the network on, the key in .env
DEMO_GATEWAY_STOP_AFTER=2 make demo-gateway         # stop after a step, 0 to 6
MANIFEST_ENV_FILE=<copy of .env> make demo-gateway  # read a scratch copy of .env instead (a control's)
bash scripts/gateway-controls.sh all local          # the five negative controls, restoring 7100 from .env after
```

| Step | What happens | What must be true |
|---|---|---|
| 0 | the build; `/v1/me`; the driver; LiteLLM's `/model/info`; the key; its expiry; the gateway's own spend for its key | `default-chat-large`'s `api_base` is the gateway's address (else `NOT RUN`, exit `2`); `make verify`'s fingerprint check reads **`matches`**; `make doctor`'s expiry check passes (a date, not past, not within 14 days — that it is the RIGHT date is a person's, by the gateway's admin UI: the key cannot read its own `/key/info`); the spend read from a `$0` direct call's `x-litellm-key-spend` |
| 1 | the catalogue | `default-chat-large` and each `MANIFEST_GATEWAY_MODELS` name: ONE deployment each, `openai/<model>` at the gateway's address, its classification, **no `api_key` listed**, timeout 60 s, 0 retries, priced above `$0`; each gateway id `manifest-gateway-…` and none the setting does not name; `default-chat` and `default-chat-onprem` on the laptop's Ollama |
| 2 | an `internal` project's agent session: `default-chat-large` asked plainly, streamed, and malformed (`max_tokens: -1`) | the session holds `default-chat-large` and the gateway's models; each answer **`x-litellm-attempted-fallbacks: 0`**, `x-litellm-model-api-base` the gateway, a body `model` that is not the on-premise one; the plain answer's cost = its `x-litellm-response-cost` = usage × the listed price (12 places); the stream ends `[DONE]` with content; the malformed request is the provider's **`400`**, no fallback; the session's spend is EXACTLY the answers' cost |
| 4 | a `confidential` project's agent session: the gateway's confidential model | the session holds it and `default-chat-large`, and NOT `default-chat`; `200` from the gateway; the model pinned at `default-chat-onprem`'s price, and the spend EXACTLY usage × it |
| 2 (cont.) | the gateway's own spend, read again (polled up to 120 s) | it rose by what Manifest charged for the calls the gateway prices — the ratio 1 to a millionth; **Manifest charging LESS fails** |
| 5 | the key counted, never printed | its value and its `sk-...<last 4>` fragment **0 times** in `docker logs manifest-litellm`, the control plane's log (7100's stderr file), the run's own output and LiteLLM's database; every gateway row's stored `api_key`, DECRYPTED inside `manifest-litellm` with LiteLLM's own helper, **`equals the reference`** |
| 6 | both sessions | ended |

(Step 3, the Responses API with a tool, is not run: the plan's Task 5 was dropped — the capable model takes a tool on chat completions.)

**`scripts/gateway-controls.sh`** restarts 7100 on one driver (`local` by default) with ONE setting changed, runs the demo, says
whether it went red where predicted, and restores 7100 from `.env` by a trap on any exit: **(a)** the gateway's address black-holed
(`http://127.0.0.1:9/v1`) — the on-premise fallback answers and step 2 goes red; **(b)** the control plane's key empty — the
fail-closed boot, nothing at the gateway, `NOT RUN`; **(b2)** a DIRECT capable model first, then (b) — the direct one is kept;
**(d)** `MANIFEST_GATEWAY_MODELS` empty — step 1 red; **(e)** the expiry moved in a scratch copy — yesterday fails step 0 and makes
`make doctor` warn; a day later than the real date PASSES (no machine can tell). `start [driver]` restarts 7100 from `.env` alone.

**A green run leaves** the two projects (re-used next time), a `mf-person-` user at LiteLLM holding two ended sessions' keys, and the
key's spend a fraction of a cent higher.

## `make demo-levels` — the U1 plan's acceptance: Manifest's data classes as UBC's U1 levels

*Added by the U1 plan's sitting 3, 2026-10-04 (Task 7).*

Manifest's data classes ARE UBC's four U1 levels (Information Security Standard U1) — `low | medium | high | very-high` — and its
three earlier names are aliases with one meaning each (`public` = `low`, `internal` = `medium`, `confidential` = `very-high`). The
bash half (`scripts/demo-levels.sh`) signs the instructor in, steps them up to delete an earlier run's projects, and reads the
capable model's level ONCE — its `default-chat-large` row in LiteLLM's `/model/info` (the master key, as `make demo-gateway` reads
it) and `.env`'s `MANIFEST_CAPABLE_MODEL_CLASSIFICATION` (`medium` unset), each through the seven-name map; the TypeScript half
(`packages/journey/src/levels.ts`) is every client call, through `@manifest/contract` alone. **It runs on EITHER driver**:
`levels-local` and `levels-vh-local` on driver 1, `levels-github` and `levels-vh-github` on driver 2 — **the GitHub FAKE**, refused
by name while `.env`'s real-App block is in force, as `make demo-faculty-ready` is. **Offline**: nothing launches and no model is
called (it reads the catalogue); a project an earlier run left is deleted and made again. **Every half that needs the capable model
at `high`** — step 2's two capable dry runs, step 3's models, step 4's high-project half, step 6's zero-retention line — **prints
`NOT RUN`** when it is not listed there (offline, or `MANIFEST_CAPABLE_MODEL` unset); a half not run is not a pass.

```bash
make demo-levels                                # whichever driver answers
DEMO_LEVELS_STOP_AFTER=3 make demo-levels       # stop after a step, 0 to 6 — a negative control's short run
MANIFEST_ENV_FILE=<copy of .env> make demo-levels   # read the capable model's setting from a copy of .env
bash scripts/levels-controls.sh all local       # its eleven negative controls, restoring the source and 7100 after
LEVELS_CONTROLS_DRY=1 bash scripts/levels-controls.sh all   # each control's edit applied and shown, restored — no restart
```

**Measured 2026-10-04** (sitting 3, on `a2e3fc7`): **~9–16 s** on either driver — driver 1 fresh 9 s and re-used, the fake ~12 s fresh and re-used, and from a `make reset` machine 11 s (driver 1) and 16 s (the fake).

| Step | What happens | What must be true |
|---|---|---|
| 0 | the build; `/v1/me`; the driver; LiteLLM's `default-chat-large` row and `.env`'s setting; sign-in; the two projects from `node-ts-mongo@1` | `401 UNAUTHENTICATED` through the edge; on driver 2 the fake answers; each project's repository on the driver asked; the high project's staging and sandbox |
| 1 | a DRY-RUN commit of `high` with `[default-chat]` | **`422 SPEC_INVALID`**, a detail at `ai.models.0` coded **`SPEC_MODEL_CLASSIFICATION_TOO_LOW`**, its hint *"approved for medium data at most"* and *"(Information Security Standard U1)"*, and NOT *"BC public body"* (E14: a level states no law); the capable model's row level **equal to** `.env`'s setting |
| 2 | dry runs at `confidential` | `[default-chat-onprem]` valid; `[default-chat]` refused, its message naming **`very-high`**; with the capable model at `high`, `[default-chat-large]` refused too — and `high` with `[default-chat-large]` valid, its positive control |
| 3 | commits: `internal`, then `medium`, then `high` with `[default-chat-large, default-chat-onprem]` (the spec's own S7 example) | `getSpec` answers **`medium`** for `internal`; the `medium` commit's `sensitiveDiff.fields` does **NOT** list `data.classification` (a rename is not a change); `high` is valid, `getSpec` answers **`high`**, and its diff **DOES** list it |
| 4 | an agent session on each project — the `high` one, and `levels-vh-…` committed `very-high` with `[default-chat-onprem]` | both hold `default-chat-onprem` and NOT `default-chat`; the high project holds `default-chat-large` **by rank** (D17); the very-high one **only by the builder exception** (S4/S10, `MANIFEST_AGENT_BUILDER_MODELS=capable`, the default); each ended |
| 5 | a delegated token with `project:read` lists Incidents | staging **`403 INCIDENT_LOG_CONFIDENTIAL`** (S9: at `high` and above, whatever the builder setting); the sandbox `200`; the person's own session on staging `200`; the token revoked |
| 6 | `draftPrivacyAssessment` on the high project | the *flows* section's *Classification* reads **"High — every AI model the app uses must be approved for high data."**; `default-chat-onprem`'s line, the on-premise sentence; `default-chat-large`'s, **the zero-retention sentence** — what the Privacy Office reads (Task 7's person's half reads it in the console's Records) |

**What it does not cover:** a running app's key narrowed when a level is LOWERED (S11) — that is `boot.docker.test.ts`'s, through
the booted `dist/index.js`, because a demo would have to lower a model's level and restart mid-run (the plan's *What this plan does
not build*); a model call; production.

**`scripts/levels-controls.sh`** edits ONE thing in the control plane's source (or sets one setting), restarts 7100 on that tree,
runs the demo and compares its `FAIL` lines with the prediction — exactly those, no others — and puts the source back with `git
checkout --` and restarts 7100 from `.env` by a trap on any exit. Each control's edit must match its text exactly once or nothing is
edited. Its controls and their predictions are in the script's header; what each measured is the plan's *Sitting 3*.

**A green run leaves** the two projects (the high one's privacy assessment drafted, for a person to read in the console's
*Records*), and a `mf-person-` user at LiteLLM holding two ended sessions' keys.

## Running the test tiers gently

*Added by the gentler test tiers plan's sitting 2, 2026-10-14 (Task 5). Rich's yes to all four, 2026-10-14 (`abdd01e`).*

**`pnpm test` and `pnpm test:docker` run through `scripts/test-gently.sh`** (`package.json`), so this Mac stays
usable while they run, and a run does not fail because it is in use:

- **Priority.** The tier runs under `taskpolicy -c utility` — the scheduler serves everything else first, and every
  child inherits it (`ps -o pri=` reads 31 normal, 20 utility, 4 background).
- **The timeout scale.** A lower priority is a slower run, so the wrapper exports `MANIFEST_TEST_TIMEOUT_SCALE` —
  **5** at utility, **7** at background, 1 at normal — and `packages/control-plane/src/test-timeouts.ts` multiplies
  the `unit` and `packages` projects' limits by it (5 s → 25 s a test at utility), every explicit `scaled(…)` limit,
  and the reset's lock budget. The values are measured, each where the gate admits — utility under ten CPU burners (a
  1-minute load of ~12), background under six: [`spikes/gentler-tiers-baseline/README.md`](spikes/gentler-tiers-baseline/README.md).
  The `docker` project keeps its 120 s. `slowTestThreshold` is 5 s (`vitest.config.ts`), so a piped run still names
  every test over the old limit, with its duration — the **slow list** each close-out reads (ORIENTATION §6).
- **The load gate.** Above a 1-minute load of **12** (`MANIFEST_TEST_MAX_LOAD`; by default `sysctl -n hw.ncpu`) the
  wrapper **exits 75 before any test**, and says so on one line. **Exit 75 is the gate, not a red**: wait for the
  load to fall — with `Monitor` on `sysctl -n vm.loadavg`, never a `sleep` loop — or run with `MANIFEST_TEST_FORCE=1`,
  and say in the record that it was forced (the summary line does). **Forcing it onto a SATURATED machine does not work**: under
  twelve CPU burners a forced utility run got ~1 % of a core and finished 4 files in 30 minutes (the gentler test tiers plan's
  *Sitting 2*, F2) — the priority doing its job. Below the gate (ten burners, a load of ~12) it is green at scale 5.
- **The line at the end.** Every run ends with `test-gently: load (1-min) min … / median … / max … over N samples
  30 s apart; QoS …, timeout scale …, gate …, forced …; exit …` — **read it before believing a red** (ORIENTATION §4's
  trap 4). `make ci-acceptance` puts it on its `pnpm test` line, PASS or FAIL.

**Rich on a call** (Zoom, Meet): `MANIFEST_TEST_QOS=background pnpm test` — background priority (throttled disk too)
and scale 7: slower, and gentler. **To measure**, `MANIFEST_TEST_QOS=normal` runs as before, at scale 1.

**One file, gently:** `bash scripts/test-gently.sh pnpm exec vitest run --project unit src/<path>`. Run unwrapped
(`pnpm exec vitest run --project unit src/<path>`, from the repo root) it keeps normal priority and Vitest's 5 s.

**A new explicit timeout** is `}, scaled(30_000))` (from `test-timeouts.ts`), never a bare number:
`test-timeouts.test.ts` scans every unit and packages test file and refuses one, naming its `file:line`.

**Never pause a run with `kill -STOP`.** Vitest's limits are wall-clock timers: on `kill -CONT` every one that came due
while it was stopped fires at once, and every test in flight times out. Stop it (Ctrl-C) and start it again with
`MANIFEST_TEST_QOS=background`.

| Variable | Default | What it does |
|---|---|---|
| `MANIFEST_TEST_QOS` | `utility` | `utility`, `background` or `normal` — anything else exits 64 |
| `MANIFEST_TEST_TIMEOUT_SCALE` | 5 / 7 / 1 by QoS | 1–10; outside it the run stops before any test, naming the value |
| `MANIFEST_TEST_MAX_LOAD` | `hw.ncpu` (12) | the gate |
| `MANIFEST_TEST_FORCE` | unset | `1` runs above the gate, marked `forced yes` |
| `MANIFEST_TEST_SAMPLE_SECONDS` | 30 | the sampler's interval |
| `MANIFEST_TEST_LOAD_REPORT` | unset | a file the end line (or the refusal) is also written to |
| `MANIFEST_TEST_GENTLY` | set BY the wrapper | **in your shell it makes the wrapper pass straight through** — no gate, no priority of its own, no line (TRAPS) |

Exit codes: the command's own; **75** refused by the gate; **64** a usage error or an unknown QoS; **69** no
`taskpolicy` on `PATH`.

**The reset survives a lock it did not cause** (Task 4): `resetDatabase` and the global setup truncate through
`src/db/truncate.ts`, on an admin pool with `lock_timeout` = a quarter of a test's limit (6 250 ms at utility), and
retry `40P01` (deadlock) and `55P03` (lock budget spent) — three attempts in all, each failed one a `[test harness]
resetDatabase: …` line on stderr. **The test that timed out stays red** — the retry spares only the next one. It never ends another connection:
7100 shares the database.

## `make ci-acceptance` and `make demo-console` — 1c's acceptance, in two halves

*Added by P5c sitting 8, 2026-09-19 (Task 13).*

Phase 1c's acceptance is §22's journey proved twice over ONE contract: **clicked by a
person** and **run headlessly**. They are two targets because the two halves fail for
different reasons and a combined red run would not say which client broke.

```bash
make ci-acceptance      # the headless half: the gates with their COUNTS, then both journeys
make demo-console       # the clicked half: serves the console and prints the checklist
```

**`make ci-acceptance` asserts COUNTS, not exit codes** (P5c Decision 12). `vitest run`
against a path that matches no file prints `No test files found` and **exits 1**, and a
summary-only filter swallows that line, leaving a result that looks exactly like nothing
failed (P5b sitting 9, F5). So the script carries the four numbers from ORIENTATION §2's
box and reports a difference as **`MOVED`** rather than as a failure — a test added on
purpose must not fail the run; what must not happen is that it moves and nobody notices.
**When it moves, update ORIENTATION's top box and §2's box, `RUNBOOK.md` and
`scripts/ci-acceptance.sh` together.**

Every step **reports rather than exits** (P4c Decision 26), so a red run is a measurement
of everything that is broken rather than a stop at the first thing. It runs, in order:
`make doctor`, `make verify`, `pnpm lint`, `pnpm typecheck`, `pnpm format:check`,
`pnpm test`, the three package builds, then `make demo-journey`, `make demo-token`, `make demo-production`
and — last of driver 1's, because it leaves `launch-app` on its leg C release — `make demo-releases`,
then `make demo-github`, and then, on EITHER driver, `make demo-authoring`, `make demo-frontend`, `make demo-launch`, `make demo-faculty-ready`, `make demo-levels` and — last, the longest — `make demo-capacity` (A1's Task 10, against `launch-app` on driver 1 and `launchpath-github` on driver 2). *(It named neither of the last two until A1's sitting 8 found it; this line named
three demos until the D5 plan's sitting 8 found it; P6b sitting 7 had added `make demo-releases` to the script and not
to this sentence — and the authoring API plan's Task 13 added `make demo-authoring` to the script and not to it, which
the front-end enablement plan's Task 15 found when it added `make demo-frontend` to both.)*

**It asks the control plane which SOURCE DRIVER it runs first** (the D5 plan's Task 15), with the unsigned
delivery `make demo-github` asks with. **On driver 1** — the normal case — the four driver-1 demos run, and
`make demo-github` reads **`NOT RUN — the control plane runs driver 1`**. **On driver 2** the four read NOT
RUN and `make demo-github` runs — because a driver-1 demo whose project does not exist yet would CREATE it
on driver 2, where no route can delete it and driver 1 then refuses it for ever. (Since 2026-09-26 each
driver-1 demo also refuses a driver-2 control plane itself — `require_driver` — so run alone it stops too.) **NOT RUN is not a pass**:
the summary counts it on its own line and says so; the exit status is still the FAILED count's.

**`pnpm test` runs BEFORE the demos and the order is load-bearing**: it TRUNCATES the
control plane's §6 tables. The other way round it would empty the database the demos had
just filled, and which step made the machine what it is would be hidden. **Its line in the summary carries the
wrapper's load line**, PASS or FAIL — or the gate's refusal, `exit 75` (*Running the test tiers gently*, above; the
gentler test tiers plan's Task 5).

**There is no CI workflow file, deliberately** (P5c Decision 11). Nothing can run this but
a Mac with Docker Desktop, Ollama with two models, the platform CA trusted in the keychain
and the `127.0.0.2` loopback alias. A workflow no runner executes is a module with no call
site — this script is the caller, and the day a runner exists the workflow is three lines
that invoke it.

**What it does not cover, and where each one lives instead:**

| Not covered | Where it is |
|---|---|
| The CLICKED journey | `make demo-console`, run by a person. The Chrome extension will not type a password, even a test user's (ORIENTATION §4) |
| `pnpm test:docker` (~13 min) | Owed only by a change to `runtime/`, `routing/`, `services/`, `build/`, `releases/`, `identity/`, `sso/`, `secrets/`, `projects/`, `blueprints/`, `ai/`, `observability/`, `infra/` or a `*.docker.test.ts` |
| The OFFLINE acceptance | `scripts/offline-acceptance.sh`, run by hand with the network off — its steps are numbered **0 to 19**, where 0 is the precondition (it read *0 to 15* until A1's sitting 8 found it stale: the launch path plan's step 16, the faculty-ready plan's 17, the U1 plan's 18 and A1's 19, `make demo-capacity`; *0 to 13* after the authoring API plan added step 14; the front-end enablement plan's Task 15 added step 15, `make demo-frontend`). It is the only thing that runs `make demo-identity` and `make demo-ai` |
| BOTH source drivers in one run | one driver per control-plane process: a run on driver 1 reads `make demo-github` NOT RUN, and a run on driver 2 reads the other four NOT RUN. Run it once on each |

**`make demo-console` signs nobody in.** It builds the contract and the console, checks
the control plane answers `UNAUTHENTICATED` through the edge, starts `vite preview` on
7104, waits for `https://console.manifest.internal/` to answer with **the console's own
document** — not the wildcard's `manifest OK host=…`, which answers 200 for any name and
any path — prints the checklist, and stops the server it started when you press Ctrl-C.

## The first administrator

*Added by P5a Task 16, 2026-09-17.*

§20: *"the first administrator is created by a documented out-of-band procedure, never by 'first user to log in
wins'. Role changes are audited."* **This is that procedure.** It is out of band deliberately: it speaks to
Postgres as the database OWNER, inside the container, so no control-plane route can change a platform role and
no delegated token ever will (D24) — there is nothing on the network to steal that does this. At UBC the
procedure is the same SQL run by whoever holds the database owner's credential; the script is its local form.

**The person must have signed in once first** — the `users` row is created at sign-in (§9) — and the script
refuses a PUID that has never signed in, and an empty reason, changing nothing either way.

```bash
scripts/admin-grant.sh grant  opr000001 "the first administrator for this laptop"
scripts/admin-grant.sh revoke opr000001 "no longer needed"
```

**The change reaches them when they SIGN IN AGAIN.** Sessions are stateless and carry the role they were
issued with, so a session minted before the grant still says `member`; the script says so on every run.

Every change is appended to `audit.role_changes` — append-only by grant, like `audit.events`, so the control
plane's own role may read and add a row and never rewrite or remove one. A grant that changes nothing records
nothing. To read it:

```bash
docker exec manifest-postgres psql -U manifest -d manifest_control -c \
  "SELECT u.ubc_cwl_puid, r.from_role, r.to_role, r.actor, r.reason, r.created_at
     FROM audit.role_changes r JOIN users u ON u.id = r.user_id ORDER BY r.created_at DESC"
```

`operator` / `operator` (PUID `opr000001`) is the IdP test user `make demo-journey` makes an administrator, so
that the student and the instructor keep proving exactly what they prove in every other demo. An administrator
reads `GET /v1/fleet` (§26); everyone else gets `403`.

**Or name the administrators in a setting — `MANIFEST_ADMIN_PUIDS`** (the launch path plan's Task 8a, FE-39; §20 as
Spec action 7 amended it). A comma-separated list of PUIDs in `.env`, read at boot. **Set, it is AUTHORITATIVE**: at every
sign-in the person's role is reconciled to it — named, `admin`; not named, `member` — and each change is an
`audit.role_changes` row with actor `setting:MANIFEST_ADMIN_PUIDS`, so a grant made by the script to someone the list
does not name is undone at their next sign-in. **Unset (the default), nobody is reconciled** and the script above is the
procedure. PUIDs, never CWL login names: a login can be given to somebody else. A stray comma refuses the boot
(`CONFIG_INVALID`). Restart the control plane after changing it; it reaches each person at their next sign-in.

**The platform's contacts in a registration package — `MANIFEST_LAUNCH_CONTACTS`** (the launch path plan's Task 10). `Name
<email>`, comma-separated, in `.env`, read at boot: the SUPPORT contacts every drafted IAM registration package names
(`draftIamRegistration`; the project's owners and collaborators are its technical contacts). **Unset (the default), a package
names the oldest administrator**, read when it is drafted. An entry that is not a name and an address refuses the boot
(`CONFIG_INVALID`). At UBC the names are Rich's to give.

**Who may BUILD is not a role** (FE-39): a faculty member — `eduPersonAffiliation` exactly `faculty` at their last
sign-in — or an administrator may create a project, start an intake session or be added to one; anyone else signs
in and is refused `403 BUILDING_NOT_OPEN` / `409 MEMBER_MAY_NOT_BUILD`, and `GET /v1/me` answers `mayBuild: false`.
On the laptop IdP, `instructor` and `colleague` are faculty, `student` a student and `operator` staff — so `operator`
builds only once an administrator. Read a person's last affiliation with `SELECT ubc_cwl_puid, affiliations,
affiliations_seen_at FROM users`.

## Reaping LiteLLM's orphaned users

*Added 2026-09-18, after P5b sitting 8. `scripts/litellm-orphans.sh`.*

Every demo that replaces a project, and every `pnpm test:docker`, mints a fresh LiteLLM user
`mf-<projectId>-<environment>` for the new app and leaves the old one behind with no project. Nothing
reaps them, so the list grows most sittings — it stood at **19 rows, 15 of them orphaned**, on
2026-09-18. **An agent session cannot do the delete**: its permission classifier refuses it as a
secret-store write, and that refusal is never worked around. So an agent lists them and hands the
list over, and **a person runs the delete**.

```bash
bash scripts/litellm-orphans.sh            # list only; changes nothing, exits 0
bash scripts/litellm-orphans.sh --apply    # delete each orphan's keys, then the orphan
```

**It re-derives what is orphaned on every run and never takes a list on trust.** A user is *held*
when one of its keys is the key a container is actually running with — compared by SHA-256, so no
secret is printed — and everything else is an orphan. Do not paste a previous sitting's list into
it: journey-app's user moved in every one of the last eight sittings, which is why ORIENTATION §2
says re-measure and means it.

Three things it does that are easy to leave out:

- **It reads STOPPED app containers too**, with `docker inspect` rather than `docker exec`. An
  exec-based check cannot see a stopped app, would call its user an orphan, and would delete the key
  out from under it on the next start.
- **It refuses to delete anything if it read app containers and got NO key hashes at all** — a
  changed container name or a failed inspect makes every user look orphaned, and a check that finds
  nothing and a check that passes are otherwise the same observation. Watched failing on
  2026-09-18: with the variable name broken it refuses `--apply` and exits 1, naming a container to
  inspect by hand.
- **It deletes keys before users, and re-reads the list afterwards** — asserting that every orphan is
  gone *and every held user survived*, rather than that a delete returned 200. `/key/delete` takes
  the hashed token `/user/info` reports, so a key nobody ever saw can still go. **Each delete is
  checked by STATUS, not by curl's exit code**: `curl -sS` exits 0 on an HTTP error (§4), and both
  endpoints answer `404` for an id that does not exist — measured — so a `|| fail` after a plain
  call could never fire. The script's first version had exactly that defect.

`default_user_id` is LiteLLM's own row and is never touched. An app that declares no models has no
key, hashes to the empty string's digest, and is correctly not counted as holding one.

## Removing app images no container uses

*Added 2026-09-25. `scripts/app-images.sh`.*

Every build pushes an app image to the platform registry as `127.0.0.1:7107/local/<slug>@sha256:…`, and every
deploy pulls one into Docker. Nothing removed them, so they accumulate — about thirteen per `pnpm test:docker` and a
few per demo. On 2026-09-25 there were **285, 283 of them used by no container, holding ~8.6 GB of their own**; all
283 were removed with this script, at Rich's yes.

```bash
bash scripts/app-images.sh            # list only: what is dead, by app, and what it holds; changes nothing
bash scripts/app-images.sh --apply    # remove every dead one, then re-measure
```

- **Safe because Docker's copy is a cache**: the registry keeps every image a build pushed, and a deploy pulls its
  image by digest before it creates anything (`ensureImagePulled`) — an image removed here comes back when something
  deploys it.
- **Only app images are ever considered**: an image is dead only when every name it carries is under
  `127.0.0.1:7107/local/` AND no container of ANY state uses it (a stopped app needs its image to start). The base-image
  mirror, the platform's images, the upstream images Manifest needs offline and every other project's images are never
  touched — re-pulling those needs the network.
- **Not Docker's build cache** (~25 GB): it holds the cached `apk add git` layer the GitHub fake's image rebuilds from
  offline. Pruning it costs a networked rebuild.
- Removal is by every name an image carries, not by id (an app image has digests, not tags), and the re-measure at the
  end — not the loop — is the answer.

## Minting a delegated token

*Added by P5b Task 4, 2026-09-17. `make demo-token` drives the whole thing end to end (P5b sitting 8,
2026-09-18); this section is how to run it by hand.*

D24: an agent does not hold a person's session. It holds a **delegated token** — *"minted by the user in an
interactive session, scoped to a project and a capability set, with an expiry"* — and this is how one is made.
There is no console yet, so it is three `curl` calls against the API through the edge, as the person who owns
the project. `scripts/lib/api.sh` is the same client every demo speaks through; `CP_JAR` is a session cookie
jar from a CWL sign-in.

```bash
# Mint. `capabilities` is explicit: the token gets these and nothing else.
curl -sS -b "$CP_JAR" -X POST \
  -H 'content-type: application/json' \
  -H "idempotency-key: $(uuidgen | tr 'A-Z' 'a-z')" \
  -H 'origin: https://console.manifest.internal' \
  -d '{"name":"ci","capabilities":["project:read","build:create","release:create","release:deploy"],"expiresInDays":30}' \
  "https://console.manifest.internal/v1/projects/$PROJECT_ID/tokens"

# List — every token on the project, newest first, including the revoked and the expired.
curl -sS -b "$CP_JAR" "https://console.manifest.internal/v1/projects/$PROJECT_ID/tokens"

# Revoke. Only the person who minted it may; anyone else is answered 404.
curl -sS -b "$CP_JAR" -X DELETE \
  -H "idempotency-key: $(uuidgen | tr 'A-Z' 'a-z')" \
  -H 'origin: https://console.manifest.internal' \
  "https://console.manifest.internal/v1/tokens/$TOKEN_ID"
```

**The secret is in the mint response and nowhere else.** It is `secret` in the body — `mft_<id>_<secret>` —
and the platform stores only a SHA-256 of the second half. **Store it when you read it**: no route, no
database query and no support request can produce it again, because it does not exist anywhere to produce.
The list and the revoke answers have no `secret` field at all, and that is a property of the schema rather
than of the mapper that fills it.

**Four things the mint route refuses, and why:**

- **D24's forbidden four** — `members:manage`, `release:promote`, `quota:set`, `secret:read` — are
  `400 TOKEN_CAPABILITY_FORBIDDEN`, and the message names which one you asked for. An agent that needs one
  asks for it at the moment it needs it, and a human confirms that single action — which is built, and is
  *Answering an agent's pending action* below.
- **More than you hold yourself** is `403 FORBIDDEN`. A collaborator cannot mint a token that deletes the
  project, because a token delegates authority and does not create it.
- **An expiry over 365 days**, or under one, is `400 REQUEST_INVALID` naming `expiresInDays`.
- **A capability that is not one of the platform's** is `400 REQUEST_INVALID`. The full list is
  `MintTokenRequest` in `packages/contract/openapi.json`.

**Minting is interactive only.** These three routes take a session cookie; a token cannot mint a token, or
one leaked credential would be a credential factory.

**A minted token IS a usable credential** — since P5b Task 5 (sitting 3, 2026-09-17). Send it as
`Authorization: Bearer mft_<id>_<secret>` on any `/v1` route, with no cookie and no `Origin`: one request
hook turns either credential class into an actor, and a request carrying both a cookie and a bearer token is
refused `400 CREDENTIAL_AMBIGUOUS`. A token addressing a project it is not scoped to is answered `404`, the
stranger's answer, rather than `403`.

**A token is rate-limited, per token, from its own row** — since P5b Task 9 (sitting 6, 2026-09-18).
`rateLimit` on the mint and list answers is **requests a minute**, 600 by default; past it EVERY `/v1` route
answers `429 RATE_LIMITED` with `Retry-After` in seconds. The limit is taken in the one request hook, after
the token is verified, so a forged token cannot spend a real one's window and no route can forget the
check. **A session is deliberately not limited** — §20 scopes this control to tokens, because a
third-party agent is code the platform did not write; `GET /v1/slugs/{slug}` keeps its own per-user limiter
and is unaffected.

**A token list says whether each one has EXPIRED** — since P5b Task 10 (sitting 7, 2026-09-18). `expired` on
the mint and list answers is computed by the platform from `expiresAt`, so a reviewer of §20's list does not
compare clocks by hand. It is **not** "this token no longer works": a revoked token does not work either, and
`revokedAt` says so separately, because a clock and a person are different answers to why a credential
stopped.

**A question nobody answers becomes `expired`, and the boot is what moves it** — Task 10. Each is recorded
with a life of 24 hours (`PENDING_ACTION_TTL_MS`), and `expirePendingActions` runs once at every control-plane
boot, reporting `pendingActionsExpired` on the boot line. **Two things it is not:**

- It is **not** the control that stops a lapsed question being answered. `POST …/confirm` refuses a row past
  its own `expiresAt` with `409 PENDING_ACTION_RESOLVED` whether or not a sweep has run, and a confirmation
  older than the row's life cannot be spent. So the sweep makes the stored state honest; it does not decide
  anything.
- It does **not** run on a timer. **A control plane that has been up for a week can show a question as
  `pending` in the queue when its own `expiresAt` passed days ago** — asking to act on it is still refused,
  with the `409` above, so it is the display that is stale and never the decision. Restarting the control
  plane sweeps it; P5b's *What this plan does not build* says why no timer was added.

**Two identical asks are one question, enforced by the database** — Task 10, migration 0018. A partial unique
index over the token and the request's fingerprint, `WHERE state = 'pending'`, so an agent retrying in
parallel cannot fill a person's queue with the same question forty times. It is partial deliberately: once a
question is answered or lapsed, the same thing may be asked again.

**What is not built.** A project owner cannot revoke a collaborator's token — only the person who minted it
can.

*This section said "a token cannot authenticate until Task 5, which is the next sitting's work" until
2026-09-18, two sittings after that stopped being true: sittings 3 and 4 swept the gate-number line in this
file and not the section their own work made false. Recorded as a finding in P5b sitting 5.*

## Taking an application to PRODUCTION, by hand (§13's checklist, end to end)

*Added by P6a sitting 9, 2026-09-20, which drove this against `journey-app` and put the first
application this platform has ever launched into production. **`make demo-production` now drives
the whole of it headlessly** (P6a sitting 11, 2026-09-22 — its own section above); this is what
each of its calls is, for when you need to do one step by hand.*

**Or click it** (P6a sitting 10): serve the console with `vite preview` (see *Running the
reference console* above for why not `dev`), sign in as the administrator, open the project from **Fleet**,
record both answers on its **Launch records** tab, press **Run the rehearsal** on the checklist —
and follow **Confirm it is you, then try again** when it is refused (a step-up since the launch
path plan's Task 6c) — follow **Review this release**, press **Approve** — refused the same way
once the ten minutes are up — then **Deploy to production**. Every step below is what those
buttons send.

**Every step is an administrator's**, signed in through the edge exactly as *The first administrator*
below describes, and every mutation carries `Origin: https://console.manifest.internal` and an
`Idempotency-Key`. `make demo-journey` leaves `journey-app` serving staging and `opr000001` an
administrator, which is the cheapest starting point.

1. **Read the checklist.** `GET /v1/projects/{id}/launch-readiness` — for a CWL app with nothing
   recorded, four blocking items are `unmet`: `iam-registration`, `privacy-assessment`,
   `rehearsal`, `admin-approval`.
2. **Record what UBC said**, along §9's arrows — a first write straight into `active` is refused,
   so `draft` → `submitted` → `active` for the registration, `submitted` → `approved` for the PIA:
   `POST /v1/projects/{id}/launch-records/iam-registration` and `…/privacy-assessment`.
   **LIST EVERY ATTRIBUTE THE RELEASE ASKS FOR** in `registeredAttributes` — the item is `met`
   only when the candidate's list is a subset of it, and a short list reads like the rehearsal
   failing (P6a sitting 8, F9).
3. **Run the rehearsal.** `POST /v1/projects/{id}/rehearsal` — **step up first** (step 4 says how):
   an ordinary session is refused `403 STEP_UP_REQUIRED` and nothing is deployed (§20, since the
   launch path plan's Task 6c). ~9 s. It deploys the candidate to the production hostname,
   registers its Service Provider with production values, completes a real CWL sign-in, **takes
   the deployment down again** — the name first, then the instance — and only then answers `200`
   with the evidence. Afterwards `127.0.0.3` answers the production name with the wildcard
   (`manifest OK host=… listener=public`, no `x-manifest-instance`), and the environment reads the
   rehearsal's instance `gone` (`failed` when the candidate never started). **`passed: false` is a `200`** — a measurement that came out badly
   is not a request error, and `evidence.reason` says which hop failed. A second press while one
   runs is `409 REHEARSAL_RUNNING`; a take-down that fails is `500 REHEARSAL_TEARDOWN_FAILED`,
   records nothing, and is fixed by running it again. **A control plane stopped mid-rehearsal**
   leaves the candidate serving — the edge keeps the route — until its next boot, which takes down
   every production name of an active project that has not launched: read the boot line's
   `rehearsalsTakenDown` and `rehearsalsNotTakenDown`, and a `[rehearsal] … could not be taken down`
   line names the step for one that could not be.
4. **Approve the release.** `POST /v1/releases/{releaseId}/approve` is refused `403
   STEP_UP_REQUIRED` first (§20). Navigate `GET /auth/step-up` on the SAME cookie jar, complete
   the IdP's prompt — it prompts again even though you are already signed in — and post the
   assertion back to `/auth/saml/callback` **with `RelayState` beside `SAMLResponse`**, or the
   callback answers `401`. `infra/lib/idp-login.sh` is the flow; the step-up entry point is the
   only difference. **Take a preview first** — `POST /v1/releases/{releaseId}/approval-preview`,
   no step-up needed, `201` with the diff an approval will record (P6b Task 9) — then approve
   naming it, `{"previewId": "<its id>"}`: `201`, bound to the build's digest, its diff the
   preview's. Without `previewId` the approval is `400 APPROVAL_PREVIEW_REQUIRED`; a preview
   older than thirty minutes is `409 APPROVAL_PREVIEW_EXPIRED`; take another.
5. **Deploy to production.** `POST /v1/environments/{productionEnvironmentId}/deploy` — it also
   asks for step-up, and one round trip covers both while the claim is fresh. The app then
   answers on **127.0.0.3**:
   ```bash
   curl -sS --cacert infra/ca/manifest-root.crt -o /dev/null      -w 'status=%{http_code} instance=%header{x-manifest-instance}\n'      --resolve journey-app.manifest.internal:443:127.0.0.3      https://journey-app.manifest.internal/healthz
   ```
   **Read the INSTANCE header, never the status**: the same name on `127.0.0.2` also answers
   `200`, with no header, because that is the edge's wildcard and not the app.

**An app in production on this laptop signs nobody in, and that is correct.** §8 points a
production deploy at real UBC Shibboleth (`authentication.ubc.ca`), which C1 puts out of reach.
The rehearsal is the one production deploy pointed at the Manifest IdP — and it does not stay up.

## Answering an agent's pending action

*Added by P5b Tasks 6 and 7, 2026-09-18. `make demo-token` drives the whole loop end to end (sitting 8); this
is how to run it by hand.*

D24's four are refused **centrally, at the authorization layer, not per route** — so a new privileged route
cannot accidentally omit the rule. An agent asking for one is answered `403 TOKEN_ACTION_PENDING`, and the
envelope carries the `pendingAction` a person must answer:

```json
{ "error": { "code": "TOKEN_ACTION_PENDING",
             "pendingAction": { "id": "…", "action": "members:manage", "state": "pending",
                                "method": "POST", "path": "/v1/projects/…/members",
                                "bodySha256": "…", "summary": "Add or change a member",
                                "waitingSeconds": 0, "reason": null, "consumedAt": null } } }
```

A person then answers it **in an interactive session** — a token cannot answer its own question, or the
mechanism would be a loop with no human in it:

```bash
# Confirm. The body is an empty object; the person must hold the capability THEMSELVES.
curl -sS -X POST -b "$CP_JAR" -H 'Content-Type: application/json' \
  -H "Origin: https://console.manifest.internal" -H "Idempotency-Key: $(uuidgen)" -d '{}' \
  "https://console.manifest.internal/v1/pending-actions/$PENDING_ID/confirm"

# Or refuse it, in your own words. The agent is told the reason, verbatim.
curl -sS -X POST -b "$CP_JAR" -H 'Content-Type: application/json' \
  -H "Origin: https://console.manifest.internal" -H "Idempotency-Key: $(uuidgen)" \
  -d '{"reason":"not this term"}' \
  "https://console.manifest.internal/v1/pending-actions/$PENDING_ID/reject"
```

**What a confirmation is, and what it is not.** It does not replay the request. It grants **that exact
request** — this token, this method, this path, this body — **one retry**, which the agent then makes
itself, through its normal route with its normal validation. Five things follow, and each of them is a test:

- **The retry reuses the SAME `Idempotency-Key`**, which is what D23.6's own error hint tells a client to
  do. The refusal deliberately stores no idempotency record, so the retry reaches the handler.
- **"Exactly once" describes the ACTION, not the ANSWER.** The confirmed retry's `201` *is* stored under
  that key, so replaying the key returns it for ever without reaching the handler or any capability check.
  That is not an escalation — the action was authorized once and the answer is identical — but a reader who
  assumes otherwise will mis-read `consumedAt`. A second *attempt at the action* is a new request with a
  fresh key, and that one is refused again with a NEW question.
- **A different body is a different question.** The match is on the fingerprint, so a confirmation of one
  request is never a standing grant of the capability.
- **A confirmation is one credential's.** A second token asking the identical thing gets its own question.
- **A failed retry does not burn the confirmation.** `consumedAt` is stamped after the handler resolves, so
  a transient failure the agent did not cause can be retried on the same grant.

**Reading the queue** — §26's primary screen, as two reads (P5b Task 8, 2026-09-18). There is no console
yet, so this is what P5c will be built on, and it is also how an agent polls for its own answer instead of
retrying a refused request to find out:

```bash
# The project's queue, newest first. `waitingSeconds` is §26's headline number.
curl -sS -b "$CP_JAR" "https://console.manifest.internal/v1/projects/$PROJECT_ID/pending-actions"

# One question. The AGENT reads its own this way, with its bearer token and no cookie.
curl -sS -H "Authorization: Bearer $TOKEN" \
  "https://console.manifest.internal/v1/pending-actions/$PENDING_ID"
```

**The two credential classes see different sets.** Anyone who can read the project sees every question on
it — reading is `project:read`, so a collaborator watches the queue even though answering needs the
capability the question is about. A **token sees only what it asked itself**: one agent reading another
agent's requests is a read D24 grants nobody, and a question that is not yours is `404`, the same answer an
id that does not exist gets. **Neither read ever carries the refused request's body** — only its
`bodySha256`, which is enough for an agent to recognise its own request and nothing for a person's screen to
leak. Answered and expired questions stay in the list, because a queue that hides what was decided cannot
show a person what they decided.

**Removing a member** is D24's fourth privileged action and became reachable in the same task:
`DELETE /v1/projects/$PROJECT_ID/members/$USER_ID`, answering `200` with the members as they now are. It is
idempotent — removing somebody who is not a member is not an error — and the **last owner cannot be
removed** (`409 PROJECT_LAST_OWNER`). It was written after D24's rule was made central and needs no token
code of its own to refuse one: an agent asking is answered `403 TOKEN_ACTION_PENDING` anyway, which is the
whole claim of that rule and is what its test measures. **What it does to the removed person, since the launch
path plan's Task 8 (2026-09-30)**: every token they minted on THIS project is revoked in the removal's own
transaction, their token streams close `4401` and their session streams on the project `4404`, and their agent
sessions there end `member_removed` — `member.removed` counts both. If ending a session fails, the answer is
`503 AI_CATALOGUE_DISABLED` (or a `500`) that comes AFTER the removal and the revoke: **repeat the same request**
and it finishes ending them.

**Refusing is final for that request.** A retry after a rejection is answered `403 TOKEN_ACTION_REJECTED`
carrying the person's own reason, rather than asking them the same thing again — which is what D23.7 means
by an error an agent corrects itself from. **Who may answer:** whoever holds the capability themselves. A
collaborator who may not manage members is `403 FORBIDDEN`; somebody who is not a member of the project at
all is `404`, the same answer an id that does not exist gets. Answering twice is `409
PENDING_ACTION_RESOLVED`. A question expires after **24 hours**.

## `make demo-redeploy` — P4c's acceptance: a redeploy nobody using the app notices

*Added by P4c sitting 1, 2026-09-15, before the feature it tests. Green since sitting 7, and P4c's
acceptance since sitting 8 — both 2026-09-16.*

Same requirements as `make demo-ai` — the control plane running, Ollama on the host. It deploys the
proof app, signs a student in, starts two loops through the edge — a health request every 200 ms and
questions asked back to back — and then redeploys **the same release**, **a new release**, and **a
release that never becomes ready**, asserting on every request and question in each window.

```bash
make up
# ... the control plane running, per "Running the control plane" above ...
make demo-redeploy          # ~3 minutes; ends with Done. and exit 0
```

**Twenty-four assertions, all green**: no 5xx and no wildcard page in any redeploy window, every
question answered 200 **by an instance** (the edge's wildcard answers 200 too, with no
`X-Manifest-Instance`), **nobody signed out**, the edge naming the new instance, each replaced
instance retired within 150 s with exactly one app container, no orphan `-files` volume and one
LiteLLM key left; in each of the two redeploys that move the route, **a question in flight at the
move answered 200 by the instance the route moved away from**; and a release that never becomes
ready recorded `failed` with an Incident, **every request in its window answered by the instance
that was serving**. It was written first and ran red — **ten of twenty-one** — and P4c's sitting 8
ran it green three times, once from a `make reset` machine, and watched its nine negative controls.
**Four of those nine cannot fail here, and it is worth knowing which**: a delete-then-insert route
move (a millisecond gap under 200 ms sampling — `routes.docker.test.ts` sees it), a drain of 1 ms
(the deploy call itself outlasts the question a move leaves behind — the Docker tier's driver
contract sees it), revoking the old key at promotion (a unit test in `releases.test.ts` sees it)
and removing both serving guards (nothing in a run makes a retire find nothing serving — the driver
contract and `retire.test.ts` see it). The summary's per-phase `inFlightAtRetire` says whether the
drain held a question in that run; it usually did not. The baseline and every run are in
[`plans/2026-09-15-p4c-zero-downtime-redeploys.md`](plans/2026-09-15-p4c-zero-downtime-redeploys.md)'s
*What executing this plan found* and `spikes/p4c-baseline/`. It leaves the app deployed. **A red run
keeps its raw output** and prints the directory; a green one deletes it.

## `make demo-ai` — the proof app answers a question, charged to one person

*Added by P4b Task 16, 2026-09-15. §16's proof app is complete with it.*

Same requirements as `make demo-identity`, plus **Ollama running on the host** with
`qwen3.5:4b` and `nomic-embed-text` — it is a host application, not a container, so
`make up` does not start it, and LiteLLM reaches it at `host.docker.internal:11434`.

```bash
make up
# ... the control plane running, per "Running the control plane" above; its boot line must say "ai":"enabled" ...
make demo-ai
```

Nine steps, and every assertion is on the shape of the answer rather than its arrival:

1. log in to Manifest with CWL, and create or reuse the `proof-app` project;
2. **subscribe to `WS /v1/projects/:projectId/events` before anything is built** — with
   `scripts/lib/event-stream.mjs`, a dependency-free Node program, because a shell
   cannot speak WebSocket;
3. push, validate, build, release and deploy;
4. **the stream carried this deploy in order** — `build.started`, `build.succeeded`,
   `sso.registered`, `instance.healthy`, `ai.key_rotated` — and every build-log line
   it streamed is exactly a line the build stored, in order;
5. a student and an instructor sign in and each write a note — the instructor's
   written to be the *closer* match for the question;
6. **the student asks a question**: a non-empty answer, from a streamed completion,
   using a 768-dimension embedding to choose context, and the context is one of the
   student's own notes and **never the instructor's**;
7. the instructor asks the same question, the other way round;
8. **LiteLLM's own spend log** holds a chat row and an embedding row for each person,
   each charged to `sha256(puid ‖ project ‖ environment)` through this app's LiteLLM
   user — and nothing charged to a bare PUID hash or a raw PUID. It reads the log with
   `LITELLM_MASTER_KEY` from `.env`, which is why it is an operator's check.

**If it fails at step 6 with `AI_BACKEND_UNAVAILABLE`**, the app cannot reach
`manifest-litellm` on its own network — check `docker network inspect
mf-proof-app-staging-net` lists it. **`AI_EMPTY_ANSWER`** is S3's thinking-model failure:
the model streamed no text. **A dimension of 192** is S3's silent embedding failure, an
`embed()` without `encoding_format: 'float'`.

It is re-runnable and every run redeploys. Since P4c the previous release's container is
drained and removed behind each redeploy, so a re-run leaves one app container, not two.

## Watching a project's event stream

**`WS /v1/projects/:projectId/events`** is D23.2's one stream per project (P4b Tasks 14–15, 2026-09-15): builds, each build-log line as it is written, instance state, incidents, §9's SSO registrations and §10's AI key rotations. There is no polling API for any of it.

- **It needs a WebSocket client and a credential.** `curl` cannot speak it: a plain GET from a member answers `426 Upgrade Required` with `Upgrade: websocket`, a stranger `404`, nobody `401` — which is also the quick way to check the route is up. The credential is either the `__Host-manifest_session` cookie a CWL login sets (`manifest_session` on a loopback http origin) **or, since P5b Task 5, an agent's `Authorization: Bearer <token>`** — the stream reads whichever the one request hook resolved, so a delegated token scoped to the project opens it with the `project:read` it was minted with.
- **A connection is replayed first.** It receives the project's newest 50 events, oldest first, then `{"kind":"control","type":"manifest.stream.ready"}`, then live frames — anything before the ready frame had already happened. Build-log lines are **not** replayed; `GET /v1/builds/:buildId/logs` has them.
- **A client that falls behind is closed with 1013** once a megabyte is queued for it, and should reconnect; the replay covers the events it missed.
- **It is reached through the edge, at `wss://console.manifest.internal/v1/projects/:projectId/events`** (P5a Task 3), and **a SESSION-bearing upgrade must carry `Origin: https://console.manifest.internal`** (P5a Task 4) — one carrying a session from any other origin, or from none, is refused `403` before it opens, which a WebSocket client sees as an error and close `1006`, not as a status. `scripts/lib/event-stream.mjs` sets it. **A TOKEN-bearing upgrade must NOT send it and is not asked for one**: CSRF is a browser attack, a bearer credential is not sent automatically by a browser, and the check keys on the cookie (`carriesSession`), so it exempts a token without a line of its own (P5b sitting 3, F9 — asserted by two tests rather than read off the source). A Node client needs `NODE_EXTRA_CA_CERTS` — Node does not read the keychain. **Every edge admin change is a whole-config reload, and a reload closes every WebSocket it proxied with `1001`** unless the handler sets `stream_close_delay`; the console site sets an hour, so a deploy anywhere on the platform no longer disconnects a subscriber, but a stream older than an hour past a reload is closed with `1001` and should reconnect.
- **Frames reach only sockets on the control plane that published them.** Restarting the control plane drops every connection; a reconnect is replayed the events, and a build that was running has its lines in its build log.
- **Authorization is checked when the socket opens, not per frame** — removing someone from a project does not close a stream they already hold.

## Known gaps

**The second-machine test has NOT been run.** *Recorded 2026-09-05.* No second
Mac was available. So everything above is evidenced on **one machine only**, and
the clean-clone path — `git clone` into a directory that has never held this
project, on a Mac whose Docker has none of these images — is **unverified**.

The interesting case remains a second Mac **with Laravel Valet installed**, because
Valet owns `.test`, port 53 and ports 80/443, and that collision is why the zone is
`manifest.internal` and why the edge binds `127.0.0.2`. A machine without Valet
would only test the easy path.

**`make up` does not recover the edge after a reboot.** *Measured 2026-09-14, Docker
Engine 29.7.2, macOS 26.6.2.* Starting Docker Desktop restarted `manifest-caddy` itself
(`restart: unless-stopped`) **2.6 s after its engine came up**, before `make up` had
re-added the alias. The port forward failed — `listen tcp4 127.0.0.2:443: bind: can't
assign requested address`, in
`~/Library/Containers/com.docker.docker/Data/log/host/com.docker.backend.log` — and
Docker Desktop never retries one, so **all three** of Caddy's host ports stayed
unpublished, including `127.0.0.1:7119`, whose address was never missing. `make up`
then added the alias, found Caddy running and unchanged, left it alone and printed
`platform up`: Caddy's health check runs inside the container, so `--wait` saw it
healthy. `make doctor` reported 18/0 with one warning that blamed CA trust for what was
an `ECONNREFUSED`. **`make verify` was the only gate that saw it** — 9 failed, every one
a host→edge check, while every container→edge check passed.

**Workaround:** `docker restart manifest-caddy`. It is safe: Caddy reads its Caddyfile at
start, and the control plane re-applies runtime routes. Measured: all three ports
published, `https://console.manifest.internal/` → 200 from the host, doctor 18/0 with
no warnings, verify 47/0.

**Not fixed yet.** The fix belongs in `make up`, and it should read state rather than
infer it: after `compose up`, assert the host can connect to `127.0.0.2:443` and
`127.0.0.1:7119`, restart Caddy once if not, and fail loudly if still not. Restarting
Caddy only when `ensure-alias.sh` itself added the alias would miss an alias added by
`make seed` or by hand. Its negative control needs the alias removed, which is `sudo`.

**`make seed` can die at step 2 when Docker Desktop's credential helper hangs.** *Measured
2026-09-14, Docker Engine 29.7.2.* Twice in a row, step 2 (`$COMPOSE build`) failed with
`load metadata for docker.io/library/php:8.3-apache … DeadlineExceeded: context deadline
exceeded` — `caddy:2.11.4` and `composer:2` the same — while `curl` reached Docker Hub in 0.3 s
from the host and from inside the Docker VM, with 100 of 100 anonymous pulls left. BuildKit asks
`docker-credential-desktop` for Docker Hub credentials and curl does not, and that helper was
hanging:

```bash
echo https://index.docker.io/v1/ | gtimeout 20 docker-credential-desktop get >/dev/null
echo $?    # 124 is the hang; 0 or a quick non-zero is a working helper
```

Seed stops there, **before step 4b's npm warm, which needs no Docker Hub at all**, and every
hung call leaves a `docker-credential-desktop get` process behind, parented to launchd —
`pgrep -fl 'docker-credential-desktop get'`, and kill the ones you started.

**Workaround, when the platform images already exist:** run the warm step on its own, taken
verbatim out of `seed.sh` so it is the real mechanism rather than a copy, and let `make verify`
say whether it worked — seed's own output cannot (see *C1's acceptance*'s note on the mirror):

```bash
sed -n '/^echo "4b\/6/,/^done$/p' infra/seed/seed.sh > /tmp/warm.sh
bash -c 'set -euo pipefail; . infra/lib/common.sh; set -a; . ./.env; set +a; . /tmp/warm.sh'
make verify    # "… pinned tarballs across every blueprint and fixture lockfile; 0 missing"
```

**Restarting Docker Desktop cleared it** (2026-09-14): afterwards the helper answered in under a
second and `docker buildx imagetools inspect php:8.3-apache` in 1 s, and the platform came back with
`make doctor` 18/0, `make verify` 47/0 and all four pre-existing containers present. A restart
restarts every container on the machine, so it is a person's call rather than a script's.

**A Mongo service could be reported ready before it accepted the app's credentials — FIXED 2026-09-15, except in containers created before the fix.** *Measured 2026-09-14, `mongodb/mongodb-community-server:7.0.28-ubi8`.* The catalogue's health test was a loopback `ping`, which the image's init `mongod` — on `127.0.0.1`, with no authentication — answers while it creates the user, so a service was reported healthy at 9.6 s while an authenticated write from another container was refused until 33.8 s. P4b's sitting 8 replaced the check with one that passes only once authentication is enforced, runs it every second while the service starts and every 30 s after, and forces the race in the Docker tier with a 20 s init script (P4b findings 133 and 134).

**What it leaves behind: a service container created before the fix keeps its old check**, because nothing recreates an existing service — the demo databases `mf-fixture-app-staging-db` and `mf-proof-app-staging-db` on the machine this was fixed on, for example. If a deploy onto such a database finds its first write refused, redeploy; or remove the container — `docker rm -f -v <name>`, where `-v` removes only its anonymous volumes and never the named `-data` volume its data lives in — so the next deploy recreates it with the new check. The image does not re-run its initialisation over a data directory that already has one.

**Two things P4a Task 15 left open, both named rather than glossed.**

- **AFTER `make reset`, CHECK THE EDGE FROM THE HOST BEFORE RUNNING ANYTHING.** *Recorded
  2026-09-18, P5b sitting 9.* Once, after `echo reset | make reset && make up`, every host-side
  call to `https://console.manifest.internal` and `https://edge.manifest.internal` answered
  `curl: (35) Recv failure: Connection reset by peer` — while the SAME check from a container on
  the platform network passed. `make verify` caught it as **11 of 51 failed**, all with that one
  error, and its *host and container see a byte-identical hostname and scheme* check is the one
  that names the shape. The `127.0.0.2` alias was present, the control plane answered `401` on
  `127.0.0.1:7100`, and `manifest-caddy` was up and healthy. **`docker restart manifest-caddy`
  cleared it.** It did not reproduce under `make down && make up`, so it is intermittent and its
  trigger is not isolated. **The order to use after a reset:** `make up`, then export *Running the control plane*'s
  whole block, then `pnpm --filter @manifest/control-plane db:migrate` — which fails with
  `[x] url: undefined` if `MANIFEST_ADMIN_DATABASE_URL` is not exported, because it is derived in
  that block and not stored in `.env` — then the control plane, **then `make verify`**, and only
  then the demos.
- **THE OFFLINE ACCEPTANCE OF `make demo-identity` HAS NOT BEEN RUN.** *Recorded
  2026-09-09.* It is Rich's to run, because turning the network off from an agent's
  tool call cuts the agent off too. `scripts/offline-acceptance.sh` gained a step 6
  that runs it, and it is **the step most likely to need a route out**: it builds an
  image from `node-ts-mongo@1`'s five app-side dependencies through Verdaccio *and*
  completes a full SAML round trip. It needs the control plane running and reports
  SKIPPED rather than failing when it is not — **and a skipped acceptance is not a
  passed one.** Everything else about Task 15 is evidenced, including a run from a
  `make reset` machine. **P4b's Task 16 appended a step 7, `make demo-ai`** (2026-09-15),
  equally unrun offline; its open question is whether **Ollama** — a host application,
  not a container — answers with the network off. **P5a sitting 12 appended a step 8,
  `make demo-journey`, P5b sitting 9 a step 9, `make demo-token` (2026-09-18), and P5c
  sitting 9 a step 10, the console's preflight (2026-09-19), and P6a sitting 11 a step 11,
  `make demo-production` (2026-09-22)** — the script now has eleven steps and all six of the
  appended ones are unrun offline. Step 11 is the one most likely to find something: a
  production launch pulls the approved digest from the registry and signs in at the IdP three
  times, and its approval summary may read `unavailable` offline, which is Decision 7. Step 9
  should want the network least of any of them: its credential is `node:crypto` and its
  build comes from the same mirror step 6 already exercises.
- **A redeploy no longer 502s the app or signs anyone out — for apps on the current blueprint.**
  *The baseline, measured 2026-09-15 under a request loop classified by body:* a same-release
  redeploy produced **7 empty 502s between +428 ms and +1,634 ms**, a new-release redeploy 6, and in
  both the first request to the new container answered **401**, because the blueprint kept sessions
  in the container's memory. **P4c fixed both.** Since sitting 3 the new container starts beside the
  one serving, is proved ready from inside the edge, and only then takes the route with one in-place
  `PATCH`; since sitting 7 (2026-09-16) `node-ts-mongo@1` keeps sessions in the app's own Mongo
  (`skeleton/auth/session.js`). `make demo-redeploy` is **24 of 24 green**, run three times on
  2026-09-16 and once from a `make reset` machine: nobody signed out, every question answered by an
  instance, every request in every redeploy window answered by the app. **Three limits remain, all
  deliberate** (the plan's *What this plan does not build*): **an app generated from the skeleton
  BEFORE 2026-09-16 still keeps sessions in memory** and signs everyone out until it mounts
  `sessionMiddleware(client)` from `auth/session.js`; **a sign-in under way at the IdP when the
  route moves fails once**, because `passport-ubcshib` keeps its SAML request ids in memory; and an
  edge configuration reload can reset about one connection in 300 (R1). **Do not "clean up" an
  instance through the driver's `destroyInstance`:** it removes the route by hostname, which the live
  instance shares.
- **CLOSED 2026-09-16 (P4c): redeploys used to leave the PREVIOUS release's container running.** *Measured
  2026-09-09:* eleven deploys of one app in one session produced eleven
  `mf-proof-app-staging-*-app` containers, all `Up` and healthy, each holding its full
  cpu/memory/pids allocation, with only one carrying the route. `deployRelease` calls
  `ensureInstance` and nothing destroyed what the last release left. **Since P4c sitting 6
  (2026-09-15) a redeploy through the control plane retires what it replaced**: the old instance
  drains until the edge holds nothing in flight to it (at most `MANIFEST_DRAIN_TIMEOUT_MS`,
  120 s), and is then removed with its `-files` volume and its AI key — and the first P4c redeploy
  of an app reaps every older container it left too (R7). What is still not reaped: anything a
  crashed control plane left for an app nobody redeploys, and containers the Docker tier's tests
  leave. Fleet-wide reaping belongs to §11's reconciliation loop, which is Phase 4 (D10). **P4c's
  Task 11 closed this entry for every redeploy from here on**: `make demo-redeploy` asserts exactly
  one app container and no orphan `-files` volume after each redeploy, and a control with the
  retire unscheduled left four. A container from before P4c is reaped by the next redeploy of its
  app (R7), and one a redeploy failed to retire by that or by the next control-plane boot —
  measured 2026-09-16, when a boot reaped the three that control had left. **For anything older
  or stranded** — and `-v` removes a container's
  ANONYMOUS volumes only, so each instance's named `-files` volume has to go by name:

  ```bash
  # Every mf- app container EXCEPT the one the route points at. Check first, and name
  # each one explicitly — repeated `docker ps --filter name=` flags are OR'd, not AND'd:
  docker ps --format '{{.Names}}' | grep -- '-app$'
  docker rm -f -v <each older one, by name>
  # AND its files volume. It is NAMED, so `-v` leaves it — and it holds that instance's
  # copy of the app's SAML private key (P4b finding 194, measured 2026-09-15):
  docker volume rm <each older one>-files
  ```

  `make reset` clears them all, at the cost of every project's data.
- **An AI app whose gateway disappears from its network waits ten minutes for an answer.**
  *Measured 2026-09-15 (P4b sitting 10), `ubc-genai-toolkit-llm` 0.7.0:* with
  `manifest-litellm` detached from the proof app's network, a question hung **611 s** and
  then answered `502`. The OpenAI SDK under the toolkit reuses a kept-alive socket, which
  retransmits to an address nobody holds until the SDK's own 600 s timeout, and the toolkit
  offers no way to shorten it. With no pooled socket the same failure answers
  `503 AI_BACKEND_UNAVAILABLE` in 16 s. **Anything that removes the gateway from app
  networks** — recreating the `manifest-litellm` container is the likely one — cuts every AI
  app off until it is redeployed. **Workaround:** redeploy the app, which re-attaches the
  gateway; or `docker network connect mf-<slug>-<env>-net manifest-litellm`.
- **`pnpm test` leaves live AI keys behind.** *Measured 2026-09-15.* Its setup empties the
  control plane's tables and touches nothing in LiteLLM, so every project it removes keeps
  its LiteLLM user and its confined, budgeted key — and any container still running keeps
  using it. `make reset` does clear them, because LiteLLM's database is in the Postgres
  volume it destroys. **Check:** the `/user/list` call in `make demo-ai`'s section above
  lists `mf-` users; one whose project UUID is no longer in `projects` is an orphan.
- **After `pnpm test` or `make reset`, `.manifest/repos` still holds each demo's repository,
  and its project is gone.** *Measured 2026-09-15; changed 2026-09-16 (P5a Task 11).* Neither
  removes the bare source repositories, so creating the project again finds the slug's old
  repository and answers `SOURCE_GIT_FAILED` — with git's raw output. Since P5a Task 11 that
  creation leaves NO project behind (it used to leave the row, which the demos then reused), so
  **every demo and `make demo-journey` first remove their own slug's repository when
  `GET /v1/slugs/{slug}` says no project holds the name** — `clear_orphan_repository` in
  `scripts/lib/api.sh`, which prints the path it removed. A `POST /v1/projects` of your own
  for such a slug still answers `SOURCE_GIT_FAILED`: move `.manifest/repos/<slug>.git` aside
  first.
- **After `pnpm test:docker`, a demo that was deployed is no longer reachable.** *Measured
  2026-09-15.* `routes.docker.test.ts` restarts `manifest-caddy`, which drops every runtime
  route, and the tier empties the tables the control plane would re-apply them from — so each
  demo hostname answers the edge's wildcard page, `manifest OK host=…`, **with status 200**,
  while the app's containers stay up and healthy. **Read the body, not the status.** Re-run
  `make demo`, `make demo-identity` or `make demo-ai` to deploy it again.
  **Since P4c Task 9, RESTARTING THE CONTROL PLANE re-applies the routes** — `recoverAtBoot`
  does it before the server listens, and the boot line says how many it restored. That only
  helps for an app with a §6 `Route` record, and `pnpm test` truncates the table those live in,
  so after a *unit* run there is nothing to restore and the demo has to be deployed again. An
  app deployed before P4c has no record either, deliberately: there is no backfill, and it gets
  one at its next deploy.

Two smaller things P1's execution did not settle:

- ~~`make host-undo` has never been run end to end.~~ **Run and verified
  2026-09-05.** All three changes reversed cleanly — `/etc/resolver/manifest.internal`
  gone, no `127.0.0.2` on `lo0`, zero Caddy roots in the keychain — with Valet
  untouched and still serving, and the platform containers left running (they are
  `make down`'s job, not the host script's). It also exposed one defect: the script
  reported `Error 1` on a *successful* teardown, because its last command was a
  `grep -c` that exits 1 when it counts zero. Fixed — it now asserts each reversal
  and is idempotent. **The fix was then negative-controlled**, because a check that
  has only been seen passing is exactly what this execution kept finding: run
  against a host where all three changes *are* present, the assertions report
  `STILL PRESENT` three times and exit 1. Full cycle proven twice —
  `host-setup` → doctor 14/14 → `host-undo` → exit 0.
- **Valet's `.test` did not resolve during this session — diagnosed and fixed, and
  it was not a Manifest problem.** Valet's own dnsmasq had hung in `sendto` to an
  upstream nameserver; being single-threaded, that froze every lookup it served,
  `.test` included. Restarting it fixed it, with no configuration changed. The full
  diagnosis and the one-line fix are in `ORIENTATION.md` §4 under *Things that will
  cost you a morning*, because the symptom is deeply misleading: process alive,
  config correct, port open, nothing answers.
