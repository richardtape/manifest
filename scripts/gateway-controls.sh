#!/usr/bin/env bash
# THE UBC AI GATEWAY ACCEPTANCE'S NEGATIVE CONTROLS (the plan's Task 6, Step 3) — each restarts the control plane on 7100
# with ONE setting changed, runs `make demo-gateway` (or reads LiteLLM's catalogue), says whether it went red where
# predicted, and RESTORES: a trap restarts 7100 from .env, as found, on ANY exit, Ctrl-C included.
#
#   bash scripts/gateway-controls.sh start [local|fake|real]   # restart 7100 from .env on that driver — nothing changed
#   bash scripts/gateway-controls.sh a|b|b2|d|e [local|fake|real]
#   bash scripts/gateway-controls.sh all [local|fake|real]       # a, b, b2, d and e in turn
#
# THE DRIVER (default `local`) is the one 7100 is restarted on, and restored to: `local` is driver 1 (.env's driver-2
# block unset), `fake` the GitHub fake, `real` .env as it is. `make demo-gateway` refuses real GitHub, so the controls
# that run it need `local` or `fake`.
#
#   (a) MANIFEST_UBC_AI_GATEWAY_URL=http://127.0.0.1:9/v1 — nothing listens there, so LiteLLM's capable model fails and
#       its on-premise fallback answers. Predicted: step 2's "answered by the gateway" checks go red
#       (x-litellm-attempted-fallbacks 1, the body's model qwen3.8:27b). It stands in for the network being off.
#   (b) UBC_AI_GATEWAY_API_KEY empty for the control plane — the fail-closed boot (Decision 4). Predicted: the ready line's
#       capableModel and each gatewayModels entry `refused`, NO deployment at the gateway's address in /model/info, and the
#       demo NOT RUN (exit 2). Restored, the boot registers them again and the demo's step 0 passes.
#   (b2) the POSITIVE control for (b): the capable model registered DIRECT first (MANIFEST_CAPABLE_MODEL=openai/gpt-6-luna,
#       which reaches OpenAI with LiteLLM's OPENAI_API_KEY — registered only, never called), then the gateway setting with
#       the key empty. Predicted: default-chat-large STAYS, direct (no api_base).
#   (d) MANIFEST_GATEWAY_MODELS empty — every gateway model removed at boot. Predicted: /model/info holds no
#       manifest-gateway- entry, and the demo goes red at step 1 (.env still names them).
#   (e) UBC_AI_GATEWAY_KEY_EXPIRES moved, in a SCRATCH copy of .env (MANIFEST_ENV_FILE; no restart): yesterday —
#       predicted: the demo's step 0 FAILS naming the date, and `make doctor` WARNS "EXPIRED"; one day later than
#       Rich's reading — predicted to PASS: no machine can tell, because the key cannot read its own /key/info (F10).
#
# THE KEY IS NEVER PRINTED: it is read from .env inside the control plane's start subshell only, (b) and (b2) set it
# EMPTY there, and (e)'s copy is written 0600 under a mktemp directory and removed with it. Every log and the summary
# go to $OUT (printed at the start). Never `set -x` this script.
set -u
cd "$(dirname "$0")/.." || exit 1
ROOT="$PWD"
WHAT="${1:-}"
DRIVER="${2:-local}"
case "$WHAT" in start | a | b | b2 | d | e | all) ;; *) echo "usage: gateway-controls.sh <start|a|b|b2|d|e|all> [local|fake|real]" >&2; exit 2 ;; esac
case "$DRIVER" in local | fake | real) ;; *) echo "the driver is local, fake or real — not '$DRIVER'" >&2; exit 2 ;; esac
OUT="$(mktemp -d -t gateway-controls)"
chmod 700 "$OUT"
SUMMARY="$OUT/summary.txt"
say() { printf '%s\n' "$*" | tee -a "$SUMMARY"; }
echo "logs and the summary: $OUT"

# A Vitest run in THIS repository truncates the control plane's tables mid-control; the faculty front-end's own
# (~/Developer/manifest-app, mock mode) touches nothing here and is left to run.
for pid in $(pgrep -f vitest || true); do
  if [ "$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')" = "$ROOT" ]; then
    echo "a Vitest run is in progress in this repository (pid $pid) — wait for it" >&2; exit 1
  fi
