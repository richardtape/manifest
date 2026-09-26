#!/bin/bash
# Usage: bash seams.sh "$SCRATCH" — git init with --git-dir, hash-object --stdin-paths, and push --porcelain's verdict on stdout.
set -u
L="$1/lab3"; rm -rf "$L"; mkdir -p "$L"; cd "$L"
export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null
echo "== init with --git-dir naming the same directory:"
git --git-dir="$L/r.git" init -q --bare "$L/r.git"; echo "exit $?"; ls "$L/r.git" | tr '\n' ' '; echo
echo "== hash-object -w --no-filters --stdin-paths:"
mkdir blobs; printf 'a\r\nb\n' > blobs/0; printf '\xc3\xa9\n' > blobs/1
printf '%s\n' "$L/blobs/0" "$L/blobs/1" | git --git-dir="$L/r.git" hash-object -w --no-filters --stdin-paths; echo "exit $?"
git --git-dir="$L/r.git" hash-object --no-filters blobs/0 blobs/1
echo "== push --porcelain, rejected non-fast-forward: stdout vs stderr"
git init -q --bare --initial-branch=main t.git; git -C t.git config receive.denyNonFastForwards true
ID="-c user.name=t -c user.email=t@t"
T1=$(git --git-dir="$L/r.git" $ID commit-tree "$(git --git-dir="$L/r.git" mktree </dev/null)" -m one)
git --git-dir="$L/r.git" push -q "$L/t.git" "$T1:refs/heads/main"
T2=$(git --git-dir="$L/r.git" $ID commit-tree "$(git --git-dir="$L/r.git" mktree </dev/null)" -m two)
git --git-dir="$L/r.git" push --porcelain "$L/t.git" "$T2:refs/heads/main" >out.txt 2>err.txt; echo "exit $?"
echo "-- stdout:"; cat out.txt; echo "-- stderr:"; cat err.txt
