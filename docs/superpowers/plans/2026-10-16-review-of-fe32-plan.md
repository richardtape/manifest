# A fresh review of FE-32's plan after its sitting 1 — an agent can add a dependency (2026-10-16)

> **What this is.** A read-only review by `manifest-review4`, the fourth coordinated run's job REV4 (review 2 of 2). It was made at
> `manifest-coord6`'s second GO, under **Rich's decision 18** (`4cb1f2c9`, `docs/superpowers/2026-09-30-decisions.md`, the entry *"On
> 2026-10-16 at ~15:10 PDT … THE FOURTH COORDINATED RUN"*): FE-32 gets its second fresh review AFTER sitting 1, against its measurements.
> It reviews [`2026-10-03-fe32-dependencies.md`](./2026-10-03-fe32-dependencies.md) **as committed at `eca8bf97`** (`git show HEAD:`;
> FE32-1's uncommitted close-out edits were not read). It reads the plan against **the code at `eca8bf97`** (no code changed after
> `4cb1f2c9`) **and sitting 1's measurements**, [`spikes/fe32-baseline/`](../spikes/fe32-baseline/) at `eca8bf97` (its README, its
> fact-by-fact re-read and its results). The plan's first review is [`2026-10-03-review-of-four-plans.md`](./2026-10-03-review-of-four-plans.md)
> §4. Read 2026-10-16, 16:55–17:05 PDT. **Nothing was run.**
>
> **Two things are owed, and this review holds its word on them until they land.** Sitting 1's `pnpm test` (`[M5]`) was VOID: it was
> stopped at 16:46:40 when Rich needed the machine. And `[M3]`'s clean re-run must put each uplink phase's npm lines on disk (the baseline's
> F13). Below, the gate numbers and the word on `[M3]` are **provisional**. An addendum confirms or amends them when `manifest-coord6`
> says FE32-1's close-out has landed.

---

## FE-32 — an agent can add a dependency (`2026-10-03-fe32-dependencies.md`)

**Summary.** An agent asks for a lockfile with `resolveDependencies` (`POST /v1/projects/{id}/dependencies/resolve`): its new
`package.json` and a `baseCommit` go in, and a lockfile comes back. The lockfile is resolved by the **driver**, from a blueprint-declared
`Resolve.tmpl`, in the rootless `--internal` builder, through Verdaccio, as a full install with scripts off. It is rewritten to name
`registry.npmjs.org`, and it keeps every base pin a new range does not force. Three refusals are planned (`NOT_FOUND`, `UNAVAILABLE`,
`RESOLUTION_FAILED`). **§12's allowlist** is a boot-time file, and both doors check it: the operation, before any builder, and the build's
gate. Each door checks names, specifiers, overrides and, at the gate, the lockfile's `resolved`. Contract `1.11.0` (two operations). The
acceptance is `make demo-authoring`, extended with `marked`. Five sittings; three spec actions drafted.

**Verdict: approve with the fixes below — once Rich has decided Spec actions A and B and `[M3]`'s mapping before sitting 2, and C
before Task 4.** Sitting 1 shows the design holds where it matters most:
- the builder exports a file, in ~3.3 s;
- every base pin is kept, and a forced one moves alone;
- Decision 12's rewrite makes the lockfile portable, and `make seed`'s warm loop then installs it clean;
- scripts are off, proved against a positive control;
- `ETARGET` is distinct offline.

What sitting 1 broke is a set of **seams Task 2 rests on** (I1–I4) and **one acceptance input** (I5). None needs a redesign. Each fix
is written out below.

*Counts:* **0 Critical, 5 Important, 10 Minor.** *Drift since `eee5648`:* one fact changed in meaning (13, the skeleton's `overrides`
are gone). The line numbers moved and the facts file re-reads them. The interface grew by A1's and B's methods. The spec's anchors
hold, with C's §26 anchor moved (F12).

### Important

