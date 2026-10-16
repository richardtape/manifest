# FE-32 `[M1]` — every *Read this first* fact, re-read at `4cb1f2c9` (2026-10-16)

*Read 2026-10-16, 15:30–15:40 PDT, by `manifest-fe32-s1` (the fourth coordinated run's FE32-1), from the main checkout at
`4cb1f2c9`, tree clean but an untracked `.claude/` that is not this sitting's. The plan's facts were read at `eee5648` (1–11) and
`75030d8` (12–15) on 2026-10-03; every plan from faculty-ready's last sittings to B has landed since. Paths are under
`packages/control-plane/src/` unless they start with a top-level directory.*

**Verdict: none of the fifteen changed in meaning but one — fact 13's override is gone from the skeleton.** Most line numbers moved;
the new ones are below. Four things the facts did not say, and later tasks need, follow the table.

| # | The plan's fact (2026-10-03) | At `4cb1f2c9` | Changed? |
|---|---|---|---|
| 1 | The Dockerfile copies `package.json`, `package-lock.json`, `.npmrc`, then `npm ci --omit=dev --ignore-scripts`; the platform writes `.npmrc` AFTER the app's tree (`build/context.ts:78-96`, `:265`), every lookup and tarball at `http://manifest-verdaccio:4873/` (`replace-registry-host=always`) | `blueprints/node-ts-mongo/Dockerfile.tmpl:34` (the `COPY`), `:43-44` (`npm ci --omit=dev --ignore-scripts && rm -rf /root/.npm /tmp/node-compile-cache`); `build/context.ts:265-272` copies `.npmrc` and `.dockerignore` from the blueprint after the tree is unpacked (`:225-245`); the copy-before-install check `BLUEPRINT_NPMRC_AFTER_INSTALL` is `:77-100`; `blueprints/node-ts-mongo/.npmrc:8` `registry=http://manifest-verdaccio:4873/`, `:21` `replace-registry-host=always`, `:25` `strict-ssl=false`, `:28-29` `audit=false`, `fund=false` | Lines only |
| 2 | §12's gates are `runMandatoryGates(dir, { lockfile })` — the secret scan and the lockfile's existence (`build/gates.ts:99-108`, `requireLockfile` `:84-95`); the driver hard-codes `lockfile: 'package-lock.json'` (`runtime/docker/driver.ts:296-299`) | `build/gates.ts:95-108` (`runMandatoryGates`, its *"Two parameters, and deliberately no third"* comment `:95-98`), `requireLockfile` `:74-93`, `scanForSecrets` `:54-72`; the literal is `runtime/docker/driver.ts:307-309` | Lines only |
| 3 | The builder: an ephemeral rootless BuildKit container through buildx's `remote` driver (`runtime/docker/builder.ts`); a build is `docker buildx --builder <it> build … --output type=image,…,push=true` (`:414-500`), streamed to `onLog`, serialized by `queue.run(spec.projectSlug, …)` (`driver.ts:285`), bounded by destroying the builder | `withEphemeralBuilder` `runtime/docker/builder.ts:177-222` (`moby/buildkit:v0.32.2-rootless`, `NetworkMode: 'manifest-build-internal'` `:198`, `seccomp`/`apparmor` unconfined, `/dev/fuse`, not privileged, destroyed in its `finally` `:218-221`); the generated `buildkitd.toml` `:44-68` (`[dns] nameservers = ["127.0.0.11"]`, the registry `http = true`, `max-parallelism`, gc); `runBuildxBuild` `:421-538` (`buildx create --driver remote docker-container://<builder>` under a throwaway `DOCKER_CONFIG` with the `cli-plugins` symlink `:422-460`; the build `:464-506` with `--output type=image,name=…,push=true,rewrite-timestamp=true` `:496-497`); `runStreamed` `:299`; `queue.run(spec.projectSlug, …)` `runtime/docker/driver.ts:295`; `DEFAULT_BUILD_LIMITS` `:21-31` (900 s, 4 GB, parallelism 4, 2 global, 1 per project) | Lines only |
| 4 | `Driver` (`runtime/driver.ts:327-…`) has `buildImage(src, spec, opts)`; the fake implements it (`runtime/fake-driver.ts:130`); `runtime/driver-contract.ts` is the suite both pass | `interface Driver` `runtime/driver.ts:350-457`, `buildImage` `:352-356`; `BuildOpts` `:337`; the fake's `buildImage` `runtime/fake-driver.ts:171`; the contract's build cases `runtime/driver-contract.ts:176-191`. Since 2026-10-03 the interface gained A1's and B's methods (`servingInstances`, `listInstances`, `restoreRoute`, `setRateLimitExemption` `:406`, `switchOff`, `removeName`) | Lines, and the interface grew |
| 5 | `infra/verdaccio/config.yaml` proxies every package from npmjs (`'**': { access: $all, publish: $all, proxy: npmjs }`, `cache: true`); no allowlist | Unchanged: `uplinks.npmjs` `:9-13` (`url: https://registry.npmjs.org/`, `cache: true`, `timeout: 30s`), `'@*/*'` `:15-18` and `'**'` `:19-22` both `proxy: npmjs`; `auth.htpasswd.max_users: -1` `:8` (registration off); `log` `level: warn` `:23`. **The image is pinned by TAG only** — `verdaccio/verdaccio:6` (`infra/compose.yaml:175`), not in `infra/images.lock`; the running one is `sha256:fcb86134563534e2f634752e6c6c3edcdb78242ec16578c73ce39d1dadbaa801` (created 2026-08-26), started 2026-10-16 21:49 UTC | No — and a tag pin to record beside Postgres's |
| 6 | `make seed` warms the mirror with a FULL install of every skeleton's and fixture's lockfile, in a temp directory, with an empty npm cache (`infra/seed/seed.sh:38-73`) | `infra/seed/seed.sh:45-86` (step `4b/6`); the loop itself `:74-86` — `for manifest in blueprints/*/skeleton/package.json fixtures/*/package.json`, `npm install --registry "http://127.0.0.1:$PORT_VERDACCIO" --cache "$tmp/.npm-cache" --no-audit --no-fund --silent` `|| echo "     WARN: mirror warm failed for $d"`; `PORT_VERDACCIO=7108` (`infra/lib/common.sh:86`). **Starters are not in the loop** (`blueprints/*/starters/*` has no `package.json`, so nothing is missed today) | Lines only |
| 7 | The knowledge pack says *"Adding a dependency means adding it to `package.json` **and** committing the regenerated `package-lock.json`"* (`blueprints/node-ts-mongo/agents/AGENTS.md:10-13`) | The same sentence, `AGENTS.md:11-13` | Lines only |
| 8 | The front-end's measurement (its F3 sitting 1, M4, manifest `346cd9e`) | Not re-measured: it is the front-end's dated record. The path it describes stands — a failed `npm ci` reaches `Build.error` through `releases/build.ts:209-224` | — |
| 9 | `createCommit` (`api/routes/source.ts:~499-…`, `capability: 'source:write'`) | `api/routes/source.ts:500-…` (`operationId: 'createCommit'` `:501`, `capability: 'source:write'` `:518`, `bodyLimit: 8 MiB` `:514`); its errors begin `:519` | Lines only |
| 10 | `readTextIn(gitDir, commit, path)` (`source/reading.ts:244`), refused past 1 MiB, binary or not UTF-8 | `source/reading.ts:244`; `READ_LIMITS.fileBytes = 1024 * 1024` `:22`; binary is a NUL in the first 8000 bytes; `SOURCE_FILE_NOT_TEXT` | No |
| 11 | Platform settings are deployment configuration, read at boot (`config.ts`, `MANIFEST_CAPABLE_MODEL_FALLBACK` `:319`, `MANIFEST_AGENT_SESSION_CAP_USD` `:326`); §26 lists them (spec l.2959-2966); no settings table | `config.ts:406` and `:446`; B's `MANIFEST_LOAD_*` beside them `:327-336`. §26's *Platform settings* is now **spec l.3060-3070**, and B's Spec action B is applied there (*"And the load rehearsal's profile and pass mark (§24)"*, l.3068-3069) — A2's sentence is NOT (A2 now comes after this plan) | Lines; see *For the spec actions* |
| 12 | Every committed lockfile names the public registry: all **254** `resolved` URLs begin `https://registry.npmjs.org/` | **298** `resolved` URLs in four lockfiles, every one `https://registry.npmjs.org/`: `blueprints/node-ts-mongo/skeleton` 163, `blueprints/fixture-node/skeleton` 12, `fixtures/fixture-app` 12, `fixtures/saml-sp` 111 (all `lockfileVersion` 3). The other fixtures (`bulletin-board`, `frontend-app`, `launch-path-app`, `load-app`) have no `package.json` — they lie over the skeleton | The count (254 → 298) |
| 13 | **The skeleton uses `overrides`** — `@xmldom/xmldom` to `0.8.15` | **GONE.** `1dcb905b` (2026-10-03 15:18, passport-ubcshib 0.1.7-rc.1 — 34 minutes after the revision at `75030d8`) removed it. **No committed `package.json` has an `overrides` block.** The skeleton's lockfile still pins `@xmldom/xmldom` 0.8.15 at `node_modules/@xmldom/xmldom`, the range three of its dependents ask (`@node-saml/node-saml` `^0.8.10`, `xml-crypto` `^0.8.15`, `xml-encryption` `^0.8.5`) | **YES** — Task 4's *"the skeleton's own `@xmldom/xmldom` override passes"* has nothing to read |
| 14 | `runMandatoryGates(dir, blueprint: { lockfile })` forbids a third parameter; a refusal reaches `Build.error` as `BUILD_GATE_FAILED: build blocked by N mandatory gate finding(s): [<gate>] <message> — <hint>`; the driver's hint *"Remove the secret, or commit the lockfile"*; **the driver loads the descriptor AFTER the gates** (`:309`) | `BuildGateError` `build/gates.ts:13-35`; `Build.error` is built `releases/build.ts:219-224` (`code: message — hint`); the hint `runtime/docker/driver.ts:313-315`; the descriptor loaded after the gates at **`:319`**. Not in the fact: **`assembleContext` already loads the descriptor once** (`build/context.ts:246`, for the Dockerfile's name) and `loadBlueprintDescriptor` is exported (`:116`), so Task 4's *"loaded BEFORE the gates"* is a move of `:319`, not a new read | Lines; one addition |
| 15 | With the network on, Verdaccio refreshes a package's metadata from npmjs when asked after its cache ages (`config.yaml:9-13`) | **MEASURED by `[M2]`** (2026-10-16 15:41 PDT, the network on): every package the resolution asked had its `_uplinks.npmjs.fetched` moved from `2026-10-03T22:11:13Z` to `2026-10-16T22:41:07Z` — and **no tarball was fetched** (187 `.tgz` before and after) | Confirmed by measurement |

