# The faculty product — an interface design, and what designing it found

*Written 2026-09-19 against [`design-handover.md`](./design-handover.md) (generated from commit
`45e5b9d`), with no access to the running platform. Everything on the screens comes from Part 1's
brief, Part 2's 34 operations, Part 3's 52 shapes and Part 6's fixtures. **Where a value is
invented rather than read, §7 says so by name.***

**The prototype:** <https://claude.ai/code/artifact/1df61167-fdf0-41bc-acbe-e60c12f51060> — fifteen
artboards on a canvas, all of them clickable, six of them animated. Press Play on *Your apps* and
walk the journey; the three live screens re-run themselves and each carries a *Watch again* button.
*Putting it somewhere I can try it* has a tweak that flips the ending from success to failure.

This document is the written half of the brief's deliverable: the visual direction and why, the
state and message vocabulary, how waiting is expressed — and then §7, the findings, which is the
part worth reading even if nothing else here survives contact with Rich.

---

## 1. Three things settled before anything was drawn

The brief names two questions a design agent should raise rather than decide silently. Both were
put to Rich on 2026-09-19 and both were answered; a third was a scope question of mine.

| Question | Answered |
|---|---|
| Does UBC's Common Look and Feel bind this product (brief §11)? | **No — free visual direction.** Rich chose this over both applying CLF 7.0.5 strictly and the middle option of inheriting only CLF's identity anchors. The risk he accepted is stated below. |
| How much of the speculative authoring experience should the prototype carry (brief §7)? | **The full flow**, clearly labelled. |
| Where does the written rationale live? | **This file**, rather than a closing section of the artifact. |

**The CLF risk, restated so it is on the record.** If CLF turns out to be mandatory for a
faculty-facing UBC service, this direction is rework, not a reskin — the type stack, the ground and
the card geometry all go. Two things limit the damage. Every colour is a literal hex in an inline
`style` attribute, so a palette swap is mechanical rather than architectural; and the parts that
carry the product's weight — the live step list, the two-fact block, the launch runway, the
one-time secret panel — are *layouts*, which CLF has no opinion about, rather than *components*,
which it does. The second cost has no mitigation: a faculty member handing an app to 200 students
gets no "this is a real UBC service" signal from the chrome. That is a trade Rich made knowingly.

---

## 2. The visual direction, and why this one

**The premise.** A faculty member meets this platform about six times a year (brief §3), and
carries a specific fear: that it breaks in week eight, during an assessment, in front of 200
people. The two obvious directions both fail that person. A developer-console direction — dark,
dense, monospaced — hands them the vocabulary C3 forbids. A consumer-SaaS direction — rounded,
bright, gradient-washed, cheerful — is *reassuring in a way it has not earned*, and that is worse,
because the whole product is asking for trust with student coursework on the other side of it.

**What was chosen instead: an editorial, papery calm.** The register is a well-made departmental
handbook rather than a dashboard — something that looks like it was written by people, for a
reader, and expects to be read rather than scanned.

- **Ground.** A warm off-white, `#F6F2EA`, with cards a half-step lighter at `#FFFCF7` and rules at
  `#E0D8C8`. No pure white anywhere. Paper rather than screen; and the warmth lets the five state
  colours sit on it without any of them reading as an alarm.
- **Type.** **Fraunces** for every heading — an optical serif with real character at display size,
  which does more work than any other single choice here: it makes the product read as
  *institutional and human* rather than *startup*. **IBM Plex Sans** for everything else, with
  **IBM Plex Mono** for the three things that are genuinely machine text: hostnames, the token
  secret, and the build log. One superfamily for body and mono means the technical register is a
  *shift within* the voice rather than an intrusion from outside it.
- **Accents.** Cedar `#A8492A` for every action a person takes, and Lake `#1A4F5C` for structure
  and for work in progress. Two accents, close in lightness, sharing enough chroma to read as one
  system.
- **No gradient washes, no left-border cards, no emoji, no Inter.** Icons are inline stroke SVG
  and there are very few of them; most status is carried by a coloured dot and a word, because a
  word survives being small and an icon does not.

