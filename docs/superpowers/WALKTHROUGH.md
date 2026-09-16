# Walkthrough — run Manifest end to end, see it working, check it

*For a person or an agent with no context. Written 2026-09-15, when P4b finished. The
commands, URLs and credentials here stay true; the few status lines are marked. Counts —
how many tests, how many checks — are deliberately not repeated: ORIENTATION §2's box is
the one current copy. For anything this page does not cover, [`RUNBOOK.md`](RUNBOOK.md)
is the operator's manual and [`ORIENTATION.md`](ORIENTATION.md) is everything else.*

---

## What is built

Manifest runs on one Mac. **Almost everything is a container**; two things run on the host.

| Piece | Where | What it is |
|---|---|---|
| **The edge** | `https://*.manifest.internal` (Caddy on `127.0.0.2:443`) | The only way into any app. TLS from the platform's own CA |
| **The control plane** | `http://127.0.0.1:7100` — a Node process on the host | Manifest itself: a JSON API and one WebSocket event stream per project |
| **The Manifest IdP** | `https://idp.manifest.internal` | A practice CWL sign-in (SimpleSAMLphp). **Test users only** |
| **LiteLLM** | `http://127.0.0.1:7106`, dashboard at `/ui` | The AI gateway every app's key goes through |
| **Ollama** | `http://127.0.0.1:11434` — on the host | The models LiteLLM serves: `ministral-3` and `nomic-embed-text` |
| Also | Postgres (`7103`), the image registry (`7107`), an npm mirror, DNS, an egress proxy | Plumbing — `make doctor` and `make verify` check it |
| **The proof app** | `https://proof-app.staging.manifest.internal` | §16's application: CWL sign-in, private notes, an AI answer |
| **The fixture app** | `https://fixture-app.staging.manifest.internal` | P3's trivial app — proves a build and a deploy, nothing more |

**What works today** *(status, as of P4b)*: create a project, push code, validate its
`manifest.yaml`, build it through the platform's security gates, release it and deploy it
to staging; sign a person in with practice CWL; keep each person's data theirs; answer
questions through a per-app AI key charged to the person who asked; stream build logs and
events; record a failed deploy as an Incident. **What does not exist yet:** a web console
(P5) — everything is JSON; production deploys (refused, with a checklist); redeploys that
keep people signed in and tidy up after themselves (P4c — being executed; since
2026-09-15 the driver starts the new container beside the old one and moves the route only
once it is ready, but nothing removes the old container yet and every redeploy still signs
people out).

---

## 0. Once per machine — already done on Rich's Mac

