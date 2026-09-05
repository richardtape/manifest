#!/usr/bin/env bash
# Shared pass/fail harness for doctor.sh and verify.sh. bash 3.2 compatible.
CHECKS_RUN=0; CHECKS_FAILED=0; CHECKS_WARNED=0

_green() { printf '\033[32m%s\033[0m' "$1"; }
_red()   { printf '\033[31m%s\033[0m' "$1"; }
_amber() { printf '\033[33m%s\033[0m' "$1"; }

# check <label> <command...>   — fails the run
check() {
  local label="$1"; shift
  CHECKS_RUN=$((CHECKS_RUN + 1))
  local out
  if out=$("$@" 2>&1); then
    printf '  %s  %s\n' "$(_green 'PASS')" "$label"
    [ -n "$out" ] && printf '          %s\n' "$out"
    return 0
  else
    CHECKS_FAILED=$((CHECKS_FAILED + 1))
    printf '  %s  %s\n' "$(_red 'FAIL')" "$label"
    [ -n "$out" ] && printf '          %s\n' "$out"
    return 1
  fi
}

# check_warn <label> <command...> — reports, never fails the run
check_warn() {
  local label="$1"; shift
  CHECKS_RUN=$((CHECKS_RUN + 1))
  local out
  if out=$("$@" 2>&1); then
    printf '  %s  %s\n' "$(_green 'PASS')" "$label"
  else
    CHECKS_WARNED=$((CHECKS_WARNED + 1))
    printf '  %s  %s\n' "$(_amber 'WARN')" "$label"
  fi
  [ -n "$out" ] && printf '          %s\n' "$out"
  return 0
}

# report <label> <command...> — informational only, always passes, always prints
report() {
  local label="$1"; shift
  printf '  %s  %s\n' "$(_amber 'INFO')" "$label"
  printf '          %s\n' "$("$@" 2>&1 | tr '\n' ' ')"
}

require_cmd() { command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1"; return 1; }; }

summary() {
  printf '\n  %d checks, %d failed, %d warnings\n' \
    "$CHECKS_RUN" "$CHECKS_FAILED" "$CHECKS_WARNED"
  [ "$CHECKS_FAILED" -eq 0 ]
}
