# FE-32 baseline — Task 1's measurements (2026-10-16)

*Measured 2026-10-16, from 15:30 PDT, by `manifest-fe32-s1` — the fourth coordinated run's job FE32-1 (`manifest-coord6`), FE-32's
sitting 1 ([`../../plans/2026-10-03-fe32-dependencies.md`](../../plans/2026-10-03-fe32-dependencies.md), Task 1), executed inline. HEAD
`4cb1f2c9` at the start. macOS 26.7.1 (25G241); **Docker Desktop 4.95.0, Engine 29.8.2** (client and server), `NCPU` 6 (Rich's *"keep 6"*),
7,934 MiB; buildx v0.37.2; BuildKit `moby/buildkit:v0.32.2-rootless` (the driver's); Node v24.12.0 and npm 11.6.2 on the host; the
blueprint's base `node:24-alpine` by digest (Node v24.21.0, npm 11.19.0); Verdaccio `verdaccio/verdaccio:6` (`sha256:fcb86134…`);
Grype `anchore/grype:v0.118.0`, its database built `2026-10-15T06:30:36Z`. On battery (97–94 %), host load 5–6 while measuring (Hatchery's
API runs between this sitting's windows). The network was ON.*

**Nothing under `packages/` changed.** Every Docker step ran in a window `manifest-coord6` held for it (HOLD written, Hatchery and the
front-end's round paused): Step 2's from 15:40:26 to 15:46:30, Steps 3–4's from 15:50:36 to 15:57:41, and Step 5's from 16:07:42 — its run stopped at 16:46:40 when Rich needed the machine (`[M5]`). The live mirror's configuration was never touched,
and it was asked only for packages and exact versions it holds (*The network*, the plan's Global Constraints); `[M3]` and `[M4]` ran
against a THROWAWAY mirror. Every builder, container, volume and network made was removed and counted gone (12 networks before and
after each window). Raw output: [`results-task1-2026-10-16.txt`](results-task1-2026-10-16.txt). Probes: [`probes/`](probes/). The
fact-by-fact re-read, every line number at `4cb1f2c9`: [`facts-at-4cb1f2c9.md`](facts-at-4cb1f2c9.md).

## The answers, and what each changes

| | Question | Answer | For |
|---|---|---|---|
| `[M1]` | The fifteen facts of *Read this first*, at HEAD | **None changed in meaning but fact 13**: the skeleton's `overrides` block is GONE (`1dcb905b`, 34 minutes after the plan's revision) and no committed `package.json` has one. Fact 12's count moved (254 → **298** `resolved`, every one `https://registry.npmjs.org/`). Fact 15 is now MEASURED. Four things the facts did not say: the base image pulls without a token only while 7100 answers; the builder's network and how a throwaway joins it; the base digest re-read; `# syntax=` is refused in `build/context.ts`, not the registry | Task 4's override rows; Task 2's token and its Docker case; every task's line numbers |
| `[M2]` | The builder exports a file | **Yes.** `--output type=local,dest=<dir>` from the driver's own `withEphemeralBuilder` exports exactly `package-lock.json` (the `FROM scratch` stage). **~0.6 s to a ready builder, ~3.2–3.4 s to resolve** the skeleton plus one package (`added 172 packages in 2s`). **Every base pin kept** (163 of 163, versions, `resolved` and `integrity` unchanged); the 9 new entries all name **`http://manifest-verdaccio:4873/`** (the review's I2, measured); **Decision 12's rewrite makes all 172 `https://registry.npmjs.org/`**, a scoped path included, and changes nothing else (the two files differ only in the host); **`make seed`'s warm loop installs the rewritten lockfile with no `WARN`, and the unrewritten one `WARN`s** (`ENOTFOUND manifest-verdaccio`). One `http fetch GET 200 …` line per tarball, every one through the mirror. The same inputs answered the same bytes twice | Task 2 (no stop): the recipe as written, its time budget, its `existing pins stay` and rewrite assertions, control (b)'s line; Decision 12 |
| `[M3]` | What npm says when the mirror cannot serve | **THE STOP-AND-ASK FIRED: (i) and (ii) print the SAME code.** With the uplink unreachable, a real package the mirror never cached and a name that cannot exist each end `npm error code E404` / `404 Not Found - GET <mirror>/<name> - no such package available` — and so does the name that cannot exist with the uplink REACHABLE (npmjs's own 404). Only Verdaccio's `http`-level log tells them apart. **Distinct, and offline:** (iv) a cached package at a version never published → **`ETARGET`** (`No matching version found for marked@999.0.0`); cached metadata with no tarball → **`E500 … uplink is offline`**, after ~70 s of npm's retries; the mirror itself unreachable → **`EAI_AGAIN`**, ~85 s. (iii): **`git+https:` fails** (`ENOENT`, `spawn git` — the image has no git), **but `file:../x` SUCCEEDS** — a `link: true` entry to a directory that does not exist | **Rich, before sitting 2** (put to him 15:58 through `manifest-coord6`): Decision 5's E404. Task 2's mapping table, retry budget and its `file:` row; Task 6's offline `marked@999.0.0` (ETARGET holds) |
| `[M4]` | Scripts are off; a test package unpublished | **Off.** A probe package whose `postinstall` writes `/resolve/RAN`, resolved through the real builder with Task 2's recipe: **no `RAN` in what is exported**; the same with scripts ON (the positive control): **`RAN` present**. **`npm unpublish --force` leaves nothing** (`404`; the scope's directory empty). **But Verdaccio REFUSES A PUBLISH while the package's uplink is down** — `503 … one of the uplinks is down, refuse to publish` — so the probe's scope had to be made local (no proxy) on the throwaway | Task 2's *scripts are off* case: it cannot publish to the platform's own mirror offline, and must not change its configuration — run it against the throwaway |
| `[M5]` | The gate numbers | **Read, unmoved: `EXPECT_TESTS` 4240, `EXPECT_FILES` 253, `EXPECT_DOCTOR` 23, `EXPECT_VERIFY` 67; contract `1.10.0`, 79 operations.** **`pnpm test` once is OWED**: the one run (16:12:56) was stopped by `manifest-coord6` at 16:46:40 when Rich needed the machine (a 1-min load median of 198, max 462, over its 30 minutes — a Zoom call and others' runs) — VOID, not a result | Every later gate; the next window |

## `[M2]` — the builder exports a file

**The probe** ([`probes/m2-export.mjs`](probes/m2-export.mjs), bracketed by [`probes/m2-run.sh`](probes/m2-run.sh)) imports the compiled
control plane (`dist/`, built 14:49, after the last `src/` change) and starts each builder through **`withEphemeralBuilder`** itself — the
name `mf-builder-<id>`, `manifest-build-internal`, the generated `buildkitd.toml` — then registers it with buildx's `remote` driver under a
throwaway `DOCKER_CONFIG` exactly as `runBuildxBuild` does, and builds through **`runStreamed`** with `--no-cache --provenance=false
--output type=local,dest=<out>`. One builder per case, destroyed by `withEphemeralBuilder`'s `finally`.

**The package.** The plan asks for one *"already in the mirror's storage but not in the skeleton's direct dependencies, at an EXACT version
the storage holds"*. **The mirror holds tarballs for exactly what the committed lockfiles pin, and a few versions past** (187 `.tgz` under 151 of
its 206 package documents; the other 55 are METADATA with no tarball — `fastify`, `ajv`, `marked` among them — from builds and probes
past), so the only name with a tarball outside
the skeleton's lockfile is **`passport-saml@3.2.4`** (the 0.1.6 era's), and its whole closure is held too. Its ranges were checked against
the mirror's own cached metadata before anything ran (`@xmldom/xmldom ^0.7.6` → 0.7.13, `xml-crypto ^2.1.3` → 2.1.6, `xml-encryption
^2.0.0` → 2.0.0, `xml2js ^0.4.23` → 0.4.23, `debug ^4.3.2` → 4.4.3 — each the newest the metadata names, each held). A second case,
**`cookie@0.7.1`** (held, no dependencies), measures a pin the new manifest's range FORCES.

| Case | What went in | Result |
|---|---|---|
| `add` | Step 2's Dockerfile; the skeleton's manifest + `passport-saml: 3.2.4`; its lockfile as the base | exit 0; builder 578 ms + build 3,203 ms; **173 entries: 163 kept, 0 moved, 0 gone, 9 new** — `node_modules/passport-saml` and eight under it (`@xmldom/xmldom` 0.7.13, `debug` 4.4.3, `ms` 2.1.3, `xml-crypto` 2.1.6, `xml-encryption` 2.0.0, `xml2js` 0.4.23 and its `xmlbuilder` 11.0.1, `xpath` 0.0.32), every one nested, so nothing hoisted moved. **The new entries' `resolved`: all 9 `http://manifest-verdaccio:4873/…`; the 163 kept: still `https://registry.npmjs.org/…`** — npm writes the registry it fetched from for what it adds, and keeps what the base said for what it keeps |
| `add-rewrite` | Task 2's `Resolve.tmpl`, verbatim (its glob `COPY` and Decision 12's `sed`) | exit 0; 606 + 3,362 ms; **all 172 `resolved` begin `https://registry.npmjs.org/`**, `@xmldom/xmldom`'s scoped path intact (`…/@xmldom/xmldom/-/xmldom-0.7.13.tgz`); its `integrity` unchanged; **the file is `add`'s byte for byte once the host is replaced** (`diff` empty) |
| `notoken` | `add` with NO auth in the `DOCKER_CONFIG` | **exit 0 — and the same lockfile as `add`, byte for byte** (`sha256 2cf69ac6…` both). The base pulled anyway: see *the token*, below |
| `first` | Task 2's recipe, NO base lockfile; `{ "dependencies": { "ms": "2.1.3" } }` | exit 0; 537 + 1,953 ms; **the glob `package-lock.jso[n]` matching nothing is accepted by BuildKit**, and a 2-entry lockfile comes out, rewritten. (Not the skeleton: with no lockfile every transitive RANGE is resolved afresh, and a newer version than the mirror holds would send it to npmjs) |
| `forced` | the skeleton + `cookie: 0.7.1` (express asks `~0.7.1`; the hoisted one is 0.7.2) | exit 0; **`node_modules/cookie 0.7.2 → 0.7.1` (the one pin the range forces), `node_modules/express-session/node_modules/cookie` 0.7.2 new**, 162 kept — *"…unless the new manifest's ranges force a change"* (Spec action A's words), as it looks |

**`--loglevel http`'s line for the new package's tarball** (Task 2's control (b) reads one like it):

```
#8 1.169 npm http fetch GET 200 http://manifest-verdaccio:4873/passport-saml/-/passport-saml-3.2.4.tgz 440ms (cache miss)
#8 1.090 npm http fetch GET 200 http://manifest-verdaccio:4873/@xmldom/xmldom/-/xmldom-0.7.13.tgz 335ms (cache miss)
```

183 `http fetch GET 200` lines in `add` — 172 tarballs and 11 package documents (the new names'), **every one `manifest-verdaccio:4873`,
none anywhere else**; `(cache miss)` on each, because the recipe's cache is the build's own `/tmp/npm-cache`. `npm http cache … (cache hit)`
lines also appear (npm's in-process cache within the one install); a test must match `http fetch GET 200 …\.tgz`, not `http cache`.

**The mirror** (`m2-run.sh`'s brackets): **187 `.tgz` before and after** — no tarball fetched from npmjs; **but every package the resolution
asked had its metadata refreshed** (`_uplinks.npmjs.fetched` 2026-10-03T22:11:13Z → 2026-10-16T22:41:07Z): fact 15, recorded, as the plan's
*The network* foresaw.

**`make seed`'s warm loop** ([`probes/m2-warm.sh`](probes/m2-warm.sh) — `infra/seed/seed.sh:74-86`'s lines exactly, `--silent` and all, on
the host against `127.0.0.1:7108`): **`add-rewrite`'s lockfile installs (130 top-level entries, `passport-saml` 3.2.4) with no `WARN`;
`add`'s (unrewritten) prints `WARN: mirror warm failed`**, and the same install unsilenced says why: `npm error code ENOTFOUND … request to
http://manifest-verdaccio:4873/passport-saml/-/passport-saml-3.2.4.tgz failed, reason: getaddrinfo ENOTFOUND manifest-verdaccio`. The
review's I2 is exactly right, and Decision 12 is what fixes it.

**Every shape of `packages` entry the committed lockfiles hold** (Task 4's lockfile check passes exactly these): **plain, and `peer`** —
`node-ts-mongo`'s skeleton 160 plain + 4 `peer`, `saml-sp` 111 + 1 `peer`, both `fixture-node` and `fixture-app` 13 plain. **No `bundled`,
`optional`, `devOptional`, `inBundle` or `link` entry anywhere**; the fields used are `bin, dependencies, deprecated, engines, funding,
integrity, license, name, peer, peerDependencies, peerDependenciesMeta, resolved, version`. (`[M3]`'s `file:` case below makes a `link`.)

**The token.** The registry answers `401` with `Bearer realm="http://127.0.0.1:7100/internal/registry/token"`, and buildx's HOST-side
client follows the realm: 7100's route answers an anonymous `base/*` pull token (`200`). So a resolution with no token builds — while 7100
answers. **Task 2's *"no registry token (it pushes nothing)"* fails wherever 7100 is down, which the Docker tier requires** (ORIENTATION §4's
trap 7). *Recommendation:* `runBuildxResolve` takes a minted pull-only token for the base repository, as `buildImage` mints its pull half.

**What the build's scan would say** (Grype on the exported lockfile, `--network none`, the database volume read-only, `scan.ts`'s
environment): **`passport-saml@3.2.4`'s closure is refused by the build** — `@xmldom/xmldom@0.7.13` carries **13 fixable Highs** (every
fix 0.8.12–0.8.15), and `scan.ts` blocks a fixable Critical or High the app introduces (`BLOCKING_SEVERITIES`, `:15`); `passport-saml`'s
own Critical (GHSA-4mxg-3p6v-xgq3) has no fix. **`forced`'s lockfile and the skeleton's own each have 2 matches, neither Critical nor
High.** So `[M2]`'s package serves every RESOLUTION assertion, and **cannot serve Task 2's *"then a build of that manifest and lockfile
succeeds"* or Task 3 Step 4's build through the edge** — `cookie@0.7.1` can, with its one forced pin named.

## `[M3]` — what npm says when the mirror cannot serve

**The throwaway** ([`probes/m3-throwaway.sh`](probes/m3-throwaway.sh), driven by [`probes/m3-run.sh`](probes/m3-run.sh)): `verdaccio/verdaccio:6`
— the compose file's image, the same local `sha256:fcb86134…`, **Verdaccio 6.10.1** by its own banner — named `mf-fe32-verdaccio-probe`,
its own network `mf-fe32-probe` and port `127.0.0.1:7196`, its own volume, and a COPY of `infra/verdaccio/config.yaml` whose uplink is
replaced (and its log at `http`, registration on for `[M4]`). **It joins the builder's network under an alias of its own** — `docker network
connect --alias mf-verdaccio-probe manifest-build-internal <it>` — and a builder reaches it there through a context `.npmrc` naming
`http://mf-verdaccio-probe:4873/`: Task 2's Docker-case design, measured working. For (iv) the throwaway was SEEDED by copying `marked`'s
cached document (metadata, no tarball) and `ms`'s (metadata and both tarballs) out of the live mirror — read-only to it — instead of
*"resolve it once with the uplink up"*: the copy needs no network, and it is the acceptance's own case, the live mirror's `marked` metadata.
Each case carried the skeleton's manifest and lockfile, as a real request does; (iv)'s positive control and `[M4]` a one-package manifest,
because the throwaway holds none of the skeleton's tarballs.

| Case | The uplink | What the throwaway answered (`curl`) | What npm printed (verbatim, `#8 <t>` stripped) |
|---|---|---|---|
| (i) `left-pad@1.3.0`, never cached | refused (`127.0.0.1:9`) | `404 {"error": "no such package available"}` | `npm error code E404` · `npm error 404 Not Found - GET http://mf-verdaccio-probe:4873/left-pad - no such package available` · `npm error 404  The requested resource 'left-pad@1.3.0' could not be found or you do not have permission to access it.` |
| (ii) `manifest-no-such-package-<nonce>@1.0.0`, cannot exist | refused | `404 {"error": "no such package available"}` | **the same lines**, the name its own |
| (i) and (ii) | a name that does not resolve (`registry.npmjs.invalid`) | `404`, both; Verdaccio's log: `--- ERR, req: 'GET http://registry.npmjs.invalid/<name>', error: getaddrinfo ENOTFOUND registry.npmjs.invalid` | **the same lines, both** |
| (ii) | **REACHABLE** (`https://registry.npmjs.org/`) | `404`; Verdaccio's log: `--- 404, req: 'GET https://registry.npmjs.org/manifest-no-such-package-<nonce>'` | **the same lines** |
| (iv) `marked@999.0.0`, metadata cached, never published | refused | `200` (the cached document) | `npm error code ETARGET` · `npm error notarget No matching version found for marked@999.0.0.` |
| (iv) `ms@999.0.0` | refused | `200` | `ETARGET`, the same shape |
| (iv)'s positive control: `ms@2.1.3`, held | refused | — | `added 1 package` — the seeded storage is served with the uplink down, so the ETARGETs above are the metadata's answer, not a fetch that failed |
| `[M3b]` `marked@18.0.14` — its metadata cached, its TARBALL not | refused | Verdaccio's log: `<-- 500 … 'GET /marked/-/marked-18.0.14.tgz', error: uplink is offline` | three attempts (0.3 s, 10.3 s, 70.4 s), then `npm error code E500` · `npm error 500 Internal Server Error - GET http://mf-verdaccio-probe:4873/marked/-/marked-18.0.14.tgz - uplink is offline` — **72 s** |
| the mirror's name not resolving (the throwaway not running — a slip, kept because it is the case of the platform's mirror being down) | — | — | three attempts (5.2 s, 20.3 s, 85.3 s), then `npm error code EAI_AGAIN` · `npm error request to http://mf-verdaccio-probe:4873/marked failed, reason: getaddrinfo EAI_AGAIN mf-verdaccio-probe` — **87 s** |
| (iii) `left-pad: git+https://github.com/left-pad/left-pad.git` | the PLATFORM's mirror (Step 2's builder) | — | `npm error code ENOENT` · `npm error syscall spawn git` · `npm error enoent An unknown git error occurred` — exit 254, 1.6 s. The base image has no `git`, so npm never reaches the network; the builder has no route anyway |
| (iii) `x: file:../x` (no such directory) | the platform's mirror | — | **exit 0.** The lockfile gains `"node_modules/x": { "resolved": "../x", "link": true }` and an empty `"../x": {}` — npm links to a directory that is not there and says nothing |

**What this means for Decision 5** (put to Rich, below): **a missing NAME is `E404` whether the registry lacks it or the mirror could not ask
— npm cannot tell, because Verdaccio answers both `404 no such package available`.** What npm CAN tell apart is: a version the metadata
lacks (`ETARGET`, offline too — so Task 6's `marked@999.0.0` → `DEPENDENCY_NOT_FOUND` holds offline, as the plan hoped), a tarball the
mirror cannot fetch (`E500 … uplink is offline`), and a mirror that cannot be reached (`EAI_AGAIN`). The two slow shapes cost **70–90 s of
npm's own retries** (`fetch-retries` 2, its 10 s/60 s back-off) — a budget Task 2 should set deliberately rather than inherit (a routine
call for that sitting: the recipe can pass `--fetch-retries`). **A resolver must read `npm error code …` lines, never `http fetch GET 404`
ones:** npm asks the registry for `npm` itself (`GET 404 …/npm`, twice) in runs that succeed.

**The phases' directories.** The three uplink phases ran the same case names, so (i)'s and (ii)'s npm logs on disk from the first run are the
LAST phase's; their refused-phase answers are in the throwaway's log and the `curl` lines. A re-run with each phase in its own directory
(`FE32_PHASE`, now in `m2-export.mjs` and `m3-run.sh`) is OWED to the next window (the pause that voided Step 5 stopped it).

## `[M4]` — scripts are off; a test package unpublished

[`probes/m4-run.sh`](probes/m4-run.sh): the throwaway again, its uplink refused. **The first attempt could not publish**: `npm error code
E503` · `503 Service Unavailable - PUT http://127.0.0.1:7196/@manifest-probe%2fpostinstall-<n> - one of the uplinks is down, refuse to
publish` — Verdaccio asks the uplink before it accepts a package its `'@*/*'` rule proxies, and refuses when it cannot. The second made the
probe's scope LOCAL on the throwaway (`'@manifest-probe/*': { access: $all, publish: $all }`, before `'@*/*'`; [`m3-throwaway.sh`](probes/m3-throwaway.sh)'s
`FE32_LOCAL_SCOPE`), registered a user through Verdaccio's own API (the throwaway's `max_users` raised from `-1`), and published
`@manifest-probe/postinstall-191209@1.0.0` — a `postinstall` of `node -e "require('fs').writeFileSync('/resolve/RAN', 'ran')"`:

