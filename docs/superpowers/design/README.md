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
| **What the API can actually do** | [`../design-handover.md`](../design-handover.md) — every operation, schema, refusal code and event type, and the fixtures. **Generated** from the contract (`node scripts/design-handover.mjs`); this design was drawn against its 2026-09-19 edition — 34 operations, 52 schemas — and its header states today's counts |

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
system/components/<Comp>/README.md    the guidelines for that component
system/components/<Comp>/preview.html a worked example that mounts the real export
system/gallery.html                  GENERATED — all previews on one page, openable in a browser
system/build-gallery.mjs             the generator for it
prototype/support.js                 a local viewer, so the screens render from file://
```

**Load order in a consuming page:** `tokens.css`, `bundle.css`, React 18 + ReactDOM 18, `bundle.js`.
Then `window.Manifest.StateChip` and the rest are available. **Load the runtime before anything that
mounts** — that ordering is easy to get wrong and fails with `React is not defined`.

**To see the components rendered, open [`system/gallery.html`](./system/gallery.html) in a browser.**
One self-contained page, no server and no build: it inlines `tokens.css`, `bundle.css` and
`bundle.js`, pulls React from a CDN, and mounts all seventeen previews. Regenerate it with
`node system/build-gallery.mjs` after changing a token, a style or a component.

**Mount them rather than retyping the markup.** Retyped markup is how a system and its product drift
apart, and that drift is the reason this directory exists.

`tokens.css` is generated. If `tokens.json` changes, regenerate rather than hand-editing — the
generator is fifteen lines and is described in the commit that added this directory.

## 3. The prototype: what is real and what is not

`prototype/` holds seventeen screens as `.dc.html`.

**Open `prototype/Signin.dc.html` in a browser and click through.** No server, no build. The
screens are authored in the Design-canvas component format, whose real runtime is not part of this
repository — so [`prototype/support.js`](./prototype/support.js) is a small local viewer that
implements the part of that format these screens use: `{{holes}}`, `<sc-for>`, `<sc-if>`, the
`class Component extends DCLogic` block, and the event and `ref` bindings. The live steps animate,
the name check validates, the segmented controls switch, and the links between screens work.

`support.js` is **a viewer, not a reimplementation**. If it and the canvas ever disagree, the canvas
is right. Nothing in the product should depend on it. The prototype Artifact (linked at the top)
remains the reference rendering.

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

**FOUR ARE SPECULATIVE AND MUST NOT BE BUILT FROM AS IF THEY WERE A SPEC.** They carry no marking
on screen — Rich removed the hatched bands and the "what this screen would need" blocks on
2026-09-26, deliberately, so the prototype reads as a real product. **That makes this table the only
statement of which screens have no API behind them. Do not build these four against an API that
does not exist.**

| Screen | Status |
|---|---|
| `Describe.dc.html` | **Speculative.** No API creates or changes an app — zero `PATCH`/`PUT`, no repository reference. |
| `Draft.dc.html` | **Speculative**, same gap. Its one real seam is *Yes, build that* → `POST /v1/projects`. |
| `Conversations.dc.html` | **Speculative.** A conversation is the one object with no counterpart anywhere in the API. |
| `Iterate.dc.html` | **Speculative in half.** Asking for a change is invented; the build, the deploy, the refusal, the question and the single retry a *yes* buys are all built and clicked today. |

`SpeculativeBanner` — the component that drew those bands — has been removed from the design
system for the same reason: nothing in the product may use it, and a system that ships a component
the product must never use is a trap. It is recoverable from this repository's history and from the
Artifact's version history if that is ever reversed.

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

Two defects were found while pulling these files down. **Both are now fixed**, in these files and in
the published prototype. A third item turned out to be a deliberate change, not a defect.

**a. FIXED — `Build.dc.html`'s logic block did not parse, so the build screen was dead.** One line
had single quotes nested inside a single-quoted JavaScript string:

```
style: 'font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 12.5px; …'
```

The inner family name now uses double quotes. Introduced by a global find-and-replace that landed
inside a JS string literal, and caught by executing all seventeen logic blocks rather than reading
them. All seventeen parse now.

**b. FIXED — `Incident.dc.html`'s repair-prompt inset was invisible.** The card and the mono inset
inside it were both `#0A4E60` with no border: two tokens that collapsed onto one value during the
palette change. The inset is now `#04252F` with a `#2C7A8E` border, following `InverseSurface`'s own
rule of a darker fill plus a border. Worth knowing: no fill reaches 3:1 against that card without
going nearly black, so the border is doing most of the separating.

**c. NOT A DEFECT — the speculative bands were removed on purpose.** Three of the four had lost
theirs when these files were pulled; Rich confirmed on 2026-09-26 that this was deliberate and asked
for the rest to go, so `Iterate`'s band and its "Real and not real" block were removed too. The
intent is that the prototype reads as a real product. **The cost is that nothing on screen now says
which four screens have no API behind them, so §3's table is the only record of it** — which is why
it lives here, in the repository, where a canvas editor cannot drop it.

**The previews are here.** All eighteen `components/<Comp>/preview.html` files were added on
2026-09-26. Each mounts a real export from `bundle.js` rather than look-alike markup, so a preview
that renders is a component that works — and between them they are the only worked examples of
idiomatic composition with real copy. Four are genuinely interactive through `useState`: the live
name check, both segmented controls, and the choice cards.

## 6. What this design does not cover

The administrator's console (a second product, which should inherit this vocabulary rather than
invent a second dialect); the app a faculty member actually builds; anything below 1440px except the
preview's 390pt phone mode; degraded states; and a faculty-legible sentence for the other 64 refusal
codes.
