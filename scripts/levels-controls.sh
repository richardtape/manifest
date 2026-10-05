#!/usr/bin/env bash
# THE U1 ACCEPTANCE'S NEGATIVE CONTROLS (the U1 plan's Task 7, Step 3) — each breaks ONE thing (an edit to the control
# plane's source, or a setting), restarts the control plane on 7100 on that tree, runs `make demo-levels`, and says
# whether it went red EXACTLY where predicted — every FAIL line named, no other. Restore-safe: a trap puts every edited
# file back with `git checkout --` and restarts 7100 from .env, as found, on ANY exit, Ctrl-C included.
#
#   bash scripts/levels-controls.sh <control> [local|fake]   # one control
#   bash scripts/levels-controls.sh all [local|fake]         # every control in turn, one restore at the end
#   LEVELS_CONTROLS_DRY=1 bash scripts/levels-controls.sh all  # each edit applied, its diff shown, restored — no restart
#
# THE DRIVER (default `local`) is the one 7100 is restarted on, and restored to: `local` is driver 1 (.env's driver-2
# block unset), `fake` the GitHub fake (.env's real-App block must already be commented — the demo refuses real GitHub).
#
# Each control: what it breaks, and its prediction. "green" means the demo passes WHOLE, and the record says why that is
# the design rather than a control that cannot fail.
#   a          S9's condition narrowed back to very-high (rank >= very-high, which is Task 1's toLevel(…) === 'very-high')
#              → step 5's token on staging answers 200: ONE red.
#   b          BOTH of S6's paths removed — the schema's transform AND getSpec's specInLevels → step 3's getSpec answers
#              'internal': ONE red.
#   b-transform   the transform alone → green: getSpec's specInLevels answers the level for the stored alias.
#   b-getspec     specInLevels alone → green: the transform stored the level, so there is nothing to answer.
#   b2         sensitiveViewOfSpec's levelName removed → green: the transform stored `medium` for `internal`, so the
#              diff compares medium with medium.
#   b2-transform  b2 AND the transform removed → step 3's rename lists data.classification ('internal' stored beside
#              'medium'): ONE red.
#   c          E14's old hint (a BC public body; no U1) → step 1's three hint checks: THREE reds.
#   d          staysOnPremise back to `=== 'confidential'` → step 6's on-premise line: ONE red (the catalogue is
#              canonical, so default-chat-onprem is `very-high`, which the string no longer matches).
#   e          MANIFEST_AGENT_BUILDER_MODELS=on-premise (a setting, no edit) → step 4's very-high project's capable half:
#              ONE red; its high project's half stays green (by rank, D17) and step 5 stays green (S9: the builder
#              setting no longer decides the tails).
#   f          CLASSIFICATION_RANK.confidential = 2 AND the transform removed → step 2's confidential +
#              [default-chat-large] dry run answered VALID: ONE red.
#   f-rank     the rank edit alone → green: the transform stores `confidential` as `very-high` before anything ranks it,
#              and the catalogue and the floors canonicalize too (Task 1's unit control (a) sees it alone).
#
# THE CAPABLE MODEL must be listed at `high` for d's, e's and f's predictions (and for b's step 3 models): the demo's
# step 0 says which, and a control whose half reads NOT RUN is reported as such, never as red.
#
# Never `set -x` this script: it starts the control plane from .env.
set -u
cd "$(dirname "$0")/.." || exit 1
ROOT="$PWD"
WHAT="${1:-}"
DRIVER="${2:-local}"
CONTROLS="a b b-transform b-getspec b2 b2-transform c d e f f-rank"
case " $CONTROLS all " in *" $WHAT "*) ;; *) echo "usage: levels-controls.sh <$(echo $CONTROLS | tr ' ' '|')|all> [local|fake]" >&2; exit 2 ;; esac
case "$DRIVER" in local | fake) ;; *) echo "the driver is local or fake — not '$DRIVER'" >&2; exit 2 ;; esac
OUT="$(mktemp -d -t levels-controls)"
chmod 700 "$OUT"
SUMMARY="$OUT/summary.txt"
say() { printf '%s\n' "$*" | tee -a "$SUMMARY"; }
echo "logs and the summary: $OUT"

