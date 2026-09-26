#!/bin/bash
# Usage: bash filters.sh "$SCRATCH" — the authoring API plan's Task 1, Step 2's added case ([M2]).
# Does `git hash-object -w --no-filters --stdin-paths` over numbered files run a clean filter that a
# `.gitattributes` beside them names? The plan's version had no filter DEFINED, so "no filter runs"
# was true of a git that ignores attributes altogether; here `filter.evil.clean` IS defined (by -c),
# and the positive control watches it run without --no-filters. Scratchpad only.
set -u
L="$1/lab4"; rm -rf "$L"; mkdir -p "$L"; cd "$L"
export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null
M="$L/FILTER-RAN"
EVIL="filter.evil.clean=touch $M; tr a-z A-Z"
raw() { printf 'hello\n' | git hash-object --stdin; printf 'second\n' | git hash-object --stdin; }
echo "== the raw bytes' blob ids (no path, no attributes):"; raw
# (A) a NON-bare repository whose worktree holds the numbered files and the .gitattributes
git init -q work; mkdir work/blobs; printf '* filter=evil\n' > work/blobs/.gitattributes
printf 'hello\n' > work/blobs/0; printf 'second\n' > work/blobs/1
echo "== (A1) positive control — worktree, filter defined, WITHOUT --no-filters:"
printf '%s\n' blobs/0 blobs/1 | git -C work -c "$EVIL" hash-object -w --stdin-paths; echo "exit $? ; marker: $([ -e "$M" ] && echo PRESENT || echo absent)"; rm -f "$M"
echo "== (A2) the same, WITH --no-filters:"
printf '%s\n' blobs/0 blobs/1 | git -C work -c "$EVIL" hash-object -w --no-filters --stdin-paths; echo "exit $? ; marker: $([ -e "$M" ] && echo PRESENT || echo absent)"; rm -f "$M"
# (B) as buildCommit would run it: a BARE scratch repository named by --git-dir, the numbered files
#     in a scratch directory beside it (absolute paths), a .gitattributes in that directory.
git init -q --bare r.git; mkdir blobs; printf '* filter=evil\n' > blobs/.gitattributes
printf 'hello\n' > blobs/0; printf 'second\n' > blobs/1
echo "== (B1) bare --git-dir, filter defined, WITHOUT --no-filters:"
printf '%s\n' "$L/blobs/0" "$L/blobs/1" | git --git-dir="$L/r.git" -c "$EVIL" hash-object -w --stdin-paths; echo "exit $? ; marker: $([ -e "$M" ] && echo PRESENT || echo absent)"; rm -f "$M"
echo "== (B2) the same, WITH --no-filters:"
printf '%s\n' "$L/blobs/0" "$L/blobs/1" | git --git-dir="$L/r.git" -c "$EVIL" hash-object -w --no-filters --stdin-paths; echo "exit $? ; marker: $([ -e "$M" ] && echo PRESENT || echo absent)"; rm -f "$M"
