#!/usr/bin/env bash
# The UBC AI Gateway plan's Task 1, Step 10: removes everything up.sh made, then counts what is left (expected 0 each).
#   SCRATCH=<scratchpad> bash down.sh
set -u
: "${SCRATCH:?set SCRATCH}"
STATE="$SCRATCH/gw-probe.state"
if [ -s "$STATE" ]; then
  PID=$(grep '^STUB_PID=' "$STATE" | tail -1 | cut -d= -f2)
  [ -n "$PID" ] && kill "$PID" 2>/dev/null
fi
docker rm -f gw-probe gw-probe-pg >/dev/null 2>&1
docker network rm gw-probe-net >/dev/null 2>&1
docker volume rm gw-probe-pgdata >/dev/null 2>&1
rm -f "$STATE"
echo "left: containers=$(docker ps -a --format '{{.Names}}' | grep -c '^gw-probe') networks=$(docker network ls --format '{{.Name}}' | grep -c '^gw-probe') volumes=$(docker volume ls --format '{{.Name}}' | grep -c '^gw-probe') stub=$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 http://127.0.0.1:7198/__log)"
