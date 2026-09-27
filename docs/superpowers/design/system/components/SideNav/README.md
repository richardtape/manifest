# SideNav

The product's whole navigation: a 240px rail in **UBC blue at full strength**, on every signed-in
screen. It replaced the top bar, which could only ever hold the mark and a sign-out link.

## Why a rail, and why this colour

Before it there was no way to move between a project's screens except links inside the content —
fine while walking the journey forwards, useless for coming back a week later to check one thing.
For someone who meets this platform about six times a year, **persistent navigation is not a
convenience, it is the difference between finding something and giving up.**

Making it `nav-surface` — an alias of `brand` — is the one place the institution's colour is used at
full strength across a whole surface. It gives the product an unmistakable frame without a single
decorative element, and it answers the trust question a faculty member has when they hand an app to
two hundred students: this is a UBC service, not a side project.

## Structure

1. **The mark** — white square, wordmark, hairline, `UBC`. Links home.
2. **Your apps**, then **Start something new**.
3. **A rule**, then the open project's name as an overline and its sections.
4. **A spacer**, then the person and sign out, pinned to the bottom.

The project section appears only when a project is open; on the home and create screens the rail
stops after the first zone rather than showing a disabled stub.

## Rules

- **Six project items at most.** At seven, something belongs inside another screen. The current six
  are Overview, Preview, Conversations, Going live, People, Agents.
- **Labels are plain nouns in the person's language**: *Going live*, not *Deployment*; *People*, not
  *Members*.
- **Transient screens are not in the rail.** Provisioning, building, deploying and an incident are
  moments in a flow, reached from the thing that caused them; they highlight the section they belong
  to rather than adding an item nobody would ever click deliberately.
- **The active item carries three signals** — a `nav-active` fill, 600 weight, and `aria-current` —
  so it survives without colour.
- **No notification bell, no search.** For six visits a year both are noise.

## A consequence worth stating

Because the rail carries the mark and identity, **screens have no top bar at all**. A screen begins
with its own heading. `ProjectBar` still exists for a project's title and meta; its tab strip was
removed when the rail took over that job. `AppBar` is superseded — see its own notes.

## Accessibility

A real `<nav>` with an `aria-label`, real `<a href>`s, `aria-current="page"` on the active item.
Every text colour clears 4.5:1 on the blue it sits on: `nav-ink` 12.4:1, `nav-ink-muted` 7.6:1,
`nav-ink-subtle` 6.1:1, and white on `nav-active` 8.3:1.