done

stop_cp() {
  local pid
  pid="$(lsof -nP -iTCP:7100 -sTCP:LISTEN -t 2>/dev/null | head -1)"
  [ -n "$pid" ] || return 0
  kill "$pid" 2>/dev/null
  for _ in $(seq 1 60); do
    lsof -nP -iTCP:7100 -sTCP:LISTEN -t >/dev/null 2>&1 || return 0
    sleep 1
  done
  return 1
}

# start_cp <label> [NAME=VALUE …] — RUNBOOK's "Running the control plane" on $DRIVER, each NAME=VALUE applied AFTER .env.
# Prints the ready line; returns 1 when there is none within 180 s.
start_cp() {
  local label="$1" log="$OUT/cp-$1.log"
  shift
  # Whether 7100 now runs with a setting changed — what the EXIT trap restores.
  if [ "$#" -gt 0 ]; then CHANGED=1; else CHANGED=""; fi
  stop_cp || { say "7100 did not stop"; return 1; }
  (
    set -a; . ./.env; set +a
    if [ "$DRIVER" = fake ]; then
      unset MANIFEST_GITHUB_API_URL MANIFEST_GITHUB_APP_ID MANIFEST_GITHUB_APP_KEY MANIFEST_GITHUB_GIT_URL \
        MANIFEST_GITHUB_INSTALLATION_ID MANIFEST_GITHUB_ORG MANIFEST_GITHUB_WEBHOOK_SECRET
      export MANIFEST_SOURCE_DRIVER=github
    fi
    if [ "$DRIVER" = local ]; then
      unset MANIFEST_SOURCE_DRIVER MANIFEST_GITHUB_API_URL MANIFEST_GITHUB_APP_ID MANIFEST_GITHUB_APP_KEY \
        MANIFEST_GITHUB_GIT_URL MANIFEST_GITHUB_INSTALLATION_ID MANIFEST_GITHUB_ORG MANIFEST_GITHUB_WEBHOOK_SECRET
    fi
    for setting in "$@"; do export "$setting"; done
    export MANIFEST_DATABASE_URL="postgres://manifest_app:${MANIFEST_APP_PASSWORD}@127.0.0.1:7103/manifest_control"
    export MANIFEST_ADMIN_DATABASE_URL="postgres://manifest:${POSTGRES_PASSWORD}@127.0.0.1:7103/manifest_control"
    export MANIFEST_IDP_DATABASE_URL="postgres://manifest:${POSTGRES_PASSWORD}@127.0.0.1:7103/manifest_idp"
    export MANIFEST_SESSION_SECRET="$(openssl rand -hex 32)"
    export MANIFEST_BLUEPRINTS_ROOT="$PWD/blueprints"
    export MANIFEST_REPOS_ROOT="$PWD/.manifest/repos"
    export MANIFEST_LITELLM_MASTER_KEY="${LITELLM_MASTER_KEY}"
    export NODE_EXTRA_CA_CERTS="$PWD/infra/ca/manifest-root.crt"
    pnpm --filter @manifest/control-plane db:migrate > "$log.migrate" 2>&1 || { echo "db:migrate failed — $log.migrate" >&2; exit 1; }
    nohup pnpm --filter @manifest/control-plane dev > "$log" 2>&1 &
  ) || return 1
  for _ in $(seq 1 180); do
    if grep -q '"msg":"control plane ready"' "$log" 2>/dev/null; then
      READY="$(grep '"msg":"control plane ready"' "$log" | tail -1)"
      say "  7100 up ($DRIVER, $label): $(printf '%s' "$READY" | node -e '
        let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
          const j = JSON.parse(s); console.log(JSON.stringify({ source: j.source, capableModel: j.capableModel,
            capableFallback: j.capableFallback, gatewayModels: j.gatewayModels, secretsScrubbed: j.secretsScrubbed })) })')"
      grep '\[boot\]' "$log" | cut -c1-300 | sed 's/^/    /' | tee -a "$SUMMARY"
      return 0
    fi
    sleep 1
  done
  say "  7100 printed no ready line in 180 s — $log"
  return 1
}

