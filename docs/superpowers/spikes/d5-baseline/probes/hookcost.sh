#!/bin/bash
# What does the rendered hook cost per push? 20 pushes of one small commit each, with and without.
set -u
export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null
source ~/.nvm/nvm.sh >/dev/null; set -a; . /Users/rich/Developer/manifest/.env; set +a; export MANIFEST_DATABASE_URL="postgres://manifest_app:${MANIFEST_APP_PASSWORD}@127.0.0.1:7103/manifest_control"
T=$(mktemp -d); cd $T
G="-c user.name=t -c user.email=t@t -c commit.gpgsign=false"
node --experimental-transform-types --no-warnings --import /Users/rich/Developer/manifest/packages/github-fake/resolve-ts.mjs --input-type=module -e "
import { renderPreReceiveHook } from '/Users/rich/Developer/manifest/packages/control-plane/src/source/pre-receive.ts'
process.stdout.write(renderPreReceiveHook())" > hook || { echo 'render failed'; exit 1; }
for mode in without with; do
  rm -rf b.git w; git init -q --bare -b main b.git; git init -q -b main w
  [ $mode = with ] && cp hook b.git/hooks/pre-receive && chmod 755 b.git/hooks/pre-receive
  cd w; git remote add origin ../b.git
  s=$(python3 -c 'import time;print(time.time())')
  for i in $(seq 1 20); do echo $i > f; git add -A; git $G commit -qm c$i; git push -q origin main; done
  e=$(python3 -c 'import time;print(time.time())')
  cd ..
  python3 -c "print('$mode hook: %.0f ms per push' % (($e-$s)*1000/20))"
done
rm -rf $T
