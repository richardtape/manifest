#!/bin/bash
# FE-32 sitting 1, [M2]: `make seed`'s warm loop EXACTLY as infra/seed/seed.sh:74-86 runs it on the host, on one
# exported lockfile with its manifest. Usage: bash m2-warm.sh <dir holding package.json and package-lock.json> <port>
d=$1; PORT_VERDACCIO=$2
echo "     $d"
tmp=$(mktemp -d)
cp "$d/package.json" "$tmp/package.json"
[ -f "$d/package-lock.json" ] && cp "$d/package-lock.json" "$tmp/package-lock.json"
(cd "$tmp" && npm install \
   --registry "http://127.0.0.1:$PORT_VERDACCIO" \
   --cache "$tmp/.npm-cache" \
   --no-audit --no-fund --silent) || echo "     WARN: mirror warm failed for $d"
echo "     installed: $(ls "$tmp/node_modules" 2>/dev/null | wc -l | tr -d ' ') top-level entries; passport-saml $(cat "$tmp/node_modules/passport-saml/package.json" 2>/dev/null | grep '"version"')"
rm -rf "$tmp"
