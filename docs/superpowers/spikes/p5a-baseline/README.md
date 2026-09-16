# P5a Task 1 — the measurements the contract rests on

Run on **2026-09-16**, sitting 1 of [P5a](../../plans/2026-09-16-p5a-the-contract.md), on the
machine P4c left: macOS 26.6.2 (25G83), Node 24.12.0, Docker Engine 29.7.2, pnpm 11.24.0,
zod 3.25.76, Fastify 5.12.3, yaml 2.9.0, Caddy v2.11.4, SimpleSAMLphp v2.5.3.1. `make doctor` 18/0
and `make verify` 47/0 before and after. **No platform code changed.** Every raw result is in
[`results-task1-2026-09-16.txt`](results-task1-2026-09-16.txt), under the section named below.

**Run order is not the plan's.** The plan runs M1 first, through `vitest run --project unit`,
whose `globalSetup` truncates `projects`, `project_members`, `users`, `instances`, `routes` and
`secrets` — and M3 needs the instructor's `proof-app` project. M1's typecheck ran first and its
test ran after M3 and the SP row's restore. Everything else ran in plan order, plus two
measurements added while executing: `[M2g]` and `[M4c+]`.

## M1 — `zod/v4` on a real route shape → Task 6, Task 12

`m1-zod-route.test.ts.txt` was run as `packages/control-plane/src/api/contract/m1-spike.test.ts`
and deleted. **Confirmed Task 6 as written**: a bad param refused (`invalid_format`); unknown
columns stripped by the representation; a `Date` refused; registries convert with `$ref`s, and
every component carries its own `$schema` and `$id` (so `document.ts`'s `strip` is needed); a v4
`ZodError` is not zod 3's; `z.coerce.number()` accepts `'5'`; `tsc` accepts the generic
`defineRoute` and types `params` from the schema. **Changed:** Task 6 gains a type-level negative
control — the plan's `slug: 1` control cannot see `params` widen to `any`, and a second one
(`params.projectID` → TS2551) can. `z.uuid()` is RFC 4122-strict (checked against the repository's
32 UUID literals: no route affected). **Task 12:** `z.discriminatedUnion` emits `anyOf` with no
`discriminator`; whether the generated client narrows is measurable only once `openapi-typescript`
is installed (sitting 5). Sections `[M1a]`–`[M1g]`, `[M1d+]`.

## M2 — the edge refusing by source → Task 3

`m2-edge-refusal.sh`: a throwaway admin-API route for `p5a-probe.manifest.internal` with the
allow-list of one address, `10.89.0.1/32`. **Confirmed Decision 12 and Task 3's Caddyfile block
exactly**: host forwarded; a `manifest-platform` container and the proof app refused with the
body; the refusal removed, the proof app forwarded (so the matcher is what refused it); a 100 s
request completes; `caddy adapt` gives the expected `subroute`. Sections `[M2a]`–`[M2f]`.

`m2g-egress-proxy.sh` (**added**): the app's own egress proxy is on `manifest-platform` too. Its
deny-by-default filter refuses `CONNECT` to the probe name, `manifest-caddy`, the edge's platform
address and the control plane; the allowlisted `manifest-idp:80` opens. **Changed Task 3**: probe
15 gains the proxy path, and *What this plan does not build* names that `egress.allow` accepts a
platform hostname, leaving the edge's allow-list as that app's control. Section `[M2g]`.

## M3 — a CWL sign-in and a stream through a new origin → Task 4

`m3-login-through-origin.sh` boots the control plane at `https://p5a-probe.manifest.internal` (which
re-registers the platform SP row there) and `m3b-relaystate.mjs` signs an AuthnRequest with a known
`RelayState`. **Confirmed Decision 16's mechanism**: a real sign-in completes behind the edge, the
session cookie is `HttpOnly` and not `Secure` in development, `/auth/me` answers, a WebSocket
upgraded through the edge delivers 25 frames with the ready frame, and the IdP echoes `RelayState`
unchanged. **Changed:** Decision 16's own sentence, which put the return path in `RelayState` where
Task 4's code (rightly, at 80 bytes) does not. Step 8 put the SP row's ACS back to
`http://127.0.0.1:7100/auth/saml/callback`, checked before and after. Set `M3_LOG=<path>` to keep
the control plane's log; the work directory goes with the trap. Sections `[M3a]`–`[M3d]`, `[Step 8]`.

## M4 — reserved labels and the starter manifest's rename → Task 9, Task 11

`m4-reserved-labels.mjs`. **Confirmed Task 9**: 755 labels in 6 groups, no rule breaks, no
duplicates; `console` and `edge` reserved. The loose scan's four hits (`manifest`, `staging`,
`app`, `port`) are not slugs; a tight scan found 21 project slugs, none reserved. **Changed Task 11**:
`parseDocument` + `set` + `String(doc)` keeps comments but reformats three lines of the proof app's
manifest, and no `toString` option reproduces the file; a splice at the `name` scalar's range is
byte-exact (typechecked, run, and watched failing with `String(doc)` put back). M4c's own
`lines changed: 58` was a defective count. Sections `[M4a]`–`[M4c]`, `[M4b+]`, `[M4c+]`.

## M5 — what Node sends as `Origin` → Task 4, Task 7

`m5-node-origin.mjs`. **Confirmed Decision 15's premise** on Node 24.12.0: `fetch` and `WebSocket`
send no `Origin` unless given one, and send the one they are given, with a cookie. Section `[M5]`.
