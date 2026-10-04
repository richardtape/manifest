#!/usr/bin/env bash
# THE UBC AI GATEWAY PLAN'S ACCEPTANCE (its Task 6): the capable model and the gateway's own models ANSWERED BY UBC'S
# AI GATEWAY through an agent's key, every call charged to the person who asked — and the gateway's key nowhere but
# LiteLLM's environment.
#
#   make demo-gateway                                   # the network on, the key in .env, the control plane up
#   DEMO_GATEWAY_STOP_AFTER=2 make demo-gateway         # stop after step 2
#   MANIFEST_ENV_FILE=<copy of .env> make demo-gateway  # read a scratch copy of .env (the plan's control (e))
#
# IT NEEDS THE NETWORK AND THE KEY, so it is in no offline or CI step (the plan's Decision 10). EVERY CALL IS ON RICH'S
# 30 USD KEY: one run makes five calls through Manifest's LiteLLM and a few direct reads of the gateway's spend, each a
# fraction of a cent. On a control plane whose catalogue does not name the gateway it prints NOT RUN and exits 2.
#
# DRIVER 1 OR THE GITHUB FAKE, NEVER REAL GITHUB: the demo makes two projects, and on real GitHub each would be a real
# private repository nobody asked for (`make demo-faculty-ready`'s rule). It touches no source otherwise.
#
# THE SPLIT, as every headless demo's (P5a Decision 38): signing in is the IdP's business (infra/lib/idp-login.sh);
# LiteLLM's catalogue (its master key), the gateway's own spend (its key) and the key counts are bash's; everything a
# CLIENT does is packages/journey/src/gateway.ts, through @manifest/contract and an agent's key alone.
#
#   0  configured? the catalogue names the gateway; the key LiteLLM holds is .env's; its expiry   bash
#   1  the catalogue: the capable model and each gateway model at the gateway; the stand-ins local bash
#   2  an internal project's session: the capable model answered BY THE GATEWAY, charged exactly  gateway.ts internal
#   3  (the Responses API — not run: the plan's Task 5 was dropped at its sitting 1)
#   4  a confidential project's session: the gateway's own model, plain and streamed, at the pin  gateway.ts confidential
#      …then step 2's last check: the GATEWAY's own spend rose by what Manifest charged             bash
#   5  the key: 0 times in every log and in LiteLLM's database; every gateway row decrypts to
#      the reference                                                                               bash
#   6  both sessions ended                                                                         gateway.ts ended
#
# THE KEY IS NEVER PRINTED AND NEVER ON A COMMAND LINE (the plan's Global Constraints): it is read from the env file
# into a SUBSHELL only, sent to curl on its stdin (`-K -`), counted by perl from the environment, and compared by
# fingerprint (scripts/lib/gateway.sh). Never `set -x` this script.
#
# macOS ships bash 3.2 and a BSD userland: no associative arrays, no `mapfile`, no `xargs -r`, no `readlink -f`.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
# shellcheck source=../infra/lib/common.sh
. infra/lib/common.sh
# shellcheck source=../infra/lib/idp-login.sh
. infra/lib/idp-login.sh
# shellcheck source=./lib/api.sh
. scripts/lib/api.sh
# shellcheck source=./lib/gateway.sh
. scripts/lib/gateway.sh

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

CA="$ROOT/$CA_FILE"
FAKE="${MANIFEST_FAKE_URL:-http://127.0.0.1:7110}"
ENV_FILE="${MANIFEST_ENV_FILE:-.env}"
[ -r "$ENV_FILE" ] || fail "$ENV_FILE cannot be read"
WORK="$(mktemp -d -t manifest-gateway)"
trap 'rm -rf "$WORK"' EXIT
# Everything this run prints, as it prints it — step 5 counts the key in it.
exec > >(tee "$WORK/run.out") 2>&1
CP_JAR="$WORK/instructor.jar"
IDP_JAR="$WORK/instructor-idp.jar"
STATE="$WORK/state.json"
RUN_ID="g$(date +%s)"
STOP_AFTER="${DEMO_GATEWAY_STOP_AFTER:-}"
case "$STOP_AFTER" in
  '' | [0-6]) ;;
  *) fail "DEMO_GATEWAY_STOP_AFTER is '$STOP_AFTER' — a step, 0 to 6" ;;
