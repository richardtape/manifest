#!/bin/bash
# Does `git rev-list --stdin` / `git log --stdin` accept `--not` lines? (scan-commits' input)
set -u
export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null
T=$(mktemp -d); cd $T
G="-c user.name=t -c user.email=t@t -c commit.gpgsign=false"
git init -q -b main w; cd w
for i in 1 2 3; do echo $i > f$i; git add -A; git $G commit -qm c$i; done
A=$(git rev-parse HEAD~2); C=$(git rev-parse HEAD)
printf '%s\n--not\n%s\n' "$C" "$A" | git rev-list --count --stdin
printf '%s\n--not\n%s\n' "$C" "$A" | git log --format=%H --stdin | wc -l
printf '%s\n' "$C" | git rev-list --count --stdin
rm -rf $T
