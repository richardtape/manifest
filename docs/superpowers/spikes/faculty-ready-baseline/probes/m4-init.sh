#!/usr/bin/env bash
# [M4] Init in the hardened shape (faculty-ready Task 1). Throwaways, removed at the end.
# PID 1 is `node`, as in an app container — node does not reap the orphans it adopts (P5a sitting 2).
# Orphans are made as s6.docker.test.ts's probe 11 makes them: `sleep N &` in an exec'd shell that then exits.
set -u
IMG=node:22-alpine
N=fr-m4-init
echo "image: $(docker image inspect $IMG --format '{{.Id}} {{index .RepoDigests 0}}' 2>&1)"
echo "docker: $(docker version --format '{{.Server.Version}}')  InitBinary: $(docker info --format '{{.InitBinary}}')"
run() { # $1 = label, rest = extra docker run flags
  label=$1; shift
  docker rm -f $N >/dev/null 2>&1
  docker run -d --name $N "$@" --cap-drop ALL --read-only --security-opt no-new-privileges --pids-limit 64 \
    $IMG node -e 'setInterval(() => {}, 1e9)' >/dev/null
  sleep 1
  echo "--- $label"
  echo "proc1_comm: $(docker exec $N cat /proc/1/comm)"
  echo "pids.current baseline: $(docker exec $N cat /sys/fs/cgroup/pids.current)"
  docker exec $N sh -c 'i=0; while [ $i -lt 20 ]; do sleep 3 & i=$((i+1)); done'
  echo "pids.current just after 20 orphans: $(docker exec $N cat /sys/fs/cgroup/pids.current)"
  sleep 6
  echo "pids.current 6 s later (sleeps long done): $(docker exec $N cat /sys/fs/cgroup/pids.current)"
  echo "zombies 6 s later: $(docker exec $N sh -c 'ps -o stat,ppid,comm | awk "\$1 ~ /Z/" | wc -l | tr -d " "')"
  T0=$(python3 -c 'import time;print(time.time())')
  docker stop -t 10 $N >/dev/null
  T1=$(python3 -c 'import time;print(time.time())')
  echo "docker stop -t 10 wall: $(python3 -c "print(round($T1-$T0,2))") s"
  echo "exit code: $(docker inspect $N --format '{{.State.ExitCode}} OOMKilled={{.State.OOMKilled}}')"
  docker rm $N >/dev/null && echo "removed $N"
}
run "WITH --init" --init
run "CONTROL: without --init (today's app shape)"
