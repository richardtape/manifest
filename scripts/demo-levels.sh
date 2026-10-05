#!/usr/bin/env bash
# THE U1 PLAN'S ACCEPTANCE (Task 7): Manifest's data classes as UBC's U1 levels — low | medium | high |
# very-high, the three earlier names kept as aliases (public = low, internal = medium, confidential =
# very-high) — each seen through the edge, ON EITHER SOURCE DRIVER, offline.
#
#   make demo-levels                             # on whichever driver answers
#   DEMO_LEVELS_STOP_AFTER=3 make demo-levels    # stop after step 3
#   MANIFEST_ENV_FILE=<copy> make demo-levels    # read the capable model's setting from a copy of .env
#
# ONE SCRIPT, BOTH DRIVERS, as `make demo-faculty-ready`. Step 0 asks which driver the control plane runs
# (`source_driver`, scripts/lib/api.sh) and picks the projects: `levels-local` and `levels-vh-local` on
# driver 1, `levels-github` and `levels-vh-github` on driver 2 (THE FAKE — real GitHub is refused by name).
#
# NOTHING HERE LAUNCHES, so the projects an earlier run left are deleted and made again: the fresh path
# and the re-use path differ only in that. The `high` project is LEFT after the run — its privacy
# assessment drafted — for a person to read in the console's Records (Task 7, Step 4).
#
# THE SPLIT, as every headless demo's (P5a Decision 38). Signing in and stepping up are the browser's
# and the IdP's business (D23.8), so they go through THE one flow, infra/lib/idp-login.sh. Everything a
# CLIENT does is packages/journey/src/levels.ts, through @manifest/contract alone:
#
#   0  the build; the control plane, the driver; the capable model's level, read
#      from LiteLLM and from .env; sign-in; the two projects                       bash, levels.ts make
#   1  D17 at high, in U1's words (E14's hint)                                      levels.ts
#   2  the alias never widens: confidential is very-high                            levels.ts
#   3  stored as the level, answered in U1's names; a rename is not a change (S6)  levels.ts
#   4  the agents' models: by rank at high, by the builder exception at very-high  levels.ts
#   5  a token refused a high project's staging Incidents (S9)                     levels.ts
#   6  the privacy assessment: High, on-premise, zero retention                    levels.ts
#
# THE CAPABLE MODEL is read ONCE, here: LiteLLM's /model/info with the master key (as make demo-gateway
# reads it), its `default-chat-large` row's max_classification through the seven-name map, and .env's
# MANIFEST_CAPABLE_MODEL_CLASSIFICATION through the same map (`medium` when unset). Listed, the two must
# be equal (step 1) — the thread .env → index.ts → registration, end to end. Every half that needs the
# capable model at `high` prints NOT RUN when it is not — a half not run is not a pass.
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
ENV_FILE="${MANIFEST_ENV_FILE:-.env}"
# The run's own directory: cookie jars and the state file the phases share. All of it is gone when the
# script ends.
WORK="$(mktemp -d -t manifest-levels)"
trap 'rm -rf "$WORK"' EXIT
CP_JAR="$WORK/instructor.jar"
IDP_JAR="$WORK/instructor-idp.jar"
STATE="$WORK/state.json"
RUN_ID="l$(date +%s)"
STOP_AFTER="${DEMO_LEVELS_STOP_AFTER:-}"
case "$STOP_AFTER" in
  '' | [0-6]) ;;
  *) fail "DEMO_LEVELS_STOP_AFTER is '$STOP_AFTER' — a step, 0 to 6" ;;
esac

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
    MANIFEST_SLUG="$SLUG" MANIFEST_VH_SLUG="$VH_SLUG" MANIFEST_DRIVER="$DRIVER" MANIFEST_RUN_ID="$RUN_ID" \
    MANIFEST_CAPABLE="$CAPABLE" MANIFEST_CAPABLE_LEVEL="$CAPABLE_LEVEL" \
    MANIFEST_CAPABLE_SETTING_LEVEL="$CAPABLE_SETTING_LEVEL" \
    node packages/journey/dist/levels.js "$1" "$STATE"
}

state_field() { node -e 'const v=require(process.argv[1])[process.argv[2]];if(v===undefined){process.exit(1)}console.log(v)' "$STATE" "$1"; }

# Ends the run, green, once the step asked for is done — the phase has already said whether every
# check it ran passed (it exits 1 otherwise, and `set -e` stops here first).
stopped() {
  if state_field stopped >/dev/null 2>&1; then
    say "Stopped after step $STOP_AFTER, as DEMO_LEVELS_STOP_AFTER asked"
    exit 0
  fi
}