# A Vitest run in THIS repository truncates the control plane's tables mid-control.
for pid in $(pgrep -f vitest || true); do
  if [ "$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')" = "$ROOT" ]; then
    echo "a Vitest run is in progress in this repository (pid $pid) — wait for it" >&2; exit 1
  fi
done

CP=packages/control-plane/src
SCHEMA="$CP/spec/schema.ts"
READS="$CP/api/routes/project-reads.ts"
RELEASES="$CP/api/routes/releases.ts"
DIFF="$CP/spec/diff.ts"
POLICY="$CP/spec/policy.ts"
ASSESSMENT="$CP/launch/assessment.ts"

# Every file a control may edit must be exactly as committed before it is touched — `git checkout --` restores from the
# index, so an uncommitted change would be lost with the control.
for f in "$SCHEMA" "$READS" "$RELEASES" "$DIFF" "$POLICY" "$ASSESSMENT"; do
  git diff --quiet HEAD -- "$f" || { echo "$f has uncommitted changes — commit them first; a control restores from git" >&2; exit 1; }
done

EDITED=""
restore_files() {
  if [ -n "$EDITED" ]; then
    # shellcheck disable=SC2086
    git checkout -- $EDITED
    EDITED=""
  fi
}

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

# start_cp <label> [NAME=VALUE …] — RUNBOOK's "Running the control plane" on $DRIVER, each NAME=VALUE applied AFTER .env,
# built from the working tree (`dev` is `tsc` then `node dist/index.js`). Returns 1 when there is no ready line in 180 s.
start_cp() {
  local label="$1" log="$OUT/cp-$1.log"
  shift
  stop_cp || { say "7100 did not stop"; return 1; }
  (
    set -a; . ./.env; set +a
    unset MANIFEST_GITHUB_API_URL MANIFEST_GITHUB_APP_ID MANIFEST_GITHUB_APP_KEY MANIFEST_GITHUB_GIT_URL \
      MANIFEST_GITHUB_INSTALLATION_ID MANIFEST_GITHUB_ORG MANIFEST_GITHUB_WEBHOOK_SECRET
    if [ "$DRIVER" = fake ]; then export MANIFEST_SOURCE_DRIVER=github; else unset MANIFEST_SOURCE_DRIVER; fi
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
      say "  7100 up ($DRIVER, $label): $(grep '"msg":"control plane ready"' "$log" | tail -1 | node -e '
        let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
          const j = JSON.parse(s); console.log(JSON.stringify({ source: j.source, capableModel: j.capableModel,
            capableClassification: j.capableClassification, builderModels: j.builderModels })) })')"
      return 0
    fi
    if grep -q 'error TS' "$log" 2>/dev/null; then
      say "  7100 did not BUILD on the edited tree — the edit is not a type-correct control:"
      grep 'error TS' "$log" | head -5 | sed 's/^/    /' | tee -a "$SUMMARY"
      return 1
    fi
    sleep 1
  done
  say "  7100 printed no ready line in 180 s — $log"
  return 1
}

CHANGED=""
restore() {
  restore_files
  if [ -n "$CHANGED" ]; then
    say "RESTORING: every edited file from git, and 7100 from .env, on $DRIVER"
    git diff --quiet HEAD -- "$SCHEMA" "$READS" "$RELEASES" "$DIFF" "$POLICY" "$ASSESSMENT" \
      && say "  the source is as committed (git diff: nothing)" || say "  RESTORE INCOMPLETE — git diff shows a change"
    start_cp restore || say "RESTORE FAILED — start 7100 by hand (RUNBOOK, Running the control plane)"
  fi
  echo "logs and the summary: $OUT"
}
trap restore EXIT

