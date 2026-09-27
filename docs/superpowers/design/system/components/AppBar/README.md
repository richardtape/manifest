# AppBar

> **Superseded by SideNav.** The faculty product no longer has a top bar — the rail carries the mark,
> the navigation and identity, and screens begin with their own heading. This is kept for a surface
> that genuinely has no rail (a signed-out page, an embedded view), and `ProjectBar` below is still
> in use. Do not reach for it on a signed-in screen.

Two bands. A 60px product bar that is the same on every screen, and — inside a project — a second
band carrying the project's name and its own navigation.

## The mark

A 26px `radius-sm`+1 square in `brand` with a white building glyph, the wordmark at 17px/600, a 1px
rule, then **UBC** as an overline. The rule matters: it says *Manifest, at UBC* rather than
*Manifest UBC*, which is a different and untrue claim.

The mark is the only brand-blue element in the bar. The bar itself is `surface-card` with a
`border-default` bottom edge — chrome should not compete with the one blue thing on the screen.

## The project band

`page-title` for the project's name, then a meta line in `ink-muted` — *who owns it · when it was
made · who it is for* — then tabs. The active tab is a 2px `brand` underline and 600 weight; the
rest are `ink-muted` with a transparent underline so nothing shifts on selection.

## Rules

- **Never more than six tabs.** At seven, something belongs inside another screen.
- **Tab labels are plain nouns in the person's language**: *Going live*, not *Deployment*;
  *People*, not *Members*; *Conversations*, not *Sessions*.
- The right side holds identity and sign-out only. No notification bell, no search — for someone who
  visits six times a year, both are noise.
- The page gutter is `space-12` and every screen shares it, so headings line up as a person moves
  between screens.

## A caution

The project's name here is its slug, because the platform has no human-readable title for a project.
That is a known gap, not a style: if a title field ever exists, it belongs in `page-title` and the
slug moves to the meta line in `mono`.
