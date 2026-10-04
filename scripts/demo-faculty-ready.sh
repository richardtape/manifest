#!/usr/bin/env bash
# THE FACULTY-READY PLAN'S ACCEPTANCE (Task 11): what stood between the platform and a real faculty
# member's first day, each seen through the edge, ON EITHER SOURCE DRIVER.
#
#   make demo-faculty-ready                                  # on whichever driver answers
#   DEMO_FACULTY_READY_STOP_AFTER=3 make demo-faculty-ready  # stop after step 3
#   DEMO_FACULTY_READY_CP_LOG=<file> make demo-faculty-ready # the control plane's output, when this
#                                                            # script cannot find it on 7100's stderr
#
# ONE SCRIPT, BOTH DRIVERS, as `make demo-launch`. Step 0 asks which driver the control plane runs
# (`source_driver`, scripts/lib/api.sh) and picks the project: `facultyready-local` on driver 1,
# `facultyready-github` on driver 2 (THE FAKE — real GitHub is refused by name).
#
# NOTHING HERE LAUNCHES, so a project an earlier run left is deleted and made again: the fresh path and
# the re-use path differ only in that, and every step after it runs whole.
#
# THE SPLIT, as every headless demo's (P5a Decision 38). Signing in and stepping up are the browser's
# and the IdP's business (D23.8), so they go through THE one flow, infra/lib/idp-login.sh. Everything
# a CLIENT does is packages/journey/src/faculty-ready.ts, through @manifest/contract alone:
#
#   0  the build; the control plane, the driver, its output                       bash
#   1  sign-in through the edge: __Host- cookies on console. and app., a tossed
#      plain cookie changes nothing (FE-28)                                       bash
#   2  a refusal's reference, as a header and in the body, logged once (FE-30)   faculty-ready.ts basics
#   3  the test blueprint not offered, still resolving (FE-31)                    faculty-ready.ts basics
#   4  a model session's start replayed names the session (FE-29)               faculty-ready.ts app
#   5  the app on staging; its container's PID 1 is docker-init (Task 8)         faculty-ready.ts app, bash
#   6  an administrator's reason — not a member; a collaborator, beyond the role
#      (§26, Tasks 10 and 15)                                                     faculty-ready.ts admin
#   7  an agent's question ends with its token; a removal recorded once
#      (Tasks 13, 16, 16b)                                                        faculty-ready.ts question
#   8  the app's answer to the IdP's single logout is Success (Task 17)          bash
#
# macOS ships bash 3.2 and a BSD userland: no associative arrays, no `mapfile`, no `xargs -r`,
# no `readlink -f`.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
# shellcheck source=../infra/lib/common.sh
. infra/lib/common.sh
# shellcheck source=../infra/lib/idp-login.sh
. infra/lib/idp-login.sh
# shellcheck source=./lib/api.sh
. scripts/lib/api.sh

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

CA="$ROOT/$CA_FILE"
FAKE="${MANIFEST_FAKE_URL:-http://127.0.0.1:7110}"
APP_ORIGIN="https://app.$ZONE"
# The run's own directory: cookie jars, a sign-out's hops and the state file the phases share. All of
# it is gone when the script ends.
WORK="$(mktemp -d -t manifest-faculty-ready)"
trap 'rm -rf "$WORK"' EXIT
CP_JAR="$WORK/instructor.jar"
IDP_JAR="$WORK/instructor-idp.jar"
APP_JAR="$WORK/instructor-app.jar"
APP_IDP_JAR="$WORK/instructor-app-idp.jar"
OP_JAR="$WORK/operator.jar"
OP_IDP_JAR="$WORK/operator-idp.jar"
COL_JAR="$WORK/colleague.jar"
COL_IDP_JAR="$WORK/colleague-idp.jar"
STU_JAR="$WORK/student-app.jar"
STU_IDP_JAR="$WORK/student-idp.jar"
STATE="$WORK/state.json"
RUN_ID="f$(date +%s)"
STOP_AFTER="${DEMO_FACULTY_READY_STOP_AFTER:-}"
case "$STOP_AFTER" in
  '' | [0-8]) ;;
  *) fail "DEMO_FACULTY_READY_STOP_AFTER is '$STOP_AFTER' — a step, 0 to 8" ;;