# edit <file> <old> <new> — replaces exactly ONE occurrence, or refuses (a control that matched nothing reads as
# "cannot fail": ORIENTATION §4, trap 11).
edit() {
  python3 - "$1" "$2" "$3" <<'EOF' || return 1
import sys
path, old, new = sys.argv[1], sys.argv[2], sys.argv[3]
text = open(path).read()
n = text.count(old)
if n != 1:
    sys.exit(f"{path}: the control's text occurs {n} times, not once — the source moved; nothing was edited")
open(path, "w").write(text.replace(old, new))
EOF
  case " $EDITED " in *" $1 "*) ;; *) EDITED="$EDITED $1" ;; esac
}

TRANSFORM_OLD="          .transform((name): Classification => toLevel(name))
"
no_transform() { edit "$SCHEMA" "$TRANSFORM_OLD" ""; }
no_getspec() { edit "$READS" "spec: specInLevels(latest.parsed)," "spec: latest.parsed as Record<string, unknown>,"; }

# same_reds <demo log> <predicted check names, one per line> — 0 when the log's FAIL lines are exactly the predicted
# checks: as many lines as names, and each name the WHOLE of one line's check. A check's name may itself hold " — ", so
# a line is `FAIL <name>` or `FAIL <name> — <detail>`, matched by prefix — never by cutting at the first " — ", which
# mislabelled four correct reds in this script's first run (the U1 plan's sitting 3).
same_reds() {
  PREDICTED="$2" python3 - "$1" <<'PY'
import os, sys
fails = [l[len('  FAIL '):].rstrip('\n') for l in open(sys.argv[1], encoding='utf-8') if l.startswith('  FAIL ')]
names = [n for n in os.environ['PREDICTED'].split('\n') if n]
def is_line_of(line, name):
    return line == name or line.startswith(name + ' — ')
ok = (len(fails) == len(names)
      and all(sum(is_line_of(l, n) for l in fails) == 1 for n in names)
      and all(any(is_line_of(l, n) for n in names) for l in fails))
sys.exit(0 if ok else 1)
PY
}

# run_control <name> <predicted FAIL lines, one per line; empty = green> [NAME=VALUE …] — the edits are already made.
run_control() {
  local name="$1" predicted="$2" log="$OUT/demo-$1.log" rc actual
  shift 2
  say ""
  say "=== control ($name)"
  if [ -n "$EDITED" ]; then
    # shellcheck disable=SC2086
    git diff --stat -- $EDITED | sed 's/^/  /' | tee -a "$SUMMARY"
  fi
  [ "$#" -gt 0 ] && say "  setting: $*"
  if [ -n "${LEVELS_CONTROLS_DRY:-}" ]; then
    # The edit proven to apply, and nothing restarted (ORIENTATION §4, trap 11: read the diff).
    # shellcheck disable=SC2086
    [ -z "$EDITED" ] || git diff -U0 -- $EDITED | grep -E '^[-+][^-+]' | cut -c1-200 | sed 's/^/    /' | tee -a "$SUMMARY"
    say "  RESULT ($name): DRY — the edit applied; nothing restarted"
    restore_files
    return
  fi
  CHANGED=1
  if ! start_cp "$name" "$@"; then
    say "  RESULT ($name): VOID — the control plane did not start on the control"
    restore_files
    return
  fi
  bash scripts/demo-levels.sh > "$log" 2>&1
  rc=$?
  actual="$(grep -cE '^  FAIL ' "$log")"
  grep -E '^  (FAIL|NOT RUN) ' "$log" | cut -c1-260 | sed 's/^/    /' | tee -a "$SUMMARY"
  if [ -z "$predicted" ]; then
    if [ "$rc" = 0 ] && [ "$actual" = 0 ]; then
      say "  RESULT ($name): GREEN, as predicted (exit 0) — $log"
    else
      say "  RESULT ($name): NOT AS PREDICTED — predicted green, exit $rc — $log"
    fi
  else
    if [ "$rc" != 0 ] && same_reds "$log" "$predicted"; then
      say "  RESULT ($name): RED EXACTLY AS PREDICTED (exit $rc; $actual FAIL) — $log"
    else
      say "  RESULT ($name): NOT AS PREDICTED (exit $rc) — predicted:"
      printf '%s\n' "$predicted" | sed 's/^/      /' | tee -a "$SUMMARY"
      say "    — $log"
    fi
  fi
  restore_files
}

