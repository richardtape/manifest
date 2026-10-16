#!/bin/bash
# FE-32 sitting 1, [M2]'s reading of each exported lockfile against the skeleton's: every base pin kept or not, the new
# entries, every `resolved` host, and the resolver's `http fetch` lines. Usage: bash m2-analyse.sh <results-dir> <case>...
R=$1; shift
BASE=/Users/rich/Developer/manifest/blueprints/node-ts-mongo/skeleton/package-lock.json
for c in "$@"; do
  L="$R/$c/out/package-lock.json"; G="$R/$c/log.txt"
  echo "===== $c — $(jq -r '"exit \(.exitCode) builder \(.msBuilderStart) ms, build \(.msBuild) ms, total \(.msTotal) ms"' "$R/$c/result.json")"
  [ -f "$L" ] || { echo "no lockfile exported"; grep -E 'npm (error|ERR)|ERROR' "$G" | head -20; continue; }
  echo "sha256 $(shasum -a 256 "$L" | cut -c1-64)  lockfileVersion $(jq .lockfileVersion "$L")  entries $(jq '.packages|length' "$L")"
  echo "root deps: $(jq -c '.packages[""].dependencies' "$L")"
  if [ "$c" != first ]; then
    jq -n --slurpfile b "$BASE" --slurpfile o "$L" '
      ($b[0].packages|del(.[""])) as $B | ($o[0].packages|del(.[""])) as $O |
      { kept: [$B|to_entries[]|select($O[.key].version==.value.version)]|length,
        moved: [$B|to_entries[]|select($O[.key]!=null and $O[.key].version!=.value.version)|"\(.key) \(.value.version) -> \($O[.key].version)"],
        gone: [$B|keys[]|select($O[.]==null)],
        new: [$O|to_entries[]|select($B[.key]==null)|"\(.key)@\(.value.version) \(.value.resolved)"],
        resolvedChangedOnKept: [$B|to_entries[]|select($O[.key].version==.value.version and $O[.key].resolved!=.value.resolved)|"\(.key) \($O[.key].resolved)"]|length,
        integrityChanged: [$B|to_entries[]|select($O[.key].version==.value.version and $O[.key].integrity!=.value.integrity)]|length }'
  fi
  echo "resolved hosts: $(jq -r '.packages[]|select(.resolved)|.resolved' "$L" | awk -F/ '{print $1"//"$3"/"}' | sort | uniq -c | tr -s ' ' | tr '\n' ';')"
  echo "http fetch lines: $(grep -c 'http fetch' "$G") (GET 200: $(grep -c 'http fetch GET 200' "$G"); .tgz: $(grep 'http fetch' "$G" | grep -c '\.tgz'); cache: $(grep 'http fetch' "$G" | grep -o '(cache [a-z]*)' | sort | uniq -c | tr -s ' ' | tr '\n' ';'))"
  grep -E 'npm (warn|WARN)' "$G" | sed 's/^stderr\t//' | head -5
done
