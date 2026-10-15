#!/usr/bin/env bash
# B sitting 1, [M2] the app's half (manifest-coord5's (a), 11:47): a skeleton app's staging built after A1's 1d40042 —
# muddiest-point's STAGING (W5B's, done with at 11:36) — `/`, `/healthz` and ONE `/login`, unloaded, from a container on the
# platform network as D21's probe runs; and the `saml_requests` documents that /login adds, counted in the staging Mongo
# before and after by mongosh INSIDE the db container (its credentials expand there; never printed or copied). Nothing of
# its production or its repository is touched.
set -u
cd /Users/rich/Developer/manifest
APP=mf-muddiest-point-staging-b6dc9c93-97d7ecec-app
DB=mf-muddiest-point-staging-db
HOST=muddiest-point.staging.manifest.internal
CA=$(pwd)/infra/ca/manifest-root.crt
img=$(docker inspect $APP --format '{{.Image}}')
echo "app container: $APP — image $img, created $(docker image inspect $img --format '{{.Created}}'), started $(docker inspect $APP --format '{{.State.StartedAt}}')"
echo "image ENV NODE_ENV: $(docker image inspect $img --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^NODE_ENV=' || echo none)"
echo "errors.js in the image: $(docker exec $APP sh -c 'ls /app/errors.js 2>/dev/null || find / -name errors.js -path "*app*" -not -path "*/node_modules/*" 2>/dev/null | head -2')"
count() {
  docker exec $DB sh -c 'mongosh --quiet -u "$MONGODB_INITDB_ROOT_USERNAME" -p "$MONGODB_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --eval "
    const out = []; for (const d of db.adminCommand({ listDatabases: 1 }).databases) {
      if ([\"admin\",\"config\",\"local\"].includes(d.name)) continue;
      const c = db.getSiblingDB(d.name).saml_requests;
      out.push(d.name + \".saml_requests=\" + c.countDocuments() + \" ttl=\" + JSON.stringify((c.getIndexes().find(i => i.expireAfterSeconds !== undefined) || {}).expireAfterSeconds));
    } print(out.join(\" \"))"' 2>&1 | tail -1
}
echo "BEFORE: $(count)"
docker run --rm --name b-s1-m2-app --network manifest-platform --dns 10.89.0.53 -v "$CA":/ca.crt:ro \
  --cap-drop ALL --security-opt no-new-privileges --read-only -e NODE_EXTRA_CA_CERTS=/ca.crt \
  127.0.0.1:7107/base/node:24-alpine node -e '
const host=process.argv[1];
(async()=>{ for (const p of ["/","/healthz","/login"]) {
  const t0=Date.now(); const r=await fetch("https://"+host+p,{redirect:"manual"}); const b=await r.text(); const loc=r.headers.get("location");
  let where=""; if (loc) { const u=new URL(loc, "https://"+host); where=" → "+u.origin+u.pathname+" (query keys: "+[...u.searchParams.keys()].join(",")+")"; }
  console.log("GET "+p.padEnd(8),r.status,(Date.now()-t0)+"ms","x-manifest-instance="+r.headers.get("x-manifest-instance"),"set-cookie="+(r.headers.get("set-cookie")?"yes":"no"),"body "+b.length+" B"+(b.length<200?" "+JSON.stringify(b.trim()):"")+where);
}})().catch(e=>{console.error("FAILED",e);process.exit(1)})' "$HOST"
echo "AFTER: $(count)"
