# Running Manifest locally

Everything here is verified. If a step does not behave as described, that is a bug
in the platform, not in your machine — `make doctor` first, then open an issue with
its output.

## First time

```bash
git clone <repo> && cd manifest
make seed            # the only step needing network. Pulls images and models.
make host-setup      # three privileged steps. Prompts for a password twice.
export NODE_EXTRA_CA_CERTS="$PWD/infra/ca/manifest-root.crt"   # add to your profile
make up
make doctor && make verify
```

Then open <https://console.manifest.internal/>. No port, no certificate warning.

`make seed` must run **before** `make host-setup`: the CA it mints is what
`host-setup` trusts. Seed also adds the `127.0.0.2` alias itself, so Caddy can bind
80/443 the first time — that is what removes S7's run-the-script-twice dance.

## Every day

```bash
make up        # re-adds the 127.0.0.2 alias if a reboot removed it
make down      # stops everything, including the profiled builder
```

## The four verbs

| | |
|---|---|
| `make seed` | The only step that needs network. Pulls and **pushes** base images into the local registry, warms the npm mirror, mints the CA, pulls the Ollama models. |
| `make up` | Boots the platform and waits for every healthcheck. Re-adds the loopback alias, prompting for `sudo` **only** when it is genuinely missing. |
| `make down` | Stops everything. Data, the seed cache and the CA all survive. |
| `make reset` | Destroys project data, the databases and the registry's contents. **Keeps** the Caddy CA, the npm mirror cache, `infra/images.lock` and the Ollama models, and re-pushes the base images from the local daemon — so the machine stays offline-capable. |

Plus `make doctor` (*can this machine run the platform?* — works with nothing up) and
`make verify` (*is the running platform correct?* — needs `make up` first).

And `make demo` — P3's acceptance, described below.

## `make demo` — an app, from a bare repository to a URL

*Added by P3 Task 17. First run green 2026-09-07.*

`make demo` drives the **real HTTP API** end to end, so it proves the platform
rather than a test harness. The control plane must be running first — see
*Running the control plane* in [`README.md`](../../README.md) — and its boot line
must say `{"driver":"docker"}`. Against the fake driver every claim below is empty,
which is why step 0 of the script checks and why the boot line exists at all.

```bash
make up
# ... start the control plane in another terminal, per README ...
make demo
```

Nine steps: log in with the dev shim · create the project (three environments and a
provisioned bare repository) · push `fixtures/fixture-app` into that repository with
a `manifest.yaml` declaring a Mongo · validate the manifest at that commit · build
(blueprint Dockerfile, egress-free builder, npm mirror, SBOM and scan, digest) ·
release · deploy to staging · **be refused production** with §13's checklist · then
reach the app from a container, through the edge, with the platform CA verified and
no `-k`.

The last step prints the app's own body:

```json
{"app":"fixture-app","env":"staging","url":"https://fixture-app.staging.manifest.internal",
 "uid":10001,"boots":1,"writes":1}
```

**Read `uid` and `boots`, not the 200.** `uid: 10001` is §12's non-root baseline
observed from outside the container. `boots` is written once per *process start* and
never by a request, so a rising value across a stop and start is evidence the bound
database and its volume are real — where a 200 is evidence only that something
answered. The Caddyfile wildcard returns 200 for **every** name in the zone whether a
route exists or not, so "it answered" genuinely proves nothing here; the script
checks the body for that reason.

`make reset` removes every `mf-` container, network and volume the demo created and
keeps `manifest-caddy-data`, so the CA you trusted stays trusted.

### Proving it is really offline

*Run 2026-09-07. This is the control, and without it a build that succeeded because
the daemon had the image cached is indistinguishable from one that succeeded because
the mirroring worked — which is the mistake S1 made once, in the other direction,
with the npm registry.*

Removing the mirrored base image must make the build **fail**:

```bash
# `delete` is a SEPARATE registry action. The default token has pull and push only,
# and a DELETE without it answers 401 — leaving the image in place, the build
# succeeding, and the wrong conclusion drawn.
TOKEN=$(node infra/seed/mint-token.mjs --actions=pull,push,delete base/node)
curl -sS -X DELETE -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:7107/v2/base/node/manifests/sha256:1ef15d33…"   # -> 202
docker exec manifest-registry registry garbage-collect \
  --delete-untagged /etc/docker/registry/config.yml
make demo                                                          # -> MUST FAIL
```

