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

# The Manifest IdP's ONE name. SAML is browser-mediated, so the IdP needs a URL
# that is identical from the host, from a container and from `curl` — C1's bar.
IDP_HOST="idp.${ZONE}"

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
# --env-file IS REQUIRED. Compose resolves a bare `.env` against the PROJECT
# DIRECTORY, which defaults to the compose file's own directory — so with
# `-f infra/compose.yaml` it looks for infra/.env and never sees the repo-root
# .env this plan creates. The symptom is every ${VAR} interpolating to nothing.
# `--project-directory .` would also find it but would then re-root every
# relative volume path in the compose file, which is worse.
COMPOSE="docker compose -f infra/compose.yaml -p manifest --env-file .env"