esac

# Bash's own checks, printed as the TypeScript half prints its: every one runs, and a step that had a
# failure ends the run red, naming each.
FAILED=""
check() { # $1 = name, $2 = 0 when it holds, $3 = detail shown when it does not
  if [ "$2" = 0 ]; then
    printf '  ok   %s\n' "$1"
  else
    printf '  FAIL %s — %s\n' "$1" "${3:-}"
    FAILED="$FAILED
  $1"
  fi
}
# A condition's truth as check's 0/1, without tripping `set -e`: `check "…" "$(holds [ "$a" = b ])"`.
holds() { if "$@"; then echo 0; else echo 1; fi; }
step_done() { # $1 = the step
  if [ -n "$FAILED" ]; then
    printf '\n\033[31mstep %s FAILED:%s\033[0m\n' "$1" "$FAILED" >&2
    exit 1
  fi
  echo "  every check passed"
  if [ "$STOP_AFTER" = "$1" ]; then
    say "Stopped after step $1, as DEMO_FACULTY_READY_STOP_AFTER asked"
    exit 0
  fi
}

# The Manifest session out of a curl jar, under its name on an https origin (FE-28).
session_of() { awk -F'\t' 'NF==7 && $6=="__Host-manifest_session" {print $7}' "$1"; }

# Quiet when it builds, and LOUD when it does not: `tsc` writes its errors to STDOUT.
build() {
  local out
  if ! out="$(pnpm --filter "$1" build 2>&1)"; then
    printf '%s\n' "$out" >&2
    fail "$1 does not build — tsc's errors are above. This demo is checked against the
generated contract, so a call or a field the contract does not have stops here."
  fi
}

# One phase of the TypeScript half. Each reads the state file the last one wrote.
run_phase() {
  env NODE_EXTRA_CA_CERTS="$CA" MANIFEST_ORIGIN="$ORIGIN" MANIFEST_STOP_AFTER="$STOP_AFTER" \
    MANIFEST_SESSION="${SESSION:-}" MANIFEST_SESSION_STEPPED="${SESSION_STEPPED:-}" \
    MANIFEST_ADMIN_SESSION="${ADMIN_SESSION:-}" \
    MANIFEST_ADMIN_SESSION_STEPPED="${ADMIN_SESSION_STEPPED:-}" \
    MANIFEST_CP_LOG="$CP_LOG" \
    MANIFEST_SLUG="$SLUG" MANIFEST_DRIVER="$DRIVER" MANIFEST_RUN_ID="$RUN_ID" \
    node packages/journey/dist/faculty-ready.js "$1" "$STATE"
}

state_field() { node -e 'const v=require(process.argv[1])[process.argv[2]];if(v===undefined){process.exit(1)}console.log(v)' "$STATE" "$1"; }

# Ends the run, green, once the step asked for is done — the phase has already said whether every
# check it ran passed (it exits 1 otherwise, and `set -e` stops here first).
stopped() {
  if state_field stopped >/dev/null 2>&1; then
    say "Stopped after step $STOP_AFTER, as DEMO_FACULTY_READY_STOP_AFTER asked"
    exit 0
  fi
}

# §20's second round trip, for the person whose jars are $1 and $2. Prints the NEW session value.
step_up() {
  local jar="$1" idp_jar="$2" user="$3" before after
  before="$(session_of "$jar")"
  idp_login "$jar" "$idp_jar" "$ORIGIN/auth/step-up" "$user" "$user" \
    "$ORIGIN/auth/saml/callback" "$CA"
  after="$(session_of "$jar")"
  [ -n "$after" ] && [ "$after" != "$before" ] || fail "the step-up for '$user' left the
session unchanged — the callback did not re-sign it. Read the control plane's '[auth] step-up' lines."
  printf '%s' "$after"
}

