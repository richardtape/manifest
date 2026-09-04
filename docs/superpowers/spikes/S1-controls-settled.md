# S1's two open controls — settled before P3 was written

**Answer: both work, and `registry:2` needs no design change.** A push token scoped
to one repository path is enforceable with stock `registry:2` (2.8.3) and a JWT the
control plane signs itself; the same credential pushing to a *different* repository
path is refused end-to-end, through `docker push` **and** through rootless BuildKit.
The builder's bounds split three ways: **concurrency and cache size are enforced by
BuildKit and were measured; a build timeout has no server-side mechanism at all and
must be enforced by destroying the ephemeral builder; and a per-build disk quota
cannot be enforced on Docker Desktop** — `--storage-opt size=` is accepted, recorded
in `HostConfig`, and silently does nothing. That last one is a second
`enforcesUserNamespaceRemapping`-shaped gap and P3 reports it through
`capabilities()` for the same reason.

| | |
|---|---|
| **Settles** | S1 *Open questions* items 1 and 2 — the two the roadmap calls controls rather than implementation details |
| **Run by** | Claude Opus 5 (Claude Code), for Rich Tape |
| **Date** | 2026-08-31 |
| **Timebox** | 2 hours for both — **used: ~1 h 25 m** |
| **Why it ran** | §13's *"the image registry rejects pushes from app and sandbox contexts"* is what stops "promotion never rebuilds" being defeated by overwriting a tag. Nobody had made `registry:2` do scoped auth. If it could not, that was a design change, not a task. |
| **Verdict** | **No design change.** P3 Tasks 4–6 and 8 are written against these results. |

---

## Versions

| Component | Version / digest |
|---|---|
| macOS | 26.5.2 (build 25F84), arm64 |
| Docker Desktop | Engine 29.7.2, client 29.7.2 |
| Storage driver | `overlayfs` (containerd snapshotter) |
| buildx | `v0.36.1-desktop.1` |
| **registry** | **`registry:2` = distribution 2.8.3**, `registry@sha256:a3d8aaa63ed8681a604f1dea0aa03f100d5895b6a58ace528858a7b332415373` |
| BuildKit | `moby/buildkit:v0.32.2-rootless`, `@sha256:504731e577c20559c00f968f33219f30115e70be29ab96728d1d06e963fc494b` |
| Base image used | `alpine@sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc` |
| Node (token issuer) | v24.12.0, **no dependencies** — `node:crypto` only |

---

## Control 1 — a registry push token scoped to one repository path

### The mechanism

`registry:2` supports **bearer-token auth against an external issuer**. Five
environment variables turn it on, and the issuer is anything that can sign a JWT the
registry can validate against a certificate bundle:

```
REGISTRY_AUTH=token
REGISTRY_AUTH_TOKEN_REALM=http://127.0.0.1:7198/token
REGISTRY_AUTH_TOKEN_SERVICE=manifest-registry
REGISTRY_AUTH_TOKEN_ISSUER=manifest-control-plane
REGISTRY_AUTH_TOKEN_ROOTCERTBUNDLE=/certs/token.crt
```

The token is an RS256 JWT whose header carries the issuer certificate in **`x5c`**
and whose claims carry the grant:

```jsonc
{ "iss": "manifest-control-plane", "sub": "<build id>", "aud": "manifest-registry",
  "exp": …, "nbf": …, "iat": …, "jti": "<uuid>",
  "access": [ { "type": "repository", "name": "local/chem-labs",
               "actions": ["pull", "push"] } ] }
```

**Signing it needs no library.** `createSign('RSA-SHA256')` over
`base64url(header).base64url(claims)`, with the PEM body of the certificate as the
single `x5c` element. The whole issuer is ~60 lines.

### Evidence — the registry API

| Request | Result | Meaning |
|---|---|---|
| `GET /v2/` anonymous | `401` + `Www-Authenticate: Bearer realm="…",service="manifest-registry"` | token auth is live |
| `POST /v2/local/chem-labs/blobs/uploads/` with a token scoped to `local/chem-labs` | **`202`** | push allowed |
| **the same token** on `POST /v2/local/other-app/blobs/uploads/` | **`401 UNAUTHORIZED`** | **the control** |
| a token signed by a **different key**, same scope | `401` | signature is verified |
| pull-only token, `GET …/tags/list` | `404 NAME_UNKNOWN` | authorised; the repo is simply empty |

The cross-repository refusal names what it wanted, which is what a driver should log:

```json
{"errors":[{"code":"UNAUTHORIZED","message":"authentication required",
 "detail":[{"Type":"repository","Name":"local/other-app","Action":"pull"},
           {"Type":"repository","Name":"local/other-app","Action":"push"}]}]}
```