**One deliberate inversion.** Three surfaces go dark: the build log pane, the one-time secret, and
the incident's repair prompt. All three are *machine text a person is being shown on purpose*, and
the inversion marks the boundary — you have stepped out of the product's voice and into the
machine's. It is the only place the design permits that, and it is always behind a deliberate act.

---

## 3. The state and message vocabulary

The brief asks for one vocabulary shared with the admin console later, derived here because the
faculty-legible bar is the harder one (§12). **Five states. Every screen uses only these.**

| State | Means | Reads as | Colour |
|---|---|---|---|
| **Working** | Moving on its own. You may leave. | a drifting bar, a breathing dot, and an honest duration | Lake `#1A4F5C` |
| **Waiting on someone** | A person or an office has it. | still, with **how long it has waited** | Amber `#8A5A0B` |
| **Needs you** | Stuck until you act. | one clear action, and what happens if you don't | Clay `#98301F` |
| **Steady** | It works. | a filled dot and a plain word | Moss `#2E6344` |
| **Not yet** | Real, but no clock has started. | hatched, muted, no action implied | Neutral `#6B6355` |

The platform's own enums collapse into these: `pending`/`building`/`provisioning`/`starting` and a
`running` build are all **Working**; `healthy` and a `succeeded` build are **Steady**; `failed` and
a `pending` question are **Needs you**; `hibernated` is **Not yet**; a launch item's `not_built`
is **Not yet** and an `unmet` one that somebody else owns is **Waiting on someone**.

**Three rules hold the vocabulary together.**

1. **Never show a raw state name.** `provisioning` is *"Making room for it"*; `healthy` is
   *"Answering"*; a failed instance is *"It never answered."* The word chosen always describes
   what the app is doing for a person, not what the platform calls it.
2. **Every refusal says what is still true.** This is the single most repeated sentence shape in
   the prototype, because it is the one that addresses the week-eight fear directly. A failed
   deploy: *"Nobody has lost anything."* A refused launch: *"Your app on the trying-out address is
   untouched."* A stopped agent: *"Nothing about your running app has changed. It is waiting, not
   failing."*
3. **Name the owner of every wait.** *"us, in minutes"*, *"you"*, *"UBC's identity team"*,
   *"UBC's Privacy Office"*. A wait with no owner is the thing that makes an institution feel
   like weather.

---

## 4. How waiting is expressed (brief §4.4)

The brief asks for three distinct vocabularies. The design's answer is one rule that produces all
three, and it is the piece of this I would defend hardest:

> **Motion means a machine is moving. Stillness plus a number means a person has it.**

- **Progressing, you may leave** — *Working*. A drifting diagonal bar, a breathing dot, a real
  duration (*"Working, a few minutes"*, *"Working, under 90 seconds"*), and an explicit card that
  says so in words: *"A few minutes. You can leave."* The build screen ticks each step only when
  that step has actually finished, and says so: *"Each line ticks when that part has actually
  finished, not on a guess."* No indeterminate spinner appears anywhere in the prototype.
- **Waiting on a person** — *Waiting on someone*. Amber, completely still, and always carrying an
  elapsed count. The agent's question shows *"waiting 42 seconds"* and the number **ticks upward
  live** while you read it, which is a small thing that does a lot: it makes the queue's age
  visible at the exact moment a person could reduce it. The two multi-week items show a hatched,
  empty time bar labelled *"Nothing counting yet"* against *"Takes weeks"*.
- **Stuck, act now** — *Needs you*. Clay, a single unambiguous action, and the reassurance
  sentence from §3's rule 2. The one animated element is the dot, at a slow 1.6s, which reads as a
  heartbeat rather than a siren.

**The thing that took the most thought: a build log is infrastructure.** Journey step 4 says *"build
logs stream live, line by line"* and the real lines are `#7 [4/8] RUN npm ci --omit=dev` and
`#12 pushing layers to 127.0.0.1:7107/local/mock-app`. Showing those to a faculty member fails C3
outright; not showing them loses the liveness that makes the screen work. The resolution is a
**translated stream by default, with the raw log behind a deliberate door**: seven narrative steps
derived from the log's own sequence numbers — *"Installing the 135 pieces it depends on"* is
`#7 added 135 packages in 6s` — ticking as each range completes, with a collapsed panel that
reports only a line count until you open it. Collapsed, it says *"You never need this. It's here
because the person you ask for help one day will."* That translation has no API behind it, which
is finding F1.

