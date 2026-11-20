# A standalone LiteLLM on this Mac — short design

**Status:** APPROVED by Rich 2026-11-20 (*"I approve the design as written"*, with the version changed to the newest release and local models only confirmed). Built in `~/Developer/litellm`.
**Scope:** task 1 of 2. Task 2 — pointing Manifest at this service — is a separate design, not started.

## Intent

Rich needs LiteLLM locally for a second project. Today the only LiteLLM on this Mac is
Manifest's own (`manifest-litellm`, `infra/compose.yaml:215`), wired into Manifest's
Postgres, `.env` and Docker networks. This design lifts the *way Manifest runs it* into
an independent service in `~/Developer/litellm` that any project on this Mac can use,
and that Manifest can later adopt.

**Done means:** Rich opens `https://litellm.local/ui` in a browser, gets no certificate
warning, logs in, and a chat completion through the service is answered by a local
Ollama model.

## Goals, non-goals, anti-goals

- **Goals:** runs independently of Manifest (Manifest down, this up, and the reverse);
  survives a reboot; one command up, one down; every host change reversible.
- **Non-goals (this task):** changing anything in Manifest; Manifest's fallback guard,
  synthetic costs or classification levels; offline image mirroring.
- **Anti-goals:** touching Laravel Valet (its nginx on `127.0.0.1:80/443`, its dnsmasq,
  `/etc/resolver/test`); disturbing `manifest-litellm`, port 7106 or Manifest's
  `litellm` database; copying any secret out of Manifest's `.env`.

## What Manifest does today (the thing being lifted)

| Piece | Manifest | Carried over? |
|---|---|---|
| Image | `ghcr.io/berriai/litellm@sha256:32cfd7a4…` (1.102.0) | No — 1.110.2, the newest (Rich) |
| Database | `litellm` database in the shared `postgres:16-alpine` | Own Postgres, same image |
| Catalogue | `STORE_MODEL_IN_DB=True`, bootstrap entries in `config.yaml` | Yes |
| Ollama | host app, reached as `host.docker.internal:11434` | Yes |
| `think: false` on the qwen chat models | load-bearing (empty answers without it) | Yes |
| `store_prompts_in_spend_logs: false`, explicit | load-bearing | Yes |
| No `--detailed_debug` | it logs prompt text | Yes |
| `manifest_guard.py`, synthetic costs, `max_classification` | Manifest-specific | **No** — task 2 |
| Hostname and TLS | none (port 7106; container name for apps) | New here |

## Approaches considered

1. **Own compose stack, own loopback alias, Caddy for TLS — chosen.** Three containers
   in a compose project named `litellm`. Caddy binds `127.0.0.4:443`; Valet keeps
   `127.0.0.1`. The pattern is Manifest's edge on `127.0.0.2`, already proven on this Mac.
2. **Valet proxy** (`valet proxy litellm …`). Rejected: it yields `litellm.test`, not
   `litellm.local`, and it changes Valet, which this machine's rules forbid.
3. **LiteLLM as a host process** (`pip install litellm[proxy]`). Rejected: a different
   runtime from Manifest's and UBC's container, a Python and Prisma install to maintain,
   and still needs something on 443.

## The design

**Files in `~/Developer/litellm`** (its own git repository, nothing pushed):

```
compose.yaml          litellm, postgres, caddy
config.yaml           bootstrap models + general settings
Caddyfile             litellm.local → litellm:4000
.env.example          every setting, documented; .env is git-ignored
certs/                mkcert output, git-ignored
host/setup.sh         the privileged steps (Rich runs with sudo)
host/undo.sh          reverses them exactly
Makefile              up, down, logs, doctor, certs
README.md             what it is, how to run it, how to point a project at it
```

**Containers**

- `litellm` — 1.110.2 by tag and digest; `DATABASE_URL` to the stack's own Postgres; master and
  salt keys from `.env`; `UI_USERNAME`/`UI_PASSWORD` for the `/ui` login;
  `extra_hosts: host.docker.internal:host-gateway`; published on `127.0.0.1:4000` for
  plain-HTTP API use by host processes.