# The control plane's own output — what step 2 reads its operator line from. The file 7100's process
# writes its stderr to, when that is a regular file (RUNBOOK's start scripts redirect it to one); else
# nothing, and step 2 says so.
cp_log() {
  local pid file
  pid="$(lsof -nP -iTCP:"${PORT_CONTROL_PLANE:-7100}" -sTCP:LISTEN -t 2>/dev/null | head -1)"
  [ -n "$pid" ] || return 0
  file="$(lsof -a -p "$pid" -d 2 -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)"
  if [ -n "$file" ] && [ -f "$file" ] && [ -r "$file" ]; then echo "$file"; fi
}

# One cookie's jar line, by name: `domain flag path secure expiry name value`, tab-separated.
cookie_line() { awk -F'\t' -v n="$2" 'NF==7 && $6==n' "$1"; }

# Step 1's check of one origin's jar: exactly the `__Host-` session — host-only, `Path=/`, Secure —
# and no plain name beside it.
check_host_cookie() { # $1 = jar, $2 = host
  local line domain flag cpath secure
  line="$(cookie_line "$1" __Host-manifest_session)"
  domain="$(printf '%s' "$line" | cut -f1)"; flag="$(printf '%s' "$line" | cut -f2)"
  cpath="$(printf '%s' "$line" | cut -f3)"; secure="$(printf '%s' "$line" | cut -f4)"
  if [ "$domain" = "#HttpOnly_$2" ] && [ "$flag" = FALSE ] && [ "$cpath" = / ] && [ "$secure" = TRUE ]
  then R=0; else R=1; fi
  check "on $2 the jar holds __Host-manifest_session: HttpOnly, no Domain, Path=/, Secure" $R \
    "domain '$domain' subdomains '$flag' path '$cpath' secure '$secure'"
  check "and no plain manifest_session beside it" "$(holds [ -z "$(cookie_line "$1" manifest_session)" ])" "$(cookie_line "$1" manifest_session | cut -f1-6)"
}

# `GET /v1/me` with a jar, saying who answered (a puid) or the refusal's code. $3, when given, is a
# file the request's trace goes to — what curl SENT, to prove a cookie was offered.
me_with() { # $1 = jar, $2 = origin, [$3 = trace file]
  local body
  if [ -n "${3:-}" ]; then
    body="$(curl -sS -v --cacert "$CA" -b "$1" "$2/v1/me" 2>"$3")"
  else
    body="$(curl -sS --cacert "$CA" -b "$1" "$2/v1/me")"
  fi
  printf '%s' "$body" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);console.log(j.puid??j.error?.code??"?")}catch{console.log("unparsable")}})'
}

# Every SAMLResponse in a list of URLs (one per line), decoded: each one's StatusCode, one per line.
saml_statuses() { # $1 = file of URLs or log lines carrying `singleLogout?SAMLResponse=`
  sed -n 's#.*/module.php/saml/idp/singleLogout?SAMLResponse=\([^& ]*\).*#\1#p' "$1" > "$1.responses"
  node -e '
    const { inflateRawSync } = require("node:zlib")
    const lines = require("node:fs").readFileSync(process.argv[1], "utf8").split("\n").filter(Boolean)
    for (const l of lines) {
      const xml = inflateRawSync(Buffer.from(decodeURIComponent(l), "base64")).toString("utf8")
      console.log((/StatusCode\s+Value="([^"]+)"/.exec(xml) || [, "unreadable"])[1])
    }' "$1.responses"
}

# 0 when there is at least one status and every one is Success; else 1.
all_success() {
  if [ -n "$1" ] && ! printf '%s\n' "$1" | grep -qv '^urn:oasis:names:tc:SAML:2.0:status:Success$'
  then echo 0; else echo 1; fi
}

