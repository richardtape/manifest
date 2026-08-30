# S1 — Can code drive a bare git repository through to a routed, healthy container with a bound database, using only §11's `Driver` operations?

**Answer:** **Yes.** Every criterion in the brief passes, including the one the brief
singles out as a real unknown — **rootless BuildKit works on Docker Desktop for Mac**,
and it can be run **non-privileged**, which the obvious route does not give you.

A dependency-free Node script drives the whole round-trip: source read from a bare
repo at a commit, built on a rootless network-restricted builder, pushed to the local
registry as a **digest**, Mongo provisioned on a per-app network, the app started with
§8's environment and §12's hardening, routed at runtime through Caddy's admin API, and
reachable at `https://chem-labs.sandbox.manifest.internal/` — **byte-identically from
the host and from inside a container**. Four findings change P1 or P3 and are listed
under *Spec actions*; the sharpest is that **offline builds need base images in the
local registry, not merely in the daemon's cache**. One §12 baseline item —
**user-namespace remapping — silently does nothing on Docker Desktop**.

| | |
|---|---|
| **Spike** | S1 |
| **Run by** | Claude Opus 5 (Claude Code), for Rich Tape |
| **Dates** | 2026-08-30 |
| **Timebox** | 3 days — **used: ~2 h wall clock** |
| **Branch** | `spike/S1` |
| **Verdict** | **Yes.** P3 is unblocked, and P2's paused remainder can resume. |

---

## Versions

| Component | Version / digest |
|---|---|
| macOS | 26.5.2 (build 25F84), arm64 |
| Docker Desktop | 4.87.0 · Engine 29.7.2 · Compose v5.4.0 |
| Docker VM memory | 8.32 GB decimal / 7.75 GiB binary |
| **buildx** | `v0.36.1-desktop.1` |
| **BuildKit (rootless)** | **`v0.32.2`**, `moby/buildkit@sha256:504731e577c20559c00f968f33219f30115e70be29ab96728d1d06e963fc494b` |
| Registry | `registry:2`, `registry@sha256:a3d8aaa63ed8681a604f1dea0aa03f100d5895b6a58ace528858a7b332415373` |
| Verdaccio | `verdaccio/verdaccio:6`, `@sha256:fcb86134563534e2f634752e6c6c3edcdb78242ec16578c73ce39d1dadbaa801` |
| Mongo | `mongodb/mongodb-community-server:7.0.28-ubi8`, `@sha256:56d07a0227ceeb04ba763bfe5681660c465114d2f6fb943e8e8f3718134b5436` |
| App base image | `node:22-alpine`, `@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32`, **mirrored to `127.0.0.1:7107/base/node:22-alpine`** |
| Caddy (edge, from S7) | v2.11.4 custom build |
| Node (host, driving the script) | v24.12.0 |

Built app image digest (final run):
`sha256:b262037bb7c8fa67ffb281eed2b7774594c2b2e4c5fc8dcfe15ea59de0e11a42`

---

## Evidence

The whole round-trip, from one `node roundtrip.js`:

```
[build]     digest sha256:b262037bb7c8fa67ffb281eed2b7774594c2b2e4c5fc8dcfe15ea59de0e11a42
[build]     pulled 127.0.0.1:7107/fixture-app@sha256:b262037b…
[service]   mf-chem-labs-sandbox-mongo created=true; second call created=false
[instance]  mf-chem-labs-sandbox-app  created=true; second call created=false
[instance]  state=running networks=manifest-spike,mf-chem-labs-sandbox-net
[health]    {"status":"ok","mongo":true}
[route]     PUT route for chem-labs.sandbox.manifest.internal -> 10.89.0.2:8080
[route]     from a container via the edge: { "app": "chem-labs", … "boots": 1 }
[logs]      demuxed 2 lines; first: {"stream":"stdout","line":"{\"level\":\"info\",…}"}
[lifecycle] stopped; state=exited
[lifecycle] boots before=1 after=2  (rising => the volume survived)
```

### 1. Source from a bare repository at a commit — pass

`git archive <commit>` from `fixture-app.git` into a context directory, with the
**blueprint** supplying `Dockerfile` and `.npmrc` (D13 — the app never supplies a
build definition, and the fixture repo deliberately contains none).

### 2. Rootless BuildKit — pass, and the obvious route is wrong

**The buildx `docker-container` driver gives you rootless BuildKit inside a
`--privileged` container.** That is rootless in the sense that matters least:

