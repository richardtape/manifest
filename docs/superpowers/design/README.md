# The faculty product's design, as files

*Added 2026-09-26, so that a build-phase agent can be handed this directory and know what to build
without a person in the loop. **Everything here was pulled from the two living Artifacts on the day
it was written**; §5 records what had drifted by then.*

Until today this design existed only as two Artifacts on claude.ai and in a session scratchpad —
and the scratchpad had already been lost once. That is the gap this directory closes.

| | |
|---|---|
| **The design system** — the normative thing | [`system/`](./system), and live at <https://claude.ai/code/artifact/004ccdad-637d-4a42-b116-6976a386207d> |
| **The prototype** — seventeen screens | [`prototype/`](./prototype), and live at <https://claude.ai/code/artifact/1df61167-fdf0-41bc-acbe-e60c12f51060> |
| **Why any of it is the way it is** | [`../2026-09-19-faculty-interface-design-rationale.md`](../2026-09-19-faculty-interface-design-rationale.md) |
| **What the API can actually do** | [`../design-handover.md`](../design-handover.md) — 34 operations, 52 schemas, the fixtures |

---

## 1. Read these three first, in this order

1. **[`system/README.md`](./system/README.md)** — the brand book. C3, who the reader is, the
   principles, the visual foundations, accessibility.
2. **[`system/10-language.md`](./system/10-language.md)** — *The words.* In this product the
   sentences are the design, and this file carries the table that keeps platform state names off a
   screen. Read it before writing any copy.
3. **[`system/20-states.md`](./system/20-states.md)** — the five states, and the one rule that
   generates the whole waiting vocabulary.

Then read a component's own `README.md` before using it. They are short, and each carries the
reasoning that is expensive to rediscover — why `LiveSteps` exists at all, why a clock is never
animated, why `TwoFacts` is two cells and not one number.

## 2. The system is real code, not pictures

```
system/tokens.json              58 colours, 14 type styles, spacing, radius, shadow — the source
system/tokens.css               GENERATED from tokens.json; custom properties + a class per type style
system/components/bundle.js     19 React components, one classic script, assigns window.Manifest
system/components/bundle.css    their styles, every value from a token
system/components/index.d.ts    every prop, with the rules that matter written into the comments
system/components/<Comp>/README.md   the guidelines for that component
```

**Load order in a consuming page:** `tokens.css`, `bundle.css`, React 18 + ReactDOM 18, `bundle.js`.
Then `window.Manifest.StateChip` and the rest are available.

**Mount them rather than retyping the markup.** Retyped markup is how a system and its product drift
apart, and that drift is the reason this directory exists.

`tokens.css` is generated. If `tokens.json` changes, regenerate rather than hand-editing — the
generator is fifteen lines and is described in the commit that added this directory.

## 3. The prototype: what is real and what is not

`prototype/` holds seventeen screens as `.dc.html` — the Design-canvas format, which needs that
runtime to *run*, but which reads perfectly well as HTML for layout, composition and copy.
`canvas.json` gives each screen its title, size and position.

**Ten screens are the real journey.** Every value on them comes from the published contract's
fixtures — the slug, all three hostnames, the twenty build-log lines, the 135 packages, the scan
counts, the token secret, the 42-second wait, the incident's repair prompt.

```
Signin → Main → New → Provision → Build → Deploy → Preview → Project → Launch → Incident
```

**Three are moments that need particular care**, and each explains its own rule on screen:
`Token` (a secret shown exactly once), `Members` (re-authenticating mid-task), `Queue` (an agent is
refused; a human answers in their own words).

**FOUR ARE SPECULATIVE AND MUST NOT BE BUILT FROM AS IF THEY WERE A SPEC:**

| Screen | Status |
|---|---|
| `Describe.dc.html` | **Speculative.** No API creates or changes an app — zero `PATCH`/`PUT`, no repository reference. |
| `Draft.dc.html` | **Speculative**, same gap. Its one real seam is *Yes, build that* → `POST /v1/projects`. |
| `Conversations.dc.html` | **Speculative.** A conversation is the one object with no counterpart anywhere in the API. |
| `Iterate.dc.html` | **Speculative in half.** Asking for a change is invented; the build, the deploy, the refusal, the question and the single retry a *yes* buys are all built and clicked today. |

**Three of those four have lost their on-screen marking** — see §5. **This table is now the
authoritative statement of which screens are speculative.**

## 4. The thirteen API findings

The rationale's §8 lists them in full. The four that most change what a build agent should plan for:

- **F1** — build log lines have no faculty-legible counterpart, while all 21 events do. The one
  screen the journey names for its liveness is the one whose live content C3 forbids showing.
- **F3** — the launch checklist cannot express time. No started-at, no duration, and `unmet` cannot
  distinguish "never started" from "submitted three weeks ago".
- **F4** — there is no re-authentication signal in any of the 68 refusal codes.
- **F13** — no conversation object, so nothing records which piece of work a build or release
  belonged to.

## 5. What had drifted by 2026-09-26 — read before trusting a screen

These are defects in the **published prototype** found while pulling these files down. The copies in
`prototype/` are faithful to what was published, defects included, rather than quietly corrected —
so this record and the files agree. **None of them is fixed.**

**a. `Build.dc.html`'s logic block does not parse, so the build screen is dead.** One line has
single quotes nested inside a single-quoted JavaScript string:

```
style: 'font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 12.5px; …'
```

The fix is to use double quotes for the inner family name. Introduced by a global find-and-replace
that landed inside a JS string literal. Sixteen of the seventeen screens parse; this one does not,
and it is the most important live screen in the product.

**b. `Incident.dc.html`'s repair-prompt inset is invisible.** The card is `#0A4E60` and the mono
inset inside it is also `#0A4E60`, with no border — two different tokens that collapsed onto one
value during the palette change. The inset should be a step darker.

**c. `Describe`, `Draft` and `Conversations` have lost their speculative band and their "what this
screen would need" block.** They were published with both; the live versions have neither, while
`Iterate` still has both. Something removed them in the canvas editor. This is exactly the failure
`SpeculativeBanner`'s own guidelines warn about — *"an unmarked speculative screen is
indistinguishable from a specification, and somebody will build it"* — which is why §3's table
exists here in the repository, where an editor cannot quietly drop it.

**Also not present:** the eighteen `components/<Comp>/preview.html` files. They are demonstrations
of the bundle rather than sources — props come from `index.d.ts`, behaviour from `bundle.js`, rules
from each README — and they render live in the system Artifact. Ask if you want them here too.

## 6. What this design does not cover

The administrator's console (a second product, which should inherit this vocabulary rather than
invent a second dialect); the app a faculty member actually builds; anything below 1440px except the
preview's 390pt phone mode; degraded states; and a faculty-legible sentence for the other 64 refusal
codes.