# The as-found control plane, on any exit — when a control left a setting changed.
CHANGED=""
restore() {
  if [ -n "$CHANGED" ]; then
    say "RESTORING: 7100 from .env, on $DRIVER"
    start_cp restore || say "RESTORE FAILED — start 7100 by hand (RUNBOOK, Running the control plane)"
  fi
  echo "logs and the summary: $OUT"
}

# LiteLLM's catalogue, by name: each deployment's model_name, model and api_base (no key is ever listed).
catalogue() {
  ( set -a; . ./.env; set +a
    printf 'header = "Authorization: Bearer %s"\n' "$LITELLM_MASTER_KEY" |
      curl -sS -K - -m 30 "http://127.0.0.1:7106/model/info" ) |
    node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const m of JSON.parse(s).data??[])
      console.log(`${m.model_name}\t${m.litellm_params?.model}\t${m.litellm_params?.api_base ?? "(no api_base)"}\t${m.model_info?.id}`)})'
}

# demo <label> [NAME=VALUE …] — make demo-gateway's script, with those settings in ITS environment. Prints its exit.
demo() {
  local label="$1" log="$OUT/demo-$1.log" rc
  shift
  env "$@" bash scripts/demo-gateway.sh > "$log" 2>&1
  rc=$?
  say "  demo-gateway ($label) exited $rc — $log"
  grep -E '^  (FAIL|ok  ) |NOT RUN|every check passed|FAILED' "$log" | grep -E 'FAIL|NOT RUN|FAILED' | cut -c1-240 | sed 's/^/    /' | tee -a "$SUMMARY"
  DEMO_RC=$rc
  DEMO_LOG="$log"
}

predicted() { # $1 = what, $2 = 0 when it held
  if [ "$2" = 0 ]; then say "  PREDICTED, AND SEEN: $1"; else say "  NOT AS PREDICTED: $1"; fi
}

control_a() {
  say "(a) the gateway's address black-holed — http://127.0.0.1:9/v1"
  start_cp a MANIFEST_UBC_AI_GATEWAY_URL=http://127.0.0.1:9/v1 || return 1
  demo a MANIFEST_UBC_AI_GATEWAY_URL=http://127.0.0.1:9/v1 DEMO_GATEWAY_STOP_AFTER=2
  grep -q 'FAIL default-chat-large, not streamed: x-litellm-attempted-fallbacks is 0' "$DEMO_LOG" &&
    grep -q 'FAIL default-chat-large, not streamed: the body’s model is not the on-premise one' "$DEMO_LOG" &&
    [ "$DEMO_RC" = 1 ]
  predicted "step 2 red at 'attempted-fallbacks is 0' and 'not the on-premise one' — the fallback answered" $?
}

control_b() {
  say "(b) the control plane started with UBC_AI_GATEWAY_API_KEY empty — the fail-closed boot"
  start_cp b UBC_AI_GATEWAY_API_KEY= || return 1
  printf '%s' "$READY" | grep -q '"capableModel":"refused"' &&
    printf '%s' "$READY" | grep -q '"name":"ubc-qwen-27b","state":"refused"'
  predicted "the ready line's capableModel and its gatewayModels entry read refused" $?
  catalogue > "$OUT/catalogue-b.tsv"
  ! grep -q 'ai-gateway' "$OUT/catalogue-b.tsv"
  predicted "/model/info holds NO deployment at the gateway's address" $?
  demo b DEMO_GATEWAY_STOP_AFTER=1
  [ "$DEMO_RC" = 2 ] && grep -q 'NOT RUN' "$DEMO_LOG"
  predicted "the demo: NOT RUN, exit 2" $?
  say "  restored:"
  start_cp b-restored || return 1
  demo b-restored DEMO_GATEWAY_STOP_AFTER=1
  [ "$DEMO_RC" = 0 ]
  predicted "restored: the next boot registers them again, and the demo's steps 0–1 pass" $?
}

