# Interaction states

Hover, focus, active and disabled, written down once. **Yes, these are worth capturing** — they are
the part of a design system that gets invented per screen if nobody writes it down, and the
inconsistency is visible in a way the static design never is.

They are also where accessibility is won or lost: focus is a legal requirement here, and it is the
state most often styled away.

## The four

| State | What changes | Never |
|---|---|---|
| **Hover** | one fill or one border, `0.12s ease` | size, shadow, position |
| **Focus** | 2px `focus-ring` outline at 3px offset | removed, or replaced by colour alone |
| **Active** | `translateY(1px)`, fill stays at the hover value | a scale transform |
| **Disabled** | `border-default` fill, `ink-disabled` text, `cursor: default` | opacity on the whole control |

## Rules

- **Nothing changes size on hover.** A control that grows pushes its neighbour, and on a dense
  screen that reads as a glitch. One property, one fill or one border.
- **`focus-ring` is an alias of `brand`**, so a brand change cannot leave focus behind — the single
  most common way a system loses its focus indicator over time.
- **Never `outline: none`.** If the default ring is wrong, replace it with this one; do not remove
  it. Focus must be visible for keyboard use even where hover is styled richly.
- **Disabled controls say what they are waiting for** — *Building…* — rather than greying out a live
  label. `ink-disabled` at 2.3:1 is deliberate and permitted only here, since WCAG exempts disabled
  controls; using it anywhere else is a contrast failure.
- **Whole-row links** get `surface-hover` and `border-hover` together, so the row reads as one
  target rather than a card with a link somewhere in it.
- **Transitions are 0.12s ease** and apply to colour only. Motion in this system means a machine is
  working; an interface that animates under the cursor spends that signal on nothing.

## What is deliberately not here

No `:visited` styling — every link in this product goes somewhere that changes, so a visited state
would be misleading. No hover state on the selected segment of a **SegmentedControl**: it is already
where you are. No hover on state chips: they are status, not targets.
