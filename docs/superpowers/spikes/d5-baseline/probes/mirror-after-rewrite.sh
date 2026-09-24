#!/usr/bin/env bash
# probes/mirror-after-rewrite.sh <scratch> — [M14] addendum. After ONE rewrite of upstream main,
# what does every LATER sync see? Task 9's sync scans and validates only what `git fetch
# --porcelain` reports as updated (' ', '*'), and reports '!' as a rewrite.
set -u
S=$1; W="$S/mirror2"; rm -rf "$W"; mkdir -p "$W"; cd "$W"
export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null
ID=(-c user.name=probe -c user.email=probe@example.invalid -c commit.gpgsign=false)
git init -q --bare -b main upstream.git; git init -q --bare -b main mirror.git; git init -q -b main work
F() { git --git-dir=mirror.git fetch --porcelain upstream.git 'refs/heads/*:refs/heads/*' 2>/dev/null; echo "   exit=$?"; }
cd work; echo 1 > f && git add f && git "${ID[@]}" commit -qm c1; git push -q ../upstream.git main; cd ..
echo 'sync 1 (first):'; F
cd work; echo 1b > f && git "${ID[@]}" commit -q --amend -am c1-rewritten; git push -q -f ../upstream.git main; X=$(git rev-parse HEAD); cd ..
echo "   upstream main is now X; X is NOT a descendant of c1: $(git --git-dir=upstream.git merge-base --is-ancestor $(git --git-dir=mirror.git rev-parse main) $X && echo WRONG || echo right)"
echo "sync 2 (after the rewrite to X=${X:0:12}):"; F
echo "   X present in the mirror's object store: $(git --git-dir=mirror.git cat-file -e $X 2>/dev/null && echo YES || echo no)"
cd work; echo SECRET=AKIAABCDEFGHIJKLMNOP > leak.txt && git add leak.txt && git "${ID[@]}" commit -qm 'a later push'; git push -q ../upstream.git main; Y=$(git rev-parse HEAD); cd ..
echo "sync 3 (a NORMAL push Y=${Y:0:12} on top of the rewritten main):"; F
echo "   Y present in the mirror's object store: $(git --git-dir=mirror.git cat-file -e $Y 2>/dev/null && echo YES || echo no)"
echo "   Y reachable from any mirror ref: $(git --git-dir=mirror.git for-each-ref --contains $Y --format='%(refname)' | grep -q . && echo yes || echo NO)"
echo "   mirror main still c1: $(git --git-dir=mirror.git log --format=%s -1 main)"
echo '--- the same three syncs with a SECOND, forced refspec into a shadow namespace:'
rm -rf mirror.git; git init -q --bare -b main mirror.git
G() { git --git-dir=mirror.git fetch --porcelain upstream.git 'refs/heads/*:refs/heads/*' '+refs/heads/*:refs/manifest/upstream/*' 2>/dev/null; echo "   exit=$?"; }
echo 'one fetch now (upstream is already at Y):'; G
echo "   refs/heads/main=$(git --git-dir=mirror.git log --format=%s -1 main)  refs/manifest/upstream/main=$(git --git-dir=mirror.git log --format=%s -1 refs/manifest/upstream/main)"