- **I1. `[M3]` fired, and the mapping change reaches further than *"Task 2's `resolve.ts` table and Decision 5's words"*.** npm 11.19.0 against
  Verdaccio 6.10.1 prints the same `E404 … no such package available` for a never-cached real package and for a name that cannot exist
  (baseline `[M3]`, rows 1–4). Decision 5 (plan:232-242) maps `E404` → `422 DEPENDENCY_NOT_FOUND`.
  - **As written, the plan contradicts itself.** Its own Task 2 Docker case expects *"a package it has never cached → `DEPENDENCY_UNAVAILABLE`"*
    (plan:511-514). Under Decision 5 that is `E404` → `NOT_FOUND`, so the case would be red. Option (a) is the only mapping consistent with
    it.
  - **Under (a), the fakes would tell a story the real driver cannot.** The fake driver answers `DEPENDENCY_NOT_FOUND` *"for a name
    beginning `manifest-no-such-`"* (plan:549-550). The mock does the same (plan:578-579), and Task 4 keeps those names allowed *"so its
    refusals still reach the driver"* (plan:621-622). Under (a) the real driver answers that input `UNAVAILABLE` (or Task 4 refuses it
    `NOT_ALLOWED`), so Task 3's operation tests would assert an answer the platform never gives — CLAUDE.md's *integration is where the
    false greens sit*. Also stale under (a):
    - Review Focus 1's prose (plan:327-331);
    - Decision 5's *"a name the allowlist holds that the registry has since lost"* (plan:235-236);
    - Task 5's pack sentence *"A name Manifest cannot find does not exist"* (plan:653-655), and the guide's three refusals.
  - **Fix (with (a)).**
    - The fake and the mock answer `NOT_FOUND` for `999.0.0` alone (the `ETARGET` case).
    - Both gain an `UNAVAILABLE` trigger (e.g. a name beginning `manifest-unreachable-`).
    - Task 3's three-refusal rows follow.
    - Decision 5, Review Focus 1, the pack sentence and the guide are reworded. For example: *"refused `DEPENDENCY_NOT_ALLOWED`: ask for
      it to be allowed; `DEPENDENCY_NOT_FOUND`: the registry has no such version — pick another; `DEPENDENCY_UNAVAILABLE`: the platform
      cannot fetch it now — adding a new package needs the network"*.
    - The mapping table reads only `npm error code …` lines (F9) and maps `ENOENT`/`spawn git` to `RESOLUTION_FAILED`, never to
      `UNAVAILABLE` (F5).
- **I2. A resolution with no registry token builds only while 7100 answers** (baseline F2; *the token*). Task 2 says `runBuildxResolve`
  takes *"no registry token (it pushes nothing)"* (plan:545-546). But the registry answers `401` with a realm on 7100
  (`…/internal/registry/token`), and buildx's host-side client follows it. `[M2]`'s `notoken` built only because 7100 was up. The
  Docker tier stops 7100 (ORIENTATION §4 trap 7), so `resolve.docker.test.ts` would fail there. **Fix:** mint a pull-only token for the
  base repository, as `buildImage` does (`runtime/docker/driver.ts:340-353`: `{ type: 'repository', name: baseRepository, actions:
  ['pull'] }`).
