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

# WHICH SOURCE DRIVER THE CONTROL PLANE RUNS, asked before a demo creates anything (the authoring
# API plan's Task 12; the D5 plan's *Added at the close*: a driver-1 demo run on a driver-2
# control plane created its project there, where no route deletes it). An unsigned POST to the
# webhook receiver answers without recording anything — `404 WEBHOOKS_NOT_CONFIGURED` is driver
# 1, `401 WEBHOOK_SIGNATURE_MISSING` driver 2 — straight to the control plane, because the edge
# forwards only /v1 and /auth. `make demo-github` asks the same question from TypeScript (its
# step 0).
#
# `source_driver` ANSWERS the question — it prints `local` or `github` — for the one demo that
# runs on either (`make demo-authoring`, the authoring API plan's Task 13). Any other answer is
# no control plane, or not one this script understands: it says so and EXITS 1. It is called as
# `DRIVER="$(source_driver)"`, so its exit ends only the command substitution, and the caller
# must stop on an empty answer — `require_driver` below does.
source_driver() {
  local code
  code="$(curl -s -m 5 -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' \
    --data '{}' "http://127.0.0.1:${PORT_CONTROL_PLANE:-7100}/webhooks/github" || true)"
  case "$code" in
    404) echo local ;;
    401) echo github ;;
    *)
      printf '\n\033[31m%s\033[0m\n' "Which source driver does the control plane run? POST /webhooks/github on 127.0.0.1:${PORT_CONTROL_PLANE:-7100} answered '$code', not 404 (driver 1) or 401 (driver 2). Nothing was created." >&2
      exit 1
      ;;
  esac
}

