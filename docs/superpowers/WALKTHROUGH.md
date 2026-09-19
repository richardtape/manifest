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
| **The edge** | `https://*.manifest.internal` (Caddy on `127.0.0.2:443`) | The only way into any app — and into Manifest's API. TLS from the platform's own CA |
| **The control plane** | `https://console.manifest.internal` — through the edge, to a Node process on the host (`127.0.0.1:7100`) | Manifest itself: a JSON API under `/v1` and one WebSocket event stream per project. Refused to every source but the host |
| **The Manifest IdP** | `https://idp.manifest.internal` | A practice CWL sign-in (SimpleSAMLphp). **Test users only**: `student`, `instructor` and `operator` — each its own password. `operator` (`opr000001`) is the one `make demo-journey` makes a platform administrator |
| **LiteLLM** | `http://127.0.0.1:7106`, dashboard at `/ui` | The AI gateway every app's key goes through |
| **Ollama** | `http://127.0.0.1:11434` — on the host | The models LiteLLM serves: `ministral-3` and `nomic-embed-text` |
| Also | Postgres (`7103`), the image registry (`7107`), an npm mirror, DNS, an egress proxy | Plumbing — `make doctor` and `make verify` check it |
| **The proof app** | `https://proof-app.staging.manifest.internal` | §16's application: CWL sign-in, private notes, an AI answer |
| **The fixture app** | `https://fixture-app.staging.manifest.internal` | P3's trivial app — proves a build and a deploy, nothing more |