esac

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
holds() { if "$@"; then echo 0; else echo 1; fi; }
step_done() { # $1 = the step
  if [ -n "$FAILED" ]; then
    printf '\n\033[31mstep %s FAILED:%s\033[0m\n' "$1" "$FAILED" >&2
    exit 1
  fi
  echo "  every check passed"
  if [ "$STOP_AFTER" = "$1" ]; then
    say "Stopped after step $1, as DEMO_GATEWAY_STOP_AFTER asked"
    exit 0
  fi
}

session_of() { awk -F'\t' 'NF==7 && $6=="__Host-manifest_session" {print $7}' "$1"; }

build() {
  local out
  if ! out="$(pnpm --filter "$1" build 2>&1)"; then
    printf '%s\n' "$out" >&2
    fail "$1 does not build — tsc's errors are above."
  fi
}

run_phase() {
  env NODE_EXTRA_CA_CERTS="$CA" MANIFEST_ORIGIN="$ORIGIN" MANIFEST_STOP_AFTER="$STOP_AFTER" \
    MANIFEST_SESSION="${SESSION:-}" MANIFEST_DRIVER="$DRIVER" MANIFEST_RUN_ID="$RUN_ID" \
    MANIFEST_INTERNAL_SLUG="$INTERNAL_SLUG" MANIFEST_CONFIDENTIAL_SLUG="$CONFIDENTIAL_SLUG" \
    node packages/journey/dist/gateway.js "$1" "$STATE"
}

state_field() { node -e 'const v=require(process.argv[1])[process.argv[2]];if(v===undefined){process.exit(1)}console.log(v)' "$STATE" "$1"; }

stopped() {
  if state_field stopped >/dev/null 2>&1; then
    say "Stopped after step $STOP_AFTER, as DEMO_GATEWAY_STOP_AFTER asked"
    exit 0
  fi
}

# A setting the env file holds that is NOT a secret, read in a subshell. Empty when unset.
env_value() { ( set +u; unset "$1"; set -a; . "$ENV_FILE"; set +a; eval "printf '%s' \"\${$1:-}\"" ); }

# LiteLLM's admin API with its master key (read from the env file into a subshell, sent on curl's stdin). $1 = path,
# $2 = the file the answer is written to. Prints the status.
litellm_admin_get() {
  ( set +u; set -a; . "$ENV_FILE"; set +a
    printf 'header = "Authorization: Bearer %s"\n' "$LITELLM_MASTER_KEY" |
      curl -sS -K - -m 30 -o "$2" -w '%{http_code}' "http://127.0.0.1:$PORT_LITELLM$1" 2>/dev/null ) || true
}

# THE GATEWAY'S OWN SPEND FOR ITS KEY (the plan's I8), read from its own answer: the key cannot read its /key/info
# (`403`, sitting 1's F10), and Manifest's LiteLLM now strips the forwarded copy of the header from every caller
# (F5, sitting 2's F26) — so it is ONE direct call (hop 2) on a model the gateway does not price, `qwen3.8-27b` ($0,
# sitting 1's `[M2]`), whose `x-litellm-key-spend` is the key's spend. Prints the spend, or `unread <why>`.
gateway_spend() {
  ( set +u; unset UBC_AI_GATEWAY_API_KEY; set -a; . "$ENV_FILE"; set +a
    [ -n "${UBC_AI_GATEWAY_API_KEY:-}" ] || { echo "unread (no key in $ENV_FILE)"; exit 0; }
    code=$(printf 'header = "Authorization: Bearer %s"\n' "$UBC_AI_GATEWAY_API_KEY" |
      curl -sS -K - -m 60 -o /dev/null -D "$WORK/spend.h" -w '%{http_code}' -H 'content-type: application/json' \
        --data '{"model":"qwen3.8-27b","messages":[{"role":"user","content":"ok"}],"max_tokens":1}' \
        "$GATEWAY_DIRECT/chat/completions" 2>/dev/null) || code=000
    [ "$code" = 200 ] || { echo "unread (the gateway answered $code)"; exit 0; }
    cost=$(tr -d '\r' < "$WORK/spend.h" | sed -n 's/^[Xx]-[Ll]ite[Ll][Ll][Mm]-[Rr]esponse-[Cc]ost: //p' | head -1)
    case "$cost" in 0 | 0.0 | '') ;; *) echo "unread (the read itself cost $cost — the model is priced now)"; exit 0 ;; esac
    spend=$(tr -d '\r' < "$WORK/spend.h" | sed -n 's/^[Xx]-[Ll]ite[Ll][Ll][Mm]-[Kk]ey-[Ss]pend: //p' | head -1)
    [ -n "$spend" ] || { echo "unread (no x-litellm-key-spend on the answer)"; exit 0; }
    echo "$spend" )
}

