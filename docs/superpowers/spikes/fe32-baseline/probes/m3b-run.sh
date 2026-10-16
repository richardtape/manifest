#!/bin/bash
# FE-32 sitting 1, [M3b]: the package's METADATA is cached and its TARBALL is not, the uplink refused — the offline
# acceptance's `marked` on a machine whose mirror was never warmed with it. Usage: bash m3b-run.sh <results-dir> <version>
set -u
R=$1; V=$2; mkdir -p "$R"; HERE=$(cd "$(dirname "$0")" && pwd)
export FE32_WORK="$R/work"
trap 'bash "$HERE/m3-throwaway.sh" down' EXIT
bash "$HERE/m3-throwaway.sh" up http://127.0.0.1:9/ | grep -E 'networks|ping|aliases'
bash "$HERE/m3-throwaway.sh" seed marked | head -1
S=$(date +%s); node "$HERE/m2-export.mjs" "$R" "min:marked@$V" | sed -E 's/"baseImage":"[^"]*",//' | cut -c1-240; echo "wall $(( $(date +%s) - S )) s"
grep -E 'npm (error|http fetch|warn)' "$R/min_marked_$V/log.txt" | sed 's/^stderr\t//' | grep -v 'complete log\|/npm ' | head -12
bash "$HERE/m3-throwaway.sh" logs 15 | sed 's/\x1b\[[0-9;]*m//g' | grep -iE 'marked|ERR|uplink' | cut -c1-200 | head -8
