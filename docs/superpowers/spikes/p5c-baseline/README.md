# P5c sitting 1 — the measurements this plan rests on

**Run 2026-09-18, on `Richs-MacBook-Pro.local`.** Task 1 of
[`plans/2026-09-18-p5c-the-clients.md`](../../plans/2026-09-18-p5c-the-clients.md), alone and
first. **This sitting wrote no console code.** Its output is this directory, a one-line change
to `routing/caddy.ts` that M8 forced, and a `[M<n>]` correction block on each task a measurement
moved.

Raw commands and their unedited answers: [`results-task1-2026-09-18.txt`](results-task1-2026-09-18.txt).

**Versions**, because a finding without one is not reproducible: macOS 26.6.2 (build 25G83),
arm64, 12 cores; Node v24.12.0; pnpm 11.24.0; Docker 29.7.2 (build a7dcaa6), engine API 1.55;
Caddy 2.11.4; `ws` 8.21.3; `openapi-fetch` 0.17.0; `@manifest/contract` 0.1.0.

---

## What this sitting changes about the plan

**Nine of the twenty *Read this first* items carry a `(T1: M<n>)` marker. All nine were
re-checked and all nine held.** No task boundary moved, so the nine-sitting split stands
unchanged. What moved is smaller and sharper than P5b sitting 1's five-task shuffle.

