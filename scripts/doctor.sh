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

# Ports the platform's OWN containers publish. doctor has to pass both with the
# stack down (a fresh machine) and with it up — `make up && make doctor` is the
# RUNBOOK's first-time flow and Task 12's round trip — so "free" cannot mean
# "unbound". It means "held by nothing except us".
manifest_own_ports() {
  docker ps --filter 'name=^manifest-' --format '{{.Ports}}' 2>/dev/null \
    | tr ',' '\n' | sed -n 's/.*:\([0-9][0-9]*\)->.*/\1/p' | sort -u
}
# §21 puts four things on the HOST rather than in a container, and the control
# plane is one of them — it needs the Docker socket, which §12 forbids mounting
# into a workload container. So `manifest_own_ports` above, which reads published
# CONTAINER ports, cannot see it, and `make doctor` failed with "CLAIMED BY
# SOMETHING ELSE: 7100" during the platform's own documented flow: `make up`,
# start the control plane, `make demo`, `make doctor`. Found 2026-09-07, once
# there was a control plane worth running.
#
# It is identified by ASKING IT, not by matching a process name: `node` on 7100 is
# a guess, whereas the D23.7 error envelope on /auth/me is this application
# answering. A different service on that port stays foreign, which is the point.
control_plane_is_ours() {
  curl -sS -m 2 "http://127.0.0.1:$PORT_CONTROL_PLANE/auth/me" 2>/dev/null \
    | grep -q 'UNAUTHENTICATED'
}
check_block() {
  local p busy="" foreign="" ours
  ours=" $(manifest_own_ports | tr '\n' ' ')"
  if control_plane_is_ours; then ours="$ours $PORT_CONTROL_PLANE "; fi
  for p in $(seq $PORT_BLOCK_START $PORT_BLOCK_END); do
    port_free "$p" && continue
    case "$ours" in
      *" $p "*) busy="$busy $p" ;;
      *)        foreign="$foreign $p" ;;
    esac
  done
  if [ -n "$foreign" ]; then
    echo "CLAIMED BY SOMETHING ELSE:$foreign — the platform cannot bind these"
    return 1
  fi
  [ -z "$busy" ] && { echo "7100-7199 all free"; return 0; }
  echo "7100-7199 free except$busy, which Manifest's own containers publish"
}
check "ports 7100-7199 free, or held only by Manifest"  check_block

# NEVER assume 53, 80 or 443 are free. Valet owns all three here (S7) and the
# design accommodates that rather than fighting it.
#
# WITHOUT sudo, lsof CANNOT SEE SOCKETS OWNED BY OTHER USERS, and Valet's dnsmasq
# runs as `nobody`. So an empty result means "nothing visible to this user", NOT
# "free" — printing a bare blank line here is how a busy port reads as an idle
# one. scripts/snapshot-machine.sh was corrected for exactly this misreading.
port_owner() {
  local proto="$1" port="$2" out
  case "$proto" in
    udp) out=$(lsof -nP -iUDP:"$port" 2>/dev/null | awk 'NR>1{print $1" ("$3")"}' | sort -u | tr '\n' ' ') ;;
    *)   out=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | awk 'NR>1{print $1" ("$3")"}' | sort -u | tr '\n' ' ') ;;
  esac
  if [ -n "$out" ]; then echo "$out"
  else echo "nothing visible to this user — lsof cannot see other users' sockets without sudo, and Valet's dnsmasq runs as nobody"; fi
}
report "port 53 owner"   port_owner udp 53
report "port 443 owner"  port_owner tcp 443

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
# Verified 2026-09-05: with NODE_EXTRA_CA_CERTS Node gets 200; without it,
# UNABLE_TO_GET_ISSUER_CERT_LOCALLY, while curl on the same URL is fine.
#
# .env is sourced here for the same reason verify.sh sources it — it is where
# P1 puts NODE_EXTRA_CA_CERTS, so a developer who has run `make seed` should see
# a PASS rather than a WARN telling them to export something already recorded.
check_node_ca() {
  [ -f "$CA_FILE" ] || { echo "$CA_FILE missing — run make seed"; return 1; }
  if [ -z "${NODE_EXTRA_CA_CERTS:-}" ] && [ -f .env ]; then
    set -a; . ./.env; set +a
  fi
  [ -n "${NODE_EXTRA_CA_CERTS:-}" ] || { echo "NODE_EXTRA_CA_CERTS is unset and .env does not supply it"; return 1; }
  NODE_EXTRA_CA_CERTS="$NODE_EXTRA_CA_CERTS" node -e '
    const https=require("https");
    https.get("https://console.manifest.internal/",r=>{console.log("node reached the edge with NODE_EXTRA_CA_CERTS="+process.env.NODE_EXTRA_CA_CERTS+", status",r.statusCode);process.exit(0)})
         .on("error",e=>{console.log("node failed:",e.code,"— the keychain does NOT cover Node (S7)");process.exit(1)});
  '
}
check_warn "host Node trusts the CA (needs NODE_EXTRA_CA_CERTS)"  check_node_ca

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
  local missing="" repo token
  # The registry requires a scoped token from P3 Task 9 onwards, so an
  # unauthenticated GET answers 401 and `curl -sf` reports every base image as
  # missing. Minting one per repository keeps this check asserting what it always
  # asserted -- and additionally proves the issuer keypair works.
  if [ ! -f infra/registry-auth/token.key ]; then
    echo "infra/registry-auth/token.key is missing -- cannot query the registry. Run: make seed"
    return 1
  fi
  for repo in $(grep -v '^#\|^$' infra/images.txt | cut -d: -f1 | sed 's#.*/##'); do
    token=$(node infra/seed/mint-token.mjs "base/$repo" 2>/dev/null)
    curl -sf -H "Authorization: Bearer $token" \
      "http://127.0.0.1:$PORT_REGISTRY/v2/base/$repo/tags/list" >/dev/null 2>&1 \
      || missing="$missing $repo"
  done
  [ -z "$missing" ] && { echo "every base image is in the local registry"; return 0; }
  # This is the difference between a build that works and one that fails the
  # moment the network goes away (S1 §Evidence 5).
  echo "NOT mirrored:$missing — offline builds and scans will fail. Run: make seed"; return 1
}
check "base images are IN the local registry, not merely pulled"  check_registry_has_bases