| Case | Result |
|---|---|
| Task 2's recipe, exporting all of `/resolve/` | exit 0, 2.5 s; 6 files exported, the lockfile names the probe (3 lines) — **no `RAN`** |
| **the positive control**: the same recipe WITHOUT `--ignore-scripts` | exit 0, 2.6 s; 7 files — **`RAN` present, reading `ran`**. So the absence above is the flag's doing, not a marker that could never appear |
| `npm unpublish --force` | `- @manifest-probe/postinstall-191209`; the throwaway then answers `404 no such package available`; its storage keeps only the empty `@manifest-probe/` directory |

**For Task 2's *scripts are off, and only the mirror is reached* case**, which the plan writes against *"the platform's mirror under
`@manifest-probe/`"*: **offline, that publish is refused `503`**, and the platform's mirror's configuration may not be changed (Global
Constraints). Online it would be accepted after Verdaccio asks npmjs about the name. *Recommendation:* the case publishes to the throwaway its
*mirror cannot serve it* case already starts (with the probe scope local), not to the platform's mirror — the same builder, the same recipe,
and nothing left in the platform's storage if a `finally` never runs.

## `[M5]` — the gate numbers

**`pnpm test` once is OWED.** It started 16:12:56 PDT (1-min load 7.20) in a HOLD `manifest-coord6` wrote for it, and **was stopped by the coordinator at 16:46:40** (`kill -TERM` of its process group, by id) when Rich needed his machine for a call: `test-gently`'s line read *"load (1-min) min 7.20 / median 197.96 / max 461.55 over 60 samples 30 s apart; QoS utility, timeout scale 5, gate 12, forced no; exit 143"*. Its one red before the stop — `launch/records.test.ts`, *"the owner's send from change_requested clears it — and keeps where it was sent from"*, `Test timed out in 25000ms` — came at that load and is **VOID, not a result** (§4's load trap). The run goes in the next window this sitting is given; its numbers will be added here, dated. Read without a run: `scripts/ci-acceptance.sh`'s **`EXPECT_TESTS=4240`,
`EXPECT_FILES=253`** (`:378-379`), **`EXPECT_DOCTOR=23`** (`:385`), **`EXPECT_VERIFY=67`** (`:390`); the Docker tier **316 / 0 skipped / 46
files** (ORIENTATION §2's row, not re-run — nothing here is owed one). **Contract `1.10.0`** (`api/contract/document.ts:140`;
`packages/contract/openapi.json`'s `info.version`, **79 operations**) — so this plan's Task 3 takes **`1.11.0`**, as written.

## Findings for the later sittings

Each was measured or read here; none is decided here. The sitting that owns it rules on it, with the spec as the authority — except F3,
which the plan's own stop-and-ask gives to Rich.

1. **F1 — THE SKELETON'S `overrides` BLOCK IS GONE** (fact 13; `1dcb905b`, 2026-10-03 15:18). No committed `package.json` has one. Decision
   11's override rule stands, but **Task 4's passing row *"the skeleton's own `@xmldom/xmldom` override passes"* and Review Focus 6's last
   clause have no subject**. *Recommendation:* Task 4's passing row uses a TEST manifest whose override pins a package in the base
   lockfile's closure (e.g. `@xmldom/xmldom`, which the skeleton's lockfile holds at 0.8.15 for `@node-saml/node-saml` (`^0.8.10`), `xml-crypto` (`^0.8.15`) and `xml-encryption` (`^0.8.5`)).
