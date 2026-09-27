# LiveSteps

A list of what is actually happening, ticking as each part finishes. The most important component
in the system, and the one that makes C3 survivable.

## Why it exists

The platform's build output is real BuildKit text — `#7 [4/8] RUN npm ci --omit=dev`,
`#12 pushing layers to 127.0.0.1:7107/local/mock-app`. Showing that to a faculty member fails C3
outright. Not showing anything loses the liveness that makes the screen work, and that liveness is
the best moment in the product: it is where an idea visibly becomes a real thing.

LiveSteps is the resolution. **A small number of sentences, each covering a range of the underlying
sequence, ticking when that range actually completes.** The raw output goes behind a deliberate
door — see **InverseSurface**.

## Rules

- **A step ticks when that part has finished, not on a timer.** Say so on the screen:
  *"Each line ticks when that part has actually finished, not on a guess."* The credibility of the
  whole screen rests on that being true.
- **Five to eight steps.** Fewer reads as a progress bar with extra words; more reads as a log.
- **The current step is `ls-strong` and pulses**; finished steps are `steady` with a tick; unstarted
  steps sit at 0.35 opacity with an open `border-muted` ring.
- **Use real numbers from the underlying data** where they exist — *"the 135 pieces"* comes from
  the log's own `added 135 packages`. An invented number here is a lie about the machine.
- **A step can halt.** The halted mark is a filled `attention` circle with no tick, the label goes
  `attention` and 600, and a sentence beneath says what is still true.

## Three shapes of mark

Filled + tick (`steady`), filled + pulsing (`working`), open ring (`border-muted`), filled no tick
(`attention`). The shapes differ as well as the colours, so the list is readable without colour.

## Accessibility

Render the list as an `<ol>` in production. Put the current step's sentence into the same live
region the event stream uses, so a screen reader hears *"Installing the 135 pieces it depends on"*
rather than a count changing.
