# Orientation — read this first

**You are picking up a project whose design is finished and whose first FOUR
implementation plans are executed — P1, P2, P3 and, since 2026-09-09, all 15 tasks
of P4a. §16's proof app signs a real person in with CWL and keeps their data theirs.
The next work is P4b — 16 tasks, written and unrun — starting with its own Task 1,
which is a reconciliation pass against the executed P4a.** This is the single
entry point: what Manifest is, what has been established, what the machine will do to
you, and what to do next. It is written for someone with **no prior context** —
a new agent with a fresh window, or a developer joining.

*Last verified 2026-09-09.* Two things in this file state current status and will go
stale: §2 and §7. **The roadmap's ledger outranks both** — it is the maintained
record. Everything else here is durable.

---

## 1. What Manifest is, in four sentences

Manifest is a self-hosted internal developer platform for UBC. A faculty member
describes an application in plain language, an AI agent builds it, and Manifest
deploys it — authenticated with UBC's CWL single sign-on, running on UBC
infrastructure — without the faculty member ever seeing a container or a YAML file.

The design is **approved and complete**. The whole platform must run on one laptop,
offline after a one-time seeding step, and that constraint (**C1**) shapes almost
everything.

---

## 2. Where things stand

**Five spikes are done. P1, P2, P3 AND P4a are executed.** The platform runs offline,
the control plane serves HTTP on 7100 with the real Docker driver, `make demo` takes an
application from a bare git repository to a healthy `https://…manifest.internal` URL,
and **`make demo-identity` takes §16's proof app from a bare repository to a real CWL
sign-in in which the instructor cannot see the student's note.**

