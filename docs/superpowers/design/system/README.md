# Manifest

Manifest is a platform at the University of British Columbia. A faculty member describes an
application in plain language, an AI agent builds it, and Manifest deploys it — authenticated with
UBC's CWL single sign-on, running on UBC infrastructure.

This system was read out of a working prototype of the faculty-facing product rather than designed
in the abstract. Every colour, every type style and every component here appears on a screen that
was built, clicked and checked. Where a value has been regularised — the spacing scale, mostly —
the token says so.

**It is a base, not a finished system.** It covers one surface well. The administrator's console is
a second product with the opposite relationship to detail, and it should inherit this vocabulary
rather than invent a second dialect.

## The one rule

> **A faculty member must never be shown infrastructure.** No containers, no YAML, no exit codes,
> no digests where a word would do.

This is constraint C3 in the platform's design, and it is not a preference. It is why there is a
`surface-inverse` token with a narrow, stated purpose, why `mono` is allowed in exactly three
places, and why a component like **LiveSteps** exists at all: raw build output cannot be shown to
this person, but the liveness it carries is the best moment in the product, so the system has a way
to render progress without rendering the machine.

An interface built on these tokens that leaks infrastructure vocabulary has failed, however
faithfully it uses them.

## Who is reading

A teaching academic who will meet this platform perhaps **six times a year**. They will not carry a
mental model between visits, so every unusual rule re-explains itself at the moment it bites,
on screen, not in documentation.

They also carry a specific anxiety: this thing is going to be used by their students, and if it
breaks in week eight during an assessment, that is their problem in front of two hundred people.
**Most of the copy decisions in this system come out of that sentence.**

## Principles

**Quiet institutional software.** Flat, cool, confident, largely out of the way. The things that
move are the things the platform is actually doing; everything else holds still.

**Motion means a machine is moving. Stillness plus a number means a person has it.** One rule, and
it produces the whole waiting vocabulary — see *Waiting, and the five states*. Nothing measured in
weeks is ever animated. There is no indeterminate spinner anywhere in this system.

**Every refusal says what is still true.** The most repeated sentence shape in the product, because
it is the one that speaks to the week-eight fear. *"Nobody has lost anything."* *"Your trying-out
address is untouched."* *"It is waiting, not failing."*

**Name the owner of every wait.** *us, in minutes* · *you* · *UBC's identity team* · *UBC's Privacy
Office*. A wait with no owner is what makes an institution feel like weather.

**Borders, not shadows.** Three shadows exist and each has one job. Depth is communicated by a
`border-default` edge on `surface-card` over `surface-page`, not by lifting things.

## Visual foundations

**Type.** `Instrument Sans` for everything — headings, interface and body — with `IBM Plex Mono`
reserved for hostnames, keys and build logs. One family rather than a display-plus-body pair is the
single biggest contributor to the product reading as a tool: an interface that changes typeface to
say something important reads as a document. Instrument Sans earns its place over the obvious
defaults by being slightly narrow with a high x-height, so `page-title` can be set at −0.03em and
still read as interface rather than marketing.

**Colour.** `brand` is UBC Blue, `#003468`. It owns the mark, **every primary action**, and the
focus ring. Making the institution's colour the *action* colour rather than only chrome is
deliberate: it attaches UBC to the moments where a person commits to something.

The five state colours sit deliberately apart from the brand so that a status is never mistaken for
an action. `working` is teal rather than blue for exactly this reason.

**Ground and surface.** `surface-page` is a cool `#f4f6fa`; `surface-card` is the only pure white.
Warm state tints — `waiting-tint`, `attention-tint` — read as deliberate against it.

**Geometry.** `radius-md` on controls, `radius-lg` on cards, a 4px spacing grid. Tight rather than
generous: density is most of what "app-like" means in practice.

## Iconography

Inline stroke SVG at 1.8–2.4 weight, 14–20px, `currentColor`, `stroke-linecap="round"`. There are
few of them on purpose: **status is carried by a coloured dot and a word**, because a word survives
being small and an icon does not, and because colour alone is never sufficient.

No emoji, anywhere. Icon-only controls carry an `aria-label`; decorative icons carry
`aria-hidden="true"`.

## Accessibility

UBC is a public body in British Columbia and an automated WCAG gate stands before public launch.
This is a legal requirement, not a preference.

- **Every text token clears 4.5:1** on the grounds its usage note names. `ink-subtle` at 5.0:1 is
  the lightest ink permitted on live text. `ink-disabled` is for disabled controls only.
- **Never colour alone.** A state chip is always a dot *and* a word. Checklist marks differ by
  shape — filled tick, open ring, dashed ring — as well as by colour.
- **Real semantics.** `<button>`, `<a href>`, `<input>` with a matching `<label>`. Never a `div`
  with a click handler; Tab skips it.
- **Visible focus**: 2px `brand` outline at 3px offset, declared globally.
- **Motion is decorative only.** Every animated state also has text and a static mark, so nothing
  is lost when motion is suppressed.

## Using this system

Start with **StateChip**, **LiveSteps** and **Timeline**. Between them they carry the vocabulary the
rest of the product is written in, and a screen that gets those three right is usually right
everywhere else.

Read **Interaction states** before building anything. Hover, focus, active and disabled are the part
of a system that gets invented per screen if nobody writes it down, and focus is the state most
often styled away — which here is a legal problem, not a tidiness one.

**The components are real code, not pictures.** `components/bundle.js` assigns `window.Manifest`
and exports eighteen React components; `bundle.css` styles them from the tokens, and `index.d.ts`
documents every prop. Every preview on this page mounts a real export rather than look-alike markup,
so a preview that renders is a component that works. Mount them rather than retyping the markup —
retyped markup is how a system and its product drift apart.

Read *The words* before writing any copy. In this product the sentences are the design.

**Navigation is a rail, not a top bar.** `SideNav` is 240px of `nav-surface` — UBC blue at full
strength — on every signed-in screen, and it is the only place the institution's colour covers a
whole surface. Screens therefore have no top bar at all and begin with their own heading.

**One border treatment.** Every card has the same 1px border all the way round; a card in a state
takes that state's `*-border` colour on all four sides. Accent stripes down one edge were tried and
removed — see **Card**. The system's single left rule marks a person's verbatim words, and nothing
else.
