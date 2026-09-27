#!/bin/bash
# m4-app-origin.sh — [M4] what app.manifest.internal answers TODAY, from the host and from inside a container on
# manifest-platform (the curl image infra/images.lock pins, the platform resolver as Dns, the CA mounted).
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../../../../.." && pwd)"
cd "$ROOT"
echo "host: dig +short app.manifest.internal  -> $(dig +short app.manifest.internal | tr '\n' ' ')"
echo "host: dig +short console.manifest.internal -> $(dig +short console.manifest.internal | tr '\n' ' ')"
echo "host: dscacheutil (honours /etc/resolver; dig does NOT, and answers nothing): app -> $(dscacheutil -q host -a name app.manifest.internal | awk "/ip_address/{print \$2}" | tr "\n" " ")| console -> $(dscacheutil -q host -a name console.manifest.internal | awk "/ip_address/{print \$2}" | tr "\n" " ")"
echo "host: GET https://app.manifest.internal/v1/me"
curl -sS --max-time 10 --cacert infra/ca/manifest-root.crt https://app.manifest.internal/v1/me -D - -o /tmp/m4-body.$$ | tr -d '\r' | grep -iE '^HTTP|^content-type|^content-length|^server'
echo "  body: $(head -c 300 /tmp/m4-body.$$)"; rm -f /tmp/m4-body.$$
DIGEST=$(awk -F'\t' '$1=="curlimages/curl:8.11.1"{print $2}' infra/images.lock)
echo "container (manifest-platform, Dns 10.89.0.53): GET https://app.manifest.internal/v1/me"
docker run --rm --name manifest-probe-app-origin --network manifest-platform --dns 10.89.0.53 \
  -v "$ROOT/infra/ca/manifest-root.crt:/ca.crt:ro" --entrypoint sh "curlimages/curl@$DIGEST" -c '
  echo "  resolves to: $(getent hosts app.manifest.internal 2>/dev/null || nslookup app.manifest.internal 2>/dev/null | tail -2 | tr "\n" " ")"
  code=$(curl -sS --max-time 10 --cacert /ca.crt -o /tmp/b -w "%{http_code} bytes=%{size_download}" https://app.manifest.internal/v1/me 2>&1)
  echo "  status: $code"; echo "  body: [$(head -c 300 /tmp/b)]"'
echo "host: anything listening on 7105? $(lsof -nP -iTCP:7105 -sTCP:LISTEN 2>/dev/null | tail -n +2 | wc -l | tr -d ' ') listener(s)"
