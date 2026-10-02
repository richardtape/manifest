# Rich's decisions of 2026-09-30 — the planning session `manifest-00`

*Rich asked a planning session, beside the launch path plan's sitting 5 and the faculty front-end's F5 sitting 6, to look
ahead and settle his open decisions so later sittings would not stop for them. Each was put to him with its context, its
options and a recommendation, checked against the code first; each answer below is his, in his words, as he gave it. Where
they are recorded in the plans, the roadmap and ORIENTATION §8, this file is the source. Kept verbatim from the session's
record — its numbering is the order he answered in.*

# Rich's decisions — 2026-09-30, afternoon (session manifest-00, a planning session with Rich)

Each answer below is Rich's own, given in this session in reply to the context, options and
recommendation put to him. Recorded as he gave them.

0. Orphan app containers: manifest-d4's `remove-orphan-apps.sh` (42 named mf- containers, then
   dead-app-resources.sh --apply) — read by manifest-00, handed to Rich to run with `! bash`
   (d4's `docker rm` was refused by the classifier). Status: handed to Rich.

1. Spec action 3 (staging registration as a second kind of IamRegistration; owner's "I've sent it",
   launch:submit, person-only) — Rich: "(a) Apply as worded (Recommended)".

2. Spec action 4 (D19's package) — Rich first answered in his own words:
   "There's two pieces, really. In order to get IAM integration, the app needs a PIA. So we'll have
   some sort of PIA-writer helper. And then a separate tool to help collect everything needed by the
   IAM team (which includes the PIA number). So it's probably about right as worded, but we also need
   a separate PIA-helper tool if that isn't in the spec. We don't actually need to have the tool built
   but the process needs to exist in the app as app developed -> apply for PIA -> once a PIA is given
   -> provide info to IAM team -> once IAM approval and implementation -> we can now go on the staging
   environment -> once tested -> send production details to IAM team -> once received and implemented
   -> go live in production."
   Then, asked three follow-ups:
   - The order: "Gate each step (Recommended)" — staging IAM "sent" refused until the PIA is approved
     with its number; production IAM "sent" refused until the staging registration is active; "tested"
     stays the owner's judgement.
   - The PIA helper (Task 11, sitting 8): "Keep Task 11".
   - Spec action 4's words: "(a) + follow-ons + PIA no. (Recommended)" — the three drafted §9 edits;
     §2's asset row (l.77) -> "Its structure, not its code. It generates UBC-standard SP metadata as a
     downloadable package — exactly the artifact a UBC IAM registration request requires (§9). Manifest
     renders that structure with its own values and its own certificate; the tool is a web application,
     not a library, and not a dependency."; §9 Certificate lifecycle (l.752) "saml-metadata-generator
     issues certificates valid for one to five years." -> "Manifest issues each environment's SP
     certificate itself, once, at registration (D20), for a fixed term."; and §9's package list gains
     "the privacy assessment's reference (the PIA number), which UBC IAM asks for".

2b. Spec action 9 (NEW — drafted by manifest-00 from Rich's order) — Rich: "Apply as worded
    (Recommended)". Gates on the owner's "I've sent it" only; an administrator's record of UBC's
    answer is never refused for order. Four edits:
    1. §9 Staging l.699–702: "It is a third clock, beside the production registration and the privacy
       assessment (§13), and the first of the three to start." -> "It is **the second of three steps,
       in UBC's order** (§13): the privacy assessment, then this registration, then production's. **It
       is sent only once the privacy assessment is approved, and its package carries the assessment's
       reference** (the PIA number)." (rest of the paragraph unchanged)
    2. §9 Production, after the IamRegistration state sentence (and Spec action 3's addition):
       "**The production registration is sent only once the staging registration is `active`** — the
       app has signed people in at staging and its owner judges it tested. What UBC decides — a
       registration `active`, an assessment `approved` — is an administrator's record of UBC's answer,
       and is never refused for order."
    3. §9 PIA l.760: "A PIA is required per production app (C4)." -> "A PIA is required per production
       app (C4), and **it comes first**: UBC IAM asks for its reference, so neither of an app's
       registrations is sent until the assessment is approved."
    4. §13 l.1558–1563, everything after "…on the day they wanted to launch." -> "**They run in UBC's
       order, one after another**: the privacy assessment; then, for a CWL app, its staging
       registration with UBC's staging IdP (§9), which gates signing in at the staging address rather
       than going live; then, once staging is registered and the owner has tested it there, the
       production registration. All three are surfaced the moment a project is created, each saying
       what it waits on." (Spec action 3's §13 sentence follows it.)
    Code consequence (Task 9, sitting 6): submitIamRegistration gains two 409s (staging: PIA not
    approved with a reference; production: staging registration not active). Laptop demo: an
    administrator records staging active. App consequence: walkthrough moment 10 ("The three long
    clocks, started early") becomes a sequence — the app's design; tell manifest-app-f1.
    Shared pages to check: manifest-phases.html stage 2, manifest-schematic.html's launch checklist.

3. Spec action 5 (ApprovalRequest; owner, collaborator or token may ask on the staging candidate; note to
   administrators only) — Rich: "(a) Apply as worded (Recommended)".

4. ORIENTATION §8 Open, sitting 4's three:
   4a. F8, a provider's 422 answered 200 null — Rich: "(b) next plan; (a) meanwhile (Recommended)": a small
       task in the NEXT platform plan — measure whether a success hook in manifest_guard.py may raise (and
       whether drop_params:false is safe), then turn a null answer into the provider's 422; documented as a
       refusal until then.
   4b. LiteLLM's deployment-naming headers — Rich: "Strip two, before prod (Recommended)": a tracked
       hardening item — strip x-litellm-model-api-base and x-litellm-model-name where answers leave the
       platform (measure a LiteLLM setting first); KEEP x-litellm-attempted-fallbacks (the front-end reads
       it); before any production deployment.
   4c. The capable model's fallback after a provider's 401/403/404 — Rich: "Confirm (Recommended)": only
       400/413/422 go back to the client (MALFORMED_STATUSES, manifest_guard.py:76).

5. The next platform plan, and FE-29/31/32:
   - FE-29, FE-31, FE-32 — Rich: "Confirm all three (Recommended)", each option (a): FE-29 a refusal's facts as
     fields (error.limit {scope, period, resetsAt, amountUsd?}, error.session {id, name}); FE-31 listBlueprints
     lists only blueprints meant for people (fixtures to tests by a setting); FE-32 an operation that resolves a
     package-lock.json through the platform's mirror.
   - What follows the launch path — Rich: "(a) Faculty-ready → FE-32 → vuln DB (Recommended)": a ~3-sitting
     "before faculty use it for real" plan (FE-28 __Host- cookie, FE-30 request ids + a log line per refusal,
     FE-29 with it, FE-31, F8's 422 hook — decision 4a); then FE-32 as its own plan; then the vulnerability
     database in the console. (Replaces "FE-30 and FE-28 in a sitting of their own", 2026-09-29.)
   - When — Rich: "Now, in parallel (Recommended)": written now, reading only; its Task 1 re-measures.

6. A mail sink for the front-end's F6 — Rich: "(a) Mailpit in the platform now": Mailpit in infra/compose.yaml
   (SMTP and inbox on free ports, 7111/7112 proposed), pinned, pulled by make seed (the network once, at his
   yes), checked by make doctor — added as a small OUT-OF-PLAN change at a sitting boundary (as make
   refresh-vulndb was). The front-end's server sends real SMTP to it.

7. Merge the launch path's sittings 10 (Task 13, console + mock) and 11 (Task 14, guides) — Rich: "(a) Merge
   (Recommended)": one sitting; if Task 13 runs long, stop after it and give Task 14 its own sitting.
   lp-real-a (real GitHub repo, no project) — Rich: "I think the agent currently working on the platform intends
   to do this, check with them, and then if they are not intending to do that, then we should do it". (Asked
   manifest-d4.)
   lp-real-a: already deleted by manifest-d4 at Rich's yes (both repos; Manifest-local-dev reads 0 repositories).

8. Trim the per-sitting document load — Rich: "(a) Trim + single source (Recommended)": manifest-00 trims
   ORIENTATION §2's gate cells and spec-change paragraph and CLAUDE.md's State / spec-change chain to "the most
   recent, and where the list lives"; the gate numbers stated ONCE, in scripts/ci-acceptance.sh's EXPECT_ lines,
   the other three places pointing at it; done right after sitting 5's close commit, before 5b opens; the
   CLAUDE.md diff shown to Rich before it is committed.

9. F5 (the front-end's) — Rich: "Accept all; fix the address break (Recommended)": sitting 4's ten and sitting
   5's twelve overnight decisions accepted as made (words still at his click); the live address wraps only after
   :// and before a dot, never at a hyphen (display only; Copy unchanged). Real walk — Rich: "Yes, one repo
   (Recommended)": one real private repository in Manifest-local-dev for F5's acceptance walk after 5b, network
   on; he types the passwords.

10. The UBC external track — Rich: "We can defer this. I have to get all of this working first locally. And then
    show demos. I've already been given approval to work about it. The people who need to know about it at UBC
    know about it. This isn't a blocked in any way to our work." => stop raising it as urgent/outstanding in
    CLAUDE.md, ORIENTATION §2 and external-track.md; deferred until local + demos are done.

11. Older §8 items joining the next ("before faculty use it for real") plan — Rich chose all four: "§26 admin
    reason string, node:24-alpine base image, Init: true for app containers, IdP store's own credentials".
    The rest of §8 Open stays open as it is.
    The front-end's next plan — Rich: "Yes, F6 after F4a (Recommended)": F6 ("Running it", moments 16–20) is
    written after F4a, while the platform runs sittings 6–10.
    Execution — Rich: "Go as described (Recommended)": Rich runs remove-orphan-apps.sh; right after sitting 5's
    close commit (5b held ~40 min) manifest-00 trims the docs, single-sources the gate numbers, records every
    decision (plan, roadmap, ORIENTATION §8 Decided), adds Task 9's two ordering gates and the merged sitting 10
    to the launch path plan; during 5b manifest-00 applies Spec actions 3, 4, 5 and 9 to the spec and the four
    shared pages (staged by name); Mailpit at the boundary after 5b (Rich's yes for one image pull, network on);
    then manifest-00 writes the faculty-ready plan.

0 (done). Rich ran remove-orphan-apps.sh in his own tab (~16:30). Checked read-only by manifest-00: 0 mf- containers
   (was 42), 0 mf- volumes, Docker networks 26 -> 12, dead-app-resources.sh 0 dead; the four must-survive containers
   running; 4 orphan mirrors (f5-reading, lp-real-a, frontend-github, frontend-scratch-github) named, not removed.
   Told manifest-d4. Docker pool widening: not needed.

(Spec actions 3, 4, 5, 9 APPLIED by manifest-00 in 844605b, spec + four shared pages; two consequential phrases:
 §6 PrivacyAssessment gains external_ticket_ref (the PIA number); §19's PIA row also blocks sending an app's
 staging registration.)

12. From the two code surveys (for the faculty-ready plan):
   12a. FE-28 — Rich: "Package (Recommended)": __Host- names on https origins (the plain name kept only for
        loopback http); manifest_login and manifest_stepup also __Host- with Path=/ (closes login CSRF by cookie
        tossing); contract 1.6.0, a minor, with the break stated; clearing a __Host- cookie carries Secure.
   12b. FE-31 — Rich: "Filter the list (Recommended)": listed: false on fixture-node; listBlueprints hides it;
        it still resolves (demos and existing projects keep building).
   12c. Mailpit's spec row — Rich: "Always-on row (Recommended)": §21 "Ten long-running containers"; row
        "| Mailpit | 7111 (SMTP), 7112 (inbox) | The laptop's mail sink: the faculty front-end's server, and later
        the platform's own notices, send to it. Messages in memory only; no relay, so nothing leaves the laptop.
        On UBC infrastructure, UBC's SMTP relay takes its place. |"
   12d. manifest-phases.html "The UBC reviews start during stage 1" — Rich: "Reword (Recommended)": "The UBC
        reviews start once the platform can be demonstrated — the people at UBC who need to know about it
        already do."
   Settled by manifest-00 (routine, documented in the plan): F8's hook = a CustomLogger post-call hook in
   manifest_guard.py raising the provider's 422 (stream + 422 measured first, in a throwaway LiteLLM);
   node:24-alpine added beside node:22 (fake, stubs, scan test), blueprint stays @1, a tag-level doctor check,
   make seed at Rich's network yes; Init: true in hardening.ts (+ make demo-redeploy); IdP store: an ssp_store
   role owning its own schema (Rich adds SSP_STORE_PASSWORD to .env).
13. 13a. §26's administrator reason — Rich: "The design (Recommended)": a non-member platform admin using an
        owner's capability must give a reason; exempt: the admin's own duties (approve/reject, IAM/PIA records)
        and an admin who is a member; carried as a Manifest-Admin-Reason header enforced centrally
        (400 ADMIN_REASON_REQUIRED, in the idempotency fingerprint); asked once at a token's mint; audit.events
        gains actor_user_id, acted_as_admin, reason; the owner's stream shows it; deploy/build/validate name the
        actor; redacted, capped at 500; a spec action for §26's words (Rich reads them before that sitting); its
        own sitting, LAST in the plan.
   13b. LiteLLM leaks — Rich: "All four leaks (Recommended)": the tracked before-production item covers
        x-litellm-model-api-base, x-litellm-model-name, the response body's underlying model id (rewritten to the
        logical name) and the provider's raw llm_provider-* headers; the front-end told when it lands.

14. The faculty-ready plan (docs/superpowers/plans/2026-09-30-faculty-ready.md, b7a80b1) — Rich: "plan looks good.
    I'll decide on implementation strategy at the time. Probably not subagent driven though." => APPROVED, seven
    sittings; execution method chosen at its start (probably native); its four spec actions still to be read.

15. The API docs page (dist/api-docs/index.html) — Rich: "It feels like everything above that should be kept separate"
    ... "Is it not something you can do now? We don't need to hide the sidebar if all we have is the actual API docs
    (i.e. everything below 'The API reference'). We need to split it first. The API docs largely look good, they could
    do with converting into present tense. Is all the stuff above it just what's in the markdown files? If so, then
    we're doubling up on things unnecessarily."
    => DONE 348c2c8: pnpm docs:html renders the reference only; the guides stay Markdown (docs/api/, GET /v1/docs);
    docs-html.test.ts 5 -> 4 (control seen red: 2 of 4); RUNBOOK + WALKTHROUGH updated; ORIENTATION l.286/l.887 at the
    boundary; manifest-d4 told (test count -1).
    The present-tense pass over the 66 operation descriptions (79 spec refs; history, rationale, future) — Rich: "At the
    boundary after sitting 5 (Recommended)": 5b waits ~1.5-2 h; the front-end told first; plus a gate refusing a spec
    reference in any published description.
    Field/schema texts (~400 spec refs: schemas 349, error entries 55, tags 15, unversioned 7) — Rich: "Operations now,
    fields later (Recommended)": the boundary applies the 66 operation descriptions + the shared Idempotency-Key
    parameter and error-response texts, with a gate on operation descriptions; the fields are a later pass (tracked in
    the roadmap), when the gate widens to cover them.
    Applier's checklist (manifest-00): re-verify every fact the draft ADDED from the handlers (step-ups on addMember,
    removeMember, confirmPendingAction, production deploy; rejectPendingAction person-only; revokeToken's partial
    failure); restore every dropped "never a delegated token" / person-only rule (archiveProject's, at least); re-diff
    runRehearsal (5b changes it) and mintToken's PERSON_ONLY list (launch:submit later).

16. Rich, 2026-09-30 evening: "One of the things that we don't need to see in the API docs is things like section or plan
    numbers. They're irrelevant to the person reading the docs. … There's several edits in there alone. This needs to be
    looked at for all the docs. Later there will be a separate plan to remove all of this from code comments across the
    app and platform as this is also unecessary." Measured: ~101 spec refs left in openapi.json (schemas, fields, tags,
    errors, events), 187 in the generated reference pages (mostly the same text), 52 in the guides (events.md 48), and the
    info paragraph's "Generated…; do not edit" (a maintainer note). Placement — Rich: "In the merged sitting 10
    (Recommended)": the launch path's sitting 10 (Tasks 13+14) does the pass beside Task 14's guides rewrite, and widens
    api/contract/docs.test.ts's new test to ALL published text (the document and docs/api/*.md). Until then every sitting
    holds the rule by hand (5b told, and carries it into the plan's Global Constraints and §7e). CODE COMMENTS: a separate
    plan, later (Rich) — tracked in the roadmap at the next boundary.
    The order after 5b (Rich asked why "5a, then F4a"): the front-end's 7100 window (after 5b, whose shape its dry-run press
    is built on; before 5a, whose first Vitest truncates 7100) → 5a (may read and write code during the window, no Vitest)
    → F4a (needs Me.mayBuild, which 5a builds) in parallel with the platform's sitting 6. Mailpit moves to 5a's CLOSE
    (nothing needs it until F6).

# Rich's decisions — 2026-09-30, evening (session manifest-60, manifest-00's successor as the planning session)

Same rule: each answer is Rich's own, given in this session to the context, options and recommendation put to him.

17. Mailpit's image pull (the handoff's section 2; the network) — asked: may the session look up Mailpit's current
    release and pull `axllent/mailpit` at that tag (~30 MB), nothing else fetched; options "Yes, now", "Yes, after 5a
    closes", "No network today". Rich: "Yes, now (Recommended)".
    => DONE 2026-09-30 ~21:10: Docker Hub's tag list read; `axllent/mailpit:v1.31.3` pulled (released 2026-09-27; index
    digest sha256:ed9b00c609e77e99c79b93f1178255ebc271868920f2c69a8d166bd5634ed10d; arm64; 13.9 MB; Docker 29.7.2).
    compose.yaml is NOT edited until sitting 5a's close-out commit lands.

18. F4a, the faculty front-end's "only faculty build" (it reads sitting 5a's `Me.mayBuild`) — given by Rich in the
    front-end's session (manifest-app-4d), relayed to this one, and CONFIRMED HERE by Rich ("Yes, record it"). His words
    there: "yes I approve, you can start work on that when you know the other agent is finished."
    => F4a runs in the front-end's session (one agent, then a fresh reviewer for the whole branch), starting when
    manifest-74 says sitting 5a has closed; in parallel with the platform's sitting 6 (manifest-92). Its first three
    tasks touch only its own repository and its mock (7102); its last walks 7100 at Rich's word, in a window it asks
    the platform sitting for (no Vitest, no control-plane restart).
    Coordination settled by the planning session (not Rich's decision): sitting 6 starts after 5a's close-out AND
    after Mailpit lands — Mailpit's `make up`/`make verify` and a sitting's Vitest or Docker tier would break each
    other's results; manifest-92 agreed.

    Mailpit (decisions 6, 12c and 17) — LANDED 2026-09-30 22:50, `8155bcf` (manifest-60), after sitting 5a's close-out
    (`003adf7`). Beyond the handoff's brief, three settings, each measured against v1.31.3 with every DNS query captured:
    MP_SMTP_DISABLE_RDNS (otherwise a reverse-DNS query per SMTP connection), /tmp on tmpfs (otherwise messages sit in a
    SQLite file on the VM's disk, not "in memory only" as §21 says), MP_ALLOWED_HOSTS (otherwise the password-less inbox
    answers any Host header). make doctor 21/0/0, make verify 64/0/0 (EXPECT_ lines moved); the three new checks watched
    red with their causes named (Mailpit stopped; a relay and no tmpfs; an unpulled digest), then restored. The control
    plane was not restarted. The front-end (manifest-app-4d) and sitting 6 (manifest-92) told.

# Rich's decisions — 2026-10-01, morning (the launch path plan's sitting 7, session manifest-8e)

    FE-45 — "Yes, confirmed." (Rich, to manifest-8e, 2026-10-01), confirming the decision the faculty front-end's session
    manifest-app-34 relayed from his words in its F6 design: "We can't allow folks to delete apps that have been actively
    used. i.e. production databases can't be deleted. We'll need some way to 'mark as deleted' which removes it from all
    paths, but we can't delete the data. That can only be an admin decision (due to data retention)" — recorded "so it
    gets built in the future". Not urgent; no current plan's. The front-end's two options and what it needs next are in
    ORIENTATION §8 Open (FE-45); its full text is manifest-app's docs/api-findings.md, FE-45.

    Sitting 7's fix-wave contract change (409 LAUNCH_DRAFT_STALE; draftGeneratedAt and 409 LAUNCH_DRAFT_CHANGED) — made
    by the sitting as a routine call and told to Rich after: "OK, the front-end agent will need to know that". The
    front-end (manifest-app-34) had it before the commit, and holds it for its F5b.

# Rich's decisions — 2026-10-01, late morning (the launch path plan's sitting 8, session manifest-8d)

    change_requested — "(a) Record the origin (Recommended)" (Rich, to manifest-8d, 2026-10-01, answering the question
    sitting 8 put at its close, with each option's code beside it). One state keeps its two meanings, and the row RECORDS
    which: a nullable iam_registrations.change_requested_from ('submitted' | 'active'), set by recordIamRegistration when
    a record ENTERS change_requested and cleared when it leaves. Task 12's queue reads it: from 'active' (an administrator
    filed a change request with UBC) is an iam-change-request item waiting on UBC since submitted_at; from 'submitted'
    (UBC came back with questions) is UBC waiting on the OWNER — not an administrator's item. Additive; no enum change.
    Rejected: (b) split the state (an enum change the front-end, mock and console must all handle); (c) leave it (the
    queue would misreport UBC-asked-the-owner as waiting on UBC). The options as asked are ORIENTATION §8's Decided line
    and Task 12's [S6] block. §6's IamRegistration row lists its fields, so the column is a spec action (§6) — drafted at
    the same close; see the plan's Spec actions.

    Spec action 10 — "(a) Apply as worded (Recommended)" (Rich, to manifest-8d, 2026-10-01, minutes later): §6's
    IamRegistration row gains change_requested_from (submitted | active — while change_requested: whether UBC asked the
    owner for changes, or an administrator filed a change request with UBC; null otherwise), after state. APPLIED by
    manifest-8d the same morning; no shared page lists IamRegistration's fields (checked). Built by Task 12.

# Rich's decisions — 2026-10-01, evening (the launch path plan's sitting 9, session manifest-6d)

    FE-46, FE-47 and FE-5, option (a) each — "i approved" (Rich, to manifest-6d, 2026-10-01 19:56 PDT / 02:56Z,
    answering the question put to him in this session: "reply here with something like 'confirm FE-46, FE-47 and FE-5
    (a)'"). It confirms the three as the faculty front-end's design session manifest-app-d9 relayed them at sitting 9's
    close ("carried at Rich's word"), and as it relayed his confirmation at ~21:00Z ("confirm FE-46, FE-47 and FE-5 to
    the platform session"):
      - FE-46 (a): the owner's send goes to LTIC, a state of its own between draft and submitted, for all three records;
        an administrator records LTIC's submission to PRISM or UBC IAM with UBC's reference; `since` dates each step;
        listQueue lists what LTIC holds; the platform emails LTIC when a record is sent to it AND when approval.requested
        is published (never the note); the assessment's gaps get stable ids and the send carries the owner's answers,
        kept on the record.
      - FE-47 (a): from `active`, the owner (person-only) asks for a change to the live registration — the new
        attributes, with a package drafted from the newest valid manifest — sent to LTIC as FE-46's sends are; LTIC files
        it with UBC (change_requested from active), with FE-46's since, queue and email. The build's check stays as it is.
      - FE-5 (a): a PendingAction carries the specific object, taken from the request and never a secret — a member:
        who and what role; a deploy: which release and which environment; a launch record: which one.
    Each needs a spec action before it is a task (the records' states in §6 and §9, §13's waits, §26's queue, an email
    the platform sends; D24's pending-action payload) — drafted by the planning session, decided by Rich — and a place
    in the plan order. Full texts: manifest-app's docs/api-findings.md, FE-46, FE-47, FE-5; ORIENTATION §8 Open.
