#!/usr/bin/env bash
# List, and optionally remove, the app images no container uses any more.
#
# WHY THIS EXISTS. Every build pushes an app image to the platform registry as
# `127.0.0.1:7107/local/<slug>@sha256:…`, and every deploy pulls one into the daemon. Nothing
# ever removed them: `pnpm test:docker` leaves about thirteen per run (`chem-labs`,
# `boot-recover`, `redeploy-cp`, `prod-launch`, …) and every demo a few more — measured on
# 2026-09-25 (the D5 plan's sitting 8): 285 app images, 283 of them used by no container,
# holding about 8.6 GB of their own. ORIENTATION had named the gap for weeks ("no script
# sweeps app images"); this is that script, the third beside `dead-app-resources.sh` and
# `litellm-orphans.sh`.
#
# WHY REMOVING THEM IS SAFE. The daemon's copy is a CACHE. The registry
# (`manifest-registry-data`) keeps every image a build pushed, and a deploy pulls its image
# from the registry by digest before it creates anything (`ensureImagePulled`,
# `runtime/docker/driver.ts`) — so an image removed here comes back the next time something
# deploys it. `make reset` empties the registry too, and then nothing can deploy an old
# release anyway: its database rows are gone with it.
#
#   bash scripts/app-images.sh            # list only. Changes nothing.
#   bash scripts/app-images.sh --apply    # remove every image listed DEAD, then re-measure.
#
# IT RE-DERIVES WHAT IS DEAD EVERY RUN and never takes a list on trust. An image is DEAD only
# when ALL hold:
#   - every name it carries is under `127.0.0.1:7107/local/` — an app image, built by Manifest.
#     The base-image mirror (`127.0.0.1:7107/base/…`), the platform's own images
#     (`manifest-*:local`), the upstream images Manifest needs offline, and every other
#     project's images are NEVER considered: re-pulling an upstream image needs the network;
#   - NO container of ANY state uses it — a stopped app's container needs its image to start
#     again (`docker ps -a`, not `docker ps`).
#
# Dangling images (`<none>:<none>`, no name at all) are out of scope: nothing says whose they
# are. Docker's BUILD CACHE is out of scope too, and deliberately: it holds the cached
# `apk add git` layer that lets the GitHub fake's image be rebuilt offline.
#
# macOS ships bash 3.2 and a BSD userland: no associative arrays, no `mapfile`, no `xargs -r`.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

APPLY=no
case "${1:-}" in
  --apply) APPLY=yes ;;
  '') ;;
  *) echo "usage: bash scripts/app-images.sh [--apply]" >&2; exit 2 ;;
esac

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

PREFIX='127.0.0.1:7107/local/'
WORK="$(mktemp -d -t manifest-app-images)"
trap 'rm -rf "$WORK"' EXIT

# Every image id a container of ANY state uses — full ids, as `docker inspect` gives them.
docker ps -aq | while read -r c; do docker inspect --format '{{.Image}}' "$c" 2>/dev/null || true; done \
  | sort -u > "$WORK/in-use"

# Docker's own accounting of each image's UNIQUE size (the bytes no other image shares), by
# short id — the honest number, because app images share their base layers with each other.
docker system df -v 2>/dev/null | sed -n '/^REPOSITORY/,/^$/p' \
  | awk 'NR>1 && NF>=8 {print $3, $(NF-1)}' > "$WORK/sizes" || true
mb_of() {
  awk -v id="$1" '$1==id {v=$2; m=0
    if (v ~ /GB$/) {sub(/GB/,"",v); m=v*1024} else if (v ~ /MB$/) {sub(/MB/,"",v); m=v}
    else if (v ~ /kB$/) {sub(/kB/,"",v); m=v/1024}
    printf "%.1f", m; exit}' "$WORK/sizes"
}

say "App images (${PREFIX}*)"
DEAD=""
KEPT=0
TOTAL_MB=0
for id in $(docker images --no-trunc --format '{{.ID}} {{.Repository}}' \
  | awk -v p="$PREFIX" 'index($2, p) == 1 {print $1}' | sort -u); do
  names="$(docker image inspect --format '{{range .RepoTags}}{{.}} {{end}}{{range .RepoDigests}}{{.}} {{end}}' "$id")"
  foreign=""
  for n in $names; do
    case "$n" in "$PREFIX"*) ;; *) foreign="$foreign $n" ;; esac
  done
  # The first name, without a pipe: `printf | head` under pipefail can die of SIGPIPE.
  # shellcheck disable=SC2086
  set -- $names
  first="${1:-$id}"
  short="${id#sha256:}"; short="${short:0:12}"
  if grep -qx "$id" "$WORK/in-use"; then
    echo "  KEEP   ${first%%@*} ($short) — a container uses it"
    KEPT=$((KEPT + 1))
  elif [ -n "$foreign" ]; then
    echo "  KEEP   ${first%%@*} ($short) — it is also named outside ${PREFIX}:$foreign"
    KEPT=$((KEPT + 1))
  else
    mb="$(mb_of "$short")"
    TOTAL_MB="$(awk -v a="$TOTAL_MB" -v b="${mb:-0}" 'BEGIN {printf "%.1f", a + b}')"
    DEAD="$DEAD $id"
    echo "${first%%@*}" >> "$WORK/dead-repos"
  fi
done
if [ -s "$WORK/dead-repos" ]; then
  echo "  DEAD, by app:"
  sort "$WORK/dead-repos" | uniq -c | sort -rn | sed "s|$PREFIX||; s/^/    /"
fi
DEAD_COUNT=$(printf '%s' "$DEAD" | wc -w | tr -d ' ')
echo "  DEAD   $DEAD_COUNT image(s) no container uses, holding $(awk -v m="$TOTAL_MB" 'BEGIN {printf "%.1f GB", m/1024}') of their own"
echo "  (kept: $KEPT)"

if [ "$APPLY" != yes ]; then
  say "Nothing was changed. $DEAD_COUNT app image(s) are dead."
  [ "$DEAD_COUNT" = "0" ] || echo "  Run: bash scripts/app-images.sh --apply"
  exit 0
fi

# BY EVERY NAME, not by id: an app image is named only by digest (`repo@sha256:…`), and an id
# carrying two such names is refused by `docker image rm <id>` ("referenced in multiple
# repositories"). Removing its last name removes the image. A failure is PRINTED, never
# swallowed — the re-measure below is the answer, not this loop's opinion of itself.
say "Removing"
REMOVED=0
FAILED=0
for id in $DEAD; do
  ok=yes
  for n in $(docker image inspect --format '{{range .RepoTags}}{{.}} {{end}}{{range .RepoDigests}}{{.}} {{end}}' "$id" 2>/dev/null); do
    docker image rm "$n" >/dev/null 2>&1 || true
  done
  if docker image inspect "$id" >/dev/null 2>&1; then
    # Still there: something else holds a name, or the daemon refused. Say so.
    echo "  FAILED $id — $(docker image rm "$id" 2>&1 | head -1)" >&2
    ok=no
  fi
  if [ "$ok" = yes ]; then REMOVED=$((REMOVED + 1)); else FAILED=$((FAILED + 1)); fi
done
echo "  removed $REMOVED, failed $FAILED"

say "Re-measuring, from scratch — never from the list above"
left="$(docker images --no-trunc --format '{{.ID}} {{.Repository}}' | awk -v p="$PREFIX" 'index($2, p) == 1 {print $1}' | sort -u | wc -l | tr -d ' ')"
echo "  app images left: $left (every one should be a KEEP above)"
echo "  Docker's own figures:"
docker system df | sed 's/^/    /'
[ "$FAILED" = "0" ]
