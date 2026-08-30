# P1 — Local Substrate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn §21's platform inventory into running infrastructure that a new developer reaches from a clean checkout with `make seed && make up && make doctor`, offline after seeding, serving a placeholder over trusted HTTPS at a `manifest.internal` name that resolves **identically from the host browser and from inside a container**.

**Architecture:** A `Makefile` fronting one Docker Compose project plus a small set of POSIX shell scripts under `infra/` and `scripts/`. Compose owns the containers, their networks and their static addresses; the Makefile owns ordering, the three host-side steps that need `sudo`, and the seed cache. Two scripts carry the plan's whole test story: **`make doctor`** asserts *preconditions* (can this machine run the platform?) and **`make verify`** asserts *properties* (is the running platform correct?). Every task adds checks to one of them, and every task's TDD cycle is: add the failing check, watch it fail, implement, watch it pass.

**Tech Stack:** GNU Make, Docker Compose v2, Docker Engine 29.x, **bash 3.2** (what macOS ships — see Global Constraints), dnsmasq 2.91 on Alpine, a custom `xcaddy` build of Caddy 2.11.4, Postgres 16, `registry:2`, Verdaccio 6, tinyproxy, rootless BuildKit v0.32.2, LiteLLM 1.98.0, SimpleSAMLphp 2.x, and Ollama as a host application.

**Spec:** [`docs/superpowers/specs/2026-08-29-manifest-platform-design.md`](../specs/2026-08-29-manifest-platform-design.md) — §21 in full, §12 (DNS, egress, east-west, hardening, the builder, supply chain), §20 (the edge as a control point), §23 (the three platform zones), and **C1** in §3.

**Roadmap:** [`2026-08-29-plan-roadmap.md`](./2026-08-29-plan-roadmap.md) — P1's scope and why it is its own plan.

**Findings this plan is built from.** P1 has no research left in it; every value below was measured. Read these before starting, not while stuck:

| Spike | What it settles for P1 |
|---|---|
| [`S7-findings.md`](../spikes/S7-findings.md) | The whole DNS design, the edge, TLS trust in three places, the `127.0.0.2` alias, the custom Caddy build, and the `make doctor` check list. **Tasks 2–5 are S7 written as code.** |
| [`S1-findings.md`](../spikes/S1-findings.md) | The rootless builder, the dual-homed registry, and why `make seed` must *push* base images into the local registry rather than merely pull them. **Tasks 7, 8 and 11.** |
| [`S3-findings.md`](../spikes/S3-findings.md) | The LiteLLM configuration, its two mandatory settings, and the non-thinking-model requirement. **Task 9.** |
| [`S2-findings.md`](../spikes/S2-findings.md) | The IdP image needs `pdo_pgsql` and `libpq-dev`, and reads its connection details from the global `database.*` block. **Task 10.** |

---

## Decisions this plan makes, and why

Three questions were open when this plan was written. Each is settled here with a reason, because a plan that defers them is a plan that cannot be executed.

**1. `make up` re-adds the `127.0.0.2` alias itself, with `sudo`.** The alias does not survive a reboot (S7), and Caddy cannot bind 80/443 without it. Three options were live: `sudo` inside `make up`; a launchd daemon installed by `make seed`; or detect-and-instruct. **This plan chooses `sudo` inside `make up`**, guarded by a check so it prompts only when the alias is actually missing — typically once per reboot, often less. The launchd option removes the last prompt but leaves a root-owned persistent service on every developer's Mac that `make reset` would not remove, which contradicts the reversibility every spike has held to. Detect-and-instruct is a standing C1 defect for no gain. **If Rich prefers the launchd route later it is an additive change to Task 4 only** — `infra/host/` gains a plist and an uninstall target; nothing else in this plan moves.

**2. `make up` brings up the whole §21 inventory, including LiteLLM and the Manifest IdP.** The roadmap's P1 sketch lists six services and omits those two, but §21's inventory has both, and S2 and S3 have already proven both configurations. Leaving them out would mean `make up` does not mean "the platform is running" until 1b, and P4 would carry infrastructure work on top of application work. **P1 ships the containers; P4 writes the clients.** The cost is roughly 400 MB of the ~3 GB platform budget §21 already allows.

**3. `make doctor` and `make verify` are separate, and both are deliverables.** `doctor` answers *"can this machine run the platform?"* and must work with nothing running. `verify` answers *"is the running platform correct?"* and asserts the properties the spikes established — parity, trust, isolation, egress denial. Merging them would make the reproducibility tool depend on the thing it is meant to diagnose. Every task adds to one or the other, which is what gives this plan its test cycle.

---

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from the spec or from a findings note.

- **macOS ships bash 3.2 and a BSD userland.** No associative arrays, no `${var,,}`, no `mapfile`. No GNU-only flags: `xargs -r`, `sed -i` without an argument, `date -d`, `readlink -f`. BSD `xargs` already skips empty input, so `-r` is unnecessary as well as unportable. A script that works only under Homebrew bash 5 or GNU coreutils is a C1 defect on a clean machine.
- **The zone is `*.manifest.internal`.** Never `*.manifest.test` — Laravel Valet owns that TLD, port 53 and ports 80/443 on this machine and on other UBC developers' machines (S7).
- **`/etc/resolver/manifest.internal`, never `/etc/resolver/internal`.** Docker's `host.docker.internal` and `gateway.docker.internal` live in `.internal` and must keep resolving (§12).
- **Everything binds `127.0.0.1` explicitly.** Never `localhost`, never `::1` — S1 lost time to `docker push localhost:7107/…` resolving to `::1` and timing out (§12).
- **Ports:** the platform uses **7100–7199** only. Caddy is the sole exception, on 80/443 of the `127.0.0.2` alias, with its admin API on `127.0.0.1:7119`.
- **Never touch Laravel Valet.** Not `/etc/resolver/test`, not its dnsmasq, not its nginx, not port 53. `make doctor` *reports* what owns port 53; it never assumes it is free.
- **Every host change is reversible and scripted.** Whatever `infra/host/host-setup.sh` does, `infra/host/host-undo.sh` undoes — and it must work even if the CA file has already been deleted (S7 shipped a version that did not).
- **Container naming:** long-running platform containers are `manifest-<service>`; per-app containers, networks and volumes created later by the driver use the `mf-` prefix (S1). Nothing in this plan may name or remove anything outside those two prefixes.
- **Base images are pinned by digest, not tag** (§12). `infra/images.txt` holds tags; `make seed` resolves them and writes `infra/images.lock`; `make doctor` compares.
- **`--privileged` is forbidden** on every container this plan creates, including the builder (§12, S1).
- **The Caddy version is not free to choose.** `coraza-caddy/v2@v2.6.0` *requires* `caddy/v2@v2.11.4` and xcaddy refuses any other. Bumping one means bumping both (S7, §20).
- **Docker VM memory floor is 8,000,000,000 bytes decimal.** State the unit in every message: this machine reports 8.32 GB decimal and 7.75 GiB binary, and passes or fails depending on the reading (§21).
- **`make reset` never destroys the Caddy data volume.** The internal CA lives there; regenerating it invalidates the root the developer trusted in their keychain and turns a reset into a re-trust. Reset destroys project volumes and registry contents; it keeps the seed cache and the CA.
- **Commit after every task.** Conventional commit messages (`feat:`, `chore:`, `test:`).

**What P1 does not create.** The repository is documentation-only today. P1 adds `Makefile`, `infra/`, `scripts/` and `.env.example` — and nothing else. `package.json`, `pnpm-workspace.yaml` and `packages/` belong to **P2 Task 1** and must not appear here; P1 executes first and the two plans must not collide.

---

## File Structure

```
manifest/
├── Makefile                                 the whole developer interface
├── .env.example                             copied to .env by `make seed`
├── .gitignore                               .env, infra/ca/, infra/seed-cache/
├── infra/
│   ├── compose.yaml                         the nine long-running containers
│   ├── images.txt                           base-image TAGS, one per line
│   ├── images.lock                          tag → digest, written by `make seed`
│   ├── models.txt                           Ollama models `make seed` pulls
│   ├── caddy/
│   │   ├── Dockerfile                       the xcaddy build (§20) — the one image built, not pulled
│   │   └── Caddyfile                        §23's three zones + the admin API
│   ├── dnsmasq/
│   │   └── Dockerfile                       alpine + dnsmasq + bind-tools
│   ├── postgres/
│   │   └── initdb/10-databases.sql          the three databases (§21)
│   ├── litellm/
│   │   └── config.yaml                      logical model names, synthetic costs (S3)
│   ├── idp/
│   │   ├── Dockerfile                       SimpleSAMLphp + pdo_pgsql (S2)
│   │   └── config/                          config.php, authsources.php
│   ├── verdaccio/
│   │   └── config.yaml                      uplink + storage
│   ├── egress/
│   │   └── tinyproxy.conf                   default-deny allowlist (§12)
│   ├── buildkit/
│   │   └── buildkitd.toml                   [dns] + insecure local registry (S1)
│   ├── host/
│   │   ├── resolver-manifest.internal       → /etc/resolver/manifest.internal
│   │   ├── host-setup.sh                    the three sudo steps
│   │   └── host-undo.sh                     reverses all three
│   ├── seed/
│   │   ├── seed.sh                          the only step needing network
│   │   └── mirror-images.sh                 pull → retag → push to local registry (S1)
│   └── lib/
│       └── common.sh                        shared constants: zone, IPs, ports, names
└── scripts/
    ├── doctor.sh                            preconditions — runs with nothing up
    ├── verify.sh                            properties — runs against a live stack
    └── lib/
        └── check.sh                         the check harness both use
```

**Network layout**, fixed here so every task agrees. The addresses are S7's, verified:

| Name | Subnet / address | Holds |
|---|---|---|
| `manifest-platform` | `10.89.0.0/24`, gateway `10.89.0.1` | everything long-running |
| Caddy | `10.89.0.10` | the edge |
| dnsmasq (containers) | `10.89.0.53` | answers the zone as `10.89.0.10` |
| dnsmasq (host) | `10.89.0.54`, published `127.0.0.1:7153` udp **and** tcp | answers the zone as `127.0.0.2` |
| `manifest-build-internal` | `--internal` | the builder **only** — registry and mirror are dual-homed (S1) |

**Published ports**, all on `127.0.0.1` unless stated:

| Port | Service |
|---|---|
| 7103 | Postgres |
| 7106 | LiteLLM |
| 7107 | registry |
| 7108 | Verdaccio |
| 7109 | egress proxy |
| 7119 | Caddy admin API |
| 7122 | Manifest IdP |
| 7153 | dnsmasq (host view), udp + tcp |
| 80, 443 | Caddy, on **`127.0.0.2`** |

---

## Task 1: The repo skeleton, the Makefile spine, and the check harness

**Files:**
- Create: `Makefile`, `.gitignore`, `.env.example`
- Create: `infra/lib/common.sh`
- Create: `scripts/lib/check.sh`
- Create: `scripts/doctor.sh`
- Test: `scripts/doctor.sh` is itself the test — Step 2 proves it fails, Step 6 proves it passes

**Interfaces:**
- Consumes: nothing.
- Produces: `check <label> <command…>`, `check_warn`, `require_cmd`, `summary` from `scripts/lib/check.sh`; and the shell constants every later task uses — `ZONE`, `NET`, `CADDY_IP`, `DNS_C_IP`, `DNS_H_IP`, `EDGE_IP`, `PORT_*`, `COMPOSE` — from `infra/lib/common.sh`. Tasks 2–13 add checks by calling `check`; none of them redefine these constants.

**Why the harness comes first.** Every remaining task is "make an infrastructure fact true", and the only way to run that test-first is to have somewhere to write the assertion before the thing exists. `check` is that place. It is deliberately tiny — a label, a command, a pass/fail line, and a non-zero exit if anything failed — because a test harness that needs its own debugging is worse than none.

- [ ] **Step 1: Write the check harness**

`scripts/lib/check.sh`:

```bash
#!/usr/bin/env bash
# Shared pass/fail harness for doctor.sh and verify.sh. bash 3.2 compatible.
CHECKS_RUN=0; CHECKS_FAILED=0; CHECKS_WARNED=0

_green() { printf '\033[32m%s\033[0m' "$1"; }
_red()   { printf '\033[31m%s\033[0m' "$1"; }
_amber() { printf '\033[33m%s\033[0m' "$1"; }

# check <label> <command...>   — fails the run
check() {
  local label="$1"; shift
  CHECKS_RUN=$((CHECKS_RUN + 1))
  local out
  if out=$("$@" 2>&1); then
    printf '  %s  %s\n' "$(_green 'PASS')" "$label"
    [ -n "$out" ] && printf '          %s\n' "$out"
    return 0
  else
    CHECKS_FAILED=$((CHECKS_FAILED + 1))
    printf '  %s  %s\n' "$(_red 'FAIL')" "$label"
    [ -n "$out" ] && printf '          %s\n' "$out"
    return 1
  fi
}

# check_warn <label> <command...> — reports, never fails the run
check_warn() {
  local label="$1"; shift
  CHECKS_RUN=$((CHECKS_RUN + 1))
  local out
  if out=$("$@" 2>&1); then
    printf '  %s  %s\n' "$(_green 'PASS')" "$label"
  else
    CHECKS_WARNED=$((CHECKS_WARNED + 1))
    printf '  %s  %s\n' "$(_amber 'WARN')" "$label"
  fi
  [ -n "$out" ] && printf '          %s\n' "$out"
  return 0
}

# report <label> <command...> — informational only, always passes, always prints
report() {
  local label="$1"; shift
  printf '  %s  %s\n' "$(_amber 'INFO')" "$label"
  printf '          %s\n' "$("$@" 2>&1 | tr '\n' ' ')"
}

require_cmd() { command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1"; return 1; }; }

summary() {
  printf '\n  %d checks, %d failed, %d warnings\n' \
    "$CHECKS_RUN" "$CHECKS_FAILED" "$CHECKS_WARNED"
  [ "$CHECKS_FAILED" -eq 0 ]
}
```

- [ ] **Step 2: Write the shared constants**

`doctor.sh` sources these in the next step, so they exist first.

`infra/lib/common.sh`:

```bash
#!/usr/bin/env bash
# Constants every script and the Makefile share. Sourced, never executed.
# Values are S7's, verified.

ZONE="manifest.internal"
NET="manifest-platform"
NET_BUILD="manifest-build-internal"

CADDY_IP="10.89.0.10"     # the edge, on the platform network
DNS_C_IP="10.89.0.53"     # dnsmasq answering CONTAINERS
DNS_H_IP="10.89.0.54"     # dnsmasq answering the HOST
EDGE_IP="127.0.0.2"       # the lo0 alias Caddy binds, so Valet keeps 127.0.0.1

PORT_CONTROL_PLANE=7100
PORT_POSTGRES=7103
PORT_LITELLM=7106
PORT_REGISTRY=7107
PORT_VERDACCIO=7108
PORT_EGRESS=7109
PORT_CADDY_ADMIN=7119
PORT_IDP=7122
PORT_DNS=7153

# The whole reserved block, checked by doctor.
PORT_BLOCK_START=7100
PORT_BLOCK_END=7199

# Docker VM memory floor, DECIMAL bytes. State the unit or the check is ambiguous:
# the author's machine reports 8.32 GB decimal and 7.75 GiB binary (§21).
VM_MEMORY_FLOOR_BYTES=8000000000
DISK_FLOOR_GB=40

CA_FILE="infra/ca/manifest-root.crt"
COMPOSE="docker compose -f infra/compose.yaml -p manifest"
```

- [ ] **Step 3: Write `doctor.sh` with one check that cannot pass yet, and run it**

`scripts/doctor.sh`:

```bash
#!/usr/bin/env bash
# make doctor — CAN THIS MACHINE RUN THE PLATFORM? Runs with nothing up.
# Every check here failed or nearly failed during S7, S1 or S3. None is hypothetical.
set -uo pipefail
cd "$(dirname "$0")/.."
. scripts/lib/check.sh
. infra/lib/common.sh

echo "manifest doctor — $(date)"
echo
echo "Host"
report "architecture"        uname -m
report "macOS"               sw_vers -productVersion

echo
echo "Platform files"
check  "infra/compose.yaml exists"  test -f infra/compose.yaml

summary
```

Run: `bash scripts/doctor.sh`
Expected: **FAIL** — `infra/compose.yaml` does not exist yet, and the run exits non-zero. This is the harness proving it can fail.

- [ ] **Step 4: Write the Makefile spine**

`Makefile`:

```makefile
# The whole developer interface. C1's bar is that a new developer reaches a
# working loop from a clean checkout, so every target here is part of that claim.
SHELL := /usr/bin/env bash
.DEFAULT_GOAL := help
COMPOSE := docker compose -f infra/compose.yaml -p manifest

.PHONY: help seed up down reset doctor verify host-setup host-undo

help:  ## Show this help
	@grep -E '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) \
	  | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

doctor:  ## Can this machine run the platform? Works with nothing up.
	@bash scripts/doctor.sh

verify:  ## Is the running platform correct? Needs `make up` first.
	@bash scripts/verify.sh

host-setup:  ## The three privileged steps. Prompts for a password.
	@sudo bash infra/host/host-setup.sh

host-undo:  ## Reverse every host change. Leaves Valet untouched.
	@sudo bash infra/host/host-undo.sh
```

- [ ] **Step 5: Write `.gitignore` and `.env.example`**

`.gitignore`:

```
.env
infra/ca/
infra/seed-cache/
```

`.env.example`:

```sh
# Copied to .env by `make seed`. Never commit .env.
POSTGRES_PASSWORD=change-me-locally
LITELLM_MASTER_KEY=sk-manifest-local-master
LITELLM_SALT_KEY=sk-manifest-local-salt
# Host Node processes (control plane, admin UI, console) ignore the macOS
# keychain, so they need this explicitly — S7 §Evidence 7.
NODE_EXTRA_CA_CERTS=./infra/ca/manifest-root.crt
```

- [ ] **Step 6: Add the real host preconditions, and make the run pass**

Replace the `Platform files` block in `scripts/doctor.sh` with the checks below, and delete the deliberately-failing one. Each maps to a row of S7's *What survives* check list.

```bash
echo
echo "Docker"
check "docker is running"  docker info --format '{{.ServerVersion}}'

check_vm_memory() {
  local bytes; bytes=$(docker info --format '{{.MemTotal}}')
  local gb_dec; gb_dec=$(awk -v b="$bytes" 'BEGIN{printf "%.2f", b/1000000000}')
  local gib;    gib=$(awk -v b="$bytes" 'BEGIN{printf "%.2f", b/1073741824}')
  echo "$bytes bytes = ${gb_dec} GB decimal / ${gib} GiB binary; floor is 8.00 GB decimal"
  [ "$bytes" -ge "$VM_MEMORY_FLOOR_BYTES" ]
}
check "Docker VM memory >= 8.00 GB decimal"  check_vm_memory

check_disk() {
  local gb; gb=$(df -g / | awk 'NR==2{print $4}')
  echo "${gb} GB free on /"
  [ "$gb" -ge "$DISK_FLOOR_GB" ]
}
check "disk >= 40 GB free"  check_disk

echo
echo "Ports"
port_free() { ! lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }
check_block() {
  local p busy=""
  for p in $(seq $PORT_BLOCK_START $PORT_BLOCK_END); do
    port_free "$p" || busy="$busy $p"
  done
  [ -z "$busy" ] && { echo "7100-7199 all free"; return 0; }
  echo "in use:$busy"; return 1
}
check "ports 7100-7199 free"  check_block

# NEVER assume 53, 80 or 443 are free. Valet owns all three here (S7) and the
# design accommodates that rather than fighting it.
report "port 53 owner"   sh -c 'lsof -nP -iUDP:53 2>/dev/null | awk "NR==2{print \$1, \$3}" || echo "(none)"'
report "port 443 owner"  sh -c 'lsof -nP -iTCP:443 -sTCP:LISTEN 2>/dev/null | awk "NR==2{print \$1, \$3}" || echo "(none)"'
```

- [ ] **Step 7: Run doctor and confirm it passes**

Run: `make doctor`
Expected: PASS on docker/memory/disk/ports, INFO lines naming whatever owns 53 and 443, exit code 0.

```bash
make doctor; echo "exit=$?"
```

Expected: `exit=0`.

- [ ] **Step 8: Commit**

```bash
git add Makefile .gitignore .env.example infra/lib/common.sh scripts/lib/check.sh scripts/doctor.sh
git commit -m "feat: makefile spine, shared constants and the doctor check harness"
```

---

## Task 2: The platform network and split-horizon DNS

**Files:**
- Create: `infra/dnsmasq/Dockerfile`
- Create: `infra/compose.yaml` (network + the two dnsmasq services)
- Create: `scripts/verify.sh`
- Modify: `scripts/doctor.sh` (add the zone-ownership check)

**Interfaces:**
- Consumes: `infra/lib/common.sh` constants; `scripts/lib/check.sh`.
- Produces: the `manifest-platform` network at `10.89.0.0/24`; `manifest-dns-containers` answering on `10.89.0.53`; `manifest-dns-host` answering on `10.89.0.54` and published at `127.0.0.1:7153`. Task 3 attaches Caddy at `10.89.0.10`, which is the address these already answer with.

**This is the task S7 exists for.** The host needs the zone to resolve to a loopback address; containers need an address they can route to; and a single A record cannot serve both. `--address` is global to a dnsmasq **process** — S7 verified this rather than assuming it — so the answer is two processes, run as two containers. Three flags are load-bearing and none is obvious. Get them wrong and the failure is *misleading* rather than loud: `dig +short` returns the right record while `curl` says it cannot resolve the host.

- [ ] **Step 1: Write the failing verification**

`scripts/verify.sh`:

```bash
#!/usr/bin/env bash
# make verify — IS THE RUNNING PLATFORM CORRECT? Needs `make up` first.
# Asserts the properties S7, S1 and S3 established, not merely that things booted.
set -uo pipefail
cd "$(dirname "$0")/.."
. scripts/lib/check.sh
. infra/lib/common.sh
# Sourced here, not by the caller: `make verify` must work on its own, and the
# LiteLLM checks need LITELLM_MASTER_KEY.
[ -f .env ] && { set -a; . ./.env; set +a; }

echo "manifest verify — $(date)"

echo
echo "DNS — the split-horizon property (S7)"

# Containers must be told the zone lives at Caddy's platform-network address.
dns_container_view() {
  local got
  # manifest-dnsmasq:local, NOT alpine + `apk add` — verify must run OFFLINE
  # (Task 13), and that image already carries dig.
  got=$(docker run --rm --network "$NET" --dns "$DNS_C_IP" \
        --entrypoint dig manifest-dnsmasq:local +short "console.$ZONE" \
        2>/dev/null | tail -1)
  echo "container sees console.$ZONE = ${got:-<nothing>} (want $CADDY_IP)"
  [ "$got" = "$CADDY_IP" ]
}
check "containers resolve the zone to Caddy's platform IP"  dns_container_view

# The host must be told the same name lives on the loopback alias.
dns_host_view() {
  local got
  got=$(dig +short @127.0.0.1 -p "$PORT_DNS" "console.$ZONE" | tail -1)
  echo "host sees console.$ZONE = ${got:-<nothing>} (want $EDGE_IP)"
  [ "$got" = "$EDGE_IP" ]
}
check "the host resolves the zone to the loopback alias"  dns_host_view

# THE NEGATIVE CONTROL that cost S7 the most time. Without --local, dnsmasq
# answers AAAA with SERVFAIL instead of NODATA, and both musl and glibc treat
# SERVFAIL on either half of a dual-stack lookup as total failure. The symptom is
# "curl: could not resolve host" WHILE dig returns the correct A record.
dns_aaaa_is_nodata() {
  local st
  st=$(dig AAAA @127.0.0.1 -p "$PORT_DNS" "console.$ZONE" | awk -F'status: ' '/status:/{split($2,a,","); print a[1]}')
  echo "AAAA status = ${st:-<none>} (want NOERROR, i.e. NODATA; SERVFAIL means --local is missing)"
  [ "$st" = "NOERROR" ]
}
check "AAAA returns NODATA, not SERVFAIL"  dns_aaaa_is_nodata

# Without --server=127.0.0.11, --no-resolv makes dnsmasq authoritative for the
# whole namespace and containers lose Docker service names AND external names.
dns_forwards_non_zone() {
  local got
  got=$(docker run --rm --network "$NET" --dns "$DNS_C_IP" \
        --entrypoint dig manifest-dnsmasq:local +short manifest-dns-host \
        2>/dev/null | tail -1)
  echo "Docker service name manifest-dns-host = ${got:-<nothing>} (want $DNS_H_IP)"
  [ "$got" = "$DNS_H_IP" ]
}
check "non-zone queries still reach Docker's resolver"  dns_forwards_non_zone

summary
```

- [ ] **Step 2: Run it and watch every check fail**

Run: `make verify`
Expected: **4 checks, 4 failed.** Nothing is running; `docker run --network manifest-platform` errors with `network manifest-platform not found`, and `dig @127.0.0.1 -p 7153` gets no answer.

- [ ] **Step 3: Write the dnsmasq image**

`infra/dnsmasq/Dockerfile`:

```dockerfile
# bind-tools is not decoration: `dig` inside this container is how you debug the
# split horizon when it misbehaves, and `docker logs` on each of the two
# containers separates host queries from container queries (S7).
FROM alpine:3.22
RUN apk add --no-cache dnsmasq bind-tools
ENTRYPOINT ["dnsmasq"]
```

- [ ] **Step 4: Write the compose file — network and both dnsmasq processes**

`infra/compose.yaml`:

```yaml
# §21's platform inventory. One Compose project, project name `manifest`.
name: manifest

networks:
  platform:
    name: manifest-platform
    ipam:
      config:
        - subnet: 10.89.0.0/24
          gateway: 10.89.0.1

services:
  # ---------------------------------------------------------------------------
  # Two dnsmasq PROCESSES, as two CONTAINERS. Not one container with two
  # listeners: `--address` is global to a dnsmasq process (S7 verified this), and
  # `--bind-interfaces` needs a different address for each, while a container has
  # one platform-network IP. `docker logs` then also separates the two views.
  # ---------------------------------------------------------------------------
  dns-containers:
    build: { context: ./dnsmasq }
    image: manifest-dnsmasq:local
    container_name: manifest-dns-containers
    restart: unless-stopped
    networks:
      platform: { ipv4_address: 10.89.0.53 }
    command:
      - --keep-in-foreground
      - --no-daemon
      - --log-queries
      - --no-resolv
      - --listen-address=10.89.0.53
      - --bind-interfaces
      # LOAD-BEARING. Without it, AAAA is answered SERVFAIL rather than NODATA and
      # every dual-stack resolver treats the whole lookup as failed (S7).
      - --local=/manifest.internal/
      - --address=/manifest.internal/10.89.0.10
      # LOAD-BEARING. Forwards everything outside the zone to Docker's embedded
      # resolver; without it containers lose service names and external DNS (S7).
      - --server=127.0.0.11

  dns-host:
    build: { context: ./dnsmasq }
    image: manifest-dnsmasq:local
    container_name: manifest-dns-host
    restart: unless-stopped
    networks:
      platform: { ipv4_address: 10.89.0.54 }
    ports:
      # BOTH protocols. macOS resolver(5) will use TCP for some queries.
      - "127.0.0.1:7153:53/udp"
      - "127.0.0.1:7153:53/tcp"
    command:
      - --keep-in-foreground
      - --no-daemon
      - --log-queries
      - --no-resolv
      - --listen-address=10.89.0.54
      - --bind-interfaces
      - --local=/manifest.internal/
      # The host's answer differs from the containers' answer. That difference IS
      # the split horizon, and it is the entire point of running two processes.
      - --address=/manifest.internal/127.0.0.2
```

- [ ] **Step 5: Bring the two services up and re-run verify**

```bash
docker compose -f infra/compose.yaml -p manifest up -d --build dns-containers dns-host
make verify
```

Expected: **4 checks, 0 failed.** In particular `AAAA status = NOERROR`.

- [ ] **Step 6: Prove the negative control is a real control**

Do not skip this. A green result is not evidence a control is in force — that is the roadmap's most expensive lesson, paid for twice.