control_a() {
  edit "$RELEASES" "CLASSIFICATION_RANK[await environmentFloor(deps.db, environment)] >=
          CLASSIFICATION_RANK.high" "CLASSIFICATION_RANK[await environmentFloor(deps.db, environment)] >=
          CLASSIFICATION_RANK['very-high']" || return
  run_control a "the token on staging: 403 INCIDENT_LOG_CONFIDENTIAL"
}
control_b() {
  no_transform || return
  no_getspec || return
  run_control b "getSpec answers data.classification medium — the level, not the alias"
}
control_b_transform() { no_transform || return; run_control b-transform ""; }
control_b_getspec() { no_getspec || return; run_control b-getspec ""; }
control_b2() {
  edit "$DIFF" "classification: levelName(spec.data.classification)," "classification: spec.data.classification," || return
  run_control b2 ""
}
control_b2_transform() {
  edit "$DIFF" "classification: levelName(spec.data.classification)," "classification: spec.data.classification," || return
  no_transform || return
  run_control b2-transform "medium, the same level by its name: its sensitive diff does NOT list data.classification"
}
control_c() {
  edit "$POLICY" "          \`\"\${model}\" is approved for \${levelName(entry.maxClassification)} data at most, and this app declares \` +
          \`\${declared}. Choose a model approved for \${declared} data, or lower data.classification if it overstates \` +
          'the app’s data: the levels are UBC’s own (Information Security Standard U1). Which models may receive each ' +
          'level is the platform’s catalogue to say, and whether an app may use them, the Privacy Office’s.'," \
    "          \`\"\${model}\" is approved up to \${entry.maxClassification} data and this app declares \` +
          \`\${spec.data.classification}. Choose an on-premise model, or lower data.classification \` +
          'if it is overstated. A BC public body may not send personal information to a model running outside Canada.'," || return
  run_control c 'its hint: "approved for medium data at most"
and "(Information Security Standard U1)"
and not "BC public body" — a level states no law (E14)'
}
control_d() {
  edit "$ASSESSMENT" "const staysOnPremise = (ceiling: Classification) => toLevel(ceiling) === 'very-high'" \
    "const staysOnPremise = (ceiling: Classification) => ceiling === 'confidential'" || return
  run_control d 'default-chat-onprem: "Approved for very high data: it runs on on-premise hardware, so what the app sends it stays there."'
}
control_e() {
  run_control e "and default-chat-large — above its level (high), so ONLY by the builder exception (S4/S10)" \
    MANIFEST_AGENT_BUILDER_MODELS=on-premise
}
control_f() {
  edit "$SCHEMA" "  confidential: 3,
}" "  confidential: 2,
}" || return
  no_transform || return
  run_control f "confidential with [default-chat-large] — the capable model at high — is refused too"
}
control_f_rank() {
  edit "$SCHEMA" "  confidential: 3,
}" "  confidential: 2,
}" || return
  run_control f-rank ""
}

run_one() {
  case "$1" in
    a) control_a ;; b) control_b ;; b-transform) control_b_transform ;; b-getspec) control_b_getspec ;;
    b2) control_b2 ;; b2-transform) control_b2_transform ;; c) control_c ;; d) control_d ;; e) control_e ;;
    f) control_f ;; f-rank) control_f_rank ;;
  esac
  # A control whose edit refused leaves nothing edited; say so rather than nothing.
  restore_files
}

if [ "$WHAT" = all ]; then
  for c in $CONTROLS; do run_one "$c"; done
else
  run_one "$WHAT"
fi
say ""
say "=== summary"
grep -E 'RESULT \(' "$SUMMARY" | sed 's/^ *//'
