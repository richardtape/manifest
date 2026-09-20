# Interface design brief — the two surfaces people actually use

*Written 2026-09-19 for a design agent with no prior context. Everything here is read from the
spec or the code at `8d90e15`, not imagined. **Two surfaces are described and they are different
products**; §12 says whether to give them to one agent or two. Read §11 before deciding anything
visual — it names a constraint that may decide your whole direction.*

> **ONE THING TO KNOW UP FRONT.** Rich decided on 2026-09-19 that **both** surfaces get real
> design effort. The spec currently says the admin console is *"rudimentary and deliberately
> so… not a product surface"* (§26, *Scope*). **That one paragraph needs a spec action, proposed
> in §13 and not yet applied.** Nothing else in the spec contradicts this brief, and §22's
> reference console is deliberately unaffected — see §2.

---

## 1. What Manifest is, in the terms a designer needs

A faculty member at UBC describes an application in plain language, an AI agent builds it, and
Manifest deploys it — authenticated with UBC's CWL single sign-on, running on UBC infrastructure —
**without the faculty member ever seeing a container or a YAML file.**

That last clause is a hard constraint, not an aspiration. It is **C3** in the spec, and it is the
single most important rule in this document:

> **A faculty member must never be shown infrastructure.** No containers, no YAML, no exit codes,
> no digests where a word would do, no "deployment failed: 1". §14 puts it as a requirement on
> every event the platform emits: *"Your app couldn't start — it's asking for a database it hasn't
> declared", not `exit code 1`.*

An operator, by contrast, needs exactly that detail exposed. **This is why these are two products
and not one with a role switch.**

---

## 2. Three surfaces exist. You are designing two of them.

| | What it is | Your job? |
|---|---|---|
| **`packages/console`** — the reference console | Already built and working. §22's *"executable proof that the public API is complete and sufficient"*. Deliberately **plain**: no design system, no branding, system fonts. It exists so that a missing API endpoint becomes a build failure | **No.** Leave it alone. It is a test instrument, not a product |
| **The faculty product** | The real experience. §22: *"The real experience is the separate front-end project's job."* It will live at `app.manifest.internal` | **Yes — §4** |
| **The admin console** | §26. An operations tool for the team running the platform. Its primary screen is a queue | **Yes — §5** |

**Use the reference console as a functional reference and never as a visual one.** It shows you
what the API can do and what the journey feels like in sequence. Every choice it makes about
appearance is explicitly disclaimed by the spec.

---

## 3. The two people

**The faculty member.** A teaching or research academic. Not a developer. They have an idea for a
course tool — a rubric helper, a lab booking page, a reading-response collector. They are
time-poor, they are doing this around teaching, and **they will meet this platform perhaps six
times a year.** They will not learn a mental model. Every screen must re-explain itself.

They also carry a real anxiety the design must address: this thing is going to be used by their
students, and if it breaks in week eight during an assessment, that is their problem in front of
200 people.

**The platform administrator.** A member of the team running Manifest. Technical. Uses it daily or
weekly. Their job is mostly **unblocking other people** — and the platform is deliberately built
so that a specific, enumerable set of actions requires their judgement. §26 puts the consequence
plainly: *"the number of people waiting on an administrator is the platform's central operational
metric rather than an afterthought."*

---

## 4. Surface one — the faculty product

### 4.1 The journey, which is the spine

§22 defines it, and it has been driven end to end by a real person in a browser:

1. **Sign in** with CWL
2. **Create a project** — a name, a blueprint, a starter, and *who it is for*
3. **Watch it provision** — repository created, `manifest.yaml` validated
4. **Build it** — build logs stream live, line by line
5. **Deploy to staging** — instance states arrive live
6. **Open the running app**, sign in to it with CWL, use it
7. **Request production** — and see what a first launch still needs, with reasons
8. **Manage it** — members, delegated tokens for an agent, the queue of questions an agent asked

**Steps 3, 4 and 5 are live.** Events arrive on a WebSocket with no reload. A build's log lines
appear as they are written. An instance moves `provisioning → starting → healthy` in front of you.
**This is the most emotionally important part of the product** — it is the moment an idea becomes a
real thing at a real address — and it is also where the interface is most likely to feel broken if
it is designed as a page that refreshes.

### 4.2 The objects, and every state they can be in

Read from the published contract; these are the real enums.

| Object | States |
|---|---|
| **Build** | `pending` · `running` · `succeeded` · `failed` |
| **Instance** (a running copy of an app) | `pending` · `building` · `provisioning` · `starting` · `healthy` · `failed` · `hibernated` · `waking` · `destroying` · `gone` |
| **Pending action** (a question an agent asked) | `pending` · `confirmed` · `rejected` · `expired` |
| **Launch readiness item** | `met` · `unmet` · `not_built` |