**This sitting produced 18 findings; the eight below are the ones that change what a later
sitting does.** The full list, F1 to F18, is in the plan's
[*What executing this plan found*](../../plans/2026-09-18-p5c-the-clients.md#what-executing-this-plan-found)
— the other ten are method lessons (how to catch a gate that is green because it never ran, why
a request header cannot be read from the extension, why `pgrep` will tell you a Docker tier has
finished when it has not) and confirmations taken with controls.

| # | Finding | Lands on |
|---|---|---|
| **F1** | **M8's own snippet could not have measured what it exists to measure**, and would have closed Rich's question the *wrong* way | Task 1 (this sitting), §8 |
| **F2** | §8's question is **answered: the socket IS cut.** `buildRoute` now carries `stream_close_delay` | `routing/caddy.ts`, §8 |
| **F3** | The contract's `exports` map points `tsc` at **source** and Vite at **`dist/`** — a stale `dist/` ships silently | Tasks 2, 4, 13 |
| **F4** | `ajv` alone is not enough: **185 format assertions need `ajv-formats`**, and Task 2 is the last chance to install it | Task 2, Decision 9 |
| **F5** | "34 operations = 33 paths + the stream" is **wrong**: the stream is one of the 34 paths | Task 13, Decision 15 |
| **F6** | The M4 probe **rewrites `pnpm-lock.yaml`**; `rm -rf` alone does not restore the tree | Task 1 (this sitting), Task 2 |
| **F7** | The edge **preserves `Host`**, so Vite needs `allowedHosts` | Tasks 2, 4 |
| **F8** | The extension **cannot show request headers** — echo them from an upstream you own | Task 14, any later browser sitting |

---

## The ten measurements

### Baseline — the four gate numbers

**ORIENTATION §2's box was met exactly**, which is what makes every number below trustworthy:
`pnpm test` **1344 passed in 101 files** (twice: 110.3 s and 107.1 s — repeatable, no state
leak), `make doctor` **18/0**, `make verify` **51/0**, `pnpm lint` / `pnpm typecheck` /
`pnpm format:check` all clean. The control plane was already running on 7100 (pid 14881),
answering `401 UNAUTHENTICATED` through the edge, with the console placeholder byte-for-byte
as §7e described it.

> **One disagreement inside ORIENTATION, and §2's box loses it.** The box says `make verify`'s
> per-app INFO line "reads `containers=3 networks=8 volumes=3` today". It reads
> **`containers=3 networks=1 volumes=2`** — which is what §2's *own* `Outstanding` bullet says
> it should read after Rich cleared the dead resources. The box's sentence is stale, not the
> machine. Swept.

### M1 — the edge serves a host process on 7104 ✅

`respond` swapped for `reverse_proxy host.docker.internal:7104`; a Node server bound to
**`127.0.0.1`** (not `0.0.0.0`) answered through the edge. `/` and `/any/deep/path` both `200`
from the host process; `/v1/me` still `401` from the control plane. **The API and the console
coexist on one origin.** Decision 4 stands.

Two things the plan did not ask for and the console needs:

- **The edge preserves `Host: console.manifest.internal`** rather than rewriting it to the
  upstream. Vite's dev server rejects unknown hosts, so **Task 2/4 must set
  `server.allowedHosts`** (F7).
- **The path arrives unchanged**, but the edge does **no SPA fallback** — the probe faked it by
  serving `index.html` for every path. `vite preview` does its own, so this is a note for
  Task 4, not a change to any decision.

The Caddyfile is a single-file bind mount, so the edit was made **inode-preserving**
(`r+`/`ftruncate`, inode `48091939` before and after). A rename-over — which an ordinary editor
and `git checkout` both do — would have left `manifest-caddy` on the deleted inode.

### M2 — what a real browser sends, signed out ✅

Chrome, nobody signed in, **no password anywhere in this measurement**:

```
GET  /v1/me       -> 401 UNAUTHENTICATED
POST /v1/projects -> 401 UNAUTHENTICATED     (not 403 CSRF_ORIGIN_REFUSED)
WebSocket         -> close 1006, reason "", wasClean=false
```

All three as predicted. The `401` on the POST confirms `assertSameOrigin` keys on the session
cookie; `1006` is what a refused upgrade looks like to a browser, and *not* `4404`, so
*Read this first* 4 holds.

**The literal `Origin` is `https://console.manifest.internal`** — scheme and host, no trailing
slash, no port — captured by POSTing to a non-`/v1` path so the 7104 upstream logged the header
byte-for-byte. This also proves **the edge passes `Origin` through unchanged**, which nothing
had measured.

> **Method note (F8).** The plan says to read the value in Chrome's Network tab. The extension's
> `read_network_requests` returns URL, method and status — **not request headers**. When a
> literal request header matters, **echo it from an upstream you control**. Do not plan a
> measurement around reading it out of DevTools.

### M3 — a WebSocket upgrade survives the host hop ✅

`MESSAGE hello` from a Node client, and `ws open` / `ws message hello` from a real browser.
**Task 2 does not need `server.hmr: false`.** `Host` and path (`/hmr-probe`) both arrive intact.

The browser sends **`Origin: https://console.manifest.internal` on the upgrade** — *Read this
first* 4 asserted this from the specification; this measures it end to end through the edge.

### M4 — is a new package seen by the four gates? ⚠️ **one of four is silently green**

A `packages/m4-probe` containing `expect(1).toBe(2)`:

| Gate | Result |
|---|---|
| `pnpm test` | **exit 0. 1344 passed, 101 files — identical to baseline.** `grep -c m4-probe` of the output: **0**. The file was never collected. |
| `pnpm lint` | **exit 1** — reads the package. (First run exited 0; that was *ambiguous*, so a deliberate `any` bait file was added to disambiguate. It fired `@typescript-eslint/no-explicit-any`.) |
| `pnpm typecheck` | **Discovers it, then skips it silently.** `Scope: 3 of 4` became `Scope: 4 of 5`, but the same three packages ran `tsc`. No `typecheck` script ⇒ no word said. |
| `pnpm format:check` | **exit 1** — flags both files. Prettier owns `packages/` with no configuration. |

This is exactly *Read this first* 14, and it is why Task 2 exists. **Task 2's control — a
deliberately failing test watched going red — is the right control, and the table above is the
before-measurement it gets watched against.**

> **F6, which the plan's Step 5 does not anticipate.** Its cleanup is
> `rm -rf packages/m4-probe && git status --short  # must be clean`. It is **not** clean: any
> `pnpm` command run while the probe exists rewrites `pnpm-lock.yaml` (`+  packages/m4-probe: {}`).
> Restored with `git checkout pnpm-lock.yaml`. In Task 2 the same edit is *legitimate* and belongs
> in the commit.

### M5 — a browser bundle can consume `@manifest/contract` ✅

The entry graph is exactly `./client.js`, `./errors.js`, `./stream.js`, `openapi-fetch` — **no
`node:` builtin**. Followed one level further: `openapi-fetch@0.17.0`'s `dist/index.mjs` has
**zero imports and zero builtins** and uses the `fetch` global. **Nothing needs a polyfill.**

`dist/` does hold compiled test files importing `node:fs/promises`, `node:http`, `node:crypto`,
`vitest` and `openapi-typescript` — they *would* break a bundle, nothing in the entry graph
reaches them, and they must not be imported. There is no `dist/schema.js` at all.

> **F3 — the finding the plan does not have.** `packages/contract/package.json` declares
> `"exports": { ".": { "types": "./src/index.ts", "default": "./dist/index.js" } }`.
> **`tsc` reads the source; Vite bundles `dist/`.** So the console typechecks against fresh
> types and ships whatever `dist/` last held, and **nothing reports the divergence** — `tsc` is
> green because it never reads `dist/`, Vite is green because it never reads `src/`.
> `pnpm --filter @manifest/contract build` must run before the console is built or previewed,
> and in Task 13's CI script before the acceptance. Decision 14's `1.0.0` bump changes `dist/`
> and so must be followed by a build.

### M6 — `?returnTo=` keeps a deep path ✅ (with a negative control)

```
returnTo=/projects/deep/path   -> cookie decodes to "/projects/deep/path"   KEPT
returnTo=//evil.example.com/x  -> cookie decodes to "/"                     REFUSED
```

**The console's router may use real paths. Decision 3 stands**, and Task 4's fallback (carrying
the route in a query string on `/`) is not needed. The second line is the control that makes
this a measurement: the mechanism keeps a legitimate path *and* discards a hostile one.

Properties of `manifest_login` that Task 4 and Task 14 must live with: `Path=/auth`, `HttpOnly`,
`Secure`, `SameSite=None` (the IdP POSTs back cross-site), **`Max-Age=600`** — a sign-in left
sitting on the IdP page **longer than ten minutes loses its return path**, which is worth
knowing for Task 14's shared run where a human is typing.

### M7 — 34 operations ✅, but the plan's arithmetic is wrong ⚠️

**34 operations**, eleven `Idempotency-Key` headers and two query parameters (`getBuildLog`'s
`tail`, `getProject`'s `expand`) — 13 operations carrying an extra parameter, exactly as
*Read this first* 2 says. **No route has moved since the plan was written.**

> **F5.** Step 8 calls this "34 operations (33 paths plus `streamProjectEvents`)". Measured,
> **`streamProjectEvents` IS one of the 34 paths** — `GET /v1/projects/{projectId}/events`, in
> `d.paths`. It is 34 paths, one of which is the stream; not 33 + 1.
>
> **Why it matters:** Decision 15 defines the coverage gate as every operation in `openapi.json`
> *"plus the stream"*. An author who believes the stream is outside the 34 will demand a 35th
> caller and the gate will never balance. **Task 13 must enumerate from `d.paths` only (34,
> stream included)**, and add *only* the two genuinely-unversioned `/auth/` endpoints from
> `src/auth.ts`. The control plane's own `coverage.test.ts` agrees: the stream is *"documented
> and never defined"* — absent from the **definitions**, present in the **document**.

### M8 — **§8's question, answered: the socket IS cut** 🔴 → fixed

The measurement §8 has wanted since 2026-09-16, against a route shaped as `buildRoute` shapes
one (not the bare `reverse_proxy` of the snippet — the question is about what the *platform*
writes):

```
A / no field:  ws OPEN -> unrelated route inserted (200) -> CLOSED code=1001, 2ms after the reload
B / with 1h:   ws OPEN -> unrelated route inserted (200) -> SURVIVED 17971ms, still open
```

**Proved in both directions, which is what makes it a measurement rather than an observation.**
Per R2, `routing/caddy.ts`'s `buildRoute` now sets `stream_close_delay: 3_600_000_000_000`
(nanoseconds; `"1h"` is a different type the admin API refuses), matching the hour the console's
own site has carried since P5a. **§8's item closes with the value.**

*The value is a decision, and here is its reasoning:* an hour matches the console, so an app's
stream and the console's stream outlive a reload by the same amount. What it costs is that a
stream opened on an old config keeps the old handler — and so the old upstream — alive for up to
that long; that is bounded in practice by §11's retire drain, after which the container is gone
and the held connection breaks anyway. Recorded rather than hidden, because §8's question *was*
the value.

> ### F1 — the plan's own M8 snippet would have answered Rich the wrong way
>
> The snippet causes the unrelated config change with **node's `fetch`**:
>
> ```js
> fetch("http://127.0.0.1:7119/config/...", {method:"PUT", ...})
>   .then(()=>console.log("unrelated route inserted"));
> ```
>
> `routing/caddy.ts` documents at length — and this sitting re-measured — that this **cannot
> work**: undici appends `Origin: ''` to every non-GET, Caddy's admin listener has an empty
> allowed-origin list, and it answers **`403 "client is not allowed to access from origin ''"`**.
> That is why the control plane's own `adminRequest` uses `node:http` and not `fetch`.
>
> So the snippet as written would have (1) held the socket open, (2) been refused `403`,
> (3) **printed `"unrelated route inserted"` anyway** — the `.then()` checks neither `r.ok` nor
> `r.status` — (4) reached its 20-second timeout and printed **`SURVIVED 20s, still open`**, and
> (5) closed §8 as *"measured, and not a problem in Phase 1"* — **the opposite of the truth** —
> on a config reload **that never happened**.
>
> **The correction is not "use curl". It is: assert the admin call's status**, and refuse to
> report `SURVIVED` unless a reload is known to have happened. The client used here does both,
> and exits `3` with `MEASUREMENT INVALID` rather than reporting anything.

Both routes were removed and **read back** (`unknown object ID` for each); the edge holds its
three Caddyfile sites and **0 runtime routes**, matching the Step 1 baseline.

### M9 — a 2020-12 validator can read the document ✅

`openapi 3.1.0`, 52 component schemas, and **none** of `prefixItems`,
`unevaluatedProperties`/`Items`, `dependentSchemas`, `$dynamicRef`/`$dynamicAnchor`,
`$recursiveRef`. **Task 12 has no compilation problem to solve.** Decision 9 stands, including
that it must be `ajv/dist/2020` and not the default export.

The counts also *prove* Decision 9's argument instead of asserting it: **112
`additionalProperties`, 166 `pattern`, 158 `format`, 45 `const`** — every one of them invisible
to `tsc`. Types alone would not hold a fixture honest.

> **F4 — and Task 2 is the only sitting that can act on it.** Decision 9 names `ajv`. It does
> **not** name **`ajv-formats`**, and the document carries **185 format assertions**: `uuid` ×141,
> `date-time` ×43, `uri` ×1 (counted across the whole document; **158** of them sit inside `components.schemas`, where `uuid` is ×114 — the two scopes give different totals, so state which one you mean). Ajv v8 implements none of them itself — under `strict: true` an
> unknown format **throws**, otherwise the assertion is **silently ignored**, and the silent one
> is the dangerous one. **Task 2 must install both**, or no later task may (*no new dependency
> after Task 2*) and Task 12 gets rewritten or weakened.
>
> Both are already in the pnpm store as *transitive* dependencies — `ajv@8.20.0`,
> `ajv-formats@3.0.1` — but appear in **no** `package.json`, and pnpm's strict `node_modules`
> means a transitive dependency does not resolve from `packages/mock`. Declare both explicitly,
> and **pin 8.x deliberately**: `ajv@6.15.0` is also present (ESLint's) and is draft-07 — the
> exact failure Decision 9 warns reads like a malformed document.

---

## The machine, left as it was found

`./scripts/snapshot-machine.sh` before and after; the diff is in the raw results. The Caddyfile
is byte-for-byte identical to its committed state (`git diff --stat` empty, and a `diff` against
a pristine copy taken before the first edit), **and the placeholder was re-read through the edge
rather than assumed back**. Both throwaway servers stopped **by port**, both scratch `.mjs` files
deleted, both probe routes deleted and read back, `pnpm-lock.yaml` restored. The control plane
was rebuilt and restarted after the `routing/` change, because the process serves from `dist/`
and a source change does not reach it.

**Nothing is owed to Rich from this sitting's own footprint.** The two machine-cleanup scripts
were run bare at the close and their output handed over — they do not stay clear on their own,
because `pnpm test:docker` regenerates the dead app networks and every demo adds a LiteLLM user.
