# The external track

**Spec:** [`superpowers/specs/2026-08-29-manifest-platform-design.md`](./superpowers/specs/2026-08-29-manifest-platform-design.md) — C4, §9, §13, §19
**Roadmap:** [`superpowers/plans/2026-08-29-plan-roadmap.md`](./superpowers/plans/2026-08-29-plan-roadmap.md) — gap 5
**Opened:** 2026-08-29

---

## What this is

Every item below is decided by **people outside this team, on their own cadence**.
None of it is software, so none of it will ever appear in an implementation plan —
which is exactly why it needs somewhere to live. Between them these items carry the
longest lead times in the project.

C4 states the constraint and refuses to soften it:

> Every production app requires its own UBC IAM registration and its own Privacy
> Impact Assessment. **Non-negotiable.**

D19 states the response:

> The platform's job is to **drive** them, not merely wait on them.

Driving them starts with knowing what is outstanding, who has it, and how long it
has been sitting — which is the same framing §26 gives the admin console's queue,
applied to ourselves.

**Owners are unassigned below.** Each `—` is an action, not a blank: nothing here
moves until a named person on both sides owns it. Fill them in before anything else
on this page matters.

**The start condition has been met (2026-09-15).** Rich decided on 2026-09-05 that this
track starts once the local proof of concept works end to end — CWL sign-in, a Mongo
write, an LLM answer. P4b's Task 16 completed the third: `make demo-ai` runs green,
including from a `make reset` machine, and the proof app's `manifest.yaml` and README now
declare its data classification, its models and what reaches them — the inputs items 3
and 4 need. **Starting the track is Rich's call. Nothing below has been raised.**

---

## Open items

| # | Item | Gates | Manifest supplies | UBC owner | Our owner | Raised | State |
|---|---|---|---|---|---|---|---|
| 1 | Manifest's own IAM registration | Deploying the control plane to UBC infrastructure at all | SP metadata, attribute justifications, contacts | — | — | not yet | **not raised** |
| 2 | Platform-level PIA for the control plane | Same | Description of what the control plane itself holds and where | — | — | not yet | **not raised** |
| 3 | Proof app IAM registration | Phase 2 ending with a genuinely launchable app | Generated registration package (§9) | — | — | not yet | **not raised** |
| 4 | Proof app PIA | Same | Generated PIA draft (§9) | — | — | not yet | **not raised** |
| 5 | Access to `authentication.stg.id.ubc.ca` | D21's pre-production rehearsal; Phase 2 | Nothing — an access request | — | — | not yet | **not raised** |
| 9 | `passport-ubcshib`'s SAML library carries a critical advisory | Nothing in Manifest — it is **not** blocking us | The measurement, and the clean successor (`@node-saml/passport-saml@5.1.0`) | — | — | 2026-09-08 | **not raised** |

### Later, but name them now

| # | Item | Gates | Why it is here already |
|---|---|---|---|
| 6 | Independent security review / penetration test | The first **public** production app | Scheduling a review is itself a multi-week lead time, and §24 makes it a launch gate for `public` audiences |
| 7 | Incident response ownership | Any public launch | §19 puts it plainly: when a manifested app is breached at 3am, who responds? The faculty owner cannot. It must be **named** before public launch, and naming it is a conversation, not a task |
| 8 | Breach notification procedure and data disposal on sunset | Any public launch | Privacy Office; pairs with `data.retention_days` (§7) and the hibernation-derived sunset policy (§15) |

---

## Notes per item

### 1–2 — Manifest's own registration and PIA

The easiest to forget, because §9 buries the point in a sentence: **Manifest itself
is a Service Provider.** Its own users log in with CWL, so on UBC infrastructure the
control plane needs its own IAM registration and its own platform-level PIA,
entirely independent of any app's.

These gate *deploying the control plane at all* — that is, Phase 5 — which sounds
distant until you price the turnaround. **Raise both now.** Nothing about Phases
0–4 is blocked by them, and nothing about them is blocked by Phases 0–4: the control
plane's own attribute needs (`ubcEduCwlPuid`, `mail`, `eduPersonAffiliation`) are
already known from §6's `User` entity and do not depend on a line of code being
written.

### 3–4 — The proof app's registration and PIA

§17 is explicit that these start **during Phase 1**, not after Phase 2:

> Sequencing them after Phase 2 would leave a finished platform idling on tickets;
> running them in parallel means Phase 2 ends with a genuinely launchable
> application.

They do a second job that is easy to undervalue. Manifest *generates* both documents
(D19), and nobody outside this team has yet read one. Putting a generated package in
front of a real IAM reviewer and a generated draft in front of the Privacy Office
**while both are still cheap to change** is the only way to find out whether they are
any good. A generator whose output a reviewer rejects is worse than useless, and we
would rather learn that in month two than in month ten.

