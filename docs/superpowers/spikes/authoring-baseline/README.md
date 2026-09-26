# The authoring API's baseline — Task 1's measurements

**The authoring API plan's sitting 1, 2026-09-25** ([the plan](../../plans/2026-09-25-authoring-api.md), its *Task 1*
and *What executing this plan found*, sitting 1). One section per measurement: the command, its raw answer, and what it
confirms or corrects in the plan. **Every command's untrimmed output is in
[`results-task1-2026-09-25.txt`](results-task1-2026-09-25.txt)**, in the order below; every probe is in
[`probes/`](probes/), each with its usage on its first lines. The findings (`F<n>`) are numbered in the plan's record,
which is where they are counted.

**The machine:** macOS 26.6.2 (25G83), arm64; Docker Engine 29.7.2 (API 1.55); git 2.50.1 (Apple Git-155); Node
24.12.0; pnpm 11.24.0. Load 3.3–4.9 while anything was timed (`uptime` beside each timing), 5–6 while the Docker tier
ran. **The network was used once, for `[M9]` only, at Rich's yes** — `pnpm add` of the two renderer candidates into the
scratchpad. Nothing else in this sitting reached outside the machine.

## Summary

| | Question | Predicted | Measured | Corrects |
|---|---|---|---|---|
| `[M13]` | The four gate numbers | 2005/145, 20/0/0, 57/0/0, 208/34 | **2005/145** (359 s), **20/0/0**, **57/0/0**, **208/34** (906 s) — none moved | — |
| `[M1]` | The symlink escape and `fsmonitor`, through the SHIPPED driver 1 | both happen | **both happen — and the damage precedes the refusal** (F3) | Task 3 |
| `[M2]` | A plumbing commit with no worktree | as *Read this first* 2 | **exactly so**; a clean filter never runs in the bare setup, even without `--no-filters` | Task 3 |
| `[M3]` | `update-index --index-info`'s shapes | as *Read this first* 3 | **exactly so** — five shapes, all `exit 0` | — |
| `[M6]` | The documentation baseline | 43 / 64 / 786 / 556 / 0 / 99 | **exactly so**; **35** lines of public text name an internal artefact; **four** fragment descriptions, not three | Task 9 |
| `[M7]` | A JSON Schema for `manifest.yaml` | `zod-to-json-schema`, offline | **offline only with `zod@3.25.76` named** (F4); **the `env` refine is dropped by BOTH routes** (F6); no 2020-12 target (F5) | Task 9 |
| `[M8]` | An independent linter, offline | installs and lints | **53 warnings, 4 rules, 0 errors, 0 network attempts** | Task 9 |
| `[M9]` | The HTML renderer | Scalar | **Scalar 1.72.0** — Redoc 2.5.4 fails the hard offline criterion (F8) | Task 11 |
| `[M10]` | A 10,000-file tree's cost; the build context | each < 1 s | **each ≤ 0.1 s; `tar -x` 0.84–0.97 s; the archive 31.3 MB** (F13) | Task 4, *does not build* |
| Step 8 | `exec` against a real container | out / err / 3, the stream ends | **exactly so — and it BUFFERS until exit** (F14) | S5's brief |
| `[M15]` | The plan's own seams | Task 2 moves the document; 18 call sites | **both exactly so**; Task 2's probe command needs the repository-root path | Task 2 |

---

## `[M13]` — the machine and the four gates, at the open

`make up` (exit 0), then `make doctor` → **20 checks, 0 failed, 0 warnings**; `make verify` → **57 checks, 0 failed, 0
warnings**, *runtime routes currently applied: 1*; `pnpm test` → **Test Files 145 passed (145), Tests 2005 passed
(2005), 359.24 s**. The database at open: **0 projects, 29 migrations** (`psql … select count(*) from projects` and from
`drizzle.__drizzle_migrations`); nothing listened on 7100 or 7104; `launch-app`'s six `mf-launch-app-*` containers ran;
the GitHub fake was stopped. **`pnpm test:docker` → Test Files 34 passed (34), Tests 208 passed (208), 0 skipped, 905.68 s**
(the model warmed first; load 4–6), then the three cleanup scripts removed its usual residue — 7 networks, 1 volume, the
`p4b-probe-user` LiteLLM orphan, 12 app images — and `make verify` read **57/0/0** again, *runtime routes currently applied:
0* (1 at the open: the tier restarts the edge, and with the database empty no control plane could put it back).
**Every gate reads what ORIENTATION §2's box says; nothing moved.**