**What works today** *(status, as of P5c sitting 5 — 2026-09-19)*: through Manifest's API — under `/v1`, at `https://console.manifest.internal`, which only the host can reach, and which refuses a session-bearing change that does not come from that origin — create a project, push code, validate its
`manifest.yaml`, build it through the platform's security gates, release it and deploy it
to staging; sign a person in with practice CWL; keep each person's data theirs; answer
questions through a per-app AI key charged to the person who asked; stream build logs and
events; record a failed deploy as an Incident; and **redeploy an app while people are using it
without interrupting or signing out anybody** (P4c) — the new container starts
beside the old one, takes the route only once it answers, and the old one is drained and removed,
while sessions live in the app's own database. The API describes itself: `packages/contract/openapi.json` is generated from the routes declared through `defineRoute` and held to them by a test — **every `/v1` route is declared that way**, each answering a public representation rather than a database row, so a deploy answers an instance with no driver or handle and a release shows its build's digest and scan and its env var *names* without their values — and `make demo-journey` calls it through a TypeScript client generated from that document. `GET /v1/slugs/{slug}` says whether a project name will work before you create it: `chem`, `console` and every other §23 reserved label are refused, with what the label stands for. `GET /v1/blueprints` lists the blueprints and the *starters* each offers — §16's proof app is `node-ts-mongo@1`'s `proof-app` — with each blueprint's knowledge pack beside it, and `POST /v1/projects` creates a project from a blueprint's skeleton and, optionally, a starter, for a stated audience (§24), saying so on the project's event stream. That stream is in the contract too: every event the platform records has a payload schema it is refused without, `openapi.json` describes the stream's messages with those schemas, and the generated client's `subscribe` opens it — `make demo-journey` watches a new project's provisioning replayed. Asking for production is refused with §13's checklist COMPUTED from what the project has — `GET /v1/projects/{projectId}/launch-readiness` answers the same thing, read-only, saying which plan builds each item Manifest does not track yet — and a platform administrator, made out of band by `scripts/admin-grant.sh` and audited in `audit.role_changes`, reads every app on the platform at `GET /v1/fleet` (§26). **An agent can now hold its own credential.** A project owner mints a *delegated token* in the console — for now, a `curl` call as themselves — scoped to that one project and to an explicit list of what it may do, with an expiry of at most a year (D24). Its secret is shown once, when it is minted, and the platform keeps only a hash of it: no route, no query and no support request can produce it again. An agent sends it as `Authorization: Bearer …` instead of a person's session, and it reads and acts on exactly the one project it was scoped to — any other answers as though it did not exist. Four things it may never do, however it was minted: manage members, promote a release to production, change a quota, or read a secret. **And when it asks for one of those four, Manifest now turns the refusal into a question.** The refusal happens in one place, at the authorization layer rather than in each route, so a route added later cannot forget it; the answer carries a *pending action* — what was asked for, in a sentence, and a fingerprint of the request, never the request's own contents. **And a person now answers it.** Signed in, and only if they hold that power themselves, they confirm it or refuse it in their own words. A confirmation does not do the thing on the agent's behalf: it lets **that one request** — that agent, that exact ask — through **once**, and the agent makes it again itself, checked as any request is. Asking a second time is a fresh question. A refusal is final for that request and the agent is told why, so it stops rather than asking for ever. **And the questions are now readable as a list, which is what a console is built on.** A person reading a project sees every question agents have put to it, newest first, with how long each has waited — §26's headline number, which the platform computes rather than leaving each client to subtract two timestamps. An agent reads only the questions it asked itself, which is how it waits for an answer instead of retrying to find out. Neither read ever carries the refused request's contents. **Removing somebody from a project** is the fourth of those privileged four to become possible at all, and it was written after the rule that guards it: it does nothing about agents, and an agent asking is turned into a question anyway. **An agent's requests are also limited now**, at a rate set on its own token — past it every route answers *too many requests*, and says when to try again — while a person in a browser is not limited, because the reason for the control is that an agent is code the platform did not write. **And a question nobody answers does not wait for ever.** Each one is asked with a life of a day, an agent cannot spend an answer given to a question that has since lapsed, and the platform marks the lapsed ones as such when it starts — so a list of what is waiting is a list of what somebody can still act on. Two agents asking the identical thing at the identical moment now produce one question rather than two, which is enforced by the database rather than by a check that could lose a race. **And the whole loop now runs end to end**, as `make demo-token`: an agent builds and deploys a real application on a token of its own, is stopped at the two things it may not do, and gets past one of them only because a person said so. **And there is now a console to open in a browser, and a faculty member can drive most of the journey in it by clicking.** `https://console.manifest.internal` serves it — a deliberately plain reference client, the working proof that everything above can be driven from outside. A person **signs in with their CWL** and sees who the platform thinks they are; **creates a project** by typing a name that is checked for them as they type, choosing a blueprint and a starter and saying who the application is for; **watches it being made** on a live feed that needs no refreshing; **builds it**, reading the builder's output line by line as it is written rather than waiting for a wall of text at the end, and sees how the build ended along with the image it produced and what the vulnerability scan found; **releases that build**, **deploys it to staging** watching each step arrive as it happens, and then **opens the running application and signs in to it with their CWL**. When a deploy fails it says so, keeps the previous version serving, and shows what the platform checked, what the application printed, and what changed since it last worked. Asking for production is refused there too, with the checklist of what a first launch still needs and who owns each item. It is a developer's host process on port 7104 and nothing starts it for you, so the address answers `502` until somebody does. **What does not exist yet:** the screens for delegated tokens and for the queue of questions agents have asked (P5c's remaining sittings) — so for now a person still answers a pending action with a `curl` call and reads the list the same way; production deploys (refused, with that checklist); and nothing marks a question lapsed *while* the platform is running, so one that ran out an hour ago can still appear in the list as waiting until the next restart — asking to act on it is refused either way.

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
`"driver":"docker"`, `"origin":"https://console.manifest.internal"` and `"ai":"enabled"`.

Two quick checks that it is all up:

```bash
curl -s https://edge.manifest.internal/            # manifest OK host=edge.manifest.internal scheme=https …
curl -s https://console.manifest.internal/v1/me     # {"error":{"code":"UNAUTHENTICATED",…}}
```

---

## 2. Deploy something to look at

Each of these is re-runnable, takes one to three minutes, and drives the real HTTP API with
`curl`. They are also the acceptance tests — see §5.

