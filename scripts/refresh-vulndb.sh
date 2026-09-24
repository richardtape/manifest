#!/usr/bin/env bash
# `make refresh-vulndb`: refresh the scanner's vulnerability database — §12's "scanners
# age badly" — WITHOUT the rest of `make seed`, which also rebuilds images, re-mirrors
# and re-warms. It needs the network and touches only the `manifest-grype-db` volume.
#
# Past seven days every scan WARNS rather than blocks (C1 lets an offline laptop build),
# `make doctor` warns, and §13's `scans` item refuses EVERY production launch until this
# has run (ORIENTATION §2, *Outstanding*). Rich asked for the target on 2026-09-24.
#
# THE IMAGE PIN IS RESTATED, as it already is in three places — `build/scan.ts`'s
# `GRYPE`, `infra/seed/seed.sh` step 4c and `scripts/doctor.sh` — so a Grype upgrade
# moves all four together.
#
# macOS ships bash 3.2 and a BSD userland: no `mapfile`, no GNU-only flags.
set -euo pipefail

IMAGE=anchore/grype:v0.118.0
VOLUME=manifest-grype-db

built() {
  docker run --rm -v "$VOLUME:/db" \
    -e GRYPE_DB_CACHE_DIR=/db -e GRYPE_DB_AUTO_UPDATE=false \
    -e GRYPE_CHECK_FOR_APP_UPDATE=false \
    "$IMAGE" db status -o json 2>/dev/null \
    | sed -n 's/.*"built": *"\([^"]*\)".*/\1/p' | head -1
}

before="$(built || true)"
echo "  before: ${before:-no database}"

docker volume create "$VOLUME" >/dev/null
if ! docker run --rm -v "$VOLUME:/db" -e GRYPE_DB_CACHE_DIR=/db "$IMAGE" db update; then
  echo "  the refresh FAILED. It needs the network — the one step of a scan that does." >&2
  echo "  The database is unchanged: ${before:-there is none}." >&2
  exit 1
fi

# THE ANSWER, NOT THAT AN ANSWER ARRIVED: ask Grype what it now holds, as `make doctor`
# does, rather than trusting the update's exit code.
after="$(built || true)"
if [ -z "$after" ]; then
  echo "  Grype reported success, but its status names no build date — read it with:" >&2
  echo "  docker run --rm -v $VOLUME:/db -e GRYPE_DB_CACHE_DIR=/db $IMAGE db status" >&2
  exit 1
fi
if [ "$after" = "$before" ]; then
  echo "  after:  $after — unchanged: Grype already held the newest database it publishes."
else
  echo "  after:  $after"
fi
echo "  make doctor reports its age; the scan gate calls it stale seven days after that."
