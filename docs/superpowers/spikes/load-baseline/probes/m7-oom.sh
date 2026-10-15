#!/usr/bin/env bash
# B sitting 1, [M7]: an out-of-memory exit as Docker reports it. Throwaway containers, --network none, removed after.
set -u
IMG=node@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1
HARD=(--network none --read-only --tmpfs /tmp:rw,noexec,nosuid,size=16m --cap-drop ALL --security-opt no-new-privileges --pids-limit 128 --memory 64m --label manifest.b-s1=m7)
ALLOC='let n=0;const a=[];setInterval(()=>{for(let i=0;i<8;i++){a.push(Buffer.alloc(1<<20,1));n++}console.log("MiB",n)},20)'
inspect() { docker inspect "$1" --format "$1: Status={{.State.Status}} Running={{.State.Running}} ExitCode={{.State.ExitCode}} OOMKilled={{.State.OOMKilled}} Error='{{.State.Error}}' HostConfig.Memory={{.HostConfig.Memory}} MemorySwap={{.HostConfig.MemorySwap}} Init={{.HostConfig.Init}}"; }
cleanup() { docker rm -f -v b-s1-m7-a b-s1-m7-b b-s1-m7-c b-s1-m7-d b-s1-m7-e b-s1-m7-f >/dev/null 2>&1; }
trap cleanup EXIT
echo "== (a) init (as every app container, hardening.ts:40) + node as its child, allocating past 64 MiB; MemorySwap unset, as the driver leaves it"
docker run -d --name b-s1-m7-a --init "${HARD[@]}" "$IMG" node -e "$ALLOC" >/dev/null; timeout 60 docker wait b-s1-m7-a; inspect b-s1-m7-a; docker logs b-s1-m7-a 2>&1 | tail -1
echo "== (b) no init, node as PID 1"
docker run -d --name b-s1-m7-b "${HARD[@]}" "$IMG" node -e "$ALLOC" >/dev/null; timeout 60 docker wait b-s1-m7-b; inspect b-s1-m7-b; docker logs b-s1-m7-b 2>&1 | tail -1
echo "== (c) init + a shell whose node CHILD is OOM-killed while the shell lives on (the container still running)"
docker run -d --name b-s1-m7-c --init "${HARD[@]}" "$IMG" sh -c "node -e '$ALLOC' >/dev/null; echo child-exit=\$?; sleep 6; exit 0" >/dev/null
sleep 4; echo "-- while running:"; inspect b-s1-m7-c; timeout 30 docker wait b-s1-m7-c; echo "-- after exit:"; inspect b-s1-m7-c; docker logs b-s1-m7-c 2>&1 | tail -1
echo "== (d) init + a plain SIGKILL from outside (docker kill -s KILL), well under the ceiling"
docker run -d --name b-s1-m7-d --init "${HARD[@]}" "$IMG" node -e 'setInterval(()=>{},1000)' >/dev/null; sleep 2; docker kill -s KILL b-s1-m7-d >/dev/null; timeout 30 docker wait b-s1-m7-d; inspect b-s1-m7-d
echo "== (e) init + docker stop (SIGTERM)"
docker run -d --name b-s1-m7-e --init "${HARD[@]}" "$IMG" node -e 'setInterval(()=>{},1000)' >/dev/null; sleep 2; docker stop -t 10 b-s1-m7-e >/dev/null; timeout 30 docker wait b-s1-m7-e; inspect b-s1-m7-e
echo "== (f) init + MemorySwap = Memory (no swap) — for contrast with (a)"
docker run -d --name b-s1-m7-f --init "${HARD[@]}" --memory-swap 64m "$IMG" node -e "$ALLOC" >/dev/null; timeout 60 docker wait b-s1-m7-f; inspect b-s1-m7-f; docker logs b-s1-m7-f 2>&1 | tail -1