control_b2() {
  say "(b2) the POSITIVE control for (b): a DIRECT capable model first, then the gateway setting with no key"
  start_cp b2-direct MANIFEST_CAPABLE_MODEL=openai/gpt-6-luna || return 1
  catalogue > "$OUT/catalogue-b2-direct.tsv"
  grep -q $'^default-chat-large\topenai/gpt-6-luna\t(no api_base)' "$OUT/catalogue-b2-direct.tsv"
  predicted "registered DIRECT: default-chat-large is openai/gpt-6-luna with no api_base" $?
  start_cp b2-keyless UBC_AI_GATEWAY_API_KEY= || return 1
  catalogue > "$OUT/catalogue-b2-keyless.tsv"
  grep -q $'^default-chat-large\topenai/gpt-6-luna\t(no api_base)' "$OUT/catalogue-b2-keyless.tsv" &&
    ! grep -q 'ai-gateway' "$OUT/catalogue-b2-keyless.tsv"
  predicted "the keyless gateway boot KEEPS the direct one, and nothing at the gateway's address" $?
}

control_d() {
  say "(d) MANIFEST_GATEWAY_MODELS empty — every gateway model removed at boot"
  start_cp d MANIFEST_GATEWAY_MODELS= || return 1
  catalogue > "$OUT/catalogue-d.tsv"
  ! grep -q 'manifest-gateway-' "$OUT/catalogue-d.tsv"
  predicted "/model/info holds no manifest-gateway- entry" $?
  demo d DEMO_GATEWAY_STOP_AFTER=1
  [ "$DEMO_RC" = 1 ] && grep -q 'FAIL ubc-qwen-27b: exactly one deployment' "$DEMO_LOG"
  predicted "the demo red at step 1: ubc-qwen-27b is not in the catalogue .env names it in" $?
}

control_e() {
  say "(e) the key's expiry moved, in a scratch copy of .env (no restart)"
  local copy="$OUT/env-e" yesterday later
  yesterday="$(date -v-1d +%Y-%m-%d)"
  later="$(sed -n 's/^UBC_AI_GATEWAY_KEY_EXPIRES=//p' .env | tail -1)"
  later="$(date -j -v+1d -f %Y-%m-%d "$later" +%Y-%m-%d 2>/dev/null || echo '')"
  ( umask 077; grep -v '^UBC_AI_GATEWAY_KEY_EXPIRES=' .env > "$copy"; echo "UBC_AI_GATEWAY_KEY_EXPIRES=$yesterday" >> "$copy" )
  demo e-expired MANIFEST_ENV_FILE="$copy" DEMO_GATEWAY_STOP_AFTER=0
  [ "$DEMO_RC" = 1 ] && grep -q "FAIL the key's expiry.*EXPIRED on $yesterday" "$DEMO_LOG"
  predicted "yesterday ($yesterday): the demo's step 0 FAILS naming the date" $?
  MANIFEST_ENV_FILE="$copy" make doctor > "$OUT/doctor-e.log" 2>&1
  grep -q "EXPIRED on $yesterday" "$OUT/doctor-e.log"
  predicted "and make doctor against the copy WARNS that it EXPIRED on $yesterday" $?
  ( umask 077; grep -v '^UBC_AI_GATEWAY_KEY_EXPIRES=' .env > "$copy"; echo "UBC_AI_GATEWAY_KEY_EXPIRES=$later" >> "$copy" )
  demo e-later MANIFEST_ENV_FILE="$copy" DEMO_GATEWAY_STOP_AFTER=0
  [ "$DEMO_RC" = 0 ]
  predicted "one day later than Rich's reading ($later): step 0 PASSES — no machine can tell; it is Rich's, by eye" $?
  rm -f "$copy"
}

case "$WHAT" in
  start)
    start_cp start || exit 1
    exit 0
    ;;
esac
trap restore EXIT
trap 'exit 130' INT TERM
case "$WHAT" in
  a) control_a ;;
  b) control_b ;;
  b2) control_b2 ;;
  d) control_d ;;
  e) control_e ;;
  all) control_a; control_b; control_b2; control_d; control_e ;;
esac
say "DONE — $SUMMARY"
