#!/usr/bin/env bash
# List, and optionally remove, the app networks and volumes no app holds any more.
#
# WHY THIS EXISTS. `pnpm test:docker` deploys throwaway apps — `chem-labs`, `saml-probe`,
# `fixture-s6` and the rest — and removes their containers when it finishes. It does NOT
# remove the network each one was given, or the database volume, so every run of the Docker
# tier leaves a fresh set behind. Measured in P5b sitting 9 (2026-09-18): the seven networks
# and the one volume that Rich had cleared by hand earlier that same day were ALL BACK after
# a single `pnpm test:docker`. So this is a recurring cost of the tier, not a backlog — a
# hand-written list is stale the next time the tier runs, which is why this re-derives.
#
# `make verify`'s *per-app resources* INFO line is the meter: `containers=N networks=M` with
# M greater than the number of live apps means an app whose containers are gone and whose
# network is not. `0/0/0` is a freshly reset machine.
#
# An agent runs this with no arguments and hands over what it prints; a person runs it with
# --apply. The session's permission classifier refuses `docker network rm` as
# *[Interfere With Workloads]* — refused again in P5b sitting 9 — and that refusal is never
# worked around. Same shape as `scripts/litellm-orphans.sh` and as the `sudo` rule.
#
#   bash scripts/dead-app-resources.sh            # list only. Changes nothing.
#   bash scripts/dead-app-resources.sh --apply    # disconnect the neighbours, then remove.
#
# IT RE-DERIVES WHAT IS DEAD EVERY RUN and never takes a list on trust. A network is dead
# only when BOTH hold: no container of ANY state is named `mf-<app>-*`, and the only things
# attached are `manifest-caddy` and `manifest-dns-containers` — which `ensureAppNetwork`
# attaches to every app network by design, the edge being the only thing that can reach an
# app and an --internal network being unable to forward a DNS query off itself. Anything
# else attached means something is using it and it is left alone.
#
# THE STOPPED-CONTAINER RULE IS THE ONE THAT MATTERS. A network removed under a stopped
# container leaves that container unable to start (ORIENTATION §4), so the container check
# reads `docker ps -a`, not `docker ps`.
#
# macOS ships bash 3.2 and a BSD userland: no associative arrays, no `mapfile`, no `xargs -r`.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

APPLY=no
case "${1:-}" in
  --apply) APPLY=yes ;;
  '') ;;
  *) echo "usage: bash scripts/dead-app-resources.sh [--apply]" >&2; exit 2 ;;
esac

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

# The two the platform attaches to every app network by design. A network with only these
# two attached is holding nothing; a network with a third is in use.
NEIGHBOURS="manifest-caddy manifest-dns-containers"

# `mf-` is ours and per-app. `manifest-` is the platform's and is NEVER considered here;
# neither is anything without the prefix — `docker-simple-saml-saml-idp-1`, `qdrant-local-dev`,
# `mongodb` and `mongo-express` in particular belong to somebody else.
app_of_network() { local n="$1"; n="${n#mf-}"; printf '%s' "${n%-*-net}"; }

say "App networks"
DEAD_NETS=""
KEPT_NETS=0
for n in $(docker network ls --format '{{.Name}}' | grep '^mf-' || true); do
  app="$(app_of_network "$n")"
  attached="$(docker network inspect "$n" --format '{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null || true)"
  # Containers of ANY state named for this app. A stopped one is a reason to keep.
  ctrs="$(docker ps -aq --filter "name=^mf-${app}-" 2>/dev/null | wc -l | tr -d ' ')"
  extra=""
  for c in $attached; do
    case " $NEIGHBOURS " in
      *" $c "*) ;;
      *) extra="$extra $c" ;;
    esac
  done
  if [ "$ctrs" != "0" ]; then
    echo "  KEEP   $n — $ctrs container(s) named mf-${app}-* still exist"
    KEPT_NETS=$((KEPT_NETS + 1))
  elif [ -n "$extra" ]; then
    echo "  KEEP   $n — something other than the platform neighbours is attached:$extra"
    KEPT_NETS=$((KEPT_NETS + 1))
  else
    echo "  DEAD   $n — no mf-${app}-* container of any state; only the platform neighbours attached"
    DEAD_NETS="$DEAD_NETS $n"
  fi
done
[ -n "$DEAD_NETS" ] || echo "  none dead"

say "App volumes"
DEAD_VOLS=""
for v in $(docker volume ls -q --filter 'name=^mf-' || true); do
  # `--filter volume=` reads containers of any state, for the same reason as above.
  holder="$(docker ps -a --filter "volume=$v" --format '{{.Names}}' 2>/dev/null | head -1 || true)"
  if [ -n "$holder" ]; then
    echo "  KEEP   $v — held by $holder"
  else
    echo "  DEAD   $v — no container of any state holds it"
    DEAD_VOLS="$DEAD_VOLS $v"
  fi
done
[ -n "$DEAD_VOLS" ] || echo "  none dead"

NET_COUNT=$(printf '%s' "$DEAD_NETS" | wc -w | tr -d ' ')
VOL_COUNT=$(printf '%s' "$DEAD_VOLS" | wc -w | tr -d ' ')

if [ "$APPLY" != yes ]; then
  say "Nothing was changed. $NET_COUNT network(s) and $VOL_COUNT volume(s) are dead."
  if [ "$NET_COUNT" != "0" ] || [ "$VOL_COUNT" != "0" ]; then
    echo "  Run: bash scripts/dead-app-resources.sh --apply"
    echo "  An agent session cannot: the classifier refuses 'docker network rm' as"
    echo "  [Interfere With Workloads]. Hand this output over rather than working around it."
  fi
  exit 0
fi

# DISCONNECT THE NEIGHBOURS FIRST, or `docker network rm` fails with "has active endpoints"
# and a `|| true` would hide it. Measured 2026-09-07: five app networks survived a cleanup
# that reported success.
say "Removing"
for n in $DEAD_NETS; do
  for c in $NEIGHBOURS; do docker network disconnect -f "$n" "$c" 2>/dev/null || true; done
  if docker network rm "$n" >/dev/null 2>&1; then echo "  removed network $n"; else echo "  FAILED network $n" >&2; fi
done
for v in $DEAD_VOLS; do
  if docker volume rm -f "$v" >/dev/null 2>&1; then echo "  removed volume $v"; else echo "  FAILED volume $v" >&2; fi
done

say "Re-measuring, from scratch — never from the list above"
echo "  networks left: $(docker network ls --format '{{.Name}}' | grep -c '^mf-' || true)"
echo "  volumes left:  $(docker volume ls -q --filter 'name=^mf-' | wc -l | tr -d ' ')"
echo "  Now run \`make verify\` and read its per-app resources INFO line."
