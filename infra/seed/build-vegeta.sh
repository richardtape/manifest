#!/usr/bin/env bash
# §24's load generator, BUILT HERE (the load rehearsal plan's Task 2; Rich, 2026-10-03: "Build it locally").
#
#   bash infra/seed/build-vegeta.sh             fetch the archive if it is not cached, verify it, build the image
#   bash infra/seed/build-vegeta.sh --no-build  fetch if absent and verify — no Docker (the seed step's own test)
#
# `make seed` runs it. Every later run is OFFLINE: the archive and vegeta's checksums file are cached in
# infra/seed-cache/vegeta/ (git-ignored), so a rebuild needs no network. Offline WITHOUT the cache it says
# so and exits non-zero — never a silent WARN, because a machine with no generator cannot rehearse a
# large course's launch, and nothing else would tell its operator why.
#
# VERIFIED TWICE BEFORE ANYTHING IS BUILT: the archive's sha256 must equal infra/vegeta/vegeta.lock's for
# this architecture AND the line vegeta's own release publishes for it. A mismatch with either is refused,
# naming both values, and the archive is left where it is for a person to look at — it is never deleted
# and re-fetched in a loop. (The Dockerfile checks the lock's value a third time, inside the build.)
#
# THE IMAGE GOES INTO THE DOCKER DAEMON'S OWN STORE as manifest/vegeta:<version> — where the control plane
# creates a container from through the Engine API, as D21's sign-in probe runs curl — never under
# 127.0.0.1:7107/local/ (scripts/app-images.sh sweeps that prefix) and never only in the registry, which
# `make reset` wipes.
#
# Settable for the test (packages/control-plane/src/launch/load-seed.test.ts), never in normal use:
# VEGETA_LOCK, VEGETA_CACHE, VEGETA_ARCH (linux/arm64 | linux/amd64).
#
# macOS ships bash 3.2 and a BSD userland: no associative arrays, no `mapfile`, `shasum` not `sha256sum`.
set -euo pipefail
cd "$(dirname "$0")/../.."

BUILD=yes
case "${1:-}" in
  --no-build) BUILD=no ;;
  '') ;;
  *) echo "usage: bash infra/seed/build-vegeta.sh [--no-build]" >&2; exit 2 ;;
esac

LOCK="${VEGETA_LOCK:-infra/vegeta/vegeta.lock}"
CACHE="${VEGETA_CACHE:-infra/seed-cache/vegeta}"

fail() { echo "build-vegeta: $*" >&2; exit 1; }

[ -f "$LOCK" ] || fail "no lock at $LOCK"
field() { awk -F '\t' -v k="$1" -v n="$2" '$1 == k { print $n; exit }' "$LOCK"; }

VERSION="$(field version 2)"
[ -n "$VERSION" ] || fail "$LOCK names no version"

if [ -n "${VEGETA_ARCH:-}" ]; then ARCH="$VEGETA_ARCH"
else
  # The DAEMON's architecture, not the host's: the binary runs in the Docker VM.
  case "$(docker info --format '{{.Architecture}}')" in
    aarch64|arm64) ARCH=linux/arm64 ;;
    x86_64|amd64) ARCH=linux/amd64 ;;
    *) fail "the Docker daemon's architecture is $(docker info --format '{{.Architecture}}'), which $LOCK has no archive for" ;;
  esac
fi

URL="$(field "$ARCH" 2)"
WANT="$(field "$ARCH" 3)"
SUMS_URL="$(field checksums 2)"
[ -n "$URL" ] && [ -n "$WANT" ] || fail "$LOCK has no archive for $ARCH"
[ -n "$SUMS_URL" ] || fail "$LOCK names no checksums file"

ARCHIVE="$CACHE/$(basename "$URL")"
SUMS="$CACHE/$(basename "$SUMS_URL")"
mkdir -p "$CACHE"

# Into a temporary name and then moved, so an interrupted download never leaves a partial file that a
# later offline run would read as the cached archive.
fetch() {
  local url="$1" out="$2"
  [ -f "$out" ] && return 0
  echo "     downloading $(basename "$out")"
  if ! curl -fsSL -m 300 -o "$out.part" "$url"; then
    rm -f "$out.part"
    fail "$(basename "$out") is not cached in $CACHE and could not be downloaded from $url — run \`make seed\` with the network on"
  fi
  mv "$out.part" "$out"
}
fetch "$SUMS_URL" "$SUMS"
fetch "$URL" "$ARCHIVE"

GOT="$(shasum -a 256 "$ARCHIVE" | awk '{ print $1 }')"
PUBLISHED="$(awk -v f="$(basename "$ARCHIVE")" '$2 == f { print $1; exit }' "$SUMS")"
[ -n "$PUBLISHED" ] || fail "vegeta's checksums file ($SUMS) has no line for $(basename "$ARCHIVE")"
if [ "$GOT" != "$WANT" ]; then
  fail "REFUSED: $ARCHIVE has sha256 $GOT, but $LOCK pins $WANT for $ARCH — the archive is left in place; nothing was built"
fi
if [ "$GOT" != "$PUBLISHED" ]; then
  fail "REFUSED: $ARCHIVE has sha256 $GOT, but vegeta's published checksums file says $PUBLISHED — the archive is left in place; nothing was built"
fi
echo "     vegeta $VERSION ($ARCH) verified: $GOT, the lock's and the published checksum"

[ "$BUILD" = yes ] || exit 0

# THE BASE BY DIGEST, from the one place that holds it (mirror-images.sh writes infra/images.lock).
ALPINE_DIGEST="$(awk -F '\t' '$1 == "alpine:3.22" { print $2; exit }' infra/images.lock)"
[ -n "$ALPINE_DIGEST" ] || fail "infra/images.lock holds no alpine:3.22 digest — run the mirror step of \`make seed\` first"

IMAGE="manifest/vegeta:$VERSION"
CONTEXT="$(mktemp -d)"
trap 'rm -rf "$CONTEXT"' EXIT
cp infra/vegeta/Dockerfile "$CONTEXT/Dockerfile"
cp "$ARCHIVE" "$CONTEXT/vegeta.tar.gz"
docker build -q \
  --platform "$ARCH" \
  --build-arg "ALPINE_DIGEST=$ALPINE_DIGEST" \
  --build-arg "VEGETA_VERSION=$VERSION" \
  --build-arg "VEGETA_SHA256=$WANT" \
  -t "$IMAGE" "$CONTEXT" >/dev/null

# The answer, not that an answer arrived: the binary in the image says the version the lock names.
said="$(docker run --rm --network none --entrypoint vegeta "$IMAGE" --version 2>&1 | head -1)"
case "$said" in
  *"$VERSION"*) echo "     $IMAGE built: $said" ;;
  *) fail "$IMAGE was built, but its vegeta says '$said', not $VERSION" ;;
esac
