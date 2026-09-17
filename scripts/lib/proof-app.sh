# shellcheck shell=bash
# §16's PROOF APP, assembled and deployed ONCE, for both acceptances that use it.
# Sourced, never executed.
#
# `make demo-identity` and `make demo-ai` deploy the same application. Each needs it
# pushed, validated, built, released and deployed, and a second copy of that walk is
# P4a defect 80's shape one level up: two scripts that disagree about WHAT THE PROOF
# APP IS — which files are laid over the skeleton, in which order — prove different
# things and both stay green. So there is one, here, beside the login walk in
# `infra/lib/idp-login.sh`.
#
# The caller sets, before calling anything:
#   ROOT CA CP_JAR SLUG APP_URL      (API comes from `scripts/lib/api.sh`, sourced below)
# and has sourced `infra/lib/common.sh`, and defined `say` and `fail`.
# These functions set, for the caller:
#   PROJECT_ID  WORK  COMMIT  BUILD_ID  RELEASE_ID  ENV_ID  STATE
# The caller removes $WORK in its OWN trap — one trap per script (P4a defect 70).
#
# macOS ships bash 3.2 and a BSD userland: no associative arrays, no `mapfile`,
# no `xargs -r`, no `readlink -f`.

# key, api, field, json and environment: THE one copy, shared with `scripts/demo.sh`
# (P5a Task 2). It sets API.
# shellcheck source=./api.sh
. "$ROOT/scripts/lib/api.sh"

# An authenticated call to the DEPLOYED APP, as the identity whose jar is $1.
app() {
  local jar="$1" method="$2" path="$3" body="${4:-}"
  local args=(-sS --cacert "$CA" -b "$jar" -c "$jar" -X "$method")
  if [ -n "$body" ]; then args+=(-H 'content-type: application/json' -d "$body"); fi
  curl "${args[@]}" "$APP_URL$path"
}

# Creates the project — three environments and a bare repository — or reuses it:
# both demos are re-runnable by design.
proof_app_project() {
  local project
  project="$(api POST /v1/projects "{\"slug\":\"$SLUG\",\"blueprint\":\"node-ts-mongo@1\"}")"
  PROJECT_ID="$(printf '%s' "$project" | field id 2>/dev/null || true)"
  if [ -z "$PROJECT_ID" ]; then
    PROJECT_ID="$(api GET /v1/projects | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const p=JSON.parse(s).find(x=>x.slug===process.argv[1]);if(!p){console.error(s);process.exit(1)}console.log(p.id)})' "$SLUG")"
    echo "  reusing project $PROJECT_ID"
  else
    echo "  project $PROJECT_ID"
  fi
  local bare="${MANIFEST_REPOS_ROOT:-$ROOT/.manifest/repos}/$SLUG.git"
  [ -d "$bare" ] || fail "no bare repository at $bare — is MANIFEST_REPOS_ROOT the
same value the control plane was started with?"
}

# Pushes the proof app: the blueprint skeleton, then the app over it.
proof_app_push() {
  WORK="$(mktemp -d -t mf-proof-src)"
  git clone -q "${MANIFEST_REPOS_ROOT:-$ROOT/.manifest/repos}/$SLUG.git" "$WORK"
  rm -f "$WORK/src/index.js"
  # THE SKELETON FIRST. This is what an agent generating an application actually
  # does, and it is why the proof-app starter carries no `auth/`, no `ai/`, no
  # `package.json` and no lockfile of its own: §20 calls a blueprint a security
  # multiplier, so the SAML wiring, the AI component, the end-user identifier and
  # §12's pinned dependency set are written once and inherited. A forked copy of
  # any of them drifts silently.
  cp -R "$ROOT/blueprints/node-ts-mongo/skeleton/." "$WORK/"
  # Then THE WHOLE STARTER over it — not a list of its files. Since P5a Task 10 the
  # proof app is node-ts-mongo@1's `proof-app` starter, and that directory is the one
  # statement of what the proof app is: a list here would be a second, and a file
  # added to the starter and missed here would be tested nowhere while every step
  # stayed green.
  cp -R "$ROOT/blueprints/node-ts-mongo/starters/proof-app/." "$WORK/"
  git -C "$WORK" add -A
  git -C "$WORK" \
    -c user.name=manifest -c user.email=manifest@localhost \
    commit -q -m 'feat: the proof app — CWL sign-in, a per-user note, and a question' --allow-empty
  git -C "$WORK" push -q origin HEAD:main
  COMMIT="$(git -C "$WORK" rev-parse HEAD)"
  echo "  pushed $COMMIT"
}

# Validates manifest.yaml at $COMMIT (§22 step 3).
proof_app_validate() {
  local spec
  spec="$(api POST "/v1/projects/$PROJECT_ID/spec" "{\"commitSha\":\"$COMMIT\"}")"
  [ "$(printf '%s' "$spec" | field valid)" = true ] \
    || fail "manifest.yaml is not valid: $spec"
  echo "  valid; sensitive diff: $(printf '%s' "$spec" | field sensitiveDiff)"
}

# Builds $COMMIT, releases it and deploys it to staging, and fails unless the
# instance is HEALTHY and its health check reaches its own database.
#   $1 the release summary
proof_app_deploy() {
  local build deploy health
  build="$(api POST "/v1/projects/$PROJECT_ID/builds" "{\"commitSha\":\"$COMMIT\"}")"
  BUILD_ID="$(printf '%s' "$build" | field id)"
  [ "$(printf '%s' "$build" | field status)" = succeeded ] \
    || fail "build $BUILD_ID did not succeed: $build"
  echo "  built $(printf '%s' "$build" | field imageDigest)"

  RELEASE_ID="$(api POST "/v1/projects/$PROJECT_ID/releases" \
    "{\"buildId\":\"$BUILD_ID\",\"summary\":\"$1\"}" | field id)"
  echo "  release $RELEASE_ID"

  ENV_ID="$(environment staging)"
  deploy="$(api POST "/v1/environments/$ENV_ID/deploy" "{\"releaseId\":\"$RELEASE_ID\"}")"
  STATE="$(printf '%s' "$deploy" | field state)" || fail "deploy failed: $deploy"
  # HEALTHY, not merely a state (P4b Task 13): a deploy that never becomes ready is a
  # 200 whose state is `failed`, with an Incident. See the same check in demo.sh.
  [ "$STATE" = healthy ] || fail "the deploy did not become healthy (state: $STATE).
§14's Incident has the exit, the app's last 200 log lines and a repair prompt:
GET /v1/environments/$ENV_ID/incidents, signed in as the project's owner."
  echo "  instance $STATE at $APP_URL"

  # A health check that passes proves the container is up and reaches Mongo; it
  # does not prove the SP row exists or that a model answers — the callers do.
  health="$(curl -sS --cacert "$CA" -m 15 "$APP_URL/healthz")"
  case "$health" in
    *'"mongo":true'*) echo "  healthz pings its own database: $health" ;;
    *) fail "the app is not healthy: $health" ;;
  esac
}
