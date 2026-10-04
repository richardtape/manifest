# The UBC AI Gateway plan's Task 1: shared by every probe. SOURCE it from a bash script (never zsh, never `set -x`):
#   . "$(dirname "$0")/lib.sh"
# It loads .env and the probe key's file into THIS process only, and every request reads a key from the
# environment through `curl -K -` (printf is a builtin, so no key reaches argv or `ps`). Nothing here prints a key.
# Requires SCRATCH (the session's scratchpad), where raw answers stay until Task 1's Step 10 deletes them.
set -u
: "${SCRATCH:?set SCRATCH to the session scratchpad}"
PROBES="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$PROBES/../../../../.." && pwd)"
IMG=ghcr.io/berriai/litellm@sha256:20b5044b619055374061a6d5b7b08754cad75aeabbf82ddf4f69cc0cf80ddaf4
GW=https://ai-gateway.apps.ltic.ubc.ca
HOP1=http://127.0.0.1:7197
STUB=http://127.0.0.1:7198
PROBE_KEY_FILE=/Users/rich/manifest-gw-probe.env
STATE="$SCRATCH/gw-probe.state"
RAW="$SCRATCH/raw"
mkdir -p "$RAW"

set -a
# shellcheck disable=SC1091
. "$REPO/.env"
[ -s "$PROBE_KEY_FILE" ] && . "$PROBE_KEY_FILE"
[ -s "$STATE" ] && . "$STATE"
set +a

red() { perl "$PROBES/redact.pl"; }

# req <url> <method> <bodyfile|-> <keyvar|literal:VALUE|none> <outprefix> [extra curl args…]
#   Writes <outprefix>.h (headers) and <outprefix>.b (body), raw, under $RAW; prints the status and the wall time.
req() {
  local url="$1" method="$2" body="$3" key="$4" out="$RAW/$5"
  shift 5
  local bearer=""
  case "$key" in
    none) bearer="" ;;
    literal:*) bearer="${key#literal:}" ;;
    *) bearer="${!key:-}" ;;
  esac
  local data=()
  [ "$body" != "-" ] && data=(--data-binary "@$body" -H 'content-type: application/json')
  if [ -n "$bearer" ]; then
    printf 'header = "Authorization: Bearer %s"\n' "$bearer" |
      curl -sS -K - -X "$method" -o "$out.b" -D "$out.h" -w '%{http_code} %{time_total} %{time_starttransfer}' \
        --max-time "${MAXTIME:-120}" ${data[@]+"${data[@]}"} "$@" "$url"
  else
    curl -sS -X "$method" -o "$out.b" -D "$out.h" -w '%{http_code} %{time_total} %{time_starttransfer}' \
      --max-time "${MAXTIME:-120}" ${data[@]+"${data[@]}"} "$@" "$url"
  fi
}

# The headers worth recording, redacted, on one line.
heads() { grep -i '^x-litellm\|^content-type\|^llm_provider\|^x-ratelimit' "$RAW/$1.h" | tr -d '\r' | red | tr '\n' ';'; }
# A body, redacted, cut.
bodyof() { head -c "${2:-700}" "$RAW/$1.b" | tr '\n' ' ' | red; }

admin() { # admin <method> <path> <bodyfile|-> <out>  — gw-probe's admin API, with its scratch master key
  req "$HOP1$2" "$1" "$3" LITELLM_PROBE_MASTER "$4"
}

json() { # json <file> — write stdin to a body file under $RAW and print its path
  local f="$RAW/$1.json"
  cat >"$f"
  printf '%s' "$f"
}

# mint <VAR> <tag> <json body>  — a scratch key on gw-probe, exported as VAR (a throwaway's key, never Rich's).
mint() {
  local var="$1" tag="$2"
  printf '%s' "$3" >"$RAW/$tag.json"
  admin POST /key/generate "$RAW/$tag.json" "$tag" >/dev/null
  export "$var=$(jq -r '.key' "$RAW/$tag.b")"
}
# spend <VAR> <tag> — a scratch key's spend, read by the admin (a scratch key's allowed_routes refuse /key/info; [M3]); a throwaway key in the URL.
spend() { req "$HOP1/key/info?key=${!1}" GET - LITELLM_PROBE_MASTER "$2" >/dev/null; jq -r '(.info // .).spend // 0' "$RAW/$2.b"; }
# register <tag> <json body> — POST /model/new on gw-probe; prints the status.
register() { printf '%s' "$2" >"$RAW/$1.json"; admin POST /model/new "$RAW/$1.json" "$1"; }
