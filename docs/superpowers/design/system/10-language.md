# The words

Copy in this product is design work, not decoration. These rules are read out of a prototype whose
first pass was rejected for being too wordy — sixty-four strings were shortened, and what survived
at length is only copy carrying a rule a person genuinely cannot guess.

## Say what a thing does for a person, never what the platform calls it

The platform's own state names never reach a screen.

| Never | Always |
|---|---|
| `provisioning` | Making room for it |
| `starting` | Starting it up |
| `healthy` | Answering |
| `failed` (an instance) | It never answered |
| `hibernated` | Asleep until somebody opens it |
| a build's image digest | the version from 18 September, 9:00am |
| `mongodb` | a place to keep things |
| readiness probe / health path | the place we ask "are you ready?" |
| exit code, container, YAML, port | — never appears |

## Three sentence shapes carry most of the product

**The refusal that says what is still true.** Every failure, every block, every stopped agent.

> Nothing is broken for anyone. The version already there is still the one people reach.

> It is waiting, not failing, and it will wait a day before giving up.

**The permission to leave.** Anything that takes minutes.

> A few minutes. You can leave. We'll email if it goes wrong.

**The rule explained at the moment it bites.** Never in a help page.

> If you say yes, it gets one try at this one request. Not a standing permission — the next time it
> asks, you get asked again.

## Length

Default to one sentence. A second sentence must earn itself by carrying a rule, a consequence, or
the reassurance above. Three sentences in a row is almost always a sign that something is being
explained that should have been designed instead.

Overlines are never more than three words. A meta line is *when · who · what it did*, in that
order, separated by a 3px dot, in `caption` / `ink-subtle`.

## Honesty

When the platform cannot do something, the interface says so in plain words and then offers the most
useful thing left:

> **Manifest can't do this one for you yet.** We'll draft the request. You send it, and tell us when
> it lands.

An admission that ends with an offer is not bureaucracy. An admission that just ends is.

## Numbers

Give a real duration or none. *"a few minutes"*, *"under 90 seconds"*, *"takes weeks"* — never a
percentage a person cannot act on, and never a countdown for something a person does not control.

A wait shows elapsed time, not a deadline: *waiting 42 seconds*, ticking upward. It is the number a
person can actually reduce.
