#!/usr/bin/env bash
# scripts/github-real-repos.sh — every repository in the REAL organisation `.env` names, each beside
# the project that owns it (the launch path plan's Task 2).
#
#   bash scripts/github-real-repos.sh                    # list. Changes nothing on GitHub or in the
#                                                        # database; it rebuilds the control plane's dist/ (git-ignored).
#   bash scripts/github-real-repos.sh --delete <name>    # delete ONE repository no project row names
#
# WHY. Any Vitest run truncates the control plane's tables and leaves the real repositories on
# GitHub — `lp-real-a` lives on github.com whatever the database says (Task 1) — so this is how to
# find them. Each line reads `live <project id>`, `deleted` (a deleted project's row still names it)
# or `NONE`, from `psql` on `source_repositories`, joined on the name GitHub answered, whatever its
# case. `--delete` deletes ONE named repository, only when its line reads NONE, after printing what
# it will do and reading `yes` on stdin: **it never deletes a repository a project row names**.
#
# The listing is `packages/control-plane/src/source/github/real-repos.ts`, run from the BUILT dist/
# (node's strip-only TypeScript cannot import the control plane's src/ — TRAPS, the launch path
# plan). It mints its installation tokens IN MEMORY through the driver's own app-auth.ts and
# tokens.ts, and never prints the key, a token or `.env`'s values: `.env` is exported into ONE
# subshell and read nowhere else. SKIPPED, exit 0, with no real App in `.env`, and with GitHub unreachable only AFTER
# `manifest-postgres` answered and the build succeeded: it FAILS when either is down or broken.
#
# macOS ships bash 3.2 and a BSD userland: no associative arrays, no `mapfile`, no `xargs -r`.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

fail() { printf '\n\033[31mFAIL %s\033[0m\n' "$*" >&2; exit 1; }

case "${1:-}" in
  '') [ "$#" = 0 ] || { echo "usage: bash scripts/github-real-repos.sh [--delete <name>]" >&2; exit 2; } ;;
  --delete) [ "$#" = 2 ] || { echo "usage: bash scripts/github-real-repos.sh --delete <name>" >&2; exit 2; } ;;
  *) echo "usage: bash scripts/github-real-repos.sh [--delete <name>]" >&2; exit 2 ;;
esac

# A real App in `.env`: every line present (by `grep -c`, never printed), and the API not loopback —
# a loopback URL is the fake's, whose repositories `make reset` owns.
[ -r .env ] || { echo "SKIPPED — no .env (RUNBOOK, \"On the real App\")"; exit 0; }
for k in MANIFEST_GITHUB_API_URL MANIFEST_GITHUB_ORG MANIFEST_GITHUB_APP_ID \
  MANIFEST_GITHUB_INSTALLATION_ID MANIFEST_GITHUB_APP_KEY; do
  if [ "$(grep -c -E "^(export[[:space:]]+)?$k=[\"']?[^\"'[:space:]]" .env || true)" = 0 ]; then
    echo "SKIPPED — .env names no real GitHub App ($k is not set; RUNBOOK, \"On the real App\")"
    exit 0
  fi
done
if [ "$(grep -E '^(export[[:space:]]+)?MANIFEST_GITHUB_API_URL=' .env | tail -1 \
  | grep -c -E "=[\"']?https?://(127\.[0-9]+\.[0-9]+\.[0-9]+|localhost|\[::1\])([:/\"'[:space:]]|\$)" || true)" != 0 ]; then
  echo "SKIPPED — .env's MANIFEST_GITHUB_API_URL is the GitHub FAKE's; this lists the real App's organisation"
  exit 0
fi

# Who owns what: every GitHub row, with its project's state. Unreadable is a FAILURE — without it no
# line can be said, and nothing may be deleted.
WORK="$(mktemp -d -t manifest-real-repos)"
trap 'rm -rf "$WORK"' EXIT
if ! docker exec manifest-postgres psql -U manifest -d manifest_control -At -F '|' -c \
  "select sr.full_name, sr.project_id, p.state from source_repositories sr join projects p on p.id = sr.project_id where sr.provider = 'github'" \
  > "$WORK/rows" 2> "$WORK/psql.err"; then
  fail "could not read source_repositories ($(head -c 200 "$WORK/psql.err")) — is manifest-postgres up? Nothing was listed or deleted."
fi

# The program, from the built dist/ — quiet when it builds, loud when it does not.
if ! out="$(pnpm --filter @manifest/control-plane build 2>&1)"; then
  printf '%s\n' "$out" >&2
  fail "the control plane does not build — tsc's errors are above"
fi

# `.env` in THIS subshell only. `MANIFEST_DATABASE_URL` because `dist/db/client.js` throws at import
# without it (TRAPS); nothing connects. The network check is the configured API's own `/zen`.
(
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
  export MANIFEST_DATABASE_URL="postgres://manifest_app:${MANIFEST_APP_PASSWORD:-}@127.0.0.1:7103/manifest_control"
  HOST="$(node -e 'console.log(new URL(process.env.MANIFEST_GITHUB_API_URL).host)')"
  if ! curl -sS -m 5 -o /dev/null "$MANIFEST_GITHUB_API_URL/zen" 2>/dev/null; then
    echo "SKIPPED — $HOST unreachable (the network is off)"
    exit 0
  fi
  exec node packages/control-plane/dist/source/github/real-repos-main.js "$WORK/rows" "$@"
)
