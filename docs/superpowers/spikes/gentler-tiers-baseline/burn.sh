#!/usr/bin/env bash
# The gentler test tiers plan's measurements: run a command beside N CPU burners (`yes > /dev/null`, at
# normal priority — the imitated load), sample the 1-minute load every 30 s, and print the wall time
# and the load's min / median / max. The burners die with this script, whatever ends it — except
# SIGKILL: after any run, `pgrep -x yes` must be empty (kill the PIDs printed below if not).
#
#   bash burn.sh <N> -- <command...>
#
# macOS bash 3.2 and BSD userland.
set -uo pipefail

N="${1:?usage: bash burn.sh <N> -- <command...>}"
shift
[ "${1:-}" = "--" ] && shift
[ "$#" -gt 0 ] || { echo "usage: bash burn.sh <N> -- <command...>" >&2; exit 64; }

BURNERS=""
SAMPLER=""
SAMPLES="$(mktemp -t gentler-load)"
cleanup() {
  for pid in $BURNERS; do kill "$pid" 2>/dev/null; done
  if [ -n "$SAMPLER" ]; then
    pkill -P "$SAMPLER" 2>/dev/null
    kill "$SAMPLER" 2>/dev/null
  fi
  rm -f "$SAMPLES"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

load1() { sysctl -n vm.loadavg | awk '{ print $2 }'; }

i=0
while [ "$i" -lt "$N" ]; do
  yes > /dev/null &
  BURNERS="$BURNERS $!"
  i=$((i + 1))
done
if [ "$N" -gt 0 ]; then
  # The 1-minute load is an exponential average: two minutes take it ~86% of the way to a step.
  echo "burn.sh: $N burners, PIDs:$BURNERS — waiting 120 s for the 1-minute load to rise"
  sleep 120
fi

load1 > "$SAMPLES"
( while sleep 30; do load1 >> "$SAMPLES"; done ) &
SAMPLER=$!

echo "burn.sh: starting at $(date '+%H:%M:%S'), 1-minute load $(head -1 "$SAMPLES"): $*"
START=$(date +%s)
"$@"
RC=$?
END=$(date +%s)

n="$(wc -l < "$SAMPLES" | tr -d ' ')"
min="$(sort -n "$SAMPLES" | head -1)"
max="$(sort -n "$SAMPLES" | tail -1)"
med="$(sort -n "$SAMPLES" | awk '{ v[NR] = $1 } END { print v[int((NR + 1) / 2)] }')"
echo "burn.sh: $N burners, wall $((END - START)) s, exit $RC, load (1-min) min $min / median $med / max $max over $n samples"
exit "$RC"
