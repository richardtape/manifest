#!/usr/bin/env bash
# Task 1, Step 1 — the control plane on the REAL App, driven through its API one phase at a time.
# Rich's yes and the network: the launch path plan's first message (2026-09-29). Every call goes to
# the platform (https://console.manifest.internal); GitHub's own answer is read separately by
# t1-github-read.ts. Prints ids, codes and shas; never a cookie, a token or a key.
#
#   bash t1-real-github.sh <phase> [args]      phases: signin, mismatch, create <slug> <name> [starter],
#                                              reads <slug>, commit <slug>, build <slug>, deploy <slug> <kind>,
#                                              stepup, delete <slug>, events <slug>
# State (cookie jars, ids) lives in $T1_STATE, a scratch directory — never in the repository.
set -euo pipefail
cd "$(dirname "$0")/../../../../.."
: "${T1_STATE:?set T1_STATE to a scratch directory}"
mkdir -p "$T1_STATE"
CA="$PWD/infra/ca/manifest-root.crt"
ZONE=manifest.internal   # idp_login reads it
ORIGIN=https://console.manifest.internal
CP_JAR="$T1_STATE/cp.jar"; IDP_JAR="$T1_STATE/idp.jar"
# shellcheck source=../../../../../scripts/lib/api.sh
. scripts/lib/api.sh
# shellcheck source=../../../../../infra/lib/idp-login.sh
. infra/lib/idp-login.sh
fail() { printf 'FAIL %s\n' "$*" >&2; exit 1; }
t() { date +%s; }

project_id() { api GET /v1/projects | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const p=(j.projects??j.items??j).find(x=>x.slug===process.argv[1]);if(!p)process.exit(1);console.log(p.id)})' "$1"; }
code_of() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);console.log(j.error?`${j.error.code}: ${j.error.message}`:"ok")}catch{console.log("not json: "+s.slice(0,200))}})'; }

