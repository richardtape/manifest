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

---

## Open items

| # | Item | Gates | Manifest supplies | UBC owner | Our owner | Raised | State |
|---|---|---|---|---|---|---|---|
| 1 | Manifest's own IAM registration | Deploying the control plane to UBC infrastructure at all | SP metadata, attribute justifications, contacts | — | — | not yet | **not raised** |
| 2 | Platform-level PIA for the control plane | Same | Description of what the control plane itself holds and where | — | — | not yet | **not raised** |
| 3 | Proof app IAM registration | Phase 2 ending with a genuinely launchable app | Generated registration package (§9) | — | — | not yet | **not raised** |
| 4 | Proof app PIA | Same | Generated PIA draft (§9) | — | — | not yet | **not raised** |
| 5 | Access to `authentication.stg.id.ubc.ca` | D21's pre-production rehearsal; Phase 2 | Nothing — an access request | — | — | not yet | **not raised** |

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

Dependency: these need `fixtures/proof-app/`'s `manifest.yaml` to exist, which is
P4. Raise the *conversation* before then; submit when there is a real spec to
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
