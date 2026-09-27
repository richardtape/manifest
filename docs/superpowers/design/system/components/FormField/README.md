# FormField

Label, hint, control, and — where it applies — a refusal that shows the platform's own message and
hint rather than a rewritten one.

## The refusal is not yours to write

Every error the platform returns carries three things: a stable machine code, a **message** written
for a person, and a **hint** saying what to do about it. Render the message as the bold line and the
hint as the line beneath it. Switch on the code; never parse the message; never replace it with your
own wording, or the two will drift and only one of them will be maintained.

    a project already has this name
    Pick another name, or ask its owner to add you.

## Rules

- **Label in `subheading` (15px/600), as a question**: *What should we call it?* — not *Name*. It
  reads as a person asking, which is the register of the whole product.
- **The hint sits above the control**, not below, because it changes what a person types.
- **Validate live where the platform can answer live**, and show the success state too — a green
  confirmation naming the address the person is about to get is worth more than silence.
- `radius-md`, `border-strong`, 46px high. A field holding a hostname, a key or an id uses
  `font-mono`; everything else uses the sans.
- **Say what cannot be changed later, at the moment of choosing**, not in a summary at the end:
  *"Once it's live, the name can never change."*

## Accessibility

Every control has a `<label for>`. The refusal block is referenced by `aria-describedby` and lives
in an `aria-live="polite"` region so a live check announces itself. The icon is `aria-hidden`; the
message carries the meaning. Never mark an invalid field with colour alone — the message does it.