# An app's sign-out, as a browser walks it: every redirect followed by hand, each hop's URL written to
# $3 — so the app's own LogoutResponse to the IdP is seen as it is sent. The same walk as
# scripts/lib/proof-app.sh's, which keeps no hops.
sign_out_walk() { # $1 = app jar, $2 = IdP jar, $3 = hops file, $4 = the app's base URL
  local url="$4/auth/logout" jar out code next hops=0
  : > "$3"
  while :; do
    hops=$((hops + 1))
    [ "$hops" -le 10 ] || fail "signing out took more than 10 redirects — a loop between the app and the IdP. Last: $url"
    printf '%s\n' "$url" >> "$3"
    case "$url" in "https://idp.$ZONE/"*) jar="$2" ;; *) jar="$1" ;; esac
    out="$(curl -sS --cacert "$CA" -b "$jar" -c "$jar" -o /dev/null -w '%{http_code} %{redirect_url}' "$url")"
    code="${out%% *}"; next="${out#* }"
    [ "$code" -lt 400 ] || fail "signing out stopped at $code on $url — read docker logs manifest-idp"
    [ -n "$next" ] || break
    url="$next"
  done
}

say "0. The client and the demo, built from the checked-in document"
build @manifest/contract
build @manifest/journey
echo "  built"

say "0. Is the control plane up, through the edge?"
UP="$(curl -sS -m 5 -w ' [%{http_code}]' "$API/v1/me" 2>&1 || true)"
case "$UP" in
  *'"UNAUTHENTICATED"'*) echo "  $API answered" ;;
  *) fail "no control plane behind $API (got: ${UP:0:120}).
docs/superpowers/RUNBOOK.md's 'Running the control plane' has the exact commands." ;;
esac

say "0. Which source driver? An unsigned POST /webhooks/github, which records nothing"
DRIVER="$(source_driver)" || exit 1
case "$DRIVER" in
  local) ;;
  github)
    # The FAKE's demo, never real GitHub's — asked before its health.
    require_fake_github
    [ "$(curl -sS -m 2 "$FAKE/_fake/health" 2>/dev/null)" = ok ] \
      || fail "the control plane runs driver 2 and the GitHub fake does not answer at $FAKE — make github-up"
    ;;
  *) fail "source_driver answered '$DRIVER'" ;;
esac
SLUG="facultyready-$DRIVER"
echo "  driver $([ "$DRIVER" = local ] && echo 1 || echo 2) ($DRIVER) — the app is $SLUG"

say "0. The control plane's output, for step 2's operator line"
CP_LOG="${DEMO_FACULTY_READY_CP_LOG:-$(cp_log)}"
if [ -n "$CP_LOG" ]; then
  [ -r "$CP_LOG" ] || fail "DEMO_FACULTY_READY_CP_LOG is '$CP_LOG', which cannot be read"
  echo "  $CP_LOG"
else
  echo "  none found — 7100's stderr is not a file here; step 2 will say so"
fi
if [ "$STOP_AFTER" = 0 ]; then
  say "Stopped after step 0, as DEMO_FACULTY_READY_STOP_AFTER asked"
  exit 0
fi

say "1. The instructor signs in with CWL — on console. and on app."
idp_login "$CP_JAR" "$IDP_JAR" "$ORIGIN/auth/login" instructor instructor \
  "$ORIGIN/auth/saml/callback" "$CA"
SESSION="$(session_of "$CP_JAR")"
[ -n "$SESSION" ] || fail "the sign-in left no __Host-manifest_session cookie"
idp_login "$APP_JAR" "$APP_IDP_JAR" "$APP_ORIGIN/auth/login" instructor instructor \
  "$APP_ORIGIN/auth/saml/callback" "$CA"
check_host_cookie "$CP_JAR" "console.$ZONE"
check_host_cookie "$APP_JAR" "app.$ZONE"
WHO="$(me_with "$CP_JAR" "$ORIGIN")"
check "console.'s /v1/me answers the instructor" "$(holds [ "$WHO" = ins000001 ])" "$WHO"
WHO="$(me_with "$APP_JAR" "$APP_ORIGIN")"
check "app.'s /v1/me answers the instructor" "$(holds [ "$WHO" = ins000001 ])" "$WHO"

