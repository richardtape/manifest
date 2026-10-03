# An Agent Can Add a Dependency — FE-32 — Implementation Plan

> **WRITTEN 2026-10-03, AFTERNOON, BY THE PLANNING SESSION `manifest-c7`** (coordinated by `manifest-94`), after the Manifest
> team's step ([`2026-10-03-fe46-fe47-fe5.md`](./2026-10-03-fe46-fe47-fe5.md), approved the same afternoon). **Every fact in *Read this
> first* was read from the code at `eee5648`**, while the faculty-ready plan's sitting 5 had uncommitted edits in `infra/`, `secrets/`,
> `ai/` and `scripts/verify.sh`. Three plans run before this one, so **Task 1 re-reads every fact** into `spikes/fe32-baseline/`.
>
> **Rich confirmed FE-32 on 2026-09-30, option (a)** (*"Confirm all three (Recommended)"*): an operation that resolves a `package-lock.json`
> through the platform's mirror. **And placed it** (*"(a) Faculty-ready → FE-32 → vuln DB"*); since then the Manifest team's step
> (2026-10-02), and §24's production instances, the load rehearsal and hibernation (2026-10-03: *"Build the load rehearsal first"*, then *"A1 → B → A2"*) go before it. **§12's package allowlist, which does
> not exist today, is IN this plan** — Rich, 2026-10-03, ~13:43 PDT: *"Yes, in this plan (Recommended)"* (Task 4, Spec action C). **NOT
> YET APPROVED.** Three spec actions are DRAFTED at the end, none applied; their words are Rich's at review.

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline) or superpowers:subagent-driven-development, **whichever Rich chooses**. Steps use checkbox (`- [ ]`) syntax for tracking. **Commit on `main`; no branch, no worktree, no push** — ORIENTATION §6 rule 9.

**Goal:** **An agent can add a dependency to the app it builds.** It sends the `package.json` it wants; Manifest resolves the
`package-lock.json` **through its own package mirror, inside the network-restricted builder, with install scripts disabled**, and answers
it; the agent commits both, and the build's `npm ci` succeeds — offline too, because the resolution warmed the mirror. **An app may name
only a package on the platform's allowlist** (§12), at resolution and at the build's gate alike — so a hallucinated name (§12's
*slopsquatting*) is refused, naming it, before the mirror is asked anything. **A version the registry does not have, and a package the
mirror cannot fetch now, are each refused as exactly that** — never as a build that fails three times at `npm ci` with the reason fifty
lines from the end.

It is proved by **`make demo-authoring`, extended** — the agent adds `marked`, renders Markdown with it, and is refused a name that does
not exist — on either driver. A person clicks it too.

**Architecture:**
- **One operation, `resolveDependencies`**: `POST /v1/projects/{projectId}/dependencies/resolve` with the new manifest's text and a
  `baseCommit`. It writes nothing to the project: the agent commits what it answers with `createCommit`, whose checks then apply.
- **Resolution is the DRIVER's**, like a build: `Driver.resolveDependencies` (Spec action A, §11). The Docker driver runs it as a BuildKit
  build of a **blueprint-declared recipe** (`Resolve.tmpl`, Spec action B, §25) in the same rootless, `--internal`, bounded builder
  (§12), exported with `--output type=local`. **The control plane names no package manager** (D30); the blueprint does.
- **The committed lockfile at `baseCommit` goes in with the new manifest**, so a dependency added changes only its own subtree — every
  existing pin stays.
- **A FULL install, never `--package-lock-only`**, so every tarball is downloaded through Verdaccio and cached (`infra/seed/seed.sh:48-52`):
  the build that follows works with the network off.
- **The contract goes to `1.11.0` ONCE, at Task 3** (A2, before this one, leaves it `1.10.0`).

**Tech Stack:** TypeScript 5.9.3 on Node 24.12.0 (host), Fastify 5.12.3, `zod/v4`, Vitest 2.1; Docker Desktop 29.7.2, BuildKit rootless
via buildx's `remote` driver (`runtime/docker/builder.ts`); Verdaccio (`infra/verdaccio/config.yaml`); the blueprint's base image
`node:24-alpine` (npm 11.19.0, `blueprints/node-ts-mongo/blueprint.yaml:28-31`). **No new external package.**

**Spec:** [`../specs/2026-08-29-manifest-platform-design.md`](../specs/2026-08-29-manifest-platform-design.md). Read:
- **C1** (l.86-94): *"Adding a new dependency needs network — a stated limitation, not a surprise."*
- **§11**, *Driver interface* (l.1100-1140): *"Everything the control plane may ask of infrastructure, and nothing more."*
- **§12**, the builder (l.1490-1520: network-restricted to the mirror and the registry; rootless; bounded) and *Supply chain* (l.1527-1554:
  the mirror *"with an allowlist"*, committed lockfiles, install scripts disabled, SBOM, scanning).
- **§25**, *The descriptor* (l.2795-2830), and D30.
- **§20**'s threat row *"Malicious or hallucinated dependency"* (l.2133).

**Roadmap:** *The faculty front-end's message* (FE-32 there, as *"before a change after launch meets it"*).

**Predecessor:** [`2026-10-03-hibernation.md`](./2026-10-03-hibernation.md) — A2, hibernation and wake-on-request. **This plan starts only
after its acceptance closes.** Before it, in Rich's order of 2026-10-03: *faculty-ready*, the Manifest team's step, A1 (production instances
by audience), B (the load rehearsal, FE-44: *"Build the load rehearsal first"*), A2.

**Successor:** the vulnerability database in the console (Rich, 2026-09-30); then FE-45 (Rich, 2026-10-03).

---

## How this plan is to be executed — sittings, one per session

**One sitting per session, with a check-in at each boundary.** This plan commits after every task.

> **FIVE SITTINGS, PROPOSED.** Task 1 is first and alone. The driver's half is Docker-heavy and alone. The operation and the allowlist
> share a sitting, because the allowlist's two refusals are the operation's and the gate's. The clients and the guides are a sitting of their own. The
> acceptance is alone and last.

