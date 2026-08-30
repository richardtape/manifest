> ## ⚠️ HISTORICAL — read [`../ORIENTATION.md`](../ORIENTATION.md) first
>
> This document briefed the agent who ran **S7 and S2**. Those, **and S1 and S3, are
> now done and all four answered yes** (`S7-findings.md`, `S2-findings.md`,
> `S1-findings.md`, `S3-findings.md`), and their findings have been applied to the
> spec. Do **not** run them again.
>
> **No spike is outstanding.** Every spike blocking Phase 1a has reported, and **P1
> has been written** (`plans/2026-08-30-p1-local-substrate.md`) — the next job is
> executing it, not running another spike. The three remaining spikes are
> deliberately later: S6 is P3's acceptance exercise, S5 follows S6, and S4 comes
> before Phase 4.
>
> **`ORIENTATION.md` replaces this document for every purpose.** It carries what
> Manifest is, what the spikes established, the machine's landmines, how to work
> here, and the plan queue — all maintained. This file is kept as the record of what
> the first agent was told, and **§6 is actively wrong in two places** (marked
> inline). Do not use it as a briefing.
>
> **The local zone is now `*.manifest.internal`, not `*.manifest.test`.**

# Start here — Phase 0 spike execution briefing

**You are picking up a project with no code in it.** This document is your entire
context. Read it fully before running anything.

**Your job:** run spikes **S7** and **S2**, and write a findings note for each. You
are not writing implementation plans, and you are not writing production code.

> **Both were completed on 2026-08-29**, and S1 and S3 on 2026-08-30. If you are a
> new agent, **no spike is waiting for you** — see `HANDOFF-2026-08-31.md`.

---

## 1. What Manifest is, in four sentences

Manifest is a self-hosted internal developer platform for UBC. A faculty member
describes an application in plain language, an AI agent builds it, and Manifest
deploys it — authenticated with UBC's CWL single sign-on, running on UBC
infrastructure — without the faculty member ever seeing a container or a YAML file.

The design is **approved and complete**. No code has been written yet. The whole
platform must run on one laptop, offline after a one-time seeding step, which is the
constraint that shapes almost everything.

---

## 2. Why you are running spikes and not building

Seven throwaway experiments answer questions that would be ruinously expensive to
get wrong later. Two of them — **S7** and **S2** — run before anything else, and
**every implementation plan is blocked behind them**:

- **P1** (the local platform stack) cannot be written at all until S7 answers how a
  hostname resolves. Its plan content is essentially S7's output.
- **P4** (identity, secrets and AI) takes its shape from S2.
- A partial plan, **P2**, is written through Task 8 and deliberately paused at the
  point where it would depend on a different spike (S1).

An earlier session started writing plans in parallel with the spikes and had to stop
and correct course. **Do not repeat that.** Do not write or extend an implementation
plan. If you find yourself wanting to, that is a signal the spike has answered its
question and you should write the findings note instead.

---

## 3. Read these, in this order

| Order | Document | Why |
|---|---|---|
| 1 | `docs/superpowers/plans/2026-08-29-phase-0-spike-briefs.md` | **Your actual instructions.** The S7 and S2 sections are the specification for your work. Read the preamble ("How to use this document") too. |
| 2 | `docs/superpowers/specs/2026-08-29-manifest-platform-design.md` — **selected sections only** | The architecture. It is 2,100 lines; do not read it all. See below. |
| 3 | `docs/superpowers/plans/2026-08-29-plan-roadmap.md` | What the spikes unblock, and why the sequencing is what it is. Skim. |

**Sections of the spec that matter to you:**

- **For S7:** §21 (local development topology — read all of it), §12 "DNS" and
  "Egress", §20 "The edge as a control point", §23 "The three platform zones", and
  constraint **C1** in §3.
- **For S2:** §9 (identity — read all of it), §7 "Sensitive fields" and
  "Validation", §21's platform inventory table, and decisions **D6, D15, D16** in §4.

There are plain-language versions of the design in
`docs/superpowers/specs/manifest-schematic.html` and friends. They are for
communicating with non-engineers. **The markdown spec is authoritative**; if they
disagree, the markdown wins.

---

## 4. State of the repository, exactly

- `/Users/rich/Developer/manifest` — **documentation only.** No `package.json`, no
  `Makefile`, no Compose file, no `src/`. Nothing to build.
- **`make seed` and `make up` do not exist.** The spike briefs mention them because
  they are P1's deliverable, which S7 informs. You will be writing throwaway Compose
  files and shell by hand. That is expected and correct.
