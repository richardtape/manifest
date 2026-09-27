# Timeline

A horizontal run of stations an app passes through while you watch. Where **LiveSteps** is a
vertical list of work being done, Timeline is a short, bounded journey with a known end — a deploy,
which has four stations and takes at most ninety seconds.

## When to use which

| | LiveSteps | Timeline |
|---|---|---|
| Shape | vertical list | horizontal run |
| Length | 5–8 steps | 3–5 stations |
| Duration | minutes | under two minutes |
| Question it answers | *what is it doing?* | *how far along is it?* |

Past about five stations the run stops being legible at a glance and should become LiveSteps.

## Anatomy

Each station is a dot with rails to its neighbours, a label, and one short note saying what that
station means in a person's terms. The rails behind a passed station are `steady-border`; ahead of
it, `border-default`. Future stations sit at 0.4 opacity so the run reads as a filling bar even
before the labels are read.

## Rules

- **Labels are what the app is doing, never the platform's state name.** `provisioning` is
  *Making room*; `healthy` is *Answering*. The note underneath is the honest explanation —
  *"It replied to us, so it will reply to people."*
- **Only the current station pulses**, at 1.2s. One moving thing per run.
- **A run can end badly, and the last station carries it**: a filled `attention` dot, the label in
  `attention` and 600, and the note saying what actually happened. The rail *after* it is
  transparent — the journey stopped, it did not continue to a red finish.
- **Never show a percentage or a time remaining.** Give the bound once, in words, beside the run:
  *"Ninety seconds at the outside."*
- **Say the run is real**: *"Each step is the app actually reaching that point."* A timeline that
  animates on a timer rather than on events is the fastest way to lose a person's trust, because
  they will eventually watch it complete while nothing works.

## Accessibility

An `<ol>` in production, with the current station carrying `aria-current="step"`. The dot shapes
differ — filled, pulsing, open ring, filled-red — so the run is readable without colour. Put each
arrival into the same live region the event stream uses.