## What the facts did not say, that later tasks need

- **The base image pulls without a token only while 7100 answers.** The registry answers `401` with `Bearer
  realm="http://127.0.0.1:7100/internal/registry/token"`; buildx's HOST-side client follows the realm, and 7100's route
  (`api/unversioned.ts`) answers an anonymous `base/*` pull token (`200`, a 2,154-character JWT). So `[M2]`'s case with NO
  token in its `DOCKER_CONFIG` built (`notoken`, exit 0). Task 2 says `runBuildxResolve` takes *"no registry token (it pushes
  nothing)"*: it works in the running platform, and fails wherever 7100 is down — the Docker tier stops 7100 (ORIENTATION §4's
  trap 7). *Recommendation for Task 2:* mint a pull-only token for the base repository, as `buildImage` already does for its pull
  half (`driver.ts:340-353`).
- **The builder's network.** `manifest-build-internal` is compose's `build-internal` (`infra/compose.yaml:11-13`, `internal:
  true`, a bridge with no gateway). The live mirror and the registry are dual-homed on it and `manifest-platform`
  (`compose.yaml:178`). BuildKit's RUN steps resolve names through Docker's embedded DNS, `127.0.0.11`, which the generated TOML
  names (`builder.ts:48-52`). **A throwaway joins it under an alias of its own** with `docker network connect --alias
  mf-verdaccio-probe manifest-build-internal <container>` — measured by `[M3]` (its README section).
