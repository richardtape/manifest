#!/usr/bin/env bash
# Runs a test tier GENTLY on this Mac, so Rich can use the machine while it runs (the gentler test
# tiers plan, his yes of 2026-10-14). `pnpm test` and `pnpm test:docker` ARE this script; so is
# ci-acceptance's test step, through `pnpm test`.
#
#   1. PRIORITY. The command runs under `taskpolicy -c utility`, so the scheduler serves Rich's own
#      work first — or `taskpolicy -b` (background: the lowest priority, throttled disk) with
#      MANIFEST_TEST_QOS=background, which is what to ask for while he is on a call. Every child
#      inherits it (taskpolicy(8)): `ps -o pri=` reads 31 normal, 20 utility, 4 background.
#      MANIFEST_TEST_QOS=normal runs as before, for measuring.
#   2. THE TIMEOUT SCALE. A lower priority is a slower run, so this exports MANIFEST_TEST_TIMEOUT_SCALE
#      for its priority unless it is already set, and packages/control-plane/src/test-timeouts.ts
#      multiplies the unit and packages tiers' limits by it. Utility 5 and background 7 are measured
#      (docs/superpowers/spikes/gentler-tiers-baseline/README.md; scale = max(2, ceil(2 x s)), s the wall
#      ratio to a quiet normal run): utility from s = 2.21 under the heaviest load the gate admits (ten
#      burners, 11.61 at the start — at 3, from the quiet 1.04, it read 4 red there), background from
#      its quiet s >= 3.16, proven green under six burners.
#   3. THE LOAD GATE. Above a 1-minute load of MANIFEST_TEST_MAX_LOAD (default: this machine's CPU
#      count) it refuses to start, exit 75, unless MANIFEST_TEST_FORCE=1. It samples the load every
#      MANIFEST_TEST_SAMPLE_SECONDS (30) and prints one line at the end — min, median, max, the
#      priority, the scale, the gate, forced, the exit status — written to MANIFEST_TEST_LOAD_REPORT
#      too when that names a file (ci-acceptance's test step reads it).
#
# NEVER PAUSE A RUN WITH `kill -STOP`. Vitest's limits are wall-clock timers: on `kill -CONT` every
# one that came due while it was stopped fires at once, and every test in flight times out. Stop it
# (Ctrl-C) and start it again with MANIFEST_TEST_QOS=background instead.
#
# Exit: the command's own status; 75 refused by the gate; 64 a usage error or an unknown priority;
# 69 no taskpolicy. macOS ships bash 3.2 and a BSD userland: no associative arrays, no `mapfile`.
set -uo pipefail

if [ "$#" -eq 0 ]; then
  echo "usage: bash scripts/test-gently.sh <command> [args...]" >&2
  exit 64
fi

# Inside a gentle run already (a `pnpm test` started from one): the priority is inherited, and the
# outer run gates and samples. One gate, one sampler, one summary.
if [ -n "${MANIFEST_TEST_GENTLY:-}" ]; then
  exec "$@"
fi

QOS="${MANIFEST_TEST_QOS:-utility}"
case "$QOS" in
  utility)
    POLICY="-c utility"
    DEFAULT_SCALE=5
    ;;
  background)
    POLICY="-b"
    DEFAULT_SCALE=7
    ;;
  normal)
    POLICY=""
    DEFAULT_SCALE=1
    ;;
  *)
    echo "test-gently: MANIFEST_TEST_QOS must be utility, background or normal — got '$QOS'" >&2
    exit 64
    ;;
esac
if [ -n "$POLICY" ] && ! command -v taskpolicy > /dev/null 2>&1; then
  echo "test-gently: taskpolicy is not on PATH (macOS has it at /usr/sbin/taskpolicy); MANIFEST_TEST_QOS=normal runs without it" >&2
  exit 69
fi

export MANIFEST_TEST_TIMEOUT_SCALE="${MANIFEST_TEST_TIMEOUT_SCALE:-$DEFAULT_SCALE}"
export MANIFEST_TEST_GENTLY=1
INTERVAL="${MANIFEST_TEST_SAMPLE_SECONDS:-30}"
GATE="${MANIFEST_TEST_MAX_LOAD:-$(sysctl -n hw.ncpu)}"

# `sysctl -n vm.loadavg` prints `{ 3.61 5.71 6.54 }`; the second field is the 1-minute load.
load1() { sysctl -n vm.loadavg | awk '{ print $2 }'; }

# report <line> — to stdout, and to MANIFEST_TEST_LOAD_REPORT when it names a file.
report() {
  echo "test-gently: $1"
  if [ -n "${MANIFEST_TEST_LOAD_REPORT:-}" ]; then
    echo "$1" > "$MANIFEST_TEST_LOAD_REPORT"
  fi
}

NOW="$(load1)"
FORCED=no
if awk -v l="$NOW" -v g="$GATE" 'BEGIN { exit !(l > g) }'; then
  if [ -z "${MANIFEST_TEST_FORCE:-}" ]; then
    report "REFUSED to start: the 1-minute load is $NOW, above the gate of $GATE (MANIFEST_TEST_MAX_LOAD; by default this machine's CPU count). Wait for it to fall, or set MANIFEST_TEST_FORCE=1 — a forced run says so in its summary." >&2
    exit 75
  fi
  FORCED=yes
fi

SAMPLES="$(mktemp -t manifest-load)"
echo "$NOW" > "$SAMPLES"
(
  while sleep "$INTERVAL"; do
    # Killed outright (SIGKILL runs no trap), the wrapper cannot end this loop, whose command line is
    # ours — so it ends itself at its next interval. `$$` in a subshell is still the wrapper's PID.
    kill -0 "$$" 2> /dev/null || exit 0
    load1 >> "$SAMPLES"
  done
) &
SAMPLER=$!

RC=0
summary() {
  local n lo mid hi
  # The sampler's `sleep` first, then the loop — or the sleep outlives the run by up to $INTERVAL,
  # and the loop, whose command line is ours (`vitest` and all), reads as a run still going.
  pkill -P "$SAMPLER" 2> /dev/null
  kill "$SAMPLER" 2> /dev/null
  wait "$SAMPLER" 2> /dev/null
  n="$(wc -l < "$SAMPLES" | tr -d ' ')"
  lo="$(sort -n "$SAMPLES" | head -1)"
  hi="$(sort -n "$SAMPLES" | tail -1)"
  mid="$(sort -n "$SAMPLES" | awk '{ v[NR] = $1 } END { print v[int((NR + 1) / 2)] }')"
  rm -f "$SAMPLES"
  report "load (1-min) min $lo / median $mid / max $hi over $n samples $INTERVAL s apart; QoS $QOS, timeout scale $MANIFEST_TEST_TIMEOUT_SCALE, gate $GATE, forced $FORCED; exit $RC"
}
trap summary EXIT
trap 'RC=130; exit 130' INT
trap 'RC=143; exit 143' TERM

echo "test-gently: QoS $QOS, timeout scale $MANIFEST_TEST_TIMEOUT_SCALE, 1-minute load $NOW (gate $GATE, forced $FORCED)"
if [ -n "$POLICY" ]; then
  # Unquoted on purpose: `-c utility` is two words.
  taskpolicy $POLICY "$@"
else
  "$@"
fi
RC=$?
exit "$RC"
