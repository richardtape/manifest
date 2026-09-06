#!/usr/bin/env bash
#
# Record what this machine looks like, so "leave it exactly as you found it" is a
# diff rather than a memory. Run it BEFORE touching anything and AGAIN at the end:
#
#   ./scripts/snapshot-machine.sh > /tmp/before.txt
#   ...do the work...
#   ./scripts/snapshot-machine.sh > /tmp/after.txt
#   diff /tmp/before.txt /tmp/after.txt
#
# This is NOT `make doctor` (P1 Task 2). doctor answers "are the preconditions met?"
# with a pass or a fail. This answers "what is here right now?" and has no opinion.
#
# Read-only. No sudo. No network. Nothing here starts, stops or creates anything.
#
# macOS ships bash 3.2 and a BSD userland (ORIENTATION §4): no associative arrays,
# no mapfile, no `xargs -r`, no `readlink -f`, no GNU-only flags. Keep it that way —
# a script that needs Homebrew bash 5 is a C1 defect.

set -u

section() { printf '\n=== %s ===\n' "$1"; }
have() { command -v "$1" >/dev/null 2>&1; }

printf 'Manifest machine snapshot\n'
printf 'taken: %s\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')"
printf 'host:  %s\n' "$(hostname)"
printf 'user:  %s\n' "$(whoami)"

section "Platform"
printf 'macOS       %s (build %s)\n' "$(sw_vers -productVersion)" "$(sw_vers -buildVersion)"
printf 'arch        %s\n' "$(uname -m)"
printf 'cores       %s\n' "$(sysctl -n hw.ncpu)"
printf 'RAM         %s GiB\n' "$(( $(sysctl -n hw.memsize) / 1073741824 ))"
printf 'free disk   %s\n' "$(df -h / | awk 'NR==2 {print $4}')"
printf 'bash        %s\n' "${BASH_VERSION}"

section "Host toolchain — things that genuinely live on this machine"
# §21: the ONLY host-resident pieces are Ollama (Metal GPU is unreachable from a
# container), the control plane, the admin UI, manifest-mock and the console. Caddy,
# Postgres, the registry, Verdaccio, LiteLLM, the IdP, the builder and the scanners
# are all CONTAINERS and must never be installed here. An earlier version of this
# script listed `caddy` under the host toolchain and printed ABSENT, which reads as a
# missing dependency and is not one.
for t in node pnpm npm docker git make openssl; do
  if have "$t"; then
    printf '%-12s %s\n' "$t" "$("$t" --version 2>&1 | head -1)"
  else
    printf '%-12s ABSENT\n' "$t"
  fi
done
if have ollama; then
  printf '%-12s %s\n' "ollama" "$(ollama --version 2>&1 | head -1)"
  printf '%-12s %s\n' "  models" "$(ollama list 2>/dev/null | awk 'NR>1 {printf "%s ", $1}')"
else
  printf '%-12s ABSENT — §21 needs it as a HOST app; make seed pulls a non-thinking\n' "ollama"
  printf '             chat model and an embedding model (a thinking model streams\n'
  printf '             no content at all — S3).\n'
fi
printf '%-12s %s\n' ".nvmrc" "$(cat .nvmrc 2>/dev/null || echo 'not in this directory')"

section "Docker daemon"
if docker info >/dev/null 2>&1; then
  printf 'daemon      up\n'
  printf 'engine      %s\n' "$(docker version --format '{{.Server.Version}}' 2>/dev/null)"
  printf 'API         %s (min %s)\n' \
    "$(docker version --format '{{.Server.APIVersion}}' 2>/dev/null)" \
    "$(docker version --format '{{.Server.MinAPIVersion}}' 2>/dev/null)"
  printf 'storage     %s\n' "$(docker info --format '{{.Driver}}' 2>/dev/null)"
  # §21 wants >= 8 GB and the unit matters: 8.32 GB decimal is 7.75 GiB binary.
  printf 'VM memory   %s bytes\n' "$(docker info --format '{{.MemTotal}}' 2>/dev/null)"
  printf 'security    %s\n' "$(docker info --format '{{.SecurityOptions}}' 2>/dev/null)"

  section "Containers (all states)"
  docker ps -a --format '{{.Names}}\t{{.Image}}\t{{.Status}}' 2>/dev/null | sort

  section "Must-survive containers (ORIENTATION §4)"
  for c in docker-simple-saml-saml-idp-1 qdrant-local-dev mongodb mongo-express; do
    printf '%-34s %s\n' "$c" "$(docker inspect -f '{{.State.Status}}' "$c" 2>/dev/null || echo 'ABSENT')"
  done

  section "Images (repo:tag @ digest)"
  docker images --digests --format '{{.Repository}}:{{.Tag}}\t{{.Digest}}' 2>/dev/null | sort

  section "Networks"
  docker network ls --format '{{.Name}}\t{{.Driver}}\t{{.Scope}}' 2>/dev/null | sort

  section "Volumes"
  docker volume ls --format '{{.Name}}' 2>/dev/null | sort
