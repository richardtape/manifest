#!/usr/bin/env bash
# THE LAUNCH PATH PLAN'S ACCEPTANCE (Task 15): a faculty member takes an app to production
# THEMSELVES, through the edge, ON EITHER SOURCE DRIVER. The instructor builds an office-hours app
# and drafts the three records UBC asks for — the privacy assessment, then staging's and
# production's registrations with UBC IAM — reads them, and says each was sent, IN UBC'S ORDER; an
# agent on their token drafts and asks for sign-off but may not say anything was sent; an
# administrator works the queue, records UBC's answers, rehearses the sign-in, reads a preview and
# approves; the owner launches. Then what a launched app's people, credentials and models do: a
# revoked token's stream closes 4401, a removed colleague's 4404; a failed attempt is newer than the
# instance serving; and raising the app to `confidential` narrows an open agent session in place.
#
#   make demo-launch                                  # on whichever driver answers
#   DEMO_LAUNCH_STOP_AFTER=4 make demo-launch         # stop after step 4
#   DEMO_LAUNCH_SLUG=launchpath-control DEMO_LAUNCH_STOP_AFTER=2 make demo-launch
#                                                     # a negative control's short run, on a
#                                                     # project of its own that never launches
#   DEMO_LAUNCH_REAL=1 DEMO_LAUNCH_STOP_AFTER=3 make demo-launch   # the real leg — Rich's yes
#
# ONE SCRIPT, BOTH DRIVERS, as `make demo-frontend`. Step 0 asks which driver the control plane
# runs (`source_driver`, scripts/lib/api.sh) and picks the project: `launchpath-local` on driver 1,
# `launchpath-github` on driver 2 (THE FAKE — real GitHub is refused by name, unless
# DEMO_LAUNCH_REAL=1). A project's repository never moves between drivers.
#
# A LAUNCH HAPPENS ONCE PER PROJECT, and no route deletes a launched project. So a second run finds
# it launched, checks what that launch durably is, and runs steps 9–11, which repeat; a project an
# earlier run left UNLAUNCHED is deleted and made again, so steps 1–8 always run whole.
#
# THE SPLIT, as every headless demo's (P5a Decision 38). Signing in and stepping up are the
# browser's and the IdP's business (D23.8), so they go through THE one flow, infra/lib/idp-login.sh.
# Everything a CLIENT does is packages/journey/src/launch.ts, through @manifest/contract alone:
#
#   0  the build; the control plane, the driver, the public listener        bash
#   1  the project, the app committed, built, in sandbox and staging         launch.ts owner
#   2  the three drafts, read; a draft never gates a build                   launch.ts owner
#   3  an agent on a token drafts and asks — and may not send                launch.ts owner
#   4  the assessment sent; UBC's order holds the registrations              launch.ts owner
#   5  the queue; the assessment approved with its PIA number                launch.ts admin
#   6  staging's registration sent and active, then production's            launch.ts admin
#   7  the rehearsal, a preview, the approval — stepped up                   bash, launch.ts launch
#   8  the launch — stepped up — on the public listener                      launch.ts launch
#   9  a revoked token's stream 4401; a removed colleague's 4404             bash, launch.ts people
#  10  every instance's createdAt; a failed attempt newer than the serving   launch.ts instances
#  11  raised to confidential: an open agent session narrowed, not ended     bash, launch.ts narrow
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
DEVELOPER_TOKEN_FILE="$ROOT/infra/secrets/github-fake-developer.token"
OLLAMA="http://127.0.0.1:11434"
# The run's own directory: cookie jars and the state file the phases share — which holds step 3's
# token while it lives, so it is 0600 inside a 0700 directory. All of it is gone when the script ends.
WORK="$(mktemp -d -t manifest-launch)"
trap 'rm -rf "$WORK"' EXIT
CP_JAR="$WORK/instructor.jar"
IDP_JAR="$WORK/instructor-idp.jar"
OP_JAR="$WORK/operator.jar"
OP_IDP_JAR="$WORK/operator-idp.jar"
COL_JAR="$WORK/colleague.jar"
COL_IDP_JAR="$WORK/colleague-idp.jar"
STATE="$WORK/state.json"
RUN_ID="l$(date +%s)"
REAL="${DEMO_LAUNCH_REAL:-}"
STOP_AFTER="${DEMO_LAUNCH_STOP_AFTER:-}"
# A NEGATIVE CONTROL'S OWN PROJECT. Steps 1–8 run only on a project that has not launched, and the
# driver's own project launches on its first green run — so a control of steps 1–8 names another,
# stops before step 7, and the next run with that name deletes it and makes it again.
SLUG_OVERRIDE="${DEMO_LAUNCH_SLUG:-}"
case "$SLUG_OVERRIDE" in
  '' | launchpath-[a-z0-9-]*) ;;
  *) fail "DEMO_LAUNCH_SLUG is '$SLUG_OVERRIDE' — a slug beginning launchpath-" ;;
