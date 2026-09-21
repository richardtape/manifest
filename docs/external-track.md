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

**AND SINCE 2026-09-20 ITEMS 3 AND 4 BLOCK A REAL REFUSAL RATHER THAN A FUTURE ONE.**
P6a's sitting 4 gave `IamRegistration` and `PrivacyAssessment` real tables an administrator
writes over the API (migration 0019, R1), and its **sitting 5 made §13's checklist the thing
that gates a production deploy** — one evaluation, `launch/gate.ts`, called by the deploy
route. Measured that day against a live project: with nothing recorded the checklist reads
`iam-registration: unmet` and `privacy-assessment: unmet`, and the deploy is refused carrying
exactly that list. **So the platform is now waiting on a real registration and a real PIA
rather than on code** — which is what ORIENTATION §2 means by *P6a makes this track more
urgent, not less*. Items 3 and 4's *Manifest supplies* column still says **generated**
packages, and that stays P8's: P6a records what UBC said, it does not produce the submission.

**AND SINCE P6a SITTING 8 (2026-09-20) THE ATTRIBUTE LIST IN THAT RECORD IS LOAD-BEARING.** When
item 3 comes back, `registered_attributes` must be what UBC IAM actually released — not what the
app asks for. Every build of the app is now checked against it (a build asking for an attribute
IAM did not register **fails**, naming the attribute and the ticket), and §13's
`iam-registration` item is `met` only when the release that would be promoted asks for a subset of
it. A list copied from the app's own `manifest.yaml` would make both checks vacuous.

---

## Open items

| # | Item | Gates | Manifest supplies | UBC owner | Our owner | Raised | State |
|---|---|---|---|---|---|---|---|
| 1 | Manifest's own IAM registration | Deploying the control plane to UBC infrastructure at all | SP metadata, attribute justifications, contacts | — | — | not yet | **not raised** |
| 2 | Platform-level PIA for the control plane | Same | Description of what the control plane itself holds and where | — | — | not yet | **not raised** |
| 3 | Proof app IAM registration | Phase 2 ending with a genuinely launchable app | Generated registration package (§9) | — | — | not yet | **not raised** |
| 4 | Proof app PIA | Same | Generated PIA draft (§9) | — | — | not yet | **not raised** |
| 5 | Access to `authentication.stg.id.ubc.ca` | D21's pre-production rehearsal; Phase 2. **Since P6a sitting 9 this is the ONLY part of a first production launch Manifest cannot do for itself** — it runs a local, production-shaped rehearsal and says in the checklist that it proves the registration's shape and never UBC's acceptance of it | Nothing — an access request. Two settings change when it arrives: `MANIFEST_IDP_BASE_URL` and the rehearsal account | — | — | not yet | **not raised** |
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
| 2026-09-19 | — | **Still unstarted — and P6a makes this the most urgent item on the page, for a reason that is new.** P6a, the first production launch, was written on 2026-09-19 (19 tasks in eleven sittings). Under **R1** — Rich's decision that day — it folds `IamRegistration` and `PrivacyAssessment` into the plan as **tracked objects with manual state transitions**, so §13's launch gate blocks on **real rows an administrator records with a pasted ticket reference** rather than on a checkbox. P8 still generates what they carry. **What changes for this page: until now the external track was a prerequisite for a platform that did not yet have anywhere to put the answer. After P6a executes it will have one, and the platform's own gate will be waiting on a real UBC IAM registration and a real Privacy Office assessment for the proof app.** Nothing about C4's assessment changed and no item below moved; starting the track remains Rich's (ORIENTATION §2 and §8). Recorded because the *shape* of the dependency has inverted — it is no longer "start it early because it is slow", it is "the software is about to be ready for its output". |
| 2026-09-20 | — | **The rows EXIST now, and they are empty — so this page's dependency is no longer about a future plan.** P6a sitting 4 executed Tasks 5 and 6: migration **0019** created `iam_registrations` and `privacy_assessments` with §9's submission states, and an administrator can record either over the API with a pasted ticket reference (`POST /v1/projects/{id}/launch-records/iam-registration`, and the same for the assessment). Queried at that sitting's close: **`iam_registrations=0`, `privacy_assessments=0`.** The entry above said *"after P6a executes it will have one"* — the place to put UBC's answer is there **now**, three sittings before the gate that reads it (Task 7) and five before an administrator can fill it in by clicking (Task 17). **Nothing about C4's assessment changed and no item below moved**; starting the track remains Rich's. Recorded because the previous row's own claim about timing has come true early, and a page that states a future tense after it has passed is the defect ORIENTATION §9 names. |
| 2026-09-20 | — | **ITEM 5 IS NOW THE ONE THIS PAGE TURNS ON, and P6a sitting 9 is why.** The platform put an application into production on the laptop: `journey-app` answers its production address behind §13's whole checklist, including **D21's rehearsal, which Manifest now runs by itself** — it deploys the candidate to the production hostname, registers its Service Provider with production values and **completes a real CWL sign-in**, recording which attributes the assertion actually released. **That rehearsal is explicitly NOT the one D21 asks for**, and the checklist item says so in its own words: the Manifest IdP is not real Shibboleth (D6), so it proves the SHAPE of the registration and nothing about UBC's acceptance of it. **The run against `authentication.stg.id.ubc.ca` is still owed, and it is now the only part of a first production launch this platform cannot do for itself.** Sitting 9 also measured what makes it urgent in a second way: **a production deploy points the application at `authentication.ubc.ca`**, real UBC Shibboleth, which this laptop cannot reach — so an application "in production" here serves and signs nobody in, by design. The two settings that change are `MANIFEST_IDP_BASE_URL` and the rehearsal account (`MANIFEST_REHEARSAL_USER` / `MANIFEST_REHEARSAL_PASSWORD`), which is what access to UBC's staging IdP would fill in. **Nothing about this needs a plan: it needs an access request.** |
