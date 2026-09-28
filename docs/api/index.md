# Manifest’s API

Manifest’s API is how a person’s tools and an AI agent create, build, deploy and launch an application on Manifest — the same API the platform’s own console uses, and the only one. These pages are for two readers at once: a developer writing a client, and an AI agent driving the API on a person’s behalf. Start with *Getting started*; an agent starts with *For an AI agent*, and a team building a front-end — a site of its own where people describe apps — with *Building a front-end*.

## Two credentials, and the one rule

Every request carries exactly one credential:

- **A session** — a person signed in with CWL in a browser, on the console’s origin or a front-end’s. It can do everything that person may do, and the most privileged actions ask them to sign in again first (step-up).
- **A delegated token** — minted by a person for one project, holding a list of capabilities, with an expiry, and revocable at any time. It is what an agent, a script or CI uses. It can run the whole build loop inside its project: read the code, change it, build, release, and deploy to sandbox and staging.

**The one rule an agent must never try to get around: a privileged action waits for a person.** Deploying to production, reading a secret, changing a quota and managing members are never done by a token. A token that asks is answered `403 TOKEN_ACTION_PENDING` with a question a person confirms or rejects in their own session; approving a release and recording UBC’s IAM and privacy decisions are a person’s alone, and a token is refused them outright. *Authentication* explains both.

## The pages

| Page | What it is for |
|---|---|
| [Getting started](getting-started.md) | From nothing to a deployed app, by the shortest correct path. |
| [Authentication](authentication.md) | Sessions, delegated tokens, step-up, and trusting the laptop’s certificate authority. |
| [Conventions](conventions.md) | Versioning, `Idempotency-Key`, the error envelope, `202` and the stream, paging and limits. |
| [The journey](journey.md) | Every step from an idea to a launched app, and the operations that serve each. |
| [Authoring](authoring.md) | Reading and changing an app’s code: trees, files, history, commits and the dry run. |
| [Secrets](secrets.md) | Declaring an app’s secrets and setting their values, per environment. |
| [Events](events.md) | The project’s event stream, and every event type. |
| [Launching](launching.md) | The first production launch and every release after it. |
| [For an AI agent](agents.md) | The loop, the rules, your model key, reading what your app printed, and what an agent may never do. |
| [Building a front-end](frontend.md) | A site beside the API: its origin and sign-in, the two credentials, an agent’s model, a running app’s output, images, a project’s name and people, and ending an app. |

**The reference is generated from the API’s own description**, so it cannot drift from it:

| Page | What it lists |
|---|---|
| [Operations](reference/operations.md) | Every operation: its method and path, parameters, examples and the errors it answers. |
| [Error codes](reference/errors.md) | Every code, what it means and what to do next. |
| [Event types](reference/events.md) | Every event the stream carries, with an example. |
| [manifest.yaml](reference/manifest-yaml.md) | The manifest an app declares itself in, field by field. |

The same pages are served by the API — `GET /v1/docs` lists them and `GET /v1/docs/{slug}` answers one — and the OpenAPI document itself is `GET /v1/openapi.json`. A person reads them in the console’s **Docs** screen, and the console’s **API reference** renders the OpenAPI document.