Observed, and it is the right failure for the right reason:

```
ERROR: failed to solve: manifest-registry:5000/base/node@sha256:1ef15d33…:
failed to resolve source metadata … : not found
```

It does **not** fall back to Docker Hub, because §12 puts the builder on an
`--internal` network with no route off it — which `make verify` asserts as a named
negative control. Restore with no network at all, because the daemon still holds the
image:

```bash
docker restart manifest-registry        # see the warning below
bash infra/seed/mirror-images.sh
```

**Three things about this procedure, each of which silently does nothing if you get
it wrong**, and a control that quietly does nothing is worse than no control:

| | |
|---|---|
| The token needs `delete` | Without it the DELETE is **401** and the image is still there. |
| `REGISTRY_STORAGE_DELETE_ENABLED` must be `true` | It is, in `infra/compose.yaml`. Without it the DELETE is **405**. |
| `Accept` headers must be **separate `-H` flags** | This `registry:2` does not split a comma-joined list, and the mirrored base is an **OCI** manifest, so `-H 'Accept: application/vnd.oci.image.manifest.v1+json'` is the one that matters. Comma-joined, the registry answers **404** `OCI manifest found, but accept header does not support OCI manifests` — which reads exactly like "the image is missing". |

**And `registry garbage-collect` on a RUNNING registry corrupts it.** Upstream
requires the registry to be read-only or stopped during a GC; run live, it deletes
the manifest blob while leaving the tag and revision links pointing at it, and every
later `docker push` of the same content reports success with the right digest while
the registry keeps answering 404. Measured 2026-09-07. A `docker restart
manifest-registry` before re-mirroring is what clears it.

## If something is wrong

`make doctor` first. Every check in it corresponds to something that actually went
wrong during a spike or during P1's execution; none is hypothetical.

| Symptom | Cause |
|---|---|
| `curl: (6) Could not resolve host` **while `dig +short` returns the right address** | dnsmasq is missing `--local=/manifest.internal/`, so AAAA is answered with a hard error instead of NODATA and both musl and glibc fail the whole dual-stack lookup. Measured on dnsmasq 2.91: the status is `REFUSED` (S7 recorded `SERVFAIL`; the code varies, the symptom does not). |
| `bind: can't assign requested address` | The `127.0.0.2` alias is gone — a reboot removes it. `make up` re-adds it. |
| A container cannot resolve `manifest-postgres` | dnsmasq is missing `--server=127.0.0.11`, so `--no-resolv` made it authoritative for everything. |
| Node reaches the edge but `curl` does not, or vice versa | Trust is needed in **three** places, not two: the macOS keychain, container trust stores, and `NODE_EXTRA_CA_CERTS` for host Node processes. Without it Node gives `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` while `curl` on the same URL is fine. |
| A build fails on `failed to resolve source metadata` | The base image is not in the local registry. `make seed`. Pulling alone is not enough — BuildKit cannot see the daemon's cache. |
| `docker push` hangs | You used `localhost`. It resolves to `::1`. Use `127.0.0.1`. |
| The console streams nothing, with no error | `default-chat` is pointed at a *thinking* model. Its reasoning arrives as `reasoning_content`, which clients discard. Measured: 0 content frames and 472 reasoning frames from a 4B thinking model asked to count to five. Use a non-thinking model. |
| An embedding "works" but retrieval is nonsense | The caller omitted `encoding_format: 'float'` and got 192 zeros instead of 768 floats. LiteLLM's Ollama path ignores the parameter, so a client's base64 default decodes to rubbish. |
| The egress proxy 403s correctly but requests near it fail with `Empty reply from server` | tinyproxy exits after serving a denial unless `DefaultErrorFile` is set, and `restart: unless-stopped` hides it. `make verify` checks the restart count across a denial. |
| **Nothing** resolves — not `.test`, not `manifest.internal`, not `google.com` — while `nc -z 127.0.0.1 53` succeeds | Valet's dnsmasq is hung in `sendto` to an upstream nameserver. It is single-threaded, so one stuck send freezes everything it serves. `sudo launchctl kickstart -k system/homebrew.mxcl.dnsmasq`, then `sudo killall -HUP mDNSResponder`. Nothing to do with Manifest, which uses port 7153. |
| A service shows `unhealthy` while plainly working | Its healthcheck uses a binary the image does not ship. The LiteLLM image has no `curl`, `wget` or `nc` — only `python3`. |

