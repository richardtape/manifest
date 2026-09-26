#!/bin/bash
# Usage: bash indexinfo.sh "$SCRATCH" — AFTER plumbing.sh with the same directory (it reuses lab2/). Task 1: [M3].
# M3 — `update-index --index-info` in a bare repository: a deletion, a write through a symlink,
# a file where a directory is, and a directory where a file is. Scratchpad only.
set -u
L="$1/lab2"; cd "$L"
export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null
ID="-c user.name=t -c user.email=t@t -c commit.gpgsign=false"
BASE=$(git -C app.git rev-parse main)
try() { # $1 label, stdin: index-info lines
  W=$(mktemp -d "$L/ii-XXXX"); git init -q --bare "$W/r.git"; echo "$L/app.git/objects" > "$W/r.git/objects/info/alternates"
  export GIT_DIR="$W/r.git" GIT_INDEX_FILE="$W/index"; git read-tree "$BASE"
  local out; out=$(git update-index --index-info 2>&1); local rc=$?
  echo "== $1: update-index exit $rc ${out:+($out)}"
  local t; t=$(git write-tree 2>&1); echo "   write-tree: $t"
  git ls-tree -r --name-only "$t" 2>/dev/null | tr '\n' ' '; echo
  git fsck --no-dangling "$(git $ID commit-tree "$t" -p "$BASE" -m x 2>/dev/null)" 2>&1 | head -3
  unset GIT_DIR GIT_INDEX_FILE
}
Z=0000000000000000000000000000000000000000
B=$(git -C app.git hash-object -w --stdin <<< 'x')
printf "0 $Z\tsrc/a.js\n" | try "delete src/a.js"
printf "0 $Z\tnope.txt\n" | try "delete a path that is not there"
printf "100644 $B\tout/pwned\n" | try "write under the symlink out"
printf "100644 $B\tsrc\n" | try "a FILE where the directory src is"
printf "100644 $B\tREADME.md/inner\n" | try "a directory where the file README.md is"