# The gateway's key, counted in stdin: "<the value's count> <the fragment's count>" — the fragment is the form a
# LiteLLM 401 or budget refusal echoes, `sk-...<last 4>` (sitting 1's [M5](d) and (e)). Never printed.
key_count() {
  ( set +u; unset UBC_AI_GATEWAY_API_KEY; set -a; . "$ENV_FILE"; set +a
    [ -n "${UBC_AI_GATEWAY_API_KEY:-}" ] || { echo "no-key no-key"; exit 0; }
    perl -ne 'BEGIN { $k = $ENV{UBC_AI_GATEWAY_API_KEY}; $f = "sk-..." . substr($k, -4) }
      $n += () = /\Q$k\E/g; $m += () = /\Q$f\E/g; END { print $n+0, " ", $m+0, "\n" }' )
}

cp_log() {
  local pid file
  pid="$(lsof -nP -iTCP:"${PORT_CONTROL_PLANE:-7100}" -sTCP:LISTEN -t 2>/dev/null | head -1)"
  [ -n "$pid" ] || return 0
  file="$(lsof -a -p "$pid" -d 2 -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)"
  if [ -n "$file" ] && [ -f "$file" ] && [ -r "$file" ]; then echo "$file"; fi
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
    # The FAKE, never real GitHub: two projects would be two real repositories.
    require_fake_github
    [ "$(curl -sS -m 2 "$FAKE/_fake/health" 2>/dev/null)" = ok ] \
      || fail "the control plane runs driver 2 and the GitHub fake does not answer at $FAKE — make github-up"
    ;;
  *) fail "source_driver answered '$DRIVER'" ;;
esac
INTERNAL_SLUG="gateway-int-$DRIVER"
CONFIDENTIAL_SLUG="gateway-conf-$DRIVER"
echo "  driver $([ "$DRIVER" = local ] && echo 1 || echo 2) ($DRIVER) — the projects are $INTERNAL_SLUG and $CONFIDENTIAL_SLUG"

# WHERE THE GATEWAY IS. The catalogue is checked against the address the control plane was STARTED with — this
# shell's MANIFEST_UBC_AI_GATEWAY_URL when it has one (a control's), else the env file's, else config.ts's default —
# while the gateway's own spend is always read at the env file's (the real gateway, whose key it is).
ENV_GW="$(env_value MANIFEST_UBC_AI_GATEWAY_URL)"
GATEWAY_DIRECT="${ENV_GW:-https://ai-gateway.apps.ltic.ubc.ca/v1}"
GATEWAY_URL="${MANIFEST_UBC_AI_GATEWAY_URL:-$GATEWAY_DIRECT}"

say "0. Is the gateway configured? LiteLLM's catalogue, read with its master key"
CODE="$(litellm_admin_get /model/info "$WORK/model-info.json")"
[ "$CODE" = 200 ] || fail "LiteLLM's /model/info answered $CODE on 127.0.0.1:$PORT_LITELLM — make up"
CAPABLE_BASE="$(node -e '
  const j = require(process.argv[1]); const m = (j.data ?? []).find((d) => d.model_name === "default-chat-large")
  console.log(m?.litellm_params?.api_base ?? "")' "$WORK/model-info.json")"
if [ "${CAPABLE_BASE%/}" != "${GATEWAY_URL%/}" ]; then
  say "NOT RUN — the gateway is not configured (RUNBOOK, UBC's AI Gateway)"
  echo "  default-chat-large is at '${CAPABLE_BASE:-(no such model)}', not $GATEWAY_URL"
  exit 2
fi
echo "  default-chat-large is at $GATEWAY_URL"
VERDICT="$(MANIFEST_ENV_FILE="$ENV_FILE" litellm_gateway_key_matches)" && R=0 || R=1
check "the key LiteLLM holds is $ENV_FILE's — by fingerprint: $VERDICT" "$(holds [ "$R" = 0 ] && [ "$VERDICT" = matches ])" "$VERDICT"
EXPIRY="$(MANIFEST_ENV_FILE="$ENV_FILE" gateway_key_expiry)" && R=0 || R=1
# The date is Rich's reading of the gateway's admin UI (the key cannot read its own /key/info — F10): this checks it
# is a date, not past and not within doctor's fourteen days. That it is the RIGHT date is Rich's, at step 4, by eye.
check "the key's expiry, from $ENV_FILE: $EXPIRY" "$(holds [ "$R" = 0 ])" "$EXPIRY"
SPEND_BEFORE="$(gateway_spend)"
check "the gateway's own spend for its key, read from its answer: \$$SPEND_BEFORE" \
  "$(holds node -e 'process.exit(Number.isFinite(Number(process.argv[1])) ? 0 : 1)' "$SPEND_BEFORE")" "$SPEND_BEFORE"
step_done 0

say "1. The catalogue: the capable model and the gateway's own at the gateway; the stand-ins on the laptop"
GATEWAY_MODELS="$(env_value MANIFEST_GATEWAY_MODELS)"
CAPABLE_LEVEL="$(env_value MANIFEST_CAPABLE_MODEL_CLASSIFICATION)"
node -e '
  const [file, statePath, gatewayUrl, setting, capableLevel] = process.argv.slice(1)
  // LEVELS COMPARED AS LEVELS (the U1 plan, I5): an earlier name is its U1 level, so a row stored at `internal` is the
  // `medium` asked for. The journey imports no control-plane code, so the map is its own.
  const LEVEL = { public: "low", internal: "medium", confidential: "very-high" }
  const canon = (v) => LEVEL[v] ?? v
  const fs = require("node:fs")
  const data = require(file).data ?? []
  const strip = (u) => (u ?? "").replace(/\/+$/, "")
  let failed = 0
  const ok = (name, passed, detail = "") => {
    console.log(`  ${passed ? "ok  " : "FAIL"} ${name}${passed || !detail ? "" : ` — ${detail}`}`)
    if (!passed) failed += 1
  }
  const named = (n) => data.filter((d) => d.model_name === n)
  const prices = {}
  const priceOf = (d) => ({
    input: d.model_info?.input_cost_per_token ?? d.litellm_params?.input_cost_per_token,
    output: d.model_info?.output_cost_per_token ?? d.litellm_params?.output_cost_per_token,
    cacheRead: d.model_info?.cache_read_input_token_cost ?? null,
  })
  const atGateway = (d, model, cls) => {
    const p = d.litellm_params ?? {}
    ok(`${d.model_name}: ${p.model} at the gateway (${p.api_base}), ${d.model_info?.max_classification}`,
      strip(p.api_base) === strip(gatewayUrl) && p.model === `openai/${model}` && canon(d.model_info?.max_classification) === canon(cls),
      JSON.stringify({ model: p.model, api_base: p.api_base, cls: d.model_info?.max_classification }))
    ok(`${d.model_name}: no api_key listed, timeout ${p.timeout} s, ${p.num_retries} retries`,
      !("api_key" in p) && p.timeout === 60 && p.num_retries === 0)
    const price = priceOf(d)
    ok(`${d.model_name}: priced ($${price.input} / $${price.output} a token) — never offered at $0`,
      price.input > 0 && price.output > 0, JSON.stringify(price))
    prices[d.model_name] = price
  }
  const capable = named("default-chat-large")
  ok("default-chat-large: exactly one deployment", capable.length === 1, String(capable.length))
  // The level MANIFEST_CAPABLE_MODEL_CLASSIFICATION names, `medium` unset — what the control plane registered it at.
  if (capable[0]) atGateway(capable[0], (capable[0].litellm_params?.model ?? "").replace(/^openai\//, ""), canon(capableLevel || "medium"))
  const entries = setting.split(",").map((e) => e.trim()).filter(Boolean).map((e) => {
    const m = /^([^=]+)=ubc-ai-gateway\/(.+)@([a-z-]+)$/.exec(e)
    return m ? { name: m[1], model: m[2], classification: m[3] } : { name: e, model: "", classification: "" }
  })
  ok(`MANIFEST_GATEWAY_MODELS names at least one model (${entries.map((e) => e.name).join(", ") || "none"})`, entries.length > 0)
  for (const e of entries) {
    const found = named(e.name)
    ok(`${e.name}: exactly one deployment, its id manifest-gateway-…`,
      found.length === 1 && String(found[0]?.model_info?.id ?? "").startsWith("manifest-gateway-"),
      JSON.stringify(found.map((d) => d.model_info?.id)))
    if (found[0]) atGateway(found[0], e.model, e.classification)
  }
  const stale = data.filter((d) => String(d.model_info?.id ?? "").startsWith("manifest-gateway-") && !entries.some((e) => e.name === d.model_name))
  ok("no gateway registration the setting does not name", stale.length === 0, stale.map((d) => d.model_name).join(", "))
  for (const n of ["default-chat", "default-chat-onprem"]) {
    const found = named(n)
    ok(`${n}: on the laptop’s Ollama (http://host.docker.internal:11434)`,
      found.length > 0 && found.every((d) => d.litellm_params?.api_base === "http://host.docker.internal:11434"),
      JSON.stringify(found.map((d) => d.litellm_params?.api_base)))
    if (found[0]) prices[n] = priceOf(found[0])
  }
  const prior = (() => { try { return JSON.parse(fs.readFileSync(statePath, "utf8")) } catch { return {} } })()
  fs.writeFileSync(statePath, JSON.stringify({ ...prior, gatewayUrl, prices,
    gatewayModels: entries.map(({ name, classification }) => ({ name, classification })) }, null, 2) + "\n", { mode: 0o600 })
  process.exit(failed ? 1 : 0)
' "$WORK/model-info.json" "$STATE" "$GATEWAY_URL" "$GATEWAY_MODELS" "$CAPABLE_LEVEL" || FAILED="$FAILED
  the catalogue (above)"
step_done 1

say "2. The instructor signs in with CWL"
idp_login "$CP_JAR" "$IDP_JAR" "$ORIGIN/auth/login" instructor instructor \
  "$ORIGIN/auth/saml/callback" "$CA"
SESSION="$(session_of "$CP_JAR")"
[ -n "$SESSION" ] || fail "the sign-in left no __Host-manifest_session cookie"
# A slug's repository, if a `pnpm test` or `make reset` left it without its project.
clear_orphan_repository "$INTERNAL_SLUG"
clear_orphan_repository "$CONFIDENTIAL_SLUG"
run_phase prepare
run_phase internal
stopped
echo "  (step 3, the Responses API with a tool, is not run: the plan's Task 5 was dropped — the capable model"
echo "   takes a tool on chat completions through both hops, sitting 1's [M4].8)"
run_phase confidential
stopped

say "2. (cont.) The gateway's own spend rose by what Manifest charged for the calls the gateway prices"
CHARGED="$(state_field chargedGatewayUsd)" || fail "phase 2 recorded no charge"
PINNED="$(state_field chargedPinnedUsd)" || fail "phase 4 recorded no charge"
echo "  Manifest charged \$$CHARGED for the capable model's calls (the gateway prices them) and \$$PINNED for the"
echo "  gateway's own model at the stand-in's pin (the gateway charges \$0 for it — sitting 1's [M2])"
# LiteLLM writes a key's spend in batches: polled up to 120 s, every 10 s, each read a $0 call.
SPEND_AFTER="$SPEND_BEFORE"
for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
  sleep 10
  SPEND_AFTER="$(gateway_spend)"
  node -e 'const [b, a, c] = process.argv.slice(1).map(Number); process.exit(a - b >= c * (1 - 1e-6) ? 0 : 1)' \
    "$SPEND_BEFORE" "$SPEND_AFTER" "$CHARGED" 2>/dev/null && break
done
RATIO="$(node -e '
  const [b, a, c] = process.argv.slice(1).map(Number); const rise = a - b
  console.log(Number.isFinite(rise) && rise > 0 ? (c / rise).toFixed(9) : "none")' "$SPEND_BEFORE" "$SPEND_AFTER" "$CHARGED")"
echo "  the gateway's spend: \$$SPEND_BEFORE before, \$$SPEND_AFTER after"
# [M3].6 measured the ratio 1.0 to the digit (hop 1 charges what the gateway reports), so the band is a millionth.
# Manifest charging LESS than the gateway is the failure that matters: a person's budget that binds late.
check "Manifest's charge ÷ the gateway's rise is 1 (within a millionth): $RATIO" \
  "$(holds node -e 'const r = Number(process.argv[1]); process.exit(Number.isFinite(r) && Math.abs(r - 1) <= 1e-6 ? 0 : 1)' "$RATIO")" \
  "Manifest \$$CHARGED, the gateway \$$SPEND_BEFORE → \$$SPEND_AFTER"
step_done 4

say "5. The key: 0 times in every log and in LiteLLM's database, and every gateway row stores only the reference"
CP_LOG="$(cp_log)"
for SOURCE in "docker logs manifest-litellm" "the control plane's log" "this run's own output" "LiteLLM's database"; do
  case "$SOURCE" in
    "docker logs manifest-litellm") COUNTS="$(docker logs manifest-litellm 2>&1 | key_count)" ;;
    "the control plane's log")
      if [ -n "$CP_LOG" ]; then COUNTS="$(key_count < "$CP_LOG")"; else COUNTS="no-log no-log"; fi ;;
    "this run's own output") COUNTS="$(key_count < "$WORK/run.out")" ;;
    "LiteLLM's database")
      COUNTS="$(docker exec manifest-postgres pg_dump -U manifest -d litellm --data-only 2>/dev/null | key_count)" ;;
  esac
  check "$SOURCE: the key's value 0 times, its sk-...<last 4> fragment 0 times (${COUNTS% *}, ${COUNTS#* })" \
    "$(holds [ "$COUNTS" = "0 0" ])" "$COUNTS$([ "$SOURCE" = "the control plane's log" ] && [ -z "$CP_LOG" ] && echo ' — 7100s stderr is not a file here')"