---

## 5. The launch checklist — the week-one problem (brief §4.3)

The brief poses it exactly: *how do you show someone in week one that something they do not yet
care about will block them in week twelve, without making week one feel like bureaucracy?*

**The answer is to stop treating the seven items as one list.** They are two different kinds of
thing wearing the same shape, and the interface separates them everywhere it appears:

- **Clocks** — `iam-registration` and `privacy-assessment`. Answered by other people, measured in
  weeks, and *worth starting long before you need them*. Two large cards, each with an empty
  hatched time bar reading **"Nothing counting yet · Takes weeks"**, an owner, and a single primary
  action that starts the clock.
- **Checks** — the other five. Minutes each, owned by you or by the platform team, and **explicitly
  not worth doing early**. One compact table, under a heading that says so: *"Five short jobs, for
  the end — minutes each, and not worth doing early."*

That split is what keeps week one from feeling like bureaucracy: **the page tells you what to
ignore.** The headline is *"Nothing here is due today"*, and the only urgency on the screen attaches
to the two things where urgency is real. A progress figure of "1 of 7" would read as a to-do list
seven-eighths undone; the card beside it reframes it instead — *"One done by itself. Two are clocks.
Four are short jobs for later."*

**The same information appears in three places and always as lead time, never as a chore.** On
*Your apps* it is a band headed *"Before your students can use it"* with the sentence *"Two long
waits… Starting them early is the whole trick."* On the project it is a single amber line:
*"Your privacy assessment hasn't been started. Until it is, nothing is counting down."* On the
checklist it is the full page. A faculty member who ignores it entirely still meets it three times,
and never as a demand.

**Honesty about what Manifest cannot do is designed rather than hidden.** Three of the seven are
`not_built`. Each says so in plain words — *"Manifest can't do this one for you yet"* — followed by
the most useful thing left: *"We'll draft the request with everything they need in it"*, and for
the PIA, *"We know what your app stores and who signs in, so most of the form answers itself. The
rest is three questions only you can answer."* An admission that ends with an offer is not
bureaucracy; an admission that ends is.

**And the refusal and the checklist are the same screen**, as the brief asks: *Ask to go live*
opens a panel inline on this page rather than navigating anywhere, because
`RELEASE_PRODUCTION_GATE_UNAVAILABLE` carries this very list.

---

## 6. The three moments (brief §4.5)

All three share a principle. **A faculty member who meets this six times a year will not carry a
mental model between visits, so each unusual rule re-explains itself at the moment it bites** — on
screen, never in documentation.

**A secret shown exactly once.** The panel inverts to near-black, which is the visual break
described in §2, and the heading is the promise itself: *"This is the only time you will ever see
this."* The friction is deliberate and shaped to be read: *Done* stays disabled until you tick **"I
have put it somewhere safe"**. What makes it humane rather than frightening is the sentence that
follows after it is gone: *"The key exists and works; we just can't read it back. If you lost it,
revoke this one and make another — that's a thirty-second job, not a disaster."* The same screen
explains the four an agent can never have, and does so as capability, not as a warning: *"Not 'off
by default' — impossible. If an agent tries one of these it is stopped, and a question appears for
you instead."*

**Re-authenticating for a privileged action.** The screen this sits on is adding a member, because
that is one of the four and is the most ordinary-feeling of them. The overlay's job is entirely
tonal — a person who is already signed in and is being asked again will read it as *suspicion*
unless told otherwise. So it says so: *"We're not doubting you. We're making it useless for anyone
who finds your laptop open."* All four are listed on the same screen, permanently, so the rule is
learnable rather than surprising. (What it cannot do is ask the API when to appear — finding F4.)

