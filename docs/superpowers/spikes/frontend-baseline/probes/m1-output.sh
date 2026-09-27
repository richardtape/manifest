#!/bin/bash
# m1-output.sh — [M1] a container's output at size, read through containerLogs with tail 200, 1000 and all.
# Starts manifest-probe-output (node:22-alpine, the digest infra/images.lock pins), prints 5000 numbered lines
# alternately to stdout and stderr, one line of 1,048,576 "x", then "last line" with NO trailing newline, and
# sleeps. Leaves the container running for m2 unless M1_REMOVE=1; m2-timestamps.sh removes it.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../../.." && pwd)"
DIGEST=$(awk -F'\t' '$1=="node:22-alpine"{print $2}' "$ROOT/infra/images.lock")
docker rm -f manifest-probe-output >/dev/null 2>&1 || true
docker run -d --name manifest-probe-output --label manifest.probe=frontend-baseline "node@$DIGEST" node -e '
const out = process.stdout, err = process.stderr
for (let i = 1; i <= 5000; i++) (i % 2 ? out : err).write(`line ${i} ${i % 2 ? "stdout" : "stderr"}\n`)
out.write("x".repeat(1048576) + "\n")
out.write("last line")
setTimeout(() => {}, 600000)' >/dev/null
sleep 5
echo "json-file log on disk: $(docker inspect manifest-probe-output --format '{{.LogPath}}')"
echo "docker logs line count (CLI, all): $(docker logs manifest-probe-output 2>&1 | wc -l | tr -d ' ')"
for t in 200 1000 all; do bash "$HERE/run.sh" "$HERE/m1-read.mts" manifest-probe-output "$t"; done
if [ "${M1_REMOVE:-0}" = 1 ]; then docker rm -f manifest-probe-output >/dev/null; echo removed; fi
