# P6a baseline — the measurements Task 1 bought

**Run 2026-09-19, sitting 1 of [P6a](../../plans/2026-09-19-p6a-first-production-launch.md),
alone and first.** Ten measurements, `[M1]`–`[M10]`, taken before a line of P6a's feature
code exists. Every command and its untrimmed output is in
[`results-task1-2026-09-19.txt`](results-task1-2026-09-19.txt); this file is one section per
measurement — what was asked, the command, the raw answer, and what it means for the plan.

**The headline: R3 IS A GO, `ForceAuthn` IS HONOURED, and Decision 13 is now measured rather
than argued.** Nothing moved a task boundary, so **the eleven-sitting split stands**. Six
findings correct the plan in place, and the two that would have cost a sitting are **F1**
(Task 5 would have written a duplicate `ADD CONSTRAINT` and migration 0019 would have failed
to apply) and **F3** (Task 3 as written takes `edge.manifest.internal` off the internal
listener and `make verify` goes red with a TLS handshake error).

**The machine.** macOS 26.6.2 (25G83), arm64, 12 cores, 36 GiB. Node v24.12.0, pnpm 11.24.0,
Docker 29.7.2 (API 1.55, buildx v0.36.1-desktop.1), OpenSSL 3.6.3, bash 3.2.57. Caddy v2.11.4
with Coraza v2.6.0. Written at `8d90e15`; a parallel session committed `45e5b9d` during the
sitting.

---

## The four gate numbers, as this sitting found them

| Gate | Command | Answer | §2's box |
|---|---|---|---|
| unit + packages | `pnpm test` (repo root, run **twice**) | **1390 passed, 108 files**, 113.97 s then 115.04 s | 1390 / 108 — **agrees** |
| lint | `pnpm lint` | clean, exit 0 | — |
| types | `pnpm typecheck` | clean, all packages | — |
| format | `pnpm format:check` | *All matched files use Prettier code style!* | — |
| platform | `make doctor` | **18 checks, 0 failed, 0 warnings** | 18/0 — **agrees** |
| platform | `make verify` | **51 checks, 0 failed, 0 warnings** | 51/0 — **agrees** |
| Docker tier | `pnpm test:docker` | **NOT RUN, AND NOT OWED** — see `[M10]` | 178 / 29 |

Both `pnpm test` runs read identically, so the suite is repeatable. **`pnpm test:docker` was
not owed**: every file this sitting touched was touched *temporarily* and restored, and the
committed diff is this directory plus the plan. Nothing under `routing/`, `releases/`,
`identity/`, `sso/`, `infra/`, `projects/`, `launch/` or `build/` is changed by this commit.

---

## `[M1]` — the state this sitting started from, queried rather than recalled

```bash
lsof -nP -iTCP:7100 -sTCP:LISTEN; ifconfig lo0 | grep 'inet '; ls /etc/resolver/
docker ps --format '{{.Names}}\t{{.Status}}' | sort
docker exec manifest-postgres psql -U manifest_app -d manifest_control -c 'select count(*) …'
```

