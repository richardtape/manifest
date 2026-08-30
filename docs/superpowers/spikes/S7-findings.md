# S7 — Does §21's stack boot on this Mac, and does a platform name resolve correctly from both the host browser and inside a container?

**Answer:** **Yes for the split-horizon DNS question — the brief's hypothesis works
essentially as written.** But **the zone cannot be `*.manifest.test`**, and that is
the finding that matters most.

The same URL — `https://console.manifest.internal/`, no port, no `-k` — now resolves
and serves correctly from the host *and* from inside a container, with a trusted
certificate in both, including names allocated at runtime after boot. Two dnsmasq
processes with different `--address` answers is the right design and needs three
non-obvious flags the brief does not mention. **`.test` is unusable on this machine
and on your developers' machines**: Laravel Valet owns the entire `.test` TLD via its
own dnsmasq on port 53, and owns 80 and 443 as well. The zone is now
**`*.manifest.internal`** (ICANN-reserved, chosen by Rich during the spike), and
Caddy binds a `127.0.0.2` loopback alias so Valet keeps `127.0.0.1:443` untouched.
Verified from Chrome, host `curl` and inside a container. Two success criteria were
**not reached**: the offline boot and the second machine.

| | |
|---|---|
| **Spike** | S7 |
| **Run by** | Claude Opus 5 (Claude Code), for Rich Tape |
| **Dates** | 2026-08-29 |
| **Timebox** | 3 days — **used: ~1.5 h wall clock** |
| **Branch** | `spike/S7` |
| **Verdict** | **Yes, with a zone change.** P1 is unblocked. The DNS design is settled and its configuration is below verbatim. |

---

## Versions

| Component | Version / digest |
|---|---|
| macOS | 26.5.2 (build 25F84), arm64, 36 GiB RAM, 12 cores, 173 GiB free |
| Docker Desktop | 4.87.0 |
| Docker Engine | 29.7.2 (client and server) |
| Docker Compose | v5.4.0 |
| Docker VM memory | 8,319,238,144 bytes = **8.32 GB decimal / 7.75 GiB binary** |
| **Custom Caddy** | **v2.11.4**, image `sha256:afcdcbbdab16c9908bb7d918cbcbcd94325c88b714b79a20f4a1b4d61af622f8` |
| — `caddy-ratelimit` | `github.com/mholt/caddy-ratelimit@v0.1.0` (only version published) |
| — Coraza | `github.com/corazawaf/coraza-caddy/v2@v2.6.0` |
| dnsmasq (in container) | 2.91-r1 (alpine 3.22) |
| **dnsmasq (already on host)** | **2.91, Homebrew, running as `nobody` — Valet's** |
| Postgres | `postgres:16-alpine`, server 16.13 |
| LiteLLM | `ghcr.io/berriai/litellm:main-stable` |
| Registry | `registry:2` · Verdaccio `verdaccio/verdaccio:6` · egress `vimagick/tinyproxy` |
| Ollama (host app) | **0.33.2**, 12 models present |
| curl (host) | 8.7.1, **SecureTransport** — reads the macOS keychain |
| node (host) | v24.12.0 |

---

## The headline finding: `.test` is not available

**START-HERE says `/etc/resolver/test` points "at a nameserver that is not
listening". That is no longer true, and the correction changes the design.**

```
$ ps aux | grep dnsmasq
nobody  618  /opt/homebrew/opt/dnsmasq/sbin/dnsmasq --keep-in-foreground \
             -C /opt/homebrew/etc/dnsmasq.conf -7 /opt/homebrew/etc/dnsmasq.d,*.conf

$ cat /Users/rich/.config/valet/dnsmasq.d/tld-test.conf
address=/.test/127.0.0.1
address=/.test/::1
listen-address=127.0.0.1

$ dig +short @127.0.0.1 console.manifest.test
127.0.0.1                      # already resolves — to Valet's nginx

$ lsof -nP -iTCP:80 -iTCP:443 -sTCP:LISTEN
nginx  657 rich  TCP 127.0.0.1:80 (LISTEN)
nginx  657 rich  TCP 127.0.0.1:443 (LISTEN)
```