```bash
make demo-ai          # the fullest: the proof app, sign-in, notes AND an AI answer. Run this one.
make demo-identity    # the proof app's sign-in and notes only
make demo             # the fixture app
make demo-redeploy    # P4c's acceptance — a redeploy nobody notices; ~3 minutes
make demo-journey     # P5a's acceptance: §22's journey, all 8 steps, through the generated client
make demo-token       # P5b's acceptance: an agent runs the build loop on a token, and a human answers it
```

**`make demo-redeploy` passes, and it is P4c's acceptance — green since sitting 7, and run
again straight afterwards and from a `make reset` machine in sitting 8, 2026-09-16.** It was written first,
before the feature it tests, so the platform's behaviour could be measured before anything
was built on it (P4c sitting 1, 2026-09-15). It exited 1 with eleven of its twenty-one
assertions red: a redeploy was about a second of empty 502s, it signed every user out, it
left the old container running, and a release that never became ready took the app down.
**Now every assertion is green.** Every request in every redeploy window is answered by the
app, with no 502 and no placeholder page; the student stays signed in and every question is
answered by the app itself — including one that was under way when the route moved, which the
old instance finishes; the old container is drained and removed, along with its files volume
and its AI key; and a release that never becomes ready leaves the previous one serving the whole
time and takes its own container with it. It takes about three minutes; run `make demo-ai` first
if you only want to see the app.

`make demo-ai` and `make demo-identity` end with **`Done.`** and leave a note each for the
student and the instructor, so there is something to ask about.

---

## 3. What to open in a browser

### The proof app — the thing to show people

**https://proof-app.staging.manifest.internal**

1. **Sign in with CWL** as `student` / `student`. The top of the page then says who is signed in —
   *Signed in as Test Student <student@student.ubc.ca> — student.* — and offers only *Sign out*.
2. **/api/me** — what the sign-in released about you. **/api/notes** — your notes, and only yours.
3. In **Ask**, type *"What is my favourite element?"* — the answer comes from the student's own
   note (xenon).
4. **Sign out.** You land back on the page, which says *Not signed in*. **Sign in with CWL** again
   and the IdP asks for a password — sign in as `instructor` / `instructor` in the same browser and
   ask the same question: the answer comes from the instructor's note (bismuth), never the student's.

Apart from that status line, responses are **raw JSON** — there is no styled interface — and the
page has no form for writing a note; the demos write them. **Signing out worked for no app until
2026-09-16** (the IdP refused every app's return address, and the app never answered the IdP's
logout request); tested in Chrome that day, and `make demo-identity`'s step 9 now does the same.

### Manifest itself — the control plane

**https://console.manifest.internal/auth/login?returnTo=/v1/me** → sign in as `instructor` /
`instructor` → you land on `/v1/me`. Without `?returnTo=` you land on `/` — **which is now the
console itself**, showing your own name if it is running on 7104 and `502` if it is not. Either
way that is a successful sign-in, not a failed one. Then, still JSON:

- `/v1/projects` — your projects
- `/v1/projects/<projectId>?expand=environments` — a project and its three environments
- `/v1/projects/<projectId>/builds` — a project's builds, newest first; `/v1/builds/<buildId>` — one, with
  its status, digest and §12's scan (`scan`: the scanner, how old its database was, and Critical and High
  counts that were fixable, unfixable, or the base image's own); `/v1/builds/<buildId>/logs` — its log
- `/v1/projects/<projectId>/releases` — a project's releases, newest first; `/v1/releases/<releaseId>` — one,
  with its build's digest and scan and, per environment, the frozen numbers and the **names** of the env
  vars the app declares (never their values)
- `/v1/environments/<environmentId>/incidents` — why a deploy failed, with a repair prompt

The event stream (`WS /v1/projects/<projectId>/events`) needs a WebSocket client — see §4.

### The AI gateway

**http://127.0.0.1:7106/ui** — username `admin`, password = `LITELLM_MASTER_KEY` in `.env`.
Each app's key, and a spend log in which every request is charged to a person's hashed
identifier, never their CWL ID.

### Two things your browser may do

- **Safari and Chrome** trust the platform's certificate, because `make host-setup` put its CA
  in the macOS keychain. **Firefox** has its own store and will warn.
