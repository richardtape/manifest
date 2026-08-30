# Phase 0 — Spike Briefs

**Spec:** [`docs/superpowers/specs/2026-08-29-manifest-platform-design.md`](../specs/2026-08-29-manifest-platform-design.md) §17
**Roadmap:** [`2026-08-29-plan-roadmap.md`](./2026-08-29-plan-roadmap.md)
**Date:** 2026-08-29

---

## How to use this document

These are **not implementation plans.** A spike answers a question whose answer we
do not have; a plan specifies code we already know how to write. Writing a
task-by-task TDD plan for a spike is a category error, and four of the seven spikes
below block content in the Phase 1a plans — §12 (line 866) says of S7's central
question, in the spec's own words, *"that is a hypothesis, not a design."*

**Rules for every spike:**

1. **Timebox is hard.** When it expires, you write up what you found, including
   "inconclusive". An overrunning spike is itself a finding — it means the question
   was bigger than we thought, and that changes the plan more than the answer would.
2. **Throwaway branch**, named `spike/<id>`, never merged to `main`. The named
   artefacts under *What survives* are copied out deliberately; everything else is
   deleted.
3. **The deliverable is a findings note**, written to
   `docs/superpowers/spikes/<id>-findings.md`, answering the question in its first
   sentence — *yes*, *no*, or *inconclusive, because…* — before any detail.
4. **Record the versions.** Every finding here is a property of a specific version
   of third-party software. Note the exact image digests, package versions and
   macOS/Docker Desktop versions the answer was obtained under.

**Two of these are not throwaway, and the phasing doc's "meant to be deleted
afterwards" framing is wrong about them.** S7's DNS configuration and CA-trust
steps carry into P1 verbatim, and S6's probes become the §16 security regression
tier. Both are called out under *What survives* below.

### Order

| Spike | Runs | Blocks |
|---|---|---|
| **S7** | now, in parallel with S2 | P1 (all of it), P3's routing |
| **S2** | now, in parallel with S7 | P4 (1b) entirely; P2's IdP metadata schema |
| **S1** | after S7 reports | P3 |
| **S3** | after S7 reports, parallel with S1 | P4 (1b) |
| **S6** | as P3's acceptance exercise | Phase 3; the §16 security regression tier |
| **S4** | before Phase 4 | Phase 4 |
| **S5** | before Phase 3, after S6 | Phase 3 |

**S6 is deliberately moved.** §17 places it "before Phase 3, and earlier is
better", but S6 tests the container hardening baseline that Phase 1a *ships* —
running it before that baseline exists means testing nothing. It belongs at the end
of P3, against the real Docker driver. See the roadmap, gap 4.

---

## S7 — The local baseline boots

> **Question:** Does §21's full platform stack boot on a clean Mac, offline after
> seeding — and does a `*.manifest.test` name resolve to the right place from both
> the host browser and a process inside a container?

| | |
|---|---|
| **Timebox** | 3 days |
| **Runs** | first, alongside S2 |
| **Blocks** | P1 in its entirety; P3's routing half |
| **Prerequisites** | none |

### Why it cannot wait

Phase 1a's entire deliverable *is* the local baseline. If C1 ("laptop-first, and
reproducibly so") does not hold, we need to know in week one, not month three —
and the second half of the question is explicitly unsettled in the spec.

### The unsettled part, stated precisely

