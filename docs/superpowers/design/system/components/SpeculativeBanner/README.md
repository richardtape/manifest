# SpeculativeBanner

A hatched band marking a screen that has **no API behind it**, with a second block naming what it
would need.

## Why a design system carries this

Manifest's method is that a client discovering an API gap early is valuable. Design work runs ahead
of the platform on purpose — but an unmarked speculative screen is indistinguishable from a
specification, and somebody will build it, or cost it, or promise it.

So the marking is a component with rules, not a note someone remembers to add.

## Rules

- **The band is the first element inside the content column** — full bleed across the content, and
  deliberately *not* across the navigation rail. The rail is real: navigation exists. Hatching over
  it would claim the whole product is speculative, which is both untrue and, with a deep blue rail
  underneath, unreadable. The claim is about the screen, so it sits on the screen.
- **It cannot be scrolled past or dismissed**, because the claim it makes is about everything below
  it.
- **The hatch is `speculative-hatch-a` / `-b` at 135°, 10px pitch.** Cool, not warning-coloured: this
  is not an error, and a yellow band would collide with `waiting`.
- **The sentence names the specific gap**, not a generic disclaimer. *"The platform can deploy an app
  but has no way to create or change one — no operation writes code or settings."*
- **A dashed `surface-sunken` block lists the operations it would need**, in `mono`. Being concrete
  is what turns a caveat into a useful finding.
- **Mark the halves when only half is speculative.** Where part of a flow is real, say which: *"Asking
  for a change is the speculative part. Everything from the refusal down is real."* Half-marked is
  more honest than whole-marked and more useful to whoever costs the work.

## Where it must not be used

Never to mark something merely unfinished, unpolished or unreviewed. It means one thing — *no API
exists for this* — and it stops being worth anything the moment it means two.