esac
case "$STOP_AFTER" in
  '' | [0-9] | 1[01]) ;;
  *) fail "DEMO_LAUNCH_STOP_AFTER is '$STOP_AFTER' — a step, 0 to 11" ;;
esac
case "$REAL" in
  '' | 1) ;;
  *) fail "DEMO_LAUNCH_REAL is '$REAL' — 1, or unset" ;;
esac

session_of() { awk -F'\t' 'NF==7 && $6=="manifest_session" {print $7}' "$1"; }

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
    MANIFEST_COLLEAGUE_SESSION="${COLLEAGUE_SESSION:-}" \
    MANIFEST_SLUG="$SLUG" MANIFEST_DRIVER="$DRIVER" MANIFEST_RUN_ID="$RUN_ID" \
    node packages/journey/dist/launch.js "$1" "$STATE"
}

state_field() { node -e 'const v=require(process.argv[1])[process.argv[2]];if(v===undefined){process.exit(1)}console.log(v)' "$STATE" "$1"; }

# §20's second round trip, for the person whose jars are $1 and $2. Prints the NEW session value.
# The cookie from before stays a valid, un-stepped session (P6a Decision 8). The IdP must RE-PROMPT
# a jar it signed in minutes ago (ForceAuthn), which `idp_login` asserts: its hop 2 fails unless the
# IdP serves a login form.
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

# THE REAL LEG ENDS BY DELETING WHAT IT MADE: the project never launched, so `deleteProject` takes it
# and its repository on GitHub — and `github-real-repos.sh` then reads it gone.
end_real_leg() {
  say "The real leg: the project is deleted, and its repository on GitHub with it"
  SESSION_STEPPED="$(step_up "$CP_JAR" "$IDP_JAR" instructor)"
  run_phase clear
  bash scripts/github-real-repos.sh
}

# Ends the run, green, once the step asked for is done — the phase has already said whether every
# check it ran passed (it exits 1 otherwise, and `set -e` stops here first).
stopped() {
  if state_field stopped >/dev/null 2>&1; then
    [ -z "$REAL" ] || end_real_leg
    say "Stopped after step $STOP_AFTER, as DEMO_LAUNCH_STOP_AFTER asked"
    exit 0
  fi
}