```
$ docker buildx create --driver docker-container \
      --driver-opt image=moby/buildkit:v0.32.2-rootless …
$ docker inspect buildx_buildkit_s1-rootless0 --format \
      'User={{.Config.User}} Privileged={{.HostConfig.Privileged}}'
User=1000:1000  Privileged=true
```

§12 says **never `--privileged`**, so this fails the hardening baseline while
appearing to satisfy "rootless BuildKit". **Running the daemon as a plain container
and attaching over the remote driver gives both properties:**

```bash
docker run -d --name buildkitd \
  --security-opt seccomp=unconfined --security-opt apparmor=unconfined \
  --device /dev/fuse \
  -v ./buildkitd.toml:/home/user/.config/buildkit/buildkitd.toml:ro \
  moby/buildkit:v0.32.2-rootless --oci-worker-no-process-sandbox

docker buildx create --name mf --driver remote docker-container://buildkitd
```

```
$ docker inspect buildkitd --format \
    'Privileged={{.HostConfig.Privileged}} User={{.Config.User}} Caps={{.HostConfig.CapAdd}}'
Privileged=false  User=1000:1000  Caps=[]

$ docker exec buildkitd ps -o user,comm
user  rootlesskit
user  buildkitd
```

**Verdict: pass.** This invocation is what survives the spike. Note the daemon must
listen on its **default unix socket** — passing `--addr tcp://…` makes the
`docker-container://` transport time out with `waiting for connection: context
deadline exceeded`.

### 3. BuildKit's `RUN` steps do not inherit Docker's DNS — pass, after a fix

`RUN npm install` could not resolve the package mirror:

```
npm error network request to http://manifest-verdaccio:4873/mongodb failed,
  reason: getaddrinfo ENOTFOUND manifest-verdaccio
```

The worker reports `worker.network:host`, so build steps *share* the buildkitd
container's network namespace — but **BuildKit generates its own `resolv.conf`**, so
Docker service names do not resolve. The fix is in `buildkitd.toml`:

```toml
[dns]
  nameservers = ["127.0.0.11"]      # Docker's embedded resolver

[registry."manifest-registry:5000"]
  http = true
  insecure = true
```

**Verdict: pass.** Both stanzas are required and neither is discoverable from the
error message.

### 4. The network-restricted builder — pass, with a negative control

§20's control map names "network-restricted builder" as a real control, so it is
tested as one rather than asserted. On an ordinary bridge network the restriction is
**not** in force:

```
$ docker exec buildkitd wget -q -T4 -O- https://registry.npmjs.org/
REACHES npmjs — restriction NOT enforced
```

Moving the builder to a `--internal` network enforces it, while leaving exactly the
two permitted destinations reachable:

```
builder egress:  BLOCKED
mirror:          reachable
registry:        reachable
```

**Verdict: pass.** The builder is on the internal network **only**; the registry and
mirror are **dual-homed** (see finding 6).

### 5. Offline build — pass, and this is the finding that changes `make seed`

With the builder egress-blocked, the build failed **before reaching npm**:

```
ERROR: failed to solve: node:22-alpine: failed to resolve source metadata for
  docker.io/library/node:22-alpine: failed to do request:
  Head "https://registry-1.docker.io/v2/library/node/manifests/22-alpine":
  dial tcp: lookup registry-1.docker.io on 127.0.0.11:53: server misbehaving
```

**BuildKit re-resolves the base image against its registry on every build.** The
Docker daemon already had `node:22-alpine` locally and that was irrelevant — the
rootless worker has its own content store. So §21's "`make seed` pulls digest-pinned
base images" is **not sufficient as written**: the images must be **pushed into the
local registry**, and the blueprint must reference them from there.

After mirroring the base image and pointing the blueprint at it, with **both the
builder and the mirror fully egress-blocked**:

```
mirror egress:  BLOCKED
builder egress: BLOCKED
#8 [4/5] RUN npm install --omit=dev --no-audit --no-fund
#10 pushing manifest for …@sha256:691b6b608b7ea638e1a0b125930fdae02ec02822b66aed7438bcb142dab58b2a
```

**Verdict: pass.** A genuinely offline build. This is a partial, build-side data point
for C1's offline claim — S7 could not test the offline case at all.

### 6. Published ports break on `--internal` networks — pass, after re-homing

While the registry was on the internal network only:

```
host -> 127.0.0.1:7107/v2/  = 000 (connection refused)
```

