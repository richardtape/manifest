#!/usr/bin/env bash
# probes/mirror.sh <scratch> — [M14]: git's own protections, and a mirror's NON-FORCED fetch.
# The mirror must HOLD the commit before upstream rewrites it — otherwise git correctly accepts
# the rewritten main as a fast-forward and the probe measures nothing (the writer's first try).
set -u
S=$1; W="$S/mirror"; rm -rf "$W"; mkdir -p "$W"; cd "$W"
export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null
ID=(-c user.name=probe -c user.email=probe@example.invalid -c commit.gpgsign=false)
git init -q --bare -b main upstream.git; git init -q --bare -b main mirror.git
git init -q -b main work; cd work
echo 1 > f && git add f && git "${ID[@]}" commit -qm c1
echo 2 > f && git "${ID[@]}" commit -qam c2
git push -q ../upstream.git main
cd ..; git --git-dir=mirror.git fetch -q upstream.git 'refs/heads/*:refs/heads/*'
C2=$(git --git-dir=mirror.git rev-parse main); echo "mirror main after first fetch: $C2 (upstream $(git --git-dir=upstream.git rev-parse main))"
echo "mirror HOLDS c2 before the rewrite: $(git --git-dir=mirror.git cat-file -t $C2)"
cd work; git reset -q --hard HEAD~1; echo 3 > f && git "${ID[@]}" commit -qam c2-rewritten
git push -q -f ../upstream.git main; echo "upstream main rewritten to: $(git --git-dir=../upstream.git rev-parse main)"; cd ..
echo '$ git fetch (NON-forced refspec refs/heads/*:refs/heads/*) into the mirror'
git --git-dir=mirror.git fetch upstream.git 'refs/heads/*:refs/heads/*' 2>&1; echo "fetch exit=$?"
echo "mirror main unchanged: $([ "$(git --git-dir=mirror.git rev-parse main)" = "$C2" ] && echo yes || echo NO)"
echo '--- positive control: the same fetch FORCED (+) does move it'
cp -R mirror.git mirror-forced.git
git --git-dir=mirror-forced.git fetch -q upstream.git '+refs/heads/*:refs/heads/*' 2>&1; echo "forced fetch exit=$? main moved: $([ "$(git --git-dir=mirror-forced.git rev-parse main)" != "$C2" ] && echo yes || echo NO)"
echo '--- receive.denyNonFastForwards and receive.denyDeletes on upstream'
git --git-dir=upstream.git config receive.denyNonFastForwards true; git --git-dir=upstream.git config receive.denyDeletes true
cd work; git reset -q --hard HEAD~1; echo 4 > f && git "${ID[@]}" commit -qam c2-again
git push -f ../upstream.git main 2>&1 | grep -E 'denying|rejected|error'; echo "force-push exit=${PIPESTATUS[0]}"
git push ../upstream.git :main 2>&1 | grep -E 'denying|rejected|error'; echo "delete exit=${PIPESTATUS[0]}"
echo "--- positive control: a fast-forward push to the protected upstream still lands"
git fetch -q ../upstream.git main && git reset -q --hard FETCH_HEAD && echo 5 > f && git "${ID[@]}" commit -qam c3
git push -q ../upstream.git main; echo "fast-forward push exit=$?"; cd ..
echo '--- a pre-receive hook exiting 1 in the mirror'
printf '#!/bin/sh\necho "manifest: this is a mirror; push to GitHub" >&2\nexit 1\n' > mirror.git/hooks/pre-receive; chmod +x mirror.git/hooks/pre-receive
cd work; git push ../mirror.git HEAD:refs/heads/probe 2>&1 | grep -E 'manifest:|rejected|declined'; echo "push to mirror exit=${PIPESTATUS[0]}"; cd ..
git --git-dir=mirror.git fetch upstream.git 'refs/heads/*:refs/heads/*' 2>&1 | tail -2; echo "fetch into the hooked mirror exit=${PIPESTATUS[0]} (main is still c2 — the non-forced rule, not the hook)"
git --git-dir=mirror.git fetch -q upstream.git 'refs/heads/main:refs/heads/upstream-main'; echo "fetch of a NEW ref into the hooked mirror exit=$? — lands: $(git --git-dir=mirror.git rev-parse --verify -q upstream-main >/dev/null && echo yes || echo NO)"