**P4a IS EXECUTED AND GREEN — all 15 tasks, finished 2026-09-09**, in seven agreed
sittings of one session each. **START P4b, AT ITS TASK 1** — §7d-2 tells you where.
Its Task 1 is a reconciliation pass against the P4a that has now run, and **P4b is
split into TEN agreed sittings** (Rich, 2026-09-09), the same one-per-session pattern
with a check-in at each boundary. *(Sittings pace execution. They are **not** §17's
product Phases — the roadmap's "Phase 2" is six unwritten plans.)*

**One thing is outstanding and it is RICH'S to run: the offline acceptance.** Turning
the network off from a tool call cuts the agent off too, so
`scripts/offline-acceptance.sh` is run by hand; it gained a step 6 that runs
`make demo-identity`, which is the step most likely to need a route out — it builds
from `node-ts-mongo@1`'s five app-side dependencies through Verdaccio *and* completes a
SAML round trip. **A skipped acceptance is not a passed one.**

**The identity half of the platform now works, and it did not before.** A real CWL
login completes end to end — an app redirects to the Manifest IdP, a test user
authenticates, the IdP releases exactly the attributes the SP row declares named by
OID, and `passport-ubcshib` maps them back so the app reads `ubcEduCwlPuid`. **Since
Task 14, MANIFEST'S OWN users log in the same way** — §9's first sentence is that
Manifest is itself an SP — through a Service Provider row the control plane registers
at its own boot, and `POST /auth/dev-login`, an unauthenticated route that minted real
sessions, is deleted. Before
Task 1 the IdP could not issue an assertion **and** could not authenticate anybody,
with `make verify` reporting 34/0 throughout. **Since Task 7 that login also runs
through a row `sso/` itself renders**, with the AuthnRequest signed by a per-app
RSA-4096 key the platform minted and stored — and it is refused when the row pins a
different certificate, and refused again when the app does not sign at all.

**Executing the fifteen found 80 defects.** Four were bigger than the plan — the first
two came out of Tasks 1–3, the third out of Task 5, the fourth out of Task 8:

- **§12's dependency-scan gate blocked every CWL application.** `passport-ubcshib`
  depends on a deprecated `passport-saml` carrying a critical signature-verification
  advisory with no fix. §12's unwaivable gate and C6's "a library change is never a
  prerequisite" could not both hold. **Rich settled it on 2026-09-08:** block on a
  Critical/High **that has a published fix**, record the rest. See §8.
- **§8's `SAML_IDP_CERT_PATH` named a file nothing could create.** `InstanceSpec` had
  no way to put a file in a container, so Task 11 would have injected a path that does
  not exist. `InstanceSpec.files` now exists — see §4.
- **`ServiceBinding.credentials` was required by Task 5 and filled by nobody until
  Task 9.** `deployRelease` builds that binding today, so following the plan literally
  breaks every deploy for four tasks — a contract field with no producer, which is
  `MONGODB_DB_NAME`'s shape exactly. Task 9's `deps` parameter was pulled forward
  carrying `{ secrets }`; **Task 9 is now smaller, not larger.**

| | State |
|---|---|
| **Spikes** | S7, S2, S1, S3 — **all four answered yes**, each far inside its timebox. Their spec changes are applied. **S6 has since run too, as P3's Task 18, 2026-09-07: every probe denied, every denial paired with a positive control, and one result BETTER than the spec** — §21's divergence 8 no longer holds, because app networks are `--internal` and the developer's machine is unroutable rather than merely policed. S5 and S4 are deliberately later (S5 follows S6, S4 precedes Phase 4). **Nothing is waiting on a spike.** |
| **Plans** | **P1, P2, P3 AND P4a ARE ALL EXECUTED — P4a IN FULL ON 2026-09-09. P4b IS WRITTEN AND UNRUN, AND IS NEXT.** P1 (13 tasks) and P2 (21 tasks) on 2026-09-05; **P3 (19 tasks) on 2026-09-07**. **P0** (spike briefs) is written. Executing them found **152 defects** in plans that had all been self-reviewed first — P1 18, P2 52, **P3 82 across five sessions, 4.3 per task**, the highest rate measured here. P3's own self-review found seven, the worst being that **nothing wired the Docker driver into the boot entry point**, so its `make demo` would have passed against the fake driver; P2's execution hit that same defect in P2, and **P3's execution hit a third instance of it** — `waitForReady` and `edgeProbe` were built in Task 14 and nothing called them until Task 17. **P4a's fifteen tasks found 80 defects — 5.3 per task, the highest rate measured here, in the plan that had the most research behind it.** Two were spec-level and are in §8. **P4b (16 tasks) is now the current work.** P5 is unwritten — see §7. **The unrun stack is 16 tasks**, which is what the 2026-09-04 decision existed to avoid; it is recorded rather than glossed. |
| **Code** | **The platform runs, and so does the control plane.** P1 shipped `Makefile`, `infra/` and `scripts/`: split-horizon DNS, the custom `xcaddy` edge, Postgres with three databases, registry, Verdaccio, a native egress proxy, rootless BuildKit, LiteLLM and the Manifest IdP — `make seed / up / down / reset / doctor / verify`. P2 then shipped the whole control plane: `spec/`, `blueprints/`, `db/`, `errors/`, `runtime/`, `source/`, `identity/`, `projects/`, `releases/` and `api/` — a Fastify server on **7100** with D23.6 idempotency, the D23.7 error envelope, the §13 capability model and the §16 authorization contract suite, and the full lifecycle runs in **~300 ms** against the fake driver. **P3 has since added `runtime/docker/` (fourteen files: the Engine API client, the `mf-` naming scheme, §12's hardening, per-app networks, the forced egress proxy, `services/`, the instance lifecycle, log demux and exec, the registry token issuer, the ephemeral builder), `services/`, `build/` and `api/routes/registry-token.ts`.** **The numbers are in the box below** — this row used to restate them and drifted by four releases.  **P4a Tasks 1–3 then added `sso/`'s test surface and login suite, `runtime/docker/archive.ts`, `infra/idp/metadata/saml20-idp-hosted.php`, `infra/idp/attributemap/ubcoid.php`, three new `infra/lib/ensure-*.sh` scripts wired into `make up`, and `fixtures/saml-sp/`; Tasks 4–5 added `secrets/`; Tasks 6–7 added `sso/`'s production half — `keypair.ts`, `entity.ts`, `metadata-store.ts`, `registration.ts` — plus `MANIFEST_IDP_DATABASE_URL` and `MANIFEST_SP_ENTITY_BASE` in `config.ts`; and Tasks 8–9 added `observability/` (`events.ts`, `redact.ts`), the `audit` schema and its migration, `infra/lib/ensure-app-role.sh` and the `manifest_app` role the control plane now connects as, and `sso`'s wire into `DeployDeps`, `ServerDeps` and boot. **Tasks 10–11 added `spec/injection.ts` — §8's table as data and the one renderer of every variable an app receives — plus `config.idp`, `secrets/`'s `ensureSessionSecret`, `SsoRegistrar.idpSigningCertificate()`, `ai` on `ResolvedConfig`, and the reserved-name check in `spec/policy.ts`. `deployRelease`'s ad-hoc env block is gone. Tasks 12–13 added `blueprints/node-ts-mongo/` — the descriptor, the Dockerfile, the skeleton with its auth component and §9's attribute bridge, and the D25 knowledge pack — plus `spec/injection-drift.test.ts` (§16's drift tier, reading the blueprint's source), `runtime/docker/node-ts-mongo.docker.test.ts` and `blueprints/attribute-bridge.test.ts`. Task 14 added `identity/saml.ts` — the control plane's own SAML SP, on `@node-saml/node-saml` rather than the `passport-saml` the blueprint pins — `identity/testing.ts` (an in-process SAML IdP and `testSessionCookie`), `identity/saml.docker.test.ts`, `sso/platform.ts` and `infra/lib/ensure-cp-sp-keypair.sh`, and DELETED `identity/dev-auth.ts` and its test.**|
| **Spec** | Current, with **one approved change not yet written into it**: §12's scan gate blocks only on findings that have a published fix (Rich, 2026-09-08 — §8). Every spike's actions have been applied with Rich's explicit approval, and P2 raised a fifth change — the §11/§23 hostname disagreement, settled 2026-08-31. **Trust the spec over the spike briefs**, which are deliberately preserved as a record of what was originally asked. |

**The four numbers you will check first, measured 2026-09-09 on this machine:**

| | |
|---|---|
| `pnpm test` (from the **repo root**) | **525 passed, 56 files**, ~26 s, no Docker needed except Postgres for the `db/`, `api/`, `secrets/`, `services/`, `sso/`, `observability/` and `releases/` suites — plus **`spec/injection-drift`**, which reads the pinned `passport-ubcshib` tarball out of the platform's own mirror. It connects as **`manifest_app`**, not as `manifest` — see §7d |
| `pnpm test:docker` | **116 passed, 22 files**, ~370 s — needs `make up`, and **fails rather than skips** when asked to run |
| `make doctor` | **17 checks, 0 failed, 0 warnings** — 17 since 2026-09-09, when the host-tool check landed |
| `make verify` | **47 checks, 0 failed, 0 warnings** — thirteen more than P3 left; the newest asserts the control plane's OWN SP keypair is a usable pair, because it is a `make up` artefact the process refuses to boot without and a half-minted one is a platform that does not start |

**A different number on a clean checkout is signal, not noise** — it means something
moved, and finding out what is cheaper before you start than after. **This box is the
only current one.** §7a and §7c carry the same four numbers as P1's and P3's completion
records, and they are DATED measurements that deliberately do not move — if any of them
disagrees with this box, this box wins.

The immediate work is **P4a, from Task 15** — see §7d. Its Tasks 1–14 are done: the IdP
works, `secrets/` holds every credential, `sso/` generates the registration a CWL login
runs through and `deployRelease` calls it, §20's audit log is append-only against a
role that can actually be constrained, §8's injection contract is one function with
one producer — `MONGODB_DB_NAME` reached a deployed container for the first time on
2026-09-09 — and **`node-ts-mongo@1`, the blueprint faculty applications are generated
from, has been built, deployed and made to issue a real AuthnRequest**, and
**Manifest itself now logs its users in with CWL — the dev shim is gone**. **`make verify`
grew from 34 checks to 47** since
P3, and every one of the new ones asserts something that completes an operation rather
than starting it — this project's most-repeated lesson, and the shape of three separate
defects in that session alone.

---

## 3. The document map

Read for your purpose, not front to back. The spec is ~2,340 lines; nobody reads it all.

| You are… | Read |
|---|---|
| **new, any role** | This file. Then the roadmap's *Spike status* ledger and *Lessons*. |
| **executing a plan** | ← **this is the current job: P4b, FROM TASK 1.** [`plans/2026-09-07-p4b-ai-events-streaming-incidents.md`](plans/2026-09-07-p4b-ai-events-streaming-incidents.md) — 16 tasks, **none executed**, in **ten agreed sittings, one per session**; its Task 1 reconciles it against the P4a that has now run. P4a itself is [`2026-09-07-p4a-identity-secrets-injection.md`](plans/2026-09-07-p4a-identity-secrets-injection.md) — 15 tasks, **all executed, 2026-09-09**, self-contained by construction — if it is not, that is a defect in the plan, so fix it there as you go. **Read P4a's own *What executing this plan found* first — Sessions 1 to 9, 80 defects — and then P3's**, especially Sessions 4 and 5: between them they establish that no build and then no deploy had ever succeeded, both invisible behind a green suite. |
| **writing a plan** | **P5 is next, after P4a and P4b execute.** House style: `plans/2026-08-30-p1-local-substrate.md`, `2026-08-29-p2-control-plane-spine.md`, or either half of P4. |
| **running the platform** | [`RUNBOOK.md`](RUNBOOK.md). `make seed && make host-setup && make up`. |
| **writing code** | Sixteen modules exist: `spec/`, `blueprints/`, `db/`, `errors/`, `runtime/` (with `runtime/docker/`), `source/`, `identity/`, `projects/`, `releases/`, `api/`, P3's `services/`, `build/` and `routing/`, and P4a's `secrets/`, `sso/` and `observability/`. Read `runtime/driver.ts` and `runtime/driver-contract.ts` first — everything else is built against them — then `runtime/docker/driver.ts`, which is the one implementation of that interface and where every P3 module meets; then `api/server.ts` for how a request becomes an actor, and `projects/authz.ts` for the one function every route's security depends on. **Then run `make demo` once**: it is the only thing that exercises all of it through the real HTTP surface, and it is where the last four sessions' worst defects were found. |
| **changing the spec** | Don't, without asking. It is marked *Approved design*. Record the proposed change and Rich decides — that has been the pattern five times. |

```
docs/
├── external-track.md       the UBC IAM / PIA work that runs in parallel
│                           (NOTE: docs/, not docs/superpowers/)
docs/superpowers/
├── ORIENTATION.md          ← you are here
├── RUNBOOK.md              HOW TO RUN THE PLATFORM. Start here to use it.
├── specs/
│   ├── 2026-08-29-manifest-platform-design.md    AUTHORITATIVE. 27 sections.
│   └── manifest-*.html                            plain-language versions for
│                                                  non-engineers; markdown wins
├── plans/
│   ├── 2026-08-29-plan-roadmap.md                 THE LEDGER. Status lives here.
│   ├── 2026-08-29-phase-0-spike-briefs.md         P0. Historical record.
│   ├── 2026-08-29-p2-control-plane-spine.md       P2. 21 tasks, ALL EXECUTED.
│   ├── 2026-08-30-p1-local-substrate.md           P1. 13 tasks, ALL EXECUTED.
│   ├── 2026-08-31-p3-docker-driver-deploy-spine.md
│                                                  P3. 19 tasks, ALL EXECUTED
│                                                  2026-09-07. S6 ran as Task 18.
│                                                  Proposed six spec actions; all
│                                                  APPLIED 2026-09-07.
│   └── 2026-09-07-p4a-identity-secrets-injection.md
│                                                  P4a. 15 tasks, ALL EXECUTED
│                                                  2026-09-09. Its 'What executing
│                                                  this plan found' carries 80
│                                                  defects across nine sessions —
│                                                  read it before P4b.
│   └── 2026-09-07-p4b-ai-events-streaming-incidents.md
│                                                  P4b. 16 tasks, WRITTEN AND UNRUN,
│                                                  in TEN AGREED SITTINGS (table at
│                                                  the top of the plan).
│                                                  ← START HERE, AT TASK 1, which
│                                                  reconciles against the executed
│                                                  P4a. Records ten more measured
│                                                  facts, one of them a §10
│                                                  requirement LiteLLM 1.98.0
│                                                  cannot satisfy.
└── spikes/
    ├── S7-findings.md  DNS, the edge, TLS       ← P1's content
    ├── S2-findings.md  SimpleSAMLphp metadata   ← P4's shape
    ├── S1-findings.md  Docker round-trip        ← P3's content
    ├── S3-findings.md  LiteLLM, Ollama, budgets ← P4's AI half
    ├── S1-controls-settled.md  the two controls S1 left to P3, probed
    │                           2026-08-31 before P3 was written. Scoped
    │                           registry tokens work; the builder's bounds
    │                           are three mechanisms and one of them
    │                           does not exist.
    ├── START-HERE.md   the ORIGINAL spike briefing. Historical; §6 is wrong.
    └── HANDOFF-2026-08-3*.md  dated handoffs. BOTH SUPERSEDED by this file.
                               Kept as a record; do not act on either.
```

**And the code.** P1 added the whole `infra/` and `scripts/` tree on 2026-09-05 —
`Makefile`, `infra/compose.yaml` and the ten platform services, `scripts/doctor.sh`
and `scripts/verify.sh`. Below is the TypeScript tree as of 2026-09-05, after **all
21 of P2's tasks**:

```
.nvmrc  package.json  pnpm-workspace.yaml  tsconfig.base.json
eslint.config.js  vitest.workspace.ts          the workspace (P2 Task 1)
vitest.config.ts                               ROOT: fileParallelism: false. It is a
                                               root-level option and does nothing in
                                               the package config          (Task 18)
.prettierrc  .prettierignore                   Prettier owns packages/ ONLY —
                                               without the ignore, `pnpm format`
                                               rewrites the approved spec
blueprints/fixture-node/                       P2's minimal blueprint   (Task 7)
    blueprint.yaml  Dockerfile.tmpl  skeleton/  agents/
blueprints/node-ts-mongo/                      P4a Task 12. THE blueprint faculty
    blueprint.yaml  Dockerfile.tmpl  .npmrc     applications are generated from.
    skeleton/{server.js,package.json,           §20's "security multiplier": its auth
      package-lock.json,auth/{ubcshib.js,       component is written once and
      attributes.js}}                          inherited by every app. Built,
    agents/AGENTS.md                           deployed and made to issue a real
                                               AuthnRequest — see the docker test
packages/control-plane/
├── drizzle/0000_*.sql .. 0004   migrations, all applied. 0004 is P4a Task 8's:
│                                the `audit` schema, `events`, and the two grants
│                                that are §20's whole control
├── drizzle.config.ts
├── vitest.config.ts             setupFiles + globalSetup
├── vitest.env.ts                ensureDatabaseUrls() — .env → the THREE urls: the
│                                app role, the admin role and the IdP database
├── vitest.setup.ts              per file; calls it
├── vitest.global-setup.ts       ONCE per run: truncates the §6 tables, so a run
│                                never inherits the last one's rows   (Task 18)
└── src/
    ├── index.ts                 BOOT. loadConfig, buildServer, listen 7100 (Task 17)
    ├── config.ts                env parsing + the dev-auth kill switch    (Task 12)
    ├── module-boundaries.test.ts   the §5 rule, enforced by a test that resolves
    │                               imports and compares modules. THE enforcement —
    │                               the ESLint rule was removed, see Task 17's notes
    ├── lifecycle.test.ts        P2's acceptance: the whole journey, ~300ms (Task 21)
    ├── errors/index.ts          ManifestError + ManifestValidationError   (Task 3)
    ├── spec/
    │   ├── schema.ts            the §7 v1 zod schema                      (Task 2)
    │   ├── errors.ts            zod issue → stable code + hint            (Task 3)
    │   ├── policy.ts            catalogues, whitelist, quota, D17         (Task 4)
    │   ├── diff.ts              isSensitiveDiff, the D9 gate              (Task 5)
    │   ├── resolve.ts           §7's THREE-layer override merge          (Task 16)
    │   └── index.ts             THE module's public surface
    ├── blueprints/
    │   ├── descriptor.ts        §25 blueprint.yaml schema                 (Task 6)
    │   ├── compatibility.ts     checkBlueprintCompatibility — called from the
    │   │                        build route, not at validation time      (Task 19)
    │   ├── registry.ts          load, resolve name@major                  (Task 6)
    │   └── index.ts
    ├── db/
    │   ├── schema.ts            the ten §6 tables P2 writes               (Task 8)
    │   ├── client.ts            Drizzle over pg, from MANIFEST_DATABASE_URL
    │   ├── testing.ts           withRollback, AND resetDatabase — the second
    │   │                        because withRollback does not isolate you from
    │   │                        rows somebody else COMMITTED             (Task 18)
    │   └── index.ts
    ├── runtime/
    │   ├── driver.ts            the §11 Driver interface                  (Task 9)
    │   ├── fake-driver.ts       in-memory implementation                  (Task 9)
    │   ├── driver-contract.ts   THE SHARED SUITE P3 IMPORTS UNCHANGED    (Task 10)
    │   ├── state-machine.ts     §11 transitions + IDLE_POLICY            (Task 11)
    │   └── *.test.ts
    ├── source/                  D5 driver 1: bare repos on disk          (Task 15)
    │   ├── git-driver.ts        the provider interface driver 2 replaces
    │   ├── local-driver.ts      ~130ms per createRepository — seven git calls
    │   └── index.ts
    ├── identity/                roadmap gap 3, CLOSED by P4a Task 14
    │   ├── session.ts           signed, expiring cookies; no sessions table
    │   ├── saml.ts              THE CONTROL PLANE'S OWN SP (§9). node-saml, not
    │   │                        the passport-saml the blueprint pins — see §7d
    │   ├── testing.ts           testSessionCookie + an in-process SAML IdP that
    │   │                        signs what a real one never will
    │   └── index.ts             (dev-auth.ts DELETED — it was the bypass)
    ├── projects/
    │   ├── authz.ts             §13 capabilities; stranger → NOT_FOUND,  (Task 14)
    │   │                        member-without-capability → FORBIDDEN
    │   ├── repository.ts        createProject + all three environments at once
    │   └── index.ts
    ├── releases/                §5's build/ lives in here for P2         (Task 16)
    │   ├── build.ts             a failed build is a ROW, not an exception
    │   ├── release.ts           immutable releases; deploy waits for health
    │   └── index.ts
    ├── routing/                 P3 Tasks 13-14. §23 hostnames -> Caddy routes
    │   ├── hostnames.ts         listenerFor, routeIdFor
    │   ├── caddy.ts             the admin client. node:http, NOT fetch — Caddy
    │   │                        refuses any request carrying an Origin header
    │   ├── routes.ts            applyRoute / removeRoute / reapplyAllRoutes
    │   └── readiness.ts         waitForReady + edgeProbe, which runs FROM a
    │                            container, over HTTPS, with the platform CA.
    │                            CALLED BY DockerDriver.ensureInstance — it was
    │                            called by nothing at all until Task 17
    ├── build/                   P3. source+spec -> digest, with §12's gates
    │   ├── context.ts           assembleContext. TWO processes, never a pipe:
    │   │                        `git archive | tar` takes tar's exit status
    │   ├── gates.ts             secret + lockfile, platform-mandatory
    │   └── scan.ts              Syft SBOM, Grype, the staleness rule
    ├── services/                P3. dedicated Mongo per app+environment (D3)
    ├── secrets/                 P4a Tasks 4-5. libsodium envelope encryption over
    │                            a Postgres table, plus the boot process.env scrub
    ├── sso/                     P4a Tasks 6-7. D15 entity derivation, per-app
    │                            RSA-4096 keypairs, the manifest_idp metadata
    │                            store, registerServiceProvider. Called by
    │                            releases/ since Task 9
    ├── observability/           P4a Task 8
    │   ├── events.ts            recordEvent — the redactor is a PARAMETER, so no
    │   │                        path can write an unredacted row (§14)
    │   └── redact.ts            exact-match only (Decision 11), longest first
    └── api/
        ├── server.ts            Fastify, session hook, idempotency hook  (Task 17)
        ├── errors.ts            the D23.7 envelope — every failure exits here
        ├── idempotency.ts       D23.6; replay same body, 409 on a different one
        ├── testing.ts           testDeps — blueprints resolved from import.meta.url
        ├── authz-contract.ts    THE SHARED SUITE P3 IMPORTS UNCHANGED    (Task 20)
        ├── routes/auth.ts       dev login, me, logout
        ├── routes/projects.ts   projects, members, and POST .../spec — the ONLY
        │                        way a project's manifest.yaml can change after
        │                        creation, and isSensitiveDiff's one call site
        ├── routes/delivery.ts   builds, releases, deploy, environments   (Task 19)
        └── index.ts
```

Plus, from P3: `fixtures/fixture-app/` (the build target — `server.js` at the tree
root, because the blueprint's `CMD` is not templated), `scripts/demo.sh`, and
`src/runtime/docker/{roundtrip,s6}.docker.test.ts`, which are the two suites that
exercise the whole thing rather than a part of it.

`pnpm test` → the count in §2's box, **run from the repo root** (`pnpm test`,
not `pnpm --filter … test` — the two set a different working directory, and that
difference was a defect). Everything that touches `src/db/`, `src/api/`, `src/secrets/`,
`src/sso/`, `src/observability/`, `src/services/` or `src/releases/` needs `make up`;
the rest needs no Docker, no Postgres and no network. **All three connection strings are
derived from `.env` automatically** by `vitest.env.ts`, and the suite connects as
`manifest_app` — the least-privilege role — not as `manifest`.

Also `pnpm lint`, `pnpm --filter @manifest/control-plane typecheck` and
`pnpm format:check`. **All four must be clean before you commit, and the last two are
not formalities** — Vitest strips types without checking them, so `tsc` is the only
gate that sees a whole class of error (it caught six in P2), and `format:check` was
silently red on 29 files. **Run `pnpm test` twice:** a suite that is not repeatable
has a state leak, which is how five of P2's defects were found.

**Which spec sections matter, by topic:** §7 the `manifest.yaml` contract · §9 identity ·
§10 AI access · §11 execution model and the `Driver` interface · §12 networking,
secrets, the builder, supply chain · §13 releases · §16 testing tiers · §20 security
architecture · §21 local topology · §22 the public API · §23 hostnames · §25
blueprints. Decisions are **D1–D32** in §4; constraints **C1–C6** in §3.

---

## 4. The machine, and what it will do to you

**This section is the one that saves you a morning.** Every item was paid for by a
spike. It was previously stranded inside a superseded handoff; it lives here now.

### Laravel Valet owns things you will want

- **Valet owns the `.test` TLD, port 53, and ports 80 and 443.** A Homebrew dnsmasq
  2.91 runs as `nobody` on `127.0.0.1:53` answering `address=/.test/127.0.0.1`, and
  the nginx on 80/443 is Valet's. **Never touch any of it** — Rich needs it, and
  other UBC developers run it too.
- **This is why the zone is `*.manifest.internal`**, not `*.manifest.test`. ICANN
  reserved `.internal` in July 2024 for exactly this.
- **The resolver file is scoped to `manifest.internal`, never all of `.internal`** —
  Docker's own `host.docker.internal` lives in that TLD.
- **Caddy binds `127.0.0.2`**, a loopback alias, so Valet keeps `127.0.0.1:443`. The
  alias **does not survive a reboot**; `can't assign requested address` means it is
  gone.

### The toolchain, and what executing P2 put on this machine

- **Node is 24, not 22.** nvm has only `v24.12.0`; there is no Node 22 on this
  machine. P2's plan originally pinned 22 for no reason that survived checking — the
  spec names no Node version, no spike treated it as a variable, and the only evidence
  was `passport-ubcshib`'s `">=22.0.0"`, which is a floor. **Repinned to 24**
  (2026-08-31, Rich's call). Nothing was tried on 24 and found wanting.
- **The app-side base image is still `node:22-alpine`** and is a *separate* decision:
  it is what faculty apps run in, S1 recorded its digest and mirrored it into the
  local registry, and P1 references it in three places including the offline test.
- **`pnpm` was added via `corepack enable pnpm`** — pnpm 11.24.0, a shim in
  `~/.nvm/versions/node/v24.12.0/bin/`. User-owned, **no `sudo`**, reversible with
  `corepack disable pnpm`. This is the only host change P2's execution made.
- **pnpm 11 blocks dependency install scripts by default**, as a hard error, so
  `pnpm test` will not run until they are allowed. The key is `allowBuilds` in
  `pnpm-workspace.yaml`; pnpm 10's `onlyBuiltDependencies` is still *read back* by
  `pnpm config get` but has no effect, which makes hand-writing it look like a
  mystery. Use `pnpm approve-builds <pkg>`.

### What is a container, and what is actually on this machine

**Almost nothing Manifest runs is installed on the Mac.** This is worth stating
plainly because every list of "absent" images in this project reads like a missing
dependency and is not one. §21's inventory is the authority; this is its summary.

**Host-resident, and only these:**

| | Why it cannot be a container |
|---|---|
| **Ollama** | Metal GPU access is unavailable from a container |
| **The control plane** (Node, 7100) | It needs the Docker socket, which §12 forbids mounting into *workload* containers. Running it on the host sidesteps the question and iterates faster. It **cannot reach container IPs** on Docker Desktop (S1), so health checks go through the edge or a published port |
| **Admin UI (7101), `manifest-mock` (7102), reference console (7104)** | Vite dev servers |

**Everything else is a container**: Caddy, Postgres, the registry, Verdaccio,
LiteLLM, the Manifest IdP, both dnsmasq processes, the egress proxy, the builder, and
the Syft/Grype scanners. So:

- **Caddy is never `brew install`ed.** It is a **custom `xcaddy` build** (§20), because
  S7 established that **Coraza pins the Caddy version**. `make seed` builds that image.
  `caddy: ABSENT` from a host-tool check means nothing at all.
- **Syft and Grype are transient per build** (§21: *"Scanner + SBOM — transient, per
  build"*). P3 Task 12 runs each as a throwaway container against the Docker socket.
- **The Manifest IdP is ours and is built from scratch** — `infra/idp/Dockerfile`,
  `FROM php:8.3-apache` plus `composer create-project simplesamlphp/simplesamlphp:^2.0`,
  its own `manifest_idp` database, on **port 7122 deliberately not 6122**. It has **no
  dependency on `/Users/rich/Developer/docker-simple-saml`** running, or existing.
  That repository is read-only to us and stays clean; what S2 took from it was
  knowledge — `pdo_pgsql` needs `libpq-dev`, `database.*` and `store.sql.*` are
  different subsystems, one `INSERT` into `saml20_sp_remote` registers an SP — not code.

**The images `make seed` must therefore fetch or build include** `caddy:2.11.4` and
its builder, `anchore/syft`, `anchore/grype`, `php:8.3-apache` and `composer:2` —
none of which are on this machine today. Seed is the one step that needs the network,
which is why P1's **offline** acceptance can only run after a successful seed.

### Rules of engagement

- **`sudo` cannot prompt from a tool call.** You get
  `sudo: a terminal is required to read the password`. Bundle privileged steps into
  one script and ask Rich to run `! sudo bash <path>` in his terminal. **Ask before
  anything needing `sudo`** — standing instruction.
- **The machine must end up exactly as it started.** Snapshot before you change
  anything. Every spike has met this bar and Rich has confirmed each teardown.
- **Pre-existing containers that must survive**: `docker-simple-saml-saml-idp-1`,
  `qdrant-local-dev`, `mongodb`, `mongo-express`.
- **Work on a copy.** `docker-simple-saml` and `ubc-genai-toolkit` are read-only to
  you unless told otherwise; both are currently clean and must stay that way.

### Numbers

- Ports in use by other things: **6122** (`docker-simple-saml`), **27017** (mongodb),
  **6333/6334** (qdrant), **8081** (mongo-express), **11434** (Ollama), plus 80/443/53.
  The **7100–7199** block was entirely free.
- Docker VM memory is **8.32 GB decimal / 7.75 GiB binary** — passes or fails §21's
  "≥8 GB" floor *depending on the unit*, which is why the spec now states the unit.
- Host: 36 GiB RAM, 12 cores, ~163 GiB free. **macOS 26.6.2 (build 25G83)** — the
  machine was updated; §4 said 26.5.2 until 2026-09-04. arm64, Docker Engine 29.7.2,
  which serves **API 1.55, minimum 1.40** (so P3's deliberate `v1.44` pin is inside
  the window).
- **macOS ships bash 3.2 and a BSD userland.** No associative arrays, no `mapfile`,
  no `xargs -r`, no `readlink -f`. A script that needs Homebrew bash 5 is a C1 defect.

### Things that will cost you a morning

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
  tests and have four `tsc` errors. `pnpm --filter @manifest/control-plane typecheck`
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
  It also means running the suite wipes whatever `make demo` created.
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
  mirror and a warm one behave identically right up until C1 matters.
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

### Images already pulled

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
place**: `/etc/resolver/manifest.internal`, the `127.0.0.2` alias on `lo0`, and the
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

---

## 5. What the spikes established

Read the findings note before touching the area it covers. Do not re-derive any of it.

| Spike | Answer | What it settles |
|---|---|---|
| **S7** ~1.5 h of 3 days | **Yes**, with a zone change | Split-horizon DNS works via two dnsmasq processes. `.test` is unusable (Valet). Trust is needed in **three** places — macOS keychain, container trust stores, **and host Node processes**, because Node ignores the keychain. The custom `xcaddy` build works; **Coraza pins the Caddy version**. |
| **S2** ~0.5 h of 2 days | **Yes** | One `INSERT` into `saml20_sp_remote` registers a working SP on the next HTTP request — no file write, no reload, no restart, no cache TTL. **Manifest writes no PHP.** Attribute release fails **open**: a row with an empty `attributes` list releases everything. `pdo_pgsql` also needs `libpq-dev`. `database.*` and `store.sql.*` are different subsystems. |
| **S1** ~2 h of 3 days | **Yes** | A bare repo drives to a routed healthy container with a bound database, and **§11's `Driver` interface needed no revision**. Rootless BuildKit works — but *not* via buildx's own driver, which wraps it in a `--privileged` container. **Offline builds need base images pushed into the local registry**, not merely pulled. |
| **S3** ~2 h of 2 days | **Yes**, with three corrections | LiteLLM does everything §10 assumes and `ubc-genai-toolkit` needs no change. But **three defaults are wrong and all three fail silently** — see below. |

**S3's three, because they are the ones most likely to be forgotten:**

1. **Every key needs `allowed_routes`.** Otherwise an app key whose user came from
   `/user/new` can mint a child key **that survives revocation of its parent**.
2. **Every `embed()` needs `encoding_format: 'float'`.** Otherwise the OpenAI SDK's
   base64 default meets LiteLLM's Ollama path and you get **192 near-zero values
   where 768 floats belong** — no error, every other assertion green.
3. **The LiteLLM `user` must be `hash(puid ‖ project ‖ environment)`.** End-user
   budgets are global, so a bare PUID hash lets one app's exhaustion lock a student
   out of every other Manifest app.

---

## 6. How to work here

These conventions have held across five sessions and are why the work has stayed
coherent. Follow them.

1. **Invoke the skill.** `superpowers:writing-plans` for a plan,
   `superpowers:subagent-driven-development` or `executing-plans` to execute one,
   `superpowers:brainstorming` before creative work. If a skill applies, use it.
2. **Ask before `sudo`, and before modifying anything outside your branch.**
   Installing a global tool counts. So does touching the spec.
3. **Green before you commit:** `pnpm test`, `pnpm lint`, and
   `pnpm --filter @manifest/control-plane typecheck`. All three, every time.
4. **Record exact versions.** Image digests, package versions, macOS and Docker
   Desktop versions. A finding without a version is not reproducible.
5. **Make the judgment call, then write down why.** Rich would rather you decide a
   routine question and record the reasoning as a documented decision than block on
   asking. Reserve questions for things that are genuinely his — spec changes, host
   changes, anything irreversible. P1's *Decisions this plan makes* section is the
   pattern.
6. **Capture negative controls.** "It works" is much weaker than "it works, and here
   it is correctly failing when I remove the thing that makes it work."
7. **Write for a reader who was not there.** Every one of these documents will be
   read cold by someone with no context. That is the normal case, not the exception.
8. **Close out properly.** Update the roadmap ledger, sweep every document that
   states status, and leave the machine as you found it. **The sweep is the step that
   gets forgotten**, and forgetting it is how four documents once spent a day lying
   about the state of the project — and how the four HTML pages spent five days
   telling outsiders the project was "designed, not yet built" after it was neither.

   Sweeping by memory is what fails, so here is the list. Check each one every time:

   | Document | What in it goes stale |
   |---|---|
   | `plans/2026-08-29-plan-roadmap.md` | **The ledger — update this first, it outranks the rest.** Spike status, the plan set table, *Order of operations* |
   | `ORIENTATION.md` | §2 and §7 by design — **including §2's numbers box, which is the one place this file states the four gate counts**; §4 whenever the machine changes; §8 when something becomes or stops being Rich's call |
   | `README.md` | The status section, and the *Where to start* table's "current job" row |
   | `RUNBOOK.md` | **Added to this list 2026-09-09, having been missed once.** Its *C1's acceptance* preamble restates the CURRENT `make doctor` / `make verify` totals beside the dated 2026-09-05 ones, so it drifts every time a check lands — and it is the document a new agent opens to run the platform |
   | `CLAUDE.md` | The *State* paragraph |
   | `specs/manifest-schematic.html` | **Shared outside the team.** The `Status` line in the header, the footer, and the "no user interface has been built yet" disclaimers |
   | `specs/manifest-phases.html` | **Shared outside the team.** The spike section — how many have run, what they answered, where the remaining ones sit |
   | `specs/manifest-decisions.html` | **Shared outside the team.** Drifts when a **decision** changes, not when status does — check it after any spec action is applied |
   | `specs/manifest-stories.html` | **Shared outside the team.** Hostname examples, which must match §23's zone rule |
   | `docs/external-track.md` | Owners and states of the UBC items |
   | `machine-baseline-*.md` | **Do not edit these.** They are dated evidence. Re-run `scripts/snapshot-machine.sh` and add a new one |

   **The four HTML pages are the easiest to forget and the most expensive to get
   wrong**, because Rich shares them with people outside the team and nothing in the
   build checks them. They are also the slowest to drift: their architecture stays
   right for months while their *status* is wrong within days.

---

## 7. What to do next — execute P4b, from Task 1

P1, P2, P3 and P4a are all executed and green; S6 has reported; **P3's six spec actions
were applied on 2026-09-07**. P4 was split into **P4a** and **P4b** (Rich's
call). **P4a is finished — all 15 tasks, 1–5 on 2026-09-08 and 6–15 on 2026-09-09.
P4b is next, and its own Task 1 is a reconciliation pass against the P4a that has now
run**, so start there rather than at its Task 2. **P4b runs in ten agreed sittings**,
one per session — the table is at the top of the plan and summarised in §7d-2.

**The measured plan-to-reality gap, in one table.** Every one of these plans was
self-reviewed before anyone executed it.

| Plan | Tasks | Defects found by READING | Defects found by RUNNING |
|---|---|---|---|
| P1 | 13 | 5 | **18** |
| P2 | 21 | 7 | **52** |
| P3 | 19 | 7 (+8 reconciling against a real P2) | **82** |

The rate never fell with practice. It rose whenever the work stopped being pure
functions, and it rose again whenever something was made to run end to end for the
first time. **Budget accordingly.** P4a's fifteen tasks came in at
**5.3 defects per task** — above every plan in that table, in the plan that had the
most research behind it. Task 15 held to it exactly: the first end-to-end run of the
proof app **passed at the first attempt**, which had never happened here, and eight
defects came out of refusing to believe it — including a negative control that was
itself falsely green, and a blueprint option that reads as a control and is not one.
**P4b is 16 tasks against a live LiteLLM; there is no reason to expect the rate to
fall.**

### 7a. P1 is done *(executed 2026-09-05)*

[`plans/2026-08-30-p1-local-substrate.md`](plans/2026-08-30-p1-local-substrate.md) —
13 tasks, all executed and green. The platform runs; read
[`RUNBOOK.md`](RUNBOOK.md) to start it, not the plan.

`make doctor` was **16 checks / 0 failed** and `make verify` **34 / 0** *on the day P1
finished*, and both were green with the network off — a dated record, not today's
baseline; §2's box is the current one. The C1 demo holds:
`https://console.manifest.internal/` returns a byte-identical hostname and scheme
from the host and from inside a container, no port, no `-k`.

**Executing it found 18 defects in an already-self-reviewed plan**, and the shape of
them is the durable lesson: **six were checks that passed while the thing under test
was broken or absent.** **The one thing P1 did not prove: the second-machine clean
clone.** No second Mac was available; it is recorded as a gap in `RUNBOOK.md`.

### 7b. P2 is done *(executed 2026-09-05)*

[`plans/2026-08-29-p2-control-plane-spine.md`](plans/2026-08-29-p2-control-plane-spine.md)
— **all 21 tasks executed and green.** The control plane boots, serves HTTP on 7100,
and the whole lifecycle runs against the fake driver in ~300 ms.

**Executing it found 52 defects across three sittings.** The classes worth carrying:
**six type errors no test could ever catch** (Vitest strips types without checking
them); **five test-isolation defects** that made the suite pass or fail on the order
Vitest happened to pick; **two controls one edit from being live** — `/auth/dev-login`
one line from an authentication bypass, and an IDOR in `GET /builds/:id`, both
answering **200** when broken; and **nothing had ever executed the boot entry point.**

**One rule earned that batch.** *Never accept a check you have not watched fail.*

### 7c. P3 is done *(executed 2026-09-07)*

[`plans/2026-08-31-p3-docker-driver-deploy-spine.md`](plans/2026-08-31-p3-docker-driver-deploy-spine.md)
— **all 19 tasks executed and green.** The real Docker driver passes P2's
`driver-contract.ts` unchanged, and `make demo` takes an application from a bare git
repository to `https://fixture-app.staging.manifest.internal` — then does it again
from a dropped database, a deleted repository root and an emptied registry.

**Measured on 2026-09-07, the day P3 finished. These are a record, not today's
baseline** — P4a has since added tests and checks, and §2's box is the current one.

| | *as P3 left it* |
|---|---|
| `pnpm test` (repo root) | **381 tests**, Docker-free |
| `pnpm test:docker` | **89 tests**, ~5 min, needs `make up` |
| `make doctor` | **16 checks / 0 failed** |
| `make verify` | **34 checks / 0 failed** |

**Read Sessions 4 and 5 of *What executing this plan found* before touching any of
it.** They are the most useful pages in this repository, because between them they
establish two things that were invisible behind a fully green test suite:

- **Session 4: no BUILD in this platform had ever succeeded.** The blueprint
  Dockerfile opened with a `# syntax=` directive, which makes BuildKit fetch a
  frontend from Docker Hub before it reads line two, and §12's builder has no egress.
  Underneath it, **D13's npm-mirror control was completely inert** — `.npmrc` arrived
  after `npm ci`, so the build used the public registry.
- **Session 5: no DEPLOY had ever succeeded either.** Seven separate defects of one
  shape: **the test constructs the value correctly and the running system re-derives
  it wrongly.** A blueprint directory, a repository path, an image repository, a port.
  Every one was green in 74 Docker tests, because a test hands the driver what it
  built while the control plane rebuilds it from a slug. Plus a health check that
  every app failed — BusyBox `wget` honours `http_proxy` and ignores `NO_PROXY`, so
  D18's forced proxy denied each app's probe of its own loopback with `403 Filtered`,
  and §11 recorded working deploys as `failed`.

**S6 ran as its Task 18** and is `docs/superpowers/spikes/S6-findings.md`: twelve
probes, every denial paired with a positive control, and the app still serving at the
end so the denials cannot be a dead container. Isolation is `container`; **whether
that suffices for sandboxes is left to S5**, deliberately.

**P3 proposes five spec actions and applies none.** They are Rich's, listed at the end
of the plan, and every one is measured rather than argued. The first — narrowing §21's
divergence 8 — was deliberately deferred until Task 18 measured it, and **it now has.**

### 7d. P4a is done *(executed 2026-09-09)* — identity, secrets and the §8 contract (1b-i)

*[`plans/2026-09-07-p4a-identity-secrets-injection.md`](plans/2026-09-07-p4a-identity-secrets-injection.md)
— **15 tasks, ALL EXECUTED and green: 1–5 on 2026-09-08, 6–15 on 2026-09-09.** Not the
current job; **§7d-2 is.** This section stays because everything under *What Tasks
1–15 established* is what P4b builds on, and re-deriving it is a session.*

**It ran in SEVEN AGREED SITTINGS**, settled with Rich on 2026-09-08 so a session
limit could never land mid-task. The plan commits after every task, so a stop
*between* tasks is recoverable; a stop *inside* one is not. **The pattern held for all
seven, and P4b should use it.**

**"Sitting", not "phase", deliberately:** this project already uses *Phase 1/2/4+* for
the §17 product roadmap — the roadmap's "Phase 2" is six plans nobody has written.
These are units of execution, and P2's record already calls them sittings.

**The whole of `make demo-identity` is the deliverable**, and it is what to run first
if anything in the identity path looks broken: it drives Manifest's own CWL login, a
project, a push, validation, a build, a release, a deploy, a student sign-in through
the edge over TLS, a note written and read back, and an instructor who sees their own
note and **not** the student's.

| Sitting | Tasks | What it delivers |
|---|---|---|
| 1 ✅ | 4–5 | `secrets/` — envelope encryption, the store, the boot scrub — and its first call site: service credentials move from derivation to storage |
| 2 ✅ | 6–7 | Per-app SP keypairs and the whole of `sso/`: the D15 derivation, S2's `entity_data` as one renderer, the `manifest_idp` store, `registerServiceProvider` |
| 3 ✅ | 8–9 | The `events` table — append-only **by grant**, which needed a real application role before it could mean anything — redaction at capture, its two call sites in `sso/registration.ts`, and `deployRelease` registering the SP **before** `ensureInstance` |
| 4 ✅ | 10–11 | §8's frozen table as one function (`spec/injection.ts`) and then its call site, deleting P3's ad-hoc env block so there is exactly one producer. Fixed `MONGODB_DB_NAME` and threaded `run_as_uid` + `InstanceSpec.files` so the SAML cert and key paths point at files that exist |
| 5 ✅ | 12–13 | `node-ts-mongo@1` — the blueprint faculty actually use — plus the drift test that reads its source. The sitting that needed the network on, to warm Verdaccio from the new lockfile |
| 6 ✅ | 14 | Manifest's own CWL login, and the end of the dev shim — `GET /auth/login`, `POST /auth/saml/callback`, the platform's own SP row written at boot, and `POST /auth/dev-login` deleted |
| 7 ✅ | 15 | The proof app and P4a's acceptance — `fixtures/proof-app/`, `scripts/demo-identity.sh`, `infra/lib/idp-login.sh`. **Alone on purpose**, and it earned it: the run passed at the first attempt, which had never happened here, and **eight defects came out of disbelieving that green** |

Each sitting ends with the four gates, the Docker tier where it applies, a session
record in the plan's *What executing this plan found*, and the §6 close-out sweep.

**Read the plan's *What executing this plan found* before anything else.** Sessions 1
to 9 are there, with all 80 defects and what each was measured against. It
is the difference between repeating this work and continuing it. **Session 5's first
defect is the one to read**: §20's control was not merely unimplemented, it was
*unimplementable*, because the application connected as a superuser and a superuser
bypasses every privilege check — a REVOKE that reads exactly like a control and does
nothing.

**What Tasks 1–15 established, so you do not re-derive it.**

- **The Manifest IdP is a working IdP.** It has a hosted entity, an RSA-4096 signing
  keypair (`infra/idp/cert/`, gitignored, minted by `make up`, **not** removed by
  `make reset`), and one URL — `https://idp.manifest.internal` — that resolves
  identically from host, container and `curl`. Its entityID is configuration and is
  never derived from the request host.
- **Attribute release is enforced.** The auth source emits **friendly** names,
  `core:AttributeLimit` at priority 50 matches them, `core:AttributeMap` at 60
  converts to the OIDs real UBC Shibboleth sends. **The order is load-bearing and
  reversing it releases nothing** — `scripts/lib/idp-attribute-chain.php` runs the
  configured chain and `make verify` asserts the result.
- **`ssp_ro` reads metadata and cannot write it**, and a `CHECK` constraint makes
  §9's fail-open row (empty *or absent* `attributes`) unrepresentable.
- **A real CWL login works**, proved by `src/sso/login.docker.test.ts` against a
  throwaway SP built on the real `passport-ubcshib`. That suite is §16's identity-path
  regression tier and it is the thing to run first if you break something.
- **The platform can place files inside a container** — `InstanceSpec.files`, which
  §8's `SAML_IDP_CERT_PATH` and `SAML_PRIVATE_KEY_PATH` need and which did not exist.
- **`secrets/` exists and is used.** libsodium envelope encryption — a per-secret data
  key wrapped with `crypto_box_seal`, payload under `crypto_secretbox_easy` — over a
  Postgres `secrets` table, with the master keypair in `infra/secrets/master.key`
  (gitignored, minted by `make up`, **not** removed by `make reset`, same rule as the
  IdP key and the Caddy CA). `process.env` is scrubbed at boot and
  `boot.docker.test.ts` asserts it, because `runtime/docker/builder.ts` spawns
  `docker` with `{ ...process.env }`.
- **Service credentials are STORED, not derived**, and `ServiceBinding.credentials` is
  filled by `deployRelease` — the driver derives nothing. The migration adopts P3's
  derived value on first call, so a developer's existing Mongo keeps working;
  `services.docker.test.ts` proves that against a real one, including the outage a
  cut-over would have caused. **`releases/` takes a `DeployDeps` object**, which since
  Task 9 carries `{ secrets, sso }`.
- **`sso/` produces a working registration AND HAS A CALLER.**
  `registerServiceProvider(db, pool, keys, input)` derives the entity, mints or reuses
  a per-app RSA-4096 keypair (two Secrets), writes one `saml20_sp_remote` row and
  records §9's two audit Events. `deployRelease` calls it — after the service loop,
  before `ensureInstance` — for any app whose resolved `auth.provider` is `cwl`, and
  `src/index.ts` builds the registrar once at boot. `releases/deploy-sso.docker.test.ts`
  runs that path against the REAL registrar, not a recorder.
- **The control plane connects as `manifest_app`, a least-privilege role, and so does
  the whole test suite.** `manifest` is `POSTGRES_USER` and therefore a superuser, and a
  superuser bypasses every privilege check — measured, `REVOKE UPDATE, DELETE` then
  `UPDATE 1`, `DELETE 1` — so §20's append-only `events` table was *unimplementable*
  until this existed. `infra/lib/ensure-app-role.sh` creates the role on every `make up`;
  `MANIFEST_ADMIN_DATABASE_URL` is the harness's own connection for migrations and
  `TRUNCATE`, and `src/` never reads it.
- **`audit.events` is in its own SCHEMA, deliberately.** Every blanket grant here is
  scoped `IN SCHEMA public`, so nothing can reach it by accident; the migration grants
  exactly `SELECT, INSERT`. Its foreign key is `ON DELETE RESTRICT`, because a
  referential action runs with the referenced table's privileges and a cascade let the
  application erase the audit trail by deleting the project. `make verify` attempts all
  four write paths and expects four refusals.
- **`recordEvent` takes its redactor as a PARAMETER**, so no code path can write an
  unredacted row; `makeRedactor` is exact-match only (Decision 11), longest needle
  first, with a six-character floor. **A test that asserts a secret is ABSENT from a
  document nothing ever put it into cannot fail** — that was defect 40, and the fix is
  a canary in a field app-supplied text actually reaches.
- **`ResolvedConfig` now carries `auth` AND `ai`, and that is the whole of what §8's
  renderer reads.** §13 freezes the config at release time, so a second source of truth
  beside it — reading `app_specs.parsed` back out — is the defect shape P3 paid for
  seven times. `InjectionContext` therefore has no `ManifestSpec` at all and
  `deployRelease` never loads the AppSpec row. A release frozen before either field
  existed has neither key and is treated as an app with no sign-on and no AI.
- **§8's injection contract is ONE function with ONE producer.**
  `spec/injection.ts` exports the table as DATA (`INJECTION_VARIABLES`), the renderer
  (`renderInjection`), the contract version, the reserved-name set `spec/policy.ts`
  reads, and the two container paths §8 names as files. `deployRelease` calls it and
  adds nothing:
  `grep -rn 'MANIFEST_APP_URL\|SAML_ENTRY_POINT\|MONGODB_DB_NAME' packages/control-plane/src --include='*.ts' | grep -v test`
  returns that file and comments. **Keep it that way** — a second producer is what
  cost P3's Session 5 a day.
- **`MONGODB_DB_NAME` reaches a real container.** Verified on the running platform on
  2026-09-09, not only in a test. Every service variable is read OUT OF the endpoint
  the driver returned, so the URI and the database name cannot disagree. The Mongo
  volume still holds an `app` database with one boot and one write in it — the record
  of every deploy this platform made before that day.
- **The platform PLACES §8's two files.** The IdP signing certificate at
  `/manifest/idp-signing.crt` (0444) and the SP private key at
  `/manifest/sp-private-key.pem` (0440, root-owned, group = the blueprint's
  `run_as_uid`, which its own Dockerfile creates with the same number). Both paths are
  `INJECTED_FILE_PATHS` constants, so the variable and the file are one value.
  `SsoRegistrar` gained `idpSigningCertificate()` — everything a CWL deploy needs from
  the IdP arrives through one dependency, read per deploy so a re-minted key needs no
  restart.
- **`SESSION_SECRET` is stored per app+environment**, resolved BEFORE the SP
  registration so §14's redactor covers it, and stable across deploys — a regenerated
  one signs every user of a redeployed app out.
- **`DeployDeps` now has FOUR fields**: `secrets`, `appSecrets`, `sso`, `blueprints`.
  The last is read for exactly one value, `runtime.run_as_uid`.
- **Certificates come from `openssl`, spawned.** `node:crypto` has no API that issues
  one. `make doctor` **now checks the host tools the control plane spawns** — `git`,
  `tar`, `openssl` and the `docker buildx` plugin — by running each one's real
  invocation, which is why doctor is 17 checks rather than 16 (2026-09-09, Rich's
  call; §8).
- **There are now THREE database URLs, and none is derived from another.**
  `MANIFEST_DATABASE_URL` connects as `manifest_app`; `MANIFEST_ADMIN_DATABASE_URL`
  connects as `manifest` and is used only by `db:migrate` and the test harness's
  `TRUNCATE` (`src/` never reads it); `MANIFEST_IDP_DATABASE_URL` is the IdP's
  (Decision 13). `MANIFEST_SP_ENTITY_BASE` defaults to `https://manifest.internal`.
  `vitest.env.ts` derives all three from `.env`. **The README's *Running the control
  plane* export block is the copy to use** — it changed on 2026-09-09.
- **A signature that is PRESENT is always validated by SimpleSAMLphp**, whatever the
  row says — so `certData` is mandatory for any app that signs, and
  `validate.authnrequest` can only be proved by an SP that does *not* sign. Both are
  measured, and both have a test.
- **`node-ts-mongo@1` EXISTS AND HAS BEEN RUN** — `blueprints/node-ts-mongo/`, the
  blueprint faculty applications are generated from, and §20's "security multiplier":
  whatever is in it is replicated into every application. Its skeleton is its own
  build target, so `runtime/docker/node-ts-mongo.docker.test.ts` proves the real thing
  builds through §12's gates, deploys, reads the injected `MONGODB_DB_NAME` with **no
  fallback**, and issues a real AuthnRequest. Every app-side library is pinned to the
  set `fixtures/saml-sp` measured, with an `@xmldom/xmldom` override the scan gate
  needs. `provides.ai` is `false` (Decision 12); **P4b flips it.**
- **§16's drift tier reads the blueprint's SOURCE**, in `spec/injection-drift.test.ts`,
  both directions, against `renderInjection`'s OUTPUT rather than against the table's
  `requiredIn` column — a comparison whose expected side is a hand-maintained list
  gets *smaller* when somebody edits the list. It strips comments before scanning,
  because a **commented-out** read otherwise counts as a read and the direction that
  catches a dead §8 row passes silently. `ALLOWED_UNSET` and `PLATFORM_ONLY` are both
  deliberately **empty**: every name added to either is an exemption.
- **MANIFEST IS ITS OWN SP, AND THERE IS NO LOGIN SHIM.** `GET /auth/login` issues a
  signed AuthnRequest; `POST /auth/saml/callback` validates the assertion and mints the
  §13 session; `POST /auth/dev-login`, `MANIFEST_DEV_AUTH` and its two safeguards are
  deleted. Tests sign their own sessions with `identity/testing.ts`'s `testSessionCookie`
  — the bypass was the ROUTE, never a test's ability to construct a session. **The
  callback redirects to `/auth/me`, and the target is asserted** — it said `/` first,
  which this server does not serve, so a successful login ended on a 404 while every
  test passed by stopping at the 302. D22's console is P5's; that is the line to change.
- **The SAML library is `@node-saml/node-saml@5.1.0`, deliberately NOT the
  `passport-saml` the blueprint pins.** Measured 2026-09-09: `passport-saml@3.2.4` audits
  **1 critical** (*Node-SAML SAML Signature Verification*, no fix), 1 high, 3 moderate;
  node-saml 5.1.0 audits **0**. C6 binds the app side, not Manifest's own code, and
  **§12's scan gate scans app IMAGES — nothing here scans the control plane's own
  dependency tree**, so that critical would have been invisible to every gate.
- **Three of node-saml's defaults are wrong in the fail-open direction**, and are set
  explicitly: `signatureAlgorithm` and `digestAlgorithm` default to **sha1**,
  `validateInResponseTo` defaults to **`never`** (which accepts an unsolicited
  assertion), and `identifierFormat` defaults to `emailAddress` while every row
  `renderSpMetadata` writes declares **transient**. But **`wantAssertionsSigned` and
  `wantAuthnResponseSigned` do NOTHING** — setting both to `false` reddens no test,
  because node-saml refuses an unsigned document regardless and `idpCert` is what
  refuses a wrongly-signed one. Same shape as `validate.authnrequest`.
- **The control plane registers its own SP at BOOT**, through `renderSpMetadata` —
  the one renderer of an `entity_data` document — not from `ensure-idp-sql.sh`.
  entityID `https://manifest.internal/sp/manifest-control-plane/platform`, ACS built
  from `MANIFEST_CONTROL_PLANE_ORIGIN` (default `http://127.0.0.1:7100`; `loadConfig`
  refuses a loopback origin whose port is not `MANIFEST_PORT`). Its keypair is
  `infra/sp/control-plane.{key,crt}`, minted by `make up`, gitignored, **not removed by
  `make reset`** — a file rather than two `secrets` rows, because that table is scoped
  to a `projects` row by a foreign key and the platform is not a project.
- **`make demo-identity` IS P4a's ACCEPTANCE, and it is repeatable.** Nine steps by
  `curl`. It passed at the first attempt and then FAILED on the second, because step 8
  asserted the instructor's note list was `[]` — true only against a virgin database.
  Both notes are unique per run now and the isolation is checked **both ways**: neither
  person sees the other's note and each reads back their own, because "the note is
  absent" is also true of an app that returns nothing to anybody. **Run it twice.**
- **Every redeploy leaves the PREVIOUS release's container running.** Eleven deploys in
  one session produced eleven `mf-proof-app-staging-*-app` containers, all Up and
  healthy, each holding its full cpu/memory/pids allocation; only one carries the route.
  `deployRelease` calls `ensureInstance` and nothing destroys what the last release
  left. **Not a Task 15 defect and not fixed** — reaping belongs to §11's reconciliation
  loop, which is Phase 4 (D10) — but it is unbounded, and an operator meets it long
  before Phase 4 does. `RUNBOOK.md`'s *Known gaps* carries the workaround.
- **The blueprint's skeleton serves `/auth/logout`, not `/logout`.** `auth.logout`
  defaults to `/auth/logout` and that default is what the platform writes into the
  app's `SingleLogoutService`, so until 2026-09-09 every app generated from
  `node-ts-mongo@1` that took the default advertised a logout endpoint it did not
  answer. Invisible while nothing initiates IdP-side single logout; a 404 in front of a
  real person the moment anything does.
- **The two Docker tests that boot the control plane REGISTER THEIR OWN SP**, by
  setting `MANIFEST_SP_ENTITY_BASE=https://test-suite.manifest.internal`, and delete
  only that row. They boot on 7188/7189 and the row is keyed on one entityID, so
  writing the shared one leaves a developer's control plane registered at a port
  nothing listens on — a login that completes at the IdP and dies on the redirect
  back. Deleting it afterwards was the first answer and is worse in its own way: it
  logs the developer out until they restart. Nothing is weakened by the override — the
  entityID is opaque to SAML and the row still goes through `renderSpMetadata` — but it
  leaves nothing over there asserting that the DEFAULT base produces the documented
  entityID, so `sso/platform.test.ts` asserts that as a pure function.

**Your first ten minutes, in this order.** Establish a baseline before you change
anything — every session that skipped this spent longer working out whether a red
result was theirs.

```bash
./scripts/snapshot-machine.sh > /tmp/before.txt   # read-only, no sudo, no network
make up                                            # ~1 min; re-adds the loopback alias
make doctor && make verify                         # expect 17/0 and 47/0
pnpm test                                          # expect 525 passed, 56 files
pnpm lint && pnpm --filter @manifest/control-plane typecheck && pnpm format:check
```

**Then run this, because it is what Tasks 1–3 bought, and it still holds:**

```bash
curl -s --cacert infra/ca/manifest-root.crt \
  https://idp.manifest.internal/module.php/saml/idp/metadata | head -3
```

**Expect signed SAML metadata** carrying `entityID="https://idp.manifest.internal/idp/shibboleth"`
and an `<ds:X509Certificate>`. It answered **500** until 2026-09-08.

`pnpm test:docker` is ~6 minutes and **116 tests**; run it before the first commit that
touches `infra/`, `runtime/`, `services/`, `sso/`, `secrets/`, `releases/` or
**`blueprints/`** — the last since Task 12, because `node-ts-mongo@1`'s own skeleton is
a build target and nothing in the unit tier builds it. A faster
loop for one file: `MANIFEST_TEST_DOCKER=1 pnpm exec vitest run --project docker sso/login`.

**`make demo` is worth one run before you start.** It is the only thing that exercises
boot, build, release, deploy and the edge through the real HTTP surface, and it is where
the last five sessions' worst defects were found. It needs the control plane already
running — README's *Running the control plane*, then `make demo`.

**THE PROOF APP EXISTS AND THE ACCEPTANCE PASSES** (Task 15). `make demo-identity`
runs `scripts/demo-identity.sh`: nine steps by `curl`, ending with an instructor who
**cannot** see the student's note. `fixtures/proof-app/` carries `server.js`,
`identity.js`, `manifest.yaml`, a page and a README — and **deliberately no `auth/`,
`package.json` or `package-lock.json`**: the demo copies `node-ts-mongo@1`'s skeleton
first and lays the app over it, the way an agent generates one, so §20's security
multiplier stays one copy. Four things to know:

- **The three-hop CWL login is ONE function**, `idp_login` in `infra/lib/idp-login.sh`,
  sourced by `demo.sh`, `demo-identity.sh` and any control harness. It proves the SP
  row and the AuthnRequest signature, and it reads the ACS out of the IdP's own form
  and checks it (D15). It does **not** prove a session authenticates anybody — it
  discards the ACS response — so **the caller's identity check is the assertion**. A
  control that stopped at `idp_login` came out falsely green; that is defect 77.
- **A note is keyed on `sha256(puid ‖ slug ‖ env)`**, space-separated, in
  `fixtures/proof-app/identity.js`, and the database holds no PUID at all. The
  namespace is not privacy garnish: S3 measured that LiteLLM keys an end-user budget
  on this string **globally**, so a bare hash locks a student out of every Manifest
  app once one app's budget is spent. **P4b must pass this string through, not
  recompute it** — `blueprints/proof-app-identity.test.ts` holds both sides to it.
- **`fixtures/proof-app/README.md` is the attribute justification table** P8's UBC IAM
  registration needs. `givenName` and `sn` are the two that are not pre-authorized.
- **`GET /api/ai` answers 501 and names P4b.** It returns the end-user identifier it
  *would* use, which is the half that has to be right before the rest exists.

**`node-ts-mongo@1` exists and works** (Tasks 12–13). It is `blueprints/node-ts-mongo/`:
express + `express-session` + `passport-ubcshib` + `mongodb`, every version pinned to the
set `fixtures/saml-sp` proved against the real IdP, with an `@xmldom/xmldom` override
because §12's scan gate needs it. Its skeleton is its own build target, so
`runtime/docker/node-ts-mongo.docker.test.ts` proves the blueprint faculty use actually
builds, deploys, reads the injected `MONGODB_DB_NAME` with **no fallback**, and issues a
real AuthnRequest. `provides.ai` is `false` per Decision 12 — `renderInjection` refuses an
app declaring `ai.models` — and **P4b flips it.** Three things to know before touching it:

- **§16's drift tier reads the blueprint's SOURCE**, in `spec/injection-drift.test.ts`,
  and it strips comments before scanning. That is not tidiness: a read that has been
  COMMENTED OUT otherwise counts as a read, so the direction that catches a dead §8 row
  passes against a variable the running app never reads. Measured both ways.
- **Both directions compare against `renderInjection`'s OUTPUT**, not against the table's
  `requiredIn` column. A comparison whose expected side is a hand-maintained list gets
  *smaller* when somebody edits the list — defect 46's shape, and the reason the plan's
  own control (b) came out green.
- **`ALLOWED_UNSET` and `PLATFORM_ONLY` are both empty**, deliberately. The blueprint
  genuinely reads all twelve of §8's required-in-all rows, including
  `SAML_IDP_METADATA_URL`. Every name added to either set is an exemption, and an
  exemption is how a missing injection stops being visible.

**That owed control was run in sitting 7, AND IT CAME OUT GREEN** — Task 12's (c),
removing `attributeConfig` from `skeleton/auth/ubcshib.js` and expecting raw
`urn:oid:` keys. The full nine-step acceptance passed with it gone. Measured: the
library does `attributeConfig: options.attributeConfig || []` then `if (length > 0)`,
so an absent list means `mapAttributes` never runs and `profile.attributes` is never
set — and `bridge()` reads the OID key **first** and falls back to `profile` itself, so
it finds all seven names in the raw profile. That is the bridge doing exactly what S2
built it for. **`attributeConfig` is therefore not the control it looks like** — the
third flag in this plan with that property, after `validate.authnrequest` and
node-saml's `wantAssertionsSigned`. §9's release enforcement **is** the control, and
`demo-identity`'s negative control (c) watches it work: cut `auth.attributes` to
`[ubcEduCwlPuid]` and the app renders no display name while the notes still round-trip.
`blueprints/attribute-bridge.test.ts` still goes red in five of six when the OID read
is removed.

Tests of anything secret-scoped use **`withSecretScope` from
`secrets/testing.ts`**; tests that touch the IdP database belong in the **Docker tier**,
because the table is the IdP container's artefact. **Any new migration must be its own
file** — drizzle-kit keeps a journal and an applied migration is never re-run.

*(The plan's own text still describes Tasks 4–13 as upcoming — they are done, and the
plan's *What executing this plan found* is the corrected record. Three places where its
text is now wrong on purpose: there is no `manifest_audit_owner` role and no
`REVOKE`, because `events` is in an `audit` schema no blanket grant reaches;
`ResolvedConfig.auth`, which Task 10's own context object assumes, did not exist until
Task 9 added it; and **`InjectionContext` has no `spec` field** — `ResolvedConfig` gained
`ai` so the renderer reads only the frozen config, which is Session 6's defect 48. `deriveCredentials` survives on purpose and deleting it is still the
trap Decision 8 describes; it can go once every existing service has been deployed
once, and not before.)*

**Four things Tasks 1–3 learned that Task 15 will need.**

1. **Three defects this session were a swallowed error.** `applyRoute` hid a failed
   delete; `stop()` hid a failed `destroyInstance` and a stale container then served
   four runs of a suite, making a negative control pass against an app it had already
   edited; and a probe that inserted a row it expected to be refused never deleted it,
   which broke the next `make up`. **`.catch(() => undefined)` is this codebase's most
   productive defect.** Look hard at every one you write and every one you inherit.
2. **The Prettier trap is real and it caught this session three times in one change.**
   A `sed`/`python .replace()` that matches nothing after Prettier reformatted its
   target reports success and changes nothing. §4 has said so since 2026-09-06.
   **Assert the pattern matched before writing the file** — every time, not when you
   remember.
3. **That unfinished thread is now closed.** `renderInjection` emits
   `SAML_IDP_CERT_PATH` and `SAML_PRIVATE_KEY_PATH` from `INJECTED_FILE_PATHS`, and
   `deployRelease` passes both through `InstanceSpec.files` — the certificate `0444`,
   the key `0440` root-owned with the blueprint's `run_as_uid` as its gid, threaded
   from the descriptor through `DeployDeps.blueprints` (Task 11).
4. **A module with no call site is not built**, and **schedule the end-to-end task
   early**. Both held again: Task 3 was scheduled third on purpose and it is the only
   reason the IdP's inability to authenticate anybody was found before Task 15.

**Start P4b at its Task 1**, which reconciles it against the P4a that has now run.

**Demo:** `make demo-identity` — CWL login and a Mongo write, driven by `curl`. The
LLM answer is the third of §16's three and is **P4b's**, which is also why the external
track's C4 trigger is P4b's and not this one (roadmap, *Order of operations* step 6).
`fixtures/fixture-app/` is P3's build target and stays trivial; §16's proof app is
`fixtures/proof-app/`.

### 7d-2. Execute P4b — AI, events, streaming, incidents (1b-ii) ← **START HERE**

*[`plans/2026-09-07-p4b-ai-events-streaming-incidents.md`](plans/2026-09-07-p4b-ai-events-streaming-incidents.md)
— **16 tasks, written 2026-09-07, none executed. Start at Task 1.**
Invoke `superpowers:executing-plans` or `superpowers:subagent-driven-development`.*

**IT RUNS IN TEN AGREED SITTINGS, one per session with a check-in at each boundary**
— settled with Rich on 2026-09-09, the same pattern that carried P4a's last twelve
tasks through seven sittings without a session limit ever landing mid-task. **The
table is at the top of the plan**, which is the maintained copy; this is the shape:

| Sitting | Tasks | |
|---|---|---|
| **1 ← half done** | **1 ✅ · 2 ← next** | the reconciliation pass (**done 2026-09-09 — six divergences, two fatal to a migration**), and LiteLLM pinned by digest |
| 2 | 3 | §16's AI-path regression tier, before any `ai/` module exists |
| 3 | 4–5 | `ai/errors.ts`, then the transport that uses it |
| 4 | 6–7 | the catalogue and the key minter |
| 5 | 8–9 | **the sitting where Tasks 6, 7 and 8 get a caller** |
| 6 | 10 | the blueprint's AI half — **the one sitting that needs the network ON** |
| 7 | 11–12 | build logs, and the redaction that covers them |
| 8 | 13 | §14's `Incident` |
| 9 | 14–15 | the stream, and the call sites that make it carry anything |
| 10 | 16 | P4b's acceptance, alone |

**Ten rather than eight** — which is what sixteen tasks at P4a's average would give —
because three tasks are alone for reasons that are not their size: Task 3 builds the
probe harness every later sitting is measured against, Task 10 needs `make seed` with
the network on to warm Verdaccio from a new lockfile (P4a's sitting 5 was alone for
exactly this), and Task 16 is the first end-to-end run, which is where this project's
worst defects have always been. **The table is a schedule, not a contract**: Task 1's
job is to move task boundaries, so re-cut it if that happens. Two rules survive any
re-cut — **Task 16 stays alone, and Tasks 14 and 15 stay together**, because Task 15
is what makes the stream carry anything and a stream with no publisher sits green for
a whole session.

**Task 1 has run (2026-09-09) and found SIX divergences** — the record is in P4b's
*What executing this plan found*, and the two worth knowing before Task 11 are that
**`manifest_audit_owner` does not exist** (P4b's Tasks 11 and 13 both did DDL against
it, so both migrations would have failed on their first statement) and that both new
audit tables used **`ON DELETE CASCADE`**, which bypasses §20's append-only grant
because a referential action runs with the referenced table's privileges. Both are
corrected in the plan. **Task 2 is next.**

The four items it also confirmed, which the plan could not know because P4a's
Task 15 ran two days after P4b was written, are under *What sitting 1 must reconcile*: `fixtures/proof-app/package.json` and `package-lock.json`
**do not exist** (Task 16's *Files* block modifies both), `endUserId` already exists in
`fixtures/proof-app/identity.js` and must be passed through rather than recomputed, the
three-hop login is one shared function in `infra/lib/idp-login.sh` that `demo-ai.sh`
must source, and `scripts/offline-acceptance.sh` already has a step 6 that a new one
must append to rather than replace.

The LiteLLM admin client with `allowed_routes` as a constant rather than a
parameter, S3's error table as one mapper, D17's catalogue read from `/model/info`,
app-key rotation with the budget on the LiteLLM user, the gateway joining an app
network **only** for an app that declares models, §8's AI rows, the blueprint's AI
component, build-log capture, redaction's heuristic half, §14's `Incident` shaped as
a repair prompt, and `WS /projects/:id/events` — **authorized before it upgrades**,
so §16's authorization contract suite can cover it like any other route.
**Demo:** the proof app answers a question, attributed to
`sha256(puid ‖ project ‖ environment)`.

**It was written before P4a ran, on Rich's instruction.** That is a departure from
the 2026-09-04 decision, and the plan answers it rather than ignoring it: **Task 1
is a reconciliation pass** against the executed P4a with a named checklist, and
three places where P4a's own text is ambiguous are flagged at the point of use.
**P4a has now executed in full (2026-09-09), so that reconciliation is sitting 1's first job rather than a hypothetical.**

**Writing it measured ten more facts.** The load-bearing ones: `/model/info` returns
`mode: null` for a chat model — not `"chat"` — so a catalogue filtered on `'chat'`
comes back **empty** and every spec then fails with a message blaming the faculty
member; `ghcr.io/berriai/litellm:main-stable` is a **moving tag absent from
`infra/images.lock`** while §16 pins the error mapping to a version; and
**`ai.budget.per_user_monthly_usd` cannot be enforced at LiteLLM 1.98.0 at all** —
customer rows auto-create with no budget, and `max_end_user_budget` does not exist
in its admin API. **P4b proposes six spec actions and applies none.**

### 7e. Write P5 — contract and clients (1c) *(after P4a and P4b)*

*Depends on P4.* The published OpenAPI contract, `manifest-mock`, the generated
client, and the reference console (D22) that imports **only** the generated client —
a lint boundary *and* a test enforce it, which is what converts "is the API
complete?" from an opinion into a build failure.

**Demo:** the §1 faculty journey, clickable, driven twice over one contract.

---

## 8. Decisions waiting on Rich

Surface these; do not decide them.

- **§12's scan gate — SETTLED 2026-09-08, Rich's call, and the spec text is NOT yet
  edited.** The gate blocks on a Critical or High **that has a published fix**;
  findings with no fix are recorded on the Release and reported for §20's fleet-wide
  rebuild, exactly as base-image findings already are. It had to be settled because
  §12's unwaivable gate and C6's "a library change is never a prerequisite" could not
  both hold: `passport-ubcshib` → deprecated `passport-saml` (critical, no fix) →
  `@xmldom/xmldom` blocked **every CWL application**, which is every application the
  platform exists to deploy. Implemented in `build/scan.ts`; **the change to §12's own
  words is still owed**, and it is the sixth spec action in P4a's list.
- **The long-term fix for `passport-ubcshib` is UBC's, not Manifest's.**
  `@node-saml/passport-saml@5.1.0` audits clean, and moving to it is exactly the
  "strictly safer for every consumer" change C6 permits. It is **not** blocking
  Manifest and should not be treated as though it were — but somebody should be told
  that six UBC applications depend on a library with a critical signature-verification
  advisory.
- **P4a proposes five spec actions and applies none.** They are at the end of
  [`plans/2026-09-07-p4a-identity-secrets-injection.md`](plans/2026-09-07-p4a-identity-secrets-injection.md).
  The load-bearing one: **§9 still says *"`docker-simple-saml` keeps its IdP role
  here"***, naming a repository that is read-only to this project and is not part of
  the platform — P1 built a separate IdP deliberately. The others record that the
  IdP's hosted entity and signing keypair are deployment artefacts rather than
  defaults (an IdP without them serves, answers health checks and cannot sign), the
  measured SimpleSAMLphp 2.x endpoint paths for §8's `SAML_ENTRY_POINT` row, that
  `MONGODB_DB_NAME` was specified and never injected, and that §21's IdP database
  needs the two roles S2 asked for and P1 shipped one of.
- **Where the service-binding wire lands — SETTLED 2026-09-06, Rich's call: P3 Task
  15.** `deployRelease` now derives a `ServiceBinding` per entry in
  `resolved.services`, calls `ensureService`, and passes the handles through with
  the endpoint injected under the name the catalogue gives it. Platform bindings are
  applied **after** the app's own `env`, so a declared `MONGODB_URI` cannot shadow
  one — an app is untrusted input (§12), and that has its own test. §8's injection
  contract, with its general mapping and drift test, remains P4's; this replaced the
  plumbing only, not the naming. **Do not re-raise.**
- **C4's actual turnaround time** for UBC IAM registration and the PIA is
  **unmeasured**, and §9 calls it the highest-risk dependency in the design. It has
  weeks of latency and no software dependency, so it *could* start today —
  **and deliberately is not.** *Decided 2026-09-05, Rich's call:* the external track
  starts once the local proof of concept works end to end, because the goal is to
  get this right rather than to get it started, and the conversation goes better
  with a working demonstration behind it. **Do not re-raise this**; the trigger is
  P4's proof app running. See `docs/external-track.md`.
- **Fix `passport-ubcshib` upstream, or leave it?** Not needed — `tlef-starter`
  already bridges both attribute formats and C6 forbids a library change being a
  prerequisite. Its real gaps are the unreachable MACE entry and missing OID entries
  for `uid` and `eduPersonPrincipalName`. If fixed, ship as **0.2.0** so the six live
  apps on `^0.1.6` adopt deliberately.
- **Does LiteLLM's embedding `encoding_format` bug affect a commercial provider, or
  only the Ollama path?** Unmeasured — only Ollama was reachable offline. Cheap to
  settle the first time anyone has a provider key.
- **Should the blueprint base image move from `node:22-alpine` to 24?** Open, and
  **now priced in exposure as well as effort** (measured 2026-09-06 with Grype
  v0.118.0 against a database built that morning):

  | | apk Critical / High | npm Critical / High |
  |---|---|---|
  | `node:22-alpine` *(what the blueprint pins)* | 4 / 14 | **1 / 10** |
  | `node:24-alpine` | 4 / 14 | **0 / 4** |

  The npm findings are npm's **own bundled dependency tree** inside the image
  (`/usr/local/lib/node_modules/npm/`), not anything an app chose. Moving to 24
  removes the Critical from that half. The mechanical cost is what P1's execution
  already measured: **one line in `infra/images.txt` plus a `make seed`**. **Still
  Rich's call** — it changes what faculty apps run in, which is a compatibility
  decision, not a mechanical one.

- **Should Phase 1 ship an apk mirror alongside Verdaccio?** *Raised 2026-09-06, not
  decided, and nothing in P3–P5 proposes one.* The 4 Critical and 14 High `apk`
  findings above are `libcrypto3`/`libssl3` at `3.5.7-r0`; the fix is `3.5.8-r0`,
  published 2026-08-26. **No newer base image clears them** — the `alpine:3.22` and
  `node:22-alpine` tags Docker Hub serves today have moved digest since
  `infra/images.lock` was written and scan *identically*. The only other route is
  `RUN apk upgrade` in the blueprint Dockerfile, and that cannot work: the builder
  sits on an `--internal` network with no route off it (a §12 control with its own
  negative test), and Verdaccio mirrors npm, not apk. So **an apk mirror is the only
  mechanism that would let a build clear them offline.** P3's scan gate does not
  block on them — they are the base image's, and §20 already makes the fleet-wide
  rebuild their remedy in Phase 4+ — but they are recorded on every Release, and
  "ship on day one with four Criticals in the base image" is a decision rather than
  an accident.

**Closed 2026-09-09, Rich's call: `make doctor` now asserts the host tools the
control plane spawns.** It was raised the same day and settled immediately —
`make doctor` is **17 checks** from here on. The check found a **third and a fourth**
undeclared dependency beyond the `git` and `openssl` that prompted it: `tar`, which
`build/context.ts` unpacks every source export with, and the **`docker buildx` CLI
plugin at `~/.docker/cli-plugins`**, which `runtime/docker/builder.ts` symlinks into a
throwaway `DOCKER_CONFIG` — buildx installed anywhere else passes `docker buildx
version` and still fails every build. It **runs** each tool with the control plane's own
invocation rather than looking on `PATH`, because presence was never the failure that
costs anything here: macOS ships LibreSSL, Homebrew puts OpenSSL ahead of it, and
`-addext` — which `mintSpKeypair` depends on — is the flag that differs.

**Closed 2026-09-07: P3's six spec actions are all applied**, with Rich's approval,
in one commit (`53ecb1d`) so they are one `git revert` away. Two consistency edits went
with them — §11's `isolationLevel` sentence and §21's divergence 6 both still said S6
was yet to run. The roadmap's *Spec actions raised by P3* section is the record.

**Closed recently:** the §11/§23 hostname disagreement — settled 2026-08-31 in §23's
favour and both spec edits applied. The environment kind lives in the **zone**, never
as a suffix on the label, because those suffixes are themselves legal slugs and
`{slug}-staging` is squattable across tenants. §11's row now points at §23.

**Closed 2026-09-05, by executing P1.** Two things that had been open assumptions:
the **offline** half of C1 (now demonstrated — `make up`, doctor and verify all
green with Wi-Fi off), and whether `make host-setup`'s three privileged steps work
as one bundled command (they do, first time). What remains untested is the
**second machine**; see `RUNBOOK.md`'s *Known gaps*.

**Closed recently:** who re-adds the `127.0.0.2` alias after a reboot. P1 decides it:
`make up` does, with `sudo`, guarded so it prompts only when the alias is missing. A
launchd daemon was rejected because it leaves a root-owned service `make reset` would
not remove.

---

## 9. Lessons — each one was paid for

These are about *how to work here*, and they are in the roadmap too, which is the
maintained copy.

- **Integration is where the false greens sit, and units cannot reveal them.** Two of
  the three worst discoveries in this project arrived the first time something ran end
  to end: P3's Task 15 found that **no build had ever succeeded**, and its Task 17
  found that **no deploy had ever succeeded either** — through seven defects of one
  shape, *the test constructs the value correctly and the running system re-derives it
  wrongly*. Both were invisible behind a fully green suite of 74 Docker tests, because
  a test hands the driver what it built while the control plane rebuilds it from a
  slug. **Schedule the end-to-end task early and drive it through the real entry
  point**, not through a harness.
- **A module with no call site is not built.** `waitForReady` and `edgeProbe` shipped
  in P3 Task 14 with passing tests and nothing called them until Task 17;
  `isSensitiveDiff` shipped in P2 and nothing called it for a whole plan. This is the
  same defect as the unwired boot entry point, and it has now happened three times.
  Every task should name its caller, not just its module.
- **Diagnosability is a feature, and its absence hides other defects.** A failed build
  recorded no reason at all (`void error`), and an unexpected 500 left no trace
  anywhere because the handler logged through a logger the server was built without.
  Fixing both took minutes and immediately named four further defects that had been
  invisible.
- **A plan is not verified until it runs, and the gap is not small.** P2's written
  self-review found seven defects. Then executing just **four of its twenty-one
  tasks** found **five more**, and not one was findable on paper: a package manager
  that makes an un-named build script a hard error, a lint config whose glob dialect
  silently has no extglob, a linter that does not honour the `_` convention the
  plan's own code assumed, a negative control aimed at a target that could not fail,
  and an unguarded table index that turned drift into a crash in an unrelated test.
  **Five defects in four tasks.** P3's own self-review then found **seven** more,
  the worst being that no task wired the Docker driver into the boot entry point — so
  its `make demo`, the plan's entire acceptance, would have passed against the fake
  driver. **Acted on 2026-09-04**: plan-writing stops until P3 has executed. Treat
  "the plan is written" as a hypothesis, and execute the cheapest representative
  slice early rather than banking a large unexecuted stack.
- **A green result is not evidence a control is in force.** S1's first build appeared
  to succeed while silently using the public npm registry instead of the mirror.
  Only checking the mirror's storage caught it.
- **Some defects are invisible to every test that could be written.** Executing P2's
  Tasks 12–21 produced 27 defects; **six were type errors** that `pnpm test` cannot
  see, because Vitest strips types without checking them, and **five were test
  isolation** — the suite passed or failed on the order Vitest happened to pick, and
  three suites had been green only because the database happened to be empty. Neither
  class is findable by reading a plan, and neither is findable by running its tests.
  The gates are the plan: run all four, and run the suite twice.
- **A guard whose enabling condition is written twice is a guard.** P2's
  `/auth/dev-login` passed `devAuthEnabled: true` as a literal because the route was
  only registered when the shim was on. Removing that single registration guard made
  the endpoint mint **real sessions** — a complete authentication bypass, one line
  from live, and it read correctly in review. The same shape produced an IDOR in
  `GET /builds/:id`. Two independent reads of one setting cost nothing.
- **Assert the shape of the answer, not that an answer arrived.** S3 ran six toolkit
  checks and all six passed; one was returning 192 numbers where 768 belonged, almost
  all zero, with no error anywhere. "It returned a vector" and "it returned the right
  vector" are different claims.
- **Treat a briefing document as evidence, not fact.** `START-HERE.md` stated that
  `/etc/resolver/test` pointed at a dead nameserver. It did not, and that one wrong
  premise forced the zone change.
- **A document that restates a number drifts from it.** ORIENTATION §2's *Code* row
  carried `make doctor` 14, `make verify` 31, `pnpm test` 224 and then 332, and
  `pnpm test:docker` 48 — **five stale figures at once**, four releases behind, while
  §3 and §7c of the same file had them right. A new agent's first act is to run the
  gates and compare, so the cost lands on exactly the person with the least context.
  Fixed structurally on 2026-09-07 rather than by correcting the numbers: **§2 now has
  one box, measured and dated, and every other mention points at it.**
- **Briefings go stale in days.** A handoff was sending its reader to a finished spike
  one day after it was written, and three of twelve "already pulled" images vanished
  between sessions. Anything stating current status needs an owner and a date — which
  is why the ledger exists and why this file says which of its sections decay.
- **Handoff chains strand durable knowledge.** The machine landmines in §4 spent a day
  behind a SUPERSEDED banner because they lived in a dated handoff. Durable content
  belongs in a durable document; only *what to do next* belongs in a handoff.
- **Prefer ownership-adjusted risk.** S2's risk was priced as existential and was not,
  because `docker-simple-saml` is ours. Ask what a "no" costs *given what we control*
  before ranking a risk.
- **Run the plan self-review; record what it caught.** P1's found five defects, the
  worst being a verification script that used `apk add` — which needs the network, so
  the offline acceptance test would have failed on its own harness. Writing down what
  the review caught stops the next reader mistaking a fix for a mistake.
- **Spikes came in far under their timeboxes** (~1.5 h, ~0.5 h, ~2 h, ~2 h against 3,
  2, 3 and 2 days). Do not re-plan the schedule on that: all four were the tractable
  ones, and the estimate that matters — C4's turnaround — is still unmeasured.