A container attached solely to an `--internal` network **loses its published port
mapping**. The registry must be dual-homed: internal (for the builder) plus an
ordinary network (for the host and the daemon). Only the **builder** stays
internal-only.

A related trap on the way: `docker push localhost:7107/…` resolved to **`::1`** and
timed out — §12's "everything binds `127.0.0.1` explicitly; relying on `::1` produces
intermittent failures" applies to the registry name in build tooling too. Use
`127.0.0.1:7107`.

### 7. Digest, not tag — pass

`--metadata-file` yields `containerimage.digest`. Because the builder and the daemon
reach the registry under **different names**, the driver pushes to
`manifest-registry:5000/fixture-app` and the daemon pulls
`127.0.0.1:7107/fixture-app@sha256:…` — the same content, addressed by digest:

```
Digest: sha256:b262037bb7c8fa67ffb281eed2b7774594c2b2e4c5fc8dcfe15ea59de0e11a42
Status: Downloaded newer image for 127.0.0.1:7107/fixture-app@sha256:b262037b…
```

**Verdict: pass**, and it is a small argument for §13's digest rule: a tag would not
have survived the name change.

### 8. Idempotency — pass

`ensureService` and `ensureInstance` keyed by a deterministic name from
`(project, environment, release)`:

```
[service]  created=true; second call created=false
[instance] created=true; second call created=false
```

Destroy is idempotent too — a second `destroyInstance`/`destroyService` does not
throw (404 is swallowed deliberately).

### 9. The §12 hardening baseline — pass except one item

Asked for, and what the container actually got:

```
uid/gid:      1000/1000
CapEff:       0000000000000000   (all capabilities dropped)
NoNewPrivs:   1                  (enforced)
Seccomp:      2                  (filtered — the default profile, not unconfined)
readonly /:   enforced
tmpfs /tmp:   writable, as intended
pids max:     128
memory max:   268435456
```

**The exception — user-namespace remapping is not in effect:**

```
$ docker info --format '{{.SecurityOptions}}'
[name=seccomp,profile=builtin name=cgroupns]
```

No `name=userns`. §12 lists user-namespace remapping in a baseline that "applies to
every app, service and sandbox container, on every driver", and **the Docker driver
on Docker Desktop cannot deliver it** without daemon-level reconfiguration. Everything
else in the baseline enforces.

**Verdict: pass with one documented gap.** This is exactly what
`capabilities()` exists to report honestly, and it matters most for S6.

### 10. Routing at runtime, and route churn under load — pass

Route added after boot via the admin API, then hammered while routes churned:

```
12 add/remove cycles during 400 requests
RESULT ok=400 fail=0
```

**Verdict: pass.** Caddy's admin API is safe for runtime routing; a route change does
not drop in-flight requests. Two operational notes: use **`PUT`** on
`/config/apps/http/servers/srv0/routes/0` (a `POST` appends, landing the route
*behind* the wildcard whose `terminal: true` then swallows it — carried over from S7),
and **recreating the Caddy container discards every runtime route**, since they live
only in its running config. P3 needs to re-apply routes on edge restart.

### 11. Reachable from host and container, byte-identically — pass

The criterion the brief calls out. Same URL, no port, no `-k`:

```
host      : {"app":"chem-labs","env":"sandbox","url":"https://chem-labs.sandbox.manifest.internal","uid":1000,"boots":2}
container : {"app":"chem-labs","env":"sandbox","url":"https://chem-labs.sandbox.manifest.internal","uid":1000,"boots":2}

$ curl -sS -o /dev/null -w "%{ssl_verify_result} %{http_code}" \
    https://chem-labs.sandbox.manifest.internal/
0 200
```

`uid: 1000` confirms the app runs non-root; `boots: 2` is the Mongo row count after a
stop/start, so the bound service and its volume both survived.

**Verdict: pass.** S7's DNS design carries a real application, not just a placeholder.

### 12. Logs as an `AsyncIterable` — pass

The Engine API's multiplexed stream demuxed by hand — 8-byte frame header
(`[stream_type][000][size:u32be][payload]`) — with no library:

```
[logs] demuxed 2 lines; first:
  {"stream":"stdout","line":"{\"level\":\"info\",\"msg\":\"listening\",\"port\":\"8080\"}"}
```

`for await (const line of driver.logs(name, { tail: 20 }))` works, and `break` closes
the stream. **Verdict: pass.**

### 13. Stop, start, destroy — pass