`make seed` (the only step that needs the network), then `make host-setup` (asks for your
password: a DNS resolver for `manifest.internal`, the `127.0.0.2` loopback alias, and
trust for the platform's CA). Ollama must be installed with both models pulled. Details:
RUNBOOK's *First time*.

---

## 1. Start it

```bash
make up          # ~1 minute. Re-adds the 127.0.0.2 alias after a reboot (may ask for your password)
make doctor      # can this machine run the platform? every line PASS
make verify      # is the running platform correct? every line PASS
```

Then **start the control plane, in its own terminal**, with the commands in README's
[*Running the control plane*](../../README.md#running-the-control-plane) — an `export`
block, `db:migrate`, then `dev`. Leave it running. Its boot line must say
`"driver":"docker"` and `"ai":"enabled"`.

Two quick checks that it is all up:

```bash
curl -s https://console.manifest.internal/    # manifest OK host=console.manifest.internal scheme=https …
curl -s http://127.0.0.1:7100/auth/me         # {"error":{"code":"UNAUTHENTICATED",…}}
```

---

## 2. Deploy something to look at

Each of these is re-runnable, takes one to three minutes, and drives the real HTTP API with
`curl`. They are also the acceptance tests — see §5.

```bash
make demo-ai          # the fullest: the proof app, sign-in, notes AND an AI answer. Run this one.
make demo-identity    # the proof app's sign-in and notes only
make demo             # the fixture app
make demo-redeploy    # P4c's acceptance — RED ON PURPOSE until P4c is executed
```

**`make demo-redeploy` fails today, and that is the point.** It was written first, before
the feature it tests, so the platform's behaviour could be measured before anything was
built on it (P4c sitting 1, 2026-09-15). It exited 1 with eleven of its twenty-one
assertions red: a redeploy was about a second of empty 502s, it signed every user out, it
left the old container running, and a release that never became ready took the app down.
**Re-run at the end of P4c sitting 3 it is 14 of 21 green**, up from ten: the redeploy
windows now hold no 502 and no wildcard answer at all, and a release that never becomes
ready leaves the previous one serving. The seven still red are the work that is left —
the old container is not retired (Tasks 5 and 7), a failed release's container is not
removed (Task 8), and people are still signed out (Task 10, which is also why questions
asked during a redeploy fail: 397 of them with 401, none with a 5xx). Do not run it expecting a working demo; run the three above.

`make demo-ai` and `make demo-identity` end with **`Done.`** and leave a note each for the
student and the instructor, so there is something to ask about.

---

## 3. What to open in a browser

### The proof app — the thing to show people

**https://proof-app.staging.manifest.internal**

1. **Sign in with CWL** as `student` / `student`.
2. **/api/me** — what the sign-in released about you. **/api/notes** — your notes, and only yours.
3. In **Ask**, type *"What is my favourite element?"* — the answer comes from the student's own
   note (xenon).
4. Go to **/auth/logout**, sign in as `instructor` / `instructor`, and ask the same question — the
   answer comes from the instructor's note (bismuth), never the student's.

Responses are **raw JSON** — there is no styled interface — and the page has no form for
writing a note; the demos write them.

### Manifest itself — the control plane

**http://127.0.0.1:7100/auth/login** → sign in as `instructor` / `instructor` → you land on
`/auth/me`. Then, still JSON:

- `/projects` — your projects
- `/projects/<projectId>?expand=environments` — a project and its three environments
- `/builds/<buildId>/logs` — a build's log. There is no route that lists builds: the ID comes back
  from `POST /projects/<projectId>/builds`, which the demos print
- `/environments/<environmentId>/incidents` — why a deploy failed, with a repair prompt

The event stream (`WS /projects/<projectId>/events`) needs a WebSocket client — see §4.

### The AI gateway

**http://127.0.0.1:7106/ui** — username `admin`, password = `LITELLM_MASTER_KEY` in `.env`.
Each app's key, and a spend log in which every request is charged to a person's hashed
identifier, never their CWL ID.

### Two things your browser may do

- **Safari and Chrome** trust the platform's certificate, because `make host-setup` put its CA
  in the macOS keychain. **Firefox** has its own store and will warn.
- Signing in to the control plane posts from an HTTPS page to `http://127.0.0.1:7100`, so the
  browser may warn that the form is not secure. On this machine, continue.

---

## 4. Driving it without a browser — for scripts and agents

**The demo scripts are the reference client.** Read `scripts/demo-ai.sh`: every call, in
order, by `curl`. Its helpers are shared and should be reused, not copied:

| File | Gives you |
|---|---|
| `infra/lib/idp-login.sh` | `idp_login` — the three-hop CWL sign-in, into a cookie jar, for the control plane or any app |
| `scripts/lib/proof-app.sh` | `api`, `field`, `app`, and the proof app's assemble / push / validate / build / release / deploy |
| `scripts/lib/event-stream.mjs` | `watch` subscribes to a project's event stream with a jar's session; `expect` checks what it carried |

The lifecycle, as the API sees it: `POST /projects` → push to the bare repository →
`POST /projects/:id/spec` (validate a commit) → `POST /projects/:id/builds` →
`POST /projects/:id/releases` → `POST /environments/:id/deploy`. **A deploy that fails is a
`200` whose `state` is `failed`** — check for `healthy`, never just for a response.

---

## 5. Checking and testing

| Command | What it proves | Needs | Takes |
|---|---|---|---|
| `make doctor` | The machine can run the platform | nothing running | seconds |
| `make verify` | The running platform is correct — DNS, TLS, the edge, the mirror, grants, the IdP | `make up` | ~1 min |
| `pnpm test` — **from the repo root, run it twice** | The control plane's unit and Postgres tiers; a second run catches state leaks | `make up` (Postgres) | ~45 s |
| `pnpm lint`, `pnpm --filter @manifest/control-plane typecheck`, `pnpm format:check` | The other three commit gates. Tests do not check types — `tsc` does | — | ~30 s |
| `pnpm test:docker` | Real builds, deploys and containers | `make up` | ~8 min |
| `make demo`, `make demo-identity`, `make demo-ai` | The acceptances, end to end, through the real API and the edge | `make up` and the control plane | 1–3 min each |
| `make demo-redeploy` | P4c's acceptance, **red until P4c is executed** — a redeploy that interrupts nobody | `make up` and the control plane | ~13 min |
| `scripts/offline-acceptance.sh` | C1: all of it with the network off | **a person** — turning the network off cuts an agent off too | not yet run end to end |

**All four gates must be clean before a commit**, and `pnpm test:docker` too when a change
touches `runtime/`, `services/`, `build/`, `blueprints/`, `ai/` or `observability/`. The
expected counts are in ORIENTATION §2's box; a different number is a signal. A demo passes
when it prints `Done.` and exits 0; `make doctor` and `make verify` pass at `0 failed`.

**A check you have not watched fail is not a check.** This project's standing rule — see
ORIENTATION §6 and any plan's negative controls.

---

## 6. Things that will confuse you

- **`200` with the body `manifest OK host=…` is the edge's placeholder, not your app.** The app
  has no route. `pnpm test:docker` restarts the edge, which drops every route, so after it
  every demo URL answers this way until you run the demo again. **Read the body, not the status.**
- **`pnpm test` and `pnpm test:docker` empty the control plane's tables.** Demo projects vanish
  (their containers keep running), and the next demo prints `reusing project` — correctly.
- **Every redeploy leaves the previous container running** and signs every user out (**P4c's
  job — being executed; the container is Task 5's and the sessions are Task 10's**). It no
  longer takes the app down while the new container starts: since 2026-09-15 the driver proves
  the new instance ready before it moves the route — zero 502s at the driver under a request
  every 25 ms, and zero across all three phases of `make demo-redeploy`. To clean the containers up, RUNBOOK's *Known gaps* — and remove each
  one's `-files` volume too: it holds a private key.
- **An AI app whose gateway drops off its network can make a person wait ten minutes** before an
  error. Redeploying the app re-attaches it. RUNBOOK's *Known gaps*.
- **After a reboot:** `make up`. If the host cannot reach `https://*.manifest.internal` but
  `make verify`'s container checks pass, `docker restart manifest-caddy`.
- **Never touch Laravel Valet** — it owns `.test` and ports 53/80/443. That is why the zone is
  `manifest.internal` and the edge sits on `127.0.0.2`.

---

## 7. Stop, reset, undo

| | |
|---|---|
| Stop the control plane | `Ctrl-C` in its terminal |
| `make down` | Stops the platform. Data, the mirror and the CA survive |
| `make reset` | **Destroys every project's data** — databases, registry contents, every `mf-` container, network and volume. Asks you to type `reset`. Keeps the CA, the master key and the npm mirror. Afterwards: `make up`, then `db:migrate` before the control plane |
| `make host-undo` | Reverses the three host changes `make host-setup` made. Valet is untouched |

---

## 8. Where to go next

| You want | Read |
|---|---|
| Everything, from zero | [`ORIENTATION.md`](ORIENTATION.md) |
| To operate or repair the platform | [`RUNBOOK.md`](RUNBOOK.md) |
| What was decided and why | [`specs/2026-08-29-manifest-platform-design.md`](specs/2026-08-29-manifest-platform-design.md) |
| What each plan built and what executing it found | [`plans/`](plans/) — the roadmap's ledger first |