# A WARNING, never a check: §12 says a stale database warns rather than blocks, and
# a doctor that fails here would stop an offline developer for the one gate that is
# explicitly allowed to degrade.
scanner_db_age() {
  local built age
  # Ask GRYPE, not the volume. The v6 database has no metadata.json -- it is
  # `import.json`, `last_update_check` and `vulnerability.db` -- so reading a file
  # by name reports "no database" against a perfectly good one.
  built=$(docker run --rm -v manifest-grype-db:/db \
            -e GRYPE_DB_CACHE_DIR=/db -e GRYPE_DB_AUTO_UPDATE=false \
            -e GRYPE_CHECK_FOR_APP_UPDATE=false \
            anchore/grype:v0.118.0 db status -o json 2>/dev/null \
          | sed -n 's/.*"built": *"\([^"]*\)".*/\1/p' | head -1)
  if [ -z "$built" ]; then
    echo "no vulnerability database -- run 'make seed' with network"
    return 1
  fi
  # BSD date. No -d, no --date; and -u, or an ISO-8601 Z timestamp is read as LOCAL
  # time and the age is off by the offset.
  age=$(( ( $(date +%s) - $(date -u -j -f '%Y-%m-%dT%H:%M:%SZ' "$built" +%s 2>/dev/null || echo 0) ) / 86400 ))
  echo "vulnerability database built $built, ${age} days old (warns above 7, never blocks)"
  [ "$age" -le 7 ]
}
check_warn "the vulnerability database is fresh"  scanner_db_age

check_env_file() {
  [ -f .env ] || { echo ".env missing — run: make seed"; return 1; }
  echo ".env present"
}
check ".env exists"  check_env_file

# A pinned API version nobody checks is a 400 arriving three tasks later. The
# driver pins v1.44 deliberately (§21 records the daemon's window); this asserts
# the pin is still inside it rather than trusting a number written months ago.
docker_api_window() {
  local api min
  api=$(docker version --format '{{.Server.APIVersion}}' 2>/dev/null)
  min=$(docker version --format '{{.Server.MinAPIVersion}}' 2>/dev/null)
  [ -n "$api" ] && [ -n "$min" ] || { echo "cannot read the daemon API window"; return 1; }
  echo "daemon serves API [$min, $api]; the driver pins v1.44"
  # Integer compare on the minor, which is all that varies in practice. The major
  # has been 1 since 2013 and a change there would need a driver rewrite anyway.
  [ "${api#*.}" -ge 44 ] && [ "${min#*.}" -le 44 ]
}
check "the Docker API version the driver pins is inside the daemon's window"  docker_api_window

summary