```bash
docker rm -f manifest-dns-host
docker run -d --name manifest-dns-host --network manifest-platform --ip 10.89.0.54 \
  -p 127.0.0.1:7153:53/udp -p 127.0.0.1:7153:53/tcp manifest-dnsmasq:local \
  --keep-in-foreground --no-daemon --no-resolv --listen-address=10.89.0.54 \
  --bind-interfaces --address=/manifest.internal/127.0.0.2
dig AAAA @127.0.0.1 -p 7153 console.manifest.internal | grep status:
```

Expected: `status: SERVFAIL` — the flag removed, the failure returns. Then restore:

```bash
docker rm -f manifest-dns-host
docker compose -f infra/compose.yaml -p manifest up -d dns-host
make verify
```

Expected: back to `status: NOERROR`, 0 failed.

- [ ] **Step 7: Add the zone-ownership check to doctor**

This is the check that would have caught S7's entire `.test` problem on day one. Append to `scripts/doctor.sh`:

```bash
echo
echo "Zone"
# Valet answers for ALL of .test. If something already owns our zone, names
# resolve, DNS looks healthy, and requests land on the wrong web server.
check_zone_unclaimed() {
  local got
  got=$(dscacheutil -q host -a name "probe-unclaimed.$ZONE" 2>/dev/null | awk '/ip_address/{print $2}' | head -1)
  if [ -z "$got" ]; then echo "nothing answers for $ZONE yet (correct before host-setup)"; return 0; fi
  echo "$ZONE resolves to $got"
  [ "$got" = "$EDGE_IP" ]
}
check "nothing but Manifest claims $ZONE"  check_zone_unclaimed
```

Run: `make doctor`
Expected: PASS — before `host-setup` nothing answers, which is correct; after it, the answer is `127.0.0.2`.

- [ ] **Step 8: Commit**

```bash
git add infra/dnsmasq infra/compose.yaml scripts/verify.sh scripts/doctor.sh
git commit -m "feat: split-horizon DNS — two dnsmasq processes, three load-bearing flags"
```

---

## Task 3: The custom Caddy image and §23's three zones

**Files:**
- Create: `infra/caddy/Dockerfile`
- Create: `infra/caddy/Caddyfile`
- Modify: `infra/compose.yaml` (the `caddy` service)
- Modify: `scripts/verify.sh` (module and container-side TLS checks)

**Interfaces:**
- Consumes: the platform network and `10.89.0.10` from Task 2.
- Produces: `manifest-caddy:local` carrying `http.handlers.rate_limit` and `http.handlers.waf`; the edge listening on the platform network; its admin API at `127.0.0.1:7119`; and `infra/ca/manifest-root.crt`, which Task 4 trusts. Task 5 asserts host↔container parity through it; P3 adds routes through the admin API at runtime.

**This is the one image built rather than pulled** (§20). Rate limiting and Coraza are third-party modules that require an `xcaddy` build, and §20 calls the edge the highest-leverage control in the platform — shipping stock Caddy would mean shipping part of it. Two supply-chain facts belong on the record and are commented in the Dockerfile: **Coraza pins the Caddy version**, and `caddy-ratelimit` has exactly one published release ever.

**Port binding, and the chicken-and-egg S7 hit.** Caddy's internal CA root only exists after Caddy has run, but the `127.0.0.2` alias must exist before Caddy can bind 443 — so S7 ran its script twice. P1 does better: the CA is minted during `make seed` (Task 11) with Caddy bound to a throwaway port, so by the time `make up` runs, the root is already trusted and the alias is already there. **This task binds the platform network only**; the `127.0.0.2` publish is added in Task 4 once the alias exists.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify.sh`, before `summary`:

```bash
echo
echo "Edge — the custom Caddy build (§20)"

caddy_has_modules() {
  local mods
  mods=$(docker exec manifest-caddy caddy list-modules 2>/dev/null | grep -E '^http\.handlers\.(rate_limit|waf)$' | sort | tr '\n' ' ')
  echo "modules: ${mods:-<none>} (want http.handlers.rate_limit http.handlers.waf)"
  [ "$(echo "$mods" | wc -w | tr -d ' ')" = "2" ]
}
check "Caddy carries the rate-limit and Coraza modules"  caddy_has_modules

caddy_version_pinned() {
  local v; v=$(docker exec manifest-caddy caddy version 2>/dev/null | awk '{print $1}')
  echo "caddy $v (Coraza v2.6.0 requires exactly v2.11.4)"
  [ "$v" = "v2.11.4" ]
}
check "Caddy is pinned to v2.11.4"  caddy_version_pinned

# The container half of the parity property. The host half is Task 5.
edge_serves_container_side() {
  local out
  out=$(docker run --rm --network "$NET" --dns "$DNS_C_IP" \
        -v "$PWD/$CA_FILE":/ca.crt:ro curlimages/curl:8.11.1 \
        --cacert /ca.crt -sS "https://console.$ZONE/" 2>&1)
  echo "$out"
  echo "$out" | grep -q "host=console.$ZONE"
}
check "a container reaches https://console.$ZONE with the platform CA"  edge_serves_container_side
```

- [ ] **Step 2: Run and watch them fail**

Run: `make verify`
Expected: the three new checks FAIL — `Error: No such container: manifest-caddy`.

- [ ] **Step 3: Write the Caddy image**

`infra/caddy/Dockerfile`:

```dockerfile
# The one image built rather than pulled (§20). Rate limiting and Coraza/OWASP-CRS
# are third-party modules and the edge is "the highest-leverage control in the
# platform", so a stock Caddy would ship only part of it.
#
# TWO SUPPLY-CHAIN FACTS, recorded because both constrain future upgrades (S7):
#   1. Coraza PINS Caddy. coraza-caddy/v2@v2.6.0 requires caddy/v2@v2.11.4 and
#      xcaddy refuses any other version. Bumping one means bumping both.
#   2. caddy-ratelimit has exactly ONE published release, ever (v0.1.0) — a
#      single-version, single-maintainer dependency inside our top control.
ARG CADDY_VERSION=2.11.4
FROM caddy:${CADDY_VERSION}-builder AS builder
ARG CADDY_VERSION
RUN xcaddy build v${CADDY_VERSION} \
    --with github.com/mholt/caddy-ratelimit@v0.1.0 \
    --with github.com/corazawaf/coraza-caddy/v2@v2.6.0

FROM caddy:${CADDY_VERSION}
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
```

- [ ] **Step 4: Write the Caddyfile**

`infra/caddy/Caddyfile`:

```caddyfile
{
	# The admin API is how the driver adds a route for a name allocated at
	# runtime (§12, S1). Published to 127.0.0.1:7119 only.
	admin 0.0.0.0:2019
	local_certs
	# We install trust ourselves, in three places, during `make seed` (S7):
	# the macOS keychain, container trust stores, and the HOST Node processes.
	skip_install_trust
}

# §23's three platform zones, local equivalents. One wildcard certificate each,
# because every platform hostname is exactly one label deep.
*.manifest.internal, *.sandbox.manifest.internal, *.staging.manifest.internal {
	tls internal
	# The placeholder C1's demo asks for. P3 replaces the reverse_proxy target
	# per app via the admin API; this wildcard stays as the fallback.
	respond "manifest OK host={host} scheme={scheme} remote={remote_host}" 200
}
```

- [ ] **Step 5: Add the service to compose**

Append under `services:` in `infra/compose.yaml`:

```yaml
  caddy:
    build: { context: ./caddy }
    image: manifest-caddy:local
    container_name: manifest-caddy
    restart: unless-stopped
    depends_on: [dns-containers]
    networks:
      platform: { ipv4_address: 10.89.0.10 }
    ports:
      # Task 4 adds 127.0.0.2:80 and :443 once the lo0 alias exists.
      - "127.0.0.1:7119:2019"
    volumes:
      - ./caddy/Caddyfile:/etc/caddy/Caddyfile:ro
      # NEVER destroyed by `make reset`: the internal CA lives here, and
      # regenerating it invalidates the root the developer trusted.
      - caddy-data:/data
    healthcheck:
      test: ["CMD", "caddy", "version"]
      interval: 5s
      timeout: 3s
      retries: 12
```

And at the bottom of the file:

```yaml
volumes:
  caddy-data:
    name: manifest-caddy-data
```

- [ ] **Step 6: Build, start, extract the CA, and re-run verify**

```bash
docker compose -f infra/compose.yaml -p manifest up -d --build caddy
mkdir -p infra/ca
until docker exec manifest-caddy test -f /data/caddy/pki/authorities/local/root.crt; do sleep 1; done
docker cp manifest-caddy:/data/caddy/pki/authorities/local/root.crt infra/ca/manifest-root.crt
make verify
```

Expected: 7 checks, 0 failed. The container-side check is the important one — it proves the zone resolves *and* the certificate verifies inside a container.

- [ ] **Step 7: Prove the CA is doing the work**

```bash
docker run --rm --network manifest-platform --dns 10.89.0.53 \
  curlimages/curl:8.11.1 -sS https://console.manifest.internal/
```

Expected: **failure on TLS, not on DNS** — `unable to get local issuer certificate`. That is the correct failure: the name resolved, the certificate was not trusted. A DNS error here would mean Task 2 regressed.

- [ ] **Step 8: Commit**

```bash
git add infra/caddy infra/compose.yaml scripts/verify.sh
git commit -m "feat: custom xcaddy edge with rate-limit and Coraza, serving the three zones"
```

---

## Task 4: The host side — resolver, loopback alias, and CA trust

**Files:**
- Create: `infra/host/resolver-manifest.internal`
- Create: `infra/host/host-setup.sh`
- Create: `infra/host/host-undo.sh`
- Create: `infra/lib/ensure-alias.sh`
- Modify: `infra/compose.yaml` (publish Caddy on `127.0.0.2`)
- Modify: `scripts/doctor.sh` (the three host-state checks)

**Interfaces:**
- Consumes: `infra/ca/manifest-root.crt` from Task 3.
- Produces: `/etc/resolver/manifest.internal`; the `127.0.0.2` alias on `lo0`; the CA trusted in the System keychain; Caddy published on `127.0.0.2:80` and `:443`; and `infra/lib/ensure-alias.sh`, which **both** `make seed` (Task 11) and `make up` (Task 12) call. Task 5 asserts the parity property this makes possible.

