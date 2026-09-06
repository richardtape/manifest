# fixture-node

A minimal blueprint used to exercise Manifest's build and deploy path. It is not a
blueprint faculty use — see `node-ts-mongo` for that.

## What you may declare

- `services: [{ type: mongo, ... }]` — injected as `MONGODB_URI` and `MONGODB_DB_NAME`
- `auth.provider: none` only. This blueprint has no authentication component.
- No `ai:` block. This blueprint has no model access.

## What you may never do

- Supply a Dockerfile or any `runtime.build` block. The build definition belongs to
  the blueprint (D13).
- Write an origin into `auth.callback`. Those fields are paths; Manifest derives every
  origin itself (D15).