| Sitting | Tasks | What it delivers | `pnpm test:docker` owed? | Where it stops | Status |
|---|---|---|---|---|---|
| 1 | 1 | **The measurements**: every fact re-read; `--output type=local` from the rootless remote builder; a full install against the mirror, with the committed lock kept; what npm says when the mirror cannot fetch (a THROWAWAY Verdaccio whose uplink is unreachable); install scripts proved off; Verdaccio's unpublish for a test package; the gate numbers | No | After Task 1's commit. **It stops and asks Rich** if `[M2]` finds the builder cannot export a file, or `[M3]` finds the mirror's two failures indistinguishable | ← **next**, once this plan is approved and the plan before it has closed |
| 2 | 2 | **The driver resolves**: `Driver.resolveDependencies` on both drivers and in the driver contract; the descriptor's `dependencies` block; `Resolve.tmpl` in both blueprints; the driver's hard-coded `'package-lock.json'` read from the descriptor | Yes — `runtime/`, `blueprints/`, `build/` | After the commit, with the Docker case green and one resolution through the real builder quoted | |
| 3 | 3, 4 | **The operation**: `resolveDependencies`, its refusals, contract `1.11.0`. **The allowlist** — a platform setting; the operation and the build's gate both refuse an unlisted direct dependency | Yes — `source/`, `build/`, `blueprints/` | After both commits, with a resolution and an allowlist refusal through the edge on driver 1 | |
| 4 | 5 | **The clients**: the mock, the knowledge pack's rule, the guide *Authoring*'s *Adding a dependency*, an example run against the mock | No, unless a fix touches the owed list | After the commit, with `pnpm docs:write` clean and the front-end told | |
| 5 | 6 | **The acceptance**: `make demo-authoring`, extended, three times on each driver; the fixture that warms `marked`; every other demo; a clicked half; the plan's one whole-branch review. **Alone, and last** | Yes, if any code changes | After the clicked half and the review's one fix wave | |

**EVERY SITTING ENDS THE SAME WAY** — the four gates (`pnpm test` twice, alone, on the final tree; `pnpm lint`; `pnpm typecheck`; `pnpm
format:check`), the Docker tier when owed; a dated *What executing this plan found*; this table; and ORIENTATION §6's sweep.

**Three rules survive any re-cut:** Task 1 stays first and alone; Task 6 stays alone and last; no task that a spec action changes runs
before Rich has decided that spec action (A and B before sitting 2; C before Task 4).

---

## Decided by Rich — build them, do not re-open them

- **FE-32 (a)** — *"Confirm all three (Recommended)"* (2026-09-30, the planning session `manifest-00`; [`../2026-09-30-decisions.md`](../2026-09-30-decisions.md),
  its item 5): **an operation that resolves a `package-lock.json` through the platform's mirror.** *Rejected by that choice:* (b) the build
  regenerating the lockfile itself; (c) waiting for Phase 3's `exec`.
- **§12'S ALLOWLIST, IN THIS PLAN** — *"Yes, in this plan (Recommended)"* (2026-10-03, ~13:43 PDT, through the question tool, relayed by
  `manifest-94`, who records it in [`../2026-09-30-decisions.md`](../2026-09-30-decisions.md)): its smallest faithful form — administrator-
  managed direct dependencies, seeded from the listed blueprints' skeletons; the resolve operation and the build's lockfile gate both refuse
  an unlisted one with `409 DEPENDENCY_NOT_ALLOWED`; its spec action (C) drafted, not applied. **Resolution inside the builder (Spec actions A
  and B) and a full install through the mirror stand as written**; their spec-action words are his at review.
- **THE ORDER** — *"(a) Faculty-ready → FE-32 → vuln DB"* (2026-09-30); the Manifest team's step placed between faculty-ready and FE-32 on
  2026-10-02 (*"After faculty-ready"*); **the load rehearsal placed before FE-32** on 2026-10-03 (*"Build the load rehearsal first"*), and
  §24's capacity built before the rehearsal, as two plans and then three (*"Build §24's capacity first"*, *"A1 → B → A2"*); FE-45 after the
  vulnerability database the same day. So: *faculty-ready* → the Manifest team's step → A1 (production instances) → B (the load rehearsal)
  → A2 (hibernation) → **FE-32** → the vulnerability database → FE-45.
- **Carried, still binding:** D24 (a delegated token may do this — it decides nothing and writes nothing to the project); every refusal
  asserts its code; published text cites no section, decision or plan; **the front-end is told before any commit to `packages/contract`
  or `packages/mock`.**

---

## What Rich does, and when

1. **Review this plan** (the allowlist is answered: *"Yes, in this plan"*); answer *Asked of Rich*'s two that remain.
2. **Read and decide Spec actions A and B before sitting 2, and C before Task 4.**
3. **The network, at sitting 5**, for the acceptance's first resolution of `marked`: Verdaccio fetches it from npmjs through its uplink,
   as `make seed` does. *Asked at that sitting's open.* After it the fixture's lockfile is committed, and `make seed` warms `marked` on any
   machine.
4. **The clicked half, sitting 5**: in the console, read the commit an agent made with a new dependency, and the build that used it.

---

## Read this first — what this plan knows from the code

*Read at `eee5648` on 2026-10-03. Task 1's `[M1]` re-reads every one.*

**The build, as it is.**
1. **The blueprint's Dockerfile copies `package.json`, `package-lock.json` and `.npmrc`, then runs `npm ci --omit=dev --ignore-scripts`**
   (`blueprints/node-ts-mongo/Dockerfile.tmpl`). The platform writes `.npmrc` into the context AFTER the app's tree
   (`build/context.ts:78-96`, `:265`), and it points every lookup AND every tarball at `http://manifest-verdaccio:4873/`
   (`replace-registry-host=always`; `blueprints/node-ts-mongo/.npmrc`).
