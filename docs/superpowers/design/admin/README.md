# The administrator's console — a clickable mockup

*Added 2026-09-27, at Rich's request for "a mockup design" rather than a plan. It draws
[the console's design](../../2026-09-27-admin-console-design.md) so it can be seen and clicked. It
is **not** `packages/admin-ui`, and nothing here calls an API.*

**Open it:** serve this directory's parent and open `admin-console.html`:

```bash
cd docs/superpowers/design && python3 -m http.server 8931 --bind 127.0.0.1
```

then <http://127.0.0.1:8931/admin-console.html>. It needs the network for React and the two
typefaces, as the gallery does. **Published:** <https://claude.ai/artifact/N8qj84CVbvJ7f2L6xKfQ25>
— republished from `admin-console.html` with these files and `system/`'s three beside it.

## What it is made of

```
../admin-console.html     the page — loads the shared system, then the four files below
components.css            the operations surface's styles, from tokens only; 5 new tokens at the top
components.js             the PROPOSED components, window.ManifestAdmin, in bundle.js's own idiom
data.js                   the mockup's data (window.ADMIN_DATA)
console.js                the four screens, the decision panes, the fleet drawer, the settings editors
```

**It mounts the real design system** — `tokens.css`, `bundle.css`, `bundle.js` — and composes
`StateChip`, `Button`, `SegmentedControl`, `Choice`, `TwoFacts` and `InverseSurface` from it. The
new components (`ConsoleRail`, `SettingRow`, `WaitHeadline`, `QueueRow`, `FilterBar`, `DataTable`,
`EnvCell`, `DiffView`, `ObservedAction`, `EventLine`, `MachineValue`, `FactList`, `Tags`, `RawChip`) are in
`components.js`, **not yet in `bundle.js`**: they are written in its idiom — `createElement`, no
JSX, stateless, tokens only — so each moves across unchanged once its design is agreed, with the
README and preview every system component has. Until then they are a proposal, and the gallery does
not show them.

**The data is invented, the shapes and words are not.** Every field has the contract's (v1.3.0)
shape. The digest, the scan, the approval's review and coverage sentences, the security notes, the
agent's question, the IAM and PIA records are `manifest-mock`'s fixtures or the control plane's own
text, verbatim; every event sentence is a real publisher's. The ten projects, their people and their
tickets are examples. **Times are relative to page load**, so every age is real arithmetic and ticks.

## What has an API behind it — read before building from this

The mockup carries no marking on screen by default — the faculty prototype's choice, kept. **Show API
gaps** (bottom right) tags every element the API cannot answer yet with its finding (A1–A13, the
design document's §10). In short:

| On screen | Backed today? |
|---|---|
| **The queue itself** | **No** (A2) — it would be assembled by fan-out, 3N+1 reads |
| Release approvals — the preview, the diff, approve, reject, step-up | **Yes**, per release. When it was asked for: **no** (A3) |
| IAM registration and privacy assessment records | **Yes**, per project. When they entered their state: **no** (A3) |
| An agent's question | **Yes**, per project. Who minted the token: **no** (A8) |
| Domain to attach, audience upgrade, launch override | **No** — not modelled at all (A4) |
| A reason stored for every administrator's action, shown to the owner | **Only** a rejection's (A1) |
| Fleet | **Yes**, `listFleet` — without department, domains, spend or `launchedAt` (A7) |
| Health: certificates, scans, blueprints | By fan-out. Incidents: the latest only, never whether open (A9) |
| Settings | **No** (A13). Blueprints alone are read, from `listBlueprints`; every other value was read from where the platform keeps it — a column default, a config file, the environment |
| People, Spend, Audit | **No** — deliberately not drawn (§8 of the design) |

## Rich's changes after the first mockup (2026-09-27)

The rail instead of a top bar; no time on the Queue item; `radius-sm` on filters; subtle stripes on
long tables; and a Settings screen. The design document's §2, §7a and §11 (decisions 1, 2 and 16–20)
carry each one and its reasoning.

## Decisions the mockup adds to the design

- **Light only, on purpose.** The Manifest system has one theme; the page paints every colour
  rather than borrowing a viewer's.
- **A reset on every decided item** (*Start this item again*) — a mockup affordance, not a product one.
- **The API-gap switch is the mockup's**, not the product's: it exists so the gaps can be seen in
  place, and a real console would not ship it.
