#!/usr/bin/env bash
# probes/profiles.sh <scratch> — [M13]: a service behind a profile under `build`, `up` and `down`.
# Each service has a trivial build context: with `image:` alone, `compose build` has nothing to
# build for EITHER service and the measurement would read as "skipped" for the wrong reason.
set -u
S=$1; W="$S/prof"; rm -rf "$W"; mkdir -p "$W/ctx"; cd "$W"
printf 'FROM alpine:3.22\n' > ctx/Dockerfile
cat > compose.yaml <<'Y'
name: m13probe
services:
  always:
    build: ./ctx
    image: m13probe-always:dev
    command: sleep 600
    networks: [shared]
  opt:
    build: ./ctx
    image: m13probe-opt:dev
    command: sleep 600
    networks: [shared]
    profiles: [github]
networks:
  shared: {}
Y
echo "docker compose $(docker compose version --short)"
echo '$ compose build --dry-run'; docker compose build --dry-run 2>&1 | grep -iE 'build|m13probe' | head -8
echo '$ compose --profile github build --dry-run'; docker compose --profile github build --dry-run 2>&1 | grep -iE 'build|m13probe' | head -8
echo '$ compose --profile github up -d'; docker compose --profile github up -d 2>&1 | tail -4
echo 'running:'; docker ps --filter label=com.docker.compose.project=m13probe --format '  {{.Names}} {{.Status}}'
echo '$ compose down   (NO profile)'; docker compose down > "$W/down.out" 2>&1; echo "down exit=$? (compose's own)"; tail -6 "$W/down.out"
echo 'after a bare down, containers:'; docker ps -a --filter label=com.docker.compose.project=m13probe --format '  {{.Names}} {{.Status}}'
echo 'after a bare down, networks:'; docker network ls --filter label=com.docker.compose.project=m13probe --format '  {{.Name}}'
echo '$ compose --profile github down'; docker compose --profile github down > "$W/down2.out" 2>&1; echo "down exit=$? (compose's own)"; tail -4 "$W/down2.out"
echo 'after a profiled down, containers:'; docker ps -a --filter label=com.docker.compose.project=m13probe --format '  {{.Names}} {{.Status}}'
echo 'after a profiled down, networks:'; docker network ls --filter label=com.docker.compose.project=m13probe --format '  {{.Name}}'
echo '$ cleanup: down -v --remove-orphans, and the two images'
docker compose -p m13probe --profile github down -v --remove-orphans >/dev/null 2>&1
docker image rm m13probe-always:dev m13probe-opt:dev >/dev/null 2>&1
echo "left: containers=$(docker ps -a --filter label=com.docker.compose.project=m13probe -q | wc -l | tr -d ' ') networks=$(docker network ls --filter label=com.docker.compose.project=m13probe -q | wc -l | tr -d ' ') images=$(docker images -q 'm13probe-*' | wc -l | tr -d ' ')"