- **`https://console.manifest.internal/` is the console** since 2026-09-18 (P5c Task 4), and
  answers **`502` when nothing is running on 7104** — start it with
  `pnpm --filter @manifest/contract build && pnpm --filter @manifest/console dev`, and reach it
  at that name, never at `127.0.0.1:7104`. The API
  is under `/v1` on the same origin. It is also where a sign-in
  lands unless it was started with `?returnTo=` — the sign-in worked.
- **What a person can DO there today** (P5c Tasks 5 to 8): sign in with CWL and see who the
  platform thinks they are; list their projects and **create one** — choosing a blueprint and a
  starter, answering §24's audience question, with the name checked against §23 while it is
  typed and every refusal shown as the API's own code, message and hint; read the blueprint
  catalogue and a blueprint's knowledge pack; open a project to see its three hostnames,
  its `manifest.yaml`, its members, and **an activity feed on a live socket** — no polling, and
  new events appear without a reload; **BUILD it**, watching the builder's lines arrive as they
  are written, with the image digest and §12's scan when it ends and no reload needed;
  **RELEASE** that build; and **DEPLOY to staging**, watching `instance.provisioning` →
  `sso.registered` → `instance.starting` → `instance.healthy` arrive one by one, then clicking
  the app's own URL and signing in to the running application with CWL. A failed deploy shows
  §14's **Incident** — the check that failed, the diff since the last healthy release, the repair
  prompt and the log tail — and says that the release before it is still serving, because it is.
  **Deploy to production is there and is refused**, with §13's checklist rendered from the
  refusal's own envelope. **The queue and tokens are screens a later sitting of P5c builds**;
  until then each says so rather than showing a blank page.
  - **Two traps worth knowing before you click:** *Build* builds **the commit of the manifest
    last validated**, not the repository's HEAD — press *Re-validate* first if you have pushed —
    and **a build's log lines are never replayed**, so the panel reads them back from
    `GET /v1/builds/{buildId}/logs` when you open it; the socket only carries what is written
    while you watch.

---

## 4. Driving it without a browser — for scripts and agents

**The demo scripts are the reference client.** Read `scripts/demo-ai.sh`: every call, in
order, by `curl`. Its helpers are shared and should be reused, not copied:

| File | Gives you |
|---|---|
| `infra/lib/idp-login.sh` | `idp_login` — the three-hop CWL sign-in, into a cookie jar, for the control plane or any app |
| `scripts/lib/api.sh` | `api`, `field`, `json`, `environment` — every call to the control plane, with its `Idempotency-Key`; paths spelled as the contract spells them, `/v1` included |
| `scripts/lib/proof-app.sh` | `app`, and the proof app's assemble / push / validate / build / release / deploy |
| `scripts/lib/event-stream.mjs` | `watch` subscribes to a project's event stream with a jar's session; `expect` checks what it carried |

The lifecycle, as the API sees it: `POST /v1/projects` (a slug, a blueprint, optionally a starter, and a required `audience`) → push to the bare repository →
`POST /v1/projects/:id/spec` (validate a commit) → `POST /v1/projects/:id/builds` (**answers `202` while the
build runs**; it ends as `build.succeeded` or `build.failed` on the event stream, and `GET /v1/builds/:id` says
which — `wait_for_build` in `scripts/lib/api.sh` polls it) →
`POST /v1/projects/:id/releases` → `POST /v1/environments/:id/deploy`. Every resource route is
under `/v1` (D23.8); an old path answers `404 ROUTE_NOT_FOUND`. **A deploy that fails is a
`200` whose `state` is `failed`** — check for `healthy`, never just for a response. A deploy
streams `instance.provisioning`, then `instance.starting`, then `instance.healthy` or
`instance.failed`, so a client can show the states as they happen rather than only the outcome.

---

## 5. Checking and testing

