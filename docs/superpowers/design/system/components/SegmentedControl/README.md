# SegmentedControl

A small group of mutually exclusive views: which address you are previewing, which viewport, which
slice of a list.

**It switches what you are looking at, never what you are doing.** Nothing behind a segment may
change state, spend money, deploy, or be hard to undo. A person pressing one of these is browsing,
and the control has to be safe enough to press without reading.

## Anatomy

A `surface-sunken` rail with `border-subtle`, 3px of padding, and 32px tabs at `radius-sm`. The
selected tab is `surface-card` with `shadow-raise` — **the only shadow that appears inside a card in
this whole system**, and it earns it by being the thing that says *this one*.

## Rules

- **Two to four segments.** Five is a menu; two is often better as a pair of buttons.
- **Labels are nouns from the person's world**: *Your draft*, *Trying out*, *Students* — not
  *sandbox*, *staging*, *production*. The environment names are the clearest case in the product of
  a platform word that must never reach a screen.
- **A filter segment carries its count**: *Needs you 1*, *Over 2*. The counts are then readable
  without changing the filter, which is usually all a person wanted.
- **Never leave one unselected.** There is no empty state; one segment is always on.
- Hover lifts the label from `ink-muted` to `ink` and nothing else moves. The selected tab does not
  respond to hover — it is already where you are.

## Accessibility

`role="tablist"` with `aria-selected` when the segments switch panels; a `radiogroup` when they set
a value. Real `<button>`s, arrow-key navigable. The selected state is a background, a weight change
*and* a shadow, so it survives without colour.
