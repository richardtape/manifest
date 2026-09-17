#!/usr/bin/env bash
# P3's demo: an app this platform did not write, from a bare repository to a
# healthy https://…manifest.internal URL — offline after `make seed`.
#
# It is a THIN WRAPPER on purpose. The logic under test lives in
# `packages/control-plane/src/runtime/docker/roundtrip.docker.test.ts`; if the demo
# reimplemented any of it the two would drift into proving different things, which
# is how a demo ends up green against a platform that does not work.
#
# macOS ships bash 3.2 and a BSD userland: no associative arrays, no `mapfile`,
# no `xargs -r`, no `readlink -f`.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
# shellcheck source=../infra/lib/common.sh
. infra/lib/common.sh
# THE three-hop CWL login, shared with `scripts/demo-identity.sh`. It used to be
# written out here; a second copy of the walk is how two scripts drift into
# proving different things.
# shellcheck source=../infra/lib/idp-login.sh
. infra/lib/idp-login.sh
# key, api, field, json and environment — THE one copy, shared with every other demo
# (P5a Task 2). It sets API. The caller sets CP_JAR, below.
# shellcheck source=lib/api.sh
. scripts/lib/api.sh

SLUG="${DEMO_SLUG:-fixture-app}"
JAR="$(mktemp -t manifest-demo-jar)"
CP_JAR="$JAR"
trap 'rm -f "$JAR"' EXIT

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

say "0. Is the control plane up, through the edge?"
# The ANSWER, not that an answer arrived: through the edge a stopped control plane is
# Caddy's empty 502, and a source the console refuses is a 403 with a body of its own —
# `curl -o /dev/null` passed both (P5a Task 3).
UP="$(curl -sS -m 5 -w ' [%{http_code}]' "$API/v1/me" 2>&1 || true)"
case "$UP" in
  *'"UNAUTHENTICATED"'*) echo "  $API answered" ;;
  *) fail "no control plane behind $API (got: ${UP:0:120}).