**An agent is refused and a human answers.** The most unusual loop in the product and the one that
most needs explaining on screen. Three moves:

1. **A three-step explanation lives beside the question, permanently** — the agent tried it, it was
   stopped *"at the door, whoever asks"*, you decide *in your words*.
2. **The semantics of yes are stated before you press it**, because "confirm" reads as "allow" and
   D24 means something much narrower: *"If you say yes, it gets one try at this one request. Not a
   standing permission — the next time it asks, you get asked again."*
3. **Rejecting requires words, and the field says where they go**: *"Your words go straight to the
   agent. Word for word, exactly as you write it."* The answered list quotes a real rejection
   back — *"that student is not on this course"* — in the person's own voice, set in italic behind
   a rule, because seeing your sentence preserved is what teaches you that the channel is real.

All four fixture states are on screen at once (`pending`, `confirmed`, `rejected`, `expired`), and
the expired one carries the reassurance that makes inaction safe: *"Ignoring this is a safe thing to
do — it is never a way to accidentally say yes."*

---

## 7. What designing this found — eleven things about the API

The brief says a client discovering an API gap early is valuable and asks for gaps to be reported
rather than quietly assumed. **Nothing in the prototype invents a field, a state or an endpoint**;
where a screen needed something absent, the gap is listed here and the screen works around it
visibly.

**F1 — build log lines have no faculty-legible counterpart, and events do.** Every one of the 21
event types carries a sentence written for a person. `LogFrame` carries `text`, which is raw
BuildKit output naming Dockerfiles, alpine base images and a registry at `127.0.0.1:7107`. So the
one screen the journey calls out for its liveness is the one screen whose live content cannot be
shown. The prototype translates in the client by mapping sequence ranges to seven sentences, which
is guesswork that breaks the first time the builder's output format changes. *Worth considering: a
`narrative` field on `LogFrame`, or a small series of build-progress events alongside the log.*

**F2 — `LaunchReadinessItem.why` is written in internal vocabulary.** The fixtures give
*"The PIA workflow is the external track."* and *"Custom domains are not built in Phase 1."* Both
are true and neither can be shown to a faculty member: one names an internal workstream, the other
names a project phase. This matters more than it sounds, because §13's checklist is the screen the
spec most insists a faculty member sees early. Either the field should carry the same
faculty-legible contract events do, or an item needs two strings. **Every launch-item sentence in
the prototype is written by me, not read from the fixture.**

**F3 — the checklist cannot express time, which is the entire design problem it poses.**
`LaunchReadinessItem` has `state`, `owner`, `blocking`, `why` and `builtBy`, and nothing else. There
is no `startedAt`, no `submittedAt`, no expected duration, and no link to the thing you would go and
do. Two consequences: (a) *"Takes weeks"* is hard-coded from the brief's prose rather than read,
and (b) **`unmet` cannot distinguish "never started" from "submitted three weeks ago and waiting"**
— the state enum is `met · unmet · not_built` with nothing in between. A screen whose stated purpose
is *"a faculty member should never discover the existence of a PIA on the day they wanted to launch"*
needs at minimum a started-at and a coarse duration band, and probably an `in_progress` state.

**F4 — there is no re-authentication signal anywhere in the API.** Four actions require step-up
auth, and none of the 68 codes expresses it. `UNAUTHENTICATED` means no session; `FORBIDDEN` means
you may not. A client must therefore hard-code which four operations prompt for a second sign-in —
which is exactly the duplicated policy that D24 was centralised to avoid on the token side. *Worth
considering: a `REAUTH_REQUIRED` code, ideally carrying what is being re-authorised.*

**F5 — there are two different "privileged four", and they are not the same four.** Brief §4.5
names *approving a release, reading a secret, changing a quota, changing who is on a project*.
`MintTokenRequest.capabilities` says the set refused to a delegated token is `members:manage`,
`release:promote`, `quota:set`, `secret:read`. `release:approve` against `release:promote`. This may
be deliberate — humans re-prove themselves for approval, agents are refused promotion — but the two
documents present the sets as parallel and they are not. The prototype writes each screen from its
own source, so the token screen and the members screen deliberately list slightly different fours.
**Worth an explicit answer, because the faculty copy has to commit to one.**

