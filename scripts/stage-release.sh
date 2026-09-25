#!/usr/bin/env bash
# scripts/stage-release.sh <code|egress> — the clicked half's staging (the D5 plan's Task 15, Step 5; sitting 7's F12):
# a commit to launch-app's bare repository (driver 1), validated, built, released and deployed to STAGING as the
# instructor, by the demos' own route. `code` is a self-serve candidate (F15's row); `egress` adds one host to
# egress.allow — a sensitive change that re-escalates (F9, F11–F14's rows). Do `code` first: staging a
# re-escalation replaces the candidate. NEEDS `launch-app` LAUNCHED on DRIVER 1 — run `make demo-releases`
# first (it leaves leg C approved in staging) — and the control plane running. Written by the D5 plan's sitting
# 8 because sittings 7 and 8 both needed it for a clicked half and it lived in a scratchpad that died.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
. infra/lib/common.sh
. infra/lib/idp-login.sh
. scripts/lib/api.sh
WORK="$(mktemp -d -t manifest-stage)"
trap 'rm -rf "$WORK"' EXIT
CP_JAR="$WORK/i.jar"
IDP_JAR="$WORK/i-idp.jar"
idp_login "$CP_JAR" "$IDP_JAR" "$ORIGIN/auth/login" instructor instructor "$ORIGIN/auth/saml/callback" "$ROOT/$CA_FILE" >/dev/null
git clone -q .manifest/repos/launch-app.git "$WORK/src"
G="-c user.name=manifest -c user.email=manifest@localhost -c commit.gpgsign=false"
STAMP="$(date +%s)"
case "${1:-}" in
  code)
    printf '\n// a clicked half (%s): a code-only change.\n' "$STAMP" >> "$WORK/src/server.js"
    MSG="the clicked half ($STAMP): code only" ;;
  egress)
    HOST="click-$STAMP.example.org"
    grep -q '^  allow: \[.*\]$' "$WORK/src/manifest.yaml" || { echo "no egress.allow line"; exit 1; }
    sed -i '' -e "s/^  allow: \[\(.*\)\]\$/  allow: [\1, $HOST]/" "$WORK/src/manifest.yaml"
    grep -q "$HOST" "$WORK/src/manifest.yaml" || { echo "egress.allow not rewritten"; exit 1; }
    MSG="the clicked half ($STAMP): egress.allow + $HOST" ;;
  *) echo "usage: stage-release.sh <code|egress>"; exit 2 ;;
esac
# shellcheck disable=SC2086
git -C "$WORK/src" $G commit -qam "$MSG"
git -C "$WORK/src" push -q origin HEAD:main
SHA="$(git -C "$WORK/src" rev-parse HEAD)"
PROJECT_ID="$(api GET /v1/projects | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).find(p=>p.slug==="launch-app").id))')"
api POST "/v1/projects/$PROJECT_ID/spec" "{\"commitSha\":\"$SHA\"}" | field valid
BUILD="$(api POST "/v1/projects/$PROJECT_ID/builds" "{\"commitSha\":\"$SHA\"}" | field id)"
wait_for_build "$BUILD" | field status
RELEASE="$(api POST "/v1/projects/$PROJECT_ID/releases" "{\"buildId\":\"$BUILD\",\"summary\":\"$MSG\"}" | field id)"
STAGING="$(environment staging)"
api POST "/v1/environments/$STAGING/deploy" "{\"releaseId\":\"$RELEASE\"}" | field state
echo "staged: commit $SHA, build $BUILD, release $RELEASE — $MSG"
