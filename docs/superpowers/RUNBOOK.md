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

## Known gaps

*(Completed by Task 13's offline and second-machine runs — see below.)*
