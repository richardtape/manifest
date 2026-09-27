# InverseSurface

`surface-inverse` — a near-black navy — with three and only three uses:

1. **The build log**, behind a disclosure that is shut by default.
2. **A delegated key**, at the one moment it is visible.
3. **An incident's repair prompt**, shaped to be handed to an agent.

## Why it is a boundary and not a style

All three are *machine text a person is being shown on purpose*. The inversion marks the edge of the
product's voice: past this line you are reading what the machine said, not what Manifest is telling
you. That is what makes it compatible with C3 — the infrastructure is not hidden, it is **placed**,
behind a deliberate act, in a surface that announces itself as foreign.

**Never use it for emphasis.** A dark card because something matters is the fastest way to destroy
the signal, because the next dark thing a person sees will be read as machine output.

## Rules

- **Always reachable, never the default.** The log pane collapses to a line count and a *Show it*
  button. Collapsed it says why it exists at all: *"You never need this. It's here because the
  person you ask for help one day will."*
- **Line numbers in `ink-inverse-muted`**, `user-select: none`. Lines written before the view opened
  are muted too; live lines are `ink-inverse`. That distinction is real — the platform serves stored
  lines and streams new ones separately, and a merged view that pretends otherwise will
  double-render.
- **`mono-log` leading (22px)**, because a log is scanned, not read.
- **A key gets `surface-inverse-deep` inset** with `border-inverse`, `user-select: all`, and a copy
  button. Never a truncated key: a person cannot check what they cannot see.
- Text on this surface is `ink-inverse` at 14.9:1 and `ink-inverse-muted` at 6.0:1. Do not go
  lighter than the muted token.

## The one warning colour

`warning-mark` appears exactly once in the product — the triangle above a one-time key. It is not a
general-purpose warning colour and there is no second use.