2. **§12's gates** are `runMandatoryGates(dir, { lockfile })` — the secret scan and **the lockfile's existence, nothing more**
   (`build/gates.ts:99-108`, `requireLockfile` `:84-95`). **The Docker driver hard-codes the lockfile's name**, `lockfile:
   'package-lock.json'` (`runtime/docker/driver.ts:296-299`) — a Node assumption in a driver, against D30.
3. **The builder** is an ephemeral rootless BuildKit container that buildx reaches through its `remote` driver
   (`runtime/docker/builder.ts`); a build is `docker buildx --builder <it> build … --output type=image,…,push=true` (`:414-500`), streamed
   to `onLog`, serialized per project by `queue.run(spec.projectSlug, …)` (`driver.ts:285`), bounded by destroying the builder.
4. **`Driver`** (`runtime/driver.ts:327-…`) has `buildImage(src, spec, opts)`; the fake driver implements it (`runtime/fake-driver.ts:130`)
   and **`runtime/driver-contract.ts`** is the suite both pass. **§11's interface lists every method** the control plane may call.
5. **The mirror**: `infra/verdaccio/config.yaml` proxies **every** package from npmjs (`'**': { access: $all, publish: $all, proxy: npmjs
   }`, `cache: true`). **There is no allowlist**, though §12 says dependencies resolve *"through a private registry mirror with an
   allowlist"*. Offline it serves only what it has cached.
6. **`make seed` warms the mirror with a FULL install** of every blueprint skeleton's and fixture's lockfile, in a temp directory, with an
   empty npm cache (`infra/seed/seed.sh:38-73`) — and says why: **`--package-lock-only` downloads no tarball, so the mirror holds package
   documents and no tarballs, *"indistinguishable from a warm mirror until the network goes away"*** (measured 2026-09-08); and a warm
   `~/.npm` cache hides every fetch from Verdaccio (measured 2026-09-14).
7. **The knowledge pack says** *"Adding a dependency means adding it to `package.json` **and** committing the regenerated
   `package-lock.json`: the build runs `npm ci`, which fails without one"* (`blueprints/node-ts-mongo/agents/AGENTS.md:10-13`) — which no
   agent working over the API can do (FE-32).
8. **The front-end measured it** (its F3 sitting 1, M4, manifest `346cd9e`): `package.json` given `marked@14.1.0` and no lock entry builds
   `failed` in 3.6 s; *"`npm ci` can only install packages when your package.json and package-lock.json … are in sync"* and *"Missing:
   marked@14.1.0 from lock file"* are about 50 lines from the end of a 100-line log; `Build.error` holds only npm's usage text.

**The API, as it is.**
9. **`createCommit`** (`api/routes/source.ts:~499-…`, `capability: 'source:write'`, mintable) writes files against a `baseCommit`, checks
   every path, secret-shaped value and the resulting `manifest.yaml`, and refuses a stale base. It is how the agent commits the manifest
   and the lockfile together.
10. **Reading the project's tree at a commit** is `source/reading.ts` (`readText(repo, commit, path)`, over either driver's git dir).
11. **Platform settings are deployment configuration today** (`config.ts`, e.g. `MANIFEST_CAPABLE_MODEL_FALLBACK` `:319`,
    `MANIFEST_AGENT_SESSION_CAP_USD` `:326`), read at boot; §26 lists them (spec l.2959-2966). There is no settings table.

---

## Decisions this plan makes, and why

1. **ONE CONTRACT BUMP, `1.11.0`, AT TASK 3.** Additive: one operation, its request and answer, its codes. *Cost to change course:* the
   version string.
2. **THE OPERATION TAKES THE NEW MANIFEST AND A `baseCommit`, AND ANSWERS THE LOCKFILE — IT NEVER COMMITS.**
   - Request: `{ manifest: string, baseCommit?: string }` — the manifest file's whole new text (the descriptor names the file); `baseCommit`
     defaults to `main`'s head. The platform reads the **committed lockfile at `baseCommit`** and resolves with it, so an addition moves only
     its own subtree.
   - Answer: `{ lockfile: { path, content, sha256 }, baseCommit, log: string[] }` — the path from the descriptor; `log` the resolver's last
     lines (bounded, redacted).
   - *Rejected:* committing for the agent — it would be a second write path beside `createCommit`, which already checks secrets, paths and
     the manifest, and the agent's own commit message would be lost. *Rejected:* taking the lockfile from the agent — a lockfile the agent
     writes is exactly what FE-32 says a model cannot write correctly, and one it sends could carry anything.
3. **RESOLUTION RUNS IN THE BUILDER, FROM A BLUEPRINT-DECLARED RECIPE** (Spec actions A and B). `Driver.resolveDependencies` builds
   `Resolve.tmpl` — the blueprint's, as its `Dockerfile.tmpl` is (D13) — with the manifest, the base lockfile and the platform's `.npmrc`,
   and exports the lockfile with `--output type=local`. **The builder reaches only the mirror and the registry** (§12), so a `file:`,
   `git+…` or `http(s):` dependency simply fails to resolve: **the control plane parses no `package.json`** (D30).
   - *Rejected:* `npm` on the host. It would put a package manager in the control plane (D30's failure), reach the public registry
     directly with the network up, and run beside the platform's own files.
   - *Rejected:* the build regenerating the lockfile (FE-32 (b), Rich's choice).
4. **A FULL INSTALL, SCRIPTS OFF, AN EMPTY CACHE, NO BUILD CACHE.** The recipe runs `npm install --ignore-scripts --no-audit --no-fund` with
   its cache in the build's own `/tmp`, and the build passes `--no-cache`: the question is *what the mirror resolves now*, and a cached layer
   would answer a stale one and fetch nothing through Verdaccio. Every tarball is then in the mirror, so the build that follows works
   offline (*Read this first* 6). *Cost:* a resolution takes about as long as an install — Task 1's `[M2]` measures it.
5. **ITS REFUSALS SAY WHICH OF THREE THINGS WENT WRONG**, read from npm's own error lines in the resolver's log (the recipe is npm's, so
   the mapping lives with the Docker driver, never in `api/`):
   - **`422 DEPENDENCY_NOT_FOUND`** — the registry has no such package or version (`E404`, `ETARGET`), **naming it**. A name that is not
     allowed never gets this far (Task 4, `409 DEPENDENCY_NOT_ALLOWED`, before any builder); this is an allowed package's version that does
     not exist, or a name the allowlist holds that the registry has since lost;
   - **`503 DEPENDENCY_UNAVAILABLE`** — the mirror cannot fetch it now (no route off the laptop, and not cached), naming it: C1's *"adding a
     new dependency needs network"*;
   - **`422 DEPENDENCY_RESOLUTION_FAILED`** — anything else (a conflict, a manifest that is not JSON, a non-registry specifier), with npm's
     `error` lines as `log`.

   `[M3]` measures what npm prints for the first two against the mirror; if the two cannot be told apart, the sitting stops and asks Rich.
6. **A BOUNDED REQUEST, REFUSED BEFORE ANY BUILDER STARTS**: the manifest's text at most 64 KiB (`400 VALIDATION_FAILED`, the route's schema);
   a `baseCommit` the project does not have is `409 SOURCE_COMMIT_NOT_FOUND` (the source routes' code). Nothing about the manifest's
   CONTENT is checked here (Decision 3).
7. **THE CAPABILITY IS `source:write`**, mintable: an agent that writes code needs it, it decides nothing, and it writes nothing to the
   project. It is serialized with the project's builds (`queue.run(projectSlug)`), bounded by the builder's timeout, and so counted in the
   build concurrency §12 bounds.
8. **NO EVENT.** The operation changes nothing a person reads; the commit that follows is the record (`repository.committed`), and the
   build that uses it is (`build.*`). *Rejected:* `dependencies.resolved`, which would announce a question, not a change.
9. **THE DRIVER READS THE LOCKFILE'S NAME FROM THE DESCRIPTOR** — `runtime/docker/driver.ts:296-299`'s literal goes (Task 2), so the gate
   and the resolver agree by construction.
10. **THE ACCEPTANCE ADDS `marked` IN `make demo-authoring`**, whose agent already builds an app through the API alone; `make seed` warms
    it through a new fixture, `fixtures/dependency-app/`, **whose lockfile is the one this operation answered** at sitting 5 — the feature
    makes its own fixture, so the offline acceptance can run it on a clean machine. The exact version is the one that resolution pins,
    recorded with the day.
11. **THE ALLOWLIST** (Task 4, Spec action C; Rich, *"Yes, in this plan"*): the direct dependencies an app may name, a **platform setting** — a file
    named by `MANIFEST_DEPENDENCY_ALLOWLIST` (default `infra/dependencies/allowed.txt`, one name per line, `#` comments) read at boot, as
    every platform setting is today (*Read this first* 11) — **seeded with every listed blueprint skeleton's direct dependencies**, which are
    always allowed. What an allowed package depends on comes with it (the lockfile's closure is not listed). **Both doors refuse an
    unlisted direct dependency, naming it**: the operation (`409 DEPENDENCY_NOT_ALLOWED`, before any builder starts) and the build's gate (a
    new `dependency` finding), so a person's push cannot route around it. Reading the manifest's direct dependencies is then a
    **descriptor-declared format** (`dependencies.format: npm`), read by one small function the blueprint registry selects — the only place
    the control plane reads a `package.json`, and named so. `listAllowedDependencies` (`GET /v1/dependencies/allowed`, any signed-in person
    or token) lets an agent check before it asks.

