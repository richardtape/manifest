# Manifest

Manifest is a self-hosted internal developer platform for UBC. A faculty member describes an application in plain
language, an AI agent builds it, and Manifest deploys it — authenticated with CWL, UBC's single sign-on, and running
on UBC infrastructure — without the faculty member ever encountering a container, a template or a terminal.

This repository is the **deployment control plane**: the system that owns projects, source, builds, releases,
approvals, running instances, backing services, routing, secrets, identity and AI credentials. The faculty-facing
front-end is a separate project; what lives here is the platform it consumes, plus a reference console that proves
the API can carry the whole journey.

## How it works

- **An app is described by one file.** Each project carries a `manifest.yaml`: the services it needs, the CWL
  attributes it asks for, the hosts it may reach, the models it may use and the class of data it holds. Manifest
  validates it, and everything the platform does to the app follows from it.
- **Build, release, deploy.** Manifest builds the app from a blueprint — a pluggable template of base image,
  Dockerfile and starter code — releases an exact image digest, and deploys it to staging and then production behind
  its own edge proxy. Each environment has its own database, network and outbound allowlist.
- **Identity is real, not mocked.** Every app is a SAML service provider that signs people in with CWL. Manifest
  registers it and injects its credentials, so the app knows who is using it.
- **AI access is brokered.** Apps reach language models through a gateway with per-app keys and budgets, and a model
  is available to an app only if it is cleared for the app's class of data.
- **Production is gated.** A first launch needs UBC's IAM registration and a privacy assessment on record, a
  rehearsal on the production hostname, and an administrator's approval of the exact image. Later releases are
  self-serve unless they change something sensitive, when an administrator approves them again.
- **Bring your own agent.** Everything the console does is a public, versioned API, so someone's own coding agent
  can drive the same path — with delegated tokens that can never take the actions reserved for a person.

## The three things that shape every decision

- **Laptop-first, and reproducibly so.** The entire platform runs on one developer
  machine, offline after a one-time seeding step. Not a demo mode — the real thing.
- **It is a containment system that happens to deploy.** Manifest's primary security
  function is to limit the blast radius of code nobody reviewed. Where "deployment
  platform" and "containment system" disagree, containment wins.
- **Every production app needs its own UBC IAM registration and privacy assessment.**
  Non-negotiable, human, multi-week. The platform's job is to *drive* those processes,
  not to wait on them.

## Where to go next

| If you want to… | Read |
|---|---|
| Start here, with no prior context | [`docs/superpowers/ORIENTATION.md`](docs/superpowers/ORIENTATION.md) — the single entry point, and the next job |
| See it run, in a browser | [`docs/superpowers/WALKTHROUGH.md`](docs/superpowers/WALKTHROUGH.md) |
| Run and operate it, including starting the control plane | [`docs/superpowers/RUNBOOK.md`](docs/superpowers/RUNBOOK.md) |
| Read the design | [`docs/superpowers/specs/2026-08-29-manifest-platform-design.md`](docs/superpowers/specs/2026-08-29-manifest-platform-design.md) — approved; a change is proposed and approved, never edited in |
