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
are required, derived from the secrets in section 1.*

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
# `ssp_ro` reads, `manifest` writes, and there is no `manifest_app` in it.
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
the nonce in that browser's `manifest_login` cookie (`401 SAML_LOGIN_NOT_BOUND`).

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
   Rich's choice on 2026-09-28 — a more capable model, `openai/gpt-6-sol`, is a one-line REPOINT, never a fallback). Both are
   commented in `.env.example`, because `make doctor` reads every uncommented line there as a key every `.env` must have.
2. **`make up`, with the network ON** — LiteLLM reads its environment only when it is CREATED (`docker restart` keeps the old
   one), and `infra/compose.yaml` hands it `OPENAI_API_KEY` and hands the key to nothing else. Check with
   `docker exec manifest-litellm sh -c '[ -n "$OPENAI_API_KEY" ] && echo set'`, never by printing it. Online matters: `gpt-6-*`
   is priced only by the list LiteLLM fetches when it starts online, because the list bundled in 1.98.0 stops at gpt-5.6.
3. **Start (or restart) the control plane** as above. RUNBOOK's `set -a; . ./.env` exports both lines into it; it reads
   `MANIFEST_CAPABLE_MODEL` and **scrubs `OPENAI_API_KEY` at boot**, before any child process can inherit it. **Straight after it
   starts listening** it registers `default-chat-large` at `internal` through LiteLLM's admin API — never as an
   `infra/litellm/config.yaml` line, which the admin API could not remove — **pinned at the price LiteLLM itself reported**, so a
   later LiteLLM restart without the network cannot make it free. **Read the boot line's `capableModel`**: `registered`,
   `unchanged`, `removed`, `absent`, `disabled` (AI off), or `refused` / `failed`, each of the last two with ONE `[boot] the
   capable model (MANIFEST_CAPABLE_MODEL) …` line. **Then it sets the fallback** with LiteLLM's own `POST /fallback` — held in
   LiteLLM's database, measured to survive `docker restart manifest-litellm` and a repoint — and **the boot line's
   `capableFallback`** reads `set`, `unchanged`, `removed`, `absent`, `disabled`, or `refused` (with ONE `[boot] the capable
   model's fallback (MANIFEST_CAPABLE_MODEL_FALLBACK) …` line) or `failed` (with one, or under the capable model's own line when
   that step failed — the fallback is then not tried). The boot always goes on.