---

## Global Constraints

- **The four gates, clean before every commit**, from the repository root; `pnpm test` twice on a sitting's final tree; never `--filter`.
- **`pnpm test:docker`** is owed by any change to `runtime/`, `routing/`, `services/`, `build/`, `releases/`, `identity/`, `sso/`,
  `secrets/`, `projects/`, `blueprints/`, `spec/`, `ai/`, `observability/`, `launch/`, `source/`, `mail/`, `infra/`, or a
  `*.docker.test.ts`. In the background, never beside a Vitest run; `docker network ls -q | wc -l` first; from a shell where
  `MANIFEST_SOURCE_DRIVER` and every `MANIFEST_GITHUB_*` is unset; then restart the control plane, the three cleanup scripts, `make verify`.
- **One file**: `pnpm exec vitest run --project unit src/<path>`. **Never two Vitest processes at once.** `pnpm test` truncates.
- **A route change is four commands, in order**: the definition, `pnpm contract:write`, `pnpm contract:generate`, `pnpm docs:write`.
- **Published text cites no section, decision or plan.**
- **Every refusal asserts its code**, with a positive control in the same file. This plan adds `DEPENDENCY_NOT_FOUND`,
  `DEPENDENCY_UNAVAILABLE`, `DEPENDENCY_RESOLUTION_FAILED` (Task 3) and `DEPENDENCY_NOT_ALLOWED` (Task 4).
- **Never accept a check you have not watched fail**: commit, break, predict, restore.
- **Every task names its CALLER.**
- **A resolver's log is redacted before it is answered or logged** (§14), and an operator line never carries a manifest or a lockfile.
- **The front-end is told before any commit to `packages/contract` or `packages/mock`**; keep them typecheck-clean together.
- **Commit on `main`, stage your own paths by name**; `git status` before each commit.
- **The network**: none is needed by any task but the acceptance's first resolution of `marked` (*What Rich does* 3). A measurement never
  sends the live Verdaccio to npmjs: `[M3]` uses a THROWAWAY Verdaccio whose uplink is unreachable.
- **Never touch the running Verdaccio's configuration**; a test package published to it is unpublished in the same test.
- **The four protected containers survive; `caddy-data` is never destroyed; never touch Valet; ask before `sudo`; never edit the spec.**
- **macOS: bash 3.2, BSD userland, the tool shell zsh** — multi-line probes as files run with `bash`.
- **Leave the machine as you found it**: `scripts/snapshot-machine.sh` at the start and end; the three cleanup scripts, bare then `--apply`;
  every throwaway container and network removed.

---

## Review Focus

**The six failure modes most likely to bite a person, that no happy path exercises.** Each has its test in the owning task.

1. **A hallucination read as an outage, or an outage read as a hallucination.** A name npm has never had; an allowed package at a version
   it never published; a real package the mirror has not cached with no route off the laptop. Expected: **`DEPENDENCY_NOT_ALLOWED` for the
   first (before any builder), `DEPENDENCY_NOT_FOUND` for the second, `DEPENDENCY_UNAVAILABLE` for the third, each naming it** — an agent
   told *"no such thing"* must not retry, and one told *"not now"* may. Owned by Task 3's *the three refusals* (driven by Task 2's fake),
   Task 2's Docker case with the throwaway mirror, and Task 4.
2. **An addition that moves every pin.** Adding one package to an app with a committed lockfile. Expected: **every package already locked
   keeps its version** unless the new one's ranges force a change; the answered lockfile differs from the base only in the new subtree.
   Owned by Task 2's *existing pins stay*.
3. **A lockfile the build then refuses.** The answered lockfile committed with its manifest. Expected: **the next build's `npm ci`
   succeeds** — on the same platform, and offline after the resolution (the mirror warm). Owned by Task 2's Docker case and Task 6.
4. **A dependency that runs code, or reaches past the mirror.** A package with a `postinstall` that writes a marker; a `git+https:` and a
   `file:../` specifier. Expected: **no marker in anything exported; the two specifiers fail as `DEPENDENCY_RESOLUTION_FAILED`, the
   builder having reached nothing.** Owned by Task 2's *scripts are off, and only the mirror is reached*.
5. **A request that costs before it is refused.** A 65 KiB manifest; a `baseCommit` the project does not have; a token on another
   project. Expected: **refused before any builder starts** (assert no builder container appeared). Owned by Task 3's matrix.
6. **An allowlist a push routes around.** A person pushes a `package.json` naming an unlisted package with a hand-written
   lockfile. Expected: **the build's gate refuses it, naming the package**, exactly as the operation would have. Owned by Task 4.

---

## File Structure

