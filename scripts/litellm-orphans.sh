#!/usr/bin/env bash
# List, and optionally delete, the LiteLLM users no app holds any more.
#
# WHY THIS EXISTS. Every demo that replaces a project, and every `pnpm test:docker`, mints a
# fresh LiteLLM user `mf-<projectId>-<environment>` for the new app and leaves the old one
# behind with no project. The list grows most sittings and nothing reaps it, so it is
# recorded in ORIENTATION §2's *Outstanding* and handed to Rich — an agent session's
# permission classifier refuses the delete as a secret-store write, and that refusal is
# never worked around.
#
# So: an agent runs this with no arguments and hands over what it prints; a person runs it
# with --apply. Same shape as the `sudo` rule — the privileged step is bundled into one
# script somebody else runs.
#
#   bash scripts/litellm-orphans.sh            # list only. Changes nothing.
#   bash scripts/litellm-orphans.sh --apply    # delete the orphans' keys, then the orphans.
#
# IT RE-DERIVES WHAT IS ORPHANED EVERY RUN and never takes a list on trust. A user is HELD
# when one of its keys is the key a container is actually running with; everything else is
# an orphan. Do not paste yesterday's list into this script — journey-app's user has moved
# in every one of the last eight sittings, which is why ORIENTATION says re-measure.
#
# NO SECRET IS EVER PRINTED. An app's key is compared by SHA-256: the hash of the container's
# `LLM_API_KEY` equals that key's `token` in `GET /user/info` (ORIENTATION §2). The hashes
# are read with `docker inspect` rather than `docker exec` so that a STOPPED app still
# counts as holding its key — an exec-based check cannot see one, and would call its user an
# orphan and delete the key out from under it on the next start.
#
# macOS ships bash 3.2 and a BSD userland: no associative arrays, no `mapfile`, no `xargs -r`.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

APPLY=no
case "${1:-}" in
  --apply) APPLY=yes ;;
  '') ;;
  *) echo "usage: bash scripts/litellm-orphans.sh [--apply]" >&2; exit 2 ;;
esac

fail() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }
say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }

# LiteLLM's published port (§21). A copy of ORIENTATION's bullet once implied 7111, which is
# not it — so the port is written here once and read from nowhere else.
LITELLM=http://127.0.0.1:7106

[ -f .env ] || fail ".env not found. It is written by \`make seed\` and holds LITELLM_MASTER_KEY."
set -a; . ./.env; set +a
[ -n "${LITELLM_MASTER_KEY:-}" ] || fail "LITELLM_MASTER_KEY is not in .env"

api() {
  local method="$1" apipath="$2" body="${3:-}"
  local args=(-sS -m 30 -X "$method" -H "Authorization: Bearer $LITELLM_MASTER_KEY")
  if [ -n "$body" ]; then args+=(-H 'content-type: application/json' -d "$body"); fi
  curl "${args[@]}" "$LITELLM$apipath"
}

# THE STATUS, because `curl -sS` EXITS 0 ON AN HTTP ERROR (ORIENTATION §4) — so a `|| fail`
# after a plain `api POST …` can never fire, and a delete that answered 404 or 500 would be
# reported as done. Measured 2026-09-18: `/user/delete` and `/key/delete` both answer 404 for
# an id that does not exist, and `curl` exits 0 for both.
api_status() {
  local method="$1" apipath="$2" body="${3:-}"
  local args=(-sS -m 30 -o /dev/null -w '%{http_code}' -X "$method" -H "Authorization: Bearer $LITELLM_MASTER_KEY")
  if [ -n "$body" ]; then args+=(-H 'content-type: application/json' -d "$body"); fi
  curl "${args[@]}" "$LITELLM$apipath" || echo 000
}

# `-f` for the same reason: without it an unhealthy LiteLLM answering 503 reads as alive.
curl -fsS -m 10 -o /dev/null "$LITELLM/health/liveliness" \
  || fail "no LiteLLM on $LITELLM. \`make up\` first."

# ---------------------------------------------------------------- what is held

# Every app container, running or not. The name is §23's: mf-<slug>-<env>-<ids>-app.
CONTAINERS="$(docker ps -a --format '{{.Names}}' | grep -E '^mf-.*-app$' || true)"

HELD_HASHES=''
CONTAINER_COUNT=0
for container in $CONTAINERS; do
  CONTAINER_COUNT=$((CONTAINER_COUNT + 1))
  # The value never reaches a variable, a log or the screen — it goes down a pipe and only
  # its digest comes back. `println` one variable per line, then take the one we want: no
  # template function beyond `range`, so this does not depend on the daemon's Go version.
  key_hash="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' \
    "$container" 2>/dev/null | sed -n 's/^LLM_API_KEY=//p' | tr -d '\n' \
    | shasum -a 256 | cut -d' ' -f1)"
  # An app with no AI hashes the empty string; that is not a key and must not match one.
  if [ "$key_hash" != e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 ]; then
    HELD_HASHES="$HELD_HASHES$key_hash
"
  fi
done

# THE GUARD THAT MATTERS. If the hash step silently found nothing — a changed container
# name, a Docker template that stopped matching, an inspect that failed — then every user
# looks orphaned and this script would delete the live ones. A check that finds nothing and
# a check that passes are the same observation otherwise (ORIENTATION §9).
if [ "$CONTAINER_COUNT" -gt 0 ] && [ -z "$HELD_HASHES" ]; then
  fail "$CONTAINER_COUNT app container(s) exist and NOT ONE yielded an LLM_API_KEY hash.
