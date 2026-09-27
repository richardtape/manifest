# ClockItem

A thing that takes weeks, answered by somebody else, shown long before anybody needs it.

## The problem it solves

Going to production needs a registration with UBC's identity team and a Privacy Impact Assessment.
Both are answered by other people and both take **weeks**. The platform's own rule is that a
faculty member should never discover the existence of a PIA on the day they wanted to launch — so
this has to be visible from week one, in a product where week one must not feel like bureaucracy.

**The answer is to stop treating checklist items as one list.** Two of them are *clocks* — things
you start and then wait on. Five are *checks* — short jobs for the end. A ClockItem looks
deliberately unlike a checklist row, because it is not one: there is nothing to tick, only a clock
you have not started.

## Anatomy

- **A hatched, empty time bar** labelled *Nothing counting yet* / *Takes weeks*. Never animated: a
  person holds this, not a machine.
- **A 1px `waiting-border` edge all the way round**, like every other card. An accent stripe down one
  side was tried and removed: see *Card* for why the system has exactly one border treatment.
- **A "Not started" chip**, not "Incomplete". Nothing has gone wrong.
- **The honest admission**, in a dashed `surface-sunken` block, when the platform cannot track the
  item itself — followed immediately by the most useful thing left. An admission that ends with an
  offer is not bureaucracy; an admission that just ends is.
- **One primary action** that starts the clock.

## Rules

- **Never put a due date on one.** Nothing is due; that is the point. The urgency is lead time, not
  a deadline, and the copy says so: *"Nothing here is due today. Only the two slow ones are worth
  touching now."*
- **Say who answers it** — *UBC's Privacy Office*, *their team*. A wait with no owner feels like
  weather.
- **Two at most on a screen.** A page of clocks is a page of dread.

## Data note

The platform's launch-readiness item carries a state, an owner and a reason, and **no time at all** —
no started-at, no expected duration, and no state between "unmet" and "met". This component
currently hard-codes *Takes weeks* from written guidance. A real implementation needs at least a
started-at and a coarse duration band, or the bar cannot tell "never started" from "submitted three
weeks ago".