2. **F2 — THE BASE IMAGE PULLS WITHOUT A TOKEN ONLY WHILE 7100 ANSWERS** (`[M2]` *the token*). Task 2's *"`runBuildxResolve` … no registry
   token (it pushes nothing)"* builds in the running platform and fails in the Docker tier, which stops 7100. *Recommendation:* mint a
   pull-only token for the base repository, as `buildImage` does (`runtime/docker/driver.ts:340-353`).
3. **F3 — `[M3]`'s STOP-AND-ASK: (i) AND (ii) PRINT THE SAME CODE.** `E404 … no such package available` for a real package the mirror never
   cached (uplink down) and for a name that cannot exist (uplink down, AND up). Decision 5 maps `E404` to `DEPENDENCY_NOT_FOUND`. **Put to
   Rich through `manifest-coord6` at 15:58** with three options — (a) `E404` → `DEPENDENCY_UNAVAILABLE`, `ETARGET` → `DEPENDENCY_NOT_FOUND`
   (recommended: Task 4's allowlist refuses a hallucinated name before the mirror, so Review Focus 1's three cases stay distinct as
   measured; what is lost is an ALLOWED package npmjs has since unpublished, which reads *"not now"*); (b) read the mirror's own log
   (`level: http` in `infra/verdaccio/config.yaml:23`, a driver coupled to Verdaccio 6.10.1's log text); (c) keep `E404` →
   `NOT_FOUND` (rejected: offline, a real allowed package would read *"no such thing"*). **It gates sitting 2.** *(His answer, when it
   comes, is recorded in the plan's Sitting 1 and in `docs/superpowers/2026-09-30-decisions.md`.)*
4. **F4 — `file:../x` RESOLVES SILENTLY** (`[M3]` (iii)): exit 0, a `link: true` entry to a directory that does not exist. Review Focus 4's
   *"at the driver, the two specifiers fail as `DEPENDENCY_RESOLUTION_FAILED`"*, and Task 2's Docker row for them, are **false for
   `file:`** — only Task 4's specifier check (the operation, before any builder) and its lockfile check (the gate's `link: true` refusal)
   stop it. *Recommendation for Task 2:* the driver refuses an EXPORTED lockfile holding any `link` entry as `DEPENDENCY_RESOLUTION_FAILED`
   (defence in depth; the committed lockfiles hold none — `[M2]`'s shapes), or its `file:` row asserts the link and leaves the refusal to
   Task 4.
5. **F5 — `git+https:` FAILS AS `ENOENT` / `spawn git`** — the base image has no `git`, so npm never reaches the network. A mapping that read
   network-shaped codes as *"not now"* must not read this one so: it is `DEPENDENCY_RESOLUTION_FAILED`.
6. **F6 — VERDACCIO REFUSES A PUBLISH WHILE THE PACKAGE'S UPLINK IS DOWN** (`[M4]`): `503 … one of the uplinks is down, refuse to publish`.
   Task 2's *scripts are off* case publishes `@manifest-probe/` to *"the platform's mirror"* — offline that is refused, and its configuration
   may not change. *Recommendation:* publish to the throwaway the same file already starts, its probe scope local.
7. **F7 — `[M2]`'s PACKAGE CANNOT BE BUILT, BECAUSE THE SCAN WOULD REFUSE IT.** The mirror's only tarball outside the skeleton's lockfile is
   `passport-saml@3.2.4`'s closure, and `@xmldom/xmldom@0.7.13` in it carries 13 fixable Highs (`scan.ts` blocks those). So Task 2's *existing
   pins stay* case can use it — **and its *"then a build of that manifest and lockfile succeeds"* (Review Focus 3), and Task 3 Step 4's build
   through the edge, cannot.** `cookie@0.7.1` can (scan-clean; one pin it forces, named: `node_modules/cookie` 0.7.2 → 0.7.1). *Or* the
   network, for a new package — which the plan keeps for sitting 5's `marked`.
8. **F8 — NPM'S RETRIES COST 70–90 s** for the two slow *"not now"* shapes (a tarball the mirror cannot fetch: 72 s; the mirror unreachable:
   87 s). The operation answers synchronously (Decision 2). *For Task 2/3:* a deliberate `--fetch-retries` in the recipe, and a time budget the
   route can state.
9. **F9 — THE LIVE MIRROR REFRESHES EVERY ASKED PACKAGE'S METADATA ONLINE** (fact 15, measured; no tarball fetched). And npm asks for **`npm`
   itself** on every run (`GET …/npm`, twice — 404 on the throwaway): a resolver reads `npm error code` lines, never `http fetch GET 404`;
   the recipe may pass `--no-update-notifier` (a routine call for sitting 2).
10. **F10 — VERDACCIO IS PINNED BY TAG ONLY** (`verdaccio/verdaccio:6`, `infra/compose.yaml:175`; not in `infra/images.lock`). Recorded beside
    *"Postgres pinned by tag only"* (ORIENTATION §7e's *Recorded, not placed*); `[M3]`'s answers are Verdaccio 6.10.1's.
11. **F11 — `# syntax=` IS REFUSED IN `build/context.ts`, NOT THE REGISTRY** (`renderDockerfile`, `:55-75`). Task 2's Files line has
    `registry.ts` *"refuses a `# syntax=` line in it as it does there"*; the recipe should go through `renderDockerfile` (it renders
    `{{BASE_IMAGE}}` too), and the registry's check, if any, is new.
12. **F12 — SPEC ACTION C'S §26 WORDS NAME A2'S SENTENCE**, which is not there (A2 now comes after this plan): C goes after B's *"And the load
    rehearsal's profile and pass mark (§24)."* (spec l.3068-3069), and its *"(the gap B's Spec action B names)"* is re-read against l.3069's
    *"Each change is audited with its actor"*. Rich's words to decide; recorded here so the reviewer reads them against the spec as it is.