That is far more likely to be a broken read than a machine with no AI apps, and acting on
it would delete the keys the running apps are using. Nothing was changed. Check:
  docker inspect --format '{{.Config.Env}}' $(echo "$CONTAINERS" | head -1)"
fi

# ---------------------------------------------------------------- who exists

# EVERY PAGE, not the first one. `page_size` is capped at 100 — asking for more is a 422,
# not a bigger page — so a machine that has run enough demos would silently have its later
# users read as absent, and "absent" here means "not held", which means "delete". The loop
# reads `total_pages` from the answer rather than guessing when to stop.
list_users() {
  local page=1 pages=1 body
  while [ "$page" -le "$pages" ]; do
    body="$(api GET "/user/list?page_size=100&page=$page")"
    pages="$(printf '%s' "$body" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);if(!Array.isArray(j.users)){console.error(s.slice(0,300));process.exit(1)}console.log(j.total_pages??1)})')" || return 1
    printf '%s' "$body" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{JSON.parse(s).users.forEach(x=>console.log(x.user_id))})' || return 1
    page=$((page + 1))
  done
}

USERS="$(list_users)" || fail "/user/list did not answer a list of users"
[ -n "$USERS" ] || fail "/user/list answered no users at all, which is not a state this machine reaches"

HELD=''
ORPHANS=''
for user in $USERS; do
  # LiteLLM's own row. Not ours, never deleted here.
  if [ "$user" = default_user_id ]; then continue; fi
  tokens="$(api GET "/user/info?user_id=$user" \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);(j.keys??[]).forEach(k=>{if(k.token)console.log(k.token)})})')"
  is_held=no
  for token in $tokens; do
    if printf '%s' "$HELD_HASHES" | grep -Fxq "$token"; then is_held=yes; fi
  done
  if [ "$is_held" = yes ]; then HELD="$HELD$user
"; else ORPHANS="$ORPHANS$user
"; fi
done

held_count="$(printf '%s' "$HELD" | grep -c . || true)"
orphan_count="$(printf '%s' "$ORPHANS" | grep -c . || true)"

say "Held by a container ($held_count) — these are LEFT ALONE"
printf '%s' "$HELD" | sed 's/^/  /'
say "Orphaned ($orphan_count) — no app holds any of their keys"
printf '%s' "$ORPHANS" | sed 's/^/  /'
echo
echo "  (read $CONTAINER_COUNT app container(s); 'default_user_id' is LiteLLM's own and is never touched)"

if [ "$orphan_count" -eq 0 ]; then say "Nothing to delete."; exit 0; fi

if [ "$APPLY" != yes ]; then
  say "LISTED ONLY — nothing was changed."
  echo "  To delete them:  bash scripts/litellm-orphans.sh --apply"
  exit 0
fi

# ---------------------------------------------------------------- delete

say "Deleting $orphan_count orphaned user(s) and their keys"
failed=0
for user in $ORPHANS; do
  tokens="$(api GET "/user/info?user_id=$user" \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);(j.keys??[]).forEach(k=>{if(k.token)console.log(k.token)})})')"
  # Keys FIRST: a deleted user's keys are not reliably reaped with it, and a live key whose
  # user is gone is exactly the thing §20 does not want lying around. `/key/delete` accepts
  # the hashed token `/user/info` reports, so a key nobody ever saw can still go
  # (ORIENTATION §4, measured 2026-09-14).
  key_count=0
  for token in $tokens; do
    key_count=$((key_count + 1))
    status="$(api_status POST /key/delete "{\"keys\":[\"$token\"]}")"
    case "$status" in
      2*) ;;
      *) echo "  FAILED ($status) to delete a key of $user" >&2; failed=$((failed + 1)) ;;
    esac
  done
  status="$(api_status POST /user/delete "{\"user_ids\":[\"$user\"]}")"
  case "$status" in
    2*) echo "  deleted $user ($key_count key(s))" ;;
    *) echo "  FAILED ($status) to delete $user" >&2; failed=$((failed + 1)) ;;
  esac
done

# ---------------------------------------------------------------- and check

say "Re-reading the list — the answer, not that an answer arrived"
REMAINING="$(list_users)" || fail "could not re-read /user/list after deleting"
still_there=0
for user in $ORPHANS; do
  if printf '%s' "$REMAINING" | grep -Fxq "$user"; then
    echo "  STILL PRESENT: $user" >&2
    still_there=$((still_there + 1))
  fi
done
for user in $HELD; do
  printf '%s' "$REMAINING" | grep -Fxq "$user" \
    || { echo "  HELD USER IS GONE: $user — this should not happen" >&2; still_there=$((still_there + 1)); }
done

remaining_count="$(printf '%s' "$REMAINING" | grep -c . || true)"
echo "  $remaining_count user(s) remain (was $((held_count + orphan_count + 1)))"

if [ "$failed" -ne 0 ] || [ "$still_there" -ne 0 ]; then
  fail "$failed delete(s) failed and $still_there row(s) are not as expected. Re-run to see the current list."
fi
say "Done. Every held user survived and every orphan is gone."