**This is the whole `sudo` surface of the platform — three steps, and no more.** Each is reversible by `host-undo.sh`. **Laravel Valet is never named and never touched**: the resolver file is scoped to `manifest.internal` (not all of `.internal`, which would break Docker's own `host.docker.internal`), and the alias means Caddy owns 80/443 on a *different address* rather than taking Valet's.

**The alias is the recurring one.** It does not survive a reboot, so it is a `make up` step rather than a seed step. §21 counts every manual step as a defect against C1, so `make up` re-adds it itself with `sudo` (see *Decisions*, above) — prompting only when it is actually missing.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/doctor.sh`, before `summary`:

```bash
echo
echo "Host setup (make host-setup)"

check_resolver() {
  local f=/etc/resolver/$ZONE
  [ -f "$f" ] || { echo "$f missing — run: make host-setup"; return 1; }
  grep -q "^nameserver 127.0.0.1$" "$f" && grep -q "^port $PORT_DNS$" "$f" \
    || { echo "$f present but wrong: $(tr '\n' ' ' < "$f")"; return 1; }
  echo "$f -> 127.0.0.1:$PORT_DNS"
}
check "/etc/resolver/$ZONE installed and correct"  check_resolver

check_alias() {
  ifconfig lo0 | grep -q "inet $EDGE_IP" \
    || { echo "$EDGE_IP not on lo0 — Docker will refuse to bind Caddy. Lost on every reboot; \`make up\` re-adds it."; return 1; }
  echo "$EDGE_IP present on lo0"
}
check "the $EDGE_IP loopback alias exists"  check_alias

check_ca_keychain() {
  local n
  n=$(security find-certificate -a -c "Caddy Local Authority" /Library/Keychains/System.keychain 2>/dev/null | grep -c keychain)
  echo "$n Caddy root(s) in the System keychain"
  [ "$n" -ge 1 ]
}
check "the platform CA is trusted in the macOS keychain"  check_ca_keychain

# The keychain does NOT cover host Node processes — Node ignores it entirely, and
# the control plane, admin UI and console are all host Node processes (S7).
check_node_ca() {
  [ -f "$CA_FILE" ] || { echo "$CA_FILE missing — run make seed"; return 1; }
  node -e '
    const https=require("https");
    https.get("https://console.manifest.internal/",r=>{console.log("node reached the edge, status",r.statusCode);process.exit(0)})
         .on("error",e=>{console.log("node failed:",e.code);process.exit(1)});
  '
}
check_warn "host Node trusts the CA (needs NODE_EXTRA_CA_CERTS)"  check_node_ca
```

- [ ] **Step 2: Run and watch them fail**

Run: `make doctor`
Expected: the resolver, alias and keychain checks FAIL with actionable messages; the Node check WARNs. Exit code 1.

- [ ] **Step 3: Write the resolver file**

`infra/host/resolver-manifest.internal`:

```
nameserver 127.0.0.1
port 7153
```

`port` is a documented `resolver(5)` directive, which is what lets the host reach dnsmasq on a non-standard port — `--dns` taking no port constrains only the container side (S7).

- [ ] **Step 4: Write `host-setup.sh`**

`infra/host/host-setup.sh`:

```bash
#!/usr/bin/env bash
# THE ENTIRE PRIVILEGED SURFACE OF THE PLATFORM — three steps, all reversible by
# host-undo.sh. Run as: make host-setup
#
# LARAVEL VALET IS NEVER TOUCHED. Its /etc/resolver/test, its dnsmasq on port 53
# and its nginx on 127.0.0.1:80/443 are left exactly as they are; step 2 is scoped
# to manifest.internal and step 1 gives Caddy a DIFFERENT address to own.
set -euo pipefail
cd "$(dirname "$0")/../.."
. infra/lib/common.sh

[ "$(id -u)" -eq 0 ] || { echo "run via: make host-setup"; exit 1; }

# 1. The loopback alias. LOST ON EVERY REBOOT — `make up` re-adds it.
if ifconfig lo0 | grep -q "inet $EDGE_IP"; then
  echo "1/3  $EDGE_IP already on lo0"
else
  ifconfig lo0 alias "$EDGE_IP" up
  echo "1/3  added $EDGE_IP to lo0"
fi

# 2. The resolver, scoped to manifest.internal — NOT to all of .internal, which
#    would break Docker's own host.docker.internal and gateway.docker.internal.
install -m 644 "infra/host/resolver-$ZONE" "/etc/resolver/$ZONE"
echo "2/3  installed /etc/resolver/$ZONE"

# 3. Trust Caddy's internal CA. THIS PROMPTS FOR A PASSWORD EVEN UNDER sudo —
#    §21 calls it "one automated step, not a manual dance"; it is automatable but
#    it is not silent, and D12 should not be read as claiming otherwise (S7).
[ -f "$CA_FILE" ] || { echo "$CA_FILE missing — run \`make seed\` first"; exit 1; }
security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "$CA_FILE"
echo "3/3  trusted $CA_FILE in the System keychain"

echo
echo "Done. Verify with: make doctor"
```

- [ ] **Step 5: Write `host-undo.sh`**

`infra/host/host-undo.sh`:

```bash
#!/usr/bin/env bash
# Reverses host-setup.sh. Run as: make host-undo
# ORDER-INDEPENDENT: works whether or not `make reset` has already deleted
# infra/ca/. S7 shipped a version that did not, and it printed a confusing
# "Error reading file" when run in the other order.
cd "$(dirname "$0")/../.."
. infra/lib/common.sh

rm -f "/etc/resolver/$ZONE"
ifconfig lo0 -alias "$EDGE_IP" 2>/dev/null

# Remove by COMMON NAME first — authoritative, and does not need the file to
# still exist. The file-based call is belt-and-braces.
security delete-certificate -c "Caddy Local Authority - 2026 ECC Root" \
  /Library/Keychains/System.keychain 2>/dev/null
[ -f "$CA_FILE" ] && security remove-trusted-cert -d "$CA_FILE" 2>/dev/null

echo "--- /etc/resolver should no longer list $ZONE:"; ls /etc/resolver/
echo "--- lo0 should hold only 127.0.0.1:"; ifconfig lo0 | grep 'inet 127'
echo "--- Caddy roots remaining (want 0):"
security find-certificate -a -c "Caddy Local Authority" \
  /Library/Keychains/System.keychain 2>&1 | grep -c keychain
```

- [ ] **Step 6: Write the alias guard both `make seed` and `make up` will call**

`infra/lib/ensure-alias.sh`:

```bash
#!/usr/bin/env bash
# The 127.0.0.2 loopback alias does not survive a reboot (S7), and Docker refuses
# to bind Caddy without it. Called by BOTH `make seed` and `make up`. Prompts
# ONLY when the alias is actually missing, and prints the command before running
# it — nothing privileged happens silently.
set -euo pipefail
cd "$(dirname "$0")/../.."
. infra/lib/common.sh

if ifconfig lo0 | grep -q "inet $EDGE_IP"; then
  exit 0
fi

cat <<EOS
The $EDGE_IP loopback alias is missing. It is lost on every reboot, and Caddy
cannot bind 80/443 without it. Running:

    sudo ifconfig lo0 alias $EDGE_IP up

This is additive: Laravel Valet keeps 127.0.0.1:80 and :443 untouched, and
\`make host-undo\` removes the alias again.
EOS
sudo ifconfig lo0 alias "$EDGE_IP" up
ifconfig lo0 | grep "inet $EDGE_IP"
```

- [ ] **Step 7: Publish Caddy on the alias**

In `infra/compose.yaml`, replace the `caddy` service's `ports:` block with:

```yaml
    ports:
      # Real 80/443, on the loopback ALIAS. Valet keeps 127.0.0.1:80 and :443 and
      # neither is aware of the other. A PORT IN THE URL WOULD BREAK the parity
      # property §9 needs, so an override port is not an acceptable fallback here.
      - "127.0.0.2:80:80"
      - "127.0.0.2:443:443"
      - "127.0.0.1:7119:2019"
```

- [ ] **Step 8: Run host-setup and confirm doctor passes**

```bash
make host-setup          # prompts for a password twice: sudo, then the keychain
export NODE_EXTRA_CA_CERTS="$PWD/infra/ca/manifest-root.crt"
docker compose -f infra/compose.yaml -p manifest up -d caddy
make doctor
```

Expected: resolver, alias and keychain checks PASS; the Node check PASSES with `NODE_EXTRA_CA_CERTS` exported. Exit 0.

- [ ] **Step 9: Prove the alias is genuinely required**

```bash
sudo ifconfig lo0 -alias 127.0.0.2
docker compose -f infra/compose.yaml -p manifest up -d --force-recreate caddy
```

Expected: Docker refuses — `bind: can't assign requested address`. That error is exactly what the doctor check exists to pre-empt. Restore:

```bash
sudo ifconfig lo0 alias 127.0.0.2 up
docker compose -f infra/compose.yaml -p manifest up -d caddy
make doctor
```

- [ ] **Step 10: Prove Valet is untouched**

```bash
ls /etc/resolver/                                  # test and vibonarium.local still there
dscacheutil -q host -a name probe.manifest.test    # still 127.0.0.1 — Valet's
curl -sI https://127.0.0.1/ -k | head -1           # still Valet's nginx
```

- [ ] **Step 11: Commit**

```bash
git add infra/host infra/lib/ensure-alias.sh infra/compose.yaml scripts/doctor.sh
git commit -m "feat: the three privileged host steps, and their reversal"
```

---

## Task 5: `make verify` proves C1's parity property

**Files:**
- Modify: `scripts/verify.sh`

**Interfaces:**
- Consumes: everything from Tasks 2–4.
- Produces: the assertion that this whole plan exists to make true. Task 13 runs it offline on a second machine; P3 relies on the runtime-route mechanism it exercises.

**The property, stated exactly.** The same URL — `https://console.manifest.internal/`, **no port, no `-k`** — must return the same thing from the host and from inside a container, with a trusted certificate in both. §9 needs this because a SAML `entityID` and ACS URL must match byte-for-byte in both contexts; a port in the host URL would break it, which is why the loopback alias exists rather than a port override. S7 called this "the half that fails silently if the design is wrong".

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify.sh`, before `summary`:

```bash
echo
echo "C1 — host/container parity (S7 §Evidence 4, 5)"

host_reaches_edge() {
  local out
  out=$(curl -sS "https://console.$ZONE/" 2>&1)
  echo "$out"
  echo "$out" | grep -q "host=console.$ZONE"
}
check "the host reaches https://console.$ZONE with no -k and no port"  host_reaches_edge

host_trusts_cert() {
  local r
  r=$(curl -sS -o /dev/null -w '%{ssl_verify_result}' "https://console.$ZONE/" 2>&1)
  echo "ssl_verify_result=$r (0 means the macOS keychain trusts it)"
  [ "$r" = "0" ]
}
check "the certificate verifies against the macOS keychain"  host_trusts_cert

# THE PARITY ASSERTION. Same command string, both contexts, compared.
parity() {
  local h c
  h=$(curl -sS "https://console.$ZONE/" 2>&1 | sed 's/ remote=.*//')
  c=$(docker run --rm --network "$NET" --dns "$DNS_C_IP" \
      -v "$PWD/$CA_FILE":/ca.crt:ro curlimages/curl:8.11.1 \
      --cacert /ca.crt -sS "https://console.$ZONE/" 2>&1 | sed 's/ remote=.*//')
  echo "host     : $h"
  echo "container: $c"
  [ -n "$h" ] && [ "$h" = "$c" ]
}
check "host and container see a byte-identical hostname and scheme"  parity

# All three of §23's zones, one wildcard certificate each.
zones_serve() {
  local n host
  for host in "chem-labs.$ZONE" "chem-labs.sandbox.$ZONE" "chem-labs.staging.$ZONE"; do
    curl -sS -o /dev/null "https://$host/" || { echo "$host FAILED"; return 1; }
    n="$n $host"
  done
  echo "served:$n"
}
check "all three §23 platform zones serve with a trusted certificate"  zones_serve

# A name that exists in no config file, added through the admin API as the driver
# will (§12, S1). PUT inserts; POST appends behind the wildcard, whose
# terminal:true then swallows the new route.
runtime_route() {
  curl -sS -X PUT "http://127.0.0.1:$PORT_CADDY_ADMIN/config/apps/http/servers/srv0/routes/0" \
    -H 'Content-Type: application/json' \
    -d "{\"match\":[{\"host\":[\"late-arrival.$ZONE\"]}],\"handle\":[{\"handler\":\"static_response\",\"body\":\"runtime route OK\",\"status_code\":200}],\"terminal\":true}" \
    >/dev/null || { echo "admin API rejected the route"; return 1; }
  local got; got=$(curl -sS "https://late-arrival.$ZONE/" 2>&1)
  echo "$got"
  curl -sS -X DELETE "http://127.0.0.1:$PORT_CADDY_ADMIN/config/apps/http/servers/srv0/routes/0" >/dev/null
  [ "$got" = "runtime route OK" ]
}
check "a name allocated at runtime resolves, routes and gets a certificate"  runtime_route
```

- [ ] **Step 2: Run and watch the new checks fail before host-setup**

If Task 4's host setup has been undone, run `make verify` now:
Expected: `host_reaches_edge` FAILS with `Could not resolve host`. This is the state a developer is in before `make host-setup`, and the message should send them there.

- [ ] **Step 3: Run with host setup in place**

```bash
make host-setup     # if not already done
make verify
```

Expected: **12 checks, 0 failed.**

- [ ] **Step 4: Confirm the parity output by eye**

The two lines printed by the parity check must be identical apart from `remote=`, which is stripped:

```
host     : manifest OK host=console.manifest.internal scheme=https
container: manifest OK host=console.manifest.internal scheme=https
```

Identical hostname, identical scheme, **no port anywhere**. This is the C1 demo, in one assertion.

- [ ] **Step 5: Commit**

```bash
git add scripts/verify.sh
git commit -m "test: assert C1's host/container parity property end to end"
```

---

## Task 6: Postgres and its three databases

**Files:**
- Create: `infra/postgres/initdb/10-databases.sql`
- Modify: `infra/compose.yaml` (the `postgres` service and its volume)
- Modify: `scripts/verify.sh`

**Interfaces:**
- Consumes: the platform network.
- Produces: one Postgres server on `127.0.0.1:7103` holding **three** databases — `manifest_control`, `litellm`, `manifest_idp`. Task 9 (LiteLLM) and Task 10 (the IdP) each connect to their own; P2's Drizzle migrations target `manifest_control`.

**One server, three databases** (§21, D11) — worth ~400 MB on a 16 GB machine, where three servers would not be. Production separates them; §21 lists that as an honest divergence. The IdP hits this database on **every SP lookup** (S2), so it is not optional infrastructure.

- [ ] **Step 1: Write the failing check**

Append to `scripts/verify.sh`, before `summary`:

```bash
echo
echo "Postgres — one server, three databases (§21)"

pg_has_three_databases() {
  local got want="litellm manifest_control manifest_idp"
  got=$(docker exec manifest-postgres psql -U manifest -d postgres -tAc \
        "SELECT datname FROM pg_database WHERE datname IN ('manifest_control','litellm','manifest_idp') ORDER BY datname" \
        2>&1 | tr '\n' ' ' | sed 's/ *$//')
  echo "found: ${got:-<none>} (want $want)"
  [ "$got" = "$want" ]
}
check "manifest_control, litellm and manifest_idp all exist"  pg_has_three_databases

pg_reachable_from_host() {
  # §21: the control plane is a HOST process and connects over the published port.
  nc -z 127.0.0.1 "$PORT_POSTGRES" && echo "127.0.0.1:$PORT_POSTGRES accepting connections"
}
check "Postgres is reachable from the host on $PORT_POSTGRES"  pg_reachable_from_host
```

Run: `make verify`
Expected: both FAIL — `No such container: manifest-postgres`.

- [ ] **Step 2: Write the init SQL**

`infra/postgres/initdb/10-databases.sql`:

```sql
-- §21: one server, three databases. POSTGRES_DB creates manifest_control; these
-- two are the others. initdb scripts run once, on an empty data directory only.
CREATE DATABASE litellm;
CREATE DATABASE manifest_idp;
```

- [ ] **Step 3: Add the service**

Append under `services:`:

```yaml
  postgres:
    image: postgres:16-alpine
    container_name: manifest-postgres
    restart: unless-stopped
    networks: [platform]
    environment:
      POSTGRES_USER: manifest
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}
      POSTGRES_DB: manifest_control
    ports:
      - "127.0.0.1:7103:5432"
    volumes:
      - ./postgres/initdb:/docker-entrypoint-initdb.d:ro
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U manifest -d manifest_control"]
      interval: 3s
      timeout: 3s
      retries: 20
```

And under `volumes:`:

```yaml
  pgdata:
    name: manifest-pgdata
```

- [ ] **Step 4: Start it and re-run verify**

```bash
cp -n .env.example .env
docker compose -f infra/compose.yaml -p manifest up -d postgres
make verify
```

Expected: 14 checks, 0 failed.

- [ ] **Step 5: Commit**

```bash
git add infra/postgres infra/compose.yaml scripts/verify.sh
git commit -m "feat: postgres with the three databases §21 specifies"
```

---

## Task 7: The supply-chain trio — registry, package mirror, egress proxy

**Files:**
- Create: `infra/verdaccio/config.yaml`
- Create: `infra/egress/tinyproxy.conf`
- Modify: `infra/compose.yaml` (three services, the internal network, both volumes)
- Modify: `scripts/verify.sh`

**Interfaces:**
- Consumes: the platform network.
- Produces: `registry:2` on `127.0.0.1:7107` **and** on `manifest-build-internal` as `manifest-registry:5000`; Verdaccio on `127.0.0.1:7108` and dual-homed likewise; tinyproxy on `127.0.0.1:7109`. Task 8's builder attaches to the internal network **only**; Task 11 pushes base images into the registry.

**The dual-homing is not cosmetic.** S1 lost time to this: a container attached *only* to an `--internal` network **loses its published port mapping**, so the registry became unreachable from the host and from the Docker daemon. The registry and mirror are therefore on both networks; **only the builder stays internal-only**, which is what makes "network-restricted builder" a real control (§12, §20) rather than an aspiration.

- [ ] **Step 1: Write the failing checks, including the egress negative control**

Append to `scripts/verify.sh`, before `summary`:

```bash
echo
echo "Supply chain (§12)"