```
stopped; state=exited
boots before=1 after=2                    (volume survived a stop/start)
after destroyInstance: app=absent
after destroyService(deleteData:false): volumes kept: mf-chem-labs-sandbox-mongo-data
after destroyService(deleteData:true):  volumes: none
```

**Verdict: pass.** `deleteData` is honoured in both directions.

---

## Sub-question answers

| Sub-question | Answer | Evidence | Consequence |
|---|---|---|---|
| **Rootless BuildKit on Docker Desktop for Mac** — does it work, and how is it invoked? | **Yes.** Not via `--driver docker-container` (privileged wrapper), but as a plain non-privileged container plus `--driver remote docker-container://…`. Needs `--oci-worker-no-process-sandbox`, `/dev/fuse`, unconfined seccomp/apparmor, and the **default unix socket**. | 2, 3 | D13 holds. §12's builder is buildable as specified. The invocation is below. |
| **Idempotency** — is the second call a no-op? | **Yes**, for `ensureService`, `ensureInstance` and both destroys. | 8 | §11's "entire reason reconciliation is safe to retry" is verified for the Docker driver. |
| **Caddy admin API** — does a route change drop in-flight requests? | **No.** 400/400 succeeded across 12 add/remove cycles. | 10 | Runtime routing is safe. But routes are lost on edge restart — P3 must re-apply. |
| **Do the hardening flags actually apply?** | **All but one.** `cap-drop ALL`, `no-new-privileges`, read-only root + tmpfs, default seccomp, and `pids`/memory/CPU ceilings all enforce. **User-namespace remapping does not.** | 9 | §12's baseline needs a documented macOS exception, and `capabilities()` should report it. Load-bearing for S6. |
| **Log streaming shape** — demux without buffering? | **Yes.** 8-byte framed stream → `AsyncIterable<LogLine>`, ~40 lines of dependency-free code. | 12 | `logs()` in §11 is implementable as declared. |

---

## What survives

- **The rootless BuildKit invocation that worked** → §Evidence 2, with the
  `buildkitd.toml` from §Evidence 3. Both are required; neither is guessable.

- **The Caddy admin API request shapes:**

  ```
  add:    PUT    /config/apps/http/servers/srv0/routes/0
          {"match":[{"host":["<app>.<zone>"]}],
           "handle":[{"handler":"reverse_proxy","upstreams":[{"dial":"<ip>:<port>"}]}],
           "terminal":true}
  remove: DELETE /config/apps/http/servers/srv0/routes/<index>
  ```

  `PUT` inserts, `POST` appends. Index 0 keeps the route ahead of the wildcard.

- **The exact flag set satisfying §12's baseline on macOS**, as an Engine API
  `HostConfig` — and the one flag that silently does nothing:

  ```jsonc
  {
    "CapDrop": ["ALL"],
    "SecurityOpt": ["no-new-privileges"],
    "ReadonlyRootfs": true,
    "Tmpfs": { "/tmp": "rw,noexec,nosuid,size=16m" },
    "PidsLimit": 128,
    "Memory": 268435456,
    "NanoCpus": 500000000,
    "Privileged": false
    // user-namespace remapping: NOT available on Docker Desktop (see Evidence 9)
  }
  ```

- **`Driver` signatures that turned out to be wrong** — see the next section. The
  interface survived essentially intact, which is itself the finding.

- **The driver and round-trip scripts**, reproduced in the spike branch
  (`spike/S1`) at `scratchpad/S1/work/{driver.js,roundtrip.js}`. Throwaway, but the
  *shapes* — the deterministic naming, the log demux, the dual-homed registry
  topology — are what P3 should reuse.

---

## What did not work

- **`--driver docker-container` with a rootless image.** Works, but wraps the daemon
  in a privileged container. Abandoned for the remote-driver approach.
- **`--addr tcp://0.0.0.0:1234` on buildkitd.** The `docker-container://` transport
  expects the default unix socket; the builder bootstrapped into
  `waiting for connection: context deadline exceeded`.
- **`.npmrc` copied after `npm install`.** The first build silently used the *public*
  npm registry while appearing to succeed — the mirror's storage was empty and only a
  deliberate check caught it. A build that "works" is not evidence the supply-chain
  control is in force.
- **`docker push localhost:7107/…`.** Resolved to `::1`, timed out. Use `127.0.0.1`.
- **Registry on an `--internal` network only.** Lost its published port.
- **Polling health from the host.** The control plane is a **host process** (§21) and
  cannot reach container IPs on Docker Desktop:

  ```
  host -> 10.89.0.2:8080 = UNREACHABLE
  ```

  Health checks were run from a container instead. See *Spec actions* — this is a real
  constraint on P3's health-check design.