- **I3. `file:../x` resolves silently**, so Review Focus 4's *"at the driver, the two specifiers fail as `DEPENDENCY_RESOLUTION_FAILED`"*
  (plan:337-340) and Task 2's Docker row for them (plan:516-517) are false for `file:` (baseline F4). The result is exit 0 and a `"link":
  true` entry to a directory that does not exist. Until Task 4, nothing stops it. After Task 4 only the operation's specifier check and the
  gate's lockfile check do. **Fix (F4's first recommendation):** the driver refuses an exported lockfile holding any `link` entry as
  `RESOLUTION_FAILED`, naming it. The committed lockfiles hold none (`[M2]`'s shapes), so this costs nothing and keeps defence at the
  driver. The Docker row then asserts that refusal.
- **I4. Two of Task 2's Docker cases cannot run as written.**
  - **(a) *Scripts are off* publishes to the platform's mirror** (plan:515-517). Offline, Verdaccio refuses that publish (`503 … one of the
    uplinks is down, refuse to publish`, baseline F6), and the mirror's configuration may not change (Global Constraints, plan:315).
    Online, a `finally` that never runs would leave a package in the platform's storage. **Fix (F6):** publish to the throwaway the same
    file already starts for *the mirror cannot serve it*, its probe scope local. `[M4]` measured exactly this, with the positive control.
  - **(b) *Existing pins stay* ends in *"then a build of that manifest and lockfile succeeds"*** (plan:507-510), on `[M2]`'s package. The
    mirror's only held tarball outside the skeleton is `passport-saml@3.2.4`'s closure, and the build's scan refuses it: `@xmldom/xmldom@0.7.13`
    has 13 fixable Highs, and `scanImage` runs inside `buildImage` (`runtime/docker/driver.ts:380-394`; `build/scan.ts:15`) (baseline F7).
    Task 3 Step 4's build through the edge (plan:593-594) is the same. **Fix (F7):** the build half and Task 3 Step 4 use `cookie@0.7.1`,
    which is held and scan-clean. Its one forced pin (`node_modules/cookie` 0.7.2 → 0.7.1) is named in the pins assertion, as Spec action
    A's *"unless the new manifest's ranges force a change"* allows. `passport-saml` stays for the pure resolution assertions.
- **I5. The acceptance must name `marked` at the EXACT version its fixture pins, or the offline acceptance resolves past the warm mirror.**
  - Task 6 has the agent *"add `marked`"* (plan:678-681). Decision 10 records the version resolution pins, and `make seed` warms
    exactly that version's tarball through `fixtures/dependency-app/`.
  - But every online resolution refreshes the mirror's metadata (fact 15, measured; F9). So by the time the offline acceptance runs (step
    14, `offline-acceptance.sh:250`), the cached `marked` document may list a newer version.
  - A range in the agent's manifest then resolves offline to that newer version, whose tarball was never fetched. That is `E500 … uplink
    is offline` after ~72 s of npm's retries (baseline `[M3b]`, measured on `marked@18.0.14`), then `UNAVAILABLE`, and the offline run is
    red.
  - **Fix:** the demo's manifest names `marked` at the fixture's exact version (`"marked": "<x.y.z>"`), stated in Task 6 and Decision 10.
  - A control: the same step with `^<major>` against the throwaway's seeded metadata predicts `E500`.

### Minor

- **M1. `400 VALIDATION_FAILED` is not a code here.** The 400 for a schema failure is `REQUEST_INVALID` (`api/error-codes.ts:128`).
  Decision 6 (plan:243), Task 3 Step 1 (plan:586) and Review Focus 5 name the wrong code, and the codebase asserts every refusal by its
  code. `SOURCE_COMMIT_NOT_FOUND` is right: `409`, the `source(…)` family (`:84-88`, `:691`).
- **M2. The skeleton's `overrides` are gone** (fact 13; `1dcb905b`; baseline F1). Task 4's passing row *"the skeleton's own
  `@xmldom/xmldom` override passes"* (plan:632) and Review Focus 6's last clause (plan:347) have no subject. **Fix (F1):** a TEST manifest
  whose override pins `@xmldom/xmldom`, which the skeleton's lockfile holds at 0.8.15 in its closure.
- **M3. `# syntax=` is refused in `build/context.ts`'s `renderDockerfile`, not `blueprints/registry.ts`** (baseline F11). Task 2's Files
  line (plan:446-447) has the registry *"refuse a `# syntax=` line in it as it does there"*. **Fix:** the recipe is rendered by
  `renderDockerfile`, which also substitutes `{{BASE_IMAGE}}`. The registry only checks that the file exists.
- **M4. A *"not now"* answer costs 70–90 s of npm's own retries** (baseline F8: 72 s for an uncached tarball, 87 s for an unreachable
  mirror), and the operation answers synchronously, holding the project's build queue (Decision 7). **Fix:** Task 2's recipe sets
  `--fetch-retries` and `--fetch-timeout` deliberately, and Task 3 states the route's worst-case time in its description.
- **M5. A resolver must read `npm error code` lines, never `http fetch GET 404`:** npm asks for `npm` itself, `404`, in runs that succeed
  (baseline F9). Say so in `resolve.ts`'s comment and test it with a successful run's log. `--no-update-notifier` is a routine call.
- **M6. Offline, `ETARGET` means *"no such version in the metadata the mirror last saw"*, not *"the registry never published it"*.** A
  version published after the last refresh reads `NOT_FOUND` offline. Telling an agent to pick another version is the right behaviour.
  But `DEPENDENCY_NOT_FOUND`'s message should claim only what was read: *"…has no version matching … as far as the platform's mirror
  knows"*.
