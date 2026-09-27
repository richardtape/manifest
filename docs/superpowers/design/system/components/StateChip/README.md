# StateChip

The whole status vocabulary of the product, in one component: five states and no others.

A chip is **always a coloured dot and a word**. Colour alone never carries a state — it fails
WCAG 1.4.1 and it fails a person squinting at a laptop in a lecture theatre.

## The five

| State | Means | Colour tokens |
|---|---|---|
| **Working** | A machine is moving. You may leave. | `working` · `working-tint` · `working-border` |
| **Waiting on someone** | A person or an office holds it. | `waiting` · `waiting-tint` · `waiting-border` |
| **Needs you** | Stuck until you act. | `attention` · `attention-tint` · `attention-border` |
| **Steady** | It works. | `steady` · `steady-tint` · `steady-border` |
| **Not yet** | Real, but no clock has started. | `surface-sunken` · dashed `border-strong` · `ink-subtle` |

## Rules

- **Working states state a duration** in the chip itself — *Working, a few minutes*, *Working, under
  90 seconds*. A chip that says only "Working" is withholding the one fact a person wants.
- **Waiting states carry elapsed time**, next to the chip rather than inside it, in `caption` /
  `ink-subtle`. Elapsed, never a countdown: it is the number a person can reduce.
- **Only Working and Needs you pulse**, at 1.4s and 1.6s. Nothing measured in days or weeks
  animates, ever — motion would imply the platform is doing something about it, and it is not.
- **Not yet uses a dashed border.** The shape difference matters as much as the colour: it is the
  one state that is not a status but an absence.
- Never invent a sixth. A new platform enum collapses into one of these five — see *Waiting, and
  the five states*.

## Accessibility

Every pairing clears 4.5:1 on its own tint (5.1–5.8:1). The dot is decorative; the word is the
state. If the chip is the only thing announcing a change, put the same sentence in the live region
that carries the event stream.
