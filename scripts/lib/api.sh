# shellcheck shell=bash
# THE control-plane client every demo script speaks through. Sourced, never executed.
#
# ONE copy. There were two — `scripts/demo.sh` and `scripts/lib/proof-app.sh` each
# defined key/api/field/environment — so every change to the API's paths, its origin or
# its headers had to be made twice, and the two would drift into proving different
# things (P5a Task 2). The generated client is the contract's client; this is the
# demos', and it is deliberately `curl` (P5a Decision 37).
#
# The caller sets, before calling anything:
#   CP_JAR      the Manifest session's cookie jar
#   PROJECT_ID  for `environment` only
# jq is not guaranteed on a UBC developer's Mac and C1 forbids a new prerequisite, so
# JSON is read with node, which the toolchain already requires.

# §21 (P5a Task 3): the console and the API share one origin, through the edge. Every
# resource path is under /v1 and the sign-in endpoints are under /auth, both on this
# origin. The host keychain trusts the platform CA, so curl needs no --cacert here —
# but a NODE process does not read the keychain (S7): anything that runs `node` against
# $API needs NODE_EXTRA_CA_CERTS, as the event-stream watcher's callers pass it.
ORIGIN="${MANIFEST_ORIGIN:-https://console.manifest.internal}"
API="$ORIGIN"

# Every mutating route requires an Idempotency-Key (D23.6) and answers 400 without
# one. A fresh key per call: replaying the same key returns the FIRST response.
key() { uuidgen | tr 'A-Z' 'a-z'; }

# A control-plane call as the person whose session is in $CP_JAR. $2 is the path AS THE
# CONTRACT SPELLS IT — `/v1/projects`, never `/projects` — so a script can be grepped
# against packages/contract/openapi.json. Every mutation carries a fresh
# Idempotency-Key (D23.6): replaying one returns the FIRST response. And §20's Origin
# (P5a Task 4): a mutation carrying a session from anywhere else is `403
# CSRF_ORIGIN_REFUSED`, which is what a browser gets from a page on an app's origin.
api() {
  local method="$1" path="$2" body="${3:-}"
  local args=(-sS -b "$CP_JAR" -c "$CP_JAR" -X "$method" -H 'content-type: application/json')
  if [ "$method" != GET ]; then args+=(-H "idempotency-key: $(key)" -H "origin: $ORIGIN"); fi
  if [ -n "$body" ]; then args+=(-d "$body"); fi
  curl "${args[@]}" "$API$path"
}

field() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const v=process.argv[1].split(".").reduce((a,k)=>a?.[k],j);if(v===undefined){console.error(s);process.exit(1)}console.log(typeof v==="object"?JSON.stringify(v):v)})' "$1"; }

json() { node -e 'console.log(JSON.stringify(process.argv[1]))' "$1"; }

# Removes the bare repository for slug $1 when NO PROJECT HOLDS THE NAME (P5a Task 11).
#
# `pnpm test` and `make reset` empty the control plane's tables and leave
# .manifest/repos behind, so a demo's next `POST /v1/projects` finds its slug's old
# repository. Until Task 11 that creation failed AFTER committing the project row, and
# the demos carried on by reusing it; since Task 11 the project is deleted when its
# repository cannot be created (Decision 29), so there is nothing to reuse, and every
# demo after a `pnpm test` would stop at step 2.
#
# The proof that nothing is lost is the CONTRACT's, not a guess from the filesystem:
# `GET /v1/slugs/{slug}` answering `available` means no project holds the name — a
# project that does is SLUG_TAKEN, and a reserved or malformed name is never available.
# Only then is the repository an orphan. The caller sets CP_JAR and ROOT.
clear_orphan_repository() {
  local slug="$1" repos="${MANIFEST_REPOS_ROOT:-$ROOT/.manifest/repos}" available
  case "$slug" in
    '' | *[!a-z0-9-]*) echo "clear_orphan_repository: '$slug' is not a project slug" >&2; return 1 ;;
  esac
  [ -d "$repos/$slug.git" ] || return 0
  available="$(api GET "/v1/slugs/$slug" | field available)" || return 1
  if [ "$available" = true ]; then
    rm -rf "${repos:?}/$slug.git"
    echo "  removed $repos/$slug.git — no project holds '$slug' (pnpm test and make reset leave repositories behind)"
  fi
}

# A build answers 202 at once and ends on the event stream (Rich's R6, P5a Task 13). A
# script holding no socket reads the build until it is terminal, bounded past the
# builder's own 900 s timeout so a stalled build fails the script rather than hanging it.
# Prints the build's JSON as last read; returns 0 once it has ended (succeeded OR failed —
# the caller says which it needed), 1 if it never did, or at once if the read itself is
# refused: an expired session or a vanished build will not end by waiting.
wait_for_build() {
  local id="$1" build state deadline=$((SECONDS + 960))
  while :; do
    build="$(api GET "/v1/builds/$id")"
    state="$(printf '%s' "$build" | field status 2>/dev/null || echo unknown)"
    case "$state" in
      succeeded | failed) printf '%s' "$build"; return 0 ;;
      running | pending) ;;
      *)
        # D23.7's envelope: a refusal, not a build still under way.
        if printf '%s' "$build" | field error.code >/dev/null 2>&1; then
          printf '%s' "$build"
          return 1
        fi
        ;;
    esac
    if [ "$SECONDS" -ge "$deadline" ]; then printf '%s' "$build"; return 1; fi
    sleep 2
  done
}

environment() {
  api GET "/v1/projects/$PROJECT_ID?expand=environments" \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const e=(j.environments??[]).find(x=>x.kind===process.argv[1]);if(!e){console.error(s);process.exit(1)}console.log(e.id)})' "$1"
}
