#!/bin/bash
# Usage: bash plumbing.sh "$SCRATCH" — the authoring API plan's writing session, 2026-09-25; Task 1 re-runs it ([M2]).
# M2 — commit with NO worktree: blobs by hash-object, a temporary index read from the base,
# update-index for writes and deletions, write-tree, commit-tree, and a non-forced push from a
# scratch repository whose objects are borrowed (alternates) — into a bare repository that has
# driver 1's protections and a pre-receive hook. Scratchpad only.
set -u
L="$1/lab2"; rm -rf "$L"; mkdir -p "$L"; cd "$L"
export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null
ID="-c user.name=t -c user.email=t@t -c commit.gpgsign=false"
git init -q --bare --initial-branch=main app.git
git -C app.git config receive.denyNonFastForwards true
git -C app.git config receive.denyDeletes true
printf '#!/bin/sh\necho "pre-receive ran: $(cat)" >&2\nexit 0\n' > app.git/hooks/pre-receive; chmod +x app.git/hooks/pre-receive
git clone -q app.git person 2>/dev/null; cd person
printf 'hello\n' > README.md; mkdir -p src; printf 'a\n' > src/a.js; printf '#!/bin/sh\n' > run.sh; chmod +x run.sh
ln -s /etc out; ln -s .git meta
git add -A; git $ID commit -q -m person; git push -q origin main 2>/dev/null; cd ..
BASE=$(git -C app.git rev-parse main); echo "base $BASE"
# --- the plumbing commit ---
W=$(mktemp -d "$L/op-XXXX"); git init -q --bare "$W/r.git"
echo "$L/app.git/objects" > "$W/r.git/objects/info/alternates"
export GIT_DIR="$W/r.git" GIT_INDEX_FILE="$W/index"
git read-tree "$BASE"
B1=$(printf 'new file through plumbing\n' | git hash-object -w --stdin)
git update-index --add --cacheinfo "100644,$B1,src/b.js"
B2=$(printf 'README changed\n' | git hash-object -w --stdin)
git update-index --cacheinfo "100644,$B2,README.md"
git update-index --force-remove src/a.js
B3=$(printf 'x\n' | git hash-object -w --stdin)
echo "--- write THROUGH the symlink 'out' (out/pwned):"; git update-index --add --cacheinfo "100644,$B3,out/pwned" 2>&1 | tail -1; echo "exit $?"
echo "--- write THROUGH 'meta' (meta/config):"; git update-index --add --cacheinfo "100644,$B3,meta/config" 2>&1 | tail -1
TREE=$(git write-tree); C=$(git $ID commit-tree "$TREE" -p "$BASE" -m 'api commit')
echo "--- the new tree:"; git ls-tree -r -l "$C"
echo "--- push, non-forced:"; git push "$L/app.git" "$C:refs/heads/main" 2>&1 | grep -v '^To '
unset GIT_DIR GIT_INDEX_FILE
echo "--- nothing written outside: /etc/pwned exists?"; ls /etc/pwned 2>&1 | head -1
echo "--- a STALE base: a second commit on the old base, pushed non-forced:"
W2=$(mktemp -d "$L/op-XXXX"); git init -q --bare "$W2/r.git"; echo "$L/app.git/objects" > "$W2/r.git/objects/info/alternates"
export GIT_DIR="$W2/r.git" GIT_INDEX_FILE="$W2/index"; git read-tree "$BASE"
B4=$(printf 'concurrent\n' | git hash-object -w --stdin); git update-index --add --cacheinfo "100644,$B4,c.txt"
C2=$(git $ID commit-tree "$(git write-tree)" -p "$BASE" -m stale); git push "$L/app.git" "$C2:refs/heads/main" 2>&1 | grep -v '^To '; echo "push exit ${PIPESTATUS[0]}"
unset GIT_DIR GIT_INDEX_FILE
echo "--- objects copied into the target by the push (loose count before/after is not the question; the push worked from alternates)"
git -C "$L/app.git" log --oneline main | cat