phase="${1:?phase}"; shift || true
case "$phase" in
  signin)
    idp_login "$CP_JAR" "$IDP_JAR" "$ORIGIN/auth/login" instructor instructor "$ORIGIN/auth/saml/callback" "$CA"
    echo "signed in as $(api GET /v1/me | field displayName) (role $(api GET /v1/me | field role))" ;;
  stepup)
    idp_login "$CP_JAR" "$IDP_JAR" "$ORIGIN/auth/step-up" instructor instructor "$ORIGIN/auth/saml/callback" "$CA"
    echo "stepped up" ;;
  mismatch)
    # the faculty front-end's two driver-1 projects, read as the administrator-free instructor if a member
    for slug in my-weekly-thoughts notes-and-answers; do
      id="$(project_id "$slug" || true)"
      if [ -z "$id" ]; then echo "$slug: not visible to instructor"; continue; fi
      printf '%s tree: ' "$slug"; curl -sS -b "$CP_JAR" -w ' [%{http_code}]' "$API/v1/projects/$id/tree" | head -c 400; echo
    done ;;
  create)
    slug="$1" name="$2" starter="${3:-}"
    body="{\"slug\":\"$slug\",\"name\":$(json "$name"),\"blueprint\":\"node-ts-mongo@1\"${starter:+,\"starter\":\"$starter\"},\"audience\":{\"scale\":\"solo\",\"burst\":\"steady\",\"justification\":\"The launch path plan's Task 1: the first run on real GitHub\"}}"
    s=$(t); out="$(api POST /v1/projects "$body")"; e=$(t)
    echo "createProject $slug: $((e - s)) s"
    printf '%s' "$out" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);if(j.error){console.log("REFUSED",j.error.code,j.error.message);process.exit(1)}console.log(JSON.stringify({id:j.id,slug:j.slug,name:j.name,repository:j.repository},null,1))})' ;;
  reads)
    id="$(project_id "$1")"
    s=$(t); tree="$(api GET "/v1/projects/$id/tree")"; e=$(t); echo "getTree: $((e - s)) s — $(printf '%s' "$tree" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.error?j.error.code:`commit ${j.commitSha} ${j.entries.length} entries`)})')"
    s=$(t); f="$(api GET "/v1/projects/$id/file?path=manifest.yaml")"; e=$(t); echo "getFile manifest.yaml: $((e - s)) s — $(printf '%s' "$f" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.error?j.error.code:`${j.content.length} chars at ${j.commitSha}`)})')"
    s=$(t); c="$(api GET "/v1/projects/$id/commits")"; e=$(t); echo "listCommits: $((e - s)) s — $(printf '%s' "$c" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);if(j.error){console.log(j.error.code);return}const l=j.commits;console.log(l.length+" commits: "+l.map(x=>x.commitSha.slice(0,7)+" "+JSON.stringify(x.subject)+" by "+x.authorName+" madeThrough="+JSON.stringify(x.madeThrough)).join(" | "))})')" ;;
  commit)
    id="$(project_id "$1")"
    head="$(api GET "/v1/projects/$id/commits" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.commits[0].commitSha)})')"
    body="{\"baseCommit\":\"$head\",\"message\":\"docs: made through Manifest, on real GitHub\",\"changes\":[{\"op\":\"write\",\"path\":\"docs/made-by-manifest.md\",\"content\":\"Made through Manifest, on real GitHub, 2026-09-29 — the launch path plan's Task 1.\\n\"}]}"
    s=$(t); out="$(api POST "/v1/projects/$id/commits" "$body")"; e=$(t)
    echo "createCommit: $((e - s)) s — $(printf '%s' "$out" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.error?`REFUSED ${j.error.code}: ${j.error.message}`:`sha ${j.sha ?? j.commit?.sha} spec ${JSON.stringify(j.spec?.valid ?? j.validation?.valid)}`)})')" ;;
  build)
    id="$(project_id "$1")"
    s=$(t); b="$(api POST "/v1/projects/$id/builds" '{}')"; bid="$(printf '%s' "$b" | field id)" || { printf '%s' "$b" | code_of; exit 1; }
    echo "startBuild: $bid (commit $(printf '%s' "$b" | field commitSha))"
    for _ in $(seq 1 120); do st="$(api GET "/v1/builds/$bid" | field status)"; case "$st" in succeeded|failed) break ;; esac; sleep 3; done
    e=$(t); echo "build $st in $((e - s)) s"
    [ "$st" = succeeded ] || { api GET "/v1/builds/$bid" | head -c 800; echo; exit 1; }
    r="$(api POST "/v1/projects/$id/releases" "{\"buildId\":\"$bid\"}")"; echo "release $(printf '%s' "$r" | field id)"; printf '%s' "$r" | field id > "$T1_STATE/$1.release" ;;
  deploy)
    id="$(project_id "$1")"; kind="$2"; rel="$(cat "$T1_STATE/$1.release")"
    env_id="$(api GET "/v1/projects/$id/environments" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const l=j.environments??j.items??j;console.log(l.find(x=>x.kind===process.argv[1]).id)})' "$kind")"
    s=$(t); out="$(api POST "/v1/environments/$env_id/deploy" "{\"releaseId\":\"$rel\"}")"; e=$(t)
    echo "deploy $kind: $((e - s)) s — $(printf '%s' "$out" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.error?`REFUSED ${j.error.code}: ${j.error.message}`:`instance ${j.id} ${j.state}`)})')"
    host="$1.$kind.manifest.internal"; echo "GET https://$host/ → $(curl -sS -o /dev/null -w '%{http_code}' --cacert "$CA" "https://$host/") ; body head: $(curl -sS --cacert "$CA" "https://$host/" | head -c 160 | tr '\n' ' ')" ;;
  delete)
    id="$(project_id "$1")"
    s=$(t); out="$(api DELETE "/v1/projects/$id")"; e=$(t)
    echo "deleteProject $1: $((e - s)) s — $(printf '%s' "$out" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);console.log(j.error?`REFUSED ${j.error.code}: ${j.error.message}`:`state ${j.state}`)}catch{console.log(s.slice(0,200))}})')"
    echo "mirror: $([ -d ".manifest/repos/$1.git" ] && echo PRESENT || echo gone)" ;;
  events)
    id="$(project_id "$1")"
    # the replay's event types, read over one short-lived stream (the session's), then closed
    NODE_EXTRA_CA_CERTS="$CA" node -e '
      const [url, cookie] = process.argv.slice(1)
      const ws = new WebSocket(url, { headers: { cookie, origin: "https://console.manifest.internal" } })
      const types = []
      ws.onmessage = (m) => { const f = JSON.parse(m.data); if (f.type === "ready") { console.log(types.join("\n")); ws.close() } else types.push(`${f.type}  ${f.humanMessage ?? ""}`.slice(0, 200)) }
      ws.onerror = (e) => { console.error("stream error", e.message); process.exit(1) }
      setTimeout(() => { console.log(types.join("\n")); process.exit(0) }, 8000)
    ' "wss://console.manifest.internal/v1/projects/$id/events" "manifest_session=$(awk '$6=="manifest_session"{print $7}' "$CP_JAR")" ;;
  *) fail "unknown phase $phase" ;;
esac