§12 settles that the zone is `*.manifest.test` served by dnsmasq, that
`*.manifest.localhost` is unusable (inside a container `.localhost` is the
container's own loopback, and glibc does not special-case `*.localhost` at all),
and that containers receive the resolver per-container via `--dns`.

What it does **not** settle:

> The host needs these names to resolve to `127.0.0.1` while containers need the
> Docker gateway address, and a single A record cannot serve both.

Two facts constrain the answer, and both are easy to miss:

- **`docker run --dns` takes an IP and no port.** A container cannot be pointed at
  dnsmasq on port 7153. Whatever serves containers must answer on port 53 at an
  address the container can route to.
- **On Docker Desktop for Mac the host cannot route to container IPs directly.**
  So "just give everyone the container IP" is not available.

### Hypothesis to test first

**Two dnsmasq listeners with different answers**, since dnsmasq's `--address` is
global to a process rather than per-interface:

- **Process A** — `--listen-address=<dnsmasq container IP on the platform network>`,
  `--address=/manifest.test/<Caddy's IP on that same network>`, port 53. Workload
  containers get `--dns <dnsmasq container IP>`.
- **Process B** — bound to a second address, published to the host as `127.0.0.1:7153`,
  `--address=/manifest.test/127.0.0.1`. The host's
  `/etc/resolver/manifest.test` carries `nameserver 127.0.0.1` and `port 7153`.

Two processes in one container, or two containers. Either is acceptable; record
which and why.

### Fallbacks, in preference order, if the hypothesis fails

1. **`--add-host` per workload container.** The driver already configures every
   workload container explicitly (§12), and a container only needs to resolve a
   handful of names — the IdP metadata URL, LiteLLM, the egress proxy. Costs: the
   name set is fixed at container start, so a name created later is invisible until
   restart. Acceptable for 1a; verify it does not break the SAML metadata fetch.
2. **Split the zone.** Containers resolve `*.manifest.internal` while the host
   resolves `*.manifest.test`. **Check this against §9 before adopting it:** a SAML
   `entityID` and ACS URL must match byte-for-byte in both contexts, so this is only
   viable if the *app-facing* names stay identical and only platform-internal
   service names diverge. If it breaks that property, reject it.
3. **A host-side DNS proxy** that forwards to the container-network dnsmasq and
   rewrites answers. Last resort — a moving part with no owner.

### What "yes" looks like

Evidence, all of it captured in the findings note as terminal output:

- [ ] `make seed` completes with network on, and is the **only** step that needs it.
- [ ] `make up` boots the §21 inventory with the network **off** (Wi-Fi disabled,
      not merely "we didn't call out"), and all nine long-running containers report
      healthy.
- [ ] `make doctor` reports green on: Docker running and its VM memory ≥8 GB, Ollama
      up with the required models present, resolver file installed, CA trusted,
      ports 7100–7199 free, **ports 80 and 443 free or overridden**, disk ≥40 GB,
      architecture recorded.
- [ ] `curl https://console.manifest.test` from the **host** reaches a placeholder
      served through Caddy over HTTPS with a trusted certificate — no `-k`.
- [ ] `docker run --rm --dns <…> curlimages/curl https://console.manifest.test`
      from a **container** reaches the same placeholder, also with a trusted
      certificate. This is the half that fails silently if the DNS design is wrong.
- [ ] The same is true of a second name allocated at runtime, not just one baked
      into config at boot.
- [ ] A **fresh clone on a second machine** (or a clean user account) reaches the
      same state from `make seed && make up && make doctor` with no undocumented
      manual step. This is C1's actual bar; one machine working is not the claim.

### Also settle while you are in here

- **The custom Caddy build.** §20 requires an `xcaddy` image carrying the rate-limit
  and Coraza/OWASP-CRS modules — not stock Caddy. Confirm the modules build against
  a pinned Caddy version, and record the exact `xcaddy` invocation and the resulting
  digest. This is the one image built rather than pulled.
- **CA trust in two places.** Caddy's internal CA root into the macOS keychain *and*
  into container trust stores via `NODE_EXTRA_CA_CERTS`. Automate both in `make seed`
  and record what privilege each needs (keychain trust will prompt).
- **Port conflicts.** 80 and 443 are in use on the author's machine right now.
  Confirm the override path works end to end, including the certificate.
- **The three Postgres databases** on one server (control plane, LiteLLM, IdP
  metadata), and whether SimpleSAMLphp's PDO metadata source can share it — hand
  that finding to S2.

### What survives the spike

Not throwaway. Copy out, verbatim:

- the working dnsmasq configuration and the reasoning for the chosen variant
- `/etc/resolver/manifest.test` contents and its install step
- the `xcaddy` build invocation and pinned digests
- the CA trust automation
- the `make doctor` check list, which becomes P1's spec
- a note of every manual step that could not be automated — each one is a bug
  against C1's "new developer from a clean checkout" bar

---

## S2 — SimpleSAMLphp's SQL metadata source

> **Question:** Does inserting a row into SimpleSAMLphp's SQL metadata store
> register a functioning Service Provider — with no file writes, no container
> reload, and no restart?

| | |
|---|---|
| **Timebox** | 2 days |
| **Runs** | first, alongside S7 |
| **Blocks** | P4 (1b)'s implementation shape; the IdP metadata schema in P2 **only if the answer is yes** |
| **Prerequisites** | none (can share S7's Postgres once it exists, but does not need to wait) |

### Why it runs first — and why it is no longer existential

§9 calls this **"the highest-risk *technical* unknown in this design"** and says
sandbox and staging SP auto-provisioning *"collapses without it."*

**That claim is overstated, because `docker-simple-saml` is ours to edit.** The risk
was priced on the assumption that a "no" left us stuck with third-party behaviour we
could not change. It does not. SimpleSAMLphp itself is still third-party — the image
does `composer create-project simplesamlphp/simplesamlphp:^2.0` — but the wrapper,
the configuration and the module set are ours.

Calibrate the fallback honestly, though: the existing custom module
`modules/ubc-clf-7` is a **theme** — Twig templates and CSS, no PHP. So the module
*packaging* path is proven, while writing a metadata source is genuinely new PHP.
It is implementing one documented abstract class, not forking SSP. Cheap, not free.

So S2 still runs first, and still first among the non-S7 spikes, for one reason
only: **if the answer is yes, we write no PHP at all.** What has changed is the cost
of "no" — an implementation choice, not a redesign.

**Spec action:** §9's risk paragraph and §19's status line for this item both need
softening. It is not the highest-risk technical unknown once the fallback is in our
own repository. S7's split-horizon DNS question is the better candidate for that
title, because no amount of ownership makes it go away.

### Starting point

`/Users/rich/Developer/docker-simple-saml`, which today has:

- SimpleSAMLphp **2.x** (`composer create-project simplesamlphp/simplesamlphp:^2.0`)
- `config.php` `metadata.sources` = two **flatfile** entries (lines 34–40). A `pdo`
  entry is what needs adding.
- `store.type => 'sql'` with a SQLite DSN (line 66) — note this is the **session and
  data store**, a different thing from the metadata source. Do not conflate them.
- **`pdo_pgsql` is not installed.** The Dockerfile installs `pdo_mysql` and
  `pdo_sqlite` only. §21 wants Postgres, so the image needs
  `docker-php-ext-install pdo_pgsql` — confirm it builds.
- `saml20-sp-remote.php` showing the exact per-SP field set Manifest would write:
  `AssertionConsumerService`, `SingleLogoutService`, `NameIDFormat`,
  `simplesaml.attributes`, `attributes`, `saml20.sign.assertion`,
  `saml20.sign.response`, `validate.authnrequest`, `validate.logout`.
- A ready-made SP to test against: `/Users/rich/Developer/passport-ubcshib-docker-simple-saml-example`.

### Method

1. Add `pdo_pgsql` to the image; add a `pdo` entry to `metadata.sources` pointing at
   a Postgres database.
2. Find out **what creates the schema.** SimpleSAMLphp ships a metadata-PDO
   initialisation path; establish whether it is a CLI script, a module command, or
   something we must create ourselves, and record the resulting table shape exactly
   — P2 needs it to write rows.
3. Insert one SP row for the example app, by hand, with `INSERT`.
4. Drive a full login from the example SP. Assertion received, attributes present.
5. Then answer each sub-question below. **These are not optional detail** — each one
   is a specific claim §9 makes that collapses if the answer is no.

### Sub-questions, each traced to the claim it supports

| Sub-question | §9 claim it supports |
|---|---|
| Does a newly inserted row take effect **without a restart or reload**, and is there a metadata cache TTL? | "Manifest registers a Service Provider by inserting a row — no file writes, no container reload, no restart" |
| Can `attributes` be scoped **per SP** from the row, and is release actually *enforced* — does an SP receive only what its row lists? | "Enforced attribute release… An app cannot receive an attribute it did not declare." This is what makes the D16 approval diff worth reviewing. |
| Do `validate.authnrequest => true` and `validate.logout => true` work from a SQL row, given a per-app keypair? | "Both must be `true` in staging and production… requiring signed AuthnRequests costs nothing" |
| Is a **read-only** database user sufficient for SimpleSAMLphp's own operation? | "The SimpleSAMLphp database user is read-only. Only the control plane writes SP metadata" |
| Can an SP's public certificate be carried in the row, so per-app keypairs work? | Per-app keypairs (§9), rotatable freely in sandbox/staging |
| What happens on a **malformed or partial** row — does the IdP fail closed, or serve a broken SP? | Registration hardening; a half-written row must not become a live SP |

### The opportunity to take while you are in here

Because this repository is ours **and Manifest runs its own IdP instance** — §21
puts it on port 7122, "deliberately *not* 6122 — that is already taken by the
standalone `docker-simple-saml` on this machine" — we can change Manifest's instance
without touching anyone's existing local development.

The change worth making: **`saml20-idp-hosted.php` sets
`attributes.NameFormat => basic`**, releasing friendly attribute names, where real
UBC Shibboleth sends **OID and MACE URNs**. §9 names this as the divergence that is
*"invisible until an app meets real Shibboleth"*, and it is the reason
`tlef-starter` carries `server/src/components/auth/saml-attributes.ts` at all.

Establish:

- Can `NameFormat` be set to the URN format on the Manifest IdP instance, and can it
  be set **per SP** from a metadata row rather than only per IdP?
- Does `passport-ubcshib`'s `LOCAL` preset cope with URN-formatted attributes, or
  does it assume friendly names?

If both answers are good, take it. Sandbox and staging then exercise the same
attribute naming production will, which is a real reduction in what can surprise
anyone on launch day. **It does not retire D21's rehearsal** — registration
validity, the certificate and UBC's actual release policy still need proving against
real Shibboleth — so do not let the finding be read that way.

### Also record

- The IdP's local default attribute set includes **`uid`**, which §7 states plainly
  is *not* a UBC attribute — the identifier is `ubcEduCwlPuid`. Manifest writes its
  own attribute list per SP and must not inherit this default.

### If the answer is no

Fallbacks re-ranked, because ownership changes their costs:

1. **A custom SSP metadata source module** reading from Postgres — now the
   **preferred** fallback rather than a grudging one. Implements one documented
   abstract class in a repository we already control and already extend with a
   module. Two things make it *better* than the SQL source in one respect: **we own
   the schema**, so P2's IdP metadata tables become a design decision rather than a
   discovery, and we control the caching behaviour rather than inheriting it. Costs:
   PHP we maintain, and a review on every SSP major upgrade. Estimate the size
   before committing, and record it.
2. **Control-plane-written flatfile plus reload.** Manifest writes
   `saml20-sp-remote.php` fragments into a shared volume and triggers a reload.
   Costs: loses "no container reload"; introduces a file-write path into the
   registration flow that §9's hardening explicitly wanted to avoid; reload latency
   becomes part of project creation. Only if option 1 proves surprisingly large.
3. **A different IdP** for sandbox and staging (Keycloak has a real admin API).
   Costs: abandons `docker-simple-saml`, and diverges *further* from UBC's actual
   Shibboleth — which weakens what staging proves, at exactly the moment the
   opportunity above would have strengthened it. Largest change; genuine last
   resort.

Whichever way it lands, the finding must state which of §9's claims survive
unchanged, which need rewording, and which are dead.

### What survives the spike

- the metadata schema as SQL — **whether discovered from SSP or designed by us**
- one worked registration producing a functioning SP, kept as a fixture for P4
- the `pdo_pgsql` image change
- the `NameFormat` decision and the evidence behind it
- a list of §9 sentences needing revision, including its risk paragraph

---

## S1 — Docker round-trip

> **Question:** Can code drive a bare git repository through to a routed, healthy
> container with a bound database — using only the operations §11's `Driver`
> interface declares?

| | |
|---|---|
| **Timebox** | 3 days |
| **Runs** | after S7 reports (needs the DNS answer for the routing half) |
| **Blocks** | P3 |
| **Prerequisites** | S7 |

### Why it cannot wait

It is the single most basic thing the platform does, and P3's whole shape is
guesswork until it has been done once.

### What "yes" looks like

A script, driven from Node, that:

- [ ] reads a source tree from a **local bare repository** at a given commit (D5's
      driver 1)
- [ ] builds it to an image with a **rootless BuildKit** builder that holds no
      control-plane credential and can reach only the package mirror and the
      registry (§12)
- [ ] pushes to the local registry and gets back an **image digest**, not a tag
- [ ] provisions a Mongo container on a **per-app network** (§12 east-west isolation)
- [ ] starts the app container on that network with the §8 environment injected, the
      §12 hardening flags applied, and `--dns` from S7
- [ ] adds a route via **Caddy's JSON admin API** at runtime, without a config
      reload that disrupts live connections
- [ ] polls the health path until healthy, and the app is reachable at its
      `manifest.test` name from both host and container
- [ ] streams logs out of the running container as an async iterable
- [ ] stops it (volumes survive), starts it again, then destroys it and its service

### Sub-questions

- **Rootless BuildKit on Docker Desktop for Mac** — does it work, and how is it
  invoked? A `buildkitd` container, `docker buildx` with a rootless driver, or
  something else? This is a real unknown on macOS and it is load-bearing for D13.
- **Idempotency.** `ensureService` and `ensureInstance` are declared idempotent and
  keyed by a deterministic name derived from `(project, environment, release)`.
  Call each twice; confirm the second call is a no-op and not a duplicate.
- **Caddy admin API** route add/remove while serving. Measure whether a route change
  drops in-flight requests.
- **The hardening flags actually apply**: `cap-drop ALL`, `no-new-privileges`,
  read-only root with explicit tmpfs, default seccomp, user-namespace remapping,
  `pids` and disk ceilings. Some of these behave differently on Docker Desktop's
  VM than on Linux — record which.
- **Log streaming shape** — the Docker Engine API's multiplexed stream demuxed into
  `AsyncIterable<LogLine>` without buffering the whole thing.

### If the answer is no

The likeliest failure is rootless BuildKit on macOS. Fallbacks: BuildKit in a
container with the daemon socket held *only* by the control plane (never a workload
container); or plain `docker build` with the network-restriction and credential
properties preserved by other means. Record which §12 properties each fallback
gives up — "network-restricted builder" is named in §20's control map as a real
control, so a fallback that loses it is a change to the security architecture, not
a detail.

### What survives the spike

- the rootless BuildKit invocation that worked
- the Caddy admin API request shapes for add-route and remove-route
- the exact `docker` flag set that satisfies §12's hardening baseline on macOS, and
  a note of any flag that silently does nothing there
- a list of `Driver` interface signatures that turned out to be wrong

---

## S3 — LiteLLM, Ollama, virtual keys and budgets

> **Question:** Do LiteLLM's admin API, per-key budgets and per-user spend
> attribution work against Ollama on the host — and does `ubc-genai-toolkit` talk to
> it **unchanged**?

| | |
|---|---|
| **Timebox** | 2 days |
| **Runs** | after S7 reports, in parallel with S1 |
| **Blocks** | P4 (1b) |
| **Prerequisites** | S7 (for the Postgres and networking it shares) |

### Why it cannot wait

Everything about offline AI depends on the answer. C6 says Manifest adapts to
`ubc-genai-toolkit` rather than the reverse — and under the revised C6 (see the
roadmap's *"C6 needs rewording"*) that remains the target even though the toolkit is
ours. **"Unchanged" is
still the success criterion**, because an integration that needs a library change to
work is an integration every other UBC app cannot use. What ownership changes is
only the cost of a "no": a toolkit fix is available, released as a version Manifest
pins, rather than being a wall.

### What "yes" looks like

- [ ] LiteLLM + Postgres in Compose, `model_list` reaching Ollama on the host
      (Metal GPU access is unavailable from a container, so Ollama is a host
      application — confirm the host address works from inside the LiteLLM container)
- [ ] `/key/generate` mints a virtual key scoped to a `max_budget`
- [ ] `/user/new` and the spend endpoints work as §10's table assumes
- [ ] **The budget actually binds.** See the trap below.
- [ ] Passing `user` on a completion request attributes spend to that user, readable
      back per user — this is D8's "which of 300 students spent the budget"
- [ ] **Model groups resolve logical names.** `default-chat` and `default-embed`
      (§7) map to a group, and repointing the group changes routing with no client
      change. This is the mechanism an admin uses to move the fleet to new on-prem
      hardware.
- [ ] `ubc-genai-toolkit`'s `openai-compat` provider gets a completion **and** an
      embedding through LiteLLM with **no modification to the toolkit**
- [ ] Key revocation takes effect immediately (`/key/delete`), since app keys rotate
      every deploy and agent keys die with the sandbox

### The trap worth naming

§10 says that locally "the budgets simply never bind" — because Ollama is free, a
budget of $50 is never reached, so **a budget test against Ollama proves nothing.**
To test the mechanism, configure a non-zero synthetic cost per token on the local
model entry, set a budget of a few cents, and exceed it. Record the exact error
LiteLLM returns when a key is over budget, because P4 has to turn that into a
faculty-legible `Event` and a machine-actionable error code (§20).

### Also record

- LiteLLM's **request/response logging** configuration. §7 flags this: those logs
  contain prompt content, which is student data. Retention and destination are a
  deliberate documented decision, not a default. Find out what the default *is*.
- Streaming through LiteLLM to the toolkit, since the console will stream.
- Whether the admin API distinguishes its **admin port** from the **proxy port**,
  since §12 denies apps and sandboxes the former while allowing the latter.

### What survives the spike

- the working `config.yaml` model-group mapping for `default-chat` / `default-embed`
- the synthetic-cost trick for making budgets testable offline
- the over-budget error shape
- the LiteLLM logging decision, written down

---

## S6 — Container isolation

> **Question:** With §12's hardening baseline applied, what can a hostile process
> inside a sandbox **actually reach**?

| | |
|---|---|
| **Timebox** | 3 days |
| **Runs** | **as P3's acceptance exercise**, against the real Docker driver |
| **Blocks** | Phase 3; the §16 security regression tier |
| **Prerequisites** | P3's hardening baseline |

### Why it is placed here rather than "before Phase 3"

§17 says "required before Phase 3, and earlier is better." But S6 tests the
hardening baseline, and the hardening baseline is Phase 1a's deliverable. Run
earlier, it has nothing to test. Run at the end of P3 it does two jobs at once: it
answers the question, and it *is* P3's acceptance evidence. This is the only
deliberate departure from §17's spike ordering. See roadmap gap 4.

### Method

A deliberately hostile probe image, run under the exact sandbox profile P3
produces. Each probe records **reached / blocked**, with the evidence.

| Probe | Expected | §3.5 threat |
|---|---|---|
| Open the container runtime socket | blocked | container escape |
| Reach the control plane API on the host | blocked | tenant escape |
| Reach another app's Mongo on another per-app network | blocked | lateral movement |
| Reach LiteLLM's **admin** port | blocked | credential and budget abuse |
| Reach LiteLLM's **proxy** port | reached — this one is allowed | — |
| Reach the IdP administrative interface | blocked | assertion abuse |
| Reach `169.254.169.254` and other metadata endpoints | blocked | cloud credential theft |
| Egress to a host not in `egress.allow` | blocked at the forced proxy | exfiltration |
| Egress to the package mirror | reached — allowed baseline | — |
| **Reach the developer's own machine** — MongoDB, MySQL, other projects' databases | **see below** | §21 divergence 7 |
| Fork bomb | contained by `pids` | resource exhaustion |
| Fill the disk | contained by the disk ceiling | resource exhaustion |
| Write to the root filesystem | blocked (read-only root) | persistence |
| Acquire capabilities beyond the add list | blocked | escape |
| Escape the user namespace | blocked | escape |

### The probe that matters most

§21 divergence 7 states it plainly: resolving `*.manifest.test` to the host gateway
gives every app and sandbox container **a route to the developer's machine**, which
on a typical machine listens on far more than Manifest's ports — MongoDB, MySQL and
other projects' databases are all live on the author's machine now. The spec calls
this *"the one local divergence that is a real security weakening rather than a
convenience"* and requires S6 to test it. Egress policy must deny the host gateway
except for the ports an app actually needs.

If this probe reaches, it is not a finding to note and move past. It is a defect in
P3 that P3 must fix before it is done.

### The judgement to record

`DriverCapabilities.isolationLevel` is `container` — the weakest level. The finding
must state, in a sentence a reviewer can act on: **is a plain container adequate for
a sandbox running unreviewed code, or does Phase 3 need gVisor or Kata?** Recording
it honestly is what lets sandboxes be upgraded later without redesign.

### What survives the spike

Not throwaway. Every probe becomes a permanent test in §16's **security regression**
tier, run in CI:

- secrets never appear in captured logs, incidents or events
- a sandbox cannot reach the control plane, the LiteLLM admin port, or a metadata
  endpoint
- a `confidential` app cannot resolve an off-premise model
- a spec with a `runtime.build` block or a non-path `auth.callback` is rejected

Plus the recorded `isolationLevel` judgement, and any §12 control that turned out
to be unenforceable on this driver — which `capabilities()` must then report
honestly rather than silently pretending.

---

## S4 — Wake-on-request

> **Question:** Can the edge hold an incoming request while the control plane starts
> a hibernated instance, without the visitor seeing an error?

| | |
|---|---|
| **Timebox** | 2 days |
| **Runs** | before Phase 4 |
| **Blocks** | Phase 4 |
| **Prerequisites** | P3 (a real driver to start instances with) |

### Why it waits

Nothing in Phases 1–2 needs it. It is deferred deliberately, not forgotten.

### The question is a choice, not a yes/no

§11 says the mechanism is unsettled, and names the constraint: *a response body
cannot be streamed and then replaced by a proxied response.* So there are two
candidate designs and the spike picks between them by measuring:

- **A retry window at the edge** — Caddy's `lb_try_duration` / `lb_try_interval`
  against a backend that becomes healthy after *N* seconds. Measure the largest *N*
  that works before browsers, intermediate proxies and Caddy's own timeouts
  intervene. Test in a real browser, not only `curl` — they differ.
- **A holding page that polls and reloads** — served immediately, replaced when the
  app is healthy. Works for any wait; costs a visible interstitial and breaks
  non-browser clients and deep links with request bodies.

Measure both against **a real cold start**: because services are dedicated per app
(D3), waking means starting the app container *and* its Mongo. Time that, on the
16 GB floor, not on an idle 32 GB machine.

### Also settle

§20 names wake-on-request as **an amplification primitive** — one unauthenticated
request starts a container and a database. Establish where the rate limit, the
concurrent-wake cap and the queue beyond it live, and confirm the chosen mechanism
can carry them.

### What survives

The crossover point between the two designs, the measured cold-start time, and the
rate-limit shape.

---

## S5 — An agent inside a sandbox

> **Question:** Can an AI agent run inside a sandbox container, using `exec`, and
> produce a real commit on a branch it is allowed to touch — and no other?

| | |
|---|---|
| **Timebox** | 3 days |
| **Runs** | before Phase 3, **after S6** |
| **Blocks** | Phase 3 |
| **Prerequisites** | P3, P4, S6 |

### Why it waits, and why it waits for S6 specifically

This is the first time the platform executes code nobody has read. Running it
before S6 has established what a hostile process can reach means running it
blind.

### What "yes" looks like

- [ ] A sandbox container starts from the blueprint skeleton with `exec` enabled
- [ ] An agent harness runs **inside** it and obtains model access from a
      session-scoped LiteLLM key with a hard cap (D2, D8)
- [ ] It writes files, runs commands, and its output streams out over the API
- [ ] It produces a commit that lands on **one branch of one repository**
- [ ] It **cannot** push to `main`, and cannot reach another project's repository
      (D14, §20 git driver)
- [ ] It holds **no credential able to mutate anything outside itself** — verify
      against S6's probe set, not by inspection
- [ ] A looping agent exhausts its **own** session cap and not the app budget
- [ ] Attempting a privileged action — promotion to production — produces a
      `PendingAction` awaiting a human, not an action (D14, D24)

### The honesty clause

§21 states that a 7–8B model through Ollama exercises the *mechanism* end to end but
does not represent the *quality* of an agent building a full-stack application,
"which at that size will be poor." S5 answers "can an agent work in this
environment", not "can an agent build a good app". Write the finding so nobody
later reads it as the second claim.

### What survives

- the sandbox container profile that worked
- the branch-scoped git credential mechanism
- the `PendingAction` interception point
- an honest note on what the local model could and could not do