**Three environments exist for every project from the moment it is created** — `sandbox`,
`staging`, `production` — each with its own permanent address.

**A hard-won detail worth designing for:** *what is serving* and *what the last attempt did* are
two different facts. A failed deploy is a real state, and while it fails **the previous version
keeps serving**. An interface that shows one number will be wrong half the time. This was found
the expensive way.

### 4.3 The launch checklist — the most distinctive screen in the product

Going to production for the first time is **a checklist, not a button**. Seven possible items,
each with a state, a plain-English reason, an owner, and — for things not built yet — the honest
admission that Manifest cannot do it yet:

`domain` · `iam-registration` · `privacy-assessment` · `rehearsal` · `scans` · `admin-approval` ·
`load-rehearsal`

**Two of these have multi-week lead times** — registration with UBC's identity team, and a Privacy
Impact Assessment. The spec is emphatic about the design consequence:

> *Manifest surfaces them the moment a project is created — not at the point the owner asks to go
> live. **A faculty member should never discover the existence of a PIA on the day they wanted to
> launch.***

So this is not only a screen you reach at the end. **Its state has to be visible from the
beginning**, and that is a real design problem: how do you show someone, in week one, that
something they do not yet care about will block them in week twelve — without making week one feel
like bureaucracy?

### 4.4 Things that are slow, and need honest waiting

A build takes minutes. A deploy takes up to ninety seconds. An IAM registration takes **weeks**. A
PIA takes **weeks**. These are not spinners. The interface needs a vocabulary for *"this is
progressing and you may leave"*, distinct from *"this is waiting on a person"*, distinct from
*"this is stuck and you should act"*.

### 4.5 Moments that need particular care

- **A delegated token's secret is shown exactly once**, and is unrecoverable after. It is the
  credential a faculty member gives to an AI agent.
- **Privileged actions require re-authentication** — signing in again, in the moment, even though
  you are already signed in. Four actions need it: approving a release, reading a secret, changing
  a quota, changing who is on a project.
- **Four things an agent may never do on its own.** When an agent asks, it is refused and **a
  question appears for a human** — who confirms or rejects it *in their own words*, and the
  rejection reaches the agent verbatim. This loop is real and clicked. It is unusual and it needs
  explaining on screen, not in documentation.
- **Destructive and irreversible things**: revoking a token an agent is using, removing a
  collaborator, and — after a production launch — the fact that **the project's name can never
  change**, because it has been registered externally.

---

## 5. Surface two — the admin console

### 5.1 The primary screen is the queue, not the fleet

This is §26's central claim and it should drive the whole design. Every queue item is derived from
something that already exists:

| Waiting on | Decided by |
|---|---|
| A release awaiting approval | admin |
| An agent's request needing confirmation | the person who minted the token |
| An IAM registration to submit or amend | admin, then UBC IAM |
| A privacy assessment to review | owner, then the Privacy Office |
| A verified domain awaiting attach | admin |
| An audience upgrade request | admin |
| A launch item needing an override | admin, recorded as an override |

**Each item shows: what is being asked, by whom, what changes if it is granted, the diff where
there is one, and how long it has waited.** And the headline number is not the queue's length:

> *"The console's headline health number is **the age of the oldest item**, because a queue that is
> merely long is working and a queue that is stale is not."*

That sentence is a design instruction. Build the screen around it.

### 5.2 The other screens

- **Fleet** — every app: owner and department, environments and state, current release, audience
  tier, domains, last deploy, open incidents, AI spend this month.
- **People** — every user, role, projects owned or collaborated on, last seen, outstanding tokens.
- **Spend** — AI spend by project **and by end user**. It answers *"which of 300 students spent the
  budget"*.
- **Health and risk** — open incidents; certificates expiring within 90 days; policies the
  infrastructure reports it cannot enforce; failed security scans; apps on a superseded blueprint.
- **Audit** — an append-only log, filterable by actor, project and action.

### 5.3 One rule with a visible consequence

**An administrator acting on someone else's project must give a reason**, and that reason is
stored in the audit log *and shown to the project owner in their event stream*. So an admin action
is not a quiet operation — the design should make it feel observed, because it is.

---

## 6. The language rules, which both surfaces share

**Every error the platform returns carries three things**: a stable machine `code`, a `message`
for a person, and a `hint` saying what to do about it. There are **68 codes**. The contract says of
the message: *"For a person. Never parse it; switch on `code`."*

Two error responses carry extra structure worth designing for specifically:

- A refused production deploy carries **the whole launch checklist** in the error — so the refusal
  and the checklist screen are the same information and should look like it.
- A refused agent action carries **the pending question** — so the agent's client, and the
  human's queue, are looking at one object.

