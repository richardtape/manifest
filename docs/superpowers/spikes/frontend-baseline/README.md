# The front-end enablement plan's baseline — Task 1's measurements

**Measured 2026-09-27, 01:53–02:15 PDT, by the plan's sitting 1** — run at Rich's direct instruction, given before he went to
bed, to execute sitting 1 once the plan was written. **So it ran BEFORE his review of the plan and its sittings split**, which
stay open (ORIENTATION §7e and §8). Nothing under `packages/` changed. The plan is
[`../../plans/2026-09-27-front-end-enablement.md`](../../plans/2026-09-27-front-end-enablement.md); every measurement below
corrects or confirms a claim in its *Read this first* or *Decisions*, and each correction is a dated `[M<n>]` block at the head
of the task it changes.

**Machine:** macOS 26.6.2 (25G83); Docker Desktop 4.87.0, engine 29.7.2 (API window 1.40–1.55; the driver pins v1.44),
`json-file` logging, 12 CPUs and 7.7 GiB in the VM; Node v24.12.0; git 2.50.1 (Apple Git-155); LiteLLM as `infra/images.lock`
pins it (`sha256:20b5044b…`); SimpleSAMLphp as `infra/idp/` builds it; node-saml 5.1.0; cwebp 1.6.0 (Homebrew, only to make two
WebP samples). Load 2.4–5.9 across the session (the unit suite ran first, alone; no timing was taken while it ran).

**The raw output of every probe is [`results-task1-2026-09-27.txt`](results-task1-2026-09-27.txt)**, in the order run, failed
attempts included and labelled. **The probes are in [`probes/`](probes/)**; each `.mts` runs under `probes/run.sh`, which gives
Node 24 `--experimental-transform-types` and the GitHub fake's resolve hook so the control plane's own modules are imported
by path, and exports RUNBOOK's environment (`db/client.ts` throws at import without `MANIFEST_DATABASE_URL`). Every
container, SP row, LiteLLM user, key and route a probe made carries `probe` in its name and was removed by the same probe —
checked at the end of each, and by the snapshot diff below.

## What each measurement found

| | Measured | The plan predicted | Found | Changes |
|---|---|---|---|---|
| M14 | the gate numbers | 2330/162, 20, 57, 33 migrations | **2330/162 (474 s), 20/0/0, 57/0/0, 33** — `test:docker` not run (not owed) | nothing |
| M1 | a container's output at size, through `containerLogs` | `tail: 200` answers 200 lines; the unterminated last line arrives | **`tail` counts 16 KiB LOG ENTRIES, not lines: `tail: 200` answered 136 lines, `tail: 1000` 936** — the 1 MiB line is 64 entries. **The unterminated `last line` never arrived** while the process ran. RSS +15 MiB with the megabyte line in the window; 25–33 ms a read | **Task 2** |
| M2 | Docker's timestamps, raw frames | one stamp per line; `Date.parse` reads three digits | **one stamp per ENTRY**: each 16 KiB chunk of a long line is its own frame with its own (identical) stamp, and the line's `\n` arrives as a 32-byte frame of stamp + space + `\n`. The prefix is RFC 3339, UTC, **nine** fractional digits, one space. **`Date.parse` reads nine digits** (to the millisecond). The unterminated line is written **when the process exits, stamped with the exit time**. A tail can begin inside a long line | **Task 2** |
| M3 | one SP row with two ACS; an AuthnRequest naming the second | the IdP posts where the request names; an unlisted URL is refused with no login form | **Index 1 honoured** — the IdP posted to `app.`'s ACS for the second client, `Destination` and `Recipient` agreeing. **An UNLISTED URL is NOT refused**: the IdP shows the login form, authenticates, and posts to the DEFAULT ACS (index 0, the console's) — fail-safe (it never posts to the unlisted URL), and it logs nothing about it in either log | **Task 8** (Decision 17 stands; one control's expectation changes) |
| M4 | `app.manifest.internal` today | `127.0.0.3`; the wildcard's `manifest OK … listener=public`; an empty `200` in a container | **All three, exactly.** Nothing on 7105. **`dig +short` answers NOTHING on this Mac** — it bypasses `/etc/resolver`; `dscacheutil -q host` answers `127.0.0.3` | Task 8 (a note) |
| M5 | a logout's `RelayState`, and which SLO URL answers | the FIRST entry of the binding; `RelayState` unchanged | **Both, and the response is signed.** (The second run read `RelayState` as absent — a PROBE defect, parsing a display-cut string; the third run is the measurement) | nothing — Decision 18 stands |
| M6 | the redactor over an app's own output | the URI, its password and a Bearer token redacted; hex, a UUID and a weak password kept | **With the set the platform actually builds — 14 of 14.** With the plan's wording of the set (the URI whole in it) the password printed ALONE is kept: the real set holds `service:<name>:password`, not the URI (`services/credentials.ts:72`), and the URI is redacted by its password's exact match — so it reads `mongodb://app:[REDACTED]@…`, not `[REDACTED]` whole | **Task 2** (what its Docker case asserts) |
| M7 | LiteLLM 1.98.0's key mechanics | a key budget, a `duration`, deletion by alias, both budgets binding, a model refusal | **Every one.** The key's budget refuses the SECOND call **at once** (0.3 s — no batch lag): `429 budget_exceeded`. The user's budget: `429 budget_exceeded`, *"User=… over budget"*. Expiry: `401 expired_key`. `{ key_aliases }` deletes: `{ deleted_keys: [alias] }`, then `401 token_not_found_in_db`. A model outside the list: `403 key_model_access_denied`. **An empty `models` list reaches every model.** Error bodies echo the key's last four characters and its hash | Tasks 9–10 (confirmations and exact codes) |
| M8 | a person's spend | `user_info.spend`, with a lag | **`user_info.spend`**, and `/key/info`'s `info.spend`; 3–6 s after the call (3.1 s and 6.2 s on two runs). `budget_reset_at` is `2026-10-01T00:00:00Z` — a calendar month | Task 10 (confirmation) |
| M9 | a service's data surviving an archive | kept with `deleteData: false`, gone with `true` | **Both.** The re-created container reached its data with the SAME root credentials — Mongo ignores `MONGODB_INITDB_ROOT_*` on an existing data directory — so a restore needs the stored `service:*:password` that archive keeps | Tasks 11, 12 (confirmation; a note) |
| M10 | the local IdP and `uid` | (record only) | three users, friendly names, none with `uid`; `name2oid` maps `uid` to the platform's OID; **the row must list `uid` or `AttributeLimit` drops it**; the file is a single-file mount — a replacing save strands it, `docker restart manifest-idp` re-binds | **Task 7** |
| M11 | bytes through the write path and the scans | the table matches; zero findings; the blob ids equal | **23 files, every genuine one of the ten types recognised by its bytes**; one file named `.gif` is none of them (`file(1)`: *data*) and two named `.jpg` are PNGs — **the table read them by their bytes**. None would be refused as text. **Zero findings** from printable runs (≥16) and from the build gate's read. The byte path (`hash-object --stdin-paths`) equals `git hash-object`; **today's `buildCommit` turns an 18,403-byte PNG into a 33,360-byte blob** (the content is a UTF-8 string) | **Task 4** |
| M12 | a 200,000-file tree | whole-tree numstat takes seconds; `--pathspec-from-file` under 0.5 s | **Whole-tree numstat 0.46 s. `git diff` has NO `--pathspec-from-file` — exit 129, its usage.** The 10,000 listed paths as literal pathspec ARGUMENTS (`xargs -0`, two invocations under `ARG_MAX` 1,048,576): **0.17 s**. `getCommit`'s read (`git diff … --name-status`, not `diff-tree`) of a 200,000-file commit: 0.21 s | **Task 5** |
| M13 | the plan's seams | Task 3 first moves `openapi.json`; `1.4.0`; the hand-built lines counted; no matrix row changes | **Static reading agrees with all four**: the build log maps `stream`/`text`/`at` explicitly, so a new `LogLine` field publishes nothing; the contract is `1.3.0` (54 operations, 78 schemas); **18 hand-built lines in 13 files**, of which only the `LogLine`-typed break; `quota:set` is asserted by no route and D24's refusal fires on ASKING, so no row should change — **Task 11's run of the matrix is the only proof** | Task 2 (the count) |
| M15 | a switched-off route | a `static_response` 410 under the hostname's `@id`, replaced in place by `applyRoute` | **Exactly**: one route before and after each move; `patchRoute` back to the 410 in place (archive's direction) works too; `removeRoute` returns the name to the wildcard. **`servingRoute` answers `undefined` for the 410 route** — which is what lets the Docker driver's "refuse a serving instance" pass once a name is switched off | Task 11 (confirmation) |

