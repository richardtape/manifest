#!/usr/bin/env bash
# [M1] What curl keeps in its jar (faculty-ready Task 1). Needs m1-server.mjs on 7195/7196; a fresh jar per case.
set -u
: "${SCR:?}"
enc() { python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1],safe=""))' "$1"; }
RES="--resolve probe.manifest.internal:7196:127.0.0.1 --resolve evil.manifest.internal:7196:127.0.0.1 --resolve console.manifest.internal:7196:127.0.0.1"
kept() { grep -v '^#' "$1" | awk 'NF>=7 {print $6"="$7" domain="$1" path="$3" secure="$4}' | sort | tr '\n' '|'; }
echo "curl: $(curl --version | head -1)"
for O in https://probe.manifest.internal:7196 http://127.0.0.1:7195 http://localhost:7195; do
  for C in '__Host-x=1; Secure; Path=/' '__Host-x=1; Path=/' '__Host-x=1; Secure; Path=/; Domain=manifest.internal' '__Host-x=1; Secure; Path=/auth' 'manifest_session=1; Path=/'; do
    J=$SCR/jar.$$; rm -f $J
    curl -sk $RES -c $J -o /dev/null "$O/set?c=$(enc "$C")"
    printf '[%s] %-55s %s\n' "$O" "$C" "$(kept $J)"
  done
  for CLR in '__Host-x=; Path=/; Max-Age=0' '__Host-x=; Secure; Path=/; Max-Age=0'; do
    J=$SCR/jar.$$; rm -f $J
    curl -sk $RES -c $J -o /dev/null "$O/set?c=$(enc '__Host-x=1; Secure; Path=/')"
    B=$(kept $J)
    curl -sk $RES -b $J -c $J -o /dev/null "$O/set?c=$(enc "$CLR")"
    printf '[%s] clear %-49s before: %s after: %s\n' "$O" "$CLR" "$B" "$(kept $J)"
  done
done
J=$SCR/jar.$$; rm -f $J
curl -sk $RES -c $J -o /dev/null "https://evil.manifest.internal:7196/set?c=$(enc 'manifest_session=tossed; Domain=manifest.internal; Path=/')"
printf '[toss] sibling sets plain manifest_session Domain=manifest.internal; jar: %s; console would be sent: %s\n' "$(kept $J)" \
  "$(curl -sk $RES -b $J "https://console.manifest.internal:7196/echo")"
rm -f $J