**F6 — "what is serving" and "what the last attempt did" take two reads and an inference.** §4.2
calls this a hard-won detail and says an interface showing one number will be wrong half the time.
It is right, and the API does not make it one fact: `Environment.instance` is what the hostname
reaches, and the failed attempt is reachable only through `listIncidents` or by having been watching
the event stream. There is no field that says *the last deploy attempt failed at T*. The prototype
shows the two facts side by side on three screens; a real client would have to join two calls and
guess at ordering. *Worth considering: `Environment.lastAttempt`.*

**F7 — a project has no human-readable name.** `Project.slug` is all there is, so the entire faculty
product calls a person's app `mock-app`. The prototype does this honestly and it is jarring on every
screen. A slug is a hostname label and must be stable and lowercase; what a person calls their app
is *"Reading responses"*, and changes its mind. These are two different fields.

**F8 — nothing in this API is editable.** Zero `PATCH`, zero `PUT`. The sharpest instance is
audience: `Audience` records `setBy` and `setAt`, which is the shape of something revisable, and
there is no operation that revises it — while audience is what sizes the app. The create form
therefore has to warn at the moment of choosing: *"You can't change that answer yet — tell us if you
need to and we'll do it by hand."* That sentence is a design cost paid for a missing verb.

**F9 — nothing supports telling a person something when they are not looking.** The interface
correctly tells people to close the page — builds take minutes and a PIA takes weeks — and the only
delivery mechanism in the API is a WebSocket that exists while the page is open. There is no
subscription, digest or notification operation. The build screen's *"We'll email you if it goes
wrong"* currently has nothing behind it, and is the single most load-bearing unbacked sentence in
the prototype. For a user who visits six times a year, this is arguably a larger gap than the
authoring API.

**F10 — `Token.capabilities` is an open `array<string>` on read and a closed enum of eleven on
mint.** The fixture file already records this as a finding (P5c sitting 8). The design consequence:
a screen rendering an existing token's permissions in plain English is switching on strings the
contract does not constrain, so an unknown capability has no defined rendering.

**F11 — two of the three project-name refusals have no fixture.** Known and documented, restated for
its design cost: `SLUG_TAKEN` can be designed against the mock and `SLUG_INVALID` and
`SLUG_RESERVED` cannot — and the reserved case is the one with the hardest copy, because it has to
refuse a name for a reason the person cannot see. The prototype implements only the fixture-backed
pair.

**Smaller notes.** `Fleet` is admin-only and unused here. `KnowledgePack` is the one piece of
existing API that genuinely helps the speculative authoring work, and is cited on the *Plan*
artboard. `ScanSummary` gives counts but not the policy threshold, so *"nothing needs fixing"* is a
client-side assertion about what `fixable: {critical: 0, high: 0}` means.

---

## 8. The speculative authoring flow

Three artboards, in their own row, under an orange title, each wearing a hatched **SPECULATIVE**
band that names the gap in one sentence and lists the operations it would need.

The design argument is that **the plan is the product**. A faculty member should never be handed
code or configuration to approve; they should be handed a description of the finished thing in the
terms they used to ask for it — *what students see, what you see, what it keeps, who gets in,
whether it uses AI* — plus the two things the agent had to assume and the two questions only they
can answer. *"Read it as a description of the finished thing, not as instructions."*

**It hands back to the real journey deliberately.** *Yes, build that* goes to the provisioning
screen — the same screen the hand-made route reaches — because agreeing to a plan is precisely the
moment `POST /v1/projects` already exists for. The seam is where the invented part ends.

The third artboard is marked **speculative in half**, and it is the one I would keep if only one
survived. A faculty member asks for a change; the agent makes it, builds it, deploys it to staging,
then tries to put it live and is stopped. **Only the asking is invented.** The build, the deploy,
the refusal, the question it raises, your answer and the single retry a yes buys are all built and
clicked today. The finding that falls out of it is worth stating plainly:

> **The hard half exists. What is missing is the easy-sounding half nobody has specified.**

