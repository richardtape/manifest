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
# AND IT NAMES THE DRIVER-2 MIRRORS NO PROJECT HOLDS — NAMES ONLY, NEVER REMOVES, --apply or not
# (the launch path plan's Task 2, `[M1]`: Task 1's F1). A mirror is a `.manifest/repos/<slug>.git`
# carrying the `manifest.fullName` and `manifest.webUrl` its creation wrote. `pnpm test` truncates
# `source_repositories` and leaves the mirror, and the real App's first boot found two of the
# FAKE's that way and prepared them as its own. One held by no live project's row — none at all,
# or only a deleted project's — is named with the GitHub its `webUrl` names. Removing one is a
# person's call: its repository on GitHub is separate (`scripts/github-real-repos.sh` lists the
# real App's), and a mirror's history is what a release names.
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

# What the platform attaches to an app network by design: the edge and the containers' resolver to
# EVERY one, and the AI gateway (`AI_GATEWAY_NEIGHBOUR`, runtime/docker/networks.ts) to every app that
# declares a model. A network with only these attached is holding nothing; one with anything else is in
# use. `manifest-litellm` was missing until the D5 plan's sitting 8, so every dead network of an AI app —
# the proof-app starter's, which every demo but `make demo` uses — read as held (F19).
NEIGHBOURS="manifest-caddy manifest-dns-containers manifest-litellm"

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

say "Driver-2 mirrors no project holds — named only; this script never removes one"
REPOS="${MANIFEST_REPOS_ROOT:-$ROOT/.manifest/repos}"
ORPHAN_MIRRORS=0
# Every GitHub row, LOWERCASED (GitHub keeps an organisation's capitals, `Manifest-local-dev`),
# with its project's state. Unreadable is SAID, and nothing is named rather than guessed at.
if ! ROWS="$(docker exec manifest-postgres psql -U manifest -d manifest_control -At -F '|' -c \
  "select lower(sr.full_name), p.state from source_repositories sr join projects p on p.id = sr.project_id where sr.provider = 'github'" 2>&1)"; then
  echo "  could not read source_repositories (${ROWS:0:160}) — no mirror is named"
  ROWS=""
  MIRRORS_READ=no
else
  MIRRORS_READ=yes
fi
if [ "$MIRRORS_READ" = yes ]; then
  for dir in "$REPOS"/*.git; do
    [ -d "$dir" ] || continue
    full="$(git --git-dir "$dir" config --local --get manifest.fullName 2>/dev/null || true)"
    web="$(git --git-dir "$dir" config --local --get manifest.webUrl 2>/dev/null || true)"
    # Neither key: driver 1's own bare repository, which is not a mirror.
    [ -n "$full" ] && [ -n "$web" ] || continue
    host="$(printf '%s' "$web" | sed -E 's#^[A-Za-z]+://([^/]+).*#\1#')"
    held="$(printf '%s\n' "$ROWS" | awk -F'|' -v n="$(printf '%s' "$full" | tr 'A-Z' 'a-z')" \
      '$1 == n && $2 != "deleted" { print "live"; found = 1; exit }
       $1 == n { tomb = 1 }
       END { if (!found && tomb) print "deleted" }')"
    case "$held" in
      live) echo "  KEEP   $dir — $full, a live project's (on $host)" ;;
      deleted)
        echo "  ORPHAN $dir — $full on $host; the project that held it was deleted"
        ORPHAN_MIRRORS=$((ORPHAN_MIRRORS + 1))
        ;;
      *)
        echo "  ORPHAN $dir — $full on $host; no source_repositories row names it"
        ORPHAN_MIRRORS=$((ORPHAN_MIRRORS + 1))
        ;;
    esac
  done
  [ "$ORPHAN_MIRRORS" != 0 ] || echo "  none orphaned"
fi

NET_COUNT=$(printf '%s' "$DEAD_NETS" | wc -w | tr -d ' ')
VOL_COUNT=$(printf '%s' "$DEAD_VOLS" | wc -w | tr -d ' ')

if [ "$ORPHAN_MIRRORS" != 0 ]; then
  say "$ORPHAN_MIRRORS mirror(s) no project holds — named, not removed, by either mode."
  echo "  Remove one by hand (rm -rf <dir>) once you are sure; a new project of that slug is refused"
  echo "  SOURCE_REPOSITORY_EXISTS until you do. Its repository on GitHub is separate:"
  echo "  bash scripts/github-real-repos.sh lists the real App's."
fi

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
