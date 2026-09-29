#!/usr/bin/env bash
# Task 1, Step 7 — the launch records as they are today, on lp-real-a: what the owner can and cannot write, and
# whether a DRAFT registration an administrator records gates a SANDBOX build (Read this first 7). Then, as the
# positive control, the registration carried to `active` with every attribute the app asks for, and a build again.
# Makes `operator` an administrator exactly as scripts/demo-production.sh does. Prints codes, states and reasons.
set -euo pipefail
cd "$(dirname "$0")/../../../../.."
: "${T1_STATE:?}"; : "${PROJECT_ID:?}"
CA="$PWD/infra/ca/manifest-root.crt"; ZONE=manifest.internal; ORIGIN=https://console.manifest.internal
. scripts/lib/api.sh; . infra/lib/idp-login.sh
fail() { printf 'FAIL %s\n' "$*" >&2; exit 1; }
brief() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let j;try{j=JSON.parse(s)}catch{console.log("not json: "+s.slice(0,200));return}console.log(j.error?`${j.error.code}: ${j.error.message.slice(0,220)}`:JSON.stringify(j).slice(0,300))})'; }
ENTITY="https://manifest.internal/sp/lp-real-a/production"
ACS="https://lp-real-a.manifest.internal/auth/saml/callback"; SLO="https://lp-real-a.manifest.internal/auth/logout"

CP_JAR="$T1_STATE/cp.jar"
echo '== (a) the owner reads'
echo "launch-records: $(api GET /v1/projects/$PROJECT_ID/launch-records | brief)"
api GET /v1/projects/$PROJECT_ID/launch-readiness | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log("ready="+j.ready);for(const i of j.items)console.log(`  ${i.id} [${i.state}${i.blocking?"":" non-blocking"}] owner="${i.owner}" why="${i.why.slice(0,160)}"`)})'
echo '== (b) the owner records a registration'
echo "recordIamRegistration as owner: $(api POST /v1/projects/$PROJECT_ID/launch-records/iam-registration "{\"entityId\":\"$ENTITY\",\"acsUrl\":\"$ACS\",\"sloUrl\":\"$SLO\",\"registeredAttributes\":[\"ubcEduCwlPuid\"],\"state\":\"draft\"}" | brief)"

echo '== (c) an administrator records a DRAFT listing ubcEduCwlPuid alone; the owner builds'
OP_JAR="$T1_STATE/op.jar"; OP_IDP_JAR="$T1_STATE/op-idp.jar"; rm -f "$OP_JAR" "$OP_IDP_JAR"
idp_login "$OP_JAR" "$OP_IDP_JAR" "$ORIGIN/auth/login" operator operator "$ORIGIN/auth/saml/callback" "$CA"
bash scripts/admin-grant.sh grant opr000001 "The launch path plan's Task 1 records a registration on a probe project (§13)"
rm -f "$OP_JAR" "$OP_IDP_JAR"
idp_login "$OP_JAR" "$OP_IDP_JAR" "$ORIGIN/auth/login" operator operator "$ORIGIN/auth/saml/callback" "$CA"
as_admin() { CP_JAR="$OP_JAR" api "$@"; }
echo "operator: $(as_admin GET /v1/me | field role)"
echo "recordIamRegistration draft as admin: $(as_admin POST /v1/projects/$PROJECT_ID/launch-records/iam-registration "{\"entityId\":\"$ENTITY\",\"acsUrl\":\"$ACS\",\"sloUrl\":\"$SLO\",\"registeredAttributes\":[\"ubcEduCwlPuid\"],\"state\":\"draft\"}" | brief)"
build() {
  local b bid st
  b="$(api POST "/v1/projects/$PROJECT_ID/builds" '{}')"
  bid="$(printf '%s' "$b" | field id)" || { printf 'startBuild: %s\n' "$(printf '%s' "$b" | brief)"; return 0; }
  for _ in $(seq 1 100); do st="$(api GET "/v1/builds/$bid" | field status)"; case "$st" in succeeded|failed) break ;; esac; sleep 3; done
  echo "build $bid: $st"
  [ "$st" = failed ] && api GET "/v1/builds/$bid/logs" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const l=(j.lines??j.items??[]).map(x=>x.text??x.line??JSON.stringify(x));console.log("  last log lines:\n    "+l.slice(-4).join("\n    ").slice(0,700))})' || true
}
build
echo '== (d) the positive control: submitted, then active with every attribute the app asks for; build again'
echo "record submitted: $(as_admin POST /v1/projects/$PROJECT_ID/launch-records/iam-registration "{\"entityId\":\"$ENTITY\",\"acsUrl\":\"$ACS\",\"sloUrl\":\"$SLO\",\"registeredAttributes\":[\"ubcEduCwlPuid\"],\"state\":\"submitted\",\"externalTicketRef\":\"PROBE-T1\"}" | brief)"
echo "record active: $(as_admin POST /v1/projects/$PROJECT_ID/launch-records/iam-registration "{\"entityId\":\"$ENTITY\",\"acsUrl\":\"$ACS\",\"sloUrl\":\"$SLO\",\"registeredAttributes\":[\"ubcEduCwlPuid\",\"mail\",\"eduPersonAffiliation\",\"givenName\",\"sn\"],\"state\":\"active\",\"externalTicketRef\":\"PROBE-T1\"}" | brief)"
build