```
blueprints/node-ts-mongo/blueprint.yaml, blueprints/fixture-node/blueprint.yaml   MOD (T2) dependencies: { manifest, lockfile, resolve }; (a) format: npm
blueprints/node-ts-mongo/Resolve.tmpl, blueprints/fixture-node/Resolve.tmpl     NEW (T2) the resolution recipe, blueprint-managed
packages/control-plane/src/blueprints/descriptor.ts, registry.ts                MOD (T2) the dependencies block
packages/control-plane/src/runtime/
  driver.ts                   MOD (T2) Driver.resolveDependencies; DependencySource; ResolvedDependencies; DependencyError
  driver-contract.ts          MOD (T2) the cases both drivers pass
  fake-driver.ts              MOD (T2) a scripted resolver
  docker/driver.ts            MOD (T2) resolveDependencies; the gate's lockfile from the descriptor
  docker/builder.ts           MOD (T2) runBuildxResolve — --output type=local, --no-cache
  docker/resolve.ts           NEW (T2) the npm error lines → the three codes
  docker/resolve.docker.test.ts   NEW (T2)
packages/control-plane/src/api/
  routes/source.ts            MOD (T3) resolveDependencies
  representations/source.ts   MOD (T3) ResolveDependenciesRequest, ResolvedDependencies
  error-codes.ts, errors.ts   MOD (T3) the three codes; (T4) DEPENDENCY_NOT_ALLOWED
  authz-contract.ts           MOD (T3) the operation's rows
  contract/document.ts        MOD (T3) 1.11.0
packages/control-plane/src/build/gates.ts                                        MOD (T4, (a)) the dependency gate
packages/control-plane/src/config.ts, infra/dependencies/allowed.txt             MOD/NEW (T4, (a))
packages/mock/src/, packages/journey/src/example-dependency.ts, docs/api/authoring.md, blueprints/node-ts-mongo/agents/AGENTS.md   MOD/NEW (T5)
packages/journey/src/authoring.ts, fixtures/dependency-app/, scripts/demo-authoring.sh (if its table moves)   MOD/NEW (T6)
docs/superpowers/spikes/fe32-baseline/                                           NEW (T1)
```

---

## Task 1: Measure what this plan rests on

**ALONE, AND FIRST.** Nothing under `packages/` changes. The record is `docs/superpowers/spikes/fe32-baseline/README.md` and
`results-task1-<date>.txt`.

- [ ] **Step 1: `[M1]` Re-read every *Read this first* fact at HEAD** — two plans will have run — and record each with its line numbers.
  Above all: `runtime/driver.ts`'s `Driver`, `runtime/docker/driver.ts`'s `buildImage` and its gate call, `runtime/docker/builder.ts`'s
  builder and `runBuildxBuild`, `build/context.ts`'s `.npmrc` placement, and what `source/reading.ts` reads at a commit.
