#!/bin/bash
# m15-switched-off.sh — [M15] starts manifest-probe-upstream on manifest-platform (node:22-alpine by digest, one
# HTTP answer), runs the probe, and removes the container whatever happens.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../../.." && pwd)"
DIGEST=$(awk -F'\t' '$1=="node:22-alpine"{print $2}' "$ROOT/infra/images.lock")
trap 'docker rm -f manifest-probe-upstream >/dev/null 2>&1; echo "manifest-probe-upstream removed"' EXIT
docker run -d --name manifest-probe-upstream --label manifest.probe=frontend-baseline --network manifest-platform "node@$DIGEST" \
  node -e 'require("http").createServer((q, s) => s.end("probe upstream answered")).listen(8080)' >/dev/null
sleep 2
bash "$HERE/run.sh" "$HERE/m15-switched-off.mts"