# The Ollama model behind a LOGICAL name, read from infra/litellm/config.yaml — the bootstrap
# catalogue. Prints nothing for a name that is not an Ollama model there.
ollama_tag_of() {
  awk -v name="$1" '
    $1 == "-" && $2 == "model_name:" { inside = ($3 == name); next }
    inside && $1 == "model:" { if (sub(/^ollama(_chat)?\//, "", $2)) print $2; exit }
  ' infra/litellm/config.yaml
}

warm() {
  local tag t0 code
  tag="$(ollama_tag_of "$1")"
  [ -n "$tag" ] || { echo "  ($1 is not an Ollama model in infra/litellm/config.yaml — not warmed)"; return 0; }
  t0=$SECONDS
  code="$(curl -sS -m 300 -o /dev/null -w '%{http_code}' "$OLLAMA/api/generate" \
    -d "{\"model\":\"$tag\",\"prompt\":\"ok\",\"stream\":false,\"think\":false,\"keep_alive\":\"30m\",\"options\":{\"num_predict\":1}}" || true)"
  [ "$code" = 200 ] || fail "Ollama did not warm $tag (answered $code) — ollama list; make doctor"
  echo "  warmed $tag, behind $1, in $((SECONDS - t0)) s"
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
if [ -n "$REAL" ]; then
  # THE REAL LEG (Step 5, Rich's yes): driver 2 on the REAL App, steps 0–3, and the project deleted
  # at the end. Every repository on the real App is private, in the organisation .env names, and
  # named `lp-…` (the plan's Decision 3).
  [ "$DRIVER" = github ] || fail "DEMO_LAUNCH_REAL=1 needs the control plane on driver 2, on the real App"
  [ "$STOP_AFTER" = 3 ] || fail "DEMO_LAUNCH_REAL=1 runs steps 0–3 only — set DEMO_LAUNCH_STOP_AFTER=3"
  SLUG="lp-launchpath"
else
  case "$DRIVER" in
    local) ;;
    github)
      # The FAKE's demo, never real GitHub's (the launch path plan's Task 2) — asked before its health.
      require_fake_github
      [ "$(curl -sS -m 2 "$FAKE/_fake/health" 2>/dev/null)" = ok ] \
        || fail "the control plane runs driver 2 and the GitHub fake does not answer at $FAKE — make github-up"
      [ -r "$DEVELOPER_TOKEN_FILE" ] || fail "$DEVELOPER_TOKEN_FILE is missing — \`make up\` mints it"
      ;;
    *) fail "source_driver answered '$DRIVER'" ;;
  esac
  SLUG="${SLUG_OVERRIDE:-launchpath-$DRIVER}"
fi
echo "  driver $([ "$DRIVER" = local ] && echo 1 || echo 2) ($DRIVER)$([ -n "$REAL" ] && echo ', the REAL App') — the app is $SLUG"

say "0. Is §12's public listener there? (127.0.0.3)"
ifconfig lo0 | grep -q "inet $PUBLIC_EDGE_IP " || fail "$PUBLIC_EDGE_IP is not on lo0 —
a production app has nowhere to answer. \`make host-setup\` adds it (it needs sudo)."
echo "  $PUBLIC_EDGE_IP is on lo0"
if [ "$STOP_AFTER" = 0 ]; then
  say "Stopped after step 0, as DEMO_LAUNCH_STOP_AFTER asked"
  exit 0
fi

say "1. The instructor signs in with CWL"
idp_login "$CP_JAR" "$IDP_JAR" "$ORIGIN/auth/login" instructor instructor \
  "$ORIGIN/auth/saml/callback" "$CA"
SESSION="$(session_of "$CP_JAR")"
[ -n "$SESSION" ] || fail "the sign-in left no manifest_session cookie"
# The slug's repository, if a `pnpm test` or `make reset` left it without its project.
[ -n "$REAL" ] || clear_orphan_repository "$SLUG"
run_phase find
EXISTING="$(state_field existing)" || fail "find recorded nothing"
if [ "$EXISTING" = unlaunched ]; then
  SESSION_STEPPED="$(step_up "$CP_JAR" "$IDP_JAR" instructor)"
  run_phase clear
  [ -n "$REAL" ] || clear_orphan_repository "$SLUG"
  EXISTING=none
fi

say "An administrator, made out of band (§20)"
# Signed in ONCE so the users row exists, granted, then signed in AGAIN — a session carries the
# role it was issued with. `admin-grant.sh` records nothing when the role is already set.
idp_login "$OP_JAR" "$OP_IDP_JAR" "$ORIGIN/auth/login" operator operator \
  "$ORIGIN/auth/saml/callback" "$CA"
bash scripts/admin-grant.sh grant opr000001 "The launch path's acceptance works the queue and approves a launch"
rm -f "$OP_JAR" "$OP_IDP_JAR"
idp_login "$OP_JAR" "$OP_IDP_JAR" "$ORIGIN/auth/login" operator operator \
  "$ORIGIN/auth/saml/callback" "$CA"
ADMIN_SESSION="$(session_of "$OP_JAR")"
[ -n "$ADMIN_SESSION" ] || fail "the operator's second sign-in left no session"

if [ "$EXISTING" = launched ]; then
  say "1–8. $SLUG launched on an earlier run — the RE-USE path"
  run_phase reuse
  stopped
else
  say "1–4. The instructor builds the app, drafts the three records, lets an agent help, and sends the first"
  run_phase owner
  stopped

  say "5–6. The administrators' queue, and the records sent and recorded in UBC's order"
  run_phase admin
  stopped

  say "7. Both people re-prove themselves at the IdP (§20's step-up)"
  ADMIN_SESSION_STEPPED="$(step_up "$OP_JAR" "$OP_IDP_JAR" operator)"
  SESSION_STEPPED="$(step_up "$CP_JAR" "$IDP_JAR" instructor)"
  echo "  both stepped up — the IdP re-prompted browsers it had signed in"

  say "7–8. The rehearsal, the approval, and the launch"
  run_phase launch
  stopped
fi

say "9. The colleague signs in; the owner re-proves themselves to change who is on the project"
idp_login "$COL_JAR" "$COL_IDP_JAR" "$ORIGIN/auth/login" colleague colleague \
  "$ORIGIN/auth/saml/callback" "$CA"
COLLEAGUE_SESSION="$(session_of "$COL_JAR")"
[ -n "$COLLEAGUE_SESSION" ] || fail "the colleague's sign-in left no session"
SESSION_STEPPED="$(step_up "$CP_JAR" "$IDP_JAR" instructor)"
run_phase people
stopped

say "10. Every instance says when it was made"
run_phase instances
stopped

say "11. The models an agent session holds, warmed — then the app raised to confidential"
# default-chat is called before the raise and default-chat-onprem after it; loading the on-premise
# model EVICTS the small one (TRAPS.md), so only the first is warmed here and the second's first
# call is allowed its cold start.
warm default-chat
run_phase narrow
stopped

say "Done: $SLUG went to production, launched by its owner, and every check passed"