- **M7. Verdaccio is pinned by tag only** (`verdaccio/verdaccio:6`, `infra/compose.yaml:175`; baseline F10). Every one of `[M3]`'s
  strings is 6.10.1's, and a pull of the tag can change them. `resolve.test.ts`'s verbatim lines are the canary; its comment should say
  so. Record it beside Postgres's tag pin (ORIENTATION §7e, *Recorded, not placed*).
- **M8. §12's first bullet is garbled in the spec today** — *"dependencies resolve through a **private registry mirror** with an
  allowlist, or allowlist."* (spec l.1600-1602). Spec action C's item 1 replaces the bullet whole, so applying it repairs this too. Say
  so to Rich with C.
- **M9. `1.11.0` may not be free when Task 3 lands.** P11b's plan drafts Rich's click-6 question as a contract minor that would take
  `1.11.0` if it landed first (P11b plan, *the option*; recommended there as a plan of its own). **Fix:** Task 3 reads *"`1.11.0`, or the
  next minor"* (`[M1]` at sitting 3's open).
- **M10. The body still carries the 2026-10-03 order.** The banner says *"the Predecessor line below (A2) is stale"* (plan:3-8). The body
  still has it (plan:74-76), along with *"Five plans run before this one"* (plan:13) and *"A2's C"* in the spec actions' order
  (plan:729-731). The revision at sitting 2's open should correct the body, not only the banner (CLAUDE.md, *Close out properly*).

### Checked and holding

Read against the code and the measurements; each is as the plan or the baseline states.

- **The fifteen facts** at `4cb1f2c9`, as `facts-at-4cb1f2c9.md` records them. I re-checked the load-bearing ones:
  - the gate call's literal `lockfile: 'package-lock.json'` and the hint (`runtime/docker/driver.ts:307-315`);
  - the descriptor loaded after the gates (`:319`);
  - `queue.run(spec.projectSlug, …)` (`:295`);
  - the pull half of the minted token (`:340-353`);
  - the scan inside `buildImage` (`:380-394`).

  `createCommit` is still `source:write`, and `SOURCE_COMMIT_NOT_FOUND` and `PROJECT_ARCHIVED` exist. Every file Tasks 2–6 name exists:
  `api/authz-contract.ts`, `runtime/fake-driver.test.ts`, `runtime/driver-contract.ts`, `api/source.test.ts`, `docs/api/authoring.md`,
  `packages/journey/src/{authoring,coverage,examples.test}.ts`. Neither `runtime/docker/resolve.ts` nor `fixtures/dependency-app/` exists
  yet.
- **The design's load-bearing claims, measured** (baseline `[M2]`, `[M4]`):
  - `--output type=local` exports exactly the lockfile;
  - the glob `package-lock.jso[n]` matching nothing is accepted;
  - 163 of 163 base pins are kept, and the one forced pin moves alone;
  - Decision 12's `sed` rewrites all 172 `resolved` URLs (a scoped path included) and nothing else;
  - the warm loop installs the rewritten lockfile with no `WARN`, and `WARN`s the unrewritten one (the first review's I2, measured
    exactly);
  - every fetch goes through the mirror, one `http fetch GET 200 … .tgz` line each, so control (b) can fail as revised (the first review's
    I3);
  - scripts are off, against a positive control;
  - the same inputs answer the same bytes.
- **The first review's findings are in the plan and still right.**
  - I1's four bypasses are refused at both doors in Decision 11. `[M2]` records the lockfile shapes the gate must pass: plain and `peer`
    only, no `bundled`, `optional` or `link`.
  - I2's rewrite is measured.
  - I3's fetch line exists.
- **The three Docker-heavy seams work as the plan assumes, I2–I4 aside.** A throwaway joins `manifest-build-internal` under an alias
  and is reached through a test blueprint's `.npmrc` (measured). `ETARGET` holds offline from cached metadata, so Task 6's `marked@999.0.0`
  → `NOT_FOUND` runs on a clean offline machine. `git+https:` fails at `spawn git` before any network (F5).