say "1. An administrator, made out of band (§20), and a colleague"
# Signed in ONCE so the users row exists, granted, then signed in AGAIN — a session carries the
# role it was issued with. `admin-grant.sh` records nothing when the role is already set.
idp_login "$OP_JAR" "$OP_IDP_JAR" "$ORIGIN/auth/login" operator operator \
  "$ORIGIN/auth/saml/callback" "$CA"
bash scripts/admin-grant.sh grant opr000001 "The faculty-ready acceptance acts on a project as an administrator"
rm -f "$OP_JAR" "$OP_IDP_JAR"
idp_login "$OP_JAR" "$OP_IDP_JAR" "$ORIGIN/auth/login" operator operator \
  "$ORIGIN/auth/saml/callback" "$CA"
ADMIN_SESSION="$(session_of "$OP_JAR")"
[ -n "$ADMIN_SESSION" ] || fail "the operator's second sign-in left no session"
idp_login "$COL_JAR" "$COL_IDP_JAR" "$ORIGIN/auth/login" colleague colleague \
  "$ORIGIN/auth/saml/callback" "$CA"
[ -n "$(session_of "$COL_JAR")" ] || fail "the colleague's sign-in left no session"

say "1. A plain manifest_session tossed from a sibling host (Domain=$ZONE) changes nothing (FE-28)"
# What a faculty app on another *.manifest.internal name can do to a colleague's browser: set a
# cookie for the whole zone. It carries ANOTHER PERSON'S live session — the operator's — so if the
# platform read the plain name, /v1/me would answer the operator.
TOSSED="$WORK/tossed.jar"
cp "$CP_JAR" "$TOSSED"
printf '.%s\tTRUE\t/\tFALSE\t0\tmanifest_session\t%s\n' "$ZONE" "$ADMIN_SESSION" >> "$TOSSED"
WHO="$(me_with "$TOSSED" "$ORIGIN" "$WORK/tossed.trace")"
check "curl offered the tossed plain cookie beside the __Host- one" \
  "$(holds grep -Eq '^> [Cc]ookie: (.*; )?manifest_session=' "$WORK/tossed.trace")" \
  "$(grep -i '^> cookie' "$WORK/tossed.trace" | cut -c1-60)"
check "and /v1/me still answers the instructor, not the operator" "$(holds [ "$WHO" = ins000001 ])" "$WHO"
ONLY="$WORK/only-tossed.jar"
printf '.%s\tTRUE\t/\tFALSE\t0\tmanifest_session\t%s\n' "$ZONE" "$ADMIN_SESSION" > "$ONLY"
WHO="$(me_with "$ONLY" "$ORIGIN")"
check "the tossed cookie alone is no session at all — 401 UNAUTHENTICATED" "$(holds [ "$WHO" = UNAUTHENTICATED ])" "$WHO"
step_done 1

say "1. Here from a run before? It is deleted and made again — nothing here launches"
# The slug's repository, if a `pnpm test` or `make reset` left it without its project.
clear_orphan_repository "$SLUG"
run_phase find
EXISTING="$(state_field existing)" || fail "find recorded nothing"
if [ "$EXISTING" = here ]; then
  SESSION_STEPPED="$(step_up "$CP_JAR" "$IDP_JAR" instructor)"
  run_phase clear
  clear_orphan_repository "$SLUG"
fi

say "2–3. A refusal's reference; the test blueprint not offered"
run_phase basics
stopped

say "4–5. The project, a model session's start replayed, and the app on staging"
run_phase app
stopped

