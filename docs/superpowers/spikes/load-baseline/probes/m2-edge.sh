#!/usr/bin/env bash
# B sitting 1, [M2] first half: a container on the platform network, as sso/sign-in.ts runs its probe
# (manifest-platform, the platform resolver as Dns, the platform CA mounted read-only, CapDrop ALL), reaches a
# STAGING hostname through the edge. The hostname is one no app holds, so the edge's staging wildcard answers it and
# echoes the source address it saw — no app, route or row is touched. Removed after (--rm).
set -u
cd /Users/rich/Developer/manifest
CA=$(pwd)/infra/ca/manifest-root.crt
NODE_IMG=127.0.0.1:7107/base/node:24-alpine
NAME=b-s1-m2.staging.manifest.internal
docker run --rm --name b-s1-m2-node --network manifest-platform --dns 10.89.0.53 -v "$CA":/ca.crt:ro \
  --cap-drop ALL --security-opt no-new-privileges --read-only -e NODE_EXTRA_CA_CERTS=/ca.crt \
  "$NODE_IMG" node -e '
const os=require("os"),tls=require("tls"),dns=require("dns").promises;
(async()=>{
  const me=Object.values(os.networkInterfaces()).flat().filter(i=>i.family==="IPv4"&&!i.internal).map(i=>i.address);
  console.log("container address(es):",me.join(","));
  for (const host of [process.argv[1],"edge.manifest.internal"]) {
    const a=await dns.lookup(host,{all:true}); console.log(host,"resolves to",a.map(x=>x.address).join(","));
    await new Promise((ok,ko)=>{const s=tls.connect({host,port:443,servername:host},()=>{const c=s.getPeerCertificate();
      console.log("  TLS",s.getProtocol(),"authorized="+s.authorized,"subject.CN="+(c.subject&&c.subject.CN),"issuer.CN="+(c.issuer&&c.issuer.CN),"SAN="+c.subjectaltname,"valid_to="+c.valid_to);s.end();ok()});s.on("error",ko)});
    const t0=Date.now(); const r=await fetch("https://"+host+"/"); const body=await r.text();
    console.log("  GET / ->",r.status,JSON.stringify(body.trim()),(Date.now()-t0)+"ms");
  }
  const r=await fetch("https://"+process.argv[1]+":8443/").catch(e=>({status:"ERR "+(e.cause&&e.cause.code||e.message)}));
  console.log("  the same name on :8443 (the public listener, srv1) ->", r.status, r.text?JSON.stringify((await r.text()).trim()):"");
})().catch(e=>{console.error("FAILED",e);process.exit(1)})' "$NAME"
