#!/usr/bin/env bash
# probes/mirror-shadow.sh <scratch> — [M14] the fix, measured. ONE fetch, TWO refspecs:
#   refs/heads/*:refs/heads/*                  non-forced — keeps the history (Decision 1)
#   +refs/heads/*:refs/manifest/upstream/*     forced     — always what GitHub has NOW
# The shadow's porcelain flag says what happened ON GITHUB: ' ' fast-forward, '*' new, '+' forced
# (a rewrite). The '!' on refs/heads/* is then the expected, already-known consequence.
set -u
S=$1; W="$S/mirror3"; rm -rf "$W"; mkdir -p "$W"; cd "$W"
export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null
ID=(-c user.name=probe -c user.email=probe@example.invalid -c commit.gpgsign=false)
git init -q --bare -b main upstream.git; git init -q --bare -b main mirror.git; git init -q -b main work
G() { git --git-dir=mirror.git fetch --porcelain upstream.git 'refs/heads/*:refs/heads/*' '+refs/heads/*:refs/manifest/upstream/*' 2>/dev/null; echo "   exit=$?"; }
cd work; echo 1 > f && git add f && git "${ID[@]}" commit -qm c1; git push -q ../upstream.git main; cd ..
echo 'sync 1 (first push c1):'; G
cd work; echo 1b > f && git "${ID[@]}" commit -q --amend -am X-rewritten; git push -q -f ../upstream.git main; cd ..
echo 'sync 2 (main rewritten to X):'; G
cd work; echo 2 > g && git add g && git "${ID[@]}" commit -qm Y-normal; git push -q ../upstream.git main; cd ..
echo 'sync 3 (a normal push Y on top of X):'; G
echo 'sync 4 (nothing new):'; G
echo "refs/heads/main=$(git --git-dir=mirror.git log --format=%s -1 main) (the history kept)  refs/manifest/upstream/main=$(git --git-dir=mirror.git log --format=%s -1 refs/manifest/upstream/main) (GitHub now)"