- Check `git status` before you start. Recent documentation work may be
  uncommitted. **Commit the docs on `main` first** so your spike branch starts
  clean, then branch.

**Branch naming, per the briefs:** `spike/S7` and `spike/S2`. Never merge them to
`main`. Only the named artefacts are copied out.

---

## 5. Assets already on this machine

All under `/Users/rich/Developer/`. You have read access to everything and these
three are configured as working directories: `manifest`, `coder.com`,
`docker-simple-saml`.

| Path | What it is |
|---|---|
| `docker-simple-saml/` | **S2's starting point.** A SimpleSAMLphp 2.x IdP in Docker. **Ours — you may edit it.** |
| `passport-ubcshib-docker-simple-saml-example/` | **A ready-made SP to test S2's login against.** Do not build your own. |
| `passport-ubcshib/` | The Passport strategy manifested apps use. `github.com/ubc/passport-ubcshib`, v0.1.6. |
| `tlef-starter/` | The app that becomes the first blueprint. Carries `server/src/components/auth/saml-attributes.ts`, the attribute bridge §9 refers to. |
| `saml-metadata-generator/` | Generates RSA-4096 SP metadata packages. Absorbed as a library later; not needed for these spikes. |
| `ubc-genai-toolkit/` | Used by manifested apps for LLM access. **S3 drove `ubc-genai-toolkit-llm` 0.4.0 through LiteLLM unmodified** — read `S3-findings.md` §Evidence 8 before writing any AI wiring. |

---

## 6. Findings already established — do not spend time rediscovering these

> **STALE.** Superseded by `HANDOFF-2026-08-30.md` §4, which is verified as of
> 2026-08-29. Two entries below are wrong and are struck through.

A previous session inspected these files. Everything below is **verified**, with the
file and line where known. Treat it as a head start, but **re-verify anything you
are about to depend on** — versions move.

### For S2

- **`docker-simple-saml/Dockerfile` installs `pdo_mysql` and `pdo_sqlite`, but NOT
  `pdo_pgsql`.** §21 wants Postgres. Your first change is
  `docker-php-ext-install pdo_pgsql`. Confirm the image still builds.
- **`config/simplesamlphp/config.php:34–40` — `metadata.sources` is two `flatfile`
  entries.** Adding a `pdo` entry is the change under test.
- **`config.php:66` — `store.type => 'sql'` with a SQLite DSN is the SESSION and
  DATA store, NOT the metadata source.** These are different subsystems. Proving the
  session store works proves nothing about metadata. This is the easiest way to
  waste half a day.
- SimpleSAMLphp is installed via `composer create-project simplesamlphp/simplesamlphp:^2.0`
  — so **2.x**. Record the exact resolved version.
- **`modules/ubc-clf-7/` is a THEME** — Twig templates and CSS, `enable` marker, no
  PHP classes. So the module *packaging* path is proven, but writing a PHP
  `MetaDataStorageSource` is genuinely new work. Do not overestimate our existing
  PHP-in-SSP experience when costing the fallback.
- **`config/simplesamlphp/saml20-sp-remote.php`** shows the exact per-SP field set
  Manifest will need to write: `AssertionConsumerService`, `SingleLogoutService`,
  `NameIDFormat`, `simplesaml.attributes`, `attributes`, `saml20.sign.assertion`,
  `saml20.sign.response`, `validate.authnrequest`, `validate.logout`.
- **That file sets `validate.authnrequest => false` and `validate.logout => false`.**
  §9 requires both `true` in staging and production. Test that they work from a
  metadata row.
- **Its default attribute list includes `uid`, which is NOT a UBC attribute.** §7 is
  explicit: the identifier is `ubcEduCwlPuid`. Manifest writes its own list per SP.
- **`saml20-idp-hosted.php` sets `attributes.NameFormat => basic`** — friendly names,
  where real UBC Shibboleth sends OID and MACE URNs. See the "opportunity" section of
  S2's brief; this is worth acting on, not just noting.
- **Port 6122 is taken** by the standalone `docker-simple-saml` on this machine.
  Manifest's IdP instance is specified at **7122**. Use a free port for the spike.

### For S7

- **`docker run --dns` takes an IP and no port.** A container cannot be pointed at
  dnsmasq on port 7153. Whatever serves containers must answer on **port 53** at an
  address the container can route to. This kills several obvious designs.
