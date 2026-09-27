# TwoFacts

*What is serving* and *what the last attempt did* are two different facts. An interface that shows
one number is wrong about half the time.

This was found the expensive way in the platform's own development, and it is the detail most
likely to be dropped by somebody rebuilding a screen from memory. **If you show a deployment state
anywhere, show both halves.**

## Why it matters more than it looks

A failed deploy does not take anything away: the previous version keeps answering until a new one
proves it can. A person who sees only *failed* concludes their app is down — in week eight, in
front of two hundred students. The left cell is the answer to that fear, and it is why the left
cell is always `steady-tint` even when the right one is red.

## Rules

- **Left is always what people get.** Same position every time, so it can be found without reading.
- **The right cell takes the tint its outcome earns** — `attention-tint` for a failure,
  `steady-tint` for a success, `surface-sunken` while one is in flight.
- **The right cell ends in a link**, not a dead end. A failure the person cannot act on is worse
  than no message.
- **The footnote stays.** *"Two facts, not one. The older version keeps answering until a new one
  proves it can."* It reads as redundant to whoever built the screen and is the whole point to
  whoever is reading it for the first time.
- Repeat this block on every surface that shows a running app: the project screen, the preview, and
  anywhere an agent is at work.

## Data note

The platform's API does not answer this in one read: the serving instance comes from the
environment, and the last attempt has to be joined from incidents or the event stream. Build the
join once, behind this component, rather than at each call site.