## `[M1]` — the write path's two holes, through the SHIPPED driver 1

**The copy** — `node probes/escape.mjs "$SCRATCH"`: `(1) outside/pwned.txt exists after an API write of out/pwned.txt:
true`, `(2) worktree .git/config now names fsmonitor: true`, `(2) the fsmonitor command RAN during git add: true`.

**The real driver** — `probes/driver1-escape.ts` imports `createLocalSourceDriver` from `source/local-driver.ts`, calls
`createRepository('escape-lab', …)`, has a person push `out → <lab>/outside` and `meta → .git` through the repository's
real `pre-receive`, then calls `commitFiles` twice:

```
(a) out/pwned.txt: commitFiles THREW SOURCE_GIT_FAILED — git -c failed: … commit -m api: (a) out/pwned.txt
(a) <outside>/pwned.txt exists: true
(b) meta/config: commitFiles THREW SOURCE_GIT_FAILED — git push failed: Error: Command failed: git push origin main
(b) the fsmonitor marker exists (a command RAN): true
main after both: 5439945 person: two symlinks | 3768a75 chore: seed from blueprint skeleton
```

**Confirmed in the shipped driver, not only in the copy — and in both cases `commitFiles` THREW after the damage was
done** (F3): the file outside was written before git refused to add it, and in (b) `git add` ran the command, `git
commit` SUCCEEDED, and only the push failed — because the replaced `.git/config` no longer named `remote.origin`. An
attacker's config that keeps `[remote "origin"]` would have pushed too. **An error from `commitFiles` is no evidence that
nothing happened**, which is what Task 3's contract cases already assert by checking the filesystem and a canary rather
than the answer.

**How to run a probe against `source/` at all** (F1, F2): `node --experimental-transform-types --import
./packages/github-fake/resolve-ts.mjs <probe>.ts`, with `MANIFEST_DATABASE_URL` set to an address nothing listens on
(`postgres://nobody:nobody@127.0.0.1:1/unreachable`). Strip-only mode refuses `SourceError`'s parameter property, and
`source/` imports `build/index.js`, whose barrel reaches `db/client.ts`, which throws at import without the variable.
`pg.Pool` connects lazily, so the unreachable address is never dialled.

## `[M2]` — a plumbing commit with no worktree