README's 'Running the control plane' has the exact commands — and check the boot line
says {\"driver\":\"docker\"} and \"origin\":\"$ORIGIN\", because every claim this demo
makes is meaningless against the fake driver or another origin." ;;
esac

say "1. Log in with CWL, against the Manifest IdP"
# THE REAL THING. `POST /auth/dev-login` used to be here — an unauthenticated
# endpoint that minted a session for a named test user with no credential at all.
# It is gone (§9: Manifest is its own SP), and so is the shim's setting.
#
# The three hops live in `infra/lib/idp-login.sh`, which explains each one.
IDP_JAR="$(mktemp -t manifest-demo-idp-jar)"
trap 'rm -f "$JAR" "$IDP_JAR"' EXIT
CA="$ROOT/$CA_FILE"

idp_login "$JAR" "$IDP_JAR" "$ORIGIN/auth/login" instructor instructor \
  "$ORIGIN/auth/saml/callback" "$CA"

# The SHAPE of the answer, not that a request succeeded: a session cookie that
# authenticates nobody would carry this demo three steps further before failing.
WHO="$(api GET /v1/me | field puid)"
[ "$WHO" = ins000001 ] || fail "logged in as '$WHO', expected ins000001"
echo "  session for $WHO (a real CWL login, not a shim)"

say "2. Create the project — three environments and a provisioned bare repository"
clear_orphan_repository "$SLUG"
# §24's audience is asked at creation, and required (P5a Task 11).
PROJECT="$(api POST /v1/projects "{\"slug\":\"$SLUG\",\"blueprint\":\"fixture-node@1\",\"audience\":{\"scale\":\"solo\",\"burst\":\"steady\"}}")"
PROJECT_ID="$(printf '%s' "$PROJECT" | field id 2>/dev/null || true)"
if [ -z "$PROJECT_ID" ]; then
  # Already created by an earlier run: find it rather than failing. The slug is
  # unique, so this is the same project, not a guess.
  PROJECT_ID="$(api GET /v1/projects | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const p=JSON.parse(s).find(x=>x.slug===process.argv[1]);if(!p){console.error(s);process.exit(1)}console.log(p.id)})' "$SLUG")"
  echo "  reusing project $PROJECT_ID"
else
  echo "  project $PROJECT_ID"
fi
# The bare repository the control plane provisioned. `GET /v1/projects/:id` does not
# return it (only the creation response does), so it is derived the way D5's local
# driver does — the one piece of driver-specific knowledge this script has, and it
# is here rather than in the control plane for exactly that reason.
BARE="${MANIFEST_REPOS_ROOT:-$ROOT/.manifest/repos}/$SLUG.git"
[ -d "$BARE" ] || fail "no bare repository at $BARE — is MANIFEST_REPOS_ROOT the
same value the control plane was started with?"

say "3. Push the fixture app into that repository"
# What an agent does in §1's journey: commit the app AND the manifest that
# declares what it needs. `fixtures/fixture-app` carries no Dockerfile and no
# .npmrc — D13 makes both the blueprint's, and `assembleContext` writes them over
# anything the app committed.
WORK="$(mktemp -d -t manifest-demo-src)"
# Replaces the trap above, so it must re-list EVERY file already registered —
# $IDP_JAR included. A trap that drops one leaks a temp file per demo run, which
# is the litter CLAUDE.md's non-negotiable is about.
trap 'rm -f "$JAR" "$IDP_JAR"; rm -rf "$WORK"' EXIT
git clone -q "$BARE" "$WORK"
cp fixtures/fixture-app/package.json fixtures/fixture-app/package-lock.json \
   fixtures/fixture-app/server.js "$WORK/"
rm -f "$WORK/src/index.js"
cat > "$WORK/manifest.yaml" <<YAML
manifest: 1
name: $SLUG
blueprint: fixture-node@1
description: P3's build target — a health endpoint and one route that writes to Mongo.
runtime:
  port: 8080
  health: /healthz
services:
  - name: db
    type: mongo
    version: "7"
YAML
git -C "$WORK" add -A
git -C "$WORK" \
  -c user.name=manifest -c user.email=manifest@localhost \
  commit -q -m 'feat: the fixture app and the manifest that declares its database' \
  --allow-empty
git -C "$WORK" push -q origin HEAD:main
COMMIT="$(git -C "$WORK" rev-parse HEAD)"
echo "  pushed $COMMIT"

say "4. Validate manifest.yaml at that commit (§22 step 3)"
SPEC="$(api POST "/v1/projects/$PROJECT_ID/spec" "{\"commitSha\":\"$COMMIT\"}")"
[ "$(printf '%s' "$SPEC" | field valid)" = true ] \
  || fail "manifest.yaml is not valid: $SPEC"
echo "  valid; sensitive diff: $(printf '%s' "$SPEC" | field sensitiveDiff)"

say "5. Build — blueprint Dockerfile, egress-free builder, mirror, scan, digest"
BUILD="$(api POST "/v1/projects/$PROJECT_ID/builds" "{\"commitSha\":\"$COMMIT\"}")"
BUILD_ID="$(printf '%s' "$BUILD" | field id)"
[ "$(printf '%s' "$BUILD" | field status)" = succeeded ] \
  || fail "build $BUILD_ID did not succeed: $BUILD"
echo "  $(printf '%s' "$BUILD" | field imageDigest)"

say "6. Release — the digest, the spec and the resolved config, frozen (§13)"
RELEASE_ID="$(api POST "/v1/projects/$PROJECT_ID/releases" \
  "{\"buildId\":\"$BUILD_ID\",\"summary\":\"make demo\"}" | field id)"
echo "  release $RELEASE_ID"

say "7. Deploy to staging — Mongo, the container, the route, and readiness"
# ?expand=environments — the route returns the bare project row without it.
ENV_ID="$(environment staging)"
DEPLOY="$(api POST "/v1/environments/$ENV_ID/deploy" "{\"releaseId\":\"$RELEASE_ID\"}")"
STATE="$(printf '%s' "$DEPLOY" | field state)" || fail "deploy failed: $DEPLOY"
# HEALTHY, not merely a state. Since P4b Task 13 a deploy that never becomes ready
# is a RECORDED failure — a 200 whose state is `failed`, with an Incident — so a
# check that a state came back would carry on to step 9 and blame the Caddyfile
# wildcard for an app that crashed.
[ "$STATE" = healthy ] || fail "the deploy did not become healthy (state: $STATE).
§14's Incident has the exit, the app's last 200 log lines and a repair prompt:
GET $API/v1/environments/$ENV_ID/incidents, signed in as the instructor."
echo "  instance $STATE"

say "8. Refuse production — §13's checklist, not a button"
PROD_ID="$(environment production)"
PROD="$(api POST "/v1/environments/$PROD_ID/deploy" "{\"releaseId\":\"$RELEASE_ID\"}")"
[ "$(printf '%s' "$PROD" | field error.code)" = RELEASE_PRODUCTION_GATE_UNAVAILABLE ] \
  || fail "production was NOT refused, which is a §13 defect: $PROD"
echo "  refused: RELEASE_PRODUCTION_GATE_UNAVAILABLE"

URL="https://$SLUG.staging.$ZONE"
say "9. Reach it — from a container, through the edge, verifying the platform CA"
# From a container because a host process cannot reach a container IP on Docker
# Desktop (§21), and with --cacert rather than -k because a demo that skips
# verification is a demo that would pass against the wrong certificate.
BODY="$(docker run --rm --network "$NET" --dns "$DNS_C_IP" \
  -v "$ROOT/$CA_FILE:/ca.crt:ro" curlimages/curl:8.11.1 \
  --cacert /ca.crt -sS -m 15 "$URL/")"
echo "  $BODY"
case "$BODY" in
  *'"boots"'*) ;;
  *) fail "the app answered, but not with its own body — that is the Caddyfile
wildcard, which returns 200 for every name in the zone whether a route exists or
not. Got: $BODY" ;;
esac

say "Done."
cat <<SUMMARY
  $URL              from your browser — no port, no -k
  $URL/healthz      {"status":"ok","mongo":true}

  The health endpoint pings the bound database, so a 200 there is evidence the
  Mongo binding is real and not merely that a process is listening.

  \`make reset\` removes every mf- container, network and volume this created and
  keeps the CA, so the certificate you just trusted stays trusted.
SUMMARY
