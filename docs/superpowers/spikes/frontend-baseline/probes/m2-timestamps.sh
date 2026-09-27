#!/bin/bash
# m2-timestamps.sh — [M2] runs m2-timestamps.mts against m1's container; then STOPS the container (its process
# exits, so the log copier reaches EOF) and reads the last entries again, to see whether the unterminated
# "last line" that M1 never received is written once the process ends; then removes the container.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
docker inspect manifest-probe-output >/dev/null 2>&1 || { echo 'run m1-output.sh first'; exit 1; }
bash "$HERE/run.sh" "$HERE/m2-timestamps.mts" manifest-probe-output
echo "--- after docker stop (the process exits): the last 2 entries, with timestamps"
docker stop -t 2 manifest-probe-output >/dev/null
docker logs --timestamps --tail 2 manifest-probe-output 2>&1 | cut -c1-80
echo "--- and through containerLogs, tail 2"
bash "$HERE/run.sh" "$HERE/m1-read.mts" manifest-probe-output 2
docker rm -f manifest-probe-output >/dev/null && echo 'manifest-probe-output removed'