**Laravel Valet owns `.test`, port 53, and ports 80 and 443 on this machine.** It is
not an artefact of one developer's setup: Rich confirms *"there's a bunch of our
developers who use .test as a local domain (using laravel valet)"*. Any Manifest
developer running Valet would have hit this, and the failure mode is quiet — names
resolve, so DNS looks fine, and requests land on the wrong web server.

**Decision taken during the spike (Rich's, presented with four options):** the local
zone becomes **`*.manifest.internal`**.

- `.internal` was **reserved by ICANN in July 2024** for exactly this purpose, and
  will never be delegated in public DNS.
- The resolver file is scoped to `manifest.internal`, **never all of `.internal`** —
  Docker's own `host.docker.internal` and `gateway.docker.internal` live in that TLD
  and must keep resolving. Verified working alongside.
- Verified free on this machine, on the host and inside containers, before adoption.
- The spike brief already uses `manifest.internal` in its split-zone fallback, so the
  name is in the design's vocabulary.

**This is a §12/§23 spec change, not a workaround.** See *Spec actions*.

---

## Evidence

### 1. The hypothesis's premise — `--address` is global to the process

The brief asks that this be verified rather than assumed. It is correct. One dnsmasq
with two `--listen-address` values and two `--address` rules for the same zone
returns **both** records to **both** listeners:

```
--listen-address=10.89.0.60 --listen-address=127.0.0.1 \
--address=/manifest.test/10.89.0.10 --address=/manifest.test/127.0.0.1

query via 10.89.0.60 : 10.89.0.10
                       127.0.0.1     <- both
query via 127.0.0.1  : 10.89.0.10
                       127.0.0.1     <- both
```

**Verdict: pass.** Two processes are genuinely required. The hypothesis stands.

### 2. The working configuration — and three flags the brief does not mention

**Process A — answers containers**, at `10.89.0.53`:

```
dnsmasq --keep-in-foreground --no-daemon --log-queries --no-resolv \
        --listen-address=10.89.0.53 --bind-interfaces \
        --local=/manifest.internal/ \
        --address=/manifest.internal/10.89.0.10 \
        --server=127.0.0.11
```

**Process B — answers the host**, at `10.89.0.54`, published to `127.0.0.1:7153`
(UDP **and** TCP):

```
dnsmasq --keep-in-foreground --no-daemon --log-queries --no-resolv \
        --listen-address=10.89.0.54 --bind-interfaces \
        --local=/manifest.internal/ \
        --address=/manifest.internal/127.0.0.2
```

Answers, as required, differ by context:

```
host      : dig +short @127.0.0.1 -p 7153 console.manifest.internal  ->  127.0.0.2
container : dig +short console.manifest.internal                     ->  10.89.0.10
```

**`--local=/manifest.internal/` is load-bearing and cost the most time to find.**
Without it dnsmasq answers AAAA with **SERVFAIL** rather than NODATA, and both musl
and glibc treat SERVFAIL on either half of a dual-stack lookup as total failure. The
symptom is `curl: (6) Could not resolve host` **while `dig +short` returns the
correct A record** — a genuinely misleading failure:

```
# before --local
dig AAAA console.manifest.internal | grep status:   ->  status: SERVFAIL
curl https://console.manifest.internal/             ->  curl: (6) Could not resolve host
# after --local
dig AAAA console.manifest.internal | grep status:   ->  status: NOERROR   (NODATA)
curl https://console.manifest.internal/             ->  200
```

**`--server=127.0.0.11` is also load-bearing.** With `--no-resolv` alone, dnsmasq
becomes authoritative for the entire namespace and containers lose everything else:

```
# without --server=127.0.0.11
registry.npmjs.org  ->  NO RESOLUTION
# with it
manifest.internal   ->  10.89.0.10        (ours)
manifest-registry   ->  10.89.0.2         (Docker service name, preserved)
registry.npmjs.org  ->  2606:4700::6810:b22
```

**Two containers rather than two processes in one container**, because each needs
`--bind-interfaces` on a different address and a container gets one platform-network
IP. Secondary benefit: `docker logs` separates host queries from container queries,
which is most of the debugging value when this goes wrong.

**Verdict: pass.**

### 3. `--dns` does not do what its name suggests — and this is good news

Docker Desktop does **not** replace the container's resolver. It keeps its embedded
resolver primary and sets ours as the **upstream**:

```
$ docker run --dns 10.89.0.53 … cat /etc/resolv.conf
nameserver 127.0.0.11
options ndots:0
# ExtServers: [10.89.0.53]
# Overrides: [nameservers]
```

Our dnsmasq is genuinely consulted — its own query log, from a container:

```
dnsmasq: query[AAAA] probe-xyz.manifest.internal from 10.89.0.5
dnsmasq: config probe-xyz.manifest.internal is NODATA-IPv6
dnsmasq: query[A] probe-xyz.manifest.internal from 10.89.0.5
```

**Verdict: pass, and it removes a worry.** Container-to-container service names and
Compose DNS survive `--dns` intact, so §12's per-container resolver does not cost us
Docker's own name resolution. The `--server=127.0.0.11` forward closes the loop.

### 4. Host: `curl https://…` with no `-k` and no port

```
$ curl -sS https://console.manifest.internal/
manifest-spike OK host=console.manifest.internal scheme=https remote=10.89.0.1
$ curl -sS https://chem-labs.manifest.internal/
manifest-spike OK host=chem-labs.manifest.internal scheme=https remote=10.89.0.1
$ curl -sS https://chem-labs.sandbox.manifest.internal/
manifest-spike OK host=chem-labs.sandbox.manifest.internal scheme=https remote=10.89.0.1
$ curl -sS https://chem-labs.staging.manifest.internal/
manifest-spike OK host=chem-labs.staging.manifest.internal scheme=https remote=10.89.0.1

$ curl -sS -o /dev/null -w "ssl_verify_result=%{ssl_verify_result} http=%{http_code}\n" \
       https://console.manifest.internal/
ssl_verify_result=0 http=200
```

All three of §23's platform zones, one wildcard certificate each. Host `curl` is
built against **SecureTransport**, so `ssl_verify_result=0` *is* macOS keychain
trust — the same store Safari and Chrome consult. Independently:

```
$ security verify-cert -c leaf.pem -c intermediate.crt -p ssl -s console.manifest.internal
exit=0
```

(`security verify-cert` also prints "Certificate Transparency (CT) status: not
verified". That is expected for any private CA — CT applies to publicly-trusted
issuance — and is not a trust failure. The exit code is the verdict.)

**Confirmed in a real browser.** Rich opened the URL in Chrome during the spike and
saw the served response:

```
manifest-spike OK host=console.manifest.internal scheme=https remote=10.89.0.1
```

Reaching page content at all *is* the trust evidence: an untrusted root produces
Chrome's `NET::ERR_CERT_AUTHORITY_INVALID` interstitial instead of the response body.
(The Chrome extension was not connected to this session, so the check was manual
rather than automated.)

**Verdict: pass**, from the host browser, host `curl`, and inside a container.

### 5. Container: the same URL, the same certificate

```
$ docker run --rm --network manifest-spike --dns 10.89.0.53 \
    -v .../manifest-root.crt:/ca.crt:ro curlimages/curl:8.11.1 \
    --cacert /ca.crt -sS https://console.manifest.internal/
manifest-spike OK host=console.manifest.internal scheme=https remote=10.89.0.5
```

Without the CA it fails on **TLS**, not on DNS — which is the correct failure:

```
$ docker run … curlimages/curl -sS https://console.manifest.internal/
… unable to get local issuer certificate …
```

**The parity test**, the same command string in both contexts:

```
host      : manifest-spike OK host=console.manifest.internal scheme=https remote=10.89.0.1
container : manifest-spike OK host=console.manifest.internal scheme=https remote=10.89.0.5
```

Identical hostname, identical scheme, no port anywhere. **This is the property §9
needs** — a SAML `entityID` and ACS URL matching byte-for-byte in both contexts.

**Verdict: pass. This is the half the brief said fails silently if the design is
wrong. It does not fail.**

### 6. A name allocated at runtime, not baked into config

Route added through Caddy's admin API after boot, as `routing/` would (§12):

```
$ curl -X PUT http://127.0.0.1:7119/config/apps/http/servers/srv0/routes/0 \
    -d '{"match":[{"host":["late-arrival.manifest.internal"]}], …}'
admin API -> 200

host      : route created at runtime, after boot, never in any config file
container : route created at runtime, after boot, never in any config file
```

Certificates for such names are issued on demand by Caddy's internal CA and verify
without intervention (`ssl_verify_result=0`). One ordering note for P1: a specific
route must be inserted **before** the wildcard route, or the wildcard's `terminal:
true` swallows it. `PUT …/routes/0` does that; `POST …/routes/0` appended instead.

**Verdict: pass.**

### 7. `NODE_EXTRA_CA_CERTS`, and a trust gap on the host

In a container — §21's stated mechanism, confirmed:

```
with    NODE_EXTRA_CA_CERTS=/ca.crt  ->  OK: manifest-spike OK host=console.manifest.internal
without                              ->  FAIL: UNABLE_TO_GET_ISSUER_CERT_LOCALLY
```

**On the host, keychain trust is not enough for Node.** §21 presents
`NODE_EXTRA_CA_CERTS` as the *container* half of the story, but the control plane,
admin UI and console are **host Node processes** (§21) and Node ignores the macOS
keychain:

```
host curl        ->  ssl_verify_result=0        (keychain)
host python3     ->  works                      (its own CA bundle)
host node        ->  UNABLE_TO_GET_ISSUER_CERT_LOCALLY
host node + NODE_EXTRA_CA_CERTS  ->  OK
```

**Verdict: pass, with an addition to `make seed`.** The three host Node processes
need `NODE_EXTRA_CA_CERTS` exported too — not only containers.

### 8. Port conflicts: the override path, and a better answer

The override path works — Caddy on `127.0.0.1:7180` / `:7143` served everything
above. But **a port in the URL breaks the parity property in §Evidence 5**: the host
would use `https://console.manifest.internal:7143/` while containers use
`https://console.manifest.internal/`, and §9 needs those byte-identical.

The answer that keeps both clean is a **loopback alias**:

```
$ sudo ifconfig lo0 alias 127.0.0.2 up
$ docker run -p 127.0.0.2:80:80 -p 127.0.0.2:443:443 … manifest-caddy
```

Caddy gets real 80/443 on `127.0.0.2`; Valet keeps `127.0.0.1:80` and `:443`;
neither is aware of the other. Confirmed unchanged after the whole spike:

```
$ dscacheutil -q host -a name probe.manifest.test
ip_address: 127.0.0.1          # still Valet's
```

The alias is genuinely required — without it Docker refuses the bind, which is the
check `make doctor` should perform:

```
docker: Error response from daemon: ports are not available:
  exposing port TCP 127.0.0.2:443 -> …: bind: can't assign requested address
```

**Verdict: pass, by a different route than the brief anticipated.** Note the alias
**does not survive a reboot** — `make up` must re-add it, and that needs `sudo`.

### 9. The resolver file

```
$ cat /etc/resolver/manifest.internal
nameserver 127.0.0.1
port 7153

$ scutil --dns | grep -A4 manifest.internal
resolver #10
  domain   : manifest.internal
  nameserver[0] : 127.0.0.1
  port     : 7153
  flags    : Request A records, Request AAAA records

$ dscacheutil -q host -a name console.manifest.internal
ip_address: 127.0.0.2
```

`port` is a documented `resolver(5)` directive, so `--dns` taking no port constrains
only the container side. Scoping to `manifest.internal` leaves `/etc/resolver/test`
and `/etc/resolver/vibonarium.local` untouched — both verified intact afterwards.

**Verdict: pass.**

### 10. The custom Caddy build (§20)

```dockerfile
ARG CADDY_VERSION=2.11.4
FROM caddy:${CADDY_VERSION}-builder AS builder
RUN xcaddy build v${CADDY_VERSION} \
    --with github.com/mholt/caddy-ratelimit@v0.1.0 \
    --with github.com/corazawaf/coraza-caddy/v2@v2.6.0
FROM caddy:${CADDY_VERSION}
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
```

```
$ docker run --rm manifest-caddy:spike caddy list-modules | grep -E "rate_limit|waf"
http.handlers.rate_limit
http.handlers.waf
$ docker run --rm manifest-caddy:spike caddy version
v2.11.4
```

Image digest `sha256:afcdcbbdab16c9908bb7d918cbcbcd94325c88b714b79a20f4a1b4d61af622f8`.

**The Caddy version is not free to choose:** `coraza-caddy/v2@v2.6.0` *requires*
`caddy/v2@v2.11.4` and xcaddy refuses any other. Pinning Caddy and pinning Coraza
are the same decision. Also `caddy-ratelimit` has exactly **one** published version
(`v0.1.0`) — a single-version, single-maintainer dependency in the platform's
"highest-leverage control". Worth naming as supply-chain risk under §12.

**Verdict: pass.**

### 11. The rest of §21's inventory

```
manifest-caddy        Up   (custom xcaddy build)
manifest-dns-host     Up   7153
manifest-dns-containers Up
manifest-registry     Up   7107
manifest-verdaccio    Up   7108
manifest-egress       Up   7109
manifest-litellm      Up   7106
s2-postgres           Up   7103 (healthy)
s2-idp                Up   7122
```

All of 7100–7199 was free, as §21 predicts. Postgres carries the **three databases**
§21 specifies — `manifest_control`, `litellm`, `manifest_idp` — on one server, and
LiteLLM reached Ollama on the host end to end:

```
$ curl http://127.0.0.1:7106/health/readiness
{"status":"healthy","db":"connected"}

$ curl http://127.0.0.1:7106/v1/chat/completions -d '{"model":"default-chat-onprem", …}'
content: 'MANIFEST OK'
usage: {'completion_tokens': 239, 'prompt_tokens': 18, 'total_tokens': 257}
```

**Verdict: pass**, with one caveat: this is nine services proven to boot and answer,
**not** `make up` with health checks, because no Makefile or Compose file exists yet
— that is P1's deliverable. The control plane, admin UI, console and `manifest-mock`
are host Node processes that do not exist yet and were not started.

### 12. Not reached — `make seed`, `make up`, `make doctor`, offline, second machine

**These do not exist and could not be tested.** START-HERE is explicit that they are
P1's deliverable. What the spike *can* say:

- **`make seed` is the only step needing network** — plausible but **unproven**. The
  network-needing steps I hit were: pulling seven images, the `xcaddy` build (Go
  module downloads), and Verdaccio's uplink. All are seed-time. Ollama models were
  already present.
- **`make up` offline** — **not reached.** Rich holds the only Wi-Fi switch and said
  it is not necessary now; I did not disable networking because this session needs
  it. **This remains genuinely unverified** and is the largest open item against C1.
- **A fresh clone on a second machine** — **not reached.** There is no repository to
  clone. This is C1's actual bar and stays untested; the strong recommendation is
  that it be tested on a machine that **is** running Valet, since that is now known
  to be the interesting case.

**Verdict: not reached, and not reachable in this spike.** Recorded rather than
glossed.

---

## Sub-question answers

| Sub-question | Answer | Evidence | Consequence |
|---|---|---|---|
| Does the two-listener dnsmasq hypothesis work? | **Yes**, with three flags the brief omits (`--local`, `--server=127.0.0.11`, `--bind-interfaces`). | 1, 2 | §12's "hypothesis, not a design" can become a design. Configuration below verbatim. |
| Is `--address` really global to the process? | **Yes.** Verified directly. | 1 | Two processes are required; two containers chosen. |
| Does a name resolve correctly from the host? | **Yes** — `127.0.0.2`, trusted TLS, no port, no `-k`. | 4, 9 | Host half settled. |
| Does it resolve from inside a container? | **Yes** — Caddy's platform-network IP, same URL, same trust. | 5 | **The half that fails silently does not fail.** |
| Does a name allocated *at runtime* work in both? | **Yes**, via the Caddy admin API; certificate issued on demand. | 6 | §12's `routing/` design is viable. Insert before the wildcard route. |
| Does the custom `xcaddy` build work? | **Yes.** Caddy v2.11.4 + rate-limit v0.1.0 + Coraza v2.6.0. | 10 | Coraza pins the Caddy version. `caddy-ratelimit` has one release ever. |
| CA trust in two places? | **Three, not two.** Keychain, container `NODE_EXTRA_CA_CERTS`, **and host Node**. | 7 | `make seed` gains a step. |
| Do ports 80/443 override end to end, certificates included? | **Yes**, but a port breaks §9's byte-for-byte parity. Loopback alias is better. | 8 | `make doctor` checks the alias; `make up` re-adds it (needs sudo, lost on reboot). |
| Three Postgres databases on one server? | **Yes** — `manifest_control`, `litellm`, `manifest_idp`. | 11 | Handed to S2, which confirms SimpleSAMLphp shares it read-only. |
| Does `make seed`/`up`/`doctor` work, offline, on a second machine? | **Not reached** — they do not exist. | 12 | C1's actual bar remains untested. Test it on a Valet machine. |

---

## What survives

- **The working dnsmasq configuration and the reasoning** → §Evidence 2, reproduced
  verbatim there with all three non-obvious flags explained.

- **`/etc/resolver/manifest.internal` and its install step**:

  ```
  # contents
  nameserver 127.0.0.1
  port 7153

  # install (sudo)
  sudo cp etc-resolver-manifest.internal /etc/resolver/manifest.internal
  sudo chmod 644 /etc/resolver/manifest.internal
  ```

- **The `xcaddy` build invocation and pinned digests** → §Evidence 10.

- **The CA trust automation** — three steps, not two:

  ```bash
  docker cp <caddy>:/data/caddy/pki/authorities/local/root.crt ./ca/manifest-root.crt
  # 1. macOS keychain — for browsers and curl. PROMPTS for a password.
  sudo security add-trusted-cert -d -r trustRoot \
       -k /Library/Keychains/System.keychain ./ca/manifest-root.crt
  # 2. containers
  -e NODE_EXTRA_CA_CERTS=/ca.crt  (plus a read-only mount)
  # 3. HOST Node processes — control plane, admin UI, console. NOT covered by 1.
  export NODE_EXTRA_CA_CERTS=$PWD/ca/manifest-root.crt
  ```

- **The `make doctor` check list, which becomes P1's spec.** Each item below failed
  or nearly failed during this spike, so none is hypothetical:

  | Check | Why — what actually went wrong |
  |---|---|
  | Docker running; VM memory ≥ 8 GB | Measured 8.32 GB decimal but **7.75 GiB binary**. State the unit or the check is ambiguous. |
  | Ollama up, required models present | Host app; 0.33.2, 12 models. |
  | `/etc/resolver/manifest.internal` present, correct port | — |
  | **`127.0.0.2` alias present on lo0** | Docker refuses the bind without it; **lost on every reboot**. |
  | CA trusted in the keychain **and** `NODE_EXTRA_CA_CERTS` exported | Keychain does not cover host Node. |
  | Ports 7100–7199 free | All free here. |
  | **Ports 80/443: free, or the alias in use** | Both held by Valet's nginx. |
  | **Nothing else owns the platform zone** — `dig` it and check the answer | Valet answers for all of `.test`. This is the check that would have caught the whole problem. |
  | **Port 53: report what owns it, do not assume it is free** | A Homebrew dnsmasq owns it. |
  | Disk ≥ 40 GB | 173 GiB free. |
  | Architecture recorded | arm64. |
  | Postgres reachable, three databases present | The IdP needs it for **every** SP lookup (S2). |

- **Every manual step that could not be automated** → the section below.

---

## What did not work

- **`*.manifest.test` — abandoned, and this is the spike's most valuable output.**
  Valet owns the TLD, port 53 and ports 80/443. Not a machine quirk: a group of UBC
  developers run Valet. Replaced with `*.manifest.internal`.

- **A single dnsmasq process with two listeners.** Confirms the brief's premise
  rather than contradicting it: `--address` is global to the process.

- **dnsmasq without `--local=/<zone>/`.** SERVFAIL on AAAA breaks `curl` and every
  musl/glibc resolver while `dig +short` still looks perfect. The most misleading
  failure in the spike.

- **dnsmasq with `--no-resolv` and no `--server`.** Kills external and
  container-to-container resolution for every container using `--dns`.

- **Publishing Caddy on `127.0.0.2` before creating the alias.** Docker error, not a
  silent failure — good, and it is the `make doctor` check.

- **`coraza-caddy/v2@v2.0.1`** — the version I first guessed does not exist; and
  `v2.6.0` then forced Caddy 2.11.4, refusing 2.10.2.

- **`POST /config/.../routes/0`** appends rather than inserts, so the wildcard route's
  `terminal: true` swallowed the new host. `PUT` inserts.

- **LiteLLM against Postgres on a different Docker network** — `P1001: Can't reach
  database server`. Obvious in hindsight; noted because P1 will assemble these same
  containers and the error names the database, not the network.

- **Browser verification** — the Chrome extension was not connected. I verified the
  trust path a browser uses instead of driving one, and say so rather than implying
  otherwise.

---

## Spec actions

| Section | Current text | Proposed change | Why |
|---|---|---|---|
| §12 *DNS* | "**`*.manifest.test`**, served by a **dnsmasq container**." | "**`*.manifest.internal`**, served by dnsmasq. `.test` is unusable: Laravel Valet claims the entire TLD together with ports 53, 80 and 443, and several UBC developers run it. `.internal` is ICANN-reserved (July 2024) and will never be publicly delegated. The resolver file is scoped to `manifest.internal`, never all of `.internal`, because Docker's `host.docker.internal` lives in that TLD." | The headline finding. Also update every `manifest.test` example in §12, §21 and §23. |
| §12 *DNS* | "**Open, and S7's job to settle:** … The likely answer is interface-bound dnsmasq views … but that is a hypothesis, not a design." | Replace with the settled design: two dnsmasq processes as two containers, host answered `127.0.0.2` via `/etc/resolver/manifest.internal` port 7153, containers answered Caddy's platform-network IP via `--dns`. Record `--local=/manifest.internal/` and `--server=127.0.0.11` as required. | Settled. §Evidence 1–5. |
| §12 *DNS* | "Containers receive it as their resolver. This is **per-container** (`--dns` takes an IP and no port)". | Add: "On Docker Desktop `--dns` sets the **upstream** for Docker's embedded resolver rather than replacing it, so container-to-container service names keep working — provided our dnsmasq forwards non-zone queries to `127.0.0.11`." | Removes a real worry, and names the flag without which it breaks. §Evidence 3. |
| §12 *DNS* | "Everything binds `127.0.0.1` explicitly; relying on `::1` produces intermittent failures under Node's IPv6-first resolution order." | Add: "The DNS server must also answer **NODATA** rather than SERVFAIL for AAAA in the zone (`--local=/<zone>/`); SERVFAIL on either half of a dual-stack lookup fails the whole lookup in musl and glibc alike." | A sharper form of the same hazard, and the one that actually bit. §Evidence 2. |
| §21 *Platform inventory* | "Caddy (edge) 80, 443 — Both listeners on loopback locally … both are overridable." | Add: "Locally, prefer a **loopback alias** (`sudo ifconfig lo0 alias 127.0.0.2 up`) over a port override: a port in the host URL breaks the byte-for-byte hostname parity §9 requires. The alias does not survive a reboot, so `make up` re-adds it." | Preserves parity and coexists with Valet. §Evidence 8. |
| §21 *TLS* | "the root must be trusted in two places: the macOS keychain … and container trust stores via `NODE_EXTRA_CA_CERTS`." | "**three places**: the macOS keychain (browsers and curl), container trust stores, and the **host Node processes** — control plane, admin UI and console — which ignore the keychain and need `NODE_EXTRA_CA_CERTS` too." | §21's own inventory makes three of these host Node processes. §Evidence 7. |
| §21 *Hardware floor* | "≥8 GB allocated to the Docker VM" | State the unit: this machine reports 8.32 GB decimal / **7.75 GiB** binary, so it passes or fails depending on reading. | `make doctor` cannot implement an ambiguous threshold. |
| §20 *The edge as a control point* | "Rate limiting and Coraza are third-party modules requiring an `xcaddy` build" | Add: "Coraza pins the Caddy version (`coraza-caddy/v2@v2.6.0` requires `caddy/v2@v2.11.4`), and `caddy-ratelimit` has exactly one published release (`v0.1.0`). Upgrading Caddy is therefore gated on Coraza, and the rate limiter is a single-version dependency — both belong in §12's supply-chain review." | Real, load-bearing supply-chain constraints on "the highest-leverage control in the platform". §Evidence 10. |
| §23 *The three platform zones* | "`chem-labs.sandbox.manifest.test`, `.staging.`, and `chem-labs.manifest.test`" | `chem-labs.sandbox.manifest.internal`, `.staging.`, `chem-labs.manifest.internal`. All three verified serving with a trusted wildcard certificate. | Consequential rename. §Evidence 4. |

---

## Open questions

- **Does `make up` actually work offline?** **Not tested** — the largest open item
  against C1. Needs Wi-Fi off for ~2 minutes on a machine that is not driving the
  test. **Not a spike**; it is a check to run once P1 exists.
- **Does a fresh clone on a second machine reach the same state?** **Not tested** —
  no repository yet. This is C1's real bar. **Run it on a machine that has Valet
  installed**, now that Valet is known to be the interesting case.
- **What do Linux colleagues do?** `/etc/resolver` is macOS-only. On Linux the host
  half needs `systemd-resolved` or `/etc/hosts`. **Worth a small spike** before
  anyone non-Mac joins — the container half is portable, the host half is not.
- **Is `127.0.0.2` the right alias, and who owns re-adding it after a reboot?**
  Needs `sudo` in `make up`, which START-HERE flags as a C1 defect. **A decision.**
- **Does Valet coexistence hold under `valet park`/`valet link`?** Not exercised.
  Since developers keep using Valet, worth one check.
- **`ndots:0`** appears in container `resolv.conf`. Not investigated; it can affect
  short-name lookups inside app containers.

---

## Manual steps that could not be automated

Each is a defect against C1's "new developer from a clean checkout" bar.

- **`sudo` is needed three times**, and Rich had to run them because `sudo` cannot
  prompt from a tool call:
  1. `cp` the resolver file into `/etc/resolver/` — **root-owned directory**.
  2. `security add-trusted-cert -k /Library/Keychains/System.keychain` — **prompts
     for a password even with sudo**. §21 calls this "one automated step … not a
     manual dance"; it is automatable but **not silent**, and D12 should not be read
     as claiming otherwise.
  3. `ifconfig lo0 alias 127.0.0.2 up` — and **this one recurs after every reboot**,
     so it is not a one-time seed step but a `make up` step.
- **Docker Desktop's VM memory** cannot be raised from the CLI — a GUI step if a
  developer's VM is under the floor. `make doctor` can only report it.
- **Ollama models** were already present. On a clean machine this is a large,
  network-dependent, wholly manual-feeling wait; `make seed` should show progress.
- **Nothing else required intervention.** The nine containers, the DNS, the
  certificates and the routing all came up unattended.

---

## Machine state

Everything this spike changed on the host is reversible and scripted:

```
sudo bash <scratchpad>/S7/restore/UNDO.sh     # resolver file, lo0 alias, CA trust
bash        <scratchpad>/S7/restore/DOCKER-UNDO.sh   # containers, images, volumes, network
```

A snapshot of `/etc/resolver`, `lo0`, the listener set and both dnsmasq
configuration trees was taken **before** any change, and is in
`<scratchpad>/S7/restore/`. **Valet was never touched**: `/etc/resolver/test`, its
dnsmasq and its nginx are byte-identical, and `probe.manifest.test` still resolves to
`127.0.0.1` as it did before.