done
SCRIPT="$(cat scripts/lib/litellm-decrypt-verdict.py)"
NAMES="default-chat-large $(node -e 'console.log((require(process.argv[1]).gatewayModels ?? []).map((m) => m.name).join(" "))' "$STATE")"
ROWS=0
WANT=0
for NAME in $NAMES; do
  WANT=$((WANT + 1))
  docker exec manifest-postgres psql -U manifest -d litellm -At \
    -c "select litellm_params from \"LiteLLM_ProxyModelTable\" where model_name = '$NAME'" > "$WORK/rows" 2>/dev/null || : > "$WORK/rows"
  while IFS= read -r ROW; do
    [ -n "$ROW" ] || continue
    ROWS=$((ROWS + 1))
    VERDICT="$(printf '%s\n' "$ROW" | docker exec -i manifest-litellm python3 -c "$SCRIPT" os.environ/UBC_AI_GATEWAY_API_KEY 2>&1 | head -1)"
    check "$NAME's stored api_key, decrypted inside manifest-litellm: $VERDICT" "$(holds [ "$VERDICT" = "equals the reference" ])" "$VERDICT"
  done < "$WORK/rows"
done
check "every gateway deployment has its stored row ($ROWS of $WANT: $NAMES)" "$(holds [ "$ROWS" = "$WANT" ])" "$ROWS"
step_done 5

run_phase ended
say "Every check passed. Rich: the gateway's admin UI shows the key's spend at \$$SPEND_AFTER (it read \$$SPEND_BEFORE"
echo "before this run), and its expiry as the date above — $EXPIRY"
