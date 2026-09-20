#!/usr/bin/env bash
# Constants every script and the Makefile share. Sourced, never executed.
# Values are S7's, verified.

ZONE="manifest.internal"
NET="manifest-platform"
NET_BUILD="manifest-build-internal"

CADDY_IP="10.89.0.10"     # the edge, on the platform network
DNS_C_IP="10.89.0.53"     # dnsmasq answering CONTAINERS
DNS_H_IP="10.89.0.54"     # dnsmasq answering the HOST
EDGE_IP="127.0.0.2"       # the lo0 alias Caddy's INTERNAL listener binds, so Valet keeps 127.0.0.1
# §12's public listener, made real (P6a, R3). Production only. A SECOND ADDRESS rather than a
# port, because infra/compose.yaml says in terms that a port in the URL breaks the byte-for-byte
# hostname parity §9 needs — so the faculty-facing URL stays https://<slug>.manifest.internal.
# Additive, like EDGE_IP: Valet keeps 127.0.0.1 and `make host-undo` removes both.
PUBLIC_EDGE_IP="127.0.0.3"

# The Manifest IdP's ONE name. SAML is browser-mediated, so the IdP needs a URL
# that is identical from the host, from a container and from `curl` — C1's bar.
IDP_HOST="idp.${ZONE}"

# §21 (P5a Task 3): the reference console and the API share ONE origin, through the edge.
CONSOLE_HOST="console.${ZONE}"
# The one source that origin accepts: the platform network's GATEWAY, which is where the
# host's requests reach the edge from (measured 2026-09-16, P5a Task 1 M2). App networks
# are subnets Docker chooses, so the site allows this address rather than refusing theirs.
# `make verify` holds it equal to the network's real gateway and to the Caddyfile.
HOST_SOURCE_IP="10.89.0.1"
# The name `make verify` probes the edge's WILDCARD with. A reserved label (§23,
# environments and infrastructure) that no Caddyfile site names, so the placeholder
# answers it on every machine for ever — which `console.` stopped being in P5a Task 3.
EDGE_PROBE_HOST="edge.${ZONE}"

# The LiteLLM digest, read from infra/images.lock — the one place digests live.
#
# It is pinned by DIGEST rather than by tag because `ghcr.io/berriai/litellm:
# main-stable` moves: 2026-09-07 it was sha256:20b5044b (litellm 1.98.0), and on
# 2026-09-09 a rebuild moved it to sha256:a3715fa7. §16 pins the AI error
# mapping to a version, so the version is chosen deliberately (Rich, 2026-09-09).
#
# THE FALLBACK IS A DIGEST THAT CANNOT EXIST, and that is deliberate. `make seed`
# has to interpolate compose.yaml to BUILD, at a point before its own step 4 has
# written the lock — so a `:?` here makes seeding depend on its own output and
# `make seed` fails on a clean clone. An all-zero digest lets the build proceed
# and makes `up` fail loudly with `manifest unknown` if the lock is genuinely
# missing. What proves the RUNNING container matches the lock is `make doctor`,
# which asks the daemon rather than the file.
LITELLM_DIGEST="$(awk '$1 ~ /berriai\/litellm/ {print $2}' "$(dirname "${BASH_SOURCE[0]}")/../images.lock" 2>/dev/null)"
: "${LITELLM_DIGEST:=sha256:0000000000000000000000000000000000000000000000000000000000000000}"
export LITELLM_DIGEST

PORT_CONTROL_PLANE=7100
# §21's inventory: the reference console (D22) is a HOST process, like the control plane —
# `vite dev` while working on it, `vite preview` for the acceptance (P5c Decision 4).
PORT_CONSOLE=7104
# §21's inventory again: manifest-mock is a HOST process too — the published contract from
# fixtures, so a front-end developer needs no platform at all (P5c Task 12).
PORT_MOCK=7102
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
# --env-file IS REQUIRED. Compose resolves a bare `.env` against the PROJECT
# DIRECTORY, which defaults to the compose file's own directory — so with
# `-f infra/compose.yaml` it looks for infra/.env and never sees the repo-root
# .env this plan creates. The symptom is every ${VAR} interpolating to nothing.
# `--project-directory .` would also find it but would then re-root every
# relative volume path in the compose file, which is worse.
COMPOSE="docker compose -f infra/compose.yaml -p manifest --env-file .env"