say "5. The app container's PID 1 is an init that reaps orphans (§12, Task 8)"
INSTANCE="$(state_field instanceId)" || fail "the app phase recorded no instance"
CONTAINER="$(docker ps -q --filter "label=manifest.instance=$INSTANCE" --filter 'name=-app$' | head -1)"
[ -n "$CONTAINER" ] || fail "no running container carries manifest.instance=$INSTANCE"
PID1="$(docker exec "$CONTAINER" cat /proc/1/comm 2>&1 || true)"
check "PID 1 is docker-init" "$(holds [ "$PID1" = docker-init ])" "'$PID1'"
# Node 24 names its main thread `MainThread`, so `comm` never reads `node`: the command line does.
NODE_PID="$(docker exec "$CONTAINER" sh -c 'for p in /proc/[0-9]*; do
  case "$(tr "\0" " " < "$p/cmdline" 2>/dev/null)" in
    "node "*) [ "$(sed -n "s/^PPid:[[:space:]]*//p" "$p/status")" = 1 ] && basename "$p" ;;
  esac
done' 2>&1 | head -1 || true)"
if [ -n "$NODE_PID" ] && [ "$NODE_PID" != 1 ]; then R=0; else R=1; fi
check "and the app's node runs as its child (pid $NODE_PID), not as PID 1" $R "node pid '$NODE_PID'"
step_done 5

say "6. Both re-prove themselves at the IdP (§20's step-up) — member management needs it"
SESSION_STEPPED="$(step_up "$CP_JAR" "$IDP_JAR" instructor)"
ADMIN_SESSION_STEPPED="$(step_up "$OP_JAR" "$OP_IDP_JAR" operator)"
echo "  both stepped up — the IdP re-prompted browsers it had signed in"

say "6. An administrator's reason — as no member, then as a collaborator"
run_phase admin
stopped

say "7. An agent's question ends with its token; a removal recorded once"
SESSION_STEPPED="$(step_up "$CP_JAR" "$IDP_JAR" instructor)"
run_phase question
stopped

say "8. A student signs in to the app, and out — and the app tells the IdP it signed them out"
APP_URL="https://$(state_field stagingHost)" || fail "the app phase recorded no staging host"
# A little before now, by the Docker VM's clock, which is not the host's (ORIENTATION §4, trap 14).
SINCE="$(date -u -v-10S +%Y-%m-%dT%H:%M:%SZ)"
idp_login "$STU_JAR" "$STU_IDP_JAR" "$APP_URL/login" student student \
  "$APP_URL/auth/ubcshib/callback" "$CA"
PAGE="$(curl -sS --cacert "$CA" -b "$STU_JAR" "$APP_URL/")"
case "$PAGE" in *'<p>Hello, '*) R=0 ;; *) R=1 ;; esac
check "the app greets the signed-in student" $R "$(printf '%s' "$PAGE" | tr '\n' ' ' | cut -c1-160)"
HOPS="$WORK/sign-out.hops"
sign_out_walk "$STU_JAR" "$STU_IDP_JAR" "$HOPS" "$APP_URL"
STATUSES="$(saml_statuses "$HOPS")"
echo "  the app's answer(s) on the way, decoded: $(printf '%s' "$STATUSES" | tr '\n' ' ')"
check "the app answered the IdP's LogoutRequest status:Success" "$(all_success "$STATUSES")" \
  "${STATUSES:-no LogoutResponse among the hops}"
docker logs manifest-idp --since "$SINCE" 2>&1 | grep 'singleLogout?SAMLResponse=' > "$WORK/idp-access.log" || true
LOGGED="$(saml_statuses "$WORK/idp-access.log")"
check "and the IdP's own access log holds the same: every answer since the sign-in Success" \
  "$(all_success "$LOGGED")" "${LOGGED:-none logged}"
PAGE="$(curl -sS --cacert "$CA" -b "$STU_JAR" "$APP_URL/")"
case "$PAGE" in *'Sign in with CWL'*) R=0 ;; *) R=1 ;; esac
check "and the app has forgotten the student" $R "$(printf '%s' "$PAGE" | tr '\n' ' ' | cut -c1-160)"
step_done 8

say "Done: $SLUG on driver $([ "$DRIVER" = local ] && echo 1 || echo 2), and every check passed"