## Does any of it break the split?

**No.** The one measurement the plan said could re-cut it — `[M3]`, whether SimpleSAMLphp honours an AuthnRequest's
`AssertionConsumerServiceURL` for index 1 — **held**, so Decision 17 stands and Spec action 2's option (b) (two SP entities) is
not needed as a fallback. `[M12]` removes Decision 12's mechanism but not its task, and the replacement is measured. `[M1]`/`[M2]`
change how Task 2 reads Docker's stream, not what the task delivers or which sitting delivers it. **The split is still Rich's
to approve** — this sitting ran at his instruction before his review.

## The corrections, in the plan

Each is a block headed `[M<n>] (2026-09-27)` at the head of its task:

- **Task 2** — `[M1]` `[M2]` `[M6]` `[M13]`: Docker's `tail` counts 16 KiB entries; stamps are per entry, so strip the stamp from
  EACH FRAME before joining partials; `truncated.lines` is known from the ENTRY count, not from receiving `lines + 1` lines; the
  oldest line of a full window may be a fragment; an unterminated line is invisible until the process exits; the redaction case
  builds its set as the platform does; `json-file` has no `max-size` on app containers.
- **Task 4** — `[M11]`: `buildCommit`'s `content` must carry bytes; the table and the ≥16 run rule stand, measured; bytes decide the
  type, whatever the extension says.
- **Task 5** — `[M12]`: `--pathspec-from-file` is not a `git diff` option; pass the listed paths as literal arguments after `--`,
  chunked under `ARG_MAX`.
- **Task 7** — `[M10]`: add `uid` in the auth source AND the platform's row; re-bind with `docker restart manifest-idp` and compare
  hashes.
- **Task 8** — `[M3]` `[M4]` `[M5]`: an unlisted ACS is answered at index 0, not refused — assert that; `dig` cannot see the zone on
  macOS.
- **Task 9 / 10** — `[M7]` `[M8]`: the codes each refusal arrives with, and the lag.
- **Task 11** — `[M9]` `[M15]`: restore relies on the kept credentials; `servingRoute` reads a switched-off name as serving nothing.

## The machine, before and after

`scripts/snapshot-machine.sh` before and after, diffed (below, in *What executing this plan found*'s sitting 1 entry); no probe
container, SP row, LiteLLM user or key, Caddy route or scratch repository was left. The twenty-three sample binaries and the
200,000-file repository lived only in the session's scratchpad.