---

## Spec actions

| Section | Current text | Proposed change | Why |
|---|---|---|---|
| §21 *Commands* | "`make seed` … Pulls digest-pinned base images" | "…pulls digest-pinned base images **and pushes them into the local registry**; blueprints reference base images from the local registry, never from Docker Hub." | BuildKit re-resolves `FROM` against a registry on every build, so a daemon-cached image does not make the build offline-capable. Evidence 5. |
| §12 *The builder* | "**Rootless BuildKit**, so a malicious dependency's build script cannot reach the host daemon." | Add: "On Docker Desktop, use `moby/buildkit:<ver>-rootless` as a **non-privileged** container attached via buildx's `remote` driver. buildx's own `docker-container` driver runs the rootless image inside a **privileged** container, which contradicts the hardening baseline below." | The obvious invocation quietly violates §12's own "never `--privileged`". Evidence 2. |
| §12 *The builder* | "**Network-restricted to the package mirror and the registry.**" | Add: "Implemented as a Docker `--internal` network holding the builder alone; the registry and mirror are dual-homed, because a container attached only to an internal network loses its published ports." | Evidence 4, 6 — the restriction is real but the topology is not obvious. |
| §12 *Container hardening baseline* | "user-namespace remapping; the blueprint runs the app as a non-root UID" | Split: the non-root UID **is** enforced; **user-namespace remapping is not available on Docker Desktop** and the Docker driver must report it through `capabilities()` rather than implying it. | Evidence 9. §12 claims the baseline applies "on every driver"; on macOS one item cannot. |
| §21 *Platform inventory* | "Control plane 7100 — **Host Node process**… Running on the host sidesteps the question and iterates faster." | Add: "A host process **cannot reach container IPs** on Docker Desktop, so health checks and readiness polling must go through the edge or a published port, not the container address." | Evidence 13 / *What did not work*. This shapes P3's health-check design and is invisible until tried. |
| §12 *Edge* | *(add)* | "Runtime routes live only in the running Caddy config; restarting the edge discards them. The control plane re-applies all routes on edge start." | Evidence 10. Discovered by restarting Caddy mid-spike and losing the app's route. |
| §11 *Driver interface* | — | **No change.** Every operation exercised was implementable as declared. | Worth recording: the interface needed no revision, which is the sub-question "a list of `Driver` signatures that turned out to be wrong" returning empty. |

---

## Open questions

- **Build timeout, disk quota and concurrency caps** (§12 "Bounded") were **not
  tested**. The builder ran unbounded. **Not a spike** — P3 implementation detail,
  but it belongs on P3's checklist because an unbounded builder is a local DoS.
- **A registry push token scoped to one repository path** (§12) was not tested; the
  spike's registry has no auth at all. **A P3 task**, and the control it protects —
  §13 restricting pushes — depends on it.
- **`exec()`** was not exercised (sandbox-only, and outside S1's checklist). S5 needs
  it.
- **Multi-arch / image promotion.** Everything here is `linux/arm64`. §21's honest
  divergence 4 says laptop-built images are never promoted, so this is consistent —
  but nothing in the driver *enforces* that yet. **A P3 decision.**
- **Does `--internal` survive a Docker Desktop restart** with the same semantics?
  Not tested. Minor, but `make doctor` could assert it.

---

## Manual steps that could not be automated

- **The three S7 `sudo` steps** were needed again for the host-side criterion —
  resolver file, `127.0.0.2` alias, CA trust. Rich ran them; `sudo` cannot prompt from
  a tool call. The alias remains the one that recurs after every reboot.
- **Mirroring base images into the local registry** needs network once, and is a
  genuine `make seed` step rather than an incidental one (Evidence 5).
- **Nothing else.** The round-trip itself — build, provision, route, health, log,
  stop, start, destroy — ran unattended from one `node roundtrip.js`.

---

## Machine state

The spike's containers, networks and volumes were created under `manifest-*`, `s1-*`
and `mf-*` prefixes and are removed by `S7-artefacts/down.sh` plus
`docker network rm manifest-build manifest-build-internal` and
`docker buildx rm s1-remote`. Pre-existing containers were never named. The three host
changes are reverted by `S7-artefacts/host-undo.sh`.
