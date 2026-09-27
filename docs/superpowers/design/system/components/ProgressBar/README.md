# ProgressBar

Three bars, and the difference between them is the whole waiting vocabulary.

## Working — the drifting bar

A `working` → `working-bright` diagonal stripe drifting at 1.1s, filled to real progress. It moves
because a machine is moving. Pair it with a duration in words (*a few minutes*, *under 90 seconds*)
and, when the wait is longer than about thirty seconds, with permission to leave.

**There is no indeterminate spinner in this system.** A spinner says *something is happening* and
nothing else, which is exactly the information the person already has. If real progress is unknown,
use **LiveSteps** instead — named steps are honest where a fraction is not.

## Done — the solid bar

Flat `steady`, full width, no motion. It stays on screen because the transition from drifting to
solid is the moment being announced.

## Not yet — the hatched clock

A taller, unfilled track with a `waiting-hatch` diagonal fill and a `waiting-border` edge, labelled
**Nothing counting yet** against **Takes weeks**.

This is the most distinctive bar in the system and the one that solves the launch-checklist problem:
*how do you show someone in week one that something will block them in week twelve, without making
week one feel like bureaucracy?* An empty hatched bar reads instantly as a clock that has not been
started — a thing you could start, not a task you are late for. **Never animate it.** Motion would
imply the platform is doing something about it, and it is not; a person is.

## Rules

- Height 4px for machine progress, 8px for a clock. The clock is bigger because it is the one you
  are meant to act on.
- `transition: width 0.4s linear` while running; 0.7s with an ease on completion.
- Never put a percentage next to any of them. A percentage is a number a person cannot act on.
