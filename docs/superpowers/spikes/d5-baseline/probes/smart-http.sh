#!/usr/bin/env bash
# probes/smart-http.sh <scratch> — drives smart-http.mjs: a push, a 3 MB push and a clone,
# with the Basic header passed ONLY through GIT_CONFIG_* in the environment (Decision 4's form).
set -u
S=$1; HERE=$(cd "$(dirname "$0")" && pwd); W="$S/m4"; rm -rf "$W"; mkdir -p "$W"
PORT=7195
export GIT_CONFIG_NOSYSTEM=1 GIT_TERMINAL_PROMPT=0
ID=(-c user.name=probe -c user.email=probe@example.invalid -c commit.gpgsign=false)
# -b main: with GIT_CONFIG_NOSYSTEM=1 no init.defaultBranch applies, and a bare repository whose HEAD
# names refs/heads/master clones "successfully" with NOTHING checked out (the first run of this
# probe did exactly that — Task 4's fake must create every repository with HEAD -> main).
git init -q --bare -b main "$W/served.git"
node "$HERE/smart-http.mjs" "$W/served.git" $PORT & SRV=$!; sleep 1
export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=http.extraHeader
export GIT_CONFIG_VALUE_0="Authorization: Basic $(printf 'x-access-token:probe' | base64)"
git init -q -b main "$W/work" && cd "$W/work"
echo hello > a.txt && git add a.txt && git "${ID[@]}" commit -qm one
git push -q "http://127.0.0.1:$PORT/o/r.git" main; echo "small push exit=$?"
head -c 3145728 /dev/urandom > big.bin && git add big.bin && git "${ID[@]}" commit -qm big
git push -q "http://127.0.0.1:$PORT/o/r.git" main; echo "3 MB push exit=$?"
cd "$W" && git clone -q "http://127.0.0.1:$PORT/o/r.git" clone; echo "clone exit=$?"
echo "clone head: $(git -C "$W/clone" log --oneline | wc -l | tr -d ' ') commits, big.bin $(wc -c < "$W/clone/big.bin" | tr -d ' ') bytes"
echo "served head == work head: $([ "$(git --git-dir="$W/served.git" rev-parse main)" = "$(git -C "$W/work" rev-parse main)" ] && echo yes || echo NO)"
# negative control: no header at all -> the server's 401, and git (no prompt) fails
unset GIT_CONFIG_COUNT GIT_CONFIG_KEY_0 GIT_CONFIG_VALUE_0
git clone -q "http://127.0.0.1:$PORT/o/r.git" "$W/noauth" 2>&1 | head -2; echo "clone WITHOUT the header exit=${PIPESTATUS[0]}"
kill $SRV
