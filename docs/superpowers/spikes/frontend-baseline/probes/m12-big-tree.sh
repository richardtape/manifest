#!/bin/bash
# m12-big-tree.sh <scratch dir> — [M12] a 200,000-file tree (2,000 directories x 100 files, built with git
# fast-import in a scratch bare repository), and three runs each of: today's binaryPaths (source/reading.ts:
# `git diff --no-renames --no-color --no-ext-diff --no-textconv --numstat -z <empty tree> <commit>`); the same
# limited to the first 10,000 paths by sort order — Decision 12 named --pathspec-from-file, which `git diff`
# does NOT take (usage error, recorded), so the paths go as literal pathspec ARGUMENTS through xargs -0; and getCommit's read of a commit that added all 200,000 (`git diff ... -z
# --name-status <empty tree> <commit>` — reading.ts:294; the plan's step says diff-tree, the code says diff).
set -euo pipefail
S="${1:?scratch dir}"; R="$S/m12.git"; rm -rf "$R"; mkdir -p "$S"
export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null
git init -q --bare "$R"
t0=$(python3 -c 'import time; print(time.time())')
python3 - <<'PY' | git --git-dir "$R" fast-import --quiet
import sys
w = sys.stdout.write
w("commit refs/heads/main\ncommitter Probe <probe@manifest.internal> 1790500000 +0000\ndata 5\nprobe\n")
for d in range(2000):
    for f in range(100):
        body = f"file {d}/{f}\n"
        w(f"M 100644 inline d{d:04d}/f{f:03d}.txt\ndata {len(body)}\n{body}")
w("\n")
PY
t1=$(python3 -c 'import time; print(time.time())')
C=$(git --git-dir "$R" rev-parse main); E=$(git --git-dir "$R" hash-object -t tree /dev/null)
echo "git $(git --version | awk '{print $3, $4, $5}'); built $(git --git-dir "$R" ls-tree -r --name-only main | wc -l | tr -d ' ') files in $(python3 -c "print(round($t1-$t0,1))") s; commit $C; empty tree $E"
git --git-dir "$R" ls-tree -r --name-only main | LC_ALL=C sort | awk "NR <= 10000" > "$S/m12-pathspec.txt"
echo "pathspec file: $(wc -l < "$S/m12-pathspec.txt" | tr -d ' ') lines, first $(head -1 "$S/m12-pathspec.txt"), last $(tail -1 "$S/m12-pathspec.txt")"
DIFF="--no-renames --no-color --no-ext-diff --no-textconv"
timeit() { # label, then the command; prints three wall times and the output's record count
  local label="$1"; shift; local times="" n=0 i
  for i in 1 2 3; do
    local a b; a=$(python3 -c 'import time; print(time.time())')
    n=$("$@" | tr '\0' '\n' | grep -c . || true)
    b=$(python3 -c 'import time; print(time.time())'); times="$times $(python3 -c "print(round($b-$a,3))")s"
  done
  echo "$label:$times  (records: $n)"
}
timeit "binaryPaths today (whole tree numstat)" git --git-dir "$R" diff $DIFF --numstat -z "$E" "$C"
echo "numstat --pathspec-from-file: $(git --git-dir "$R" diff $DIFF --numstat -z --pathspec-from-file="$S/m12-pathspec.txt" "$E" "$C" 2>&1 >/dev/null | head -1) (exit ${PIPESTATUS[0]:-?}) — git diff does not take the option"
echo "ARG_MAX $(getconf ARG_MAX); the 10,000 paths as arguments: $(wc -c < "$S/m12-pathspec.txt" | tr -d ' ') bytes"
tr '\n' '\0' < "$S/m12-pathspec.txt" > "$S/m12-pathspec.nul"
timeit "numstat, the 10,000 as literal pathspec ARGUMENTS via xargs -0" sh -c 'GIT_LITERAL_PATHSPECS=1 xargs -0 git --git-dir "$1" diff --no-renames --no-color --no-ext-diff --no-textconv --numstat -z "$2" "$3" -- < "$4"' _ "$R" "$E" "$C" "$S/m12-pathspec.nul"
echo "xargs invocations for 10,000 paths: $(xargs -0 sh -c 'echo x' _ < "$S/m12-pathspec.nul" | wc -l | tr -d ' ')"
timeit "getCommit's name-status (all 200,000 added)" git --git-dir "$R" diff $DIFF -z --name-status "$E" "$C"
rm -rf "$R" "$S/m12-pathspec.txt" "$S/m12-pathspec.nul"; echo "scratch repository removed"
