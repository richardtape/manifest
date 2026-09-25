# Traps — the full catalogue

*Moved here from ORIENTATION §4 on 2026-09-24, **word for word**, at Rich's request, when ORIENTATION had grown to
325 KB and this catalogue was 134 KB of it. ORIENTATION §4 keeps the 27 traps most likely to cost the next sitting,
each naming what to search for here. **This file is meant to be SEARCHED, not read through.** Plans and records
written before the move cite it as "ORIENTATION §4" or "§4's *Things that will cost you a morning*" — they mean
this file.*

*Entries are in the order they were found, oldest first. **Nothing was merged or deleted in the move**, so some
traps appear more than once, from different sittings — each entry is still true where it says so. The known
clusters: **zsh** (six entries: word-splitting, `${PIPESTATUS}`, `local path=`, a leading `=`, a pipeline's and a
background wrapper's exit status); **single-file bind mounts** (six: the Caddyfile twice, the IdP's config,
LiteLLM's config twice, a moved directory); **`pnpm test` truncating state** (five); **the permission classifier**
(three); **driving Chrome** (five); **S6's probe 14 and a cold model** (two); **the edge's wildcard `200`**
(three); **drizzle migrations** (four, two of which — `drizzle-kit migrate needs MANIFEST_DATABASE_URL` and
`db:migrate NEEDS THE ADMIN URL` — are the same fact); **`docker network rm`** (two); **`make reset`** (four).
**About a dozen describe defects since FIXED** — the console's *Sign out* leaving the IdP session alive (twice, one
struck through), the egress proxy that answered for its first deploy, a build finishing inside its own POST, and
others marked FIXED in their text — and are kept as history.*

*An entry that cites "README's *Running the control plane*" or "README's export block" means RUNBOOK's section of that name: it moved there, word for word, on 2026-09-24.*

**New traps go at the end of *Things that will cost you a morning*.** Add one to ORIENTATION §4's list too only if
it belongs among the traps the next sitting is most likely to hit.

## Things that will cost you a morning

- **A `REVOKE` against a SUPERUSER is a no-op that reads exactly like a control.**
  `manifest` is `POSTGRES_USER`, so Postgres created it as a superuser and it bypasses
  every privilege check: measured 2026-09-09, `REVOKE UPDATE, DELETE ON t FROM manifest`
  → `REVOKE`, then `UPDATE 1`, `DELETE 1`. The control plane therefore connects as
  **`manifest_app`** (`infra/lib/ensure-app-role.sh`, run by `make up`), and so does
  `pnpm test` — a grant is only observable from the role it constrains. **The README's
  export block now has THREE database URLs**: the app's, `MANIFEST_ADMIN_DATABASE_URL`
  for `db:migrate` and the harness's `TRUNCATE`, and the IdP's.
- **A foreign key's `ON DELETE CASCADE` runs with the REFERENCED table's privileges**,
  not the caller's — so it walks straight through a grant on the referencing table. With
  `audit.events` correctly refusing `UPDATE`, `DELETE` and `TRUNCATE`, deleting the
  project removed its audit rows anyway. `audit.events` is `ON DELETE RESTRICT`.
- **`--local=/manifest.internal/` is mandatory** on dnsmasq. Without it AAAA returns
  **SERVFAIL** instead of NODATA, and both musl and glibc treat SERVFAIL on either
  half of a dual-stack lookup as total failure. The symptom is
  `curl: (6) Could not resolve host` **while `dig +short` returns the correct A
  record.** The single most misleading failure in the project so far.
- **`--server=127.0.0.11` is mandatory.** Without it `--no-resolv` makes dnsmasq
  authoritative for everything and containers lose Docker service names *and*
  external resolution.
- **`--address` is global to a dnsmasq *process*.** Verified. That is why there are
  two dnsmasq containers rather than one with two listeners.
- **On Docker Desktop, `--dns` sets the *upstream*** for Docker's embedded resolver
  rather than replacing it. `/etc/resolv.conf` still says `nameserver 127.0.0.11`.
  Good news — service names survive. Do not conclude `--dns` is ignored.
- **Caddy admin API: `PUT` inserts, `POST` appends** — and appending puts your route
  behind the wildcard whose `terminal: true` swallows it.
- **A host process cannot reach container IPs** on Docker Desktop, so health checks
  go through the edge or a published port.
- **`localhost` resolves to `::1` and times out** in build tooling. Use `127.0.0.1`.
- **Restarting Caddy discards all runtime routes.** Route *changes* under load are
  safe: 0 failures in 400 requests across 12 add/remove cycles.
- **User-namespace remapping silently does nothing** on Docker Desktop. Every other
  §12 hardening flag genuinely enforces.
- **LiteLLM serves admin and proxy traffic on ONE port.** There is no admin port to
  firewall; confinement is per-key `allowed_routes`.
- **A LiteLLM key minted with `models: []` reaches EVERY model, not none.** Measured
  2026-09-14 on 1.98.0: it listed all three catalogue entries and embedded with a model it was
  never given, while the same key with `['default-chat']` was refused the other with 403.
  `ai/keys.ts` refuses an empty list.
- **`make up` does not apply an edit to `infra/litellm/config.yaml`.** It is a single-file
  `:ro` bind mount LiteLLM reads once at start, and compose sees no service change — the shape
  the Caddyfile had. `docker restart manifest-litellm` applies it, in ~10 s. Measured 2026-09-14.
- **`/key/delete` accepts the hashed `token` that `/user/info` reports**, so a key nobody saw —
  one `/user/new` auto-created — can still be removed. Measured 2026-09-14.
- **LiteLLM checks a key when a request STARTS.** A streaming completion whose key was deleted 7 s
  in ran on to a normal finish — 961 of its 1,003 characters after the delete — while a new request
  with that key got 401. Measured 2026-09-14 on 1.98.0. Revoking a key cannot cut off a stream
  already under way; it only refuses the next request.
- **Most Ollama models on this machine are *thinking* models**, and that breaks
  streaming silently: zero content frames, no error, at any token budget.
- **`node src/index.ts` does not work here**, even though Node 24 strips TypeScript
  types natively. The source uses NodeNext `.js` specifiers and Node resolves them
  **literally**, so it looks for `src/api/index.js` and does not find it. Compile
  with `tsc` and run `dist/index.js`. `pnpm --filter @manifest/control-plane dev`
  does both.
- **`pnpm test` and `pnpm --filter … test` are not the same command.** The filtered
  form runs with the *package* directory as its working directory; the root form does
  not. Any cwd-relative path in a test passes under one and `ENOENT`s under the other.
  **`pnpm test` from the repo root is the one that counts** — it is what CLAUDE.md
  requires before a commit.
- **`node --experimental-strip-types` cannot run this repo's TypeScript either**, and
  for a *different* reason from the one above: strip-only mode rejects **parameter
  properties**, and `EngineError`, `ScanError`, `BuildGateError` and `ConfigError` all
  use them — `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. So a throwaway `node -e` script that
  imports a `.ts` file to poke at it does not work. Write a scratch **test** instead,
  or drive the thing through `docker`/`curl` directly.
- **A `sed`/`python .replace()` negative control silently matches nothing after
  Prettier has reformatted its target — and every test then passes.** That reads as
  *"the control cannot fail"* and means *"the control never ran"*; it happened on
  2026-09-06 while proving a scan rule, and it is the same shape as every other
  could-not-fail check this project has paid for. **Assert the pattern matched before
  writing the file.** A `git diff` after the edit is the other cheap proof.
- **Vitest strips types; it does not check them.** A file can pass every one of its
  tests and have four `tsc` errors. `pnpm typecheck` (every package — P5a Task 7)
  is the only gate that sees them, and this repo's `exactOptionalPropertyTypes` makes
  that class common: `hint: cond ? x : undefined` is a type error, conditional spread
  is the fix.
- **`fileParallelism` is a ROOT-level Vitest option.** Setting it in a package's
  `vitest.config.ts` has no effect on a workspace run, and the symptom is a suite that
  fails a *different* number of tests on each run.
- **A shell PIPELINE takes its exit status from the LAST command**, so
  `git archive … | tar -x` reports success when `git` dies. Measured 2026-09-07:
  `git --git-dir=file://… archive HEAD` exits **128** and the pipeline exits **0**,
  which made every failed build-context export produce an empty directory and a
  clean bill of health. `set -o pipefail` is not available in `execFile('sh', …)`
  by default — run the two commands separately.
- **BusyBox `wget` honours `http_proxy` and does not support `NO_PROXY` at all.**
  On BusyBox v1.37.0 a container health check of its own `127.0.0.1` is sent to the
  egress proxy and comes back `403 Filtered`. `wget -Y off` is the switch. This
  silently marked every deployed app `unhealthy` while it was serving perfectly.
- **`request.log.error` under `Fastify({ logger: false })` writes nothing** — it
  exists and accepts the call. Same trap as `app.log.info` on the boot line. Use
  `console.error` for anything an operator must be able to see.
- **An unqualified image name is DOCKER HUB to the daemon.** `local/chem-labs@sha…`
  resolves as `docker.io/local/chem-labs` and 401s. Record the repository the build
  produced; never re-derive it from a slug.
- **`docker network rm` fails while ANY container is still attached**, and the app
  networks always have two: `ensureAppNetwork` attaches `manifest-caddy` and
  `manifest-dns-containers` to every one of them by design. `make reset` only worked
  because `compose down` ran first and stopped them — correctness by accident of
  ordering, with `|| true` hiding the failure. It now disconnects them explicitly.
  Measured 2026-09-07: five app networks survived a cleanup that reported success.
- **`docker rm` without `-v` orphans the container's anonymous volumes**, and
  `mongodb/mongodb-community-server` declares **two** volumes while the driver binds
  only `/data/db`. `moby/buildkit` likewise declares one the ephemeral builder does
  not bind — harmless while the process lives, because the driver deletes with
  `v=true` in a `finally`, but one empty volume per build leaks if the control plane
  is killed mid-build. **`docker volume ls -f dangling=true` is NOT a safe prune
  list**: it includes *named* volumes that merely have no container attached, so it
  lists `manifest-caddy-data` — the trusted CA — and other people's volumes. List and
  date them, then remove by id.
- **`registry garbage-collect` on a RUNNING registry corrupts it.** It deletes the
  manifest blob and leaves the tag and revision links, after which every `docker
  push` of the same content reports success **with the correct digest** while the
  registry answers 404. Stop or restart the registry around a GC.
- **This `registry:2` does not split a comma-joined `Accept` header**, and mirrored
  base images are **OCI** manifests. Pass separate `-H 'Accept: …'` flags including
  `application/vnd.oci.image.manifest.v1+json`, or you get a 404 that reads exactly
  like a missing image: `OCI manifest found, but accept header does not support OCI
  manifests`.
- **npm's `replace-registry-host` defaults to `npmjs`**, so a mirror redirect only
  applies to lockfiles whose `resolved` URLs name registry.npmjs.org. Any other host
  is fetched directly, past the mirror. `replace-registry-host=always` is what D13
  actually means.
- **`pnpm test` TRUNCATES the control plane's §6 tables** — `vitest.global-setup.ts`
  does it once per run, deliberately, so a run never inherits the last one's rows.
  It also means running the suite wipes whatever `make demo` created. **So does ONE file**:
  `pnpm exec vitest run --project unit <file>` runs the same `globalSetup`, and measured
  2026-09-16 (P5a sitting 1) it emptied `projects`, `users`, `instances`, `routes` and `secrets`
  for a test that touches no database — which would have failed the next measurement, a sign-in
  that needed the demo's project. Run anything that needs a demo's rows BEFORE any Vitest run.
- **The Manifest IdP could not issue an assertion, and `make verify` was 34/0.**
  Measured 2026-09-07: the image ships only `saml20-idp-hosted.php.dist` and an empty
  `cert/`, so `/module.php/saml/idp/metadata` answered **500** —
  *"Could not find any default metadata entities in set [saml20-idp-hosted]"*. Verify
  checked that the IdP served a page, that `pdo_pgsql` was present and that a row
  round-tripped through the metadata handler; none of that touches signing. **P4a
  Task 1 fixes it.** The general lesson is the one this project keeps re-learning: a
  check that does not complete the operation proves the operation can start.