| Command | What it proves | Needs | Takes |
|---|---|---|---|
| `make doctor` | The machine can run the platform | nothing running | seconds |
| `make verify` | The running platform is correct — DNS, TLS, the edge, the mirror, grants, the IdP | `make up` | ~1 min |
| `pnpm test` — **from the repo root, run it twice** | The control plane's unit and Postgres tiers, and the generated client and the journey; a second run catches state leaks | `make up` (Postgres) | ~45 s |
| `pnpm lint`, `pnpm typecheck`, `pnpm format:check` | The other three commit gates. Tests do not check types — `tsc` does | — | ~30 s |
| `pnpm test:docker` | Real builds, deploys and containers | `make up` | ~15 min |
| `make demo`, `make demo-identity`, `make demo-ai` | The acceptances, end to end, through the real API and the edge | `make up` and the control plane | 1–3 min each |
| `make demo-redeploy` | P4c's acceptance, **green** — a redeploy that interrupts nobody and signs nobody out | `make up` and the control plane | ~3 min |
| `make demo-journey` | **P5a's acceptance** — §22's journey through the edge by nothing but the client generated from the OpenAPI document, **all 8 steps**: sign in, create, stream, build, release, deploy, enter the app with CWL, be refused production with §13's checklist, and read the fleet as an administrator. Green three times on 2026-09-17, the third from a `make reset` machine, and now step 8 of `scripts/offline-acceptance.sh` | `make up` and the control plane | ~4 min |
| `make demo-token` | **P5b's acceptance** — D24's loop through the edge, on `token-app`: an instructor mints a delegated token, the agent holding it builds and deploys to staging on its own authority, is refused the fleet and a production promotion, asks to add a member and is handed a question, the instructor confirms it, and the agent's own retry succeeds **once** — then a fresh ask is rejected and the token is revoked. **It is green from a `make reset` machine and is step 9 of the offline acceptance** (Task 13, 2026-09-18) | `make up` and the control plane | ~30 s |
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
- **A redeploy no longer signs anybody out — unless the app was generated before 2026-09-16.**
  Sessions live in the app's own Mongo (`auth/session.js`, P4c sitting 7); an older app that
  still configures `express-session` itself keeps them in memory until it mounts that module.
  A sign-in that is half-way through at the IdP when the route moves fails once — press sign in
  again. Nothing else is interrupted: the new container starts beside the old one, the route
  moves only once the new one answers as itself, and the old one is then drained and removed
  with its `-files` volume and its AI key.
  **Containers left by a redeploy from BEFORE P4c are reaped by that app's next redeploy**, and
  one a redeploy failed to retire by that or the next control-plane boot; to clean anything
  older up by hand, RUNBOOK's *Known gaps* — and remove each one's `-files` volume too, because
  it holds a private key.
- **An AI app whose gateway drops off its network can make a person wait ten minutes** before an
  error. Redeploying the app re-attaches it. RUNBOOK's *Known gaps*.
- **`403 manifest: the control plane is not reachable from this network`** is the console's origin
  refusing a request that did not come from the host — from a container, an app included. That is
  §12 working. From the host, a `502` there means the control plane is not running.
- **`403 CSRF_ORIGIN_REFUSED`** is a `POST` (or an event-stream upgrade) that carried your
  session and no `origin: https://console.manifest.internal` header. A browser on the console
  sends it; `curl` does not unless you add `-H "origin: https://console.manifest.internal"`.
  Every deployed app is same-site with the console, so the cookie alone proves nothing (§20).
- **`401 SAML_LOGIN_NOT_BOUND`** is a sign-in finished in a different browser — or cookie jar —
  from the one that opened `/auth/login`. Start again at `/auth/login` in one browser.
- **A sign-in to Manifest fails after `pnpm test:docker`** until the control plane is restarted: the
  tier re-registers Manifest's own SP at a loopback ACS, and the boot puts it back.
- **Signing out ends on `URL not allowed`, or the IdP's pages answer `500` with nothing in the
  log about SAML**, after pulling a change to `infra/idp/config/`: the IdP reads `config.php` through
  a single-file mount, which a `git pull` or `git checkout` strands on the old file. `make up` does
  not re-bind it. `docker restart manifest-idp`.
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