- **The gate numbers**, read: `EXPECT_TESTS=4240`, `EXPECT_FILES=253`, `EXPECT_DOCTOR=23`, `EXPECT_VERIFY=67`
  (`scripts/ci-acceptance.sh:378-390`); contract `1.10.0`, 79 operations. The plan states none of them, as the house rule asks. **The
  `pnpm test` that measures them is owed; held for the addendum.**

### Rich's three spec actions — this review's word

- **A (§11, §12) — apply as worded, before sitting 2.**
  - Its anchors hold: `buildImage(src: SourceRef, spec: AppSpec): Promise<ImageRef>` is spec l.1166 in §11's interface (l.1160-1183,
    as B left it — A2's C is not applied, so A is worded against B's interface). The *"committed lockfiles are required"* bullet is
    l.1603.
  - Every claim in its §12 words is now measured true: through the mirror, in the builder, scripts off, every pin kept *"unless the new
    manifest's ranges force a change"* (the `forced` case), naming the public registry.
  - Nothing in I1–I5 changes its words.
- **B (§25) — apply as worded, before sitting 2.** Its anchor holds (`dockerfile: ./Dockerfile.tmpl`, spec l.2925). M3's fix (the recipe
  through `renderDockerfile`) is an implementation detail the spec does not name.
- **C (§12, §26) — apply item 1 as worded, and item 2 re-anchored and shortened, before Task 4.**
  - Item 1 replaces §12's first bullet, and repairs its garble (M8).
  - Item 2 cannot go *"after A2's sentence"*: A2 is not applied (baseline F12). It goes after B's *"And the load rehearsal's profile and
    pass mark (§24)."* (spec l.3068-3069), as *"And the dependency allowlist (§12)."*
  - **Drop its clause *"so a change is not yet audited with its actor"* from the spec.** §26's very next words, *"Each change is audited
    with its actor"* (l.3069-3070), describe the console's settings as designed, which is how B's settings stand there too. The fact that
    today's settings are read at boot and are not audited is a recorded gap (ORIENTATION, the plan), not spec text that contradicts the
    next sentence.
  - If Rich prefers the clause kept, §26 must then say which settings are not yet audited, B's included.

### `[M3]` — this review's word (PROVISIONAL until the clean re-run lands)

**(a) — `E404` → `503 DEPENDENCY_UNAVAILABLE`, `ETARGET` → `422 DEPENDENCY_NOT_FOUND`, `E500 … uplink is offline` and `EAI_AGAIN` →
`UNAVAILABLE`, `ENOENT`/`spawn git` and everything else → `RESOLUTION_FAILED` — with I1's wider ripple taken in the same revision.**

- **Why (a).** With Task 4's allowlist in front, a made-up name never reaches the mirror (`NOT_ALLOWED`, before any builder). So Review
  Focus 1's three cases stay distinct exactly as measured: not allowed / no such version (`ETARGET`, offline too) / not now (`E404`,
  `E500`, `EAI_AGAIN`). It is also the only mapping the plan's own Task 2 Docker case is consistent with.
- **What (a) gives up**, to record as a finding rather than design around: an ALLOWED name npmjs does not have reads *"not now"*. That
  covers an administrator's typo in `allowed.txt`, or a package since unpublished whole. An agent told *"not now"* may retry. So the
  refusal's message should name the package and say a new package needs the network, and RUNBOOK's allowlist section should say an
  added name is proved by one online resolution.
- **(b) rejected** — reading Verdaccio's `http`-level log:
  - it couples the driver to 6.10.1's log text on a tag-pinned image (M7);
  - it changes the live mirror's `log.level` from `warn` (`infra/verdaccio/config.yaml:23`), which every run's log then carries;
  - it interleaves two concurrent builds' lines (`DEFAULT_BUILD_LIMITS`: 2 global);
  - it adds a log reader to the driver for one case that the allowlist already makes rare.
- **(c) rejected** — offline, an allowed real package would read *"no such thing"* (C1's own case), and Task 2's Docker case would be red.
- **Held for the re-run.** If the re-run shows the refused phase's npm lines differ from the throwaway's log and `curl` answers, the
  addendum says so. That covers (i) and (ii) with the uplink refused, which the baseline reads from the throwaway's log and `curl`, not
  from npm's own lines on disk (F13).
