# Button

Four kinds. `brand` — UBC Blue — is reserved for the primary, which is what attaches the
institution's colour to the moments a person commits to something.

| Kind | When | Tokens |
|---|---|---|
| **Primary** | The one thing this screen is for. One per view. | `brand` on `brand-on` |
| **Secondary** | A real alternative — *Watch again*, *Not now*. | transparent, `border-strong` |
| **Tertiary** | A sibling action of equal, low weight. | `surface-sunken`, `border-subtle` |
| **Destructive** | Confirming something irreversible. | `attention` on white |

A destructive action is **never** the button that opens the confirmation — the opener is a quiet
ghost variant in `attention` with a soft border. Red is spent on the confirm, not the invitation.

## Rules

- **Height 44px** for anything in a page flow, 38px for a control inside a dense row, 32px for a
  segmented-control tab. `radius-md` throughout.
- **A disabled button says what it is waiting for** — *Building…*, not a greyed *Continue*. It uses
  `border-default` on `ink-disabled`, the one place `ink-disabled` is allowed, since WCAG exempts
  disabled controls.
- **Labels are verbs in the person's language**, not the platform's: *Make it*, *Put it somewhere I
  can try it*, *Ask to go live*. Never *Submit*, *Confirm*, *OK*.
- **One trailing icon at most**, 16px, and only where it carries direction.
- Focus is a 2px `brand` outline at 3px offset, declared globally rather than per component.

## A note on consequence

Buttons that do something irreversible are preceded by a sentence naming the consequence in
concrete terms — *"The agent stops mid-sentence, and can't tell you why."* The button does not
carry that weight alone; it never should.
