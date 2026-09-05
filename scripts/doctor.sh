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

summary
