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
check_block() {
  local p busy="" foreign="" ours
  ours=" $(manifest_own_ports | tr '\n' ' ')"
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

summary