**`registry:2` answers an out-of-scope token with `401 UNAUTHORIZED`, not `403`.**
A driver cannot tell "wrong repository" from "no credential" by status code; it must
read `errors[].detail`. Both push paths surface it to the client as
`insufficient_scope: authorization failed`.

### Evidence — the real toolchain

Not asserted from the API alone, because §13's control has to hold for the tools that
actually push.

```
docker login 127.0.0.1:7197 -u local/chem-labs          Login Succeeded
docker push  127.0.0.1:7197/local/chem-labs:probe       pushed, sha256:45e09956…
docker push  127.0.0.1:7197/local/other-app:probe       push access denied …
                                                        insufficient_scope: authorization failed
docker exec probe-registry ls …/repositories/local      chem-labs          <- and nothing else
```

Then through **rootless BuildKit on an `--internal` network**, which is what P3 uses:

```
buildx --builder probe-remote build --push -t probe-registry:5000/local/chem-labs:built
  #8 pushing manifest … DONE
  containerimage.digest = sha256:a3ee6e1a82b27e6a0b6bbed0c39d50f4598ace0412933dbb8f40d50231f59f49

buildx --builder probe-remote build --push -t probe-registry:5000/local/other-app:built
  ERROR: failed to push … insufficient_scope: authorization failed
```

**And the authorised repository still built immediately afterwards**, so the refusal
above is scope, not a broken builder. That second half is the part it is tempting to
skip.

### Three findings that will otherwise cost a morning

**1. Docker 29 and BuildKit use the OAuth2 *POST form* grant, not GET + Basic.**
The distribution spec describes both. Only POST was ever exercised here — an issuer
that reads `?scope=` and the `Authorization: Basic` header sees
`POST /token` with `(none)` for auth and grants nothing, and the failure looks
exactly like a scope refusal:

```
[req] POST /token auth=(none) body=client_id=containerd-client&grant_type=password
      &password=x&scope=repository%3Alocal%2Fchem-labs%3Apull+repository%3A…&service=…&username=…
```

The identity is `username` in the **form body**; the scopes arrive as a **single
space-separated `scope` field**, not repeated parameters. Both push clients were
observed doing this — `client_id=containerd-client` for `docker push`,
`client_id=buildkit-client` for buildx.

**2. The client performs the token exchange, not the builder.** This decides
topology, so it was measured rather than assumed. With the realm advertised as
`http://127.0.0.1:7198/token` — which the builder provably **cannot** reach:

```
docker exec probe-buildkitd wget -T4 -O- http://127.0.0.1:7198/token
  wget: can't connect to remote host (127.0.0.1): Connection refused
```

— the build still pushed, and the token request arrived from `172.29.0.1`, the
gateway of the *ordinary* network, i.e. from the host. **The token issuer therefore
does not need to be dual-homed onto `manifest-build-internal`.** The control plane is
a host process (§21) and can serve the realm directly; nothing new joins the internal
network. Had this gone the other way, P1's compose file would have needed another
container.

**3. buildx asks for more than it needs, and trimming the grant is safe.** It
requested `repository:base/alpine:pull,push` for a base image it only reads. The
issuer granted `pull` and the build succeeded. So the policy can be strict:

```
repo == this build's app repository   -> grant what was asked
repo starts with base/                -> grant pull only
anything else                         -> grant no actions
```

### The negative control that was nearly recorded wrong

Flipping the **last** base64url character of the signature — `…SBQ` to `…SBX` — was
accepted by the registry, which reads as "the signature is not verified". It is not:
that character carries 2 significant bits and **4 padding bits**, and both spellings
decode to *byte-identical* 256-byte signatures.

```
sig chars: 342 -> bytes: 256 / 256   decoded bytes identical: true
```

**Sign with a different key instead.** A second self-signed issuer produced `401` on
every route. Mutating base64 text is not mutating a signature — the roadmap's *"a
green result is not evidence a control is in force"* arriving from the other side.

---

## Control 2 — builder timeout, disk quota and concurrency

§12 says the builder is *"Bounded: build timeout, disk quota, and a concurrency cap
per project and globally."* S1 recorded *"the builder ran unbounded"*. The three are
**not one mechanism**, and only two of them are BuildKit's.

### Concurrency — enforced, measured

`max-parallelism` in `buildkitd.toml` caps **steps in flight across the daemon**:

```toml
[worker.oci]
  max-parallelism = 1
```

| | RUN steps in flight at t+12s | wall clock for two 25-second builds |
|---|---|---|
| default (unset) | **2** | **25 s** — fully parallel |
| `max-parallelism = 1` | **1** | **50 s** — serialized |

**But this is not §12's per-project cap, and it is not even a per-build cap.** It
counts vertexes, so one build with parallel stages can consume the whole budget.
Because §12 also makes the builder **ephemeral per build**, a daemon-level setting
bounds only the build that owns that daemon. **The global and per-project caps are
the control plane's**, expressed as how many builder containers it will create at
once; `max-parallelism` bounds what a single build does to the machine.