`bash probes/plumbing.sh "$SCRATCH"` — exactly *Read this first* 2: `--force-remove` → `fatal: this operation must be
run in a work tree`; `--cacheinfo` under `out` and `meta` → `fatal: git update-index: --cacheinfo cannot add out/pwned`
(and `meta/config`); the non-forced push → `remote: pre-receive ran: 4d9d1bb… 791f458… refs/heads/main`; a second
commit on the old base → `! [rejected] … -> main (non-fast-forward)`, `push exit 1`; `/etc/pwned` absent. *(The
probe's `exit 0` after the `out/pwned` line is `tail`'s status, not `update-index`'s — its pipe.)*

`bash probes/seams.sh "$SCRATCH"` — `git --git-dir=D init --bare D` creates `D` (exit 0); `hash-object -w --no-filters
--stdin-paths` answers `4565b4d…`, `c600332…`, exactly the single-file ids; a rejected `push --porcelain` puts
`!\t<sha>:refs/heads/main\t[rejected] (non-fast-forward)` on **stdout**, exit 1, and only `error:`/`hint:` on stderr.

**The plan's added case, with the positive control it lacked** — `bash probes/filters.sh "$SCRATCH"`. The plan's version
had no filter DEFINED, so *"no filter runs"* was true of any git (F12). Here `filter.evil.clean` is defined (`-c`) and a
`.gitattributes` of `* filter=evil` sits beside the numbered files:

| Case | Blob ids | The filter's marker |
|---|---|---|
| raw bytes, no path | `ce01362…`, `e019be0…` | — |
| **(A1) positive control** — a worktree, without `--no-filters` | `e427984…`, `11546ab…` (**changed**) | **PRESENT** |
| (A2) a worktree, with `--no-filters` | `ce01362…`, `e019be0…` | absent |
| (B1) **bare `--git-dir`, as `buildCommit` runs it**, without `--no-filters` | `ce01362…`, `e019be0…` | absent |
| (B2) bare `--git-dir`, with `--no-filters` | `ce01362…`, `e019be0…` | absent |

So in the shape Task 3 builds, **no attribute file reaches `hash-object` at all** (B1), and `--no-filters` is a second
layer that holds on its own (A2).

## `[M3]` — `update-index --index-info`, five shapes

`bash probes/indexinfo.sh "$SCRATCH"` — every case `update-index exit 0`, exactly *Read this first* 3: deleting
`src/a.js` removes it; **deleting `nope.txt` changes nothing** (tree `db61a894…`, and `git rev-parse main^{tree}` is
`db61a894…` — identical, silent); **writing `out/pwned` replaces the symlink `out` with a directory**; **a FILE named
`src` removes `src/a.js` and `src/b.js`**; **`README.md/inner` removes the file `README.md`**. `git fsck` of each commit
printed nothing.

## `[M6]` — the documentation baseline

The plan's six commands over `packages/contract/openapi.json`: **`"1.2.0"`, 43 operations, 64 schemas, 786 properties,
556 with no description, 0 examples, 99 `ErrorCode` values** — every prediction. The internal-artefact grep: **35
lines** (among them `(R3, §14)`, `(P5b Decision 13)`, `(Rich, 2026-09-22; P6b Decision 10)`, `D9. Reported, not yet
enforced (P6).`, `the D5 plan’s Decision 19`) — the number Task 9's gate brings to zero. Beside them: 43 operations are
26 GET, 15 POST, 2 DELETE; **34 schemas have no description**; and **four** operations have a description under 40
characters — `getBlueprint` (30) as well as `listBuilds`, `listReleases`, `getRelease` (28 each) — where *Read this
first* 6 names three.

## `[M7]` — a JSON Schema for `manifest.yaml`

**Install.** `pnpm add --offline zod-to-json-schema@3.25.2` in an empty package **fails**: `ERR_PNPM_NO_OFFLINE_TARBALL
… https://registry.npmjs.org/zod/-/zod-4.6.5.tgz` — its peer `zod: "^3.25.28 || ^4"` auto-installs as the newest in
pnpm's cached metadata, which the store lacks (F4). **`pnpm add --offline zod@3.25.76 zod-to-json-schema@3.25.2`** →
`resolved 2, reused 2, downloaded 0`. *(Since `[M9]` fetched Scalar, `zod@4.6.5` IS in the store — so an offline add
now succeeds either way and could link the WRONG zod silently; Task 9 reads the lockfile's peer suffix.)*

**Emit** — `node probes/zod-to-json.mjs "$SCRATCH/zjs"`, over the SHIPPED `manifestSchema` (v3, unchanged):

```
target jsonSchema7: 4192 bytes, $schema http://json-schema.org/draft-07/schema#
target jsonSchema2019-09: 4303 bytes · target openApi3: 4253 bytes, no $schema
top-level required: ["manifest","name","blueprint","runtime"]  additionalProperties: false
runtime.build: {"not":{}}  runtime.required: ["port"]
integrations / jobs / checks: {"type":"array","items":{"not":{}},"maxItems":0,"default":[]}
env item: {"type":"object","properties":{"name":…,"value":{"type":"string"},"secret":{"type":"boolean"}},"required":["name"],"additionalProperties":false}
defaults present: 23
```

**The targets are `jsonSchema7`, `jsonSchema2019-09`, `openApi3`, `openAi` — none is 2020-12**, OpenAPI 3.1's dialect
(F5). The manifest schema uses nothing that differs between them (no tuple `items`, and `$refStrategy: 'none'` emits no
`definitions`), so the draft-07 output is valid 2020-12 once its `$schema` is dropped.

**Does it say what zod says?** Ajv 8.20.0 (the mock's), over the emitted schema, against `manifestSchema.safeParse`:
**7 of 9 agree** — the proof-app starter and the bare skeleton's seed valid; an unknown key, `runtime.build`, a bad
name, a used reserved hook invalid; `secret: true` alone valid. **The two refine cases DISAGREE** — `value` and `secret:
true` together, and neither: zod invalid, Ajv valid. **The `env` refine is dropped silently.**

**The v4 port** — `node probes/zod4port.mjs`: 1638 bytes (a partial port), `runtime.build: {"not":{}}`, the hooks
`maxItems: 0`, and **`throw mode: ok`** — zod/v4's `unrepresentable: 'throw'` does NOT throw for a refine; it drops it
too. **Neither route represents the rule, so the plan's decision rule — "port to v4 only if `zod-to-json-schema` cannot
represent a field an agent writes" — buys nothing by porting** (F6). Task 9's `[M7]` block has the ruling.

## `[M8]` — an independent linter, offline

`pnpm add --offline @redocly/openapi-core@1.34.20` → `resolved 20, reused 20, downloaded 0`. Its API, read from
`lib/index.d.ts`, `lib/lint.d.ts` and `lib/config/load.d.ts`: `createConfig(config: string | RawUniversalConfig, options?)`
and `lintFromString({ source, absoluteRef?, config })`. `node probes/redocly-lint.mjs "$SCRATCH/redocly"` with `{ extends:
['recommended'] }`:

| Count | Severity | Rule | What it says here |
|---|---|---|---|
| 42 | warn | `operation-4xx-response` | Every operation but `streamProjectEvents` (its `426`) publishes its errors as ONE `default` response, so no `4XX` key exists |
| 9 | warn | `tag-description` | The nine tags have no description |
| 1 | warn | `info-license` | `info` has no `license` |
| 1 | warn | `no-unused-components` | `StreamFrame` — referenced only inside `x-manifest-websocket`, which the linter does not walk |

**0 errors. Network attempts during the lint: 0** — a canary wraps `dns.lookup`, `net.connect`/`createConnection`,
`http`/`https` `request`/`get` and `fetch`, and **its positive control saw the deliberate `dns.lookup('localhost')`**
afterwards, so the zero is a measurement. Task 9's `[M8]` block says what each rule asks of it.

## `[M9]` — the HTML renderer

**Installed at Rich's yes, the network on, into the scratchpad:** `@scalar/api-reference` **1.72.0** (268 packages,
253 downloaded; peers `tailwindcss@4.3.3` and `zod@4.6.5`) and `redoc` **2.5.4** (110 packages). **Both `pnpm add`s
exit 1** with `ERR_PNPM_IGNORED_BUILDS` — `vue-demi@0.14.10` for Scalar, `core-js@3.50.0` for Redoc — though every
package is installed (F10). **Re-installed offline**, as Task 11 will: `pnpm add --offline @scalar/api-reference@1.72.0`
in a fresh package → `resolved 268, reused 268, downloaded 0`, and the same exit 1 on `vue-demi`.

**The pages** are in [`probes/renderer/`](probes/renderer/): serve a directory holding them, a copy of
`packages/contract/openapi.json`, `scalar/standalone.js` (Scalar's `dist/browser/standalone.js`) and
`redoc/redoc.standalone.js` (Redoc's `bundles/`), e.g. `python3 -m http.server 8931 --bind 127.0.0.1 --directory <dir>`,
and open each in Chrome with the extension's network reader on BEFORE the load (it records from its first call). The
variant document for the soft criteria was `jq '.components.schemas.ErrorCode["x-enumDescriptions"] = {…} |
.paths["/v1/fleet"].get.responses["200"].content["application/json"].example = […]'` over the same file.

| Criterion | Kind | Scalar 1.72.0 | Redoc 2.5.4 |
|---|---|---|---|
| **Zero requests to any host but the page's own**, with the candidate's offline configuration | **hard** | **PASS — 3 requests, all `127.0.0.1:8931`** (page, bundle, document), on load, fully expanded, and after searching and opening operations. **Positive control**: at its DEFAULTS it fetched `https://fonts.scalar.com/inter-latin.woff2`, `inter-symbols.woff2` and `mono-latin.woff2`, so the log sees an outside request | **FAIL — `https://cdn.redoc.ly/redoc/logo-mini.svg`**, from the side menu's *API docs by Redocly* footer, rendered unconditionally: no option guards it (`hideLogo` is the document's own `x-logo`) (F8) |
| **Every operation and component renders**, without an error | **hard** | **PASS — 37/37 paths, 43/43 operation summaries, 64/64 schema names**; no error in the console (one INFO line, its version); a nullable renders `Type: string · nullable · required`; a `const` renders `const: control`; the stream operation renders its `101`, `426` and `default` (its `x-manifest-websocket` detail is not shown, and is no error) | 37/37 paths and 43/43 operations render; **8 of 64 schema names appear** — it has no models section, schemas are shown inline |
| Examples shown; `x-enumDescriptions` on `ErrorCode` | soft | A document example: **shown**. `x-enumDescriptions`: the bundle reads the key (and `x-enum-descriptions`), but the probe text did not appear on the page within the time given — **not established** | Example shown; the bundle reads `x-enumDescriptions`; **not established** |
| Licence | hard | **MIT** — `package.json` and the README's *License* (the package ships no `LICENSE` file) | **MIT** — its `LICENSE`, © Rebilly, Inc. |
| Size; build step | soft | `dist/browser/standalone.js` **4,331,361 bytes**, one file, no build step | `bundles/redoc.standalone.js` **1,103,471 bytes**, one file |

**The offline configuration, exactly** (F9): `withDefaultFonts: false`, `telemetry: false`, `hideClientButton: true`,
`hideTestRequestButton: true`, `mcp: { disabled: true }`, `showDeveloperTools: 'never'`, **and `agent: { disabled: true }`**
— a key the `@scalar/types@0.22.0` configuration file does not name, but the bundle's own schema does. **Without it the
page shows *Ask AI*** (Scalar's cloud agent chat — measured by the one page that omitted it), and the bundle enables it by
default when the page is on a local address. At its defaults the page also shows *Generate MCP*, *Share* and *Deploy*.

**Chosen: Scalar 1.72.0**, by the two hard criteria Redoc does not meet. It stays in the store for Task 11.

## `[M10]` — a 10,000-file tree, and the build context

`bash probes/large-tree.sh "$SCRATCH"`: 10,000 files of ~30 bytes across 200 directories and one `big.txt` of
20,971,605 bytes, committed and pushed into a bare repository (10,001 files in `HEAD`). Load 3.7–3.9. Three runs:

| Command | Run 1 | Run 2 | Run 3 | Output |
|---|---|---|---|---|
| `git ls-tree -r -t -l -z --full-tree HEAD` | 0.020 s | 0.019 s | 0.020 s | 763,670 bytes |
| `git diff --numstat <empty tree> HEAD` | 0.064 s | 0.052 s | 0.052 s | 10,001 lines |
| `git archive --format=tar -o` (what `build/context.ts` runs) | 0.079 s | 0.068 s | 0.053 s | **31,324,160 bytes** |
| `tar -x -f` (the context unpacked) | 0.970 s | 0.844 s | 0.878 s | — |

Every git command well under 1 s, as predicted. **The archive is 31.3 MB, not the ~20–25 MB this sitting guessed**
(F13): tar spends a 512-byte header and pads each file to 512 bytes, so 10,000 small files cost ~10 MB on their own.
Unpacking 10,001 files is the slow half, just under a second. Task 4's caps stand (10,000 entries; 256 KiB of patch),
and the *does not build* bullet carries these numbers. *(The probe's first run used a local `git clone --bare`, which
failed `failed to copy file to 'app.git/objects/fa/…': No such file or directory`; three repeats succeeded. Likely, and
unconfirmed: the commit's 10,001 loose objects passed `gc.auto`'s 6,700 and a detached auto-gc packed them mid-copy. The
probe now pushes instead.)*

## Step 8 — `exec` against a real container

`docker run -d --rm --name mf-exec-probe 127.0.0.1:7107/base/node@sha256:1ef15d33…f604a sleep 300` (the blueprint's
`base_image` digest), then `probes/exec-probe.ts` drives the SHIPPED `runtime/docker/exec.ts` `containerExec`:

```
(1) the plan's command: stdout=["out"] stderr=["err"] exit=3 first stdout line after 32 ms; exit known after 32 ms; streams ended: yes
(2) streamed or buffered?: stdout=["first","second"] stderr=[] exit=0 first stdout line after 2042 ms; exit known after 2042 ms; streams ended: yes
```

**It works, and it BUFFERS** (F14): `drain` awaits `started`, which resolves only after the exec has exited, so the
first line of `echo first; sleep 2; echo second` arrived at 2,042 ms, with the exit code — nothing is streamed while the
command runs. S5's *"its output streams out over the API"* needs a different reader; the pointer is in S5's brief.
`docker rm -f mf-exec-probe`; 0 left.

## `[M15]` — predictions for the plan's own seams

**Which task first moves `openapi.json`: Task 2**, whatever its Step 5 decides — `ApprovalDiff.changes[]` is published
inline as `{ from, path, summary, to }`, and Step 5 keeps the published `added`/`removed` even when the prompt change is
reverted. **The call sites `commit` breaks: 18**, exactly the plan's per-file count — `grep -rn commitFiles
packages/control-plane/src/` gives 23 lines, of which the interface (1), driver 1's method (1), driver 2's method and one
comment (2) are not call sites: `driver-contract.ts` 6, `api/projects.test.ts` 5, `api/testing.ts` 2,
`source/github/driver.test.ts` 2, and one each in `local-driver.test.ts`, `api/delivery.test.ts` and
`releases/approval.test.ts`. **Task 2's probe command** is written `node spikes/authoring-baseline/probes/f7.mjs 40 2`,
which resolves only from `docs/superpowers/`; from the repository root it is `node
docs/superpowers/spikes/authoring-baseline/probes/f7.mjs 40 2` (its parent, `d5-baseline/probes/structured.mjs`,
exists and imports the shipped `summary.ts`).

## Task 2 — F7, measured over 320 answers (sitting 2, 2026-09-25)

**The question** (the plan's Task 2, Steps 1 and 5): does handing the model an attribute change's `added` and `removed`
halves as facts of their own — plus one prompt sentence saying what they mean — stop the approval summary reversing a
removed CWL attribute? **The rule**: adopt when, over 40 two-change answers, reversals are at most 1, fewer than the
baseline's, and at most 2 withheld.

**How**: [`probes/f7.mjs`](probes/f7.mjs) drives the SHIPPED `summariseChanges` against LiteLLM 1.98.0 → Ollama
`qwen3.5:4b` (warm), 40 answers per run, and prints the facts the model was handed — so each file shows whether the two
lists reached it. "Before" is `summary.ts` at `HEAD` (`2669f6b`); "after" is Task 2's. The three-change shape adds a
`resources.memory` change to the two. Step 1 measured only the two-change baseline; the three-change baseline and a
second replicate of all four cells were added (a ruling) when the first three-change "after" run read 10 in 40 with
nothing to compare it to. **Every `auth.attributes` sentence the classifier marked, and every one it could not place,
was read by hand**; the criterion is the D5 plan's (sitting 7, F7): a sentence that says the app receives `sn` — or a
misnamed `sn`, or names or personal information "previously excluded" — when the change removes it.

| Reversals, by hand | before (shipped) | after (Task 2) | files |
|---|---|---|---|
| 2 changes, replicate 1 | 2 / 40 | 1 / 40 | `results-task2-step1-…`, `results-task2-step5-two-…` |
| 2 changes, replicate 2 | 3 / 40 | 2 / 40 | `results-task2-rep2-before-two-…`, `…-after-two-…` |
| 3 changes, replicate 1 | 6 / 40 | 10 / 40 | `results-task2-step1-three-…`, `results-task2-step5-three-…` |
| 3 changes, replicate 2 | 11 / 40 | 17 / 40 | `results-task2-rep2-before-three-…`, `…-after-three-…` |
| **all 160 each** | **22** | **30** | |

Kept 40 of 40 in every one of the eight runs: nothing withheld, nothing unavailable. Median 1.7–1.8 s at two changes,
2.3–2.6 s at three.

**The classifier's errors, corrected by hand**: it marked seven sentences REVERSAL whose direction is right (*"receives
less personal information, specifically the surname"*, *"receives fewer personal attributes … since the sn … is no longer
requested"*, *"receives the first name … instead of also receiving their last name"*), and missed eleven reversals that
name `sn` as something else or not at all (*"may receive the student number attribute in addition to …"*, *"receives
personal information that was previously not requested"*).

**The answer: NOT ADOPTED.** Replicate 1 met the rule (1 ≤ 1, fewer than 2, 0 withheld); replicate 2 did not (2 > 1);
and at three changes it read WORSE — 17 → 27 over 80 (Fisher's exact test, two-sided, p = 0.11; at two changes 5 → 3,
p = 0.72). Over all 320 answers it reads worse, 22 → 30 (p = 0.29). None of these differences is significant; what
decides is that it does not measure BETTER, which is the rule's word. **The prompt sentence and the two facts are reverted; `added` and
`removed` stay on `SpecChange` and on the published `ApprovalDiff`** (true, computed, and a client's to use), and F7 goes
back to Rich with options (b) *no sentence for attribute changes* and (c) *no sentences at all*.

**Two things this measured that Rich did not have when he chose "fixed after the plan"** (2026-09-25):

1. **The reversal rate depends on the diff's size.** The shipped function reverses the `sn` removal in 5 of 80
   two-change answers (6%) and in **17 of 80 three-change answers (21%)** — one more, unrelated change (a raised memory
   limit) more than triples it. The D5 plan's 5 of 40 was measured at two changes.
2. **The model does not know what `sn` is.** Grep-counted over the sentences: it names `sn` a *student number*, *student
   ID*, *serial number*, *subject name* or a **social security number** in 6–12 of 40 answers per run, in both variants
   — Step 1's hand read found 10 of 40, four of them a social security number, and one said `givenName`, which is kept,
   was removed.
