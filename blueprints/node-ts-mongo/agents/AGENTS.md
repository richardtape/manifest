# node-ts-mongo@1 — knowledge pack

You are generating an application from this blueprint. This file is the whole of
what you need to know about the platform; it is served over the Manifest API
(D25) alongside the blueprint itself.

**The stack is fixed.** Node 22 on Alpine, Express 4, `express-session`,
Passport with `passport-ubcshib`, and MongoDB. Every version is pinned exactly in
`blueprint.yaml`'s `pinned_dependencies` and in `skeleton/package.json`, and the
two must agree — a test asserts it. Adding a dependency means adding it to
`package.json` **and** committing the regenerated `package-lock.json`: the build
runs `npm ci`, which fails without one.

---

## What you write, and what you must not

You write `manifest.yaml` and application code. That is all.

### Never supply a Dockerfile, and never a `runtime.build` block

D13: the build definition belongs to the blueprint, not the app. The platform
writes `Dockerfile` and `.npmrc` into the build context **after** your tree, so a
committed copy is overwritten rather than honoured — you would be debugging a
file that is not the one being used.

The same applies to the package registry. The build resolves every package
through the platform's mirror, and `.npmrc` is how it is told. Do not commit one.

### Never write an origin into `auth.callback`

D15: you supply a **path** and Manifest supplies the origin. Write

```yaml
auth:
  provider: cwl
  callback: /auth/ubcshib/callback
```

and never `https://…/auth/ubcshib/callback`. The platform joins the two, registers
the result as the Service Provider's ACS URL, and injects that registered value
back to you as `SAML_CALLBACK_URL`. A hand-written origin is a second derivation
of a URL the IdP has already been told about, and the symptom is a login that
redirects, authenticates, and then never comes back.

**The path must match the route you mount.** `skeleton/server.js` mounts
`POST /auth/ubcshib/callback`; if you move the route, move `auth.callback` with
it, in `manifest.yaml`.

### Never request an attribute outside `auth.attributes` and expect to receive it

§9's attribute release is enforced **at the IdP**, from the registration Manifest
writes out of your `auth.attributes` list. An attribute you ask
`passport-ubcshib` for and do not declare is simply not sent — `bridge()` reports
it as absent rather than empty, which is how you tell the two apart.

Declare what you need and nothing more:

```yaml
auth:
  provider: cwl
  attributes: [ubcEduCwlPuid, mail, givenName, sn]
```

`ubcEduCwlPuid` is the only stable identifier UBC guarantees. Key your own
records on it — a CWL login name can change and an email address is not unique
over time.

---

## The auth component: copy it, do not reimplement it

`skeleton/auth/ubcshib.js` and `skeleton/auth/attributes.js` are the blueprint's
security surface. §20 calls a blueprint "a security multiplier": what is here is
replicated into every application generated from it, so a defect here is a defect
in all of them.

- **`ubcshib.js`** wires the strategy from the platform's environment and
  nothing else. There are no literal URLs in it and no fallbacks, deliberately:
  `passport-ubcshib` defaults `SAML_ENVIRONMENT` to `STAGING`, which points at
  `https://authentication.stg.id.ubc.ca` — real UBC infrastructure. Every value
  it reads is required, and a missing one fails the container's first boot rather
  than the first login.
- **`attributes.js`** is the bridge between what the IdP releases (OIDs) and the
  names your code wants. The library's own map covers six friendly names, has no
  entry at all for `uid` or `eduPersonPrincipalName`, and reaches its MACE entry
  never. Use `bridge(profile)` and `puid(profile)`.

Mount the middlewares `configureCwl()` returns. Do not construct a `Strategy`
yourself.

---

## The environment you are given

Manifest injects these; you read them and never default them. The full table is
§8 of the platform design, and a drift test asserts this blueprint against it.

| Variable | Always? |
|---|---|
| `MANIFEST_ENV`, `MANIFEST_APP_URL`, `MANIFEST_PROJECT_SLUG`, `PORT`, `SESSION_SECRET` | yes |
| `MONGODB_URI`, `MONGODB_DB_NAME` | when you declare a `mongo` service |
| `SAML_ENVIRONMENT`, `SAML_ISSUER`, `SAML_CALLBACK_URL`, `SAML_ENTRY_POINT`, `SAML_LOGOUT_URL`, `SAML_IDP_METADATA_URL`, `SAML_IDP_CERT_PATH` | when `auth.provider: cwl` |
| `SAML_PRIVATE_KEY_PATH` | `cwl`, in staging and production only |

**`PORT` is the platform's, not yours.** Listen on it. An app that hardcodes 3000
is unreachable behind a 502 while its container reports healthy.

**`MONGODB_DB_NAME` is not optional either.** Do not fall back to a name of your
own: your credentials were minted for the database the platform named, and a
fallback writes to one they do not cover.

**These names are reserved.** Setting any of them in your own `env:` block is
refused at validation — the platform's binding is applied after yours, so the
variable would do nothing, and being told at deploy time is worse than being told
now.

---

## `manifest.yaml`, minimally

```yaml
manifest: 1
name: chem-labs
blueprint: node-ts-mongo@1
runtime:
  port: 3000
  health: /healthz
services:
  - { type: mongo, version: '7', name: db }
auth:
  provider: cwl
  callback: /auth/ubcshib/callback
  attributes: [ubcEduCwlPuid, mail, givenName, sn]
env:
  - { name: COURSE_CODE, value: CHEM_121 }
```

`services` is not optional for this blueprint: `node-ts-mongo@1` binds a Mongo
database, and an app that declares none fails its first boot with a message
saying so.

**`ai:` is not available on this blueprint yet.** `provides.ai` is `false`, so a
spec declaring `ai.models` is refused at validation with a message naming the
blueprint. That is deliberate — the platform has no model access to give you
until it does, and an application that starts without a key is a support ticket
rather than an error.

---

## The health endpoint is load-bearing

`runtime.health` (`/healthz` by default) is probed by the container's own health
check and by the deploy's readiness gate through the edge. It must answer

- **before any login** — an app that only answers an authenticated request never
  becomes healthy, and the deploy fails;
- **and honestly** — the skeleton pings Mongo, because "the process is up"
  reports healthy for an app that cannot serve a request.

Keep both properties if you change it.
