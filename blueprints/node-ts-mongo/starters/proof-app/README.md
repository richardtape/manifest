# The Manifest proof application

**What it proves:** a real person signs in with CWL, writes a note, and reads
back their own notes — a second person signing in to the *same deployment*
cannot see the first person's note — and a question either of them asks is
answered **from their own notes**, by a model the platform gave this app a key
for, and charged to **that person**.

`make demo-identity` proves the first two: steps 6 and 7 prove a login happened,
and **only step 8 proves the application knows who.** `make demo-ai` proves the
third.

It is generated from `node-ts-mongo@1` the way a faculty member's agent
generates one: the blueprint supplies `auth/`, `ai/`, `package.json` and
`package-lock.json` — §20 calls a blueprint a *security multiplier*, so its auth
and AI components are written once and inherited — and this directory supplies
`server.js`, `manifest.yaml` and `public/`. **There is deliberately no copy of
`auth/` or `ai/` here**, and since P4b Task 16 **no copy of the end-user
identifier** either: `server.js` imports `endUserId` from the blueprint. A forked
copy drifts from the blueprint's silently, and a vulnerability fixed in one
would live on in the other.

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
| `ubcEduCwlPuid` | The only identifier UBC guarantees is stable. A CWL login name can be changed and an email address is not unique over time, so this is what a note is keyed on — via a hash, never stored raw — and what a question is charged to, via the same hash. Without it the app cannot tell two people apart, which is the whole acceptance. | yes |
| `mail` | The address the course tool would write to when a marker leaves feedback. Requested now because a notification path needs it and adding an attribute later is a re-registration, not a redeploy. | yes |
| `eduPersonAffiliation` | Distinguishes `student` from `faculty`. **It is displayed and not acted on** — authorization is Manifest's to decide (§9: the IdP authenticates, it does not authorize), and an attribute nothing may act on is one that eventually gets acted on. It is here because a course tool's next feature is an instructor view, and that is the sentence the registration request needs. | yes |
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
order, computed by the blueprint's `ai/end-user.js`. **The database holds no UBC
identifier**, so what this application stores does not identify a person on its
own. That sentence is what its PIA will say.

`data.classification: internal` and `retention_days: 365` are the app's own
declaration, and P6's `LaunchReadiness` is what will hold it to them.

## The AI half — what reaches a model, and who pays

`POST /api/ask` takes a question from a signed-in person and does three things:

1. **Reads that person's own notes** — the newest 20, through the same `{ owner }`
   filter as `GET /api/notes`. **A model is never handed anything the asker could
   not already read.** `make demo-ai` writes the instructor a note that is a
   *closer* match for the student's question than the student's own, and fails
   if the student's question is ever given it.
2. **Embeds the question beside those notes** with `default-embed`, in one call, and
   picks the most similar note as context.
3. **Streams an answer** from `default-chat` to the question plus that one note.

So what reaches the AI gateway is **the question and at most one note the asker
wrote**, and nothing about anyone else. LiteLLM is configured not to keep prompts
(`store_prompts_in_spend_logs: false`, §7); it keeps a spend row per request.

**Both models are declared, and both are used.** The platform mints this app a key
confined to exactly those two models and three routes (§10), and D17 approves
both to `internal` — so a `confidential` declaration refuses them at validation,
not at the first question.

**Every request is charged to the person who asked**, as
`sha256(puid ‖ project ‖ environment)` — the answer *and* the embedding. LiteLLM
keys a person's budget on that string **across every application**, so a bare
hash of the PUID would let a student who exhausted one course tool's allowance be
refused by every other Manifest application; the namespace is what prevents it.
`make demo-ai` reads LiteLLM's own spend log and fails on a row charged to a bare
PUID hash or a raw PUID.

**The budget.** `ai.budget.project_monthly_usd: 10` binds: it is the app's LiteLLM
user's monthly ceiling. `per_user_monthly_usd: 1` is declared and **validated, not
enforced**, in Phase 1 (§10) — LiteLLM 1.98.0 cannot apply one without registering
each person in advance, which only the app could do.

**When the gateway fails**, the app answers with a sentence and a code —
`AI_BACKEND_UNAVAILABLE`, `AI_ACCESS_REFUSED`, `AI_BUDGET_EXCEEDED`,
`AI_UNAVAILABLE` or `AI_EMPTY_ANSWER` — never a stack trace and never the gateway's
own text, which for a refused key carries the key's hash.

**It needs its AI half to start.** `server.js` calls `configureAi()`
unconditionally, so a deploy without `ai.models` fails its first boot and §14's
Incident names the fix.

## Running it

```bash
make demo-identity        # sign-in and notes, by curl, against the real IdP
make demo-ai              # a question, answered and charged, through the real gateway
```

Both require the control plane running — see *Running the control plane* in the
repository README.
