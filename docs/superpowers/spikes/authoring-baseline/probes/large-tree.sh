#!/bin/bash
# Usage: bash large-tree.sh "$SCRATCH" — the authoring API plan's Task 1, Step 7 ([M10], the brief's §7).
# A bare repository holding 10,000 small files across 200 directories and one 20 MB text file; three
# timed runs each of the tree listing Task 4 would run, the numstat that answers git's binary flags in
# one command, and what build/context.ts does to make a build context (`git archive --format=tar -o`,
# then `tar -x`, two processes). Scratchpad only. Read `uptime` beside the numbers.
set -u
L="$1/lab5"; rm -rf "$L"; mkdir -p "$L"; cd "$L"
export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null
ID="-c user.name=t -c user.email=t@t -c commit.gpgsign=false"
git init -q --initial-branch=main w
for d in $(seq -w 1 200); do
  mkdir -p "w/dir$d"
  for f in $(seq -w 1 50); do printf 'export const v%s = "%s/%s";\n' "$f" "$d" "$f" > "w/dir$d/f$f.js"; done
done
# 20 MB of text: 20 * 1024 * 1024 bytes of printable lines
awk 'BEGIN { line = sprintf("%099d", 0); for (i = 0; i < 209716; i++) print line; printf "%s", substr(line, 1, 4) "\n" }' > w/big.txt
ls -l w/big.txt | awk '{print "big.txt bytes: " $5}'
git -C w add -A && git -C w $ID commit -q -m 'large tree' || { echo 'SETUP FAILED: commit'; exit 1; }
# Not `git clone --bare`: its local hardlink/copy of objects failed here once ("failed to copy file to
# app.git/objects/…: No such file or directory", 2026-09-25) — a push is the path a repository really gets.
git init -q --bare --initial-branch=main app.git && git -C w push -q "$L/app.git" main || { echo 'SETUP FAILED: push'; exit 1; }
echo "files in HEAD: $(git -C app.git ls-tree -r --name-only HEAD | wc -l | tr -d ' ')"
echo "uptime: $(uptime)"
EMPTY=4b825dc642cb6eb9a060e54bf8d69288fbee4904
TIMEFORMAT='%R s'
for i in 1 2 3; do
  echo "-- run $i"
  printf 'ls-tree -r -t -l -z --full-tree HEAD: '; { time git -C app.git ls-tree -r -t -l -z --full-tree HEAD > "$L/ls.out"; } 2>&1; echo "   bytes of listing: $(wc -c < "$L/ls.out" | tr -d ' ')"
  printf 'diff --numstat <empty> HEAD:            '; { time git -C app.git diff --numstat "$EMPTY" HEAD > "$L/numstat.out"; } 2>&1; echo "   lines: $(wc -l < "$L/numstat.out" | tr -d ' ')"
  rm -f "$L/source.tar"; rm -rf "$L/context"; mkdir "$L/context"
  printf 'archive --format=tar -o:               '; { time git --git-dir="$L/app.git" archive --format=tar -o "$L/source.tar" HEAD; } 2>&1; echo "   archive bytes: $(wc -c < "$L/source.tar" | tr -d ' ')"
  printf 'tar -x -f (the context unpacked):      '; { time tar -x -f "$L/source.tar" -C "$L/context"; } 2>&1
done
echo "uptime after: $(uptime)"
