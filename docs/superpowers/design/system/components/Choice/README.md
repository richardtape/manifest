# Choice

One component, three jobs: a **radio card** (pick one of four), a **capability checkbox** (tick any
of several), and the **locked row** for a thing that can never be ticked at all.

## The card, not the control

Every option is a `<label>` wrapping a real `<input>`, so the whole card is the hit target and Tab
reaches it without help. The card carries a title and, where a person needs it, one line saying what
the option means — *Anyone at all / Open beyond UBC*. A bare radio next to a bare word makes a
person guess, and this person is guessing about how many students will hit their app at once.

## Selection without layout shift

Unselected: 1px `border-subtle` plus `margin: 1px`. Selected: 2px `brand` and `margin: 0`. The
margin absorbs the extra border width, so nothing moves when a person changes their mind. This is
the one place in the system where a margin is doing a visual job, and it is worth the oddity.

## The locked row

Four capabilities can never be granted to an agent, however the key is made. They are **not shown as
unticked checkboxes** — an unticked box says *not yet*, and the truth is *never*. They are a dashed
`border-strong` row with a padlock, on the page ground rather than a card, reading
*never available*.

Above them sits the explanation, because this is unusual and a person meets it once a year:
*"Not 'off by default' — impossible. If an agent tries one, it is stopped and a question appears for
you."*

## The confirmation checkbox

On `surface-inverse`, beside a one-time key: *I have put it somewhere safe*. It gates the button
that dismisses the key. Deliberate friction — the only place in the product where a checkbox is a
precondition rather than a preference, because the thing behind it is genuinely unrecoverable.

## Rules

- **Two to four radio cards.** More is a select, and a select for something this consequential is
  the wrong control.
- **Titles are the person's words**, notes are the consequence. Never the platform's enum.
- **Say what cannot be changed later, next to the control** — *"You can't change that yet."*
- `accent-color: var(--brand)` on the input; never a hand-drawn tick that loses the platform's own
  focus and checked affordances.
