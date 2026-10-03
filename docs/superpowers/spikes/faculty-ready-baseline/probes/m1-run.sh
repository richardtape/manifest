#!/usr/bin/env bash
# [M1] runs the throwaway server, headless Chrome (its own profile), the Chrome driver, then curl; removes all of it.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
: "${SCR:?set SCR to a scratch directory holding probe.key and probe.crt}"
CERT_DIR=$SCR node "$HERE/m1-server.mjs" & SRV=$!
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
rm -rf "$SCR/chrome-profile"
"$CHROME" --headless=new --remote-debugging-port=7194 --user-data-dir="$SCR/chrome-profile" --ignore-certificate-errors \
  --host-resolver-rules="MAP probe.manifest.internal 127.0.0.1, MAP evil.manifest.internal 127.0.0.1" \
  --no-first-run --no-default-browser-check about:blank >/dev/null 2>&1 & CHR=$!
sleep 3
node "$HERE/m1-chrome.mjs"
kill $CHR $SRV 2>/dev/null; wait $CHR $SRV 2>/dev/null
rm -rf "$SCR/chrome-profile"
