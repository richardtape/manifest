# Running Manifest locally

Everything here is verified. If a step does not behave as described, that is a bug
in the platform, not in your machine — `make doctor` first, then open an issue with
its output.

**Just want to see it working?** [`WALKTHROUGH.md`](WALKTHROUGH.md) is the one-page version:
start it, deploy the demos, what to open in a browser and with which test users, and how
to check it. This file is the full operator's manual behind it.

## First time

```bash
git clone <repo> && cd manifest
make seed            # the only step needing network. Pulls images and models.
make host-setup      # three privileged steps. Prompts for a password twice.
export NODE_EXTRA_CA_CERTS="$PWD/infra/ca/manifest-root.crt"   # add to your profile
make up
make doctor && make verify
```

Then open <https://console.manifest.internal/>. No port, no certificate warning. It answers
`manifest console: not built yet` — that name is the console's and the API's origin (P5a Task 3);
the API is under `/v1`, reached once the control plane runs (README's *Running the control
plane*), and every other source than the host is refused.

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

And two acceptances: `make demo` (P3's — an app, from a bare repository to a URL) and
`make demo-identity` (P4a's — a real person, signed in with CWL, whose note nobody
else can see). Both are described below, and both need the control plane running.

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

Nine steps: **log in with CWL — a real three-hop SAML round trip against the Manifest
IdP, as `instructor`/`instructor`** (the dev shim it used to call is deleted) · create
the project (three environments and a
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
wrong during a spike, during P1's execution, or — the host-tool check — during P4a's;
none is hypothetical.

| Symptom | Cause |
|---|---|
| `curl: (6) Could not resolve host` **while `dig +short` returns the right address** | dnsmasq is missing `--local=/manifest.internal/`, so AAAA is answered with a hard error instead of NODATA and both musl and glibc fail the whole dual-stack lookup. Measured on dnsmasq 2.91: the status is `REFUSED` (S7 recorded `SERVFAIL`; the code varies, the symptom does not). |
| `bind: can't assign requested address` — **or, after a reboot, every host request to `*.manifest.internal` fails with `Failed to connect … port 443` while containers reach the edge** | The `127.0.0.2` alias is gone — a reboot removes it. `make up` re-adds it, **but if Docker Desktop started first it has already restarted Caddy without the alias, and it never retries that port forward**: `docker port manifest-caddy` prints nothing. Run `docker restart manifest-caddy`. See *Known gaps*. |
| A container cannot resolve `manifest-postgres` | dnsmasq is missing `--server=127.0.0.11`, so `--no-resolv` made it authoritative for everything. |
| Node reaches the edge but `curl` does not, or vice versa | Trust is needed in **three** places, not two: the macOS keychain, container trust stores, and `NODE_EXTRA_CA_CERTS` for host Node processes. Without it Node gives `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` while `curl` on the same URL is fine. |
| A build fails on `failed to resolve source metadata` | The base image is not in the local registry. `make seed`. Pulling alone is not enough — BuildKit cannot see the daemon's cache. |
| `docker push` hangs | You used `localhost`. It resolves to `::1`. Use `127.0.0.1`. |
| The console streams nothing, with no error | `default-chat` is pointed at a *thinking* model. Its reasoning arrives as `reasoning_content`, which clients discard. Measured: 0 content frames and 472 reasoning frames from a 4B thinking model asked to count to five. Use a non-thinking model. |
| An embedding "works" but retrieval is nonsense | The caller omitted `encoding_format: 'float'` and got 192 zeros instead of 768 floats. LiteLLM's Ollama path ignores the parameter, so a client's base64 default decodes to rubbish. |
| The egress proxy 403s correctly but requests near it fail with `Empty reply from server` | tinyproxy exits after serving a denial unless `DefaultErrorFile` is set, and `restart: unless-stopped` hides it. `make verify` checks the restart count across a denial. |
| **Nothing** resolves — not `.test`, not `manifest.internal`, not `google.com` — while `nc -z 127.0.0.1 53` succeeds | Valet's dnsmasq is hung in `sendto` to an upstream nameserver. It is single-threaded, so one stuck send freezes everything it serves. `sudo launchctl kickstart -k system/homebrew.mxcl.dnsmasq`, then `sudo killall -HUP mDNSResponder`. Nothing to do with Manifest, which uses port 7153. |
| A build fails with `unknown flag: --builder` | Not a buildx version problem. `runBuildxBuild` builds a throwaway `DOCKER_CONFIG`, and setting that moves CLI-plugin discovery with it, so buildx must be at `~/.docker/cli-plugins/docker-buildx` specifically. Installed anywhere else it passes `docker buildx version` and fails every build. `make doctor` asserts the symlinked path, not the command. |
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
what those commands reported *on 2026-09-05*; P3 and then P4a have since added checks,
and the current numbers are **`make doctor` 18 / 0 and `make verify` 51 / 0**
(re-measured 2026-09-16, P5a sitting 2). ORIENTATION §2's box is the maintained copy of those; if this
line disagrees with it, that box wins. **The offline acceptance has not been
re-run since 2026-09-05**, and P4a Task 15 owes it: it is Rich's to run, because
disabling Wi-Fi cuts an agent off too. The evidence is left exactly as recorded — a run is a run — and this
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

## `make demo-identity` — a real person, and data that stays theirs

*Added by P4a Task 15. First run green 2026-09-09, including from a `make reset`
machine.*

P3's `make demo` proves the platform can deploy an application. This one proves the
application knows **who** is using it. Same requirements: `make up`, the control plane
running, and a boot line saying `{"driver":"docker"}`.

```bash
make up
# ... start the control plane in another terminal, per README ...
make demo-identity
```

Nine steps: log in to **Manifest itself** with CWL (§9 — Manifest is its own Service
Provider) · create the project · push the `proof-app` starter
(`blueprints/node-ts-mongo/starters/proof-app`) **over `node-ts-mongo@1`'s skeleton**, the way an agent generates an application · validate · build, release,
deploy to staging · **sign in to the deployed app as `student`**, through the edge,
over TLS with the platform CA · write a note and read it back · **sign in as
`instructor` and do not show them the student's note** · **sign the student out, and sign the
instructor in through the same two cookie jars** — a shared lab machine. The proof app's third half —
a question answered — is `make demo-ai`'s, below. Both scripts assemble and deploy the
proof app through one shared `scripts/lib/proof-app.sh`, so they cannot disagree about
what the proof app is. The proof app declares `ai.models` and needs its AI half to
start, so this demo also needs LiteLLM up and the control plane's AI switched on.

**Step 8 is the whole point.** Steps 6 and 7 prove a login happened; only step 8 proves
the app can tell two people apart. It is checked in both directions — neither person
sees the other's note, and each reads back their own — because "the note is absent" is
also true of an application that returns nothing to anybody.

**Step 9 is what a browser does, and until 2026-09-16 it could not pass.** Signing out must land back on the
app, not on the IdP's `500 URL not allowed`; the app must forget the person (`/api/me` 401); and the IdP must
forget them too — its next answer to *Sign in* is a password form, not an assertion for the person who just
left. Each half was measured failing: the IdP trusted no app as a `ReturnTo`, and the app's `/auth/logout` —
which is also the SingleLogoutService the platform registers — treated the IdP's own `LogoutRequest` as a new
sign-out, so the two redirected into each other. `make verify`'s *the IdP signs an app's user out to the app,
and to nowhere else* holds the IdP's half without an app.

It is **re-runnable**: it reuses its project and makes each run's notes unique. Run it
twice. A first run that passes and a second that fails is a state leak, and that is
exactly what its own first version had.

`blueprints/node-ts-mongo/starters/proof-app/README.md` carries the attribute justifications UBC IAM will ask
for — `givenName` and `sn` are the two that are not pre-authorized.

## `make demo-journey` — P5a's acceptance, as it grows: §22 through the generated client

*Added by P5a sitting 5, 2026-09-16. It grows one step per P5a task and becomes the acceptance at Task 17.*

The control plane running, per README. It builds `@manifest/contract` and `packages/journey` from the checked-in
document, checks the control plane answers through the edge, signs the instructor in with CWL through
`infra/lib/idp-login.sh`, and runs the journey — a Node process calling `https://console.manifest.internal` through nothing but
the generated client, under `NODE_EXTRA_CA_CERTS`.

```bash
make up
# ... the control plane running, per README ...
make demo-journey           # ~1 minute; ends with `every check passed` and exit 0
```

Every check prints `ok` or `FAIL` and the run exits 1 listing each failure. **A journey that does not build stops at step 0 and
prints `tsc`'s errors** — the journey is type-checked against the generated contract, so a call or a field the contract does
not have stops it there. `FAIL no step threw — [cause UNABLE_TO_GET_ISSUER_CERT_LOCALLY] TypeError: fetch failed` is a journey
run without the platform CA. So far it runs §22 step 1 (`GET /v1/me`), step 2's list of the instructor's projects, step 2a's slug checks (`GET /v1/slugs/{slug}` for `console`, `chem`, `Journey_App` and `journey-app`), step 2b's catalogue and knowledge pack (`GET /v1/blueprints`), and step 2's creation: **it creates `journey-app` from `node-ts-mongo@1`'s `proof-app` starter, for a class, the first time, and reuses it after** — a project and a bare repository, no container. After `pnpm test` has emptied the tables it first removes `.manifest/repos/journey-app.git`, as the demos do for theirs (*Known gaps*).

## `make demo-redeploy` — P4c's acceptance: a redeploy nobody using the app notices

*Added by P4c sitting 1, 2026-09-15, before the feature it tests. Green since sitting 7, and P4c's
acceptance since sitting 8 — both 2026-09-16.*

Same requirements as `make demo-ai` — the control plane running, Ollama on the host. It deploys the
proof app, signs a student in, starts two loops through the edge — a health request every 200 ms and
questions asked back to back — and then redeploys **the same release**, **a new release**, and **a
release that never becomes ready**, asserting on every request and question in each window.

```bash
make up
# ... the control plane running, per README ...
make demo-redeploy          # ~3 minutes; ends with Done. and exit 0
```

**Twenty-four assertions, all green**: no 5xx and no wildcard page in any redeploy window, every
question answered 200 **by an instance** (the edge's wildcard answers 200 too, with no
`X-Manifest-Instance`), **nobody signed out**, the edge naming the new instance, each replaced
instance retired within 150 s with exactly one app container, no orphan `-files` volume and one
LiteLLM key left; in each of the two redeploys that move the route, **a question in flight at the
move answered 200 by the instance the route moved away from**; and a release that never becomes
ready recorded `failed` with an Incident, **every request in its window answered by the instance
that was serving**. It was written first and ran red — **ten of twenty-one** — and P4c's sitting 8
ran it green three times, once from a `make reset` machine, and watched its nine negative controls.
**Four of those nine cannot fail here, and it is worth knowing which**: a delete-then-insert route
move (a millisecond gap under 200 ms sampling — `routes.docker.test.ts` sees it), a drain of 1 ms
(the deploy call itself outlasts the question a move leaves behind — the Docker tier's driver
contract sees it), revoking the old key at promotion (a unit test in `releases.test.ts` sees it)
and removing both serving guards (nothing in a run makes a retire find nothing serving — the driver
contract and `retire.test.ts` see it). The summary's per-phase `inFlightAtRetire` says whether the
drain held a question in that run; it usually did not. The baseline and every run are in
[`plans/2026-09-15-p4c-zero-downtime-redeploys.md`](plans/2026-09-15-p4c-zero-downtime-redeploys.md)'s
*What executing this plan found* and `spikes/p4c-baseline/`. It leaves the app deployed. **A red run
keeps its raw output** and prints the directory; a green one deletes it.

## `make demo-ai` — the proof app answers a question, charged to one person

*Added by P4b Task 16, 2026-09-15. §16's proof app is complete with it.*

Same requirements as `make demo-identity`, plus **Ollama running on the host** with
`ministral-3` and `nomic-embed-text` — it is a host application, not a container, so
`make up` does not start it, and LiteLLM reaches it at `host.docker.internal:11434`.

```bash
make up
# ... the control plane running, per README; its boot line must say "ai":"enabled" ...
make demo-ai
```

Nine steps, and every assertion is on the shape of the answer rather than its arrival:

1. log in to Manifest with CWL, and create or reuse the `proof-app` project;
2. **subscribe to `WS /v1/projects/:projectId/events` before anything is built** — with
   `scripts/lib/event-stream.mjs`, a dependency-free Node program, because a shell
   cannot speak WebSocket;
3. push, validate, build, release and deploy;
4. **the stream carried this deploy in order** — `build.started`, `build.succeeded`,
   `sso.registered`, `instance.healthy`, `ai.key_rotated` — and every build-log line
   it streamed is exactly a line the build stored, in order;
5. a student and an instructor sign in and each write a note — the instructor's
   written to be the *closer* match for the question;
6. **the student asks a question**: a non-empty answer, from a streamed completion,
   using a 768-dimension embedding to choose context, and the context is one of the
   student's own notes and **never the instructor's**;
7. the instructor asks the same question, the other way round;
8. **LiteLLM's own spend log** holds a chat row and an embedding row for each person,
   each charged to `sha256(puid ‖ project ‖ environment)` through this app's LiteLLM
   user — and nothing charged to a bare PUID hash or a raw PUID. It reads the log with
   `LITELLM_MASTER_KEY` from `.env`, which is why it is an operator's check.

**If it fails at step 6 with `AI_BACKEND_UNAVAILABLE`**, the app cannot reach
`manifest-litellm` on its own network — check `docker network inspect
mf-proof-app-staging-net` lists it. **`AI_EMPTY_ANSWER`** is S3's thinking-model failure:
the model streamed no text. **A dimension of 192** is S3's silent embedding failure, an
`embed()` without `encoding_format: 'float'`.

It is re-runnable and every run redeploys. Since P4c the previous release's container is
drained and removed behind each redeploy, so a re-run leaves one app container, not two.

## Watching a project's event stream

**`WS /v1/projects/:projectId/events`** is D23.2's one stream per project (P4b Tasks 14–15, 2026-09-15): builds, each build-log line as it is written, instance state, incidents, §9's SSO registrations and §10's AI key rotations. There is no polling API for any of it.

- **It needs a WebSocket client and a Manifest session.** `curl` cannot speak it: a plain GET from a member answers `426 Upgrade Required` with `Upgrade: websocket`, a stranger `404`, nobody `401` — which is also the quick way to check the route is up. The session is the `manifest_session` cookie a CWL login sets, sent with the upgrade request.
- **A connection is replayed first.** It receives the project's newest 50 events, oldest first, then `{"kind":"control","type":"manifest.stream.ready"}`, then live frames — anything before the ready frame had already happened. Build-log lines are **not** replayed; `GET /v1/builds/:buildId/logs` has them.
- **A client that falls behind is closed with 1013** once a megabyte is queued for it, and should reconnect; the replay covers the events it missed.
- **It is reached through the edge, at `wss://console.manifest.internal/v1/projects/:projectId/events`** (P5a Task 3), and **the upgrade must carry `Origin: https://console.manifest.internal`** (P5a Task 4) — one carrying a session from any other origin, or from none, is refused `403` before it opens, which a WebSocket client sees as an error and close `1006`, not as a status. `scripts/lib/event-stream.mjs` sets it. A Node client needs `NODE_EXTRA_CA_CERTS` — Node does not read the keychain. **Every edge admin change is a whole-config reload, and a reload closes every WebSocket it proxied with `1001`** unless the handler sets `stream_close_delay`; the console site sets an hour, so a deploy anywhere on the platform no longer disconnects a subscriber, but a stream older than an hour past a reload is closed with `1001` and should reconnect.
- **Frames reach only sockets on the control plane that published them.** Restarting the control plane drops every connection; a reconnect is replayed the events, and a build that was running has its lines in its build log.
- **Authorization is checked when the socket opens, not per frame** — removing someone from a project does not close a stream they already hold.

## Known gaps

**The second-machine test has NOT been run.** *Recorded 2026-09-05.* No second
Mac was available. So everything above is evidenced on **one machine only**, and
the clean-clone path — `git clone` into a directory that has never held this
project, on a Mac whose Docker has none of these images — is **unverified**.

The interesting case remains a second Mac **with Laravel Valet installed**, because
Valet owns `.test`, port 53 and ports 80/443, and that collision is why the zone is
`manifest.internal` and why the edge binds `127.0.0.2`. A machine without Valet
would only test the easy path.

**`make up` does not recover the edge after a reboot.** *Measured 2026-09-14, Docker
Engine 29.7.2, macOS 26.6.2.* Starting Docker Desktop restarted `manifest-caddy` itself
(`restart: unless-stopped`) **2.6 s after its engine came up**, before `make up` had
re-added the alias. The port forward failed — `listen tcp4 127.0.0.2:443: bind: can't
assign requested address`, in
`~/Library/Containers/com.docker.docker/Data/log/host/com.docker.backend.log` — and
Docker Desktop never retries one, so **all three** of Caddy's host ports stayed
unpublished, including `127.0.0.1:7119`, whose address was never missing. `make up`
then added the alias, found Caddy running and unchanged, left it alone and printed
`platform up`: Caddy's health check runs inside the container, so `--wait` saw it
healthy. `make doctor` reported 18/0 with one warning that blamed CA trust for what was
an `ECONNREFUSED`. **`make verify` was the only gate that saw it** — 9 failed, every one
a host→edge check, while every container→edge check passed.

**Workaround:** `docker restart manifest-caddy`. It is safe: Caddy reads its Caddyfile at
start, and the control plane re-applies runtime routes. Measured: all three ports
published, `https://console.manifest.internal/` → 200 from the host, doctor 18/0 with
no warnings, verify 47/0.

**Not fixed yet.** The fix belongs in `make up`, and it should read state rather than
infer it: after `compose up`, assert the host can connect to `127.0.0.2:443` and
`127.0.0.1:7119`, restart Caddy once if not, and fail loudly if still not. Restarting
Caddy only when `ensure-alias.sh` itself added the alias would miss an alias added by
`make seed` or by hand. Its negative control needs the alias removed, which is `sudo`.

**`make seed` can die at step 2 when Docker Desktop's credential helper hangs.** *Measured
2026-09-14, Docker Engine 29.7.2.* Twice in a row, step 2 (`$COMPOSE build`) failed with
`load metadata for docker.io/library/php:8.3-apache … DeadlineExceeded: context deadline
exceeded` — `caddy:2.11.4` and `composer:2` the same — while `curl` reached Docker Hub in 0.3 s
from the host and from inside the Docker VM, with 100 of 100 anonymous pulls left. BuildKit asks
`docker-credential-desktop` for Docker Hub credentials and curl does not, and that helper was
hanging:

```bash
echo https://index.docker.io/v1/ | gtimeout 20 docker-credential-desktop get >/dev/null
echo $?    # 124 is the hang; 0 or a quick non-zero is a working helper
```

Seed stops there, **before step 4b's npm warm, which needs no Docker Hub at all**, and every
hung call leaves a `docker-credential-desktop get` process behind, parented to launchd —
`pgrep -fl 'docker-credential-desktop get'`, and kill the ones you started.

**Workaround, when the platform images already exist:** run the warm step on its own, taken
verbatim out of `seed.sh` so it is the real mechanism rather than a copy, and let `make verify`
say whether it worked — seed's own output cannot (see *C1's acceptance*'s note on the mirror):

```bash
sed -n '/^echo "4b\/6/,/^done$/p' infra/seed/seed.sh > /tmp/warm.sh
bash -c 'set -euo pipefail; . infra/lib/common.sh; set -a; . ./.env; set +a; . /tmp/warm.sh'
make verify    # "… pinned tarballs across every blueprint and fixture lockfile; 0 missing"
```

**Restarting Docker Desktop cleared it** (2026-09-14): afterwards the helper answered in under a
second and `docker buildx imagetools inspect php:8.3-apache` in 1 s, and the platform came back with
`make doctor` 18/0, `make verify` 47/0 and all four pre-existing containers present. A restart
restarts every container on the machine, so it is a person's call rather than a script's.

**A Mongo service could be reported ready before it accepted the app's credentials — FIXED 2026-09-15, except in containers created before the fix.** *Measured 2026-09-14, `mongodb/mongodb-community-server:7.0.28-ubi8`.* The catalogue's health test was a loopback `ping`, which the image's init `mongod` — on `127.0.0.1`, with no authentication — answers while it creates the user, so a service was reported healthy at 9.6 s while an authenticated write from another container was refused until 33.8 s. P4b's sitting 8 replaced the check with one that passes only once authentication is enforced, runs it every second while the service starts and every 30 s after, and forces the race in the Docker tier with a 20 s init script (P4b findings 133 and 134).

**What it leaves behind: a service container created before the fix keeps its old check**, because nothing recreates an existing service — the demo databases `mf-fixture-app-staging-db` and `mf-proof-app-staging-db` on the machine this was fixed on, for example. If a deploy onto such a database finds its first write refused, redeploy; or remove the container — `docker rm -f -v <name>`, where `-v` removes only its anonymous volumes and never the named `-data` volume its data lives in — so the next deploy recreates it with the new check. The image does not re-run its initialisation over a data directory that already has one.

**Two things P4a Task 15 left open, both named rather than glossed.**

- **THE OFFLINE ACCEPTANCE OF `make demo-identity` HAS NOT BEEN RUN.** *Recorded
  2026-09-09.* It is Rich's to run, because turning the network off from an agent's
  tool call cuts the agent off too. `scripts/offline-acceptance.sh` gained a step 6
  that runs it, and it is **the step most likely to need a route out**: it builds an
  image from `node-ts-mongo@1`'s five app-side dependencies through Verdaccio *and*
  completes a full SAML round trip. It needs the control plane running and reports
  SKIPPED rather than failing when it is not — **and a skipped acceptance is not a
  passed one.** Everything else about Task 15 is evidenced, including a run from a
  `make reset` machine. **P4b's Task 16 appended a step 7, `make demo-ai`** (2026-09-15),
  equally unrun offline; its open question is whether **Ollama** — a host application,
  not a container — answers with the network off.
- **A redeploy no longer 502s the app or signs anyone out — for apps on the current blueprint.**
  *The baseline, measured 2026-09-15 under a request loop classified by body:* a same-release
  redeploy produced **7 empty 502s between +428 ms and +1,634 ms**, a new-release redeploy 6, and in
  both the first request to the new container answered **401**, because the blueprint kept sessions
  in the container's memory. **P4c fixed both.** Since sitting 3 the new container starts beside the
  one serving, is proved ready from inside the edge, and only then takes the route with one in-place
  `PATCH`; since sitting 7 (2026-09-16) `node-ts-mongo@1` keeps sessions in the app's own Mongo
  (`skeleton/auth/session.js`). `make demo-redeploy` is **24 of 24 green**, run three times on
  2026-09-16 and once from a `make reset` machine: nobody signed out, every question answered by an
  instance, every request in every redeploy window answered by the app. **Three limits remain, all
  deliberate** (the plan's *What this plan does not build*): **an app generated from the skeleton
  BEFORE 2026-09-16 still keeps sessions in memory** and signs everyone out until it mounts
  `sessionMiddleware(client)` from `auth/session.js`; **a sign-in under way at the IdP when the
  route moves fails once**, because `passport-ubcshib` keeps its SAML request ids in memory; and an
  edge configuration reload can reset about one connection in 300 (R1). **Do not "clean up" an
  instance through the driver's `destroyInstance`:** it removes the route by hostname, which the live
  instance shares.
- **CLOSED 2026-09-16 (P4c): redeploys used to leave the PREVIOUS release's container running.** *Measured
  2026-09-09:* eleven deploys of one app in one session produced eleven
  `mf-proof-app-staging-*-app` containers, all `Up` and healthy, each holding its full
  cpu/memory/pids allocation, with only one carrying the route. `deployRelease` calls
  `ensureInstance` and nothing destroyed what the last release left. **Since P4c sitting 6
  (2026-09-15) a redeploy through the control plane retires what it replaced**: the old instance
  drains until the edge holds nothing in flight to it (at most `MANIFEST_DRAIN_TIMEOUT_MS`,
  120 s), and is then removed with its `-files` volume and its AI key — and the first P4c redeploy
  of an app reaps every older container it left too (R7). What is still not reaped: anything a
  crashed control plane left for an app nobody redeploys, and containers the Docker tier's tests
  leave. Fleet-wide reaping belongs to §11's reconciliation loop, which is Phase 4 (D10). **P4c's
  Task 11 closed this entry for every redeploy from here on**: `make demo-redeploy` asserts exactly
  one app container and no orphan `-files` volume after each redeploy, and a control with the
  retire unscheduled left four. A container from before P4c is reaped by the next redeploy of its
  app (R7), and one a redeploy failed to retire by that or by the next control-plane boot —
  measured 2026-09-16, when a boot reaped the three that control had left. **For anything older
  or stranded** — and `-v` removes a container's
  ANONYMOUS volumes only, so each instance's named `-files` volume has to go by name:

  ```bash
  # Every mf- app container EXCEPT the one the route points at. Check first, and name
  # each one explicitly — repeated `docker ps --filter name=` flags are OR'd, not AND'd:
  docker ps --format '{{.Names}}' | grep -- '-app$'
  docker rm -f -v <each older one, by name>
  # AND its files volume. It is NAMED, so `-v` leaves it — and it holds that instance's
  # copy of the app's SAML private key (P4b finding 194, measured 2026-09-15):
  docker volume rm <each older one>-files
  ```

  `make reset` clears them all, at the cost of every project's data.
- **An AI app whose gateway disappears from its network waits ten minutes for an answer.**
  *Measured 2026-09-15 (P4b sitting 10), `ubc-genai-toolkit-llm` 0.7.0:* with
  `manifest-litellm` detached from the proof app's network, a question hung **611 s** and
  then answered `502`. The OpenAI SDK under the toolkit reuses a kept-alive socket, which
  retransmits to an address nobody holds until the SDK's own 600 s timeout, and the toolkit
  offers no way to shorten it. With no pooled socket the same failure answers
  `503 AI_BACKEND_UNAVAILABLE` in 16 s. **Anything that removes the gateway from app
  networks** — recreating the `manifest-litellm` container is the likely one — cuts every AI
  app off until it is redeployed. **Workaround:** redeploy the app, which re-attaches the
  gateway; or `docker network connect mf-<slug>-<env>-net manifest-litellm`.
- **`pnpm test` leaves live AI keys behind.** *Measured 2026-09-15.* Its setup empties the
  control plane's tables and touches nothing in LiteLLM, so every project it removes keeps
  its LiteLLM user and its confined, budgeted key — and any container still running keeps
  using it. `make reset` does clear them, because LiteLLM's database is in the Postgres
  volume it destroys. **Check:** the `/user/list` call in `make demo-ai`'s section above
  lists `mf-` users; one whose project UUID is no longer in `projects` is an orphan.
- **After `pnpm test` or `make reset`, `.manifest/repos` still holds each demo's repository,
  and its project is gone.** *Measured 2026-09-15; changed 2026-09-16 (P5a Task 11).* Neither
  removes the bare source repositories, so creating the project again finds the slug's old
  repository and answers `SOURCE_GIT_FAILED` — with git's raw output. Since P5a Task 11 that
  creation leaves NO project behind (it used to leave the row, which the demos then reused), so
  **every demo and `make demo-journey` first remove their own slug's repository when
  `GET /v1/slugs/{slug}` says no project holds the name** — `clear_orphan_repository` in
  `scripts/lib/api.sh`, which prints the path it removed. A `POST /v1/projects` of your own
  for such a slug still answers `SOURCE_GIT_FAILED`: move `.manifest/repos/<slug>.git` aside
  first.
- **After `pnpm test:docker`, a demo that was deployed is no longer reachable.** *Measured
  2026-09-15.* `routes.docker.test.ts` restarts `manifest-caddy`, which drops every runtime
  route, and the tier empties the tables the control plane would re-apply them from — so each
  demo hostname answers the edge's wildcard page, `manifest OK host=…`, **with status 200**,
  while the app's containers stay up and healthy. **Read the body, not the status.** Re-run
  `make demo`, `make demo-identity` or `make demo-ai` to deploy it again.
  **Since P4c Task 9, RESTARTING THE CONTROL PLANE re-applies the routes** — `recoverAtBoot`
  does it before the server listens, and the boot line says how many it restored. That only
  helps for an app with a §6 `Route` record, and `pnpm test` truncates the table those live in,
  so after a *unit* run there is nothing to restore and the demo has to be deployed again. An
  app deployed before P4c has no record either, deliberately: there is no backfill, and it gets
  one at its next deploy.

Two smaller things P1's execution did not settle:

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