- `litellm-postgres` — `postgres:16-alpine`, a named volume, no published port.
- `litellm-caddy` — stock `caddy:2.11.9` (no plugins), publishes `127.0.0.4:443` and
  `127.0.0.4:80` (redirect), serves the mkcert certificate from `certs/`.
- All `restart: unless-stopped`, so they return with Docker Desktop after a reboot.

**Name, address, certificate**

- `127.0.0.4` as an `lo0` alias. Aliases are lost at reboot, so `host/setup.sh` installs
  a LaunchDaemon (`local.litellm.loopback`) that re-adds it at boot.
- `/etc/hosts`: `127.0.0.4 litellm.local`, in a marked block so undo removes only it.
  `/etc/hosts` is used rather than a resolver file because it is one name. `.local` is
  also the mDNS domain; `/etc/hosts` is consulted first, and the build measures lookup
  time rather than assuming it is instant.
- Certificate from the existing mkcert CA (`~/Library/Application Support/mkcert`,
  already trusted in the System keychain) — `mkcert litellm.local`, run as Rich, no
  sudo, no new trust prompt.

**Configuration**

- `config.yaml` bootstraps `default-chat` (`ollama_chat/qwen3.5:4b`, `think: false`)
  and `default-embed` (`ollama/nomic-embed-text`) — both already pulled. Anything else
  is added through the UI and lives in the database.
- `.env` is generated fresh: new master key, salt key, Postgres password and UI
  password. Provider keys (`OPENAI_API_KEY`, `UBC_AI_GATEWAY_API_KEY`) are commented
  lines Rich fills in if the other project needs them.
- **The salt key cannot change after first start** — it encrypts stored provider keys.
  The README says so.

**The privileged step** — one script, `! sudo bash ~/Developer/litellm/host/setup.sh`:
the alias, the LaunchDaemon, the hosts block. `host/undo.sh` removes all three. A
snapshot of `/etc/hosts` and `ifconfig lo0` is taken before.

**Verification (`make doctor`, and by hand)**

1. `curl https://litellm.local/health/liveliness` answers 200 with a verified certificate.
2. A chat completion on `default-chat` with the master key returns non-empty content;
   an embedding on `default-embed` returns 768 numbers.
3. A UI login succeeds — checked in a browser, and by Rich.
4. Negative controls: a wrong key is refused 401; with Caddy stopped the name does not
   answer; `manifest-litellm` and Valet's nginx still answer exactly as before.
5. Reboot survival is Rich's to confirm at his next restart; the LaunchDaemon is
   exercised without a reboot by removing the alias and kickstarting it.

## Calls I made (correct any of them)

- **LiteLLM 1.110.2, the newest release** (Rich, 2026-11-20: *"let's update LiteLLM to the most
  recent"*) — `v1.110.2@sha256:ef798594…`, which `main-stable` and `latest` also resolved to that
  day. Manifest stays on 1.102.0, so task 2 is also a version move: its measured behaviours
  (the fallback guard, the error mapping, stream usage) need re-measuring on 1.110.2.
- **Starter models are local Ollama only**; provider keys optional. Rich had not said
  what the second project needs.
- **Port 4000 on `127.0.0.1`** as well as the HTTPS name, for scripts and SDKs that do
  not want TLS.
- **`127.0.0.4`**: Manifest holds `127.0.0.2` (its edge) and `127.0.0.3` (its public
  edge, `infra/lib/common.sh:17`), so this is the next free loopback address.
- **Own git repository** in `~/Developer/litellm`, committed locally, nothing pushed.

## Left for task 2 (named so it is not forgotten)

- Manifest's apps reach LiteLLM by the container name `manifest-litellm` on per-app
  Docker networks (`runtime/docker/networks.ts:38`, `egress.ts:11`) — the standalone
  would need attaching to those, or a new name threaded through.
- `manifest_guard.py` is a file mount beside the config; the standalone needs an opt-in
  way to load it.
- Synthetic costs and `max_classification` on the bootstrap models; the control plane's
  boot-time registration of `default-chat-large`; `scripts/litellm-orphans.sh`,
  `make verify` and the Docker tier, all of which name `manifest-litellm` or 7106.
- Migrating or abandoning the existing `litellm` database's keys, users and spend.