- **On Docker Desktop for Mac the host cannot route to container IPs directly.** So
  "give host and containers the same answer" is not available.
- **dnsmasq's `--address` is global to a process, not per-interface.** The
  hypothesis in the brief (two listeners with different answers) follows from this.
  Verify the premise before building on it.
- ~~**`/etc/resolver/test` already exists on this machine**, pointing at a
  nameserver that is not listening.~~ **WRONG — corrected by S7.** The nameserver
  *is* listening: a Homebrew dnsmasq 2.91 owned by **Laravel Valet**, answering
  `address=/.test/127.0.0.1` for the whole TLD, with Valet's nginx on ports 80 and
  443. `.test` is therefore unusable and **the zone is now `*.manifest.internal`**.
  Several UBC developers run Valet, so this was never machine-specific. Do not touch
  any of it.
- **Ports 80 and 443 are in use on this machine** — by **Valet's nginx**, confirmed
  by S7. The override path works, but S7 found a **better answer**: a `127.0.0.2`
  loopback alias, so host and container URLs stay byte-identical as §9 requires. A
  port in the host URL breaks that parity.
- **`*.manifest.localhost` was already evaluated and rejected** — inside a container
  `.localhost` is the container's own loopback, and glibc does not special-case
  `*.localhost` on Linux at all. Do not revisit it.

---

## 7. How to work

**Follow the briefs.** The S7 and S2 sections of
`docs/superpowers/plans/2026-08-29-phase-0-spike-briefs.md` carry, for each spike:
the question, a hard timebox, the evidence that counts as an answer, the method, the
sub-questions and what each one supports, what to do if the answer is no, and what
must survive. Work through them.

**Timeboxes are hard.** S7 is 3 days, S2 is 2 days. When one expires you write up
what you have, including "inconclusive". **An overrunning spike is itself a
finding** — it means the question was bigger than we thought, and that changes the
plan more than the answer would.

**Record versions for everything.** Every finding here is a property of a specific
version of third-party software: image digests, package versions, macOS version,
Docker Desktop version, SimpleSAMLphp version. A finding without a version is not
reproducible.

**Ask before anything needing `sudo`.** S7's full form wants to write
`/etc/resolver/manifest.test` and trust a CA in the macOS keychain. Do the parts you
can do without it first, then present the exact commands for the human to run or
approve. Never run `sudo` unannounced.

**Ask before you delete or overwrite anything outside your spike branch.** In
particular, do not modify `/Users/rich/Developer/docker-simple-saml` on its own
default branch — work on a copy or a branch.

### What "done" looks like

Two files, one per spike:

- `docs/superpowers/spikes/S7-findings.md`
- `docs/superpowers/spikes/S2-findings.md`

Use `docs/superpowers/spikes/FINDINGS-TEMPLATE.md`. **The first sentence of each
answers the question — yes, no, or "inconclusive, because…" — before any detail.**
Somebody should be able to read that one sentence and know what to do next.

---

## 8. Things that will tempt you, and the answer to each

| Temptation | Answer |
|---|---|
| "I should write the P1 plan while I'm here — I know how the DNS works now." | No. Write the findings. Plan-writing is a separate deliberate step, and the roadmap explains why. |
| "The spec is wrong about X, let me fix it." | Record it under **Spec actions** in the findings. The spec is marked *Approved design* and edits are the human's call. |
| "This adjacent thing is also broken." | Note it in the findings and move on. Spikes answer one question. |
| "I'll make the spike code nice, we'll need it later." | Only the named artefacts under *What survives* are kept. Everything else is deleted. Speed over polish. |
| "The timebox is nearly up but I'm close." | Write up where you are. "Nearly" is a finding. |
| "S2 says the SQL metadata source doesn't work, so §9 is dead." | It is not. `docker-simple-saml` is ours; the brief's re-ranked fallbacks cover it, and the preferred one is better in two ways. Read that section before concluding anything dramatic. |
| "Should I also run S1 and S3?" | **Both are done** (2026-08-30). Nothing here is left to run. |

---

## 9. What happens after you

Your findings unblock, in this order: **P1** (the local platform stack — S7's output
is most of its content), then **P2**'s remaining tasks (needs S1), then **P3**, and
**P4**'s shape (S2). Somebody will write those plans against your notes, so write
them for a reader who was not there.

The single most valuable thing you can produce is a **clear, specific, honest answer
to each question**, with the evidence attached and the version recorded. A confident
wrong answer here costs months.