Dependency: these need the proof app's `manifest.yaml` to exist — since P5a Task 10
`blueprints/node-ts-mongo/starters/proof-app/manifest.yaml`, until then `fixtures/proof-app/` — which is
P4b (see the log below — P4a's demo will look like the trigger and is not it). Raise the *conversation* before then; submit when there is a real spec to
submit.

### 5 — UBC staging IdP access

Cheap to ask for, slow to arrive, and D21's rehearsal cannot happen without it.
Nothing else depends on it, so it fails quietly by never being requested. Ask early.

---

## How to use this page

- **One line per state change**, appended to the log below, with a date. The
  headline number is the same one §26 gives the admin console: **the age of the
  oldest unresolved item.** A queue that is merely long is working; a queue that is
  stale is not.
- **Review it at the top of every phase boundary.** These items do not surface
  themselves.
- When Manifest can submit these programmatically, this page stops being a
  checklist and becomes a status view of `IamRegistration` and `PrivacyAssessment`
  objects. §9's "toward automated submission" section exists so that the transition
  is a change of mechanism rather than a change of design — the two states are the
  same state transition with a different driver behind it.

## Log

| Date | Item | Change |
|---|---|---|
| 2026-08-29 | — | Page opened. All eight items unassigned. |
| 2026-09-05 | — | **Deliberately still unstarted, and that is a decision rather than a slip.** Rich's call: the external track begins once the local proof of concept works end to end — P4's proof app, CWL login through to an LLM answer. The reasoning is that the goal is to get this right rather than to get it started, and a registration conversation goes better with a working demonstration behind it than with a design document. C4 keeps its weeks of latency and its §9 risk rating; nothing about the assessment changed, only the timing. Recorded so the next reader does not mistake it for an oversight and re-raise it. |
| 2026-09-07 | — | **Still unstarted; the trigger is now explicitly P4b, not P4a.** P4 was split in two on 2026-09-07 (Rich's call): **P4a** is identity, secrets and the §8 injection contract, and its acceptance is the proof app signing a real person in with CWL and writing a note; **P4b** adds the LLM answer. ORIENTATION §8's trigger is the **full** proof app — CWL login *through to* an LLM answer — so it is **P4b's acceptance that fires this**, not P4a's. Recorded because P4a's demo will look like the trigger and is not it. Nothing about C4's assessment has changed. |
| 2026-09-07 | — | **Still unstarted, and the trigger has moved measurably closer.** P3 executed in full: an application now goes from a bare git repository to a healthy, routed, TLS-terminated URL on one laptop, offline. That is not yet the trigger — the trigger is **P4's proof app**, CWL login through to an LLM answer — but P4 is now the work in hand rather than a plan waiting on another plan. Nothing about C4's assessment has changed; recorded so the next reader can see the distance shrinking rather than re-raise the decision. |
| 2026-09-08 | — | **Still unstarted; the trigger is unchanged and is now one half closer.** P4a's Tasks 1–3 executed: an app now hands a real person to the Manifest IdP, they sign in, and the app receives exactly the attributes its registration declared, named by the OIDs UBC's own service uses. That is **P4a's** half of the trigger; ORIENTATION §8 makes the trigger the **full** proof app, CWL login *through to* an LLM answer, which is P4b's. Nothing about C4's assessment has changed. |
| 2026-09-08 | **new, item 9** | **`passport-ubcshib` depends on a library with a critical, unfixable advisory — and this is UBC's to decide, not Manifest's.** `passport-saml` is npm-**deprecated** and carries GHSA-4mxg-3p6v-xgq3, a SAML **signature-verification** vulnerability, at range `*`; `@xmldom/xmldom@0.7.13` sits under it with five highs. The maintained successor, `@node-saml/passport-saml@5.1.0`, audits **clean**. Six UBC applications use `passport-ubcshib`. Manifest is **not blocked** — §12's scan gate now blocks only on findings that have a published fix (Rich, 2026-09-08) — so this is on the external track because somebody at UBC should know, not because it gates us. Measured while executing P4a Task 3. |
| 2026-09-09 | **item 9** | **The advisory is now in the SHIPPING blueprint, not only in a test fixture.** P4a Task 12 created `node-ts-mongo@1` — the blueprint every faculty application is generated from — and it pins `passport-ubcshib@0.1.6`, so `passport-saml@3.2.4` and GHSA-4mxg-3p6v-xgq3 are replicated into every app Manifest deploys. §20 calls a blueprint "a security multiplier" and this is what that means in practice. Manifest is still not blocked: measured on the running platform, §12's scan gate **records and does not block** the unfixable `passport-saml` finding, exactly as Rich settled it on 2026-09-08, and an npm `override` pins `@xmldom/xmldom` to 0.8.15 so its five highs are cleared. Nothing changes about who owns the fix — moving the six UBC applications to `@node-saml/passport-saml@5.1.0` is UBC's call — but the exposure is larger than when this item was raised, and the next reader should know that before ranking it. |
| 2026-09-17 | — | **Still unstarted, and the trigger fired two days ago.** P5a executed in full (its acceptance, `make demo-journey`, ran green three times on 2026-09-17, the third from a `make reset` machine), so Manifest's whole journey — create a project, build it, deploy it, sign in inside it with practice CWL, ask to go live — is now driven through one published, versioned API. **That changes nothing about C4's assessment and does not move any item below**; it is recorded because the reason to start the external track is no longer "the proof works" but "the platform is stable enough that the IAM conversation has a fixed surface to describe" — the ACS URL, the attribute set and the SP registration a real CWL integration would need have not changed since P4a. The trigger itself fired on 2026-09-15 with P4b's acceptance, and starting the track remains Rich's (ORIENTATION §2). |