- **SimpleSAMLphp 2.x's endpoint paths are not 1.x's, and `passport-ubcshib`
  hardcodes 1.x's.** `UBC_CONFIG.LOCAL` carries
  `/simplesaml/saml2/idp/SSOService.php`; 2.x serves
  `/module.php/saml/idp/singleSignOnService`, `…/singleLogout` and `…/metadata`
  (read off the running container's `routes.yml`). This is why §8 makes
  `SAML_ENTRY_POINT` mandatory, and a 404 from the IdP reads as "the IdP is down".
- **SimpleSAMLphp validates any AuthnRequest signature that is PRESENT**, whether or
  not the SP's row says `validate.authnrequest`. So an app that signs and a row with no
  `certData` is refused with *"Missing certificate in metadata"* — which reads as a
  missing registration rather than a missing key — and, the other way round, the
  `validate.authnrequest` flag can be deleted without any wrong-key test noticing. Only
  an SP that does **not** sign can show that flag doing anything. Measured 2026-09-09.
- **The IdP's error page never says why.** `showerrors` is off, as it must be on a
  deployed IdP, so an uncaught exception renders as "Unhandled exception" and the reason
  exists only in the container log. A *titled* error (metadata not found, invalid
  certificate signature) does put its title in `<title>`, which is why some assertions
  against the page body work and others silently cannot. Read `docker logs manifest-idp`
  — and count occurrences before and after, or a line from an earlier run stands in for
  a refusal that never happened.
- **`core:AttributeLimit` is not in SimpleSAMLphp's default chain**, so a metadata
  row's `attributes` list is advisory — S2 measured three declared and thirteen
  released. An empty list is also treated as "no limit". Both fail **open**, silently,
  and both were live here until P4a Task 2.
- **The OpenAI SDK cannot be forced through an HTTP proxy by any environment setting.**
  Measured 2026-09-07 against three mechanisms: `http_proxy` is ignored; undici's
  `setGlobalDispatcher(new ProxyAgent(…))` fixes global `fetch` and **not** the SDK;
  a patched `http.globalAgent` is bypassed too. The SDK bundles `node-fetch` and
  supplies its own `agentkeepalive` agent, and its only supported override is the
  `httpAgent` constructor option — which `ubc-genai-toolkit-llm` does not expose.
  So an app on an `--internal` network cannot reach LiteLLM through the egress proxy.
- **Fastify runs root-level hooks for the not-found handler too**, and an unmatched
  route has no `routeOptions.config` to opt out with. A `preHandler` that throws will
  turn every 404 into whatever it throws. Guard on
  `request.routeOptions.url === undefined`.

- **SimpleSAMLphp 2.x enables only `core`, `admin` and `saml`.** Every D6 test user is
  defined with `exampleauth:UserPass`, so until 2026-09-08 every SSO request answered
  **500** — *"The module 'exampleauth' is not enabled"* — while `make verify` said
  43/0. `config.php` must `array_merge` into the dist's `module.enable`, never replace
  it, or `core`, `admin` and `saml` go with it.
- **`config.php.dist` already ships `50 => core:AttributeLimit`**, and our `config.php`
  merges *over* the dist, so the filter has been live since P1. What was missing was
  the OID map. A plan that says otherwise was written against the file we wrote rather
  than the file that runs.
- **`core:AttributeLimit` compares the SP row's list against the attribute KEYS as
  they stand at its priority.** Measured, all four combinations: auth source emitting
  OIDs + a row declaring friendly names releases **nothing**; friendly + friendly
  releases the two declared; OID + OID also works; and an **empty or absent** list
  releases **everything**. That last one is S2's fail-open and is why there is a
  `CHECK` constraint.
- **`jsonb_array_length(NULL)` is NULL and `NULL > 0` is NULL — which a CHECK
  ACCEPTS.** A constraint written without `COALESCE` rejects `"attributes": []` and
  waves through a row with no `attributes` key at all, and AttributeLimit treats those
  two identically.
- **`bin/initMDSPdo.php` issues `CREATE TABLE` through `database.*`** — the same
  credentials the request path reads metadata with. Making that user read-only makes
  the container restart-loop on `permission denied for schema public`. `SSP_DB_INIT`
  scopes the owning role to that one command.
- **`make up` could not apply a Caddyfile edit.** The file is bind-mounted and read
  once at container start, and compose sees no service change when only content
  changed. `infra/lib/ensure-caddy-config.sh` now reloads the edge, **conditional on a
  hash** kept in the edge's own volume — `caddy reload` replaces the whole config and
  an unconditional reload would drop the driver's runtime routes on every `make up`.
- **`mv`-ing a bind-mounted DIRECTORY leaves the running container on the old inode.**
  A negative control that moves one aside and runs `make up` changes nothing; the
  container has to be force-recreated. Commenting the mount out of `compose.yaml`
  *does* work, because that changes the service definition.
- **The container rootfs is READ-ONLY (§12), and the daemon refuses to write into it**
  — `container rootfs is marked read-only`. A **volume** path on the same container is
  accepted, and `:ro` on that volume is refused too (`mounted volume is marked
  read-only`). That is why `InstanceSpec.files` is backed by a per-instance volume at
  `/manifest`, mounted read-write, with **file ownership** carrying the protection.
- **`CapDrop: ALL` takes `CAP_DAC_OVERRIDE` with it, so root inside a container cannot
  read past permission bits.** Measured 2026-09-08: a `0400` file owned by uid 10001
  was unreadable by root — `stat` fine, `cat` silent. Anything the app must read has to
  be reachable by ownership or group, never by privilege.
- **`destroyInstance` takes the CONTAINER name (`appContainer(instanceName(…))`), not
  the instance name.** Passing the wrong one destroys nothing, and `ensureInstance` is
  idempotent by name — so a stale container survives and every later run silently
  redeploys nothing and tests the first image it ever built.
- **`passport-ubcshib` exports `Strategy`, not `UBCStrategy`.** It is CommonJS ending
  `module.exports = { Strategy: UBCStrategy, … }`, so a named import is `undefined` and
  `new undefined(...)` throws at construction.
- **`AuthState` comes out of an HTML attribute and carries a query string**, so it
  arrives with `&amp;`. Posting it undecoded means SimpleSAMLphp cannot match the
  pending authentication and the SAML flow loops rather than failing.
- **`passport-saml` is npm-DEPRECATED and carries a critical signature-verification
  advisory (GHSA-4mxg-3p6v-xgq3) at range `*`**, with `@xmldom/xmldom@0.7.13`
  underneath it. `@node-saml/passport-saml@5.1.0` audits clean. §12's scan gate now
  blocks only on findings that **have a published fix** (Rich, 2026-09-08) — and it
  still has teeth: the xmldom highs blocked until an npm `override` to 0.8.15.
- **Two libsodium seals of one value differ even when the data key is SHARED**, so
  "the ciphertext differs" proves nothing about per-secret keys. The nonce is random
  and `crypto_box_seal` draws an ephemeral keypair per call, so both `ciphertext` and
  `wrappedKey` change either way. Measured 2026-09-08 by hoisting the data key out of
  `sealSecret`: the test written to catch exactly that stayed green. The observable
  consequence of reuse is that one envelope's wrapped key opens **another's**
  ciphertext — assert that instead.
- **An APPLIED drizzle migration is never re-run**, because `drizzle/meta/_journal.json`
  records it by tag. Editing a migration file that has already run changes nothing on
  any existing database and everything on a fresh one, so the two diverge silently.
  New SQL needs a new migration. `drizzle-kit generate` also names the file itself, so
  a plan naming `0001_something.sql` is naming a file that will not exist.
- **`drizzle-kit migrate` needs `MANIFEST_DATABASE_URL` exported**, which `.env` does
  NOT contain — `.env` carries `POSTGRES_PASSWORD` and the URL is derived from it
  (`vitest.env.ts` does this for tests). README's *Running the control plane* has the
  two-line export; without it the failure is `Please provide required params for
  Postgres driver: [x] url: undefined`, which reads like a broken config file.
- **macOS `openssl` cannot emit a raw X25519 key**, and libsodium wants the bare 32
  bytes. `openssl pkey -outform DER | tail -c 32` works for both halves because RFC 8410
  fixes the prefix lengths (48 DER bytes private, 44 public). **Length proves nothing
  about correctness** — a wrong extraction still yields 32 bytes — so seal and open with
  the file's own two halves before trusting it. `infra/lib/ensure-master-key.sh` does it
  this way and it was verified against libsodium on 2026-09-08.
- **Verdaccio caches a tarball when it is DOWNLOADED.** `npm install
  --package-lock-only` resolves metadata and downloads nothing, so a warm step that
  uses it leaves the mirror holding package documents and **no `.tgz`** —
  indistinguishable from a warm mirror until the network goes away.
  `find /verdaccio/storage -name '*.tgz'` is what tells the two apart. **`make verify`
  now asserts this standing**, for every blueprint and fixture lockfile — 210 tarballs
  as of 2026-09-09 — because Verdaccio *proxies* whatever it does not hold, so a cold
  mirror and a warm one behave identically right up until C1 matters. **Measured as a
  negative control on 2026-09-16 (P4c finding 55):** with `connect-mongo` moved out of
  `/verdaccio/storage`, a real build of `node-ts-mongo@1` passed, and Verdaccio had put a
  byte-identical tarball back from npmjs by the time it finished. So "empty the mirror and
  rebuild" **cannot fail with the network on**; `make verify` named the missing tarball
  and its lockfile, and is the control to use.
- **A `cat <dir>/*` stamp is a TOP-LEVEL glob and cannot see a subdirectory.**
  `fixtureBareRepo` used one, and no source tree here had a subdirectory until
  `node-ts-mongo@1`'s `skeleton/auth/`. Measured 2026-09-09: editing
  `auth/ubcshib.js` left the hash byte-identical, so the cached bare repo would have
  been reused and the build would have tested the code *before* the edit — the same
  shape as the stale container that served four runs of a suite. It is `find -type f`
  over names **and** contents now.
- **A shell fragment inside a TypeScript template literal has its escapes eaten by
  TypeScript.** `` `… | tr '\n' '\0' | …` `` compiles to a string containing a real
  NUL byte, and `execFileSync` refuses it: *"args[1] must be a string without null
  bytes."* Double the backslashes. Same family as the Prettier trap — the edit applies
  cleanly and the thing it produces is not what it reads like.
- **A `process.env.X` scan counts COMMENTS, and the dangerous half is silent.** A
  comment mentioning a variable invents a requirement, which is noisy and obvious; a
  read that has been **commented out** still matches, which means "the blueprint reads
  every variable the platform injects" passes against a variable the running app never
  reads. `spec/injection-drift.test.ts` strips comments and string bodies with a
  scanner rather than a regex — `'//'` inside a string is not a comment.
- **`tsc` will not follow a relative import outside the package's `rootDir`**, so a
  test importing app-side blueprint JavaScript is a TS7016 error `pnpm test` cannot
  see. `blueprints/attribute-bridge.test.ts` loads it through a computed specifier with
  one explicit cast — and that cast must spell out its key union, because
  `noUncheckedIndexedAccess` makes an indexed read `string | undefined` and a computed
  key of that type becomes the literal string `"undefined"`.
- **LiteLLM's admin API answers its OWN errors in a route denial's envelope.** It is
  FastAPI, so an unknown route is `404 {"detail":"Not Found"}` and a refused body
  `422 {"detail":[…]}` — the same `{"detail": …}` shape `allowed_routes` refuses with, and
  the 422 echoes the refused `input` back. `mapLiteLlmError` treats a `detail` body as a
  route denial **only on a 403**. Measured 2026-09-14, LiteLLM 1.98.0.
- **A LiteLLM key with a `models` list never sees "unknown model".** Any model off its
  list, existing or not, is `403 key_model_access_denied`; S3's `400` with `type: "None"`
  comes only from a key with no list, such as the master key. Every app key carries a
  list, so an app's misspelt model reads as *not permitted*. Measured 2026-09-14.
- **LiteLLM's errors reach callers as a code and a status, never as text** — that is
  `ai/client.ts`'s job. So a caller that matches an error MESSAGE (`/already exists/`)
  never matches. A duplicate `/user/new` is **409**; test the status.
- **`pnpm test -- <filter>` does not filter** — it runs every file. The one-file loop is
  `pnpm exec vitest run --project unit src/ai/errors`.
- **Node's `JSON.parse` QUOTES the text it could not parse** in its `SyntaxError`, so
  letting one propagate from a third-party body leaks the body. `ai/client.ts` catches it
  on the success path as well as the error path.
- **A Docker network removed under a STOPPED container leaves that container unable to
  start.** A stopped container keeps a network connection the network's own read-back does
  not list, so `network rm` succeeds — and then `docker start` fails with `failed to set up
  container networking: network … not found`. Measured 2026-09-14 on a throwaway container.
  A force-disconnect of a stopped container works, and one that is not attached answers `is
  not connected to the network`. That is why `destroyAppNetwork` sweeps every platform
  neighbour as well as what the network lists: a read-back-only teardown run while
  `manifest-litellm` is stopped would leave the gateway unstartable.
- **An empty `model_info:` in `infra/litellm/config.yaml` stops LiteLLM starting — for
  every app.** Deleting the only key under it leaves the mapping null, and 1.98.0 exits on
  start (`TypeError: argument of type 'NoneType' is not iterable`, `Application startup
  failed. Exiting.`), restarting every ~10 s. Measured 2026-09-14. So §7's "an unclassified
  model refuses only itself" holds only while `model_info` is still a mapping: to take a
  classification away, make it invalid, never delete the line.
- **Two Bash tool calls issued together share one shell**, so a `cd` in one moves the
  other's working directory mid-command. Measured 2026-09-14, when a guard refused seven
  edits it could no longer find. Use absolute paths in anything issued in parallel.
- **The Docker tier leaves images in the daemon, and one image can carry two names.**
  Deploys pull what the builder pushed into the daemon's store as
  `127.0.0.1:7107/local/<slug>@sha256:…`, so a before/after snapshot shows new `<none>`
  entries even when nothing else changed. Remove one only if its digest is absent from the
  starting snapshot under EVERY name: two fixtures built from the same source share a digest
  (`local/fixture-s6` and `local/fixture-rt`), `docker image rm <id>` then answers
  `referenced in multiple repositories`, and untagging one name only moves the diff to the
  other. Measured 2026-09-14, when four were left behind.
- **`npm install` warms NOTHING a developer's npm cache already holds.** npm takes a tarball
  out of `~/.npm` by its integrity hash and never asks the registry, so a package this machine
  has installed anywhere before is never downloaded through Verdaccio and never lands in its
  storage. Measured 2026-09-14: seed's warm printed no `WARN` and exited 0 while
  `npm --loglevel http` showed 135 of 135 packages `(cache hit)` and zero fetches, and
  `make verify` listed every new tarball MISSING. A clean second machine warms correctly;
  the developer's own never did. Seed's warm now passes an empty `--cache` per lockfile.
  **`make verify`'s mirror check is what caught it** — the storage `ls` a plan tells you to
  run shows the same emptiness and suggests re-seeding, which cannot help.
- **`docker-credential-desktop get` can hang, and then every BuildKit lookup of a Docker Hub
  tag dies with `DeadlineExceeded`.** Measured 2026-09-14: `make seed` failed twice at step 2
  (`load metadata for docker.io/library/php:8.3-apache … context deadline exceeded`) while
  `curl` reached Docker Hub in 0.3 s from the host and from the VM with 100 of 100 anonymous
  pulls left — curl never asks the credential helper. `docker buildx imagetools inspect`
  hung the same way. Diagnose with
  `echo https://index.docker.io/v1/ | gtimeout 20 docker-credential-desktop get >/dev/null`
  (exit 124 is the hang). **Each hung call leaves a `docker-credential-desktop get` process
  parented to launchd** — list and kill the ones your commands started. It stops seed before step 4b's npm warm,
  which does not need Docker Hub at all. **Restarting Docker Desktop cleared it** (Rich,
  2026-09-14): afterwards the helper answered in under a second, `docker buildx imagetools
  inspect php:8.3-apache` in 1 s, and `make doctor` and `make verify` were 18/0 and 47/0.
- **zsh expands a word beginning with `=`**, so `echo =====` fails with `==== not found` and
  **abandons the rest of the command**. Quote separators: `echo '-----'`. Measured 2026-09-14.
- **A background command reports its LAST command's exit status.** `make seed > log;
  echo "exit=$?" >> log` told the harness *completed, exit 0* while the log said `exit=2`.
  End such a wrapper with `exit $rc`. Measured 2026-09-14.
- **`ls` is aliased to a long listing here**, so `$(ls -d path/*)` captures whole listing
  lines rather than paths. Use a glob or `find`.
- **`grep` in the agent's Bash tool is a shell FUNCTION backed by `ugrep`**, which reads a `$`
  inside a pattern as an anchor. `grep -c -- '--cache "$tmp/.npm-cache"'` counted 0 against a
  file containing that exact line, and the `&&` guard built on it silently skipped the step it
  was guarding (2026-09-14). Use `grep -F` for any pattern with a `$` in it.
- **Vitest cannot mock a CommonJS package imported by app-side ESM outside the package.**
  Measured 2026-09-14 with `ubc-genai-toolkit-llm`: `vi.mock` was not applied and the package
  loaded under the wrong path (`Cannot find module './types'`). `blueprints/ai-component.test.ts`
  runs such code in a child `node` process instead, against a fake gateway.
- **An applied migration that is missing a line is REPLAYED, not patched.** Measured 2026-09-14: migration 0005's
  `GRANT` never reached the file — `F=$(ls drizzle/0005_*.sql)` captured a long listing, because `ls` is aliased —
  and `drizzle-kit migrate` created the table with no privilege for `manifest_app`. Appending the line afterwards
  changes nothing on that database. Delete its row from `drizzle.__drizzle_migrations` by `created_at`, drop what
  it created, fix the file, and migrate it as it ships. Check with `\dp`.
- **zsh does not word-split an unquoted variable.** `PSQL='docker exec … psql'` then `$PSQL …` runs one command
  whose name is the whole string — `command not found`. Use a shell function. Measured 2026-09-14.
- **A single-connection transaction hides an ordering race.** Inside `withRollback` every query runs on one
  connection, in order, so a status UPDATE issued before a log INSERT has landed still queues behind it — deleting
  the `await` that orders them left the test green. The control plane runs on a pool, where the two race. To make
  such a property observable, run on the pool and hold `LOCK TABLE … IN ACCESS EXCLUSIVE MODE` from an admin
  connection (`releases.test.ts` does). Measured 2026-09-14.
- **Docker CLI 29.7.2 forwards SIGTERM to the `docker-buildx` plugin**, so killing the `docker` process alone stops
  a real build — measured with buildx v0.36.1-desktop.1. `runStreamed` kills the whole process group anyway, for a
  CLI that does not.
- **`mongodb/mongodb-community-server` answers a loopback `ping` before it enforces authentication — so a `ping` is
  not readiness.** `7.0.28-ubi8` first runs an init `mongod` on `127.0.0.1` with no auth while it creates the user
  and runs `/docker-entrypoint-initdb.d`, then restarts it with `--auth --bind_ip_all`. Measured 2026-09-14:
  healthy at 9.6 s, an authenticated insert from another container refused until 33.8 s (P4b finding 133). **Fixed
  2026-09-15, sitting 8:** the catalogue's check is an *unauthenticated* `listDatabases` that must be REFUSED with
  code 13 — the init `mongod` allows it and the final one refuses it, because the localhost exception closes once a
  user exists — so a service is healthy only once it enforces its credentials, and a Mongo started with no
  authentication never is. Measured with a 20 s init script: the check flipped 240 ms after the final `mongod`
  began listening. **A container created before the fix keeps its old check** — the two demo databases on this
  machine among them — until something recreates it. The image has **no** `/docker-entrypoint-initdb.d` directory,
  so an archive upload into it must extract at `/` with the directory in the entry's name. `getent hosts
  "$(hostname)"` answers `::1` first inside that image; `hostname -i` gives the container's IPv4 address.
- **Docker 29.7.2 honours a healthcheck's `StartInterval`** (Engine API 1.44, which `engine.ts` pins). Measured
  2026-09-15: checks 1.2 s apart until the first success, then 30 s apart. A one-second `mongosh` check for a
  service's whole life costs about a core a run — the two demo databases sat at ~30% CPU idle, against 0.62% on the
  new cadence (P4b finding 134).
- **A deploy that never becomes ready is a `200` whose `state` is `failed`, with an Incident — on both drivers.**
  Since P4b Task 13 the Docker driver refuses readiness by throwing `InstanceNotReadyError`, which carries the
  handle, and `deployRelease` records it instead of rethrowing; until then the same failure was a `500 INTERNAL`
  with the row parked in `provisioning` and no record of why. A script has to check that `state` is `healthy`, not
  that a state came back — `make demo` and `make demo-identity` now do. `GET
  /environments/:environmentId/incidents` has the exit, the last 200 log lines, the diff since the last healthy
  release and a repair prompt.
- **`@fastify/websocket` 11.3.0 routes an upgrade through Fastify's router, so a route's hooks run BEFORE the
  socket upgrades** — and a hook that throws answers the upgrade with an ordinary HTTP status, after which the
  plugin destroys the socket. Authorize a stream in a `preValidation` hook, never only inside `wsHandler`, which
  runs after the upgrade: there a refusal can only be a close code, on a socket the stranger already holds. Read
  from its `index.js`, and measured by P4b sitting 9's controls (findings 155).
- **`websocket: true` beside `handler` and `wsHandler` is a trap**: the plugin then uses `handler` as the socket
  handler and answers every plain GET `404`. Declare such a route in full, without the flag (P4b finding 156). The
  plugin also wraps EVERY route's handler, not only WebSocket routes (170).
- **`app.inject` cannot perform a WebSocket upgrade**, so a stream's refusal of a stranger is provable only against
  a listening server (`app.listen({ port: 0 })`). `api/events.test.ts` asserts the HTTP status on `ws`'s
  `unexpected-response`, which only a refusal before the upgrade can produce. A `ws` client with no `error`
  listener turns a refused upgrade into an uncaught exception on whichever test runs next.
- **Postgres `now()` is the TRANSACTION's start time**, so every row one transaction inserts with a `now()` default
  shares one timestamp, and anything ordered by it comes back in the index's order. `audit.events.created_at` is
  `clock_timestamp()` since migration 0007. Measured 2026-09-15 (P4b finding 157).
- **A `ws` client that is `pause()`d never reads a close frame queued behind data it has not read**, so a
  backpressure test that pauses and never resumes cannot see the server's 1013. Measured 2026-09-15, `ws` 8.21.3
  (P4b finding 165).
- **Every deploy opens the app's WHOLE secret set**, to redact what it records, and does it before it mints
  anything (P4b finding 162).
- **Node 24's global `WebSocket` sends a `cookie` header passed in `{ headers }`** — undici's, measured on Node
  24.12.0 against a server that printed the upgrade (P4b sitting 10). So a stream subscriber needs no dependency:
  `scripts/lib/event-stream.mjs` is one. What it cannot see is a refused upgrade's HTTP status — a stranger's `404`
  arrives as an `error` event and close `1006`.
- **In LiteLLM's spend log, `user_id` is the APP and `end_user` is the PERSON.** `/spend/logs?user_id=` filters on
  the LiteLLM user a key was minted under — `mf-<projectId>-<env>`, one per app and environment — and says nothing
  about who asked; the `user` an app sends lands in each row's `end_user`, which `/spend/logs/v2?end_user=` filters
  on. **A spend row carries none of the key's `metadata`**, so `manifest_project` cannot be read back from spend.
  Measured 2026-09-15 on 1.98.0.
- **`ubc-genai-toolkit-llm` 0.7.0's errors say nothing about their class.** Every SDK failure becomes the toolkit's
  `APIError` with `details.type` `'Error'` — the OpenAI SDK's error classes set no `name` — and `code` the HTTP
  status, or 500 when there was none. A gateway that cannot be reached is `code` 500 with the SDK's own message
  `'Connection error.'` (or `'Request timed out.'`), which is the only thing that tells it from a 500 the gateway
  sent. The toolkit builds its client with no `timeout` or `maxRetries` and exposes neither, so the SDK's 600 s and
  two retries apply: measured 2026-09-15, a refused connection answered in **1.2 s**, an unresolvable gateway in
  **16.5 s**, and a kept-alive socket to a gateway detached from the network in **611 s**.
- **`curl -sS` exits 0 on an HTTP error**, so `until curl -sS …/healthz; do sleep 1; done` stops at the edge's
  first `502`. A wait loop needs `-f`. It cost a control run on 2026-09-15.
- **`pnpm test` and `make reset` both leave `.manifest/repos` behind, and `pnpm test` leaves LiteLLM's users and
  keys too.** The next `POST /projects` for a surviving slug answers `SOURCE_GIT_FAILED` after committing the
  project row, and a project `pnpm test` removed keeps a live, confined key (P4b findings 178 and 183; RUNBOOK's
  *Known gaps*).
- **`docker ps --filter name=A --filter name=B` is an OR, not an AND** — and **`docker rm -f` exits 0 for a name
  that does not exist.** Measured 2026-09-15 (P4b finding 192), cleaning up leaked app containers: `--filter
  'name=^mf-proof-app-staging-' --filter 'name=-app$'` listed another app's container and the proof app's own
  DATABASE and egress. The removal did nothing only because zsh passed the whole list as one argument, and it still
  printed "removed". Filter once and narrow with `grep`, name what you remove explicitly, and list afterwards.
- **A container name longer than DNS's 63-octet label does not resolve, and the failure names the wrong
  thing.** Measured 2026-09-15 from inside `manifest-caddy`: a 72-character container name answers `curl: (6)
  Could not resolve host: … (Misformatted domain name)` and `getent hosts` gives nothing, while a 17-character
  one answers 200. Caddy dials an upstream **by name**, and `mf-` + a 39-character slug + `-staging-` + 8 +
  `-` + 8 + `-app` is 72 characters — which is why P4c dials a bounded per-instance alias instead of the
  container name.
- **Caddy keeps counting an upstream whose route has moved away, until its in-flight request ends — and only then
  unlists the address.** Measured 2026-09-15: `GET /reverse_proxy/upstreams` reported `num_requests: 1` for 4,000
  ms after a `PATCH` moved the route, the whole time a held request was in flight, and the address went missing
  from the list only after that request finished. The control: with a second, unreachable route still referencing
  the same address, it stayed listed and went 1 → 0 when the request ended. So the pool counts addresses the
  **configuration** references, and for a moved-away upstream *unlisted* means *idle*.
- **A `headers` handler must be `deferred` for the edge's value to REPLACE an app's own.** Measured 2026-09-15
  against an app serving its own `X-Manifest-Instance`: with `deferred: true` the response carries only the edge's
  value; with `deferred` absent **both** are present and a client's `headers.get()` returns the joined string
  `"edge-value, forged"`. This applies to §20's four security headers too, which is what "protections live where an
  app cannot remove them" depends on.
- **The edge's wildcard answers `200 manifest OK host=… scheme=https` for ANY path**, not only `/` — measured
  2026-09-15 on an unrouted hostname with `/never-ready`. So a status-only readiness probe against a hostname with
  no route passes whatever path it asks for. This is P4b finding 193's general form.
- **Destroying a container does not let an in-flight request finish, where moving a route does.** Caddy lets a
  proxied request complete on the upstream it started on across a route move (P4c brief §3.3); a same-release
  redeploy today **deletes** the live container, and an AI question in flight when that happens comes back **502**
  — measured three times on 2026-09-15 (2,493 ms, 8,223 ms, 585 ms in).
- **The two fixture apps are not interchangeable, and NEITHER of them 404s an unknown path.**
  `fixtureBareRepo()` builds `fixtures/fixture-app`, which does `await client.connect()` **before**
  `server.listen` and exits if Mongo is not there — measured 2026-09-15 with no service
  provisioned: `node server.js` running, nothing bound, an empty log for 30 s, then
  `MongoServerSelectionError: connect ECONNREFUSED 127.0.0.1:27017`, which a readiness probe reads
  as 87 attempts of `000`. `ensureContractRepo()` builds `blueprints/fixture-node/skeleton`, which
  needs no database. **Both** end in a catch-all `200`, so "point the health path at something the
  app does not serve" does NOT make an instance never-ready for either of them; only the **proof
  app** (Express) answers 404. Use a port nothing is bound to instead, as
  `roundtrip.docker.test.ts` and `redeploy.docker.test.ts` both do.
- **`demux` yields one record per LINE with the terminator stripped**, because it exists for §14's
  log stream where a line is the unit. Anything reading a container's stdout for a **multi-line**
  value has to put the newlines back: measured 2026-09-15, a two-line `curl -w` format concatenated
  into `20033333333-3333-…`, so the status parsed as 20,033,333,333. No unit test can see it — the
  probe is faked in both tiers — and a one-line format has no newline to lose, which is why it
  survived from P3 to P4c unnoticed.
- **`s6.docker.test.ts` probe 14 can fail once in a FULL `pnpm test:docker` and pass alone.**
  Measured 2026-09-15: `/v1/embeddings` came back `000` in the same test where `/v1/models` and
  `/v1/chat/completions` had just returned 200 from the same network with the same key, so
  neither the gateway attachment nor the key explains it; the file alone was 17 of 17 and the
  next full tier was green. On an idle machine with both Ollama models unloaded first, probe
  14's own order measures a cold chat at **3.54 s** and a cold embedding at **0.30 s**, so a
  cold model load does not account for `statusFromNetwork`'s 15 s bound being exceeded.
  **Cause not established, and the bound was deliberately NOT raised** — raising a timeout to
  remove a flake whose cause is unknown hides whatever it might be. Re-run the file before
  concluding anything from it.
- **`pg_advisory_unlock` on a DIFFERENT connection from the one that locked is a WARNING, not
  an error.** A session-level advisory lock belongs to the connection that took it, so
  releasing it through `pool.query` leaves the lock held for the life of that pooled
  connection while the call itself looks successful. Measured 2026-09-15: the serialization
  test timed out at 5,006 ms and Postgres logged `WARNING: you don't own a lock of type
  ExclusiveLock` five times. `withEnvironmentLock` takes and releases on one `pool.connect()`
  client, in a `finally`.
- **A bigint advisory key is reassembled from `pg_locks` by MASKING, never by shifting.**
  Postgres stores it as `classid` = the high 32 bits, `objid` = the low 32 bits, `objsubid`
  = 1, both `oid` — so `(classid::bigint << 32) | objid::bigint` overflows `int8` for any key
  with the high bit set. Use `((hashtextextended(k,0) >> 32) & 4294967295)::bigint::oid` and
  `(hashtextextended(k,0) & 4294967295)::bigint::oid`. Verified 2026-09-15 for a positive key
  and a negative one.
- **`TRUNCATE … CASCADE` truncates the tables that REFERENCE the named ones**, so a new child
  table is emptied by its parent being in the list and Postgres says so —
  `NOTICE: truncate cascades to table "routes"`. Naming it in the harness's list is belt and
  braces, not the thing that makes a run repeatable, and a control built on leaving it out
  cannot fail (P4c finding 36). Measured 2026-09-15.
- **The retirer opens the app's WHOLE secret set before it removes anything, so a set it
  cannot open stops every reap of that environment — silently.** `retireEnvironment`
  builds §14's redactor first, and §14's redaction fails closed, so an app whose secrets
  were sealed under a different master keypair throws `SECRET_UNWRAP_FAILED` before the
  first `retireInstance`; `createRetirer`'s own catch turns that into one line on stderr
  and the pass reports nothing. Measured 2026-09-15 at the boot tier: the routes were
  restored, the boot line said so, and both containers were still running 120 s later.
  Anything that deploys an app in one process and expects ANOTHER process to reap it must
  use the platform's own key — `infra/secrets/master.key`, through `loadMasterKeypair` —
  not a generated one (P4c finding 46).
- **Two `createFakeDriver()`s hand out the SAME instance handles.** Each counts its own
  from `inst-1`, so two fixtures that each build a driver both call their instance
  `inst-1` and every id-keyed assertion silently matches the wrong one. Measured
  2026-09-15: `recover.test.ts`'s "carries on with the rest" test refused both routes and
  read as a defect in the code under test. A fixture that may be used twice takes a
  driver (P4c finding 48).
- **A connection reset carries no identity header, and it can land last.** R1 tolerates
  about one reset in 300 per admin change, so a request loop's FINAL record may be a
  status-0 with an empty `X-Manifest-Instance` — which fails `seen.at(-1).instance` on an
  otherwise perfect run. Read the requests that were ANSWERED, and assert instead that
  none of them lacks the header (P4c finding 49).
- **`npm install --package-lock-only pkg@1.2.3` writes `"pkg": "^1.2.3"` into `package.json`.**
  The version on the command line decides what is installed, not what is saved; npm's
  default save prefix is `^`. Measured 2026-09-16 on npm 11.6.2 (P4c finding 57). Every
  blueprint pin is exact (C6, D30) and `blueprints.test.ts` holds the skeleton's
  `package.json` equal to `blueprint.yaml`, so pass `--save-exact`. npm also rewrites a
  hand-compacted `"engines": { … }` onto three lines.
- **`make seed` REBUILDS the platform images, and what it rebuilds is not always what was
  running.** Measured 2026-09-16 (P4c findings 58 and 62), by diffing
  `scripts/snapshot-machine.sh` across a seed: `manifest-dnsmasq:local`, `manifest-idp:local`,
  `manifest-caddy:local` and `manifest-egress:local` all came out with **new image IDs**
  (`docker images`' *CreatedAt* still says 2026-08-29 for dnsmasq — that is not the build).
  Three consequences, each measured:
  1. **The IdP moved.** Its Dockerfile runs `composer create-project
     simplesamlphp/simplesamlphp:^2.0` — a RANGE — and seed built it from nothing, so the
     running IdP is now **SimpleSAMLphp v2.5.3.1** (composer root), where S2 measured 2.4.9 on
     the reference IdP. **The image it replaced is gone, so the version it ran is unrecorded.**
     Every identity tier passed on the new one (the Docker tier's login suites, a real login in
     `node-ts-mongo.docker.test.ts`, and `make demo-redeploy`'s CWL sign-ins) — which is §16's
     identity tier doing the job S2 wrote it for. **Rich, 2026-09-16: do not pin it — keep it
     current** (§8). Record the version a seed leaves running:
     `docker exec manifest-idp grep -m1 '"version"' /var/simplesamlphp/composer.json`.
  2. **Seed's step 5 (`compose up -d dns-containers dns-host caddy`) RECREATED both dnsmasq
     containers onto the rebuilt image, and a recreated `manifest-dns-containers` is on NO app
     network** — `ensureAppNetwork` attaches it to every one (`PLATFORM_NEIGHBOURS`) and
     nothing re-attaches it until each app is deployed again. Put back by hand with
     `docker network connect <net> manifest-dns-containers`. No consequence was measured: an
     app container failed `getent hosts idp.manifest.internal` both before and after.
  3. **`manifest-caddy`, `manifest-egress` and every app's egress container were NOT
     recreated**, by seed or by the `make up` after it, and still run the previous, now
     untagged images. Why compose treated them differently from dnsmasq and the IdP was not
     established. The next recreate — `make reset`, or a changed service definition — moves
     them onto the rebuild. **Measured 2026-09-16 (P4c sitting 8):** `make reset` then `make up`
     put `manifest-caddy` on `manifest-caddy:local` `4926f9a62410` and `manifest-egress` on
     `fcbbbde15c72`, and doctor, verify, both test tiers and `make demo-redeploy` were green on them.
- **A `200` from a `*.manifest.internal` name can be the edge's wildcard page, not the app** — its body is
  `manifest OK host=… scheme=https`. `routes.docker.test.ts` restarts the edge, which drops every runtime route, so
  after `pnpm test:docker` every demo hostname answers 200 with that body while its containers stay up and healthy
  (P4b finding 193). A reachability check reads the body, never only the status. A secret sealed under a different
  master keypair — a test fixture that binds two, or a key file replaced under a database that kept its rows —
  refuses every deploy of that app with `SECRET_UNWRAP_FAILED`, where it once failed only CWL deploys and failed
  ones.
- **An `nc` one-liner is not an HTTP server, and behind the edge it produces a 502 that looks like
  the edge's.** `printf "HTTP/1.1 200 OK…" | nc -l` writes its response the moment a connection
  opens, before any request — measured 2026-09-16 by connecting and sending nothing. The edge
  keeps pooled connections to an upstream, so one it parks receives an answer nobody asked for:
  Caddy logs `Unsolicited response received on idle HTTP channel`, then an empty `502` as
  `readLoopPeekFailLocked` for whichever request was handed that connection. It failed a full
  `pnpm test:docker` and was first mistaken for a config-reload defect (P4c finding 74). Put a real
  server behind the edge — `routing/testing.ts`'s `stubAppArgs` — and read the log line BEFORE a
  502, not only the 502.
- **A green `make demo-redeploy` does not prove four of the things it looks like it proves.**
  Measured 2026-09-16 (P4c sitting 8) by removing each and watching the acceptance stay green:
  **(1) an in-place route move** — delete-then-insert leaves a gap of milliseconds, and the
  acceptance samples every 200 ms because §20's 600/min per-IP limit is shared by both its loops;
  `routes.docker.test.ts`'s 20 moves at 25 ms is the test that goes red (and the single-move
  takeover in `runtime/docker/redeploy.docker.test.ts` does not). **(2) The drain** — the route
  moves ~1.3 s into a ~5.4 s deploy and the retirer starts only when the deploy returns, so the
  question a move leaves on the old instance has usually finished before any drain begins; a 1 ms
  bound changed nothing. The driver contract's *a retire waits for a request that is in flight* is
  the test; the summary's `inFlightAtRetire` says whether a run happened to exercise it (once in
  ten redeploys). **(3) Revoking the old AI key only after the drain** — LiteLLM checks a key when a
  request starts, and the question under way made its calls long before; `releases.test.ts`'s
  *a redeploy leaves the REPLACED instance's key alone* is the test, and nothing tested it before
  that sitting. **(4) The retirer's nothing-serves guard** — nothing in a run makes a pass find
  nothing serving; `retire.test.ts` and the driver contract's serving refusal are the tests, and a
  staged boot with no `Route` record after an edge restart removed the app within a second with
  both guards gone.
- **`console.manifest.internal` refuses every source but the host — by design.** Since P5a Task 3 it is
  the API's origin: a Caddyfile site that forwards `/v1/*` and `/auth/*` to the control plane on the host
  and answers everything else with `manifest console: not built yet`, inside a `route` that first refuses
  `not remote_ip 10.89.0.1/32` with **`403 manifest: the control plane is not reachable from this
  network`**. A container on `manifest-platform` gets that body, and so does a deployed app (S6 probe 15).
  So **`make verify`'s edge probes moved to `edge.manifest.internal`**, a reserved label no site names,
  which the wildcard answers everywhere — and `scripts/offline-acceptance.sh`'s C1 parity step with them.
  **After `pnpm test:docker`, restart the control plane**: the tier re-registers the platform's SP row at a
  loopback ACS, and a sign-in through the console then fails at `idp_login`'s ACS comparison until the
  boot puts it back.
- **Saving `infra/caddy/Caddyfile` can leave the edge unable to see it at all.** It is a SINGLE-FILE bind
  mount, bound to the file's inode, and a save that writes a new file and renames it over the old one —
  the agent's edit tool did, and so does `git checkout` — leaves `manifest-caddy` on the deleted inode:
  measured 2026-09-16 (P5a sitting 2), `/etc/caddy/Caddyfile` was *No such file or directory* inside the
  container and `make up` exited 1 at the reload. **`infra/lib/ensure-caddy-config.sh` now compares the
  hash the edge reads with the host's and restarts the edge to re-bind when they differ**, then fails
  loudly if a restart did not fix it. The same shape would hit any other single-file mount —
  `infra/litellm/config.yaml` is one.
- **Every Caddy admin-API change reloads the WHOLE config, and a reload closes every WebSocket the old
  config proxied with `1001 Going Away`** — unless its `reverse_proxy` sets `stream_close_delay`.
  Measured 2026-09-16 (P5a sitting 2): one PUT of an unrelated route closed an event stream through the
  console in under 3 s, and `make demo-ai` failed at step 5 with `1001`, because a deploy moves routes.
  The console site now sets `stream_close_delay 1h`, and with it the same stream survived a PUT and a
  DELETE and `make demo-ai` was green. **An app's own WebSockets are NOT covered**: `routing/`'s runtime
  routes carry no delay, so any deploy anywhere closes every app's proxied WebSockets — named, not fixed.
- **An app container's PID 1 is `node`, which never reaps the orphans it adopts — and no init is set.**
  Measured 2026-09-16 on `node:22-alpine` with `--pids-limit 64`: twenty backgrounded `sleep 2`s from an
  exited `sh` stayed in state `Z` under ppid 1, holding their pids; after `s6.docker.test.ts` probe 11's
  fork loop, `pids.current` was still 64 seventeen seconds on and `docker exec … node` could not start at
  all. So **any S6 probe that execs into the app must run BEFORE probe 11** (probe 15's placement says
  why), and an app whose children leave grandchildren behind slowly spends its `PidsLimit`. `Init: true`
  on the container would reap them; it is not set — named, not fixed.
- **`make demo-redeploy`'s *a question in flight when the route moved* can fail by chance.** Measured
  2026-09-16 (P5a sitting 2): the same-release move landed at +1367 ms, in the 47 ms between one
  question's answer (+1331) and the next one's start (+1378), so no question spanned it and the run was
  23 of 24; the re-run was 24 of 24. Read `acrossMoveMs` in that phase's summary before treating the
  assertion as a regression.
- **`make verify` straight after `make reset && make up` fails ONE check — *the events table is append-only by
  GRANT*** — until `pnpm --filter @manifest/control-plane db:migrate` runs, because the reset leaves the database
  with no tables to hold a grant. Measured 2026-09-16, when it read 47 checks / 1 failed; **the total has moved
  since, so read the failing check's NAME, not the count**. Not a defect in the grant. The control plane will not
  boot until the migration runs either.
- **A request carrying a Manifest session must carry `Origin: https://console.manifest.internal`** —
  every `POST`, `PUT`, `PATCH` and `DELETE`, and every event-stream upgrade — or it is `403
  CSRF_ORIGIN_REFUSED` (P5a Task 4, §20). A deployed app is same-site with the console, so a `SameSite=Lax`
  cookie alone proves nothing. `scripts/lib/api.sh` and `event-stream.mjs` send it; a hand-written `curl`
  with a session jar needs `-H "origin: https://console.manifest.internal"`. Measured through the real edge
  on 2026-09-16: a foreign origin and no origin both refused, the console's accepted — so Caddy neither
  strips nor adds one. A refused upgrade reaches a Node WebSocket client as close `1006` with no status.
- **A sign-in to Manifest completes only in the cookie jar that STARTED it.** `GET /auth/login` sets
  `manifest_login` (a nonce, `Path=/auth`, ten minutes) and sends the nonce as `RelayState`; the callback
  refuses an assertion whose `RelayState` is not that cookie's as `401 SAML_LOGIN_NOT_BOUND`, before node-saml
  sees it. `infra/lib/idp-login.sh` carries both; a hand-rolled walk that drops hop 1's cookie, or does not
  post `RelayState` back, ends with no session and that line on the control plane's stderr. A sign-in lands
  on `/` (the console's placeholder) unless it was started with `?returnTo=/v1/me`.
- **Fastify refuses an unreadable request BEFORE any route or hook runs, and `setErrorHandler` still receives
  it** — an `FST_` code with a 4xx `statusCode`. Until P5a Task 5 all four measured (a malformed JSON body, an
  empty one, `text/csv`, a body over 1 MiB) answered `500 INTERNAL` with an "unhandled error" operator line;
  `api/errors.ts`'s `frameworkRefusal` maps them to `REQUEST_INVALID`, `REQUEST_MEDIA_TYPE_UNSUPPORTED` and
  `REQUEST_BODY_TOO_LARGE`. **Every code a client can receive is in `api/error-codes.ts`**, held to the source
  by a test in both directions — a new code thrown anywhere turns `pnpm test` red until it is registered.
- **`packages/contract/openapi.json` is GENERATED from the route definitions, and a stale copy turns `pnpm test`
  red** — `api/contract/document.test.ts` compares it byte for byte and names the first stale line (P5a Task 6).
  `pnpm contract:write` rewrites it, and **it truncates the control plane's tables**, because it is that test run
  under the `unit` project, whose global setup truncates for any file. It is excluded from Prettier:
  `JSON.stringify` does not wrap arrays as Prettier does.
- **zod 3.25.76's `z.registry().get()` INHERITS a schema's parent metadata and deletes only the `id`** — so a
  `.describe()` copy of a registered schema answers `{}`, not `undefined`, while `.has()` answers `false`. Measured
  2026-09-16 (P5a sitting 4): a check for "registered" on the metadata alone let `openApiDocument` emit `"$ref":
  "#/components/schemas/undefined"`. Ask for the `id`.
- **`tsc` writes its errors to STDOUT**, so `pnpm --filter … build >/dev/null` discards them and leaves only the
  exit code. `scripts/demo-journey.sh` did exactly that until P5a sitting 5 (control (e)): a journey that no longer
  type-checked ended at `make: *** [demo-journey] Error 2` with nothing naming the cause. Capture `2>&1` and print
  it on failure.
- **`pnpm audit --filter <pkg>` does not scope to the package** — it reports the whole workspace. Measured
  2026-09-16 on pnpm 11.24.0: `--filter @manifest/contract` listed seven advisories, every path `.>vitest>…`;
  `--prod` is what isolates a package's runtime closure. **The workspace's own test toolchain carries a Critical
  and a High** — `vitest` 2.1.9 (an arbitrary file read while the Vitest UI server listens; patched ≥3.2.6) and
  `vite` 5.4.21 (`server.fs.deny` bypassed on Windows) — plus five moderates, none reachable as used here (no UI
  server, no dev server, macOS). The second measurement of *nothing scans the control plane's own dependency tree*;
  not upgraded.
- **A status-only `404` expectation is satisfied by a route that does not exist.** An unmatched path answers `404
  ROUTE_NOT_FOUND` (P5a Task 2), so the authorization contract suite's *stranger → 404* passed for both of P5a
  Task 8's new rows before either route was written — measured 2026-09-16, 8 of 10 cases red where the plan
  predicted 10. The suite now pairs each expected status with its code (`NOT_FOUND`, `FORBIDDEN`,
  `UNAUTHENTICATED`, …); CLAUDE.md's *name the refusal's CODE* is the rule.
- **Postgres `jsonb` hands an object back with its keys reordered — by length, then bytes** — so a value read from
  a jsonb column is not `JSON.stringify`-equal to the same value freshly parsed. zod emits a §7 service as `{type,
  version, name}`; jsonb returns `{name, type, version}`. Measured 2026-09-16: `isSensitiveDiff` reported
  `services` as a sensitive change on every re-validation of an unchanged manifest (visible in every `make
  demo-redeploy` log since P4c's baseline) until `spec/diff.ts`'s `stable` sorted keys (`4a1d8cd`). Compare
  structure, never serialisations, across that boundary.
- **Fastify's ROUTER sends two refusals itself, in its own body, unless the server passes `frameworkErrors`.** A
  path parameter over `maxParamLength` (100) answered `414 {"error":"Bad
  Request","code":"FST_ERR_MAX_PARAM_LENGTH","message":"'/v1/slugs/aaaa…' is exceeding the max param length"}` and
  a malformed URL `400 FST_ERR_BAD_URL` — neither reaches `setErrorHandler`, so P5a Task 5's mapping of
  `FST_ERR_BAD_URL` had never run. Measured 2026-09-16 on Fastify 5.12.3; both answer `400 REQUEST_INVALID` since
  `b043d9d`. Through the edge a malformed percent-encoding never arrives at all: Caddy's HTTP/2 resets the stream
  (`PROTOCOL_ERROR`, curl exit 92).
- **Every project created over HTTP records THREE events before anything else happens to it** — `project.created`,
  `repository.seeded`, `spec.validated` (P5a Task 11). So a test that counts a project's `audit.events` rows, or
  the frames a stream replays, starts with them: `api/events.test.ts`'s `streamServer()` returns their ids as
  `creation`, and `delivery.test.ts` compares a subscriber that joined after creation with `rows.slice(3)`.
  Measured 2026-09-16: five tests went red the moment creation published, each on a count.
- **After `pnpm test` or `make reset`, a demo's slug has a repository and no project — and creation no longer
  leaves a row to reuse.** Until P5a Task 11 creation committed the project before the repository failed, and every
  demo printed *reusing project*; since then the project is deleted (Decision 29), so the fallback finds nothing.
  Measured 2026-09-16 with the helper removed: `make demo-identity` stopped at step 2 printing `[]`. The demos and
  `make demo-journey` call `clear_orphan_repository <slug>` (`scripts/lib/api.sh`), which removes
  `.manifest/repos/<slug>.git` only when `GET /v1/slugs/{slug}` answers `available` — no project holds the name —
  and prints what it removed. A hand-written creation for such a slug still gets `SOURCE_GIT_FAILED`: move the
  repository aside.
- **A NUL check is not a text check, and a PNG header cannot tell you which check you have.** Latin-1 bytes carry
  no NUL, so a reader that only refuses NUL decodes them with U+FFFD in place and seeds a different file.
  `blueprints/tree.ts` refuses both, with a fatal `TextDecoder`. The bytes `89 50 00 47` fail BOTH checks, so a
  test built on them stays green with either one deleted — measured 2026-09-16, the NUL check removed, 25 of 25
  green. One case per refusal.
- **A drizzle error answers `Failed query: <the SQL>` and not WHY** — the Postgres reason (a foreign key's
  `RESTRICT`, a unique violation) is on `.cause`, and the operator line `toErrorResponse` writes prints only the
  message. Measured 2026-09-16 (P5a Task 11 control (d)): an `audit.events` row blocking a project's delete logged
  `Failed query: delete from "projects" where "projects"."id" = $1` and nothing naming the constraint. Read
  `.cause.code` / `.cause.constraint` in a scratch test. Named, not fixed.
- **Prettier formats any app tree under `blueprints/` that `.prettierignore` does not name.** `skeleton/` was
  named; the proof app moved to `starters/proof-app/` (P5a Task 10) and `pnpm format:check` went red on its
  `server.js` and `public/index.html` — `pnpm format` would have rewritten an app. `blueprints/*/starters/` is
  named now; a new kind of app directory needs the same line.
- **The IdP's `config.php` and `authsources.php` are SINGLE-FILE bind mounts, and a replacing save strands them —
  the IdP then runs with no config at all.** Measured 2026-09-16: a control harness restored
  `infra/idp/config/config.php` with `git checkout` (a new inode), and `docker exec manifest-idp cat
  /var/simplesamlphp/config/config.php` answered *No such file or directory*. **A `git pull` that changes either
  file does the same**, and `make up` does not notice — compose sees no service change, and unlike the Caddyfile
  nothing compares the bytes. `docker restart manifest-idp` re-binds it; `make verify`'s IdP checks go red while it
  is stranded. An edit made IN PLACE (the same inode, as `python`'s `write_text` does) reaches the running IdP at
  once: SimpleSAMLphp reads its config per request.
- **An app's sign-out is a four-hop SAML exchange, and each hop has failed silently.** `/auth/logout` → the IdP's
  `singleLogout?ReturnTo=<app>` → its `core/logout-resume?id=…` (whose state is in the IdP session: without the
  cookie it is a `500`) → **the app's `auth.logout` again, with `?SAMLRequest=`** — the IdP's front-channel
  `LogoutRequest` to the SingleLogoutService the platform registered — → the app's `LogoutResponse` to
  `singleLogout?SAMLResponse=` → home. Measured 2026-09-16, first with `curl` hop by hop and then in Chrome: the
  IdP refused every app's `ReturnTo` (`trusted.url.domains` listed only itself), then the app treated the
  `LogoutRequest` as a new sign-out and the two redirected forever, and with that fixed the `LogoutResponse` went
  to `http://localhost:8080/simplesaml/…` — `passport-ubcshib`'s default `logoutUrl`, because `configureCwl` passed
  none. **After a failed sign-out the app forgets the person and the IdP does not**, so the next *Sign in* is
  answered with no password as the person who left. Nothing before `make demo-identity`'s step 9 ever followed a
  sign-out.
- **An agent driving Chrome cannot sign anybody in.** The Claude in Chrome extension will not type a password, even
  a test user's, and it needs a per-site permission for `idp.manifest.internal` to see the IdP's pages at all. A
  browser test of a CWL flow is therefore shared: the person types `student` / `student` in the agent's tab and
  says so; the agent drives and reads the app's pages. Measured 2026-09-16.
- **An event whose `machineDetail` is not its type's schema is REFUSED at the write, and the Docker tier's `abc123`
  is a git TAG, not a commit.** Since P5a Task 12 `recordEvent` parses every detail against
  `observability/event-schemas.ts` — strict objects, so an extra key is refused too — and throws
  `EVENT_DETAIL_INVALID … at: <path>` before the insert. The driver contract hardcodes `commitSha: 'abc123'`, which
  `ensureContractRepo` makes a TAG so `git archive` resolves it; a Docker test that handed that to `startBuild`
  then failed at `build.started`'s `commitSha` (40 hex), measured 2026-09-17 in `boot.docker.test.ts` and
  `releases/redeploy.docker.test.ts`. They pass `contractRepoCommit(repo)`, the commit the tag names. A test that
  needs an event and is not about its payload borrows `EXAMPLE_DETAILS` from `observability/testing.ts`; `{}` is no
  longer an event.
- **A `zod/v4` union's refusal names no path.** `StreamFrame` — `z.union([EventFrame, LogFrame, ControlFrame])` —
  refused a frame with `humanMessage` renamed as `[["invalid_union",[]]]`, where `EventFrame` alone said
  `[["invalid_type",["humanMessage"]]]` (zod 3.25.76, measured 2026-09-17). A test that prints a refusal's paths
  prints nothing useful for a union; re-read the value with the member schema it should have matched, as
  `api/stream-contract.test.ts` does.
- **A WebSocket test server written by hand hides ordering, and hangs a close.** A `ready` that resolved on the
  FIRST frame passed a test whose server wrote the replayed event and the ready frame back to back (P5a sitting 8,
  control (l), Node 24.12.0's undici 7.16.0): `await ready` did not resume between the two — consistent with both
  frames arriving in one chunk and being dispatched in one turn, which was not isolated further. Holding the second
  frame until the first had arrived alone turned the control red. And `closed` waits for the closing handshake: a
  server that ignores the client's close frame (opcode 8) timed the test out at 5 s.
  `packages/contract/src/stream.test.ts` does both; `ws` is not the contract package's dependency.
- **A build no longer finishes inside its own POST** (P5a Task 13, Rich's R6). `POST …/builds` answers `202` with
  the build `running`, so anything that needs a finished build must wait for one: a test awaits
  **`deps.builds.idle()`** and then reads `GET /v1/builds/{id}`, a script calls **`wait_for_build`**
  (`scripts/lib/api.sh`), and a test that needs a build to have ended calls **`buildToEnd`**
  (`releases/testing.ts`) — `startBuild` is gone. Two consequences measured on 2026-09-17: a test that spreads its
  own driver over `testDeps()` leaves the **runner and the retirer on the harness's fake** unless it rebuilds them
  (`depsWithDriver` in `delivery.test.ts`), and a suite that truncates the tables while a background build runs
  fails that build for a reason no test asked about — the authorization suite idles first.
- **`scanImage` reports an unknown database age as `Infinity`, and JSON turns it into `null`.** Grype does not
  always say when its database was built; `assessScan` treats that as stale, and `JSON.stringify(Infinity)` is
  `null` — so a stored summary whose schema said `number` would answer **500 on every read of that build**, on
  exactly the offline laptop C1 is about. `ScanSummary`'s `databaseAgeDays` is `number | null` (P5a Task 13).
  Measured 2026-09-17, before it could ship.
- **§12's gate classifies only Critical and High.** `assessScan` drops every other severity before it asks whose a
  finding is or whether it has a fix, so its three buckets — fixable, unfixable, base-image — can hold nothing
  else. A count of `medium` beside them would be a zero nobody counted, which reads as "none found". `ScanSummary`
  counts `{ critical, high }` and says so. And **a fixable Critical or High only blocks a build on a FRESH
  database**: a stale scan warns, so "no fixable Critical survived the gate" is true only while `stale` is false.
- **ONE control plane runs against one database.** `recoverAtBoot`'s pass 0 fails every `pending` or `running`
  build, whoever started it, so a second process booting against the same database ends the first one's builds. The
  Docker tier's spawned control planes do exactly that — they truncate the tables anyway.
- **Nothing parses an ERROR body through `ErrorEnvelope`, and it cost six sittings of a wrong document** (P5a Task
  14, finding 1). Every success body is parsed through its representation on the way out (§3); an error body is
  built by hand in `api/errors.ts`'s `mapError` and checked by nothing. `api/errors.ts` holds a TypeScript
  `interface ErrorEnvelope` and `api/contract/schemas.ts` a zod one, **held equal by nothing** — so the document
  said the envelope admits exactly `code`, `message`, `hint` and `details`, `additionalProperties: false`, while
  the production refusal has carried a fifth key, `launchReadiness`, since P2. The authorization suite asserts
  CODES, not bodies, so it could not see it. Task 15 moves the schema to `api/representations/errors.ts`; **make
  the interface derive from it there.**
- **A source swap does not reach the running control plane.** It serves from `dist/`, so a negative control that
  must be watched through `make demo*` needs the control plane killed, rebuilt (`pnpm --filter
  @manifest/control-plane dev` does `tsc` first) and restarted on the swap, then restored the same way. P5a sitting
  10's control (n) is the pattern: without the rebuild the demo passes and the control proves nothing.
- **A deploy publishes three or four events now, not one, and any ordered assertion about a deploy's stream has to
  say so** (P5a Task 14). `instance.provisioning` → (`sso.registered`, for a CWL app) → `instance.starting` →
  `instance.healthy` or `instance.failed` (+ `incident.opened`). Five assertions in `releases/releases.test.ts`,
  one in `api/delivery.test.ts` and two in the Docker tier moved; `releases/deploy-sso.docker.test.ts` is the only
  place the whole order is visible. The one that had been asserting the OPPOSITE property — *streams nothing about
  an instance when the deploy never started one* — now asserts that no OUTCOME streamed, which is what §14 actually
  wants.
- **zod emits an object's keys in SCHEMA order, not the input's — so the same value serialises two ways depending
  on whether it went through a representation** (P5a Task 15, finding 1). A success body is parsed on the way out
  and an error body is built by hand, so the production refusal and `GET …/launch-readiness` carried one computed
  checklist as two different byte strings: `builtBy` before `why` on one path and after it on the other. `toEqual`
  ignores key order, so the whole unit tier passed; **`make demo-journey`'s `JSON.stringify` comparison is what saw
  it**. `mapError` parses the checklist through `LaunchReadiness` now, and fails closed — it is the last thing
  between a failure and the wire, so it drops a checklist that does not parse rather than throwing. **Anything that
  compares two answers for equality must say which kind it means.**
- **A `@typescript` type DERIVED from a zod schema catches what a restatement cannot, and it did so within the
  hour** (P5a Task 15, finding 2). `api/errors.ts`'s `ErrorEnvelope` is `z.input<typeof ErrorEnvelope>` from
  `api/representations/errors.ts` since sitting 11; the first thing `tsc` said was that an `unknown` could not be
  assigned into it — on the exact field the two independent statements had disagreed about for six sittings.
- **A registration-by-import side effect cannot be measured while a second importer exists** (P5a Task 15, control
  (d)). `document.ts` imports `../representations/errors.js` so `ErrorEnvelope` reaches `components`; removing that
  import leaves the drift test **green**, because `contract/websocket.ts` imports the same module for the stream's
  `426` body. Both importers have to go before the test goes red. A control over a side effect must account for
  every path that triggers it.
- **A drizzle refusal is asserted by SQLSTATE, never by message — and the helper exists because it already cost a
  defect** (P5a Task 16, finding 5). `rejects.toThrow(/permission denied/)` goes red against a working grant:
  drizzle's own message is `Failed query: …` and the driver's is on `.cause`. `observability/testing.ts`'s
  **`expectSqlState`** is the one helper for it (`42501` insufficient_privilege, `23503` foreign key); every
  `audit` table's tests use it, and `audit.role_changes` does now too. A grant test should also assert the ROW
  EXISTS before asserting it cannot be changed — a refusal on an empty table is a weaker statement than it looks.
- **A platform role changes out of band or not at all** (§20, P5a Task 16). `scripts/admin-grant.sh` speaks to
  Postgres as the database owner through `docker exec`; nothing on the network does this. **The change reaches a
  person only when they sign in again** — sessions are stateless and carry the role they were issued with — which
  `make demo-journey` measures by signing `operator` in, granting, and signing in a second time.
  `audit.role_changes` is append-only by grant, and its TRUNCATE entry sits **before `users`** in both lists
  (`db/testing.ts` and `packages/control-plane/vitest.global-setup.ts`, which is NOT at the repository root).
- **A snapshot comparison sliced by LINE NUMBER compares the wrong sections, and the mistake is invisible until
  something is deleted** (P5a sitting 11). `scripts/snapshot-machine.sh`'s image list grows between two runs, so
  the `=== Images ===` section starts and ends at different lines in the two files; applying one file's line range
  to both shifts the "before" set and puts a pre-existing digest into the remove list. **Derive each file's section
  from its own header** (`awk '/^=== Images/{f=1;next} /^=== Networks/{f=0} f'`), never by line number, and re-diff
  AFTER removing anything.
- **A host-side `docker pull` of a platform image cannot authenticate, even with the control plane running.** The
  registry's token realm is `http://127.0.0.1:7100`, which from inside Docker Desktop's VM is the VM's own
  loopback, not the host — so the pull fails `dial tcp 127.0.0.1:7100: connect: connection refused` while 7100 is
  in fact listening. Nothing in the platform does a host-side pull: `runtime/docker/builder.ts` mints a token and
  hands it to BuildKit as a credential. **The way back is not a pull, it is `docker tag`** —
  `infra/seed/mirror-images.sh` creates every `127.0.0.1:7107/base/<name>:<ver>` with `docker tag <hub tag> …`, so
  re-running that one command restores the name from the Hub-named copy, offline.
- **`docker images --digests` prints the REGISTRY MANIFEST digest, not the image id, and the same image has a
  different one per registry.** `scripts/snapshot-machine.sh` uses that column, so a snapshot line is not something
  `docker rmi <that value>` or `docker image inspect <that value>` can be trusted to resolve — **compare snapshots
  by `repo:tag`, not by that digest.** Measured 2026-09-17: the mirrored `base/alpine:3.22` showed
  `sha256:2c9d26f410d0…` (the LOCAL registry's OCI manifest) while the identical `alpine:3.22` showed
  `sha256:14358309a308…` (Hub's). They are one image — same `rootfs.diff_ids` (`sha256:03ba6f53ebfc…`), same
  `created` to the nanosecond — because Docker re-serialises the manifest on push. **Two different digests are not
  evidence of two different images**; compare `RootFS.Layers` against the registry config blob's `diff_ids` before
  concluding anything.

- **`Array.prototype.map` PASSES THE INDEX, so an optional second parameter on a mapper is filled with a number.**
  Measured 2026-09-18 (P5b sitting 7, F4): `api/representations/tokens.ts`'s `toToken` was given a
  `now: Date = new Date()` — the shape `toPendingAction` already has — and `api/routes/tokens.ts` maps it as
  `.map(toToken)`, so `now` arrived as `0`, `row.expiresAt <= 0` was false, and **every token in every list
  read `expired: false`, including one that had expired an hour before.** The default only applies to
  `undefined`, and `0` is not `undefined`. A live token reading `expired: false` was green throughout; only
  the assertion about an EXPIRED one could see it. The fix is to read the clock inside the function unless a
  caller genuinely needs to inject one — `toPendingAction` does, because a list's `waitingSeconds` must be
  computed against one instant, and its call site passes it explicitly for that reason.
- **A `Promise.all` RACE TEST CANNOT FAIL ON A COLD `pg.Pool`, and it is the pool that decides — not the code
  under test.** Measured 2026-09-18 (P5b sitting 7, F2): five concurrent `recordPendingAction` calls on the
  pooled `db`, asserting one row, **passed against the read-then-insert it was written to catch**. `pg.Pool`
  establishes a connection per acquire up to its default max of 10, and establishing one costs more than the
  SELECT and INSERT it is wanted for — so the first caller finishes both before the second has a connection
  and the five serialise. `await Promise.all(Array.from({ length: 8 }, () => db.execute('select 1')))` first,
  and it reads **5 rows**. This is the pool-level twin of §4's *a single-connection transaction hides an
  ordering race*: `withRollback` cannot see such a race at all, and a warm pool is what makes the pooled
  version observable. **Prefer a deterministic constraint test beside it** — a direct second insert expected
  to fail with SQLSTATE `23505` (`expectSqlState`) asserts the guarantee rather than the timing.
- **A PARTIAL unique index makes a whole class of fixture uninsertable, and the feature's own tests are in
  it.** Measured 2026-09-18: with `pending_actions_one_open_ask_idx` over a token and a request fingerprint
  `WHERE state = 'pending'`, two `pending` rows sharing both cannot coexist — so a seed helper that reuses one
  path, which is the obvious way to write it, fails inside the sweeper's own suite and reads as a defect in
  the sweeper. Vary the key per seeded row by default. And **a partial index predicated on a STATE needs
  something keeping that state honest**: a row past its own expiry still marked `pending` satisfies the
  predicate and blocks the same insert for ever, which is worse than the duplicates the index exists to stop.
- **A negative control that writes into a project's GIT REPOSITORY outlives its `git checkout`** (P5a sitting 12,
  control (h)). Breaking `renderProjectSeed` and running `make demo-journey` commits the broken seed into
  `.manifest/repos/<slug>.git` at project creation. Restoring the source leaves that repository, so the **next**
  run reuses the project and fails again with a clean tree — which reads as a control that did not restore.
  **Restoring the tree is not restoring the platform's data.** The way back is the documented one: truncate (any
  `pnpm test`), and the demo clears its own slug's orphaned repository and creates the project fresh.
- **`make reset` prompts, so it needs its answer on stdin from a tool call**: `echo reset | make reset`. It also
  does **not** clear LiteLLM's users predictably — measured 2026-09-17, it removed `default_user_id` and three
  `mf-` users and left `p4b-probe-user` — so re-measure `/user/list` after one rather than assuming it is empty.
- **A `make demo-journey` failure in PHASE 1 means every phase-2 measurement in that run is MISSING, not passing.**
  `scripts/demo-journey.sh` runs the journey in two phases either side of the app's own sign-in, and
  `checks.finish()` exits 1 at the end of phase 1 — so steps 6, 7 and 8 never execute. A negative control predicted
  to turn two steps red on both sides of that line can only ever be watched on the near side (P5a sitting 12,
  control (j)).
- **`defineRoute`'s `path` is typed `` `/v1/${string}` ``**, so a route cannot leave the versioned namespace even
  by accident — `tsc` refuses it before the control plane builds. Useful to know when writing a negative control
  about paths: the edit that seems to test the router tests the type system instead, and the journey then dies at
  step 0 with no control plane rather than at the step you aimed at (P5a sitting 12, control (f)).
- **The auto-mode classifier's refusals VARY BY SESSION, so try the command rather than trusting this entry.** P5a
  sitting 12 was refused every `docker rm`, `docker network rm`, `docker volume rm` and `docker rmi` as *[Interfere
  With Workloads]*, and a reverted Caddyfile weakening as *[Security Weaken]*. **P5b sitting 2 was refused none of
  the `docker rmi`s it ran**: it removed the 8 images its own two `pnpm test:docker` runs had built, by digest, and
  diffed the image set back to where it started. What has NOT changed is the rule for what to do when a refusal
  comes: **it is never worked around** — the commands are listed for Rich, the way LiteLLM's user deletions are
  (§2's *Outstanding*). Two distinctions worth keeping: **removing what your own sitting created is "leave the
  machine as you found it" and yours to do; removing what an earlier sitting left is Rich's**, which is why sitting
  12's list is still outstanding after a sitting that could have run the commands. If a sitting's close-out cannot
  sweep the machine, **say so in the record and leave the exact commands** — a cleanup nobody can find is worse
  than one that was never started.

- **ADDING `&& false` TO A CONDITION DESTROYS THE NARROWING ITS BODY DEPENDS ON, so the
  obvious way to disable a branch for a negative control does not compile.** Measured
  2026-09-18 (P5b sitting 8, F8): `if (granted !== undefined && resolution.kind ===
  'confirmed' && false)` failed with `Property 'row' does not exist on type '{ readonly
  kind: "none" }'` — the extra conjunct stops `tsc` narrowing the discriminated union, and
  the error names a property rather than the edit. Same family as P5a sitting 12's control
  (f), where the edit that seemed to test the router tested the type system instead.
  **Disable the CALL, not the condition**: `void theFunction; void narrowed.field` keeps the
  narrowing and removes the effect.
- **A TEST THAT SCANS SOURCE AS TEXT MATCHES ENGLISH PROSE, and the direction of the failure
  decides whether it is worth fixing.** `packages/journey/src/boundary.test.ts` matched
  `\bfrom\s+['"]…['"]` against *indistinguishable from "the token was minted without …"* in
  a doc comment and turned `pnpm test` red on a file with no forbidden import (2026-09-18,
  P5b sitting 8). It is the same shape as *a `process.env.X` scan counts COMMENTS* above,
  with the failure pointing the other way: a false POSITIVE costs a gate rather than a
  defect, so it looks not worth fixing — but the next author's fix is to reword the
  sentence, and nothing then teaches them the check is a text match rather than a parse.
  Both tests now strip comments with the same scanner. **When you make a scanner stricter,
  assert what it still FOUND** — an empty violation list and a scanner that ate the source
  are the same observation otherwise.

- **THE AUTO-MODE CLASSIFIER CAN TIGHTEN IN THE MIDDLE OF A SESSION, not only between them.**
  §4 already said its refusals vary by session. Measured 2026-09-18, after P5b sitting 8: the
  same session ran 86 `docker image rm`s, a `docker rm -f -v` of three running containers, a
  `docker network disconnect`, a `docker network rm` and a `docker volume rm` with no refusal
  at all — and then began refusing `docker volume ls`, `scripts/snapshot-machine.sh` and
  `make doctor` as *[Interfere With Workloads]*, including read-only commands it had allowed
  minutes earlier. **So the useful order is: do the destructive step first and verify second**,
  because the verification can become the thing you are refused; and **a refusal late in a
  session says nothing about whether the work landed.** Each removal's own output is the
  record — `docker rm` and `docker volume rm` echo the name, `docker image rm` echoes
  `Deleted: sha256:…` — so capture those rather than relying on a later read-back.
- **A CLEANUP LIST GOES STALE IN THE DIRECTION THAT MATTERS: its KEEP entries.** P5a sitting 12
  listed 20 images to remove and two to keep, because the two backed running apps. A day later
  one of those two, `journey-app@e288f8b3`, was held by nothing — the app had been redeployed
  twice — while the list of 20 had grown to **86** unheld images once the whole project's
  accumulation was counted rather than one sitting's. **Re-derive the held set from
  `docker inspect` over every container, running AND stopped, and treat any written list as a
  record of what was measured, never as an input.** The same shape as the LiteLLM list, which
  says the same thing for the same reason.

- **AFTER `make reset`, THE HOST CAN LOSE THE EDGE WHILE A CONTAINER STILL HAS IT — and it is
  intermittent.** Measured 2026-09-18 (P5b sitting 9, F6). After `echo reset | make reset` and
  `make up`, every host-side call to `https://console.manifest.internal` and
  `https://edge.manifest.internal` answered `curl: (35) Recv failure: Connection reset by peer`
  — a RESET, not a refusal, so something was accepting on `127.0.0.2:443` and not forwarding.
  **`make verify` reported 11 of 51 failed and named the shape exactly**: *host and container
  see a byte-identical hostname and scheme* failed with its CONTAINER half printing
  `manifest OK host=edge.manifest.internal scheme=https`. The alias was present
  (`ensure-alias.sh` exits 0 when it is, and it runs BEFORE `compose up`), the control plane
  answered `401` on `127.0.0.1:7100`, and `manifest-caddy` was up and healthy — so Caddy was
  serving and only the host side of the published port was dead.
  **`docker restart manifest-caddy` cleared it completely**, after which `make verify` was
  51/0. It did **not** reproduce under `make down && make up`, nor under `down` + a partial
  `compose up -d --wait registry` + `make up` (the platform network kept its id through both),
  so the trigger is not isolated and this is not a deterministic property of `make reset`.
  **The rule to carry: after a reset, run `make verify` BEFORE any demo.** Host-side edge
  checks red while the container-side one is green means restart the edge, not debug the
  control plane.
  **IT ALSO FOLLOWS `pnpm test:docker`'s OWN EDGE RESTART** (2026-09-24, the D5 plan's sitting 2, F19): after a
  green 202-in-31 run, `make verify` read **55 checks, 12 failed** in exactly this shape and `make doctor` warned
  *host Node trusts the CA … ECONNRESET*; `manifest-caddy` had started at 18:21:25, inside the tier's window. A
  parallel session's tier two hours earlier had NOT caused it. `docker restart manifest-caddy` → 55/0 and 19/0/0.
  **So run `make verify` after every Docker tier, not only after a reset.**

- **`db:migrate` NEEDS THE ADMIN URL IN THE SHELL, and says so in no useful way.**
  `MANIFEST_ADMIN_DATABASE_URL` is DERIVED in README's export block, not stored in `.env`, so
  `set -a; . ./.env; set +a` alone is not enough — `drizzle-kit migrate` then fails with
  `[x] url: undefined` and `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL`, naming neither the variable nor
  the file. Export README's whole block before the post-reset sequence, not just `.env`
  (P5b sitting 9, F7).

- **A SITTING IS ONE SESSION, SO NO HAND-OFF MAY ASSERT THAT A HOST PROCESS IS STILL
  RUNNING.** Raised by Rich at the close of P5c sitting 1. The control plane is a **host**
  process, not a container: an agent starts it in the background and it is a child of that
  session's shell, which is a child of `claude`. Containers survive a session ending; this does
  not reliably. **The evidence points both ways**, which is exactly why the claim must not be
  made: P5c sitting 1 INHERITED a live control plane (pid 14881) from the session before it, so
  one has outlived its session here — and every §7e up to that sitting stated *"RUNNING on 7100"*
  as a fact a cold agent could rely on. **Write the hand-off as what the next sitting NEEDS, not
  as what happened to be running when you closed**: say `lsof -nP -iTCP:7100 -sTCP:LISTEN` and
  give README's export block for restarting it, and say plainly whether the next sitting needs it
  at all. Most do not — the four gates need **Postgres**, which is a container `make up` gives
  you, and only a task that drives the API through the edge needs the process. The same caution
  applies to anything else a sitting leaves listening (a Vite server on 7104, the mock on 7102):
  **stop them by PORT at your close** rather than leaving them for the next agent to inherit or
  not.

- **`pnpm add -E` PINS ON THE WAY IN AND NEVER AFTERWARDS, and the caret it leaves is silent.**
  Measured 2026-09-18 (P5c sitting 2, F2). An explicit range on the command line beats the flag:
  `pnpm add -ED 'ajv@^8'` writes `"ajv": "^8.20.0"`, not the resolved version. **Re-running
  `pnpm add -E ajv` does not fix it** — the installed version already satisfies the range, so
  pnpm has nothing to do and says nothing. The sequence that reaches an exact pin is
  `pnpm remove <pkg>` and then `pnpm add -E <pkg>`, with **no range on the command line**. C6
  says every pin here is exact, and this is the one way a `^` gets past that rule without
  anybody noticing.
- **`${PIPESTATUS[0]}` IS EMPTY IN THE AGENT'S SHELL.** It is zsh, which spells the array
  `$pipestatus` and indexes it from **1**, so `some | pipeline; echo "exit=${PIPESTATUS[0]}"`
  prints `exit=` — which reads as *a command that produced no status* rather than as *the wrong
  variable name*, and is therefore easy to accept. Same family as *zsh ties `path` to `$PATH`*
  and *zsh does not word-split an unquoted variable* above. Take the status from the command
  itself rather than from a pipeline, or use `$pipestatus[1]`. Measured 2026-09-18.
- **A VITE BUILD IS THE ONLY READER OF A NON-TYPESCRIPT IMPORT, AND `tsc` CANNOT COVER FOR IT.**
  Measured 2026-09-18 (P5c sitting 2, F4): with `types: ["vite/client"]`, `import './styles.css'`
  **typechecks whether or not the file exists** — the ambient declaration is for `*.css`, not for
  a path — and `vite build` then dies on resolution. So the gate that runs in seconds is blind to
  it and the gate that runs at the end is not, which is the same shape as the contract's
  conditional `exports` map sending `tsc` at `src/` and Vite at `dist/`. **Build the thing, do
  not typecheck it and infer.**

- **A GATE THAT READS *PUBLISHED CONTAINER PORTS* CANNOT SEE A HOST PROCESS, AND THIS PROJECT HAS NOW PAID FOR IT
  TWICE ON THE SAME CHECK.** `make doctor`'s *ports 7100-7199 free, or held only by Manifest* is built on `docker
  ps`, so §21's host-resident processes are invisible to it and read as FOREIGN. It failed with `CLAIMED BY
  SOMETHING ELSE: 7100` on 2026-09-07, *"once there was a control plane worth running"*, and again with **`CLAIMED
  BY SOMETHING ELSE: 7104`** on 2026-09-18, once there was a console worth running. **The remedy both times is to
  identify the process by ASKING IT** — the control plane by its D23.7 envelope on `/v1/me`, the console by its own
  document (`id="root"` and `<title>Manifest</title>`, which `vite dev` and `vite preview` serve identically) —
  **never by matching a process name**, because `node` on either port is a guess. Watched failing: a foreign server
  on 7104 carrying `<div id="root">` but a different title is still called foreign. **AND A THIRD TIME, ON 7102, ON
  2026-09-19** — the first real `make ci-acceptance` run with a mock listening read **`CLAIMED BY SOMETHING ELSE:
  7102`**, and `doctor.sh`'s own comment had PREDICTED it by name and said P5c Task 12 was the task that must fix
  it. Task 12 did not; the acceptance script found it. `mock_is_ours` asks the mock for a path the DOCUMENT DOES
  NOT DECLARE, which it answers `404` with its own name in the message — **`/v1/me` would not do, because the mock
  answers that with the same `UNAUTHENTICATED` envelope the control plane does and the two would be
  indistinguishable.** Watched failing: a throwaway server on 7102 answering a plausible `404 ROUTE_NOT_FOUND`
  envelope is still called foreign. **The lesson this check keeps teaching is that a prediction written in a
  comment is not a task**: three times now the fix has been obvious, documented in place, and done only after the
  check went red.
- **A PLATFORM CHECK MUST NOT DEPEND ON A DEVELOPER'S HOST PROCESS.** `make verify`'s
  *the host reaches https://console.manifest.internal and is not refused* asserted the
  placeholder's own words until P5c sitting 3, and the console that replaced it is started by
  nothing — `make up` does not run `vite`. The check now passes on **`[502]`** (the site
  matched and forwarded; nothing on 7104) **and** on a `[200]` carrying the console's
  document, while still refusing the two answers it exists to catch: the WILDCARD
  (`manifest OK host=…`, which answers 200 for any name and any path) and `@outside`'s
  `403`. **Measured in both machine states**, 51/0 either way. *The general rule: when a
  check's subject becomes optional, the check keeps its QUESTION and loses its string.*
- **THE CHROME EXTENSION'S NETWORK READER PRINTS A SYNTHETIC `503` FOR A 204 WHOSE PAGE
  NAVIGATES AWAY.** Measured 2026-09-18: a *Sign out* click reported
  `POST /auth/logout → 503` while `curl` answered `204`, the code that made the call saw
  `204`, and the session really had ended. Isolated with four runs — a 204 with **no**
  navigation prints 204; a 204 followed by `location.href='/'` prints **503**, twice; a `GET`
  answering 401 and a `POST` answering 401, both followed by the same navigation, print 401.
  So it is neither the method nor the navigation alone but **a bodyless 204 the page leaves
  at once**, and 503 reads exactly like a platform fault. Same family as P5c sitting 1's F8
  (*the extension cannot show request headers*): **when the page navigates, trust the status
  the CODE saw, never the reader's.**
- **A PHRASE THAT WRAPS A LINE IS INVISIBLE TO BOTH OBVIOUS WAYS OF COUNTING IT.** §6 already
  warns that `grep -c` counts LINES, not occurrences. P5c sitting 3 then found the third
  variant: `manifest-schematic.html` carries *"no user interface has been built yet"* twice,
  and `str.count()` of that exact phrase answers **1**, because the second copy is written
  `no user interface\n  has been built yet`. **Search for a short fragment and read the
  matches**, rather than counting a sentence — and remember the neighbouring page states the
  same claim in different words entirely (*"there is still no user interface"*), which no
  search for the first phrasing finds at all.

- **BUILD LOG FRAMES ARE NEVER REPLAYED, so an event stream is not a log.** The document says it
  on `LogFrame` — *"Never replayed — GET /v1/builds/{buildId}/logs has them all"* — and
  `recentFramesFor` is the proof: the replay `select`s from the `events` table, which holds no
  log line. Measured 2026-09-18 in a browser: after a page load, **74 log lines on screen and 0
  log frames delivered by the replay**. So any client showing a build's output must merge
  `GET /v1/builds/{buildId}/logs` with the live frames, de-duplicated by `seq` — and the two
  sources spell the timestamp differently, `BuildLog.lines[].at` against `LogFrame.createdAt`.
  **`seq` restarts per build**, so frames from two builds collide rather than accumulate in a
  `seq`-keyed merge: a missing `buildId` filter shows a silent BLEND at almost the same length,
  not a visible doubling (measured: stored 71 lines, screen 74, matching neither build).
- **AN EMPTY `StartBuildRequest` DOES NOT BUILD THE REPOSITORY'S HEAD.**
  `api/routes/builds.ts` reads `commitSha: body.commitSha ?? spec.commitSha`, so `{}` builds the
  commit of the **last VALIDATED manifest**. Measured 2026-09-18: a commit pushed to a project's
  repository and then built produced the OLD commit; only `POST /v1/projects/{id}/spec`
  (*Re-validate*) moved the spec, after which the same request built the new one. The field's
  name invites the other reading and P5c's Task 7 states it outright.
- **CHANGING AN APP'S `runtime.port` CANNOT MAKE ITS DEPLOY FAIL.** §4's standing advice — point
  readiness at *"a port nothing is bound to"* — is about the Docker tier's FIXTURES, whose listen
  port is fixed in their source while the probe's is not. For an app built from its own manifest,
  §8 injects `runtime.port` into the container too, so the app listens exactly where the probe
  dials: measured 2026-09-18 with `runtime.port: 3999`, the deploy went **healthy**. The lever for
  a real app is the health **PATH** — and only because the proof app is Express and 404s an
  unknown path, where §4 already records that **both** fixture apps end in a catch-all `200`.
  `health: /never-ready` produced `instance.failed` + `incident.opened` in one deploy.
- **A FAILED DEPLOY LEAVES THE PREVIOUS INSTANCE SERVING, so "the environment's state" and "the
  last deploy's outcome" are two different questions.** Measured 2026-09-18 through the console:
  the project's event stream ended `instance.failed` → `incident.opened` while
  `GET /v1/projects/{id}/environments` answered **`healthy`, on the release before it** — two
  instance rows, both true. A client that renders the newest instance EVENT as the environment's
  state reports an app down while it is up; one that renders the deploy call's own answer reports
  it to whoever pressed the button; one that reads the resource once at mount is stale for
  everybody else. The environment's own instance, re-read when a frame says it moved, is the
  answer — and a control that breaks this **cannot fire on an environment that already holds a
  healthy instance**, because both readings then agree. Use one whose FIRST deploy fails.
- **A RUNTIME ROUTE OUTLIVES THE APP IT POINTS AT, AND ONLY AN INFO LINE SAYS SO.** After a
  project's rows are truncated (any `pnpm test`) and its containers removed, the edge still holds
  its hostname: `make verify`'s *runtime routes currently applied* went **0 → 1** and stayed
  there, with no check failing, because it is an INFO line — and `scripts/dead-app-resources.sh`
  does not look at Caddy at all. The admin API is published on **7119**
  (`MANIFEST_CADDY_ADMIN_URL`), each route carries an `@id` of `mf-<hostname-with-dashes>`, and
  `curl -X DELETE http://127.0.0.1:7119/id/<that id>` removes one. **BusyBox `wget` inside the
  container cannot**: it has no `--method`. Measured 2026-09-18.
- **A `scroll` EVENT IS DISPATCHED ASYNCHRONOUSLY, which breaks the obvious "follow the tail
  unless the reader scrolled away".** Content committed between `el.scrollTop = el.scrollHeight`
  and the handler makes `scrollHeight` grow, so the handler reads a large gap and concludes the
  person scrolled away — after which nothing scrolls it back. Measured 2026-09-18 mid-build:
  `scrollTop` **109.5** where the bottom was **921.5**, after 71 lines; reproduced in the page by
  setting to the bottom and appending 40 lines, where the handler computes **662.5**, not 0.
  Recognise your own scroll by the POSITION you set, not by the gap, and only while armed.
- **A TYPE PREDICATE OVER A FIELD NARROWS THE FIELD, NOT THE RECORD.**
  `isDeployState(f.type)` typed `(type: string): type is DeployState` leaves `f` as the whole
  union, so reading a variant-specific property is `TS2339` naming the property rather than the
  mistake. Measured on TypeScript 5.9.3. Same family as *a compound `.filter` condition defeats
  TS 5.5's inferred type predicate*: **narrowing follows the value you test.** Take the record
  and let `Extract<Union, { type: … }>` name what it narrows to.

- **CADDY'S INTERNAL CA ISSUES A 12-HOUR LEAF, SO A TAB LEFT OPEN ACROSS A LONGER SLEEP SHOWS
  `ERR_CERT_DATE_INVALID` ON A CHAIN THAT IS PERFECTLY VALID.** Measured 2026-09-19 (P5c sitting 6,
  F10) after the machine slept nine hours mid-sitting: Chrome refused `idp.manifest.internal` and
  then `console.manifest.internal` **in the same tab**, while `openssl s_client` and
  `curl --cacert` both accepted the identical chain and every host and container clock agreed to
  the second. The PKI, measured rather than assumed: **leaf 12 hours** (`11:58:31 → 23:58:31`),
  **intermediate 7 days** (`Sep 14 → Sep 21`), root ten years. Caddy had renewed cleanly at
  11:58:31; what was stale was **Chrome's cached TLS state for the expired leaf**. **Closing the
  tab and opening a new one cleared it completely.** So: read the chain with
  `echo | openssl s_client -connect 127.0.0.2:443 -servername <host> -showcerts` before suspecting
  the edge, and open a new tab rather than debugging Caddy, `make up` or the alias. The error names
  a date, and the date is the browser's memory rather than the platform's certificate.
- **RESTARTING THE CONTROL PLANE THE DOCUMENTED WAY SIGNS EVERYBODY OUT, AND NOTHING SAID SO
  UNTIL NOW.** README's *Running the control plane* export block contains
  `export MANIFEST_SESSION_SECRET=$(openssl rand -hex 32)` — **a fresh random value every time
  it is run** — and `config.ts` takes exactly one secret (`MANIFEST_SESSION_SECRET: z.string().min(32)`,
  `sessionSecret: string`), with no rotation list. Sessions are stateless signed cookies (§3), so
  **every browser session in existence is invalidated the moment the process restarts**, and the
  person is shown the sign-in screen with no explanation. Found 2026-09-19 (P5c sitting 8), which
  restarted the control plane twice and wrote this down only when a cold-read asked what lived
  only in that session. **This costs a PASSWORD**, which is the scarcest thing in a shared clicked
  run (Rich's R3): plan a control-plane restart before the person signs in, never between their
  sign-in and the screen you need them on. To keep sessions across a restart, export a STABLE
  secret instead of the block's random one — any 32+ character string, reused — and note that
  doing so also lets an earlier sitting's cookie survive, which is the opposite trap.
- **THE CONSOLE'S *Sign out* ENDS MANIFEST'S SESSION AND LEAVES THE IdP'S ALIVE**, so the next
  *Sign in with CWL* returns the same person **with no form and no password**. Measured 2026-09-19
  (P5c sitting 6, F9): `POST /auth/logout` → `204`, `GET /v1/me` → `401` (the Manifest session
  really did end), then `/auth/login` landed straight back on the console as the same person. This
  is why P5c sittings 4 and 5 rode a live IdP session for free and why **switching user is the
  thing that costs a password** — ending the IdP session needs
  `https://idp.manifest.internal/module.php/core/logout/manifest-test-users`, which no console
  affordance offers. On a shared machine *Sign out* does not mean what the word implies. Named,
  not fixed.
- **THE CHROME EXTENSION'S REDACTOR KEYS ON A RESULT FIELD'S NAME, NOT ONLY ON ITS VALUE.** A probe
  returning `{holdsAnMftToken: false}` or `{sessionStorage: 'empty'}` comes back as
  `[BLOCKED: Sensitive key]` — a redacted **boolean**, which reads as a failed read rather than as
  the guard working. It does correctly refuse to surface a token secret, which is the behaviour
  wanted; the trap is that a carelessly NAMED field makes a successful measurement look broken.
  **Name probe fields neutrally, and have the page compute the assertion** rather than returning
  material to be judged here — P5c sitting 6 proved a delegated token worked by having the page
  itself call `/v1/me` with it and report only the status. Same family as the synthetic `503` above.
  **Two `computer left_click` calls by element `ref` also silently did nothing** while the identical
  click by coordinate worked; the call reported success both times.

- **A BUILD'S LAST TEN SECONDS ARE §12'S SCAN, AND THEY ARE COMPLETELY SILENT — SO THE LOG
  REACHING `DONE` IS NOT THE END OF THE BUILD.** `scanImage` runs INSIDE
  `driver.buildImage`, after BuildKit returns, and takes **no `onLog`** — Syft and Grype emit
  no log line and no event — so the build row stays `running` with `imageDigest: null` for the
  whole scan while the log's last word is `DONE`. Measured twice on 2026-09-19 (P5c sitting 6,
  F12), from `audit.build_logs`' last row to the `build.succeeded` event: **11.29 s** and
  **9.70 s**, on 14.39 s and 12.82 s total builds. **Anything that acts on a finished-looking
  log is acting too early** — `POST …/releases` answers `409 RELEASE_BUILD_NOT_DEPLOYABLE …
  is 'running' with digest 'none'`, which is correct and reads like a race. **The question
  *"is this build ready?"* is answered by the RESOURCE** — `GET /v1/builds/{buildId}`'s
  `status` and `imageDigest` — or by the `build.succeeded` event, never by the log. Found by a
  person clicking, which is what the reference console is for; no gate can see it, and every
  client written against this API will make the same mistake until the scan says something.

- **A REFUSAL THAT ONLY A *TOKEN* CAN RECEIVE CANNOT BE RENDERED BY A CLIENT THAT ONLY HOLDS A
  SESSION — AND THIS FILE ASSERTED THE OPPOSITE FOR THREE SITTINGS.** `<Refusal>`'s doc comment
  and §7e both said P5c's Task 11 would be the first caller of the error envelope's
  `pendingAction`. It can never have one. Traced 2026-09-19: `api/errors.ts` puts the field on
  exactly two envelopes, `TOKEN_ACTION_PENDING` and `TOKEN_ACTION_REJECTED`; both are raised by
  `api/contract/route.ts`'s wrapper; the wrapper reaches them only through
  `TokenCapabilityRefusedError`, which `projects/authz.ts` throws **inside
  `if (actor.credential === 'token')`** and nowhere else. **The general rule, which applies to
  every screen in a two-credential-class API**: before writing a renderer for a typed extra on an
  envelope, find the THROW and read which actor class reaches it — a field being *in the
  document* says only that the API can send it, never that your client can receive it.
- **`consumeAction` AND `addMember` PUBLISH NO EVENT**, the fourth and fifth instances of the
  shape after `validateSpec`, `createRelease` and `revokeToken`. `tokens/pending.ts` has exactly
  two `publishEvent` calls — in `recordPendingAction` and `resolveAction` — and
  `api/routes/project-reads.ts` has none. So *has a confirmed agent spent its one retry?* and
  *did the membership change?* cannot arrive on the stream, and a console that never polls (D23.2)
  can only answer them by re-reading the resource when a person asks. **Check whether a route
  publishes before designing a screen around the stream**; the three `pending_action.*` types DO,
  which is why §26's queue learns of its own answers and of another tab's.
- **AN UNQUOTED VARIABLE HOLDING `-H origin: …` LANDS AS A `403 CSRF_ORIGIN_REFUSED`, WHICH IS THE
  SAME STATUS AS THE REFUSAL YOU WERE TESTING FOR.** §4 already says zsh does not word-split an
  unquoted variable. What 2026-09-19 added is where it lands: proving that a collaborator may read
  §26's queue but not answer it, `O='-H origin:https://console.manifest.internal'; curl … $O …`
  sent no header, and the collaborator's confirm and a stranger's confirm **both answered `403`** —
  the exact status the collaborator's refusal was predicted to have. With the header inline they
  are **`403 FORBIDDEN — role 'collaborator' may not 'members:manage'`** and **`404 NOT_FOUND`**.
  **Assert the CODE**: this is the trap that rule exists for, arriving through the shell rather
  than through the platform.
- **THE CONSOLE'S *Copy* BUTTON IS HOW A CLICKED CREDENTIAL REACHES A TERMINAL.** The Chrome
  extension's redactor keys on a result field's NAME (2026-09-19, above), so a token secret cannot
  be read off a page into an agent's hands — and it should not be. `navigator.clipboard.writeText`
  plus `pbpaste` is the path that works, measured: the Tokens screen's *Copy* put a well-formed
  80-byte `mft_<uuid>_<secret>` on the clipboard, a shell picked it up into a file, and the token
  authenticated. **The secret never enters the session** — use `$(cat <file>)` in the command
  rather than echoing it, and check the shape with a mask (`sed 's/[a-zA-Z0-9]/x/g'`) rather than
  by printing it.

- **A PRODUCTION DEPLOY POINTS THE APP AT REAL UBC SHIBBOLETH, SO NOTHING SIGNS IN TO PRODUCTION
  ON THIS LAPTOP** (P6a sitting 9, F5). §8 injects `authentication.ubc.ca` explicitly for
  `environmentKind: 'production'` — deliberately, because the library's own default is UBC's
  STAGING host — and C1 puts both out of reach. Measured: a probe container reading `/login` on a
  production hostname got `302 -> https://authentication.ubc.ca/idp/profile/SAML2/Redirect/SSO`
  and then `curl: (60) SSL certificate problem`, because the platform CA does not sign UBC's
  certificate. **The rehearsal is the ONE production deploy pointed at the local IdP**
  (`InjectionContext.purpose`), and a launch is not — so an app that has been launched here
  serves, and refuses to sign anybody in, and that is correct rather than broken.
- **THE STEP-UP CALLBACK REFUSES AN ASSERTION POSTED WITHOUT `RelayState`** (P6a sitting 9, F11),
  with `401` and *"the sign-in was not started by this browser (no login cookie, or a RelayState
  that is not its nonce)"*. The IdP's auto-submit form carries `RelayState` beside `SAMLResponse`
  and a hand-written curl walk drops it silently. `infra/lib/idp-login.sh` has always posted both
  — **use that file rather than writing the walk again**, which is what it exists for; a second
  implementation drifted on its first outing.
- **REMOVING `127.0.0.3` FROM `lo0` TURNS A 40-SECOND `make verify` INTO A TEN-MINUTE ONE**
  (2026-09-20). Several checks probe that address and each burns the full **75-second**
  connect timeout — *the public listener answers a production name* and *all three §23
  platform zones serve with a trusted certificate* both did. **Inside a window like that, run
  the ONE check you are measuring** (`check_public_listener`) rather than the whole suite, or
  pass `--connect-timeout`. And **put the restore in a `trap … EXIT INT TERM`**: the run that
  found this was `^C`'d halfway and the alias went back on the way out, which is the only
  reason the machine was left as it was found.
- **`make verify` NEEDS HOMEBREW'S OPENSSL, AND macOS'S OWN REPORTS A GOOD CERTIFICATE AS
  UNPARSEABLE** (2026-09-20). `/usr/bin/openssl` is LibreSSL and has no `x509 -ext`, which
  `control_plane_sp_keypair` uses to read the SAN — so with `/opt/homebrew/bin` off PATH the
  check reads *"infra/sp/control-plane.crt is not a parseable certificate"* and verify reports
  `54 checks, 1 failed` on a platform that is fine. Measured while building a script that ran
  `make verify` under a deliberately minimal PATH. **Anything that runs `make verify` from
  `sudo`, `launchd`, `cron` or an editor must put `/opt/homebrew/bin` on PATH**, and node's
  nvm directory too, because nvm is configured in `~/.zshrc` and `bash -l` never reads it.
- **`GET /v1/projects` ANSWERS AN ADMINISTRATOR WITH THEIR OWN PROJECTS, NOT EVERY PROJECT**
  (P6a sitting 9, F13). §26's `GET /v1/fleet` is the administrator's view (D31). A script that
  looks for somebody else's project in the first list finds nothing and reads as a missing row.
  **In the console the fleet LINKS each project since P6a sitting 10** — until then no screen led
  an administrator to a project they had to act on.
- **TWO VITEST PROCESSES CANNOT RUN AT ONCE, AND THE SECOND CORRUPTS THE FIRST** (P6a sitting 10,
  F22). The `unit` and `docker` projects share `vitest.global-setup.ts`, which `rm -rf`s
  `$TMPDIR/manifest-test-repos` and TRUNCATEs the tables at start AND at teardown — so one Docker
  test run beside a `pnpm test` turned two `api/credential.test.ts` cases red with
  `SOURCE_GIT_FAILED … does not appear to be a git repository`. **A run you overlapped does not
  count; run it again alone.** The `packages` project has no global setup and is safe beside
  either.
- **`vite dev` BEHIND THE EDGE RELOADS THE PAGE WHEN ITS WEBSOCKET DROPS — and until P6a sitting 10
  every deploy on the platform dropped it** (F17): the console's proxy lacked the
  `stream_close_delay` the API's has, so pressing *Run the rehearsal* lost its own answer to the
  rehearsal's production deploy. Fixed in the Caddyfile and measured both ways. **Two causes
  remain that no Caddyfile line fixes**: `make demo-journey` rebuilds `@manifest/contract`, which
  the console imports, and Vite reloads on a dependency change (F18); and an edge RESTART cuts
  everything. **For a clicked acceptance, serve the console with `vite preview`**, which holds no
  socket at all. The trap inside the trap: **a control-plane restart is NOT a trigger to test
  with** — its boot re-applies identical routes, which Caddy treats as a no-op and which cuts
  nothing; a deploy that moves a route is.
- **THE CHROME EXTENSION'S CLICK BY ELEMENT REFERENCE MISSES SOMETIMES** (P6a sitting 10): the
  sign-in button and the rehearsal button each ignored a `ref` click that a click by coordinate
  then hit. Screenshot after every click that matters. **And the browser's console log is NOT
  reset by a navigation** in this extension, so a `[vite] connecting…` line is not evidence of a
  reload unless its timestamp says so — clear the log with `clear: true` before the thing you are
  measuring.
- **`manifest-mock` VALIDATES WHAT IT SENDS, NOT WHAT IT RECEIVES** (P6a sitting 10, F14). A
  rejection with an EMPTY reason answers `201` against the mock — with a record saying
  `approved` — and `400 REQUEST_INVALID` against the platform. A console that sends an invalid
  body looks correct against the mock.
- **`make reset` LEAVES BOTH LOOPBACK ALIASES ON `lo0`** (P6a sitting 11, F13 — measured with
  `ifconfig lo0` after `echo reset | make reset` and `make up`). `127.0.0.2` and `127.0.0.3` both
  survive, so a reset needs `make up`, the migrations and the control plane, and never `make
  host-setup`. **`make verify` straight after a reset reports ONE red** — *the events table is
  append-only by GRANT* — because the database has no migrations yet; start the control plane
  (its launcher migrates) and re-run it.
- **THE BUILDER IS REPRODUCIBLE: THE SAME COMMIT REBUILDS TO THE SAME DIGEST** (P6a sitting 11,
  F3). BuildKit rewrites layers with `source-date-epoch` set to the commit time, so "rebuild and
  see a new digest" is not a test you can write on this machine — sitting 7's F3 met the same fact
  in the fake driver. An approval is still not carried over, because it belongs to a release.
- **TWO NODE TRAPS IN ANY SCRIPT THAT PINS AN ADDRESS** (P6a sitting 11, F1 and F2), which is how
  you ask the internal listener for a production name: Node 24's `net` calls a custom `lookup`
  with `{ all: true }` and wants an ARRAY back (answer the single form and it throws
  `ERR_INVALID_IP_ADDRESS: undefined`); and the global HTTPS agent pools keep-alive sockets by
  HOSTNAME, so a second request to the same name at a DIFFERENT address goes over the first one's
  socket and reports the first address's answer. Pass `agent: false`. `curl --resolve` is the
  arbiter when the two disagree.
- **DOCKER DESKTOP MAY NOT BE RUNNING WHEN A SESSION STARTS** (2026-09-22): every `docker` call
  fails with *failed to connect to the docker API*. `open -a Docker` starts it and the platform's
  containers come back healthy by their restart policy within seconds; nothing else is needed.
- **THE EGRESS PROXY ANSWERS FOR ITS FIRST DEPLOY, NOT THE CURRENT ONE — UNTIL P6b's TASK 5a** (P6b
  sitting 1, F1). `ensureEgressProxy` returns as soon as `mf-<slug>-<env>-egress` exists, so a release that
  adds a host is refused it and a release that removes one still reaches it. **To read what a proxy
  actually allows**: `docker exec mf-<slug>-<env>-egress cat /tmp/allowlist`, then from the app container
  `wget -S -O /dev/null -T 5 http://<host>/` — **`403 Filtered` is the filter refusing; `500 Unable to
  connect` is the filter letting it through** and the network (offline) failing, which is the answer an
  allowed host gives here. Put `manifest-verdaccio:4873` (`200 OK`) beside them. `egress.docker.test.ts`'s
  *ALLOWS a destination this app declared* destroys the proxy first, which is why it never saw this.
- **`docker exec` BY A NAME PATTERN HITS TWO APP CONTAINERS DURING A RETIRE DRAIN** (P6b sitting 1): a
  `grep '^mf-<slug>-staging-.*-app$'` straight after a deploy matches the new instance AND the one still
  draining, and `docker exec` on the two-line name answers **`Error response from daemon: 404 page not
  found`** — which reads like a proxy's answer and is not one. Pick the container by the instance id the
  deploy returned (`…-<first 8 of the instance id>-app`).
- **`local path=…` IN A SHELL FUNCTION BREAKS EVERY COMMAND IN zsh** (P6b sitting 1, F9). zsh ties `$path`
  to `$PATH`, so inside the function `PATH` is its argument: *"command not found: curl"*. This machine's
  shell and the agent's Bash tool are both zsh. Name it anything else, or run the snippet under `bash` —
  the plans' snippets are bash.
- **AFTER `make demo-production`, STAGING SERVES AN UNAPPROVED REBUILD** (P6b sitting 1, F3). Its step 10
  deploys the rebuild to staging to show it has no approval, so the checklist's CANDIDATE is that rebuild,
  not the release production runs, and a production deploy of ANY release is refused
  `RELEASE_PRODUCTION_GATE_UNAVAILABLE` until an approved one is staged again. P6b moves that step into
  `make demo-releases` (its Decision 17).
- **`make verify`'s *"runtime routes currently applied"* COUNTS THE INTERNAL LISTENER ONLY** (P6b sitting 1,
  F13): `verify.sh:1142` reads `srv0`, so a production route on `srv1` is never counted, and `1` with an app
  live in both environments is correct. `curl -s http://127.0.0.1:7119/config/apps/http/servers/srv1/routes`
  shows the public listener's.
- **IN VITEST, A NAMED EXPORT THAT DOES NOT EXIST YET IS `undefined` — NOT AN IMPORT ERROR** (P6b sitting 2,
  F1). A plan step that predicts *"the module fails to import"* is wrong here: the file loads and every test
  runs against whatever the code does today. `[...X]` throws *"not iterable"* and `X()` *"is not a function"*,
  but a test that only uses the missing export in a way that tolerates `undefined` — `new Set(X)`,
  `X ?? fallback`, a spread — is GREEN before the feature exists. Read every new test's first red for the
  reason you named, not for the fact that it is red. `tsc` does see it: run `pnpm typecheck` if in doubt.
- **READ `uptime` BEFORE YOU BELIEVE A RED — A ZOOM SCREEN SHARE MAKES THE UNIT TIER UNMEASURABLE** (P6b
  sitting 3, F15). With `zoom.us` at 89–125% CPU and its share helper running, the load average reached
  50–90, and four `pnpm test` runs of one unchanged tree read **17, 0, 2 and 7 red** in 481, 222, 373 and 459
  s — every red `Test timed out in 5000ms`, plus one follow-on `SLUG_TAKEN` from a timed-out test's leftover
  row. The Docker tier's 120 s timeouts tolerate it far better. Rich runs calls on this machine; when the
  load is high, wait or ask, and never commit on a run you could not trust.
- **THE EDGE RATE-LIMITS EVERY ROUTE AT 600 REQUESTS A MINUTE PER CLIENT IP, AND A TEST'S OWN REQUEST LOOP
  CAN HIT IT** (P6b sitting 3, F16). `routing/caddy.ts` sets it on every route since P3. A loop faster than
  about ten a second is answered **`429` with no `X-Manifest-Instance` header** once it has sent 600 —
  which is neither a 5xx nor the wildcard, so a test counting those sees nothing wrong and fails on
  whatever it checks next. `redeploy.docker.test.ts` asked every 25 ms and read *"the last 200 was the old
  instance"* whenever a redeploy took longer than ~15 s (measured `599 × 200`, then `214 × 429`); it now
  waits 150 ms and asserts no 429 (`a7948fd`). Any new loop through the edge: stay under ~400 a minute.
- **S6 PROBE 14 NEEDS OLLAMA'S CHAT MODEL RESIDENT, AND THE DOCKER TIER DOES NOT MAKE IT SO** (P6b sitting 3, F17).
  Its chat completion goes straight to `manifest-litellm:4000` with `curl -m 15`, and `default-chat` was
  `ministral-3:latest` — 9.7 GB loaded — so a model that had not been loaded for a day, on a machine under memory
  pressure, answered `000`. Warm, the file is 18/18 and the probe takes 7.9 s. **Since 2026-09-24 it is
  `qwen3.5:4b`** (3.4 GB on disk, ~4.3 GB loaded, 2.6 s to load). To warm it: `curl -s
  http://127.0.0.1:11434/api/generate -d
  '{"model":"qwen3.5:4b","prompt":"ok","stream":false,"think":false,"keep_alive":"30m","options":{"num_predict":1}}'`.
  Not fixed: warming it in `tier-setup.ts`, or a longer limit for that one call, is a decision for a sitting that
  owns `ai/`.
- **`deadlock detected` INSIDE `resetDatabase` MEANS A BACKGROUND PASS OUTLIVED ITS TEST** (P6b sitting 4,
  F7). A deploy schedules a retire pass and answers without waiting for it (§11's drain), so a test that
  closes its server straight after a deploy leaves that pass running into the next test's `beforeEach`
  `TRUNCATE`. It reads as a red in the WRONG test — the first one after — and in 2 of 11 runs it was a
  deadlock; in every run it was 4–6 lines of `[retire] the pass for environment … failed: Error` on stderr.
  **Drain before closing**: `await deps.builds.idle(); await deps.retirer.idle()` — `withProjectServer`
  drains builds, and `api/subsequent-releases.test.ts`'s `closed(ctx)` drains both. The full suite should
  log exactly ONE such line, the deliberate case in `retire.test.ts`.
- **A FIELD LEFT OUT OF A REPRESENTATION IS STRIPPED, SILENTLY, FROM EVERY ANSWER** (P6b sitting 4, F8).
  Representations are plain `z.object`s, and zod strips a key the schema does not name — so the read and
  the `409` both lose it, a byte-identical comparison of the two stays GREEN, and `tsc` is silent, because an
  object with an extra key satisfies the schema's type. `mapError`'s *"the refusal was sent without it"* only
  fires when a VALUE fails to parse. **The only witness of a forgotten field is a test that reads it by
  name** — and the mock's `validate.test.ts`, which holds the fixture to the document.
- **`error-codes.test.ts` READS COMMENTS** (P6b sitting 4, F4). It finds a thrown code by scanning source text
  for `new <Class>('` followed by a literal, so a comment that shows the pattern with a placeholder registers
  a code named after the placeholder, and *"registers every code the source throws"* goes red naming it.
- **THE DATABASE'S CLOCK IS NOT THE HOST'S — NEVER BOUND ONE WITH THE OTHER** (P6b sitting 6, F1). Postgres runs in
  Docker Desktop's VM and `clock_timestamp()` is that VM's clock; `new Date()` in the control plane is the host's.
  The rehearsal bounded its own `sso.registered` event by the host's time, and one `pnpm test` run read **8 red and
  the next 0** — every `launchedCwlProject` caller, *"the deploy recorded no Service Provider registration"*.
  Measured skew over a direct connection was ~0.1 ms at the time; after a laptop sleeps the VM can lag by seconds.
  Read the bound from the database (`select clock_timestamp()`, `549dda4`), or keep both instants on the host. **A
  red that appears once and not again, at a time comparison, is this before it is a flake.**
- **`StrictMode` + A READ-THEN-INSERT IDEMPOTENCY STORE MAKES TWO ROWS** (P6b sitting 6, F4). The console's dev
  server runs every effect twice; two POSTs with ONE `Idempotency-Key` in flight at once both run the handler,
  because `replayOrStore` reads before it inserts. A screen that CREATES on load must share the in-flight promise
  (`screens/approvals.tsx`'s `usePreview`). The production build (`make demo-console`) does not double-mount.
- **A CHROME CLICK BY `ref` MAY NOT DISPATCH** (P6b sitting 6, F13). Twice, `computer left_click` with a `ref`
  produced no request and no refusal — reading exactly like a dead button — while a click at the button's
  coordinates worked. **Read the network before calling a button dead**; and `read_network_requests` cannot show a
  request body, nor can a `fetch` wrapped after load (`openapi-fetch` captures `fetch` when the client is made).
- **~~THE CONSOLE'S *Sign out* DOES NOT SIGN YOU OUT OF CWL~~ — FIXED 2026-09-24 (`0aa1824`; P6b's record, *After
  the plan*).** *Sign out* now sends the browser through the IdP's single logout and back to `/`, and the next
  *Sign in with CWL* asks for a password — so switching person in Chrome is *Sign out*, then sign in as the other
  test user. **A session cookie signed BEFORE `0aa1824` carries no IdP handle**: its sign-out ends Manifest's
  session only and lands on `/`, exactly as before — sign out once more after signing in again. **`POST
  /auth/logout` now answers `200 { redirectTo }`, not `204`** — a script that follows it must go where it says.
  **And the SLO route refuses an UNSIGNED logout message**: it used to accept one (node-saml 5.1.0 skips a
  signature that is absent), and SimpleSAMLphp signs its logout messages only because every SP row now carries
  `sign.logout: true`.
- **`scripts/lib/api.sh`'s `api` CANNOT SEND A BODYLESS POST** (2026-09-24). It always sets `content-type:
  application/json`, and Fastify refuses an empty JSON body `400 REQUEST_INVALID` before the route runs — measured
  on `POST /auth/logout`. A browser's `fetch` with no body sends no content type and is fine. Use `curl -X POST -H
  "origin: $ORIGIN"` for such a route. Named, not fixed: no demo calls one today.
- **THE PERMISSION CLASSIFIER REFUSED PLAIN READS OF REPOSITORY FILES** (2026-09-24) — a batch that read
  `CLAUDE.md`, and one that read the `Makefile`, `scripts/doctor.sh` and `infra/seed/seed.sh`, both *"judged
  dangerous"* with no reason given, while `make doctor`, the Docker tier, both cleanup scripts' `--apply` and every
  other read in the same session were allowed. Until then it had only refused actions. **Do not retry around a
  refusal** — leave that item for Rich and say so. **Rich then said to try again, and every read was allowed** —
  `make refresh-vulndb` and the `CLAUDE.md` line were done the same day. So the refusal was not stable either; ask,
  then retry once.
- **A PROBE INSIDE `$(…)` UNDER `set -euo pipefail` DIES SILENTLY, TWO WAYS** (P6b sitting 7, F1 and F2). Busybox
  `wget` exits 1 on every non-2xx, so `got="$(docker exec … wget … | awk …)"` ended `make demo-releases` with
  NOTHING printed the moment a probe met a `403` — 3 of 3; and an `awk` that `exit`s at its first match closes the
  pipe while `docker exec` is still writing, so the exec dies of SIGPIPE — make says `Error 141` — now and then (0
  of 9 re-measured). Put `; true` INSIDE the container and let `awk` read to the end. **The status line is the
  evidence, never an exit code.**
- **§13 D9.2's BASELINE IS BY DECISION ORDER, NOT RELEASE ORDER** (P6b sitting 7, F3). `lastApprovedReleaseFor`
  takes the release whose latest decision is `approved` and was DECIDED most recently — so a release made earlier
  but approved later is the baseline, and it need not be what production serves (after a self-serve deploy it is
  not). A client that derives the baseline must implement exactly that; `packages/journey/src/releases.ts`'s
  `lastApproved` does, and its first draft (release order) agreed on every path until the first one where it did
  not.
- **A BARE `docker compose down` EXITS 0 AND LEAVES A PROFILED SERVICE RUNNING** (the D5 plan's sitting 1, F5;
  docker compose 5.4.0). With a service behind `profiles:` up, a plain `down` removes the others, reports the
  shared network *"Resource is still in use"*, and exits **0** — the profiled container keeps running and the
  network stays. Only `--profile <name> down` removes it. So a Makefile target's exit status cannot tell you the
  platform is down; a plain `compose build` likewise SKIPS a profiled service.
  `spikes/d5-baseline/probes/profiles.sh` reproduces both.
- **A BARE REPOSITORY'S `HEAD` IS `master` WHEREVER NO CONFIG SAYS OTHERWISE, AND A CLONE OF IT "SUCCEEDS" EMPTY**
  (the D5 plan's sitting 1, F2). Under `GIT_CONFIG_NOSYSTEM=1` on this Mac, and in `alpine:3.22`'s git by default,
  `git init --bare` points `HEAD` at `refs/heads/master`; after a push to `main`, a clone **exits 0** with *"remote
  HEAD refers to nonexistent ref, unable to checkout"* and no files. Create bare repositories with `-b main`, and
  assert a clone's CONTENT, never its exit code.
- **AFTER ONE UPSTREAM REWRITE, A NON-FORCED MIRROR FETCH REFUSES EVERY LATER PUSH TOO** (the D5 plan's sitting 1,
  F6). `git fetch --porcelain <remote> 'refs/heads/*:refs/heads/*'` reports `!` for the rewritten branch on every
  fetch after, including for an ordinary fast-forward on top of the new history, which lands in the object store
  with no ref. Keep what upstream has NOW in a second, forced refspec (`+refs/heads/*:refs/<ns>/*`) and read from
  that.
- **THE CHAT MODEL IS A THINKING MODEL, AND ONE LINE OF LITELLM CONFIG PER NAME IS ALL THAT KEEPS IT ANSWERING**
  (Rich's switch to `qwen3.5:4b`, 2026-09-24). `default-chat` and `default-chat-onprem` pin Ollama's own **`think:
  false`** in `infra/litellm/config.yaml`. Remove it and `default-chat` streams 260 frames with **0 content** —
  every token is `reasoning_content`, which the app toolkit discards, so an app gets an empty answer and no error
  (S3 Evidence 9, re-measured). **It is `think: false` and not `reasoning_effort: none` for a measured reason**: a
  REQUEST's own `reasoning_effort` overrides a mapping's (`"low"` brought back 231 reasoning frames and 0 content),
  while LiteLLM 1.98.0 maps a request's `reasoning_effort` to `think` first and copies the mapping's provider
  params over it (`utils.py:4268`, then `:4508`) — so with `think: false` a request's `"high"` still answers. **The
  one residual: a request sending Ollama's own `think: true` wins** (0 content, measured). `make verify`'s
  streaming check and `ai-path.docker.test.ts`'s *keeps the default names' thinking OFF even when a REQUEST asks
  for it* go red if the pin is removed or weakened back to `reasoning_effort: none` (control (a), watched red).
  **`default-chat-reasoning` and `default-chat-onprem-reasoning` are the same model with thinking ON** — a
  300-token limit answers empty, no limit answers after 17–129 s — and `reasoning_effort: medium` on them is
  documentation, not load-bearing (control (c): Ollama thinks by default). The config is a single-file bind mount:
  edit it IN PLACE (an editor that writes a new inode, including `git checkout`, leaves the container on the old
  file), then `docker restart manifest-litellm`, and read it back with `docker exec manifest-litellm grep …
  /app/config.yaml`.
- **A JSON SCHEMA IN `response_format` REACHES OLLAMA; JSON MODE ALONE DOES NOT FIX THE SHAPE** (2026-09-24).
  LiteLLM 1.98.0 maps `response_format: { type: 'json_schema', json_schema: { schema } }` to Ollama's `format:
  <schema>`, and a field renamed in the schema alone was used 3 times in 3. Without a schema the model invents its
  own keys, and wraps them in a Markdown fence about 1 time in 3. The D5 plan's Decision 22 makes the schema the
  rule.
- **REGISTERING AN ERROR CODE MOVES `openapi.json`, EVEN WITH NO ROUTE CHANGED** (2026-09-24, the D5 plan's sitting
  2, F9). The document's `ErrorCode` enum IS `api/error-codes.ts`'s registry, and every route's `errors:` list is
  printed into its operation's `default` description — so a task that registers a code, or retires one, turns
  `document.test.ts` red (*"openapi.json is stale from line …"*) until `pnpm contract:write && pnpm contract:generate`
  run and BOTH generated files are staged: `packages/contract/openapi.json` and `packages/contract/src/schema.d.ts`
  (a `.d.ts` — plans have named it `schema.ts`). Twice in two sittings a plan's commit step named neither.
- **`openssl genpkey -out` WRITES A PRIVATE KEY `600` WHATEVER THE UMASK** (2026-09-24, both Homebrew OpenSSL 3.6.3
  and LibreSSL 3.3.6). So a negative control that removes a mint script's `umask 077` and `chmod 600` cannot fail
  for the private key itself — only for the files written with `>` or `printf` beside it. Check each file's mode,
  not the script's lines.
- **Vitest's `it.each(…)('… %o')` formats a number as an OBJECT — in decimal.** A file-mode row `0o640` reads
  *"refuses mode 416"* in a red run. Label it: `.map((m) => [m.toString(8), m])` and `%s`.
- **A FILE YOU WRITE INTO THE TREE WHILE A BACKGROUNDED GATE RUN IS GOING IS READ BY ITS `lint`, `typecheck` AND
  `format:check`** (2026-09-24, the D5 plan's sitting 3). The open-of-sitting gates run `pnpm test` twice and then
  the three static gates, ~7 minutes in all; a new workspace package written meanwhile would have turned all three
  red for work that was not the tree's — `pnpm -r typecheck` iterates every `packages/*` with a `package.json`,
  linked or not. **Write in the scratchpad until the gates finish**, or move the work aside before the static
  gates start. `pnpm test` itself is safe: Vitest collects its files when it starts.
- **`node:22-alpine` IS NOT `alpine:3.22`** (2026-09-24, the D5 plan's Task 5). `node:22-alpine` is **Alpine
  3.24.1**, so `apk add git` in it installs **git 2.54.0** — the plan had measured `apk add git` in `alpine:3.22`
  (3.22.5, git 2.49.1) and predicted that. Measure a package's version IN THE IMAGE THAT WILL RUN IT: `docker exec
  <c> cat /etc/alpine-release`.
- **GITHUB'S `full-repository` SCHEMA DOES NOT REQUIRE `visibility`** (2026-09-24, the D5 plan's Task 4). Its 75
  required keys include `private` and not `visibility`, so a fake that drops `visibility` is caught by a VALUE
  assertion, never by `expectGitHubShape`. A negative control meant to prove the schema check is live must remove
  a REQUIRED key — read the list first: `node -e 'console.log(require("./packages/github-fake/conformance/github-schemas.json").components.schemas["full-repository"].required)'`.
- **REAL GITHUB, MEASURED 2026-09-24 — FOUR ANSWERS THE DOCUMENTATION DID NOT GIVE** (the D5 plan's Task 6;
  `packages/github-fake/conformance/golden.json`): an installation token's `permissions` answer ADDS `metadata:
  read` to what was requested; **a token SCOPED to one repository, holding `administration: write`, CAN CREATE
  another repository** (GitHub does not confine creation to a token's repositories); a `contents: read` token's
  push is refused `remote: Write access to repository not granted.` (not *"Permission to … denied"*); and a
  token CAN name a repository one second after creating it. `POST /orgs/{org}/repos` without `private: true`
  creates a PUBLIC repository (documented default). **The org `Manifest-local-dev` and the App's bot
  `manifest-local-dev[bot]` share a name**, so a normaliser that replaces a bare org name case-insensitively
  rewrites the bot's login too.

## Images already pulled

`postgres:16-alpine`, `registry:2`, `verdaccio/verdaccio:6`, `vimagick/tinyproxy`,
`ghcr.io/berriai/litellm:main-stable`, `node:22-alpine`, `curlimages/curl:8.11.1`,
`moby/buildkit:v0.32.2-rootless`, `mongodb/mongodb-community-server:7.0.28-ubi8`.

**That list is a hint, not a fact.** P1's execution on 2026-09-05 pulled and built
what it needed, so `caddy:2.11.4`, `alpine:3.22`, `php:8.3-apache` and `composer:2`
are now present, and four base images are **mirrored into the local registry** with
their digests pinned in `infra/images.lock` — which is what makes offline builds
work, since merely pulling is not enough. As verified on 2026-09-04, before that:
**`anchore/syft:v1.51.1` and `anchore/grype:v0.118.0` are absent** and P3 Task 12
needs them; the `alpine` present is **3.20**, not 3.22, and its digest is the one
`S1-controls-settled.md` used; and **`moby/buildkit:v0.27.0-rootless` sits alongside
the `v0.32.2` P3 pins**, so do not let a tool pick the older one.

**Take a snapshot before you touch anything:** `./scripts/snapshot-machine.sh`. It is
read-only, needs no `sudo` and no network, and runs under macOS's bash 3.2. Run it
again at the end and `diff` the two — that is how "leave the machine exactly as you
found it" stops being a memory. Today's baseline is
[`machine-baseline-2026-09-04.md`](machine-baseline-2026-09-04.md).

**What P1's execution changed, 2026-09-05.** The three host changes are now **in
place**: `/etc/resolver/manifest.internal`, the `127.0.0.2` alias on `lo0` (**joined by
`127.0.0.3` in P6a**, added by `sudo bash infra/host/p6a-second-address.sh`), and the
Caddy root trusted in the System keychain. All three are reversible with
`make host-undo`. `docker-simple-saml-saml-idp-1` is still **exited, not running** —
"must survive" means do not delete it, not that it is up. Valet was verified
untouched: its config files are unmodified (mtime 2026-07-03) and its dnsmasq is the
same process it has run since 1 September.

**Valet's dnsmasq hangs, and when it does NOTHING resolves — including `.test`.**
Hit on 2026-09-05 and diagnosed. The symptom is the most misleading kind: the
process is alive, `/etc/resolver/test` is correct, the config is correct,
`nc -z 127.0.0.1 53` **succeeds** — and every query times out. It is not a `.test`
problem: `vibonarium.local` and `google.com` time out too.

A stack sample of the hung process showed all 2497 samples in one place:

```
main → receive_query → forward_query → __sendto
```

**dnsmasq was blocked in `sendto` to an upstream nameserver, and dnsmasq is
single-threaded** — so one stuck upstream send freezes the entire resolver,
including names it would have answered locally with no upstream at all. `lsof`
showed `com.cisco` (root) holding DNS sockets to UBC's nameservers 137.82.1.2 and
142.103.1.42, so **suspect the Cisco Secure Client / VPN** on connect, disconnect
or network change.

**The fix, which changes no configuration:**

```bash
sudo launchctl kickstart -k system/homebrew.mxcl.dnsmasq
```

Then `sudo killall -HUP mDNSResponder`. **Diagnose before restarting** — if
`google.com` resolves and only `.test` does not, this is *not* the problem and a
restart will not help. Manifest is not involved either way: its dnsmasq containers
publish `127.0.0.1:7153`, never 53, and the two resolvers coexist — verified with
`cms.test` → 127.0.0.1 and `console.manifest.internal` → 127.0.0.2 answering at the
same time, each served by its own web server.

**Do not read a blank port as a free port.** Without `sudo`, `lsof` cannot see sockets
owned by other users, and Valet's dnsmasq runs as `nobody` — so port 53 reads as empty
while dnsmasq is plainly listening on it. The snapshot script reported `(free)` on its
first run and that was wrong; it now says "nothing visible to this user" and explains
why. `make doctor` (P1 Task 2) will need the same care.