else
  printf 'daemon      DOWN — Docker Desktop is not running.\n'
  printf '\nEverything below this line needs it. Start Docker Desktop and re-run\n'
  printf 'before you conclude anything about images, containers, networks or volumes.\n'
  printf 'Three images on ORIENTATION §4'"'"'s "already pulled" list were pruned between\n'
  printf 'sessions, so that list is a hint and this section is the fact.\n'
fi

section "Ports — the 7100-7199 block P1 claims"
busy=$(lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | awk '{print $9}' | sed 's/.*://' \
       | awk '$1 >= 7100 && $1 <= 7199' | sort -u)
if [ -z "$busy" ]; then
  printf 'entirely free\n'
else
  printf 'IN USE: %s\n' "$(echo "$busy" | tr '\n' ' ')"
fi

section "Ports other things hold (ORIENTATION §4)"
# TCP *and* UDP. Checking only TCP reports port 53 as free while Valet's dnsmasq is
# plainly running on it, because DNS is UDP — a wrong answer that looks like a
# measurement. Caught by this script's own first run, 2026-09-04.
for p in 53 80 443 6122 6333 6334 8081 11434 27017; do
  tcp=$(lsof -nP -iTCP:"$p" -sTCP:LISTEN 2>/dev/null | awk 'NR==2 {print $1}')
  udp=$(lsof -nP -iUDP:"$p" 2>/dev/null | awk 'NR==2 {print $1}')
  who=""
  [ -n "$tcp" ] && who="tcp:$tcp"
  [ -n "$udp" ] && who="$who udp:$udp"
  [ -z "$who" ] && who='(nothing visible to this user)'
  printf '%-6s %s\n' "$p" "$who"
done
printf '\n(free) is NOT what a blank means here. Without sudo, lsof cannot see sockets\n'
printf "owned by other users, and Valet's dnsmasq runs as 'nobody' — so port 53 reads\n"
printf 'as empty on this machine while dnsmasq is plainly listening on it. Confirm\n'
printf 'against the Valet section below, or re-run one port under sudo. This script\n'
printf 'reports what it can see and says so; it does not claim a port is free.\n'

section "Loopback alias 127.0.0.2 (Caddy binds it; does not survive a reboot)"
if ifconfig lo0 2>/dev/null | grep -q '127\.0\.0\.2'; then
  printf 'present\n'
else
  printf "ABSENT — 'can't assign requested address' means this. P1's make up re-adds\n"
  printf 'it with sudo, which cannot prompt from a tool call.\n'
fi

section "Resolvers in /etc/resolver (Valet owns .test — never touch it)"
if [ -d /etc/resolver ]; then
  for f in /etc/resolver/*; do
    [ -e "$f" ] || continue
    printf '%s: %s\n' "$(basename "$f")" "$(grep nameserver "$f" 2>/dev/null | tr '\n' ' ')"
  done
else
  printf '/etc/resolver does not exist\n'
fi

section "Valet (must not be disturbed)"
printf 'dnsmasq     %s\n' "$(pgrep -fl dnsmasq 2>/dev/null | head -1 || echo 'not running')"
printf 'nginx       %s\n' "$(pgrep -fl nginx 2>/dev/null | head -1 || echo 'not running')"

section "Repository"
printf 'branch      %s\n' "$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
printf 'HEAD        %s\n' "$(git log --oneline -1 2>/dev/null)"
printf 'dirty       %s file(s)\n' "$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')"

printf '\n=== end ===\n'