### Cache size — enforced, asynchronously, and it does not bound one build

```toml
[worker.oci]
  gc = true
  [[worker.oci.gcpolicy]]
    all = true
    maxUsedSpace = "128MB"
```

One build writing a 300 MB file, against that policy:

```
cache before                13.76 MB
immediately after build    328.35 MB     <- the cap did NOT stop the build
+20 s                       13.59 MB     <- GC reclaimed it
+80 s                       13.59 MB
```

**`maxUsedSpace` is a post-hoc bound on the cache between builds, not a quota on a
build.** It works — the reclaim is real and was watched happening — but a single
build can exceed it by any amount before GC runs.

### Per-build disk quota — **not available, and it fails silently**

```
docker run --storage-opt size=64M alpine sh -c 'dd if=/dev/zero of=/fill bs=1M count=128'
  134217728 bytes (128.0MB) copied           <- 128 MB written into a 64 MB quota
  -rw-r--r-- 1 root root 134217728 /fill

docker inspect … --format '{{.HostConfig.StorageOpt}}'
  map[size:64M]                              <- accepted and recorded
```

The daemon **records the option and does not enforce it**: Docker Desktop's
containerd `overlayfs` snapshotter has no project-quota backing. This is the same
shape as S1's user-namespace finding — a §12 baseline item the local Docker driver
cannot deliver, invisible unless tested, and it applies to **`InstanceSpec.resources.diskMi`
for every app container as well as to the builder**. P3 reports it through
`capabilities()` as `enforcesDiskQuota: false` rather than implying a ceiling exists.

### Build timeout — no server-side mechanism exists

BuildKit has **no build timeout setting**: not in `buildkitd.toml`, not as a
`buildctl` or `buildx` flag. The only cancellation is the client's, over the gRPC
session — which means **the timeout is only as reliable as the process holding the
session.** A control plane that crashes mid-build cancels nothing.

Client cancellation does normally work: with distinct cache keys, SIGINT, SIGTERM and
SIGKILL of the buildx client each terminated the `RUN` process within seconds
(observed count returning to baseline in all three).

**Once, it did not.** The first cancelled build left `sleep 300` running inside
buildkitd for **at least 3m46s** after the client reported
`Canceled: context canceled`, and it was **not reproducible** afterwards. Two things
made it worse than wasted CPU, and both are properties of BuildKit rather than of
that one incident:

- **In-flight vertex sharing.** Three later builds of the same Dockerfile — including
  ones passing `--no-cache` — attached to the abandoned execution instead of starting
  their own. `--no-cache` disables cache *lookup*; it does not opt out of
  deduplicating an identical step already running. The symptom is a build that hangs
  with no output of its own.
- **`--oci-worker-no-process-sandbox`** — required for rootless BuildKit on Docker
  Desktop (S1) — runs build steps in buildkitd's own PID namespace, so there is no
  namespace teardown that guarantees a step dies.

Restarting the builder cleared it immediately.

**Conclusion, which does not depend on the unreproducible incident:** the build
timeout is enforced by **destroying the builder container**, which §12 already
requires the driver to do per build. A client-side deadline is the fast path; the
`docker rm -f` is the one that is actually a bound.

---

## What survives, for P3

- **The five registry environment variables**, the JWT claim set, and the `x5c`
  header — above, verbatim.
- **The issuer is a host-side control-plane route**, not a container. Proven by
  finding 2; it is why P1's compose file needs no change.
- **The token endpoint must implement the OAuth2 POST form grant.** `username` in the
  body is the identity; `scope` is one space-separated field.
- **The grant policy**: app repository → as asked; `base/*` → `pull` only; everything
  else → nothing.
- **`registry:2` refuses with `401` and an `errors[].detail` array**, never `403`.
  Clients see `insufficient_scope: authorization failed`.
- **`max-parallelism`** bounds one build's footprint; **the control plane** bounds how
  many builds exist.
- **`maxUsedSpace`** bounds the cache after the fact; **nothing** bounds one build's
  disk on this driver.
- **The timeout is `docker rm -f` on the builder**, with a client deadline in front of
  it.
- **Negative-control a signature by changing the key**, never by editing base64 text.

## Machine state

Everything ran under a `probe-` prefix — `probe-registry`, `probe-token`,
`probe-buildkitd`, networks `probe-net` and `probe-internal`, and the buildx builder
`probe-remote` — and all of it is removed. `docker login` wrote an entry to
`~/.docker/config.json`; the file was backed up first and restored byte-for-byte, and
its `auths` keys are the three Docker Hub entries it started with. The four
must-survive containers were never touched and are still up. No `sudo` was used and
no host file outside `~/.docker/config.json` was written.