# `$1` is `local` or `github`: the driver a demo NEEDS. On the wrong one it says how to restart
# and EXITS 1, having created nothing.
require_driver() {
  local want="$1" have
  have="$(source_driver)" || exit 1
  if [ "$have" = "$want" ]; then
    echo "  the control plane runs the $have source driver, which this demo needs"
    return 0
  fi
  if [ "$want" = local ]; then
    printf '\n\033[31m%s\033[0m\n' "The control plane runs driver 2 (the GitHub source driver), and this demo is driver 1's.
Nothing was created. Stop the control plane and start it again WITHOUT MANIFEST_SOURCE_DRIVER
(unset MANIFEST_SOURCE_DRIVER) — RUNBOOK's 'Running the control plane' — then run this demo
again. \`make demo-github\` is the driver-2 demo." >&2
  else
    printf '\n\033[31m%s\033[0m\n' "The control plane runs driver 1 (the local source driver), and this demo is driver 2's.
Nothing was created. Stop the control plane, then start it on driver 2 — RUNBOOK's 'The
control plane on driver 2':

  make github-up
  export MANIFEST_SOURCE_DRIVER=github     # every MANIFEST_GITHUB_* default is the fake's
  pnpm --filter @manifest/control-plane dev" >&2
  fi
  exit 1
}

field() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const v=process.argv[1].split(".").reduce((a,k)=>a?.[k],j);if(v===undefined){console.error(s);process.exit(1)}console.log(typeof v==="object"?JSON.stringify(v):v)})' "$1"; }

json() { node -e 'console.log(JSON.stringify(process.argv[1]))' "$1"; }

# Removes what an ORPHAN slug $1 left behind when NO PROJECT HOLDS THE NAME (P5a Task 11): its
# bare repository here — which on driver 2 is its MIRROR, at the same path — and, since the D5
# plan's Task 15, its repository on the GitHub FAKE.
#
# `pnpm test` and `make reset` empty the control plane's tables and leave .manifest/repos
# behind, so a demo's next `POST /v1/projects` finds its slug's old repository. Until Task 11
# that creation failed AFTER committing the project row, and the demos carried on by reusing
# it; since Task 11 the project is deleted when its repository cannot be created (Decision 29),
# so there is nothing to reuse, and every demo after a `pnpm test` would stop at step 2. The
# fake's repositories outlive `pnpm test` the same way (its volume is `make reset`'s), and
# driver 2 answers a name GitHub already holds `409 SOURCE_REPOSITORY_EXISTS` — never adopting
# it (the D5 plan's Decision 16) — so a driver-2 demo would stop there too.
#
# The proof that nothing is lost is the CONTRACT's, not a guess from the filesystem:
# `GET /v1/slugs/{slug}` answering `available` means no project holds the name — a
# project that does is SLUG_TAKEN, and a reserved or malformed name is never available.
# Only then is either copy an orphan. **The fake is asked only when it is up and
# `make up`'s developer token is here** — a driver-1 machine has neither, and this then asks it
# nothing — and it is asked AS A PERSON (`faculty-dev`, with admin), as someone clearing their
# own organisation would, never with Manifest's App. **It never talks to real GitHub**: its one
# address is the fake's. The token goes to curl on its STDIN (`-K -`), never an argument.
# The caller sets CP_JAR and ROOT.
clear_orphan_repository() {
  local slug="$1" repos="${MANIFEST_REPOS_ROOT:-$ROOT/.manifest/repos}" available
  local fake="${MANIFEST_FAKE_URL:-http://127.0.0.1:7110}" org=manifest-apps
  local token_file="$ROOT/infra/secrets/github-fake-developer.token" on_fake="" status
  case "$slug" in
    '' | *[!a-z0-9-]*) echo "clear_orphan_repository: '$slug' is not a project slug" >&2; return 1 ;;
  esac
  if [ -r "$token_file" ] && [ "$(curl -sS -m 2 "$fake/_fake/health" 2>/dev/null)" = ok ]; then
    on_fake=1
  fi
  [ -d "$repos/$slug.git" ] || [ -n "$on_fake" ] || return 0
  available="$(api GET "/v1/slugs/$slug" | field available)" || return 1
  [ "$available" = true ] || return 0
  if [ -d "$repos/$slug.git" ]; then
    rm -rf "${repos:?}/$slug.git"
    echo "  removed $repos/$slug.git — no project holds '$slug' (pnpm test and make reset leave repositories behind)"
  fi
  if [ -n "$on_fake" ]; then
    status="$(printf 'header = "authorization: token %s"\n' "$(cat "$token_file")" \
      | curl -sS -K - -o /dev/null -w '%{http_code}' -m 10 -X DELETE \
        -H 'accept: application/vnd.github+json' "$fake/api/v3/repos/$org/$slug" || true)"
    case "$status" in
      204) echo "  removed $org/$slug on the GitHub fake — no project holds '$slug' (pnpm test leaves the fake's repositories behind)" ;;
      404) ;;
      *) echo "clear_orphan_repository: the GitHub fake answered DELETE $org/$slug with $status" >&2; return 1 ;;
    esac
  fi
}

# git as `faculty-dev` — a PERSON with admin in the organisation — against the fake (the D5
# plan's `make demo-github`, and `make demo-authoring`'s person pushing a symlink). The caller
# exports MANIFEST_FAKE_TOKEN, `make up`'s developer token (infra/secrets/). The
# token is in git's ENVIRONMENT only: GIT_CONFIG_COUNT/KEY/VALUE, no system or global config
# (Apple git's osxkeychain helper comes from the system file), an empty credential helper and
# no prompt — the D5 plan's Global Constraints, as driver 2 does it.
fake_git() {
  local basic
  basic="$(printf 'x-access-token:%s' "$MANIFEST_FAKE_TOKEN" | base64 | tr -d '\n')"
  GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null GIT_TERMINAL_PROMPT=0 \
    GIT_CONFIG_COUNT=2 \
    GIT_CONFIG_KEY_0=http.extraHeader GIT_CONFIG_VALUE_0="Authorization: Basic $basic" \
    GIT_CONFIG_KEY_1=credential.helper GIT_CONFIG_VALUE_1= \
    git -c user.name=faculty-dev -c user.email=faculty-dev@manifest.invalid \
      -c commit.gpgsign=false "$@"
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