---

## 9. C3 in practice

Every screen was checked against *"a faculty member must never be shown infrastructure"*. What that
cost, concretely:

- **No image digest anywhere.** `sha256:9b2c1d0e…` is what a release is, and a person sees *"the
  version from 18 September, 9:00am"*.
- **No ports, no health paths, no container or instance counts.** The blueprint's `provides` becomes
  three plain chips: *"Students sign in with CWL"*, *"Keeps what they write"*, *"Can ask an AI
  model, on a budget"*. `mongodb` is *"a place to keep things"*.
- **No exit codes and no probe language by default.** The incident's `exitReason` —
  *"the readiness probe never answered 200"* — becomes *"It started, then went quiet"*, and
  `diffSinceHealthy` becomes *"The place we look to ask 'are you ready?' was moved, from a page that
  exists to one that doesn't."*
- **Hostnames stay.** A hostname is not infrastructure to this person; it is *where their app lives*,
  and it is the emotional payload of the whole journey. It is set in mono, deliberately, as the one
  machine string the product is proud of.
- **The raw words are never destroyed, only placed.** Every translation has an adjacent disclosure
  holding the platform's own text, framed for the moment a person asks someone else for help.

**And one genuinely good affordance the API already provides:** `Incident.prompt` is *"shaped to be
handed straight to an agent as a repair request"*. The incident screen makes that a first-class
action — *Give this to your agent*, with the real prompt text, a copy button and a send button. It
turns the worst moment in the product into the shortest path out of it.

---

## 10. Accessibility

Designed to from the start, per §9's legal requirement, rather than retrofitted:

- **Real semantics throughout.** Every clickable thing is a `<button>` or an `<a href>`; every input
  has a `<label>` with a matching `for`; nothing is a `div` with a click handler, so nothing is
  skipped by Tab. Radio and checkbox groups are real inputs styled through their labels.
- **Contrast.** The palette was chosen against the `#F6F2EA` ground for 4.5:1 or better on body
  text, including the muted greys: `#6B6355` and `#7C7365` both clear it, and the caption grey that
  usually fails was darkened rather than kept. Every state colour clears it on its own tint, and
  white-on-cedar and white-on-lake both clear it for filled controls.
- **Never colour alone.** Every state chip pairs its dot with a word, and the checklist pairs its
  colour with a distinct mark — filled tick, open ring, dashed ring.
- **Visible focus.** A 2px Lake outline with 3px offset, declared globally.
- **Motion is decorative only.** Nothing communicates exclusively through animation; every animated
  state also has text and a static mark. The animations are opacity and width, which degrade to
  nothing under reduced motion without losing information. *(A `prefers-reduced-motion` block is the
  obvious next addition and is not in this pass.)*
- **Icon-only controls carry `aria-label`**, and decorative SVG is `aria-hidden`.

---

## 11. What this does not cover

Stated plainly so nobody assumes it was considered and rejected:

- **The admin console** (brief §5) — explicitly not this job, and §12 recommends it be a separate
  effort inheriting this vocabulary.
- **The running app itself.** Journey step 6 is opening the deployed app and signing into it. That
  is the faculty member's app, not Manifest, so the prototype stops at the address and the *Open it*
  button.
- **Mobile and responsive.** Everything is drawn at 1280 desktop. The layouts are flex and grid with
  no fixed inner widths that would fight a narrower column, but the two-column screens need a real
  stacking pass and the build log needs a different home on a phone. Worth doing before build, not
  before a decision.
- **Degraded states.** An empty account with no projects; the WebSocket dropping mid-build; an app
  in `hibernated` or `waking`; a project with several collaborators and several agents. All are
  designable from the same vocabulary and none is drawn.
- **Any of the 68 refusal codes except the four the journey passes through** —
  `SLUG_TAKEN`, `RELEASE_PRODUCTION_GATE_UNAVAILABLE`, `TOKEN_ACTION_PENDING`, `TOKEN_ACTION_REJECTED`.
  A pass that gives all 68 a faculty-legible sentence is a real piece of work and is the natural
  next one.