## What this does to your machine

Three things, all reversible with `make host-undo`:

1. `/etc/resolver/manifest.internal` — scoped to our zone only, never all of
   `.internal`, which would break Docker's own `host.docker.internal`.
2. A `127.0.0.2` alias on `lo0`.
3. Caddy's CA root trusted in the System keychain.

**Laravel Valet is never touched.** It keeps `.test`, port 53, and `127.0.0.1:80`
and `:443`. Verified during P1's execution rather than assumed: Valet's config files
were unmodified (mtime 2026-07-03), its dnsmasq was the same process throughout, and
Manifest binds only `127.0.0.2:80/443`, `127.0.0.1:7119` and `127.0.0.1:7153` — never
53, never `127.0.0.1:80/443`. Its nginx still answers on `127.0.0.1:443`.

## C1's acceptance — what was actually run

**These are dated measurements, not current counts.** The check totals below are
what those commands reported *on 2026-09-05*; P3 has since added checks and the
current numbers are **`make doctor` 16 / 0 and `make verify` 34 / 0** (re-measured
2026-09-07). The evidence is left exactly as recorded — a run is a run — and this
note exists so nobody reads it as today's baseline.

**Offline: PASSED, 2026-09-05.** Wi-Fi disabled on `en0` (the machine's only
route), then `make down && make up && make doctor && MANIFEST_VERIFY_OFFLINE=1
make verify` via `scripts/offline-acceptance.sh`:

- `make up` — **0 failed**, every service Healthy, with no network. *This is the
  half no spike had ever tested*: S7 could not test offline at all, and S1
  evidenced only the build half, never the boot half.
- `make doctor` — 14 checks, 0 failed, 0 warnings.
- `make verify` — 33 checks, 0 failed, 0 warnings, including base images
  resolving from the local registry and `npm install` against the mirror.
- The C1 demo itself, host and container, no port and no `-k`:

  ```
  manifest OK host=console.manifest.internal scheme=https remote=10.89.0.1
  manifest OK host=console.manifest.internal scheme=https remote=10.89.0.8
  ```

Machine: macOS 26.6.2 (arm64), Docker Engine 29.7.2, Docker Compose v5.4.0,
Node 24.12.0, Ollama 0.33.3.

## Known gaps

**The second-machine test has NOT been run.** *Recorded 2026-09-05.* No second
Mac was available. So everything above is evidenced on **one machine only**, and
the clean-clone path — `git clone` into a directory that has never held this
project, on a Mac whose Docker has none of these images — is **unverified**.

The interesting case remains a second Mac **with Laravel Valet installed**, because
Valet owns `.test`, port 53 and ports 80/443, and that collision is why the zone is
`manifest.internal` and why the edge binds `127.0.0.2`. A machine without Valet
would only test the easy path.

Two smaller things this execution did not settle:

- ~~`make host-undo` has never been run end to end.~~ **Run and verified
  2026-09-05.** All three changes reversed cleanly — `/etc/resolver/manifest.internal`
  gone, no `127.0.0.2` on `lo0`, zero Caddy roots in the keychain — with Valet
  untouched and still serving, and the platform containers left running (they are
  `make down`'s job, not the host script's). It also exposed one defect: the script
  reported `Error 1` on a *successful* teardown, because its last command was a
  `grep -c` that exits 1 when it counts zero. Fixed — it now asserts each reversal
  and is idempotent. **The fix was then negative-controlled**, because a check that
  has only been seen passing is exactly what this execution kept finding: run
  against a host where all three changes *are* present, the assertions report
  `STILL PRESENT` three times and exit 1. Full cycle proven twice —
  `host-setup` → doctor 14/14 → `host-undo` → exit 0.
- **Valet's `.test` did not resolve during this session — diagnosed and fixed, and
  it was not a Manifest problem.** Valet's own dnsmasq had hung in `sendto` to an
  upstream nameserver; being single-threaded, that froze every lookup it served,
  `.test` included. Restarting it fixed it, with no configuration changed. The full
  diagnosis and the one-line fix are in `ORIENTATION.md` §4 under *Things that will
  cost you a morning*, because the symptom is deeply misleading: process alive,
  config correct, port open, nothing answers.