| | |
|---|---|
| **7100** | **nothing listening** — the control plane is a host process and was DOWN, exactly as §7e predicted |
| **`lo0`** | `127.0.0.1` and `127.0.0.2`. **`127.0.0.3` is NOT there** — Task 2's alias does not exist |
| **`/etc/resolver/`** | `manifest.internal`, `test` (Valet's — never touch), `vibonarium.local` |
| **containers** | nine platform, **twelve `mf-` containers across FOUR apps** — `journey-app`, `token-app`, `p5c-acceptance`, `proof-app` |
| **rows** | `projects` **0**, `users` **0**, `releases` **0**, `instances` **0** |

**The database was already empty while twelve app containers were running** — the ordinary
"containers outlive their projects" state after a `pnpm test`. Every measurement needing rows
therefore had to create them, which is what `make demo-journey` was run for.

### F6 — Task 1's own Step 1 destroys the state Step 2 exists to measure

Step 1 runs `pnpm test` twice; `pnpm test` TRUNCATES `projects` and `users`; Step 2's `[M1]`
then counts those tables. **`[M1]` was taken FIRST here**, before the baseline, which is the
only order in which it means anything. It cost nothing today because the tables were already
empty — on any other day it would have silently reported zeroes as "the state this plan starts
from". *Correction applied to Task 1's step order.*

### §2's box carries one stale state claim

`make verify`'s per-app INFO line read **`containers=12 networks=4 volumes=8`** at the start
of this sitting and again at its close. ORIENTATION §2's box says it "reads
`containers=6 networks=2 volumes=4` today". The box is right about the four *gate* numbers and
stale about this one INFO line — which is why §7e says state claims are not restated there.

---

## `[M2]` — there are TWO production gates, and only one of them carries the checklist

**Asked:** do both gates exist, is the inner one unreachable today, and what answers when the
outer one is removed?

```bash
grep -rn 'RELEASE_PRODUCTION_GATE_UNAVAILABLE' packages/control-plane/src | grep -v '\.test\.'
```

**Six non-test hits, not the three the task predicts:**

| File:line | What it is |
|---|---|
| `releases/release.ts:215` | **the INNER gate** — `ReleaseError`, thrown at the `if` on line 213 |
| `api/errors.ts:102` | `ProductionGateError`'s code |
| `api/routes/releases.ts:200` | the route's `errors:` list |
| `api/error-codes.ts:110` | the entry, `status: 409`, `families: ['api', 'ReleaseError']` |
| `api/authz-contract.ts:75` | **`REFUSAL_CODE`'s `409` mapping** — `[M8]`'s subject |
| `api/representations/errors.ts:30` | the `launchReadiness` field's description |

**Both gate line numbers in *Read this first* 1 are exactly right**: the route's gate is
`api/routes/releases.ts:233`, `deployRelease`'s is `releases/release.ts:213`, and the inner one
runs **before** the build is read (line 223).

### The measurement

With the route's gate commented out, rebuilt and the control plane restarted, a production
deploy as the project's owner answered:

```json
{"error":{"code":"RELEASE_PRODUCTION_GATE_UNAVAILABLE",
 "message":"production deployment requires the §13 LaunchReadiness checklist — … they are P6’s,
            and this gate stays closed until they do."}}
```

`.error | has("launchReadiness")` → **`false`**.

**The prediction was exactly right, and the consequence is sharper than the plan states.** The
two gates answer **the same status and the same code**; they differ only in whether the envelope
carries `launchReadiness`. So **a test that asserts status and code passes through both gates
identically** — `409 RELEASE_PRODUCTION_GATE_UNAVAILABLE` is true of a Task 7 that removed only
the outer gate. **Decision 3 is confirmed and Task 7 must remove both.**

> **Task 7's negative control must assert the PRESENCE of `launchReadiness`, not the code.**
> This is *assert the shape of the answer* in its purest form: the code is the same on both
> sides of the defect.

**Restore proved:** the route's gate answers again, `has("launchReadiness")` → `true`, 6 items.

### F7 — today's refusal can assert `ready: true` while refusing

With `computeLaunchReadiness` temporarily forced to mark every item `met` (`[M4]`'s positive
control), a production deploy still answered
`409 RELEASE_PRODUCTION_GATE_UNAVAILABLE` — **with `launchReadiness.ready: true` in its own
envelope.** The route's gate keys on `environment.kind === 'production'` and never reads
`ready`. **Task 7 REPLACES the condition; it does not merely satisfy the checklist**, and this
pair — ready true, still refused — is the control that proves it.

---

## `[M3]` — does SimpleSAMLphp honour `ForceAuthn`? **YES. HONOURED.**

**The measurement P4a's *four settings that read like controls and are not* exists to force.**
Headless, with the positive control in the same walk, one cookie jar per identity.

| | login form at hop 2 | `SAMLResponse` at hop 2 | `<title>` |
|---|---|---|---|
| **(a) control — flag ABSENT**, same IdP jar | **0** | **1** | `Sending message` |
| **(b) `forceAuthn: true`**, same IdP jar | **1** | **0** | `UBC SimpleSAMLphp` |
| **restore — flag removed again** | **0** | **1** | — |

And the flag was proved **on the wire**, by inflating the redirect binding's `SAMLRequest`:

```
ForceAuthn on the wire: ForceAuthn="true"        # with the flag
ForceAuthn on the wire: ABSENT (correct)         # after restore
```

**Control (a) fires**, so "a form appeared" means `ForceAuthn` and not a lost session: the IdP
demonstrably keeps a session across that jar and serves an assertion straight through without
the flag.

**What changes: NOTHING. Task 8 stands as written.** No IdP configuration step, no
`pnpm test:docker` debt, and **nothing for ORIENTATION §8** — §13's *"Approving requires
step-up re-authentication"* is satisfiable in substance on this machine, not merely in shape.

*Method note for Task 8:* `forceAuthn` sits in the `new SAML({…})` constructor in
`identity/saml.ts` (line 169 in this experiment, beside `disableRequestedAuthnContext`), which
is *Read this first* 3 confirmed — there is no per-request form.

---

## `[M4]` — the checklist for a real project, and the seventh-item probe

Read for `journey-app` (CWL, `audience.scale: class`), through the edge as its owner.

**Q1 — how many items?** **SIX**, all `blocking: true`:
`domain`, `iam-registration`, `privacy-assessment`, `rehearsal`, `scans`, `admin-approval`.
**`load-rehearsal` is absent** — it appears only for `large_course` or `public`, and this
project is `class`.

**Q2 — which are met?** `domain` (unconditionally) and `scans`. **The plan's phrasing of the
`iam-registration` rule is imprecise** — see F8.

**Q3 — `scans`?** `met`, with its reason: *"Its secret and lockfile gates passed and no finding
it introduced has a published fix. 1 finding(s) with no published fix are recorded on the
release (§12)."*

**Q4 — is `candidateReleaseId` the release SERVING STAGING?** Measured with a control in the
middle:

| Step | `candidateReleaseId` |
|---|---|
| at rest | `3690ca6d…` |
| **a second release created and NOT deployed** | **`3690ca6d…` — unchanged** |
| that release deployed to staging (`state: healthy`) | **`76dbecbd…`** |

The middle row is the control: it distinguishes *the release that serves* from *the newest
release*, and confirms §13's *promotion never rebuilds* expressed as a query.

**Q5 — THE ONE THAT DECIDES A TASK.** `ready` is
`items.filter(i => i.blocking).every(i => i.state === 'met')` (`launch/readiness.ts:147`).

| Experiment | `ready` |
|---|---|
| **positive control** — all six forced to `met`, no seventh item | **`true`** |
| six `met` **+ a seventh `blocking: true`, `state: 'not_built'`** | **`false`** |
| the same seventh item with **`blocking: false`** | **`true`** |

**Decision 13 is measured, not argued.** A seventh *blocking* item in `not_built` makes
production unreachable for ever, and the positive control proves the path could have said
`true`. `blocking: false` is a requirement, not a preference.

**Q6 — are the two paths still byte-identical?** `jq -S . | diff` of the read's body against
the `409` envelope's `launchReadiness`: **identical, 2279 bytes each.** P5c sitting 6's property
holds, and Task 7 must keep it.

### F2 — a new `LaunchItemId` is refused by the representation, with a `500`

The first attempt at Q5 pushed `{id: 'code-review'}` and the route answered **`500 INTERNAL`**:

```
ResponseContractError: getLaunchReadiness answered a body its representation refuses,
                       at: items.6.id
```

`LaunchReadinessItem.id` is a closed `z.enum([...])` in `api/representations/launch.ts:8-15`.
**Task 12 must add `'code-review'` there or the item cannot be served at all** — the plan's File
Structure already lists that file for T12, so this confirms the list and names the failure mode:
a loud `500`, not a silent drop.

### F8 — `iam-registration` is met only when there is ALSO a candidate release

*Read this first* 4 says `iam-registration` is met "when `auth.provider === 'none'`". The code
(`launch/readiness.ts`) is narrower:

```ts
const provider = (candidate?.release.resolvedConfig as ResolvedConfigSet | undefined)
  ?.production.auth.provider
// No candidate means no answer yet, and the conservative answer is that it will need one …
const usesCwl = provider !== 'none'
```

With **no candidate**, `provider` is `undefined`, `usesCwl` is `true`, and the item is
`not_built`. It also reads the **`production`** resolved config, not staging. **Task 7 must
preserve that conservative default** when it rewires the item to read a real `IamRegistration`
row: "no candidate" must not become "no registration needed". *The non-CWL project was read
from the code rather than deployed — said plainly rather than implied.*

---

## `[M5]` — what the second listener actually costs. **R3: GO.**

> **THE GO/NO-GO, in one sentence: the split is affordable in one sitting — (a) and (b) both
> work on this machine, (c) is Decision 15's known work and not a blocker, and (d) costs
> 7 s plus a 546 ms control-plane restart. Decision 1's fallback is NOT taken, and Spec
> action 1 stays live.**

### (a) Two servers in one Caddy container — **works**

```
PUT  /config/apps/http/servers/srv1   -> status 200      (node:http, NOT fetch)
GET  /config/apps/http/servers        -> ["srv0","srv1"]
from manifest-platform: http://manifest-caddy:8443/ -> "srv1 probe" [200]
DELETE /config/apps/http/servers/srv1 -> status 200
GET  /config/apps/http/servers        -> ["srv0"]        (control (d) satisfied)
after the delete: manifest-caddy:8443 -> curl (7) Could not connect
```

`srv0` today: `listen: [":443"]`, 3 routes, **0 carrying an `@id`**. **The PUT's status was
asserted**, which is the whole point of P5c sitting 1's F1.

### (b) The dnsmasq split with the pin-backs — **works, and the pin-back list is incomplete**

A throwaway `manifest-dnsmasq:local` on `127.0.0.1:7154` carrying exactly Decision 1's rules:

| name | answer | wanted |
|---|---|---|
| `demo-app.manifest.internal` | `127.0.0.3` | `127.0.0.3` ✅ |
| `journey-app.manifest.internal` | `127.0.0.3` | `127.0.0.3` ✅ |
| `demo-app.staging.manifest.internal` | `127.0.0.2` | `127.0.0.2` ✅ |
| `demo-app.sandbox.manifest.internal` | `127.0.0.2` | `127.0.0.2` ✅ |
| `console.manifest.internal` | `127.0.0.2` | `127.0.0.2` ✅ |
| `idp.manifest.internal` | `127.0.0.2` | `127.0.0.2` ✅ |
| **`edge.manifest.internal`** | **`127.0.0.3`** | — **see F3** |

AAAA still answers `NOERROR` (NODATA), so `--local` survives the split. **dnsmasq's
more-specific rules do win** — measured, not assumed, and on a throwaway rather than on the
real resolver.

> *Method note, and it nearly cost this measurement:* the first pass compared `"$A"` with
> `"$2"` after `set -- $PAIR` — and **zsh does not word-split an unquoted variable**, so both
> were empty and every row printed a vacuous `OK`. ORIENTATION §4 names this exact trap. The
> table above is the re-run with a shell function taking real arguments.

### (c) The container-side resolver — Decision 15's work, confirmed, not a blocker

```
container -> https://demo-app.manifest.internal/       :443  -> http=200, ip=10.89.0.10
container -> http://demo-app.manifest.internal:8443/   :8443 -> "srv1 probe" [200], ip=10.89.0.10
```

The container resolver answers `10.89.0.10` **for the whole zone, production included**, so a
production app's probe reaches **srv0** today — *Read this first* 8 confirmed. `:8443` **is**
reachable from `manifest-platform`, so Decision 15's probe port is sound.

**And the plan's safety claim holds**, read from `routing/readiness.ts:98-102`: `waitForIdentity`
refuses a `200` carrying no `X-Manifest-Instance` with *"that is the edge's wildcard, not a
routed app"*. A production probe that reached the wrong listener would **fail loudly**.
`edgeIdentityProbe`'s options are `{ network?, dnsServer? }` — Decision 15 adds `port` to that
object.

### (d) What a `compose.yaml` change costs — **less than the plan says, and only sometimes**

| change | container recreated? | `make up` | runtime routes |
|---|---|---|---|
| **a comment line** in the `caddy:` service | **NO** — same id `83460164f0c7` | **2 s** | **1 → 1, survived** |
| **one published port** (`127.0.0.1:7158:8443`) | **YES** — `83460164f0c7` → `d15e70b7d9c8` | **7 s** | **1 → 0** |
| control-plane restart afterwards | — | **546 ms** boot-to-ready | **0 → 1** (`routesRestored: 1`) |

### F4 — *Read this first* 9 is right in substance, wrong in trigger

It says "a `compose.yaml` change recreates `manifest-caddy` and drops every runtime route".
**Compose recreates on a change to the service's CONFIG, not to the file.** A comment or
whitespace edit costs nothing and keeps every route. Tasks 2 and 3 do change the config (ports,
command), so they do pay it — but sitting 2 should not budget a recreate for every save, and
**the route-drop window is bounded by a 546 ms control-plane restart**, which is far cheaper
than the note implies.

### F3 — **Task 3 as written takes `edge.manifest.internal` off the internal listener**

`edge.manifest.internal` is a §23 reserved label (`infra/reserved-labels/labels.yaml`,
*"Manifest's edge proxy"*), it lives in the **bare production zone**, and **it has no explicit
site in the Caddyfile** — only `idp.` and `console.` do. It is served today by the
`*.manifest.internal` wildcard, which **Task 3 moves to `srv1`**.

Containers resolve the whole zone to `10.89.0.10` = **srv0**, and srv0 would then have no site
matching that Host. Measured what that costs:

```
container -> 10.89.0.10:443, Host: foo.notazone.test   (no site on srv0)
  curl: (35) TLS connect error: error:0A000438:SSL routines::tlsv1 alert internal error
container -> 10.89.0.10:443, Host: edge.manifest.internal  (matches the wildcard TODAY)
  manifest OK host=edge.manifest.internal scheme=https remote=10.89.0.13 [200]
```

**It fails at the TLS handshake, not with an HTTP status** — Caddy cannot produce a certificate
for an unmatched Host. So the failure reads as a CA or certificate fault rather than a routing
one, which is the expensive kind.

Three production-zone names the platform's own scripts probe:
`edge.manifest.internal` (**breaks**), `idp.manifest.internal` (explicit site, pinned back — safe),
`verify-probe.manifest.internal` (host-side only, and genuinely production-shaped — safe).

**`make verify` has a check for exactly this** — *"a container reaches
https://edge.manifest.internal with the platform CA"* — and it would go red in sitting 2.

> **The repair, and it belongs in Tasks 2 and 3 rather than in a debugging session:** add
> `edge.manifest.internal` to Decision 1's dnsmasq pin-back list beside `console.` and `idp.`,
> **and** give it an explicit site on `srv0` in the Caddyfile. It is a platform surface, not a
> faculty app, and it should stay on the internal listener for the same reason they do.

### Also confirmed: `upstreamsInUse` survives the split

`routing/routes.ts:185` iterates `new Set(Object.values(deps.servers))`, so two distinct server
names simply produce two iterations. *Read this first* 7 is correct. **But `routes.test.ts:11`
fixes `SERVERS = { internal: 'srv0', public: 'srv0' }`** — so nothing in the unit tier exercises
the two-server path today, and Task 4 should add a case that does.

---

## `[M6]` — a platform admin CAN mint a delegated token holding `release:approve`

Measured **through the mint route**, because a token written straight to the store proves
nothing about what the platform will issue (P5b sitting 4, F1).

| request, as `opr000001` (`role: admin`) | answer |
|---|---|
| **(b) control:** `capabilities: ["release:promote"]` | **`400 TOKEN_CAPABILITY_FORBIDDEN`** — *"a delegated token may never hold release:promote (D24)"* |
| **the measurement:** `capabilities: ["release:approve"]` | **MINTED** — `tokenId db528c40…`, `capabilities: ["release:approve"]`, secret returned once |

**Control (b) fires**, so "it was minted" is a fact about `release:approve` specifically and not
about a mint route that refuses nothing.

***Read this first* 2 is confirmed, Decision 4 and Decision 9 are both confirmed, and Spec
action 2 is real.** The day Task 10 gives `release:approve` its first route, a token minted this
way could approve a production release with no person in the loop — D14 inverted. The control is
`requireSession` plus step-up, and Task 9 writes the test.

**The probe token was revoked immediately** (`DELETE /v1/tokens/{tokenId}` → `200`; the list
then reads `revoked: true`), and the response file holding its secret was deleted. The secret
never entered the session transcript — it was masked with `sed 's/[a-zA-Z0-9]/x/g'`.

---

## `[M7]` — what D22's coverage gate does with an uncalled operation

**Baseline:** `coverage.test.ts` **2 passed**; the document declares **34 operations**;
`DELIBERATELY_UNCALLED` is **empty**.

A throwaway `GET /v1/m7-probe` added to `ROUTE_DEFINITIONS`, then `pnpm contract:write &&
pnpm contract:generate` → **35 operations**, `m7Probe` present, no console caller. The gate:

```
FAIL packages/console/src/coverage.test.ts > every operation in the published contract has a caller
AssertionError: expected [ 'GET /v1/m7-probe (m7Probe)' ] to deeply equal []
   at packages/console/src/coverage.test.ts:117
```

**The message format is `METHOD /path (operationId)`** — Tasks 17 and 18 will read it often.

Then the operation was put into `DELIBERATELY_UNCALLED` with the reason
`'a nonsense reason nobody checked'` → **2 passed, green.** **The gate reads the KEY and never
the reason.** *Read this first* 18 confirmed: **a reviewer reads that list, the gate will not**,
and P6a adds seven operations to its input.

**Control (c) satisfied on restore:** 34 operations, `m7Probe` absent, coverage **2 passed**,
`git status` clean.

### F5 — `pnpm contract:write` FAILS rather than writing when `ROUTE_DEFINITIONS` is malformed

The first attempt left a double comma (`}),,`) — a sparse-array hole — and `contract:write`
answered **4 failed | 2 passed** with `TypeError: Cannot read properties of undefined (reading
'method')`, **writing nothing**. That is the document test doing its job, and it is worth
knowing before Tasks 6, 8, 10 and 14 each add routes: **a red `contract:write` means the route
list, not the document**, and `openapi.json` is left untouched.

---

## `[M8]` — the authorization matrix's production row, and what Task 7 does to it

**370 tests in `api/authz-contract.test.ts`** = 41 route cases × 9 actors + 1 completeness test.
Actors: `owner, collaborator, stranger, admin, anonymous` + `token-capable, token-incapable,
token-other-project, token-privileged`.

The production-deploy row (`authz-contract.ts:813-834`):

| actor | expected |
|---|---|
| `owner` | **`409`** |
| `collaborator` | `403` |
| `stranger` | `404` |
| `admin` | **`409`** |
| `anonymous` | `401` |
| `token-capable` / `token-incapable` / `token-privileged` | `PENDING` = `{403, TOKEN_ACTION_PENDING}` |
| `token-other-project` | `404` |

**Which expectations are about the GATE rather than authorization?** Exactly the two `409`s —
`owner` and `admin`. They are the only `409,` literals in the file. The row's own comment says
what happens next: *"The day readiness can be met this row goes red, which is a contract suite
doing its job."*

**Does `REFUSAL_CODE` need a `STEP_UP_REQUIRED` entry? No — and the plan already says so
correctly.** `Expectation` is `'pass' | RefusalStatus | { status, code }`, and `PENDING` and
`SESSION_ONLY` are already explicit pairs. Task 9 adds a third const beside them, not a
`REFUSAL_CODE` row (`403` is spoken for by `FORBIDDEN`).

### F9 — this row cannot fail for Task 7

`owner: 409` passes today because the gate is unconditional. After Task 7 it will still pass,
because the fixture project's blocking items are not met and the gate correctly refuses. **The
row's text is unchanged and its meaning is entirely different**, so the matrix is green on both
sides of Task 7 — including a Task 7 that left `assertLaunchable` throwing unconditionally.
**The matrix is not a control for Task 7**; `[M2]`'s `launchReadiness`-presence assertion is.

*(Minor, but it costs a run: the task's snippet is `vitest run --project unit
src/api/authz-contract.ts` — no `.test`. It answers `No test files found, exiting with code 1`.)*

---

## `[M9]` — what a production SP registration WOULD write

`deployRelease` registers an SP inside `if (auth?.provider === 'cwl')`
(`releases/release.ts:412`), from `deriveSpEntity` (`sso/entity.ts`) with
`entityBase = MANIFEST_SP_ENTITY_BASE` (default `https://manifest.internal`) and the
**environment row's** hostname. Derived by hand for `journey-app`, since nothing has ever run it:

| | production | staging (for contrast) |
|---|---|---|
| `entityId` | `https://manifest.internal/sp/journey-app/production` | `…/sp/journey-app/staging` |
| `acsUrl` | `https://journey-app.manifest.internal/auth/ubcshib/callback` | `https://journey-app.staging.manifest.internal/…` |
| `sloUrl` | `https://journey-app.manifest.internal/auth/logout` | `https://journey-app.staging.manifest.internal/auth/logout` |
| `attributes` | `[ubcEduCwlPuid, mail, eduPersonAffiliation, givenName, sn]` | the same |

The three environment rows exist from creation and the production hostname is already
`journey-app.manifest.internal` — *Read this first* 6 confirmed. **A production registration is
a genuinely new row**, different entityID and different ACS, which is precisely what R2's
rehearsal exists to prove the shape of.

**And what Task 14 needs and is not obvious:** for an app with `auth.provider: none` the SP is
never registered **because the CALLER guards it**, not because `deriveSpEntity` refuses —
`SP_ENTITY_PROVIDER_NOT_CWL` is unreachable from a deploy. So the rehearsal item for such an app
has **nothing to rehearse and no error to catch**, and must say so in its own `why` rather than
reporting a failure. (R2 also requires that `why` to say the rehearsal proves the registration's
SHAPE and never UBC's acceptance of it.)

---

## `[M10]` — the event CHECK constraint, and what the Docker tier costs

**Three lists compared, and all three agree at 21 types:**

| source | count |
|---|---|
| migration `0017_thin_snowbird.sql`'s `CHECK` | **21** |
| `EVENT_TYPES` in `observability/events.ts` | **21** |
| **the constraint IN FORCE**, `pg_get_constraintdef` on the live database | **21** |

`diff` of migration vs constant: identical. `diff` of live vs constant: identical.

### F1 — ***Read this first* 16 is wrong on the fact it rests on, and Task 5's step would break migration 0019**

The plan says *"nothing asserts the two lists agree"* and that a missing CHECK rewrite fails at
runtime *"with every unit test green"*. **Both halves are false.**

1. **`observability/events.test.ts:283` asserts exactly that**, by reading
   `pg_get_constraintdef` out of Postgres and comparing with `EVENT_TYPES` — *"a type added to
   the code without a migration fails here, and so does a migration that never applied."* It
   runs in the **unit** tier, in `pnpm test`. The danger the plan warns about is already covered.
2. **The constraint IS expressed in `schema.ts`** (`db/schema.ts:520-523`, a
   `check('events_type_known', …)` in the table's extra config), and the drizzle snapshot tracks
   it (`0018_snapshot.json` → `audit.events -> ['events_type_known']`).

**Measured empirically, which is what settles it.** One event type added to `schema.ts`'s check
and `drizzle-kit generate` run:

```sql
ALTER TABLE "audit"."events" DROP CONSTRAINT "events_type_known";--> statement-breakpoint
ALTER TABLE "audit"."events" ADD CONSTRAINT "events_type_known" CHECK (… , 'm10.probe'));
```

**Drizzle writes the DROP + ADD pair itself, with the new type in it.** Task 5's step says
*"Drizzle will NOT have written the audit.events CHECK — it is not expressed in schema.ts.
APPEND, in the same file"* — following it appends a **second** `ADD CONSTRAINT
"events_type_known"` to a file that already has one, so **migration 0019 fails to apply** with
*constraint … already exists*. And ORIENTATION §4 records what a half-applied migration costs:
*"An applied migration that is missing a line is REPLAYED, not patched."*

**Correction applied to Task 5.** The generated 0019, its snapshot and `_journal.json` were all
removed and `_journal.json` restored from a copy; `git status` clean, 19 migrations, journal
last entry `0018_curvy_sister_grimm`, and `events.test.ts` re-run **16 passed**.

### The Docker tier

**`pnpm test:docker` was NOT RUN and is NOT OWED.** Every source file this sitting touched was
restored in the same step and the committed diff is documentation only. §2's box records the
tier at **178 passed, 0 skipped, 29 files, 795 s**, and that it regenerates seven dead app
networks and one volume — **neither re-measured here, and deliberately not restated as though it
were.** Sitting 2 owes it (Tasks 2 and 3 touch `infra/`), and should budget the ~13 minutes.

---

## Negative controls

| | Control | What it proves | Predicted | **Measured** |
|---|---|---|---|---|
| **a** | `[M3]`'s ordinary sign-in with the same IdP jar | the IdP DOES keep a session, so "a form appeared" means `ForceAuthn` | no login form | **0 forms, `SAMLResponse` served — fired** ✅ |
| **b** | `[M6]`'s `release:promote` mint beside the `release:approve` one | the mint route refuses D24's four | `400 TOKEN_CAPABILITY_FORBIDDEN` | **exactly that — fired** ✅ |
| **c** | `[M7]`'s restore, re-run | the gate is green again and the probe is gone | 2 passed | **2 passed, 34 operations, `git status` clean** ✅ |
| **d** | `[M5](a)`'s `DELETE` of `srv1`, keys read back | the measurement left the edge as it found it | `["srv0"]` | **`["srv0"]`, and `:8443` refuses — fired** ✅ |
| **e** | `[M4]` Q5's all-met run **without** the seventh item | the `ready` path can answer `true` at all | (added here) | **`ready: true` — fired** ✅ |
| **f** | `[M4]` Q4's created-but-undeployed release | the candidate tracks SERVING, not NEWEST | (added here) | **candidate unchanged — fired** ✅ |

**Six controls, all six fired.** (e) and (f) were added because Q5 and Q4 are otherwise negative
claims, and *a negative claim needs a positive control in the same experiment*.

---

## Everything that was temporarily changed, and the proof it was restored

Every one was restored **in the same step**, and each restore was **re-measured** rather than
assumed.

| File | For | Restore proved by |
|---|---|---|
| `db/schema.ts` + generated `0019_*.sql`, `0019_snapshot.json`, `_journal.json` | `[M10]` | `git status` clean, 19 migrations, journal at `0018`, `events.test.ts` **16 passed** |
| `api/routes/me.ts`, `packages/console/src/coverage.test.ts`, `packages/contract/openapi.json` (+ generated client) | `[M7]` | 34 operations, `m7Probe` absent, coverage **2 passed**, `git status` clean |
| `identity/saml.ts` | `[M3]` | `ForceAuthn` **ABSENT on the wire**, 0 forms, `SAMLResponse` back |
| `launch/readiness.ts`, `api/representations/launch.ts` | `[M4]` | 6 items, `ready: false`, 0 `THROWAWAY` markers |
| `api/routes/releases.ts` | `[M2]` | `409` carries `launchReadiness` again, 6 items |
| `infra/compose.yaml` | `[M5](d)` | `git diff --stat` empty; `make up` re-run |
| a throwaway `srv1` on the edge; a throwaway `p6a-dns-probe` container | `[M5](a)(b)` | `["srv0"]`, `:8443` refuses, container removed |

**`git status` was clean between measurements and is clean now** but for a parallel session's
two untracked files (`docs/superpowers/design-handover.md`, `scripts/design-handover.mjs`),
which are **not this sitting's and were not staged**.

## The machine, at close

`make doctor` **18/0**, `make verify` **51/0**. `bash scripts/dead-app-resources.sh` reads
**`none dead`, 0 networks and 0 volumes**. `bash scripts/litellm-orphans.sh` found **one**
orphan (`mf-3dd1b1af-…-staging`, from the project `make demo-journey` replaced); **`--apply` was
ALLOWED this session and was run**, and a bare re-run afterwards reads **`Orphaned (0)`** with
all four held users surviving.

`snapshot-machine.sh` before/after differs only in: clocks and uptimes; free disk 65 → 57 GiB;
`manifest-caddy` recreated twice by `[M5](d)` and now healthy; `journey-app`'s instance replaced
(`fbe50608` → `76dbecbd`) with its volume, and one new app image — **all of it the deliberate
product of `make demo-journey` and `[M4]` Q4**, which are platform operations rather than
machine changes. The four containers that must survive are present, and
`docker-simple-saml` is clean but for its long-standing untracked `cert.zip`.

**The control plane was started for this sitting and STOPPED at its close**, leaving `7100` free
as `[M1]` found it. It was run with a **stable** `MANIFEST_SESSION_SECRET` rather than the
README block's random one, deliberately: this sitting restarted it six times and a fresh secret
would have invalidated every cookie jar between measurements (ORIENTATION §4). **The next
sitting should use the README block as written** — a stable secret also lets an earlier
sitting's cookie survive, which is the opposite trap.
