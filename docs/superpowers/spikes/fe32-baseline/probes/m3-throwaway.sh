#!/bin/bash
# FE-32 sitting 1, [M3]/[M4]: a THROWAWAY Verdaccio — the compose file's image (`verdaccio/verdaccio:6`), a COPY of
# infra/verdaccio/config.yaml with its uplink replaced, its own network (`mf-fe32-probe`) and port (7196), its own
# storage volume — joined to the builder's network under an alias of its own, `mf-verdaccio-probe`, so a builder
# reaches it as Task 2's Docker case will. The running mirror's configuration is never touched; its storage is only READ
# (`seed` copies a package's cached files out of it).
#   bash m3-throwaway.sh up <uplink-url> | uplink <uplink-url> | seed <pkg>... | ls | logs | down
set -u
NAME=mf-fe32-verdaccio-probe; NET=mf-fe32-probe; VOL=mf-fe32-probe-storage; PORT=7196; ALIAS=mf-verdaccio-probe
REPO=/Users/rich/Developer/manifest
WORK=${FE32_WORK:-/private/tmp/claude-501/-Users-rich-Developer-manifest/19c992e3-4594-457f-90ed-144d31583fb6/scratchpad/m3-work}
mkdir -p "$WORK"
config() {
  # The live config, its uplink URL replaced; registration allowed (max_users) so [M4] can publish; requests logged.
  sed -e "s#url: https://registry.npmjs.org/#url: $1#" -e 's#max_users: -1 .*#max_users: 10#' \
      -e 's#log: { type: stdout, format: pretty, level: warn }#log: { type: stdout, format: pretty, level: http }#' \
      "$REPO/infra/verdaccio/config.yaml" > "$WORK/config.yaml"
  # [M4]: Verdaccio refuses a publish while a package's uplink is down (`503 … one of the uplinks is down, refuse to
  # publish`, measured), so the probe's own scope is made LOCAL — no proxy — before the `'@*/*'` rule that would proxy it.
  if [ "${FE32_LOCAL_SCOPE:-0}" = 1 ]; then
    awk '{print} /^packages:$/{print "  '"'"'@manifest-probe/*'"'"':"; print "    access: $all"; print "    publish: $all"}' "$WORK/config.yaml" > "$WORK/config.tmp" && mv "$WORK/config.tmp" "$WORK/config.yaml"
  fi
  grep -n 'url:\|max_users\|^log' "$WORK/config.yaml"
}
ping_wait() { for i in $(seq 1 60); do curl -sf "http://127.0.0.1:$PORT/-/ping" >/dev/null && { echo "ping ok after ${i}s"; return 0; }; sleep 1; done; echo "NO PING"; return 1; }
case "$1" in
  up)
    echo "networks before: $(docker network ls -q | wc -l | tr -d ' ')"
    config "$2"
    docker network create "$NET" >/dev/null && echo "network $NET"
    docker volume create "$VOL" >/dev/null && echo "volume $VOL"
    docker create --name "$NAME" --network "$NET" -p "127.0.0.1:$PORT:4873" -v "$VOL:/verdaccio/storage" verdaccio/verdaccio:6 >/dev/null
    docker cp "$WORK/config.yaml" "$NAME:/verdaccio/conf/config.yaml"
    docker start "$NAME" >/dev/null
    docker network connect --alias "$ALIAS" manifest-build-internal "$NAME"
    docker inspect "$NAME" --format 'image={{.Image}} {{range $k,$v := .NetworkSettings.Networks}}[{{$k}} {{$v.IPAddress}} aliases={{$v.Aliases}}] {{end}}'
    ping_wait
    echo "networks after: $(docker network ls -q | wc -l | tr -d ' ')"
    ;;
  uplink)
    config "$2"; docker cp "$WORK/config.yaml" "$NAME:/verdaccio/conf/config.yaml"; docker restart "$NAME" >/dev/null; ping_wait ;;
  seed)
    shift
    for p in "$@"; do
      rm -rf "$WORK/seed"; mkdir -p "$WORK/seed"
      docker cp "manifest-verdaccio:/verdaccio/storage/$p" "$WORK/seed/" && docker cp "$WORK/seed/$(basename "$p")" "$NAME:/verdaccio/storage/"
      echo "seeded $p: $(docker exec "$NAME" ls "/verdaccio/storage/$p" | tr '\n' ' ')"
    done
    docker exec -u 0 "$NAME" sh -c 'chown -R "$(stat -c %u /verdaccio/storage):$(stat -c %g /verdaccio/storage)" /verdaccio/storage'
    ;;
  ls) docker exec "$NAME" sh -c 'cd /verdaccio/storage && find . -maxdepth 3 | sort' ;;
  logs) docker logs "$NAME" 2>&1 | tail -${2:-40} ;;
  down)
    docker rm -f -v "$NAME" >/dev/null 2>&1; docker volume rm "$VOL" >/dev/null 2>&1; docker network rm "$NET" >/dev/null 2>&1
    echo "gone: container=$(docker ps -a --filter name=$NAME -q | wc -l | tr -d ' ') volume=$(docker volume ls -q --filter name=$VOL | wc -l | tr -d ' ') network=$(docker network ls -q --filter name=$NET | wc -l | tr -d ' ')"
    echo "networks: $(docker network ls -q | wc -l | tr -d ' ')"
    ;;
esac
