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
`host-setup` trusts. Seed also adds the loopback aliases itself, so Caddy can bind
80/443 the first time — that is what removes S7's run-the-script-twice dance.

## Every day

```bash
make up        # re-adds the 127.0.0.2 and 127.0.0.3 aliases if a reboot removed them
make down      # stops everything, including the profiled builder
```

## The four verbs

| | |
|---|---|
| `make seed` | The only step that needs network. Pulls and **pushes** base images into the local registry, warms the npm mirror, mints the CA, pulls the Ollama models. |
| `make up` | Boots the platform and waits for every healthcheck. Re-adds **both** loopback aliases, prompting for `sudo` **only** when one is genuinely missing. |
| `make down` | Stops everything. Data, the seed cache and the CA all survive. |
| `make reset` | Destroys project data, the databases and the registry's contents. **Keeps** the Caddy CA, the npm mirror cache, `infra/images.lock` and the Ollama models, and re-pushes the base images from the local daemon — so the machine stays offline-capable. |

Plus `make doctor` (*can this machine run the platform?* — works with nothing up) and
`make verify` (*is the running platform correct?* — needs `make up` first).

And two acceptances: `make demo` (P3's — an app, from a bare repository to a URL) and
`make demo-identity` (P4a's — a real person, signed in with CWL, whose note nobody
else can see). Both are described below, and both need the control plane running.

## Running the reference console

*Added by P5c sitting 3, 2026-09-18 (Task 4). D22's reference console — the executable
proof that the public API is complete and sufficient. It is not the product.*

It is a plain React + Vite client (`packages/console`) run as a **host process on 7104**,
exactly where §21's inventory puts it. The edge forwards everything that is not `/v1/*` or
`/auth/*` to it, so the console and the API are **one origin**.

```bash
make up
# ... the control plane running, per README's "Running the control plane" ...
pnpm --filter @manifest/contract build      # the console BUNDLES dist/, and typechecks src/
pnpm --filter @manifest/console dev         # or `preview`, after `pnpm --filter @manifest/console build`
open https://console.manifest.internal/
```

**Reach it at `https://console.manifest.internal` and NEVER at `127.0.0.1:7104`.** The
second address serves the same bytes and is a trap, and what it actually does is worth
knowing because it is not a refusal — **measured 2026-09-18**: on 7104 there is no edge
and no control plane, so **Vite answers `GET /v1/me` itself with `index.html` and `200`**
(its SPA fallback) and a `POST /auth/logout` with `404`. The console then fails on
`SyntaxError: Unexpected token '<' … is not valid JSON` — visible, at least, because
`<Refusal>` renders a non-`ManifestApiError` too. Sign-in cannot work there either: the
control plane's SAML ACS is registered at the console's origin, so the assertion never
comes back to where the sign-in started. `403 CSRF_ORIGIN_REFUSED` (§20, P5a Task 4) is
what a console served from some *other* origin that CAN reach the API would get; it is not
what 7104 gives you.

**Build the contract first, every time.** `packages/contract`'s `exports` map is
conditional — `"types": "./src/index.ts"`, `"default": "./dist/index.js"` — so `tsc`
reads the SOURCE and Vite bundles `dist/`. A stale `dist/` ships with every gate green
(P5c sitting 1, F3).

| What you see | What it is |
|---|---|
| `502` at `/` | Nothing is listening on 7104. The edge is fine; start the console. |
| `manifest OK host=… scheme=https` | The request never reached the console site at all — it was answered by the wildcard. **Read the body, never the status.** |
| *Blocked request. This host is not allowed.* | `vite.config.ts` lost `allowedHosts`. The edge **preserves** `Host: console.manifest.internal` rather than rewriting it (P5c sitting 1, M1). |
| The sign-in screen when you were signed in | `GET /v1/me` answered `401`. `pnpm test` truncates `users` on every run, and a restart of the control plane does not restore a session. |

`dev` gives HMR (its socket goes through the edge as `wss://console.manifest.internal`,
measured in P5c sitting 1's M3); `preview` serves the production build and is what the
acceptance uses. **Vite RELOADS THE PAGE when that socket drops**, which matters more than it
sounds: until P6a sitting 10 every deploy on the platform dropped it (a route change reloads
the edge's whole config), so pressing *Run the rehearsal* under `dev` lost its own answer to
the rehearsal's production deploy. The Caddyfile's console proxy now carries
`stream_close_delay`, measured both ways — but `make demo-journey` still reloads a `dev` page,
by rebuilding `@manifest/contract`, and an edge restart still cuts everything. **Click an
acceptance under `preview`**, which holds no socket. Either way **stop it by port** when you are done —
`lsof -nP -iTCP:7104 -sTCP:LISTEN -t | xargs kill` — because each shell is its own and
`kill %1` has no job table to read.

## Running `manifest-mock`

*Added by P5c sitting 8, 2026-09-19 (Task 12). §21: "front-end developers are not
required to run the platform" — one process, not nine containers plus a language model.*

`packages/mock` serves the **published contract** from hand-written fixtures, with a
scripted WebSocket stream. It needs no Docker, no Postgres, no Ollama and no control
plane.

```bash
pnpm --filter @manifest/mock dev            # builds, then listens on 127.0.0.1:7102
MANIFEST_MOCK=1 pnpm --filter @manifest/console dev
open http://127.0.0.1:7104/                 # THE ONE TIME 7104 IS THE RIGHT ADDRESS
```

**This is the only configuration in which the console is reached at `127.0.0.1:7104`.**
There is no edge, no control plane, no IdP and no CSRF origin to satisfy, so the trap the
section above describes does not apply: `MANIFEST_MOCK=1` makes `vite.config.ts` proxy
`/v1` and `/auth` (and the stream's upgrade, `ws: true`) to 7102. *Sign in with CWL* sets
a fake cookie and comes straight back — a mock that made a person sign in would defeat its
own purpose.

| Variable | Default | What it changes |
|---|---|---|
| `MANIFEST_MOCK_PORT` | `7102` | Where it listens |
| `MANIFEST_MOCK_ROLE` | `member` | `admin` makes §26's fleet answer `200` instead of `403 FORBIDDEN` |
| `MANIFEST_MOCK_FAIL` | unset | `1` plays the deploy's other ending: `instance.failed` + `incident.opened` |
| `MANIFEST_MOCK_SCAN_MS` | `10000` | §12's silent scan window (below). Shorten it in a test |

**What the scripted stream does, and why each part is there.** On subscribe it replays the
three events every project already has (`project.created`, `repository.seeded`,
`spec.validated`), sends the **control frame** — which is the only thing `subscribe`'s
`ready` resolves on — and then plays a build and a deploy on a timer:
`build.started` → twenty log lines 150 ms apart → **ten seconds of silence** →
`build.succeeded` → `instance.provisioning` → `sso.registered` → `instance.starting` →
`instance.healthy`.

**Those ten seconds are the point.** §12's scan runs inside `driver.buildImage` after
BuildKit returns and emits nothing at all, so on the real platform the log's last word is
`DONE` while the build row is still `running` with no digest — measured at 11.29 s and
9.70 s (P5c sitting 6, F12), and a person who pressed *Release* in that window got
`409 RELEASE_BUILD_NOT_DEPLOYABLE`. The mock's `GET /v1/builds/{id}` answers `running`
for exactly that window too, so a client developed here meets the trap before a faculty
member does. **Log frames are never replayed**, exactly as the platform never replays
them: a screen opened mid-build must also read `GET /v1/builds/{id}/logs`.

**What it does NOT prove.** A green run against the mock is never evidence about the
platform (the P5 brief's §8). Specifically:

- **Its fixtures are hand-written.** They are held honest by three things and by nothing
  else: `tsc` against the generated types, **Ajv against `openapi.json` on its 2020-12
  dialect** (`validate.test.ts`, and every response is validated again on its way out, so
  a body that does not match its schema is a `500` naming the schema), and
  `packages/console/src/api.test.ts`, which drives the console's whole data layer against
  it. A field the platform sends and no fixture carries is invisible here.
- **It does not enforce §20's CSRF origin check.** A browser reaching it through Vite's
  proxy sends `Origin: http://127.0.0.1:7104`, and the platform wants the console's own
  origin — so enforcing it would refuse every mutation the mock exists to let you make.
  It **does** enforce the credential rules, `Idempotency-Key` (`400
  IDEMPOTENCY_KEY_REQUIRED` under eight characters, `409 IDEMPOTENCY_KEY_REUSED` for a key
  replayed with a different body) and the fleet's `403`.
- **It has no state.** Every read answers a fixture; a mutation does not change what the
  next read returns. It is a contract mock, not a simulator.
- **It does not know §23’s reserved labels, and it answers as though they were free.**
  `checkSlug` treats the one slug its fixtures already use as taken and *everything else* as
  available, so `edge` — which `infra/reserved-labels/labels.yaml` reserves as "Manifest’s
  edge proxy" — reads **`edge is available`** here and is refused by the platform. The
  contract declares three refusal codes (`SLUG_INVALID`, `SLUG_RESERVED`, `SLUG_TAKEN`) and
  the fixtures carry **one**, so the console’s rendering of the other two is exercised by
  nothing. Measured in a browser, P5c sitting 9 (F9): it is the second half of the clicked
  journey’s row 3, and the mock cannot show it.
- An operation the document declares and the mock has no answer for is **`501`** — the
  contract has grown a route the mock has not caught up with. A path the document does not
  declare is `404 ROUTE_NOT_FOUND`, exactly as the platform answers it.

**Stop it by port** when you are done —
`lsof -nP -iTCP:7102 -sTCP:LISTEN -t | xargs kill`.

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
2. **Two** aliases on `lo0`: `127.0.0.2` and, since P6a, `127.0.0.3`.
3. Caddy's CA root trusted in the System keychain.

### The second address, `127.0.0.3` (P6a, R3)

§12 splits the edge into two listeners, and **a second address is what makes that real
on this machine**. `127.0.0.2` carries the internal listener — staging, sandbox, the
console and the IdP — and **`127.0.0.3` carries the public one, which serves the
production zone and nothing else**. The two are separate Caddy *servers*, `srv0` and
`srv1`, inside the one `manifest-caddy` container, so there is still exactly one
`caddy-data` volume and one internal CA.

**Why an address rather than a port:** the faculty-facing URL has to stay
`https://<slug>.manifest.internal` with no port, or the byte-for-byte host/container
hostname parity §9 needs is broken — `infra/compose.yaml` refuses a port in that URL in
its own words.

**FROM A CONTAINER IT IS A PORT, AND THAT IS NOT A CONTRADICTION** (P6a Task 4,
Decision 15). `manifest-dns-containers` answers the edge's single address, `10.89.0.10`,
for the whole zone, so a container cannot pick a server by address the way the host does
— it picks one by port: **`:443` is `srv0` and `:8443` is `srv1`**. The readiness probe
runs from a container (a host process cannot reach a container address on Docker
Desktop), so a PRODUCTION deploy's probe is the one thing that carries a port:
`MANIFEST_EDGE_PUBLIC_PORT`, default **8443**, which `make verify` holds equal to the
container-side half of compose's `127.0.0.3:443:8443`. Nothing a person types ever
carries it.

**If a production deploy hangs for about fifteen seconds and then rolls its route
back**, that port is the first thing to check. The message it prints is
`the edge answered 200 with no X-Manifest-Instance … that is the edge's wildcard, not a
routed app` — which names the wildcard and says nothing about a port, because the probe
reached `srv0` and found no route there.

**The zones are nested and production is the parent.** `manifest.internal` *contains*
`staging.`, `sandbox.`, `console.`, `idp.` and `edge.`, so `dns-host` pins those five
back to `127.0.0.2` with more-specific `--address=` rules. Without the pin-backs the
console and the IdP move to the public address and the console goes down. `make doctor`
checks both directions of this — that a production name answers `127.0.0.3` **and** that
the console does not.

**Adding it needs `sudo` once:**

```bash
sudo bash infra/host/p6a-second-address.sh
```

It is additive, it does not touch Valet, and after that `make up` re-adds both aliases
on every start because neither survives a reboot. **`make host-undo` removes both and
asserts both removals.**

**Laravel Valet is never touched.** It keeps `.test`, port 53, and `127.0.0.1:80`
and `:443`. Verified during P1's execution rather than assumed: Valet's config files
were unmodified (mtime 2026-07-03), its dnsmasq was the same process throughout, and
Manifest binds only `127.0.0.2:80/443`, `127.0.0.3:443`, `127.0.0.1:7119` and
`127.0.0.1:7153` — never 53, never `127.0.0.1:80/443`. Its nginx still answers on
`127.0.0.1:443`.

## C1's acceptance — what was actually run

**These are dated measurements, not current counts.** The check totals below are
what those commands reported *on 2026-09-05*; P3 and then P4a have since added checks,
and the current numbers are **`make doctor` 19 / 0 and `make verify` 55 / 0**
(**All four were re-measured at the close of P6b sitting 4, 2026-09-23: `pnpm test` **1662 passed** in 122 files (up from 1651), `make doctor` 19 with **0 warnings** — the vulnerability database goes stale again after 2026-09-30 — `make verify` 55, and `pnpm test:docker` **198 in 31, all passed**.** This parenthetical states only the LATEST sitting — it had grown to 6 KB of per-sitting history before sitting 8 replaced it, and every sitting's numbers are in its own plan record, dated.) ORIENTATION §2's box is the maintained copy of those; if this
line disagrees with it, that box wins. **The offline acceptance has not been
re-run since 2026-09-05**, and P4a Task 15 owes it: it is Rich's to run, because
disabling Wi-Fi cuts an agent off too. **It now has ELEVEN steps** — P5a sitting 12 added `make demo-journey` as step 8,
P5b sitting 9 added `make demo-token` as step 9, P5c sitting 9 added the console's
preflight as step 10 (2026-09-19), and P6a sitting 11 added `make demo-production` as step 11
(2026-09-22) — whose approval summary may legitimately read `unavailable` offline, which is
Decision 7 working, not a failure — all guarded by the same control-plane check as steps 6
and 7. The evidence is left exactly as recorded — a run is a run — and this
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
run without the platform CA. So far it runs §22 step 1 (`GET /v1/me`), step 2's list of the instructor's projects, step 2a's slug checks (`GET /v1/slugs/{slug}` for `console`, `chem`, `Journey_App` and `journey-app`), step 2b's catalogue and knowledge pack (`GET /v1/blueprints`), and step 2's creation: **it creates `journey-app` from `node-ts-mongo@1`'s `proof-app` starter, for a class, the first time, and reuses it after** — a project and a bare repository, no container. Step 3 subscribes to the project's event stream through the edge (`subscribe` in `@manifest/contract`, with the session and the console's `Origin` on the upgrade) and checks the replay carries `project.created`, `repository.seeded` and `spec.validated` in order, then the ready frame; `FAIL the stream became ready — the event stream closed before it was ready (1006)` is an upgrade the control plane refused. **Step 4 builds `journey-app`** (P5a Task 13): subscribed first, it starts a build, checks the answer came back `running` at once (R6), waits on the stream for that build's `build.succeeded` or `build.failed` — up to 960 s, past the builder's own 900 s bound — checks its log lines arrived before its end, and reads `GET /v1/builds/{buildId}` for a digest and a scan by `anchore/grype`. It prints how long the build took and what the scan said. **Step 5 releases that build and deploys it to staging** (P5a Task 14): it checks the release carries the build's digest and a real scan and names its env vars **without their values** (`COURSE_CODE`, never `CHEM_121`), reads the release back and lists the project's releases, then subscribes and deploys — the instance must be `healthy`, must carry no `driver` or `handle`, and the stream must have carried `instance.provisioning`, `instance.starting` and `instance.healthy` **in that order**. **Step 6 leaves the contract and enters the deployed app** (Decision 38): `idp_login` signs the instructor in at `journey-app.staging.manifest.internal` with CWL, writes a note through the app's own `/api/notes`, and asks `/api/ask` a question the note answers — checking the reply came back embedded in 768 dimensions (S3's silent failure). **Step 7 asks for production** (P5a Task 15): the deploy is refused `409 RELEASE_PRODUCTION_GATE_UNAVAILABLE`, the refusal carries §13's checklist, and `GET /v1/projects/{projectId}/launch-readiness` answers the same bytes — not ready, the candidate the release serving staging, the domain before IAM registration, scans computed from that release, and every other item saying which plan builds it. **Step 8 reads the fleet** (P5a Task 16): the instructor is refused `403`, then the script signs `operator` in, runs `scripts/admin-grant.sh grant opr000001`, signs them in AGAIN — a session carries the role it was issued with — and `GET /v1/fleet` shows `journey-app` owned by the instructor, for a class, healthy in staging on the journey's release. After `pnpm test` has emptied the tables it first removes `.manifest/repos/journey-app.git`, as the demos do for theirs (*Known gaps*).

## `make demo-token` — P5b's acceptance: an agent runs the build loop, and a human answers it

*Added by P5b sitting 8, 2026-09-18 (Task 12).*

D24's loop, end to end, through the edge. The control plane running, per README. It builds
`@manifest/contract` and `packages/journey` from the checked-in document, checks the control plane answers
through the edge, signs the **instructor** in with CWL, signs the **student** in once as well — see below —
and runs `packages/journey/dist/token.js`: a Node process holding two credentials, calling
`https://console.manifest.internal` through nothing but the generated client, under `NODE_EXTRA_CA_CERTS`.

```bash
make up
# ... the control plane running, per README ...
make demo-token             # ~40 seconds; ends with `every check passed` and exit 0
```

It works on its own project, **`token-app`**, created from `node-ts-mongo@1`'s `proof-app` starter the first
time and reused after — creating it is the *instructor's* job, because `POST /v1/projects` is interactive-only
(D24's scope rule). **The run prints nine steps**; they are grouped here into seven, so the numbers below are
not the step numbers it prints:

1. **The instructor mints a delegated token** for the agent: `project:read`, `build:create`, `release:create`,
   `release:deploy` — and a mint carrying `members:manage` is refused `400 TOKEN_CAPABILITY_FORBIDDEN` first,
   so the token step 6 is refused with demonstrably *could not* have been minted differently. The secret is
   checked to be `mft_<the row id with its dashes stripped>_<43 base64url characters>`, and the token object
   itself is checked to carry no `secret` field at all.
2. **The agent reads its own project** — and `GET /v1/projects` answers it exactly that one, never its
   minter's others — and is refused `GET /v1/fleet` and `POST /v1/projects`, both `403
   TOKEN_CREDENTIAL_REFUSED`.
3. **The agent builds**, watching its own event stream on its own bearer, and **deploys to staging**; the app
   then answers its own `/healthz` through the edge. **Promoting the same release to production is refused
   `403 TOKEN_ACTION_PENDING`** — `release:promote` is privileged and `release:deploy` is not.
4. **The agent asks to add a member** and is refused `403 TOKEN_ACTION_PENDING`, carrying the question.
5. **The instructor reads §26's queue and confirms it** — and the agent trying to confirm its own question is
   refused `403 TOKEN_CREDENTIAL_REFUSED` first, because a loop with no human in it is not D24's loop.
6. **The agent retries** with the same body and the **same `Idempotency-Key`** and gets `201`; the same key
   again replays that `201` and asks nobody anything; a **fresh** key is a new question. The instructor
   **rejects** that one, and the agent's retry is `403 TOKEN_ACTION_REJECTED` carrying their words verbatim.
7. **The instructor revokes the token** and the agent's next call is `401 UNAUTHENTICATED` — while the token
   still reads `expired: false`, because a clock and a person are different answers to why a credential stopped.

**Every check prints `ok` or `FAIL` and the run exits 1 listing each failure**, so a red run is a measurement
rather than the first thing that broke. It prints, on the green path, the token's capability count and expiry,
how long the build took, how long the question waited for a human, and each retry's status — a green
`checks.ok` prints no detail, so the numbers a filed run is evidence for would otherwise be thrown away.

**THE ONE PRECONDITION, and why the script signs a second person in.** Step 6 has the agent ask to add
`stu000001`, and `POST /v1/projects/{id}/members` refuses `400 MEMBER_USER_NOT_FOUND` for anybody who has never
signed in — `pnpm test` and `make reset` both empty `users`. So `scripts/demo-token.sh` signs the student in
and throws the session away; all it needs is the row. Without it the **confirmed retry** answers `400`, which
reads as a defect in D24's grant rather than as a missing sign-in.

**What it leaves behind.** One `pending` question — the production promotion nobody answered — which is honest:
it is what Task 10's expiry sweeper exists for, and §26's queue shows it beside the run's `confirmed` and
`rejected` ones. A `FAIL no step threw — [cause UNABLE_TO_GET_ISSUER_CERT_LOCALLY] TypeError: fetch failed` is a
run without the platform CA; a demo that does not build stops at step 0 and prints `tsc`'s errors.

## `make demo-production` — P6a's acceptance: the first production launch

*Added by P6a sitting 11, 2026-09-22 (Task 19).*

An application reaches production with every one of §13's six blocking items honestly met,
through the edge, on its OWN project, `launch-app`. Needs `make up`, **`127.0.0.3` on `lo0`**
(`make host-setup` adds it; `make reset` does not remove it) and the control plane running, per README.

```bash
make demo-production        # ~3 minutes; three phases, each ending `every check passed`, exit 0
```

**The split.** `scripts/demo-production.sh` signs people in and — the new part — **steps them
up**, both through `infra/lib/idp-login.sh` (`/auth/step-up` is driven exactly as `/auth/login`
is). `packages/journey/src/production.ts` does everything Manifest's API does, importing nothing
but `@manifest/contract`, in three phases: **instructor** (create, build, release, staging, refused
production `403 STEP_UP_REQUIRED`, and the checklist's unmet ids), **admin** (both external records
along §9's steps with an illegal jump refused, the rehearsal, and the approval refused
`403 STEP_UP_REQUIRED`), and **launch** (a stepped-up owner refused `409
RELEASE_PRODUCTION_GATE_UNAVAILABLE` naming only `admin-approval`, the approval, the production
deploy, the app probed on BOTH addresses, and the checklist read again — now a LAUNCHED app's,
`ready`, with no `rehearsal` item and the launch release covered by its own approval). **Its step 10,
a rebuild after the launch, was removed by P6b Task 6 (2026-09-23)**: a launched app's rebuild now goes
to production self-serve, which is what P6b's acceptance, `make demo-releases`, will prove (its Task 11 —
not built yet).

**A step-up is a claim on the session cookie, and sessions are stateless** — so the cookie from
before the step-up is still an ordinary session afterwards. The script keeps both for each person;
that is how one run proves the refusal and the approval.

**What a green run prints that a wrong one would not**: the candidate digest; the unmet ids at step
3 and step 9; the rehearsal's evidence line; the approval's digest, `summarySource` and review
state; and the production instance id beside the `X-Manifest-Instance` each address answered with.
*(A rebuild's digest is IDENTICAL to the approved one on this machine — BuildKit pins layer
timestamps to the commit (`source-date-epoch`) — which step 10 printed until P6b removed it.)*

**A second run RE-USES `launch-app`**, because no route deletes a project. It says `the RE-USE path`,
and step 3's unmet set is then `[admin-approval]` — the records exist, and an earlier rehearsal of
the same registration still counts (it covers the registration's shape, not a release). After a
`pnpm test` or a reset it is the fresh path again: `[admin-approval, iam-registration,
privacy-assessment, rehearsal]`.

**A red phase stops the script** (`set -e`, like every demo), so a red rehearsal never reaches the
launch phase and its output is not there to read.

**It leaves `launch-app` in production and a rebuilt release serving staging.** A production app on
this laptop points at UBC's real CWL and signs nobody in — do not read that as a failure.

## `make ci-acceptance` and `make demo-console` — 1c's acceptance, in two halves

*Added by P5c sitting 8, 2026-09-19 (Task 13).*

Phase 1c's acceptance is §22's journey proved twice over ONE contract: **clicked by a
person** and **run headlessly**. They are two targets because the two halves fail for
different reasons and a combined red run would not say which client broke.

```bash
make ci-acceptance      # the headless half: the gates with their COUNTS, then both journeys
make demo-console       # the clicked half: serves the console and prints the checklist
```

**`make ci-acceptance` asserts COUNTS, not exit codes** (P5c Decision 12). `vitest run`
against a path that matches no file prints `No test files found` and **exits 1**, and a
summary-only filter swallows that line, leaving a result that looks exactly like nothing
failed (P5b sitting 9, F5). So the script carries the four numbers from ORIENTATION §2's
box and reports a difference as **`MOVED`** rather than as a failure — a test added on
purpose must not fail the run; what must not happen is that it moves and nobody notices.
**When it moves, update ORIENTATION §2's box, `README.md`, `RUNBOOK.md` and
`scripts/ci-acceptance.sh` together.**

Every step **reports rather than exits** (P4c Decision 26), so a red run is a measurement
of everything that is broken rather than a stop at the first thing. It runs, in order:
`make doctor`, `make verify`, `pnpm lint`, `pnpm typecheck`, `pnpm format:check`,
`pnpm test`, the three package builds, then `make demo-journey`, `make demo-token` and — last,
because it leaves `launch-app` in production — `make demo-production`.

**`pnpm test` runs BEFORE the demos and the order is load-bearing**: it TRUNCATES the
control plane's §6 tables. The other way round it would empty the database the demos had
just filled, and which step made the machine what it is would be hidden.

**There is no CI workflow file, deliberately** (P5c Decision 11). Nothing can run this but
a Mac with Docker Desktop, Ollama with two models, the platform CA trusted in the keychain
and the `127.0.0.2` loopback alias. A workflow no runner executes is a module with no call
site — this script is the caller, and the day a runner exists the workflow is three lines
that invoke it.

**What it does not cover, and where each one lives instead:**

| Not covered | Where it is |
|---|---|
| The CLICKED journey | `make demo-console`, run by a person. The Chrome extension will not type a password, even a test user's (ORIENTATION §4) |
| `pnpm test:docker` (~13 min) | Owed only by a change to `runtime/`, `routing/`, `services/`, `build/`, `releases/`, `identity/`, `sso/`, `secrets/`, `projects/`, `blueprints/`, `ai/`, `observability/`, `infra/` or a `*.docker.test.ts` |
| The OFFLINE acceptance | `scripts/offline-acceptance.sh`, run by hand with the network off — its steps are numbered **0 to 9**, where 0 is the precondition. It is the only thing that runs `make demo-identity` and `make demo-ai` |

**`make demo-console` signs nobody in.** It builds the contract and the console, checks
the control plane answers `UNAUTHENTICATED` through the edge, starts `vite preview` on
7104, waits for `https://console.manifest.internal/` to answer with **the console's own
document** — not the wildcard's `manifest OK host=…`, which answers 200 for any name and
any path — prints the checklist, and stops the server it started when you press Ctrl-C.

## The first administrator

*Added by P5a Task 16, 2026-09-17.*

§20: *"the first administrator is created by a documented out-of-band procedure, never by 'first user to log in
wins'. Role changes are audited."* **This is that procedure.** It is out of band deliberately: it speaks to
Postgres as the database OWNER, inside the container, so no control-plane route can change a platform role and
no delegated token ever will (D24) — there is nothing on the network to steal that does this. At UBC the
procedure is the same SQL run by whoever holds the database owner's credential; the script is its local form.

**The person must have signed in once first** — the `users` row is created at sign-in (§9) — and the script
refuses a PUID that has never signed in, and an empty reason, changing nothing either way.

```bash
scripts/admin-grant.sh grant  opr000001 "the first administrator for this laptop"
scripts/admin-grant.sh revoke opr000001 "no longer needed"
```

**The change reaches them when they SIGN IN AGAIN.** Sessions are stateless and carry the role they were
issued with, so a session minted before the grant still says `member`; the script says so on every run.

Every change is appended to `audit.role_changes` — append-only by grant, like `audit.events`, so the control
plane's own role may read and add a row and never rewrite or remove one. A grant that changes nothing records
nothing. To read it:

```bash
docker exec manifest-postgres psql -U manifest -d manifest_control -c \
  "SELECT u.ubc_cwl_puid, r.from_role, r.to_role, r.actor, r.reason, r.created_at
     FROM audit.role_changes r JOIN users u ON u.id = r.user_id ORDER BY r.created_at DESC"
```

`operator` / `operator` (PUID `opr000001`) is the IdP test user `make demo-journey` makes an administrator, so
that the student and the instructor keep proving exactly what they prove in every other demo. An administrator
reads `GET /v1/fleet` (§26); everyone else gets `403`.

## Reaping LiteLLM's orphaned users

*Added 2026-09-18, after P5b sitting 8. `scripts/litellm-orphans.sh`.*

Every demo that replaces a project, and every `pnpm test:docker`, mints a fresh LiteLLM user
`mf-<projectId>-<environment>` for the new app and leaves the old one behind with no project. Nothing
reaps them, so the list grows most sittings — it stood at **19 rows, 15 of them orphaned**, on
2026-09-18. **An agent session cannot do the delete**: its permission classifier refuses it as a
secret-store write, and that refusal is never worked around. So an agent lists them and hands the
list over, and **a person runs the delete**.

```bash
bash scripts/litellm-orphans.sh            # list only; changes nothing, exits 0
bash scripts/litellm-orphans.sh --apply    # delete each orphan's keys, then the orphan
```

**It re-derives what is orphaned on every run and never takes a list on trust.** A user is *held*
when one of its keys is the key a container is actually running with — compared by SHA-256, so no
secret is printed — and everything else is an orphan. Do not paste a previous sitting's list into
it: journey-app's user moved in every one of the last eight sittings, which is why ORIENTATION §2
says re-measure and means it.

Three things it does that are easy to leave out:

- **It reads STOPPED app containers too**, with `docker inspect` rather than `docker exec`. An
  exec-based check cannot see a stopped app, would call its user an orphan, and would delete the key
  out from under it on the next start.
- **It refuses to delete anything if it read app containers and got NO key hashes at all** — a
  changed container name or a failed inspect makes every user look orphaned, and a check that finds
  nothing and a check that passes are otherwise the same observation. Watched failing on
  2026-09-18: with the variable name broken it refuses `--apply` and exits 1, naming a container to
  inspect by hand.
- **It deletes keys before users, and re-reads the list afterwards** — asserting that every orphan is
  gone *and every held user survived*, rather than that a delete returned 200. `/key/delete` takes
  the hashed token `/user/info` reports, so a key nobody ever saw can still go. **Each delete is
  checked by STATUS, not by curl's exit code**: `curl -sS` exits 0 on an HTTP error (§4), and both
  endpoints answer `404` for an id that does not exist — measured — so a `|| fail` after a plain
  call could never fire. The script's first version had exactly that defect.

`default_user_id` is LiteLLM's own row and is never touched. An app that declares no models has no
key, hashes to the empty string's digest, and is correctly not counted as holding one.

## Minting a delegated token

*Added by P5b Task 4, 2026-09-17. `make demo-token` drives the whole thing end to end (P5b sitting 8,
2026-09-18); this section is how to run it by hand.*

D24: an agent does not hold a person's session. It holds a **delegated token** — *"minted by the user in an
interactive session, scoped to a project and a capability set, with an expiry"* — and this is how one is made.
There is no console yet, so it is three `curl` calls against the API through the edge, as the person who owns
the project. `scripts/lib/api.sh` is the same client every demo speaks through; `CP_JAR` is a session cookie
jar from a CWL sign-in.

```bash
# Mint. `capabilities` is explicit: the token gets these and nothing else.
curl -sS -b "$CP_JAR" -X POST \
  -H 'content-type: application/json' \
  -H "idempotency-key: $(uuidgen | tr 'A-Z' 'a-z')" \
  -H 'origin: https://console.manifest.internal' \
  -d '{"name":"ci","capabilities":["project:read","build:create","release:create","release:deploy"],"expiresInDays":30}' \
  "https://console.manifest.internal/v1/projects/$PROJECT_ID/tokens"

# List — every token on the project, newest first, including the revoked and the expired.
curl -sS -b "$CP_JAR" "https://console.manifest.internal/v1/projects/$PROJECT_ID/tokens"

# Revoke. Only the person who minted it may; anyone else is answered 404.
curl -sS -b "$CP_JAR" -X DELETE \
  -H "idempotency-key: $(uuidgen | tr 'A-Z' 'a-z')" \
  -H 'origin: https://console.manifest.internal' \
  "https://console.manifest.internal/v1/tokens/$TOKEN_ID"
```

**The secret is in the mint response and nowhere else.** It is `secret` in the body — `mft_<id>_<secret>` —
and the platform stores only a SHA-256 of the second half. **Store it when you read it**: no route, no
database query and no support request can produce it again, because it does not exist anywhere to produce.
The list and the revoke answers have no `secret` field at all, and that is a property of the schema rather
than of the mapper that fills it.

**Four things the mint route refuses, and why:**

- **D24's forbidden four** — `members:manage`, `release:promote`, `quota:set`, `secret:read` — are
  `400 TOKEN_CAPABILITY_FORBIDDEN`, and the message names which one you asked for. An agent that needs one
  asks for it at the moment it needs it, and a human confirms that single action — which is built, and is
  *Answering an agent's pending action* below.
- **More than you hold yourself** is `403 FORBIDDEN`. A collaborator cannot mint a token that deletes the
  project, because a token delegates authority and does not create it.
- **An expiry over 365 days**, or under one, is `400 REQUEST_INVALID` naming `expiresInDays`.
- **A capability that is not one of the platform's** is `400 REQUEST_INVALID`. The full list is
  `MintTokenRequest` in `packages/contract/openapi.json`.

**Minting is interactive only.** These three routes take a session cookie; a token cannot mint a token, or
one leaked credential would be a credential factory.

**A minted token IS a usable credential** — since P5b Task 5 (sitting 3, 2026-09-17). Send it as
`Authorization: Bearer mft_<id>_<secret>` on any `/v1` route, with no cookie and no `Origin`: one request
hook turns either credential class into an actor, and a request carrying both a cookie and a bearer token is
refused `400 CREDENTIAL_AMBIGUOUS`. A token addressing a project it is not scoped to is answered `404`, the
stranger's answer, rather than `403`.

**A token is rate-limited, per token, from its own row** — since P5b Task 9 (sitting 6, 2026-09-18).
`rateLimit` on the mint and list answers is **requests a minute**, 600 by default; past it EVERY `/v1` route
answers `429 RATE_LIMITED` with `Retry-After` in seconds. The limit is taken in the one request hook, after
the token is verified, so a forged token cannot spend a real one's window and no route can forget the
check. **A session is deliberately not limited** — §20 scopes this control to tokens, because a
third-party agent is code the platform did not write; `GET /v1/slugs/{slug}` keeps its own per-user limiter
and is unaffected.

**A token list says whether each one has EXPIRED** — since P5b Task 10 (sitting 7, 2026-09-18). `expired` on
the mint and list answers is computed by the platform from `expiresAt`, so a reviewer of §20's list does not
compare clocks by hand. It is **not** "this token no longer works": a revoked token does not work either, and
`revokedAt` says so separately, because a clock and a person are different answers to why a credential
stopped.

**A question nobody answers becomes `expired`, and the boot is what moves it** — Task 10. Each is recorded
with a life of 24 hours (`PENDING_ACTION_TTL_MS`), and `expirePendingActions` runs once at every control-plane
boot, reporting `pendingActionsExpired` on the boot line. **Two things it is not:**

- It is **not** the control that stops a lapsed question being answered. `POST …/confirm` refuses a row past
  its own `expiresAt` with `409 PENDING_ACTION_RESOLVED` whether or not a sweep has run, and a confirmation
  older than the row's life cannot be spent. So the sweep makes the stored state honest; it does not decide
  anything.
- It does **not** run on a timer. **A control plane that has been up for a week can show a question as
  `pending` in the queue when its own `expiresAt` passed days ago** — asking to act on it is still refused,
  with the `409` above, so it is the display that is stale and never the decision. Restarting the control
  plane sweeps it; P5b's *What this plan does not build* says why no timer was added.

**Two identical asks are one question, enforced by the database** — Task 10, migration 0018. A partial unique
index over the token and the request's fingerprint, `WHERE state = 'pending'`, so an agent retrying in
parallel cannot fill a person's queue with the same question forty times. It is partial deliberately: once a
question is answered or lapsed, the same thing may be asked again.

**What is not built.** A project owner cannot revoke a collaborator's token — only the person who minted it
can.

*This section said "a token cannot authenticate until Task 5, which is the next sitting's work" until
2026-09-18, two sittings after that stopped being true: sittings 3 and 4 swept the gate-number line in this
file and not the section their own work made false. Recorded as a finding in P5b sitting 5.*

## Taking an application to PRODUCTION, by hand (§13's checklist, end to end)

*Added by P6a sitting 9, 2026-09-20, which drove this against `journey-app` and put the first
application this platform has ever launched into production. **`make demo-production` now drives
the whole of it headlessly** (P6a sitting 11, 2026-09-22 — its own section above); this is what
each of its calls is, for when you need to do one step by hand.*

**Or click it** (P6a sitting 10): serve the console with `vite preview` (see *Running the
reference console* above for why not `dev`), sign in as the administrator, open the project from **Fleet**,
record both answers on its **Launch records** tab, press **Run the rehearsal** on the checklist,
follow **Review this release**, press **Approve** — and follow **Confirm it is you, then try
again** when it is refused — then **Deploy to production**. Every step below is what those
buttons send.

**Every step is an administrator's**, signed in through the edge exactly as *The first administrator*
below describes, and every mutation carries `Origin: https://console.manifest.internal` and an
`Idempotency-Key`. `make demo-journey` leaves `journey-app` serving staging and `opr000001` an
administrator, which is the cheapest starting point.

1. **Read the checklist.** `GET /v1/projects/{id}/launch-readiness` — for a CWL app with nothing
   recorded, four blocking items are `unmet`: `iam-registration`, `privacy-assessment`,
   `rehearsal`, `admin-approval`.
2. **Record what UBC said**, along §9's arrows — a first write straight into `active` is refused,
   so `draft` → `submitted` → `active` for the registration, `submitted` → `approved` for the PIA:
   `POST /v1/projects/{id}/launch-records/iam-registration` and `…/privacy-assessment`.
   **LIST EVERY ATTRIBUTE THE RELEASE ASKS FOR** in `registeredAttributes` — the item is `met`
   only when the candidate's list is a subset of it, and a short list reads like the rehearsal
   failing (P6a sitting 8, F9).
3. **Run the rehearsal.** `POST /v1/projects/{id}/rehearsal` — ~6 s. It deploys the candidate to
   the production hostname, registers its Service Provider with production values, completes a
   real CWL sign-in and answers `200` with the evidence. **`passed: false` is a `200`** — a
   measurement that came out badly is not a request error, and `evidence.reason` says which hop
   failed.
4. **Approve the release.** `POST /v1/releases/{releaseId}/approve` is refused `403
   STEP_UP_REQUIRED` first (§20). Navigate `GET /auth/step-up` on the SAME cookie jar, complete
   the IdP's prompt — it prompts again even though you are already signed in — and post the
   assertion back to `/auth/saml/callback` **with `RelayState` beside `SAMLResponse`**, or the
   callback answers `401`. `infra/lib/idp-login.sh` is the flow; the step-up entry point is the
   only difference. Then approve: `201`, bound to the build's digest.
5. **Deploy to production.** `POST /v1/environments/{productionEnvironmentId}/deploy` — it also
   asks for step-up, and one round trip covers both while the claim is fresh. The app then
   answers on **127.0.0.3**:
   ```bash
   curl -sS --cacert infra/ca/manifest-root.crt -o /dev/null      -w 'status=%{http_code} instance=%header{x-manifest-instance}\n'      --resolve journey-app.manifest.internal:443:127.0.0.3      https://journey-app.manifest.internal/healthz
   ```
   **Read the INSTANCE header, never the status**: the same name on `127.0.0.2` also answers
   `200`, with no header, because that is the edge's wildcard and not the app.

**An app in production on this laptop signs nobody in, and that is correct.** §8 points a
production deploy at real UBC Shibboleth (`authentication.ubc.ca`), which C1 puts out of reach.
The rehearsal is the one production deploy pointed at the Manifest IdP.

## Answering an agent's pending action

*Added by P5b Tasks 6 and 7, 2026-09-18. `make demo-token` drives the whole loop end to end (sitting 8); this
is how to run it by hand.*

D24's four are refused **centrally, at the authorization layer, not per route** — so a new privileged route
cannot accidentally omit the rule. An agent asking for one is answered `403 TOKEN_ACTION_PENDING`, and the
envelope carries the `pendingAction` a person must answer:

```json
{ "error": { "code": "TOKEN_ACTION_PENDING",
             "pendingAction": { "id": "…", "action": "members:manage", "state": "pending",
                                "method": "POST", "path": "/v1/projects/…/members",
                                "bodySha256": "…", "summary": "Add or change a member",
                                "waitingSeconds": 0, "reason": null, "consumedAt": null } } }
```

A person then answers it **in an interactive session** — a token cannot answer its own question, or the
mechanism would be a loop with no human in it:

```bash
# Confirm. The body is an empty object; the person must hold the capability THEMSELVES.
curl -sS -X POST -b "$CP_JAR" -H 'Content-Type: application/json' \
  -H "Origin: https://console.manifest.internal" -H "Idempotency-Key: $(uuidgen)" -d '{}' \
  "https://console.manifest.internal/v1/pending-actions/$PENDING_ID/confirm"

# Or refuse it, in your own words. The agent is told the reason, verbatim.
curl -sS -X POST -b "$CP_JAR" -H 'Content-Type: application/json' \
  -H "Origin: https://console.manifest.internal" -H "Idempotency-Key: $(uuidgen)" \
  -d '{"reason":"not this term"}' \
  "https://console.manifest.internal/v1/pending-actions/$PENDING_ID/reject"
```

**What a confirmation is, and what it is not.** It does not replay the request. It grants **that exact
request** — this token, this method, this path, this body — **one retry**, which the agent then makes
itself, through its normal route with its normal validation. Five things follow, and each of them is a test:

- **The retry reuses the SAME `Idempotency-Key`**, which is what D23.6's own error hint tells a client to
  do. The refusal deliberately stores no idempotency record, so the retry reaches the handler.
- **"Exactly once" describes the ACTION, not the ANSWER.** The confirmed retry's `201` *is* stored under
  that key, so replaying the key returns it for ever without reaching the handler or any capability check.
  That is not an escalation — the action was authorized once and the answer is identical — but a reader who
  assumes otherwise will mis-read `consumedAt`. A second *attempt at the action* is a new request with a
  fresh key, and that one is refused again with a NEW question.
- **A different body is a different question.** The match is on the fingerprint, so a confirmation of one
  request is never a standing grant of the capability.
- **A confirmation is one credential's.** A second token asking the identical thing gets its own question.
- **A failed retry does not burn the confirmation.** `consumedAt` is stamped after the handler resolves, so
  a transient failure the agent did not cause can be retried on the same grant.

**Reading the queue** — §26's primary screen, as two reads (P5b Task 8, 2026-09-18). There is no console
yet, so this is what P5c will be built on, and it is also how an agent polls for its own answer instead of
retrying a refused request to find out:

```bash
# The project's queue, newest first. `waitingSeconds` is §26's headline number.
curl -sS -b "$CP_JAR" "https://console.manifest.internal/v1/projects/$PROJECT_ID/pending-actions"

# One question. The AGENT reads its own this way, with its bearer token and no cookie.
curl -sS -H "Authorization: Bearer $TOKEN" \
  "https://console.manifest.internal/v1/pending-actions/$PENDING_ID"
```

**The two credential classes see different sets.** Anyone who can read the project sees every question on
it — reading is `project:read`, so a collaborator watches the queue even though answering needs the
capability the question is about. A **token sees only what it asked itself**: one agent reading another
agent's requests is a read D24 grants nobody, and a question that is not yours is `404`, the same answer an
id that does not exist gets. **Neither read ever carries the refused request's body** — only its
`bodySha256`, which is enough for an agent to recognise its own request and nothing for a person's screen to
leak. Answered and expired questions stay in the list, because a queue that hides what was decided cannot
show a person what they decided.

**Removing a member** is D24's fourth privileged action and became reachable in the same task:
`DELETE /v1/projects/$PROJECT_ID/members/$USER_ID`, answering `200` with the members as they now are. It is
idempotent — removing somebody who is not a member is not an error — and the **last owner cannot be
removed** (`409 PROJECT_LAST_OWNER`). It was written after D24's rule was made central and does nothing
about tokens: an agent asking is answered `403 TOKEN_ACTION_PENDING` anyway, which is the whole claim of
that rule and is what its test measures.

**Refusing is final for that request.** A retry after a rejection is answered `403 TOKEN_ACTION_REJECTED`
carrying the person's own reason, rather than asking them the same thing again — which is what D23.7 means
by an error an agent corrects itself from. **Who may answer:** whoever holds the capability themselves. A
collaborator who may not manage members is `403 FORBIDDEN`; somebody who is not a member of the project at
all is `404`, the same answer an id that does not exist gets. Answering twice is `409
PENDING_ACTION_RESOLVED`. A question expires after **24 hours**.

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

- **It needs a WebSocket client and a credential.** `curl` cannot speak it: a plain GET from a member answers `426 Upgrade Required` with `Upgrade: websocket`, a stranger `404`, nobody `401` — which is also the quick way to check the route is up. The credential is either the `manifest_session` cookie a CWL login sets **or, since P5b Task 5, an agent's `Authorization: Bearer <token>`** — the stream reads whichever the one request hook resolved, so a delegated token scoped to the project opens it with the `project:read` it was minted with.
- **A connection is replayed first.** It receives the project's newest 50 events, oldest first, then `{"kind":"control","type":"manifest.stream.ready"}`, then live frames — anything before the ready frame had already happened. Build-log lines are **not** replayed; `GET /v1/builds/:buildId/logs` has them.
- **A client that falls behind is closed with 1013** once a megabyte is queued for it, and should reconnect; the replay covers the events it missed.
- **It is reached through the edge, at `wss://console.manifest.internal/v1/projects/:projectId/events`** (P5a Task 3), and **a SESSION-bearing upgrade must carry `Origin: https://console.manifest.internal`** (P5a Task 4) — one carrying a session from any other origin, or from none, is refused `403` before it opens, which a WebSocket client sees as an error and close `1006`, not as a status. `scripts/lib/event-stream.mjs` sets it. **A TOKEN-bearing upgrade must NOT send it and is not asked for one**: CSRF is a browser attack, a bearer credential is not sent automatically by a browser, and the check keys on the cookie (`carriesSession`), so it exempts a token without a line of its own (P5b sitting 3, F9 — asserted by two tests rather than read off the source). A Node client needs `NODE_EXTRA_CA_CERTS` — Node does not read the keychain. **Every edge admin change is a whole-config reload, and a reload closes every WebSocket it proxied with `1001`** unless the handler sets `stream_close_delay`; the console site sets an hour, so a deploy anywhere on the platform no longer disconnects a subscriber, but a stream older than an hour past a reload is closed with `1001` and should reconnect.
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

- **AFTER `make reset`, CHECK THE EDGE FROM THE HOST BEFORE RUNNING ANYTHING.** *Recorded
  2026-09-18, P5b sitting 9.* Once, after `echo reset | make reset && make up`, every host-side
  call to `https://console.manifest.internal` and `https://edge.manifest.internal` answered
  `curl: (35) Recv failure: Connection reset by peer` — while the SAME check from a container on
  the platform network passed. `make verify` caught it as **11 of 51 failed**, all with that one
  error, and its *host and container see a byte-identical hostname and scheme* check is the one
  that names the shape. The `127.0.0.2` alias was present, the control plane answered `401` on
  `127.0.0.1:7100`, and `manifest-caddy` was up and healthy. **`docker restart manifest-caddy`
  cleared it.** It did not reproduce under `make down && make up`, so it is intermittent and its
  trigger is not isolated. **The order to use after a reset:** `make up`, then export README's
  whole block, then `pnpm --filter @manifest/control-plane db:migrate` — which fails with
  `[x] url: undefined` if `MANIFEST_ADMIN_DATABASE_URL` is not exported, because it is derived in
  that block and not stored in `.env` — then the control plane, **then `make verify`**, and only
  then the demos.
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
  not a container — answers with the network off. **P5a sitting 12 appended a step 8,
  `make demo-journey`, P5b sitting 9 a step 9, `make demo-token` (2026-09-18), and P5c
  sitting 9 a step 10, the console's preflight (2026-09-19), and P6a sitting 11 a step 11,
  `make demo-production` (2026-09-22)** — the script now has eleven steps and all six of the
  appended ones are unrun offline. Step 11 is the one most likely to find something: a
  production launch pulls the approved digest from the registry and signs in at the IdP three
  times, and its approval summary may read `unavailable` offline, which is Decision 7. Step 9
  should want the network least of any of them: its credential is `node:crypto` and its
  build comes from the same mirror step 6 already exercises.
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
