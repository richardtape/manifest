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

  # Pull only if the daemon does not already hold it. This is what lets the same
  # script re-mirror OFFLINE after `make reset` has emptied the registry volume:
  # the images are still in the daemon's image store, and re-tagging and pushing
  # them to a local registry needs no network.
  if docker image inspect "$tag" >/dev/null 2>&1; then
    echo "  $tag already local"
  else
    echo "  pulling $tag"
    docker pull -q "$tag" >/dev/null
  fi

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