4. **Check it**: `curl -s http://127.0.0.1:7106/model/info -H "authorization: Bearer $LITELLM_MASTER_KEY"` — `default-chat-large`
   with `max_classification: internal` and a positive `input_cost_per_token` in BOTH `litellm_params` (pinned) and `model_info`.
   `startAgentSession` on an `internal` or `public` project lists it in `session.models`; a `confidential` project's lists it
   only while `MANIFEST_AGENT_BUILDER_MODELS` is `capable` (the default — *The building agent's models*, below).
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

### The building agent's models

*Added 2026-09-28 (the front-end enablement plan's Task 14a; §7, §10 and §26 as Spec action 10 amended them).* **`MANIFEST_AGENT_BUILDER_MODELS`
decides which models the agent that BUILDS a `confidential` app may call** — Rich: *"It's okay to use the larger models to BUILD the
app, but if the app needs AI, then we should switch to use the on-prem model for the AI within the created app"*, and *"make this a
setting"*. **`capable`, the default**: a `confidential` project's agent session lists the on-premise models AND `default-chat-large`
(when it is registered). **`on-premise`**: the on-premise models alone. Nothing else is accepted — the boot refuses a mistyped or
empty value rather than guess. **The app's own `ai.models` is validated by D17 whatever this says**, so a `confidential` app's own AI
stays on-premise either way. It is a platform setting (§26): put the line in `.env` and restart the control plane.

**A session never holds more than its project now allows** (FE-36; since the launch path plan's Task 7, Spec action 1, it is
NARROWED IN PLACE). Every valid `manifest.yaml` the platform records — a commit through the API, a push, a validation — and every
PRODUCTION deploy, the rehearsal's included (the release production serves floors the classification; the review's I2), is followed
by a check of the project's ACTIVE agent sessions, and every session whose key names a model the project no longer allows is
narrowed: its key's models cut at LiteLLM by `/key/update` on its alias, so the SAME key is refused the withdrawn models at once
(`403 key_model_access_denied`) and still answers the rest; then its row's `models`, and `agent_session.narrowed` published. Raising a
project from `internal` to `confidential` narrows the sessions started before it to the on-premise models (and the capable model
while the setting is `capable`). **Only a session left with nothing it may use is ended** — its key revoked, `agent_session.ended`
with reason **`models_withdrawn`**. **Every boot** runs the same check over every project — which is how `on-premise` reaches the
sessions a `capable` platform started, and how a check that failed at a commit is finished. **Read the boot line's
`agentBuilderModels`** (the setting in force) **and `agentSessionsWithdrawn`**: `{"ended":n,"narrowed":k,"failed":m}`, `disabled`
(AI off), or `failed` (with ONE `[boot] the agent sessions could not be checked …` line). A session that could not be narrowed or
ended is named in an operator line with what its key may still hold, and stays live until it expires or the next check — a commit, a
production deploy, a rehearsal or a boot — finishes it; a commit is never refused for it.

**The safeguard, while the setting is `capable`**: `listIncidents` for a `confidential` project's STAGING or PRODUCTION environment,
asked with a delegated TOKEN, is refused **`403 INCIDENT_LOG_CONFIDENTIAL`** before anything is read — an Incident's log tail can
carry the input of the people the classification protects, and redaction does not remove names or student numbers. A person's
session still reads it, and every token reads the sandbox's. Under `on-premise` a token reads them as before.

## The four verbs

| | |
|---|---|
| `make seed` | The only step that needs network. Pulls and **pushes** base images into the local registry, warms the npm mirror, mints the CA, pulls the Ollama models — and builds every platform image **including the GitHub fake's** (`--profile github build`; its `apk add git` is why it cannot be built offline). |
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
required to run the platform" — one process, not nine containers plus a language model.*

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
| `MANIFEST_MOCK_CONFIDENTIAL` | unset | `1`: `mock-app`'s data is `confidential` and its building agent may use the capable model — a TOKEN is refused staging's and production's Incidents, `403 INCIDENT_LOG_CONFIDENTIAL` (a session and the sandbox are answered), and every agent session holds `default-chat-onprem`, `default-chat-onprem-reasoning` and `default-chat-large` |
| `MANIFEST_MOCK_INTAKE` | `open` | `daily-limit` or `budget-spent`: describing a new app is paused — `409 INTAKE_DAILY_LIMIT_REACHED` or `INTAKE_BUDGET_EXHAUSTED` |
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

Removing the mirrored base image must make the build **fail**:

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
and the current numbers are **`make doctor` 20 / 0 and `make verify` 62 / 0**
(**All four were re-measured on 2026-09-30 at the close of the launch path plan's sitting 4a (Task 6b — FE-42's `launch:rehearse`), and one moved: `pnpm test` **2908 passed** in **184** files, twice on the final tree (was 2894; 722 s and 711 s alone, 0 `deadlock detected` in either); `pnpm test:docker` **268 in 42**, unchanged (266 measured, 1210 s, and the same two reds for Docker's exhausted address pools from a start of 26 networks, both 40 of 40 alone after `scripts/dead-app-resources.sh --apply` — TRAPS.md); `make doctor` 20 with **0 failed and 0 warnings** — the vulnerability database goes stale after 2026-10-06; refresh it with `make refresh-vulndb` — and `make verify` **62**.** This parenthetical states only the LATEST sitting — it had grown to 6 KB of per-sitting history before sitting 8 replaced it, and every sitting's numbers are in its own plan record, dated.) ORIENTATION §2's box is the maintained copy of those; if this
line disagrees with it, that box wins. **The offline acceptance has not been
re-run since 2026-09-05**, and P4a Task 15 owes it: it is Rich's to run, because
disabling Wi-Fi cuts an agent off too. **It now has FIFTEEN steps, 1 to 15, after step 0's offline check** (the front-end enablement plan's Task 15 added step 15, `make demo-frontend`, and the authoring API plan's Task 13 step 14, `make demo-authoring` — both run on either driver; this line said FOURTEEN until the launch path plan's sitting 2's sweep) — P5a sitting 12 added `make demo-journey` as step 8,
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
7. **The instructor revokes the token** and the agent's next call is `401 UNAUTHENTICATED` — while the token
   still reads `expired: false`, because a clock and a person are different answers to why a credential stopped.

**Every check prints `ok` or `FAIL` and the run exits 1 listing each failure**, so a red run is a measurement
rather than the first thing that broke. It prints, on the green path, the token's capability count and expiry,
how long the build took, how long the question waited for a human, and each retry's status — a green
`checks.ok` prints no detail, so the numbers a filed run is evidence for would otherwise be thrown away.

**THE ONE PRECONDITION, and why the script signs a second person in.** Step 6 has the agent ask to add
`stu000001`, and `POST /v1/projects/{id}/members` refuses `400 MEMBER_USER_NOT_FOUND` for anybody who has never
signed in — `pnpm test` and `make reset` both empty `users`. So `scripts/demo-token.sh` signs the student in
and throws the session away; all it needs is the row. Without it the **confirmed retry** answers `400`, which
reads as a defect in D24's grant rather than as a missing sign-in.

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
| 1 | the instructor signs in ON `app` (`idp_login … /auth/login`, the ACS `https://app.manifest.internal/auth/saml/callback`) | the jar's `manifest_session` is `app.manifest.internal`'s alone; **the control**: `createProject` with that cookie and `Origin: https://console.manifest.internal` → `403 CSRF_ORIGIN_REFUSED`, and the project list unchanged; both slugs' orphan repositories cleared |
| 2 | the instructor, in the session: an intake key started and ended; `frontend-<driver>` created as *"Week 3 — reading responses"* and renamed *"Reading responses"*; `frontend-scratch-<driver>` (`fixture-node@1`) created; the server's token minted | the gateway lists the intake model for the key, then answers it `401 token_not_found_in_db`; `project.renamed` on the stream, `from`/`to` and `via: session`; the token holds exactly `project:read`, `source:write`, `secret:write`, `build:create`, `release:create`, `release:deploy`, `output:read`, `agent:session`, for a day |
| 3 | the server, on the token: the confidential `manifest.yaml`; `getAgentBudget`; `startAgentSession`; one real completion through `baseUrl` | the commit's sensitive diff names `data.classification`; the budget is the minter's; `201`, an `sk-` key, `via` the token; **no `default-chat`, and `default-chat-onprem`**; the same `Idempotency-Key` again → `409 AGENT_SESSION_ALREADY_STARTED` with no `sk-` in the body; the completion `200` with an answer; `listAgentSessions` active, and its `spentUsd` above zero within 45 s |
| 4 | the agent commits `server.js` as text and `logo.png` — a 1×1 PNG the demo MAKES — as bytes: a dry run, then the commit | the dry run no commit, `logo.png added, server.js modified`, `main` unmoved; then `201` with the same two; `server.js` as base64 → `400 REQUEST_INVALID` saying it *is text; send it with encoding: 'utf8'*; an ELF header as `logo2.png` → `400 REQUEST_INVALID` saying it *is not a kind the API writes* (each rule's own words, because all three binary rules answer the same code); **a PDF with an AWS-key-shaped value made at run time** → `409 SOURCE_SECRET_DETECTED` naming `syllabus.pdf:` and never the value, and `repository.secret_refused` naming it; `main` still the app's commit; `getTree` marks `logo.png` binary; `getFile?encoding=base64` the same bytes |
| 5 | the server builds that commit, releases it, deploys it to **staging and the sandbox**; the STUDENT signs in inside the staging app and posts a response | the release froze `confidential`; both `healthy`; the app's `/api/me` is *Test Student* (**F1's guard**: without `express.urlencoded` nobody signs in); the post `303` to `/`; the page lists it under *Test Student*; `/logo.png` the committed bytes as `image/png` |
| 6 | bash requests the SANDBOX page with the run's id; the server reads that instance's output | `listInstances` names step 5's sandbox instance as serving; `getInstanceOutput` holds the marker line for this run's request, with **`[REDACTED]` in its `mongo` field, where the app printed its own `MONGODB_URI`**, and no line holding the password; **staging's output is `403 INSTANCE_OUTPUT_STAGING`** (recent output is the sandbox's, FE-24); production's refusal is the unit tier's; the token's staging `listIncidents` → `403 INCIDENT_LOG_CONFIDENTIAL`, its sandbox's and the person's staging `200` |
| 7 | the instructor steps up ON `app`; the student signs in to MANIFEST on `app` (so the platform knows the login); `addMember { cwlLogin: 'student' }` | without the step-up `403 STEP_UP_REQUIRED`; stepped up `201`, `cwlLogin: student`, a collaborator; `member.added` whose `memberId` is the student and `userId` the instructor; `nobody` → `400 MEMBER_USER_NOT_FOUND` |
| 8 | archive (stepped up); then restore, a NEW token for the server, the same release deployed again, and a new model session | the key answered before (`200`, listing the session's model), then `401 token_not_found_in_db`; the token `401 UNAUTHENTICATED`; the instructor's `startBuild` `409 PROJECT_ARCHIVED`; step 3's session `ended`, `project_archived`; **both names `410`** with *This app has been switched off by its owner.*; after the restore the old token stays `401`, the redeploy is `healthy`, and **the page shows the response the student posted before the archive** |
| 9 | the scratch project is built, deployed to its sandbox, then deleted (stepped up); then a NEW project is created with its slug | its repository THERE before the delete (driver 1: `.manifest/repos/<slug>.git`; driver 2: the fake's `200` naming it, and the mirror) — so "gone" afterwards is a change seen, not an empty path; its sandbox name answered *fixture-app in sandbox*, and afterwards the edge's wildcard; `checkSlug` available; `getProject` `404 NOT_FOUND`; its repository gone (driver 1: no directory; driver 2: the fake's `404` *Not Found*, and no mirror); **then `createProject` with the same slug `201`, a new id** — the only check that meets the partial unique index (`checkSlug` reads its own copy of the predicate) — and its repository there again. **When `launch-app` has launched** (`make demo-production`), `deleteProject` on it → `409 PROJECT_LAUNCHED_NOT_DELETABLE`, still `active` — the one call to a project the demo did not create, and read-only; otherwise it says why it did not ask. **That branch has never run on this machine**: on 2026-09-29 `launch-app` did not exist here (the tables had been truncated), so all three runs printed that it was not asked |
| 10 | the server ends its session; the instructor revokes its token | `ended`/`ended`; the key `401 token_not_found_in_db`; the token `401 UNAUTHENTICATED`; `listAgentSessions` holds the session just ended, as `ended`, and no session of the project is active |

**It stops at the first red phase** (each phase prints every check first). **The re-use path** starts the app again from the
project's first commit — one commit — so every run commits the same two changes, removes and re-adds the student, and renames
the project back first; its step 2 finds the scratch project the last run's step 9 created again, and its step 9 deletes it.
**A green, FULL run leaves** `frontend-<driver>` running in staging with the student's responses (its sandbox switched off
until the next deploy — the restore redeploys staging only), the student a collaborator, and no session or token of its own
live; a new `frontend-scratch-<driver>`, never deployed, beside the deleted one's tombstone; and a `mf-person-` user at
LiteLLM, which `scripts/litellm-orphans.sh` reclaims. **A `DEMO_FRONTEND_STOP_AFTER` run, or a red one, leaves more live**:
step 3's model session (its key, for up to its 60 minutes) and step 2's token (for its day) — and after step 8, the second
token and session. The next FULL run's archive ends every session and revokes every token of the project, and its step 10
ends and revokes its own. **What it does not cover:** production (a token cannot reach it by
design, and nothing here launches), the capable model, and the CLICKED half — the reference console served on `app`
(*Serving the reference console on the front-end's origin*, above) and a person clicking the same journey.

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
then `make demo-github`, and then, on EITHER driver, `make demo-authoring` and `make demo-frontend`. *(This line named
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
just filled, and which step made the machine what it is would be hidden.

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
| The OFFLINE acceptance | `scripts/offline-acceptance.sh`, run by hand with the network off — its steps are numbered **0 to 15**, where 0 is the precondition (it read *0 to 13* after the authoring API plan added step 14; the front-end enablement plan's Task 15 added step 15, `make demo-frontend`). It is the only thing that runs `make demo-identity` and `make demo-ai` |
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
record both answers on its **Launch records** tab, press **Run the rehearsal** on the checklist,
follow **Review this release**, press **Approve** — and follow **Confirm it is you, then try
again** when it is refused — then **Deploy to production**. Every step below is what those
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
3. **Run the rehearsal.** `POST /v1/projects/{id}/rehearsal` — ~6 s. It deploys the candidate to
   the production hostname, registers its Service Provider with production values, completes a
   real CWL sign-in and answers `200` with the evidence. **`passed: false` is a `200`** — a
   measurement that came out badly is not a request error, and `evidence.reason` says which hop
   failed.
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
The rehearsal is the one production deploy pointed at the Manifest IdP.

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
removed** (`409 PROJECT_LAST_OWNER`). It was written after D24's rule was made central and does nothing
about tokens: an agent asking is answered `403 TOKEN_ACTION_PENDING` anyway, which is the whole claim of
that rule and is what its test measures.

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

- **It needs a WebSocket client and a credential.** `curl` cannot speak it: a plain GET from a member answers `426 Upgrade Required` with `Upgrade: websocket`, a stranger `404`, nobody `401` — which is also the quick way to check the route is up. The credential is either the `manifest_session` cookie a CWL login sets **or, since P5b Task 5, an agent's `Authorization: Bearer <token>`** — the stream reads whichever the one request hook resolved, so a delegated token scoped to the project opens it with the `project:read` it was minted with.
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