- [ ] **Step 2: `[M2]` The builder exports a file.** A probe in `$SCRATCH` (an `.mjs`, run with the RUNBOOK's environment) starts a
  throwaway builder the way `runtime/docker/builder.ts` does, on the same `--internal` network, and builds:

  ```dockerfile
  FROM <node-ts-mongo's base_image, by digest>
  WORKDIR /resolve
  COPY package.json package-lock.json .npmrc ./
  RUN npm install --ignore-scripts --no-audit --no-fund --cache /tmp/npm-cache
  FROM scratch
  COPY --from=0 /resolve/package-lock.json /
  ```

  with `--no-cache --output type=local,dest=$SCRATCH/out`, from the skeleton's own `package.json` plus one package **already in the
  mirror's storage but not in the skeleton's direct dependencies** (pick one from `find` over Verdaccio's storage, e.g. a transitive
  dependency of `express`), and the skeleton's lockfile as the base. Record: the exported file; the wall time; **that every package locked
  in the base keeps its version** (a `jq` diff of `packages`); and the mirror's `.tgz` count before and after. Remove the builder.
- [ ] **Step 3: `[M3]` What npm says when the mirror cannot serve**, against a THROWAWAY Verdaccio (`docker run` of the image the compose
  file pins, its own network and port 7196, a config copy whose uplink is `http://127.0.0.1:9`): (i) a name the throwaway has never cached
  — npm's error code and message (the offline case); (ii) a name that cannot exist (`manifest-no-such-package-<nonce>`) — the same; and
  (iii) a `git+https:` and a `file:../x` specifier through the real builder probe of Step 2; and (iv) a package the throwaway HAS cached
  (resolve it once with the uplink up, then cut it) at a version it never published — expected `ETARGET` with no network, which is what
  lets the acceptance's `DEPENDENCY_NOT_FOUND` step run offline. **If (i) and (ii) print the same code, STOP
  and ask Rich before sitting 2**: Decision 5 rests on telling them apart. Remove the throwaway.
- [ ] **Step 4: `[M4]` Scripts are off.** Publish `@manifest-probe/postinstall-<nonce>` (a `postinstall` that writes `/resolve/RAN`) to the
  throwaway Verdaccio of Step 3, resolve a manifest naming it through a builder pointed at the throwaway, and record that `RAN` is absent
  from the exported stage; then `npm unpublish --force` it and record that the throwaway's storage no longer holds it. This is the pattern
  Task 2's Docker case uses against the platform's own mirror.
- [ ] **Step 5: `[M5]` The gate numbers** (`scripts/ci-acceptance.sh`'s `EXPECT_` lines), the contract's version, and `pnpm test` once.
- [ ] **Step 6: Commit** the spike directory by name.
  ```bash
  git commit -m "docs(fe32): Task 1 — the measurements (the builder exports a lockfile, the mirror's two failures, scripts off)"
  ```

---

## Task 2: The driver resolves — a blueprint's recipe, in the network-restricted builder

**Sitting 2. Spec actions A and B decided first.** Decisions 3, 4, 5, 9. **Its caller is Task 3's route.**

**Files:**
- Modify: `blueprints/node-ts-mongo/blueprint.yaml`, `blueprints/fixture-node/blueprint.yaml` — `dependencies: { manifest: package.json,
  lockfile: package-lock.json, resolve: ./Resolve.tmpl }`; Create: each blueprint's `Resolve.tmpl`
- Modify: `packages/control-plane/src/blueprints/descriptor.ts` (the block, required), `registry.ts` (loads the recipe as it loads the
  Dockerfile; refuses a `# syntax=` line in it as it does there)
- Modify: `runtime/driver.ts`, `runtime/fake-driver.ts`, `runtime/driver-contract.ts`, `runtime/docker/driver.ts`,
  `runtime/docker/builder.ts`; Create: `runtime/docker/resolve.ts`, `runtime/docker/resolve.docker.test.ts`
- Test: `blueprints/blueprints.test.ts`, `runtime/fake-driver.test.ts`, the driver contract, `resolve.test.ts` (the error mapping)

**Interfaces:**
- Produces:

  ```ts
  // runtime/driver.ts
  /** What a resolution reads: the manifest's new text, and the lockfile committed at the base (absent for a first one). */
  export interface DependencySource {
    manifest: string
    baseLockfile: string | null
  }

  /** The lockfile resolved, and the resolver's last lines — redacted, bounded. */
  export interface ResolvedDependencies {
    lockfile: string
    log: string[]
  }

  /** Why a resolution was refused — the three things that can go wrong (Decision 5). `names` are the packages at fault. */
  export class DependencyError extends Error {
    constructor(
      readonly code: 'DEPENDENCY_NOT_FOUND' | 'DEPENDENCY_UNAVAILABLE' | 'DEPENDENCY_RESOLUTION_FAILED',
      message: string,
      readonly names: string[],
      readonly log: string[],
    ) {
      super(message)
      this.name = 'DependencyError'
    }
  }

  export interface Driver {
    // …
    /**
     * An app's dependency lockfile, resolved from its manifest THROUGH THE PLATFORM'S MIRROR, in the network-restricted
     * builder, from the blueprint's own recipe — installing nothing that runs, keeping every pin the base lockfile holds that the
     * manifest still allows. Stateless: the same inputs against the same mirror answer the same lockfile.
     */
    resolveDependencies(
      src: DependencySource,
      spec: { blueprintRef: string; projectSlug: string },
      opts?: BuildOpts,
    ): Promise<ResolvedDependencies>
  }
  ```

- [ ] **Step 1: The failing tests.**
  - **The driver contract** (both drivers): a manifest adding one package to a base lockfile answers a lockfile naming it; a second call
    with the same inputs answers the same text; an unknown package is `DependencyError('DEPENDENCY_NOT_FOUND')` naming it.
  - **`resolve.test.ts`** — npm's error lines (copied verbatim from `[M3]`'s record) map to the three codes, naming the package; a
    log with no recognisable line is `DEPENDENCY_RESOLUTION_FAILED`; the log answered is the last 40 lines, redacted.
  - **`blueprints.test.ts`** — every shipped blueprint declares `dependencies`, its `resolve` template exists and carries no `# syntax=`;
    a descriptor without the block is refused at load.
  - **`resolve.docker.test.ts`, *existing pins stay* (Review Focus 2)**: the skeleton's manifest plus one package `[M2]` found in the mirror,
    its lockfile as the base → every base `packages` entry keeps its version; then **a build of that manifest and lockfile succeeds**
    (Review Focus 3).
  - **`resolve.docker.test.ts`, *scripts are off, and only the mirror is reached* (Review Focus 4)**: `[M4]`'s postinstall package
    published to the platform's mirror under `@manifest-probe/`, resolved → no `RAN` in what is exported; unpublished in the test's
    `finally`. A `git+https:` and a `file:../x` specifier → `DEPENDENCY_RESOLUTION_FAILED`.
  - **The gate reads the descriptor**: a blueprint whose descriptor names another lockfile (a test descriptor) is gated on THAT name.
- [ ] **Step 2: Run, and predict** red everywhere new; say which existing test changes (the gate's literal).
- [ ] **Step 3: Implement.** The recipe, `blueprints/node-ts-mongo/Resolve.tmpl`:

  ```dockerfile
  # THE RESOLUTION RECIPE — what `resolveDependencies` builds (Decision 3). Blueprint-managed, as the Dockerfile
  # is, and with the same rule: NO `# syntax=` LINE, because the builder has no route to Docker Hub.
  FROM {{BASE_IMAGE}}
  WORKDIR /resolve
  # The platform's `.npmrc` with them: every lookup and every tarball through the mirror.
  COPY package.json package-lock.json .npmrc ./
  # A FULL install, so every tarball is fetched THROUGH the mirror and kept there — the build that follows then
  # works offline. `--package-lock-only` would cache none (infra/seed/seed.sh). Scripts never run; the cache is
  # this build's own, so nothing is taken from a machine's ~/.npm instead of the mirror.
  RUN npm install --ignore-scripts --no-audit --no-fund --cache /tmp/npm-cache
  FROM scratch
  COPY --from=0 /resolve/package-lock.json /
  ```

  (A first resolution has no base lockfile: the driver writes `{}`-free context — it omits the file and the recipe's `COPY` names it with a
  glob, `package-lock.jso[n]`, which BuildKit accepts when nothing matches; `[M2]` confirms, or the driver writes a minimal
  `{"lockfileVersion":3}`.) `runBuildxResolve` is `runBuildxBuild`'s shape with `--no-cache` and `--output type=local,dest=<tmp>` in place
  of the image output, and no registry token (it pushes nothing). `resolveDependencies` in the Docker driver: assemble a context in a temp
  directory (the manifest, the base lockfile, the blueprint's `.npmrc`, the rendered recipe), run it inside `queue.run(spec.projectSlug,
  …)`, read the exported lockfile, map a failed build's log through `resolve.ts`, and remove the temp directory in a `finally`. The fake
  driver answers a deterministic lockfile naming each dependency, and `DEPENDENCY_NOT_FOUND` for a name beginning `manifest-no-such-`.
  The gate call (`driver.ts:296-299`) reads `descriptor.dependencies.lockfile`.
- [ ] **Step 4: Through the real builder.** Run `resolve.docker.test.ts` alone (`MANIFEST_TEST_DOCKER=1 pnpm exec vitest run --project
  docker src/runtime/docker/resolve.docker.test.ts`), quote one resolution's time and lockfile diff.
- [ ] **Step 5: Commit**, then the **negative controls**:
  - **(a)** drop `--ignore-scripts` from the recipe. Predict red: the postinstall case only.
  - **(b)** `--package-lock-only` instead of a full install. Predict: the lockfile cases stay GREEN — say so — and the mirror's tarball
    count does not move, which the *existing pins stay* case asserts too, so it goes red there.
  - **(c)** drop `--no-cache`. Predict: green on a first run, and a second resolution after `[M2]`'s package is removed from the mirror
    still answers — the case that removes it goes red. If no such case can be written without touching the mirror's storage, record (c) as
    *"cannot fail in this tier"* WITH the reason, and the acceptance's control replaces it.
  ```bash
  git commit -m "feat(runtime): the driver resolves an app's lockfile from its blueprint's recipe, in the network-restricted builder, through the mirror"
  ```

---

## Task 3: The operation — `resolveDependencies`

**Sitting 3.** Decisions 1, 2, 5–8. **The contract goes to `1.11.0` here.**

**Files:**
- Modify: `api/routes/source.ts` (the route, beside `createCommit`); `api/representations/source.ts` (`ResolveDependenciesRequest
  { manifest: string ≤ 65,536 chars, baseCommit?: Sha }`, `ResolvedDependencies { lockfile: { path, content, sha256 }, baseCommit, log }`);
  `api/error-codes.ts` and `api/errors.ts` (the three codes, `DependencyError` mapped by `instanceof`, its `names` and `log` as error
  facts); `api/authz-contract.ts` (the rows); `api/contract/document.ts` (`1.11.0`); the four contract commands; the mock's operation (a
  fixture answer, and `DEPENDENCY_NOT_FOUND` for a `manifest-no-such-` name) in the same step, so contract and mock typecheck together
- Test: `api/source.test.ts` (or the routes' file `[M1]` names), the authorization matrix

- [ ] **Step 1: The failing tests** — against the fake driver:
  - **The answer**: a manifest and `main` as the base → `200`, the lockfile at the descriptor's path, its `sha256`, `baseCommit` the head
    read; **then `createCommit` of the manifest and that lockfile, then `startBuild`, succeeds** (the fake driver's build).
  - **The three refusals (Review Focus 1)**: each code, its status, and `error.names` naming the package.
  - **Before any builder (Review Focus 5)**: 65 KiB → `400 VALIDATION_FAILED`; an unknown `baseCommit` → `409 SOURCE_COMMIT_NOT_FOUND`; a
    token on another project → `404`; **the fake driver recorded no resolution for any of them**.
  - **A token holding `source:write` → `200`; one without → `403 FORBIDDEN`**; a collaborator → `200`; an archived project → `409
    PROJECT_ARCHIVED` (derived, as for every route with a capability).
  - **The base lockfile is read**: the fake driver received the lockfile committed at `baseCommit`, and `null` for a project with none.
- [ ] **Step 2: Run, and predict.**
- [ ] **Step 3: Implement**, then the four contract commands. **Tell the front-end before the commit**: `1.11.0`; the operation; its codes.
- [ ] **Step 4: Through the edge, on driver 1**: with a running control plane, resolve the skeleton's manifest plus `[M2]`'s package for a
  demo project over `https://console.manifest.internal`; commit both; build; quote the build's `npm ci` line.
- [ ] **Step 5: Commit**, then the **negative control**: start the resolution before the `baseCommit` check. Predict red: Review Focus 5's
  *"no resolution recorded"* row only.
  ```bash
  git commit -m "feat(api): resolveDependencies — an agent sends its package.json and is answered the lockfile, resolved through the mirror (FE-32; contract 1.11.0)"
  ```

---

## Task 4: The allowlist — the direct dependencies an app may name

**Sitting 3, after Task 3. Spec action C decided first.** Decision 11.

**Files:**
- Create: `infra/dependencies/allowed.txt` (one name per line, each with a `#` reason; seeded by hand with nothing beyond what the skeletons
  already name — the skeletons' own direct dependencies are allowed by the loader, not listed)
- Modify: `config.ts` (`MANIFEST_DEPENDENCY_ALLOWLIST`, a path; `CONFIG_INVALID` naming a malformed line by number); the blueprint
  registry (`dependencies.format`, and `directDependencies(format, manifestText): string[]` — the one place a `package.json` is read: the
  keys of `dependencies`, `devDependencies`, `optionalDependencies` and `peerDependencies`); `build/gates.ts` (`runMandatoryGates` gains
  the allowlist as a parameter the DRIVER passes, never an option an app sets — the function's own comment forbids a third); the operation
  (refused before any builder); `api/error-codes.ts` (`DEPENDENCY_NOT_ALLOWED`, 409); `listAllowedDependencies`
  (`GET /v1/dependencies/allowed`, any authenticated actor); the contract commands; the mock
- Test: `build/gates.test.ts`, the operation's file, `config.test.ts`

- [ ] **Step 1: The failing tests.** (Task 3's tests gain a test allowlist naming what they resolve, and its `manifest-no-such-` names
  stay allowed there, so its refusals still reach the driver — say so in the commit.) An unlisted direct dependency → the operation's
  `409 DEPENDENCY_NOT_ALLOWED`, naming it, and no resolution recorded; **the same manifest pushed with any lockfile → the build's gate refuses it, naming it** (Review Focus 6); a skeleton
  dependency needs no line; a listed one passes both; a package that is only TRANSITIVE is never asked about. `listAllowedDependencies`
  answers the file's names and the skeletons'.
- [ ] **Step 2: Run, and predict.** **Step 3: Implement**, contract commands, the front-end told. **Step 4: Through the edge**: an unlisted
  name refused by the operation, and by a build of a pushed commit.
- [ ] **Step 5: Commit**, then the **negative control**: skip the gate's check. Predict red: Review Focus 6's push row only — the operation
  still refuses, which is exactly why the gate is the second door.
  ```bash
  git commit -m "feat(build): an app names only an allowed direct dependency — at resolution and at the build's gate alike"
  ```

---

## Task 5: The clients — the knowledge pack, the guide, the mock, an example

**Sitting 4.**

**Files:**
- Modify: `blueprints/node-ts-mongo/agents/AGENTS.md:10-13` — *"To add a dependency, change `package.json`, ask Manifest for the lockfile
  (`resolveDependencies`), and commit both in one commit — never write a lockfile yourself. A name Manifest cannot find does not exist:
  do not try a near spelling."* (and how to read the allowlist: `listAllowedDependencies`); `blueprints/blueprints.test.ts`'s pack assertions if they
  quote the old sentence
- Modify: `docs/api/authoring.md` — a section **Adding a dependency** (the call, the three refusals and what each tells an agent to do,
  committing both files, the network a new package needs); Create: `packages/journey/src/example-dependency.ts` (run against the mock by
  `examples.test.ts`, embedded by `pnpm docs:write`); `packages/journey/src/coverage.ts` (the operation, the agent's)
- Test: `packages/journey/src/examples.test.ts`, the mock's

- [ ] **Step 1: The failing tests**: the example runs against the mock and reaches a commit of both files; the pack's sentence names the
  operation (a test that reads the pack).
- [ ] **Step 2–3: Implement**, `pnpm docs:write`. **Tell the front-end before the commit**: its lead may add a dependency now; the guide
  section; the mock's two answers.
- [ ] **Step 4: Commit**, then the **negative control**: restore the old pack sentence. Predict red: the pack test only.
  ```bash
  git commit -m "docs(api): an agent adds a dependency — the knowledge pack, the guide and an example against the mock"
  ```

---

## Task 6: The acceptance — `make demo-authoring`, extended, and a person clicking it

**Sitting 5. Alone, and last.** *What Rich does* 3 is asked at its open.

**Files:**
- Modify: `packages/journey/src/authoring.ts` — a step after the board is built: the agent adds `marked`, resolves, commits both, builds,
  deploys, and the board renders a note's Markdown; and is refused twice, deterministically on or off the network: a name that cannot exist
  (`manifest-no-such-package-<nonce>`) → `409 DEPENDENCY_NOT_ALLOWED` before any builder; `marked@999.0.0` → `422 DEPENDENCY_NOT_FOUND`
  (its metadata is in the warm mirror, so npm answers `ETARGET` offline too — `[M3]` confirms), each naming the package
- Modify: `infra/dependencies/allowed.txt` — `marked`, with its reason (the acceptance's dependency: Markdown rendering)
- Create: `fixtures/dependency-app/package.json` and `package-lock.json` — **the lockfile `resolveDependencies` answered** for
  `marked@<the version it pinned>`, so `make seed`'s warm loop (`infra/seed/seed.sh:66`) caches `marked` on any machine
- Modify: `scripts/demo-authoring.sh`'s step table if it lists steps; `scripts/offline-acceptance.sh` only if a step's name moves

- [ ] **Step 1: The first resolution of `marked`**, with the network on at Rich's yes; record the version, the day and the lockfile's
  `sha256`; commit the fixture.
- [ ] **Step 2: Green three times on each driver** (fresh, re-use, from `make reset`), every other demo, and `make ci-acceptance`. **And
  `scripts/offline-acceptance.sh` named to Rich as owed**: its step 14 now resolves `marked` from the warm mirror.
- [ ] **Step 3: The negative controls**, one per Review Focus line, each predicted, seen red and restored.
- [ ] **Step 4: The clicked half** (*What Rich does* 4).
- [ ] **Step 5: The plan's one whole-branch review**, beside the Docker tier; one fix wave.
- [ ] **Step 6: Close out**: the ledger, ORIENTATION §7e's next job (the vulnerability database in the console), §8 (FE-32 BUILT), the
  front-end told.

---

## What this plan does not build

- **Other ecosystems.** The recipe is the blueprint's; a second blueprint brings its own (D30). Nothing here is npm's beyond
  `Resolve.tmpl`, `runtime/docker/resolve.ts`'s reading of npm's error lines and the allowlist's one `directDependencies` format.
- **Quarantine-on-first-use** (§12's Phase 4+ alternative).
- **Upgrading a dependency for a vulnerability on the agent's own initiative** — the agent may now do it through this operation; nothing
  prompts it. The vulnerability database in the console is the next plan.
- **A person adding a dependency in the console** — the operation is an agent's and a front-end's; the faculty front-end decides whether a
  person ever sees it.
- **The allowlist's administration screen** — it is a file an administrator edits and a restart, as every platform setting is today; a
  console screen for platform settings is the admin console's (§26), not this plan's.

---

## Asked of Rich

1. **THE ALLOWLIST — ANSWERED 2026-10-03, ~13:43 PDT: *"Yes, in this plan (Recommended)"*.** The question as put: §12 (spec l.1533-1535)
   says dependencies resolve *"through a private registry mirror with an allowlist … v1 picks the allowlist"*; there is none
   (`infra/verdaccio/config.yaml`: `'**': { proxy: npmjs }`), and this plan turns *"add any package"* into an agent's API call. Options were
   (a) build its smallest faithful form here, (b) FE-32 without it, (c) its own plan after. → Task 4 and Spec action C, unconditional.
2. **The sittings** — five, as proposed.
3. **The network at sitting 5** for the acceptance's first resolution of `marked` (*What Rich does* 3) — asked again at that sitting's
   open.

---

## Spec actions — DRAFTED, NONE APPLIED

**Each is Rich's to read and decide; `manifest-94` applies an approved one.** The four shared HTML pages are checked with each.

### A. §11 and §12 — the driver resolves an app's dependencies (before sitting 2)

**Why.** FE-32 (a) needs the platform to resolve a lockfile, and §11 says the `Driver` is *"everything the control plane may ask of
infrastructure, and nothing more"*: resolution runs in the builder, so the interface gains it.

**Proposed.**
1. **§11, the `Driver` interface**: after `buildImage(src: SourceRef, spec: AppSpec): Promise<ImageRef>`, add
   `resolveDependencies(src: DependencySource, spec: AppSpec): Promise<Lockfile>   // through the mirror, in the builder — runs nothing`.
2. **§12, *Supply chain***, the bullet *"committed lockfiles are required; builds fail without one"* ⟶ *"committed lockfiles are required;
   builds fail without one. **An agent obtains one from Manifest**: it sends the manifest it wants, and Manifest resolves the lockfile
   through the mirror, in the same network-restricted builder, with install scripts disabled, keeping every pin the committed lockfile
   already holds, and answers it for the agent to commit — it never writes one by hand"*.

*Shared pages:* `manifest-decisions.html` (D13, D24 if it lists what a token may do) and `manifest-stories.html` (an agent's day that
adds a package) — check; likely unchanged.

### B. §25 — a blueprint declares how its apps' dependencies are resolved (before sitting 2)

**Proposed.** In the descriptor example, after `dockerfile: ./Dockerfile.tmpl`:

```yaml
dependencies:                     # how an app's dependencies are declared and resolved
  manifest: package.json
  lockfile: package-lock.json     # committed; the build fails without one (§12)
  resolve: ./Resolve.tmpl         # blueprint-managed, as the Dockerfile is (D13)
```

and a sentence after the example: *"**The platform names no package manager**: the build's lockfile gate reads `dependencies.lockfile`,
and resolving a lockfile builds `dependencies.resolve` in the network-restricted builder."*

*Shared pages:* none names the descriptor's fields — check.

### C. §12 and §26 — the allowlist made concrete (before Task 4; the allowlist itself is Rich's *"Yes, in this plan"*)

**Proposed.**
1. **§12, *Supply chain***, the first bullet ⟶ *"dependencies resolve through a private registry mirror, and **an app names as a direct
   dependency only a package on the platform's allowlist** — a platform setting (§26) administrators keep, to which every listed blueprint's
   own dependencies always belong; what an allowed package depends on comes with it. Resolving a lockfile and the build's lockfile gate
   both refuse an unlisted one, naming it. (Quarantine-on-first-use is the Phase 4+ alternative; v1 picks the allowlist, because two
   mechanisms would be built and neither finished.)"*
2. **§26, *Platform settings***: after *"…and the platform's monthly intake budget."* add *"And **the dependency allowlist** (§12)."*

*Shared pages:* `manifest-decisions.html` if it describes the supply chain; `manifest-schematic.html`'s supply-chain line — check.

---

## What the self-review caught

1. **A resolver on the host would have broken D30 and §12 at once** — the first sketch ran `npm install --package-lock-only` in a temp
   directory: npm in the control plane, the public registry reachable with the network up, and no tarball cached, so the build after it
   would fail offline (`infra/seed/seed.sh:48-52` measured exactly that). Decisions 3 and 4.
2. **The driver already names a Node file** (`runtime/docker/driver.ts:296-299`). Decision 9 removes it rather than adding a second.
3. **Adding a package re-resolved the whole tree** in the first sketch (no base lockfile in the request). Decision 2 reads the committed
   one; Review Focus 2 holds it.
4. **Review Focus 4's postinstall test would have left a package in the platform's mirror for ever.** `[M4]` measures unpublish on a
   throwaway first, and the Docker case unpublishes in its `finally`.

5. **The allowlist changes which refusal a hallucinated name meets** (found when Rich chose it): `409 DEPENDENCY_NOT_ALLOWED` before any
   builder, not `DEPENDENCY_NOT_FOUND` after the mirror asked npm. Review Focus 1, Decision 5 and Task 6's refusal step were rewritten so
   each code is reached by the input that really reaches it — and the acceptance's two refusals no longer depend on the network.

---

## What executing this plan found

*(One dated section per sitting.)*
