#!/bin/bash
# [M1] fact 12/13 and [M2]'s "every shape of packages entry": every committed lockfile, its resolved hosts, its entry shapes.
cd /Users/rich/Developer/manifest
total=0
for f in $(find fixtures blueprints -name package-lock.json -not -path '*/node_modules/*' | sort); do
  n=$(jq '[.packages[] | select(.resolved)] | length' "$f")
  total=$((total+n))
  hosts=$(jq -r '.packages[] | select(.resolved) | .resolved' "$f" | awk -F/ '{print $1"//"$3"/"}' | sort | uniq -c | tr -s ' ' | tr '\n' ';')
  shapes=$(jq -r '.packages | to_entries[] | .value | [ (if .link then "link" else empty end), (if .bundled then "bundled" else empty end), (if .optional then "optional" else empty end), (if .peer then "peer" else empty end), (if .dev then "dev" else empty end), (if .devOptional then "devOptional" else empty end), (if .inBundle then "inBundle" else empty end) ] | join("+")' "$f" | sed 's/^$/plain/' | sort | uniq -c | tr -s ' ' | tr '\n' ';')
  keys=$(jq -r '[.packages | to_entries[] | .value | keys[]] | unique | join(",")' "$f")
  echo "$f lockfileVersion=$(jq .lockfileVersion "$f") entries=$(jq '.packages|length' "$f") resolved=$n hosts=[$hosts] shapes=[$shapes] fields=[$keys]"
done
echo "TOTAL resolved=$total"
echo "--- manifests without a lockfile:"
for d in $(find fixtures blueprints -name package.json -not -path '*/node_modules/*' -exec dirname {} \; | sort); do [ -f "$d/package-lock.json" ] || echo "  $d"; done
echo "--- overrides in any committed package.json:"
find fixtures blueprints -name package.json -not -path '*/node_modules/*' -exec grep -l '"overrides"' {} \; ; echo "  (grep exit $?)"
