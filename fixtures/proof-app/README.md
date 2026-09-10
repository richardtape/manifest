# The Manifest proof application

**What it proves:** a real person signs in with CWL, writes a note, and reads
back their own notes — and a second person signing in to the *same deployment*
cannot see the first person's note. Steps 6 and 7 of `make demo-identity` prove
a login happened. **Only step 8 proves the application knows who.**

It is generated from `node-ts-mongo@1` the way a faculty member's agent
generates one: the blueprint supplies `auth/`, `package.json` and
`package-lock.json` — §20 calls a blueprint a *security multiplier*, so its auth
component is written once and inherited — and this directory supplies
`server.js`, `identity.js`, `manifest.yaml` and `public/`. **There is
deliberately no copy of `auth/` here.** A forked copy of the SAML wiring drifts
from the blueprint's silently, and a vulnerability fixed in one would live on in
the other.

`fixtures/fixture-app/` is a different thing and stays trivial: it is P3's build
target, and it declares no sign-on at all.

---

## The attributes, and why each one

This section is the point of the file. §9 says UBC IAM asks an applicant to
justify every attribute it requests, and that **a faculty member cannot write
that unaided** — so the platform writes it, from `manifest.yaml`, and this is
the shape P8's registration package carries.

`ubcEduCwlPuid`, `mail` and `eduPersonAffiliation` are **pre-authorized** by UBC
IAM. The other two need a justification, and these are theirs.

| Attribute | Why this application needs it | Pre-authorized |
|---|---|---|
| `ubcEduCwlPuid` | The only identifier UBC guarantees is stable. A CWL login name can be changed and an email address is not unique over time, so this is what a note is keyed on — via a hash, never stored raw. Without it the app cannot tell two people apart, which is the whole acceptance. | yes |
| `mail` | The address the course tool would write to when a marker leaves feedback. Requested now because P4b's notification path needs it and adding an attribute later is a re-registration, not a redeploy. | yes |
| `eduPersonAffiliation` | Distinguishes `student` from `faculty`. **It is displayed and not acted on** in P4a — authorization is Manifest's to decide (§9: the IdP authenticates, it does not authorize), and an attribute nothing may act on is one that eventually gets acted on. It is here because a course tool's next feature is an instructor view, and that is the sentence the registration request needs. | yes |
| `givenName` | The application greets people by name. A course tool that addresses a student as `stu000001` is one students do not use. | **no — this is the justification** |
| `sn` | The same sentence: a display name is a given name and a surname, and requesting one without the other produces a half-formed greeting. | **no — this is the justification** |

**Shortening this list is not a documentation change.** §9 enforces release *at
the IdP* against the Service Provider row the platform derives from it, so an
attribute removed here is not sent at all — the app sees a missing key rather
than an empty one. `make demo-identity`'s negative control (c) does exactly
that, and the app then renders no display name while everything else still
works. That is the platform's attribute-release control, visible from outside.

## What it stores, and what it does not

A note is one document: `{ owner, text, createdAt }`.

`owner` is `sha256(puid ‖ project ‖ environment)` — space-separated, in that
order, computed in `identity.js`. **The database holds no UBC identifier**, so
what this application stores does not identify a person on its own. That
sentence is what its PIA will say.

The namespace is load-bearing beyond privacy. S3 measured that LiteLLM keys an
end-user budget on this string **globally** rather than per API key, so a bare
hash of the PUID would let a student who exhausts one course tool's AI
allowance be refused by every other Manifest application. Nothing reads it as a
budget key until P4b; it is computed correctly now so P4b passes it through
rather than migrating what the app has already stored about people.

`data.classification: internal` and `retention_days: 365` are the app's own
declaration, and P6's `LaunchReadiness` is what will hold it to them.

## The AI half is P4b's

`GET /api/ai` answers **501** and says so. `node-ts-mongo@1` declares
`provides.ai: false` (Decision 12) and `renderInjection` refuses a spec that
declares `ai.models`, so this app cannot be handed an LLM key until both change
in the same commit. The route returns the end-user identifier it *would* use,
which is the part that has to be right before the rest exists.

## Running it

```bash
make demo-identity        # the whole thing, by curl, against the real IdP
```

Requires the control plane running — see *Running the control plane* in the
repository README.