- **The base image by digest** — `blueprints/node-ts-mongo/blueprint.yaml:33`,
  `manifest-registry:5000/base/node@sha256:38a36422dc7de80f3ced964270f23b3b17f73af816728d21a5fbbf84bf8be46f`, re-read from the
  registry's own storage (`…/base/node/_manifests/tags/24-alpine/current/link` → the same digest). Node v24.21.0, npm 11.19.0
  (the blueprint's comment, `:28-29`).
- **`# syntax=` is refused in `build/context.ts`, not `blueprints/registry.ts`.** `renderDockerfile` (`build/context.ts:43-…`,
  the `BLUEPRINT_EXTERNAL_FRONTEND` refusal `:55-75`) is where Task 2's *"refuses a `# syntax=` line in it as it does there"* is
  done today; the registry (`blueprints/registry.ts`) reads the descriptor and the skeleton (`:130`, `:141`), never the Dockerfile.

## For the spec actions (Rich's, at sitting 2's open and before Task 4)

- **A** (§11, §12): its anchors hold — §11's `interface Driver` at spec l.1160-1183, `buildImage(src: SourceRef, spec: AppSpec):
  Promise<ImageRef>` at l.1166, with B's `setRateLimitExemption` now at l.1173; §12's *Supply chain* at l.1594, the bullet
  *"committed lockfiles are required; builds fail without one"* at l.1603. The plan's *"§11's interface is changed by four plans, read in
  order (A1's A, B's C, A2's C, then this plan's A)"*: A2's C is NOT applied — A2 comes after this plan now — so A is worded against
  the interface as B left it.
- **B** (§25): its anchor holds — `dockerfile: ./Dockerfile.tmpl     # blueprint-managed, per D13` at spec l.2925, in *The
  descriptor* (l.2897).
- **C** (§12, §26): §12's first bullet is l.1600-1602; §26's settings sentence is l.3060-3070. **C's §26 words say *"after A2's
  sentence (which follows B's …)"*** — A2's is not there; C's sentence goes after B's (*"And the load rehearsal's profile and pass
  mark (§24)."*), and its *"(the gap B's Spec action B names)"* should be re-read against l.3069-3070, which now says *"Each change is
  audited with its actor"*.
- The plan's other spec citations: C1's *"Adding a *new* dependency needs network — a stated limitation, not a surprise"* is l.93-94;
  §20's *"Malicious or hallucinated dependency"* row is l.2206; §11 l.1158; §12 l.1331; §25 l.2882; §26 l.2999.