**There are 21 event types**, and every event carries a faculty-legible sentence alongside its
machine detail. Use the sentence. It was written for this. *(Counted three ways on 2026-09-19 —
the source array, the published contract's 21 `anyOf` members, and its distinct type literals. An
earlier plan says 22; it is wrong and has been corrected.)*

---

## 7. What is real, and what you would be inventing

**Real, published, and drivable today:** 34 API operations, 52 schemas, the whole delivery journey
in §4.1. A contract at version 1.0.0.

**Not built, and you should know before you design it:** the API can *deploy* an app but cannot
*create* one. There is no way to write code or change `manifest.yaml` through it — **zero `PATCH`
or `PUT` operations in the entire API**, and no repository reference anywhere. So *"describe your
app and an AI builds it"* — the actual promise in §1 — **has no API behind it yet**.

This is an opportunity as much as a caveat. A design exploration of the authoring experience is a
genuinely useful input to the decisions that brief has left open
([`2026-09-19-authoring-api-brief.md`](./2026-09-19-authoring-api-brief.md)). **Label speculative
work as speculative**, keep it separate from the delivery journey, and say what API it would need.

---

## 8. How to run the real thing, with no platform

**`manifest-mock` serves all 34 operations from fixtures, with a scripted WebSocket** — real build
log lines arriving one at a time, real instance-state transitions — in a single `node:http`
process. No Docker, no database, no control plane. The RUNBOOK section is *Running
`manifest-mock`*.

**Design against it.** A front end was driven through the whole journey against it in a browser
with nothing else running. This is the difference between designing from a screenshot and
designing from the thing.

Its honest limits are documented in the RUNBOOK's *What it does NOT prove* list — read it. One
known gap: of three refusal codes for the project-name check, the fixtures carry one.

---

## 9. Accessibility is a legal requirement, not a nicety

UBC is a public body in British Columbia. §15 records an **automated WCAG accessibility gate
before public launch** as *a legal requirement for UBC*. Design to it from the start; retrofitting
contrast, focus order and form labelling into a finished visual system is the expensive path.

---

## 10. What you are NOT deciding

- **Information architecture of the API.** Resources, names and shapes are published and versioned
  at 1.0.0. If a screen needs something the API lacks, **that is a finding worth reporting** — it
  is exactly what this platform's reference console exists to surface — but do not assume it.
- **Whether a rule exists.** The privileged-four rule, the launch checklist, the one-time secret,
  the re-authentication — these are settled security decisions. Design how they are *experienced*,
  not whether they apply.
- **The reference console's appearance** (§2).

---

## 11. The constraint that may decide your visual direction

**UBC has a mandated Common Look and Feel, and this project has already vendored it.**
`infra/idp/modules/ubc-clf-7/` holds CLF **7.0.5** — six asset files fetched from `cdn.ubc.ca`,
with their checksums and licences recorded — and the practice sign-in page already wears it, so
that people can see what a real CWL sign-in will look like before approvals exist.

A faculty-facing UBC service will very likely have to wear it too. **Establish early whether CLF is
mandatory for these two surfaces**, because the answer is the difference between designing a visual
system and applying one. The admin console, being internal, may have more freedom than the faculty
product.

---

## 12. One agent or two?

**Recommended: two efforts, sequenced, with one shared vocabulary.**

They differ on every axis a designer cares about — different users, opposite relationships to
infrastructure (§1's C3 hides it; §5 exposes it), different frequency of use, different phases of
delivery. One agent holding both will tend to average them, and the average is wrong for both.

**But the vocabulary must be shared**: state names, refusal language, how an event reads as a
sentence, how waiting is expressed. **Do the faculty surface first and derive the vocabulary
there**, because §14's *faculty-legible* bar is the harder one; the operations tool then inherits
it rather than inventing a second dialect.

---

## 13. Spec action — PROPOSED, NOT APPLIED

**One paragraph.** §26's *Scope* currently reads:

> *"Rudimentary and deliberately so: tables, filters, a queue, and the actions the API already
> exposes. It is an operations tool for the team running the platform, not a product surface, and
> it inherits `console/`'s quality bar (§22) for the same reason."*

Rich decided on 2026-09-19 that the admin console gets real design effort, which that sentence
forbids. The proposed change keeps everything true about its *purpose* — an operations tool, on
the same public API, built around the queue — and removes only the claim that it inherits the
reference console's deliberately-plain quality bar.

**§22 is deliberately NOT changed.** The reference console stays plain: it is the proof that the
API is complete, and the moment it becomes a product surface it stops being a reliable instrument.
**§26's D31 framing, its queue table and its non-repudiation rule are unchanged too.**

**Do not apply this without Rich's explicit approval.** It is in ORIENTATION §8.