# §20's second round trip, for the instructor. Prints the NEW session value.
step_up() {
  local before after
  before="$(session_of "$CP_JAR")"
  idp_login "$CP_JAR" "$IDP_JAR" "$ORIGIN/auth/step-up" instructor instructor \
    "$ORIGIN/auth/saml/callback" "$CA"
  after="$(session_of "$CP_JAR")"
  [ -n "$after" ] && [ "$after" != "$before" ] || fail "the step-up left the session unchanged —
the callback did not re-sign it. Read the control plane's '[auth] step-up' lines."
  printf '%s' "$after"
}

# A setting the env file holds that is NOT a secret, read in a subshell. Empty when unset.
env_value() { ( set +u; unset "$1"; set -a; . "$ENV_FILE"; set +a; eval "printf '%s' \"\${$1:-}\"" ); }

# A level by any of its seven names, as the U1 level it is; anything else as it was written.
as_level() {
  case "$1" in
    public) echo low ;;
    internal) echo medium ;;
    confidential) echo very-high ;;
    *) echo "$1" ;;
  esac
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
SLUG="levels-$DRIVER"
VH_SLUG="levels-vh-$DRIVER"
echo "  driver $([ "$DRIVER" = local ] && echo 1 || echo 2) ($DRIVER) — the projects are $SLUG and $VH_SLUG"

say "0. The capable model (default-chat-large): its row in LiteLLM, and the level .env sets"
[ -r "$ENV_FILE" ] || fail "$ENV_FILE cannot be read — the master key and the capable model's setting are in it"
CODE="$( ( set +u; set -a; . "$ENV_FILE"; set +a
  printf 'header = "Authorization: Bearer %s"\n' "$LITELLM_MASTER_KEY" |
    curl -sS -K - -m 30 -o "$WORK/model-info.json" -w '%{http_code}' "http://127.0.0.1:$PORT_LITELLM/model/info" 2>/dev/null ) || true)"
[ "$CODE" = 200 ] || fail "LiteLLM's /model/info answered '$CODE' on 127.0.0.1:$PORT_LITELLM — make up"
ROW_LEVEL="$(node -e '
  const rows = (JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")).data ?? [])
    .filter((m) => m.model_name === "default-chat-large")
  if (rows.length > 1) { console.error(`${rows.length} default-chat-large rows`); process.exit(1) }
  console.log(rows.length === 0 ? "" : String(rows[0].model_info?.max_classification ?? "(none)"))
' "$WORK/model-info.json")" || fail "LiteLLM lists default-chat-large more than once — read /model/info"
if [ -n "$ROW_LEVEL" ]; then
  CAPABLE=listed
  CAPABLE_LEVEL="$(as_level "$ROW_LEVEL")"
else
  CAPABLE=absent
  CAPABLE_LEVEL=""
fi
SETTING="$(env_value MANIFEST_CAPABLE_MODEL_CLASSIFICATION)"
CAPABLE_SETTING_LEVEL="$(as_level "${SETTING:-medium}")"
echo "  default-chat-large: $CAPABLE${CAPABLE_LEVEL:+ at $CAPABLE_LEVEL (stored '$ROW_LEVEL')}; $ENV_FILE sets $CAPABLE_SETTING_LEVEL"
[ "$CAPABLE" = listed ] && [ "$CAPABLE_LEVEL" = high ] \
  || echo "  — not listed at high, so the capable model's halves of steps 2, 3, 4 and 6 read NOT RUN"

say "0. The instructor signs in with CWL"
idp_login "$CP_JAR" "$IDP_JAR" "$ORIGIN/auth/login" instructor instructor \
  "$ORIGIN/auth/saml/callback" "$CA"
SESSION="$(session_of "$CP_JAR")"
[ -n "$SESSION" ] || fail "the sign-in left no __Host-manifest_session cookie"
echo "  signed in"

say "0. Here from a run before? Deleted and made again — nothing here launches"
# The slugs' repositories, if a `pnpm test` or `make reset` left them without their projects.
clear_orphan_repository "$SLUG"
clear_orphan_repository "$VH_SLUG"
run_phase find
EXISTING="$(state_field existing)" || fail "find recorded nothing"
if [ "$EXISTING" = here ]; then
  SESSION_STEPPED="$(step_up)"
  run_phase clear
  clear_orphan_repository "$SLUG"
  clear_orphan_repository "$VH_SLUG"
fi
run_phase make
stopped

say "1–6. The levels, through the generated client"
run_phase levels
stopped

say "Done: $SLUG on driver $([ "$DRIVER" = local ] && echo 1 || echo 2), and every check passed"
echo "  Its privacy assessment is drafted: the console's project $SLUG, Records — *Where it flows*."
