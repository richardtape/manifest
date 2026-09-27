# Card

`surface-card` on `surface-page`, a 1px `border-default` edge, `radius-lg`, `space-5` or `space-6`
of padding. That is the default surface and most of the product is made of it.

**Depth comes from the border, not from a shadow.** Only three shadows exist in this system and
none of them belongs on an ordinary card.

## Tinted variants

A card takes a state tint when the card *is* the state — a working note, a warning about something
that cannot be changed later, a steady confirmation. Tint the background, match the border, and
move the heading to the deep variant of the hue (`working-deep`, `waiting-deep`).

**A tint is not emphasis.** If a card is merely important, it stays white and its heading does the
work. Tint used for attention rather than state is the fastest way to make this system look like
someone else's.

## Rules

- `space-3` between elements inside a card, `space-4` between cards.
- One heading, in `heading` (17px/600/−0.02em). A card with two headings is two cards.
- Body copy in `ink-muted` at 13.5px; a card is secondary to the page around it.
- A card's action is usually a text link in `brand`, not a button. Buttons are for the page's
  primary move.
- Cards do not nest. A block inside a card uses `radius-md` and either `surface-sunken` or a state
  tint, and never its own border plus shadow.

## One border treatment

**Every card has the same 1px border, all the way round.** A thick accent stripe down one side was
tried on the checklist, the agent's question and the change-in-progress card, and removed: with five
state colours already in play it read as a second, competing status system, and it made a row of
cards look ragged where the stripes did not line up. A card that is in a state takes the state's
`*-border` colour on all four sides and its `*-tint` as a ground. That is enough.

**There is exactly one left rule left in the system, and it is not a border.** A 2px
`border-subtle` rule with `padding-left: 14px` marks **a person's verbatim words** — the reason
somebody gave for refusing an agent, quoted back to them. It is a blockquote, it means one thing,
and it stops being worth anything the moment it means two.