registry_from_host() {
  # NOT localhost: it resolves to ::1 and times out (S1, §12).
  local code; code=$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT_REGISTRY/v2/")
  echo "http://127.0.0.1:$PORT_REGISTRY/v2/ -> $code"
  [ "$code" = "200" ]
}
check "the registry answers on the host's published port"  registry_from_host

verdaccio_from_host() {
  local code; code=$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT_VERDACCIO/-/ping")
  echo "http://127.0.0.1:$PORT_VERDACCIO/-/ping -> $code"
  [ "$code" = "200" ]
}
check "Verdaccio answers on the host's published port"  verdaccio_from_host

# Dual-homed: the same two services must ALSO be reachable from the internal
# network, which is the only network the builder will be on.
reachable_from_internal() {
  docker run --rm --network "$NET_BUILD" curlimages/curl:8.11.1 \
    -sS -o /dev/null -w 'registry=%{http_code} ' http://manifest-registry:5000/v2/ &&
  docker run --rm --network "$NET_BUILD" curlimages/curl:8.11.1 \
    -sS -o /dev/null -w 'mirror=%{http_code}\n' http://manifest-verdaccio:4873/-/ping
}
check "registry and mirror are reachable from the internal build network"  reachable_from_internal

# NEGATIVE CONTROL. The internal network must actually deny egress, or the
# "network-restricted builder" in §20's control map is a claim, not a control.
internal_network_denies_egress() {
  # Judge by curl's EXIT CODE, not by grepping the output: the failure message
  # itself contains the word "registry", which a naive grep would match.
  local out rc
  out=$(docker run --rm --network "$NET_BUILD" curlimages/curl:8.11.1 \
        -sS -m 6 -o /dev/null https://registry.npmjs.org/ 2>&1); rc=$?
  echo "curl to npmjs exited $rc (want non-zero): ${out:0:70}"
  [ "$rc" -ne 0 ]
}
check "NEGATIVE CONTROL: the internal network cannot reach the public internet"  internal_network_denies_egress

egress_proxy_denies_by_default() {
  local code
  code=$(curl -sS -o /dev/null -w '%{http_code}' -x "http://127.0.0.1:$PORT_EGRESS" \
         -m 8 https://example.com/ 2>&1)
  echo "example.com through the proxy -> $code (want 403; deny by default, D18)"
  [ "$code" = "403" ]
}
check "the egress proxy denies an undeclared destination"  egress_proxy_denies_by_default
```

Run: `make verify` — all five FAIL.

- [ ] **Step 2: Write the Verdaccio config**

`infra/verdaccio/config.yaml`:

```yaml
# The private package mirror §12 mandates. This — not the public registry — is
# what makes C1's offline claim true: after `make seed` warms it, installs work
# with the network off.
storage: /verdaccio/storage
auth:
  htpasswd:
    file: /verdaccio/storage/htpasswd
    max_users: -1          # local only; the platform is not multi-tenant here
uplinks:
  npmjs:
    url: https://registry.npmjs.org/
    cache: true            # cache: true IS the offline story
    timeout: 30s
packages:
  '@*/*':
    access: $all
    publish: $all
    proxy: npmjs
  '**':
    access: $all
    publish: $all
    proxy: npmjs
log: { type: stdout, format: pretty, level: warn }
```

- [ ] **Step 3: Write the egress proxy config**

`infra/egress/tinyproxy.conf`:

```conf
# D18: egress is DEFAULT-DENY in every environment, through a forced proxy.
# The allowlist below is the platform baseline (§12); an app's own
# `egress.allow` entries are added per app by the driver in P3.
Port 8888
Listen 0.0.0.0
Timeout 600
LogLevel Warning
MaxClients 100

# Deny everything not named here. tinyproxy answers 403 for a denied host.
FilterDefaultDeny Yes
Filter "/etc/tinyproxy/allowlist"
FilterURLs Off
FilterExtended On
```

`infra/egress/allowlist`:

```
# Platform baseline only. One extended regular expression per line.
^manifest-registry$
^manifest-verdaccio$
^manifest-litellm$
^manifest-idp$
```

- [ ] **Step 4: Add the three services and the internal network**

Append under `networks:`:

```yaml
  build-internal:
    name: manifest-build-internal
    internal: true          # no gateway. THIS is the network restriction (§12).
```

Append under `services:`:

```yaml
  registry:
    image: registry:2
    container_name: manifest-registry
    restart: unless-stopped
    # DUAL-HOMED. A container on an --internal network ONLY loses its published
    # ports (S1), so the registry would become unreachable from the host and the
    # daemon. Only the BUILDER stays internal-only.
    networks: [platform, build-internal]
    ports:
      - "127.0.0.1:7107:5000"
    volumes:
      - registry-data:/var/lib/registry
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:5000/v2/"]
      interval: 5s
      timeout: 3s
      retries: 12

  verdaccio:
    image: verdaccio/verdaccio:6
    container_name: manifest-verdaccio
    restart: unless-stopped
    networks: [platform, build-internal]     # dual-homed, same reason
    ports:
      - "127.0.0.1:7108:4873"
    volumes:
      - ./verdaccio/config.yaml:/verdaccio/conf/config.yaml:ro
      - verdaccio-storage:/verdaccio/storage
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:4873/-/ping"]
      interval: 5s
      timeout: 3s
      retries: 12

  egress:
    image: vimagick/tinyproxy
    container_name: manifest-egress
    restart: unless-stopped
    networks: [platform]
    ports:
      - "127.0.0.1:7109:8888"
    volumes:
      - ./egress/tinyproxy.conf:/etc/tinyproxy/tinyproxy.conf:ro
      - ./egress/allowlist:/etc/tinyproxy/allowlist:ro
```

Append under `volumes:`:

```yaml
  registry-data:
    name: manifest-registry-data
  verdaccio-storage:
    name: manifest-verdaccio-storage
```

- [ ] **Step 5: Start them and re-run verify**

```bash
docker compose -f infra/compose.yaml -p manifest up -d registry verdaccio egress
make verify
```

Expected: 19 checks, 0 failed — including the two negative controls.

- [ ] **Step 6: Prove the dual-homing claim by removing it**

```bash
docker network disconnect manifest-platform manifest-registry
curl -sS -o /dev/null -w '%{http_code}\n' -m 5 http://127.0.0.1:7107/v2/
```

Expected: `000` — the published port is gone the moment the registry is on the internal network alone. This is S1's finding reproduced, and it is why the dual-homing comment in the compose file matters. Restore:

```bash
docker network connect manifest-platform manifest-registry
make verify
```

- [ ] **Step 7: Commit**

```bash
git add infra/verdaccio infra/egress infra/compose.yaml scripts/verify.sh
git commit -m "feat: registry, package mirror and default-deny egress proxy"
```

---

## Task 8: The rootless, network-restricted builder

**Files:**
- Create: `infra/buildkit/buildkitd.toml`
- Modify: `infra/compose.yaml` (the `builder` service, under a profile)
- Modify: `scripts/verify.sh`

**Interfaces:**
- Consumes: `manifest-build-internal`, and the registry and mirror from Task 7.
- Produces: `manifest-buildkitd`, a **non-privileged** rootless BuildKit daemon on the internal network only, attachable as `docker buildx create --driver remote docker-container://manifest-buildkitd`. P3's `Driver.buildImage` drives it.

**The obvious route is wrong, and it fails the hardening baseline while looking correct.** Buildx's own `docker-container` driver runs the rootless image *inside a `--privileged` container* — `User=1000:1000 Privileged=true`. §12 forbids `--privileged`. Running the daemon as a plain container and attaching over the `remote` driver gives both properties (S1). Two further settings are required and **neither is discoverable from the error message**: the daemon must listen on its **default unix socket** (a `--addr tcp://…` makes the transport hang), and `buildkitd.toml` needs `[dns] nameservers = ["127.0.0.11"]` because BuildKit writes its own `resolv.conf` for `RUN` steps.

Build time is the most privileged moment in the pipeline (D13), so the builder is transient — created and destroyed per build by the driver. In P1 it exists as a **Compose profile**, not a default service, so `make up` does not carry it.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify.sh`, before `summary`:

```bash
echo
echo "Builder (§12, S1) — only checked when the 'build' profile is up"
if docker inspect manifest-buildkitd >/dev/null 2>&1; then

  builder_not_privileged() {
    local p u
    p=$(docker inspect manifest-buildkitd --format '{{.HostConfig.Privileged}}')
    u=$(docker inspect manifest-buildkitd --format '{{.Config.User}}')
    echo "Privileged=$p User=$u (want false, and a non-root uid)"
    [ "$p" = "false" ] && [ -n "$u" ] && [ "$u" != "root" ] && [ "$u" != "0:0" ]
  }
  check "the builder is rootless AND non-privileged"  builder_not_privileged

  builder_runs_rootlesskit() {
    local out; out=$(docker exec manifest-buildkitd ps -o user,comm 2>&1)
    echo "$out" | tr '\n' ' '
    echo "$out" | grep -q rootlesskit
  }
  check "rootlesskit is the process supervisor"  builder_runs_rootlesskit

  builder_egress_blocked() {
    local out
    out=$(docker exec manifest-buildkitd wget -q -T4 -O- https://registry.npmjs.org/ 2>&1)
    echo "builder reaching npmjs: ${out:0:60}"
    [ -z "$out" ]
  }
  check "NEGATIVE CONTROL: the builder cannot reach the public internet"  builder_egress_blocked

  builder_reaches_mirror() {
    docker exec manifest-buildkitd wget -q -T4 -O- http://manifest-verdaccio:4873/-/ping >/dev/null &&
    echo "mirror reachable from the builder"
  }
  check "the builder can reach the package mirror"  builder_reaches_mirror

else
  report "builder" echo "not running — start with: docker compose --profile build up -d builder"
fi
```

- [ ] **Step 2: Run and confirm the block is skipped, then fails once started**

```bash
make verify                     # the block is skipped: INFO line only
docker compose -f infra/compose.yaml -p manifest --profile build up -d builder
```
Expected: the service does not exist yet — Compose errors. That is the failing state.

- [ ] **Step 3: Write `buildkitd.toml`**

`infra/buildkit/buildkitd.toml`:

```toml
# BOTH stanzas are required and NEITHER is discoverable from the error message
# they prevent (S1).

# BuildKit generates its own resolv.conf for RUN steps, so Docker service names
# do not resolve without this. The symptom is:
#   npm error ... getaddrinfo ENOTFOUND manifest-verdaccio
[dns]
  nameservers = ["127.0.0.11"]

# The local registry is plain HTTP. Without this the builder refuses to pull the
# mirrored base images `make seed` pushed, and offline builds fail.
[registry."manifest-registry:5000"]
  http = true
  insecure = true
```

- [ ] **Step 4: Add the builder service**

Append under `services:`:

```yaml
  builder:
    # Transient in production use — the driver creates and destroys one per build
    # (§12). Here it sits behind a profile so `make up` does not carry it.
    profiles: [build]
    image: moby/buildkit:v0.32.2-rootless
    container_name: manifest-buildkitd
    restart: unless-stopped
    # INTERNAL NETWORK ONLY. This is the network restriction, and Task 7's
    # negative control is what proves it is in force.
    networks: [build-internal]
    # Rootless BuildKit needs these three. It does NOT need --privileged, and
    # §12 forbids it; buildx's own docker-container driver would add it.
    security_opt:
      - seccomp=unconfined
      - apparmor=unconfined
    devices:
      - /dev/fuse
    volumes:
      - ./buildkit/buildkitd.toml:/home/user/.config/buildkit/buildkitd.toml:ro
      - buildkit-cache:/home/user/.local/share/buildkit
    # Default unix socket ONLY. `--addr tcp://…` makes the docker-container://
    # transport hang on "waiting for connection: context deadline exceeded" (S1).
    command: ["--oci-worker-no-process-sandbox"]
```

Append under `volumes:`:

```yaml
  buildkit-cache:
    name: manifest-buildkit-cache
```

- [ ] **Step 5: Start it and re-run verify**

```bash
docker compose -f infra/compose.yaml -p manifest --profile build up -d builder
make verify
```

Expected: the builder block runs, 4 more checks, 0 failed. `Privileged=false User=1000:1000`.

- [ ] **Step 6: Confirm buildx attaches over the remote driver**

```bash
docker buildx create --name manifest-remote --driver remote docker-container://manifest-buildkitd
docker buildx inspect manifest-remote --bootstrap | head -8
docker buildx rm manifest-remote
```

Expected: `Status: running`, and a `linux/arm64` platform line. If it hangs on `waiting for connection`, the daemon was started with `--addr`.

- [ ] **Step 7: Commit**

```bash
git add infra/buildkit infra/compose.yaml scripts/verify.sh
git commit -m "feat: rootless non-privileged buildkit on an internal network"
```

---

## Task 9: LiteLLM against Ollama on the host

**Files:**
- Create: `infra/litellm/config.yaml`
- Modify: `infra/compose.yaml` (the `litellm` service)
- Modify: `infra/models.txt`
- Modify: `scripts/verify.sh`, `scripts/doctor.sh`

**Interfaces:**
- Consumes: Postgres (the `litellm` database) from Task 6.
- Produces: LiteLLM on `127.0.0.1:7106`, serving the logical model names `default-chat`, `default-chat-onprem` and `default-embed` (§7) against Ollama on the host. P4 mints keys against it and writes the client.

**Everything here is S3's output.** Three settings are load-bearing and each was measured:

1. **A synthetic per-token cost.** Ollama is free, so without one no budget is ever reachable *and* every per-user spend row reads `$0.00` — D8's attribution becomes untestable along with §10's budgets.
2. **`store_prompts_in_spend_logs: false`, explicitly.** The default is off, but when the key is *absent* from the YAML, LiteLLM prefers the value the admin UI wrote to the database. Without the line, one click starts retaining student prompts and the config file will not override it (§7).
3. **`STORE_MODEL_IN_DB`.** A config-file deployment cannot be removed through the admin API at all, so a file-held catalogue turns every fleet repoint into a restart (§7).

And **the chat model must be a non-thinking model.** A thinking model streams `reasoning_content` deltas that clients discard, so the console gets zero chunks, an empty string and no error — at any token budget. S3 measured 1,677 reasoning frames and zero content frames from a 4B thinking model asked to count to five.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify.sh`, before `summary`:

```bash
echo
echo "AI (§10, S3)"

litellm_ready() {
  local out; out=$(curl -sS "http://127.0.0.1:$PORT_LITELLM/health/readiness")
  echo "$out"
  echo "$out" | grep -q '"db":"connected"'
}
check "LiteLLM is up with its database connected"  litellm_ready

litellm_logical_names_only() {
  local got
  got=$(curl -sS "http://127.0.0.1:$PORT_LITELLM/v1/models" -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
        | sed 's/.*"data"://' | grep -o '"id":"[^"]*"' | cut -d'"' -f4 | sort | tr '\n' ' ')
  echo "catalogue: $got"
  echo "$got" | grep -q 'default-chat' && echo "$got" | grep -q 'default-embed' \
    && ! echo "$got" | grep -q 'ollama'
}
check "only logical model names are exposed (§7)"  litellm_logical_names_only

# THE CHECK THAT CATCHES A THINKING MODEL. A completion alone would pass; only a
# STREAM with non-empty content proves the console will work (S3).
litellm_streams_content() {
  local n
  n=$(curl -sS -N "http://127.0.0.1:$PORT_LITELLM/v1/chat/completions" \
       -H "Authorization: Bearer $LITELLM_MASTER_KEY" -H 'Content-Type: application/json' \
       -d '{"model":"default-chat","stream":true,"max_tokens":300,
            "messages":[{"role":"user","content":"Count 1 to 5, digits only."}]}' \
       | grep -c '"content":"[^"]')
  echo "$n streamed frames carried content (0 means default-chat is a THINKING model)"
  [ "$n" -gt 0 ]
}
check "a streamed completion returns non-empty content"  litellm_streams_content

# THE CHECK THAT CATCHES THE SILENT EMBEDDING CORRUPTION. Asserts the DIMENSION,
# not that a vector came back — 192 near-zero values look like success (S3).
litellm_embedding_dimension() {
  local d
  d=$(curl -sS "http://127.0.0.1:$PORT_LITELLM/v1/embeddings" \
       -H "Authorization: Bearer $LITELLM_MASTER_KEY" -H 'Content-Type: application/json' \
       -d '{"model":"default-embed","input":"chemistry lab scheduling","encoding_format":"float"}' \
       | grep -o '\[[-0-9].*\]' | tr ',' '\n' | wc -l | tr -d ' ')
  echo "embedding dimension = $d (want 768 for nomic-embed-text)"
  [ "$d" = "768" ]
}
check "an embedding comes back at full dimension"  litellm_embedding_dimension

litellm_prompt_logging_off() {
  local n
  n=$(docker exec manifest-postgres psql -U manifest -d litellm -tAc \
      "SELECT count(*) FROM \"LiteLLM_SpendLogs\" WHERE proxy_server_request::text NOT IN ('{}','null')" 2>/dev/null)
  echo "$n spend rows carry request content (want 0 — §7's retention decision)"
  [ "${n:-0}" = "0" ]
}
check "no prompt content is persisted"  litellm_prompt_logging_off
```

And append to `scripts/doctor.sh`, before `summary`:

```bash
echo
echo "Ollama (host application — §21)"
check "Ollama is running"  sh -c 'curl -sf http://127.0.0.1:11434/api/version'
check_models() {
  local missing="" m
  while read -r m; do
    [ -z "$m" ] && continue
    case "$m" in \#*) continue;; esac
    ollama list | awk 'NR>1{print $1}' | grep -qx "$m" || missing="$missing $m"
  done < infra/models.txt
  [ -z "$missing" ] && { echo "all models in infra/models.txt present"; return 0; }
  echo "missing:$missing — run: make seed"; return 1
}
check "the models infra/models.txt names are present"  check_models
```

Run: `make verify` and `make doctor` — the new checks FAIL.

- [ ] **Step 2: Name the models**

`infra/models.txt`:

```
# Models `make seed` pulls. NON-THINKING chat model, deliberately: a thinking
# model streams reasoning_content deltas the toolkit discards, so the console
# receives zero chunks and no error, at any token budget (S3 §Evidence 9).
ministral-3:latest
nomic-embed-text:latest
```

- [ ] **Step 3: Write the LiteLLM config**

`infra/litellm/config.yaml`:

```yaml
# Logical model names only (§7): an app never sees a vendor model id, and an admin
# repoints the whole fleet by changing one mapping.
#
# The catalogue is DB-held at runtime (STORE_MODEL_IN_DB); these entries are the
# bootstrap set. A config-file deployment cannot be deleted through the admin API
# at all, so anything expected to change lives in the database (S3 §Evidence 7).

model_list:
  - model_name: default-chat
    litellm_params:
      model: ollama_chat/ministral-3:latest
      api_base: http://host.docker.internal:11434
      # SYNTHETIC COST — load-bearing. Ollama is free, so without it no budget is
      # ever reachable AND every per-user spend row reads $0.00, which makes D8's
      # attribution as untestable as §10's budgets (S3 §Evidence 4, 5).
      input_cost_per_token: 0.000001     # $1.00 / M input tokens
      output_cost_per_token: 0.000003    # $3.00 / M output tokens
    model_info:
      max_classification: internal       # D17; survives round-trip via /model/info

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
  master_key: os.environ/LITELLM_MASTER_KEY
  # EXPLICIT, and load-bearing. The default is off, but when this key is ABSENT
  # from the YAML, LiteLLM prefers the value the admin UI wrote to the database —
  # so without this line one click starts retaining student prompts and the config
  # file will not override it (§7, S3 §Evidence 12).
  store_prompts_in_spend_logs: false
```

- [ ] **Step 4: Add the service**

Append under `services:`:

```yaml
  litellm:
    image: ghcr.io/berriai/litellm:main-stable
    container_name: manifest-litellm
    restart: unless-stopped
    depends_on:
      postgres: { condition: service_healthy }
    networks: [platform]
    environment:
      DATABASE_URL: postgresql://manifest:${POSTGRES_PASSWORD}@postgres:5432/litellm
      LITELLM_MASTER_KEY: ${LITELLM_MASTER_KEY:?set LITELLM_MASTER_KEY in .env}
      LITELLM_SALT_KEY: ${LITELLM_SALT_KEY:?set LITELLM_SALT_KEY in .env}
      # The catalogue must be DB-held or every fleet repoint needs a restart (§7).
      STORE_MODEL_IN_DB: "True"
    extra_hosts:
      # Ollama is a HOST application — Metal GPU access is unavailable from a
      # container (§21). This is how the container reaches it (S7, S3).
      - "host.docker.internal:host-gateway"
    volumes:
      - ./litellm/config.yaml:/app/config.yaml:ro
    ports:
      - "127.0.0.1:7106:4000"
    # NOT --detailed_debug: it writes full prompt text to stdout and hence into
    # §14's log pipeline (S3 §Evidence 12).
    command: ["--config", "/app/config.yaml", "--port", "4000"]
    healthcheck:
      test: ["CMD", "curl", "-sf", "http://127.0.0.1:4000/health/readiness"]
      interval: 5s
      timeout: 5s
      retries: 24
```

- [ ] **Step 5: Start it and re-run both scripts**

```bash
ollama pull ministral-3:latest
ollama pull nomic-embed-text:latest
docker compose -f infra/compose.yaml -p manifest up -d litellm
set -a; . ./.env; set +a
make verify
make doctor
```

Expected: both exit 0. In particular the stream check reports a non-zero content-frame count and the embedding check reports `768`.

- [ ] **Step 6: Prove the two silent failures are real, then restore**

Both of these look like success if you do not assert the shape of the answer.

```bash
# (a) the embedding, WITHOUT encoding_format — the SDK-default path
curl -sS http://127.0.0.1:7106/v1/embeddings -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"model":"default-embed","input":"x","encoding_format":"base64"}' | head -c 120
```
Expected: a **plain float list**, not base64 — LiteLLM's Ollama path ignores the parameter, which is what makes a client's base64 default decode to 192 zeros.

```bash
# (b) a thinking model streams nothing. Add one temporarily and watch.
curl -sS -X POST http://127.0.0.1:7106/model/new -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"model_name":"probe-thinking","litellm_params":{"model":"ollama_chat/qwen3.5:4b","api_base":"http://host.docker.internal:11434"}}'
sleep 12
curl -sS -N http://127.0.0.1:7106/v1/chat/completions -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"model":"probe-thinking","stream":true,"max_tokens":600,"messages":[{"role":"user","content":"Count 1 to 5, digits only."}]}' \
  | grep -c '"content":"[^"]'
```
Expected: **`0`** content frames, alongside hundreds of `reasoning_content` frames. Remove the probe deployment afterwards via `POST /model/delete` with its `model_id`.

*(This step needs `qwen3.5:4b` present. If it is not, skip it and record that the control was not exercised — do not silently drop it.)*

- [ ] **Step 7: Commit**

```bash
git add infra/litellm infra/models.txt infra/compose.yaml scripts/verify.sh scripts/doctor.sh
git commit -m "feat: litellm against host ollama, with S3's three mandatory settings"
```

---

## Task 10: The Manifest IdP

**Files:**
- Create: `infra/idp/Dockerfile`
- Create: `infra/idp/config/config.php`, `infra/idp/config/authsources.php`
- Create: `infra/postgres/initdb/20-idp-metadata.sql`
- Modify: `infra/compose.yaml` (the `idp` service)
- Modify: `scripts/verify.sh`

**Interfaces:**
- Consumes: Postgres (the `manifest_idp` database) from Task 6.
- Produces: SimpleSAMLphp on `127.0.0.1:7122`, reading SP metadata from SQL. P4 writes SP rows into `saml20_sp_remote`; **Manifest writes no PHP** (S2).

**Everything here is S2's output**, and four of its findings are traps:

- `docker-php-ext-install pdo_pgsql` **also needs `libpq-dev`**.
- The `pdo` entry in `metadata.sources` carries **no** connection details — the handler ignores them and reads the global `database.*` block.
- **`database.*` and `store.sql.*` are different subsystems.** The latter is the session store; proving one works proves nothing about the other.
- With the same entityID in both a flatfile and the SQL store, **the first matching `metadata.sources` entry wins** — a stale file silently shadows a SQL row. So the SQL source goes **first**.

**Port 7122, deliberately not 6122** — that is taken by the standalone `docker-simple-saml` on this machine (§21).

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify.sh`, before `summary`:

```bash
echo
echo "Identity (§9, S2)"

idp_serves() {
  local code; code=$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT_IDP/")
  echo "http://127.0.0.1:$PORT_IDP/ -> $code"
  [ "$code" = "200" ] || [ "$code" = "302" ]
}
check "the Manifest IdP serves"  idp_serves

idp_has_pdo_pgsql() {
  local out; out=$(docker exec manifest-idp php -m 2>/dev/null | grep -c '^pdo_pgsql$')
  echo "pdo_pgsql loaded: $out (needs libpq-dev at build time — S2)"
  [ "$out" = "1" ]
}
check "the IdP image has pdo_pgsql"  idp_has_pdo_pgsql

# The SQL metadata source is the mechanism S2 proved: one INSERT registers an SP
# on the NEXT HTTP request — no reload, no restart, no cache TTL.
idp_reads_metadata_from_sql() {
  docker exec manifest-postgres psql -U manifest -d manifest_idp -tAc \
    "SELECT to_regclass('public.saml20_sp_remote') IS NOT NULL" | grep -q t \
    && echo "saml20_sp_remote exists in manifest_idp"
}
check "the SQL metadata table exists"  idp_reads_metadata_from_sql
```

Run: `make verify` — all three FAIL.

- [ ] **Step 2: Write the IdP image**

`infra/idp/Dockerfile`:

```dockerfile
# Based on the proven docker-simple-saml image (S2), with the ONE change S2
# identified: pdo_pgsql, which ALSO needs libpq-dev — the ext-install alone fails.
FROM php:8.3-apache

RUN apt-get update && apt-get install -y --no-install-recommends \
      libpq-dev unzip git \
 && docker-php-ext-install pdo_pgsql \
 && apt-get purge -y --auto-remove git \
 && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
RUN composer create-project simplesamlphp/simplesamlphp:^2.0 /var/simplesamlphp --no-interaction

ENV SIMPLESAMLPHP_CONFIG_DIR=/var/simplesamlphp/config
RUN sed -ri 's!DocumentRoot /var/www/html!DocumentRoot /var/simplesamlphp/public!' \
      /etc/apache2/sites-available/000-default.conf \
 && printf '<Directory /var/simplesamlphp/public>\n  AllowOverride All\n  Require all granted\n</Directory>\n' \
      > /etc/apache2/conf-available/ssp.conf \
 && a2enconf ssp
```

- [ ] **Step 3: Write the SimpleSAMLphp config**

`infra/idp/config/config.php` — only the parts P1 sets; the rest is upstream default:

```php
<?php
$config = [
    'baseurlpath' => '/',
    'technicalcontact_email' => 'noreply@manifest.internal',
    'secretsalt' => getenv('SSP_SECRET_SALT') ?: 'change-me-locally',
    'auth.adminpassword' => getenv('SSP_ADMIN_PASSWORD') ?: 'change-me-locally',

    // The GLOBAL connection block. The `pdo` entry in metadata.sources carries NO
    // connection details of its own — the handler ignores any it is given and
    // reads THIS (S2). Getting that backwards is a wasted afternoon.
    'database.dsn'      => 'pgsql:host=postgres;port=5432;dbname=manifest_idp',
    'database.username' => 'manifest',
    'database.password' => getenv('POSTGRES_PASSWORD'),

    // DIFFERENT SUBSYSTEM from database.* above: this is the session/data store.
    // Proving one works proves nothing about the other (S2).
    'store.type'    => 'sql',
    'store.sql.dsn' => 'pgsql:host=postgres;port=5432;dbname=manifest_idp',
    'store.sql.username' => 'manifest',
    'store.sql.password' => getenv('POSTGRES_PASSWORD'),

    // ORDER MATTERS. The FIRST matching entry wins, so a stale flatfile would
    // silently shadow a SQL row for the same entityID (S2). SQL goes first.
    'metadata.sources' => [
        ['type' => 'pdo'],
        ['type' => 'flatfile', 'directory' => '/var/simplesamlphp/metadata'],
    ],

    'enable.saml20-idp' => true,
];
```

`infra/idp/config/authsources.php`:

```php
<?php
// D6: the Manifest IdP serves TEST USERS ONLY and never authenticates a real
// person. Its signing key never touches a real identity, which is what keeps it
// off the top of §3.5's asset list.
$config = [
    'admin' => ['core:AdminPassword'],
    'manifest-test-users' => [
        'exampleauth:UserPass',
        // UBC sends OID, confirmed against staging and production (S2).
        'student:student' => [
            'urn:oid:1.3.6.1.4.1.60.1.1.1'  => ['stu000001'],   // ubcEduCwlPuid
            'urn:oid:0.9.2342.19200300.100.1.3' => ['student@student.ubc.ca'], // mail
            'urn:oid:2.5.4.42' => ['Test'],                     // givenName
            'urn:oid:2.5.4.4'  => ['Student'],                  // sn
            'urn:oid:1.3.6.1.4.1.5923.1.1.1.1' => ['student'],  // eduPersonAffiliation
        ],
        'instructor:instructor' => [
            'urn:oid:1.3.6.1.4.1.60.1.1.1'  => ['ins000001'],
            'urn:oid:0.9.2342.19200300.100.1.3' => ['instructor@ubc.ca'],
            'urn:oid:2.5.4.42' => ['Test'],
            'urn:oid:2.5.4.4'  => ['Instructor'],
            'urn:oid:1.3.6.1.4.1.5923.1.1.1.1' => ['faculty'],
        ],
    ],
];
```

- [ ] **Step 4: Create the metadata table**

`infra/postgres/initdb/20-idp-metadata.sql`:

```sql
-- SimpleSAMLphp's PDO metadata store. S2 proved one INSERT here registers a
-- working SP on the NEXT HTTP request: no file write, no reload, no restart, no
-- cache TTL. This is why Manifest writes no PHP.
\connect manifest_idp
CREATE TABLE IF NOT EXISTS saml20_sp_remote (
  entityid   TEXT NOT NULL PRIMARY KEY,
  entitydata TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS saml20_idp_hosted (
  entityid   TEXT NOT NULL PRIMARY KEY,
  entitydata TEXT NOT NULL
);
```

- [ ] **Step 5: Add the service**

Append under `services:`:

```yaml
  idp:
    build: { context: ./idp }
    image: manifest-idp:local
    container_name: manifest-idp
    restart: unless-stopped
    depends_on:
      postgres: { condition: service_healthy }
    networks: [platform]
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      SSP_SECRET_SALT: ${SSP_SECRET_SALT:-change-me-locally}
      SSP_ADMIN_PASSWORD: ${SSP_ADMIN_PASSWORD:-change-me-locally}
    volumes:
      - ./idp/config/config.php:/var/simplesamlphp/config/config.php:ro
      - ./idp/config/authsources.php:/var/simplesamlphp/config/authsources.php:ro
    ports:
      # 7122, deliberately NOT 6122 — that is the standalone docker-simple-saml
      # on this machine (§21).
      - "127.0.0.1:7122:80"
```

Add to `.env.example`:

```sh
SSP_SECRET_SALT=change-me-locally
SSP_ADMIN_PASSWORD=change-me-locally
```

- [ ] **Step 6: Start it and re-run verify**

```bash
docker compose -f infra/compose.yaml -p manifest up -d --build idp
make verify
```

Expected: 0 failed.

- [ ] **Step 7: Commit**

```bash
git add infra/idp infra/postgres/initdb infra/compose.yaml .env.example scripts/verify.sh
git commit -m "feat: manifest idp with the SQL metadata source S2 proved"
```

---

## Task 11: `make seed` — the only step that needs network

**Files:**
- Create: `infra/images.txt`
- Create: `infra/seed/seed.sh`
- Create: `infra/seed/mirror-images.sh`
- Consumes: `infra/lib/ensure-alias.sh` (Task 4)
- Modify: `Makefile` (the `seed` target)
- Modify: `scripts/doctor.sh` (the lockfile check)

**Interfaces:**
- Consumes: every service from Tasks 2–10.
- Produces: `infra/images.lock`; base images **inside the local registry**; a warmed Verdaccio; the Ollama models; `.env`; `infra/ca/manifest-root.crt`. Task 13 asserts that everything after this runs offline.

**S1's sharpest finding lives here.** §21 originally said `make seed` "pulls digest-pinned base images". That is **not sufficient**: BuildKit re-resolves every `FROM` against a registry on each build, and the Docker daemon's own cache is invisible to the rootless worker. An image that is merely *pulled* leaves the build failing the moment the network goes away:

```
ERROR: failed to solve: node:22-alpine: failed to resolve source metadata …
  dial tcp: lookup registry-1.docker.io … server misbehaving
```

So base images must be **pushed into the local registry**, and blueprints reference them from there, never from Docker Hub.

**Seeding also mints the CA**, which is what removes S7's run-the-script-twice dance. Seed calls `infra/lib/ensure-alias.sh` (Task 4) so the loopback alias exists, starts Caddy, extracts the internal CA root, and leaves it ready for `make host-setup` — so by the time `make up` runs, the root is already trusted and the alias is already there. The ordering matters: Caddy publishes on `127.0.0.2`, so starting it before the alias exists fails with `can't assign requested address`.

- [ ] **Step 1: Write the failing check**

Append to `scripts/doctor.sh`, before `summary`:

```bash
echo
echo "Seed state"

check_lockfile() {
  [ -f infra/images.lock ] || { echo "infra/images.lock missing — run: make seed"; return 1; }
  local n; n=$(grep -vc '^#\|^$' infra/images.lock)
  echo "$n images pinned by digest"
  [ "$n" -ge 1 ]
}
check "infra/images.lock exists and pins every base image"  check_lockfile

check_registry_has_bases() {
  local missing="" repo
  for repo in $(grep -v '^#\|^$' infra/images.txt | cut -d: -f1 | sed 's#.*/##'); do
    curl -sf "http://127.0.0.1:$PORT_REGISTRY/v2/$repo/tags/list" >/dev/null 2>&1 \
      || missing="$missing $repo"
  done
  [ -z "$missing" ] && { echo "every base image is in the local registry"; return 0; }
  # This is the difference between a build that works and one that fails the
  # moment the network goes away (S1 §Evidence 5).
  echo "NOT mirrored:$missing — offline builds will fail. Run: make seed"; return 1
}
check "base images are IN the local registry, not merely pulled"  check_registry_has_bases

check_env_file() {
  [ -f .env ] || { echo ".env missing — run: make seed"; return 1; }
  echo ".env present"
}
check ".env exists"  check_env_file
```

Run: `make doctor` — the three FAIL.

- [ ] **Step 2: Name the base images**

`infra/images.txt`:

```
# TAGS ONLY. `make seed` resolves each to a digest, writes infra/images.lock, and
# PUSHES each into the local registry — BuildKit re-resolves FROM on every build
# and cannot see the daemon's cache, so pulling alone is not enough (S1).
node:22-alpine
alpine:3.22
mongodb/mongodb-community-server:7.0.28-ubi8
curlimages/curl:8.11.1
```

- [ ] **Step 3: Write the image mirror**

`infra/seed/mirror-images.sh`:

```bash
#!/usr/bin/env bash
# Pull each tag, record its digest, and PUSH it into the local registry.
set -euo pipefail
cd "$(dirname "$0")/../.."
. infra/lib/common.sh

LOCK=infra/images.lock
: > "$LOCK"
{
  echo "# Written by make seed. tag<TAB>digest. Do not edit by hand."
  echo "# Regenerate with: make seed"
} >> "$LOCK"

while read -r tag; do
  [ -z "$tag" ] && continue
  case "$tag" in \#*) continue;; esac

  echo "  pulling $tag"
  docker pull -q "$tag" >/dev/null

  digest=$(docker image inspect "$tag" --format '{{index .RepoDigests 0}}' | cut -d@ -f2)
  printf '%s\t%s\n' "$tag" "$digest" >> "$LOCK"

  # Strip any registry prefix so the local path is stable and short.
  repo=$(echo "$tag" | sed 's#.*/##' | cut -d: -f1)
  ver=$(echo "$tag" | sed 's#.*:##')

  # 127.0.0.1, NEVER localhost — it resolves to ::1 and times out (S1, §12).
  docker tag "$tag" "127.0.0.1:$PORT_REGISTRY/$repo:$ver"
  docker push -q "127.0.0.1:$PORT_REGISTRY/$repo:$ver" >/dev/null
  echo "  mirrored -> 127.0.0.1:$PORT_REGISTRY/$repo:$ver"
done < infra/images.txt

echo "  wrote $LOCK"
```

- [ ] **Step 4: Write the seed script**

`infra/seed/seed.sh`:

```bash
#!/usr/bin/env bash
# make seed — THE ONLY STEP THAT NEEDS NETWORK. Everything after this works
# offline, which is C1's claim and Task 13's assertion.
set -euo pipefail
cd "$(dirname "$0")/../.."
. infra/lib/common.sh

echo "1/6  .env"
if [ -f .env ]; then echo "     .env exists, leaving it alone"
else cp .env.example .env; echo "     created .env from .env.example"; fi
set -a; . ./.env; set +a

echo "2/6  building the platform images"
$COMPOSE build

echo "3/6  starting the registry and the mirror"
$COMPOSE up -d registry verdaccio postgres
until curl -sf "http://127.0.0.1:$PORT_REGISTRY/v2/" >/dev/null; do sleep 1; done
until curl -sf "http://127.0.0.1:$PORT_VERDACCIO/-/ping" >/dev/null; do sleep 1; done

echo "4/6  mirroring base images into the local registry"
bash infra/seed/mirror-images.sh

echo "5/6  minting the platform CA"
# Caddy publishes on 127.0.0.2:80/443, so the alias must exist before it starts —
# otherwise Docker refuses with "can't assign requested address". Calling the
# same guard `make up` uses is what removes S7's run-the-script-twice dance.
bash infra/lib/ensure-alias.sh
$COMPOSE up -d dns-containers dns-host caddy
mkdir -p infra/ca
until docker exec manifest-caddy test -f /data/caddy/pki/authorities/local/root.crt 2>/dev/null; do sleep 1; done
docker cp manifest-caddy:/data/caddy/pki/authorities/local/root.crt "$CA_FILE"
echo "     $CA_FILE"

echo "6/6  Ollama models"
# Large and network-dependent on a clean machine, so progress is shown rather
# than swallowed — S7 called this out as the one wholly manual-feeling wait.
while read -r m; do
  [ -z "$m" ] && continue
  case "$m" in \#*) continue;; esac
  if ollama list | awk 'NR>1{print $1}' | grep -qx "$m"; then
    echo "     $m already present"
  else
    echo "     pulling $m"; ollama pull "$m"
  fi
done < infra/models.txt

cat <<EOS

Seed complete. Two things still need you:

  1. make host-setup     three privileged steps; prompts for a password twice
  2. export NODE_EXTRA_CA_CERTS="\$PWD/$CA_FILE"    (add it to your shell profile)

Then:  make up && make doctor && make verify
EOS
```

- [ ] **Step 5: Warm the package mirror**

Add to `infra/seed/seed.sh`, between steps 4 and 5:

```bash
echo "4b/6 warming the package mirror"
# What makes an offline `npm install` possible. The blueprint's dependency
# closure is fetched once, through Verdaccio, so it is cached in its storage.
tmp=$(mktemp -d)
cat > "$tmp/package.json" <<'JSON'
{ "name": "seed-warm", "private": true,
  "dependencies": { "fastify": "5.2.0", "mongodb": "6.12.0", "zod": "3.24.1" } }
JSON
(cd "$tmp" && npm install \
   --registry "http://127.0.0.1:$PORT_VERDACCIO" \
   --no-audit --no-fund --silent) || echo "     WARN: mirror warm failed"
rm -rf "$tmp"
```

- [ ] **Step 6: Wire the Makefile target**

Add to `Makefile`:

```makefile
seed:  ## The only step needing network. Run once, then work offline.
	@bash infra/seed/seed.sh
```

- [ ] **Step 7: Run it and confirm doctor passes**

```bash
make seed
make doctor
```

Expected: exit 0, `infra/images.lock` lists four `tag<TAB>sha256:…` lines, and the registry check reports every base image mirrored.

- [ ] **Step 8: Prove the mirror is really being used**

S1's most expensive mistake was a build that appeared to succeed while silently using the *public* npm registry. Check the mirror's storage, not the build's exit code:

```bash
docker exec manifest-verdaccio ls /verdaccio/storage | head
```

Expected: package directories — `fastify`, `mongodb`, `zod` and their transitive dependencies. An empty listing means the warm step silently fell through to the public registry.

- [ ] **Step 9: Commit**

```bash
git add infra/images.txt infra/seed Makefile scripts/doctor.sh
git commit -m "feat: make seed — mirror base images into the registry, warm the mirror, mint the CA"
```

---

## Task 12: `make up`, `make down`, `make reset`

**Files:**
- Modify: `Makefile`

**Interfaces:**
- Consumes: everything above, including `infra/lib/ensure-alias.sh` from Task 4.
- Produces: the four verbs §21 names. Task 13 runs them offline, from a clean checkout.

**`make up` re-adds the loopback alias.** It does not survive a reboot, and Docker refuses to bind Caddy without it. Per *Decisions*, `make up` runs the one `sudo` command itself, **guarded** so it prompts only when the alias is genuinely missing — usually once per reboot, often less. The command is printed before it runs; nothing privileged happens silently.

**`make reset` keeps two things: the seed cache and the Caddy CA.** Destroying the CA volume would invalidate the root the developer trusted in their keychain and turn a reset into a re-trust — which is exactly the kind of manual step C1 counts against us.

- [ ] **Step 1: Write the four targets**

Add to `Makefile`:

```makefile
up:  ## Boot the platform. Works offline after `make seed`.
	@bash infra/lib/ensure-alias.sh
	@$(COMPOSE) up -d --wait
	@echo
	@echo "  platform up. Next: make doctor && make verify"
	@echo "  edge: https://console.manifest.internal/"

down:  ## Stop everything. Data, the seed cache and the CA all survive.
	@$(COMPOSE) down

reset:  ## Destroy projects, volumes and registry contents. KEEPS the seed cache and the CA.
	@echo "This destroys all project data, the registry contents and the databases."
	@echo "It KEEPS infra/images.lock, the Ollama models and the Caddy CA."
	@read -p "Type 'reset' to continue: " ans; [ "$$ans" = reset ] || exit 1
	@$(COMPOSE) down
	@docker volume rm -f manifest-pgdata manifest-registry-data \
	   manifest-verdaccio-storage manifest-buildkit-cache 2>/dev/null || true
	@docker ps -aq --filter 'name=^mf-' | xargs docker rm -f 2>/dev/null || true
	@docker network ls -q --filter 'name=^mf-' | xargs docker network rm 2>/dev/null || true
	@docker volume ls -q --filter 'name=^mf-' | xargs docker volume rm 2>/dev/null || true
	@echo "reset done. manifest-caddy-data was NOT removed — the trusted CA lives there."
	@echo "Run: make up"
```

- [ ] **Step 2: Prove `--wait` gates on health, not on start**

```bash
make down
time make up
```

Expected: `make up` returns only once every service with a healthcheck reports healthy. If it returns instantly while LiteLLM is still migrating, a healthcheck is missing — add it rather than adding a `sleep`.

- [ ] **Step 3: Prove the alias guard prompts only when needed**

```bash
make up            # alias already present -> no prompt at all
sudo ifconfig lo0 -alias 127.0.0.2
make up            # explains itself, then prompts once
```

- [ ] **Step 4: Prove `make reset` keeps the CA**

```bash
BEFORE=$(shasum -a 256 infra/ca/manifest-root.crt | cut -d' ' -f1)
make reset && make up
docker cp manifest-caddy:/data/caddy/pki/authorities/local/root.crt /tmp/after.crt
AFTER=$(shasum -a 256 /tmp/after.crt | cut -d' ' -f1)
[ "$BEFORE" = "$AFTER" ] && echo "CA survived reset — keychain trust still valid" || echo "CA CHANGED — reset destroyed manifest-caddy-data"
```

Expected: `CA survived reset`. If it changed, the reset target is removing the wrong volume and every developer would have to re-trust after every reset.

- [ ] **Step 5: Full round trip**

```bash
make down && make up && make doctor && make verify
```

Expected: all four exit 0.

- [ ] **Step 6: Commit**

```bash
git add Makefile
git commit -m "feat: make up/down/reset, with a guarded alias step and a CA-preserving reset"
```

---

## Task 13: C1's actual bar — a clean checkout, offline, on a second machine

**Files:**
- Create: `docs/superpowers/RUNBOOK.md`
- Modify: `scripts/verify.sh` (the offline mode)

**Interfaces:**
- Consumes: everything.
- Produces: the demo the roadmap names for P1, and the evidence that C1 holds. Nothing later consumes this; it is the acceptance gate.

**The bar, stated exactly** (§3, C1): *a new developer reaches a working loop from a clean checkout.* Two parts of it have **never been tested** — S7 could not test the offline case at all, and no spike tested a second machine. S1 narrowed the first: a *build* with the builder and mirror both egress-blocked does succeed, so the build half is evidenced and the boot half is not. **This task is where that gap closes, and if it does not close, that is a finding to write down rather than a step to skip.**

**Run the second-machine test on a machine that has Laravel Valet installed.** That is now the known interesting case: Valet owns `.test`, port 53 and ports 80/443, and it is why the zone changed. A second machine without Valet tests the easy path.

- [ ] **Step 1: Add offline mode to verify**

Append to `scripts/verify.sh`, before `summary`:

```bash
if [ "${MANIFEST_VERIFY_OFFLINE:-0}" = "1" ]; then
  echo
  echo "Offline (C1)"

  # If this PASSES, the machine still has network and the offline claim is not
  # being tested. Fail loudly rather than reporting a false green.
  host_is_offline() {
    if curl -sf -m 5 https://registry.npmjs.org/ >/dev/null 2>&1; then
      echo "the host still reaches npmjs — turn Wi-Fi off before claiming offline"
      return 1
    fi
    echo "host has no network, as required"
  }
  check "the machine is genuinely offline"  host_is_offline

  offline_build_resolves_base_image() {
    # BuildKit re-resolves FROM on every build against a REGISTRY. This is the
    # exact failure `make seed`'s mirroring step exists to prevent (S1).
    docker run --rm --network "$NET_BUILD" curlimages/curl:8.11.1 \
      -sf "http://manifest-registry:5000/v2/node/tags/list" >/dev/null &&
    echo "node:22-alpine resolvable from the local registry with no network"
  }
  check "base images resolve from the local registry offline"  offline_build_resolves_base_image

  offline_npm_install() {
    local t rc; t=$(mktemp -d)
    printf '{"name":"o","private":true,"dependencies":{"zod":"3.24.1"}}\n' > "$t/package.json"
    # Capture npm's status FIRST. Putting `&& echo` before `rc=$?` would record
    # the echo's status and the check could never fail.
    (cd "$t" && npm install --registry "http://127.0.0.1:$PORT_VERDACCIO" \
       --no-audit --no-fund --silent) >/dev/null 2>&1; rc=$?
    rm -rf "$t"
    [ "$rc" -eq 0 ] && echo "npm install succeeded against the mirror with no network" \
                    || echo "npm install FAILED offline (exit $rc)"
    return "$rc"
  }
  check "npm install works against the mirror offline"  offline_npm_install
fi
```

- [ ] **Step 2: Run the offline pass on this machine**

Ask Rich to turn Wi-Fi off — this is his switch, and S7 recorded that it did not have it.

```bash
make down && make up && make doctor
MANIFEST_VERIFY_OFFLINE=1 make verify
```

Expected: every check passes with the network off. **If something fails, that is the finding**: record exactly what needed the network, in `RUNBOOK.md` under *Known gaps*, and do not weaken the check to make it pass.

- [ ] **Step 3: Write the runbook**

`docs/superpowers/RUNBOOK.md`:

````markdown
# Running Manifest locally

Everything here is verified. If a step does not behave as described, that is a bug
in the platform, not in your machine — `make doctor` first, then open an issue with
its output.

## First time

```bash
git clone <repo> && cd manifest
make seed            # the only step needing network. Pulls images and models.
make host-setup      # three privileged steps. Prompts for a password twice.
export NODE_EXTRA_CA_CERTS="$PWD/infra/ca/manifest-root.crt"   # add to your profile
make up
make doctor && make verify
```

Then open <https://console.manifest.internal/>. No port, no certificate warning.

## Every day

```bash
make up        # re-adds the 127.0.0.2 alias if a reboot removed it
make down
```

## If something is wrong

`make doctor` first. Every check in it corresponds to something that actually went
wrong during a spike; none is hypothetical.

| Symptom | Cause |
|---|---|
| `curl: (6) Could not resolve host` **while `dig +short` returns the right address** | dnsmasq is missing `--local=/manifest.internal/`, so AAAA is SERVFAIL and both musl and glibc fail the whole dual-stack lookup. |
| `bind: can't assign requested address` | The `127.0.0.2` alias is gone — a reboot removes it. `make up` re-adds it. |
| A container cannot resolve `manifest-postgres` | dnsmasq is missing `--server=127.0.0.11`, so `--no-resolv` made it authoritative for everything. |
| Node reaches the edge but `curl` does not, or vice versa | Trust is needed in **three** places, not two: the macOS keychain, container trust stores, and `NODE_EXTRA_CA_CERTS` for host Node processes. |
| A build fails on `failed to resolve source metadata` | The base image is not in the local registry. `make seed`. Pulling alone is not enough — BuildKit cannot see the daemon's cache. |
| `docker push` hangs | You used `localhost`. It resolves to `::1`. Use `127.0.0.1`. |
| The console streams nothing, with no error | `default-chat` is pointed at a *thinking* model. Its reasoning arrives as `reasoning_content`, which clients discard. Use a non-thinking model. |
| An embedding "works" but retrieval is nonsense | The caller omitted `encoding_format: 'float'` and got 192 zeros instead of 768 floats. |

## What this does to your machine

Three things, all reversible with `make host-undo`:

1. `/etc/resolver/manifest.internal` — scoped to our zone only.
2. A `127.0.0.2` alias on `lo0`.
3. Caddy's CA root trusted in the System keychain.

**Laravel Valet is never touched.** It keeps `.test`, port 53, and `127.0.0.1:80`
and `:443`. If you run Valet, everything above still applies unchanged — that is
precisely why the zone is `manifest.internal` and the edge is on `127.0.0.2`.

## Known gaps

*(Fill this in from Task 13's offline and second-machine runs. If either did not
happen, say so here rather than leaving the section empty.)*
````

- [ ] **Step 4: The second-machine run**

On a **different Mac, one that has Valet installed**, from a clean clone:

```bash
git clone <repo> && cd manifest
make seed && make host-setup && make up
make doctor && make verify
```

Expected: all green with no edits to any file. Record the machine's macOS version, chip and Docker Desktop version in `RUNBOOK.md`.

**If a second machine is not available**, say so in `RUNBOOK.md` under *Known gaps*, with the date — do not mark this task complete on the strength of one machine. An untested claim recorded honestly is worth more than a green checkbox, and the roadmap's lessons section says so in two places.

- [ ] **Step 5: Leave the machine as you found it, and prove it**

```bash
make down
make host-undo
ls /etc/resolver/                                   # test and vibonarium.local only
ifconfig lo0 | grep 'inet 127'                      # 127.0.0.1 only
security find-certificate -a -c "Caddy Local Authority" \
  /Library/Keychains/System.keychain | grep -c keychain    # want 0
docker ps --format '{{.Names}}'                     # only pre-existing containers
```

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/RUNBOOK.md scripts/verify.sh
git commit -m "docs: runbook, and the offline half of C1's acceptance"
```

---

## Self-review

Run this against the spec before declaring P1 done.

**Spec coverage.** §21's inventory, item by item: Caddy ✓ Task 3–4 · builder ✓ Task 8 · dnsmasq ×2 ✓ Task 2 · Postgres with three databases ✓ Task 6 · IdP ✓ Task 10 · LiteLLM ✓ Task 9 · registry ✓ Task 7 · Verdaccio ✓ Task 7 · egress proxy ✓ Task 7 · Ollama ✓ Task 9 · `seed`/`up`/`reset`/`doctor` ✓ Tasks 11–12. §21's TLS-in-three-places ✓ Task 4. §12's DNS ✓ Task 2, egress ✓ Task 7, builder ✓ Task 8. §20's custom Caddy ✓ Task 3. §23's three zones ✓ Task 5. C1 ✓ Task 13.

**Deliberately not covered, and where it goes instead:**

- **The scanner and SBOM** (§12, §21) are transient per-build components with no long-running container. They belong to **P3**, with the build path that invokes them. `make doctor` reporting the scanner database age (§12) therefore lands in P3, not here.
- **The control plane, admin UI, `manifest-mock` and the console** are host Node processes (§21) that do not exist yet. P1 provides `NODE_EXTRA_CA_CERTS` and port 7100–7104 headroom; **P2** creates them.
- **Per-app containers, networks and volumes** (`mf-` prefix) are the driver's, in **P3**. P1 only makes `make reset` clean them up.
- **The §12 container hardening baseline** is applied by the driver per container, so its flag set and S6's probes belong to **P3**, not to any long-running platform container here.

**Type and name consistency.** `ZONE`, `NET`, `NET_BUILD`, `CADDY_IP`, `DNS_C_IP`, `DNS_H_IP`, `EDGE_IP`, `CA_FILE`, `COMPOSE` and every `PORT_*` are defined once in `infra/lib/common.sh` (Task 1) and only read thereafter. `check`, `check_warn`, `report`, `require_cmd` and `summary` are defined once in `scripts/lib/check.sh` (Task 1). Container names are `manifest-<service>` throughout, matching the `container_name` in `infra/compose.yaml` and the names in `scripts/verify.sh`.

**Five things this review caught and fixed.** Recorded because an executor who
sees them will otherwise assume they are mistakes:

1. **`verify.sh` sources `.env` itself.** The LiteLLM checks need
   `LITELLM_MASTER_KEY`, and `make verify` must work as a standalone command
   rather than only after someone has exported it.
2. **`verify.sh` never runs `apk add`.** An earlier draft used
   `alpine:3.22 sh -c "apk add bind-tools; dig …"`, which needs the network — so
   the offline pass in Task 13 would have failed on its own test harness. It uses
   `manifest-dnsmasq:local`, which already carries `dig`.
3. **The egress negative control judges by curl's exit code**, not by grepping its
   output: the failure message itself contains the word "registry", so the naive
   grep could report a denial as a success.
4. **`infra/lib/ensure-alias.sh` is created in Task 4, not Task 12**, because
   Task 11's `make seed` needs it — Caddy publishes on `127.0.0.2` and cannot
   start before the alias exists.
5. **No `xargs -r`.** It is GNU-only, and BSD `xargs` already skips empty input.

**And one ordering to keep.** Task 3 binds Caddy to the platform network only;
Task 4 adds the `127.0.0.2` publish afterwards. If an executor merges the two,
`make seed` on a fresh machine fails with `can't assign requested address` — the
exact error Task 4 Step 9 demonstrates deliberately.

---

## What P1 hands to the next plan

- **P2** gets a running Postgres with `manifest_control` ready for Drizzle, ports 7100–7104 free for its host processes, and `NODE_EXTRA_CA_CERTS` already exported.
- **P3** gets the builder invocation, the dual-homed registry, the Caddy admin API and its `PUT`-not-`POST` ordering rule, and a `make reset` that already cleans up `mf-`-prefixed resources.
- **P4** gets LiteLLM and the IdP running with the configurations S2 and S3 proved, so it writes clients rather than infrastructure.

**The one thing P1 cannot hand on is a guess.** If Task 13's offline or second-machine run does not pass, write what failed into `RUNBOOK.md` and the roadmap's ledger. C1 is the constraint this whole plan exists to satisfy, and a green checkbox obtained by weakening a check is worth less than an honest gap.
